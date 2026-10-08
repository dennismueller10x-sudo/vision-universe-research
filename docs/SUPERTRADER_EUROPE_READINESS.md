# SuperTrader Europe: isolated shadow input readiness

This module accepts validated foundation outputs through arguments. It does not import the Marketstack integration, call a provider, write artifacts, run a strategy, add trades or change the existing US population. Its three files belong in an isolated SuperTrader PR under Gate A.

Series bindings accept the existing 16-hex VU canonical hash or a 64-hex SHA-256 hash, with no truncated/other-length digests. The canonical VUHash is not cryptographic authentication: documentary authority remains the independent validator/resolver responsibility.

`assessEuropeSupertraderInputs(input)` checks identity, current EOD, complete history, OHLC, volume, corporate actions, split-adjustment basis and a verified European benchmark. Every independent validator must provide its source/document and bind the exact canonical security ID, listing ID, MIC, currency and price-series hash. Missing or conflicting evidence blocks admission. Provider-adjusted fields alone cannot pass.

`SUPERTRADER_READY` describes sufficient validated shadow inputs only. The output always carries `strategyAdmission: SHADOW_ONLY`, `admittedToTrading: false`, `strategyInvoked: false` and `publicationReady: false`. Existing strategy-specific data requirements still apply before any future strategy integration. Daily signal inputs require at least 253 complete observations; this does not satisfy a multi-cycle backtest plan.

`BACKTEST_READY` additionally requires documented European point-in-time universe selection, survivorship, walk-forward/out-of-sample separation, no lookahead, execution/cost/slippage evidence, baselines, corporate-action replay, delisting returns and a verified TOTAL_RETURN series. The existing unchanged `evaluateGates` and method-specific `TEST_PLANS` must also pass, including their usage-rights gate. Otherwise the result is `RESEARCH_ONLY` when identity/OHLC support research, or `BLOCKED`. The helper emits no backtest metrics and never makes them publishable.

`buildEuropeShadowPopulation(inputs, { protectedIds })` creates a separate Europe readiness inventory. Canonical IDs are retained as supplied. The same optional protected-ID list is accepted by `assessEuropeSupertraderInputs`; the resolver must supply existing protected US IDs. Duplicate listing inputs and multiple listings claiming the same primary security block both readiness labels; non-European inputs are excluded. Trading admission and production writes remain zero regardless of ready counts.

Input shape:

```js
{
  identity: { region: 'EUROPE', securityId, instrumentId, companyId, listingId,
    mic, currency, instrumentType: 'EQUITY', primaryListing: true,
    verified: true, source, document },
  price: { status: 'VERIFIED', verified: true, independent: true,
    source, document, securityId, listingId, mic, currency, seriesHash,
    latestDate, expectedLastCompletedSession, freshness,
    calendarVerified: true, calendarSource, calendarMic },
  history, ohlc, volume, corporateActions, adjustment, benchmark,
  variantId, backtest, now
}
```

All validators use the same documented identity/series binding as `price`. Their measured counters and verification flags are explicit in the module; absent counters never mean zero. Price freshness must equal the exchange's verified last completed session, and declared history years cannot exceed the observed date span. `corporateActions` must cover the history interval, `adjustment` must certify the exact SPLIT_ADJUSTED series, and `benchmark` must identify its own validated European series with `marketScope: EUROPE_EQUITIES` and confirm alignment/currency. Backtest evidence additionally binds its European selection universe and measured coverage; its TOTAL_RETURN hash is distinct from the SPLIT_ADJUSTED input hash.

Validation: `node --test scripts/supertrader/tests/europe-readiness.test.mjs`. Tests use synthetic evidence and never write production data.
