# Full universe eligibility rollout

## Release state

Implementation was merged in PR #561 (22979028978710e32f85e6ea4f79cf99503206ba),
with release fixes in #569 (1ed3e6ba403f241d073a11b696c5773afd37d185) and
#570 (307899a8f3fa62f9113eabf9f94af867d9f0542b), plus batch/rollback correction
#572 (0e4f52a465f11a1cfcccb8b2eda57662957e98ae). Configuration is armed; a missing durable activation receipt still selects
only the legacy scope. No full-universe production activation has occurred. The live 46-stock,
45-issuer scope remains the rollback baseline. The full structural and representative candidate acceptance below has passed.
It is not yet published coverage; authenticated scaling passed; main release and production readback remain
required.

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

Eligible: **4,789 issuers / 5,088 current securities**, comprising 1,356 FULL and
3,433 PARTIAL. Private ineligible: **331**: mapping 2; source policy 97; no safe
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
| Documents | 1,793 | 37.44% |

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
must be preserved and read back. Run 38041905817 completed this prerequisite:
namespace `eligible-rollback-top46-v1`, generation `71dc0485476cfa74e59f7fc3`.
The same run stopped before activation because the fresh public downloader
correctly omitted the private validation manifest. PR #570 restores that
authenticated certificate into the private runner only. Full release rerun
38045412547 passed the two CURRENT restores and 239 candidate cases, then was
stopped before wide deployment after revealing quadratic manifest parsing in
the full batch download. Actual rollback probe 38047258333 caught the same
private-manifest omission in the rollback path. PR #572 fixes both; actual rollback run 38048270238 passed. No successful wide production
readback is asserted here.

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
no consumer was published. The corrected run 38037972935 subsequently passed all stages.

At that measured throughput, an initial 5,266-source backlog is substantial
(5,185 deferred); a four-hour runner does not provide universal four-hour source
freshness. Oldest-first tier rotation avoids starvation, but effective source
latency must be observed after several actual runs. No concurrency increase or
polling-cadence expansion is hidden in this rollout.

Corrected authenticated run [38037972935](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38037972935)
passed: source engine 724.399s; complete restore/poll/backup/fresh restore/browser/
consumer R2 commit 1,497s (25 rounded runner minutes before setup and production
Pages wait). 116 canary/delta mobile/dark/light cases passed. It preserved a richer
5,122-payload derivative in an isolated verification namespace, with SHA-256
055b51495984b3be05a21101f8dc02a129f9950c9c56e73cff9f178035dab0bc, and freshly
reproduced every consumer byte. Production CURRENT was not replaced. The
published isolated consumer had 4,790 issuers / 5,089 securities, 5,415 uploaded
objects / 97,157,434 bytes, generation 5e674257d43c97649380ef2a. These richer
probe numbers are not the initial production coverage. Source requests: 219.

The existing production refresh job now allows 60 minutes, because the measured
25-minute complete engine/storage/browser pipeline must also wait for Pages and
verify live data. This extends deadline headroom, not source budgets or cadence.
Actual deployed full-eligible package size remains a release readback requirement.
The legacy-scope production package measured 74,091 files / 1,495,070,009 bytes
on code 0a51b74d2895b9db5f8fa59454ba42fe37213498. Do not reuse the small-cohort
5,040-minute projection as full-universe evidence. Isolated scaling acceptance
passed; actual wide-scope production acceptance is pending.

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
   isolated consumer R2 publication/readback passed. Immutable 46 rollback
   freeze/readback passed in run 38041905817. Actual
   production activation and readback remain pending; do not claim launch before they pass.

Operator per-issuer disable: add the exact existing issuer ID to
`universe-rollout.json.disabledIssuers`, validate and release. Only that issuer
becomes INELIGIBLE_OTHER/OPERATOR_DISABLED; its private state is retained.
Malformed IDs fail configuration validation. Global rollback: run main's
`company-intelligence-universe-release.yml` in rollback mode, which verifies the
immutable 46-scope consumer, restores its GOOD pointer and dispatches existing
Pages. The existing Company Intelligence global OFF path remains available.

Required product regressions retain their assertions. Historical Core news fixture
failures (SPCX/TMUS/VZ/T, DVN/CRGY, SLYG) reproduced on baseline 440a1645 with eight
byte-identical inputs; proof is in `evidence/full-universe-20261010/core-baseline.json`.
Those fixtures were independently repaired in main's PR #564. The release
operations PR #570 passed current Core, Company Intelligence, Currency, CI
Config and Pages checks. Its final head was 7d93a80d0552870b1b2ded398528dce248158b4f,
current with main cdfb24cb368b4707240bf397e4525de77ac13038. Vercel's separate
build-rate-limit failure is infrastructure evidence, not a passing build;
the production Pages package check passed.
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

