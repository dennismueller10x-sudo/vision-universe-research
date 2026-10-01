# Marketstack PR #334 — final engineering evidence

Finalized from frozen evidence on 2026-10-01T19:14:02.876Z. PR #324, accepted PR #330 and existing PR #334 implementation remain the baseline. **Provider decision deferred; no production activation, routing change, Tiingo removal or SEC/ESEF migration.** All referenced machine artifacts are committed beside this report.

## 1. US consumer coverage and remaining gaps

The protected consumer membership contains **6,419 records**, including non-common asset roles. Exact directory identity coverage remains **5,423/6,419 (84.48%)**; valid latest coverage remains **5,018/6,419 (78.17%)**. All 1,401 non-valid-latest records have individual explanations in [us_marketstack_consumer_final.json](../reports/marketstack/us_marketstack_consumer_final.json).

Retained US benchmark: 7,803 records, 6,738 exact directory matches, all 1,065 non-exact records individually classified; 19 preferred-series identities resolved, 15 with passing latest price, zero additional accepted consumer-equity matches. Current ticker/class/exchange evidence does not automatically prove historical issuer continuity.

The conservative independently current common-share-class subset is **4,755**, with **4,246 current-listing identities** and **3,968 valid latest observations**. Its 787 named price gaps are individually listed in `relevantCurrentCommonStockGaps`. Explicit depositary/debt and unresolved fund/beneficial-interest company roles are excluded from this subset, without changing protected membership. The complete legally verified active-common-company denominator and `GENUINELY_UNSUPPORTED_ACTIVE_COMMON_STOCKS` remain **null**, not zero: bounded route failures do not establish global provider absence.

The original 478 current-MIC gap candidates remain fully measured. A further 44 explicitly described common-share candidates were tested in three venue-qualified batches: **40 empty-array placeholders, zero identity-bearing price objects**. These are malformed/identityless batch responses, not 40 prices or proof of 44 unsupported securities. Source response cardinality and missing-symbol attribution remain separate. AIHS→VAI official symbol-transition evidence is retained, while contradictory provider security identifiers block automatic alias promotion.

## 2. Germany: companies, securities and consumer selection

Eight complete German directories contain 172,913 instruments. The earlier 11,487 number is a count of broad equity-candidate **listing identities**, not German companies: 11,612 raw observations, 125 provider aliases, 10,808 security ISINs and 679 securities observed on multiple German venues.

Official ANNA/GLEIF/FIRDS issuer and security-type reconciliation identifies **432 German-domiciled ordinary/preferred-share companies** (427 German-incorporated), **441 reference-active securities** (424 ordinary / 17 preferred) and **790 venue listings**. Reference-active means official listing status, not guaranteed recent trading. There are **9,388 foreign CFI-equity listings**, versus 10,529 broader foreign candidates; 80 issuer-listing identities remain ambiguous.

**218 one-company research proposals** are selected from 226 validated security candidates. These have identity/recent EOD evidence and only PARTIAL liquidity confidence. Existing policy remains **250 bars / USD 5 million average daily turnover**, with verified price/primary-listing requirements; **zero companies are fully verified to pass this complete policy**, and the actual investable count remains null. No guessed FX conversion, arbitrary market-cap cutoff or policy relaxation. Eight very-low-volume samples are separately cautioned. Receipt/collective-investment/REIT-policy ambiguities stay outside the ordinary/preferred company count. Full German coverage remains unmeasured in the untyped venue population.

See [Germany company finalization](MARKETSTACK_GERMANY_COMPANY_FINALIZATION.md), [company/listing artifact](../reports/marketstack/germany_company_listing_finalization.json) and [consumer-selection artifact](../reports/marketstack/germany_consumer_selection.json). Trading/reporting operator LEIs and cross-source conflicts are quarantined rather than counted as German issuers. Existing 58 accepted records, 278 histories and all 6,922 canonical listing records remain byte-identical.

## 3. Europe: domicile versus trading geography

Twenty complete directories contain **260,657 instruments**. 13,393 typed broad-equity observations reduce to **13,164 listing identities / 11,288 ISINs**. Confirmed CFI-E security classes cover **12,977 listings / 11,102 ISINs / 10,030 identified issuers**, including 9,739 issuers with ordinary shares. This includes foreign firms traded in Europe; it is not a European-company count. Across the requested 13 domiciles there are **3,471 identified CFI-E issuers**, including 3,417 ordinary-share issuers.

