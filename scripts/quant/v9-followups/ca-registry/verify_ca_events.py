"""V9 follow-up (corporate-action registry): verify the candidate frame against raw SEC sources.

Implements docs/quant-recovery/v9-followups/ca-registry/protocol.json (v9-followup-ca-verification-protocol-1.0.0).
It reads only the frame (export-frame.cjs) and raw SEC bodies (fetched at <= 2 req/s through
scripts/quant/sec/http_client.py or served from a url-keyed raw cache). No V9 derived file is read.

Output (private, --facts-out): one JSON line per series with every collected fact and the per-event verdict.
Usage:
  python3 scripts/quant/v9-followups/ca-registry/verify_ca_events.py --frame <frame.json> --cache-dir <dir> \
      [--fallback-cache <dir>] --facts-out <facts.jsonl> [--only ref_X,ref_Y]
"""
import argparse
import datetime as dt
import hashlib
import html
import json
import logging
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "scripts" / "quant" / "sec"))
import http_client  # noqa: E402

PROTOCOL = ROOT / "docs/quant-recovery/v9-followups/ca-registry/protocol.json"
P = json.loads(PROTOCOL.read_text())
PROTOCOL_SHA = hashlib.sha256(PROTOCOL.read_bytes()).hexdigest()
SPLIT_RE = re.compile(P["splitEvidence"]["SPLIT_REGEX"][4:], re.I)
SPLIT_STRONG_RE = re.compile(P["splitEvidence"]["SPLIT_REGEX_STRONG"][4:], re.I)
SPINOFF_RE = re.compile(P["spinoff"]["SPINOFF_REGEX"][4:], re.I)
DISTDATE_RE = re.compile(P["spinoff"]["DISTRIBUTION_DATE_REGEX"][4:], re.I)
SHARE_BAND = (0.8, 1.25)
WINDOW = 400
SPLIT_8K_ITEMS = {"3.01", "3.03", "5.03", "7.01", "8.01"}
AFFIRM_ITEMS = {"1.01", "1.02", "1.03", "2.01", "2.02", "2.05", "2.06", "3.01", "4.02", "5.01", "7.01", "8.01"}
EXCHANGE_CODES = {"NASDAQ": {"NASDAQ"}, "NYSE": {"NYSE"}, "AMEX": {"NYSEAMER", "NYSEMKT"}, "NYSE MKT": {"NYSEAMER", "NYSEMKT"}}
MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                        "september", "october", "november", "december"], 1)}
LOG = logging.getLogger("ca-verify")


def d(s):
    return dt.date.fromisoformat(s[:10])


def add(s, days):
    return (d(s) + dt.timedelta(days=days)).isoformat()


def norm_ticker(t):
    return re.sub(r"[.\-/ ]", "", (t or "").upper())


class TwoLevelCache(http_client.DiskCache):
    """Own url-keyed cache first, then a read-only fallback cache with identical keys (raw bodies only)."""

    def __init__(self, directory, fallback=None):
        super().__init__(directory=directory, ttl_seconds=None)
        self.fallback = http_client.DiskCache(directory=fallback, ttl_seconds=None) if fallback else None

    def get(self, url):
        got = super().get(url)
        if got is None and self.fallback is not None:
            got = self.fallback.get(url)
            if got is not None:
                self.put(url, got)
        return got


class Sec:
    def __init__(self, cache_dir, fallback):
        self.cache_dir = Path(cache_dir)
        self.client = http_client.SECHttpClient(cache=TwoLevelCache(cache_dir, fallback),
                                                rate_limiter=http_client.RateLimiter(rate_per_second=2.0, burst=1))
        self.neg_path = self.cache_dir / "negative-404.json"
        self.neg = set(json.loads(self.neg_path.read_text())) if self.neg_path.exists() else set()

    def get(self, url, allow404=False):
        if url in self.neg:
            return None
        try:
            return self.client.get_bytes(url, expected_statuses=(404,) if allow404 else ())
        except http_client.SECHTTPError as exc:
            if allow404 and exc.status == 404:
                self.neg.add(url)
                self.neg_path.write_text(json.dumps(sorted(self.neg)))
                return None
            raise

    def json(self, url, allow404=False):
        b = self.get(url, allow404)
        return None if b is None else json.loads(b)


