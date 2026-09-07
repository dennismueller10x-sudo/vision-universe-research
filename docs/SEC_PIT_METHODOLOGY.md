# Point-in-Time Methodology

The one rule that everything else serves:

> **A fundamental value must never be visible in a backtest before the moment it
> was actually published.**

This document states the exact semantics, because "point-in-time" is a phrase
that hides a dozen decisions.

## 1. Availability

Every observation carries two timestamps:

| Field | Source | Meaning |
| --- | --- | --- |
| `filed` | `companyfacts` `filed` | The date the SEC recorded the filing (date granularity) |
| `available_from` | submissions `acceptanceDateTime`, else `filed` | The moment the filing became publicly visible |

`acceptanceDateTime` is the only field that gives minute precision. The pipeline
joins it in per accession from the submissions endpoint. Where the SEC does not
supply it, `available_from` falls back to the filing date, and resolution is one
day coarser — never one day earlier.

## 2. Visibility rule

A fact is visible at `as_of` if `available_from <= as_of`, where:

- **`as_of` as a date** is interpreted as end of that day. A filing dated
  2018-05-05 is usable on 2018-05-05 and on no earlier day.
- **`as_of` as a datetime** compares instant to instant, which only produces a
  different answer when `acceptanceDateTime` is known. A filing accepted at
  16:31 UTC is invisible to an `as_of` of 14:00 that same day.
- **`lag_days=N`** shifts visibility later by N days and never earlier. Use it
  for strategies that need a settlement or ingestion buffer.

Worked example, the one from the phase brief:

```
Quarter ends            2018-03-31
10-Q filed              2018-05-05
as_of 2018-03-31   ->   not visible
as_of 2018-05-04   ->   not visible
as_of 2018-05-05   ->   visible
as_of 2019-01-01   ->   visible
```

`test_restatements.py::FutureDataLeakTests` asserts every one of these,
including a loop over **every single day** between the period end and the filing
date, each of which must return nothing.

## 3. Restatements

A `(metric, fiscal_year, fiscal_period)` cell is not a number. It is a
**timeline** of observations: the value as first reported, plus every later
value the company reported for that same period (comparatives in later filings,
10-K/A and 10-Q/A amendments, restatements). Nothing is ever overwritten.

Three resolution policies:

| Policy | Semantics | Use |
| --- | --- | --- |
| `as_of_latest` (**default**) | The most recently published value that was available at `as_of` | Backtests. Answers "what did the market know on this date?" |
| `original` | The value as **first reported** for that period, and only if that first report was itself available at `as_of` | As-originally-reported research; restatement diagnostics |
| `latest_known` | Ignores `as_of` entirely | Current-state reporting and the data inspector only. Raises if requested without meaning it — it is never reachable from the backtest path |

The chosen semantics, spelled out on the brief's own example:

```
FY2018 originally reported  1000, filed 2019-02-15
FY2018 restated             1200, filed 2020-08-10 (10-K/A)

as_of 2019-06-30, as_of_latest  ->  1000        (a 2019 backtest cannot see 2020)
as_of 2020-08-09, as_of_latest  ->  1000
as_of 2020-08-10, as_of_latest  ->  1200 + flag RESTATED
as_of 2021-01-01, original      ->  1000
as_of 2019-01-01, original      ->  nothing     (not yet published at all)
```

So a restatement enters the record on its own publication date and not one day
earlier, and the pre-restatement history a 2019 strategy saw stays reproducible
forever. Which of the two a study should use is a methodology choice, made
explicit by the policy parameter rather than baked in.

**Ordering within one instant.** If two filings became available at the same
instant with different values, the amendment wins, then the higher accession
number. The result is flagged `CONFLICTING_FACTS` and downgraded to quality
`MEDIUM`. Nothing is averaged.

**What counts as a restatement.** Values differing by less than 1e-9 relative are
the same number reported twice, not a restatement. A cell whose visible
observations differ is flagged `RESTATED`; a difference above 10 % also raises a
`RESTATEMENT_CONFLICT` quality finding for human review.

## 4. Derived values inherit the strictest availability

For any value computed from several observations — a de-accumulated quarter, a
TTM sum, a margin, a growth rate — `available_from` is the **latest**
`available_from` among the inputs. A TTM revenue figure is only known once its
fourth quarter has been filed. A margin is only known once both its numerator and
its denominator have been.

This is what makes the reconstruction in `periods.py` safe: because the inputs
are filtered by `as_of` before the arithmetic runs, a reconstructed Q4 cannot
appear before the 10-K that supplies the annual figure.

## 5. Enforcement

Four independent layers, so that a single mistake cannot produce a leak:

1. **Resolution.** `FactTimeline.resolve` is the only way to read a value, and it
   requires an `as_of` unless `latest_known` is explicitly requested.
2. **The quality engine** flags any raw fact whose period end is after its filing
   date (`FUTURE_DATA_LEAK`) — data the SEC itself could not have had.
3. **The gates.** `PIT_NO_FUTURE_DATA_LEAK` re-checks every stored observation:
   `available_from` must be on or after `period_end`. `MOCK_FUTURE_DATA_LEAK`
   constructs a known-leaky scenario and asserts the resolver hides it.
4. **The tests.** 174 offline tests, of which the whole of `FutureDataLeakTests`
   plus `PointInTimeDeaccumulationTests` exist for this single property.

## 6. Backtest integration

`backtest_bridge.py` evaluates the fundamental filter **at each candidate signal
date**, with that date as `as_of`. It does not compute one snapshot and apply it
across history.

A rule whose input is unavailable at that date does **not** pass. `UNKNOWN` is
never treated as `TRUE`. And a symbol whose fundamental history is too thin is
blocked outright with `INSUFFICIENT_FUNDAMENTAL_HISTORY` rather than producing a
precise-looking result on data that cannot support one.

## 7. Known limitations

Stated plainly, because a PIT system that overclaims is worse than one that does
not exist.

- **Dissemination lag.** `acceptanceDateTime` is when the SEC accepted the
  filing, which is minutes ahead of when it reaches a typical consumer. For
  daily-frequency strategies this is immaterial; for intraday it is not. Use
  `lag_days` if that matters to you.
- **Where acceptance time is absent**, resolution is date-granular. A same-day
  intraday backtest against such a filing is not supported and should use
  `lag_days=1`.
- **Pre-XBRL history has no point-in-time facts at all.** Structured facts start
  with XBRL adoption (see `docs/SEC_COVERAGE_REPORT.md`). Earlier periods are
  reachable only as documents, and this pipeline reports them `FILING_ONLY`
  rather than reconstructing them.
- **This is PIT for fundamentals only.** The universe itself is not
  point-in-time: SEC has no security master and no delisting feed, so a backtest
  built on it still carries survivorship bias in its *membership*, even though
  each member's fundamentals are correctly timed. The `SURVIVORSHIP_FREE_UNIVERSE`
  gate fails for exactly this reason.
