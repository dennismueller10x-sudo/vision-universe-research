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
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

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


def _resolve_history(resolver, factbook, metric, annual=True, as_of=None):
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
    for fiscal_year in factbook.fiscal_years(metric):
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
    per_metric = {}
    annual_ends, quarterly_ends = set(), set()
    quality = Counter()

    for metric in sorted(set(REPORT_METRICS) | set(CORE_METRICS)):
        annual = _resolve_history(resolver, factbook, metric, annual=True)
        quarterly = _resolve_history(resolver, factbook, metric, annual=False)
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


def _depth_buckets(values, depths=DEPTH_YEARS):
    """Wie viele Emittenten erreichen welche Tiefe? Kumulativ und gezaehlt."""
    out = {}
    for depth in depths:
        out[f">={depth}y"] = sum(1 for v in values if v is not None and v >= depth)
    return out


def build_reports(root, documents, registry=None, universe=None):
    """Die vier Berichte aus §11 bis §14, plus der Gap Report aus §20."""
    registry = registry or MetricRegistry.load()
    universe = universe or load_universe(root)

    members = product_members(universe["instruments"])
    issuers_in_master = {row["issuerId"]: row for row in universe["issuers"]}

    per_issuer = {}
    for document in documents:
        cik = str(document.get("cik")).zfill(10)
        per_issuer["iss_cik_" + cik] = issuer_fundamentals(document, registry)

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
        "TECHNICAL_COVERED_INSTRUMENTS": technical_instruments.get("PROVIDER_VERIFIED"),
        "TECHNICAL_DELIVERED_INSTRUMENTS": technical_instruments.get("DELIVERED"),
        "FUNDAMENTAL_COVERED": len(fundamental_members),
        "TECHNICAL_AND_FUNDAMENTAL": None,
        "TECHNICAL_WITHOUT_FUNDAMENTALS": None,
        "FUNDAMENTALS_WITHOUT_TECHNICAL": None,
        "unmeasured": "Die Ueberschneidung je Titel braucht die technische Deckung "
                      "auf Mitgliedsebene. Sie liegt heute nur als Instrumentenzahl "
                      "vor; die Zuordnung entsteht mit dem naechsten Kurslauf.",
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
