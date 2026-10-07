# Independent review C — pagination

Reviewer scope: PR #461 reference at `3f11a5a9d523e2b12f448ff91a6ddf7783cdaf7e` in `/workspace/marketstack-reference`. Current main has no Marketstack adapter. Read-only review of reference; no external requests, no paid credits, no reference edits.

## Conclusion

The reference client contains real multi-page transport. It does **not** generally fetch only a first page. Synthetic cases prove correct advancement by returned count, including short intermediate pages and the nested exchange ticker response (`data.tickers`). It visibly fails when `maxPages` is exhausted, preserving the partial rows/cursor and `complete:false`.

However, reference ticker discovery is **not a paginated directory discovery process**. `scripts/marketstack/probe-missing-identities.mjs:109` calls exact `/tickers/{candidate}` only; its default Xetra candidate builder at line 57 assumes the local ticker plus `.DE`, supplemented only by provided cached/frozen candidates. There is no `searchTicker()` or `listExchangeTickers()` adapter method or production consumer of `/tickerslist` or `/exchanges/{mic}/tickers`. Missing entities cannot be attributed to a first-page cut from this code; the missing resolution paths are the demonstrated connector gap. A rejected candidate is not exhaustive provider coverage evidence.

The adapter has no ETF holdings retrieval method. Existing code cannot support a claim that ETF holdings were cut by its paginator. Any prior separate ETF script/results must be identified independently. Merely having a generic paginator capable of `extract()` does not imply it was used for holdings.

## Independent synthetic evidence

`review-c-synthetic.cjs` compiles the unmodified reference client with the current-main shared transport; transport SHA256 is byte-identical to reference (`089a8fd8cacfdbc84f0ccbfcd2c3fbbc7af9f2d5d31d3fd844845b4d5ec93a1b`). All fetch calls are injected local fakes. Results are stored in `review-c-synthetic-results.json`; 14 assertions/cases passed and zero network requests occurred.

| Case | Actual reference behavior | Assessment |
|---|---|---|
| Three pages, total 5, limit 2 | All 5 rows, complete | Correct |
| Intermediate short pages, count 1 / limit 2 | Offsets 0,1,2; all 3 rows | Correct; does not stop at first short page |
| Exchange-scoped nested `data.tickers` | All 3 pages | Correct |
| `pagination.total:null` | First 2 rows, complete true | Bug: Number(null) becomes 0 |
| Negative total | First page, complete true | Bug: invalid total accepted |
| Fractional total | First page, complete true | Bug: invalid total accepted |
| Same rows on second page with echoed requested offset | A,B,A,B, complete true | No duplicate/replay safety in generic paginator |
| Total drops 6 → 4 across pages | Four rows, complete true | Snapshot inconsistency accepted |
| Pagination object omits total | Retrieves short final page then rejects empty terminator | Safe failure; incomplete metadata unsupported |
| Empty page before positive total | invalidPagination, partial rows retained | Correct |
| Count disagrees with array length | invalidPagination | Correct |
| Echoed offset stalls at 0 | invalidPagination | Correct |
| maxPages 2 / required 3 | pageBudgetExceeded, complete false, resume offset 4 | Correct; no silent truncation |
| Caller sends limit 0 | Silently changes to limit 1000, completes | Bug: `params.limit || 1000` bypasses invalid control |

Malformed totals and duplicate/snapshot replay findings demonstrate defensive correctness bugs; **they do not prove these shapes caused the observed live coverage gaps**. No live evidence for those shapes was collected by this reviewer.

## Existing validation and safeguards

The reference `quant/tests/marketstack-provider.test.mjs` already tests two-page pagination, safety request block with resume cursor, stalled offset, and nested exchange tickers. The sparse reference checkout omits this directory, but tests are in its Git tree.

`providers/marketstack/client.js:151-169` validates limit/offset integer bounds, count equality, returned offset, and page budget. It advances by array length. It does not validate the integer/nonnegative/stable nature of `pagination.total`, returned limit, safe-integer cursor bounds, or repeated content.

`providers/marketstack/adapter.js:129` uses pagination for EOD/intraday. Adapter bars deduplicate by date/timestamp, record duplicate anomalies, and block technical admission; identity anomalies block the entire series. Adapter wrappers withhold available data on paginator failure rather than silently materializing partial history.

`ingest-de-eu.mjs` intentionally bounds five-year EOD history to two 1000-row pages. A larger response fails visibly; this is not a first-page problem. It caps dedicated action retrieval to two pages. These limits should remain explicit in reports and caller contracts.

## Minimal fixes/tests recommended

1. Add bounded documented directory search/list methods that call `client.paginate()` (current Swagger exposes `/v2/tickerslist`, not `/v2/tickers`). Preserve exchange scope and query parameters on every page. Add fixtures where the desired ticker appears only on page 3 and where identical symbols appear on two different MICs.
2. Replace truthy defaults for limit/offset/maxPages with undefined/null handling; validate safe integers. Reject null/negative/fractional/non-numeric total metadata and inconsistent offset/count before accepting rows. If total is absent, choose a documented strategy or explicit incomplete status; never coerce absence to zero.
3. Validate snapshot consistency for total across pages. Fail explicitly or mark partial if provider total changes; do not silently certify coverage. Directory deduplication must use symbol+MIC, not ticker alone; holdings identity must retain multiple source records rather than merge weights.
4. Preserve raw duplicate pages and rows; expose receivedCount and uniqueCount. If adding replay detection, use an endpoint-aware stable page signature and fail repeated pages with unchanged identities/content rather than silently drop rows and still claim complete.
5. Implement holdings separately against its **actual documented/raw response contract**. Do not run a default `data[]`/`data.tickers` extraction blindly on its wrapper. Preserve as-of, reported total, downloaded count, pagination evidence, identifiers and raw weights; missing holdings pages cannot be repaired by renormalizing weights.
6. Retain budget failure tests and add a fixture proving history/holdings cannot report complete when maxPages or credit budget prevents further pages. Keep failed partial rows/cursor accessible to diagnostic callers.

No transport loop is literally unbounded: default maxPages is 1000 and request/credit ceilings further bound attempts. Missing totals can cause unnecessary calls and eventual explicit failure; existing code does not endlessly loop.

Final-branch review remains pending until the new adapter/tests are available.
