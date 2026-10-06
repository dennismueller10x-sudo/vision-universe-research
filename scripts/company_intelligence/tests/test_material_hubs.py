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
 def test_news_about_scientific_presentations_does_not_become_a_deck_or_return_on_poll(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=company();s=Store(Path(tmp)/'state.sqlite');src=from_validated_ir(c,config(),NOW)
   wrong=PAGE+'news-releases/news-release-details/company-announces-2026-presentations'
   old={'documentId':'wrong','companyId':c['companyId'],'type':'PRESENTATION','url':wrong,
        'label':'Company Announces 2026 Scientific Presentations','sourceId':src['sourceId']}
   s.set_state('ir:'+c['companyId'],{'lastSuccess':NOW,'configurations':[{**config(),'materialsSourceId':src['sourceId'],'documents':[old]}]})
   html='<html><a href="'+wrong+'">2026 Clinical Presentations</a><a href="/company-announces-2026-presentations">Company Announces 2026 Presentations</a><a href="/2026-investor-presentation">2026 Investor Presentation</a><a href="/news/deck.pdf">2026 Investor Presentation</a></html>'
   h=HTTP({HUB:html});p=Pipeline(tmp,{c['companyId']:c},s,h,NOW);p.ingest_source(src)
   docs=s.company_payload(c,NOW)['presentations']
   self.assertEqual({d['url'] for d in docs},{'https://apple.com/2026-investor-presentation','https://apple.com/news/deck.pdf'})
   self.assertEqual(s.state('ir:'+c['companyId'])['lastSuccess'],NOW)
   self.assertEqual(h.requests,1);s.close()

 def test_generic_presentation_label_cannot_turn_report_filename_into_slides(self):
  c=company();src=from_validated_ir(c,config(),NOW)
  body=b'<a href="Himalaya-Shipping-Annual-Report-2021.pdf">Download presentation: Annual Report</a><a href="Consolidated-financial-statements-Q4-2021.pdf">Download presentation: financial statements</a><a href="H1-2026-Investor-Presentation.pdf">Interim Financial Report - Investor Presentation</a><a href="Financial-Statements-and-Presentation.pdf">Investor Presentation</a>'
  docs=parse_hub(body,src,c,HUB,NOW)
  self.assertEqual([d['type'] for d in docs],['FINANCIAL_REPORT','FINANCIAL_REPORT','PRESENTATION','PRESENTATION'])
  self.assertTrue(all(d['date'] is None and d['companyId']==c['companyId'] for d in docs))

 def test_shareholder_report_attachment_overrides_generic_view_presentation(self):
  c=company();src=from_validated_ir(c,config(),NOW)
  body=b'<a href="/static-files/report">Combined Shareholders Report 2025. Final.pdfView Presentation</a><a href="/static-files/deck">2026 Investor Presentation - Shareholders Report Review</a><a href="/static-files/letter">2026 Shareholder Letter</a>'
  docs=parse_hub(body,src,c,HUB,NOW)
  self.assertEqual([d['type'] for d in docs],['FINANCIAL_REPORT','PRESENTATION','SHAREHOLDER_LETTER'])
  self.assertEqual([d['url'] for d in docs],[HUB.split('/investor')[0]+'/static-files/report',HUB.split('/investor')[0]+'/static-files/deck',HUB.split('/investor')[0]+'/static-files/letter'])
  self.assertTrue(all(d['date'] is None for d in docs))

 def test_presentation_acceptance_story_is_not_a_deck_but_actual_pdf_remains(self):
  c=company();src=from_validated_ir(c,config(),NOW)
  body=b'<a href="accepted-for-presentation-at-iecon-2026/">Battery Design Accepted for Presentation at IECON 2026</a><a href="corporate.pdf">Q2 2026 Corporate Presentation</a>'
  docs=parse_hub(body,src,c,HUB,NOW)
  self.assertEqual([(d['type'],d['url']) for d in docs],[('PRESENTATION',HUB.rsplit('/',1)[0]+'/corporate.pdf')])

 def test_placeholder_pdf_assets_are_withheld_and_retired_without_hiding_actual_decks(self):
  from company_intelligence.materials import correct_documents
  c=company();src=from_validated_ir(c,config(),NOW)
  body=b'<a href="placeholder.pdf">View Investor Presentation</a><a href="PLACEHOLDER.pdf?download=1">Prepared Remarks</a><a href="%70laceholder.pdf">Company Transcript</a><a href="placeholder-document.pdf">Shareholder Letter</a><a href="2026-investor-presentation.pdf">Investor Presentation</a>'
  docs=parse_hub(body,src,c,HUB,NOW)
  self.assertEqual([(d['type'],d['url']) for d in docs],[('PRESENTATION',HUB.rsplit('/',1)[0]+'/2026-investor-presentation.pdf')])
  old={'documentId':'placeholder','type':'PRESENTATION','url':HUB+'/placeholder.pdf','label':'View Investor Presentation'}
  self.assertEqual(correct_documents([old,*docs]),docs)

 def test_event_material_followup_never_attaches_a_placeholder_pdf(self):
  from company_intelligence.materials import discover_links
  e={'sourceUrl':PAGE};src={'verified':True,'allowedSites':[PAGE]}
  h=HTTP({PAGE:'<a href="placeholder.pdf">Investor Presentation</a><a href="deck.pdf">Investor Presentation</a>'})
  result=discover_links(e,src,h)
  self.assertEqual(result['presentationUrl'],'https://apple.com/investors/deck.pdf')
  self.assertEqual([x['url'] for x in result['materialEvidence']],[result['presentationUrl']])

 def test_restored_placeholder_reference_is_withheld_from_consumer_before_a_network_poll(self):
  with tempfile.TemporaryDirectory() as tmp:
   s=Store(Path(tmp)/'state.sqlite');c=company()
   bad={'documentId':'placeholder','companyId':c['companyId'],'type':'PRESENTATION','url':HUB+'/placeholder.pdf','label':'View Investor Presentation'}
   good={**bad,'documentId':'deck','url':HUB+'/2026-investor-presentation.pdf'}
   ir={'configurations':[{**config(c),'documents':[bad,good]}]};s.set_state('ir:'+c['companyId'],ir)
   self.assertEqual(s.company_payload(c,NOW)['materials'],[good])
   self.assertEqual(s.state('ir:'+c['companyId']),ir);s.close()

 def test_esg_report_does_not_become_presentation_through_generic_download_label(self):
  c=company();src=from_validated_ir(c,config(),NOW)
  body=b'<a href="2025+ESG+Report+-+letter+-+web.pdf">View Presentation</a><a href="2026-Sustainability-Report.pdf">Download Presentation</a><a href="2026-Investor-Presentation-ESG-Report-Review.pdf">Investor Presentation</a>'
  docs=parse_hub(body,src,c,HUB,NOW)
  self.assertEqual([(d['type'],d['url']) for d in docs],[('PRESENTATION',HUB.rsplit('/',1)[0]+'/2026-Investor-Presentation-ESG-Report-Review.pdf')])

 def test_plural_shareholder_letter_navigation_is_not_an_individual_letter(self):
  c=company();src=from_validated_ir(c,config(),NOW)
  body=b'<a href="shareholder-letters">Shareholder Letters</a><a href="2026-shareholder-letter">2026 Shareholder Letter</a><a href="letter.pdf">Shareholder Letters</a>'
  docs=parse_hub(body,src,c,HUB,NOW)
  self.assertEqual([d['url'] for d in docs],[HUB.rsplit('/',1)[0]+'/2026-shareholder-letter',HUB.rsplit('/',1)[0]+'/letter.pdf'])
  self.assertTrue(all(d['type']=='SHAREHOLDER_LETTER' for d in docs))
  with tempfile.TemporaryDirectory() as tmp:
   s=Store(Path(tmp)/'state.sqlite');wrong={'documentId':'old-hub','companyId':c['companyId'],'type':'SHAREHOLDER_LETTER','url':HUB.rsplit('/',1)[0]+'/shareholder-letters','label':'Shareholder Letters','sourceId':src['sourceId']}
   s.set_state('ir:'+c['companyId'],{'configurations':[{**config(),'materialsSourceId':src['sourceId'],'documents':[wrong]}]})
   p=Pipeline(tmp,{c['companyId']:c},s,HTTP({HUB:body.decode()}),NOW);p.ingest_source(src)
   retained=[d for cfg in s.state('ir:'+c['companyId'])['configurations'] for d in cfg.get('documents',[])]
   self.assertNotIn(wrong['url'],[d['url'] for d in retained]);self.assertIn(HUB.rsplit('/',1)[0]+'/letter.pdf',[d['url'] for d in retained]);s.close()

 def test_compound_transcript_label_replaces_old_type_without_losing_other_materials(self):
  from company_intelligence.model import stable_id
  with tempfile.TemporaryDirectory() as tmp:
   c=company();s=Store(Path(tmp)/'state.sqlite');src=from_validated_ir(c,config(),NOW)
   url=HUB+'/qa.pdf';old={'documentId':stable_id(c['companyId'],url,'PRESENTATION'),
                        'companyId':c['companyId'],'type':'PRESENTATION','url':url,
                        'label':'HY26 Presentation and Q&A Transcript','sourceId':src['sourceId']}
   annual={**old,'documentId':'annual','type':'FINANCIAL_REPORT','url':HUB+'/annual.pdf','label':'Annual Report'}
   s.set_state('ir:'+c['companyId'],{'configurations':[{**config(),'materialsSourceId':src['sourceId'],'documents':[old,annual]}]})
   h=HTTP({HUB:'<html><a href="'+url+'">HY26 Presentation and Q&amp;A Transcript</a><a href="remarks.pdf">Presentation Prepared Remarks</a></html>'})
   p=Pipeline(tmp,{c['companyId']:c},s,h,NOW);p.ingest_source(src)
   docs=s.state('ir:'+c['companyId'])['configurations'][0]['documents']
   self.assertEqual([d['type'] for d in docs if d['url']==url],['COMPANY_TRANSCRIPT'])
   self.assertIn(annual,docs);self.assertIn('PREPARED_REMARKS',{d['type'] for d in docs})
   self.assertFalse(s.company_payload(c,NOW)['presentations'])
   self.assertTrue(any(d['type']=='COMPANY_TRANSCRIPT' for d in s.company_payload(c,NOW)['materials']))
   s.close()

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

 def test_successful_ir_rediscovery_keeps_active_source_materials_in_both_paths(self):
  from unittest.mock import patch
  from company_intelligence.discovery_batch import persist
  for mode in ('pipeline','batch'):
   with self.subTest(mode=mode),tempfile.TemporaryDirectory() as tmp:
    c=company();cid=c['companyId'];s=Store(Path(tmp)/'state.sqlite');src=from_validated_ir(c,config(),NOW);s.source(src)
    preserved={**config(),'materialsSourceId':src['sourceId'],'documents':[{'documentId':'proof','companyId':cid,'type':'PRESENTATION','url':PAGE+'deck.pdf','date':None,'label':'Investor Presentation'}]}
    s.set_state('ir:'+cid,{'configurations':[preserved]});new={**config(),'documents':[]}
    if mode=='pipeline':
     with patch('company_intelligence.pipeline.discover_ir',return_value=([],[new])):Pipeline(tmp,{cid:c},s,HTTP(),NOW).discover_company(c,c['officialSites'][0])
    else:persist([{'companyId':cid,'status':'VALIDATED','sources':[],'configurations':[new],'requests':1,'stats':{}}],s,{cid:c},NOW)
    self.assertEqual(len(s.company_payload(c,NOW)['presentations']),1);self.assertEqual(s.state('ir:'+cid)['lastSuccess'],NOW);s.close()

 def test_source_retention_does_not_restore_disabled_wrong_company_or_replaced_configs(self):
  from company_intelligence.materials import retain_source_configurations
  with tempfile.TemporaryDirectory() as tmp:
   c=company();cid=c['companyId'];s=Store(Path(tmp)/'state.sqlite');src=from_validated_ir(c,config(),NOW);old={**config(),'materialsSourceId':src['sourceId'],'documents':[{'old':'proof'}]};s.source(src);s.set_state('ir:'+cid,{'configurations':[old]})
   new={**old,'documents':[{'new':'proof'}]};self.assertEqual(retain_source_configurations(s,cid,[new]),[new])
   s.source({**src,'active':False});self.assertEqual(retain_source_configurations(s,cid,[]),[])
   s.source({**src,'active':True,'companyId':'wrong'});self.assertEqual(retain_source_configurations(s,cid,[]),[]);s.close()
