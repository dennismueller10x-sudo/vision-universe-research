"""Historical coverage matrix.

The question this answers is the one that decides whether SEC data is usable for
a quant backtest at all: from which year onward can we actually reconstruct
fundamentals, per company?

Four honest states per (company, fiscal year):

  STRUCTURED   the core metrics are present as native XBRL facts
  DERIVABLE    not all native, but reconstructible from what is there
               (quarters from year-to-date, full year from four quarters,
                gross profit from revenue minus cost of revenue)
  FILING_ONLY  the company filed a periodic report that year, but it carries no
               usable structured data - the numbers exist only in the document
  MISSING      no periodic filing found for that year

The matrix is computed from real ingested data. It is never hand-written.
"""
from .model import PERIOD_ANNUAL
from .periods import PeriodResolver
from .registry import KIND_INSTANT
from .restatements import POLICY_LATEST_KNOWN

STRUCTURED = "STRUCTURED"
DERIVABLE = "DERIVABLE"
FILING_ONLY = "FILING_ONLY"
MISSING = "MISSING"

# The metrics a fundamental backtest cannot do without.
CORE_METRICS = ("revenue", "net_income", "operating_cash_flow",
                "total_assets", "stockholders_equity")

STRUCTURED_THRESHOLD = 0.8
DERIVABLE_THRESHOLD = 0.6


def company_coverage(document, registry, factbook=None, core_metrics=CORE_METRICS):
    """Per-fiscal-year coverage for one company."""
    from .pipeline import _rehydrate

    factbook = factbook if factbook is not None else _rehydrate(document)
    resolver = PeriodResolver(factbook, registry)
    filing_years = document.get("filing_years") or {}

    years = factbook.fiscal_years()
    rows = {}
    for fiscal_year in years:
        native = 0
        resolvable = 0
        detail = {}
        for metric in core_metrics:
            timeline = factbook.get(metric, fiscal_year, "FY")
            has_native = timeline is not None and len(timeline) > 0
            fact = resolver.annual(metric, fiscal_year, None, policy=POLICY_LATEST_KNOWN)
            if has_native:
                native += 1
            if fact.available:
                resolvable += 1
            detail[metric] = {
                "native": bool(has_native),
                "resolvable": bool(fact.available),
                "reason": None if fact.available else fact.reason,
            }
        total = len(core_metrics)
        native_share = native / total
        resolvable_share = resolvable / total
        if native_share >= STRUCTURED_THRESHOLD:
            status = STRUCTURED
        elif resolvable_share >= DERIVABLE_THRESHOLD:
            status = DERIVABLE
        elif str(fiscal_year) in filing_years:
            status = FILING_ONLY
        else:
            status = MISSING
        rows[fiscal_year] = {
            "status": status,
            "native_core_metrics": native,
            "resolvable_core_metrics": resolvable,
            "core_metric_count": total,
            "detail": detail,
        }

    # Years where the company filed but produced no placeable structured data.
    for year_text, bucket in filing_years.items():
        year = int(year_text)
        if year not in rows:
            rows[year] = {
                "status": FILING_ONLY,
                "native_core_metrics": 0,
                "resolvable_core_metrics": 0,
                "core_metric_count": len(core_metrics),
                "detail": {},
                "filings": bucket,
            }

    structured_years = sorted(year for year, row in rows.items() if row["status"] == STRUCTURED)
    usable_years = sorted(year for year, row in rows.items()
                          if row["status"] in (STRUCTURED, DERIVABLE))
    return {
        "cik": document["cik"],
        "name": (document.get("profile") or {}).get("name"),
        "tickers": (document.get("profile") or {}).get("tickers", []),
        "sic": (document.get("profile") or {}).get("sic"),
        "years": dict(sorted(rows.items())),
        "first_structured_year": structured_years[0] if structured_years else None,
        "first_usable_year": usable_years[0] if usable_years else None,
        "filing_years_seen": sorted(int(year) for year in filing_years),
    }


def build_matrix(documents, registry, probe_years=(2025, 2020, 2015, 2010, 2005, 2000, 1995)):
    """Coverage for a set of companies, plus the compact probe-year grid."""
    companies = [company_coverage(document, registry) for document in documents]
    grid = {}
    for year in probe_years:
        grid[str(year)] = {
            (company["tickers"][0] if company["tickers"] else company["cik"]):
                (company["years"].get(year) or {}).get("status", MISSING)
            for company in companies
        }
    first_usable = [company["first_usable_year"] for company in companies
                    if company["first_usable_year"]]
    return {
        "probe_years": list(probe_years),
        "grid": grid,
        "companies": companies,
        "summary": {
            "companies": len(companies),
            "earliest_usable_year": min(first_usable) if first_usable else None,
            "latest_first_usable_year": max(first_usable) if first_usable else None,
            "note": "STRUCTURED = native XBRL facts; DERIVABLE = reconstructible; "
                    "FILING_ONLY = a periodic filing exists but carries no usable "
                    "structured data; MISSING = no periodic filing found.",
        },
    }
