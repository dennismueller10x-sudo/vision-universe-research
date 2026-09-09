"""Conservative SEC entity classification before fundamentals ingestion.

The SEC current ticker map is an identity/mapping source, not an investable
equity universe.  Classification therefore uses only observable submissions
metadata (entity type, SIC, filing forms and name) and emits UNKNOWN whenever
those fields do not support a deterministic conclusion.  No rule is keyed to a
ticker or CIK.
"""
from dataclasses import asdict, dataclass, field
import re

from .provider import PERIODIC_FORMS, normalize_cik


OPERATING_COMPANY = "OPERATING_COMPANY"
BANK = "BANK"
INSURANCE = "INSURANCE"
REIT = "REIT"
FOREIGN_ISSUER = "FOREIGN_ISSUER"
ETF = "ETF"
MUTUAL_FUND = "MUTUAL_FUND"
CLOSED_END_FUND = "CLOSED_END_FUND"
TRUST = "TRUST"
SPV = "SPV"
ADR = "ADR"
OTHER = "OTHER"
UNKNOWN = "UNKNOWN"

GENERAL = "GENERAL"
BANK_PROFILE = "BANK"
INSURANCE_PROFILE = "INSURANCE"
REIT_PROFILE = "REIT"

US_GAAP = "US_GAAP"
IFRS = "IFRS"
CANADIAN_40_F = "CANADIAN_40_F"
ACCOUNTING_UNKNOWN = "UNKNOWN"

SUPPORTED = "SUPPORTED"
PARTIAL = "PARTIAL"
UNSUPPORTED = "UNSUPPORTED"
ELIGIBILITY_RULES_VERSION = "1.0.0"

REASON_OPERATING_PERIODIC = "OPERATING_ENTITY_WITH_DOMESTIC_PERIODIC_FILINGS"
REASON_BANK_SIC = "BANK_SIC"
REASON_INSURANCE_SIC = "INSURANCE_SIC"
REASON_REIT_SIC = "REIT_SIC"
REASON_FUND_FORMS = "INVESTMENT_COMPANY_FORMS"
REASON_FUND_NAME = "FUND_OR_ETF_NAME_AND_COMMODITY_SIC"
REASON_TRUST = "NON_OPERATING_TRUST"
REASON_SPV = "BLANK_CHECK_OR_SHELL_SIC"
REASON_ADR = "ADR_REGISTRATION_WITHOUT_PERIODIC_ISSUER_FILINGS"
REASON_FOREIGN = "FOREIGN_PERIODIC_FILING"
REASON_FOREIGN_UNSUPPORTED = "FOREIGN_ACCOUNTING_STANDARD_NOT_VALIDATED"
REASON_NO_PERIODIC = "NO_SUPPORTED_PERIODIC_FILINGS"
REASON_UNKNOWN_ENTITY = "INSUFFICIENT_SEC_METADATA"

DOMESTIC_PERIODIC_FORMS = frozenset({"10-K", "10-K/A", "10-Q", "10-Q/A"})
FOREIGN_PERIODIC_FORMS = frozenset({"20-F", "20-F/A", "40-F", "40-F/A"})
MUTUAL_FUND_FORMS = frozenset({"N-1A", "N-1A/A", "485APOS", "485BPOS", "485BXT"})
CLOSED_END_FUND_FORMS = frozenset({
    "N-2", "N-2/A", "N-CSR", "N-CSR/A", "N-CSRS", "N-CSRS/A", "N-Q",
})
INVESTMENT_REPORT_FORMS = frozenset({"N-CEN", "NPORT-P", "NPORT-EX", "N-PX"})

_ETF_NAME = re.compile(r"\b(?:ETF|ETN|EXCHANGE[ -]TRADED FUND)\b", re.IGNORECASE)
_FUND_NAME = re.compile(r"\b(?:FUND|PORTFOLIO)\b", re.IGNORECASE)
_TRUST_NAME = re.compile(r"\bTRUST\b", re.IGNORECASE)
_ADR_NAME = re.compile(r"(?:/ADR\b|\bADR\b|DEPOSITARY RECEIPT)", re.IGNORECASE)


