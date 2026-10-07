import copy
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from company_intelligence.profiles import extract, public_profile, annual_filing, VERSION
from company_intelligence.profile_backfill import run, refresh_cached_sec, roots_for
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
    def test_catalogue_writer_exclusion_releases_after_interruption(self):
        from company_intelligence.profile_catalogue import writer_lock
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'checkpoint.json'
            with self.assertRaises(RuntimeError):
                with writer_lock(path):
                    with self.assertRaisesRegex(ValueError, 'ALREADY_RUNNING'):
                        with writer_lock(path):
                            pass
                    raise RuntimeError('interrupted')
            with writer_lock(path):
                pass

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

    def test_combined_registrant_report_requires_named_issuer_not_subsidiary_voice(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        header = b'<ix:hidden><ix:nonNumeric name="dei:EntityRegistrantName">Example Holdings Inc.</ix:nonNumeric><ix:nonNumeric name="dei:EntityRegistrantName">Example Operating LLC</ix:nonNumeric></ix:hidden>'
        body = header + b'<h2>Item 1. Business</h2><p>Example Holdings Inc. is a holding company for regulated electric utilities.</p><h3>Example Operating LLC</h3><p>We provide electricity services to residential customers.</p><p>Our products include electricity and gas services.</p>'
        result = extract(COMPANY, body, source, NOW)
        self.assertEqual(result['description'], 'Example Holdings Inc. is a holding company for regulated electric utilities.')
        only_voice = header + b'<h2>Item 1. Business</h2><p>We provide electricity services to residential customers.</p>'
        self.assertEqual(extract(COMPANY, only_voice, source, NOW)['state'], 'UNAVAILABLE')
        # Repeated share-class tags for the same entity do not suppress voice.
        one_entity = header.replace(b'Example Operating LLC', b'Example Holdings Inc.')
        self.assertEqual(extract(COMPANY, one_entity + b'<h2>Item 1. Business</h2><p>We provide electricity services to residential customers.</p>', source, NOW)['state'], 'AVAILABLE')

    def test_combined_business_properties_heading_and_single_registrant_voice(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Items 1. and 2. Business and Properties</h2><p>The Corporation manufactures specialty metal products for industrial customers.</p><h2>Item 1A. Risk Factors</h2>'
        self.assertIn('manufactures specialty metal products', extract(COMPANY, body, source, NOW)['description'])
        marketing = body.replace(b'The Corporation manufactures specialty metal products for industrial customers.', b'We provide software services for banks and insurance companies. We focus on a company culture supporting the long-term happiness of its employees.')
        self.assertEqual(extract(COMPANY, marketing, source, NOW)['description'], 'Example Holdings Inc. provides software services for banks and insurance companies.')

    def test_issuer_voice_preserves_infinitives_and_short_normalization_abstains(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>We are a self-advised REIT formed in 2003 to acquire and develop net-leased healthcare facilities.</p>'
        self.assertIn('to acquire and develop', extract(COMPANY, body, source, NOW)['description'])
        short = b'<h2>Item 1. Business</h2><p>Example is a technology company founded by two engineers.</p>'
        company = {**COMPANY, 'names': ['Example']}
        self.assertEqual(extract(company, short, source, NOW)['state'], 'UNAVAILABLE')

    def test_country_abbreviation_boundary_and_neutral_business_facts(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>Our business strategy is to become the indispensable healthcare provider. We are the leading provider of behavioral healthcare services in the U.S. Management believes we can expand rapidly.</p>'
        result = extract(COMPANY, body, source, NOW)
        self.assertEqual(result['description'], 'Example Holdings Inc. is a provider of behavioral healthcare services in the U.S.')
        self.assertNotIn('strategy', result['description'])
        insurance = b'<h2>ITEM 1 | Business</h2><p>Example Holdings Inc. is a leading global insurance organization.</p>'
        self.assertIn('global insurance organization', extract(COMPANY, insurance, source, NOW)['description'])
        steel = b'<h2>Item 1. Business</h2><p>We manufacture and market prestressed concrete strand and welded wire reinforcement for construction applications.</p>'
        self.assertIn('manufactures and markets prestressed concrete', extract(COMPANY, steel, source, NOW)['description'])
        segments = b'<h2>Item 1. Business</h2><p>We are organized into three business segments for management reporting purposes: Consumer Banking, Commercial Banking, and Treasury and Other.</p><p>Our primary focus is the United States personal auto insurance market.</p>'
        result = extract(COMPANY, segments, source, NOW)
        self.assertIn('Consumer Banking', result['description'])
        self.assertIn('personal auto insurance', result['description'])

    def test_named_issuer_and_subsidiaries_plural_predicate_is_scoped(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>Example Holdings Inc. and its subsidiaries ("Example", "we") develop technologies that we monetize through programmable logic semiconductor products and licenses.</p>'
        result = extract(COMPANY, body, source, NOW)
        self.assertEqual(result['description'], 'Example Holdings Inc. develops technologies that it monetizes through programmable logic semiconductor products and licenses.')
        wrong = body.replace(b'Example Holdings Inc. and its subsidiaries', b'Example Holdings Inc. Japan LLC and its subsidiaries')
        self.assertEqual(extract(COMPANY, wrong, source, NOW)['state'], 'UNAVAILABLE')

    def test_web_loan_marketing_and_stock_footer_do_not_become_business_facts(self):
        body = b'<p>Example Holdings Inc. makes the loan process easy to navigate and quick to close.</p>'
        self.assertEqual(extract(COMPANY, body, WEB, NOW)['state'], 'UNAVAILABLE')
        body = b'<p>Example Holdings Inc. is the indirect parent company of Example Bank, and its common stock is traded on an exchange under the symbol EXMP. Investor information and press releases can be viewed on its website.</p>'
        self.assertEqual(extract(COMPANY, body, WEB, NOW)['description'], 'Example Holdings Inc. is the indirect parent company of Example Bank.')
        body = b'<p>Example Holdings Inc. is an international metals company with the objective of being foremost in copper.</p>'
        self.assertEqual(extract(COMPANY, body, WEB, NOW)['description'], 'Example Holdings Inc. is an international metals company.')

    def test_company_timeline_present_tense_does_not_describe_current_operations(self):
        body = b'<p>Example Holdings Inc. provides regulated energy delivery services.</p><h2>COMPANY HISTORY</h2><h3>2001</h3><p>Example Holdings Inc. sells its coal operations and focuses on mining products.</p><h2>Current Operations</h2><p>Example Holdings Inc. operates electricity and natural gas utilities.</p>'
        result = extract(COMPANY, body, WEB, NOW)
        self.assertNotIn('coal', result['description'])
        self.assertIn('natural gas utilities', result['description'])
        comparative = b'<p>Example Holdings Inc. provides investors exposure to precious metals without many of the risks of traditional producers.</p>'
        self.assertEqual(extract(COMPANY, comparative, WEB, NOW)['state'], 'UNAVAILABLE')

    def test_hyphenated_market_superiority_does_not_leave_an_invented_business_type(self):
        body = b'<p>Example Holdings Inc. is a market-leading provider of agriculture and analytics services.</p>'
        self.assertEqual(extract(COMPANY, body, WEB, NOW)['description'], 'Example Holdings Inc. is a provider of agriculture and analytics services.')

    def test_team_member_count_is_not_a_backdoor_employee_field(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>We manufacture medical devices, supported by a global team of over 20,000 members.</p><p>We manufacture medical devices for hospitals and clinics.</p>'
        self.assertEqual(extract(COMPANY, body, source, NOW)['description'], 'Example Holdings Inc. manufactures medical devices for hospitals and clinics.')

    def test_explicit_current_operating_clause_is_not_a_future_plan(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>We intend to leverage our current operations, in which we design, manufacture and sell electric vehicles and energy storage systems, to achieve that objective.</p>'
        self.assertEqual(extract(COMPANY, body, source, NOW)['description'], 'Example Holdings Inc. designs, manufactures and sells electric vehicles and energy storage systems.')
        future = body.replace(b'current operations', b'future operations')
        self.assertEqual(extract(COMPANY, future, source, NOW)['state'], 'UNAVAILABLE')

    def test_business_objectives_and_generic_product_markets_cannot_carry_a_profile(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>Our principal business objective is to generate shareholder returns through energy investments.</p><p>Our products are used in consumer and industrial applications.</p>'
        self.assertEqual(extract(COMPANY, body, source, NOW)['state'], 'UNAVAILABLE')
        body = b"<p>Example Holdings Inc. provides precise and reliable thermal process equipment - enabling tomorrow's technologies in energy storage and aerospace.</p>"
        self.assertEqual(extract(COMPANY, body, WEB, NOW)['description'], 'Example Holdings Inc. provides thermal process equipment.')
        body = b'<p>Example Holdings Inc. is a market-leading agriculture and analytics services company.</p>'
        self.assertIn('is an agriculture', extract(COMPANY, body, WEB, NOW)['description'])

    def test_industry_word_in_legal_name_does_not_qualify_administration(self):
        company = {**COMPANY, 'names': ['Example Energy Inc.']}
        source = annual_filing(company, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>We operate approximately 98 percent of the net acreage across our assets.</p><p>We make available free of charge our annual reports and corporate governance documents.</p>'
        self.assertEqual(extract(company, body, source, NOW)['state'], 'UNAVAILABLE')
        breweries = b'<h2>Item 1. Business</h2><p>We operate primary breweries and a cidery in North America.</p>'
        self.assertIn('operates primary breweries', extract(company, breweries, source, NOW)['description'])
        counted = breweries.replace(b'primary breweries and a cidery', b'nine primary breweries, three craft breweries and one cidery')
        result = extract(company, counted, source, NOW)
        self.assertNotIn('nine', result['description'])
        self.assertIn('craft breweries', result['description'])
        staff = b'<h2>Item 1. Business</h2><p>We provide logistics services through approximately 4,300 dedicated employees.</p><p>We provide logistics services for industrial customers.</p>'
        self.assertNotIn('4,300', extract(company, staff, source, NOW)['description'])

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

    def test_explicit_sec_short_name_definition_is_scoped_to_exact_parent(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>Example Holdings Inc. (also referred to herein as "EH") was incorporated in 1990.</p><p>EH develops software products for banks worldwide.</p><p>Example Holdings Inc. acquired Other Inc. ("OTHER").</p><p>OTHER manufactures industrial equipment for customers.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertIn('Example Holdings Inc. develops software', p['description'])
        self.assertNotIn('industrial', p['description'])
        self.assertEqual(extract(COMPANY, body.replace(b'Example Holdings Inc. (also', b'Other Holdings Inc. (also'), source, NOW)['state'], 'UNAVAILABLE')

    def test_two_legal_parentheticals_preserve_holding_company_role(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>Example Holdings Inc. (NYSE: EXMP) (the "Company") is a holding company that provides software products through its operating subsidiary.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertIn('holding company', p['description'])
        self.assertIn('through its operating subsidiary', p['description'])

    def test_seasonality_and_product_criticality_do_not_replace_business_description(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>Our business also experiences seasonal fluctuations in the software market.</p><p>Our products are often in must-not-fail safety-critical software applications.</p><p>We manufacture industry-leading software products for financial institutions.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertEqual(p['description'], 'Example Holdings Inc. manufactures software products for financial institutions.')

    def test_tax_marketing_and_retail_footprint_are_not_the_company_activity(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>We provide help and inspire confidence through financial services.</p><p>We are a predominantly off-mall retailer with stores in North America.</p><p>Our product offerings include candles, soaps and personal care products.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertIn('candles, soaps and personal care products', p['description'])
        self.assertNotIn('confidence', p['description'])
        self.assertNotIn('off-mall', p['description'])

    def test_current_development_conjugation_and_promotional_tail(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>We provide water purification products and are developing disruptive software products.</p><p>We provide medical products using a powerful combination of science and engineering.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertIn('and is developing software products', p['description'])
        self.assertNotIn('powerful', p['description'])

    def test_explicit_mineral_producer_is_a_business_description(self):
        body = b'<p>Example Holdings Inc. is a gold and silver producer with mines in Canada.</p>'
        self.assertEqual(extract(COMPANY, body, WEB, NOW)['state'], 'AVAILABLE')

    def test_legacy_jurisdiction_annotations_are_display_only_and_never_regex_replacements(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        c = {**COMPANY, 'names': ['Example Holdings Inc. \\DE\\']}
        body = b'<h2>Item 1. Business</h2><p>We develop software products for financial institutions.</p>'
        p = extract(c, body, source, NOW)
        self.assertEqual(p['companyId'], CID)
        self.assertEqual(p['companyName'], 'Example Holdings Inc.')
        self.assertEqual(p['description'], 'Example Holdings Inc. develops software products for financial institutions.')

    def test_human_capital_training_is_not_a_customer_business_line(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>We are a bank holding company whose principal activity is community banking.</p><h3>Human Capital Management</h3><p>We offer functional training, bank history and software training throughout each year.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertIn('bank holding company', p['description'])
        self.assertNotIn('training', p['description'])

    def test_employee_benefit_products_are_allowed_but_headcounts_are_excluded(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>We provide payroll and employee benefit services for businesses.</p><p>We provide bank services with 500 full-time employees worldwide.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertIn('employee benefit services', p['description'])
        self.assertNotIn('500', p['description'])

    def test_company_legal_name_is_not_stripped_as_a_promotional_adjective(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        c = {**COMPANY, 'names': ['Leading Holdings Inc.']}
        body = b'<h2>Item 1. Business</h2><p>We are a leading provider of software services for businesses.</p>'
        self.assertEqual(extract(c, body, source, NOW)['description'], 'Leading Holdings Inc. is a provider of software services for businesses.')

    def test_delegated_profile_host_requires_issuer_discovery_provenance(self):
        with tempfile.TemporaryDirectory() as temp:
            s = Store(Path(temp) / 'state.sqlite')
            cfg = {'companyId': CID, 'lastVerified': NOW, 'evidence': 'LINK_FROM_VERIFIED_OFFICIAL_SITE', 'irHomepage': 'https://investor.example.com/'}
            s.set_state('ir:' + CID, {'lastSuccess': NOW, 'configurations': [{**cfg, 'companyId': 'iss_cik_0000000002'}]})
            self.assertEqual(roots_for(COMPANY, s, {}), [])
            s.set_state('ir:' + CID, {'lastSuccess': NOW, 'configurations': [cfg]})
            self.assertEqual(roots_for(COMPANY, s, {}), ['https://investor.example.com/'])
            s.close()

    def test_new_annual_filing_without_body_marks_prior_description_stale_without_removal(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); s = Store(root / 'state.sqlite')
            p = extract(COMPANY, b'<h2>Item 1. Business</h2><p>We develop software products for financial institutions.</p>', annual_filing(COMPANY, submissions(), NOW), NOW)
            s.set_state('companyProfile:' + CID, p)
            self.assertIsNone(refresh_cached_sec(root, s, COMPANY, submissions(acc='0000000001-26-000002'), NOW))
            current = s.state('companyProfile:' + CID)
            self.assertEqual(current['description'], p['description'])
            self.assertTrue(public_profile(current, CID, NOW)['stale'])
            s.close()

    def test_parser_upgrade_without_source_cache_does_not_invent_a_new_filing(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); s = Store(root / 'state.sqlite')
            p = extract(COMPANY, b'<h2>Item 1. Business</h2><p>We develop software products for financial institutions.</p>', annual_filing(COMPANY, submissions(), NOW), NOW)
            p['parserVersion'] = 'older-parser'
            s.set_state('companyProfile:' + CID, p)
            self.assertIsNone(refresh_cached_sec(root, s, COMPANY, submissions(), NOW))
            self.assertEqual(s.state('companyProfile:' + CID), p)
            self.assertFalse(public_profile(p, CID, NOW)['stale'])
            s.close()

    def test_unexpected_profile_failure_does_not_suppress_financial_projection_or_cool_down_sec(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); s = Store(root / 'state.sqlite'); http = PublicHTTP(root / 'http')
            s.set_state('sec-submissions:' + CID, submissions())
            pipeline = Pipeline(root, {CID: COMPANY}, s, http, NOW)
            summary = {'state': 'AVAILABLE', 'metrics': {'revenue': {'current': {'value': 10, 'unit': 'USD', 'periodEnd': '2026-09-30'}}}}
            with patch('company_intelligence.profile_backfill.refresh_cached_sec', side_effect=RuntimeError('broken optional parser')), patch('company_intelligence.pipeline.summary', return_value=summary):
                pipeline.project_company(COMPANY)
            self.assertEqual(pipeline.run['secFailures'], 0)
            self.assertEqual(s.state('financials:' + CID)['state'], 'AVAILABLE')
            self.assertTrue(s.state('sec:' + CID)['hasSubmissions'])
            self.assertIsNone(s.state('sec:' + CID).get('retryAfter'))
            s.close()

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

    def test_shipped_catalogue_has_exact_issuer_sources_and_only_master_members_are_imported(self):
        from company_intelligence.model import load_universe
        root = Path(__file__).resolve().parents[3]
        path = root / 'company-intelligence/config/company-profiles.json'
        if not path.exists():
            self.skipTest('catalogue not yet populated')
        catalogue = json.loads(path.read_text()); companies = load_universe(root)
        for cid, value in catalogue['profiles'].items():
            self.assertIsNotNone(public_profile(value, cid, '2099-01-01T00:00:00Z'))
            self.assertNotIn('evidence', value['sources'][0])
            self.assertNotIn('employeeCount', value)
            self.assertNotIn('articleBody', value)
        # The authoritative master can deactivate a listing between branch
        # validation and PR merge-tree CI. Keep correct historical issuer facts,
        # but import/export only identities still supported by that checkout.
        from company_intelligence.profile_catalogue import seed
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / 'state.sqlite')
            expected = set(catalogue['profiles']) & set(companies)
            self.assertEqual(seed(store, companies, catalogue, '2099-01-01T00:00:00Z'), len(expected))
            actual = {row[0].removeprefix('companyProfile:') for row in store.db.execute("SELECT key FROM state WHERE key LIKE 'companyProfile:%'")}
            self.assertEqual(actual, expected)
            # Also exercise a deliberate master withdrawal in every environment.
            withdrawn = next(iter(catalogue['profiles']))
            filtered = {k: v for k, v in companies.items() if k != withdrawn}
            other = Store(Path(temp) / 'filtered.sqlite')
            seed(other, filtered, catalogue, '2099-01-01T00:00:00Z')
            self.assertIsNone(other.state('companyProfile:' + withdrawn))
            exported = store.export(filtered, Path(temp) / 'export', '2099-01-01T00:00:00Z')
            self.assertFalse((Path(temp) / 'export' / 'snapshots' / exported['generation'] / (withdrawn + '.json')).exists())
            if withdrawn in companies:
                self.assertIsNotNone(store.state('companyProfile:' + withdrawn))
            other.close(); store.close()

    def test_filing_segment_activity_precedes_customer_only_statement(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>We serve hospitals, universities and research institutions.</p><p>We report our business in four segments: Life Sciences, Instruments, Diagnostics, and Laboratory Products.</p><p>Through our Life Sciences segment, we provide reagents and instruments for medical research.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertTrue(p['description'].startswith('Example Holdings Inc. operates through four segments:'))
        self.assertIn('provides reagents and instruments for medical research through its Life Sciences segment.', p['description'])
        self.assertEqual(p['sources'][0]['evidence'][0], 'We report our business in four segments: Life Sciences, Instruments, Diagnostics, and Laboratory Products.')
        self.assertEqual(extract(COMPANY, b'<h2>Item 1. Business</h2><p>We serve hospitals, universities and research institutions.</p>', source, NOW)['state'], 'UNAVAILABLE')
        self.assertEqual(extract(COMPANY, body, WEB, NOW)['state'], 'UNAVAILABLE')

    def test_legal_period_and_market_ranking_keep_only_supported_business_role(self):
        company = {**COMPANY, 'names': ['Example Holdings Corp']}
        p = extract(company, b'<p>Example Holdings Corp. is the fourth largest commercial bank holding company in its region.</p>', WEB, NOW)
        self.assertEqual(p['description'], 'Example Holdings Corp. is a commercial bank holding company in its region.')
        p = extract(COMPANY, b'<p>Example Holdings Inc. is one of the world\'s leading suppliers of packaging products for beverage customers.</p>', WEB, NOW)
        self.assertEqual(p['description'], 'Example Holdings Inc. is a supplier of packaging products for beverage customers.')
        wrong = b'<p>Example Holdings Corp. Japan LLC develops software products for customers.</p>'
        self.assertEqual(extract(company, wrong, WEB, NOW)['state'], 'UNAVAILABLE')

    def test_introductory_marketing_clause_preserves_explicit_design_activity(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>Leveraging a unique combination of technologies, we design, manufacture, and provide control equipment for aerospace markets.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertIn('designs, manufactures, and provides control equipment', p['description'])
        self.assertNotIn('Leveraging', p['description'])
        self.assertEqual(extract(COMPANY, body, WEB, NOW)['state'], 'UNAVAILABLE')

    def test_nested_consolidated_legal_definition_preserves_issuer_business(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>Example Holdings Inc., together with its subsidiaries (collectively the "Company," "we," or "our" (Nasdaq: EXMP)), delivers high-quality semiconductor products to electronics manufacturers.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertEqual(p['description'], 'Example Holdings Inc. delivers semiconductor products to electronics manufacturers.')
        self.assertEqual(extract(COMPANY, body, WEB, NOW)['state'], 'UNAVAILABLE')

    def test_operating_subsidiary_business_keeps_parent_relationship(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>Example Holdings Inc. ("Parent"), through its Operating Subsidiaries (together, the "Company"), is a leading investment bank and broker-dealer.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertEqual(p['description'], 'Example Holdings Inc. is an investment bank and broker-dealer through its Operating Subsidiaries.')

    def test_product_comma_is_not_a_product_list_and_vague_distribution_abstains(self):
        p = extract(COMPANY, b'<p>Example Holdings Inc. designs software products, and licenses its trademarks to others worldwide.</p>', WEB, NOW)
        self.assertEqual(p['productsServices'], [])
        for text in ['Example Holdings Inc. sells product primarily through its operations in Asia and Europe.', 'Example Holdings Inc. focuses its investments and resources towards categories with value-creation potential.']:
            self.assertEqual(extract(COMPANY, ('<p>'+text+'</p>').encode(), WEB, NOW)['state'], 'UNAVAILABLE')

    def test_catalogue_cached_parser_upgrade_requires_same_verification_and_evidence(self):
        from company_intelligence.profile_catalogue import seed, CATALOGUE_SCHEMA
        profile = extract(COMPANY, TEXT, WEB, NOW)
        prior = {**profile, 'parserVersion': 'company-profile-parser-1.0.5', 'description': 'Example Holdings Inc. develops software products for insurance markets.'}
        catalogue = {'schema': CATALOGUE_SCHEMA, 'profiles': {CID: profile}}
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / 'state.sqlite')
            store.set_state('companyProfile:' + CID, prior)
            self.assertEqual(seed(store, {CID: COMPANY}, catalogue, NOW), 1)
            self.assertEqual(store.state('companyProfile:' + CID)['description'], profile['description'])
            for protected in [{**prior, 'lastVerifiedAt': '2026-10-05T12:01:00Z'}, {**prior, 'supersededAnnualFiling': '0000000001-26-000002'}, {**prior, 'sources': [{**prior['sources'][0], 'contentHash': 'f'*64}]}]:
                store.set_state('companyProfile:' + CID, protected)
                self.assertEqual(seed(store, {CID: COMPANY}, catalogue, NOW), 0)
                self.assertEqual(store.state('companyProfile:' + CID), protected)
            store.close()

    def test_independent_backfill_quality_retirement_is_cache_only_and_checkpointed(self):
        import argparse, hashlib, io
        from contextlib import redirect_stdout
        from company_intelligence.profile_catalogue import backfill, CATALOGUE_SCHEMA
        from quant.sec.http_client import SECHttpClient
        filing = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>We serve hospitals, universities and research institutions.</p>'
        prior = extract(COMPANY, b'<h2>Item 1. Business</h2><p>We manufacture medical devices for hospital customers.</p>', filing, NOW)
        prior['parserVersion'] = 'company-profile-parser-1.0.5'
        prior['description'] = 'Example Holdings Inc. serves hospitals, universities and research institutions.'
        prior['sources'][0]['contentHash'] = hashlib.sha256(body).hexdigest()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); (root / 'company-intelligence/config').mkdir(parents=True)
            (root / 'company-intelligence/config/official-sites.json').write_text('{}')
            cat = root / 'catalogue.json'; cp = root / 'private-checkpoint.json'
            cat.write_text(json.dumps({'schema': CATALOGUE_SCHEMA, 'profiles': {CID: prior}}))
            cache = DiskCache(root / '.sec-cache', ttl_seconds=None)
            cache.put('https://data.sec.gov/submissions/CIK0000000001.json', json.dumps(submissions()).encode())
            cache.put(filing['url'], body)
            args = argparse.Namespace(tickers=None, network=True, reparse=False, limit=1, request_budget=2, max_seconds=30, rate=1)
            with patch('company_intelligence.profile_catalogue.load_universe', return_value={CID: COMPANY}), patch('company_intelligence.profile_catalogue.utcnow', return_value=NOW), patch.object(Pipeline, 'ensure_aliases'), patch.object(SECHttpClient, '_urlopen', side_effect=AssertionError('cached source must not be downloaded')), redirect_stdout(io.StringIO()):
                backfill(args, root, cat, cp)
                backfill(args, root, cat, cp)
            self.assertEqual(json.loads(cat.read_text())['profiles'], {})
            state = json.loads(cp.read_text())
            self.assertEqual(state['attempts'][CID]['state'], 'UNAVAILABLE')
            self.assertEqual(state['batches'][0]['retiredProfiles'], 1)
            self.assertEqual(state['batches'][0]['networkRequests'], 0)
            self.assertEqual(state['batches'][1]['attempted'], 0)
            self.assertFalse((root / '.company-intelligence/state.sqlite').exists())

    def test_chip_design_noun_does_not_reorder_activity_and_adjective_removal_keeps_grammar(self):
        source = annual_filing(COMPANY, submissions(), NOW)
        body = b'<h2>Item 1. Business</h2><p>We deliver trusted and comprehensive software solutions spanning silicon design and simulation.</p><p>We offer a broad and comprehensive portfolio of semiconductor IP solutions that are used in chip designs.</p>'
        p = extract(COMPANY, body, source, NOW)
        self.assertEqual(p['businessActivities'][0], 'Example Holdings Inc. delivers software solutions spanning silicon design and simulation.')
        self.assertIn('offers a broad portfolio', p['description'])
        self.assertNotIn('broad and portfolio', p['description'])

    def test_change_driven_sec_profile_downloads_new_annual_once_and_never_rebuilds_catalogue_cache(self):
        from company_intelligence.profile_backfill import refresh_changed_sec
        from unittest.mock import Mock
        old = submissions(); new = submissions('0000000001-26-000002', '2026-09-30')
        prior = extract(COMPANY, b'<h2>Item 1. Business</h2><p>We manufacture software products for banks.</p>', annual_filing(COMPANY, old, NOW), NOW)
        body = b'<h2>Item 1. Business</h2><p>We develop software platforms and provide payment services for banks.</p>'
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); s = Store(root / 'state.sqlite'); s.set_state('companyProfile:' + CID, prior)
            client = Mock()
            client.get_bytes.side_effect = lambda url: DiskCache(root / '.sec-cache').put(url, body)
            self.assertEqual(refresh_changed_sec(root, s, COMPANY, old, NOW, client), prior)
            client.get_bytes.assert_not_called()
            self.assertIsNone(refresh_changed_sec(root, s, COMPANY, new, NOW))
            client.get_bytes.assert_not_called()
            self.assertIsNotNone(s.state('companyProfile:' + CID)['supersededAnnualFiling'])
            refreshed = refresh_changed_sec(root, s, COMPANY, new, NOW, client)
            self.assertIn('payment services', refreshed['description'])
            self.assertNotIn('supersededAnnualFiling', refreshed)
            client.get_bytes.assert_called_once_with(annual_filing(COMPANY, new, NOW)['url'])
            refresh_changed_sec(root, s, COMPANY, new, NOW, client)
            self.assertEqual(client.get_bytes.call_count, 1)
            s.close()

    def test_failed_new_annual_profile_preserves_facts_and_retry_cooldown(self):
        from company_intelligence.profile_backfill import refresh_changed_sec
        from unittest.mock import Mock
        old = submissions(); new = submissions('0000000001-26-000002', '2026-09-30')
        prior = extract(COMPANY, b'<h2>Item 1. Business</h2><p>We manufacture medical devices for hospitals.</p>', annual_filing(COMPANY, old, NOW), NOW)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); s = Store(root / 'state.sqlite'); s.set_state('companyProfile:' + CID, prior)
            client = Mock(); client.get_bytes.side_effect = SourceError('HTTP_503')
            with self.assertRaises(SourceError):
                refresh_changed_sec(root, s, COMPANY, new, NOW, client)
            self.assertEqual(s.state('companyProfile:' + CID)['description'], prior['description'])
            self.assertTrue(public_profile(s.state('companyProfile:' + CID), CID, NOW)['stale'])
            self.assertEqual(s.state('profileAttempt:' + CID)['retryAfter'], '2026-10-06T12:00:00Z')
            self.assertIsNone(refresh_changed_sec(root, s, COMPANY, new, NOW, client))
            self.assertEqual(client.get_bytes.call_count, 1)
            s.close()

    def test_unavailable_new_annual_is_not_redownloaded_after_runner_cache_loss(self):
        from company_intelligence.profile_backfill import refresh_changed_sec
        from unittest.mock import Mock
        import shutil
        old = submissions(); new = submissions('0000000001-26-000002', '2026-09-30')
        prior = extract(COMPANY, b'<h2>Item 1. Business</h2><p>We manufacture medical devices for hospitals.</p>', annual_filing(COMPANY, old, NOW), NOW)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); s = Store(root / 'state.sqlite'); s.set_state('companyProfile:' + CID, prior)
            client = Mock(); client.get_bytes.side_effect = lambda url: DiskCache(root / '.sec-cache').put(url, b'<p>No explicit business section is present.</p>')
            self.assertIsNone(refresh_changed_sec(root, s, COMPANY, new, NOW, client))
            self.assertEqual(s.state('profileAttempt:' + CID)['state'], 'UNAVAILABLE')
            self.assertEqual(client.get_bytes.call_count, 1)
            shutil.rmtree(root / '.sec-cache')
            self.assertIsNone(refresh_changed_sec(root, s, COMPANY, new, NOW, client))
            self.assertEqual(client.get_bytes.call_count, 1)
            self.assertEqual(s.state('companyProfile:' + CID)['description'], prior['description'])
            s.close()

    def test_legal_formation_and_promotional_mission_are_not_business_facts(self):
        from company_intelligence.profiles import issuer_sentence
        name = COMPANY['names'][0]
        for tail in ['is a holding company incorporated in Delaware.', 'is an exempted company incorporated in the Cayman Islands as a holding company.', 'is a REIT organized under Maryland law in 2017.', 'offers enhanced value by simplifying IT.', 'has powerful features for enterprises.']:
            self.assertIsNone(issuer_sentence(name + ' ' + tail, COMPANY, sec=True))
        self.assertEqual(issuer_sentence(name + ' is a biotechnology company whose mission is to revolutionize medicine.', COMPANY, sec=True), name + ' is a biotechnology company.')

    def test_exact_evidence_quality_withdrawal_hides_public_description_but_preserves_private_facts(self):
        from company_intelligence.profile_catalogue import seed, CATALOGUE_SCHEMA
        source = annual_filing(COMPANY, submissions(), NOW)
        prior = extract(COMPANY, b'<h2>Item 1. Business</h2><p>We manufacture medical devices for hospitals.</p>', source, NOW)
        prior['parserVersion'] = 'company-profile-parser-1.0.5'
        withdrawal = {'companyId': CID, 'parserVersion': 'company-profile-parser-1.0.10', 'checkedAt': NOW,
                      'sourceContentHashes': [prior['sources'][0]['contentHash']], 'reason': 'NO_EXPLICIT_ISSUER_BUSINESS_DESCRIPTION'}
        catalogue = {'schema': CATALOGUE_SCHEMA, 'profiles': {}, 'withdrawals': {CID: withdrawal}}
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / 'state.sqlite')
            store.set_state('companyProfile:' + CID, prior); store.set_state('irPending', [CID]); store.set_state('financials:' + CID, {'state': 'AVAILABLE'})
            seed(store, {CID: COMPANY}, catalogue, NOW)
            kept = store.state('companyProfile:' + CID)
            self.assertEqual(kept['description'], prior['description']);self.assertEqual(kept['sources'], prior['sources'])
            self.assertIsNone(public_profile(kept, CID, NOW));self.assertEqual(store.state('irPending'), [CID])
            self.assertEqual(store.state('financials:' + CID), {'state': 'AVAILABLE'})
            for protected in [{**prior, 'lastVerifiedAt': '2026-10-05T12:01:00Z'}, {**prior, 'parserVersion': 'manually-reviewed-1'}, {**prior, 'sources': [{**prior['sources'][0], 'contentHash': 'f'*64}]}, {**prior, 'supersededAnnualFiling': '0000000001-26-000002'}]:
                store.set_state('companyProfile:' + CID, protected);seed(store, {CID: COMPANY}, catalogue, NOW)
                self.assertEqual(store.state('companyProfile:' + CID), protected)
            store.close()
