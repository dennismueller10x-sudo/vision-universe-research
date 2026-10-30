#!/usr/bin/env python3
"""V12 MCAP: independent Python cross-check (stdlib only, run with python3 -I).

Own implementation, not a port of quant/engines/research-pit-market-cap.cjs:
  * reads the SEC companyfacts bulk archive itself (zipfile) and selects its own share facts per accession,
  * keeps its own per-issuer "trusted level" (median of the last three accepted share counts in a common split basis),
  * decides with its own simpler rule (below), and recomputes every panel market cap by calendar dates.
Then it compares status per share observation and the corrected market cap per panel row with the JS register.

Own rule (registered here, deliberately different in form from rule 1.0.8):
  r = v / x for same-accession values x (ECSO, CSSO, WASO*), k = round(log10 r).
  CORRECT by 10^-k (|k| in {3,6,9}) if v/10^k is within 2 % of a same-accession value of the other source family
  (cover ECSO vs statements CSSO/WASO) and, when a trusted level exists, within 25 % of it; or, when a trusted level
  exists, the accession's own comparative facts are 10^k times the earlier filed values (2 %) that agree with the level.
  EXCLUDE if (with a trusted level) v deviates from it by >= 5x, or (without one) from the same-accession median by >= 5x,
  and no correction applies, unless a same-accession value of the other family confirms v within 2 %; EXCLUDE any use
  above 8e12 USD; EXCLUDE |k| in {1, 2} candidates. Otherwise OK.
Splits: market cap = v' x close(t) x F(t) x product of provider factors dated in (raw date, t]; factors listed in
docs/quant-recovery/v12/mcap/spinoff-sources-1.0.0.json (SEC 8-K) are removed from t >= availableAt.

Usage: python3 -I verify_mcap.py <private_dir> <companyfacts.zip> <register.cjs> <out.json>
"""
import bisect
import gzip
import json
import math
import pathlib
import statistics
import sys
import zipfile
from collections import Counter, defaultdict

COVER = {"dei": ["EntityCommonStockSharesOutstanding"]}
STATEMENT = {"us-gaap": ["CommonStockSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic",
                         "WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"]}
USED = {"dei:EntityCommonStockSharesOutstanding": ("dei", "EntityCommonStockSharesOutstanding"),
        "us-gaap:CommonStockSharesOutstanding": ("us-gaap", "CommonStockSharesOutstanding")}


def facts_of(payload):
    """[(family, concept, end, start, val, accn, filed)] for the share concepts, unit 'shares' only."""
    out = []
    for fam, spec in (("COVER", COVER), ("STATEMENTS", STATEMENT)):
        for tax, names in spec.items():
            for name in names:
                node = payload.get("facts", {}).get(tax, {}).get(name)
                if not node:
                    continue
                for f in node.get("units", {}).get("shares", []):
                    if isinstance(f.get("val"), (int, float)) and f["val"] > 0:
                        out.append((fam, tax + ":" + name, f.get("end"), f.get("start"), float(f["val"]), f.get("accn"), f.get("filed")))
    return out


def within(a, b, tol):
    return b > 0 and abs(a / b - 1) <= tol


def split_mult(splits, removed, a, b):
    """Shares as of date a expressed as of date b (a <= b): product of kept factors dated in (a, b]."""
    m = 1.0
    for d, f in splits:
        if a < d <= b and (d, f) not in removed:
            m *= f
    return m


