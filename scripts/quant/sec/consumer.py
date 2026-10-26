"""Consumer fundamentals: the compact, committable per-company slice.

The canonical layer (canonical.py) is quarterly-only and carries the whole
history with provenance for a backtester - roughly half a megabyte per
company. The consumer experience (Discover, stock detail) needs something
else: for ~6,000 companies a few kilobytes each, with ANNUAL, QUARTERLY and
TTM kept strictly apart, point-in-time correct, and every value traceable to
the filing it came from.

This module reuses the existing pipeline end to end - RawFact iteration,
FiscalCalendar, normalize_company, PeriodResolver, derived.reconstruct - and
only changes what is WRITTEN. It is not a second pipeline. Nothing here
estimates, fills or interpolates: a metric a company never reported is
absent, not zero.

Point-in-time semantics in bulk mode: companyfacts.zip carries the filing
date of every fact but not the acceptance timestamp, so availability is
resolved at filing-DATE granularity (never earlier than the filing). The
bundle says so (``availability``).
"""
import json
import logging
from datetime import date, datetime, timezone

from .derived import reconstruct
from .fiscal import FiscalCalendar
from .normalize import normalize_company
from .periods import PeriodResolver
from .provider import PERIODIC_FORMS, SECProvider, normalize_cik
from .registry import KIND_INSTANT
from .restatements import POLICY_AS_OF_LATEST
from .version import version_stamp

LOGGER = logging.getLogger("vu.sec.consumer")

SCHEMA = "vu-consumer-fundamentals-1.0.0"
# Older fiscal years than the bundle's window, from the SAME normalization and in the
# same row layout. Kept apart from the bundle: every reader of the bundle (Discover,
# Quant, Supertrader ...) keeps exactly its window; only Fundamental reads the longer
# history, and only while building its release (it is not delivered as such).
HISTORY_SCHEMA = "vu-consumer-history-1.0.0"
# Stored as HISTORY_SHARDS gzip shards (consumer-history/NN.json.gz, NN = CIK mod
# HISTORY_SHARDS), not one file per CIK: 2,444 files of minified JSON were 19.3 MB, the
# same content in 64 shards is 1.7 MB. Each shard is written byte-reproducibly
# (sorted issuers, gzip without timestamp), so a run that changes nothing rewrites nothing.
HISTORY_SHARD_SCHEMA = "vu-consumer-history-shard-1.0.0"
HISTORY_SHARDS = 64

# Registry metrics the consumer layer publishes (what a company reports).
REPORTED_METRICS = (
    "revenue", "gross_profit", "operating_income", "net_income", "eps_diluted",
    "operating_cash_flow", "capital_expenditures", "cash_and_equivalents",
    "total_debt", "long_term_debt", "total_assets", "stockholders_equity",
    "shares_outstanding", "diluted_weighted_average_shares",
    "research_and_development", "dividends_paid", "stock_based_compensation",
    # Three metrics the normalization already produces and this layer used to
    # keep to itself. Without the depreciation, EBITDA cannot leave the SEC
    # layer at all; without the two tax figures, a return on invested capital
    # has no disclosed tax assumption, and a flat rate would be an invented
    # one. Publishing them costs three series per issuer and closes two
    # factor components that were otherwise stuck behind a one-line export.
    "depreciation_and_amortization", "pretax_income", "income_tax_expense",
)
# Derived by derived.reconstruct (deterministic, with the inputs' provenance).
DERIVED_METRICS = ("free_cash_flow", "net_debt", "ebitda")
CONSUMER_METRICS = REPORTED_METRICS + DERIVED_METRICS

# Metrics that get a quarterly and a TTM series (the rest is annual only:
# a balance-sheet instant has no TTM, and the product reads it annually).
QUARTERLY_METRICS = ("revenue", "gross_profit", "operating_income", "net_income", "eps_diluted",
                     "operating_cash_flow", "capital_expenditures", "free_cash_flow",
                     "cash_and_equivalents", "total_debt", "shares_outstanding",
                     "depreciation_and_amortization", "pretax_income", "income_tax_expense",
                     "ebitda")

DEFAULT_ANNUAL_YEARS = 13     # ten comparisons need eleven COMPLETE fiscal years;
                              # the factbook's last one or two are usually partial
                              # (quarters only), so the window carries a buffer
DEFAULT_QUARTERS = 8
# A trailing-twelve-month window older than this (against the as-of date) is history, not "trailing".
TTM_MAX_AGE_DAYS = 400


