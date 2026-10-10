# Full universe eligibility rollout

## Release state

Implementation is isolated in PR #561. Configuration is armed; a missing durable activation receipt still selects
only the legacy scope. No full-universe production activation has occurred. The live 46-stock,
45-issuer scope remains the rollback baseline. The full structural and representative candidate acceptance below has passed.
It is not yet published coverage; authenticated scaling and production readback
remain required.

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

## Full inventory and candidate acceptance

Authenticated read-only run [38037890325](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38037890325)
restored the same authoritative CURRENT state twice: 5,120 issuer payloads,
6,416 historical/private listing identities. The current/historical identity
union contains 6,079 issuers, including 959 with no private payload; it is not
5,120 plus 959 additional intelligence datasets.

Eligible: **4,789 issuers / 5,088 current securities**, comprising 1,358 FULL and
3,431 PARTIAL. Private ineligible: **331**: mapping 2; source policy 97; no safe
content 223; too stale 9; data-invalid/consumer-invalid/other 0. The larger
current-master inventory has another 959 identity-only cases; those are not
added to private coverage or silently given empty payloads.

| Eligible module | Issuers | Eligible coverage |
|---|---:|---:|
| German profile | 45 | 0.94% |
| Aktuelles, 90 days | 1,717 | 35.85% |
| Financials | 4,711 | 98.37% |
| What Changed | 3,626 | 75.72% |
| Next event | 3,274 | 68.37% |
| Calls/Webcasts | 562 | 11.74% |
| Documents | 1,800 | 37.59% |

Approved news: 1,106 issuers within 30 days, 1,716 within 90 days, 1,750 retained
within 180 days. Aktuelles also includes deterministic material-event classes.
Confirmed future events: 190 issuers; estimates: 3,123 (overlap is possible).
Management content: 481 issuers. Raw ledger: 20,555 news records / 2,628 issuers;
raw counts are not approved consumer coverage. Source-policy projection excludes
2,981 news, 275 calls, 25 events and 4,642 materials.

Private-payload profile states: 45 approved German; 3,630 without approved
German copy; 1,438 without safe profile source; 7 stale/weak. The wider identity
inventory adds 959 source-less profile identities. English/raw profiles
are hidden; no bulk AI translation. Financial states: 3,697 current, 1,014 stale,
141 with no supported display KPI, 15 too stale, 1,189 no data, 23 not evaluated.
Financial state totals above include identity-only issuers. Restricted to private
payloads: 3,697 current, 1,014 stale, 141 without supported display KPI, 15 too
stale, 251 without supported data and 2 unresolved/not evaluated. Module counts
above are eligible only. Unsupported share-count-only rows never become a financial card.

Registered sources: 5,384. Active approved: 5,355 (2,138 feeds, 1,342 event
sources, 1,875 material sources). Source health: 5,158 healthy, 174 temporary
failures, 50 stale, 2 broken. These private operational aggregates are evidence,
not customer-download source registries.

Every one of 5,414 consumer assets, 4,789 actual V2 view models and 5,088 security
lookups passed. Consumer: 97,013,703 bytes, generation
`757f54550d85e2ba880936f3`, asOf 2026-10-10T08:27:36Z; underlying private state
asOf remains 05:54:50Z. A new export timestamp does not imply fresh source data.

Browser candidate: **239 passed cases**, 114 eligible stocks and 20 ineligible;
390/430/768/1440, dark/light, access gate, no JS errors/overflow, correct issuer,
module, stale and estimated states. Ineligible stocks make zero CI requests.
The sample includes ten Master-only Discover pages without price JSON, 42 module
combinations and ten nano caps in addition to all requested groups. This is
candidate verification, not a production deployment claim.

High-profile gaps: TSM remains off without a supported consumer KPI or another
safe module. ASML/BABA/BIDU/PDD/LI are sparse financial experiences; NVO also has
documents. Berkshire share classes have no German profile/current news. XPeng's
older CNY financials remain labelled stale. German profiles beyond the original
45 are the largest visible limitation. None are invented to inflate coverage.

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
existing cache validators, cooldowns and backoff remain. A weighted fair queue gives news eight slots, events two, materials one and
dormant news one; oldest deferred work keeps its position within its tier. Request/time bounds: first-party 240 requests/600s; regulator 110
requests/240s; at most 80 issuer metadata repairs. One SEC Atom metadata source
provides exact-CIK update hints, with durable watermark, overlapping head check,
resume offset and failure cooldown. No universe discovery or new provider.

