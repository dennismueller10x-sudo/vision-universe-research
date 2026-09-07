"""Fiscal calendar: non-calendar years, 53-week years, and the fy/fp trap."""
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.fiscal import FiscalCalendar, classify_duration
from quant.sec.provider import SECProvider
from quant.tests.fixtures import build_year_ends, standard_company


class ClassifyDurationTests(unittest.TestCase):
    def test_instant_has_no_start(self):
        self.assertEqual(classify_duration(None, "2024-01-28"), "instant")

    def test_quarter_half_ninemonth_annual(self):
        cases = [(90, "Q"), (91, "Q"), (98, "Q"), (181, "H"), (182, "H"),
                 (273, "9M"), (272, "9M"), (363, "FY"), (365, "FY"), (371, "FY")]
        start = date(2023, 1, 30)
        for days, expected in cases:
            with self.subTest(days=days):
                self.assertEqual(classify_duration(start, start + timedelta(days=days)),
                                 expected)

    def test_unexpected_duration_is_not_forced_into_a_bucket(self):
        start = date(2023, 1, 30)
        self.assertEqual(classify_duration(start, start + timedelta(days=130)), "UNKNOWN")
        self.assertEqual(classify_duration(start, start + timedelta(days=500)), "UNKNOWN")


class CalendarLearningTests(unittest.TestCase):
    """Each case is a synthetic issuer with a different fiscal calendar shape."""

    def _calendar(self, cik, fy_ends, week_based=False):
        builder, _ = standard_company(cik, fy_ends, lambda year: 1000.0 + year,
                                      week_based=week_based)
        provider = SECProvider(client=None.__class__() if False else _NullClient())
        raw = list(provider.iter_raw_facts(builder.company_facts()))
        return FiscalCalendar.from_raw_facts(str(cik).zfill(10), raw), raw

    def test_non_calendar_january_year_end(self):
        # Fiscal years ending late January, labelled by the calendar year they end in.
        fy_ends = build_year_ends(date(2020, 1, 26), 6, week_based=True)
        calendar, _ = self._calendar(1000000001, fy_ends, week_based=True)
        for fy_end in fy_ends[1:]:
            with self.subTest(fy_end=fy_end):
                self.assertEqual(calendar.fiscal_year_for(fy_end), fy_end.year)
                self.assertEqual(calendar.quarter_index(fy_end), 4)

    def test_september_year_end_quarters(self):
        fy_ends = build_year_ends(date(2019, 9, 28), 6, week_based=True)
        calendar, _ = self._calendar(1000000002, fy_ends, week_based=True)
        previous, fy_end = fy_ends[-2], fy_ends[-1]
        for index in range(1, 5):
            quarter_end = previous + timedelta(days=91 * index)
            with self.subTest(index=index):
                self.assertEqual(calendar.quarter_index(quarter_end), index)
                self.assertEqual(calendar.fiscal_year_for(quarter_end), fy_end.year)

    def test_fifty_three_week_year_still_maps_to_four_quarters(self):
        fy_ends = build_year_ends(date(2019, 9, 28), 6, week_based=True,
                                  fifty_three_week_years=(3,))
        calendar, _ = self._calendar(1000000003, fy_ends, week_based=True)
        long_year_end = fy_ends[3]
        self.assertEqual(calendar.quarter_index(long_year_end), 4)
        self.assertEqual(calendar.fiscal_year_for(long_year_end), long_year_end.year)
        # The 53rd week must not push the year end into the following fiscal year.
        self.assertNotEqual(calendar.fiscal_year_for(long_year_end),
                            long_year_end.year + 1)

    def test_calendar_year_company(self):
        fy_ends = [date(year, 12, 31) for year in range(2018, 2025)]
        calendar, _ = self._calendar(1000000004, fy_ends)
        self.assertEqual(calendar.fiscal_year_for(date(2023, 12, 31)), 2023)
        self.assertEqual(calendar.quarter_index(date(2023, 3, 31)), 1)
        self.assertEqual(calendar.quarter_index(date(2023, 6, 30)), 2)
        self.assertEqual(calendar.quarter_index(date(2023, 9, 30)), 3)
        self.assertEqual(calendar.quarter_index(date(2023, 12, 31)), 4)

    def test_label_offset_is_learned_not_assumed(self):
        """A retailer-style calendar where FY2023 ends in February 2024."""
        from quant.tests.fixtures import FactsBuilder
        builder = FactsBuilder(1000000005)
        fy_ends = [date(2022, 1, 29), date(2023, 1, 28), date(2024, 2, 3)]
        for index in range(1, len(fy_ends)):
            start = fy_ends[index - 1] + timedelta(days=1)
            end = fy_ends[index]
            filed = end + timedelta(days=55)
            accession = f"acc-{index}"
            # The company labels the year ending Feb 2024 as fiscal 2023.
            builder.add("us-gaap", "Revenues", "USD", 100.0 * index, end, start,
                        accession, "10-K", filed, fy=end.year - 1, fp="FY")
        provider = SECProvider(client=_NullClient())
        raw = list(provider.iter_raw_facts(builder.company_facts()))
        calendar = FiscalCalendar.from_raw_facts("1000000005", raw)
        self.assertEqual(calendar.label_offset, -1)
        self.assertEqual(calendar.fiscal_year_for(date(2024, 2, 3)), 2023)

    def test_comparative_facts_are_not_labelled_with_the_filing_year(self):
        """The fy/fp trap: a FY2024 10-K restating FY2022 must not label it 2024."""
        fy_ends = build_year_ends(date(2019, 12, 31), 6)
        calendar, raw = self._calendar(1000000006, fy_ends)
        comparatives = [fact for fact in raw
                        if fact.form == "10-K" and fact.concept == "Revenues"
                        and fact.filing_fy is not None
                        and fact.end[:4] != str(fact.filing_fy)]
        self.assertTrue(comparatives, "fixture must contain comparative facts")
        for fact in comparatives:
            with self.subTest(end=fact.end, filing_fy=fact.filing_fy):
                assigned = calendar.fiscal_year_for(fact.end)
                self.assertNotEqual(assigned, fact.filing_fy)
                self.assertEqual(assigned, int(fact.end[:4]))


class _NullClient:
    """Provider stub: iter_raw_facts never touches the network."""

    def get_json(self, url, use_cache=True):  # pragma: no cover - guard
        raise AssertionError(f"unexpected network call to {url}")


if __name__ == "__main__":
    unittest.main()
