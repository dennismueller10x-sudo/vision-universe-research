#!/usr/bin/env python3
"""Vision Universe SEC Financial Data Core - command line entry point.

    python3 scripts/quant/cli.py ingest    --universe quant/config/sec-universe.json
    python3 scripts/quant/cli.py update    --since 2026-01-01
    python3 scripts/quant/cli.py retry
    python3 scripts/quant/cli.py export    --as-of 2026-09-07
    python3 scripts/quant/cli.py coverage
    python3 scripts/quant/cli.py gates
    python3 scripts/quant/cli.py resolve
    python3 scripts/quant/cli.py canonical
    python3 scripts/quant/cli.py inspect   --ticker NVDA --metric revenue
    python3 scripts/quant/cli.py test

Commands that reach data.sec.gov: ingest, update, retry. Everything else works
offline against what has already been ingested.
"""
import argparse
import json
import logging
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from quant.sec import coverage as coverage_module
from quant.sec import gates as gates_module
from quant.sec.canonical import DATA_SOURCE, build_company_bundle
from quant.sec import consumer as consumer_module
from quant.sec.periods import PeriodResolver
from quant.sec.pipeline import IngestionPipeline, export_inspector_view, _rehydrate
from quant.sec.provider import SECProvider, normalize_cik
from quant.sec.registry import MetricRegistry
from quant.sec.restatements import POLICY_AS_OF_LATEST, POLICY_LATEST_KNOWN, POLICIES
from quant.sec.store import JsonFactStore
from quant.sec.version import version_stamp

LOGGER = logging.getLogger("vu.sec.cli")
ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "quant" / "data" / "sec"
INSPECTOR_DIR = DATA_DIR / "inspector"
CANONICAL_DIR = DATA_DIR / "canonical"
DEFAULT_UNIVERSE = ROOT / "quant" / "config" / "sec-universe.json"


def _utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    try:
        shown = path.relative_to(ROOT)
    except ValueError:
        shown = path            # a redirected output directory is not an error
    print(f"wrote {shown} ({path.stat().st_size} bytes)")
    return path


def _prune(directory, keep):
    """Delete artifacts this run did not write.

    A company can change its file name (a ticker appears, or a reorganisation
    moves one), and a leftover file from the previous name would keep being
    served as if it were current.
    """
    if not directory.is_dir():
        return
    for path in sorted(directory.glob("*.json")):
        if path.name not in keep:
            path.unlink()
            try:
                shown = path.relative_to(ROOT)
            except ValueError:
                shown = path
            print(f"removed stale {shown}")


def _load_universe(path):
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return payload["companies"]


def _resolve_universe(provider, companies, verify=True):
    """Ticker -> CIK against the SEC's own map. The config file is only a hint."""
    resolved = []
    for entry in companies:
        ticker = entry.get("ticker")
        hint = entry.get("cik")
        cik = None
        if ticker:
            cik = provider.try_resolve_ticker(ticker)
        if cik is None and hint:
            cik = normalize_cik(hint)
            print(f"  {ticker}: not in the SEC ticker map, using configured CIK {cik}")
        if cik is None:
            raise SystemExit(f"cannot resolve a CIK for {entry!r}")
        if verify and hint and normalize_cik(hint) != cik:
            # A divergence may be legitimate — a reorganisation can move the
            # ticker to a successor entity while the filing history stays with
            # the old CIK (measured for XOM on 2026-09-07). But it may only
            # stand when it is declared AND justified, so that an accidental
            # wrong CIK still stops the run.
            if entry.get("cik_authority") == "config":
                reason = (entry.get("cik_authority_reason") or "").strip()
                if len(reason) < 40:
                    raise SystemExit(
                        f"{ticker}: cik_authority is 'config' but "
                        f"cik_authority_reason is missing or too short. An override "
                        f"of the SEC's own ticker map has to say what was measured."
                    )
                print(f"  {ticker}: using configured CIK {normalize_cik(hint)} instead "
                      f"of the SEC ticker map's {cik} — declared override")
                print(f"    reason: {reason}")
                resolved.append({**entry, "cik": normalize_cik(hint),
                                 "sec_ticker_map_cik": cik})
                continue
            raise SystemExit(
                f"CIK mismatch for {ticker}: config says {normalize_cik(hint)}, "
                f"SEC says {cik}. Run `cli.py resolve` to see what each CIK "
                f"actually contains. If the divergence is real and intended, set "
                f"cik_authority: \"config\" with a cik_authority_reason that states "
                f"what was measured; otherwise fix quant/config/sec-universe.json."
            )
        resolved.append({**entry, "cik": cik})
    return resolved


