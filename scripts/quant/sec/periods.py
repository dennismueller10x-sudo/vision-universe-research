"""Period-aware, point-in-time resolution of quarters, years and TTM.

SEC facts are not a clean quarterly grid. A 10-Q may report only the cumulative
year-to-date figure; a 10-K reports the full year but rarely a standalone Q4.
Adding those up naively double-counts. This module reconstructs standalone
quarters by de-accumulation, and it does so *inside* the point-in-time window:
every input must itself have been publicly available at `as_of`, so a
reconstructed quarter can never be more current than its ingredients.

Labels used in storage:
  Q1..Q4  standalone quarter (duration) or balance-sheet date (instant)
  YTD2    cumulative first half        YTD3  cumulative nine months
  FY      full fiscal year (duration) or fiscal-year-end balance sheet (instant)
"""
import dataclasses
import logging
from datetime import date, timedelta

from .model import (
    NormalizedFact, Provenance, SOURCE_SEC, TRANSFORM_NONE, TRANSFORM_YTD_DIFF,
    TRANSFORM_FY_MINUS_YTD, TRANSFORM_SUM, QUALITY_HIGH, QUALITY_MEDIUM,
    PERIOD_QUARTER, PERIOD_ANNUAL, PERIOD_INSTANT, PERIOD_TTM,
    MISSING_XBRL_CONCEPT, INSUFFICIENT_HISTORY, NOT_APPLICABLE_FOR_SECTOR,
    NOT_YET_AVAILABLE, PERIOD_MISMATCH, TTM_PERIODS_NOT_CONTIGUOUS, TTM_STUB_PERIOD, TTM_WINDOW_NOT_CURRENT, TTM_CONCEPT_MISMATCH,
    TTM_SHARE_BASIS_INCONSISTENT, TTM_EPS_INCONSISTENT, TTM_UNIT_MISMATCH, TTM_BASIS_MIXED, missing,
)
from .registry import KIND_INSTANT
from .restatements import CONTINUING_PER_SHARE, POLICY_AS_OF_LATEST, POLICY_LATEST_KNOWN, Observation, economic_class, sign_slip, to_instant, told_apart

LOGGER = logging.getLogger("vu.sec.periods")

QUARTERS = ("Q1", "Q2", "Q3", "Q4")
CUMULATIVE_LABELS = {2: "YTD2", 3: "YTD3", 4: "FY"}
CLASS_READING_ORDER = ("primary", "available_to_common", "consolidated_including_nci")
FLAG_PERIOD_TRANSFORM = "VU_PERIOD_TRANSFORM"
MAX_FIXPOINT_PASSES = 8

# TTM-Integritaet. Abstand zweier Quartalsenden: 12 bis 17 Wochen (52/53-
# Wochen-Jahre: 12/12/12/16 bzw. 17 Wochen, PepsiCo), mit einer Woche Spiel.
TTM_GAP_DAYS = (77, 126)
# 1.20.0 Stub-Policy. NORMAL_QUARTER: ein Fiskalquartal von 11-17 Wochen (77-119 Tage;
# 12/12/12/16-Wochen-Kalender wie PepsiCo). SHORT_STUB (< 77) und LONG_STUB (> 119) sind
# NOT_QUARTER_ELIGIBLE. Entscheidend ist das Fenster: vier Perioden als luecken- und
# ueberlappungsfreie Kette (Beginn -3 bis +8 Tage um das Ende der vorigen), zusammen ein
# Geschaeftsjahr von 357-374 Tagen (52 Wochen 364, 53 Wochen 371, Kalenderjahr 365/366,
# plus Datumskonventionen). Eine Rumpfperiode nach Fresh Start oder Gruendung macht das
# Fenster laenger (Denbury 2020-09-19..2021-09-30: 377 Tage) und ergibt kein TTM.
TTM_QUARTER_DAYS = (77, 119)
TTM_CHAIN_GAP_DAYS = 7
# A quarter may start up to 3 days before the previous one ends (date conventions:
# Loews Q1 2011 from 2010-12-30, Vishay Q4 2015 from 2015-10-01 after Q3 to 10-03).
TTM_CHAIN_OVERLAP_DAYS = 3
TTM_SPAN_DAYS = (357, 374)
# A published fiscal year ending this much after the window's last quarter
# makes the window stale.
TTM_STALE_DAYS = 7
# Abweichung zweier Konzepte derselben Einreichung, ab der sie verschiedene
# Groessen messen (Murphy Oil: Revenues 928,3 vs. Vertragsumsatz 926,3 Mio.).
TTM_CONCEPT_TOLERANCE = 0.005
# Verhaeltnis der Aktienbasis zweier Quartale, ab dem das Fenster einen Split
# oder eine Kapitalmassnahme enthaelt (Piper Sandler 4:1: 17,8 -> 71,2 Mio.).
TTM_SHARE_BASIS_JUMP = 1.5
# Je-Aktie-Konzepte der fortgefuehrten Bereiche. Gesamt-EPS (inkl. aufgegebener
# Bereiche) und fortgefuehrtes EPS sind verschiedene Groessen (Capital Southwest).
# 1.23.0 (M-2): a contradiction between two filings of a TTM window is a change of
# reporting basis when it is material: more than 10 % of the value and more than
# 1 % of the largest value both filings share (near zero, relative noise is no basis).
BASIS_CHANGE_RELATIVE = 0.10
BASIS_CHANGE_FLOOR = 0.01
TTM_SHARE_METRICS = {"eps_diluted": "diluted_weighted_average_shares",
                     "eps_basic": "basic_weighted_average_shares"}
