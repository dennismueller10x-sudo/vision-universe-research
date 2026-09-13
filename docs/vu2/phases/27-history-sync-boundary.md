# Phase27 — Controlled existing history bridge integration

## Context and active requirements
Follows phase26 / PR89 accepted Quant34761958559 and SEC34761958561 at0462825c0154a59de9b2d62a766434a249ecfca3. Main remains d6b81779376b74ad41b38c09d03ab2fa447e3c13. Master26–28/36/39/60/68/75: same canonical history, persistent runner recovery, no silent identity remapping, honest freshness and preserved gates. Source is the existing scripts/market/sync-history-store.mjs from PR88 at08acd41; storage layout and engines are unchanged from phase26.

## Affected files and acceptance
Adapt that existing CLI in place on the VU2 integration lane; add history-sync-boundary.test.mjs. It restores to the same private .market-cache/provider/daily/securityId.json consumed by the existing market-store/EOD/features. No parallel data path or new product surface.

- Validate ticker, securityId, provider and per-bar securityId before either direction; validate date ordering and actual dates. Duplicate/missing/malformed universe identities fail closed. No automatic alias conversion.
- Verify existing durable identity before append. Additional read consumes the existing budget, never an unmetered exception.
- Restore retains newer local bars. Conflicting overlapping evidence or adjustment status requires reconciliation rather than choosing a winner silently.
- Write local restore atomically. Keep existing updatedAt; a fresh runner gets unknown/null market update time and a distinct restoredAt. Never synthesize ingestion checkpoint, session finality or corporate-action evidence.
- A remote dry-run must pass current operation-matched preflight before constructing the driver. Only a local filesystem dry-run remains unmetered.

## Tests and gate
Ten CLI boundary tests run in isolated temporary directories, with synthetic inputs only in tests and no external credentials/network. They cover successful push/restore/idempotency, cross-runner continuation, freshness, identity conflict at both ends and bar level, conflicting prices, invalid dates/duplicate identities, missing remote dry-run preflight and malformed inputs. Together with existing EOD gate and full-history compatibility:16 tests PASS. Existing broad Node and remote Quant/SEC gates required before acceptance. No visual changes or new screenshot claims.

## Limits / next dependency
This is code integration, not production activation. Production reads/writes still require the existing operation-specific current preflight and server environment. No production R2 or provider request was made. No fundamental/SEC contract was modified or aliased to ticker. Existing shared source reports do not establish end-to-end VU2 consumer evidence automatically.

Next requires a controlled canonical snapshot handoff with matching identities, checkpoint lineage, finality/action evidence and downstream feature-refresh acceptance. A history-only restore cannot satisfy those requirements. Missing history remains visible in the sync tally; strict EOD continues to forbid implicit historical backfill. Scheduling, cross-run concurrency, production budget accounting and public display require their existing gates; this PR does not authorize them. Earlier lifecycle and licensing gates remain unchanged.

Rollback: remove the additive CLI before activation; durable objects and current EOD implementation have not been changed.
