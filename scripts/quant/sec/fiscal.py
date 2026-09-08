"""Per-company fiscal calendar, learned from the company's own filings.

Why this module exists: in SEC companyfacts every fact carries `fy` and `fp`,
but those describe the FILING the fact appeared in, not the fact's own period.
A FY2024 10-K restates FY2022 comparatives with fy=2024, fp="FY". Trusting those
fields is the single most common way to silently mislabel two thirds of a
company's history, so this pipeline never does.

Instead the fiscal calendar is learned:
  1. Annual-duration facts filed on a 10-K with fp="FY" whose period end is that
     filing's own latest annual end give (period_end -> fiscal_year) anchors.
  2. The offset between the label and the calendar year of the end date is
     learned from those anchors (Walmart-style "FY ends Jan 2024 = FY2024" and
     Target-style "FY ends Feb 2024 = fiscal 2023" both come out right).
  3. All observed annual period ends are clustered into fiscal-year boundaries,
     which handles 52/53-week calendars and drifting quarter ends.
  4. Quarter index inside a fiscal year comes from the elapsed fraction of the
     year, not from calendar months.

No company-specific branches. Everything is derived from that company's data.
"""
import logging
from collections import Counter, defaultdict
from datetime import date, timedelta

LOGGER = logging.getLogger("vu.sec.fiscal")

# Duration buckets, in days between XBRL `start` and `end`.
QUARTER_RANGE = (75, 105)
HALF_RANGE = (160, 200)
NINE_MONTH_RANGE = (250, 295)
ANNUAL_RANGE = (330, 390)

# Two annual period ends closer together than this belong to the same fiscal
# year (a 52/53-week calendar moves the year end by up to a week; amendments and
# transition periods can move it further).
FY_CLUSTER_TOLERANCE_DAYS = 60

# A period end may sit slightly past a fiscal year end and still belong to it.
FY_BOUNDARY_TOLERANCE_DAYS = 5

QUARTER_LENGTH_DAYS = 91.31


def parse_date(value):
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def duration_days(start, end):
    start, end = parse_date(start), parse_date(end)
    if start is None or end is None:
        return None
    return (end - start).days


def classify_duration(start, end):
    """Return one of instant/Q/H/9M/FY/UNKNOWN for an XBRL period."""
    if start is None:
        return "instant"
    days = duration_days(start, end)
    if days is None:
        return "UNKNOWN"
    if QUARTER_RANGE[0] <= days <= QUARTER_RANGE[1]:
        return "Q"
    if HALF_RANGE[0] <= days <= HALF_RANGE[1]:
        return "H"
    if NINE_MONTH_RANGE[0] <= days <= NINE_MONTH_RANGE[1]:
        return "9M"
    if ANNUAL_RANGE[0] <= days <= ANNUAL_RANGE[1]:
        return "FY"
    return "UNKNOWN"


