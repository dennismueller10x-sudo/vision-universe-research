import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from company_intelligence.materials import from_validated_ir,parse_hub,backfill
from company_intelligence.feeds import discover_ir
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from company_intelligence.transport import SourceError
from test_engine import company,NOW

PAGE='https://apple.com/investors/'
HUB=PAGE+'presentations'


def config(c=None,page=PAGE,hub=HUB):
 c=c or company()
 return {'companyId':c['companyId'],'irHomepage':page,'presentationsUrl':hub,'pageRole':'IR',
         'providerType':'GCS','evidence':'LINK_FROM_VERIFIED_OFFICIAL_SITE','lastVerified':NOW,'documents':[]}


class HTTP:
 def __init__(self,pages=None,proxy_failure=False):
  self.pages=pages or {};self.proxy_failure=proxy_failure;self.requests=0;self.stats={};self.calls=[]
  self._wait=lambda url:None
  self.opener=self.open
 def open(self,request,**kwargs):
  if self.proxy_failure:raise SourceError('Envoy proxy error HTTP_503')
 def get(self,url,**kwargs):
  self._wait(url);self.calls.append(url);self.requests+=1;self.opener(SimpleNamespace(full_url=url))
  value=self.pages.get(url,SourceError('HTTP_404'))
  if isinstance(value,Exception):raise value
  return {'body':value.encode(),'finalUrl':url,'contentType':'text/html'}


