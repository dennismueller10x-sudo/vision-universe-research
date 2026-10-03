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
  self.assertTrue(eligible({'headline':'Quarterly earnings release'},c,True))
 def test_generator_detection_is_independent_of_ir_vendor_fingerprint(self):
  self.assertTrue(wordpress_feed(b'<rss><channel><generator>https://wordpress.org/?v=7.1</generator></channel></rss>'))
  self.assertFalse(wordpress_feed(b'<rss><channel><description>wordpress.org</description></channel></rss>'))
 def test_generic_words_are_not_corporate_actors_in_cms_blog(self):
  c=company('Root Inc.','ROOT')
  self.assertFalse(eligible({'headline':'The root of international unity'},c,True))
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
   self.assertIsNone(s.sources()[0]['latestContentAt']);s.close()
