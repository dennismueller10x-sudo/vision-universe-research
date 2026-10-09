# Independent review A — authenticated capability audit docs fidelity

Reviewed current PR #479 Marketstack client, observation adapter, bounded runner and saved official Swagger `/workspace/scratch/marketstack-audit/current-swagger.json`. No paid API calls, no repository edits. Authenticated raw evidence pending.

## Parameters and contract

The following routes and request parameters match the saved official V2 documentation: `/tickerslist` search/exchange/limit/offset, `/exchanges/{mic}/tickers` search/limit/offset, `/tickers/{symbol}`, `/tickerinfo?ticker=`, `/eod[/latest]` symbols/exchange/date bounds, `/stockprice` ticker/exchange, `/etflist` ticker/status/date bounds/limit/offset, and `/etfholdings` ticker/date bounds/limit/offset. Corporate action methods do not pass undocumented exchange and retain exact-symbol observations without unreported MIC fabrication. Exchange ticker envelope shape `data.tickers[]` is handled.

## Important follow-up required: intraday formatting

Official `/v2/intraday` description explicitly states: “When querying ticker symbols that include a period (.), replace the period with a hyphen (-) when using the Intraday Endpoint. Example: BRK.B → BRK-B.” The runner currently sends European qualified symbols (SAP.DE, SIE.DE, etc.) unchanged. Its intraday probes do not also send observed bare local ticker candidates. A failed qualified-with-dot query cannot alone prove European coverage unsupported, because the documented alternative formatting has not been exercised. Recommend bounded raw probes for documented hyphen formatting and bare observed symbols with explicit requested MIC; these are query candidates, not approved security aliases. Documentation itself identifies IEX US scope, but actual account probes must distinguish wrong parameter from genuine unsupported coverage.

## Realtime semantics

`/stockprice` description says worldwide live snapshot; its concrete schema names `price` “Last known price” and `trade_last` “Timestamp of the last known trade.” The adapter appropriately preserves snapshot frequency and UNKNOWN delay; successful HTTP response alone cannot promote REALTIME_SUPPORTED. Compare actual timestamp against retrieval/trading session and require verified venue identity.

## ETF completeness and metadata

The holdings schema is `basics` plus `output.attributes`, `output.signature`, `output.holdings[].investment_security`; it documents limit/offset but does not document a pagination/total object. Therefore missing total remains incomplete/unverified, and only differential offset behavior can distinguish ignored paging from first-page truncation. All holding raw fields remain retained, including signed percent_value, currency, balance, units, asset_category, invested_country and identifiers. Explicitly normalized convenience fields omit balance/units/currency/asset_category/title but those are RAW_PRESENT_NORMALIZED_LOST only for the convenience view, not loss from the raw envelope.

`date_report_period` is documented as start of report period, `end_report_period` as end of report period; do not call either provider update timestamp or current as-of date without extra evidence. `ETFListItem` only documents ticker despite broader endpoint marketing description. Neither ETF schema documents AUM/TER/OCF/benchmark/domicile/UCITS/acc-dist/replication/NAV/inception/fund currency/allocations; actual raw payload may contain extras and must be checked before concluding unavailable.

## Historical/adjusted limitations

EOD fields match official schema: open/high/low/close/volume, adj_open/adj_high/adj_low/adj_close/adj_volume, split_factor, dividend, name, exchange_code, asset_type, price_currency, symbol, exchange, date. Boundary limit=1 samples are economical presence/oldest-date probes and cannot establish uninterrupted full-history completeness.

## Initial disposition

Parameter and envelope handling PASS except the missing documented intraday formatting coverage noted above. No account entitlement, provider freshness, ETF holdings completeness or European realtime conclusion asserted before authenticated raw arrives.

## Throttling and symbol-format clarification

Saved official getting-started text documents a global limit of 5 requests/second. Current runner transport spaces by 250ms, which stays below that ceiling. In saved Swagger, only `/companyratings`, `/commodities` and `/commoditieshistory` expressly state a 1 API call/minute throttle; client sets these three to 60,000ms. There is no documented `/stockprice`-specific throttle in this saved official source; a rate-limit response must be evaluated separately from entitlement or coverage.

