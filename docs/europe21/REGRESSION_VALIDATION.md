# Europe 2.1 regression evidence

Baseline: `5d6aa260558fdd0422d07b26038cc383142c86ee`. Checks use Node 22.23.3 and the complete archive of this exact main commit. Earlier Europe 2.0 results are historical evidence only.

## Current main, independently reproduced

The four unchanged test files `canonical-total-return`, `return-series`, `ti-ui`, and `total-return-verification` ran against current committed fixtures: **59 tests, 54 passed, five failed, zero skipped**.

| Failure | Current-main evidence |
| --- | --- |
| CTR18 provider/canonical parity | JPM reports `CONFLICT_CANONICAL_WINS`, rather than `MATCH`. |
| Golden Five adjustment verification | JPM has one `NO_ADJUSTMENT_AT_ALL` event. |
| Two total-return verifier checks | The existing verifier exits 1 with `INCONSISTENT`: 234 of 235 dividend events match. |
| AL-2 delivered watchlist alerts | Current alerts have `previousIndex:true`, `suppressed:null`, no events. The existing UI returns `NONE`; the test expects the earlier migration state `SUPPRESSED`. |

The single JPM mismatch is 2026-10-06: dividend 1.65, previous close/adjusted close 332.38, current close/adjusted close 331.28. The adjustment ratio remains 1 on both days; relative error 0.004988963807335324 exceeds the existing 0.002 tolerance. No prices, dividend fields, assertions, methodology, or generated reports were changed to make these tests pass.

Live GitHub checks for connector #520 (`dd51462f`), Core #523 (`371c5da0`), and foundation #521 (`0048915a`) show the same five Quant failures. Their older-base Core and Currency checks pass. Later Quant workflow steps are skipped after the engine test failure; their success is not implied by local targeted results.

Current-main broad Core execution additionally reproduces one News identity failure: feed symbols `SPCX / TMUS / VZ / T`, `DVN / CRGY`, and `SLYG` are absent from the existing company master. The feed was committed at 2026-10-09T14:01:59Z. The isolated News test reproduces this failure and imports no Europe code. Its test, existing client, identity module and feed all match current-main Git blobs; none were modified.

The broad Quant run also exposes SG1's dated fixture: `endDate:2026-09-08` is 31 days old on 2026-10-09, exceeding the unchanged 30-day classifier threshold. The exact existing classifier returns active/eligible on October 8 (30 days), inactive/ineligible on October 9 (31 days); the test still expects one eligible stock. The unchanged test, builder and classifier blobs match main and an isolated run reproduces it. Current baseline therefore has **one Core and six Quant failures**, rather than the five failures observed in the earlier-base PR CI runs. No threshold, fixture date or assertion was changed.

## Protected baseline

The Git index contains 77,223 main files. A filesystem pass recomputed each Git blob SHA-1 and byte SHA-256. Every indexed file matched current main except the six intentional Discover UI changes, whose original blobs were independently fetched and checked against the index.

The protected subset contains 63,403 files / 1,436,161,248 bytes: current Quant, Discover, SuperTrader, Social, Vorsorge and authoring data; existing Core/provider source; Quant and SuperTrader engines; SEC scripts; and workflows. These files matched main before broad regression. This includes the existing central logo cache/assets in the complete index proof.

Old local Quant, SuperTrader and Social data trees differ from current main and were not imported as fixtures. Tests use the complete current-main archive. Private tests write reports to temporary paths or the private regression directory.

Private evidence: `/workspace/marketstack-europe21-private/regression/`, including `current-main-index-byte-fingerprint.json`, `current-main-protected-fingerprint.json`, `current-main-ui-baseline.json`, `current-main-five-failures.json`, and `current-main-failure-root-cause.json`.

## Final integration validation

The protected broad suites ran once after UI/consumer source freeze, using the complete current-main fixtures. The deferred full Connector/Foundation and ESEF checkpoint subsequently ran after compiler freeze. The later isolated source-range/coalescing changes received their own final targeted validation below; protected broad suites were not repeated.

| Suite | Passed / total | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Connector / Europe Foundation | 295 / 295 | 0 | 0 |
| ESEF foundation | 32 / 32 | 0 | 0 |
| Core | 94 / 95 | 1 baseline | 0 |
| Identity | 26 / 26 | 0 | 0 |
| Market Data | 55 / 55 | 0 | 0 |
| Discover | 345 / 352 | 0 | 7 |
| Screener | 32 / 33 | 0 | 1 |
| Quant | 2,534 / 2,540 | 6 baseline | 0 |
| SEC Node | 57 / 57 | 0 | 0 |
| SEC Python | 490 / 490 | 0 | 0 |
| SEC exporter Python | 32 / 32 | 0 | 0 |
| SuperTrader | 241 / 241 | 0 | 0 |
| Vorsorge | 142 / 142 | 0 | 0 |

