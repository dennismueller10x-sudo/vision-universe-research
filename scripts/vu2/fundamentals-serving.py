"""Server-side projection of an existing R2 factbook; no transport or ingestion.

The caller supplies an identity already resolved by Company Master, its eligibility
verdict, and the immutable R2 bytes plus the trusted index digest. This module does
not resolve tickers, read credentials, fetch providers, write storage or host an API.
It delegates every period/revision calculation to the existing SEC implementation.
"""
import gzip
import hashlib
import io
import json
import math
import zlib
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from quant.sec.pipeline import export_inspector_view, _rehydrate, _row
from quant.sec.periods import PeriodResolver
from quant.sec.registry import MetricRegistry
from quant.sec.restatements import POLICY_AS_OF_LATEST, POLICY_LATEST_KNOWN, POLICY_ORIGINAL
from quant.sec.version import NORMALIZATION_SCHEMA_VERSION, version_stamp

SCHEMA = "vu-fundamentals-serving-1.0.0"
MAX_COMPRESSED_BYTES = 16 * 1024 * 1024
MAX_DOCUMENT_BYTES = 64 * 1024 * 1024


class ServingError(ValueError):
    """A fail-closed contract error; messages never contain payload or credentials."""
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _require(condition, code):
    if not condition:
        raise ServingError(code)


def _instant(value, *, date_end=True):
    _require(isinstance(value, str), "INVALID_AS_OF")
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            return datetime.fromisoformat(value).replace(tzinfo=timezone.utc, hour=23 if date_end else 0, minute=59 if date_end else 0, second=59 if date_end else 0)
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        _require(result.tzinfo is not None, "INVALID_AS_OF")
        return result.astimezone(timezone.utc)
    except ValueError:
        raise ServingError("INVALID_AS_OF") from None


