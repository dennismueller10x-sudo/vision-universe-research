#!/usr/bin/env python3
"""V10 FACTOR (RECONSTRUCTION): independent stdlib recomputation (python3 -I).

Separate implementation from raw data - not a port of the JS pipeline:
  A  fundamental raws from companyfacts JSON directly (as-filed, filed < t):
     equityToAssets (us-gaap Assets / StockholdersEquity, latest FY instant) and
     PIT market capitalization (dei EntityCommonStockSharesOutstanding x weekly close x split factor)
  B  weekly price components from the series files
  C  winsorized midrank percentiles, factor assembly and composite from the panel raws
  D  forward returns, Spearman IC, quintile spread and SPY excess per date
  E  Top-50 ledger with per-side costs (BASE)
Computation parity on the same data - no holdout.
Usage: python3 -I verify_factor.py <private_dir> <companyfacts.zip> [--out <file>]
"""
import gzip
import hashlib
import json
import math
import pathlib
import random
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[4]
SERIES = ROOT / "quant/data/market/discover-series-long"
CONTRACT = json.loads((ROOT / "quant/methodology/quant-v2.json").read_text())

COMPONENTS = {
    "momentum": [("priceReturn12m1m", .30, "higher"), ("priceReturn6m", .20, "higher"), ("priceReturn3m", .10, "higher"), ("relativeStrength12m1m", .20, "higher"), ("distanceTo52wHigh", .10, "lower"), ("distanceToSma200", .10, "higher")],
    "risk": [("realizedVolatility252d", .35, "lower"), ("downsideVolatility252d", .25, "lower"), ("maxDrawdown252d", .25, "lower"), ("beta252d", .15, "lower")],
    "quality": [("accrualRatio", .25, "lower"), ("netDebtToAssets", .20, "lower"), ("equityToAssets", .15, "higher"), ("positiveFcfYears", .20, "higher"), ("operatingMarginStability", .20, "lower")],
    "growth": [("revenueCagr3y", .30, "higher"), ("epsCagr3y", .20, "higher"), ("fcfCagr3y", .15, "higher"), ("revenueGrowthTtmYoy", .15, "higher"), ("operatingMarginExpansion3y", .10, "higher"), ("revenueGrowthAcceleration", .10, "higher")],
    "value": [("fcfYield", .30, "higher"), ("earningsYield", .25, "higher"), ("ebitdaYield", .20, "higher"), ("salesYield", .10, "higher"), ("bookToMarket", .15, "higher")],
    "profitability": [("roicTtm", .25, "higher"), ("roicMedian3y", .15, "higher"), ("grossProfitabilityTtm", .20, "higher"), ("operatingMarginTtm", .15, "higher"), ("fcfMarginTtm", .15, "higher"), ("roaTtm", .10, "higher")],
}
NO_WINSOR = {"positiveFcfYears"}
WEIGHTS = {"quality": .10, "growth": .15, "value": .15, "profitability": .15, "momentum": .25, "risk": .05}
MANDATORY = {
    "momentum": lambda h: h("priceReturn12m1m"),
    "risk": lambda h: h("realizedVolatility252d"),
    "quality": lambda h: (h("accrualRatio") or h("positiveFcfYears")) and (h("netDebtToAssets") or h("equityToAssets")),
    "growth": lambda h: h("revenueCagr3y") or h("revenueGrowthTtmYoy"),
    "value": lambda h: (h("fcfYield") or h("earningsYield")) and (h("salesYield") or h("bookToMarket") or h("ebitdaYield")),
    "profitability": lambda h: (h("roicTtm") or h("roaTtm")) and (h("operatingMarginTtm") or h("fcfMarginTtm") or h("grossProfitabilityTtm")),
}


def close_enough(a, b, rel=1e-9, abs_=1e-9):
    if a is None or b is None:
        return a is None and b is None
    return abs(a - b) <= max(abs_, rel * max(abs(a), abs(b)))


def day_before(d):
    import datetime
    return (datetime.date.fromisoformat(d) - datetime.timedelta(days=1)).isoformat()


def series(sid, cache={}):
    if sid not in cache:
        doc = json.loads((SERIES / (sid + ".json")).read_text())
        cache[sid] = doc
    return cache[sid]


