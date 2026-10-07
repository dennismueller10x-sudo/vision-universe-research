import json,unittest
from urllib.parse import urlencode
from company_intelligence.model import canonical_url
from company_intelligence.feeds import parse_links
from company_intelligence.wordpress_news import discover,parse,endpoint,FIELDS
from company_intelligence.transport import SourceError
from test_wordpress_news import row
from test_engine import company,NOW
ROOT='https://apple.com/wp-json/'
def collection_url(name):
 return canonical_url(ROOT+'wp/v2/'+name+'?'+urlencode({'_fields':FIELDS,'per_page':20,'context':'view','orderby':'date','order':'desc'}))
def descriptor():return {'endpoints':[{'methods':['GET'],'args':{'per_page':{},'orderby':{'enum':['date','title']}}}]}
class HTTP:
 def __init__(self,names,entries):self.calls=[];self.names=names;self.entries=entries
 def get(self,url,**kw):
  self.calls.append(url)
  if url==endpoint(ROOT):body=[]
  elif url==canonical_url(ROOT+'?'+urlencode({'_fields':'namespaces,routes'})):body={'routes':{'/wp/v2/'+n:descriptor() for n in self.names}}
  elif url in {collection_url(n) for n in self.names}:body=self.entries.get(url,[])
  else:raise SourceError('UNADVERTISED_ROUTE')
  return {'body':json.dumps(body).encode(),'finalUrl':url}
class WordPressObservedCollectionsTests(unittest.TestCase):
 def discover(self,h):return discover(parse_links(b'<link rel="https://api.w.org/" href="https://apple.com/wp-json/">',ROOT),ROOT,company(),[ROOT],h,NOW)
 def test_observed_custom_collections_preserve_dated_schema_and_metadata_only_contract(self):
  for name in ('press-release','financial-release','press','press-room','press_release','news-media','pressreleases',
               'company_news','financial_news','announcement','news_release','inv_press_release'):
   with self.subTest(name=name):
    h=HTTP([name],{collection_url(name):[row()]});s=self.discover(h);self.assertIsNotNone(s);self.assertEqual(s['restCollection'],name);self.assertEqual(h.calls,[endpoint(ROOT),canonical_url(ROOT+'?'+urlencode({'_fields':'namespaces,routes'})),collection_url(name)]);self.assertEqual(len(parse(json.dumps([row()]).encode(),s,s['url'])),1)
    with self.assertRaisesRegex(SourceError,'VERIFIED_METADATA_CONTRACT'):parse(json.dumps([row()]).encode(),{**s,'verificationEvidence':{}},s['url'])
    with self.assertRaisesRegex(SourceError,'BODY_FIELDS'):parse(json.dumps([{**row(),'content':{'rendered':'FULL ARTICLE BODY'}}]).encode(),s,s['url'])
 def test_unrelated_first_collection_does_not_suppress_second_advertised_issuer_news(self):
  first=collection_url('news');second=collection_url('press-releases');h=HTTP(['news','press-releases'],{first:[row('Other Company Inc. reports quarterly results')],second:[row()]});s=self.discover(h);self.assertIsNotNone(s);self.assertEqual(s['restCollection'],'press-releases');self.assertEqual(h.calls[-2:],[first,second])
 def test_two_collection_budget_does_not_enumerate_a_third_advertised_route(self):
  first=collection_url('news');second=collection_url('press-releases');third=collection_url('announcements');h=HTTP(['news','press-releases','announcements'],{first:[row('Other Company Inc. reports results')],second:[],third:[row()]});self.assertIsNone(self.discover(h));self.assertEqual(h.calls[-2:],[first,second]);self.assertNotIn(third,h.calls)
if __name__=='__main__':unittest.main()