class FiscalCalendar:
    """Fiscal year boundaries and labels for one company."""

    def __init__(self, cik, fy_ends, labels, label_offset, fiscal_year_end_hint=None):
        self.cik = cik
        self.fy_ends = sorted(fy_ends)              # list[date], ascending
        self.labels = dict(labels)                  # date -> int
        self.label_offset = label_offset            # fiscal_year - end.year
        self.fiscal_year_end_hint = fiscal_year_end_hint
        self._extrapolated = set()
        # Filled by from_raw_facts: annual filings whose own `fy` field was
        # refused because it would repeat or precede the previous fiscal year.
        self.rejected_anchors = []

    # ------------------------------------------------------------------ building

    @classmethod
    def from_raw_facts(cls, cik, raw_facts, fiscal_year_end_hint=None):
        annual_ends = set()
        # accession -> {"ends": set, "fy": int} for 10-K/20-F filings only
        anchors_by_accession = defaultdict(lambda: {"ends": set(), "fy": None})

        for fact in raw_facts:
            kind = classify_duration(fact.start, fact.end)
            if kind != "FY":
                continue
            end = parse_date(fact.end)
            annual_ends.add(end)
            if fact.form in ("10-K", "20-F", "40-F") and fact.filing_fp == "FY":
                bucket = anchors_by_accession[fact.accession]
                bucket["ends"].add(end)
                if fact.filing_fy is not None:
                    bucket["fy"] = int(fact.filing_fy)

        # An annual filing's own reporting period is its latest annual period end.
        anchors = {}
        for bucket in anchors_by_accession.values():
            if bucket["fy"] is None or not bucket["ends"]:
                continue
            anchors[max(bucket["ends"])] = bucket["fy"]

        offsets = Counter(fy - end.year for end, fy in anchors.items())
        if offsets:
            label_offset = offsets.most_common(1)[0][0]
        elif fiscal_year_end_hint:
            # Without anchors fall back to the dominant US convention: the label
            # is the calendar year the fiscal year ends in.
            label_offset = 0
        else:
            label_offset = 0

        fy_ends = cls._cluster(annual_ends)
        labels, rejected = cls._label_years(fy_ends, anchors, label_offset)
        calendar = cls(cik, fy_ends, labels, label_offset, fiscal_year_end_hint)
        calendar.rejected_anchors = rejected
        LOGGER.info(
            "fiscal calendar cik=%s years=%d offset=%+d anchors=%d rejected=%d",
            cik, len(fy_ends), label_offset, len(anchors), len(rejected),
        )
        for end, claimed, used in rejected:
            LOGGER.warning(
                "cik=%s fiscal year ending %s is tagged fy=%s by its own 10-K, which "
                "would repeat or precede the previous fiscal year; using %s",
                cik, end, claimed, used,
            )
        return calendar

    @staticmethod
    def _label_years(fy_ends, anchors, label_offset):
        """Fiscal-year labels, refusing anchors that cannot be true.

        The label comes from the annual filing's own `fy` field where one
        exists. But `fy` describes the FILING, not the fact -- the trap this
        pipeline avoids everywhere else -- and NVDA's 10-Ks for the years ending
        January 2011 through January 2014 tag it one year low. Taken at face
        value that produced two fiscal years labelled 2010, no fiscal year 2014,
        and four years whose label was off by one. It also produced most of
        NVDA's ambiguous-period-end suppressions, so the symptom was visible
        while the cause was not.

        Two fiscal years cannot share a label and a later one cannot have a
        lower label, so an anchor that breaks either is not a naming convention
        to be respected -- it is impossible. Those fall back to the learned
        offset and are reported. An anchor that merely disagrees with the
        majority is still honoured: a filer may legitimately change convention.
        """
        labels = {}
        rejected = []
        previous = None
        for end in fy_ends:
            fallback = end.year + label_offset
            label = anchors.get(end, fallback)
            if previous is not None and label <= previous:
                rejected.append((end.isoformat(), label, fallback))
                label = fallback
            labels[end] = label
            previous = label
        return labels, rejected

    @staticmethod
    def _cluster(ends):
        """Collapse near-identical annual ends (amendments, 53-week drift)."""
        clustered = []
        for end in sorted(ends):
            if clustered and (end - clustered[-1]).days <= FY_CLUSTER_TOLERANCE_DAYS:
                # Keep the later end as the canonical boundary of that year.
                clustered[-1] = end
                continue
            clustered.append(end)
        return clustered

    # ------------------------------------------------------------------ querying

    def _boundaries_covering(self, period_end):
        """Return (previous_fy_end, fy_end) whose window contains period_end."""
        period_end = parse_date(period_end)
        if not self.fy_ends:
            return None, None
        tolerance = timedelta(days=FY_BOUNDARY_TOLERANCE_DAYS)

        ends = self.fy_ends
        for index, fy_end in enumerate(ends):
            if period_end <= fy_end + tolerance:
                previous = ends[index - 1] if index else fy_end - timedelta(days=364)
                if period_end > previous + tolerance or index == 0:
                    return previous, fy_end
                return previous, fy_end

        # The period is newer than every completed fiscal year we have seen:
        # project the calendar forward one year at a time.
        previous, fy_end = ends[-1], ends[-1]
        step = 364 if self._is_week_based() else 365
        while period_end > fy_end + tolerance:
            previous = fy_end
            fy_end = fy_end + timedelta(days=step)
            self._extrapolated.add(fy_end)
        return previous, fy_end

    def _is_week_based(self):
        """A 52/53-week filer's year ends land on the same weekday."""
        if len(self.fy_ends) < 3:
            return False
        weekdays = {end.weekday() for end in self.fy_ends[-5:]}
        return len(weekdays) == 1

    def fiscal_year_for(self, period_end):
        previous, fy_end = self._boundaries_covering(period_end)
        if fy_end is None:
            return None
        if fy_end in self.labels:
            return self.labels[fy_end]
        return fy_end.year + self.label_offset

    def quarter_index(self, period_end):
        """1..4 by elapsed fraction of the fiscal year, or None if undecidable."""
        period_end = parse_date(period_end)
        previous, fy_end = self._boundaries_covering(period_end)
        if fy_end is None or previous is None:
            return None
        elapsed = (period_end - previous).days
        if elapsed <= 0:
            return None
        index = int(round(elapsed / QUARTER_LENGTH_DAYS))
        return min(4, max(1, index))

    def period_end_is_fy_end(self, period_end):
        period_end = parse_date(period_end)
        tolerance = timedelta(days=FY_BOUNDARY_TOLERANCE_DAYS)
        return any(abs((period_end - end).days) <= tolerance.days for end in self.fy_ends)

    def quarter_ends(self, previous_fy_end, fy_end):
        """The four quarter end dates of one fiscal year window."""
        span = (fy_end - previous_fy_end).days
        return [previous_fy_end + timedelta(days=round(span * index / 4.0))
                for index in range(1, 5)]

    def assign_cover_date(self, instant):
        """Place a cover-date instant on the last period that had already ENDED.

        `dei:EntityCommonStockSharesOutstanding` carries the cover date of the
        filing, not a balance-sheet date: a 10-Q for the quarter ended 30 April
        states the share count as of, say, 19 May. Asking which fiscal quarter
        the 19th of May falls into gives the FOLLOWING quarter, so the same
        labelled quarter ends up holding two cover dates and the one it belongs
        to holds none. Measured on live SEC data, this affected 86 cells across
        all five validation companies, in every year.

        The right question is which reporting period the number describes, and
        that is the most recent period that had already closed.
        """
        instant = parse_date(instant)
        previous, fy_end = self._boundaries_covering(instant)
        if fy_end is None or previous is None:
            return None, None
        ends = self.quarter_ends(previous, fy_end)
        for index in range(4, 0, -1):
            if ends[index - 1] <= instant:
                fiscal_year = self.fiscal_year_for(ends[index - 1])
                return fiscal_year, ("FY" if index == 4 else f"Q{index}")
        # Before this year's first quarter end: the last closed period is the
        # previous fiscal year end.
        return self.fiscal_year_for(previous), "FY"

    def assign(self, start, end):
        """Map an XBRL period onto (fiscal_year, fiscal_period, period_kind).

        fiscal_period is one of Q1..Q4 (standalone quarter or balance-sheet
        date), YTD2/YTD3 (cumulative year-to-date), FY (full year), or None when
        the period cannot be placed. Cumulative periods are labelled distinctly
        so that nothing downstream can mistake a YTD number for a quarter.
        """
        kind = classify_duration(start, end)
        fiscal_year = self.fiscal_year_for(end)
        if fiscal_year is None:
            return None, None, kind

        if kind == "FY":
            return fiscal_year, "FY", kind
        if kind == "H":
            return fiscal_year, "YTD2", kind
        if kind == "9M":
            return fiscal_year, "YTD3", kind
        if kind in ("Q", "instant"):
            index = self.quarter_index(end)
            if index is None:
                return fiscal_year, None, kind
            if kind == "instant" and self.period_end_is_fy_end(end):
                # A balance sheet dated on the fiscal year end is the FY balance
                # sheet and the Q4 balance sheet; both keys are emitted upstream.
                return fiscal_year, "FY", kind
            return fiscal_year, f"Q{index}", kind
        return fiscal_year, None, kind

    @classmethod
    def from_dict(cls, payload):
        """Rebuild a calendar from its stored form.

        Needed because the canonical export and the data inspector both work
        from a persisted document; without this the calendar would be silently
        absent and every Filing record would disappear.
        """
        if not payload:
            return None
        labels, fy_ends = {}, []
        for row in payload.get("fiscal_years") or []:
            end = parse_date(row["period_end"])
            fy_ends.append(end)
            labels[end] = row["fiscal_year"]
        return cls(payload.get("cik"), fy_ends, labels,
                   payload.get("label_offset", 0),
                   payload.get("fiscal_year_end_hint"))

    def to_dict(self):
        return {
            "cik": self.cik,
            "label_offset": self.label_offset,
            "fiscal_year_end_hint": self.fiscal_year_end_hint,
            "week_based": self._is_week_based(),
            "fiscal_years": [
                {"fiscal_year": self.labels[end], "period_end": end.isoformat()}
                for end in self.fy_ends
            ],
            "rejected_anchors": [
                {"period_end": end, "filing_claimed_fy": claimed, "used_fy": used}
                for end, claimed, used in self.rejected_anchors
            ],
        }
