import json,unittest
from pathlib import Path
from company_intelligence.discovery import validate_candidate
from company_intelligence.transport import SourceError
from test_engine import company,NOW

class StructuredOwnershipTests(unittest.TestCase):
 def validate(self,node,c=None,footer='',header='Rambus | Memory Interface Chips'):
  c=c or company('Rambus Inc.','RMBS','0000917273');url='https://www.rambus.com/'
  body=('<title>'+header+'</title><script type="application/ld+json">'+json.dumps(node)+'</script>'+footer).encode()
  class HTTP:
   def get(self,*args,**kwargs):return {'body':body,'finalUrl':url}
  return validate_candidate(c,{'url':url,'evidence':'EXISTING_DOMAIN_CANDIDATE'},HTTP(),NOW)
 def node(self,**changes):return {'@type':'Organization','legalName':'Rambus Inc.','url':'https://www.rambus.com/',**changes}
 def test_actual_structured_legal_owner_is_retained_as_evidence(self):
  value=self.validate(self.node());self.assertIn('EXACT_JSONLD_LEGAL_OWNER_HOST_AND_CORPORATE_HEADER',value['evidence'])
  self.assertEqual(value['ownershipEvidence']['structuredOrganizations'][0]['legalName'],'Rambus Inc.')
 def test_customer_other_host_generic_brand_and_other_entity_type_rejected(self):
  for node in [self.node(url='https://customer.example/'),self.node(legalName='Rambus'),self.node(legalName='Rambus Inc. Services LLC'),self.node(**{'@type':'NewsArticle'}),self.node(url='javascript:alert(1)'),self.node(url={'unexpected':'object'})]:
   with self.assertRaises(SourceError):self.validate(node)
 def test_conflicting_copyright_and_cik_still_reject(self):
  with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT'):
   self.validate(self.node(),footer='Copyright 2026 Different Manufacturer LLC.')
  with self.assertRaisesRegex(SourceError,'STRUCTURED_CIK_CONFLICT'):
   self.validate(self.node(identifier={'propertyID':'CIK','value':'320193'}))
  self.assertEqual(self.validate(self.node(identifier=[{'propertyID':'CIK','value':'917273'}]))['status'],'VALIDATED')
 def test_legal_name_requires_corresponding_corporate_header(self):
  with self.assertRaises(SourceError):self.validate(self.node(),header='Different Company')
 def test_actual_same_acronym_foreign_business_never_matches_us_issuer(self):
  with self.assertRaises(SourceError):
   self.validate({'@type':['Organization','Place'],'legalName':'Iridex Group SRL','url':'https://www.rambus.com/'},company('IRIDEX Corporation','IRIX','0001006045'),header='Iridex Group')
 def test_graph_and_type_array_supported_but_not_unbounded_structure(self):
  self.assertEqual(self.validate({'@graph':[self.node(**{'@type':['Corporation','Organization']})]})['status'],'VALIDATED')
  with self.assertRaises(SourceError):self.validate({'@graph':'wrong schema'})
  with self.assertRaises(SourceError):self.validate(self.node(extra='x'*140000))
 def test_observed_corporate_identity_fixtures(self):
  cases=json.loads((Path(__file__).parent/'fixtures/structured-legal-ownership.json').read_text())['cases']
  self.assertGreaterEqual(len(cases),3)
  for case in cases:
   c=company(case['companyNames'][0],'FIXTURE',case['companyId'].removeprefix('iss_cik_'));c['names']=case['companyNames']
   body=('<title>'+case['title']+'</title><script type="application/ld+json">'+json.dumps(case['organizations'])+'</script>').encode()
   class HTTP:
    def get(self,*args,**kwargs):return {'body':body,'finalUrl':case['url']}
   if case['organizations'][0]['legalName']=='Iridex Group SRL':
    with self.assertRaises(SourceError):validate_candidate(c,{'url':case['url'],'evidence':'RECORDED_METADATA'},HTTP(),NOW)
   else:
    self.assertEqual(validate_candidate(c,{'url':case['url'],'evidence':'RECORDED_METADATA'},HTTP(),NOW)['status'],'VALIDATED')
