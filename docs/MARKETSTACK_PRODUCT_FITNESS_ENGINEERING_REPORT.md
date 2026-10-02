# Marketstack product fitness: final engineering report

Evidence date: 2026-10-02. Protected baseline: PR324/330/334, PR334 head `bf84b7ae99b1d291de6b61d1f7ba42ef262c6eb1`. This is an additive research branch; production routing, provider clients, company identities, SEC/ESEF facts, jobs and product engines are unchanged. Commercial provider choice remains with the owner.

## 1. Executive result

Marketstack supplies a useful global identity and native-currency **bounded EOD chart foundation**. This run does not establish full technical, Quant, SuperTrader or backtest admission. A strict research adjustment prototype demonstrates a real NVDA split repair, while full-series currency, OHLC, issuer, calendar and corporate-action gates remain blocked. Tested ETF holdings support observed partial-position comparisons; they do not support complete portfolio exposure.

The isolated runners reuse existing Factors, QuantScore, Screener, five SuperTrader strategies and portfolio simulator. They inspect **818 cached listing histories**, select **182 listing histories including 100 typed equity samples**, compare 21 Tiingo controls, and run five full-OHLCV US comparisons. Twenty-one fresh US histories return 13,804 bars; four requested symbols return empty windows. No diagnostic result is written to production ranking, price, identity or fundamental storage.

The rollup is [provider_product_fitness_summary.json](../reports/marketstack/provider_product_fitness_summary.json). Reproduction is documented separately in [MARKETSTACK_PRODUCT_FITNESS_REPRODUCTION.md](MARKETSTACK_PRODUCT_FITNESS_REPRODUCTION.md).

## 2. US relevance gap

The protected census remains **7,803 retained records**, **6,738 exact directory matches**, **1,065 non-exact records**, and **460 rejected exact latest observations**. The current audit also records four changed required venue identities, yielding **1,529 named audit rows**. These scope additions do not rewrite the accepted benchmark.

The protected consumer denominator is **6,419**: directory identity **5,423 / 84.48%**, valid latest benchmark **5,018 / 78.17%**, and **1,401 identity/latest gaps**. The current required-listing scope has 1,405 gaps including four venue conflicts. Fresh historical tests stop at September 30; they are not an October 2 live freshness certificate.

Relevance buckets across all audited rows: **85 core/high relevance, 333 active investable, 9 low-liquidity/microcap, 516 non-consumer, 16 inactive/stale, 0 proven duplicates, 570 unresolved**. There are **89 mapped major-index consumer gaps**; existing S&P 500/NDX/Dow proxy sources expose 81 legacy or 83 current-venue S&P gaps, 27 NDX gaps and 6 Dow gaps. Membership overlap, missing constituent mappings and source dates are recorded; this is not a complete current-index certification. Named user-visible examples include META, AMD, CAT, BA, PLTR and WMT.

A narrower current literal-common-class lower bound is **4,755 records**, identity **4,246 / 89.30%**, valid latest **3,968 / 83.45%**, with **787 named consumer gaps**. The complete legally active-common denominator and genuinely globally unsupported count remain **null**. Four empty bounded probes (PLTR/PANW/WMT at XNAS, BRK.B at XNYS) do not prove worldwide provider absence. Name similarity and unexhausted aliases never certify a match.

Every gap, relevance reason, index source and bounded retest is in [us_gap_relevance.json](../reports/marketstack/us_gap_relevance.json); the named lower-bound common-stock and high-relevance lists are explicit fields. Users would notice measured US coverage degradation; its cause cannot be collapsed into a count of unsupported common stocks.

## 3. Germany

German venues contain **11,487 equity-candidate listing identities**, including foreign issuers and multiple trading venues. The accepted reference census has 432 German issuer associations / 441 reference-active ordinary or preferred classes. Official issuer checks contradict three FIRDS associations: EVT shares mapped to Greater Union Filmpalast GmbH, Nippon Carbon shares mapped to Kornmeyer Carbon-Group GmbH, and Sixty Six Capital shares mapped to Northern Data AG. The new research masters quarantine those associations and preserve all accepted source records.

