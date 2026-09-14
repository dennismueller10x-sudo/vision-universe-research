"""Consumer fundamentals: the compact, committable per-company slice.

The canonical layer (canonical.py) is quarterly-only and carries the whole
history with provenance for a backtester - roughly half a megabyte per
company. The consumer experience (Discover, stock detail) needs something
else: for ~6,000 companies a few kilobytes each, with ANNUAL, QUARTERLY and
TTM kept strictly apart, point-in-time correct, and every value traceable to
the filing it came from.

This module reuses the existing pipeline end to end - RawFact iteration,
FiscalCalendar, normalize_company, PeriodResolver, derived.reconstruct - and
only changes what is WRITTEN. It is not a second pipeline. Nothing here
estimates, fills or interpolates: a metric a company never reported is
absent, not zero.

Point-in-time semantics in bulk mode: companyfacts.zip carries the filing
date of every fact but not the acceptance timestamp, so availability is
resolved at filing-DATE granularity (never earlier than the filing). The
bundle says so (``availability``).
"""
import json
import logging
from datetime import date, datetime, timezone

from .derived import reconstruct
from .fiscal import FiscalCalendar
from .normalize import normalize_company
from .periods import PeriodResolver
from .provider import PERIODIC_FORMS, SECProvider, normalize_cik
from .registry import KIND_INSTANT
from .restatements import POLICY_AS_OF_LATEST
from .version import version_stamp

LOGGER = logging.getLogger("vu.sec.consumer")

SCHEMA = "vu-consumer-fundamentals-1.0.0"

# Registry metrics the consumer layer publishes (what a company reports).
REPORTED_METRICS = (
    "revenue", "gross_profit", "operating_income", "net_income", "eps_diluted",
    "operating_cash_flow", "capital_expenditures", "cash_and_equivalents",
    "total_debt", "long_term_debt", "total_assets", "stockholders_equity",
    "shares_outstanding", "diluted_weighted_average_shares",
    "research_and_development", "dividends_paid", "stock_based_compensation",
)
# Derived by derived.reconstruct (deterministic, with the inputs' provenance).
DERIVED_METRICS = ("free_cash_flow", "net_debt")
CONSUMER_METRICS = REPORTED_METRICS + DERIVED_METRICS

# Metrics that get a quarterly and a TTM series (the rest is annual only:
# a balance-sheet instant has no TTM, and the product reads it annually).
QUARTERLY_METRICS = ("revenue", "gross_profit", "operating_income", "net_income", "eps_diluted",
                     "operating_cash_flow", "capital_expenditures", "free_cash_flow",
                     "cash_and_equivalents", "total_debt", "shares_outstanding")

DEFAULT_ANNUAL_YEARS = 13     # ten comparisons need eleven COMPLETE fiscal years;
                              # the factbook's last one or two are usually partial
                              # (quarters only), so the window carries a buffer
DEFAULT_QUARTERS = 8


def _utcnow():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# Row layout of every series (a legend travels in the bundle):
#   [fiscalYear, fiscalPeriod, periodEnd, value, filedDate, accession, derivedFlag]
ROW_COLUMNS = ["fy", "fp", "end", "v", "filed", "accn", "derived"]


def _row(fact, derived=False):
    """One compact observation: value plus the filing it came from."""
    prov = getattr(fact, "provenance", None)
    filed = getattr(prov, "filed", None)
    accession = getattr(prov, "accession", None)
    return [fact.fiscal_year, fact.fiscal_period, fact.period_end, fact.value,
            str(filed)[:10] if filed else None, accession, 1 if derived else 0]


def rowdict(row):
    return dict(zip(ROW_COLUMNS, row))


def _facts_for_period(resolver, registry, fiscal_year, fiscal_period, as_of, policy):
    """{metric: NormalizedFact} for one period: reported metrics + derived."""
    out = {}
    for metric in REPORTED_METRICS:
        if registry.get(metric) is None:
            continue
        if fiscal_period == "FY":
            fact = resolver.annual(metric, fiscal_year, as_of, policy=policy)
        else:
            fact = resolver.quarter(metric, fiscal_year, int(fiscal_period[1]), as_of, policy=policy)
        if fact.available:
            out[metric] = (fact, False)
    derived = reconstruct(resolver, fiscal_year, fiscal_period, as_of, policy=policy)
    for metric in DERIVED_METRICS + ("gross_profit", "total_debt"):
        fact = derived.get(metric)
        if fact is not None and fact.available and metric not in out:
            out[metric] = (fact, True)
    return out


