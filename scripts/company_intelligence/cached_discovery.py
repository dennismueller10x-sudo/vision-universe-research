"""Bounded offline replay of current, hash-verified discovery evidence.

Cached analysis does not contact sources, override access cooldowns, claim a live
poll, or invent missing pages. Pass outcomes stay in the existing private ledger.
"""
import argparse
import hashlib
import json
import math
import time
from collections import Counter
from pathlib import Path
from .transport import PublicHTTP, BudgetExhausted, SourceError
from .model import canonical_url, load_universe
from .pipeline import Pipeline, utcnow
from .inventory_sweep import prefix, failure_category
from .discovery import validate_discovery_candidate
from .feeds import discover_ir
from .store import Store, export_revision
from .site_inventory import candidate_routes


class CachedHTTP(PublicHTTP):
    def __init__(self, cache, clock=time.time):
        super().__init__(cache, clock=clock)
        self.responses = {}
        for path in self.cache.glob('*.json'):
            try:
                meta = json.loads(path.read_text())
                checked = meta.get('checked')
                if type(checked) not in (int, float) or not math.isfinite(checked) or not 0 <= clock()-checked <= 86400:
                    continue
                _, body = self._cached(meta['url'])
                if body is None or len(body) > self.MAX_BYTES:
                    continue
                response = {**meta, 'body': body, 'cached': True}
                self.responses[meta['url']] = response
                self.responses.setdefault(meta.get('finalUrl', meta['url']), response)
            except (ValueError, KeyError, OSError):
                continue
        digest = hashlib.sha256(export_revision())
        digest.update(json.dumps(sorted((url, r['sha256']) for url, r in self.responses.items())).encode())
        self.generation = digest.hexdigest()

    def get(self, url, **kwargs):
        url = canonical_url(url)
        if url not in self.responses:
            raise BudgetExhausted('CACHE_ONLY_PENDING_NETWORK')
        self.stats['cacheHits'] += 1
        return self.responses[url]


def preserve_ir(store, cid, sources, configs, now, complete):
    prior = store.state('ir:' + cid, {})
    merged = {cfg['irHomepage']: cfg for cfg in prior.get('configurations', [])}
    for cfg in configs:
        old = merged.get(cfg['irHomepage'], {})
        docs = {d['url']: d for d in old.get('documents', []) + cfg.get('documents', [])}
        merged[cfg['irHomepage']] = {**old, **cfg, 'documents': list(docs.values())}
    store.set_state('ir:' + cid, {**prior, 'configurations': list(merged.values()),
                                 'partialDiscovery': prior.get('partialDiscovery', False) or not complete,
                                 'cachedAnalysisAt': now, 'cachedAnalysisStatus': 'COMPLETE' if complete else 'PARTIAL'})
    for source in sources:
        store.source(source)


