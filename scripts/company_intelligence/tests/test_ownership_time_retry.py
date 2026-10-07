import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from company_intelligence.checkpoint import pack, restore
from company_intelligence.discovery_batch import run
from company_intelligence.inventory_sweep import select, prefix
from company_intelligence.pipeline import advance
from company_intelligence.store import Store
from company_intelligence.transport import PublicHTTP, SourceError
from test_engine import company, NOW


class OwnershipTimeRetryTests(unittest.TestCase):
    def cohort(self, state):
        companies = {}
        reasons = ('NETWORK_TIME_BUDGET_EXHAUSTED', 'DNS_UNAVAILABLE', 'NETWORK_BUDGET_EXHAUSTED')
        store = Store(state / 'state.sqlite')
        for i, reason in enumerate(reasons):
            c = company(f'Retry {i} Inc.', f'RT{i}', str(i + 1).zfill(10))
            c['officialSites'] = []
            companies[c['companyId']] = c
            store.set_state('siteCandidates:' + c['companyId'], {'status': 'CANDIDATE', 'candidates': [{'url': f'https://retry{i}.example/'}]})
            store.set_state('officialSite:' + c['companyId'], {'status': 'DEFERRED', 'reason': reason, 'retryAfter': advance(NOW, -1)})
        store.close()
        return companies

    def test_restored_time_deferral_completes_within_existing_batch_limits(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'
            companies = self.cohort(state)
            meta = pack(state, Path(tmp) / 'retry.tar.gz')
            restored = Path(tmp) / 'restored'
            restore(Path(tmp) / 'retry.tar.gz', restored, meta['sha256'])
            store = Store(restored / 'state.sqlite')
            selected, candidates = select(companies, store, NOW, 'time-retry', 'domains')
            # Retry hints do not mutate the master or persist as company facts.
            self.assertTrue(all('_ownershipTimeBudgetRetry' not in c for c in companies.values()))
            self.assertEqual([bool(c.get('_ownershipTimeBudgetRetry')) for c in selected], [True, False, False])
            def validate(c, candidate, http, now):
                # A slow ownership route reaches request admission at 75 seconds.
                # Fresh, DNS and request-limited candidates retain the 60s ceiling.
                http.clock = lambda: started + 75
                http._wait(candidate['url'])
                return {'status': 'VALIDATED', 'url': candidate['url']}
            started = time.time()
            with patch('company_intelligence.discovery_batch.validate_candidate', validate):
                rows = run(selected, candidates, PublicHTTP(restored / 'http'), NOW, 12, 300, workers=1, domain_only=True, admission_interval=.5)
            self.assertEqual([r['status'] for r in rows], ['VALIDATED', 'DEFERRED', 'DEFERRED'])
            self.assertEqual([r.get('reason') for r in rows[1:]], ['NETWORK_TIME_BUDGET_EXHAUSTED'] * 2)
            self.assertEqual(sum(r['requests'] for r in rows), 1)
            self.assertTrue(all('_ownershipTimeBudgetRetry' not in store.state('officialSite:' + cid) for cid in companies))
            store.close()

    def test_retry_cannot_outlive_batch_deadline_or_bypass_owner_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'
            companies = self.cohort(state)
            store = Store(state / 'state.sqlite')
            selected, candidates = select(companies, store, NOW, 'time-retry', 'domains')
            started = time.time()
            def slow(c, candidate, http, now):
                http.clock = lambda: started + 75
                http._wait(candidate['url'])
                raise AssertionError('GLOBAL_DEADLINE_BYPASSED')
            with patch('company_intelligence.discovery_batch.validate_candidate', slow):
                rows = run(selected[:1], candidates, PublicHTTP(state / 'http'), NOW, 12, 30, workers=1, domain_only=True)
            self.assertEqual(rows[0]['status'], 'DEFERRED')
            self.assertEqual(rows[0]['requests'], 0)
            with patch('company_intelligence.discovery_batch.validate_candidate', side_effect=SourceError('OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER')):
                rows = run(selected[:1], candidates, PublicHTTP(state / 'http'), NOW, 12, 300, workers=1, domain_only=True)
            self.assertEqual(rows[0]['status'], 'REJECTED')
            self.assertNotIn('site', rows[0])
            store.close()

    def test_future_cooldown_and_offline_outage_do_not_admit_extended_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'
            companies = self.cohort(state)
            store = Store(state / 'state.sqlite')
            cid = sorted(companies)[0]
            prior = store.state('officialSite:' + cid)
            store.set_state('officialSite:' + cid, {**prior, 'retryAfter': advance(NOW, 1)})
            selected, _ = select(companies, store, NOW, 'time-retry', 'domains')
            self.assertNotIn(cid, [c['companyId'] for c in selected])
            self.assertEqual(store.state(prefix('time-retry', 'domains') + cid)['status'], 'COOLDOWN')
            self.assertEqual(select(companies, store, NOW, 'time-retry', 'domains', allow_network=False)[0], [])
            self.assertEqual(store.state('officialSite:' + cid)['retryAfter'], advance(NOW, 1))
            store.close()
