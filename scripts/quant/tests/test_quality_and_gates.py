"""The quality engine flags problems without touching data; gates never fake a PASS."""
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec import gates as gates_module
from quant.sec import quality as quality_module
from quant.sec.model import CompanyProfile, NormalizedFact, Provenance, SOURCE_DERIVED
from quant.sec.normalize import normalize_company
from quant.sec.periods import PeriodResolver
from quant.sec.provider import SECProvider
from quant.sec.registry import MetricRegistry
from quant.sec.restatements import CompanyFactBook
from quant.tests.fixtures import FactsBuilder, build_year_ends, standard_company


class _NullClient:
    def get_json(self, url, use_cache=True):  # pragma: no cover
        raise AssertionError("no network in tests")


def raw_facts(builder):
    return list(SECProvider(client=_NullClient()).iter_raw_facts(builder.company_facts()))


def codes(findings):
    return {finding["code"] for finding in findings}


class RawQualityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()

    def test_a_period_ending_after_its_filing_date_is_a_leak(self):
        builder = FactsBuilder(5000000001)
        builder.add("us-gaap", "Revenues", "USD", 100.0, "2024-12-31", "2024-01-01",
                    "acc-1", "10-K", "2024-06-01", fy=2024, fp="FY")
        findings = quality_module.check_raw_facts(raw_facts(builder), self.registry)
        self.assertIn("FUTURE_DATA_LEAK", codes(findings))

    def test_an_end_before_its_start_is_an_impossible_period(self):
        builder = FactsBuilder(5000000002)
        builder.add("us-gaap", "Revenues", "USD", 100.0, "2023-01-01", "2023-12-31",
                    "acc-1", "10-K", "2024-02-20", fy=2023, fp="FY")
        findings = quality_module.check_raw_facts(raw_facts(builder), self.registry)
        self.assertIn("IMPOSSIBLE_PERIOD", codes(findings))

    def test_an_identical_fact_reported_twice_is_flagged(self):
        builder = FactsBuilder(5000000003)
        for _ in range(2):
            builder.add("us-gaap", "Revenues", "USD", 100.0, "2023-12-31", "2023-01-01",
                        "acc-1", "10-K", "2024-02-20", fy=2023, fp="FY")
        findings = quality_module.check_raw_facts(raw_facts(builder), self.registry)
        self.assertIn("DUPLICATE_FACT", codes(findings))

    def test_an_unmapped_concept_is_reported_as_information(self):
        builder = FactsBuilder(5000000004)
        builder.add("us-gaap", "SomethingUnmapped", "USD", 1.0, "2023-12-31",
                    "2023-01-01", "acc-1", "10-K", "2024-02-20", fy=2023, fp="FY")
        findings = quality_module.check_raw_facts(raw_facts(builder), self.registry)
        unknown = [f for f in findings if f["code"] == "UNKNOWN_CONCEPT"]
        self.assertEqual(unknown[0]["severity"], quality_module.SEVERITY_INFO)

    def test_a_clean_fixture_produces_no_errors(self):
        fy_ends = build_year_ends(date(2019, 12, 31), 5)
        builder, _ = standard_company(5000000005, fy_ends, lambda year: 1000.0)
        findings = quality_module.check_raw_facts(raw_facts(builder), self.registry)
        errors = [f for f in findings if f["severity"] == quality_module.SEVERITY_ERROR]
        self.assertEqual(errors, [])


class NormalizedQualityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()

    def _factbook(self, builder):
        facts = raw_facts(builder)
        return normalize_company("0005000000", facts, self.registry,
                                 filing_metadata=builder.filings), facts

    def test_a_negative_revenue_is_flagged(self):
        builder = FactsBuilder(5000000010)
        for year in (2022, 2023):
            builder.add("us-gaap", "Revenues", "USD", -100.0 if year == 2023 else 100.0,
                        f"{year}-12-31", f"{year}-01-01", f"acc-{year}", "10-K",
                        f"{year + 1}-02-20", fy=year, fp="FY")
        result, facts = self._factbook(builder)
        findings = quality_module.check_factbook(result.factbook, self.registry)
        self.assertIn("NEGATIVE_WHERE_IMPOSSIBLE", codes(findings))

    def test_an_absurd_value_is_flagged_as_extreme(self):
        builder = FactsBuilder(5000000011)
        for year in (2022, 2023):
            builder.add("us-gaap", "Revenues", "USD", 9e14 if year == 2023 else 100.0,
                        f"{year}-12-31", f"{year}-01-01", f"acc-{year}", "10-K",
                        f"{year + 1}-02-20", fy=year, fp="FY")
        result, _ = self._factbook(builder)
        findings = quality_module.check_factbook(result.factbook, self.registry)
        self.assertIn("EXTREME_VALUE", codes(findings))

    def test_a_material_restatement_is_reported_and_both_values_kept(self):
        builder = FactsBuilder(5000000012)
        builder.add("us-gaap", "Revenues", "USD", 1000.0, "2022-12-31", "2022-01-01",
                    "acc-a", "10-K", "2023-02-20", fy=2022, fp="FY")
        builder.add("us-gaap", "Revenues", "USD", 1400.0, "2022-12-31", "2022-01-01",
                    "acc-b", "10-K/A", "2024-08-10", fy=2023, fp="FY")
        builder.add("us-gaap", "Revenues", "USD", 1100.0, "2023-12-31", "2023-01-01",
                    "acc-b", "10-K/A", "2024-08-10", fy=2023, fp="FY")
        result, _ = self._factbook(builder)
        findings = quality_module.check_factbook(result.factbook, self.registry)
        self.assertIn("RESTATEMENT_CONFLICT", codes(findings))
        self.assertEqual(len(result.factbook.get("revenue", 2022, "FY")), 2)

    def test_conflicting_values_available_at_the_same_instant_are_reported(self):
        builder = FactsBuilder(5000000013)
        for year in (2022, 2023):
            builder.add("us-gaap", "Revenues", "USD", 1000.0, f"{year}-12-31",
                        f"{year}-01-01", "acc-a", "10-K", f"{year + 1}-02-20",
                        fy=year, fp="FY")
        builder.add("us-gaap", "SalesRevenueNet", "USD", 1500.0, "2023-12-31",
                    "2023-01-01", "acc-b", "10-K", "2024-02-20", fy=2023, fp="FY")
        result, _ = self._factbook(builder)
        findings = quality_module.check_factbook(result.factbook, self.registry)
        self.assertIn("CONFLICTING_FACTS", codes(findings))

    def test_the_quality_engine_never_changes_a_value(self):
        builder = FactsBuilder(5000000014)
        for year in (2022, 2023):
            builder.add("us-gaap", "Revenues", "USD", -50.0, f"{year}-12-31",
                        f"{year}-01-01", f"acc-{year}", "10-K", f"{year + 1}-02-20",
                        fy=year, fp="FY")
        result, facts = self._factbook(builder)
        before = [obs.value for obs in result.factbook.get("revenue", 2023, "FY").observations]
        quality_module.run_all(facts, result.factbook, self.registry, result.issues)
        after = [obs.value for obs in result.factbook.get("revenue", 2023, "FY").observations]
        self.assertEqual(before, after)
        self.assertEqual(after, [-50.0])

    def test_the_summary_counts_by_code_and_severity(self):
        builder = FactsBuilder(5000000015)
        builder.add("us-gaap", "Revenues", "USD", 100.0, "2024-12-31", "2024-01-01",
                    "acc-1", "10-K", "2024-06-01", fy=2024, fp="FY")
        result, facts = self._factbook(builder)
        _, summary = quality_module.run_all(facts, result.factbook, self.registry,
                                            result.issues)
        self.assertGreater(summary["total"], 0)
        self.assertIn("FUTURE_DATA_LEAK", summary["by_code"])
        self.assertEqual(summary["rules_version"], quality_module.QUALITY_RULES_VERSION)


class GateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()
        fy_ends = build_year_ends(date(2017, 12, 31), 9)
        builder, _ = standard_company(5100000001, fy_ends, lambda year: 1000.0 * (year - 2016))
        facts = raw_facts(builder)
        cls.profile = CompanyProfile(cik="5100000001", name="SYNTHETIC", sic="3674",
                                     tickers=["SYN"])
        cls.result = normalize_company("5100000001", facts, cls.registry,
                                       profile=cls.profile,
                                       filing_metadata=builder.filings)
        cls.resolver = PeriodResolver(cls.result.factbook, cls.registry)
        cls.provider = SECProvider(client=_NullClient())

    def test_market_data_is_not_applicable_rather_than_failed(self):
        self.assertEqual(gates_module.gate_market_data(self.provider)["status"],
                         gates_module.NOT_APPLICABLE)

    def test_real_data_passes_the_leak_and_provenance_gates(self):
        for result in (gates_module.gate_no_future_data_leak(self.result.factbook),
                       gates_module.gate_provenance_complete(self.result.factbook),
                       gates_module.gate_period_integrity(self.result.factbook),
                       gates_module.gate_unit_integrity(self.result.factbook, self.registry)):
            with self.subTest(gate=result["gate"]):
                self.assertEqual(result["status"], gates_module.PASS, result["reason"])

    def test_a_leaking_observation_fails_the_gate(self):
        book = CompanyFactBook("0000000001")
        from quant.tests.test_restatements import observation
        book.add_observation("revenue", 2018, "Q1",
                             observation(1.0, "2018-01-01", period_end="2018-03-31"))
        result = gates_module.gate_no_future_data_leak(book)
        self.assertEqual(result["status"], gates_module.FAIL)

    def test_an_empty_factbook_is_unknown_not_pass(self):
        result = gates_module.gate_no_future_data_leak(CompanyFactBook("0000000001"))
        self.assertEqual(result["status"], gates_module.UNKNOWN)

    def test_missing_inputs_produce_unknown_not_pass(self):
        results = gates_module.run_suite(provider=self.provider)
        statuses = {row["gate"]: row["status"] for row in results}
        self.assertEqual(statuses["PIT_NO_FUTURE_DATA_LEAK"], gates_module.UNKNOWN)
        self.assertEqual(statuses["NO_INVENTED_VALUES"], gates_module.UNKNOWN)

    def test_the_survivorship_failure_is_preserved_honestly(self):
        result = gates_module.gate_survivorship_universe(self.provider)
        self.assertEqual(result["status"], gates_module.FAIL)
        self.assertIn("security master", result["reason"])

    def test_capabilities_come_from_the_shared_provider_profile(self):
        """No second capability matrix: the declaration is the shared JSON."""
        declared = self.provider.DECLARED_CAPABILITIES
        self.assertIs(declared["marketDataOhlcv"], False)
        self.assertIs(declared["survivorshipBiasControls"], False)
        # "not verified" must survive as None, never collapse to False.
        self.assertIsNone(declared["delistedSecurities"])
        self.assertIsNone(declared["historicalCoverage"])

    def test_provider_gate_results_are_carried_through_unchanged(self):
        """Gate A/B/C come from gate-tests.js; this module never rewrites them."""
        incoming = [{"gate": "GATE_B_DELISTED", "status": gates_module.FAIL,
                     "reason": "from gate-tests.js", "evidence": {}}]
        results = gates_module.run_suite(provider=self.provider,
                                         provider_gate_results=incoming)
        carried = [row for row in results if row["gate"] == "GATE_B_DELISTED"]
        self.assertEqual(carried, incoming)

    def test_no_invented_values_gate_catches_a_zero_stand_in(self):
        bad = NormalizedFact(cik="1", metric="revenue", value=0.0, unit="USD",
                             fiscal_year=2020, fiscal_period="FY", period_start=None,
                             period_end=None, available=False, reason="MISSING_XBRL_CONCEPT")
        self.assertEqual(gates_module.gate_no_invented_values([bad])["status"],
                         gates_module.FAIL)

    def test_derived_separation_gate_catches_a_mislabelled_metric(self):
        fake = NormalizedFact(cik="1", metric="roe", value=0.1, unit="ratio",
                              fiscal_year=2020, fiscal_period="FY", period_start=None,
                              period_end=None,
                              provenance=Provenance(source="SEC_EDGAR_XBRL"))
        self.assertEqual(gates_module.gate_derived_separation({"roe": fake})["status"],
                         gates_module.FAIL)

    def test_a_full_suite_runs_and_summarises(self):
        from quant.sec.derived import reconstruct
        as_of = date(2026, 3, 1)
        derived = reconstruct(self.resolver, 2024, "FY", as_of)
        resolved = [self.resolver.annual(metric, 2024, as_of)
                    for metric in self.registry.names()]
        results = gates_module.run_suite(
            factbook=self.result.factbook, registry=self.registry,
            provider=self.provider, resolved_facts=resolved, derived_facts=derived)
        summary = gates_module.summarize(results)
        self.assertEqual(summary["total"], len(results))
        self.assertGreaterEqual(summary["by_status"][gates_module.PASS], 4)
        # The gate SEC genuinely cannot satisfy must stay failed.
        self.assertIn("SURVIVORSHIP_FREE_UNIVERSE", summary["blocking_failures"])


if __name__ == "__main__":
    unittest.main()
