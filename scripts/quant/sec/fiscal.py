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

# Annual report forms whose own `fp` = FY marks a fiscal year end.
ANNUAL_FORMS = ("10-K", "20-F", "40-F", "10-KT", "10-K405")

# How the fiscal year ends were learned; persisted with the calendar.
ANCHOR_SOURCE_ANNUAL_DURATIONS = "ANNUAL_DURATIONS"
ANCHOR_SOURCE_ANNUAL_FILING_INSTANTS = "ANNUAL_FILING_INSTANTS"
ANCHOR_SOURCE_YEAR_END_HINT = "REGISTERED_YEAR_END"
ANCHOR_SOURCE_YEAR_END_PROJECTED = "REGISTERED_YEAR_END_PROJECTED"
ANCHOR_SOURCE_NONE = "NONE"

# Two annual period ends closer together than this belong to the same fiscal
# year (a 52/53-week calendar moves the year end by up to a week; amendments and
# transition periods can move it further).
FY_CLUSTER_TOLERANCE_DAYS = 60

# A period end may sit slightly past a fiscal year end and still belong to it.
FY_BOUNDARY_TOLERANCE_DAYS = 5
# 1.23.0 (F-TTM-8): a comparative twelve-month period counts as a presented fiscal
# year when the report carries at least this share of the facts of its own year.
COMPARATIVE_YEAR_MIN_SUPPORT = 0.5

QUARTER_LENGTH_DAYS = 91.31
# Length of a fiscal year with four quarter slots (1.20.0): 52/53-week years
# are 364/371 days, calendar-anniversary years 365/366. Outside: transition year.
TRANSITION_YEAR_DAYS = (350, 380)

# 1.21.0 (F-TTM-4): a fiscal period of an annual report follows the previous one
# within the tolerance of a TTM chain (52/53-week years: Saturday to Monday).
FISCAL_CHAIN_OVERLAP_DAYS = 3
FISCAL_CHAIN_GAP_DAYS = 8
# A transition period after a change of year end is longer than the clustering
# window (a shorter one would be merged with the year end before it and turn the
# last old-cycle year into a 13-month "transition year": VMware, Discover) and
# shorter than a fiscal year (a longer bridge is a twelve-month-plus "year").
TRANSITION_PERIOD_DAYS = (FY_CLUSTER_TOLERANCE_DAYS + 1, 330)
# A year end learned from one report may not split a twelve-month fiscal year that
# another report declares (Dawson Geophysical: the legacy September years of the
# accounting acquirer inside the registrant's own calendar years).
YEAR_INTERIOR_MARGIN_DAYS = FY_CLUSTER_TOLERANCE_DAYS
# 1.21.0 (F-TTM-5): an annual report's own year ended less than a year before it
# was filed; an older twelve-month period in it is a comparative - unless the
# filer's own labelling convention agrees with it (a late filer).
OWN_YEAR_MAX_FILING_LAG_DAYS = 366
# A comparable prior-year period: the same span one year earlier (+- a week).
COMPARABLE_PERIOD_TOLERANCE_DAYS = 7

def _base_form(form):
    """'10-K/A' -> '10-K'; None -> ''."""
    return str(form or "").split("/")[0].strip().upper()


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


ANNUAL_CYCLE_TOLERANCE_DAYS = 14
HALF_YEAR = timedelta(days=182)


def _mid_year(end):
    """Calendar year of the middle of the fiscal year that ends on `end`."""
    return (end - HALF_YEAR).year


def _fallback_label(end, label_offset, label_mid_offset):
    """Label for a year end without a usable own label.

    With labels learned from the filer's own annual reports the mid-year offset
    is used (stable across a December/January 52/53-week drift); without any,
    the dominant US convention stays: the calendar year the fiscal year ends in.
    """
    if label_mid_offset is not None:
        return _mid_year(end) + label_mid_offset
    return end.year + label_offset


