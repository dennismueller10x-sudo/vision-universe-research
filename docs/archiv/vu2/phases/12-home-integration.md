# Phase 12 — connected Home and session context

Base: PR74 03f49bc43f5db1c0409f77395bac7069c0a9dee3. Main observed533245e. State IMPLEMENTED; independent review/browser gate pending.

## Active requirements
Master §§9,14,30,33,35,40,63: meaning before evidence, personal Watchlist entry, Guided + Free Exploration, honest calendar session versus data freshness. Research experience contract remains the target; no new full-market inference from the approved display set.

## Contracts and files
getHomeIntelligence composes existing Market and Watchlist product views; protects raw quotes separately from derived grants. getMarketSession projects existing MarketHours/calendar without changing the engine. quant/api/market-session-contract.js validates calendar structure and coverage, emits PRE_MARKET/REGULAR/AFTER_HOURS/CLOSED or explicit unavailable. It never claims live data or exchange operational confirmation.
vu2/experience.js/css and index.html provide connected responsive Home: personal selection, historical changes entry, scoped company observations, editorial and professional Research access.

## Acceptance and tests
- No raw history fanout on Home, no provider payload assembly, no synthetic summary/rank or live stream.
- Calendar failure must not hide independent research. Uncovered/malformed calendar does not use a fallback as verified state.
- Calendar clock refreshes at most once/minute while visible; market data does not pretend to refresh with it.
- Missing/corrupt personal selection remains protected. Existing workspace access retained.
- 27 focused service/session tests PASS: real values, permissions, DST, holidays, early close, fallback rejection, independent-source failure.
- Existing 32 browser checks plus empty/personalized Home screenshots at1440/390; explicit calendar outage test. Full regressions at PR gate, no provider rerun.

## Rollback and gaps
Revert this additive phase to restore previous Home; no stored data mutation. Global breadth/regime, real signal monitoring, realtime delivery, validated feature freshness and provider finality remain independent gates, not inferred from the calendar. Public rollout unchanged.
