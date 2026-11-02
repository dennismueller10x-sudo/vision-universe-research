#!/usr/bin/env python3
"""Independent re-implementation of quant/engines/backtest-metrics.cjs (stdlib only, no JS code imported).

Usage: python3 -I scripts/quant/verify-backtest-metrics.py --input case.json [--input ...] [--out report.json]
A case file is {"name", "ledger", "options", "js": <computeMetrics output>}. Python recomputes every metric from the
ledger with its own code and compares it with the JS document (relative tolerance 1e-9). Exit code 0 = all cases PASS.
Writes only the --out file (outside the repository in tests).
"""
import argparse
import json
import math
import statistics
import sys
from datetime import date

REL, ABS = 1e-9, 1e-12


def d(s):
    return date.fromisoformat(s)


def ddays(a, b):
    return (d(b) - d(a)).days


def sample_sd(xs):
    return statistics.stdev(xs) if len(xs) >= 2 else None


def sample_cov(a, b):
    n = len(a)
    if n < 2:
        return None
    ma, mb = sum(a) / n, sum(b) / n
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (n - 1)


def avg(xs):
    return sum(xs) / len(xs) if xs else None


def max_drawdown(points):
    """points: list of (date, value), first = initial stub. Returns dict like the JS engine."""
    worst, w_peak, w_trough = 0.0, 0, 0
    peak_i = 0
    for i, (_, v) in enumerate(points):
        if v > points[peak_i][1]:
            peak_i = i
        pv = points[peak_i][1]
        dd = v / pv - 1 if pv > 0 else 0.0
        if dd < worst:
            worst, w_peak, w_trough = dd, peak_i, i
    if worst == 0:
        return {"maxDrawdown": 0.0, "peakDate": None, "troughDate": None, "recoveryDate": None, "durationPeriods": 0, "recovered": True}
    target = points[w_peak][1]
    rec = next((j for j in range(w_trough + 1, len(points)) if points[j][1] >= target), None)
    end = rec if rec is not None else len(points) - 1
    return {"maxDrawdown": worst, "peakDate": points[w_peak][0], "troughDate": points[w_trough][0],
            "recoveryDate": points[rec][0] if rec is not None else None, "peakToTroughPeriods": w_trough - w_peak,
            "peakToTroughDays": ddays(points[w_peak][0], points[w_trough][0]), "durationPeriods": end - w_peak,
            "durationDays": ddays(points[w_peak][0], points[end][0]), "recovered": rec is not None}


def years_table(points):
    out = []
    by_year = {}
    for dt, v in points[1:]:
        by_year[dt[:4]] = (dt, v)
    prev = points[0]
    for y in sorted(by_year):
        end = by_year[y]
        out.append({"year": int(y), "from": prev[0], "to": end[0], "return": end[1] / prev[1] - 1 if prev[1] > 0 else None})
        prev = end
    return out


def stats(points, ppy, rf):
    first, last = points[0], points[-1]
    yrs = ddays(first[0], last[0]) / 365.25
    rets = [points[i][1] / points[i - 1][1] - 1 for i in range(2, len(points))]
    s = sample_sd(rets)
    m = avg(rets)
    cagr = None
    if yrs > 0 and first[1] > 0 and last[1] > 0:
        cagr = (last[1] / first[1]) ** (1 / yrs) - 1
    elif yrs > 0 and last[1] == 0:
        cagr = -1.0
    return {"totalReturn": last[1] / first[1] - 1, "cagr": cagr, "years": yrs, "returns": rets, "mean": m,
            "vol": s * math.sqrt(ppy) if s is not None else None,
            "sharpe": (m - rf) / s * math.sqrt(ppy) if s else None, "dd": max_drawdown(points), "calendar": years_table(points)}


def held_by_row(rows, trades):
    if all("positions" in r for r in rows):
        return [set(p["listingId"] for p in r["positions"] if p["units"] > 0) for r in rows]
    if any("units" not in t for t in trades):
        return None
    units, peak, out = {}, {}, []
    for r in rows:
        for t in [t for t in trades if t["date"] == r["date"]]:
            k = t["listingId"]
            u = units.get(k, 0.0) + (t["units"] if t["side"] == "BUY" else -t["units"])
            peak[k] = max(peak.get(k, 0.0), abs(u))
            units[k] = 0.0 if abs(u) <= 1e-9 * (peak[k] or 1) else u
        out.append(set(k for k, u in units.items() if u > 0))
    return out


def round_trips(rows, trades):
    held = held_by_row(rows, trades)
    if held is None:
        return []
    opened, done = {}, []
    for i, r in enumerate(rows):
        todays = [t for t in trades if t["date"] == r["date"]]
        for t in todays:
            k = t["listingId"]
            if k not in opened:
                opened[k] = {"listingId": k, "openIndex": i, "openDate": r["date"], "byBuy": t["side"] == "BUY", "buy": 0.0, "sell": 0.0, "cost": 0.0, "last": None}
            e = opened[k]
            e["buy" if t["side"] == "BUY" else "sell"] += t["notional"]
            e["cost"] += t.get("fee", 0) + t.get("slippage", 0)
            e["last"] = t["side"]
        for k in held[i]:
            opened.setdefault(k, {"listingId": k, "openIndex": i, "openDate": r["date"], "byBuy": False, "buy": 0.0, "sell": 0.0, "cost": 0.0, "last": None})
        for k in sorted(list(opened)):
            if k in held[i]:
                continue
            e = opened.pop(k)
            sold = any(t["listingId"] == k and t["side"] == "SELL" for t in todays)
            e.update(closeIndex=i, closeDate=r["date"], bySell=sold and e["last"] == "SELL")
            done.append(e)
    for e in opened.values():
        e.update(closeIndex=None, closeDate=None, bySell=False)
        done.append(e)
    return done


