"""Drive bounded inventory batches, preserving progress in the existing ledger.

The child CLI owns its normal writer lock and candidate checkpoints. This driver
records batch accounting only after each child exits and stops on infrastructure
cooldown, no due work, or its explicit batch limit. Reusing the pass resumes the
frozen pending/retry inventory, never an in-memory cursor.
"""
import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from .checkpoint import pack
from .inventory_sweep import prefix, failure_category
from .pipeline import utcnow
from .store import Store


def failure_clusters(store, lane):
    state_prefix = 'officialSite:' if lane == 'domains' else 'ir:'
    counts = Counter()
    reasons = Counter()
    for row in store.db.execute('SELECT payload FROM state WHERE key LIKE ?', (state_prefix + '%',)):
        value = json.loads(row[0])
        if value.get('status') == 'VALIDATED' or lane == 'ir' and value.get('lastSuccess'):
            continue
        reason = value.get('reason') or ''
        counts[failure_category(value.get('status'), reason)] += 1
        reasons[reason or 'UNKNOWN'] += 1
    return {'categories': dict(counts.most_common()), 'reasons': dict(reasons.most_common(20))}


def drive(root, state, pass_id, lane='domains', batches=100, limit=25,
          request_budget=200, max_seconds=480, workers=4, admission_interval=.5,
          execute=subprocess.run):
    prefix(pass_id, lane)
    if not 1 <= batches <= 500:
        raise ValueError('INVALID_INVENTORY_BATCH_COUNT')
    state = Path(state).resolve()
    key = f'inventoryRunner:{pass_id}:{lane}'
    report = None
    for _ in range(batches):
        command = [sys.executable, '-m', 'company_intelligence.cli', 'sweep-inventory',
                   '--root', str(Path(root).resolve()), '--state', str(state), '--network',
                   '--inventory-pass', pass_id, '--inventory-lane', lane,
                   '--limit', str(limit), '--request-budget', str(request_budget),
                   '--max-seconds', str(max_seconds), '--discovery-workers', str(workers),
                   '--discovery-admission-interval', str(admission_interval)]
        completed = execute(command, capture_output=True, text=True)
        # Do not overwrite good candidate state on an interrupted/failed child.
        if completed.returncode:
            raise RuntimeError('INVENTORY_BATCH_FAILED:' + str(completed.returncode))
        report = json.loads(completed.stdout)
        store = Store(state / 'state.sqlite')
        try:
            prior = store.state(key, {})
            accounting = {**prior, 'passId': pass_id, 'lane': lane, 'checkedAt': utcnow(),
                          'completedBatches': prior.get('completedBatches', 0) + 1,
                          'requests': prior.get('requests', 0) + report['requests'],
                          'bytesDownloaded': prior.get('bytesDownloaded', 0) + report.get('httpStats', {}).get('bytesDownloaded', 0),
                          'lastBatch': report, 'failureClusters': failure_clusters(store, lane)}
            store.set_state(key, accounting)
        finally:
            store.close()
        print(json.dumps(accounting, sort_keys=True), flush=True)
        if accounting['completedBatches'] % 10 == 0 or report.get('stopReason') != 'BATCH_COMPLETED':
            pack(state, state / 'checkpoints' / (pass_id + '-' + lane + '.tar.gz'))
        if report.get('stopReason') != 'BATCH_COMPLETED':
            break
    # Persist an idle-writer recovery snapshot even when the outer limit fires.
    if report is not None:
        pack(state, state / 'checkpoints' / (pass_id + '-' + lane + '.tar.gz'))
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--state', type=Path)
    parser.add_argument('--inventory-pass', required=True)
    parser.add_argument('--inventory-lane', choices=['domains', 'ir'], default='domains')
    parser.add_argument('--max-batches', type=int, default=100)
    parser.add_argument('--limit', type=int, default=25)
    parser.add_argument('--request-budget', type=int, default=200)
    parser.add_argument('--max-seconds', type=int, default=480)
    parser.add_argument('--discovery-workers', type=int, default=4)
    parser.add_argument('--discovery-admission-interval', type=float, default=.5)
    parser.add_argument('--network', action='store_true')
    args = parser.parse_args(argv)
    if not args.network:
        parser.error('inventory-runner requires explicit --network')
    drive(args.root, args.state or args.root / '.company-intelligence', args.inventory_pass,
          args.inventory_lane, args.max_batches, args.limit, args.request_budget,
          args.max_seconds, args.discovery_workers, args.discovery_admission_interval)


if __name__ == '__main__':
    main()
