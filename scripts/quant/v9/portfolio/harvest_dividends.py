#!/usr/bin/env python3
"""V9 portfolio: harvest cash-dividend declarations from SEC originals.

Sources (all SEC EDGAR, public): every 10-Q/10-K primary document filed in the
scan window, plus 8-K/10-K exhibits returned by EDGAR full-text search for
dividend/record-date language. Raw bodies stay in the private cache; this
script writes only per-document extraction records (private) which
build_dividend_table.py turns into the committed evidence table.

Nothing is inferred: a field that is not stated in a document stays null.
An ex-dividend date is never used as a payment date.
"""
import argparse
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import secfetch as S  # noqa: E402

COMPANIES = {
    "JPM": 19617, "MSFT": 789019, "NVDA": 1045810, "IBM": 51143,
    "XOM": 34088, "WMT": 104169, "A": 1090872, "META": 1326801,
}
SCAN_FROM, SCAN_TO = "2014-10-01", "2026-10-27"
EIGHTK_ITEMS = ("2.02", "8.01", "7.01")
FT_QUERIES = ['dividend "of record"', 'dividend "record date"', '"dividend" "payable" "per share"']

MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"])}
ABBR = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
        "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12}
DATE = (r"(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?"
        r"(January|February|March|April|May|June|July|August|September|October|November|December|"
        r"Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sept\.?|Sep\.?|Oct\.?|Nov\.?|Dec\.?)"
        r"\s+(\d{1,2})\s*,\s*(\d{4})")
DATE_RE = re.compile(DATE)
AMT = r"\$\s?(\d{0,3}\.\d{2,4}|\d{1,3})\s*(?:per|a)\s+(?:common\s+)?share"


def iso(mon, day, year):
    k = mon.lower().rstrip(".")
    m = MONTHS.get(k) or ABBR.get(k) or ABBR.get(k[:3])
    return f"{int(year):04d}-{m:02d}-{int(day):02d}"


def dates_in(s):
    return [(m.start(), iso(*m.groups())) for m in DATE_RE.finditer(s)]


def first_date_after(s, pos, limit):
    for p, d in dates_in(s[pos:pos + limit]):
        return d
    return None


def sentence_bounds(t, pos):
    lo = pos
    for _ in range(900):
        if lo <= 0:
            break
        if t[lo] == "\n" or (t[lo] == "." and lo + 2 < len(t) and t[lo + 1] == " " and t[lo + 2].isupper()
                             and not re.search(r"(?:Inc|Co|Corp|No|St|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)$", t[max(0, lo - 5):lo])):
            lo += 1
            break
        lo -= 1
    hi = pos
    while hi < len(t) and hi - pos < 700:
        if t[hi] == "\n" or (t[hi] == "." and hi + 2 < len(t) and t[hi + 1] == " " and t[hi + 2].isupper()
                             and not re.search(r"(?:Inc|Co|Corp|No|St|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)$", t[max(0, hi - 5):hi])):
            break
        hi += 1
    return max(lo, 0), hi


def sentence_events(t, doc_dateline):
    out, seen = [], set()
    for m in re.finditer(r"(?i)of record|record date", t):
        lo, hi = sentence_bounds(t, m.start())
        s = t[lo:hi]
        if (lo, hi) in seen:
            continue
        seen.add((lo, hi))
        if not re.search(r"(?i)dividend|distribution|installment", s):
            continue
        if re.search(r"(?i)preferred|depositary|series [a-z]{1,2}\b|warrant share number|-for-|stock split|additional shares", s) and not re.search(r"(?i)common stock dividend|per common share", s):
            continue
        if re.search(r"(?i)stock split|-for-one|in the form of a stock dividend", s):
            continue
        rec = None
        for mm in re.finditer(r"(?i)of record|record date", s):
            rec = first_date_after(s, mm.end(), 140)
            if rec:
                break
        pay = None
        for mm in re.finditer(r"(?i)payable|paid|\bpay\b", s):
            pay = first_date_after(s, mm.end(), 140)
            if pay:
                break
        if not rec or not pay or pay == rec:
            continue
        ctx = t[max(0, lo - 450):lo] + s
        amt = None
        dpos = s.lower().find("dividend")
        for src in (s[dpos:] if dpos >= 0 else "", s, ctx):
            mm = re.search(AMT, src, re.I)
            if mm:
                amt = mm.group(1)
                break
        decl = None
        mm = re.search(r"(?i)\bOn\s+" + DATE + r",?\s+(?:the\s+|our\s+)?(?:Board|board|Company|company|Firm|we\b|IBM|ExxonMobil|NVIDIA|Microsoft|Walmart|Agilent|Meta)[^.]{0,160}?(?:declared|approved|announced)", ctx)
        if mm:
            decl = iso(*mm.groups()[0:3])
        elif re.search(r"(?i)today\s+(?:declared|approved|announced)", ctx) and doc_dateline:
            decl = doc_dateline
        intent = bool(re.search(r"(?i)\bintends?\b|\bwould be\b|\bexpects?\b|\bplans? to\b", s))
        kind = "SPECIAL" if re.search(r"(?i)special", s) else "REGULAR"
        out.append({"pattern": "SENTENCE", "recordDate": rec, "payDate": pay, "amount": amt, "declarationDate": decl,
                    "intentOnly": intent, "kind": kind, "quote": re.sub(r"\s+", " ", s.strip())[:300]})
    return out


