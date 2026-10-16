import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from company_intelligence.source_onboarding import record_onboarding_progress, candidate_inventory, proven, onboard, safe_failure_detail, registered_repair_sources, ownership_company
from company_intelligence.store import Store
from company_intelligence.top46_content import matching_resolver

CID = 'iss_cik_0001652130'
SOURCE = {'sourceId': 'owned', 'companyId': CID, 'verified': True, 'active': True, 'type': 'IR_FEED', 'provider': 'GCS',
          'url': 'https://ir.intelliatx.com/rss/news-releases.xml', 'allowedSites': ['https://ir.intelliatx.com/']}
class SourceOnboardingTests(unittest.TestCase):
    def test_current_master_international_rows_without_sec_cik_remain_resolvable(self):
        companies = {'issuer-global': {'companyId': 'issuer-global', 'cik': None, 'names': ['Example Global'], 'listings': [{'symbol': 'EXG'}]},
                     CID: {'companyId': CID, 'cik': '0001652130', 'names': ['Intellia Therapeutics'], 'listings': [{'symbol': 'NTLA'}]}}
        with tempfile.TemporaryDirectory() as directory:
            resolver = matching_resolver(companies, Path(directory))
        self.assertEqual(set(resolver.companies), set(companies))
    def test_owner_legal_alias_requires_exact_cik_and_complete_base_without_master_mutation(self):
        company={'companyId':CID,'cik':'0001652130','names':['Example Therapeutics'],'listings':[]}
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);path=root/'quant/data/sec/consumer/CIK0001652130.json';path.parent.mkdir(parents=True)
            for data,accepted in [({'cik':'0001652130','name':'Example Therapeutics Corp'},True),
                                  ({'cik':'0000320193','name':'Example Therapeutics Corp'},False),
                                  ({'cik':'0001652130','name':'Example Therapeutics Japan LLC'},False)]:
                path.write_text(json.dumps({**data,'asOf':'2026-10-05'}));value,reference=ownership_company(company,root,'2026-10-12T00:00:00Z')
                self.assertEqual(bool(reference),accepted)
                self.assertEqual(company['names'],['Example Therapeutics'])
                if accepted:self.assertIn(data['name'],value['names'])
                else:self.assertEqual(value,company)
            for asof in [None,'2025-01-01','2027-01-01','not-a-date']:
                path.write_text(json.dumps({'cik':'0001652130','name':'Example Therapeutics Corp','asOf':asof}))
                value,reference=ownership_company(company,root,'2026-10-12T00:00:00Z')
                self.assertIsNone(reference);self.assertEqual(value,company)
    def test_existing_owned_feed_repair_never_grants_new_ownership(self):
        official = {'status': 'VALIDATED', 'url': 'https://www.intelliatx.com/'}
        source = {**SOURCE, 'allowedSites': ['https://www.intelliatx.com/', 'https://ir.intelliatx.com/']}
        self.assertEqual(registered_repair_sources([source], CID, official), [source])
        for change in [{'verified': False}, {'active': False}, {'companyId': 'other'}, {'type': 'IR_EVENTS'},
                       {'url': 'https://publisher.example/news'}, {'allowedSites': ['https://other.example/']}]:
            self.assertEqual(registered_repair_sources([{**source, **change}], CID, official), [])
        for status in ['REJECTED', 'CONFLICTING_OWNER', 'WRONG_COMPANY', 'AMBIGUOUS']:
            self.assertEqual(registered_repair_sources([source], CID, {**official, 'status': status}), [])
    def test_safe_robots_diagnostics_never_expose_provider_text(self):
        self.assertEqual(safe_failure_detail(ValueError('ROBOTS_UNAVAILABLE:HTTP_403')), 'HTTP_403')
        self.assertEqual(safe_failure_detail(ValueError('ROBOTS_UNAVAILABLE:NETWORK_ERROR')), 'NETWORK_ERROR')
        for message in ['ROBOTS_UNAVAILABLE:https://secret.example/token', 'ROBOTS_UNAVAILABLE:HTTP_403:body', 'HTTP_403']:
            self.assertIsNone(safe_failure_detail(ValueError(message)))
    def test_registered_urls_are_not_polling_proof(self):
        self.assertEqual(proven([SOURCE], CID), [])
        self.assertEqual(len(proven([{**SOURCE, 'lastSuccess': '2026-10-05T10:00:00Z'}], CID)), 1)
        self.assertEqual(proven([{**SOURCE, 'lastSuccess': '2026-10-05T10:00:00Z', 'pollabilityStatus':'PROVISIONAL'}], CID), [])
        self.assertEqual(len(proven([{**SOURCE, 'lastSuccess':'2026-10-05T10:00:00Z','pollabilityStatus':'POLLABLE_APPROVED'}], CID)), 1)
        for alteration in [{'verified': False}, {'active': False}, {'unsupported': True}, {'url': 'https://globenewswire.com/feed'}, {'companyId': 'other'}]:
            self.assertEqual(proven([{**SOURCE, 'lastSuccess': '2026-10-05T10:00:00Z', **alteration}], CID), [])
    def test_reviewed_root_is_a_candidate_and_never_unconditional_ownership(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); config = root / 'company-intelligence/config'; config.mkdir(parents=True)
            (config / 'official-sites.json').write_text('{}')
            store = Store(root / 'state.sqlite'); store.set_state('financials:' + CID, {'state': 'AVAILABLE'})
            try:
                with patch('company_intelligence.source_onboarding.ROOT', root):
                    result = candidate_inventory({CID: {'cik': '0001652130'}}, store, [], {'candidates': {CID: {'url': 'https://www.intelliatx.com/'}}})
                    self.assertEqual(result[0]['kind'], 'MISSING_PROVEN_SOURCE')
                    self.assertEqual(candidate_inventory({CID: {'cik': '0001652130'}}, store, [], {'candidates': {CID: {'url': 'https://globenewswire.com/news'}}}), [])
                self.assertIsNone(store.state('officialSite:' + CID))
            finally: store.close()
    def test_provisional_source_awaiting_repeat_is_not_rediscovered(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);config=root/'company-intelligence/config';config.mkdir(parents=True)
            (config/'official-sites.json').write_text('{}')
            store=Store(root/'state.sqlite');store.set_state('financials:'+CID,{'state':'AVAILABLE'})
            try:
                pending={**SOURCE,'lastSuccess':'2026-10-12T10:00:00Z','pollabilityStatus':'PROVISIONAL'}
                self.assertEqual(candidate_inventory({CID:{'cik':'0001652130'}},store,[pending],{'candidates':{CID:{'url':'https://www.intelliatx.com/'}}}),[])
            finally:store.close()
    def test_absent_or_smaller_private_state_is_never_initialized(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, 'CURRENT_FULL_RESTORED_STATE_REQUIRED'):
                onboard(root, root / 'report.json', 'test')
            self.assertFalse((root / 'state.sqlite').exists())
            store = Store(root / 'state.sqlite'); store.close()
            (root / 'latest-run.json').write_text(json.dumps({'privateCompanies': 1}))
            with self.assertRaisesRegex(ValueError, 'FULL_PRIVATE_UNIVERSE_REQUIRED'):
                onboard(root, root / 'report.json', 'test')
