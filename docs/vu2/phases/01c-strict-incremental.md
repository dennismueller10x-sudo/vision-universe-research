# Phase 1c — strict incremental import gate

Active requirements: Master26–29,36,60,77,82; continuation request §6. Accepted 1a/1b are the base; no repeated audit. Research3 migration principle: preserve existing adapter, store and calendar, gate unproven production capabilities.

Branch/worktree: workstream/vu2-eod-gates / ../vu2-eod-gates. Base9914e0e32b6844d43d147b01258f7d60fe69d4c7; observed main533245e8bb1b805c24c1ce9ba2051345ad215e24. Shared contracts serialized; no SEC-owned or committed data changes.

Owned files: market-eod-gate.js, ingest-tiingo.mjs, two focused test files, this phase ledger. Opt-in `--strict-incremental`; no scheduled job changed. Rollback: stop passing this new flag/revert this bounded change. Default backfill behavior remains as audited; it is not promoted to production-ready.

## Implementation and acceptance
- Reuse existing NYSE calendar and require coverage. Bound request to latest closed regular session, including holidays/early closes. This does not certify provider revision finality.
- Preflight every required restored history before first request. Missing/corrupt history fails; no implicit initial backfill. Existing last date does not certify complete durable history.
- Session-specific checkpoint. A done entry cannot skip lagging restored history. Actual CLI tests verify rerun makes no new provider request after completion.
- Validate a single new EOD bar with the prior stored bar as continuity context; merge only new data. Existing importer assumed at least two response bars; strict mode handles normal one-bar increments without lowering the quality engine's requirement.
- Require finite corporate-action fields, explicit no-action values, and all intermediate trading sessions before advancing the watermark. Events require historical reconciliation; missing trailing dates remain retryable.
- Block both publication paths on incomplete gate. Persist typed internal health/checkpoint even when incomplete; no new public data path.

## Gates and evidence
11 targeted tests PASS (5 session/response gate,3 actual CLI,3 accepted store lifecycle). CLI uses temporary copied code/config, frozen clock and intercepted fetch, never real provider calls. Independent adversarial review PASS after repairs of three HIGH findings: publication order, intermediate gaps, missing action evidence. Its MEDIUM health-record finding repaired and covered by CLI assertion.
Broad Node regression and remote CI recorded after execution. No full-universe backfill warranted: opt-in architecture safety, no changed provider normalization or committed data.

## Remaining production dependencies
- DURABLE_FULL_HISTORY_RESTORE_NOT_CERTIFIED: existing approx7.6GB working history/cache limitation remains; no invented storage proof or new database.
- CORPORATE_ACTION_RECONCILIATION_REQUIRED: adjusted-history rebasing and old revisions need separate integration.
- PROVIDER_REVISION_FINALITY_NOT_CERTIFIED: closed session is distinct from immutable provider EOD.
- Dependent feature/technical/screener refresh and durable runner restore must be wired only after these gates. No daily scheduler activation in this PR.

Status: internal opt-in safety implemented; production lifecycle remains gated. Product/visual development continues independently.

Local phase gate: **703/703 Node regression tests PASS**. Independent counter-review PASS. No provider calls or full-universe data writes.
