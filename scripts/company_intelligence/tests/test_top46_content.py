import json
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.q4_news import parse
from company_intelligence.model import make_item, classify
from company_intelligence.store import Store
from company_intelligence.product import project
from company_intelligence.top46_content import matching_resolver
from company_intelligence.transport import SourceError

CID='iss_cik_0001321655'
NOW='2026-10-08T13:00:00Z'
SOURCE={'companyId':CID,'sourceId':'palantir-owned-feed','type':'IR_FEED','provider':'Q4','verified':True,'url':'https://investors.palantir.com/feed/PressRelease.svc/GetPressReleaseList','allowedSites':['https://investors.palantir.com/']}

class TargetedContentTests(unittest.TestCase):
    def test_unzoned_q4_clock_stays_publication_day_not_assumed_utc(self):
        rows=parse(json.dumps({'GetPressReleaseListResult':[{'Headline':'Palantir announces partnership','PressReleaseDate':'10/01/2026 18:00:00','LinkToDetailPage':'/news-details/2026/partnership/default.aspx','Body':'PRIVATE ARTICLE BODY'}]}).encode(),SOURCE)
        item=make_item(rows[0],SOURCE,{'companyId':CID,'confidence':1},NOW)
        self.assertIsNone(item['publishedAt']);self.assertEqual(item['publishedDate'],'2026-10-01');self.assertEqual(item['date'],'2026-10-01');self.assertEqual(item['timestampPrecision'],'DATE_ONLY')
        self.assertNotIn('PRIVATE ARTICLE BODY',json.dumps(item));self.assertNotIn('Body',rows[0]);self.assertNotIn('observedAt',item)
        with tempfile.TemporaryDirectory() as d:
            store=Store(Path(d)/'state.sqlite');self.assertEqual(store.ingest(item),'NEW');self.assertEqual(store.ingest(item),'DUPLICATE');self.assertEqual(store.db.execute('select count(*) from items').fetchone()[0],1);store.close()

    def test_exact_owned_https_reconfirmation_repairs_duplicate_primary_but_not_unverified_sighting(self):
        match={'companyId':CID,'confidence':1,'evidence':['VERIFIED_FIRST_PARTY_SOURCE']}
        url='https://investors.palantir.com/news/exact'
        raw={'headline':'Palantir announces partnership','url':url,'publishedAt':'2026-10-01T12:00:00Z'}
        old=make_item({**raw,'url':url.replace('https://','http://')},SOURCE,match,NOW)
        fresh=make_item(raw,SOURCE,match,NOW)
        with tempfile.TemporaryDirectory() as d:
            store=Store(Path(d)/'state.sqlite');store.ingest(old)
            unverified=make_item(raw,SOURCE,{'companyId':CID,'confidence':1},NOW)
            self.assertEqual(store.ingest(unverified),'DUPLICATE')
            self.assertEqual(json.loads(store.db.execute('select payload from items').fetchone()[0])['canonicalUrl'],old['canonicalUrl'])
            self.assertEqual(store.ingest(fresh),'DUPLICATE')
            merged=json.loads(store.db.execute('select payload from items').fetchone()[0]);store.close()
            self.assertEqual(merged['newsId'],old['newsId']);self.assertEqual(merged['canonicalUrl'],url)
            self.assertIn('EXACT_OWNED_HTTPS_SOURCE_LINK_RECONFIRMED',merged['deduplicationEvidence'])
            self.assertEqual({r['originalUrl'] for r in merged['provenance']},{url,old['canonicalUrl']})

    def test_foreign_links_unverified_ownership_and_invalid_service_dates_fail_closed(self):
        data={'GetPressReleaseListResult':[{'Headline':'Wrong actor','PressReleaseDate':'10/01/2026 18:00:00','LinkToDetailPage':'https://www.businesswire.com/news/1'},{'Headline':'Invalid date','PressReleaseDate':'02/30/2026 10:00:00','LinkToDetailPage':'/news/2'}]}
        self.assertEqual(parse(json.dumps(data).encode(),SOURCE),[])
        with self.assertRaises(SourceError):parse(json.dumps(data).encode(),{**SOURCE,'verified':False})
        with self.assertRaises(ValueError):make_item({'headline':'Palantir','url':'https://investors.palantir.com/news','publishedDate':'2026-10-09'},SOURCE,{'companyId':CID,'confidence':1},NOW)

    def test_sec_matching_aliases_cannot_change_pinned_export_identity_or_fresh_restore_generation(self):
        from copy import deepcopy
        companies={CID:{'companyId':CID,'cik':'0001321655','names':['Palantir'],'listings':[{'symbol':'PLTR','instrumentId':'vu_12345678901234','exchange':'NASDAQ'}]}}
        original=deepcopy(companies)
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);facts=root/'quant/data/sec/consumer/CIK0001321655.json';facts.parent.mkdir(parents=True);facts.write_text(json.dumps({'cik':'0001321655','name':'PALANTIR TECHNOLOGIES INC'}))
            resolver=matching_resolver(companies,root)
            self.assertIn('PALANTIR TECHNOLOGIES INC',resolver.companies[CID]['names'])
            self.assertEqual(companies,original)
            item=make_item({'headline':'Palantir announces partnership','url':'https://investors.palantir.com/news/one','publishedAt':'2026-10-01T12:00:00Z'},SOURCE,{'companyId':CID,'confidence':1},NOW)
            store=Store(root/'state.sqlite');store.ingest(item);first=store.export(companies,root/'before',NOW);store.close()
            restored=Store(root/'state.sqlite');fresh=deepcopy(original);matching_resolver(fresh,root);second=restored.export(fresh,root/'after',NOW);restored.close()
            self.assertEqual(first,second)
            self.assertEqual((root/'before/index.json').read_bytes(),(root/'after/index.json').read_bytes())
            before=(root/'before'/'snapshots'/first['generation']/(CID+'.json')).read_bytes()
            self.assertEqual(before,(root/'after'/'snapshots'/second['generation']/(CID+'.json')).read_bytes())

    def test_current_observation_cannot_promote_old_date_only_release(self):
        item=make_item({'headline':'Palantir announces partnership','url':'https://investors.palantir.com/news/old','publishedDate':'2025-10-01','updatedAt':NOW},SOURCE,{'companyId':CID,'confidence':1},NOW)
        value=project({'schema':'vu-company-intelligence-1.0.0','companyId':CID,'generatedAt':NOW,'state':'AVAILABLE','news':[item]})
        self.assertEqual(value['news'],[])

    def test_xpeng_deliveries_are_operations_not_earnings_and_registered_financing_is_material(self):
        value=classify('XPENG Announces Vehicle Delivery Results for September and Third Quarter 2026')
        self.assertIn('Operations',value['categories']);self.assertNotIn('Earnings',value['categories'])
        self.assertIn('Financing',classify('Arbe Robotics Ltd. Announces Closing of $15 Million Underwritten Registered Direct Offering')['categories'])

if __name__=='__main__':unittest.main()
