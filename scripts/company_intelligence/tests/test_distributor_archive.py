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
 def test_footer_or_tracker_link_never_overwrites_article_canonical(self):
  b=article().replace(b'</div>',b'<a href="https://www.globenewswire.com/Tracker?data=x">Webcast</a><a href="https://elsewhere.example/ir">Investor Relations</a></div>')
  self.assertEqual(metadata(b,URL)['url'],URL)
 def test_related_story_cannot_become_call_evidence(self):
  b=article().replace(b'</div>',b'</div><p>Another issuer will host an earnings conference call on November 2, 2026 at 9:00 a.m. ET.</p>')
  self.assertNotIn('November',metadata(b,URL)['callEvidence']);self.assertIn('Eastern Time',metadata(b,URL)['callEvidence'])
 def test_multiple_exchange_tickers_remain_independent(self):
  self.assertEqual(metadata(article(ticker='Nasdaq:AAPL,HKSE:1234'),URL)['distributionMetadata']['stocks'],['Nasdaq:AAPL','HKSE:1234'])
 def test_naive_date_wrong_publisher_and_wrong_canonical_fail(self):
  for b in [article(date='2026-10-02'),article().replace(b'GlobeNewswire',b'Other'),article().replace(URL.encode(),b'https://evil.example/news')]:
   with self.assertRaises(SourceError):metadata(b,URL)
 def test_malformed_publisher_and_author_fail_as_isolated_source_errors(self):
  for b in [article().replace(b'"publisher": {"name": "GlobeNewswire"}',b'"publisher": "GlobeNewswire"'),article().replace(b'"author": {"name": "Apple Inc.", "url": "https://apple.com/"}',b'"author": ["Apple Inc."]')]:
   with self.assertRaises(SourceError):metadata(b,URL)
 def test_contributor_stock_conflict_no_generic_fallback(self):
  c=company();s={'provider':'GLOBENEWSWIRE_ARTICLE','type':'RSS','format':'GNN_ARCHIVE','url':INDEX};r=Resolver({c['companyId']:c})
  self.assertEqual(r.resolve(metadata(article(author='Rosen Law Firm'),URL),s),[]);self.assertTrue(r.resolve(metadata(article(),URL),s))
 def test_resumable_staging_and_article_body_cache_removed(self):
  c=company();r=Resolver({c['companyId']:c});s={'sourceId':'archive','url':INDEX}
  class HTTP:
   def __init__(self,tmp):self.tmp=Path(tmp);self.calls=0;self.memo={(URL,True):article()}
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
 def test_call_retains_explicit_fiscal_period_and_actual_time_evidence(self):
  from unittest.mock import patch
  from company_intelligence.pipeline import Pipeline
  entry=metadata(article(date='2026-09-30T12:00:00Z'),URL)
  entry['headline']='Apple Inc. Announces Fourth Quarter Fiscal Year 2026 Earnings Conference Call'
  class HTTP:
   MAX_BYTES=2*1024*1024
   def get(self,url,**kwargs):return {'body':index(),'finalUrl':url}
  with tempfile.TemporaryDirectory() as tmp:
   st=Store(Path(tmp)/'s.sqlite');c=company();p=Pipeline(Path(tmp),{c['companyId']:c},st,HTTP(),NOW)
   source={'sourceId':'archive','provider':'GLOBENEWSWIRE_ARTICLE','type':'RSS','format':'GNN_ARCHIVE','url':INDEX}
   with patch('company_intelligence.distributor_archive.collect',return_value=[entry]):p.ingest_source(source)
   rows=[json.loads(r[0]) for r in st.db.execute("select payload from events where kind='EARNINGS_CALL'")]
   self.assertEqual(len(rows),1);self.assertEqual(rows[0]['fiscalQuarter'],'Q4');self.assertEqual(rows[0]['fiscalYear'],2026);self.assertEqual(rows[0]['time'],'17:00');self.assertIn('5:00 p.m. Eastern Time',rows[0]['evidence']['excerpt']);st.close()

 def test_transient_publisher_errors_pause_and_resume_without_week_long_identity_loss(self):
  urls=[URL.replace('/1/0/','/'+str(i)+'/0/') for i in range(1,5)]
  response={'body':('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+u+'</loc></url>' for u in urls)+'</urlset>').encode(),'finalUrl':INDEX}
  class HTTP:
   def __init__(self,tmp):self.tmp=Path(tmp);self.memo={};self.calls=[];self.recovered=False
   def _paths(self,url):return self.tmp/'body',self.tmp/'meta'
   def get(self,url,**kw):
    self.calls.append(url)
    for path in self._paths(url):path.write_bytes(b'disposable full article')
    if not self.recovered:raise SourceError('HTTP_503')
    return {'body':article().replace(URL.encode(),url.encode()),'finalUrl':url}
  with tempfile.TemporaryDirectory() as tmp:
   st=Store(Path(tmp)/'s.sqlite');h=HTTP(tmp);c=company();resolver=Resolver({c['companyId']:c});source={'sourceId':'archive','url':INDEX}
   self.assertEqual(collect(source,response,h,st,resolver,NOW),[])
   self.assertEqual(len(h.calls),3)
   self.assertEqual(st.state('distributorArchiveRun:archive')['stopReason'],'PUBLISHER_TEMPORARY_FAILURE_PAUSE')
   for url in h.calls:
    checkpoint=st.state('distributorArchive:'+url)
    self.assertEqual(checkpoint['status'],'TEMPORARY_FAILURE');self.assertEqual(checkpoint['nextAttempt'],'2026-10-01T19:00:00Z')
   self.assertIsNone(st.state('distributorArchive:'+urls[0]))
   self.assertFalse((Path(tmp)/'body').exists());h.recovered=True
   self.assertEqual(len(collect(source,response,h,st,resolver,'2026-10-01T20:00:00Z')),4)
   self.assertFalse((Path(tmp)/'body').exists());st.close()

 def test_real_transport_memo_and_disk_discard_bodies_for_valid_and_invalid_metadata(self):
  import io
  from company_intelligence.transport import PublicHTTP
  from company_intelligence.model import canonical_url
  class Response(io.BytesIO):
   headers={'Content-Type':'text/html'}
  class Clock:
   def __init__(self):self.value=0
   def now(self):return self.value
   def sleep(self,n):self.value+=n
  for body in (article(),b'<html>FULL ARTICLE WITHOUT VERIFIED METADATA</html>'):
   with self.subTest(valid=body==article()),tempfile.TemporaryDirectory() as tmp:
    clock=Clock();calls=[]
    def opener(request,**kw):
     calls.append(request.full_url)
     return Response(b'User-agent: *\nAllow: /\n' if request.full_url.endswith('/robots.txt') else body)
    h=PublicHTTP(Path(tmp)/'http',opener=opener,validator=canonical_url,clock=clock.now,sleep=clock.sleep)
    st=Store(Path(tmp)/'s.sqlite');c=company();resolver=Resolver({c['companyId']:c});source={'sourceId':'archive','url':INDEX}
    h.get(URL,persist=False)
    self.assertNotIn((URL,True),h.memo);self.assertFalse(any(path.exists() for path in h._paths(URL)))
    rows=collect(source,{'body':index(),'finalUrl':INDEX},h,st,resolver,NOW)
    self.assertEqual(len(rows),int(body==article()));self.assertIn(URL,calls)
    self.assertNotIn((URL,True),h.memo);self.assertFalse(any(path.exists() for path in h._paths(URL)))
    self.assertTrue(any(key[0].endswith('/robots.txt') for key in h.memo))
    self.assertNotIn('FULL ARTICLE',json.dumps(st.state('distributorArchive:'+URL)));st.close()

 def test_private_checkpoint_excludes_legacy_interrupted_article_cache_but_restores_staged_metadata(self):
  import hashlib
  from company_intelligence.checkpoint import pack,restore
  from company_intelligence.store import atomic_json
  from company_intelligence.transport import PublicHTTP
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);state=root/'state';state.mkdir();st=Store(state/'state.sqlite');entry=metadata(article(),URL);st.set_state('distributorArchive:'+URL,{'status':'PARSED','entry':entry});st.close()
   h=PublicHTTP(state/'http');mp,bp=h._paths(URL);bp.write_bytes(article());atomic_json(mp,{'url':URL,'finalUrl':URL,'sha256':hashlib.sha256(article()).hexdigest(),'checked':1})
   safe='https://www.globenewswire.com/robots.txt';sm,sb=h._paths(safe);sb.write_bytes(b'User-agent: *\nAllow: /');atomic_json(sm,{'url':safe,'finalUrl':safe,'sha256':hashlib.sha256(sb.read_bytes()).hexdigest(),'checked':1})
   destination=root/'snapshot.tar.gz';proof=pack(state,destination);fresh=root/'restored';restore(destination,fresh,proof['sha256'])
   self.assertTrue(bp.exists()) # Packing never mutates the original evidence/cache.
   self.assertFalse((fresh/'http'/bp.name).exists());self.assertFalse((fresh/'http'/mp.name).exists());self.assertTrue((fresh/'http'/sb.name).exists())
   restored=Store(fresh/'state.sqlite');self.assertEqual(restored.state('distributorArchive:'+URL)['entry'],entry);restored.close()