Identity, ESEF and SEC subset suites overlap the larger groups; their counts are not an aggregate of unique tests. Optional Discover/Screener checks retain their normal skip behavior; the separately executed real-browser matrix has zero skips. Quant completed in 1,307 seconds under Node22, within the 3,600-second per-suite timeout. The final provider suite contains 23 files and completed in 3.3 seconds; ESEF completed in 0.74 seconds.

Test isolation passes: **63,116 protected dataset files before and after, zero changed paths**, measured with complete SHA-256 snapshots for Quant, Discover, SuperTrader, Social, Vorsorge and authoring owner data. This comparison cannot detect a transient write followed by exact restoration; temporary-output contracts remain a separate guard. Private final status: `regression/broad/local-regression-status.json`.

After the final targeted source-range/coalescing tests, all **77,223 indexed files** were rehashed against current-main Git blob IDs and byte SHA-256. No files are missing and no unexpected existing files differ. All **63,403 protected files** remain exact main bytes, including US engines/data, schedules and the central logo cache/assets. The only seven existing-file changes are the six scoped Discover UI files and the explicit Europe opt-in in `screener/engine/adapters.js`; its five-line patch preserves default US behavior. Evidence: `regression/final-index-byte-fingerprint.json` and `regression/final-protected-source-summary.json`, generated 2026-10-09T16:14:36Z.

Final real-browser synthetic-fixture evidence has been independently checked: Chromium mobile, WebKit desktop and WebKit iPhone13 emulation each pass, use zero provider requests, and load seven view resources / 179,991 decoded bytes (limits: 12 / 180,000). Across twelve axe flows, including existing US detail, Europe Search, light detail and dark Watchlist reload, there are zero violations. iPhone coverage is Playwright device emulation, not a physical-device test. The owner browser test suite reports 10/10 with zero skips.

Independent targeted checks: final quality/actions/history overlay/resolution/compiler/MIC-policy combination **106/106**, zero failures/skips; final official-fundamental mapping 17/17; credit-model/report 13/13; signed collector/security 8/8. The 295/295 full-provider row records the earlier complete checkpoint; 106/106 records final changed-source validation. Relaxing an identity interval or advancing the completed-session calendar cannot release protected cached bars into either chart `validBars` or the feature projection. The fundamental semantic reproductions reject wrong concept, negative assets, wrong fiscal year and currency spoofing, while the supported positive fact remains research-only `PARTIAL`; no local EPS/shares, Quant Full or ranking admission is certified.

The final targeted fix binds each cached/current history operation's own request range by authenticated normalized SHA. The original independent repro is now rejected: an October 8 bar returned for an October 9-only request remains raw-preserved with `OUTSIDE_REQUESTED_RANGE`, outside chart and technical input bars. Coalescing permits only individually valid identical OHLCV/currency observations from distinct authenticated operations, retaining every source receipt; same-operation duplicates, conflicting or out-of-range members and protected dates cannot be hidden. Evidence: `final-range-coalescing-quality.tap`, `overlay-source-range-repro-final.json` and `final-range-coalescing-source-approval.json`.

A subsequent metadata-only Germany projection correction passes its independent single-test check, **1/1**, in addition to the 106-test source checkpoint. Actual filtered rows reconcile to 704 candidate keys, 154 accepted, 548 review, two rejected, 149 companies and 154 distinct classes/listings. Europe remains 3,170 candidates, 261 accepted, 2,907 review, two rejected and 255 companies. The original manifest was independently reconstructed and matches `96709a85…`; the corrected-country snapshot matches `629a6493…`, and the subsequent index-label metadata chain matches `49b3eaac…`. All 16 current file hashes were checked. Country correction preserves all 14 unrelated outputs; price, Core, universe, admission and readiness remain unchanged through both metadata steps. Source receipt binds original runtime `db6b380f…`, country helper `91f0df41…`, its exact script, and the later index helper `ad8a0062…`; the country function is unchanged in the later source. No full replay or protected broad test rerun was required. Evidence: `germany-cohort-projection-test.tap`, `pre-country-manifest-reconstruction-proof.json` and `final-country-projection-independent-review.json`.

No public licensing gate, schedule, Quant population, US scoring methodology, or SuperTrader strategy is enabled by this validation.
