import io,json,tempfile,unittest,urllib.error
from pathlib import Path
from company_intelligence.news_backfill import backfill
from company_intelligence.store import Store
from company_intelligence.pipeline import Pipeline
from company_intelligence.transport import PublicHTTP
from company_intelligence.checkpoint import pack,restore
from test_engine import company,NOW

class Response(io.BytesIO):
 def __init__(self,body,ctype):super().__init__(body);self.headers={'Content-Type':ctype}
class NewsBackfillTests(unittest.TestCase):
 def setup_sources(self,state):
  a=company();b=company('Root, Inc.','ROOT','0001788882');b['officialSites']=['https://root.example/'];s=Store(state/'state.sqlite')
  for sid,c,host in [('a',a,'apple.com'),('b',b,'root.example')]:s.source({'sourceId':sid,'companyId':c['companyId'],'type':'IR_FEED','provider':'FIRST_PARTY','verified':True,'active':True,'url':'https://'+host+'/news.xml','allowedSites':['https://'+host+'/'],'intervalHours':4})
  return s,{a['companyId']:a,b['companyId']:b}
 def http(self,state,fail=False,budget=100):
  calls=[]
  def opener(req,**kw):
   calls.append(req.full_url)
   if fail:raise urllib.error.HTTPError(req.full_url,503,'Unavailable',{},io.BytesIO(b'upstream connect error or disconnect/reset before headers'))
   if req.full_url.endswith('/robots.txt'):return Response(b'User-agent: *\nAllow: /\n','text/plain')
   root='https://root.example' if 'root.example' in req.full_url else 'https://apple.com';name='Root, Inc.' if 'root.example' in req.full_url else 'Apple Inc.'
   return Response(f'<rss><channel><title>{name}</title><item><title>{name} reports quarterly financial results</title><link>{root}/story</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>'.encode(),'application/rss+xml')
  return PublicHTTP(state/'http',budget=budget,interval=0,sleep=lambda _:None,opener=opener,validator=lambda url:url),calls
 def test_frozen_sources_resume_after_restore_and_do_not_add_new_routes(self):
  with tempfile.TemporaryDirectory() as tmp:
   st=Path(tmp)/'state';s,cs=self.setup_sources(st);h,calls=self.http(st);p=Pipeline(tmp,cs,s,h,NOW);r=backfill(p,1,'frozen');self.assertEqual(r['attemptedSourceIds'],['a']);self.assertEqual(r['recoveredNewsIssuers'],[company()['companyId']]);pack(st,Path(tmp)/'checkpoint.tar.gz');s.close()
   fresh=Path(tmp)/'restore';restore(Path(tmp)/'checkpoint.tar.gz',fresh);s=Store(fresh/'state.sqlite');s.source({'sourceId':'later','companyId':company()['companyId'],'url':'https://apple.com/later.xml','type':'IR_FEED','verified':True,'allowedSites':['https://apple.com/']});h,calls=self.http(fresh);r=backfill(Pipeline(tmp,cs,s,h,NOW),10,'frozen');self.assertEqual(r['attemptedSourceIds'],['b']);self.assertEqual(len(s.state('newsSourceBackfill:frozen:inventory')),2);self.assertFalse(any('later.xml' in u for u in calls));h,calls=self.http(fresh);self.assertEqual(backfill(Pipeline(tmp,cs,s,h,NOW),10,'frozen')['stopReason'],'NO_DUE_SOURCES');self.assertEqual(calls,[]);s.close()
 def test_failure_cooldown_and_disabled_unverified_sources_are_preserved(self):
  with tempfile.TemporaryDirectory() as tmp:
   st=Path(tmp);s,cs=self.setup_sources(st);a=next(x for x in s.sources() if x['sourceId']=='a');s.source({**a,'failureCount':3,'lastError':'HTTP_401','nextCheck':'2099-01-01T00:00:00Z'});b=next(x for x in s.sources() if x['sourceId']=='b');s.source({**b,'active':False});s.source({**a,'sourceId':'unproven','verified':False,'failureCount':0});before=s.sources();h,calls=self.http(st);r=backfill(Pipeline(tmp,cs,s,h,NOW));self.assertEqual(r['stopReason'],'NO_DUE_SOURCES');self.assertEqual(calls,[]);self.assertEqual(s.sources(),before);s.close()
 def test_budget_exhaustion_leaves_unsent_source_pending_with_health_unchanged(self):
  with tempfile.TemporaryDirectory() as tmp:
   st=Path(tmp);s,cs=self.setup_sources(st);h,calls=self.http(st,budget=2);r=backfill(Pipeline(tmp,cs,s,h,NOW));self.assertEqual(r['stopReason'],'BUDGET_DEFERRED');self.assertEqual(r['attemptedSourceIds'],['a']);b=next(x for x in s.sources() if x['sourceId']=='b');self.assertNotIn('lastChecked',b);self.assertIsNone(s.state('newsSourceBackfill:unpolled-news:b'));s.close()
 def test_restored_shared_circuit_stops_before_fifth_unrelated_host(self):
  with tempfile.TemporaryDirectory() as tmp:
   st=Path(tmp)/'state';s=Store(st/'state.sqlite');c=company()
   for i in range(6):s.source({'sourceId':str(i),'companyId':c['companyId'],'type':'IR_FEED','verified':True,'allowedSites':['https://host'+str(i)+'.example/'],'url':'https://host'+str(i)+'.example/news.xml'})
   s.set_state('officialSite:'+c['companyId'],{'status':'VALIDATED','url':'https://apple.com/'});h,calls=self.http(st,fail=True);r=backfill(Pipeline(tmp,{c['companyId']:c},s,h,NOW));self.assertEqual(r['stopReason'],'CIRCUIT_OPEN');self.assertLessEqual(len(calls),10);self.assertFalse(any('host4.' in u for u in calls));self.assertEqual(s.state('officialSite:'+c['companyId'])['status'],'VALIDATED');pack(st,Path(tmp)/'circuit.tar.gz');s.close();fresh=Path(tmp)/'restore';restore(Path(tmp)/'circuit.tar.gz',fresh);s=Store(fresh/'state.sqlite');h,calls=self.http(fresh);self.assertEqual(backfill(Pipeline(tmp,{c['companyId']:c},s,h,NOW))['stopReason'],'CIRCUIT_COOLDOWN');self.assertEqual(calls,[]);s.close()
 def test_changed_frozen_source_identity_is_withheld_without_requests(self):
  with tempfile.TemporaryDirectory() as tmp:
   st=Path(tmp);s,cs=self.setup_sources(st);h,calls=self.http(st);backfill(Pipeline(tmp,cs,s,h,NOW),1,'identity');b=next(x for x in s.sources() if x['sourceId']=='b');s.source({**b,'url':'https://wrong.example/news.xml'});h,calls=self.http(st);r=backfill(Pipeline(tmp,cs,s,h,NOW),10,'identity');self.assertEqual(calls,[]);self.assertEqual(s.state('newsSourceBackfill:identity:b')['status'],'SOURCE_IDENTITY_CHANGED');self.assertEqual(r['attemptedSources'],0);s.close()
 def test_frozen_issuer_scope_cannot_expand_on_restore(self):
  with tempfile.TemporaryDirectory() as tmp:
   st=Path(tmp)/'state';s,cs=self.setup_sources(st);cid=company()['companyId'];h,calls=self.http(st);r=backfill(Pipeline(tmp,cs,s,h,NOW),10,'scope',{cid});self.assertEqual(r['attemptedSourceIds'],['a']);self.assertFalse(any('root.example' in u for u in calls));pack(st,Path(tmp)/'scoped.tar.gz');s.close();fresh=Path(tmp)/'restore';restore(Path(tmp)/'scoped.tar.gz',fresh);s=Store(fresh/'state.sqlite');h,calls=self.http(fresh)
   with self.assertRaisesRegex(ValueError,'SCOPE_CHANGED'):backfill(Pipeline(tmp,cs,s,h,NOW),10,'scope')
   self.assertEqual(calls,[]);self.assertEqual(len(s.state('newsSourceBackfill:scope:inventory')),1);s.close()


