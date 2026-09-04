#!/usr/bin/env python3
"""Fetch hedge fund 13F-HR holdings from SEC EDGAR and write hedgefonds/data/hedgefonds.json.

Runs server-side (GitHub Actions), not in the visitor's browser. That matters
for two reasons:
  - CORS is a browser-only restriction; a plain server-to-server request to
    www.sec.gov needs no proxy at all.
  - Browsers refuse to let JavaScript set a custom User-Agent header, but the
    SEC asks automated clients to identify themselves with a contact address.
    A server-side script has no such restriction, so this sends a proper,
    SEC-compliant User-Agent.

For each fund this fetches the two most recent distinct 13F-HR reporting
periods (not just the latest), so the frontend can show real quarter-over-
quarter AUM change and a "new / closed positions" feed derived from a
CUSIP-level diff between the two quarters. 13F has no transaction log, so
that diff is the standard convention used by public 13F trackers: a position
appearing = opened, disappearing = closed.
"""
import json
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

USER_AGENT = "VisionUniverseResearch info@visionuniverse.de"
OUTPUT_PATH = Path(__file__).resolve().parents[2] / "hedgefonds" / "data" / "hedgefonds.json"
TOP_HOLDINGS_STORE = 150
TOP_TRADES_STORE = 40
REQUEST_DELAY = 0.3  # SEC allows ~10 req/sec; we stay far under that
MAX_RETRIES = 3

FUND_META = [
    {"cik": "0001423333", "abbr": "CITADEL", "name": "Citadel Advisors LLC", "type": "Multi-Strategy"},
    {"cik": "0001009207", "abbr": "DESHAW", "name": "D. E. Shaw & Co., Inc.", "type": "Quantitativ"},
    {"cik": "0001179392", "abbr": "TWOSIG", "name": "Two Sigma Investments, LP", "type": "Quantitativ"},
    {"cik": "0001273087", "abbr": "MILLENM", "name": "Millennium Management LLC", "type": "Multi-Strategy"},
    {"cik": "0001444406", "abbr": "MGROUP", "name": "Man Group plc", "type": "Quantitativ"},
    {"cik": "0001350694", "abbr": "BRDGWTR", "name": "Bridgewater Associates, LP", "type": "Macro"},
    {"cik": "0001037389", "abbr": "RENTEC", "name": "Renaissance Technologies LLC", "type": "Quantitativ"},
    {"cik": "0001603466", "abbr": "PT72", "name": "Point72 Asset Management, L.P.", "type": "Long/Short"},
]


def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError) as exc:
            last_err = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Abruf fehlgeschlagen nach {MAX_RETRIES} Versuchen: {url} ({last_err})")


def http_get_json(url):
    return json.loads(http_get(url))


def local_name(tag):
    return tag.split("}", 1)[1] if "}" in tag else tag


def find_child_text(el, name):
    for child in el.iter():
        if local_name(child.tag) == name:
            return (child.text or "").strip()
    return ""


def find_recent_13fs(filings_recent, n=2):
    """Liefert die n zuletzt gemeldeten, DISTINKTEN 13F-HR-Berichtsperioden.
    Bei einer Änderung (13F-HR/A) zu einer bereits erfassten Periode wird die
    zuletzt eingereichte Version bevorzugt."""
    forms = filings_recent.get("form", [])
    accs = filings_recent.get("accessionNumber", [])
    filed = filings_recent.get("filingDate", [])
    report = filings_recent.get("reportDate", [])
    by_period = {}
    for i, f in enumerate(forms):
        if f in ("13F-HR", "13F-HR/A"):
            rd = report[i]
            if rd not in by_period or filed[i] > by_period[rd]["filedDate"]:
                by_period[rd] = {"form": f, "accession": accs[i], "filedDate": filed[i], "reportDate": rd}
    periods = sorted(by_period.keys(), reverse=True)
    return [by_period[p] for p in periods[:n]]


def acc_no_dashes(acc):
    return acc.replace("-", "")


def parse_info_table_xml(xml_bytes):
    root = ET.fromstring(xml_bytes)
    holdings = []
    for el in root.iter():
        if local_name(el.tag) != "infoTable":
            continue
        issuer = find_child_text(el, "nameOfIssuer")
        if not issuer:
            continue
        cls = find_child_text(el, "titleOfClass")
        cusip = find_child_text(el, "cusip")
        try:
            value_thousands = float(find_child_text(el, "value") or 0)
        except ValueError:
            value_thousands = 0.0
        shares = 0.0
        for child in el:
            if local_name(child.tag) == "shrsOrPrnAmt":
                try:
                    shares = float(find_child_text(child, "sshPrnamt") or 0)
                except ValueError:
                    shares = 0.0
        holdings.append({
            "issuer": issuer, "cls": cls, "cusip": cusip,
            "valueUSD": value_thousands * 1000, "shares": shares,
        })
    return holdings


