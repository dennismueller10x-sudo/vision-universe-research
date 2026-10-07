import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from quant.sec.http_client import SECHTTPError
from company_intelligence.sec_site_runner import run_batch
from company_intelligence.store import Store

NOW = '2026-10-06T12:00:00Z'


class SecSiteRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name) / 'state.sqlite')
        self.addCleanup(self.store.close)
        self.companies = {str(i): {'companyId': str(i), 'cik': str(i).zfill(10)} for i in range(8)}
        self.provider = type('Provider', (), {'client': type('Client', (), {'stats': {'requests': 0}})()})()

    def result(self, company, provider, now):
        provider.client.stats['requests'] += 2
        return {'status': 'CANDIDATES', 'candidates': [{'url': 'https://issuer' + company['companyId'] + '.com/',
                'evidence': 'SEC_PRIMARY_ANNUAL_DECLARED_SITE_CANDIDATE_ONLY'}]}

    def test_frozen_inventory_resumes_next_candidate_and_preserves_conflicts(self):
        self.store.set_state('siteCandidates:0', {'candidates': [{'url': 'https://other.com/'}]})
        with patch('company_intelligence.sec_site_runner.collect', side_effect=self.result) as fetch:
            first = run_batch(self.store, self.companies, self.provider, 'fixture', NOW, request_budget=4)
            self.assertEqual((first['classified'], first['pending'], first['requests']), (2, 6, 4))
            second = run_batch(self.store, self.companies, self.provider, 'fixture', NOW, request_budget=4)
            self.assertEqual([call.args[0]['companyId'] for call in fetch.call_args_list], ['0', '1', '2', '3'])
            self.assertEqual(second['classified'], 4)
        self.assertEqual(self.store.state('siteCandidates:0')['status'], 'AMBIGUOUS')
        self.assertEqual(len(self.store.state('siteCandidates:0')['candidates']), 2)
        self.assertIsNone(self.store.state('officialSite:0'))

    def test_shared_failure_opens_circuit_and_cooldown_then_recovers_without_restart(self):
        def failure(company, provider, now):
            provider.client.stats['requests'] += 1
            raise SECHTTPError('https://www.sec.gov/', 503, 'Envoy', 1)
        with patch('company_intelligence.sec_site_runner.collect', side_effect=failure) as fetch:
            first = run_batch(self.store, self.companies, self.provider, 'failure', NOW)
            self.assertEqual((first['stopReason'], first['processed'], first['pending']), ('CIRCUIT_OPEN', 4, 4))
            cooling = run_batch(self.store, self.companies, self.provider, 'failure', NOW)
            self.assertEqual(cooling['stopReason'], 'CIRCUIT_COOLDOWN')
            self.assertEqual(fetch.call_count, 4)
        with patch('company_intelligence.sec_site_runner.collect', side_effect=self.result) as fetch:
            recovery = run_batch(self.store, self.companies, self.provider, 'failure', '2026-10-06T12:16:00Z')
            self.assertEqual([c.args[0]['companyId'] for c in fetch.call_args_list], ['4', '5', '6', '7'])
            self.assertEqual(recovery['statuses'], {'TEMPORARY_FAILURE': 4, 'CANDIDATES': 4})
            recovered = run_batch(self.store, self.companies, self.provider, 'failure', '2026-10-06T14:01:00Z')
            self.assertEqual(recovered['statuses'], {'CANDIDATES': 8})

    def test_crash_keeps_completed_candidate_and_retries_only_unfinished(self):
        def crash(company, provider, now):
            if company['companyId'] == '1': raise OSError('interrupted process')
            return self.result(company, provider, now)
        with patch('company_intelligence.sec_site_runner.collect', side_effect=crash):
            with self.assertRaises(OSError): run_batch(self.store, self.companies, self.provider, 'crash', NOW)
        with patch('company_intelligence.sec_site_runner.collect', side_effect=self.result) as fetch:
            run_batch(self.store, self.companies, self.provider, 'crash', NOW, limit=1)
            self.assertEqual(fetch.call_args.args[0]['companyId'], '1')
        self.assertEqual(self.store.state('secSiteCandidates:crash:0')['status'], 'CANDIDATES')


if __name__ == '__main__': unittest.main()
