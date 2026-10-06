# Canonical Rule Contract v1

Baseline: `8d0454b287b053c270f186b6c3501a41bea8b5fc` (`main`, PR #121).

## Dependency-correct scope

This phase closes the rule-identity gap without activating a new data path or
claiming production backtest readiness. The canonical stock-selection predicate
contains only `universe + filters`. Sort, limit, portfolio constraints, execution,
notification delivery and storage are consumer concerns and cannot alter its
identity.

The existing Query engine remains the only validator and evaluator. Screener,
Strategy selection, Backtest candidate selection, EOD Signals and the internal
Alert evaluator use the same predicate hash and transition semantics. Existing
Query ASTs and query hashes remain present for backward-compatible presentation
and saved-screen behavior.

## State graph and recovery

`QUERY -> PREDICATE -> VALIDATE -> HASH -> EVALUATE -> CONSUMER`

- Invalid or divergent Query/Predicate pairs fail closed.
- A failed consumer evaluation returns no event; it never widens the rule.
- Alert delivery is explicitly `NOT_CONFIGURED`; this phase adds no scheduler,
  persistence, notification channel or public API.
- Reverting this phase restores the prior per-consumer identity behavior. There
  is no migration, credential, data rewrite or irreversible state.

## Integration matrix

| Consumer | Canonical contract | Result |
| --- | --- | --- |
| Screener | Query converted to predicate | PASS |
| Strategy Lab | Definition exposes selection predicate | PASS |
| Backtest selection | Base predicate hash recorded; liquidity/size constraints separate | PASS for engine parity; real execution remains gated |
| Signals | Transition and event identity use predicate | PASS |
| Alerts | Internal deterministic evaluator only | PASS; delivery not configured |
| Technical scanner | Separate technical scan DSL | OPEN; do not translate until semantic mapping is specified |
| Radar/Watchlist | Product-specific state predicates | OPEN; no false unification claim |

## Architecture hard gates

- Existing SEC/R2/PIT, Company Master, History, Intraday and Cloudflare Realtime
  paths are unchanged.
- Standard Fundamentals remain materialized Product Data. No public PIT API and
  no Vercel requirement are introduced.
- No `discover/**` or `discover-v2/**` file is changed.
- No recurring service or cost is added.

## Validation

- Quant: 1,218/1,218 PASS.
- SEC Python: 471/471 PASS.
- Internal PIT projection: 32/32 PASS.
- Shared Worker/Discovery regression: 66/66 PASS.
- Release contract/resource gates: 8/8 PASS.
- Exact release build: PASS, 4,846,342/8,388,608 SEC bytes,
  `EXISTING_R2_UNCHANGED`.
- Secret scan, `git diff --check`, and explicit Discovery-diff gate: PASS.

Browser QA and production smoke are release gates and must complete on the PR/main
artifact before this phase is marked deployed.

## Remaining dependency-correct work

Do not connect the real Backtest provider yet. The current production blockers are
materialized PIT fact panels with exact availability timestamps, a historically
valid universe including delistings, evidenced corporate-action/execution inputs,
and capability flags derived from provider evidence rather than asserted. The next
safe tranche is readiness/capability hardening and the existing internal PIT
materialization boundary; neither may turn a missing historical-universe proof into
a PASS.
