"""Provider qualification gates.

These gates are provider-agnostic on purpose: they take a normalized factbook
and a capability declaration, so the same suite that qualifies SEC will qualify
any future fundamentals provider. Three of them (MOCK_FUTURE_DATA_LEAK,
MOCK_RESTATEMENT, MOCK_DELISTED) run against synthetic constructions and need
no network at all.

A gate returns exactly one of:
  PASS            the property was demonstrated
  FAIL            the property was tested and does not hold
  UNKNOWN         the property could not be tested with the data at hand
  NOT_APPLICABLE  the property does not apply to this provider

A gate is never marked PASS because it was not tested. UNKNOWN is a real,
reportable answer (Phase 4 § 23).
"""
from datetime import date, timedelta

from .fiscal import parse_date
from .model import (
    Provenance, SOURCE_SEC, SOURCE_DERIVED, QUALITY_HIGH, TRANSFORM_NONE,
)
from .restatements import (
    CompanyFactBook, Observation, POLICY_AS_OF_LATEST, POLICY_ORIGINAL, to_instant,
)

PASS = "PASS"
FAIL = "FAIL"
UNKNOWN = "UNKNOWN"
NOT_APPLICABLE = "NOT_APPLICABLE"


def _result(gate_id, status, reason, evidence=None):
    return {"gate": gate_id, "status": status, "reason": reason,
            "evidence": evidence or {}}


def _observation(value, filed, concept="Revenues", accession="0000000000-00-000000",
                 form="10-Q", period_start="2018-01-01", period_end="2018-03-31"):
    provenance = Provenance(
        source=SOURCE_SEC, taxonomy="us-gaap", concept=concept, accession=accession,
        form=form, filed=filed, available_from=filed, transformation=TRANSFORM_NONE,
        inputs=[f"us-gaap:{concept}|USD|{period_start}|{period_end}|{accession}"],
    )
    return Observation(value=value, unit="USD", provenance=provenance,
                       available_from=filed, filed=filed, quality=QUALITY_HIGH,
                       period_start=period_start, period_end=period_end)


# --------------------------------------------------------------- mock gates

def gate_mock_future_data_leak():
    """A fact must be invisible before the date it was published."""
    book = CompanyFactBook("0000000000")
    book.add_observation("revenue", 2018, "Q1", _observation(100.0, "2018-05-04"))

    before = book.resolve("revenue", 2018, "Q1", as_of=date(2018, 5, 3))
    on_day = book.resolve("revenue", 2018, "Q1", as_of=date(2018, 5, 4))
    after = book.resolve("revenue", 2018, "Q1", as_of=date(2018, 6, 1))
    period_end_day = book.resolve("revenue", 2018, "Q1", as_of=date(2018, 3, 31))

    problems = []
    if before is not None:
        problems.append("value visible one day before its filing date")
    if period_end_day is not None:
        problems.append("value visible on the period end date, before it was filed")
    if on_day is None or on_day.value != 100.0:
        problems.append("value not visible on its filing date")
    if after is None or after.value != 100.0:
        problems.append("value not visible after its filing date")

    if problems:
        return _result("MOCK_FUTURE_DATA_LEAK", FAIL, "; ".join(problems))
    return _result("MOCK_FUTURE_DATA_LEAK", PASS,
                   "a fact filed 2018-05-04 for the quarter ending 2018-03-31 is "
                   "invisible on 2018-03-31 and on 2018-05-03, and visible from 2018-05-04",
                   {"period_end": "2018-03-31", "filed": "2018-05-04"})


