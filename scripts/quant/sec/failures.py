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

FAILURE_CODES = frozenset({
    NO_CIK, NO_FILINGS, NO_COMPANY_FACTS, UNSUPPORTED_ENTITY, MAPPING_ERROR,
    SEC_RATE_LIMIT, NETWORK_ERROR, NORMALIZATION_ERROR, QUALITY_FAILURE, UNKNOWN,
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
            return SEC_RATE_LIMIT
        return NETWORK_ERROR
    if stage == "mapping":
        return MAPPING_ERROR
    if stage == "normalization":
        return NORMALIZATION_ERROR
    return UNKNOWN
