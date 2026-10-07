import unittest
from company_intelligence.ir_events import from_announcement
from test_engine import source,NOW

class DatelineTests(unittest.TestCase):
 def item(self,text):
  return {'headline':'Apple to Webcast Investor Conferences in June','url':'https://apple.com/news/conferences','publishedAt':'2026-05-27T12:00:00Z','evidenceText':text}
 def test_provider_before_date_is_publication_not_an_investor_schedule(self):
  i=self.item('CUPERTINO --(BUSINESS WIRE)--May 27, 2026-- Apple Inc. announced management will participate in conferences in June.')
  self.assertEqual(from_announcement(i,source(),NOW),[])
 def test_real_schedule_survives_provider_dateline_and_same_day_events_remain_valid(self):
  for day,expected in [('June 3, 2026','2026-06-03'),('May 27, 2026','2026-05-27')]:
   i=self.item('CUPERTINO --(BUSINESS WIRE)--May 27, 2026-- Apple will participate in an investor conference on '+day+' at 2:00 p.m. Eastern Time.')
   e=from_announcement(i,source(),NOW)[0]
   self.assertEqual(e['date'],expected);self.assertEqual(e['eventType'],'IR_EVENT');self.assertEqual(e['time'],'14:00')
 def test_headline_schedule_near_a_later_wire_label_is_not_a_dateline(self):
  i=self.item('CUPERTINO --(BUSINESS WIRE)--May 27, 2026-- Apple will participate at the conference.')
  i['headline']='Apple to Present at Investor Conference on June 3, 2026'
  self.assertEqual(from_announcement(i,source(),NOW)[0]['date'],'2026-06-03')
