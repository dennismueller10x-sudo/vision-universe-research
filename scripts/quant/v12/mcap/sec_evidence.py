#!/usr/bin/env python3
"""V12 MCAP: source check of the share-count register against the original filings.

(1) Fact sample: deterministic, stratified selection of >= 40 classified share observations (the cases named
    before rule 1.0.0 plus fixed quotas per class, ordered by sha256 of the fact key). For each, the filing index
    and the primary document are fetched through scripts/quant/sec/http_client.py (<= 2 requests/s, private cache)
    and the document text is searched for the corrected and for the original number.
(2) Spin-off records: for registered events, the 8-K filings of the issuer within +-10 days of the event date are read
    (per-issuer submissions JSON of data.sec.gov) and the sentence announcing the completed separation is quoted.

Usage: python3 -I sec_evidence.py <private_dir> <out_dir> [--rate 2] [--tag development|final]
Reads <private_dir>/fact-log.json.gz; writes <out_dir>/sec-sample-<tag>.json and <out_dir>/spinoff-sources-1.0.0.json.
The tag salts the selection order (sha256 of key, or of key + '|' + tag for tags other than 'development'), so the
final sample is drawn independently of the development sample that informed rule 1.0.6.
Only accession, URL, sha256 and quotes <= 300 characters leave the private directory.
"""
import gzip
import hashlib
import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "scripts"))
from quant.sec import http_client  # noqa: E402

NAMED = {  # cases inspected before rule 1.0.0 (prior knowledge, always in the sample)
    "0001213900-21-010724": "EEFT 10-K FY2020", "0001193125-10-111376": "CB 10-Q Q1 2010", "0001193125-10-180546": "CB 10-Q Q2 2010",
    "0001193125-12-332540": "ON 10-Q Q2 2012", "0001041061-16-000095": "YUM 10-Q Q3 2016", "0001193125-12-401697": "ORCL 10-Q Q1 FY2013",
    "0001047469-09-009754": "Citigroup 10-Q Q3 2009", "0001047469-11-007016": "Citigroup 10-Q Q2 2011 (reverse split timing)",
}
QUOTAS = [("SCALE_ERROR", 28), ("UNRESOLVED", 10), ("MCAP_ABSOLUTE_BOUND", 3), ("PRIOR_VINTAGE_SCALE_ERROR", 4), ("GENUINE_CAPITAL_ACTION", 3), ("AMBIGUOUS_SCALE", 2)]
SPINOFFS = [  # (securityId, cik, event date, factor, description used only for the search window)
    ("ref_GE", "0000040545", "2023-01-04", 1.281, "GE HealthCare"), ("ref_GE", "0000040545", "2024-04-02", 1.253, "GE Vernova"),
    ("ref_IBM", "0000051143", "2021-11-04", 1.046, "Kyndryl"), ("ref_ALV", "0001034670", "2018-07-02", 1.388, "Veoneer"),
    ("ref_T", "0000732717", "2022-04-11", 1.324, "WarnerMedia"), ("ref_EXC", "0001109357", "2022-02-02", 1.402, "Constellation"),
    ("ref_FTV", "0001659166", "2020-10-09", 1.195, "Vontier"), ("ref_WDC", "0000106040", "2025-02-24", 1.323, "Sandisk"),
]
SPIN_RE = re.compile(r"[^.]{0,200}\b(spin-?off|spin off|separation|distribution)\b[^.]{0,200}\.", re.I)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def strip(body):
    t = body.decode("utf-8", "replace")
    t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", t)
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    t = html.unescape(t).replace("\xa0", " ")
    return re.sub(r"\s+", " ", t)


def fmt(x):
    return "{:,}".format(int(round(x)))


class Sec:
    def __init__(self, cache, rate):
        self.c = http_client.SECHttpClient(cache=http_client.DiskCache(directory=str(cache), ttl_seconds=None),
                                           rate_limiter=http_client.RateLimiter(rate_per_second=rate, burst=1))

    def get(self, url):
        return self.c.get_bytes(url)


def archive(cik, accn):
    return "https://www.sec.gov/Archives/edgar/data/%d/%s" % (int(cik), accn.replace("-", ""))