def strip(body):
    text = body.decode("utf-8", "replace") if isinstance(body, bytes) else body
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def snippet(text, m, width=160):
    return text[max(0, m.start() - width): m.end() + width]


def sha(b):
    return hashlib.sha256(b).hexdigest()


def archive(cik, acc):
    return "https://www.sec.gov/Archives/edgar/data/%d/%s" % (int(cik), acc.replace("-", ""))


# ---------------------------------------------------------------- filings
def submissions(sec, cik, need_from):
    url = "https://data.sec.gov/submissions/CIK%010d.json" % int(cik)
    top = sec.json(url)
    blocks = [top["filings"]["recent"]]
    for f in top["filings"].get("files", []):
        if f.get("filingTo", "9999") >= need_from:
            blocks.append(sec.json("https://data.sec.gov/submissions/" + f["name"]))
    out = []
    for b in blocks:
        for i, acc in enumerate(b["accessionNumber"]):
            out.append({"accession": acc, "form": b["form"][i], "filingDate": b["filingDate"][i],
                        "reportDate": b.get("reportDate", [""] * len(b["accessionNumber"]))[i] or "",
                        "items": [x.strip() for x in (b.get("items", [""] * len(b["accessionNumber"]))[i] or "").split(",") if x.strip()],
                        "primaryDocument": b.get("primaryDocument", [""] * len(b["accessionNumber"]))[i] or ""})
    out.sort(key=lambda f: (f["filingDate"], f["accession"]))
    return {"url": url, "name": top.get("name"), "tickers": top.get("tickers"), "exchanges": top.get("exchanges"), "filings": out}


def local(tag):
    return tag.rsplit("}", 1)[-1]


def parse_instance(body):
    """dei cover facts with their contexts from an XBRL instance (classic or inline-extracted)."""
    contexts, facts = {}, []
    root = ET.fromstring(body)
    for el in root:
        if local(el.tag) == "context":
            cid = el.get("id")
            date = None
            dims = []
            for sub in el.iter():
                ln = local(sub.tag)
                if ln in ("instant", "endDate") and sub.text:
                    date = sub.text.strip()[:10]
                elif ln == "explicitMember":
                    dims.append((sub.get("dimension"), (sub.text or "").strip()))
            contexts[cid] = {"date": date, "dims": sorted(dims)}
    for el in root:
        ns = el.tag[1:].split("}")[0] if el.tag.startswith("{") else ""
        ln = local(el.tag)
        if "/dei/" in ns and ln in ("TradingSymbol", "SecurityExchangeName", "EntityCommonStockSharesOutstanding", "DocumentPeriodEndDate"):
            ctx = contexts.get(el.get("contextRef"), {"date": None, "dims": []})
            facts.append({"name": ln, "value": (el.text or "").strip(), "date": ctx["date"], "dims": ctx["dims"]})
    return facts


def instance_for(sec, cik, filing):
    base = archive(cik, filing["accession"])
    idx = sec.json(base + "/index.json", allow404=True)
    if not idx:
        return None
    names = [it["name"] for it in idx["directory"]["item"]]
    inline = [n for n in names if n.endswith("_htm.xml")]
    classic = [n for n in names if n.endswith(".xml") and not re.search(r"(_cal|_def|_lab|_pre|FilingSummary|MetaLinks|^R\d+)", n, re.I)
               and not n.endswith("_htm.xml")]
    pick = inline[:1] or classic[:1]
    if not pick:
        return {"url": None, "sha256": None, "facts": [], "note": "NO_INSTANCE"}
    url = base + "/" + pick[0]
    body = sec.get(url)
    try:
        facts = parse_instance(body)
    except ET.ParseError as exc:
        return {"url": url, "sha256": sha(body), "facts": [], "note": "PARSE_ERROR:" + str(exc)[:80]}
    return {"url": url, "sha256": sha(body), "facts": facts, "note": None}