def _documents(store, ciks=None):
    documents = []
    for cik in (ciks or store.list_companies()):
        document = store.read_company(cik)
        if document is not None:
            documents.append(document)
    return documents


def _declared_tickers(path=DEFAULT_UNIVERSE):
    """CIK -> the ticker the universe file declares, for entities the SEC no
    longer lists one for (a reorganisation moves the ticker to the successor
    while the filing history stays with the old CIK)."""
    try:
        companies = _load_universe(path)
    except (OSError, ValueError, KeyError):
        return {}
    declared = {}
    for entry in companies:
        cik, ticker = entry.get("cik"), entry.get("ticker")
        if cik and ticker:
            declared[normalize_cik(cik)] = ticker
    return declared


def _ticker_of(document, declared=None):
    """The SEC's own ticker, else the declared one, else no ticker at all.

    A CIK is not a ticker. Using one as a label -- which is what happened to
    XOM's pre-reorganisation entity, whose SEC record lists no ticker at all --
    puts an invented identifier into the canonical Security record.
    """
    tickers = (document.get("profile") or {}).get("tickers") or []
    if tickers:
        return tickers[0]
    return (declared or {}).get(normalize_cik(document["cik"]))


def _canonical_ticker(document, declared):
    """Like _ticker_of, but a canonical Security may not be published without one."""
    ticker = _ticker_of(document, declared)
    if ticker:
        return ticker
    raise SystemExit(
        f"{document['cik']}: neither the SEC submissions record nor "
        f"{DEFAULT_UNIVERSE.name} names a ticker for this entity. A canonical "
        f"Security needs a real identifier; the CIK is not one. Add the entity "
        f"to the universe file with its ticker, or drop it from the store."
    )


# ---------------------------------------------------------------- commands

def cmd_ingest(args):
    provider = SECProvider()
    registry = MetricRegistry.load()
    pipeline = IngestionPipeline(provider=provider, registry=registry,
                                 run_id=args.run_id)
    companies = _resolve_universe(provider, _load_universe(args.universe))
    outcome = pipeline.ingest_universe(companies, resume=not args.no_resume,
                                       force=args.force, limit=args.limit)
    for result in outcome["results"]:
        print(f"  {result['cik']}: {result['status']}"
              + (f" ({result['error']})" if result.get("error") else ""))
    print(json.dumps(outcome["manifest"]["run"], indent=2))
    return 1 if outcome["state"]["failed"] else 0


def cmd_update(args):
    pipeline = IngestionPipeline(run_id=args.run_id)
    outcome = pipeline.refresh_since(args.since)
    for result in outcome["results"]:
        print(f"  {result['cik']}: {result['status']}")
    return 1 if outcome["state"]["failed"] else 0


def cmd_retry(args):
    pipeline = IngestionPipeline(run_id=args.run_id)
    outcome = pipeline.retry_failed()
    for result in outcome["results"]:
        print(f"  {result['cik']}: {result['status']}")
    return 1 if outcome["state"]["failed"] else 0