A four-hour runner cadence is not proof that all 5,355 sources refresh every four
hours. Measured weighted source engine run 38036784710 checked 81 sources in 727.232s:
136 first-party requests plus 83 SEC requests, 47 successful feeds, 11 event
sources and 5 material sources. Its private backup/fresh restore passed, but
browser acceptance correctly rejected the missing Master-detail CI integration;
no consumer was published. The corrected full storage acceptance is pending.

At that measured throughput, an initial 5,266-source backlog is substantial
(5,185 deferred); a four-hour runner does not provide universal four-hour source
freshness. Oldest-first tier rotation avoids starvation, but effective source
latency must be observed after several actual runs. No concurrency increase or
polling-cadence expansion is hidden in this rollout.

Final pipeline runtime, R2 object counts and package size require the corrected
isolated scaling run. Do not reuse the small-cohort
5,040-minute projection as full-universe evidence. Scaling acceptance is pending.

## Reviews and remaining acceptance

1. Eligibility quality: removed HTTP discovery-only provenance and rejected
   financial flags whose last supported KPI disappeared during period alignment.
   All 4,789 payloads and every actual V2 module now pass. Empty or policy-only
   issuers stay off. Good issuers are not excluded merely for missing profiles.
2. Consumer quality: inspected Tesla, Apple, NVIDIA, Palantir, XPeng and sparse
   AIDX/SCNX/GLNG examples. Financial-only pages remain useful, stale labels and
   currency remain visible. A real missing integration on existing Master-only
   pages was fixed by mounting the same renderer, without price/Quant changes.
   Ten Master-only stocks are now permanent initial-QA cases; APD is a canary.
3. Operations: previous-manifest validation proof now stays in a private runner
   directory, never in public consumer downloads. Fresh private restore and all
   bytes reproduce. Isolated source work is bounded and scheduler-driven. Full
   consumer R2 publication/readback, immutable rollback freeze, actual production
   activation and readback remain pending; do not claim launch before they pass.

Operator per-issuer disable: add the exact existing issuer ID to
`universe-rollout.json.disabledIssuers`, validate and release. Only that issuer
becomes INELIGIBLE_OTHER/OPERATOR_DISABLED; its private state is retained.
Malformed IDs fail configuration validation. Global rollback: run main's
`company-intelligence-universe-release.yml` in rollback mode, which verifies the
immutable 46-scope consumer, restores its GOOD pointer and dispatches existing
Pages. The existing Company Intelligence global OFF path remains available.

Required product regressions retain their assertions. Existing Core news fixture
failures (SPCX/TMUS/VZ/T, DVN/CRGY, SLYG) reproduce on baseline 440a1645 with eight
byte-identical inputs; proof is in `evidence/full-universe-20261010/core-baseline.json`.
The only Discover protected-path exception verifies the exact mount/cleanup,
approved-financial capability copy and footer changes byte-for-byte. Any other
price/chart/identity change is rejected; new hook tests must independently pass.

## Cost and package accounting before activation

Consumer payloads add approximately 97.0 MB uncompressed. Actual baseline tracked
public-file allowance measured 69,177 files / 1,473,790,783 bytes; this is a source
inventory, not the final built/compressed Pages package. The built release omits
canonical SEC/private state and uses the existing SEC budget. Actual deployment
package measurements must be recorded before claiming final size.

A complete generation has 5,414 assets. Six full writes/day would be 32,484 asset
writes/day (974,520/month), plus pointers/manifests/private checkpoint operations.
Four retained consumer slots use approximately 0.388 GB. R2 Standard list-price
incremental storage is about $0.006/month; approximately $4.39/month Class A if
all those writes fall outside the account's shared free allowance. Existing
account-wide storage/free allowance are unknown. Class B readback and Pages
staging are counted separately in final operational evidence. These are bounded
projections, not an account invoice or a claim that unrelated R2 usage is free.

Public-repository standard Linux Actions has no incremental runner charge under
GitHub's public-repository policy; runner minutes still matter and must be
measured from successful complete refresh + Pages runs. Initial full browser
acceptance is separate from the bounded canary/delta QA on routine refreshes.
No paid provider, AI, Codex or ChatGPT runtime participates in unattended work.
