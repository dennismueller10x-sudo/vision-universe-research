#!/usr/bin/env python3
"""Opt-in runner. All writes confined to the dedicated working store/export directory."""
import argparse
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.model import load_universe, SCHEMA
from company_intelligence.store import Store, atomic_json
from company_intelligence.transport import PublicHTTP, BudgetExhausted, SourceError
from company_intelligence.pipeline import Pipeline, utcnow, log
from company_intelligence.discovery import wikidata_sites, validate_candidate


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


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['run', 'backfill', 'export', 'quality', 'probe'])
    p.add_argument('--root', type=Path, default=ROOT)
    p.add_argument('--state', type=Path)
    p.add_argument('--out', type=Path)
    p.add_argument('--tickers')
    p.add_argument('--updated-issuers', type=Path, help='Consume the existing SEC daily updated-issuer manifest without fetching a universe')
    p.add_argument('--limit', type=int, default=25)
    p.add_argument('--request-budget', type=int, default=60)
    p.add_argument('--max-seconds', type=int, default=600)
    p.add_argument('--force-sources', action='store_true', help='Recheck selected sources without changing their normal scheduling interval')
    p.add_argument('--network', action='store_true', help='Explicitly enable configured public feeds')
    p.add_argument('--sec-documents', action='store_true', help='Inspect up to two recent SEC candidate primary documents/exhibits per selected issuer')
    p.add_argument('--sec-fetch', action='store_true', help='Refresh selected issuer submissions through existing SEC client')
    p.add_argument('--discover-ir', action='store_true')
    p.add_argument('--discover-sites', action='store_true', help='Exact CIK Wikidata candidates, automatically used only if unique')
    p.add_argument('--gdelt', action='store_true', help='Optional, unreliable discovery metadata')
    args = p.parse_args(argv)
    if not 1 <= args.limit <= 100 or not 1 <= args.request_budget <= 200 or not 30 <= args.max_seconds <= 1800:
        p.error('limit must be 1..100; request budget 1..200; max seconds 30..1800')
    if args.sec_documents and not args.sec_fetch:
        p.error('--sec-documents requires --sec-fetch')
    if (args.sec_fetch or args.discover_ir or args.discover_sites or args.gdelt or args.force_sources) and not args.network:
        p.error('network flags require --network')
    if args.sec_fetch and args.limit > args.request_budget:
        p.error('SEC metadata issuer limit exceeds request budget')
    root = args.root.resolve()
    state_dir = (args.state or root / '.company-intelligence').resolve()
    output = (args.out or state_dir / 'public/company-intelligence/data').resolve()
    # Reject exports into protected producers or repository source trees.
    protected = [root / name for name in ('quant', 'discover', 'supertrader', 'screener', 'dashboard', 'scripts', 'api', 'server', '.git', '.github')]
    if any(output == path or output.is_relative_to(path) or state_dir == path or state_dir.is_relative_to(path) for path in protected) or output == root or state_dir == root:
        p.error('state/output must not overwrite protected repository paths')
    companies = load_universe(root)
    state_dir.mkdir(parents=True, exist_ok=True)
    import fcntl
    lock = (state_dir / 'run.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise ValueError('ANOTHER_INTELLIGENCE_RUN_IS_ACTIVE')
    store = Store(state_dir / 'state.sqlite')
    now = utcnow()
    try:
        if args.command == 'quality':
            print(json.dumps(store.quality(now, companies), sort_keys=True))
            return 0
        cursor = store.state('backfillCursor') if args.command == 'backfill' and not args.tickers else None
        selected = select(companies, args.tickers, args.limit, cursor)
        if not selected and cursor:
            store.set_state('backfillCursor', None)
            selected = select(companies, args.tickers, args.limit)
        if args.updated_issuers:
            document = json.loads(args.updated_issuers.read_text())
            wanted = {r['issuerId'] for r in document.get('UPDATED_ISSUERS', [])}
            if document.get('STATUS') != 'SUCCESS' or not document.get('RUN_DATE') or document['RUN_DATE'] > now[:10]:
                p.error('invalid updated-issuer manifest')
            selected = [c for c in selected if c['companyId'] in wanted] if args.tickers else [c for cid, c in sorted(companies.items()) if cid in wanted][:args.limit]
        if args.command == 'backfill' and not args.tickers:
            retries = [c for c in companies.values() if min(store.state('sec:' + c['companyId'], {}).get('retryAfter') or '9999', store.state('ir:' + c['companyId'], {}).get('retryAfter') or '9999') <= now]
            selected = sorted({c['companyId']: c for c in retries + selected}.values(), key=lambda c: (c not in retries, c['companyId']))[:args.limit]
        if args.command == 'backfill' and not args.tickers:
            pending_ids = store.state('irPending', []) + store.state('secPending', [])
            pending = [companies[cid] for cid in pending_ids if cid in companies]
            selected = list({c['companyId']: c for c in pending + selected}.values())[:args.limit]
        sec_budget = min(args.request_budget // 2 if args.sec_documents else args.request_budget - 1, len(selected) * (10 if args.sec_documents else 2)) if args.sec_fetch else 0
        http = PublicHTTP(state_dir / 'http', budget=max(1, args.request_budget - sec_budget), max_seconds=args.max_seconds)
        pipeline = Pipeline(root, companies, store, http, now)
        deferred = False
        selected_ids = {c['companyId'] for c in selected}
        config_dir = root / 'company-intelligence/config'
        sites = json.loads((config_dir / 'official-sites.json').read_text())
        for company in companies.values():
            seeded = sites.get(company['cik'])
            if seeded:
                company['officialSites'] = [seeded.get('irHomepage') or seeded['url']]
            else:
                verified = store.state('officialSite:' + company['companyId'], {})
                if verified.get('status') == 'VALIDATED':
                    company['officialSites'] = [verified['url']]
        for source in store.sources():
            if source['type'] == 'GDELT':
                store.source({**source, 'active': False})
        if args.command != 'export':
            for index, company in enumerate(selected):
                try:
                    pipeline.project_company(company, fetch_sec=args.sec_fetch, sec_documents=args.sec_documents, sec_budget=sec_budget)
                except BudgetExhausted:
                    store.set_state('secPending', [c['companyId'] for c in selected[index:]])
                    deferred = True
                    break
                pending = store.state('secPending', [])
                store.set_state('secPending', [cid for cid in pending if cid != company['companyId']])
                if args.command == 'backfill' and not args.tickers:
                    store.set_state('backfillCursor', max(company['companyId'], store.state('backfillCursor') or ''))
            if args.network:
                pipeline.seed_sources(json.loads((config_dir / 'sources.json').read_text()))
                if args.discover_ir:
                    store.set_state('irPending', list(dict.fromkeys(store.state('irPending', []) + [c['companyId'] for c in selected if c['officialSites']])))
                try:
                    if args.discover_sites:
                        try:
                            candidates = wikidata_sites(selected[:25], http)
                        except BudgetExhausted:
                            raise
                        except (SourceError, ValueError, KeyError, TypeError) as exc:
                            candidates = {}
                            store.audit(now, 'wikidata', 'OFFICIAL_SITE_DISCOVERY_FAILURE', reason=str(exc)[:250])
                            log('OFFICIAL_SITE_DISCOVERY_FAILURE', reason=str(exc)[:250])
                        store.set_state('officialSiteCandidates', candidates)
                        for company in selected:
                            candidate = candidates.get(company['cik'])
                            if not company['officialSites'] and candidate and candidate['status'] == 'CANDIDATE':
                                try:
                                    verified = validate_candidate(company, candidate['candidates'][0], http, now)
                                    company['officialSites'] = [verified['url']]
                                    store.set_state('officialSite:' + company['companyId'], verified)
                                except BudgetExhausted:
                                    raise
                                except SourceError as exc:
                                    store.audit(now, company['companyId'], 'OFFICIAL_SITE_CANDIDATE_REJECTED', reason=str(exc)[:250])
                    # Existing feeds first; discovery is lower priority and cannot exhaust their request budget.
                    for source in store.sources(None if args.force_sources else now):
                        if source['type'] != 'GDELT' and ((args.command == 'run' and not args.tickers) or source.get('companyId') is None or source['companyId'] in selected_ids):
                            pipeline.ingest_source(source)
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
                except BudgetExhausted:
                    deferred = True
                    store.audit(now, 'runner', 'BUDGET_DEFERRED', requestBudget=args.request_budget)
                    log('BUDGET_DEFERRED', requests=http.requests)
                # Reconcile estimates after first-party calendar changes without more SEC downloads.
                for company in selected:
                    pipeline.refresh_estimates(company)
        store.prune(now)
        http.prune()
        exported = store.export(companies, output, now)
        report = {'schema': SCHEMA, 'generatedAt': now, 'status': 'DEFERRED' if deferred else 'DEGRADED' if any(pipeline.run[k] for k in ('sourceFailures', 'secFailures', 'discoveryFailures', 'documentFailures')) else 'PASS',
                  'selected': [{'companyId': c['companyId'], 'symbols': [l['symbol'] for l in c['listings']]} for c in selected],
                  'run': pipeline.run, 'publicRequests': http.requests, 'secRequests': getattr(getattr(pipeline, '_sec_client', None), 'stats', {}).get('requests', 0),
                  'quality': store.quality(now, companies), 'export': exported}
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
    except (ValueError, OSError) as exc:
        log('RUN_FAILED', reason=str(exc)[:250])
        sys.exit(1)
