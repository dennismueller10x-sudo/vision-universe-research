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


def _resolve_universe(provider, companies, verify=True, skip_unresolved=False):
    """Ticker -> CIK against the SEC's own map. The config file is only a hint.

    `skip_unresolved` exists for a universe that is GENERATED rather than
    hand-written. With five curated issuers, a ticker the SEC does not know is
    a config error and has to stop the run. With five thousand issuers taken
    from a market-data provider, it is the expected case — ETFs, foreign
    issuers without a 20-F, freshly delisted shells — and aborting on the first
    one would mean the pipeline can never run at scale. The skipped entries are
    returned, not swallowed: a caller that does not report them is the bug this
    flag would otherwise introduce.
    """
    resolved = []
    skipped = []
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
            if skip_unresolved:
                skipped.append({"ticker": ticker, "reason": "notInSecTickerMap"})
                continue
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
            if skip_unresolved:
                # A generated universe carries the SEC's own CIK as its hint, so
                # a mismatch here means the ticker moved between the map build
                # and this run. The SEC's answer wins, and the move is recorded.
                skipped.append({"ticker": ticker, "reason": "cikMovedSinceMapBuild",
                                "hint": normalize_cik(hint), "sec": cik,
                                "action": "usedSecCik"})
                resolved.append({**entry, "cik": cik, "config_cik": normalize_cik(hint)})
                continue
            raise SystemExit(
                f"CIK mismatch for {ticker}: config says {normalize_cik(hint)}, "
                f"SEC says {cik}. Run `cli.py resolve` to see what each CIK "
                f"actually contains. If the divergence is real and intended, set "
                f"cik_authority: \"config\" with a cik_authority_reason that states "
                f"what was measured; otherwise fix quant/config/sec-universe.json."
            )
        resolved.append({**entry, "cik": cik})
    if skip_unresolved:
        return resolved, skipped
    return resolved


def _iter_documents(store, ciks=None):
    """Gespeicherte Factbooks, EINES nach dem anderen.

    `_documents` baut eine Liste. Bei fuenf Emittenten ist das
    gleichgueltig; bei 5.437 ist es toedlich - der zweite Produktivlauf
    hat den Runner damit umgebracht ("The runner has received a shutdown
    signal" nach zwei Minuten), nachdem der Ingest 76 Minuten lang
    erfolgreich war. Ein einzelnes Factbook erreicht 17 MB; alle
    zusammen sprengen jeden Arbeitsspeicher.

    Wer nur eine Bilanz je Emittent braucht, braucht nie zwei Factbooks
    gleichzeitig.
    """
    for cik in (ciks or store.list_companies()):
        document = store.read_company(cik)
        if document is not None:
            yield document


def _documents(store, ciks=None):
    """Alle Factbooks als Liste.

    Nur fuer Auswertungen ueber eine HANDVOLL Emittenten (export,
    canonical, coverage mit --universe). Fuer das ganze Universum
    `_iter_documents` benutzen.
    """
    return list(_iter_documents(store, ciks=ciks))


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


def ingest_verdict(attempted, completed, failed, max_failure_rate=0.05):
    """Ist ein Lauf mit einzelnen Fehlschlaegen gescheitert?

    EIN FEHLSCHLAG IST KEIN GESCHEITERTER LAUF.

    Die erste Fassung gab 1 zurueck, sobald EIN Emittent fehlschlug. Bei
    fuenf kuratierten Titeln ist das richtig. Beim ersten Produktivlauf
    ueber 5.480 Emittenten kostete es alles: 5.436 erfolgreiche Ingests,
    die Coverage-Messung, der Commit und der Zwischenspeicher wurden
    verworfen, weil 43 Titel (0,78 %) nicht durchliefen. Die
    Fehlerschlange ist genau fuer diesen Fall da.

    Gescheitert ist ein Lauf, wenn die Fehlerquote die Schwelle reisst
    oder gar nichts durchkam. Beides heisst "die Pipeline ist kaputt".
    Einzelne Emittenten heissen das nicht.
    """
    rate = (failed / attempted) if attempted else 0.0
    if attempted and completed == 0:
        code, reason = 1, "Kein einziger Emittent ingestiert."
    elif rate > max_failure_rate:
        code, reason = 1, (f"Fehlerquote {rate * 100:.2f} % ueber der Schwelle "
                           f"{max_failure_rate * 100:.2f} %.")
    else:
        code, reason = 0, None
    return {"attempted": attempted, "completed": completed, "failed": failed,
            "failure_rate": rate, "exit_code": code, "reason": reason}


# ---------------------------------------------------------------- commands