| Issuer legal domicile | Identified CFI-E issuers | Reference-active CFI-E securities |
| --- | ---: | ---: |
| DE | 434 | 523 |
| FR | 449 | 474 |
| NL | 104 | 120 |
| BE | 101 | 96 |
| IT | 275 | 256 |
| ES | 115 | 139 |
| AT | 46 | 52 |
| CH | 195 | 58 |
| GB | 723 | 789 |
| DK | 116 | 105 |
| SE | 571 | 557 |
| NO | 194 | 191 |
| FI | 148 | 134 |

CFI-E includes depositary classes; securities and companies are distinct. German figures in this European table include German issuers/receipts traded on additional European venues; the ordinary/preferred German-venue population in section 2 is narrower. Activity comes from official listing references, not a complete recent-price census.

Ninety candidate ISINs have withheld issuer identity: 65 source conflicts, 23 reporting-operator proxies and two unmapped. Of 184 listings outside confirmed CFI-E classes, 183 are collective-investment classifications; a corporate REIT can have such a class, so this does not automatically mean ETF or non-company. The QFG metadata-only canonical overlap remains a documented regulatory-subtype ambiguity with no price/fundamental/technical admission. Additional UK/Austria/Spain operator candidates stay separate, including GBX quote units. Complete country/company/consumer-eligible totals remain null where directories are untyped. See [European company/listing census](../reports/marketstack/europe_company_listing_census.json) for country and exchange populations, and [Global Select coverage](../reports/marketstack/global_select_marketstack_coverage.json) for the preserved international/ADR assessment.

## 4. Quality/freshness flags

All **454 previously unresolved flags** are classified to the available evidence. Original six venue removals remain separate. The final classification of those 454 is:

| Classification | Flags |
| --- | ---: |
| CORPORATE_ACTION | 1 |
| EXPECTED_STALE | 10 |
| IDENTITY_MAPPING_ERROR | 16 |
| INVALID_OHLC | 29 |
| PROVIDER_DATA_QUALITY | 358 |
| PROVIDER_SYMBOL_ERROR | 3 |
| UNKNOWN | 37 |

Six original and ten additional exact-class/venue SEC removal notifications explain stale observations; one documented ticker transition explains a further identity/corporate-action case. Currency-contract defects, impossible OHLC and role/mapping contradictions are measurable defects, but no unsupported causal story is inferred. **37 remain UNKNOWN**. All **460 original rejected Marketstack observations remain unsafe for EOD/Quant/chart admission**, with zero automatic repairs; this does not disable protected Tiingo charts or retained historical listings. Zero volume alone does not establish suspension; tested stale dates are not explained by a market holiday. See [per-flag evidence and safety gates](../reports/marketstack/us_marketstack_quality_final.json) and [independent SEC class-removal/transition crosscheck](../reports/marketstack/us_marketstack_class_removal_crosscheck.json).

## 5. Adjusted-price compatibility

**17 exact-listing controls / 15 with returned prices** cover splits, reverse splits, ordinary/large/special dividends and European compound actions. AAPL/NVDA bounded adjusted-return comparisons match Tiingo numerically, but only AAPL has provider-declared historical currency. NVDA historical `close` is as-traded around its split while volume is already split-scaled; AAPL pre-split close and volume are split-scaled. `close` therefore has no demonstrated universal raw basis, and an `adj_close` field alone is no certification.

COST's USD 15 special dividend has independent issuer evidence, 18 valid bounded raw candles and a numerically consistent adjustment-factor step. Its historical provider currency is absent; official independent ex-date remains unknown. IAU reverse-split gaps and unresolved European action/dividend behavior prevent full adjustment certification. No reconstructed or double-adjusted prices.

| Use | Marketstack new-series status |
| --- | --- |
| Existing scoped native-currency EOD charts | Preserved; PARTIAL coverage and explicit dates |
| Newly proposed continuous/adjusted charts | Window-dependent, fail closed on identity/currency/action defects |
| Moving averages / 52-week highs / momentum | No full-series certification |
| Quant / technical SuperTrader strategies | BLOCKED for new uncertified series |
| Backtesting | BLOCKED for new uncertified series |

