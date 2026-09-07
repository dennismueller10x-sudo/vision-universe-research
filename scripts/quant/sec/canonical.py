"""SEC facts -> the canonical Vision Universe model (`quant/engines/schema.js`).

This module is the boundary. Above it there is no SEC field, no XBRL concept and
no accession number in a shape the domain engines can see: everything becomes a
`FundamentalFact`, a `Filing` or a `Security` exactly as `schema.js` defines
them, and `schema.js` rejects unknown fields precisely so that vendor payloads
cannot leak upward.

Two deliberate reductions at this boundary, both documented rather than hidden:

  - `availableAt` becomes date-granular, because the canonical schema types it
    as a date. The SEC layer keeps the exact acceptance timestamp in its own
    factbook; nothing downstream currently consumes intraday availability.
  - Values are converted to the canonical units (`usd_m` millions, `count_m`
    millions of shares) declared in `schema.js` `METRIC_UNITS`.

Bitemporality is preserved in full: each canonical metric and period is emitted
once per revision, with `revisionId` counting from 0 and `restatementStatus`
separating the originally reported number from later corrections.
"""
import logging

from .model import SOURCE_DERIVED
from .restatements import POLICY_AS_OF_LATEST, to_instant
from .version import version_stamp

LOGGER = logging.getLogger("vu.sec.canonical")

DATA_SOURCE_ID = "ds_sec_edgar_v1"
DATA_SOURCE = {
    "dataSourceId": DATA_SOURCE_ID,
    "provider": "sec_edgar",
    "dataset": "companyfacts_xbrl",
    "isMock": False,
    # SEC filings are public domain; no licence blocks internal use or display.
    "licenseStatus": "public_domain",
    "pitCapable": True,
}

# SEC metric -> (canonical metricId, canonical unit, scale factor).
# Only metrics that schema.js METRIC_UNITS actually declares appear here; a SEC
# metric with no canonical counterpart stays inside the SEC layer.
METRIC_MAP = {
    "revenue":                 ("revenue", "usd_m", 1e-6),
    "gross_profit":            ("grossProfit", "usd_m", 1e-6),
    "operating_income":        ("operatingIncome", "usd_m", 1e-6),
    "net_income":              ("netIncome", "usd_m", 1e-6),
    "free_cash_flow":          ("freeCashFlow", "usd_m", 1e-6),
    "total_assets":            ("totalAssets", "usd_m", 1e-6),
    "stockholders_equity":     ("totalEquity", "usd_m", 1e-6),
    "net_debt":                ("netDebt", "usd_m", 1e-6),
    "invested_capital":        ("investedCapital", "usd_m", 1e-6),
    "capital_expenditures":    ("capex", "usd_m", 1e-6),
    "interest_expense":        ("interestExpense", "usd_m", 1e-6),
    "shares_outstanding":      ("sharesOutstanding", "count_m", 1e-6),
    "accruals":                ("accruals", "ratio", 1.0),
}

# Canonical metrics this pipeline cannot produce from SEC filings, and why.
# Recorded so that a gap is visible instead of looking like missing coverage.
UNSUPPORTED_METRICS = {
    "ebitda": "requires depreciation and amortisation, which the metric registry "
              "does not yet map from a reliably-tagged XBRL concept",
    "dividendPerShare": "SEC cash-flow statements report total dividends paid, not "
                        "a per-share amount",
}

# SEC source metrics each canonical metric depends on, used to find the dates on
# which its value could have changed.
DEPENDENCIES = {
    "revenue": ("revenue",),
    "gross_profit": ("gross_profit", "revenue", "cost_of_revenue"),
    "operating_income": ("operating_income",),
    "net_income": ("net_income",),
    "free_cash_flow": ("operating_cash_flow", "capital_expenditures"),
    "total_assets": ("total_assets",),
    "stockholders_equity": ("stockholders_equity",),
    "net_debt": ("total_debt", "long_term_debt", "short_term_debt", "cash_and_equivalents"),
    "invested_capital": ("total_debt", "long_term_debt", "short_term_debt",
                         "stockholders_equity", "cash_and_equivalents"),
    "capital_expenditures": ("capital_expenditures",),
    "interest_expense": ("interest_expense",),
    "shares_outstanding": ("shares_outstanding",),
    "accruals": ("net_income", "operating_cash_flow", "total_assets"),
}

