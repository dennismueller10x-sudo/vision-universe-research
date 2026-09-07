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
from quant.sec.periods import PeriodResolver
from quant.sec.pipeline import IngestionPipeline, export_inspector_view, _rehydrate
from quant.sec.provider import SECProvider, normalize_cik
from quant.sec.registry import MetricRegistry
from quant.sec.restatements import POLICY_AS_OF_LATEST, POLICY_LATEST_KNOWN, POLICIES
from quant.sec.store import JsonFactStore
from quant.sec.version import version_stamp

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


def _ticker_of(document):
    tickers = (document.get("profile") or {}).get("tickers") or []
    return tickers[0] if tickers else document["cik"]


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
    index = []
    for document in documents:
        view = export_inspector_view(
            document, registry, as_of=args.as_of,
            annual_years=args.annual_years, quarterly_years=args.quarterly_years,
            policy=args.policy)
        ticker = _ticker_of(document)
        path = _write(INSPECTOR_DIR / f"{ticker}.json", view)
        index.append({
            "ticker": ticker, "cik": document["cik"],
            "name": (document.get("profile") or {}).get("name"),
            "sic": (document.get("profile") or {}).get("sic"),
            "sic_description": (document.get("profile") or {}).get("sic_description"),
            "file": f"inspector/{path.name}",
            "rows": len(view["rows"]),
            "quality": view["quality_summary"],
        })
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
    matrix = coverage_module.build_matrix(documents, registry)
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
        per_company.append({"cik": document["cik"], "ticker": _ticker_of(document),
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
    index = []
    for document in documents:
        ticker = _ticker_of(document)
        bundle = build_company_bundle(document, registry, ticker,
                                      annual_years=args.annual_years,
                                      quarterly_years=args.quarterly_years)
        path = _write(CANONICAL_DIR / f"{ticker}.json", bundle)
        index.append({
            "ticker": ticker,
            "securityId": bundle["security"]["securityId"],
            "cik": document["cik"],
            "name": bundle["security"]["name"],
            "file": f"canonical/{path.name}",
            "factCount": bundle["coverage"]["factCount"],
            "metricIds": bundle["coverage"]["metricIds"],
            "annualYears": bundle["coverage"]["annualYears"],
        })
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
    canonical.add_argument("--quarterly-years", type=int, default=6)
    canonical.set_defaults(func=cmd_canonical)

    inspect = subparsers.add_parser("inspect", help="print one metric's series")
    inspect.add_argument("--ticker")
    inspect.add_argument("--cik")
    inspect.add_argument("--metric", default="revenue")
    inspect.add_argument("--as-of")
    inspect.add_argument("--policy", choices=POLICIES, default=POLICY_LATEST_KNOWN)
    inspect.add_argument("--hide-missing", action="store_true")
    inspect.set_defaults(func=cmd_inspect)

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
