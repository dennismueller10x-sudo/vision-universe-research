# Independent review D — ETF holdings completeness

Reviewed 2026-10-07. No paid calls, no code/product mutations. Evidence: current official Swagger saved at `current-swagger.json`; historical branch #334 SHA `bf84b7ae99b1d291de6b61d1f7ba42ef262c6eb1`; #341 SHA `d77c56321d0c340fc2b289814855a713e3e38506`; reference #457/#460 code SHA `3f11a5a9d523e2b12f448ff91a6ddf7783cdaf7e`. Historical reports are regression/context evidence, not proof of current API capability.

## Primary schema

Official source: https://api.swaggerhub.com/apis/apilayer-863/MarketstackAPIv2/2.0.0/swagger.json . `/v2/etflist`: access_key, date_from/date_to, limit/offset, optional ticker/status; documented 20-credit multiplier. Response pagination plus data[] records. Description promises name/symbol/exchange, but ETFListItem schema contains ticker only. This discrepancy needs observed response evidence; etflist membership must not alone establish ETF asset class.

`/v2/etfholdings`: required ticker, optional date_from/date_to/limit/offset; same 20-credit multiplier. Nested response: basics.{fund_name,file_number,cik,reg_lei}, output.attributes.{series_name,series_id,series_lei,ticker,isin,date_report_period,end_report_period,final_filing}, output.signature.{date_signed,name_of_applicant,signature,signer_name,title}, output.holdings[].investment_security. Crucially no pagination property or reported total holding count in response schema. A documented offset is not proof that offset pages constituent lines rather than filings or is honored at all.

Constituent fields: lei, isin, name, cusip, title, units, balance, currency, value_usd, percent_value, asset_category, cash_collateral, non_cash_collateral, fair_value_level, invested_country, issuer_category, loan_by_fund, payoff_profile, restricted_sec. Numeric fields are strings. No constituent ticker or structured sector field in schema. Preserve all fields including unknown future fields through raw payload and per-line raw observations.

## Concrete defects / omissions

1. Prior scale runner `scripts/market/scale-marketstack.mjs:116` only follows additional pages when top-level pagination exists; next-page validation at line 121 extracts `next.data.data`, which cannot parse documented nested holdings. `maxPages` cannot make this path correctly fetch nested constituent pages. **VU connector omission / incomplete use**, but actual artificial truncation **UNKNOWN** until offset semantics are measured.
2. Reference `providers/marketstack/adapter.js` has no ETF endpoint methods; equity-only mapping rejects ETF assets. `providers/marketstack/client.js:175` generic pagination default extracts data[] or data.tickers, not output.holdings. **ENDPOINT_NOT_USED / adapter contract missing** in that reference; do not claim provider lacks holdings because adapter lacks them.
3. Prior `scripts/market/probe-marketstack.mjs` calls etfholdings with ticker and limit:1000 without date range or offset. The historical scale reports also use a single limit:1000 request. These observations cannot establish latest-available filing or paging completeness. **PARAMETER/PROBE COVERAGE incomplete**, not established provider limitation.
4. Old report contains SPY/QQQ provider-error results and SCHD/VTI/EUNL.DE/IUSN.DE/VWCE.DE timeouts. A timeout is transport uncertainty and cannot establish unsupported ETF or UCITS coverage. **UNKNOWN**, and prior broad provider-unavailable claims require correction.

## Evidence contradicting simple 1,000-line truncation

#341 reports (`reports/marketstack/etf_holdings_quality.json`) preserve response hash and parameters ticker+limit:1000. Observed accepted line counts: VOO 516, AGG 12,572, BNDX 7,475, EEM 1,195, HYG 1,277, IEMG 2,704, LQD 2,910. These reports demonstrate the old materialization did not universally slice holdings to request limit. They suggest holdings limit may be ignored / not a constituent-line limit, but raw payload/current offset probes are needed. VOO as-of 2024-12-31; AGG/IEMG as-of 2025-05-31. Old default responses are stale observations, not proof no newer date-bounded report exists.

## Existing normalization safety

Historical `providers/marketstack/etf.js` preserves raw investment_security objects; signed weights, distinct collateral/derivative legs, missing identifiers and duplicate lines remain. `weightFraction = percent_value/100` correctly expresses percentage-point semantics. No renormalization to 100%. Sum above 100% does not itself establish incomplete or corrupt filing. Completeness deliberately UNKNOWN and coverage PARTIAL. Dates already corrected: date_report_period maps N-PORT repPdDate (actual holdings as-of); end_report_period maps repPdEnd (fund fiscal year-end). Never use future fiscal year-end or signature date as freshness/publication proof. Raw signature and final_filing remain available only if whole response is preserved; old normalized fund object omits final_filing/signature text despite preserving constituent raw fields.

## Safe adapter pagination and completeness requirements

- Preserve every original page separately before extraction; parse output.holdings and keep fund-series/ticker/ISIN/report-date/signature identity.
- If provider supplies trustworthy pagination total/offset/count in observed nested or top-level payload, require exact requested offset, count equal extracted count, stable report/fund identity and stable total. Paginate until reported total with explicit page budget; partial failures return incomplete diagnostics and raw pages, never success with silent truncation.
- If pagination absent, default completeness UNKNOWN. Short page is not proof of complete holdings because undocumented server caps and ignored limit remain possible. Probe offset 0 vs nonzero with small limit; identical whole payload/holding fingerprints proves non-advancement, not another page. Do not concatenate or deduplicate identical replies into a synthetic larger portfolio.
- Legitimate duplicate portfolio lines must remain; use a page-level fingerprint to catch repeated pages, not ISIN deduplication. Different dates/filings must remain separate snapshots rather than joined holdings.
- Completeness FULL needs evidence of complete constituent inventory for the same report; verified paging completeness alone does not prove latest portfolio, correct ETF share class, or exposure methodology. Record downloaded count, reported total nullable, page count, signed weights, report as-of, completeness evidence, and freshness independently.
- Do not classify TOP_N_ONLY just because weights sum below 100%. Do not classify LIKELY_FULL solely from weights ~100%; funds can include shorts, derivatives, cash and collateral.

## ETF metadata

Official ETF schemas expose fund/series identity, CIK/LEI/ISIN, as-of/fiscal-end/signature, constituent countries/categories/values/weights. No documented ETF AUM, TER/OCF/expense ratio, benchmark, legal domicile, UCITS flag, acc/dist, replication, NAV, inception, fund currency or structured sector/country allocations. TickerInfo has instrument name/type, exchange/country, reporting_currency, ipo_date and incorporation fields: these are instrument/company semantics and must not be relabelled ETF fund currency/inception/domicile without fund-specific evidence. CompanyFacts has SEC XBRL taxonomy data, not a documented structured ETF metadata API. Thus missing requested metadata is RAW_ABSENT in inspected schemas and UNKNOWN global provider availability until raw test responses are inspected; a absence-in-current-endpoint finding is more precise than blanket provider-does-not-have.

## Review result

Root-cause fixes justified: expose provider-only ETF contract; nested holdings extraction; raw fund metadata/signature/unknown-field preservation; explicit uncertain paging/completeness; no timeout-to-unsupported inference. Artificial holdings truncation and current UCITS scope remain UNKNOWN. Old normalization already handled weights and dates carefully, so avoid replacing that behavior with short-page=full, ISIN deduplication or 100% weight scaling.
