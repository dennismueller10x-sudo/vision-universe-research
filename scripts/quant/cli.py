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
from collections import Counter
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


def _ciks_from_universe(path):
    """Die CIKs einer Universumsdatei - oder None fuer "alle".

    Ein aufgerufener, aber nie definierter Helfer. `export` und
    `canonical` riefen ihn seit der Einfuehrung von --universe auf; im
    Workflow standen beide hinter `|| true`, also meldete der Schritt
    Erfolg und schrieb nichts. Der dritte Produktivlauf ist an einer
    ANDEREN Stelle gestorben, bevor der NameError je sichtbar wurde.

    Ohne Pfad gibt es keine Einschraenkung; eine Datei ohne aufloesbare
    CIK ergibt eine leere Menge, und das ist etwas anderes als "alle" -
    deshalb wird hier nie None zurueckgegeben, wenn ein Pfad kam.
    """
    if not path:
        return None
    ciks = []
    for entry in _load_universe(path):
        cik = entry.get("cik")
        if cik:
            ciks.append(normalize_cik(cik))
    return ciks


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


# Ab hier ist eine Liste von Factbooks keine Liste mehr, sondern ein
# Speicherproblem. Der Wert ist bewusst grosszuegig: der Validierungssatz
# hat fuenf Eintraege, ein versehentlich ungefilterter Aufruf ueber 5.406.
MAX_DOCUMENTS_IN_MEMORY = 250


def _documents(store, ciks=None):
    """Alle Factbooks als Liste.

    Nur fuer Auswertungen ueber eine HANDVOLL Emittenten (export,
    canonical, coverage, gates mit --universe). Fuer das ganze Universum
    `_iter_documents` benutzen.

    Der dritte Produktivlauf ist daran gestorben, dass cmd_coverage sein
    eigenes --universe nicht las und den ganzen Bestand materialisierte.
    Ein OOM-Kill ist nicht abfangbar - der Runner bekommt ein
    Shutdown-Signal, `|| true` greift nicht, und im Log steht nichts
    ueber die Ursache. Deshalb bricht diese Stelle vorher ab und sagt,
    WELCHER Aufruf den Filter vergessen hat.
    """
    documents = []
    for document in _iter_documents(store, ciks=ciks):
        documents.append(document)
        if len(documents) > MAX_DOCUMENTS_IN_MEMORY:
            raise SystemExit(
                f"Mehr als {MAX_DOCUMENTS_IN_MEMORY} Factbooks auf einmal "
                f"angefordert (Filter: {'kein' if ciks is None else len(ciks)}). "
                "Diese Auswertung ist fuer eine Handvoll Emittenten gebaut - "
                "--universe setzen, oder fuer das ganze Universum "
                "coverage-universe benutzen, das streamt."
            )
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

    # DIE BILANZ DES LAUFS GEHOERT INS REPOSITORY, NICHT NUR INS LOG.
    #
    # Anfragezahlen und Fehlschlaege standen bisher ausschliesslich im
    # Actions-Log. Ein Log laeuft ab; die Frage "wie viele Anfragen hat
    # das die SEC gekostet, und welche Titel sind nicht durchgekommen"
    # ist genau die, die man spaeter stellt.
    http = getattr(getattr(provider, "client", None), "stats", None) or {}
    _write(DATA_DIR.parent / "fundamentals" / "ingest-run.json", {
        "schema_version": 1,
        "generated_at_utc": _utcnow(),
        "versions": version_stamp(registry.version),
        "note": "Bilanz EINES Ingest-Laufs. Ein wiederaufgenommener Lauf zaehlt "
                "nur, was er selbst geholt hat - uebersprungene Emittenten aus "
                "dem Zwischenspeicher erzeugen keine Anfrage.",
        "run": run,
        "requests": {
            "SEC_BULK_REQUESTS": (run.get("bulk") or {}).get("requests",
                                  1 if run.get("bulk") else 0),
            "SEC_INDIVIDUAL_REQUESTS": http.get("requests", 0),
            "CACHE_HITS": http.get("cache_hits", 0),
            "RETRIES": http.get("retries", 0),
        },
        "failures": {
            "FAILED_SECURITIES": run.get("failed", 0),
            "UNRESOLVED_NOT_INGESTED": len(skipped),
            "ciks": [r["cik"] for r in outcome["results"]
                     if r.get("status") not in ("ok", "skipped", "unchanged")][:200],
            # WARUM, nicht nur wie viele: ohne die Fehlerklasse stand die
            # Schlange drei Laeufe lang da, und niemand konnte sagen, ob
            # die SEC 404 sagt oder der Abruf stirbt.
            "byError": dict(Counter(_fehlerklasse(r["error"]) for r in outcome["results"]
                                    if r.get("error")).most_common()),
            "retryQueue": list((outcome.get("state") or {}).get("retry_queue", []))[:200],
        },
    })

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
    """Die Fehlerschlange einzeln ueber die SEC-API nachholen (§8: erst Sammelweg, dann Rest)."""
    pipeline = IngestionPipeline(run_id=args.run_id)
    vorher = len(pipeline.checkpoint.load().get("retry_queue", []))
    outcome = pipeline.retry_failed(reset_attempts=getattr(args, "reset_attempts", False))
    fehler = Counter()
    for result in outcome["results"]:
        print(f"  {result['cik']}: {result['status']}"
              + (f"  {str(result.get('error'))[:120]}" if result.get("error") else ""))
        if result.get("error"):
            fehler[_fehlerklasse(result["error"])] += 1
    nachher = len(outcome["state"].get("retry_queue", []))
    print(f"\n  Fehlerschlange: {vorher} vorher, {nachher} nachher, "
          f"{len(outcome['results'])} erneut versucht")
    _write(Path(args.out), {
        "schema_version": 1,
        "generated_at_utc": _utcnow(),
        "note": "Einzelabruf der Fehlerschlange ueber die SEC-API nach dem Sammelweg. "
                "Ein companyfacts-404 ist keine Stoerung, sondern die Antwort der SEC "
                "(keine XBRL-Fakten) und ergibt ein leeres Factbook mit Status.",
        "QUEUE_BEFORE": vorher, "QUEUE_AFTER": nachher,
        "RETRIED": len(outcome["results"]),
        "resetAttempts": bool(getattr(args, "reset_attempts", False)),
        "byStatus": dict(Counter(r.get("status") for r in outcome["results"])),
        "byError": dict(fehler.most_common()),
        "results": [{"cik": r["cik"], "status": r.get("status"),
                     "error": (str(r.get("error"))[:300] if r.get("error") else None)}
                    for r in outcome["results"]],
    })
    # Kein Abbruch: was nach dem Einzelabruf noch fehlt, steht mit Grund im
    # Bericht und in der Feinklassifikation. Der Lauf misst weiter.
    return 0


