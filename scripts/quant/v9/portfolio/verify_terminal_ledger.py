#!/usr/bin/env python3
"""V9 portfolio: independent Decimal reference for the daily terminal-event run.

Rebuilds sessions, bars (excluding post-last-trade carry-forward closes),
dividend events, terminal cash (CRNX) and terminal exchange (LBRDK -> CHTR)
directly from the evidence JSON and repository daily price files, simulates
the cash/unit/receivable journal and compares with the JS results at the end.
Tolerance: relative 1e-9 (see verify_ledger.py for the justification).
"""
import argparse
import hashlib
import json
import sys
from decimal import Decimal as D
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_ledger import ROOT, EVD, TOL, close_at, load, rel, solve_after  # noqa: E402


def build(reg, pay_mode):
    div, term = load(EVD / "dividend-evidence.json"), load(EVD / "terminal-ledger-events.json")
    daily = lambda t: load(ROOT / f"quant/data/market/discover-series/ref_{t}.json")
    p0, p1 = reg["period"]
    dates = [p[0] for p in daily("MSFT")["points"] if p0 <= p[0] <= p1]
    ev = []
    for t in ("MSFT", "NVDA"):
        for e in next(c for c in div["companies"] if c["ticker"] == t)["events"]:
            if dates[0] <= e["recordDate"] <= dates[-1]:
                ev.append({"id": f"{t}:DIV:{e['recordDate']}", "k": "ref_" + t, "type": "CASH_DIVIDEND", "eff": e["recordDate"], "pay": e["payDate"], "amount": D(e["amount"])})
    last = {}
    for e in term["events"]:
        eff = e["closingDate"] if e["type"] == "TERMINAL_CASH" else next(d for d in dates if d > e["closingDate"])
        last["ref_" + e["ticker"]] = dates[dates.index(eff) - 1]
        ev.append({"id": f"{e['ticker']}:{e['type']}:{e['closingDate']}", "k": "ref_" + e["ticker"], "type": e["type"], "eff": eff,
                   "pay": dates[-1] if pay_mode == "CONSERVATIVE" else eff, "amount": D(e["cashPerShare"]),
                   "succ": "ref_" + e["successor"] if e["successor"] else None, "ratio": D(e["shareRatio"]) if e["shareRatio"] else None})
    ev.sort(key=lambda e: (e["eff"], e["id"]))
    px = {}
    for t in ("MSFT", "NVDA", "CRNX", "LBRDK", "CHTR"):
        k = "ref_" + t
        px[k] = {p[0]: D(str(p[1])) for p in daily(t)["points"] if p[0] in set(dates) and (k not in last or p[0] <= last[k])}
    return dates, ev, px, last


