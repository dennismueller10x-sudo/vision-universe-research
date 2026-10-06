# Phase28 — Canonical usage-state and preflight handoff

## Active requirements and dependency
Master26/36/60/68/75/77: preserve existing storage, typed failures, honest operating gates, no duplicate architecture. Follow PR90 06fea87d74fbec949f5abe1786d144bc7e6fcd5d after Quant34776940343 / SEC34776940382 SUCCESS (840 tests, no skips). Main remains d6b8177; source SEC branch51f3356 is parallel and untouched.

## Existing contract defect
history-store-1.1.0 readUsage returned empty monthly counters for a present but corrupt JSON object or mismatched month. This could erase evidence of consumed quota. The existing preflight also caught source errors and returned an allowed offline estimate, and its recovery estimate used only missing titles even though restore reads all requested titles.

## Bounded implementation
The same history-store moves to1.1.1; object layout and bar codec remain v1. Present invalid usage objects raise HISTORY_USAGE_INVALID without payload disclosure. Nonnegative safe-integer counters, actual month and runs structure are checked on read/write. Rejected writes preserve the prior object and spend no Class-A operation. Missing-month read retains prior API semantics, but the preflight does not equate it to verified zero usage.

The existing sync CLI rechecks accounting before series mutations. Import the existing preflight-zero-cost.mjs from source08acd41 and adapt its authorization boundary: measured current accounting is required, an offline/error/hypothetical estimate never issues budgetForRun. Local planning remains usable. Recovery estimates one read per requested symbol with no remote writes; bulk upload accounts for the identity read and append read across all requested symbols, including existing ones. No second planner/store or SEC contract.

## Acceptance and tests
43 targeted tests PASS: existing storage suite, expanded CLI/preflight integration, new usage boundary suite. Covers malformed JSON, wrong-month objects, negative/fractional/null/string/unsafe counters, preservation on rejected writes, invalid month before driver access, transport errors, actual preflight-to-restore consumption and rejected offline/missing/corrupt accounting. All existing assertions retained. Full Node and remote Quant/SEC are final phase gates. All data operations in tests use temporary filesystem/loopback fixtures; no production/provider backfill.

## Remaining gates / next step
Production monthly usage must come from verified current accounting; an absent counter cannot be invented. Missing source evidence now blocks execution while preserving planning. This does not settle account-wide concurrent consumers, preflight-probe/failed-run accounting, storage growth estimates, distributed run locking or billing reconciliation. Those remain required before unattended production activation; no cost-free production certification is claimed.

Next ledger item: controlled canonical snapshot/checkpoint/finality/corporate-action/feature-refresh handoff using existing producer outputs. Source storage validation from2026-09-12 reports newest bar2026-09-10 and cannot itself certify current EOD or VU2 Fundamentals/PIT compatibility. No production R2 read/write, credential change, schedule, public rollout or new product view is included.

Rollback: revert these bounded code changes before activation. No stored objects or existing snapshots have been migrated/deleted. PR85 manual visual gate remains separately blocked by external screenshot access.
