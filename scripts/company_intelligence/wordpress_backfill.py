"""Bounded, resumable advertised WordPress news discovery on verified IR hosts.

This is one-time coverage discovery, outside the production polling schedule.
Existing ownership, advertised routes, metadata contracts and issuer matching
remain authoritative. Runtime facts stay in the private discovery ledger.
"""
import argparse
import fcntl
import json
import re
from collections import Counter
from pathlib import Path
from .checkpoint import pack
from .discovery_circuit import DiscoveryCircuit, guarded_poll, failure_signature
from .discovery import _validate_response
from .feeds import parse_links
from .model import canonical_url, load_universe, within_domain
from .pipeline import Pipeline, utcnow, advance
from .store import Store
from .transport import PublicHTTP, SourceError, BudgetExhausted
from .wordpress_news import discover


def roots(company, site, seeds):
    approved = seeds.get(company.get('cik'), {})
    values = [approved.get('url'), approved.get('irHomepage')]
    if site.get('status') == 'VALIDATED':
        values.append(site.get('url'))
    return sorted({url for value in values if (url := canonical_url(value))})


def covered(store):
    sources = {s['sourceId']: s for s in store.sources()}
    result = set()
    for cid, raw in store.db.execute('SELECT company,payload FROM items'):
        if any(sources.get(p.get('sourceId'), {}).get('companyId') == cid
               and sources.get(p.get('sourceId'), {}).get('type') == 'IR_FEED'
               for p in json.loads(raw)['provenance']):
            result.add(cid)
    return result


