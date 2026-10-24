# Real weekly backtest: validation, benchmarks and stored-listing batch

Historical V2 checkpoint from PR #894. V3 source validation, window semantics, current hashes and private reader acceptance are documented in [BACKTEST_V3.md](BACKTEST_V3.md); the older validation JSON files preserve their original run evidence.

Source Main: `1e14b5db7` (24 October 2026). PRs #862/#872/#882 were OPEN, not merged. This branch selectively inherits #882 commit f3233d46f; it does not merge or modify those PRs. Navigation, UI, Discover, Supertrader, Fundamental and refresh workflows are unchanged. No provider request or paid operation was performed.

## Reproduce

Node 22 and Python 3, repository root. Outputs deliberately remain outside Git:

```
node scripts/quant/run-real-weekly-backtest.cjs --security ref_NVDA --period MAX --output /tmp/nvda.json
python3 scripts/quant/verify-real-weekly-backtest.py /tmp/nvda.json
node scripts/quant/run-real-weekly-backtest.cjs --security ref_NVDA --period MAX --output /tmp/nvda-second.json
cmp /tmp/nvda.json /tmp/nvda-second.json
node scripts/quant/run-real-weekly-backtest.cjs --cost-model LEGACY_EXIT_NOTIONAL --output /tmp/legacy.json
python3 scripts/quant/verify-real-weekly-backtest.py /tmp/legacy.json
node scripts/quant/batch-real-weekly-backtests.cjs --output /tmp/weekly-pilot --limit 25
node scripts/quant/batch-real-weekly-backtests.cjs --output /tmp/weekly-all --max-new 200
node scripts/quant/batch-real-weekly-backtests.cjs --output /tmp/weekly-all
node scripts/quant/batch-real-weekly-backtests.cjs --output /tmp/weekly-all
node --test quant/tests/real-weekly-backtest.test.mjs quant/tests/backtest-history.test.mjs quant/tests/weekly-benchmark-batch.test.mjs
```

Pin the repository commit and data bytes to reproduce exact hashes. The snapshot manifest binds every selected source file, security master, benchmark inputs, executable code and parameters. Resume refuses changed inputs and corrupt records. Interrupted row writes use atomic rename; unfinished temporary files are not successful checkpoints. Result rows are deterministic and sorted. Timing/RSS reports are separate from deterministic summaries. The runner uses one worker, retains only one full listing result at a time, and shares the indexed security master and prepared SPY observations. No parallel population, historical membership or synthetic data is inferred.

## Signal and execution

NEW_52W_HIGH weekly close variant 1.0.0 is unchanged: close at t exceeds the 52 preceding closes, while the previous close did not exceed its preceding 52 closes. Current close is not included in the comparison maximum. The existing 53-observation warm-up and 13-week cooldown/reset are retained, including trigger weeks while the cooldown is active. Detection and gross outcomes delegate to the existing signal engine. The execution ledger funds one position, starts with 100,000 units of the listing currency, reinvests realized capital, earns zero on cash and executes at the observed close of the following week. Exit is 26 observed weeks after entry. Overlapping orders are skipped if a position exists at execution; same-close exit/re-entry uses a signal already known in the preceding week. Fixed 1Y/3Y/5Y/10Y windows retain pre-window feature/cooldown history but do not import earlier positions. MAX is all eligible stored history, not a fixed year limit.

Open positions remain marked at the last observed weekly close without invented exit, completed M6 outcome or future sale costs. Final signals lacking a following close are excluded. CAGR uses elapsed calendar days /365.2425; drawdown is weekly marked equity, including paid costs, not an intraday estimate. Fractional split-adjusted units are arithmetic holding units, not original historical share counts.

## Versioned cost correction

V1's documented model charged 20bps fees plus 10bps slippage on the whole gross exit notional, deferred until exit. It did not debit purchase costs and therefore omitted paid entry costs from an open position. `LEGACY_EXIT_NOTIONAL` preserves that model exactly: NVDA end capital 4,933,558.796274043 and 21 completed trades.

