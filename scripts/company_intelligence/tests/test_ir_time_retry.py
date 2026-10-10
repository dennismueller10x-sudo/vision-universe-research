import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from company_intelligence.checkpoint import pack, restore
from company_intelligence.discovery_batch import run
from company_intelligence.inventory_sweep import select
from company_intelligence.pipeline import advance
from company_intelligence.store import Store
from company_intelligence.transport import PublicHTTP
from test_engine import company, NOW


class IRTimeRetryTests(unittest.TestCase):
    def cohort(self, state):
        companies = {}
        store = Store(state / 'state.sqlite')
        for i, reason in enumerate(('NETWORK_TIME_BUDGET_EXHAUSTED', 'DNS_UNAVAILABLE', 'NETWORK_BUDGET_EXHAUSTED')):
            c = company(f'Issuer {i} Inc.', f'IR{i}', str(i + 1).zfill(10))
            c['officialSites'] = [f'https://issuer{i}.example/']
            companies[c['companyId']] = c
            store.set_state('siteCandidates:' + c['companyId'], {'status': 'CANDIDATE', 'candidates': [{'url': c['officialSites'][0]}]})
            store.set_state('ir:' + c['companyId'], {'reason': reason, 'retryAfter': advance(NOW, -1)})
        store.close()
        return companies

    def test_restored_time_deferral_finishes_without_extending_unrelated_ir_attempts(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'
            companies = self.cohort(state)
            archive = Path(tmp) / 'retry.tar.gz'
            meta = pack(state, archive)
            fresh = Path(tmp) / 'restored'
            restore(archive, fresh, meta['sha256'])
            store = Store(fresh / 'state.sqlite')
            selected, candidates = select(companies, store, NOW, 'ir-time-retry', 'ir')
            started = time.time()
            def discover(c, site, http, now):
                http.clock = lambda: started + 250
                http._wait(site)
                return [], [{'companyId': c['companyId'], 'irHomepage': site + 'investors', 'pageRole': 'IR'}]
            with patch('company_intelligence.discovery_batch.discover_ir', discover):
                rows = run(selected, candidates, PublicHTTP(fresh / 'http'), NOW, 36, 600, workers=1, admission_interval=.5)
            self.assertEqual([r['status'] for r in rows], ['VALIDATED', 'DEFERRED', 'DEFERRED'])
            self.assertEqual(sum(r['requests'] for r in rows), 1)
            self.assertEqual(rows[0]['configurations'][0]['pageRole'], 'IR')
            self.assertTrue(all('_irTimeBudgetRetry' not in c for c in companies.values()))
            self.assertTrue(all('_irTimeBudgetRetry' not in store.state('ir:' + cid) for cid in companies))
            store.close()

    def test_extended_ir_retry_still_obeys_shared_deadline_and_request_budget(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'
            companies = self.cohort(state)
            store = Store(state / 'state.sqlite')
            selected, candidates = select(companies, store, NOW, 'ir-time-retry', 'ir')
            started = time.time()
            def slow(c, site, http, now):
                http.clock = lambda: started + 250
                http._wait(site)
                raise AssertionError('SHARED_DEADLINE_BYPASSED')
            with patch('company_intelligence.discovery_batch.discover_ir', slow):
                rows = run(selected[:1], candidates, PublicHTTP(state / 'http'), NOW, 4, 200, workers=1)
            self.assertEqual(rows[0]['status'], 'DEFERRED')
            self.assertEqual(rows[0]['requests'], 0)
            def limited(c, site, http, now):
                for i in range(5):
                    http._wait(f'https://route{i}.example/')
                raise AssertionError('REQUEST_BUDGET_BYPASSED')
            with patch('company_intelligence.discovery_batch.discover_ir', limited), patch('company_intelligence.transport.PublicHTTP._wait', lambda http, url: setattr(http, 'requests', http.requests + 1)):
                rows = run(selected[:1], candidates, PublicHTTP(state / 'http'), NOW, 4, 600, workers=1, admission_interval=.5)
            self.assertEqual(rows[0]['status'], 'DEFERRED')
            self.assertEqual(rows[0]['reason'], 'NETWORK_BUDGET_EXHAUSTED')
            self.assertEqual(rows[0]['requests'], 4)
            store.close()

    def test_future_cooldown_and_offline_selection_do_not_admit_longer_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'
            companies = self.cohort(state)
            store = Store(state / 'state.sqlite')
            cid = sorted(companies)[0]
            prior = store.state('ir:' + cid)
            store.set_state('ir:' + cid, {**prior, 'retryAfter': advance(NOW, 1)})
            selected, _ = select(companies, store, NOW, 'ir-time-retry', 'ir')
            self.assertNotIn(cid, [c['companyId'] for c in selected])
            self.assertEqual(select(companies, store, NOW, 'ir-time-retry', 'ir', allow_network=False)[0], [])
            self.assertEqual(store.state('ir:' + cid)['retryAfter'], advance(NOW, 1))
            store.close()


if __name__ == '__main__':
    unittest.main()
