"""Point-in-time fact timelines and restatement semantics.

A single (metric, fiscal_year, fiscal_period) cell is not one number. It is a
sequence of observations: the value as first reported, plus every later value
the company reported for that same period (comparatives in later filings,
10-K/A and 10-Q/A amendments, restatements). Each observation knows when it
became publicly available.

Resolution is always `as_of`. The default policy answers the only question a
backtester may ask: "what did the market know about this period on this date?"

Policies
--------
AS_OF_LATEST   (default) the most recently published value that was available at
               as_of. A 2020 restatement of a 2018 period is invisible to a 2019
               backtest and visible from its own publication date onward.
ORIGINAL       the value as first reported for that period, and only if that
               first report was itself available at as_of. Used for
               as-originally-reported research and for restatement diagnostics.
LATEST_KNOWN   ignores as_of entirely. Only for current-state reporting and the
               data inspector; never reachable from the backtest path.
"""
from datetime import date, datetime, timedelta, timezone

from .model import QUALITY_HIGH, QUALITY_MEDIUM

POLICY_AS_OF_LATEST = "as_of_latest"
POLICY_ORIGINAL = "original"
POLICY_LATEST_KNOWN = "latest_known"
POLICIES = (POLICY_AS_OF_LATEST, POLICY_ORIGINAL, POLICY_LATEST_KNOWN)

# Amendments supersede the filing they amend when both are visible at the same
# instant; otherwise the later publication wins on its own.
_AMENDMENT_FORMS = frozenset({"10-K/A", "10-Q/A", "20-F/A", "40-F/A"})

FLAG_RESTATED = "RESTATED"
FLAG_CONFLICTING_FACTS = "CONFLICTING_FACTS"

# Values differing by less than this relative amount are treated as the same
# number reported twice, not as a restatement (rounding across filings).
RESTATEMENT_RELATIVE_TOLERANCE = 1e-9


