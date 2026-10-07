#!/usr/bin/env python3
"""Opt-in runner. All writes confined to the dedicated working store/export directory."""
import argparse
import json
import logging
from urllib.parse import urlsplit
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.model import load_universe, SCHEMA
from company_intelligence.store import Store, atomic_json
from company_intelligence.transport import PublicHTTP, BudgetExhausted, SourceError
from company_intelligence.pipeline import Pipeline, utcnow, log
from company_intelligence.discovery import wikidata_sites, wikidata_catalogue, validate_candidate


def select(companies, tickers=None, limit=25, cursor=None):
    if tickers:
        requested = set(tickers.upper().split(','))
        result = [c for c in companies.values() if requested & {l['symbol'] for l in c['listings']}]
        found = {l['symbol'] for c in result for l in c['listings']}
        if requested - found:
            raise ValueError('TICKERS_NOT_IN_SUPPORTED_UNIVERSE:' + ','.join(sorted(requested - found)))
        # Duplicate listing symbols across different companies must not silently choose one.
        for symbol in requested:
            if sum(any(l['symbol'] == symbol for l in c['listings']) for c in result) > 1:
                raise ValueError('AMBIGUOUS_TICKER:' + symbol)
        return sorted(result, key=lambda c: c['companyId'])[:limit]
    return [c for cid, c in sorted(companies.items()) if not cursor or cid > cursor][:limit]


