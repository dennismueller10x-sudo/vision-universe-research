"""Data Quality Engine.

Hard rule: this layer MARKS problems, it never changes a value. A number that
looks wrong stays exactly as SEC reported it and is flagged, because silently
"fixing" data is how a research pipeline starts lying to its owner.

Checks implemented (Phase 4 § 16):
  DUPLICATE_FACT            same fact reported twice in the same filing
  CONFLICTING_FACTS         two filings visible at the same instant disagree
  INVALID_UNIT              unit not allowed for the metric
  IMPOSSIBLE_PERIOD         period end before period start, or a zero-length period
  FUTURE_DATA_LEAK          period end after the filing date that reported it
  MISSING_FILING_DATE       fact without a filing date, so it has no PIT anchor
  UNKNOWN_CONCEPT           concept not in the registry (informational)
  UNEXPECTED_DURATION       period length matches no known reporting period
  FISCAL_PERIOD_CONFLICT    the same cell filled from incompatible period lengths
  RESTATEMENT_CONFLICT      a restatement that moves a value by more than a threshold
  EXTREME_VALUE             a value outside a sanity band for its metric
  NEGATIVE_WHERE_IMPOSSIBLE a strictly non-negative metric reported negative
"""
import logging
import math
from collections import defaultdict
from datetime import date

from .fiscal import parse_date
from .model import SOURCE_SEC
from .restatements import to_instant
from .version import QUALITY_RULES_VERSION

LOGGER = logging.getLogger("vu.sec.quality")

SEVERITY_ERROR = "ERROR"
SEVERITY_WARNING = "WARNING"
SEVERITY_INFO = "INFO"

# Metrics that cannot legitimately be negative.
NON_NEGATIVE_METRICS = frozenset({
    "revenue", "cost_of_revenue", "total_assets", "total_liabilities",
    "cash_and_equivalents", "short_term_investments", "shares_outstanding",
    "diluted_weighted_average_shares", "basic_weighted_average_shares",
    "research_and_development", "capital_expenditures",
})

# Absolute sanity bands. Deliberately wide: these catch unit errors (a company
# reporting revenue in thousands where the unit says USD), not business results.
EXTREME_VALUE_BANDS = {
    "revenue": (0.0, 2e13),
    "total_assets": (0.0, 1e14),
    "net_income": (-1e13, 1e13),
    "eps_basic": (-1e4, 1e4),
    "eps_diluted": (-1e4, 1e4),
    "shares_outstanding": (0.0, 1e13),
}

# A restatement moving a value by more than this fraction is worth a human look.
RESTATEMENT_ALERT_THRESHOLD = 0.10

SOURCE_ANOMALY_CODES = frozenset({"FUTURE_DATA_LEAK", "IMPOSSIBLE_PERIOD"})
CANONICAL_VIOLATION_CODES = frozenset({
    "INVALID_UNIT", "MISSING_FILING_DATE", "NON_FINITE_VALUE",
    "MISSING_PROVENANCE", "CANONICAL_IMPOSSIBLE_PERIOD", "IDENTITY_MISMATCH",
})

SCORECARD_TARGET_METRICS = (
    "revenue", "cost_of_revenue", "gross_profit", "operating_income", "ebit",
    "pretax_income", "net_income", "eps_basic", "eps_diluted",
    "basic_weighted_average_shares", "diluted_weighted_average_shares",
    "cash_and_equivalents", "short_term_investments", "current_assets",
    "total_assets", "current_liabilities", "total_liabilities",
    "short_term_debt", "long_term_debt", "total_debt", "stockholders_equity",
    "goodwill", "intangible_assets", "inventory", "accounts_receivable",
    "operating_cash_flow", "capital_expenditures", "free_cash_flow",
    "investing_cash_flow", "financing_cash_flow", "dividends_paid",
    "share_repurchases", "shares_outstanding",
)

PROFILE_CORE_METRICS = {
    "GENERAL": frozenset({
        "revenue", "net_income", "total_assets", "stockholders_equity",
        "operating_cash_flow", "shares_outstanding",
    }),
    "BANK": frozenset({
        "revenue", "net_income", "total_assets", "stockholders_equity",
        "shares_outstanding",
    }),
    "INSURANCE": frozenset({
        "revenue", "net_income", "total_assets", "stockholders_equity",
        "shares_outstanding",
    }),
    "REIT": frozenset({
        "revenue", "net_income", "total_assets", "stockholders_equity",
        "operating_cash_flow", "shares_outstanding",
    }),
}


