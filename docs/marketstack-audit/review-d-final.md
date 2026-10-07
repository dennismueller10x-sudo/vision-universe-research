# Independent final review D — ETF contract

2026-10-07. Reviewed `providers/marketstack/audit-adapter.js`, `client.js`, and `tests/audit.test.mjs` in current isolated audit checkout. No paid API calls; no product changes. Ran `node --test providers/marketstack/tests/audit.test.mjs`: **19 passed / 0 failed**.

## Corrected and verified

- listETFs now sends documented ticker/status/date_from/date_to/limit parameters instead of undocumented search.
- Holdings use nested output.holdings extraction and retain original complete pages and constituent objects, future fields, signed original weight strings. No weight renormalization or ISIN deduplication.
- Missing pagination defaults to one observed response with complete:false / paginationUnverified, regardless of row count. This accommodates prior responses exceeding limit without synthetic completeness.
- Explicit probePagination can detect offset ignoring through a repeated-page fingerprint; repeats are not appended.
- Trustworthy pagination requires exact offsets/counts, stable total and explicit page budget. Report attribute changes prevent a complete flag.
- Signature and attributes (including final_filing) retained. Report dates and fiscalYearEnds separately exposed; fiscal year-end cannot advance freshness.
- No marketing-based capability inference, ETF AUM/TER/NAV/UCITS fields invented, products registered, or Tiingo changes.

## Blocking finding: FULL does not require report identity

At audit-adapter.js holdings completion gate, `complete = res.complete === true && reports.size <= 1`. A singleton `[null]` attribute array satisfies this; a singleton wrong ticker also satisfies this. Thus valid pagination can certify a different or unidentified report as FULL.

Synthetic reproduction with an injected deterministic client (no fetch):

1. Request getETFHoldings('SPY'); return pagination {offset:0,count:1,total:1,limit:1000}, attributes {ticker:'QQQ',date_report_period:'2026-06-30'}, one holding. Actual: ok:true,complete:true,completeness:'FULL'.
2. Request SPY; return data[] holdings with valid pagination but no output.attributes. Actual: complete:true,FULL,attributes:[null].
3. Return zero holdings, attributes SPY/date, total:0/count:0. Actual: FULL and sumWeightsPercent:0. Zero weighted positions should have null observed weight sum and should not certify a complete usable portfolio.

Required correction: certify FULL only after nonempty holdings, present report attributes, exact requested ticker and valid report as-of are established, and each page reports consistent fund-series identity. Missing/wrong identities must keep raw observations but complete:false with a concrete reason. Pagination completeness may remain separately reported if useful; it cannot become portfolio identity/completeness without this gate. Add tests for wrong returned ticker, missing attributes/as-of, empty holdings and malformed holding shapes.

## Remaining semantics

FULL should describe complete constituent traversal for a verified single provider report; it must not imply latest report, ETF share-class certification or product admission. Raw metadataVerification:PROVIDER_OBSERVATION_ONLY and as-of remain necessary. Actual provider ETF offset behavior and coverage require live evidence separately; deterministic paging tests validate connector safety only.

## Review status

**CHANGES REQUIRED** for the erroneous FULL identity/empty gate. The documented filter, unknown-pagination, original weights/metadata preservation fixes otherwise pass review.


## Re-review disposition after fixes

Re-read the corrected adapter/client and re-ran the focused test file: **23 passed / 0 failed** in this reviewer run (root reports 28 across broader checks). No paid API calls.

The blocking FULL findings above are resolved: complete holdings now require present per-page attributes, exact requested ticker, valid actual report date, stable attributes, nonempty rows, verified pagination and no exact repeated cross-page lines. Empty weight sum is null. Original transport/budget failure reasons survive ETF wrapping. Missing identity, wrong ticker, empty holdings, report changes and overlapping pages return incomplete with concrete reasons. Overlapping/duplicate raw rows and their signed weights remain visible rather than silently discarded. The added regression test covers wrong fund, missing report, empty and overlap cases.

Signature/raw metadata remain intact; end_report_period now uses the neutral normalized field reportedPeriodEnds, keeping empirical/form-specific interpretation in audit evidence. There is no synthetic AUM, TER, UCITS or latest-report claim.

**Final disposition: PASS for ETF provider-observation scope.** FULL is limited to traversal of a single dated provider report; currentness, legal fund/share-class admission and actual provider paging capability still require separate live evidence. The earlier CHANGES REQUIRED disposition is superseded by this re-review.