def gate_mock_restatement():
    """A later restatement must not travel back into an earlier as_of."""
    book = CompanyFactBook("0000000000")
    book.add_observation("revenue", 2018, "FY", _observation(
        1000.0, "2019-02-15", accession="0000000000-19-000001", form="10-K",
        period_start="2018-01-01", period_end="2018-12-31"))
    book.add_observation("revenue", 2018, "FY", _observation(
        1200.0, "2020-08-10", accession="0000000000-20-000009", form="10-K/A",
        period_start="2018-01-01", period_end="2018-12-31"))

    in_2019 = book.resolve("revenue", 2018, "FY", as_of=date(2019, 6, 30))
    after = book.resolve("revenue", 2018, "FY", as_of=date(2021, 1, 1))
    original_policy = book.resolve("revenue", 2018, "FY", as_of=date(2021, 1, 1),
                                   policy=POLICY_ORIGINAL)

    problems = []
    if in_2019 is None or in_2019.value != 1000.0:
        problems.append("a 2019 backtest does not see the originally reported value")
    if after is None or after.value != 1200.0:
        problems.append("the restated value is not visible after its publication")
    if original_policy is None or original_policy.value != 1000.0:
        problems.append("the ORIGINAL policy does not return the as-first-reported value")
    if after is not None and "RESTATED" not in after.flags:
        problems.append("the restated value is not flagged as restated")

    if problems:
        return _result("MOCK_RESTATEMENT", FAIL, "; ".join(problems))
    return _result("MOCK_RESTATEMENT", PASS,
                   "as_of 2019-06-30 returns the original 1000 filed 2019-02-15; "
                   "as_of 2021-01-01 returns the restated 1200 filed 2020-08-10 and "
                   "flags it RESTATED; the ORIGINAL policy still returns 1000",
                   {"original": 1000.0, "restated": 1200.0})


def gate_mock_delisted(provider=None, probe=None):
    """Can the provider serve a company that no longer trades under a ticker?

    SEC/EDGAR keeps filings by CIK forever, but company_tickers.json lists only
    current registrants with an assigned ticker. So a delisted issuer is
    reachable by CIK and not reachable by ticker. That is a real, documented
    partial capability, and it is reported as such rather than dressed up.
    """
    capabilities = getattr(provider, "CAPABILITIES", None) if provider else None
    if capabilities is None:
        return _result("MOCK_DELISTED", UNKNOWN,
                       "no provider capability declaration available to evaluate")

    by_cik = capabilities.get("delisted_by_cik")
    by_ticker = capabilities.get("delisted_by_ticker")
    evidence = {"delisted_by_cik": by_cik, "delisted_by_ticker": by_ticker}

    if probe is not None:
        evidence["probe"] = probe

    if by_cik and not by_ticker:
        return _result(
            "MOCK_DELISTED", FAIL,
            "historical filings for a delisted issuer are retrievable by CIK, but the "
            "provider cannot map a delisted ticker to a CIK, so a survivorship-free "
            "universe cannot be built from this provider alone; a separate security "
            "master is required (see docs/SEC_COVERAGE_REPORT.md)",
            evidence)
    if by_cik and by_ticker:
        return _result("MOCK_DELISTED", PASS,
                       "delisted issuers are addressable by both CIK and ticker", evidence)
    return _result("MOCK_DELISTED", FAIL,
                   "delisted issuers are not retrievable at all", evidence)


# ------------------------------------------------------- factbook-based gates

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


def gate_market_data(provider):
    capabilities = getattr(provider, "CAPABILITIES", {}) if provider else {}
    if capabilities.get("market_data_ohlcv"):
        return _result("MARKET_DATA_AVAILABLE", PASS, "provider serves OHLCV")
    return _result("MARKET_DATA_AVAILABLE", NOT_APPLICABLE,
                   "SEC/EDGAR publishes no price data; OHLCV stays the "
                   "MarketDataProvider's responsibility (Phase 4 § 28)")


def gate_survivorship_universe(provider):
    capabilities = getattr(provider, "CAPABILITIES", {}) if provider else {}
    if capabilities.get("security_master"):
        return _result("SURVIVORSHIP_FREE_UNIVERSE", PASS, "provider serves a security master")
    return _result("SURVIVORSHIP_FREE_UNIVERSE", FAIL,
                   "SEC/EDGAR has no security master and no delisting event feed; a "
                   "point-in-time index or exchange listing history is required to "
                   "build a survivorship-free universe")


def run_suite(factbook=None, registry=None, provider=None, resolved_facts=(),
              derived_facts=None):
    """Run every gate that the supplied inputs allow, and report the rest as UNKNOWN."""
    results = [
        gate_mock_future_data_leak(),
        gate_mock_restatement(),
        gate_mock_delisted(provider),
        gate_market_data(provider),
        gate_survivorship_universe(provider),
    ]
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
