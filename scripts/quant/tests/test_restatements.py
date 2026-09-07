"""The most important tests in this phase: a value must never be visible early."""
import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.model import Provenance, SOURCE_SEC
from quant.sec.restatements import (
    CompanyFactBook, FactTimeline, Observation, POLICY_AS_OF_LATEST,
    POLICY_ORIGINAL, POLICY_LATEST_KNOWN, to_instant,
)


def observation(value, filed, accession="a-1", form="10-Q", available_from=None,
                period_start="2018-01-01", period_end="2018-03-31"):
    provenance = Provenance(source=SOURCE_SEC, taxonomy="us-gaap", concept="Revenues",
                            accession=accession, form=form, filed=filed,
                            available_from=available_from or filed,
                            inputs=[f"us-gaap:Revenues|USD|{period_start}|{period_end}|{accession}"])
    return Observation(value=value, unit="USD", provenance=provenance,
                       available_from=available_from or filed, filed=filed,
                       period_start=period_start, period_end=period_end)


class FutureDataLeakTests(unittest.TestCase):
    """Quarter ends 31 March, 10-Q filed 5 May: usable from 5 May, never before."""

    def setUp(self):
        self.timeline = FactTimeline("revenue", 2018, "Q1")
        self.timeline.add(observation(500.0, "2018-05-05"))

    def test_not_visible_on_the_period_end_date(self):
        self.assertIsNone(self.timeline.resolve(as_of=date(2018, 3, 31)))

    def test_not_visible_the_day_before_filing(self):
        self.assertIsNone(self.timeline.resolve(as_of=date(2018, 5, 4)))

    def test_visible_on_the_filing_date(self):
        resolved = self.timeline.resolve(as_of=date(2018, 5, 5))
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.value, 500.0)

    def test_visible_after_the_filing_date(self):
        self.assertEqual(self.timeline.resolve(as_of=date(2019, 1, 1)).value, 500.0)

    def test_every_day_between_period_end_and_filing_is_blind(self):
        current = date(2018, 3, 31)
        while current < date(2018, 5, 5):
            with self.subTest(as_of=current):
                self.assertIsNone(self.timeline.resolve(as_of=current))
            current = date.fromordinal(current.toordinal() + 1)

    def test_acceptance_timestamp_gives_intraday_precision(self):
        timeline = FactTimeline("revenue", 2018, "Q1")
        timeline.add(observation(500.0, "2018-05-05",
                                 available_from="2018-05-05T16:31:00.000Z"))
        before = datetime(2018, 5, 5, 14, 0, tzinfo=timezone.utc)
        after = datetime(2018, 5, 5, 17, 0, tzinfo=timezone.utc)
        self.assertIsNone(timeline.resolve(as_of=before))
        self.assertEqual(timeline.resolve(as_of=after).value, 500.0)

    def test_lag_days_shifts_visibility_later_never_earlier(self):
        self.assertIsNone(self.timeline.resolve(as_of=date(2018, 5, 5), lag_days=1))
        self.assertEqual(self.timeline.resolve(as_of=date(2018, 5, 6), lag_days=1).value, 500.0)