def _fehlerklasse(text):
    text = str(text)
    if "HTTP 404" in text:
        return "SEC_404_" + ("SUBMISSIONS" if "submissions" in text else
                             "COMPANYFACTS" if "companyfacts" in text else "OTHER")
    if "HTTP 403" in text:
        return "SEC_403"
    if "HTTP 5" in text:
        return "SEC_5XX"
    if "HTTP 429" in text:
        return "SEC_429"
    return text.split(":")[0][:60] or "UNKNOWN"


def cmd_export(args):
    registry = MetricRegistry.load()
    store = JsonFactStore(compress=True)
    ciks = _ciks_from_universe(getattr(args, "universe", None))
    if getattr(args, "ciks", None):
        # Der taegliche Lauf frischt nur die Buendel der Emittenten auf, die
        # ein neues Filing hatten - und nur, wenn sie bereits ein Buendel im
        # Repository haben. Ohne diese Grenze schriebe der Lauf 5.400 mal
        # 400 KB.
        gewollt = {normalize_cik(c) for c in args.ciks.split(",") if c.strip()}
        ciks = sorted(gewollt if ciks is None else (set(ciks) & gewollt))
    documents = _documents(store, ciks=ciks)
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
    # --universe war deklariert und wurde nie gelesen. Der Workflow gab
    # den Validierungssatz mit, die Matrix las trotzdem den ganzen
    # Bestand - 5.406 Factbooks in einer Liste, und der Runner bekam ein
    # Shutdown-Signal. Ein Argument, das nichts tut, ist schlimmer als
    # keines: es sieht nach einer Grenze aus.
    documents = _documents(store, ciks=_ciks_from_universe(getattr(args, "universe", None)))
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
    documents = _documents(store, ciks=_ciks_from_universe(getattr(args, "universe", None)))
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


def _sic_spannen(text):
    """'6020-6036,6021' -> [(6020, 6036), (6021, 6021)]; leer -> []."""
    spannen = []
    for teil in (text or "").split(","):
        teil = teil.strip()
        if not teil:
            continue
        low, _, high = teil.partition("-")
        spannen.append((int(low), int(high or low)))
    return spannen


def _sic_passt(sic, spannen):
    try:
        code = int(sic)
    except (TypeError, ValueError):
        return False
    return any(low <= code <= high for low, high in spannen)


def cmd_concepts(args):
    """Welche XBRL-Konzepte meldet der Bestand, die die Registry nicht kennt?

    Die Grundlage jeder Mapping-Arbeit, und zwar GEMESSEN. Ein Mapping
    aus dem Gedaechtnis trifft die Konzepte, an die man sich erinnert -
    nicht die, die tatsaechlich vorkommen. Diese Auswertung zaehlt, wie
    oft ein unbekanntes Konzept auftritt und BEI WIE VIELEN EMITTENTEN;
    die zweite Zahl entscheidet, denn ein Konzept, das ein einziger
    Emittent zehntausendmal meldet, bringt gemappt genau einen Titel.

    Mit --only-unresolved zaehlt sie nur Emittenten, aus denen heute
    KEIN einziger Wert entsteht. Das ist die Liste, die Deckung schafft.
    """
    store = JsonFactStore(compress=True)
    ciks = store.list_companies()
    if not ciks:
        print("Kein Faktenspeicher. Erst `ingest`.")
        return 2
    if args.ciks_file:
        # Genau die Emittenten, die ein Bericht benannt hat - z. B. die
        # 77, die nach der Feinklassifikation noch SEC-loesbar sind.
        # Ohne diese Eingrenzung dominiert das SPAC-Vokabular jede Liste.
        payload = json.loads(Path(args.ciks_file).read_text(encoding="utf-8"))
        gewollt = set(payload.get(args.ciks_key) if args.ciks_key else payload)
        ciks = [c for c in ciks if c in gewollt]
        print(f"  Eingegrenzt auf {len(ciks)} Emittenten aus {args.ciks_file}")
    # --sic 6020-6036,6021: nur Emittenten dieser SIC-Spannen. Das ist
    # die Messung, aus der eine Branchenschicht entsteht - das
    # Vokabular der Banken, nicht das Vokabular derer, denen zufaellig
    # der Umsatz-Tag fehlt.
    sic_spannen = _sic_spannen(getattr(args, "sic", None))

    von_konzept = Counter()          # Fakten je Konzept
    emittenten_je_konzept = Counter()  # Emittenten je Konzept
    taxonomien = Counter()
    geprueft = betroffen = 0

    for cik in ciks:
        document = store.read_company(cik)
        if document is None:
            continue
        geprueft += 1
        if sic_spannen and not _sic_passt((document.get("profile") or {}).get("sic"),
                                          sic_spannen):
            document = None
            continue
        # Ein Emittent ohne aufloesbare Werte ist der teure Fall.
        timelines = (document.get("factbook") or {}).get("timelines") or []
        leer = not timelines
        if args.only_unresolved and not leer:
            document = None
            continue
        # --without-metric revenue: Emittenten, die etwas liefern, aber
        # genau diese Kennzahl nicht. Das ist die Bank, der Versicherer,
        # der REIT - und ihr Vokabular ist das, was ein Branchenmapping
        # braucht. Ein Mapping aus dem Gedaechtnis trifft die Konzepte,
        # an die man sich erinnert; dieses hier trifft die, die vorkommen.
        if args.without_metric:
            hat_werte = bool(timelines)
            hat_metrik = any(
                (t.get("metric") if isinstance(t, dict) else None) == args.without_metric
                for t in timelines)
            if not hat_werte or hat_metrik:
                document = None
                continue
        betroffen += 1
        eigene = set()
        for finding in (document.get("quality") or {}).get("findings") or []:
            if finding.get("code") != "UNKNOWN_CONCEPT":
                continue
            name = finding.get("concept") or ""
            if not name:
                continue
            von_konzept[name] += 1
            eigene.add(name)
            taxonomien[name.split(":")[0]] += 1
        for name in eigene:
            emittenten_je_konzept[name] += 1
        document = None   # nicht zwei Factbooks gleichzeitig halten

    print(f"  Emittenten im Speicher: {geprueft}")
    print(f"  davon ausgewertet:      {betroffen}")
    print(f"  Taxonomien der unbekannten Konzepte: {dict(taxonomien.most_common())}")
    print(f"\n  Top {args.top} unbekannte Konzepte, nach EMITTENTEN sortiert:")
    print(f"  {'Konzept':<70} {'Emittenten':>10} {'Fakten':>10}")
    for name, n_emittenten in emittenten_je_konzept.most_common(args.top):
        print(f"  {name:<70} {n_emittenten:>10} {von_konzept[name]:>10}")

    if args.out:
        _write(Path(args.out), {
            "schema_version": 1,
            "generated_at_utc": _utcnow(),
            "note": "Unbekannte XBRL-Konzepte, gemessen am Faktenspeicher. Sortiert "
                    "nach betroffenen EMITTENTEN - ein Konzept, das ein einziger "
                    "Emittent zehntausendmal meldet, bringt gemappt einen Titel.",
            "scope": ("issuers_without_any_resolved_value" if args.only_unresolved
                      else f"issuers_with_values_but_without_{args.without_metric}"
                      if args.without_metric else "all_issuers"),
            "sic": getattr(args, "sic", None),
            "issuers_scanned": geprueft,
            "issuers_in_scope": betroffen,
            "by_taxonomy": dict(taxonomien.most_common()),
            "concepts": [
                {"concept": name, "issuers": n, "facts": von_konzept[name]}
                for name, n in emittenten_je_konzept.most_common(args.top)
            ],
        })
    return 0


