# Marketstack scale run: measured evidence and execution status

Measured on 2026-10-01 against PR #324 and accepted PR #330 commit `944b97c80d17c941c50d3e272f2070dfaed82490`. Draft PR #334 is stacked on #330. **Provider decision: DEFERRED. Production activation: NO.**

**Publication limitation:** The execution environment disconnected during final provenance hardening and audit regeneration. The implementation and canonical expansion are committed in this draft. Detailed machine artifacts and the full engineering/replay documentation were generated in the workspace but have not all been published to this branch. Their final regeneration/hash refresh and the remaining provenance edits are pending environment recovery. This document preserves measured findings without claiming completion.

## 1. Result

The implementation reuses the existing Marketstack client, normalizer, identity model and product directory. It adds resumable bounded collection/recovery, exhaustive gap analysis tools, guarded metadata/history publication and bounded search.

Canonical foundation: **6,922 listings: 2,366 equities / 4,556 ETFs**. **278 delivered histories / 6,644 metadata-only listings**, with 25,818 public close observations. New price ingestion adds 218 German listings and Schneider Electric/Roche: 2,802 accepted observations, 20 quarantined. All original 58 records and chart files remain unchanged. No new company fundamental scores or strategy admission.

## 2. US gaps

| Measure | Count |
| --- | ---: |
| Retained records | 7,803 |
| Original exact directory matches | 6,738 |
| Non-exact records individually classified | 1,065 |
| Preferred-series identity resolutions | 19 |
| Resolved identities with passing latest price | 15 |
| Protected consumer denominator | 6,419 |
| Consumer directory matches | 5,423 (84.48%) |
| Consumer valid latest observations | 5,018 (78.17%) |
| Additional accepted consumer-equity matches | 0 |

All 478 independently current-common consumer gap candidates were tested at their current MIC: 460 empty replies, 13 wrong-MIC replies, five venue-specific 422 errors. Alternate routes produced 317 same-symbol observations, 287 structurally valid USD latest observations; these are not accepted same-listing matches. Another 333 independently identified securities retain provider venue conflicts. **Globally missing active-common-equity count remains UNKNOWN**: required-venue failures do not prove global provider absence. Every row is present in the generated workspace classification/cache artifacts.

## 3. Quality flags

Original 460: 342 currency mismatches, 20 asset-type conflicts, 53 stale observations, 29 invalid OHLC observations, 16 missing currencies. Six stale endpoints have independently documented class/listing-removal explanations. Remaining 454 are unsafe or unresolved; they are not all declared provider faults. Rechecks corrected zero flags.

## 4. Germany

Complete provider directories: XETR 8,959; XFRA 91,828; XBER 16,288; XMUN 15,617; DUSD 14,000; XSTU 17,932; XHAM 5,332; XHAN 2,957. Total 172,913 records. Eight other tested cash MICs returned errors.

Same-venue official T7 joins identify 11,612 equity records, **11,487 distinct equity listing identities** after aliases, 10,808 equity ISINs, and 4,244 ETF candidates. These include foreign secondary listings; they are not a German-company/common-stock count. 2,436 records are explicitly excluded other types; 154,621 remain unclassified.

All 680 Xetra equity candidates have metadata and recent-week request evidence: 247 exact identities, 427 unverified, six contradictions. Combined gates admit 240 current price candidates; seven exact identities lack price. Contradictory FRE/DKG/CLIQ/SFQ/HABA/STM are excluded from new admission.

Index local-ISIN directory coverage: DAX 40/40; MDAX 47/50; SDAX 65/70; TecDAX 29/30. Delivered histories: 37/44/51/25; at least 200 observed candles: 19/2/2/4. No ADR substitution or historical membership/PIT assertion.

Ten ascending controls begin at 2010-01-04 in their returned samples; this does not certify complete, gap-free history. New German one-week histories do not establish 200-day technical eligibility.

## 5. Europe

