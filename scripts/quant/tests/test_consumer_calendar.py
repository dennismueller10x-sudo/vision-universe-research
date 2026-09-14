"""Two defects the bulk run exposed, kept as regressions on synthetic issuers.

1. A 10-Q that carries twelve-month figures (Amazon discloses trailing-twelve-
   month net income and cash flows every quarter) must not split the fiscal
   calendar into six-month "years", relabel quarters, or overwrite the fiscal
   year with a mid-year trailing figure.
2. A metric whose standalone quarters stopped years ago (JPMorgan's revenue
   concept ends in 2014 while net income continues) must not produce a TTM
   that stands next to current TTM figures as if it were current: every TTM
   row of a bundle ends in the same quarter, and a window older than 400 days
   is not "trailing".
"""
import unittest
from datetime import date, timedelta

from quant.sec import consumer
from quant.sec.consumer import rowdict as R
from quant.sec.fiscal import FiscalCalendar
from quant.sec.provider import SECProvider
from quant.sec.registry import MetricRegistry
from quant.tests.fixtures import build_year_ends, standard_company, qend


def _raw(payload):
    provider = SECProvider.__new__(SECProvider)
    return list(SECProvider.iter_raw_facts(provider, payload, availability={}))


class TrailingTwelveMonthsInTenQTest(unittest.TestCase):
    """The Amazon pattern."""

    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()
        cls.fy_ends = build_year_ends(date(2018, 12, 31), 8)     # FY2019 .. FY2025
        cls.builder, cls.expected = standard_company(
            2000000088, cls.fy_ends, lambda year: 1000.0 * (year - 2010))
        # Every 10-Q additionally reports a twelve-month NetIncomeLoss ending
        # on the quarter end, tagged with the filing's own fy/fp - exactly as
        # the bulk archive carries it.
        for index in range(1, len(cls.fy_ends)):
            previous_end, fy_end = cls.fy_ends[index - 1], cls.fy_ends[index]
            fiscal_year = fy_end.year
            for step in range(1, 4):
                quarter_end = qend(previous_end, step)
                filed = quarter_end + timedelta(days=25)
                accession = f"2000000088-{str(fiscal_year)[2:]}-Q{step}"
                ttm_start = quarter_end - timedelta(days=364)
                cls.builder.add("us-gaap", "NetIncomeLoss", "USD", 999999.0, quarter_end, ttm_start,
                                accession, "10-Q", filed, fy=fiscal_year, fp=f"Q{step}")
        cls.payload = cls.builder.company_facts("SYNTHETIC TTM DISCLOSER")
        cls.raw = _raw(cls.payload)
        cls.calendar = FiscalCalendar.from_raw_facts(2000000088, cls.raw)
        cls.bundle = consumer.build_consumer_bundle(
            2000000088, cls.payload, cls.registry, as_of="2026-09-14",
            tickers=["TTMQ"], security_ids=["ref_TTMQ"], name="Synthetic TTM Discloser")

    def test_fiscal_year_boundaries_come_from_annual_reports_only(self):
        # The fixture steps 365 days, so the ends drift across leap years; the
        # point is that ONLY the 10-K year ends exist, none of the quarter ends.
        self.assertEqual(set(self.calendar.fy_ends), set(self.fy_ends[1:]),
                         "a 10-Q twelve-month figure created a fiscal year end")

    def test_a_mid_year_twelve_month_period_is_not_a_fiscal_year(self):
        previous_end, fy_end = self.fy_ends[-2], self.fy_ends[-1]
        q3 = qend(previous_end, 3)
        fy, fp, kind = self.calendar.assign(q3 - timedelta(days=364), q3)
        self.assertEqual(kind, "FY")
        self.assertIsNone(fp, "a trailing twelve-month period must not be labelled FY")
        fy, fp, kind = self.calendar.assign(previous_end + timedelta(days=1), fy_end)
        self.assertEqual((fy, fp), (fy_end.year, "FY"))

    def test_annual_rows_end_on_the_fiscal_year_end_and_keep_the_10k_value(self):
        year_ends = {end.isoformat() for end in self.fy_ends[1:]}
        for metric, rows in self.bundle["annual"].items():
            for row in map(R, rows):
                self.assertIn(row["end"], year_ends, f"{metric} FY{row['fy']} ends {row['end']}")
                self.assertNotEqual(row["v"], 999999.0, f"{metric} FY{row['fy']} took the 10-Q trailing figure")
        latest = R(self.bundle["annual"]["net_income"][-1])
        self.assertEqual(latest["fy"], 2025)
        self.assertAlmostEqual(latest["v"], self.expected[2025]["annual"] * 0.19, places=1)

    def test_quarters_are_labelled_by_the_real_calendar_without_duplicates(self):
        rows = [R(r) for r in self.bundle["quarterly"]["revenue"]]
        ends = [r["end"] for r in rows]
        self.assertEqual(len(ends), len(set(ends)), "a quarter end appears twice")
        expected = {}
        for index in range(1, len(self.fy_ends)):
            previous_end, fy_end = self.fy_ends[index - 1], self.fy_ends[index]
            for step in range(1, 4):
                expected[qend(previous_end, step).isoformat()] = f"Q{step}"
            expected[fy_end.isoformat()] = "Q4"
        for r in rows:
            self.assertEqual(r["fp"], expected.get(r["end"]), r)

    def test_ttm_is_the_sum_of_four_standalone_quarters_not_the_disclosed_figure(self):
        ttm = self.bundle["ttm"]["net_income"]
        self.assertEqual(ttm["kind"], "TTM")
        self.assertNotEqual(ttm["v"], 999999.0)
        self.assertTrue(ttm["through"].startswith("FY2025"))