def split_factor_at(doc, dates, k):
    """Cumulative product of splits whose first weekly bar comes after bar k."""
    f = 1.0
    for d, ratio in (doc.get("corporateActions") or {}).get("splits") or []:
        first = next((j for j, x in enumerate(dates) if x >= d), None)
        if first is not None and first > k:
            f *= ratio
    return f


# ---------------------------------------------------------------- A: SEC raw facts
def latest_fy_instant(facts, taxonomy, concept, cutoff):
    rows = (((facts.get("facts") or {}).get(taxonomy) or {}).get(concept) or {}).get("units", {}).get("USD") or []
    vis = [r for r in rows if r.get("form") in ("10-K", "10-K/A") and r.get("fp") == "FY" and r.get("filed", "9") <= cutoff and "start" not in r]
    if not vis:
        return None
    end = max(r["end"] for r in vis)
    best = max((r for r in vis if r["end"] == end), key=lambda r: (r["filed"], r.get("accn", "")))
    return best["end"], best["val"]


def latest_shares(facts, cutoff):
    rows = (((facts.get("facts") or {}).get("dei") or {}).get("EntityCommonStockSharesOutstanding") or {}).get("units", {}).get("shares") or []
    vis = [r for r in rows if r.get("filed", "9") <= cutoff and r.get("end", "9") <= cutoff]
    if not vis:
        return None
    end = max(r["end"] for r in vis)
    same = [r for r in vis if r["end"] == end]
    latest_filed = max(r["filed"] for r in same)
    rows_l = {(r.get("accn"), r["val"], r.get("frame")) for r in same if r["filed"] == latest_filed}
    accn = max(x[0] or "" for x in rows_l)
    return end, sum(x[1] for x in rows_l if (x[0] or "") == accn)


# ---------------------------------------------------------------- B: price components
def price_components(dates, closes, i, spy):
    out = {}
    if i + 1 >= 56:
        out["priceReturn12m1m"] = closes[i - 4] / closes[i - 52] - 1
        out["priceReturn6m"] = closes[i] / closes[i - 26] - 1
        out["priceReturn3m"] = closes[i] / closes[i - 13] - 1
        if dates[i - 4] in spy and dates[i - 52] in spy:
            out["relativeStrength12m1m"] = math.log(closes[i - 4] / closes[i - 52]) - math.log(spy[dates[i - 4]] / spy[dates[i - 52]])
        out["distanceTo52wHigh"] = 1 - closes[i] / max(closes[i - 51:i + 1])
        out["distanceToSma200"] = closes[i] / (sum(closes[i - 39:i + 1]) / 40) - 1
    if i + 1 >= 53:
        lr = [math.log(closes[k] / closes[k - 1]) for k in range(i - 51, i + 1)]
        m = sum(lr) / len(lr)
        out["realizedVolatility252d"] = math.sqrt(sum((x - m) ** 2 for x in lr) / (len(lr) - 1)) * math.sqrt(52)
        out["downsideVolatility252d"] = math.sqrt(sum(x * x for x in lr if x < 0) / (len(lr) - 1)) * math.sqrt(52)
        window = closes[i - 52:i + 1]
        peak, mdd = 0, 0.0
        for c in window:
            peak = max(peak, c)
            mdd = min(mdd, c / peak - 1)
        out["maxDrawdown252d"] = abs(mdd)
        pairs = [(closes[k] / closes[k - 1] - 1, spy[dates[k]] / spy[dates[k - 1]] - 1) for k in range(i - 51, i + 1) if dates[k] in spy and dates[k - 1] in spy]
        if len(pairs) >= 50:
            ma = sum(p[0] for p in pairs) / len(pairs)
            mb = sum(p[1] for p in pairs) / len(pairs)
            vb = sum((p[1] - mb) ** 2 for p in pairs)
            if vb > 0:
                out["beta252d"] = sum((p[0] - ma) * (p[1] - mb) for p in pairs) / vb
    return out


# ---------------------------------------------------------------- C: normalization
def quantile(sorted_vals, q):
    pos = q * (len(sorted_vals) - 1)
    lo, hi = math.floor(pos), math.ceil(pos)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