RECONSTRUCTED = ("gross_profit", "free_cash_flow", "net_debt", "invested_capital",
                 "accruals")

FISCAL_PERIODS = ("Q1", "Q2", "Q3", "Q4", "FY")

STATUS_ORIGINAL = "original"
STATUS_RESTATED = "restated"


def security_id(ticker, cik):
    """Canonical securityId. Matches the repository's `sec_<TICKER>` convention.

    (`sec_` here is the existing abbreviation for *security*, not for the SEC —
    it is main's format for every security and is kept for consistency.)
    """
    return f"sec_{ticker}" if ticker else f"sec_CIK{cik}"


def _date(value):
    return str(value)[:10] if value else None


def revision_instants(factbook, metric, fiscal_year, fiscal_period):
    """Every date on which this canonical metric's value could have changed."""
    instants = set()
    for source in DEPENDENCIES.get(metric, (metric,)):
        for period in _source_periods(fiscal_period):
            timeline = factbook.get(source, fiscal_year, period)
            if timeline is None:
                continue
            for observation in timeline.observations:
                stamp = _date(observation.available_from or observation.filed)
                if stamp:
                    instants.add(stamp)
    return sorted(instants)


def _source_periods(fiscal_period):
    """Cells that can feed a period, including the cumulative ones it is built from."""
    if fiscal_period == "FY":
        return ("FY", "YTD3", "YTD2", "Q1", "Q2", "Q3", "Q4")
    return (fiscal_period, "YTD2", "YTD3", "FY")


def facts_for_period(resolver, security, fiscal_year, fiscal_period, ingested_at):
    """Canonical FundamentalFacts for one company and one fiscal period.

    One record per canonical metric per revision. A later filing that repeats an
    unchanged number produces no new revision; a changed number does, flagged
    `restated`.
    """
    from .derived import reconstruct

    factbook = resolver.factbook
    out = []

    for sec_metric, (metric_id, unit, scale) in METRIC_MAP.items():
        instants = revision_instants(factbook, sec_metric, fiscal_year, fiscal_period)
        if not instants:
            continue
        revision = 0
        previous_value = None
        first_value = None
        for instant in instants:
            fact = _resolve(resolver, sec_metric, fiscal_year, fiscal_period, instant)
            if fact is None or not fact.available or fact.value is None:
                continue
            value = round(fact.value * scale, 6)
            if previous_value is not None and value == previous_value:
                continue  # the same number reported again is not a new revision
            if first_value is None:
                first_value = value
            status = STATUS_ORIGINAL if revision == 0 or value == first_value \
                else STATUS_RESTATED
            record = {
                "securityId": security["securityId"],
                "metricId": metric_id,
                "fiscalPeriod": fiscal_period,
                "fiscalYear": int(fiscal_year),
                "periodEnd": _date(fact.period_end),
                "value": value,
                "unit": unit,
                "currency": "USD" if unit == "usd_m" else None,
                # SEC publishes no separate company-announcement timestamp; the
                # filing date is the earliest public moment we can evidence.
                "reportedAt": _date(fact.provenance.filed),
                "filedAt": _date(fact.provenance.filed),
                "availableAt": instant,
                "ingestedAt": ingested_at,
                "revisionId": revision,
                "restatementStatus": status,
                "sourceFilingId": fact.provenance.accession,
                "dataSourceId": DATA_SOURCE_ID,
            }
            if record["periodEnd"] is None:
                continue
            out.append(record)
            previous_value = value
            revision += 1

    return out


def _resolve(resolver, sec_metric, fiscal_year, fiscal_period, as_of):
    """Value of a SEC metric as known on `as_of`, reconstructing when needed."""
    from .derived import reconstruct

    if sec_metric in RECONSTRUCTED:
        return reconstruct(resolver, fiscal_year, fiscal_period, as_of,
                           policy=POLICY_AS_OF_LATEST).get(sec_metric)
    if fiscal_period == "FY":
        return resolver.annual(sec_metric, fiscal_year, as_of, policy=POLICY_AS_OF_LATEST)
    return resolver.quarter(sec_metric, fiscal_year, int(fiscal_period[1]), as_of,
                            policy=POLICY_AS_OF_LATEST)


