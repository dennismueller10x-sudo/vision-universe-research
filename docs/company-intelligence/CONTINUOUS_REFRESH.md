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
   bootstrap from the exact accepted additive checkpoint, SHA-256
   `6977c191d5c6956e1fabec5512c7cd48e62ec6d2cf156ace7c87a7c601d41413`.
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

Private state uses `continuous-top46-v1`. Consumer GOOD uses
`continuous-discover-top46-v1`; two bounded payload namespaces with two slots each
keep both current and previous QA-approved generations intact even across repeated
failed candidates. Original accepted and previous fixed production namespaces
remain untouched. Isolated acceptance uses separate `verify-continuous-*` names.
GitHub serializes each writer. Optimistic pointer checks reject unexpected concurrent
changes; this is not a claim of distributed conditional-write/CAS support.

## Cadence, incremental work and source failures

News and SEC: every four hours. Events/calls: eight hours. Financials: eight hours
using the existing SEC consumer outputs; materials: 24 hours. Profiles are retained
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

Pending authenticated runner IDs, actual publication and measured run costs.
Do not infer these from local fixtures. Storage failure, consumer integrity
failure, QA candidate rejection and pointer-readback compensation have local
contract tests; authenticated persistence and autonomous runs require Actions.

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
