# Durable Recovery Result

## What from #643 was reused

PR #643 and its V2 code/contracts were read from persisted Git. All 23/23 V2 freeze hashes match. The cash/budget infrastructure fix and positive finite execution-open guard are present.

## What was recomputed

The canonical dataset was rebuilt inside GitHub Actions from the existing history store (user decision "Option 3"; the old encrypted capture is retained unchanged as historical evidence and none of its plaintext hashes is claimed). Every pipeline job re-captures and proves content equality with one committed freeze. Final run: 38685897684, freeze `V3-84caf2e84e560bec`. All four numeric calibration methods and all six tournament methods were measured and reconciled with accounting v3; the two momentum results from the earlier lineage were not reused because the accounting and execution-bar fixes change every book.

## Calibration reference sources

Frozen #643 source-census metadata supplies the official French Library URLs, prior capture date, archive/member hashes, periods and rights notes for three reference inputs. The V3 source plan is now hash-bound; run 38554833188 captured and verified all three official archives and CSV members against the declared SHA256 values, parsed the source references, and sealed archives, CSVs and parsed output for owner/session. Its Actions artifact is `11887784036` (expires 2027-01-12); independent numeric review remains pending. No private return values are published. See `CALIBRATION-V3-REFERENCE-MANIFEST.json`.

## 52W reconciliation result

Resolved. Cause: the share-count dust deletion in `closeShares` dropped a residual position worth cost 15.6 at an implausible adjusted price level; reconciliation was correct to fail. Accounting v3 books the residual in a dust ledger (equity, cash, curve and trades bit-identical, tolerance unchanged). All four methods reconcile in run 38685897684. The price-level finding itself stays OPEN (R10 census: 74 securities above 1e6).

## Proven infrastructure fixes

1. Dust write-off ledger (accounting v3). 2. Orders fill only on real source bars; the synthetic last-close bar of a data-quarantine terminal is settlement-only (run 38679035823 review failure R4, reproduced offline, fixed before any result was inspected; `calibration/superseded/RUN-38679035823.md`). 3. Review check R4c for the data-quarantine terminal fill.

## Calibration verdicts

Mechanical completion `V3-84caf2e84e560bec`: EW control PASS (declared control scope only); JT, 52W-High and Low-Volatility PARTIAL (original-study effect NOT_ASSESSED, original panel missing, NONCOMPARABLE); the four fundamental/event methods BLOCKED_DATA. Numeric review PASS for all four methods in both cost modes (separate code path, same author).

## Overall certification

Mechanical: `PARTIALLY_CERTIFIED`. **Claim boundary (adversarial review, `CALIBRATION-V3-ADVERSARIAL-REVIEW.json`):** the pre-registered PASS text requires audited direction/magnitude; the stock-level source oracle had 0 of 105 valid months for JT, 52W-High and EW (45 for Low-Volatility), so the control PASS rests on reconciliation plus a same-author review. Read strictly, the pre-registered text yields NOT_CERTIFIED / INSUFFICIENT_REFERENCE_DATA. The frozen verdict was not changed after results; amendments are listed as post-result proposals only. The construction mechanics reconcile; they are not validated against an independent magnitude/direction oracle.

## Tournament results

Run 38685897684: six frozen methods measured under the new freeze, baseline plus double-cost and terminal-sensitivity variants all reconcile (public summaries `TOURNAMENT-V3-*-SUMMARY-38685897684.json`, verdict `MEASURED_RECONCILED_REVIEW_PENDING`). Results are sealed to the owner and session keys; no performance numbers are public. No ranking or tier is assigned (post-calibration review pending).

## Current replay

`run-current-replay-v3.mjs` + `supertrader-calibration-v3-replay.yml` (tag `[supertrader-v3:replay]`). The legacy runner cannot be used on this branch (`FROZEN_CODE_CHANGED`). The replay verifies the V3 freeze and completion, scans all frozen methods on the latest closed session, seals candidate lists and publishes counts only. Universe/eligibility inputs are the branch snapshot files, not `main` (hashes published).

## Consensus

Qualified consensus: empty by rule (no method is fullyQualified with a passed tournament review). Diagnostic consensus (research only, never a trading score) is computed by the replay and published as a count; ticker lists exist only in sealed envelopes.

## Tiering

Not assigned. Adversarial findings A1, A4, A5, A6 and A9 must be resolved or accepted by the owner first.

## Claim readiness

No method is claim-ready. Calibration supports: books reconcile, orders are next-open and bar-backed, review R1-R9 pass. It does not support: a magnitude/direction match to any published factor result.

