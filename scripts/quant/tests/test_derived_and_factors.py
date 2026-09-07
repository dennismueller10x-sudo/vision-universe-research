"""Derived metrics stay separate from SEC facts and never invent a value."""
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.derived import BASIS_FY, BASIS_TTM, compute_derived
from quant.sec.factors import FACTOR_DEFINITIONS, company_factor_inputs, score_universe
from quant.sec.model import (
    SOURCE_DERIVED, SOURCE_SEC, TRANSFORM_FORMULA, CompanyProfile,
    MISSING_INPUT, NOT_APPLICABLE_FOR_SECTOR, DIVISION_BY_ZERO,
)
from quant.sec.normalize import normalize_company
from quant.sec.periods import PeriodResolver
from quant.sec.provider import SECProvider
from quant.sec.registry import MetricRegistry
from quant.tests.fixtures import FactsBuilder, build_year_ends, standard_company


class _NullClient:
    def get_json(self, url, use_cache=True):  # pragma: no cover
        raise AssertionError("no network in tests")


def resolver_for(cik, annual_revenue, profile=None, years=8, first_end=date(2018, 12, 31),
                 **kwargs):
    registry = MetricRegistry.load()
    fy_ends = build_year_ends(first_end, years)
    builder, expected = standard_company(cik, fy_ends, annual_revenue, **kwargs)
    provider = SECProvider(client=_NullClient())
    raw = list(provider.iter_raw_facts(builder.company_facts()))
    result = normalize_company(str(cik).zfill(10), raw, registry, profile=profile,
                               filing_metadata=builder.filings)
    return PeriodResolver(result.factbook, registry), registry, expected


class DerivedMetricTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.resolver, cls.registry, cls.expected = resolver_for(
            3000000001, lambda year: 1000.0 * (year - 2017))
        cls.as_of = date(2026, 3, 1)
        cls.derived = compute_derived(cls.resolver, cls.as_of, basis=BASIS_TTM)

    def test_every_derived_metric_is_labelled_as_vision_universe(self):
        for name, fact in self.derived.items():
            with self.subTest(metric=name):
                self.assertEqual(fact.provenance.source, SOURCE_DERIVED)
                self.assertEqual(fact.provenance.transformation, TRANSFORM_FORMULA)

    def test_available_derived_metrics_carry_a_formula_version(self):
        for name, fact in self.derived.items():
            if fact.available:
                with self.subTest(metric=name):
                    self.assertTrue(fact.provenance.formula_version)
                    self.assertTrue(fact.provenance.inputs)

    def test_free_cash_flow_is_operating_cash_flow_minus_capex(self):
        fcf = self.derived["free_cash_flow"]
        ocf = self.resolver.ttm("operating_cash_flow", self.as_of)
        capex = self.resolver.ttm("capital_expenditures", self.as_of)
        self.assertTrue(fcf.available)
        self.assertAlmostEqual(fcf.value, ocf.value - capex.value, places=6)

    def test_net_margin_matches_its_inputs(self):
        margin = self.derived["net_margin"]
        revenue = self.resolver.ttm("revenue", self.as_of)
        net_income = self.resolver.ttm("net_income", self.as_of)
        self.assertAlmostEqual(margin.value, net_income.value / revenue.value, places=9)

    def test_revenue_growth_is_positive_for_a_growing_fixture(self):
        growth = self.derived["revenue_growth_yoy"]
        self.assertTrue(growth.available)
        self.assertGreater(growth.value, 0.0)

    def test_a_derived_value_is_never_older_than_its_newest_input(self):
        fcf = self.derived["free_cash_flow"]
        ocf = self.resolver.ttm("operating_cash_flow", self.as_of)
        self.assertGreaterEqual(str(fcf.provenance.available_from),
                                str(ocf.provenance.available_from))

    def test_gross_profit_is_reconstructed_when_not_reported(self):
        # The fixture reports cost of revenue but never a GrossProfit line.
        self.assertIsNone(self.resolver.factbook.get("gross_profit", 2025, "FY"))
        gross_profit = self.derived["gross_profit_derived"]
        self.assertTrue(gross_profit.available)
        self.assertEqual(gross_profit.provenance.source, SOURCE_DERIVED)
        self.assertTrue(self.derived["gross_margin"].available)

    def test_a_missing_input_yields_a_null_value_with_a_reason(self):
        resolver, _, _ = resolver_for(
            3000000009, lambda year: 1000.0 * (year - 2017),
            flow_concepts=(("NetIncomeLoss", "USD", 0.19),))
        derived = compute_derived(resolver, date(2026, 3, 1))
        gross_margin = derived["gross_margin"]
        self.assertFalse(gross_margin.available)
        self.assertIsNone(gross_margin.value)
        self.assertEqual(gross_margin.reason, MISSING_INPUT)

    def test_no_unavailable_derived_metric_is_reported_as_zero(self):
        for name, fact in self.derived.items():
            if not fact.available:
                with self.subTest(metric=name):
                    self.assertIsNone(fact.value)
                    self.assertIsNotNone(fact.reason)

    def test_the_fy_basis_uses_annual_figures(self):
        derived = compute_derived(self.resolver, self.as_of, basis=BASIS_FY)
        annual = self.resolver.annual("revenue", derived["net_margin"].fiscal_year,
                                      self.as_of)
        self.assertTrue(annual.available)

    def test_an_unknown_basis_is_rejected(self):
        with self.assertRaises(ValueError):
            compute_derived(self.resolver, self.as_of, basis="VIBES")


