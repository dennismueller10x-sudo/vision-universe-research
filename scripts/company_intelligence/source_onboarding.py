"""Bounded, resumable repair/discovery on an existing full restored ledger.

Current native ownership verification and existing IR adapters remain mandatory.
Source registration is not polling proof. Never polls publishers or rediscovers
the whole universe in routine refresh. The existing runner preserves each batch.
"""
import argparse
import fcntl
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.consumer_usage import first_party, publisher
from company_intelligence.discovery import validate_discovery_candidate
from company_intelligence.feeds import discover_ir
from company_intelligence.model import load_universe, within_domain
from company_intelligence.pipeline import Pipeline, advance
from company_intelligence.store import Store, atomic_json
from company_intelligence.transport import PublicHTTP, BudgetExhausted, SourceError
from company_intelligence.top46_content import matching_resolver
from company_intelligence.current_state_acceptance import database_proof

MANDATORY = ('iss_cik_0001633917', 'iss_cik_0001652130')

def safe_failure_detail(error):
    # Retain only an explicit transport classification, never provider text,
    # URLs, query strings or response bodies in public-safe evidence.
    parts = str(error).split(':')
    return parts[1] if len(parts) == 2 and parts[0] == 'ROBOTS_UNAVAILABLE' and re.fullmatch(r'(?:HTTP_\d{3}|[A-Z_]+)', parts[1]) else None

def proven(sources, cid):
    return [s for s in sources if s.get('companyId') == cid and s.get('active') and first_party(s, cid)
            and not publisher(s.get('url')) and s.get('lastSuccess') and not s.get('unsupported')]

def candidate_inventory(companies, store, sources, reviewed):
    seeds = json.loads((ROOT / 'company-intelligence/config/official-sites.json').read_text())
    insecure = {r[0] for r in store.db.execute("SELECT DISTINCT company FROM items WHERE json_extract(payload,'$.canonicalUrl') LIKE 'http://%'")}
    rows = []
    for cid, c in companies.items():
        approved = proven(sources, cid)
        if approved and cid not in insecure and cid not in MANDATORY:
            continue
        if not store.state('companyProfile:' + cid) and not store.state('financials:' + cid) and not store.db.execute('SELECT 1 FROM items WHERE company=? LIMIT 1', (cid,)).fetchone():
            continue
        proposal = reviewed.get('candidates', {}).get(cid)
        old = store.state('officialSite:' + cid, {})
        seed = seeds.get(c.get('cik'), {})
        url = proposal.get('url') if proposal else old.get('url') if old.get('status') == 'VALIDATED' else seed.get('url')
        if not url or publisher(url) or not url.startswith('https://'):
            continue
        rows.append({'companyId': cid, 'url': url, 'kind': 'EXACT_HTTPS_RECONFIRMATION' if cid in insecure and approved else 'MISSING_PROVEN_SOURCE'})
    rows.sort(key=lambda r: (r['companyId'] not in MANDATORY, r['kind'] != 'EXACT_HTTPS_RECONFIRMATION', r['companyId']))
    return rows

