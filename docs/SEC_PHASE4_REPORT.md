# Phase 4 Report — SEC Financial Data Core V1

What was built, what works, what does not, and what it cost.

## 1. The premise had to be corrected first

The brief instructed: do not rebuild, integrate into the existing Phase 1–3 quant
architecture (provider abstraction, capability matrix, data provenance, PIT
gates, qualification tests, quant engine, backtest engine).

**None of that exists in this repository.** A full search for `provider`,
`capability`, `provenance`, `qualification`, `screener`, `point-in-time`,
`trustScore` and `quant` returns hits only in editorial content
(`academy/*.json`, `magazin/01/index.html`, `macro/data/*.json`,
`hedgefonds/data/hedgefonds.json`). No code, no interfaces, no tests.

What does exist is a static GitHub Pages site with product-scoped, decoupled data
pipelines (`dashboard/`, `macro/`, `academy/`, `hedgefonds/`, …), stdlib-only
Python under `scripts/`, generated JSON under `<product>/data/`, one GitHub
Actions workflow per pipeline with a scope guard, and an `ARCHITECTURE.md` per
product. There is a fundamentals pipeline, but it is an FMP TTM snapshot with no
history, no point-in-time and no provenance — it cannot serve as a base.

So "do not build a parallel architecture" was honoured the only way it could be:
**this phase adopts the repository's conventions exactly**, and builds the missing
quant data layer once — as *the* layer, not a second one beside an existing one.
The audit is recorded in `docs/SEC_DATA_ARCHITECTURE.md` § 0.

## 2. The live-validation blocker

`data.sec.gov` and `www.sec.gov` are blocked by the development sandbox's egress
policy (HTTP 403 on CONNECT). This is an organisation policy on this environment,
not a SEC block. GitHub Actions runners are unaffected — `scripts/hedgefonds/
fetch_edgar_data.py` already fetches from `www.sec.gov` in this repo's workflows.

Consequence, stated plainly:

- Everything that does not require the network is built, tested and verified:
  **174 offline tests, all green**, plus a full end-to-end run of every CLI
  command against stubbed SEC payloads.
- Everything that requires live SEC data — the coverage matrix, the per-company
  gate results, the historical reach measurement — is **not measured**. The
  artifacts ship with `status: "not_generated"`, matching the convention of
  `dashboard/data/*.json`. Running the "Update SEC fundamentals" workflow
  produces them.

No coverage number, no gate result and no company figure in this repository is
invented to fill that gap.

## 3. Answers to the closing questions

**1. Is SECProvider implemented production-near?**
Yes, with one caveat. `scripts/quant/sec/provider.py` is the single SEC access
point: ticker→CIK, submissions (with older filing pages merged in — without that,
pre-2015 filing history is silently invisible), company facts, company concept,
filing metadata with acceptance timestamps, raw fact iteration, and bulk
`companyfacts.zip` import. Fair access lives in `http_client.py`: declaring
User-Agent (refuses to construct without a contact address), 5 req/s token bucket
(SEC allows ~10), retry with exponential backoff + jitter on retryable statuses
only, bounded retries, request de-duplication, gzipped disk cache with TTL,
structured logging. Caveat: it has never executed against the live SEC (§2).

**2. Which five companies were actually tested?**
None against live SEC data. The universe is configured
(`quant/config/sec_universe.json`: NVDA, AAPL, MSFT, JPM, XOM, with CIK hints the
pipeline verifies against the SEC ticker map and aborts on mismatch). Validation
instead ran against synthetic issuers built to reproduce the structural cases
those five represent: calendar-year, June year-end, 52/53-week September
year-end, and a SIC 6021 bank. Every fixture is labelled synthetic and no fixture
claims to be a real company's real financials.

**3. Which fundamentals work reliably?**
On the tested structures: revenue, cost of revenue, operating income, pretax
income, tax expense, net income, EPS basic/diluted, operating cash flow, capex,
cash, total assets, total liabilities, stockholders' equity, long/short-term
debt, shares outstanding, weighted average shares, R&D, SG&A, interest expense,
dividends, stock-based compensation — 27 canonical metrics, annual and quarterly,
including reconstruction of quarters a company never reports standalone.

**4. Which work with limitations?**
`gross_profit` (usually reconstructed from revenue − cost of revenue, since many
filers omit the line); `shares_outstanding` from `dei` is a **cover-date**
instant, not a balance-sheet-date one, and is flagged `COVER_DATE_INSTANT`;
`total_debt` is usually reconstructed from components; ROIC needs six inputs and
is refused whenever the effective tax rate falls outside [0,1]; everything
financial-sector-specific per § 15 of the brief.