def primary_doc(sec, cik, accn):
    idx_url = archive(cik, accn) + "/" + accn + "-index.htm"
    page = sec.get(idx_url).decode("utf-8", "replace")
    rows = re.findall(r'(?is)<tr[^>]*>(.*?)</tr>', page)
    for row in rows:
        cells = re.findall(r'(?is)<td[^>]*>(.*?)</td>', row)
        if len(cells) < 4:
            continue
        typ = re.sub(r"<[^>]+>", "", cells[3]).strip()
        m = re.search(r'href="([^"]+)"', cells[2])
        if m and re.match(r"^(10-K|10-Q|10-KT|10-QT|20-F|40-F|10-K/A|10-Q/A|10-K405)$", typ):
            href = m.group(1).replace("/ix?doc=", "")
            return idx_url, "https://www.sec.gov" + href if href.startswith("/") else archive(cik, accn) + "/" + href, typ
    return idx_url, archive(cik, accn) + "/" + accn + ".txt", "FULL_SUBMISSION_TEXT"


def quote_at(text, pos, n):
    a = max(0, pos - 150)
    q = text[a:pos + n + 150 - max(0, 150 - pos)]
    return q[:300].strip()


def find_number(text, raw, x):
    s = fmt(x)
    i = text.find(s)
    out = {"number": s, "found": i >= 0}
    if i >= 0:
        out["quote"] = quote_at(text, i, len(s))
        j = raw.find(s)
        if j >= 0:
            m = re.search(r'scale="(-?\d+)"', raw[max(0, j - 600):j])
            if m:
                out["ixScale"] = int(m.group(1))
    return out


def sample(facts, tag="development"):
    salt = "" if tag == "development" else "|" + tag
    key = lambda f: sha((f["accn"] + "|" + f["code"] + "|" + repr(f["v"]) + salt).encode())
    chosen, seen = [], set()
    for f in sorted(facts, key=key):
        if f["accn"] in NAMED and f["accn"] not in seen:
            chosen.append(("NAMED", f)); seen.add(f["accn"])
    for cls, n in QUOTAS:
        pool = [f for f in sorted(facts, key=key) if f["class"] == cls and f["accn"] not in seen]
        for f in pool[:n]:
            chosen.append(("QUOTA_" + cls, f)); seen.add(f["accn"])
    return chosen


COVER_KEY = re.compile(r"(?i)(shares outstanding|outstanding shares|shares of (the registrant's |the issuer's )?(class [a-z] )?common stock|latest practicable date|were outstanding|outstanding as of|outstanding at)")
NUM_RE = re.compile(r"(?<![\d,.])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])|(?<![\d,.])\d+(?:\.\d+)?\s*(?:million|billion)\b", re.I)


def to_number(tok):
    t = tok.lower().replace(",", "").strip()
    m = re.match(r"([\d.]+)\s*(million|billion)", t)
    if m:
        return float(m.group(1)) * (1e6 if m.group(2) == "million" else 1e9)
    return float(t)


STRONG_COVER = re.compile(r"(?i)(latest practicable date|outstanding as of|outstanding at [A-Z]|were outstanding|had outstanding|shares outstanding of|number of shares (of [^.]{0,60})?outstanding|outstanding shares of)")


def cover_counts(text):
    """The cover-page share statement: share counts (>= 1,000, no $ amount) in the window of the FIRST strong cover phrase
    within the first 60,000 characters; if there is none, candidates near any cover wording (weaker, flagged)."""
    head = text[:60000]
    def numbers(a, b):
        out = []
        for n in NUM_RE.finditer(head, a, b):
            pre = head[max(0, n.start() - 40):n.start()]
            if "$" in pre or re.search(r"(?i)aggregate market value", pre):
                continue
            try:
                x = to_number(n.group(0))
            except ValueError:
                continue
            if x >= 1000:
                out.append({"value": x, "token": n.group(0), "pos": n.start()})
        return out
    m = STRONG_COVER.search(head)
    if m:
        res = numbers(max(0, m.start() - 250), min(len(head), m.end() + 450))
        if res:
            for r in res:
                r["strong"] = True
            return res
    res = []
    for k in COVER_KEY.finditer(head):
        res.extend(numbers(max(0, k.start() - 300), min(len(head), k.end() + 400)))
    seen, out = set(), []
    for r in res:
        if r["pos"] not in seen:
            seen.add(r["pos"]); r["strong"] = False; out.append(r)
    return out


