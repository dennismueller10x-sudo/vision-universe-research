"""Die Branchenschicht (§10): neben dem Kernvertrag, nie darin.

Eine Bank hat keinen Umsatz im Sinne von `revenue`, sie hat Zinsertraege.
Der Kernvertrag bleibt unveraendert; eine Branche bekommt eine EIGENE
Kennzahlschicht, die nur fuer Emittenten ihrer SIC-Spanne veroeffentlicht
wird. Diese Tests bauen die Schicht mit einer synthetischen Registry,
damit der Mechanismus unabhaengig vom gemessenen Vokabular geprueft ist.
"""
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.canonical import build_company_bundle, industry_metric_map
from quant.sec.pipeline import IngestionPipeline
from quant.sec.provider import SECProvider
from quant.sec.registry import DEFAULT_REGISTRY_PATH, MetricRegistry, RegistryError
from quant.sec.store import CheckpointStore, JsonFactStore, JsonRawStore
from quant.sec.universe_coverage import issuer_fundamentals
from quant.tests.fixtures import build_year_ends, standard_company
from quant.tests.test_pipeline_and_store import StubSEC

BANK_SIC, INDUSTRIAL_SIC = "6022", "3570"


def _payload_with_bank_layer():
    payload = json.loads(DEFAULT_REGISTRY_PATH.read_text(encoding="utf-8"))
    payload["industries"] = {
        "BANK": {"label": "Bank", "sic_ranges": [[6020, 6036]]},
    }
    payload["industry_metrics"] = {
        "net_interest_income": {
            "label": "Net interest income", "kind": "duration",
            "statement": "income_statement", "units": ["USD"],
            "industries": ["BANK"],
            "concepts": [{"taxonomy": "us-gaap", "concept": "InterestIncomeExpenseNet",
                          "priority": 10}],
        },
        "deposits": {
            "label": "Deposits", "kind": "instant", "statement": "balance_sheet",
            "units": ["USD"], "industries": ["BANK"],
            "concepts": [{"taxonomy": "us-gaap", "concept": "Deposits", "priority": 10}],
        },
    }
    return payload


def _company(cik, ticker, sic):
    """Synthetic issuer that also tags the bank vocabulary, whatever its SIC."""
    fy_ends = build_year_ends(date(2019, 12, 31), 4)
    builder, _ = standard_company(cik, fy_ends, lambda year: 1000.0 + year)
    for year_end in fy_ends:
        year = year_end.year
        # Standalone quarters in the 10-Qs; the 10-K carries the full year and
        # leaves Q4 to be reconstructed, as the core fixture does for revenue.
        for index, (start, end) in enumerate(((date(year, 1, 1), date(year, 3, 31)),
                                              (date(year, 4, 1), date(year, 6, 30)),
                                              (date(year, 7, 1), date(year, 9, 30))), 1):
            builder.add("us-gaap", "InterestIncomeExpenseNet", "USD", 100.0 + index,
                        end, start, f"{cik}-{year}-Q{index}", "10-Q",
                        date(year, index * 3 + 1, 15), fy=year, fp=f"Q{index}")
            builder.add("us-gaap", "Deposits", "USD", 9000.0 + year + index, end, None,
                        f"{cik}-{year}-Q{index}", "10-Q", date(year, index * 3 + 1, 15),
                        fy=year, fp=f"Q{index}")
        accession = f"{cik}-{year_end.year}-K"
        builder.add("us-gaap", "InterestIncomeExpenseNet", "USD", 400.0 + year_end.year,
                    year_end, date(year_end.year, 1, 1), accession, "10-K",
                    date(year_end.year + 1, 2, 20), fy=year_end.year, fp="FY")
        builder.add("us-gaap", "Deposits", "USD", 9000.0 + year_end.year, year_end, None,
                    accession, "10-K", date(year_end.year + 1, 2, 20),
                    fy=year_end.year, fp="FY")
    return (cik, ticker, f"SYNTHETIC {ticker}", sic, "1231", builder)


class IndustryLayerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.registry = MetricRegistry(_payload_with_bank_layer())
        self.fact_store = JsonFactStore(root / "facts", compress=True)
        companies = [_company(4100000001, "SBNK", BANK_SIC),
                     _company(4100000002, "SIND", INDUSTRIAL_SIC)]
        self.pipe = IngestionPipeline(
            provider=SECProvider(client=StubSEC(companies)), registry=self.registry,
            raw_store=JsonRawStore(root / "raw"), fact_store=self.fact_store,
            checkpoint=CheckpointStore(root / "state", run_id="t"))
        for cik, *_ in companies:
            self.pipe.ingest_company(cik)

    def _bundle(self, cik, ticker):
        document = self.fact_store.read_company(str(cik))
        return build_company_bundle(document, self.registry, ticker)

    def test_core_names_exclude_the_industry_layer(self):
        self.assertNotIn("net_interest_income", self.registry.names())
        self.assertIsNotNone(self.registry.get("net_interest_income"))
        self.assertTrue(self.registry.is_industry_metric("deposits"))
        self.assertEqual(self.registry.industry_metric_names("BANK"),
                         ["deposits", "net_interest_income"])

    def test_the_bank_gets_its_own_block_and_an_unchanged_core(self):
        bundle = self._bundle(4100000001, "SBNK")
        layer = bundle["industrySpecificMetrics"]
        self.assertEqual(layer["industry"], "BANK")
        self.assertEqual(layer["metricIds"], ["deposits", "netInterestIncome"])
        self.assertTrue(layer["facts"])
        core_ids = {fact["metricId"] for fact in bundle["facts"]}
        self.assertNotIn("netInterestIncome", core_ids)
        self.assertNotIn("deposits", core_ids)
        self.assertIn("revenue", core_ids)
        self.assertIn("totalAssets", core_ids)
        one = next(f for f in layer["facts"] if f["metricId"] == "netInterestIncome")
        self.assertEqual(one["unit"], "usd_m")
        self.assertEqual(one["currency"], "USD")
        self.assertEqual(one["dataSourceId"], bundle["facts"][0]["dataSourceId"])

    def test_an_industrial_with_the_same_tags_publishes_no_industry_block(self):
        bundle = self._bundle(4100000002, "SIND")
        self.assertIsNone(bundle["industrySpecificMetrics"])
        self.assertEqual(bundle["coverage"]["industryFactCount"], 0)
        self.assertNotIn("netInterestIncome", {f["metricId"] for f in bundle["facts"]})

    def test_the_issuer_record_counts_the_layer_separately(self):
        document = self.fact_store.read_company("4100000001")
        record = issuer_fundamentals(document, self.registry)
        self.assertEqual(record["industry"], "BANK")
        self.assertEqual(set(record["industryMetrics"]), {"net_interest_income", "deposits"})
        self.assertEqual(record["industryMetrics"]["net_interest_income"]["annualPeriods"], 4)
        self.assertNotIn("net_interest_income", record["metrics"])
        industrial = issuer_fundamentals(self.fact_store.read_company("4100000002"),
                                         self.registry)
        self.assertIsNone(industrial["industry"])
        self.assertEqual(industrial["industryMetrics"], {})

    def test_metric_map_uses_camel_case_ids_in_millions(self):
        industry = self.registry.industry_for(BANK_SIC)
        self.assertEqual(industry_metric_map(self.registry, industry),
                         {"deposits": ("deposits", "usd_m", 1e-6),
                          "net_interest_income": ("netInterestIncome", "usd_m", 1e-6)})
        self.assertEqual(industry_metric_map(self.registry, None), {})


class IndustryRegistryValidationTests(unittest.TestCase):
    def test_an_industry_metric_may_not_shadow_a_core_metric(self):
        payload = _payload_with_bank_layer()
        payload["industry_metrics"]["revenue"] = dict(
            payload["industry_metrics"]["net_interest_income"])
        with self.assertRaises(RegistryError):
            MetricRegistry(payload)

    def test_an_industry_metric_must_name_a_known_industry(self):
        payload = _payload_with_bank_layer()
        payload["industry_metrics"]["deposits"]["industries"] = ["AIRLINE"]
        with self.assertRaises(RegistryError):
            MetricRegistry(payload)
        payload["industry_metrics"]["deposits"]["industries"] = []
        with self.assertRaises(RegistryError):
            MetricRegistry(payload)

    def test_the_shipped_registry_loads_with_or_without_a_layer(self):
        registry = MetricRegistry.load()
        self.assertEqual(len(registry.names()), 40)
        for name in registry.industry_metrics:
            self.assertNotIn(name, registry.metrics)


if __name__ == "__main__":
    unittest.main()
