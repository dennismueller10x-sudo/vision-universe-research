import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from company_intelligence.checkpoint import restore
from company_intelligence.source_backfill_runner import drive
from company_intelligence.store import Store


class SourceBackfillRunnerTests(unittest.TestCase):
    def test_restored_low_gain_terminal_run_does_not_spend_another_batch(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            state = Path(tmp) / 'state'; store = Store(state / 'state.sqlite')
            key = 'sourceBackfillRunner:finished:publisher'
            report = {'requests': 7, 'checkpointCurrentRun': True}
            accounting = {'month': '2026-09', 'stopReason': 'NEGLIGIBLE_INCREMENTAL_ISSUER_COVERAGE',
                          'requests': 21, 'completedBatches': 3, 'lastBatch': report}
            store.set_state(key, accounting); store.close()
            from company_intelligence.checkpoint import pack
            pack(state, Path(tmp) / 'done.tar.gz')
            fresh = Path(tmp) / 'restored'; restore(Path(tmp) / 'done.tar.gz', fresh)
            calls = []
            self.assertEqual(drive(tmp, fresh, 'finished', lane='publisher', month='2026-09',
                                   execute=self.execute([], calls)), report)
            self.assertEqual(calls, [])
            store = Store(fresh / 'state.sqlite'); self.assertEqual(store.state(key), accounting); store.close()

    def execute(self, reports, calls):
        pending = iter(reports)
        def run(command, **kwargs):
            calls.append(command)
            report = next(pending)
            return SimpleNamespace(returncode=1 if report is None else 0,
                                   stdout=json.dumps(report))
        return run

    def test_local_time_limits_continue_and_restored_accounting_resumes(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            state = Path(tmp) / 'state'
            store = Store(state / 'state.sqlite')
            health = {'sourceId': 'blocked', 'url': 'https://issuer.example/materials',
                      'type': 'IR_MATERIALS', 'failureCount': 2, 'nextCheck': '2099-01-01T00:00:00Z'}
            store.source(health); store.close()
            calls = []
            drive(tmp, state, 'recovery', batches=3, execute=self.execute([
                {'requests': 4, 'derivedSources': 2, 'deferred': True, 'circuit': {'open': False},
                 'httpStats': {'bytesDownloaded': 100}, 'recoveredPresentationIssuers': ['one']},
                {'requests': 3, 'derivedSources': 1, 'deferred': True,
                 'recoveredPresentationIssuers': ['one', 'two']},
                {'requests': 0, 'derivedSources': 0, 'eligibleSources': 0}], calls))
            self.assertEqual(len(calls), 3)
            self.assertTrue(all('--force-sources' not in c for c in calls))
            fresh = Path(tmp) / 'restored'
            restore(state / 'checkpoints/recovery-materials.tar.gz', fresh)
            restored = Store(fresh / 'state.sqlite')
            value = restored.state('sourceBackfillRunner:recovery:materials')
            self.assertEqual((value['requests'], value['bytesDownloaded']), (7, 100))
            self.assertEqual(value['recoveredPresentationIssuers'], ['one', 'two'])
            self.assertEqual(value['stopReason'], 'NO_DUE_SOURCES')
            self.assertEqual(restored.sources()[0]['failureCount'], 2)
            self.assertEqual(restored.sources()[0]['nextCheck'], health['nextCheck']); restored.close()
            drive(tmp, fresh, 'recovery', execute=self.execute([
                {'requests': 2, 'derivedSources': 0}], []))
            restored = Store(fresh / 'state.sqlite')
            self.assertEqual(restored.state('sourceBackfillRunner:recovery:materials')['requests'], 9)
            restored.close()

    def test_shared_circuit_and_operator_stop_checkpoint_before_next_batch(self):
        for report, operator_stop in [({'requests': 3, 'derivedSources': 2, 'circuit': {'open': True}}, False),
                                      ({'requests': 3, 'derivedSources': 2}, True)]:
            with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
                state = Path(tmp) / 'state'; Store(state / 'state.sqlite').close(); calls = []
                execute = self.execute([report], calls)
                def stopped(command, **kwargs):
                    value = execute(command, **kwargs)
                    if operator_stop: (state / 'stop-source-backfill').touch()
                    return value
                drive(tmp, state, 'pause', batches=5, execute=stopped)
                self.assertEqual(len(calls), 1)
                self.assertTrue((state / 'checkpoints/pause-materials.tar.gz').is_file())

    def test_child_interruption_keeps_prior_accounting_and_source_fact_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            state = Path(tmp) / 'state'; Store(state / 'state.sqlite').close()
            with self.assertRaisesRegex(RuntimeError, 'SOURCE_BACKFILL_BATCH_FAILED'):
                drive(tmp, state, 'interrupt', batches=2, execute=self.execute([
                    {'requests': 7, 'derivedSources': 3}, None], []))
            restore(state / 'checkpoints/interrupt-materials.tar.gz', Path(tmp) / 'restore')
            store = Store(Path(tmp) / 'restore/state.sqlite')
            self.assertEqual(store.state('sourceBackfillRunner:interrupt:materials')['requests'], 7)
            store.close()

    def test_publisher_budget_continues_but_stale_cooldown_checkpoint_is_not_recounted(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            state = Path(tmp) / 'state'; Store(state / 'state.sqlite').close(); calls = []
            batch = {'requests': 5, 'checkpointCurrentRun': True, 'run': {'new': 2, 'duplicate': 1},
                     'checkpoint': {'attempted': 4, 'parsed': 3, 'stopReason': 'BUDGET_DEFERRED'}}
            stale = {'requests': 0, 'checkpointCurrentRun': False, 'stopReason': 'SOURCE_COOLDOWN',
                     'checkpoint': batch['checkpoint']}
            drive(tmp, state, 'september', lane='publisher', month='2026-09', batches=8,
                  execute=self.execute([batch, stale], calls))
            self.assertEqual(len(calls), 2)
            self.assertIn('--archive-month', calls[0])
            store = Store(state / 'state.sqlite'); value = store.state('sourceBackfillRunner:september:publisher')
            self.assertEqual((value['attemptedReleases'], value['parsedReleases'], value['newNewsItems']), (4, 3, 2))
            self.assertEqual(value['stopReason'], 'SOURCE_COOLDOWN'); store.close()
            with self.assertRaisesRegex(ValueError, 'MONTH_CHANGED'):
                drive(tmp, state, 'september', lane='publisher', month='2026-08', execute=self.execute([], []))

    def test_partial_publisher_gain_does_not_hide_temporary_failure_pause(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            state = Path(tmp) / 'state'; Store(state / 'state.sqlite').close(); calls = []
            drive(tmp, state, 'publisher-pause', lane='publisher', month='2026-09', batches=5,
                  execute=self.execute([{'requests': 5, 'checkpointCurrentRun': True, 'run': {'new': 2},
                    'checkpoint': {'attempted': 5, 'parsed': 2, 'stopReason': 'PUBLISHER_TEMPORARY_FAILURE_PAUSE'}}], calls))
            self.assertEqual(len(calls), 1)
            store = Store(state / 'state.sqlite')
            self.assertEqual(store.state('sourceBackfillRunner:publisher-pause:publisher')['newNewsItems'], 2)
            store.close()

    def test_actual_news_issuer_gain_is_distinct_and_low_gain_pause_survives_restore(self):
        from test_engine import item
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            state = Path(tmp) / 'state'; Store(state / 'state.sqlite').close(); calls = []
            def accepted(command, **kwargs):
                calls.append(command)
                store = Store(state / 'state.sqlite')
                for n in range(2):
                    news = item('Issuer ' + str(n) + ' announces earnings results')
                    news.update(companyId='issuer-' + str(n), newsId='news-' + str(n))
                    store.ingest(news)
                store.close()
                return SimpleNamespace(returncode=0, stdout=json.dumps({'requests': 4,
                    'checkpointCurrentRun': True, 'checkpoint': {'attempted': 4, 'parsed': 4, 'stopReason': 'BATCH_COMPLETED'},
                    'run': {'new': 2 if len(calls) == 1 else 0, 'duplicate': 0 if len(calls) == 1 else 2}}))
            drive(tmp, state, 'gain', lane='publisher', month='2026-09', batches=2, execute=accepted)
            fresh = Path(tmp) / 'restore'
            restore(state / 'checkpoints/gain-publisher.tar.gz', fresh)
            state = fresh
            drive(tmp, state, 'gain', lane='publisher', month='2026-09', batches=8, execute=accepted)
            self.assertEqual(len(calls), 4)  # First gain, then three healthy duplicate-only batches.
            store = Store(state / 'state.sqlite'); value = store.state('sourceBackfillRunner:gain:publisher')
            self.assertEqual(value['recoveredNewsIssuers'], ['issuer-0', 'issuer-1'])
            self.assertEqual(value['newNewsIssuerIds'], [])
            self.assertEqual(value['consecutiveLowGainBatches'], 3)
            self.assertEqual(value['stopReason'], 'NEGLIGIBLE_INCREMENTAL_ISSUER_COVERAGE'); store.close()
