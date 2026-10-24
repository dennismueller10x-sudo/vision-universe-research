"""A filer without a 10-K yet: the registered fiscal year end fixes its calendar.

After an IPO a company files 10-Qs for months before its first 10-K. companyfacts
carries those quarters, but without an annual report FiscalCalendar finds no
year end, and the consumer bundle stayed empty (measured 24.10.2026: 167 product
issuers, among them INNIO, Arxis, Madison Air). The SEC pipeline already hands
the registered year end (SEC submissions, quant/data/fundamentals/issuers) to
FiscalCalendar; the consumer now does the same. Filers with an annual report
are unaffected: the hint is only the last resort.
"""
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from quant.sec import consumer
from quant.sec.consumer import rowdict as R
from quant.sec.registry import MetricRegistry
from quant.tests.fixtures import FactsBuilder, build_year_ends, standard_company


def ten_q_only(cik):
    builder = FactsBuilder(cik)
    quarters = [(date(2026, 1, 1), date(2026, 3, 31), date(2026, 5, 12), "Q1", 100.0),
                (date(2026, 4, 1), date(2026, 6, 30), date(2026, 8, 11), "Q2", 120.0)]
    for start, end, filed, fp, revenue in quarters:
        accn = f"{cik}-26-{fp}"
        builder.add("us-gaap", "Revenues", "USD", revenue, end, start, accn, "10-Q", filed, fy=2026, fp=fp)
        builder.add("us-gaap", "NetIncomeLoss", "USD", revenue * 0.1, end, start, accn, "10-Q", filed, fy=2026, fp=fp)
        builder.add("us-gaap", "Assets", "USD", 5000.0, end, None, accn, "10-Q", filed, fy=2026, fp=fp)
        # the comparative year-end balance sheet a first 10-Q carries
        builder.add("us-gaap", "Assets", "USD", 4000.0, date(2025, 12, 31), None, accn, "10-Q", filed, fy=2026, fp=fp)
    return builder.company_facts("SYNTHETIC NEW ISSUER")


class YearEndHintTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()

    def build(self, payload, hint, cik=2000000099):
        return consumer.build_consumer_bundle(cik, payload, self.registry, as_of="2026-10-24",
                                              tickers=["NEWI"], security_ids=["ref_NEWI"], name="New Issuer",
                                              fiscal_year_end_hint=hint)

    def test_without_hint_a_ten_q_only_filer_stays_empty(self):
        bundle = self.build(ten_q_only(2000000099), None)
        self.assertEqual(bundle["quarterly"], {})

    def test_with_the_registered_year_end_its_quarters_appear(self):
        bundle = self.build(ten_q_only(2000000099), "1231")
        rows = [R(r) for r in bundle["quarterly"]["revenue"]]
        self.assertEqual([(r["fy"], r["fp"], r["end"], r["v"]) for r in rows],
                         [(2026, "Q1", "2026-03-31", 100.0), (2026, "Q2", "2026-06-30", 120.0)])
        self.assertEqual(bundle["calendar"]["fiscalYearEnd"], "1231")

    def test_a_filer_with_annual_reports_is_unchanged_by_the_hint(self):
        builder, _ = standard_company(2000000098, build_year_ends(date(2018, 12, 31), 8), lambda y: 1000.0 * (y - 2010))
        payload = builder.company_facts("SYNTHETIC ESTABLISHED ISSUER")
        plain, hinted = self.build(payload, None, 2000000098), self.build(payload, "0630", 2000000098)
        for part in ("annual", "quarterly", "ttm"):
            self.assertEqual(plain[part], hinted[part], part)

    def test_hints_are_read_from_the_issuer_shards(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "099.json").write_text(json.dumps({"shard": "099", "issuers": [
                {"cik": "2000000099", "fiscalYearEnd": "1231"}, {"cik": "2000000098", "fiscalYearEnd": None},
                {"cik": "2000000097", "fiscalYearEnd": "12/31"}]}), encoding="utf-8")
            hints = consumer.load_fiscal_year_end_hints(tmp)
        self.assertEqual(hints, {"2000000099": "1231"})
        self.assertEqual(consumer.load_fiscal_year_end_hints("/nonexistent"), {})


if __name__ == "__main__":
    unittest.main()