@dataclass(frozen=True)
class EligibilityClassification:
    cik: str
    name: str
    entity_classification: str
    fundamentals_eligible: object
    accounting_standard: str
    accounting_capability: str
    metric_profile: str
    reason_codes: tuple = field(default_factory=tuple)
    evidence: dict = field(default_factory=dict)

    @property
    def expected_exclusion(self):
        return self.fundamentals_eligible is False

    def to_dict(self):
        payload = asdict(self)
        payload["rulesVersion"] = ELIGIBILITY_RULES_VERSION
        payload["fundamentalsEligible"] = payload.pop("fundamentals_eligible")
        payload["entityClassification"] = payload.pop("entity_classification")
        payload["accountingStandard"] = payload.pop("accounting_standard")
        payload["accountingCapability"] = payload.pop("accounting_capability")
        payload["metricProfile"] = payload.pop("metric_profile")
        payload["reasonCodes"] = list(payload.pop("reason_codes"))
        payload["expectedExclusion"] = self.expected_exclusion
        return payload


def _sic(profile):
    try:
        return int(profile.sic)
    except (TypeError, ValueError):
        return None


def _forms(filing_metadata):
    return {str(row.get("form") or "").strip() for row in filing_metadata or []}


def _latest_periodic_form(filing_metadata):
    periodic = [row for row in filing_metadata or [] if row.get("form") in PERIODIC_FORMS]
    if not periodic:
        return None
    newest = max(periodic, key=lambda row: (
        row.get("filing_date") or "", row.get("accession") or ""))
    return newest.get("form")


def classify_entity(profile, filing_metadata, taxonomies=()):
    """Return a deterministic, conservative classification from SEC evidence."""
    cik = normalize_cik(profile.cik)
    name = str(profile.name or "").strip()
    name_upper = name.upper()
    entity_type = str(profile.entity_type or "").strip().lower()
    sic = _sic(profile)
    sic_description = str(profile.sic_description or "").upper()
    forms = _forms(filing_metadata)
    latest_periodic = _latest_periodic_form(filing_metadata)
    taxonomies = {str(item) for item in taxonomies or ()}
    evidence = {
        "entityType": profile.entity_type,
        "sic": profile.sic,
        "sicDescription": profile.sic_description,
        "latestPeriodicForm": latest_periodic,
        "periodicForms": sorted(forms & PERIODIC_FORMS),
        "taxonomies": sorted(taxonomies),
    }

    if sic == 6770 or "BLANK CHECK" in str(profile.sic_description or "").upper():
        return EligibilityClassification(
            cik, name, SPV, False, US_GAAP, SUPPORTED, GENERAL,
            (REASON_SPV,), evidence)

    investment_forms = forms & (MUTUAL_FUND_FORMS | CLOSED_END_FUND_FORMS |
                                INVESTMENT_REPORT_FORMS)
    if forms & MUTUAL_FUND_FORMS:
        return EligibilityClassification(
            cik, name, MUTUAL_FUND, False, ACCOUNTING_UNKNOWN, UNSUPPORTED, GENERAL,
            (REASON_FUND_FORMS,), evidence)
    if forms & CLOSED_END_FUND_FORMS:
        return EligibilityClassification(
            cik, name, CLOSED_END_FUND, False, ACCOUNTING_UNKNOWN, UNSUPPORTED, GENERAL,
            (REASON_FUND_FORMS,), evidence)

    # Commodity and crypto exchange-traded products often identify as SEC
    # "operating" entities and file 10-K/10-Q.  SIC 6221 plus an explicit
    # fund/ETF name is the reproducible evidence that keeps them out of the
    # operating-company fundamentals denominator.
    if sic == 6221 and (_ETF_NAME.search(name) or _FUND_NAME.search(name)):
        return EligibilityClassification(
            cik, name, ETF, False, US_GAAP, PARTIAL, GENERAL,
            (REASON_FUND_NAME,), evidence)
    if sic == 6221 and _TRUST_NAME.search(name):
        return EligibilityClassification(
            cik, name, TRUST, False, US_GAAP, PARTIAL, GENERAL,
            (REASON_TRUST,), evidence)

    has_foreign_periodic = bool(forms & FOREIGN_PERIODIC_FORMS)
    has_domestic_periodic = bool(forms & DOMESTIC_PERIODIC_FORMS)
    if has_foreign_periodic and not has_domestic_periodic:
        if latest_periodic and latest_periodic.startswith("40-F"):
            standard = CANADIAN_40_F
        elif "ifrs-full" in taxonomies:
            standard = IFRS
        else:
            standard = ACCOUNTING_UNKNOWN
        return EligibilityClassification(
            cik, name, FOREIGN_ISSUER, False, standard, UNSUPPORTED, GENERAL,
            (REASON_FOREIGN, REASON_FOREIGN_UNSUPPORTED), evidence)

    if (sic == 8880 or _ADR_NAME.search(name)) and not has_domestic_periodic:
        return EligibilityClassification(
            cik, name, ADR, False, ACCOUNTING_UNKNOWN, UNSUPPORTED, GENERAL,
            (REASON_ADR,), evidence)

    # N-PX/N-CEN/NPORT can appear in the history of an operating registrant or
    # an affiliated filer. They are supporting evidence, never a stand-alone
    # reason to turn an operating company into a fund.
    if ((investment_forms and entity_type != "operating"
         and (_FUND_NAME.search(name) or _TRUST_NAME.search(name)))
            or (_TRUST_NAME.search(name) and entity_type != "operating")):
        return EligibilityClassification(
            cik, name, TRUST, False, ACCOUNTING_UNKNOWN, UNSUPPORTED, GENERAL,
            (REASON_TRUST,), evidence)

    if entity_type == "operating" and has_domestic_periodic:
        if ((sic is not None and 6020 <= sic <= 6099)
                or (sic == 6712 and "BANK HOLDING" in sic_description)):
            entity_classification, metric_profile, reason = BANK, BANK_PROFILE, REASON_BANK_SIC
        elif sic is not None and 6300 <= sic <= 6411:
            entity_classification = INSURANCE
            metric_profile, reason = INSURANCE_PROFILE, REASON_INSURANCE_SIC
        elif sic == 6798:
            entity_classification, metric_profile, reason = REIT, REIT_PROFILE, REASON_REIT_SIC
        else:
            entity_classification, metric_profile, reason = (
                OPERATING_COMPANY, GENERAL, REASON_OPERATING_PERIODIC)
        return EligibilityClassification(
            cik, name, entity_classification, True, US_GAAP, SUPPORTED,
            metric_profile, (reason,), evidence)

    if entity_type == "other" and not forms & PERIODIC_FORMS:
        return EligibilityClassification(
            cik, name, OTHER, False, ACCOUNTING_UNKNOWN, UNSUPPORTED, GENERAL,
            (REASON_NO_PERIODIC,), evidence)

    return EligibilityClassification(
        cik, name, UNKNOWN, None, ACCOUNTING_UNKNOWN, UNSUPPORTED, GENERAL,
        (REASON_UNKNOWN_ENTITY,), evidence)


