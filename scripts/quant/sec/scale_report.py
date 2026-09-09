"""Measured coverage/performance report for a SEC scale-gate run."""
from datetime import datetime, timezone
from pathlib import Path

from .restatements import to_instant


IMPORTANT_METRICS = (
    "revenue", "cost_of_revenue", "gross_profit", "operating_income", "ebit",
    "pretax_income",
    "net_income", "eps_basic", "eps_diluted", "interest_expense",
    "income_tax_expense", "cash_and_equivalents", "short_term_investments",
    "total_assets", "current_assets", "current_liabilities",
    "total_liabilities", "stockholders_equity", "short_term_debt",
    "long_term_debt", "goodwill", "intangible_assets", "inventory",
    "accounts_receivable", "operating_cash_flow", "capital_expenditures",
    "free_cash_flow", "total_debt",
    "investing_cash_flow", "financing_cash_flow", "share_repurchases",
    "dividends_paid", "shares_outstanding",
    "basic_weighted_average_shares", "diluted_weighted_average_shares",
)


def _utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _observation_count(document):
    return sum(len(row.get("observations") or [])
               for row in (document.get("factbook") or {}).get("timelines") or [])


def _pit_stats(document):
    total = timestamped = violations = 0
    for timeline in (document.get("factbook") or {}).get("timelines") or []:
        for observation in timeline.get("observations") or []:
            total += 1
            available = observation.get("available_from") or observation.get("filed")
            period_end = observation.get("period_end")
            if available:
                timestamped += 1
            if available and period_end:
                instant = to_instant(available)
                end = to_instant(period_end)
                if instant is not None and end is not None and instant < end:
                    violations += 1
    return total, timestamped, violations


def _metrics(document):
    return {row.get("metric") for row in
            (document.get("factbook") or {}).get("timelines") or [] if row.get("metric")}


def _derived_metrics(reported):
    derived = set()
    if {"revenue", "cost_of_revenue"}.issubset(reported):
        derived.add("gross_profit")
    if {"pretax_income", "interest_expense"}.issubset(reported):
        derived.add("ebit")
    if {"operating_cash_flow", "capital_expenditures"}.issubset(reported):
        derived.add("free_cash_flow")
    if {"long_term_debt", "short_term_debt"}.issubset(reported):
        derived.add("total_debt")
    return derived


def _projection(storage_bytes, companies):
    if not companies:
        return []
    per_company = storage_bytes / companies
    return [{
        "companies": size,
        "projectedBytes": round(per_company * size),
        "method": "ESTIMATE_LINEAR_FROM_CURRENT_GATE_NOT_GUARANTEED",
    } for size in (500, 2000, 5000, 10000)]


def _directory_bytes(path, ciks=None):
    if not path:
        return None
    root = Path(path)
    if not root.exists():
        return 0
    if ciks is None:
        paths = (root,)
    else:
        paths = tuple(root / str(cik).zfill(10) for cik in ciks)
    return sum(item.stat().st_size for scoped in paths if scoped.exists()
               for item in scoped.rglob("*") if item.is_file())


