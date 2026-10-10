import unittest
from copy import deepcopy
from company_intelligence.universe_eligibility import evaluate, financial_summary, safe_link
from company_intelligence.model import SCHEMA

CID = 'iss_cik_0001318605'
NOW = '2026-10-10T05:54:50Z'
URL = 'https://ir.tesla.com/news/test'
SOURCE = {'sourceId': 'tesla', 'companyId': CID, 'type': 'IR_FEED', 'provider': 'FIRST_PARTY', 'verified': True, 'allowedSites': ['https://ir.tesla.com/'], 'url': URL}

def payload():
    return {'schema': SCHEMA, 'companyId': CID, 'companyName': 'Tesla', 'listings': [{'symbol': 'TSLA', 'instrumentId': 'vu_0123456789abcd'}],
            'generatedAt': NOW, 'state': 'AVAILABLE', 'latestFinancials': {'state': 'UNAVAILABLE'},
            **{k: [] for k in ('news', 'events', 'earnings', 'calls', 'materials', 'filings', 'presentations', 'materialEvents', 'timeline')}}

def news(url=URL):
    return {'companyId': CID, 'newsId': 'a' * 24, 'eventType': 'NEWS', 'canonicalUrl': url, 'headline': 'Tesla reports production update', 'publishedDate': '2026-10-09'}

def finances():
    return {'state': 'AVAILABLE', 'policy': 'LATEST_KNOWN_RETROSPECTIVE', 'sourceAsOf': '2026-10-09', 'fiscalYear': 2026, 'fiscalQuarter': 'Q2',
            'reportingPeriod': '2026-06-30', 'metrics': {'revenue': {'state': 'AVAILABLE', 'current': {'value': 123, 'unit': 'USD', 'periodEnd': '2026-06-30', 'filedAt': '2026-07-23', 'filingId': '0001318605-26-000001'}}}}

class EligibilityTests(unittest.TestCase):
    def test_owned_current_news_alone_is_useful_partial(self):
        p=payload();p['news']=[news()];r,v=evaluate(p,[SOURCE]);self.assertEqual(r['status'],'ELIGIBLE_PARTIAL');self.assertTrue(r['modules']['aktuelles']);self.assertNotIn('companyProfile',v)

    def test_invalid_module_does_not_block_good_news(self):
        p=payload();p['news']=[news()];p['latestFinancials']=finances();p['latestFinancials']['metrics']['revenue']['current']['unit']='thousands of dollars'
        r,v=evaluate(p,[SOURCE]);self.assertEqual(r['status'],'ELIGIBLE_PARTIAL');self.assertFalse(r['modules']['financials']);self.assertTrue(r['modules']['aktuelles']);self.assertEqual(v['latestFinancials']['state'],'UNAVAILABLE')

    def test_publisher_or_wrong_owner_cannot_be_enabled(self):
        for url in ('https://www.globenewswire.com/news-release/test','https://other-company.example/test'):
            p=payload();p['news']=[news(url)];r,v=evaluate(p,[SOURCE]);self.assertEqual(r['status'],'INELIGIBLE_SOURCE_POLICY');self.assertIsNone(v)

    def test_mapping_conflict_blocks_all_modules(self):
        p=payload();p['news']=[news()];r,v=evaluate(p,[SOURCE],False);self.assertEqual(r['status'],'INELIGIBLE_MAPPING');self.assertIsNone(v)

    def test_undated_observed_item_not_current(self):
        p=payload();n=news();n.pop('publishedDate');n['observedAt']=NOW;p['news']=[n];r,v=evaluate(p,[SOURCE]);self.assertEqual(r['status'],'INELIGIBLE_NO_SAFE_CONTENT')

    def test_old_news_only_not_current_module(self):
        p=payload();n=news();n['publishedDate']='2026-05-01';p['news']=[n];r,v=evaluate(p,[SOURCE]);self.assertFalse(r['modules']['aktuelles']);self.assertIsNone(v)

    def test_estimated_event_cannot_become_confirmed(self):
        p=payload();p['events']=[{'companyId':CID,'eventId':'b'*24,'eventType':'EARNINGS_ESTIMATED','confirmationStatus':'CONFIRMED','dateStart':'2026-10-20','dateEnd':'2026-10-30'}]
        r,v=evaluate(p,[SOURCE]);self.assertFalse(r['modules']['nextEvent']);self.assertIsNone(v)

    def test_valid_estimate_alone_and_date_only_preserved(self):
        p=payload();p['events']=[{'companyId':CID,'eventId':'b'*24,'eventType':'EARNINGS_ESTIMATED','confirmationStatus':'ESTIMATED','dateStart':'2026-10-20','dateEnd':'2026-10-30'}]
        r,v=evaluate(p,[SOURCE]);self.assertEqual(r['status'],'ELIGIBLE_PARTIAL');self.assertTrue(r['modules']['nextEvent']);self.assertNotIn('startsAt',v['events'][0])

    def test_stale_financials_are_marked_not_fabricated(self):
        f=finances();f['reportingPeriod']='2025-06-30';f['metrics']['revenue']['current']['periodEnd']='2025-06-30'
        v,state=financial_summary(f,CID,NOW);self.assertEqual(state,'STALE');self.assertTrue(v['stale'])

    def test_routine_sec_fact_reference_not_standalone_content(self):
        p=payload();p['materials']=[{'companyId':CID,'type':'SEC_FACT_FILING_REFERENCE','url':'https://www.sec.gov/Archives/edgar/data/1318605/000131860526000001/'}]
        r,v=evaluate(p,[]);self.assertEqual(r['status'],'INELIGIBLE_NO_SAFE_CONTENT');self.assertIsNone(v)

    def test_public_projection_removes_article_bodies(self):
        p=payload();n=news();n.update(body='PRIVATE',excerpt='PRIVATE',summary='PRIVATE');p['news']=[n];r,v=evaluate(p,[SOURCE]);self.assertFalse(any(k in v['news'][0] for k in ('body','excerpt','summary')))

    def test_network_links_fail_closed(self):
        for url in ('https://localhost/x','https://10.0.0.1/x','https://site.example:bad/x','http://site.example/x','https://user:password@site.example/x'):
            self.assertFalse(safe_link(url))

if __name__ == '__main__': unittest.main()
