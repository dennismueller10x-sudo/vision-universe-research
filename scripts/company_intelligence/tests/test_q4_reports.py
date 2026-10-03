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
