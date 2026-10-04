import tempfile,unittest
from pathlib import Path
from company_intelligence.inventory_sweep import select,record,progress,failure_category,funnel
from company_intelligence.store import Store
from test_engine import company,NOW


class InventorySweepTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Store(Path(self.tmp.name)/'state.sqlite')
  self.a=company('One Corp','ONE','0000000001');self.b=company('Two Corp','TWO','0000000002')
  self.cs={c['companyId']:c for c in (self.a,self.b)}
  for c in self.cs.values():
   c['officialSites']=[];self.s.set_state('siteCandidates:'+c['companyId'],{'status':'CANDIDATE','candidates':[{'url':'https://shared.example/'}]})
 def tearDown(self):self.s.close();self.tmp.cleanup()
 def test_shared_host_deferral_is_not_silent_completion(self):
  chosen,_=select(self.cs,self.s,NOW,'first','domains')
  self.assertEqual(len(chosen),1);record({'companyId':chosen[0]['companyId'],'status':'REJECTED','reason':'OWNER_NOT_VALIDATED','requests':2},self.s,NOW,'first','domains')
  remaining,_=select(self.cs,self.s,NOW,'first','domains');self.assertEqual(len(remaining),1);self.assertNotEqual(remaining[0]['companyId'],chosen[0]['companyId'])
  self.assertEqual(progress(self.s,'first','domains')['pending'],1)
 def test_resume_and_new_pass_preserve_access_cooldown(self):
  self.s.set_state('officialSite:'+self.a['companyId'],{'status':'REJECTED','reason':'ROBOTS_DISALLOWED','retryAfter':'2026-12-01T00:00:00Z'})
  chosen,_=select(self.cs,self.s,NOW,'second','domains');self.assertEqual([c['companyId'] for c in chosen],[self.b['companyId']])
  record({'companyId':self.b['companyId'],'status':'VALIDATED','requests':2},self.s,NOW,'second','domains')
  self.assertEqual(select(self.cs,self.s,NOW,'second','domains')[0],[])
  self.assertEqual(progress(self.s,'second','domains')['statuses']['COOLDOWN'],1)
 def test_ambiguous_urls_never_become_authority_and_identity_must_be_in_pass(self):
  self.s.set_state('siteCandidates:'+self.a['companyId'],{'status':'AMBIGUOUS','candidates':[{'url':'https://one.example/'},{'url':'https://wrong.example/'}]})
  select(self.cs,self.s,NOW,'third','domains')
  self.assertEqual(progress(self.s,'third','domains')['statuses']['AMBIGUOUS'],1)
  with self.assertRaises(ValueError):record({'companyId':'wrong','status':'VALIDATED'},self.s,NOW,'third','domains')
 def test_ir_lane_requires_verified_domain_and_retains_pending_ir(self):
  self.a['officialSites']=['https://one.example/'];chosen,_=select(self.cs,self.s,NOW,'first','ir')
  self.assertEqual([c['companyId'] for c in chosen],[self.a['companyId']]);self.assertEqual(progress(self.s,'first','ir')['statuses']['NO_VERIFIED_DOMAIN'],1)
 def test_ir_pass_resumes_when_domain_is_verified_later(self):
  select(self.cs,self.s,NOW,'ongoing','ir')
  self.s.set_state('officialSite:'+self.b['companyId'],{'status':'VALIDATED','url':'https://two.example/'})
  chosen,_=select(self.cs,self.s,NOW,'ongoing','ir')
  self.assertEqual([c['companyId'] for c in chosen],[self.b['companyId']])
 def test_funnel_does_not_turn_missing_evidence_into_wrong_company(self):
  self.s.set_state('officialSite:'+self.a['companyId'],{'status':'REJECTED','reason':'OWNER_NOT_VALIDATED'})
  rows=[{'companyId':cid,'officialDomainCandidate':True,'officialDomainFound':False,'irPageFound':False,'anyNews':False,'eventSourceFound':False,'calls':False,'presentations':False,'anyCallContentReference':False} for cid in self.cs]
  result=funnel(self.s,{'companies':rows})
  self.assertEqual(result['classifications'],{'INSUFFICIENT_EVIDENCE':1,'NOT_CHECKED':1})
  self.assertEqual(result['candidateIssuers'],2)
 def test_verified_seed_does_not_report_historical_failure_as_current(self):
  self.s.set_state('officialSite:'+self.a['companyId'],{'status':'REJECTED','reason':'OWNER_NOT_VALIDATED'})
  row={'companyId':self.a['companyId'],'officialDomainCandidate':True,'officialDomainFound':True,'irPageFound':False,'anyNews':False,'eventSourceFound':False,'calls':False,'presentations':False,'anyCallContentReference':False}
  result=funnel(self.s,{'companies':[row]})
  self.assertEqual(result['classifications'],{'VERIFIED_OFFICIAL':1})
  self.assertEqual(result['failureReasons'],{})
 def test_unsafe_pass_and_limit_fail_before_any_state(self):
  for value in ('../main','wild%card','UPPER',''):
   with self.assertRaises(ValueError):select(self.cs,self.s,NOW,value,'domains')
  self.assertEqual(failure_category('DEFERRED','NETWORK_BUDGET_EXHAUSTED'),'DEFERRED_BUDGET')
  self.assertEqual(failure_category('DEFERRED','ROBOTS_UNAVAILABLE:HTTP_503'),'TEMPORARILY_UNAVAILABLE')
  self.assertEqual(failure_category('REJECTED','ROBOTS_DISALLOWED'),'BLOCKED')
 def test_cli_rejects_mixed_ingestion_before_state_creation(self):
  from company_intelligence.cli import main
  from contextlib import redirect_stderr
  import io
  for extra in (['--tickers','ROOT'],['--sec-fetch'],['--source-tickers','ROOT']):
   state=Path(self.tmp.name)/'new-state'
   with self.assertRaises(SystemExit),redirect_stderr(io.StringIO()):
    main(['sweep-inventory','--inventory-pass','cohort','--network','--state',str(state)]+extra)
   self.assertFalse(state.exists())

 def test_due_cooldown_and_transient_retry_resume_same_frozen_pass(self):
  cid=self.a['companyId']
  self.s.set_state('officialSite:'+cid,{'status':'DEFERRED','reason':'ROBOTS_UNAVAILABLE:HTTP_503','retryAfter':'2026-12-01T00:00:00Z'})
  chosen,_=select(self.cs,self.s,NOW,'recover','domains')
  self.assertNotIn(cid,[c['companyId'] for c in chosen])
  chosen,_=select(self.cs,self.s,'2026-12-02T00:00:00Z','recover','domains')
  self.assertEqual(chosen[0]['companyId'],cid)
  record({'companyId':cid,'status':'DEFERRED','reason':'SHARED_INFRASTRUCTURE_CIRCUIT_OPEN:SHARED_PROXY_FAILURE','requests':1},self.s,NOW,'recover','domains')
  self.assertEqual(progress(self.s,'recover','domains')['freshAttempts'],1)
  self.assertEqual(select(self.cs,self.s,NOW,'recover','domains')[0],[self.b])
  chosen,_=select(self.cs,self.s,'2026-12-02T00:00:00Z','recover','domains')
  self.assertEqual(chosen[0]['companyId'],cid)
  record({'companyId':cid,'status':'VALIDATED','requests':2},self.s,'2026-12-02T00:00:00Z','recover','domains')
  row=self.s.state('inventorySweep:recover:domains:'+cid)
  self.assertEqual(row['attempts'],2);self.assertEqual(row['networkRequests'],3)
  self.assertEqual(row['category'],'VERIFIED_OFFICIAL')
