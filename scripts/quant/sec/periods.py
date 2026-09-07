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
import logging

from .model import (
    NormalizedFact, Provenance, SOURCE_SEC, TRANSFORM_NONE, TRANSFORM_YTD_DIFF,
    TRANSFORM_FY_MINUS_YTD, TRANSFORM_SUM, QUALITY_HIGH, QUALITY_MEDIUM,
    PERIOD_QUARTER, PERIOD_ANNUAL, PERIOD_INSTANT, PERIOD_TTM,
    MISSING_XBRL_CONCEPT, INSUFFICIENT_HISTORY, NOT_APPLICABLE_FOR_SECTOR,
    NOT_YET_AVAILABLE, PERIOD_MISMATCH, missing,
)
from .registry import KIND_INSTANT
from .restatements import POLICY_AS_OF_LATEST, Observation, to_instant

LOGGER = logging.getLogger("vu.sec.periods")

QUARTERS = ("Q1", "Q2", "Q3", "Q4")
CUMULATIVE_LABELS = {2: "YTD2", 3: "YTD3", 4: "FY"}
FLAG_PERIOD_TRANSFORM = "VU_PERIOD_TRANSFORM"
MAX_FIXPOINT_PASSES = 8


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
    flags = sorted({flag for obs in observations for flag in obs.flags} | {FLAG_PERIOD_TRANSFORM})
    quality = QUALITY_MEDIUM if any(obs.quality != QUALITY_HIGH for obs in observations) else QUALITY_HIGH
    return Observation(
        value=value, unit=unit, provenance=provenance,
        available_from=latest.available_from, filed=latest.filed,
        quality=quality, flags=flags,
        period_start=min((obs.period_start for obs in observations if obs.period_start), default=None),
        period_end=max((obs.period_end for obs in observations if obs.period_end), default=None),
    )


class PeriodResolver:
    """Resolves canonical periods for one company at a given point in time."""

    def __init__(self, factbook, registry):
        self.factbook = factbook
        self.registry = registry
        self.profile = factbook.profile
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
        if definition.kind == KIND_INSTANT:
            # Balance-sheet dates are already standalone; nothing to de-accumulate.
            return natives

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
                    changed = True

            # Standalone quarter from two cumulative points (YTDn - YTDn-1).
            for index in range(1, 5):
                if natives[index] is not None:
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
                transformation = TRANSFORM_FY_MINUS_YTD if index == 4 else TRANSFORM_YTD_DIFF
                natives[index] = _combine(
                    [current, previous], current.value - previous.value,
                    transformation, current.unit,
                )
                changed = True

            if not changed:
                break

        return natives

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
                and self._definition(metric).kind != KIND_INSTANT:
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
        observations = [item[2] for item in quarters]
        combined = _combine(observations, sum(obs.value for obs in observations),
                            TRANSFORM_SUM, observations[0].unit)
        fiscal_year, quarter_index = quarters[0][0], quarters[0][1]
        fact = self._to_fact(metric, combined, fiscal_year, PERIOD_TTM, PERIOD_TTM)
        fact.flags = sorted(set(fact.flags) | {f"TTM_THROUGH_FY{fiscal_year}Q{quarter_index}"})
        return fact

    def step_back(self, fiscal_year, quarter_index, steps):
        """Move `steps` quarters back from (fiscal_year, quarter_index)."""
        absolute = fiscal_year * 4 + (quarter_index - 1) - steps
        return absolute // 4, (absolute % 4) + 1

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
            observations.append(observation)
        combined = _combine(observations, sum(obs.value for obs in observations),
                            TRANSFORM_SUM, observations[0].unit)
        fact = self._to_fact(metric, combined, fiscal_year, PERIOD_TTM, PERIOD_TTM)
        fact.flags = sorted(set(fact.flags) | {f"TTM_THROUGH_FY{fiscal_year}Q{quarter_index}"})
        return fact

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