def replay(root, store, companies, pass_id, lane='domains', limit=100, max_seconds=120, http=None):
    key = prefix(pass_id, lane)
    if not 1 <= limit <= 100 or not 1 <= max_seconds <= 600:
        raise ValueError('INVALID_CACHED_REPLAY_LIMIT')
    http = http or CachedHTTP(store.path.parent / 'http')
    now = utcnow()
    snapshot = store.state(key + 'inventory')
    if snapshot is None:
        snapshot = []
        for cid in sorted(companies):
            site = store.state('officialSite:' + cid, {})
            category = failure_category(site.get('status'), site.get('reason', ''))
            if (lane == 'domains' and category in ('INSUFFICIENT_EVIDENCE', 'REDIRECTED', 'TEMPORARILY_UNAVAILABLE')) or (lane == 'ir' and site.get('status') == 'VALIDATED'):
                snapshot.append(cid)
        store.set_state(key + 'inventory', snapshot)
    pipe = Pipeline(root, companies, store, http, now)
    outcomes = Counter()
    recovered = []
    started = time.monotonic()
    for cid in snapshot:
        if sum(outcomes.values()) >= limit or time.monotonic()-started >= max_seconds:
            break
        if cid not in companies:
            continue
        prior = store.state(key + cid, {})
        if prior and (prior.get('cacheGeneration') == http.generation or prior.get('status') == 'VALIDATED'):
            continue
        site = store.state('officialSite:' + cid, {})
        if lane == 'domains' and site.get('status') == 'VALIDATED':
            continue
        pipe.ensure_aliases([cid])
        company = pipe.companies[cid]
        result = {'status': 'NO_RETAINED_PAGE', 'networkRequests': 0, 'checkedAt': now,
                  'cacheGeneration': http.generation, 'interpretation': 'Offline evidence replay; missing cache remains pending network discovery.'}
        try:
            if lane == 'domains':
                evidence = store.state('siteCandidates:' + cid, {})
                evidence = {**evidence,'candidates':candidate_routes(evidence)}
                if evidence.get('status') != 'CANDIDATE' or len(evidence.get('candidates', [])) != 1:
                    result['status'] = 'AMBIGUOUS'
                else:
                    verified = validate_discovery_candidate(company, evidence['candidates'][0], http, now)
                    verified['ownershipEvidence']['cachedRevalidatedAt'] = now
                    store.set_state('officialSite:' + cid, verified)
                    companies[cid]['officialSites'] = [verified['url']]
                    result.update(status='VALIDATED', category='VERIFIED_OFFICIAL')
                    recovered.append(cid)
            else:
                if site.get('status') != 'VALIDATED':
                    result['status'] = 'NO_VERIFIED_DOMAIN'
                else:
                    complete = True
                    try:
                        sources, configs = discover_ir(company, site['url'], http, now)
                    except BudgetExhausted as error:
                        complete = False
                        sources = getattr(error, 'discoverySources', [])
                        configs = getattr(error, 'discoveryConfigurations', [])
                    if configs or sources:
                        preserve_ir(store, cid, sources, configs, now, complete)
                        result.update(status='CACHED_COMPLETE' if complete else 'CACHED_PARTIAL',
                                      configurations=len(configs), sources=len(sources), documents=sum(len(c.get('documents', [])) for c in configs))
        except BudgetExhausted:
            result['status'] = 'CACHE_ONLY_PENDING_NETWORK'
        except SourceError as error:
            result.update(status='CACHED_REJECTED', category=failure_category('REJECTED', str(error)), reason=str(error)[:250])
            if lane == 'ir' and (getattr(error, 'discoverySources', []) or getattr(error, 'discoveryConfigurations', [])):
                configs = getattr(error, 'discoveryConfigurations', [])
                preserve_ir(store, cid, getattr(error, 'discoverySources', []), configs, now, False)
                result.update(partialConfigurations=len(configs), documents=sum(len(c.get('documents', [])) for c in configs))
            # Retain live due times, while keeping newly demonstrated identity conflicts.
            if lane == 'domains' and result['category'] == 'CONFLICTING_OWNER':
                store.set_state('officialSite:' + cid, {**site, 'status': 'REJECTED', 'reason': result['reason'], 'cachedRevalidatedAt': now})
        except (ValueError, KeyError, TypeError) as error:
            result.update(status='CACHED_PARSER_FAILURE', reason=type(error).__name__)
        store.set_state(key + cid, result)
        outcomes[result['status']] += 1
    report = {'passId': pass_id, 'lane': lane, 'inventoryIssuers': len(snapshot), 'processedThisBatch': sum(outcomes.values()),
              'outcomes': dict(outcomes), 'recovered': recovered, 'networkRequests': http.requests,
              'httpStats': http.stats, 'ingestion': pipe.run, 'cacheGeneration': http.generation}
    store.set_state(key + 'cachedLastBatch', report)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--state', type=Path)
    parser.add_argument('--inventory-pass', required=True)
    parser.add_argument('--inventory-lane', choices=['domains', 'ir'], default='domains')
    parser.add_argument('--limit', type=int, default=100)
    args = parser.parse_args(argv)
    prefix(args.inventory_pass, args.inventory_lane)
    args.root = args.root.resolve()
    state = (args.state or args.root / '.company-intelligence').resolve()
    protected = [args.root / name for name in ('quant', 'discover', 'supertrader', 'screener', 'dashboard', 'scripts', 'api', 'server', '.git', '.github')]
    if state == args.root or any(state == path or state.is_relative_to(path) for path in protected):
        parser.error('state must not overwrite protected repository paths')
    if not (state / 'state.sqlite').is_file():
        parser.error('cached replay requires existing intelligence state')
    import fcntl
    with (state / 'run.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        store = Store(state / 'state.sqlite')
        try:
            print(json.dumps(replay(args.root, store, load_universe(args.root), args.inventory_pass, args.inventory_lane, args.limit), sort_keys=True))
        finally:
            store.close()


if __name__ == '__main__':
    main()
