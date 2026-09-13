# Phase24 — measured resource regression gate

Continues Master70/83/91 and Phase14's recorded resource measurements, on PR86 head1c712b0. Existing workspaces only; no production implementation/data/schema changes. main e91095c unchanged after fetch.

Prior Phase14 decoded subresource baselines: Home550404 bytes/37requests, Stock2135178/38, guided Discover548505, Screener548505. Add reviewable ceilings: Home/Screener/guided Discover750000bytes/45requests, Stock3000000bytes/50requests. Headroom accommodates accepted contract additions without allowing unbounded client loading. These are regression limits, not optimal-size claims or production transfer/latency SLAs. Original Atlas optimization and actual production timing remain separate.

Owned: existing browser script/workflow, resource-budget.mjs and focused tests, this pack/ledger. The primary /discover/ module is unchanged; view=discover is the existing guided recipe workspace. Keep existing45 browser checks and32 accessibility scans.

Acceptance:8 budget observations across four measured views at1440/390; excessive bytes or request count fails. Missing/nonfinite/negative measurement fails. Aggregate workspaces reject per-security history fanout; all budgeted views reject fixtures. Stock retains its legitimate full-history request. No invented thresholds for unmeasured views. Resource report stored before aggregate budget failure.

Tests:5 focused budget tests PASS, syntax/diff PASS. Actions browser gate pending. Rollback additive QA checks only. No provider-scale runs, merge or deployment.

Gate PASS: PR87 b9fb020, Browser34744234979/job103689039208 SUCCESS. Log confirms45 existing browser checks,32 accessibility scans with no violations,8 budget checks with no failures.5 focused unit tests also pass in Actions. No threshold relaxation or product-code repair required.