def cmd_final_report(args):
    """§25/§26: der Abschlussbericht, gerendert aus den Messartefakten."""
    from quant.sec.final_report import build_final_report
    text = build_final_report()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f"  Abschlussbericht: {out} ({len(text.splitlines())} Zeilen)")
    return 0


def cmd_daily(args):
    """Der taegliche Incremental-Lifecycle: nur neue oder geaenderte Filings (§1-§16).

    Kein Full Backfill. Der SEC-Tagesindex sagt, wer seit dem letzten
    Lauf eingereicht hat; genau diese Emittenten werden frisch geholt,
    normalisiert und im Speicher aktualisiert. Persistenz, Reload und
    Downstream folgen als eigene Schritte (`daily-downstream`).
    """
    from quant.sec import daily

    pipeline = IngestionPipeline(run_id="daily")
    provider = pipeline.provider
    companies, skipped = _resolve_universe(
        provider, _load_universe(args.universe), verify=False, skip_unresolved=True)
    universe_ciks = {normalize_cik(c["cik"]) for c in companies if c.get("cik")}
    state = daily.load_state()
    since = date.fromisoformat(args.since) if args.since else None
    ciks = [normalize_cik(c) for c in args.ciks.split(",") if c.strip()] if args.ciks else None
    from quant.sec import universe_coverage
    report = daily.run_daily(pipeline, provider.client, universe_ciks, state, since=since,
                             ciks_override=ciks, dry_run=args.dry_run, log=print,
                             shard_records=universe_coverage.load_issuer_shards(ROOT))
    report["UNIVERSE_SKIPPED_WITHOUT_CIK"] = len(skipped)
    daily.DAILY_DIR.mkdir(parents=True, exist_ok=True)
    _write(daily.DAILY_DIR / "latest-run.json", report)
    _write(daily.DAILY_DIR / "updated-issuers.json", daily.updated_issuers_manifest(report))
    print(f"\n  {report['STATUS']}: {report['ISSUERS_UPDATED']} aktualisiert, "
          f"{report['FAILED_ISSUERS']} gescheitert, {report['RETRY_QUEUE']} in der Schlange, "
          f"{report['SEC_CHANGES_FOUND']} Filings im Index, "
          f"{report['TOTAL_RUNTIME_SECONDS']} s")
    for u in report["updated"]:
        print(f"    {u['cik']} {u['reason']:<11} {u['latestForm'] or '-':<7} {u['latestFiledAt'] or '-'} "
              f"{len(u['metricsChanged'])} Kennzahlen geaendert")
    for f in report["failed"]:
        print(f"    {f['cik']} FEHLER {f['error'][:100]}")
    return 1 if report["STATUS"] == daily.STATUS_FAILURE else 0


def _unterbefehl(*argv):
    """Namespace eines Unterbefehls so, wie ihn die Kommandozeile baute.

    Der Downstream ruft reconcile und canonical als Funktionen; ein von
    Hand gebauter Namespace vergisst Defaults, sobald ein Parser ein
    Argument dazubekommt (Lauf 34810787817: kein `today`). Der Parser
    selbst vergisst nichts.
    """
    return build_parser().parse_args(list(argv))