def to_instant(value, end_of_day=False):
    """Normalize a date/datetime/ISO string to an aware UTC datetime.

    A bare date is start-of-day, which is what a filing date means: the fact is
    available from that day onward. An as_of given as a bare date is end-of-day,
    so a fact filed on that date is usable on that date and never earlier.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        moment = datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
        return moment + timedelta(hours=23, minutes=59, seconds=59) if end_of_day else moment
    text = str(value).strip()
    if not text:
        return None
    if len(text) <= 10:
        return to_instant(date.fromisoformat(text), end_of_day=end_of_day)
    text = text.replace("Z", "+00:00")
    # SEC acceptanceDateTime arrives as "2024-02-21T16:31:11.000Z" or naive ET-free ISO.
    moment = datetime.fromisoformat(text)
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


class Observation:
    """One reported value for one (metric, period) cell, with its provenance."""

    __slots__ = ("value", "unit", "provenance", "available_from", "filed",
                 "quality", "flags", "period_start", "period_end")

    def __init__(self, value, unit, provenance, available_from, filed,
                 quality=QUALITY_HIGH, flags=None, period_start=None, period_end=None):
        self.value = value
        self.unit = unit
        self.provenance = provenance
        self.available_from = available_from
        self.filed = filed
        self.quality = quality
        self.flags = list(flags or [])
        self.period_start = period_start
        self.period_end = period_end

    @property
    def available_instant(self):
        return to_instant(self.available_from or self.filed)

    @property
    def accession(self):
        return self.provenance.accession

    @property
    def form(self):
        return self.provenance.form

    def _rank(self):
        # Ordering within the same availability instant.
        return (
            self.available_instant,
            1 if (self.form or "") in _AMENDMENT_FORMS else 0,
            self.accession or "",
        )

    def to_dict(self):
        return {
            "value": self.value,
            "unit": self.unit,
            "available_from": self.available_from,
            "filed": self.filed,
            "quality": self.quality,
            "flags": list(self.flags),
            "period_start": self.period_start,
            "period_end": self.period_end,
            "provenance": self.provenance.to_dict(),
        }


class FactTimeline:
    """All observations of one (metric, fiscal_year, fiscal_period) cell."""

    def __init__(self, metric, fiscal_year, fiscal_period, observations=None):
        self.metric = metric
        self.fiscal_year = fiscal_year
        self.fiscal_period = fiscal_period
        self._observations = list(observations or [])
        self._sorted = False

    @property
    def key(self):
        return (self.metric, self.fiscal_year, self.fiscal_period)

    @property
    def observations(self):
        if not self._sorted:
            self._observations.sort(key=Observation._rank)
            self._sorted = True
        return self._observations

    def add(self, observation):
        self._observations.append(observation)
        self._sorted = False

    def __len__(self):
        return len(self._observations)

    # ---------------------------------------------------------------- resolution

    def visible(self, as_of, lag_days=0):
        """Observations publicly available at as_of (inclusive), oldest first."""
        cutoff = to_instant(as_of, end_of_day=True)
        if cutoff is None:
            return list(self.observations)
        if lag_days:
            cutoff = cutoff - timedelta(days=lag_days)
        return [obs for obs in self.observations
                if obs.available_instant is not None and obs.available_instant <= cutoff]

    def resolve(self, as_of=None, policy=POLICY_AS_OF_LATEST, lag_days=0):
        """Return the observation a consumer is allowed to see at as_of."""
        if policy not in POLICIES:
            raise ValueError(f"unknown restatement policy: {policy}")
        if policy == POLICY_LATEST_KNOWN:
            candidates = list(self.observations)
        else:
            if as_of is None:
                raise ValueError(f"policy {policy} requires an as_of date")
            candidates = self.visible(as_of, lag_days=lag_days)
        if not candidates:
            return None

        if policy == POLICY_ORIGINAL:
            chosen = candidates[0]
        else:
            chosen = candidates[-1]

        flags = list(chosen.flags)
        quality = chosen.quality
        if len(candidates) > 1 and self._values_differ(candidates):
            flags.append(FLAG_RESTATED)
        peers = [obs for obs in candidates if obs.available_instant == chosen.available_instant]
        if len(peers) > 1 and self._values_differ(peers):
            flags.append(FLAG_CONFLICTING_FACTS)
            quality = QUALITY_MEDIUM
        if flags == chosen.flags and quality == chosen.quality:
            return chosen
        return Observation(
            value=chosen.value, unit=chosen.unit, provenance=chosen.provenance,
            available_from=chosen.available_from, filed=chosen.filed,
            quality=quality, flags=flags,
            period_start=chosen.period_start, period_end=chosen.period_end,
        )

    @staticmethod
    def _values_differ(observations):
        values = [obs.value for obs in observations if obs.value is not None]
        if len(values) < 2:
            return False
        low, high = min(values), max(values)
        scale = max(abs(low), abs(high), 1.0)
        return (high - low) / scale > RESTATEMENT_RELATIVE_TOLERANCE

    def is_restated(self):
        return self._values_differ(self.observations)

    def to_dict(self):
        return {
            "metric": self.metric,
            "fiscal_year": self.fiscal_year,
            "fiscal_period": self.fiscal_period,
            "restated": self.is_restated(),
            "observations": [obs.to_dict() for obs in self.observations],
        }


class CompanyFactBook:
    """Every timeline for one company, addressable by (metric, fy, fp)."""

    def __init__(self, cik, timelines=None, calendar=None, profile=None):
        self.cik = cik
        self.calendar = calendar
        self.profile = profile
        self.timelines = dict(timelines or {})

    def add_observation(self, metric, fiscal_year, fiscal_period, observation):
        key = (metric, fiscal_year, fiscal_period)
        timeline = self.timelines.get(key)
        if timeline is None:
            timeline = FactTimeline(metric, fiscal_year, fiscal_period)
            self.timelines[key] = timeline
        timeline.add(observation)
        return timeline

    def get(self, metric, fiscal_year, fiscal_period):
        return self.timelines.get((metric, fiscal_year, fiscal_period))

    def resolve(self, metric, fiscal_year, fiscal_period, as_of=None,
                policy=POLICY_AS_OF_LATEST, lag_days=0):
        timeline = self.get(metric, fiscal_year, fiscal_period)
        if timeline is None:
            return None
        return timeline.resolve(as_of=as_of, policy=policy, lag_days=lag_days)

    def metrics(self):
        return sorted({key[0] for key in self.timelines})

    def fiscal_years(self, metric=None):
        years = {key[1] for key in self.timelines
                 if key[1] is not None and (metric is None or key[0] == metric)}
        return sorted(years)

    def to_dict(self):
        return {
            "cik": self.cik,
            "profile": self.profile.to_dict() if self.profile else None,
            "calendar": self.calendar.to_dict() if self.calendar else None,
            "timelines": [timeline.to_dict() for timeline in self.timelines.values()],
        }
