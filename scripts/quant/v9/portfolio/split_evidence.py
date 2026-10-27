#!/usr/bin/env python3
"""V9 portfolio: sourced split / spin-off evidence for the ledger period.

Locates the issuer's own announcement (8-K exhibits) via EDGAR full-text
search, extracts ratio, record date, distribution date and the first
split-adjusted trading date with verbatim quotes, and cross-checks against the
provider split factors stored in discover-series-long corporateActions.
"""
import argparse
import hashlib
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import secfetch as S  # noqa: E402
from harvest_dividends import DATE, iso  # noqa: E402

TARGETS = [
    {"ticker": "NVDA", "cik": 1045810, "kind": "SPLIT", "ratio": 4, "q": '"four-for-one" "split-adjusted"', "from": "2021-05-01", "to": "2021-08-15"},
    {"ticker": "NVDA", "cik": 1045810, "kind": "SPLIT", "ratio": 10, "q": '"ten-for-one" "split-adjusted"', "from": "2024-05-01", "to": "2024-07-15"},
    {"ticker": "WMT", "cik": 104169, "kind": "SPLIT", "ratio": 3, "q": '"3-for-1" "split-adjusted"', "from": "2024-01-15", "to": "2024-03-15"},
    {"ticker": "IBM", "cik": 51143, "kind": "SPINOFF", "ratio": None, "q": 'Kyndryl distribution "record date"', "from": "2021-09-15", "to": "2021-11-30"},
]
WORDS = {"two": 2, "three": 3, "four": 4, "five": 5, "ten": 10}


def first(pattern, t, flags=re.I):
    m = re.search(pattern, t, flags)
    return m


def extract(t, kind):
    flat = re.sub(r"\s+", " ", t)
    out = {}
    m = first(r"(?:of record|record holders?)[^.]{0,80}?(?:as of|on|at)\s+(?:the\s+close\s+of\s+business\s+on\s+)?" + DATE, flat)
    if m:
        out["recordDate"] = iso(*m.groups()[-3:])
        out["recordQuote"] = flat[max(0, m.start() - 150):m.end() + 60][:300]
    m = first(r"(?:trading|trade)\s+(?:on\s+a\s+|at\s+)?split-adjusted\s+(?:basis\s+)?(?:at\s+market\s+open\s+)?(?:on|beginning(?:\s+on)?|starting(?:\s+on)?)\s+" + DATE, flat)
    if m:
        out["splitAdjustedTradingDate"] = iso(*m.groups()[-3:])
        out["tradingQuote"] = flat[max(0, m.start() - 200):m.end() + 40][:300]
    m = first(r"(?:distributed|payable|distribution)[^.]{0,60}?(?:after the close of (?:market|trading|business)\s+on|on)\s+" + DATE, flat)
    if m:
        out["distributionDate"] = iso(*m.groups()[-3:])
        out["distributionQuote"] = flat[max(0, m.start() - 150):m.end() + 40][:300]
    m = first(r"\b(two|three|four|five|ten|\d+)[- ]for[- ](one|1)\b", flat)
    if m:
        w = m.group(1).lower()
        out["ratioStated"] = WORDS.get(w) or int(w)
        out["ratioQuote"] = flat[max(0, m.start() - 120):m.end() + 120][:300]
    if kind == "SPINOFF":
        m = first(r"(one|1)\s+share of Kyndryl common stock for every\s+(five|5)\s+shares of IBM", flat)
        if m:
            out["distributionRatio"] = "1 Kyndryl share per 5 IBM shares"
            out["ratioQuote"] = flat[max(0, m.start() - 150):m.end() + 100][:300]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root = Path(__file__).resolve().parents[4]
    rows = []
    for tg in TARGETS:
        u = ("https://efts.sec.gov/LATEST/search-index?q=" + urllib.parse.quote(tg["q"]) + "&ciks=" + str(tg["cik"]).zfill(10)
             + "&forms=8-K&dateRange=custom&startdt=" + tg["from"] + "&enddt=" + tg["to"])
        hits = sorted(S.get_json(u)["hits"]["hits"], key=lambda h: h["_source"]["file_date"])
        docs = []
        for h in hits[:6]:
            acc, fn = h["_id"].split(":", 1)
            url = S.archive_base(tg["cik"], acc) + fn
            raw = S.get(url)
            ex = extract(S.html_text(raw), tg["kind"])
            hd = S.header(tg["cik"], acc)
            docs.append({"accession": acc, "file": fn, "url": url, "sha256": S.sha(raw), "fileDate": h["_source"]["file_date"],
                         "acceptanceUtc": hd.get("acceptanceUtc"), "headerSha256": hd["sha256"], **ex})
        long = json.loads((root / f"quant/data/market/discover-series-long/ref_{tg['ticker']}.json").read_text())
        prov = [s for s in long["corporateActions"]["splits"] if tg["from"] <= s[0] <= tg["to"]]
        pick = lambda k: sorted({d[k] for d in docs if d.get(k)})
        rec = {"ticker": tg["ticker"], "kind": tg["kind"], "documents": docs,
               "recordDatesStated": pick("recordDate"), "distributionDatesStated": pick("distributionDate"),
               "splitAdjustedTradingDatesStated": pick("splitAdjustedTradingDate"),
               "ratiosStated": pick("ratioStated"), "providerSplitFactor": prov}
        if tg["kind"] == "SPLIT":
            ok = (len(rec["splitAdjustedTradingDatesStated"]) == 1 and rec["ratiosStated"] == [tg["ratio"]])
            rec["status"] = "SOURCED" if ok else "INCOMPLETE"
            rec["ratio"] = tg["ratio"] if ok else None
            rec["effectiveDate"] = rec["splitAdjustedTradingDatesStated"][0] if ok else None
            rec["effectiveDateMeaning"] = "first trading day on split-adjusted basis (entitlement change for a holder of record)"
            rec["providerCrossCheck"] = ("MATCH" if prov == [[rec["effectiveDate"], tg["ratio"]]] else "DIFFERENT:" + json.dumps(prov)) if ok else None
            avail = sorted(d["acceptanceUtc"] for d in docs if d.get("acceptanceUtc") and d.get("ratioStated"))
            rec["availableAt"] = avail[0] if avail else None
        else:
            rec["status"] = "SPINOFF_NOT_REPRESENTABLE_IN_LEDGER"
            rec["providerCrossCheck"] = "Provider encodes this spin-off as a split factor: " + json.dumps(prov)
        rows.append(rec)
        print(tg["ticker"], tg["kind"], rec["status"], rec.get("effectiveDate"), rec.get("providerCrossCheck"), flush=True)
    rep = {"schemaVersion": "v9-portfolio-split-evidence-1.0.0", "codeSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           "scope": "Splits/spin-offs of the dividend-evidence companies inside 2015-01-01..2026-10-23 known from provider corporateActions; each sourced from the issuer's 8-K exhibits",
           "splits": rows, "certification": "NOT_CERTIFIED", "productionApproved": False}
    Path(a.out).write_text(json.dumps(rep, indent=1) + "\n")


if __name__ == "__main__":
    main()
