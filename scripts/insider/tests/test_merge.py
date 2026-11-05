"""Rolling-window merge for the daily pipeline; outputs only in TemporaryDirectory."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "merge.py"
spec = importlib.util.spec_from_file_location("merge", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def doc(as_of, rows, start="2026-06-01"):
    return {"schemaVersion": m.SCHEMA, "asOf": as_of, "window": {"filingDateFrom": start, "filingDateTo": as_of[:10]},
            "filingsProcessed": len(rows), "records": len(rows),
            "purchases": [{"id": i, "availableAt": t} for i, t in rows]}


class MergeTests(unittest.TestCase):
    def test_union_dedup_and_window(self):
        prev = doc("2026-06-05T23:59:59Z", [("a", "2026-03-01T00:00:00Z"), ("b", "2026-06-04T00:00:00Z")])
        nxt = doc("2026-06-06T23:59:59Z", [("b", "2026-06-04T00:00:00Z"), ("c", "2026-06-06T00:00:00Z")], start="2026-06-05")
        out = m.merge(prev, nxt, 90)
        self.assertEqual([r["id"] for r in out["purchases"]], ["b", "c"])
        self.assertEqual(out["records"], 2)
        self.assertEqual(out["window"]["filingDateFrom"], "2026-06-01")
        self.assertEqual(out["rollingWindowDays"], 90)

    def test_first_run_without_previous(self):
        out = m.merge(None, doc("2026-06-06T23:59:59Z", [("c", "2026-06-06T00:00:00Z")]), 90)
        self.assertEqual(out["records"], 1)

    def test_fail_closed(self):
        prev = doc("2026-06-06T23:59:59Z", [])
        with self.assertRaises(ValueError):
            m.merge(prev, doc("2026-06-05T23:59:59Z", []), 90)
        bad = doc("2026-06-07T23:59:59Z", [])
        bad["schemaVersion"] = "x"
        with self.assertRaises(ValueError):
            m.merge(prev, bad, 90)

    def test_cli_keeps_previous_on_error(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            out, nxt = root / "out.json", root / "next.json"
            out.write_text(json.dumps(doc("2026-06-06T23:59:59Z", [("a", "2026-06-06T00:00:00Z")])))
            before = out.read_bytes()
            nxt.write_text(json.dumps(doc("2026-06-05T23:59:59Z", [])))
            r = subprocess.run([sys.executable, str(SCRIPT), "--next", str(nxt), "--prev", str(out), "--out", str(out)], capture_output=True)
            self.assertNotEqual(r.returncode, 0)
            self.assertEqual(out.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
