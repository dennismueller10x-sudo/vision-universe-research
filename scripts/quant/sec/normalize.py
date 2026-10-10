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
import json
import logging
from collections import Counter, defaultdict
from datetime import timedelta

from pathlib import Path

from .fiscal import FY_BOUNDARY_TOLERANCE_DAYS, FiscalCalendar
from .provider import TRANSITION_FORMS
from .model import (
    Provenance, SOURCE_SEC, TRANSFORM_NONE, QUALITY_HIGH, QUALITY_MEDIUM,
    UNIT_MISMATCH, PERIOD_MISMATCH,
)
from .registry import KIND_DURATION, KIND_INSTANT
from .restatements import CompanyFactBook, Observation, economic_class
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

# Two concepts mapped to the same metric and period that differ by more than
# this relative amount are reported; the higher-priority concept still wins.
CONCEPT_DISAGREEMENT_TOLERANCE = 0.005
ISSUE_AMBIGUOUS_AGGREGATE = "AMBIGUOUS_AGGREGATE"
ISSUE_AMBIGUOUS_PERIOD = "AMBIGUOUS_PERIOD"
# Two period ends in one cell further apart than this are two periods.
AMBIGUOUS_PERIOD_DAYS = 7
# 1.22.0 (F-TTM-6): a transition report (10-KT, 10-QT and amendments) enters a
# cell only with that cell's period: start and end within this many days of the
# period the fiscal calendar expects. A 10-QT also reports periods on the old
# fiscal-year basis (Dthera 10-QT 2016: nine months Jan-Sep 2015 next to the new
# year's Jul-Mar); under 10-K semantics they landed in the new year's cells and,
# as the newest filing, replaced the right period there. Red Team 1.22.0:
#  - nothing in a fiscal year the calendar projected FORWARD past its last
#    observed year end. A 10-QT-only transition quarter (Mastermind Oct-Dec
#    2023) otherwise matched the old-basis year the calendar extrapolated and
#    filled its Q1 slot, so a TTM ran over the transition period (H-1).
#    Backward comparatives stay (8point3 FY2014). A cover-date fact is judged
#    by the cell it describes, the last closed period (Red Team R2-3).
#  - the period the regular reports of the cell unanimously give is evidence
#    too: an equal split of the year misses 16/12/12/12-week quarters
#    (SpartanNash), and the correction was dropped (M-1). Only regular reports
#    available by the transition report count (point in time, R2-2); a cell
#    whose regular reports disagree on the period (F-TTM-7) is none.
TRANSITION_PERIOD_TOLERANCE_DAYS = 7
# 1.23.0 (F-TTM-7): every observation carries its fit to the fiscal-calendar slot
# of its cell (days off the expected start and end); restatements.preferred()
# chooses among visible versions by economic class, then fit, then recency.
# Nothing is dropped here: a rule that fixed the cell by its first publication
# locked misplaced first periods (Eco-Tek, HC2) and let accession order decide
# same-instant conflicts (Moxian) - red team 1.23.0. A start rule for cumulative
# cells was dropped too: calendar gaps and first fiscal years from inception are
# real fiscal periods.

# Which concept is a filing's revenue line when us-gaap:Revenues is smaller
# than another revenue concept of the same cell? Decided from the filing
# itself (statement roles, presentation and calculation linkbase), produced by
# scripts/fundamentals-audit/build_revenue_evidence.py. A size ratio alone
# does not decide (1.15.0 dropped EQT's total revenue, 29 percent of contract
# revenue after derivative losses, and kept Escalade's note-only Revenues).
REVENUE_EVIDENCE_PATH = (Path(__file__).resolve().parents[3] / "quant" / "config"
                         / "sec-revenue-statement-evidence.json")
EVIDENCE_TOTAL = "TOTAL"
EVIDENCE_OTHER = "OTHER"
_EVIDENCE_CACHE = {}


def _parse(value):
    from datetime import date
    return date.fromisoformat(str(value)[:10])


def load_revenue_evidence(path=None):
    """{accession: "TOTAL" | "OTHER[:concept]" | "AMBIGUOUS"} (cached)."""
    path = Path(path or REVENUE_EVIDENCE_PATH)
    if path not in _EVIDENCE_CACHE:
        payload = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        _EVIDENCE_CACHE[path] = payload.get("decisions") or {}
    return _EVIDENCE_CACHE[path]