def cmd_export(args):
    registry = MetricRegistry.load()
    store = JsonFactStore(compress=True)
    documents = _documents(store)
    if not documents:
        print("no ingested companies found; run `ingest` first")
        return 2
    declared = _declared_tickers()
    index, written = [], set()
    for document in documents:
        view = export_inspector_view(
            document, registry, as_of=args.as_of,
            annual_years=args.annual_years, quarterly_years=args.quarterly_years,
            policy=args.policy)
        # The inspector is a diagnostic view, not a canonical artifact: an
        # entity without a ticker is still worth looking at, filed under its CIK.
        ticker = _ticker_of(document, declared) or document["cik"]
        path = _write(INSPECTOR_DIR / f"{ticker}.json", view)
        written.add(path.name)
        index.append({
            "ticker": ticker, "cik": document["cik"],
            "name": (document.get("profile") or {}).get("name"),
            "sic": (document.get("profile") or {}).get("sic"),
            "sic_description": (document.get("profile") or {}).get("sic_description"),
            "file": f"inspector/{path.name}",
            "rows": len(view["rows"]),
            "quality": view["quality_summary"],
        })
    _prune(INSPECTOR_DIR, written)
    _write(DATA_DIR / "inspector_index.json", {
        "schema_version": 1, "generated_at_utc": _utcnow(),
        "versions": version_stamp(registry.version), "companies": index,
    })
    return 0


def cmd_coverage(args):
    registry = MetricRegistry.load()
    store = JsonFactStore(compress=True)
    documents = _documents(store)
    if not documents:
        print("no ingested companies found; run `ingest` first")
        return 2
    matrix = coverage_module.build_matrix(documents, registry,
                                          labels=_declared_tickers())
    matrix["generated_at_utc"] = _utcnow()
    matrix["versions"] = version_stamp(registry.version)
    _write(DATA_DIR / "coverage_matrix.json", matrix)
    print(json.dumps(matrix["grid"], indent=2))
    return 0


def cmd_gates(args):
    registry = MetricRegistry.load()
    store = JsonFactStore(compress=True)
    provider = SECProvider()
    documents = _documents(store)
    declared = _declared_tickers()

    per_company = []
    aggregate_inputs = {"factbook": None, "resolved": [], "derived": {}}
    for document in documents:
        factbook = _rehydrate(document)
        resolver = PeriodResolver(factbook, registry)
        as_of = args.as_of or date.today().isoformat()
        resolved = [resolver.annual(metric, year, as_of)
                    for metric in registry.names()
                    for year in factbook.fiscal_years()[-3:]]
        from quant.sec.derived import reconstruct
        latest_year = factbook.fiscal_years()[-1] if factbook.fiscal_years() else None
        derived = reconstruct(resolver, latest_year, "FY", as_of) if latest_year else {}
        results = gates_module.run_suite(factbook=factbook, registry=registry,
                                         provider=provider, resolved_facts=resolved,
                                         derived_facts=derived)
        per_company.append({"cik": document["cik"],
                            "ticker": _ticker_of(document, declared),
                            "results": results,
                            "summary": gates_module.summarize(results)})

    provider_only = gates_module.run_suite(provider=provider)
    report = {
        "generated_at_utc": _utcnow(),
        "versions": version_stamp(registry.version),
        "provider": provider.ADAPTER_VERSION,
        "declared_capabilities": provider.DECLARED_CAPABILITIES,
        "capability_source": "quant/config/provider-profiles.json (providers.sec-edgar)",
        "provider_level": {"results": provider_only,
                           "summary": gates_module.summarize(provider_only)},
        "note": ("Gate A/B/C stammen aus quant/engines/gate-tests.js und werden von "
                 "scripts/quant/run-sec-gates.mjs gegen den SEC-Adapter gefahren; "
                 "sie erscheinen unter provider_gates. Hier stehen ausschliesslich "
                 "die Pruefungen der SEC-Ingestion."),
        "per_company": per_company,
    }
    _write(DATA_DIR / "pit_gates.json", report)
    for result in provider_only:
        print(f"  {result['status']:<15} {result['gate']}")
    return 0


