# Backtest rule eligibility preflight

Baseline: `127adb34bc8e72b48085c5694d538ee70e2d6f36` (`main`, PR #124).

## Purpose

This phase closes the gap between the canonical current-snapshot Rule Contract
and historical launch behavior. A Strategy containing Technical/Elliott fields
must be rejected before the browser creates a Worker or generates a model
dataset. Current product use remains distinct from historical certification.

## Shared contract

`Strategy.backtestEligibility(definition)` is the single rule-definition
classifier. It validates the Strategy schema first and returns a structured,
deterministic result with:

- `eligible`
- `code`
- `blockedFields`
- `errors`
- `scope=RULE_DEFINITION_ONLY`

`RULE_DEFINITION_ONLY` is intentional. An eligible rule definition does not
certify historical universe membership, PIT panels, revisions, delistings,
corporate actions or execution prices. Those remain separate provider gates.

The Backtest engine delegates its assertion to the same classifier. The Product
API runs the classifier before `new Worker(...)`. The Strategy detail page
disables historical launch and displays the exact code and fields. No hidden
model-data generation occurs for a rejected rule.

## Classic workspace scope

The classic synthetic Screener and Strategy Builder do not contain the real
materialized Technical/Elliott snapshots. They therefore do not offer the four
current-snapshot fields. A persisted or manipulated definition containing such a
field fails closed with an explicit data-scope message instead of appearing as a
valid zero-result screen.

The VU2 Product Service path remains unchanged: current Screener and Strategy
preview can use the existing materialized snapshot artifacts and preserve the
canonical predicate. Historical launch remains blocked until a certified
historical snapshot sequence exists.

## Scope and recovery

No provider, endpoint, pipeline, materializer, secret, schedule, R2 binding or
delivery architecture is added. Standard Fundamentals remain materialized Product
Data. Rollback is a code revert. No `discover/**` or `discover-v2/**` file is
modified and no recurring cost is introduced.

## Validation state

Focused Strategy, Backtest, Product API, classic-scope, Screener and registry
tests: 65/65 PASS locally. Full Quant 1,230/1,230, SEC Python 471/471,
internal PIT 32/32, shared Worker/Discovery 66/66 and resource-budget 5/5 PASS.
The exact release remains within the existing SEC budget at 4,846,342/8,388,608
bytes with `EXISTING_R2_UNCHANGED`. Remote CI, production and browser gates must
pass before this phase is recorded as deployed.