def _ttm(resolver, registry, as_of, policy):
    """TTM (duration metrics) / latest instant (balance-sheet metrics)."""
    out = {}
    through = None
    for metric in QUARTERLY_METRICS:
        if metric in DERIVED_METRICS:
            continue
        fact = resolver.ttm(metric, as_of, policy=policy)
        if not fact.available:
            continue
        row = rowdict(_row(fact))
        row.pop("fy", None); row.pop("derived", None)
        tag = next((f for f in (fact.flags or []) if f.startswith("TTM_THROUGH")), None)
        if tag:
            row["through"] = tag.replace("TTM_THROUGH_", "")
            through = through or row["through"]
        definition = resolver._definition(metric)
        row["kind"] = "INSTANT" if definition is not None and definition.kind == KIND_INSTANT else "TTM"
        row["unit"] = fact.unit
        out[metric] = row
    # Derived TTM only from complete TTM inputs - never a mix of periods.
    if "operating_cash_flow" in out and "capital_expenditures" in out \
            and out["operating_cash_flow"].get("through") == out["capital_expenditures"].get("through"):
        ocf, capex = out["operating_cash_flow"], out["capital_expenditures"]
        out["free_cash_flow"] = {"fp": "TTM", "end": ocf["end"], "v": ocf["v"] - capex["v"], "unit": ocf["unit"],
                                 "through": ocf.get("through"), "kind": "TTM", "derived": True,
                                 "inputs": ["operating_cash_flow", "capital_expenditures"]}
    if "total_debt" in out and "cash_and_equivalents" in out:
        debt, cash = out["total_debt"], out["cash_and_equivalents"]
        out["net_debt"] = {"fp": "LATEST", "end": debt["end"], "v": debt["v"] - cash["v"], "unit": debt["unit"],
                           "kind": "INSTANT", "derived": True, "inputs": ["total_debt", "cash_and_equivalents"]}
    return out, through


def _horizons(annual_revenue_rows):
    """Which comparison horizons the ANNUAL revenue series supports."""
    years = sorted({r[0] for r in annual_revenue_rows})
    if not years:
        return {"3y": False, "5y": False, "10y": False, "latest": None, "first": None, "count": 0}
    latest = years[-1]
    have = set(years)
    return {
        "3y": (latest - 3) in have, "5y": (latest - 5) in have, "10y": (latest - 10) in have,
        "latest": latest, "first": years[0], "count": len(years),
    }


def build_consumer_bundle(cik, company_facts, registry, as_of=None, tickers=(), security_ids=(),
                          name=None, fiscal_year_end_hint=None, annual_years=DEFAULT_ANNUAL_YEARS,
                          quarters=DEFAULT_QUARTERS, policy=POLICY_AS_OF_LATEST, provider=None):
    """The compact consumer bundle for one company from a companyfacts payload."""
    cik = normalize_cik(cik)
    provider = provider or SECProvider.__new__(SECProvider)   # iter_raw_facts needs no client
    as_of_text = str(as_of or date.today())
    raw_facts = list(SECProvider.iter_raw_facts(provider, company_facts, availability={},
                                                forms=PERIODIC_FORMS))
    if not raw_facts:
        return None
    calendar = FiscalCalendar.from_raw_facts(cik, raw_facts, fiscal_year_end_hint=fiscal_year_end_hint)
    result = normalize_company(cik, raw_facts, registry, profile=None, filing_metadata=None,
                               calendar=calendar)
    factbook = result.factbook
    resolver = PeriodResolver(factbook, registry)

    years = factbook.fiscal_years()
    annual_scope = years[-annual_years:] if years else []
    annual = {}
    units = {}
    for fiscal_year in annual_scope:
        for metric, (fact, derived) in _facts_for_period(resolver, registry, fiscal_year, "FY",
                                                         as_of_text, policy).items():
            annual.setdefault(metric, []).append(_row(fact, derived))
            units.setdefault(metric, fact.unit)

    quarterly = {}
    # Newest first, then stop after `quarters` standalone quarters per metric.
    quarter_slots = []
    for fiscal_year in reversed(years):
        for index in (4, 3, 2, 1):
            quarter_slots.append((fiscal_year, index))
        if len(quarter_slots) >= quarters * 2:
            break
    for fiscal_year, index in quarter_slots:
        period = _facts_for_period(resolver, registry, fiscal_year, f"Q{index}", as_of_text, policy)
        for metric, (fact, derived) in period.items():
            if metric not in QUARTERLY_METRICS:
                continue
            rows = quarterly.setdefault(metric, [])
            if len(rows) < quarters:
                rows.append(_row(fact, derived))
                units.setdefault(metric, fact.unit)
    for metric in list(quarterly):
        quarterly[metric] = list(reversed(quarterly[metric]))     # oldest first, like annual

    ttm, ttm_through = _ttm(resolver, registry, as_of_text, policy)

    revenue_annual = annual.get("revenue", [])
    latest_annual = max((rowdict(r) for rows in annual.values() for r in rows), key=lambda r: (r["fy"], r["end"]), default=None)
    latest_quarter = max((rowdict(r) for rows in quarterly.values() for r in rows),
                         key=lambda r: (r["fy"], r["fp"], r["end"]), default=None)
    coverage = {
        "annualYears": annual_scope,
        "annualMetrics": {m: len(rows) for m, rows in annual.items()},
        "quarterlyMetrics": {m: len(rows) for m, rows in quarterly.items()},
        "ttmMetrics": sorted(ttm.keys()),
        "ttmThrough": ttm_through,
        "horizons": _horizons(revenue_annual),
        "latestAnnual": {"fy": latest_annual["fy"], "end": latest_annual["end"], "filed": latest_annual.get("filed")}
                        if latest_annual else None,
        "latestQuarter": {"fy": latest_quarter["fy"], "fp": latest_quarter["fp"], "end": latest_quarter["end"],
                          "filed": latest_quarter.get("filed")} if latest_quarter else None,
        "rawFacts": result.stats.get("raw_facts"), "mapped": result.stats.get("mapped"),
    }
    return {
        "schema": SCHEMA,
        "generatedAtUtc": _utcnow(),
        "versions": version_stamp(registry.version),
        "dataSource": {"dataSourceId": "ds_sec_edgar_v1", "provider": "sec_edgar",
                       "dataset": "companyfacts_xbrl_bulk", "isMock": False,
                       "licenseStatus": "public_domain", "pitCapable": True},
        "cik": cik, "name": name, "tickers": list(tickers), "securityIds": list(security_ids),
        "asOf": as_of_text, "policy": policy,
        "availability": "filing-date granularity (bulk companyfacts carries filed, not acceptance time); "
                        "a value is never visible before its filing date",
        "calendar": {"fiscalYearEnd": calendar.to_dict().get("fiscal_year_end_hint") or fiscal_year_end_hint,
                     "weekBased": calendar.to_dict().get("week_based"),
                     "latestFiscalYearEnd": (calendar.to_dict().get("fiscal_years") or [{}])[-1].get("period_end")},
        "columns": ROW_COLUMNS,
        "units": units,
        "semantics": {"annual": "fiscal-year figures (FY) - 10-K, or four standalone quarters summed",
                      "quarterly": "standalone quarters (YTD de-accumulated), newest last",
                      "ttm": "sum of the four most recent standalone quarters; instants = latest balance sheet"},
        "coverage": coverage,
        "annual": annual,
        "quarterly": quarterly,
        "ttm": ttm,
    }


