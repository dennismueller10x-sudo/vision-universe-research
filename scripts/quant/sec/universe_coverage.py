"""Gemessene Fundamental-Coverage gegen das Produktuniversum — §11, §12, §13, §14.

Die Frage, die dieses Modul beantwortet, ist nicht "haben wir
Fundamentaldaten", sondern:

    Fuer wie viele der 7.004 Produkttitel, und wie weit zurueck?

Der Unterschied ist der ganze Punkt. Eine Pipeline, die fuenf Emittenten
vollstaendig abdeckt, sieht in jedem Bericht ueber sich selbst
hervorragend aus. Erst der Abgleich mit dem Universum macht sichtbar,
dass 6.999 fehlen.

DREI REGELN

  1. Gezaehlt wird gegen den EMITTENTEN, nicht gegen das Papier (§15).
     Zwei Aktienklassen teilen sich eine Fundamentalhistorie.
  2. Was nicht gemessen wurde, ist null - nicht 0 (§19).
  3. Keine Kennzahl wird als abgedeckt gezaehlt, deren Wert nicht
     aufloesbar ist. "Die Zeitreihe existiert" ist keine Deckung.
"""
import json
import logging
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

LOGGER = logging.getLogger("vu.sec.universe_coverage")

from .coverage import CORE_METRICS
from .model import PERIOD_ANNUAL, QUALITY_HIGH, QUALITY_LOW, QUALITY_MEDIUM
from .registry import MetricRegistry
from .restatements import POLICY_LATEST_KNOWN
from .version import version_stamp

# Die Kennzahlen, ueber die §11 einzeln berichtet. Sie sind das Minimum,
# aus dem sich Bewertung, Wachstum, Qualitaet und Cashflow-Analyse bauen
# lassen - nicht die vollstaendige Registry.
REPORT_METRICS = (
    "revenue", "net_income", "eps_diluted", "operating_cash_flow",
    "capital_expenditures", "free_cash_flow", "total_assets", "total_debt",
    "stockholders_equity",
)

# Historische Tiefen aus §12.
DEPTH_YEARS = (1, 3, 5, 10, 15)

QUALITY_STATES = (QUALITY_HIGH, QUALITY_MEDIUM, QUALITY_LOW)


def _read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _shard_files(directory, key):
    if not directory.exists():
        return []
    out = []
    for path in sorted(directory.glob("*.json")):
        payload = _read_json(path)
        out.extend(payload.get(key) or [])
    return out


def load_universe(root):
    """Produktuniversum, Emittenten und CIK-Bilanz aus dem Company Master."""
    base = Path(root) / "quant" / "data" / "universe"
    instruments = _shard_files(base / "instruments", "instruments")
    issuers = _shard_files(base / "issuers", "issuers")
    resolution = (_read_json(base / "cik-resolution.json")
                  if (base / "cik-resolution.json").exists() else None)
    capabilities = (_read_json(base / "capability-summary.json")
                    if (base / "capability-summary.json").exists() else None)
    coverage = (_read_json(base / "coverage-report.json")
                if (base / "coverage-report.json").exists() else None)
    return {"instruments": instruments, "issuers": issuers, "resolution": resolution,
            "capabilities": capabilities, "masterCoverage": coverage,
            "present": bool(instruments)}


IN_PRODUCT = {"ELIGIBLE", "SEPARATE_CLASS", "REVIEW"}


def product_members(instruments):
    """Mitglieder des Produktuniversums, nach Mitglied und nicht nach Listing."""
    members = {}
    for row in instruments:
        if row.get("productEligibility") not in IN_PRODUCT:
            continue
        member = row.get("masterMemberId") or row.get("instrumentId")
        entry = members.setdefault(member, {
            "memberId": member, "tickers": set(), "instrumentIds": set(),
            "issuerId": None, "cik": None, "eligibility": row.get("productEligibility"),
        })
        entry["tickers"].add(row.get("symbol"))
        entry["instrumentIds"].add(row.get("instrumentId"))
        if row.get("issuerId") and not entry["issuerId"]:
            entry["issuerId"] = row["issuerId"]
            entry["cik"] = row.get("cik")
    return members


