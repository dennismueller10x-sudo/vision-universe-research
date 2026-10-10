# Full universe eligibility rollout

## Release state

Implementation is isolated in PR #561. `universe-rollout.json.enabled` remains
false. No full-universe production activation has occurred. The live 46-stock,
45-issuer scope remains the rollback baseline. Preliminary counts are not release
acceptance and must not be represented as published coverage.

## Authoritative state and observed operations

Read-only R2 acceptance run 38033395954 restored the CURRENT pointer twice into
separate fresh directories. Private state generation: dd958f61bebd9e538f5df279.
Checkpoint SHA-256: de51416e662afbf1aa2e3d281b1a79062c83ed1494b5760728dcdd999cfcda87.
All table proofs and generated consumer bytes reproduced. Zero source requests
and zero remote writes were performed by the audit. Subsequent source runs may
advance this pointer; release must restore CURRENT again.

Real source cron run 38028953673 succeeded with GitHub event `schedule` on
2026-10-10. This is actual source execution, not workflow_dispatch. Its receipt
records 30 first-party checks, 45 SEC checks, 118.638 seconds engine runtime and
458 seconds pipeline runtime before final production deployment verification.
The served consumer generation was 71dc0485476cfa74e59f7fc3 (86 files,
2,074,680 bytes). Production code at initial acceptance:
440a1645048d6b559988488f9a0f3148f21d3cdd.

## Deterministic issuer and module gates

Identity is bound to the CURRENT Company Master, exact issuer CIK/instrument IDs
and unique ticker ownership. Historical identities remain in the private ledger;
retired listings do not gain public authorization. New authoritative Master
listings can be evaluated automatically without an individual approval.

Every issuer is FULL, PARTIAL or explicitly ineligible for mapping, source policy,
invalid data/consumer, excessive staleness or absence of meaningful safe content.
FULL requires at least four meaningful modules, including current intelligence
and financials. PARTIAL requires one meaningful safe module. What Changed alone
cannot authorize an issuer. One invalid module is suppressed independently.

Modules: approved German profile; dated current intelligence within 90 days;
normalized financial KPIs with consistent fiscal period/unit and filing evidence;
metric-aware What Changed; confirmed future events or explicit estimated windows;
proven calls/webcasts; meaningful reports/materials. News is retained up to 180
days. Financials older than 180 days are visibly stale; financial periods over two
years old cannot constitute a primary KPI module. English-only profiles stay
hidden. Routine filing-reference metadata alone does not authorize Documents.

Existing OWNED_IR_SEC_METADATA_PREVIEW_V1 policy remains mandatory. No publisher
bodies, summaries, paid translation, invented content or ownership inference.
Private discovery endpoints are removed from consumer provenance; publication
source links remain inspectable. Ledger provenance remains unchanged.

## Publication and failure behavior

The manifest binds every eligible issuer, module flag, ticker, asset hash and
consumer generation. Delivery injects this bounded map into the existing Discover
gate; no global all-on switch or query override admits an ineligible ticker.
Ineligible listings make zero Company Intelligence requests. A failed eligible
payload/identity/module contract removes only that issuer's chapter; normal
Discover navigation and other products remain available.

Candidate objects are hash-read before a sole GOOD-pointer commit. Previous GOOD
is protected. Publication rejects unexplained identity remapping, missing assets,
consumer schema/source violations, backwards financial periods and systemic
coverage collapse. Removal up to max(10 issuers, 2%) permits individual fail-closed
changes; larger removal is blocked. Module collapse checks combine 10% with an
absolute tolerance (5 profiles/financials, 100 news items).

The new namespace is inactive until configuration AND a durable validated
activation receipt agree. Existing global OFF and Pages rollback remain available.
Before activation, an immutable copy of the latest known-good 46-stock consumer
must be preserved and read back. That full-universe release step is pending.

## QA and sampling

Every generated asset receives schema, hash, issuer, safe-link and actual V2
view-model validation. Seed: vision-universe-eligibility-20261010. Sample groups:
high-profile canaries; 10 each large/mid/small/micro; 10 international/ADR; 10
sparse; 10 seeded-random eligible; every module combination; 20 ineligible.
Numeric bands use dated USD price times issuer-reported shares for single-listing
common stocks only; this is a dated screening proxy, never live market cap.

Browsers use real existing protected Discover routes. Candidate interception is
labelled explicitly and is not production verification. Broad initial matrix:
390/430/768/1440, dark/light, access gate, navigation, identity, module visibility,
stale/estimated labels, links, JS errors and overflow. Routine refresh QA uses
permanent canaries plus at most 24 changed issuers. No thousands-page browser run
is scheduled every four hours.

## Refresh scaling and cost acceptance

Source-level due queue: active news 4h, events 8h, materials 24h, dormant news 24h;
existing cache validators, cooldowns and backoff remain. Oldest deferred work keeps
its position. Request/time bounds: first-party 240 requests/600s; regulator 110
requests/240s; at most 80 issuer metadata repairs. One SEC Atom metadata source
provides exact-CIK update hints, with durable watermark, overlapping head check,
resume offset and failure cooldown. No universe discovery or new provider.

A four-hour runner cadence is not proof that all 5,355 sources refresh every four
hours. Effective backlog latency, real requests, runner minutes, R2 object counts
and package size require the isolated scaling run. Do not reuse the small-cohort
5,040-minute projection as full-universe evidence. Scaling acceptance is pending.

## Reviews and remaining acceptance

1. Eligibility review found HTTP discovery provenance leaked into consumer
   details and a financial-module flag surviving removal of its only displayable
   KPI. Both gates were corrected; full fresh-R2 contract rerun is required.
2. Sparse-consumer browser review and screenshot inspection are pending.
3. Full-universe authenticated refresh, durability, rollback and publication
   review are pending. Do not activate while these acceptance steps are incomplete.