def percentiles(values, direction, winsor):
    idx = [k for k, v in enumerate(values) if v is not None]
    if len(idx) < 200:
        return [None] * len(values)
    vals = [values[k] for k in idx]
    if winsor:
        s = sorted(vals)
        lo, hi = quantile(s, .02), quantile(s, .98)
        vals = [min(max(v, lo), hi) for v in vals]
    order = sorted(range(len(vals)), key=lambda j: (vals[j], idx[j]))
    out = [None] * len(values)
    j = 0
    while j < len(order):
        e = j
        while e + 1 < len(order) and vals[order[e + 1]] == vals[order[j]]:
            e += 1
        pct = ((j + e) / 2) / (len(order) - 1) * 100
        for m in range(j, e + 1):
            out[idx[order[m]]] = 100 - pct if direction == "lower" else pct
        j = e + 1
    return out


def score_date(rows):
    comp = {}
    for f, lst in COMPONENTS.items():
        for cid, _, direction in lst:
            vals = [None if (r["template"] and f in ("quality", "value", "profitability")) else r["raws"].get(cid) for r in rows]
            comp[cid] = percentiles(vals, direction, cid not in NO_WINSOR)
    out = []
    for k, r in enumerate(rows):
        s = {}
        for f, lst in COMPONENTS.items():
            if r["template"] and f in ("quality", "value", "profitability"):
                s[f] = None
                continue
            avail = [(cid, w, comp[cid][k]) for cid, w, _ in lst if comp[cid][k] is not None]
            req = CONTRACT["factors"][f]["minimumDataRequirements"]
            wsum = sum(w for _, w, _ in avail)
            ok = len(avail) >= req["minimumComponents"] and wsum + 1e-9 >= req["minimumOriginalWeight"]
            have = {cid for cid, _, _ in avail}
            ok = ok and MANDATORY[f](lambda c: c in have)
            s[f] = sum(w * v for _, w, v in avail) / wsum if ok else None
        s["composite"] = sum(WEIGHTS[f] * s[f] for f in WEIGHTS) / sum(WEIGHTS.values()) if all(s[f] is not None for f in WEIGHTS) else None
        out.append(s)
    return out


# ---------------------------------------------------------------- D: IC
def spearman(xs, ys):
    def ranks(v):
        order = sorted(range(len(v)), key=lambda j: v[j])
        r = [0.0] * len(v)
        j = 0
        while j < len(order):
            e = j
            while e + 1 < len(order) and v[order[e + 1]] == v[order[j]]:
                e += 1
            for m in range(j, e + 1):
                r[order[m]] = (j + e) / 2
            j = e + 1
        return r
    a, b = ranks(xs), ranks(ys)
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    va, vb = sum((x - ma) ** 2 for x in a), sum((y - mb) ** 2 for y in b)
    return cov / math.sqrt(va * vb) if va > 0 and vb > 0 else None