def _finding(code, severity, message, **context):
    payload = {"code": code, "severity": severity, "message": message,
               "rules_version": QUALITY_RULES_VERSION}
    payload.update({key: value for key, value in context.items() if value is not None})
    return payload


def check_raw_facts(raw_facts, registry):
    """Checks that only make sense against the untouched SEC layer."""
    findings = []
    seen = defaultdict(int)

    for fact in raw_facts:
        seen[fact.fact_id] += 1

        if not fact.filed:
            findings.append(_finding(
                "MISSING_FILING_DATE", SEVERITY_ERROR,
                "fact has no filing date and therefore no point-in-time anchor",
                concept=fact.concept, end=fact.end, accession=fact.accession))
            continue

        end = parse_date(fact.end)
        filed = parse_date(fact.filed)
        start = parse_date(fact.start) if fact.start else None

        if start is not None and end is not None and end <= start:
            findings.append(_finding(
                "IMPOSSIBLE_PERIOD", SEVERITY_ERROR,
                f"period end {fact.end} is not after start {fact.start}",
                concept=fact.concept, accession=fact.accession))

        if end is not None and filed is not None and end > filed:
            # A company cannot report a period that has not finished when it filed.
            findings.append(_finding(
                "FUTURE_DATA_LEAK", SEVERITY_ERROR,
                f"period end {fact.end} is after filing date {fact.filed}",
                concept=fact.concept, accession=fact.accession, form=fact.form))

        if not registry.metrics_for_concept(fact.taxonomy, fact.concept):
            findings.append(_finding(
                "UNKNOWN_CONCEPT", SEVERITY_INFO,
                "concept is not mapped by the metric registry",
                concept=f"{fact.taxonomy}:{fact.concept}", unit=fact.unit))

    for fact_id, count in seen.items():
        if count > 1:
            findings.append(_finding(
                "DUPLICATE_FACT", SEVERITY_WARNING,
                f"identical fact reported {count} times", fact_id=fact_id))

    return findings


