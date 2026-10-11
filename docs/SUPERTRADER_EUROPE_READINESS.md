# Europe SuperTrader input readiness

The optional `scripts/supertrader/europe-readiness.mjs` adapter evaluates a separate Europe shadow population. It invokes no strategy, publishes no metrics, adds no trading member and enables no schedule. Existing strategies, US populations and ranking methods remain unchanged.

Every input must bind company, security, listing, MIC, currency and series hash to independent source documents. Signal readiness requires at least 253 daily observations, valid OHLC and volume, a verified exchange calendar, complete corporate actions and symbol continuity, a certified canonical split-adjustment basis, and a separately validated European benchmark. A provider adjusted column, a readiness label or an empty action response cannot satisfy these requirements.

Backtesting additionally requires point-in-time selection, survivorship and delisting treatment, walk-forward and out-of-sample evidence, execution costs and slippage, and an independently verified total-return replay. The adapter delegates the final method-specific history and coverage decision to the existing `evaluateGates` and `TEST_PLANS` without changing them.

Outputs distinguish `SUPERTRADER_READY` input readiness from `RESEARCH_ONLY` or `BLOCKED` backtest status. All outputs retain `admittedToTrading: false`, `strategyInvoked: false` and `publicationReady: false`. Europe production populations and concrete display/commercial rights remain separate decisions.

Validation uses the additive adapter test suite and the unchanged SuperTrader regression suite. Actual Europe results are generated privately from authenticated source evidence, with missing independent certificates retained as unavailable. The main baseline for this integration is `5d6aa260558fdd0422d07b26038cc383142c86ee`; licensed Marketstack data is excluded from this source PR.