def fetch_filing_holdings(cik_int, accession):
    acc_dashes = acc_no_dashes(accession)
    idx = http_get_json(f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_dashes}/index.json")
    items = idx.get("directory", {}).get("item", [])
    names = [it["name"] for it in items]
    candidates = [n for n in names if n.lower().endswith(".xml") and n.lower() != "primary_doc.xml"]
    if not candidates:
        candidates = [n for n in names if n.lower().endswith(".xml")]
    if not candidates:
        raise RuntimeError("Keine Info-Table-XML im Filing gefunden.")

    for fname in candidates:
        time.sleep(REQUEST_DELAY)
        xml_bytes = http_get(f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_dashes}/{fname}")
        holdings = parse_info_table_xml(xml_bytes)
        if holdings:
            return holdings
    raise RuntimeError("Info-Table-XML konnte nicht geparst werden.")


def diff_holdings(current, previous):
    """CUSIP-Diff zweier Quartale: neu eröffnete / komplett verkaufte Positionen."""
    def key(h):
        return h["cusip"] or h["issuer"]

    prev_map, cur_map = {}, {}
    for h in previous:
        k = key(h)
        if k not in prev_map or h["valueUSD"] > prev_map[k]["valueUSD"]:
            prev_map[k] = h
    for h in current:
        k = key(h)
        if k not in cur_map or h["valueUSD"] > cur_map[k]["valueUSD"]:
            cur_map[k] = h

    opened = sorted((h for k, h in cur_map.items() if k not in prev_map), key=lambda h: -h["valueUSD"])
    closed = sorted((h for k, h in prev_map.items() if k not in cur_map), key=lambda h: -h["valueUSD"])
    return opened, closed


def fetch_fund(meta):
    cik = meta["cik"]
    cik_int = str(int(cik))
    sub = http_get_json(f"https://data.sec.gov/submissions/CIK{cik}.json")
    periods = find_recent_13fs(sub.get("filings", {}).get("recent", {}), 2)
    if not periods:
        raise RuntimeError("Kein 13F-HR Filing gefunden.")
    current, prev = periods[0], (periods[1] if len(periods) > 1 else None)

    time.sleep(REQUEST_DELAY)
    current_holdings = fetch_filing_holdings(cik_int, current["accession"])
    current_holdings.sort(key=lambda h: -h["valueUSD"])
    total_value = sum(h["valueUSD"] for h in current_holdings)
    position_count = len(current_holdings)
    top_holdings = [
        {**h, "weightPct": (h["valueUSD"] / total_value * 100) if total_value else 0}
        for h in current_holdings[:TOP_HOLDINGS_STORE]
    ]

    record = {
        "cik": cik, "name": sub.get("name") or sub.get("entityName") or meta["name"],
        "type": meta["type"], "abbr": meta["abbr"],
        "reportDate": current["reportDate"], "filedDate": current["filedDate"], "accession": current["accession"],
        "totalValueUSD": total_value, "positionCount": position_count, "topHoldings": top_holdings,
        "prevReportDate": prev["reportDate"] if prev else None,
        "prevTotalValueUSD": None, "prevPositionCount": None, "aumChangePct": None,
        "newPositions": [], "closedPositions": [], "newCount": 0, "closedCount": 0,
        "error": None,
    }

    if prev:
        time.sleep(REQUEST_DELAY)
        prev_holdings = fetch_filing_holdings(cik_int, prev["accession"])
        prev_total = sum(h["valueUSD"] for h in prev_holdings)
        opened, closed = diff_holdings(current_holdings, prev_holdings)
        record["prevTotalValueUSD"] = prev_total
        record["prevPositionCount"] = len(prev_holdings)
        record["aumChangePct"] = ((total_value - prev_total) / prev_total * 100) if prev_total else None
        record["newPositions"] = opened[:TOP_TRADES_STORE]
        record["closedPositions"] = closed[:TOP_TRADES_STORE]
        record["newCount"] = len(opened)
        record["closedCount"] = len(closed)

    return record


def main():
    funds = []
    for meta in FUND_META:
        print(f"Lade {meta['name']} (CIK {meta['cik']})...", file=sys.stderr)
        try:
            record = fetch_fund(meta)
            funds.append(record)
            print(f"  OK: {record['positionCount']} Positionen, {record['totalValueUSD']:.0f} USD", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001 - ein fehlgeschlagener Fonds soll die anderen nicht blockieren
            print(f"  Fehler: {exc}", file=sys.stderr)
            funds.append({
                "cik": meta["cik"], "name": meta["name"], "type": meta["type"], "abbr": meta["abbr"],
                "error": str(exc),
            })
        time.sleep(REQUEST_DELAY)

    output = {"generatedAt": datetime.now(timezone.utc).isoformat(), "funds": funds}
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Geschrieben: {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size} bytes)", file=sys.stderr)

    if all(f.get("error") for f in funds):
        sys.exit(1)  # alle Fonds fehlgeschlagen -> Workflow-Run als fehlgeschlagen markieren


if __name__ == "__main__":
    main()
