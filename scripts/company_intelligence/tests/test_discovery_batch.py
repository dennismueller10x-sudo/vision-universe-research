import sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.discovery_batch import run,persist
from company_intelligence.transport import PublicHTTP,SourceError,BudgetExhausted
from company_intelligence.store import Store
from test_engine import company,NOW
class BatchTests(unittest.TestCase):
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
 def test_one_unexpected_provider_error_does_not_kill_batch(self):
  with tempfile.TemporaryDirectory() as tmp:
   with patch('company_intelligence.discovery_batch.discover_ir',side_effect=RuntimeError('provider changed')):
    r=run([company()],{},PublicHTTP(tmp),NOW,12,60);self.assertEqual(r[0]['status'],'DEGRADED')
 def test_duplicate_hosts_and_invalid_workers_do_not_multiply_requests(self):
  with tempfile.TemporaryDirectory() as tmp:
   a=company();b=company('Other','OTHR','0000000002');h=PublicHTTP(tmp)
   with patch('company_intelligence.discovery_batch.discover_ir',return_value=([],[])):
    self.assertEqual(len(run([a,b],{},h,NOW,24,60)),1)
   with self.assertRaises(ValueError):run([],{},h,NOW,24,60,5)

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
