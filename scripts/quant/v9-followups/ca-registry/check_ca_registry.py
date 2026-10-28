"""Independent check (Python stdlib only) for the V9 follow-up corporate-action registry.

Separate implementation; it imports nothing from the repository. It re-derives from raw inputs:
  1. the unresolved split-sized events per series from the weekly series files (own split-size / resolve logic),
  2. every class decision of protocol.json from the stored facts plus the series (decision order, windows, share ratio,
     spike reversal recomputed from the series points),
  3. the registry content (admissible series only, closes bound to the series points),
  4. the sha256 of every registry source body against the private raw cache,
  5. the before/after counts (newly qualified ids == registry series that failed only at the CA gate).
Usage:
  python3 -I check_ca_registry.py --root <repo> --facts <facts.jsonl> --before-after <json> --cache <http-cache> --out <json>
"""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import math
import os
import re

RATIOS = (2, 3, 4, 5, 10)
TOL = 0.03
DOMINANT = 0.75
ADMISSIBLE = {"GENUINE_MOVE": "PRICE_RETURN", "SPINOFF_DISTRIBUTION": "PRICE_RETURN_ONLY"}


def split_sized(r):
    if not (isinstance(r, (int, float)) and math.isfinite(r) and r > 0):
        return False
    return any(abs(r / k - 1) < TOL or abs(r * k - 1) < TOL for k in RATIOS)


def unresolved_events(doc):
    pts = doc.get("points") or []
    ev = doc.get("corporateActions")
    out = []
    for i in range(1, len(pts)):
        if not split_sized(pts[i][1] / pts[i - 1][1]):
            continue
        t = pts[i][0]
        moves = (ev or {}).get("moves") if ev and ev.get("version") == "corporate-action-evidence-1.0.0" else None
        m = next((x for x in moves if x["week"] == t), None) if isinstance(moves, list) else None
        if m is None:
            reason = "NO_EVIDENCE"
        elif m["splitInWeek"]:
            reason = "PROVIDER_SPLIT_IN_WEEK"
        elif not isinstance(m.get("maxDailyRatio"), (int, float)):
            reason = "NO_DAILY_BARS"
        elif split_sized(m["maxDailyRatio"]):
            reason = "SINGLE_DAY_SPLIT_SIZED_JUMP"
        elif abs(math.log(m["maxDailyRatio"])) >= DOMINANT * abs(math.log(m["weeklyRatio"])):
            reason = "SINGLE_DAY_DOMINATES_WEEK"
        else:
            continue
        out.append({"week": t, "prevWeek": pts[i - 1][0], "prevClose": pts[i - 1][1], "close": pts[i][1], "reason": reason,
                    "jumpDay": (m or {}).get("maxDailyDate") or t, "next": pts[i + 1:i + 3]})
    return out


def shift(s, days):
    return (dt.date.fromisoformat(s) + dt.timedelta(days=days)).isoformat()


def any_date_in(f, lo, hi):
    return any(x and lo <= x <= hi for x in (f.get("reportDate"), f.get("filingDate")))


