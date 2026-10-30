#!/usr/bin/env python3
"""Independent re-computation (stdlib only, run with python3 -I) of research backtest-runner results.

Reads full runner results (with the QA block) and recomputes from the committed weekly closes, the SPY series and the
TR register, without importing any JavaScript finance code:
  - per-event statistics of the envelope (hit rate, median/mean net return, median event drawdown, mean excess, counts),
  - net return from gross return and the per-side cost contract for every observed event,
  - signal rule events for NEW_52W_HIGH and TREND_UP (detection, next-week-close entry, h-week exit, gross return,
    SPY return) per listing,
  - the portfolio path of fixed-weight strategies (bisection for the post-cost target equity, per-side costs,
    register dividends credited at the first session on/after the pay date) and the envelope path metrics,
  - the real weekly ledger trades (signal dates, entry/exit closes, net return),
  - point-in-time checks (no signal outside the window, entry strictly after the signal, no exit after asOf,
    no input bar after asOf).

Usage: python3 -I scripts/quant/verify-backtest-runner.py --qa-dir <dir of full results> [--private-delisted <dir>]
       [--out report.json]. Exit code 1 on any mismatch.
"""
import argparse
import datetime as dt
import json
import math
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
TOL = 1e-9
WARMUP, COOLDOWN = 53, 13
TR_REGISTER = os.path.join(ROOT, "docs/quant-recovery/v10/corporate-actions/tr-register-1.0.0.json")


def near(a, b, tol=TOL):
    if a is None or b is None:
        return a is None and b is None
    return abs(a - b) <= tol * max(1.0, abs(b))


def median(xs):
    s = sorted(xs)
    n = len(s)
    if not n:
        return None
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def mean(xs):
    return sum(xs) / len(xs) if xs else None


def load_json(p):
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


class Report:
    def __init__(self):
        self.cases = {}
        self.failures = 0

    def check(self, case, name, ok, detail=None):
        c = self.cases.setdefault(case, {})
        entry = c.setdefault(name, {"passed": 0, "failed": 0, "examples": []})
        if ok:
            entry["passed"] += 1
        else:
            entry["failed"] += 1
            self.failures += 1
            if len(entry["examples"]) < 5:
                entry["examples"].append(detail)


OVERRIDE = {}


def series_closes(security_id, private_dir):
    # --fixture (tests only): closes and SPY supplied in one JSON file instead of the committed series.
    if "closes" in OVERRIDE:
        return OVERRIDE["closes"].get(security_id)
    if security_id.startswith("dl_"):
        if not private_dir:
            return None
        doc = load_json(os.path.join(private_dir, security_id[3:] + ".json"))
        return doc["points"]
    return load_json(os.path.join(ROOT, "quant/data/market/discover-series-long", security_id + ".json"))["points"]


def spy_map():
    if "spy" in OVERRIDE:
        return {d: p for d, p in OVERRIDE["spy"]}
    doc = load_json(os.path.join(ROOT, "quant/data/market/multi-asset/series/SPY.json"))
    return {d: p for d, p in doc["points"]}


def monday(d):
    t = dt.date.fromisoformat(d)
    return t - dt.timedelta(days=t.weekday())


# ---------------------------------------------------------------- signal rules (written from the rule text)
def valid(v):
    return isinstance(v, (int, float)) and math.isfinite(v) and v > 0


def prior_max(c, i, w):
    if i - w < 0:
        return None
    vals = [c[k] for k in range(i - w, i) if valid(c[k])]
    return max(vals) if len(vals) >= w * 0.8 else None


def sma(c, i, w):
    if i - w + 1 < 0:
        return None
    window = c[i - w + 1:i + 1]
    if not all(valid(v) for v in window):
        return None
    return sum(window) / w