# Same-filing values of the other accepted concepts, kept on the observation as
# "ALT:<taxonomy>:<concept>=<value>" so a derived quarter can subtract two
# cumulative points of ONE concept (periods.py). Not a quality signal.
FLAG_ALTERNATE_PREFIX = "ALT:"


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


def _currency(unit):
    """ISO code of a monetary unit ("EUR", "USD/shares" -> "USD"), else None."""
    if not unit:
        return None
    code = unit.split("/", 1)[0] if unit.endswith("/shares") else unit
    return code if len(code) == 3 and code.isalpha() and code.isupper() else None


def _drop_partial_aggregates(entries, definition, accession=None, evidence=None):
    """An aggregate (us-gaap:Revenues) smaller than another positive concept of
    the same metric, currency and filing is either the statement total (net of
    a negative component: UPST, EQT, PXD, FCX) or a partial amount (FLS
    Revenues = 0, PESI, VTSI, GEN, VRRM, Escalade). The filing decides
    (REVENUE_EVIDENCE_PATH): TOTAL keeps it, OTHER drops it for the next
    concept. Without a decision - AMBIGUOUS or no evidence for the filing - the
    cell has no value: None is returned, never a guess.
    """
    if len(entries) < 2:
        return entries
    top = entries[0][1]
    if not definition.is_aggregate(top.taxonomy, top.concept):
        return entries
    unit = top.unit
    larger = [fact for _, fact in entries[1:]
              if fact.unit == unit and fact.value > 0 and top.value < fact.value]
    if not larger:
        return entries
    decision = (evidence or {}).get(accession) or ""
    if decision == EVIDENCE_TOTAL:
        return entries
    if decision.startswith(EVIDENCE_OTHER):
        named = decision.partition(":")[2]
        if named:
            # The evidence names the statement line: exactly that concept, not
            # the next one by priority (Escalade 2019: the statement line is
            # contract revenue including assessed tax, 180.5 million; the next
            # priority, excluding tax, 203.4 million, is a note).
            exact = [entry for entry in entries if entry[1].concept == named]
            return exact or None
        rest = [entry for entry in entries
                if not definition.is_aggregate(entry[1].taxonomy, entry[1].concept)]
        return rest or None
    return None


def _alternate_flags(fact, rivals):
    seen, flags = {fact.concept}, []
    for other in rivals:
        if other.unit != fact.unit or other.concept in seen:
            continue
        seen.add(other.concept)
        flags.append(f"{FLAG_ALTERNATE_PREFIX}{other.taxonomy}:{other.concept}={other.value!r}")
    return flags


def _filing_currencies(raw_facts):
    """accession -> the currency most of that filing's monetary facts are in."""
    counts = defaultdict(Counter)
    for fact in raw_facts:
        code = _currency(fact.unit)
        if code:
            counts[fact.accession][code] += 1
    return {accession: counter.most_common(1)[0][0] for accession, counter in counts.items()}


def _expected_period(calendar, end, fiscal_period):
    """(start, end) the fiscal calendar expects for the cell (fiscal_period) holding `end`, or None."""
    previous, fy_end = calendar._boundaries_covering(end)
    if previous is None or fy_end is None or not fiscal_period:
        return None
    if fiscal_period == "FY":
        return previous + timedelta(days=1), fy_end
    index = int(fiscal_period[-1])
    ends = calendar.quarter_ends(previous, fy_end)
    if fiscal_period.startswith("YTD"):
        return previous + timedelta(days=1), ends[index - 1]
    return (previous if index == 1 else ends[index - 2]) + timedelta(days=1), ends[index - 1]


def _slot_fit(calendar, fact, fiscal_period):
    """Days between the fact's period and the period the calendar expects for its cell (None if unknown)."""
    expected = _expected_period(calendar, fact.end, fiscal_period)
    if expected is None:
        return None
    off = abs((_parse(fact.end) - expected[1]).days)
    if fact.start:
        off += abs((_parse(fact.start) - expected[0]).days)
    return off


