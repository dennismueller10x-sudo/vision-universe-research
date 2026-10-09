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

## Authenticated third run 37642262870

Evidence root: /workspace/scratch/marketstack-audit/live-private/run-37642262870/vu-marketstack-capability-audit/evidence. Reviewed55 paid request records with302 conservatively reserved credits; reviewer made no calls.

| UCITS primary | Initial primary route | Bare parameter hypothesis (third run) | Observed alternative tested (third run) | Current bounded outcome |
|---|---|---|---|---|
| SXR8.DE | timeout twice at30s | SXR8 timeout | none yet | transport unresolved; no successful holdings |
| EUNL.DE | body404 | EUNL timeout | IWDA.L body404 (0007) | primary/observed alternative unavailable |
| XDWD.DE | body404 | XDWD body404 (0001) | XDWD.L body404 (0009) | unavailable on tested documented routes |
| XESC.DE | body404 | XESC body404 (0002) | XESC.L body404 (0011) | unavailable on tested documented routes |
| VWCE.DE | body404 | VWCE body404 (0003) | VWRP.L body404 (0013) | unavailable on tested documented routes |
| SPY5.DE | body404 | SPY5 body404 (0004) | SSSPF body404 (0015) | unavailable on tested documented routes |
| LCUW.DE | body404 | LCUW body404 (0005) | LCWD.L body404 (0017) | unavailable on tested documented routes |

Alternative metadata responses confirm provider listings exist; they do not establish ISIN-equivalent shareclass aliases. No data were accepted as holdings. No entitlement denial received. Substantial negative evidence across six representative funds supports UNSUPPORTED for tested retrieval scope. Timeout SXR8 cannot be converted into provider absence. A final90s exactSXR8.DE query can distinguish slow provider response from the connector30s timeout; if it times out again, actual provider coverage remains UNKNOWN even though no usable delivery is verified. PARTIAL would misleadingly imply at least some UCITS holdings were supplied, and NOT_ENTITLED would invent an entitlement denial.

Nameentitysearch0018 finally resolves14 candidates for iShares Core S&amp;P500 UCITS: observed same-name listings include SXR8.F,XFRA; CSSPX.MI,XMIL; CSPX.AS,XAMS; SXR8.DE,XETR. Dist variants IUSA are distinct shareclasses and must not be silently aliased. One observed alternative such as CSPX.AS can be tested under remaining cap if necessary.

## Consolidated capability assessment before final timeout probe

| Flag | Status | Evidence scope |
|---|---|---|
| ETFHoldingsUS | PARTIAL | VOO/VTI/SCHD available stale filings; SPY/QQQ unavailable even explicit2024-2026dates |
| ETFHoldingsUCITS | UNSUPPORTED for6 proven-unavailable funds; SXR8 coverage UNKNOWN | No holdings success; timedout SXR8 still needs boundedslowquery |
| ETFHoldingsPagination | UNSUPPORTED | Three successful funds ignorelimit1offset1 exactly; allavailablebody downloaded, actualreportedtotal absent |
| ETFMetadata | PARTIAL |12 exactETFtickerinfo responses, identity/listings/contact/rawdescriptiveUSstrategy; no structured fullfundanalytics |

No connector holdings truncation detected in authenticated evidence. Provider missing/stale filings and ignored pagination/filter semantics are separate from corrected nested-response extraction. Complete preservation of original raw body and signed weights verified.

## Final independent review D — run37645399592

Evidence root: /workspace/scratch/marketstack-audit/live-private/run-37645399592/vu-marketstack-capability-audit/evidence. This final run records21 requests,78 conservative reserved credits,21 raw responses. Audit overall totals supplied by root547 requests,1573 reserved credits,542 raw responses with5 earlier local timeouts. Reviewer made no paid calls and did not edit repository files.

Longer bounded holdings probes produce actual upstream HTTP504 HTML for SXR8.DE(raw0001), CSPX.AS(0002), SPY5.L(0003), each titled “marketstack.com | 504: Gateway time-out”. Original non-JSON bodies were preserved under their SHA256 metadata. The corrected client reports invalidResponse with actual HTTP504, not a fabricated JSON coverage or entitlement error. These prove the earlier30s SXR8 client timeout masked a provider-side request failure occurring around60s. They do not prove the provider has no UCITS data.

Final suggested truthfulness annotation for ETFHoldingsUCITS:

- status: UNSUPPORTED
- scope: OBSERVED_OPERATIONAL_DELIVERY_FOR_REPRESENTATIVE_TEST_SET
- observation: No usable UCITS holdings were delivered by any documented/observed tested ticker route; six principal candidates returned body404; SXR8 and additional observed listings ultimately returned upstream504.
- providerCoverage: UNCLEAR for gateway-error cases.
- planEntitlement: No entitlement denial observed.
- prohibition: Do not read this scoped operational status as universal Marketstack UCITS dataset absence.

If the flags contract cannot preserve these scope and uncertainty annotations alongside the status, UNKNOWN would be the only honest provider-wide UCITS coverage status. A bare UNSUPPORTED without scope would overclaim.

Final metadata contract tests CSPX.AS(0004), SPY5.L(0005), VOO(0006) all return exact ticker/item_typeETF and original raw data. CSPX/SPY5 about is genuinely empty; VOO’s substantial S&P500/index replication prose is exactly preserved as normalized.description. Legacy provider exchange_code AMS/LSE/PCX is preserved separately and not asserted to be a MIC. No structured fund analytics fields appear. ETFMetadata=PARTIAL stands.

### Final consolidated holdings completeness

| Category | Delivered rows | Completeness evidence | Current/stale | Root cause |
|---|---:|---|---|---|
| VOO |516| Entire returned report captured; offset1limit1 returns exactly identical report; reportedtotal absent; FULLunverified | report2024-12-31, STALE; current2026filter404 | provider stale available filing, ignored pagination; no connector row truncation |
| VTI |3626| Entire returned report captured; offset1limit1 exactly identical; no total; exceeds requested1000 | report2025-03-31, STALE; current2026filter404 | provider stale available filing, ignored pagination; disproves1000row connector cap |
| SCHD |101| Entire returned report captured; offset1limit1 exactly identical; no total; FULLunverified | report2025-02-28, STALE; current2026filter404 | provider stale available filing, ignored pagination |
| SPY/QQQ |0| unbounded and explicit2024-2026date requests body404 | unavailable | provider documented holdings route no data for these queried tickers; no entitlement denial |
| UCITS six principal funds |0| primary body404 plus bare/observed alternatives unsuccessful | unavailable in bounded probe | provider unavailable responses across tested routes; no successful normalization to lose |
| SXR8 plus observed CSPX/SPY5 alternatives |0| final actual upstream504HTML, preserved | operationally unavailable; coverageUNCLEAR | provider gateway failure; shorter original client timeout was transport limit, not false coverage |

Raw original signed weight sums remain VOO99.916916230713,VTI100.168847147443,SCHD99.693498783176 with9/19/2 negative rows. No100% scaling. No claim that near100% proves full. Missing holdings ticker/sector fields are raw absence in available filings; ISIN/LEI/CUSIP/country/raw currency and all report attributes are retained.

Review D final outcome: PASS preservation/completeness safeguards and corrected nested extraction; PASS evidence-backed provider limitations with above explicit UCITS scope caveat. No remaining authenticated evidence of connector-caused holdings truncation.
