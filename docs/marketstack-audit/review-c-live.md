# Independent live pagination review C

Scope: PR #479 provider transport, observation adapter and bounded capability runner. Read-only review; no provider API requests and no repository edits.

## Static review

Transport advances the next offset by actual downloaded row count, rather than requested limit. It requires nonnegative integer offset/count/total, matching requested offset, count equal to row count, and a stable total. Repeated complete pages, empty intermediate pages, changing totals and exhausted page budgets explicitly return incomplete failures. Missing pagination metadata cannot certify completeness; a nonzero initial offset only certifies the suffix scope. Batches propagate incompleteness.

Exchange directory extraction supports `data.tickers` and retains raw envelopes. Scoped identity deduplication is visible through duplicate counts and prevents complete certification. The default audit uses three-page company/exchange limits and two-page ticker/price/holdings limits. These limits require explicit reporting when a provider total exceeds downloaded coverage; they do not establish full universe coverage.

Holdings without pagination remain incomplete. An optional explicit unverified-offset probe cannot mark FULL. Overlapping identical rows across pages and changed filing metadata prevent FULL; original signed weights are not normalized to 100%.

Validation: all 23 adapter/transport fixture tests passed locally, including short intermediate pages, malformed totals, repeated pages, moving totals, zero count before total, exchange pagination, suffix-only scope, holdings overlapping pages and ignored offsets.

## Authenticated raw evidence

Pending receipt of encrypted Actions artifact and local decryption by the parent agent. No provider capability conclusion follows from fixture tests alone.

## Initial live result: run 37636729908

Evidence directory: `/workspace/scratch/marketstack-audit/live-private/run-37636729908/vu-marketstack-capability-audit/evidence`. Independent analyzer output is `live-private/pagination-analysis.json`. This run reserves 782 conservative credits across 326 requests; review itself made zero paid calls.

All paginated raw responses have count equal to downloaded row count, correct requested offset and total at least offset plus count. Every multi-page continuation advances by actual count. No raw count/offset/total violations were found.

**Real multi-page discovery passes.** Allianz company search returns 2,350 rows over offsets 0, 1000 and 2000 (`0038`, `0039`, `0040`). The requested home listing `ALV.DE` appears only on the third page (`0040`). A one-page or two-page search would lose it. Corrected connector downloads all 2,350 and certifies complete. Nordea returns 2,008 rows over the same offsets (`0181`–`0183`) and certifies complete. Its home listing `NDA-FI.HE` appears on the first page; this differs from Allianz and prevents a blanket claim about where all targets occur. All other company searches complete within a single 1,000-row page. All successful exchange-scoped searches complete within one page. Four exchange-scoped searches return raw `no_valid_exchange_provided` errors despite the same exchange supporting other queries: these are query-dependent provider results, not pagination losses.

**ETF directory filtering differs from documentation.** Twelve `/etflist?ticker=...&limit=1000&offset=0` probes return byte-identical raw hash `cc1a1a5e0adec0f6c935e7b9e340aa2134ba7d84e0ca84c777fee84433d2f013`, count 1000, total string `52429`, starting ticker `000001.SZ`. Therefore the requested ticker is ignored in these observations. Each capped operation correctly exposes `pageBudgetExceeded`; no scoped ETF metadata or complete directory should be inferred. Recommendation: probe this once, preserve the filter-ignored result, and do not repeat twelve requests or call it an exact filtered result. This is a provider parameter behavior plus audit routing improvement; it is not ETF holdings truncation.

**Holdings differ from the directory.** Three successful holdings responses are unpaginated: VOO 516, VTI 3,626 and SCHD 101 downloaded rows. VTI's 3,626 rows were returned in one raw response despite `limit=1000`, disproving an imposed connector 1,000-row limit in this response shape. Adapter retains every row and correctly leaves completeness unverified. Missing totals prevent proof of FULL; weight sums are evidence, not a substitute for totals. SPY/QQQ initial calls return unavailable, so their planned differential pagination probes did not execute; a later bounded successful US example should test offset behavior directly. No provider holdings pagination failure is demonstrated yet.

Conclusion: PASS for corrected transport pagination and explicit incomplete handling. Identified actionable runner behavior: avoid repeated unfiltered `/etflist` calls. Required remaining verification: successful holdings offset differential and any newly implemented directory filter scope guard. No claim of full global universe ingestion is justified by this representative audit.

## Bounded follow-up: run 37638353777

Independent read-only raw comparison: 145 requests / 411 reserved credits in the parent run; review makes no paid requests. Analyzer output: `live-private/pagination-analysis-2.json`; full ordered/security/set/body hash comparisons: `live-private/holdings-hash-comparison.json`.

SAP directory search with limit 50 returns offsets 0/50/100 and counts 50/50/44, total 144 (`0042`–`0044`). All 144 raw directory rows appear unchanged inside normalized observations. `SAP.DE` is index 134, on the third page. Exchange-scoped Allianz search with limit 1 returns five distinct pages, offsets 0/1/2/3/4, count 1 each, total 5 (`0045`–`0049`); all five rows remain in normalized observations. `ALV.DE` is the first page of the scoped query. No paginated count/offset/total violations occur anywhere in this follow-up.

### Holdings offset differential: ignored pagination, whole filing retained

