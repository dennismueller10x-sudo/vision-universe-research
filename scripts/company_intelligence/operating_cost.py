"""Reproducible planning estimates, not a cloud bill or provider quotation."""
import argparse
import json
import math
from pathlib import Path


def estimate(sources, payloads, consumer_bytes, checkpoint_bytes, runtime_minutes=4, asset_count=None):
    if any(type(n) not in (int, float) or n < 0 for n in (payloads, consumer_bytes, checkpoint_bytes, runtime_minutes)):
        raise ValueError('INVALID_COST_ASSUMPTION')
    # Four-hour wakeups cap polling at six daily runs. Twelve-hour event feeds
    # remain twice daily; weekly discovery is a separate bounded operation.
    assets = 2 * payloads + 1 if asset_count is None else asset_count
    if type(assets) is not int or assets < 0: raise ValueError('INVALID_ASSET_COUNT')
    route_polls = {}
    requests = 0
    for index, source in enumerate(sources):
        if not source.get('active', True):
            continue
        daily = min(6, math.ceil(24 / max(4, source.get('intervalHours', 4))))
        requests += daily
        # Distinct formats/issuer descriptors can share one URL and one HTTP
        # memo entry in a run. Missing URLs cannot be assumed to share a route.
        route = source.get('url') or ('missing-url', index)
        route_polls[route] = max(route_polls.get(route, 0), daily)
    unique_requests = sum(route_polls.values())
    runs = 6 * 30
    lanes = math.ceil(unique_requests / (6 * 160))
    return {
        'assumptions': {'daysPerMonth': 30, 'runsPerDay': 6,
                        'runtimeMinutesPerRun': runtime_minutes,
                        'payloadsPerGeneration': payloads, 'consumerAssetsPerGeneration': assets,
                        'consumerBytesPerGeneration': consumer_bytes,
                        'compressedCheckpointBytes': checkpoint_bytes,
                        'serialNetworkIntervalSeconds': 2,
                        'networkScenario': 'One network request per due unique URL; source health, memo reuse and actual due times can reduce demand.',
                        'retainedPublicSlots': 2, 'retainedPrivateSlots': 2},
        'dataProviderDollars': 0,
        'actionsMinutesPerMonth': runs * runtime_minutes,
        'plannedSourceRequestsPerDay': requests,
        'plannedSourceRequestsPerMonth': requests * 30,
        'plannedUniqueRouteRequestsPerDay': unique_requests,
        'plannedUniqueRouteRequestsPerMonth': unique_requests * 30,
        # Each six-run day can send its first request without the global gap.
        # This floor excludes HTTP latency, robots, retries and five-second
        # same-host pacing. Parallel lanes reduce wall time, not billed sum.
        'serialPacingMinutesPerMonthFloor': max(0, unique_requests - 6) * 2 * 30 / 60,
        'fullDemand160RequestCapacityLanes': lanes,
        'fullDemandActionsMinutesAtAssumedRuntime': lanes * runs * runtime_minutes,
        'excludedRequestCosts': 'SEC changed-issuer metadata/index, robots refresh, bounded retries and weekly discovery; quantify separately from observed runs.',
        # Conservative upper bound: all payloads change every run. Publisher
        # skips identical objects already in the destination slot by hash.
        'publicPutUpperBoundPerMonth': runs * (assets + 4),
        'privatePutUpperBoundPerMonth': runs * 3,
        'publicVerificationGetUpperBoundPerMonth': runs * (2 * assets + 4),
        'privateRestoreGetUpperBoundPerMonth': runs * 5,
        'retainedSnapshotGB': round((2 * consumer_bytes + 2 * checkpoint_bytes) / 1e9, 6),
        'generationRetention': 'Two public and two private slots; generation count does not multiply retained snapshot storage.',
        'limits': 'Estimates omit user-delivery GET traffic and long-term ledger event growth. Conditional GET saves bytes, not request count. Do not treat reference free-tier limits as guaranteed billing.'}


def profile_estimate(profiles, initial_requests=0, initial_decoded_bytes=0):
    """Separate slow-profile scenario; never add profile work to every news wakeup."""
    if any(type(n) is not int or n < 0 for n in (initial_requests, initial_decoded_bytes)):
        raise ValueError('INVALID_PROFILE_COST_MEASUREMENT')
    sec = sum(any(s.get('type') == 'SEC' for s in p.get('sources', [])) for p in profiles.values())
    web = sum(not any(s.get('type') == 'SEC' for s in p.get('sources', [])) and any(s.get('type') == 'FIRST_PARTY_WEB' for s in p.get('sources', [])) for p in profiles.values())
    public_bytes = len(json.dumps(profiles, ensure_ascii=False, separators=(',', ':')).encode())
    return {'dataProviderDollars': 0, 'initialRequestsMeasured': initial_requests,
            'initialDecodedBytesMeasured': initial_decoded_bytes, 'initialWireBytesMeasured': None,
            'secProfiles': sec, 'webOnlyProfiles': web,
            'steadyStateSourceRequestsPerMonthScenario': round(sec / 12 + web * 2, 2),
            'extraConsumerRequestsPerPage': 0, 'extraScheduledNewsWakeupsPerMonth': 0,
            'preparedProfileBytes': public_bytes, 'twoPublicSlotProfileBytes': 2 * public_bytes,
            'assumptions': 'One new annual filing/document per SEC profile/year, reusing existing submissions refresh; web-only profiles quarterly, at most two roots plus one advertised About each and two robots requests (six per review). This is a scenario, not activated scheduling or a measured bill.',
            'actionsImpact': 'Extraction joins existing change-driven projection or explicit bounded backfill; initial local runs are not billed GitHub Actions minutes. No extra recurring workflow enabled.',
            'storageImpact': 'Prepared facts occupy existing payloads and ledger/checkpoint; no new bucket or per-profile public asset. Immutable annual cache remains private and is reused locally.'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--sources', type=Path, required=True)
    p.add_argument('--payloads', type=int, required=True)
    p.add_argument('--consumer-bytes', type=int, required=True)
    p.add_argument('--checkpoint-bytes', type=int, required=True)
    p.add_argument('--assets', type=int)
    p.add_argument('--runtime-minutes', type=float, default=4)
    a = p.parse_args()
    print(json.dumps(estimate(json.loads(a.sources.read_text()), a.payloads, a.consumer_bytes,
                             a.checkpoint_bytes, a.runtime_minutes, a.assets), sort_keys=True))


if __name__ == '__main__':
    main()