# Ein Splitverhaeltnis unter 1,5 (5:4, 4:3) zwischen zwei aufeinanderfolgenden
# Quartalen ist ebenfalls ein Basiswechsel (Neogen 4:3: 1,28 statt 1,12).
SPLIT_RATIOS = (5 / 4, 4 / 3, 3 / 2, 5 / 3, 2.0, 5 / 2, 3.0, 4.0, 5.0, 10.0)
SPLIT_RATIO_TOLERANCE = 0.025
SPLIT_RATIO_MIN = 1.2
# Ergebnis / EPS darf nicht um eine Groessenordnung von der Aktienzahl abweichen
# (Churchill Downs Q1 2020: EPS -590000 statt -0,59).
EPS_CONSISTENCY_FACTOR = 10.0
# Implizite Aktienzahl (Ergebnis / EPS) nur, wo das gerundete EPS sie traegt.
TTM_IMPLIED_MIN_EPS = 0.05
TTM_MIN_SHARES = 1000.0


ALTERNATE_PREFIX = "ALT:"  # normalize.FLAG_ALTERNATE_PREFIX


def _alternates(observation):
    """{concept: (taxonomy, value)} of the other concepts the same filing reported."""
    out = {}
    for flag in observation.flags or []:
        if not flag.startswith(ALTERNATE_PREFIX):
            continue
        key, _, raw = flag[len(ALTERNATE_PREFIX):].rpartition("=")
        taxonomy, _, concept = key.partition(":")
        try:
            out[concept] = (taxonomy, float(raw))
        except ValueError:
            continue
    return out


def _same_quarter(a, b):
    """Two observations of the same reported quarter (ends within a week)."""
    if not a.period_end or not b.period_end:
        return False
    return abs((date.fromisoformat(str(a.period_end)[:10]) - date.fromisoformat(str(b.period_end)[:10])).days) <= 7


def _in_class(observation, wanted):
    """The observation read in economic class `wanted` (itself or a same-filing alternate), or None."""
    if economic_class(observation.provenance.concept) == wanted:
        return observation
    for concept, (taxonomy, value) in sorted(_alternates(observation).items()):
        if economic_class(concept) == wanted:
            return _as_concept(observation, taxonomy, concept, value)
    return None


def _as_concept(observation, taxonomy, concept, value):
    """The same filing's cell, read under another concept it also reported."""
    # the audit trail names the concept actually read (red team R4 LOW-2)
    old = f"{observation.provenance.taxonomy}:{observation.provenance.concept}|"
    inputs = [f"{taxonomy}:{concept}|" + item[len(old):] if item.startswith(old) else item
              for item in (observation.provenance.inputs or [])]
    return Observation(
        value=value, unit=observation.unit,
        provenance=dataclasses.replace(observation.provenance, taxonomy=taxonomy, concept=concept, inputs=inputs),
        available_from=observation.available_from, filed=observation.filed,
        quality=observation.quality,
        flags=[flag for flag in observation.flags if not flag.startswith(ALTERNATE_PREFIX)],
        period_start=observation.period_start, period_end=observation.period_end,
    )


def _combine(observations, value, transformation, unit):
    """Build an observation derived from several point-in-time observations.

    Availability is the LATEST of the inputs: a reconstructed number is only
    known once its last ingredient has been published.
    """
    latest = max(observations, key=lambda obs: to_instant(obs.available_from or obs.filed))
    inputs = []
    for obs in observations:
        inputs.extend(obs.provenance.inputs or [])
    provenance = Provenance(
        source=SOURCE_SEC,
        taxonomy=latest.provenance.taxonomy,
        concept=latest.provenance.concept,
        accession=latest.provenance.accession,
        form=latest.provenance.form,
        filed=latest.filed,
        available_from=latest.available_from,
        retrieved_at=latest.provenance.retrieved_at,
        transformation=transformation,
        inputs=inputs,
        registry_version=latest.provenance.registry_version,
        normalization_version=latest.provenance.normalization_version,
    )
    flags = sorted({flag for obs in observations for flag in obs.flags
                    if not flag.startswith(ALTERNATE_PREFIX)} | {FLAG_PERIOD_TRANSFORM})
    quality = QUALITY_MEDIUM if any(obs.quality != QUALITY_HIGH for obs in observations) else QUALITY_HIGH
    return Observation(
        value=value, unit=unit, provenance=provenance,
        available_from=latest.available_from, filed=latest.filed,
        quality=quality, flags=flags,
        period_start=min((obs.period_start for obs in observations if obs.period_start), default=None),
        period_end=max((obs.period_end for obs in observations if obs.period_end), default=None),
    )


def _same_start(current, previous):
    """Two cumulative points of one fiscal year begin on the same day (+-8 days)."""
    if not current.period_start or not previous.period_start:
        return False
    a = date.fromisoformat(str(current.period_start)[:10])
    b = date.fromisoformat(str(previous.period_start)[:10])
    return abs((a - b).days) <= TTM_CHAIN_GAP_DAYS + 1


