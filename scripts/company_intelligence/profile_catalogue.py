#!/usr/bin/env python3
"""Create additive prepared profiles without reconstructing a missing rollout ledger.

Only the public factual catalogue goes into Git. Independent profile attempt
metadata and SEC cache stay private/ignored. Existing discovery queues, source
health, news and event state are never opened or initialized by this command.
"""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.model import load_universe, timestamp
from company_intelligence.pipeline import Pipeline, utcnow
from company_intelligence.profiles import VERSION, PARSER_VERSION, annual_filing, extract, public_profile, later
from company_intelligence.store import atomic_json
from company_intelligence.transport import BudgetExhausted

CATALOGUE_SCHEMA = 'vu-company-profile-catalogue-1.0.0'


def parser_revision(value):
    match = re.fullmatch(r'company-profile-parser-(\d+)\.(\d+)\.(\d+)', value or '')
    return tuple(map(int, match.groups())) if match else (0, 0, 0)


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
    withdrawals = catalogue.get('withdrawals', {})
    if not isinstance(withdrawals, dict):
        raise ValueError('INVALID_PROFILE_WITHDRAWALS')
    for cid, value in withdrawals.items():
        if (not isinstance(value, dict) or value.get('companyId') != cid
                or parser_revision(value.get('parserVersion')) == (0, 0, 0)
                or timestamp(value.get('checkedAt')) != value.get('checkedAt') or not value.get('checkedAt')
                or value['checkedAt'] > now or value.get('reason') != 'NO_EXPLICIT_ISSUER_BUSINESS_DESCRIPTION'
                or not isinstance(value.get('sourceContentHashes'), list) or not 1 <= len(value['sourceContentHashes']) <= 4
                or any(not re.fullmatch(r'[a-f0-9]{64}', str(h)) for h in value['sourceContentHashes'])):
            raise ValueError('INVALID_PROFILE_WITHDRAWAL:' + cid)
    for cid, value in sorted(catalogue['profiles'].items()):
        if cid not in companies:
            continue
        profile = public_profile(value, cid, now)
        if profile is None:
            raise ValueError('INVALID_CATALOGUE_PROFILE:' + cid)
        validated.append((cid, profile))
    for cid, value in sorted(withdrawals.items()):
        if cid not in companies or cid in catalogue['profiles']:
            continue
        prior = store.state('companyProfile:' + cid, {})
        revision = parser_revision(prior.get('parserVersion'))
        sources = prior.get('sources', [])
        if (prior.get('state') == 'AVAILABLE' and revision != (0, 0, 0)
                and revision < parser_revision(value['parserVersion'])
                and prior.get('lastVerifiedAt', '') <= value['checkedAt']
                and sources and all(s.get('type') == 'SEC' and s.get('companyId') == cid for s in sources)
                and sorted(s.get('contentHash', '') for s in sources) == sorted(value['sourceContentHashes'])
                and not prior.get('supersededAnnualFiling')):
            # Retain every sourced factual field privately, withholding only
            # the disproved prepared description's public eligibility.
            store.set_state('companyProfile:' + cid, {**prior, 'state': 'UNAVAILABLE',
                                                       'qualityWithdrawal': value, 'priorState': 'AVAILABLE'})
            store.audit(now, cid, 'PROFILE_DESCRIPTION_WITHHELD', reason=value['reason'])
    for cid, profile in validated:
        prior = store.state('companyProfile:' + cid, {})
        if prior.get('state') == 'AVAILABLE' and prior.get('lastVerifiedAt', '') >= profile['lastVerifiedAt']:
            def evidence(value):
                return sorted((s.get('type', ''), s.get('url', ''), s.get('contentHash', '')) for s in value.get('sources', []))
            # Cache-only normalization keeps the source verification time.
            # Permit a parser upgrade only for the same immutable evidence;
            # later verification, supersession and stronger sources survive.
            upgrade = (prior.get('lastVerifiedAt') == profile['lastVerifiedAt']
                       and parser_revision(profile.get('parserVersion')) > parser_revision(prior.get('parserVersion'))
                       and evidence(prior) == evidence(profile)
                       and not prior.get('supersededAnnualFiling'))
            if not upgrade:
                continue
        if prior.get('state') == 'AVAILABLE' and prior.get('confidence') == 'HIGH' and profile['confidence'] == 'MEDIUM' and not prior.get('stale'):
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
            same_filing = bool(prior and filing and any(s.get('filingId') == filing['filingId'] for s in prior.get('sources', [])))
            verified_at = prior['lastVerifiedAt'] if prior and (args.reparse or same_filing) else now
            body = client.get_bytes(filing['url']) if filing else None
            result = extract(company, body, filing, verified_at, sites.get(company['cik'], {}).get('url')) if filing else {'state': 'UNAVAILABLE', 'reason': 'NO_EXPLICIT_ANNUAL_PRIMARY_DOCUMENT'}
            status = result['state']; consecutive_failures = 0
            if status == 'AVAILABLE':
                public = public_profile(result, cid, now)
                if public is None:
                    raise ValueError('PROFILE_PUBLIC_VALIDATION_FAILED')
                catalogue['profiles'][cid] = public; new.append(cid)
                catalogue.get('withdrawals', {}).pop(cid, None)
                atomic_json(catalogue_path, catalogue)
            if (status != 'AVAILABLE' and prior and same_filing and prior.get('parserVersion') != PARSER_VERSION
                    and result.get('reason') == 'NO_EXPLICIT_ISSUER_BUSINESS_DESCRIPTION'):
                body_hash = hashlib.sha256(body).hexdigest()
                if all(s.get('type') == 'SEC' and s.get('contentHash') == body_hash for s in prior.get('sources', [])):
                    catalogue.setdefault('withdrawals', {})[cid] = {'companyId': cid, 'parserVersion': PARSER_VERSION,
                        'sourceContentHashes': [s['contentHash'] for s in prior['sources']], 'checkedAt': now,
                        'reason': result['reason']}
                    del catalogue['profiles'][cid]
                else:
                    catalogue['profiles'][cid] = {**prior, 'stale': True}
                atomic_json(catalogue_path, catalogue)
            elif status != 'AVAILABLE' and prior and filing and not same_filing:
                # A newer filing that cannot be normalized does not invalidate
                # the preceding sourced facts, but must surface their staleness.
                catalogue['profiles'][cid] = {**prior, 'stale': True}
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
