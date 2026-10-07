"""A larger registry must not starve a bounded pilot's owned feed sources."""
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from company_intelligence.cli import main
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from test_engine import company

ROOT = Path(__file__).resolve().parents[3]


class PollScopeTests(unittest.TestCase):
    def universe(self):
        a = company()
        b = company('Microsoft Corporation', 'MSFT', '0000789019')
        return a, b, {c['companyId']: c for c in (a, b)}

    def test_explicit_poll_tickers_fetch_owned_and_global_without_financial_projection(self):
        a, b, companies = self.universe()
        with tempfile.TemporaryDirectory() as tmp:
            with patch('company_intelligence.cli.load_universe', return_value=companies), patch.object(Pipeline, 'ingest_source') as ingest, patch.object(Pipeline, 'project_company') as project, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(['poll', '--root', str(ROOT), '--state', tmp, '--network', '--tickers', 'AAPL']), 0)
            owned = {call.args[0].get('companyId') for call in ingest.call_args_list}
            self.assertIn(a['companyId'], owned)
            self.assertIn(None, owned)
            self.assertNotIn(b['companyId'], owned)
            project.assert_not_called()

    def test_sec_stream_source_scope_keeps_global_pending_work_and_checks_quiet_cohort(self):
        a, b, companies = self.universe()
        def scan(store, *_):
            store.set_state('secStreamPending', {b['companyId']: {'filedAt': '2026-10-02', 'latestAccession': '0000789019-26-000001'}})
            return {'unresolvedIndexDays': []}
        with tempfile.TemporaryDirectory() as tmp:
            with patch('company_intelligence.cli.load_universe', return_value=companies), patch('company_intelligence.sec_stream.scan', side_effect=scan), patch.object(Pipeline, 'sec_client'), patch.object(Pipeline, 'project_company') as project, patch.object(Pipeline, 'ingest_source') as ingest, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(['sec-stream', '--root', str(ROOT), '--state', tmp, '--network', '--sec-fetch', '--source-tickers', 'AAPL', '--limit', '10', '--request-budget', '100']), 0)
            self.assertEqual(project.call_args_list[0].args[0]['companyId'], b['companyId'])
            owned = {call.args[0].get('companyId') for call in ingest.call_args_list}
            self.assertIn(a['companyId'], owned)
            self.assertIn(None, owned)
            self.assertNotIn(b['companyId'], owned)

    def test_unknown_source_ticker_fails_before_state_or_requests(self):
        _, _, companies = self.universe()
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'missing'
            with patch('company_intelligence.cli.load_universe', return_value=companies), patch.object(Pipeline, 'ingest_source') as ingest:
                with self.assertRaisesRegex(ValueError, 'TICKERS_NOT_IN_SUPPORTED_UNIVERSE'):
                    main(['poll', '--root', str(ROOT), '--state', str(state), '--network', '--source-tickers', 'UNKNOWN'])
            self.assertFalse(state.exists())
            ingest.assert_not_called()

    def test_changed_pilot_issuer_precedes_older_unrelated_pending_work(self):
        a, b, companies = self.universe()
        def scan(store, *_):
            store.set_state('secStreamPending', {
                a['companyId']: {'filedAt': '2026-10-02', 'latestAccession': '0000320193-26-000001'},
                b['companyId']: {'filedAt': '2026-09-20', 'latestAccession': '0000789019-26-000001'}})
            return {'unresolvedIndexDays': []}
        with tempfile.TemporaryDirectory() as tmp:
            with patch('company_intelligence.cli.load_universe', return_value=companies), patch('company_intelligence.sec_stream.scan', side_effect=scan), patch.object(Pipeline, 'sec_client'), patch.object(Pipeline, 'project_company') as project, patch.object(Pipeline, 'ingest_source'), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(['sec-stream', '--root', str(ROOT), '--state', tmp, '--network', '--sec-fetch', '--source-tickers', 'AAPL', '--limit', '1', '--request-budget', '20']), 0)
            self.assertEqual([call.args[0]['companyId'] for call in project.call_args_list], [a['companyId']])
            store = Store(Path(tmp) / 'state.sqlite')
            self.assertIn(b['companyId'], store.state('secStreamPending'))
            store.close()
