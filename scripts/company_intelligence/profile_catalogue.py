#!/usr/bin/env python3
"""Create additive prepared profiles without reconstructing a missing rollout ledger.

Only the public factual catalogue goes into Git. Independent profile attempt
metadata and SEC cache stay private/ignored. Existing discovery queues, source
health, news and event state are never opened or initialized by this command.
"""
import argparse
from contextlib import contextmanager
import fcntl
import json
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.model import load_universe
from company_intelligence.pipeline import Pipeline, utcnow
from company_intelligence.profiles import VERSION, PARSER_VERSION, annual_filing, extract, public_profile, later
from company_intelligence.store import atomic_json
from company_intelligence.transport import BudgetExhausted

CATALOGUE_SCHEMA = 'vu-company-profile-catalogue-1.0.0'


@contextmanager
def writer_lock(checkpoint):
    """One writer per independent checkpoint; interrupted processes release it."""
    path = Path(checkpoint).with_suffix('.lock')
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ValueError('PROFILE_CATALOGUE_ALREADY_RUNNING') from exc
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def seed(store, companies, catalogue, now):
    """Import prepared facts only; never replace a newer verified profile."""
    if catalogue.get('schema') != CATALOGUE_SCHEMA or not isinstance(catalogue.get('profiles'), dict):
        raise ValueError('INVALID_COMPANY_PROFILE_CATALOGUE')
    imported = 0
    validated = []
    for cid, value in sorted(catalogue['profiles'].items()):
        if cid not in companies:
            continue
        profile = public_profile(value, cid, now)
        if profile is None:
            raise ValueError('INVALID_CATALOGUE_PROFILE:' + cid)
        validated.append((cid, profile))
    for cid, profile in validated:
        prior = store.state('companyProfile:' + cid, {})
        if prior.get('state') == 'AVAILABLE' and prior.get('lastVerifiedAt', '') >= profile['lastVerifiedAt']:
            continue
        if prior.get('confidence') == 'HIGH' and profile['confidence'] == 'MEDIUM' and not prior.get('stale'):
            continue
        store.set_state('companyProfile:' + cid, profile)
        imported += 1
    return imported


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=ROOT)
    p.add_argument('--catalogue', type=Path)
    p.add_argument('--checkpoint', type=Path)
    p.add_argument('--network', action='store_true')
    p.add_argument('--reparse', action='store_true', help='Reinterpret existing catalogue profiles from cached immutable evidence only')
    p.add_argument('--tickers')
    p.add_argument('--limit', type=int, default=50)
    p.add_argument('--request-budget', type=int, default=100)
    p.add_argument('--max-seconds', type=int, default=600)
    p.add_argument('--rate', type=float, default=1, help='Initial profile lane only: 1..3 SEC requests/second; no scheduled cadence change')
    args = p.parse_args(argv)
    if args.reparse and args.network:
        p.error('--reparse is cache-only; source refresh is the existing ledger profile lane')
    if not 1 <= args.limit <= 100 or not 1 <= args.request_budget <= 200 or not 30 <= args.max_seconds <= 1800 or not 1 <= args.rate <= 3:
        p.error('limit 1..100, request budget 1..200, max seconds 30..1800 and rate 1..3 required')
    root = args.root.resolve()
    catalogue_path = args.catalogue or root / 'company-intelligence/config/company-profiles.json'
    checkpoint_path = args.checkpoint or root / '.company-intelligence/profile-catalogue-checkpoint.json'
    with writer_lock(checkpoint_path):
        return backfill(args, root, catalogue_path, checkpoint_path)