def near(a, b, tol=0.02):
    return a is not None and b not in (None, 0) and abs(a / b - 1) <= tol


def check_fact(sec, f):
    idx_url, doc_url, typ = primary_doc(sec, f["cik"], f["accn"])
    body = sec.get(doc_url)
    raw = body.decode("utf-8", "replace")
    text = strip(body)
    orig = find_number(text, raw, f["v"]) if f["v"] >= 1e5 else {"number": fmt(f["v"]), "found": None, "note": "below 100,000: plain digit search not meaningful"}
    corr = find_number(text, raw, f["vPrime"]) if f.get("vPrime") not in (None, f["v"]) else None
    cands = cover_counts(text)
    hit_corr = next((c for c in cands if f.get("vPrime") not in (None, f["v"]) and near(c["value"], f["vPrime"])), None)
    hit_orig = next((c for c in cands if near(c["value"], f["v"])), None)
    # A document can carry the same typo as the XBRL fact (e.g. '4,512.995 outstanding shares'): digits equal up to 10^k
    digits = lambda x: re.sub(r"[^0-9]", "", "%.6f" % x).strip("0")
    hit_digits = next((c for c in cands if f.get("vPrime") not in (None, f["v"]) and digits(c["value"]) == digits(f["vPrime"])), None)
    strong = bool(cands) and cands[0].get("strong")
    if f["status"] == "CORRECTED":
        verdict = ("CONFIRMED_COVER_STATES_CORRECTED" if hit_corr and strong else "CONTRADICTED_COVER_STATES_REPORTED" if hit_orig and strong
                   else "COVER_TYPO_SAME_DIGITS" if hit_digits and strong else "WEAK_TABLE_MATCH_CORRECTED" if hit_corr else "WEAK_TABLE_MATCH_REPORTED" if hit_orig
                   else "DOCUMENT_STATES_CORRECTED_NO_COVER" if corr and corr["found"] and f["vPrime"] >= 1e5 else "INCONCLUSIVE")
    elif f["status"] == "EXCLUDED":
        verdict = "COVER_STATES_REPORTED" if hit_orig else ("COVER_STATES_OTHER_COUNT" if cands else "NO_COVER_COUNT_FOUND")
    else:
        verdict = "CONFIRMED_COVER_STATES_USED" if hit_orig else ("COVER_STATES_OTHER_COUNT" if cands else "NO_COVER_COUNT_FOUND")
    pick = hit_corr or hit_orig or hit_digits or (cands[0] if cands else None)
    cover = {"value": pick["value"], "token": pick["token"], "quote": quote_at(text, pick["pos"], len(pick["token"]))} if pick else None
    return {"documentType": typ, "indexUrl": idx_url, "url": doc_url, "sha256": sha(body), "bytes": len(body), "cover": cover, "coverCandidates": len(cands), "strongCover": strong,
            "original": orig, "corrected": corr, "verdict": verdict}


def submissions(sec, cik):
    base = "https://data.sec.gov/submissions/CIK%s.json" % cik
    j = json.loads(sec.get(base))
    tables = [j["filings"]["recent"]]
    for extra in j["filings"].get("files", []):
        tables.append(json.loads(sec.get("https://data.sec.gov/submissions/" + extra["name"])))
    out = []
    for t in tables:
        for i in range(len(t["accessionNumber"])):
            out.append({k: t[k][i] for k in ("accessionNumber", "form", "filingDate", "primaryDocument", "items") if k in t})
    return out