def _submissions_summary(provider, cik):
    """What a CIK actually contains, straight from the submissions endpoint."""
    from quant.sec.provider import PERIODIC_FORMS
    try:
        submissions = provider.get_submissions(cik)
    except Exception as exc:  # noqa: BLE001 - a diagnostic must not abort
        return {"cik": cik, "error": str(exc)}
    profile = provider.get_company_profile(cik, submissions)
    filings = provider.get_filing_metadata(cik, submissions)
    periodic = [row for row in filings if row["form"] in PERIODIC_FORMS]
    reports = sorted(row["report_date"] for row in periodic if row.get("report_date"))
    forms = {}
    for row in periodic:
        forms[row["form"]] = forms.get(row["form"], 0) + 1
    return {
        "cik": cik,
        "name": profile.name,
        "entity_type": profile.entity_type,
        "sic": profile.sic,
        "sic_description": profile.sic_description,
        "tickers": profile.tickers,
        "exchanges": profile.exchanges,
        "former_names": [n.get("name") for n in profile.former_names],
        "fiscal_year_end": profile.fiscal_year_end,
        "periodic_filings": len(periodic),
        "forms": dict(sorted(forms.items())),
        "earliest_report": reports[0] if reports else None,
        "latest_report": reports[-1] if reports else None,
    }


def cmd_resolve(args):
    """Diagnostic: what does each configured ticker actually resolve to?

    Exists because of a real finding on the first live run: the SEC ticker map
    resolved XOM to a different CIK than the configured hint. Guessing which one
    is right would be exactly the invented answer this pipeline refuses to give,
    so this command fetches both and prints what each one contains.
    """
    provider = SECProvider()
    companies = _load_universe(args.universe)
    report = []

    for entry in companies:
        ticker = entry.get("ticker")
        hint = normalize_cik(entry["cik"]) if entry.get("cik") else None
        resolved = provider.try_resolve_ticker(ticker) if ticker else None
        row = {"ticker": ticker, "configured_cik": hint, "sec_cik": resolved,
               "match": hint == resolved}
        print(f"\n{ticker}: config={hint} sec={resolved} "
              f"{'MATCH' if row['match'] else 'MISMATCH'}")

        candidates = [c for c in {hint, resolved} if c]
        row["candidates"] = []
        for cik in sorted(candidates):
            summary = _submissions_summary(provider, cik)
            row["candidates"].append(summary)
            if "error" in summary:
                print(f"  CIK {cik}: NOT RETRIEVABLE ({summary['error']})")
                continue
            print(f"  CIK {cik}: {summary['name']}")
            print(f"    entityType={summary['entity_type']} sic={summary['sic']} "
                  f"({summary['sic_description']})")
            print(f"    tickers={summary['tickers']} exchanges={summary['exchanges']}")
            print(f"    formerNames={summary['former_names']}")
            print(f"    fiscalYearEnd={summary['fiscal_year_end']}")
            print(f"    periodic filings={summary['periodic_filings']} {summary['forms']}")
            print(f"    report dates {summary['earliest_report']} .. {summary['latest_report']}")
        report.append(row)

    _write(DATA_DIR / "universe_resolution.json", {
        "schema_version": 1,
        "generated_at_utc": _utcnow(),
        "versions": version_stamp(MetricRegistry.load().version),
        "note": ("Diagnostic. Shows what each configured ticker resolves to in the "
                 "SEC ticker map and what each candidate CIK actually contains. "
                 "The SEC is the authority; the config CIK is only a hint."),
        "companies": report,
    })
    mismatches = [row["ticker"] for row in report if not row["match"]]
    if mismatches:
        print(f"\nMismatches: {mismatches}")
    return 1 if (mismatches and args.strict) else 0


