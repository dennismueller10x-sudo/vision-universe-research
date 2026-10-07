import json,tempfile,unittest
from pathlib import Path
from company_intelligence.stockpr_events import parse
from company_intelligence.model import issuer_earnings_announcement

NOW='2026-10-05T12:00:00Z'
SOURCE={'companyId':'issuer','sourceId':'stockpr','provider':'STOCKPR','verified':True,'url':'https://ir.example.com/news-events','allowedSites':['https://ir.example.com/']}
def card(day='2026-08-06T08:30:00',visible='Aug 6, 2026 8:30 am EDT',title='Q2 2026 Earnings Results Call',link='/news-events/ir-calendar/detail/q2',extra=''):
 return f'<article class="media"><div class="media-body"><div class="date"><time datetime="{day}">{visible}</time></div><h2 class="media-heading"><a href="{link}">{title}</a></h2>{extra}</div></article>'

class StockPREventTests(unittest.TestCase):
 def test_observed_card_dates_stay_separate_and_machine_clock_agrees(self):
  rows=parse((card()+card('2026-05-07T08:30:00','May 7, 2026 8:30 am EDT','Q1 2026 Earnings Call',link='/news-events/ir-calendar/detail/q1')).encode(),SOURCE,NOW)
  self.assertEqual([r['date'] for r in rows],['2026-08-06','2026-05-07']);self.assertEqual(rows[0]['startsAt'],'2026-08-06T12:30:00Z');self.assertEqual(rows[0]['confirmationEvidence'],'VALIDATED_STOCKPR_EVENT_CARD_EXPLICIT_TIME_ELEMENT')
 def test_publication_cards_and_foreign_event_hosts_are_not_calls(self):
  for link in ('/news-events/press-releases/detail/q2','https://wrong.example/ir-calendar/detail/q2'):
   self.assertEqual(parse(card(link=link).encode(),SOURCE,NOW),[])
  for changes in ({'verified':False},{'provider':'GENERIC'}):self.assertEqual(parse(card().encode(),{**SOURCE,**changes},NOW),[])
 def test_conflicting_day_clock_offset_and_ambiguous_dates_are_rejected(self):
  for day,text in [('2026-08-07T08:30:00','Aug 6, 2026 8:30 am EDT'),('2026-08-06T09:30:00','Aug 6, 2026 8:30 am EDT'),('2026-08-06T08:30:00Z','Aug 6, 2026 8:30 am EDT'),('2026-19-06','Aug 6, 2026'),('2026-08-06','08/06/2026')]:self.assertEqual(parse(card(day,text).encode(),SOURCE,NOW),[],(day,text))
  self.assertEqual(parse(card('2026-08-06T12:30:00Z').encode(),SOURCE,NOW)[0]['startsAt'],'2026-08-06T12:30:00Z')
 def test_missing_timezone_keeps_date_without_assuming_machine_timezone(self):
  row=parse(card(visible='Aug 6, 2026 8:30 am').encode(),SOURCE,NOW)[0]
  self.assertEqual(row['date'],'2026-08-06');self.assertIsNone(row['startsAt']);self.assertIsNone(row['timezone']);self.assertIsNone(row['time'])
 def test_nested_pdf_and_real_webcast_remain_distinct(self):
  links='<div><a href="/static-files/deck" type="application/pdf">Webcast.pdf View Presentation</a></div><a href="https://events.q4inc.com/real">Listen to webcast</a>'
  row=parse(card(extra=links).encode(),SOURCE,NOW)[0];self.assertEqual(row['presentationUrl'],'https://ir.example.com/static-files/deck');self.assertEqual(row['webcastUrl'],'https://events.q4inc.com/real')
 def test_card_bounds_multiple_time_elements_and_clinical_titles(self):
  for html in (card(extra='<time datetime="2026-09-01">Sep 1, 2026</time>'),card(extra='x'*65537),card(title='Phase 3 Clinical Results'),card().replace('class="media"','class="unrelated"')):self.assertEqual(parse(html.encode(),SOURCE,NOW),[])
  self.assertLessEqual(len(parse(''.join(card(link='/ir-calendar/detail/'+str(n)) for n in range(105)).encode(),SOURCE,NOW)),100)
 def test_existing_issuer_actor_guard_remains_required(self):
  row=parse(card(title='Other Corporation Earnings Conference Call').encode(),SOURCE,NOW)[0]
  self.assertFalse(issuer_earnings_announcement(row['headline'],{'names':['Example Corporation']}));self.assertTrue(issuer_earnings_announcement('Q2 2026 Earnings Results Call',{'names':['Example Corporation']}))

 def test_discovery_creates_a_pollable_source_from_the_advertised_event_page(self):
  from company_intelligence.feeds import discover_ir
  root='https://ir.example.com/'
  class HTTP:
   def get(self,url,**kwargs):
    body=(card() if url.endswith('/events') else '<link href="/ir.stockpr.css"><a href="/events">Events</a>').encode()
    return {'body':body,'finalUrl':url,'contentType':'text/html'}
  company={'companyId':'issuer','names':['Example Corporation'],'officialSites':[root]}
  sources,configs=discover_ir(company,root,HTTP(),NOW)
  events=[r for r in sources if r['type']=='IR_EVENTS']
  self.assertEqual(len(events),1);self.assertEqual(events[0]['provider'],'STOCKPR');self.assertEqual(events[0]['url'],root+'events');self.assertTrue(events[0]['verified'])
 def test_live_source_poll_preserves_wrong_actor_rejection_and_calendar_scope(self):
  from company_intelligence.pipeline import Pipeline
  from company_intelligence.store import Store
  from unittest.mock import patch
  company={'companyId':'issuer','cik':None,'names':['Example Corporation'],'officialSites':['https://ir.example.com/'],'listings':[]}
  body=(card()+card(title='Other Corporation Earnings Call',link='/ir-calendar/detail/wrong')).encode()
  class HTTP:
   def get(self,url,**kwargs):return {'body':body,'finalUrl':url}
  with tempfile.TemporaryDirectory() as tmp:
   store=Store(Path(tmp)/'state.sqlite');pipe=Pipeline(Path(tmp),{'issuer':company},store,HTTP(),NOW)
   with patch.object(pipe,'refresh_estimates') as refresh:
    pipe.ingest_source({**SOURCE,'type':'IR_EVENTS'});refresh.assert_called_once_with(company)
   events=[json.loads(r[0]) for r in store.db.execute('select payload from events')]
   self.assertEqual(len(events),1);self.assertEqual(events[0]['date'],'2026-08-06');self.assertEqual(events[0]['startsAt'],'2026-08-06T12:30:00Z')
   self.assertTrue(any(json.loads(r[0]).get('code')=='EVENT_REJECTED_WRONG_EARNINGS_ACTOR' for r in store.db.execute('select payload from audit')));store.close()

if __name__=='__main__':unittest.main()
