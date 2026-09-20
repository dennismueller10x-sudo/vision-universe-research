# Phase 26 — Existing durable history compatibility

## Active contract and scope
Master 26–28, 60, 75, 84: preserve full history across runners, continue incrementally, reuse the canonical data lane, retain typed lifecycle gates. Phase20 already integrated strict EOD planning. This phase imports the existing storage implementation, not a replacement database or public API.

Base: PR87 c66703a2d485a148aaf3a0460ae037e3f8a2ddfc. Observed main d6b81779376b74ad41b38c09d03ab2fa447e3c13; since the previously integrated e91095c only analyst_ratings.json changed, without scope overlap. Source: PR88 08acd41e6969e8f0452940809400f61f8aa010eb (all remote gates passed).

## Files and provenance
Imported byte-identically from the source: history-store.js, bar-codec.js, zero-cost-guard.js; storage/fs-driver.mjs and s3-driver.mjs; history-store.test.mjs and zero-cost-guard.test.mjs. Existing v1 object layout and history-store-1.1.0 remain unchanged. No source engine fork or competing calculation.

New history-lifecycle-compatibility.test.mjs exercises the existing market-store plus durable store with committed Golden NVDA data, separate runner directories and separate store instances. Acceptance: exact bar preservation beyond 400 bars, next-day continuation, unchanged-write idempotency, overlap correction without duplicates, no public output, no fabricated checkpoint or provider finality.

## Validation
42 imported tests PASS, no skips; one new cross-runner compatibility test PASS. Tests use temporary files and a local HTTP server; no external provider or production R2 request. Full existing Node suite and remote Quant/SEC CI are phase gates. No UI change; previous browser/accessibility/resource gates retain their scope, not rerun or reclassified as new visual evidence.

## Activation gates and next integration
This imports and validates the existing internal storage layer. It does NOT enable a scheduler, upload production history, publish raw data, replace SEC files, or claim end-to-end lifecycle completion.

The existing sync-history-store.mjs bridge is deliberately not activated/imported in this changeset. Review found it selects by ticker and writes the universe securityId without checking the stored identity. Both pull and push need fail-closed identity checks before adoption; explicit canonical mapping evidence is required before any alias migration. Restore also must distinguish restore time from market freshness and must not overwrite newer runner history silently. Paid dry-run reads must retain the existing budget boundary. Those are follow-on bridge repairs, not a reason to create a second storage engine.

Durable history alone does not persist EOD checkpoints, prove session finality, reconcile corporate actions, or certify downstream feature refresh. These requirements remain open behind the existing EOD gates. Source Fundamentals coverage and PIT-ready counts are not a professional backtest certificate; its contracts remain in the parallel owned lane.

Rollback: additive files can be reverted before any caller activation; existing EOD consumer and production data are unchanged. Public licensing and PR85 external visual gate remain separate.
