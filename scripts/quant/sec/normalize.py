"""SEC raw XBRL facts -> canonical Vision Universe fundamental facts.

Rules this layer obeys without exception:

  - Raw facts are never modified. Normalization only reads them.
  - A concept is accepted only if the registry lists it AND the unit is allowed
    AND the period kind matches. Anything else becomes a recorded issue, never a
    silently coerced value.
  - Period assignment comes from the learned fiscal calendar, never from the
    `fy`/`fp` fields (those describe the filing, not the fact).
  - Cumulative year-to-date periods keep a distinct label (YTD2/YTD3) so nothing
    downstream can mistake six months of revenue for a quarter.
  - Every observation carries the concept actually used, its accession, its form
    and when it became publicly available.
"""
import logging
from collections import Counter, defaultdict

from .fiscal import FiscalCalendar
from .model import (
    Provenance, SOURCE_SEC, TRANSFORM_NONE, QUALITY_HIGH, QUALITY_MEDIUM,
    UNIT_MISMATCH, PERIOD_MISMATCH,
)
from .registry import KIND_DURATION, KIND_INSTANT
from .restatements import CompanyFactBook, Observation
from .version import NORMALIZATION_SCHEMA_VERSION, NORMALIZATION_LOGIC_VERSION

LOGGER = logging.getLogger("vu.sec.normalize")

FLAG_COVER_DATE_INSTANT = "COVER_DATE_INSTANT"
FLAG_CONCEPT_DISAGREEMENT = "CONCEPT_DISAGREEMENT"
FLAG_DUPLICATE_FACT = "DUPLICATE_FACT"

ISSUE_UNIT_MISMATCH = "UNIT_MISMATCH"
ISSUE_PERIOD_MISMATCH = "PERIOD_MISMATCH"
ISSUE_UNEXPECTED_DURATION = "UNEXPECTED_DURATION"
ISSUE_UNKNOWN_CONCEPT = "UNKNOWN_CONCEPT"
ISSUE_DUPLICATE_FACT = "DUPLICATE_FACT"
ISSUE_CONCEPT_DISAGREEMENT = "CONCEPT_DISAGREEMENT"
ISSUE_UNPLACEABLE_PERIOD = "UNPLACEABLE_PERIOD"
ISSUE_FUTURE_PERIOD = "FUTURE_PERIOD"

# Two concepts mapped to the same metric and period that differ by more than
# this relative amount are reported; the higher-priority concept still wins.
CONCEPT_DISAGREEMENT_TOLERANCE = 0.005


def period_end_for_cover_date(cover_date, observed_ends):
    """The end date of the period a cover-date instant describes.

    A cover date is when the share count was taken, not when the period ended,
    so it must not be published as the cell's period end -- the same fiscal
    quarter would then carry two end dates, the cover date and the
    balance-sheet date the next filing reports, and the canonical layer
    suppresses such a cell as ambiguous. Live SEC data lost 136
    sharesOutstanding cells that way.

    `observed_ends` counts the end dates the company itself reported for the
    same fiscal period. Nothing is interpolated, and two candidates are refused:

      - a date AFTER the cover date, because a cover date follows the period it
        describes. Live NVDA data offered one -- an early year whose periods the
        fiscal calendar cannot place unambiguously held a date a full year
        later, and borrowing it made a 2009 filing look like it knew a 2010
        balance sheet. The PIT gate caught it.
      - nothing at all, when the period has no other fact: then no measured end
        date exists and the cover date stands.

    Among the remaining candidates the latest wins: it is the most recent period
    end the cover date can be following.
    """
    usable = [end for end in (observed_ends or {}) if end and end <= cover_date]
    return max(usable) if usable else cover_date


def build_availability_map(filing_metadata):
    """accession -> ISO datetime the filing became publicly available.

    `acceptanceDateTime` is the exact dissemination moment. Where the SEC does
    not provide it we fall back to the filing date, and the PIT layer then works
    at date granularity — one day coarser, never one day earlier.
    """
    availability = {}
    for row in filing_metadata or []:
        accession = row.get("accession")
        if not accession:
            continue
        availability[accession] = row.get("acceptance_datetime") or row.get("filing_date")
    return availability