class RestatementTests(unittest.TestCase):
    def setUp(self):
        self.timeline = FactTimeline("revenue", 2018, "FY")
        self.timeline.add(observation(1000.0, "2019-02-15", accession="a-2019",
                                      form="10-K", period_start="2018-01-01",
                                      period_end="2018-12-31"))
        self.timeline.add(observation(1200.0, "2020-08-10", accession="a-2020",
                                      form="10-K/A", period_start="2018-01-01",
                                      period_end="2018-12-31"))

    def test_backtest_in_2019_sees_only_the_original(self):
        resolved = self.timeline.resolve(as_of=date(2019, 6, 30))
        self.assertEqual(resolved.value, 1000.0)
        self.assertNotIn("RESTATED", resolved.flags)

    def test_after_the_restatement_the_new_value_applies_and_is_flagged(self):
        resolved = self.timeline.resolve(as_of=date(2021, 1, 1))
        self.assertEqual(resolved.value, 1200.0)
        self.assertIn("RESTATED", resolved.flags)

    def test_on_the_restatement_publication_date_the_new_value_applies(self):
        self.assertEqual(self.timeline.resolve(as_of=date(2020, 8, 10)).value, 1200.0)
        self.assertEqual(self.timeline.resolve(as_of=date(2020, 8, 9)).value, 1000.0)

    def test_original_policy_returns_as_first_reported(self):
        resolved = self.timeline.resolve(as_of=date(2021, 1, 1), policy=POLICY_ORIGINAL)
        self.assertEqual(resolved.value, 1000.0)

    def test_original_policy_still_respects_point_in_time(self):
        self.assertIsNone(self.timeline.resolve(as_of=date(2019, 1, 1),
                                                policy=POLICY_ORIGINAL))

    def test_latest_known_policy_ignores_as_of_and_must_be_explicit(self):
        self.assertEqual(self.timeline.resolve(policy=POLICY_LATEST_KNOWN).value, 1200.0)
        with self.assertRaises(ValueError):
            self.timeline.resolve(policy=POLICY_AS_OF_LATEST)

    def test_unknown_policy_is_rejected(self):
        with self.assertRaises(ValueError):
            self.timeline.resolve(as_of=date(2021, 1, 1), policy="whatever_looks_best")

    def test_is_restated_detects_a_material_revision(self):
        self.assertTrue(self.timeline.is_restated())

    def test_reporting_the_same_value_twice_is_not_a_restatement(self):
        timeline = FactTimeline("revenue", 2018, "FY")
        timeline.add(observation(1000.0, "2019-02-15", accession="a"))
        timeline.add(observation(1000.0, "2020-02-15", accession="b"))
        self.assertFalse(timeline.is_restated())
        self.assertNotIn("RESTATED", timeline.resolve(as_of=date(2021, 1, 1)).flags)


class ConflictTests(unittest.TestCase):
    def test_two_values_available_at_the_same_instant_are_flagged(self):
        timeline = FactTimeline("revenue", 2018, "FY")
        timeline.add(observation(1000.0, "2019-02-15", accession="a-1", form="10-K"))
        timeline.add(observation(1100.0, "2019-02-15", accession="a-2", form="10-K/A"))
        resolved = timeline.resolve(as_of=date(2019, 3, 1))
        self.assertIn("CONFLICTING_FACTS", resolved.flags)
        self.assertEqual(resolved.quality, "MEDIUM")

    def test_the_amendment_wins_a_same_day_tie(self):
        timeline = FactTimeline("revenue", 2018, "FY")
        timeline.add(observation(1000.0, "2019-02-15", accession="a-1", form="10-K"))
        timeline.add(observation(1100.0, "2019-02-15", accession="a-2", form="10-K/A"))
        self.assertEqual(timeline.resolve(as_of=date(2019, 3, 1)).value, 1100.0)


class FactBookTests(unittest.TestCase):
    def test_resolve_returns_none_for_an_unknown_cell(self):
        book = CompanyFactBook("0000000001")
        self.assertIsNone(book.resolve("revenue", 2020, "Q1", as_of=date(2021, 1, 1)))

    def test_metrics_and_years_are_reported_from_stored_cells(self):
        book = CompanyFactBook("0000000001")
        book.add_observation("revenue", 2020, "FY", observation(1.0, "2021-02-01"))
        book.add_observation("net_income", 2021, "FY", observation(2.0, "2022-02-01"))
        self.assertEqual(book.metrics(), ["net_income", "revenue"])
        self.assertEqual(book.fiscal_years(), [2020, 2021])
        self.assertEqual(book.fiscal_years(metric="revenue"), [2020])


class InstantConversionTests(unittest.TestCase):
    def test_a_bare_date_as_of_covers_the_whole_day(self):
        self.assertEqual(to_instant(date(2024, 5, 5), end_of_day=True).hour, 23)
        self.assertEqual(to_instant(date(2024, 5, 5)).hour, 0)

    def test_naive_timestamps_are_treated_as_utc(self):
        self.assertEqual(to_instant("2024-05-05T10:00:00").tzinfo, timezone.utc)

    def test_zulu_suffix_is_parsed(self):
        self.assertEqual(to_instant("2024-05-05T10:00:00Z").hour, 10)


if __name__ == "__main__":
    unittest.main()
