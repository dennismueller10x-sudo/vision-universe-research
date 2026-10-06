# Phase29 — Existing canonical source operating evidence

Base PR91 final98eb1af; accepted code422d7c,847 tests. Main d6b8177 unchanged. Active Master26/36/60/75/77 requirements: verify current source handoff through the existing lifecycle, distinguish restoration from complete operating readiness, no provider backfill or public raw-data expansion.

## Scope and contracts
Use the existing R2 credentials pattern from source r2-history-verify.yml, existing measured preflight, existing history sync, market-store and EOD gate. The new bounded QA workflow performs only existing storage reads and restores at most five members from the existing GATE_100 universe into runner-private state. It requests no Tiingo data, runs no upload/delete mode and makes no production commit. Monthly accounting must pass before restoration. Preflight's own limited probe retains its existing bookkeeping budget; this is not a claim that account-wide billing has been reconciled.

The verifier consumes existing preflight/sync evidence and restored canonical bars. It emits only identities/counts/dates/statuses, never price levels or bar arrays. PASS means sample restoration verified; EOD coverage remains separate and productionLifecycle is always NOT_CERTIFIED until checkpoint lineage, provider finality, actions, feature-refresh and account-wide accounting/concurrency are evidenced. Failed preflight stops the workflow; only metadata reports are retained, no raw restored files.

Affected files: .github/workflows/vu2-lifecycle-handoff.yml, scripts/vu2/verify-history-handoff.mjs, quant/tests/history-handoff-proof.test.mjs, this context and ledger. Existing SEC-owned files, data, source adapter, formulas and UI unchanged.

## Acceptance
Three focused tests PASS: successful restore does not certify stale EOD/production; mismatched producer evidence fails; wrong/missing/unreadable identity fails without data disclosure. Remote Quant/SEC plus the bounded operating proof are required. No expensive universe/provider rerun. No new visual claim.

## Parallel Fundamentals evidence
Current source branch418f938 includes docs/VU_SEC_FINAL_RECOVERY_REPORT.md generated2026-09-13T19:57:01Z: persisted issuers5479, annual histories5299, quarterly/PIT histories5333, normalization1.9.0, R2 prefix v1/sec/fundamentals/, reload-without-SEC-refetch PASS8/8. These are source-report claims, not newly rerun tests or automatic VU2/PIT/backtest certification. Report also records5152 PIT/R2/technical intersection and4480 with core fundamentals. Consume this handoff through its existing canonical identity contract; do not create another fundamentals store or alter the parallel daily-update implementation.

Rollback: remove the additive QA/verifier before further execution. No R2 production mutations or new schedules are part of this phase. Record the actual remote outcome rather than promoting historical reports to current evidence.