def detect(rule, c, i):
    if rule == "NEW_52W_HIGH":
        m, mp = prior_max(c, i, 52), prior_max(c, i - 1, 52)
        if m is None or mp is None or not valid(c[i]) or not valid(c[i - 1]):
            return False
        return c[i] > m and not (c[i - 1] > mp)
    if rule == "TREND_UP":
        s, t = sma(c, i, 40), sma(c, i - 1, 40)
        return s is not None and t is not None and c[i] >= s and c[i - 1] < t
    raise ValueError(rule)


def detect_events(rule, c):
    out, last = [], -10 ** 9
    for i in range(max(1, WARMUP), len(c)):
        if not detect(rule, c, i):
            continue
        if i - last >= COOLDOWN:
            out.append(i)
        last = i
    return out


# ---------------------------------------------------------------- checks
def check_pit(rep, cid, r):
    spec = r["spec"]
    w, as_of = spec["window"], spec["asOf"]
    env = r["envelope"]
    rep.check(cid, "pit.periodToNotAfterAsOf", env["period"]["to"] is None or env["period"]["to"] <= as_of, env["period"])
    rep.check(cid, "pit.periodAsOf", env["period"]["asOf"] == as_of, env["period"])
    if r.get("pit"):
        rep.check(cid, "pit.noInputAfterAsOf", r["pit"]["inputsAfterAsOf"] == 0 and r["pit"]["latestInputBar"] <= as_of, r["pit"])
    for e in (r.get("qa") or {}).get("events") or []:
        rep.check(cid, "pit.signalInWindow", w["from"] <= e["signalDate"] <= w["to"], e)
        if e["entryDate"]:
            rep.check(cid, "pit.entryAfterSignal", e["entryDate"] > e["signalDate"], e)
        if e["state"] == "OBSERVED":
            rep.check(cid, "pit.exitNotAfterAsOf", e["exitDate"] <= as_of and e["exitDate"] > e["entryDate"], e)
    st = env["status"]
    rep.check(cid, "status.notCertifiedNotApproved", st["productionApproved"] is False and st["state"] != "PRODUCT_CERTIFIED", st)


def check_per_event(rep, cid, r):
    env, qa = r["envelope"], r["qa"]
    evs = qa["events"]
    obs = [e for e in evs if e["state"] == "OBSERVED"]
    s = (qa["costs"]["feeBps"] + qa["costs"]["slippageBps"]) / 10000.0
    for e in obs:
        rep.check(cid, "event.netFromGross", near(e["netReturn"], (1 + e["grossReturn"]) * (1 - s) / (1 + s) - 1), e)
    m = env["metrics"]
    counts = {"OBSERVED": 0, "IMMATURE": 0, "CENSORED": 0, "INELIGIBLE": 0}
    for e in evs:
        counts[e["state"]] = counts.get(e["state"], 0) + 1
    ev = env["events"]
    rep.check(cid, "envelope.counts", ev["occurrences"] == len(evs) and ev["completed"] == counts["OBSERVED"] and ev["censored"] == counts["CENSORED"]
              and ev["immature"] == counts["IMMATURE"] and ev["ineligible"] == counts["INELIGIBLE"], {"envelope": ev, "recomputed": counts})
    if not obs:
        return
    rep.check(cid, "metrics.hitRate", near(m["hitRate"], sum(1 for e in obs if e["netReturn"] > 0) / len(obs)), m["hitRate"])
    rep.check(cid, "metrics.medianEventDrawdown", near(m["maxDrawdown"], median([e["maxDrawdown"] for e in obs])), m["maxDrawdown"])
    rep.check(cid, "metrics.trades", m["trades"] == len(obs), m["trades"])
    pe = m["perEvent"]
    rep.check(cid, "metrics.perEvent.median", near(pe["median"], median([e["netReturn"] for e in obs])), pe)
    rep.check(cid, "metrics.perEvent.mean", near(pe["mean"], mean([e["netReturn"] for e in obs])), pe)
    ex = [e["netReturn"] - e["benchmarkReturn"] for e in obs if e["benchmarkReturn"] is not None]
    if ex:
        rep.check(cid, "metrics.meanBenchmarkExcess", near(m["excess"]["meanExcess"], mean(ex)), m["excess"])


