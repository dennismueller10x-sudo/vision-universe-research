# Durable Recovery Result

## What from #643 was reused

PR #643 and its V2 code/contracts were read from persisted Git. All 23/23 V2 freeze hashes match. The cash/budget infrastructure fix and positive finite execution-open guard are present.

## What was recomputed

No numeric calibration was run. The canonical input is now present as a complete, hash-bound encrypted Actions artifact, but its plaintext cannot be read by this executor. Prior Momentum output bytes also remain unverifiable; V3 reproduction has not started.

## Calibration reference sources

Frozen #643 source-census metadata supplies the official French Library URLs, prior capture date, archive/member hashes, periods and rights notes for three reference inputs. The V3 source plan is now hash-bound; run 38554833188 captured and verified all three official archives and CSV members against the declared SHA256 values, parsed the source references, and sealed archives, CSVs and parsed output for owner/session. Its Actions artifact is `11887784036` (expires 2027-01-12); independent numeric review remains pending. No private return values are published. See `CALIBRATION-V3-REFERENCE-MANIFEST.json`.

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

Run 38555503225 produced an `AVAILABLE` canonical capture; run 38566792132 emitted and verified durable per-part receipts (manifest SHA256 `34bf957554e62edbb304d619442878601a65e700bc710697a4cca5c18b8ce713`; 500 parts; 9,408 usable securities). The 9,410 input segments include two rejected segments. Run 38570403846 independently proved both as `CORPORATE_ACTION_CONTRADICTED / SPLIT_NOT_IN_RAW_PRICE`: applying the source split factor made each source close movement farther from zero than the unadjusted movement; prefix validation then left fewer than two usable bars. This is a source corporate-action/price conflict under frozen arithmetic, not a proved runner defect. Private security identities remain unpublished. The separate 52W reference-book reconciliation remains open and is not explained by these exclusions.

The canonical artifact `11895314451` is sealed for owner and session recipients; its ciphertext and all plaintext part digests are durably receipted. No recipient private key or decrypt-capable Actions path is available to this executor, so it cannot provide the verified plaintext source metadata and canonical files required by the numeric runner. V3 freeze remains a candidate (`NOT_FROZEN_MISSING_DURABLE_INPUT_RECEIPTS`); the pending numeric methods have not run. Tournament, current replay, independent reviews and owner delivery remain pending. Resume state records the exact prerequisite and next step.

## Durability verification

Inventory, method checkpoints, blocked output receipts and resume state are written in the V3 branch. An independent executor can reconstruct exactly which inputs are missing and what to do next, but cannot complete the measurement from these artifacts alone.


Current capture safe status (run 38374493235, 2026-10-12): 10 methods, 0 eligible, 6 partial, 4 blocked; exact closed session available; 866 source-input chunks; 0 forward records; final review pending. Its result artifact is retained until 2026-11-12 and its owner/session payloads remain encrypted. These counts are diagnostic only, not qualified signals.


The fresh-resume validator is `scripts/supertrader/research/calibration/verify-v3-durable-state.mjs`. Its next engineering prerequisites are a V3 measurement runner and a provider-backed historical source-capture workflow; neither is present yet. The 2026-10-12 current capture is diagnostic and still review-pending.


Fresh-executor status reconstruction passed from a new sparse clone of the pushed V3 branch using `node scripts/supertrader/research/calibration/verify-v3-durable-state.mjs`. This verified only the persisted inventory/checkpoint/receipt graph; it did not decrypt private inputs or run a calibration.


A read-only canonical inventory workflow is configured on the V3 branch. The available capture and all part receipts are verified. Measurements remain gated on authorized plaintext access inside a trusted runner, which must verify all 500 part hashes and source metadata before finalizing the V3 freeze.


Earlier canonical capture run `38547641330` is a blocked forensic artifact and is superseded by the available capture above. The latter is usable as a durable receipt, not as local plaintext. `CALIBRATION-V3-RESUME-STATE.json` distinguishes these states and sets the next step to authorized decryption-capable execution followed by V3 freeze and method checkpoints.
