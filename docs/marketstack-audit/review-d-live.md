# Independent live ETF holdings review — PR #479

Status: preparing; authenticated raw evidence pending. No paid calls or repository edits by reviewer.

## Review rules

- Compare exact requested ticker with output attributes ticker/ISIN/series identity before admission.
- Preserve date_report_period, end_report_period and signature date independently; documentation describes the first as period start. Do not invent an as-of date.
- Count actual array length, original signed weights and all identifiers. Sum weights without scaling; 100% does not prove full holdings.
- A response without pagination.total cannot independently certify FULL. Identical full payload at offset=1/limit=1 would demonstrate ignored pagination; changed payload requires consistent report identity and an exhaustion or total proof.
- Inspect SPY/QQQ baseline vs differential response security hashes, attributes, counts, first/last rows.
- Inspect all five US and seven UCITS candidates, including raw provider entitlement or coverage errors. No marketwide unsupported inference from unrecognized symbols alone.
- Raw metadata may contain keys absent from public schema; inventory actual field classes and distinguish absent from dropped.

## Code/documentation prep

The official v2 OpenAPI describes /etfholdings response as basics plus output.attributes, output.signature, output.holdings[].investment_security. It includes limit/offset parameter references but no pagination/total response schema. /etflist is paginated and lists ticker only.

Current adapter extracts nested investment_security, stores full raw row, retains numeric signed weight plus original string, and never scales weights. It refuses FULL without verified report identity, valid date, stable attributes, nonempty holdings, pagination completion and no exact repeated rows across pages. Default lack of pagination returns PARTIAL. Synthetic tests cover signed/negative weights, missing pagination, ignored offsets, report changes, wrong ticker, empty payload and overlap.

## Authenticated initial run 37636729908

Raw evidence root: /workspace/scratch/marketstack-audit/live-private/run-37636729908/vu-marketstack-capability-audit/evidence. Reviewed original response JSON, transport metadata and normalized summaries. No paid calls.

| ETF | Raw ID | Actual holdings | Sum original signed weights % | Negative rows | date_report_period | end_report_period | Signature date | Result |
|---|---|---:|---:|---:|---|---|---|---|
| SPY | 0207 | 0 | — | — | — | — | — | HTTP200 body code404 data unavailable |
| QQQ | 0214 | 0 | — | — | — | — | — | HTTP200 body code404 data unavailable |
| VOO | 0221 | 516 | 99.916916230713 | 9 | 2024-12-31 | 2024-12-31 | 2025-02-27 | Raw report available, completeness unverified, stale |
| VTI | 0228 | 3626 | 100.168847147443 | 19 | 2025-03-31 | 2025-12-31 | 2025-05-28 | Raw report available, completeness unverified, stale |
| SCHD | 0235 | 101 | 99.693498783176 | 2 | 2025-02-28 | 2025-08-31 | 2025-03-24 | Raw report available, completeness unverified, stale |
| SXR8.DE | no response | 0 | — | — | — | — | — | timeout; no raw provider response, cannot infer coverage |
| EUNL.DE | 0248 | 0 | — | — | — | — | — | HTTP200 body code404 data unavailable |
| XDWD.DE | 0255 | 0 | — | — | — | — | — | HTTP200 body code404 data unavailable |
| XESC.DE | 0262 | 0 | — | — | — | — | — | HTTP200 body code404 data unavailable |
| VWCE.DE | 0269 | 0 | — | — | — | — | — | HTTP200 body code404 data unavailable |
| SPY5.DE | 0276 | 0 | — | — | — | — | — | HTTP200 body code404 data unavailable |
| LCUW.DE | 0283 | 0 | — | — | — | — | — | HTTP200 body code404 data unavailable |

Successful report attributes match requested exact ticker and ISIN. None contains pagination or reported total. VTI returns3626 positions for requested limit1000: a universal first1000 truncation diagnosis is directly contradicted. Adapter downloads and preserves all516/3626/101 rows and original signed weights; no exact duplicate rows in these arrays. Correct current normalized status is PARTIAL (unverified completeness), with additional factual STALE report limitation. We cannot certify FULL, TOP_N_ONLY, or missing pagination as a cause of losing positions yet.

SPY/QQQ offset differential probes were conditional on successful holdings; both had body404, so neither probe executed. Followup should perform limit1offset1 against successful VTI/VOO/SCHD rather than claim SPY/QQQ pagination checked.

### Actual metadata and identifiers

Successful raw reports contain basics fund_name/file_number/cik/reg_lei; attributes series_name/id/lei/ticker/isin/date_report_period/end_report_period/final_filing; signature date_signed/applicant/signature/signer/title. Securities contain19 raw keys: asset_category,balance,cash_collateral,currency,cusip,fair_value_level,invested_country,isin,issuer_category,lei,loan_by_fund,name,non_cash_collateral,payoff_profile,percent_value,restricted_sec,title,units,value_usd.

