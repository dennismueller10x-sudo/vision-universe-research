import json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.q4_reports import parse,endpoint,discover
from company_intelligence.transport import SourceError
from test_engine import NOW
S={'companyId':'issuer','sourceId':'q4','url':endpoint('https://investors.example/'),'allowedSites':['https://investors.example/'],'provider':'Q4','format':'Q4_REPORTS','verified':True}
def body(docs=None):
 return json.dumps({'GetFinancialReportListResult':[{'ReportYear':2026,'ReportTitle':'2026','ReportSubType':'Third Quarter','ReportDate':'12/31/2026','Documents':docs or [{'DocumentTitle':'Prepared Management Remarks','DocumentPath':'https://s21.q4cdn.com/a.pdf','DocumentCategory':'supplemental-fin'},{'DocumentTitle':'Earnings Webcast','DocumentPath':'https://public.webcast.example/event','DocumentCategory':'webcast'},{'DocumentTitle':'Earnings Presentation','DocumentPath':'https://s21.q4cdn.com/deck.pdf','DocumentCategory':'presentation'}]}]}).encode()
class Reports(unittest.TestCase):
 def test_financial_supplements_in_vendor_presentation_category_remain_reports(self):
  docs=[{'DocumentTitle':label,'DocumentPath':url,'DocumentCategory':'presentation'} for label,url in [
   ('Supplemental Information','https://s21.q4cdn.com/2026-Supplemental-Data.pdf'),
   ('Financial Supplement','https://s21.q4cdn.com/financial-supplement.pdf'),
   ('Earnings Supplemental Slides','https://s21.q4cdn.com/earnings-presentation.pdf'),
   ('Second Quarter 2026 Presentation','https://s21.q4cdn.com/Q2-2026-Supplementals.pdf'),
   ('Prepared Management Remarks','https://s21.q4cdn.com/remarks.pdf'),
   ('Supplemental Information','https://s21.q4cdn.com/Investor-Presentation.pdf'),
   ('Supplemental Information','https://s21.q4cdn.com/Earnings-Release-Supplemental-Slides.pdf'),
   ('Supplemental Information','https://s21.q4cdn.com/Q2-Earnings-Release.pdf')]]
  rows=parse(body(docs),S,NOW)
  self.assertEqual([r['type'] for r in rows],['FINANCIAL_REPORT','FINANCIAL_REPORT','PRESENTATION','PRESENTATION','PREPARED_REMARKS','PRESENTATION','PRESENTATION','EARNINGS_RELEASE'])
  self.assertTrue(all(r['fiscalQuarter']=='Q3' and r['date'] is None for r in rows))
  from company_intelligence.q4_presentations import correct_documents
  old=[{**r,'type':'PRESENTATION'} for r in rows[:2]]
  fixed=correct_documents(old)
  self.assertEqual([r['type'] for r in fixed],['FINANCIAL_REPORT','FINANCIAL_REPORT'])
  self.assertEqual([r['url'] for r in fixed],[r['url'] for r in old])
  self.assertEqual([r['discoveredAt'] for r in fixed],[r['discoveredAt'] for r in old])

 def test_explicit_period_and_links_without_invented_dates(self):
  rows=parse(body(),S,NOW);self.assertEqual({r['type'] for r in rows},{'PREPARED_REMARKS','EARNINGS_WEBCAST','PRESENTATION'})
  for r in rows:self.assertIsNone(r['date']);self.assertEqual(r['publicationDateStatus'],'NOT_PROVIDED');self.assertEqual(r['fiscalQuarter'],'Q3');self.assertEqual(r['sourceGroupingDate'],'12/31/2026')
 def test_paid_external_transcript_and_private_url_rejected(self):
  self.assertEqual(parse(body([{'DocumentTitle':'Transcript','DocumentPath':'https://paywall.example/x'},{'DocumentTitle':'Presentation','DocumentPath':'http://127.0.0.1/x.pdf'}]),S,NOW),[])
 def test_no_authority_without_verified_q4_ownership(self):
  self.assertEqual(parse(body(),{**S,'verified':False},NOW),[])
 def test_invalid_schema_and_oversized_body_fail(self):
  for b in [b'bad',b'[]',b'{"GetFinancialReportListResult":{}}',b'x'*(2*1024*1024+1)]:
   with self.assertRaises(SourceError):parse(b,S,NOW)
 def test_duplicate_documents_stable_ids(self):
  d={'DocumentTitle':'Presentation','DocumentPath':'https://s21.q4cdn.com/deck.pdf'}
  self.assertEqual(len(parse(body([d,d]),S,NOW)),1);self.assertEqual(parse(body(),S,NOW),parse(body(),S,NOW))
 def test_discovery_requires_advertised_widget(self):
  class HTTP:
   def get(self,*args,**kwargs):return {'body':body(),'finalUrl':S['url']}
  self.assertIsNone(discover(b'<html/>','https://investors.example/',S,HTTP(),NOW))
  self.assertEqual(discover(b'<script src="/evergreen.q4Api.min.js"></script>','https://investors.example/',S,HTTP(),NOW)['format'],'Q4_REPORTS')
 def test_redirect_foreign_host_rejected(self):
  class HTTP:
   def get(self,*args,**kwargs):return {'body':body(),'finalUrl':'https://another.example/feed'}
  with self.assertRaises(SourceError):discover(b'<script src="/evergreen.q4Api.min.js"></script>','https://investors.example/',S,HTTP(),NOW)
 def test_real_unrelated_issuers_keep_fiscal_labels_without_future_dates(self):
  fixture=json.loads((Path(__file__).parent/'fixtures/management-content-metadata.json').read_text())
  self.assertGreaterEqual(len(fixture['cases']),3)
  for case in fixture['cases']:
   rows=parse(json.dumps(case['response']).encode(),case['source'],NOW)
   self.assertEqual(sorted({r['type'] for r in rows}),case['expectedTypes'])
   for r in rows:
    self.assertEqual(r['companyId'],case['source']['companyId']);self.assertIsNone(r['date']);self.assertEqual(r['publicationDateStatus'],'NOT_PROVIDED');self.assertEqual(r['fiscalYear'],2026)

