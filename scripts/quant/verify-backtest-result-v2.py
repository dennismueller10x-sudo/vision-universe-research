#!/usr/bin/env python3
"""Independent stdlib re-computation of the path metrics that
quant/engines/backtest-result-adapters.cjs derives (annual returns,
volatility, cash share, completed-trade hit rate, benchmark excess).

Usage: python3 -I scripts/quant/verify-backtest-result-v2.py case.json
case.json = {"source": "real-weekly" | "portfolio" | "research", "ledger": {...}, "envelope": {...}}
("research" = research-studies finish() result: hit rate, median event drawdown, mean benchmark excess)
Prints {"state": "PASS"} or exits 1 with the first mismatch.
"""
import json
import math
import sys
from datetime import date


def days(d):
    y, m, dd = (int(x) for x in d.split("-"))
    return date(y, m, dd).toordinal()


def annual(dates, values, initial):
    out, base = [], initial
    for i, d in enumerate(dates):
        if i < len(dates) - 1 and dates[i + 1][:4] == d[:4]:
            continue
        first = not out
        partial = (first and dates[0][5:] > "01-07") or (i == len(dates) - 1 and d[5:] < "12-24")
        out.append({"year": d[:4], "value": values[i] / base - 1 if base > 0 else None, "partial": partial})
        base = values[i]
    return out


def vol(dates, values):
    r = [values[i] / values[i - 1] - 1 for i in range(1, len(values)) if values[i - 1] > 0]
    years = (days(dates[-1]) - days(dates[0])) / 365.25
    if len(r) < 2 or years <= 0:
        return None
    m = sum(r) / len(r)
    var = sum((x - m) ** 2 for x in r) / (len(r) - 1)
    return math.sqrt(var) * math.sqrt(len(r) / years)


def close(a, b, what):
    if a is None or b is None:
        if a is not b:
            raise SystemExit(f"MISMATCH {what}: {a} != {b}")
        return
    if abs(a - b) > 1e-9 * max(1.0, abs(b)):
        raise SystemExit(f"MISMATCH {what}: {a} != {b}")


def finite(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def research(led, env):
    m = env["metrics"]
    obs = [e for e in led["events"] if e.get("state") == "OBSERVED" and finite(e.get("netReturn"))]
    if not obs:
        close(m["hitRate"], None, "hitRate")
        return 0
    close(m["hitRate"], sum(1 for e in obs if e["netReturn"] > 0) / len(obs), "hitRate")
    dd = sorted(e["maxDrawdown"] for e in obs if finite(e.get("maxDrawdown")))
    med = None if not dd else (dd[len(dd) // 2] if len(dd) % 2 else (dd[len(dd) // 2 - 1] + dd[len(dd) // 2]) / 2)
    close(m["maxDrawdown"], med, "maxDrawdown")
    ex = [e["benchmarkExcess"] for e in obs if finite(e.get("benchmarkExcess"))]
    close(m["excess"]["meanExcess"] if m["excess"] else None, sum(ex) / len(ex) if ex else None, "excess.meanExcess")
    if m["trades"] != len(obs):
        raise SystemExit("MISMATCH trades")
    return len(obs)


def main(path):
    case = json.load(open(path, encoding="utf-8"))
    led, env = case["ledger"], case["envelope"]
    if case["source"] == "research":
        n = research(led, env)
        print(json.dumps({"state": "PASS", "observed": n}))
        return
    eq = led["equity"]
    dates = [e["date"] for e in eq]
    values = [e["value"] for e in eq]
    m = env["metrics"]
    if case["source"] == "real-weekly":
        initial = led["input"]["initialCapital"]
        held = [(t["entryDate"], t["exitDate"]) for t in led["trades"]]
        if led.get("openPosition"):
            held.append((led["openPosition"]["entryDate"], None))
        cash = [0 if any(a <= d and (b is None or d < b) for a, b in held) else 1 for d in dates]
        trades = led["trades"]
        hit = sum(1 for t in trades if t["netReturn"] > 0) / len(trades) if trades else None
        close(m["hitRate"], hit, "hitRate")
        close(m["excess"]["totalReturn"], led["metrics"]["totalReturn"] - led["benchmark"]["totalReturn"], "excess.totalReturn")
    elif case["source"] == "portfolio":
        initial = led["initialCapital"]
        cash = [min(1, max(0, e["cash"] / e["value"])) if e["value"] > 0 else None for e in eq]
        bench_total = eq[-1]["benchmark"] / initial - 1
        years = (days(dates[-1]) - days(dates[0])) / 365.25
        close(m["benchmark"]["totalReturn"], bench_total, "benchmark.totalReturn")
        close(m["excess"]["totalReturn"], led["metrics"]["cumulativeReturn"] - bench_total, "excess.totalReturn")
        if years > 0:
            close(m["benchmark"]["cagr"], (eq[-1]["benchmark"] / initial) ** (1 / years) - 1, "benchmark.cagr")
    else:
        raise SystemExit("UNKNOWN_SOURCE")
    p = env["portfolio"]
    if p["dates"] != dates:
        raise SystemExit("MISMATCH dates")
    for i, (a, b) in enumerate(zip(p["equity"], values)):
        close(a, b, f"equity[{i}]")
    for i, (a, b) in enumerate(zip(p["cashShare"], cash)):
        close(a, b, f"cashShare[{i}]")
    known = [c for c in cash if c is not None]
    close(m["cashShare"], sum(known) / len(known) if known else None, "cashShare")
    expected = annual(dates, values, initial)
    if len(expected) != len(m["annualReturns"]):
        raise SystemExit("MISMATCH annualReturns length")
    for a, b in zip(m["annualReturns"], expected):
        if a["year"] != b["year"] or a["partial"] != b["partial"]:
            raise SystemExit(f"MISMATCH annualReturns {a} {b}")
        close(a["value"], b["value"], "annualReturns." + b["year"])
    close(m["volatility"], vol(dates, values), "volatility")
    print(json.dumps({"state": "PASS", "rows": len(dates), "years": len(expected)}))


if __name__ == "__main__":
    main(sys.argv[1])
