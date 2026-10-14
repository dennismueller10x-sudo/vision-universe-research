# Durable Recovery Result

## What from #643 was reused

PR #643 and its V2 code/contracts were read from persisted Git. All 23/23 V2 freeze hashes match. The cash/budget infrastructure fix and positive finite execution-open guard are present.

## What was recomputed

No numeric calibration was run: freeze-bound canonical source data and reference artifacts are not readable. Prior Momentum output bytes also remain unverifiable; V3 reproduction has not started.

## Calibration reference sources

The V2 freeze records three expected French-library inputs, but their source plan, captured bytes and parsed output are absent. See `CALIBRATION-V3-REFERENCE-MANIFEST.json`.

## 52W reconciliation result

`CAUSE_UNRESOLVED_NO_FAILED_BOOK_CAPTURE`. No cause is claimed. The proven cash-rounding defect is not yet tied to this 52W failure.

## Proven infrastructure fixes

Binary64 budget/cash-rounding defect and isolated repair are proven/reviewed per persisted bug note. No evidence yet establishes material impact on previous numeric results.

## Calibration verdicts

Eight method receipts are initialized as `NOT_STARTED_INPUTS_REQUIRED`; no PASS/PARTIAL/FAIL verdict is asserted.

## Overall certification

`NOT_CERTIFIED` until all possible methods are assessed against durable inputs and independently reviewed.

## Tournament results

Not rerun. No post-calibration results exist in this V3 branch.

## Current replay

Not replayed. The existing 2026-10-12 capture is encrypted and not decryptable through the available executor path.

## Consensus

No diagnostic or qualified consensus computed.

## Tiering

Not assigned; method evidence has not been refreshed.

## Claim readiness

No methods are claim-ready from this V3 work.

## Remaining blockers

Readable durable canonical historical dataset and reference source inputs; an independently linked 52W failed-book trace; scanner-safe parser source update and hash-bound premeasurement freeze; then per-method results/reviews, tournament, current replay, final numeric/adversarial review and owner delivery.

## Durability verification

Inventory, method checkpoints, blocked output receipts and resume state are written in the V3 branch. An independent executor can reconstruct exactly which inputs are missing and what to do next, but cannot complete the measurement from these artifacts alone.


Current capture safe status (run 38374493235, 2026-10-12): 10 methods, 0 eligible, 6 partial, 4 blocked; exact closed session available; 866 source-input chunks; 0 forward records; final review pending. Its result artifact is retained until 2026-11-12 and its owner/session payloads remain encrypted. These counts are diagnostic only, not qualified signals.


The fresh-resume validator is `scripts/supertrader/research/calibration/verify-v3-durable-state.mjs`. Its next engineering prerequisites are a V3 measurement runner and a provider-backed historical source-capture workflow; neither is present yet. The 2026-10-12 current capture is diagnostic and still review-pending.