def project_factbook(compressed, *, expected_sha256, identity, eligible, policy,
                     as_of, usage="research", now=None, annual_years=30, quarterly_years=15, full_history=False):
    """Project trusted persisted bytes, preserving units, evidence and industry rows.

    AS_OF_LATEST is mandatory for backtest input. LATEST_KNOWN is retrospective
    research only. No output from this adapter certifies professional backtest
    readiness (execution, universe, prices and costs require their own gates).
    """
    _require(isinstance(identity, dict), "INVALID_IDENTITY")
    security_id = identity.get("securityId")
    cik = identity.get("cik")
    # Product Services expose instrumentId as securityId. masterMemberId is the
    # separate eligibility-member key (for example ref_AAPL), not that listing ID.
    # Both are opaque resolved identifiers: this adapter never reconstructs them.
    _require(isinstance(security_id, str) and bool(security_id.strip())
             and identity.get("instrumentId") == security_id
             and isinstance(identity.get("masterMemberId"), str)
             and bool(identity["masterMemberId"].strip()), "INVALID_IDENTITY")
    _require(eligible is True, "NOT_ELIGIBLE")
    if cik is None:
        return {"schema": SCHEMA, "state": "UNAVAILABLE", "reason": "NO_CIK",
                "identity": dict(identity), "history": None, "backtestReady": False}
    _require(isinstance(cik, str) and re.fullmatch(r"\d{10}", cik)
             and identity.get("issuerId") == "iss_cik_" + cik, "INVALID_IDENTITY")
    _require(usage in ("research", "backtest"), "INVALID_USAGE")
    _require(policy in (POLICY_AS_OF_LATEST, POLICY_ORIGINAL, POLICY_LATEST_KNOWN), "INVALID_POLICY")
    _require(usage != "backtest" or policy == POLICY_AS_OF_LATEST, "UNSAFE_BACKTEST_POLICY")
    _require(not full_history or policy != POLICY_LATEST_KNOWN, "UNSAFE_FULL_HISTORY_POLICY")
    cutoff = _instant(as_of)
    clock = now or datetime.now(timezone.utc)
    _require(isinstance(clock, datetime) and clock.tzinfo is not None, "INVALID_CLOCK")
    clock = clock.astimezone(timezone.utc)
    # Date-only queries mean the end of that calendar day, as in SEC's resolver.
    _require(cutoff.date() <= clock.astimezone(timezone.utc).date()
             if len(as_of) == 10 else cutoff <= clock, "FUTURE_AS_OF")
    _require(usage != "backtest" or cutoff <= clock, "BACKTEST_CUTOFF_NOT_COMPLETE")
    _require(all(type(v) is int and 1 <= v <= 100 for v in (annual_years, quarterly_years)), "INVALID_SCOPE")
    _require(isinstance(compressed, bytes) and 0 < len(compressed) <= MAX_COMPRESSED_BYTES, "INVALID_OBJECT_SIZE")
    _require(isinstance(expected_sha256, str) and re.fullmatch(r"[0-9a-f]{64}", expected_sha256)
             and hashlib.sha256(compressed).hexdigest() == expected_sha256, "OBJECT_DIGEST_MISMATCH")
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as source:
            body = source.read(MAX_DOCUMENT_BYTES + 1)
        _require(len(body) <= MAX_DOCUMENT_BYTES, "DOCUMENT_TOO_LARGE")
        document = json.loads(body)
    except (OSError, EOFError, UnicodeError, json.JSONDecodeError, zlib.error):
        raise ServingError("INVALID_FACTBOOK") from None
    _require(isinstance(document, dict) and document.get("cik") == cik
             and isinstance(document.get("profile"), dict) and document["profile"].get("cik") == cik,
             "FACTBOOK_IDENTITY_MISMATCH")
    _require(document.get("isMock") is not True, "MOCK_NOT_ALLOWED")
    registry = MetricRegistry.load()
    versions = document.get("versions") or {}
    _require(versions.get("normalization_schema") == NORMALIZATION_SCHEMA_VERSION
             and (versions.get("metric_registry") or {}).get("mapping_version") == registry.mapping_version
             and bool(versions.get("normalization_logic")) and bool(versions.get("formula")), "UNSUPPORTED_FACTBOOK_VERSION")
    _require(type(full_history) is bool, "INVALID_SCOPE")
    try:
        book = _rehydrate(document)
        if full_history:
            # Existing exporter accepts a count, not a calendar horizon. Include
            # every stored fiscal year for projection, then remove years whose
            # existence was not yet visible at the requested cutoff.
            annual_years = quarterly_years = max(1, len(book.fiscal_years()))
        history = export_inspector_view(document, registry, as_of=as_of,
            annual_years=annual_years, quarterly_years=quarterly_years, policy=policy)
        if full_history:
            visible_years = sorted({timeline.fiscal_year for timeline in book.timelines.values()
                                    if timeline.fiscal_year is not None and timeline.visible(as_of)})
            visible_year_set = set(visible_years)
            history["scope"] = {"annual_years": visible_years, "quarterly_years": visible_years}
            history["rows"] = [row for row in history["rows"]
                               if row.get("fiscal_year") in visible_year_set]
            # The exporter is also used by a current-state inspector and carries
            # current profile/calendar/quality metadata. Those fields are not
            # historical issuer metadata, so do not expose them on the PIT path.
            for name in ("generated_at_utc", "versions", "profile", "calendar",
                         "quality_summary", "quality_errors"):
                history.pop(name, None)
            history["metadata_scope"] = "AS_OF_ROWS_ONLY"
        industry, names = registry.industry_metrics_for(document["profile"].get("sic"))
        industry_rows = []
        if industry:
            resolver = PeriodResolver(_rehydrate(document), registry)
            for metric in names:
                for year in history["scope"]["annual_years"]:
                    industry_rows.append(_row(resolver.annual(metric, year, as_of, policy=policy)))
                for year in history["scope"]["quarterly_years"]:
                    for quarter in range(1, 5):
                        industry_rows.append(_row(resolver.quarter(metric, year, quarter, as_of, policy=policy)))
        all_rows = history["rows"] + industry_rows
        for row in all_rows:
            if row.get("available") is True:
                _require(type(row.get("value")) in (int, float) and math.isfinite(row["value"])
                         and bool(row.get("unit")) and bool(row.get("accession"))
                         and bool(row.get("filed")) and bool(row.get("available_from")), "INVALID_FACT_EVIDENCE")
                if policy != POLICY_LATEST_KNOWN:
                    _require(_instant(row["available_from"], date_end=False) <= cutoff,
                             "FACT_AFTER_CUTOFF")
                _require(_instant(row["filed"], date_end=False).date() <= clock.date()
                         and _instant(row["available_from"], date_end=False) <= clock, "FUTURE_FACT")
        available = sum(row.get("available") is True for row in all_rows)
        if usage == "backtest" and len(as_of) > 10:
            _require(all(len(str(row.get("available_from", ""))) > 10
                         for row in all_rows if row.get("available") is True),
                     "INSUFFICIENT_AVAILABILITY_PRECISION")
        revisions = []
        if full_history:
            # Reuse canonical timeline visibility; never leak later revisions,
            # or a full-timeline RESTATED flag into a historical as-of request.
            for key in sorted(book.timelines, key=lambda item: (str(item[0]), -1 if item[1] is None else int(item[1]), str(item[2]))):
                timeline = book.timelines[key]
                observations = timeline.visible(as_of)
                if not observations:
                    continue
                for observation in observations:
                    _require(type(observation.value) in (int, float)
                             and math.isfinite(observation.value)
                             and observation.unit and observation.accession
                             and observation.filed and observation.available_from,
                             "INVALID_FACT_EVIDENCE")
                    _require(observation.available_instant <= cutoff
                             and observation.available_instant <= clock,
                             "FUTURE_FACT")
                    if usage == "backtest" and len(as_of) > 10:
                        _require(len(str(observation.available_from)) > 10,
                                 "INSUFFICIENT_AVAILABILITY_PRECISION")
                revisions.append({"metric": timeline.metric,
                    "fiscal_year": timeline.fiscal_year,
                    "fiscal_period": timeline.fiscal_period,
                    "restated": timeline._values_differ(observations),
                    "observations": [observation.to_dict() for observation in observations]})
    except ServingError:
        raise
    except (KeyError, TypeError, ValueError, AttributeError):
        raise ServingError("INVALID_FACTBOOK") from None
    source_absent = document.get("companyfacts_status") == "NOT_AVAILABLE_404"
    _require(not source_absent or available == 0, "INCONSISTENT_SOURCE_AVAILABILITY")
    backtest_revision_source = full_history and usage == "backtest"
    return {"schema": SCHEMA, "state": "AVAILABLE" if available else "UNAVAILABLE" if source_absent else "MISSING",
            "reason": None if available else "SEC_COMPANYFACTS_NOT_AVAILABLE" if source_absent else "NO_RESOLVABLE_FACTS",
            "identity": {k: identity[k] for k in ("securityId", "instrumentId", "masterMemberId", "issuerId", "cik")},
            # Current SIC drives PeriodResolver's sector applicability. Until
            # historical issuer classifications exist, only the raw canonical
            # observation timelines are certified for a backtest request.
            "history": None if backtest_revision_source else history,
            "revisionHistory": revisions if full_history else None,
            "historyScope": "FULL_STORED_HISTORY" if full_history else "BOUNDED_PERIODS",
            "revisionScope": "VISIBLE_AT_AS_OF" if full_history else None,
            "pitBacktestSource": "revisionHistory" if backtest_revision_source else None,
            "resolvedHistoryPITSafety": "RAW_REVISIONS_ONLY" if full_history else "NOT_CERTIFIED",
            "industrySpecificMetrics": None if backtest_revision_source else
                ({"industry": industry.industry_id, "rows": industry_rows} if industry else None),
            "source": {"objectKey": "v1/sec/fundamentals/facts/" + cik + ".json.gz",
                       "sha256": expected_sha256, "versions": versions,
                       "generatedAt": document.get("generated_at_utc")},
            "servingVersions": version_stamp(versions["metric_registry"]),
            "usage": usage, "policy": policy, "asOf": as_of,
            "pitPolicyApplied": policy == POLICY_AS_OF_LATEST,
            "backtestReady": False,
            "backtestLimitations": ["EXECUTION_AND_UNIVERSE_GATES_REQUIRED", "SURVIVORSHIP_NOT_RESOLVED",
                                    "HISTORICAL_ISSUER_CLASSIFICATION_NOT_AVAILABLE"]}