def _resolve_history(resolver, years, metric, annual=True, as_of=None):
    """Aufloesbare Perioden einer Kennzahl, aelteste zuerst.

    Gezaehlt wird ueber den PeriodResolver und nicht ueber die rohen
    Zeitreihen. Der Unterschied ist §8: die Rohdaten fuehren Q1, YTD2,
    YTD3 und FY, weil Emittenten Quartale kumuliert melden. Wer diese
    Schluessel zaehlt, zaehlt Meldungen - nicht vergleichbare Perioden.

    Eine Periode ohne aufloesbaren Wert zaehlt NICHT. Sonst waere jede
    leere Huelle eine Deckung.
    """
    as_of = as_of or date.today()
    rows = []
    for fiscal_year in years:
        if fiscal_year is None:
            continue
        if annual:
            fact = resolver.annual(metric, fiscal_year, as_of, policy=POLICY_LATEST_KNOWN)
            if fact is not None and fact.available and fact.value is not None:
                rows.append((fiscal_year, "FY", fact.period_end,
                             getattr(fact, "quality", None)))
            continue
        for index in (1, 2, 3, 4):
            fact = resolver.quarter(metric, fiscal_year, index, as_of,
                                    policy=POLICY_LATEST_KNOWN)
            if fact is not None and fact.available and fact.value is not None:
                rows.append((fiscal_year, f"Q{index}", fact.period_end,
                             getattr(fact, "quality", None)))
    rows.sort(key=lambda row: (row[0] or 0, row[1] or ""))
    return rows


def _history_years(rows):
    dates = [row[2] for row in rows if row[2]]
    if len(dates) < 2:
        return 0.0 if not dates else 0.0
    first, last = min(dates), max(dates)
    try:
        return round((int(last[:4]) - int(first[:4])) + (int(last[5:7]) - int(first[5:7])) / 12.0, 2)
    except (TypeError, ValueError):
        return None


def issuer_fundamentals(document, registry):
    """Fundamentalbilanz eines Emittenten aus seinem gespeicherten Factbook."""
    from .periods import PeriodResolver
    from .pipeline import _rehydrate

    factbook = _rehydrate(document)
    resolver = PeriodResolver(factbook, registry)
    profile = document.get("profile") or {}

    # Die Geschaeftsjahre EINMAL je Emittent indizieren statt je Kennzahl
    # ueber alle Zeitreihen zu scannen. Bei 3.000 Zeitreihen und
    # elf Kennzahlen sind das 33.000 Schluesselvergleiche je Emittent,
    # mal 5.437 Emittenten.
    jahre_je_metrik = defaultdict(set)
    for (name, fiscal_year, _fiscal_period) in factbook.timelines:
        if fiscal_year is not None:
            jahre_je_metrik[name].add(fiscal_year)
    per_metric = {}
    annual_ends, quarterly_ends = set(), set()
    quality = Counter()

    for metric in sorted(set(REPORT_METRICS) | set(CORE_METRICS)):
        jahre = sorted(jahre_je_metrik.get(metric, ()))
        annual = _resolve_history(resolver, jahre, metric, annual=True)
        quarterly = _resolve_history(resolver, jahre, metric, annual=False)
        for row in annual:
            if row[2]:
                annual_ends.add(row[2])
        for row in quarterly:
            if row[2]:
                quarterly_ends.add(row[2])
        for row in annual + quarterly:
            if row[3]:
                quality[row[3]] += 1
        per_metric[metric] = {
            "annualPeriods": len(annual),
            "quarterlyPeriods": len(quarterly),
            "firstAvailablePeriod": annual[0][2] if annual else None,
            "lastAvailablePeriod": annual[-1][2] if annual else None,
            "historyYears": _history_years(annual),
        }

    pit = document.get("quality", {}).get("summary", {}) or {}
    return {
        "cik": document.get("cik"),
        "name": profile.get("name"),
        "sic": profile.get("sic"),
        "fiscalYearEnd": profile.get("fiscal_year_end"),
        "tickers": profile.get("tickers") or [],
        "status": "INGESTED",
        "annualPeriods": len(annual_ends),
        "quarterlyPeriods": len(quarterly_ends),
        "firstPeriodEnd": min(annual_ends | quarterly_ends) if (annual_ends | quarterly_ends) else None,
        "lastPeriodEnd": max(annual_ends | quarterly_ends) if (annual_ends | quarterly_ends) else None,
        "historyYears": _history_years([(None, None, d, None) for d in sorted(annual_ends)]),
        "metrics": per_metric,
        "quality": dict(quality),
        "qualitySummary": pit,
        "latestFiling": document.get("latest_filing"),
        "versions": document.get("versions"),
        "sourceDigest": document.get("raw_companyfacts_sha256"),
    }


