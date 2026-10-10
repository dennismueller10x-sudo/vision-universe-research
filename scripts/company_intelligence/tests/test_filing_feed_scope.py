import tempfile
import unittest
from pathlib import Path
from company_intelligence.feeds import discover_ir,parse_feed
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from test_engine import company,NOW


class FilingFeedScopeTests(unittest.TestCase):
 def test_direct_and_landing_feed_discovery_leave_filings_to_sec(self):
  root='https://apple.com/';ir='https://apple.com/investors/';landing=ir+'rss-feeds'
  news='https://apple.com/rss/PressRelease.aspx';sec='https://apple.com/rss/SECFiling.aspx?Exchange=CIK&Symbol=0000320193'
  for use_landing in (False,True):
   calls=[];links=f'<link type="application/rss+xml" href="{sec}"><link type="application/rss+xml" href="{news}">'
   pages={root:'<a href="'+ir+'">Investors</a>',ir:('<a href="'+landing+'">RSS Feeds</a>' if use_landing else links),landing:links,news:'<rss><channel><item><title>Apple Inc Results</title><link>https://apple.com/news/results</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>'}
   class HTTP:
    def get(self,url,**kwargs):
     calls.append(url)
     if url==sec:raise AssertionError('filing feed fetched as news')
     return {'finalUrl':url,'body':pages[url].encode(),'contentType':'text/html' if url==landing else 'application/rss+xml'}
   sources,_=discover_ir(company(),root,HTTP(),NOW)
   self.assertEqual([s['url'] for s in sources if s['type']=='IR_FEED'],[news])
   self.assertNotIn(sec,calls)

 def test_preexisting_filing_source_is_not_polled_as_news_and_feed_parser_survives(self):
  body=b'<rss><channel><item><title>Apple Inc - 10-K - Annual Report</title><link>https://apple.com/sec-filings/10k</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>'
  self.assertEqual(len(parse_feed(body,'https://apple.com/rss/SECFiling.aspx')),1)
  with tempfile.TemporaryDirectory() as tmp:
   c=company();s=Store(Path(tmp)/'state.sqlite');calls=[]
   class HTTP:
    stats={}
    def get(self,url,**kwargs):
     calls.append(url);return {'body':body,'finalUrl':url}
   source={'sourceId':'legacy-filing','companyId':c['companyId'],'type':'IR_FEED','format':'RSS','url':'https://apple.com/rss/SECFiling.aspx?Exchange=CIK&Symbol=0000320193','allowedSites':['https://apple.com/'],'verified':True,'active':True,'intervalHours':4}
   p=Pipeline(tmp,{c['companyId']:c},s,HTTP(),NOW);p.ingest_source(source)
   self.assertEqual(calls,[]);self.assertEqual(s.db.execute('select count(*) from items').fetchone()[0],0)
   self.assertEqual(s.db.execute('select count(*) from events').fetchone()[0],0)
   self.assertEqual(s.sources()[0]['lastError'],'SourceError:NON_NEWS_SEC_FILING_FEED');s.close()
