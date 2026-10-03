#!/usr/bin/env python3
"""Hedgefonds-Daten (SEC-13F) für /hedgefonds/ erzeugen.

Läuft serverseitig in GitHub Actions, nicht im Browser des Besuchers:
CORS gilt nur im Browser, und die SEC verlangt einen User-Agent mit
Kontaktadresse, den Browser-JavaScript nicht setzen darf.

Ablauf
  1. SEC-Sammeldatensatz (Form-13F-Data-Sets) des jüngsten veröffentlichten
     Quartals laden. Er dient zur CIK-Prüfung der kuratierten Fonds und für
     die Liste "Weitere Institutionen".
  2. Für jeden kuratierten Fonds (fund_meta.py) die zwei jüngsten
     13F-HR-Perioden einzeln von EDGAR holen, Zeilen je CUSIP und
     Put/Call zusammenfassen (ein Filer meldet eine Aktie oft mehrfach,
     einmal je Untermanager) und daraus die Trades ableiten:
        neu / aufgestockt / reduziert / verkauft
     13F kennt kein Transaktionsprotokoll; der Vergleich der Stückzahlen
     zweier Quartale ist die übliche Konvention aller 13F-Tracker.
  3. Portfoliowert der letzten acht Quartale aus dem Deckblatt
     (primary_doc.xml, tableValueTotal) für den Verlauf.
  4. Porträts der Manager aus Wikipedia/Wikimedia Commons, nur frei
     lizenzierte Commons-Dateien, lokal gespeichert (keine Drittanbieter-
     Anfrage beim Besucher) und mit Urheber/Lizenz.
  5. CUSIP -> Ticker über OpenFIGI (zwischengespeichert), damit Positionen
     mit Logo und Link auf die Discover-Aktienseite erscheinen.
  6. Übergreifende Auswertungen der Star-Investoren: meistgehaltene Aktien,
     größte Käufe, größte Verkäufe.

Ausgabe
  hedgefonds/data/hedgefonds.json      Übersicht aller Fonds + Auswertungen
  hedgefonds/data/funds/<slug>.json    Detail je Fonds (lädt bei Bedarf)
  hedgefonds/data/cusip-map.json       Cache CUSIP -> Ticker
  hedgefonds/data/manager-photos.json  Cache Porträts (Lizenz, Urheber)
  hedgefonds/img/managers/<slug>.jpg   Porträts
"""
import calendar
import csv
import html
import io
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fund_meta import FUND_META  # noqa: E402

USER_AGENT = "VisionUniverseResearch info@visionuniverse.de"
ROOT = Path(__file__).resolve().parents[2]
HF_DIR = ROOT / "hedgefonds"
DATA_DIR = HF_DIR / "data"
OUTPUT_PATH = DATA_DIR / "hedgefonds.json"
FUND_DIR = DATA_DIR / "funds"
CUSIP_MAP_PATH = DATA_DIR / "cusip-map.json"
PHOTO_MANIFEST_PATH = DATA_DIR / "manager-photos.json"
PHOTO_DIR = HF_DIR / "img" / "managers"
DISCOVER_STOCKS = ROOT / "discover" / "data" / "stocks" / "US_REAL"
DISCOVER_LOGOS = ROOT / "discover" / "logos" / "files"

SCHEMA = "hedgefonds-2.0.0"
DETAIL_HOLDINGS = 150        # Positionen je Fonds in der Detaildatei
DETAIL_TRADES = 40           # je Trade-Art in der Detaildatei
INDEX_TOP = 10               # Top-Positionen je Fonds in der Übersicht
HISTORY_QUARTERS = 8
BULK_EXTRA = 40              # "Weitere Institutionen"
BULK_DETAIL_HOLDINGS = 100
REQUEST_DELAY = 0.15         # SEC erlaubt ~10 Anfragen/s
MAX_RETRIES = 3
BULK_VALUE_TOLERANCE = 0.15
UNCHANGED_PCT = 0.5          # Stückzahländerung darunter gilt als unverändert
UNIVERSE_PATH = DATA_DIR / "universe.json"
CACHE_VERSION = 6            # erhöhen, wenn sich die Berechnung ändert -> alles neu laden
# Weitere Hedgefonds ("zweite und dritte Reihe") aus dem Sammeldatensatz
TIER2_MAX = 1000             # höchstens so viele zusätzliche Hedgefonds
TIER2_OTHER_MAX = 150        # dazu die größten Long-only-Vermögensverwalter (eigene Kategorie)
TIER2_MIN_AUM = 200e6        # Mindestgröße des 13F-Portfolios
TIER2_MAX_ETF_SHARE = 0.35   # mehr ETF-Anteil = Vermögensberater, kein Hedgefonds
TIER2_DETAIL_HOLDINGS = 50
TIER2_DETAIL_TRADES = 15
TIER2_WORKERS = 6
TIER2_TIME_BUDGET = 55 * 60  # Sekunden; danach nur noch Cache, Rest im nächsten Lauf
DACH_MIN_AUM = 50e6
DACH_COUNTRIES = {"2M": "DE", "C4": "AT", "V8": "CH"}  # EDGAR-Ländercodes
SEC_MIN_INTERVAL = 0.115     # global ~8,7 Anfragen/s (SEC-Grenze: 10/s)
AGG_FUNDS_LISTED = 15        # Fonds je Aktie in den Auswertungen
TIER2_MAX_SIZE_POSITIONS = (80e9, 1000)  # größer UND breiter = Index-/Fondsgesellschaft
# Stile, deren Portfolios aus tausenden, algorithmisch gehandelten Positionen
# bestehen. Sie bleiben einzeln sichtbar, verzerren aber die übergreifenden
# Auswertungen ("was kaufen die Star-Investoren"), daher dort ausgenommen.
AGG_EXCLUDED_STYLES = {"Quant", "Multi-Strategy"}
AGG_MAX_POSITIONS = 800      # breit gestreute Fonds (z.B. Gotham, Tudor) ebenso

# Für die Kompatibilität der bestehenden CI-Tests
TOP_HOLDINGS_STORE = DETAIL_HOLDINGS
TOP_TRADES_STORE = DETAIL_TRADES


