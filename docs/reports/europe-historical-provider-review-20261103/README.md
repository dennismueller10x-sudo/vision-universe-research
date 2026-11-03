# European historical prices: provider and licence review (03.11.2026)

Owner approval of 03.11.2026: a targeted, **free** market and provider review. No paid contract, no paid API test, no committing sign-up, no provider switch. Only public documentation, price lists, licence terms and public demo endpoints without sign-up were used.

This document changes no code, data, gate, calendar, identity or quarantine. Machine-readable comparison: [`provider_comparison.json`](provider_comparison.json).

**Evidence labels**

- **VERIFIED**: measured by our own request to a public endpoint, or read in a primary document (price list PDF, terms).
- **CLAIM**: the provider's own statement on its website, not checked independently.
- **UNCLEAR**: not stated publicly, contradictory, or not reachable.

All sources were accessed on **2026-11-03**.

## 1. Starting point (already in the repository)

| Finding | Source |
| --- | --- |
| Universe: 449 European stocks on 10 MICs: XETR 319, XPAR 39, XAMS 20, XCSE 17, XSWX 14, XWBO 12, XMAD 10, XMIL 10, XBRU 6, XSTO 2 | `docs/reports/europe-continuity-449-20261012/europe_449_safe_history.json` |
| 15,498 provider-absent sessions in the public scope. 11,463 of them are market-wide on 85 dates (420 MIC-dates), e.g. 2023-06-13 and the block 2025-05-09..2025-08-28 on XBRU/XCSE/XMAD/XMIL/XSWX/XWBO, plus XETR 2026-09-17 | PR #1285, `docs/reports/europe-marketstack-gap-analysis-20261103/` |
| The single-date routes recovered 0 sessions. `/exchanges/{mic}/eod/{date}` returns 422 on the gap date, so **Marketstack does not hold the exchange day at all** | PR #1285, `docs/reports/europe-marketstack-diagnostics-20261103/` |
| Marketstack `/splits` and `/dividends` cover only US venues and SHG. `/tickers/EUZ.DE/splits` returns 0 rows despite the official 3:1 split in August 2025. 47 strong breaks remain unexplained | same, plus the v2 OpenAPI quote in `providers/marketstack/endpoint-coverage.json` (#1285) |
| 18,098 identity holds (mostly XETR before the Xetra firstTradingDate). No Marketstack field supplies a historical identity | PR #644 / #658, #1285 |
| Marketstack bills per symbol; error responses also cost a credit | #1285 diagnostics (header `x-increment-usage`) |
| Existing licence checklist and provider preparations | `docs/VU_PROVIDER_LICENSE_CHECKLIST.md`, `providers/eodhd/README.md`, `providers/twelve-data/` (adapter built, not live), `docs/VU_FREE_DATA_SOURCE_MAP.md` (FMP = LICENSE_UNKNOWN) |

What the product needs from a second source:

1. Complete daily OHLCV for primary listings on all 10 MICs, ideally from 2000 or earlier.
2. Coverage of the 85 market-wide gap dates.
3. European splits and dividends as events, not only adjusted prices.
4. Delisted securities and some form of identity anchor (ISIN, FIGI).
5. Commercial rights: display to paying end users, derived data (scores, backtests), storage, and the question of the **public Git repository**.

## 2. Ranking

| Rank | Provider | Role | Main reason | Biggest risk |
| ---: | --- | --- | --- | --- |
| 1 | **Twelve Data (Venture business plan)** | Primary candidate | Only vendor with a **published** commercial tier that names "External display data access" ($499/month, CLAIM). Terms are explicit about derived data (VERIFIED). All 10 MICs listed; 448/449 of our current symbols are in the public reference list (VERIFIED). A Node adapter already exists in the repository. | History depth for Europe is not published (UNCLEAR). "EOD prices for external distribution" is a separate custom-priced add-on (CLAIM), so it is unclear whether Venture alone covers historical EOD display. Data must be deleted within 30 days after termination (VERIFIED), which conflicts with committed history. |
| 2 | **EODHD (commercial Custom/Enterprise agreement)** | Fallback and second source for gaps and corporate actions | Strongest technical fit for the gaps: all 10 venues (CLAIM), 30+ years of history, delisted tickers keep their history, European splits/dividends with `unadjustedValue` and currency, and an **exchange-wide bulk route per date** (100 calls per exchange-date, CLAIM). Cheapest API usage. | Display rights are not published: "Internal use" ($399/month) explicitly forbids display outside the company (CLAIM, pricing FAQ); Enterprise ($2,499/month) and Custom ("from $399") name only a "data services agreement". The terms say prices "are not provided by exchanges but rather by market makers" (CLAIM), so a closing price may not equal the official primary-listing close. |
| 3 | Exchange-direct sources (Deutsche Börse, Euronext, SIX, Wiener Börse) | Official evidence for single questions, not a feed | The only route to official closes, closure days and corporate actions; SIX EOD closing prices are free with a letter of confirmation (CLAIM). | Ten separate contracts. Distribution licences cost hundreds to thousands of euros a month per exchange (VERIFIED in price lists). History backfill is "on request". |
| 4 | Eulerpool | Watch list | Published plans license display inside one's own product from Builder ($99/month) (CLAIM). | Coverage of European exchanges is not documented (UNCLEAR). Its licensing page contradicts itself on redistribution. |
| 5 | LSEG (Refinitiv), FactSet | Enterprise reference only | LSEG Xetra pricing from 1986 (CLAIM); FactSet has global prices and corporate-action APIs (CLAIM). | Prices only on request, and typically far above the product budget. Not reviewed further. |
| — | FMP, Alpha Vantage, Intrinio, Barchart | Not recommended now | FMP pages return 403 to automated reads; licence already LICENSE_UNKNOWN in the repo. Alpha Vantage limits use to "personal, non-commercial use" unless agreed otherwise in writing (VERIFIED). Intrinio requires Enterprise for redistribution and does not document European EOD (CLAIM/UNCLEAR). Barchart's own website marks European stock downloads as "N/L" = not licensed (CLAIM). | |
| — | Tiingo, Massive (Polygon) | Excluded: no coverage | Tiingo's public ticker list has **0** listings on our 10 MICs (only 11 LSE rows; VERIFIED). Massive's Stocks API covers US venues only (CLAIM, docs). | |
| — | Yahoo, Stooq, Deutsche Börse AWS PDS | Excluded: licence | Yahoo terms forbid commercial reuse, automated collection and building a database from its data (VERIFIED). Stooq was not reachable (connection reset); no licence could be read (UNCLEAR), so it stays excluded. The Deutsche Börse AWS dataset is "Deprecated" and licensed "Non-commercial (NC)" (VERIFIED). | |

**Recommendation.** Twelve Data Venture is the primary candidate for licence reasons. EODHD is the fallback and the preferred second source to fill the market-wide gaps and the European corporate actions, provided a Custom agreement grants display rights. Before either step, both providers must answer the questions in section 6 in writing. The 47 breaks and the 305 `calendarRecheck` MIC-dates still need official issuer or exchange documents; no vendor replaces those.

## 3. Assessment per candidate

### 3.1 Twelve Data

| Criterion | Finding | Label |
| --- | --- | --- |
| MICs | All 10 listed. XETR, XPAR, XAMS, XBRU and XMAD are EOD from the individual "Grow" plan. XCSE, XSWX, XWBO, XMIL and XSTO need "Pro". All are in the business "Venture" plan | CLAIM ([exchanges](https://twelvedata.com/exchanges)) |
| Symbol coverage of our universe | Public `/stocks?mic_code=…&apikey=demo` lists 448/449 current tickers. Only BION.SW is missing. The list returns `figi_code`; ISIN/CUSIP show `request_access_via_add_ons` | VERIFIED (own request, 10 calls, demo key without sign-up) |
| History depth Europe | Not stated on the pricing page | UNCLEAR |
| Gap periods | Not testable: `time_series` with `apikey=demo` returns 401 for SAP/XETR | VERIFIED that it is not testable |
| Delisted / ISIN history | Not documented publicly; ISIN only as an add-on | UNCLEAR |
| Splits/dividends Europe | Endpoints exist (see `docs/VU_PROVIDER_CAPABILITIES.md`); European completeness not documented | UNCLEAR |
| Technical fit | REST/JSON, credits per symbol. `providers/twelve-data/adapter.js` is already built and tested but not live | VERIFIED (repository) |
| Licence | §1 internal use "not for redistribution or external commercial purposes". §2.2(c) derived data allowed if it "cannot be reverse-engineered to recreate the original Data". §2.2(e) external display only with a redistribution add-on or written agreement. §2.3(g) no caching beyond documented periods. §12.5/§16.2: delete all data, within 30 days after termination. Attribution required for public display unless the contract says otherwise | VERIFIED ([terms](https://twelvedata.com/terms), [attribution](https://support.twelvedata.com/en/articles/12647398-attribution-guidelines-for-using-twelve-data)) |
| Prices | Individual: Grow $79, Pro $229, Ultra $999 per month (personal use). Business: Venture $499/month ("External display data access"), Enterprise $1,099/month ("External distribution market data"), Enterprise+ custom (white label). Annual billing saves 17%. Add-on "EOD prices for external distribution": custom | CLAIM ([pricing](https://twelvedata.com/pricing), [business pricing](https://twelvedata.com/pricing-business)). The page's structured data says Venture costs $149; the visible price is $499 |

### 3.2 EODHD

| Criterion | Finding | Label |
| --- | --- | --- |
| MICs | Symbol format `SYMBOL.EXCHANGE`, e.g. `SAP.XETRA`. Examples name LSE, XETRA and Euronext Paris. The other venues are listed in the Exchanges API | CLAIM ([EOD docs](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes)) |
| History depth | "30+ yrs" on paid plans. Earliest US common stock 1962. No start year stated for XETRA | CLAIM / UNCLEAR for Europe |
| Gap periods | Not testable: the demo key works only for AAPL.US, TSLA.US, VTI.US, AMZN.US, BTC-USD.CC and EURUSD.FOREX. `SAP.XETRA` returns 403; AAPL.US 2026-09-15..17 returns 3 rows | VERIFIED (own requests) |
| Delisted | "A delisted ticker keeps its history". Delisted lists via the exchange symbol endpoint. Tickers can be reused for a new company | CLAIM ([delisted review](https://eodhd.com/financial-apis/review-delisted-stock-companies-data)) |
| Splits/dividends Europe | Covers stocks "across the US, Canada, Europe, …". Dividends with `unadjustedValue`, `currency`, optional record and payment dates. 1 call per request | CLAIM ([splits/dividends](https://eodhd.com/financial-apis/api-splits-dividends)) |
| Bulk | One exchange and one date for a flat 100 calls, also `type=splits` / `type=dividends` | CLAIM ([bulk](https://eodhd.com/financial-apis/bulk-api-eod-splits-dividends)) |
| Data origin | Terms: prices "are not provided by exchanges but rather by market makers"; footer: "We are not using exchanges data feeds for the pricing data" | CLAIM ([terms](https://eodhd.com/financial-apis/terms-conditions)). Matters for official closes |
| Technical fit | REST, CSV by default, JSON with `fmt=json`. 1 call per symbol request of any length; a 404 also costs 1 call. 1,000 requests/minute | CLAIM. `providers/eodhd/README.md` exists without code |
| Licence | Personal plans: no selling, redistributing, displaying or granting access. Commercial "Internal use": "Displaying it or sharing it with people outside your company is not permitted". Enterprise/Custom: "data services agreement", no published display rights. Derived data, storage, attribution, post-termination and exchange fees are not addressed | CLAIM ([commercial pricing](https://eodhd.com/commercial-pricing), [terms](https://eodhd.com/financial-apis/terms-conditions)) |
| Prices | Personal: Historian $19.99, All-in-one $99.99 per month (personal use only). Commercial: Internal use $399/month or $3,990/year (1 seat, 100,000 calls/day, server download +$200/month). Enterprise $2,499/month or $24,990/year (5 seats, bulk, data services agreement). Custom from $399/month | CLAIM ([pricing](https://eodhd.com/pricing), [commercial pricing](https://eodhd.com/commercial-pricing)) |

### 3.3 Exchange-direct

| Exchange | Finding | Label |
| --- | --- | --- |
| Deutsche Börse (XETR) | WSS batch file service, as of January 2026: "Xetra daily statistics" €12,012/year flat, or "select" €4.32 per share price and year (319 × 4.32 ≈ €1,378), plus a provision fee of €4,230/year per file. The "share price file" is "Price upon request". "Eurex Underlying Corporate Actions" €3,900/year. This is a daily service; the historical backfill is not priced. All prices excl. VAT | VERIFIED ([WSS schedule of fees](https://www.mds.deutsche-boerse.com/resource/blob/1335206/f1a5300231ed96d7888c0dcb79c1f981/data/WSS%20agreement%20(schedule%20of%20fees%20%E2%80%93%20WSS%20batch).pdf)) |
| Deutsche Börse onward dissemination | MDDA price list 16_1, valid from 1 August 2026: Xetra Core distribution licence €3,642 real-time / €1,820 delayed per month. Webhosting with at most 25 instruments: €64/month per domain. Whether historical EOD counts as "Delayed" Information is not stated | VERIFIED ([MDDA price list 16_1](https://mds.deutsche-boerse.com/resource/blob/5353328/480628e5e12c9126a6a67030377d2a6e/data/MDDA_Price_List_16_1.pdf)) / UNCLEAR for EOD |
| Deutsche Börse AWS PDS | "Deprecated", licence "Non-commercial (NC)", minute bars only | VERIFIED ([registry](https://registry.opendata.aws/deutsche-boerse-pds/)) |
| Deutsche Börse Data Shop | The product page returned 404; LSEG resells Xetra pricing "From 1986" | UNCLEAR / CLAIM ([LSEG](https://www.lseg.com/en/data-catalogue/equities/pricing/equities-deutsche-borse-xetra)) |
| Euronext (XPAR, XAMS, XBRU, XMIL) | Information Product Fee Schedule 15.1 (1 June 2025): delayed redistribution "Euronext Continental Cash" Last Price €642.40/month, Level 1 €896.15/month, Level 2 €1,212.50/month. It includes public display and after-midnight data. A fee waiver exists only without "Direct Economic Benefit", which a subscription product does not meet. Milan After Midnight Last Price €661.80/month. NextHistory "End of Day Summary" via Datashop SFTP, price on request | VERIFIED ([fee schedule](https://connect2.euronext.com/sites/default/files/documentation/data/Product%20Fee%20Schedule%20%28effective%201%20June%202025%29.pdf)) / CLAIM ([NextHistory](https://www.euronext.com/en/products-services/nexthistory)) |
| SIX (XSWX) | Order form: "End-of-day closing prices (EOD plus 15 min.) are free of charge and do not require a Market Data Licensing Agreement", with a letter of confirmation. Daily closing price files from 17:45 | CLAIM ([order form](https://www.six-group.com/dam/download/market-data/exfeed/agreements-mdla/six-exfeed-mdla-order-form.pdf), [historical prices](https://www.six-group.com/en/market-data/statistics/historical-prices.html)) |
| Wiener Börse (XWBO) | Price list from 1 January 2026: "Vienna Level 1" cash market **end of day** €603.14/month; indices "Vienna" end of day €226.30/month; corporate actions end of day €364.54/month | VERIFIED ([Annex 1 MDA](https://www.wienerborse.at/uploads/u/cms/files/market-data/en-annex1-market-data-agreement-2026.pdf)) |
| Börse Stuttgart | An EOD product exists; the price list for data usage was not found in a readable form | UNCLEAR ([market data](https://boerse-stuttgart.de/-/media/files/geschaeftspartner/informationsprodukte/sonstige/en/boerse-stuttgart_market-data.ashx)) |
| Nasdaq Nordic (XCSE, XSTO), BME (XMAD) | Not reviewed in this run | UNCLEAR |

**Consequence:** at least Wiener Börse, Euronext and Deutsche Börse price the onward distribution of delayed or end-of-day data. A vendor contract only helps if it covers these exchange fees or explicitly passes them on. This is the most important contract question.

### 3.4 Other candidates

| Provider | Finding | Label |
| --- | --- | --- |
| Marketstack (status quo) | Basic $9.99, Professional $49.99, Business $149.99 per month, all "Commercial Use". Redistribution is not mentioned. Gaps and missing European corporate actions are documented in #1285 | CLAIM ([pricing](https://marketstack.com/pricing)) |
| Tiingo | Public `supported_tickers.zip`: exchanges are NMFQS, PINK, NASDAQ, NYSE, SHE, SHG, …, LSE (11). None of our 10 MICs. Pricing: "Internal Use Only"; redistribution through sales | VERIFIED ([ticker list](https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip), [pricing](https://www.tiingo.com/about/pricing)) |
| Massive (Polygon) | Stocks API: "U.S. stock market data" on US venues | CLAIM ([docs](https://massive.com/docs/rest/stocks/overview)) |
| Alpha Vantage | Terms §2a: "personal, non-commercial use, unless you and Alpha Vantage have agreed otherwise in writing". Premium $49.99–$249.99/month, or $499–$2,499 per month in the second price row (the billing basis is not stated) | VERIFIED ([terms](https://www.alphavantage.co/terms_of_service/)) / CLAIM ([premium](https://www.alphavantage.co/premium/)) |
| FMP | Price and terms pages return 403 to automated reads. Third-party sources: Starter/Premium/Ultimate, global coverage only in Ultimate. Display licence through a separate agreement | UNCLEAR |
| Intrinio | Display from the "Startup Plan"; redistribution "generally requires Enterprise licensing and may require exchange approvals". European EOD not documented | CLAIM ([licensing](https://help.intrinio.com/licensing-data-usage-requirements)) |
| Barchart | getHistory offers EOD. Barchart's own website marks European stock downloads "N/L" | CLAIM / UNCLEAR |
| Eulerpool | Free $0, Builder $99, Startup & Scale $499–$1,999, Enterprise custom. Display from Builder; redistribution Enterprise. European exchanges not documented | CLAIM ([licensing](https://eulerpool.com/financial-data-api/licensing)) |
| LSEG, FactSet | Enterprise products, prices on request | CLAIM ([FactSet Prices API](https://developer.factset.com/api-catalog/factset-prices-api)) |
| Yahoo | Terms §2(e), §2(h), §2(d)(ix), §2(d)(x): no commercial reuse, no automated collection, no database from its data | VERIFIED ([terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)) |
| Stooq | Not reachable (TLS connection reset twice); terms not readable | UNCLEAR |

## 4. Coverage of the concrete gaps

No provider could be tested on the gap dates without a paid account or a sign-up:

- EODHD demo: only 6 US/FX/crypto tickers (VERIFIED 403 for `SAP.XETRA`).
- Twelve Data demo: 401 on `time_series` for SAP/XETR (VERIFIED). The reference list works and covers 448/449 symbols.
- Alpha Vantage and FMP demo keys refuse European symbols (VERIFIED).

So **no public evidence** shows whether another vendor holds 2023-06-13, the 2025-05-09..2025-08-28 block or XETR 2026-09-17. The block is not one interval. For ABI.BR, NESN.SW and OMV.VI, for example, it consists of several intervals, the longest being 2025-06-20/23..2025-07-25 with 25–26 sessions. Because Marketstack lacks the exchange day itself, a second vendor that sources independently is plausible but **unproven**. EODHD's statement that it does not use exchange feeds means that its dates would also need an official calendar check.

## 5. Next step and cost

Step 0, free and owner-only: send the questions in section 6 in writing to Twelve Data (`support@twelvedata.com`, `legal@twelvedata.com`) and EODHD sales. No contract, no key.

Step 1, after written answers and a separate owner approval: a **one-month evaluation** with internal use only (no display, nothing committed):

| Option | Cost (CLAIM) | What it tests |
| --- | ---: | --- |
| Twelve Data Pro (individual, internal) | $229 for one month | All 10 MICs, history depth, the 85 dates for 449 symbols, splits/dividends, FIGI |
| EODHD Internal use (commercial) | $399 for one month | 449 full histories (449 calls), 898 splits/dividends calls, bulk for 420 MIC-dates (42,000 calls, under the 100,000/day limit) |
| Both | about $628 | Two independent sources against each other and against Marketstack |

Measured call volume per candidate: about 1,000–1,500 symbol requests for history and actions, plus the gap dates. That is far below every plan limit. The deciding factor is the licence, not the volume.

Step 2, production (indicative, before exchange fees):

| Scenario | Per month | Per year |
| --- | ---: | ---: |
| Twelve Data Venture | $499 | about $4,970 with the 17% annual discount, plus the custom "EOD external distribution" add-on if needed |
| EODHD Custom | from $399 | from about $3,990; Enterprise $24,990 |
| Possible exchange fees if not included (examples) | Wiener Börse EOD €603; Euronext Continental delayed Last Price €642; Xetra Core delayed €1,820 | about €36,800 for these three alone |

The exchange-fee line decides whether the business case holds.

## 6. Questions before any contract

For every vendor (Twelve Data, EODHD; also as a template for others):

1. **Display:** May historical European daily prices (OHLCV) be shown to paying end users of a subscription website (charts, tables)? Is there a limit on users, page views or symbols?
2. **Public Git repository:** Our pipeline commits generated JSON artifacts to a public GitHub repository. Does that count as redistribution? If so, which form is allowed: raw closes, close-only chart series, or derived values only?
3. **Derived data:** May scores, rankings, returns, volatility and backtest results computed from the data be published and sold? Is there a reverse-engineering threshold?
4. **Storage and termination:** May data received during the contract be kept and displayed after termination? (Twelve Data §16.2 requires deletion within 30 days.)
5. **Exchange fees:** Are distribution licences of Deutsche Börse, Euronext, SIX, Wiener Börse, Nasdaq Nordic and BME for delayed or EOD data included, or must Vision Universe sign its own agreements and report? Does public display make Vision Universe a "professional" client?
6. **Attribution:** Wording, placement (per page, per chart, imprint), logo.
7. **Data origin:** Is the daily close the official closing auction price of the primary listing (Xetra, Euronext, SIX …) or a consolidated or market-maker price? (Critical for EODHD.)
8. **History:** From which year are complete daily bars available per MIC? Are delisted securities included with their full history? Is there ISIN or FIGI history and symbol-change history?
9. **Corporate actions:** Are European splits, reverse splits, spin-offs and dividends delivered as events with ex-date, ratio, currency and the unadjusted amount? How are corrections communicated?
10. **Gap check:** Can the vendor confirm free of charge that it holds daily bars for SAP.DE and ASML.AS on 2023-06-13, for ABI.BR, NESN.SW and OMV.VI on 2025-07-01, and for SAP.DE on 2026-09-17? All of these are provider-absent at Marketstack (`europe_449_gap_inventory.json`).
11. **Twelve Data specifically:** Does Venture's "External display data access" cover **historical EOD**, or is the add-on "EOD prices for external distribution" required? Which history depth applies to the Pro/Venture European exchanges? Which plan unlocks ISIN?
12. **EODHD specifically:** Which Custom terms grant display to end users, at what price? Is "data download to corporate server" required for storage in our pipeline?

## 7. Open decisions for the owner

1. Is publishing raw European closes in the public repository a hard requirement, or may it move to private storage, with only display artifacts and derived values public? This answer changes which contracts are possible.
2. Budget ceiling for data plus exchange fees per year.
3. Approval of step 0 (questions) and, separately, of the evaluation month in step 1.
4. Whether exchange-direct EOD (SIX free, Wiener Börse €603/month) is acceptable for single MICs as official reference.

## Scope

0 paid requests, 0 sign-ups, 0 contracts. Free requests: 10 Twelve Data `/stocks` reference calls with the public demo key, 1 Twelve Data `time_series` (401), 3 EODHD demo calls (2 × 403, 1 × 200 for AAPL.US), 1 Alpha Vantage demo (refused), 1 FMP demo (401), 1 Tiingo public ticker list. Responses are not committed.