def cmd_daily_downstream(args):
    """Nach Persistenz und Reload: abhaengige Artefakte nur fuer die aktualisierten Emittenten.

    Scherben je Emittent, Aggregate aus den Scherben, Abgleich, kanonische
    Buendel (nur vorhandene), UPDATED_ISSUERS-Manifest und der Health
    Report mit den Persistenz- und Reload-Zahlen dieses Laufs.
    """
    from quant.sec import daily, universe_coverage

    registry = MetricRegistry.load()
    store = JsonFactStore(compress=True)
    latest = json.loads((daily.DAILY_DIR / "latest-run.json").read_text(encoding="utf-8"))
    updated = latest.get("updated") or []
    ciks = [u["cik"] for u in updated]
    started = datetime.now(timezone.utc)

    # 1. Scherben: nur die aktualisierten Emittenten neu rechnen.
    per_issuer = universe_coverage.load_issuer_shards(ROOT)
    for cik in ciks:
        document = store.read_company(cik)
        if document is None:
            continue
        per_issuer["iss_cik_" + cik] = universe_coverage.issuer_fundamentals(document, registry)
    if per_issuer and not latest.get("DRY_RUN"):
        universe = universe_coverage.load_universe(ROOT)
        reports = universe_coverage.reports_from_records(ROOT, per_issuer, registry=registry,
                                                          universe=universe)
        _write_universe_reports(reports, registry)
        # 2. Abgleich mit dem Marktdaten-Universum (liest die Scherben).
        cmd_reconcile(_unterbefehl("reconcile"))
        # 3. Kanonische Buendel: nur Emittenten mit neuem Filing UND vorhandenem Buendel.
        if ciks:
            cmd_canonical(_unterbefehl("canonical", "--ciks", ",".join(ciks), "--only-existing"))

    # 4. Persistenz- und Reload-Zahlen dieses Laufs in den Bericht.
    persistence = {}
    pfad = ROOT / "quant" / "data" / "fundamentals" / "persistence.json"
    if pfad.exists():
        persistence = json.loads(pfad.read_text(encoding="utf-8"))
    reload_report = {}
    pfad = ROOT / "quant" / "data" / "fundamentals" / "reload-verification.json"
    if pfad.exists():
        reload_report = json.loads(pfad.read_text(encoding="utf-8"))
    # Persistenz- und Reload-Nachweise zaehlen nur, wenn sie in DIESEM Lauf
    # entstanden: ein Bericht aus dem Repository (letzter Voll-Lauf) darf
    # sich nicht als heutiger ausgeben.
    lauf_zeit = (latest.get("LAST_SUCCESSFUL_RUN") or latest.get("RUN_DATE") or "")[:19]
    push_zeit = (persistence.get("generatedAt") or "")[:19]
    push = persistence.get("push") if push_zeit >= lauf_zeit else None
    push = push or {}
    latest["R2_OBJECTS_WRITTEN"] = push.get("changed")
    latest["R2_OBJECTS_UNCHANGED"] = push.get("unchanged")
    if push:
        latest["R2_PERSISTENCE"] = "PASS" if push.get("changed", 0) >= len(ciks) else "FAIL"
    else:
        latest["R2_PERSISTENCE"] = "NOT_NEEDED" if not ciks else "MISSING"
    reload_zeit = (reload_report.get("generated_at_utc") or "")[:19]
    if not ciks:
        latest["RELOAD_WITHOUT_SEC_REFETCH"] = "NOT_NEEDED"
        latest["RELOAD_SAMPLE"] = {"requested": 0, "passed": 0,
                                   "lastVerified": reload_zeit or None,
                                   "lastResult": reload_report.get("RELOAD_WITHOUT_SEC_REFETCH")}
    elif reload_zeit >= lauf_zeit:
        latest["RELOAD_WITHOUT_SEC_REFETCH"] = reload_report.get("RELOAD_WITHOUT_SEC_REFETCH")
        latest["RELOAD_SAMPLE"] = {"requested": reload_report.get("requested"),
                                   "passed": reload_report.get("passed")}
    else:
        latest["RELOAD_WITHOUT_SEC_REFETCH"] = "MISSING"
        latest["RELOAD_SAMPLE"] = {"requested": len(ciks), "passed": 0,
                                   "lastVerified": reload_zeit or None}
    latest["DOWNSTREAM_INVALIDATIONS"] = len(ciks)
    latest["DOWNSTREAM_TARGETS"] = list(daily.DOWNSTREAM_TARGETS)
    latest["DOWNSTREAM_RUNTIME_SECONDS"] = round(
        (datetime.now(timezone.utc) - started).total_seconds(), 1)
    latest["TOTAL_RUNTIME"] = round(latest.get("TOTAL_RUNTIME_SECONDS", 0)
                                    + latest["DOWNSTREAM_RUNTIME_SECONDS"], 1)
    _write(daily.DAILY_DIR / f"health-{latest['RUN_DATE']}.json", latest)
    _write(daily.DAILY_DIR / "latest-run.json", latest)
    _write(daily.DAILY_DIR / "updated-issuers.json", daily.updated_issuers_manifest(latest, {
        "R2_OBJECTS_WRITTEN": latest["R2_OBJECTS_WRITTEN"],
        "RELOAD_WITHOUT_SEC_REFETCH": latest["RELOAD_WITHOUT_SEC_REFETCH"]}))
    print(f"  Downstream: {len(ciks)} Emittenten in Scherben und Buendeln aufgefrischt, "
          f"R2 geschrieben: {latest['R2_OBJECTS_WRITTEN']}, Reload: {latest['RELOAD_WITHOUT_SEC_REFETCH']}")
    return 0