def check_signal_rules(rep, cid, r, private_dir, spy):
    spec = r["spec"]
    rules = spec["engine"].get("ruleIds") or ["MOMENTUM_IMPROVED", "MOMENTUM_DETERIORATED", "TREND_UP", "TREND_DOWN", "NEW_52W_HIGH"]
    h, as_of, w = spec["engine"]["horizonBars"], spec["asOf"], spec["window"]
    s = (spec["costs"]["feeBps"] + spec["costs"]["slippageBps"]) / 10000.0
    by = {}
    for e in r["qa"]["events"]:
        by.setdefault((e["securityId"], e["ruleId"]), []).append(e)
    for l in r["population"]["listings"]:
        pts = series_closes(l["securityId"], private_dir)
        if pts is None:
            rep.check(cid, "signal.skippedPrivateSeriesUnavailable", True)
            continue
        last = (l.get("lifecycle") or {}).get("lastTradeDate")
        pts = [p for p in pts if p[0] <= as_of and (not last or p[0] <= last)]
        dates, c = [p[0] for p in pts], [p[1] for p in pts]
        for rule in [x for x in ("NEW_52W_HIGH", "TREND_UP") if x in rules]:
            idx = [i for i in detect_events(rule, c) if w["from"] <= dates[i] <= w["to"]]
            engine = by.get((l["securityId"], rule), [])
            rep.check(cid, "signal." + rule + ".signalDates", sorted(dates[i] for i in idx) == sorted(e["signalDate"] for e in engine),
                      {"listing": l["securityId"], "python": [dates[i] for i in idx], "engine": [e["signalDate"] for e in engine]})
            emap = {e["signalDate"]: e for e in engine}
            for i in idx:
                e = emap.get(dates[i])
                if not e or e["state"] != "OBSERVED":
                    continue
                en, xi = i + 1, i + 1 + h
                ok = xi < len(c) and dates[en] == e["entryDate"] and dates[xi] == e["exitDate"] and all((monday(dates[k]) - monday(dates[k - 1])).days == 7 for k in range(en + 1, xi + 1))
                gross = c[xi] / c[en] - 1 if ok else None
                rep.check(cid, "signal." + rule + ".outcome", ok and near(e["grossReturn"], gross) and near(e["netReturn"], (1 + gross) * (1 - s) / (1 + s) - 1),
                          {"listing": l["securityId"], "signal": dates[i], "engine": e, "python": gross})
                b0, b1 = spy.get(e["entryDate"]), spy.get(e["exitDate"])
                rep.check(cid, "signal." + rule + ".benchmark", near(e["benchmarkReturn"], b1 / b0 - 1 if b0 and b1 else None), {"signal": dates[i], "engine": e["benchmarkReturn"]})


