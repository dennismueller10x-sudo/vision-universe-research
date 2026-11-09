# Phase30 — Current canonical convergence

Base: PR92 head65ff92804b084cffbaf908e1b3f83f0158054258. Observed main: dac0c7d076a36b959563e80bdb499a6cbd3955db (2026-09-17). This is the next existing canonical lifecycle handoff dependency, not a new product surface or architecture audit.

## Active requirements and boundaries
Master26–28/39/60/75/84: integrate existing durable history, current SEC daily lifecycle and market refresh without duplicate paths; preserve strict incremental guards and fail-closed accounting. Research migration principle: current repository reality wins; preserve before replace. No research reread necessary. SEC-owned files and outputs remain byte-identical to observed main. Existing public display configurations are retained from main, not expanded here; VU2 services still select only the five explicit preview.scope members and enforce policy before reads. No rollout, provider backfill, credential or scheduler change.

## Shared contracts and changed files
Seven paths overlap; codec, guard, drivers and original history tests are identical between tips. Preserve PR91 history-store1.1.1 rather than accepting main's older1.1.0 accounting fallback. Resolve ingest-tiingo.mjs with main's existing scope/publication integrations plus VU2 strict EOD preflight, reconciliation, retry and typed health. Strict preflight and completion operate on the same resolved securities; regular checkpoint reset must not clear strict completion evidence. Fix main's self-referencing SECURITIES fallback (default CLI otherwise throws before execution).

Test fixture imports now include the existing scope resolver/publication dependencies and an explicitly bounded test scope. Two new strict-scoped CLI regressions cover identity-specific preflight/completion and empty-response retry. No provider requests leave the test process.

Four VU2 contract suites previously coupled current source files to a September10 clock and fixed market quotes. Keep all acceptance/rejection assertions; compare canonical values exactly and evaluate current real inputs with current observation time. Synthetic future cases remain2099; add explicit future SEC generation rejection. Production contracts remain unchanged. Browser QA similarly compares checked-in source values and records an explicit STALE_EOD clock seven days after source as-of; it changes no market data and retains freshness assertions. Screenshots from this QA must be interpreted with observation-context.json, not as live prices.

## Acceptance and evidence
Local full Node1070/1070 PASS,0 skipped. SEC Python471 PASS. Existing26 lifecycle/accounting tests PASS plus two new scoped cases; final five CLI cases PASS. Syntax/diff checks PASS. Remote Quant/SEC/Browser/Discover gates and current-tree screenshots are required before integration acceptance. PR85 visual evidence is separately closed for its unchanged historical scope, not used to certify this new integrated tree.

Main SEC report latest-run.json (2026-09-17, producer run35190129149): SUCCESS;5479 checked,7 changed/updated,0 failed/retry,0 unchanged reprocessed,7 R2 writes, reload7/7 PASS,7 downstream invalidations; normalization1.10.0. These are committed producer observations, not a newly executed full-universe verification or professional-backtest certification.

## Risks / rollback
Production market durability still lacks complete checkpoint lineage, provider finality, corporate-action reconciliation, dependent-feature and account-wide accounting/concurrency evidence. PR92 sample restoration does not close these. No unattended market activation. Integration remains a reviewable branch; rollback is to PR92 with all original PRs retained. Full current-main convergence carries existing source/data changes, not newly fabricated data. Any new shared-contract main drift requires re-comparison before merge.

Self-review amendment: regular (non-strict) checkpoint keys retain main's cross-day rejection cooldown and daily reset. Strict keys remain per-session. Added a sixth CLI case proving yesterday's done list resets while the rejected-history cooldown survives and no provider request occurs. Prior1070-test full-suite result predates this additional case; final remote regression required.

## Recorded gate result
Browser35199602253 passes45 functional/32 accessibility/8 resource checks. Home,Stock,Fundamentals inspected at1440/390 from artifact10487426101. Observation clock is an explicit stale scenario2026-09-22, source as-of2026-09-15; screenshots are not live-market evidence. Remote JS1071 PASS and Python471 PASS. SEC hygiene still fails: unchanged main consumer output makes total103248KiB versus8192KiB policy. No threshold relaxation or SEC data change. Shared delivery-budget owner decision required before phase acceptance.
Quant CI's JSON validation alone is batched into one Node process with the same32392-file scope and JSON.parse semantics; pipefail/NUL paths retain failures. Local all-file validation and invalid-input checks pass. This workflow-only follow-up does not change the browser-accepted product tree. No new product surface may bypass the remaining integration gate.
