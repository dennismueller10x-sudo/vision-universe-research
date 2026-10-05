import copy
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from company_intelligence.profiles import extract, public_profile, annual_filing, VERSION
from company_intelligence.profile_backfill import run, refresh_cached_sec
from company_intelligence.store import Store
from company_intelligence.pipeline import Pipeline
from company_intelligence.transport import PublicHTTP, SourceError, BudgetExhausted
from company_intelligence.coverage import report
from company_intelligence.product import project
from company_intelligence.checkpoint import pack, restore
from quant.sec.http_client import DiskCache

NOW = '2026-10-05T12:00:00Z'
CID = 'iss_cik_0000000001'
COMPANY = {'companyId': CID, 'cik': '0000000001', 'names': ['Example Holdings Inc.'],
           'officialSites': [], 'listings': [{'symbol': 'EXMP', 'instrumentId': 'vu_aaaaaaaaaaaaaa', 'exchange': 'NASDAQ'}]}
TEXT = b'<html lang="en"><p>Example Holdings Inc. develops software platforms for banks and insurance companies.</p></html>'
WEB = {'type': 'FIRST_PARTY_WEB', 'url': 'https://example.com/about', 'ownershipVerified': True}


def submissions(acc='0000000001-26-000001', date='2026-03-05'):
    return {'cik': '0000000001', 'filings': {'recent': {'accessionNumber': [acc], 'form': ['10-K'],
            'filingDate': [date], 'primaryDocument': ['annual.htm']}}}