def metrics(ledger, options):
    ppy = options.get("periodsPerYear", 52)
    rf_annual = options.get("riskFree", {"annualRate": 0})["annualRate"]
    rf = (1 + rf_annual) ** (1 / ppy) - 1
    rows, trades = ledger["rows"], ledger.get("trades", [])
    init = ledger.get("initialCapital") or rows[0]["value"]
    pts = [(rows[0]["date"], init)] + [(r["date"], r["value"]) for r in rows]
    s = stats(pts, ppy, rf)
    cash = [r["cash"] / r["value"] for r in rows if "cash" in r and r["value"] > 0]
    fees = sum(t.get("fee", 0) for t in trades)
    slip = sum(t.get("slippage", 0) for t in trades)
    turnover = 0.0
    for r in rows:
        tt = [t for t in trades if t["date"] == r["date"]]
        if not tt:
            continue
        pre = r["value"] + sum(t.get("fee", 0) + t.get("slippage", 0) for t in tt)
        if pre > 0:
            turnover += sum(t["notional"] for t in tt) / (2 * pre)
    eps = round_trips(rows, trades)
    closed = [e for e in eps if e["closeIndex"] is not None]
    attributable = [e for e in closed if e["byBuy"] and e["bySell"]]
    pnl = [e["sell"] - e["buy"] - e["cost"] for e in attributable]
    out = {
        "returns.totalReturn": s["totalReturn"], "returns.cagr": s["cagr"], "risk.annualizedVolatility": s["vol"], "risk.sharpe": s["sharpe"],
        "risk.maxDrawdown": s["dd"]["maxDrawdown"], "risk.peakDate": s["dd"]["peakDate"], "risk.troughDate": s["dd"]["troughDate"],
        "risk.recoveryDate": s["dd"]["recoveryDate"], "risk.durationPeriods": s["dd"]["durationPeriods"],
        "exposure.averageCashShare": avg(cash), "costs.total": fees + slip, "costs.fees": fees,
        "turnover.oneWayTurnoverSum": turnover, "trades.fills": len(trades), "trades.roundTrips": len(attributable),
        "trades.closedEpisodes": len(closed), "trades.openAtEnd": len(eps) - len(closed),
        "trades.hitRate": (sum(1 for p in pnl if p > 0) / len(pnl)) if pnl else None,
        "trades.averageHoldingPeriods": avg([e["closeIndex"] - e["openIndex"] for e in closed]),
        "trades.averageHoldingDays": avg([ddays(e["openDate"], e["closeDate"]) for e in closed]),
        "trades.totalRoundTripPnl": sum(pnl),
    }
    for y in s["calendar"]:
        out["returns.calendarYears.%d" % y["year"]] = y["return"]
    bench = options.get("benchmark")
    series = {b["date"]: b["value"] for b in bench} if bench else ({r["date"]: r["benchmark"] for r in rows} if all("benchmark" in r for r in rows) else None)
    if series and all(r["date"] in series for r in rows):
        bp = [(rows[0]["date"], series[rows[0]["date"]])] + [(r["date"], series[r["date"]]) for r in rows]
        b = stats(bp, ppy, rf)
        ex = [x - y for x, y in zip(s["returns"], b["returns"])]
        te = sample_sd(ex)
        vb = sample_cov(b["returns"], b["returns"])
        c = sample_cov(s["returns"], b["returns"])
        out.update({"benchmark.totalReturn": b["totalReturn"], "benchmark.excessTotalReturn": s["totalReturn"] - b["totalReturn"],
                    "benchmark.trackingError": te * math.sqrt(ppy) if te is not None else None, "benchmark.beta": c / vb if vb else None,
                    "benchmark.maxDrawdown": b["dd"]["maxDrawdown"], "benchmark.informationRatio": avg(ex) / te * math.sqrt(ppy) if te else None})
    return out


def js_value(doc, key):
    if key.startswith("returns.calendarYears."):
        y = int(key.rsplit(".", 1)[1])
        return next((r["return"] for r in doc["returns"]["calendarYears"] if r["year"] == y), "MISSING")
    cur = doc
    for part in key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return "MISSING"
        cur = cur[part]
    return cur


def same(a, b):
    if a is None or b is None or isinstance(a, str) or isinstance(b, str) or isinstance(a, bool):
        return a == b
    return abs(a - b) <= max(ABS, REL * max(abs(a), abs(b)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", action="append", required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    report = {"schemaVersion": "backtest-metrics-python-parity-1.0.0", "tolerance": {"relative": REL, "absolute": ABS}, "cases": []}
    ok = True
    for path in a.input:
        with open(path, encoding="utf-8") as fh:
            case = json.load(fh)
        py = metrics(case["ledger"], case.get("options") or {})
        mism = [{"key": k, "python": v, "js": js_value(case["js"], k)} for k, v in sorted(py.items()) if not same(v, js_value(case["js"], k))]
        ok = ok and not mism
        report["cases"].append({"name": case.get("name"), "compared": len(py), "mismatches": mism, "status": "PASS" if not mism else "FAIL",
                                "python": {k: py[k] for k in ("returns.totalReturn", "returns.cagr", "risk.maxDrawdown", "risk.sharpe", "trades.hitRate")}})
    report["status"] = "PASS" if ok else "FAIL"
    text = json.dumps(report, indent=1, sort_keys=True)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
    print(json.dumps({"status": report["status"], "cases": [(c["name"], c["status"], c["compared"]) for c in report["cases"]]}))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