def path_metrics(rep, cid, env, year_days=365.25):
    # research-portfolio uses 365.25-day years; the real weekly ledger (run-real-weekly-backtest.cjs) uses 365.2425.
    p, m = env["portfolio"], env["metrics"]
    dates, eq, ini = p["dates"], p["equity"], p["initialCapital"]
    years = (dt.date.fromisoformat(dates[-1]) - dt.date.fromisoformat(dates[0])).days / 365.25
    cagr_years = (dt.date.fromisoformat(dates[-1]) - dt.date.fromisoformat(dates[0])).days / year_days
    rep.check(cid, "path.totalReturn", near(m["totalReturn"], eq[-1] / ini - 1), m["totalReturn"])
    rep.check(cid, "path.cagr", near(m["cagr"], (eq[-1] / ini) ** (1 / cagr_years) - 1), m["cagr"])
    peak, mdd = ini, 0.0
    for v in [ini] + eq:
        peak = max(peak, v)
        mdd = min(mdd, v / peak - 1)
    rep.check(cid, "path.maxDrawdown", near(m["maxDrawdown"], mdd), m["maxDrawdown"])
    r = [eq[i] / eq[i - 1] - 1 for i in range(1, len(eq)) if eq[i - 1] > 0]
    mu = mean(r)
    vol = math.sqrt(sum((x - mu) ** 2 for x in r) / (len(r) - 1)) * math.sqrt(len(r) / years)
    rep.check(cid, "path.volatilityObservedFrequency", near(m["volatility"], vol), m["volatility"])
    cash = [x for x in p["cashShare"] if x is not None]
    rep.check(cid, "path.cashShare", near(m["cashShare"], mean(cash)), m["cashShare"])
    out, base = [], ini
    for i, d in enumerate(dates):
        if i == len(dates) - 1 or dates[i + 1][:4] != d[:4]:
            out.append((d[:4], eq[i] / base - 1))
            base = eq[i]
    rep.check(cid, "path.annualReturns", len(out) == len(m["annualReturns"]) and all(a[0] == b["year"] and near(a[1], b["value"]) for a, b in zip(out, m["annualReturns"])), m["annualReturns"])


def simulate_portfolio(rep, cid, r, spy):
    qa = r["qa"]["portfolio"]["input"]
    env = r["envelope"]
    sessions = qa["sessions"]
    fee, slip = qa["costs"]["feeBps"] / 10000.0, qa["costs"]["slippageBps"] / 10000.0
    rate = fee + slip
    closes = {l["listingId"]: dict((d, p) for d, p in series_closes(l["listingId"], None)) for l in qa["listings"]}
    events = {}
    if qa["withDividends"]:
        reg = load_json(TR_REGISTER)
        for l in qa["listings"]:
            t = [x for x in reg["titles"] if x["securityId"] == l["listingId"]][0]
            for e in t["portfolioEvents"]:
                if e["type"] == "CASH_DIVIDEND" and sessions[0] <= e["effectiveDate"] <= sessions[-1]:
                    events.setdefault(e["effectiveDate"], []).append((l["listingId"], e))
    targets = {t["executionDate"]: t for t in qa["targets"]}
    cash, hold, recv, values = qa["initialCapital"], {}, [], []
    ini = qa["initialCapital"]
    for d in sessions:
        for lid, e in events.get(d, []):
            u = hold.get(lid, 0.0)
            if u and e["amount"]:
                recv.append((e["payDate"], u * e["amount"]))
        cash += sum(a for pdate, a in recv if pdate <= d)
        recv = [(pdate, a) for pdate, a in recv if pdate > d]
        marked = {k: u * closes[k][d] for k, u in hold.items()}
        claims = sum(a for _, a in recv)
        before = cash + claims + sum(marked.values())
        t = targets.get(d)
        if t:
            w = t["weights"]
            keys = sorted(set(hold) | set(w))

            def cost(v):
                return sum(abs(w.get(k, 0.0) * v - marked.get(k, 0.0)) for k in keys) * rate
            lo, hi = 0.0, before
            for _ in range(200):
                mid = (lo + hi) / 2
                if mid + cost(mid) > before:
                    hi = mid
                else:
                    lo = mid
            after = (lo + hi) / 2
            for k in keys:
                delta = w.get(k, 0.0) * after - marked.get(k, 0.0)
                if abs(delta) <= 1e-12 * ini:
                    continue
                price = closes[k][d]
                exit_ = not (w.get(k, 0) > 0) and k in hold
                units = -hold[k] if exit_ else delta / price
                cash -= delta + abs(delta) * rate
                nu = hold.get(k, 0.0) + units
                if exit_ or abs(nu) <= 1e-12:
                    hold.pop(k, None)
                else:
                    hold[k] = nu
            if abs(cash) < 1e-12 * ini:
                cash = 0.0
        values.append(cash + claims + sum(u * closes[k][d] for k, u in hold.items()))
    eq = env["portfolio"]["equity"]
    rep.check(cid, "portfolio.dates", env["portfolio"]["dates"] == sessions, None)
    worst = max(abs(a - b) / max(1.0, abs(b)) for a, b in zip(values, eq))
    rep.check(cid, "portfolio.equityPath", len(values) == len(eq) and worst <= 1e-8, {"maxRelDiff": worst})
    rep.check(cid, "portfolio.endCapital", near(values[-1], env["portfolio"]["endCapital"], 1e-8), {"python": values[-1], "engine": env["portfolio"]["endCapital"]})
    if not qa["withDividends"] and r["spec"]["benchmark"] == "SPY":
        b = env["metrics"]["benchmark"]["totalReturn"]
        rep.check(cid, "portfolio.spyTotalReturn", near(b, spy[sessions[-1]] / spy[sessions[0]] - 1), b)


