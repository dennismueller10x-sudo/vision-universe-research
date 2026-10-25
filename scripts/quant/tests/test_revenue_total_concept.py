"""Revenue is the consolidated total, not its ASC 606 component.

United Rentals reports rental revenue under ASC 842 (leases). Its 10-Q tags
RevenueFromContractWithCustomerExcludingAssessedTax = 1.068 bn (ASC 606 part
only) and us-gaap:Revenues = 4.893 bn (total) for Q3 2026. The registry put the
component first, so the product showed a quarter of the revenue. Measured on
25.10.2026 over the product universe: Revenues larger in 311 issuers (REITs,
insurers, lessors), equal in 497, SMALLER in 70 (where it is evidently not the
total). Rule: the total wins only when it is larger, in the same filing and
cell; nothing is added up.
"""
import unittest
from datetime import date

from quant.sec import consumer
from quant.sec.consumer import rowdict as R
from quant.sec.registry import MetricDefinition, MetricRegistry, RegistryError
from quant.tests.fixtures import FactsBuilder


def filer(cik, rows):
    """rows: (taxonomy, concept, value) reported in every quarter of 2026 Q1-Q3."""
    b = FactsBuilder(cik)
    quarters = [(date(2026, 1, 1), date(2026, 3, 31), date(2026, 4, 25), "Q1"),
                (date(2026, 4, 1), date(2026, 6, 30), date(2026, 7, 25), "Q2"),
                (date(2026, 7, 1), date(2026, 9, 30), date(2026, 10, 21), "Q3")]
    for start, end, filed, fp in quarters:
        accn = f"{cik}-26-{fp}"
        for taxonomy, concept, value in rows:
            b.add(taxonomy, concept, "USD", value, end, start, accn, "10-Q", filed, fy=2026, fp=fp)
        b.add("us-gaap", "Assets", "USD", 10000.0, end, None, accn, "10-Q", filed, fy=2026, fp=fp)
        b.add("us-gaap", "Assets", "USD", 9000.0, date(2025, 12, 31), None, accn, "10-Q", filed, fy=2026, fp=fp)
    return b.company_facts("SYNTHETIC REVENUE FILER")


class RevenueTotalConceptTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()

    def revenue(self, payload, industry=None):
        bundle = consumer.build_consumer_bundle(2000000055, payload, self.registry, as_of="2026-10-25",
                                                tickers=["REVT"], security_ids=["ref_REVT"], name="Revenue Test",
                                                fiscal_year_end_hint="1231", industry=industry)
        return [R(r) for r in bundle["quarterly"].get("revenue", [])]

    def test_a_larger_total_replaces_the_asc606_component(self):
        rows = self.revenue(filer(2000000055, [("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax", 1068.0),
                                               ("us-gaap", "Revenues", 4893.0)]))
        self.assertEqual([r["v"] for r in rows], [4893.0, 4893.0, 4893.0])

    def test_a_smaller_revenues_tag_is_not_the_total(self):
        rows = self.revenue(filer(2000000055, [("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax", 2237.0),
                                               ("us-gaap", "Revenues", 0.0)]))
        self.assertEqual([r["v"] for r in rows], [2237.0, 2237.0, 2237.0])

    def test_equal_values_keep_the_registry_priority(self):
        rows = self.revenue(filer(2000000055, [("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax", 500.0),
                                               ("us-gaap", "Revenues", 500.0)]))
        self.assertEqual([r["v"] for r in rows], [500.0, 500.0, 500.0])

    def test_components_are_never_added_up(self):
        rows = self.revenue(filer(2000000055, [("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax", 300.0),
                                               ("us-gaap", "OperatingLeasesIncomeStatementLeaseRevenue", 700.0)]))
        self.assertEqual([r["v"] for r in rows], [300.0, 300.0, 300.0])

    def test_ifrs15_revenue_is_the_fallback_when_ifrs_revenue_is_missing(self):
        rows = self.revenue(filer(2000000055, [("ifrs-full", "RevenueFromContractsWithCustomers", 800.0)]))
        self.assertEqual([r["v"] for r in rows], [800.0, 800.0, 800.0])

    def test_ifrs15_revenue_of_a_bank_is_fee_income_not_revenue(self):
        # Barclays: RevenueFromContractsWithCustomers 11.1 bn is fee and
        # commission income; total income is about 27 bn. No revenue is better
        # than a wrong one.
        payload = filer(2000000055, [("ifrs-full", "RevenueFromContractsWithCustomers", 800.0)])
        self.assertEqual(self.revenue(payload, industry="BANK"), [])
        self.assertEqual(self.revenue(payload, industry="INSURER"), [])
        self.assertEqual([r["v"] for r in self.revenue(payload, industry="REIT")], [800.0, 800.0, 800.0])

    def test_issuer_industries_come_from_the_pipeline_shards(self):
        import json, tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "000.json").write_text(json.dumps({"issuers": [
                {"cik": "312069", "industry": "BANK"}, {"cik": "0001725964", "industry": None}]}))
            self.assertEqual(consumer.load_issuer_industries(tmp), {"0000312069": "BANK"})
        self.assertEqual(consumer.load_issuer_industries("/nonexistent"), {})

    def test_excluded_industries_name_registry_industries(self):
        for metric in (*self.registry.metrics.values(), *self.registry.industry_metrics.values()):
            for rule in metric.concepts:
                self.assertLessEqual(rule.excluded_industries, set(self.registry.industries), rule)
        self.assertTrue(self.registry.excluded_for("revenue", "ifrs-full", "RevenueFromContractsWithCustomers", "BANK"))

    def test_registry_refuses_a_total_concept_that_is_not_accepted(self):
        with self.assertRaises(RegistryError):
            MetricDefinition("x", {"kind": "duration", "units": ["USD"], "total_concepts": ["us-gaap:Nope"],
                                   "concepts": [{"taxonomy": "us-gaap", "concept": "Revenues", "priority": 10}]})


if __name__ == "__main__":
    unittest.main()