class ProfileTests(unittest.TestCase):
    def test_factual_web_profile_is_bounded_with_source_evidence_and_no_guessed_products(self):
        p = extract(COMPANY, TEXT, WEB, NOW, 'https://example.com/')
        self.assertEqual(p['state'], 'AVAILABLE')
        self.assertEqual(p['productsServices'], [])
        self.assertEqual(p['customerMarkets'], [])
        self.assertNotIn('employeeCount', p)
        self.assertEqual(p['sources'][0]['evidence'], ['Example Holdings Inc. develops software platforms for banks and insurance companies.'])
        self.assertEqual(p['nextReviewAt'], '2027-01-03T12:00:00Z')

    def test_marketing_is_removed_and_employee_speculation_and_navigation_are_excluded(self):
        body = b'<nav>Example Holdings Inc. provides bank services for navigation.</nav><script>Example Holdings Inc. operates a bank.</script><p>Example Holdings Inc. is a leading provider of software products for banks.</p><p>Example Holdings Inc. has 500 employees.</p><p>Example Holdings Inc. will develop revolutionary insurance solutions.</p>'
        p = extract(COMPANY, body, WEB, NOW)
        self.assertEqual(p['description'], 'Example Holdings Inc. is a provider of software products for banks.')
        self.assertNotIn('500', json.dumps(p))

    def test_parent_subsidiary_customer_and_same_name_extensions_abstain(self):
        for text in ['Example Holdings Inc. Japan LLC develops software platforms for banks.',
                     'Example Inc. develops software products for retailers worldwide.',
                     'Other Inc. provides software services to Example Holdings Inc.',
                     'Example Holdings Inc. announced that Other Inc. provides insurance services.']:
            self.assertEqual(extract(COMPANY, ('<p>' + text + '</p>').encode(), WEB, NOW)['state'], 'UNAVAILABLE')
        with self.assertRaises(SourceError):
            extract(COMPANY, TEXT, {**WEB, 'companyId': 'iss_cik_0000000002'}, NOW)
        with self.assertRaises(SourceError):
            extract(COMPANY, TEXT, {**WEB, 'ownershipVerified': False}, NOW)

    def test_annual_section_avoids_table_of_contents_and_risk_factor_business_mentions(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>3</p><h2>Item 1A. Risk Factors</h2><p>4</p><h2>Item 1. Business</h2><h3>Overview</h3><p>We design software products for financial institutions.</p><h2>Item 1A. Risk Factors</h2><p>We sell insurance services through an unrelated risk-factor example.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertEqual(p['description'], 'Example Holdings Inc. designs software products for financial institutions.')
        self.assertEqual(p['confidence'], 'HIGH')
        self.assertEqual(p['refreshPolicy'], 'NEW_ANNUAL_FILING')
        self.assertIsNone(p['nextReviewAt'])
        wrong = {**source, 'url': source['url'].replace('/data/1/', '/data/2/')}
        with self.assertRaises(SourceError):
            extract(COMPANY, body, wrong, NOW)
        self.assertIsNone(annual_filing(COMPANY, {**submissions(), 'cik': '0000000002'}, NOW))

    def test_foreign_private_issuer_20f_business_overview_is_identity_scoped(self):
        data = submissions(); data['filings']['recent']['form'] = ['20-F']
        source = annual_filing(COMPANY, data, NOW)
        p = extract(COMPANY, b'<h2>Item 4. Information on the Company</h2><h3>B. Business Overview</h3><p>We manufacture electric vehicles for consumer markets.</p><h2>Item 5. Operating and Financial Review</h2>', source, NOW)
        self.assertEqual(p['state'], 'AVAILABLE')
        self.assertIn('manufactures electric vehicles', p['description'])
        self.assertEqual(extract(COMPANY, b'<p>We manufacture electric vehicles for consumers.</p>', source, NOW)['state'], 'UNAVAILABLE')

    def test_non_english_sources_private_urls_and_future_verification_abstain(self):
        self.assertEqual(extract(COMPANY, TEXT.replace(b'lang="en"', b'lang="de"'), WEB, NOW)['reason'], 'UNSUPPORTED_SOURCE_LANGUAGE')
        with self.assertRaises(SourceError):
            extract(COMPANY, TEXT, {**WEB, 'url': 'http://127.0.0.1/about'}, NOW)
        p = extract(COMPANY, TEXT, WEB, NOW)
        self.assertIsNone(public_profile(p, CID, '2026-10-01T00:00:00Z'))
        self.assertIsNone(public_profile(p, 'iss_cik_0000000002', NOW))

    def test_public_projection_strips_private_excerpts_and_operational_state(self):
        p = extract(COMPANY, TEXT, WEB, NOW)
        p['checkpoint'] = 'private'; p['sources'][0]['secret'] = 'private'
        q = public_profile(p, CID, NOW)
        self.assertNotIn('evidence', q['sources'][0])
        self.assertNotIn('checkpoint', q)
        self.assertNotIn('secret', q['sources'][0])
        self.assertTrue(public_profile(p, CID, '2027-10-05T12:00:00Z')['stale'])

    def test_profile_only_issuer_is_exported_and_profile_edits_change_immutable_generation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); store = Store(root / 'state.sqlite')
            self.assertEqual(store.company_payload(COMPANY, NOW)['state'], 'NO_DATA')
            p = extract(COMPANY, TEXT, WEB, NOW); store.set_state('companyProfile:' + CID, p)
            payload = store.company_payload(COMPANY, NOW)
            self.assertEqual(payload['state'], 'AVAILABLE')
            self.assertIn('companyProfile', project(payload))
            first = store.export({CID: COMPANY}, root / 'out', NOW)
            p['description'] += ' Example Holdings Inc. serves insurance customers.'
            store.set_state('companyProfile:' + CID, p)
            second = store.export({CID: COMPANY}, root / 'out', NOW)
            self.assertNotEqual(first['generation'], second['generation'])
            coverage = report(store, {CID: COMPANY}, NOW)
            self.assertEqual(coverage['companyProfiles']['available'], 1)
            self.assertEqual(coverage['counts']['anyNews']['companies'], 0)
            self.assertEqual(coverage['counts']['consumerPayloadAvailable']['companies'], 1)
            store.close()

    def test_checkpoint_restore_preserves_profiles_without_recreating_discovery_or_poll_state(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); state = root / 'state'; state.mkdir(); store = Store(state / 'state.sqlite')
            p = extract(COMPANY, TEXT, WEB, NOW)
            store.set_state('companyProfile:' + CID, p)
            store.set_state('inventorySweep:existing:ir:inventory', [CID])
            store.source({'sourceId': 'existing', 'companyId': CID, 'type': 'IR_FEED', 'failureCount': 3, 'nextCheck': '2026-10-12T00:00:00Z'})
            store.close(); packed = pack(state, root / 'snapshot.tar.gz'); restore(root / 'snapshot.tar.gz', root / 'restored', packed['sha256'])
            restored = Store(root / 'restored/state.sqlite')
            self.assertEqual(restored.state('companyProfile:' + CID), p)
            self.assertEqual(restored.state('inventorySweep:existing:ir:inventory'), [CID])
            self.assertEqual(restored.sources()[0]['failureCount'], 3)
            restored.close()

    def test_cached_annual_documents_reused_once_and_new_filing_drives_refresh(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); store = Store(root / 'state.sqlite'); cache = DiskCache(root / '.sec-cache', ttl_seconds=None)
            meta = submissions(); filing = annual_filing(COMPANY, meta, NOW)
            body = b'<h2>Item 1. Business</h2><p>We manufacture software products for financial institutions.</p>'
            cache.put(filing['url'], body)
            p = refresh_cached_sec(root, store, COMPANY, meta, NOW)
            with patch('company_intelligence.profile_backfill.extract', side_effect=AssertionError('unchanged filing parsed twice')):
                self.assertEqual(refresh_cached_sec(root, store, COMPANY, meta, '2026-10-06T12:00:00Z'), p)
            changed = submissions('0000000001-26-000002', '2026-09-30'); new = annual_filing(COMPANY, changed, NOW)
            cache.put(new['url'], body.replace(b'manufacture', b'develop'))
            self.assertIn('develops', refresh_cached_sec(root, store, COMPANY, changed, NOW)['description'])
            store.close()

    def test_missing_evidence_is_checkpointed_and_second_pass_does_no_network(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); store = Store(root / 'state.sqlite'); http = PublicHTTP(root / 'http')
            pipeline = Pipeline(root, {CID: COMPANY}, store, http, NOW)
            result = run(pipeline, [COMPANY], {}, limit=1)
            self.assertEqual(result['outcomes']['UNAVAILABLE'], 1)
            before = store.state('profileAttempt:' + CID)
            with patch.object(http, 'get', side_effect=AssertionError('unnecessary HTTP')):
                result = run(pipeline, [COMPANY], {}, allow_network=True, limit=1)
            self.assertEqual(result['attempted'], 0)
            self.assertEqual(result['outcomes']['NOT_DUE'], 1)
            self.assertEqual(store.state('profileAttempt:' + CID), before)
            self.assertIsNone(store.state('companyProfile:' + CID))
            store.close()

    def test_budget_exhaustion_remains_pending_and_prior_profile_survives_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); store = Store(root / 'state.sqlite'); http = PublicHTTP(root / 'http')
            pipeline = Pipeline(root, {CID: COMPANY}, store, http, NOW)
            sites = {'0000000001': {'url': 'https://example.com/'}}
            with patch.object(http, 'get', side_effect=BudgetExhausted('NETWORK_BUDGET_EXHAUSTED')):
                result = run(pipeline, [COMPANY], sites, allow_network=True, limit=1)
            self.assertEqual(result['outcomes']['DEFERRED'], 1)
            self.assertIsNone(store.state('profileAttempt:' + CID))
            profile = extract(COMPANY, TEXT, WEB, NOW); store.set_state('companyProfile:' + CID, profile)
            with patch.object(http, 'get', side_effect=SourceError('HTTP_503')):
                result = run(pipeline, [COMPANY], sites, allow_network=True, limit=1)
            self.assertEqual(result['outcomes']['FAILED'], 1)
            self.assertEqual(store.state('companyProfile:' + CID), profile)
            self.assertEqual(store.state('profileAttempt:' + CID)['retryAfter'], '2026-10-06T12:00:00Z')
            store.close()

    def test_cli_refuses_absent_rollout_ledger_without_creating_state(self):
        root = Path(__file__).resolve().parents[3]
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp) / 'absent'
            result = subprocess.run(['python3', str(root / 'scripts/company_intelligence/cli.py'), 'profile-backfill', '--state', str(state)], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('REQUIRES_EXISTING_LEDGER', result.stderr)
            self.assertFalse(state.exists())

    def test_coordinated_verbs_do_not_conjugate_nouns_or_leave_plural_predicates(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>We develop and support software products for banks.</p><p>We offer service and support products for financial institutions.</p><p>We manufacture food products and distribute an extensive line of beverages.</p>'
        description = extract(COMPANY, body, source, NOW)['description']
        self.assertIn('develops and supports software', description)
        self.assertIn('offer', description)
        self.assertIn('service and support products', description)
        self.assertIn('and distributes an extensive line', description)
        self.assertNotIn('service and supports', description)

    def test_company_marketing_predicate_cannot_match_an_incidental_business_noun(self):
        body = b'<p>Example Holdings Inc. is capitalizing on megatrends in global markets and infrastructure spending.</p><p>Example Holdings Inc. provides differentiating value with low-cost, high-quality products.</p>'
        self.assertEqual(extract(COMPANY, body, WEB, NOW)['state'], 'UNAVAILABLE')

    def test_split_business_heading_and_legal_comma_suffix_preserve_core_description(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<p>Item 1.</p><h2>Business</h2><p>Example Holdings, Inc. (the Company) is a manufacturer and marketer of software products for banks.</p><h2>Item 1A. Risk Factors</h2>'
        self.assertIn('manufacturer and marketer', extract(COMPANY, body, source, NOW)['description'])

    def test_catalogue_seed_validates_all_rows_first_and_preserves_existing_state(self):
        from company_intelligence.profile_catalogue import seed, CATALOGUE_SCHEMA
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / 'state.sqlite')
            company2 = {**COMPANY, 'companyId': 'iss_cik_0000000002', 'cik': '0000000002'}
            companies = {CID: COMPANY, company2['companyId']: company2}
            profile = extract(COMPANY, TEXT, WEB, NOW)
            wrong = {**profile, 'companyId': company2['companyId']}
            with self.assertRaises(ValueError):
                seed(store, companies, {'schema': CATALOGUE_SCHEMA, 'profiles': {CID: profile, company2['companyId']: wrong}}, NOW)
            self.assertIsNone(store.state('companyProfile:' + CID))
            store.set_state('irPending', [CID])
            self.assertEqual(seed(store, companies, {'schema': CATALOGUE_SCHEMA, 'profiles': {CID: profile}}, NOW), 1)
            self.assertEqual(store.state('irPending'), [CID])
            self.assertEqual(seed(store, companies, {'schema': CATALOGUE_SCHEMA, 'profiles': {CID: profile}}, NOW), 0)
            store.close()

    def test_shipped_catalogue_has_master_identity_sources_and_no_private_text(self):
        from company_intelligence.model import load_universe
        root = Path(__file__).resolve().parents[3]
        path = root / 'company-intelligence/config/company-profiles.json'
        if not path.exists():
            self.skipTest('catalogue not yet populated')
        catalogue = json.loads(path.read_text()); companies = load_universe(root)
        for cid, value in catalogue['profiles'].items():
            self.assertIn(cid, companies)
            self.assertIsNotNone(public_profile(value, cid, '2099-01-01T00:00:00Z'))
            self.assertNotIn('evidence', value['sources'][0])
            self.assertNotIn('employeeCount', value)
            self.assertNotIn('articleBody', value)