def check_ledger(rep, cid, r):
    qa = r["qa"]["ledger"]
    sid = r["population"]["listings"][0]["securityId"]
    pts = [p for p in series_closes(sid, None) if p[0] <= r["spec"]["asOf"]]
    dates, c = [p[0] for p in pts], [p[1] for p in pts]
    ix = {d: i for i, d in enumerate(dates)}
    fs, ss = qa["costs"]["roundTripBps"] / 20000.0, qa["costs"]["slippageBps"] / 20000.0
    det = set(dates[i] for i in detect_events("NEW_52W_HIGH", c))
    for t in qa["trades"]:
        i = ix[t["entryDate"]]
        rep.check(cid, "ledger.signalIsRuleEvent", t["signalDate"] in det and dates[i - 1] == t["signalDate"], t)
        rep.check(cid, "ledger.prices", near(t["entryPrice"], c[i]) and near(t["exitPrice"], c[i + 26]) and dates[i + 26] == t["exitDate"], t)
        gross = c[i + 26] / c[i] - 1
        rep.check(cid, "ledger.netReturn", near(t["netReturn"], (1 + gross) * (1 - fs - ss) / (1 + fs + ss) - 1), t)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--qa-dir", required=True)
    ap.add_argument("--private-delisted", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--fixture", default=None)
    a = ap.parse_args()
    if a.fixture:
        OVERRIDE.update(load_json(a.fixture))
    rep, spy = Report(), spy_map()
    files = sorted(f for f in os.listdir(a.qa_dir) if f.endswith(".json"))
    for f in files:
        r = load_json(os.path.join(a.qa_dir, f))
        cid = f[:-5]
        check_pit(rep, cid, r)
        if r["state"] != "RESEARCH_EXECUTED" or not r.get("qa"):
            rep.check(cid, "stateB.noNumbers", r["envelope"]["metrics"]["basis"] == "NONE" and r["envelope"]["portfolio"] is None, r["state"])
            continue
        if r["envelope"]["metrics"]["basis"] == "PORTFOLIO":
            path_metrics(rep, cid, r["envelope"], 365.2425 if r["qa"].get("ledger") else 365.25)
            if r["qa"].get("portfolio"):
                simulate_portfolio(rep, cid, r, spy)
            if r["qa"].get("ledger"):
                check_ledger(rep, cid, r)
        else:
            check_per_event(rep, cid, r)
            if r["kind"] == "SIGNAL_BACKTEST":
                check_signal_rules(rep, cid, r, a.private_delisted, spy)
    out = {"schemaVersion": "backtest-runner-python-check-1.0.0", "python": sys.version.split()[0], "tolerance": TOL, "results": len(files), "failures": rep.failures,
           "checks": sum(v["passed"] + v["failed"] for c in rep.cases.values() for v in c.values()), "cases": rep.cases}
    s = json.dumps(out, indent=1, sort_keys=True)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(s + "\n")
    print(json.dumps({"results": len(files), "checks": out["checks"], "failures": rep.failures}))
    sys.exit(1 if rep.failures else 0)


if __name__ == "__main__":
    main()