| ETF | Initial offset 0 / limit 1000 | Follow-up offset 1 / limit 1 | Retained rows | Raw response SHA-256 (identical across both requests) |
| --- | --- | --- | ---: | --- |
| VOO | Run 1 `0221` | Run 2 `0086` | 516 | `4176d87b7bb45b1817467bd1989b1c4f7b6048ac95941d03273b16765498906c` |
| VTI | Run 1 `0228` | Run 2 `0088` | 3,626 | `eb5e9d101af553e0e46719449199d239010b5a85cbda32e3bade2ad3937fd70e` |
| SCHD | Run 1 `0235` | Run 2 `0090` | 101 | `c7f8f04720b5f094361630d3ec5b986c9b2b946e6ca8bba831a229eb68335b47` |

Raw response bytes, ordered full holdings, ordered investment-security fields, sorted holding sets, full parsed bodies, filing attributes and signatures are identical for each pair. Repeated ordinary offset-0 calls for VTI (`0082`) and SCHD (`0083`) are also identical. This proves that `offset` and `limit` are ignored for these observed whole-filing responses. Following a fabricated next page would duplicate the entire report rather than recover further rows.

Every VTI/SCHD raw holding remains unchanged in normalized `.raw`; every original `percent_value` equals normalized `weightRaw`. Downloaded counts equal 3,626 and 101 respectively. Their sums remain 100.16884714744282% and 99.69349878317597%, with no forced 100% adjustment. VOO ordinary repeat timed out; its successful differential response still independently matches the full initial response byte for byte.

Provider pagination is therefore **UNSUPPORTED for these observed holdings filing responses**, while transport pagination itself is working. Completeness relative to the provider-returned filing is exact, but completeness relative to an external full portfolio cannot be proven without provider totals or an independent filing total. The data are stale filings (VOO 2024-12-31, VTI 2025-03-31, SCHD 2025-02-28); no pagination fix can make them current. `end_report_period` and signature dates must not replace the report as-of date.

Conclusion after follow-up: PASS. No silent directory/holdings truncation or weight alteration found. No further transport pagination fix is justified by these raw responses.

## Final bounded run: 37642262870

Read-only evidence path: `/workspace/scratch/marketstack-audit/live-private/run-37642262870/vu-marketstack-capability-audit/evidence`. This final parent-run ledger contains 55 requests / 302 reserved credits and no terminal budget/auth/quota reason. Independent analyzer output: `live-private/pagination-analysis-3.json`. Across all three live runs, parent accounting is 526 requests / 1,495 conservatively reserved credits; this review adds zero provider calls.

Final raw pagination responses again have matching offset/count/total and contain no metadata violations. Entity-encoded iShares/SPDR name searches return complete 14-/18-row results. Final Schaeffler alternative EOD returns one row with total one. The final UCITS holdings hypotheses provide no successful new holdings arrays: bare/provider-observed alternatives mostly return unavailable; two iShares bare hypotheses time out. Consequently these probes cannot provide an additional portfolio total or a holdings pagination certificate. Timeouts remain an uncertainty about those hypotheses rather than evidence of nonexistence.

### Final pagination conclusions approved for the root-cause report

1. **Corrected ticker discovery is paginated.** Initial Allianz global company search downloaded all 2,350 rows over three pages; its home ticker was on page three. SAP's follow-up limit-50 search downloaded all 144 rows over three pages; its home ticker was also on page three at this page size. Successful exchange pagination was separately demonstrated by five distinct limit-one Allianz pages. Page numbering depends on requested limit; do not conflate the website's limit-100 page-two SAP result with this limit-50 page-three API result.
2. **Representative completeness does not establish whole-universe ingestion.** The bounded audit follows matching query totals and exposes caps; it does not claim every exchange/global instrument was imported.
3. **ETF directory filter is ignored in observed raw responses.** `/etflist?ticker=...` returned the same first 1,000 rows of total 52,429 for all twelve requested tickers. `pageBudgetExceeded` is correct for this deliberately capped global listing. An exact ETF directory result and absence of the requested ETF cannot be inferred from the first page. The API directory pagination itself exists; its ticker-filter behavior differs from documentation.
4. **Observed holdings pagination is unsupported, not missing in the connector.** `offset=1,limit=1` returns byte-identical whole filings to `offset=0,limit=1000` for VOO, VTI and SCHD, retaining 516 / 3,626 / 101 rows. Thus additional fictitious pages would duplicate holdings. No connector 1,000-row truncation occurred. Classifying observed `ETFHoldingsPagination` as UNSUPPORTED is supported by three independent ETF cases, not merely by the documentation's absent total field.
5. **Whole raw-file preservation is exact; external completeness is unverified.** All downloaded rows, nested security fields and original signed weights remain in the adapter; the unmodified VTI sum exceeds 100% and SCHD sum is below 100%. The provider gives no total that establishes full portfolio coverage. Whole-filing availability may be LIKELY_FULL but must remain STALE and cannot be certified FULL/current by normalizing weights or inventing a total.

Final review outcome: **PASS** for transport pagination, raw field/weight preservation and no silent truncation. Provider limits remaining are ignored ETF directory filters, non-paginated whole-filing holdings, missing holdings totals and stale/missing reports. No further connector pagination change is justified by the authenticated raw evidence.