class OnboardingGlobalStampTests(unittest.TestCase):
    def test_onboarding_sets_news_lane_but_never_global_stamp(self):
        import inspect, company_intelligence.source_onboarding as module
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'state.sqlite')
            try:
                store.source({**SOURCE, 'lastSuccess': '2026-10-09T12:00:00Z'})
                store.set_state('continuousRefresh', {'lastSuccessfulRefresh': '2026-10-09T04:00:00Z', 'lastSuccessfulNewsRefresh': '2026-10-09T04:00:00Z'})
                record_onboarding_progress(store, '2026-10-09T12:00:00Z')
                state = store.state('continuousRefresh', {})
                self.assertEqual(state['lastSuccessfulRefresh'], '2026-10-09T04:00:00Z')
                self.assertEqual(state['lastSuccessfulNewsRefresh'], '2026-10-09T12:00:00Z')
                store.set_state('continuousRefresh', {})
                record_onboarding_progress(store, '2026-10-09T12:00:00Z')
                self.assertNotIn('lastSuccessfulRefresh', store.state('continuousRefresh', {}))
            finally:
                store.close()
        self.assertNotIn("'lastSuccessfulRefresh'", inspect.getsource(module))
        self.assertIn('record_onboarding_progress(store, stamp)', inspect.getsource(module.onboard))

if __name__ == '__main__': unittest.main()