def cmd_ingest(args):
    provider = SECProvider()
    registry = MetricRegistry.load()
    pipeline = IngestionPipeline(provider=provider, registry=registry,
                                 run_id=args.run_id)
    universe = _load_universe(args.universe)
    skipped = []
    if args.skip_unresolved:
        companies, skipped = _resolve_universe(provider, universe, skip_unresolved=True)
    else:
        companies = _resolve_universe(provider, universe)

    if skipped:
        print(f"  {len(skipped)} of {len(universe)} entries could not be resolved "
              f"against the SEC ticker map and are not ingested:")
        for row in skipped[:20]:
            print(f"    {row['ticker']}: {row['reason']}")
        if len(skipped) > 20:
            print(f"    … and {len(skipped) - 20} more")

    outcome = pipeline.ingest_universe(companies, resume=not args.no_resume,
                                       force=args.force, limit=args.limit,
                                       bulk=args.bulk, bulk_archive=args.bulk_file)
    for result in outcome["results"][:50]:
        print(f"  {result['cik']}: {result['status']}"
              + (f" ({result['error']})" if result.get("error") else ""))
    if len(outcome["results"]) > 50:
        print(f"  … and {len(outcome['results']) - 50} more")
    run = dict(outcome["manifest"]["run"])
    run["universe_entries"] = len(universe)
    run["resolved"] = len(companies)
    run["unresolved"] = len(skipped)
    print(json.dumps(run, indent=2))

    # EIN FEHLSCHLAG IST KEIN GESCHEITERTER LAUF.
    #
    # Die erste Fassung endete mit 1, sobald EIN Emittent fehlschlug.
    # Bei fuenf kuratierten Titeln ist das richtig. Beim ersten
    # Produktivlauf ueber 5.480 Emittenten kostete es alles: 5.436
    # erfolgreiche Ingests, die Coverage-Messung, der Commit und der
    # Zwischenspeicher wurden verworfen, weil 43 Titel (0,78 %) nicht
    # durchliefen. Die Fehlerschlange ist genau fuer diesen Fall da.
    #
    # Der Lauf scheitert jetzt, wenn die Fehlerquote die Schwelle
    # reisst - oder wenn gar nichts durchkam. Beides heisst "die
    # Pipeline ist kaputt". Einzelne Emittenten heissen das nicht.
    urteil = ingest_verdict(attempted=len(companies),
                            completed=len(outcome["state"]["completed"]),
                            failed=len(outcome["state"]["failed"]),
                            max_failure_rate=args.max_failure_rate)
    print(f"\n  {urteil['completed']} ingestiert, {urteil['failed']} fehlgeschlagen "
          f"({urteil['failure_rate'] * 100:.2f} %, Schwelle "
          f"{args.max_failure_rate * 100:.2f} %)")
    if urteil["failed"]:
        print(f"  Die {urteil['failed']} stehen in der Fehlerschlange; "
              f"`cli.py retry` nimmt sie erneut.")
    if urteil["exit_code"]:
        print(f"  {urteil['reason']}")
    return urteil["exit_code"]


def cmd_update(args):
    """Inkrementell: nur Emittenten mit neuen Einreichungen (§17).

    Kein Voll-Backfill. `refresh_since` fragt je Emittent die
    Einreichungsuebersicht ab - eine Anfrage, kein Datensatz - und holt
    die Fakten nur fuer die, bei denen seit `--since` etwas eingereicht
    wurde. Mit `--bulk` kommen auch diese Fakten aus dem Sammelarchiv.
    """
    pipeline = IngestionPipeline(run_id=args.run_id)
    entries = None
    if args.universe:
        provider = SECProvider()
        companies, skipped = _resolve_universe(
            provider, _load_universe(args.universe), skip_unresolved=True)
        entries = companies
        if skipped:
            print(f"  {len(skipped)} Eintraege ohne CIK uebersprungen")
    outcome = pipeline.refresh_since(args.since, entries=entries)
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
    documents = _documents(store, ciks=_ciks_from_universe(getattr(args, "universe", None)))
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