**5. How far back does usable history reach?**
**Not measured — see `docs/SEC_COVERAGE_REPORT.md`.** The measurement machinery
is built and tested; the network is not available here. Do not quote a start year
until the workflow has run.

**6. Does point-in-time work?**
Yes, and it is the most heavily tested part of the system. Semantics and worked
examples in `docs/SEC_PIT_METHODOLOGY.md`. Enforced at four independent layers:
resolution requires an `as_of`; the quality engine flags impossible filings; two
gates re-check stored data and a constructed leak scenario; and the test suite
includes a day-by-day loop asserting invisibility across every day between a
period's end and its filing date.

**7. How are restatements handled?**
Each `(metric, fiscal_year, fiscal_period)` cell is a timeline of observations,
never overwritten. Default policy `as_of_latest` returns the most recent value
*published by* `as_of` — so a 2020 restatement is invisible to a 2019 backtest and
applies from its own publication date, flagged `RESTATED`. Policy `original`
returns the as-first-reported value (still PIT-filtered). Policy `latest_known`
ignores `as_of` and is reachable only from reporting paths, never the backtester.
Same-instant conflicts: amendment wins, flagged `CONFLICTING_FACTS`, quality
downgraded to MEDIUM, nothing averaged.

**8. Which gates pass?**
`MOCK_FUTURE_DATA_LEAK`, `MOCK_RESTATEMENT`, `PIT_NO_FUTURE_DATA_LEAK`,
`PROVENANCE_COMPLETE`, `PERIOD_INTEGRITY`, `UNIT_INTEGRITY`,
`NO_INVENTED_VALUES`, `DERIVED_SEPARATION` — all PASS on normalized data.
`MARKET_DATA_AVAILABLE` is `NOT_APPLICABLE` (SEC publishes no prices).

**9. Which gates fail?**
`MOCK_DELISTED` — **FAIL**. Delisted issuers are retrievable by CIK but the SEC's
ticker map lists only current registrants, so a delisted ticker cannot be
resolved and a survivorship-free universe cannot be built from SEC alone.
`SURVIVORSHIP_FREE_UNIVERSE` — **FAIL**. No security master, no delisting feed.
Neither was given a PASS it did not earn. On live data the same gates run
per company and can produce further findings.

**10. What is still missing for professional backtests?**
Prices (OHLCV), a point-in-time universe / index constituent history, corporate
action and split history, analyst estimates, and a delisting event feed.
Fundamentals are timed correctly; membership is not.

**11. Can SEC replace EODHD / FMP for US fundamentals?**
**PARTIALLY.** For the fundamental *values* themselves, SEC is strictly better:
it is the primary source those vendors resell, it carries the filing dates a
vendor snapshot throws away, and it preserves restatement history — none of which
`dashboard/data/fundamental_metrics.json` has today. What SEC cannot replace is
the vendor's convenience layer: a security master, delisting history, corporate
actions, per-share normalisation across splits, and analyst data. For a
point-in-time fundamental backtest of currently listed US issuers, SEC is
sufficient and better. For a survivorship-free universe, it is not, and no amount
of engineering on the SEC side changes that.

**12. What is still needed from an external market-data provider?**
Daily/intraday OHLCV, split- and dividend-adjusted price series, corporate
actions, index membership history, and market capitalisation. Momentum and Value
factors are explicitly *not* computed from SEC data and are declared
`NOT_AVAILABLE_FROM_PROVIDER` rather than approximated.

**13. Rollout from 5 to 500 companies?**
No code change. Extend `quant/config/sec_universe.json` (or feed CIKs from the
SEC ticker map directly). ~2 requests per company for the incremental check, ~3
for a full ingest. At 5 req/s that is roughly 5 minutes of wall time for a full
pass and far less for an incremental one. Checkpointing already makes the run
resumable. Switch `JsonFactStore` to `compress=True` (already the default in the
pipeline) and keep only the compact inspector views committed.

**14. From 500 to 5,000?**
Two changes, both anticipated by the interfaces: (a) use
`SECProvider.iter_bulk_company_facts()` for the initial import — one
`companyfacts.zip` instead of 5,000 individual fetches, which is what SEC fair
access actually asks for — then keep the weekly incremental path per company;
(b) replace `JsonFactStore` with a DuckDB or Parquet implementation of the same
`FactStore` interface. Normalization, PIT resolution, derived metrics, factors and
the backtest bridge do not change, because none of them knows how storage works.

