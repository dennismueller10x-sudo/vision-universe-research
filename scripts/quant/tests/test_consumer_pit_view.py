"""M-B5: der AS_REPORTED_AT_TIME-Block des Consumer-Bundles (pit) - echte SEC-Restatements.

Historische Consumer lesen je Stichtag den damals bekannten Wert (inklusive bis dahin
eingereichter Korrekturen), nie den heute korrigierten Wert aus dem LATEST_RESTATED-Block.
Fixtures: scripts/quant/tests/fixtures/sec-real/*.json (oeffentliche SEC-Daten).
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.consumer import (PIT_COLUMNS, VIEW_AS_REPORTED_AT_TIME,  # noqa: E402
                                build_consumer_bundle)
from quant.sec.registry import MetricRegistry  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "sec-real"
REGISTRY = MetricRegistry.load()
_CACHE = {}


def bundle(name):
    if name not in _CACHE:
        cf = json.loads((FIXTURES / f"{name}.json").read_text())
        _CACHE[name] = build_consumer_bundle(cf["cik"], cf, REGISTRY, as_of="2026-10-05")
    return _CACHE[name]


def known_at(rows, fy, as_of):
    """Der zum Stichtag bekannte Wert: die juengste Version mit known <= as_of."""
    seen = [r for r in rows if r[0] == fy and r[3] <= as_of]
    return max(seen, key=lambda r: r[3])[2] if seen else None


class PitViewTests(unittest.TestCase):
    def test_block_declares_its_view(self):
        b = bundle("NEOG")
        self.assertEqual(b["pit"]["view"], VIEW_AS_REPORTED_AT_TIME)
        self.assertEqual(b["pit"]["columns"], PIT_COLUMNS)
        self.assertEqual(b["views"]["pit"], VIEW_AS_REPORTED_AT_TIME)

    def test_restatement_neog_revenue_fy2017(self):
        rows = bundle("NEOG")["pit"]["annual"]["revenue"]
        self.assertEqual(known_at(rows, 2017, "2017-07-27"), None, "vor dem 10-K nichts bekannt")
        self.assertEqual(known_at(rows, 2017, "2017-07-28"), 361594000)
        self.assertEqual(known_at(rows, 2017, "2018-10-04"), 361594000, "Korrektur noch nicht eingereicht")
        self.assertEqual(known_at(rows, 2017, "2018-10-05"), 358277000)

    def test_restatement_vfc_revenue_fy2017(self):
        rows = bundle("VFC")["pit"]["annual"]["revenue"]
        versions = sorted((r[3], r[2]) for r in rows if r[0] == 2017)
        self.assertGreater(len(versions), 1, "VFC FY2017 wurde restated (Abspaltung)")
        self.assertAlmostEqual(versions[0][1] / 1e9, 11.81, places=2)
        self.assertAlmostEqual(known_at(rows, 2017, "2020-05-26") / 1e9, 11.81, places=2)
        self.assertAlmostEqual(known_at(rows, 2017, "2020-05-27") / 1e9, 8.39, places=2)

    def test_known_date_is_first_report_not_latest_filing(self):
        """PIPR FY2024: im LATEST-Block traegt die Zeile das Datum der juengsten Wiederholung
        (2026-02-26); bekannt war der Wert seit dem 10-K vom 2025-02-27."""
        b = bundle("PIPR")
        latest_row = next(r for r in b["annual"]["revenue"] if r[0] == 2024)
        pit_rows = [r for r in b["pit"]["annual"]["revenue"] if r[0] == 2024]
        self.assertEqual(min(r[3] for r in pit_rows), "2025-02-27")
        self.assertGreater(latest_row[4], "2025-02-27")

    def test_last_version_equals_latest_block_and_nothing_from_the_future(self):
        for name in ("NEOG", "VFC", "PIPR", "PEP", "DE", "HOV", "NVDA", "OSK"):
            b = bundle(name)
            for metric, rows in b["pit"]["annual"].items():
                latest = {r[0]: r[3] for r in b["annual"].get(metric, [])}
                by_fy = {}
                for r in rows:
                    self.assertLessEqual(r[3], b["asOf"], f"{name} {metric}: known nach as_of")
                    self.assertGreaterEqual(r[3], r[1], f"{name} {metric}: known vor Periodenende")
                    if r[0] not in by_fy or r[3] > by_fy[r[0]][3]:
                        by_fy[r[0]] = r
                for fy, r in by_fy.items():
                    if fy in latest:
                        self.assertEqual(r[2], latest[fy], f"{name} {metric} {fy}: letzte PIT-Version != LATEST")

    def test_versions_only_on_value_change(self):
        for name in ("NEOG", "VFC", "PIPR"):
            for metric, rows in bundle(name)["pit"]["annual"].items():
                by_fy = {}
                for r in sorted(rows, key=lambda r: r[3]):
                    by_fy.setdefault(r[0], []).append(r[2])
                for fy, values in by_fy.items():
                    for a, b in zip(values, values[1:]):
                        self.assertNotEqual(a, b, f"{name} {metric} {fy}: Version ohne Wertaenderung")


if __name__ == "__main__":
    unittest.main()
