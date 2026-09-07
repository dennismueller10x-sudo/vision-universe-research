"""Canonical reconstruction: derived values stay separate and never invented.

Scope note: factor scores and ratios are no longer tested here because they are
no longer computed here — `quant/engines/factors.js` and `quant-score.js` own
them, and `quant/tests/quant.test.mjs` covers them.
"""
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.derived import FORMULAS, RECONSTRUCTED, reconstruct
from quant.sec.model import (
    SOURCE_DERIVED, SOURCE_SEC, TRANSFORM_FORMULA, CompanyProfile,
    MISSING_INPUT, NOT_APPLICABLE_FOR_SECTOR, DIVISION_BY_ZERO,
)
from quant.sec.normalize import normalize_company
from quant.sec.periods import PeriodResolver
from quant.sec.provider import SECProvider
from quant.sec.registry import MetricRegistry
from quant.sec.restatements import POLICY_LATEST_KNOWN
from quant.tests.fixtures import build_year_ends, standard_company


class _NullClient:
    def get_json(self, url, use_cache=True):  # pragma: no cover
        raise AssertionError("no network in tests")


def resolver_for(cik, annual_revenue, profile=None, years=8,
                 first_end=date(2018, 12, 31), **kwargs):
    registry = MetricRegistry.load()
    fy_ends = build_year_ends(first_end, years)
    builder, expected = standard_company(cik, fy_ends, annual_revenue, **kwargs)
    provider = SECProvider(client=_NullClient())
    raw = list(provider.iter_raw_facts(builder.company_facts()))
    result = normalize_company(str(cik).zfill(10), raw, registry, profile=profile,
                               filing_metadata=builder.filings)
    return PeriodResolver(result.factbook, registry), registry, expected


class ReconstructionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.resolver, cls.registry, cls.expected = resolver_for(
            3000000001, lambda year: 1000.0 * (year - 2017))
        cls.as_of = date(2026, 3, 1)
        cls.derived = reconstruct(cls.resolver, 2025, "FY", cls.as_of)

    def test_only_canonical_metrics_are_reconstructed(self):
        self.assertEqual(set(self.derived) - set(RECONSTRUCTED), set())

    def test_every_reconstructed_value_is_labelled_vision_universe(self):
        for name, fact in self.derived.items():
            if fact.available and fact.provenance.source == SOURCE_DERIVED:
                with self.subTest(metric=name):
                    self.assertEqual(fact.provenance.transformation, TRANSFORM_FORMULA)
                    self.assertTrue(fact.provenance.formula_version)
                    self.assertTrue(fact.provenance.inputs)

    def test_free_cash_flow_is_operating_cash_flow_minus_capex(self):
        fcf = self.derived["free_cash_flow"]
        ocf = self.resolver.annual("operating_cash_flow", 2025, self.as_of)
        capex = self.resolver.annual("capital_expenditures", 2025, self.as_of)
        self.assertTrue(fcf.available)
        self.assertAlmostEqual(fcf.value, ocf.value - capex.value, places=6)
        self.assertEqual(fcf.provenance.source, SOURCE_DERIVED)

    def test_gross_profit_is_reconstructed_when_not_reported(self):
        self.assertIsNone(self.resolver.factbook.get("gross_profit", 2025, "FY"))
        gross = self.derived["gross_profit"]
        revenue = self.resolver.annual("revenue", 2025, self.as_of)
        cost = self.resolver.annual("cost_of_revenue", 2025, self.as_of)
        self.assertTrue(gross.available)
        self.assertAlmostEqual(gross.value, revenue.value - cost.value, places=6)

    def test_a_reported_line_wins_over_reconstruction(self):
        """gross_profit reported by the filer must be taken as reported."""
        from quant.tests.fixtures import FLOW_CONCEPTS
        resolver, _, _ = resolver_for(
            3000000002, lambda year: 1000.0 * (year - 2017),
            flow_concepts=FLOW_CONCEPTS + (("GrossProfit", "USD", 0.45),))
        derived = reconstruct(resolver, 2025, "FY", date(2026, 3, 1))
        self.assertEqual(derived["gross_profit"].provenance.source, SOURCE_SEC)

    def test_invested_capital_and_net_debt_use_the_debt_components(self):
        for metric in ("net_debt", "invested_capital"):
            with self.subTest(metric=metric):
                self.assertTrue(self.derived[metric].available)

    def test_accruals_is_a_ratio_not_a_currency_amount(self):
        accruals = self.derived["accruals"]
        self.assertTrue(accruals.available)
        self.assertEqual(accruals.unit, "ratio")

    def test_a_derived_value_is_never_older_than_its_newest_input(self):
        fcf = self.derived["free_cash_flow"]
        ocf = self.resolver.annual("operating_cash_flow", 2025, self.as_of)
        self.assertGreaterEqual(str(fcf.provenance.available_from),
                                str(ocf.provenance.available_from))

    def test_every_formula_is_documented(self):
        for metric in RECONSTRUCTED:
            self.assertIn(metric, FORMULAS)

    def test_reconstruction_works_per_quarter_too(self):
        derived = reconstruct(self.resolver, 2025, "Q3", self.as_of)
        self.assertTrue(derived["free_cash_flow"].available)
        self.assertEqual(derived["free_cash_flow"].fiscal_period, "Q3")


