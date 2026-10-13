# Company Intelligence: first-party source coverage and scheduler

Evidence is split by date and execution type. A manual isolated runner is not
evidence of a scheduled production refresh. This document does not treat old
coverage reports as current measurements.

## Current state and audit receipts

The authoritative operational database is the full private state in R2. It is
restored by the existing checkpoint/SQLite mechanism; this repository contains
neither that ledger nor its HTTP cache. On 13 October 2026, isolated full-scope
workflow run [38404464807](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38404464807)
completed successfully with a fresh R2 restore, full-universe validation,
consumer reproduction, and isolated consumer generation
`bf96437a3072bdd43213352e`. It was `workflow_dispatch` with verification enabled;
it did not publish production. The artifact service returned HTTP `403 Forbidden`
for its aggregate health artifact, so this run does not provide source counts in
this checkout. Do not infer those counts from its consumer generation.

The latest committed full-universe registry baseline is the audit recorded in
[`FULL_UNIVERSE_ROLLOUT.md`](FULL_UNIVERSE_ROLLOUT.md), measured on 10 October:
5,384 registry rows, 5,355 active approved rows, and 2,014 issuer identities
with proven pollable first-party coverage. Its separate source-queue run on 12
October (`38237224448`, manual isolated dispatch) observed 5,351 approved
active sources, 5,260 due and 5,180 deferred, with 140 public and 84 SEC
requests, 80 source checks, and 724.553 seconds engine runtime. This is a dated
backlog observation, not a current count or an all-source freshness guarantee.
The 12 October age report recorded 5,175 due sources, 3,724 successful checks
older than seven days, 188 never-proven rows, median last-success age 174.29h,
p95 197.63h, and maximum 204.29h. These are historical measurements and must
not be added to the 10 October counts.

## Source classes and source-safety boundary

The poll queue accepts active sources only when issuer identity is resolved,
the source is first-party for that issuer, the endpoint has one owner, and the
URL is not a publisher. The existing consumer policy remains
`OWNED_IR_SEC_METADATA_PREVIEW_V1`. SEC polling uses filing/submission metadata
and the existing supported financial projection; it does not republish filing
bodies. Public consumer output contains approved headlines, dates, original
links and deterministic Vision Universe classifications, not full third-party
article bodies.

Aggregate source states remain distinct: healthy news/event/material source,
registered but not yet repeat-proven, stale, temporary failure, robots blocked,
HTTP 403 unclassified, rate limited, auth required, parse failure, removed,
ownership unclear, policy blocked, or inactive. An HTTP 403 alone does not
prove robots disallowance, a WAF, user-agent filtering, or a GitHub IP block.
`ROBOTS_UNAVAILABLE:HTTP_403` means the robots-policy request itself failed; it
does not authorize fetching the source. An explicit `ROBOTS_DISALLOWED` is a
deterministic block. No robots bypass, proxy, alternate publisher, or broader
source license is used.

PayPal and Intellia remain mandatory canaries. The latest accepted source review
reports PayPal's official IR root as owner-verified, but no durable pollable
news source: a separately probed official RSS was not promoted after native
GitHub Actions robots checks returned 403. Its accepted live news count was
zero; the temporary probe is not a production source registration. Intellia
retains ten accepted news items and two historically proven owned sources, but
current GitHub Actions polling has returned `ROBOTS_UNAVAILABLE:HTTP_403`.
An authorized native `PublicHTTP` read on 12 October passed robots and fetched
the registered Intellia feed; that proves access from that workspace only, not
from GitHub runners. The existing first-party review is in
[`profiles-sources/GERMAN_PROFILES_AND_FIRST_PARTY_SOURCES.md`](profiles-sources/GERMAN_PROFILES_AND_FIRST_PARTY_SOURCES.md).

## Queue order, fairness and adaptive intervals

The source queue is deterministic and source-centric. It does not rediscover
the universe during normal refresh. Within each lane it orders permanent
canaries first, then the oldest due time and last check. A weighted cyclic
pattern reserves work for current news, events, slow news, materials and
dormant sources. Deferred work retains its due time, so it is not moved behind
newer work on the next serialized run. A source-specific failure keeps its own
cooldown and cannot fail the whole runner. Explicit robots disallowance,
authentication failure and removed endpoints receive a long cooldown. A plain
HTTP 403 remains unclassified and receives bounded exponential backoff;
robots-fetch failures also back off without being mislabeled as confirmed
robots policy.

If at least 100 due sources are more than seven days overdue, the scheduler
switches to `BACKLOG_DRAIN`: it reserves a larger share for the oldest slow and
dormant lanes while keeping current news and events in every cycle. It returns
to `STEADY_STATE` automatically once that overdue threshold clears. Queue
deferrals remain checkpointed in the same R2 state; this adds no writer or
parallel shard.

After successful checks, unchanged responses increment a per-source counter;
a changed body resets it. Current canary news remains on a four-hour interval.
Other news is adapted as follows:

| Condition | Interval |
|---|---:|
| Recent/changed feed or fewer than 2 unchanged checks | 4h |
| 2–5 unchanged checks | 24h |
| 6–11 unchanged checks | 72h |
| 12+ unchanged checks | 120h |
| No news item in more than 90 days | 120h |
| Events after 3 unchanged checks | 24h (otherwise 8h) |
| Materials after 3 unchanged checks | 72h (otherwise 24h) |
| Materials after 8 unchanged checks | 120h |

These are target intervals, not promises that a large due queue is checked on
time. The audit reports overdue age buckets and p50/p90/p95/p99/max age per
source lane. If the observed p95 breaches a lane target, capacity is inadequate
and the queue must be remeasured; the system must not claim the SLO from its
configured interval alone.