def build_scale_report(store, requested_entries, gate, run_manifest=None,
                       raw_store_path=None):
    """Build a report from persisted evidence; no network and no mutations."""
    entries = list(requested_entries)
    requested_ciks = [str(row["cik"]).zfill(10) if isinstance(row, dict)
                      else str(row).zfill(10) for row in entries]
    documents = []
    missing = []
    for cik in requested_ciks:
        document = store.read_company(cik)
        if document is None:
            missing.append(cik)
        else:
            documents.append(document)

    raw_facts = sum((doc.get("stats") or {}).get("raw_facts", 0) for doc in documents)
    normalized = sum(_observation_count(doc) for doc in documents)
    duplicates = sum((doc.get("stats") or {}).get("duplicates", 0) for doc in documents)
    pit_total = pit_timestamped = pit_violations = 0
    metric_company_counts = {metric: 0 for metric in IMPORTANT_METRICS}
    metric_reported_counts = {metric: 0 for metric in IMPORTANT_METRICS}
    metric_derived_counts = {metric: 0 for metric in IMPORTANT_METRICS}
    quality_failures = 0
    quality_status_counts = {}
    accounting_counts = {}
    entity_counts = {}
    companies = []
    for document in documents:
        total, timestamped, violations = _pit_stats(document)
        pit_total += total
        pit_timestamped += timestamped
        pit_violations += violations
        reported_metrics = _metrics(document)
        derived_metrics = _derived_metrics(reported_metrics)
        metrics = reported_metrics | derived_metrics
        for metric in metric_company_counts:
            if metric in metrics:
                metric_company_counts[metric] += 1
            if metric in reported_metrics:
                metric_reported_counts[metric] += 1
            if metric in derived_metrics and metric not in reported_metrics:
                metric_derived_counts[metric] += 1
        errors = ((document.get("quality") or {}).get("summary") or {}).get(
            "by_severity", {}).get("ERROR", 0)
        if errors:
            quality_failures += 1
        scorecard = document.get("qualityScorecard") or {}
        quality_status = scorecard.get("qualityStatus", "UNKNOWN")
        quality_status_counts[quality_status] = quality_status_counts.get(quality_status, 0) + 1
        classification = document.get("classification") or {}
        accounting = classification.get("accountingStandard", "UNKNOWN")
        accounting_counts[accounting] = accounting_counts.get(accounting, 0) + 1
        entity = classification.get("entityClassification", "UNKNOWN")
        entity_counts[entity] = entity_counts.get(entity, 0) + 1
        companies.append({
            "cik": document.get("cik"),
            "rawFacts": (document.get("stats") or {}).get("raw_facts", 0),
            "normalizedObservations": _observation_count(document),
            "metricCount": len(metrics),
            "pitObservations": total,
            "pitTimestamped": timestamped,
            "pitViolations": violations,
            "qualityErrors": errors,
            "qualityStatus": quality_status,
            "entityClassification": entity,
            "accountingStandard": accounting,
            "qualityScorecard": scorecard,
        })

    storage = store.stats() if hasattr(store, "stats") else {}
    storage_bytes = (storage.get("databaseBytes") or storage.get("storageBytes")
                     or storage.get("compressedPayloadBytes") or 0)
    run = (run_manifest or store.read_manifest() or {}).get("run") or {}
    successful = len(documents)
    expected_exclusions = run.get("expected_exclusions", 0)
    real_failures = run.get("real_failures", max(0, len(requested_ciks) - successful))
    unprocessed = run.get("unprocessed", max(
        0, len(requested_ciks) - successful - expected_exclusions - real_failures))
    eligible = run.get("eligible", successful + real_failures)
    complete = successful == eligible and real_failures == 0 and unprocessed == 0
    canonical_violations = sum(
        (doc.get("qualityScorecard") or {}).get("canonicalViolations", 0)
        for doc in documents)
    status = "PASS" if (complete and not run.get("halted") and not pit_violations
                        and not canonical_violations) else "FAIL"
    metric_coverage = {
        metric: {
            "companies": count,
            "coverage": round(count / successful, 6) if successful else 0.0,
            "reportedCompanies": metric_reported_counts[metric],
            "derivedCompanies": metric_derived_counts[metric],
        }
        for metric, count in metric_company_counts.items()
    }
    return {
        "schemaVersion": 1,
        "generatedAtUtc": _utcnow(),
        "gate": str(gate),
        "status": status,
        "companiesRequested": len(requested_ciks),
        "companiesResolved": run.get("companies_resolved", len(requested_ciks)),
        "companiesSuccessful": successful,
        "totalSample": run.get("total_sample", len(requested_ciks)),
        "eligible": eligible,
        "expectedExclusions": expected_exclusions,
        "companiesFailed": real_failures,
        "realFailures": real_failures,
        "technicalFailureRate": run.get(
            "technical_failure_rate",
            round(real_failures / eligible, 6) if eligible else 0.0),
        "unprocessed": unprocessed,
        "missingCiks": missing,
        "factsRaw": raw_facts,
        "factsCanonicalNormalized": normalized,
        "duplicatesRemoved": duplicates,
        "pitCoverage": round(pit_timestamped / pit_total, 6) if pit_total else 0.0,
        "pitObservations": pit_total,
        "pitViolations": pit_violations,
        "metricCoverage": metric_coverage,
        "averageFactsPerCompany": round(normalized / successful, 2) if successful else 0,
        "qualityFailureCompanies": quality_failures,
        "qualityStatusCounts": dict(sorted(quality_status_counts.items())),
        "canonicalViolations": canonical_violations,
        "entityClassification": dict(sorted(entity_counts.items())),
        "accountingStandardCoverage": dict(sorted(accounting_counts.items())),
        "requestCount": run.get("request_count"),
        "cacheHitRate": run.get("cache_hit_rate"),
        "runTimeSeconds": run.get("run_time_seconds"),
        "retries": run.get("retry_count"),
        "http403Count": run.get("http_403_count"),
        "http429Count": run.get("http_429_count"),
        "http5xxCount": run.get("http_5xx_count"),
        "halted": run.get("halted"),
        "stopReason": run.get("stop_reason"),
        "failureCodes": run.get("failure_codes", {}),
        "exclusionCodes": run.get("exclusion_codes", {}),
        "storage": storage,
        "rawCacheBytes": _directory_bytes(raw_store_path, requested_ciks),
        "storageProjection": _projection(storage_bytes, successful),
        "companies": companies,
        "survivorshipBiasStatus": "FAIL",
        "securityMasterStatus": "EXTERNAL_SECURITY_MASTER_REQUIRED",
    }
