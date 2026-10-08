# Independent C final-branch pagination review

Scope: `/workspace/vision-universe/providers/marketstack/{client.js,audit-adapter.js}` and `scripts/marketstack/capability-audit.mjs` on the isolated draft branch. Read-only code review; zero paid/provider requests. Live script was inspected but not invoked.

Validation: `node --test providers/marketstack/tests/audit.test.mjs`: 19 tests passed, 0 failures. Five additional injected-fetch probes stored in `review-c-final-synthetic.{cjs,json}`.

## Fixed findings confirmed

- Directory search now uses current documented `/tickerslist`; exchange discovery uses `/exchanges/{mic}/tickers` with nested extraction and preserves the endpoint/query scope across all pages.
- Actual page count drives next offset; short intermediate pages do not truncate the result.
- Null/negative/fractional/empty/boolean/missing pagination totals fail explicitly rather than becoming zero.
- Wrong count/offset, empty pages before total, changing totals and exactly repeated page content fail with partial rows/raw pages retained.
- Missing metadata returns `complete:false`, `paginationUnverified`. Explicit exploratory follow-up can request further unverified pages, but a short response still does not certify completion.
- Page/request/credit caps fail visibly and preserve the cursor. API latest calls bypass cache. ETF weights remain raw/signed and are never renormalized.
- A changed holdings reporting period prevents FULL.
- Audit script caps pages for each probe, reserves every request before fetch and uses maxRetries 0. Its 1999 default/3500 maximum conservative credit ledger cannot silently reset inside one run. No universe ingestion or production routing is present.

## Remaining review findings at first reviewed snapshot

### 1. Nonzero start offset returns global `complete:true` — change requested

`client.js:182` returns `{complete:true, coverage:'SUFFIX_ONLY'}` after starting at offset 2 and receiving only the third row of total 3. The suffix is exhausted; all provider pages were not collected. Because `complete` is consumed elsewhere as an all-pages certificate, return `complete:false` plus `coverage:'SUFFIX_ONLY'` (optionally separate `requestedRangeComplete:true`). Use the validated numeric initial offset, not truthiness of `params.offset`; string `'0'` currently incorrectly labels ALL coverage as SUFFIX_ONLY.

Independent fake evidence: `review-c-final-synthetic.json.suffix`, `.stringZero`.

### 2. Batch aggregate loses incomplete state — change requested

`client.js:189-197` checks child `ok` but not child `complete`; absent pagination gives child `{ok:true,complete:false,reason:'paginationUnverified'}` yet aggregate `{ok:true,processed:all,remaining:0}` with no completeness/reason. Since successful transport is intentionally separate from completeness, propagate explicit aggregate `complete:false` and completeness reason, or fail incomplete batches. Do not silently drop partial results. No existing product caller uses this audit client; this is an API-contract correctness issue, not a proven live truncation root cause.

Independent fake evidence: `.missingBatch`.

### 3. Holdings overlap across different pages can certify duplicate coverage — change requested

`audit-adapter.js:73-83` only checks whole-page replay and stable report attributes. Different pages `[A60,B40]` then `[B40,C10]` with count2/total4 pass all checks and return FULL with sum150. Exact duplicate source holding rows across pages should remain raw and downloaded, but mark completeness PARTIAL and expose duplication evidence. Do not sum/delete/redistribute weights to manufacture 100%. Treat source duplicate identity alone cautiously: legitimately separate investment rows may share an instrument ID; exact repeated raw rows across pages are the safer replay criterion.

Independent fake evidence: `.overlappingHoldings`. This synthetic overlap is not proof of actual provider overlap.

### 4. Exchange scope absent from normalized row — improvement requested

`audit-adapter.js:43` normalizes each nested exchange ticker without its parent scope. If page has `data.mic:'XETR'` and tickers `{symbol:'T0'}`, normalized providerExchange is null. Raw preserves the MIC, but normalized listing identity loses observed exchange evidence. Pass the observed parent MIC (with provenance) into normalization, validating it against the requested MIC. Never fabricate provider fields or replace conflicting row MICs. This also prevents symbol-only directory deduplication for parent-scoped rows.

Independent fake evidence: `.exchangeScope`.

## Limits

No credential exists in this session, so parity/freshness and holdings live completeness remain UNKNOWN. The connector/test corrections do not prove that the original gaps were caused by these exact synthetic shapes. Current-main absence of Marketstack and the reference's missing discovery consumers remain separate evidence from paginator correctness.

Review outcome at the first reviewed snapshot: tests pass; request corrections to findings 1–3 before final approval. Finding 4 is normalization/identity preservation and should be considered by the normalization reviewer. Re-review additions can be appended below after parent changes.

## Re-review disposition — corrections verified

Re-read the changed client and adapter and re-ran `node --test providers/marketstack/tests/*.test.mjs`: **28 passed, 0 failed** (23 adapter cases plus 5 runner cases). No external requests or paid credits. Re-ran the five independent fake-fetch probes with valid SPY report identity for the overlap case; updated evidence is retained in `review-c-final-synthetic.json`.

All four reported findings are resolved in the reviewed code:

1. Nonzero initial offset now returns `complete:false`, `scopeComplete:true`, `coverage:SUFFIX_ONLY`. Numeric string `'0'` returns `complete:true`, `ALL_PAGES`.
2. A child with missing pagination yields batch `{ok:false,complete:false}` and preserves its partial data/results and remaining work.
3. Exact holding rows repeated across different pages produce `holdingsRepeatedAcrossPages`, `complete:false`, classification PARTIAL. All four rows and raw weights are still retained; the synthetic sum remains 150 rather than being silently normalized/deleted.
4. Scoped exchange ticker records receive `providerExchange:'XETR'` plus derivation provenance; raw row and provider envelope remain separate. A contradictory provider envelope MIC is rejected.

Final pagination disposition: **APPROVED for the isolated observation-only draft scope**. Missing totals, changed totals, repeated pages, bounded page budgets, and explicit suffix retrieval cannot certify global completeness. Live provider/website parity and actual holdings completeness remain UNKNOWN without account responses. No assertion of provider support follows from these fake-fetch tests.
