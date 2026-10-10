"""Bounded, resumable SEC annual website candidate discovery.

The normal verifier and IR sweep remain responsible for ownership and ingestion.
Run identifiers freeze the cohort in the existing private ledger, not a cursor.
"""
import argparse
import fcntl
import json
import re
import time
from collections import Counter
from pathlib import Path
from quant.sec.http_client import RateLimiter, SECHttpClient, SECHTTPError
from quant.sec.provider import SECProvider
from .checkpoint import pack
from .model import canonical_url, load_universe
from .pipeline import advance, utcnow
from .sec_site_candidates import NoCache, collect
from .store import Store, dumps


def run_batch(store, companies, provider, run_id, now, limit=25,
              request_budget=60, max_seconds=600, clock=time.monotonic):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', run_id):
        raise ValueError('INVALID_SEC_SITE_RUN_ID')
    if not 1 <= limit <= 100 or not 2 <= request_budget <= 200 or not 30 <= max_seconds <= 1800:
        raise ValueError('INVALID_SEC_SITE_BATCH_BUDGET')
    key = 'secSiteCandidates:' + run_id + ':'
    ids = store.state(key + 'inventory')
    if ids is None:
        ids = sorted(cid for cid, company in companies.items() if company.get('cik')
                     and store.state('officialSite:' + cid, {}).get('status') != 'VALIDATED')
        store.set_state(key + 'inventory', ids)
        store.audit(now, run_id, 'SEC_ANNUAL_SITE_COHORT_FROZEN', companyIds=ids)
    circuit = store.state(key + 'circuit', {})
    if circuit.get('retryAfter', '') > now:
        return {'runId': run_id, 'stopReason': 'CIRCUIT_COOLDOWN', 'processed': 0, 'requests': 0}
    start = clock(); initial_requests = provider.client.stats['requests']; processed = 0; streak = 0
    stop = 'NO_DUE_CANDIDATES'
    for cid in ids:
        prior = store.state(key + cid, {})
        if prior and (prior.get('status') != 'TEMPORARY_FAILURE' or prior.get('retryAfter', '') > now): continue
        if processed >= limit or provider.client.stats['requests'] - initial_requests + 2 > request_budget or clock() - start >= max_seconds:
            stop = 'BUDGET_DEFERRED'; break
        if cid not in companies: continue
        try:
            result = collect(companies[cid], provider, now)
            streak = 0
        except SECHTTPError as exc:
            transient = exc.status is None or exc.status in (429, 500, 502, 503, 504)
            result = {'status': 'TEMPORARY_FAILURE' if transient else 'UNAVAILABLE',
                      'httpStatus': exc.status, 'candidates': [], 'attempts': prior.get('attempts', 0) + 1}
            if transient:
                result['retryAfter'] = advance(now, min(168, 2 ** min(result['attempts'], 7)))
            streak = streak + 1 if transient else 0
        except (ValueError, KeyError, TypeError, IndexError) as exc:
            result = {'status': 'NO_SAFE_FILING_EVIDENCE', 'reason': type(exc).__name__, 'candidates': []}
            streak = 0
        result.update(companyId=cid, checkedAt=now, ownershipVerificationRequired=True, rawBodyPersisted=False)
        # Candidates and their outcome become durable together; no raw SEC body.
        with store.db:
            for candidate in result.get('candidates', []):
                current = store.state('siteCandidates:' + cid, {})
                merged = {canonical_url(row['url']): row for row in current.get('candidates', [])}
                merged.setdefault(candidate['url'], candidate)
                store.db.execute('INSERT OR REPLACE INTO state VALUES(?,?)', ('siteCandidates:' + cid, dumps({**current,
                                'status': 'CANDIDATE' if len(merged) == 1 else 'AMBIGUOUS',
                                'candidates': list(merged.values()), 'checkedAt': now})))
            store.db.execute('INSERT OR REPLACE INTO state VALUES(?,?)', (key + cid, dumps(result)))
        processed += 1
        if streak >= 4:
            store.set_state(key + 'circuit', {'retryAfter': advance(now, .25),
                            'reason': 'SHARED_SEC_ROUTE_TEMPORARY_FAILURE', 'checkedAt': now})
            stop = 'CIRCUIT_OPEN'; break
    outcomes = [store.state(key + cid, {}) for cid in ids]
    report = {'runId': run_id, 'checkedAt': now, 'processed': processed,
              'requests': provider.client.stats['requests'] - initial_requests,
              'inventoryCount': len(ids), 'classified': sum(bool(row) for row in outcomes),
              'pending': sum(not row for row in outcomes), 'statuses': dict(Counter(row.get('status', 'PENDING') for row in outcomes)),
              'candidateIssuers': sum(bool(row.get('candidates')) for row in outcomes), 'stopReason': stop}
    store.set_state(key + 'summary', report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--limit', type=int, default=25)
    parser.add_argument('--request-budget', type=int, default=60)
    parser.add_argument('--max-seconds', type=int, default=600)
    args = parser.parse_args()
    state = args.state.resolve()
    if not (state / 'state.sqlite').is_file(): raise ValueError('RESTORE_EXISTING_INTELLIGENCE_LEDGER_FIRST')
    with (state / 'run.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        store = Store(state / 'state.sqlite')
        try:
            client = SECHttpClient(cache=NoCache(), rate_limiter=RateLimiter(rate_per_second=1, burst=1), timeout=12, max_retries=0)
            report = run_batch(store, load_universe(args.root), SECProvider(client), args.run_id,
                               utcnow(), args.limit, args.request_budget, args.max_seconds)
        finally: store.close()
    pack(state, state / 'checkpoints' / ('sec-sites-' + args.run_id + '.tar.gz'))
    print(json.dumps(report, sort_keys=True))


if __name__ == '__main__': main()