See [compatibility matrix](../reports/marketstack/marketstack_adjustment_compatibility.json). No European realtime claim: empirically admitted international/ETF samples remain EOD_ONLY. Tested US current-session availability did not prove Tiingo live equivalence; Tiingo runtime remains unchanged.

## 6. ETFs: distinct share classes, holdings and metadata

Europe: **6,423 listing candidates / 2,933 ISIN share-class/security candidates**, 2,004 across multiple venues and 2,338 with at least one reference-active listing. A distinct legal-fund count remains null. US: **3,217 primary-MIC ETF flags**, 3,131 without observed identity conflict, only 30 nonconflicting observed ISINs; complete US/global legal-fund and share-class totals remain null.

UCITS name-label estimate: **2,471 ISINs / 4,781 listings**; zero regulatory UCITS authorizations verified. Holdings returned usable positions for **18/34 observations** (18/31 US, 0/3 tested European listings), all PARTIAL; two reports fall within the 120-day threshold, **zero verified complete current portfolios**. Duplicate, negative, cash/derivative, missing-ID and weight-total problems remain reported without reweighting.

The required 16-field [metadata matrix](../reports/marketstack/marketstack_etf_metadata_matrix.json) distinguishes provider from official supplemental evidence using AVAILABLE/PARTIAL/NONE/UNVERIFIED. Price history, ISIN, holding weights and some issuer/domicile fields are partial and listing-scoped. Dividend history is UNVERIFIED (zero verified clean ETF dividend series), and sector exposure is NONE. UCITS, TER/OCF, AUM, benchmark, distribution policy, replication and complete current country exposure are not reliable universal provider fields. German WKN references retain their raw nine-character representation; no unverified stripping to six characters. See [ETF identity reconciliation](../reports/marketstack/marketstack_etf_identity_reconciliation.json). ETFs remain outside company growth/EPS/valuation/CANSLIM/Factor-DNA admission.

## 7. Requests, provenance and scaling

This resumed run used **47 additional estimated credits in six requests**: COST 3/3, refined US current-MIC diagnostics 44 credits/3 batches. Cumulative follow-up ledger: **2,952 reserved requests / 5,841 estimated credits**; accepted-prior plus follow-up estimate **13,065–13,067**. Public regulatory-source reads consume zero Marketstack credits. Actual provider billing, account balance and other account usage remain unavailable. Under the documented, unverified 100,000 monthly allowance, this tracked estimate leaves approximately 86,933 credits before other usage; another bounded validation run is conditionally affordable, not account-balance certified.

The final private materialization contains 3,275 responses: 335 exact original-Action content origin proofs, 2,934 explicitly interval-inferred origins and six explicit new-run origins; zero unknown origins. Response dates/bodies and source ledgers remain unchanged. Public artifacts retain their own input/response hashes and scoped original runs. Legacy US instrument IDs are preserved separately: canonical `listing_id` stays null where the accepted US master does not supply one; qualified symbol/MIC keys are recorded without reinterpreting an instrument ID as a listing ID. Replay is deterministic and paid calls are not needed to regenerate artifacts.

At venue-qualified 100-symbol batches: 278 priced listings cost 20 daily HTTP requests / 278 symbol credits, or 5,838 credits over 21 sessions. Full 6,922-listing foundation: 82 requests / 6,922 daily credits, 145,362 monthly. Protected 6,419 consumer records: 134,799 monthly credits. Fifteen-year four-page-per-listing foundation backfill estimates 27,688 credits excluding actions/metadata/retries. HTTP batching does not remove symbol-credit costs; no full repeated backfill or production cutover is enabled.

## 8. Tests and product readiness

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Full `node --test quant/tests/*.test.mjs` | 2,497 | 0 | 0 |
| Discover/Screener/SuperTrader/Worker product suites | 455 | 0 | 5 existing |
| Full SEC unittest suite | 484 | 0 | 0 |
| ESEF unittest suite | 7 | 0 | 0 |
| Fundamental/product serving Python | 32 | 0 | 0 |
| Resource-budget unit suite | 6 | 0 | 0 |
| Discover browser | 201 | 0 | — |
| Quant release browser / resource gates | 90 / 8 | 0 | — |
| Exact-head production smoke / journey surfaces | 140 / 12 | 0 | — |
| All priced + sampled metadata listing APIs | 290 | 0 | — |
| New chart/watchlist journeys / global+legacy smoke | 8 / 63 | 0 | — |
| Bounded published search queries | 6 | 0 | — |

