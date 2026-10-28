#!/usr/bin/env python3
"""V10 TR register: independent stdlib re-computation of the single-title TR ledgers (tr-protocol-1.0.3 "parity").

Reads only the weekly series files and the TR register (recordDate, exDateDerived, payDate, contemporaneous amount) and
recomputes from scratch: series-unit amount from the series' own provider factors, entitlement week, pay week, units, cash and
end value. The JS ledger summary is read only for the final comparison. Not a port of research-portfolio.cjs.
  python3 -I scripts/quant/v10/corporate-actions/check_tr_ledger.py --root . --register <json> --summary <json> --out <json>
"""
import argparse
import hashlib
import json
from fractions import Fraction
from pathlib import Path


def first_on_or_after(dates, d):
    for x in dates:
        if x >= d:
            return x
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--register", required=True)
    ap.add_argument("--summary", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root = Path(a.root)
    reg = json.loads(Path(a.register).read_text())
    summ = json.loads(Path(a.summary).read_text())
    rows, ok_all = [], True
    for s in summ["titles"]:
        if not s.get("runs"):
            rows.append({"ticker": s["ticker"], "state": "NOT_RUN", "note": s.get("note")})
            continue
        t = next(x for x in reg["titles"] if x["ticker"] == s["ticker"])
        doc = json.loads((root / "quant/data/market/discover-series-long" / (t["securityId"] + ".json")).read_text())
        w = s["window"]
        pts = [(d, c) for d, c in doc["points"] if w["from"] <= d <= w["to"]]
        dates = [d for d, _ in pts]
        close = dict(pts)
        execd = dates[1]
        units = 100000.0 / close[execd]
        cash, recv, entitled, credited = 0.0, [], 0, 0
        factors = [(d, f) for d, f in doc["corporateActions"]["splits"]]
        for ev in t["events"]:
            ent = first_on_or_after(dates, ev["exDateDerived"])
            if ent is None or ent <= execd or ent > dates[-1]:
                continue
            f = Fraction(1)
            for d, x in factors:
                if d > ev["exDateDerived"]:
                    f *= Fraction(str(x))
            amt = float(Fraction(ev["amount"]) / f)
            entitled += 1
            recv.append((ev["payDate"], units * amt))
        for d in dates:
            due = [r for r in recv if r[0] <= d]
            cash += sum(v for _, v in due)
            credited += len(due)
            recv = [r for r in recv if r[0] > d]
        end = units * close[dates[-1]] + cash + sum(v for _, v in recv)
        pr_end = units * close[dates[-1]]
        js_tr, js_pr = s["runs"]["TR_PAYDATE"]["endCapital"], s["runs"]["NO_EVENTS"]["endCapital"]
        rel = abs(end - js_tr) / js_tr
        rel_pr = abs(pr_end - js_pr) / js_pr
        ok = rel <= 1e-9 and rel_pr <= 1e-9 and entitled == s["runs"]["TR_PAYDATE"]["eventsEntitled"]
        ok_all &= ok
        rows.append({"ticker": s["ticker"], "window": [w["from"], w["to"]], "pythonTrEnd": end, "jsTrEnd": js_tr, "relDiff": rel, "pythonPrEnd": pr_end, "jsPrEnd": js_pr, "relDiffPr": rel_pr,
                     "entitledPython": entitled, "entitledJs": s["runs"]["TR_PAYDATE"]["eventsEntitled"], "creditedPython": credited, "openReceivablesPython": len(recv),
                     "dividendCash": end - pr_end, "state": "PASS" if ok else "FAIL"})
    rep = {"schemaVersion": "v10-tr-ledger-parity-1.0.0", "evidenceKind": "TECHNICAL_PARITY", "tolerance": "1e-9 relative on end value; entitled event count equal",
           "registerSha256": hashlib.sha256(Path(a.register).read_bytes()).hexdigest(), "summarySha256": hashlib.sha256(Path(a.summary).read_bytes()).hexdigest(),
           "codeSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "status": "PASS" if ok_all else "FAIL", "titles": rows,
           "note": "A second language is not a holdout; this proves only that the ledger arithmetic on register + series is reproducible."}
    Path(a.out).write_text(json.dumps(rep, indent=1) + "\n")
    print(rep["status"], [(r["ticker"], r["state"]) for r in rows])


if __name__ == "__main__":
    main()