The documented dot-to-hyphen example is the US share class BRK.B→BRK-B. It does not establish that the European provider suffix SAP.DE→SAP-DE is a verified alias; the hyphen variant is only a documented query alternative. Do not universally rewrite suffix-qualified EOD tickers or approve identity from notation alone. Getting Started wording broadly says periods should use hyphens, while endpoint-specific EOD description confines this to Intraday. The authenticated observations must resolve this documentation ambiguity per endpoint.

## Authenticated initial run review — 37636729908

Source: `/workspace/scratch/marketstack-audit/live-private/run-37636729908/vu-marketstack-capability-audit/evidence`; run observed 326 requests and 782 conservative reserved credits, no terminal circuit. Review itself issued no paid requests.

### Proven connector defect: exchange label conflated with MIC

Raw EOD response 0288 for AAPL reports `exchange_code: NASDAQ`, `exchange: XNAS`; 0205 for SPY reports `exchange_code: NYSE ARCA`, `exchange: ARCX`. Existing `micOf()` selects exchange_code first and rejects both valid matching listings as `identityMismatch`. Same defect affects QQQ, VOO, VTI, SCHD, TSLA and NVDA (0205,0212,0219,0226,0233,0288,0302,0311). European raw EOD lacks exchange_code, explaining why those samples pass. Fix should distinguish provider venue code/label from actual MIC, preferring an explicitly valid 4-character MIC without inventing a mapping or weakening mismatched-venue gates. Add regression fixture with both fields.

### Provider behavior differs from ETF list documentation

All twelve `/etflist?ticker=` responses return the same global first page of 1,000 symbols, total 52,429, despite requested exact tickers. Examples 0206/SPY,0213/QQQ,0220/VOO,0241/SXR8.DE. Saved Swagger documents the ticker filter, but account raw demonstrates it does not scope this list. Adapter returns explicit `pageBudgetExceeded` under one-page audit cap; this is not silent first-page truncation. Do not infer an ETF absent from this unrelated first page. No global ETF universe ingestion is warranted for this audit.

### Stockprice rate failures require bounded retry after spacing

0019 SAP.DE/XETR yields HTTP404, `error.code: no_ticker_or_exchange_found`, meaning failed requested symbol/venue lookup rather than entitlement. Remaining 13 stockprice calls yield rate_limit_reached/429; every one occurs within 35 seconds of the first call (14:27:38–14:28:13 UTC). This pattern is consistent with a stricter endpoint throttle than the documented global 5/sec, but does not establish its exact period. Use conservative >=60-second per-stockprice spacing for parent-coordinated follow-up. None of these 429 responses establish unsupported coverage, plan restrictions or real-time price availability. Map observed `no_ticker_or_exchange_found` to dataUnavailable if making endpoint error contract consistent.

### Verified supported reference endpoints and schema variations

Exchanges (0316, total2883), currencies (0317,total43), timezones (0318,total57), AAPL tickerinfo (0319), indexlist (0320,total"125"), indexinfo (0321), bondlist (0322,total55), Germany bond (0323), gold commodities (0324), gold commoditieshistory (0325) return data successfully. String totals are accepted by strict numeric pagination validation. Indexinfo is a top-level array instead of a data-wrapped response in documentation; raw transport retains it successfully. Tickerinfo exchange_code is NMS (provider label) and stock_exchanges has actual MIC; do not call NMS a MIC. Gold history shape is `result.basics` and `result.data[]`; generic data-array consumer assumptions would be wrong, but current raw request retains it.

### ETF raw field availability

