import json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.distributor_archive import archive_urls,metadata,collect
from company_intelligence.store import Store
from company_intelligence.transport import SourceError,BudgetExhausted
from company_intelligence.model import Resolver
from test_engine import company,NOW
URL='https://www.globenewswire.com/news-release/2026/10/02/1/0/en/apple-inc-earnings.html'
INDEX='https://sitemaps.globenewswire.com/news/en/2026-10.xml'
def article(author='Apple Inc.',ticker='Nasdaq:AAPL',date='2026-10-02T12:00:00Z'):
 n={'@type':'NewsArticle','headline':'Apple Inc. Announces Earnings Conference Call','datePublished':date,'url':URL,'publisher':{'name':'GlobeNewswire'},'author':{'name':author,'url':'https://apple.com/'}}
 return ('<meta name="ticker" content="'+ticker+'"><script type="application/ld+json">'+json.dumps(n)+'</script><div itemprop="articleBody"><p>A conference call will be held on October 28, 2026 at 5:00 p.m. Eastern Time.</p><p>Full copyrighted article content must never enter a payload.</p></div><a href="https://www.globenewswire.com/Tracker?data=x">Webcast</a>').encode()
def index():return ('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+URL+'</loc><lastmod>2099-01-01</lastmod></url></urlset>').encode()
class Archive(unittest.TestCase):
 def test_urls_are_discovery_only_not_slug_or_lastmod_as_news(self):self.assertEqual(archive_urls(index(),INDEX),[URL])
 def test_xml_entity_wrong_host_wrong_path_and_oversize_rejected(self):
  for b,u in [(b'<!DOCTYPE x><x/>',INDEX),(index(),'https://evil.example/news/en/2026-10.xml'),(index(),'https://sitemaps.globenewswire.com/api'),(b'x'*(8*1024*1024+1),INDEX)]:
   with self.assertRaises(SourceError):archive_urls(b,u)
 def test_explicit_metadata_keeps_only_short_call_evidence(self):
  e=metadata(article(),URL);self.assertEqual(e['distributionMetadata']['contributor'],'Apple Inc.');self.assertEqual(e['publishedAt'],'2026-10-02T12:00:00Z');self.assertNotIn('copyrighted',json.dumps(e));self.assertEqual(e['materialLinks'],[]);self.assertIn('October 28',e['callEvidence'])
 def test_related_story_cannot_become_call_evidence(self):
  b=article().replace(b'</div>',b'</div><p>Another issuer will host an earnings conference call on November 2, 2026 at 9:00 a.m. ET.</p>')
  self.assertNotIn('November',metadata(b,URL)['callEvidence']);self.assertIn('Eastern Time',metadata(b,URL)['callEvidence'])
 def test_multiple_exchange_tickers_remain_independent(self):
  self.assertEqual(metadata(article(ticker='Nasdaq:AAPL,HKSE:1234'),URL)['distributionMetadata']['stocks'],['Nasdaq:AAPL','HKSE:1234'])
 def test_naive_date_wrong_publisher_and_wrong_canonical_fail(self):
  for b in [article(date='2026-10-02'),article().replace(b'GlobeNewswire',b'Other'),article().replace(URL.encode(),b'https://evil.example/news')]:
   with self.assertRaises(SourceError):metadata(b,URL)
 def test_contributor_stock_conflict_no_generic_fallback(self):
  c=company();s={'provider':'GLOBENEWSWIRE_ARTICLE','type':'RSS','format':'GNN_ARCHIVE','url':INDEX};r=Resolver({c['companyId']:c})
  self.assertEqual(r.resolve(metadata(article(author='Rosen Law Firm'),URL),s),[]);self.assertTrue(r.resolve(metadata(article(),URL),s))
 def test_resumable_staging_and_article_body_cache_removed(self):
  c=company();r=Resolver({c['companyId']:c});s={'sourceId':'archive','url':INDEX}
  class HTTP:
   def __init__(self,tmp):self.tmp=Path(tmp);self.calls=0;self.memo={URL:article()}
   def _paths(self,url):return self.tmp/'body',self.tmp/'meta'
   def get(self,url,**kw):
    self.calls+=1
    for p in self._paths(url):p.write_bytes(article())
    return {'body':article(),'finalUrl':url}
  with tempfile.TemporaryDirectory() as tmp:
   st=Store(Path(tmp)/'s.sqlite');h=HTTP(tmp);a=collect(s,{'body':index(),'finalUrl':INDEX},h,st,r,NOW)
   self.assertEqual(len(a),1);self.assertFalse((Path(tmp)/'body').exists());self.assertEqual(h.memo,{})
   self.assertEqual(collect(s,{'body':index(),'finalUrl':INDEX},h,st,r,NOW),a);self.assertEqual(h.calls,1)
   st.set_state('distributorArchive:'+URL,{'status':'INGESTED'});self.assertEqual(collect(s,{'body':index(),'finalUrl':INDEX},h,st,r,NOW),[]);st.close()
