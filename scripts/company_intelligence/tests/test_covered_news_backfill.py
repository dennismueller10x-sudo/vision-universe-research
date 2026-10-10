"""Recover owned feeds without letting publisher coverage suppress first-party news."""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import test_news_backfill as fixtures
from test_engine import company, source, NOW
from company_intelligence.model import make_item
from company_intelligence.store import Store
from company_intelligence.pipeline import Pipeline
from company_intelligence.news_backfill import backfill
from company_intelligence.checkpoint import pack, restore
from company_intelligence.source_backfill_runner import drive


class CoveredNewsBackfillTests(unittest.TestCase):
    def covered(self, store, companies):
        for cid, c in companies.items():
            url = c['officialSites'][0] + 'older-publisher-story'
            old = make_item({'headline': c['names'][0] + ' announces annual business update',
                             'url': url, 'publishedAt': '2026-09-28T12:00:00Z'},
                            source(c, 'RSS', url),
                            {'companyId': cid, 'confidence': 1, 'evidence': ['EXACT_MASTER_CONTRIBUTOR']}, NOW)
            store.ingest(old)

    def test_explicit_mode_adds_owned_news_to_covered_issuers_and_resumes_frozen_restore(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'; helper = fixtures.NewsBackfillTests()
            store, companies = helper.setup_sources(state); self.covered(store, companies)
            http, calls = helper.http(state)
            default = backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'default')
            self.assertEqual(default['frozenSources'], 0); self.assertEqual(calls, [])
            http, calls = helper.http(state)
            first = backfill(Pipeline(tmp, companies, store, http, NOW), 1, 'covered', include_covered=True)
            self.assertEqual(first['attemptedSourceIds'], ['a']); self.assertEqual(first['run']['new'], 1)
            self.assertEqual(first['recoveredNewsIssuers'], [])
            self.assertEqual(store.db.execute('select count(*) from items').fetchone()[0], 3)
            pack(state, Path(tmp) / 'saved.tar.gz'); store.close()
            fresh = Path(tmp) / 'restore'; restore(Path(tmp) / 'saved.tar.gz', fresh)
            store = Store(fresh / 'state.sqlite')
            store.source({'sourceId': 'later', 'companyId': company()['companyId'], 'type': 'IR_FEED',
                          'verified': True, 'url': 'https://apple.com/later.xml', 'allowedSites': ['https://apple.com/']})
            http, calls = helper.http(fresh)
            with self.assertRaisesRegex(ValueError, 'COVERAGE_MODE_CHANGED'):
                backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'covered')
            self.assertEqual(calls, [])
            second = backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'covered', include_covered=True)
            self.assertEqual(second['attemptedSourceIds'], ['b']); self.assertEqual(second['run']['new'], 1)
            self.assertEqual(second['recoveredNewsIssuers'], [])
            self.assertFalse(any('later.xml' in u for u in calls))
            self.assertEqual(len(store.state('newsSourceBackfill:covered:inventory')), 2)
            http, calls = helper.http(fresh)
            self.assertEqual(backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'covered', include_covered=True)['stopReason'], 'NO_DUE_SOURCES')
            self.assertEqual(calls, []); store.close()

    def test_covered_mode_preserves_source_cooldowns_and_withholds_unverified_disabled_feeds(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp); helper = fixtures.NewsBackfillTests()
            store, companies = helper.setup_sources(state); self.covered(store, companies)
            a = next(s for s in store.sources() if s['sourceId'] == 'a')
            b = next(s for s in store.sources() if s['sourceId'] == 'b')
            store.source({**a, 'failureCount': 3, 'nextCheck': '2099-01-01T00:00:00Z', 'lastError': 'HTTP_401'})
            store.source({**b, 'active': False})
            store.source({**a, 'sourceId': 'unproven', 'verified': False, 'failureCount': 0})
            before = store.sources(); http, calls = helper.http(state)
            result = backfill(Pipeline(tmp, companies, store, http, NOW), 10, 'covered', include_covered=True)
            self.assertEqual(result['stopReason'], 'NO_DUE_SOURCES'); self.assertEqual(calls, [])
            self.assertEqual(store.sources(), before); self.assertEqual(result['frozenSources'], 1)
            store.close()

    def test_runner_mode_is_explicit_and_cannot_change_after_restore(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            state = Path(tmp) / 'state'; Store(state / 'state.sqlite').close(); calls = []
            def execute(command, **kwargs):
                calls.append(command)
                return SimpleNamespace(returncode=0, stdout=json.dumps({'requests': 2, 'attemptedSources': 1,
                    'stopReason': 'NO_DUE_SOURCES', 'run': {'new': 1}, 'httpStats': {'bytesDownloaded': 200}}))
            drive(tmp, state, 'covered', lane='news', news_include_covered=True, execute=execute)
            self.assertIn('--news-backfill-include-covered', calls[0]); self.assertNotIn('--force-sources', calls[0])
            fresh = Path(tmp) / 'restore'; restore(state / 'checkpoints/covered-news.tar.gz', fresh)
            with self.assertRaisesRegex(ValueError, 'COVERAGE_MODE_CHANGED'):
                drive(tmp, fresh, 'covered', lane='news', execute=execute)
            self.assertEqual(len(calls), 1)
            with self.assertRaisesRegex(ValueError, 'INVALID_NEWS_BACKFILL_COVERAGE_MODE'):
                drive(tmp, fresh, 'materials', news_include_covered=True, execute=execute)
            self.assertEqual(len(calls), 1)
            store = Store(fresh / 'state.sqlite'); self.assertTrue(store.state('sourceBackfillRunner:covered:news')['newsIncludeCovered']); store.close()

    def test_cli_opt_in_recovers_owned_news_without_global_poll_or_financial_export(self):
        from company_intelligence.cli import main
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); state = root / '.company-intelligence'; helper = fixtures.NewsBackfillTests()
            store, companies = helper.setup_sources(state); self.covered(store, companies); store.close()
            config = root / 'company-intelligence/config'; config.mkdir(parents=True)
            (config / 'official-sites.json').write_text('{}')
            (config / 'sources.json').write_text(json.dumps([{'sourceId': 'global', 'type': 'RSS', 'url': 'https://global.example/feed'}]))
            http, calls = helper.http(state); output = io.StringIO()
            with patch('company_intelligence.cli.load_universe', return_value=companies), patch('company_intelligence.cli.PublicHTTP', return_value=http), contextlib.redirect_stdout(output):
                self.assertEqual(main(['news-backfill', '--root', tmp, '--state', str(state), '--network',
                    '--source-backfill-run', 'covered-cli', '--news-backfill-include-covered']), 0)
            result = json.loads(output.getvalue()); self.assertEqual(result['run']['new'], 2)
            self.assertEqual(result['recoveredNewsIssuers'], []); self.assertFalse(any('global.example' in u for u in calls))
            self.assertFalse((state / 'public').exists())
            store = Store(state / 'state.sqlite')
            for cid in companies:
                self.assertIsNone(store.state('financial:' + cid)); self.assertIsNone(store.state('sec:' + cid))
            store.close()
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                main(['poll', '--news-backfill-include-covered'])


if __name__ == '__main__':
    unittest.main()