For the measured full pipeline, 25 minutes × 180 monthly cycles is **4,500
runner minutes/month before setup, Pages wait, live QA and the separate Pages
runner**. This is a single complete scaling observation, not a multi-run average.
Do not report 4,500 as total operating cost. Final initial production timings will
supply the separately measured deployment/readback components.

Public-repository standard Linux Actions has no incremental runner charge under
GitHub's public-repository policy; runner minutes still matter and must be
measured from successful complete refresh + Pages runs. Initial full browser
acceptance is separate from the bounded canary/delta QA on routine refreshes.
No paid provider, AI, Codex or ChatGPT runtime participates in unattended work.

Of the eligible current-state issuers, 865 have exactly one safe module, including
841 financial-only and one profile-only issuer (ACU). ACU and real financial-only
issuers are included in the sampled browser acceptance. Manual review of the 20
seeded ineligible decisions found 17 with no meaningful safe content and three
with source-policy exclusions and no remaining supported KPI/module (APLM,
SCTX, ARCL). Their actual browser cases require zero CI requests. No ineligible
sample was promoted merely to improve a coverage number.

## Release operations corrections and cache acceptance

Run 38040630788 stopped before R2 writes because the new workflow lacked
PYTHONPATH=scripts; PR #569 corrected it after 23 Python and 97 Node contracts,
110 Core tests and 340 Discover tests (four existing optional skips) passed.

Run 38041905817 passed the new CURRENT restores and all 239 browser cases, froze
the verified 46-scope rollback and uploaded/hash-read the entire full consumer.
Activation remained false: its final contract expected a manifest that the
public downloader intentionally excludes. The manifest is now reattached from
verified GOOD only in the private runner proof directory; it is never a public
asset. Private operational state was not modified by either release attempt.

The existing Pages five-minute market-hours cadence must be included in costs.
It can produce 2,376 scheduled builds over 22 nine-hour trading days, plus other
existing triggers. Reading 10,827 retained consumer objects on each rebuild
would add approximately 25.7 million R2 Class B requests/month unnecessarily.

A derivative GitHub Actions cache now uses exact current/previous consumer
generations and source policy. Each build still reads authoritative R2 gate/GOOD
and runs the original hashes, schema, expiry and atomic pointer checks. Swapped,
corrupt, missing-generation and external-symlink bytes fall back to R2. Only
hash-listed public JSON is cached; manifests, validation certificates, private
extras, ledger and checkpoints are excluded. An active full scope with missing
GOOD cannot silently use the smaller bootstrap. Warm acceptance before gate
activation requires all current assets served from verified cache and at most
one previous-index asset read from R2. Actual metrics remain release evidence.

Six changing generations/day require cold cache population; unchanged general
Pages builds reuse prepared bytes. At approximately 5,414 objects × two retained
generations × 180 monthly cache misses, cold Pages reads are about 1.95 million
Class B requests, plus authoritative pointer reads, rather than 25.7 million.
Routine source publication itself remains measured/accounted separately. Cache
storage contains compressed public consumer derivatives and uses the existing
GitHub cache allowance; no new service/provider is introduced.

The exact Master-hook protected-path test uses the immutable accepted f667d826
example against 440a1645. Later independent Europe renderer changes do not
broaden that exception; every negative price/identity/extra-code assertion stays
intact. Actual branch protection still compares current candidate/base files.

## Final scaling review: linear batch validation

The first full retained-generation cache round trip exposed a remaining CPU
problem: the pinned manifest bytes were parsed and the complete issuer/asset
inventory validated for every individual object. That was quadratic work even
when all file bytes were cached. Release 38045412547 was cancelled before wide
Pages deployment. Its sanitized audit again reproduced CURRENT
`dd958f61bebd9e538f5df279`, 5,120 payloads, generation
`0b6d943ef120d39a93e2b96f`, and all 239 candidate cases passed. These are not live
coverage claims. The private state was not modified.

PR #572 parses/validates each pinned manifest once. Every asset still receives
the same expiry, generation-bound allowed-path, byte-limit and SHA-256 checks;
the pointer is reread before any output write. The single-object API is
unchanged. All 105 Node contracts passed, including a synthetic 5,120-issuer
batch: all 5,121 objects hash-read, one manifest parse, zero private reads.
The latest local full-suite batch took under eight seconds; isolated runs varied
with filesystem load. This is a test of copying complexity, not an R2/network
or real dataset benchmark. Corruption, future/expired timestamps, retained
previous generations and concurrent-pointer changes remain rejection cases.

