import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from company_intelligence.discovery_circuit import DiscoveryCircuit, guarded_poll
from company_intelligence.transport import PublicHTTP, BudgetExhausted, SourceError
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from test_engine import company, NOW


class PollCircuitTests(unittest.TestCase):
    def test_cli_checkpoints_circuit_opened_during_followup_polling(self):
        import contextlib
        from company_intelligence.cli import main
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); state = root / '.company-intelligence'
            config = root / 'company-intelligence/config'; config.mkdir(parents=True)
            (config / 'official-sites.json').write_text('{}')
            issuer = company(); cid = issuer['companyId']; store = Store(state / 'state.sqlite')
            store.set_state('officialSite:' + cid, {'status': 'VALIDATED', 'url': 'https://apple.com/'})
            store.set_state('siteCandidates:' + cid, {'status': 'CANDIDATE', 'candidates': [{'url': 'https://apple.com/'}]})
            for i in range(6):
                store.source({'sourceId': str(i), 'companyId': cid, 'type': 'RSS',
                              'url': 'https://host' + str(i) + '.example/feed', 'active': True})
            store.close()
            def opener(request, **kwargs):
                raise urllib.error.HTTPError(request.full_url, 503, 'Unavailable', {},
                    io.BytesIO(b'upstream connect error or disconnect/reset before headers'))
            http = PublicHTTP(state / 'http', budget=100, interval=0, sleep=lambda _: None,
                              opener=opener, validator=lambda url: url)
            output = io.StringIO()
            with patch('company_intelligence.cli.load_universe', return_value={cid: issuer}), \
                 patch('company_intelligence.cli.PublicHTTP', return_value=http), \
                 patch('company_intelligence.site_inventory.import_inventory'), \
                 patch('company_intelligence.discovery_batch.run', return_value=[]), \
                 contextlib.redirect_stdout(output):
                self.assertEqual(main(['sweep-inventory', '--root', str(root), '--state', str(state),
                                       '--network', '--inventory-pass', 'followup', '--inventory-lane', 'ir']), 0)
            result = json.loads(output.getvalue())
            self.assertEqual(result['stopReason'], 'CIRCUIT_OPEN')
            self.assertTrue(result['deferred'])
            self.assertTrue(result['circuit']['open'])
            store = Store(state / 'state.sqlite')
            saved = store.state('discoveryCircuit:ir')
            self.assertTrue(saved['open'])
            self.assertGreater(saved['retryAfter'], saved['checkedAt'])
            self.assertEqual(store.state('officialSite:' + cid)['status'], 'VALIDATED')
            self.assertNotIn('lastChecked', next(s for s in store.sources() if s['sourceId'] == '4'))
            store.close()

    def test_shared_followup_failure_stops_before_unsent_source_and_retains_health(self):
        with tempfile.TemporaryDirectory() as tmp:
            requests = []
            def opener(request, **kwargs):
                requests.append(request.full_url)
                raise urllib.error.HTTPError(request.full_url, 503, 'Unavailable', {},
                    io.BytesIO(b'upstream connect error or disconnect/reset before headers'))
            http = PublicHTTP(Path(tmp) / 'http', budget=100, interval=0, sleep=lambda _: None,
                              opener=opener, validator=lambda url: url)
            store = Store(Path(tmp) / 'state.sqlite')
            issuer = company()
            for i in range(6):
                store.source({'sourceId': str(i), 'companyId': issuer['companyId'], 'type': 'RSS',
                              'url': 'https://host' + str(i) + '.example/feed', 'active': True})
            pipeline = Pipeline(tmp, {issuer['companyId']: issuer}, store, http, NOW)
            circuit = DiscoveryCircuit()
            original = http.opener, http._wait
            with self.assertRaisesRegex(BudgetExhausted, 'SHARED_INFRASTRUCTURE'):
                with guarded_poll(http, circuit):
                    pipeline.ingest_due_sources({issuer['companyId']}, include_global=False)
            self.assertEqual((http.opener, http._wait), original)
            self.assertTrue(circuit.snapshot()['open'])
            self.assertEqual(circuit.snapshot()['signature'], 'SHARED_PROXY_FAILURE')
            self.assertEqual(len(circuit.snapshot()['affectedHosts']), 4)
            self.assertLessEqual(len(requests), 10)
            self.assertFalse(any('host4.' in url or 'host5.' in url for url in requests))
            sources = {s['sourceId']: s for s in store.sources()}
            self.assertEqual(sources['0']['failureCount'], 1)
            self.assertIn('HTTP_503', sources['0']['lastError'])
            self.assertGreater(sources['0']['nextCheck'], NOW)
            self.assertNotIn('lastChecked', sources['4'])
            store.close()

    def test_one_origin_failure_and_access_denial_do_not_open_circuit(self):
        with tempfile.TemporaryDirectory() as tmp:
            def opener(request, **kwargs):
                code = 503 if 'origin' in request.full_url else 403
                raise urllib.error.HTTPError(request.full_url, code, 'Unavailable', {}, io.BytesIO(b'origin failure'))
            http = PublicHTTP(tmp, budget=100, interval=0, sleep=lambda _: None,
                              opener=opener, validator=lambda url: url)
            circuit = DiscoveryCircuit()
            with guarded_poll(http, circuit):
                for url in ['https://origin.example/feed'] * 2 + ['https://denied' + str(i) + '.example/feed' for i in range(4)]:
                    with self.assertRaises(SourceError):
                        http.get(url, robots=False)
            self.assertFalse(circuit.snapshot()['open'])

    def test_success_clears_unrelated_origin_streak(self):
        class HTTP:
            def _wait(self, url):
                pass
            def opener(self, request, **kwargs):
                return object()
        import urllib.request
        circuit = DiscoveryCircuit()
        for i in range(3):
            circuit.failure('https://host' + str(i) + '.example', SourceError('HTTP_503'))
        http = HTTP()
        with guarded_poll(http, circuit):
            http.opener(urllib.request.Request('https://healthy.example/feed'))
        circuit.failure('https://later.example', SourceError('HTTP_503'))
        self.assertFalse(circuit.snapshot()['open'])

    def test_ir_outage_keeps_its_cooldown_while_domain_lane_verifies(self):
        import contextlib
        from company_intelligence.cli import main
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); state = root / 'state'
            config = root / 'company-intelligence/config'; config.mkdir(parents=True)
            (config / 'official-sites.json').write_text('{}')
            issuer = company(); issuer['officialSites'] = []; cid = issuer['companyId']
            store = Store(state / 'state.sqlite')
            ir_failure = {'open': True, 'signature': 'SHARED_PROXY_FAILURE',
                          'retryAfter': '2099-01-01T00:00:00Z', 'affectedHosts': ['ir.example']}
            store.set_state('discoveryCircuit:ir', ir_failure)
            store.set_state('siteCandidates:' + cid, {'status': 'CANDIDATE',
                'candidates': [{'url': 'https://apple.com/', 'evidence': 'EXACT_CIK'}]})
            store.close(); verified = []
            def verify(owner, candidate, http, now):
                verified.append(owner['companyId'])
                return {'status': 'VALIDATED', 'url': candidate['url'], 'lastVerified': now}
            def invoke(lane):
                output = io.StringIO()
                with patch('company_intelligence.cli.load_universe', return_value={cid: issuer}), \
                     patch('company_intelligence.site_inventory.import_inventory'), \
                     patch('company_intelligence.discovery_batch.validate_candidate', side_effect=verify), \
                     contextlib.redirect_stdout(output):
                    main(['sweep-inventory', '--root', str(root), '--state', str(state),
                          '--network', '--inventory-pass', 'isolated', '--inventory-lane', lane])
                return json.loads(output.getvalue())
            self.assertEqual(invoke('ir')['stopReason'], 'CIRCUIT_COOLDOWN')
            self.assertEqual(verified, [])
            self.assertEqual(invoke('domains')['stopReason'], 'BATCH_COMPLETED')
            self.assertEqual(verified, [cid])
            store = Store(state / 'state.sqlite')
            self.assertEqual(store.state('discoveryCircuit:ir'), ir_failure)
            self.assertFalse(store.state('discoveryCircuit:domains')['open'])
            self.assertEqual(store.state('officialSite:' + cid)['status'], 'VALIDATED')
            store.close()

    def test_unscoped_legacy_outage_blocks_both_lanes_without_resetting_due_time(self):
        import contextlib
        from company_intelligence.cli import main
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); state = root / 'state'
            config = root / 'company-intelligence/config'; config.mkdir(parents=True)
            (config / 'official-sites.json').write_text('{}')
            issuer = company(); cid = issuer['companyId']; store = Store(state / 'state.sqlite')
            legacy = {'open': True, 'signature': 'SHARED_PROXY_FAILURE', 'retryAfter': '2099-01-01T00:00:00Z'}
            store.set_state('discoveryCircuit', legacy); store.close()
            for lane in ('domains', 'ir'):
                output = io.StringIO()
                with patch('company_intelligence.cli.load_universe', return_value={cid: issuer}), \
                     patch('company_intelligence.site_inventory.import_inventory'), \
                     patch('company_intelligence.discovery_batch.run', side_effect=AssertionError('COOLDOWN_BYPASSED')), \
                     contextlib.redirect_stdout(output):
                    main(['sweep-inventory', '--root', str(root), '--state', str(state),
                          '--network', '--inventory-pass', 'legacy', '--inventory-lane', lane])
                result = json.loads(output.getvalue())
                self.assertEqual(result['stopReason'], 'CIRCUIT_COOLDOWN')
                self.assertEqual(result['requests'], 0)
                self.assertEqual(result['circuit']['retryAfter'], legacy['retryAfter'])
            store = Store(state / 'state.sqlite')
            self.assertEqual(store.state('discoveryCircuit'), legacy)
            self.assertIsNone(store.state('discoveryCircuit:domains'))
            self.assertIsNone(store.state('discoveryCircuit:ir')); store.close()
