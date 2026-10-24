# Backtest V3: validated mechanics and private Quant reader

## Scope and release decision

This branch extends **`quant/api/product-services.js`**, the existing Quant artifact read service. It creates no second HTTP API, UI route, production scheduler or deployment. The default service cannot read the private results. `getBacktest()` and all existing certification gates remain unchanged.

The V2 **execution mechanics** are `VALIDATED_EXECUTION_MODEL`; this is neither strategy certification nor approval of a positive signal effect. All historical results remain **PRICE_RETURN / NOT_CERTIFIED**. No result is live executable proof. No PIT, membership, regime or independent efficacy gate is relaxed.

Main at baseline: `741dea5a4`. #862, #872, #882 and #894 were all OPEN and unmerged. This isolated branch cherry-picks #882 and #894 prerequisites; it does not modify, merge or enable auto-merge on those PRs. Parallel UI work #873/#892, shell work #893, Fundamental #869 and Supertrader #878–#881 remain separate. In particular #892 already addresses the browser head-name issue.

## Execution model acceptance

Normative mechanics contract: `scripts/quant/contracts/weekly-execution-model-v2.json`.

- Existing NEW_52W_HIGH rule and parameters are unchanged. At index i >= 53, close[i] strictly exceeds closes[i-52..i-1], and the preceding week did not exceed its preceding 52 observations. Existing 13-week event cooldown remains owned by `signal-backtest.js`.
- Events are known after the weekly close. The order is valued at the **next observed week's close**, an ex-post observed **model price, not a guaranteed live closing fill**. No daily OHLCV requirement is introduced.
- Single funded position. Events whose scheduled execution finds a position still open are excluded, not queued. Scheduled exits happen before an already pending next-close entry; an exit and new entry can therefore share a close without using that close to create the new signal.
- Exit at entry index + 26 observed weeks. The adapter requires continuous observed ISO weeks. Unfinished positions are marked at the final observation; no fictitious exit, exit charge or complete M6 outcome is added.
- USD 100,000, fractional split-adjusted units, full cash reinvestment, zero interest and no intermediate cent rounding. These are model assumptions.
- Per side: fee 10 bps and slippage 5 bps on **that side's gross notional**. Purchase notional = cash / 1.0015. Sale proceeds = gross proceeds * 0.9985. Entry charges are paid immediately, including for positions still open. Charges are already in equity and are not subtracted twice.
- Passive own-stock and SPY benchmarks are explicitly **gross, zero-cost** PRICE_RETURN comparisons. Their transaction cost assumption differs from the strategy's. No net execution equivalence or Total Return comparison is claimed.
- Weekly drawdown excludes intraday extremes. Ex-post split adjustments, rounded published prices, missing dividends and historical selection constraints remain limitations.

Independent verification uses a separate Python cash-transaction loop, checks every equity date/value, trades, charges, open position and exact SPY marks. It imports no JavaScript calculation code. All five NVDA periods are checked. MAX retains the prior V2 financial result: 21 closed trades, one open, end USD 4,926,635.787429842, CAGR 15.70503572%, weekly drawdown -80.21817392%. This underperforms NVDA buy-and-hold CAGR 34.50281811%; no positive rule efficacy claim follows.

### Repairs found during V3 review

1. The valuation-window repair also explicitly preserves the original signal/next-week warm-up gate: an As-of cut with only 54 observations is rejected; 55 permits the first potential execution.
2. Shorter requested windows had been anchored to the last eligible **signal** date (one observation before the final mark). They now anchor to the final **valuation** date. Signal eligibility still reserves next-week execution. The final window date agrees with actual equity end; MAX numerical results are unchanged. Source/code hashes deliberately change.
3. Invalid calendar/future source publication dates now fail the real adapter before execution.
4. Canonical product identity is frozen with the result and compared again by the reader. BGC's current primary listing is not the historical terminal listing. Their identities are kept separate and no performance is delivered.
5. Three identity-blocked series had a single candidate master row but unresolved identity binding. Quality now explicitly reports `UNRESOLVED_IDENTITY`, not a successful binding.
6. The internal model contract lives outside the published methodology catalog. The full regression caught this boundary; no catalog/UI alteration or test exception was introduced.
7. Trade details contain raw entry/exit prices and require raw display permission in addition to the derived permission needed by summaries.

## Quality contract

Executable contract: `quant/api/real-backtest-contract.js`; producer: `quant/engines/real-backtest-quality.cjs`.

`real-backtest-quality-1.0.0` separates:

| Dimension | Meaning |
|---|---|
| technicallyExecutable | A deterministic ledger can be calculated from admitted stored inputs |
| class A | No classified usage limitation; **no current listing qualifies** |
| class B | Technically executable, with material stated limitations |
| class C | Required precondition fails; no valid performance delivered |
| state | AVAILABLE_LIMITED or BLOCKED |
| benchmarkStatus | AVAILABLE, BENCHMARK_UNAVAILABLE or NOT_EVALUATED |
| certification | Always NOT_CERTIFIED |

