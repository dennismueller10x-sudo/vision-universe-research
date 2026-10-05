"""Checkpoint bounded material or publisher batches without resetting source health.

The existing CLI owns source selection, due times and each durable fact. A local
request/time limit is a batch boundary, not evidence that a source is unavailable.
Reusing a run ID retains traffic and recovered-issuer accounting across invocations.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from .checkpoint import pack
from .inventory_runner import failure_clusters
from .pipeline import utcnow
from .store import Store


def drive(root, state, run_id, lane='materials', month=None, batches=10,
          limit=32, request_budget=160, max_seconds=360, execute=subprocess.run,
          publisher_low_gain_batches=3):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,47}', run_id or ''):
        raise ValueError('INVALID_SOURCE_BACKFILL_RUN')
    if lane not in ('materials', 'publisher') or not 1 <= batches <= 500:
        raise ValueError('INVALID_SOURCE_BACKFILL_LANE_OR_BATCHES')
    if not 1 <= limit <= 100 or not 1 <= request_budget <= 200 or not 30 <= max_seconds <= 1800:
        raise ValueError('INVALID_SOURCE_BACKFILL_BOUNDS')
    if lane == 'publisher' and (not re.fullmatch(r'\d{4}-(?:0[1-9]|1[0-2])', month or '')
                                or not '2000-01' <= month <= utcnow()[:7]):
        raise ValueError('INVALID_SOURCE_BACKFILL_MONTH')
    if lane == 'materials' and month is not None:
        raise ValueError('MATERIALS_BACKFILL_HAS_NO_MONTH')
    if type(publisher_low_gain_batches) is not int or not 0 <= publisher_low_gain_batches <= 20:
        raise ValueError('INVALID_PUBLISHER_LOW_GAIN_BOUND')
    state = Path(state).resolve()
    key = f'sourceBackfillRunner:{run_id}:{lane}'
    checkpoint = state / 'checkpoints' / (run_id + '-' + lane + '.tar.gz')
    report = None
    for _ in range(batches):
        if (state / 'stop-source-backfill').exists():
            break
        store = Store(state / 'state.sqlite')
        try:
            prior = store.state(key, {})
            if prior and prior.get('month') != month:
                raise ValueError('SOURCE_BACKFILL_RUN_MONTH_CHANGED')
            before_news = {row[0] for row in store.db.execute('SELECT DISTINCT company FROM items')}
        finally:
            store.close()
        command = [sys.executable, '-m', 'company_intelligence.cli',
                   'materials-backfill' if lane == 'materials' else 'news-archive',
                   '--root', str(Path(root).resolve()), '--state', str(state), '--network',
                   '--limit', str(limit), '--request-budget', str(request_budget),
                   '--max-seconds', str(max_seconds)]
        if month is not None:
            command += ['--archive-month', month]
        completed = execute(command, capture_output=True, text=True)
        if completed.returncode:
            # The child still retains its per-source facts/health on failure.
            pack(state, checkpoint)
            raise RuntimeError('SOURCE_BACKFILL_BATCH_FAILED:' + str(completed.returncode))
        report = json.loads(completed.stdout)
        reason = report.get('stopReason')
        if report.get('circuit', {}).get('open'):
            reason = 'CIRCUIT_OPEN'
        elif lane == 'materials':
            reason = reason or ('BATCH_COMPLETED' if report.get('derivedSources') else 'NO_DUE_SOURCES')
        elif not report.get('checkpointCurrentRun'):
            reason = reason or ('SOURCE_FAILURE' if report.get('run', {}).get('sourceFailures') else 'NO_CURRENT_PUBLISHER_BATCH')
        else:
            reason = report.get('checkpoint', {}).get('stopReason') or 'BATCH_COMPLETED'
            if not report.get('checkpoint', {}).get('attempted') and not report.get('checkpoint', {}).get('parsed'):
                reason = 'NO_DUE_RELEASES'
        store = Store(state / 'state.sqlite')
        try:
            fresh = report.get('checkpoint', {}) if lane == 'publisher' and report.get('checkpointCurrentRun') else {}
            accounting = {**prior, 'runId': run_id, 'lane': lane, 'month': month,
                          'checkedAt': utcnow(), 'completedBatches': prior.get('completedBatches', 0) + 1,
                          'lastBatch': report, 'stopReason': reason,
                          'failureClusters': failure_clusters(store, 'ir')}
            for name, value in [('requests', report['requests']),
                                ('bytesDownloaded', report.get('httpStats', {}).get('bytesDownloaded', 0)),
                                ('attemptedReleases', fresh.get('attempted', 0)),
                                ('parsedReleases', fresh.get('parsed', 0)),
                                ('newNewsItems', report.get('run', {}).get('new', 0)),
                                ('duplicateMatches', report.get('run', {}).get('duplicate', 0))]:
                accounting[name] = prior.get(name, 0) + value
            accounting['recoveredPresentationIssuers'] = sorted(set(prior.get('recoveredPresentationIssuers', [])) |
                                                               set(report.get('recoveredPresentationIssuers', [])))
            added_news = {row[0] for row in store.db.execute('SELECT DISTINCT company FROM items')} - before_news
            accounting['newNewsIssuerIds'] = sorted(added_news)
            accounting['recoveredNewsIssuers'] = sorted(set(prior.get('recoveredNewsIssuers', [])) | added_news)
            if lane == 'publisher' and report.get('checkpointCurrentRun') and reason in ('BATCH_COMPLETED', 'BUDGET_DEFERRED'):
                accounting['consecutiveLowGainBatches'] = prior.get('consecutiveLowGainBatches', 0) + 1 if len(added_news) <= 1 else 0
                if publisher_low_gain_batches and accounting['consecutiveLowGainBatches'] >= publisher_low_gain_batches:
                    reason = accounting['stopReason'] = 'NEGLIGIBLE_INCREMENTAL_ISSUER_COVERAGE'
            store.set_state(key, accounting)
        finally:
            store.close()
        pack(state, checkpoint)
        print(json.dumps(accounting, sort_keys=True), flush=True)
        if reason not in ('BATCH_COMPLETED', 'BUDGET_DEFERRED'):
            break
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--state', type=Path)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--lane', choices=['materials', 'publisher'], default='materials')
    parser.add_argument('--archive-month')
    parser.add_argument('--max-batches', type=int, default=10)
    parser.add_argument('--limit', type=int, default=32)
    parser.add_argument('--request-budget', type=int, default=160)
    parser.add_argument('--max-seconds', type=int, default=360)
    parser.add_argument('--publisher-low-gain-batches', type=int, default=3,
                        help='Pause after this many healthy publisher batches add at most one news issuer each (0 disables)')
    parser.add_argument('--network', action='store_true')
    args = parser.parse_args(argv)
    if not args.network:
        parser.error('source-backfill-runner requires explicit --network')
    drive(args.root, args.state or args.root / '.company-intelligence', args.run_id,
          args.lane, args.archive_month, args.max_batches, args.limit,
          args.request_budget, args.max_seconds,
          publisher_low_gain_batches=args.publisher_low_gain_batches)


if __name__ == '__main__':
    main()