def simulate(reg, dates, ev, px, targets):
    init = D(reg["initialCapital"])
    fee_r, slip_r = D(reg["costs"]["feeBps"]) / 10000, D(reg["costs"]["slippageBps"]) / 10000
    rate = fee_r + slip_r
    cash, hold, recv, out, ledger, ntr = init, {}, [], [], [], 0
    for d in dates:
        for e in [e for e in ev if e["eff"] == d]:
            u = hold.get(e["k"], D(0))
            if u and e["amount"]:
                recv.append((u * e["amount"], e["pay"]))
            if e["type"].startswith("TERMINAL"):
                hold.pop(e["k"], None)
                if e["type"] == "TERMINAL_EXCHANGE" and u:
                    hold[e["succ"]] = hold.get(e["succ"], D(0)) + u * e["ratio"]
            ledger.append((d, e["id"], u))
        cash += sum((a for a, p in recv if p <= d), D(0))
        recv = [(a, p) for a, p in recv if p > d]
        marked = {k: u * px[k][d] for k, u in hold.items()}
        claims = sum((a for a, _ in recv), D(0))
        before = cash + claims + sum(marked.values(), D(0))
        if d in targets:
            w = {k: D(str(v)) for k, v in targets[d].items()}
            after = solve_after(before, marked, w, rate)
            keys = set(marked) | set(w)
            cost = sum(abs(w.get(k, D(0)) * after - marked.get(k, D(0))) for k in keys) * rate
            if sum(w.values()) * after > (before - claims) - cost + D("1e-9") * init:
                return {"error": "UNSETTLED_CASH_NOT_INVESTABLE", "date": d}
            for k in sorted(keys):
                delta = w.get(k, D(0)) * after - marked.get(k, D(0))
                if abs(delta) <= D("1e-12") * init:
                    continue
                n = abs(delta)
                cash -= delta + n * rate
                hold[k] = hold.get(k, D(0)) + delta / px[k][d]
                if abs(hold[k]) <= D("1e-12"):
                    del hold[k]
                ntr += 1
        out.append((d, cash + claims + sum(u * px[k][d] for k, u in hold.items()), cash, claims))
    return {"equity": out, "ledger": ledger, "trades": ntr, "end": out[-1][1]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--private", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    priv = Path(a.private)
    reg = load(priv / "registration.json")
    summ = load(priv / "summary.json")
    rep = {"schemaVersion": "v9-portfolio-terminal-parity-1.0.0", "tolerance": str(TOL), "registrationHash": reg["registrationHash"], "runs": {},
           "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    ok = True
    for name, mode, rebal in [("HOLD_CONSERVATIVE", "CONSERVATIVE", False), ("HOLD_OPTIMISTIC_UNSOURCED", "OPTIMISTIC", False),
                              ("REBAL_CONSERVATIVE", "CONSERVATIVE", True), ("REBAL_OPTIMISTIC_UNSOURCED", "OPTIMISTIC", True)]:
        dates, ev, px, last = build(reg, mode)
        targets = {dates[1]: {"ref_MSFT": 0.225, "ref_NVDA": 0.225, "ref_CRNX": 0.225, "ref_LBRDK": 0.225}}
        if rebal:
            d2 = reg["secondRebalance"]["decisionDate"]
            targets[dates[dates.index(d2) + 1]] = {"ref_MSFT": 0.3, "ref_NVDA": 0.3, "ref_CHTR": 0.3}
        py = simulate(reg, dates, ev, px, targets)
        inp = load(priv / f"{name}-input.json")
        js_ev = sorted((e["id"], e["effectiveDate"], e["payDate"], str(e["amount"])) for l in inp["listings"] for e in l["events"])
        py_ev = sorted((e["id"], e["eff"], e["pay"], str(float(e["amount"]))) for e in ev)
        js_last = {l["listingId"]: l["lastTradeDate"] for l in inp["listings"] if l["lastTradeDate"]}
        row = {"inputEventsMatch": [x[:3] for x in js_ev] == [x[:3] for x in py_ev] and all(D(a[3]) == D(b[3]) for a, b in zip(js_ev, py_ev)),
               "lastTradeDatesMatch": js_last == last, "events": len(py_ev)}
        if "error" in py:
            row.update({"python": py["error"], "js": summ["runs"][name].get("error")})
            row["match"] = row["python"] == row["js"]
        else:
            js = load(priv / f"{name}-result.json")
            dev = max(rel(e["value"], v) for e, (_, v, _, _) in zip(js["equity"], py["equity"]))
            rdev = max(rel(e["receivables"], r) for e, (_, _, _, r) in zip(js["equity"], py["equity"]))
            led = [(x["date"], x["eventId"], x["entitlementUnits"]) for x in js["eventLedger"]]
            ldev = max([rel(x[2], y[2]) for x, y in zip(led, py["ledger"])] or [D(0)])
            row.update({"pythonEnd": str(py["end"]), "jsEnd": js["endCapital"], "maxEquityRelDiff": str(dev), "maxReceivableRelDiff": str(rdev),
                        "maxEntitlementRelDiff": str(ldev), "ledgerOrderMatch": [x[:2] for x in led] == [x[:2] for x in py["ledger"]],
                        "tradesPython": py["trades"], "tradesJs": len(js["trades"])})
            row["match"] = dev <= TOL and rdev <= TOL and ldev <= TOL and row["ledgerOrderMatch"] and py["trades"] == len(js["trades"])
        row["match"] = bool(row["match"] and row["inputEventsMatch"] and row["lastTradeDatesMatch"])
        ok &= row["match"]
        rep["runs"][name] = row
        print(name, json.dumps(row))
    rep["status"] = "PASS" if ok else "FAIL"
    Path(a.out).write_text(json.dumps(rep, indent=1) + "\n")
    print(rep["status"])


if __name__ == "__main__":
    main()
