# Continuous production refresh — existing 46-stock cohort

Status: implementation under authenticated acceptance on 9 October 2026.
This document distinguishes implemented safeguards from observed production evidence.
The approved 46 stocks / 45 issuers remain unchanged. No discovery, publisher bodies,
AI inference, paid provider, or public operational ledger is part of the runner.

## Audit of the previous scheduler

`company-intelligence.yml` had `17 */4 * * *` (isolated backfill) and
`43 */4 * * *` (isolated pilot). Their variables and namespaces did not connect
them to the accepted full private state or the production consumer pointer. The
latest five scheduled runs inspected on 9 October were all skipped, including
37894824752: every job was skipped. Repository variable reads returned HTTP 403;
no enabled-variable claim is made. Production publication was dispatch-only and
bound to generation `6c3fb74e36086a0b86dfdf3b`.

Those legacy lanes remain available by dispatch; their cron triggers are removed.
The sole new production schedule is `company-intelligence-refresh.yml`, at 00:17,
04:17, 08:17, 12:17, 16:17, 20:17 UTC. In Berlin these are 02:17/06:17/10:17/
14:17/18:17/22:17 in summer and one hour earlier in winter. GitHub can delay cron. A separate read-only R2 health check runs at
`57 */4 * * *`; it neither polls sources nor changes publication pointers.

## State and publication lifecycle

1. Restore the complete current private R2 checkpoint. Only the first run may
   bootstrap from the exact certified additive checkpoint, SHA-256
   `4edc0e5f3323985c80ee6d2bee63179b25eca44632be1c8e3c8d7dd774330932`.
   There is no empty-database or smaller cohort-state fallback.
2. Pin the accepted identity master to `abbea154a90ffece598e494530eea38661a20a95`.
   Poll only existing approved cohort sources and SEC submissions metadata.
   Preserve the German profiles, newer financial periods and non-cohort content.
3. Export the full private universe (at least 5,120 companies), then filter the
   public consumer to the exact 45 issuers / 46 listings using the existing source
   policy. Inactive registry records can still authorize previously reviewed
   items: polling eligibility is distinct from permission to display an item.
4. Use the existing SQLite backup/checkpoint implementation. Upload, read back,
   independently restore in another empty directory, compare every table proof,
   source generation and all consumer bytes. No cache/artifact supplies authoritative state. The HTTP cache is itself part of
   the verified private checkpoint.
5. Validate contracts, scope, IDs, German profiles, units/periods, source safety
   and unexplained content loss. Run 16 real-Discover browser cases with routed
   candidate consumer assets; this is explicitly not proof of live publication.
6. Upload only consumer-safe assets; update the GOOD pointer last after readback.
   Deploy through the existing Pages pipeline and verify the actual served
   generation, gate, assets and 16 fast browser cases without interception.
   Ordinary market-data Pages releases retain their existing two-stock smoke
   test. They can renew publication evidence only for an already fully accepted
   generation; they defer a new generation to the refresh runner's 16-case QA.
   Full 368-case dark/light/viewport testing remains on structural changes.

Private state uses `continuous-top46-v1`. Consumer GOOD uses
`continuous-discover-top46-v1`; two bounded payload namespaces with two slots each
keep both current and previous QA-approved generations intact even across repeated
failed candidates. Original accepted and previous fixed production namespaces
remain untouched. Isolated acceptance uses separate `verify-continuous-*` names.
GitHub serializes each writer. Optimistic pointer checks reject unexpected concurrent
changes; this is not a claim of distributed conditional-write/CAS support.

## Cadence, incremental work and source failures

News and SEC: every four hours. Events/calls: eight hours. Financials: event-driven SEC company-facts refresh for an unseen periodic
10-Q/10-K/20-F/40-F filing (including amendments), plus local projection every
eight hours; materials: 24 hours. The previous compact financial output was
built by a weekly bulk lane, so merely rereading it every eight hours would not
have refreshed new filings. The new bounded path uses the existing SEC SDK,
metric registry and financial consumer builder; it never rewrites Quant inputs.
At most 20 facts requests are attempted per run, with oldest attempts first.
Lagging SEC facts, missing metrics or a wrong issuer retain the previous figures
and retry next run. Successful filing accession cursors survive R2 restoration.
TK, VEON, XPEV and ARBE retain honest stale labels until supported facts improve. Profiles are retained
and prospective changed source fragments kept privately for a later editorial
review, without runtime translation. No recurring universe discovery or backfill.