def _utcnow():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# Row layout of every series (a legend travels in the bundle):
#   [fiscalYear, fiscalPeriod, periodEnd, value, filedDate, accession, derivedFlag]
ROW_COLUMNS = ["fy", "fp", "end", "v", "filed", "accn", "derived"]


def _row(fact, derived=False):
    """One compact observation: value plus the filing it came from."""
    prov = getattr(fact, "provenance", None)
    filed = getattr(prov, "filed", None)
    accession = getattr(prov, "accession", None)
    return [fact.fiscal_year, fact.fiscal_period, fact.period_end, fact.value,
            str(filed)[:10] if filed else None, accession, 1 if derived else 0]


def _concept(fact):
    """The SEC concept a value came from ("dei:EntityCommonStockSharesOutstanding").

    The row layout does not carry it (that would double the export), but the
    market capitalization depends on WHICH share count it is: outstanding or
    issued including treasury. The latest value carries it, and every bundle
    lists the concepts each metric was built from, so a series that mixes
    concept classes is measurable instead of invisible."""
    prov = getattr(fact, "provenance", None)
    concept = getattr(prov, "concept", None)
    if not concept:
        return None
    taxonomy = getattr(prov, "taxonomy", None)
    return f"{taxonomy}:{concept}" if taxonomy else concept


def rowdict(row):
    return dict(zip(ROW_COLUMNS, row))


def _facts_for_period(resolver, registry, fiscal_year, fiscal_period, as_of, policy):
    """{metric: NormalizedFact} for one period: reported metrics + derived."""
    out = {}
    for metric in REPORTED_METRICS:
        if registry.get(metric) is None:
            continue
        if fiscal_period == "FY":
            fact = resolver.annual(metric, fiscal_year, as_of, policy=policy)
        else:
            fact = resolver.quarter(metric, fiscal_year, int(fiscal_period[1]), as_of, policy=policy)
        if fact.available:
            out[metric] = (fact, False)
    derived = reconstruct(resolver, fiscal_year, fiscal_period, as_of, policy=policy)
    for metric in DERIVED_METRICS + ("gross_profit", "total_debt"):
        fact = derived.get(metric)
        if fact is not None and fact.available and metric not in out:
            out[metric] = (fact, True)
    return out


def _ttm(resolver, registry, as_of, policy):
    """TTM (duration metrics) / latest instant (balance-sheet metrics)."""
    out = {}
    through = None
    for metric in QUARTERLY_METRICS:
        if metric in DERIVED_METRICS:
            continue
        fact = resolver.ttm(metric, as_of, policy=policy)
        if not fact.available:
            continue
        row = rowdict(_row(fact))
        row.pop("fy", None); row.pop("derived", None)
        tag = next((f for f in (fact.flags or []) if f.startswith("TTM_THROUGH")), None)
        if tag:
            row["through"] = tag.replace("TTM_THROUGH_", "")
            through = through or row["through"]
        definition = resolver._definition(metric)
        row["kind"] = "INSTANT" if definition is not None and definition.kind == KIND_INSTANT else "TTM"
        row["unit"] = fact.unit
        concept = _concept(fact)
        if concept:
            row["concept"] = concept
        out[metric] = row
    # One TTM window for the whole bundle: every trailing sum must end in the
    # same quarter. A metric whose last four standalone quarters lie years back
    # (JPMorgan's revenue concept stops in 2014 while net income continues) would
    # otherwise stand next to current figures as if it were current. Keep the
    # newest window, drop the rest; and drop a window older than 400 days
    # against the as-of date - "trailing" means trailing.
    windows = sorted({(row["end"], row["through"]) for row in out.values()
                      if row.get("kind") == "TTM" and row.get("through")}, reverse=True)
    if windows:
        newest_end, newest_through = windows[0]
        stale = (date.fromisoformat(str(as_of)[:10]) - date.fromisoformat(newest_end)).days > TTM_MAX_AGE_DAYS
        for metric in list(out.keys()):
            row = out[metric]
            if row.get("kind") != "TTM":
                continue
            if stale or row.get("through") != newest_through:
                del out[metric]
        through = None if stale else newest_through
    # Derived TTM only from complete TTM inputs - never a mix of periods.
    if "operating_cash_flow" in out and "capital_expenditures" in out \
            and out["operating_cash_flow"].get("through") == out["capital_expenditures"].get("through"):
        ocf, capex = out["operating_cash_flow"], out["capital_expenditures"]
        out["free_cash_flow"] = {"fp": "TTM", "end": ocf["end"], "v": ocf["v"] - capex["v"], "unit": ocf["unit"],
                                 "through": ocf.get("through"), "kind": "TTM", "derived": True,
                                 "inputs": ["operating_cash_flow", "capital_expenditures"]}
    if "operating_income" in out and "depreciation_and_amortization" in out \
            and out["operating_income"].get("through") == out["depreciation_and_amortization"].get("through"):
        op, da = out["operating_income"], out["depreciation_and_amortization"]
        out["ebitda"] = {"fp": "TTM", "end": op["end"], "v": op["v"] + da["v"], "unit": op["unit"],
                         "through": op.get("through"), "kind": "TTM", "derived": True,
                         "inputs": ["operating_income", "depreciation_and_amortization"]}
    if "total_debt" in out and "cash_and_equivalents" in out:
        debt, cash = out["total_debt"], out["cash_and_equivalents"]
        out["net_debt"] = {"fp": "LATEST", "end": debt["end"], "v": debt["v"] - cash["v"], "unit": debt["unit"],
                           "kind": "INSTANT", "derived": True, "inputs": ["total_debt", "cash_and_equivalents"]}
    return out, through


