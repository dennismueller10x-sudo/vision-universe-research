#!/usr/bin/env python3
"""V9 follow-up (ledger): SEC-sourced terms for the new research-ledger event types.

Fetches the original SEC documents for two real corporate actions, verifies every
quoted sentence in the normalized document body and writes a compact evidence
file (quotes, URLs, document SHA-256, EDGAR acceptance instants). Raw bodies stay
in a private cache outside the repository; the client is rate limited to 2 req/s.

  IBM -> Kyndryl spin-off (SPINOFF): 1 KD per 5 IBM, record date 2021-10-25,
      distribution date 2021-11-03, regular-way KD from the next trading day.
  Webster (WBS) -> Banco Santander (TERMINAL_EXCHANGE): 2.0548 Santander ADS
      + $48.75 cash per share; ADS listed on NYSE as SAN; cash credit date not
      stated (NOT_STATED).

Nothing here is a model parameter: dates that are derived from sourced
statements (ex-date = first trading day after the distribution date) are
labelled as such.
"""
import argparse
import hashlib
import html
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from scripts.quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter  # noqa: E402

PRIVATE = Path(os.environ.get(
    "V9_FU_LEDGER_PRIVATE",
    "/tmp/claude-0/-home-user-vision-universe-research/84af0cda-6f74-5ce8-afa8-dfb2e62db3b4/scratchpad/v9-private/followups/ledger"))

DOCS = {
    "KD_FORM10_INFO_STATEMENT": {
        "cik": 1867072, "accession": "0001104659-21-125040", "file": "tm2119587-12_ex99d1.htm", "form": "10-12B/A (Exhibit 99.1 information statement)",
        "quotes": {
            "ratioRecordDate": "On October 10, 2021, the IBM Board approved the distribution of 80.1% of the issued and outstanding shares of our common stock, on the basis of one share of our common stock for every five shares of IBM common stock held as of the close of business on the record date of October 25, 2021.",
            "distributionDate": "On November 3, 2021, the Distribution Date, each IBM stockholder will receive one share of our common stock for every five shares of IBM common stock held at close of business on the record date.",
            "entitlementThroughDistributionDate": "Therefore, if you sell shares of IBM common stock in the regular-way market up to and including the Distribution Date, you will be selling your right to receive shares of our common stock in the Distribution.",
            "regularWayStart": "On the first trading day following the Distribution Date, we expect that “when-issued” trading of our common stock will end and “regular-way” trading will begin.",
            "fractions": "The distribution agent will distribute only whole shares of our common stock in the Spin-Off.",
        },
    },
    "KD_COMPLETION_8K": {
        "cik": 1867072, "accession": "0001104659-21-134456", "file": "tm2131654d1_8k.htm", "form": "8-K",
        "quotes": {
            "completion": "On November 3, 2021 (the “Distribution Date”), International Business Machines Corporation (“IBM”) completed the previously announced complete legal and structural separation and distribution to its stockholders",
            "ratio": "The distribution was made in the amount of one share of the Company’s common stock for every five shares of IBM common stock (the “Distribution”) owned by IBM’s holders of common stock as of the close of business on October 25, 2021 (the “Record Date”).",
        },
    },
    "WBS_COMPLETION_8K": {
        "cik": 801337, "accession": "0001193125-26-357758", "file": "d919931d8k.htm", "form": "8-K",
        "quotes": {
            "closing": "This Current Report on Form 8-K is being filed in connection with the completion on August 20, 2026 (the “Closing Date”) of the previously announced acquisition of Webster Financial Corporation",
            "consideration": "was exchanged for the right to receive from Banco Santander 2.0548 Banco Santander American Depositary Shares and $48.75 in cash, without interest.",
            "effective": "would become effective on August 20, 2026 at 12:01 a.m., 12:02 a.m. and 12:04 a.m., respectively, Eastern Time.",
            "delisting": "withdraw Webster Common Stock and Webster Preferred Stock from listing on the NYSE before the market opened on NYSE on August 20, 2026",
        },
    },
    "SAN_PROXY_PROSPECTUS_424B3": {
        "cik": 891478, "accession": "0001140361-26-016431", "file": "ny20067167x5_424b3.htm", "form": "424B3",
        "quotes": {
            "adsListing": "Santander ADSs trade on the New York Stock Exchange (“NYSE”) under the ticker symbol “SAN.”",
            "adsPriceCheck": "closing price of the Santander ADSs of $12.88 on April 17, 2026",
            "fractions": "No fractional Santander ADSs will be allotted to any holder of shares of Webster common stock in the transaction. Fractional entitlements to Santander ADSs will be aggregated and sold in the market by the exchange agent",
        },
    },
    "WBS_10Q_2026Q2": {
        "cik": 801337, "accession": "0000801337-26-000023", "file": "wbs-20260630.htm", "form": "10-Q",
        "quotes": {
            "lastDeclarationStated": "On April 29, 2026, it was announced that the Company’s Board of Directors had declared quarterly cash dividends of $0.40 per share on Webster common stock",
        },
    },
}
# Filings checked for a WBS common dividend declaration after the 2026Q2 one (none found).
WBS_CHECKED_FOR_LATER_DECLARATION = ["0000801337-26-000021", "0000801337-26-000023", "0000801337-26-000025", "0001193125-26-357758"]