def cmd_verify_reload(args):
    """§21 J: Reload reproduziert dieselben kanonischen Werte - ohne SEC.

    persist-fundamentals.mjs hat Objekte aus der dauerhaften Ablage nach
    .sec-reload/facts zurueckgeladen. Dieser Befehl liest sie als
    eigenen Faktenspeicher, leitet daraus die kanonischen Buendel ab und
    vergleicht sie mit denen aus dem lokalen Speicher.

    "Ohne SEC" ist keine Zusage, sondern eine Sperre: fuer die Dauer
    dieses Befehls wirft jeder Netzwerkzugriff. Ein Vergleich, der
    heimlich nachlaedt, waere kein Nachweis der Persistenz.
    """
    import urllib.request
    from quant.sec.canonical import build_company_bundle

    def gesperrt(*_a, **_k):
        raise RuntimeError("RELOAD_MUST_NOT_FETCH: Netzwerkzugriff waehrend verify-reload")
    urllib.request.urlopen = gesperrt

    registry = MetricRegistry.load()
    reload_dir = Path(args.reload_dir)
    lokal = (JsonFactStore(directory=Path(args.local_dir), compress=True)
             if getattr(args, "local_dir", None) else JsonFactStore(compress=True))
    zurueck = JsonFactStore(directory=reload_dir, compress=True)
    ciks = [c.strip() for c in (args.ciks or "").split(",") if c.strip()] or zurueck.list_companies()
    if not ciks:
        print(f"Nichts zurueckgeladen unter {reload_dir}.")
        return 2

    def kanonisch(document, ticker):
        bundle = build_company_bundle(document, registry, ticker)
        # Zeitstempel des Bauens sind kein Inhalt.
        facts = [{k: v for k, v in f.items() if k != "ingestedAt"} for f in bundle.get("facts") or []]
        return sorted(facts, key=lambda f: (f["metricId"], f["fiscalYear"], f["fiscalPeriod"],
                                            f.get("periodEnd") or "", f.get("revisionId") or 0))

    ergebnisse = []
    for cik in ciks:
        a = lokal.read_company(cik)
        b = zurueck.read_company(cik)
        zeile = {"cik": cik, "localPresent": a is not None, "reloadPresent": b is not None}
        if a is None or b is None:
            zeile["pass"] = False
            zeile["reason"] = "fehlt " + ("lokal" if a is None else "im Reload")
            ergebnisse.append(zeile); continue
        zeile["documentsIdentical"] = (a == b)
        ticker = ((a.get("profile") or {}).get("tickers") or [None])[0] or f"CIK{cik}"
        ka, kb = kanonisch(a, ticker), kanonisch(b, ticker)
        zeile["canonicalFacts"] = len(ka)
        zeile["canonicalFactsIdentical"] = (ka == kb)
        zeile["currencies"] = sorted({f.get("currency") for f in ka if f.get("currency")})
        # Die Buendel fuehren bewusst nur Quartale (eine Jahreszeile
        # kollidiert im Produktschema mit Q4). Die Jahrestiefe ist die
        # Zahl der Geschaeftsjahre, nicht die der FY-Zeilen.
        zeile["annualPeriods"] = len({f["fiscalYear"] for f in ka})
        zeile["quarterlyPeriods"] = len({(f["fiscalYear"], f["fiscalPeriod"]) for f in ka
                                         if f["fiscalPeriod"] != "FY"})
        zeile["restated"] = sum(1 for f in ka if f.get("restatementStatus") != "original")
        zeile["everyFactHasFilingAndAccession"] = all(
            f.get("filedAt") and f.get("sourceFilingId") for f in ka)
        zeile["normalizationLogic"] = (b.get("versions") or {}).get("normalization_logic")
        zeile["pass"] = (zeile["documentsIdentical"] and zeile["canonicalFactsIdentical"]
                         and zeile["everyFactHasFilingAndAccession"] and len(ka) > 0)
        ergebnisse.append(zeile)
        print(f"  {cik}  {'PASS' if zeile['pass'] else 'FAIL'}  {len(ka)} kanonische Werte, "
              f"{zeile['annualPeriods']} Jahre, {zeile['quarterlyPeriods']} Quartale, "
              f"{'+'.join(zeile['currencies']) or '-'}, {zeile['restated']} restated, "
              f"v{zeile['normalizationLogic']}")

    bestanden = sum(1 for z in ergebnisse if z.get("pass"))
    verdict = "PASS" if bestanden == len(ergebnisse) and ergebnisse else "FAIL"
    _write(Path(args.out) if getattr(args, "out", None)
           else ROOT / "quant" / "data" / "fundamentals" / "reload-verification.json", {
        "schema_version": 1, "generated_at_utc": _utcnow(),
        "versions": version_stamp(registry.version),
        "note": "Zurueckgeladene Objekte als eigener Faktenspeicher gelesen, kanonisch "
                "abgeleitet und mit dem lokalen Stand verglichen. Netzwerkzugriff war "
                "waehrend des Vergleichs gesperrt.",
        "RELOAD_WITHOUT_SEC_REFETCH": verdict,
        "requested": len(ergebnisse), "passed": bestanden,
        "networkBlocked": True,
        "results": ergebnisse,
    })
    print(f"\n  RELOAD_WITHOUT_SEC_REFETCH = {verdict}  ({bestanden}/{len(ergebnisse)})")
    return 0 if verdict == "PASS" else 1


def _je_code(findings, limit):
    """Hoechstens `limit` Befunde je Code, in Reihenfolge des Auftretens."""
    gesehen = Counter()
    out = []
    for finding in findings:
        code = finding.get("code")
        if gesehen[code] >= limit:
            continue
        gesehen[code] += 1
        out.append(finding)
    return out


