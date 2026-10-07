import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from company_intelligence.transport import BudgetExhausted
from test_engine import company, source, NOW


class IngestionCalendarTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.store = Store(self.root / 'state.sqlite')
        self.issuer = company()
        self.other = company('Microsoft Corporation', 'MSFT', '0000789019')
        for issuer in (self.issuer, self.other):
            self.store.event({'eventId': issuer['companyId'] + '-estimate',
                              'companyId': issuer['companyId'], 'eventType': 'EARNINGS_ESTIMATED',
                              'date': '2026-10-08', 'dateStart': '2026-10-01',
                              'dateEnd': '2026-10-14', 'confirmationStatus': 'ESTIMATED'}, NOW)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def pipeline(self, body):
        class HTTP:
            def get(self, url, **kwargs):
                return {'body': body, 'finalUrl': url}
        return Pipeline(self.root, {c['companyId']: c for c in (self.issuer, self.other)},
                        self.store, HTTP(), NOW)

    def assert_reconciled(self):
        calls = [json.loads(r[0]) for r in self.store.db.execute("SELECT payload FROM events WHERE kind='EARNINGS_CALL'")]
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]['confirmationHistory'][0]['previousEventId'], self.issuer['companyId'] + '-estimate')
        self.assertEqual({r[0] for r in self.store.db.execute("SELECT company FROM events WHERE kind='EARNINGS_ESTIMATED'")}, {self.other['companyId']})
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM audit WHERE json_extract(payload,'$.code')='ESTIMATE_CONFIRMED'").fetchone()[0], 1)

    def test_source_only_event_poll_retires_estimate_and_preserves_other_issuer(self):
        body = b'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:apple-call\nDTSTART:20261008T120000Z\nSUMMARY:Apple Inc. Earnings Call\nURL:https://apple.com/event\nEND:VEVENT\nEND:VCALENDAR'
        pipe = self.pipeline(body)
        configured = {**source(), 'type': 'IR_EVENTS', 'verified': True}
        pipe.ingest_source(configured)
        self.assert_reconciled()
        # Replaying the source retains the transition without duplicating it.
        self.pipeline(body).ingest_source(configured)
        self.assert_reconciled()

    def test_first_party_announcement_reconciles_even_after_partial_budget_failure(self):
        entry = {'headline': 'Apple Inc. to Host Earnings Conference Call on October 8, 2026',
                 'url': 'https://apple.com/event', 'publishedAt': '2026-10-01T12:00:00Z',
                 'evidenceText': 'Apple Inc. will host its earnings conference call on October 8, 2026 at 12:00 PM UTC.'}
        def partial_entries(*args):
            yield entry
            raise BudgetExhausted('TEST_PARTIAL_BATCH')
        pipe = self.pipeline(b'feed')
        with patch('company_intelligence.pipeline.parse_feed', side_effect=partial_entries):
            with self.assertRaisesRegex(BudgetExhausted, 'TEST_PARTIAL_BATCH'):
                pipe.ingest_source(source())
        self.assert_reconciled()

    def test_wrong_issuer_event_and_marketing_news_do_not_refresh_calendar(self):
        body = b'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261008T120000Z\nSUMMARY:Microsoft Corporation Earnings Call\nURL:https://apple.com/event\nEND:VEVENT\nEND:VCALENDAR'
        pipe = self.pipeline(body)
        with patch.object(pipe, 'refresh_estimates') as refresh:
            pipe.ingest_source({**source(), 'type': 'IR_EVENTS', 'verified': True})
            refresh.assert_not_called()
        news = b'<rss><channel><item><title>Apple Inc. announces a new product</title><link>https://apple.com/product</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>'
        pipe = self.pipeline(news)
        with patch.object(pipe, 'refresh_estimates') as refresh:
            pipe.ingest_source(source())
            refresh.assert_not_called()
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM events WHERE kind='EARNINGS_ESTIMATED'").fetchone()[0], 2)

    def test_results_release_reconciles_only_issuer_with_financial_evidence(self):
        entry = {'headline': 'Apple Inc. Reports Third Quarter 2026 Financial Results',
                 'url': 'https://apple.com/results', 'publishedAt': '2026-10-01T12:00:00Z',
                 'evidenceText': 'Apple Inc. reported revenue of $10 billion and diluted earnings per share of $2.00.'}
        pipe = self.pipeline(b'feed')
        with patch('company_intelligence.pipeline.parse_feed', return_value=[entry]):
            pipe.ingest_source(source())
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM events WHERE kind='EARNINGS_PUBLISHED'").fetchone()[0], 1)
        self.assertEqual({r[0] for r in self.store.db.execute("SELECT company FROM events WHERE kind='EARNINGS_ESTIMATED'")}, {self.other['companyId']})
        self.assertTrue(self.store.state('calendarModel:' + self.issuer['companyId']))

    def test_short_quarter_results_poll_reclassifies_existing_event_and_reconciles_once(self):
        from company_intelligence.q4_events import parse
        row={'EventId':123,'Title':'Q3 2026 Results Conference Call','LinkToDetailPage':'https://apple.com/events/q3',
             'StartDate':'10/08/2026 08:30:00','TimeZone':'ET','WebCastLink':'','Attachments':[]}
        configured={**source(),'type':'IR_EVENTS','format':'Q4_EVENTS','provider':'Q4','verified':True,'allowedSites':['https://apple.com/']}
        body=json.dumps({'GetEventListResult':[row]}).encode()
        value=parse(body,configured,NOW)[0]
        self.store.event({**value,'eventType':'IR_EVENT'},NOW)
        self.pipeline(body).ingest_source(configured)
        self.assert_reconciled()
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM events WHERE id=?",(value['eventId'],)).fetchone()[0],1)
        self.pipeline(body).ingest_source(configured)
        self.assert_reconciled()
