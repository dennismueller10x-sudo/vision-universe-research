# Technical and Elliott — canonical current-snapshot rules

Baseline: `2e7d56166882abada54e8c186562593c40bd2706` (`main`, PR #123).

## Purpose

This phase connects the already materialized real Technical/Elliott snapshot data
to the existing canonical Rule Contract. It does not calculate a second score,
create a new market-data path, widen the product universe or claim historical
Technical/Elliott coverage.

The existing `quant/data/technical/index.json` and its existing methodology
artifacts remain the source. The standard Product Service loads them only when a
Technical/Elliott field is used. Ordinary screens retain their previous static
data path and remain independent of the Technical bundle.

## Rule fields

| Canonical field | Type | Product use | Historical/PIT status |
| --- | --- | --- | --- |
| `technicalOpportunityScore` | number | current Screener and Strategy preview | not certified |
| `technicalTrend` | enum | current Screener and Strategy preview | not certified |
| `technicalPrimaryDirection` | enum | current Screener and Strategy preview | not certified |
| `elliottCountStatus` | enum | current Screener and Strategy preview | not certified; not a probability |

Every field is marked `CURRENT_SNAPSHOT_ONLY` and
`backtestEligibility=NOT_CERTIFIED`. The Backtest engine rejects a definition
containing one of these fields with `RULE_METRIC_NOT_BACKTEST_CERTIFIED`, before
provider data execution. Current Strategy preview continues to use the exact same
predicate as Screener.

The Technical Scanner maps its compatible legacy filters to the canonical Rule
Contract and exposes the resulting predicate hash. Unmapped legacy scanner fields
retain their existing evaluator; an unmapped canonical field fails closed.

## Data and scope gates

- Exactly one real, non-mock current snapshot is required for each of the five
  already approved product symbols.
- Identity, date, score range, state enums, snapshot id, bundle version and both
  methodology versions are validated before rule execution.
- Mock, future, duplicated, mismatched or methodology-drifted data fail closed.
- Enum rule fields cannot be selected as sort keys; an enum-only filter receives
  the existing numeric default sort.
- No full-market ranking, historical Technical feature panel, historical Elliott
  count series, Signal/Alert expansion or real Backtest activation is claimed.

## Recovery

Rollback is a code revert. No stored data, pipeline, endpoint, secret, schedule,
provider integration or deployment configuration is added or changed. No
`discover/**` or `discover-v2/**` file is modified.

## Validation state

Focused Product Service, Screener, Rule Contract, Registry, Technical Scanner and
Backtest tests: 85/85 PASS. Full Quant 1,224/1,224, SEC Python 471/471, internal
PIT 32/32, shared Worker/Discovery 66/66 and resource-budget 5/5 PASS locally.

PR #124 merged as `127adb34bc8e72b48085c5694d538ee70e2d6f36` and is deployed.
PR-head Company Master #40, Pages #108, Quant #182, Browser QA #78 and SEC #175
all passed. Exact-main Pages #109 (including deploy), Quant #183 and SEC #176
also passed. Production reports bundle `e6d12619aee0967e`, exact source commit
`127adb34bc8e72b48085c5694d538ee70e2d6f36`, 4,846,342/8,388,608 SEC bytes and
`EXISTING_R2_UNCHANGED`.

Fresh production smoke reproduced the score and Elliott filters, canonical
Screener-to-Strategy handoff, explicit nonhistorical warning and the stored
188-rebalance mock Backtest. The separate Discovery product rendered unchanged;
no page-origin console error was observed. Evidence is also retained in the
PR #124 deployment comment. This phase is `DEPLOYED`; `DISCOVERY_CHANGED=false`.