def fundamentals_gate_sample(classifications, size):
    """Select the first ``size`` eligible rows from deterministic candidates."""
    if size < 1:
        raise ValueError("sample size must be positive")
    rows = []
    for item in classifications:
        classification = item.get("classification") or item
        if "fundamentalsEligible" not in classification:
            continue
        if classification.get("fundamentalsEligible") is not True:
            continue
        rows.append({
            **{key: value for key, value in item.items() if key != "classification"},
            "classification": classification,
        })
        if len(rows) == size:
            break
    return {
        "schemaVersion": 2,
        "universeType": "SEC_FUNDAMENTALS_ELIGIBLE_GATE_SAMPLE",
        "requestedSize": size,
        "actualSize": len(rows),
        "eligibilityRequired": True,
        "companies": rows,
        "limitations": [
            "eligibility is based on current SEC submissions metadata",
            "this is not a historical investable or survivorship-free universe",
            "historical security-master coverage remains external",
        ],
    }


def build_classification_report(rows):
    rows = list(rows)
    counts = {}
    accounting = {}
    eligible = excluded = unknown = 0
    classification_failures = 0
    for row in rows:
        classification = row.get("classification") or row
        if "entityClassification" not in classification:
            classification_failures += 1
            continue
        category = classification["entityClassification"]
        counts[category] = counts.get(category, 0) + 1
        standard = classification.get("accountingStandard", ACCOUNTING_UNKNOWN)
        capability = classification.get("accountingCapability", UNSUPPORTED)
        bucket = accounting.setdefault(standard, {"companies": 0, "capabilities": {}})
        bucket["companies"] += 1
        bucket["capabilities"][capability] = (
            bucket["capabilities"].get(capability, 0) + 1)
        state = classification.get("fundamentalsEligible")
        eligible += state is True
        excluded += state is False
        unknown += state is None
    return {
        "schemaVersion": 1,
        "totalSample": len(rows),
        "eligible": eligible,
        "expectedExclusions": excluded,
        "unknown": unknown,
        "classificationFailures": classification_failures,
        "byEntityClassification": dict(sorted(counts.items())),
        "accountingStandardCoverage": dict(sorted(accounting.items())),
        "companies": rows,
    }