# ----------------------------------------------------------------- HTTP
def http_get(url, headers=None, data=None, timeout=60):
    h = {"User-Agent": USER_AGENT, "Accept-Encoding": "identity"}
    h.update(headers or {})
    req = urllib.request.Request(url, headers=h, data=data)
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            last_err = exc
            if exc.code == 404:
                break
            if exc.code == 429:
                time.sleep(20 * (attempt + 1))
                continue
            time.sleep(1.5 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last_err = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Abruf fehlgeschlagen: {url} ({last_err})")


def http_get_json(url, **kw):
    return json.loads(http_get(url, **kw))


_RATE_LOCK = threading.Lock()
_RATE_LAST = [0.0]


def sec_get(url):
    """Thread-sicher gedrosselt: insgesamt höchstens ~8,7 Anfragen/s."""
    with _RATE_LOCK:
        wait = _RATE_LAST[0] + SEC_MIN_INTERVAL - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _RATE_LAST[0] = time.monotonic()
    return http_get(url)


def sec_get_json(url):
    return json.loads(sec_get(url))


# ------------------------------------------------------------- XML-Helfer
def local_name(tag):
    return tag.split("}", 1)[1] if "}" in tag else tag


def find_child_text(el, name):
    for child in el.iter():
        if local_name(child.tag) == name:
            return (child.text or "").strip()
    return ""


def to_float(raw):
    try:
        return float(str(raw or "0").replace(",", "").strip() or 0)
    except ValueError:
        return 0.0


# --------------------------------------------------------- 13F-Perioden
def find_recent_13fs(filings_recent, n=2):
    """Liefert die n zuletzt gemeldeten, DISTINKTEN 13F-HR-Berichtsperioden.
    Bei einer Änderung (13F-HR/A) zu einer bereits erfassten Periode wird die
    zuletzt eingereichte Version bevorzugt.

    Hinweis: Eine 13F-HR/A kann auch nur ergänzende Zeilen enthalten
    ("new holdings"-Amendment). Solche Ergänzungen sind selten und klein;
    für die Darstellung zählt das jüngste vollständige Filing der Periode,
    siehe pick_filing_for_period()."""
    forms = filings_recent.get("form", [])
    accs = filings_recent.get("accessionNumber", [])
    filed = filings_recent.get("filingDate", [])
    report = filings_recent.get("reportDate", [])
    by_period = {}
    for i, f in enumerate(forms):
        if f in ("13F-HR", "13F-HR/A"):
            rd = report[i]
            if not rd:
                continue
            if rd not in by_period or filed[i] > by_period[rd]["filedDate"]:
                by_period[rd] = {"form": f, "accession": accs[i], "filedDate": filed[i], "reportDate": rd}
    periods = sorted(by_period.keys(), reverse=True)
    return [by_period[p] for p in periods[:n]]


def all_13f_filings(filings_recent):
    """Alle 13F-HR(/A)-Einreichungen als Liste, neueste zuerst."""
    out = []
    forms = filings_recent.get("form", [])
    for i, f in enumerate(forms):
        if f in ("13F-HR", "13F-HR/A") and filings_recent["reportDate"][i]:
            out.append({"form": f, "accession": filings_recent["accessionNumber"][i],
                        "filedDate": filings_recent["filingDate"][i],
                        "reportDate": filings_recent["reportDate"][i]})
    out.sort(key=lambda x: (x["reportDate"], x["filedDate"]), reverse=True)
    return out


def merge_filings(a, b):
    """Zwei 'filings.recent'-artige Spaltenobjekte aneinanderhängen."""
    keys = ("form", "accessionNumber", "filingDate", "reportDate")
    return {k: list(a.get(k, [])) + list(b.get(k, [])) for k in keys}


def acc_no_dashes(acc):
    return acc.replace("-", "")


# ------------------------------------------------------- Info-Table-Parser
def parse_info_table_xml(xml_bytes):
    root = ET.fromstring(xml_bytes)
    holdings = []
    for el in root.iter():
        if local_name(el.tag) != "infoTable":
            continue
        issuer = find_child_text(el, "nameOfIssuer")
        if not issuer:
            continue
        # Seit der 13F-XML-Spezifikation von 2023 steht <value> in ganzen USD
        # (vorher in Tausend). Alle hier verarbeiteten Perioden sind neuer.
        value_usd = to_float(find_child_text(el, "value"))
        shares, share_type = 0.0, ""
        for child in el:
            if local_name(child.tag) == "shrsOrPrnAmt":
                shares = to_float(find_child_text(child, "sshPrnamt"))
                share_type = find_child_text(child, "sshPrnamtType").upper()
        put_call = find_child_text(el, "putCall").upper()
        holdings.append({
            "issuer": issuer, "cls": find_child_text(el, "titleOfClass"),
            "cusip": find_child_text(el, "cusip").upper(),
            "valueUSD": value_usd, "shares": shares,
            "shareType": share_type, "putCall": put_call if put_call in ("PUT", "CALL") else "",
        })
    return holdings


def parse_cover(xml_bytes):
    """Deckblatt (primary_doc.xml): tableValueTotal, tableEntryTotal und bei
    Änderungsmeldungen die Art (RESTATEMENT ersetzt, NEW HOLDINGS ergänzt)."""
    root = ET.fromstring(xml_bytes)
    out = {"value": None, "entries": None, "amendmentType": ""}
    for el in root.iter():
        n = local_name(el.tag)
        if n == "tableValueTotal":
            out["value"] = to_float(el.text)
        elif n == "tableEntryTotal":
            out["entries"] = int(to_float(el.text))
        elif n == "amendmentType":
            out["amendmentType"] = (el.text or "").strip().upper()
    return out


def parse_cover_totals(xml_bytes):
    c = parse_cover(xml_bytes)
    return c["value"], c["entries"]


THOUSANDS_FILERS = set()  # CIKs, deren Positionen nachweislich in Tausend USD gemeldet sind


def normalize_units(rows):
    """Korrigiert falsch skalierte <value>-Angaben einzelner Filer.

    Erkennung über den impliziten Stückpreis (Wert / Stückzahl) der
    Aktienpositionen, gewichtet nach Wert: Liegen mindestens 80 % des
    Aktienwerts bei einem Stückpreis
      unter 1 USD      -> Werte in Tausend gemeldet, x1000
                          (real beobachtet: Duquesne, Baupost)
      über 2.000 USD   -> Werte 1000-fach zu hoch gemeldet, /1000
                          (real beobachtet: Banque Cantonale Vaudoise)
    Die Gewichtung ist wichtig: SPAC- und Wandelanleihe-Fonds (Meteora,
    Tenor) halten viele Optionsscheine/Rechte unter 1 USD, die aber kaum
    Wert tragen – ein einfacher Median hätte sie fälschlich x1000 gerechnet.
    Besteht ein Portfolio fast nur aus Anleihen (PRN), wird Wert / Nennwert
    geprüft: Median über 50 -> /1000."""
    eq = [h for h in rows if h.get("shares") and not h.get("putCall")
          and h.get("shareType", "SH") in ("SH", "") and h["valueUSD"] > 0]
    eq_value = sum(h["valueUSD"] for h in eq)
    factor = 1
    if len(eq) >= 3 and eq_value > 0:
        low = sum(h["valueUSD"] for h in eq if h["valueUSD"] / h["shares"] < 1.0) / eq_value
        high = sum(h["valueUSD"] for h in eq if h["valueUSD"] / h["shares"] > 2000) / eq_value
        if low >= 0.8:
            factor = 1000
        elif high >= 0.8:
            factor = 0.001
    else:
        prn = sorted(h["valueUSD"] / h["shares"] for h in rows
                     if h.get("shares") and h.get("shareType") == "PRN" and h["valueUSD"] > 0)
        if prn and prn[len(prn) // 2] > 50:
            factor = 0.001
    if factor != 1:
        for h in rows:
            h["valueUSD"] *= factor
    return rows, factor


def filing_index(cik_int, accession):
    idx = sec_get_json(f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_no_dashes(accession)}/index.json")
    return [it["name"] for it in idx.get("directory", {}).get("item", [])]


def fetch_filing_holdings(cik_int, accession, names=None):
    names = names if names is not None else filing_index(cik_int, accession)
    candidates = [n for n in names if n.lower().endswith(".xml") and n.lower() != "primary_doc.xml"]
    if not candidates:
        candidates = [n for n in names if n.lower().endswith(".xml")]
    if not candidates:
        raise RuntimeError("Keine Info-Table-XML im Filing gefunden.")
    for fname in candidates:
        xml_bytes = sec_get(f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_no_dashes(accession)}/{fname}")
        holdings = parse_info_table_xml(xml_bytes)
        if holdings:
            holdings, factor = normalize_units(holdings)
            if factor == 1000:
                THOUSANDS_FILERS.add(str(cik_int))
            if factor != 1:
                print(f"  Werte falsch skaliert gemeldet ({accession}) – x{factor} korrigiert", file=sys.stderr)
            return holdings
    raise RuntimeError("Info-Table-XML konnte nicht geparst werden.")


def fetch_cover(cik_int, filing):
    names = filing_index(cik_int, filing["accession"])
    if "primary_doc.xml" not in names:
        return None, names
    cover = parse_cover(sec_get(
        f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_no_dashes(filing['accession'])}/primary_doc.xml"))
    if cover["value"] is not None and filing["filedDate"] < "2023-01-03":  # alte Spezifikation: Tausend USD
        cover["value"] *= 1000
    return cover, names


def period_filings(filings_13f, period):
    return sorted((f for f in filings_13f if f["reportDate"] == period), key=lambda f: f["filedDate"])


def is_restatement(filing, cover):
    return filing["form"] == "13F-HR" or "RESTATEMENT" in (cover or {}).get("amendmentType", "")


def fetch_period_positions(cik_int, filings_13f, period):
    """Positionen einer Periode inkl. Änderungsmeldungen: 13F-HR/A vom Typ
    RESTATEMENT ersetzen das Portfolio, NEW HOLDINGS ergänzen es (real
    beobachtet: Jana Q1 2026 – die jüngste Meldung enthielt nur eine
    nachgereichte Position). Liefert (Positionen, jüngstes Filing)."""
    rows, used = None, None
    for f in period_filings(filings_13f, period):
        cover = None
        if f["form"] != "13F-HR":
            cover, names = fetch_cover(cik_int, f)
        else:
            names = None
        try:
            new_rows = fetch_filing_holdings(cik_int, f["accession"], names)
        except RuntimeError as exc:
            print(f"  {f['form']} {f['accession']} ohne Positionen ({exc}) – übersprungen", file=sys.stderr)
            continue
        if rows is None or is_restatement(f, cover):
            rows = new_rows
        else:
            rows = rows + new_rows
            print(f"  {f['accession']}: Ergänzung ({(cover or {}).get('amendmentType') or 'NEW HOLDINGS'}) "
                  f"mit {len(new_rows)} Zeilen zusammengeführt", file=sys.stderr)
        used = f
    if rows is None:
        raise RuntimeError(f"Keine Positionen für {period}")
    return aggregate_positions(rows), used


def fetch_period_total(cik_int, filings_13f, period):
    """Portfoliowert einer Periode aus den Deckblättern (gleiche Regel)."""
    total = entries = None
    for f in period_filings(filings_13f, period):
        cover, _ = fetch_cover(cik_int, f)
        if not cover or cover["value"] is None:
            continue
        if total is None or is_restatement(f, cover):
            total, entries = cover["value"], cover["entries"]
        else:
            total += cover["value"]
            entries = (entries or 0) + (cover["entries"] or 0)
    if total is None:
        return None
    return {"period": period, "valueUSD": total, "positions": entries}


# ------------------------------------------------- Positionen & Trades
def position_key(h):
    return (h.get("cusip") or h.get("issuer", "").upper(), h.get("putCall", ""))


def aggregate_positions(rows):
    """Fasst Zeilen gleicher CUSIP + Put/Call zusammen (Untermanager,
    mehrere Verwahrstellen) und sortiert nach Wert."""
    agg = {}
    for h in rows:
        k = position_key(h)
        if k not in agg:
            agg[k] = {"issuer": h["issuer"], "cls": h.get("cls", ""), "cusip": h.get("cusip", ""),
                      "putCall": h.get("putCall", ""), "shareType": h.get("shareType", ""),
                      "valueUSD": 0.0, "shares": 0.0}
        agg[k]["valueUSD"] += h.get("valueUSD", 0.0)
        agg[k]["shares"] += h.get("shares", 0.0)
    return sorted(agg.values(), key=lambda h: -h["valueUSD"])


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


def compute_trades(current, previous):
    """Vergleicht zwei (bereits aggregierte) Quartale je Position.

    Liefert dict key -> trade mit status new/added/reduced/sold/unchanged,
    Stückzahländerung, Änderung in Prozent und dem geschätzten Volumen
    (Stückzahländerung x Quartalsendkurs; für Verkäufe der Vorquartalswert)."""
    cur = {position_key(h): h for h in current}
    prev = {position_key(h): h for h in previous}
    trades = {}
    for k in set(cur) | set(prev):
        c, p = cur.get(k), prev.get(k)
        base = c or p
        t = {"issuer": base["issuer"], "cls": base.get("cls", ""), "cusip": base.get("cusip", ""),
             "putCall": base.get("putCall", ""),
             "shares": c["shares"] if c else 0.0, "prevShares": p["shares"] if p else 0.0,
             "valueUSD": c["valueUSD"] if c else 0.0, "prevValueUSD": p["valueUSD"] if p else 0.0}
        if c and not p:
            t.update(status="new", deltaShares=c["shares"], deltaPct=None, estValueUSD=c["valueUSD"])
        elif p and not c:
            t.update(status="sold", deltaShares=-p["shares"], deltaPct=-100.0, estValueUSD=-p["valueUSD"])
        else:
            ds = c["shares"] - p["shares"]
            pct = (ds / p["shares"] * 100) if p["shares"] else None
            price = (c["valueUSD"] / c["shares"]) if c["shares"] else 0.0
            if pct is None or abs(pct) < UNCHANGED_PCT:
                status = "unchanged"
            else:
                status = "added" if ds > 0 else "reduced"
            t.update(status=status, deltaShares=ds, deltaPct=pct, estValueUSD=ds * price)
        trades[k] = t
    return trades


def trade_lists(trades, limit):
    by = {"new": [], "added": [], "reduced": [], "sold": []}
    for t in trades.values():
        if t["status"] in by:
            by[t["status"]].append(t)
    for k in by:
        by[k].sort(key=lambda t: -abs(t["estValueUSD"]))
    counts = {k: len(v) for k, v in by.items()}
    return {k: v[:limit] for k, v in by.items()}, counts


# ------------------------------------------------ SEC-Sammeldatensatz
_MONTH_ABBR = ["", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
_REPORT_MONTH_TO_DEADLINE_MONTH = {3: 5, 6: 8, 9: 11, 12: 2}


def bulk_window_for_report_period(report_date):
    """Berichtsdatum (Quartalsende) -> Fenster des SEC-Bulk-ZIPs, z.B.
    '2026-06-30' -> '01jun2026-31aug2026'. Das Fenster beginnt 2 Monate vor
    dem Meldefrist-Monat und endet an dessen letztem Tag."""
    y, m, _ = report_date.split("-")
    y, m = int(y), int(m)
    deadline_month = _REPORT_MONTH_TO_DEADLINE_MONTH.get(m)
    if deadline_month is None:
        raise ValueError(f"Unerwartetes Berichts-Quartalsende: {report_date}")
    deadline_year = y + 1 if (m == 12) else y
    start_month = deadline_month - 2
    start_year = deadline_year
    if start_month <= 0:
        start_month += 12
        start_year -= 1
    last_day = calendar.monthrange(deadline_year, deadline_month)[1]
    return f"01{_MONTH_ABBR[start_month]}{start_year}-{last_day:02d}{_MONTH_ABBR[deadline_month]}{deadline_year}"


def bulk_zip_url_for_period(report_date):
    window = bulk_window_for_report_period(report_date)
    return f"https://www.sec.gov/files/structureddata/data/form-13f-data-sets/{window}_form13f.zip"


def download_bulk_zip(report_date):
    time.sleep(REQUEST_DELAY)
    data = http_get(bulk_zip_url_for_period(report_date), timeout=300)
    return zipfile.ZipFile(io.BytesIO(data))


def previous_report_period(report_date):
    y, m, _ = report_date.split("-")
    y, m = int(y), int(m)
    prev_m, prev_y = m - 3, y
    if prev_m <= 0:
        prev_m += 12
        prev_y -= 1
    return f"{prev_y:04d}-{prev_m:02d}-{calendar.monthrange(prev_y, prev_m)[1]:02d}"


def latest_closed_report_period(today):
    """Jüngstes Quartalsende, dessen Bulk-Fenster (Meldefrist-Monat) bereits
    abgeschlossen ist."""
    q_end = f"{today.year:04d}-12-31"
    while True:
        y, m, _ = (int(x) for x in q_end.split("-"))
        dm = _REPORT_MONTH_TO_DEADLINE_MONTH[m]
        dy = y + 1 if m == 12 else y
        window_end = date(dy, dm, calendar.monthrange(dy, dm)[1])
        if window_end < today:
            return q_end
        q_end = previous_report_period(q_end)


BULK_COLUMNS = {
    "accession": ["ACCESSION_NUMBER", "ACCESSIONNUMBER"],
    "cik": ["CIK", "FILER_CIK", "FILERCIK"],
    "filing_date": ["FILING_DATE", "FILINGDATE"],
    "report_period": ["PERIODOFREPORT", "PERIOD_OF_REPORT"],
    "submission_type": ["SUBMISSIONTYPE", "SUBMISSION_TYPE"],
    "filer_name": ["FILINGMANAGER_NAME", "FILINGMANAGERNAME", "FILING_MANAGER_NAME", "NAME"],
    "name_of_issuer": ["NAMEOFISSUER", "NAME_OF_ISSUER"],
    "cusip": ["CUSIP"],
    "value": ["VALUE"],
    "title_of_class": ["TITLEOFCLASS", "TITLE_OF_CLASS"],
    "shares": ["SSHPRNAMT", "SSH_PRNAMT"],
    "put_call": ["PUTCALL", "PUT_CALL"],
    "country": ["FILINGMANAGER_STATEORCOUNTRY", "FILINGMANAGER_STATE_OR_COUNTRY", "STATEORCOUNTRY"],
    "city": ["FILINGMANAGER_CITY"],
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


_BULK_DATE_FORMATS = ["%Y-%m-%d", "%d-%b-%Y", "%Y%m%d", "%m/%d/%Y"]


def normalize_bulk_date(raw):
    """Bulk-Datum ('31-MAR-2026') -> ISO 'YYYY-MM-DD'; Rohwert bei Fehlschlag."""
    raw = (raw or "").strip()
    if not raw:
        return raw
    for fmt in _BULK_DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return raw


def parse_coverpage_meta(zf):
    """ACCESSION_NUMBER -> {name, country, city} aus COVERPAGE.tsv (best effort)."""
    cp_f = open_tsv_from_zip(zf, "COVERPAGE.tsv")
    if not cp_f:
        return {}
    reader = csv.DictReader(cp_f, delimiter="\t")
    fn = reader.fieldnames or []
    col_acc = find_column(fn, BULK_COLUMNS["accession"])
    col_name = find_column(fn, BULK_COLUMNS["filer_name"])
    col_country = find_column(fn, BULK_COLUMNS["country"])
    col_city = find_column(fn, BULK_COLUMNS["city"])
    if not col_acc or not col_name:
        return {}
    result = {}
    for row in reader:
        acc = (row.get(col_acc) or "").strip()
        name = (row.get(col_name) or "").strip()
        if acc and name:
            result[acc] = {"name": name,
                           "country": (row.get(col_country) or "").strip().upper() if col_country else "",
                           "city": (row.get(col_city) or "").strip() if col_city else ""}
    return result


def parse_coverpage_names(zf):
    return {acc: m["name"] for acc, m in parse_coverpage_meta(zf).items()}


def parse_bulk_quarter(zf):
    """dict cik10 -> {name, accession, filingDate, reportDate, holdings:[...]}
    für alle 13F-HR/-A-Filer eines Quartals aus dem SEC-Bulk-Datensatz."""
    sub_f = open_tsv_from_zip(zf, "SUBMISSION.tsv")
    info_f = open_tsv_from_zip(zf, "INFOTABLE.tsv")
    if not sub_f or not info_f:
        raise RuntimeError(f"SUBMISSION.tsv/INFOTABLE.tsv nicht im ZIP gefunden (vorhanden: {zf.namelist()})")
    coverpage = parse_coverpage_meta(zf)
    coverpage_names = {acc: m["name"] for acc, m in coverpage.items()}

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

    by_period = {}
    for row in sub_reader:
        subtype = (row.get(col_subtype) or "").strip().upper()
        if subtype not in ("13F-HR", "13F-HR/A"):
            continue
        cik10 = ((row.get(col_cik) or "").strip().lstrip("0") or "0").zfill(10)
        acc = (row.get(col_acc) or "").strip()
        filed = normalize_bulk_date(row.get(col_filed))
        period = normalize_bulk_date(row.get(col_period))
        name = coverpage_names.get(acc) or ((row.get(col_filername) or "").strip() if col_filername else "")
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
    icol_pc = find_column(ifn, BULK_COLUMNS["put_call"])
    imissing = [n for n, v in [("accession", icol_acc), ("issuer", icol_issuer),
                                ("cusip", icol_cusip), ("value", icol_value)] if not v]
    if imissing:
        raise RuntimeError(f"INFOTABLE.tsv: Spalten fehlen {imissing}. Vorhanden: {ifn}")

    holdings_by_acc = {}
    for row in info_reader:
        acc = (row.get(icol_acc) or "").strip()
        if acc not in accepted_accessions:
            continue
        pc = (row.get(icol_pc) or "").strip().upper() if icol_pc else ""
        holdings_by_acc.setdefault(acc, []).append({
            "issuer": (row.get(icol_issuer) or "").strip(),
            "cusip": (row.get(icol_cusip) or "").strip().upper(),
            "cls": (row.get(icol_class) or "").strip() if icol_class else "",
            "valueUSD": to_float(row.get(icol_value)),  # noch unkalibriert
            "shares": to_float(row.get(icol_shares)) if icol_shares else 0.0,
            "putCall": pc if pc in ("PUT", "CALL") else "",
        })

    result = {}
    for (cik10, _period), meta in by_period.items():
        holdings = holdings_by_acc.get(meta["accession"], [])
        if not holdings:
            continue
        if cik10 in result and result[cik10]["reportDate"] > meta["reportDate"]:
            continue
        cp = coverpage.get(meta["accession"], {})
        result[cik10] = {"name": meta["name"], "accession": meta["accession"],
                         "filingDate": meta["filingDate"], "reportDate": meta["reportDate"],
                         "country": cp.get("country", ""), "city": cp.get("city", ""),
                         "holdings": holdings}
    return result


def calibrate_bulk_scale(bulk_quarter, curated_records):
    """Skalierung der Bulk-VALUE-Spalte EMPIRISCH gegen die einzeln geladenen
    Fonds bestimmen (x1 oder x1000), statt der Doku zu trauen."""
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
    ratios.sort()
    median = ratios[len(ratios) // 2]
    for candidate in (1, 1000):
        if abs(median - candidate) / candidate < BULK_VALUE_TOLERANCE:
            return candidate, len(ratios)
    return None, len(ratios)


def abbr_from_name(name):
    words = [w for w in (name or "").replace(",", "").replace(".", "").split()
             if w.upper() not in ("LLC", "LP", "INC", "CO", "GROUP", "CAPITAL", "MANAGEMENT", "ADVISORS", "THE", "&")]
    return "".join(w[0] for w in words[:4]).upper() or (name or "")[:6].upper()


BULK_CATEGORY_PATTERNS = [
    ("Bank & Broker", ["MORGAN STANLEY", "BANK OF AMERICA", "GOLDMAN SACHS", "UBS GROUP", "UBS AG",
        "ROYAL BANK OF CANADA", "JPMORGAN", "JP MORGAN", "WELLS FARGO", "CITIGROUP",
        "DEUTSCHE BANK", "CREDIT SUISSE", "HSBC", "BARCLAYS", "BANK OF NEW YORK MELLON",
        "BNY MELLON", "NORTHERN TRUST", "CHARLES SCHWAB", "TORONTO-DOMINION",
        "BANK OF MONTREAL", "SCOTIABANK", "NOMURA", "MIZUHO", "SUMITOMO MITSUI",
        "MITSUBISHI UFJ", "SOCIETE GENERALE", "BNP PARIBAS", "CREDIT AGRICOLE", "SANTANDER", "BILBAO", "STANDARD CHARTERED",
        "RAYMOND JAMES", "STIFEL", "TRUIST", "U.S. BANCORP", "US BANCORP", "BANK"]),
    ("Marktmacher / Trading", ["SUSQUEHANNA", "JANE STREET", "CITADEL SECURITIES", "VIRTU FINANCIAL",
        "IMC CHICAGO", "IMC-CHICAGO", "OPTIVER", "DRW HOLDINGS", "FLOW TRADERS",
        "HUDSON RIVER TRADING", "JUMP TRADING", "TWO SIGMA SECURITIES", "WOLVERINE TRADING"]),
    ("Vermögensverwaltung", ["BLACKROCK", "VANGUARD", "STATE STREET", "GEODE CAPITAL", "FMR LLC",
        "FIDELITY", "CAPITAL WORLD INVESTORS", "CAPITAL RESEARCH", "CAPITAL GROUP",
        "WELLINGTON MANAGEMENT", "INVESCO", "T. ROWE PRICE", "T ROWE PRICE",
        "FRANKLIN RESOURCES", "FRANKLIN TEMPLETON", "PIMCO", "DIMENSIONAL FUND",
        "AMERICAN CENTURY", "LEGAL & GENERAL", "AMUNDI", "NORGES BANK",
        "ALLIANZ", "ALLIANCEBERNSTEIN", "PRUDENTIAL", "PRINCIPAL FINANCIAL",
        "NUVEEN", "JANUS HENDERSON", "NATIXIS", "MFS ", "PUTNAM INVESTMENT",
        "COLUMBIA MANAGEMENT", "VICTORY CAPITAL", "ARTISAN PARTNERS",
        "LORD ABBETT", "EATON VANCE", "NORTHERN TRUST INVESTMENTS", "SSGA", "BLACKSTONE",
        "DODGE & COX", "FIRST TRUST", "PRIMECAP", "JENNISON", "NEUBERGER", "SCHRODER", "FIL LTD", "RHUMBLINE",
        "NORDEA", "CLEARBRIDGE", "VOYA", "TD ASSET", "RUSSELL INVESTMENTS", "SEI INVESTMENTS", "BAILLIE GIFFORD",
        "ROBECO", "LOOMIS SAYLES", "ABERDEEN", "MIRAE", "1832 ASSET", "BOSTON PARTNERS", "FIRST EAGLE", "PARAMETRIC",
        "MACKENZIE", "CIBC", "MANULIFE", "SUN LIFE", "FEDERATED HERMES", "HARTFORD", "THRIVENT", "LAZARD",
        "AMERIPRISE", "COHEN & STEERS", "CALAMOS", "PGIM", "GUGGENHEIM", "UBS ASSET", "M&G", "KAYNE ANDERSON",
        "WILLIAM BLAIR", "HARDING LOEVNER", "BROWN ADVISORY", "MFS INVESTMENT", "COLUMBIA THREADNEEDLE", "PIONEER",
        "TIAA", "TEACHERS ADVISORS", "AMERICAN FUNDS", "DWS ", "AMUNDI", "AXA ", "CANDRIAM", "STATE FARM",
        "LEGG MASON", "ALLSPRING", "BMO ", "RBC ", "SCOTIA", "DESJARDINS", "MACQUARIE", "DAIWA", "NIKKO", "SUMITOMO",
        "ASSET MANAGEMENT ONE", "ORIX", "SAMSUNG", "KOREA INVESTMENT", "ETFS", "INDEX ", "EXCHANGE TRADED"]),
    ("Staatsfonds & Pension", ["PENSION", "SOVEREIGN", "GOVERNMENT OF", "MONETARY AUTHORITY", "CENTRAL BANK",
        "NATIONAL BANK", "CANADA PENSION", "ONTARIO TEACHERS", "CAISSE DE DEPOT", "BRITISH COLUMBIA INVESTMENT",
        "ALBERTA INVESTMENT", "PUBLIC SECTOR PENSION", "NORGES BANK", "TEMASEK", "GIC PRIVATE", "KUWAIT", "ABU DHABI",
        "QATAR", "SAUDI", "RETIREMENT SYSTEM", "TEACHERS", "EMPLOYEES"]),
    ("Versicherung", ["INSURANCE", "ASSURANCE", "REINSURANCE", "VERSICHERUNG", "LIFE CO", "MUTUAL LIFE"]),
]

CORPORATE_RE = re.compile(r"\b(INC|CORP|CORPORATION|PLC|SE|NV|N\.V\.)\.?(\s*/[A-Z]{2}/)?$")
HF_WORD_RE = re.compile(r"CAPITAL|PARTNERS|MANAGEMENT|ADVISORS|ADVISERS|INVESTMENT|FUND|ASSET|HOLDINGS|GROUP|LP\b|L\.P\.")
TRADING_RE = re.compile(r"\bTRADING\b|\bOPTIONS\b|MARKET MAKING|\bDERIVATIVES\b")


def classify_bulk_fund(name):
    n = (name or "").upper()
    for category, patterns in BULK_CATEGORY_PATTERNS:
        for p in patterns:
            if p in n:
                return category
    if TRADING_RE.search(n):
        return "Marktmacher / Trading"
    if "BANQUE" in n or "KANTONALBANK" in n or "CANTONALE" in n:
        return "Bank & Broker"
    if CORPORATE_RE.search(n.strip()) and not HF_WORD_RE.search(n):
        return "Unternehmen"
    return "Sonstige"


def load_latest_bulk(today):
    """Lädt den jüngsten veröffentlichten Bulk-Datensatz (max. 2 Versuche)."""
    period = latest_closed_report_period(today)
    for candidate in (period, previous_report_period(period)):
        print(f"Bulk: lade {bulk_zip_url_for_period(candidate)}", file=sys.stderr)
        try:
            data = parse_bulk_quarter(download_bulk_zip(candidate))
            print(f"  OK: {len(data)} Filer", file=sys.stderr)
            return candidate, data
        except Exception as exc:  # noqa: BLE001
            print(f"  nicht ladbar: {exc}", file=sys.stderr)
    return None, {}


# ------------------------------------------------------ CIK-Auflösung
def bulk_candidates(bulk, match):
    out = []
    for cik, f in bulk.items():
        if match in (f.get("name") or "").upper():
            out.append((sum(h["valueUSD"] for h in f["holdings"]), cik, f["name"]))
    out.sort(reverse=True)
    return out


def load_submissions(cik, need=HISTORY_QUARTERS):
    sub = sec_get_json(f"https://data.sec.gov/submissions/CIK{cik}.json")
    filings = sub.get("filings", {}).get("recent", {})
    if len(find_recent_13fs(filings, need)) < need:
        for extra in sub.get("filings", {}).get("files", [])[:1]:
            try:
                older = sec_get_json(f"https://data.sec.gov/submissions/{extra['name']}")
                filings = merge_filings(filings, older)
            except Exception as exc:  # noqa: BLE001
                print(f"  ältere Filings nicht ladbar: {exc}", file=sys.stderr)
    return sub, filings


def latest_13f_period(filings):
    p = find_recent_13fs(filings, 1)
    return p[0]["reportDate"] if p else ""


def resolve_fund(meta, bulk, bulk_period=None, exclude=()):
    """Liefert (cik, submissions, filings) – geprüft gegen meta['match'].

    Meldet die hinterlegte CIK nicht mehr (jüngstes 13F älter als der
    Sammeldatensatz), wird nach einer neueren Meldestelle mit passendem
    Namen gesucht (match oder altMatch). Fonds wechseln gelegentlich die
    meldende Gesellschaft, z.B. Greenlight Capital -> DME Capital Management."""
    patterns = [meta["match"]] + list(meta.get("altMatch") or [])
    tried = list(exclude)
    fallback = None
    if meta.get("cik"):
        try:
            sub, filings = load_submissions(meta["cik"])
            name = (sub.get("name") or "").upper()
            if any(p in name for p in patterns):
                latest = latest_13f_period(filings)
                if not bulk_period or latest >= bulk_period:
                    return meta["cik"], sub, filings
                print(f"  CIK {meta['cik']} meldete zuletzt {latest} – suche neuere Meldestelle", file=sys.stderr)
                fallback = (meta["cik"], sub, filings)
            else:
                print(f"  WARNUNG: CIK {meta['cik']} gehört zu '{sub.get('name')}', erwartet {patterns}", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            print(f"  CIK {meta['cik']} nicht ladbar: {exc}", file=sys.stderr)
        tried.append(meta["cik"])
    for pattern in patterns:
        for _value, cik, name in bulk_candidates(bulk, pattern):
            if cik in tried:
                continue
            print(f"  Auflösung über Sammeldatensatz: {name} -> CIK {cik}", file=sys.stderr)
            sub, filings = load_submissions(cik)
            return cik, sub, filings
    if fallback:
        return fallback
    raise RuntimeError(f"Keine passende CIK für {patterns} gefunden")


def fts_newer_ciks(meta, min_period, exclude):
    """EDGAR-Volltextsuche nach 13F-HR-Meldungen mit dem Fondsnamen ab einer
    Periode. Liefert Kandidaten (cik, name, period) – für Fonds, deren
    hinterlegte Meldestelle das aktuelle Quartal (noch) nicht gemeldet hat."""
    out = []
    for pattern in [meta["match"]] + list(meta.get("altMatch") or []):
        q = urllib.parse.quote(f'"{pattern.title()}"')
        try:
            res = sec_get_json(f"https://efts.sec.gov/LATEST/search-index?q={q}&forms=13F-HR,13F-HR/A"
                               f"&dateRange=custom&startdt={min_period}&enddt={date.today().isoformat()}")
        except Exception as exc:  # noqa: BLE001
            print(f"  Volltextsuche nicht möglich: {exc}", file=sys.stderr)
            continue
        for hit in res.get("hits", {}).get("hits", [])[:40]:
            src = hit.get("_source", {})
            period = src.get("period_ending") or ""
            for cik, name in zip(src.get("ciks", []), src.get("display_names", [])):
                cik = str(cik).zfill(10)
                if pattern in name.upper() and cik not in exclude and period >= min_period:
                    out.append((cik, name, period))
    print(f"  Volltextsuche: {sorted(set(out))[:5] or 'keine neuere Meldung gefunden'}", file=sys.stderr)
    return sorted(set(out), key=lambda t: t[2], reverse=True)


# ------------------------------------------------------------- Fonds
def compact_position(h, total):
    return {"issuer": h["issuer"], "cls": h.get("cls", ""), "cusip": h.get("cusip", ""),
            "putCall": h.get("putCall", ""), "valueUSD": round(h["valueUSD"]),
            "shares": h["shares"], "weightPct": (h["valueUSD"] / total * 100) if total else 0.0}


def compact_trade(t):
    return {"issuer": t["issuer"], "cls": t.get("cls", ""), "cusip": t.get("cusip", ""), "putCall": t.get("putCall", ""),
            "status": t["status"], "shares": t["shares"], "prevShares": t["prevShares"],
            "deltaShares": t["deltaShares"], "deltaPct": t["deltaPct"],
            "valueUSD": round(t["valueUSD"]), "prevValueUSD": round(t["prevValueUSD"]),
            "estValueUSD": round(t["estValueUSD"])}


def build_fund_record(meta, cik, sub, filings, history_quarters=HISTORY_QUARTERS, category="Investoren"):
    cik_int = str(int(cik))
    filings_13f = all_13f_filings(filings)
    periods = find_recent_13fs(filings, history_quarters)
    if not periods:
        raise RuntimeError("Kein 13F-HR Filing gefunden.")
    current = periods[0]
    prev = periods[1] if len(periods) > 1 else None

    cur_pos, latest_filing = fetch_period_positions(cik_int, filings_13f, current["reportDate"])
    current = {**current, **latest_filing}
    total = sum(h["valueUSD"] for h in cur_pos)

    record = {
        "slug": meta["slug"], "cik": cik, "name": meta["name"],
        "secName": sub.get("name") or meta["name"],
        "manager": meta.get("manager"), "role": meta.get("role"), "style": meta.get("style"),
        "bio": meta.get("bio"), "note": meta.get("note"), "wiki": meta.get("wiki"),
        "category": category, "source": "individual", "region": meta.get("region"),
        "city": meta.get("city"), "cacheVersion": CACHE_VERSION,
        "reportDate": current["reportDate"], "filedDate": current["filedDate"],
        "accession": current["accession"], "form": current["form"],
        "totalValueUSD": round(total), "positionCount": len(cur_pos),
        "optionCount": sum(1 for h in cur_pos if h["putCall"]),
        "prevReportDate": prev["reportDate"] if prev else None,
        "prevTotalValueUSD": None, "prevPositionCount": None, "aumChangePct": None,
    }

    trades = {}
    if prev:
        prev_pos, _ = fetch_period_positions(cik_int, filings_13f, prev["reportDate"])
        prev_total = sum(h["valueUSD"] for h in prev_pos)
        record["prevTotalValueUSD"] = round(prev_total)
        record["prevPositionCount"] = len(prev_pos)
        record["aumChangePct"] = ((total - prev_total) / prev_total * 100) if prev_total else None
        if prev_total and total and not (1 / 200 < total / prev_total < 200):
            # unplausibler Sprung (Skalierungsfehler des Filers in einem Quartal)
            print(f"  {meta['name']}: Sprung {prev_total:.0f} -> {total:.0f} unplausibel, keine Veränderung angezeigt",
                  file=sys.stderr)
            record["aumChangePct"] = None
            record["jump"] = True
        trades = compute_trades(cur_pos, prev_pos)

    # Verlauf: Deckblatt-Summen älterer Perioden (aktuelle/vorige berechnet)
    history = [{"period": current["reportDate"], "valueUSD": round(total), "positions": len(cur_pos)}]
    if prev:
        history.append({"period": prev["reportDate"], "valueUSD": record["prevTotalValueUSD"],
                        "positions": record["prevPositionCount"]})
    for f in periods[2:]:
        try:
            h = fetch_period_total(cik_int, filings_13f, f["reportDate"])
            if h:
                history.append({**h, "valueUSD": round(h["valueUSD"])})
        except Exception as exc:  # noqa: BLE001
            print(f"  Verlauf {f['reportDate']} nicht ladbar: {exc}", file=sys.stderr)
    if cik_int in THOUSANDS_FILERS:
        # Deckblatt-Summen desselben Filers stehen dann ebenfalls in Tausend
        for h in history[2:]:
            if h["valueUSD"] and h["valueUSD"] * 200 < total:
                h["valueUSD"] = round(h["valueUSD"] * 1000)
    history.sort(key=lambda x: x["period"])
    record["history"] = history

    return record, cur_pos, trades


def build_bulk_record(cik, f, scale, prev_fund):
    pos = aggregate_positions([{**h, "valueUSD": h["valueUSD"] * scale} for h in f["holdings"]])
    total = sum(h["valueUSD"] for h in pos)
    category = classify_bulk_fund(f["name"])
    name = f["name"] or f"Institutioneller Manager (CIK {cik})"
    record = {
        "slug": f"cik-{int(cik)}", "cik": cik, "name": name.title() if name.isupper() else name, "secName": name,
        "manager": None, "role": None, "style": category, "bio": None, "note": None, "wiki": None,
        "category": "Institutionen", "source": "bulk",
        "reportDate": f["reportDate"], "filedDate": f["filingDate"], "accession": f["accession"], "form": "13F-HR",
        "totalValueUSD": round(total), "positionCount": len(pos),
        "optionCount": sum(1 for h in pos if h["putCall"]),
        "prevReportDate": None, "prevTotalValueUSD": None, "prevPositionCount": None, "aumChangePct": None,
        "history": [{"period": f["reportDate"], "valueUSD": round(total), "positions": len(pos)}],
    }
    trades = {}
    if prev_fund:
        prev_pos = aggregate_positions([{**h, "valueUSD": h["valueUSD"] * scale} for h in prev_fund["holdings"]])
        prev_total = sum(h["valueUSD"] for h in prev_pos)
        record.update(prevReportDate=prev_fund["reportDate"], prevTotalValueUSD=round(prev_total),
                      prevPositionCount=len(prev_pos),
                      aumChangePct=((total - prev_total) / prev_total * 100) if prev_total else None)
        record["history"].insert(0, {"period": prev_fund["reportDate"], "valueUSD": round(prev_total),
                                     "positions": len(prev_pos)})
        trades = compute_trades(pos, prev_pos)
    return record, pos, trades


# ------------------------------------------------------------- Porträts
def strip_html(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


FREE_LICENSE = re.compile(r"^(CC0|CC BY|CC-BY|Public domain|PD|Attribution|GFDL)", re.I)


def commons_file_from_url(src):
    if "/wikipedia/commons/" not in src:
        return None
    path = urllib.parse.urlparse(src).path
    if "/thumb/" in path:  # .../commons/thumb/a/ab/Name.jpg/320px-Name.jpg
        return urllib.parse.unquote(path.split("/thumb/", 1)[1].split("/")[2])
    return urllib.parse.unquote(path.rsplit("/", 1)[1])


def photo_candidates(wiki):
    """Commons-Dateinamen in dieser Reihenfolge: Leitbild der englischen
    Wikipedia, Bild (P18) des Wikidata-Eintrags, Leitbild der deutschen
    Wikipedia. Lokale, nicht-freie Wikipedia-Dateien fallen heraus."""
    files, qid = [], None
    try:
        summary = http_get_json(f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(wiki)}")
        qid = summary.get("wikibase_item")
        f = commons_file_from_url((summary.get("originalimage") or summary.get("thumbnail") or {}).get("source", ""))
        if f:
            files.append(f)
    except Exception as exc:  # noqa: BLE001
        print(f"  Wikipedia {wiki}: {exc}", file=sys.stderr)
        try:  # deutsche Manager haben oft nur einen deutschen Artikel
            summary = http_get_json(f"https://de.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(wiki)}")
            qid = summary.get("wikibase_item")
            f = commons_file_from_url((summary.get("originalimage") or {}).get("source", ""))
            if f:
                files.append(f)
        except Exception:  # noqa: BLE001
            pass
    if qid:
        try:
            ent = http_get_json(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json")["entities"][qid]
            for claim in ent.get("claims", {}).get("P18", []):
                v = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
                if v:
                    files.append(v)
            de_title = ent.get("sitelinks", {}).get("dewiki", {}).get("title")
            if de_title:
                summary = http_get_json("https://de.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(de_title.replace(" ", "_")))
                f = commons_file_from_url((summary.get("originalimage") or {}).get("source", ""))
                if f:
                    files.append(f)
        except Exception as exc:  # noqa: BLE001
            print(f"  Wikidata {qid}: {exc}", file=sys.stderr)
    return list(dict.fromkeys(f.replace("_", " ") for f in files))


def fetch_manager_photo(slug, wiki, manifest):
    """Holt ein frei lizenziertes Commons-Porträt (mit Urheber und Lizenz).
    Gibt Manifest-Eintrag oder None zurück."""
    cached = manifest.get(slug)
    if cached and cached.get("wiki") == wiki and (PHOTO_DIR / cached["file"]).exists():
        return cached
    for filename in photo_candidates(wiki):
        api = ("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo"
               "&iiprop=url|extmetadata&iiurlwidth=480&titles=" + urllib.parse.quote("File:" + filename))
        pages = http_get_json(api).get("query", {}).get("pages", {})
        info = (next(iter(pages.values()), {}).get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        license_short = strip_html(meta.get("LicenseShortName", {}).get("value", ""))
        if not FREE_LICENSE.match(license_short):
            print(f"  Foto {filename}: Lizenz '{license_short}' nicht frei", file=sys.stderr)
            continue
        thumb = info.get("thumburl") or info.get("url")
        if not thumb:
            continue
        ext = ".png" if thumb.lower().endswith(".png") else ".jpg"
        PHOTO_DIR.mkdir(parents=True, exist_ok=True)
        out_name = slug + ext
        (PHOTO_DIR / out_name).write_bytes(http_get(thumb))
        artist = strip_html(meta.get("Artist", {}).get("value", "")) or "unbekannt"
        return {"wiki": wiki, "file": out_name, "license": license_short,
                "licenseUrl": strip_html(meta.get("LicenseUrl", {}).get("value", "")) or None,
                "artist": artist[:140], "sourceUrl": info.get("descriptionurl")}
    return None


def update_photos(funds_meta):
    manifest = load_json(PHOTO_MANIFEST_PATH, {})
    for meta in funds_meta:
        slug, wiki = meta["slug"], meta.get("wiki")
        if not wiki:
            continue
        try:
            entry = fetch_manager_photo(slug, wiki, manifest)
            if entry:
                manifest[slug] = entry
            else:
                print(f"  kein freies Porträt für {meta.get('manager')} ({wiki})", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            print(f"  Porträt {wiki} nicht ladbar: {exc}", file=sys.stderr)
        time.sleep(0.2)
    write_json_if_changed(PHOTO_MANIFEST_PATH, manifest, indent=1)
    return manifest


# ----------------------------------------------------- CUSIP -> Ticker
OPENFIGI_URL = "https://api.openfigi.com/v3/mapping"
FIGI_MAX_REQUESTS = 400


def figi_pick(data):
    eq = [x for x in data if x.get("marketSector") == "Equity"] or data
    us = [x for x in eq if x.get("exchCode") in ("US", "UN", "UW", "UQ", "UA", "UR", "UP")]
    return (us or eq)[0]


def update_cusip_map(cusips_by_priority):
    """CUSIP -> Ticker über OpenFIGI, zwischengespeichert.

    Cache-Werte: {"ticker": ...} gefunden, {"ticker": None} endgültig nicht
    zuordenbar, null = mit US-CUSIP nicht gefunden, zweiter Versuch steht
    aus. Nummern mit Buchstaben vorne sind CINS (ausländische Emittenten,
    z.B. ASML N07059210) und brauchen idType ID_CINS; ohne Börsenfilter
    wird dann die Heimatbörse gefunden."""
    cmap = load_json(CUSIP_MAP_PATH, {})
    wanted = [c for c in dict.fromkeys(cusips_by_priority) if c and len(c) == 9]
    jobs = [(c, {"idType": "ID_CUSIP", "idValue": c, "exchCode": "US"}) for c in wanted if c not in cmap]
    for c in wanted:
        if c in cmap and cmap[c] is None:
            kind = "ID_CINS" if c[0].isalpha() else "ID_CUSIP"
            jobs.append((c, {"idType": kind, "idValue": c}))
    key = os.environ.get("OPENFIGI_API_KEY")
    batch = 100 if key else 10
    pause = 0.3 if key else 2.6
    headers = {"Content-Type": "application/json"}
    if key:
        headers["X-OPENFIGI-APIKEY"] = key
    requests_done = 0
    print(f"OpenFIGI: {len(jobs)} Abfragen offen (Cache: {len(cmap)})", file=sys.stderr)
    for i in range(0, len(jobs), batch):
        if requests_done >= FIGI_MAX_REQUESTS:
            print("  Limit pro Lauf erreicht; Rest folgt beim nächsten Lauf.", file=sys.stderr)
            break
        chunk = jobs[i:i + batch]
        body = json.dumps([j for _, j in chunk]).encode()
        try:
            res = json.loads(http_get(OPENFIGI_URL, headers=headers, data=body))
        except Exception as exc:  # noqa: BLE001
            print(f"  OpenFIGI-Fehler: {exc}", file=sys.stderr)
            time.sleep(10)
            requests_done += 1
            continue
        for (c, job), r in zip(chunk, res):
            if r.get("data"):
                d = figi_pick(r["data"])
                cmap[c] = {"ticker": (d.get("ticker") or "").replace("/", "-") or None, "name": d.get("name"),
                           "exch": d.get("exchCode")}
            elif "warning" in r:
                # erster Versuch (US) -> null, zweiter Versuch -> endgültig
                cmap[c] = None if "exchCode" in job else {"ticker": None}
        requests_done += 1
        time.sleep(pause)
    write_json_if_changed(CUSIP_MAP_PATH, cmap, indent=0)
    return cmap


def discover_sets():
    stocks = {p.stem for p in DISCOVER_STOCKS.glob("*.json")} if DISCOVER_STOCKS.exists() else set()
    logos = {p.stem for p in DISCOVER_LOGOS.glob("*.png")} if DISCOVER_LOGOS.exists() else set()
    return stocks, logos


def enrich(item, cmap, stocks, logos):
    m = cmap.get(item.get("cusip") or "")
    if m and m.get("name"):
        item["displayName"] = m["name"]
    if m and m.get("ticker"):
        t = m["ticker"]
        if m.get("exch") and m["exch"] not in ("US", "UN", "UW", "UQ", "UA", "UR", "UP"):
            item["ticker"] = t  # Heimatbörsen-Kürzel, kein Discover-Link
            return item
        item["ticker"] = t
        if t in stocks:
            item["discover"] = True
        if t in logos:
            item["logo"] = True
    return item


# ---------------------------------------------------------- Auswertungen
def quarter_label(iso):
    y, m, _ = iso.split("-")
    return f"Q{(int(m) - 1) // 3 + 1} {y}"


def latest_period(records):
    """Jüngste Periode, die mindestens 30 % der Fonds gemeldet haben."""
    c = Counter(r["reportDate"] for r in records)
    n = len(records)
    for p in sorted(c, reverse=True):
        if c[p] >= 0.3 * n:
            return p
    return max(c) if c else None


def build_aggregates(entries, period):
    """entries: [(record, positions, trades)] der Star-Investoren."""
    hold, buys, sells = {}, {}, {}
    used = []
    for rec, pos, trades in entries:
        used.append(rec["slug"])
        total = rec["totalValueUSD"] or 1
        for h in pos:
            if h["putCall"] or not h["cusip"]:
                continue
            a = hold.setdefault(h["cusip"], {"issuer": h["issuer"], "cusip": h["cusip"], "funds": [],
                                             "valueUSD": 0.0, "weightSum": 0.0})
            t = trades.get(position_key(h))
            fe = {"slug": rec["slug"], "weightPct": h["valueUSD"] / total * 100}
            if t and t["status"] != "unchanged":
                fe.update(status=t["status"], deltaPct=t["deltaPct"])
            a["funds"].append(fe)
            a["valueUSD"] += h["valueUSD"]
            a["weightSum"] += h["valueUSD"] / total * 100
        for t in trades.values():
            if t["putCall"] or not t["cusip"] or t["status"] == "unchanged":
                continue
            target = buys if t["estValueUSD"] > 0 else sells
            a = target.setdefault(t["cusip"], {"issuer": t["issuer"], "cusip": t["cusip"], "funds": [],
                                               "estValueUSD": 0.0, "newCount": 0, "soldCount": 0})
            a["funds"].append({"slug": rec["slug"], "status": t["status"], "estValueUSD": round(t["estValueUSD"]),
                               "deltaPct": t["deltaPct"], "weightPct": (t["valueUSD"] / total * 100) if total else 0})
            a["estValueUSD"] += t["estValueUSD"]
            a["newCount"] += t["status"] == "new"
            a["soldCount"] += t["status"] == "sold"

    consensus = sorted(hold.values(), key=lambda a: (-len(a["funds"]), -a["weightSum"]))[:40]
    for a in consensus:
        a["fundCount"] = len(a["funds"])
        a["avgWeightPct"] = a["weightSum"] / len(a["funds"])
        a["valueUSD"] = round(a["valueUSD"])
        a["funds"].sort(key=lambda f: -f["weightPct"])
        a["funds"] = a["funds"][:AGG_FUNDS_LISTED]
        del a["weightSum"]

    def finish(d):
        lst = sorted(d.values(), key=lambda a: (-abs(a["estValueUSD"])))[:40]
        for a in lst:
            a["fundCount"] = len(a["funds"])
            a["estValueUSD"] = round(a["estValueUSD"])
            a["funds"].sort(key=lambda f: -abs(f["estValueUSD"]))
            a["funds"] = a["funds"][:AGG_FUNDS_LISTED]
        return lst

    return {"period": period, "funds": used, "consensus": consensus,
            "buys": finish(buys), "sells": finish(sells)}


# -------------------------------------------------------------- Dateien
def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return default


def compact(obj):
    """Rundet Zahlen auf sinnvolle Genauigkeit und lässt doppelte Felder weg –
    hält die rund 1200 Detaildateien klein."""
    if isinstance(obj, float):
        if obj != obj:  # NaN
            return None
        return round(obj) if abs(obj) >= 1000 else round(obj, 3)
    if isinstance(obj, list):
        return [compact(x) for x in obj]
    if isinstance(obj, dict):
        out = {k: compact(v) for k, v in obj.items()}
        if out.get("cls") and out.get("cls") == out.get("issuer"):
            del out["cls"]
        return out
    return obj


def write_json_if_changed(path, obj, indent=None, ignore=("generatedAt",)):
    """Schreibt nur bei inhaltlicher Änderung (ohne Zeitstempel), damit der
    wöchentliche Lauf keine leeren Daten-Commits erzeugt."""
    obj = compact(obj)
    old = load_json(path, None)
    strip = lambda o: {k: v for k, v in o.items() if k not in ignore} if isinstance(o, dict) else o  # noqa: E731
    if old is not None and strip(old) == strip(json.loads(json.dumps(obj))):
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    seps = (",", ":") if indent is None else None
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=indent, separators=seps), encoding="utf-8")
    return True


def top_with_change(pos, trades, total, n):
    out = []
    for h in pos[:n]:
        item = {k: v for k, v in compact_position(h, total).items()
                if k in ("issuer", "cusip", "putCall", "valueUSD", "weightPct")}
        t = trades.get(position_key(h))
        if t and t["status"] != "unchanged":
            item.update(status=t["status"], deltaPct=t["deltaPct"])
        out.append(item)
    return out


def summarize(rec, pos, trades, photo, counts=None):
    lists, own_counts = trade_lists(trades, 3)
    total = rec["totalValueUSD"]
    s = {k: rec.get(k) for k in ("slug", "cik", "name", "secName", "manager", "role", "style", "bio", "note",
                                 "category", "source", "region", "city", "reportDate", "filedDate", "totalValueUSD",
                                 "positionCount", "prevReportDate", "prevTotalValueUSD", "aumChangePct", "jump", "history")}
    s["photo"] = photo
    s["top"] = top_with_change(pos, trades, total, INDEX_TOP)
    s["tradeCounts"] = counts if counts is not None else (own_counts if trades else None)
    s["topBuys"] = [compact_trade(t) for t in sorted(lists["new"] + lists["added"], key=lambda t: -t["estValueUSD"])[:3]]
    s["topSells"] = [compact_trade(t) for t in sorted(lists["sold"] + lists["reduced"], key=lambda t: t["estValueUSD"])[:3]]
    return s


def summarize_lite(rec, pos, trades, counts=None):
    """Kompakte Übersicht für die große Fondsliste (universe.json)."""
    _, own_counts = trade_lists(trades, 1)
    s = {k: rec.get(k) for k in ("slug", "cik", "name", "manager", "style", "category", "region", "city",
                                 "reportDate", "filedDate", "totalValueUSD", "positionCount",
                                 "prevTotalValueUSD", "aumChangePct", "stale", "jump")}
    s["top"] = top_with_change(pos, trades, rec["totalValueUSD"], 3)
    s["tradeCounts"] = counts if counts is not None else (own_counts if trades else None)
    return s


def detail(rec, pos, trades, photo, limit_holdings, limit_trades=DETAIL_TRADES):
    total = rec["totalValueUSD"]
    lists, counts = trade_lists(trades, limit_trades)
    holdings = []
    for h in pos[:limit_holdings]:
        item = compact_position(h, total)
        t = trades.get(position_key(h))
        if t:
            item.update(status=t["status"], deltaShares=t["deltaShares"], deltaPct=t["deltaPct"])
        holdings.append(item)
    return {"schema": SCHEMA, **rec, "photo": photo, "holdings": holdings,
            "holdingsTruncated": len(pos) > limit_holdings,
            "tradeCounts": counts if trades else None,
            "trades": {k: [compact_trade(t) for t in v] for k, v in lists.items()}}



# ------------------------------------------- Weitere Hedgefonds (Universum)
NON_HF_RE = re.compile(
    r"WEALTH|FINANCIAL PLANNING|RETIREMENT|PENSION|TRUST CO\b|TRUST COMPANY|\bBANK|BANCORP|BANCSHARES|INSURANCE|"
    r"ASSURANCE|UNIVERSITY|ENDOWMENT|FOUNDATION|FINANCIAL ADVISORS|FINANCIAL GROUP|FINANCIAL SERVICES|"
    r"FINANCIAL NETWORK|FINANCIAL PARTNERS|FINANCIAL CORP|INVESTMENT COUNSEL|SECURITIES|BROKERAGE|PLANNING|"
    r"STATE OF|TEACHERS|EMPLOYEES|COUNTY|SCHOOL|MUNICIPAL|CREDIT UNION|\bLIFE\b|MUTUAL|PRIVATE CLIENT|"
    r"ADVISORY SERVICES|INVESTMENT SERVICES|BENEFIT|SAVINGS|RETIREMENT|REGISTERED INVESTMENT")
ETF_RE = re.compile(
    r"\bETF\b|ISHARES|SPDR|VANGUARD|SELECT SECTOR|INVESCO QQQ|PROSHARES|DIREXION|WISDOMTREE|SCHWAB STRATEGIC|"
    r"INDEX FD|INDEX FUND|ETF TR|EXCHANGE TRADED|GLOBAL X|VANECK|FIRST TR ")
# Hedgefonds-Merkmale: Rechtsform LP (typisch für Fondsmanager-Strukturen)
# oder gemeldete Optionspositionen. Geprüft an echten Daten: erfasst ~80 %
# der Hedgefonds, aber nur ~25 % der Long-only-Fondshäuser.
LP_RE = re.compile(r"\bL\.?\s?L?\.?P\.?(?=$|[\s,./)])|\bLLLP\b", re.I)
HF_HINT_RE = re.compile(r"ARBITRAGE|MACRO|\bQUANT|EVENT DRIVEN|OPPORTUNIT|MASTER FUND|\bALPHA\b|RESEARCH & TECHNOLOGIES")
# Bekannte Long-only-/ETF-Häuser, die trotzdem ein Merkmal tragen
LONG_ONLY_NAMES = ["BRANDES", "WASATCH", "ROYCE", "WESTFIELD", "PROSHARE", "PACER ADVISORS", "TIDAL INVESTMENTS",
                   "RAFFERTY", "EMPOWERED FUNDS", "VIDENT", "NEOS INVESTMENT", "ALPS ADVISORS", "ROCKEFELLER",
                   "ENSIGN PEAK", "GQG", "GRANTHAM, MAYO", "SANDERS CAPITAL", "SANDS CAPITAL", "POLEN CAPITAL",
                   "CLEAR STREET", "MAREX", "PEAK6", "BROWN BROTHERS HARRIMAN", "BLAIR WILLIAM", "DAVENPORT",
                   "ADVENT INTERNATIONAL", "INVESTOR AB", "PUBLIC INVESTMENT FUND", "MUBADALA", "ASSENAGON",
                   "POLAR CAPITAL", "HOTCHKIS", "FRED ALGER", "MENORA", "O'SHAUGHNESSY", "IEQ CAPITAL",
                   "INDEPENDENT FRANCHISE", "VAUGHAN NELSON", "ARTEMIS INVESTMENT", "STEPSTONE", "SIXTH STREET"]
_UPPER_WORDS = {"LP", "LLC", "LLP", "LTD", "AG", "SA", "SE", "NV", "PLC", "GMBH", "KG", "II", "III", "IV", "USA",
                "US", "UK", "AB", "AS", "SAS", "LTDA", "KGAA", "CO.", "L.P.", "L.L.C.", "N.A."}


def pretty_name(name):
    """SEC-Großbuchstaben behutsam in normale Schreibweise bringen."""
    if not name or name != name.upper():
        return name or ""
    out = []
    special = {"GMBH": "GmbH", "KGAA": "KGaA", "MBH": "mbH", "&CO": "&Co"}
    for w in name.split():
        core = w.strip(",.")
        if core in special:
            out.append(w.replace(core, special[core]))
        elif core in _UPPER_WORDS or w in _UPPER_WORDS or len(core) <= 2 and core.isalpha() and core not in ("OF", "&"):
            out.append(w)
        elif core in ("OF", "AND", "THE", "FOR", "DE"):
            out.append(w.lower())
        else:
            out.append(w[:1] + w[1:].lower())
    return " ".join(out)


def etf_share(holdings):
    total = sum(h["valueUSD"] for h in holdings) or 1
    return sum(h["valueUSD"] for h in holdings if ETF_RE.search((h.get("issuer") or "").upper())) / total


def select_universe(bulk, scale, exclude):
    """Weitere Hedgefonds aus dem Sammeldatensatz: alle Filer außer Banken,
    großen Vermögensverwaltern, Marktmachern, Pensionskassen, Stiftungen
    und ETF-lastigen Vermögensberatern. Melder aus Deutschland, Österreich
    und der Schweiz werden (ab kleinerer Größe) immer aufgenommen."""
    hf, dach, other = [], [], []
    for cik, f in bulk.items():
        if cik in exclude:
            continue
        total = sum(h["valueUSD"] for h in f["holdings"]) * scale
        name = (f.get("name") or "").upper()
        region = DACH_COUNTRIES.get((f.get("country") or "").upper())
        entry = {"cik": cik, "name": f.get("name") or "", "region": region, "city": f.get("city") or None,
                 "bulkValueUSD": total}
        if region:
            if total >= DACH_MIN_AUM:
                dach.append(entry)
            continue
        if total < TIER2_MIN_AUM or classify_bulk_fund(name) != "Sonstige" or NON_HF_RE.search(name):
            continue
        big_value, big_positions = TIER2_MAX_SIZE_POSITIONS
        if total > big_value and len(f["holdings"]) > big_positions:
            continue  # breit gestreute Großverwalter (Index-/Fondsgesellschaften)
        if etf_share(f["holdings"]) > TIER2_MAX_ETF_SHARE:
            continue
        entry["hf"] = (not any(n in name for n in LONG_ONLY_NAMES)) and bool(
            LP_RE.search(name) or HF_HINT_RE.search(name) or any(h.get("putCall") for h in f["holdings"]))
        (hf if entry["hf"] else other).append(entry)
    hf.sort(key=lambda e: -e["bulkValueUSD"])
    other.sort(key=lambda e: -e["bulkValueUSD"])
    dach.sort(key=lambda e: -e["bulkValueUSD"])
    print(f"Universum: {len(hf)} Hedgefonds-Kandidaten (genutzt: {min(len(hf), TIER2_MAX)}), "
          f"{len(other)} Vermögensverwalter (genutzt: {min(len(other), TIER2_OTHER_MAX)}), "
          f"{len(dach)} Melder aus DACH", file=sys.stderr)
    for e in dach:
        print(f"  DACH {e['region']}: {e['name']} ({e['city']}) {e['bulkValueUSD'] / 1e9:.2f} Mrd USD", file=sys.stderr)
    return hf[:TIER2_MAX] + other[:TIER2_OTHER_MAX] + dach


def reuse_detail(old):
    """Rekonstruiert (rec, pos, trades, counts) aus einer vorhandenen
    Detaildatei, wenn sich das Filing seit dem letzten Lauf nicht geändert
    hat. Positionen/Trades sind dort auf die größten begrenzt – für Liste
    und Auswertungen reicht das."""
    rec_keys = ("slug", "cik", "name", "secName", "manager", "role", "style", "bio", "note", "wiki", "category",
                "source", "region", "city", "cacheVersion", "reportDate", "filedDate", "accession", "form",
                "totalValueUSD", "positionCount", "optionCount", "prevReportDate", "prevTotalValueUSD",
                "prevPositionCount", "aumChangePct", "jump", "history")
    rec = {k: old.get(k) for k in rec_keys}
    pos = [{"issuer": h["issuer"], "cls": h.get("cls", ""), "cusip": h.get("cusip", ""), "putCall": h.get("putCall", ""),
            "shareType": "", "valueUSD": h["valueUSD"], "shares": h.get("shares", 0)} for h in old.get("holdings", [])]
    trades = {}
    for lst in (old.get("trades") or {}).values():
        for t in lst:
            trades[position_key(t)] = dict(t)
    for h in old.get("holdings", []):
        k = position_key(h)
        if k not in trades and h.get("status"):
            trades[k] = {"issuer": h["issuer"], "cls": h.get("cls", ""), "cusip": h.get("cusip", ""),
                         "putCall": h.get("putCall", ""), "status": h["status"], "deltaPct": h.get("deltaPct"),
                         "deltaShares": h.get("deltaShares", 0), "shares": h.get("shares", 0), "prevShares": 0,
                         "valueUSD": h["valueUSD"], "prevValueUSD": 0, "estValueUSD": 0}
    return rec, pos, trades, old.get("tradeCounts")


def fetch_universe_fund(entry, deadline):
    cik = entry["cik"]
    slug = f"f-{int(cik)}"
    sub, filings = load_submissions(cik, need=2)
    periods = find_recent_13fs(filings, 2)
    if not periods:
        raise RuntimeError("kein 13F-HR")
    old = load_json(FUND_DIR / f"{slug}.json", None)
    if (old and old.get("cacheVersion") == CACHE_VERSION and old.get("reportDate") == periods[0]["reportDate"]
            and old.get("accession") == periods[0]["accession"]):
        rec, pos, trades, counts = reuse_detail(old)
        return {"rec": rec, "pos": pos, "trades": trades, "counts": counts, "reused": True}
    if time.monotonic() > deadline:
        raise TimeoutError("Zeitbudget erschöpft")
    name = sub.get("name") or entry["name"]
    style = classify_bulk_fund(name)
    if style == "Sonstige":
        style = "Hedgefonds" if entry.get("hf") else "Vermögensverwaltung"
    meta = {"slug": slug, "name": pretty_name(name), "manager": None, "style": style,
            "region": entry.get("region"), "city": pretty_name(entry.get("city") or "") or None}
    rec, pos, trades = build_fund_record(meta, cik, sub, filings, history_quarters=2, category="Hedgefonds")
    return {"rec": rec, "pos": pos, "trades": trades, "counts": None, "reused": False}


def fetch_universe(entries):
    start = time.monotonic()
    deadline = start + TIER2_TIME_BUDGET
    results, failed = [], []
    with ThreadPoolExecutor(max_workers=TIER2_WORKERS) as pool:
        futs = {pool.submit(fetch_universe_fund, e, deadline): e for e in entries}
        for i, fut in enumerate(as_completed(futs), 1):
            e = futs[fut]
            try:
                results.append(fut.result())
            except Exception as exc:  # noqa: BLE001
                failed.append({"cik": e["cik"], "slug": f"f-{int(e['cik'])}", "error": str(exc)})
            if i % 100 == 0:
                print(f"  Universum: {i}/{len(entries)} ({time.monotonic() - start:.0f}s)", file=sys.stderr)
    results.sort(key=lambda r: (-(r["rec"]["totalValueUSD"] or 0), r["rec"]["slug"]))  # deterministisch
    failed.sort(key=lambda f: f["slug"])
    reused = sum(1 for r in results if r["reused"])
    print(f"Universum: {len(results)} geladen ({reused} aus Cache), {len(failed)} nicht geladen, "
          f"{time.monotonic() - start:.0f}s", file=sys.stderr)
    for f in failed[:15]:
        print(f"  nicht geladen {f['cik']}: {f['error']}", file=sys.stderr)
    return results, failed


# ------------------------------------------------------------------ main
def enrich_detail(d, cmap, stocks, logos):
    for it in d.get("holdings", []):
        enrich(it, cmap, stocks, logos)
    for v in (d.get("trades") or {}).values():
        for it in v:
            enrich(it, cmap, stocks, logos)
    return d


def main():
    today = datetime.now(timezone.utc).date()
    bulk_period, bulk = load_latest_bulk(today)

    # 1) Kuratierte Investoren --------------------------------------------
    curated = []  # (meta, record, positions, trades)
    errors, not_filing = [], []
    seen_ciks = set()
    for meta in FUND_META:
        print(f"Lade {meta['name']} ...", file=sys.stderr)
        try:
            cik, sub, filings = resolve_fund(meta, bulk, bulk_period, exclude=seen_ciks)
            if cik in seen_ciks:
                raise RuntimeError(f"CIK {cik} doppelt")
            region = meta.get("region") or DACH_COUNTRIES.get((bulk.get(cik, {}).get("country") or "").upper())
            meta = {**meta, "region": region}
            rec, pos, trades = build_fund_record(meta, cik, sub, filings)
            seen_ciks.add(cik)
            curated.append((meta, rec, pos, trades))
            print(f"  OK {rec['reportDate']}: {rec['positionCount']} Positionen, {rec['totalValueUSD'] / 1e9:.2f} Mrd USD",
                  file=sys.stderr)
        except Exception as exc:  # noqa: BLE001 - ein Fonds darf die anderen nicht blockieren
            if meta.get("optional"):
                print(f"  keine 13F-Meldung bei der SEC gefunden ({exc}) – nicht aufgenommen", file=sys.stderr)
                not_filing.append({"slug": meta["slug"], "name": meta["name"], "manager": meta.get("manager")})
                continue
            print(f"  FEHLER: {exc}", file=sys.stderr)
            errors.append({"slug": meta["slug"], "name": meta["name"], "error": str(exc)})

    if not curated:
        print("Kein einziger Fonds geladen – Abbruch ohne Schreiben.", file=sys.stderr)
        sys.exit(1)

    # Zweiter Durchgang: Fonds ohne Meldung zum aktuellen Quartal über die
    # EDGAR-Volltextsuche auf eine neuere Meldestelle prüfen.
    period_now = latest_period([r for _, r, _, _ in curated])
    for i, (meta, rec, pos, trades) in enumerate(curated):
        if not period_now or rec["reportDate"] >= period_now or meta.get("note"):
            continue
        print(f"{meta['name']}: letzte Meldung {rec['reportDate']} < {period_now}", file=sys.stderr)
        for cik, name, period in fts_newer_ciks(meta, period_now, seen_ciks):
            try:
                sub, filings = load_submissions(cik)
                if latest_13f_period(filings) < period_now:
                    continue
                new = build_fund_record(meta, cik, sub, filings)
                seen_ciks.discard(rec["cik"])
                seen_ciks.add(cik)
                curated[i] = (meta, *new)
                print(f"  -> ersetzt durch {name} (CIK {cik}, {new[0]['reportDate']})", file=sys.stderr)
                break
            except Exception as exc:  # noqa: BLE001
                print(f"  Kandidat {cik} nicht nutzbar: {exc}", file=sys.stderr)

    # 2) Weitere Institutionen + Universum aus dem Sammeldatensatz ---------
    bulk_entries, universe_entries = [], []
    excluded = seen_ciks | {m["cik"] for m in FUND_META if m.get("cik")}
    if bulk:
        calib = [{"cik": r["cik"], "totalValueUSD": r["totalValueUSD"]} for _, r, _, _ in curated
                 if r["reportDate"] == bulk_period]
        scale, n = calibrate_bulk_scale(bulk, calib)
        if scale is None:
            print(f"Bulk: Kalibrierung nicht eindeutig ({n} Vergleichsfonds) – übersprungen", file=sys.stderr)
        else:
            print(f"Bulk: Skalierung x{scale} anhand {n} Fonds", file=sys.stderr)
            prev_bulk = {}
            try:
                prev_bulk = parse_bulk_quarter(download_bulk_zip(previous_report_period(bulk_period)))
            except Exception as exc:  # noqa: BLE001
                print(f"Bulk-Vorquartal nicht ladbar: {exc}", file=sys.stderr)
            ranked = sorted(((c, f) for c, f in bulk.items() if c not in excluded),
                            key=lambda t: -sum(h["valueUSD"] for h in t[1]["holdings"]))[:BULK_EXTRA]
            for c, f in ranked:
                bulk_entries.append(build_bulk_record(c, f, scale, prev_bulk.get(c)))
            del prev_bulk
            # Schwestergesellschaften kuratierter Fonds (z.B. "Situational Awareness
            # Partners LP" neben "Situational Awareness LP") nicht doppelt führen
            patterns = [p for m in FUND_META for p in [m["match"]] + list(m.get("altMatch") or [])]
            siblings = {c for c, f in bulk.items() if any(p in (f.get("name") or "").upper() for p in patterns)}
            universe_entries = select_universe(bulk, scale, excluded | {c for c, _ in ranked} | siblings)
    del bulk

    universe, universe_failed = fetch_universe(universe_entries) if universe_entries else ([], [])
    # Einordnung bei jedem Lauf neu anwenden (auch für zwischengespeicherte
    # Fonds), damit Änderungen an Filtern und Namenslisten sofort wirken.
    entry_by_cik = {e["cik"]: e for e in universe_entries}
    for u in universe:
        e = entry_by_cik.get(u["rec"]["cik"], {})
        style = classify_bulk_fund(u["rec"].get("secName") or u["rec"]["name"])
        if style == "Sonstige":
            style = "Hedgefonds" if e.get("hf") else "Vermögensverwaltung"
        u["rec"]["style"] = style

    # 3) Porträts & Ticker ------------------------------------------------
    photos = update_photos([m for m, *_ in curated])
    priority = []
    for _, rec, pos, trades in curated:
        priority += [h["cusip"] for h in pos[:60]]
    for _, rec, pos, trades in curated:
        lists, _ = trade_lists(trades, 25)
        priority += [t["cusip"] for v in lists.values() for t in v]
    for u in universe:
        priority += [h["cusip"] for h in u["pos"][:10]]
    for _, rec, pos, trades in curated:
        priority += [h["cusip"] for h in pos[60:DETAIL_HOLDINGS]]
    for rec, pos, trades in bulk_entries:
        priority += [h["cusip"] for h in pos[:INDEX_TOP]]
    for u in universe:
        priority += [h["cusip"] for h in u["pos"][10:TIER2_DETAIL_HOLDINGS]]
    priority = list(dict.fromkeys(priority))
    try:
        cmap = update_cusip_map(priority)
    except Exception as exc:  # noqa: BLE001
        print(f"Ticker-Zuordnung übersprungen: {exc}", file=sys.stderr)
        cmap = load_json(CUSIP_MAP_PATH, {})
    stocks, logos = discover_sets()

    def photo_for(slug):
        p = photos.get(slug)
        if not p:
            return None
        return {"src": f"img/managers/{p['file']}", "artist": p["artist"], "license": p["license"],
                "licenseUrl": p.get("licenseUrl"), "sourceUrl": p.get("sourceUrl")}

    # 4) Aktualität & Auswertungen -----------------------------------------
    records = [r for _, r, _, _ in curated]
    period = latest_period(records)
    min_period = previous_report_period(period) if period else None
    for r in records + [u["rec"] for u in universe]:
        r["stale"] = bool(period and r["reportDate"] < min_period)
        cur, prev = r.get("totalValueUSD"), r.get("prevTotalValueUSD")
        if cur and prev and not (1 / 200 < cur / prev < 200):
            r["jump"], r["aumChangePct"] = True, None

    star_entries = [(r, p, t) for m, r, p, t in curated
                    if not r["stale"] and r["style"] not in AGG_EXCLUDED_STYLES
                    and r["positionCount"] <= AGG_MAX_POSITIONS]
    all_entries = star_entries + [(u["rec"], u["pos"], u["trades"]) for u in universe
                                  if not u["rec"]["stale"] and u["rec"]["style"] == "Hedgefonds"
                                  and u["rec"]["positionCount"] <= AGG_MAX_POSITIONS]
    aggregates = build_aggregates(star_entries, period)
    aggregates_all = build_aggregates(all_entries, period)
    for agg in (aggregates, aggregates_all):
        for key in ("consensus", "buys", "sells"):
            for a in agg[key]:
                enrich(a, cmap, stocks, logos)

    # 5) Dateien ------------------------------------------------------------
    summaries = []
    FUND_DIR.mkdir(parents=True, exist_ok=True)
    written_slugs = set()
    for _, rec, pos, trades in curated:
        ph = photo_for(rec["slug"])
        s = summarize(rec, pos, trades, ph)
        s["stale"] = rec["stale"]
        for lst in (s["top"], s["topBuys"], s["topSells"]):
            for it in lst:
                enrich(it, cmap, stocks, logos)
        summaries.append(s)
        write_json_if_changed(FUND_DIR / f"{rec['slug']}.json",
                              enrich_detail(detail(rec, pos, trades, ph, DETAIL_HOLDINGS), cmap, stocks, logos))
        written_slugs.add(rec["slug"])
    for rec, pos, trades in bulk_entries:
        rec["stale"] = False
        s = summarize(rec, pos, trades, None)
        s["stale"] = False
        for lst in (s["top"], s["topBuys"], s["topSells"]):
            for it in lst:
                enrich(it, cmap, stocks, logos)
        summaries.append(s)
        write_json_if_changed(FUND_DIR / f"{rec['slug']}.json",
                              enrich_detail(detail(rec, pos, trades, None, BULK_DETAIL_HOLDINGS), cmap, stocks, logos))
        written_slugs.add(rec["slug"])

    universe_lite = []
    for u in universe:
        rec = u["rec"]
        lite = summarize_lite(rec, u["pos"], u["trades"], u["counts"])
        for it in lite["top"]:
            enrich(it, cmap, stocks, logos)
        universe_lite.append(lite)
        path = FUND_DIR / f"{rec['slug']}.json"
        if u["reused"]:
            old = load_json(path, None)
            if old:
                old["stale"] = rec["stale"]
                old["style"] = rec["style"]
                old["jump"], old["aumChangePct"] = rec.get("jump"), rec.get("aumChangePct")
                write_json_if_changed(path, enrich_detail(old, cmap, stocks, logos))
        else:
            d = detail(rec, u["pos"], u["trades"], None, TIER2_DETAIL_HOLDINGS, TIER2_DETAIL_TRADES)
            d["stale"] = rec["stale"]
            write_json_if_changed(path, enrich_detail(d, cmap, stocks, logos))
        written_slugs.add(rec["slug"])
    # Nicht geladene Universums-Fonds: letzten Stand weiterführen
    old_universe = {f["slug"]: f for f in load_json(UNIVERSE_PATH, {}).get("funds", [])}
    for f in universe_failed:
        if f["slug"] in old_universe and (FUND_DIR / f"{f['slug']}.json").exists():
            universe_lite.append(old_universe[f["slug"]])
            written_slugs.add(f["slug"])
    universe_lite.sort(key=lambda f: -(f["totalValueUSD"] or 0))

    # Detaildateien von Fonds, die nicht mehr geführt werden, entfernen.
    # Fehlgeschlagene kuratierte Fonds behalten ihre letzte Datei.
    keep = written_slugs | {e["slug"] for e in errors}
    for p in FUND_DIR.glob("*.json"):
        if p.stem not in keep:
            p.unlink()

    old_index = load_json(OUTPUT_PATH, {})
    old_by_slug = {f.get("slug"): f for f in old_index.get("funds", []) if f.get("slug")}
    for e in errors:
        if e["slug"] in old_by_slug:
            summaries.append({**old_by_slug[e["slug"]], "fetchError": e["error"]})

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    write_json_if_changed(UNIVERSE_PATH, {"schema": SCHEMA, "generatedAt": now, "latestPeriod": period,
                                          "funds": universe_lite})
    output = {
        "schema": SCHEMA, "generatedAt": now,
        "latestPeriod": period, "latestPeriodLabel": quarter_label(period) if period else None,
        "bulkPeriod": bulk_period if bulk_entries else None,
        "source": "SEC EDGAR Form 13F-HR (data.sec.gov / www.sec.gov), OpenFIGI, Wikimedia Commons",
        "universeCount": len(universe_lite),
        "dachCount": sum(1 for f in universe_lite if f.get("region")) + sum(1 for s in summaries if s.get("region")),
        "funds": summaries, "aggregates": aggregates, "aggregatesAll": aggregates_all,
        "notFiling": not_filing, "errors": errors,
    }
    changed = write_json_if_changed(OUTPUT_PATH, output)
    print(f"{'Geschrieben' if changed else 'Unverändert'}: {OUTPUT_PATH} – {len(curated)} Investoren, "
          f"{len(universe_lite)} weitere Hedgefonds, {len(bulk_entries)} Institutionen, {len(errors)} Fehler",
          file=sys.stderr)
    for e in errors:
        print(f"  Fehler {e['slug']}: {e['error']}", file=sys.stderr)
    for n in not_filing:
        print(f"  ohne 13F-Meldung: {n['manager']} ({n['name']})", file=sys.stderr)


if __name__ == "__main__":
    main()