class DerivedEdgeCaseTests(unittest.TestCase):
    def test_growth_off_a_negative_base_is_refused(self):
        resolver, _, _ = resolver_for(3000000002, lambda year: -100.0 if year < 2024 else 100.0)
        derived = compute_derived(resolver, date(2026, 3, 1))
        growth = derived["revenue_growth_yoy"]
        if not growth.available:
            self.assertIn(growth.reason, (DIVISION_BY_ZERO, MISSING_INPUT))

    def test_a_zero_denominator_is_refused_not_treated_as_infinity(self):
        resolver, _, _ = resolver_for(3000000003, lambda year: 0.0)
        derived = compute_derived(resolver, date(2026, 3, 1))
        self.assertFalse(derived["net_margin"].available)
        self.assertEqual(derived["net_margin"].reason, DIVISION_BY_ZERO)

    def test_sector_rules_propagate_into_derived_metrics(self):
        profile = CompanyProfile(cik="3000000004", name="SYNTHETIC BANK", sic="6021")
        resolver, _, _ = resolver_for(3000000004, lambda year: 5000.0, profile=profile)
        derived = compute_derived(resolver, date(2026, 3, 1))
        for metric in ("gross_margin", "roic", "debt_to_equity"):
            with self.subTest(metric=metric):
                self.assertFalse(derived[metric].available)
                self.assertEqual(derived[metric].reason, NOT_APPLICABLE_FOR_SECTOR)

    def test_a_bank_still_gets_margins_that_do_apply(self):
        profile = CompanyProfile(cik="3000000005", name="SYNTHETIC BANK", sic="6021")
        resolver, _, _ = resolver_for(3000000005, lambda year: 5000.0 + year, profile=profile)
        derived = compute_derived(resolver, date(2026, 3, 1))
        self.assertTrue(derived["net_margin"].available)


class FactorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.as_of = date(2026, 3, 1)
        cls.inputs = {}
        for index, growth in enumerate((1.05, 1.15, 1.25, 1.35), start=1):
            resolver, _, _ = resolver_for(
                3100000000 + index,
                lambda year, g=growth: 1000.0 * (g ** (year - 2017)))
            cls.inputs[f"SYN{index}"] = company_factor_inputs(resolver, cls.as_of)
        cls.scored = score_universe(cls.inputs)

    def test_growth_and_profitability_are_scored(self):
        for symbol, factors in self.scored["scores"].items():
            with self.subTest(symbol=symbol):
                self.assertTrue(factors["growth"]["available"])
                self.assertTrue(factors["profitability"]["available"])

    def test_the_fastest_grower_has_the_highest_growth_score(self):
        ranked = sorted(self.scored["scores"].items(),
                        key=lambda item: item[1]["growth"]["score"])
        self.assertEqual(ranked[-1][0], "SYN4")

    def test_value_and_momentum_are_declared_unavailable_not_faked(self):
        factors = next(iter(self.scored["scores"].values()))
        for name in ("value", "momentum"):
            with self.subTest(factor=name):
                self.assertFalse(factors[name]["available"])
                self.assertIsNone(factors[name]["score"])
                self.assertEqual(factors[name]["reason"], "NOT_AVAILABLE_FROM_PROVIDER")

    def test_a_universe_too_small_for_cross_section_scores_nothing(self):
        small = {"SYN1": self.inputs["SYN1"]}
        scored = score_universe(small)
        for factor in FACTOR_DEFINITIONS:
            with self.subTest(factor=factor):
                self.assertFalse(scored["scores"]["SYN1"][factor]["available"])

    def test_missing_inputs_block_a_factor_rather_than_being_imputed(self):
        blank = {"values": {}, "reasons": {"revenue_growth_yoy": MISSING_INPUT},
                 "derived": {}}
        universe = dict(self.inputs)
        universe["EMPTY"] = blank
        scored = score_universe(universe)
        self.assertFalse(scored["scores"]["EMPTY"]["growth"]["available"])
        self.assertEqual(scored["scores"]["EMPTY"]["growth"]["reason"], MISSING_INPUT)


if __name__ == "__main__":
    unittest.main()
