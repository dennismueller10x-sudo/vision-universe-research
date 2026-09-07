"""Normalization and period arithmetic: YTD de-accumulation, TTM, PIT windows."""
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.model import (
    TRANSFORM_YTD_DIFF, TRANSFORM_FY_MINUS_YTD, TRANSFORM_NONE, TRANSFORM_SUM,
    SOURCE_SEC, NOT_APPLICABLE_FOR_SECTOR, MISSING_XBRL_CONCEPT, INSUFFICIENT_HISTORY,
)
from quant.sec.normalize import normalize_company
from quant.sec.periods import PeriodResolver
from quant.sec.provider import SECProvider
from quant.sec.registry import MetricRegistry
from quant.sec.restatements import POLICY_LATEST_KNOWN
from quant.tests.fixtures import FactsBuilder, build_year_ends, standard_company


class _NullClient:
    def get_json(self, url, use_cache=True):  # pragma: no cover
        raise AssertionError(f"unexpected network call to {url}")


def normalize(builder, registry, cik, profile=None):
    provider = SECProvider(client=_NullClient())
    raw = list(provider.iter_raw_facts(builder.company_facts()))
    result = normalize_company(str(cik).zfill(10), raw, registry, profile=profile,
                               filing_metadata=builder.filings)
    return result, raw


class YearToDateTests(unittest.TestCase):
    """Q2 year-to-date is NOT Q2 standalone. Getting this wrong doubles revenue."""

    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()
        cls.fy_ends = build_year_ends(date(2019, 12, 31), 7)
        cls.builder, cls.expected = standard_company(
            2000000001, cls.fy_ends, lambda year: 1000.0 * (year - 2018))
        cls.result, cls.raw = normalize(cls.builder, cls.registry, 2000000001)
        cls.resolver = PeriodResolver(cls.result.factbook, cls.registry)

    def test_cumulative_periods_are_stored_under_ytd_labels(self):
        self.assertIsNotNone(self.result.factbook.get("revenue", 2023, "YTD2"))
        self.assertIsNotNone(self.result.factbook.get("revenue", 2023, "YTD3"))

    def test_a_ytd_value_is_never_stored_as_a_quarter(self):
        native_q2 = self.result.factbook.get("revenue", 2023, "Q2")
        self.assertIsNone(native_q2, "the fixture reports Q2 only as year-to-date")

    def test_standalone_q2_is_reconstructed_by_difference(self):
        fact = self.resolver.quarter("revenue", 2023, 2, None, policy=POLICY_LATEST_KNOWN)
        self.assertTrue(fact.available)
        self.assertAlmostEqual(fact.value, self.expected[2023]["quarters"][1], places=2)
        self.assertEqual(fact.provenance.transformation, TRANSFORM_YTD_DIFF)

    def test_standalone_q3_is_reconstructed_from_two_ytd_points(self):
        fact = self.resolver.quarter("revenue", 2023, 3, None, policy=POLICY_LATEST_KNOWN)
        self.assertAlmostEqual(fact.value, self.expected[2023]["quarters"][2], places=2)
        self.assertEqual(fact.provenance.transformation, TRANSFORM_YTD_DIFF)

    def test_q4_is_reconstructed_as_full_year_minus_nine_months(self):
        fact = self.resolver.quarter("revenue", 2023, 4, None, policy=POLICY_LATEST_KNOWN)
        self.assertAlmostEqual(fact.value, self.expected[2023]["quarters"][3], places=2)
        self.assertEqual(fact.provenance.transformation, TRANSFORM_FY_MINUS_YTD)

    def test_q1_is_taken_as_reported_not_derived(self):
        fact = self.resolver.quarter("revenue", 2023, 1, None, policy=POLICY_LATEST_KNOWN)
        self.assertAlmostEqual(fact.value, self.expected[2023]["quarters"][0], places=2)
        self.assertEqual(fact.provenance.transformation, TRANSFORM_NONE)

    def test_four_reconstructed_quarters_sum_to_the_reported_year(self):
        quarters = [self.resolver.quarter("revenue", 2023, index, None,
                                          policy=POLICY_LATEST_KNOWN).value
                    for index in range(1, 5)]
        annual = self.resolver.annual("revenue", 2023, None, policy=POLICY_LATEST_KNOWN)
        self.assertAlmostEqual(sum(quarters), annual.value, places=2)

    def test_derived_quarters_are_marked_as_a_period_transform(self):
        fact = self.resolver.quarter("revenue", 2023, 2, None, policy=POLICY_LATEST_KNOWN)
        self.assertIn("VU_PERIOD_TRANSFORM", fact.flags)
        self.assertEqual(fact.provenance.source, SOURCE_SEC)
        self.assertGreaterEqual(len(fact.provenance.inputs), 2)