**15. Storage and compute?**
Measured on the synthetic end-to-end run: normalized factbook ≈ 55 KB gzipped per
company-decade; committed inspector view ≈ 380 KB per company. Extrapolated: raw
SEC payloads ≈ 10–40 MB per company uncompressed (gitignored, cached), so ~50–200
GB for 5,000 companies at full history — which is exactly why the bulk path and a
columnar store are the 5,000-company answer. Normalization is CPU-light and
embarrassingly parallel per company; the 174-test suite runs in ~6 seconds.
Committed artifacts stay under the CI budget of 2 MB per file and 10 MB total.

**16. Which real data quality problems were found?**
Four in the pipeline's own design, each caught by a test and fixed, each with a
regression test added:
(a) the fair-access token bucket could spin forever on a floating-point refill
landing a hair below one token — fixed with an epsilon;
(b) sector rules were applied only to a formula's *inputs*, so debt-to-equity was
being computed for a bank from its available components — fixed by applying the
rule to the formula's *output* metric too;
(c) a fact whose `filed` value is not a date has no point-in-time anchor and was
passing through — the provider now validates it and drops it for the quality
engine to report;
(d) **the most consequential one**: the retrieval timestamp was wall-clock, so it
entered the raw-payload content hash and the per-observation provenance. An
unchanged SEC payload therefore looked new on every run — the immutable raw
archive would have grown a fresh snapshot weekly forever, and no factbook diff
would ever have been meaningful. Retrieval time is now taken from when the
payload was *first* seen in the archive, so re-normalizing unchanged SEC data is
byte-identical. Found only because an idempotency test failed intermittently
(1 run in ~6); it would have been invisible in a single green run.
Structural problems the design anticipates and the engine flags — the `fy`/`fp`
filing-vs-fact trap, year-to-date double counting, cover-date share counts,
concept disagreement within one filing — are covered by tests but have not yet
been *observed* on live SEC data, because that data has not been fetched.

**17. What changed in the existing repository?**
`.gitignore` only. Nothing else that existed before this phase was modified — not
`scripts/dashboard/`, not `dashboard/data/`, not `scripts/hedgefonds/`, not any
existing workflow, not any existing page. CI enforces the `scripts/dashboard/`
half of that. Everything else is new: `scripts/quant/`, `quant/`, `docs/SEC_*.md`,
and two workflows.

**18. How many tests run?**
174 new offline tests (`python3 scripts/quant/cli.py test`), plus the
pre-existing suites.

**19. Are all pre-existing tests still green?**
Yes. `academy/engines/financial-model-engine.test.mjs`: 8/8 pass. The
`hedgefonds-dashboard-ci.yml` inline logic tests pass. All 25 HTML pages parse,
all 28 JSON files are valid, all Python under `scripts/` compiles.

**20. Exact recommended next step?**
Run the **"Update SEC fundamentals"** workflow via `workflow_dispatch` on this
branch. That is the first live SEC contact and the only thing that can produce
the coverage matrix, the per-company gate results and the historical-reach answer.
Then read `quant/data/coverage_matrix.json` and decide the backtester's start year
from measured data. Everything else — a second provider, more metrics, a wider
universe — should wait until that number exists.

## 4. Deliverables

| Path | What |
| --- | --- |
| `scripts/quant/sec/` | 16 modules: provider, fair-access HTTP, model, fiscal calendar, registry, normalization, periods/TTM, restatements/PIT, quality, derived, factors, store, pipeline, coverage, gates, backtest bridge |
| `scripts/quant/cli.py` | `ingest · update · retry · export · coverage · gates · snapshot · inspect · test` |
| `scripts/quant/tests/` | 174 offline tests + labelled synthetic fixtures |
| `quant/config/` | Metric registry, validation universe |
| `quant/data-inspector/` | Internal validation UI (`noindex`) |
| `docs/SEC_*.md` | Architecture + audit, normalization, PIT methodology, coverage report, this report |
| `.github/workflows/sec-fundamentals-ci.yml` | Offline tests, config validation, company-agnosticism guard, data hygiene, secret guard |
| `.github/workflows/update-sec-fundamentals.yml` | Live SEC ingest with scope guard, weekly + manual |

## 5. What this phase deliberately did not do

No realtime, no intraday, no Elliott waves, no analyst estimates, no news, no
portfolio AI, no mobile app, no new frontend design, no new backtester, no data
warehouse, no European fundamentals. The existing backtest engine was imported,
not replaced, and a regression test asserts the bridge reproduces its output
exactly when the fundamental filter is disabled.
