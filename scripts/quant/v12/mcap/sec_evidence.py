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


def check_fact(sec, f):
    idx_url, doc_url, typ = primary_doc(sec, f["cik"], f["accn"])
    body = sec.get(doc_url)
    raw = body.decode("utf-8", "replace")
    text = strip(body)
    orig = find_number(text, raw, f["v"])
    corr = find_number(text, raw, f["vPrime"]) if f.get("vPrime") not in (None, f["v"]) else None
    if f["status"] == "CORRECTED":
        verdict = "DOCUMENT_STATES_CORRECTED_VALUE" if corr and corr["found"] else ("DOCUMENT_STATES_ORIGINAL_VALUE" if orig["found"] else "NUMBER_NOT_FOUND_IN_PRIMARY_DOCUMENT")
    elif f["status"] == "EXCLUDED":
        verdict = "ORIGINAL_VALUE_IN_DOCUMENT" if orig["found"] else "ORIGINAL_VALUE_NOT_IN_DOCUMENT"
    else:
        verdict = "DOCUMENT_STATES_USED_VALUE" if orig["found"] else "NUMBER_NOT_FOUND_IN_PRIMARY_DOCUMENT"
    cover = None
    m = re.search(r"(?i)(outstanding|latest practicable date)", text[:40000])
    if not orig["found"] and not (corr and corr["found"]) and m:
        cover = quote_at(text, m.start(), 20)
    return {"documentType": typ, "indexUrl": idx_url, "url": doc_url, "sha256": sha(body), "bytes": len(body), "original": orig, "corrected": corr, "coverContext": cover, "verdict": verdict}


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