def _horizons(annual_revenue_rows):
    """Which comparison horizons the ANNUAL revenue series supports."""
    years = sorted({r[0] for r in annual_revenue_rows})
    if not years:
        return {"3y": False, "5y": False, "10y": False, "latest": None, "first": None, "count": 0}
    latest = years[-1]
    have = set(years)
    return {
        "3y": (latest - 3) in have, "5y": (latest - 5) in have, "10y": (latest - 10) in have,
        "latest": latest, "first": years[0], "count": len(years),
    }


def build_consumer_bundle(cik, company_facts, registry, as_of=None, tickers=(), security_ids=(),
                          name=None, fiscal_year_end_hint=None, annual_years=DEFAULT_ANNUAL_YEARS,
                          quarters=DEFAULT_QUARTERS, policy=POLICY_AS_OF_LATEST, provider=None,
                          industry=None, with_history=False):
    """The compact consumer bundle for one company from a companyfacts payload.

    with_history=True returns (bundle, history): history holds the fiscal years
    BEFORE the bundle's window, resolved exactly like the window (same factbook,
    resolver and policy), or None if there are none. The bundle is the same either way."""
    cik = normalize_cik(cik)
    provider = provider or SECProvider.__new__(SECProvider)   # iter_raw_facts needs no client
    as_of_text = str(as_of or date.today())
    raw_facts = list(SECProvider.iter_raw_facts(provider, company_facts, availability={},
                                                forms=PERIODIC_FORMS))
    if not raw_facts:
        return (None, None) if with_history else None
    calendar = FiscalCalendar.from_raw_facts(cik, raw_facts, fiscal_year_end_hint=fiscal_year_end_hint)
    result = normalize_company(cik, raw_facts, registry, profile=None, filing_metadata=None,
                               calendar=calendar, industry=industry)
    factbook = result.factbook
    resolver = PeriodResolver(factbook, registry)

    years = factbook.fiscal_years()
    annual_scope = years[-annual_years:] if years else []
    annual = {}
    units = {}
    concepts_used = {}
    for fiscal_year in annual_scope:
        for metric, (fact, derived) in _facts_for_period(resolver, registry, fiscal_year, "FY",
                                                         as_of_text, policy).items():
            annual.setdefault(metric, []).append(_row(fact, derived))
            if not derived and _concept(fact):
                concepts_used.setdefault(metric, set()).add(_concept(fact))
            units.setdefault(metric, fact.unit)

    quarterly = {}
    # Newest first, then stop after `quarters` standalone quarters per metric.
    quarter_slots = []
    for fiscal_year in reversed(years):
        for index in (4, 3, 2, 1):
            quarter_slots.append((fiscal_year, index))
        if len(quarter_slots) >= quarters * 2:
            break
    for fiscal_year, index in quarter_slots:
        period = _facts_for_period(resolver, registry, fiscal_year, f"Q{index}", as_of_text, policy)
        for metric, (fact, derived) in period.items():
            if metric not in QUARTERLY_METRICS:
                continue
            rows = quarterly.setdefault(metric, [])
            if len(rows) < quarters:
                rows.append(_row(fact, derived))
                if not derived and _concept(fact):
                    concepts_used.setdefault(metric, set()).add(_concept(fact))
                units.setdefault(metric, fact.unit)
    for metric in list(quarterly):
        quarterly[metric] = list(reversed(quarterly[metric]))     # oldest first, like annual

    history_annual, history_units = {}, {}
    if with_history:
        for fiscal_year in years[:-annual_years] if annual_years else []:
            for metric, (fact, derived) in _facts_for_period(resolver, registry, fiscal_year, "FY",
                                                             as_of_text, policy).items():
                history_annual.setdefault(metric, []).append(_row(fact, derived))
                history_units.setdefault(metric, fact.unit)

    ttm, ttm_through = _ttm(resolver, registry, as_of_text, policy)

    revenue_annual = annual.get("revenue", [])
    latest_annual = max((rowdict(r) for rows in annual.values() for r in rows), key=lambda r: (r["fy"], r["end"]), default=None)
    latest_quarter = max((rowdict(r) for rows in quarterly.values() for r in rows),
                         key=lambda r: (r["fy"], r["fp"], r["end"]), default=None)
    coverage = {
        "annualYears": annual_scope,
        "annualMetrics": {m: len(rows) for m, rows in annual.items()},
        "quarterlyMetrics": {m: len(rows) for m, rows in quarterly.items()},
        "ttmMetrics": sorted(ttm.keys()),
        "ttmThrough": ttm_through,
        "horizons": _horizons(revenue_annual),
        "latestAnnual": {"fy": latest_annual["fy"], "end": latest_annual["end"], "filed": latest_annual.get("filed")}
                        if latest_annual else None,
        "latestQuarter": {"fy": latest_quarter["fy"], "fp": latest_quarter["fp"], "end": latest_quarter["end"],
                          "filed": latest_quarter.get("filed")} if latest_quarter else None,
        "rawFacts": result.stats.get("raw_facts"), "mapped": result.stats.get("mapped"),
    }
    bundle = {
        "schema": SCHEMA,
        "generatedAtUtc": _utcnow(),
        "versions": version_stamp(registry.version),
        "dataSource": {"dataSourceId": "ds_sec_edgar_v1", "provider": "sec_edgar",
                       "dataset": "companyfacts_xbrl_bulk", "isMock": False,
                       "licenseStatus": "public_domain", "pitCapable": True},
        "cik": cik, "name": name, "tickers": list(tickers), "securityIds": list(security_ids),
        "asOf": as_of_text, "policy": policy,
        "availability": "filing-date granularity (bulk companyfacts carries filed, not acceptance time); "
                        "a value is never visible before its filing date",
        "calendar": {"fiscalYearEnd": calendar.to_dict().get("fiscal_year_end_hint") or fiscal_year_end_hint,
                     "weekBased": calendar.to_dict().get("week_based"),
                     "latestFiscalYearEnd": (calendar.to_dict().get("fiscal_years") or [{}])[-1].get("period_end")},
        "columns": ROW_COLUMNS,
        "units": units,
        "conceptsUsed": {metric: sorted(values) for metric, values in sorted(concepts_used.items())},
        "semantics": {"annual": "fiscal-year figures (FY) - 10-K, or four standalone quarters summed",
                      "quarterly": "standalone quarters (YTD de-accumulated), newest last",
                      "ttm": "sum of the four most recent standalone quarters; instants = latest balance sheet"},
        "coverage": coverage,
        "annual": annual,
        "quarterly": quarterly,
        "ttm": ttm,
    }
    if not with_history:
        return bundle
    history = None
    if history_annual:
        history_years = sorted({row[0] for rows in history_annual.values() for row in rows})
        # No run date or timestamp: old years rarely change, so the file stays byte-identical
        # between runs and the repository keeps one copy (the bundle carries asOf).
        history = {
            "schema": HISTORY_SCHEMA, "consumerSchema": SCHEMA,
            "versions": bundle["versions"], "dataSource": bundle["dataSource"],
            "cik": cik, "policy": policy, "columns": ROW_COLUMNS,
            "units": history_units,
            "semantics": {"annual": "fiscal years before the consumer bundle's window (its coverage.annualYears), "
                                    "same normalization, resolver, policy and row layout as the bundle"},
            "coverage": {"annualYears": history_years, "bundleFirstYear": annual_scope[0] if annual_scope else None,
                         "annualMetrics": {m: len(rows) for m, rows in history_annual.items()}},
            "annual": history_annual,
        }
    return bundle, history


