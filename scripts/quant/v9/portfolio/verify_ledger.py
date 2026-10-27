#!/usr/bin/env python3
"""V9 portfolio: independent Python reference ledger (stdlib only, Decimal).

Extends the convention of scripts/quant/verify-research-portfolio.py (which is
not edited): instead of synthetic fixtures it rebuilds the REAL inputs itself
from the committed evidence files and repository price files -- sessions,
close instants, raw prices from split-adjusted closes and sourced split
ratios, dividend entitlement sessions, pay dates, availability tiers, targets
-- and runs its own cash/unit/receivable journal. The JS outputs are read only
at the end for comparison.

Declared tolerance: relative 1e-9 on every equity value. Justification: the JS
engine uses IEEE-754 doubles over ~600 sessions and an 80-step bisection for
the cost-inclusive target equity; this reference uses 50-digit Decimal and an
exact piecewise-linear solve. Expected float drift is ~1e-13 relative.
"""
import argparse
import datetime
import hashlib
import json
import zoneinfo
from decimal import Decimal, getcontext
from pathlib import Path

getcontext().prec = 50
D = Decimal
ROOT = Path(__file__).resolve().parents[4]
EVD = ROOT / "docs/quant-recovery/v9/portfolio"
NY = zoneinfo.ZoneInfo("America/New_York")
TOL = D("1e-9")


def load(p):
    return json.loads(Path(p).read_text())


CAL = load(ROOT / "quant/config/market-calendar.json")
HOL = set(CAL["exchanges"]["XNYS"]["holidays"])
EARLY = CAL["exchanges"]["XNYS"]["earlyCloses"]


def close_at(d):
    hhmm = EARLY.get(d, "16:00") if d >= CAL["coverage"]["from"] else "16:00"
    h, m = map(int, hhmm.split(":"))
    loc = datetime.datetime.fromisoformat(d).replace(hour=h, minute=m, tzinfo=NY)
    return loc.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def weekdays_back(d, n):
    t = datetime.date.fromisoformat(d)
    while n > 0:
        t -= datetime.timedelta(days=1)
        if t.weekday() < 5 and t.isoformat() not in HOL:
            n -= 1
    return t.isoformat()


def rule_ex(rec):
    return weekdays_back(rec, 0 if rec >= "2024-05-28" else 1 if rec >= "2017-09-07" else 2)


def first_on_or_after(dates, d):
    return next((x for x in dates if x >= d), None)


