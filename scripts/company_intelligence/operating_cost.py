"""Reproducible planning estimates, not a cloud bill or provider quotation."""
import argparse
import json
import math
from pathlib import Path


def estimate(sources, payloads, consumer_bytes, checkpoint_bytes, runtime_minutes=4):
    if any(type(n) not in (int, float) or n < 0 for n in (payloads, consumer_bytes, checkpoint_bytes, runtime_minutes)):
        raise ValueError('INVALID_COST_ASSUMPTION')
    # Four-hour wakeups cap polling at six daily runs. Twelve-hour event feeds
    # remain twice daily; weekly discovery is a separate bounded operation.
    requests = sum(min(6, math.ceil(24 / max(4, s.get('intervalHours', 4))))
                   for s in sources if s.get('active', True))
    runs = 6 * 30
    return {
        'assumptions': {'daysPerMonth': 30, 'runsPerDay': 6,
                        'runtimeMinutesPerRun': runtime_minutes,
                        'payloadsPerGeneration': payloads,
                        'consumerBytesPerGeneration': consumer_bytes,
                        'compressedCheckpointBytes': checkpoint_bytes,
                        'retainedPublicSlots': 2, 'retainedPrivateSlots': 2},
        'dataProviderDollars': 0,
        'actionsMinutesPerMonth': runs * runtime_minutes,
        'plannedSourceRequestsPerDay': requests,
        'plannedSourceRequestsPerMonth': requests * 30,
        'excludedRequestCosts': 'SEC changed-issuer metadata/index, robots refresh, bounded retries and weekly discovery; quantify separately from observed runs.',
        # Conservative upper bound: all payloads change every run. Publisher
        # skips identical objects already in the destination slot by hash.
        'publicPutUpperBoundPerMonth': runs * (2 * payloads + 5),
        'privatePutUpperBoundPerMonth': runs * 3,
        'publicVerificationGetUpperBoundPerMonth': runs * (2 * payloads + 5),
        'privateRestoreGetUpperBoundPerMonth': runs * 5,
        'retainedSnapshotGB': round((2 * consumer_bytes + 2 * checkpoint_bytes) / 1e9, 6),
        'generationRetention': 'Two public and two private slots; generation count does not multiply retained snapshot storage.',
        'limits': 'Estimates omit user-delivery GET traffic and long-term ledger event growth. Conditional GET saves bytes, not request count. Do not treat reference free-tier limits as guaranteed billing.'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--sources', type=Path, required=True)
    p.add_argument('--payloads', type=int, required=True)
    p.add_argument('--consumer-bytes', type=int, required=True)
    p.add_argument('--checkpoint-bytes', type=int, required=True)
    p.add_argument('--runtime-minutes', type=float, default=4)
    a = p.parse_args()
    print(json.dumps(estimate(json.loads(a.sources.read_text()), a.payloads, a.consumer_bytes,
                             a.checkpoint_bytes, a.runtime_minutes), sort_keys=True))


if __name__ == '__main__':
    main()
