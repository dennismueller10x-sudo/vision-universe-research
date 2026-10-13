# Europe449 authenticated live integrity revalidation

The live run used the existing Actions credential; local NOT_CONFIGURED did not stop collection. Initial main was `6f0dd7f6477d31549b7b8454b3cc7f1bd5d4c178`. Core replay landed separately in PR #644. This follow-up adds private evidence tooling, without changing production consumers, prices, identities, analytical methods, capability gates, calendars, UI, Vorsorge or schedules.

## Authenticated collection and budget

- [Primary run 38406637090](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38406637090): 8,828 requests / conservatively reserved credits; all449 included. All 7,812 targeted EOD requests (2,604 filtered, broader and exchange-unfiltered variants each) returned successful, complete single pages, with 820,883 wire rows across overlapping variants.
- [Native run 38419154590](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38419154590): 449 metadata requests / reserved credits. Native strings were unverified lookup hypotheses; no same-primary ISIN/MIC identity passed, so no native history was requested. The 103 US-listing collisions, four empty successful responses, 298 HTTP404 and 44 HTTP406 are evidence of these queries, rather than unsupported-instrument classifications.
- Total: **9,277 requests / reserved credits**, below the 13,000 target and 16,000 hard cap. Remaining: 3,723 target / 6,723 hard. Actual billed credits and account remainder are UNKNOWN.

Original HTTP bodies, request parameters, timestamps, status, complete normalized fields and raw/normalized compressed/decompressed hashes remain in private archives. AES-256-GCM / RSA-OAEP encryption precedes artifact upload; only encrypted pieces and envelopes are uploaded. A read-only relay split the original large encrypted artifact for local download without repeating paid requests. No private recipient key, licensed raw payload or production data is committed. One-use operational workflows, trigger markers, the request plan and recipient public key remain on the audit operations branch, outside this core PR.

## Results and evidence boundaries

All **18,641 missing dates** remain absent in the three complete bound-primary request variants: PROVIDER_CONFIRMED_MISSING in that captured query scope. Recovery, demonstrated query/pagination/mapping bugs: **0**. Economic causes remain **UNKNOWN**; scoped response absence does not establish delisting, pre-listing, suspension, permanent or provider-wide unavailability.

Primary **30,969 quarantine sessions** reconcile as 12,871 still-invalid bars and 18,098 unresolved historical identity holds. The full 50,862 frozen-raw scope has 13,019 still invalid and 37,843 unknown. All 12,489 invalid-Close cases and all 527 positive-Close/OHLC cases are unchanged in fresh evidence. Provider-corrected quarantine bars, certified false positives and recoverable bars: **0**. Historical identity is never certified from current metadata or exchange date_creation.

All98 split/dividend endpoint responses are successful and empty. All47 strong breaks remain unexplained; the nine embedded factors, 5,846 dividend fields and official later EUZ action were preserved and compared. Empty endpoints do not prove action absence or complete corporate-action coverage.

Field comparison found eight changed comparisons across four unique security/date pairs: three raw-volume revisions and one adjusted-OHLC revision. Raw OHLC prices are unchanged. No universal adjustment certification, double adjustment, price estimation or synthetic session is introduced.

Private research rebuild: **1,579,316 real OHLC bars** before and after; zero recovered dates. Technical and Backtest 1Y/3Y/5Y/MAX each have **0 SAFE, 0 PARTIAL, 449 BLOCKED**. Quant and SuperTrader production gates remain closed. All449 series, 319 German identities and nine golden paths are covered. Two rebuilds produced byte-identical bytes for 449 gzip series and four readiness/manifest files.

## Private outputs and verification

The explicitly selected private output directory contains:

- europe_449_live_provider_revalidation.json
- europe_449_missing_session_final.json
- europe_449_quarantine_live_review.json
- europe_449_corporate_actions_live.json
- europe_449_adjustment_final.json
- europe_449_recoverable_bars.json
- europe_449_technical_window_readiness.json
- europe_449_backtest_window_readiness.json
- europe_449_live_integrity_summary.json

The output manifest binds all nine final files. Each retains the completed two-run accounting and evidence-only native supplement; no native price input changed the deterministic series. Full field-comparison records are compressed, individually hash-bound private ledgers.

Independent reviews replayed all9,277 source responses and reservation journals, all18,641 negative-date matrices, all527 OHLC and12,489 invalid-Close cases, all449 field ledgers, 1,579,316 research bars and1,796 window assessments. Seven review areas cover queries, sessions, quarantine, actions, semantics, analytics and regression isolation.

Local full integrity suite: **221 passed / 0 failed**, including operational guards. The merged Core PR passed its49 tests and Core/contract CI; two Quant CI failures were independently isolated on unchanged baseline inputs (registry/Explore mismatch and null calibration). This does not claim whole-repository CI is green. No new browser or UI release is claimed.

Reproduction uses explicit private roots and retained authenticated source archives. The paid collector is optional CLI tooling; no existing refresh or production path invokes it. The private loaders independently verify byte hashes, row containment, query bounds, actual pagination, exact identity and source-session provenance before assigning a status. Same-valued request parameter objects are compared semantically, so key order cannot falsely reject safe evidence; changed values or additional keys still fail.

