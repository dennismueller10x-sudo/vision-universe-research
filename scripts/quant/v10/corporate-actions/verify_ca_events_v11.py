"""V10 corporate actions: verify the CA candidate frame under protocol 1.1.2 (= 1.1.0 + E2 anchor amendment + E6).

Implements docs/quant-recovery/v10/corporate-actions/protocol-1.1.2.json. Every 1.0.0 rule is taken from the frozen V9
verifier module (scripts/quant/v9-followups/ca-registry/verify_ca_events.py, imported read-only as a library: regexes,
instance parsing, cover facts, exchange check, split concepts, 8-K texts). This file adds E1-E5 and the 1.1.0 decision order.
Raw SEC bodies: fetched through scripts/quant/sec/http_client.py at <= 1 request/s into a private cache outside the repo.

Output (private, --facts-out): one JSON line per series with every collected fact and the per-event verdict.
Usage:
  python3 scripts/quant/v10/corporate-actions/verify_ca_events_v11.py --frame <frame.json> --cache-dir <dir> --facts-out <facts.jsonl> [--only ref_X,...]
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
_spec = importlib.util.spec_from_file_location("v9ca", ROOT / "scripts/quant/v9-followups/ca-registry/verify_ca_events.py")
V9 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(V9)
http_client = V9.http_client

PROTOCOL = ROOT / "docs/quant-recovery/v10/corporate-actions/protocol-1.1.2.json"
P = json.loads(PROTOCOL.read_text())
PROTOCOL_SHA = hashlib.sha256(PROTOCOL.read_bytes()).hexdigest()
assert P["supersedes"]["sha256"] == V9.PROTOCOL_SHA, "1.0.0 protocol changed"
# 1.0.0 rules are unchanged in 1.1.0 (asserted, not re-typed)
for k in ("SPLIT_REGEX", "SPLIT_REGEX_STRONG"):
    assert P["splitEvidence"][k] == V9.P["splitEvidence"][k]
SUBSET_FROM, XBRL_FROM = "2004-08-23", "2011-07-01"
WINDOW = V9.WINDOW
SHARE_BAND = V9.SHARE_BAND
d, add, norm_ticker, strip, snippet, sha, archive = V9.d, V9.add, V9.norm_ticker, V9.strip, V9.snippet, V9.sha, V9.archive
FPI_FORMS = {"20-F", "40-F", "6-K", "20-F/A", "40-F/A", "6-K/A"}
NUM_RE = re.compile(r"(?<![\d$,.])\d{1,3}(?:,\d{3}){2,}(?![\d,])")


def ticker_text_re(ticker):
    parts = re.split(r"[._\-/]", ticker)
    tk = r"[.\-/ ]?".join(re.escape(p) for p in parts)
    pat = P["extensions"]["E1_identityText"]["TICKER_TEXT_REGEX"].replace("<TICKER>", tk)
    return re.compile(pat)


class Sec(V9.Sec):
    def __init__(self, cache_dir, rate):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.client = http_client.SECHttpClient(cache=http_client.DiskCache(directory=cache_dir, ttl_seconds=None),
                                                rate_limiter=http_client.RateLimiter(rate_per_second=rate, burst=1))
        self.neg_path = self.cache_dir / "negative-404.json"
        self.neg = set(json.loads(self.neg_path.read_text())) if self.neg_path.exists() else set()


def primary_text(sec, cik, f):
    if f["primaryDocument"]:
        url = archive(cik, f["accession"]) + "/" + f["primaryDocument"]
    else:
        url = archive(cik, f["accession"]) + "/" + f["accession"] + ".txt"
    body = sec.get(url)
    return url, sha(body), strip(body)


def text_cover(text):
    """protocol E2 TEXT_COVER."""
    doc = text[:25000]
    m = re.search(r"latest practicable date", doc, re.I) or re.search(r"shell company", doc, re.I)
    a = m.start() if m else 0
    win = doc[a:a + 1500]
    cands = []
    for n in NUM_RE.finditer(win):
        pre = win[max(0, n.start() - 30):n.start()]
        if "$" in pre or re.search(r"aggregate market value", pre, re.I):
            continue
        ctx = win[max(0, n.start() - 100):n.end() + 100]
        if not re.search(r"\bshares?\b", ctx, re.I):
            continue
        cands.append(n)
    vals = sorted({int(n.group(0).replace(",", "")) for n in cands})
    if not vals:
        return {"shares": None, "coverDate": None, "shareIssue": "NO_SHARE_COUNT"}
    if len(vals) > 1:
        return {"shares": None, "coverDate": None, "shareIssue": "SHARE_COUNT_AMBIGUOUS", "candidates": vals[:6]}
    n = cands[0]
    lo = max(0, n.start() - 250)
    best = None
    for m2 in V9.DATE_TOKEN.finditer(win[lo:n.end() + 250]):
        iso = V9.dates_in(m2.group(0))
        if not iso:
            continue
        pos = lo + m2.start()
        dist = abs(pos - n.start()) if pos < n.start() else abs(pos - n.end())
        if best is None or dist < best[0]:
            best = (dist, iso[0])
    if best is None:
        return {"shares": None, "coverDate": None, "shareIssue": "COVER_DATE_NOT_FOUND", "candidates": vals}
    q = win[max(0, n.start() - 140):n.end() + 140]
    return {"shares": float(vals[0]), "coverDate": best[1], "shareIssue": None, "quote": q[:300]}


def bracketing(sec, cik, filings, ev, ticker, cache, text_era):
    """1.0.0 bracketing with E2 text covers for the text era / filings without instance."""
    periodic = [f for f in filings if f["form"] in ("10-K", "10-Q")]
    week, prev = ev["week"], ev["prevWeek"]
    tried = []

    def load(f):
        key = f["accession"]
        if key not in cache:
            inst = None if text_era else V9.instance_for(sec, cik, f)
            rec = {"accession": f["accession"], "form": f["form"], "filingDate": f["filingDate"], "primaryDocument": f["primaryDocument"]}
            if inst is not None and inst.get("url"):
                c = V9.cover(inst, ticker)
                rec.update({"instanceUrl": inst["url"], "instanceSha256": inst["sha256"], "instanceNote": inst["note"], **c,
                            "symbolFacts": len(c["tradingSymbols"]), "coverVia": "dei:EntityCommonStockSharesOutstanding"})
            else:
                url, h, text = primary_text(sec, cik, f)
                tc = text_cover(text)
                rec.update({"instanceUrl": None, "instanceSha256": None, "instanceNote": "NO_INSTANCE" if not text_era else "TEXT_ERA",
                            "tradingSymbols": [], "namesTicker": False, "otherNonDimSymbol": [], "exchanges": [], "symbolFacts": 0,
                            "textUrl": url, "textSha256": h, "coverVia": "E2_TEXT_COVER", **tc})
            cache[key] = rec
        rec = dict(cache[key])
        tried.append(rec)
        return rec

    before = after = None
    for f in sorted([f for f in periodic if add(week, -WINDOW) <= f["filingDate"] <= add(week, 45)], key=lambda f: f["filingDate"], reverse=True)[:6]:
        rec = load(f)
        if rec and rec.get("coverDate") and rec.get("shares") and rec["coverDate"] <= prev:
            before = rec
            break
    for f in sorted([f for f in periodic if week <= f["filingDate"] <= add(week, WINDOW)], key=lambda f: f["filingDate"])[:6]:
        rec = load(f)
        if rec and rec.get("coverDate") and rec.get("shares") and rec["coverDate"] >= week:
            after = rec
            break
    return before, after, tried


def side_identity(sec, cik, filings, rec, ev, side, ticker, tre):
    """ID1 for one side: dei:TradingSymbol, else E1 text (only if no TradingSymbol fact at all)."""
    if rec["symbolFacts"]:
        return {"via": "dei:TradingSymbol", "ok": rec["namesTicker"], "accession": rec["accession"], "url": rec.get("instanceUrl"),
                "sha256": rec.get("instanceSha256"), "quote": "dei:TradingSymbol " + json.dumps(rec["tradingSymbols"])}
    f0 = next(f for f in filings if f["accession"] == rec["accession"])
    url, h, text = primary_text(sec, cik, f0)
    m = tre.search(text)
    if m:
        return {"via": "E1_TEXT", "ok": True, "accession": rec["accession"], "url": url, "sha256": h, "quote": snippet(text, m, 110)[:300]}
    if side == "before":
        ks = [f for f in filings if f["form"] == "10-K" and add(ev["week"], -WINDOW) <= f["filingDate"] <= ev["prevWeek"]]
        k = max(ks, key=lambda f: f["filingDate"]) if ks else None
    else:
        ks = [f for f in filings if f["form"] == "10-K" and ev["week"] <= f["filingDate"] <= add(ev["week"], WINDOW)]
        k = min(ks, key=lambda f: f["filingDate"]) if ks else None
    if k and k["accession"] != rec["accession"]:
        url, h, text = primary_text(sec, cik, k)
        m = tre.search(text)
        if m:
            return {"via": "E1_TEXT", "ok": True, "accession": k["accession"], "form": "10-K", "filingDate": k["filingDate"], "url": url, "sha256": h,
                    "quote": snippet(text, m, 110)[:300]}
    return {"via": "E1_TEXT", "ok": False, "accession": rec["accession"]}


def insufficient_detail(filings, ev, before, after, as_of, tried):
    win = [f for f in filings if add(ev["week"], -WINDOW) <= f["filingDate"] <= add(ev["week"], WINDOW)]
    if any(f["form"] in FPI_FORMS for f in win) and not any(f["form"] in ("10-K", "10-Q") for f in win):
        return "FOREIGN_PRIVATE_ISSUER_FORMS"
    if before is None:
        return "NO_BEFORE_BRACKET"
    if add(ev["week"], WINDOW) > as_of:
        return "NO_AFTER_BRACKET_YET"
    return "NO_AFTER_BRACKET"


def split_8k_scan(sec, cik, eights, ev, text_of):
    out = []
    for f in [f for f in eights if V9.in_window(f, add(ev["prevWeek"], -90), add(ev["week"], 45)) and (V9.SPLIT_8K_ITEMS & set(f["items"]) or not f["items"])]:
        url, h, text = text_of(f)
        m = V9.SPLIT_RE.search(text)
        out.append({"accession": f["accession"], "items": f["items"], "filingDate": f["filingDate"], "reportDate": f["reportDate"], "url": url, "sha256": h,
                    "match": snippet(text, m)[:300] if m else None, "noItems": not f["items"]})
    return out


def verify_series(sec, s, tickers_map):
    facts = {"securityId": s["securityId"], "ticker": s["ticker"], "canonicalId": s["canonicalId"], "exchange": s["exchange"], "asOf": s["asOf"], "events": []}
    if not all(e["week"] >= SUBSET_FROM for e in s["events"]):
        facts["events"] = [{**ev, "verdict": "OUT_OF_FRAME_PRE_2004", "detail": None} for ev in s["events"]]
        return facts
    ciks = sorted(set(tickers_map.get(norm_ticker(s["ticker"]), [])))
    facts["candidateCiks"] = ciks
    if not ciks:
        facts["events"] = [{**ev, "verdict": "PROVIDER_SPLIT_RECORDED", "detail": None} if ev["reason"] == "PROVIDER_SPLIT_IN_WEEK"
                           else {**ev, "verdict": "IDENTITY_UNVERIFIED", "detail": "IDENTITY_NO_CANDIDATE_CIK"} for ev in s["events"]]
        return facts
    need_from = add(min(e["week"] for e in s["events"]), -WINDOW - 140)
    subs = {c: V9.submissions(sec, c, need_from) for c in ciks}
    tre = ticker_text_re(s["ticker"])
    caches, split_cache = {}, {}
    for ev in s["events"]:
        ev = dict(ev)
        ev["direction"] = "UP" if ev["close"] > ev["prevClose"] else "DOWN"
        ev["era"] = "TEXT" if ev["week"] < XBRL_FROM else "XBRL"
        facts["events"].append(ev)
        if ev["reason"] == "PROVIDER_SPLIT_IN_WEEK":
            ev.update(verdict="PROVIDER_SPLIT_RECORDED", detail=None)
            continue
        passing, ev["identity"] = [], []
        for cik in ciks:
            filings = subs[cik]["filings"]
            before, after, tried = bracketing(sec, cik, filings, ev, s["ticker"], caches.setdefault(cik, {}), ev["era"] == "TEXT")
            idr = {"cik": cik, "issuer": subs[cik]["name"], "before": before, "after": after, "triedFilings": len(tried)}
            if not before or not after:
                idr["result"] = "INSUFFICIENT_FILINGS"
                idr["insufficientDetail"] = insufficient_detail(filings, ev, before, after, s["asOf"], tried)
                issues = sorted({t.get("shareIssue") for t in tried if t.get("shareIssue")})
                if issues:
                    idr["shareIssues"] = issues
            else:
                ib = side_identity(sec, cik, filings, before, ev, "before", s["ticker"], tre)
                ia = side_identity(sec, cik, filings, after, ev, "after", s["ticker"], tre)
                idr["idBefore"], idr["idAfter"] = ib, ia
                if not (ib["ok"] and ia["ok"]):
                    idr["result"] = "IDENTITY_TICKER_NOT_NAMED"
                elif before["otherNonDimSymbol"] or after["otherNonDimSymbol"]:
                    idr["result"] = "IDENTITY_TICKER_REUSE_OR_CHANGE"
                else:
                    tagged = before["exchanges"] + after["exchanges"]
                    codes = V9.EXCHANGE_CODES[s["exchange"]]
                    if tagged:
                        idr["exchangeEvidence"] = {"via": "dei:SecurityExchangeName", "values": sorted(set(tagged))}
                        ok = any(v.upper() in codes for v in tagged)
                    else:
                        ex = V9.exchange_from_10k(sec, cik, filings, ev["week"], s["exchange"])
                        idr["exchangeEvidence"] = {"via": "10-K cover text", **ex}
                        ok = ex["result"]
                    idr["result"] = "PASS" if ok else "IDENTITY_EXCHANGE_UNCONFIRMED"
            ev["identity"].append(idr)
            if idr["result"] == "PASS":
                passing.append(idr)
        if len(passing) != 1:
            if len(passing) > 1:
                ev.update(verdict="IDENTITY_UNVERIFIED", detail="IDENTITY_TICKER_REUSE_OR_CHANGE")
            else:
                res = [x["result"] for x in ev["identity"]]
                if all(r == "INSUFFICIENT_FILINGS" for r in res):
                    ev.update(verdict="INSUFFICIENT_FILINGS", detail=ev["identity"][0].get("insufficientDetail"))
                else:
                    ev.update(verdict="IDENTITY_UNVERIFIED", detail=next(r for r in res if r != "INSUFFICIENT_FILINGS"))
            continue
        idr = passing[0]
        cik = idr["cik"]
        filings = subs[cik]["filings"]
        ev["cik"] = cik
        ratio = idr["after"]["shares"] / idr["before"]["shares"]
        ev["shareRatio"] = ratio
        eights = [f for f in filings if f["form"] in ("8-K", "8-K/A")]
        texts = {}

        def text_of(f):
            if f["accession"] not in texts:
                url, body, text = V9.eightk_text(sec, cik, f)
                texts[f["accession"]] = (url, sha(body), text)
            return texts[f["accession"]]

        if cik not in split_cache:
            split_cache[cik] = V9.split_concepts(sec, cik)
        lo, hi = add(ev["prevWeek"], -WINDOW), add(ev["week"], WINDOW)
        ev["xbrlSplitFacts"] = [f for f in split_cache[cik] if f["end"] and lo <= f["end"] <= hi]
        a = idr["after"]
        fa = next(f for f in filings if f["accession"] == a["accession"])
        purl, ph, ptext = primary_text(sec, cik, fa)
        m = V9.SPLIT_STRONG_RE.search(ptext)
        ev["periodicText"] = {"url": purl, "sha256": ph, "match": snippet(ptext, m)[:300] if m else None}
        if not (SHARE_BAND[0] <= ratio <= SHARE_BAND[1]):
            # E4: provider-unadjusted split proof (never admissible)
            price_factor = ev["prevClose"] / ev["close"]
            inverse = abs(math.log(ratio) - math.log(price_factor)) <= math.log(1.25)
            ev["splitWindow8K"] = split_8k_scan(sec, cik, eights, ev, text_of)
            statements = [{"kind": "8K_SPLIT_LANGUAGE", **x} for x in ev["splitWindow8K"] if x["match"]]
            statements += [{"kind": "XBRL_SPLIT_RATIO", **x} for x in ev["xbrlSplitFacts"]]
            if ev["periodicText"]["match"]:
                statements.append({"kind": "PERIODIC_TEXT_STRONG", **ev["periodicText"], "accession": a["accession"]})
            ev["splitStatements"] = statements
            if inverse and statements:
                ev.update(verdict="SPLIT_UNADJUSTED", detail="E4_PROOF")
            else:
                ev.update(verdict="SPLIT_OR_SHARE_CHANGE_EVIDENCE", detail="SHARE_COUNT_DISCONTINUITY")
            continue
        if ev["xbrlSplitFacts"]:
            ev.update(verdict="SPLIT_OR_SHARE_CHANGE_EVIDENCE", detail="SPLIT_EVIDENCE_XBRL")
            continue
        if m:
            ev.update(verdict="SPLIT_OR_SHARE_CHANGE_EVIDENCE", detail="SPLIT_EVIDENCE_PERIODIC_TEXT")
            continue
        ev["spinoff"] = None
        if ev["direction"] == "DOWN":
            cands = []
            for f in [f for f in eights if V9.in_window(f, add(ev["week"], -120), add(ev["week"], 14))]:
                url, h, text = text_of(f)
                if not V9.SPINOFF_RE.search(text):
                    continue
                hits = []
                for mm in V9.DISTDATE_RE.finditer(text):
                    for x in V9.dates_in(text[mm.end(): mm.end() + 400]):
                        if ev["prevWeek"] < x <= ev["week"]:
                            hits.append({"date": x, "quote": text[max(0, mm.start() - 100): mm.end() + 200]})
                rev = [snippet(text, mm) for mm in V9.SPLIT_RE.finditer(text) if not re.fullmatch(r"(?i)stock\s+dividend", mm.group(0))]
                cands.append({"accession": f["accession"], "form": f["form"], "filingDate": f["filingDate"], "reportDate": f["reportDate"], "url": url,
                              "sha256": h, "distributionDateHits": hits[:3], "splitMatchesOtherThanStockDividend": rev[:3]})
            ev["spinoffCandidates"] = cands
            good = [c for c in cands if c["distributionDateHits"] and not c["splitMatchesOtherThanStockDividend"]]
            if good:
                ev["spinoff"] = good[0]
                ev.update(verdict="SPINOFF_DISTRIBUTION", detail=None)
                continue
        ev["splitWindow8K"] = split_8k_scan(sec, cik, eights, ev, text_of)
        if any(x["match"] for x in ev["splitWindow8K"]):
            ev.update(verdict="SPLIT_OR_SHARE_CHANGE_EVIDENCE", detail="SPLIT_EVIDENCE_8K")
            continue
        nxt = ev.get("next") or []
        if any(abs(math.log(p[1] / ev["prevClose"])) <= math.log(1.25) for p in nxt):
            ev.update(verdict="SPIKE_REVERSAL", detail=None)
            continue
        aff = []
        for f in [f for f in eights if f["form"] == "8-K" and V9.in_window(f, add(ev["jumpDay"], -3), add(ev["jumpDay"], 1)) and V9.AFFIRM_ITEMS & set(f["items"])]:
            url, h, text = text_of(f)
            mm = V9.SPLIT_RE.search(text)
            so = V9.SPINOFF_RE.search(text)
            aff.append({"accession": f["accession"], "items": f["items"], "filingDate": f["filingDate"], "reportDate": f["reportDate"], "url": url, "sha256": h,
                        "splitMatch": snippet(text, mm) if mm else None, "spinoffMatch": snippet(text, so)[:300] if so else None,
                        "quote": V9.quote_for(text, V9.AFFIRM_ITEMS & set(f["items"]))})
        ev["affirmativeCandidates"] = aff
        valid = [x for x in aff if not x["splitMatch"]]
        ok = [x for x in valid if not x["spinoffMatch"]]  # E6 (protocol 1.1.2)
        if ok:
            ev.update(verdict="GENUINE_MOVE", detail=None, affirmative=ok[0])
        else:
            ev.update(verdict="NEGATIVE_EVIDENCE_ONLY", detail="AFFIRMATIVE_8K_MENTIONS_SPINOFF" if valid else None)
    return facts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frame", required=True)
    ap.add_argument("--cache-dir", required=True)
    ap.add_argument("--facts-out", required=True)
    ap.add_argument("--rate", type=float, default=1.0)
    ap.add_argument("--only")
    a = ap.parse_args()
    if a.rate > 1.0:
        raise SystemExit("RATE_ABOVE_STRAND_SHARE")
    for p in (a.cache_dir, a.facts_out):
        if ROOT in Path(p).resolve().parents:
            raise SystemExit("PRIVATE_OUTPUT_REQUIRED")
    frame = json.loads(Path(a.frame).read_text())
    sec = Sec(a.cache_dir, a.rate)
    tj = sec.json("https://www.sec.gov/files/company_tickers_exchange.json")
    tickers_map = {}
    for row in tj["data"]:
        tickers_map.setdefault(norm_ticker(row[2]), []).append(int(row[0]))
    out = Path(a.facts_out)
    done = set()
    if out.exists():
        done = {json.loads(l)["securityId"] for l in out.read_text().splitlines() if l.strip()}
    only = set(a.only.split(",")) if a.only else None
    todo = [s for s in frame["frame"] if s["securityId"] not in done and (only is None or s["securityId"] in only)]
    with out.open("a") as fh:
        for i, s in enumerate(todo):
            try:
                facts = verify_series(sec, s, tickers_map)
            except Exception as exc:  # fetch/parse failure: recorded, never admitted
                facts = {"securityId": s["securityId"], "ticker": s["ticker"], "canonicalId": s["canonicalId"], "exchange": s["exchange"], "asOf": s["asOf"],
                         "error": repr(exc)[:300],
                         "events": [{**ev, "verdict": "INSUFFICIENT_FILINGS", "detail": "FETCH_OR_PARSE_FAILURE"} for ev in s["events"]]}
            facts["protocolSha256"] = PROTOCOL_SHA
            facts["verifiedAt"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
            fh.write(json.dumps(facts) + "\n")
            fh.flush()
            print("%d/%d %s %s requests=%d hits=%d" % (i + 1, len(todo), s["securityId"], [e["verdict"] for e in facts["events"]],
                                                      sec.client.stats["requests"], sec.client.stats["cache_hits"]), flush=True)


if __name__ == "__main__":
    main()
