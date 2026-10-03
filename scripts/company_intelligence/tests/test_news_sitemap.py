import json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.news_sitemap import parse,URL
from company_intelligence.transport import SourceError
from company_intelligence.materials import page_documents
from company_intelligence.discovery_batch import run,persist
from company_intelligence.store import Store
from unittest.mock import patch
from test_engine import company,NOW

def xml(title='Apple Inc. reports quarterly earnings',stamp='2026-10-02T12:00:00+00:00',url='https://www.globenewswire.com/news-release/2026/10/02/1/0/en/apple.html'):
 return ('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:n="http://www.google.com/schemas/sitemap-news/0.9"><url><loc>'+url+'</loc><n:news><n:publication><n:name>GlobeNewswire</n:name><n:language>en</n:language></n:publication><n:publication_date>'+stamp+'</n:publication_date><n:title>'+title+'</n:title><n:keywords>Apple Inc</n:keywords><n:stock_tickers>NASDAQ:AAPL</n:stock_tickers></n:news></url></urlset>').encode()

class SitemapTests(unittest.TestCase):
 def test_explicit_metadata_no_article_body_or_keyword_authority(self):
  r=parse(xml(),URL)[0];self.assertEqual(r['publishedAt'],'2026-10-02T12:00:00Z');self.assertEqual(r['distributionMetadata'],{'stocks':['NASDAQ:AAPL']});self.assertEqual(r['evidenceText'],'');self.assertFalse(r['promotionalSolicitation'])
 def test_publisher_www_redirect_preserves_pinned_path(self):
  self.assertEqual(parse(xml(),URL),parse(xml(),'https://www.globenewswire.com/NewsRoom/GoogleSitemap'))
 def test_no_slug_headline_lastmod_date_or_naive_time(self):
  for body in [b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.globenewswire.com/news-release/company-earnings.html</loc><lastmod>2026-10-02T12:00:00Z</lastmod></url></urlset>',xml(stamp='2026-10-02T12:00:00'),xml(stamp='2026-10-02')]:
   with self.assertRaises(SourceError):parse(body,URL)
 def test_unknown_publisher_wrong_host_and_wrong_endpoint_fail_closed(self):
  for body,url in [(xml().replace(b'GlobeNewswire',b'Other'),URL),(xml(url='https://evil.example/news-release/x'),URL),(xml(),'https://evil.example/sitemap')]:
   with self.assertRaises(SourceError):parse(body,url)
 def test_malicious_xml_and_oversized_documents(self):
  for body in [b'<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x/>',b'x'*(2*1024*1024+1),b'<bad']:
   with self.assertRaises(SourceError):parse(body,URL)
 def test_lawyer_solicitation_filtered_not_factual_litigation(self):
  self.assertTrue(parse(xml(title='ROSEN Encourages Apple Inc Investors to Secure Counsel Before Deadline'),URL)[0]['promotionalSolicitation'])
  self.assertFalse(parse(xml(title='Apple Inc reaches settlement in patent litigation'),URL)[0]['promotionalSolicitation'])
 def test_keywords_cannot_match_generic_word(self):
  from company_intelligence.model import Resolver
  r=parse(xml(title='Countries announce unity in a block of shares'),URL)[0]
  for name,ticker in [('Unity Software Inc.','U'),('Block Inc.','XYZ'),('Root Inc.','ROOT'),('Apple Inc.','AAPL')]:
   c=company(name,ticker);self.assertEqual(Resolver({c['companyId']:c}).resolve(r,{'type':'RSS','provider':'GLOBENEWSWIRE_SITEMAP','url':URL}),[])

class ManagementMaterialsTests(unittest.TestCase):
 def test_html_first_party_management_content_supported(self):
  links=[{'url':'https://apple.com/remarks','text':'Prepared remarks'},{'url':'https://apple.com/letter','text':'Shareholder letter'},{'url':'https://apple.com/commentary','text':'Management commentary'},{'url':'https://apple.com/replay','text':'Earnings call replay'}]
  docs=page_documents(company(),links,'https://apple.com/investors',NOW)
  self.assertEqual({d['type'] for d in docs},{'PREPARED_REMARKS','SHAREHOLDER_LETTER','MANAGEMENT_COMMENTARY','CALL_RECORDING'})
 def test_external_paid_transcript_and_private_links_rejected(self):
  links=[{'url':'https://paywall.example/transcript','text':'Transcript'},{'url':'http://127.0.0.1/x.pdf','text':'Presentation'},{'url':'https://cdn.example/s.pdf','text':'Presentation'}]
  self.assertEqual([d['url'] for d in page_documents(company(),links,'https://apple.com/investors',NOW)],['https://cdn.example/s.pdf'])
 def test_domain_only_validation_does_not_assert_ir_success(self):
  from company_intelligence.transport import PublicHTTP
  with tempfile.TemporaryDirectory() as tmp:
   c=company();c['officialSites']=[];cand={c['companyId']:{'status':'CANDIDATE','candidates':[{'url':'https://apple.com/'}]}}
   with patch('company_intelligence.discovery_batch.validate_candidate',return_value={'status':'VALIDATED','url':'https://apple.com/'}),patch('company_intelligence.discovery_batch.discover_ir',side_effect=AssertionError('IR_REQUEST')):
    rs=run([c],cand,PublicHTTP(tmp),NOW,4,60,domain_only=True)
   st=Store(Path(tmp)/'s.sqlite');persist(rs,st,{c['companyId']:c},NOW)
   self.assertEqual(st.state('officialSite:'+c['companyId'])['status'],'VALIDATED');self.assertIsNone(st.state('ir:'+c['companyId']));st.close()

class RealEntityDefects(unittest.TestCase):
 def test_exchange_references_are_not_nasdaq_company_news(self):
  from company_intelligence.model import Resolver
  c=company('Nasdaq, Inc.','NDAQ');r=Resolver({c['companyId']:c})
  for title in ['Arcutis Reports Inducement Grants Under Nasdaq Listing Rule 5635','ALHC Investigation (NASDAQ: ALHC)','Company Regains Compliance with Nasdaq Bid Price Requirement']:
   self.assertEqual(r.resolve({'headline':title},{'type':'RSS'}),[])
  self.assertTrue(r.resolve({'headline':'Nasdaq to Hold Third Quarter 2026 Investor Conference Call'},{'type':'RSS'}))
 def test_colliding_brand_prefix_cannot_assign_rogers_communications_to_rogers_corp(self):
  from company_intelligence.model import Resolver
  a=company('Rogers Corporation','ROG','0000000001');b=company('Rogers Communications Inc.','RCI','0000000002');r=Resolver({c['companyId']:c for c in [a,b]})
  self.assertEqual(r.resolve({'headline':'Rogers Completes Acquisition of Maple Leaf Sports'},{'type':'RSS'}),[])
  self.assertEqual([m['companyId'] for m in r.resolve({'headline':'Rogers Corporation Announces Acquisition'},{'type':'RSS'})],[a['companyId']])
 def test_longer_distinct_company_name_cannot_use_short_legal_alias(self):
  from company_intelligence.model import Resolver
  c=company('National HealthCare Corporation','NHC');r=Resolver({c['companyId']:c})
  self.assertEqual(r.resolve({'headline':'National Healthcare Properties Announces Dividend'},{'type':'RSS'}),[])
  self.assertTrue(r.resolve({'headline':'National HealthCare Corporation Announces Dividend'},{'type':'RSS'}))
 def test_crypto_cashtag_is_not_equity_evidence(self):
  from company_intelligence.model import Resolver
  c=company('Concentra Group Holdings Parent, Inc.','CON');r=Resolver({c['companyId']:c})
  self.assertEqual(r.resolve({'headline':'ConConAI Reaches 200 Wallets as $CON Utility Develops'},{'type':'RSS'}),[])

class DomainOwnershipTests(unittest.TestCase):
 def test_real_unrelated_corporate_identity_metadata(self):
  from company_intelligence.discovery import validate_candidate
  import html
  fixture=json.loads((Path(__file__).parent/'fixtures/domain-ownership-metadata.json').read_text())
  for case in fixture['cases']:
   class HTTP:
    def get(self,*args,**kwargs):return {'body':('<meta property="og:site_name" content="'+html.escape(case['corporateHeader'],quote=True)+'"><footer>'+html.escape(case['copyright'])+'</footer>').encode(),'finalUrl':case['url']}
   c=company(case['names'][0]);c['names']=case['names']
   self.assertEqual(validate_candidate(c,{'url':case['url'],'evidence':'OBSERVED_METADATA_FIXTURE'},HTTP(),NOW)['status'],'VALIDATED')
 def verify(self,name,title,body):
  from company_intelligence.discovery import validate_candidate
  class HTTP:
   def get(self,*args,**kwargs):return {'body':('<title>'+title+'</title>'+body).encode(),'finalUrl':'https://issuer.example/'}
  return validate_candidate(company(name),{'url':'https://issuer.example/','evidence':'CURRENT_MASTER_CANDIDATE'},HTTP(),NOW)
 def test_short_brand_requires_exact_copyright_legal_owner(self):
  self.assertEqual(self.verify('Meta Platforms Inc.','Meta','<footer>© 2026 Meta Platforms Incorporated</footer>')['status'],'VALIDATED')
  with self.assertRaises(SourceError):self.verify('Meta Platforms Inc.','Meta','<article>Our customer is Meta Platforms Inc.</article><footer>© 2026 Meta Research Ltd.</footer>')
 def test_similar_brand_different_legal_owner_is_rejected(self):
  with self.assertRaises(SourceError):self.verify('Rogers Corporation','Rogers','<footer>© 2026 Rogers Communications Inc.</footer>')
 def test_acronym_and_long_footer_after_large_body(self):
  self.assertEqual(self.verify('Helmerich & Payne Inc.','H&P Inc.','<main>'+('Drilling products '*100)+'</main><footer>© 2026 Helmerich &amp; Payne, Inc.</footer>')['status'],'VALIDATED')
 def test_corporation_and_corp_are_same_legal_suffix(self):
  self.assertEqual(self.verify('Matthews International Corp.','Matthews International Corporation','<footer>© 2026 Matthews International Corporation</footer>')['status'],'VALIDATED')
 def test_exact_multiword_footer_can_omit_suffix_with_matching_header(self):
  self.assertEqual(self.verify('Werner Enterprises Inc.','Werner Enterprises','<footer>© 2026 Werner Enterprises. All rights reserved.</footer>')['status'],'VALIDATED')
  with self.assertRaises(SourceError):self.verify('Werner Enterprises Inc.','Werner Enterprises','<footer>© 2026 Werner Enterprises Travel Ltd.</footer>')
  with self.assertRaises(SourceError):self.verify('Root Inc.','Root','<footer>© 2026 Root. All rights reserved.</footer>')
 def test_missing_title_uses_metadata_without_inventing_identity(self):
  from company_intelligence.discovery import validate_candidate
  class HTTP:
   def get(self,*args,**kwargs):return {'body':b'<meta property="og:site_name" content="BorgWarner"><footer>Copyright 2026 BorgWarner Inc.</footer>','finalUrl':'https://issuer.example/'}
  self.assertEqual(validate_candidate(company('BorgWarner Inc.'),{'url':'https://issuer.example/','evidence':'CANDIDATE_ONLY'},HTTP(),NOW)['status'],'VALIDATED')
 def test_generic_home_title_requires_corporate_metadata_and_exact_owner(self):
  self.assertEqual(self.verify('BorgWarner Inc.','Home','<meta property="og:site_name" content="BorgWarner"><footer>© 2026 BorgWarner Inc.</footer>')['status'],'VALIDATED')
  with self.assertRaises(SourceError):self.verify('Meta Platforms Inc.','Meta Platforms Inc.','<meta property="og:site_name" content="Meta Platforms"><p>Customer Meta Platforms Inc.</p><footer>© 2026 Other Research Ltd.</footer>')

class PrefixEntityTests(unittest.TestCase):
 def test_provident_services_does_not_match_provident_holdings(self):
  from company_intelligence.model import Resolver
  a=company('Provident Financial Holdings Inc.','PROV','0000000001');b=company('Provident Financial Services Inc.','PFS','0000000002');r=Resolver({c['companyId']:c for c in [a,b]})
  self.assertEqual([m['companyId'] for m in r.resolve({'headline':'Provident Financial Services, Inc. Schedules Third Quarter Earnings Call'},{'type':'RSS'})],[b['companyId']])

class TemporaryDomainFailure(unittest.TestCase):
 def test_transient_503_is_deferred_not_false_identity_rejection(self):
  from company_intelligence.transport import PublicHTTP
  c=company();c['officialSites']=[]
  with tempfile.TemporaryDirectory() as tmp:
   with patch('company_intelligence.discovery_batch.validate_candidate',side_effect=SourceError('HTTP_503')):
    rows=run([c],{c['companyId']:{'status':'CANDIDATE','candidates':[{'url':'https://apple.com/','evidence':'TEST'}]}},PublicHTTP(tmp),NOW,4,60,domain_only=True)
   self.assertEqual(rows[0]['status'],'DEFERRED');st=Store(Path(tmp)/'s.sqlite');persist(rows,st,{c['companyId']:c},NOW)
   self.assertEqual(st.state('officialSite:'+c['companyId'])['status'],'DEFERRED');self.assertIsNone(st.state('ir:'+c['companyId']));st.close()

class DomainDisplayNameConflict(unittest.TestCase):
 def test_display_alias_cannot_override_wrong_copyright_owner(self):
  from company_intelligence.discovery import validate_candidate
  class HTTP:
   def get(self,*args,**kwargs):return {'body':b'<title>Meta Research</title><p>Our customer Meta Platforms Inc.</p><footer>Copyright 2026 Meta Research Ltd.</footer>','finalUrl':'https://issuer.example/'}
  c=company('Meta Platforms Inc.');c['names']+=['Meta']
  with self.assertRaises(SourceError):validate_candidate(c,{'url':'https://issuer.example/','evidence':'CANDIDATE_ONLY'},HTTP(),NOW)

class WWWAliasOwnership(unittest.TestCase):
 def test_only_conventional_www_alias_is_equivalent(self):
  from company_intelligence.discovery import same_web_host
  self.assertTrue(same_web_host('https://www.apple.com/','https://apple.com/'));self.assertFalse(same_web_host('https://ir.apple.com/','https://apple.com/'));self.assertFalse(same_web_host('https://apple.com.evil.example/','https://apple.com/'))
 def test_www_redirect_still_requires_actual_legal_identity(self):
  from company_intelligence.discovery import validate_candidate
  class HTTP:
   def get(self,*args,**kwargs):return {'body':b'<title>Apple</title><footer>Copyright 2026 Apple Inc.</footer>','finalUrl':'https://apple.com/'}
  self.assertEqual(validate_candidate(company(),{'url':'https://www.apple.com/','evidence':'EXACT_CIK_CANDIDATE'},HTTP(),NOW)['url'],'https://apple.com/')

class CorroboratedSitemapIssuer(unittest.TestCase):
 def resolve(self,title,keyword='Root Inc.',stock='Nasdaq:ROOT'):
  from company_intelligence.model import Resolver
  c=company('Root Inc.','ROOT');r={'headline':title,'issuerKeywords':keyword,'distributionMetadata':{'stocks':[stock]}}
  return Resolver({c['companyId']:c}).resolve(r,{'type':'RSS','provider':'GLOBENEWSWIRE_SITEMAP','url':URL})
 def test_common_brand_requires_legal_keyword_listing_and_actual_actor(self):
  self.assertTrue(self.resolve('Root announces third quarter earnings date'))
  self.assertEqual(self.resolve('The root of international unity and a block of shares'),[])
  self.assertEqual(self.resolve('Root announces third quarter earnings date',keyword='root cause'),[])
  self.assertEqual(self.resolve('Root announces third quarter earnings date',stock='NYSE:ROOT'),[])
 def test_metadata_is_entity_evidence_not_distributor_authority(self):
  r=self.resolve('Root announces third quarter earnings date')[0];self.assertNotIn('EXACT_MASTER_CONTRIBUTOR',json.dumps(r))
