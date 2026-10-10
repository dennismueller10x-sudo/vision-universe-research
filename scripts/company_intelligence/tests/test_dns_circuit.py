import socket
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError
from company_intelligence.discovery_circuit import DiscoveryCircuit, failure_signature, guarded_poll
from company_intelligence.discovery_batch import run
from company_intelligence.transport import PublicHTTP, SourceError, validate_public_url
from test_engine import company, NOW


class DNSCircuitTests(unittest.TestCase):
    def test_temporary_resolution_retains_transport_cause_and_ordinary_nxdomain_does_not_trip(self):
        for code, signature in [(socket.EAI_AGAIN, 'SUSPECTED_SHARED_TEMPORARY_DNS'),
                                (socket.EAI_NONAME, None)]:
            with self.subTest(code=code):
                def resolve(*args, **kwargs):
                    raise socket.gaierror(code, 'resolver failure')
                with self.assertRaises(SourceError) as caught:
                    validate_public_url('https://issuer.example/', resolve=resolve)
                self.assertEqual(str(caught.exception), 'DNS_UNAVAILABLE')
                self.assertEqual(failure_signature(caught.exception), signature)

    def test_urlerror_reason_is_inspected_and_unrelated_hosts_are_required(self):
        circuit = DiscoveryCircuit()
        error = URLError(socket.gaierror(socket.EAI_AGAIN, 'temporary resolver failure'))
        for _ in range(10):
            circuit.failure('https://one.example/', error)
        self.assertFalse(circuit.snapshot()['open'])
        for host in ('two', 'three', 'four'):
            circuit.failure('https://' + host + '.example/', error)
        self.assertEqual(circuit.snapshot()['signature'], 'SUSPECTED_SHARED_TEMPORARY_DNS')
        self.assertTrue(circuit.snapshot()['open'])

    def test_batch_checkpoints_four_temporary_results_and_leaves_unsent_candidates_pending(self):
        companies = [company('Issuer '+str(i)+' Inc.', 'I'+str(i), str(i+1).zfill(10)) for i in range(8)]
        for issuer in companies:
            issuer['officialSites'] = []
        candidates = {c['companyId']: {'status': 'CANDIDATE', 'candidates': [{'url': 'https://issuer'+str(i)+'.example/'}]}
                      for i, c in enumerate(companies)}
        def fail(*args):
            raise SourceError('ROBOTS_UNAVAILABLE:DNS_UNAVAILABLE') from socket.gaierror(socket.EAI_AGAIN, 'temporary resolver failure')
        circuit = DiscoveryCircuit()
        with tempfile.TemporaryDirectory() as tmp, patch('company_intelligence.discovery_batch.validate_candidate', fail):
            results = run(companies, candidates, PublicHTTP(tmp), NOW, 32, 30,
                          workers=1, domain_only=True, circuit=circuit)
        self.assertEqual(len(results), 4)
        self.assertTrue(all(r['status'] == 'DEFERRED' and r['reason'] == 'ROBOTS_UNAVAILABLE:DNS_UNAVAILABLE' for r in results))
        self.assertEqual(sum(r['requests'] for r in results), 0)
        self.assertTrue(circuit.snapshot()['open'])

    def test_serial_poll_observes_dns_validation_before_opener_and_restores_getter(self):
        def validate(url):
            raise SourceError('DNS_UNAVAILABLE') from socket.gaierror(socket.EAI_AGAIN, 'temporary resolver failure')
        with tempfile.TemporaryDirectory() as tmp:
            http = PublicHTTP(tmp, validator=validate)
            original = http.get
            circuit = DiscoveryCircuit()
            with guarded_poll(http, circuit):
                for host in ('one', 'two', 'three', 'four'):
                    with self.assertRaises(SourceError):
                        http.get('https://' + host + '.example/feed', robots=False)
            self.assertTrue(circuit.snapshot()['open'])
            self.assertEqual(http.get, original)
            self.assertEqual(http.requests, 0)