class NormalizationResult:
    def __init__(self, factbook, issues, stats):
        self.factbook = factbook
        self.issues = issues
        self.stats = stats


def normalize_company(cik, raw_facts, registry, profile=None, filing_metadata=None,
                      calendar=None):
    """Turn an iterable of RawFact into a CompanyFactBook of PIT timelines."""
    raw_facts = list(raw_facts)
    issues = []
    availability = build_availability_map(filing_metadata)

    # Companyfacts occasionally contains a source observation whose period ends
    # after the filing that supposedly reported it. Keep that observation in the
    # immutable raw archive, but never admit it to the canonical layer or allow
    # it to influence fiscal-calendar inference. This is quarantine, not repair:
    # no date or value is changed and the anomaly remains explicit in quality
    # output.
    reportable_facts = []
    for fact in raw_facts:
        available = fact.available_from or availability.get(fact.accession) or fact.filed
        if fact.end and available and fact.end > available[:10]:
            issues.append(_issue(
                ISSUE_FUTURE_PERIOD, fact,
                f"period end {fact.end} is after availability {available}; "
                "raw fact quarantined from canonical output",
            ))
            continue
        reportable_facts.append(fact)

    if calendar is None:
        calendar = FiscalCalendar.from_raw_facts(
            cik, reportable_facts,
            fiscal_year_end_hint=getattr(profile, "fiscal_year_end", None),
        )

    # (metric, fy, fp, accession) -> list of (priority, RawFact)
    candidates = defaultdict(list)
    # (fy, fp) -> Counter of the period end dates the company itself reported
    # for that period. A cover-date instant is dated AFTER the period it
    # describes, so it cannot supply its own period end; it borrows the one
    # the company's other facts for the same period were measured on.
    observed_period_ends = defaultdict(Counter)
    seen_fact_ids = set()
    stats = {"raw_facts": len(raw_facts), "mapped": 0, "unmapped": 0, "duplicates": 0,
             "quarantined_future_periods": len(raw_facts) - len(reportable_facts)}

    for fact in reportable_facts:
        matches = registry.metrics_for_concept(fact.taxonomy, fact.concept)
        if not matches:
            stats["unmapped"] += 1
            continue

        if fact.fact_id in seen_fact_ids:
            stats["duplicates"] += 1
            issues.append(_issue(ISSUE_DUPLICATE_FACT, fact, "identical fact reported twice"))
            continue
        seen_fact_ids.add(fact.fact_id)

        for metric_name, priority in matches:
            definition = registry.get(metric_name)
            if not definition.allows_unit(fact.unit):
                issues.append(_issue(
                    ISSUE_UNIT_MISMATCH, fact,
                    f"unit {fact.unit!r} not allowed for {metric_name} "
                    f"(allowed: {list(definition.units)})", metric=metric_name))
                continue
            is_instant = fact.start is None
            if definition.kind == KIND_INSTANT and not is_instant:
                issues.append(_issue(ISSUE_PERIOD_MISMATCH, fact,
                                     f"{metric_name} is an instant metric but the fact has a duration",
                                     metric=metric_name))
                continue
            if definition.kind == KIND_DURATION and is_instant:
                issues.append(_issue(ISSUE_PERIOD_MISMATCH, fact,
                                     f"{metric_name} is a duration metric but the fact is an instant",
                                     metric=metric_name))
                continue

            is_cover_date = fact.taxonomy == "dei" and fact.start is None
            if is_cover_date:
                # Cover-date instant: dated after the period it describes.
                fiscal_year, fiscal_period = calendar.assign_cover_date(fact.end)
                kind = "instant"
            else:
                fiscal_year, fiscal_period, kind = calendar.assign(fact.start, fact.end)
            if kind == "UNKNOWN":
                issues.append(_issue(ISSUE_UNEXPECTED_DURATION, fact,
                                     "period length matches no known reporting period",
                                     metric=metric_name))
                continue
            if fiscal_year is None or fiscal_period is None:
                issues.append(_issue(ISSUE_UNPLACEABLE_PERIOD, fact,
                                     "period could not be placed in the company's fiscal calendar",
                                     metric=metric_name))
                continue

            targets = [(fiscal_year, fiscal_period)]
            # A balance sheet dated on the fiscal year end is also the Q4 balance
            # sheet; emit both so the quarterly series has no artificial hole.
            if definition.kind == KIND_INSTANT and fiscal_period == "FY":
                targets.append((fiscal_year, "Q4"))

            for target_year, target_period in targets:
                candidates[(metric_name, target_year, target_period, fact.accession)].append(
                    (priority, fact)
                )

            if not is_cover_date and fact.end:
                # The fiscal year end IS the Q4 end, so an annual fact fixes
                # both -- otherwise a cover-date share count mirrored onto Q4
                # would find no measured end date there and keep the cover date.
                for period in ({fiscal_period, "Q4"} if fiscal_period == "FY"
                               else {fiscal_period}):
                    observed_period_ends[(fiscal_year, period)][fact.end] += 1

    factbook = CompanyFactBook(cik, calendar=calendar, profile=profile)
    registry_version = registry.version

    for (metric_name, fiscal_year, fiscal_period, accession), entries in candidates.items():
        entries.sort(key=lambda item: item[0])
        best_priority, fact = entries[0]
        flags = []

        # More than one accepted concept in the same filing for the same cell:
        # the registry's priority decides, and a material disagreement is
        # reported rather than averaged away.
        rivals = [other for priority, other in entries[1:]]
        if rivals:
            scale = max(abs(fact.value), 1.0)
            if any(abs(other.value - fact.value) / scale > CONCEPT_DISAGREEMENT_TOLERANCE
                   for other in rivals):
                flags.append(FLAG_CONCEPT_DISAGREEMENT)
                issues.append(_issue(
                    ISSUE_CONCEPT_DISAGREEMENT, fact,
                    "concepts %s disagree for %s %s %s; highest-priority concept used" % (
                        [other.concept for other in rivals], metric_name,
                        fiscal_year, fiscal_period),
                    metric=metric_name))
        period_end = fact.end
        if fact.taxonomy == "dei" and fact.start is None:
            flags.append(FLAG_COVER_DATE_INSTANT)
            # The cover date is when the count was taken, not when the period
            # ended, so it must not be published as this cell's period end: the
            # same fiscal quarter would then carry two end dates -- the cover
            # date and the balance-sheet date from the very next filing -- and
            # the canonical layer suppresses such a cell as ambiguous. Live SEC
            # data lost 136 sharesOutstanding cells that way. The period end is
            # taken from what the company itself reported for the same period;
            # nothing is interpolated. Where no other fact exists for the
            # period, there is no measured end date and the cover date stands.
            period_end = period_end_for_cover_date(
                fact.end, observed_period_ends.get((fiscal_year, fiscal_period)))

        provenance = Provenance(
            source=SOURCE_SEC,
            taxonomy=fact.taxonomy,
            concept=fact.concept,
            accession=fact.accession,
            form=fact.form,
            filed=fact.filed,
            available_from=fact.available_from or availability.get(fact.accession) or fact.filed,
            retrieved_at=fact.retrieved_at,
            transformation=TRANSFORM_NONE,
            inputs=[fact.fact_id],
            registry_version=registry_version,
            normalization_version=f"{NORMALIZATION_SCHEMA_VERSION}/{NORMALIZATION_LOGIC_VERSION}",
        )
        observation = Observation(
            value=fact.value,
            unit=fact.unit,
            provenance=provenance,
            available_from=provenance.available_from,
            filed=fact.filed,
            quality=QUALITY_MEDIUM if flags else QUALITY_HIGH,
            flags=flags,
            period_start=fact.start,
            period_end=period_end,
        )
        factbook.add_observation(metric_name, fiscal_year, fiscal_period, observation)
        stats["mapped"] += 1

    stats["timelines"] = len(factbook.timelines)
    stats["issues"] = len(issues)
    LOGGER.info("normalized cik=%s %s", cik, stats)
    return NormalizationResult(factbook, issues, stats)


def _issue(code, fact, message, metric=None):
    return {
        "code": code,
        "metric": metric,
        "cik": fact.cik,
        "taxonomy": fact.taxonomy,
        "concept": fact.concept,
        "unit": fact.unit,
        "start": fact.start,
        "end": fact.end,
        "accession": fact.accession,
        "form": fact.form,
        "filed": fact.filed,
        "message": message,
    }