def cmd_canonical(args):
    """Emit the canonical Vision Universe payload the JS adapter serves.

    This is the boundary: SEC-specific shapes stop here, and what lands on disk
    validates against quant/engines/schema.js.
    """
    registry = MetricRegistry.load()
    store = JsonFactStore(compress=True)
    documents = _documents(store)
    if not documents:
        print("no ingested companies found; run `ingest` first")
        return 2
    declared = _declared_tickers()
    index, written = [], set()
    for document in documents:
        ticker = _canonical_ticker(document, declared)
        bundle = build_company_bundle(document, registry, ticker,
                                      annual_years=args.annual_years,
                                      quarterly_years=args.quarterly_years)
        path = _write(CANONICAL_DIR / f"{ticker}.json", bundle)
        written.add(path.name)
        index.append({
            "ticker": ticker,
            "securityId": bundle["security"]["securityId"],
            "cik": document["cik"],
            "name": bundle["security"]["name"],
            "file": f"canonical/{path.name}",
            "factCount": bundle["coverage"]["factCount"],
            "metricIds": bundle["coverage"]["metricIds"],
            "suppressedCells": bundle["coverage"]["suppressedCells"],
            "annualYearsExamined": bundle["coverage"]["annualYearsExamined"],
            "quarterlyYears": bundle["coverage"]["quarterlyYears"],
        })
    _prune(CANONICAL_DIR, written)
    _write(DATA_DIR / "canonical_index.json", {
        "schema_version": 1,
        "generated_at_utc": _utcnow(),
        "versions": version_stamp(registry.version),
        "dataSource": DATA_SOURCE,
        "companies": index,
    })
    return 0


def cmd_inspect(args):
    registry = MetricRegistry.load()
    store = JsonFactStore(compress=True)
    provider_cik = args.cik
    if provider_cik is None and args.ticker:
        for document in _documents(store):
            if args.ticker.upper() in [t.upper() for t in
                                       (document.get("profile") or {}).get("tickers", [])]:
                provider_cik = document["cik"]
                break
    if provider_cik is None:
        print("company not found in the local store; pass --cik or run `ingest`")
        return 2
    document = store.read_company(normalize_cik(provider_cik))
    factbook = _rehydrate(document)
    resolver = PeriodResolver(factbook, registry)
    policy = args.policy
    as_of = args.as_of
    if policy != POLICY_LATEST_KNOWN and as_of is None:
        as_of = date.today().isoformat()

    print(f"{document['profile']['name']}  CIK {document['cik']}  "
          f"SIC {document['profile'].get('sic')}  metric={args.metric}  "
          f"as_of={as_of}  policy={policy}")
    header = f"{'Period':<10}{'Value':>22}  {'Available':<12}{'Form':<9}{'Concept':<58}{'Source':<24}{'Transform'}"
    print(header)
    print("-" * len(header))
    for fiscal_year in factbook.fiscal_years():
        for label, fact in [("FY", resolver.annual(args.metric, fiscal_year, as_of, policy=policy))] + [
                (f"Q{index}", resolver.quarter(args.metric, fiscal_year, index, as_of, policy=policy))
                for index in range(1, 5)]:
            if fact is None:
                continue
            period = f"FY{fiscal_year}{'' if label == 'FY' else ' ' + label}"
            if not fact.available:
                if args.hide_missing:
                    continue
                print(f"{period:<10}{'—':>22}  {'':<12}{'':<9}{'':<58}{fact.reason}")
                continue
            concept = (f"{fact.provenance.taxonomy}:{fact.provenance.concept}"
                       if fact.provenance.concept else "")
            print(f"{period:<10}{fact.value:>22,.2f}  "
                  f"{str(fact.provenance.available_from)[:10]:<12}"
                  f"{str(fact.provenance.form or ''):<9}{concept[:56]:<58}"
                  f"{fact.provenance.source:<24}{fact.provenance.transformation}")
    return 0