After these known quarantines: **429 supported company associations**, **438 reference-active equity classes**, **787 listing identities**. Of these company associations, 427 use direct ANNA mapping and two use uncontradicted FIRDS-only references. Every remaining company has not been independently reverified; this is not a count of all German listed companies. One separately probable issuer, ERWE, remains excluded because of conflicting identity references, and 80 German-venue issuer listings remain unresolved.

**218 companies / 226 listings** retain accepted bounded native-currency chart support; 346 canonical listings are searchable/watchlist-compatible. Full existing consumer-policy eligibility is unknown; zero additional securities are certified for technical Quant, full Quant, SuperTrader or backtests. The unchanged policy requires 250 bars and USD 5m average turnover; native EUR turnover is not silently treated as USD.

The named table is [MARKETSTACK_COMPANY_PRODUCT_READINESS.md](MARKETSTACK_COMPANY_PRODUCT_READINESS.md). Full company/security/listing identities, association exclusions, history and product reasons are in [germany_company_master.json](../reports/marketstack/germany_company_master.json) and [germany_product_eligibility.json](../reports/marketstack/germany_product_eligibility.json).

## 4. Europe

The supported census contains **3,468 company associations / 3,491 reference-active equity classes** after the same three quarantines; accepted reference counts 3,471/3,494 remain preserved. There are 5,570 supported listing identities and 238 companies with bounded accepted chart coverage. The broader German domicile scope below includes depositary/other equity classes across European venues; it differs from the German ordinary/preferred scope above.

|Issuer domicile|Supported companies|Reference-active classes|Bounded chart companies|Quant certified|SuperTrader certified|Backtest certified|
|---|---:|---:|---:|---:|---:|---:|
|DE|431|520|219|0|0|0|
|FR|449|474|2|0|0|0|
|NL|104|120|5|0|0|0|
|BE|101|96|2|0|0|0|
|IT|275|256|0|0|0|0|
|ES|115|139|2|0|0|0|
|AT|46|52|3|0|0|0|
|CH|195|58|3|0|0|0|
|GB|723|789|0|0|0|0|
|DK|116|105|0|0|0|0|
|SE|571|557|0|0|0|0|
|NO|194|191|1|0|0|0|
|FI|148|134|1|0|0|0|

Reference-active does not certify liquid current trading. Neither complete national coverage nor complete consumer-eligible counts are known. Venue ETF counts are separate from issuer domicile; foreign secondary listings do not become domestic companies. The full per-listing matrix and dictionary decoding contract are in [europe_company_coverage.json](../reports/marketstack/europe_company_coverage.json).

## 5. Adjusted price result

Empirical field basis varies. AAPL's 2020 pre-split OHLC/close are already divided by four and volume multiplied by four. NVDA's 2024 split window has as-traded price but already scaled volume. Applying a universal split rule would double-adjust some fields. Provider `adj_close` can remove a split discontinuity without establishing consistently valid adjusted OHLCV or dividend semantics.

NVDA June 10: raw day return **−89.9254%**, independently split-neutral return **+0.7461%**. Its March 5 EOD dividend 0.004 versus action-ledger 0.04 is explained by the later ten-for-one share basis; it is not evidence of an independently wrong cash amount. Other action discrepancies still require reconciliation. Ten unchanged historical NVDA dates between two retrievals do not establish a universal retroactive-restatement policy.

The fresh 25-symbol control run returns 21 histories / 13,804 bars: **100 invalid OHLC bars**, 4,356 missing currency and 2,804 contradictory currency observations. Latest terminal bars for the 21 nonempty histories can pass bounded raw checks while their full histories fail. Fifteen histories expose foreign price-row currencies. No full-series admission follows.