def cmd_coverage_universe(args):
    """Gemessene Fundamental-Coverage gegen das Produktuniversum (§11-§14, §20).

    Der Nenner ist das Produktuniversum des Company Master, NICHT der
    eigene Bestand. Ein Bericht, der nur die ingestierten Emittenten
    zaehlt, meldet immer 100 Prozent.
    """
    from quant.sec import universe_coverage

    registry = MetricRegistry.load()
    store = JsonFactStore(compress=True)
    universe = universe_coverage.load_universe(ROOT)
    if not universe["present"]:
        raise SystemExit(
            "Kein Company Master unter quant/data/universe/instruments. "
            "Erst node scripts/universe/build-company-master.mjs.")

    reports = universe_coverage.build_reports(
        ROOT, _iter_documents(store), registry=registry, universe=universe,
        progress_every=250)

    out = ROOT / "quant" / "data" / "fundamentals"
    now = _utcnow()
    for name, key in (("coverage-report", "coverage"), ("history-coverage", "history"),
                      ("overlap", "overlap"), ("quality", "quality"), ("gaps", "gaps")):
        payload = reports[key]
        payload["generatedAtUtc"] = now
        _write(out / f"{name}.json", payload)

    # Die Emittentenbilanz in Scherben - eine Zeile je Emittent, nicht die
    # volle Historie. Die gehoert in die Arbeitsablage: 400 KB je Emittent
    # mal 7.000 waeren 2,8 GB, und ein Git-Repository ist kein Datenspeicher.
    shards = {}
    for issuer_id, row in reports["perIssuer"].items():
        shard = str(row["cik"]).zfill(10)[-3:]
        shards.setdefault(shard, []).append(dict(row, issuerId=issuer_id))
    issuer_dir = out / "issuers"
    if issuer_dir.exists():
        for stale in issuer_dir.glob("*.json"):
            stale.unlink()
    for shard, rows in sorted(shards.items()):
        rows.sort(key=lambda r: r["issuerId"])
        _write(issuer_dir / f"{shard}.json",
               {"shard": shard, "count": len(rows), "issuers": rows})

    _write(out / "manifest.json", {
        "generated_at_utc": now,
        "versions": version_stamp(registry.version),
        "note": "Kompakte Bilanz je Emittent. Die vollstaendige Historie mit Herkunft "
                "je Wert liegt in der Arbeitsablage (quant/data/sec/facts, gitignored) "
                "und gehoert langfristig in die Objektablage - siehe "
                "docs/VU_FUNDAMENTAL_DATA_EXPANSION.md.",
        "storage": {
            "committed": "quant/data/fundamentals/**",
            "workingStore": "quant/data/sec/facts/**",
            "perIssuerBytesCommitted": "~1 KB",
            "perIssuerBytesFull": "~400 KB (gemessen an AAPL)",
        },
        "totals": {
            "productTitles": reports["members"],
            "issuersWithFundamentals": len(reports["perIssuer"]),
            "shards": len(shards),
        },
    })

    c = reports["coverage"]
    print(f"  Produkttitel:            {c['universe']['PRODUCT_TITLES']}")
    print(f"  Emittenten im Produkt:   {c['universe']['PRODUCT_ISSUERS']}")
    print(f"  CIK aufgeloest:          {c['identity']['CIK_RESOLVED']}")
    print(f"  CIK unaufgeloest:        {c['identity']['CIK_UNRESOLVED']}")
    print(f"  CIK ambig:               {c['identity']['CIK_AMBIGUOUS']}")
    print(f"  Company Facts vorhanden: {c['fundamentals']['COMPANY_FACTS_AVAILABLE']}")
    print(f"  Company Facts fehlend:   {c['fundamentals']['COMPANY_FACTS_UNAVAILABLE']}")
    for metric, row in c["metrics"].items():
        print(f"    {metric:<24} {row['COUNT']:>6}  "
              f"{row['PERCENT_OF_PRODUCT_UNIVERSE']}%")
    print(f"\n  {out.relative_to(ROOT)}")
    return 0


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
    documents = _documents(store, ciks=_ciks_from_universe(getattr(args, "universe", None)))
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
    ingest.add_argument("--skip-unresolved", action="store_true",
                        help="do not abort on tickers the SEC ticker map does not know "
                             "(the expected case for a generated universe; the skipped "
                             "entries are reported)")
    ingest.add_argument("--bulk", action="store_true",
                        help="take XBRL facts from the SEC bulk companyfacts archive "
                             "(one request) instead of one request per issuer")
    ingest.add_argument("--max-failure-rate", type=float, default=0.05,
                        help="Anteil fehlgeschlagener Emittenten, bis zu dem der Lauf als "
                             "erfolgreich gilt (Standard 0.05). Darueber Rueckgabewert 1. "
                             "Einzelne Fehlschlaege stehen in der Fehlerschlange und "
                             "duerfen nicht den ganzen Lauf verwerfen.")
    ingest.add_argument("--bulk-file",
                        help="read the bulk archive from this local path instead of "
                             "fetching it")
    ingest.set_defaults(func=cmd_ingest)

    update = subparsers.add_parser("update", help="re-ingest companies with new filings")
    update.add_argument("--since", required=True)
    update.add_argument("--run-id", default="default")
    update.add_argument("--universe",
                        help="Emittentenliste statt des gespeicherten Bestands pruefen - "
                             "so werden auch neu aufgenommene Titel erfasst")
    update.set_defaults(func=cmd_update)

    coverage_universe = subparsers.add_parser(
        "coverage-universe",
        help="gemessene Fundamental-Coverage gegen das Produktuniversum (§11-§14)")
    coverage_universe.set_defaults(func=cmd_coverage_universe)

    retry = subparsers.add_parser("retry", help="retry the failure queue")
    retry.add_argument("--run-id", default="default")
    retry.set_defaults(func=cmd_retry)

    export = subparsers.add_parser("export", help="write the data inspector views")
    export.add_argument("--as-of")
    export.add_argument("--annual-years", type=int, default=12)
    export.add_argument("--quarterly-years", type=int, default=5)
    export.add_argument("--policy", choices=POLICIES, default=POLICY_LATEST_KNOWN)
    export.add_argument("--universe",
                        help="nur die Emittenten dieser Universumsdatei; ohne Angabe alle")
    export.set_defaults(func=cmd_export)

    cov = subparsers.add_parser("coverage", help="build the coverage matrix")
    cov.add_argument("--universe",
                     help="nur die Emittenten dieser Universumsdatei; ohne Angabe alle")
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
    canonical.add_argument("--universe",
                           help="nur die Emittenten dieser Universumsdatei; ohne Angabe alle")
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
