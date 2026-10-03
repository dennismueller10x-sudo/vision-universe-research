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
