"""Strang G: Tests für build_sue.py (synthetische Fakten, keine Studienaussage)."""
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_sue as B  # noqa: E402


def fact(start, end, val, filed, form="10-Q"):
    return {"start": start, "end": end, "val": val, "filed": filed, "form": form}


def quarters(vals, restate=None):
    """Quartale 2014Q1.. mit Einreichung 40 Tage nach Ende; restate: {index: (neuer Wert, späteres Einreichungsdatum)}."""
    out = []
    ends = []
    for y in range(2014, 2020):
        for m, s, e in (("01", "01-01", "03-31"), ("04", "04-01", "06-30"), ("07", "07-01", "09-30")):
            ends.append((f"{y}-{s}", f"{y}-{e}"))
    for i, v in enumerate(vals):
        s, e = ends[i]
        y, mo, d = e.split("-")
        filed = f"{y}-{int(mo) + 1:02d}-10"
        out.append(fact(s, e, v, filed))
        if restate and i in restate:
            out.append(fact(s, e, restate[i][0], restate[i][1]))
    return out


class SueTest(unittest.TestCase):
    def test_first_filed_and_point_in_time(self):
        vals = [1.0, 1.1, 1.2, 1.1, 1.3, 1.4, 1.2, 1.5, 1.6, 1.4, 1.9, 1.8, 1.7, 2.5, 2.0]
        ev = B.sue_events(quarters(vals, restate={3: (9.9, "2019-12-01")}))
        self.assertTrue(ev)
        # Ereignisdaten sind Einreichungsdaten und aufsteigend; die spätere Korrektur ändert nichts.
        self.assertEqual(ev, sorted(ev))
        ev2 = B.sue_events(quarters(vals))
        self.assertEqual(ev, ev2)
        # Erstes Ereignis erst mit mindestens vier früheren Differenzen.
        self.assertGreaterEqual(len(vals) - 3 - 4, len(ev) - 1)

    def test_non_quarter_durations_ignored(self):
        f = [fact("2015-01-01", "2015-12-31", 4.0, "2016-02-01", "10-K"), fact("2015-01-01", "2015-06-30", 2.0, "2015-08-01")]
        self.assertEqual(B.quarters(f), {})

    def test_cli_writes_only_outside_repo(self):
        with tempfile.TemporaryDirectory() as d:
            z = Path(d) / "cf.zip"
            payload = {"facts": {"us-gaap": {"EarningsPerShareDiluted": {"units": {"USD/shares": quarters([1, 1.1, 1.2, 1.1, 1.3, 1.4, 1.2, 1.5, 1.6, 1.4, 1.9])}}}}}
            with zipfile.ZipFile(z, "w") as zz:
                zz.writestr("CIK0000000042.json", json.dumps(payload))
            idx = Path(d) / "index.json"
            idx.write_text(json.dumps({"issuers": {"0000000042": {"securityIds": ["ref_X", "dl_1"]}}}))
            out = Path(d) / "sue.json"
            B.main(["--companyfacts", str(z), "--fund-index", str(idx), "--out", str(out)])
            doc = json.loads(out.read_text())
            self.assertEqual(set(doc["events"]), {"ref_X", "dl_1"})
            self.assertEqual(doc["stats"]["withEps"], 1)


if __name__ == "__main__":
    unittest.main()
