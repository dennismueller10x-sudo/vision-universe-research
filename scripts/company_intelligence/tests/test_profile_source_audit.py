import unittest
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
from company_intelligence.profile_source_audit import source_profile_status, audit
from company_intelligence.store import Store

CID = 'iss_cik_0001652130'
NOW = '2026-10-12T09:52:45Z'
def profile(description='Example Therapeutics develops clinical-stage treatments for cancer.', language='en'):
    return {'schema': 'company-profile-1.0.0', 'state': 'AVAILABLE', 'companyId': CID, 'companyName': 'Example Therapeutics',
            'description': description, 'language': language, 'confidence': 'HIGH', 'lastVerifiedAt': '2026-10-05T10:00:00Z',
            'businessActivities': [description], 'productsServices': [], 'customerMarkets': [], 'majorSegments': [],
            'sources': [{'companyId': CID, 'type': 'SEC', 'url': 'https://www.sec.gov/Archives/edgar/data/1652130/annual.htm',
                         'form': '10-K', 'filedAt': '2026-02-26', 'contentHash': 'a' * 64}]}

class ProfileSourceAuditTests(unittest.TestCase):
    def test_cli_string_paths_are_normalized_and_fresh_ledger_stays_unchanged(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); state = root / 'state'; state.mkdir()
            config = root / 'company-intelligence/config'; config.mkdir(parents=True)
            (config / 'company-profiles.json').write_text(json.dumps({'profiles': {CID: profile()}}))
            (config / 'sources.json').write_text('[]')
            decisions = root / 'eligibility.json'
            decisions.write_text(json.dumps({'issuers': {CID: {'hasPrivatePayload': True, 'status': 'ELIGIBLE_PARTIAL', 'modules': {'profile': False}}}}))
            store = Store(state / 'state.sqlite'); store.set_state('companyProfile:' + CID, profile()); store.close()
            def identity(path, store):
                self.assertIsInstance(path, Path)
                return {CID: {'companyId': CID, 'cik': '0001652130', 'names': ['Example Therapeutics'], 'listings': []}}
            with patch('company_intelligence.profile_source_audit.ROOT', root), patch('company_intelligence.profile_source_audit.identities', side_effect=identity):
                report = audit(str(state), str(root), str(decisions), str(root / 'audit.json'), now=NOW)
            self.assertEqual(report['privateIssuers'], 1)
            self.assertEqual(report['stages']['matchedCommittedEnglishInputs'], 1)
            self.assertEqual(report['remoteWrites'], 0)
    def test_missing_translation_is_not_missing_source(self):
        self.assertEqual(source_profile_status(profile(), CID, NOW), 'SOURCE_AVAILABLE_NO_DE_COPY')
        self.assertEqual(source_profile_status(None, CID, NOW), 'NO_PROFILE_SOURCE')
        self.assertEqual(source_profile_status(profile(), CID, NOW, mapping_ok=False), 'MAPPING_BLOCKED')

    def test_profile_fragment_and_competitive_claim_are_not_consumer_ready(self):
        for text in ['Example Therapeutics is the first company to advance genome editing into Phase 3 development.',
                     'Example Therapeutics makes it a priority to protect the privacy of its products and users.']:
            self.assertEqual(source_profile_status(profile(text), CID, NOW), 'SOURCE_AVAILABLE_WEAK')
        retired = {**profile(), 'state': 'UNAVAILABLE', 'priorState': 'AVAILABLE'}
        self.assertEqual(source_profile_status(retired, CID, NOW), 'SOURCE_AVAILABLE_WEAK')

    def test_unverified_web_and_wrong_sec_issuer_are_not_approved(self):
        p = profile(); p['sources'][0]['url'] = 'https://www.sec.gov/Archives/edgar/data/320193/annual.htm'
        self.assertEqual(source_profile_status(p, CID, NOW), 'SOURCE_POLICY_BLOCKED')
        p = profile(); p['sources'][0].update(type='FIRST_PARTY_WEB', url='https://example.com/about')
        self.assertEqual(source_profile_status(p, CID, NOW), 'SOURCE_POLICY_BLOCKED')
        self.assertEqual(source_profile_status(p, CID, NOW, source_conflict=True), 'SOURCE_CONFLICT')
        self.assertEqual(source_profile_status(p, CID, NOW, web_owned=True), 'SOURCE_AVAILABLE_NO_DE_COPY')

    def test_approved_german_is_separate_from_pollable_news_and_stale_source(self):
        p = profile('Example Therapeutics entwickelt klinische Wirkstoffkandidaten zur Behandlung von Krebserkrankungen.', 'de')
        self.assertEqual(source_profile_status(p, CID, NOW), 'PROFILE_APPROVED_DE')
        p['sources'][0]['filedAt'] = '2023-01-01'
        self.assertEqual(source_profile_status(p, CID, NOW), 'SOURCE_AVAILABLE_WEAK')

if __name__ == '__main__':
    unittest.main()
