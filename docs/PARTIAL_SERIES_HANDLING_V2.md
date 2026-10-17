# Partial series handling v2 (canonical-price-validity-2.2.0)

This document describes how one data defect no longer deletes a title's entire history (review R8), and how point-in-time safety is guaranteed.

## 1. Problem

`canonical-total-return.js#reconstruct` decides once, over the whole series: either `tr` for every bar, or `tr = null`.
- `scripts/quant/lib/daily-prices.mjs` passed this verdict straight on.
- As a result, a hold or quarantine in 2023 removed 2014–2022 as well, in the signal backtest, the setup backtest, survivorship control and setup outcomes.
- Example in the existing test fixture: the published long series `ref_AGX` carries an undeclared 1:25 reverse split from 1995, and with it 30 years of valid history disappeared.

The Supertrader research code (V4, `data.mjs#firstCanonicalFailure`) already kept the valid prefix. It did so only in that one consumer, and it keyed decisions on `from` instead of `observedAt` (R7).

## 2. Contract

`quant/engines/canonical-price-validity.js#build(bars, opts)` returns one contract per series:

| Field / state | Meaning |
|---|---|
| `VALID {from, to}` | Bars whose total return the core reconstructs (unchanged `canonical-total-return-1.2.0`) |
| `INVALID_RANGE {from, to, observedAt, resumeFrom}` | A single bar without a valid price (a provider spike that falls back the next day). The series continues; the return skips the bar. |
| `HOLD {from, observedAt, reason, evidenceClass}` | From here on not canonical, because a corporate action is likely but not independently proven (`HOLD_FROM_EVENT_DATE`). Nothing is back-calculated. |
| `QUARANTINE {from, observedAt, reason}` | From here on not canonical, because the data contradict each other (missing dividend, factor not visible in the price, gap without cross-check) |
| `TERMINAL {kind}` | Listing break (> 365 days) or end of the series (OPEN / DELISTED) |
| `validFrom`, `validUntil`, `validBars` | The valid prefix |
| `evidence[]` | Corporate-action evidence (class, source, ratio, date, `visibleAt`, provenance hash) |
| `tr`, `dates` | Total-return index over exactly the valid bars |

Example (test V8):
- Series from 2014; undeclared 1:25 reverse split in March 2023, no source.
- `state = VALID_PREFIX`, `validFrom = 2014-01-02`, `validUntil` = the last session before the break.
- Under the 1.2.0 whole-series verdict the entire series would be discarded.

## 3. Point in time

- **What `observedAt` means.** It is the first day on which an invalidity can be recognized from bars and filings up to that day.
  - Price signature: the event day itself.
  - Spike: the following day (R7). On the spike day the bar still counts as valid, because nobody can know it is wrong yet.
  - Conflict with an SEC filing (since 2.2.0, review R2-01): the first session whose as-of view contains the hold. That is at the earliest the session after the filing, because an as-of view uses only filings strictly before asOf, and later if the date that places the provider factor in the conflict window comes from a later filing. `pitHistory()` discloses the earlier views as `HOLD_RETROACTIVE`.
  - SEC normalization (since 2.1.0, review F19): the first session whose as-of view contains the normalization. It can be later than the filing date, because the trading date may come from a later 8-K, a ratio under 3:1 needs a later SEC share count, and the price window needs the bars after the anchor. Audit run 38957800888 found six such views (5 events) where the old stage-only timestamp was too early. `pitHistory()` now discloses every earlier view.
- **As-of view.** `build(bars, {asOf})` computes using only bars ≤ asOf and SEC filings strictly before asOf.
  - Tests V9, V14 and R-F10: a defect starting 2024-06-03 does not touch a view as of 2022-12-30. A share count or SEC filing is used only when it was filed strictly before the as-of day, and each field (for example the trading date from a later 8-K) only from the filing that supplied it.
  - Returns of all bars before the defect are identical in both views. Returns are ratios; a later normalization does not change them.
- **`pitHistory()`** shows where a view changes later:
  - `HOLD` with `resumeFrom`: a later SEC filing confirms the split. Until then the series was held (test V10).
  - `PIT_REVISION`: until the filing, a point-in-time consumer would have seen an unadjusted jump. Counted in the audit.
- **Consumer rule.** Eligibility, exclusion, settlement and censoring key on `observedAt`, never on `hold.from`. `hold.from` only bounds which bars are valid.

## 4. Consumers (details in `PARTIAL-SERIES-CONSUMER-MATRIX-V2.json`)

The independent review (F07, F08, F15) showed that wiring partial series into the studies right away would change their model outputs as a side effect:
- delisting losses after a hold disappear in the survivorship sensitivity;
- `firstTouch`, `contractExit` and `oppositeExit` read split-adjusted prices across invalid ranges;
- censoring at holds is informative (distress).

This PR therefore provides the contract and an **opt-in** loader. The studies stay unchanged.

| Consumer | Before | After (this PR) | Adoption (own PR with before/after) |
|---|---|---|---|
| `scripts/quant/lib/daily-prices.mjs` | `fromBars`: whole series or `null` | `fromBars` unchanged. New `fromBarsPartial` keeps the valid prefix: `tr` up to `trValidUntil`, NaN after it, `trCoverage` FULL / PREFIX / FULL_WITH_INVALID_BARS. A stale series (`asOf`/`maxStaleDays`) gets no partial total return. | – (tests C1–C4) |
| `build-signal-backtest.mjs` | whole series | unchanged | Gate `firstTouch`/`oppositeExit` on `validUntil`; delisted padding only when `validUntil` is the last bar; switch rule on `trCoverage === 'FULL'` |
| `build-setup-backtest.mjs` | whole series | unchanged | Gate `contractExit`/`firstTouch` and the 126-day path on `validUntil` |
| `build-survivorship-control.mjs` | whole series | unchanged | One coverage enum for survivors and delisted listings |
| `build-setup-outcomes.mjs` | whole-series switch via `every()` | unchanged | Switch rule on `trCoverage === 'FULL'` |
| `refresh-benchmark-history.mjs` | whole series | unchanged (by design) | – |
| `vorsorge/ingest-tiingo-etfs.mjs` | TR whole or null | unchanged | ETF product, own PR |
| Supertrader V4 research | prefix, but `from` instead of `observedAt` | unchanged (Gate A) | Prerequisite for a new calibration: contract v2 / `observedAt` gating, no level-conditioned sanity layer |
| Discover, Screener, Technical, Watchlist, Morning, Setup replay | do not use the core | unchanged | – |

No consumer was changed silently. The study code and its test expectations are as in #721.

## 5. Limits

- The partial series ends at the first invalidity. A series that would be valid again after a `HOLD` is not continued, because the level link across the break is unknown.
- A spike that does not revert is not a spike; it stays a price signature or an unresolved jump.
- How much history partial series would win back is measured by the audit (bars and histories). What it does to the studies is a model question for the adoption PR.
