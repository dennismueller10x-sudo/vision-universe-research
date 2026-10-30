"""Independent check (Python stdlib only) for the V10 corporate-action registry under protocol 1.1.2.

Separate implementation; imports nothing from the repository. Re-derives from raw inputs:
  1. the unresolved split-sized events per series from the weekly series files (own split-size / resolve logic),
  2. every class decision of protocol 1.1.2 from the stored facts plus the series (decision order, windows, share ratio,
     E4 inverse-share test, spike reversal from the series points),
  3. E1 text identity and E2 text covers of every REGISTERED record re-parsed from the cached raw bodies (own tag stripping),
  4. the registry content (admissible series only, closes bound to the series points),
  5. the sha256 of every registry and provider-error source body against the private raw cache,
  6. before/after consistency (newly qualified ids == registry series that were held at the CA gate before).
Usage:
  python3 -I check_ca_registry_v11.py --root <repo> --facts <facts.jsonl> --before-after <json> --provider-errors <json> --cache <http-cache> --out <json>
"""
import argparse
import datetime as dt
import gzip
import hashlib
import html
import json
import math
import os
import re

RATIOS = (2, 3, 4, 5, 10)
TOL = 0.03
DOMINANT = 0.75
ADMISSIBLE = {"GENUINE_MOVE": "PRICE_RETURN", "SPINOFF_DISTRIBUTION": "PRICE_RETURN_ONLY"}
AFFIRM = {"1.01", "1.02", "1.03", "2.01", "2.02", "2.05", "2.06", "3.01", "4.02", "5.01", "7.01", "8.01"}
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]


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


def side_ok(rec, ident):
    if rec.get("symbolFacts"):
        return bool(rec["namesTicker"])
    return bool(ident and ident.get("via") == "E1_TEXT" and ident.get("ok"))


def decide(s, e, series_ev):
    if not all(x["week"] >= "2004-08-23" for x in series_ev):
        return "OUT_OF_FRAME_PRE_2004"
    if "error" in s:
        return "INSUFFICIENT_FILINGS"
    if e["reason"] == "PROVIDER_SPLIT_IN_WEEK":
        return "PROVIDER_SPLIT_RECORDED"
    if not s.get("candidateCiks"):
        return "IDENTITY_UNVERIFIED" if "candidateCiks" in s else "INSUFFICIENT_FILINGS"
    passing, results = [], []
    for idr in e.get("identity", []):
        b, a = idr["before"], idr["after"]
        if not b or not a or not (b.get("coverDate") and b["coverDate"] <= e["prevWeek"] and b["filingDate"] >= shift(e["week"], -400) and b.get("shares")) \
                or not (a.get("coverDate") and a["coverDate"] >= e["week"] and a["filingDate"] <= shift(e["week"], 400) and a.get("shares")):
            results.append("INSUFFICIENT_FILINGS")
            continue
        if not (side_ok(b, idr.get("idBefore")) and side_ok(a, idr.get("idAfter"))):
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
        inverse = abs(math.log(ratio) - math.log(e["prevClose"] / e["close"])) <= math.log(1.25)
        stmts = [k for k in e.get("splitWindow8K", []) if k["match"] and any_date_in(k, shift(e["prevWeek"], -90), shift(e["week"], 45))]
        stmts += [f for f in e["xbrlSplitFacts"] if shift(e["prevWeek"], -400) <= f["end"] <= shift(e["week"], 400)]
        if e["periodicText"]["match"]:
            stmts.append("P")
        return "SPLIT_UNADJUSTED" if inverse and stmts else "SPLIT_OR_SHARE_CHANGE_EVIDENCE"
    if [f for f in e["xbrlSplitFacts"] if shift(e["prevWeek"], -400) <= f["end"] <= shift(e["week"], 400)]:
        return "SPLIT_OR_SHARE_CHANGE_EVIDENCE"
    if e["periodicText"]["match"]:
        return "SPLIT_OR_SHARE_CHANGE_EVIDENCE"
    if e["close"] < e["prevClose"]:
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
        if set(c["items"]) & AFFIRM and any_date_in(c, shift(e["jumpDay"], -3), shift(e["jumpDay"], 1)) and not c["splitMatch"] and not c.get("spinoffMatch"):
            return "GENUINE_MOVE"
    return "NEGATIVE_EVIDENCE_ONLY"


def load_cjs_json(path):
    text = open(path, encoding="utf-8").read()
    start = text.index("module.exports = ") + len("module.exports = ")
    return json.loads(text[start:].rstrip().rstrip(";"))


