import sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.discovery_batch import run,persist
from company_intelligence.transport import PublicHTTP,SourceError,BudgetExhausted
from company_intelligence.store import Store
from test_engine import company,NOW
class BatchTests(unittest.TestCase):
 def budget_fixture(self,count):
  cs=[company(f'Issuer {i} Inc.',f'T{i}',str(i+1).zfill(10)) for i in range(count)]
  for c in cs:c['officialSites']=[]
  candidates={c['companyId']:{'status':'CANDIDATE','candidates':[{'url':f'https://issuer{i}.example/'}]} for i,c in enumerate(cs)}
  return cs,candidates

 @staticmethod
 def counted_admission(http,url):
  # Exercise the shared gate without real HTTP or transport pacing delays.
  if http.requests>=http.budget:raise BudgetExhausted('NETWORK_BUDGET_EXHAUSTED')
  http.requests+=1

 def test_domain_borrows_unused_allowance_for_bounded_ownership_routes(self):
  cs,candidates=self.budget_fixture(3)
  def validate(c,candidate,http,now):
   self.assertEqual(http.budget,8)
   for i in range(6 if c is cs[0] else 1):http._wait(f'https://route-{c["companyId"]}-{i}.example/')
   return {'status':'VALIDATED','url':candidate['url']}
  with tempfile.TemporaryDirectory() as tmp,patch('company_intelligence.transport.PublicHTTP._wait',self.counted_admission),patch('company_intelligence.discovery_batch.validate_candidate',validate):
   rows=run(cs,candidates,PublicHTTP(tmp),NOW,12,60,workers=1,domain_only=True,admission_interval=.5)
  self.assertEqual([r['status'] for r in rows],['VALIDATED']*3)
  self.assertEqual(sum(r['requests'] for r in rows),8)

 def test_concurrent_borrowing_cannot_exceed_total_request_allowance(self):
  cs,candidates=self.budget_fixture(3)
  def validate(c,candidate,http,now):
   for i in range(6):http._wait(f'https://route-{c["companyId"]}-{i}.example/')
   return {'status':'VALIDATED','url':candidate['url']}
  with tempfile.TemporaryDirectory() as tmp,patch('company_intelligence.transport.PublicHTTP._wait',self.counted_admission),patch('company_intelligence.discovery_batch.validate_candidate',validate):
   rows=run(cs,candidates,PublicHTTP(tmp),NOW,12,60,workers=3,domain_only=True,admission_interval=.5)
  self.assertEqual(sum(r['requests'] for r in rows),12)
  self.assertTrue(any(r['status']=='DEFERRED' and r['reason']=='NETWORK_BUDGET_EXHAUSTED' for r in rows))

 def test_exhausted_shared_allowance_leaves_unsent_candidates_pending(self):
  cs,candidates=self.budget_fixture(4);seen=[]
  def validate(c,candidate,http,now):
   seen.append(c['companyId'])
   for i in range(8):http._wait(f'https://route-{c["companyId"]}-{i}.example/')
   return {'status':'VALIDATED','url':candidate['url']}
  with tempfile.TemporaryDirectory() as tmp,patch('company_intelligence.transport.PublicHTTP._wait',self.counted_admission),patch('company_intelligence.discovery_batch.validate_candidate',validate):
   rows=run(cs,candidates,PublicHTTP(tmp),NOW,16,60,workers=1,domain_only=True,admission_interval=.5)
  self.assertEqual(seen,[c['companyId'] for c in cs[:2]])
  self.assertEqual(len(rows),2);self.assertEqual(sum(r['requests'] for r in rows),16)
  self.assertTrue(all(r['status']=='VALIDATED' for r in rows))

 def test_transport_duplicate_route_reaches_owner_verifier_without_silent_skip(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=company();c['officialSites']=[];cid=c['companyId']
   candidates={cid:{'status':'CANDIDATE','candidates':[{'url':'http://apple.com/','evidence':'LOGO'},{'url':'https://apple.com/','evidence':'PUBLISHER'}]}}
   seen=[]
   def verify(owner,candidate,http,now):
    seen.append(candidate['url']);raise SourceError('OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED')
   with patch('company_intelligence.discovery_batch.validate_candidate',side_effect=verify):
    result=run([c],candidates,PublicHTTP(tmp),NOW,8,60,domain_only=True,on_result=lambda r:seen.append(r['status']))
   self.assertEqual(seen,['https://apple.com/','REJECTED']);self.assertEqual(len(result),1)
   self.assertNotIn('site',result[0]);self.assertEqual(len(candidates[cid]['candidates']),2)
 def test_host_cooldown_does_not_block_an_independent_host(self):
  import threading
  ready=threading.Event();order=[]
  a=company('One Inc.','ONE','0000000001');b=company('Two Inc.','TWO','0000000002')
  for c in (a,b):c['officialSites']=[]
  candidates={c['companyId']:{'status':'CANDIDATE','candidates':[{'url':'https://'+c['listings'][0]['symbol'].lower()+'.example/'}]} for c in (a,b)}
  def validate(c,candidate,http,now):
   if c is a:
    http._wait(candidate['url']);ready.set();http._wait(candidate['url']);order.append('same-host-again')
   else:
    self.assertTrue(ready.wait(5));http._wait(candidate['url']);order.append('other-host')
   return {'status':'VALIDATED','url':candidate['url']}
  with tempfile.TemporaryDirectory() as tmp,patch('company_intelligence.discovery_batch.validate_candidate',validate):
   rs=run([a,b],candidates,PublicHTTP(tmp),NOW,8,30,2,domain_only=True,admission_interval=.5)
  self.assertEqual(order,['other-host','same-host-again']);self.assertEqual(sum(r['requests'] for r in rs),3)
 def test_budget_partitioned_and_sqlite_persistence_serial_rejection_isolated(self):
  with tempfile.TemporaryDirectory() as tmp:
   c1=company('One Inc.','ONE','0000000001');c2=company('Two Inc.','TWO','0000000002');c1['officialSites']=[];c2['officialSites']=[]
   candidates={c['companyId']:{'status':'CANDIDATE','candidates':[{'url':'https://'+c['listings'][0]['symbol'].lower()+'.example/'}]} for c in [c1,c2]};h=PublicHTTP(Path(tmp)/'http',budget=24)
   def validate(c,candidate,http,now):
    self.assertEqual(http.budget,12);http.requests+=1
    if c is c2:raise SourceError('WRONG_ISSUER')
    return {'status':'VALIDATED','url':candidate['url']}
   with patch('company_intelligence.discovery_batch.validate_candidate',validate),patch('company_intelligence.discovery_batch.discover_ir',return_value=([],[])):
    rs=run([c1,c2],candidates,h,NOW,24,60,2)
   self.assertEqual([r['status'] for r in rs],['VALIDATED','REJECTED']);self.assertEqual(sum(r['requests'] for r in rs),2)
   s=Store(Path(tmp)/'s.sqlite');persist(rs,s,{c['companyId']:c for c in [c1,c2]},NOW);self.assertEqual(s.state('officialSite:'+c1['companyId'])['status'],'VALIDATED');self.assertEqual(s.state('officialSite:'+c2['companyId'])['status'],'REJECTED')
 def test_budget_deferral_preserves_verified_site_and_next_run_resumes_ir(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=company();c['officialSites']=[];cand={c['companyId']:{'status':'CANDIDATE','candidates':[{'url':'https://apple.com'}]}};h=PublicHTTP(Path(tmp)/'http')
   with patch('company_intelligence.discovery_batch.validate_candidate',return_value={'status':'VALIDATED','url':'https://apple.com/'}),patch('company_intelligence.discovery_batch.discover_ir',side_effect=BudgetExhausted('BUDGET')):
    rs=run([c],cand,h,NOW,12,60)
   s=Store(Path(tmp)/'s.sqlite');persist(rs,s,{c['companyId']:c},NOW);self.assertEqual(rs[0]['status'],'DEFERRED');self.assertEqual(c['officialSites'],['https://apple.com/'])
   with patch('company_intelligence.discovery_batch.validate_candidate',side_effect=AssertionError('REVALIDATED')),patch('company_intelligence.discovery_batch.discover_ir',return_value=([],[])):
    self.assertEqual(run([c],cand,h,NOW,12,60)[0]['status'],'VALIDATED')
 def test_completed_page_evidence_survives_later_budget_exhaustion(self):
  from company_intelligence.feeds import discover_ir
  c=company();c['officialSites']=['https://apple.com/']
  class HTTP:
   def get(self,url,**kwargs):
    if url!='https://apple.com/':raise BudgetExhausted('NETWORK_BUDGET_EXHAUSTED')
    return {'body':b'<title>Apple Inc.</title><a href="/investors">Investors</a>','finalUrl':url}
  with self.assertRaises(BudgetExhausted) as caught:discover_ir(c,c['officialSites'][0],HTTP(),NOW)
  self.assertEqual(len(caught.exception.discoveryConfigurations),1)
  with tempfile.TemporaryDirectory() as tmp:
   s=Store(Path(tmp)/'s.sqlite')
   s.set_state('ir:'+c['companyId'],{'configurations':[{'irHomepage':'https://apple.com/','documents':[{'url':'https://apple.com/prior.pdf','type':'PRESENTATION'}]}]})
   with patch('company_intelligence.discovery_batch.discover_ir',side_effect=caught.exception):
    rows=run([c],{},PublicHTTP(tmp),NOW,12,60)
   persist(rows,s,{c['companyId']:c},NOW);ir=s.state('ir:'+c['companyId'])
   self.assertTrue(ir['partialDiscovery']);self.assertNotIn('lastSuccess',ir)
   self.assertEqual(ir['configurations'][0]['documents'][0]['url'],'https://apple.com/prior.pdf')
   s.close()
 def test_ir_capacity_retry_does_not_change_source_or_transport_backoff(self):
  from company_intelligence.pipeline import advance
  with tempfile.TemporaryDirectory() as tmp:
   c=company();s=Store(Path(tmp)/'state.sqlite');cid=c['companyId']
   source={'sourceId':'already-polled','companyId':cid,'type':'RSS','url':'https://apple.com/rss','active':True,'nextCheck':advance(NOW,48),'failureCount':3}
   s.source(source)
   prior={'lastSuccess':NOW,'configurations':[{'irHomepage':'https://apple.com/investors','documents':[{'url':'https://apple.com/deck.pdf','type':'PRESENTATION'}]}]}
   for status,reason,hours in [('DEFERRED','NETWORK_BUDGET_EXHAUSTED',1),('DEFERRED','NETWORK_TIME_BUDGET_EXHAUSTED',1),('DEFERRED','DISCOVERY_DEADLINE',1),('DEGRADED','HTTP_503',24),('DEFERRED','DNS_UNAVAILABLE',24),('DEFERRED','SHARED_INFRASTRUCTURE_CIRCUIT_OPEN:SHARED_PROXY_FAILURE',.25)]:
    s.set_state('ir:'+cid,prior)
    persist([{'companyId':cid,'status':status,'reason':reason,'requests':0,'stats':{}}],s,{cid:c},NOW)
    ir=s.state('ir:'+cid)
    self.assertEqual(ir['retryAfter'],advance(NOW,hours),(status,reason))
    self.assertEqual(ir['lastSuccess'],NOW);self.assertEqual(ir['configurations'],prior['configurations'])
    retained=s.sources()[0]
    self.assertEqual(retained['nextCheck'],source['nextCheck']);self.assertEqual(retained['failureCount'],3)
   s.close()

 def test_domain_auth_denial_uses_slow_retry_without_rejecting_identity(self):
  from company_intelligence.pipeline import advance
  with tempfile.TemporaryDirectory() as tmp:
   c=company();s=Store(Path(tmp)/'state.sqlite')
   persist([{'companyId':c['companyId'],'domainOnly':True,'status':'DEFERRED','reason':'ROBOTS_UNAVAILABLE:HTTP_401','requests':1,'stats':{}}],s,{c['companyId']:c},NOW)
   state=s.state('officialSite:'+c['companyId'])
   self.assertEqual(state['status'],'DEFERRED');self.assertEqual(state['retryAfter'],advance(NOW,168));s.close()

 def test_serial_callback_persists_before_batch_return(self):
  import threading
  with tempfile.TemporaryDirectory() as tmp:
   root=threading.get_ident();seen=[]
   with patch('company_intelligence.discovery_batch.discover_ir',return_value=([],[])):
    result=run([company()],{},PublicHTTP(tmp),NOW,12,60,on_result=lambda r:seen.append((r['companyId'],threading.get_ident())))
   self.assertEqual(seen,[(result[0]['companyId'],root)])
 def test_one_unexpected_provider_error_does_not_kill_batch(self):
  with tempfile.TemporaryDirectory() as tmp:
   with patch('company_intelligence.discovery_batch.discover_ir',side_effect=RuntimeError('provider changed')):
    r=run([company()],{},PublicHTTP(tmp),NOW,12,60);self.assertEqual(r[0]['status'],'DEGRADED')
 def test_duplicate_hosts_and_invalid_workers_do_not_multiply_requests(self):
  with tempfile.TemporaryDirectory() as tmp:
   a=company();b=company('Other','OTHR','0000000002');h=PublicHTTP(tmp)
   with patch('company_intelligence.discovery_batch.discover_ir',return_value=([],[])):
    self.assertEqual(len(run([a,b],{},h,NOW,24,60)),1)
   with self.assertRaises(ValueError):run([],{},h,NOW,24,60,9)

 def test_feed_failure_cannot_revoke_an_existing_validated_domain(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=company();s=Store(Path(tmp)/'s.sqlite');s.set_state('officialSite:'+c['companyId'],{'status':'VALIDATED','url':'https://apple.com/'})
   with patch('company_intelligence.discovery_batch.discover_ir',side_effect=SourceError('HTTP_503')):
    rs=run([c],{},PublicHTTP(Path(tmp)/'http'),NOW,12,60)
   self.assertEqual(rs[0]['status'],'DEGRADED');persist(rs,s,{c['companyId']:c},NOW)
   self.assertEqual(s.state('officialSite:'+c['companyId'])['status'],'VALIDATED');s.close()

 def test_discovery_source_poll_excludes_global_sources_without_changing_regular_poll(self):
  from company_intelligence.pipeline import Pipeline
  with tempfile.TemporaryDirectory() as tmp:
   c=company();s=Store(Path(tmp)/'s.sqlite')
   for sid,cid in [('global',None),('owned',c['companyId'])]:
    s.source({'sourceId':sid,'companyId':cid,'type':'RSS','url':'https://apple.com/'+sid,'active':True,'intervalHours':4})
   p=Pipeline(Path(tmp),{c['companyId']:c},s,PublicHTTP(Path(tmp)/'http'),NOW)
   with patch.object(p,'ingest_source') as ingest:
    p.ingest_due_sources({c['companyId']},include_global=False)
    self.assertEqual([x.args[0]['sourceId'] for x in ingest.call_args_list],['owned'])
    ingest.reset_mock();p.ingest_due_sources({c['companyId']})
    self.assertEqual({x.args[0]['sourceId'] for x in ingest.call_args_list},{'owned','global'})
   s.close()

 def test_shared_failure_stops_submission_and_keeps_unattempted_candidates_pending(self):
  from company_intelligence.discovery_circuit import DiscoveryCircuit
  circuit=DiscoveryCircuit(threshold=3)
  cs=[company(f'Company {i} Inc.',f'T{i}',str(i+1).zfill(10)) for i in range(8)]
  for c in cs:c['officialSites']=[]
  candidates={c['companyId']:{'status':'CANDIDATE','candidates':[{'url':f'https://issuer{i}.example/'}]} for i,c in enumerate(cs)}
  def unavailable(c,candidate,http,now):
   http.requests+=1
   raise SourceError('ROBOTS_UNAVAILABLE:HTTP_503')
  with tempfile.TemporaryDirectory() as tmp,patch('company_intelligence.discovery_batch.validate_candidate',unavailable):
   rows=run(cs,candidates,PublicHTTP(tmp),NOW,32,60,workers=1,domain_only=True,circuit=circuit)
  self.assertEqual(len(rows),3)
  self.assertTrue(circuit.snapshot()['open'])
  self.assertEqual(len(circuit.snapshot()['affectedHosts']),3)
  self.assertTrue(all(r['status']=='DEFERRED' for r in rows))

 def test_proxy_cause_opens_guard_before_transport_exhausts_all_retries(self):
  import urllib.error
  from company_intelligence.discovery_circuit import DiscoveryCircuit
  circuit=DiscoveryCircuit(threshold=1)
  c=company();c['officialSites']=[]
  candidates={c['companyId']:{'status':'CANDIDATE','candidates':[{'url':'https://apple.com/','evidence':'candidate'}]}}
  calls=[]
  def opener(request,**kwargs):
   calls.append(request.full_url)
   raise urllib.error.URLError('Tunnel connection failed: 503 Service Unavailable')
  with tempfile.TemporaryDirectory() as tmp:
   http=PublicHTTP(tmp,opener=opener,validator=lambda url:url)
   rows=run([c],candidates,http,NOW,8,60,workers=1,domain_only=True,circuit=circuit)
  self.assertEqual(len(calls),1)
  self.assertIn('CIRCUIT_OPEN',rows[0]['reason'])
  self.assertEqual(circuit.snapshot()['signature'],'SHARED_PROXY_FAILURE')

 def test_repeated_single_host_failure_and_denial_do_not_open_shared_guard(self):
  from company_intelligence.discovery_circuit import DiscoveryCircuit
  circuit=DiscoveryCircuit(threshold=3)
  for _ in range(10):circuit.failure('https://one.example/path',SourceError('HTTP_503'))
  for i in range(10):circuit.failure(f'https://blocked{i}.example/',SourceError('HTTP_403'))
  self.assertFalse(circuit.snapshot()['open'])
  circuit.success()
  circuit.failure('https://two.example/',SourceError('HTTP_503'))
  self.assertFalse(circuit.snapshot()['open'])

 def test_current_ir_documents_survive_an_unavailable_optional_newsroom(self):
  from company_intelligence.feeds import discover_ir
  c=company();c['officialSites']=['https://apple.com/investors']
  class HTTP:
   def get(self,url,**kwargs):
    if url!=c['officialSites'][0]:raise BudgetExhausted('NETWORK_TIME_BUDGET_EXHAUSTED')
    return {'body':b'<title>Apple Inc. Investors</title><a href="/deck.pdf">Q2 2026 Investor Presentation</a><a href="/news">Press Releases</a>','finalUrl':url}
  with self.assertRaises(BudgetExhausted) as caught:discover_ir(c,c['officialSites'][0],HTTP(),NOW)
  config=caught.exception.discoveryConfigurations[0]
  self.assertEqual(config['pageRole'],'IR')
  self.assertEqual(config['documents'][0]['type'],'PRESENTATION')
  self.assertEqual(config['documents'][0]['url'],'https://apple.com/deck.pdf')
  self.assertEqual(caught.exception.discoverySources,[])

 def test_http_envoy_failure_has_explicit_proxy_signature(self):
  import urllib.error,io
  from company_intelligence.discovery_circuit import DiscoveryCircuit
  circuit=DiscoveryCircuit(threshold=1);c=company();c['officialSites']=[]
  candidates={c['companyId']:{'status':'CANDIDATE','candidates':[{'url':'https://apple.com/','evidence':'candidate'}]}}
  def opener(request,**kwargs):raise urllib.error.HTTPError(request.full_url,503,'Unavailable',{'server':'envoy'},io.BytesIO(b'upstream connect error or disconnect/reset before headers. immediate connect error'))
  with tempfile.TemporaryDirectory() as tmp:
   rows=run([c],candidates,PublicHTTP(tmp,opener=opener,validator=lambda u:u),NOW,8,60,workers=1,domain_only=True,circuit=circuit)
  self.assertEqual(circuit.snapshot()['signature'],'SHARED_PROXY_FAILURE')
  self.assertIn('CIRCUIT_OPEN',rows[0]['reason'])
