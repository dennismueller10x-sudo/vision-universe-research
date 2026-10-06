import tempfile,unittest
from pathlib import Path
from company_intelligence.inventory_sweep import select,record,progress,failure_category,funnel
from company_intelligence.store import Store
from test_engine import company,NOW


class InventorySweepTests(unittest.TestCase):
 def test_local_verified_and_discovered_outcomes_preserve_prior_attempt_accounting(self):
  cid=self.a['companyId']
  for lane in ('domains','ir'):
   key='inventorySweep:accounting:'+lane+':'
   self.s.set_state(key+'inventory',[cid])
   self.s.set_state(key+cid,{'status':'DEFERRED','category':'TEMPORARILY_UNAVAILABLE','retryAfter':NOW,
                           'networkRequests':7,'attempts':2,'stats':{'bytesDownloaded':123},'firstCheckedAt':'2026-01-01T00:00:00Z'})
   self.s.set_state('officialSite:'+cid,{'status':'VALIDATED','url':'https://one.example/'})
   if lane=='ir':self.s.set_state('ir:'+cid,{'lastSuccess':NOW})
   self.assertEqual(select(self.cs,self.s,NOW,'accounting',lane)[0],[])
   row=self.s.state(key+cid)
   self.assertEqual((row['networkRequests'],row['attempts'],row['stats']['bytesDownloaded'],row['firstCheckedAt']),
                    (7,2,123,'2026-01-01T00:00:00Z'))
   self.assertEqual(progress(self.s,'accounting',lane)['retryPending'],0)
   self.assertEqual(progress(self.s,'accounting',lane)['freshAttempts'],2)

 def test_local_cooldown_retains_cost_and_new_ambiguity_cannot_keep_stale_retry_category(self):
  cid=self.a['companyId'];key='inventorySweep:accounting:domains:'
  self.s.set_state(key+'inventory',[cid]);prior={'status':'DEFERRED','category':'DEFERRED_BUDGET',
              'retryAfter':NOW,'networkRequests':9,'attempts':1,'stats':{'bytesDownloaded':456}}
  self.s.set_state(key+cid,prior)
  self.s.set_state('officialSite:'+cid,{'status':'DEFERRED','reason':'DNS_UNAVAILABLE','retryAfter':'2026-12-01T00:00:00Z'})
  self.assertEqual(select(self.cs,self.s,NOW,'accounting','domains')[0],[])
  row=self.s.state(key+cid);self.assertEqual(row['status'],'COOLDOWN');self.assertEqual(row['networkRequests'],9)
  self.assertEqual(row['stats'],prior['stats']);self.assertEqual(progress(self.s,'accounting','domains')['retryPending'],1)
  self.s.set_state(key+cid,prior)
  self.s.set_state('officialSite:'+cid,{'status':'REJECTED','reason':'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED','ownershipVerifierVersion':'corporate-ownership-1'})
  self.s.set_state('siteCandidates:'+cid,{'status':'CANDIDATE','candidates':[{'url':'https://one.example/'},{'url':'https://wrong.example/'}]})
  self.assertEqual(select(self.cs,self.s,NOW,'accounting','domains')[0],[])
  row=self.s.state(key+cid);self.assertEqual(row['status'],'AMBIGUOUS');self.assertEqual(row['networkRequests'],9)
  self.assertEqual(progress(self.s,'accounting','domains')['retryPending'],0)

 def test_transport_equivalent_candidates_resume_same_frozen_pending_identity(self):
  cid=self.a['companyId'];original={'status':'CANDIDATE','candidates':[{'url':'http://one.example/','evidence':'PUBLISHER_AUTHOR'},{'url':'https://one.example/','evidence':'LOGO'}]}
  self.s.set_state('siteCandidates:'+cid,original)
  self.s.set_state('inventorySweep:duplicates:domains:inventory',[cid])
  chosen,candidates=select(self.cs,self.s,NOW,'duplicates','domains')
  self.assertEqual([c['companyId'] for c in chosen],[cid]);self.assertEqual(len(candidates[cid]['candidates']),1)
  self.assertEqual(self.s.state('siteCandidates:'+cid),original)
  self.assertEqual(progress(self.s,'duplicates','domains')['pending'],1)
  record({'companyId':cid,'status':'VALIDATED','requests':2},self.s,NOW,'duplicates','domains')
  self.assertEqual(progress(self.s,'duplicates','domains')['pending'],0)
 def test_inconsistent_same_host_routes_receive_durable_ambiguity_without_network(self):
  cid=self.a['companyId'];self.s.set_state('siteCandidates:'+cid,{'status':'CANDIDATE','candidates':[{'url':'https://one.example/company-a'},{'url':'https://one.example/company-b'}]})
  self.s.set_state('inventorySweep:routes:domains:inventory',[cid])
  self.assertEqual(select(self.cs,self.s,NOW,'routes','domains')[0],[])
  row=self.s.state('inventorySweep:routes:domains:'+cid);self.assertEqual(row['status'],'AMBIGUOUS');self.assertEqual(row['networkRequests'],0)
  value=self.s.state('siteCandidates:'+cid);self.assertEqual(value['status'],'AMBIGUOUS');self.assertEqual(len(value['candidates']),2)
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
 def test_offline_classification_reuses_proof_but_never_completes_unsent_network_work(self):
  self.s.set_state('officialSite:'+self.b['companyId'],{'status':'VALIDATED','url':'https://two.example/'})
  chosen,_=select(self.cs,self.s,NOW,'outage','domains',limit=1,allow_network=False)
  self.assertEqual(chosen,[])
  self.assertIsNone(self.s.state('inventorySweep:outage:domains:'+self.a['companyId']))
  self.assertEqual(progress(self.s,'outage','domains')['statuses'],{'ALREADY_VERIFIED':1})
  chosen,_=select(self.cs,self.s,NOW,'outage','domains',limit=1)
  self.assertEqual([c['companyId'] for c in chosen],[self.a['companyId']])
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
  # A never-attempted issuer on the same host precedes this due retry.
  self.assertEqual(chosen[0]['companyId'],self.b['companyId'])
  record({'companyId':self.b['companyId'],'status':'REJECTED','reason':'OWNER_NOT_VALIDATED','requests':0},self.s,NOW,'recover','domains')
  chosen,_=select(self.cs,self.s,'2026-12-02T00:00:00Z','recover','domains')
  self.assertEqual(chosen[0]['companyId'],cid)
  record({'companyId':cid,'status':'DEFERRED','reason':'SHARED_INFRASTRUCTURE_CIRCUIT_OPEN:SHARED_PROXY_FAILURE','requests':1},self.s,NOW,'recover','domains')
  self.assertEqual(progress(self.s,'recover','domains')['freshAttempts'],1)
  self.assertEqual(select(self.cs,self.s,NOW,'recover','domains')[0],[])
  chosen,_=select(self.cs,self.s,'2026-12-02T00:00:00Z','recover','domains')
  self.assertEqual(chosen[0]['companyId'],cid)
  record({'companyId':cid,'status':'VALIDATED','requests':2},self.s,'2026-12-02T00:00:00Z','recover','domains')
  row=self.s.state('inventorySweep:recover:domains:'+cid)
  self.assertEqual(row['attempts'],2);self.assertEqual(row['networkRequests'],3)
  self.assertEqual(row['category'],'VERIFIED_OFFICIAL')

 def test_cli_passes_only_exact_cik_sec_legal_aliases_to_domain_verifier(self):
  import contextlib,io,json
  from unittest.mock import patch
  from company_intelligence.cli import main
  root=Path(self.tmp.name)/'root';config=root/'company-intelligence/config';config.mkdir(parents=True)
  (config/'official-sites.json').write_text('{}')
  consumer=root/'quant/data/sec/consumer';consumer.mkdir(parents=True)
  (consumer/(self.a['cik']+'.json')).write_text('{}')
  (consumer/('CIK'+self.a['cik']+'.json')).write_text(json.dumps({'cik':self.a['cik'],'name':'One Legal Holdings Corporation','dataSource':{'provider':'sec_edgar','isMock':False}}))
  (consumer/('CIK'+self.b['cik']+'.json')).write_text(json.dumps({'cik':self.a['cik'],'name':'Wrong Owner Corporation','dataSource':{'provider':'sec_edgar','isMock':False}}))
  def import_candidates(root,companies,store,now):
   for c in companies.values():store.set_state('siteCandidates:'+c['companyId'],{'status':'CANDIDATE','candidates':[{'url':'https://'+c['listings'][0]['symbol'].lower()+'.example/'}]})
  def batch(selected,*args,**kwargs):
   self.assertIn('One Legal Holdings Corporation',selected[0]['names'])
   self.assertNotIn('Wrong Owner Corporation',selected[1]['names'])
   self.assertEqual(self.a['names'],['One Corp'])
   return []
  with patch('company_intelligence.cli.load_universe',return_value=self.cs),patch('company_intelligence.site_inventory.import_inventory',side_effect=import_candidates),patch('company_intelligence.discovery_batch.run',side_effect=batch),contextlib.redirect_stdout(io.StringIO()):
   self.assertEqual(main(['sweep-inventory','--root',str(root),'--state',str(root/'.company-intelligence'),'--network','--inventory-pass','aliases']),0)

 def test_changed_ownership_evidence_rechecks_old_rejection_once_in_same_frozen_pass(self):
  from company_intelligence.discovery_batch import persist
  from company_intelligence.discovery import OWNERSHIP_VERSION
  cid=self.a['companyId'];key='inventorySweep:upgrade:domains:'
  self.s.set_state(key+'inventory',[cid])
  self.s.set_state(key+cid,{'status':'COOLDOWN','retryAfter':'2099-01-01T00:00:00Z'})
  self.s.set_state('officialSite:'+cid,{'status':'REJECTED','reason':'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED','ownershipVerifierVersion':'corporate-ownership-8','retryAfter':'2099-01-01T00:00:00Z'})
  chosen,_=select(self.cs,self.s,NOW,'upgrade','domains');self.assertEqual([c['companyId'] for c in chosen],[cid])
  result={'companyId':cid,'status':'REJECTED','reason':'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED','requests':2}
  persist([result],self.s,self.cs,NOW);record(result,self.s,NOW,'upgrade','domains')
  self.assertEqual(self.s.state('officialSite:'+cid)['ownershipVerifierVersion'],OWNERSHIP_VERSION)
  self.assertEqual(select(self.cs,self.s,NOW,'upgrade','domains')[0],[])
  self.assertEqual(progress(self.s,'upgrade','domains')['freshAttempts'],1)

 def test_evidence_upgrade_keeps_current_unknown_transport_blocked_and_conflict_cooldowns(self):
  from company_intelligence.discovery import OWNERSHIP_VERSION
  cid=self.a['companyId'];future='2099-01-01T00:00:00Z'
  cases=[('REJECTED','OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED',OWNERSHIP_VERSION),('REJECTED','OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED',None),('REJECTED','OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED','corporate-ownership-'+str(int(OWNERSHIP_VERSION.rsplit('-',1)[1])+1)),('REJECTED','OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED','unknown'),('DEFERRED','ROBOTS_UNAVAILABLE:HTTP_503','corporate-ownership-8'),('DEFERRED','ROBOTS_DISALLOWED','corporate-ownership-8'),('REJECTED','OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER','corporate-ownership-8')]
  for i,(status,reason,version) in enumerate(cases):
   pid='protected'+str(i);key='inventorySweep:'+pid+':domains:';self.s.set_state(key+'inventory',[cid]);site={'status':status,'reason':reason,'retryAfter':future,'ownershipVerifierVersion':version};self.s.set_state('officialSite:'+cid,site)
   self.assertEqual(select(self.cs,self.s,NOW,pid,'domains')[0],[])
   self.assertEqual(self.s.state('officialSite:'+cid),site)
   self.assertEqual(self.s.state(key+cid)['retryAfter'],future)

 def test_size_recovery_upgrade_is_scoped_once_and_keeps_access_cooldowns(self):
  from company_intelligence.discovery_batch import persist
  from company_intelligence.discovery import OVERSIZED_IR_RECOVERY_VERSION
  cid=self.a['companyId'];future='2099-01-01T00:00:00Z'
  key='inventorySweep:size-upgrade:domains:'
  self.s.set_state(key+'inventory',[cid])
  self.s.set_state(key+cid,{'status':'COOLDOWN','retryAfter':future})
  self.s.set_state('officialSite:'+cid,{'status':'REJECTED','reason':'SOURCE_TOO_LARGE','retryAfter':future})
  self.assertEqual([c['companyId'] for c in select(self.cs,self.s,NOW,'size-upgrade','domains')[0]],[cid])
  row={'companyId':cid,'status':'REJECTED','reason':'SOURCE_TOO_LARGE','requests':4}
  persist([row],self.s,self.cs,NOW);record(row,self.s,NOW,'size-upgrade','domains')
  self.assertEqual(self.s.state('officialSite:'+cid)['oversizedIRRecoveryVersion'],OVERSIZED_IR_RECOVERY_VERSION)
  self.assertEqual(select(self.cs,self.s,NOW,'size-upgrade','domains')[0],[])
  for reason in ('ROBOTS_UNAVAILABLE:SOURCE_TOO_LARGE','HTTP_403','OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER'):
   self.s.set_state('officialSite:'+cid,{'status':'REJECTED','reason':reason,'retryAfter':future})
   self.assertEqual(select(self.cs,self.s,NOW,'size-upgrade','domains')[0],[])

 def test_header_collector_upgrade_rechecks_exact_footer_failure_once(self):
  from company_intelligence.discovery import OWNERSHIP_VERSION,CORPORATE_HEADER_EVIDENCE_VERSION
  from company_intelligence.discovery_batch import persist
  cid=self.a['companyId'];pid='header-upgrade';key='inventorySweep:'+pid+':domains:';future='2099-01-01T00:00:00Z';gaps={'footerOwnerMatched':True,'shortBrand':False}
  self.s.set_state(key+'inventory',[cid]);self.s.set_state(key+cid,{'status':'COOLDOWN','retryAfter':future,'networkRequests':7,'attempts':2})
  self.s.set_state('officialSite:'+cid,{'status':'REJECTED','reason':'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED','ownershipVerifierVersion':OWNERSHIP_VERSION,'ownershipEvidence':gaps,'retryAfter':future})
  self.assertEqual([v['companyId'] for v in select(self.cs,self.s,NOW,pid,'domains')[0]],[cid])
  result={'companyId':cid,'status':'REJECTED','reason':'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED','failureEvidence':gaps,'requests':2};persist([result],self.s,self.cs,NOW);record(result,self.s,NOW,pid,'domains')
  self.assertEqual(self.s.state('officialSite:'+cid)['corporateHeaderEvidenceVersion'],CORPORATE_HEADER_EVIDENCE_VERSION)
  self.assertEqual(select(self.cs,self.s,NOW,pid,'domains')[0],[])
  self.assertEqual(self.s.state(key+cid)['attempts'],3)
  self.assertEqual(self.s.state(key+cid)['networkRequests'],9)

 def test_header_collector_upgrade_cannot_override_access_conflicts_or_future_versions(self):
  from company_intelligence.discovery import OWNERSHIP_VERSION
  cid=self.a['companyId'];future='2099-01-01T00:00:00Z'
  cases=[('REJECTED','OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER',OWNERSHIP_VERSION,True,None),('DEFERRED','ROBOTS_UNAVAILABLE:HTTP_503',OWNERSHIP_VERSION,True,None),('REJECTED','ROBOTS_DISALLOWED',OWNERSHIP_VERSION,True,None),('REJECTED','OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED','corporate-ownership-999',True,None),('REJECTED','OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED',OWNERSHIP_VERSION,False,None),('REJECTED','OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED',OWNERSHIP_VERSION,True,'corporate-header-999')]
  for i,(status,reason,version,footer,header_version) in enumerate(cases):
   with self.subTest(reason=reason,version=version,header_version=header_version):
    pid='header-protected'+str(i);site={'status':status,'reason':reason,'ownershipVerifierVersion':version,'ownershipEvidence':{'footerOwnerMatched':footer,'shortBrand':False},'corporateHeaderEvidenceVersion':header_version,'retryAfter':future};self.s.set_state('inventorySweep:'+pid+':domains:inventory',[cid]);self.s.set_state('officialSite:'+cid,site)
    self.assertEqual(select(self.cs,self.s,NOW,pid,'domains')[0],[]);self.assertEqual(self.s.state('officialSite:'+cid),site)
