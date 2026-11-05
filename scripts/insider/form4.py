#!/usr/bin/env python3
"""SEC EDGAR Form 4 purchase producer. Standard library only; see README.md."""
import argparse
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation, localcontext
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time as clock
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

VERSION = "sec-form4-purchases-1.0.0"
SEC = "https://www.sec.gov/Archives/"
NY = ZoneInfo("America/New_York")
FILING_PATH = re.compile(r"edgar/data/\d+/(\d{10}-\d{2}-\d{6})\.txt\Z")


def utc(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def cutoff(value):
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return datetime.combine(date.fromisoformat(value), time.max, timezone.utc)
    d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if d.tzinfo is None:
        raise ValueError("--as-of needs a timezone")
    return d.astimezone(timezone.utc)


def index_rows(text):
    """Quarterly master.idx; never derive the filing date from transaction dates."""
    if "CIK|Company Name|Form Type|Date Filed|Filename" not in text:
        raise ValueError("invalid EDGAR master index")
    rows = {}
    for line in text.splitlines():
        p = line.split("|")
        if len(p) != 5 or p[2] not in ("4", "4/A"):
            continue
        cik, _, form, filed, path = p
        if not cik.isdigit() or not FILING_PATH.fullmatch(path):
            raise ValueError("unsafe or invalid filing index row")
        date.fromisoformat(filed)
        row = {"form": form, "filingDate": filed, "path": path}
        if path in rows and rows[path] != row:
            raise ValueError("conflicting index rows")
        rows[path] = row
    return list(rows.values())


def number(node, path, positive=False):
    text = node.findtext(path)
    try:
        v = Decimal(text.strip()) if text else None
    except InvalidOperation:
        v = None
    if v is None or not v.is_finite() or v < 0 or (positive and v == 0):
        return None
    return format(v, "f")


def parse_filing(payload, meta):
    """One transaction once, with all reporting owners (not one copy per owner)."""
    match = FILING_PATH.fullmatch(meta["path"])
    if not match:
        raise ValueError("invalid filing path")
    text = payload.decode("utf-8-sig")
    # SEC complete-submission SGML contains the actual ownership XML in an XML block. Other documents of the
    # same submission (HTML exhibits with <!DOCTYPE html>) are never parsed, so only the parsed block is checked.
    blocks = re.findall(r"<XML>\s*(.*?)\s*</XML>", text, re.I | re.S) or [text]
    roots = []
    for block in blocks:
        if "ownershipDocument" not in block:
            continue
        if re.search(r"<!DOCTYPE|<!ENTITY", block, re.I):
            raise ValueError("DTD/entities not allowed")
        root = ET.fromstring(block.strip())
        for node in root.iter():
            node.tag = node.tag.rsplit("}", 1)[-1]
        if root.tag == "ownershipDocument":
            roots.append(root)
    if len(roots) != 1:
        raise ValueError("expected one ownershipDocument")
    root = roots[0]
    if root.findtext("documentType") != meta["form"]:
        raise ValueError("form/index mismatch")
    filed = date.fromisoformat(meta["filingDate"])
    accepted = re.search(r"<ACCEPTANCE-DATETIME>(\d{14})", text)
    if "<ACCEPTANCE-DATETIME>" in text and not accepted:
        raise ValueError("invalid acceptance timestamp")
    if accepted:
        at = datetime.strptime(accepted[1], "%Y%m%d%H%M%S").replace(tzinfo=NY)
        if at.date() > filed:
            raise ValueError("acceptance after filing date")
        available = at
    else:
        # Filing-date-only data must not be exposed at the start of that day.
        available = datetime.combine(filed + timedelta(days=1), time.min, NY)
    issuer = root.find("issuer")
    cik = issuer.findtext("issuerCik") if issuer is not None else None
    if not cik or not cik.isdigit():
        raise ValueError("issuer CIK missing")
    owners = []
    for owner in root.findall("reportingOwner"):
        owner_cik = owner.findtext("reportingOwnerId/rptOwnerCik")
        if not owner_cik or not owner_cik.isdigit():
            raise ValueError("owner CIK missing")
        owners.append({"cik": owner_cik.zfill(10), "name": owner.findtext("reportingOwnerId/rptOwnerName"),
                       "isDirector": owner.findtext("reportingOwnerRelationship/isDirector"),
                       "isOfficer": owner.findtext("reportingOwnerRelationship/isOfficer"),
                       "isTenPercentOwner": owner.findtext("reportingOwnerRelationship/isTenPercentOwner"),
                       "officerTitle": owner.findtext("reportingOwnerRelationship/officerTitle")})
    if not owners:
        raise ValueError("reporting owner missing")
    result, excluded = [], {"notPurchase": 0, "unpricedOrInvalid": 0, "derivativeTransactions": len(root.findall("derivativeTable/derivativeTransaction"))}
    for i, tx in enumerate(root.findall("nonDerivativeTable/nonDerivativeTransaction")):
        if tx.findtext("transactionCoding/transactionCode") != "P" or tx.findtext("transactionAmounts/transactionAcquiredDisposedCode/value") != "A":
            excluded["notPurchase"] += 1
            continue
        shares = number(tx, "transactionAmounts/transactionShares/value", positive=True)
        price = number(tx, "transactionAmounts/transactionPricePerShare/value", positive=True)
        day = tx.findtext("transactionDate/value")
        try:
            tx_day = date.fromisoformat(day)
        except (ValueError, TypeError):
            tx_day = None
        if not shares or not price or tx_day is None or tx_day > filed:
            excluded["unpricedOrInvalid"] += 1
            continue
        with localcontext() as ctx:
            ctx.prec = len(shares) + len(price) + 2
            reported_value = format(Decimal(shares) * Decimal(price), "f")
        result.append({"id": match[1] + ":nonDerivative:" + str(i), "accession": match[1],
                       "filingDate": filed.isoformat(), "acceptedAt": utc(available) if accepted else None,
                       "availableAt": utc(available), "availabilityBasis": "SEC_ACCEPTANCE" if accepted else "DAY_AFTER_FILING_NEW_YORK",
                       "transactionDate": day, "issuerCik": cik.zfill(10),
                       "issuerName": issuer.findtext("issuerName"), "tickerAsFiled": issuer.findtext("issuerTradingSymbol"),
                       "reportingOwners": owners, "securityTitle": tx.findtext("securityTitle/value"),
                       "transactionCode": "P", "shares": shares, "pricePerShare": price,
                       "reportedValue": reported_value, "priceCurrency": None,
                       "ownership": tx.findtext("ownershipNature/directOrIndirectOwnership/value"),
                       "isAmendment": meta["form"] == "4/A", "sourceUrl": SEC + meta["path"],
                       "sourceSha256": hashlib.sha256(payload).hexdigest()})
    return result, excluded


class Edgar:
    def __init__(self, user_agent):
        if not user_agent or "@" not in user_agent or "\n" in user_agent or "\r" in user_agent:
            raise ValueError("SEC User-Agent with contact email required (--user-agent or SEC_USER_AGENT)")
        self.user_agent, self.last = user_agent, 0.0

    def get(self, relative):
        if not (FILING_PATH.fullmatch(relative) or re.fullmatch(r"edgar/full-index/\d{4}/QTR[1-4]/master.idx", relative)):
            raise ValueError("invalid SEC archive path")
        for attempt in range(4):
            clock.sleep(max(0, 0.25 - (clock.monotonic() - self.last)))
            self.last = clock.monotonic()
            try:
                with urlopen(Request(SEC + relative, headers={"User-Agent": self.user_agent, "Accept-Encoding": "identity"}), timeout=60) as r:
                    return r.read()
            except HTTPError as exc:
                if exc.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    raise
                clock.sleep(2 ** attempt)
        raise RuntimeError("unreachable")


def quarters(start, end):
    y, q = start.year, (start.month - 1) // 3 + 1
    while (y, q) <= (end.year, (end.month - 1) // 3 + 1):
        yield f"edgar/full-index/{y}/QTR{q}/master.idx"
        y, q = (y + 1, 1) if q == 4 else (y, q + 1)


def generate(start, as_of, indices, load, max_rejected_share=0.01):
    """Bounded filing-date window; strict errors prevent publishing partial success."""
    rows, seen, excluded, filings, rejected = [], set(), {}, 0, []
    for content in indices:
        for meta in index_rows(content):
            # EDGAR lists one submission under every involved CIK (issuer and each reporting owner):
            # same accession, different paths. Deduplicate by accession, or every purchase is counted twice.
            accession = FILING_PATH.fullmatch(meta["path"])[1]
            if not start <= date.fromisoformat(meta["filingDate"]) <= as_of.date() or accession in seen:
                continue
            seen.add(accession)
            filings += 1
            try:
                purchases, counts = parse_filing(load(meta["path"]), meta)
            except (ValueError, ET.ParseError, UnicodeDecodeError) as exc:
                # One unreadable submission must not stop the daily run; it is listed, never guessed.
                # Network/HTTP errors are not caught here and still abort the run.
                rejected.append({"accession": accession, "form": meta["form"], "reason": str(exc)[:200]})
                continue
            for k, v in counts.items():
                excluded[k] = excluded.get(k, 0) + v
            rows.extend(r for r in purchases if cutoff(r["availableAt"]) <= as_of)
    if filings and (len(rejected) == filings or len(rejected) > max(1, filings * max_rejected_share)):
        raise ValueError(f"too many unreadable filings: {len(rejected)} of {filings}")
    rows.sort(key=lambda r: (r["availableAt"], r["id"]))
    return {"schemaVersion": VERSION, "generatedAt": utc(datetime.now(timezone.utc)), "asOf": utc(as_of),
            "window": {"filingDateFrom": start.isoformat(), "filingDateTo": as_of.date().isoformat()},
            "source": "SEC EDGAR quarterly master index and complete Form 4 submissions",
            "filingsProcessed": filings, "records": len(rows), "excluded": excluded,
            "rejectedFilings": rejected, "purchases": rows,
            "limitations": ["FILING_WINDOW_NOT_FULL_HISTORY", "P_IS_OPEN_MARKET_OR_PRIVATE_PURCHASE",
                            "AMENDMENTS_ARE_SEPARATE_EVENTS_DO_NOT_SUM_WITH_ORIGINALS", "NO_HISTORICAL_TICKER_IDENTITY_MAPPING",
                            "NO_DERIVATIVES_OR_UNPRICED_PURCHASES", "CURRENCY_NOT_DECLARED_BY_FORM_4"]}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from", dest="start", required=True, type=date.fromisoformat)
    ap.add_argument("--as-of", required=True, type=cutoff)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--user-agent", default=os.environ.get("SEC_USER_AGENT"))
    ap.add_argument("--index-file", action="append", type=Path, help="offline master.idx (repeatable)")
    ap.add_argument("--filings-dir", type=Path, help="offline directory containing edgar/data/...txt")
    args = ap.parse_args(argv)
    if args.start > args.as_of.date() or args.as_of > datetime.now(timezone.utc):
        ap.error("invalid or future window")
    if bool(args.index_file) != bool(args.filings_dir):
        ap.error("--index-file and --filings-dir must be used together")
    if args.index_file:
        indices = [p.read_text(encoding="utf-8-sig") for p in args.index_file]
        load = lambda p: (args.filings_dir / p).read_bytes()
    else:
        client = Edgar(args.user_agent)
        indices = [client.get(p).decode("utf-8-sig") for p in quarters(args.start, args.as_of.date())]
        load = client.get
    doc = generate(args.start, args.as_of, indices, load)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    # Atomic replacement, only after every filing succeeds; no partial artifact on errors.
    name = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=args.out.parent, encoding="utf-8", delete=False) as f:
            name = f.name
            json.dump(doc, f, ensure_ascii=False, indent=2, allow_nan=False)
            f.write("\n")
        os.replace(name, args.out)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)
    print(json.dumps({"records": doc["records"], "filingsProcessed": doc["filingsProcessed"], "asOf": doc["asOf"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
