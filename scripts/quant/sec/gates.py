"""Ingestion integrity checks for the SEC layer.

**Not** a second qualification stand. The Vision Universe provider gates —
Gate A (restatement), Gate B (delisted / historical universe), Gate C (future
data leak) with the `MOCK_RESTATEMENT` / `MOCK_DELISTED` / `MOCK_FUTURE_DATA_LEAK`
fixtures — live in `quant/engines/gate-tests.js` and are the single place that
qualifies a provider. The SEC adapter is run through them like any other
provider via `getFactsAsOf` / `getUniverseAsOf`
(`quant/tests/sec-adapter.test.mjs`).

What is left here are checks that only make sense *inside* the SEC ingestion,
against the normalized factbook before it ever becomes canonical: they catch a
broken normalization run, not a weak provider. They deliberately keep the
stricter of the two semantics where both layers care about the same property —
`PIT_NO_FUTURE_DATA_LEAK` requires `available_from >= period_end` on every
stored observation, which is stricter than Gate C's per-query check.

A check returns exactly one of:
  PASS            the property was demonstrated
  FAIL            the property was tested and does not hold
  UNKNOWN         the property could not be tested with the data at hand
  NOT_APPLICABLE  the property does not apply here

A check is never marked PASS because it was not tested.
"""
from .fiscal import parse_date
from .model import SOURCE_DERIVED
from .restatements import to_instant

PASS = "PASS"
FAIL = "FAIL"
UNKNOWN = "UNKNOWN"
NOT_APPLICABLE = "NOT_APPLICABLE"


def _result(gate_id, status, reason, evidence=None):
    return {"gate": gate_id, "status": status, "reason": reason,
            "evidence": evidence or {}}




def gate_no_future_data_leak(factbook):
    """No stored observation may claim availability before its period ended."""
    offenders = []
    checked = 0
    for (metric, fiscal_year, fiscal_period), timeline in factbook.timelines.items():
        for observation in timeline.observations:
            if not observation.period_end or observation.available_instant is None:
                continue
            checked += 1
            end = to_instant(parse_date(observation.period_end))
            if observation.available_instant < end:
                offenders.append({
                    "metric": metric, "fiscal_year": fiscal_year,
                    "fiscal_period": fiscal_period,
                    "period_end": observation.period_end,
                    "available_from": observation.available_from,
                    "accession": observation.accession,
                })
    if not checked:
        return _result("PIT_NO_FUTURE_DATA_LEAK", UNKNOWN, "no observations to check")
    if offenders:
        return _result("PIT_NO_FUTURE_DATA_LEAK", FAIL,
                       f"{len(offenders)} observation(s) are available before their period ended",
                       {"observations_checked": checked, "offenders": offenders[:10]})
    return _result("PIT_NO_FUTURE_DATA_LEAK", PASS,
                   f"all {checked} observations become available on or after their period end",
                   {"observations_checked": checked})


def gate_provenance_complete(factbook):
    """Every stored number must be traceable back to a specific SEC filing."""
    required = ("concept", "accession", "form", "filed", "available_from")
    incomplete = []
    checked = 0
    for (metric, fiscal_year, fiscal_period), timeline in factbook.timelines.items():
        for observation in timeline.observations:
            checked += 1
            missing_fields = [field for field in required
                              if not getattr(observation.provenance, field, None)]
            if missing_fields:
                incomplete.append({"metric": metric, "fiscal_year": fiscal_year,
                                   "fiscal_period": fiscal_period,
                                   "missing": missing_fields})
    if not checked:
        return _result("PROVENANCE_COMPLETE", UNKNOWN, "no observations to check")
    if incomplete:
        return _result("PROVENANCE_COMPLETE", FAIL,
                       f"{len(incomplete)} observation(s) lack full provenance",
                       {"observations_checked": checked, "examples": incomplete[:10]})
    return _result("PROVENANCE_COMPLETE", PASS,
                   f"all {checked} observations carry concept, accession, form, "
                   "filing date and availability",
                   {"observations_checked": checked})


def gate_unit_integrity(factbook, registry):
    offenders = []
    checked = 0
    for (metric, _, _), timeline in factbook.timelines.items():
        definition = registry.get(metric)
        if definition is None:
            continue
        for observation in timeline.observations:
            checked += 1
            if not definition.allows_unit(observation.unit):
                offenders.append({"metric": metric, "unit": observation.unit})
    if not checked:
        return _result("UNIT_INTEGRITY", UNKNOWN, "no observations to check")
    if offenders:
        return _result("UNIT_INTEGRITY", FAIL,
                       f"{len(offenders)} observation(s) use a disallowed unit",
                       {"examples": offenders[:10]})
    return _result("UNIT_INTEGRITY", PASS,
                   f"all {checked} observations use a registry-allowed unit")


def gate_period_integrity(factbook):
    """A cell labelled Q1..Q4 must never hold a cumulative period."""
    offenders = []
    checked = 0
    for (metric, fiscal_year, fiscal_period), timeline in factbook.timelines.items():
        if fiscal_period not in ("Q1", "Q2", "Q3", "Q4"):
            continue
        for observation in timeline.observations:
            if not (observation.period_start and observation.period_end):
                continue
            checked += 1
            span = (parse_date(observation.period_end)
                    - parse_date(observation.period_start)).days
            if span > 130:
                offenders.append({"metric": metric, "fiscal_year": fiscal_year,
                                  "fiscal_period": fiscal_period, "span_days": span,
                                  "accession": observation.accession})
    if not checked:
        return _result("PERIOD_INTEGRITY", UNKNOWN, "no quarterly duration observations")
    if offenders:
        return _result("PERIOD_INTEGRITY", FAIL,
                       f"{len(offenders)} quarterly cell(s) hold a cumulative period",
                       {"examples": offenders[:10]})
    return _result("PERIOD_INTEGRITY", PASS,
                   f"all {checked} quarterly observations span a single quarter")