# Kanonische Kennzahl-Kennung -> Name in der SEC-Registry. Die
# ausgelieferten Buendel unter quant/data/sec/canonical/ fuehren die
# camelCase-Kennung des Produktschemas; der Coverage-Bericht rechnet in
# Registry-Namen. Ohne diese Zuordnung zaehlte der Bericht die
# ausgelieferten Zahlen schlicht nicht mit.
CANONICAL_TO_REGISTRY = {
    "revenue": "revenue", "grossProfit": "gross_profit", "ebitda": "ebitda",
    "operatingIncome": "operating_income", "netIncome": "net_income",
    "freeCashFlow": "free_cash_flow", "totalAssets": "total_assets",
    "totalEquity": "stockholders_equity", "netDebt": "net_debt",
    "investedCapital": "invested_capital", "capex": "capital_expenditures",
    "interestExpense": "interest_expense", "sharesOutstanding": "shares_outstanding",
    "accruals": "accruals",
}


def issuer_from_canonical_bundle(bundle, cik):
    """Fundamentalbilanz aus einem AUSGELIEFERTEN kanonischen Buendel.

    Der Faktenspeicher ist gitignored - auf einem frischen Checkout ist er
    leer, und der Bericht wuerde null Emittenten melden, obwohl fuer fuenf
    von ihnen die Geschaeftszahlen im Repository liegen. Diese Quelle
    macht den Unterschied zwischen "nicht vorhanden" und "nicht in der
    Arbeitsablage" sichtbar; sie traegt deshalb einen eigenen Status.
    """
    security = bundle.get("security") or {}
    facts = bundle.get("facts") or []
    per_metric = {}
    annual_ends, quarterly_ends = set(), set()

    nach_metrik = defaultdict(list)
    for fact in facts:
        name = CANONICAL_TO_REGISTRY.get(fact.get("metricId"))
        if not name or fact.get("value") is None:
            continue
        nach_metrik[name].append(fact)

    for metric in sorted(set(REPORT_METRICS) | set(CORE_METRICS)):
        rows = nach_metrik.get(metric, [])
        annual = sorted({f.get("periodEnd") for f in rows
                         if f.get("fiscalPeriod") == "FY" and f.get("periodEnd")})
        quarterly = sorted({f.get("periodEnd") for f in rows
                            if f.get("fiscalPeriod") != "FY" and f.get("periodEnd")})
        # Die ausgelieferten Buendel fuehren bewusst nur Quartale (eine
        # Jahreszeile kollidiert im Produktschema mit Q4). Die
        # Jahrestiefe wird deshalb aus den Quartalsenden gelesen - nicht
        # geschaetzt und nicht mit vier multipliziert.
        basis = annual or quarterly
        per_metric[metric] = {
            "annualPeriods": len(annual) or len({d[:4] for d in quarterly}),
            "quarterlyPeriods": len(quarterly),
            "firstAvailablePeriod": basis[0] if basis else None,
            "lastAvailablePeriod": basis[-1] if basis else None,
            "historyYears": _history_years([(None, None, d, None) for d in basis]),
        }
        annual_ends |= set(annual)
        quarterly_ends |= set(quarterly)

    alle = annual_ends | quarterly_ends
    return {
        "cik": cik,
        "name": security.get("name"),
        "sic": None,
        "fiscalYearEnd": None,
        "tickers": [security.get("ticker")] if security.get("ticker") else [],
        "status": "DELIVERED_CANONICAL",
        "statusNote": "Aus dem ausgelieferten kanonischen Buendel gelesen "
                      "(quant/data/sec/canonical/), nicht aus dem Faktenspeicher.",
        "annualPeriods": len({d[:4] for d in alle}),
        "quarterlyPeriods": len(quarterly_ends),
        "firstPeriodEnd": min(alle) if alle else None,
        "lastPeriodEnd": max(alle) if alle else None,
        "historyYears": _history_years([(None, None, d, None) for d in sorted(alle)]),
        "metrics": per_metric,
        "quality": {},
        "qualitySummary": {},
        "latestFiling": None,
        "versions": bundle.get("versions"),
        "sourceDigest": None,
    }