Twenty complete directories across 13 requested countries: 260,657 provider records, **13,393 typed equity candidate observations / 6,423 European ETF listing candidates**, with 11,288 equity ISINs / 2,933 ETF ISINs.

| Primary venue | Instruments | Strict equity candidates | ETF candidates |
| --- | ---: | ---: | ---: |
| DE XETR | 8,959 | 674 | 2,374 |
| FR XPAR | 4,673 | 331 | 445 |
| NL XAMS | 2,713 | 111 | 276 |
| BE XBRU | 238 | 108 | 1 |
| IT XMIL | 3,271 | 207 | 0 |
| ES XMAD | 1,001 | 2 | 0 |
| AT XWBO | 2,813 | 2 | 0 |
| CH XSWX | 29,075 | 231 | 1,456 |
| GB XLON | 36,699 | unmeasured outside validated subset | unmeasured in strict tier |
| DK XCSE | 2,081 | 107 | 0 |
| SE XSTO | 4,376 | 379 | 0 |
| NO XOSL | 599 | 182 | 1 |
| FI XHEL | 205 | 127 | 0 |

Frankfurt additionally contributes 10,932 strict equity observations / 1,870 ETF candidates; the other six German directories remain unclassified. Country means listing venue, not issuer domicile.

A separate official operator tier adds 3,928 mnemonic candidates without canonical admission: London 1,240 SHRS / 29 depositary receipts / 2,555 ETFs; Austria 36; Spain 68. SHRS includes possible trusts/fund shares. 1,947 joined GBX lines retain pence units separately from GBP currency. Austria metadata corroborates 33 ISIN/provider operating-MIC identities; 245 valid bounded OHLC bars across 35 symbols lack provider currency. Spain has 122 official SIBE shares, 73 resolved public details and 49 HTTP403 failures. Operating/segment MIC boundaries remain explicit. These candidates do not inflate strict counts.

## 6. Global Select

Thirteen requested companies assessed; twelve local bounded histories returned, MercadoLibre uses existing US data. Seven local listings are canonically delivered: Samsung Electronics, SK Hynix, Tencent, BYD, MediaTek, Hon Hai and Reliance. Japanese local quote-unit/adjustment proof remains insufficient for new admission. Existing TM/SONY/MELI and protected TSM/BABA/XPEV/JD/BIDU preferences remain intact.

## 7. ETFs

European census: 6,423 listing candidates / 2,933 ISINs. Current US official-flag census: 3,217 exact primary-MIC candidates, 3,131 without observed identity/type conflict, 86 quarantined. The US flag does not independently verify fund legal structure. No verified global ETF or UCITS count is asserted.

45 bounded history windows returned 99,326 rows across 119 pages. Delivered pagination does not certify OHLC/identity/adjustment quality. Holdings: 34 observations, 18 usable PARTIAL fund-series reports, 16 stale under a 120-day threshold; two within threshold. **Zero verified full current share-class portfolios.** Duplicate lines, negative weights, missing identifiers and total-weight anomalies remain visible.

The 30-field matrix separates Marketstack from official supplemental metadata. Names/tickers/exchanges/prices and partial holdings are evidenced. UCITS authorization, TER/OCF/AUM/NAV, complete current holdings, tracking difference/error and several fund attributes remain unavailable or unknown. No synthesis or automatic reweighting.

## 8. Adjustments

Novo Nordisk local and Sony retain split-sized adjusted-price gaps; Toyota exposes repeated split factors on already continuous prices. Nintendo raw continuity makes double application unsafe. ASML's compound capital repayment/consolidation is not represented consistently by action endpoints. German dividend endpoint replies can disagree with EOD dividend fields.

Charts remain scoped EOD displays with PARTIAL coverage. **New series are not certified for Quant or backtesting.** No reconstructed prices or automatic action application.

## 9. Live / intraday

