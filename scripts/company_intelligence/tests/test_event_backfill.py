"""Unpolled structured events must become owned calls, without polling other families."""
import contextlib
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from test_engine import company, NOW
from test_news_backfill import Response
from company_intelligence.event_backfill import backfill
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from company_intelligence.transport import PublicHTTP
from company_intelligence.checkpoint import pack, restore
from company_intelligence.source_backfill_runner import drive


class EventBackfillTests(unittest.TestCase):
    def setup(self, state):
        a = company(); b = company('Root, Inc.', 'ROOT', '0001788882'); b['officialSites'] = ['https://root.example/']
        store = Store(state / 'state.sqlite')
        for sid, c in [('a', a), ('b', b)]:
            store.source({'sourceId': sid, 'companyId': c['companyId'], 'type': 'IR_EVENTS',
                'provider': 'Q4', 'format': 'Q4_EVENTS', 'verified': True, 'active': True,
                'url': c['officialSites'][0] + 'feed/Event.svc/GetEventList?LanguageId=1',
                'allowedSites': c['officialSites'], 'intervalHours': 12})
        return store, {a['companyId']: a, b['companyId']: b}

    def http(self, state, budget=100, fail=False):
        calls = []
        def opener(req, **kwargs):
            calls.append(req.full_url)
            if fail:
                raise urllib.error.HTTPError(req.full_url, 503, 'Unavailable', {},
                    io.BytesIO(b'upstream connect error or disconnect/reset before headers'))
            if req.full_url.endswith('/robots.txt'):
                return Response(b'User-agent: *\nAllow: /\n', 'text/plain')
            base = 'https://root.example/' if 'root.example' in req.full_url else 'https://apple.com/'
            row = {'EventId': 'quarter-2026-q4', 'Title': 'Q4 2026 Earnings Conference Call', 'StartDate': '10/23/2026 08:30:00',
                   'TimeZone': 'ET', 'LinkToDetailPage': base + 'events/q4',
                   'WebCastLink': 'https://events.q4inc.com/attendee/123',
                   'Attachments': [{'Title': 'Investor Presentation', 'Url': base + 'presentation.pdf'}]}
            return Response(json.dumps({'GetEventListResult': [row]}).encode(), 'application/json')
        return PublicHTTP(state / 'http', budget=budget, interval=0, sleep=lambda _: None,
                          opener=opener, validator=lambda url: url), calls

    def test_real_q4_calls_dates_webcasts_materials_and_frozen_restore(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'; store, companies = self.setup(state)
            http, calls = self.http(state)
            first = backfill(Pipeline(tmp, companies, store, http, NOW), 1, 'events')
            self.assertEqual(first['attemptedSourceIds'], ['a'])
            for key in ('recoveredCallIssuers', 'recoveredDatedCallIssuers', 'recoveredWebcastIssuers',
                        'recoveredPresentationIssuers', 'recoveredConfirmedEarningsIssuers'):
                self.assertEqual(first[key], [company()['companyId']], key)
            event = json.loads(store.db.execute('select payload from events where kind=?', ('EARNINGS_CALL',)).fetchone()[0])
            self.assertEqual(event['startsAt'], '2026-10-23T12:30:00Z')
            pack(state, Path(tmp) / 'saved.tar.gz'); store.close()
            fresh = Path(tmp) / 'restored'; restore(Path(tmp) / 'saved.tar.gz', fresh)
            store = Store(fresh / 'state.sqlite')
            original = next(s for s in store.sources() if s['sourceId'] == 'b')
            store.source({**original, 'sourceId': 'later', 'url': 'https://root.example/new-events'})
            http, calls = self.http(fresh)
            second = backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'events')
            self.assertEqual(second['attemptedSourceIds'], ['b'])
            self.assertEqual(second['recoveredCallIssuers'], ['iss_cik_0001788882'])
            self.assertFalse(any('new-events' in url for url in calls))
            http, calls = self.http(fresh)
            self.assertEqual(backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'events')['stopReason'], 'NO_DUE_SOURCES')
            self.assertEqual(calls, []); store.close()

    def test_budget_leaves_unsent_source_health_unchanged_and_identity_change_withheld(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp); store, companies = self.setup(state); http, calls = self.http(state, budget=2)
            first = backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'budget')
            self.assertEqual(first['stopReason'], 'BUDGET_DEFERRED')
            b = next(s for s in store.sources() if s['sourceId'] == 'b'); self.assertNotIn('lastChecked', b)
            self.assertIsNone(store.state('eventSourceBackfill:budget:b'))
            store.source({**b, 'url': 'https://wrong.example/events'})
            http, calls = self.http(state); second = backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'budget')
            self.assertEqual(calls, []); self.assertEqual(second['attemptedSources'], 0)
            self.assertEqual(store.state('eventSourceBackfill:budget:b')['status'], 'SOURCE_IDENTITY_CHANGED')
            store.close()

    def test_cooldowns_disabled_unverified_and_restored_scope_are_protected(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp); store, companies = self.setup(state)
            a = next(s for s in store.sources() if s['sourceId'] == 'a')
            b = next(s for s in store.sources() if s['sourceId'] == 'b')
            store.source({**a, 'failureCount': 3, 'nextCheck': '2099-01-01T00:00:00Z', 'lastError': 'HTTP_401'})
            store.source({**b, 'active': False}); store.source({**a, 'sourceId': 'unproven', 'verified': False})
            before = store.sources(); http, calls = self.http(state)
            result = backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'scope', {a['companyId']})
            self.assertEqual(result['stopReason'], 'NO_DUE_SOURCES'); self.assertEqual(calls, [])
            self.assertEqual(store.sources(), before)
            with self.assertRaisesRegex(ValueError, 'SCOPE_CHANGED'):
                backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'scope')
            store.close()

    def test_shared_failure_checkpoints_circuit_without_invalidating_company(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'; store = Store(state / 'state.sqlite'); c = company()
            for i in range(6):
                base = 'https://host' + str(i) + '.example/'
                store.source({'sourceId': str(i), 'companyId': c['companyId'], 'type': 'IR_EVENTS',
                    'format': 'Q4_EVENTS', 'verified': True, 'allowedSites': [base], 'url': base + 'events'})
            store.set_state('officialSite:' + c['companyId'], {'status': 'VALIDATED', 'url': 'https://apple.com/'})
            http, calls = self.http(state, fail=True)
            result = backfill(Pipeline(tmp, {c['companyId']: c}, store, http, NOW), 10, 'circuit')
            self.assertEqual(result['stopReason'], 'CIRCUIT_OPEN')
            self.assertFalse(any('host4.' in url for url in calls))
            self.assertEqual(store.state('officialSite:' + c['companyId'])['status'], 'VALIDATED')
            pack(state, Path(tmp) / 'saved.tar.gz'); store.close()
            fresh = Path(tmp) / 'restore'; restore(Path(tmp) / 'saved.tar.gz', fresh); store = Store(fresh / 'state.sqlite')
            http, calls = self.http(fresh)
            self.assertEqual(backfill(Pipeline(tmp, {c['companyId']: c}, store, http, NOW), 10, 'circuit')['stopReason'], 'CIRCUIT_COOLDOWN')
            self.assertEqual(calls, []); store.close()

    def test_cli_only_events_without_global_news_financial_projection_or_export(self):
        from company_intelligence.cli import main
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); state = root / '.company-intelligence'; store, companies = self.setup(state); store.close()
            config = root / 'company-intelligence/config'; config.mkdir(parents=True)
            (config / 'official-sites.json').write_text('{}')
            (config / 'sources.json').write_text(json.dumps([{'sourceId': 'global', 'type': 'RSS', 'url': 'https://global.example/news'}]))
            http, calls = self.http(state); output = io.StringIO()
            with patch('company_intelligence.cli.load_universe', return_value=companies), patch('company_intelligence.cli.PublicHTTP', return_value=http), contextlib.redirect_stdout(output):
                self.assertEqual(main(['events-backfill', '--root', tmp, '--state', str(state), '--network', '--source-backfill-run', 'cli-events']), 0)
            result = json.loads(output.getvalue()); self.assertEqual(result['attemptedSources'], 2)
            self.assertFalse(any('global.example' in url for url in calls)); self.assertFalse((state / 'public').exists())
            store = Store(state / 'state.sqlite')
            for cid in companies:
                self.assertIsNone(store.state('financial:' + cid)); self.assertIsNone(store.state('sec:' + cid))
            store.close()
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                main(['events-backfill', '--root', tmp, '--state', str(state)])

    def test_empty_frozen_cohort_finishes_and_restores_without_absorbing_later_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'; store, companies = self.setup(state)
            for source in store.sources():
                store.source({**source, 'lastSuccess': NOW, 'nextCheck': '2099-01-01T00:00:00Z'})
            before = store.sources(); http, calls = self.http(state)
            first = backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'empty')
            self.assertEqual(first['stopReason'], 'NO_DUE_SOURCES')
            self.assertEqual(first['frozenSources'], 0)
            self.assertEqual(first['attemptedSources'], 0)
            self.assertEqual(first['requests'], 0)
            self.assertEqual(first['recoveredCallIssuers'], [])
            self.assertEqual(first['recoveredConfirmedEarningsIssuers'], [])
            self.assertEqual(calls, []); self.assertEqual(store.sources(), before)
            pack(state, Path(tmp) / 'saved.tar.gz'); store.close()
            fresh = Path(tmp) / 'restore'; restore(Path(tmp) / 'saved.tar.gz', fresh)
            store = Store(fresh / 'state.sqlite')
            source = next(s for s in store.sources() if s['sourceId'] == 'b')
            store.source({k: v for k, v in {**source, 'sourceId': 'later',
                'url': 'https://root.example/later-events'}.items() if k not in ('lastSuccess', 'nextCheck')})
            before = store.sources(); http, calls = self.http(fresh)
            second = backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'empty')
            self.assertEqual(second['stopReason'], 'NO_DUE_SOURCES')
            self.assertEqual(second['frozenSources'], 0)
            self.assertEqual(calls, []); self.assertEqual(store.sources(), before)
            third = backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'later')
            self.assertEqual(third['attemptedSourceIds'], ['later'])
            self.assertEqual(third['recoveredCallIssuers'], ['iss_cik_0001788882'])
            store.close()

    def test_runner_restores_event_accounting_without_forced_sources(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            state = Path(tmp) / 'state'; Store(state / 'state.sqlite').close(); calls = []
            def execute(command, **kwargs):
                calls.append(command)
                return SimpleNamespace(returncode=0, stdout=json.dumps({'requests': 2, 'attemptedSources': 1,
                    'stopReason': 'NO_DUE_SOURCES', 'recoveredCallIssuers': ['issuer'],
                    'recoveredPresentationIssuers': ['issuer'], 'httpStats': {'bytesDownloaded': 200}}))
            drive(tmp, state, 'events', lane='events', execute=execute)
            self.assertEqual(calls[0][3], 'events-backfill'); self.assertIn('--source-backfill-run', calls[0])
            self.assertNotIn('--force-sources', calls[0])
            fresh = Path(tmp) / 'restore'; restore(state / 'checkpoints/events-events.tar.gz', fresh)
            store = Store(fresh / 'state.sqlite'); v = store.state('sourceBackfillRunner:events:events')
            self.assertEqual(v['recoveredCallIssuers'], ['issuer']); self.assertEqual(v['attemptedSources'], 1)
            self.assertEqual(v['requests'], 2); store.close()


if __name__ == '__main__':
    unittest.main()