The preserved PR334 final classification covers all 460 original flags: 17 independently explained (venue removal/symbol transition), 406 observable defects and 37 causal UNKNOWN. All 460 Marketstack observations remain unsafe; none was repaired or admitted to EOD/Quant/Charts by explanation alone. The prior 454 unresolved cases are individually classified in [us_marketstack_quality_final.json](../reports/marketstack/us_marketstack_quality_final.json), including 358 provider-quality, 29 invalid-OHLC and 16 identity-mapping cases. Fresh control histories do not erase this rejected baseline.

The deterministic prototype separates raw, split-adjusted and cash-reinvested total-return series; it refuses unknown field basis, duplicate/impossible candles, uncertain issuer/currency, incomplete calendars and action coverage. Volume basis is explicit. Dividend reinvestment is distinct from provider prior-close cash back-adjustment. It remains research-only.

|Use|Result|
|---|---|
|Accepted bounded EOD charts|PARTIAL; preserve native currency and display-only freshness|
|Full technical indicators / 52W / momentum|BLOCKED pending full-series proofs|
|Quant technical / SuperTrader|BLOCKED; isolated comparisons do not admit histories|
|Published backtests|UNSAFE under incomplete action/calendar/total-return/PIT evidence|
|VU self-adjustment|Feasible in controlled split cases; required basis must be proven per series|

All windows, action evidence and compatibility gates are in [marketstack_adjustment_validation.json](../reports/marketstack/marketstack_adjustment_validation.json), [technical_indicator_crosscheck.json](../reports/marketstack/technical_indicator_crosscheck.json) and [MARKETSTACK_CANONICAL_ADJUSTMENT_SPEC.md](MARKETSTACK_CANONICAL_ADJUSTMENT_SPEC.md).

## 6. Fundamentals fusion

The existing SEC pipeline stays primary. Twelve isolated cases produce seven exact internal joins and one exact local official LEI/ISIN join: LVMH. Its 12 official FY2023/2024 facts demonstrate an ESEF company projection, not complete quarterly/TTM coverage. SAP, Siemens, Rheinmetall, local ASML and local Novo Nordisk lack exactly linked complete local canonical panels. Their US registrant names are not sufficient to copy facts or ADR share bases.

AAPL/NVDA counterfactual runs, explicitly assuming currently unproven provider issuer and price/share basis, calculate market cap, P/E, P/S, P/B and FCF yield through the existing fundamental engine and yield 30 inputs each. Actual safe valuations and new full-Quant admissions remain **zero**. EV/Sales and EV/EBITDA lack aligned net-debt inputs. Currency, ADR ratio, unit, instant/duration context, PIT filing availability and share class are fail-closed.

Offline official LVMH ingestion reproduces **12 facts / 543 diagnostics**; semantic facts and filing-availability provenance match, diagnostics match as a multiset, and retrieval times are explicitly separate. Marketstack Business entitlement limitations from PR334 are retained; no new fundamental vendor requests, overwrite or purchasing action occurs. See [fundamental_price_fusion_validation.json](../reports/marketstack/fundamental_price_fusion_validation.json).

## 7. Screener

The unchanged actual Screener engine accepts shadow reference country/exchange metadata and excludes null metrics from `gte 0` filters. Of 790 reference listing rows, seven listing-level identity/domicile conflicts are masked: 783 match DE and 350 match XETR. Each tested market-cap, growth, P/E and SMA200 filter returns **0 matches / 790 missing**. Missing fundamentals do not become zero; native currencies never enter USD-specific fields.

Observed shared identity metadata supports bounded geographic discovery; it does not certify price, liquidity, 52W, trend, momentum or fundamental filters for a new global consumer universe. Those remain BLOCKED. See [screener_marketstack_fitness.json](../reports/marketstack/screener_marketstack_fitness.json).

## 8. SuperTrader

Isolated company strategy contexts execute Darvas, Minervini, Donchian, Weinstein and KK using the existing engine. Eighty-three eligible research contexts are exercised; ETFs/untyped instruments remain excluded from company strategy ranks. Full-window evidence admits **zero** new strategy securities. The weighted RS formula uses the existing 63/126/189/252-day definition in an explicitly fixed research sample.