The actual rollback probe additionally found the private certificate missing in
restore46(). The same authenticated-manifest reattachment is now applied there,
inside the private runner only. Run 38048270238 must prove the real rollback and
production legacy cohort before another activation. Scheduler, source policy,
entity/financial gates and authoritative private state were not changed.

## Final sparse evidence review and latest candidate

Read-only audit [38049825233](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38049825233), code 492a5b3d890ac5a8bbdd75265ed02c21969f3fd8, again restored CURRENT twice without writes. It passed all 5,414 asset contracts and 239 browser cases. Candidate generation 889f00c2b28486d776a8a223, 96,952,850 bytes; eligible count remains 4,789 / 5,088 securities. The latest FULL/PARTIAL and document counts above supersede the earlier candidate counts; underlying private state and policy are unchanged.

Review of document-only issuers found generic IR document-library links consuming consumer space. PR #573 excludes 126 such links across 117 issuers, without excluding any additional issuer. Specific reports remain eligible. Imperial Oil's original 2025 Form 10-K was opened and its issuer verified; document-only cards now show the report/year, publication-date uncertainty and original link. No unsupported fiscal year is guessed.

Actual production rollback [38048270238](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38048270238) succeeded: immutable 46-stock generation 71dc0485476cfa74e59f7fc3 restored, all 86 public assets verified and 16 actual production mobile/desktop cases passed. Private state was unchanged. The frozen payload retains the existing seven-day freshness limit; an older emergency rollback must use the persistent global OFF path rather than bypass expiry.

A release attempt exposed quadratic manifest validation during batch R2 download. PR #572 validates each manifest once, then preserves per-object size/hash/path/generation checks. A 5,120-issuer fixture proves one parse and exactly 5,124 reads; expiry/corruption and disabled-output assertions remain. This fixture is a reader complexity test, not private-data coverage evidence.

The caller workflow verification 38049826974 covered only the legacy 46-stock scope and is not full-universe scaling acceptance. Direct full-universe isolated verification 38052669901 passed; it did not advance production CURRENT. Final production readback remains required before claiming full activation.

## Verified cache, release time budget and cancellation recovery

Run 38052669901 passed current full-source acceptance: 137 first-party plus 83 SEC requests; 83 sources and 80 regulator issuers checked. Engine 723.595 seconds, entire isolated pipeline 1,564 seconds before production Pages/live QA. All 5,415 consumer objects and 116 browser cases passed; the 5,122-payload derivative and consumer 44d15587358ea8739ff83a76 remain isolated and are not production coverage.

Release 38054443902 passed two CURRENT restores, 239 candidate browser cases, full R2 consumer readback and the exact cached downloader: 10,827 cached assets and one remote previous-index asset. Consumer 5e377973471f23e3ddbcb535, private state dd958f61bebd9e538f5df279 unchanged. Its activation pointer was written before cancellation; it did not complete production QA. The associated Pages build 38056495026 was cancelled and actual production remained 46 / 45. Manual rollback 38056559970 succeeded and reverified actual legacy production. The candidate/certificate remains preserved for diagnosis.

The measured R2 phase left insufficient reserve in the original 60-minute initial release job for Pages, the broad live matrix and rollback. PR #574 provides 120-minute initial release/rollback headroom and includes cancellation in the existing post-activation recovery condition. Continuous refresh retains its 60-minute ceiling, fixed source budgets and cadence. Fresh main release 38057137465 is pending; this is not a publication claim.

## Production navigation regression and safe recovery

Release 38057137465 passed two authoritative CURRENT restores, all 5,414 assets, 239 candidate browser cases, full R2 readback and 10,827 verified cached assets plus one remote previous-index asset. Its candidate was 8593d0e006012ebc19e99180. The Pages production smoke rejected the back/forward case before deployment: disposing the newly eligible PRI view aborted its same-origin prepared payload request. The old fixed cohort had not requested intelligence for that stock. No smoke assertion was weakened.

The release's automatic post-activation failure handler succeeded, restoring immutable generation 71dc0485476cfa74e59f7fc3, 46 stocks /45 issuers. Private CURRENT was unchanged. Actual production HTTP readback verified the old generation after recovery.

PR #576 detaches obsolete UI subscribers, preserving the existing ten-second deadline and preventing late issuer responses from changing the next view. A real browser component regression fails against the original renderer and passes against the fix: no navigation-induced abort, no late issuer mutation, deliberate timeout fails closed. All 106 Node and 25 universe Python tests pass. The production smoke is unchanged. This local component fixture is not coverage/ledger evidence.

Local shell GitHub authentication expired during the release. The already-authorized GitHub app remains authenticated and preserves branches/commits/PRs without exposing or obtaining secrets. Vercel's preview build-rate-limit status is independently classified; the production deployment target remains GitHub Pages and its tests are required.
