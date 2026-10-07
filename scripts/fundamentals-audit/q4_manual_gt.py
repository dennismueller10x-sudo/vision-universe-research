"""Manuelle SEC-Ground-Truth (Primaerdaten der Einreichung) fuer abgeleitete Q4-EPS.

Stichprobe aus der ENTWICKLUNGS-Partition (q4_rule_evidence.py): Beobachtungen, die alle Vertraeglichkeitsbedingungen
erfuellen, getrennt nach "abgeleitet = gemeldet" (Kontrolle) und "abgeleitet != gemeldet" (Streitfall). Je Fall wird die
XBRL-Instanz der 10-K-Einreichung gelesen (sec_filing_xbrl.py) und festgestellt:
  - alle Dreimonats-Werte je Aktie fuer Q4 in dieser Einreichung (inkl. fortgefuehrte/aufgegebene Bereiche, Dimensionen)
  - die Quartalstabelle derselben Einreichung (Q1-Q4 gemeldet) und ihr Abgleich mit dem gemeldeten FY
Klassen:
  FILING_CONSISTENT_DERIVATION_RIGHT   abgeleitet = gemeldet (Kontrolle)
  FILER_TABLE_INCONSISTENT            die Quartalswerte der Einreichung ergeben ihr eigenes FY nicht (> 0,03); ein anderer
                                      Q4-Wert je Aktie derselben Einreichung (z. B. fortgefuehrte Bereiche) entspricht der
                                      Ableitung oder die Ableitung ist mit FY und 9M konsistent -> gemeldetes Q4 fehlerhaft getaggt
  QUARTERS_RESTATED                   die Q1-Q3 der 10-K-Tabelle weichen von den 10-Q-Erstmeldungen ab (Neudarstellung)
  DERIVATION_WRONG                    Tabelle in sich konsistent, Ableitung trotzdem ausserhalb Toleranz
  python3 q4_manual_gt.py <evidence.jsonl> <cache-dir> <out.json> [--n-dispute 60] [--n-control 40] [--seed 7]
"""
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sec_filing_xbrl import Filing  # noqa: E402

PER_SHARE = ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic",
             "IncomeLossFromContinuingOperationsPerDilutedShare", "IncomeLossFromContinuingOperationsPerBasicShare",
             "IncomeLossFromDiscontinuedOperationsNetOfTaxPerDilutedShare", "IncomeLossFromContinuingOperationsPerBasicAndDilutedShare",
             "IncomeLossFromDiscontinuedOperationsNetOfTaxPerBasicAndDilutedShare", "IncomeLossFromDiscontinuedOperationsNetOfTaxPerBasicShare")
TOL = 0.02


def ok(a, b, tol=TOL):
    return a is not None and b is not None and abs(a - b) <= max(tol, 0.01 * abs(b))


def eligible(r):
    return (r["family"] == "diluted" and r.get("f1") is not None and r.get("f3") is not None
            and abs(r["f1"] - r["f3"]) <= 0.01 and r.get("shareBasis") is not None and r["shareBasis"] < 0.01
            and not r["signMix"] and r.get("q4Accn"))


def days(s, e):
    from datetime import date
    return (date.fromisoformat(e) - date.fromisoformat(s)).days


def main():
    evidence, cache, out_path = sys.argv[1:4]
    opt = lambda k, d: type(d)(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d  # noqa: E731
    rows = [json.loads(line) for line in open(evidence)]
    pool = [r for r in rows if eligible(r)]
    disputes = [r for r in pool if not ok(r["f3"], r["q4"])]
    controls = [r for r in pool if ok(r["f3"], r["q4"])]
    rng = random.Random(opt("--seed", 7))
    sample = ([("dispute", r) for r in rng.sample(disputes, min(opt("--n-dispute", 60), len(disputes)))]
              + [("control", r) for r in rng.sample(controls, min(opt("--n-control", 40), len(controls)))])
    results = []
    for kind, r in sample:
        rec = {"kind": kind, "cik": r["cik"], "fyStart": r["fyStart"], "fyEnd": r["fyEnd"], "fy": r["fy"], "m9": r["m9"], "q123First": r["q123"],
               "q4Reported": r["q4"], "derived": r["f3"], "accn": r["q4Accn"]}
        try:
            facts = Filing(r["cik"], r["q4Accn"], cache).facts(set(PER_SHARE))
        except Exception as exc:  # noqa: BLE001
            rec["class"] = "FILING_NOT_READABLE"; rec["error"] = str(exc)[:200]; results.append(rec); continue
        plain = [f for f in facts if not f["dims"] and f["start"]]
        q4 = [f for f in plain if f["end"] and abs(days(f["end"], r["fyEnd"])) <= 7 and 80 <= days(f["start"], f["end"]) <= 100]
        rec["q4FactsInFiling"] = sorted({(f["concept"], f["value"]) for f in q4})
        table = {}
        for f in plain:
            if f["concept"] in ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted") and 80 <= days(f["start"], f["end"]) <= 100 \
                    and 0 <= days(rec["fyStart"], f["start"]) <= 300:
                table[f["start"]] = f["value"]
        quarters = [table[k] for k in sorted(table)][:4]
        rec["filingQuarterTable"] = quarters
        other_matches = [c for c, v in rec["q4FactsInFiling"] if c not in ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted") and ok(r["f3"], v)]
        if kind == "control":
            rec["class"] = "FILING_CONSISTENT_DERIVATION_RIGHT"
        elif len(quarters) == 4 and abs(sum(quarters) - r["fy"]) > 0.03:
            rec["class"] = "FILER_TABLE_INCONSISTENT"
            rec["otherQ4ConceptMatchesDerived"] = other_matches
        elif len(quarters) == 4 and r["q123"] and any(abs(a - b) > 0.02 for a, b in zip(quarters[:3], r["q123"])):
            rec["class"] = "QUARTERS_RESTATED"
        else:
            rec["class"] = "DERIVATION_WRONG"
        results.append(rec)
        print(kind, r["cik"], r["fyEnd"], rec["class"], flush=True)
    summary = {}
    for rec in results:
        summary[f"{rec['kind']}|{rec['class']}"] = summary.get(f"{rec['kind']}|{rec['class']}", 0) + 1
    json.dump({"schema": "vu-fundamental-q4-manual-gt-1.0.0", "partition": "development", "pool": len(pool),
               "disputesInPool": len(disputes), "summary": summary, "cases": results}, open(out_path, "w"), indent=1)
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