## Remaining blockers

(1) Owner decision on post-result amendments A1-A10 (a new pre-registered freeze and rerun would be required; none was started because the user's instruction forbids changing the frozen contract). (2) Original CRSP/FTSE panels for effect comparability. (3) Sealed results expire (14 days): the owner must download them, see `docs/SUPERTRADER_V3_OWNER_DELIVERY.md`. (4) The branch carries stale `quant/data` and `discover/data` and fails two unrelated CI checks that were already red at the starting commit.

## Durability verification

Inventory, method checkpoints, blocked output receipts and resume state are written in the V3 branch. An independent executor can reconstruct exactly which inputs are missing and what to do next, but cannot complete the measurement from these artifacts alone.


Current capture safe status (run 38374493235, 2026-10-12): 10 methods, 0 eligible, 6 partial, 4 blocked; exact closed session available; 866 source-input chunks; 0 forward records; final review pending. Its result artifact is retained until 2026-11-12 and its owner/session payloads remain encrypted. These counts are diagnostic only, not qualified signals.


The fresh-resume validator is `scripts/supertrader/research/calibration/verify-v3-durable-state.mjs`. Its next engineering prerequisites are a V3 measurement runner and a provider-backed historical source-capture workflow; neither is present yet. The 2026-10-12 current capture is diagnostic and still review-pending.


Fresh-executor status reconstruction passed from a new sparse clone of the pushed V3 branch using `node scripts/supertrader/research/calibration/verify-v3-durable-state.mjs`. This verified only the persisted inventory/checkpoint/receipt graph; it did not decrypt private inputs or run a calibration.


A read-only canonical inventory workflow is configured on the V3 branch. The available capture and all part receipts are verified. Measurements remain gated on authorized plaintext access inside a trusted runner, which must verify all 500 part hashes and source metadata before finalizing the V3 freeze.


Earlier canonical capture run `38547641330` is a blocked forensic artifact and is superseded by the available capture above. The latter is usable as a durable receipt, not as local plaintext. `CALIBRATION-V3-RESUME-STATE.json` distinguishes these states and sets the next step to authorized decryption-capable execution followed by V3 freeze and method checkpoints.

## 52W reconciliation (`REFERENCE_BOOK_RECONCILIATION_FAILED`) – cause attributed

Measurement run 38613060318 measured JT, LowVol and Equal Weight with reconciled books; the GH2004 (52W) top leg failed with a gap of about 15.6 (3.6e-5 relative). Two diagnostic runs (38623481514, 38630329740) replayed the unchanged construction with a no-op daily hook:

- the whole gap appears on one day (2021-04-01, a large rebalance); every other day moves it by at most 3e-9;
- price terms cancel in the book identity, so the leak is in cost/cash bookkeeping; cash matches fills and dividends;
- a per-position cost-conservation audit finds exactly one position that loses cost: 15.608203005 (gap -15.608203006);
- that position has an implausible adjusted price level (first buy ≈ 1.97e11 per share); its remaining ≈ 8e-11 shares fall under the absolute `1e-10` share threshold in `closeShares`, the position is deleted and its residual cost/value is never booked.

This is an infrastructure bookkeeping defect, not a strategy or tolerance issue. The fix is the new `accounting-budget-v3.mjs`: deletion is unchanged (equity, cash, curve, trades and metrics are bit-identical to v2, proven by `accounting-budget-v3.test.mjs`), the deleted residual is booked in a write-off ledger and included in the expected equity. The tolerance `max(1e-6, actual*1e-10)` is unchanged and `accounting-budget-v2.mjs` is untouched. The implausible price level itself is a separate, open data-quality finding; the frozen data contract is not changed here. All four numeric methods are re-measured in one run under a new freeze.

## V3 pipeline (parallel, content-bound)

`supertrader-calibration-v3-pipeline.yml` runs `freeze` (capture, reference sources against pre-registered hashes, freeze with content binding committed before any measurement) → `calibrate` (4 methods in parallel, each re-captures and proves content equality with the freeze, then runs the construction and a separate-code numeric review) → `completion` (only the pre-registered verdict definitions; public, hash-bound receipt) → `tournament` (6 frozen methods in parallel, accounting v3, sealed streaming envelopes) → `publish`. Captures of the same source differ only by timestamps and the async order of read receipts (structural diff run 38658089561); the content binding removes exactly those. A reviewer defect (data-quarantine fills) failed the first full run (38662336631, see `calibration/superseded/RUN-38662336631.md`); the review is not weakened, the case is checked explicitly (R4c).
