# Internal R2/PIT adapter — materialized product delivery

Current baseline: `0bac3fe3240c6f00dac402710e0675bfffe96570` (`main`, PR #120).
The Owner clarification of 2026-09-19 makes the retained adapter internal Vision
Universe infrastructure. A freely accessible PIT/R2 endpoint is not required for
normal Quant 2.0 product operation.

## Architecture decision

```text
canonical SEC/R2/PIT
  -> internal Vision Universe processing
  -> materialized Product Data
  -> existing static Product Services
  -> Quant 2.0
```

This is the existing artifact path, not a new pipeline. `scripts/quant/sec/consumer.py`
and the existing SEC workflows already materialize compact consumer data; the
release builder publishes bounded projections. Ordinary annual and quarterly views
already consume those artifacts through `quant/api/product-services.js`.

Decision matrix:

- `PIT_PUBLIC_API_REQUIRED = false`
- `VERCEL_REQUIRED_FOR_STANDARD_PIT_PRODUCT_PATH = false`
- `PIT_INTERNAL_PROCESSING = true`
- `PRECOMPUTED_PRODUCT_DATA_PATH = PASS`

## Locked scope

- Keep the canonical R2 factbooks, existing SEC normalization, Company Master,
  `PeriodResolver`/`FactTimeline`, and existing materializers as the only sources.
- Retain `scripts/vu2/fundamentals-serving.py` and
  `scripts/vu2/fundamentals-r2-adapter.py` for internal jobs and validation.
- Include only observations visible at the requested `asOf`; period scope itself
  must be cutoff-visible and later restatements must remain excluded.
- Preserve the exact R2 object namespace, compressed-byte digest verification and
  existing server-side GitHub/SEC secret scope.
- Keep standard Product Services on committed/materialized artifacts.
- Do not alter Market History, Intraday, Cloudflare Realtime or Discovery.

For `usage=backtest`, raw canonical `revisionHistory` is the only PIT-certified
fundamental source. Resolved current-SIC/industry rows remain excluded because
historical issuer classification is not available. Professional backtest readiness
still depends on historical universe, prices, corporate actions, costs, slippage
and execution gates.

## Public delivery boundary

`api/fundamentals.py` is removed and `vercel.json` declares no Fundamentals
function. `/api/status` describes Fundamentals as `PRECOMPUTED_PRODUCT_DATA`.
Consequently, the standard product path requires neither Vercel R2 secrets nor a
public PIT rate/concurrency budget. The former Production-secret/public-endpoint
blocker is removed for normal Quant 2.0 operation.

The existing Vercel History and Intraday capabilities are separate. The parked
market-history endpoint remains behind `VU_MARKET_HISTORY_API_ENABLED`; this
decision neither activates nor changes it.

## Future on-demand boundary

Atlas Deep Dive, a targeted PIT query, or an individual Strategy/Backtest job may
later justify server-side on-demand execution. That is a separate activation
decision. Before such a feature is exposed, its authenticated caller, request and
concurrency limits, cache/materialization behavior, cost ceiling, production secret
scope and smoke tests must be approved. No such endpoint or credential is activated
by this phase.

Rollback is the branch revert. No data migration, deletion, second normalization or
second source of truth is involved.