def cover(inst, ticker):
    """Share count, cover date, ticker naming and exchange evidence from one instance (protocol identity/shareContinuity)."""
    t = norm_ticker(ticker)
    syms = [f for f in inst["facts"] if f["name"] == "TradingSymbol"]
    match = [f for f in syms if norm_ticker(f["value"]) == t]
    nondim_other = [f for f in syms if not f["dims"] and norm_ticker(f["value"]) != t]
    shares = [f for f in inst["facts"] if f["name"] == "EntityCommonStockSharesOutstanding"]
    chosen, why = None, None
    dim_match = [f for f in match if f["dims"]]
    if dim_match:
        same = [s for s in shares if s["dims"] == dim_match[0]["dims"]]
        if same:
            chosen = same[0]
    if chosen is None:
        nondim = [s for s in shares if not s["dims"]]
        values = {s["value"] for s in nondim}
        if len(values) == 1:
            chosen = nondim[0]
        elif shares:
            why = "SHARE_COUNT_AMBIGUOUS"
        else:
            why = "NO_SHARE_COUNT"
    exch_ctx = [f["value"] for f in inst["facts"] if f["name"] == "SecurityExchangeName" and match and f["dims"] == match[0]["dims"]]
    exch_all = [f["value"] for f in inst["facts"] if f["name"] == "SecurityExchangeName"]
    shares_val = None
    if chosen:
        try:
            shares_val = float(chosen["value"])
        except ValueError:
            why = "SHARE_COUNT_UNPARSEABLE"
    return {"tradingSymbols": sorted({f["value"] for f in syms}), "namesTicker": bool(match), "otherNonDimSymbol": sorted({f["value"] for f in nondim_other}),
            "shares": shares_val if why is None else None, "coverDate": chosen["date"] if chosen and why is None else None, "shareIssue": why,
            "exchanges": sorted(set(exch_ctx or exch_all))}


def bracketing(sec, cik, filings, ev, ticker, inst_cache):
    periodic = [f for f in filings if f["form"] in ("10-K", "10-Q")]
    week, prev = ev["week"], ev["prevWeek"]
    tried = []

    def load(f):
        if f["accession"] not in inst_cache:
            inst = instance_for(sec, cik, f)
            inst_cache[f["accession"]] = None if inst is None else {**inst, "cover": None}
        inst = inst_cache[f["accession"]]
        if inst is None:
            return None
        c = cover(inst, ticker)
        rec = {"accession": f["accession"], "form": f["form"], "filingDate": f["filingDate"], "instanceUrl": inst["url"], "instanceSha256": inst["sha256"],
               "instanceNote": inst["note"], "primaryDocument": f["primaryDocument"], **c}
        tried.append(rec)
        return rec

    before = after = None
    for f in sorted([f for f in periodic if add(week, -WINDOW) <= f["filingDate"] <= add(week, 45)], key=lambda f: f["filingDate"], reverse=True)[:6]:
        rec = load(f)
        if rec and rec["coverDate"] and rec["coverDate"] <= prev:
            before = rec
            break
    for f in sorted([f for f in periodic if week <= f["filingDate"] <= add(week, WINDOW)], key=lambda f: f["filingDate"])[:6]:
        rec = load(f)
        if rec and rec["coverDate"] and rec["coverDate"] >= week:
            after = rec
            break
    return before, after, tried


def exchange_from_10k(sec, cik, filings, week, exchange):
    tenks = [f for f in filings if f["form"] == "10-K" and abs((d(f["filingDate"]) - d(week)).days) <= WINDOW and f["primaryDocument"]]
    if not tenks:
        return {"result": False, "note": "NO_10K_IN_WINDOW"}
    f = min(tenks, key=lambda f: (abs((d(f["filingDate"]) - d(week)).days), f["filingDate"]))
    url = archive(cik, f["accession"]) + "/" + f["primaryDocument"]
    body = sec.get(url)
    text = strip(body)[:20000]
    if exchange == "NASDAQ":
        ok = bool(re.search(r"nasdaq", text, re.I))
    elif exchange == "NYSE":
        ok = any(not re.match(r"\s*(american|mkt|amex|arca)", text[m.end():m.end() + 12], re.I) or m.group(0).lower().startswith("new york")
                 for m in re.finditer(r"new york stock exchange|\bnyse\b", text, re.I))
    else:
        ok = bool(re.search(r"nyse american|nyse mkt|nyse amex|american stock exchange", text, re.I))
    return {"result": ok, "accession": f["accession"], "filingDate": f["filingDate"], "url": url, "sha256": sha(body)}