def check_factbook(factbook, registry):
    """Checks against the normalized, point-in-time layer."""
    findings = []

    for (metric, fiscal_year, fiscal_period), timeline in factbook.timelines.items():
        definition = registry.get(metric)
        observations = timeline.observations

        for observation in observations:
            if observation.value is not None and not math.isfinite(observation.value):
                findings.append(_finding(
                    "NON_FINITE_VALUE", SEVERITY_ERROR,
                    "canonical value is NaN or infinite",
                    metric=metric, fiscal_year=fiscal_year,
                    fiscal_period=fiscal_period, accession=observation.accession))

            if definition is not None and not definition.allows_unit(observation.unit):
                findings.append(_finding(
                    "INVALID_UNIT", SEVERITY_ERROR,
                    f"unit {observation.unit!r} is not allowed for {metric}",
                    metric=metric, fiscal_year=fiscal_year, fiscal_period=fiscal_period,
                    accession=observation.accession))

            if metric in NON_NEGATIVE_METRICS and observation.value is not None \
                    and observation.value < 0:
                findings.append(_finding(
                    "NEGATIVE_WHERE_IMPOSSIBLE", SEVERITY_WARNING,
                    f"{metric} reported as {observation.value}",
                    metric=metric, fiscal_year=fiscal_year, fiscal_period=fiscal_period,
                    accession=observation.accession))

            band = EXTREME_VALUE_BANDS.get(metric)
            if band and observation.value is not None \
                    and not (band[0] <= observation.value <= band[1]):
                findings.append(_finding(
                    "EXTREME_VALUE", SEVERITY_WARNING,
                    f"{metric} value {observation.value} is outside the sanity band {band}",
                    metric=metric, fiscal_year=fiscal_year, fiscal_period=fiscal_period,
                    accession=observation.accession))

            if observation.available_instant is None:
                findings.append(_finding(
                    "MISSING_FILING_DATE", SEVERITY_ERROR,
                    "observation has no availability timestamp",
                    metric=metric, fiscal_year=fiscal_year, fiscal_period=fiscal_period))

            provenance = observation.provenance
            if provenance.source == SOURCE_SEC and not all((
                    provenance.taxonomy, provenance.concept,
                    provenance.accession, provenance.form)):
                findings.append(_finding(
                    "MISSING_PROVENANCE", SEVERITY_ERROR,
                    "SEC observation lacks taxonomy, concept, accession or form",
                    metric=metric, fiscal_year=fiscal_year,
                    fiscal_period=fiscal_period, accession=observation.accession))

            start = parse_date(observation.period_start) if observation.period_start else None
            end = parse_date(observation.period_end) if observation.period_end else None
            if start is not None and end is not None and end <= start:
                findings.append(_finding(
                    "CANONICAL_IMPOSSIBLE_PERIOD", SEVERITY_ERROR,
                    "canonical period end is not after its period start",
                    metric=metric, fiscal_year=fiscal_year,
                    fiscal_period=fiscal_period, accession=observation.accession))
            if end is not None and fiscal_year is not None and abs(end.year - int(fiscal_year)) > 2:
                findings.append(_finding(
                    "FISCAL_YEAR_ASSIGNMENT_ANOMALY", SEVERITY_WARNING,
                    "fiscal-year label is more than two years from period end",
                    metric=metric, fiscal_year=fiscal_year,
                    fiscal_period=fiscal_period, accession=observation.accession))

        # Same availability instant, different values.
        by_instant = defaultdict(list)
        for observation in observations:
            by_instant[observation.available_instant].append(observation)
        for instant, peers in by_instant.items():
            values = {round(obs.value, 6) for obs in peers if obs.value is not None}
            if len(values) > 1:
                findings.append(_finding(
                    "CONFLICTING_FACTS", SEVERITY_WARNING,
                    f"{len(values)} different values available at the same instant: {sorted(values)}",
                    metric=metric, fiscal_year=fiscal_year, fiscal_period=fiscal_period,
                    available_from=str(instant)))

        # Period lengths that disagree inside one cell.
        lengths = set()
        for observation in observations:
            if observation.period_start and observation.period_end:
                lengths.add((parse_date(observation.period_end)
                             - parse_date(observation.period_start)).days // 30)
        if len(lengths) > 1:
            findings.append(_finding(
                "FISCAL_PERIOD_CONFLICT", SEVERITY_WARNING,
                f"cell filled from periods of differing length (~months: {sorted(lengths)})",
                metric=metric, fiscal_year=fiscal_year, fiscal_period=fiscal_period))

        # Material restatements.
        values = [obs.value for obs in observations if obs.value is not None]
        if len(values) > 1:
            low, high = min(values), max(values)
            scale = max(abs(low), abs(high), 1.0)
            if (high - low) / scale > RESTATEMENT_ALERT_THRESHOLD:
                findings.append(_finding(
                    "RESTATEMENT_CONFLICT", SEVERITY_WARNING,
                    f"restated by {(high - low) / scale:.1%} across filings "
                    f"({low} -> {high}); both versions retained",
                    metric=metric, fiscal_year=fiscal_year, fiscal_period=fiscal_period))

        # A four-order-of-magnitude revision for the exact same fiscal cell is
        # usually a unit/context problem.  Keep both observations but surface
        # the anomaly for automated review.
        magnitudes = [abs(value) for value in values if value not in (0, None)]
        if len(magnitudes) > 1 and max(magnitudes) / min(magnitudes) >= 10000:
            findings.append(_finding(
                "UNEXPECTED_MAGNITUDE_JUMP", SEVERITY_WARNING,
                "same fiscal cell changes by at least four orders of magnitude",
                metric=metric, fiscal_year=fiscal_year, fiscal_period=fiscal_period))

    return findings


def summarize(findings):
    counts = defaultdict(int)
    severities = defaultdict(int)
    for finding in findings:
        counts[finding["code"]] += 1
        severities[finding["severity"]] += 1
    return {
        "rules_version": QUALITY_RULES_VERSION,
        "total": len(findings),
        "by_severity": dict(severities),
        "by_code": dict(sorted(counts.items())),
    }


def run_all(raw_facts, factbook, registry, normalization_issues=()):
    findings = check_raw_facts(raw_facts, registry)
    findings.extend(check_factbook(factbook, registry))
    for issue in normalization_issues:
        findings.append(_finding(
            issue["code"],
            SEVERITY_INFO if issue["code"] == "UNKNOWN_CONCEPT" else SEVERITY_WARNING,
            issue["message"], metric=issue.get("metric"),
            concept=issue.get("concept"), accession=issue.get("accession")))
    return findings, summarize(findings)


def build_quality_scorecard(document):
    """Machine-readable per-company quality summary from persisted evidence."""
    timelines = (document.get("factbook") or {}).get("timelines") or []
    reported_metrics = {row.get("metric") for row in timelines if row.get("metric")}
    derived_metrics = set()
    if {"revenue", "cost_of_revenue"}.issubset(reported_metrics):
        derived_metrics.add("gross_profit")
    if {"pretax_income", "interest_expense"}.issubset(reported_metrics):
        derived_metrics.add("ebit")
    if {"operating_cash_flow", "capital_expenditures"}.issubset(reported_metrics):
        derived_metrics.add("free_cash_flow")
    if {"long_term_debt", "short_term_debt"}.issubset(reported_metrics):
        derived_metrics.add("total_debt")
    metrics = reported_metrics | derived_metrics
    observations = [observation for row in timelines
                    for observation in (row.get("observations") or [])]
    timestamped = sum(bool(row.get("available_from") or row.get("filed"))
                      for row in observations)
    pit_violations = sum(
        1 for row in observations
        if row.get("period_end") and (row.get("available_from") or row.get("filed"))
        and to_instant(row.get("available_from") or row.get("filed"))
        < to_instant(row.get("period_end"))
    )
    findings = (document.get("quality") or {}).get("findings") or []
    source_anomalies = [row for row in findings if row.get("code") in SOURCE_ANOMALY_CODES]
    canonical_findings = [row for row in findings
                          if row.get("code") in CANONICAL_VIOLATION_CODES]

    profile = document.get("profile") or {}
    identity_mismatch = bool(
        profile.get("cik") and str(profile.get("cik")).zfill(10) !=
        str(document.get("cik")).zfill(10))
    if identity_mismatch:
        canonical_findings.append({"code": "IDENTITY_MISMATCH"})

    classification = document.get("classification") or {}
    metric_profile = classification.get("metricProfile") or "GENERAL"
    core = PROFILE_CORE_METRICS.get(metric_profile, PROFILE_CORE_METRICS["GENERAL"])
    core_present = core & metrics
    target_present = set(SCORECARD_TARGET_METRICS) & metrics
    period_ends = sorted({row.get("period_end") for row in observations
                          if row.get("period_end")})
    periods = {(row.get("fiscal_year"), row.get("fiscal_period")) for row in timelines}
    normalization_errors = [
        row for row in findings
        if row.get("severity") == SEVERITY_ERROR
        and row.get("code") not in SOURCE_ANOMALY_CODES
    ]

    if canonical_findings or pit_violations or identity_mismatch:
        status = "FAIL"
    elif core and len(core_present) / len(core) < 0.8:
        status = "PARTIAL"
    elif source_anomalies or len(target_present) < len(SCORECARD_TARGET_METRICS):
        status = "PARTIAL"
    else:
        status = "PASS"

    filing_index = document.get("filing_index") or []
    forms = {}
    for filing in filing_index:
        form = filing.get("form")
        if form:
            forms[form] = forms.get(form, 0) + 1
    return {
        "schemaVersion": 1,
        "entityClassification": classification.get("entityClassification", "UNKNOWN"),
        "fundamentalsEligible": classification.get("fundamentalsEligible"),
        "accountingStandard": classification.get("accountingStandard", "UNKNOWN"),
        "accountingCapability": classification.get("accountingCapability", "UNSUPPORTED"),
        "metricProfile": metric_profile,
        "filingCoverage": {
            "periodicFilings": len(filing_index),
            "forms": dict(sorted(forms.items())),
            "years": sorted((document.get("filing_years") or {}).keys()),
        },
        "metricCoverage": {
            "targetCount": len(SCORECARD_TARGET_METRICS),
            "presentCount": len(target_present),
            "coverage": round(len(target_present) / len(SCORECARD_TARGET_METRICS), 6),
            "presentMetrics": sorted(target_present),
            "missingMetrics": sorted(set(SCORECARD_TARGET_METRICS) - metrics),
            "reportedMetrics": sorted(set(SCORECARD_TARGET_METRICS) & reported_metrics),
            "derivedMetrics": sorted(set(SCORECARD_TARGET_METRICS) & derived_metrics),
            "coreMetrics": sorted(core),
            "corePresent": sorted(core_present),
            "coreCoverage": round(len(core_present) / len(core), 6) if core else 0.0,
        },
        "pitCoverage": round(timestamped / len(observations), 6) if observations else 0.0,
        "pitViolations": pit_violations,
        "normalizationErrors": len(normalization_errors),
        "sourceAnomalies": len(source_anomalies),
        "canonicalViolations": len(canonical_findings) + pit_violations,
        "identityMismatch": identity_mismatch,
        "historyStart": period_ends[0] if period_ends else None,
        "historyEnd": period_ends[-1] if period_ends else None,
        "numberOfPeriods": len(periods),
        "qualityStatus": status,
    }
