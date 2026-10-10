"""Publisher schedules retain useful IR events without inventing earnings calls."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import test_distributor_archive as fixture
from test_engine import company, NOW
from company_intelligence.distributor_archive import metadata
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from company_intelligence.coverage import report


class PublisherCallContextTests(unittest.TestCase):
    def ingest(self, directory, headline, clause, issuer=None):
        c = issuer or company()
        body = fixture.article(date='2026-09-30T12:00:00Z', author=c['names'][0], ticker='Nasdaq:' + c['listings'][0]['symbol'])
        body = body.replace(b'A conference call will be held on October 28, 2026 at 5:00 p.m. Eastern Time.', clause.encode())
        entry = metadata(body, fixture.URL); entry['headline'] = headline
        entry['materialLinks'] = [{'label': 'Live webcast', 'url': 'https://apple.com/investors/webcast'}]
        class HTTP:
            MAX_BYTES = 2 * 1024 * 1024
            def get(self, url, **kwargs):
                return {'body': fixture.index(), 'finalUrl': url}
        store = Store(Path(directory) / 'state.sqlite')
        pipe = Pipeline(directory, {c['companyId']: c}, store, HTTP(), NOW)
        source = {'sourceId': 'archive', 'provider': 'GLOBENEWSWIRE_ARTICLE', 'type': 'RSS',
                  'format': 'GNN_ARCHIVE', 'url': fixture.INDEX}
        with patch('company_intelligence.distributor_archive.collect', return_value=[entry]):
            pipe.ingest_source(source)
        return store, c, entry

    def test_clinical_and_strategy_calls_remain_ir_events_and_webcasts_without_earnings_confirmation(self):
        for title in ['Apple Inc. Presents Updated Clinical Trial Data', 'Apple Inc. to Host Investor Strategy Update']:
            with self.subTest(title=title), tempfile.TemporaryDirectory() as tmp:
                store, c, entry = self.ingest(tmp, title,
                    'Apple will host an investor webcast on October 28, 2026 at 5:00 p.m. Eastern Time to discuss its strategy.')
                events = [json.loads(x[0]) for x in store.db.execute('select payload from events')]
                self.assertEqual(len(events), 1); event = events[0]
                self.assertEqual(event['eventType'], 'IR_EVENT'); self.assertNotIn('Earnings', event['headline'])
                self.assertEqual(event['date'], '2026-10-28'); self.assertEqual(event['time'], '17:00')
                self.assertEqual(event['timezone'], 'America/New_York'); self.assertNotIn('fiscalQuarter', event)
                payload = store.company_payload(c, NOW)
                self.assertEqual(payload['calls'], []); self.assertEqual(payload['events'][0]['eventType'], 'IR_EVENT')
                self.assertTrue(any(x['type'] == 'WEBCAST' for x in payload['materials']))
                counts = report(store, {c['companyId']: c}, NOW)['counts']
                self.assertEqual(counts.get('confirmedUpcomingEarnings', {}).get('companies', 0), 0)
                self.assertEqual(counts.get('calls', {}).get('companies', 0), 0)
                self.assertEqual(counts['webcasts']['companies'], 1); store.close()

    def test_explicit_financial_and_period_results_calls_keep_earnings_classification_and_dates(self):
        examples = [
            ('Apple Inc. Reports Third Quarter Financial and Operating Results',
             'Apple will host a conference call on October 28, 2026 at 5:00 p.m. Eastern Time.'),
            ('Apple Inc. Announces First Quarter Fiscal Year 2027 Conference Call',
             'Apple will host a conference call on October 28, 2026 at 5:00 p.m. Eastern Time to discuss first quarter fiscal year 2027 results.'),
        ]
        examples.extend([
            ('Apple Inc. Announces Financial Results and Business Update Call',
             'Apple will release financial results on October 28, 2026. A conference call and webcast will follow at 5:00 p.m. Eastern Time the same day.'),
            ('Apple Inc. Schedules Third Quarter Earnings Release and Conference Call',
             'The Company will review these financial results via a conference call and webcast on October 28, 2026 at 5:00 p.m. Eastern Time.'),
            ('Apple Reports Third Quarter Financial Results',
             'Apple will host a conference call on October 28, 2026 at 5:00 p.m. Eastern Time.'),
        ])
        for title, clause in examples:
            with self.subTest(title=title), tempfile.TemporaryDirectory() as tmp:
                store, c, entry = self.ingest(tmp, title, clause)
                calls = store.company_payload(c, NOW)['calls']; self.assertEqual(len(calls), 1)
                self.assertEqual(calls[0]['eventType'], 'EARNINGS_CALL'); self.assertEqual(calls[0]['date'], '2026-10-28')
                self.assertEqual(calls[0]['time'], '17:00'); self.assertEqual(calls[0]['startsAt'], '2026-10-28T21:00:00Z')
                if '2027' in title:
                    self.assertEqual(calls[0]['fiscalQuarter'], 'Q1'); self.assertEqual(calls[0]['fiscalYear'], 2027)
                store.close()

    def test_short_financial_brand_stays_bound_to_legal_name_and_cannot_adopt_another_issuer(self):
        with tempfile.TemporaryDirectory() as tmp:
            issuer = company('WISeKey International Holding Ltd', 'WKEY', '0001515171')
            store, c, entry = self.ingest(tmp, 'WISeKey Reports First Half Financial Results',
                'WISeKey will host a conference call on October 28, 2026 at 5:00 p.m. Eastern Time.', issuer)
            self.assertEqual(len(store.company_payload(c, NOW)['calls']), 1); store.close()
        for issuer, title in [
            (company('MoneyHero Ltd', 'MNY', '0001974044'), 'MoneyHero Group Reports Unaudited Second Quarter 2026 Results'),
            (company('Viper Energy, Inc.', 'VNOM', '0002074176'), 'Viper Energy, Inc., a Subsidiary of Diamondback Energy, Inc., Schedules Third Quarter Conference Call'),
        ]:
            with self.subTest(title=title), tempfile.TemporaryDirectory() as tmp:
                store, c, entry = self.ingest(tmp, title,
                    'In connection with the earnings release, management will host a conference call on October 28, 2026 at 5:00 p.m. Eastern Time.', issuer)
                self.assertEqual(len(store.company_payload(c, NOW)['calls']), 1); store.close()
        with tempfile.TemporaryDirectory() as tmp:
            store, c, entry = self.ingest(tmp, 'Pear Inc. Reports Third Quarter Financial Results',
                'Pear will host a conference call on October 28, 2026 at 5:00 p.m. Eastern Time.')
            self.assertEqual(store.db.execute('select count(*) from items').fetchone()[0], 1)
            self.assertEqual(store.db.execute('select count(*) from events').fetchone()[0], 0); store.close()

    def test_joint_release_cannot_attribute_another_company_host_call_to_the_publisher_author(self):
        with tempfile.TemporaryDirectory() as tmp:
            store, c, entry = self.ingest(tmp, 'Pear Inc. and Apple Inc. Announce Merger Agreement',
                'Pear will host a conference call on October 28, 2026 at 5:00 p.m. Eastern Time to discuss the transaction.')
            self.assertTrue(entry['callEvidence'])
            self.assertEqual(store.db.execute('select count(*) from items').fetchone()[0], 1)
            self.assertEqual(store.db.execute('select count(*) from events').fetchone()[0], 0)
            self.assertEqual(store.company_payload(c, NOW)['calls'], []); store.close()

    def test_replay_deadline_is_not_a_live_call_schedule_or_calendar_confirmation(self):
        with tempfile.TemporaryDirectory() as tmp:
            store, c, entry = self.ingest(tmp, 'Apple Inc. Announces Dial-In Details for Investor Update',
                'For individuals unable to join the conference call, a replay will be available through October 28, 2026. Participants must use an access code.')
            self.assertEqual(entry['callEvidence'], '')
            self.assertEqual(store.db.execute('select count(*) from events').fetchone()[0], 0)
            self.assertEqual(store.company_payload(c, NOW)['calls'], []); store.close()


if __name__ == '__main__':
    unittest.main()
