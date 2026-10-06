import unittest

from company_intelligence.ir_events import from_announcement


SOURCE = {'sourceId':'owned-events', 'companyId':'issuer', 'type':'IR_FEED', 'verified':True}
NOW = '2026-10-06T00:00:00Z'


class USQualifiedTimezonesTests(unittest.TestCase):
    def call(self, date, clock):
        item = {'headline':'Example Inc. will host its earnings conference call',
                'url':'https://issuer.example/news/call', 'publishedAt':'2025-11-01T00:00:00Z',
                'evidenceText':f'The Company will hold an earnings conference call on {date} at {clock}.'}
        return from_announcement(item, SOURCE, NOW)[0]

    def test_explicit_us_qualified_time_uses_date_specific_timezone(self):
        for date, label, day, start, zone in [
            ('November 12, 2025', '8:30 a.m. U.S. Eastern Time', '2025-11-12', '2025-11-12T13:30:00Z', 'America/New_York'),
            ('August 18, 2026', '8:30 a.m. U.S. Eastern Time', '2026-08-18', '2026-08-18T12:30:00Z', 'America/New_York'),
            ('August 18, 2026', '8:30 a.m. US Pacific Time', '2026-08-18', '2026-08-18T15:30:00Z', 'America/Los_Angeles'),
        ]:
            with self.subTest(label=label,date=date):
                e=self.call(date,label)
                self.assertEqual((e['date'],e['time'],e['timezone'],e['startsAt']), (day,'08:30',zone,start))

    def test_qualifier_without_supported_zone_does_not_infer_clock(self):
        for clock in ['8:30 a.m. U.S. local time', '8:30 a.m. U.S. Beijing Time', '8:30 a.m. Eastern regional time']:
            with self.subTest(clock=clock):
                e=self.call('August 18, 2026',clock)
                self.assertEqual(e['date'],'2026-08-18')
                self.assertIsNone(e['time']);self.assertIsNone(e['timezone']);self.assertIsNone(e['startsAt'])

    def test_explicit_us_abbreviation_still_requires_dst_consistency(self):
        self.assertEqual(from_announcement({'headline':'Example will host earnings call',
            'url':'https://issuer.example/call','publishedAt':'2026-07-01T00:00:00Z',
            'evidenceText':'The earnings call will take place on August 18, 2026 at 8:30 a.m. U.S. EST.'}, SOURCE, NOW), [])