def decide(s, e, series_ev):
    """Own re-implementation of protocol.json#decisionOrder over the stored facts."""
    if not all(x["week"] >= "2011-07-01" for x in series_ev):
        return "OUT_OF_FRAME_PRE_XBRL"
    if "error" in s:  # fetch/parse failure after retries: never admitted
        return "INSUFFICIENT_FILINGS"
    if e["reason"] == "PROVIDER_SPLIT_IN_WEEK":
        return "PROVIDER_SPLIT_RECORDED"
    if not s.get("candidateCiks"):
        return "IDENTITY_UNVERIFIED" if "candidateCiks" in s else "INSUFFICIENT_FILINGS"
    passing = []
    results = []
    for idr in e.get("identity", []):
        b, a = idr["before"], idr["after"]
        if not b or not a or not (b["coverDate"] and b["coverDate"] <= e["prevWeek"] and b["filingDate"] >= shift(e["week"], -400)) \
                or not (a["coverDate"] and a["coverDate"] >= e["week"] and a["filingDate"] <= shift(e["week"], 400)):
            results.append("INSUFFICIENT_FILINGS")
            continue
        if not (b["namesTicker"] and a["namesTicker"]):
            results.append("NOT_NAMED")
            continue
        if b["otherNonDimSymbol"] or a["otherNonDimSymbol"]:
            results.append("REUSE")
            continue
        ex = idr.get("exchangeEvidence") or {}
        codes = {"NASDAQ": {"NASDAQ"}, "NYSE": {"NYSE"}, "AMEX": {"NYSEAMER", "NYSEMKT"}, "NYSE MKT": {"NYSEAMER", "NYSEMKT"}}[s["exchange"]]
        tagged = b["exchanges"] + a["exchanges"]
        ok = any(v.upper() in codes for v in tagged) if tagged else bool(ex.get("result"))
        results.append("PASS" if ok else "EXCHANGE")
        if ok:
            passing.append(idr)
    if len(passing) != 1:
        if len(passing) > 1:
            return "IDENTITY_UNVERIFIED"
        return "INSUFFICIENT_FILINGS" if results and all(r == "INSUFFICIENT_FILINGS" for r in results) else "IDENTITY_UNVERIFIED"
    idr = passing[0]
    ratio = idr["after"]["shares"] / idr["before"]["shares"]
    if not (0.8 <= ratio <= 1.25):
        return "SPLIT_OR_SHARE_CHANGE_EVIDENCE"
    if [f for f in e["xbrlSplitFacts"] if shift(e["prevWeek"], -400) <= f["end"] <= shift(e["week"], 400)]:
        return "SPLIT_OR_SHARE_CHANGE_EVIDENCE"
    if e["periodicText"]["match"]:
        return "SPLIT_OR_SHARE_CHANGE_EVIDENCE"
    down = e["close"] < e["prevClose"]
    if down:
        for c in e.get("spinoffCandidates", []):
            if not any_date_in(c, shift(e["week"], -120), shift(e["week"], 14)):
                continue
            if any(e["prevWeek"] < h["date"] <= e["week"] for h in c["distributionDateHits"]) and not c["splitMatchesOtherThanStockDividend"]:
                return "SPINOFF_DISTRIBUTION"
    for k in e.get("splitWindow8K", []):
        if any_date_in(k, shift(e["prevWeek"], -90), shift(e["week"], 45)) and k["match"]:
            return "SPLIT_OR_SHARE_CHANGE_EVIDENCE"
    if any(abs(math.log(p[1] / e["prevClose"])) <= math.log(1.25) for p in e["next"]):
        return "SPIKE_REVERSAL"
    for c in e.get("affirmativeCandidates", []):
        items = set(c["items"]) & {"1.01", "1.02", "1.03", "2.01", "2.02", "2.05", "2.06", "3.01", "4.02", "5.01", "7.01", "8.01"}
        if items and any_date_in(c, shift(e["jumpDay"], -3), shift(e["jumpDay"], 1)) and not c["splitMatch"]:
            return "GENUINE_MOVE"
    return "NEGATIVE_EVIDENCE_ONLY"


def load_cjs_json(path):
    text = open(path, encoding="utf-8").read()
    start = text.index("module.exports = ") + len("module.exports = ")
    return json.loads(text[start:].rstrip().rstrip(";"))