Invalid OHLC is masked without changing dates or fabricating prices. Native turnover thresholds, missing weekly benchmark history and incomplete adjusted volume prevent production admission. Weinstein or other zero-trade results are not successful strategy validation. Technical CANSLIM components do not certify company earnings inputs. Strategy comparisons and exclusions are in [supertrader_marketstack_fitness.json](../reports/marketstack/supertrader_marketstack_fitness.json).

## 9. Backtesting

Five actual US OHLCV controls (AAPL/NVDA/MSFT/JPM/XOM), each with 688 common observed dates, run the same five existing strategies and portfolio simulator. Sixteen additional controls support close-only indicator comparisons; their OHLCV is not fabricated. Common-date matching is a bounded diagnostic, not proof of a complete exchange calendar.

NVDA Donchian produces 12 trades per source. Raw Marketstack return differs from Tiingo by **−6.685159 percentage points**. Applying the independently controlled split factor while retaining already scaled volume reduces the residual to **−0.004967 percentage points**. At the split-date prefix, raw three-month momentum is −85.8011%; reconstructed and Tiingo are +41.9894%. These numerical repairs demonstrate feasibility, not full backtest safety.

Other Donchian diagnostics: AAPL 12/12 trades with −0.2391pp return delta and two signal-date differences; JPM 12/10 with −0.6508pp; MSFT 10/10 with −0.0074pp; XOM 10/10 with −2.3680pp and two signal-date differences. Indicator return/risk tolerance is 0.5pp; exact matching uses 1e−8. Methodology, total-return adjustment and invalid/missing bars can explain differences; neither provider is arbitrarily declared correct.

All Marketstack comparisons remain **NOT_BACKTEST_SAFE**. No published claims bypass incomplete corporate actions, exchange sessions, dividends/cash reinvestment, historical membership/survivorship, delisting returns, PIT fundamentals or currency handling. The existing simulator's unobserved mark fallback is explicitly diagnostic. See [backtest_marketstack_fitness.json](../reports/marketstack/backtest_marketstack_fitness.json).

## 10. Global ETFs

**9,644 raw ETF listing candidates** = **3,217 US exact official ETF-flag/primary-MIC listings** + **6,423 European typed listings** + **4 other provider-role candidates** (not independently verified legal funds). US nonconflicting identity count is 3,131; Europe's 2,933 distinct ISINs are security/share-class candidates. Unique global legal funds and verified global share classes remain null because the legal fund/share-class map is incomplete.

Europe has **2,471 UCITS-name-label ISIN candidates**, with zero independent regulatory UCITS verifications. Official-reference-active listings number 4,244; this does not certify current trades. Fifty-two sampled listings expose a valid history bar; only IWM's eight bars and SXR8.DE's 440 bars remain nonquarantined bounded series, and neither has full adjustment certification. Thirty-three actual US representative symbols cover every requested major US ETF; actual discovered European listings cover the specified categories and twelve issuer-name families.

Counts, venue scope and representative identities are in [global_etf_coverage.json](../reports/marketstack/global_etf_coverage.json). Issuer name families are not certified legal-issuer metadata.

## 11. ETF holdings

Thirty-four distinct cached endpoint observations (31 US, 3 European): **0 FULL_CURRENT**, **16 PARTIAL_STALE**, **2 PARTIAL_CURRENT**, **16 UNAVAILABLE**. At least partial: **52.94%**; no usable positions: **47.06%**. All three tested European holdings requests are unavailable. The 120-day current threshold is a disclosed research policy, not proof that a portfolio is current on today's date.

Observed identifier intersections are computable, e.g. VOO/XLF 73 and VOO/XLK 69 shared observed ISINs. True overlap percentages, complete underlying/country/sector exposure, full top-10/20 concentration and portfolio duplicate exposure remain unsupported. Partial weights are never renormalized into a fictitious complete portfolio. See [etf_holdings_quality.json](../reports/marketstack/etf_holdings_quality.json).

## 12. ETF metadata

