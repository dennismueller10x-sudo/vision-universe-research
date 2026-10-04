import json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.site_inventory import inventory,import_inventory,candidate_routes
from company_intelligence.store import Store
from test_engine import company,NOW
class InventoryTests(unittest.TestCase):
 def test_duplicate_http_https_routes_do_not_change_original_provenance(self):
  value={'candidates':[{'url':'http://www.carriageservices.com/','evidence':'PUBLISHER_AUTHOR'}, {'url':'https://www.carriageservices.com/','evidence':'SEC_LOGO'}]}
  result=candidate_routes(value)
  self.assertEqual(len(result),1);self.assertEqual(result[0]['url'],'https://www.carriageservices.com/')
  self.assertEqual(value['candidates'][0]['url'],'http://www.carriageservices.com/')
  self.assertEqual(len(value['candidates']),2)
 def test_different_host_path_or_query_remains_separate(self):
  for other in ['https://other.example/','https://www.carriageservices.com/other','https://www.carriageservices.com/?tenant=other','https://carriageservices.com/']:
   self.assertEqual(len(candidate_routes({'candidates':[{'url':'https://www.carriageservices.com/'},{'url':other}]})),2)
 def fixture(self,tmp,rows,credits=None):
  root=Path(tmp);p=root/'discover/logos';p.mkdir(parents=True);(p/'sites.json').write_text(json.dumps({'generatedAt':NOW,'sites':rows}));(p/'credits.json').write_text(json.dumps({'credits':credits or {}}));return root
 def test_existing_output_is_candidate_not_verified_and_import_is_incremental(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=self.fixture(tmp,{'AAPL':{'url':'https://apple.com','via':'WIKIDATA_CIK'}});c=company();s=Store(root/'s.sqlite');a=import_inventory(root,{c['companyId']:c},s,NOW);b=import_inventory(root,{c['companyId']:c},s,'2026-10-03T12:00:00Z')
   self.assertEqual(a,b);self.assertEqual(s.state('siteCandidates:'+c['companyId'])['status'],'CANDIDATE');self.assertFalse(s.state('officialSite:'+c['companyId']))
 def test_conflicting_share_classes_cannot_choose_convenient_domain(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=self.fixture(tmp,{'GOOG':{'url':'https://abc.xyz','via':'WIKIDATA_CIK'},'GOOGL':{'url':'https://evil.example','via':'WIKIDATA_TICKER'}});c=company('Alphabet Inc.','GOOG');c['listings'].append({'symbol':'GOOGL'});self.assertEqual(inventory(root,{c['companyId']:c})[0][c['companyId']]['status'],'AMBIGUOUS')
 def test_wrong_sec_issuer_ticker_collision_and_unsafe_sources_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=self.fixture(tmp,{'AAPL':{'url':'https://apple.com','via':'SEC_10K'}},{'AAPL':{'page':'https://www.sec.gov/Archives/edgar/data/9999/x'}});c=company();self.assertFalse(inventory(root,{c['companyId']:c})[0])
   for url in ['http://127.0.0.1/','https://user:pass@evil.com/','https://yahoo.com/','https://a.local/']:
    (root/'discover/logos/sites.json').write_text(json.dumps({'sites':{'AAPL':{'url':url,'via':'SEC_10K'}}}));self.assertFalse(inventory(root,{c['companyId']:c})[0])
 def test_inventory_does_not_overwrite_validated_site_on_conflict(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=self.fixture(tmp,{'AAPL':{'url':'https://other.example/','via':'WIKIDATA_CIK'}});c=company();s=Store(root/'s.sqlite');s.set_state('officialSite:'+c['companyId'],{'status':'VALIDATED','url':'https://apple.com/'});s.set_state('siteCandidates:'+c['companyId'],{'status':'CANDIDATE','candidates':[{'url':'https://apple.com/'}]});import_inventory(root,{c['companyId']:c},s,NOW)
   self.assertEqual(s.state('siteCandidates:'+c['companyId'])['status'],'AMBIGUOUS');self.assertEqual(s.state('officialSite:'+c['companyId'])['url'],'https://apple.com/')

 def test_current_master_identity_change_invalidates_import_checkpoint(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=self.fixture(tmp,{'AAPL':{'url':'https://apple.com','via':'WIKIDATA_CIK'}});c=company();s=Store(root/'s.sqlite');a=import_inventory(root,{c['companyId']:c},s,NOW)
   c['names']=['Renamed Apple Inc.'];b=import_inventory(root,{c['companyId']:c},s,NOW)
   self.assertNotEqual(a['identityHash'],b['identityHash']);s.close()