Tested German/European/Asian/ETF admitted samples are EOD_ONLY. US NVDA/SPY IEX data remained at September 30 20:00 UTC during October 1 market-open retrieval; current-session requests were empty. Current-session availability failed in tested routes; replacement equivalence remains UNKNOWN. No REALTIME/NEAR_REALTIME/DELAYED guarantee. Tiingo live routing remains unchanged.

## 10. Fundamentals

SEC 484 tests pass; ESEF seven pass. Real LVMH replay preserves 12 canonical facts, PIT and provenance; its 543 pre-existing diagnostics remain unchanged as a multiset. Professional fundamental entitlement failures are retained without repeated paid probes. No fundamental overwrite, SEC migration or ESEF rewrite.

Minimal N-PORT correction separates actual holdings as-of date from fiscal year-end using official SEC schema; neither signing nor retrieval is treated as public filing availability.

## 11. Products

Identity, Search and Watchlists: WORKING for delivered foundation, with issuer linkage still partial. Charts: PARTIAL (278 priced / 6,644 metadata-only). Discover, Screener, Quant, Factor DNA, Rankings, SuperTrader, Markets and Research: protected US functionality working; broader global readiness PARTIAL. ETF identity/search/watchlists work, with 12 delivered ETF charts; company-only engines stay protected. Native currencies are retained. Six search queries used 2–3 requests and roughly 35–57 KB; no full-universe browser payload.

## 12. Request economics

Eight successful Action runs reserve **2,946 attempts / 5,794 estimated additional credits**. Original-plus-follow-up estimate 13,018; prior uncertainty ceiling 13,020. Actual billing/balance/other usage remain UNKNOWN. Documented Professional allowance is 100,000/month, not independently verified account balance.

One credit per symbol/page assumed conservatively. At 100-symbol venue-qualified batches: 278 priced listings need 20 daily requests / 278 credits; full foundation 82 requests / 6,922 credits. A 21-session month estimates 5,838 / 145,362 credits respectively. Protected consumer scope estimates 134,799 monthly credits. Fifteen-year, 1,000-row-page per-listing backfill estimates 27,688 credits for the foundation, excluding metadata/actions/retries. No full recurring cutover or uncontrolled backfill.

## 13. Tests

Local full Quant: 2,394 passed, zero failures/skips before subsequent provenance hardening. Related product suites: 455 passed / five existing skips / zero failures. SEC 484; ESEF seven; serving Python 32; resource-unit six. Discover browser 201 checks; controlled Quant release 88 functional/eight resource/76 accessibility pages, zero violations. Global checks cover all 278 priced listings, twelve metadata cases, eight new chart/watchlist journeys, 63 legacy/global smoke checks and six bounded searches.

Targeted provenance/collector tests passed; ETF owner reports 91 tests passed after its provenance correction. Final regeneration and complete exact-head validation remain pending. GitHub CI on committed implementation is separately observable in PR #334. No resource thresholds were relaxed.

## 14. Regressions

Independent byte comparisons show no changes in 23,538 protected US price files, 2,864 identity files, 6,130 SEC files, 6,078 Discover artifacts, 3,315 Quant artifacts and 154 protected provider/job files. All 58 accepted global records/charts unchanged. No Tiingo removal, existing route/schedule changes or Cloudflare modification.

## 15. Remaining blockers

Provider identity/MIC/currency/type defects, ambiguous legal classifications and quote units, unsafe adjustment semantics, insufficient current ETF holdings/UCITS attributes, fundamental entitlement and unread account balance remain real data/account limitations.

The execution environment is offline. This additionally blocks final machine-artifact publication, provenance regeneration/hash refresh and verification of any pending source edits. Do not treat this draft as completed or migration-ready.

## 16. Next decision evidence

Coverage, current consumer gaps, adjustment defects, live limitations, holdings quality and symbol-credit scaling now inform a later choice. This run selects none of Marketstack-only, Marketstack+Tiingo, a higher tier or EODHD. Resume the frozen evidence/provenance publication when the environment is restored; no additional paid calls are required to finish it.
