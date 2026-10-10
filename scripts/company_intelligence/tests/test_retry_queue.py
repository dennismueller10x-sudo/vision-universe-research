import tempfile,unittest
from pathlib import Path
from company_intelligence.store import Store
from company_intelligence.inventory_sweep import select,record,prefix
from company_intelligence.checkpoint import pack,restore
from test_engine import company,NOW

class RetryQueueFairnessTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.s=Store(self.root/'live/state.sqlite')
  self.a=company('One Corp','ONE','0000000001');self.b=company('Two Corp','TWO','0000000002');self.c=company('Three Corp','THREE','0000000003');self.cs={c['companyId']:c for c in (self.a,self.b,self.c)}
  self.key=prefix('fair-retry','domains');self.s.set_state(self.key+'inventory',sorted(self.cs))
  for c in self.cs.values():
   c['officialSites']=[];self.s.set_state('siteCandidates:'+c['companyId'],{'status':'CANDIDATE','candidates':[{'url':'https://'+c['listings'][0]['symbol'].lower()+'.example/'}]})
 def tearDown(self):self.s.close();self.tmp.cleanup()
 def due(self,c,stamp):
  self.s.set_state(self.key+c['companyId'],{'status':'DEFERRED','category':'TEMPORARILY_UNAVAILABLE','retryAfter':NOW,'checkedAt':stamp,'lastAttemptAt':stamp,'attempts':2,'networkRequests':7})
 def chosen(self,store=None):return [c['companyId'] for c in select(self.cs,store or self.s,NOW,'fair-retry','domains',limit=1)[0]]
 def test_pending_precedes_due_and_repeated_proxy_failure_rotates_after_restore(self):
  self.due(self.a,'2026-01-02T00:00:00Z');self.due(self.b,'2026-01-01T00:00:00Z')
  self.assertEqual(self.chosen(),[self.c['companyId']])
  record({'companyId':self.c['companyId'],'status':'VALIDATED','requests':1},self.s,NOW,'fair-retry','domains')
  self.assertEqual(self.chosen(),[self.b['companyId']])
  record({'companyId':self.b['companyId'],'status':'DEFERRED','reason':'HTTP_503','requests':1},self.s,NOW,'fair-retry','domains')
  self.assertEqual(self.chosen(),[self.a['companyId']])
  backup=self.root/'backup.tar.gz';meta=pack(self.root/'live',backup);restore(backup,self.root/'restored',meta['sha256']);fresh=Store(self.root/'restored/state.sqlite')
  try:self.assertEqual(self.chosen(fresh),[self.a['companyId']])
  finally:fresh.close()
  row=self.s.state(self.key+self.b['companyId']);self.assertEqual(row['networkRequests'],8);self.assertEqual(row['lastAttemptAt'],NOW)
 def test_cooldown_does_not_retime_paid_attempt_and_due_order_cannot_override_it(self):
  self.due(self.a,'2026-01-01T00:00:00Z');self.due(self.b,'2026-01-02T00:00:00Z');self.due(self.c,'2026-01-03T00:00:00Z')
  self.s.set_state('officialSite:'+self.a['companyId'],{'status':'DEFERRED','reason':'HTTP_503','retryAfter':'2099-01-01T00:00:00Z'})
  self.assertEqual(self.chosen(),[self.b['companyId']]);row=self.s.state(self.key+self.a['companyId']);self.assertEqual(row['status'],'COOLDOWN');self.assertEqual(row['lastAttemptAt'],'2026-01-01T00:00:00Z');self.assertEqual(row['networkRequests'],7)
  before={c:self.s.state(self.key+c) for c in self.cs};self.assertEqual(select(self.cs,self.s,NOW,'fair-retry','domains',limit=1,allow_network=False)[0],[]);self.assertEqual(before,{c:self.s.state(self.key+c) for c in self.cs})
 def test_dns_attempt_before_opener_rotates_without_claiming_an_http_request(self):
  self.due(self.a,'2026-01-01T00:00:00Z');self.due(self.b,'2026-01-02T00:00:00Z');self.due(self.c,'2026-01-03T00:00:00Z');self.assertEqual(self.chosen(),[self.a['companyId']])
  record({'companyId':self.a['companyId'],'status':'DEFERRED','reason':'DNS_UNAVAILABLE','requests':0},self.s,NOW,'fair-retry','domains');row=self.s.state(self.key+self.a['companyId']);self.assertEqual(row['networkRequests'],7);self.assertEqual(row['attempts'],2);self.assertEqual(row['lastAttemptAt'],NOW);self.assertEqual(self.chosen(),[self.b['companyId']])