def _same_period(start, end, other_start, other_end, tolerance=TRANSITION_PERIOD_TOLERANCE_DAYS):
    if abs((_parse(end) - _parse(other_end)).days) > tolerance:
        return False
    if start is None or other_start is None:
        return start is None and other_start is None
    return abs((_parse(start) - _parse(other_start)).days) <= tolerance


def normalize_company(cik, raw_facts, registry, profile=None, filing_metadata=None,
                      calendar=None, revenue_evidence=None):
    """Turn an iterable of RawFact into a CompanyFactBook of PIT timelines."""
    raw_facts = list(raw_facts)
    issues = []
    unplaced = []   # (metric, period_end, available) the calendar could not place (1.20.0)
    availability = build_availability_map(filing_metadata)

    if calendar is None:
        calendar = FiscalCalendar.from_raw_facts(
            cik, raw_facts,
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
    stats = {"raw_facts": len(raw_facts), "mapped": 0, "unmapped": 0, "duplicates": 0}
    filing_currency = _filing_currencies(raw_facts)
    deferred = []   # transition-report facts, placed once every regular period is known (1.22.0)

    def admit(metric_name, priority, fact, fiscal_year, fiscal_period, definition, is_cover_date):
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

    for fact in raw_facts:
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
                # 1.20.0: an unplaceable period (a quarter of a transition year)
                # still proves that newer information exists - a trailing window
                # ending before it is not current (Red Team: e.l.f. Beauty 2019).
                unplaced.append((metric_name, fact.end, fact.available_from or fact.filed))
                continue

            if fact.form in TRANSITION_FORMS:
                deferred.append((metric_name, priority, fact, fiscal_year, fiscal_period, definition,
                                 is_cover_date))
                continue
            admit(metric_name, priority, fact, fiscal_year, fiscal_period, definition, is_cover_date)

    # 1.22.0 (F-TTM-6): a transition report's value enters a cell only with the
    # period the fiscal calendar expects for that cell. Never 10-K semantics on
    # an old-basis period; a value that does not fit stays out (missing, not wrong).
    regular_periods = defaultdict(set)
    for (_, fiscal_year, fiscal_period, _), entries in candidates.items():
        for _, fact in entries:
            if not (fact.taxonomy == "dei" and fact.start is None):
                regular_periods[(fiscal_year, fiscal_period, fact.start is None)].add(
                    (fact.start, fact.end, str(fact.available_from or fact.filed)))

    def unanimous(periods):
        periods = list(periods)
        return bool(periods) and all(_same_period(s, e, periods[0][0], periods[0][1]) for s, e in periods)

    last_observed_end = max(calendar.fy_ends) if calendar.fy_ends else None

    def projected_forward(day):
        _, fy_end = calendar._boundaries_covering(day)
        return fy_end is None or last_observed_end is None or (
            (fy_end - last_observed_end).days > FY_BOUNDARY_TOLERANCE_DAYS)

    def closed_period_end(cover_date):
        previous, fy_end = calendar._boundaries_covering(cover_date)
        if previous is None or fy_end is None:
            return None
        day = _parse(cover_date)
        closed = [end for end in calendar.quarter_ends(previous, fy_end) if end <= day]
        return closed[-1] if closed else previous

    for metric_name, priority, fact, fiscal_year, fiscal_period, definition, is_cover_date in deferred:
        if is_cover_date:
            closed = closed_period_end(fact.end)
            fits = closed is not None and not projected_forward(closed)
        else:
            observed_year = not projected_forward(fact.end)
            expected = _expected_period(calendar, fact.end, fiscal_period)
            known = str(fact.available_from or fact.filed)
            regular = [(s, e) for s, e, available in
                       regular_periods.get((fiscal_year, fiscal_period, fact.start is None), ())
                       if available[:10] <= known[:10]]
            fits = observed_year and (
                (expected is not None and _same_period(fact.start, fact.end, expected[0] if fact.start else None,
                                                       expected[1]))
                or (unanimous(regular) and _same_period(fact.start, fact.end, *next(iter(regular)))))
        if not fits:
            issues.append(_issue(ISSUE_UNPLACEABLE_PERIOD, fact,
                                 "transition-report period is not the period of its fiscal cell",
                                 metric=metric_name))
            unplaced.append((metric_name, fact.end, fact.available_from or fact.filed))
            continue
        admit(metric_name, priority, fact, fiscal_year, fiscal_period, definition, is_cover_date)

    factbook = CompanyFactBook(cik, calendar=calendar, profile=profile)
    registry_version = registry.version
    distinct_classes = {}

    for (metric_name, fiscal_year, fiscal_period, accession), entries in candidates.items():
        # One filing placing two different periods into one cell (VF Corp 10-K
        # 2019 after its fiscal-year change: Oct-Dec 2018 and Jan-Mar 2019 both
        # in FY2019 Q4) cannot say which one the cell is. Keeping the first
        # published a stale TTM as current (red team, HIGH-2). The cell stays
        # empty and is marked, so a trailing window does not skip over it.
        # Durations only: an instant cell legitimately carries a cover date next
        # to the balance-sheet date (handled below as COVER_DATE_INSTANT).
        period_ends = sorted({fact.end for _, fact in entries if fact.end and fact.start})
        if registry.get(metric_name).kind == KIND_DURATION and len(period_ends) > 1 and (_parse(period_ends[-1]) - _parse(period_ends[0])).days > AMBIGUOUS_PERIOD_DAYS:
            issues.append(_issue(ISSUE_AMBIGUOUS_PERIOD, entries[0][1],
                                 f"one filing reports {len(period_ends)} periods for this cell; cell left empty"))
            factbook.mark_ambiguous(metric_name, fiscal_year, fiscal_period, entries[0][1].filed)
            continue
        # A filing's statements are in one currency. A fact in another currency
        # (CECO 10-K FY2025: Revenues 750 million EUR, the same amount in every
        # filing since 2024, next to 774.4 million USD contract revenue) is a
        # disclosure, not the statement line, and must not win on concept
        # priority. Only decides between currencies; within one, priority rules.
        reporting = filing_currency.get(accession)
        entries.sort(key=lambda item: (
            reporting is not None and _currency(item[1].unit) not in (None, reporting),
            item[0]))
        candidates_in_filing = entries
        # 1.23.0 (F-TTM-7): does this filing show two economic classes of the metric
        # with different values for one period (non-controlling interests, preferred
        # dividends, discontinued operations)? Then the classes are told apart.
        # Recorded per pair of classes: preferred dividends tell owners' net income
        # from income available to common, not from consolidated profit (Mobiquity).
        by_class = {}
        for _, other in entries:
            by_class.setdefault(economic_class(other.concept), other.value)
        for first, a in by_class.items():
            for second, b in by_class.items():
                if first < second and abs(a - b) > CONCEPT_DISAGREEMENT_TOLERANCE * max(abs(a), abs(b), 1.0):
                    distinct_classes.setdefault((metric_name, fiscal_year, fiscal_period), set()).add((first, second))
        decided = _drop_partial_aggregates(
            entries, registry.get(metric_name), accession,
            load_revenue_evidence() if revenue_evidence is None else revenue_evidence)
        if decided is None:
            issues.append(_issue(ISSUE_AMBIGUOUS_AGGREGATE, entries[0][1],
                                 "aggregate smaller than another concept without filing evidence; cell left empty"))
            continue
        entries = decided
        best_priority, fact = entries[0]
        flags = []

        # More than one accepted concept in the same filing for the same cell:
        # the registry's priority decides, and a material disagreement is
        # reported rather than averaged away.
        # A dropped partial aggregate still disagrees and is reported, not hidden.
        rivals = [other for priority, other in candidates_in_filing if other is not fact]
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
            flags=flags + _alternate_flags(fact, rivals),
            period_start=fact.start,
            period_end=period_end,
            fit=0 if fact.taxonomy == "dei" and fact.start is None else _slot_fit(calendar, fact, fiscal_period),
        )
        factbook.add_observation(metric_name, fiscal_year, fiscal_period, observation)
        stats["mapped"] += 1

    for metric_name, period_end, available in unplaced:
        factbook.note_unplaced(metric_name, period_end, available)
    # per cell: the classes are told apart for the period whose own filings show
    # them different (a filer with NCI in 2012 may have none in 2021: Mobiquity's
    # ProfitLoss restatement of 2021 is a version of its net income)
    for key, timeline in factbook.timelines.items():
        timeline.distinguish_classes = distinct_classes.get(key, set())
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