Existing ETag/Last-Modified HTTP cache, 304 reuse, item identities, deduplication,
SEC time limits, source cooldowns and per-host pacing remain in use. A run has a
240-request/600-second public budget and 110-request/240-second SEC budget. Sources
deferred by budgets remain due for a subsequent run. Empty/failed sources retain
existing intelligence. Outcomes distinguish SUCCESS, NO_CHANGE, RATE_LIMITED,
POLICY_REJECTED, TEMPORARY_FAILURE, SOURCE_REMOVED and PARSE_FAILURE.
The accepted registry has 105 eligible active sources: 36 news feeds for 35
issuers, 28 event sources for 23 issuers and 41 material sources for 21 issuers
(36 distinct issuers overall). Nine reviewed article-only entries are inactive.
At configured cadences the theoretical maximum is 341 endpoint checks/day plus
270 SEC issuer checks/day, before cooldowns, conditional reuse and budgets.
Some approved article-only registry entries (including Tesla's existing item) are
not pollable feeds. The schedule does not claim to discover new pages from them.

## Health and observability

Private refresh, consumer build/commit and actual production publication have
separate success timestamps. An attempt is never a successful refresh. No-change
responses count as successful checks. Age over eight hours is WARNING; over twelve
hours or missing successful evidence is CRITICAL. The health artifact records
aggregate source/request/outcome counts, changes, duration, generation and failure
stage. Operational rows, source URLs, checkpoints and credentials stay private.
Critical pipeline failures make Actions red and leave a readable job summary.
Actual publication is recorded only after live QA; a consumer R2 commit alone is
not called a successful production publication. Public refresh metadata redacts
the private checkpoint certificate and all operational namespaces.

## Configuration and rollback

The committed approved config enables the bounded pipeline on main. Optional
repository variable `COMPANY_INTELLIGENCE_REFRESH_ENABLED=false` stops new runs.
No secret is requested in chat; existing R2, bucket privacy and Research gate
secrets are reused by Actions only. Verification dispatches cannot publish on main.

Immediate consumer OFF, retaining ordinary Discover/Quant:

```
gh workflow run company-intelligence.yml --ref main -f production_release=disable
gh workflow run pages-release.yml --ref main -f company_intelligence_off=true
```

For a failed refresh candidate, do not advance GOOD. To restore the previous
GOOD consumer, run `node scripts/company_intelligence/refresh-run.mjs rollback`
in an authorized R2-bound runner, then use the existing Pages deployment. A Pages
live-QA failure first reverts GOOD and then applies the proven OFF gate. This
prevents prolonged debugging on materially broken live pages. Retain failure
health and immutable previous generations for diagnosis.

## Acceptance and cost evidence

Authenticated isolated acceptance (not actual production publication):

| Run | Result | Evidence |
| --- | --- | --- |
| 37953911598 | Candidate QA rejected; live baseline retained | 105 sources checked; 136 public + 45 SEC requests; 81 successful, 22 policy-rejected, 2 temporary source failures; 83 new raw NEWS items; full 5,120-company checkpoint uploaded/read back/fresh-restored; HTTP 304 observed |
| 37956392193 | Persisted nullable cooldown exposed, then fixed | No consumer publication; prior private state retained |
| 37956969955 | Full isolated path passed | Fresh runner restored the accumulated update; 0 feed requests before due time, 45 SEC checks, 0 new items; full private restore and 16 browser cases passed |
| 37958284412 | Independent full isolated repetition passed | Restored generation `201b10e4dba359db2cd9f711`; advanced to `4b5f882a1d90b90755e3a391`; consumer `c7635542f6ea0d119e5dd867`; 45 profiles, 314 news records across 42 issuers; 0 feed requests/45 SEC checks, no new filings, all 46 contracts/16 browser cases passed |

The first caught-up private checkpoint was 31,141,867 bytes; the repeated
checkpoint was 31,141,796 bytes and consumer assets 2,068,905 bytes (86 objects).
Repeated refresh engine times were 57–58 seconds; complete state/export/candidate
QA/consumer commitment took 250–281 seconds, before workflow setup or actual
Pages deployment/live QA. Initial source catch-up took 747 seconds and is not a
steady-state monthly runtime estimate. Production evidence must be appended only
after the main workflow actually deploys and verifies its served generation.

Four controlled failure classes are covered: actual parser/source unavailability
continues another source while preserving old records; invalid consumer content
is rejected; simulated R2 writes/readback failures retain/compensate GOOD; rejected
QA candidates preserve current and previous GOOD slots across repeated attempts.
The authenticated first candidate rejection independently demonstrated that a
fresh private-state update cannot publish an unaccepted consumer to production.

Relevant refresh tests: seven Node storage/publication/SLO/longevity contracts and seven
Python parser/isolation/financial-cursor contracts. Existing Company Intelligence,
SEC/Quant, release and product regression suites remain required. No assertions
were weakened. Core CI's pre-existing invalid-news-symbol assertion was reproduced
on production SHA `5d6aa260558fdd0422d07b26038cc383142c86ee` and this branch:
`SPCX / TMUS / VZ / T`, `DVN / CRGY`, and `SLYG` are not master security IDs.
The Vercel integration separately reported a build-rate limit; actual Research
production uses the existing Cloudflare Pages workflow, not that preview.

Cost model: six runs/day, approximately 180 runs/30 days. Monthly runner minutes
are 180 times the measured refresh + deployment + fast-QA duration, separately
from existing market-data/Pages activity. The repository is public; standard
Linux Actions has no incremental billed-minute charge under the existing plan.
R2 operation/storage estimates must use measured run counts/bytes and current
pricing/free tier, not a pilot extrapolation to the entire private universe.

## Three substantive reviews

Autonomy: restore, source update, validation, durable state, Pages dispatch and
live verification are executable by Actions without Codex or AI.
Failure safety: exact full bootstrap, source isolation, fresh restore, scope/policy
contracts, bounded protected slots, pointer-last and emergency OFF are retained.
Regression review: SG1 independently reproduced on current production SHA
`5d6aa260558fdd0422d07b26038cc383142c86ee` at the same assertion (0 versus 1
screener-eligible stocks). Its September-8 fixture crossed the 30-day active
boundary. No test or protected runtime input was changed. Full-suite independent
parity remains mandatory, including the five previously classified price-data
failures.

Cost/scalability: only the existing cohort is polled; incremental HTTP and separate
cadences avoid discovery, 5,120-company crawls and full mobile matrices every run.

## Required existing credentials and emergency controls

Actions reuses `VU_HISTORY_S3_ENDPOINT`, `VU_HISTORY_S3_BUCKET`,
`VU_HISTORY_S3_ACCESS_KEY_ID`, `VU_HISTORY_S3_SECRET_ACCESS_KEY` and optional
`VU_HISTORY_S3_REGION`. Bucket privacy verification and Pages use the existing
Cloudflare token fallback (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_TOKEN`,
`CF_API_TOKEN`, `CLOUDFLARE_API`); protected browser QA uses
`RESEARCH_ACCESS_PASSWORD`. `GITHUB_TOKEN` requires Actions write to dispatch the
existing Pages workflow. Values are never stored in public evidence.

`continuous-refresh.json.enabled=true` is the scoped production approval; the
optional repository variable `COMPANY_INTELLIGENCE_REFRESH_ENABLED=false` stops
refresh writers. The previous `COMPANY_INTELLIGENCE_ENABLED`,
`COMPANY_INTELLIGENCE_STATE_READY`, `COMPANY_INTELLIGENCE_PILOT_ENABLED` and
public-pilot namespace variables are not prerequisites for this new lane. The
existing production release gate remains mandatory and can be switched OFF by
the two commands above. No production cohort or access-control expansion occurs.

To diagnose: inspect the failed Actions job summary's failure stage, then the
aggregate health artifact and candidate/live QA result. Source failures and
cursors remain in the private checkpoint; never post those rows as a public
artifact. RESTORE/R2/FRESH_READBACK/CONTRACT/CANDIDATE failures retain the served
snapshot. A material actual live-QA failure reverts GOOD and applies emergency
OFF. After correcting code, rerun the scoped workflow and require actual live QA
before marking recovery successful.

## Scaling review (no expansion authorized)

The same deterministic adapters, per-source due cursors, request budgets and
pointer-last publisher can later support larger approved cohorts. Budgets defer
work rather than crawl history. At 100/500/5,000 issuers, measured source cost and
freshness must determine approved sharding and independent queue budgets; the
current 45-issuer timings are not evidence that a 5,000-issuer SLO or cost passes.
Only a consolidated consumer publication may advance GOOD. No larger cohort is
enabled by this implementation.

## Certified production bootstrap

Authenticated verification run 37958494017 produced immutable private namespace
`continuous-bootstrap-4edc0e5f3323985c80ee6d2b`, checkpoint SHA-256
`4edc0e5f3323985c80ee6d2bee63179b25eca44632be1c8e3c8d7dd774330932`, private generation
`47850e8e655d07b900b15a62`. Upload and independent readback passed; a fresh
restore reproduced all table proofs and all 86 consumer assets. This preserves
the 83 newly accumulated raw news records and durable cursors from earlier
verification runners. The original accepted state and fixed production baseline
remain untouched. All 46 contracts and 16 candidate browser cases passed.

Longevity review found and corrected an unconditional fixed-bootstrap consumer
download in Pages staging. Rolling GOOD is now preferred; only a genuinely
missing GOOD falls back to the fixed consumer. A day-30 contract forbids reads
of the expired fixed consumer while a fresh rolling GOOD is available, and
checks the staged generation and rollout binding. The legacy gate remains
required, preserving the existing emergency OFF path.

Full structural acceptance has an independent read-only dispatch lane:
`gh workflow run company-intelligence.yml --ref main -f continuous_refresh=full-qa`.
It reuses protected hydration, real-Discover/Quant and 368-case V2 browser tests.
It has no cron, R2 credentials, source polling, publication or gate mutation.
This closes the observed pending-Pages eviction by market-data workflow runs
(37966408643 was cancelled before any job started).