No security ticker or sector key is supplied in any successful report. ISINs supplied VOO503/516, VTI3569/3626, SCHD99/101. CUSIP/LEI/country/currency supplied for every row (some country N/A strings). All original fields remain in raw, including keys absent from normalized top-level selection. No structured AUM, TER/OCF, benchmark, domicile, UCITS, acc/dist, replication, NAV, inception or fundCurrency keys appear in these report schemas/actual payloads. value_usd holdings totals are not proof of fund AUM.

### /etflist semantic failure

All12 requests with different ticker filters returned byte-identical raw payloads (SHA256 cc1a1a5e0adec0f6c935e7b9e340aa2134ba7d84e0ca84c777fee84433d2f013), first1000 rows of total52429 (string), including Chinese stock tickers. Thus documented ticker filter is ignored by provider in this evidence. Connector must not call these exact matches or present all results as ETFs. Current runner calls ETF_list_exact but correctly reports pageBudgetExceeded after one page; report should explicitly identify provider filter/route semantic limitation. Loading all53 pages would cost1060 credits and still not prove ETF classification; it is unnecessary.

### Evidence-limited capability states

ETFHoldingsUS = PARTIAL:3/5 reports available and stale,2 unavailable. ETFHoldingsUCITS = UNSUPPORTED only within six404 tested qualified listing candidates; timeout candidate unresolved and worldwide/provider-wide UCITS unsupported not proven. ETFHoldingsPagination = UNKNOWN until successful offset differential; lack of total forbids completeness proof. ETFMetadata = PARTIAL: identity/SEC report/security fields supplied, full fund analytics absent from tested holdings/list responses. There is no entitlement-denial evidence.

## Authenticated second run 37638353777

Evidence root: /workspace/scratch/marketstack-audit/live-private/run-37638353777/vu-marketstack-capability-audit/evidence. Independent comparisons are original JSON equality, not only count/weight approximations.

| Fund | Baseline initial raw ID | Differential second raw ID | Params | Exact full JSON equality | Holdings count | Original signed weight sum % |
|---|---|---|---|---|---:|---:|
| VOO | 0221 | 0086 | limit1, offset1 | YES | 516 | 99.916916230713 |
| VTI | 0228 | 0088 | limit1, offset1 | YES | 3626 | 100.168847147443 |
| SCHD | 0235 | 0090 | limit1, offset1 | YES | 101 | 99.693498783176 |

The provider ignores limit/offset in all three successful report cases. It returns the same entire available report rather than one holding or a suffix starting at offset1. Classification ETFHoldingsPagination=UNSUPPORTED for the tested route/response behavior. Lack of pagination does not explain artificially cutting these holdings: all provider-supplied rows were downloaded, and VTI exceeds1000. Repeated pages should never be concatenated. The adapter's default single-response stop avoids that error.

No provider total exists, so complete provider-report body downloaded is proven while actual universe completeness is unverified. Report status remains STALE with completeness unverified; use PARTIAL in the current strict contract, or LIKELY_FULL only if explicitly defined as entire returned filing body, never FULL. Weight sums above/below100 and negative weights remain unchanged. No exact duplicate rows or field loss in preservation.

Current-date filter2026-01-01 through2026-10-07 yields body404 for VOO0087,VTI0089,SCHD0091; thus no current-year filing report surfaced through this documented parameter route. Baseline VOO repeat timed out but differential success proves available data remains the same. SPY0092/QQQ0093 date2024-01-01 through2026-10-07 still body404. SXR8 second repeat also timeout; absence remains unresolved for that qualified listing until further observed variants.

### Extended ETF metadata

Tickerinfo responses0094-0105 return all12 queried ETFs with correct exactticker and item_type=etf. There are24 standard keys: name,ticker,item_type,sector,industry,exchange_code,full_time_employees,ipo_date,date_founded,key_executives,incorporation,incorporation_description,start_fiscal,end_fiscal,reporting_currency,address,post_address,phone,website,previous_names,about,mission,vision,stock_exchanges. Most fund analytics keys are absent and generic business fields often null/empty. US exchange_code uses legacy PCX/NGM while stock_exchanges contains explicit MICs; UCITS code GER and empty stock_exchanges cannot be treated as verified MIC.

All five US funds have about text describing investment strategy; VOO explicitly identifies the Standard & Poor’s500 benchmark and replication, QQQ identifies NASDAQ100, VTI identifies sampling. Therefore a blanket statement that benchmark/replication information is unavailable must be corrected: descriptive prose is available, structured benchmark/replication contract is absent. UCITS about text is empty in all seven cases. Names contain UCITS/Accumulation qualifiers but no structured compliance/distribution flags. XESC.DE supplies sector='Communication Services'; no sector allocation table exists and a single generic sector string should not be treated as verified allocation.

No structured AUM, TER/OCF, benchmark, domicile, UCITS boolean, acc/dist flag, replication method, NAV, inception date or fund currency present across these12 raw tickerinfo payloads. ETFMetadata=PARTIAL with actual identity, listing, contact and some US strategy prose, not absent. Provider-wide availability outside tested documented endpoints not asserted.