def split_concepts(sec, cik):
    out = []
    for concept in ("StockholdersEquityNoteStockSplitConversionRatio1", "StockholdersEquityNoteStockSplitConversionRatio"):
        url = "https://data.sec.gov/api/xbrl/companyconcept/CIK%010d/us-gaap/%s.json" % (int(cik), concept)
        j = sec.json(url, allow404=True)
        if not j:
            continue
        for unit, facts in j.get("units", {}).items():
            for f in facts:
                out.append({"concept": concept, "end": f.get("end"), "val": f.get("val"), "accn": f.get("accn"), "form": f.get("form"), "filed": f.get("filed")})
    return out


def eightk_text(sec, cik, f):
    url = archive(cik, f["accession"]) + "/" + f["accession"] + ".txt"
    body = sec.get(url)
    return url, body, strip(body)


def in_window(f, lo, hi):
    return any(x and lo <= x <= hi for x in (f["reportDate"], f["filingDate"]))


DATE_TOKEN = re.compile(r"(?i)\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),\s*(\d{4})|\b(\d{1,2})/(\d{1,2})/(\d{4})\b")


def dates_in(text):
    out = []
    for m in DATE_TOKEN.finditer(text):
        try:
            if m.group(1):
                out.append(dt.date(int(m.group(3)), MONTHS[m.group(1).lower()], int(m.group(2))).isoformat())
            else:
                out.append(dt.date(int(m.group(6)), int(m.group(4)), int(m.group(5))).isoformat())
        except ValueError:
            pass
    return out


def quote_for(text, items):
    for it in sorted(items):
        m = re.search(r"Item\s*%s\b" % re.escape(it), text, re.I)
        if m:
            return text[m.start(): m.start() + 400]
    m = re.search(r"EX-99", text)
    return text[m.start(): m.start() + 400] if m else text[:400]