def ts(x):
    return datetime.datetime.strptime(x[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=datetime.timezone.utc)


def build(reg):
    div, spl = load(EVD / "dividend-evidence.json"), load(EVD / "split-evidence.json")
    U, (p0, p1) = reg["universe"], reg["period"]
    ser = {t: load(ROOT / f"quant/data/market/discover-series-long/ref_{t}.json") for t in U}
    common = set.intersection(*[{p[0] for p in ser[t]["points"]} for t in U])
    dates = [p[0] for p in ser[U[0]]["points"] if p0 <= p[0] <= p1 and p[0] in common]
    closes = {d: close_at(d) for d in dates}
    L = {}
    for t in U:
        splits = [s for s in spl["splits"] if s["ticker"] == t and s["kind"] == "SPLIT"]
        assert all(s["status"] == "SOURCED" for s in splits)
        def factor(d):
            f = D(1)
            for s in splits:
                if s["effectiveDate"] > d:
                    f *= D(str(s["ratio"]))
            return f
        adj = {p[0]: D(str(p[1])) for p in ser[t]["points"] if p[0] in closes}
        raw = {d: adj[d] * factor(d) for d in adj}
        ev = []
        for s in splits:
            eff = first_on_or_after(dates, s["effectiveDate"])
            if dates[0] <= s["effectiveDate"] <= dates[-1]:
                ev.append({"id": f"{t}:SPLIT:{s['effectiveDate']}", "type": "SPLIT", "eff": eff, "ratio": D(str(s["ratio"])), "date": s["effectiveDate"]})
        comp = next(c for c in div["companies"] if c["ticker"] == t)
        for e in comp["events"]:
            ex = rule_ex(e["recordDate"])
            if ex < dates[0] or ex > dates[-1]:
                continue
            eff = first_on_or_after(dates, ex)
            sec = (e.get("firstSecAvailability") or {}).get("acceptanceUtc")
            close = ts(closes[eff])
            if sec and ts(sec) <= close:
                tier = "SEC_ACCEPTANCE"
            elif e.get("declarationDate") and ts(e["declarationDate"] + "T23:59:59") <= close:
                tier = "ISSUER_STATED_DECLARATION_DATE_RETROSPECTIVE"
            else:
                raise SystemExit("EVENT_NOT_AVAILABLE " + t + e["recordDate"])
            ev.append({"id": f"{t}:DIV:{e['recordDate']}", "type": "CASH_DIVIDEND", "eff": eff, "pay": e["payDate"],
                       "amount": D(e["amount"]), "date": ex, "tier": tier})
        L["ref_" + t] = {"raw": raw, "adj": adj, "events": ev}
    return dates, closes, L


def ordered_events(L):
    allev = [(k, e) for k in L for e in L[k]["events"]]
    return sorted(allev, key=lambda ke: (ke[1]["eff"], ke[1]["date"], ke[1]["type"], ke[1]["id"]))


def solve_after(before, marked, weights, rate):
    """Exact solve of after + rate*sum|w_k*after - m_k| = before (piecewise linear, increasing)."""
    keys = sorted(set(marked) | set(weights))
    bps = sorted({marked.get(k, D(0)) / weights[k] for k in keys if weights.get(k, D(0)) > 0} | {D(0), before})
    f = lambda a: a + rate * sum(abs(weights.get(k, D(0)) * a - marked.get(k, D(0))) for k in keys) - before
    lo = D(0)
    for b in bps:
        if b < 0:
            continue
        if f(b) > 0:
            flo, fhi = f(lo), f(b)
            return lo + (b - lo) * (-flo) / (fhi - flo) if fhi != flo else lo
        lo = b
    return lo


def simulate(reg, dates, closes, L, mode, wtotal):
    """mode: TR_PAYDATE | PRICE_ADJUSTED | RAW_SPLITS_ONLY | TR_EXDATE_CASH"""
    init = D(reg["initialCapital"])
    rate = D(reg["costs"]["feeBps"]) / 10000 + D(reg["costs"]["slippageBps"]) / 10000
    fee_r, slip_r = D(reg["costs"]["feeBps"]) / 10000, D(reg["costs"]["slippageBps"]) / 10000
    ids = sorted(L)
    w = {k: D(str(wtotal / len(ids))) for k in ids}  # same double literal the JS target carries
    every = reg["rebalanceEverySessions"]
    execs = {dates[i + 1]: dates[i] for i in range(len(dates) - 1) if i % every == 0}
    cash, hold, recv = init, {}, []
    out, ledger, ntrades = [], [], 0
    fees = D(0)
    for d in dates:
        if mode != "PRICE_ADJUSTED":
            for k, e in ORDERED:
                    if e["eff"] != d:
                        continue
                    if mode == "RAW_SPLITS_ONLY" and e["type"] != "SPLIT":
                        continue
                    u = hold.get(k, D(0))
                    if e["type"] == "SPLIT":
                        if u:
                            hold[k] = u * e["ratio"]
                    else:
                        pay = d if mode == "TR_EXDATE_CASH" else e["pay"]
                        if u and e["amount"]:
                            recv.append((u * e["amount"], pay))
                    ledger.append((d, e["id"], u))
        due = [a for a, p in recv if p <= d]
        cash += sum(due, D(0))
        recv = [(a, p) for a, p in recv if p > d]
        px = {k: (L[k]["adj"] if mode == "PRICE_ADJUSTED" else L[k]["raw"])[d] for k in ids}
        marked = {k: u * px[k] for k, u in hold.items()}
        claims = sum((a for a, _ in recv), D(0))
        before = cash + claims + sum(marked.values(), D(0))
        if d in execs:
            after = solve_after(before, marked, w, rate)
            cost = sum(abs(w.get(k, D(0)) * after - marked.get(k, D(0))) for k in set(marked) | set(w)) * rate
            if sum(w.values()) * after > (before - claims) - cost + D("1e-9") * init:
                return {"error": "UNSETTLED_CASH_NOT_INVESTABLE", "date": d}
            for k in sorted(set(marked) | set(w)):
                delta = w.get(k, D(0)) * after - marked.get(k, D(0))
                if abs(delta) <= D("1e-12") * init:
                    continue
                n = abs(delta)
                cash -= delta + n * fee_r + n * slip_r
                fees += n * fee_r
                hold[k] = hold.get(k, D(0)) + delta / px[k]
                ntrades += 1
        value = cash + claims + sum(u * px[k] for k, u in hold.items())
        out.append((d, value, cash, claims))
    return {"equity": out, "ledger": ledger, "trades": ntrades, "end": out[-1][1], "fees": fees}


def rel(a, b):
    a, b = D(str(a)), D(str(b))
    return abs(a - b) / max(D(1), abs(b))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--private", required=True, help="private run dir written by run_ledger.cjs")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    priv = Path(a.private)
    reg = load(priv / "registration.json")
    dates, closes, L = build(reg)
    global ORDERED
    ORDERED = ordered_events(L)
    report = {"schemaVersion": "v9-portfolio-ledger-parity-1.0.0", "reference": "Python Decimal(50) journal; inputs rebuilt independently from evidence + price files",
              "tolerance": str(TOL), "registrationHash": reg["registrationHash"], "runs": {},
              "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    ok = True
    for name, wt in [("TR_PAYDATE", 0.9), ("PRICE_ADJUSTED", 0.9), ("RAW_SPLITS_ONLY", 0.9), ("TR_EXDATE_CASH", 0.9), ("TR_FULLY_INVESTED", 1.0), ("TR_EXDATE_CASH_FULLY_INVESTED", 1.0)]:
        mode = {"TR_FULLY_INVESTED": "TR_PAYDATE", "TR_EXDATE_CASH_FULLY_INVESTED": "TR_EXDATE_CASH"}.get(name, name)
        py = simulate(reg, dates, closes, L, mode, wt)
        rp = priv / f"{name}-result.json"
        inp = load(priv / f"{name}-input.json")
        # Input parity: sessions/closeAt, raw prices, events.
        in_ok = [s["date"] for s in inp["sessions"]] == dates and all(s["closeAt"] == closes[s["date"]] for s in inp["sessions"])
        js_ev = sorted((e["id"], e["effectiveDate"], e.get("payDate")) for l in inp["listings"] for e in l["events"])
        py_ev = sorted((e["id"], e["eff"], e.get("pay")) for k in L for e in L[k]["events"]
                       if name not in ("PRICE_ADJUSTED",) and (name != "RAW_SPLITS_ONLY" or e["type"] == "SPLIT"))
        if name in ("TR_EXDATE_CASH", "TR_EXDATE_CASH_FULLY_INVESTED"):
            py_ev = sorted((i, eff, eff if p is not None else None) for i, eff, p in py_ev)
        px_dev = max((rel(b["close"], (L[l["listingId"]]["adj"] if name == "PRICE_ADJUSTED" else L[l["listingId"]]["raw"])[b["date"]])
                      for l in inp["listings"] for b in l["bars"]), default=D(0))
        row = {"inputSessionsMatch": in_ok, "inputEventsMatch": js_ev == py_ev, "eventsCompared": len(py_ev), "maxRelPriceInputDiff": str(px_dev)}
        if "error" in py:
            js_err = load(priv / "summary.json")["runs"][name].get("error")
            row.update({"python": py["error"], "js": js_err, "match": js_err == py["error"]})
        else:
            js = load(rp)
            dev = max(rel(e["value"], v) for e, (_, v, _, _) in zip(js["equity"], py["equity"]))
            cdev = max(rel(e["cash"], c) for e, (_, _, c, _) in zip(js["equity"], py["equity"]))
            rdev = max(rel(e["receivables"], r) for e, (_, _, _, r) in zip(js["equity"], py["equity"]))
            led = [(x["date"], x["eventId"], x["entitlementUnits"]) for x in js["eventLedger"]]
            ldev = max([rel(a[2], b[2]) for a, b in zip(led, py["ledger"])] or [D(0)])
            row.update({"pythonEnd": str(py["end"]), "jsEnd": js["endCapital"], "endRelDiff": str(rel(js["endCapital"], py["end"])),
                        "maxEquityRelDiff": str(dev), "maxCashRelDiff": str(cdev), "maxReceivableRelDiff": str(rdev),
                        "eventLedgerSameOrder": [x[:2] for x in led] == [x[:2] for x in py["ledger"]], "maxEntitlementRelDiff": str(ldev),
                        "tradesPython": py["trades"], "tradesJs": len(js["trades"]),
                        "match": dev <= TOL and cdev <= TOL and rdev <= TOL and ldev <= TOL and py["trades"] == len(js["trades"])})
        row["match"] = bool(row["match"] and in_ok and row["inputEventsMatch"] and D(row["maxRelPriceInputDiff"]) <= D("1e-12"))
        ok &= row["match"]
        report["runs"][name] = row
        print(name, json.dumps(row))
    report["status"] = "PASS" if ok else "FAIL"
    Path(a.out).write_text(json.dumps(report, indent=1) + "\n")
    print(report["status"])


if __name__ == "__main__":
    main()