class ReportsConsumer(unittest.TestCase):
 def test_past_investor_webcast_survives_large_archive_without_becoming_a_call(self):
  import tempfile
  from company_intelligence.store import Store
  from test_engine import company
  with tempfile.TemporaryDirectory() as tmp:
   st=Store(Path(tmp)/'s.sqlite');c=company();cid=c['companyId']
   st.set_state('ir:'+cid,{'configurations':[{'documents':[{'companyId':cid,'documentId':str(i),'type':'FINANCIAL_REPORT','url':'https://apple.com/report'+str(i),'date':None} for i in range(100)]}]})
   st.event({'companyId':cid,'eventId':'conference','eventType':'IR_EVENT','date':'2026-09-09','headline':'Investor conference','webcastUrl':'https://public.webcast.example/conference'},NOW)
   payload=st.company_payload(c,NOW);self.assertEqual(payload['calls'],[]);self.assertEqual(payload['events'],[]);self.assertEqual(len(payload['materials']),50)
   self.assertEqual(payload['materials'][0]['type'],'WEBCAST');self.assertEqual(payload['materials'][0]['label'],'Investor conference');self.assertNotIn('CALL_RECORDING',{d['type'] for d in payload['materials']});st.close()
 def test_materials_only_issuer_has_consistent_available_payload(self):
  import tempfile
  from company_intelligence.store import Store
  from test_engine import company
  with tempfile.TemporaryDirectory() as tmp:
   st=Store(Path(tmp)/'s.sqlite');c=company();st.set_state('ir:'+c['companyId'],{'configurations':[{'companyId':c['companyId'],'pageRole':'IR','documents':[{'companyId':c['companyId'],'documentId':'d','type':'PREPARED_REMARKS','url':'https://apple.com/remarks','date':None}]}]})
   payload=st.company_payload(c,NOW);self.assertEqual(payload['state'],'AVAILABLE');self.assertEqual(len(payload['materials']),1);self.assertEqual(payload['calls'],[]);st.close()
 def test_derived_reports_source_requires_prior_q4_widget_ownership(self):
  from company_intelligence.q4_reports import from_validated_events
  s={**S,'format':'Q4_EVENTS','url':'https://investors.example/feed/Event.svc/GetEventList'}
  self.assertEqual(from_validated_events(s,NOW)['format'],'Q4_REPORTS');self.assertIsNone(from_validated_events({**s,'verified':False},NOW));self.assertIsNone(from_validated_events({**s,'allowedSites':['https://other.example/']},NOW))
