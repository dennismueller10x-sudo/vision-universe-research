import copy
import json
from pathlib import Path
import tempfile
import unittest
from company_intelligence.model import make_item
from company_intelligence.store import Store
from company_intelligence.reviewed_source_urls import apply

CID='iss_cik_0001652130';NOW='2026-10-12T17:00:00Z';SEEN='2026-10-12T16:38:08Z'
SOURCE={'sourceId':'existing-owned-feed','companyId':CID,'type':'IR_FEED','provider':'GCS','verified':True,'active':True,
        'url':'https://ir.intelliatx.com/rss/news-releases.xml','allowedSites':['https://ir.intelliatx.com/']}
RAW={'headline':'Intellia Therapeutics announces clinical results','url':'https://ir.intelliatx.com/news/results','publishedAt':'2026-10-02T20:01:00Z'}
REVIEW={'schema':1,'sourceUsagePolicy':'OWNED_IR_SEC_METADATA_PREVIEW_V1','scope':'EXACT_EXISTING_REGISTERED_ISSUER_NEWS_URL_RECONFIRMATION_ONLY',
        'observations':[{'companyId':CID,'sourceUrl':SOURCE['url'],'bodyHash':'a'*64,'observedAt':SEEN,
                         'method':'NATIVE_PUBLIC_HTTP_ROBOTS_CHECKED_RSS','items':[RAW]}]}

class ReviewedSourceUrlTests(unittest.TestCase):
    def setup_store(self,root):
        store=Store(root/'state.sqlite');store.source(SOURCE)
        store.set_state('officialSite:'+CID,{'status':'VALIDATED','url':'https://www.intelliatx.com/'})
        old=make_item({**RAW,'url':RAW['url'].replace('https:','http:')},SOURCE,
                      {'companyId':CID,'confidence':1.0,'evidence':['VERIFIED_FIRST_PARTY_SOURCE']},'2026-10-03T12:00:00Z')
        store.ingest(old);return store,old
    def test_only_exact_existing_url_is_reconfirmed_with_ids_dates_and_history_preserved(self):
        with tempfile.TemporaryDirectory()as directory:
            root=Path(directory);store,old=self.setup_store(root)
            report=apply(store,{CID:{}},NOW,REVIEW)
            self.assertEqual(report['correctedItems'],1);self.assertEqual(report['newItemsCreated'],0)
            saved=json.loads(store.db.execute('SELECT payload FROM items').fetchone()[0])
            self.assertEqual(saved['newsId'],old['newsId']);self.assertEqual(saved['publishedAt'],old['publishedAt'])
            self.assertEqual(saved['discoveredAt'],old['discoveredAt']);self.assertEqual(saved['canonicalUrl'],RAW['url'])
            self.assertTrue(any(p['originalUrl'].startswith('http://')for p in saved['provenance']))
            self.assertTrue(any(p.get('observationBodyHash')=='a'*64 for p in saved['provenance']))
            self.assertEqual(store.sources()[0].get('lastSuccess'),None)  # No fabricated runner success.
            store.close();restored=Store(root/'state.sqlite')
            self.assertEqual(apply(restored,{CID:{}},'2026-11-01T00:00:00Z',REVIEW)['reasons']['ALREADY_APPLIED'],1)
            self.assertEqual(restored.db.execute('SELECT count(*) FROM items').fetchone()[0],1);restored.close()
    def test_missing_or_changed_identity_time_title_host_and_ownership_never_create_news(self):
        variations=[]
        for changed in [{**RAW,'headline':'Different announcement'},{**RAW,'publishedAt':'2026-10-03T20:01:00Z'},
                        {**RAW,'url':'https://publisher.example/news/results'},{**RAW,'url':'https://ir.intelliatx.com/news/other'},
                        {**RAW,'publishedAt':None,'publishedDate':'2026-10-02'}]:
            review=copy.deepcopy(REVIEW);review['observations'][0]['items']=[changed];variations.append((review,None))
        review=copy.deepcopy(REVIEW);review['observations'][0]['companyId']='other-issuer';variations.append((review,None))
        for status in ['CONFLICTING_OWNER','WRONG_COMPANY','REJECTED']:variations.append((REVIEW,status))
        review=copy.deepcopy(REVIEW);review['observations'][0]['observedAt']='2026-09-01T00:00:00Z';variations.append((review,None))
        for review,status in variations:
            with self.subTest(review=review,status=status),tempfile.TemporaryDirectory()as directory:
                store,old=self.setup_store(Path(directory))
                if status:store.set_state('officialSite:'+CID,{'status':status})
                before=store.db.execute('SELECT payload FROM items').fetchone()[0]
                report=apply(store,{CID:{}},NOW,review)
                self.assertEqual(report['correctedItems'],0);self.assertEqual(store.db.execute('SELECT count(*)FROM items').fetchone()[0],1)
                self.assertEqual(store.db.execute('SELECT payload FROM items').fetchone()[0],before);store.close()
    def test_unregistered_or_unapproved_source_is_never_granted_ownership(self):
        for alteration in [{'verified':False},{'active':False},{'companyId':'other'},{'allowedSites':['https://other.example/']}]:
            with self.subTest(alteration=alteration),tempfile.TemporaryDirectory()as directory:
                store,old=self.setup_store(Path(directory));store.source({**SOURCE,**alteration})
                self.assertEqual(apply(store,{CID:{}},NOW,REVIEW)['correctedItems'],0)
                self.assertEqual(store.db.execute('SELECT count(*)FROM sources').fetchone()[0],1);store.close()

if __name__=='__main__':unittest.main()