V2 defaults to `PER_SIDE_NOTIONAL`: 10bps fees and 5bps slippage on purchase notional, plus the same rates on sale notional. Purchase notional = available cash /1.0015, preventing leverage; sale cash = gross proceeds *0.9985. Entry costs of open positions are already included in equity and cost totals. No charge is counted twice. The closed-trade friction factor is 0.9985/1.0015; prices, signal parameters and holding periods did not change. Both conventions are explicitly model assumptions, not historical broker fills. Separate independent Python cash transactions verify both. This change is execution correctness, not a parameter search or new rule.

## NVDA and SPY

NVDA source listing `tiingo:NASDAQ:NVDA:1999-01-22`: 1,448 split-adjusted weekly closes, 1999-01-22..2026-10-16. Eligible signal start 2000-01-28, first possible trade 2000-02-04, first actual signal/entry 2000-02-11/2000-02-18. Final signal allowing next-week execution 2026-10-09; last mark/trade date 2026-10-16. Latest signal with complete M6 would be 2026-04-10; the May 2026 position remains open. 21 completed trades, one open position, 1,395 equity marks. V2 end capital 4,926,635.787429842; CAGR 15.7050%, weekly drawdown -80.2182%; paid fees 36,559.165326245806 and slippage 18,279.582663122903 USD. Two complete outputs are byte-identical.

SPY is actually available here from 1995-01-03, not 1993, through 2026-10-23: `quant/data/market/multi-asset/series/SPY.json`, Tiingo equity, 8,006 daily observations. The published instrument catalog binds `vu_1c32c969ced1ff`, SPDR S&P 500 ETF, USD, PRICE and ETF_PRICE_RETURN_SPLIT_ADJUSTED. The existing ingest-multi-asset publisher uses Tiingo.splitAdjustedCloses and expressly excludes distributions. Overlap with the separate published Discover series is checked (270 dates, rounding tolerance 0.005000001 USD); this is a same-provider consistency check, not independent vendor confirmation. Historical adjustment vintages and standalone commercial downstream licensing are not established by these metadata.

The primary benchmark uses exact same-date observed SPY daily closes for every strategy weekly mark, without interpolation, nearest-date substitution or MAX shortening. NVDA comparison 2000-01-28..2026-10-16 covers all 1,395 marks. Gross SPY buy-and-hold end capital 561,729.5308187673 USD, CAGR 6.6731%, weekly sampled drawdown -55.9138%. Strategy excess CAGR 9.0320 percentage points; excess end capital 4,364,906.256611075 USD. Same-listing NVDA buy-and-hold end capital 274,948,638.93168974 USD, CAGR 34.5028%, drawdown -88.3092%; the strategy underperforms it. Passive benchmarks assume zero transaction costs, disclosed separately from net strategy costs. All three are PRICE_RETURN; no TOTAL_RETURN comparison is emitted. Warm-up precedes the common valuation window; benchmarks start at its first mark, not NVDA's IPO or the first actual strategy order.

A missing source/date, identity/basis error or currency mismatch yields BENCHMARK_UNAVAILABLE independently of strategy execution. SPY has only the stored 1995+ history; older listing windows can remain executable while their full MAX market comparison is unavailable. No implicit shorter comparison is used.

## Data gates and universe interpretation

Stable source listing identity must resolve uniquely from securityId, provider, currency and listing start; duplicated source canonical identities cannot join across securities. Inactive listings require terminal value evidence and are blocked. Current equity eligibility and common-stock classification are required; preferreds, warrants, ETFs and other instruments cannot enter the stock batch through their price histories. Source canonical keys are provider-derived, not globally immutable IDs.

Weekly dates, finite positive values, strict order, one point per ISO week, contiguous weeks and metadata boundaries are checked. The existing corporate-action-evidence engine now resolves every split-sized weekly move using its unchanged thresholds. Unresolved or inconsistent evidence blocks execution. In particular AAPL has a retained SINGLE_DAY_DOMINATES_WEEK hold on 2000-09-29; the prior permissive adapter did not enforce this existing evidence gate. The hold is not waived on an economic explanation alone. NVDA's source evidence resolves its split-sized move; its split factors are retained and are not applied a second time.

