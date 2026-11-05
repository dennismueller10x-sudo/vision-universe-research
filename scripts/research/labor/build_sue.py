"""Strang G: Gewinnüberraschung (SUE) Point-in-Time aus SEC companyfacts. Forschung, nicht zertifiziert.

  python3 scripts/research/labor/build_sue.py --companyfacts companyfacts.zip --fund-index index.json --out sue.json

Regel (docs/research/labor/PROTOKOLL.md §4, §6): Quartals-EPS (us-gaap EarningsPerShareDiluted, ersatzweise
EarningsPerShareBasic, Einheit USD/shares) mit Dauer 80–100 Tage aus 10-Q/10-K (auch /A) in der ZUERST eingereichten
Fassung. Ereignis = Einreichungsdatum des Quartals q. SUE_q = (EPS_q − EPS_q−4) / Std. der letzten bis 8 solchen
Differenzen vor q (mindestens 4). Vorjahresquartal: Periodenende 350–380 Tage früher, Wert wie zuerst eingereicht und
vor dem Ereignis bekannt. Zuordnung CIK -> securityIds über den PIT-Fundamentalindex. Schreibt nur --out.
"""
import argparse
import json
import statistics
import sys
import zipfile
from datetime import date
from pathlib import Path

VERSION = "labor-sue-1.0.0"
FORMS = {"10-Q", "10-K", "10-Q/A", "10-K/A"}
CONCEPTS = ("EarningsPerShareDiluted", "EarningsPerShareBasic")


def d(s):
    return date.fromisoformat(s)


def quarters(facts):
    """{(start, end): (filed, val)} in der zuerst eingereichten Fassung, nur Quartalsdauer."""
    out = {}
    for f in facts:
        if f.get("form") not in FORMS or not f.get("start") or not f.get("end") or not f.get("filed"):
            continue
        try:
            days = (d(f["end"]) - d(f["start"])).days
        except ValueError:
            continue
        if not 80 <= days <= 100 or not isinstance(f.get("val"), (int, float)):
            continue
        key = (f["start"], f["end"])
        if key not in out or f["filed"] < out[key][0]:
            out[key] = (f["filed"], float(f["val"]))
    return out


def sue_events(facts):
    q = quarters(facts)
    rows = sorted(((end, filed, val) for (start, end), (filed, val) in q.items()), key=lambda r: r[0])
    # Doppelte Periodenenden (abweichende Starttage): früheste Einreichung.
    byend = {}
    for end, filed, val in rows:
        if end not in byend or filed < byend[end][0]:
            byend[end] = (filed, val)
    ends = sorted(byend)
    diffs = []  # (end, filed, diff)
    events = []
    for end in ends:
        filed, val = byend[end]
        prior = [e for e in ends if 350 <= (d(end) - d(e)).days <= 380 and byend[e][0] <= filed]
        if not prior:
            continue
        pe = min(prior, key=lambda e: abs((d(end) - d(e)).days - 365))
        diff = val - byend[pe][1]
        hist = [x for (e2, f2, x) in diffs if f2 < filed][-8:]
        if len(hist) >= 4:
            sd = statistics.stdev(hist)
            if sd > 0:
                events.append([filed, diff / sd])
        diffs.append((end, filed, diff))
    events.sort(key=lambda r: r[0])
    return events


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--companyfacts", required=True)
    ap.add_argument("--fund-index", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    root = Path(__file__).resolve().parents[3]
    if Path(a.out).resolve().is_relative_to(root):
        sys.exit("OUT_INSIDE_REPOSITORY")
    index = json.loads(Path(a.fund_index).read_text(encoding="utf-8"))["issuers"]
    wanted = {str(c).zfill(10): e["securityIds"] for c, e in index.items() if e.get("securityIds")}
    out, stats = {}, {"issuers": 0, "withEps": 0, "events": 0}
    with zipfile.ZipFile(a.companyfacts) as z:
        for info in z.infolist():
            n = info.filename
            if not (n.startswith("CIK") and n.endswith(".json")):
                continue
            cik = n[3:-5].zfill(10)
            if cik not in wanted:
                continue
            stats["issuers"] += 1
            gaap = json.loads(z.read(info)).get("facts", {}).get("us-gaap", {})
            ev = []
            for c in CONCEPTS:
                facts = gaap.get(c, {}).get("units", {}).get("USD/shares")
                if facts:
                    ev = sue_events(facts)
                    if ev:
                        break
            if not ev:
                continue
            stats["withEps"] += 1
            stats["events"] += len(ev)
            for sid in wanted[cik]:
                out[sid] = ev
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps({"schema": VERSION, "stats": stats, "events": out}, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"out": a.out, **stats, "securities": len(out)}))


if __name__ == "__main__":
    main()