VOO (0221), VTI (0228), SCHD (0235) match documented nested holdings. Their report starts are 2024-12-31, 2025-03-31 and 2025-02-28, respectively; period ends 2024-12-31, 2025-12-31 and 2025-08-31. These are report-period fields, not provider update timestamps. Raw attributes/basics identify ticker/ISIN/LEI/SEC identifiers and fund/series names; requested fund TER/AUM/benchmark/UCITS/NAV fields are absent in these sampled outputs. SPY (0207), QQQ (0214), six UCITS (0248,0255,0262,0269,0276,0283) return an HTTP200 top-level code404 “No data is available for this ticker at the moment”, correctly mapped dataUnavailable; SXR8.DE times out without a stored response and needs follow-up. No entitlement restriction observed.

### Intraday interpretation remains constrained

All fourteen dot-qualified European requests return HTTP200 empty data with pagination.total0. Their documented bare/hyphen alternatives remain untested, so coverage-negative classification still requires the bounded follow-up. Empty 1min data means that request was accepted without an entitlement denial; it does not establish 1min price coverage.

## Updated disposition

CHANGES_REQUIRED for proven exchange-code/MIC confusion. Account reference capabilities above can move from UNKNOWN to observed SUPPORTED, but Europe realtime and intraday need format/throttle follow-up; ETF list filtering exhibits a provider/documentation mismatch.

## Current online documentation verification

Refetched official Getting Started and Swagger during authenticated audit. Source/hash manifest: `/workspace/scratch/marketstack-audit/live-docs-current-sources.json`. Current Swagger SHA256 `cf88fea6da0237b5f64fb9a15d0931c5122bbd213e24ea39788f72f55102bdf4`. Current Getting Started again documents global 5 requests/second and no /stockprice-specific minute limit. Swagger only documents 1/min for companyratings/commodities/commoditieshistory. Thus conservative stockprice>=60sec spacing is an observed-throttle mitigation, not a currently documented default.

Stockprice current request schema documents required single `ticker` string (Stock ticker symbol) and optional `exchange` (Stock exchange MIC). No comma-separated batching is documented, unlike explicit symbols batching for EOD/intraday. Do not assume batch support or one-credit batch billing. No separate stockprice exchange-code list/download is linked in current official schema. Response schema has exchange_code/exchange_name/country/ticker/price/currency/trade_last but no dedicated MIC. Actual raw code must be interpreted as provider label unless verified to be a valid listing MIC; metadata route can supply actual exchange MIC separately.

Public sources: https://docs.apilayer.com/marketstack/docs/getting-started and https://api.swaggerhub.com/apis/apilayer-863/MarketstackAPIv2/2.0.0/swagger.json . No paid requests were issued for this verification.

## Current official credit accounting verification

Current official FAQ https://marketstack.com/faq , section “What is an API Request?”, states: “Each time the marketstack API service is used to look up data for one specific stock ticker, one API request is consumed. As a result, if a given API request contains 5 tickers (symbols), 5 API requests will be consumed. API errors are not counted towards your monthly quota.”

Current official Swagger `/v2/etflist` and `/v2/etfholdings` both explicitly state: “Note that ETF API endpoints apply a call-count multiplier of 20 toward your usage quota.” No special multipliers occur in the current `/stockprice`, indexlist/indexinfo, bondlist/bond, commodities/commoditieshistory descriptions. Therefore singleton non-ETF1 and ETF20 matches the documented counting model. Reserving errors as if billed overestimates documented usage; no refunds in the audit ledger are needed for hard-cap safety. This does not establish observed account billing. Exact quotes, current source hashes and endpoints checked are saved in `/workspace/scratch/marketstack-audit/live-credit-docs-review.json`.

## Corporate action and adjusted-series semantics — authenticated raw

Independently inspected complete small event windows and fully paginated action responses for AAPL/TSLA/NVDA in initial run37636729908. No paid review requests, no Quant changes, no provider-value corrections. Exact evidence and missing-field/range checks are in `/workspace/scratch/marketstack-audit/live-action-semantics.json`.

