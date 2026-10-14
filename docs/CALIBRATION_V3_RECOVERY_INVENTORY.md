# Calibration V3 Recovery Inventory

As of 2026-10-14, branch `research/supertrader-calibration-v3-durable` starts at PR #643 head `cc9ecb5b677035338f034cd0f3c21a24b02c9fa2`. PR #643 remains Draft and unmerged.

## Verified reusable state

- All 23 file hashes in `BACKTEST-CALIBRATION-FREEZE-V2.json` match; its SHA256 is `fbb725dd758f9dbad2d936db1fc84df757e3f87bfb72a75275ea85724bd02507`.
- The binary64 budget/cash-rounding defect and isolated V2 fix are recorded as proven and independently reviewed. This proves an infrastructure defect, not causation of the specific 52W failure.
- The positive finite execution-open guard and test are present.
- The local parser variable was renamed from `token` to `monthCell` without changing parser logic. Its focused suite passes 22/22; the scanner pattern returns no matches. The V2 hash bindings for the parser and its test are historical on this branch; the candidate V3 freeze records the new hashes.
- Two JT Momentum constructions are reported complete in a prior checkpoint, but their private bytes and cryptographic bindings cannot be verified here. V3 must reproduce them if no readable durable artifact is recovered.

## Missing durable inputs/results

The freeze-bound canonical manifest, source metadata and historical canonical data parts are not readable in this checkout. The parsed academic reference file and reference source plan are also absent. The frozen V2 runner requires exact hashes for these assets, so no calibration calculation can pass preflight. No six non-momentum result artifacts or method checkpoints are present.

The durable repack manifest indexes 116 individually retained encrypted bundles (1,734 input files, 2,797,586,294 packed bytes); each GitHub artifact ID, expiry and outer SHA256 plus each inner encrypted bundle SHA256 is recorded in `CALIBRATION-V3-PRIVATE-ARTIFACT-RECEIPTS.json`. Status says `decrypted: false`, `providerReads: 0`, `performanceCalculated: false`. The manifest artifact is ID `11802072231`, run `38374493235`, expires `2026-11-12T09:43:22Z`, zip SHA256 `189248ebe02bbd09e191e8625dbec5bca3f70333706f7a3c784b7b760b74c1e7`, internal manifest SHA256 `7df4b8f2184309a623029855514b24395eb47cfdeb35af8dd8510aa67ed237ee`. These are encrypted current-capture inputs, not the historical canonical PIT panel. A current-capture Actions artifact is also retained: artifact `11802445766`, run `38374493235`, expires `2026-11-12T09:42:55Z`, zip SHA256 `50aa3d67c1be47dc50ff415b170f2fbd5cbd7c178bdeb2b54a66c31dbe681db5`. It is encrypted/sealed and its recipient scheme is not recorded in the public receipt; it does not provide readable historical canonical inputs here.

## 52-week-high reconciliation

Cause remains unresolved. The failed-book numeric trace and the specific canonical/reference inputs are missing. The binary64 defect is plausible at the accounting boundary but has not been causally linked to this failure. No tolerance was moved.

## Next durable step

Capture the exact canonical historical input set and academic reference sources into a durable manifest plus encrypted Actions artifacts, record artifact IDs/run/expiry/content and schema hashes, verify all hashes in a fresh executor, and create a premeasurement V3 freeze. Then execute one calibration method at a time, writing and committing its output, review and resume checkpoint before advancing.

`CALIBRATION-V3-RESUME-STATE.json` is the authoritative restart pointer. Current status is blocked before measurement; no performance values, certification or tournament rerun are claimed.


Current capture safe status (run 38374493235, 2026-10-12): 10 methods, 0 eligible, 6 partial, 4 blocked; exact closed session available; 866 source-input chunks; 0 forward records; final review pending. Its result artifact is retained until 2026-11-12 and its owner/session payloads remain encrypted. These counts are diagnostic only, not qualified signals.


The fresh-resume validator is `scripts/supertrader/research/calibration/verify-v3-durable-state.mjs`. Its next engineering prerequisites are a V3 measurement runner and a provider-backed historical source-capture workflow; neither is present yet. The 2026-10-12 current capture is diagnostic and still review-pending.


Fresh-executor status reconstruction passed from a new sparse clone of the pushed V3 branch using `node scripts/supertrader/research/calibration/verify-v3-durable-state.mjs`. This verified only the persisted inventory/checkpoint/receipt graph; it did not decrypt private inputs or run a calibration.


A read-only canonical inventory workflow is now configured to run on a tagged push to the V3 branch. It will capture a new, hash-addressed historical input manifest and preserve only encrypted source inputs plus safe status in Actions artifacts. Measurements remain gated on verifying that run and building the V3 runner/freeze.


Historical canonical capture is running in GitHub Actions run `38547641330` on commit `110853d3b678d2dc88d2329f8e1d4459597b9bca`; resume state now records its exact ID and next command.
