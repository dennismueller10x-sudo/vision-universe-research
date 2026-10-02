# Marketstack canonical adjustment research specification

This additive prototype never publishes prices, changes provider routing, or admits a listing to Quant, SuperTrader or backtesting. PR #334 charts, canonical identities and Tiingo computations remain the baseline. The evidence artifact is [`marketstack_adjustment_validation.json`](../reports/marketstack/marketstack_adjustment_validation.json); it reuses the exact cached PR #334 control windows and official corporate-action controls.

## Measured semantics

| Field / control | Empirical result | Consequence |
|---|---|---|
| AAPL OHLC around 2020-08-31 | Marketstack pre-split OHLC is already one quarter of Tiingo as-traded OHLC; post-split OHLC matches. | Applying the 4-for-1 split again creates a false discontinuity. |
| NVDA OHLC around 2024-06-10 | Marketstack OHLC matches Tiingo as-traded prices across the 10-for-1 split. | Prices need the split factor in this bounded window. |
| AAPL and NVDA reported volume | Pre-split observations match Tiingo volume scaled to post-split shares, despite different reported price conventions; post-event volume discrepancies remain. | Never apply a price-derived volume factor automatically or claim exact full-window volume parity. |
| `adj_close` | AAPL/NVDA bounded adjusted-return controls are numerically consistent, but IAU reverse split and other local listings retain gaps; some European ETF dividend windows copy raw close. | Presence of the field does not certify a total-return or split-adjusted series. |
| Corporate-action fields | Split and cash observations are available. Toyota has repeated action dates in one official-event window; ASML has a compound capital return/reverse split. | Event presence does not establish completeness, correct effective date, or applicability to a given security/ADR. |
| COST special dividend | The cached USD15 event has a locally consistent provider adjustment-factor step. | Missing independent ex-date and historical provider currency prevent admission. |
| Historical revisions | Ten exact NVDA dates have unchanged price, volume, action and currency fields across October 1/2 retrievals. | This bounded unchanged observation does not certify the provider's universal revision policy. |

The two independent Tiingo controls demonstrate bounded numerical reconstruction of split-adjusted close, daily returns and SMA5. Only AAPL explicitly declares historical USD in the Marketstack response. Neither control certifies a 250-session full history, 52-week metric, calendar completeness or action completeness. All new full-series technical, Quant, SuperTrader and backtest admissions remain blocked.

## Additional real US history/action experiment

Root coordinated run `36964230530` performed 75 fresh requests/estimated credits: EOD, splits and dividends for 25 US instruments over 2024-01-01–2026-09-30. This analyzer reuses its canonically materialized private responses and spends no additional credits. All 75 response paginations declare completeness; that statement concerns returned pages, not independently verified action completeness or absence of missing history. Twenty listings return 689 bars, VAI returns 24, and four selected mappings return no prices.

Five real Tiingo histories provide independent comparisons. Foreign explicit currency observations and invalid OHLC are excluded from the numerical pairs. Missing provider currency is retained only as a declared numerical diagnostic. ASCII ISO-code casing (`usd`→`USD`) is normalized without currency conversion; foreign codes are never overridden. The report distinguishes adjacent Tiingo-observed-session returns from returns spanning excluded sessions, so a multi-session interval is never called a daily return.

The experiment exposes hard issues beyond adjustment formula choice:

- NVDA/XNAS historical rows declare USD, missing currency, lowercase USD and **ARS**. MSFT/XNAS includes **EUR**; XOM/JPM/XNYS include **MXN**. Fifteen sampled listings have conflicting explicit historical quote currencies. Prices cannot be safely relabeled USD merely because the MIC is American.
- NVDA's separate dividends endpoint reports `0.04` on 2024-03-05, while its EOD bar reports `0.004`. The independent Tiingo cash observation is `0.04` and its later 10-for-1 split establishes a bounded share-basis explanation: the embedded cash is in anchor shares, while the endpoint matches as-traded cash. This one event does not establish universal dividend field semantics; another pre-split cash observation remains inconsistent with the independent event ledger. Other discrepancies include rounding candidates, ADR cash-basis differences and an event absent from the embedded bar; none is silently resolved.
- The NVDA split date's raw close return is **−89.92538548%**, while independently validated split-neutral return is **+0.74614519%**. This confirms the numerical need for split-neutral prices for that bounded raw-price event. It does not certify the entire history.
- Raw/adjusted OHLC validity and provider adjustment-return discrepancies are measured per listing. Independent action completeness, the exchange holiday calendar and point-in-time revision/action availability remain unverified.

Consequently, full-series Marketstack technical/Quant/SuperTrader/backtest admissions remain blocked or unsafe. The isolated product runner may investigate a numerical split reconstruction but must label it as research evidence; the strict canonical prototype continues rejecting incomplete currency, OHLC and provenance contracts.

## Canonical definitions

