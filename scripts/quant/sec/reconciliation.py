"""Abgleich der Fundamentalschicht mit dem Marktdaten-/Technical-Universum.

Die Frage dieses Moduls ist nicht "haben wir Fundamentaldaten" und auch
nicht "haben wir Kurse", sondern:

    Fuer wie viele Titel haben wir BEIDES - und wo nicht, warum nicht?

Das ist die Frage, an der jedes Quant-Vorhaben haengt. Ein Titel mit
Kursen ohne Geschaeftszahlen taugt fuer Momentum und sonst nichts; einer
mit Geschaeftszahlen ohne Kurse ist nicht handelbar. Erst die
Schnittmenge ist das Universum, in dem sich ein Faktormodell rechnen
laesst.

VIER REGELN

  1. Der Join laeuft ueber stabile Identitaeten, nie ueber das Kuerzel
     allein. Kuerzel werden wiederverwendet; `instrumentId` und
     `issuerId` nicht.
  2. Fundamentaldaten haengen am EMITTENTEN. Zwei Aktienklassen teilen
     sich eine Historie und werden nicht doppelt gezaehlt.
  3. Marktdaten werden READ-ONLY konsumiert. Dieses Modul laedt keine
     Kurse, veraendert R2 nicht und rechnet keine Eligibility neu.
  4. Was nicht gemessen ist, ist `null` - nicht 0. Eine Null, die
     "nicht erhoben" heisst und wie "nicht vorhanden" aussieht, ist die
     teuerste Zahl in einem Deckungsbericht.
"""
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from .registry import MetricRegistry
from .universe_coverage import (DEPTH_YEARS, IN_PRODUCT, REPORT_METRICS,
                                PIT_READY, load_canonical_bundles,
                                issuer_from_canonical_bundle)
from .version import version_stamp

# --------------------------------------------------------------- Kennzahlen
#
# Die acht Kernkennzahlen aus §4. Sie tragen Screening, Faktormodelle und
# jede Bewertungsrechnung; ohne sie ist ein Titel technisch handelbar und
# fundamental blind.
CORE_METRIC_LABELS = {
    "revenue": "TECHNICAL_WITH_REVENUE",
    "net_income": "TECHNICAL_WITH_NET_INCOME",
    "eps_diluted": "TECHNICAL_WITH_EPS",
    "operating_cash_flow": "TECHNICAL_WITH_OPERATING_CASH_FLOW",
    "free_cash_flow": "TECHNICAL_WITH_FCF",
    "total_assets": "TECHNICAL_WITH_ASSETS",
    "total_debt": "TECHNICAL_WITH_DEBT",
    "stockholders_equity": "TECHNICAL_WITH_EQUITY",
}

# ------------------------------------------------------------ Lueckengruende
#
# §6 verlangt einen maschinenlesbaren Grund je Titel. Eine Sammelkategorie
# "missing" waere wertlos: sie beantwortet nicht, ob die Luecke unsere ist
# oder die der Quelle - und genau diese Antwort entscheidet, ob ein
# zweiter Anbieter noetig ist oder nur besseres Mapping.
NO_CIK = "NO_CIK"
NO_SEC_COMPANY_FACTS = "NO_SEC_COMPANY_FACTS"
FOREIGN_ISSUER = "FOREIGN_ISSUER"
ADR_OR_FOREIGN_REPORTING = "ADR_OR_FOREIGN_REPORTING"
VERY_YOUNG_LISTING = "VERY_YOUNG_LISTING"
SPECIAL_SECURITY_STRUCTURE = "SPECIAL_SECURITY_STRUCTURE"
MISSING_CANONICAL_TAG_MAPPING = "MISSING_CANONICAL_TAG_MAPPING"
UNIT_OR_CURRENCY_CONFLICT = "UNIT_OR_CURRENCY_CONFLICT"
INSUFFICIENT_HISTORY = "INSUFFICIENT_HISTORY"
SEC_DATA_PRESENT_BUT_NOT_NORMALIZED = "SEC_DATA_PRESENT_BUT_NOT_NORMALIZED"
SEC_STRUCTURALLY_UNAVAILABLE = "SEC_STRUCTURALLY_UNAVAILABLE"
IDENTITY_MAPPING_GAP = "IDENTITY_MAPPING_GAP"
UNKNOWN_REQUIRES_REVIEW = "UNKNOWN_REQUIRES_REVIEW"

SEC_RECOVERABLE = "SEC_RECOVERABLE"
EXTERNAL_PROVIDER_CANDIDATE = "EXTERNAL_PROVIDER_CANDIDATE"
# §7 verlangt zwei Hauptgruppen. Diese dritte ist keine Aufweichung,
# sondern die Weigerung zu raten: fuer diese Titel fuehrt weder unser
# Bestand noch das SEC-Verzeichnis genug, um zu sagen, ob die Daten dort
# liegen. Sie in eine der beiden Gruppen zu schieben, waere eine
# Anbieterentscheidung per Rundungsfehler.
REQUIRES_REVIEW = "REQUIRES_REVIEW"
# Eine Notiz von 2026 hat keine drei Jahresabschluesse, und kein Anbieter
# der Welt verkauft sie. Diese Luecke schliesst der Kalender. Sie als
# Anbieterkandidat zu fuehren, waere die teuerste Art Rundungsfehler:
# 852 Titel, die den Einkauf begruenden, den sie nicht brauchen.
RESOLVES_WITH_TIME = "RESOLVES_WITH_TIME"
# Ein Vorzug, eine Einheit, ein Bezugsrecht meldet keinen eigenen
# Abschluss - die Zahlen gehoeren dem Emittenten des Stammpapiers. Das
# ist keine Datenluecke, sondern eine Produktentscheidung: zeigt man die
# des Emittenten, oder zeigt man keine?
BY_DESIGN = "BY_DESIGN"

# Welcher Grund heisst "unsere Pipeline", welcher "die Quelle gibt es
# nicht her"? Diese Zuordnung ist die eigentliche Aussage des Berichts -
# sie entscheidet ueber Geld (§15: noch kein Anbieter).
RECOVERABILITY = {
    # KEINE CIK, UND DAS SEC-VERZEICHNIS KENNT DAS KUERZEL AUCH NICHT.
    #
    # Die erste Fassung fuehrte das als SEC_RECOVERABLE: "die SEC fuehrt
    # jeden Einreicher, es fehlt nur die Zuordnung". Das klang richtig
    # und war falsch. Von den 1.146 Produkttiteln ohne CIK steht KEIN
    # EINZIGER in den beiden SEC-Verzeichnissen (10.426 Kuerzel). Der
    # Bericht haette 838 Titel als blosses Mapping-Problem ausgewiesen
    # und damit die Anbieterfrage in die falsche Richtung beantwortet.
    NO_CIK: REQUIRES_REVIEW,
    # Anders hier: das SEC-Verzeichnis KENNT das Kuerzel, unser Master
    # hat trotzdem keine CIK daran. Das ist belegbar unsere Luecke.
    IDENTITY_MAPPING_GAP: SEC_RECOVERABLE,
    # Einreichungen liegen vor, unsere Registry kennt die Konzepte nicht.
    MISSING_CANONICAL_TAG_MAPPING: SEC_RECOVERABLE,
    SEC_DATA_PRESENT_BUT_NOT_NORMALIZED: SEC_RECOVERABLE,
    UNIT_OR_CURRENCY_CONFLICT: SEC_RECOVERABLE,
    # Ein Emittent mit CIK, fuer den noch kein Abruf lief.
    NO_SEC_COMPANY_FACTS: SEC_RECOVERABLE,
    # 20-F und 40-F sind gefuehrt; IFRS-Taxonomien sind es nicht.
    # Das ist Mapping-Arbeit, keine Anbieterfrage.
    FOREIGN_ISSUER: SEC_RECOVERABLE,
    # Kein US-Einreicher: hier hilft kein Mapping.
    ADR_OR_FOREIGN_REPORTING: EXTERNAL_PROVIDER_CANDIDATE,
    SEC_STRUCTURALLY_UNAVAILABLE: EXTERNAL_PROVIDER_CANDIDATE,
    # Ein junges Listing hat schlicht noch keine Historie. Die kommt von
    # selbst; ein Anbieter kann sie nicht erfinden - deshalb
    # RESOLVES_WITH_TIME und nicht EXTERNAL_PROVIDER_CANDIDATE.
    VERY_YOUNG_LISTING: RESOLVES_WITH_TIME,
    INSUFFICIENT_HISTORY: EXTERNAL_PROVIDER_CANDIDATE,
    # Vorzuege, Einheiten, Bezugsrechte melden keine eigenen Abschluesse.
    SPECIAL_SECURITY_STRUCTURE: BY_DESIGN,
    UNKNOWN_REQUIRES_REVIEW: EXTERNAL_PROVIDER_CANDIDATE,
}

FOREIGN_FORMS = {"20-F", "20-F/A", "40-F", "40-F/A", "6-K"}
US_PERIODIC_FORMS = {"10-K", "10-K/A", "10-Q", "10-Q/A"}

# Ein Listing unter zwei Jahren kann gar keine drei Jahresabschluesse
# haben. Das ist keine Luecke im Bestand, sondern im Kalender.
YOUNG_LISTING_YEARS = 2