def history_shard_key(cik):
    return f"{int(normalize_cik(cik)) % HISTORY_SHARDS:02d}"


def write_history_shards(directory, histories):
    """Write {cik: history} as gzip shards; remove every other file in `directory`.

    Returns the shard file names written. Identical input gives identical bytes.
    """
    import gzip
    from pathlib import Path
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    shards = {}
    for cik in sorted(histories, key=normalize_cik):
        shards.setdefault(history_shard_key(cik), {})[normalize_cik(cik)] = histories[cik]
    written = set()
    for key in sorted(shards):
        doc = {"schema": HISTORY_SHARD_SCHEMA, "shard": key, "issuers": shards[key]}
        raw = (json.dumps(doc, separators=(",", ":")) + "\n").encode("utf-8")
        name = f"{key}.json.gz"
        path = directory / name
        payload = gzip.compress(raw, compresslevel=9, mtime=0)
        if not path.exists() or path.read_bytes() != payload:
            path.write_bytes(payload)
        written.add(name)
    for path in sorted(directory.iterdir()):
        if path.is_file() and path.name not in written:
            path.unlink()
    return sorted(written)


def read_history_shards(directory):
    """{cik: history} from the shards written by write_history_shards."""
    import gzip
    from pathlib import Path
    out = {}
    for path in sorted(Path(directory).glob("*.json.gz")):
        doc = json.loads(gzip.decompress(path.read_bytes()))
        if doc.get("schema") == HISTORY_SHARD_SCHEMA:
            out.update(doc.get("issuers") or {})
    return out