def load_canonical_bundles(root):
    """Die ausgelieferten kanonischen Buendel, nach CIK."""
    base = Path(root) / "quant" / "data" / "sec" / "canonical"
    index_path = Path(root) / "quant" / "data" / "sec" / "canonical_index.json"
    if not base.exists():
        return {}
    ticker_to_cik = {}
    if index_path.exists():
        for row in (_read_json(index_path).get("companies") or []):
            if row.get("ticker") and row.get("cik"):
                ticker_to_cik[row["ticker"]] = str(row["cik"]).zfill(10)
    out = {}
    for path in sorted(base.glob("*.json")):
        bundle = _read_json(path)
        ticker = (bundle.get("security") or {}).get("ticker") or path.stem
        cik = ticker_to_cik.get(ticker)
        if not cik:
            continue
        out[cik] = bundle
    return out


def _depth_buckets(values, depths=DEPTH_YEARS):
    """Wie viele Emittenten erreichen welche Tiefe? Kumulativ und gezaehlt."""
    out = {}
    for depth in depths:
        out[f">={depth}y"] = sum(1 for v in values if v is not None and v >= depth)
    return out


def build_reports(root, documents, registry=None, universe=None, progress_every=0):
    """Die vier Berichte aus §11 bis §14, plus der Gap Report aus §20.

    `documents` darf ein GENERATOR sein und sollte bei einem vollen
    Universum auch einer sein: gehalten wird nur die Bilanz je Emittent,
    nie zwei Factbooks gleichzeitig. Ein einzelnes erreicht 17 MB, alle
    zusammen sprengen den Arbeitsspeicher - genau daran ist der zweite
    Produktivlauf gestorben, nachdem der Ingest 76 Minuten lang
    funktioniert hatte.
    """
    registry = registry or MetricRegistry.load()
    universe = universe or load_universe(root)

    members = product_members(universe["instruments"])
    issuers_in_master = {row["issuerId"]: row for row in universe["issuers"]}

    per_issuer = {}
    gelesen = 0
    for document in documents:
        cik = str(document.get("cik")).zfill(10)
        per_issuer["iss_cik_" + cik] = issuer_fundamentals(document, registry)
        # Das Dokument wird hier nicht mehr gebraucht. Die Referenz
        # loeschen, damit der naechste Durchlauf sie nicht neben seiner
        # eigenen haelt.
        document = None
        gelesen += 1
        if progress_every and gelesen % progress_every == 0:
            LOGGER.info("coverage: %d Emittenten ausgewertet", gelesen)
    if progress_every:
        LOGGER.info("coverage: %d Emittenten ausgewertet (fertig)", gelesen)

    # Der Faktenspeicher ist gitignored. Was im Repository liegt, sind die
    # kanonischen Buendel - fuer sie gilt dieselbe Frage, und sie werden
    # nur dort gelesen, wo der Speicher nichts hat.
    for cik, bundle in load_canonical_bundles(root).items():
        key = "iss_cik_" + cik
        if key in per_issuer:
            continue
        per_issuer[key] = issuer_from_canonical_bundle(bundle, cik)

    # --------------------------------------------------------- §11 Coverage
    product_issuers = {m["issuerId"] for m in members.values() if m["issuerId"]}
    members_without_issuer = [m for m in members.values() if not m["issuerId"]]

    covered_issuers = {i for i in product_issuers if i in per_issuer}
    metric_counts = {}
    for metric in REPORT_METRICS:
        covered = [i for i in covered_issuers
                   if per_issuer[i]["metrics"].get(metric, {}).get("annualPeriods", 0) > 0]
        metric_counts[metric] = {
            "COUNT": len(covered),
            "PERCENT_OF_PRODUCT_UNIVERSE": round(100.0 * len(covered) / len(members), 4)
            if members else None,
        }

    resolution = universe.get("resolution") or {}
    resolution_totals = resolution.get("totals") or {}

    coverage = {
        "generatedAtUtc": None,
        "versions": version_stamp(registry.version),
        "note": "Gezaehlt gegen das Produktuniversum, nicht gegen die ingestierten "
                "Emittenten. Ein Nenner aus dem eigenen Bestand wuerde jede Luecke "
                "wegdefinieren (§19).",
        "universe": {
            "PRODUCT_TITLES": len(members),
            "PRODUCT_ISSUERS": len(product_issuers),
            "PRODUCT_TITLES_WITHOUT_ISSUER": len(members_without_issuer),
            "MASTER_ISSUERS": len(issuers_in_master),
        },
        "identity": {
            "CIK_RESOLVED": resolution_totals.get("CIK_RESOLVED"),
            "CIK_UNRESOLVED": resolution_totals.get("CIK_UNRESOLVED"),
            "CIK_AMBIGUOUS": resolution_totals.get("CIK_AMBIGUOUS"),
        },
        "fundamentals": {
            "COMPANY_FACTS_AVAILABLE": len(covered_issuers),
            "COMPANY_FACTS_UNAVAILABLE": len(product_issuers) - len(covered_issuers),
            "ISSUERS_INGESTED_TOTAL": len(per_issuer),
            "ISSUERS_INGESTED_OUTSIDE_PRODUCT_UNIVERSE":
                len([i for i in per_issuer if i not in product_issuers]),
            "BY_SOURCE": dict(Counter(row["status"] for row in per_issuer.values())),
        },
        "metrics": metric_counts,
    }

    # ----------------------------------------------------- §12 Historie
    annual_depth = _depth_buckets(
        [per_issuer[i]["metrics"].get("revenue", {}).get("historyYears") for i in covered_issuers])
    quarterly_depth_values = []
    for i in covered_issuers:
        q = per_issuer[i]["metrics"].get("revenue", {})
        quarterly_depth_values.append(
            (q.get("quarterlyPeriods") or 0) / 4.0 if q.get("quarterlyPeriods") else None)

    history = {
        "versions": version_stamp(registry.version),
        "note": "Tiefe je Kennzahl, gemessen an aufloesbaren Perioden. Eine Zeitreihe "
                "ohne aufloesbaren Wert zaehlt nicht - sonst waere jede leere Huelle "
                "eine Deckung.",
        "denominator": {"PRODUCT_TITLES": len(members),
                        "ISSUERS_WITH_FUNDAMENTALS": len(covered_issuers)},
        "annual": {metric: _depth_buckets(
            [per_issuer[i]["metrics"].get(metric, {}).get("historyYears") for i in covered_issuers])
            for metric in REPORT_METRICS},
        "annualOverall": annual_depth,
        "quarterlyOverall": _depth_buckets(quarterly_depth_values),
        "perIssuerSample": sorted(
            [{"issuerId": i, "cik": per_issuer[i]["cik"], "name": per_issuer[i]["name"],
              "annualPeriods": per_issuer[i]["annualPeriods"],
              "quarterlyPeriods": per_issuer[i]["quarterlyPeriods"],
              "firstPeriodEnd": per_issuer[i]["firstPeriodEnd"],
              "lastPeriodEnd": per_issuer[i]["lastPeriodEnd"],
              "historyYears": per_issuer[i]["historyYears"]}
             for i in covered_issuers], key=lambda row: row["issuerId"])[:200],
    }

    # ------------------------------------------------------- §13 Overlap
    caps = (universe.get("capabilities") or {}).get("counts") or {}
    technical_members = set()
    for row in universe["instruments"]:
        if row.get("productEligibility") not in IN_PRODUCT:
            continue
        member = row.get("masterMemberId") or row.get("instrumentId")
        technical_members.add(member) if row.get("_technical") else None

    # Technische Deckung kommt aus der Faehigkeitsbilanz des Masters: sie
    # zaehlt Instrumente, nicht Mitglieder. Beides steht nebeneinander,
    # damit niemand die eine Zahl fuer die andere haelt.
    technical_instruments = (caps.get("HAS_PRICE_HISTORY") or {})
    fundamental_members = {m["memberId"] for m in members.values()
                           if m["issuerId"] in covered_issuers}

    overlap = {
        "versions": version_stamp(registry.version),
        "note": "Das langfristige Ziel ist TECHNICAL_WITHOUT_FUNDAMENTALS gegen null. "
                "Die Zahl steht hier, damit sie sinkt und nicht behauptet wird.",
        "denominator": {"PRODUCT_TITLES": len(members)},

        # DIE KANONISCHE MARKTDATENDECKUNG KOMMT NICHT AUS DIESEM WORKSTREAM.
        #
        # Sie liegt im R2-Workstream und ist dort abgenommen. Was dieser
        # Bericht aus den Gate-Laeufen ableiten kann, ist etwas anderes und
        # kleiner: die Gate-Laeufe endeten vor der Erweiterung des
        # Wertpapierstamms. Diese Ableitung als Marktdatendeckung
        # auszugeben waere eine Falschaussage ueber einen fremden
        # Bestand - deshalb steht sie unter `fromGateRuns` und nicht unter
        # `TECHNICAL_COVERED`.
        "marketDataSource": {
            "status": "NOT_CONNECTED",
            "canonicalOwner": "R2-Workstream (quant/data/market/history)",
            "accepted": {
                "PRODUCT_TITLES": 7004,
                "R2_SERIES_AVAILABLE": 7802,
                "HISTORICAL_CHART_AVAILABLE": 6997,
                "HISTORICAL_CHART_AVAILABLE_PERCENT": 99.90,
            },
            "note": "Uebernommene Kennzahlen des abgenommenen R2-Stands. Dieser "
                    "Workstream liest sie NICHT ein und rechnet nicht mit ihnen - "
                    "sie stehen hier als benannte Fremdquelle, damit niemand die "
                    "Gate-Ableitung unten fuer die Marktdatendeckung haelt.",
        },
        "fromGateRuns": {
            "instrumentsWithProviderPriceHistory": technical_instruments.get("PROVIDER_VERIFIED"),
            "instrumentsWithDeliveredPriceHistory": technical_instruments.get("DELIVERED"),
            "note": "Aus den Tiingo-Gate-Laeufen abgeleitet, auf INSTRUMENTENEBENE. "
                    "Die Gate-Laeufe endeten vor der Erweiterung des Wertpapierstamms; "
                    "diese Zahl ist keine Marktdatendeckung und darf nicht als solche "
                    "verwendet werden.",
        },

        "TECHNICAL_COVERED": None,
        "FUNDAMENTAL_COVERED": len(fundamental_members),
        "TECHNICAL_AND_FUNDAMENTAL": None,
        "TECHNICAL_WITHOUT_FUNDAMENTALS": None,
        "FUNDAMENTALS_WITHOUT_TECHNICAL": None,
        "unmeasured": "Der Overlap wird erst berechnet, wenn die kanonische "
                      "Marktdaten-/R2-Quelle in diesen Workstream eingebunden ist. "
                      "Bis dahin waere jede Zahl hier eine Verrechnung zweier "
                      "verschiedener Bestaende auf zwei verschiedenen Ebenen "
                      "(Instrument gegen Mitglied).",
    }

    # ----------------------------------------------------- §14 Datenqualitaet
    quality = Counter()
    for row in per_issuer.values():
        for state, count in (row.get("quality") or {}).items():
            quality[state] += count
    quality_report = {
        "versions": version_stamp(registry.version),
        "note": "Zustaende je aufgeloestem Wert. Ein Emittent ohne Zahlen erzeugt "
                "keine Zustaende - er erzeugt eine Luecke, und die steht im "
                "Coverage-Bericht.",
        "byState": dict(quality),
        "issuersWithFindings": len([r for r in per_issuer.values()
                                    if (r.get("qualitySummary") or {}).get("findings")]),
    }

    # -------------------------------------------------------- §20 Gap Report
    unresolved_by_eligibility = (resolution.get("unresolvedByEligibility") or {})
    gaps = {
        "versions": version_stamp(registry.version),
        "note": "Vor jeder Providerentscheidung: was fehlt, warum, und ob die SEC es "
                "grundsaetzlich liefern kann (§20).",
        "byCause": [
            {"cause": "CIK_UNRESOLVED",
             "count": resolution_totals.get("CIK_UNRESOLVED"),
             "byEligibility": unresolved_by_eligibility,
             "secCanSupply": "TEILWEISE",
             "detail": "Die SEC fuehrt jeden US-Einreicher. Was hier fehlt, ist der "
                       "Abruf ihrer beiden Verzeichnisse - nicht die Daten."},
            {"cause": "CIK_AMBIGUOUS",
             "count": resolution_totals.get("CIK_AMBIGUOUS"),
             "secCanSupply": "JA",
             "detail": "Aufloesbar ueber die Einreichungsuebersicht je Kandidat. "
                       "Eine Vorrangregel waere Raten."},
            {"cause": "NOT_INGESTED",
             "count": len(product_issuers) - len(covered_issuers),
             "secCanSupply": "JA",
             "detail": "Emittenten mit CIK, fuer die noch kein Abruf lief."},
            {"cause": "FOREIGN_PRIVATE_ISSUER",
             "count": None,
             "secCanSupply": "EINGESCHRAENKT",
             "detail": "20-F und 40-F sind gefuehrt, aber IFRS-Taxonomien sind nicht "
                       "auf die Registry gemappt. Messbar erst nach dem Abruf."},
            {"cause": "NO_SEC_FILER",
             "count": None,
             "secCanSupply": "NEIN",
             "detail": "ADRs ohne eigene Einreichung und auslaendische Emittenten ohne "
                       "US-Registrierung. Fuer sie braeuchte es eine zweite Quelle - "
                       "die Entscheidung darueber faellt erst, wenn die Zahl gemessen ist."},
        ],
        "providerDecision": "OFFEN. Keine Empfehlung, solange die Zahlen oben null sind: "
                            "eine Providerentscheidung auf ungemessenen Luecken waere eine "
                            "Ausgabe auf Verdacht (§20, §32).",
    }

    return {"coverage": coverage, "history": history, "overlap": overlap,
            "quality": quality_report, "gaps": gaps, "perIssuer": per_issuer,
            "members": len(members)}
