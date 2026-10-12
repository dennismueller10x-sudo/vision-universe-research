import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from company_intelligence.source_onboarding import candidate_inventory, proven, onboard, safe_failure_detail, registered_repair_sources
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
if __name__ == '__main__': unittest.main()
