import copy,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.q4_events import parse,endpoint,discover
from company_intelligence.transport import SourceError
from company_intelligence.sec_documents import inspect_html
from test_engine import NOW
FIX=Path(__file__).parent/'fixtures/q4-event-metadata.json'
class Q4Tests(unittest.TestCase):
 def source(self):return {'companyId':'issuer','sourceId':'q4','url':endpoint('https://ir.example.com/events'),'provider':'Q4','format':'Q4_EVENTS','verified':True,'allowedSites':['https://ir.example.com/']}
 def payload(self,rows):return json.dumps({'GetEventListResult':rows}).encode()
 def rows(self):return json.loads(FIX.read_text())['issuers'][2]['events']
 def test_four_unrelated_issuer_metadata_fixtures_parse_without_body_retention(self):
  for issuer in json.loads(FIX.read_text())['issuers']:
   es=parse(self.payload(issuer['events']),self.source(),NOW);self.assertTrue(es,issuer['issuer']);self.assertFalse(any('Body' in e for e in es))
 def test_vendor_est_region_uses_dst_and_has_stable_event_ids(self):
  r=copy.deepcopy(self.rows()[0]);r.update(StartDate='10/23/2026 08:30:00',TimeZone='EST');e=parse(self.payload([r]),self.source(),NOW)[0]
  self.assertEqual(e['startsAt'],'2026-10-23T12:30:00Z');self.assertEqual(e['timezone'],'America/New_York');self.assertEqual(e['eventId'],parse(self.payload([r]),self.source(),'2026-10-02T12:00:00Z')[0]['eventId'])
 def test_unknown_zone_midnight_and_dst_gap_do_not_invent_time(self):
  for start,zone in [('10/23/2026 08:30:00','UNKNOWN'),('10/23/2026 00:00:00','ET'),('03/08/2026 02:30:00','ET')]:
   r={**self.rows()[0],'StartDate':start,'TimeZone':zone};e=parse(self.payload([r]),self.source(),NOW)[0];self.assertIsNone(e['startsAt']);self.assertIsNone(e['time'])
 def test_wrong_host_and_unverified_source_cannot_supply_events(self):
  rows=self.rows();rows[0]['LinkToDetailPage']='https://another-company.example.com/events'
  self.assertFalse(parse(self.payload(rows[:1]),self.source(),NOW));self.assertFalse(parse(self.payload(rows),{**self.source(),'verified':False},NOW))
 def test_private_attachment_urls_are_never_retained(self):
  r=copy.deepcopy(self.rows()[0]);r['WebCastLink']='http://127.0.0.1/';r['Attachments']=[{'Title':'Transcript','Url':'http://metadata.internal/x.pdf'}];e=parse(self.payload([r]),self.source(),NOW)[0]
  self.assertIsNone(e['webcastUrl']);self.assertFalse(any(d['type']=='COMPANY_TRANSCRIPT' for d in e['sourceDocuments']))
 def test_malformed_schema_fails_visibly(self):
  for body in [b'not json',b'{}',b'{"GetEventListResult":{}}',b'{"GetEventListResult":[null]}']:
   with self.assertRaises(SourceError):parse(body,self.source(),NOW)
 def test_explicit_attachment_labels_establish_materials_not_generic_pdfs(self):
  e=parse(self.payload(self.rows()),self.source(),NOW);docs=[d for x in e for d in x['sourceDocuments']];self.assertTrue(any(d['type']=='PRESENTATION' for d in docs));self.assertTrue(any(d['type']=='FINANCIAL_REPORT' for d in docs))
 def test_advertised_widget_required_before_endpoint_discovery(self):
  class HTTP:
   def get(self,*a,**k):raise AssertionError('UNADVERTISED_REQUEST')
  self.assertIsNone(discover(b'<p>Q4 EventService</p>','https://ir.example.com/',self.source(),HTTP(),NOW))
 def test_sec_link_materials_preserved_without_downloading_or_guessing_exhibit_type(self):
  u='https://www.sec.gov/Archives/edgar/data/123/000000012326000001/a.htm'
  body=b'<a href="slides.pdf">Earnings presentation</a><a href="99-2.pdf">Exhibit 99.2</a><a href="remarks.htm">Prepared remarks</a><a href="https://evil.example/slides.pdf">Presentation</a>'
  d=inspect_html(body,u)['sourceDocuments'];self.assertEqual({x['type'] for x in d},{'PRESENTATION','PREPARED_REMARKS'});self.assertEqual(len(d),2)

 def test_real_nvidia_ordinal_short_fiscal_year_is_preserved(self):
  r={**self.rows()[0], 'Title':'NVIDIA 4th Quarter FY26 Financial Results', 'StartDate':'02/25/2026 14:00:00', 'TimeZone':'PT', 'WebCastLink':'https://events.q4inc.com/attendee/123'}
  e=parse(self.payload([r]),self.source(),NOW)[0]
  self.assertEqual((e['fiscalQuarter'], e['fiscalYear']),('Q4',2026))
  self.assertEqual(e['eventType'],'EARNINGS_CALL')
  r['Title']='NVIDIA 4th Quarter 26 Financial Results'
  self.assertNotIn('fiscalYear',parse(self.payload([r]),self.source(),NOW)[0])

 def test_real_platform_period_prefixes_pass_actor_checks_but_other_issuer_does_not(self):
  from company_intelligence.model import issuer_earnings_announcement
  from test_engine import company
  nv=company('NVIDIA Corporation','NVDA');go=company('Alphabet Inc.','GOOG')
  self.assertTrue(issuer_earnings_announcement('NVIDIA 4th Quarter FY26 Financial Results · Earnings webcast',nv))
  self.assertTrue(issuer_earnings_announcement('2026 Q2 Earnings Call',go))
  self.assertTrue(issuer_earnings_announcement('Q3 2026 The Boeing Company Earnings Conference Call',company('BOEING CO','BA')))
  self.assertFalse(issuer_earnings_announcement('Q3 2026 The Boeing Company Earnings Conference Call',go))
  self.assertFalse(issuer_earnings_announcement('2026 Q2 NVIDIA Corporation Earnings Call',go))
  self.assertFalse(issuer_earnings_announcement('4th Quarter FY26 Root Inc. Earnings Call',go))

 def test_event_attachments_prioritize_management_text_and_reject_pdf_webcast_and_templates(self):
  row=copy.deepcopy(self.rows()[0]);row.update(Title='Q3 2026 Financial Results',WebCastLink='https://cdn.example.com/results.pdf')
  row['Attachments']=[{'Title':'Presentation and Q&A Transcript','Url':'https://cdn.example.com/qa.pdf'},
                      {'Title':'Presentation and Prepared Remarks','Url':'https://cdn.example.com/remarks.pdf'},
                      {'Title':'Earnings Supplement','Url':'https://cdn.example.com/supplement.pdf'},
                      {'Title':'Test Item: Presentation','Url':'https://cdn.example.com/template.pdf'},
                      {'Title':'Investor Presentation','Url':'https://cdn.example.com/deck.pdf?token=private'},
                      {'Title':'Representations and Warranties','Url':'https://cdn.example.com/terms.pdf'}]
  e=parse(self.payload([row]),self.source(),NOW)[0]
  self.assertIsNone(e['webcastUrl']);self.assertEqual(e['eventType'],'EARNINGS_SCHEDULED')
  documents=[d for d in e['sourceDocuments'] if d.get('evidence')=='Q4_EVENT_ATTACHMENT_LABEL']
  self.assertEqual([d['type'] for d in documents],['COMPANY_TRANSCRIPT','PREPARED_REMARKS','FINANCIAL_REPORT'])
  self.assertEqual(e['transcriptUrl'],'https://cdn.example.com/qa.pdf');self.assertIsNone(e['presentationUrl'])

 def test_later_q4_poll_retires_wrong_attachment_type_without_resurrecting_old_presentation_field(self):
  import tempfile
  from company_intelligence.store import Store
  row=copy.deepcopy(self.rows()[0]);row.update(Title='Q3 2026 Earnings Call',StartDate='10/23/2026 08:30:00',TimeZone='EST',WebCastLink='https://events.example.com/real-webcast')
  row['Attachments']=[{'Title':'Presentation and Q&A Transcript','Url':'https://cdn.example.com/qa.pdf'}]
  fresh=parse(self.payload([row]),self.source(),NOW)[0]
  old={**fresh,'sourceDocuments':[{'type':'PRESENTATION','url':'https://cdn.example.com/qa.pdf','label':'Presentation and Q&A Transcript','evidence':'Q4_EVENT_ATTACHMENT_LABEL'}], 'presentationUrl':'https://cdn.example.com/qa.pdf','transcriptUrl':None}
  with tempfile.TemporaryDirectory() as temp:
   store=Store(Path(temp)/'state.sqlite')
   # Insert the original legacy record, bypassing today's correction as a real
   # restored checkpoint would. The next poll must clean both merged fields.
   store.db.execute('INSERT INTO events VALUES(?,?,?,?,?)',(old['eventId'],old['companyId'],old['eventType'],old['date'],json.dumps(old)));store.db.commit()
   store.event(fresh,NOW)
   saved=json.loads(store.db.execute('SELECT payload FROM events').fetchone()[0])
   self.assertFalse(saved.get('presentationUrl'));self.assertEqual(saved['transcriptUrl'],'https://cdn.example.com/qa.pdf')
   self.assertEqual([d['type'] for d in saved['sourceDocuments'] if d['url'].endswith('qa.pdf')],['COMPANY_TRANSCRIPT'])
   self.assertEqual(saved['webcastUrl'],'https://events.example.com/real-webcast');store.close()

 def test_explicit_short_quarter_results_convert_to_confirmed_events_without_inference(self):
  from company_intelligence.model import issuer_earnings_announcement
  from test_engine import company
  from company_intelligence.ir_events import event_type
  issuer=company('Example Holdings Inc.','EXMP')
  for title in ['Q3 2026 Results','2026 Q3 Results','Q3 FY26 Results']:
   row={**self.rows()[0],'Title':title,'StartDate':'10/28/2026 08:30:00','TimeZone':'ET','WebCastLink':''}
   e=parse(self.payload([row]),self.source(),NOW)[0]
   self.assertEqual(e['eventType'],'EARNINGS_SCHEDULED');self.assertEqual(e['confirmationStatus'],'CONFIRMED')
   self.assertEqual(e['date'],'2026-10-28');self.assertTrue(issuer_earnings_announcement(e['headline'],issuer))
   self.assertEqual((e['fiscalQuarter'],e['fiscalYear']),('Q3',2026))
  self.assertFalse(issuer_earnings_announcement('Q3 2026 Other Corporation Results',issuer))
  self.assertFalse(issuer_earnings_announcement('Q3 2026 Production Results',issuer))
  self.assertIsNone(event_type('Q3 2026 Clinical Trial Results'))
  self.assertIsNone(event_type('Q3 2026 Production Results'))
  self.assertFalse(issuer_earnings_announcement('Results',issuer))