def cmd_consumer(args):
    """Consumer fundamentals for the product universe from the SEC bulk archive.

    Identity comes from the canonical name layer (ticker + exchange -> CIK);
    the raw facts come from companyfacts.zip in one request. Output: one
    compact bundle per CIK plus an index by ticker and the measured coverage.
    """
    from quant.sec.consumer import (aggregate_coverage, build_consumer_bundle,
                                    load_product_universe_ciks, summarize_bundle)
    registry = MetricRegistry.load()
    provider = SECProvider()
    names_file = Path(args.names)
    by_cik, without_cik = load_product_universe_ciks(names_file)
    product_count = sum(len(e["tickers"]) for e in by_cik.values()) + len(without_cik)
    wanted = set(by_cik)
    if args.ciks:
        wanted = {normalize_cik(c) for c in args.ciks.split(",")} & wanted
    if args.limit:
        wanted = set(sorted(wanted)[:args.limit])
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    as_of = args.as_of or str(date.today())
    print(f"  Produktuniversum: {product_count} Titel, {len(by_cik)} CIKs, {len(without_cik)} ohne CIK; angefragt {len(wanted)}")

    index_rows, seen, failures = [], set(), []
    if args.bulk:
        source = provider.iter_bulk_company_facts(ciks=wanted)
    else:
        source = ((cik, provider.get_company_facts(cik)) for cik in sorted(wanted))
    written = set()
    for cik, payload in source:
        entry = by_cik[cik]
        try:
            bundle = build_consumer_bundle(cik, payload, registry, as_of=as_of, tickers=entry["tickers"],
                                           security_ids=entry["securityIds"], name=entry["name"],
                                           annual_years=args.annual_years, quarters=args.quarters,
                                           provider=provider)
        except Exception as exc:  # noqa: BLE001 - one bad company must not stop 6,000
            failures.append({"cik": cik, "tickers": entry["tickers"], "error": f"{type(exc).__name__}: {exc}"})
            LOGGER.warning("cik=%s failed: %s", cik, exc)
            continue
        seen.add(cik)
        if bundle is None:
            failures.append({"cik": cik, "tickers": entry["tickers"], "error": "NO_PERIODIC_FACTS"})
            continue
        path = out_dir / f"CIK{cik}.json"
        path.write_text(json.dumps(bundle, separators=(",", ":")) + "\n", encoding="utf-8")
        written.add(path.name)
        summary = summarize_bundle(bundle)
        cov = bundle["coverage"]
        summary["file"] = f"consumer/{path.name}"
        summary["metricsAnnual"] = sorted(cov["annualMetrics"])
        summary["metricsQuarterly"] = sorted(cov["quarterlyMetrics"])
        summary["metricsTtm"] = list(cov["ttmMetrics"])
        index_rows.append(summary)
        if len(index_rows) % 250 == 0:
            print(f"  {len(index_rows)} Unternehmen geschrieben ...")
    unmatched = sorted(wanted - seen)
    if not args.keep_stale:
        _prune(out_dir, written)
    by_ticker = {}
    for row in index_rows:
        for ticker in row["tickers"]:
            by_ticker[ticker] = {"cik": row["cik"], "file": row["file"], "annualYears": row["annualYears"],
                                 "quarterly": row["quarterly"], "ttm": row["ttm"],
                                 "h3": row["h3"], "h5": row["h5"], "h10": row["h10"],
                                 "latestAnnualYear": row["latestAnnualYear"],
                                 "latestQuarter": row["latestQuarter"]}
    coverage = aggregate_coverage(index_rows, product_count, sum(len(e["tickers"]) for e in by_cik.values()),
                                  without_cik, unmatched)
    coverage["failures"] = failures
    coverage["withoutCikTickers"] = without_cik
    coverage["notInCompanyFactsCiks"] = unmatched
    coverage["asOf"] = as_of
    coverage["generated_at_utc"] = _utcnow()
    coverage["versions"] = version_stamp(registry.version)
    coverage["namesLayer"] = str(names_file.relative_to(ROOT)) if names_file.is_absolute() else str(names_file)
    _write(out_dir / "index.json", {"schema": consumer_module.SCHEMA, "generated_at_utc": _utcnow(),
                                    "asOf": as_of, "count": len(index_rows), "byTicker": by_ticker})
    _write(DATA_DIR / "consumer_coverage.json", coverage)
    print(f"  fertig: {len(index_rows)} Bundles, {len(failures)} Fehler, {len(unmatched)} CIKs nicht im Archiv")
    return 0


