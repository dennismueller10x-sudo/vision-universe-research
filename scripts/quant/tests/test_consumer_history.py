"""Consumer history: the fiscal years before the bundle window, from a SYNTHETIC companyfacts payload.

The bundle stays exactly what it was (every product reads its window); the history
holds the older years from the same normalization, so window and history together
are exactly the series a window covering every year would give - nothing added,
nothing estimated, no year twice.
"""
import json
import unittest
from datetime import date

from quant.sec import consumer
from quant.sec.registry import MetricRegistry
from quant.tests.fixtures import build_year_ends, standard_company


def _strip(bundle):
    out = dict(bundle)
    out.pop("generatedAtUtc", None)
    return json.dumps(out, sort_keys=True)


class ConsumerHistoryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()
        cls.fy_ends = build_year_ends(date(2004, 12, 31), 22)   # FY2005 .. FY2026
        cls.builder, cls.expected = standard_company(
            2000000091, cls.fy_ends, lambda year: 1000.0 * (year - 2000))
        cls.payload = cls.builder.company_facts("SYNTHETIC HISTORY ISSUER")
        kw = dict(as_of="2026-09-14", tickers=["SYNH"], security_ids=["ref_SYNH"], name="Synthetic History Issuer")
        cls.bundle = consumer.build_consumer_bundle(2000000091, cls.payload, cls.registry, **kw)
        cls.pair, cls.history = consumer.build_consumer_bundle(2000000091, cls.payload, cls.registry, with_history=True, **kw)
        cls.full = consumer.build_consumer_bundle(2000000091, cls.payload, cls.registry, annual_years=99, **kw)

    def test_bundle_is_unchanged(self):
        self.assertEqual(_strip(self.pair), _strip(self.bundle))
        self.assertLessEqual(len(self.bundle["coverage"]["annualYears"]), consumer.DEFAULT_ANNUAL_YEARS)

    def test_history_holds_only_older_years(self):
        h = self.history
        self.assertEqual(h["schema"], consumer.HISTORY_SCHEMA)
        self.assertEqual(h["consumerSchema"], consumer.SCHEMA)
        self.assertEqual((h["cik"], h["policy"], h["columns"]),
                         (self.bundle["cik"], self.bundle["policy"], self.bundle["columns"]))
        # Byte-stable between runs: no run date, no timestamp.
        self.assertNotIn("asOf", h)
        self.assertNotIn("generatedAtUtc", h)
        first = self.bundle["coverage"]["annualYears"][0]
        self.assertEqual(h["coverage"]["bundleFirstYear"], first)
        years = {row[0] for rows in h["annual"].values() for row in rows}
        self.assertTrue(years, "the fixture has years before the window")
        self.assertLess(max(years), first)
        self.assertEqual(sorted(years), h["coverage"]["annualYears"])

    def test_window_plus_history_is_the_full_series(self):
        for metric, rows in self.full["annual"].items():
            joined = self.history["annual"].get(metric, []) + self.bundle["annual"].get(metric, [])
            self.assertEqual(joined, rows, metric)
        for metric, unit in self.history["units"].items():
            self.assertEqual(unit, self.full["units"][metric], metric)

    def test_history_rows_name_their_filing(self):
        for metric, rows in self.history["annual"].items():
            for r in rows:
                row = consumer.rowdict(r)
                self.assertEqual(row["fp"], "FY")
                self.assertTrue(row["filed"] and row["accn"], metric)
                self.assertLessEqual(row["end"], row["filed"], metric)
        rev = {consumer.rowdict(r)["fy"]: consumer.rowdict(r)["v"] for r in self.history["annual"]["revenue"]}
        for fy, v in rev.items():
            self.assertAlmostEqual(v, self.expected[fy]["annual"], places=2)

    def test_history_is_identical_on_another_day(self):
        _, later = consumer.build_consumer_bundle(2000000091, self.payload, self.registry, as_of="2026-09-21",
                                                  with_history=True)
        self.assertEqual(json.dumps(later, sort_keys=True), json.dumps(self.history, sort_keys=True))

    def test_no_history_when_the_window_covers_every_year(self):
        short = standard_company(2000000092, build_year_ends(date(2019, 12, 31), 6), lambda y: 500.0)[0]
        bundle, history = consumer.build_consumer_bundle(2000000092, short.company_facts(), self.registry,
                                                         as_of="2026-09-14", with_history=True)
        self.assertIsNotNone(bundle)
        self.assertIsNone(history)


class HistoryShardTest(unittest.TestCase):
    """Speicherform: 64 gzip-Scherben statt einer Datei je CIK, byte-reproduzierbar, verlustfrei."""

    def _histories(self):
        return {f"{cik:010d}": {"schema": consumer.HISTORY_SCHEMA, "cik": f"{cik:010d}", "annual": {"revenue": [[2010, "FY", "2010-12-31", float(cik), "2011-02-01", "a", 0]]}}
                for cik in (1750, 320193, 1045810, 64, 128)}

    def test_round_trip_and_reproducible_bytes(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as tmp:
            first = consumer.write_history_shards(tmp, self._histories())
            self.assertEqual(consumer.read_history_shards(tmp), self._histories())
            before = {name: (Path(tmp) / name).read_bytes() for name in first}
            again = consumer.write_history_shards(tmp, consumer.read_history_shards(tmp))
            self.assertEqual(again, first)
            self.assertEqual({name: (Path(tmp) / name).read_bytes() for name in again}, before)

    def test_one_shard_per_cik_bucket_and_nothing_else_left(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "CIK0000001750.json").write_text("{}")
            (Path(tmp) / "63.json.gz").write_bytes(b"stale")
            names = consumer.write_history_shards(tmp, self._histories())
            self.assertEqual(sorted(p.name for p in Path(tmp).iterdir()), names)
            self.assertEqual(consumer.history_shard_key("0000000128"), "00")
            self.assertEqual(consumer.history_shard_key(1045810), f"{1045810 % 64:02d}")
            self.assertIn("00.json.gz", names)
            self.assertLessEqual(len(names), consumer.HISTORY_SHARDS)


if __name__ == "__main__":
    unittest.main()