def table_events(t):
    """MSFT-style tables: Declaration Date / Record Date / Payment Date / per share."""
    out = []
    if "Declaration Date" not in t:
        return out
    flat = re.sub(r"\s+", " ", t)
    A = re.compile(DATE + r"\s*\$?\s*(\d\.\d{2,3})\s*" + DATE + r"\s*\$?\s*[\d,]+\s*" + DATE)
    B = re.compile(DATE + r"\s*" + DATE + r"\s*" + DATE + r"\s*\$?\s*(\d\.\d{2,3})\s*\$?\s*[\d,]+")
    for m in A.finditer(flat):
        g = m.groups()
        out.append({"pattern": "TABLE_DECL_AMT_REC_TOTAL_PAY", "declarationDate": iso(*g[0:3]), "amount": g[3],
                    "recordDate": iso(*g[4:7]), "payDate": iso(*g[7:10]), "intentOnly": False, "kind": "REGULAR",
                    "quote": m.group(0)[:300]})
    for m in B.finditer(flat):
        g = m.groups()
        out.append({"pattern": "TABLE_DECL_REC_PAY_AMT_TOTAL", "declarationDate": iso(*g[0:3]), "recordDate": iso(*g[3:6]),
                    "payDate": iso(*g[6:9]), "amount": g[9], "intentOnly": False, "kind": "REGULAR", "quote": m.group(0)[:300]})
    return out


def installment_events(t):
    """WMT-style: '... installments of $X per share, according to the following record and payable dates: Record Date Payable Date d1 p1 ...'."""
    out = []
    flat = re.sub(r"\s+", " ", t)
    for m in re.finditer(r"(?i)installments? of \$\s?(\d+\.\d+) per share[^.]{0,120}?record and payable dates:?\s*(?:\|\s*)?Record Date\s*(?:\|\s*)?Payable Date", flat):
        amt = m.group(1)
        tail = flat[m.end():m.end() + 600]
        ds = dates_in(tail)
        pairs = []
        k = 0
        while k + 1 < len(ds) and len(pairs) < 4:
            (p1, d1), (p2, d2) = ds[k], ds[k + 1]
            gap = tail[p1:p2]
            if len(gap) > 60 or d2 <= d1:
                break
            pairs.append((d1, d2))
            k += 2
        decl = None
        pre = flat[max(0, m.start() - 400):m.start()]
        mm = re.search(r"(?i)(?:effective|on)\s+" + DATE + r"[^.]{0,80}(?:approved|declared)|(?:approved|declared)[^.]{0,40}effective\s+" + DATE, pre)
        if mm:
            g = [x for x in mm.groups() if x is not None]
            decl = iso(*g[0:3])
        for d1, d2 in pairs:
            out.append({"pattern": "INSTALLMENT_TABLE", "recordDate": d1, "payDate": d2, "amount": amt, "declarationDate": decl,
                        "intentOnly": False, "kind": "REGULAR", "quote": (pre[-120:] + flat[m.start():m.end() + 160])[:300]})
    return out


IX_NAMES = re.compile(r"(DividendsPayableDateDeclaredDayMonthAndYear|DividendsPayableDateOfRecordDayMonthAndYear|DividendPayableDateToBePaidDayMonthAndYear|DividendsPayableDateToBePaidDayMonthAndYear|CommonStockDividendsPerShareDeclared)")


def ix_facts(raw):
    t = raw.decode("utf8", "replace")
    out = []
    for m in re.finditer(r"<ix:(nonNumeric|nonFraction)\b([^>]*)>(.*?)</ix:\1>", t, re.S):
        attrs = m.group(2)
        nm = re.search(r'name="([^"]+)"', attrs)
        if not nm or not IX_NAMES.search(nm.group(1)):
            continue
        ctx = re.search(r'contextRef="([^"]+)"', attrs)
        val = re.sub(r"<[^>]+>", "", m.group(3)).strip()
        out.append({"name": nm.group(1), "context": ctx.group(1) if ctx else None, "value": val[:80]})
    return out