def backfill(args, root, catalogue_path, checkpoint_path):
    catalogue = json.loads(catalogue_path.read_text()) if catalogue_path.is_file() else {'schema': CATALOGUE_SCHEMA, 'profiles': {}}
    if catalogue.get('schema') != CATALOGUE_SCHEMA or not isinstance(catalogue.get('profiles'), dict):
        raise ValueError('INVALID_COMPANY_PROFILE_CATALOGUE')
    before_ids = set(catalogue['profiles'])
    checkpoint = json.loads(checkpoint_path.read_text()) if checkpoint_path.is_file() else {'schema': VERSION, 'attempts': {}, 'batches': []}
    companies = load_universe(root)
    from company_intelligence.cli import select
    selected = select(companies, args.tickers, len(companies)) if args.tickers else list(companies.values())
    from quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter
    from quant.sec.provider import SECProvider
    from quant.sec.store import JsonRawStore
    client = SECHttpClient(cache=DiskCache(root / '.sec-cache', ttl_seconds=None), rate_limiter=RateLimiter(rate_per_second=args.rate, burst=1), timeout=15, max_retries=1)
    started = time.monotonic(); downloaded = 0; network_requests = 0
    def bounded(url, headers, timeout):
        nonlocal downloaded, network_requests
        if not args.network:
            raise BudgetExhausted('PROFILE_CATALOGUE_CACHE_ONLY')
        remaining = args.max_seconds - (time.monotonic() - started)
        if client.stats['requests'] > args.request_budget or remaining <= 0:
            raise BudgetExhausted('PROFILE_CATALOGUE_BUDGET_DEFERRED')
        network_requests += 1
        body = client._urlopen(url, headers, min(timeout, remaining))
        downloaded += len(body)
        return body
    client._opener = bounded
    alias_pipeline = Pipeline(root, companies, None, object())
    sites = json.loads((root / 'company-intelligence/config/official-sites.json').read_text())
    raw = JsonRawStore(root / 'quant/data/sec/raw')
    counts = Counter(); new = []; attempts = 0; consecutive_failures = 0
    now = utcnow()
    if checkpoint.get('retryAfter', '') > now and args.network:
        print(json.dumps({'status': 'CIRCUIT_COOLDOWN', 'requests': 0, 'retryAfter': checkpoint['retryAfter']}))
        return 0
    for company in sorted(selected, key=lambda c: c['companyId']):
        cid = company['companyId']; prior = catalogue['profiles'].get(cid)
        old = checkpoint['attempts'].get(cid, {})
        if not company.get('cik') or (args.reparse and not prior and not old) or (not args.reparse and prior and prior.get('parserVersion') == PARSER_VERSION):
            continue
        if old.get('parserVersion') == PARSER_VERSION and old.get('nextCheck', '') > now:
            continue
        if attempts >= args.limit or time.monotonic() - started >= args.max_seconds:
            break
        attempts += 1
        try:
            alias_pipeline.ensure_aliases([cid]); company = alias_pipeline.companies[cid]
            sub = raw.get_latest(company['cik'], 'submissions') or SECProvider(client).get_submissions(company['cik'], include_history=False)
            if str(sub.get('cik', '')).zfill(10) != company['cik']:
                raise ValueError('PROFILE_SEC_IDENTITY_MISMATCH')
            if sub.get('name') and sub['name'] not in company['names']:
                company = {**company, 'names': company['names'] + [sub['name']]}
            filing = annual_filing(company, sub, now)
            verified_at = prior['lastVerifiedAt'] if args.reparse and prior else now
            result = extract(company, client.get_bytes(filing['url']), filing, verified_at, sites.get(company['cik'], {}).get('url')) if filing else {'state': 'UNAVAILABLE', 'reason': 'NO_EXPLICIT_ANNUAL_PRIMARY_DOCUMENT'}
            status = result['state']; consecutive_failures = 0
            if status == 'AVAILABLE':
                public = public_profile(result, cid, now)
                if public is None:
                    raise ValueError('PROFILE_PUBLIC_VALIDATION_FAILED')
                catalogue['profiles'][cid] = public; new.append(cid)
                atomic_json(catalogue_path, catalogue)
            if args.reparse and status != 'AVAILABLE' and prior:
                del catalogue['profiles'][cid]
                atomic_json(catalogue_path, catalogue)
            checkpoint['attempts'][cid] = {'state': status, 'reason': result.get('reason'), 'parserVersion': PARSER_VERSION,
                'checkedAt': now, 'nextCheck': later(now, 90), 'filingId': filing['filingId'] if filing else None}
            counts[status] += 1
        except BudgetExhausted as exc:
            counts['DEFERRED'] += 1
            checkpoint['stopReason'] = str(exc)
            break
        except Exception as exc:
            counts['FAILED'] += 1; consecutive_failures += 1
            checkpoint['attempts'][cid] = {'state': 'FAILED', 'parserVersion': PARSER_VERSION, 'reason': str(exc)[:240], 'checkedAt': now, 'nextCheck': later(now, 1)}
            if consecutive_failures >= 3:
                checkpoint['retryAfter'] = later(now, 15 / 1440)
                checkpoint['stopReason'] = 'REPEATED_SEC_SOURCE_FAILURE'
        atomic_json(checkpoint_path, checkpoint)
        if consecutive_failures >= 3:
            break
    created = [cid for cid in new if cid not in before_ids]
    batch = {'generatedAt': now, 'attempted': attempts, 'acceptedProfiles': len(new), 'newProfiles': len(created), 'newIssuerIds': created,
             'updatedProfiles': len(new) - len(created), 'retiredProfiles': len(before_ids - set(catalogue['profiles'])), 'ratePerSecond': args.rate,
             'outcomes': dict(counts), 'secStats': dict(client.stats), 'networkRequests': network_requests, 'downloadedBytes': downloaded,
             'runtimeSeconds': round(time.monotonic() - started, 3), 'catalogueAvailable': len(catalogue['profiles'])}
    checkpoint['batches'].append(batch)
    atomic_json(checkpoint_path, checkpoint)
    print(json.dumps(batch, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