def cmd_findings(args):
    """Die Befundtexte eines Codes fuer benannte Emittenten - WARUM, nicht nur wie oft.

    UNPLACEABLE_PERIOD=6 sagt, dass sechs Perioden nicht zugeordnet
    wurden. Der Befundtext sagt, WELCHE und WESHALB - und erst der
    entscheidet, ob der Kalender, das Formular oder die Einreichung das
    Problem ist. Streamt einzeln; haelt nie zwei Factbooks.
    """
    store = JsonFactStore(compress=True)
    gewollt = None
    if args.ciks_file:
        payload = json.loads(Path(args.ciks_file).read_text(encoding="utf-8"))
        gewollt = set(payload.get(args.ciks_key) if args.ciks_key else payload)
    ciks = [c for c in store.list_companies() if gewollt is None or c in gewollt]
    if args.ciks:
        ciks = [c.strip() for c in args.ciks.split(",") if c.strip()]
    out = []
    for cik in ciks:
        document = store.read_company(cik)
        if document is None:
            continue
        name = ((document.get("profile") or {}).get("name") or "")[:40]
        calendar = document.get("calendar") or {}
        stats = document.get("stats") or {}
        treffer = [f for f in (document.get("quality") or {}).get("findings") or []
                   if not args.code or f.get("code") == args.code]
        forms = Counter((f.get("form") or "?") for f in document.get("filing_index") or [])
        row = {"cik": cik, "name": name, "latestForm": (document.get("latest_filing") or {}).get("form"),
               "filingForms": dict(forms), "rawFacts": stats.get("raw_facts"),
               "mapped": stats.get("mapped"), "unmapped": stats.get("unmapped"),
               "timelines": len((document.get("factbook") or {}).get("timelines") or []),
               "fiscalYearEnd": (document.get("profile") or {}).get("fiscal_year_end"),
               "calendarYears": len(calendar.get("fiscal_years") or []),
               "findingCodes": dict(Counter(f.get("code") for f in treffer)),
               # --limit je CODE, nicht je Emittent: die ersten acht Befunde
               # eines jungen Emittenten sind alle UNKNOWN_CONCEPT, und die
               # UNPLACEABLE_PERIOD dahinter - die eigentliche Ursache -
               # kam nie in die Stichprobe.
               "findings": [{k: f.get(k) for k in ("code", "message", "concept", "end", "form",
                                                    "fiscal_year", "fiscal_period")}
                            for f in _je_code(treffer, args.limit)]}
        out.append(row)
        print(f"  {cik} {name:<40} {row['latestForm'] or '-':<6} roh={row['rawFacts']} "
              f"gemappt={row['mapped']} zeitreihen={row['timelines']} kal={row['calendarYears']}J "
              f"FYE={row['fiscalYearEnd']} formulare={dict(forms)}")
        for f in row["findings"][:args.limit]:
            print(f"      {f['code']}: {f['message']}  [{f.get('concept') or ''} {f.get('end') or ''} {f.get('form') or ''}]")
        document = None
    if args.out:
        _write(Path(args.out), {"schema_version": 1, "generated_at_utc": _utcnow(),
                                "code": args.code, "issuers": out})
    return 0


def cmd_reconcile(args):
    """Abgleich Fundamentals x Marktdaten (§3-§10 des Reconciliation-Auftrags).

    Marktdaten werden READ-ONLY konsumiert: dieser Befehl laedt keine
    Kurse, veraendert R2 nicht und rechnet keine Eligibility neu. Was er
    braucht, steht in quant/data/universe/market-capability.json, und die
    erzeugt der Node-Indexlauf aus den Gate-Berichten.
    """
    from quant.sec import reconciliation

    registry = MetricRegistry.load()
    members = reconciliation.load_product_members(ROOT)
    if not members:
        raise SystemExit(
            "Kein Produktuniversum unter quant/data/universe/instruments. "
            "Erst node scripts/universe/build-company-master.mjs.")
    if reconciliation.load_market_capability(ROOT) is None:
        raise SystemExit(
            "quant/data/universe/market-capability.json fehlt - ohne die "
            "Marktdaten je Mitglied waere jede Schnittmenge geraten. "
            "Erst node scripts/universe/build-universe-indexes.mjs.")

    payloads, records = reconciliation.build_reconciliation(
        ROOT, registry=registry, today=args.today or date.today().isoformat(),
        min_years=args.min_years)

    out = ROOT / "quant" / "data" / "fundamentals"
    now = _utcnow()
    for name, payload in payloads.items():
        payload["generatedAtUtc"] = now
        _write(out / name, payload)

    o = payloads["reconciliation.json"]["overlap"]
    b = payloads["backtest-readiness.json"]
    g = payloads["gap-classification.json"]
    print(f"  Produkttitel:                {o['PRODUCT_TITLES']}")
    print(f"  Kurshistorie (verbindbar):   {o['MARKET_HISTORY_AVAILABLE']}")
    print(f"  Technisch gedeckt:           {o['TECHNICAL_COVERED']}")
    print(f"  Fundamentaldaten:            {o['FUNDAMENTAL_COMPANY_FACTS_AVAILABLE']}")
    print(f"  Technical UND Fundamental:   {o['TECHNICAL_AND_FUNDAMENTAL']}")
    print(f"  PIT + Technical + Kurse:     {o['PIT_TECHNICAL_AND_HISTORICAL_PRICE']}")
    print(f"  Backtestfaehig (PIT):        {b['BACKTEST_PIT_FUNDAMENTAL_READY']}")
    print(f"  davon 10 Jahre:              {b['BACKTEST_10Y_READY']}")
    for zustand, anzahl in g["byRecoverability"].items():
        print(f"  Luecken {zustand:<28} {anzahl}")
    return 0


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
    _write_universe_reports(reports, registry)
    return 0


def _write_universe_reports(reports, registry):
    """Berichte und Emittenten-Scherben schreiben - vom vollen wie vom taeglichen Lauf."""
    from quant.sec import universe_coverage

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
    shards = universe_coverage.write_issuer_shards(ROOT, reports["perIssuer"])

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
            "shards": shards,
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
    ciks = _ciks_from_universe(getattr(args, "universe", None))
    if getattr(args, "ciks", None):
        # Der taegliche Lauf frischt nur die Buendel der Emittenten auf, die
        # ein neues Filing hatten - und nur, wenn sie bereits ein Buendel im
        # Repository haben. Ohne diese Grenze schriebe der Lauf 5.400 mal
        # 400 KB.
        gewollt = {normalize_cik(c) for c in args.ciks.split(",") if c.strip()}
        ciks = sorted(gewollt if ciks is None else (set(ciks) & gewollt))
    documents = _documents(store, ciks=ciks)
    if not documents:
        print("no ingested companies found; run `ingest` first")
        return 2
    declared = _declared_tickers()
    index, written = [], set()
    nur_vorhandene = bool(getattr(args, "only_existing", False))
    for document in documents:
        ticker = _canonical_ticker(document, declared)
        if nur_vorhandene and not (CANONICAL_DIR / f"{ticker}.json").exists():
            continue
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
    if nur_vorhandene:
        # Selektiv aufgefrischt: Index und Bestand bleiben, nur die
        # geschriebenen Buendel sind neu.
        print(f"  {len(written)} kanonische Buendel aufgefrischt (nur vorhandene)")
        return 0
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
        for document in _iter_documents(store):
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


