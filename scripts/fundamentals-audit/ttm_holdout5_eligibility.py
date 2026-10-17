"""Holdout-v5-Eligibility-Audit: ungesehene Faelle je Schicht ZAEHLEN (artifacts/FUNDAMENTAL-TTM-HOLDOUT5-ELIGIBILITY-SPEC.json).

Nur Struktur: Perioden, Formulare, Einreichungstage, Konzepte. Es wird weder der Kern ausgefuehrt noch eine Wahrheit
gerechnet, und es werden keine Werte ausgegeben (same_day vergleicht nur, OB zwei Fassungen desselben Tages verschieden
sind). Ausgabe: Anzahlen unabhaengiger Emittenten und Fenster je Schicht.
  python3 ttm_holdout5_eligibility.py <companyfacts.zip> <frame-v4.json> <exclude-v5.json> '<rows-glob v1..v4>' <out.json>
"""
import glob
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import ttm_holdout4_eval as h4  # noqa: E402  (nur Strukturfunktionen: fiscal_years, fiscal_structure, Schwellen)
from quant.sec.provider import TRANSITION_FORMS, VALUE_FORMS  # noqa: E402

FAMILY = h4.FAMILY
SHORT_STUB = (20, 76)
LONG_STUB = (106, 150)
GATED = ("fy_change", "same_day", "stub", "split_year", "amendment_chain", "transition_report")
REPORTED = GATED + ("short_stub", "long_stub", "week52", "tag_switch", "custom", "normal")


def eps_rows(cf):
    rows = []
    gaap = (cf.get("facts") or {}).get("us-gaap") or {}
    for concept in FAMILY:
        for unit, items in ((gaap.get(concept) or {}).get("units") or {}).items():
            if not unit.endswith("/shares"):
                continue
            for r in items:
                if r.get("start") and r["end"] >= h4.TRUTH_SINCE and r.get("form") in VALUE_FORMS \
                        and isinstance(r.get("val"), (int, float)):
                    rows.append(r | {"concept": concept})
    return rows


def clusters_of(rows):
    quarters = sorted((r for r in rows if h4.QUARTER_DAYS[0] <= h4.days(r["start"], r["end"]) <= h4.QUARTER_DAYS[1]),
                      key=lambda r: r["end"])
    out = []
    for r in quarters:
        if out and h4.days(out[-1]["end"], r["end"]) <= 7:
            out[-1]["rows"].append(r)
        else:
            out.append({"end": r["end"], "rows": [r]})
    return out


def strata(four_ends, four, rows, gaps, splits, traits):
    tags = set()
    lo, hi = h4.shift(four_ends[0], -100), h4.shift(four_ends[-1], 7)
    if any(a <= e <= h4.shift(b, 400) for e in four_ends for a, b in gaps):
        tags.add("fy_change")
    if any(h4.shift(a, -400) <= e <= h4.shift(b, 400) for e in four_ends for a, b in splits):
        tags.add("split_year")
    for r in rows:
        length = h4.days(r["start"], r["end"])
        if lo <= r["end"] <= hi:
            if SHORT_STUB[0] <= length <= SHORT_STUB[1]:
                tags.add("short_stub")
            if LONG_STUB[0] <= length <= LONG_STUB[1]:
                tags.add("long_stub")
    if four:
        versions = [max(c["rows"], key=lambda r: (r["filed"], r.get("accn") or "")) for c in four]
        gaps_ok = all(h4.CHAIN_GAP_DAYS[0] <= h4.days(a["end"], b["start"]) <= h4.CHAIN_GAP_DAYS[1]
                      for a, b in zip(versions, versions[1:]))
        span = h4.days(versions[0]["start"], versions[-1]["end"]) + 1
        if not gaps_ok or not h4.SPAN_DAYS[0] <= span <= h4.SPAN_DAYS[1]:
            tags.add("stub")
        all_rows = [r for c in four for r in c["rows"]]
        if any(str(r.get("form")).endswith("/A") for r in all_rows):
            tags.add("amendment_chain")
        if any(r.get("form") in TRANSITION_FORMS for r in all_rows):
            tags.add("transition_report")
        if len({r["concept"] for r in all_rows}) > 1:
            tags.add("tag_switch")
        for c in four:
            by_day = {}
            for r in c["rows"]:
                by_day.setdefault(r["filed"], {}).setdefault(r.get("accn"), r["val"])
            if any(len(set(per.values())) > 1 for per in by_day.values() if len(per) > 1):
                tags.add("same_day")
    if tags & {"short_stub", "long_stub"}:
        tags.add("stub")
    for key in ("week52", "custom"):
        if traits[key]:
            tags.add(key)
    if not tags:
        tags.add("normal")
    return tags


def main():
    archive, frame_path, exclude_path, rows_glob, out_path = sys.argv[1:6]
    frame = json.load(open(frame_path))["ciks"]
    exclude = {str(c).zfill(10) for c in json.load(open(exclude_path))}
    blocked = {}
    for path in sorted(glob.glob(rows_glob)):
        for line in open(path):
            row = json.loads(line)
            if row.get("end"):
                blocked.setdefault(row["cik"], set()).add(row["end"])
    zf = zipfile.ZipFile(archive)
    names = set(zf.namelist())
    universe = [c for c in frame if c not in exclude]
    issuers = {s: set() for s in REPORTED}
    windows_per = Counter()
    total_cases, capped_cases, issuers_with_cases = 0, 0, 0
    for cik in universe:
        if f"CIK{cik}.json" not in names:
            continue
        cf = json.loads(zf.read(f"CIK{cik}.json"))
        rows = eps_rows(cf)
        eps = clusters_of(rows)
        years = h4.fiscal_years(cf)
        gaps, splits = h4.transition_gaps(years), h4.split_years(years)
        traits = h4.issuer_traits(cf, eps, years)
        ends_blocked = blocked.get(cik, ())

        def free(ends):
            return not any(h4.shift(b, -380) <= e <= h4.shift(b, 7) for e in ends for b in ends_blocked)

        cases = [(w[-1]["end"], [c["end"] for c in w], w) for w in h4.windows(eps) if free([c["end"] for c in w])]
        cases += [(n["end"], n["quarters"], None) for n in h4.negative_windows(cf, eps) if free(n["quarters"])]
        if not cases:
            continue
        issuers_with_cases += 1
        total_cases += len(cases)
        capped_cases += min(len(cases), h4.MAX_CASES_PER_ISSUER)
        for _, ends, four in cases:
            for tag in strata(ends, four, rows, gaps, splits, traits):
                issuers[tag].add(cik)
                windows_per[tag] += 1
    result = {
        "schema": "vu-fundamental-ttm-holdout5-eligibility-counts-1.0.0",
        "universe": len(universe), "excluded": len(exclude), "blockedIssuers": len(blocked),
        "blockedWindows": sum(len(v) for v in blocked.values()),
        "issuersWithUnseenCases": issuers_with_cases, "unseenCasesTotal": total_cases,
        "unseenCasesAtMostThreePerIssuer": capped_cases,
        "byStratum": {s: {"issuers": len(issuers[s]), "windows": windows_per[s]} for s in REPORTED},
    }
    json.dump(result, open(out_path, "w"), indent=1)
    print(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