1. **Raw/as-traded OHLCV:** actual native quote-unit prices and actual shares traded on that session. This is the execution-price basis. Neither Marketstack `close` nor `volume` is assumed to provide this basis universally.
2. **Split-adjusted price-return OHLC:** for anchor date `T`, multiply the prices at date `t` by `F(t) = product(1/splitRatio(e))` for events with `t < e <= T`. A split ratio is new shares per old share. Reverse splits use ratios below one.
3. **Split-adjusted volume:** multiply independently verified as-traded volume by `1/F(t)`. If volume is independently verified as already adjusted to the same anchor, preserve it. Cash distributions never scale volume.
4. **Cash-reinvestment total-return index:** dividends are cash per post-event share in the native price currency. Express dividends and prices in anchor shares. Set the final adjustment multiplier to one; moving backward, `K(t-1) = K(t) * C(t) / (C(t) + D(t))`. Then adjusted-close return equals `(C(t)+D(t))/C(t-1)`. This assumes reinvestment at the ex-date close, before taxes, fees and withholding. OHLC is scaled by the same daily index factor solely for indicator compatibility.

The total-return definition deliberately differs from the widespread vendor backward factor `(previousClose - dividend)/previousClose`. Those definitions produce different daily returns when the ex-date market price changes. No vendor parity or production replacement is asserted.

## Prototype contract and hard gates

`canonicalAdjustmentPrototype(input)` in [`marketstack-canonical-adjustment-prototype.mjs`](../scripts/market/marketstack-canonical-adjustment-prototype.mjs) returns `{ status, bars, issues, semantics, productionAdmission:false, researchOnly:true }`. The prototype requires:

- exact verified listing identity, native currency/quote unit and independent source reference/hash;
- independently verified **as-traded** OHLC; already adjusted or unknown OHLC is rejected;
- independent volume basis, including its anchor when already adjusted;
- an independently verified exchange calendar and every expected session in the requested window;
- complete split coverage through the anchor; complete cash-distribution coverage additionally required for total return;
- verified, dated, listing-specific corporate actions with currency and source reference/hash;
- explicit post-event dividend share basis, valid positive OHLC, nonnegative finite volume and no duplicates.

Source hashes and `verified` declarations are caller-supplied evidence assertions, not a cryptographic proof that the source is complete. The evaluator is a research function; an authoritative ingestion/quality review must establish those assertions independently before any future product admission. It rejects all missing assertions rather than inferring them from a provider field.

Unsupported rights, spin-offs, capital returns, compound restructurings, conflicting duplicate actions and missing event sessions fail closed. No ADR ratio or currency conversion is guessed. A local ordinary-share split cannot automatically be applied to its US ADR. Missing/corrupt bars never become invented candles. Multiplicative numerical overflow fails closed.

## Intended product series

| Use | Required basis | Current new Marketstack admission |
|---|---|---|
| Accepted EOD charts | Existing validated native-currency display coverage | Preserved; no new blanket release |
| Continuous charts, moving averages, 52-week high/low, breakouts | Independently certified split-adjusted OHLC | Blocked pending full-series certification |
| Momentum, relative strength, volatility, drawdown | Explicit price-return or total-return definition consistent across compared securities | Blocked pending full-series certification |
| Quant technical factors | Existing engine semantics; do not mix adjusted momentum with unknown raw SMA/volume basis | Blocked pending full-series certification |
| SuperTrader | Certified split-adjusted OHLC and independently certified volume | Blocked pending full-series certification |
| Backtests | Raw executable prices, action ledger, explicit dividend/reinvestment rules, exchange calendar and PIT availability | Blocked; prototype alone is insufficient |

Ex-post adjusted history is suitable for controlled historical indicator experiments once independently validated. It is not proof of point-in-time knowledge. Future backtests must avoid executing orders at adjusted OHLC, use actual session prices, handle share-count changes and distributions explicitly, and respect announcement/availability dates. The current Quant engine uses different fields for momentum/risk versus SMA/52-week calculations; those choices are preserved and must be documented by the isolated fitness runner.

## Reproduction and tests

The offline validator accepts repeated `--probe=PATH` arguments and optionally `--compatibility=PATH`, `--controls=PATH`, `--us-probe=PATH`, `--out=PATH`. Inputs are the cached `marketstack-scale-36912587006/probe-provenance.json`, original PR #330 probes and the new canonically materialized US experiment under the private scratch directory. It emits public compact diagnostics with source hashes, never raw private responses or credentials. Response run provenance comes from explicit endpoint origins, never the replay container's identifier. No network calls occur.

```sh
node scripts/market/validate-marketstack-product-adjustments.mjs \
  --probe=/workspace/scratch/marketstack-scale-36912587006/probe-provenance.json \
  --probe=/workspace/scratch/marketstack-probe-5/probe.json \
  --us-probe=/workspace/scratch/marketstack-product-fitness-run-36964230530/probe-provenance.json
node --test quant/tests/marketstack-product-adjustments.test.mjs
```

Tests cover investor-wealth preservation across forward/reverse splits, exact cash-reinvestment returns, simultaneous split/dividend share basis, multiple splits, unchanged already-adjusted volume, missing calendars/actions/currency, invalid bars, duplicate/compound events, ADR identity and numerical overflow. Synthetic numerical fixtures are test-only and are never production data.