def full_text_hits(cik):
    docs = {}
    for q in FT_QUERIES:
        start = 0
        while True:
            u = ("https://efts.sec.gov/LATEST/search-index?q=" + urllib.parse.quote(q) + "&ciks=" + str(cik).zfill(10)
                 + "&forms=8-K,10-Q,10-K&dateRange=custom&startdt=" + SCAN_FROM + "&enddt=" + SCAN_TO + "&from=" + str(start))
            d = S.get_json(u)
            hits = d["hits"]["hits"]
            for h in hits:
                acc, fn = h["_id"].split(":", 1)
                ft = h["_source"].get("file_type") or ""
                if re.match(r"EX-(3|4|10|2|95|21|23|31|32)\b", ft, re.I):
                    continue
                docs[(acc, fn)] = {"form": h["_source"].get("form"), "fileType": ft, "fileDate": h["_source"].get("file_date")}
            start += len(hits)
            if not hits or start >= d["hits"]["total"]["value"] or start >= 1000:
                break
    return docs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", default=",".join(COMPANIES))
    ap.add_argument("--out", default=str(S.PRIVATE / "dividend-extractions"))
    a = ap.parse_args()
    out = Path(a.out)
    if S.ROOT in out.resolve().parents:
        raise SystemExit("PRIVATE_OUTPUT_REQUIRED")
    out.mkdir(parents=True, exist_ok=True)
    for tk in a.tickers.split(","):
        cik = COMPANIES[tk]
        _, subs = S.submissions(cik)
        by_acc = {r["accessionNumber"]: r for r in subs}
        docs = {}
        for r in subs:
            if r["form"] in ("10-Q", "10-K") and SCAN_FROM <= r["filingDate"] <= SCAN_TO and r["primaryDocument"]:
                docs[(r["accessionNumber"], r["primaryDocument"])] = {"form": r["form"], "fileType": r["form"], "fileDate": r["filingDate"]}
        docs.update({k: v for k, v in full_text_hits(cik).items() if k not in docs})
        # All exhibits of 8-Ks with results/other-event items (earnings releases state record/pay dates).
        for r in subs:
            if r["form"] != "8-K" or not (SCAN_FROM <= r["filingDate"] <= SCAN_TO):
                continue
            if not set(r.get("items", "").split(",")) & set(EIGHTK_ITEMS):
                continue
            try:
                ix = S.index_json(cik, r["accessionNumber"])
            except Exception as e:
                docs[(r["accessionNumber"], "index.json")] = {"form": "8-K", "fileType": "INDEX", "fileDate": r["filingDate"], "indexError": str(e)[:120]}
                continue
            for it in ix["directory"]["item"]:
                n = it["name"]
                if not re.search(r"\.(htm|html|txt)$", n, re.I) or re.match(r"(R\d+\.htm|.*index.*|.*\.txt$)", n, re.I) or n == r["primaryDocument"]:
                    continue
                docs.setdefault((r["accessionNumber"], n), {"form": "8-K", "fileType": "8-K-EXHIBIT", "fileDate": r["filingDate"]})
        records = []
        for (acc, fn), meta in sorted(docs.items(), key=lambda kv: kv[1]["fileDate"]):
            url = S.archive_base(cik, acc) + fn
            if meta.get("indexError"):
                records.append({"accession": acc, "file": fn, "url": url, **meta, "error": meta["indexError"]})
                continue
            try:
                raw = S.get(url)
            except Exception as e:  # recorded, never silently dropped
                records.append({"accession": acc, "file": fn, "url": url, **meta, "error": str(e)[:200]})
                continue
            t = S.html_text(raw)
            head = re.sub(r"\s+", " ", t[:1500])
            dl = dates_in(head)
            sub = by_acc.get(acc, {})
            ev = sentence_events(t, dl[0][1] if dl else None) + table_events(t) + installment_events(t)
            records.append({"accession": acc, "file": fn, "url": url, **meta, "sha256": S.sha(raw), "bytes": len(raw),
                            "acceptanceDateTimeSubmissions": sub.get("acceptanceDateTime"), "items": sub.get("items"),
                            "datelineDate": dl[0][1] if dl else None, "events": ev, "ixFacts": ix_facts(raw)})
            print(tk, meta["fileDate"], acc, fn, len(ev), flush=True)
        (out / f"{tk}.json").write_text(json.dumps({"ticker": tk, "cik": cik, "scan": [SCAN_FROM, SCAN_TO],
                                                    "queries": FT_QUERIES, "documents": records}, indent=1))
        print("DONE", tk, len(records), S.client().stats, flush=True)


if __name__ == "__main__":
    main()