class NewsBackfillIntegrationTests(unittest.TestCase):
 def test_cli_polls_existing_owned_sources_without_financial_projection_or_global_poll(self):
  import contextlib
  from unittest.mock import patch
  from company_intelligence.cli import main
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);st=r/'.company-intelligence';c=company();cfg=r/'company-intelligence/config';cfg.mkdir(parents=True);(cfg/'official-sites.json').write_text('{}')
   owned={'sourceId':'owned','companyId':c['companyId'],'type':'IR_FEED','verified':True,'url':'https://apple.com/news.xml','allowedSites':['https://apple.com/']}
   global_source={'sourceId':'global','type':'RSS','url':'https://global.example/feed','active':True}
   (cfg/'sources.json').write_text(json.dumps([owned,global_source]));st.mkdir();helper=NewsBackfillTests();h,calls=helper.http(st);output=io.StringIO()
   with patch('company_intelligence.cli.load_universe',return_value={c['companyId']:c}),patch('company_intelligence.cli.PublicHTTP',return_value=h),contextlib.redirect_stdout(output):
    self.assertEqual(main(['news-backfill','--root',tmp,'--state',str(st),'--network','--source-backfill-run','cli-news']),0)
   report=json.loads(output.getvalue());self.assertEqual(report['attemptedSources'],1);self.assertEqual(report['run']['new'],1);self.assertFalse(any('global.example' in u for u in calls));self.assertFalse((st/'public').exists());s=Store(st/'state.sqlite');self.assertIsNone(s.state('financial:'+c['companyId']));self.assertIsNone(s.state('sec:'+c['companyId']));self.assertEqual(len(s.state('newsSourceBackfill:cli-news:inventory')),1);s.close()
 def test_source_family_news_lane_preserves_accounting_and_pass_id_after_restore(self):
  import contextlib
  from types import SimpleNamespace
  from company_intelligence.source_backfill_runner import drive
  with tempfile.TemporaryDirectory() as tmp,contextlib.redirect_stdout(io.StringIO()):
   st=Path(tmp)/'state';Store(st/'state.sqlite').close();calls=[];reports=iter([{'requests':3,'attemptedSources':2,'stopReason':'BATCH_COMPLETED','httpStats':{'bytesDownloaded':42}}, {'requests':0,'attemptedSources':0,'stopReason':'NO_DUE_SOURCES'}])
   def execute(command,**kwargs):calls.append(command);return SimpleNamespace(returncode=0,stdout=json.dumps(next(reports)))
   drive(tmp,st,'owned-news',lane='news',batches=8,execute=execute);self.assertEqual(len(calls),2);self.assertEqual(calls[0][3],'news-backfill');self.assertEqual(calls[0][calls[0].index('--source-backfill-run')+1],'owned-news');self.assertNotIn('--force-sources',calls[0]);fresh=Path(tmp)/'restored';restore(st/'checkpoints/owned-news-news.tar.gz',fresh);s=Store(fresh/'state.sqlite');v=s.state('sourceBackfillRunner:owned-news:news');self.assertEqual((v['requests'],v['bytesDownloaded'],v['attemptedSources']),(3,42,2));self.assertEqual(v['stopReason'],'NO_DUE_SOURCES');s.close()
 def test_operator_pause_does_not_create_a_new_source_inventory(self):
  import contextlib
  from unittest.mock import patch
  from company_intelligence.cli import main
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);st=r/'.company-intelligence';st.mkdir();(st/'stop-source-backfill').touch();cfg=r/'company-intelligence/config';cfg.mkdir(parents=True);(cfg/'official-sites.json').write_text('{}');(cfg/'sources.json').write_text('[]');c=company();helper=NewsBackfillTests();h,calls=helper.http(st)
   with patch('company_intelligence.cli.load_universe',return_value={c['companyId']:c}),patch('company_intelligence.cli.PublicHTTP',return_value=h),contextlib.redirect_stdout(io.StringIO()):self.assertEqual(main(['news-backfill','--root',tmp,'--state',str(st),'--network']),0)
   self.assertEqual(calls,[]);s=Store(st/'state.sqlite');self.assertIsNone(s.state('newsSourceBackfill:unpolled-news:inventory'));s.close()