def normalize(body):
    text = body.decode("utf-8", "replace")
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="evidence JSON (small, derived)")
    a = ap.parse_args()
    if PRIVATE.resolve() == ROOT or ROOT in PRIVATE.resolve().parents:
        raise SystemExit("PRIVATE_CACHE_MUST_BE_OUTSIDE_REPOSITORY")
    client = SECHttpClient(cache=DiskCache(PRIVATE / "http-cache", ttl_seconds=None), rate_limiter=RateLimiter(rate_per_second=2, burst=2))
    accept = {}

    def acceptance(cik, accession):
        if cik not in accept:
            root = json.loads(client.get_bytes(f"https://data.sec.gov/submissions/CIK{str(cik).zfill(10)}.json"))
            pages = [root["filings"]["recent"]] + [json.loads(client.get_bytes("https://data.sec.gov/submissions/" + f["name"])) for f in root["filings"].get("files", [])]
            accept[cik] = {p["accessionNumber"][i]: (p["acceptanceDateTime"][i], p["form"][i], p["filingDate"][i]) for p in pages for i in range(len(p["accessionNumber"]))}
        return accept[cik][accession]

    docs, ok = {}, True
    for key, d in DOCS.items():
        url = f"https://www.sec.gov/Archives/edgar/data/{d['cik']}/{d['accession'].replace('-', '')}/{d['file']}"
        body = client.get_bytes(url)
        text = normalize(body)
        acc_utc, form, filed = acceptance(d["cik"], d["accession"])
        verified = {k: q in text for k, q in d["quotes"].items()}
        ok &= all(verified.values())
        docs[key] = {"cik": d["cik"], "accession": d["accession"], "form": d["form"], "submissionsForm": form, "filingDate": filed,
                     "acceptanceUtc": acc_utc.replace("Z", "").split(".")[0] + ".000Z", "url": url, "sha256": hashlib.sha256(body).hexdigest(),
                     "quotes": d["quotes"], "quotesVerifiedInBody": verified}
    later = []
    for acc in WBS_CHECKED_FOR_LATER_DECLARATION:
        idx = json.loads(client.get_bytes(f"https://www.sec.gov/Archives/edgar/data/801337/{acc.replace('-', '')}/index.json"))
        hits = 0
        for it in idx["directory"]["item"]:
            n = it["name"]
            # Primary document and exhibits; XBRL viewer pages (R<n>.htm) only repeat taxonomy definitions.
            if n.endswith(".htm") and not n.endswith("-index.htm") and not re.fullmatch(r"R\d+\.htm", n):
                t = normalize(client.get_bytes(f"https://www.sec.gov/Archives/edgar/data/801337/{acc.replace('-', '')}/{n}"))
                hits += len([m for m in re.finditer(r"declared[^.]{0,200}dividend", t, re.I) if "April 29, 2026" not in t[max(0, m.start() - 120):m.end()]])
        later.append({"accession": acc, "acceptanceUtc": acceptance(801337, acc)[0], "laterDeclarationMatches": hits})

    kd, kd8k, wbs, san = docs["KD_FORM10_INFO_STATEMENT"], docs["KD_COMPLETION_8K"], docs["WBS_COMPLETION_8K"], docs["SAN_PROXY_PROSPECTUS_424B3"]
    evidence = {
        "schemaVersion": "v9-followup-ledger-ca-events-1.0.0",
        "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "status": "PASS" if ok else "QUOTE_NOT_VERIFIED",
        "events": [
            {"kind": "SPINOFF", "parent": "IBM", "distributed": "KD", "shareRatio": "0.2", "shareRatioStated": "one share ... for every five shares",
             "recordDate": "2021-10-25", "distributionDate": "2021-11-03",
             "exDate": "2021-11-04", "exDateBasis": "DERIVED_FROM_SOURCED_STATEMENTS: regular-way IBM carries the entitlement up to and including the Distribution Date; first trading day after 2021-11-03 (XNYS) is 2021-11-04",
             "distributedFirstRegularWayDate": "2021-11-04", "distributedFirstRegularWayBasis": "regularWayStart quote + completion 8-K Distribution Date",
             "informationAvailableAt": {"TERMS": kd["acceptanceUtc"], "COMPLETION": kd8k["acceptanceUtc"]},
             "informationAvailableAtBasis": {"TERMS": "Form 10/A information statement stating ratio, record date and distribution date", "COMPLETION": "Kyndryl 8-K reporting the completed distribution (accepted after the 2021-11-04 close)"},
             "sourceHash": kd["sha256"], "completionSourceHash": kd8k["sha256"], "fractions": "whole shares only; cash in lieu not modelled (fractional units kept)"},
            {"kind": "TERMINAL_EXCHANGE", "listing": "WBS", "successor": "SAN", "successorInstrumentClass": "ADS", "successorPrimary": False,
             "shareRatio": "2.0548", "cashPerShare": "48.75", "closingDate": "2026-08-20", "effectiveTime": "2026-08-20T00:01 America/New_York",
             "lastTradeDate": "2026-08-19", "lastTradeDateBasis": "withdrawn from NYSE listing before the market opened on 2026-08-20",
             "firstSuccessorSession": "2026-08-20", "cashCreditDate": None, "cashCreditDateState": "NOT_STATED",
             "informationAvailableAt": wbs["acceptanceUtc"], "informationAvailableAtBasis": "completion 8-K acceptance (before the 2026-08-20 open)",
             "sourceHash": wbs["sha256"], "adsIdentitySourceHash": san["sha256"],
             "adsIdentityCrossCheck": {"statedClose": "12.88", "statedDate": "2026-04-17", "series": "quant/data/market/discover-series/ref_SAN.json"},
             "fractions": "fractional ADS sold by the exchange agent, proceeds not stated per holder; fractional units kept"},
        ],
        "wbsDividendScope": {"lastDeclarationStated": "2026-04-29 ($0.40, record/pay dates not stated in SEC filings)", "filingsCheckedForLaterDeclaration": later,
                             "statement": "No later WBS common dividend declaration found in the checked SEC filings; absence is not positively sourced (limitation)."},
        "documents": docs,
        "certification": "NOT_CERTIFIED", "productionApproved": False,
    }
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(evidence, indent=1, ensure_ascii=False) + "\n")
    print(evidence["status"], {k: v["quotesVerifiedInBody"] for k, v in docs.items()}, later)
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