Provider-only field status is separate from supplements. Names, ticker/exchange, some ISIN, trading currency, bounded historical prices, holdings and weights are PARTIAL. Provider issuer identity and clean dividend series are UNVERIFIED. WKN, legal domicile, regulated UCITS, fund currency, inception, benchmark, TER/OCF/expense ratio, AUM/NAV, accumulation/distribution, replication, tracking difference/error and complete sector allocations are unavailable in the tested provider evidence. An official exchange management fee is not silently relabeled TER.

A secondary ETF source would need complete current dated portfolios with weights/identifiers and cash/derivative treatment, synchronized sector/country classifications, legal share-class-to-fund/UCITS identity, costs/AUM/NAV/benchmark/distribution/replication metadata and licensed historical PIT portfolios. No additional provider is integrated. The exact per-field provider/supplement matrix is [etf_metadata_matrix.json](../reports/marketstack/etf_metadata_matrix.json).

## 13. Request economics

This run makes **75 additional paid requests / estimated credits**, capped at 25 symbols × EOD/splits/dividends. The existing client, retry/accounting and server-side Actions secret are reused. There are no retries or uncontrolled backfills. Prior tracked October usage 13,065–13,067 becomes **13,140–13,142**. Twelve public issuer-source requests use zero Marketstack credits. Actual billing balance remains unknown; an advertised 100,000-credit allowance would leave about 86,858–86,860 if tracked usage were the only account usage.

|Daily EOD listings|Monthly credits at 21 sessions|Illustrative 4-page one-time history|Metadata + splits + dividends|
|---:|---:|---:|---:|
|500|10,500|2,000|1,500|
|1,000|21,000|4,000|3,000|
|5,000|105,000|20,000|15,000|
|10,000|210,000|40,000|30,000|

Batching reduces HTTP calls, not reserved per-symbol credit cost. Four history pages are a scenario, not measured universal history depth. Venue partitions, retries and contract billing can change totals. A 500-ETF scenario adds 10,500 monthly EOD, roughly 2,167 weekly-holdings refresh credits per month and 500 metadata credits; cost does not establish holdings support. Five-minute US intraday polling over 21 full sessions estimates 16,380 credits for ten symbols or 163,800 for 100; it is not a global calendar/live claim.

Cached Professional evidence shows US INTRADAY, Germany/Europe/Asia EOD_ONLY; global realtime remains unverified. This run does not repeat those calls outside useful sessions. Existing Tiingo live routing is preserved. Tiingo account costs are not available for a commercial total-cost comparison.

## 14. Tests

Final broad suites after the last safety fix:

|Suite / gate|Result|
|---|---|
|Quant full (`node --test quant/tests/*.test.mjs`)|2,675 pass, 0 fail|
|Product: Discover/Screener/SuperTrader/Worker|455 pass, 5 pre-existing skips, 0 fail|
|SEC Python full|484 pass, 0 fail|
|ESEF Python full|7 pass, 0 fail; official sample replay unchanged|
|Serving Python tests|32 pass, 0 fail|
|Resource-budget unit tests|6 pass, 0 fail|
|Production release smoke|140 pass, 0 fail|
|Quant browser|90 pass, 0 findings|
|Quant resource budgets|8 pass, 0 fail; cold isolated context, all fetched subresources counted|
|Quant automated accessibility|76 audits, 0 violations|
|Discover browser|201 pass, 0 errors|
|Discover automated accessibility|16 audits, 0 violations|
|Global canonical API / UI smoke|290 API checks + 8 actual chart/watchlist UI checks pass|
|Named journeys|12 pass|
|Release/resource and public-data hygiene|PASS|

The 178 added Quant tests cover 43 company, 28 fusion, 17 ETF, 30 adjustments, 24 engine, 5 economics, 3 Screener and 28 US relevance checks. One earlier introduced provenance test failure was fixed and the full suite rerun. Source/log hashes, commands and scoped browser limitations are in [marketstack_product_fitness_tests.json](../reports/marketstack/marketstack_product_fitness_tests.json). Automated accessibility does not constitute a manual accessibility certification.

