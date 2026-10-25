"""Financial Statement Data Sets complete companyfacts - and only where it has nothing.

SYNTHETIC: every number and CIK below is invented. The data set archive is
built in a temporary directory with the column layout of the SEC files
(sub.txt, tag.txt, num.txt, tab-separated).
"""
import tempfile
import unittest
import zipfile
from datetime import date
from pathlib import Path

from quant.sec import consumer, fsds
from quant.sec.consumer import rowdict as R
from quant.sec.registry import MetricRegistry
from quant.tests.fixtures import FactsBuilder

CIK = 2000000077
SUB = ["adsh", "cik", "name", "form", "period", "fy", "fp", "filed"]
TAG = ["tag", "version", "custom", "abstract", "datatype", "iord", "crdr", "tlabel", "doc"]
NUM = ["adsh", "tag", "version", "ddate", "qtrs", "uom", "segments", "coreg", "value", "footnote"]


def write_fsds(path, subs, nums, tags=()):
    def table(columns, rows):
        return "\t".join(columns) + "\n" + "".join("\t".join(str(row.get(c, "")) for c in columns) + "\n"
                                                   for row in rows)
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("sub.txt", table(SUB, subs))
        archive.writestr("tag.txt", table(TAG, tags))
        archive.writestr("num.txt", table(NUM, nums))
    return str(path)


def history(builder, ends=("2025-09-30", "2025-12-31", "2026-03-31")):
    """Quarters companyfacts already has: month-end periods."""
    starts = {"2025-09-30": "2025-07-01", "2025-12-31": "2025-10-01", "2026-03-31": "2026-01-01"}
    for i, end in enumerate(ends):
        accn = f"0000000077-26-00000{i}"
        builder.add("us-gaap", "Revenues", "USD", 100.0 + i, end, starts[end], accn, "10-Q", end, fy=2026, fp="Q1")
        builder.add("us-gaap", "Assets", "USD", 1000.0, end, None, accn, "10-Q", end, fy=2026, fp="Q1")
    return builder


NEW = "0000000077-26-000099"
NEW_SUB = {"adsh": NEW, "cik": CIK, "name": "SYNTHETIC", "form": "10-Q", "period": "20260630",
           "fy": "2026", "fp": "Q2", "filed": "20260805"}
NEW_NUM = [
    {"adsh": NEW, "tag": "Revenues", "version": "us-gaap/2026", "ddate": "20260630", "qtrs": 1, "uom": "USD", "value": 150},
    {"adsh": NEW, "tag": "Revenues", "version": "us-gaap/2026", "ddate": "20260630", "qtrs": 2, "uom": "USD", "value": 253},
    {"adsh": NEW, "tag": "Assets", "version": "us-gaap/2026", "ddate": "20260630", "qtrs": 0, "uom": "USD", "value": 1100},
    {"adsh": NEW, "tag": "EarningsPerShareDiluted", "version": "us-gaap/2026", "ddate": "20260630", "qtrs": 1, "uom": "USD", "value": 1.25},
    # Not taken: a segment value, a co-registrant value, a company-specific tag.
    {"adsh": NEW, "tag": "Revenues", "version": "us-gaap/2026", "ddate": "20260630", "qtrs": 1, "uom": "USD", "segments": "BusinessSegments=A;", "value": 90},
    {"adsh": NEW, "tag": "Revenues", "version": "us-gaap/2026", "ddate": "20260630", "qtrs": 1, "uom": "USD", "coreg": "Sub", "value": 70},
    {"adsh": NEW, "tag": "Revenues", "version": NEW, "ddate": "20260630", "qtrs": 1, "uom": "USD", "value": 999},
]
TAGS = [{"tag": "EarningsPerShareDiluted", "version": "us-gaap/2026", "datatype": "perShare"}]


class FsdsSupplementTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()
        cls.concepts = {(rule.taxonomy, rule.concept)
                        for metric in (*cls.registry.metrics.values(), *cls.registry.industry_metrics.values())
                        for rule in metric.concepts}

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.archive = write_fsds(Path(self.tmp.name, "2026q3.zip"), [NEW_SUB], NEW_NUM, TAGS)

    def supplement(self):
        return fsds.load_supplement([self.archive], [CIK], concepts=self.concepts)

    def test_values_without_dimension_from_standard_taxonomies(self):
        filing = self.supplement()[f"{CIK:010d}"][NEW]
        values = sorted(filing.values)
        self.assertEqual(values, sorted([
            ("us-gaap", "Revenues", "USD", "2026-06-30", "2026-04-01", 150.0),
            ("us-gaap", "Revenues", "USD", "2026-06-30", "2026-01-01", 253.0),
            ("us-gaap", "Assets", "USD", "2026-06-30", None, 1100.0),
            ("us-gaap", "EarningsPerShareDiluted", "USD/shares", "2026-06-30", "2026-04-01", 1.25)]))

    def test_a_filing_companyfacts_lacks_completes_the_quarter(self):
        payload = history(FactsBuilder(CIK)).company_facts()
        merged, added = fsds.supplement_company_facts(payload, self.supplement()[f"{CIK:010d}"])
        self.assertEqual(added, [NEW])
        bundle = consumer.build_consumer_bundle(CIK, merged, self.registry, as_of="2026-10-25", tickers=["FSDT"],
                                                security_ids=["ref_FSDT"], name="Fsds Test",
                                                fiscal_year_end_hint="1231")
        revenue = [R(r) for r in bundle["quarterly"]["revenue"]]
        self.assertEqual((revenue[-1]["fy"], revenue[-1]["fp"], revenue[-1]["v"], revenue[-1]["accn"]),
                         (2026, "Q2", 150.0, NEW))
        self.assertEqual(payload["facts"]["us-gaap"]["Revenues"]["units"]["USD"][-1]["val"], 102.0,
                         "the input payload is not modified")

    def test_nothing_companyfacts_has_is_replaced(self):
        builder = history(FactsBuilder(CIK))
        builder.add("us-gaap", "Revenues", "USD", 151.0, "2026-06-30", "2026-04-01", NEW, "10-Q", "2026-08-05")
        merged, added = fsds.supplement_company_facts(builder.company_facts(), self.supplement()[f"{CIK:010d}"])
        self.assertEqual(added, [])

    def test_a_week_based_issuer_is_not_supplemented(self):
        # 52/53-week calendar: the data sets round the period end to the month end.
        builder = FactsBuilder(CIK)
        for i, (start, end) in enumerate([("2025-06-29", "2025-09-27"), ("2025-09-28", "2025-12-27"),
                                          ("2025-12-28", "2026-03-28")]):
            builder.add("us-gaap", "Revenues", "USD", 100.0, end, start, f"0000000077-26-00001{i}", "10-Q", end)
        merged, added = fsds.supplement_company_facts(builder.company_facts(), self.supplement()[f"{CIK:010d}"])
        self.assertEqual(added, [])
        self.assertFalse(fsds.month_end_calendar({"facts": {}}))

    def test_the_calendar_is_judged_on_recent_main_periods(self):
        def facts(ends):
            builder = FactsBuilder(CIK)
            for i, (start, end, count) in enumerate(ends):
                for k in range(count):
                    builder.add("us-gaap", f"Concept{k}", "USD", 1.0, end, start, f"0000000077-2{i}-000001", "10-Q", end)
            return builder.company_facts()
        # Bis 2022 Wochenperioden, seither Monatsende (wie Cadence): gilt als Monatsende.
        switched = facts([("2022-04-03", "2022-07-02", 12), ("2022-07-03", "2022-10-01", 12),
                          ("2025-01-01", "2025-03-31", 12), ("2025-04-01", "2025-06-30", 12),
                          ("2026-01-01", "2026-03-31", 12)])
        self.assertTrue(fsds.month_end_calendar(switched))
        # Ein einzelner Stichtag mit einem Fakt (wie ein Uebernahmedatum) zaehlt nicht.
        stray = facts([("2025-01-01", "2025-03-31", 12), ("2025-10-01", "2025-11-03", 1),
                       ("2026-01-01", "2026-03-31", 12)])
        self.assertTrue(fsds.month_end_calendar(stray))
        # Aktuelle Wochenperioden (wie Coca-Cola): kein Monatsende.
        weekly = facts([("2025-12-31", "2026-04-03", 12), ("2025-03-29", "2025-06-27", 12)])
        self.assertFalse(fsds.month_end_calendar(weekly))

    def test_other_issuers_and_forms_are_ignored(self):
        other = dict(NEW_SUB, adsh="0000000078-26-000001", cik=2000000078)
        eight_k = dict(NEW_SUB, adsh="0000000077-26-000100", form="8-K")
        archive = write_fsds(Path(self.tmp.name, "x.zip"), [other, eight_k],
                             [dict(NEW_NUM[0], adsh=other["adsh"]), dict(NEW_NUM[0], adsh=eight_k["adsh"])])
        self.assertEqual(fsds.load_supplement([archive], [CIK], concepts=self.concepts), {})

    def test_recent_quarters_and_period_start(self):
        self.assertEqual(fsds.recent_quarters(date(2026, 10, 25)), ["2026q3", "2026q2", "2026q1", "2025q4"])
        self.assertEqual(fsds.recent_quarters(date(2026, 1, 5), 2), ["2025q4", "2025q3"])
        self.assertEqual(fsds._start_for("2026-03-31", 4), "2025-04-01")
        self.assertEqual(fsds._start_for("2026-02-28", 2), "2025-09-01")

    def test_an_unpublished_quarter_is_skipped(self):
        class Client:
            def download_to(self, url, path):
                if "2026q3" in url:
                    raise RuntimeError("HTTP 404")
                Path(path).parent.mkdir(parents=True, exist_ok=True)
                Path(path).write_bytes(b"zip")
                return Path(path), 3, False
        paths = fsds.fetch_recent(Client(), self.tmp.name, date(2026, 10, 2), count=2, log=lambda *_: None)
        self.assertEqual([Path(p).name for p in paths], ["2026q2.zip"])


if __name__ == "__main__":
    unittest.main()
