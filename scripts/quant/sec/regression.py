"""Golden-bundle regression comparison for a freshly ingested fact store."""
import json
from pathlib import Path

from .canonical import build_company_bundle
from .provider import normalize_cik


FACT_KEY = (
    "metricId", "fiscalPeriod", "fiscalYear", "periodEnd", "availableAt", "revisionId",
)
FILING_KEY = ("filingId", "formType", "fiscalPeriod", "fiscalYear", "periodEnd", "filedAt")


def _index(rows, fields):
    return {tuple(row.get(field) for field in fields): row for row in rows}


def compare_bundle(reference, candidate):
    reference_facts = _index(reference.get("facts") or [], FACT_KEY)
    candidate_facts = _index(candidate.get("facts") or [], FACT_KEY)
    missing = []
    changed = []
    for key, old in reference_facts.items():
        new = candidate_facts.get(key)
        if new is None:
            missing.append(key)
        elif (new.get("value"), new.get("unit"), new.get("sourceFilingId"),
              new.get("restatementStatus")) != (
                  old.get("value"), old.get("unit"), old.get("sourceFilingId"),
                  old.get("restatementStatus")):
            changed.append({"key": key, "reference": old, "candidate": new})

    reference_filings = _index(reference.get("filings") or [], FILING_KEY)
    candidate_filings = _index(candidate.get("filings") or [], FILING_KEY)
    missing_filings = [key for key in reference_filings if key not in candidate_filings]
    return {
        "referenceFacts": len(reference_facts),
        "candidateFacts": len(candidate_facts),
        "newFacts": len(set(candidate_facts) - set(reference_facts)),
        "missingFacts": len(missing),
        "changedFacts": len(changed),
        "missingFilings": len(missing_filings),
        "samples": {
            "missingFacts": missing[:10],
            "changedFacts": changed[:10],
            "missingFilings": missing_filings[:10],
        },
        "status": "PASS" if not missing and not changed and not missing_filings else "FAIL",
    }


def compare_golden(store, registry, configured_companies, canonical_directory):
    results = []
    for entry in configured_companies:
        cik = normalize_cik(entry["cik"])
        ticker = entry["ticker"]
        document = store.read_company(cik)
        reference_path = Path(canonical_directory) / f"{ticker}.json"
        if document is None or not reference_path.exists():
            results.append({
                "ticker": ticker, "cik": cik, "status": "FAIL",
                "reason": "missing candidate factbook or committed reference bundle",
            })
            continue
        candidate = build_company_bundle(document, registry, ticker)
        reference = json.loads(reference_path.read_text(encoding="utf-8"))
        results.append({"ticker": ticker, "cik": cik,
                        **compare_bundle(reference, candidate)})
    return {
        "status": "PASS" if results and all(row["status"] == "PASS" for row in results)
                  else "FAIL",
        "companies": results,
    }
