"""Canonical Vision Universe fundamental data model.

Two strictly separated fact kinds live here (Phase 4 § 26):

  RawFact          exactly what SEC/EDGAR reported, never modified, never derived.
  NormalizedFact   a canonical VU metric, carrying full provenance back to the
                   RawFact(s) it came from and a source telling you whether the
                   number came from SEC or was computed by Vision Universe.

A missing value is represented explicitly (value=None, available=False, reason=...)
and never as zero (Phase 4 § 14: UNKNOWN != FALSE, MISSING != ZERO).
"""
from dataclasses import dataclass, field, asdict
from datetime import date
from typing import Optional, List, Dict, Any

# --- provenance sources -----------------------------------------------------
SOURCE_SEC = "SEC_EDGAR_XBRL"
SOURCE_DERIVED = "VISION_UNIVERSE_DERIVED"

# --- transformations applied to get from raw to normalized ------------------
TRANSFORM_NONE = "AS_REPORTED"
TRANSFORM_YTD_DIFF = "YTD_DIFF"          # standalone quarter = YTD(n) - YTD(n-1)
TRANSFORM_FY_MINUS_YTD = "FY_MINUS_YTD"  # Q4 standalone = FY - YTD(Q3)
TRANSFORM_SUM = "SUM"                    # e.g. TTM = sum of four quarters
TRANSFORM_FORMULA = "FORMULA"            # derived metric

# --- reasons a value is unavailable -----------------------------------------
MISSING_XBRL_CONCEPT = "MISSING_XBRL_CONCEPT"
AMBIGUOUS_MAPPING = "AMBIGUOUS_MAPPING"
UNIT_MISMATCH = "UNIT_MISMATCH"
PERIOD_MISMATCH = "PERIOD_MISMATCH"
UNSUPPORTED_ACCOUNTING_STRUCTURE = "UNSUPPORTED_ACCOUNTING_STRUCTURE"
INSUFFICIENT_HISTORY = "INSUFFICIENT_HISTORY"
NOT_APPLICABLE_FOR_SECTOR = "NOT_APPLICABLE_FOR_SECTOR"
MISSING_INPUT = "MISSING_INPUT"
NOT_YET_AVAILABLE = "NOT_YET_AVAILABLE"
DIVISION_BY_ZERO = "DIVISION_BY_ZERO"

# --- quality / confidence states --------------------------------------------
QUALITY_HIGH = "HIGH"
QUALITY_MEDIUM = "MEDIUM"
QUALITY_LOW = "LOW"
QUALITY_UNKNOWN = "UNKNOWN"

# --- period kinds ------------------------------------------------------------
PERIOD_INSTANT = "instant"
PERIOD_QUARTER = "Q"
PERIOD_HALF = "H"
PERIOD_THREE_QUARTERS = "9M"
PERIOD_ANNUAL = "FY"
PERIOD_TTM = "TTM"
PERIOD_UNKNOWN = "UNKNOWN"


def _iso(value):
    return value.isoformat() if isinstance(value, date) else value


@dataclass(frozen=True)
class RawFact:
    """One XBRL fact exactly as SEC reported it. Immutable by construction."""
    cik: str
    taxonomy: str            # "us-gaap", "ifrs-full", "dei", ...
    concept: str             # e.g. "RevenueFromContractWithCustomerExcludingAssessedTax"
    unit: str                # e.g. "USD", "USD/shares", "shares"
    value: float
    start: Optional[str]     # ISO date; None for instant facts
    end: str                 # ISO date
    accession: str
    form: str                # 10-K, 10-Q, 10-K/A, 8-K, 20-F ...
    filed: str               # ISO date the SEC recorded the filing
    frame: Optional[str] = None
    filing_fy: Optional[int] = None   # the FILING's fiscal year, NOT the fact's
    filing_fp: Optional[str] = None   # the FILING's fiscal period, NOT the fact's
    retrieved_at: Optional[str] = None
    available_from: Optional[str] = None  # ISO datetime; acceptance time if known

    @property
    def fact_id(self):
        return f"{self.taxonomy}:{self.concept}|{self.unit}|{self.start or ''}|{self.end}|{self.accession}"

    def to_dict(self):
        return asdict(self)


@dataclass
class Provenance:
    """Everything needed to answer: where did this number come from?"""
    source: str = SOURCE_SEC
    taxonomy: Optional[str] = None
    concept: Optional[str] = None
    accession: Optional[str] = None
    form: Optional[str] = None
    filed: Optional[str] = None
    available_from: Optional[str] = None
    retrieved_at: Optional[str] = None
    transformation: str = TRANSFORM_NONE
    inputs: List[str] = field(default_factory=list)
    formula_version: Optional[str] = None
    registry_version: Optional[Any] = None
    normalization_version: Optional[str] = None

    def to_dict(self):
        return asdict(self)


@dataclass
class NormalizedFact:
    """A canonical VU metric value for one company and one fiscal period."""
    cik: str
    metric: str
    value: Optional[float]
    unit: Optional[str]
    fiscal_year: Optional[int]
    fiscal_period: Optional[str]          # Q1..Q4, FY, TTM
    period_start: Optional[str]
    period_end: Optional[str]
    period_kind: str = PERIOD_UNKNOWN
    available: bool = True
    reason: Optional[str] = None
    quality: str = QUALITY_HIGH
    flags: List[str] = field(default_factory=list)
    provenance: Provenance = field(default_factory=Provenance)

    @property
    def key(self):
        return (self.metric, self.fiscal_year, self.fiscal_period)

    def to_dict(self):
        payload = asdict(self)
        payload["provenance"] = self.provenance.to_dict()
        return payload


def missing(cik, metric, reason, fiscal_year=None, fiscal_period=None,
            period_end=None, unit=None, provenance=None):
    """Construct an explicitly-missing fact. Never returns a zero value."""
    return NormalizedFact(
        cik=cik, metric=metric, value=None, unit=unit,
        fiscal_year=fiscal_year, fiscal_period=fiscal_period,
        period_start=None, period_end=_iso(period_end),
        available=False, reason=reason, quality=QUALITY_UNKNOWN,
        provenance=provenance or Provenance(source=SOURCE_SEC),
    )


@dataclass
class CompanyProfile:
    """Identity and classification, from the SEC submissions endpoint."""
    cik: str
    name: str
    tickers: List[str] = field(default_factory=list)
    exchanges: List[str] = field(default_factory=list)
    sic: Optional[str] = None
    sic_description: Optional[str] = None
    fiscal_year_end: Optional[str] = None   # "MMDD" as SEC reports it
    former_names: List[Dict[str, Any]] = field(default_factory=list)
    entity_type: Optional[str] = None
    state_of_incorporation: Optional[str] = None
    retrieved_at: Optional[str] = None

    # SIC 6000-6499 are depository/credit/security/insurance institutions.
    # Their income statement has no cost of revenue, so gross-profit style
    # metrics are structurally undefined rather than merely missing (§ 15).
    @property
    def is_financial(self):
        try:
            code = int(self.sic)
        except (TypeError, ValueError):
            return False
        return 6000 <= code <= 6499

    def to_dict(self):
        payload = asdict(self)
        payload["is_financial"] = self.is_financial
        return payload