def manifest_batch(document, companies, store, now, limit, tickers=None):
    from company_intelligence.model import ACCESSION
    from company_intelligence.earnings import valid_date
    if document.get('STATUS') != 'SUCCESS' or not valid_date(document.get('RUN_DATE')) or document['RUN_DATE'] > now[:10] or not isinstance(document.get('UPDATED_ISSUERS'), list):
        raise ValueError('INVALID_UPDATED_ISSUER_MANIFEST')
    seen = store.state('updatedIssuerCheckpoints', {})
    pending = store.state('updatedIssuerPending', {})
    prior_date = store.state('updatedManifestDate', '')
    for row in document['UPDATED_ISSUERS'] if document['RUN_DATE'] >= prior_date else []:
        cid, accn = row.get('issuerId'), row.get('latestAccession')
        if cid not in companies:
            continue
        if row.get('cik') != companies[cid].get('cik') or not isinstance(accn, str) or not ACCESSION.fullmatch(accn):
            raise ValueError('UPDATED_ISSUER_IDENTITY_MISMATCH')
        if seen.get(cid) != accn:
            pending[cid] = accn
    store.set_state('updatedIssuerPending', pending)
    store.set_state('updatedManifestDate', max(prior_date, document['RUN_DATE']))
    eligible = {cid: companies[cid] for cid in pending if cid in companies and (store.state('sec:' + cid, {}).get('retryAfter') or '') <= now}
    return select(eligible, tickers, limit) if tickers else select(eligible, limit=limit), pending


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['run', 'backfill', 'export', 'quality', 'probe', 'coverage', 'discover-catalogue', 'discover-backfill', 'verify-domains', 'sweep-inventory', 'news-archive', 'news-backfill', 'events-backfill', 'materials-backfill', 'sec-stream', 'poll', 'profile-backfill'])
    p.add_argument('--inventory-pass',help='Stable lower-case identifier for resumable candidate discovery')
    p.add_argument('--inventory-lane',choices=['domains','ir'],default='domains')
    p.add_argument('--discovery-admission-interval',type=float,default=2,help='Discovery-only spacing across independent hosts (.5..2 seconds); host cooldowns remain enforced')
    p.add_argument('--archive-month', help='Explicit YYYY-MM publisher-advertised archive; bounded weekly/backfill metadata lane')
    p.add_argument('--stream-days', type=int, default=3, help='Bounded completed EDGAR index days per material stream run (1..5)')
    p.add_argument('--stream-history-days', type=int, default=180, help='Initial submission import horizon for the incremental stream (30..366); retained history is preserved')
    p.add_argument('--root', type=Path, default=ROOT)
    p.add_argument('--state', type=Path)
    p.add_argument('--out', type=Path)
    p.add_argument('--tickers')
    p.add_argument('--source-tickers', help='Limit feed sources to master tickers without filtering the global SEC stream')
    p.add_argument('--all-offline', action='store_true', help='Project existing facts for the entire master, without external requests')
    p.add_argument('--updated-issuers', type=Path, help='Consume the existing SEC daily updated-issuer manifest without fetching a universe')
    p.add_argument('--limit', type=int, default=25)
    p.add_argument('--request-budget', type=int, default=60)
    p.add_argument('--max-seconds', type=int, default=600)
    p.add_argument('--news-backfill-include-covered', action='store_true', help='Explicit one-time recovery of verified unpolled feeds even when publisher news already covers the issuer')
    p.add_argument('--source-backfill-run', default='unpolled-news', help='Frozen existing-news-source cohort identity')
    p.add_argument('--force-sources', action='store_true', help='Recheck selected sources without changing their normal scheduling interval')
    p.add_argument('--network', action='store_true', help='Explicitly enable configured public feeds')
    p.add_argument('--sec-documents', action='store_true', help='Inspect up to two recent SEC candidate primary documents/exhibits per selected issuer')
    p.add_argument('--sec-document-issuers', type=int, default=2, help='Maximum issuers receiving optional document inspection in a run (0..10)')
    p.add_argument('--sec-fetch', action='store_true', help='Refresh selected issuer submissions through existing SEC client')
    p.add_argument('--discover-ir', action='store_true')
    p.add_argument('--discovery-workers', type=int, default=1, help='Inventory backfill only: 1..8 independent hosts under one total request budget')
    p.add_argument('--materials', action='store_true', help='Inspect one official call/event material page per selected issuer')
    p.add_argument('--discover-sites', action='store_true', help='Exact CIK Wikidata candidates, automatically used only if unique')
    p.add_argument('--gdelt', action='store_true', help='Optional, unreliable discovery metadata')
    args = p.parse_args(argv)
    if args.news_backfill_include_covered and args.command != 'news-backfill':
        p.error('--news-backfill-include-covered requires news-backfill')
    if not 1 <= args.limit <= 100 or not 1 <= args.request_budget <= 200 or not 30 <= args.max_seconds <= 1800:
        p.error('limit must be 1..100; request budget 1..200; max seconds 30..1800')
    if not 1 <= args.discovery_workers <= 8 or (args.discovery_workers > 1 and args.command not in ('discover-backfill', 'verify-domains','sweep-inventory')):
        p.error('discovery-workers must be 1..8 and requires discover-backfill')
    if args.all_offline and (args.network or args.tickers):
        p.error('--all-offline requires offline full-universe mode')
    if not .5<=args.discovery_admission_interval<=2 or (args.discovery_admission_interval!=2 and args.command!='sweep-inventory'):
        p.error('discovery admission override requires sweep-inventory and .5..2 seconds')
    if args.command=='sweep-inventory':
        if args.tickers or args.source_tickers or args.sec_fetch or args.updated_issuers or args.all_offline or args.gdelt or args.materials or args.force_sources:
            p.error('sweep-inventory uses its frozen candidate inventory and discovery budget; separate SEC/poll commands are required')
        from company_intelligence.inventory_sweep import prefix
        try:prefix(args.inventory_pass,args.inventory_lane)
        except ValueError:p.error('sweep-inventory requires a safe --inventory-pass identifier')
    if args.command in ('discover-catalogue', 'verify-domains', 'sweep-inventory', 'news-archive', 'news-backfill', 'events-backfill', 'materials-backfill') and not args.network:
        p.error('discover-catalogue requires --network')
    if args.command == 'discover-backfill' and not (args.network and args.discover_sites and args.discover_ir):
        p.error('discover-backfill requires --network --discover-sites --discover-ir')
    if args.sec_documents and not args.sec_fetch:
        p.error('--sec-documents requires --sec-fetch')
    if not 0 <= args.sec_document_issuers <= 10:
        p.error('sec-document-issuers must be 0..10')
    if (args.sec_fetch or args.discover_ir or args.discover_sites or args.gdelt or args.force_sources or args.materials) and not args.network:
        p.error('network flags require --network')
    if args.sec_fetch and args.limit > args.request_budget:
        p.error('SEC metadata issuer limit exceeds request budget')
    if not 1 <= args.stream_days <= 5 or (args.command == 'sec-stream' and (not args.network or not args.sec_fetch or args.tickers or args.updated_issuers or args.all_offline)):
        p.error('sec-stream requires --network --sec-fetch, no ticker/manifest filters, and stream-days 1..5')
    if not 30 <= args.stream_history_days <= 366:
        p.error('stream-history-days must be 30..366')
    if args.source_tickers and args.command not in ('poll', 'sec-stream'):
        p.error('source-tickers is only supported for poll and sec-stream')
    root = args.root.resolve()
    state_dir = (args.state or root / '.company-intelligence').resolve()
    if args.command == 'profile-backfill' and not (state_dir / 'state.sqlite').is_file():
        p.error('PROFILE_BACKFILL_REQUIRES_EXISTING_LEDGER: restore the durable checkpoint first; no replacement state will be initialized')
    output = (args.out or state_dir / 'public/company-intelligence/data').resolve()
    # Reject exports into protected producers or repository source trees.
    protected = [root / name for name in ('quant', 'discover', 'supertrader', 'screener', 'dashboard', 'scripts', 'api', 'server', '.git', '.github')]
    if any(output == path or output.is_relative_to(path) or state_dir == path or state_dir.is_relative_to(path) for path in protected) or output == root or state_dir == root:
        p.error('state/output must not overwrite protected repository paths')
    companies = load_universe(root)
    source_tickers = args.source_tickers or (args.tickers if args.command == 'poll' else None)
    source_scope = {c['companyId'] for c in select(companies, source_tickers, len(companies))} if source_tickers else None
    state_dir.mkdir(parents=True, exist_ok=True)
    import fcntl
    lock = (state_dir / 'run.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise ValueError('ANOTHER_INTELLIGENCE_RUN_IS_ACTIVE')
    store = Store(state_dir / 'state.sqlite')
    import time
    started = time.monotonic()
    now = utcnow()
    try:
        if args.command == 'quality':
            print(json.dumps(store.quality(now, companies), sort_keys=True))
            return 0
        cursor = store.state('backfillCursor') if args.command == 'backfill' and not args.tickers else None
        selected = [] if args.command == 'poll' else list(companies.values()) if args.all_offline else select(companies, args.tickers, args.limit, cursor)
        if not selected and cursor:
            store.set_state('backfillCursor', None)
            selected = select(companies, args.tickers, args.limit)
        manifest_pending = None
        if args.updated_issuers:
            document = json.loads(args.updated_issuers.read_text())
            selected, manifest_pending = manifest_batch(document, companies, store, now, args.limit, args.tickers)
        if args.command == 'backfill' and not args.tickers and manifest_pending is None:
            retries = [c for c in companies.values() if min(store.state('sec:' + c['companyId'], {}).get('retryAfter') or '9999', store.state('ir:' + c['companyId'], {}).get('retryAfter') or '9999') <= now]
            selected = sorted({c['companyId']: c for c in retries + selected}.values(), key=lambda c: (c not in retries, c['companyId']))[:args.limit]
        if args.command == 'backfill' and not args.tickers and manifest_pending is None:
            pending_ids = store.state('irPending', []) + store.state('secPending', [])
            pending = [companies[cid] for cid in pending_ids if cid in companies]
            selected = list({c['companyId']: c for c in pending + selected}.values())[:args.limit]
        sec_budget = min(args.request_budget // 2 if args.sec_documents else args.request_budget - 1, len(selected) * (10 if args.sec_documents else 2)) if args.sec_fetch else 0
        if args.command == 'sec-stream':
            sec_budget = min(args.request_budget - 8, args.limit + args.stream_days + 4 * args.sec_document_issuers + 1) if args.sec_documents else args.request_budget - 8
            if sec_budget < args.limit + args.stream_days:
                p.error('sec-stream request budget must cover issuer batch, index days and eight feed requests')
        http = PublicHTTP(state_dir / 'http', budget=max(1, args.request_budget - sec_budget), max_seconds=args.max_seconds)
        pipeline = Pipeline(root, companies, store, http, now)
        deferred = False
        selected_ids = {c['companyId'] for c in selected}
        config_dir = root / 'company-intelligence/config'
        profile_catalogue = config_dir / 'company-profiles.json'
        if profile_catalogue.is_file():
            from company_intelligence.profile_catalogue import seed as seed_profiles
            seed_profiles(store, companies, json.loads(profile_catalogue.read_text()), now)
        sites = json.loads((config_dir / 'official-sites.json').read_text())
        for company in companies.values():
            seeded = sites.get(company['cik'])
            if seeded:
                company['officialSites'] = [seeded.get('irHomepage') or seeded['url']]
            else:
                verified = store.state('officialSite:' + company['companyId'], {})
                if verified.get('status') == 'VALIDATED':
                    company['officialSites'] = [verified['url']]
        if args.command == 'profile-backfill':
            from company_intelligence.profile_backfill import run as profile_run
            from company_intelligence.coverage import report as coverage_report
            cohort = selected if args.tickers else list(companies.values())
            result = profile_run(pipeline, cohort, sites, args.network, args.sec_fetch,
                                 len(cohort) if args.all_offline else args.limit, args.max_seconds, sec_budget)
            exported = store.export(companies, output, now)
            coverage = coverage_report(store, companies, now)
            atomic_json(state_dir / 'coverage.json', coverage)
            report = {'schema': SCHEMA, 'generatedAt': now, 'profiles': result, 'export': exported,
                      'coverage': {k: v for k, v in coverage.items() if k != 'companies'}}
            atomic_json(state_dir / 'latest-run.json', report)
            print(json.dumps(report, sort_keys=True))
            return 0
        if args.command in ('discover-backfill', 'discover-catalogue', 'verify-domains','sweep-inventory'):
            from company_intelligence.site_inventory import import_inventory
            import_inventory(root, companies, store, now)
        if args.command=='sweep-inventory':
            from company_intelligence.inventory_sweep import select as sweep_select,record,progress
            from company_intelligence.discovery_circuit import DiscoveryCircuit
            from company_intelligence.pipeline import advance
            from company_intelligence.discovery_batch import run as discover_batch,persist
            # Corporate-domain and IR/source requests have distinct routes.
            # Each lane keeps the same bounded failure threshold and cooldown;
            # an unavailable IR family must not erase a healthy domain lane.
            # Honor legacy unscoped cooldowns until they expire during migration.
            circuit_key='discoveryCircuit:'+args.inventory_lane
            prior_circuit=store.state(circuit_key,store.state('discoveryCircuit',{}))
            if prior_circuit.get('open') and prior_circuit.get('retryAfter','')>now:
                # Finish deterministic local classifications while preserving
                # pending network work and the original circuit due time.
                sweep_select(companies,store,now,args.inventory_pass,args.inventory_lane,args.limit,allow_network=False)
                print(json.dumps({'progress':progress(store,args.inventory_pass,args.inventory_lane),
                                  'requests':0,'httpStats':http.stats,'circuit':prior_circuit,
                                  'deferred':True,'stopReason':'CIRCUIT_COOLDOWN'},sort_keys=True))
                return 0
            circuit=DiscoveryCircuit()
            def save_circuit():
                value={**circuit.snapshot(),'checkedAt':now,'scope':args.inventory_lane}
                if value['open']:value['retryAfter']=advance(now,.25)
                store.set_state(circuit_key,value)
                return value
            selected,candidates=sweep_select(companies,store,now,args.inventory_pass,args.inventory_lane,args.limit)
            pipeline.ensure_aliases([c['companyId'] for c in selected])
            # Exact-CIK SEC legal aliases enrich verification without replacing master names.
            selected=[{**c,'names':pipeline.companies[c['companyId']]['names']} for c in selected]
            def checkpoint(result):
                persist([result],store,companies,now)
                record(result,store,now,args.inventory_pass,args.inventory_lane)
                save_circuit()
            results=discover_batch(selected,candidates,http,now,args.request_budget,args.max_seconds,args.discovery_workers,
                                   domain_only=args.inventory_lane=='domains',admission_interval=args.discovery_admission_interval,on_result=checkpoint,circuit=circuit)
            http.requests=sum(r['requests'] for r in results)
            for key in http.stats:http.stats[key]=sum(r['stats'].get(key,0) for r in results)
            circuit_state=save_circuit()
            if args.inventory_lane=='ir' and not circuit_state['open']:
                from .discovery_circuit import guarded_poll
                try:
                    with guarded_poll(http,circuit):
                        pipeline.ingest_due_sources({c['companyId'] for c in selected},include_global=False)
                except BudgetExhausted:deferred=True
                circuit_state=save_circuit()
            http.prune()
            print(json.dumps({'progress':progress(store,args.inventory_pass,args.inventory_lane),
                              'requests':http.requests,'httpStats':http.stats,'run':pipeline.run,
                              'deferred':deferred or circuit_state['open'],'circuit':circuit_state,
                              'stopReason':'CIRCUIT_OPEN' if circuit_state['open'] else 'BATCH_COMPLETED' if results else 'NO_DUE_CANDIDATES'},sort_keys=True))
            return 0
        if args.command=='news-archive':
            import re
            if not args.archive_month or not re.fullmatch(r'\d{4}-(?:0[1-9]|1[0-2])',args.archive_month) or not '2000-01'<=args.archive_month<=now[:7]:p.error('news-archive requires a valid non-future --archive-month YYYY-MM')
            if (state_dir/'stop-source-backfill').exists():
                print(json.dumps({'run':pipeline.run,'requests':0,'httpStats':http.stats,
                                  'checkpoint':store.state('distributorArchiveRun:gnn-archive-'+args.archive_month),
                                  'checkpointCurrentRun':False,'deferred':True,
                                  'stopReason':'OPERATOR_CHECKPOINT_PAUSE'},sort_keys=True))
                return 0
            source={'sourceId':'gnn-archive-'+args.archive_month,'url':'https://sitemaps.globenewswire.com/news/en/'+args.archive_month+'.xml',
                    'type':'RSS','format':'GNN_ARCHIVE','provider':'GLOBENEWSWIRE_ARTICLE','verified':False,'active':False,'intervalHours':168,'batchSize':args.limit,
                    'metadata':{'access':'Publisher robots-advertised public archive/NewsArticle metadata; headline/date/link and bounded scheduling evidence only. Full article body cache deleted.',
                                'mode':'EXPLICIT_RESUMABLE_BACKFILL_NOT_FOUR_HOUR_POLL'}}
            # Explicit backfill may continue a healthy archive before its normal
            # weekly interval. Publisher failures still retain their due time
            # and cumulative failure count across fresh CLI invocations.
            source=store.source(source)
            if source.get('failureCount') and (source.get('nextCheck') or '')>now:
                print(json.dumps({'run':pipeline.run,'requests':0,'httpStats':http.stats,
                                  'checkpoint':store.state('distributorArchiveRun:'+source['sourceId']),
                                  'checkpointCurrentRun':False,
                                  'deferred':True,'stopReason':'SOURCE_COOLDOWN','retryAfter':source['nextCheck']},sort_keys=True))
                return 0
            prior_checkpoint=store.state('distributorArchiveRun:'+source['sourceId'])
            pipeline.ensure_aliases(companies.keys());pipeline.ingest_source(source)
            checkpoint=store.state('distributorArchiveRun:'+source['sourceId'])
            # Keep durable progress visible without reporting a preceding batch
            # as this attempt after a publisher/robots failure.
            current=bool(checkpoint and checkpoint!=prior_checkpoint and checkpoint.get('checkedAt')==now)
            print(json.dumps({'run':pipeline.run,'requests':http.requests,'httpStats':http.stats,
                              'checkpoint':checkpoint,'checkpointCurrentRun':current},sort_keys=True));return 0
        if args.command=='news-backfill':
            if (state_dir/'stop-source-backfill').exists():
                print(json.dumps({'attemptedSources':0,'run':pipeline.run,'requests':0,
                                  'httpStats':http.stats,'stopReason':'OPERATOR_CHECKPOINT_PAUSE'},sort_keys=True))
                return 0
            pipeline.seed_sources(json.loads((config_dir / 'sources.json').read_text()))
            from company_intelligence.news_backfill import backfill
            print(json.dumps(backfill(pipeline,args.limit,args.source_backfill_run,selected_ids if args.tickers else None,include_covered=args.news_backfill_include_covered),sort_keys=True))
            return 0
        if args.command=='events-backfill':
            if (state_dir/'stop-source-backfill').exists():
                print(json.dumps({'attemptedSources':0,'run':pipeline.run,'requests':0,
                                  'httpStats':http.stats,'stopReason':'OPERATOR_CHECKPOINT_PAUSE'},sort_keys=True))
                return 0
            pipeline.seed_sources(json.loads((config_dir / 'sources.json').read_text()))
            from company_intelligence.event_backfill import backfill
            print(json.dumps(backfill(pipeline,args.limit,args.source_backfill_run,selected_ids if args.tickers else None),sort_keys=True))
            return 0
        if args.command=='materials-backfill':
            if (state_dir/'stop-source-backfill').exists():
                print(json.dumps({'derivedSources':0,'run':pipeline.run,'requests':0,
                                  'httpStats':http.stats,'deferred':True,
                                  'stopReason':'OPERATOR_CHECKPOINT_PAUSE'},sort_keys=True))
                return 0
            from company_intelligence.materials import backfill
            print(json.dumps(backfill(pipeline,args.limit,selected_ids if args.tickers else None,companies),sort_keys=True));return 0
        if args.command == 'verify-domains':
            # Weekly candidate validation is separate from expensive IR discovery
            # and from four-hour feed ingestion. No financial/export rebuild.
            eligible = [c for c in (selected if args.tickers else companies.values()) if not c['officialSites']
                        and store.state('siteCandidates:' + c['companyId'], {}).get('status') == 'CANDIDATE'
                        and store.state('officialSite:' + c['companyId'], {}).get('retryAfter', '') <= now
                        and store.state('domainValidation:' + c['companyId'], {}).get('nextAttempt', '') <= now]
            eligible = sorted(eligible, key=lambda c: c['companyId'])[:args.limit]
            pipeline.ensure_aliases({c['companyId'] for c in eligible})
            from company_intelligence.discovery_batch import run as validate_domains, persist
            validation_companies=[{**c,'names':pipeline.companies[c['companyId']]['names']} for c in eligible]
            results = validate_domains(validation_companies, {c['companyId']:store.state('siteCandidates:' + c['companyId'], {}) for c in eligible},
                                       http, now, args.request_budget, args.max_seconds, args.discovery_workers, domain_only=True)
            persist(results, store, companies, now)
            report = {'generatedAt': now, 'domainValidation': results, 'publicRequests': sum(r['requests'] for r in results),
                      'httpStats': {k:sum(r['stats'].get(k, 0) for r in results) for k in http.stats},
                      'runtimeSeconds': round(time.monotonic()-started,3), 'interpretation':'Verified ownership only; IR/news coverage requires subsequent validated discovery and ingestion.'}
            atomic_json(state_dir / 'domain-validation.json', report)
            print(json.dumps(report, sort_keys=True))
            return 0
        if args.command == 'discover-backfill' and not args.tickers:
            # Per-candidate attempt state is a checkpoint separate from SEC/master.
            eligible = []
            for company in companies.values():
                cid = company['companyId']
                site = store.state('officialSite:' + cid, {})
                ir = store.state('ir:' + cid, {})
                candidate = store.state('siteCandidates:' + cid, {})
                if not company['officialSites']:
                    if candidate.get('status') == 'CANDIDATE' and site.get('retryAfter', '') <= now:
                        eligible.append(company)
                elif (ir.get('retryAfter') or ir.get('nextVerify') or '') <= now:
                    eligible.append(company)
            # Existing logo/IR platform hints prioritize discovery, never authorize
            # ingestion. Ownership still passes the same corporate validator.
            def discovery_priority(c):
                evidence = store.state('siteCandidates:' + c['companyId'], {}).get('candidates', [])
                hinted = any(r.get('platformHint') for r in evidence)
                ir_host = any(urlsplit(r.get('url', '')).hostname.split('.')[0] in ('ir', 'investor', 'investors') for r in evidence if urlsplit(r.get('url', '')).hostname)
                return (not hinted, not ir_host, c['companyId'])
            selected = sorted(eligible, key=discovery_priority)[:args.limit]
            selected_ids = {c['companyId'] for c in selected}
        inventory_results = None
        if args.command == 'discover-backfill' and args.discovery_workers > 1:
            from company_intelligence.discovery_batch import run as run_inventory, persist as persist_inventory
            candidates = {c['companyId']: store.state('siteCandidates:' + c['companyId'], {}) for c in selected}
            pipeline.ensure_aliases(selected_ids)
            discovery_companies = [{**c, 'names': pipeline.companies[c['companyId']]['names']} for c in selected]
            inventory_results = run_inventory(discovery_companies, candidates, http, now, args.request_budget, args.max_seconds, args.discovery_workers)
            persist_inventory(inventory_results, store, companies, now)
            deferred = any(r['status'] == 'DEFERRED' for r in inventory_results)
            pipeline.run['discoveryFailures'] += sum(r['status'] in ('REJECTED','DEGRADED') for r in inventory_results)
            http.requests = sum(r['requests'] for r in inventory_results)
            for r in inventory_results:
                for k, v in r['stats'].items(): http.stats[k] += v
            selected = [companies[r['companyId']] for r in inventory_results]
            selected_ids = {c['companyId'] for c in selected}
        for source in store.sources():
            if source['type'] == 'GDELT':
                store.source({**source, 'active': False})
        if args.command == 'coverage':
            from company_intelligence.coverage import report as coverage_report
            from company_intelligence.inventory_sweep import funnel
            result = coverage_report(store, companies, now)
            result['domainCandidateFunnel'] = funnel(store,result)
            atomic_json(state_dir / 'coverage.json', result)
            print(json.dumps({k: v for k, v in result.items() if k != 'companies'}, sort_keys=True))
            return 0
        if args.command == 'discover-catalogue':
            prior = store.state('catalogueDiscovery', {})
            from company_intelligence.pipeline import advance
            if prior.get('retryAfter', '') > now or (prior.get('lastSuccess') or prior.get('checkedAt') or '') > advance(now, -7 * 24):
                print(json.dumps({'status': 'NOT_DUE', 'publicRequests': 0}))
                return 0
            try:
                result = wikidata_catalogue(companies, http)
            except (SourceError, ValueError, KeyError, TypeError) as exc:
                store.set_state('catalogueDiscovery', {**prior, 'lastFailure': now, 'reason': str(exc)[:250], 'retryAfter': advance(now, 24)})
                store.audit(now, 'wikidata', 'CATALOGUE_DISCOVERY_FAILURE', reason=str(exc)[:250])
                print(json.dumps({'status': 'DEGRADED', 'publicRequests': http.requests, 'reason': str(exc)[:250]}))
                return 0  # Optional discovery cannot block known sources or SEC projection.
            for cid, evidence in result.items():
                prior_candidates = store.state('siteCandidates:' + cid, {}).get('candidates', [])
                from company_intelligence.model import domain
                merged = {domain(c['url']): c for c in prior_candidates + evidence['candidates']}
                status = 'NO_CANDIDATE' if not merged else 'CANDIDATE' if len(merged) == 1 else 'AMBIGUOUS'
                store.set_state('siteCandidates:' + cid, {'status': status, 'candidates': list(merged.values()), 'checkedAt': now})
            store.set_state('catalogueDiscovery', {'lastSuccess': now, 'checkedAt': now, 'issuersChecked': len(result), 'requests': http.requests})
            print(json.dumps({'issuersChecked': len(result), 'candidateIssuers': sum(bool(r['candidates']) for r in result.values()), 'publicRequests': http.requests}))
            return 0
        if args.command != 'export':
            if args.command == 'sec-stream':
                from company_intelligence.sec_stream import scan
                try:
                    stream = scan(store, companies, pipeline.sec_client(sec_budget), now, args.stream_days)
                    store.set_state('secStreamHealth', {'lastSuccess': now, **stream})
                    if stream['unresolvedIndexDays']:
                        pipeline.run['secFailures'] += 1
                except BudgetExhausted:
                    deferred = True
                except Exception as exc:
                    pipeline.run['secFailures'] += 1
                    store.set_state('secStreamHealth', {**store.state('secStreamHealth', {}), 'lastFailure': now, 'reason': str(exc)[:250]})
                    store.audit(now, 'sec-stream', 'SEC_STREAM_SCAN_FAILURE', reason=str(exc)[:250])
                pending_stream = store.state('secStreamPending', {})
                # An explicit pilot scope gets first use of its bounded SEC
                # batch; other pending work remains queued and can fill spare
                # capacity. Unscoped operation retains oldest-first ordering.
                selected = [companies[cid] for cid in sorted(pending_stream, key=lambda cid: (source_scope is not None and cid not in source_scope, pending_stream[cid]['filedAt'], cid)) if cid in companies and (store.state('sec:' + cid, {}).get('retryAfter') or '') <= now and pending_stream[cid].get('nextAttempt', '') <= now][:args.limit]
                selected_ids = {c['companyId'] for c in selected}
            if args.network and inventory_results is None:
                pipeline.seed_sources(json.loads((config_dir / 'sources.json').read_text()))
                try:
                    pipeline.ingest_due_sources(selected_ids if source_scope is None else source_scope, all_sources=source_scope is None and not args.tickers and args.command in ('run', 'backfill', 'discover-backfill', 'sec-stream', 'poll'), force=args.force_sources)
                except BudgetExhausted:
                    deferred = True
                    store.audit(now, 'runner', 'FEED_BUDGET_DEFERRED', requestBudget=args.request_budget)
            for index, company in enumerate(selected):
                failures_before = pipeline.run['secFailures']
                try:
                    from company_intelligence.pipeline import advance
                    pipeline.project_company(company, fetch_sec=args.sec_fetch, sec_documents=args.sec_documents and index < args.sec_document_issuers, sec_budget=sec_budget,
                                             filing_since=advance(now, -args.stream_history_days * 24)[:10] if args.command == 'sec-stream' else None)
                except BudgetExhausted:
                    store.set_state('secPending', [c['companyId'] for c in selected[index:]])
                    deferred = True
                    break
                pending = store.state('secPending', [])
                store.set_state('secPending', [cid for cid in pending if cid != company['companyId']])
                if manifest_pending is not None and args.sec_fetch and failures_before == pipeline.run['secFailures']:
                    cid = company['companyId']
                    seen = store.state('updatedIssuerCheckpoints', {})
                    seen[cid] = manifest_pending.pop(cid)
                    store.set_state('updatedIssuerCheckpoints', seen)
                    store.set_state('updatedIssuerPending', manifest_pending)
                if args.command == 'sec-stream' and failures_before == pipeline.run['secFailures']:
                    cid = company['companyId']
                    queued = store.state('secStreamPending', {})
                    columns = store.state('sec-submissions:' + cid, {}).get('filings', {}).get('recent', {})
                    if queued[cid]['latestAccession'] in columns.get('accessionNumber', []):
                        completed = store.state('secStreamCheckpoints', {})
                        completed[cid] = queued.pop(cid)
                        store.set_state('secStreamCheckpoints', completed)
                        store.set_state('secStreamPending', queued)
                    else:
                        from company_intelligence.pipeline import advance
                        queued[cid]['nextAttempt'] = advance(now, 6)
                        store.set_state('secStreamPending', queued)
                        store.audit(now, cid, 'SEC_STREAM_INDEX_ACCESSION_NOT_IN_SUBMISSIONS', filingId=queued[cid]['latestAccession'])
                if args.command == 'backfill' and not args.tickers and manifest_pending is None:
                    store.set_state('backfillCursor', max(company['companyId'], store.state('backfillCursor') or ''))
            if args.network and inventory_results is None:
                pipeline.seed_sources(json.loads((config_dir / 'sources.json').read_text()))
                if args.discover_ir:
                    store.set_state('irPending', list(dict.fromkeys(store.state('irPending', []) + [c['companyId'] for c in selected if c['officialSites']])))
                try:
                    # Existing feeds first; discovery is lower priority and cannot exhaust their request budget.
                    pipeline.ingest_due_sources(selected_ids if source_scope is None else source_scope, all_sources=source_scope is None and not args.tickers and args.command in ('run', 'backfill', 'discover-backfill', 'sec-stream', 'poll'), force=args.force_sources)
                    if args.discover_sites:
                        try:
                            candidates = {} if all(store.state('siteCandidates:' + c['companyId']) is not None for c in selected[:25]) else wikidata_sites(selected[:25], http)
                        except BudgetExhausted:
                            raise
                        except (SourceError, ValueError, KeyError, TypeError) as exc:
                            candidates = {}
                            store.audit(now, 'wikidata', 'OFFICIAL_SITE_DISCOVERY_FAILURE', reason=str(exc)[:250])
                            log('OFFICIAL_SITE_DISCOVERY_FAILURE', reason=str(exc)[:250])
                        store.set_state('officialSiteCandidates', candidates)
                        for company in selected:
                            candidate = candidates.get(company['cik']) or store.state('siteCandidates:' + company['companyId'], {})
                            prior_site = store.state('officialSite:' + company['companyId'], {})
                            if not args.force_sources and prior_site.get('retryAfter', '') > now:
                                continue
                            if not company['officialSites'] and candidate and candidate['status'] == 'CANDIDATE':
                                try:
                                    verified = validate_candidate(company, candidate['candidates'][0], http, now)
                                    company['officialSites'] = [verified['url']]
                                    store.set_state('officialSite:' + company['companyId'], verified)
                                    if args.discover_ir:
                                        store.set_state('irPending', list(dict.fromkeys(store.state('irPending', []) + [company['companyId']])))
                                        pipeline.discover_company(company, verified['url'])
                                except BudgetExhausted:
                                    raise
                                except SourceError as exc:
                                    from company_intelligence.pipeline import advance
                                    store.set_state('officialSite:' + company['companyId'], {'status': 'REJECTED', 'url': candidate['candidates'][0]['url'], 'lastChecked': now, 'reason': str(exc)[:250], 'retryAfter': advance(now, 7 * 24)})
                                    store.audit(now, company['companyId'], 'OFFICIAL_SITE_CANDIDATE_REJECTED', reason=str(exc)[:250])
                    if args.discover_ir:
                        for company in selected:
                            ir_state = store.state('ir:' + company['companyId'], {})
                            if not args.force_sources and (ir_state.get('retryAfter') or ir_state.get('nextVerify') or '') > now:
                                store.set_state('irPending', [cid for cid in store.state('irPending', []) if cid != company['companyId']])
                                continue
                            for site in company['officialSites'][:1]:
                                pipeline.discover_company(company, site)
                            store.set_state('irPending', [cid for cid in store.state('irPending', []) if cid != company['companyId']])
                        for source in store.sources(None if args.force_sources else now):
                            if source.get('companyId') in selected_ids:
                                pipeline.ingest_source(source)
                    if args.gdelt:
                        pipeline.gdelt_batch(selected[:10], timespan='7d' if args.command == 'probe' else '1d')
                    if args.materials:
                        from company_intelligence.materials import discover_links
                        sources = {s['sourceId']: s for s in store.sources()}
                        for company in selected:
                            rows = store.db.execute("SELECT payload FROM events WHERE company=? AND kind='EARNINGS_CALL' ORDER BY date DESC LIMIT 1", (company['companyId'],)).fetchall()
                            for row in rows:
                                event = json.loads(row[0])
                                owner = sources.get(event.get('sourceId'))
                                if not owner:
                                    continue
                                try:
                                    store.event(discover_links(event, owner, http), now)
                                except BudgetExhausted:
                                    raise
                                except (SourceError, ValueError) as exc:
                                    store.audit(now, company['companyId'], 'MATERIAL_DISCOVERY_FAILURE', reason=str(exc)[:250])
                except BudgetExhausted:
                    deferred = True
                    store.audit(now, 'runner', 'BUDGET_DEFERRED', requestBudget=args.request_budget)
                    log('BUDGET_DEFERRED', requests=http.requests)
                # Reconcile estimates after first-party calendar changes without more SEC downloads.
                for company in selected:
                    pipeline.refresh_estimates(company)
        if inventory_results is not None:
            # Only new/selected issuer sources may spend the remaining batch
            # allowance; global polling stays in its four-hour lane.
            try:
                pipeline.ingest_due_sources(selected_ids, all_sources=False, include_global=False)
            except BudgetExhausted:
                deferred = True
            for company in selected:
                pipeline.refresh_estimates(company)
        store.prune(now)
        http.prune()
        exported = store.export(companies, output, now)
        report = {'inventoryDiscovery': inventory_results, 'runtimeSeconds': round(time.monotonic() - started, 3), 'httpStats': http.stats, 'databaseBytes': (state_dir / 'state.sqlite').stat().st_size, 'schema': SCHEMA, 'generatedAt': now, 'status': 'DEFERRED' if deferred else 'DEGRADED' if any(pipeline.run[k] for k in ('sourceFailures', 'secFailures', 'discoveryFailures', 'documentFailures')) else 'PASS',
                  'selected': [{'companyId': c['companyId'], 'symbols': [l['symbol'] for l in c['listings']]} for c in selected],
                  'run': pipeline.run, 'publicRequests': http.requests, 'secRequests': getattr(getattr(pipeline, '_sec_client', None), 'stats', {}).get('requests', 0),
                  'quality': store.quality(now, companies), 'export': exported}
        from company_intelligence.coverage import report as coverage_report
        coverage = coverage_report(store, companies, now)
        atomic_json(state_dir / 'coverage.json', coverage)
        report['coverage'] = {k: v for k, v in coverage.items() if k != 'companies'}
        atomic_json(state_dir / 'latest-run.json', report)
        store.set_state('latestRun', report)
        print(json.dumps(report, sort_keys=True))
        return 0  # Source failures are operationally isolated, explicitly reported as DEGRADED.
    finally:
        store.db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        store.close()
        lock.close()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(message)s', stream=sys.stderr)
    try:
        sys.exit(main())
    except (ValueError, OSError, SourceError) as exc:
        log('RUN_FAILED', reason=str(exc)[:250])
        sys.exit(1)