def onboard(state, out, run_id, limit=16, request_budget=200, max_seconds=600, now=None):
    state, out = Path(state), Path(out)
    if not (state / 'state.sqlite').is_file() or not (state / 'latest-run.json').is_file():
        raise ValueError('CURRENT_FULL_RESTORED_STATE_REQUIRED')
    latest = json.loads((state / 'latest-run.json').read_text())
    if latest.get('privateCompanies', 0) < 5120:
        raise ValueError('FULL_PRIVATE_UNIVERSE_REQUIRED')
    if not latest.get('privateIntegrity') or any(database_proof(state / name) != proof for name, proof in latest['privateIntegrity'].items()):
        raise ValueError('CURRENT_AUTHORITATIVE_TABLE_PROOF_MISMATCH')
    if not re.fullmatch(r'[a-z0-9-]{1,48}', run_id) or not 1 <= limit <= 25 or not 1 <= request_budget <= 200 or not 30 <= max_seconds <= 600:
        raise ValueError('INVALID_ONBOARDING_BOUNDS')
    stamp = now or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    reviewed = json.loads((ROOT / 'company-intelligence/config/source-onboarding-review.json').read_text())
    if reviewed.get('sourceUsagePolicy') != 'OWNED_IR_SEC_METADATA_PREVIEW_V1':
        raise ValueError('ONBOARDING_SOURCE_POLICY_MISMATCH')
    lock = (state / 'run.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    store = Store(state / 'state.sqlite')
    http = PublicHTTP(state / 'http', budget=request_budget, max_seconds=max_seconds, timeout=12)
    outcomes, selected, succeeded, imported, new_ids = Counter(), [], 0, 0, []
    key = 'sourceOnboarding:' + run_id + ':'
    try:
        companies = load_universe(ROOT)
        sources = [json.loads(r[0]) for r in store.db.execute('SELECT payload FROM sources')]
        before = {s['sourceId'] for s in sources}
        inventory = store.state(key + 'inventory')
        if inventory is None:
            inventory = candidate_inventory(companies, store, sources, reviewed)
            store.set_state(key + 'inventory', inventory)
        pipeline = Pipeline(ROOT, deepcopy(companies), store, http, stamp)
        pipeline.resolver = matching_resolver(companies, ROOT)
        for row in inventory:
            cid = row['companyId']; old_result = store.state(key + cid, {})
            if old_result.get('status') == 'SUCCESS' or old_result.get('retryAfter', '') > stamp or cid not in companies:
                continue
            if len(selected) >= limit:
                break
            official = store.state('officialSite:' + cid, {})
            if official.get('retryAfter', '') > stamp:
                continue
            selected.append(cid)
            try:
                proof = validate_discovery_candidate(companies[cid], {'url': row['url'], 'evidence': 'EXISTING_RECORDED_ROOT_CANDIDATE'}, http, stamp)
                if proof.get('status') != 'VALIDATED':
                    raise ValueError('CURRENT_NATIVE_OWNER_PROOF_REQUIRED')
                history = 'officialSiteReviewHistory:' + cid + ':' + proof['contentHash']
                if store.state(history) is None:
                    store.set_state(history, official)
                store.set_state('officialSite:' + cid, proof)
                store.audit(stamp, cid, 'SOURCE_ROOT_OWNER_REVERIFIED', priorStatus=official.get('status'), contentHash=proof['contentHash'])
                discovered, configs = discover_ir(companies[cid], proof['url'], http, stamp)
                registered = [s for s in sources if s.get('companyId') == cid and s.get('type') == 'IR_FEED' and first_party(s, cid)
                    and not publisher(s.get('url')) and any(within_domain(site, proof['url']) for site in s.get('allowedSites', []))]
                allowed = list({s['sourceId']:s for s in registered + discovered if first_party(s, cid) and not publisher(s.get('url'))}.values())
                accepted_sources = []
                for source in allowed:
                    previous = next((s for s in sources if s['sourceId'] == source['sourceId']), None)
                    if previous and previous.get('failureCount') and previous.get('nextCheck', '') > stamp:
                        continue
                    if row['kind'] == 'EXACT_HTTPS_RECONFIRMATION' and source.get('type') == 'IR_FEED':
                        # A stale conditional RSS body cannot confirm an HTTPS
                        # correction. Force one real read while retaining robots,
                        # request limits, timeout and provider cooldowns.
                        http.get(source['url'], fresh=True)
                    pipeline.ingest_source(source)
                    saved = store.db.execute('SELECT payload FROM sources WHERE id=?', (source['sourceId'],)).fetchone()
                    actual = json.loads(saved[0]) if saved else {}
                    if actual.get('lastSuccess') == stamp and actual.get('active'):
                        accepted_sources.append(actual); succeeded += 1
                        if source['sourceId'] not in before:
                            new_ids.append(source['sourceId']); imported += 1
                if configs:
                    from company_intelligence.materials import retain_source_configurations
                    configs = retain_source_configurations(store, cid, configs)
                    store.set_state('ir:' + cid, {**store.state('ir:' + cid, {}), 'configurations': configs, 'lastSuccess': stamp, 'nextVerify': advance(stamp, 14 * 24)})
                status = 'SUCCESS' if accepted_sources else 'REGISTERED_NOT_POLLING_PROVEN'
                store.set_state(key + cid, {'status': status, 'checkedAt': stamp, 'retryAfter': advance(stamp, 24), 'newProvenSources': sum(s['sourceId'] not in before for s in accepted_sources)})
                outcomes[status] += 1
            except BudgetExhausted:
                outcomes['BUDGET_DEFERRED'] += 1
                store.set_state(key + cid, {'status': 'BUDGET_DEFERRED', 'checkedAt': stamp})
                break
            except (ValueError, SourceError) as error:
                reason = str(error).split(':', 1)[0]
                code = 'OWNER_OR_ENDPOINT_WITHHELD' if isinstance(error, ValueError) or reason.startswith('OFFICIAL_SITE_CANDIDATE_') else 'TEMPORARY_SOURCE_FAILURE'
                if 'CONFLICT' in reason or 'WRONG_COMPANY' in reason:
                    proof = getattr(error, 'ownershipEvidence', {})
                    old = store.state('officialSite:' + cid, {})
                    key_hash = proof.get('contentHash') or 'conflict-' + stamp
                    store.set_state('officialSiteReviewHistory:' + cid + ':' + key_hash, old)
                    store.set_state('officialSite:' + cid, {**old, 'status': 'CONFLICTING_OWNER', 'reason': reason,
                        'lastVerified': stamp, 'ownershipEvidence': proof, 'url': row['url']})
                    code = 'CURRENT_OWNER_CONFLICT_WITHHELD'
                outcomes[code] += 1
                store.set_state(key + cid, {'status': code, 'reasonCode': reason if re.fullmatch(r'[A-Z0-9_]+',reason) else type(error).__name__, 'transportReasonCode': safe_failure_detail(error), 'checkedAt': stamp, 'retryAfter': advance(stamp, 24)})
            except Exception as error:
                # Programming errors cannot masquerade as upstream outages.
                raise ValueError('SOURCE_ONBOARDING_IMPLEMENTATION_ERROR') from error
        if succeeded:
            prior = store.state('continuousRefresh', {})
            store.set_state('continuousRefresh', {**prior, 'lastSuccessfulRefresh': stamp, 'lastSuccessfulNewsRefresh': stamp if any(s.get('type') == 'IR_FEED' and s.get('lastSuccess') == stamp for s in store.sources()) else prior.get('lastSuccessfulNewsRefresh')})
        result = {'schema': 1, 'runId': run_id, 'candidateIssuers': len(inventory), 'attemptedIssuers': len(selected), 'requests': http.requests,
                  'sourcePollingSuccesses': succeeded, 'newProvenSources': imported, 'outcomes': dict(outcomes), 'sourcePolicy': reviewed['sourceUsagePolicy'],
                  'privateOperationalRowsIncluded': False, 'universeDiscovery': False}
        store.set_state(key + 'lastBatch', result)
        atomic_json(out, result)
        return result
    finally:
        store.close()
        lock.close()

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--state', required=True); p.add_argument('--out', required=True); p.add_argument('--run-id', required=True)
    p.add_argument('--limit', type=int, default=16); p.add_argument('--request-budget', type=int, default=200); p.add_argument('--max-seconds', type=int, default=600)
    a = p.parse_args(); print(json.dumps(onboard(a.state, a.out, a.run_id, a.limit, a.request_budget, a.max_seconds)))