# ---------------------------------------------------------------- universe run

def load_product_universe_ciks(names_file):
    """Product-universe titles with a CIK from the canonical name layer.

    Returns {cik: {"tickers": [...], "securityIds": [...], "name": str}}.
    The CIK came from the SEC ticker map keyed by ticker + exchange
    (build-company-names.mjs) - the only identity we accept here.
    """
    from pathlib import Path
    payload = json.loads(Path(names_file).read_text(encoding="utf-8"))
    by_cik = {}
    without = []
    for row in payload.get("rows", []):
        if not row.get("inProductUniverse"):
            continue
        cik = row.get("cik")
        if not cik:
            without.append(row["ticker"])
            continue
        cik = normalize_cik(cik)
        entry = by_cik.setdefault(cik, {"tickers": [], "securityIds": [], "name": None})
        entry["tickers"].append(row["ticker"])
        entry["securityIds"].append(row["securityId"])
        entry["name"] = entry["name"] or row.get("companyName")
    return by_cik, without


def load_successor_issuers(config_file):
    """{successor CIK: [predecessor CIKs]} from quant/config/sec-successor-issuers.json."""
    from pathlib import Path
    path = Path(config_file)
    if not path.is_file():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for successor, entry in (payload.get("successors") or {}).items():
        predecessors = [normalize_cik(c) for c in entry.get("predecessors") or []]
        if predecessors:
            out[normalize_cik(successor)] = predecessors
    return out


def merge_company_facts(successor, predecessors):
    """One companyfacts payload from a successor and its predecessors.

    A holding reorganisation moves the registrant to a new CIK; the filings
    before the effective date stay under the old one. Facts are appended per
    taxonomy, concept and unit; a fact the successor already carries (same
    accession, period, fiscal labels, form and value) is not repeated. Which
    value a period shows is decided later, as for any filer, by the filing
    date (as_of_latest) - nothing here prefers one CIK over the other.
    """
    import copy
    merged = copy.deepcopy(successor)
    facts = merged.setdefault("facts", {})
    for other in predecessors:
        for taxonomy, concepts in (other.get("facts") or {}).items():
            target_concepts = facts.setdefault(taxonomy, {})
            for name, concept in concepts.items():
                target = target_concepts.setdefault(name, {k: v for k, v in concept.items() if k != "units"})
                units = target.setdefault("units", {})
                for unit, rows in (concept.get("units") or {}).items():
                    have = units.setdefault(unit, [])
                    seen = {(r.get("accn"), r.get("start"), r.get("end"), r.get("fy"), r.get("fp"), r.get("form"), r.get("val"))
                            for r in have}
                    for row in rows:
                        key = (row.get("accn"), row.get("start"), row.get("end"), row.get("fy"), row.get("fp"), row.get("form"), row.get("val"))
                        if key not in seen:
                            have.append(row)
                            seen.add(key)
    return merged