class PointInTimeDeaccumulationTests(unittest.TestCase):
    """De-accumulation must use only filings available at the as-of date."""

    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()
        cls.fy_ends = build_year_ends(date(2019, 12, 31), 7)
        cls.builder, cls.expected = standard_company(
            2000000002, cls.fy_ends, lambda year: 1000.0 * (year - 2018))
        cls.result, _ = normalize(cls.builder, cls.registry, 2000000002)
        cls.resolver = PeriodResolver(cls.result.factbook, cls.registry)

    def test_q4_is_invisible_before_the_annual_report_is_filed(self):
        # FY2023 ends 2023-12-31; the fixture files the 10-K 55 days later.
        fact = self.resolver.quarter("revenue", 2023, 4, date(2024, 1, 15))
        self.assertFalse(fact.available)
        self.assertEqual(fact.reason, MISSING_XBRL_CONCEPT)

    def test_q4_becomes_visible_once_the_annual_report_is_filed(self):
        filed = self.fy_ends[-1]
        fact = self.resolver.quarter("revenue", 2023, 4, date(2024, 3, 1))
        self.assertTrue(fact.available)

    def test_q2_is_invisible_before_the_second_quarter_report(self):
        self.assertFalse(self.resolver.quarter("revenue", 2023, 2, date(2023, 7, 1)).available)

    def test_a_derived_quarter_is_never_older_than_its_newest_input(self):
        fact = self.resolver.quarter("revenue", 2023, 4, date(2024, 3, 1))
        self.assertGreaterEqual(str(fact.provenance.available_from)[:10], "2024-02")


class OutOfOrderReconstructionTests(unittest.TestCase):
    """A quarter is never reconstructed from cumulative periods that are out of order.

    Found on live SEC data: for NVDA the fiscal calendar misplaced a period in
    the sparse first XBRL years, and Q4 = FY - YTD3 was then computed from an
    annual figure ending BEFORE the nine-month figure. The result was a
    confident operating-income number for a "FY2010 Q4" whose period end was
    2010-10-31 — the same date the same year's Q3 already carried. Two quarters
    cannot end on the same day; the pipeline must leave a gap instead.
    """

    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()

    def _resolver(self, builder, cik):
        provider = SECProvider(client=_NullClient())
        raw = list(provider.iter_raw_facts(builder.company_facts()))
        result = normalize_company(str(cik).zfill(10), raw, self.registry,
                                   filing_metadata=builder.filings)
        return PeriodResolver(result.factbook, self.registry), result

    def test_ordered_cumulative_periods_still_reconstruct(self):
        """The guard must not block the normal case."""
        fy_ends = build_year_ends(date(2019, 12, 31), 6)
        builder, expected = standard_company(2000000020, fy_ends, lambda year: 1000.0)
        resolver, _ = self._resolver(builder, 2000000020)
        fact = resolver.quarter("revenue", 2023, 4, None, policy=POLICY_LATEST_KNOWN)
        self.assertTrue(fact.available)
        self.assertEqual(fact.provenance.transformation, TRANSFORM_FY_MINUS_YTD)

    def test_an_annual_period_ending_before_the_nine_month_one_is_refused(self):
        from quant.tests.fixtures import FactsBuilder
        builder = FactsBuilder(2000000021)
        # A well-formed year, so the calendar has anchors to learn from.
        for year in (2021, 2022, 2023):
            builder.add("us-gaap", "Revenues", "USD", 1000.0, f"{year}-12-31",
                        f"{year}-01-01", f"fy-{year}", "10-K", f"{year + 1}-02-20",
                        fy=year, fp="FY")
        # A nine-month figure that ends AFTER the annual figure of the same
        # labelled year — the shape the misplacement produced on real data.
        builder.add("us-gaap", "Revenues", "USD", 900.0, "2023-12-31", "2023-04-01",
                    "ytd3-bad", "10-Q", "2024-01-15", fy=2023, fp="Q3")
        resolver, _ = self._resolver(builder, 2000000021)
        grid = resolver.quarter_grid("revenue", 2023, None, policy=POLICY_LATEST_KNOWN)
        for index, observation in grid.items():
            if observation is None or not observation.period_end:
                continue
            with self.subTest(quarter=index):
                self.assertLessEqual(observation.period_end, "2023-12-31")

    def test_no_two_quarters_of_a_year_share_a_period_end(self):
        """The property the live data violated, asserted directly."""
        fy_ends = build_year_ends(date(2019, 12, 31), 6)
        builder, _ = standard_company(2000000022, fy_ends, lambda year: 1000.0)
        resolver, _ = self._resolver(builder, 2000000022)
        for fiscal_year in (2021, 2022, 2023):
            grid = resolver.quarter_grid("revenue", fiscal_year, None,
                                         policy=POLICY_LATEST_KNOWN)
            ends = [o.period_end for o in grid.values() if o is not None and o.period_end]
            with self.subTest(fiscal_year=fiscal_year):
                self.assertEqual(len(ends), len(set(ends)),
                                 f"duplicate period ends in FY{fiscal_year}: {ends}")


class TrailingTwelveMonthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()
        cls.fy_ends = build_year_ends(date(2019, 12, 31), 7)
        cls.builder, cls.expected = standard_company(
            2000000003, cls.fy_ends, lambda year: 1000.0 * (year - 2018))
        cls.result, _ = normalize(cls.builder, cls.registry, 2000000003)
        cls.resolver = PeriodResolver(cls.result.factbook, cls.registry)

    def test_ttm_equals_the_fiscal_year_right_after_the_annual_report(self):
        ttm = self.resolver.ttm("revenue", date(2024, 3, 1))
        annual = self.resolver.annual("revenue", 2023, date(2024, 3, 1))
        self.assertTrue(ttm.available)
        self.assertAlmostEqual(ttm.value, annual.value, places=2)

    def test_ttm_uses_no_future_quarters(self):
        early = self.resolver.ttm("revenue", date(2023, 6, 1))
        late = self.resolver.ttm("revenue", date(2025, 6, 1))
        self.assertTrue(early.available)
        self.assertTrue(late.available)
        self.assertLess(early.value, late.value)

    def test_ttm_is_a_sum_of_four_quarters(self):
        ttm = self.resolver.ttm("revenue", date(2024, 6, 1))
        self.assertEqual(ttm.provenance.transformation, TRANSFORM_SUM)

    def test_ttm_reports_insufficient_history_at_the_start_of_the_record(self):
        ttm = self.resolver.ttm("revenue", date(2020, 3, 1))
        self.assertFalse(ttm.available)
        self.assertEqual(ttm.reason, INSUFFICIENT_HISTORY)
        self.assertIsNone(ttm.value)

    def test_ttm_ending_rebuilds_the_prior_year_window(self):
        current = self.resolver.ttm_ending("revenue", 2023, 4, date(2025, 6, 1))
        prior = self.resolver.ttm_ending("revenue", 2022, 4, date(2025, 6, 1))
        self.assertTrue(current.available and prior.available)
        self.assertGreater(current.value, prior.value)


class MappingIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()

    def test_a_disallowed_unit_is_rejected_not_coerced(self):
        builder = FactsBuilder(2000000004)
        builder.add("us-gaap", "Revenues", "EUR", 100.0, "2023-12-31", "2023-01-01",
                    "acc-1", "10-K", "2024-02-20", fy=2023, fp="FY")
        result, _ = normalize(builder, self.registry, 2000000004)
        self.assertIsNone(result.factbook.get("revenue", 2023, "FY"))
        self.assertIn("UNIT_MISMATCH", [issue["code"] for issue in result.issues])

    def test_a_duration_fact_cannot_fill_an_instant_metric(self):
        builder = FactsBuilder(2000000005)
        builder.add("us-gaap", "Assets", "USD", 100.0, "2023-12-31", "2023-01-01",
                    "acc-1", "10-K", "2024-02-20", fy=2023, fp="FY")
        result, _ = normalize(builder, self.registry, 2000000005)
        self.assertIn("PERIOD_MISMATCH", [issue["code"] for issue in result.issues])

    def test_the_highest_priority_concept_wins_inside_one_filing(self):
        builder = FactsBuilder(2000000006)
        for year in (2022, 2023):
            start, end = f"{year}-01-01", f"{year}-12-31"
            filed = f"{year + 1}-02-20"
            builder.add("us-gaap", "Revenues", "USD", 900.0, end, start,
                        f"acc-{year}", "10-K", filed, fy=year, fp="FY")
            builder.add("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax",
                        "USD", 1000.0, end, start, f"acc-{year}", "10-K", filed,
                        fy=year, fp="FY")
        result, _ = normalize(builder, self.registry, 2000000006)
        resolver = PeriodResolver(result.factbook, self.registry)
        fact = resolver.annual("revenue", 2023, None, policy=POLICY_LATEST_KNOWN)
        self.assertEqual(fact.value, 1000.0)
        self.assertEqual(fact.provenance.concept,
                         "RevenueFromContractWithCustomerExcludingAssessedTax")

    def test_disagreeing_concepts_are_flagged_not_averaged(self):
        builder = FactsBuilder(2000000007)
        for year in (2022, 2023):
            start, end = f"{year}-01-01", f"{year}-12-31"
            filed = f"{year + 1}-02-20"
            builder.add("us-gaap", "Revenues", "USD", 900.0, end, start,
                        f"acc-{year}", "10-K", filed, fy=year, fp="FY")
            builder.add("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax",
                        "USD", 1000.0, end, start, f"acc-{year}", "10-K", filed,
                        fy=year, fp="FY")
        result, _ = normalize(builder, self.registry, 2000000007)
        self.assertIn("CONCEPT_DISAGREEMENT", [issue["code"] for issue in result.issues])

    def test_an_identical_fact_reported_twice_is_deduplicated(self):
        builder = FactsBuilder(2000000008)
        for _ in range(2):
            builder.add("us-gaap", "Revenues", "USD", 100.0, "2023-12-31", "2023-01-01",
                        "acc-1", "10-K", "2024-02-20", fy=2023, fp="FY")
        builder.add("us-gaap", "Revenues", "USD", 90.0, "2022-12-31", "2022-01-01",
                    "acc-0", "10-K", "2023-02-20", fy=2022, fp="FY")
        result, _ = normalize(builder, self.registry, 2000000008)
        self.assertEqual(result.stats["duplicates"], 1)
        self.assertEqual(len(result.factbook.get("revenue", 2023, "FY")), 1)

    def test_an_unmapped_concept_is_counted_not_guessed(self):
        builder = FactsBuilder(2000000009)
        builder.add("us-gaap", "SomeConceptNobodyMapped", "USD", 100.0, "2023-12-31",
                    "2023-01-01", "acc-1", "10-K", "2024-02-20", fy=2023, fp="FY")
        result, _ = normalize(builder, self.registry, 2000000009)
        self.assertEqual(result.stats["unmapped"], 1)
        self.assertEqual(result.stats["mapped"], 0)


