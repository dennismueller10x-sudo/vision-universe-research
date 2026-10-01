# Marketstack global expansion — engineering report

> This document records the accepted PR #330 baseline. Current scale measurements, expanded branch data and deferred provider decision are documented in [MARKETSTACK_SCALE_ENGINEERING_REPORT](MARKETSTACK_SCALE_ENGINEERING_REPORT.md). Production Tiingo/SEC/ESEF routing remains unchanged.

Measured 2026-10-01. **Decision C: Marketstack and Tiingo remain complementary.** This branch prepares a bounded, real-data global equity/ETF foundation. It does not activate a production migration, replace Tiingo, or claim complete global coverage.

The implementation is in [draft PR #330](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/330), stacked on the exact accepted PR #324 head, `d10d09eddeb0b6869550e38920d0e2f10818919e`. That baseline PR is still an open draft rather than merged main. The existing Company → Security → Listing model, US universe, Tiingo runtime, SEC/ESEF pipelines and production schedules remain protected.

## 1. Result

Implemented a server-only Marketstack client and normalization adapter, bounded/resumable ingestion, complete retained-US identity comparison, latest-price testing of every matched US listing, global discovery/classification, canonical ETF structures, diagnostic fundamentals comparison, coverage/quality gates, and shared product delivery.

The prepared extension contains **58 listings: 46 equities and 12 ETFs**, with **23,016 accepted candles** and **1,394 quarantined provider observations**. It includes 23 German-venue equity listings, 16 other European equities, seven Asian equities, nine Xetra ETFs and three US ETFs. All imported histories remain PARTIAL with unverified adjustment basis. New equities have no admitted Quant/technical/fundamental strategy eligibility. Unknown issuer identity, issuer domicile and reporting currency remain null.

Search, listing pages, native-currency EOD close charts and ID-based watchlists use the shared canonical directory. Existing ticker-only watchlists and US routes remain operational. No product makes authenticated Marketstack calls. Public delivery is scoped to these 58 requested listings and close charts; full provider OHLC remains private working data. This scope does not grant blanket redistribution or realtime rights.

## 2. Marketstack integration

Real Professional requests exercised exchange/ticker directories and search, ticker metadata, EOD/latest EOD, intraday/latest intraday, stock-price snapshots, dividends, splits, ETF list/holdings, and company facts/concepts/submissions/ratings access. Endpoint and run evidence is recorded in the linked machine-readable reports. Some requests returned empty data, semantic errors, timeouts or entitlement restrictions; successful HTTP transport alone is not counted as coverage.

`providers/marketstack` owns provider payloads, symbol mappings and normalization. It extends the established ingestion operation seam and writes the existing MarketStore; it does not pretend to implement every strict Quant provider capability. Products consume canonical identity, data and coverage. The client enforces HTTPS host restrictions, timeout, retry/rate-limit handling, pagination, batching, finite budgets, safe errors and request accounting. Checkpoints persist before network attempts so restarts retain spent-request estimates.

`marketstack-probe.yml` performs bounded evidence runs. `marketstack-ingestion.yml` supports manual runs and an opt-in weekday update at 22:20 UTC. The opt-in repository variable has not been enabled. Incremental mode uses stored history or a 14-day repair window; initial backfill is separate. Per-run limits are 100 requests/credits, with a 5,000-credit monthly working-cache ledger. `marketstack-ci.yml` protects the additive integration.

The key was used only through `${{ secrets.MARKETSTACK_API_KEY }}` in GitHub Actions. No key was requested, committed or delivered to the browser. No Cloudflare secret or existing Tiingo worker configuration was changed.

## 3. Tiingo versus Marketstack — USA

The comparison covers all **7,803 retained US eligibility decisions**, including excluded and inactive records. The instrument master separately has 7,809 members. The current product universe is 6,875; the consumer universe is 6,419. Eligibility decisions comprise 5,940 ELIGIBLE, 782 SEPARATE_CLASS, 153 REVIEW and 928 EXCLUDED. These populations are kept separate rather than relabelled as common equities.

| Measurement | Count |
| --- | ---: |
| Existing retained Tiingo/VU records | 7,803 |
| Exact provider symbol and MIC matches | 6,738 |
| Unmatched records | 1,064 |
| Exchange disagreements, included in unmatched | 540 |
| Absent from completed relevant directories | 524 |
| Unresolved venue, EXPM | 1 |
| Confirmed symbol mismatches | 0 |
| Matched listings actually tested for latest EOD | 6,738 |
| Structurally valid latest observations | 6,278 |
| Latest identity/quality/freshness flags | 460 |

Zero confirmed symbol mismatches does not prove that no provider aliases exist. Hyphenated Berkshire symbols work where dotted aliases return empty results; PLTR/XNAS returned empty sample data. The final comparison records every baseline row and its classification. Missing records include 941 classified common equities, three ADRs, 40 preferreds, eight warrants and other instrument types. Directory absence/exchange disagreement does not automatically prove permanent provider unavailability.

All 6,738 matched targets were tested in 69 batches, with no unattempted targets. The 460 flags comprise 342 currency conflicts, 16 missing currencies, 20 asset-type conflicts, 29 invalid OHLC observations and 53 stale active listings. Active common equities have 4,618 valid latest observations out of the full 5,941 baseline population (77.73%). Product coverage is 5,426/6,875; consumer coverage is 5,018/6,419. A valid latest observation is one structurally valid candle, not proof of issuer equivalence, complete history, adjustment quality or live capability.

The stratified 29-security price sample includes size cohorts, IPOs, ADRs, share classes and corporate actions. Recent identity-valid raw OHLC comparisons did not show material differences across the measured golden dates. Historical split samples exposed 19 field discrepancies and four invalid adjusted OHLC observations; provider adjustment methods remain unverified. AAPL split-window raw data was already split-adjusted; NVDA volume showed a split-basis difference. No second corporate-action adjustment is applied. `adjustedClose` remains null without verified semantics.

NVDA January 2015 and SAP January 2010 requests returned real observations. These establish sample history availability, not maximum depth. Symbol changes, all retained delisted history and complete dividend/split equivalence remain unproven.

US intraday sampling returned 115 NVDA IEXG observations, including 50 impossible OHLC rows and 31 null volumes. Snapshot/session fields were not proven to be interval bars. Latest NVDA/SPY snapshots reflected the previous US close. The before-open sampling cannot establish current-session latency or realtime equivalence. Three Tiingo reference quote calls succeeded; last-trade fields were null in that session. Existing Tiingo live routing therefore remains unchanged. New global display is EOD_ONLY; Marketstack US realtime replacement readiness is UNKNOWN.

## 4. Germany

Authenticated Xetra discovery completed all **8,959 unique instruments** in nine pages. An exact mnemonic/MIC join to the official T7 reference dated 2026-10-01 classified 3,245 active listings: 680 equity candidates, 2,374 ETF candidates and 191 excluded ETN/ETC listings. Another 5,714 provider rows remain unresolved. These are venue listings, including foreign issuers, rather than counts of German-domiciled companies.

The branch prepares 23 German-venue equities and nine ETFs. All 20 requested German representative companies have measured metadata and real histories. HEN3 is identified as preferred and excluded from common-equity-only eligibility. All four requested index families were investigated against official STOXX pages and exports through 22 bounded public accesses. DAX/MDAX/SDAX/TecDAX pages expose ten component names each, but no ISINs or membership-effective dates; complete official composition/factsheet exports returned HTTP 503 and the modern DAX factsheet returned HTTP 429. The throttle was respected. Full dated index matches remain null, with actual source/access evidence recorded separately. Frankfurt directory sampling is partial and is not imported indiscriminately.

Official instrument-level evidence supplies EUR where provider price currency is null; raw observations keep their original null. Prepared histories are PARTIAL. German measured intraday requests were empty and the complete Xetra directory advertises no intraday flags. EOD_ONLY is the supported display state; realtime is not claimed.

## 5. Europe

Prepared equity samples cover Germany, France, Netherlands, Belgium, Italy, Spain, Austria, Switzerland, Denmark, Sweden, Norway and Finland: **39 equity listings across 12 European countries**, plus nine European ETF listings. MICs include XETR, XPAR, XAMS, XBRU, XMIL, XMAD, XWBO, XSWX, XCSE, XSTO, XOSL and XHEL.

All 13 requested European markets were investigated. UK Shell remains blocked on GBP/GBX quote-scale verification. Two tested UK ETF aliases were blocked for contradictory ISIN/type and mixed price currencies. Most non-Xetra venue directories are partial; instrument totals are not equity counts. European realtime, full holiday calendars, maximum history depth and complete corporate-action equivalence remain unverified. New listings are never assigned US market sessions.

Official currency evidence covers 42 specific instruments. Issuer country is kept separate from listing country. Currency formatting and geographic Search filters passed browser checks; missing company fundamentals remain unavailable rather than zero.

## 6. Global Select

Seven prepared Asian local listings cover Samsung Electronics, SK Hynix, Tencent, BYD, MediaTek, Hon Hai/Foxconn and Reliance, using their measured MICs and KRW/HKD/TWD/INR prices. Toyota and Sony metadata/history were observed but import was blocked by missing quote currency. Existing suitable US ADRs, including TSM, BABA and XPEV, remain the preferred consumer path under the accepted policy. Existing US TM/SONY listings remain intact.

China and Brazil venue metadata was sampled; no complete local universe is imported. No redundant primary listing or issuer link is manufactured from a name/ticker match. ADR ratio/share-basis safeguards remain in place.

## 7. ETFs

The canonical foundation prepares **12 ETF listings: SPY, QQQ, VOO and nine Xetra listings** representing MSCI World, FTSE All-World, S&P 500, Nasdaq 100, Emerging Markets, STOXX Europe 600, DAX, bonds and global dividends. Fifteen unique ETFs had real price samples, including VTI/IWM/ARKK. Complete global active ETF count is unknown.

The full official-reference Xetra join yields 2,374 ETF listing candidates with 2,290 unique ISINs. Candidates require separate history/identity gates before product admission. The provider ETF-list endpoint reported 52,421 instruments but included ordinary Asian equities; that total is rejected as an ETF coverage count. UCITS names are observed; regulatory UCITS status is not synthesized.

VOO holdings returned 516 positions: 504 equity-class, ten derivative-class and two other-class positions. Signed reported weights sum to 99.916916%, with 13 missing ISINs. Report date 2024-12-31 and signature date 2025-02-27 are stale for this run. The response represents a shared fund-series portfolio, so it is not accepted as ETF-specific AUM. Public availability date remains null. SPY/QQQ holdings returned semantic 404; EUNL holdings timed out. Full holdings coverage and update frequency are unproven.

`ETF_COVERAGE.md` and its JSON artifact classify every requested metadata field as AVAILABLE, PARTIAL, NOT AVAILABLE or UNKNOWN. TER/OCF, current AUM/NAV, replication details, full allocation quality, tracking error and tracking difference are not fabricated. ETFs use fund entities and are excluded from company fundamentals, Quant equity scores, CANSLIM and company rankings. No dedicated ETF consumer product was built.

## 8. Fundamentals

The existing SEC pipeline remains primary and its 484-test suite passes. No canonical facts, PIT dates or financial outputs were overwritten. The seven ESEF tests pass and official European filing architecture is preserved.

Professional company facts, concepts, submissions and ratings probes returned entitlement restrictions. Ticker information worked for AAPL/SAP/EUNL despite more restrictive documentation. Company Facts/Concepts/Submissions are SEC EDGAR access paths, not independent regulatory sources. No named Company Statements endpoint was found in the inspected current OpenAPI schema. Ratings content could not be verified.

The diagnostic comparator validates concept, period, fiscal metadata, unit/currency, accession, filing/public availability, duplicates and dimensional context. It flags disagreements without writing canonical metrics. Real facts-pair comparison count is **zero**, explicitly BLOCKED_ENTITLEMENT; unavailable metric comparisons remain null. Business may permit a second SEC parser, but its independence and value are not assumed.

## 9. Products

Existing US product behavior remains WORKING. Statuses below describe the **new extension**, not a regression of existing products.

| Product | Extension status | Measured behavior or gate |
| --- | --- | --- |
| Identity | PARTIAL | 58 verified listing/security identities; issuer linking remains unavailable |
| Search | WORKING | Shared name/ticker/venue/country/ISIN search, collision-safe results |
| Watchlists | WORKING | Explicit listing IDs for equities/ETFs; legacy ticker entries preserved |
| Charts | PARTIAL | Real native-currency EOD close charts; gaps and unverified adjustment warnings |
| Discover | PARTIAL | Global geographic discovery/search; no new equity recommendation scores |
| Screener | PARTIAL | Existing equity screening preserved; new fundamental eligibility gated |
| Quant | PARTIAL | Existing US scores preserved; zero unsupported global scores admitted |
| Factor DNA | PARTIAL | Existing calculations preserved; missing factors not fabricated |
| Rankings | PARTIAL | Existing US ranking universe unchanged |
| SuperTrader | PARTIAL | Existing strategies preserved; unverified global technical history gated |
| Markets | PARTIAL | Existing regime preserved; no claim that US regime represents Europe |
| Research | PARTIAL | Listing identity/coverage available; local company facts not fabricated |
| ETF infrastructure | PARTIAL | Shared identity/search/charts/watchlists plus holdings schema and diagnostics |

Logos remain on the existing canonical asset path. No Marketstack-specific logo service was introduced.

## 10. Request economics

Five authenticated action runs record **422 known Marketstack attempts and 7,224 conservative estimated credits**. An interrupted run permits at most two additional unsaved attempts, for an estimated upper bound of 7,226. Actual billing/account remaining balance is unknown. Three Tiingo reference requests are separate.

Professional documentation lists 100,000 monthly credits; batching reduces HTTP requests but EOD credits still scale per symbol. ETF list/holdings requests have a measured/documented 20-credit multiplier. The prepared 58-listing daily scope is about 1,218 credits over 21 trading days. Existing 6,875 product listings alone would consume about 144,375 monthly credits, before global discovery/history/intraday. Adding the 3,054 classified Xetra equity/ETF candidates gives roughly 208,509 monthly credits before those other costs and deduplication.

Professional is sufficient for the bounded foundation, not for indiscriminate full-US-plus-global daily replacement. Business's documented 500,000 credits could improve capacity and SEC access, but does not resolve identity, quality, European realtime or holdings gaps. No upgrade or purchasing action occurred.

## 11. Data quality

Implemented gates cover duplicate listing/security IDs, MIC/symbol/currency/type mismatches, ETF/company separation, null/zero/negative/impossible OHLC, duplicate dates, future/stale timestamps, provenance, partial pages, unverified adjustment basis and signed holdings anomalies. Extreme unexplained jumps are recorded for investigation rather than silently corrected or used for automatic scores.

Of 63 observed candidate pairs, 58 passed bounded identity/currency/history admission and five were blocked. Prepared counts: 32 officially active, 26 activity unknown, zero known inactive, zero duplicates, zero completely missing history, 46 equities without canonical company fundamentals, and 58 unverified adjustment bases. All 1,394 quarantined candles remain diagnostic observations. Partial charts do not certify backtesting/corporate-action correctness.

The full-US currency/type contamination and invalid intraday fields are material provider findings, not patched into invented data. Currency is established per instrument, never inferred solely from country or MIC. USD conversion is not performed.

## 12. Tests

| Exact suite/check | Result |
| --- | --- |
| `node --test quant/tests/*.test.mjs` | 2,185 passed; zero failed/skipped |
| `node --test discover/tests/*.test.mjs screener/tests/*.test.mjs scripts/supertrader/tests/*.test.mjs worker/tests/*.test.mjs` | 455 passed, five skipped, zero failed (460 total) |
| `python3 -m unittest discover -s scripts/quant/tests` | 484 passed |
| `python3 -m unittest discover -s scripts/fundamentals/tests` | Seven passed with repository Arelle requirements installed |
| `python3 -m unittest scripts.vu2.test_product_data_api scripts.vu2.test_fundamentals_serving` | 32 passed |
| `node --test scripts/vu2/resource-budget.test.mjs` | Six passed |
| Independent final targeted review suites | 81 passed |
| Independent final route/CI correction review | 32 passed |
| Actual canonical browser directory | 58/58 listings passed |
| Expanded product browser, source and built release | 63/63 checks passed each; zero page/HTTP errors |
| Final built-release Discover Chromium suite | 201/201 passed; 16 real accessibility audits; zero critical/serious violations |
| Geographic/identity/quality browser checks | Six passed |
| Secret/public data guards | Passed |
| Protected baseline and generated Quant/technical/Discover verification | Passed; zero unexpected differences |
| Release builder | Passed; reports/docs excluded from shipped frontend |

The old `scripts/universe/browser-qa.mjs` reports 14/19 passing. All five failures were reproduced on the accepted baseline: the existing US Search payload is 836.1 KB against a 400 KB budget; one old ring-label expectation and three obsolete PLTR no-data/no-chart expectations disagree with existing output. They are pre-existing, disclosed limitations, not hidden behind the new successful smoke suite.

The actual release has 4,895,565 SEC projection bytes below the 8,388,608-byte budget, 109 projection files, and 5,399 Screener rows. Local browser checks used that built release as well as source data. GitHub's Node 22 regression results are available in the PR checks; local broad suites used Node 24/Python 3.12. No production deployment was performed.

GitHub's built-release Quant browser suite passed 88 checks with zero findings, including desktop/mobile and named journey surfaces. Screener browser QA across four widths and both themes also passed with zero findings. All GitHub engineering workflows passed on corrected code commit `bb91d3a55e177cf7d7f186bfaaf6f07b777070f2`, including full Node 22 suites and both Discover workflows. Production Pages packaging passed and its deployment job was skipped for the draft PR. Vercel's initial preview build was ignored by its existing build rule; the final automatic preview was blocked by its account deployment limit, reporting “Deployment rate limited — retry in 24 hours.” The built-release local preview was tested directly. No account upgrade, limit override or production deployment was performed.

## 13. Regressions

Protected US price and SEC files have **zero byte differences** against accepted PR #324. Baseline membership verification passes for 7,809 instrument members and 39 accepted enriched identities. Quant verification passes for 482 titles and 29 history references; technical verification matches 18 snapshots; Discover verification covers 5,992 details and 95,008 checks with zero differences. Existing US rankings, fundamentals, schedules, Tiingo configuration and URLs were not migrated.

The only established browser shortcomings are the five reproduced legacy checks described above. No introduced regression remained after the independent review, broad suites and release preview.

Final GitHub validation initially caught a Discover module-scope guard that did not recognize the additive global-market layer and an introduced incremental view-file size of 181,505 bytes against the unchanged 180,000-byte gate. The guard now applies the same full US baseline verification as the accepted global-equity expansion. Marketstack CI also runs its secret/public-data gates on data-, permission-config- and report-only changes. Listing-loading orchestration moved into the existing shared Detail module with explicit app rendering/watchlist/cancellation callbacks. The original view wrapper, fade activation and disposal remain intact. All six measured view-file resource rows are now 179,512 bytes, versus 179,896 on the accepted baseline. This is the existing incremental view-file budget, not a claim that total browser download bytes decreased.

## 14. Provider decision

**OPTION C — Marketstack and Tiingo remain complementary.** Marketstack supplies measured global EOD coverage and ETF listing foundations. Tiingo remains the existing US EOD/history/live source. SEC remains the primary fundamentals pipeline, and official ESEF filings remain the European financial source.

This decision follows incomplete exact US coverage, 460 rejected matched latest observations, unverified adjustment/action semantics, invalid intraday observations, unproven live equivalence, Professional request capacity, stale/limited holdings and restricted fundamentals. A cleaner provider count is not evidence of interchangeability. Rollback is additive: remove/disable the extension and its opt-in jobs without destroying baseline data or product provider independence.

## 15. Remaining blockers

Production provider replacement is blocked by measured identity/currency/quality gaps, unverified historical adjustment/corporate-action semantics and realtime capability. Shell/Japan samples need external instrument quote-unit evidence; the conflicting UK ETF aliases require provider identity correction. Official dated index memberships were blocked by the observed export HTTP 503/429 failures; issuer linkage, complete local fundamentals and exchange calendars also require reliable source evidence before broader equity engines can admit these listings. Professional entitlement prevents real Company Facts/Concepts crosschecks; no automatic upgrade is authorized or required for the rest of the foundation.

Full global universe and ETF holdings completeness cannot be asserted from partial directories or contaminated endpoint classification. The prepared data is not a complete German, European or global production universe. PR #324 must also resolve its existing main integration independently before this stacked expansion can land safely.

The optional hosted Vercel preview remains blocked by the external account deployment rate limit described above. GitHub release packaging and direct built-release browser validation passed; this does not require a change to Vision Universe's production hosting.

## 16. Important follow-on engineering

Resolve the reported provider identity/currency/intraday anomalies and prove split/dividend basis before expanding strategy eligibility or considering a US routing switch. Link verified issuers to official SEC/ESEF facts with PIT and ADR safeguards. Reconcile the classified Xetra candidates in bounded batches with instrument-specific currencies, dated memberships and calendars. Keep the measured request ledger and permission scope when broadening imports; a larger subscription alone cannot clear data-quality gates.

## Evidence index

- [Integration](MARKETSTACK_INTEGRATION.md), [US benchmark](MARKETSTACK_TIINGO_BENCHMARK.md), [global coverage](GLOBAL_MARKET_COVERAGE.md), [ETF coverage](ETF_COVERAGE.md), [routing](PROVIDER_ROUTING.md), [fundamentals](FUNDAMENTALS_VALIDATION.md).
- [Complete US comparison](../reports/marketstack/marketstack_tiingo_us_diff.json), [exchange coverage](../reports/marketstack/marketstack_exchange_coverage.json), [European counts](../reports/marketstack/marketstack_europe_equity_counts.json), [canonical import](../reports/marketstack/marketstack_canonical_import.json).
- [Official German index access and coverage limitations](../reports/marketstack/marketstack_german_index_coverage.json).
- [ETF evidence](../reports/marketstack/marketstack_etf_coverage.json), [fundamental crosscheck](../reports/marketstack/marketstack_fundamental_crosscheck.json), [provider coverage](../reports/marketstack/provider_coverage_summary.json), [request usage](../reports/marketstack/marketstack_request_usage.json), [browser evidence](../reports/marketstack/marketstack_product_browser_smoke.json), [regression summary](../reports/marketstack/marketstack_regression_summary.json).