def cmd_test(args):
    import unittest
    loader = unittest.TestLoader()
    suite = loader.discover(str(Path(__file__).resolve().parent / "tests"),
                            top_level_dir=str(Path(__file__).resolve().parents[1]))
    runner = unittest.TextTestRunner(verbosity=2 if args.verbose else 1)
    return 0 if runner.run(suite).wasSuccessful() else 1


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--log-level", default="INFO")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest = subparsers.add_parser("ingest", help="fetch and normalize a universe")
    ingest.add_argument("--universe", default=str(DEFAULT_UNIVERSE))
    ingest.add_argument("--run-id", default="default")
    ingest.add_argument("--force", action="store_true")
    ingest.add_argument("--limit", type=int)
    ingest.add_argument("--no-resume", action="store_true")
    ingest.set_defaults(func=cmd_ingest)

    update = subparsers.add_parser("update", help="re-ingest companies with new filings")
    update.add_argument("--since", required=True)
    update.add_argument("--run-id", default="default")
    update.set_defaults(func=cmd_update)

    retry = subparsers.add_parser("retry", help="retry the failure queue")
    retry.add_argument("--run-id", default="default")
    retry.set_defaults(func=cmd_retry)

    export = subparsers.add_parser("export", help="write the data inspector views")
    export.add_argument("--as-of")
    export.add_argument("--annual-years", type=int, default=12)
    export.add_argument("--quarterly-years", type=int, default=5)
    export.add_argument("--policy", choices=POLICIES, default=POLICY_LATEST_KNOWN)
    export.set_defaults(func=cmd_export)

    cov = subparsers.add_parser("coverage", help="build the coverage matrix")
    cov.set_defaults(func=cmd_coverage)

    gate = subparsers.add_parser("gates", help="run the qualification gates")
    gate.add_argument("--as-of")
    gate.set_defaults(func=cmd_gates)

    resolve = subparsers.add_parser(
        "resolve", help="diagnose what each configured ticker resolves to at the SEC")
    resolve.add_argument("--universe", default=str(DEFAULT_UNIVERSE))
    resolve.add_argument("--strict", action="store_true",
                         help="exit non-zero when a configured CIK disagrees with the SEC")
    resolve.set_defaults(func=cmd_resolve)

    canonical = subparsers.add_parser(
        "canonical", help="write the canonical FundamentalFact/Filing payload")
    canonical.add_argument("--annual-years", type=int, default=12)
    canonical.add_argument("--quarterly-years", type=int, default=None,
                           help="limit the quarterly window; default is the full history")
    canonical.set_defaults(func=cmd_canonical)

    inspect = subparsers.add_parser("inspect", help="print one metric's series")
    inspect.add_argument("--ticker")
    inspect.add_argument("--cik")
    inspect.add_argument("--metric", default="revenue")
    inspect.add_argument("--as-of")
    inspect.add_argument("--policy", choices=POLICIES, default=POLICY_LATEST_KNOWN)
    inspect.add_argument("--hide-missing", action="store_true")
    inspect.set_defaults(func=cmd_inspect)

    consumer = subparsers.add_parser("consumer", help="compact consumer fundamentals for the product universe")
    consumer.add_argument("--names", default=str(ROOT / "quant" / "data" / "market" / "security-master" / "company-names.json"))
    consumer.add_argument("--out", default=str(DATA_DIR / "consumer"))
    consumer.add_argument("--as-of")
    consumer.add_argument("--bulk", action="store_true", help="read companyfacts.zip (one request) instead of per-company calls")
    consumer.add_argument("--ciks", help="comma-separated CIK subset")
    consumer.add_argument("--limit", type=int)
    consumer.add_argument("--annual-years", type=int, default=consumer_module.DEFAULT_ANNUAL_YEARS)
    consumer.add_argument("--quarters", type=int, default=consumer_module.DEFAULT_QUARTERS)
    consumer.add_argument("--keep-stale", action="store_true")
    consumer.set_defaults(func=cmd_consumer)

    test = subparsers.add_parser("test", help="run the offline test suite")
    test.add_argument("--verbose", action="store_true")
    test.set_defaults(func=cmd_test)
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO),
                        format="%(levelname)s %(name)s %(message)s")
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