def main():
    priv, zpath, regpath, outpath = map(pathlib.Path, sys.argv[1:5])
    obs = json.load(gzip.open(priv / "observations.json.gz"))
    rows_js = json.load(gzip.open(priv / "rows-corrected.json.gz"))["rows"]
    reg_text = regpath.read_text()
    reg = json.loads(reg_text[reg_text.index("module.exports = ") + len("module.exports = "):].rstrip().rstrip(";"))
    cols = reg["factColumns"]
    js_fact = {}
    for cik, lst in reg["facts"].items():
        for r in lst:
            js_fact[(cik, r[0], r[1], r[2])] = dict(zip(cols, r))
    spin = json.loads((pathlib.Path(__file__).resolve().parents[4] / "docs/quant-recovery/v12/mcap/spinoff-sources-1.0.0.json").read_text())
    spin_by = defaultdict(list)
    for s in spin["records"]:
        spin_by[s["securityId"]].append((s["date"], s["factor"], max(s["availableAt"], s["date"])))
    by_id = defaultdict(list)
    for r in obs["rows"]:
        by_id[r["id"]].append(r)
    z = zipfile.ZipFile(zpath)
    names = set(z.namelist())
    py_fact, py_rows = {}, {}
    for sid in sorted(by_id):
        L = obs["listings"][sid]
        cik = L["cik"]
        name = "CIK%s.json" % cik
        if name not in names:
            continue
        facts = facts_of(json.loads(z.read(name)))
        by_accn = defaultdict(list)
        for f in facts:
            by_accn[f[5]].append(f)
        splits = [(d, f) for d, f in L["splits"]]
        level_hist = []  # (filed, shares in current basis)
        distinct = {}
        for r in by_id[sid]:
            s = r["s"]
            key = (s["accn"], s["concept"], s["v"])
            distinct.setdefault(key, {"s": s, "uses": []})["uses"].append(r)
        for key in sorted(distinct, key=lambda k: (distinct[k]["s"]["filed"], k[0], k[1])):
            s, uses = distinct[key]["s"], distinct[key]["uses"]
            v, accn, filed = float(s["v"]), s["accn"], s["filed"]
            tax, nm = USED[s["concept"]]
            fam_used = "COVER" if tax == "dei" else "STATEMENTS"
            same = by_accn.get(accn, [])
            own = [f for f in same if f[1] == s["concept"] and abs(f[4] - v) <= 1e-6 * v]
            raw_date = own[0][2] if own else s["end"]
            # trusted level: median of the last three accepted counts, converted to raw_date basis via current basis
            to_cur = lambda val, date: val * split_mult(splits, set(), date, "9999-12-31")
            level = None
            prev = [x for x in level_hist if x[0] < filed][-3:]
            if prev:
                level = statistics.median(x[1] for x in prev) / split_mult(splits, set(), raw_date, "9999-12-31")
            others = [f for f in same if not (f[1] == s["concept"] and abs(f[4] - v) <= 1e-6 * v) and f[2] and abs((date_num(f[2]) - date_num(raw_date))) <= 120]
            other_fam = [f for f in others if f[0] != fam_used]
            status, vp, why = "OK", v, None
            prices = [u["close"] * u["fI"] * split_mult(splits, set(), raw_date, u["t"]) for u in uses]
            dev_ref = level if level else (statistics.median(f[4] for f in others) if others else None)
            deviates = dev_ref is not None and abs(math.log10(v / dev_ref)) >= math.log10(5)
            confirmed = any(within(v, f[4], 0.02) for f in other_fam)
            if deviates and not confirmed:
                status, vp, why = "EXCLUDED", None, "DEVIATES"
                for k in (3, 6, 9, -3, -6, -9):
                    cand = v / 10 ** k
                    ok_level = level is None or within(cand, level, 0.25)
                    hit = any(within(cand, f[4], 0.02) for f in other_fam)
                    comp = False
                    if level is not None:
                        for f in same:
                            earlier = [g for a2, lst in by_accn.items() for g in lst if g[1] == f[1] and g[2] == f[2] and g[3] == f[3] and g[6] < filed]
                            if earlier:
                                g = max(earlier, key=lambda g: g[6])
                                if within(g[4] * split_mult(splits, set(), g[2], raw_date) if g[2] <= raw_date else g[4], level, 0.25) and within(f[4] / g[4], 10 ** k, 0.02):
                                    comp = True
                                    break
                    if ok_level and (hit or comp) and all(1e6 <= cand * p <= 8e12 for p in prices):
                        status, vp, why = "CORRECTED", cand, "SCALE_%d" % k
                        break
                if status == "EXCLUDED":
                    for k in (1, 2, -1, -2):
                        if level is not None and within(v / 10 ** k, level, 0.25):
                            why = "DECIMAL_SCALE"
            if status != "EXCLUDED" and any(vp * p > 8e12 for p in prices):
                status, vp, why = "EXCLUDED", None, "ABSOLUTE_BOUND"
            if status != "EXCLUDED":
                level_hist.append((filed, to_cur(vp, raw_date)))
            py_fact[(cik,) + key] = (status, vp, why)
            removed_at = spin_by.get(sid, [])
            for u in uses:
                if status == "EXCLUDED":
                    py_rows[(sid, u["t"])] = None
                    continue
                removed = {(d, f) for d, f, av in removed_at if av < u["t"]}
                py_rows[(sid, u["t"])] = vp * u["close"] * u["fI"] * split_mult(splits, removed, raw_date, u["t"])
    # ---- compare with JS
    code = {"dei:EntityCommonStockSharesOutstanding": "ECSO", "us-gaap:CommonStockSharesOutstanding": "CSSO"}
    agree, total, value_agree, value_n = Counter(), 0, 0, 0
    disagreements = []
    for (cik, accn, concept, v), (st, vp, why) in py_fact.items():
        j = js_fact.get((cik, accn, code[concept], v))
        jst = j["status"] if j else "OK"
        jvp = (j["vPrime"] if j and j["status"] == "CORRECTED" else (v if jst == "OK" else None))
        agree[(jst, st)] += 1
        total += 1
        if jst == st == "CORRECTED":
            value_n += 1
            value_agree += int(abs(jvp / vp - 1) <= 1e-9)
        if jst != st and len(disagreements) < 60:
            disagreements.append({"cik": cik, "accession": accn, "concept": code[concept], "value": v, "js": jst, "jsClass": j["class"] if j else "OK", "python": st, "pythonReason": why})
    row_cmp = Counter()
    max_rel = 0.0
    for r in rows_js:
        p = py_rows.get((r["id"], r["t"]), "MISSING")
        a = r["after"]
        if p == "MISSING":
            row_cmp["PY_MISSING"] += 1
        elif a is None and p is None:
            row_cmp["BOTH_EXCLUDED"] += 1
        elif a is None or p is None:
            row_cmp["JS_EXCLUDED_PY_VALUE" if a is None else "JS_VALUE_PY_EXCLUDED"] += 1
        else:
            rel = abs(a / p - 1)
            max_rel = max(max_rel, rel) if rel <= 1e-6 else max_rel
            row_cmp["VALUE_EQUAL_1E-9" if rel <= 1e-9 else "VALUE_DIFFERENT"] += 1
    status_agreement = sum(n for (a, b), n in agree.items() if a == b) / total if total else None
    out = {"schemaVersion": "v12-mcap-python-check-1.0.0", "registerRuleVersion": reg["ruleVersion"], "registerRuleSha256": reg["ruleSha256"],
           "implementation": "independent stdlib Python, own fact selection from companyfacts.zip, own rule (see module docstring)",
           "facts": total, "statusMatrix_js_vs_python": {"%s|%s" % k: n for k, n in sorted(agree.items())}, "statusAgreement": round(status_agreement, 6) if status_agreement else None,
           "correctedValueAgreement": {"bothCorrected": value_n, "sameValue": value_agree},
           "rows": dict(row_cmp), "disagreementSample": disagreements,
           "verdict": "SEE_MATRIX: agreement is reported, the Python rule is not tuned to the JS result"}
    outpath.write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps({k: out[k] for k in ("facts", "statusMatrix_js_vs_python", "statusAgreement", "correctedValueAgreement", "rows")}))


_DN = {}


def date_num(d):
    if d not in _DN:
        y, m, dd = int(d[:4]), int(d[5:7]), int(d[8:10])
        _DN[d] = (y * 372 + (m - 1) * 31 + dd)  # monotone day index, adequate for a 120-day window test
    return _DN[d]


if __name__ == "__main__":
    main()