class StaleTrailingWindowTest(unittest.TestCase):
    """The JPMorgan pattern: one metric's quarters stop years before the others."""

    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()
        fy_ends = build_year_ends(date(2013, 12, 31), 13)         # FY2014 .. FY2025
        builder, cls.expected = standard_company(
            2000000099, fy_ends, lambda year: 1000.0 * (year - 2010), revenue_concept="Revenues")
        payload = builder.company_facts("SYNTHETIC STALE REVENUE")
        # Drop every quarterly (10-Q) revenue fact after 2015: the annual figure
        # in the 10-K stays, the standalone quarters stop.
        facts = payload["facts"]["us-gaap"]["Revenues"]["units"]["USD"]
        payload["facts"]["us-gaap"]["Revenues"]["units"]["USD"] = [
            f for f in facts if f["form"] != "10-Q" or f["end"] < "2016-01-01"]
        cls.bundle = consumer.build_consumer_bundle(
            2000000099, payload, cls.registry, as_of="2026-09-14",
            tickers=["STLE"], security_ids=["ref_STLE"], name="Synthetic Stale Revenue")

    def test_every_ttm_row_ends_in_the_same_quarter(self):
        windows = {v["through"] for v in self.bundle["ttm"].values() if v.get("kind") == "TTM"}
        self.assertEqual(len(windows), 1, f"TTM rows from different windows: {sorted(windows)}")
        self.assertNotIn("revenue", self.bundle["ttm"], "a 2015 trailing window is not trailing")
        self.assertIn("net_income", self.bundle["ttm"])
        self.assertEqual(self.bundle["coverage"]["ttmThrough"], next(iter(windows)))

    def test_the_annual_revenue_series_is_untouched(self):
        rows = [R(r) for r in self.bundle["annual"]["revenue"]]
        self.assertGreaterEqual(len(rows), 10)
        self.assertEqual(rows[-1]["fy"], 2025)


class EntirelyStaleIssuerTest(unittest.TestCase):
    """An issuer whose last quarter is years old has no TTM at all."""

    def test_no_ttm_when_the_newest_window_is_older_than_400_days(self):
        registry = MetricRegistry.load()
        fy_ends = build_year_ends(date(2015, 12, 31), 6)              # FY2016 .. FY2021
        builder, _ = standard_company(2000000100, fy_ends, lambda year: 500.0 * (year - 2010))
        bundle = consumer.build_consumer_bundle(
            2000000100, builder.company_facts("SYNTHETIC DORMANT"), registry, as_of="2026-09-14",
            tickers=["DORM"], security_ids=["ref_DORM"], name="Synthetic Dormant")
        self.assertFalse([k for k, v in bundle["ttm"].items() if v.get("kind") == "TTM"],
                         "a trailing window ending in 2021 is history, not TTM")
        self.assertIsNone(bundle["coverage"]["ttmThrough"])
        self.assertFalse(bundle["coverage"]["horizons"].get("ttm", False))


if __name__ == "__main__":
    unittest.main()
