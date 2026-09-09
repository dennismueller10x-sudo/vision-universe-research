"""Stable ingestion failure taxonomy used by checkpoints and scale reports."""
from dataclasses import dataclass

from .http_client import SECHTTPError
from .provider import TickerNotFound


NO_CIK = "NO_CIK"
NO_FILINGS = "NO_FILINGS"
NO_COMPANY_FACTS = "NO_COMPANY_FACTS"
UNSUPPORTED_ENTITY = "UNSUPPORTED_ENTITY"
MAPPING_ERROR = "MAPPING_ERROR"
SEC_RATE_LIMIT = "SEC_RATE_LIMIT"
NETWORK_ERROR = "NETWORK_ERROR"
NORMALIZATION_ERROR = "NORMALIZATION_ERROR"
QUALITY_FAILURE = "QUALITY_FAILURE"
UNKNOWN = "UNKNOWN"

# Phase-2 taxonomy.  The legacy names above remain readable in old
# checkpoints, but new runs distinguish expected exclusions from genuine
# pipeline failures.
EXCLUDED_NON_OPERATING_ENTITY = "EXCLUDED_NON_OPERATING_ENTITY"
EXCLUDED_FUND = "EXCLUDED_FUND"
EXCLUDED_TRUST = "EXCLUDED_TRUST"
EXCLUDED_SPV = "EXCLUDED_SPV"
EXCLUDED_ADR = "EXCLUDED_ADR"
UNSUPPORTED_FOREIGN_ISSUER = "UNSUPPORTED_FOREIGN_ISSUER"
UNSUPPORTED_ACCOUNTING_STANDARD = "UNSUPPORTED_ACCOUNTING_STANDARD"
NO_PERIODIC_FILINGS = "NO_PERIODIC_FILINGS"
SEC_NOT_FOUND = "SEC_NOT_FOUND"
HTTP_ERROR = "HTTP_ERROR"
RATE_LIMITED = "RATE_LIMITED"
PARSER_ERROR = "PARSER_ERROR"
PIT_VIOLATION = "PIT_VIOLATION"

EXPECTED_EXCLUSION_CODES = frozenset({
    EXCLUDED_NON_OPERATING_ENTITY, EXCLUDED_FUND, EXCLUDED_TRUST,
    EXCLUDED_SPV, EXCLUDED_ADR, UNSUPPORTED_FOREIGN_ISSUER,
    UNSUPPORTED_ACCOUNTING_STANDARD,
})

FAILURE_CODES = frozenset({
    NO_CIK, NO_FILINGS, NO_COMPANY_FACTS, UNSUPPORTED_ENTITY, MAPPING_ERROR,
    SEC_RATE_LIMIT, NETWORK_ERROR, NORMALIZATION_ERROR, QUALITY_FAILURE, UNKNOWN,
    EXCLUDED_NON_OPERATING_ENTITY, EXCLUDED_FUND, EXCLUDED_TRUST, EXCLUDED_SPV,
    EXCLUDED_ADR, UNSUPPORTED_FOREIGN_ISSUER, UNSUPPORTED_ACCOUNTING_STANDARD,
    NO_PERIODIC_FILINGS, SEC_NOT_FOUND, HTTP_ERROR, RATE_LIMITED, PARSER_ERROR,
    PIT_VIOLATION,
})


class IngestionFailure(RuntimeError):
    def __init__(self, code, message, context=None):
        if code not in FAILURE_CODES:
            raise ValueError(f"unknown failure code: {code}")
        super().__init__(message)
        self.code = code
        self.context = dict(context or {})


def classify_failure(error, stage=None):
    if isinstance(error, IngestionFailure):
        return error.code
    if isinstance(error, TickerNotFound):
        return NO_CIK
    if isinstance(error, SECHTTPError):
        if error.status in (403, 429):
            return RATE_LIMITED
        if error.status == 404:
            return SEC_NOT_FOUND
        return HTTP_ERROR
    if stage == "mapping":
        return MAPPING_ERROR
    if stage == "normalization":
        return NORMALIZATION_ERROR
    return UNKNOWN