class CoverDateInstantTests(unittest.TestCase):
    """A cover date is when the count was taken, not when the period ended.

    `dei:EntityCommonStockSharesOutstanding` is a cover-page disclosure: a 10-K
    for the year ended 26 September 2009 states the share count as of, say, 16
    October 2009. Two live defects came out of that single date:

    1. Asking which quarter 16 October falls into gives the FOLLOWING quarter,
       so the period the number describes got none and the next one got two.
       Fixed by assigning a cover-date instant to the last CLOSED period.
    2. Publishing the cover date as the cell's period end then put two end
       dates under one fiscal quarter -- the cover date, and the balance-sheet
       date the very next filing reports for the same quarter -- and the
       canonical layer suppressed the cell as ambiguous. Measured on live SEC
       data: 136 sharesOutstanding cells across all five companies.

    The period end is taken from what the company itself reported for that
    period. Nothing is interpolated, and a period with no other fact keeps the
    cover date, because then no measured end date exists.
    """

    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()

    @staticmethod
    def _builder(cik, *, with_balance_sheet_fact):
        """One fiscal year ending 2023-12-31, filed 2024-02-20 with a 20-day lag."""
        builder = FactsBuilder(cik)
        builder.add("us-gaap", "Revenues", "USD", 1000.0, "2023-12-31", "2023-01-01",
                    "acc-2023", "10-K", "2024-02-20", fy=2023, fp="FY")
        builder.add("dei", "EntityCommonStockSharesOutstanding", "shares", 500.0,
                    "2024-01-20", None, "acc-2023", "10-K", "2024-02-20",
                    fy=2023, fp="FY")
        if with_balance_sheet_fact:
            builder.add("us-gaap", "CommonStockSharesOutstanding", "shares", 495.0,
                        "2023-12-31", None, "acc-2023", "10-K", "2024-02-20",
                        fy=2023, fp="FY")
        return builder

    def test_a_cover_date_instant_lands_on_the_period_it_describes(self):
        result, _ = normalize(self._builder(2000000021, with_balance_sheet_fact=False),
                              self.registry, 2000000021)
        self.assertIsNotNone(result.factbook.get("shares_outstanding", 2023, "FY"))

    def test_the_period_end_comes_from_the_companys_own_report(self):
        result, _ = normalize(self._builder(2000000022, with_balance_sheet_fact=False),
                              self.registry, 2000000022)
        for period in ("FY", "Q4"):
            timeline = result.factbook.get("shares_outstanding", 2023, period)
            self.assertTrue(timeline, period)
            for observation in timeline.observations:
                self.assertEqual(observation.period_end, "2023-12-31",
                                 "the cover date 2024-01-20 is not a period end")

    def test_one_fiscal_period_carries_exactly_one_period_end(self):
        """The property whose violation made the canonical layer drop the cell."""
        result, _ = normalize(self._builder(2000000023, with_balance_sheet_fact=True),
                              self.registry, 2000000023)
        for period in ("FY", "Q4"):
            timeline = result.factbook.get("shares_outstanding", 2023, period)
            ends = {observation.period_end
                    for observation in (timeline.observations if timeline else [])}
            self.assertEqual(ends, {"2023-12-31"}, period)

    def test_the_cover_date_observation_is_flagged_as_one(self):
        result, _ = normalize(self._builder(2000000024, with_balance_sheet_fact=False),
                              self.registry, 2000000024)
        timeline = result.factbook.get("shares_outstanding", 2023, "FY")
        self.assertIn("COVER_DATE_INSTANT", timeline.observations[0].flags)

    def test_without_any_other_fact_the_cover_date_stands(self):
        """No measured period end exists, so none is invented."""
        builder = FactsBuilder(2000000025)
        builder.add("us-gaap", "Revenues", "USD", 1000.0, "2023-12-31", "2023-01-01",
                    "acc-2023", "10-K", "2024-02-20", fy=2023, fp="FY")
        builder.add("us-gaap", "Revenues", "USD", 1100.0, "2024-12-31", "2024-01-01",
                    "acc-2024", "10-K", "2025-02-20", fy=2024, fp="FY")
        # A cover date inside FY2024 whose quarter reports nothing else.
        builder.add("dei", "EntityCommonStockSharesOutstanding", "shares", 500.0,
                    "2024-04-25", None, "acc-q1", "10-Q", "2024-04-30",
                    fy=2024, fp="Q1")
        result, _ = normalize(builder, self.registry, 2000000025)
        observations = [observation
                        for (metric, year, period), timeline
                        in result.factbook.timelines.items()
                        if metric == "shares_outstanding"
                        for observation in timeline.observations]
        self.assertTrue(observations)
        for observation in observations:
            self.assertEqual(observation.period_end, "2024-04-25")

    def test_a_balance_sheet_instant_keeps_its_own_date(self):
        """Only cover-date instants borrow a period end; nothing else moves."""
        result, _ = normalize(self._builder(2000000026, with_balance_sheet_fact=True),
                              self.registry, 2000000026)
        assets = result.factbook.get("total_assets", 2023, "FY")
        for observation in (assets.observations if assets else []):
            self.assertEqual(observation.period_end, "2023-12-31")


class SectorAvailabilityTests(unittest.TestCase):
    """A bank has no cost of revenue; the system must say so, not invent one."""

    @classmethod
    def setUpClass(cls):
        from quant.sec.model import CompanyProfile
        cls.registry = MetricRegistry.load()
        fy_ends = build_year_ends(date(2019, 12, 31), 7)
        builder, _ = standard_company(2000000010, fy_ends, lambda year: 5000.0)
        cls.profile = CompanyProfile(cik="2000000010", name="SYNTHETIC BANK",
                                     sic="6021", tickers=["SYNB"])
        cls.result, _ = normalize(builder, cls.registry, 2000000010, profile=cls.profile)
        cls.resolver = PeriodResolver(cls.result.factbook, cls.registry)

    def test_the_profile_recognises_a_financial_issuer(self):
        self.assertTrue(self.profile.is_financial)

    def test_gross_profit_is_not_applicable_rather_than_missing(self):
        fact = self.resolver.annual("gross_profit", 2023, None, policy=POLICY_LATEST_KNOWN)
        self.assertFalse(fact.available)
        self.assertEqual(fact.reason, NOT_APPLICABLE_FOR_SECTOR)
        self.assertIsNone(fact.value)
        self.assertIn("SECTOR_RULE_FINANCIALS", fact.flags)

    def test_revenue_still_works_for_a_bank(self):
        fact = self.resolver.annual("revenue", 2023, None, policy=POLICY_LATEST_KNOWN)
        self.assertTrue(fact.available)

    def test_a_non_financial_issuer_is_not_blocked(self):
        from quant.sec.model import CompanyProfile
        profile = CompanyProfile(cik="2000000011", name="SYNTHETIC CHIPS", sic="3674")
        resolver = PeriodResolver(self.result.factbook, self.registry)
        resolver._blocked = self.registry.not_applicable_metrics(profile.sic)
        self.assertEqual(resolver._blocked, {})


if __name__ == "__main__":
    unittest.main()