## 15. Regressions

All captured protected groups are byte-identical: **38,543 Quant data files**, **23,538 US market files**, **6,221 SEC data/source files**, identity/global data, **12,065 Discover files** and **8,076 existing product/production code/job files**. Counts overlap by scope. Original 58 global records and all 278 accepted bounded charts remain intact. The 6,922 canonical foundation listings are unchanged; newly added research masters do not become production identities.

Chart delivery tests validate identity/native currency and watchlist persistence; a deliverable stale bounded series is not promoted to a current price or adjusted technical certificate. Existing URLs/APIs, Tiingo realtime, SEC/ESEF/PIT and provider routing are unchanged. No Cloudflare secret, production workflow or deployment is modified.

## 16. Product-fitness matrix

These are source-wide measured coverage gates, not claims that every instrument works. Tiingo source-wide PARTIAL cells retain existing missing-factor, stale/live and backtest-publication limits; existing supported US product functionality remains operational. Company fundamental factors are inapplicable to ETF securities and stay excluded.

|Product capability|Tiingo US|Marketstack US|Marketstack Germany|Marketstack Europe|ETF|
|---|---|---|---|---|---|
|EOD Charts|READY|PARTIAL|PARTIAL|PARTIAL|PARTIAL|
|Live/Intraday|PARTIAL|PARTIAL|BLOCKED|BLOCKED|BLOCKED|
|Technical Indicators|PARTIAL|BLOCKED|BLOCKED|BLOCKED|BLOCKED|
|Quant Technical|PARTIAL|BLOCKED|BLOCKED|BLOCKED|BLOCKED|
|Quant Full|PARTIAL|BLOCKED|BLOCKED|BLOCKED|BLOCKED|
|Screener Technical|PARTIAL|BLOCKED|BLOCKED|BLOCKED|BLOCKED|
|Screener Fundamental|PARTIAL|BLOCKED|BLOCKED|BLOCKED|BLOCKED|
|SuperTrader|PARTIAL|BLOCKED|BLOCKED|BLOCKED|BLOCKED|
|Backtesting|PARTIAL|UNSAFE|UNSAFE|UNSAFE|UNSAFE|
|ETF Holdings|N/A|PARTIAL|BLOCKED|BLOCKED|PARTIAL|

Search and Watchlists remain READY for already accepted canonical identities, while accepted Marketstack Charts are PARTIAL bounded EOD. Discover, Factor DNA, Rankings and Markets retain their existing production universes; this run certifies no global advanced-engine expansion. Listing-level READY/PARTIAL/BLOCKED/UNSAFE reasons are explicit in the company masters. No READY_WITH_VU_ADJUSTMENT production admission is asserted solely from the NVDA numerical prototype.

## 17. Decision inputs

Tiingo still supplies the protected US consumer histories, working realtime route and corporate-action controls. Measured Marketstack US directory/latest gaps include user-visible names and full-window defects; removing Tiingo is unjustified by this run.

Marketstack uniquely supplies measured non-US venue discovery, native-currency EOD coverage and a useful European equity/ETF identity and bounded chart foundation. Retaining it for those functions is technically plausible; the commercial value and total account costs require the owner's decision.

Full Marketstack technical/Quant/SuperTrader/backtest coverage needs corrected or independently verified OHLC/currency/quote units, explicit per-field split/dividend/volume basis, complete actions and session histories, identity/share-class/ADR proof, and PIT universe/calendar data. Full European fundamental Quant also needs exact company joins and broader official ESEF/filing quarterly/TTM and valuation share/FX bases. Tested ETF portfolios need the separate complete holdings/metadata feed described above.

Professional vs a higher tier, Marketstack plus Tiingo, and any future EODHD path remain commercial/architecture choices. This report makes no purchasing, provider-replacement or production-cutover decision. Unresolved provider corrections, unverified legal identity/completeness and missing licensed portfolio/PIT coverage are material blockers; they are not waived by a green build.
