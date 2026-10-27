#!/usr/bin/env python3
"""V9 portfolio: turn two SEC completion 8-Ks into ledger-ready terminal events.

Every value is bound to a verbatim quote that must occur in the fetched body
(assertion), plus accession, URL, SHA-256 and SGML acceptance time. Values that
the sources do not state (broker cash-credit date of the merger consideration)
are recorded as NOT_STATED and never filled silently.
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import secfetch as S  # noqa: E402

CASES = [
    {"ticker": "CRNX", "cik": 1658247, "accession": "0001140361-26-035195", "file": "ef20081409_8k.htm", "type": "TERMINAL_CASH",
     "closingDate": "2026-09-01", "cashPerShare": "85.00", "shareRatio": None, "successor": None,
     "quotes": {"closing": "On September 1, 2026 (the “ Closing Date ”), pursuant to the terms of the Merger Agreement, Merger Sub merged with and into the Company",
                "consideration": "right to receive $85.00",
                "trading": "suspend trading in the Company Common Stock effective prior to the opening of trading on the Closing Date"},
     "lastTradeDateRule": "trading suspended prior to the opening on the Closing Date -> last trading session is the session before 2026-09-01"},
    {"ticker": "LBRDK", "cik": 1611983, "accession": "0001140361-26-033932", "file": "ef20080711_8k.htm", "type": "TERMINAL_EXCHANGE",
     "closingDate": "2026-08-19", "cashPerShare": "0", "shareRatio": "0.236", "successor": "CHTR",
     "quotes": {"closing": "On August 19, 2026 (the “ Closing Date ”)",
                "effective": "At 11:56 p.m., New York City time on the Closing Date (the “ Effective Time ”)",
                "consideration": "was automatically converted into 0.236 of a share of a validly issued, fully paid and nonassessable share of Charter Class A common stock",
                "fractions": "with cash (without interest) being paid to entitled record holders of Liberty Broadband Common Stock in lieu of fractional shares"},
     "lastTradeDateRule": "effective 11:56 p.m. on 2026-08-19 -> 2026-08-19 is the last possible regular session; first session holding Charter Class A is 2026-08-20",
     "priorTerms": {"accession": "0001104659-24-117312", "file": "tm2428162d1_8k.htm",
                    "quote": "would be automatically converted into and become the right to receive 0.236 of a share (the “ Common Exchange Ratio ”)"},
     "removalNotice": {"form": "25-NSE", "accession": None}},
]
# Verified dossiers NOT used in the ledger run (reason given per case).
DOSSIER_ONLY = [
    {"ticker": "DBRG", "cik": 1679688, "accession": "0001104659-26-112148", "file": "tm2626145d9_8k.htm", "type": "TERMINAL_CASH", "cashPerShare": "16.00",
     "quotes": {"consideration": "was converted into the right to receive $16.00 in cash, without interest", "trading": "removed from trading on the NYSE prior to the opening of trading on September 30, 2026"},
     "notInLedger": "DBRG paid cash dividends in the window; no SEC dividend evidence harvested for DBRG -> TR incomplete"},
    {"ticker": "TWO", "cik": 1465740, "accession": "0001104659-26-100622", "file": "tm2621794d1_8k.htm", "type": "TERMINAL_CASH", "cashPerShare": "12.00",
     "quotes": {"closing": "On August 25, 2026 (the “Closing Date”)", "consideration": "converted into the right to receive an amount in cash equal to $12.00 per share",
                "trading": "suspend trading of TWO Common Stock on the NYSE prior to the opening of trading on the Closing Date"},
     "notInLedger": "TWO paid cash dividends in the window; no SEC dividend evidence harvested for TWO -> TR incomplete"},
    {"ticker": "WBS", "cik": 801337, "accession": "0001193125-26-357758", "file": "d919931d8k.htm", "type": "TERMINAL_MIXED_CASH_AND_ADS", "cashPerShare": "48.75", "shareRatio": "2.0548", "successor": "SAN (Banco Santander ADS)",
     "quotes": {"consideration": "exchanged for the right to receive from Banco Santander 2.0548 Banco Santander American Depositary Shares and $48.75 in cash, without interest",
                "trading": "withdraw Webster Common Stock and Webster Preferred Stock from listing on the NYSE before the market opened on NYSE on August 20, 2026"},
     "notInLedger": "successor is an American Depositary Share; runPortfolio accepts only COMMON_STOCK listings (would require mislabelling) and WBS dividends not harvested"},
    {"ticker": "TALK", "cik": 1803901, "accession": None, "file": "form8-k.htm", "type": "TERMINAL_CASH", "cashPerShare": "5.25",
     "quotes": {"closing": "On August 17, 2026 (the “ Closing Date ”)", "consideration": "was automatically converted into the right to receive $5.25 in cash, without interest"},
     "notInLedger": "source does not state whether trading was suspended before the open on the Closing Date; last trading session not established"},
]
NO_DIVIDEND = [
    {"ticker": "CRNX", "cik": 1658247, "accession": "0001658247-26-000012", "file": "crnx-20251231.htm", "quote": "We have never declared or paid any cash dividends on our capital stock."},
    {"ticker": "LBRDK", "cik": 1611983, "accession": "0001104659-26-010397", "file": "lbrda-20251231x10k.htm", "quote": "We have not paid any cash dividends on our common stock"},
    {"ticker": "CHTR", "cik": 1091667, "accession": "0001091667-26-000017", "file": "chtr-20251231.htm", "quote": "Charter has not paid cash dividends on its common stock and does not intend to do so in the foreseeable future."},
]


def norm(t):
    return re.sub(r"\s+", " ", t)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    events, policies = [], []
    for c in CASES:
        url = S.archive_base(c["cik"], c["accession"]) + c["file"]
        raw = S.get(url)
        t = norm(S.html_text(raw))
        found = {k: (q in t) for k, q in c["quotes"].items()}
        if not all(found.values()):
            raise SystemExit("QUOTE_NOT_FOUND " + c["ticker"] + " " + json.dumps(found))
        h = S.header(c["cik"], c["accession"])
        extra = {}
        if c.get("priorTerms"):
            pt = c["priorTerms"]
            purl = S.archive_base(c["cik"], pt["accession"]) + pt["file"]
            praw = S.get(purl)
            if pt["quote"] not in norm(S.html_text(praw)):
                raise SystemExit("QUOTE_NOT_FOUND terms " + c["ticker"])
            ph = S.header(c["cik"], pt["accession"])
            _, subs = S.submissions(c["cik"])
            f25 = [r for r in subs if r["form"] == "25-NSE" and r["filingDate"] == "2026-08-20"]
            f25h = S.header(c["cik"], f25[0]["accessionNumber"]) if f25 else {}
            extra = {"termsAvailability": {**pt, "url": purl, "sha256": S.sha(praw), "acceptanceUtc": ph["acceptanceUtc"], "quoteVerifiedInBody": True},
                     "removalNoticeAvailability": {"form": "25-NSE", "accession": f25[0]["accessionNumber"] if f25 else None, "acceptanceUtc": f25h.get("acceptanceUtc"), "headerSha256": f25h.get("sha256")},
                     "ledgerAvailableAt": max(ph["acceptanceUtc"], f25h.get("acceptanceUtc") or "9"),
                     "ledgerAvailabilityBasis": "max(exchange-ratio terms 8-K acceptance, Form 25-NSE acceptance); completion 8-K itself was accepted after the close of the first post-merger session"}
        else:
            extra = {"ledgerAvailableAt": h["acceptanceUtc"], "ledgerAvailabilityBasis": "completion 8-K acceptance"}
        events.append({**extra, **{k: c[k] for k in ("ticker", "cik", "accession", "type", "closingDate", "cashPerShare", "shareRatio", "successor", "lastTradeDateRule")},
                       "url": url, "sha256": S.sha(raw), "acceptanceUtc": h["acceptanceUtc"], "headerSha256": h["sha256"], "quotes": c["quotes"],
                       "quotesVerifiedInBody": True,
                       "cashCreditDate": None, "cashCreditDateState": "NOT_STATED (right to receive arises at the Effective Time; paying-agent/broker credit date not in source)",
                       "fractionalShareCash": "stated as paid in lieu but amount per holder not stated; ledger keeps fractional successor units" if c["type"] == "TERMINAL_EXCHANGE" else None})
    dossiers = []
    for c in DOSSIER_ONLY:
        acc = c["accession"]
        if acc is None:
            _, subs = S.submissions(c["cik"])
            acc = next(r["accessionNumber"] for r in subs if r["form"] == "8-K" and "2.01" in r.get("items", "") and r["filingDate"] >= "2026-08-01")
        url = S.archive_base(c["cik"], acc) + c["file"]
        raw = S.get(url)
        t = norm(S.html_text(raw))
        found = {k: (q in t) for k, q in c["quotes"].items()}
        h = S.header(c["cik"], acc)
        dossiers.append({**c, "accession": acc, "url": url, "sha256": S.sha(raw), "acceptanceUtc": h["acceptanceUtc"], "quotesVerifiedInBody": found})
    for p in NO_DIVIDEND:
        url = S.archive_base(p["cik"], p["accession"]) + p["file"]
        raw = S.get(url)
        ok = p["quote"] in norm(S.html_text(raw))
        if not ok:
            raise SystemExit("QUOTE_NOT_FOUND " + p["ticker"])
        h = S.header(p["cik"], p["accession"])
        policies.append({**p, "url": url, "sha256": S.sha(raw), "acceptanceUtc": h["acceptanceUtc"], "quoteVerifiedInBody": True,
                         "scope": "statement as of the 10-K filing date; absence of later declarations inside the ledger window is not positively sourced"})
    rep = {"schemaVersion": "v9-portfolio-terminal-ledger-events-1.0.0", "codeSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           "events": events, "verifiedDossiersNotInLedger": dossiers, "noDividendPolicies": policies, "certification": "NOT_CERTIFIED", "productionApproved": False}
    Path(a.out).write_text(json.dumps(rep, indent=1) + "\n")
    for e in events:
        print(e["ticker"], e["type"], e["closingDate"], e["cashPerShare"], e["shareRatio"], e["acceptanceUtc"])


if __name__ == "__main__":
    main()