- AAPL: split raw0295 reports 2020-08-31 factor4, agreeing with EOD0297 split_factor4 that day. Raw close2020-08-28=124.8075, then2020-08-31=129.04: the purported raw series is consistent with pre-split price already restated to the post-split share basis, not a uniform historical as-traded unadjusted series. Its adjusted close/raw close ratio differs only approximately1.5%, not4. Do not apply the split again from the endpoint event. Crucially, **adjusted OHLC range violations are directly proven**: Aug25 adj_close122.9442>adj_high121.9155367899; Aug26 adj_close124.6161>adj_high123.6814617576; Sep1 adj_close132.1582>adj_high131.2853990978. These are provider raw inconsistencies before VU processing.
- NVDA: split raw0313 reports 2024-06-10 factor10, agreeing with EOD0315 that day. June7 rawclose1208.88 versus adj_close120.8781 (ratio~10.000819); June10 rawclose121.79, adj_close121.78. This window is consistent with a raw pre-split price basis plus backward-adjusted price, unlike sampled AAPL. No adjusted OHLC range violation in these8rows. June11 dividend0.01 appears in both EOD and dedicated dividend0314. Both raw volume and adjusted volume are already near-identical on pre-split days (June7 raw412385776 vs adjusted412385800); do not assume multiplying one by split_factor produces the other. Exact volume share basis is not established by these samples.
- TSLA: split raw0304 reports2022-08-25 factor3, agreeing with EOD0306 split_factor3. Aug22 close=adj_close869.74 and Aug23both889.36; Aug24 close891.29 versus adj_close297.0967 (ratio3), then Aug25both296.07. All7rows lack adj_open/adj_high/adj_low/adj_volume. Consequently adjusted close has a mixed pre-split adjustment basis and adjusted OHLC/volume coverage is incomplete in the actual provider response. Aug24 rawopen2678.07/high2732.82 alongside low/close891.29 is an additional adjustment-quality concern (roughly3× opening basis); do not silently correct it or infer an external as-traded truth without independent reference data.

The safe capability classifications are **adjustedOHLC PARTIAL**, **adjustedVolume PARTIAL**, **splits SUPPORTED** and **dividends SUPPORTED** for observed sample coverage. Full adjusted-price economic semantics remain unverified and provider quality gates must reject/quarantine inconsistent series for downstream use. This is a provider data-quality limitation, not normalization dropping fields; raw values are preserved.

AAPL dividend response0296 has28rows, of which22lack payment_date/record_date/declaration_date/distr_freq; NVDA0314 has28rows,23lack those metadata fields. Latest samples have these fields, so metadata coverage is historical PARTIAL rather than endpoint unavailable. TSLA0305 returns total0 dividends; an empty non-dividend-paying control does not negate dividend endpoint support. No universal coverage conclusion is inferred from these three issuers.

## Independent A final three-run review

Runs inspected: initial37636729908 (326HTTP attempts/782reservedcredits), bounded follow-up37638353777 (145/411), final37642262870 (55/302). Cumulative **526attempts/1495conservative reservedcredits**, below2000target/3500hardcap. Five attempts timed out with no response;521stored raw responses have no usageHeaders. Actual invoiced/remaining account credits and plan name are not account-verified. Professional is user-stated and matches advertised plan features, but successful API authentication verifies endpoints, not the subscription label/monthly allowance/commercial license/support contract. No run reported function_access_restricted, entitlementRestricted or authError. Consequently no tested lack of data is a proven plan limitation.

### Final root-cause corrections confirmed

Current implementation separates exchange_code labels from actual MIC, fixing valid US EOD rejection. Raw-field preservation now includes holdings balance/units/currency/assetCategory/title and metadata identifiers/sector/industry/description; raw envelopes remain complete.

The current `/stockprice` API diverges from the current Swagger parameter description: `exchange=XNAS` or European MICs XETR/XPAR fail, whereas the observed provider code `exchange=NASDAQ` succeeds for AAPL. Bare native ticker without exchange returns multiple actual venues. Qualified EOD symbols SAP.DE/MC.PA do not work on stockprice. Current adapter now uses endpoint-specific native ticker, retrieves venues and applies independently evidenced provider-code/name→MIC mappings, retaining original codes and mapping evidence. This is a confirmed query/mapping root cause, not a Professional entitlement limit.

