import tempfile
import unittest

from quant.sec.alias_discovery import build_alias_discovery
from quant.sec.eligibility import (
    ADR, BANK, CLOSED_END_FUND, ETF, FOREIGN_ISSUER, INSURANCE,
    OPERATING_COMPANY, REIT, SPV, TRUST, UNKNOWN, classify_entity,
    build_classification_report, fundamentals_gate_sample,
)
from quant.sec.failures import EXCLUDED_FUND, IngestionFailure
from quant.sec.model import CompanyProfile
from quant.sec.pipeline import IngestionPipeline, STATUS_EXCLUDED
from quant.sec.registry import MetricRegistry
from quant.sec.store import CheckpointStore, JsonFactStore, JsonRawStore


def filing(form, filed="2026-02-01", accession="acc"):
    return {"form": form, "filing_date": filed, "accession": accession}


def profile(sic, name="Example Corp", entity_type="operating"):
    return CompanyProfile(
        cik="0000000001", name=name, sic=str(sic) if sic is not None else None,
        sic_description="Blank Checks" if str(sic) == "6770" else "Example",
        entity_type=entity_type,
    )


class EligibilityTests(unittest.TestCase):
    def test_classification_report_keeps_accounting_capability_visible(self):
        domestic = classify_entity(
            profile(entity_type="operating", sic="3571"),
            [filing("10-K")],
        ).to_dict()
        foreign = classify_entity(
            profile(entity_type="operating", sic="8880"),
            [filing("20-F")], taxonomies=("ifrs-full",),
        ).to_dict()
        report = build_classification_report([domestic, foreign])
        self.assertEqual(report["accountingStandardCoverage"]["US_GAAP"]
                         ["capabilities"]["SUPPORTED"], 1)
        self.assertEqual(report["accountingStandardCoverage"]["IFRS"]
                         ["capabilities"]["UNSUPPORTED"], 1)

    def test_operating_company_is_eligible(self):
        row = classify_entity(profile(3674), [filing("10-K")])
        self.assertEqual(OPERATING_COMPANY, row.entity_classification)
        self.assertIs(row.fundamentals_eligible, True)

    def test_sector_profiles_remain_eligible(self):
        cases = ((6021, BANK, "BANK"), (6331, INSURANCE, "INSURANCE"),
                 (6798, REIT, "REIT"))
        for sic, category, metric_profile in cases:
            with self.subTest(sic=sic):
                row = classify_entity(profile(sic), [filing("10-K")])
                self.assertEqual(category, row.entity_classification)
                self.assertEqual(metric_profile, row.metric_profile)
                self.assertIs(row.fundamentals_eligible, True)

    def test_bank_holding_company_sic_uses_the_bank_profile(self):
        entity = profile(6712)
        entity.sic_description = "Offices of Bank Holding Companies"
        row = classify_entity(entity, [filing("10-K")])
        self.assertEqual(BANK, row.entity_classification)
        self.assertEqual("BANK", row.metric_profile)

    def test_fund_trust_spv_and_adr_are_reproducible_exclusions(self):
        cases = (
            (profile(None, "Income Fund", "other"), [filing("N-2")], CLOSED_END_FUND),
            (profile(6221, "Physical Gold ETF"), [filing("10-K")], ETF),
            (profile(6221, "Digital Asset Trust"), [filing("10-K")], TRUST),
            (profile(6770, "Acquisition Corp"), [filing("10-Q")], SPV),
            (profile(8880, "Issuer /ADR", "other"), [filing("F-6EF")], ADR),
        )
        for entity_profile, filings, category in cases:
            with self.subTest(category=category):
                row = classify_entity(entity_profile, filings)
                self.assertEqual(category, row.entity_classification)
                self.assertIs(row.fundamentals_eligible, False)
                self.assertTrue(row.reason_codes)

    def test_foreign_issuer_is_visible_but_not_silently_enabled(self):
        row = classify_entity(profile(3510, "Foreign Issuer", "other"),
                              [filing("20-F")], taxonomies={"ifrs-full"})
        self.assertEqual(FOREIGN_ISSUER, row.entity_classification)
        self.assertEqual("IFRS", row.accounting_standard)
        self.assertEqual("UNSUPPORTED", row.accounting_capability)
        self.assertIs(row.fundamentals_eligible, False)

    def test_unknown_is_not_treated_as_operating(self):
        row = classify_entity(profile(7389, entity_type="other"), [filing("10-K")])
        self.assertEqual(UNKNOWN, row.entity_classification)
        self.assertIsNone(row.fundamentals_eligible)

    def test_gate_sample_contains_only_explicitly_eligible_companies(self):
        rows = [
            {"cik": "1", "classification": {"fundamentalsEligible": False}},
            {"cik": "2", "classification": {"fundamentalsEligible": True}},
            {"cik": "3", "classification": {"fundamentalsEligible": True}},
        ]
        sample = fundamentals_gate_sample(rows, 2)
        self.assertEqual(["2", "3"], [row["cik"] for row in sample["companies"]])