def _same_annual_cycle(end, reference):
    """True when `end` falls on the same fiscal-year-end cycle as `reference`.

    Compared on the day of the year, wrapping at the year boundary, so a 52/53-week
    year (Oct 28 vs Nov 3) and a year end around New Year (Dec 31 vs Jan 2) stay on
    the same cycle while a calendar-year disclosure inside an October-year report
    does not.
    """
    distance = abs(end.timetuple().tm_yday - reference.timetuple().tm_yday)
    return min(distance, 366 - distance) <= ANNUAL_CYCLE_TOLERANCE_DAYS


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

    def __init__(self, cik, fy_ends, labels, label_offset, fiscal_year_end_hint=None,
                 label_mid_offset=None, unlabeled=None):
        self.cik = cik
        self.fy_ends = sorted(fy_ends)              # list[date], ascending
        self.labels = dict(labels)                  # date -> int
        # 1.21.0: ends of transition periods without a label of their own - a
        # boundary for the years around them, no fiscal-year cell (see _label_years).
        self.unlabeled = set(unlabeled or ())
        self.label_offset = label_offset            # fiscal_year - end.year
        # fiscal_year - (end - half a year).year, learned from the filings' own
        # labels. None for calendars stored before 1.11.0 (old behaviour kept).
        self.label_mid_offset = label_mid_offset
        self.fiscal_year_end_hint = fiscal_year_end_hint
        self._extrapolated = set()
        # Filled by from_raw_facts: annual filings whose own `fy` field was
        # refused because it would repeat or precede the previous fiscal year.
        self.rejected_anchors = []
        # Where the year ends were learned from (see from_raw_facts).
        self.anchor_source = ANCHOR_SOURCE_ANNUAL_DURATIONS if fy_ends else ANCHOR_SOURCE_NONE

    # ------------------------------------------------------------------ building

    @classmethod
    def from_raw_facts(cls, cik, raw_facts, fiscal_year_end_hint=None):
        annual_ends = set()
        # accession -> {"ends": set, "fy": int, "filed": date} for 10-K/20-F filings only
        anchors_by_accession = defaultdict(lambda: {"ends": set(), "fy": None, "filed": None})
        # accession -> every twelve-month end the annual report carries
        ends_by_accession = defaultdict(Counter)
        # accession -> every reporting period (start, end) of the annual report, any length,
        # with the number of facts reported for it (1.21.0)
        periods_by_accession = defaultdict(Counter)
        # accession -> base form, for transition reports (10-KT), and filing date
        form_by_accession = {}
        filed_by_accession = {}

        for fact in raw_facts:
            if fact.start is None:
                continue
            # 1.20.0: a fiscal year cannot end after the report that carries it.
            # Nucor's 10-K of 2011-02-28 tags an assumption for 2027
            # (health-care cost trend rate, 2027-01-01..2027-12-31); as a year
            # end it turned 2026 into a 730-day "transition year".
            if fact.filed and fact.end and str(fact.end)[:10] > str(fact.filed)[:10]:
                continue
            # Fiscal-year boundaries are learned from annual reports only. A
            # 10-Q can carry twelve-month figures too (Amazon discloses trailing
            # twelve-month net income and cash flows every quarter); those end
            # mid-year and are not fiscal years. Measured on the bulk archive,
            # accepting them split Amazon's calendar into six-month "years",
            # relabelled Q2 as Q1 and overwrote FY2025 with a June figure.
            if _base_form(fact.form) not in ANNUAL_FORMS:
                continue
            start, end = parse_date(fact.start), parse_date(fact.end)
            if start is None or end is None:
                continue
            periods_by_accession[fact.accession][(start, end)] += 1
            form_by_accession[fact.accession] = _base_form(fact.form)
            if fact.filed:
                filed_by_accession[fact.accession] = max(filed_by_accession.get(fact.accession, ""), str(fact.filed)[:10])
            if classify_duration(fact.start, fact.end) != "FY":
                continue
            ends_by_accession[fact.accession][end] += 1
            # A transition report's `fy` names its transition period, which has no
            # twelve-month duration: read as the label of its latest twelve-month
            # (comparative) year it shifted every year after it (1.21.0, red team).
            # 10-KT bounds the calendar, it never labels it.
            if fact.form in ANNUAL_FORMS and fact.filing_fp == "FY" and _base_form(fact.form) != "10-KT":
                bucket = anchors_by_accession[fact.accession]
                bucket["ends"].add(end)
                if fact.filing_fy is not None:
                    bucket["fy"] = int(fact.filing_fy)
                if fact.filed:
                    bucket["filed"] = parse_date(fact.filed)

        # A twelve-month figure in an annual report is a fiscal year only if it ends
        # on that report's own fiscal-year cycle (month/day within a fortnight of
        # the report's latest annual end). Deere's FY2018 10-K carries the 2017
        # CALENDAR-year statutory tax rate reconciliation (2017-01-01..2017-12-31);
        # accepted as a year end it gave FY2017 two ends and relabelled every
        # FY2018 quarter (April became Q1, a Q1 read returned the April value).
        # Measured in the fundamental data integrity audit: 10 of 98 issuers.
        # The report's own year end is the end most of its twelve-month facts
        # share, not the latest one: Hovnanian (year end October) reports the
        # calendar-year tax rate reconciliation to 2021-12-31 in its FY2021 10-K;
        # max() made December the year end and labelled the year to 2025-10-31
        # FY2028 (red team, HIGH-3). Ties go to the later date, as before.
        learned = []                     # (end, accession) - 1.21.0, see below
        declared_years = []              # (start, end, accession): twelve-month years on a report's own cycle
        margin = timedelta(days=YEAR_INTERIOR_MARGIN_DAYS)
        reports = []                     # (accession, own_end, accepted, periods)
        own_years = []                   # (start, end, accession): each annual report's OWN twelve-month year
        for accession, ends in ends_by_accession.items():
            own_end = max(ends, key=lambda end: (ends[end], end))
            accepted = {end for end in ends if _same_annual_cycle(end, own_end)}
            periods = periods_by_accession[accession]
            reports.append((accession, own_end, accepted, periods))
            if form_by_accession.get(accession) != "10-KT":
                own_years.extend((p[0], p[1], accession) for p in periods
                                 if p[1] == own_end and classify_duration(p[0].isoformat(), p[1].isoformat()) == "FY")
        for accession, own_end, accepted, periods in reports:
            if form_by_accession.get(accession) == "10-KT":
                # A transition report bounds the calendar but does not declare its
                # comparative years (Leafbuyer: the accounting acquirer's December
                # years in the 10-KT against the registrant's own June years); its
                # own chain is read below.
                continue
            # 1.23.0 (F-TTM-8): a comparative year end on the report's cycle is not
            # a fiscal year end when it falls inside the own fiscal year an EARLIER
            # annual report declared. After Zurn's change of year end the 10-K of
            # 2022-02-09 carries a recast calendar 2019 (one fact); accepted, it
            # split the fiscal year 2019-04-01..2020-03-31 of the 10-K of 2020-05-12
            # into a phantom year end 2019-12-31 and a 92-day "fiscal 2020", and no
            # quarter from April 2019 to December 2020 had a slot. The report's own
            # year always stands; only comparatives are checked, and only a year end
            # the report itself presents as a disclosure, not as a statement column:
            # fewer than half the facts of its own year (Zurn: 1 fact against 127).
            # A fully presented comparative year (Vintage Wine Estates' June 2020
            # next to the earlier 10-K of its SPAC predecessor; Mama's Creations'
            # recast calendar 2011) is the report's own statement and stays.
            filed = filed_by_accession.get(accession, "")
            support = ends_by_accession[accession]
            accepted = {end for end in accepted if end == own_end
                        or support[end] >= COMPARATIVE_YEAR_MIN_SUPPORT * support[own_end]
                        or not any(start + margin < end < stop - margin
                                   for start, stop, source in own_years
                                   if source != accession and filed_by_accession.get(source, "") < filed)}
            annual_ends.update(accepted)
            declared_years.extend((p[0], p[1], accession) for p in periods
                                  if p[1] in accepted and classify_duration(p[0].isoformat(), p[1].isoformat()) == "FY")
            # 1.21.0 (F-TTM-4): the cycle rule cannot tell a disclosure on another
            # cycle from the fiscal year BEFORE a change of year end, which the
            # report also carries on the old cycle. 8point3's 10-K for the year to
            # 2016-11-30 shows 2013-12-30..2014-12-28 right before its transition
            # period 2014-12-29..2015-11-30; dropped, the calendar projected the
            # November cycle backwards and the 336-day transition year looked like
            # a normal one (TTM holdout v3: 1.70 through the transition period).
            learned.extend((end, accession) for end in cls._prior_fiscal_year_ends(periods, accepted, own_end))
        # 1.21.0 (F-TTM-4): a transition report (10-KT) declares its own period:
        # its latest period end is a fiscal year end. Multi-Fineline's 10-KT for
        # 2014-10-01..2014-12-31, Rentech Nitrogen's for 2011-10-01..2011-12-31
        # (its later 10-Ks recast calendar 2011, which hid the transition).
        for accession, periods in periods_by_accession.items():
            if form_by_accession.get(accession) != "10-KT":
                continue
            learned.extend((end, accession) for end in cls._transition_report_ends(periods))
        # A learned end is used only where it does not contradict the filer's other
        # reports: never inside a twelve-month year that an EARLIER report declared
        # (a later report may recast history - Rentech Nitrogen's calendar 2011 -
        # but the filer's own earlier fiscal years stand: Dawson, Leafbuyer), never
        # within the clustering window of a known year end.
        for end, accession in learned:
            filed = filed_by_accession.get(accession, "")
            if any(start + margin < end < stop - margin
                   for start, stop, source in declared_years
                   if source != accession and filed_by_accession.get(source, "") < filed):
                continue
            if any(0 < abs((end - known).days) <= FY_CLUSTER_TOLERANCE_DAYS for known in annual_ends):
                continue
            annual_ends.add(end)
        anchor_source = ANCHOR_SOURCE_ANNUAL_DURATIONS if annual_ends else ANCHOR_SOURCE_NONE
        if not annual_ends:
            # No full-year duration anywhere: a first fiscal year shorter than
            # ANNUAL_RANGE (a company that started reporting in May and closed
            # its books in December) never produced one, and with no year end
            # every fact of that filer was unplaceable -- balance sheets
            # included, although the filing states exactly which date they
            # are drawn on. The annual filing itself is the evidence: its
            # `fp` says FY and its balance-sheet instants are dated on the
            # year end. Nothing is inferred that the filer did not declare.
            annual_ends, anchors_by_accession = cls._year_ends_from_annual_filings(raw_facts)
            if annual_ends:
                anchor_source = ANCHOR_SOURCE_ANNUAL_FILING_INSTANTS
        if not annual_ends and fiscal_year_end_hint:
            # Last resort, still the filer's own statement: the fiscal year end
            # (MMDD) it registered with the SEC, applied to the balance-sheet
            # dates it actually reported. No date is invented.
            annual_ends = cls._year_ends_from_hint(raw_facts, fiscal_year_end_hint)
            if annual_ends:
                anchor_source = ANCHOR_SOURCE_YEAR_END_HINT
        if not annual_ends and fiscal_year_end_hint:
            # A filer whose first balance sheet postdates its last registered
            # year end (a SPAC formed in March reporting Q2 and Q3, no prior
            # year-end comparative yet) has reported nothing ON a year end.
            # The registered day still fixes the calendar: the year ends that
            # bracket the reported dates are the filer's own declaration,
            # projected onto the years it reported in. Measured on run
            # 34766155710: the last three issuers without a value.
            annual_ends = cls._year_ends_projected_from_hint(raw_facts, fiscal_year_end_hint)
            if annual_ends:
                anchor_source = ANCHOR_SOURCE_YEAR_END_PROJECTED

        # An annual filing's own reporting period is its latest annual period end.
        anchors, late, lag_of = {}, set(), {}
        for bucket in anchors_by_accession.values():
            if bucket["fy"] is None or not bucket["ends"]:
                continue
            own = max(bucket["ends"])
            lag = (bucket["filed"] - own).days if bucket.get("filed") else 0
            # several reports with the same own year end: the promptest one speaks
            # for it (Aytu: a late 10-K filed 2014-11-26 removed the anchor of the
            # prompt FY2013 10-K; red team, round 2)
            if own in lag_of and lag_of[own] <= lag:
                continue
            lag_of[own] = lag
            anchors[own] = bucket["fy"]
        late = {own for own, lag in lag_of.items() if lag > OWN_YEAR_MAX_FILING_LAG_DAYS}
        # 1.21.0 (F-TTM-5): a report is filed after its own year end; a twelve-
        # month period that ended more than a year before the filing is a
        # comparative - when its label also breaks the filer's own convention.
        # FairPoint split FY2011 at its emergence (2011-01-01..01-24 / 01-25..
        # 12-31): the FY2011 10-K (filed 2012-03-09, fy=2011) carries no twelve-
        # month 2011, only the comparative 2010. Read as the report's own year it
        # made 2010-12-31 "FY2011", every later 10-K's own label was refused as a
        # repeat and each year moved up by one (the 2012 annual EPS stood under
        # FY2013). A late filer's own year keeps its label (RocketFuel, Pyrophyte).
        if late:
            convention = Counter(fy - _mid_year(end) for end, fy in anchors.items()).most_common(1)[0][0]
            for end in late:
                if anchors[end] - _mid_year(end) != convention:
                    del anchors[end]

        offsets = Counter(fy - end.year for end, fy in anchors.items())
        if offsets:
            label_offset = offsets.most_common(1)[0][0]
        elif fiscal_year_end_hint:
            # Without anchors fall back to the dominant US convention: the label
            # is the calendar year the fiscal year ends in.
            label_offset = 0
        else:
            label_offset = 0

        # The same offset measured from the middle of the fiscal year. A 52/53-week
        # year that ends sometimes in late December and sometimes in the first days
        # of January (Cerner: 2010-01-02, 2011-01-01, 2011-12-31) has two different
        # end-year offsets but one mid-year offset; with the end year, FY2009 was
        # labelled 2010, the 10-K's own FY2010 label was refused as a repeat, and
        # FY2010 and FY2011 both became "2011" - one cell, two periods.
        mid_offsets = Counter(fy - _mid_year(end) for end, fy in anchors.items())
        label_mid_offset = mid_offsets.most_common(1)[0][0] if mid_offsets else None

        fy_ends = cls._cluster(annual_ends)
        # starts of the fiscal-year-length periods (>= 330 days) every annual report
        # carries, by end: a shortened fiscal year that begins right after the
        # previous year end is a fiscal year, not a transition period (Best Buy's
        # 11 months to 2013-02-02, 8point3's 336 days to 2015-11-30)
        year_starts = defaultdict(set)
        for periods in periods_by_accession.values():
            for start, end in periods:
                if classify_duration(start.isoformat(), end.isoformat()) == "FY":
                    year_starts[end].add(start)
        labels, rejected, unlabeled = cls._label_years_with_transitions(
            fy_ends, anchors, label_offset, label_mid_offset, year_starts=year_starts)
        calendar = cls(cik, fy_ends, labels, label_offset, fiscal_year_end_hint,
                       label_mid_offset=label_mid_offset, unlabeled=unlabeled)
        calendar.rejected_anchors = rejected
        calendar.anchor_source = anchor_source
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
    def _prior_fiscal_year_ends(periods, accepted, own_end):
        """Year ends of the fiscal periods an annual report places right before its own fiscal years.

        One step back from every twelve-month period that ends on an accepted year
        end (no further: the years before belong to the reports of those years):
          - a twelve-month period ending right before (-3..+8 days) that year begins
            is the previous fiscal year, also on another cycle (the year before a
            change of year end: 8point3 2014-12-28);
          - a shorter period ending on the report's own cycle right before it, which
            itself follows a twelve-month period of the report, is a transition
            period; both ends are fiscal year ends (Diamond S: the year to
            2018-03-31, the transition period to 2018-12-31).
        Never a fiscal period:
          - a period overlapping an accepted fiscal year (Deere's calendar-year tax
            rate inside an October year, Hovnanian's calendar year to December,
            every quarter) - except the recast twelve months that end with the
            transition period itself (ADM: calendar 2012 next to July-December 2012);
          - the comparable prior-year period of a later short period (ADM's July-
            December 2011 next to its transition period July-December 2012);
          - a transition period shorter than the clustering window (VMware's month).
        """
        def is_year(period):
            return classify_duration(period[0].isoformat(), period[1].isoformat()) == "FY"

        years = [p for p in periods if p[1] in accepted and is_year(p)]

        def adjacent(earlier, later):
            gap = (later[0] - earlier[1]).days - 1
            return -FISCAL_CHAIN_OVERLAP_DAYS <= gap <= FISCAL_CHAIN_GAP_DAYS

        def overlaps_a_year(period, twin_end=None):
            margin = timedelta(days=FISCAL_CHAIN_OVERLAP_DAYS)
            return any(period[0] < year[1] - margin and period[1] > year[0] + margin
                       and not (twin_end is not None and abs((year[1] - twin_end).days) <= FISCAL_CHAIN_OVERLAP_DAYS)
                       for year in years)

        tolerance = timedelta(days=COMPARABLE_PERIOD_TOLERANCE_DAYS)
        found = set()
        candidates = []                 # (transition period, twelve-month year before it)
        for year in years:
            for period in periods:
                if period in years or not adjacent(period, year):
                    continue
                if is_year(period):
                    if not overlaps_a_year(period):
                        found.add(period[1])
                    continue
                length = (period[1] - period[0]).days + 1
                if not TRANSITION_PERIOD_DAYS[0] <= length < TRANSITION_PERIOD_DAYS[1] \
                        or not _same_annual_cycle(period[1], own_end) or overlaps_a_year(period, twin_end=period[1]):
                    continue
                # the old-cycle year before it may overlap the recast twelve months
                # that end with the transition period (Columbia Financial: October
                # 2016 - September 2017 next to calendar 2017; red team, round 2, D-R1)
                before = [p for p in periods if is_year(p) and adjacent(p, period)
                          and not overlaps_a_year(p, twin_end=period[1])]
                if before:
                    candidates.append((period, max(before, key=lambda p: p[1])))
        for period, previous_year in candidates:
            # the comparable prior-year period of a later transition candidate is
            # not a transition (ADM: July-December 2011 next to July-December 2012)
            if any(abs(other[0] - period[0] - timedelta(days=365)) <= tolerance
                   and abs(other[1] - period[1] - timedelta(days=365)) <= tolerance
                   for other, _ in candidates if other != period):
                continue
            found.update({period[1], previous_year[1]})
        return found

    @staticmethod
    def _transition_report_ends(periods):
        """The year ends a transition report (10-KT) declares by its own chain.

        Its own period is the latest period (at least TRANSITION_PERIOD_DAYS[0])
        that begins right after (-3..+8 days) a twelve-month period of the same
        report: the transition period after the last fiscal year of the old
        cycle. Its end and that year's end are fiscal year ends. A later period
        that follows no fiscal year is no fiscal period - a subsequent-event
        disclosure (International Safety Group's 10-KT: shares issued
        2013-01-30..2013-04-03 after the transition period to 2012-12-31) made
        2013-04-03 a year end and put the Q1 2013 balance sheet under FY2012
        (red team, round 2, D-R2). Without such a chain nothing is learned."""
        def is_year(p):
            return classify_duration(p[0].isoformat(), p[1].isoformat()) == "FY"

        def follows(year, period):
            gap = (period[0] - year[1]).days - 1
            return -FISCAL_CHAIN_OVERLAP_DAYS <= gap <= FISCAL_CHAIN_GAP_DAYS

        years = [p for p in periods if is_year(p)]
        chains = [(period, year) for period in periods
                  if (period[1] - period[0]).days + 1 >= TRANSITION_PERIOD_DAYS[0]
                  for year in years if year != period and follows(year, period)]
        if not chains:
            return set()
        own, year = max(chains, key=lambda c: (c[0][1], periods[c[0]], c[1][1]))
        return {own[1], year[1]}

    @staticmethod
    def _year_ends_from_annual_filings(raw_facts):
        """Year ends declared by annual filings that contain no full-year duration.

        For every 10-K/20-F/40-F whose `fp` is FY, the latest non-cover-date
        instant is the balance-sheet date of that fiscal year. Returns the
        set of ends plus the same accession buckets from_raw_facts builds from
        durations, so labelling works identically.
        """
        instants_by_accession = defaultdict(lambda: {"ends": set(), "fy": None})
        for fact in raw_facts:
            if fact.start is not None or fact.taxonomy == "dei":
                continue
            if fact.form not in ANNUAL_FORMS or fact.filing_fp != "FY":
                continue
            if fact.filed and fact.end and str(fact.end)[:10] > str(fact.filed)[:10]:
                continue
            end = parse_date(fact.end)
            if end is None:
                continue
            bucket = instants_by_accession[fact.accession]
            bucket["ends"].add(end)
            if fact.filing_fy is not None:
                bucket["fy"] = int(fact.filing_fy)
        annual_ends = set()
        anchors_by_accession = defaultdict(lambda: {"ends": set(), "fy": None})
        for accession, bucket in instants_by_accession.items():
            if not bucket["ends"]:
                continue
            year_end = max(bucket["ends"])
            annual_ends.add(year_end)
            anchors_by_accession[accession]["ends"].add(year_end)
            anchors_by_accession[accession]["fy"] = bucket["fy"]
        return annual_ends, anchors_by_accession

    @staticmethod
    def _year_ends_from_hint(raw_facts, fiscal_year_end_hint):
        """Balance-sheet dates that fall on the registered fiscal year end (MMDD)."""
        hint = str(fiscal_year_end_hint).strip()
        if len(hint) != 4 or not hint.isdigit():
            return set()
        month, day = int(hint[:2]), int(hint[2:])

        def registered(year):
            try:
                return date(year, month, day)
            except ValueError:
                # 0229 in a common year: the filer closes on the last day of February.
                return date(year, month, 28)

        ends = set()
        for fact in raw_facts:
            if fact.start is not None or fact.taxonomy == "dei":
                continue
            end = parse_date(fact.end)
            if end is None:
                continue
            # A registered year end of 0101 or 0103 (52/53-week retailers)
            # sits on the far side of the calendar boundary from a balance
            # sheet dated 31 December, so the neighbouring years count too.
            if any(abs((end - registered(end.year + delta)).days) <= FY_BOUNDARY_TOLERANCE_DAYS
                   for delta in (-1, 0, 1)):
                ends.add(end)
        return ends

    @staticmethod
    def _year_ends_projected_from_hint(raw_facts, fiscal_year_end_hint):
        """Registered year ends (MMDD) bracketing the reported period ends."""
        hint = str(fiscal_year_end_hint).strip()
        if len(hint) != 4 or not hint.isdigit():
            return set()
        month, day = int(hint[:2]), int(hint[2:])
        reported = [parse_date(f.end) for f in raw_facts
                    if f.start is None and f.taxonomy != "dei" and f.end]
        reported = [d for d in reported if d is not None]
        if not reported:
            return set()

        def registered(year):
            try:
                return date(year, month, day)
            except ValueError:
                return date(year, month, 28)

        first, last = min(reported), max(reported)
        ends = set()
        for year in range(first.year - 1, last.year + 1):
            end = registered(year)
            # The most recent year end BEFORE the first report anchors the
            # window; later ones only if a report falls after them.
            if end < first or any(end < d for d in reported):
                ends.add(end)
        if not ends:
            return set()
        # Keep only the latest end before the first report plus everything after.
        before = [e for e in ends if e < first]
        keep = {max(before)} if before else set()
        keep |= {e for e in ends if e >= first}
        return keep

    @staticmethod
    def _label_years(fy_ends, anchors, label_offset, label_mid_offset=None):
        """(labels, rejected) - see _label_years_with_transitions."""
        labels, rejected, _ = FiscalCalendar._label_years_with_transitions(fy_ends, anchors, label_offset, label_mid_offset)
        return labels, rejected

    @staticmethod
    def _label_years_with_transitions(fy_ends, anchors, label_offset, label_mid_offset=None, year_starts=None):
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
        unlabeled = set()
        previous = None
        previous_end = None
        for end in fy_ends:
            fallback = _fallback_label(end, label_offset, label_mid_offset)
            label = anchors.get(end, fallback)
            starts = (year_starts or {}).get(end, ())
            shortened_year = previous_end is not None and any(
                -FISCAL_CHAIN_OVERLAP_DAYS <= (start - previous_end).days - 1 <= FISCAL_CHAIN_GAP_DAYS for start in starts)
            if previous_end is not None and end not in anchors and not shortened_year \
                    and (end - previous_end).days < TRANSITION_YEAR_DAYS[0]:
                # 1.21.0: the end of a period shorter than a fiscal year that no
                # annual report claims as its own year closes a transition period.
                # It stays a boundary but takes no label: labelled (bumped to
                # previous+1, or by a fallback offset learned on the other cycle)
                # it pushed the next year's own label off as a repeat and shifted
                # every later year (red team, D1: Multi-Fineline, Oshkosh, Deckers,
                # ServiceNow; Mosaic ImmunoEngineering May -> December).
                unlabeled.add(end)
                previous_end = end
                continue
            if previous is not None and label <= previous:
                # Even the fallback may not repeat a label: two fiscal years in one
                # cell would mix two periods under one key.
                used = fallback if fallback > previous else previous + 1
                rejected.append((end.isoformat(), label, used))
                label = used
            labels[end] = label
            previous = label
            previous_end = end
        return labels, rejected, unlabeled

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
        first = ends[0]
        if period_end <= self._shift_year(first, -1) + tolerance:
            # The period is older than the first fiscal year we have seen. The
            # first annual report carries the opening balance sheet, dated
            # exactly one year before its own year end, and a 40-F carries
            # three years of comparatives: those belong to fiscal years the
            # filer never reported as a full-year duration. Project the
            # calendar backwards one anniversary at a time, the mirror of the
            # forward projection below.
            fy_end = first
            while period_end <= self._shift_year(fy_end, -1) + tolerance:
                fy_end = self._shift_year(fy_end, -1)
                self._note_extrapolated(fy_end, first, -1)
            return self._shift_year(fy_end, -1), fy_end

        for index, fy_end in enumerate(ends):
            if period_end <= fy_end + tolerance:
                previous = ends[index - 1] if index else self._shift_year(fy_end, -1)
                return previous, fy_end

        # The period is newer than every completed fiscal year we have seen:
        # project the calendar forward one year at a time.
        previous, fy_end = ends[-1], ends[-1]
        while period_end > fy_end + tolerance:
            previous = fy_end
            fy_end = self._shift_year(fy_end, 1)
            self._note_extrapolated(fy_end, ends[-1], 1)
        return previous, fy_end

    def _shift_year(self, end, years):
        """The same fiscal year end `years` years away.

        A 52/53-week filer moves by 364 days; everyone else by calendar
        anniversary, so that a projection across a leap year does not drift
        into the neighbouring calendar year and change the label.
        """
        if self._is_week_based():
            return end + timedelta(days=364 * years)
        try:
            return end.replace(year=end.year + years)
        except ValueError:                      # 29 February
            return end.replace(year=end.year + years, day=28)

    def _note_extrapolated(self, fy_end, anchor, direction):
        """Remember a projected year end and label it relative to its anchor."""
        self._extrapolated.add(fy_end)
        if fy_end in self.labels or anchor not in self.labels:
            return
        years_away = abs(fy_end.year - anchor.year) if not self._is_week_based() else max(
            1, round(abs((fy_end - anchor).days) / 364.0))
        self.labels[fy_end] = self.labels[anchor] + direction * years_away

    def _is_week_based(self):
        """A 52/53-week filer's year ends land on the same weekday (transition ends excluded)."""
        ends = [end for end in self.fy_ends if end not in self.unlabeled]
        if len(ends) < 3:
            return False
        weekdays = {end.weekday() for end in ends[-5:]}
        return len(weekdays) == 1

    def fiscal_year_for(self, period_end):
        previous, fy_end = self._boundaries_covering(period_end)
        if fy_end is None:
            return None
        if fy_end in self.unlabeled:
            # a transition period without its own label: nothing of it is placed
            return None
        if fy_end in self.labels:
            return self.labels[fy_end]
        return _fallback_label(fy_end, self.label_offset, self.label_mid_offset)

    def is_transition_year(self, previous_fy_end, fy_end):
        """A fiscal year that is not one year long: the filer changed its year end.

        A normal year spans 365/366 days, a 52/53-week year 364/371. Anything
        outside TRANSITION_YEAR_DAYS (a 15-month bridge, a 3-month transition
        period) has no four-quarter structure (1.20.0, F-TTM-2)."""
        span = (parse_date(fy_end) - parse_date(previous_fy_end)).days
        return not TRANSITION_YEAR_DAYS[0] <= span <= TRANSITION_YEAR_DAYS[1]

    def quarter_index(self, period_end):
        """1..4 by elapsed fraction of the fiscal year, or None if undecidable.

        1.20.0 (F-TTM-2): no clamping. A period whose position is not one of the
        four quarters of a normal fiscal year - in particular every period of a
        transition year after a change of fiscal year end - has no quarter slot
        (NOT_QUARTER_ELIGIBLE). Clamping put Multi-Fineline's Oct-Dec 2015 on
        the slot of Jul-Sep 2015 (the calendar, still without the end of the
        10-KT's transition period 2014-10-01..2014-12-31, saw 2014-09-30 to
        2015-12-31 as one year; 1.21.0 learns that end), and a TTM asked for
        2015-12-31 ended a quarter early."""
        period_end = parse_date(period_end)
        previous, fy_end = self._boundaries_covering(period_end)
        if fy_end is None or previous is None:
            return None
        if self.is_transition_year(previous, fy_end):
            return None
        elapsed = (period_end - previous).days
        if elapsed <= 0:
            return None
        index = int(round(elapsed / QUARTER_LENGTH_DAYS))
        return index if 1 <= index <= 4 else None

    def _is_extrapolated_fy_end(self, period_end):
        """A projected year end (no annual report yet) still counts as FY end."""
        period_end = parse_date(period_end)
        tolerance = FY_BOUNDARY_TOLERANCE_DAYS
        return any(abs((period_end - end).days) <= tolerance for end in self._extrapolated)

    def period_end_is_fy_end(self, period_end):
        period_end = parse_date(period_end)
        tolerance = timedelta(days=FY_BOUNDARY_TOLERANCE_DAYS)
        return any(abs((period_end - end).days) <= tolerance.days
                   for end in (*self.fy_ends, *self._extrapolated))

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
            # A twelve-month period that does not end on a fiscal year end is a
            # trailing-twelve-month disclosure, not a fiscal year. It must not
            # become the FY value (it would overwrite the real one under the
            # as-of-latest restatement policy) and it must not be a quarter.
            if not self.period_end_is_fy_end(end) and not self._is_extrapolated_fy_end(end):
                return fiscal_year, None, kind
            return fiscal_year, "FY", kind
        if kind == "H":
            return fiscal_year, "YTD2", kind
        if kind == "9M":
            return fiscal_year, "YTD3", kind
        if kind in ("Q", "instant"):
            if kind == "instant" and self.period_end_is_fy_end(end):
                # A balance sheet dated on the fiscal year end is the FY balance
                # sheet and the Q4 balance sheet; both keys are emitted upstream.
                # Checked before the quarter slot: a transition year (1.20.0) has
                # no quarter slots but still a year-end balance sheet.
                return fiscal_year, "FY", kind
            index = self.quarter_index(end)
            if index is None:
                return fiscal_year, None, kind
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
        labels, fy_ends, unlabeled = {}, [], set()
        for row in payload.get("fiscal_years") or []:
            end = parse_date(row["period_end"])
            fy_ends.append(end)
            if row.get("fiscal_year") is None:
                unlabeled.add(end)
            else:
                labels[end] = row["fiscal_year"]
        calendar = cls(payload.get("cik"), fy_ends, labels,
                       payload.get("label_offset", 0),
                       payload.get("fiscal_year_end_hint"),
                       label_mid_offset=payload.get("label_mid_offset"), unlabeled=unlabeled)
        calendar.anchor_source = payload.get("anchor_source", calendar.anchor_source)
        return calendar

    def to_dict(self):
        return {
            "cik": self.cik,
            "label_offset": self.label_offset,
            "label_mid_offset": self.label_mid_offset,
            "fiscal_year_end_hint": self.fiscal_year_end_hint,
            "week_based": self._is_week_based(),
            "anchor_source": self.anchor_source,
            "fiscal_years": [
                {"fiscal_year": self.labels.get(end), "period_end": end.isoformat()}
                for end in self.fy_ends
            ],
            "rejected_anchors": [
                {"period_end": end, "filing_claimed_fy": claimed, "used_fy": used}
                for end, claimed, used in self.rejected_anchors
            ],
        }
