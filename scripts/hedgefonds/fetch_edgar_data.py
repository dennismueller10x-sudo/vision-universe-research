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
import csv
import io
import json
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from pathlib import Path

USER_AGENT = "VisionUniverseResearch info@visionuniverse.de"
OUTPUT_PATH = Path(__file__).resolve().parents[2] / "hedgefonds" / "data" / "hedgefonds.json"
TOP_HOLDINGS_STORE = 150
TOP_TRADES_STORE = 40
REQUEST_DELAY = 0.3  # SEC allows ~10 req/sec; we stay far under that
MAX_RETRIES = 3
BULK_TOP_N = 100  # Ziel-Gesamtzahl an Fonds inkl. der kuratierten 8
BULK_VALUE_TOLERANCE = 0.15  # Toleranz für die empirische Werte-Kalibrierung (siehe unten)


# founder / currentLead / managerLabel / photoUrl / photoCredit sind statische,
# redaktionelle Angaben (keine SEC-Daten) — verifiziert per Web-Recherche am
# 2026-09-04, da sich Fonds-Führung schnell ändert (siehe z.B. Bridgewater:
# Dalio verkaufte seinen letzten Anteil erst im Aug. 2025).
#
# photoUrl ist nur für Personen gesetzt, für die ein frei lizenziertes Foto
# auf Wikimedia Commons verifiziert werden konnte (CC BY / CC BY-SA); die
# anderen bleiben None und fallen im Frontend auf einen Initialen-Avatar
# zurück — für die meisten Hedgefonds-Manager (anders als z.B. Politiker)
# gibt es schlicht kein frei lizenziertes Pressefoto. CC BY(-SA) verlangt
# Namensnennung, daher photoCredit + Link zur Commons-Dateiseite bei jedem
# gesetzten Foto. Direkter Abruf von commons.wikimedia.org war aus dieser
# Sandbox blockiert; Lizenzangaben stammen aus Suchergebnis-Snippets, nicht
# aus einem direkten Seitenabruf — vor Veröffentlichung stichprobenartig auf
# commons.wikimedia.org gegenprüfen.
FUND_META = [
    {"cik": "0001423053", "abbr": "CITADEL", "name": "Citadel Advisors LLC", "type": "Multi-Strategy",
     "founder": "Ken Griffin", "currentLead": None,
     "photoUrl": "https://commons.wikimedia.org/wiki/Special:FilePath/Kenneth_C._Griffin_photo.jpg",
     "photoCredit": "Wikimedia Commons, CC BY-SA 4.0",
     "photoSourceUrl": "https://commons.wikimedia.org/wiki/File:Kenneth_C._Griffin_photo.jpg"},
    {"cik": "0001009207", "abbr": "DESHAW", "name": "D. E. Shaw & Co., Inc.", "type": "Quantitativ",
     "founder": "David E. Shaw", "currentLead": "Executive Committee (D. Shaw seit 2002 primär bei D. E. Shaw Research)", "photoUrl": None},
    {"cik": "0001179392", "abbr": "TWOSIG", "name": "Two Sigma Investments, LP", "type": "Quantitativ",
     "founder": "John Overdeck & David Siegel", "currentLead": "Führung seit 2024 mehrfach verändert (zuletzt Co-CEO-Rücktritt, Apr. 2026)", "photoUrl": None},
    {"cik": "0001273087", "abbr": "MILLENM", "name": "Millennium Management LLC", "type": "Multi-Strategy",
     "founder": "Israel Englander", "currentLead": None, "photoUrl": None},
    {"cik": "0001637460", "abbr": "MGROUP", "name": "Man Group plc", "type": "Quantitativ",
     "founder": "Robyn Grew", "managerLabel": "CEO", "currentLead": None, "photoUrl": None},
    {"cik": "0001350694", "abbr": "BRDGWTR", "name": "Bridgewater Associates, LP", "type": "Macro",
     "founder": "Ray Dalio", "currentLead": "Seit Aug. 2025 nicht mehr operativ beteiligt; geführt von Co-CIOs Karniol-Tambour, Prince, Jensen",
     "photoUrl": "https://commons.wikimedia.org/wiki/Special:FilePath/Ray_Dalio_Sept_23_2017_NYC.jpg",
     "photoCredit": "Wikimedia Commons, CC BY 3.0",
     "photoSourceUrl": "https://commons.wikimedia.org/wiki/File:Ray_Dalio_Sept_23_2017_NYC.jpg"},
    {"cik": "0001037389", "abbr": "RENTEC", "name": "Renaissance Technologies LLC", "type": "Quantitativ",
     "founder": "Jim Simons (†2024)", "currentLead": "Peter Brown (CEO)",
     "photoUrl": "https://commons.wikimedia.org/wiki/Special:FilePath/James_Simons_2007.jpg",
     "photoCredit": "Oberwolfach Photo Collection / Wikimedia Commons, CC BY-SA 2.0 DE",
     "photoSourceUrl": "https://commons.wikimedia.org/wiki/File:James_Simons_2007.jpg"},
    {"cik": "0001603466", "abbr": "PT72", "name": "Point72 Asset Management, L.P.", "type": "Long/Short",
     "founder": "Steven A. Cohen", "currentLead": None, "photoUrl": None},
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
            # SEC's 13F XML technical spec was updated in 2023: <value> is now
            # reported in whole USD, not thousands as in the pre-2023 spec (this
            # dashboard only ever fetches the current and prior quarter, so it
            # will never hit an old-format filing). Confirmed against a real
            # GitHub Actions run: without this, every fund's AUM came back
            # inflated by exactly 1000x (e.g. D.E. Shaw as $210T instead of
            # a plausible $210B).
            value_usd = float(find_child_text(el, "value") or 0)
        except ValueError:
            value_usd = 0.0
        shares = 0.0
        for child in el:
            if local_name(child.tag) == "shrsOrPrnAmt":
                try:
                    shares = float(find_child_text(child, "sshPrnamt") or 0)
                except ValueError:
                    shares = 0.0
        holdings.append({
            "issuer": issuer, "cls": cls, "cusip": cusip,
            "valueUSD": value_usd, "shares": shares,
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


def quarter_from_date(iso_date):
    y, m, _ = iso_date.split("-")
    q = (int(m) - 1) // 3 + 1
    return int(y), q


def previous_quarter(year_quarter):
    y, q = year_quarter
    return (y - 1, 4) if q == 1 else (y, q - 1)


def bulk_zip_url(year, quarter):
    return f"https://www.sec.gov/files/structureddata/data/form-13f-data-sets/{year}q{quarter}_form13f.zip"


def download_bulk_zip(year, quarter):
    time.sleep(REQUEST_DELAY)
    data = http_get(bulk_zip_url(year, quarter))
    return zipfile.ZipFile(io.BytesIO(data))


# Die exakten Spaltennamen der SEC-Bulk-13F-Datensätze konnten aus dieser
# Sandbox nicht direkt verifiziert werden (sec.gov-Zugriff blockiert; nur
# Suchergebnis-Snippets verfügbar). Daher hier bewusst KEINE feste
# Spaltenreihenfolge, sondern Header-basiertes Nachschlagen mit mehreren
# plausiblen Namensvarianten — bricht der echte Header ab, wird das unten
# in parse_bulk_quarter() klar geloggt und die Bulk-Erweiterung übersprungen
# (die 8 kuratierten Fonds bleiben davon unberührt).
BULK_COLUMNS = {
    "accession": ["ACCESSION_NUMBER", "ACCESSIONNUMBER"],
    "cik": ["CIK", "FILER_CIK", "FILERCIK"],
    "filing_date": ["FILING_DATE", "FILINGDATE"],
    "report_period": ["PERIODOFREPORT", "PERIOD_OF_REPORT"],
    "submission_type": ["SUBMISSIONTYPE", "SUBMISSION_TYPE"],
    "filer_name": ["FILINGMANAGER_NAME", "FILINGMANAGERNAME", "NAME"],
    "name_of_issuer": ["NAMEOFISSUER", "NAME_OF_ISSUER"],
    "cusip": ["CUSIP"],
    "value": ["VALUE"],
    "title_of_class": ["TITLEOFCLASS", "TITLE_OF_CLASS"],
    "shares": ["SSHPRNAMT", "SSH_PRNAMT"],
}


def find_column(fieldnames, candidates):
    norm = {(f or "").strip().upper(): f for f in fieldnames}
    for cand in candidates:
        if cand in norm:
            return norm[cand]
    return None


def open_tsv_from_zip(zf, filename):
    names = {n.upper(): n for n in zf.namelist()}
    real_name = names.get(filename.upper())
    if not real_name:
        return None
    return io.TextIOWrapper(zf.open(real_name), encoding="utf-8", errors="replace")


def parse_bulk_quarter(zf):
    """Liefert dict cik10 -> {name, accession, filingDate, reportDate, holdings:[...]}
    für alle 13F-HR/-A-Filer eines Quartals aus dem offiziellen SEC-Bulk-Datensatz."""
    sub_f = open_tsv_from_zip(zf, "SUBMISSION.tsv")
    info_f = open_tsv_from_zip(zf, "INFOTABLE.tsv")
    if not sub_f or not info_f:
        raise RuntimeError(f"SUBMISSION.tsv/INFOTABLE.tsv nicht im ZIP gefunden (vorhanden: {zf.namelist()})")

    sub_reader = csv.DictReader(sub_f, delimiter="\t")
    fn = sub_reader.fieldnames or []
    col_acc = find_column(fn, BULK_COLUMNS["accession"])
    col_cik = find_column(fn, BULK_COLUMNS["cik"])
    col_filed = find_column(fn, BULK_COLUMNS["filing_date"])
    col_period = find_column(fn, BULK_COLUMNS["report_period"])
    col_subtype = find_column(fn, BULK_COLUMNS["submission_type"])
    col_filername = find_column(fn, BULK_COLUMNS["filer_name"])
    missing = [n for n, v in [("accession", col_acc), ("cik", col_cik), ("filing_date", col_filed),
                               ("report_period", col_period), ("submission_type", col_subtype)] if not v]
    if missing:
        raise RuntimeError(f"SUBMISSION.tsv: Spalten fehlen {missing}. Vorhanden: {fn}")

    by_period = {}  # (cik10, period) -> meta
    for row in sub_reader:
        subtype = (row.get(col_subtype) or "").strip().upper()
        if subtype not in ("13F-HR", "13F-HR/A"):
            continue
        cik_raw = (row.get(col_cik) or "").strip().lstrip("0")
        cik10 = (cik_raw or "0").zfill(10)
        acc = (row.get(col_acc) or "").strip()
        filed = (row.get(col_filed) or "").strip()
        period = (row.get(col_period) or "").strip()
        name = (row.get(col_filername) or "").strip() if col_filername else ""
        key = (cik10, period)
        if key not in by_period or filed > by_period[key]["filingDate"]:
            by_period[key] = {"cik": cik10, "accession": acc, "filingDate": filed, "reportDate": period, "name": name}

    accepted_accessions = {v["accession"] for v in by_period.values()}

    info_reader = csv.DictReader(info_f, delimiter="\t")
    ifn = info_reader.fieldnames or []
    icol_acc = find_column(ifn, BULK_COLUMNS["accession"])
    icol_issuer = find_column(ifn, BULK_COLUMNS["name_of_issuer"])
    icol_cusip = find_column(ifn, BULK_COLUMNS["cusip"])
    icol_value = find_column(ifn, BULK_COLUMNS["value"])
    icol_class = find_column(ifn, BULK_COLUMNS["title_of_class"])
    icol_shares = find_column(ifn, BULK_COLUMNS["shares"])
    imissing = [n for n, v in [("accession", icol_acc), ("issuer", icol_issuer),
                                ("cusip", icol_cusip), ("value", icol_value)] if not v]
    if imissing:
        raise RuntimeError(f"INFOTABLE.tsv: Spalten fehlen {imissing}. Vorhanden: {ifn}")

    holdings_by_acc = {}
    for row in info_reader:
        acc = (row.get(icol_acc) or "").strip()
        if acc not in accepted_accessions:
            continue
        try:
            value_raw = float((row.get(icol_value) or "0").replace(",", "") or 0)
        except ValueError:
            value_raw = 0.0
        try:
            shares = float((row.get(icol_shares) or "0").replace(",", "") or 0) if icol_shares else 0.0
        except ValueError:
            shares = 0.0
        holdings_by_acc.setdefault(acc, []).append({
            "issuer": (row.get(icol_issuer) or "").strip(),
            "cusip": (row.get(icol_cusip) or "").strip(),
            "cls": (row.get(icol_class) or "").strip() if icol_class else "",
            "valueUSD": value_raw,  # noch unkalibriert, siehe calibrate_bulk_scale()
            "shares": shares,
        })

    result = {}
    for (cik10, _period), meta in by_period.items():
        holdings = holdings_by_acc.get(meta["accession"], [])
        if not holdings:
            continue
        # bei mehreren Perioden je CIK im selben Datensatz die neueste behalten
        if cik10 in result and result[cik10]["reportDate"] > meta["reportDate"]:
            continue
        result[cik10] = {
            "name": meta["name"], "accession": meta["accession"],
            "filingDate": meta["filingDate"], "reportDate": meta["reportDate"],
            "holdings": holdings,
        }
    return result


def calibrate_bulk_scale(bulk_quarter, curated_records):
    """Bestimmt EMPIRISCH (nicht aus Doku, die für die einzelnen XML-Filings
    nachweislich veraltet war — siehe Value-Bug weiter oben) den Skalierungs-
    faktor der Bulk-VALUE-Spalte, indem die Summenwerte der kuratierten,
    bereits individuell verifizierten Fonds mit den Bulk-Werten derselben
    CIKs verglichen werden."""
    ratios = []
    for rec in curated_records:
        bulk_fund = bulk_quarter.get(rec["cik"])
        if not bulk_fund:
            continue
        bulk_total = sum(h["valueUSD"] for h in bulk_fund["holdings"])
        if bulk_total > 0:
            ratios.append(rec["totalValueUSD"] / bulk_total)
    if not ratios:
        return None, 0
    avg_ratio = sum(ratios) / len(ratios)
    for candidate in (1, 1000):
        if abs(avg_ratio - candidate) / candidate < BULK_VALUE_TOLERANCE:
            return candidate, len(ratios)
    return None, len(ratios)


def abbr_from_name(name):
    words = [w for w in (name or "").replace(",", "").replace(".", "").split()
             if w.upper() not in ("LLC", "LP", "INC", "CO", "GROUP", "CAPITAL", "MANAGEMENT", "ADVISORS", "THE", "&")]
    return "".join(w[0] for w in words[:4]).upper() or (name or "")[:6].upper()


def fetch_bulk_expansion(curated_records, target_total):
    if not curated_records:
        print("Bulk-Erweiterung übersprungen: keine kuratierten Fonds als Kalibrierungs-Basis.", file=sys.stderr)
        return []
    cur_period = quarter_from_date(curated_records[0]["reportDate"])
    prev_period = previous_quarter(cur_period)

    print(f"Bulk-Erweiterung: lade SEC-Sammeldatensatz {cur_period[0]}Q{cur_period[1]}...", file=sys.stderr)
    try:
        cur_zip = download_bulk_zip(*cur_period)
        cur_data = parse_bulk_quarter(cur_zip)
    except Exception as exc:  # noqa: BLE001
        print(f"Bulk-Erweiterung übersprungen (aktuelles Quartal nicht ladbar/parsebar): {exc}", file=sys.stderr)
        return []

    scale, calib_n = calibrate_bulk_scale(cur_data, curated_records)
    if scale is None:
        print(f"Bulk-Erweiterung übersprungen: Werte-Kalibrierung nicht eindeutig "
              f"({calib_n} Vergleichsfonds gefunden). Format weicht evtl. ab.", file=sys.stderr)
        return []
    print(f"Bulk-Werte-Skalierungsfaktor kalibriert: x{scale} (anhand {calib_n} bekannter Fonds)", file=sys.stderr)

    prev_data = {}
    try:
        prev_zip = download_bulk_zip(*prev_period)
        prev_data = parse_bulk_quarter(prev_zip)
    except Exception as exc:  # noqa: BLE001
        print(f"Vorquartals-Bulk-Daten nicht verfügbar, QoQ-Vergleich für Bulk-Fonds entfällt: {exc}", file=sys.stderr)

    curated_ciks = {r["cik"] for r in curated_records}
    ranked = sorted(
        ((cik, f) for cik, f in cur_data.items() if cik not in curated_ciks),
        key=lambda t: -sum(h["valueUSD"] for h in t[1]["holdings"])
    )
    need = max(0, target_total - len(curated_records))
    selected = ranked[:need]

    extra = []
    for cik, f in selected:
        holdings = sorted(f["holdings"], key=lambda h: -h["valueUSD"])
        total_value = sum(h["valueUSD"] for h in holdings) * scale
        position_count = len(holdings)
        top_holdings = [
            {"issuer": h["issuer"], "cls": h["cls"], "cusip": h["cusip"],
             "valueUSD": h["valueUSD"] * scale, "shares": h["shares"],
             "weightPct": (h["valueUSD"] / sum(x["valueUSD"] for x in holdings) * 100) if holdings else 0}
            for h in holdings[:TOP_HOLDINGS_STORE]
        ]

        record = {
            "cik": cik, "name": f["name"] or cik, "type": "Sonstige", "abbr": abbr_from_name(f["name"]),
            "founder": None, "currentLead": None, "managerLabel": None,
            "photoUrl": None, "photoCredit": None, "photoSourceUrl": None,
            "reportDate": f["reportDate"], "filedDate": f["filingDate"], "accession": f["accession"],
            "totalValueUSD": total_value, "positionCount": position_count, "topHoldings": top_holdings,
            "prevReportDate": None, "prevTotalValueUSD": None, "prevPositionCount": None, "aumChangePct": None,
            "newPositions": [], "closedPositions": [], "newCount": 0, "closedCount": 0,
            "error": None, "source": "bulk",
        }

        prev_fund = prev_data.get(cik)
        if prev_fund:
            prev_holdings = prev_fund["holdings"]
            prev_total = sum(h["valueUSD"] for h in prev_holdings) * scale
            opened, closed = diff_holdings(
                [{**h, "valueUSD": h["valueUSD"] * scale} for h in holdings],
                [{**h, "valueUSD": h["valueUSD"] * scale} for h in prev_holdings],
            )
            record["prevReportDate"] = prev_fund["reportDate"]
            record["prevTotalValueUSD"] = prev_total
            record["prevPositionCount"] = len(prev_holdings)
            record["aumChangePct"] = ((total_value - prev_total) / prev_total * 100) if prev_total else None
            record["newPositions"] = opened[:TOP_TRADES_STORE]
            record["closedPositions"] = closed[:TOP_TRADES_STORE]
            record["newCount"] = len(opened)
            record["closedCount"] = len(closed)

        extra.append(record)

    return extra


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
        "founder": meta.get("founder"), "currentLead": meta.get("currentLead"),
        "managerLabel": meta.get("managerLabel"), "photoUrl": meta.get("photoUrl"),
        "photoCredit": meta.get("photoCredit"), "photoSourceUrl": meta.get("photoSourceUrl"),
        "reportDate": current["reportDate"], "filedDate": current["filedDate"], "accession": current["accession"],
        "totalValueUSD": total_value, "positionCount": position_count, "topHoldings": top_holdings,
        "prevReportDate": prev["reportDate"] if prev else None,
        "prevTotalValueUSD": None, "prevPositionCount": None, "aumChangePct": None,
        "newPositions": [], "closedPositions": [], "newCount": 0, "closedCount": 0,
        "error": None, "source": "individual",
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
                "founder": meta.get("founder"), "currentLead": meta.get("currentLead"),
                "managerLabel": meta.get("managerLabel"), "photoUrl": meta.get("photoUrl"),
                "photoCredit": meta.get("photoCredit"), "photoSourceUrl": meta.get("photoSourceUrl"),
                "error": str(exc),
            })
        time.sleep(REQUEST_DELAY)

    curated_ok = [f for f in funds if not f.get("error")]
    try:
        extra = fetch_bulk_expansion(curated_ok, target_total=BULK_TOP_N)
        funds.extend(extra)
        print(f"Bulk-Erweiterung: {len(extra)} zusätzliche Fonds ergänzt "
              f"({len(funds)} gesamt, Ziel: Top {BULK_TOP_N}).", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001 - die kuratierten Fonds dürfen dadurch nicht gefährdet werden
        print(f"Bulk-Erweiterung fehlgeschlagen, kuratierte Fonds bleiben unberührt: {exc}", file=sys.stderr)

    output = {"generatedAt": datetime.now(timezone.utc).isoformat(), "funds": funds}
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Geschrieben: {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size} bytes)", file=sys.stderr)

    if all(f.get("error") for f in funds):
        sys.exit(1)  # alle Fonds fehlgeschlagen -> Workflow-Run als fehlgeschlagen markieren


if __name__ == "__main__":
    main()