Quant browser was rerun with the same Chromium 145.0.7632.6 / Playwright build 1208 used in GitHub: 90 functional checks, all eight unchanged resource budgets, 76 accessibility pages and zero violations. Each resource-budget route now starts in a fresh isolated browser context. The original `about:blank` reset retained image/request history: native-prefetch0 alone passed one CI run but still failed a repetition after the real prior GARP strategy loaded the same photo. This was independently reproduced at both widths without blocking or filtering requests, and corrected only in QA. The cold initial-viewport measurement fixes Chromium’s connection-dependent native lazy-image prefetch distance at zero **only in QA**, counts every fetched resource, and waits for used layout fonts and the visible logo before capture. The real strategy photo is separately scrolled into view, loaded and decoded at both widths. Stock final cold initial-view observations: 5,461,156 decoded bytes and 37 requests at both widths; these are scoped observations, not a claimed product-traffic reduction. This normalizes measurement; it is not a product network improvement or a full-scroll payload budget. Discover: 16 accessibility scans. Search uses 2–3 requests and 35,676–57,011 decoded bytes, with bounded results and no whole-universe browser payload. Build, release/resource gates, public-data hygiene and secret checks pass; thresholds were not relaxed. Real cached LVMH replay preserves 12 facts, PIT/provenance and the original 543 diagnostic multiset. Professional fundamental entitlement results are reused; no invented cross-validation.

Identity/Search/Watchlists: WORKING for the accepted foundation. Charts: PARTIAL, 278 delivered / 6,644 metadata-only, explicit EOD dates/native currencies. Discover/Screener/Quant/SuperTrader/Markets: protected US functionality WORKING; new global eligibility PARTIAL/BLOCKED where required history, fundamentals, adjustments or market-regime evidence is missing. No global scores or fake zero fundamentals enabled. Historical seven remote regression workflows pass on source commit `a08adb58b9a858379d98e70683cee3a52077f23e`. Its freshly built exact-head local release passes 140 smoke and twelve journey checks; SEC delivery is 4,895,565 bytes under the unchanged 8 MiB budget with canonical R2 storage unchanged. The separate PR-only package workflow was cancelled before any job on three attempts because the existing shared production queue replaced its pending run. A subsequent PR-only package on `5eaf689d623c289504a87df33689f93271476f4a` succeeded and its deploy job was skipped; the shared-context browser failure on that source led to the isolated-context QA correction above. No production job or concurrency rule was changed. Exact commands and result scopes are in [machine test results](../reports/marketstack/marketstack_scale_tests.json) and [reproduction instructions](MARKETSTACK_SCALE_REPRODUCTION.md).

## 9. Protected regressions

Independent before/after byte manifests show zero changes in **23,538 protected US-price files, 2,864 identity files, 6,130 SEC files, 6,078 Discover artifacts, 3,315 Quant artifacts and 154 provider/job files**. The complete accepted PR #334 canonical/product-directory baseline of **2,690 files** is also byte-identical, including all original 58 records/charts. No existing API/route/schedule, Tiingo live configuration, Cloudflare secret or production routing change. Independent reviews cover fund/equity ambiguity, operator-LEI proxies, issuer/source conflicts, per-response provenance, currencies, stale/source attribution and fail-closed eligibility.

## 10. Remaining limitations and decision evidence

No execution-environment blocker remains. Genuine remaining evidence limits are untyped provider directories, contradictory issuer/security mappings, identityless/wrong-venue latest responses, incomplete legal-common-company/complete ETF identification, uncertain historical native quote units and adjustment semantics, partial/stale ETF portfolios and missing metadata, Professional fundamental entitlement and unavailable actual account balance. None becomes a synthetic price, score, fund field or production migration. Vercel preview capacity/rate-limit failures are external; local release/browser gates pass, without buying a plan or altering production deployment.

The final evidence supports a later user decision about Marketstack-only, complementary Tiingo, higher allowance/tier or another future provider. **This run makes no provider decision.**