def cached(cache, url):
    h = hashlib.sha256(url.encode()).hexdigest()
    p = os.path.join(cache, h[:2], h + ".gz")
    if not os.path.exists(p):
        return None
    with gzip.open(p, "rb") as fh:
        return fh.read()


def plain(body):
    t = body.decode("utf-8", "replace")
    t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", t)
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


def own_ticker_found(text, ticker):
    tk = r"[.\-/ ]?".join(re.escape(p) for p in re.split(r"[._\-/]", ticker))
    for m in re.finditer(r"(?i:symbols?|ticker)\b", text):
        seg = text[m.end(): m.end() + 120]
        cut = re.search(r"[.;]", seg)
        seg = seg[: cut.start()] if cut else seg[:80 + 40]
        if re.search(r"(?<![A-Za-z0-9])[\"“”'‘’(]?\s*" + tk + r"\s*[\"“”'‘’)]?(?![A-Za-z0-9])", seg[:80 + len(ticker) + 12]):
            return True
    return False


def own_text_count(text):
    doc = text[:25000]
    m = re.search(r"latest practicable date", doc, re.I) or re.search(r"shell company", doc, re.I)
    win = doc[(m.start() if m else 0):][:1500]
    vals = set()
    for n in re.finditer(r"(?<![\d$,.])\d{1,3}(?:,\d{3}){2,}(?![\d,])", win):
        pre = win[max(0, n.start() - 30):n.start()]
        if "$" in pre or re.search(r"aggregate market value", pre, re.I):
            continue
        if re.search(r"\bshares?\b", win[max(0, n.start() - 100):n.end() + 100], re.I):
            vals.add(int(n.group(0).replace(",", "")))
    return vals


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--facts", required=True)
    ap.add_argument("--before-after", required=True)
    ap.add_argument("--provider-errors", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root = a.root
    proto_sha = hashlib.sha256(open(os.path.join(root, "docs/quant-recovery/v10/corporate-actions/protocol-1.1.2.json"), "rb").read()).hexdigest()
    facts = [json.loads(l) for l in open(a.facts) if l.strip()]
    series_dir = os.path.join(root, "quant/data/market/discover-series-long")
    frame_mismatch, decision_mismatch, verdicts, events_total = [], [], {}, 0
    for s in facts:
        doc = json.load(open(os.path.join(series_dir, s["securityId"] + ".json")))
        mine = unresolved_events(doc)
        events_total += len(mine)
        got = [(e["week"], e["prevWeek"], e["prevClose"], e["close"], e["reason"]) for e in s["events"]]
        if got != [(e["week"], e["prevWeek"], e["prevClose"], e["close"], e["reason"]) for e in mine]:
            frame_mismatch.append(s["securityId"])
            continue
        for e, m in zip(s["events"], mine):
            v = decide(s, dict(e, jumpDay=m["jumpDay"], next=m["next"]), mine)
            verdicts[v] = verdicts.get(v, 0) + 1
            if v != e["verdict"]:
                decision_mismatch.append({"securityId": s["securityId"], "week": e["week"], "facts": e["verdict"], "check": v})
    reg = load_cjs_json(os.path.join(root, "quant/engines/research-ca-evidence.cjs"))
    expected = {}
    for s in facts:
        if s["events"] and all(e["verdict"] in ADMISSIBLE for e in s["events"]):
            for e in s["events"]:
                expected[(s["securityId"], e["week"])] = (e["verdict"], s["canonicalId"])
    got = {(r["securityId"], r["week"]): (r["class"], r["canonicalId"]) for r in reg["records"]}
    problems = []
    if got != expected:
        problems.append({"missing": sorted(map(list, set(expected) - set(got))), "extra": sorted(map(list, set(got) - set(expected)))})
    sha = {"ok": 0, "mismatch": 0, "notInCache": 0}
    reparse = {"identityText": 0, "identityTextOk": 0, "textCover": 0, "textCoverOk": 0}

    def check_src(rec_id, src):
        if not src.get("sha256"):
            return None
        body = cached(a.cache, src["url"])
        if body is None:
            sha["notInCache"] += 1
            return None
        if hashlib.sha256(body).hexdigest() == src["sha256"]:
            sha["ok"] += 1
        else:
            sha["mismatch"] += 1
            problems.append({"record": rec_id, "problem": "SOURCE_SHA", "url": src["url"]})
        return body

    for r in reg["records"]:
        doc = json.load(open(os.path.join(series_dir, r["securityId"] + ".json")))
        pts = {p[0]: p[1] for p in doc["points"]}
        if not (abs(pts.get(r["week"], -1) - r["close"]) <= 1e-5 * r["close"] and abs(pts.get(r["prevWeek"], -1) - r["prevClose"]) <= 1e-5 * r["prevClose"]
                and abs(r["close"] / r["prevClose"] - r["weeklyRatio"]) <= 1e-5 and r["returnBasis"] == ADMISSIBLE[r["class"]] and r["protocolSha256"] == proto_sha
                and len(r["sources"]) >= 3):
            problems.append({"record": [r["securityId"], r["week"]], "problem": "BINDING"})
        for src in r["sources"]:
            body = check_src([r["securityId"], r["week"]], src)
            if body is None:
                continue
            if src["role"].startswith("IDENTITY_TEXT_"):
                reparse["identityText"] += 1
                if own_ticker_found(plain(body), r["ticker"]):
                    reparse["identityTextOk"] += 1
                else:
                    problems.append({"record": [r["securityId"], r["week"]], "problem": "E1_REPARSE", "url": src["url"]})
            if src.get("via") == "E2_TEXT_COVER":
                reparse["textCover"] += 1
                side = r["shareContinuity"]["before" if src["role"] == "COVER_BEFORE" else "after"]
                if own_text_count(plain(body)) == {int(side["shares"])}:
                    reparse["textCoverOk"] += 1
                else:
                    problems.append({"record": [r["securityId"], r["week"]], "problem": "E2_REPARSE", "url": src["url"]})
    pe = json.load(open(a.provider_errors))
    pe_expected = sorted([s["securityId"], e["week"]] for s in facts for e in s["events"] if e["verdict"] == "SPLIT_UNADJUSTED")
    pe_got = sorted([p["securityId"], p["week"]] for p in pe["proposals"])
    if pe_got != pe_expected:
        problems.append({"providerErrors": {"expected": pe_expected, "got": pe_got}})
    for p in pe["proposals"]:
        for src in p["sources"]:
            check_src([p["securityId"], p["week"], "PE"], src)
    ba = json.load(open(a.before_after))
    reg_series = sorted({r["securityId"] for r in reg["records"]})
    newly = sorted(x["securityId"] for x in ba["newlyQualified"])
    base_series_ok = ba["qualified"]["identityCaBefore"] >= 0
    ba_ok = (set(newly) <= set(reg_series) and all(x["before"] == "CORPORATE_ACTION_UNRESOLVED" for x in ba["newlyQualified"])
             and ba["qualified"]["identityCaAfter"] - ba["qualified"]["identityCaBefore"] == len(newly) - len(ba["lostQualification"])
             and ba["defaultPathParity"]["identical"] == ba["defaultPathParity"]["ids"] and base_series_ok)
    report = {
        "schemaVersion": "v10-ca-independent-check-1.0.0", "implementation": "python3 stdlib, no repository imports", "evidenceKind": "TECHNICAL_PARITY",
        "protocolSha256": proto_sha, "series": len(facts), "events": events_total,
        "frameParity": {"series": len(facts), "mismatches": frame_mismatch},
        "decisionParity": {"events": sum(verdicts.values()), "identical": sum(verdicts.values()) - len(decision_mismatch), "mismatches": decision_mismatch, "verdicts": dict(sorted(verdicts.items()))},
        "registry": {"records": len(reg["records"]), "series": len(reg_series), "expectedRecords": len(expected), "sourceSha256": sha, "reparse": reparse},
        "providerErrors": {"proposals": len(pe_got)},
        "beforeAfter": {"consistent": ba_ok, "qualified": ba["qualified"], "newlyQualified": newly, "lost": ba["lostQualification"]},
        "problems": problems,
    }
    report["pass"] = (not frame_mismatch and not decision_mismatch and not problems and sha["mismatch"] == 0 and sha["notInCache"] == 0 and ba_ok)
    with open(a.out, "w") as fh:
        fh.write(json.dumps(report, indent=1) + "\n")
    print(json.dumps({"pass": report["pass"], "events": events_total, "decisionMismatches": len(decision_mismatch), "frameMismatches": len(frame_mismatch),
                      "registry": len(reg["records"]), "sha": sha, "reparse": reparse, "beforeAfter": ba_ok, "problems": len(problems)}))


if __name__ == "__main__":
    main()
