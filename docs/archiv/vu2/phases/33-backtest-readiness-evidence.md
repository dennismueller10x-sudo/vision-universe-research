# Backtest readiness — provider evidence and execution prices

Baseline: `1ec3bdaed6859d75cc9b0a2c42186027d6085d9d` (`main`, PR #122).

## Purpose

This phase removes capability overclaims from the existing Backtest engine. It
does not connect a real provider, materialize PIT panels, change an upstream data
pipeline or expose a job/API.

Previously, every completed run reported PIT fundamentals, delisted securities,
restatement handling, corporate actions and historical-universe support as `true`,
regardless of the provider. `next_open` also used the synthetic interpolation for
all providers. Both behaviors could make an incomplete real-data adapter appear
production-ready.

## Contract

A provider may attach `backtestEvidence` schema `1.0`. Each capability becomes
`true` only when it carries `status=VERIFIED` and a bounded, non-secret evidence
code. Missing, malformed or claim-only entries resolve to `false`.

| Capability | Default | Promotion requirement |
| --- | --- | --- |
| Point-in-time fundamentals | false | provider evidence |
| Delisted securities | false | provider evidence |
| Original vs. restated | false | provider evidence |
| Corporate actions | false | provider evidence |
| Historical universe | false | provider evidence |
| Next open | unavailable | observed adjusted open, or explicitly labelled model |
| Next close | observed adjusted close | existing price panel |

The normalized evidence and its hash enter the reproduction input. Therefore a
capability change produces a different reproduction identity. Missing evidence is
also returned as a critical run warning.

## Execution semantics

- `next_open` with observed `adjustedOpen` is `OBSERVED_ADJUSTED_OPEN`.
- The existing mock-only interpolation is `MODELED_INTERPOLATION`, is disclosed in
  run warnings and receives only partial execution-timing credit in Trust Score.
- `next_open` without either form fails with
  `NEXT_OPEN_PRICE_EVIDENCE_REQUIRED` before data execution.
- `next_close` remains `OBSERVED_ADJUSTED_CLOSE`.

The mock provider declares only its own synthetic fixtures. A generic price-only
provider runs at observed next close but receives `false` for every undeclared PIT,
universe and corporate-action capability.

## Gates and recovery

- Focused Backtest/Panel/Acceptance/Rule tests: 63/63 PASS.
- Full Quant suite: 1,219/1,219 PASS.
- SEC 471/471, internal PIT 32/32 and Worker/Discovery 66/66 PASS.
- Exact release build PASS at 4,846,342/8,388,608 SEC bytes with
  `EXISTING_R2_UNCHANGED`; release/resource contract 8/8 PASS.
- Secret hygiene, diff hygiene and the explicit no-Discovery-diff gate PASS.
- Remote PR/main gates and production smoke remain required before deployment is
  recorded.
- No `discover/**` or `discover-v2/**` path changes.
- Rollback is a code revert; no persisted data, secret, schedule or deployment
  configuration changes.

## Remaining real-backtest blockers

This contract creates honest readiness states; it does not supply the missing
evidence. Real activation still requires the existing internal SEC/PIT path to
materialize a cutoff-safe fact panel, historical security/universe membership with
delistings, evidenced corporate-action-adjusted prices, and an observed execution
price compatible with the selected strategy timing. Until then,
`BACKTEST_REAL_EXECUTION_READY=false`.
