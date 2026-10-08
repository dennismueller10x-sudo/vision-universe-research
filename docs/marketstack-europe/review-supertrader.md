# Independent SuperTrader Europe shadow admission review

Reviewed 8 October 2026. Scope: `scripts/supertrader/europe-readiness.mjs`
and its dedicated tests. **APPROVED FOR ISOLATED SHADOW READINESS**.
This review belongs to the foundation documentation; it is not part of the
separate SuperTrader Gate A code PR.

The module consumes structured validator evidence bound to canonical security,
listing, MIC, currency and series hash. It requires verified European primary
equity identity, an exchange-bound completed session, sufficient calendar-checked
history, explicit zero OHLC defects, complete positive-volume observations,
whole-interval corporate actions, independently certified split adjustment and
an aligned European benchmark. Missing counters do not become zero. Backtest
admission additionally requires point-in-time selection, survivorship controls,
walk-forward/out-of-sample evidence, execution costs, corporate-action replay,
delisting returns and total-return series. Existing method-specific
`evaluateGates`, history plans and usage-rights checks remain unchanged.

Independent findings were corrected by the author and reread:

- Protected existing company/instrument/security/listing IDs now block admission.
- Conflicting primary listings for one security block every conflicting entry.
- Malformed or US benchmark MICs, malformed hashes and self-benchmarks are blocked.
- Truncated hashes are rejected: supported series identifiers are exactly 16 hex
  characters from the existing VU canonical producer or 64-character SHA-256
  identifiers. The existing 16-character hash is not cryptographic authority.

Node 22.23.3 independently passed **18/18 tests**, including the reproduced
collision and malformed/truncated-hash cases. Inputs are preserved. The separate
`EUROPE_SHADOW` population invokes no strategy, admits no trading members, writes
no production data and publishes no metrics. Existing US population and strategy
behavior are untouched by these additive files.

Upstream validators remain a trusted boundary: this module checks their
structured evidence contract rather than downloading or independently proving
each underlying observation. A synthetic passing fixture does not certify any
live European security. Public display, actual strategy execution and a real
backtest remain separate approvals with measured evidence and confirmed rights.