def batch(root, store, companies, run_id, http, now=None, limit=16, seeds=None):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,47}', run_id or '') or not 1 <= limit <= 100:
        raise ValueError('INVALID_WORDPRESS_BACKFILL_BOUNDS')
    now = now or utcnow()
    root = Path(root)
    seeds = seeds if seeds is not None else json.loads((root / 'company-intelligence/config/official-sites.json').read_text())
    key = 'wordpressCoverage:' + run_id + ':'
    before = covered(store)
    inventory = store.state(key + 'inventory')
    if inventory is None:
        frozen = {}
        for raw, in store.db.execute("SELECT payload FROM state WHERE key LIKE 'ir:%'"):
            for cfg in json.loads(raw).get('configurations', []):
                cid = cfg.get('companyId')
                if cid not in companies or cid in before or cfg.get('providerType') != 'WORDPRESS' or cfg.get('pageRole') != 'IR':
                    continue
                approved = roots(companies[cid], store.state('officialSite:' + cid, {}), seeds)
                page = canonical_url(cfg.get('irHomepage'))
                if not page or not any(within_domain(page, u) for u in approved):
                    continue
                value = {'companyId': cid, 'page': page, 'approvedRoots': approved}
                if cid not in frozen or (len(page), page) < (len(frozen[cid]['page']), frozen[cid]['page']):
                    frozen[cid] = value
        inventory = [frozen[cid] for cid in sorted(frozen)]
        store.set_state(key + 'inventory', inventory)
        store.audit(now, run_id, 'FROZEN_WORDPRESS_NEWS_DISCOVERY', companies=len(inventory), networkRequests=0)
    circuit_key = 'discoveryCircuit:wordpressCoverage'
    prior_circuit = store.state(circuit_key, {})
    if prior_circuit.get('open') and prior_circuit.get('cooldownUntil', '') > now:
        return {'runId': run_id, 'stopReason': 'CIRCUIT_COOLDOWN', 'requests': 0, 'processed': 0}
    pipe = Pipeline(root, companies, store, http, now)
    circuit = DiscoveryCircuit()
    processed = 0
    stop = 'NO_DUE_CANDIDATES'
    request_start = http.requests
    bytes_start = http.stats.get('bytesDownloaded', 0)
    with guarded_poll(http, circuit):
        for candidate in inventory:
            cid, page = candidate['companyId'], candidate['page']
            prior = store.state(key + cid, {})
            if prior and (prior.get('status') not in ('TEMPORARY_FAILURE', 'DEFERRED', 'COOLDOWN') or prior.get('retryAfter', '9999') > now):
                continue
            if processed >= limit:
                stop = 'BATCH_COMPLETED'
                break
            row = {'companyId': cid, 'page': page, 'checkedAt': now}
            start = http.requests
            current_roots = roots(companies.get(cid, {}), store.state('officialSite:' + cid, {}), seeds)
            current_ir = any(cfg.get('companyId') == cid and cfg.get('pageRole') == 'IR'
                             and cfg.get('providerType') == 'WORDPRESS'
                             and canonical_url(cfg.get('irHomepage')) == page
                             for cfg in store.state('ir:' + cid, {}).get('configurations', []))
            rest_sources = [s for s in store.sources() if s.get('companyId') == cid and s.get('format') == 'WORDPRESS_REST_NEWS']
            earlier = [store.state('wordpressMetadata' + n + ':' + cid, {}) for n in ('51', '52')]
            cooldown = max([v.get('retryAfter', '') for v in earlier] + [s.get('nextCheck', '') for s in rest_sources if s.get('failureCount')], default='')
            try:
                if cid not in companies or not current_ir or not any(within_domain(page, u) for u in current_roots):
                    row.update(status='WITHHELD', reason='FROZEN_IR_HOST_NO_LONGER_APPROVED')
                elif cid in before:
                    row['status'] = 'ALREADY_ENRICHED'
                elif cooldown > now:
                    row.update(status='COOLDOWN', retryAfter=cooldown)
                elif any(s.get('lastSuccess') and not s.get('failureCount') for s in rest_sources):
                    row.update(status='ALREADY_EVALUATED', reason='EXISTING_SUCCESSFUL_REST_SOURCE')
                else:
                    response = http.get(page, ttl=86400)
                    if not any(within_domain(response['finalUrl'], u) for u in current_roots):
                        raise SourceError('WORDPRESS_IR_REDIRECT_REQUIRES_REVALIDATION')
                    pipe.ensure_aliases([cid])
                    # Reused approved domain authority does not excuse a fresh
                    # page disclosing a different legal owner or conflicting CIK.
                    # A brand-only IR header can retain the approved root proof.
                    try:
                        _validate_response(pipe.companies[cid], {'url': page, 'evidence': 'APPROVED_IR_ROUTE'}, response, now)
                    except SourceError as error:
                        if str(error) != 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED':
                            raise
                    source = discover(parse_links(response['body'], response['finalUrl']), response['finalUrl'],
                                      pipe.companies[cid], current_roots, http, now)
                    row['pageContentHash'] = response.get('sha256')
                    if source:
                        store.source(source)
                        previous = pipe.run.copy()
                        pipe.ingest_source(source)
                        saved = next(s for s in store.sources() if s['sourceId'] == source['sourceId'])
                        success = saved.get('lastSuccess') == now and not saved.get('failureCount')
                        row.update(status='INGESTED' if success else 'TEMPORARY_FAILURE',
                                   sourceId=source['sourceId'], runDelta={k: pipe.run[k] - previous[k] for k in pipe.run})
                        if row['status'] == 'TEMPORARY_FAILURE':
                            row.update(reason=saved.get('lastError'), retryAfter=saved.get('nextCheck') or advance(now, 24))
                    else:
                        row.update(status='NO_QUALIFYING_ADVERTISED_NEWS')
            except BudgetExhausted as error:
                row.update(status='DEFERRED', reason=str(error), retryAfter=advance(now, .25))
                stop = 'CIRCUIT_OPEN' if circuit.snapshot()['open'] else 'BUDGET_DEFERRED'
            except (SourceError, ValueError, TypeError) as error:
                transient = failure_signature(error) or any(c in str(error) for c in ('HTTP_50', 'HTTP_429', 'NETWORK_', 'DNS_UNAVAILABLE', 'RATE_LIMIT'))
                row.update(status='TEMPORARY_FAILURE' if transient else 'WITHHELD', reason=str(error)[:160], retryAfter=advance(now, 1 if transient else 168))
            row['networkRequests'] = prior.get('networkRequests', 0) + http.requests - start
            store.set_state(key + cid, row)
            store.audit(now, run_id, 'WORDPRESS_NEWS_DISCOVERY_OUTCOME', **row)
            processed += 1
            if circuit.snapshot()['open']:
                stop = 'CIRCUIT_OPEN'
            if stop in ('CIRCUIT_OPEN', 'BUDGET_DEFERRED'):
                break
    snapshot = {**circuit.snapshot(), 'checkedAt': now, 'cooldownUntil': advance(now, .25) if circuit.snapshot()['open'] else None}
    store.set_state(circuit_key, snapshot)
    outcomes = [store.state(key + row['companyId']) for row in inventory]
    statuses = Counter(row['status'] for row in outcomes if row)
    report = {'runId': run_id, 'checkedAt': now, 'processed': processed, 'requests': http.requests - request_start,
              'bytesDownloaded': http.stats.get('bytesDownloaded', 0) - bytes_start,
              'inventoryCount': len(inventory), 'classified': sum(statuses.values()),
              'pending': sum(row is None for row in outcomes), 'statuses': dict(statuses),
              'httpStats': http.stats, 'stopReason': stop, 'newFirstPartyNewsIssuers': sorted(covered(store) - before), 'circuit': snapshot}
    saved = store.state(key + 'run', {})
    store.set_state(key + 'run', {**report, 'completedBatches': saved.get('completedBatches', 0) + 1,
                                'requests': saved.get('requests', 0) + report['requests'],
                                'bytesDownloaded': saved.get('bytesDownloaded', 0) + report['bytesDownloaded'],
                                'recoveredIssuers': sorted(set(saved.get('recoveredIssuers', [])) | set(report['newFirstPartyNewsIssuers']))})
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    p.add_argument('--state', type=Path)
    p.add_argument('--run-id', required=True)
    p.add_argument('--limit', type=int, default=16)
    p.add_argument('--request-budget', type=int, default=160)
    p.add_argument('--max-seconds', type=int, default=900)
    p.add_argument('--network', action='store_true')
    a = p.parse_args()
    if (not a.network or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,47}', a.run_id or '')
            or not 1 <= a.limit <= 100 or not 1 <= a.request_budget <= 200 or not 30 <= a.max_seconds <= 1800):
        p.error('Explicit --network and bounded request/time budgets are required')
    state = a.state or a.root / '.company-intelligence'
    state.mkdir(parents=True, exist_ok=True)
    acquired = False
    try:
        with (state / 'run.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            acquired = True
            store = Store(state / 'state.sqlite')
            try:
                report = batch(a.root, store, load_universe(a.root), a.run_id,
                               PublicHTTP(state / 'http', budget=a.request_budget, max_seconds=a.max_seconds), limit=a.limit)
            finally:
                store.close()
    finally:
        if acquired:
            pack(state, state / 'checkpoints' / (a.run_id + '-wordpress.tar.gz'))
    print(json.dumps(report, sort_keys=True))


if __name__ == '__main__':
    main()