def main():
    private = pathlib.Path(sys.argv[1])
    zpath = sys.argv[2]
    out_path = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    rng = random.Random(20261028)
    panel = json.loads(gzip.open(private / "panel.json.gz").read())
    perdate = json.loads(gzip.open(private / "study-perdate.json.gz").read())
    spy_doc = json.loads((ROOT / "quant/data/market/multi-asset/series/SPY.json").read_text())
    spy = {d: p for d, p in spy_doc["points"]}
    report = {"schemaVersion": "v10-factor-python-verification-1.0.0", "kind": "COMPUTATION_PARITY_NOT_HOLDOUT", "checks": {}}
    peers = json.loads((ROOT / "quant/data/product/sic-peer-taxonomy-v1.json").read_text())
    col = {n: i for i, n in enumerate(peers["rowColumns"])}
    cik_of = {r[col["securityId"]]: r[col["cik"]] for r in peers["rows"]}

    # ---- B: price components for a sample of (date, listing)
    cal_dates = panel["rankDates"]
    sample_dates = sorted(rng.sample(cal_dates, 24))
    b_n = b_fail = 0
    b_examples = []
    for d in sample_dates:
        day = next(x for x in panel["dates"] if x["date"] == d)
        for row in rng.sample(day["rows"], min(60, len(day["rows"]))):
            doc = series(row["id"])
            dates = [p[0] for p in doc["points"]]
            closes = [p[1] for p in doc["points"]]
            i = dates.index(d)
            mine = price_components(dates, closes, i, spy)
            for cid in [c for c, _, _ in COMPONENTS["momentum"] + COMPONENTS["risk"]]:
                b_n += 1
                if not close_enough(mine.get(cid), row["raws"].get(cid), 1e-9, 1e-12):
                    b_fail += 1
                    if len(b_examples) < 5:
                        b_examples.append([d, row["id"], cid, mine.get(cid), row["raws"].get(cid)])
    report["checks"]["B_priceComponents"] = {"comparisons": b_n, "mismatches": b_fail, "examples": b_examples}

    # ---- C: percentiles, factors, composite for sampled dates (full cross-sections)
    c_n = c_fail = 0
    c_examples = []
    for d in sample_dates[:12]:
        day = next(x for x in panel["dates"] if x["date"] == d)
        mine = score_date(day["rows"])
        for r, s in zip(day["rows"], mine):
            for f in list(WEIGHTS) + ["composite"]:
                c_n += 1
                if not close_enough(s[f], r["scores"].get(f), 1e-9, 1e-9):
                    c_fail += 1
                    if len(c_examples) < 5:
                        c_examples.append([d, r["id"], f, s[f], r["scores"].get(f)])
    report["checks"]["C_scores"] = {"comparisons": c_n, "mismatches": c_fail, "examples": c_examples, "dates": sample_dates[:12]}

    # ---- D: IC, quintile spread and SPY excess per date (all 7 signals, 4 horizons, sampled dates)
    d_n = d_fail = 0
    d_examples = []
    for d in sample_dates[:8]:
        day = next(x for x in panel["dates"] if x["date"] == d)
        for h in (4, 13, 26, 52):
            for sig in list(WEIGHTS) + ["composite"]:
                rec = next((x for x in perdate["%s:%d" % (sig, h)] if x["date"] == d), None)
                scored = [(r["scores"][sig], r["id"]) for r in day["rows"] if r["scores"].get(sig) is not None]
                scored.sort(key=lambda t: (t[0], t[1]))
                obs = []
                for k, (v, sid) in enumerate(scored):
                    doc = series(sid)
                    dates = [p[0] for p in doc["points"]]
                    i = dates.index(d)
                    if i + 1 + h < len(dates):
                        obs.append((v, doc["points"][i + 1 + h][1] / doc["points"][i + 1][1] - 1, min(4, k * 5 // len(scored)), dates[i + 1], dates[i + 1 + h]))
                if rec is None:
                    if len(scored) >= 200 and len(obs) >= 100:
                        d_fail += 1
                    continue
                ic = spearman([o[0] for o in obs], [o[1] for o in obs])
                q5 = [o[1] for o in obs if o[2] == 4]
                q1 = [o[1] for o in obs if o[2] == 0]
                spread = sum(q5) / len(q5) - sum(q1) / len(q1)
                a, z = obs[0][3], obs[0][4]
                ex = sum(q5) / len(q5) - (spy[z] / spy[a] - 1)
                for name, mine, theirs in (("ic", ic, rec["ic"]), ("spread", spread, rec["spread"]), ("excessSpy", ex, rec["excessSpy"]), ("n", float(len(scored)), float(rec["n"]))):
                    d_n += 1
                    if not close_enough(mine, theirs, 1e-9, 1e-12):
                        d_fail += 1
                        if len(d_examples) < 5:
                            d_examples.append([d, sig, h, name, mine, theirs])
    report["checks"]["D_ic_quintiles"] = {"comparisons": d_n, "mismatches": d_fail, "examples": d_examples}

    # ---- A: SEC raws from companyfacts directly
    z = zipfile.ZipFile(zpath)
    names = set(z.namelist())
    a_cases = []
    for d in sample_dates:
        day = next(x for x in panel["dates"] if x["date"] == d)
        cand = [r for r in day["rows"] if cik_of.get(r["id"]) and ("equityToAssets" in r["raws"] or r.get("marketCap"))]
        a_cases += [(d, r) for r in rng.sample(cand, min(15, len(cand)))]
    eq_n = eq_ok = mc_n = mc_ok = 0
    eq_diff, mc_diff = [], []
    facts_cache = {}
    for d, r in a_cases:
        cik = cik_of[r["id"]]
        name = "CIK%s.json" % cik
        if name not in names:
            continue
        if cik not in facts_cache:
            facts_cache[cik] = json.loads(z.read(name))
        facts = facts_cache[cik]
        cutoff = day_before(d)
        if "equityToAssets" in r["raws"]:
            a = latest_fy_instant(facts, "us-gaap", "Assets", cutoff)
            e = latest_fy_instant(facts, "us-gaap", "StockholdersEquity", cutoff)
            if a and e and a[0] == e[0] and a[1] > 0:
                eq_n += 1
                if close_enough(e[1] / a[1], r["raws"]["equityToAssets"], 1e-9, 1e-12):
                    eq_ok += 1
                elif len(eq_diff) < 8:
                    eq_diff.append([d, r["id"], e[1] / a[1], r["raws"]["equityToAssets"]])
        if r.get("marketCap"):
            s = latest_shares(facts, cutoff)
            if s:
                doc = series(r["id"])
                dates = [p[0] for p in doc["points"]]
                i = dates.index(d)
                k = max(j for j in range(i + 1) if dates[j] <= s[0]) if dates[0] <= s[0] else None
                if k is not None:
                    mc_n += 1
                    mine = s[1] * doc["points"][i][1] * split_factor_at(doc, dates, k)
                    if close_enough(mine, r["marketCap"], 1e-6, 1):
                        mc_ok += 1
                    elif len(mc_diff) < 8:
                        mc_diff.append([d, r["id"], mine, r["marketCap"]])
    report["checks"]["A_secRaw"] = {"cases": len(a_cases), "equityToAssets": {"comparable": eq_n, "equal": eq_ok, "differences": eq_diff},
                                    "marketCap": {"comparable": mc_n, "equal": mc_ok, "differences": mc_diff},
                                    "note": "Unabhaengige Auswahl: nur us-gaap Assets/StockholdersEquity aus 10-K(/A) FY und dei EntityCommonStockSharesOutstanding; die Pipeline nutzt weitere Konzepte, Quartalsbilanzen und Periodenregeln - Abweichungen sind erwartbar und werden gezaehlt, nicht angeglichen."}

    # ---- E: Top-50 ledger (BASE costs)
    led = json.loads(gzip.open(private / "strategy-ledgers.json.gz").read())
    targets = led["input"]["targets"]
    rate = (led["input"]["costs"]["feeBps"] + led["input"]["costs"]["slippageBps"]) / 1e4
    equity = led["BASE"]["equity"]
    sessions = [e[0] for e in equity]
    exec_map = {t[1]: t[2] for t in targets}
    px = {}

    def price(sid, d):
        if sid not in px:
            px[sid] = dict((p[0], p[1]) for p in series(sid)["points"])
        return px[sid][d]
    cash, units, mine_values = 100000.0, {}, []
    for d in sessions:
        before = cash + sum(u * price(s, d) for s, u in units.items())
        if d in exec_map:
            ids = exec_map[d]
            w = {s: 1 / 50 for s in ids}
            keys = set(units) | set(w)
            marked = {s: units.get(s, 0) * price(s, d) for s in keys}
            lo, hi = 0.0, before
            for _ in range(80):
                mid = (lo + hi) / 2
                cost = sum(abs(w.get(s, 0) * mid - marked[s]) for s in keys) * rate
                if mid + cost > before:
                    hi = mid
                else:
                    lo = mid
            after = (lo + hi) / 2
            for s in sorted(keys, key=lambda s: (w.get(s, 0) * after - marked[s], s)):
                delta = w.get(s, 0) * after - marked[s]
                if abs(delta) <= 1e-12 * 100000:
                    continue
                cash -= delta + abs(delta) * rate
                nu = units.get(s, 0) + delta / price(s, d)
                if abs(nu) <= 1e-12:
                    units.pop(s, None)
                else:
                    units[s] = nu
        mine_values.append(cash + sum(u * price(s, d) for s, u in units.items()))
    maxrel = max(abs(a - e[1]) / e[1] for a, e in zip(mine_values, equity))
    report["checks"]["E_ledger"] = {"sessions": len(sessions), "maxRelativeDifference": maxrel, "endEngine": equity[-1][1], "endPython": mine_values[-1]}

    report["state"] = "PASS" if (b_fail == 0 and c_fail == 0 and d_fail == 0 and maxrel < 1e-9) else "FAIL"
    report["inputSha256"] = hashlib.sha256(json.dumps([panel["rankDates"], sample_dates]).encode()).hexdigest()
    text = json.dumps(report, indent=1)
    if out_path:
        pathlib.Path(out_path).write_text(text + "\n")
    print(json.dumps({k: (v if not isinstance(v, dict) else {kk: vv for kk, vv in v.items() if kk not in ("examples", "differences")}) for k, v in report["checks"].items()}))
    print(report["state"])


if __name__ == "__main__":
    main()