All successful results remain EXECUTABLE_WITH_LIMITATIONS: ex-post adjustments, rounded published prices, absent distributions, no independent raw-bar reconstruction or historical provider vintage, and no complete historical listing universe. An observed weekly date is not independent proof of the precise historical session close. No today's-universe reconstruction is substituted for PIT membership. The stored sample excludes unavailable delistings and contains related issuers/listings and overlapping windows. Single-stock replays, overlapping event studies, historical-universe strategies and membership portfolio backtests are different claims.

## Actual complete batch

6,174 stored series inspected; 4,445 executed with limitations and 1,729 blocked: 431 warm-up, 218 gaps, 598 corporate-action evidence, 295 instrument class, 183 identity and 4 unresolved terminal value. Of executable runs, 3,609 have exact-date SPY comparisons and 836 have missing benchmark dates; those 836 strategy runs remain available. Source reach 1990-01-05..2026-10-23, earliest eligible mark 1991-01-11. 42,748 completed trades in total. 462 runs never opened a position and are explicitly excluded from invested-run performance distributions. The 3,983 invested runs have median CAGR 0.9315%, p10 -12.4361%, p90 9.4393%; median weekly drawdown -57.2330%. These are descriptive, dependent and differently covered observations, not inference about a market-wide premium. Large outliers remain reviewable price-simulation outputs, not certified returns.

Pilot 25, then 500, then the entire local snapshot were executed. The full run checkpointed after 200 records and resumed the remaining 5,974 in 20.71s, peak process RSS about 235.7 MB. First checkpoint stage 0.96s. A second complete resume reused all 6,174 records in 0.50s with an identical summary hash. These are observed machine timings, not guaranteed service latency. Twenty evenly spaced sorted executable listings were individually re-executed and independently reconstructed in Python, including their benchmark whenever available. No significance is claimed for that validation sample.

## Integration and next release step

V2 is an additive offline result contract, with source/code hashes, cost-model ID, separate self/market benchmarks, scalar metrics, trade list, open position, equity and typed exclusions. Batch rows retain compact metrics and hashes; full trade/equity files can be reproduced by security ID. Full batch rows, manifests and logs remain outside Git; compact summaries and validation evidence are committed.

The actual consumers are the real single-listing Signal Backtest / Same Stock Replay command and the new research batch. No UI is activated. Pattern Evidence, Setup, Strategy and Factor Ranking builders do not silently adopt this funded execution model. Their PIT population/factor, regime, outcome and certification requirements remain. Neither the SPY comparison nor 6,174 executions changes CERTIFIED or proves an independently confirmed positive effect. Independent holdout selection after earlier exploratory inspection is still required for that claim.

Smallest next step: review and approve this versioned execution/cost/benchmark contract, independently resolve prioritized corporate-action and identity holds, then connect the bounded result schema to an existing Quant read service with PRICE_RETURN / NOT_CERTIFIED disclosures and licensing scope. No five-year future wait is required for these historical executions; portfolio/universe certification requires the missing historical membership and PIT evidence rather than this batch alone.

## Validation and measured optimization

Current Main baseline: 19/19 real-weekly/history/universe-list tests passed; the prior AAPL price-rounding failure is already fixed in Main. Complete Quant suite: 2,812/2,812 passed in 449.94 seconds. Final focused tests: 17/17. JSON parsing, source syntax and diff whitespace checks pass. Independent Python validates NVDA under both cost conventions and a 20-listing batch sample. Checkpoint corruption, changed snapshot, future poisoning, identity, instrument class, missing dates, price/TR mismatch, corporate-action holds, open-position costs and legacy reference preservation are tested. Remote CI and review remain required; no automatic merge or certification is enabled.

The measured loader optimization can be repeated with `node scripts/quant/measure-weekly-loader.cjs`. It compares repeated master parsing against the same adapter sharing one master index across 25 real stored listings and asserts identical data/error fingerprints. Timings are stored in loader-performance.json. This is a loader comparison on one machine, not a performance claim for trading strategies. Batch performance records separately capture the actual 25/500/6,174-listing runs and a complete cached resume.
