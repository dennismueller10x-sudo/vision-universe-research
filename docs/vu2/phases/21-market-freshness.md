# Phase 21 — EOD freshness in product experiences

Restored after current-main sync PR84 (phase22); original unpublished implementation was lost with transient local files. Active Master §§26,33–36,39–42,60,67. No foundation/research restart.

Owned: market-health-contract.js, Product Services composition, UMD export wrapper for existing market-eod-gate.js, Home/Stock/index/style, focused tests and browser QA. EOD calculations are unchanged; Node and browser share one owner.

Contract scope EOD_COVERAGE_ONLY: compare each approved observation date with last closed session. Older valid dates STALE; invalid/non-trading/not-yet-closed dates PIPELINE_ERROR; absent calendar/market data UNAVAILABLE. No price or provider-finality claim. General quality checks NOT_EVALUATED; missing pipeline timestamps not invented.

Home/Stock refresh coverage every60 seconds while visible using existing cached observations; no new price-history fanout. Unchanged text is not repeatedly announced. Earlier independent review found lowercase refresh identity mismatch; API normalization and canonical Stock ticker retained with regression. Browser/Node parity, holidays/weekends/early closes and existing CLI guards are tested.

Acceptance:44 focused tests PASS on restored implementation; remote CI and desktop390 visual inspection pending. Rollback additive health composition and export wrapper. No scheduler, public display, provider or SEC-owned changes. Production lifecycle still separately gated.