def gate_no_invented_values(facts):
    """A missing metric must be null with a reason, never a zero."""
    offenders = []
    for fact in facts:
        if fact.available:
            continue
        if fact.value is not None:
            offenders.append({"metric": fact.metric, "value": fact.value})
        if not fact.reason:
            offenders.append({"metric": fact.metric, "value": "missing reason"})
    if not facts:
        return _result("NO_INVENTED_VALUES", UNKNOWN, "no facts supplied")
    if offenders:
        return _result("NO_INVENTED_VALUES", FAIL,
                       "unavailable metrics carry a value or lack a reason",
                       {"examples": offenders[:10]})
    return _result("NO_INVENTED_VALUES", PASS,
                   f"all {len(facts)} evaluated metrics are either available or "
                   "explicitly null with a reason code")


def gate_derived_separation(derived_facts):
    """VU-computed numbers must never be labelled as SEC data."""
    offenders = []
    for name, fact in derived_facts.items():
        if fact.provenance.source != SOURCE_DERIVED:
            offenders.append({"metric": name, "source": fact.provenance.source})
        elif fact.available and not fact.provenance.formula_version:
            offenders.append({"metric": name, "source": "missing formula_version"})
    if not derived_facts:
        return _result("DERIVED_SEPARATION", UNKNOWN, "no derived metrics supplied")
    if offenders:
        return _result("DERIVED_SEPARATION", FAIL,
                       "derived metrics are not clearly separated from SEC facts",
                       {"examples": offenders[:10]})
    return _result("DERIVED_SEPARATION", PASS,
                   f"all {len(derived_facts)} derived metrics carry source "
                   f"{SOURCE_DERIVED} and a formula version")



def _declared(provider):
    """Capability declaration of a provider, or an empty declaration."""
    return getattr(provider, "DECLARED_CAPABILITIES", {}) if provider else {}


def gate_market_data(provider):
    capabilities = _declared(provider)
    if capabilities.get("marketDataOhlcv"):
        return _result("MARKET_DATA_AVAILABLE", PASS, "provider serves OHLCV")
    return _result("MARKET_DATA_AVAILABLE", NOT_APPLICABLE,
                   "SEC/EDGAR publishes no price data; OHLCV stays the "
                   "MarketDataProvider's responsibility. Value and Momentum "
                   "factors are computed by quant/engines/factors.js from market "
                   "data, never from this provider.")


def gate_survivorship_universe(provider):
    capabilities = _declared(provider)
    if capabilities.get("survivorshipBiasControls"):
        return _result("SURVIVORSHIP_FREE_UNIVERSE", PASS,
                   "provider declares survivorship-bias controls")
    if capabilities.get("survivorshipBiasControls") is None:
        return _result("SURVIVORSHIP_FREE_UNIVERSE", UNKNOWN,
                       "the provider profile does not state whether survivorship-bias "
                       "controls exist; unverified is not the same as absent")
    return _result("SURVIVORSHIP_FREE_UNIVERSE", FAIL,
                   "SEC/EDGAR has no security master and no delisting event feed; a "
                   "point-in-time index or exchange listing history is required to "
                   "build a survivorship-free universe (docs/SEC_COVERAGE_REPORT.md)")


def run_suite(factbook=None, registry=None, provider=None, resolved_facts=(),
              derived_facts=None, provider_gate_results=()):
    """Run the ingestion checks, and carry through the provider gate results.

    `provider_gate_results` are the Gate A/B/C outcomes produced by
    `quant/engines/gate-tests.js` against the SEC adapter. They are reported
    here unchanged so that one report shows both layers; this module never
    recomputes them and never upgrades a FAIL.
    """
    results = list(provider_gate_results)
    results.append(gate_market_data(provider))
    results.append(gate_survivorship_universe(provider))
    if factbook is not None:
        results.append(gate_no_future_data_leak(factbook))
        results.append(gate_provenance_complete(factbook))
        results.append(gate_period_integrity(factbook))
        if registry is not None:
            results.append(gate_unit_integrity(factbook, registry))
    else:
        for gate_id in ("PIT_NO_FUTURE_DATA_LEAK", "PROVENANCE_COMPLETE",
                        "PERIOD_INTEGRITY", "UNIT_INTEGRITY"):
            results.append(_result(gate_id, UNKNOWN, "no factbook supplied"))
    results.append(gate_no_invented_values(list(resolved_facts)))
    results.append(gate_derived_separation(derived_facts or {}))
    return results


def summarize(results):
    counts = {PASS: 0, FAIL: 0, UNKNOWN: 0, NOT_APPLICABLE: 0}
    for result in results:
        counts[result["status"]] = counts.get(result["status"], 0) + 1
    return {"total": len(results), "by_status": counts,
            "blocking_failures": [r["gate"] for r in results if r["status"] == FAIL]}