# ---------------------------------------------------------------- per series
def verify_series(sec, s, tickers_map):
    facts = {"securityId": s["securityId"], "ticker": s["ticker"], "canonicalId": s["canonicalId"], "exchange": s["exchange"], "events": []}
    if not s["inSubset"]:
        facts["events"] = [{**ev, "verdict": "OUT_OF_FRAME_PRE_XBRL", "detail": None} for ev in s["events"]]
        return facts
    ciks = sorted(set(tickers_map.get(norm_ticker(s["ticker"]), [])))
    facts["candidateCiks"] = ciks
    if not ciks:
        facts["events"] = [{**ev, "verdict": "IDENTITY_UNVERIFIED", "detail": "IDENTITY_NO_CANDIDATE_CIK"} for ev in s["events"]]
        return facts
    need_from = add(min(e["week"] for e in s["events"]), -WINDOW - 140)
    subs = {c: submissions(sec, c, need_from) for c in ciks}
    inst_cache = {}
    split_cache = {}
    for ev in s["events"]:
        ev = dict(ev)
        ev["direction"] = "UP" if ev["close"] > ev["prevClose"] else "DOWN"
        facts["events"].append(ev)
        if ev["reason"] == "PROVIDER_SPLIT_IN_WEEK":
            ev.update(verdict="PROVIDER_SPLIT_RECORDED", detail=None)
            continue
        # identity per candidate CIK
        passing = []
        ev["identity"] = []
        for cik in ciks:
            filings = subs[cik]["filings"]
            before, after, tried = bracketing(sec, cik, filings, ev, s["ticker"], inst_cache.setdefault(cik, {}))
            idr = {"cik": cik, "issuer": subs[cik]["name"], "before": before, "after": after, "triedFilings": len(tried)}
            if not before or not after:
                idr["result"] = "INSUFFICIENT_FILINGS"
            elif not (before["namesTicker"] and after["namesTicker"]):
                idr["result"] = "IDENTITY_TICKER_NOT_NAMED"
            elif before["otherNonDimSymbol"] or after["otherNonDimSymbol"]:
                idr["result"] = "IDENTITY_TICKER_REUSE_OR_CHANGE"
            else:
                tagged = before["exchanges"] + after["exchanges"]
                codes = EXCHANGE_CODES[s["exchange"]]
                if tagged:
                    idr["exchangeEvidence"] = {"via": "dei:SecurityExchangeName", "values": sorted(set(tagged))}
                    ok = any(v.upper() in codes for v in tagged)
                else:
                    ex = exchange_from_10k(sec, cik, filings, ev["week"], s["exchange"])
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
                ev.update(verdict="INSUFFICIENT_FILINGS" if all(r == "INSUFFICIENT_FILINGS" for r in res) else "IDENTITY_UNVERIFIED",
                          detail=next((r for r in res if r != "INSUFFICIENT_FILINGS"), "INSUFFICIENT_FILINGS"))
            continue
        idr = passing[0]
        cik = idr["cik"]
        filings = subs[cik]["filings"]
        ev["cik"] = cik
        ratio = idr["after"]["shares"] / idr["before"]["shares"] if idr["before"]["shares"] else None
        ev["shareRatio"] = ratio
        if ratio is None or not (SHARE_BAND[0] <= ratio <= SHARE_BAND[1]):
            ev.update(verdict="SPLIT_OR_SHARE_CHANGE_EVIDENCE", detail="SHARE_COUNT_DISCONTINUITY")
            continue
        if cik not in split_cache:
            split_cache[cik] = split_concepts(sec, cik)
        lo, hi = add(ev["prevWeek"], -WINDOW), add(ev["week"], WINDOW)
        ev["xbrlSplitFacts"] = [f for f in split_cache[cik] if f["end"] and lo <= f["end"] <= hi]
        if ev["xbrlSplitFacts"]:
            ev.update(verdict="SPLIT_OR_SHARE_CHANGE_EVIDENCE", detail="SPLIT_EVIDENCE_XBRL")
            continue
        a = idr["after"]
        purl = archive(cik, a["accession"]) + "/" + a["primaryDocument"]
        pbody = sec.get(purl)
        ptext = strip(pbody)
        m = SPLIT_STRONG_RE.search(ptext)
        ev["periodicText"] = {"url": purl, "sha256": sha(pbody), "match": snippet(ptext, m) if m else None}
        if m:
            ev.update(verdict="SPLIT_OR_SHARE_CHANGE_EVIDENCE", detail="SPLIT_EVIDENCE_PERIODIC_TEXT")
            continue
        # 8-K texts used below (spin-off window, split window, affirmative window)
        eights = [f for f in filings if f["form"] in ("8-K", "8-K/A")]
        texts = {}

        def text_of(f):
            if f["accession"] not in texts:
                url, body, text = eightk_text(sec, cik, f)
                texts[f["accession"]] = (url, sha(body), text)
            return texts[f["accession"]]

        ev["spinoff"] = None
        if ev["direction"] == "DOWN":
            cands = []
            for f in [f for f in eights if in_window(f, add(ev["week"], -120), add(ev["week"], 14))]:
                url, h, text = text_of(f)
                if not SPINOFF_RE.search(text):
                    continue
                hits = []
                for m in DISTDATE_RE.finditer(text):
                    for x in dates_in(text[m.end(): m.end() + 400]):
                        if ev["prevWeek"] < x <= ev["week"]:
                            hits.append({"date": x, "quote": text[max(0, m.start() - 100): m.end() + 300]})
                rev = [snippet(text, mm) for mm in SPLIT_RE.finditer(text) if not re.fullmatch(r"(?i)stock\s+dividend", mm.group(0))]
                cands.append({"accession": f["accession"], "form": f["form"], "filingDate": f["filingDate"], "reportDate": f["reportDate"], "url": url,
                              "sha256": h, "distributionDateHits": hits[:3], "splitMatchesOtherThanStockDividend": rev[:3]})
            ev["spinoffCandidates"] = cands
            good = [c for c in cands if c["distributionDateHits"] and not c["splitMatchesOtherThanStockDividend"]]
            if good:
                ev["spinoff"] = good[0]
                ev.update(verdict="SPINOFF_DISTRIBUTION", detail=None)
                continue
        split8k = []
        for f in [f for f in eights if in_window(f, add(ev["prevWeek"], -90), add(ev["week"], 45)) and SPLIT_8K_ITEMS & set(f["items"])]:
            url, h, text = text_of(f)
            m = SPLIT_RE.search(text)
            split8k.append({"accession": f["accession"], "items": f["items"], "filingDate": f["filingDate"], "reportDate": f["reportDate"], "url": url, "sha256": h,
                            "match": snippet(text, m) if m else None})
        ev["splitWindow8K"] = split8k
        if any(x["match"] for x in split8k):
            ev.update(verdict="SPLIT_OR_SHARE_CHANGE_EVIDENCE", detail="SPLIT_EVIDENCE_8K")
            continue
        nxt = ev.get("next") or []
        import math
        if any(abs(math.log(p[1] / ev["prevClose"])) <= math.log(1.25) for p in nxt):
            ev.update(verdict="SPIKE_REVERSAL", detail=None)
            continue
        aff = []
        for f in [f for f in eights if f["form"] == "8-K" and in_window(f, add(ev["jumpDay"], -3), add(ev["jumpDay"], 1)) and AFFIRM_ITEMS & set(f["items"])]:
            url, h, text = text_of(f)
            m = SPLIT_RE.search(text)
            aff.append({"accession": f["accession"], "items": f["items"], "filingDate": f["filingDate"], "reportDate": f["reportDate"], "url": url, "sha256": h,
                        "splitMatch": snippet(text, m) if m else None, "quote": quote_for(text, AFFIRM_ITEMS & set(f["items"]))})
        ev["affirmativeCandidates"] = aff
        ok = [x for x in aff if not x["splitMatch"]]
        if ok:
            ev.update(verdict="GENUINE_MOVE", detail=None, affirmative=ok[0])
        else:
            ev.update(verdict="NEGATIVE_EVIDENCE_ONLY", detail=None)
    return facts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frame", required=True)
    ap.add_argument("--cache-dir", required=True)
    ap.add_argument("--fallback-cache")
    ap.add_argument("--facts-out", required=True)
    ap.add_argument("--only")
    a = ap.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(message)s")
    frame = json.loads(Path(a.frame).read_text())
    sec = Sec(a.cache_dir, a.fallback_cache)
    tj = sec.json("https://www.sec.gov/files/company_tickers_exchange.json")
    tickers_map = {}
    for row in tj["data"]:
        cik, _name, ticker, _exch = row
        tickers_map.setdefault(norm_ticker(ticker), []).append(int(cik))
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
            except Exception as exc:  # fetch failure after retries / parse failure: recorded, never admitted
                facts = {"securityId": s["securityId"], "ticker": s["ticker"], "canonicalId": s["canonicalId"], "exchange": s["exchange"], "error": repr(exc)[:300],
                         "events": [{**ev, "verdict": "INSUFFICIENT_FILINGS", "detail": "FETCH_OR_PARSE_FAILURE"} for ev in s["events"]]}
            facts["protocolSha256"] = PROTOCOL_SHA
            facts["verifiedAt"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
            fh.write(json.dumps(facts) + "\n")
            fh.flush()
            print("%d/%d %s %s requests=%d hits=%d" % (i + 1, len(todo), s["securityId"], [e["verdict"] for e in facts["events"]],
                                                      sec.client.stats["requests"], sec.client.stats["cache_hits"]), flush=True)


if __name__ == "__main__":
    main()