Independently replayed final CURRENT code using fake transport with exact final authenticated raw0047–0053 (no network): SAP/SIE/ALV/DTE ETR→XETR and MC EPA→XPAR pass, preserve raw price/date and record mapping source; ASML AMS→XAMS passes identity but remains stale2026-08-19; ABBN VIE-only is correctly rejected for requestedXSWX. Implementation **PASS** for this observed contract and venue rejection. This replay is distinguished from original final Actions observations, whose normalized results predate the final evidence map and say snapshotVenueUnverified.

### Professional feature observations versus account assertions

| Advertised feature | Authenticated observation / justified conclusion |
|---|---|
|100000monthlyrequests|Pricing/user-stated allowance; not account-verified by an API usage counter.|
|EOD|Global and scoped latest/history deliver actual equity/ETF observations; SUPPORT observed, freshness varies by provider instrument.|
|15+years|SAP/ASML fifteen-year boundary samples begin2011-10-07; full earliest2010-01-04. AAPL oldest1996-10-07. Presence supported; no uninterrupted full-series certificate.|
|Splits/dividends|Dedicated endpoints succeed with matching split dates/factors and positive dividend controls; action metadata historical coverage partial.|
|Stocktickerinfo|Exact metadata and tickerinfo return names/ISIN and identifiers where present. Search/directory filters are inconsistent; discovery not a completeness guarantee.|
|2700+exchanges|Authenticated /exchanges total2883, directory-only listing does not imply price coverage.|
|Currencies/timezones|Successful raw; totals43and57.|
|HTTPS|All authenticated requests use HTTPS; transport support observed.|
|Commercialuse/standardsupport|Contract/account attributes, no API endpoint or independent account verification; do not equate successful data request with license/support verification.|
|IEXUSintraday/realtimeupdates|AAPL15min and1min payloads received, exchangeIEXG, derived marketstack_last present. FullTOPS last/bid/ask fields null; actual mid is non-null despite stale documentation generalization.|
|Stockmarketindex/bonds|Indexlist/indexinfo and bondlist/Germanybond succeed. Indexinfo raw is a top-level array; consumer must not assume data wrapper.|
|ETFholdings|ThreeUSfunds deliver large complete-response filing payloads, but stale and no reported total. SPY/QQQ unavailable; UCITS tested identifiers produce no data or timeout. Partial sampled coverage, not plan denial.|
|Real-timeStockMarketPrices|Five nativeEuropean same-day snapshots demonstrably returned; no timezone/delay/update metadata, so actual REALTIME latency is unverified. Europe snapshot capability PARTIAL; ASMLstale and ABB nativeSIX missing.|
|Commodityprices/history|Gold current and historical routes succeed with documented1/min spacing.|

### Remaining provider limitations, distinguished from resolved connector defects

- Provider directory name/venue search and etflist filters diverge from documentation; exact metadata/latest routes may succeed even when search misses a security.
- ETFholdings pagination parameters are ignored by observed report payloads and no total is reported; no provider paging certificate. Date-constrained current filings are unavailable; stale filing dates remain raw and weights are not rescaled.
- UCITS data absence for tested fund identifiers is coverage-specific; two iShares parameter alternatives time out, which is not a conclusive entitlement/coverage error. Preserve per-test timeouts rather than invent an unsupported result.
- Snapshottimestamps are naive local-looking strings without timezone; no provider declared delay or quote update timestamp. Five same-day European quotes support a price snapshot, not certified tick realtime. ASML local quote datedAug19 and ABB lacks nativeSIXquote in tested bare response.
- Europeintraday dot/bare/hyphen probes fail or return zero while USIEX controls succeed; no tested European native intraday coverage.
- Adjusted OHLC/volume sparse or internally inconsistent (separate action review); historypresence does not establish economics or complete series.

Final independent A disposition: **PASS for corrected route/parameter/raw-preservation and observed venue mapping contract; provider-data limitations remain explicit.** No production/product/Quant changes or paid reviewer calls.