def cmd_concept_census(args):
    """Measure which XBRL concepts the product universe actually tags.

    WHY THIS EXISTS

    `total_debt` covers 2,645 of 5,068 exported issuers, and that one number
    holds back `profitability.roicTtm` (58), `profitability.roicMedian3y`
    (535), `quality.netDebtToAssets` (462) and `value.salesYield` (97) in the
    Quant 2.0 factor evidence. The registry maps `total_debt` to exactly two
    concepts, and one of them - DebtLongtermAndShorttermCombinedAmount - is an
    optional combined disclosure that most US filers simply do not tag.

    The obvious repair is to widen the concept list. The obvious repair is
    also how a fundamentals layer quietly starts meaning something else, so
    it is not done by guessing which tags issuers use. This command counts
    them. It writes a report and changes no published value, no mapping and
    no metric: what to do with the numbers is a decision, and this only makes
    sure the decision is taken against measurement.

    Presence is counted per issuer, not per fact - "how many companies could
    this concept serve", not "how many rows does it have".
    """
    import re
    from quant.sec.consumer import load_product_universe_ciks

    registry = MetricRegistry.load()
    provider = SECProvider()
    by_cik, _ = load_product_universe_ciks(Path(args.names))
    wanted = set(by_cik)
    if args.limit:
        wanted = set(sorted(wanted)[:args.limit])

    metrics = [name.strip() for name in args.metrics.split(",") if name.strip()]
    mapped = {}
    for name in metrics:
        metric = registry.get(name)
        if metric is None:
            raise SystemExit(f"unknown metric '{name}'")
        for rule in metric.concepts:
            mapped.setdefault(rule.qualified, []).append(name)

    pattern = re.compile(args.pattern, re.IGNORECASE)
    issuers_with_mapped = Counter()
    issuers_with_concept = Counter()
    issuers_seen = 0

    source = (provider.iter_bulk_company_facts(ciks=wanted, archive_path=args.archive)
              if args.bulk or args.archive
              else ((cik, provider.get_company_facts(cik)) for cik in sorted(wanted)))

    for cik, payload in source:
        issuers_seen += 1
        here = set()
        for taxonomy, concepts in (payload.get("facts") or {}).items():
            for concept in (concepts or {}):
                key = f"{taxonomy}:{concept}"
                if key in mapped:
                    here.add(("mapped", key))
                elif pattern.search(concept):
                    here.add(("candidate", key))
        for kind, key in here:
            if kind == "mapped":
                issuers_with_mapped[key] += 1
            else:
                issuers_with_concept[key] += 1

    report = {
        "schema": "sec-concept-census-1.0.0",
        "generated_at_utc": _utcnow(),
        "metrics": metrics,
        "pattern": args.pattern,
        "issuers": issuers_seen,
        "mapped": [{"concept": key, "servesMetrics": mapped[key], "issuers": issuers_with_mapped.get(key, 0)}
                   for key in sorted(mapped, key=lambda k: -issuers_with_mapped.get(k, 0))],
        "unmapped": [{"concept": key, "issuers": count}
                     for key, count in issuers_with_concept.most_common(args.top)],
        "note": ("Presence per issuer, not per fact. An unmapped concept with high coverage is a "
                 "candidate, not a decision: adding it changes what an existing published metric "
                 "means, and that is a methodology change with its own version."),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    _write(out, report)
    print(f"  {issuers_seen} Emittenten gemessen, Bericht: {out}")
    for row in report["mapped"]:
        print(f"    mapped    {row['issuers']:>5}  {row['concept']}  -> {', '.join(row['servesMetrics'])}")
    for row in report["unmapped"][:args.top]:
        print(f"    candidate {row['issuers']:>5}  {row['concept']}")
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
    if args.bulk or args.archive:
        # --archive liest eine lokale Kopie, statt das mehrere Gigabyte
        # grosse Sammelarchiv ein zweites Mal zu holen. Ohne sie streamt
        # dieser Lauf es und legt nichts ab; ein nachfolgender Schritt, der
        # dieselben Daten messen will, faende dann keine Datei vor - genau
        # das liess den Konzept-Zensus in Lauf 35862972083 auflaufen.
        source = provider.iter_bulk_company_facts(ciks=wanted, archive_path=args.archive)
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
                                    "versions": version_stamp(registry.version),
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
    retry.add_argument("--reset-attempts", action="store_true",
                       help="Versuchszaehler zuruecksetzen - sonst bleiben Emittenten nach "
                            "drei Fehlversuchen fuer immer in der Schlange")
    retry.add_argument("--out", default=str(ROOT / "quant" / "data" / "fundamentals" / "retry-run.json"))
    retry.set_defaults(func=cmd_retry)

    export = subparsers.add_parser("export", help="write the data inspector views")
    export.add_argument("--as-of")
    export.add_argument("--annual-years", type=int, default=12)
    export.add_argument("--quarterly-years", type=int, default=5)
    export.add_argument("--policy", choices=POLICIES, default=POLICY_LATEST_KNOWN)
    export.add_argument("--universe",
                        help="nur die Emittenten dieser Universumsdatei; ohne Angabe alle")
    export.set_defaults(func=cmd_export)

    con = subparsers.add_parser(
        "concepts", help="unbekannte XBRL-Konzepte im Bestand zaehlen")
    con.add_argument("--top", type=int, default=60)
    con.add_argument("--only-unresolved", action="store_true",
                     help="nur Emittenten ohne einen einzigen aufloesbaren Wert")
    con.add_argument("--without-metric",
                     help="nur Emittenten MIT Werten, aber OHNE diese Kennzahl "
                          "(z. B. revenue: Banken, Versicherer, REITs)")
    con.add_argument("--out", help="Ergebnis zusaetzlich als JSON schreiben")
    con.add_argument("--ciks-file", help="JSON mit einer CIK-Liste - nur diese Emittenten")
    con.add_argument("--ciks-key", help="Schluessel in --ciks-file, unter dem die Liste steht")
    con.add_argument("--sic", help="SIC-Spannen, z. B. 6020-6036,6021 - nur diese Emittenten")
    con.set_defaults(func=cmd_concepts)

    dl = subparsers.add_parser("daily", help="taeglicher Incremental-Lifecycle: nur neue/geaenderte Filings")
    dl.add_argument("--universe", default=str(ROOT / "quant" / "data" / "universe" / "sec-universe.json"))
    dl.add_argument("--since", help="ersten Indextag erzwingen (YYYY-MM-DD); Standard: letzter Check")
    dl.add_argument("--ciks", help="nur diese CIKs verarbeiten (Recovery / Test), kommagetrennt")
    dl.add_argument("--dry-run", action="store_true", help="nur erkennen, nichts holen")
    dl.set_defaults(func=cmd_daily)

    dd = subparsers.add_parser("daily-downstream",
                               help="nach Persistenz und Reload: Scherben, Aggregate, Abgleich, Manifest, Health Report")
    dd.set_defaults(func=cmd_daily_downstream)

    fr = subparsers.add_parser("final-report", help="Abschlussbericht §25/§26 aus den Artefakten rendern")
    fr.add_argument("--out", default=str(ROOT / "docs" / "VU_SEC_FINAL_RECOVERY_REPORT.md"))
    fr.set_defaults(func=cmd_final_report)

    vr = subparsers.add_parser(
        "verify-reload", help="zurueckgeladene Factbooks kanonisch ableiten und vergleichen")
    vr.add_argument("--reload-dir", default=str(ROOT / ".sec-reload" / "facts"))
    vr.add_argument("--ciks", help="Komma-Liste; Standard: alles im Reload-Verzeichnis")
    vr.add_argument("--local-dir", help="lokaler Faktenspeicher (Standard: quant/data/sec/facts)")
    vr.add_argument("--out", help="Berichtspfad (Standard: quant/data/fundamentals/reload-verification.json)")
    vr.set_defaults(func=cmd_verify_reload)

    fi = subparsers.add_parser("findings", help="Befundtexte je Emittent - warum, nicht nur wie oft")
    fi.add_argument("--code", help="nur dieser Befundcode, z. B. UNPLACEABLE_PERIOD")
    fi.add_argument("--ciks", help="Komma-Liste")
    fi.add_argument("--ciks-file"); fi.add_argument("--ciks-key")
    fi.add_argument("--limit", type=int, default=6)
    fi.add_argument("--out")
    fi.set_defaults(func=cmd_findings)

    rec = subparsers.add_parser(
        "reconcile", help="Fundamentals gegen das Marktdaten-/Technical-Universum abgleichen")
    rec.add_argument("--today", help="Stichtag fuer die Alterspruefung junger Notierungen")
    rec.add_argument("--min-years", type=int, default=3,
                     help="Jahreshistorie, ab der ein Titel als gedeckt gilt (Standard 3)")
    rec.set_defaults(func=cmd_reconcile)

    cov = subparsers.add_parser("coverage", help="build the coverage matrix")
    cov.add_argument("--universe",
                     help="nur die Emittenten dieser Universumsdatei; ohne Angabe alle")
    cov.set_defaults(func=cmd_coverage)

    gate = subparsers.add_parser("gates", help="run the qualification gates")
    gate.add_argument("--as-of")
    gate.add_argument("--universe",
                      help="nur die Emittenten dieser Universumsdatei; ohne Angabe alle")
    gate.set_defaults(func=cmd_gates)

    resolve = subparsers.add_parser(
        "resolve", help="diagnose what each configured ticker resolves to at the SEC")
    resolve.add_argument("--universe", default=str(DEFAULT_UNIVERSE))
    resolve.add_argument("--strict", action="store_true",
                         help="exit non-zero when a configured CIK disagrees with the SEC")
    resolve.set_defaults(func=cmd_resolve)

    canonical = subparsers.add_parser(
        "canonical", help="write the canonical FundamentalFact/Filing payload")
    canonical.add_argument("--ciks", help="nur diese CIKs (kommagetrennt), z. B. aus dem Daily-Manifest")
    canonical.add_argument("--only-existing", action="store_true",
                           help="nur Buendel neu schreiben, die schon unter quant/data/sec/canonical liegen")
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

    consumer = subparsers.add_parser("consumer", help="compact consumer fundamentals for the product universe")
    consumer.add_argument("--names", default=str(ROOT / "quant" / "data" / "market" / "security-master" / "company-names.json"))
    consumer.add_argument("--out", default=str(DATA_DIR / "consumer"))
    consumer.add_argument("--as-of")
    consumer.add_argument("--bulk", action="store_true", help="read companyfacts.zip (one request) instead of per-company calls")
    consumer.add_argument("--archive", help="local companyfacts.zip instead of fetching; implies --bulk")
    consumer.add_argument("--ciks", help="comma-separated CIK subset")
    consumer.add_argument("--limit", type=int)
    consumer.add_argument("--annual-years", type=int, default=consumer_module.DEFAULT_ANNUAL_YEARS)
    consumer.add_argument("--quarters", type=int, default=consumer_module.DEFAULT_QUARTERS)
    consumer.add_argument("--keep-stale", action="store_true")
    consumer.set_defaults(func=cmd_consumer)

    census = subparsers.add_parser("concept-census",
                                   help="measure which XBRL concepts the product universe tags (report only)")
    census.add_argument("--names", default=str(ROOT / "quant" / "data" / "market" / "security-master" / "company-names.json"))
    census.add_argument("--metrics", default="total_debt,long_term_debt",
                        help="comma-separated registry metrics whose mapped concepts are counted")
    census.add_argument("--pattern", default=r"debt|borrow|notespayable|capitallease|financelease",
                        help="regular expression for unmapped concepts worth counting")
    census.add_argument("--bulk", action="store_true", help="read companyfacts.zip (one request)")
    census.add_argument("--archive", help="local companyfacts.zip instead of fetching")
    census.add_argument("--limit", type=int)
    census.add_argument("--top", type=int, default=30)
    census.add_argument("--out", default=str(DATA_DIR / "concept-census.json"))
    census.set_defaults(func=cmd_concept_census)

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