class MissingAndBlockedTests(unittest.TestCase):
    def test_a_missing_input_yields_null_with_a_reason(self):
        resolver, _, _ = resolver_for(
            3000000009, lambda year: 1000.0 * (year - 2017),
            flow_concepts=(("NetIncomeLoss", "USD", 0.19),))
        derived = reconstruct(resolver, 2025, "FY", date(2026, 3, 1))
        gross = derived["gross_profit"]
        self.assertFalse(gross.available)
        self.assertIsNone(gross.value)
        self.assertEqual(gross.reason, MISSING_INPUT)

    def test_no_unavailable_metric_is_reported_as_zero(self):
        resolver, _, _ = resolver_for(
            3000000010, lambda year: 1000.0 * (year - 2017),
            flow_concepts=(("NetIncomeLoss", "USD", 0.19),))
        derived = reconstruct(resolver, 2025, "FY", date(2026, 3, 1))
        for name, fact in derived.items():
            if not fact.available:
                with self.subTest(metric=name):
                    self.assertIsNone(fact.value)
                    self.assertIsNotNone(fact.reason)

    def test_sector_rules_block_the_output_metric_not_only_the_inputs(self):
        profile = CompanyProfile(cik="3000000004", name="SYNTHETIC BANK", sic="6021")
        resolver, _, _ = resolver_for(3000000004, lambda year: 5000.0, profile=profile)
        derived = reconstruct(resolver, 2025, "FY", date(2026, 3, 1))
        for metric in ("net_debt", "total_debt"):
            with self.subTest(metric=metric):
                self.assertFalse(derived[metric].available)
                self.assertEqual(derived[metric].reason, NOT_APPLICABLE_FOR_SECTOR)

    def test_a_bank_still_gets_the_metrics_that_do_apply(self):
        profile = CompanyProfile(cik="3000000005", name="SYNTHETIC BANK", sic="6021")
        resolver, _, _ = resolver_for(3000000005, lambda year: 5000.0 + year,
                                      profile=profile)
        derived = reconstruct(resolver, 2025, "FY", date(2026, 3, 1))
        self.assertTrue(derived["free_cash_flow"].available)

    def test_zero_total_assets_refuses_accruals_rather_than_dividing(self):
        resolver, _, _ = resolver_for(3000000011, lambda year: 0.0)
        derived = reconstruct(resolver, 2025, "FY", date(2026, 3, 1))
        self.assertFalse(derived["accruals"].available)
        self.assertEqual(derived["accruals"].reason, DIVISION_BY_ZERO)

    def test_point_in_time_is_respected(self):
        resolver, _, _ = resolver_for(3000000012, lambda year: 1000.0 * (year - 2017))
        early = reconstruct(resolver, 2025, "FY", date(2025, 6, 1))
        late = reconstruct(resolver, 2025, "FY", date(2026, 6, 1))
        self.assertFalse(early["free_cash_flow"].available)
        self.assertTrue(late["free_cash_flow"].available)


if __name__ == "__main__":
    unittest.main()