The source-only public request limit remains 240 requests and 600 seconds per
refresh; SEC is separately limited to 110 requests and 240 seconds. Current
evidence showed only 80 sources checked in one full-scale isolated run despite
5,260 due, so increasing a nominal request limit alone would not establish
capacity. The measured runner minutes and actual per-run check/request counts
must drive later budget decisions. No polling cadence is raised globally.
On schedule runs with onboarding enabled, its isolated client adds its own cap
of up to 200 requests / 600 seconds; therefore the separate theoretical public
request ceiling is 440 per run, not 240. Both phases are individually bounded,
run serially, and report actual requests/runtime. This combined ceiling must be
reassessed from the first scheduled evidence before any further budget increase.

## Bounded source onboarding

The dedicated daily source-onboarding run uses the same production concurrency
group as refresh, so it cannot overlap a private-state writer. It advances at
most 100 existing issuer candidates, using recorded official-root candidates
and native ownership verification; there is no universe crawl. The per-batch
network bound is 200 requests and 600 seconds. All outcomes and the candidate
inventory are checkpointed in the same private SQLite state. The bound targets
the lower end of the 100–250 candidates/day design range without adding
onboarding work to all six four-hour refreshes.

A first successful fetch is recorded `PROVISIONAL`, not pollable. A later
successful scheduled fetch proves repeat pollability (whether the body is
unchanged or has new items); policy, owner, parser and identity gates still
apply. Only then can the source join normal approved polling and consumer
generation. Candidate failures are issuer-local and obey retry times. Unapproved
or unsupported sources remain hidden.

The scheduled onboarding batch uses the existing full private restore,
consumer validation, fresh restore, and protected production publication path.
It is a separate daily trigger but shares the refresh workflow's serialized
production writer lock. Manual `workflow_dispatch` runs do not count toward
source-cron proof. The daily candidate run ID reuses its private cursor for that
UTC day; successful and cooldown-protected issuers are skipped within that
batch. Newly registered sources remain provisional until a later regular
refresh proves a second successful poll.

## Conditional requests and no-change handling

ETag and Last-Modified conditional requests remain enabled. HTTP 304 is now
reported explicitly, updates successful-check freshness, and returns before
feed/material/calendar parsing. Byte-identical bodies also skip reprocessing.
This reduces parser and database work but not the HTTP request itself. The
consumer generation currently contains generation-time fields, so a no-source
delta cannot be assumed to produce byte-identical consumer assets. No Pages
deployment is skipped on an unverified semantic hash; a future no-change path
must compare canonical consumer-visible bytes while preserving staleness and
freshness semantics.

## Freshness, schedule and health evidence

The source schedule is `17 */4 * * *`; the separate onboarding schedule is
`47 3 * * *`; the independent read-only health schedule is `57 */4 * * *`. On
13 October, source schedule run `38334843465` completed
successfully at 02:58 UTC, including production publication. The next source
schedule run `38392637416` (11:47 UTC) failed in the restore/refresh/validate
step. Its logs and health artifact do not expose a more specific failure code
through the available CLI evidence; no cause is guessed. Isolated full-scope run
`38404464807` succeeded but was manual and did not change production.

Health run `38396788434` failed its own sparse checkout because the stock
renderer source was omitted. The health workflow now includes
`company-intelligence/ui` in its sparse checkout. This fix still needs a real
post-merge scheduled health run. A health implementation failure is not source
health evidence.

Source refresh artifacts and job summaries carry aggregate-only before/after
counts, age percentiles, source families, request/latency/304 measurements,
PayPal and Intellia status, and backlog lanes. The before sample is read-only;
the after sample follows bounded refresh. They contain no source URLs, titles, issuer
rows, operational state, or credentials. Artifact download from GitHub Actions
Storage returned `403 Forbidden` in this workspace; the same aggregates are
also emitted in the GitHub job log/summary for accessible evidence.

The audit groups source rows and due counts by dated size bucket and issuer
region. Size uses an existing dated USD close and reported shares, only for
single-listing common stock; ambiguous/missing cases stay in explicit withheld
groups. SEC business country is preferred for region, with listing country
fallback called out separately. These are QA buckets, not live market-cap or
headquarters claims.
The current refresh's requests, HTTP cache/304 counts, changed items, successful
source checks, and runtime are attached separately from the registry's last
known per-source request measurements; those two time scopes are not conflated.

## Cost and known capacity limits

A prior full source runner measured 28 rounded runner minutes before Pages wait
and live QA. Six runs/day × 30 days is 5,040 source-runner minutes/month at that
historical duration; Pages and live QA are separate. This is not an end-to-end
monthly invoice or a projection for changed generations. The repository uses
standard Linux GitHub-hosted runners; runner minutes are still tracked even if
the plan's incremental charge is zero. R2 storage/operation billing and shared
free-tier use are not visible from this workspace. There is no paid data or
AI-service dependency.

At current measured source throughput, the seven-day low-change age target may
still be unreachable if too many sources remain registered and due. The next
capacity decision must use a current R2-derived audit and an actual scheduled
run after this scheduler is deployed. Do not claim that backlog has drained or
that 30-day unattended freshness is proven until those observations pass.

## Failure behavior and rollback

Every production run restores current private GOOD, applies bounded work,
checkpoints to R2, reads back and restores fresh state, validates consumer
contracts, source policy and regression thresholds, and advances consumer GOOD
only after validation. A source outage is isolated. R2, state-integrity,
eligibility, consumer-schema or publication-safety failure retains last GOOD.
The existing production rollback and OFF gate remain the system-wide fallback;
a future bad source can be disabled individually through existing source/issuer
status without replacing the private universe with a public subset.

The public consumer contains only safe aggregate health and consumer payloads;
the ledger, source cache, ETags, checkpoints and per-source operational rows
stay private in R2.