Thus **4,445 technically executable** and **4,445 class B** are the **same** rows; these numbers must not be added. There are 0 class A and 1,729 class C among 6,174 source listings. MAX has 3,609 complete SPY comparisons and 836 unavailable comparisons. Benchmark absence does not block a strategy calculation.

Blocks: warm-up 431, weekly gaps 218, corporate actions 598, instrument class 295, identity 183, terminal listing value 4. MAX eligible starts reach 1991-01-11 and final marks 2026-10-23 across admitted rows; each listing has its own period. Source histories reach 1990-01-05. 42,748 closed trades are descriptive totals, not independent observations or a historical portfolio universe.

Each quality row contains source Security-ID, candidate Listing-ID, provider/currency/class, observed range/as-of, MAX eligibility/warm-up, corporate-action state, exclusions, limitations, benchmark and certification dimensions, input bytes/master versions and computation timestamp. `computedAt` is the frozen batch snapshot timestamp, not a claim of a provider publication vintage. Canonical `vu_*` product IDs and `ref_*` source IDs are kept in separate fields.

The complete quality dump is **private** `GENERATION/quality.jsonl.gz`. Its hash/count and compact test results are recorded beside this document. No raw full-universe result files are committed or added to the public release tree.

## Private materialization and delivery

Producer: `scripts/quant/materialize-real-backtest-read.cjs`.

Storage: existing local/static-artifact formats, **outside the repository/public deployment**. No new infrastructure. Layout:

```
release.json                         # tiny atomic pointer, no default public URL
GENERATION/snapshot.json             # source/master/benchmark/model/code fingerprints
GENERATION/index/XX.json             # small source-ID -> summary hash shards
GENERATION/listings/ref_ID/summary.json
GENERATION/listings/ref_ID/MAX-equity.json.gz
GENERATION/listings/ref_ID/MAX-trades.json.gz
... same for 1Y, 3Y, 5Y, 10Y
GENERATION/quality.jsonl.gz
GENERATION/materialization-report.json
```

Materialization computes each admitted listing's five periods, compresses separate equity/trade details, validates summaries, then atomically switches `release.json` **only after a complete snapshot**. Input hashes include all stored source files, benchmark evidence, security master, product identity shards, mechanics and calculation code. Identical snapshots resume; corrupt saved summaries/details fail. Changed inputs select a new generation. A writer lock prevents concurrent builders from replacing the same pointer; a verified dead-process lock can resume. Current implementation conservatively rebuilds a generation after any dependency changes; unchanged-row reuse across different generations is not claimed. An interrupted build leaves an existing completed pointer unchanged.

Reader method:

```
getRealBacktest('NVDA', { period: 'MAX', section: 'summary' })
// section: summary | quality | equity | trades
```

- Uses the existing canonical instrument directory and display policy before delivering data.
- Requires explicit `realBacktestPreview: {enabled: true, audience: 'INTERNAL_REVIEW'}` **and** an injected `realBacktestStore`. Ordinary production `create()` has neither. No URL flag, environment credential, public feature configuration or deployed route enables this path.
- Browser preview bootstraps may explicitly inject `realBacktestContract`; it is not loaded by or wired to the production UI.
- Uses versioned summaries, exact identity mapping, immutable generation keys and SHA-256 chain from pointer shard to summary to details. Rejects invalid basis, model, certification, future as-of, missing sources and corrupt payloads.
- Reads a tiny release pointer each request. At most 32 summaries are cached per service instance, keyed by generation, shard hash and source identity. A replaced shard also invalidates metadata when calculation inputs are unchanged. Returned objects are cloned. A changed generation cannot reuse old summary entries. Failed reads can retry.
- Does not load equity/trades for summary requests. Maximum stored JSON 256 KiB; compressed detail 256 KiB and decompressed detail 2 MiB. Filesystem adapter validates paths, real paths, private root and file sizes; gzip expansion is bounded.
- No engine/provider import or computation in the read path. `BENCHMARK_UNAVAILABLE` remains separate from `AVAILABLE_LIMITED`. Blocked requests, including detail requests, never include a `result` object.

Internal wiring example (not an HTTP route or production bootstrap):

```js
const store = require('./server/quant-backtest-store.cjs').create({directory: PRIVATE_OUTPUT});
const service = require('./quant/api/product-services.js').create({
  loadJSON: existingLoadJSON, displayPolicy: existingPolicy, queryEngine: existingQuery,
  realBacktestPreview: {enabled: true, audience: 'INTERNAL_REVIEW'},
  realBacktestStore: store
});
const summary = await service.getRealBacktest('NVDA');
```

## Reproduction

Run from repository root; use a new private directory for each desired retained generation:

```sh
node scripts/quant/materialize-real-backtest-read.cjs --output /tmp/vu-backtest-private --max-new 200
node scripts/quant/materialize-real-backtest-read.cjs --output /tmp/vu-backtest-private
node scripts/quant/validate-real-backtest-read.cjs /tmp/vu-backtest-private
node --test quant/tests/real-backtest-read.test.mjs quant/tests/real-weekly-backtest.test.mjs quant/tests/weekly-benchmark-batch.test.mjs quant/tests/backtest-history.test.mjs
node --test 'quant/tests/*.test.mjs'
```

