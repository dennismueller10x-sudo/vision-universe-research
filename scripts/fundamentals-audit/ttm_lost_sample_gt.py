"""Manuelle SEC-Ground-Truth fuer die TTM-Verlustpopulation (Auftrag Abschnitte 7 und 9).

Stratifizierte Stichprobe (Seed fest) aus ttm_loss_taxonomy.py: je Emittent wird die 10-K-Einreichung gelesen, die das
fehlende Q4 abschliesst (Primaerdaten, XBRL-Instanz), und festgestellt:
  1. Existieren vier Quartals-EPS? (Q1-Q3 aus 10-Q, Q4: irgendein Dreimonatswert je Aktie in der 10-K-Einreichung -
     nicht-dimensional, dimensional (z. B. Aktiengattung) oder unter einem eigenen Namespace)
  2. Welche Tags, verwaessert/unverwaessert, Standalone/YTD
  3. Ist Q4 aus FY und 9M derselben Konzeptfamilie bei vertraeglicher Aktienbasis rekonstruierbar?
Strata: Inland/Ausland, Aktienbasis FY-vs-9M (< 1 %, 1-5 %, >= 5 %, unbekannt), Gewinn/Verlust (FY-EPS), Split-Hinweis.
  python3 ttm_lost_sample_gt.py <companyfacts.zip> <taxonomy.jsonl> <cache-dir> <out.json> [--n 120] [--seed 11]
"""
import json
import random
import sys
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sec_filing_xbrl import Filing  # noqa: E402


def days(s, e):
    return (date.fromisoformat(e) - date.fromisoformat(s)).days


def stratum(r):
    sb = r.get("shareBasisFy9mRelDiff")
    basis = "unknown" if sb is None else "<1%" if sb < 0.01 else "1-5%" if sb < 0.05 else ">=5%"
    q4 = next((s for s in r.get("slots", []) if s["q"] == 4 and s["status"] != "PRESENT"), {})
    sign = "loss" if (q4.get("fyEps") or 0) < 0 else "profit"
    return (r["filer"], basis, sign, bool(r.get("splitTags")))


def main():
    archive, taxonomy, cache, out_path = sys.argv[1:5]
    n = int(sys.argv[sys.argv.index("--n") + 1]) if "--n" in sys.argv else 120
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 11
    rows = [json.loads(line) for line in open(taxonomy)]
    groups = defaultdict(list)
    for r in rows:
        groups[stratum(r)].append(r)
    rng = random.Random(seed)
    sample = []
    # proportional, mindestens 2 je Stratum (soweit vorhanden)
    for key, members in sorted(groups.items(), key=lambda kv: str(kv[0])):
        k = max(2, round(n * len(members) / len(rows)))
        sample.extend(rng.sample(members, min(k, len(members))))
    zf = zipfile.ZipFile(archive)
    results = []
    for r in sample:
        rec = {"cik": r["cik"], "ticker": r["ticker"], "stratum": list(map(str, stratum(r))), "taxonomy": r["primary"]}
        slot = next((s for s in r.get("slots", []) if s["q"] == 4 and s["status"] != "PRESENT"), None)
        if slot is None or not slot.get("end"):
            rec["finding"] = "NO_Q4_SLOT"; results.append(rec); continue
        cf = json.loads(zf.read(f"CIK{r['cik']}.json"))
        eps = [dict(v, tag=t) for t in ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted")
               for v in (cf.get("facts", {}).get("us-gaap", {}).get(t, {}).get("units", {}).get("USD/shares", []))]
        fy = sorted([v for v in eps if v.get("start") and abs(days(v["end"], slot["end"])) <= 7 and days(v["start"], v["end"]) >= 350],
                    key=lambda v: v["filed"])
        if not fy:
            rec["finding"] = "NO_FY_FACT"; results.append(rec); continue
        accn = fy[0]["accn"]
        rec.update({"q4End": slot["end"], "tenK": accn, "fyEps": fy[0]["val"], "fyTag": fy[0]["tag"]})
        try:
            facts = Filing(r["cik"], accn, cache).facts_where(lambda ns, local: "PerShare" in local or "EarningsPerShare" in local)
        except Exception as exc:  # noqa: BLE001
            rec["finding"] = "FILING_NOT_READABLE"; rec["error"] = str(exc)[:200]; results.append(rec); continue
        q4 = [f for f in facts if f["start"] and f["end"] and abs(days(f["end"], slot["end"])) <= 7 and 80 <= days(f["start"], f["end"]) <= 100]
        rec["q4Facts"] = sorted({(f["concept"], ("custom" if "fasb.org" not in f["namespace"] else "us-gaap"),
                                  "dim" if f["dims"] else "plain", f["value"]) for f in q4})
        nine = sorted([v for v in eps if v.get("start") and v["start"] == fy[0]["start"] and 260 <= days(v["start"], v["end"]) <= 285],
                      key=lambda v: v["filed"])
        rec["m9"] = nine[0]["val"] if nine else None
        rec["m9Tag"] = nine[0]["tag"] if nine else None
        rec["shareBasis"] = r.get("shareBasisFy9mRelDiff")
        plain_total = [x for x in rec["q4Facts"] if x[0] in ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted") and x[2] == "plain"]
        if plain_total:
            rec["finding"] = "Q4_PLAIN_IN_FILING_NOT_IN_COMPANYFACTS"
        elif any(x[2] == "dim" for x in rec["q4Facts"]):
            rec["finding"] = "Q4_ONLY_DIMENSIONAL"
        elif any(x[1] == "custom" for x in rec["q4Facts"]):
            rec["finding"] = "Q4_ONLY_CUSTOM_TAG"
        elif rec["q4Facts"]:
            rec["finding"] = "Q4_OTHER_PER_SHARE_ONLY"
        else:
            rec["finding"] = "Q4_NOT_IN_FILING"
        rec["reconstructable"] = bool(rec["m9"] is not None and rec["m9Tag"] == rec["fyTag"] and rec["shareBasis"] is not None and rec["shareBasis"] < 0.01)
        results.append(rec)
        print(rec["ticker"], rec["finding"], rec["reconstructable"], flush=True)
    summary = defaultdict(int)
    for rec in results:
        summary[rec.get("finding")] += 1
        if rec.get("reconstructable"):
            summary["reconstructableUnderStrictBasis"] += 1
    json.dump({"schema": "vu-fundamental-ttm-lost-sample-gt-1.0.0", "population": len(rows), "sample": len(results),
               "summary": dict(summary), "cases": results}, open(out_path, "w"), indent=1, default=list)
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
