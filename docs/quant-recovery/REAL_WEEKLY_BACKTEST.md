# Real weekly single-listing replay V1

This is an executable historical PRICE_RETURN simulation, NOT_CERTIFIED. It does not establish a market-wide advantage. Main base: b4e7ecfaa. PRs #862 and #872 were OPEN and were not merged. Only the standalone dependency window resolver from #872 is reused. The portfolio MockProvider is not used.

## Reproduce offline

From repository root, Node 22 and Python 3:

```
node scripts/quant/run-real-weekly-backtest.cjs --security ref_NVDA --period MAX --output /tmp/nvda.json
python3 scripts/quant/verify-real-weekly-backtest.py /tmp/nvda.json
node scripts/quant/run-real-weekly-backtest.cjs --security ref_NVDA --period MAX --output /tmp/nvda-second.json
cmp /tmp/nvda.json /tmp/nvda-second.json
node scripts/quant/diagnose-real-weekly-backtests.cjs > /tmp/listing-cases.json
node --test quant/tests/real-weekly-backtest.test.mjs
```

The full output contains source identity, immutable input hashes, all trades, entry/exit prices, fractional split-adjusted units, all weekly equity marks, exclusions, open position, costs, benchmark and result hash. Full quote/trade dumps remain outside Git. Compact measured summaries are adjacent to this document; runtime measurements vary by machine.

## Frozen execution contract

Unmodified NEW_52W_HIGH weekly close variant, version 1.0.0, from existing signal-backtest.js. 52 preceding weekly closes; transition into a new high; existing 53-week warm-up and existing 13-week cooldown, including reset on intervening trigger weeks. The rule is exploratory, previously inspected, and has not been optimized here.

The execution ledger delegates event detection and completed 26-week outcomes to that existing engine. Orders execute at the observed close of the week AFTER a signal. Fixed exit is close 26 weekly observations after entry. One funded long position; all capital invested with fractional adjusted units; no leverage, tax or interest. A signal is skipped when a position exists at execution; an exit may be followed by a new entry on the same close if the signal was already known in the preceding week. Skipped events are recorded. This explicit portfolio convention differs from the existing overlapping event-study aggregate and cannot inherit its statistical conclusions.

Round-trip commission/spread assumption 20 bps and slippage assumption 10 bps, from Signal.FRICTIONS. Both are debited on gross exit proceeds at time exit, exactly matching existing Signal.outcome's 0.997 friction multiplier. They are scenario assumptions, not observed broker fills. Positions not reaching M6 remain OPEN, marked at last observed close, without invented exit or realized return. Unexecuted final-week signals have no order. No interpolation, price carry, unknown delisting payout, or current-universe substitution.

MAX begins with the first eligible signal observation, uses all preceding prices for warm-up, and ends with the final stored mark. History.latestEligibleBacktestDate is the final SIGNAL date allowing next-week execution; history.latestTradeDate is the final possible execution/mark date. Fixed 1Y/3Y/5Y/10Y windows use the shared resolver and retain full pre-window warm-up/cooldown history. They do not import positions established before the selected window. Source input is cut at the requested as-of before events or outcomes are calculated.

CAGR uses actual elapsed calendar days divided by 365.2425. Drawdown is peak-to-trough on the recorded weekly equity marks, including exit costs; intraday drawdown is unavailable.

Benchmark is same-listing buy-and-hold from the first common equity observation, gross of trading costs, with zero cash yield, on the identical split-adjusted PRICE_RETURN basis. It is explicitly not a market index. No verified MAX SPY price series is connected, so SPY is UNAVAILABLE. No Total Return claim is made for either side.

## Data and limitations

Adapter resolves securityId to exactly one source security-master row, then binds source listing key, securityId, ticker, provider, currency and listing start. Ticker-only lookup and ambiguous rows fail. The source canonical listing key is provider-derived, not a global immutable cross-vendor ID. The security master is a dated snapshot; its provider end_date is a last-data marker and is not treated as proof of delisting. Inactive listings fail until terminal-value evidence exists.

NVDA has 1,448 actual Tiingo-derived split-adjusted weekly closes, 1999-01-22..2026-10-16; eligible signals start 2000-01-28, possible entry 2000-02-04; first actual signal/entry are 2000-02-11/2000-02-18. All ISO weeks are contiguous; weekday-only dates, no duplicate week, positive finite prices and metadata boundaries are enforced. Calendar means observed ISO weekly bars (holiday-shortened weeks allowed). Intraday availability, historical provider revisions and independently verified session close times are not established. Prices are rounded published values. Six source split factors are retained and checked for valid form, not reapplied to adjusted prices. No raw bars are present to independently reverify each adjustment. Dividends and terminal corporate-action proceeds are absent. Historical adjustment vintage is ex post, not as-published PIT.

Independent Python checker reconstructs the rule/cooldown, funded trade sequence, every equity mark, costs, returns, annualization, drawdown, buy-and-hold alignment and unfinished position without importing the JS engines. Tests poison future prices, reject identity/gap/duplicate/mocked inputs, and check constant split-unit rescaling. Successful calculations cannot certify data provenance or predict returns.

## Integration boundary

The new adapter is actually used by this single-listing Signal Backtest / Same Stock Replay execution command. Existing product UI and published aggregate builders are unchanged. Pattern Evidence, Setup Backtest, Strategy Backtest and Factor Ranking do not call this adapter. Their population/PIT/factor/regime/Total-Return gates remain closed. This command is an explicit research execution path; production customer integration, licensing scope and full certification remain separate acceptance steps.

Next smallest release step: review this execution convention and data contract, add a full-range verified market benchmark adapter, then expose the accepted research result through an existing product service with its PRICE_RETURN and NOT_CERTIFIED labels. A daily OHLCV dependency is unnecessary for this weekly convention. Historical PIT universe/factor data remain necessary for cross-sectional portfolio/ranking claims; future observation is not a prerequisite to execute this simulation.

## Validation record

Baseline signal/certification tests: 26/26. Full Quant run: 2,800/2,801 passed, 417.9 seconds. The failing test is universe-list.test.mjs:105 (AAPL overview 347.725 vs stock page 347.73). It fails identically on an isolated unchanged Main b4e7ecfaa worktree (7/8 tests pass). This branch changes no corresponding product, price, UI or pipeline file. No test was waived. Final focused tests for the adapter, temporal/arithmetic replay and reused MAX resolver: 11/11. Full-suite output and baseline countercheck are retained outside Git in the scratch directory. Merge remains subject to all required checks and reviews.