def with_successors(stream, successors):
    """(cik, payload) stream with each successor's predecessors merged in.

    successors: {successor CIK: [predecessor CIKs]}. Successor and predecessor
    payloads are held back and yielded once the stream is exhausted; a
    predecessor alone never yields its own bundle.
    """
    predecessor_of = {p for preds in successors.values() for p in preds}
    held = {}
    for cik, payload in stream:
        if cik in successors or cik in predecessor_of:
            held[cik] = payload
            continue
        yield cik, payload
    for cik, preds in sorted(successors.items()):
        if cik not in held:
            continue
        parts = [held[p] for p in preds if p in held]
        yield cik, merge_company_facts(held[cik], parts) if parts else held[cik]
def load_fiscal_year_end_hints(issuers_dir):
    """Registered fiscal year end (MMDD) per CIK from the SEC pipeline's issuer shards.

    The SEC pipeline (quant/data/fundamentals/issuers, from SEC submissions)
    hands the same value to FiscalCalendar (pipeline.py). The consumer did not,
    so a filer without a 10-K yet - a company after its IPO, reporting only
    10-Qs - had no fiscal year and an empty bundle although its quarters are in
    companyfacts. The hint is the filer's own declaration and FiscalCalendar
    uses it only when no annual filing fixes the year ends.
    """
    from pathlib import Path
    hints = {}
    directory = Path(issuers_dir)
    if not directory.is_dir():
        return hints
    for path in sorted(directory.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for row in payload.get("issuers") or []:
            value = str(row.get("fiscalYearEnd") or "").strip()
            if row.get("cik") and len(value) == 4 and value.isdigit():
                hints[normalize_cik(row["cik"])] = value
    return hints


def load_issuer_industries(issuers_dir):
    """Registry industry (BANK, INSURER, REIT) per CIK from the same issuer shards.

    The SEC pipeline classifies every issuer by its SIC code (registry
    `industries`); the consumer reads the classification instead of deriving it
    a second time. Issuers outside an industry are absent.
    """
    from pathlib import Path
    industries = {}
    directory = Path(issuers_dir)
    if not directory.is_dir():
        return industries
    for path in sorted(directory.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for row in payload.get("issuers") or []:
            if row.get("cik") and row.get("industry"):
                industries[normalize_cik(row["cik"])] = row["industry"]
    return industries


def summarize_bundle(bundle):
    cov = bundle["coverage"]
    h = cov["horizons"]
    return {
        "cik": bundle["cik"], "tickers": bundle["tickers"], "securityIds": bundle["securityIds"],
        "name": bundle["name"],
        "annualYears": len(cov["annualYears"]),
        "firstAnnualYear": h.get("first"), "latestAnnualYear": h.get("latest"),
        "quarterly": max(cov["quarterlyMetrics"].values(), default=0),
        "ttm": bool(cov["ttmMetrics"]),
        "h3": h["3y"], "h5": h["5y"], "h10": h["10y"],
        "latestAnnual": cov["latestAnnual"], "latestQuarter": cov["latestQuarter"],
        "metrics": sorted(set(cov["annualMetrics"]) | set(cov["quarterlyMetrics"]) | set(cov["ttmMetrics"])),
    }


def aggregate_coverage(index_rows, product_count, cik_mapped, without_cik, unmatched_in_zip):
    """The measured grid the mission asks for (section 15)."""
    def count(pred):
        return sum(1 for r in index_rows if pred(r))
    per_metric = {}
    for m in CONSUMER_METRICS:
        per_metric[m] = {
            "annual": count(lambda r, m=m: m in r["metricsAnnual"]),
            "quarterly": count(lambda r, m=m: m in r["metricsQuarterly"]),
            "ttm": count(lambda r, m=m: m in r["metricsTtm"]),
        }
    return {
        "productUniverse": product_count,
        "cikMapped": cik_mapped,
        "withoutCik": len(without_cik),
        "secAvailable": len(index_rows),
        "notInCompanyFacts": len(unmatched_in_zip),
        "annualHistory": count(lambda r: r["annualYears"] >= 1),
        "quarterlyHistory": count(lambda r: r["quarterly"] >= 1),
        "ttmPossible": count(lambda r: r["ttm"]),
        "latestFundamentals": count(lambda r: r["latestAnnual"] is not None or r["latestQuarter"] is not None),
        "history3y": count(lambda r: r["h3"]),
        "history5y": count(lambda r: r["h5"]),
        "history10y": count(lambda r: r["h10"]),
        "perMetric": per_metric,
    }
