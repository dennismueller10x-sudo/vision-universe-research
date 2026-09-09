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

    def test_ebit_is_derived_from_pretax_income_and_interest_expense(self):
        ebit = self.derived["ebit"]
        pretax = self.resolver.annual("pretax_income", 2025, self.as_of)
        interest = self.resolver.annual("interest_expense", 2025, self.as_of)
        # The standard fixture intentionally has no interest expense, proving
        # that EBIT is unavailable rather than silently relabelled operating income.
        self.assertFalse(ebit.available)
        self.assertIsNone(ebit.value)
        self.assertTrue(pretax.available)
        self.assertFalse(interest.available)

    def test_ebit_is_marked_derived_when_both_inputs_exist(self):
        from quant.tests.fixtures import FLOW_CONCEPTS
        resolver, _, _ = resolver_for(
            3000000099, lambda year: 1000.0 * (year - 2017),
            flow_concepts=FLOW_CONCEPTS + (("InterestExpense", "USD", 0.02),))
        as_of = date(2026, 3, 1)
        ebit = reconstruct(resolver, 2025, "FY", as_of)["ebit"]
        pretax = resolver.annual("pretax_income", 2025, as_of)
        interest = resolver.annual("interest_expense", 2025, as_of)
        self.assertTrue(ebit.available)
        self.assertAlmostEqual(pretax.value + interest.value, ebit.value)
        self.assertEqual(SOURCE_DERIVED, ebit.provenance.source)

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

    def test_provenance_points_at_the_filing_that_made_the_value_knowable(self):
        """Found in the release audit: availability and accession disagreed.

        A derived value becomes available when its LAST input does, but the
        accession was taken from the FIRST input. Where a later restatement of
        one input changed the result, the canonical fact then cited a filing
        that predated its own value — 77 cells across the five validation
        companies carried two revisions under one accession.
        """
        from quant.sec.derived import _determining_input
        fcf = self.derived["free_cash_flow"]
        inputs = [self.resolver.annual(name, 2025, self.as_of)
                  for name in ("operating_cash_flow", "capital_expenditures")]
        determining = _determining_input(inputs)
        self.assertEqual(fcf.provenance.accession, determining.provenance.accession)
        self.assertEqual(fcf.provenance.form, determining.provenance.form)
        self.assertEqual(str(fcf.provenance.available_from),
                         str(determining.provenance.available_from))

    def test_the_determining_input_is_the_last_one_to_become_available(self):
        from quant.sec.derived import _determining_input

        class _Fact:
            def __init__(self, accession, available_from):
                self.provenance = type("P", (), {
                    "accession": accession, "available_from": available_from,
                    "filed": available_from, "form": "10-Q", "retrieved_at": None,
                })()

        early, late = _Fact("acc-early", "2017-11-03"), _Fact("acc-late", "2018-08-01")
        self.assertEqual(_determining_input([early, late]).provenance.accession,
                         "acc-late")
        self.assertEqual(_determining_input([late, early]).provenance.accession,
                         "acc-late",
                         "input order must not decide which filing is cited")

    def test_the_built_fact_cites_the_determining_input_not_the_first(self):
        """The wiring, not just the rule: _derived_fact must use the anchor."""
        from quant.sec.derived import _derived_fact
        first = self.resolver.annual("operating_cash_flow", 2025, self.as_of)
        later = self.resolver.annual("capital_expenditures", 2025, self.as_of)
        # Make the SECOND input the determining one by giving it a later
        # availability and a different accession, then pass it second.
        later.provenance.available_from = "2099-01-01"
        later.provenance.filed = "2099-01-01"
        later.provenance.accession = "acc-determining"
        built = _derived_fact("0000000001", "free_cash_flow", 1.0, "USD",
                              [first, later], 2025, "FY", first)
        self.assertEqual(built.provenance.accession, "acc-determining")
        self.assertEqual(str(built.provenance.available_from), "2099-01-01")

    def test_the_cited_filing_is_never_older_than_the_availability_it_claims(self):
        for name, fact in self.derived.items():
            if not fact.available:
                continue
            with self.subTest(metric=name):
                self.assertLessEqual(str(fact.provenance.filed)[:10],
                                     str(fact.provenance.available_from)[:10])

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