# ---------------------------------------------------------------- universe run

def load_product_universe_ciks(names_file):
    """Product-universe titles with a CIK from the canonical name layer.

    Returns {cik: {"tickers": [...], "securityIds": [...], "name": str}}.
    The CIK came from the SEC ticker map keyed by ticker + exchange
    (build-company-names.mjs) - the only identity we accept here.
    """
    from pathlib import Path
    payload = json.loads(Path(names_file).read_text(encoding="utf-8"))
    by_cik = {}
    without = []
    for row in payload.get("rows", []):
        if not row.get("inProductUniverse"):
            continue
        cik = row.get("cik")
        if not cik:
            without.append(row["ticker"])
            continue
        cik = normalize_cik(cik)
        entry = by_cik.setdefault(cik, {"tickers": [], "securityIds": [], "name": None})
        entry["tickers"].append(row["ticker"])
        entry["securityIds"].append(row["securityId"])
        entry["name"] = entry["name"] or row.get("companyName")
    return by_cik, without


def summarize_bundle(bundle):
    cov = bundle["coverage"]
    h = cov["horizons"]
    return {
        "cik": bundle["cik"], "tickers": bundle["tickers"], "securityIds": bundle["securityIds"],
        "name": bundle["name"],
        "annualYears": len(cov["annualYears"]),
        "firstAnnualYear": h.get("first"), "latestAnnualYear": h.get("latest"),
        "quarterly": max(cov["quarterlyMetrics"].values(), default=0),
        "ttm": bool(cov["ttmMetrics"]),
        "h3": h["3y"], "h5": h["5y"], "h10": h["10y"],
        "latestAnnual": cov["latestAnnual"], "latestQuarter": cov["latestQuarter"],
        "metrics": sorted(set(cov["annualMetrics"]) | set(cov["quarterlyMetrics"]) | set(cov["ttmMetrics"])),
    }


def aggregate_coverage(index_rows, product_count, cik_mapped, without_cik, unmatched_in_zip):
    """The measured grid the mission asks for (section 15)."""
    def count(pred):
        return sum(1 for r in index_rows if pred(r))
    per_metric = {}
    for m in CONSUMER_METRICS:
        per_metric[m] = {
            "annual": count(lambda r, m=m: m in r["metricsAnnual"]),
            "quarterly": count(lambda r, m=m: m in r["metricsQuarterly"]),
            "ttm": count(lambda r, m=m: m in r["metricsTtm"]),
        }
    return {
        "productUniverse": product_count,
        "cikMapped": cik_mapped,
        "withoutCik": len(without_cik),
        "secAvailable": len(index_rows),
        "notInCompanyFacts": len(unmatched_in_zip),
        "annualHistory": count(lambda r: r["annualYears"] >= 1),
        "quarterlyHistory": count(lambda r: r["quarterly"] >= 1),
        "ttmPossible": count(lambda r: r["ttm"]),
        "latestFundamentals": count(lambda r: r["latestAnnual"] is not None or r["latestQuarter"] is not None),
        "history3y": count(lambda r: r["h3"]),
        "history5y": count(lambda r: r["h5"]),
        "history10y": count(lambda r: r["h10"]),
        "perMetric": per_metric,
    }
