import tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from company_intelligence.discovery_batch import run,persist
from company_intelligence.inventory_sweep import record,select
from company_intelligence.transport import PublicHTTP,BudgetExhausted
from company_intelligence.store import Store
from company_intelligence.checkpoint import pack,restore
from test_engine import company,NOW

class FailureEvidenceTests(unittest.TestCase):
 def evidence(self):
  return {'originalCandidateURL':'https://apple.com/','oversizedIRRecoveryVersion':'owned-ir-after-size-limit-1','alternateIRAttempts':[{'url':'https://investors.apple.com/','reason':'HTTP_503'}]}
 def test_deferred_route_evidence_survives_restore_and_cooldown_without_becoming_ownership(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp);st=base/'state';st.mkdir();s=Store(st/'state.sqlite');c=company();c['officialSites']=[];cid=c['companyId'];cs={cid:c};key='inventorySweep:proof-retry:domains:'
   s.set_state(key+'inventory',[cid]);s.set_state('siteCandidates:'+cid,{'status':'CANDIDATE','candidates':[{'url':'https://apple.com/','evidence':'candidate'}]})
   evidence=self.evidence();row={'companyId':cid,'domainOnly':True,'status':'DEFERRED','reason':'OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:HTTP_503','requests':3,'failureEvidence':evidence}
   persist([row],s,cs,NOW);record(row,s,NOW,'proof-retry','domains');site=s.state('officialSite:'+cid)
   self.assertEqual(site['status'],'DEFERRED');self.assertEqual(site['lastFailureEvidence'],evidence);self.assertNotIn('ownershipEvidence',site);self.assertEqual(c['officialSites'],[])
   s.close();meta=pack(st,base/'checkpoint.tar.gz');restore(base/'checkpoint.tar.gz',base/'fresh',meta['sha256']);s=Store(base/'fresh/state.sqlite')
   self.assertEqual(s.state('officialSite:'+cid)['lastFailureEvidence'],evidence);self.assertEqual(s.state(key+cid)['failureEvidence'],evidence)
   self.assertEqual(select(cs,s,NOW,'proof-retry','domains')[0],[]);self.assertEqual(s.state(key+cid)['failureEvidence'],evidence);s.close()
 def test_budget_result_keeps_collector_evidence_and_validated_owner_is_never_downgraded(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=company();c['officialSites']=[];cid=c['companyId'];e=BudgetExhausted('NETWORK_BUDGET_EXHAUSTED');e.ownershipEvidence=self.evidence();candidates={cid:{'status':'CANDIDATE','candidates':[{'url':'https://apple.com/','evidence':'candidate'}]}}
   with patch('company_intelligence.discovery_batch.validate_candidate',side_effect=e):rows=run([c],candidates,PublicHTTP(tmp),NOW,8,60,domain_only=True)
   self.assertEqual(rows[0]['status'],'DEFERRED');self.assertEqual(rows[0]['failureEvidence'],self.evidence())
   s=Store(Path(tmp)/'state.sqlite');verified={'status':'VALIDATED','url':'https://apple.com/','ownershipEvidence':{'method':'STRONG_PRIOR_PROOF'}};s.set_state('officialSite:'+cid,verified);persist(rows,s,{cid:c},NOW)
   self.assertEqual(s.state('officialSite:'+cid),verified);self.assertEqual(s.state('inventoryDiscovery:'+cid)['failureEvidence'],self.evidence());s.close()