def cached_sha(cache, url):
    h = hashlib.sha256(url.encode()).hexdigest()
    p = os.path.join(cache, h[:2], h + ".gz")
    if not os.path.exists(p):
        return None
    with gzip.open(p, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--facts", required=True)
    ap.add_argument("--before-after", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root = a.root
    proto_bytes = open(os.path.join(root, "docs/quant-recovery/v9-followups/ca-registry/protocol.json"), "rb").read()
    proto_sha = hashlib.sha256(proto_bytes).hexdigest()
    facts = [json.loads(l) for l in open(a.facts) if l.strip()]
    series_dir = os.path.join(root, "quant/data/market/discover-series-long")
    frame_mismatch, decision_mismatch, verdicts = [], [], {}
    events_total = 0
    for s in facts:
        doc = json.load(open(os.path.join(series_dir, s["securityId"] + ".json")))
        mine = unresolved_events(doc)
        events_total += len(mine)
        got = [(e["week"], e["prevWeek"], e["prevClose"], e["close"], e["reason"]) for e in s["events"]]
        if got != [(e["week"], e["prevWeek"], e["prevClose"], e["close"], e["reason"]) for e in mine]:
            frame_mismatch.append(s["securityId"])
            continue
        for e, m in zip(s["events"], mine):
            e2 = dict(e, jumpDay=m["jumpDay"], next=m["next"])
            v = decide(s, e2, mine)
            verdicts[v] = verdicts.get(v, 0) + 1
            if v != e["verdict"]:
                decision_mismatch.append({"securityId": s["securityId"], "week": e["week"], "facts": e["verdict"], "check": v})
    # registry == admissible series
    reg = load_cjs_json(os.path.join(root, "quant/engines/research-ca-evidence.cjs"))
    expected = {}
    for s in facts:
        if s["events"] and all(e["verdict"] in ADMISSIBLE for e in s["events"]):
            for e in s["events"]:
                expected[(s["securityId"], e["week"])] = (e["verdict"], s["canonicalId"])
    got = {(r["securityId"], r["week"]): (r["class"], r["canonicalId"]) for r in reg["records"]}
    registry_problems = []
    if got != expected:
        registry_problems.append({"missing": sorted(map(list, set(expected) - set(got))), "extra": sorted(map(list, set(got) - set(expected)))})
    sha_ok = sha_bad = sha_missing = 0
    for r in reg["records"]:
        doc = json.load(open(os.path.join(series_dir, r["securityId"] + ".json")))
        pts = {p[0]: p[1] for p in doc["points"]}
        if not (abs(pts.get(r["week"], -1) - r["close"]) <= 1e-5 * r["close"] and abs(pts.get(r["prevWeek"], -1) - r["prevClose"]) <= 1e-5 * r["prevClose"]
                and abs(r["close"] / r["prevClose"] - r["weeklyRatio"]) <= 1e-5 and r["returnBasis"] == ADMISSIBLE[r["class"]] and r["protocolSha256"] == proto_sha):
            registry_problems.append({"record": [r["securityId"], r["week"]], "problem": "BINDING"})
        for src in r["sources"]:
            h = cached_sha(a.cache, src["url"])
            if h is None:
                sha_missing += 1
            elif h == src["sha256"]:
                sha_ok += 1
            else:
                sha_bad += 1
                registry_problems.append({"record": [r["securityId"], r["week"]], "problem": "SOURCE_SHA", "url": src["url"]})
    # before/after
    ba = json.load(open(a.before_after))
    reg_series = sorted({r["securityId"] for r in reg["records"]})
    nq = ba["newlyQualified"]
    ba_ok = (sorted(x["securityId"] for x in nq) == reg_series
             and all(x["before"] == "CORPORATE_ACTION_UNRESOLVED" and x["after"] == "QUALIFIED" for x in nq)
             and ba["qualified"]["identityCa"] == ba["qualified"]["identity"] + len(reg_series)
             and sorted(ba["changed"]["identityCaVsIdentity"]) == reg_series
             and ba["defaultPathParity"]["identical"] == ba["defaultPathParity"]["ids"]
             and ba["current"]["adapterIdenticalToBaseline"] is True)
    report = {
        "schemaVersion": "v9-followup-ca-independent-check-1.0.0", "implementation": "python3 stdlib, no repository imports",
        "protocolSha256": proto_sha, "series": len(facts), "events": events_total,
        "frameParity": {"series": len(facts), "mismatches": frame_mismatch},
        "decisionParity": {"events": sum(verdicts.values()), "identical": sum(verdicts.values()) - len(decision_mismatch), "mismatches": decision_mismatch, "verdicts": dict(sorted(verdicts.items()))},
        "registry": {"records": len(reg["records"]), "series": len(reg_series), "expectedRecords": len(expected), "problems": registry_problems,
                     "sourceSha256": {"ok": sha_ok, "mismatch": sha_bad, "notInCache": sha_missing}},
        "beforeAfter": {"consistent": ba_ok, "qualified": ba["qualified"], "newlyQualified": reg_series},
    }
    report["pass"] = (not frame_mismatch and not decision_mismatch and not registry_problems and sha_bad == 0 and sha_missing == 0 and ba_ok)
    with open(a.out, "w") as fh:
        fh.write(json.dumps(report, indent=1) + "\n")
    print(json.dumps({"pass": report["pass"], "events": events_total, "decisionMismatches": len(decision_mismatch), "frameMismatches": len(frame_mismatch),
                      "registry": report["registry"]["records"], "sha": report["registry"]["sourceSha256"], "beforeAfter": ba_ok}))


if __name__ == "__main__":
    main()
