# Existing artifact integration — 2026-09-19

Base / observed main: e4bcd8e1a89687078cea4dd77c89d5c1ebbcaf93.
Branch: integration/quant-existing-artifacts. Existing worktrees retained.

## Owner contract

Reuse SEC consumer artifacts, canonical series, intraday snapshots and Cloudflare
live worker. No new serving service, secret, ingestion or Discovery change.
PR111 is preserved. Its Vercel production service auto-resolution is disabled by
`production.enabled=false`; explicit test/development injection remains possible.
No production Vercel activation is performed.

## PR111 disposition

KEEP: canonical IDs, Company Master search, typed availability, secret isolation,
trade/quote safeguards and tests. ADAPT: Product Services to existing artifacts.
PARK: extra Vercel API/R2 serving, environment provisioning and automatic production
base URL. Existing server code retained, not deleted or promoted.

## Active contracts and files

- `quant/api/product-services.js`: canonical security identity does not require CIK
  for market data. Fundamentals still require an issuer CIK. Public display checks
  use the existing policy and grants; no gate is weakened.
- `quant/api/fundamentals-contract.js`: additive consumer annual fact presentation,
  preserving currency, accession and filing date. Never imports Discovery scores,
  narratives, navigation or calculations. No new fundamental formula.
- `quant/config/product-services.json`: automatic additional API path disabled.
- `vu2/experience.js`: canonical search result opens available history and existing
  professional workspace actions. Existing Golden Five full histories retained.
- Existing browser QA extended for actual TSLA facts and chart at desktop/390px.

## Acceptance

No Discovery files changed. No direct provider request, R2 credential or new secret.
Existing protection tests must remain green. Identity mismatch, mocks, future data,
duplicate points, display denial and unsupported temporal semantics must fail closed.
SEC artifact budget remains 8 MiB. Browser and accessibility gates required before merge.

## Actual artifact capability, not inferred storage capability

Daily closes: `/quant/data/market/discover-series/<masterMemberId>.json` (about 1Y).
Long closes: `/quant/data/market/discover-series-long/<masterMemberId>.json` (weekly).
These do not supply daily OHLCV or execution prices. No interpolation or invented bars.
Intraday uses existing index `available` sessions plus canonical masterMemberId;
snapshot validator is reused. Snapshot availability does not mean live subscription.
Realtime capability points to existing Cloudflare worker, on demand, with connection
state NOT_CONNECTED. It does not prove symbol coverage or connect a chart by itself.

SEC consumer annual tracks are latest-known retrospective data, not a PIT panel.
Quarterly/TTM series are not present in these tracks; return typed unavailability.
Existing SEC inspector route for validated five names remains intact.

## Validation and remaining dependencies

Local Quant: 1,188 tests pass. Focused contracts/services: 43 pass.
Release build: PASS; SEC delivery 2,762,729 bytes under unchanged 8 MiB.
No provider tests/backfill rerun. No Discovery source/data changed.
Local browser download has timeout/HTTP502; reuse GitHub Actions Browser QA.
Coverage measurement uses actual release artifact and Product Services, no provider:
6,881 canonical members; 3,648 annual revenue histories, 6,443 daily close series,
5,478 intraday snapshots validated. Full failure counts in measurement output.
These are not production coverage claims. Realtime universe not measured.
Professional backtest remains blocked by existing product trust gate (0 ready).

Next gates: remote Quant/SEC/Company Master/Browser CI, screenshot inspection,
then connect remaining canonical Technical/Quant/screener inputs and live UI through
existing contracts. Do not use Discovery scores as Quant factors. Full quarterly/PIT
and OHLCV delivery must be assessed against existing generators and fixed budget;
no additional service may be activated without concrete need and Owner decision.

Rollback: preceding main e4bcd8e. Changes are additive consumer adapters and runtime
configuration; no storage/data mutation or secret change.

## Visual / recovery review

PR #114 opened at ba5a76a. Initial remote Quant, SEC, Company Master and release
package gates passed. Browser test caught an obsolete all-or-nothing factor-panel
outage expectation: repaired by checking exact independent history provenance and
separately rejecting fabricated charts during combined panel/history outage.
Artifact download succeeded; desktop annual-history screenshot inspected. Stock
chart currency suffix clipped y-axis labels, so labels now use compact numbers
while currency remains explicit beneath the chart. Await rerender and mobile gate.

At b2298a0 all remote gates passed; 49 browser, 36 accessibility, 8 resource
checks. Rerendered canonical stock at 1440/390 and history at 390 inspected: labels
readable, table horizontally scrollable, workspace actions preserved. Main advanced
to 8fde31f through independent PR #113. No owned-file overlap; integrate without
modifying those Discovery changes, then repeat CI.