def check_spinoff(sec, sid, cik, date, factor, label, stats):
    from datetime import date as D, timedelta
    d0 = D.fromisoformat(date)
    lo, hi = (d0 - timedelta(days=10)).isoformat(), (d0 + timedelta(days=10)).isoformat()
    subs = [s for s in submissions(sec, cik) if s["form"] in ("8-K", "8-K/A") and lo <= s["filingDate"] <= hi]
    subs.sort(key=lambda s: (s["filingDate"], s["accessionNumber"]))
    for s in subs:
        url = archive(cik, s["accessionNumber"]) + "/" + s["primaryDocument"]
        body = sec.get(url)
        text = strip(body)
        for m in SPIN_RE.finditer(text):
            sent = m.group(0).strip()
            if re.search(r"(?i)complet|effect", sent) and not re.search(r"(?i)forward-looking", sent):
                return {"securityId": sid, "cik": cik, "date": date, "factor": factor, "class": "NOT_A_SPLIT", "availableAt": s["filingDate"], "description": label,
                        "sources": [{"role": "SPINOFF_8K", "form": s["form"], "accession": s["accessionNumber"], "filed": s["filingDate"], "items": s.get("items"),
                                     "url": url, "sha256": sha(body), "quote": sent[:300]}]}
    stats["spinoffNotFound"].append(sid + "@" + date)
    return None


def main():
    priv, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    rate = float(sys.argv[sys.argv.index("--rate") + 1]) if "--rate" in sys.argv else 2.0
    tag = sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else "development"
    if rate > 2:
        raise SystemExit("RATE_ABOVE_2_PER_SECOND")
    log = json.load(gzip.open(priv / "fact-log.json.gz"))
    sec = Sec(priv / "http-cache", rate)
    stats = {"spinoffNotFound": [], "errors": []}
    results = []
    for why, f in sample(log["facts"], tag):
        rec = {"selection": why, "named": NAMED.get(f["accn"]), "securityId": f["id"], "cik": f["cik"], "accession": f["accn"], "concept": f["code"], "filed": f["filed"],
               "periodEnd": f["E"], "rawDate": f["D"], "reported": f["v"], "status": f["status"], "class": f["class"], "corrected": f.get("vPrime"), "scaleExponent": f.get("scaleExponent"), "tier": f.get("tier")}
        try:
            rec["check"] = check_fact(sec, f)
        except Exception as exc:  # noqa: BLE001 - counted, never hidden
            rec["check"] = {"verdict": "FETCH_FAILED", "error": "%s: %s" % (type(exc).__name__, str(exc)[:200])}
            stats["errors"].append(f["accn"])
        results.append(rec)
        print(json.dumps({"n": len(results), "accn": f["accn"], "verdict": rec["check"]["verdict"]}), flush=True)
    spins = []
    for args in SPINOFFS:
        try:
            r = check_spinoff(sec, *args, stats)
        except Exception as exc:  # noqa: BLE001
            stats["errors"].append(args[0] + "@" + args[2] + ":" + str(exc)[:120]); r = None
        if r:
            spins.append(r)
    verdicts = {}
    for r in results:
        verdicts[r["check"]["verdict"]] = verdicts.get(r["check"]["verdict"], 0) + 1
    meta = {"schemaVersion": "v12-mcap-sec-sample-1.0.0", "tag": tag, "ruleVersion": log["meta"]["ruleVersion"], "ruleSha256": log["meta"]["ruleSha256"],
            "selection": "named cases (inspected before rule 1.0.0) + per-class quotas %s, ordered by sha256(accession|concept|value)" % QUOTAS,
            "client": "scripts/quant/sec/http_client.py, User-Agent VisionUniverseResearch info@visionuniverse.de, <= %.1f requests/s" % rate,
            "secRequests": sec.c.stats, "evidenceKind": "SOURCE_EVIDENCE", "certificationStatus": "NOT_CERTIFIED", "productionApproved": False}
    (out / ("sec-sample-%s.json" % tag)).write_text(json.dumps({**meta, "verdicts": verdicts, "cases": len(results), "errors": stats["errors"], "results": results}, indent=1) + "\n")
    (out / "spinoff-sources-1.0.0.json").write_text(json.dumps({"schemaVersion": "v12-mcap-spinoff-sources-1.0.0", "rule": "S7 SEC-sourced spin-off records override share continuity",
                                                                "notFound": stats["spinoffNotFound"], "secRequests": sec.c.stats, "records": spins}, indent=1) + "\n")
    print(json.dumps({"verdicts": verdicts, "spinoffs": len(spins), "notFound": stats["spinoffNotFound"], "errors": stats["errors"], "secRequests": sec.c.stats}))


if __name__ == "__main__":
    main()