def filings_for_company(document, calendar, security):
    """Canonical Filing records from the SEC submissions index."""
    from .fiscal import parse_date

    out = []
    for row in document.get("filing_index") or []:
        period_end = row.get("report_date")
        if not period_end:
            continue
        fiscal_year = calendar.fiscal_year_for(period_end)
        if fiscal_year is None:
            continue
        form = row.get("form") or ""
        if form.startswith("10-K") or form.startswith("20-F") or form.startswith("40-F"):
            fiscal_period = "FY"
        else:
            index = calendar.quarter_index(period_end)
            if index is None:
                continue
            fiscal_period = f"Q{index}"
        out.append({
            "filingId": row["accession"],
            "securityId": security["securityId"],
            "formType": form,
            "fiscalPeriod": fiscal_period,
            "fiscalYear": int(fiscal_year),
            "periodEnd": _date(period_end),
            "filedAt": _date(row.get("filing_date")),
            "restatementStatus": STATUS_RESTATED if row.get("is_amendment") else STATUS_ORIGINAL,
            "dataSourceId": DATA_SOURCE_ID,
        })
    return out


def security_for_company(document, ticker):
    """Canonical Security record.

    `status` is reported honestly: SEC/EDGAR has no listing history, so an
    issuer that still files is `active` and nothing else can be asserted. This
    is the same limitation the delisting gate reports (docs/SEC_COVERAGE_REPORT.md).
    """
    profile = document.get("profile") or {}
    calendar = document.get("calendar") or {}
    years = calendar.get("fiscal_years") or []
    first_period = years[0]["period_end"] if years else None
    return {
        "securityId": security_id(ticker, document["cik"]),
        "ticker": ticker or f"CIK{document['cik']}",
        "name": profile.get("name") or "",
        "assetType": "equity",
        "exchangeId": (profile.get("exchanges") or ["UNKNOWN"])[0] or "UNKNOWN",
        "currency": "USD",
        "country": "US",
        "sector": profile.get("sic_description") or "Unknown",
        "industry": profile.get("sic_description") or "Unknown",
        "status": "active",
        "firstTradingDate": _date(first_period) or "1900-01-01",
        "lastTradingDate": None,
        "isMock": False,
        "fixtureId": None,
        "dataSourceId": DATA_SOURCE_ID,
    }


def build_company_bundle(document, registry, ticker, annual_years=12,
                         quarterly_years=6):
    """The complete canonical payload for one company, ready to serve."""
    from .periods import PeriodResolver
    from .pipeline import _rehydrate

    factbook = _rehydrate(document)
    resolver = PeriodResolver(factbook, registry)
    calendar = factbook.calendar
    security = security_for_company(document, ticker)
    ingested_at = document.get("generated_at_utc")

    years = factbook.fiscal_years()
    annual_scope = years[-annual_years:] if years else []
    quarterly_scope = years[-quarterly_years:] if years else []

    facts = []
    for fiscal_year in annual_scope:
        facts.extend(facts_for_period(resolver, security, fiscal_year, "FY", ingested_at))
    for fiscal_year in quarterly_scope:
        for index in range(1, 5):
            facts.extend(facts_for_period(resolver, security, fiscal_year,
                                          f"Q{index}", ingested_at))

    bundle = {
        "schema": "vu-canonical-v1",
        "generatedAtUtc": ingested_at,
        "versions": version_stamp(registry.version),
        "dataSource": DATA_SOURCE,
        "security": security,
        "filings": filings_for_company(document, calendar, security) if calendar else [],
        "facts": facts,
        "unsupportedMetrics": UNSUPPORTED_METRICS,
        "coverage": {
            "annualYears": annual_scope,
            "quarterlyYears": quarterly_scope,
            "factCount": len(facts),
            "metricIds": sorted({fact["metricId"] for fact in facts}),
        },
    }
    LOGGER.info("canonical bundle cik=%s facts=%d", document["cik"], len(facts))
    return bundle
