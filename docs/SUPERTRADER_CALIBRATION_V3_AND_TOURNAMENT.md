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

Gross Profitability, Piotroski, Value+Momentum and Buyback are assessed `DATA_BLOCKED` from their frozen method contracts, each with a method checkpoint. JT Momentum, 52W-High, Low Volatility and Equal Weight remain numerically pending canonical/reference inputs. No PASS/PARTIAL/FAIL verdict is asserted.

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

Usable durable canonical historical data and reference source inputs; run 38547641330 completed but emitted zero canonical segments and no manifest/parts. Its sealed private diagnostic could not be read. Safe symbolic reason/phase reporting is being rerun in Actions run 38553639552. Then an independently linked 52W failed-book trace, hash-bound premeasurement freeze, remaining method assessments, tournament, current replay, final numeric/adversarial review and owner delivery are still pending.

## Durability verification

Inventory, method checkpoints, blocked output receipts and resume state are written in the V3 branch. An independent executor can reconstruct exactly which inputs are missing and what to do next, but cannot complete the measurement from these artifacts alone.


Current capture safe status (run 38374493235, 2026-10-12): 10 methods, 0 eligible, 6 partial, 4 blocked; exact closed session available; 866 source-input chunks; 0 forward records; final review pending. Its result artifact is retained until 2026-11-12 and its owner/session payloads remain encrypted. These counts are diagnostic only, not qualified signals.


The fresh-resume validator is `scripts/supertrader/research/calibration/verify-v3-durable-state.mjs`. Its next engineering prerequisites are a V3 measurement runner and a provider-backed historical source-capture workflow; neither is present yet. The 2026-10-12 current capture is diagnostic and still review-pending.


Fresh-executor status reconstruction passed from a new sparse clone of the pushed V3 branch using `node scripts/supertrader/research/calibration/verify-v3-durable-state.mjs`. This verified only the persisted inventory/checkpoint/receipt graph; it did not decrypt private inputs or run a calibration.


A read-only canonical inventory workflow is now configured to run on a tagged push to the V3 branch. It will capture a new, hash-addressed historical input manifest and preserve only encrypted source inputs plus safe status in Actions artifacts. Measurements remain gated on verifying that run and building the V3 runner/freeze.


Historical canonical capture run `38547641330` completed successfully on commit `110853d3b678d2dc88d2329f8e1d4459597b9bca`. Artifact `11885354425` expires `2026-11-13T10:25:51Z`; GitHub digest and a local ZIP SHA256 both equal `30e13fdb4835159ba1e35b3352c7f343b3d81baff9c44120e1d4e0c898850438`. Its public safe status is `canonicalStatus: BLOCKED`, with zero input segments and zero usable segments; it contains no canonical manifest or data parts. Ciphertext content hashes and anonymized status hash are in `CALIBRATION-V3-PRIVATE-ARTIFACT-RECEIPTS.json`. The original encrypted diagnostic remains unreadable here. A public-status change now allows only an enum-allowlisted reason and phase, with a focused test, so a new capture can isolate the loader failure without exposing messages, stack traces or provider values.
