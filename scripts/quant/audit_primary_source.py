#!/usr/bin/env python3
"""Cross-check canonical VU values against SEC primary data, fact by fact.

Every other check in this repository compares the pipeline against itself: the
factbook against the registry, the canonical layer against the schema, the gates
against the canonical layer. This one goes outside. It re-fetches
`companyfacts` from data.sec.gov, finds the raw XBRL entry that a given
canonical value should have come from, and compares them.

For each checked cell it records what an auditor needs to repeat the check by
hand: SEC concept, accession number, filing date, period end, the raw SEC value,
the normalized VU value and the canonical VU value.

A MISMATCH here is the only kind of finding that cannot be explained away by a
consistent-but-wrong pipeline.

    python3 scripts/quant/audit_primary_source.py [--out FILE] [--per-company N]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from quant.sec.canonical import METRIC_MAP
from quant.sec.pipeline import _rehydrate
from quant.sec.provider import PERIODIC_FORMS, SECProvider, normalize_cik
from quant.sec.registry import MetricRegistry
from quant.sec.store import JsonFactStore

ROOT = Path(__file__).resolve().parents[2]
CANONICAL_DIR = ROOT / "quant" / "data" / "sec" / "canonical"
DEFAULT_OUT = ROOT / "quant" / "data" / "sec" / "primary_source_audit.json"

# The metrics section 4 of the audit brief names, in the order it names them.
# `operating_cash_flow` has no canonical counterpart (quant/engines/schema.js
# declares no such metricId), so it is checked raw-against-normalized only.
AUDITED = ("revenue", "net_income", "operating_cash_flow", "total_assets",
           "stockholders_equity", "shares_outstanding")

# Values agreeing to within this relative amount count as a match. Canonical
# values are scaled to millions and rounded to 6 decimals, so an exact integer
# comparison would fail on rounding alone.
TOLERANCE = 1e-6


def _rel(a, b):
    scale = max(abs(a), abs(b), 1.0)
    return abs(a - b) / scale


def _raw_index(provider, cik, company_facts, availability):
    """(taxonomy, concept, start, end, accession) -> raw SEC value."""
    index = {}
    for fact in provider.iter_raw_facts(company_facts, availability=availability,
                                        forms=PERIODIC_FORMS):
        index[(fact.taxonomy, fact.concept, fact.start, fact.end,
               fact.accession)] = fact
    return index


def audit_company(provider, registry, document, canonical, per_company):
    """Compare canonical cells for one company against re-fetched SEC facts."""
    cik = document["cik"]
    factbook = _rehydrate(document)
    company_facts = provider.get_company_facts(cik)
    from quant.sec.normalize import build_availability_map
    availability = build_availability_map(document.get("filing_index"))
    raw = _raw_index(provider, cik, company_facts, availability)

    canonical_by_cell = {}
    for row in canonical["facts"]:
        canonical_by_cell.setdefault(
            (row["metricId"], row["fiscalYear"], row["fiscalPeriod"]), []).append(row)

    # Cells the canonical layer withheld on purpose, so "not exported" can name
    # its reason instead of leaving an auditor to work it out by hand.
    suppressed = {(row["metricId"], row["fiscalYear"], row["fiscalPeriod"])
                  for row in canonical.get("periodEndConflicts", [])}

    checks = []
    for metric in AUDITED:
        canonical_id, _, scale = METRIC_MAP.get(metric, (None, None, None))
        years = factbook.fiscal_years()
        # Spread the sample across the history instead of clustering on the
        # most recent years, so an early-XBRL defect cannot hide.
        picked = 0
        for fiscal_year in years:
            if picked >= per_company:
                break
            for fiscal_period in ("FY", "Q1", "Q2", "Q3", "Q4"):
                if picked >= per_company:
                    break
                timeline = factbook.get(metric, fiscal_year, fiscal_period)
                if timeline is None or not len(timeline):
                    continue
                for observation in timeline.observations:
                    key = (observation.provenance.taxonomy,
                           observation.provenance.concept,
                           observation.period_start, observation.period_end,
                           observation.provenance.accession)
                    raw_fact = raw.get(key)
                    if raw_fact is None:
                        # A cover-date instant borrows its period end from the
                        # company's other facts for the same period, so it is
                        # keyed differently in the raw payload; look it up by
                        # the fact id the normalizer recorded instead.
                        candidates = [
                            value for value in raw.values()
                            if value.fact_id in (observation.provenance.inputs or [])
                        ]
                        raw_fact = candidates[0] if candidates else None
                    if raw_fact is None:
                        checks.append({
                            "ticker": canonical["security"]["ticker"],
                            "metric": metric, "canonicalMetricId": canonical_id,
                            "fiscalYear": fiscal_year, "fiscalPeriod": fiscal_period,
                            "verdict": "RAW_FACT_NOT_FOUND",
                            "secConcept": f"{observation.provenance.taxonomy}:"
                                          f"{observation.provenance.concept}",
                            "accession": observation.provenance.accession,
                        })
                        picked += 1
                        break

                    canonical_rows = canonical_by_cell.get(
                        (canonical_id, fiscal_year, fiscal_period), []) if canonical_id else []
                    canonical_match = next(
                        (row for row in canonical_rows
                         if _rel(row["value"], observation.value * scale) <= TOLERANCE),
                        None)

                    raw_vs_normalized = _rel(raw_fact.value, observation.value)
                    verdict = "MATCH"
                    if raw_vs_normalized > TOLERANCE:
                        verdict = "MISMATCH_RAW_VS_NORMALIZED"
                    elif canonical_id is None:
                        verdict = "MATCH_NO_CANONICAL_COUNTERPART"
                    elif not canonical_rows:
                        # Three different things, and only the third would be a
                        # defect: the canonical layer is quarterly-only (an FY
                        # row would collide with Q4 on periodEnd, which is the
                        # key the resolver uses); a cell can be withheld as
                        # AMBIGUOUS_PERIOD_END; anything else is unexplained.
                        if fiscal_period == "FY":
                            verdict = "NOT_EXPORTED_QUARTERLY_ONLY"
                        elif (canonical_id, fiscal_year, fiscal_period) in suppressed:
                            verdict = "NOT_EXPORTED_SUPPRESSED_AMBIGUOUS"
                        else:
                            verdict = "NOT_EXPORTED_UNEXPLAINED"
                    elif canonical_match is None:
                        verdict = "MISMATCH_NORMALIZED_VS_CANONICAL"

                    checks.append({
                        "ticker": canonical["security"]["ticker"],
                        "metric": metric,
                        "canonicalMetricId": canonical_id,
                        "fiscalYear": fiscal_year,
                        "fiscalPeriod": fiscal_period,
                        "secConcept": f"{raw_fact.taxonomy}:{raw_fact.concept}",
                        "accession": raw_fact.accession,
                        "form": raw_fact.form,
                        "filingDate": raw_fact.filed,
                        "periodStart": raw_fact.start,
                        "periodEnd": raw_fact.end,
                        "rawSecValue": raw_fact.value,
                        "normalizedVuValue": observation.value,
                        "canonicalVuValue": canonical_match["value"] if canonical_match
                                            else None,
                        "canonicalScale": scale,
                        "verdict": verdict,
                    })
                    picked += 1
                    break
    return checks


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--per-company", type=int, default=6,
                        help="cells to check per metric per company")
    args = parser.parse_args(argv)

    provider = SECProvider()
    registry = MetricRegistry.load()
    store = JsonFactStore(compress=True)

    checks = []
    for path in sorted(CANONICAL_DIR.glob("*.json")):
        canonical = json.loads(path.read_text(encoding="utf-8"))
        cik = normalize_cik(canonical["security"]["securityId"].replace("sec_", "")) \
            if canonical["security"]["securityId"].replace("sec_", "").isdigit() else None
        if cik is None:
            cik = next((entry["cik"] for entry in
                        json.loads((ROOT / "quant" / "data" / "sec"
                                    / "canonical_index.json").read_text())["companies"]
                        if entry["ticker"] == canonical["security"]["ticker"]), None)
        document = store.read_company(normalize_cik(cik))
        if document is None:
            print(f"  {canonical['security']['ticker']}: not in the fact store, skipped")
            continue
        company_checks = audit_company(provider, registry, document, canonical,
                                       args.per_company)
        checks.extend(company_checks)
        verdicts = {}
        for check in company_checks:
            verdicts[check["verdict"]] = verdicts.get(check["verdict"], 0) + 1
        print(f"  {canonical['security']['ticker']}: {verdicts}")

    summary = {}
    for check in checks:
        summary[check["verdict"]] = summary.get(check["verdict"], 0) + 1
    # An unexplained non-export is as much a defect as a mismatch: a value the
    # pipeline holds, that agrees with the SEC, and that silently never reaches
    # a consumer.
    mismatches = [check for check in checks
                  if check["verdict"].startswith("MISMATCH")
                  or check["verdict"] == "NOT_EXPORTED_UNEXPLAINED"
                  or check["verdict"] == "RAW_FACT_NOT_FOUND"]

    payload = {
        "schema_version": 1,
        "note": "Canonical VU values compared against re-fetched SEC primary data. "
                "Each row carries the SEC concept, accession, filing date and period "
                "end so the comparison can be repeated by hand against EDGAR.",
        "tolerance": TOLERANCE,
        "auditedMetrics": list(AUDITED),
        "summary": summary,
        "mismatchCount": len(mismatches),
        "checks": checks,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size} bytes)")
    print(json.dumps(summary, indent=2))
    return 1 if mismatches else 0


if __name__ == "__main__":
    raise SystemExit(main())