class ExclusionAccountingTests(unittest.TestCase):
    def test_expected_exclusion_is_not_failed_or_retried(self):
        class Provider:
            ADAPTER_VERSION = "test"
            client = type("Client", (), {"stats": {}})()

        class ExcludingPipeline(IngestionPipeline):
            def ingest_company(self, cik, force=False):
                raise IngestionFailure(EXCLUDED_FUND, "fund")

        with tempfile.TemporaryDirectory() as directory:
            pipeline = ExcludingPipeline(
                provider=Provider(), registry=MetricRegistry.load(),
                raw_store=JsonRawStore(f"{directory}/raw"),
                fact_store=JsonFactStore(f"{directory}/facts"),
                checkpoint=CheckpointStore(f"{directory}/state", "exclusion"),
            )
            result = pipeline.ingest_universe([{"cik": 1}])
            run = result["manifest"]["run"]
            self.assertEqual(STATUS_EXCLUDED, result["results"][0]["status"])
            self.assertEqual(1, run["expected_exclusions"])
            self.assertEqual(0, run["real_failures"])
            self.assertEqual(0.0, run["technical_failure_rate"])
            self.assertEqual([], result["state"]["retry_queue"])


class RegistryExpansionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()

    def test_required_balance_sheet_and_cash_flow_aliases_are_registered(self):
        expected = {
            ("us-gaap", "AssetsCurrent"): "current_assets",
            ("us-gaap", "LiabilitiesCurrent"): "current_liabilities",
            ("us-gaap", "Goodwill"): "goodwill",
            ("us-gaap", "InventoryNet"): "inventory",
            ("us-gaap", "AccountsReceivableNetCurrent"): "accounts_receivable",
            ("us-gaap", "NetCashProvidedByUsedInInvestingActivities"): "investing_cash_flow",
            ("us-gaap", "NetCashProvidedByUsedInFinancingActivities"): "financing_cash_flow",
            ("us-gaap", "PaymentsForRepurchaseOfCommonStock"): "share_repurchases",
        }
        for concept, metric in expected.items():
            with self.subTest(concept=concept):
                self.assertIn(metric, dict(self.registry.metrics_for_concept(*concept)))

    def test_alias_discovery_never_accepts_unknown_concepts(self):
        payload = {
            "cik": 1,
            "facts": {"us-gaap": {
                "AssetsCurrent": {"units": {"USD": [{
                    "form": "10-K", "end": "2025-12-31", "val": 1,
                }]}},
                "CustomAssetsMeasure": {"units": {"USD": [{
                    "form": "10-K", "end": "2025-12-31", "val": 2,
                }]}},
            }},
        }
        report = build_alias_discovery(
            [("1", payload), ("2", payload)], self.registry,
            target_metrics=("current_assets",), min_candidate_companies=2)
        metric = report["canonicalMetrics"]["current_assets"]
        self.assertEqual(2, metric["companies"])
        candidate = next(row for row in metric["mappingCandidates"]
                         if row["concept"].endswith("CustomAssetsMeasure"))
        self.assertEqual("MAPPING_CANDIDATE_NOT_ACCEPTED", candidate["status"])
        self.assertTrue(any(row["concept"].endswith("CustomAssetsMeasure")
                            for row in report["frequentUnknownConcepts"]))


if __name__ == "__main__":
    unittest.main()