class MaterialHubTests(unittest.TestCase):
 def test_only_advertised_html_hub_of_correct_verified_ir_is_eligible(self):
  c=company();cfg=config();self.assertEqual(from_validated_ir(c,cfg,NOW)['intervalHours'],24)
  bad=[{**cfg,'companyId':'other'},{**cfg,'pageRole':'CORPORATE'},{**cfg,'evidence':'guessed'},
       {**cfg,'presentationsUrl':'https://other.example/slides'},{**cfg,'presentationsUrl':PAGE},
       {**cfg,'presentationsUrl':PAGE+'deck.pdf'},{**cfg,'presentationsUrl':PAGE+'static-files/deck'}]
  for value in bad:
   with self.subTest(config=value):self.assertIsNone(from_validated_ir(c,value,NOW))
  self.assertIsNone(from_validated_ir({**c,'officialSites':[]},cfg,NOW))

 def test_documents_retain_company_source_and_undated_reference_semantics(self):
  c=company();s=from_validated_ir(c,config(),NOW)
  body=b'<html><a href="https://cdn.example/deck.pdf">Q3 2026 Investor Presentation</a><a href="remarks">Q3 Prepared Remarks</a><a href="https://wrong.example/transcript">Other company transcript</a><a href="#deck">Investor Presentation</a></html>'
  docs=parse_hub(body,s,c,HUB,NOW)
  self.assertEqual({d['type'] for d in docs},{'PRESENTATION','PREPARED_REMARKS'})
  self.assertTrue(all(d['companyId']==c['companyId'] and d['date'] is None and d['publicationDateStatus']=='NOT_PROVIDED' for d in docs))
  for value in ({**s,'companyId':'other'},{**s,'verified':False}):
   with self.assertRaises(SourceError):parse_hub(body,value,c,HUB,NOW)
  with self.assertRaises(SourceError):parse_hub(body,s,c,'https://wrong.example/',NOW)

 def test_annual_report_does_not_suppress_one_presentations_hub(self):
  page='https://ir.apple.com/';hub=page+'presentations';financial=page+'results'
  http=HTTP({page:'<title>Apple Investor Relations</title><a href="annual.pdf">Annual Report</a><a href="results">Financial Results</a><a href="presentations">Presentations</a>',
             hub:'<html><a href="q3.pdf">Q3 2026 Investor Presentation</a></html>',financial:'<html><a href="remarks">Prepared Remarks</a></html>'})
  sources,configs=discover_ir(company(),page,http,NOW)
  types={d['type'] for cfg in configs for d in cfg['documents']}
  self.assertEqual(types,{'FINANCIAL_REPORT','PRESENTATION'})
  material_sources=[s for s in sources if s.get('format')=='HTML_MATERIALS']
  self.assertEqual(len(material_sources),1);self.assertEqual(material_sources[0]['url'],hub);self.assertEqual(material_sources[0]['intervalHours'],24)
  self.assertEqual(http.calls.count(hub),1);self.assertNotIn(financial,http.calls)

 def test_poll_preserves_ir_and_old_documents_on_later_empty_or_failed_hub(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=company();s=Store(Path(tmp)/'state.sqlite');s.set_state('ir:'+c['companyId'],{'lastSuccess':NOW,'configurations':[config()]})
   src=from_validated_ir(c,config(),NOW);h=HTTP({HUB:'<html><a href="q3.pdf">Q3 2026 Investor Presentation</a></html>'});p=Pipeline(tmp,{c['companyId']:c},s,h,NOW)
   p.ingest_source(src);before=s.state('ir:'+c['companyId']);self.assertEqual(len(before['configurations']),2)
   self.assertEqual(len(s.company_payload(c,NOW)['presentations']),1)
   prior=next(x for x in s.sources() if x['sourceId']==src['sourceId'])
   p=Pipeline(tmp,{c['companyId']:c},s,HTTP({HUB:'<html><p>No links supplied.</p></html>'}),NOW);p.ingest_source(prior)
   self.assertEqual(s.state('ir:'+c['companyId']),before)
   current=s.sources()[0];self.assertEqual(current['failureCount'],1);self.assertGreater(current['nextCheck'],NOW);s.close()

 def test_failed_backfill_keeps_prior_due_time_and_accumulates_failures(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=company();s=Store(Path(tmp)/'state.sqlite');s.set_state('ir:'+c['companyId'],{'configurations':[config()]});src=from_validated_ir(c,config(),NOW)
   s.source({**src,'failureCount':3,'nextCheck':'2099-01-01T00:00:00Z','lastError':'HTTP_503'})
   h=HTTP();p=Pipeline(tmp,{c['companyId']:c},s,h,NOW);r=backfill(p,10)
   self.assertEqual(r['derivedSources'],0);self.assertEqual(h.requests,0);self.assertEqual(s.sources()[0]['failureCount'],3)
   s.source({**src,'failureCount':3,'nextCheck':NOW,'lastError':'HTTP_503'})
   p=Pipeline(tmp,{c['companyId']:c},s,HTTP({HUB:SourceError('HTTP_503')}),NOW);backfill(p,10)
   self.assertEqual(s.sources()[0]['failureCount'],4);self.assertGreater(s.sources()[0]['nextCheck'],NOW);s.close()

 def test_bounded_backfill_resumes_other_pending_issuer_after_success(self):
  with tempfile.TemporaryDirectory() as tmp:
   s=Store(Path(tmp)/'state.sqlite');companies={};pages={}
   for i in range(2):
    c=company('Example Inc.','EX'+str(i),str(i+1).zfill(10));root='https://issuer'+str(i)+'.example/';c['officialSites']=[root];page=root+'investors/';hub=page+'presentations';companies[c['companyId']]=c
    s.set_state('ir:'+c['companyId'],{'configurations':[config(c,page,hub)]});pages[hub]='<html><a href="deck.pdf">Investor Presentation</a></html>'
   recovered=[]
   for _ in range(2):
    r=backfill(Pipeline(tmp,companies,s,HTTP(pages),NOW),1);self.assertEqual(r['derivedSources'],1);recovered+=r['recoveredPresentationIssuers']
   self.assertEqual(len(set(recovered)),2)
   r=backfill(Pipeline(tmp,companies,s,HTTP(pages),NOW),1);self.assertEqual(r['derivedSources'],0);s.close()

 def test_cli_enriched_official_sites_are_used_even_when_pipeline_was_created_before_seed_override(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=company();empty={**c,'officialSites':[]};s=Store(Path(tmp)/'state.sqlite');s.set_state('ir:'+c['companyId'],{'configurations':[config()]})
   p=Pipeline(tmp,{c['companyId']:empty},s,HTTP({HUB:'<html><a href="deck.pdf">Investor Presentation</a></html>'}),NOW)
   self.assertEqual(backfill(p,1,companies={c['companyId']:c})['recoveredPresentationIssuers'],[c['companyId']]);s.close()

 def test_proxy_circuit_preserves_unsent_sources_and_cooldown(self):
  with tempfile.TemporaryDirectory() as tmp:
   s=Store(Path(tmp)/'state.sqlite');companies={}
   for i in range(6):
    c=company('Example Inc.','EX'+str(i),str(i+1).zfill(10));root='https://issuer'+str(i)+'.example/';c['officialSites']=[root];companies[c['companyId']]=c
    s.set_state('ir:'+c['companyId'],{'configurations':[config(c,root+'investors/',root+'presentations')]})
   h=HTTP(proxy_failure=True);r=backfill(Pipeline(tmp,companies,s,h,NOW),6)
   self.assertTrue(r['circuit']['open']);self.assertEqual(h.requests,4);self.assertEqual(len(s.sources()),4)
   before=s.state('discoveryCircuit:ir');h=HTTP();r=backfill(Pipeline(tmp,companies,s,h,NOW),6)
   self.assertEqual(r['stopReason'],'CIRCUIT_COOLDOWN');self.assertEqual(h.requests,0);self.assertEqual(s.state('discoveryCircuit:ir'),before);s.close()
