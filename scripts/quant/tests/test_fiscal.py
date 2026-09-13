"""Fiscal calendar: non-calendar years, 53-week years, and the fy/fp trap."""
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.fiscal import FiscalCalendar, classify_duration
from quant.sec.model import RawFact
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


def _fact(concept, start, end, form="10-K", fp="FY", fy=2008, accession="a1",
          taxonomy="us-gaap"):
    return RawFact(cik="1", taxonomy=taxonomy, concept=concept, unit="USD", value=1.0,
                   start=start, end=end, accession=accession, form=form,
                   filed="2009-03-01", filing_fy=fy, filing_fp=fp)


class PeriodsOutsideTheLearnedYearsTests(unittest.TestCase):
    """Measured on the store: filers with every concept mapped and no value.

    Their facts were UNPLACEABLE_PERIOD, not UNKNOWN_CONCEPT -- the calendar,
    not the taxonomy, refused them.
    """

    def test_opening_balance_sheet_before_the_first_year_end_is_placed(self):
        # First 10-K: FY2008 income statement plus balance sheets at both ends.
        calendar = FiscalCalendar.from_raw_facts("1", [
            _fact("Revenues", "2008-01-01", "2008-12-31"),
            _fact("Assets", None, "2008-12-31"),
            _fact("Assets", None, "2007-12-31"),
        ])
        self.assertEqual(calendar.anchor_source, "ANNUAL_DURATIONS")
        self.assertEqual(calendar.assign(None, "2007-12-31"), (2007, "FY", "instant"))
        self.assertEqual(calendar.assign(None, "2007-06-30"), (2007, "Q2", "instant"))

    def test_forty_f_comparatives_three_years_back_keep_their_own_labels(self):
        calendar = FiscalCalendar.from_raw_facts("1", [
            _fact("Revenues", "2022-01-01", "2022-12-31", form="40-F", fy=2022),
            _fact("Revenues", "2021-01-01", "2021-12-31", form="40-F", fy=2022),
        ])
        self.assertEqual(calendar.assign("2020-01-01", "2020-12-31"), (2020, "FY", "FY"))
        self.assertEqual(calendar.assign(None, "2019-12-31"), (2019, "FY", "instant"))

    def test_backward_projection_follows_anniversaries_across_leap_years(self):
        # 2008 is a leap year: 2008-12-31 minus 365 days is 2008-01-01, and a
        # 365-day step would have labelled the 2007 opening balance sheet 2008.
        calendar = FiscalCalendar.from_raw_facts("1", [
            _fact("Revenues", "2008-01-01", "2008-12-31"),
        ])
        self.assertEqual(calendar.fiscal_year_for("2007-12-31"), 2007)
        self.assertEqual(calendar.fiscal_year_for("2005-12-31"), 2005)
        self.assertEqual(calendar.fiscal_year_for("2025-12-31"), 2025)

    def test_a_stub_first_year_still_yields_a_year_end_from_the_annual_filing(self):
        # Reporting began in May; the first 20-F covers seven months. No
        # full-year duration exists anywhere, yet the filing says fp=FY and
        # dates its balance sheet on 31 December.
        calendar = FiscalCalendar.from_raw_facts("1", [
            _fact("Revenue", "2008-05-12", "2008-12-31", form="20-F", taxonomy="ifrs-full"),
            _fact("Assets", None, "2008-12-31", form="20-F", taxonomy="ifrs-full"),
            _fact("EntityCommonStockSharesOutstanding", None, "2009-02-15",
                  form="20-F", taxonomy="dei"),
        ])
        self.assertEqual(calendar.anchor_source, "ANNUAL_FILING_INSTANTS")
        self.assertEqual(calendar.fy_ends, [date(2008, 12, 31)])
        self.assertEqual(calendar.labels[date(2008, 12, 31)], 2008)
        self.assertEqual(calendar.assign(None, "2008-12-31"), (2008, "FY", "instant"))
        self.assertEqual(calendar.assign_cover_date("2009-02-15"), (2008, "FY"))
        # The seven-month period is not an annual figure and stays unplaced.
        self.assertEqual(calendar.assign("2008-05-12", "2008-12-31")[2], "UNKNOWN")

    def test_a_cover_date_never_becomes_a_year_end(self):
        calendar = FiscalCalendar.from_raw_facts("1", [
            _fact("EntityCommonStockSharesOutstanding", None, "2009-02-15",
                  form="20-F", taxonomy="dei"),
        ])
        self.assertEqual(calendar.fy_ends, [])
        self.assertEqual(calendar.anchor_source, "NONE")

    def test_registered_year_end_applies_only_to_reported_balance_sheet_dates(self):
        calendar = FiscalCalendar.from_raw_facts("1", [
            _fact("Assets", None, "2008-12-31", form="10-Q", fp="Q3"),
            _fact("Assets", None, "2008-09-30", form="10-Q", fp="Q3"),
        ], fiscal_year_end_hint="1231")
        self.assertEqual(calendar.anchor_source, "REGISTERED_YEAR_END")
        self.assertEqual(calendar.fy_ends, [date(2008, 12, 31)])
        self.assertEqual(calendar.assign(None, "2008-09-30"), (2008, "Q3", "instant"))

    def test_a_ten_q_only_filer_gets_its_year_from_the_comparative_balance_sheet(self):
        # Measured on the store: 35 of the 69 issuers still without a value
        # had filed nothing but 10-Qs. A Q1 10-Q carries the prior year-end
        # balance sheet as comparative, and the SEC registration says which
        # day the year ends -- together that is a calendar, not a guess.
        calendar = FiscalCalendar.from_raw_facts("1", [
            _fact("Assets", None, "2026-03-31", form="10-Q", fp="Q1", fy=2026),
            _fact("Assets", None, "2025-12-31", form="10-Q", fp="Q1", fy=2026),
            _fact("Revenues", "2026-01-01", "2026-03-31", form="10-Q", fp="Q1", fy=2026),
        ], fiscal_year_end_hint="1231")
        self.assertEqual(calendar.anchor_source, "REGISTERED_YEAR_END")
        self.assertEqual(calendar.fy_ends, [date(2025, 12, 31)])
        self.assertEqual(calendar.assign(None, "2025-12-31"), (2025, "FY", "instant"))
        self.assertEqual(calendar.assign(None, "2026-03-31"), (2026, "Q1", "instant"))
        self.assertEqual(calendar.assign("2026-01-01", "2026-03-31"), (2026, "Q1", "Q"))

    def test_a_registered_year_end_across_the_calendar_boundary_still_matches(self):
        # Registered 0101 (Elmet) or 0103 (a 52/53-week retailer): the
        # balance sheet is dated on the far side of New Year.
        elmet = FiscalCalendar.from_raw_facts("1", [
            _fact("Assets", None, "2025-12-31", form="10-Q", fp="Q1", fy=2026),
        ], fiscal_year_end_hint="0101")
        self.assertEqual(elmet.fy_ends, [date(2025, 12, 31)])
        retailer = FiscalCalendar.from_raw_facts("2", [
            _fact("Assets", None, "2026-01-03", form="10-Q", fp="Q1", fy=2026),
            _fact("Assets", None, "2026-04-04", form="10-Q", fp="Q1", fy=2026),
        ], fiscal_year_end_hint="0103")
        self.assertEqual(retailer.fy_ends, [date(2026, 1, 3)])
        self.assertEqual(retailer.assign(None, "2026-04-04")[1], "Q1")

    def test_a_filer_with_no_report_on_a_year_end_gets_the_registered_year_projected(self):
        # A SPAC formed in March: 10-Qs for Q2 and Q3, nothing dated on a
        # year end yet. The registered day (1231) brackets what it reported.
        calendar = FiscalCalendar.from_raw_facts("1", [
            _fact("Assets", None, "2025-06-30", form="10-Q", fp="Q2", fy=2025),
            _fact("Assets", None, "2025-09-30", form="10-Q", fp="Q3", fy=2025),
            _fact("GeneralAndAdministrativeExpense", "2025-03-12", "2025-06-30",
                  form="10-Q", fp="Q2", fy=2025),
        ], fiscal_year_end_hint="1231")
        self.assertEqual(calendar.anchor_source, "REGISTERED_YEAR_END_PROJECTED")
        self.assertEqual(calendar.fy_ends, [date(2024, 12, 31)])
        self.assertEqual(calendar.assign(None, "2025-06-30"), (2025, "Q2", "instant"))
        self.assertEqual(calendar.assign(None, "2025-09-30"), (2025, "Q3", "instant"))
        # Inception-to-date is not a quarter and stays unplaced, with reason.
        self.assertEqual(calendar.assign("2025-03-12", "2025-06-30")[2], "UNKNOWN")

    def test_the_anchor_source_survives_a_round_trip_through_the_store(self):
        calendar = FiscalCalendar.from_raw_facts("1", [
            _fact("Assets", None, "2008-12-31", form="20-F"),
        ])
        rebuilt = FiscalCalendar.from_dict(calendar.to_dict())
        self.assertEqual(rebuilt.anchor_source, "ANNUAL_FILING_INSTANTS")
        self.assertEqual(rebuilt.fy_ends, calendar.fy_ends)


