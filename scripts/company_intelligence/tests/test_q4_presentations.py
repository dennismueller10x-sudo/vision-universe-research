import json
import unittest
from company_intelligence.q4_presentations import endpoint,parse,discover,from_validated_events
from company_intelligence.transport import SourceError
from test_engine import company,NOW

PAGE='https://ir.apple.com/investors/'


def source():
 return {'companyId':company()['companyId'],'sourceId':'presentations','provider':'Q4','verified':True,
         'format':'Q4_PRESENTATIONS','type':'IR_MATERIALS','url':endpoint(PAGE),'allowedSites':['https://apple.com/',PAGE]}


def body(rows):return json.dumps({'GetPresentationListResult':rows}).encode()


class Q4PresentationTests(unittest.TestCase):
 def test_explicit_vendor_test_items_and_placeholder_assets_are_not_intelligence(self):
  rows=[{'Title':'Test Item: Presents at JP Morgan','DocumentPath':'https://cdn.example/Placeholder-Presentation.pdf','AudioFile':'https://cdn.example/demo.mp3','VideoFile':'https://cdn.example/demo.mp4'},
        {'Title':'Test Item: Presents at an Important Event','DocumentPath':'https://cdn.example/test.pdf'},
        {'Title':'Investor Presentation','DocumentPath':'https://ir.apple.com/placeholders/pdf-landscape.pdf'},
        {'Title':'Prepared Remarks','DocumentPath':'https://cdn.example/Placeholder.pdf'},
        {'Title':'Clinical Testing Investor Presentation','DocumentPath':'https://cdn.example/testing-results.pdf'},
        {'Title':'Placeholder Strategy Investor Presentation','DocumentPath':'https://cdn.example/strategy.pdf'},
        {'Title':'Test Item Dynamics Investor Presentation','DocumentPath':'https://cdn.example/deck.pdf'}]
  docs=parse(body(rows),source(),NOW)
  self.assertEqual([d['url'] for d in docs],['https://cdn.example/testing-results.pdf','https://cdn.example/strategy.pdf','https://cdn.example/deck.pdf'])
  self.assertEqual({d['type'] for d in docs},{'PRESENTATION'})

 def test_later_poll_retires_template_documents_from_actual_consumer_payload(self):
  import tempfile
  from pathlib import Path
  from company_intelligence.pipeline import Pipeline
  from company_intelligence.store import Store
  from company_intelligence.model import stable_id
  from company_intelligence.product import project
  with tempfile.TemporaryDirectory() as tmp:
   c=company();s=Store(Path(tmp)/'state.sqlite');src={**source(),'metadata':{'originatingIRHomepage':PAGE}}
   docs=[{'companyId':c['companyId'],'documentId':stable_id(c['companyId'],name),'type':kind,'label':label,'url':'https://cdn.example/'+name,'sourceId':src['sourceId']} for name,kind,label in [
    ('test.pdf','PRESENTATION','Test Item: Quarterly Earnings Presentation'),('demo.mp3','WEBCAST','Test Item: Presents at JP Morgan (audio reference)'),
    ('Placeholder-Presentation.pdf','PRESENTATION','Investor Presentation'),('deck.pdf','PRESENTATION','Clinical Testing Investor Presentation')]]
   s.set_state('ir:'+c['companyId'],{'lastSuccess':NOW,'configurations':[{'companyId':c['companyId'],'irHomepage':PAGE,'pageRole':'IR','materialsSourceId':src['sourceId'],'documents':docs}]})
   class HTTP:
    def get(self,*args,**kwargs):return {'body':body([{'Title':'Test Item: Presents at JP Morgan','DocumentPath':'https://cdn.example/test.pdf','AudioFile':'https://cdn.example/demo.mp3'}]),'finalUrl':src['url']}
   Pipeline(tmp,{c['companyId']:c},s,HTTP(),NOW).ingest_source(src)
   public=project(s.company_payload(c,NOW));self.assertEqual([d['url'] for d in public['materials']],['https://cdn.example/deck.pdf']);self.assertEqual(public['calls'],[])
   self.assertEqual(s.sources()[0]['lastItemCount'],1);self.assertEqual(s.state('ir:'+c['companyId'])['lastSuccess'],NOW);s.close()

 def test_presentation_index_cannot_authorize_a_news_story_as_a_deck(self):
  rows=[{'Title':'2026 Clinical Presentations','DocumentPath':'https://ir.apple.com/news-releases/news-release-details/scientific-2026-presentations'},
        {'Title':'Company Announces 2026 Presentations','DocumentPath':'https://ir.apple.com/announcement'},
        {'Title':'2026 Investor Presentation','DocumentPath':'https://cdn.example/news/deck.pdf'},
        {'Title':'2026 Financial Supplement','DocumentPath':'https://ir.apple.com/news/financial-supplement'}]
  docs=parse(body(rows),source(),NOW)
  self.assertEqual([d['url'] for d in docs],['https://cdn.example/news/deck.pdf','https://ir.apple.com/news/financial-supplement'])
  self.assertEqual([d['type'] for d in docs],['PRESENTATION','FINANCIAL_REPORT'])

 def test_specific_material_evidence_overrides_index_name_and_pdf_is_not_audio(self):
  rows=[{'Title':'HY26 Presentation and Q&A Transcript','DocumentPath':'https://cdn.example/qr-presentation.pdf'},
        {'Title':'Prepared remarks presentation','DocumentPath':'https://cdn.example/remarks.pdf'},
        {'Title':'Letter to shareholders','DocumentPath':'https://cdn.example/letter.pdf'},
        {'Title':'2Q26 Earnings Supplement','DocumentPath':'https://cdn.example/supplement.pdf'},
        {'Title':'Download presentation','DocumentPath':'https://cdn.example/annual-report.pdf'},
        {'Title':'Investor Presentation','DocumentPath':'https://cdn.example/doc_financials/investor-deck.pdf'},
        {'Title':'Interface Impact Report','DocumentPath':'https://cdn.example/impact-report.pdf'},
        {'Title':'Investor Reference Book','DocumentPath':'https://cdn.example/reference.pdf'},
        {'Title':'2026 Outlook Meeting','AudioFile':'https://cdn.example/presentation.pdf','VideoFile':'https://cdn.example/video.mp4'}]
  docs=parse(body(rows),source(),NOW)
  self.assertEqual([d['type'] for d in docs],['COMPANY_TRANSCRIPT','PREPARED_REMARKS','SHAREHOLDER_LETTER','FINANCIAL_REPORT','FINANCIAL_REPORT','PRESENTATION','WEBCAST'])
  self.assertFalse(any(d['url'].endswith(('impact-report.pdf','reference.pdf','presentation.pdf')) and d['type']=='WEBCAST' for d in docs))
  self.assertTrue(all(d['date'] is None for d in docs))

 def test_ingestion_corrects_retained_old_types_without_restoring_omitted_reports(self):
  import tempfile
  from pathlib import Path
  from company_intelligence.pipeline import Pipeline
  from company_intelligence.store import Store
  from company_intelligence.model import stable_id
  with tempfile.TemporaryDirectory() as tmp:
   c=company();s=Store(Path(tmp)/'state.sqlite');src={**source(),'metadata':{'originatingIRHomepage':PAGE}}
   docs=[{'companyId':c['companyId'],'documentId':stable_id(c['companyId'],name),'type':kind,'label':label,'url':'https://cdn.example/'+name,'sourceId':src['sourceId']} for name,kind,label in [
    ('impact.pdf','PRESENTATION','2025 Impact Report'),('supplement.pdf','PRESENTATION','2Q26 Financial Supplement'),
    ('deck.pdf','PRESENTATION','2025 Investor Presentation'),('audio.pdf','WEBCAST','Audio reference')]]
   s.set_state('ir:'+c['companyId'],{'lastSuccess':NOW,'configurations':[{'companyId':c['companyId'],'irHomepage':PAGE,'pageRole':'IR','materialsSourceId':src['sourceId'],'documents':docs}]})
   class HTTP:
    def get(self,*args,**kwargs):return {'body':body([]),'finalUrl':src['url']}
   p=Pipeline(tmp,{c['companyId']:c},s,HTTP(),NOW);p.ingest_source(src);payload=s.company_payload(c,NOW)
   by_url={d['url']:d for d in payload['materials']}
   self.assertNotIn('https://cdn.example/impact.pdf',by_url);self.assertNotIn('https://cdn.example/audio.pdf',by_url)
   self.assertEqual(by_url['https://cdn.example/supplement.pdf']['type'],'FINANCIAL_REPORT')
   self.assertEqual([d['url'] for d in payload['presentations']],['https://cdn.example/deck.pdf'])
   self.assertEqual(s.state('ir:'+c['companyId'])['lastSuccess'],NOW);s.close()

 def test_observed_public_contract_preserves_metadata_without_inventing_dates_or_calls(self):
  raw=body([{'Title':'2026 Outlook Meeting','PresentationId':'observed-id','PresentationDate':'02/05/2026 00:00:00',
            'DocumentPath':'https://s201.q4cdn.com/630564768/files/doc_financials/2025/q4/outlook.pdf',
            'AudioFile':'https://ir.apple.com/recording.mp3','VideoFile':'https://ir.apple.com/video.mp4',
            'Body':'Full descriptive prose must not enter the consumer payload.'}])
  docs=parse(raw,source(),NOW)
  self.assertEqual({d['type'] for d in docs},{'PRESENTATION','WEBCAST'});self.assertEqual(len(docs),3)
  self.assertTrue(all(d['date'] is None and d['reportingPeriod'] is None and d['eventId'] is None for d in docs))
  self.assertTrue(all(d['sourceGroupingDate']=='02/05/2026 00:00:00' and d['publicationDateStatus']=='NOT_PROVIDED' for d in docs))
  self.assertFalse(any('Body' in d or 'body' in d or 'fiscalQuarter' in d for d in docs))

 def test_unknown_ownership_provider_endpoint_and_schema_fail_closed(self):
  raw=body([])
  for changed in ({'verified':False},{'provider':'GCS'},{'format':'RSS'},{'url':'https://wrong.example/feed/Presentation.svc/GetPresentationList'},{'url':'https://ir.apple.com/other'}):
   with self.subTest(changed=changed),self.assertRaises(SourceError):parse(raw,{**source(),**changed},NOW)
  for changed in (b'{}',b'[]',body([None]),json.dumps({'GetPresentationListResult':{}}).encode()):
   with self.assertRaises(SourceError):parse(changed,source(),NOW)

 def test_only_public_explicit_document_media_fields_survive(self):
  rows=[{'Title':'Private deck','DocumentPath':'http://127.0.0.1/deck.pdf'},
        {'Title':'Local','DocumentPath':'https://internal.local/deck.pdf'},
        {'Title':'Signed','DocumentPath':'https://cdn.example/deck.pdf?X-Amz-Signature=private'},
        {'Title':'Token','DocumentPath':'https://cdn.example/deck.pdf?token=private'},
        {'Title':'Generic homepage','DocumentPath':'https://apple.com/'},
        {'Title':'No attachment','LinkToDetailPage':'https://ir.apple.com/news/other-company','RelatedFile':'https://cdn.example/unknown.pdf'},
        {'Title':'Public deck','DocumentPath':'https://cdn.example/deck.pdf'}]
  docs=parse(body(rows),source(),NOW);self.assertEqual(len(docs),1);self.assertEqual(docs[0]['label'],'Public deck')

 def test_bounded_rows_and_stable_issuer_document_identity(self):
  row={'Title':'Public deck','DocumentPath':'https://cdn.example/deck.pdf'}
  docs=parse(body([row]*25),source(),NOW);self.assertEqual(len(docs),1)
  self.assertEqual(docs[0]['companyId'],company()['companyId'])
  other={**source(),'companyId':'iss_cik_0000000001'}
  self.assertNotEqual(docs[0]['documentId'],parse(body([row]),other,NOW)[0]['documentId'])
  with self.assertRaises(SourceError):parse(body([row]*1001),source(),NOW)

 def test_advertised_sdk_is_required_and_redirect_is_independently_checked(self):
  class HTTP:
   def __init__(self,final=None):self.calls=[];self.final=final
   def get(self,url,**kwargs):
    self.calls.append(url);return {'body':body([{'Title':'Public deck','DocumentPath':'https://cdn.example/deck.pdf'}]),'finalUrl':self.final or url}
  s=source();http=HTTP();self.assertIsNone(discover(b'<p>q4Api vendor mention</p>',PAGE,s,http,NOW));self.assertEqual(http.calls,[])
  sdk=b'<script src="/js/module/widgets/dist/latest/evergreen.q4Api.min.js"></script>'
  result=discover(sdk,PAGE,s,http,NOW);self.assertEqual(result['url'],endpoint(PAGE));self.assertEqual(result['intervalHours'],24)
  with self.assertRaisesRegex(SourceError,'REDIRECT'):discover(sdk,PAGE,s,HTTP('https://wrong.example/'),NOW)

 def test_existing_event_proof_derives_clean_same_host_source_without_resetting_health(self):
  parent={**source(),'format':'Q4_EVENTS','url':'https://ir.apple.com/feed/Event.svc/GetEventList?LanguageId=1',
          'lastSuccess':NOW,'nextCheck':'2099-01-01T00:00:00Z','failureCount':4,'lastError':'HTTP_503'}
  child=from_validated_events(parent,NOW);self.assertEqual(child['parentSourceId'],parent['sourceId']);self.assertEqual(child['url'],endpoint(parent['url']))
  self.assertFalse(any(k in child for k in ('lastSuccess','nextCheck','failureCount','lastError')))
  for changed in ({'verified':False},{'format':'RSS'},{'active':False},{'url':'https://wrong.example/feed/Event.svc/GetEventList'}):
   self.assertIsNone(from_validated_events({**parent,**changed},NOW))

 def test_ingestion_adds_consumer_references_and_leaves_calls_and_prior_ir_intact(self):
  import tempfile
  from pathlib import Path
  from company_intelligence.pipeline import Pipeline
  from company_intelligence.store import Store
  with tempfile.TemporaryDirectory() as tmp:
   c=company();s=Store(Path(tmp)/'state.sqlite');s.set_state('ir:'+c['companyId'],{'lastSuccess':NOW,'configurations':[{'companyId':c['companyId'],'irHomepage':PAGE,'pageRole':'IR','documents':[]}]})
   src={**source(),'metadata':{'originatingIRHomepage':PAGE}}
   class HTTP:
    def get(self,*args,**kwargs):return {'body':body([{'Title':'2026 Outlook Meeting','DocumentPath':'https://cdn.example/deck.pdf','AudioFile':'https://ir.apple.com/audio.mp3','Body':'Never retain this content in a payload'}]),'finalUrl':src['url']}
   p=Pipeline(tmp,{c['companyId']:c},s,HTTP(),NOW);p.ingest_source(src);payload=s.company_payload(c,NOW)
   self.assertEqual(len(payload['presentations']),1);self.assertEqual(payload['calls'],[])
   self.assertNotIn('Never retain this content',json.dumps(payload));self.assertEqual(s.state('ir:'+c['companyId'])['lastSuccess'],NOW)
   self.assertEqual(len(s.state('ir:'+c['companyId'])['configurations']),2);self.assertGreater(s.sources()[0]['nextCheck'],NOW);s.close()
