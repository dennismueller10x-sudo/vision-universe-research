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
from collections import defaultdict
from datetime import date

from .fiscal import parse_date
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
