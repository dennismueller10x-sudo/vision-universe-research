"""Ursachenklassifikation der Holdout-Fehlschlaege (Auswertung v3, unveraendert) - kein Nachbessern am Holdout.

Je fehlgeschlagener Beobachtung aus Primaerdaten (companyfacts):
  FALSE_AVAILABLE: Fenster des Kerns zum frueheren Stichtag vs. Wahrheitsfenster - weicht nur ein Quartalsende um
                   <= 7 Tage ab (52/53-Wochen-Ende neben Kalenderende), ist es dasselbe Quartal (TRUTH_END_VARIANT),
                   sonst CORE_EARLY.
  WRONG_VALUE:     Kern mit Policy ORIGINAL (Erstmeldung je Periode) zum selben Stichtag - stimmt sie mit der Wahrheit
                   ueberein, misst die Abweichung die Sicht (LATEST zum Stichtag vs. Erstmeldung): VIEW_RESTATED;
                   sonst VALUE_DIFFERS.
  WRONG_CONCEPT:   Konzepte der vier Quartale (Kern-Befund, keine Messfrage).
  python3 ttm_holdout_failures.py <companyfacts.zip> <hold-dir> <out.json>
"""
import glob
import json
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from ttm_holdout_eval import FAMILIES, first_reports, hide_q4, resolver_for, truth_windows  # noqa: E402
from quant.sec.provider import SECProvider  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402
from quant.sec.restatements import POLICY_ORIGINAL  # noqa: E402


def main():
    archive, hold_dir, out_path = sys.argv[1:4]
    rows = [json.loads(line) for f in sorted(glob.glob(f"{hold_dir}/s*.jsonl")) for line in open(f)]
    fails = [r for r in rows if r["class"] in ("FALSE_AVAILABLE", "WRONG_VALUE", "WRONG_CONCEPT")]
    by_cik = defaultdict(list)
    for r in fails:
        by_cik[r["cik"]].append(r)
    zf = zipfile.ZipFile(archive)
    registry = MetricRegistry.load()
    provider = SECProvider.__new__(SECProvider)
    out = []
    for cik, items in sorted(by_cik.items()):
        cf = json.loads(zf.read(f"CIK{cik}.json"))
        for experiment in ("A", "B"):
            todo = [r for r in items if r["experiment"] == experiment]
            if not todo:
                continue
            calendar, resolver = resolver_for(cik, cf if experiment == "A" else hide_q4(cf), registry, provider)
            for r in todo:
                metric = r["metric"]
                reports = first_reports(cf, FAMILIES[metric])
                four = next(w for w in truth_windows(reports) if w[-1][1] == r["end"])
                fy, q = calendar.fiscal_year_for(r["end"]), calendar.quarter_index(r["end"])
                rec = dict(r)
                if r["class"] == "FALSE_AVAILABLE":
                    early = (date.fromisoformat(r["known"]) - timedelta(days=1)).isoformat()
                    ends = []
                    for step in range(4):
                        y, i = resolver.step_back(fy, q, step)
                        o = resolver.quarter_grid(metric, y, early).get(i)
                        ends.append(str(o.period_end)[:10] if o else None)
                    truth_ends = [p[1] for p in reversed(four)]
                    shifts = [abs((date.fromisoformat(a) - date.fromisoformat(b)).days) for a, b in zip(ends, truth_ends) if a]
                    rec["coreEnds"], rec["truthEnds"] = ends, truth_ends
                    rec["cause"] = "TRUTH_END_VARIANT" if shifts and max(shifts) <= 7 and any(s > 0 for s in shifts) else "CORE_EARLY"
                elif r["class"] == "WRONG_VALUE":
                    original = resolver.ttm_ending(metric, fy, q, r["known"], policy=POLICY_ORIGINAL)
                    rec["coreOriginal"] = original.value if original.available else None
                    ok = original.available and (abs(original.value - r["truth"]) <= 0.02 or abs(original.value - r["truth"]) <= 0.01 * abs(r["truth"]))
                    rec["cause"] = "VIEW_RESTATED" if ok else "VALUE_DIFFERS"
                else:
                    rec["cause"] = "CONTINUING_CLASS_WINDOW"
                out.append(rec)
    summary = Counter((r["experiment"], r["class"], r["cause"]) for r in out)
    json.dump({"schema": "vu-fundamental-ttm-holdout-failures-1.0.0", "evaluator": "ttm_holdout_eval.py v3 (unveraendert)",
               "summary": {"|".join(k): v for k, v in sorted(summary.items())}, "cases": out},
              open(out_path, "w"), indent=0, default=str)
    for k, v in sorted(summary.items()):
        print(k, v)


if __name__ == "__main__":
    main()
