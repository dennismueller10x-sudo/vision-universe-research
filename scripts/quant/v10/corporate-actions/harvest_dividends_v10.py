#!/usr/bin/env python3
"""V10 TR register: harvest cash-dividend statements from SEC originals (tr-protocol-1.0.4).

Discovery (protocol sources.discovery):
  (a) every attestation document of the V9 dividend evidence (candidate list only; re-fetched here),
  (b) every 10-Q/10-K primary document filed 2014-10-01..2026-10-27,
  (c) for every expected quarter still without an admissible statement after (a)+(b): EDGAR full-text search
      (GAP_QUERIES, CIK, forms 8-K,10-Q,10-K, [quarterStart-100d, quarterEnd+45d], <= 300 hits per query) and all
      exhibits of 8-Ks in that range with items 2.02/7.01/8.01 or no items.
Parsing reuses the V9 extractors unchanged (scripts/quant/v9/portfolio/harvest_dividends.py, imported as a library).
Raw bodies stay in the private cache; output (private) is one extraction file per title.
  python3 scripts/quant/v10/corporate-actions/harvest_dividends_v10.py --private <dir> [--tickers A,IBM]
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PROTOCOL = ROOT / "docs/quant-recovery/v10/corporate-actions/tr-protocol-1.0.4.json"
TP = json.loads(PROTOCOL.read_text())
PROTOCOL_SHA = hashlib.sha256(PROTOCOL.read_bytes()).hexdigest()
sys.path.insert(0, str(ROOT / "scripts" / "quant" / "sec"))
import http_client  # noqa: E402

SCAN_FROM, SCAN_TO = "2014-10-01", "2026-10-27"
V9_EVIDENCE = ROOT / "docs/quant-recovery/v9/portfolio/dividend-evidence.json"


def load_v9_extractors(private):
    os.environ["V9_PORTFOLIO_PRIVATE"] = str(Path(private) / "v9-module-unused")  # the V9 module's own client is never used
    sys.path.insert(0, str(ROOT / "scripts/quant/v9/portfolio"))
    import harvest_dividends as H  # noqa: E402
    import secfetch as S  # noqa: E402
    return H, S


def quarter(d):
    return f"{d[:4]}Q{(int(d[5:7]) - 1) // 3 + 1}"


def quarters(a, b):
    out, y, q = [], int(a[:4]), int(a[5])
    while f"{y}Q{q}" <= b:
        out.append(f"{y}Q{q}")
        q += 1
        if q == 5:
            y, q = y + 1, 1
    return out


def qbounds(q):
    y, n = int(q[:4]), int(q[5])
    start = dt.date(y, 3 * n - 2, 1)
    end = (dt.date(y + (n == 4), 1 if n == 4 else 3 * n + 1, 1) - dt.timedelta(days=1))
    return start, end


class Client:
    def __init__(self, private, rate):
        self.c = http_client.SECHttpClient(cache=http_client.DiskCache(directory=str(Path(private) / "div-cache"), ttl_seconds=None),
                                           rate_limiter=http_client.RateLimiter(rate_per_second=rate, burst=1))

    def get(self, url):
        return self.c.get_bytes(url)

    def json(self, url):
        return json.loads(self.get(url))


def submissions(cl, cik):
    top = cl.json("https://data.sec.gov/submissions/CIK%010d.json" % int(cik))
    pages = [top["filings"]["recent"]]
    for f in top["filings"].get("files", []):
        if f.get("filingTo", "9999") >= SCAN_FROM:
            pages.append(cl.json("https://data.sec.gov/submissions/" + f["name"]))
    rows = []
    for p in pages:
        for i in range(len(p["accessionNumber"])):
            rows.append({k: p[k][i] for k in p})
    return rows


def base(cik, acc):
    return "https://www.sec.gov/Archives/edgar/data/%d/%s/" % (int(cik), acc.replace("-", ""))


def admissible_quarters(records, expected):
    """Quarters with at least one statement carrying recordDate+payDate+amount (protocol-level check is in the builder)."""
    got = set()
    for r in records:
        for e in r.get("events", []):
            if e.get("recordDate") and e.get("payDate") and e.get("amount") and not e.get("intentOnly") and e.get("kind") == "REGULAR":
                got.add(quarter(e["recordDate"]))
    return [q for q in expected if q not in got]


def extract(H, S, cl, cik, acc, fn, meta, by_acc):
    url = base(cik, acc) + fn
    try:
        raw = cl.get(url)
    except Exception as e:  # recorded, never silently dropped
        return {"accession": acc, "file": fn, "url": url, **meta, "error": str(e)[:200]}
    t = S.html_text(raw)
    head = re.sub(r"\s+", " ", t[:1500])
    dl = H.dates_in(head)
    sub = by_acc.get(acc, {})
    run = lambda x: H.sentence_events(x, dl[0][1] if dl else None) + H.table_events(x) + H.installment_events(x) + H.partial_events(x)
    # tr-protocol 1.0.2: the whitespace-collapsed run is only a per-document fallback for record dates the original run did not yield
    ev = [dict(e, run="ORIGINAL") for e in run(t)]
    have = {e.get("recordDate") for e in ev}
    seen = set()
    for e in run(re.sub(r"\s+", " ", t)):
        key = (e["pattern"], e.get("recordDate"), e.get("payDate"), e.get("amount"), e.get("declarationDate"), e.get("intentOnly"), e.get("kind"))
        if e.get("recordDate") in have or key in seen:
            continue
        seen.add(key)
        ev.append(dict(e, run="COLLAPSED_WHITESPACE"))
    return {"accession": acc, "file": fn, "url": url, **meta, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
            "items": sub.get("items"), "datelineDate": dl[0][1] if dl else None, "events": ev, "ixFacts": H.ix_facts(raw)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--private", required=True)
    ap.add_argument("--tickers", default=",".join(TP["titles"]))
    ap.add_argument("--rate", type=float, default=1.0)
    a = ap.parse_args()
    if a.rate > 1.0:
        raise SystemExit("RATE_ABOVE_STRAND_SHARE")
    priv = Path(a.private)
    if ROOT == priv.resolve() or ROOT in priv.resolve().parents:
        raise SystemExit("PRIVATE_OUTPUT_REQUIRED")
    out = priv / "dividend-extractions"
    out.mkdir(parents=True, exist_ok=True)
    H, S = load_v9_extractors(priv)
    cl = Client(priv, a.rate)
    v9 = json.loads(V9_EVIDENCE.read_text())
    for tk in a.tickers.split(","):
        cik = TP["titles"][tk]
        subs = submissions(cl, cik)
        by_acc = {r["accessionNumber"]: r for r in subs}
        docs = {}
        comp = next((c for c in v9["companies"] if c["ticker"] == tk), None)
        for ev in (comp or {}).get("events", []):
            for att in ev.get("attestations", []):
                docs[(att["accession"], att["file"])] = {"form": att["form"], "fileType": "V9_CANDIDATE", "fileDate": att["fileDate"], "discovery": "a"}
        for r in subs:
            if r["form"] in ("10-Q", "10-K") and SCAN_FROM <= r["filingDate"] <= SCAN_TO and r["primaryDocument"]:
                docs.setdefault((r["accessionNumber"], r["primaryDocument"]), {"form": r["form"], "fileType": r["form"], "fileDate": r["filingDate"], "discovery": "b"})
        records = []
        for (acc, fn), meta in sorted(docs.items(), key=lambda kv: kv[1]["fileDate"]):
            records.append(extract(H, S, cl, cik, acc, fn, meta, by_acc))
        first_q = "2024Q1" if tk == "META" else "2015Q1"
        expected = quarters(first_q, "2026Q3")
        gaps = admissible_quarters(records, expected)
        gap_log = []
        for q in gaps:
            qs, qe = qbounds(q)
            # Bug fix 1 (no rule change): EDGAR full-text search answers HTTP 500 for an end date after today; clamp to the scan end.
            lo, hi = (qs - dt.timedelta(days=100)).isoformat(), min((qe + dt.timedelta(days=45)).isoformat(), SCAN_TO)
            found = {}
            for query in TP["sources"]["GAP_QUERIES"]:
                start, total = 0, None
                while True:
                    u = ("https://efts.sec.gov/LATEST/search-index?q=" + urllib.parse.quote(query) + "&ciks=%010d" % cik
                         + "&forms=8-K,10-Q,10-K&dateRange=custom&startdt=" + lo + "&enddt=" + hi + "&from=" + str(start))
                    try:
                        dj = cl.json(u)
                        if "hits" not in dj:
                            raise ValueError("FTS_NO_HITS_FIELD " + json.dumps(dj)[:100])
                    except Exception as e:  # recorded, never silently dropped
                        gap_log.append({"quarter": q, "query": query, "ftsError": str(e)[:160]})
                        break
                    hits = dj["hits"]["hits"]
                    total = dj["hits"]["total"]["value"]
                    for h in hits:
                        acc_, fn_ = h["_id"].split(":", 1)
                        ft = h["_source"].get("file_type") or ""
                        if re.match(r"EX-(3|4|10|2|95|21|23|31|32)\b", ft, re.I):
                            continue
                        found[(acc_, fn_)] = {"form": h["_source"].get("form"), "fileType": ft, "fileDate": h["_source"].get("file_date"), "discovery": "c-fts"}
                    start += len(hits)
                    if not hits or start >= total or start >= 300:
                        break
            for r in subs:
                if r["form"] != "8-K" or not (lo <= r["filingDate"] <= hi):
                    continue
                items = set(x.strip() for x in (r.get("items") or "").split(",") if x.strip())
                if items and not items & {"2.02", "7.01", "8.01"}:
                    continue
                try:
                    ix = cl.json(base(cik, r["accessionNumber"]) + "index.json")
                except Exception as e:
                    gap_log.append({"quarter": q, "indexError": r["accessionNumber"], "error": str(e)[:120]})
                    continue
                for it in ix["directory"]["item"]:
                    n = it["name"]
                    if not re.search(r"\.(htm|html|txt)$", n, re.I) or re.match(r"(R\d+\.htm|.*index.*|.*\.txt$)", n, re.I):
                        continue
                    found.setdefault((r["accessionNumber"], n), {"form": "8-K", "fileType": "8-K-DOC", "fileDate": r["filingDate"], "discovery": "c-8k"})
            new = [k for k in found if k not in docs]
            for k in sorted(new, key=lambda k: found[k]["fileDate"] or ""):
                docs[k] = found[k]
                records.append(extract(H, S, cl, cik, k[0], k[1], found[k], by_acc))
            gap_log.append({"quarter": q, "range": [lo, hi], "candidates": len(found), "newDocuments": len(new)})
            print(tk, q, "candidates", len(found), "new", len(new), flush=True)
        (out / f"{tk}.json").write_text(json.dumps({"ticker": tk, "cik": cik, "protocolSha256": PROTOCOL_SHA, "scan": [SCAN_FROM, SCAN_TO],
                                                    "gapsAfterPass1": gaps, "gapSearch": gap_log, "documents": records}, indent=1))
        print("DONE", tk, len(records), "gapsAfterPass1", len(gaps), cl.c.stats, flush=True)


if __name__ == "__main__":
    main()