class PeriodResolver:
    """Resolves canonical periods for one company at a given point in time."""

    def __init__(self, factbook, registry):
        self.factbook = factbook
        self.registry = registry
        self.profile = factbook.profile
        self._periods_by_filing = {}
        self._blocked = registry.not_applicable_metrics(
            getattr(factbook.profile, "sic", None)
        ) if factbook.profile else {}

    # ------------------------------------------------------------------ helpers

    def sector_block(self, metric):
        return self._blocked.get(metric)

    def _raw(self, metric, fiscal_year, fiscal_period, as_of, policy, lag_days):
        return self.factbook.resolve(metric, fiscal_year, fiscal_period,
                                     as_of=as_of, policy=policy, lag_days=lag_days)

    def _definition(self, metric):
        return self.registry.get(metric)

    # ------------------------------------------------------- quarterly grid

    def quarter_grid(self, metric, fiscal_year, as_of, policy=POLICY_AS_OF_LATEST,
                     lag_days=0):
        """Standalone Q1..Q4 for one fiscal year, reconstructing what is missing.

        Returns {1..4: Observation or None}. Only facts visible at `as_of`
        participate, so the grid is a true point-in-time view.
        """
        definition = self._definition(metric)
        if definition is None:
            return {index: None for index in range(1, 5)}

        natives = {
            index: self._raw(metric, fiscal_year, f"Q{index}", as_of, policy, lag_days)
            for index in range(1, 5)
        }
        # 1.20.0 (Red Team HIGH-2): a cell whose visible filings disagree at the
        # same instant is AMBIGUOUS_SAME_DAY, not missing - it is never replaced
        # by a difference of cumulative points (Rayonier 2013 Q2: YTD2 restated
        # minus Q1 unrestated gave -131.8 million).
        ambiguous = {index for index in range(1, 5)
                     if natives[index] is None and self._has_visible(metric, fiscal_year, f"Q{index}", as_of, lag_days)}
        if definition.kind == KIND_INSTANT:
            # Balance-sheet dates are already standalone; nothing to de-accumulate.
            return self._on_calendar(fiscal_year, natives)
        if not definition.is_additive:
            # Per-share amounts and averages are not additive: each period divides by its own
            # weighted share count, so FY - 9M or H1 - Q1 is not the quarter's EPS.
            # Replimune FY2021 Q4: reported -0.42, FY minus nine months gave -0.41.
            # The same holds for weighted average share counts (E12).
            # Only reported quarters count; an unreported one stays a gap.
            return self._on_calendar(fiscal_year, natives)

        # Concepts behind each observation in this grid. A difference of two
        # cumulative points is a quarter only within ONE concept. NTRS reports
        # total revenue (Revenues 8,086 million) AND contract revenue (5,018
        # million) in the 10-K but only contract revenue in its 10-Qs; FY minus
        # nine months across the two gave a "Q4" of 4,376 million. Where a filing
        # also reported the other point's concept (ALT flags), the quarter is
        # derived in that shared concept (5,018 - 3,710 = 1,307 million). Where
        # neither filing reported the other's concept there is no evidence that
        # the two tags measure different things (NVDA FY2021: 10-K contract
        # revenue, 10-Qs Revenues) and the quarter is derived as before.
        concepts = {}

        def concepts_of(observation):
            return concepts.get(id(observation)) or {observation.provenance.concept}

        cumulative = {0: None}
        for index in range(1, 5):
            label = CUMULATIVE_LABELS.get(index)
            cumulative[index] = (
                natives[1] if index == 1
                else self._raw(metric, fiscal_year, label, as_of, policy, lag_days)
            )

        for _ in range(MAX_FIXPOINT_PASSES):
            changed = False

            # Cumulative from standalone quarters (Q1+..+Qn).
            for index in range(1, 5):
                if cumulative[index] is not None:
                    continue
                parts = [natives[step] for step in range(1, index + 1)]
                if all(part is not None for part in parts):
                    total = sum(part.value for part in parts)
                    cumulative[index] = _combine(parts, total, TRANSFORM_SUM, parts[-1].unit)
                    concepts[id(cumulative[index])] = set().union(*(concepts_of(part) for part in parts))
                    changed = True

            # Standalone quarter from two cumulative points (YTDn - YTDn-1).
            for index in range(1, 5):
                if natives[index] is not None or index in ambiguous:
                    continue
                current = cumulative[index]
                if current is None:
                    continue
                if index == 1:
                    natives[1] = current
                    changed = True
                    continue
                previous = cumulative[index - 1]
                if previous is None:
                    continue
                # The two cumulative points must actually be ordered in time.
                # If the longer period ends BEFORE the shorter one, they do not
                # belong to the same fiscal year — the calendar misplaced one of
                # them, which happens in the sparse first XBRL years. Subtracting
                # them would produce a confident, wrong number for a quarter that
                # does not exist (measured on NVDA: operatingIncome for a
                # "FY2010 Q4" ending 2010-10-31, the same date as Q3). A gap is
                # the honest answer.
                if current.period_end and previous.period_end \
                        and current.period_end <= previous.period_end:
                    LOGGER.warning(
                        "cik=%s %s FY%s Q%d: cumulative periods out of order "
                        "(%s <= %s); refusing to reconstruct",
                        self.factbook.cik, metric, fiscal_year, index,
                        current.period_end, previous.period_end)
                    continue
                # 1.20.0 (Red Team HIGH-1): a difference is a quarter only if both
                # cumulative points start on the same day (+-8). Best Buy FY2013
                # (11-month transition year): FY 2012-03-04.. minus YTD3
                # 2012-01-29.. gave a "Q4" of 10.73 billion; Wendy's FY2009:
                # restated FY minus an older YTD3 with another start, Q4 -242.8M.
                if not _same_start(current, previous):
                    continue
                shared = concepts_of(current) & concepts_of(previous)
                if not shared:
                    alt_current, alt_previous = _alternates(current), _alternates(previous)
                    for concept in sorted(concepts_of(previous)):
                        if concept in alt_current:
                            taxonomy, value = alt_current[concept]
                            current = _as_concept(current, taxonomy, concept, value)
                            shared = {concept}
                            break
                    if not shared:
                        for concept in sorted(concepts_of(current)):
                            if concept in alt_previous:
                                taxonomy, value = alt_previous[concept]
                                previous = _as_concept(previous, taxonomy, concept, value)
                                shared = {concept}
                                break
                    if not shared:
                        # No shared concept and no evidence of a difference.
                        shared = concepts_of(current) | concepts_of(previous)
                # 1.23.0 (F-TTM-7, red team HIGH-1): a difference of two economic
                # classes is no quarter (Interactive Brokers Q4 2013: owners' FY net
                # income 37.0 million minus nine months of consolidated profit
                # including non-controlling interests).
                cumulative_cells = [(fiscal_year, CUMULATIVE_LABELS.get(step, f"Q{step}")) for step in (index, index - 1)]
                if self._classes_distinct(metric, cumulative_cells,
                                          {economic_class(c) for c in concepts_of(current) | concepts_of(previous)},
                                          as_of, policy, lag_days) and \
                        {economic_class(c) for c in concepts_of(current)} != \
                        {economic_class(c) for c in concepts_of(previous)}:
                    continue
                transformation = TRANSFORM_FY_MINUS_YTD if index == 4 else TRANSFORM_YTD_DIFF
                natives[index] = _combine(
                    [current, previous], current.value - previous.value,
                    transformation, current.unit,
                )
                # 1.20.0: the difference covers the days after the subtracted
                # cumulative period - not the whole year (_combine takes the
                # earliest start). The TTM chain reads real periods.
                if previous.period_end:
                    natives[index].period_start = (
                        date.fromisoformat(str(previous.period_end)[:10]) + timedelta(days=1)).isoformat()
                concepts[id(natives[index])] = shared
                changed = True

            if not changed:
                break

        return self._on_calendar(fiscal_year, natives)

    def _has_visible(self, metric, fiscal_year, fiscal_period, as_of, lag_days):
        timeline = self.factbook.get(metric, fiscal_year, fiscal_period)
        return bool(timeline is not None and timeline.visible(as_of, lag_days=lag_days))

    def _on_calendar(self, fiscal_year, cells):
        """1.20.0 (Red Team MEDIUM-2): a quarter cell exists only on its calendar slot.

        A cell whose period end the fiscal calendar places elsewhere - every
        cell of a transition year, which has no quarter slots - is dropped,
        so the quarterly series and the TTM agree with quarter_index."""
        calendar = getattr(self.factbook, "calendar", None)
        if calendar is None:
            return cells
        out = {}
        for index, cell in cells.items():
            if cell is not None and cell.period_end:
                end = str(cell.period_end)[:10]
                if calendar.fiscal_year_for(end) != fiscal_year or calendar.quarter_index(end) != index:
                    cell = None
            out[index] = cell
        return out

    # ------------------------------------------------------------ public reads

    def quarter(self, metric, fiscal_year, quarter_index, as_of,
                policy=POLICY_AS_OF_LATEST, lag_days=0):
        blocked = self.sector_block(metric)
        if blocked:
            return self._not_applicable(metric, blocked, fiscal_year, f"Q{quarter_index}")
        grid = self.quarter_grid(metric, fiscal_year, as_of, policy, lag_days)
        observation = grid.get(quarter_index)
        if observation is None:
            return missing(self.factbook.cik, metric, MISSING_XBRL_CONCEPT,
                           fiscal_year=fiscal_year, fiscal_period=f"Q{quarter_index}")
        kind = PERIOD_INSTANT if self._definition(metric).kind == KIND_INSTANT else PERIOD_QUARTER
        return self._to_fact(metric, observation, fiscal_year, f"Q{quarter_index}", kind)

    def annual(self, metric, fiscal_year, as_of, policy=POLICY_AS_OF_LATEST, lag_days=0):
        blocked = self.sector_block(metric)
        if blocked:
            return self._not_applicable(metric, blocked, fiscal_year, "FY")
        observation = self._raw(metric, fiscal_year, "FY", as_of, policy, lag_days)
        if observation is None and self._definition(metric) is not None \
                and self._definition(metric).kind != KIND_INSTANT \
                and self._definition(metric).is_additive:
            grid = self.quarter_grid(metric, fiscal_year, as_of, policy, lag_days)
            parts = [grid[index] for index in range(1, 5)]
            if all(part is not None for part in parts):
                observation = _combine(parts, sum(part.value for part in parts),
                                       TRANSFORM_SUM, parts[0].unit)
        if observation is None:
            return missing(self.factbook.cik, metric, MISSING_XBRL_CONCEPT,
                           fiscal_year=fiscal_year, fiscal_period="FY")
        kind = PERIOD_INSTANT if self._definition(metric).kind == KIND_INSTANT else PERIOD_ANNUAL
        return self._to_fact(metric, observation, fiscal_year, "FY", kind)

    def latest_quarters(self, metric, as_of, count=4, policy=POLICY_AS_OF_LATEST,
                        lag_days=0):
        """The `count` most recent standalone quarters visible at as_of, newest first."""
        found = []
        for fiscal_year in reversed(self.factbook.fiscal_years()):
            grid = self.quarter_grid(metric, fiscal_year, as_of, policy, lag_days)
            for index in (4, 3, 2, 1):
                observation = grid.get(index)
                if observation is None and self.factbook.is_ambiguous(metric, fiscal_year, f"Q{index}", as_of):
                    # The newest quarter exists but its period is ambiguous: an
                    # older window is not "trailing" (VF Corp 2019, HIGH-2).
                    return found[:count] if len(found) >= count else []
                if observation is not None:
                    found.append((fiscal_year, index, observation))
                elif found:
                    # A hole inside the window makes a TTM sum wrong, so stop.
                    return found[:count]
                if len(found) >= count:
                    return found
        return found[:count]

    def ttm(self, metric, as_of, policy=POLICY_AS_OF_LATEST, lag_days=0):
        """Trailing twelve months from the four most recent quarters at as_of.

        Never uses a full-year figure that covers periods the market did not yet
        know about, and never mixes a cumulative YTD number into the sum.
        """
        blocked = self.sector_block(metric)
        if blocked:
            return self._not_applicable(metric, blocked, None, PERIOD_TTM)
        definition = self._definition(metric)
        if definition is None:
            return missing(self.factbook.cik, metric, MISSING_XBRL_CONCEPT,
                           fiscal_period=PERIOD_TTM)
        if definition.kind == KIND_INSTANT:
            # A balance-sheet item has no trailing sum; the latest point applies.
            return self.latest_instant(metric, as_of, policy=policy, lag_days=lag_days)

        quarters = self.latest_quarters(metric, as_of, count=4, policy=policy, lag_days=lag_days)
        if len(quarters) < 4:
            return missing(self.factbook.cik, metric, INSUFFICIENT_HISTORY,
                           fiscal_period=PERIOD_TTM)
        # A trailing window ends no earlier than the newest published fiscal
        # year. VF Corp after its fiscal-year change (December -> March): the
        # calendar filed Jan-Mar 2018 as FY2019 Q1 and the window ended
        # 2018-12-29 although the year to 2019-03-30 was published (red team,
        # HIGH-2: TTM 3.45 instead of 3.14, labelled current).
        window_end = to_instant(quarters[0][2].period_end)
        for fiscal_year in self.factbook.fiscal_years():
            year = self._raw(metric, fiscal_year, "FY", as_of, policy, lag_days)
            if year is not None and year.period_end and window_end is not None \
                    and (to_instant(year.period_end) - window_end).days > TTM_STALE_DAYS:
                return missing(self.factbook.cik, metric, TTM_PERIODS_NOT_CONTIGUOUS,
                               fiscal_year=quarters[0][0], fiscal_period=PERIOD_TTM)
        # 1.20.0 (Red Team): any newer visible period of this metric - also one
        # the calendar could not place (a transition-year quarter) - means the
        # window is not trailing. e.l.f. Beauty 2019-08-20: the window ended
        # 2018-12-31 although 2019-06-30 was filed (EPS 0.32 labelled current).
        newest = self.factbook.newest_period_end(metric, as_of, lag_days=lag_days)
        if newest and window_end is not None and (to_instant(newest) - window_end).days > TTM_STALE_DAYS:
            return missing(self.factbook.cik, metric, TTM_WINDOW_NOT_CURRENT,
                           fiscal_year=quarters[0][0], fiscal_period=PERIOD_TTM)
        return self._ttm_fact(metric, quarters, as_of, policy, lag_days)

    def _ttm_fact(self, metric, quarters, as_of, policy, lag_days):
        """Sum of four quarters [(fiscal_year, index, observation)], newest first - or the reason there is none."""
        fiscal_year, quarter_index = quarters[0][0], quarters[0][1]
        observations, reason, flags = self._ttm_window(metric, quarters, as_of, policy, lag_days)
        if reason:
            return missing(self.factbook.cik, metric, reason,
                           fiscal_year=fiscal_year, fiscal_period=PERIOD_TTM)
        combined = _combine(observations, sum(obs.value for obs in observations),
                            TRANSFORM_SUM, observations[0].unit)
        fact = self._to_fact(metric, combined, fiscal_year, PERIOD_TTM, PERIOD_TTM)
        fact.flags = sorted(set(fact.flags) | set(flags) | {f"TTM_THROUGH_FY{fiscal_year}Q{quarter_index}"})
        return fact

    def _ttm_window(self, metric, quarters, as_of, policy, lag_days):
        """Integrity of a TTM window: (observations, reason, flags).

        1. Periods: four different quarter ends, each 12-17 weeks after the
           previous one. FUBO's fiscal-year change put one quarter into two grid
           slots (TTM revenue 6.09 billion with 1.48 billion counted twice).
        2. Concepts: per-share quarters from one class (total vs. continuing
           operations). An additive metric whose quarters switch concept is
           summed as reported unless a filing of the window shows the two
           concepts differ; then the window is read in a concept every quarter
           reported (ALT flags), otherwise there is no TTM.
        3. Share basis (per share): weighted shares, or net income / EPS, may
           not jump by a split ratio inside the window.
        """
        observations = [item[2] for item in quarters]
        if len({obs.unit for obs in observations}) > 1:
            # CAD next to USD (Viscount Systems 2012) is not one sum.
            return observations, TTM_UNIT_MISMATCH, []
        ends = [str(obs.period_end or "")[:10] for obs in observations]
        if not all(ends) or len(set(ends)) != len(ends):
            return observations, TTM_PERIODS_NOT_CONTIGUOUS, []
        dates = [to_instant(end) for end in ends]
        for newer, older in zip(dates, dates[1:]):
            if not TTM_GAP_DAYS[0] <= (newer - older).days <= TTM_GAP_DAYS[1]:
                return observations, TTM_PERIODS_NOT_CONTIGUOUS, []
        # 1.20.0: die Kette aus tatsaechlichen Perioden (Beginn/Ende), nicht aus Labels.
        starts = [str(obs.period_start or "")[:10] for obs in observations]
        if not all(starts):
            return observations, TTM_PERIODS_NOT_CONTIGUOUS, []
        begins = [to_instant(start) for start in starts]
        for begin, end in zip(begins, dates):
            if not TTM_QUARTER_DAYS[0] <= (end - begin).days + 1 <= TTM_QUARTER_DAYS[1]:
                return observations, TTM_STUB_PERIOD, []
        # observations: newest first - each quarter begins right after the older one ends
        for newer_begin, older_end in zip(begins, dates[1:]):
            if not -TTM_CHAIN_OVERLAP_DAYS <= (newer_begin - older_end).days <= TTM_CHAIN_GAP_DAYS + 1:
                return observations, TTM_PERIODS_NOT_CONTIGUOUS, []
        if not TTM_SPAN_DAYS[0] <= (dates[0] - begins[-1]).days + 1 <= TTM_SPAN_DAYS[1]:
            return observations, TTM_STUB_PERIOD, []
        # 1.23.0 (M-2): one reporting basis. If a newer filing of the window states
        # another value for a period an older filing of the window also states,
        # the older filing's quarters belong to another basis (Dawson Geophysical
        # 2015: the 10-QT of the accounting acquirer next to three quarters of the
        # registrant TGC). Predecessor/successor identity is what the filings say
        # about each other - no threshold, no name.
        if self._basis_mixed(metric, observations):
            return observations, TTM_BASIS_MIXED, []

        definition = self._definition(metric)
        if definition.is_per_share:
            classes = {obs.provenance.concept in CONTINUING_PER_SHARE for obs in observations}
            # An EPS TTM is total EPS. A window wholly of continuing-operations EPS
            # (VF Corp 10-K 2011: quarterly comparatives only as continuing EPS, the
            # latest view moved all four quarters onto it) is a different measure
            # and was published unmarked as eps_diluted (TTM holdout, F-TTM-1).
            if len(classes) > 1 or classes == {True}:
                return observations, TTM_CONCEPT_MISMATCH, []
            basis = self._share_basis_jumps(metric, quarters, as_of, policy, lag_days)
            if basis:
                return observations, basis, []
            return observations, None, []

        concepts = {obs.provenance.concept for obs in observations}
        if len(concepts) == 1:
            return observations, None, []
        # 1.23.0 (F-TTM-7, red team HIGH-1): one economic class per window, as for
        # EPS. Owners' net income next to consolidated profit including NCI is not
        # one sum (Interactive Brokers 2014, Amplify 2014, Seaboard 2020): read the
        # window in one concept every quarter's filing reported, otherwise no TTM.
        # Evidence is per class pair and includes the cumulative cells a quarter is
        # read from or derived out of (IBKR Q4 2013 from FY and nine months 2013).
        if len({economic_class(concept) for concept in concepts}) > 1 and \
                self._classes_distinct(metric, [(year, label) for year, index, _ in quarters
                                                for label in {f"Q{index}", CUMULATIVE_LABELS.get(index, "Q1"),
                                                              CUMULATIVE_LABELS.get(index - 1, "Q1")}],
                                       {economic_class(concept) for concept in concepts}, as_of, policy, lag_days):
            same_class, mixed = self._window_in_one_class(metric, quarters, as_of, policy, lag_days, observations)
            if same_class is not None:
                # the flag names the class read (red team R5 MEDIUM-2): a consolidated
                # TTM is not the owners' annual net income
                read_class = economic_class(same_class[0].provenance.concept)
                return same_class, None, ["TTM_CLASS_ALIGNED", f"TTM_CLASS_{read_class.upper()}"]
            if mixed is not None:
                return mixed, TTM_BASIS_MIXED, []
            for rule in definition.concepts:
                aligned = []
                for obs in observations:
                    if obs.provenance.concept == rule.concept:
                        aligned.append(obs)
                        continue
                    alternate = _alternates(obs).get(rule.concept)
                    if alternate is None:
                        break
                    aligned.append(_as_concept(obs, alternate[0], rule.concept, alternate[1]))
                if len(aligned) == len(observations):
                    if self._basis_mixed(metric, aligned):
                        return aligned, TTM_BASIS_MIXED, []
                    return aligned, None, [f"TTM_CONCEPT_ALIGNED_{rule.concept}"]
            return observations, TTM_CONCEPT_MISMATCH, []
        differ = False
        for obs in observations:
            for concept, (_, value) in _alternates(obs).items():
                if concept in concepts and abs(value - obs.value) > TTM_CONCEPT_TOLERANCE * max(abs(obs.value), 1.0):
                    differ = True
        if not differ:
            return observations, None, []
        for rule in definition.concepts:
            aligned = []
            for obs in observations:
                if obs.provenance.concept == rule.concept:
                    aligned.append(obs)
                    continue
                alternate = _alternates(obs).get(rule.concept)
                if alternate is None:
                    break
                aligned.append(_as_concept(obs, alternate[0], rule.concept, alternate[1]))
            if len(aligned) == len(observations):
                if self._basis_mixed(metric, aligned):
                    return aligned, TTM_BASIS_MIXED, []
                return aligned, None, [f"TTM_CONCEPT_ALIGNED_{rule.concept}"]
        return observations, TTM_CONCEPT_MISMATCH, []

    def _classes_distinct(self, metric, cells, classes, as_of, policy, lag_days):
        """Filings available at as_of show two of these economic classes with different values for any of the cells."""
        pairs = [(a, b) for a in classes for b in classes if a < b]
        for fiscal_year, fiscal_period in cells:
            timeline = self.factbook.get(metric, fiscal_year, fiscal_period)
            if timeline is None:
                continue
            evidence = timeline.class_evidence(None if policy == POLICY_LATEST_KNOWN else as_of, lag_days)
            if any(told_apart(evidence, a, b) for a, b in pairs):
                return True
        return False

    def _window_in_one_class(self, metric, quarters, as_of, policy, lag_days, observations):
        """(window re-read within one economic class every quarter has at as_of, or None; a basis-mixed reading)."""
        mixed = None
        # Owners' net income first, as for a single cell (Markel TTM Q1 2020), then
        # income available to common, then consolidated profit (JBG Smith 2018).
        for wanted in sorted({economic_class(obs.provenance.concept) for obs in observations},
                             key=lambda name: (CLASS_READING_ORDER.index(name) if name in CLASS_READING_ORDER
                                               else len(CLASS_READING_ORDER), name)):
            def read(fiscal_year, label, c=wanted):
                # A filing that reported the class only next to the stored concept
                # still is a version of it (AMCOL 2011: restated ProfitLoss beside
                # NetIncomeLoss in the 10-K 2013, not the 10-K 2012's older one).
                timeline = self.factbook.get(metric, fiscal_year, label)
                if timeline is None:
                    return None
                found = timeline.resolve(as_of=as_of, policy=policy, lag_days=lag_days,
                                         accept=lambda o: _in_class(o, c) is not None, by_class=False)
                return None if found is None else _in_class(found, c)

            chosen = []
            for (fiscal_year, index, obs) in quarters:
                if (obs.provenance.transformation or TRANSFORM_NONE) == TRANSFORM_NONE:
                    found = read(fiscal_year, f"Q{index}")
                else:
                    # A derived quarter is derived again inside the class, from the
                    # same two cumulative cells (red team R3 MEDIUM-2: Goodyear Q4 2021
                    # = FY 764 minus nine months 211 million). Only quarters the window
                    # itself derived: a same-day-ambiguous reported cell stays empty.
                    current = read(fiscal_year, CUMULATIVE_LABELS.get(index, f"Q{index}"))
                    previous = read(fiscal_year, CUMULATIVE_LABELS.get(index - 1, "Q1"))
                    found = None
                    if current is not None and previous is not None and _same_start(current, previous) \
                            and previous.period_end:
                        found = _combine([current, previous], current.value - previous.value,
                                         obs.provenance.transformation, current.unit)
                        found.period_start = (date.fromisoformat(str(previous.period_end)[:10])
                                              + timedelta(days=1)).isoformat()
                if found is None or not _same_quarter(found, obs):
                    break
                chosen.append(found)
            if len(chosen) == len(observations):
                # A re-read takes other filings' versions: their basis is checked
                # again (AgileThought 2020: the SPAC's Q1/Q2 next to the successor's);
                # a mixed reading gives way to the next class (1569187 2016).
                if not self._basis_mixed(metric, chosen):
                    return chosen, None
                mixed = mixed or chosen
        return None, mixed

    def _filing_periods(self, metric):
        """accession -> {(concept, start, end): value} of every observation of `metric`."""
        if metric not in self._periods_by_filing:
            index = {}
            for (name, _, _), timeline in self.factbook.timelines.items():
                if name != metric:
                    continue
                for obs in timeline.observations:
                    if obs.accession and obs.period_end:
                        start, end = str(obs.period_start or "")[:10], str(obs.period_end)[:10]
                        values = index.setdefault(obs.accession, {})
                        values[(obs.provenance.concept, start, end)] = obs.value
                        # the other concepts the same filing reported for the same cell
                        for concept, (_, value) in _alternates(obs).items():
                            values.setdefault((concept, start, end), value)
            self._periods_by_filing[metric] = index
        return self._periods_by_filing[metric]

    def _basis_mixed(self, metric, observations):
        # Same concept, same period: a different concept is no contradiction (Murphy
        # Oil: Revenues next to contract revenue). A per-share value is compared
        # through the filings' net income - a split restates EPS, not the business
        # (ClearSign, Piper Sandler; the share-basis guard handles splits). Only the
        # window's own quarters: a restatement of another quarter (Enventis 10-K 2013,
        # Q3 2011) or a mistagged comparative year in a 10-Q (Simpson 2019: "2018"
        # net income 101.2 vs 126.6 million) says nothing about this window's basis.
        # Material only: rounding to a tenth of a million (Murphy 73.036 vs 73.0) or a
        # small correction (Neogen 9.881 vs 9.934) is the same basis; a predecessor's
        # quarter is another business (Dawson 25.7 vs 50.8 million).
        index = self._filing_periods("net_income" if self._definition(metric).is_per_share else metric)
        quarters = {(str(obs.period_start or "")[:10], str(obs.period_end or "")[:10]) for obs in observations}
        filings = sorted({(obs.available_instant, obs.accession) for obs in observations if obs.accession},
                         key=lambda item: (item[0] is None, item[0], item[1]))
        for k, (newer_when, newer) in enumerate(filings):
            for older_when, older in filings[:k]:
                if older_when is None or newer_when is None or not older_when < newer_when:
                    continue
                older_periods = index.get(older, {})
                shared = [(value, older_periods[period]) for period, value in index.get(newer, {}).items()
                          if period in older_periods and value is not None and older_periods[period] is not None
                          and (period[1], period[2]) in quarters]
                if not shared:
                    continue
                scale = max(max(abs(a), abs(b)) for a, b in shared) or 1.0
                # a sign slip is a tagging error, not another basis (Lexaria 2022)
                if any(abs(a - b) > BASIS_CHANGE_RELATIVE * max(abs(a), abs(b))
                       and abs(a - b) > BASIS_CHANGE_FLOOR * scale and not sign_slip(a, b) for a, b in shared):
                    return True
        return False

    def _share_basis_jumps(self, metric, quarters, as_of, policy, lag_days):
        """None, TTM_SHARE_BASIS_INCONSISTENT or TTM_EPS_INCONSISTENT for a per-share window."""
        shares_metric = TTM_SHARE_METRICS.get(metric)
        reported, implied = [], []
        for fiscal_year, index, obs in quarters:
            end = str(obs.period_end)[:10]
            shares = None
            if shares_metric and self._definition(shares_metric) is not None:
                cell = self.quarter_grid(shares_metric, fiscal_year, as_of, policy, lag_days).get(index)
                if cell is not None and str(cell.period_end)[:10] == end and cell.value >= TTM_MIN_SHARES:
                    shares = cell.value
                    reported.append(shares)
            income = None
            if self._definition("net_income") is not None:
                cell = self.quarter_grid("net_income", fiscal_year, as_of, policy, lag_days).get(index)
                if cell is not None and str(cell.period_end)[:10] == end:
                    income = cell.value
            if shares is not None and income and obs.value:
                # EPS x shares must be of the order of the quarter's result.
                count = abs(income / obs.value)
                if not shares / EPS_CONSISTENCY_FACTOR <= count <= shares * EPS_CONSISTENCY_FACTOR:
                    return TTM_EPS_INCONSISTENT
            if income is not None and abs(obs.value) >= TTM_IMPLIED_MIN_EPS:
                count = abs(income / obs.value)
                if count >= TTM_MIN_SHARES:
                    implied.append(count)
                elif income:
                    # 1.20.0 (Red Team): an "EPS" that implies fewer than 1,000
                    # shares is not a per-share amount (Stanley Black & Decker
                    # 10-Q/A 2022: weighted shares tagged as EPS, TTM 329,535,005).
                    return TTM_EPS_INCONSISTENT
        # Reported weighted shares decide where at least two quarters carry them;
        # net income / EPS only stands in without them, because net income can
        # differ from the EPS numerator (non-controlling interests, preferred
        # dividends, later restatements: Piper Sandler Q1 2025 implies 10 Mio.
        # shares against 17.8 Mio. reported).
        points = reported if len(reported) >= 2 else implied
        if len(points) < 2:
            return None
        if max(points) / min(points) >= TTM_SHARE_BASIS_JUMP:
            return TTM_SHARE_BASIS_INCONSISTENT
        for newer, older in zip(points, points[1:]):
            jump = max(newer, older) / min(newer, older)
            if jump >= SPLIT_RATIO_MIN and any(abs(jump / ratio - 1) <= SPLIT_RATIO_TOLERANCE for ratio in SPLIT_RATIOS):
                return TTM_SHARE_BASIS_INCONSISTENT
        return None

    def step_back(self, fiscal_year, quarter_index, steps):
        """Move `steps` quarters back from (fiscal_year, quarter_index).

        1.21.0: along the calendar's own sequence of fiscal-year labels. A
        transition period without a label of its own can leave a gap (Best Buy:
        FY2012, the 11-month transition year to 2013-02-02, then the year its own
        10-K tags 2013, then 2015); "label minus one" fell into the gap and the
        windows after the transition were lost. Stepping over a gap cannot join
        periods that do not adjoin: _ttm_window checks the actual dates."""
        labels = self._label_sequence()
        if fiscal_year not in labels:
            absolute = fiscal_year * 4 + (quarter_index - 1) - steps
            return absolute // 4, (absolute % 4) + 1
        position, index = labels.index(fiscal_year), quarter_index - 1 - steps
        while index < 0:
            position -= 1
            index += 4
        year = labels[position] if position >= 0 else labels[0] + position
        return year, index + 1

    def _label_sequence(self):
        calendar = getattr(self.factbook, "calendar", None)
        labels = getattr(calendar, "labels", None) if calendar is not None else None
        if not labels:
            return []
        return sorted({label for label in labels.values() if label is not None})

    def latest_reported_quarter(self, metric, as_of, policy=POLICY_AS_OF_LATEST, lag_days=0):
        """(fiscal_year, quarter_index) of the newest standalone quarter at as_of."""
        quarters = self.latest_quarters(metric, as_of, count=1, policy=policy, lag_days=lag_days)
        if not quarters:
            return None
        return quarters[0][0], quarters[0][1]

    def ttm_ending(self, metric, fiscal_year, quarter_index, as_of,
                   policy=POLICY_AS_OF_LATEST, lag_days=0):
        """TTM for the four quarters ending at (fiscal_year, quarter_index).

        Used for year-over-year comparisons: the prior-year TTM is rebuilt from
        the same point-in-time window, so a comparison never mixes information
        the market had at different times.
        """
        blocked = self.sector_block(metric)
        if blocked:
            return self._not_applicable(metric, blocked, fiscal_year, PERIOD_TTM)
        definition = self._definition(metric)
        if definition is None or definition.kind == KIND_INSTANT:
            return missing(self.factbook.cik, metric, PERIOD_MISMATCH,
                           fiscal_year=fiscal_year, fiscal_period=PERIOD_TTM)
        observations = []
        grids = {}
        for step in range(4):
            year, index = self.step_back(fiscal_year, quarter_index, step)
            grid = grids.get(year)
            if grid is None:
                grid = self.quarter_grid(metric, year, as_of, policy, lag_days)
                grids[year] = grid
            observation = grid.get(index)
            if observation is None:
                return missing(self.factbook.cik, metric, INSUFFICIENT_HISTORY,
                               fiscal_year=fiscal_year, fiscal_period=PERIOD_TTM)
            observations.append((year, index, observation))
        return self._ttm_fact(metric, observations, as_of, policy, lag_days)

    def latest_instant(self, metric, as_of, policy=POLICY_AS_OF_LATEST, lag_days=0):
        blocked = self.sector_block(metric)
        if blocked:
            return self._not_applicable(metric, blocked, None, None)
        best = None
        for fiscal_year in reversed(self.factbook.fiscal_years()):
            for period in ("FY", "Q4", "Q3", "Q2", "Q1"):
                observation = self._raw(metric, fiscal_year, period, as_of, policy, lag_days)
                if observation is None:
                    continue
                if best is None or (observation.period_end or "") > (best[0].period_end or ""):
                    best = (observation, fiscal_year, period)
            if best is not None:
                break
        if best is None:
            return missing(self.factbook.cik, metric, NOT_YET_AVAILABLE)
        observation, fiscal_year, period = best
        return self._to_fact(metric, observation, fiscal_year, period, PERIOD_INSTANT)

    # ----------------------------------------------------------------- plumbing

    def _to_fact(self, metric, observation, fiscal_year, fiscal_period, period_kind):
        return NormalizedFact(
            cik=self.factbook.cik,
            metric=metric,
            value=observation.value,
            unit=observation.unit,
            fiscal_year=fiscal_year,
            fiscal_period=fiscal_period,
            period_start=observation.period_start,
            period_end=observation.period_end,
            period_kind=period_kind,
            available=True,
            reason=None,
            quality=observation.quality,
            flags=list(observation.flags),
            provenance=observation.provenance,
        )

    def _not_applicable(self, metric, rule, fiscal_year, fiscal_period):
        fact = missing(self.factbook.cik, metric, NOT_APPLICABLE_FOR_SECTOR,
                       fiscal_year=fiscal_year, fiscal_period=fiscal_period)
        fact.flags = [f"SECTOR_RULE_{rule.rule_id}"]
        return fact