class _NullClient:
    """Provider stub: iter_raw_facts never touches the network."""

    def get_json(self, url, use_cache=True):  # pragma: no cover - guard
        raise AssertionError(f"unexpected network call to {url}")


class FiscalYearLabelTests(unittest.TestCase):
    """A fiscal-year label that cannot be true must not be trusted.

    Found in the release audit against real NVDA data. The label comes from the
    annual filing's own `fy` field, but `fy` describes the FILING, not the fact
    — the trap this pipeline avoids everywhere else. NVDA's 10-Ks for the years
    ending January 2011 through January 2014 tag it one year low, and taking
    that at face value produced:

      2008-01-27 -> FY2008    2012-01-29 -> FY2011  (should be 2012)
      2009-01-25 -> FY2009    2013-01-27 -> FY2012  (should be 2013)
      2010-01-31 -> FY2010    2014-01-26 -> FY2013  (should be 2014)
      2011-01-30 -> FY2010 <- repeated       2015-01-25 -> FY2015

    Two fiscal years labelled 2010, no fiscal year 2014, four years off by one
    — and most of NVDA's ambiguous-period-end suppressions as the visible
    symptom of an invisible cause.
    """

    NVDA_ENDS = [date(2008, 1, 27), date(2009, 1, 25), date(2010, 1, 31),
                 date(2011, 1, 30), date(2012, 1, 29), date(2013, 1, 27),
                 date(2014, 1, 26), date(2015, 1, 25), date(2016, 1, 31)]
    # Exactly what NVDA's filings claim, measured 2026-09-08.
    NVDA_ANCHORS = dict(zip(NVDA_ENDS,
                            [2008, 2009, 2010, 2010, 2011, 2012, 2013, 2015, 2016]))

    def test_the_measured_nvda_sequence_is_repaired(self):
        labels, rejected = FiscalCalendar._label_years(
            self.NVDA_ENDS, self.NVDA_ANCHORS, 0)
        self.assertEqual([labels[end] for end in self.NVDA_ENDS],
                         [2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016])
        self.assertEqual([row[0] for row in rejected],
                         ["2011-01-30", "2012-01-29", "2013-01-27", "2014-01-26"])

    def test_no_two_fiscal_years_share_a_label(self):
        labels, _ = FiscalCalendar._label_years(
            self.NVDA_ENDS, self.NVDA_ANCHORS, 0)
        values = list(labels.values())
        self.assertEqual(len(values), len(set(values)))

    def test_labels_increase_with_the_period_end(self):
        labels, _ = FiscalCalendar._label_years(
            self.NVDA_ENDS, self.NVDA_ANCHORS, 0)
        ordered = [labels[end] for end in self.NVDA_ENDS]
        self.assertEqual(ordered, sorted(ordered))
        self.assertTrue(all(b > a for a, b in zip(ordered, ordered[1:])))

    def test_a_rejected_anchor_is_reported_not_silently_replaced(self):
        _, rejected = FiscalCalendar._label_years(
            self.NVDA_ENDS, self.NVDA_ANCHORS, 0)
        self.assertEqual(rejected[0], ("2011-01-30", 2010, 2011),
                         "the report must name what the filing claimed and what was used")

    def test_a_consistent_anchor_set_is_left_alone(self):
        """The four other validation companies must be unaffected."""
        ends = [date(year, 12, 31) for year in range(2015, 2021)]
        anchors = {end: end.year for end in ends}
        labels, rejected = FiscalCalendar._label_years(ends, anchors, 0)
        self.assertEqual(rejected, [])
        self.assertEqual([labels[end] for end in ends], [e.year for e in ends])

    def test_a_genuine_convention_that_stays_monotonic_is_honoured(self):
        """An anchor disagreeing with the majority offset is still respected.

        A filer may legitimately label the year ending June 2020 as FY2021.
        Only an impossible label is refused, never merely an unusual one.
        """
        ends = [date(2018, 6, 30), date(2019, 6, 30), date(2020, 6, 30)]
        anchors = {ends[0]: 2018, ends[1]: 2019, ends[2]: 2021}
        labels, rejected = FiscalCalendar._label_years(ends, anchors, 0)
        self.assertEqual(rejected, [])
        self.assertEqual(labels[ends[2]], 2021)

    def test_ends_without_an_anchor_use_the_learned_offset(self):
        ends = [date(2018, 6, 30), date(2019, 6, 30), date(2020, 6, 30)]
        labels, rejected = FiscalCalendar._label_years(ends, {}, 1)
        self.assertEqual([labels[end] for end in ends], [2019, 2020, 2021])
        self.assertEqual(rejected, [])


if __name__ == "__main__":
    unittest.main()
