import tempfile,unittest
from pathlib import Path
from company_intelligence.news_quality import eligible,wordpress_feed
from company_intelligence.feeds import discover_ir
from company_intelligence.transport import SourceError
from test_engine import company,NOW

class CMSNewsQuality(unittest.TestCase):
 def test_actual_agency_blog_and_default_post_are_not_announcements(self):
  c=company('SPX Technologies Inc.','SPXC')
  for title in ('Open Channels FM: Your Website Could Use a Changelog to Fuel Creativity','Open Channels FM: Is It Time to Move On? Navigating Change and Letting Go in Fast-Paced Times','Hello world!','Comment on Hello world! by A WordPress Commenter'):
   self.assertFalse(eligible({'headline':title},c,True))
  self.assertTrue(eligible({'headline':'SPX Technologies Inc. Reports Third Quarter Results'},c,True))
  self.assertFalse(eligible({'headline':'Quarterly earnings release'},c,True))
 def test_generator_detection_is_independent_of_ir_vendor_fingerprint(self):
  self.assertTrue(wordpress_feed(b'<rss><channel><generator>https://wordpress.org/?v=7.1</generator></channel></rss>'))
  self.assertFalse(wordpress_feed(b'<rss><channel><description>wordpress.org</description></channel></rss>'))
 def test_generic_words_are_not_corporate_actors_in_cms_blog(self):
  c=company('Root Inc.','ROOT')
  self.assertFalse(eligible({'headline':'The root of international unity'},c,True))
  self.assertFalse(eligible({'headline':'Strategic partnerships address the root of international unity'},c,True))
  self.assertFalse(eligible({'headline':'Open Channels FM: Our new product partnership'},company('SPX Technologies Inc.','SPXC'),True))
 def test_verified_cms_corporate_actor_does_not_need_external_financial_context(self):
  self.assertTrue(eligible({'headline':'Entergy supports student innovation'},company('Entergy Corporation','ETR'),True))
  self.assertTrue(eligible({'headline':'THE YORK WATER COMPANY REPORTS SECOND QUARTER EARNINGS'},company('York Water Co','YORW'),True))
  self.assertTrue(eligible({'headline':'BBVA Renews Its Leadership Team'},company('Banco Bilbao Vizcaya Argentaria','BBVA'),True))
  self.assertFalse(eligible({'headline':'A new partnership fosters unity between nations'},company('Unity Software Inc.','U'),True))
  self.assertFalse(eligible({'headline':'TARGET NEW CUSTOMERS WITH THIS PRODUCT'},company('Target Corporation','TGT'),True))
 def test_comment_feed_and_default_post_never_validate_news_coverage(self):
  c=company('United States Antimony Corp','UAMY');url='https://usantimony.com/'
  body=b'<rss><channel><generator>https://wordpress.org/</generator><item><title>Hello world!</title><link>https://usantimony.com/hello-world/</link><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>'
  seen=[]
  class HTTP:
   def get(self,u,**kwargs):
    seen.append(u)
    if u==url:return {'body':b'<link type="application/rss+xml" href="/comments/feed/"><link type="application/rss+xml" href="/feed/">','finalUrl':u}
    if u==url+'feed/':return {'body':body,'finalUrl':u}
    raise SourceError('HTTP_404')
  sources,_=discover_ir(c,url,HTTP(),NOW)
  self.assertEqual(sources,[]);self.assertNotIn(url+'comments/feed/',seen)
 def test_pipeline_records_rejection_without_news_or_earnings(self):
  from company_intelligence.pipeline import Pipeline
  from company_intelligence.store import Store
  c=company('SPX Technologies Inc.','SPXC');url='https://issuer.example/feed/'
  body=b'<rss><channel><generator>https://wordpress.org/</generator><item><title>Open Channels FM: Your Website Could Use a Changelog to Fuel Creativity</title><link>https://issuer.example/blog</link><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>'
  class HTTP:
   def get(self,*args,**kwargs):return {'body':body,'finalUrl':url}
  with tempfile.TemporaryDirectory() as tmp:
   s=Store(Path(tmp)/'s.sqlite');source={'sourceId':'news','companyId':c['companyId'],'type':'IR_FEED','provider':'GCS','verified':True,'url':url,'allowedSites':['https://issuer.example/']}
   p=Pipeline(Path(tmp),{c['companyId']:c},s,HTTP(),NOW);p.ingest_source(source)
   self.assertEqual(s.db.execute('select count(*) from items').fetchone()[0],0)
   self.assertEqual(s.db.execute('select count(*) from events').fetchone()[0],0)
   self.assertEqual(s.sources()[0]['lastRejectedItems'],1)
   self.assertIsNone(s.sources()[0]['latestContentAt'])
   self.assertEqual(s.sources()[0]['cmsNewsPolicy'],'WORDPRESS_EXPLICIT_ISSUER_ACTOR')
   from company_intelligence.pipeline import advance
   self.assertEqual(s.sources()[0]['nextCheck'],advance(NOW,24));s.close()

 def test_verified_wordpress_event_feed_retains_generic_earnings_call_title(self):
  c=company('SPX Technologies Inc.','SPXC');url='https://issuer.example/investors/'
  body=b'<rss><channel><generator>https://wordpress.org/</generator><item><title>Third Quarter 2026 Earnings Call</title><link>https://issuer.example/investors/earnings-call</link><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>'
  class HTTP:
   def get(self,u,**kwargs):
    if u==url:return {'body':b'<meta name="generator" content="WordPress"><link type="application/rss+xml" href="/events/feed/">','finalUrl':u}
    if u=='https://issuer.example/events/feed/':return {'body':body,'finalUrl':u}
    raise SourceError('HTTP_404')
  sources,_=discover_ir(c,url,HTTP(),NOW)
  self.assertTrue(any(s['type']=='IR_EVENTS' and s['url']=='https://issuer.example/events/feed/' for s in sources))

 def test_ir_hub_and_results_rank_ahead_of_low_value_investor_navigation(self):
  c=company('Ames National Corp','ATLO');url='https://issuer.example/'
  homepage=b'<a href="/investors/faqs">Investor FAQs</a><a href="/investors/governance">Investor Governance</a><a href="/investors/results">Quarterly Results</a><a href="/investors/">Investor Relations</a>'
  seen=[]
  class HTTP:
   def get(self,u,**kwargs):
    seen.append(u);return {'body':homepage if u==url else b'<html></html>','finalUrl':u}
  _,configs=discover_ir(c,url,HTTP(),NOW,max_pages=3)
  self.assertEqual([cfg['irHomepage'] for cfg in configs],[url,url+'investors/',url+'investors/results'])
  self.assertNotIn(url+'investors/faqs',seen);self.assertNotIn(url+'investors/governance',seen)
