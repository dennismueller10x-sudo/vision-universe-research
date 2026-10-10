import json,tempfile,unittest,copy
from pathlib import Path
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from company_intelligence.wordpress_news import endpoint
from test_engine import company,NOW

class WordPressIssuerScopeTests(unittest.TestCase):
 def run_feed(self,fmt,parent_name,child_name,parent_title,child_title):
  parent=copy.deepcopy(company());parent['names']=[parent_name];parent['officialSites']=['https://teekay.com/'];parent['companyId']='parent';child=copy.deepcopy(parent);child.update(companyId='child',names=[child_name],cik='1419945');child['listings']=[{**child['listings'][0],'symbol':'TNK'}]
  entries=[{'headline':child_title,'url':'https://teekay.com/child','publishedAt':'2026-10-01T12:00:00Z'},{'headline':parent_title,'url':'https://teekay.com/parent','publishedAt':'2026-10-01T12:00:00Z'}]
  src={'companyId':'parent','sourceId':'shared-wordpress','verified':True,'type':'IR_FEED','provider':'WORDPRESS','allowedSites':['https://teekay.com/'],'format':fmt,'url':endpoint('https://teekay.com/wp-json/') if fmt=='WORDPRESS_REST_NEWS' else 'https://teekay.com/feed/','intervalHours':4}
  if fmt=='WORDPRESS_REST_NEWS':body=json.dumps([{'title':{'rendered':e['headline']},'link':e['url'],'date_gmt':'2026-10-01T12:00:00'} for e in entries]).encode()
  else:
   import html
   body=('<rss><channel><generator>https://wordpress.org/</generator>'+''.join('<item><title>'+html.escape(e['headline'])+'</title><link>'+e['url']+'</link><pubDate>Thu, 1 Oct 2026 12:00:00 GMT</pubDate></item>' for e in entries)+'</channel></rss>').encode()
  class HTTP:
   def get(self,url,**kwargs):return {'body':body,'finalUrl':url}
  with tempfile.TemporaryDirectory() as tmp:
   s=Store(Path(tmp)/'state.sqlite');p=Pipeline(Path(tmp),{'parent':parent,'child':child},s,HTTP(),NOW);p.ingest_source(src);items=[json.loads(v[0]) for v in s.db.execute('select payload from items')];self.assertEqual([v['canonicalUrl'] for v in items],['https://teekay.com/parent']);self.assertFalse(any(json.loads(v[0]).get('sourceUrl')=='https://teekay.com/child' for v in s.db.execute('select payload from events')));s.close()
 def test_rest_more_specific_listed_subsidiary_does_not_inherit_parent_feed_trust(self):
  self.run_feed('WORDPRESS_REST_NEWS','Teekay Corp Ltd','Teekay Tankers Ltd.','Teekay Corporation Ltd. Reports Second Quarter Results','Teekay Tankers Ltd. Reports Second Quarter Results')
 def test_rss_nonfinancial_child_name_is_scoped_before_verified_feed_matching(self):
  self.run_feed('RSS','Teekay Corp Ltd','Teekay Tankers Ltd.','Teekay launches a corporate hiring initiative','Teekay Tankers’ Market Update, September 2026')
 def test_independent_parent_mention_survives_and_provident_collision_is_rejected(self):
  self.run_feed('WORDPRESS_REST_NEWS','Provident Financial','Provident Financial Services Inc.','Provident Financial announces results alongside Provident Financial Services Inc.','Provident Financial Services Inc. reports quarterly results')

if __name__=='__main__':unittest.main()