def _read(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_market_capability(root):
    """Marktdaten-Zustaende je Mitglied - READ-ONLY.

    Erzeugt von scripts/universe/build-universe-indexes.mjs aus den
    Gate- und Technical-Berichten. Dieses Modul liest sie und schreibt
    nie zurueck: die Marktdatenschicht gehoert einem anderen Workstream.
    """
    path = Path(root) / "quant" / "data" / "universe" / "market-capability.json"
    if not path.exists():
        return None
    return _read(path)


def load_product_members(root):
    """Mitglieder des Produktuniversums mit den Feldern, die §6 braucht.

    universe_coverage.product_members reicht hier nicht: die
    Lueckenklassifikation braucht Gattung, Land, Erstnotiz und
    ADR-Hinweis, und die wirft jene Funktion bewusst weg."""
    base = Path(root) / "quant" / "data" / "universe" / "instruments"
    members = {}
    for path in sorted(base.glob("*.json")):
        for row in _read(path).get("instruments") or []:
            if row.get("productEligibility") not in IN_PRODUCT:
                continue
            key = row.get("masterMemberId") or row.get("instrumentId")
            entry = members.setdefault(key, {
                "memberId": key, "symbols": [], "instrumentIds": [],
                "issuerId": None, "cik": None,
                "eligibility": row.get("productEligibility"),
                "securityType": row.get("securityType"),
                "securityClass": row.get("securityClass"),
                "shareClass": row.get("shareClass"),
                "country": row.get("country"),
                "adrEvidence": row.get("adrEvidence"),
                "firstTradeDate": row.get("firstTradeDate"),
                "otc": row.get("otc"),
            })
            entry["symbols"].append(row.get("symbol"))
            entry["instrumentIds"].append(row.get("instrumentId"))
            if row.get("issuerId") and not entry["issuerId"]:
                entry["issuerId"] = row["issuerId"]
                entry["cik"] = row.get("cik")
            # Die aelteste Erstnotiz des Mitglieds zaehlt: eine zweite
            # Aktienklasse macht das Unternehmen nicht juenger.
            first = row.get("firstTradeDate")
            if first and (not entry["firstTradeDate"] or first < entry["firstTradeDate"]):
                entry["firstTradeDate"] = first
    return members


def load_sec_ticker_directory(root):
    """Die Kuerzel, die die SEC selbst fuehrt - READ-ONLY.

    Erzeugt von scripts/universe/build-cik-map.mjs aus den beiden
    SEC-Verzeichnissen. Sie ist der einzige Beleg dafuer, ob ein Titel
    ohne CIK ein Zuordnungsproblem ist oder schlicht kein Einreicher.
    """
    path = Path(root) / "quant" / "data" / "universe" / "cik-map.json"
    if not path.exists():
        return None
    payload = _read(path)
    if payload.get("status") not in ("OK", "FROM_CACHE"):
        # Ein fehlgeschlagener Abruf darf nicht als "die SEC kennt das
        # Kuerzel nicht" durchgehen - das waere ein Netzwerkfehler, der
        # sich als Datenbefund ausgibt.
        return None
    return set(payload.get("byTicker") or {})


def load_issuer_fundamentals(root):
    """Fundamentalbilanz je issuerId aus den ausgelieferten Scherben."""
    base = Path(root) / "quant" / "data" / "fundamentals" / "issuers"
    out = {}
    if base.exists():
        for path in sorted(base.glob("*.json")):
            for row in _read(path).get("issuers") or []:
                if row.get("issuerId"):
                    out[row["issuerId"]] = row
    return out


def _annual_years(fundamentals):
    """Jahre auflösbarer Fundamentalhistorie eines Emittenten.

    GEMESSEN AM EMITTENTEN, NICHT AM UMSATZ.

    Die erste Fassung nahm die Tiefe der Kennzahl `revenue` als Mass
    fuer die Historie. Fuer einen Industriewert ist das richtig; fuer
    eine Bank ist es falsch. Banken melden Zinsertraege, Vermoegens-
    verwalter Gebuehren, und keiner von beiden taggt "Revenues".

    Die Folge war kein Rundungsfehler: 635 Emittenten mit Werten haben
    keinen Umsatz-Tag, darunter AllianceBernstein (seit 1988 notiert,
    17 Jahre Nettoergebnis, Cashflow und Bilanzsumme) und Ameris
    Bancorp (16 Jahre in sieben Kennzahlen). Sie standen mit
    Jahreshistorie 0 im Bericht und wanderten als
    EXTERNAL_PROVIDER_CANDIDATE in die Anbieterbegruendung - 517 Titel,
    die nichts brauchen, was man kaufen kann.

    Gezaehlt wird deshalb die Spanne der aufloesbaren Perioden des
    Emittenten. Sie steht bereits gemessen im Factbook.
    """
    if not fundamentals:
        return 0.0
    return float(fundamentals.get("historyYears") or 0.0)


def _quarter_years(fundamentals):
    """Quartalstiefe des Emittenten, aus seinen aufloesbaren Perioden."""
    if not fundamentals:
        return 0.0
    return float(fundamentals.get("quarterlyPeriods") or 0) / 4.0


def _revenue_years(fundamentals):
    """Die Umsatztiefe getrennt - sie bleibt eine nuetzliche Zahl,
    nur eben keine Aussage ueber die Historie des Emittenten."""
    if not fundamentals:
        return 0.0
    row = (fundamentals.get("metrics") or {}).get("revenue") or {}
    return float(row.get("historyYears") or 0.0)


def _has_metric(fundamentals, metric):
    if not fundamentals:
        return False
    return (fundamentals.get("metrics") or {}).get(metric, {}).get("annualPeriods", 0) > 0


def join_members(members, fundamentals, market):
    """Ein Satz je Produkttitel, mit beiden Seiten daran.

    Der Join geht ueber `masterMemberId` -> `issuerId`, nie ueber das
    Kuerzel: Kuerzel werden nach einem Delisting wiederverwendet, und ein
    Abgleich, der darauf baut, haengt irgendwann die Geschaeftszahlen des
    Vorbesitzers an ein anderes Unternehmen.
    """
    market_rows = {}
    for row in (market or {}).get("members") or []:
        market_rows[row["m"]] = row

    records = []
    for key, member in members.items():
        fund = fundamentals.get(member["issuerId"]) if member["issuerId"] else None
        mkt = market_rows.get(key) or {}
        pit = (fund or {}).get("pit") or {}
        records.append({
            "memberId": key,
            "symbols": member["symbols"],
            "instrumentIds": member["instrumentIds"],
            "issuerId": member["issuerId"],
            "cik": member["cik"],
            "eligibility": member["eligibility"],
            "securityType": member["securityType"],
            "shareClass": member["shareClass"],
            "country": member["country"],
            "adrEvidence": member["adrEvidence"],
            "firstTradeDate": member["firstTradeDate"],
            # --- Marktseite, read-only uebernommen
            "priceHistory": mkt.get("ph") is True,
            "priceSnapshot": mkt.get("ps") is True,
            "factorReady": mkt.get("fr") is True,
            "technicalState": mkt.get("t"),
            "bars": mkt.get("b") or 0,
            "priceFirst": mkt.get("f"),
            "priceLast": mkt.get("l"),
            "marketEvidence": mkt.get("src"),
            # --- Fundamentalseite
            "fundamentals": fund is not None,
            "pitState": pit.get("state"),
            "resolvedValues": pit.get("resolvedValues", 0) if fund else 0,
            "annualYears": _annual_years(fund),
            "quarterYears": _quarter_years(fund),
            "revenueYears": _revenue_years(fund),
            "latestForm": ((fund or {}).get("latestFiling") or {}).get("form"),
            "findingCodes": ((fund or {}).get("qualitySummary") or {}).get("by_code") or {},
            "metrics": {m: _has_metric(fund, m) for m in CORE_METRIC_LABELS},
            "_fund": fund,
        })
    records.sort(key=lambda r: r["memberId"])
    return records


def _listing_age_years(record, today):
    first = record.get("firstTradeDate")
    if not first or not today:
        return None
    try:
        return (int(today[:4]) - int(first[:4])) + (int(today[5:7]) - int(first[5:7])) / 12.0
    except (TypeError, ValueError):
        return None


def classify_gap(record, today=None, min_years=3, sec_tickers=None):
    """Warum fehlen diesem Titel belastbare Fundamentaldaten?

    Reihenfolge ist Absicht: der erste zutreffende Grund gewinnt, und die
    spezifischeren stehen oben. Ein auslaendischer Emittent ohne CIK ist
    kein `NO_CIK`-Fall, sondern ein struktureller - wer ihn als NO_CIK
    fuehrt, sucht anschliessend nach einer Zuordnung, die es nicht gibt.

    Gibt (grund, wiederherstellbarkeit) zurueck, oder (None, None), wenn
    der Titel hinreichend gedeckt ist.
    """
    codes = record.get("findingCodes") or {}
    form = record.get("latestForm")
    typ = record.get("securityType")
    hinreichend = (record["fundamentals"] and record["resolvedValues"] > 0
                   and record["annualYears"] >= min_years)
    if hinreichend:
        return None, None

    # 1. Papiere, die nie einen eigenen Abschluss melden. Ein Vorzug oder
    #    ein Bezugsrecht hat keine GuV - die des Emittenten haengt am
    #    Stammpapier, nicht hier.
    if typ and typ not in ("COMMON_STOCK", "ADR", None):
        return SPECIAL_SECURITY_STRUCTURE, RECOVERABILITY[SPECIAL_SECURITY_STRUCTURE]

    # 2. Einreichungen liegen vor, aber nichts davon wird zu einer Zahl.
    if record["fundamentals"] and record["resolvedValues"] == 0:
        if form in FOREIGN_FORMS:
            # 20-F/40-F sind gefuehrt; die IFRS-Taxonomie ist nicht
            # gemappt. Die Daten SIND bei der SEC.
            return FOREIGN_ISSUER, RECOVERABILITY[FOREIGN_ISSUER]
        if codes.get("UNIT_MISMATCH") or codes.get("PERIOD_MISMATCH"):
            return UNIT_OR_CURRENCY_CONFLICT, RECOVERABILITY[UNIT_OR_CURRENCY_CONFLICT]
        if codes.get("UNKNOWN_CONCEPT"):
            return MISSING_CANONICAL_TAG_MAPPING, RECOVERABILITY[MISSING_CANONICAL_TAG_MAPPING]
        return SEC_DATA_PRESENT_BUT_NOT_NORMALIZED, \
            RECOVERABILITY[SEC_DATA_PRESENT_BUT_NOT_NORMALIZED]

    # 3. Zahlen da, aber zu kurz. Junge Notiz zuerst: das ist kein
    #    Mangel, sondern ein Datum.
    if record["fundamentals"] and record["resolvedValues"] > 0:
        alter = _listing_age_years(record, today)
        if alter is not None and alter < YOUNG_LISTING_YEARS:
            return VERY_YOUNG_LISTING, RECOVERABILITY[VERY_YOUNG_LISTING]
        return INSUFFICIENT_HISTORY, RECOVERABILITY[INSUFFICIENT_HISTORY]

    # 4. Keine Geschaeftszahlen im Bestand.
    if record["cik"]:
        # CIK bekannt, aber kein Factbook: der Abruf steht aus oder ist
        # fehlgeschlagen. Beides ist unsere Baustelle.
        return NO_SEC_COMPANY_FACTS, RECOVERABILITY[NO_SEC_COMPANY_FACTS]

    # 5. Keine CIK. Jetzt entscheidet ein BELEG, nicht eine Annahme.
    #
    # Der Beleg ist das SEC-Tickerverzeichnis selbst: kennt es das
    # Kuerzel, dann liegen die Einreichungen dort und unsere Zuordnung
    # hat versagt. Kennt es das Kuerzel nicht, ist die Behauptung "die
    # SEC hat das schon" durch nichts gedeckt.
    if sec_tickers is not None and record["symbols"]:
        if any(sym in sec_tickers for sym in record["symbols"] if sym):
            return IDENTITY_MAPPING_GAP, RECOVERABILITY[IDENTITY_MAPPING_GAP]

    if record.get("adrEvidence") == "adr" or record.get("country") not in ("US", None):
        return ADR_OR_FOREIGN_REPORTING, RECOVERABILITY[ADR_OR_FOREIGN_REPORTING]

    # Eine Notiz aus diesem Jahr steht noch in keinem Verzeichnis. Das
    # ist kein Mangel an Daten, sondern an Zeit - und keine Frage, die
    # ein Anbieter beantwortet.
    alter = _listing_age_years(record, today)
    if alter is not None and alter < YOUNG_LISTING_YEARS:
        return VERY_YOUNG_LISTING, RECOVERABILITY[VERY_YOUNG_LISTING]

    if record.get("otc") is True:
        # OTC-Titel sind haeufig keine SEC-Berichterstatter.
        return SEC_STRUCTURALLY_UNAVAILABLE, RECOVERABILITY[SEC_STRUCTURALLY_UNAVAILABLE]

    # Bleibt: keine CIK, dem SEC-Verzeichnis unbekannt, nicht jung,
    # nicht OTC. Ob die SEC etwas fuehrt, ist von hier aus NICHT
    # entscheidbar - und wird deshalb auch nicht entschieden.
    return NO_CIK, RECOVERABILITY[NO_CIK]


def _pct(part, whole):
    return round(100.0 * part / whole, 4) if whole else None


def overlap_report(records, market):
    """§3. Die Schnittmengen, die bisher absichtlich `null` waren.

    Gezaehlt wird auf PAPIEREBENE gegen `PRODUCT_TITLES`, weil die Frage
    "wie viele Titel kann ich screenen" eine Frage nach Papieren ist.
    """
    gesamt = len(records)
    preis = [r for r in records if r["priceHistory"]]
    technisch = [r for r in records if r["technicalState"] == "TECHNICAL_READY"]
    fundamental = [r for r in records if r["fundamentals"]]
    pit = [r for r in records if r["pitState"] == PIT_READY]

    tech_ids = {r["memberId"] for r in technisch}
    fund_ids = {r["memberId"] for r in fundamental}
    preis_ids = {r["memberId"] for r in preis}
    pit_ids = {r["memberId"] for r in pit}

    # §6: der Kern, den ein Screener wirklich braucht. Ohne Umsatz,
    # Ergebnis und Bilanzsumme ist ein Titel fundamental nicht bewertbar.
    kern = {r["memberId"] for r in records
            if all(r["metrics"].get(m) for m in ("revenue", "net_income", "total_assets"))}

    return {
        "note": "Gezaehlt auf Papierebene gegen PRODUCT_TITLES. Der Join laeuft ueber "
                "securityId == masterMemberId -> issuerId -> CIK, nie ueber das "
                "Kuerzel allein (§3).",
        "denominator": {"PRODUCT_TITLES": gesamt},
        "PRODUCT_TITLES": gesamt,
        # --- §4 Marktseite, kanonisch
        "R2_HISTORY_AVAILABLE": len(preis),
        "R2_HISTORY_UNAVAILABLE": gesamt - len(preis),
        "TECHNICAL_HISTORY_ELIGIBLE": len(technisch),
        "TECHNICAL_INSUFFICIENT_HISTORY": gesamt - len(technisch),
        # --- §5 Schnittmengen mit R2
        "R2_AND_FUNDAMENTAL": len(preis_ids & fund_ids),
        "R2_WITHOUT_FUNDAMENTAL": len(preis_ids - fund_ids),
        "TECHNICAL_WITHOUT_FUNDAMENTAL": len(tech_ids - fund_ids),
        "PIT_AND_R2": len(pit_ids & preis_ids),
        "PIT_R2_AND_TECHNICAL": len(pit_ids & preis_ids & tech_ids),
        "PIT_R2_TECHNICAL_AND_CORE_FUNDAMENTALS":
            len(pit_ids & preis_ids & tech_ids & kern),
        # --- Bestandsnamen aus der vorigen Stufe, unveraendert
        "MARKET_HISTORY_AVAILABLE": len(preis),
        "TECHNICAL_COVERED": len(technisch),
        "FUNDAMENTAL_COMPANY_FACTS_AVAILABLE": len(fundamental),
        "PIT_READY": len(pit),
        "TECHNICAL_AND_FUNDAMENTAL": len(tech_ids & fund_ids),
        "TECHNICAL_WITHOUT_FUNDAMENTALS": len(tech_ids - fund_ids),
        "FUNDAMENTALS_WITHOUT_TECHNICAL": len(fund_ids - tech_ids),
        "HISTORICAL_PRICE_AND_FUNDAMENTAL": len(preis_ids & fund_ids),
        "PIT_AND_TECHNICAL": len(pit_ids & tech_ids),
        "PIT_AND_HISTORICAL_PRICE": len(pit_ids & preis_ids),
        "PIT_TECHNICAL_AND_HISTORICAL_PRICE": len(pit_ids & tech_ids & preis_ids),
        "percentOfProductUniverse": {
            "MARKET_HISTORY_AVAILABLE": _pct(len(preis), gesamt),
            "TECHNICAL_COVERED": _pct(len(technisch), gesamt),
            "FUNDAMENTAL_COMPANY_FACTS_AVAILABLE": _pct(len(fundamental), gesamt),
            "PIT_READY": _pct(len(pit), gesamt),
            "TECHNICAL_AND_FUNDAMENTAL": _pct(len(tech_ids & fund_ids), gesamt),
        },
        "acceptedMarketDataState": _accepted_state(market, len(preis), len(technisch), gesamt),
    }


# Der abgenommene Stand des R2-/Marktdaten-Workstreams. Er wird NICHT
# nachgerechnet und nicht veraendert (§1) - er steht hier, damit die
# Differenz zur eigenen Ableitung sichtbar ist statt stillschweigend
# verschwindet.
ACCEPTED_R2 = {
    "PRODUCT_TITLES": 7004,
    "R2_SERIES_AVAILABLE": 7802,
    "HISTORICAL_CHART_AVAILABLE": 6997,
    "HISTORICAL_CHART_AVAILABLE_PERCENT": 99.90,
    "TECHNICAL_HISTORY_ELIGIBLE": 5963,
    "TECHNICAL_HISTORY_ELIGIBLE_PERCENT": 85.14,
}


def _accepted_state(market, preis, technisch, gesamt):
    """Der abgenommene R2-Stand gegen die eigene Rechnung - GEPRUEFT.

    Frueher stand hier eine Differenz, weil die Marktdatenseite nur als
    Summe vorlag und der Overlap gegen die alten Gate-Laeufe gerechnet
    wurde: 5.397 statt 6.997, 5.378 statt 5.963.

    Jetzt liegt die kanonische Quelle je Titel vor. Beide Berichte
    fuehren ihre AUSNAHMEN namentlich - sieben nicht darstellbare Titel,
    1.041 technisch zu kurze. Wer im Produktuniversum steht und in
    keiner Ausnahmeliste, ist gedeckt. Das ist die Umkehrung einer
    vollstaendigen Aufzaehlung und keine Schaetzung; deshalb MUSS die
    eigene Rechnung die abgenommene Zahl treffen.

    Trifft sie sie nicht, ist das ein Befund und keine Rundung - er
    steht als `reconciled: false` mit der Differenz da, statt
    stillschweigend einen neuen Nenner einzufuehren (§4).
    """
    quelle = (market or {}).get("source") or {}
    kanonisch = quelle.get("kind") == "CANONICAL"
    akzeptiert = dict(ACCEPTED_R2)
    if kanonisch and quelle.get("accepted"):
        # Die Zahlen aus der Quelle selbst, nicht aus unserer Konstante.
        akzeptiert.update({k: v for k, v in quelle["accepted"].items() if v is not None})

    abweichung_preis = preis - akzeptiert["HISTORICAL_CHART_AVAILABLE"]
    abweichung_tech = technisch - akzeptiert["TECHNICAL_HISTORY_ELIGIBLE"]
    stimmt = abweichung_preis == 0 and abweichung_tech == 0

    erklaerung = None
    if not stimmt:
        erklaerung = (
            "Die eigene Rechnung weicht vom abgenommenen Stand ab. Moegliche "
            "Ursachen, in dieser Reihenfolge zu pruefen: (1) das Produktuniversum "
            "hier ist nicht dasselbe wie das, gegen das die Kennzahlen gerechnet "
            "wurden, (2) eine Ausnahmeliste wurde unvollstaendig gelesen, (3) der "
            "Identitaetsjoin trifft nicht jeden Titel. KEIN neuer Nenner ohne "
            "geklaerte Ursache (§4).")
    elif not kanonisch:
        erklaerung = (
            "Gerechnet wurde aus den alten Gate-Laeufen, nicht aus der kanonischen "
            "Quelle. Die Gate-Laeufe endeten VOR der Erweiterung des "
            "Wertpapierstamms - diese Zahlen sind eine Stichprobe.")

    return {
        "status": "CANONICAL_PER_INSTRUMENT" if kanonisch else "LEGACY_GATE_RUNS",
        "owner": "R2-/Marktdaten-Workstream",
        "sourceRunId": quelle.get("runId"),
        "provenance": quelle.get("provenance"),
        "accepted": akzeptiert,
        "computed": {
            "HISTORICAL_CHART_AVAILABLE": preis,
            "TECHNICAL_HISTORY_ELIGIBLE": technisch,
            "PRODUCT_TITLES": gesamt,
        },
        "delta": {
            "HISTORICAL_CHART_AVAILABLE": abweichung_preis,
            "TECHNICAL_HISTORY_ELIGIBLE": abweichung_tech,
        },
        "reconciled": stimmt,
        "explanation": erklaerung,
        "note": "R2_SERIES_AVAILABLE (7.802) zaehlt gegen den WERTPAPIERSTAMM (7.803), "
                "nicht gegen das Produktuniversum (7.004) - es ist die Ablagedeckung "
                "und keine Produktkennzahl. Sie wird hier gefuehrt und NICHT in die "
                "Schnittmengen gerechnet.",
        "evidenceSources": (market or {}).get("evidenceSources"),
    }


def core_metric_report(records):
    """§4. Was kann die technische Schicht fundamental unterlegen?"""
    technisch = [r for r in records if r["technicalState"] == "TECHNICAL_READY"]
    basis = len(technisch)
    out = {"denominator": {"TECHNICAL_UNIVERSE": basis}, "metrics": {}}
    for metric, label in CORE_METRIC_LABELS.items():
        count = sum(1 for r in technisch if r["metrics"].get(metric))
        out["metrics"][label] = {
            "COUNT": count,
            "PERCENT_OF_TECHNICAL_UNIVERSE": _pct(count, basis),
        }
    return out


def history_report(records):
    """§5. Wie gross ist das backtestfaehige Universum je Tiefe?"""
    technisch = [r for r in records if r["technicalState"] == "TECHNICAL_READY"]
    basis = len(technisch)
    annual, quarterly = {}, {}
    for jahre in DEPTH_YEARS:
        a = sum(1 for r in technisch if r["annualYears"] >= jahre)
        annual[f"TECHNICAL_WITH_ANNUAL_{jahre}Y"] = {
            "COUNT": a, "PERCENT_OF_TECHNICAL_UNIVERSE": _pct(a, basis)}
    for jahre in (1, 3, 5, 10):
        q = sum(1 for r in technisch if r["quarterYears"] >= jahre)
        quarterly[f"TECHNICAL_WITH_QUARTERLY_{jahre}Y"] = {
            "COUNT": q, "PERCENT_OF_TECHNICAL_UNIVERSE": _pct(q, basis)}
    return {"denominator": {"TECHNICAL_UNIVERSE": basis},
            "annual": annual, "quarterly": quarterly}


def gap_report(records, today=None, min_years=3, sec_tickers=None):
    """§6/§7. Jede Luecke mit Grund, und der Grund mit einer Adresse."""
    nach_grund = Counter()
    nach_gruppe = Counter()
    beispiele = defaultdict(list)
    for record in records:
        grund, wieder = classify_gap(record, today=today, min_years=min_years,
                                     sec_tickers=sec_tickers)
        record["gapCause"] = grund
        record["gapRecoverability"] = wieder
        if grund is None:
            continue
        nach_grund[grund] += 1
        nach_gruppe[wieder] += 1
        if len(beispiele[grund]) < 5:
            beispiele[grund].append({
                "symbol": (record["symbols"] or [None])[0],
                "cik": record["cik"],
                "form": record["latestForm"],
                "securityType": record["securityType"],
            })
    gesamt = len(records)
    mit_luecke = sum(nach_grund.values())
    return {
        "note": "Ein Grund je Titel, spezifischster zuerst. Keine Sammelkategorie "
                "'missing': sie beantwortet nicht, ob die Luecke unsere ist oder die "
                "der Quelle - und genau das entscheidet ueber einen zweiten Anbieter.",
        "criteria": {
            "sufficient": f"Factbook vorhanden, mindestens ein aufloesbarer Wert und "
                          f"mindestens {min_years} Jahre Jahreshistorie",
            "minAnnualYears": min_years,
            "youngListingYears": YOUNG_LISTING_YEARS,
        },
        "denominator": {"PRODUCT_TITLES": gesamt},
        "TITLES_WITH_SUFFICIENT_FUNDAMENTALS": gesamt - mit_luecke,
        "TITLES_WITH_GAP": mit_luecke,
        "byCause": [
            {"cause": cause, "count": count, "percent": _pct(count, gesamt),
             "recoverability": RECOVERABILITY[cause], "examples": beispiele[cause]}
            for cause, count in nach_grund.most_common()
        ],
        "byRecoverability": {
            SEC_RECOVERABLE: nach_gruppe[SEC_RECOVERABLE],
            EXTERNAL_PROVIDER_CANDIDATE: nach_gruppe[EXTERNAL_PROVIDER_CANDIDATE],
            RESOLVES_WITH_TIME: nach_gruppe[RESOLVES_WITH_TIME],
            BY_DESIGN: nach_gruppe[BY_DESIGN],
            REQUIRES_REVIEW: nach_gruppe[REQUIRES_REVIEW],
        },
        "mainGroups": {
            "note": "§7 verlangt zwei Hauptgruppen. Das sind diese beiden - und nur "
                    "sie tragen die Anbieterfrage.",
            SEC_RECOVERABLE: nach_gruppe[SEC_RECOVERABLE],
            EXTERNAL_PROVIDER_CANDIDATE: nach_gruppe[EXTERNAL_PROVIDER_CANDIDATE],
        },
        "recoverabilityNote":
            "REQUIRES_REVIEW ist keine dritte Meinung, sondern die Weigerung zu raten: "
            "Titel ohne CIK, deren Kuerzel auch die beiden SEC-Verzeichnisse nicht "
            "fuehren. Ob dort etwas liegt, ist von hier aus nicht entscheidbar. Sie in "
            "eine der beiden Hauptgruppen zu schieben hiesse, die Anbieterfrage per "
            "Rundung zu beantworten. RESOLVES_WITH_TIME und BY_DESIGN sind aus dem "
            "gleichen Grund eigene Zustaende: eine Notiz von 2026 hat keine drei "
            "Jahresabschluesse, und ein Vorzug meldet keinen eigenen - beides kann "
            "kein Anbieter liefern, und beides als Anbieterkandidat zu zaehlen wuerde "
            "den Einkauf begruenden, den diese Titel nicht brauchen.",
        "secTickerDirectory": {
            "present": sec_tickers is not None,
            "tickers": len(sec_tickers) if sec_tickers is not None else None,
            "role": "Beleg fuer IDENTITY_MAPPING_GAP: kennt das SEC-Verzeichnis das "
                    "Kuerzel, ist die fehlende CIK unsere Luecke und keine der Quelle.",
        },
        "providerDecision":
            "OFFEN. Die Trennung oben ist die Entscheidungsgrundlage und nicht die "
            "Entscheidung (§15). Solange die groesste Gruppe SEC_RECOVERABLE heisst, "
            "waere ein zugekaufter Anbieter Geld fuer Daten, die bereits bei der SEC "
            "liegen und nur nicht gemappt sind.",
    }


# §8. Die Rangfolge sagt, WAS ZUERST WEH TUT. Ein technisch gedeckter
# Titel ohne jede Geschaeftszahl ist teurer als einer, dem ein Jahr
# Historie fehlt: der erste faellt aus jedem Screening, der zweite nur
# aus dem langen Backtest.
PRIORITIES = (
    ("PRIORITY_1_TECHNICAL_WITHOUT_ANY_FUNDAMENTALS",
     "Technisch gedeckt, aber keinerlei Fundamentaldaten",
     lambda r: r["technicalState"] == "TECHNICAL_READY" and not r["fundamentals"]),
    ("PRIORITY_2_FUNDAMENTALS_WITHOUT_CORE_METRICS",
     "Fundamentaldaten vorhanden, aber zentrale Kennzahlen fehlen",
     lambda r: r["fundamentals"] and not all(
         r["metrics"].get(m) for m in ("revenue", "net_income", "total_assets"))),
    ("PRIORITY_3_HISTORY_TOO_SHORT",
     "Fundamentaldaten vorhanden, Historie zu kurz",
     lambda r: r["fundamentals"] and r["resolvedValues"] > 0 and r["annualYears"] < 3),
    ("PRIORITY_4_PIT_INSUFFICIENT",
     "Nicht zeitpunktgenau abfragbar",
     lambda r: r["fundamentals"] and r["pitState"] != PIT_READY),
    ("PRIORITY_5_EDGE_CASES",
     "Spezial- und Randfaelle",
     lambda r: r["securityType"] not in ("COMMON_STOCK", None) or r["eligibility"] != "ELIGIBLE"),
)


def priority_report(records):
    """§8. Gruppen sind NICHT disjunkt - ein Titel kann in mehreren stehen.

    Das ist Absicht: die Gruppen beantworten je eine eigene Frage
    ("welche Titel fallen aus dem Screening", "welche aus dem langen
    Backtest"). Sie zu Schnittmengen zu zwingen hiesse, einen Titel aus
    der zweiten Antwort zu streichen, weil er schon in der ersten stand.
    """
    gesamt = len(records)
    gruppen = []
    for key, beschreibung, pruefung in PRIORITIES:
        treffer = [r for r in records if pruefung(r)]
        ursachen = Counter(r.get("gapCause") for r in treffer if r.get("gapCause"))
        gruppen.append({
            "priority": key,
            "description": beschreibung,
            "COUNT": len(treffer),
            "PERCENT": _pct(len(treffer), gesamt),
            "TOP_CAUSES": [{"cause": c, "count": n} for c, n in ursachen.most_common(5)],
            "SEC_RECOVERABLE_COUNT": sum(
                1 for r in treffer if r.get("gapRecoverability") == SEC_RECOVERABLE),
            "EXTERNAL_PROVIDER_CANDIDATE_COUNT": sum(
                1 for r in treffer if r.get("gapRecoverability") == EXTERNAL_PROVIDER_CANDIDATE),
        })
    return {
        "note": "Die Gruppen ueberschneiden sich bewusst; jede beantwortet eine eigene "
                "Frage. Ihre Summe ist deshalb KEINE Titelzahl.",
        "denominator": {"PRODUCT_TITLES": gesamt},
        "groups": gruppen,
    }


# §10. Die 926 SEC_RECOVERABLE aufgeschluesselt: WODURCH entstehen sie?
#
# Die Gruppe zu kennen reicht nicht. Sie sagt, dass wir die Luecke
# schliessen koennen - nicht, welcher Normalisierungsblock den groessten
# Gewinn bringt. Diese Aufschluesselung ist die Reihenfolge der naechsten
# Arbeit, und sie wird gemessen statt vermutet.
SEC_SUBCAUSES = (
    "IFRS_OR_FOREIGN_TAXONOMY",
    "MISSING_CANONICAL_TAG_MAPPING",
    "ALTERNATIVE_XBRL_CONCEPT",
    "PERIOD_MAPPING",
    "ISSUER_MAPPING",
    "UNIT_OR_CURRENCY_NORMALIZATION",
    "OTHER_SEC_RECOVERABLE",
)

# Befundcode -> Normalisierungsblock. Die Codes kommen aus der
# Qualitaetspruefung der Ingestion und sind gemessen, nicht geraten.
FINDING_TO_SUBCAUSE = {
    "UNKNOWN_CONCEPT": "MISSING_CANONICAL_TAG_MAPPING",
    "CONCEPT_DISAGREEMENT": "ALTERNATIVE_XBRL_CONCEPT",
    "UNPLACEABLE_PERIOD": "PERIOD_MAPPING",
    "UNEXPECTED_DURATION": "PERIOD_MAPPING",
    "PERIOD_MISMATCH": "PERIOD_MAPPING",
    "UNIT_MISMATCH": "UNIT_OR_CURRENCY_NORMALIZATION",
}


def _subcause(record):
    """Welcher Normalisierungsblock schliesst DIESE Luecke?

    Auslaendische Taxonomie zuerst: bei einem 20-F-Einreicher ist
    UNKNOWN_CONCEPT kein fehlendes Mapping einzelner Konzepte, sondern
    eine ganze Taxonomie, die niemand gemappt hat. Wer das als
    Tag-Mapping fuehrt, schaetzt den Aufwand um Groessenordnungen falsch.
    """
    if record.get("gapCause") == FOREIGN_ISSUER:
        return "IFRS_OR_FOREIGN_TAXONOMY"
    if record.get("gapCause") == IDENTITY_MAPPING_GAP:
        return "ISSUER_MAPPING"
    if record.get("gapCause") == NO_SEC_COMPANY_FACTS:
        # CIK bekannt, Abruf steht aus. Kein Mapping-, ein Laufproblem.
        return "OTHER_SEC_RECOVERABLE"
    codes = record.get("findingCodes") or {}
    if codes:
        # Der haeufigste Befund dieses Emittenten entscheidet.
        haeufigster = max(codes.items(), key=lambda kv: kv[1])[0]
        return FINDING_TO_SUBCAUSE.get(haeufigster, "OTHER_SEC_RECOVERABLE")
    return "OTHER_SEC_RECOVERABLE"


def sec_recoverable_report(records):
    """§10. Nur messen, nicht reparieren."""
    betroffen = [r for r in records if r.get("gapRecoverability") == SEC_RECOVERABLE]
    nach_block = Counter()
    formen = defaultdict(Counter)
    beispiele = defaultdict(list)
    for record in betroffen:
        block = _subcause(record)
        record["secSubcause"] = block
        nach_block[block] += 1
        formen[block][record.get("latestForm") or "KEINE_EINREICHUNG"] += 1
        if len(beispiele[block]) < 5:
            beispiele[block].append({
                "symbol": (record["symbols"] or [None])[0],
                "cik": record["cik"],
                "form": record["latestForm"],
            })
    return {
        "note": "Wodurch entstehen die SEC_RECOVERABLE-Luecken? Die Reihenfolge hier ist "
                "die Reihenfolge der naechsten Arbeit - gemessen, nicht vermutet. "
                "NICHTS davon wurde repariert.",
        "denominator": {"SEC_RECOVERABLE": len(betroffen)},
        "byCause": [
            {"cause": block, "count": nach_block[block],
             "percent": _pct(nach_block[block], len(betroffen)),
             "formTypes": dict(formen[block].most_common(5)),
             "examples": beispiele[block]}
            for block in SEC_SUBCAUSES if nach_block[block]
        ],
        "largestBlock": max(nach_block.items(), key=lambda kv: kv[1])[0] if nach_block else None,
    }


# §11. Die echten externen Kandidaten - und die Frage, ob sie ueberhaupt
# historische Fundamentaldaten brauchen.
def external_candidate_report(records):
    """§11. Keine Anbieterauswahl, nur das Profil der Luecke."""
    betroffen = [r for r in records
                 if r.get("gapRecoverability") == EXTERNAL_PROVIDER_CANDIDATE]
    typen = Counter(r.get("securityType") or "UNBEKANNT" for r in betroffen)
    formen = Counter(r.get("latestForm") or "KEINE_EINREICHUNG" for r in betroffen)
    auslaendisch = sum(1 for r in betroffen if (r.get("latestForm") or "") in FOREIGN_FORMS)
    adr = sum(1 for r in betroffen if r.get("adrEvidence") == "adr")
    vorzuege = sum(1 for r in betroffen if r.get("securityType") not in ("COMMON_STOCK", None))

    # DIE ENTSCHEIDENDE UNTERSCHEIDUNG.
    #
    # Ein Titel mit Geschaeftszahlen, dem nur Jahre fehlen, braucht
    # TIEFERE HISTORIE. Ein Titel ganz ohne Zahlen braucht ueberhaupt
    # welche. Das sind zwei verschiedene Produkte und zwei verschiedene
    # Preise - sie in einer Zahl zu fuehren waere die Grundlage fuer den
    # falschen Vertrag.
    braucht_tiefe = sum(1 for r in betroffen
                        if r["fundamentals"] and r["resolvedValues"] > 0)
    braucht_ueberhaupt = len(betroffen) - braucht_tiefe

    return {
        "note": "Profil der Luecke, KEINE Anbieterauswahl (§11, §15).",
        "COUNT": len(betroffen),
        "ISSUER_TYPES": dict(typen.most_common()),
        "FORM_TYPES": dict(formen.most_common(8)),
        "FOREIGN_ISSUERS": auslaendisch,
        "ADR": adr,
        "PREFERRED_OR_SPECIAL_CLASSES": vorzuege,
        "OTHER": len(betroffen) - auslaendisch - vorzuege,
        "needs": {
            "DEEPER_HISTORICAL_FUNDAMENTALS": braucht_tiefe,
            "ANY_HISTORICAL_FUNDAMENTALS": braucht_ueberhaupt,
            "ESTIMATES_OR_FORWARD_OR_CONSENSUS": 0,
            "note": "Schaetzungen, Forward Metrics und Analystenkonsens schliessen KEINE "
                    "dieser Luecken - sie sind eine andere Faehigkeit, keine tiefere "
                    "Historie. Wer sie hier mitzaehlt, begruendet einen Einkauf mit "
                    "einer Zahl, die ihn nicht traegt. Ob Vision Universe sie will, "
                    "ist eine Produktfrage und steht hier bewusst auf 0.",
        },
        "providerDecision": "OFFEN (§15).",
    }


# ============================================================ §5 FEIN
#
# Jeder der SEC_RECOVERABLE-Faelle bekommt EINE belastbare Ursache aus
# dem Katalog - und eine Angabe, WORAN sie erkannt wurde. Eine
# Klassifikation ohne Beleg ist eine Vermutung mit Grossbuchstaben.
#
# Reihenfolge ist Absicht: strukturelle Gruende (kein Abschluss, weil
# es keinen gibt) vor technischen (Abschluss da, Mapping fehlt). Ein
# SPAC ohne Umsatz ist kein Mapping-Problem, und wer ihn so fuehrt,
# sucht anschliessend ein Konzept, das es nicht gibt.
FINE_CAUSES = (
    "SPAC_BLANK_CHECK", "SPECIAL_PURPOSE_ENTITY", "PRE_REVENUE_COMPANY",
    "MINING_EXPLORATION", "BANK", "INSURER", "ASSET_MANAGER", "REIT",
    "NO_OPERATING_REVENUE_BY_DESIGN", "BALANCE_SHEET_ONLY",
    "IFRS_REMAINING", "PERIOD_MAPPING", "UNIT_MAPPING", "CURRENCY_MAPPING",
    "ALTERNATIVE_US_GAAP_CONCEPT", "INDUSTRY_SPECIFIC_ACCOUNTING",
    "TRUE_MISSING_TAG_MAPPING", "ISSUER_MAPPING", "INSUFFICIENT_DISCLOSURE",
    "NOT_APPLICABLE", "REQUIRES_REVIEW", "EXTERNAL_DATA_REQUIRED",
)

# Was aus einer Feinursache folgt: schliesst sie ein Mapping (SEC), die
# Zeit, ein Anbieter - oder gar nichts, weil nichts fehlt?
FINE_TO_RECOVERABILITY = {
    "SPAC_BLANK_CHECK": "NOT_APPLICABLE",
    "SPECIAL_PURPOSE_ENTITY": "NOT_APPLICABLE",
    "NO_OPERATING_REVENUE_BY_DESIGN": "NOT_APPLICABLE",
    "NOT_APPLICABLE": "NOT_APPLICABLE",
    "PRE_REVENUE_COMPANY": "NOT_APPLICABLE",
    "MINING_EXPLORATION": "NOT_APPLICABLE",
    "BANK": "INDUSTRY_LAYER", "INSURER": "INDUSTRY_LAYER",
    "ASSET_MANAGER": "INDUSTRY_LAYER", "REIT": "INDUSTRY_LAYER",
    "INDUSTRY_SPECIFIC_ACCOUNTING": "INDUSTRY_LAYER",
    "BALANCE_SHEET_ONLY": "SEC_RECOVERABLE",
    "IFRS_REMAINING": "SEC_RECOVERABLE", "PERIOD_MAPPING": "SEC_RECOVERABLE",
    "UNIT_MAPPING": "SEC_RECOVERABLE", "CURRENCY_MAPPING": "SEC_RECOVERABLE",
    "ALTERNATIVE_US_GAAP_CONCEPT": "SEC_RECOVERABLE",
    "TRUE_MISSING_TAG_MAPPING": "SEC_RECOVERABLE", "ISSUER_MAPPING": "SEC_RECOVERABLE",
    "INSUFFICIENT_DISCLOSURE": "REQUIRES_REVIEW", "REQUIRES_REVIEW": "REQUIRES_REVIEW",
    "EXTERNAL_DATA_REQUIRED": "EXTERNAL_PROVIDER_CANDIDATE",
}

SIC_BANK = {"6021", "6022", "6029", "6035", "6036", "6099", "6111", "6141", "6153", "6159", "6162", "6163"}
SIC_INSURER = {"6311", "6321", "6324", "6331", "6351", "6361", "6399", "6411"}
SIC_ASSET_MANAGER = {"6211", "6282", "6221"}
SIC_REIT = {"6798"}
SIC_SPAC = {"6770"}
SIC_BIOTECH = {"2834", "2835", "2836", "8731"}
SIC_MINING = {"1000", "1040", "1090", "1220", "1221", "1311", "1381", "1382", "1400"}
SIC_SOFTWARE_SHELL = {"7372", "7370", "7371", "7373", "7374"}

_FUND_NAME = re.compile(
    r"\b(fund|trust|income co|capital corp|municipal|term trust|credit co|bdc)\b", re.I)
_SPAC_NAME = re.compile(r"\b(acquisition|blank check|spac|merger corp)\b", re.I)


def fine_cause(record):
    """Die Feinursache eines SEC_RECOVERABLE-Falls, mit Beleg.

    Gibt (ursache, beleg) zurueck. Der Beleg nennt das Merkmal, an dem
    entschieden wurde - SIC, Formular, Befundcode, Name -, damit jede
    Zuordnung nachpruefbar ist und keine nur plausibel klingt.
    """
    fund = record.get("_fund") or {}
    sic = str(fund.get("sic") or "")
    name = fund.get("name") or ""
    form = record.get("latestForm")
    codes = record.get("findingCodes") or {}
    hat_werte = record.get("resolvedValues", 0) > 0
    metrics = record.get("metrics") or {}
    has = lambda m: bool(metrics.get(m))

    # 1. Kein Factbook: der Abruf steht aus oder ist gescheitert.
    if not record.get("fundamentals"):
        return "REQUIRES_REVIEW", "kein Factbook (Fehlerschlange / Abruf ausstehend)"

    # 2. Strukturen, die keinen operativen Abschluss haben - bevor
    #    irgendjemand nach einem Umsatz-Tag sucht.
    if sic in SIC_SPAC or (not hat_werte and _SPAC_NAME.search(name)):
        return "SPAC_BLANK_CHECK", f"SIC {sic or '-'} / Name '{name[:40]}'"
    if not sic and _FUND_NAME.search(name) and not hat_werte:
        return "SPECIAL_PURPOSE_ENTITY", f"Investmentgesellschaft ohne SIC, Name '{name[:40]}'"
    if form in ("N-CSR", "N-CSRS", "N-Q", "N-PORT"):
        return "SPECIAL_PURPOSE_ENTITY", f"Formular {form}"

    # 3. Branchen, deren Kernkennzahlen anders heissen. Sie sind hier
    #    nur, wenn NICHTS aufloest - eine Bank mit Nettoergebnis steht
    #    laengst nicht mehr in SEC_RECOVERABLE.
    if sic in SIC_BANK:
        return "BANK", f"SIC {sic}"
    if sic in SIC_INSURER:
        return "INSURER", f"SIC {sic}"
    if sic in SIC_ASSET_MANAGER:
        return "ASSET_MANAGER", f"SIC {sic}"
    if sic in SIC_REIT:
        return "REIT", f"SIC {sic}"

    # 4. Vorumsatzlich: kein Umsatz ist hier der Normalfall, nicht die
    #    Luecke. Bleibt der Emittent OHNE JEDEN Wert, fehlt trotzdem
    #    etwas - dann ist es Bilanz oder Cashflow, nicht Umsatz.
    if sic in SIC_BIOTECH:
        return ("PRE_REVENUE_COMPANY", f"SIC {sic}") if hat_werte or has("total_assets") \
            else ("BALANCE_SHEET_ONLY", f"SIC {sic}, keine aufloesbare Bilanz")
    if sic in SIC_MINING:
        return ("MINING_EXPLORATION", f"SIC {sic}") if hat_werte or has("total_assets") \
            else ("BALANCE_SHEET_ONLY", f"SIC {sic}, keine aufloesbare Bilanz")

    # 5. Technische Gruende, in der Reihenfolge ihrer Eindeutigkeit.
    #
    # Die Periode ZUERST. Nachgesehen an den 16 vermeintlichen
    # IFRS-Resten: 15 von 16 sind 20-F-Einreicher mit NULL unbekannten
    # Konzepten und UNPLACEABLE_PERIOD - die Taxonomie ist gemappt, der
    # Kalender findet die Periode nicht. Wer das als IFRS fuehrt, sucht
    # ein Konzept, das laengst da ist.
    perioden = (codes.get("UNPLACEABLE_PERIOD", 0) + codes.get("UNEXPECTED_DURATION", 0)
                + codes.get("PERIOD_MISMATCH", 0))
    if perioden and not codes.get("UNKNOWN_CONCEPT"):
        return "PERIOD_MAPPING", (f"UNPLACEABLE_PERIOD={codes.get('UNPLACEABLE_PERIOD', 0)}, "
                                  f"Formular {form or '-'}, keine unbekannten Konzepte")
    if codes.get("UNIT_MISMATCH"):
        return "UNIT_MAPPING", f"UNIT_MISMATCH={codes['UNIT_MISMATCH']}"
    if form in FOREIGN_FORMS:
        if not codes and not hat_werte:
            # Ein einziges 20-F, kein Befund, kein Wert: die Fakten kamen
            # gar nicht erst an - oder nur dei-Deckblattangaben. Erst der
            # Blick in den Speicher sagt, welches. Nicht raten.
            return "INSUFFICIENT_DISCLOSURE", f"Formular {form}, weder Befund noch Wert"
        return "IFRS_REMAINING", f"Formular {form}, UNKNOWN_CONCEPT={codes.get('UNKNOWN_CONCEPT', 0)}"
    if codes.get("CONCEPT_DISAGREEMENT"):
        return "ALTERNATIVE_US_GAAP_CONCEPT", f"CONCEPT_DISAGREEMENT={codes['CONCEPT_DISAGREEMENT']}"
    if not form:
        return "INSUFFICIENT_DISCLOSURE", "keine periodische Einreichung im Factbook"
    if codes.get("UNKNOWN_CONCEPT") and sic in SIC_SOFTWARE_SHELL and not hat_werte:
        # Ein "Software"-Titel ohne einen einzigen aufloesbaren Wert
        # ist in aller Regel ein Mantel mit SIC 737x. Nicht raten:
        # zur Pruefung, mit Beleg.
        return "REQUIRES_REVIEW", f"SIC {sic} ohne jeden Wert, UNKNOWN_CONCEPT={codes['UNKNOWN_CONCEPT']}"
    if codes.get("UNKNOWN_CONCEPT"):
        return "TRUE_MISSING_TAG_MAPPING", f"UNKNOWN_CONCEPT={codes['UNKNOWN_CONCEPT']}, SIC {sic or '-'}"
    return "REQUIRES_REVIEW", "kein eindeutiges Merkmal"


def fine_classification_report(records):
    """§5: jeder Fall accounted for. Keine Restgruppe ohne Grund."""
    betroffen = [r for r in records if r.get("gapRecoverability") == SEC_RECOVERABLE]
    nach_ursache = Counter()
    nach_folge = Counter()
    beispiele = defaultdict(list)
    for r in betroffen:
        ursache, beleg = fine_cause(r)
        r["fineCause"], r["fineEvidence"] = ursache, beleg
        nach_ursache[ursache] += 1
        nach_folge[FINE_TO_RECOVERABILITY[ursache]] += 1
        if len(beispiele[ursache]) < 4:
            beispiele[ursache].append({"symbol": (r["symbols"] or [None])[0], "cik": r["cik"],
                                       "evidence": beleg})
    unbelegt = [r for r in betroffen if r.get("fineCause") not in FINE_CAUSES]
    return {
        "note": "Jeder SEC_RECOVERABLE-Fall traegt EINE Feinursache und den Beleg, an dem "
                "sie erkannt wurde. NOT_APPLICABLE heisst: die Kennzahl existiert fuer "
                "diese Struktur nicht - ein SPAC hat keinen Umsatz, ein geschlossener "
                "Fonds keinen operativen Abschluss. Das ist keine Luecke, die jemand "
                "schliesst, weder wir noch ein Anbieter.",
        "denominator": {"SEC_RECOVERABLE": len(betroffen)},
        "accountedFor": len(betroffen) - len(unbelegt),
        "unaccounted": len(unbelegt),
        "byCause": [
            {"cause": c, "count": nach_ursache[c], "percent": _pct(nach_ursache[c], len(betroffen)),
             "consequence": FINE_TO_RECOVERABILITY[c], "examples": beispiele[c]}
            for c in FINE_CAUSES if nach_ursache[c]
        ],
        "byConsequence": dict(nach_folge),
        "stillRecoverableBySec": sum(n for c, n in nach_ursache.items()
                                     if FINE_TO_RECOVERABILITY[c] == "SEC_RECOVERABLE"),
        # Die vollstaendigen Listen, damit ein Messlauf GENAU diese
        # Emittenten anschauen kann - nicht die Stichprobe oben.
        "ciksByCause": {c: sorted(r["cik"] for r in betroffen if r.get("fineCause") == c and r["cik"])
                        for c in FINE_CAUSES if nach_ursache[c]},
        "ciksStillRecoverable": sorted(
            r["cik"] for r in betroffen
            if FINE_TO_RECOVERABILITY.get(r.get("fineCause")) == "SEC_RECOVERABLE" and r["cik"]),
    }


def backtest_report(records):
    """§9. Was ist wirklich backtestfaehig - und ab welcher Tiefe?

    KEIN LOOK-AHEAD.

    Ein Titel zaehlt hier nur dann als PIT-faehig, wenn JEDER seiner
    aufgeloesten Werte ein Veroeffentlichungsdatum und eine Einreichung
    traegt (`PIT_READY`). Damit laesst sich zu jedem historischen
    Zeitpunkt sagen, was an diesem Tag oeffentlich war - und eine
    spaetere Korrektur bleibt draussen.

    Der bequeme Fehler waere, den heutigen Wert einer Kennzahl fuer das
    Jahr zu nehmen, aus dem er stammt. Er ist heute vielleicht
    restated; wer so rechnet, handelt im Backtest mit Zahlen, die es
    zum Handelszeitpunkt nicht gab, und bekommt Ergebnisse, die sich
    live nie einstellen.

    GEMESSEN: BEIDE ZAHLEN SIND GLEICH - UND DAS IST KEIN FEHLER.

    Der erste Entwurf dieses Moduls behauptete hier, PIT_READY muesse
    stets kleiner sein, und Gleichheit sei ein Hinweis auf einen Bug.
    Nachgezaehlt: von 4.627 Emittenten mit mindestens einem aufloesbaren
    Wert sind 4.627 PIT_READY, PIT_PARTIAL ist 0. Der Grund liegt in der
    Quelle: XBRL-Fakten der SEC tragen `accn` und `filed` IMMER. Wer
    einen Wert hat, hat auch sein Datum.

    Die Pruefung ist deshalb nicht ueberfluessig - sie wuerde eine Quelle
    ohne Einreichungsmetadaten sofort sichtbar machen, und genau das ist
    bei einem spaeteren zweiten Anbieter die erste Frage. Sie ist hier
    nur folgenlos.

    WAS DIESE ZAHL NICHT SAGT: dass ein Backtest frei von Look-Ahead
    IST. Sie sagt, dass die Daten alles tragen, was noetig waere, um ihn
    frei davon zu RECHNEN - Datum und Einreichung je Wert. Ob eine
    Abfrage das nutzt, entscheidet ihre Restatement-Politik
    (POLICY_AS_OF_LATEST gegen POLICY_LATEST_KNOWN), und die gehoert der
    Engine, nicht diesem Bericht.
    """
    gesamt = len(records)
    preis = [r for r in records if r["priceHistory"]]
    preis_tech = [r for r in preis if r["technicalState"] == "TECHNICAL_READY"]
    preis_fund = [r for r in preis_tech if r["fundamentals"] and r["resolvedValues"] > 0]
    pit_fund = [r for r in preis_fund if r["pitState"] == PIT_READY]

    def tiefe(jahre):
        return sum(1 for r in pit_fund if r["annualYears"] >= jahre)

    return {
        "note": "Keine neue Backtesting-Engine, nur die Messung der Datenbasis. "
                "Jede Stufe ist eine ECHTE Teilmenge der vorigen.",
        "definitions": {
            "BACKTEST_PRICE_READY": "Kurshistorie belegt",
            "BACKTEST_PRICE_TECHNICAL_READY": "zusaetzlich technisch auswertbar",
            "BACKTEST_PRICE_FUNDAMENTAL_READY": "zusaetzlich mindestens ein aufloesbarer "
                                                "Fundamentalwert",
            "BACKTEST_PIT_FUNDAMENTAL_READY": "zusaetzlich jeder Wert datierbar - kein "
                                              "Look-Ahead, keine rueckwirkend "
                                              "eingespielten Restatements",
        },
        "denominator": {"PRODUCT_TITLES": gesamt},
        "BACKTEST_PRICE_READY": len(preis),
        "BACKTEST_PRICE_TECHNICAL_READY": len(preis_tech),
        "BACKTEST_PRICE_FUNDAMENTAL_READY": len(preis_fund),
        "BACKTEST_PIT_FUNDAMENTAL_READY": len(pit_fund),
        "BACKTEST_5Y_READY": tiefe(5),
        "BACKTEST_10Y_READY": tiefe(10),
        "BACKTEST_15Y_READY": tiefe(15),
        "percentOfProductUniverse": {
            "BACKTEST_PRICE_READY": _pct(len(preis), gesamt),
            "BACKTEST_PIT_FUNDAMENTAL_READY": _pct(len(pit_fund), gesamt),
            "BACKTEST_10Y_READY": _pct(tiefe(10), gesamt),
        },
        "lookAheadControl": {
            "rule": "PIT_READY verlangt Veroeffentlichungsdatum UND Akzessionsnummer "
                    "fuer JEDEN aufgeloesten Wert.",
            "measured": "PIT_PARTIAL ist 0: XBRL-Fakten der SEC tragen accn und filed "
                        "immer. BACKTEST_PIT_FUNDAMENTAL_READY faellt deshalb mit "
                        "BACKTEST_PRICE_FUNDAMENTAL_READY zusammen - eine Eigenschaft "
                        "der Quelle, kein Rechenfehler.",
            "doesNotClaim": "Dass ein Backtest look-ahead-frei IST. Nur, dass die Daten "
                            "tragen, was noetig waere, ihn so zu rechnen. Ob eine "
                            "Abfrage das nutzt, entscheidet ihre Restatement-Politik.",
            "survivorshipFreeUniverse": False,
            "survivorshipNote": "SEC/EDGAR fuehrt keinen Delisting-Ereignisfeed. Ein "
                                "Backtest auf diesem Universum traegt Survivorship Bias, "
                                "und das ist eine Eigenschaft der Quelle, keine "
                                "Einstellung.",
        },
    }


# §10. Die Zustaende, in denen ein Fundamentalwert stehen kann. VALID und
# WARNING kommen aus der Wertqualitaet, die uebrigen aus den Befunden der
# Normalisierung - beides wird gezaehlt, nichts geschaetzt.
QUALITY_STATES = ("VALID", "WARNING", "AMBIGUOUS", "MISSING", "UNAVAILABLE",
                  "RESTATED", "NON_COMPARABLE")

# Die interne Stufe, die "unbeanstandet" heisst. Sie steht hier als
# Konstante, damit ein Umbenennen der Stufe nicht stillschweigend jeden
# Wert zu WARNING macht.
QUALITY_HIGH_LABEL = "HIGH"

# Befundcode -> Qualitaetszustand. Was hier nicht steht, zaehlt als
# WARNING: ein unbekannter Befund ist ein Hinweis, kein Freispruch.
FINDING_TO_STATE = {
    "UNKNOWN_CONCEPT": "MISSING",
    "UNPLACEABLE_PERIOD": "AMBIGUOUS",
    "UNEXPECTED_DURATION": "NON_COMPARABLE",
    "PERIOD_MISMATCH": "NON_COMPARABLE",
    "UNIT_MISMATCH": "NON_COMPARABLE",
    "CONCEPT_DISAGREEMENT": "AMBIGUOUS",
    "RESTATEMENT_CONFLICT": "RESTATED",
    "FUTURE_DATA_LEAK": "AMBIGUOUS",
}


def quality_report(records, fundamentals):
    """§10. Qualitaet in ZWEI Verteilungen, nicht einer.

    Der erste Entwurf addierte beide in einen Topf und meldete 49,6
    Millionen MISSING gegen 1,6 Millionen VALID. Das sah nach einer
    Katastrophe aus und war ein Kategorienfehler:

      - VALID/WARNING zaehlen AUFGELOESTE WERTE - das, was am Ende in
        einer Kennzahl steht. Davon gibt es rund 1,8 Millionen.
      - Die Befundcodes zaehlen ROHE XBRL-FAKTEN. Ein Emittent meldet
        Tausende Konzepte, von denen die Registry die meisten gar nicht
        braucht; UNKNOWN_CONCEPT heisst "nicht gemappt", nicht "kaputt".

    Beide Zahlen sind richtig, ihre Summe ist es nicht. Sie stehen
    deshalb getrennt, jede mit ihrem eigenen Nenner.
    """
    werte = Counter()
    for row in fundamentals.values():
        for stufe, anzahl in (row.get("quality") or {}).items():
            werte["VALID" if stufe == QUALITY_HIGH_LABEL else "WARNING"] += anzahl

    befunde = Counter()
    befund_zustaende = Counter()
    for row in fundamentals.values():
        for code, anzahl in ((row.get("qualitySummary") or {}).get("by_code") or {}).items():
            befunde[code] += anzahl
            befund_zustaende[FINDING_TO_STATE.get(code, "WARNING")] += anzahl

    mit_werten = [r for r in fundamentals.values()
                  if (r.get("pit") or {}).get("resolvedValues", 0) > 0]
    fehlquote = []
    for metric in REPORT_METRICS:
        fehlt = sum(1 for r in mit_werten
                    if (r.get("metrics") or {}).get(metric, {}).get("annualPeriods", 0) == 0)
        fehlquote.append({
            "metric": metric,
            "MISSING_COUNT": fehlt,
            "MISSING_RATE": _pct(fehlt, len(mit_werten)),
        })
    fehlquote.sort(key=lambda row: -(row["MISSING_RATE"] or 0))

    # Titelebene: das ist die Zahl, die eine Oberflaeche braucht.
    #
    # §12, strikt getrennt: MISSING heisst "sollte da sein und loest
    # nicht auf"; NOT_APPLICABLE heisst "existiert fuer diese Struktur
    # nicht". Ein SPAC ohne Umsatz und ein geschlossener Fonds ohne
    # operativen Abschluss sind das zweite. Sie als MISSING zu fuehren
    # hiesse, eine Luecke zu behaupten, die niemand schliessen kann -
    # und die Oberflaeche zeigte "keine Daten", wo "hier gibt es keine"
    # die Wahrheit ist.
    titel = Counter()
    for record in records:
        folge = FINE_TO_RECOVERABILITY.get(record.get("fineCause"))
        if not record["fundamentals"]:
            titel["UNAVAILABLE"] += 1
        elif record["resolvedValues"] == 0 and folge == "NOT_APPLICABLE":
            titel["NOT_APPLICABLE"] += 1
        elif record["resolvedValues"] == 0 and folge == "REQUIRES_REVIEW":
            titel["REQUIRES_REVIEW"] += 1
        elif record["resolvedValues"] == 0:
            titel["MISSING"] += 1
        elif record["annualYears"] < 3:
            titel["PARTIAL"] += 1
        else:
            titel["AVAILABLE"] += 1

    return {
        "note": "Drei Ebenen, drei Nenner. Sie duerfen NICHT addiert werden - die erste "
                "zaehlt aufgeloeste Werte, die zweite rohe XBRL-Fakten, die dritte Titel.",
        "values": {
            "denominator": {"RESOLVED_VALUES": sum(werte.values()),
                            "ISSUERS_WITH_VALUES": len(mit_werten)},
            "byState": {"VALID": werte.get("VALID", 0), "WARNING": werte.get("WARNING", 0)},
            "note": "Zustand je aufgeloestem Wert. VALID entspricht der internen Stufe "
                    "HIGH, WARNING der Stufe MEDIUM.",
        },
        "findings": {
            "denominator": {"RAW_XBRL_FACTS_WITH_FINDING": sum(befunde.values())},
            "byState": {state: befund_zustaende.get(state, 0)
                        for state in ("AMBIGUOUS", "RESTATED", "NON_COMPARABLE",
                                      "MISSING", "WARNING")},
            "byCode": dict(befunde.most_common()),
            "note": "Befunde je ROHEM Fakt. UNKNOWN_CONCEPT heisst 'von der Registry "
                    "nicht gemappt' und nicht 'fehlerhaft' - ein Emittent meldet "
                    "Tausende Konzepte, von denen die wenigsten gebraucht werden.",
        },
        "titles": {
            "denominator": {"PRODUCT_TITLES": len(records)},
            "byState": {state: titel.get(state, 0)
                        for state in ("AVAILABLE", "PARTIAL", "MISSING", "NOT_APPLICABLE",
                                      "REQUIRES_REVIEW", "UNAVAILABLE")},
            "note": "AVAILABLE = mindestens drei Jahre aufloesbare Historie. PARTIAL = Werte, "
                    "aber kuerzer. MISSING = Einreichungen vorhanden, kein aufloesbarer Wert, "
                    "und die Struktur muesste welche haben. NOT_APPLICABLE = die Kennzahlen "
                    "existieren fuer diese Struktur nicht (SPAC, geschlossener Fonds). "
                    "REQUIRES_REVIEW = nicht belastbar einzuordnen. UNAVAILABLE = kein Factbook.",
        },
        "metricsByMissingRate": fehlquote,
        "highestMissingRate": fehlquote[0] if fehlquote else None,
    }


def build_reconciliation(root, registry=None, today=None, min_years=3):
    """Alle Berichte des Abgleichs aus §3 bis §10.

    Gibt ein Woerterbuch {dateiname: nutzlast} zurueck. Der Aufrufer
    entscheidet, wohin geschrieben wird - dieses Modul schreibt nichts.
    """
    registry = registry or MetricRegistry.load()
    members = load_product_members(root)
    fundamentals = load_issuer_fundamentals(root)

    # Der Faktenspeicher ist gitignored. Wo er fehlt, tragen die
    # ausgelieferten kanonischen Buendel die Antwort - sonst meldete ein
    # frischer Checkout null Emittenten und der Abgleich waere leer.
    for cik, bundle in load_canonical_bundles(root).items():
        key = "iss_cik_" + cik
        if key not in fundamentals:
            fundamentals[key] = dict(issuer_from_canonical_bundle(bundle, cik),
                                     issuerId=key)

    market = load_market_capability(root)
    records = join_members(members, fundamentals, market)

    stamp = version_stamp(registry.version)
    sec_tickers = load_sec_ticker_directory(root)
    gaps = gap_report(records, today=today, min_years=min_years,
                      sec_tickers=sec_tickers)                     # setzt gapCause
    payloads = {
        "reconciliation.json": {
            "versions": stamp,
            "note": "Abgleich der Fundamentalschicht mit dem Marktdaten-/Technical-"
                    "Universum. Marktdaten werden READ-ONLY konsumiert (§1).",
            "marketCapabilityPresent": market is not None,
            "overlap": overlap_report(records, market),
            "coreMetrics": core_metric_report(records),
            "history": history_report(records),
        },
        "gap-classification.json": dict(gaps, versions=stamp,
                                        priorities=priority_report(records)),
        "backtest-readiness.json": dict(backtest_report(records), versions=stamp),
        "sec-recoverable-causes.json": dict(sec_recoverable_report(records),
                                            versions=stamp),
        "sec-recoverable-fine.json": dict(fine_classification_report(records),
                                          versions=stamp),
        "external-provider-candidates.json": dict(external_candidate_report(records),
                                                  versions=stamp),
        "fundamental-quality.json": dict(quality_report(records, fundamentals),
                                         versions=stamp),
    }
    return payloads, records