For a smaller real-data pilot add `--ids ref_NVDA,ref_AAPL,ref_XOM,ref_ARM,ref_BGC,ref_AAAC,ref_AACT,ref_MSFT` on **both** materialization invocations. Validation writes independently verified raw NVDA outputs and `read-validation.json` to the same private directory. Public UI remains disabled throughout.

## Edge cases and remaining product gates

- NVDA: complete real MAX ledger and aligned SPY; still class B, PRICE_RETURN, NOT_CERTIFIED.
- AAPL: existing corporate-action evidence hold retained; no performance.
- XOM: executable price-only history; dividends absent and full MAX SPY unavailable before verified coverage. No MAX shortening.
- ARM: short eligible history; requested longer periods explicitly mark incomplete coverage.
- BGC: unknown historical terminal value plus ambiguous current/history product mapping; no substitution with today's listing.
- AAAC: insufficient warm-up; no performance.
- AACT: missing weeks; no interpolation.
- MSFT: real long-history replay, with a separate SPY availability dimension.

This service exposes **single-listing** replay semantics for Same Stock Replay and the existing technical Signal rule only. It does not turn funded ledger outputs into Pattern Evidence, prospective Setup outcomes, PIT portfolio Strategy or Factor Ranking results. Those membership/factor/PIT/regime gates remain closed.

## Next activation decision

Technical implementation is an internal integration candidate. Before any public activation, explicitly approve the versioned mechanics/cost assumptions and product wording, permitted delivery/licensing scope, the persisted artifact hosting boundary and freshness/rebuild policy. Review/merge the prerequisite changes and this Draft only through required CI/review, resolve priority identity/corporate-action holds or retain exclusions, then approve a **separate** bounded read-service/UI wiring change. This branch performs none of those activations. No future five-year wait is imposed on running historical simulations.

## Recorded acceptance evidence

- `v3-materialization.json`: final cold materialization, 6,174 listings, 22,225 period results, 84.78 s wall time and 373.99 MB peak process RSS on this worker. This measures five periods plus compression, not the older one-period batch; no like-for-like speedup is claimed.
- `v3-resume.json`: 6,174 records reused, zero recomputed, all saved summary/detail hashes validated, 16.64 s. No partial pointer was published.
- `v3-read-validation.json`: complete source classification, all summary hashes, real service edge cases, API payload sizes/timings and Python reconstruction of all five NVDA periods. Final generation is `e04334aab9978633f248cd62834c21b1f25737e71cfcd4c90c57806850d978df`.
- `v3-runtime-parity.json`: complete real NVDA objects are identical under Node v22.23.4 and v24.19.0. Final MAX result hash is `1c79044ec3e8985c58617fb96d2b03bff21daf46d3fcdd261563bdf032c72770`.
- `v3-browser-baseline.json`: unchanged Main and branch both produce the same two head-name findings at 1440/390 px. Both have 96 successful checks, all eight resource budgets pass; 84 accessibility pages have zero violations. The browser gate is **not green**. Separate #892 owns the UI finding. No failing assertion was removed.
- Exact Core CI test command: 260/260 pass; shell/navigation/resource-budget tests: 23/23 pass. Production-isolation check on the new integration suite passes. JSON/syntax checks and `git diff --check` pass.

Private full output on the implementation worker: `/workspace/scratch/backtest-v3/v3-release/`. The full quality dump is under its generation directory; full NVDA reconstruction is `nvda-MAX.json`. These files are intentionally absent from the public build and Git diff.

### Payload and operational limits measured

All 6,174 summaries were checked; largest stored summary is 25,337 bytes. All 44,450 compressed detail artifacts are within delivery bounds: maximum raw detail 210,698 bytes, maximum gzip 48,512 bytes. Combined details are 886.06 MB raw / 200.58 MB gzip. NVDA's selected MAX service summary is 9,380 bytes; the report records cold and cached reads as local observations, not production latency guarantees. A full index or universe payload is not loaded for one stock.

Data freshness is explicit in each result (`asOf`, frozen calculation timestamp, source bytes/master hashes). Rebuilding changed source/code snapshots creates a new generation; no automatic refresh task or incremental data pipeline is installed. Runtime and cache measurements are specific to this worker and workload.

Final Node 22 acceptance: **2,833/2,833 full Quant tests pass**, plus 40/40 focused tests (including the published methodology boundary). Exact counts, durations and unrun checks: `V3_TEST_RESULTS.json`. The full real reader scan checks all 6,174 stocks: 4,445 AVAILABLE_LIMITED, 1,729 BLOCKED, **zero financial payloads on blocked responses**. Timings in the read report are local summary-cache miss/hit measurements with warmed filesystem/directory caches, not cold-process or network SLAs. Separate full Shell/direct-link browser journeys (Chromium/WebKit) were not run locally; the affected Chromium QA remains red on the documented baseline findings.
