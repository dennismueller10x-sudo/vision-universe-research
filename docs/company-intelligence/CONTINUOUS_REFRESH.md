# Continuous production refresh — existing 46-stock cohort

Status: two independent autonomous main production runs and full live acceptance passed on 9 October 2026; the first new cron trigger has not yet been observed.
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

### Health-Semantik (Stand PR D)

Der read-only Health-Lauf (`refresh-run.mjs health`, Workflow
`company-intelligence-health.yml`) liest GOOD-Zeiger, `observed.json` und den
Produktions-Gate (`gate.json`, derselbe R2-Treiber, nur GET) und fragt die
ausgelieferte `company-intelligence-delivery.json` per GET ab. Keine Provider-,
Schreib- oder Gate-Zugriffe.

`productionState`, strikt in dieser Reihenfolge der Beweislast:

| Zustand | Bedingung | Wirkung |
|---|---|---|
| `VERIFIED` | Auslieferung lesbar, Generation/Umfang = GOOD = akzeptierte Beobachtung | Publikations-SLO nach Alter |
| `MISMATCH` | Auslieferung lesbar, aber andere Generation/anderer Umfang | CRITICAL |
| `GATE_CLOSED` | `delivery.json` ist HTTP **404** UND `gate.json` wurde fehlerfrei gelesen, ist für diese Freigabe gültig (Schema, `approvalId`, `generation`) UND `state==DISABLED` | bewusst aus, `publicationSLO=OFF`, kein Alarm |
| `UNAVAILABLE` | alles andere: HTTP 4xx/5xx, Timeout, Netzfehler, HTML/Passwortseite, Gate-Lesefehler/-fehlend/-ungültig, Gate `AVAILABLE`/`STAGED` bei fehlender Lieferung | CRITICAL |

`productionReason` nennt den Grund (z. B. `DELIVERY_HTTP_500`, `DELIVERY_TIMEOUT`,
`DELIVERY_NOT_JSON`, `DELIVERY_MISSING_GATE_AVAILABLE`,
`DELIVERY_MISSING_GATE_READ_FAILED`); `gateState` ist `AVAILABLE|DISABLED|STAGED|null`.
Im Zweifel bleibt es ein Ausfall.

Gesamtstatus und Exit-Code:

| `status` | Bedingung | Exit |
|---|---|---|
| `HEALTHY` | alle drei SLOs HEALTHY | 0 |
| `WARNING` | ein SLO älter als 8 h | 0 (`::warning::`) |
| `OFF` | `GATE_CLOSED` und Refresh-/Build-SLO HEALTHY | 0 (`::notice::`) |
| `CRITICAL` | ein SLO älter als 12 h/fehlend, `UNAVAILABLE`, `MISMATCH` | 1 |
| Absturz des Checks | Exception, fehlende Secrets, ENOENT/Importfehler | 2 (`::error::health crashed`) |

Bewusst AUS ist kein Alarm, wird aber nie als `HEALTHY` gemeldet. Die Frische von
Refresh und Consumer-Build wird im Zustand OFF unverändert bewertet (WARNING/CRITICAL
bleiben möglich); nur das Publikations-SLO entfällt, weil nichts ausgeliefert werden
soll. Die Schwellen 8 h WARNING / 12 h CRITICAL sind unverändert und in
`refresh-approval.mjs#freshness` fest verdrahtet. `warningHours`/`criticalHours` in
`company-intelligence/config/continuous-refresh.json` werden nicht gelesen, sie
dokumentieren nur dieselben Werte (Änderung dort wirkt nicht). Der Workflow ordnet
Exit 1 ohne Verdikt-Datei (z. B. Node-Importfehler durch Sparse-Checkout) als Absturz
(Exit 2) ein, nicht als Datenausfall.

Felder der Health-Ausgabe:

- `lastSuccessfulGoodRefresh`: Zeitpunkt des letzten erfolgreichen Refresh laut GOOD-Zeiger
  (`health.lastSuccessfulRefresh`). `lastSuccessfulPrivateRefresh` ist ein veralteter
  Alias mit identischem Wert (der Name war irreführend; der Wert stammt nicht aus dem
  privaten Ledger `latest-run.json`, das nur im privaten Checkpoint-Archiv liegt und
  ohne Zugriff auf privaten Zustand nicht lesbar ist, daher bewusst kein eigenes Feld).
  Die in GOOD veröffentlichte Metadatei `company-intelligence-refresh.json` behält
  ihren Schlüssel `lastSuccessfulPrivateRefresh` (Vertrag mit `release-health.mjs`).
- `goodDataAgeHours`, `consumerBuildAgeHours`, `deliveryVerifiedAgeHours`.
- `lastSuccessfulProductionPublication` belegt "Auslieferung gegen GOOD verifiziert"
  (jeder Pages-Deploy mit `observe --same-generation-only` stempelt neu), **nicht**
  "neue Daten". Das Alter der Daten zeigt `goodDataAgeHours`.
- `failureStage`/`failureCode`: nur aus `good.health`, falls dort vorhanden, sonst
  `null` mit `failureSource=NOT_RECORDED_IN_GOOD_HEALTH`. Fehlgeschlagene Läufe
  committen GOOD nicht; Stufe und Code des letzten Laufs stehen im `health.json`
  des Refresh-Laufs.
- `gateState`, `productionReason`, `exitCode`.

Run-eigener `refreshSLO` im Refresh-Report: `runSLO()` setzt ihn nur dann nach
Alter von `health.lastSuccessfulRefresh` fest, wenn der Lauf `SUCCESS` war, kein
`failureStage` hat und `published:true`, `retainedLastGood:false` ist. Jeder andere
Lauf ist `CRITICAL` mit `failureCode` und `runSucceeded:false`. Vorher bewertete der
Report einen Zeitstempel, den die Engine im selben Lauf auf "jetzt" setzt, und war bei
`PIPELINE_FAILURE` trotzdem `HEALTHY`.

Bekannte Grenze: `continuous_refresh.py` setzt `lastSuccessfulRefresh` schon bei
einer einzigen erfolgreichen Quelle. Eine strengere Definition ("alle Pflichtspuren")
gehört in die Python-Engine und ist hier nicht geändert.

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

Relevant refresh tests: eight Node storage/publication/SLO/longevity/hydration contracts and seven
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


## Observed production acceptance, 9 October 2026

The production implementation was merged as PR #548, merge
`d6be3635678669f666e6fceac9bb25c4ccb25c42`. The live product remains protected at
https://research.visionuniverse.de/discover/#/s/US_REAL/TSLA .
No opt-in query or replacement application is required after unlocking Research.

Production run 1, [37963602683](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37963602683),
passed on a clean main runner. It restored certified full generation
`47850e8e655d07b900b15a62`, preserved all 5,120 private consumer companies, advanced
private generation to `46f7fdd7d385681b90d7b885`, uploaded/read back checkpoint
`442a74848f1a51a00d7086c62d454c9578b2cb4dd56ac301e1e2b89630940ff9`
(31,141,602 bytes), and freshly reproduced all table proofs and 86 consumer assets.
The fixed consumer retained 45 German profiles, 314 NEWS records across 42 issuers,
46 listings and the approved source policy. There were 45 successful SEC checks,
zero new filings, zero facts requests and no due feed requests. Persisted source
cursors prevented redundant first-party polling; this is a successful no-change
refresh, not a source deletion.

Consumer `40afe02bad7b0a64facdde95` passed all 46 contracts and 16 candidate UI cases.
Child Pages run 37964570749 deployed through the existing production pipeline.
Sixteen unintercepted live cases passed, including all 86 asset hashes, exact
issuer/generation identity, locked access, 390/1440px, navigation, no overflow and
zero JavaScript errors. The actually served release was
`c263d885a0fe517ee4244c6715cb0b5d3473fff5`; unrelated accepted main updates were
preserved. The private refresh clock was 17:08:19Z, consumer build 17:11:42.998Z,
and actual publication acceptance 17:26:23.317Z. The later ordinary market-data
Pages release retained this consumer on main `2f10ea21e8fa933edc8d2d3437b64ce38c6b6e6b`.

Read-only health run 37966449250 independently read R2: refresh, build and actual
publication SLOs were all HEALTHY. Safe aggregate reports are preserved under
`evidence/company-intelligence-continuous-refresh-20261009/`. No private SQLite,
checkpoint archive, source rows or credentials are included.

The first full browser attempt found a test-adapter expectation defect: generation
was dynamic but the expected hydration timestamp still came from the fixed old
preview. All 216 real Discover/Quant cases and eight dark checks had passed before
that exact timestamp assertion rejected ACU. The adapter now binds both fields
to the current manifest; a new contract rejects contradictory generation/time.
No assertion, browser timeout, product data or source policy was relaxed.


The corrected independent full production run
[37969086009](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37969086009)
passed on code `417afcc0b0b988a76129489c4421676cbbf76150`, serving consumer
`40afe02bad7b0a64facdde95` from production SHA
`2f10ea21e8fa933edc8d2d3437b64ce38c6b6e6b`. All 46 stocks passed 390/430/768/1440px,
dark and light (368 V2 cases); the separate Discover/Quant matrix had 216
responsive cases plus two scope/access guards, and dark checks had eight cases
plus an out-of-cohort guard. All 86 consumer asset hashes and protected hydration
passed. The full QA job ran 18m24s; this is one-off structural acceptance and is
not repeated by the four-hour data schedule.


Production run 2, [37971341333](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37971341333),
passed from a genuinely new main runner. It restored run 1 generation
`46f7fdd7d385681b90d7b885` and advanced the full private state to
`07cf7fbab640023fff9d2739`; checkpoint SHA-256
`bfa9ac1c1569f8b494c779d0855806eeba2cbc469e9fb1ad4c29f4de038bd3ae`,
31,140,726 bytes. Full 5,120-company preservation, table proofs, independent R2
readback/restore and all 86 reproduced consumer bytes passed again. Forty-five
SEC checks succeeded; feeds were not yet due, no new filings were found and no
facts download was needed. No news, events or financial updates were invented.
The stateful no-change path retained 45 German profiles and 314 news records
across 42 issuers. All 46 contracts and 16 candidate browser cases passed.

Consumer `bc4b5f6f0392692125bccb74` was deployed by existing Pages run
37972161686, which also finished green. All 16 actual live cases and 86 asset
hashes passed, source SHA `2f10ea21e8fa933edc8d2d3437b64ce38c6b6e6b`.
Private successful refresh: 18:12:06Z. Actual production acceptance:
18:24:14.441Z. R2 and consumer payloads, not a workspace fixture, supplied
production. The second run proves restoration of the first run's resulting
state, durable cursors, no-change handling and publication across independent
runners. Current and previous GOOD remain protected.

### Measured running cost for this cohort

Six refreshes/day, 180/30 days. Run 1's source job took 20m07s; run 2 took 14m33s.
The measured mean is **17m20s** including setup, deployment wait and live QA.
Dispatched Pages jobs consume another **8.075 active runner minutes per run** on
average; queued job time is excluded, source-job polling wait is included.
The read-only health job took nine seconds. This extrapolates to approximately **4,601
active runner minutes/month**, or **5,220 minutes if each job is rounded up**,
for the measured no-feed-due runs. Due first-party polling and queue variance
can increase or change this projection; the 747-second initial full-source
producer run is recorded separately. This is a measured baseline scenario,
not a proven monthly runtime for every combination of due sources.
`measured-cost.json` records the exact start/end times and arithmetic. Standard
Linux Actions on this public repository has no incremental compute-minute
charge. Account-wide artifact/storage billing has not been authenticated.
Existing market-data Pages jobs and initial engineering/verification jobs are
separate; this is not a claim about total repository consumption. The one-off
full browser job used 18m24s plus its parallel regression-validation job. Initial
source catch-up used 747 producer seconds and is not the recurring baseline.

`health.json.durationSeconds` and its `finishedAt` describe the private-state /
consumer / candidate phase (242s and 304s for the two production runs). Actual
publication has its separate accepted clock; full job costs above include that
later phase. GitHub's native per-job start/end evidence is preserved separately.

Current compressed private checkpoint: **31.14 MB**. Two private slots plus the
certified bootstrap and four bounded approximately-2.07-MB consumer slots retain
roughly **0.102 GB** for this production lane, excluding original sealed state,
isolated acceptance namespaces and other account workloads. Routine full-change
publication is approximately **12.4 MB/day**. Plan for approximately **560 R2
writes/day** (86 payloads, manifest/pointer/checkpoint writes and successful
observations), and a conservative **5,000 reads/day** for this lane including
readback/restore/staging. Existing market-data redeployment reads/observations
are separate; account operation totals have not been metered.

Pricing assumptions remain the R2 Standard reference checked on 5 October:
10 GB-month / one million Class A / ten million Class B free per account;
$0.015 per GB-month, $4.50/million Class A, $0.36/million Class B with billable-unit
rounding and free Internet egress. This lane fits the free allowances if available
(**$0 incremental R2**); a conservative standalone no-free-allowance rounded
scenario is approximately **$4.88/month**. Shared allowance availability and an
actual bill are unverified. Paid data and AI inference cost remains **$0**.
No 100/500/5,000-issuer runtime or cost guarantee is inferred from these 45 issuers.

### Final autonomy / safety / scope review

**YES:** if Dennis does not open Codex or ChatGPT for 30 days, the enabled main
schedule will fetch eligible registered sources, process, validate, preserve and
publish content without those tools. This is supported by two full actual main
runs, not only YAML or isolated publication. Existing Actions/R2/Pages credentials
are the only operational prerequisites; no interactive source-review step or
AI call is required by the routine path. Critical failures remain visible in
GitHub and preserve/restore the verified consumer.

The source workflow and health workflow are both registered **active**. The next
source cron after acceptance is 9 October **20:17 UTC**; actual cron observation
is **NOT-YET-OBSERVED** at this report's acceptance. GitHub cron is best effort,
and the native warning/critical ages are 8/12 hours. No repository variable change
is required for the committed approved config; the actual production runs prove
the optional stop variable is not blocking execution.

Remaining product limits are unchanged: nine inactive article-only entries are
not new-page discovery feeds, TK/VEON/XPEV/ARBE retain stale labels where existing
normalization is insufficient, and changed untranslated profile fragments wait
privately for optional editorial work. Source adapter fixes, infrastructure
failures and scope expansion can require later maintenance; daily eligible
refresh does not. The approved 46/45 cohort, source policy and access controls
remain unchanged. No operational activation blocker remains after these runs.


Final independent read-only R2 health run 37973142531 passed on main: all three
SLOs were HEALTHY for consumer `bc4b5f6f0392692125bccb74`. Its aggregate receipt
is committed as `final-slo-refresh-slo.json` alongside both successful production
runs and the full actual-production browser reports.

### Subsequent fail-closed production incident (9 October)

The acceptance above records the earlier successful state, not a guarantee that
later deployments remained enabled. Automatic Pages run **37975022327** deployed
main `07416a561354904cd3b87b0006cb343c8be49115` and failed its routine actual-browser
check at 18:50 UTC: the Company Intelligence heading did not become visible within
30 seconds. The existing rollback restored the previous GOOD consumer and closed
the durable production gate. Pages run **37978178979** subsequently passed the
OFF checks; that green result is **not** evidence of live Company Intelligence.

Isolated verification **37980945815** reproduced a second issue: its routed
candidate inherited the OFF gate, requested no consumer data and could not test
recovery. PR #558 allows only a browser-local approved-cohort canary overlay,
rejects a changed cohort and leaves actual gates/access controls unchanged.
Routine actual QA now preserves failure markers, requests/errors and a screenshot
without increasing timeouts or weakening assertions. The original 18:50 run did
not capture enough diagnostics to identify the missing-heading cause conclusively.

At this incident checkpoint production is OFF. Recovery and subsequent actual
production verification are still pending; the earlier autonomy YES statement is
superseded until those pass. No authoritative private state has been replaced.

The independent health lane also checks the actual public delivery generation
against both GOOD and its accepted observation. OFF/404, changed scope or a
mismatch is CRITICAL even when an old publication timestamp is recent. The
historical receipt remains in R2 for diagnosis; it is not counted as a currently
verified publication. This read-only probe never repairs/enables production.

Recovery checkpoint: isolated run **37982253660** passed a fresh restore of
5,120 companies and all 86 consumer assets plus all 16 routed actual-UI candidate
cases, while production was still OFF. Gate-enable run **37983274560** verified
the durable consumer and left private state untouched. Actual Pages recovery
**37983580926** then passed AAPL/XPEV routine protected-browser QA at 20:04 UTC
on `e93511584cd79c3ab38386496143b91294fef521`, serving the previous verified GOOD
`40afe02bad7b0a64facdde95`. Its five routine hashes and response proof are preserved
as `recovery-production-routine-report.json`.

PR #558 merged as `997b503d2e36371f802fceb1e00ef085a4bf5351` after exact-head
Company Intelligence validation **37983431942**, Pages package, currency and
config checks passed. Core retained exactly the three independently classified
baseline invalid-news-symbol failures; Vercel's preview quota is unrelated to
Research Pages. Incoming main changes were ordinary intraday/capability/watchdog
JSON updates, retained by the normal merge. No UI, factor, score, access-control
or cohort expansion was included.

Routine recovery did not replace the prior publication observation: its generation
was from the previous GOOD, while the old observation referred to the rolled-back
newer consumer. A subsequent full refresh must pass all 16 actual live cases before
its new accepted publication clock is written. The 20:17 UTC cron is being observed.

### Recovery completed: full actual-production acceptance

Main run **37987633999** passed independently on 9 October, 20:32–20:47 UTC
(event **workflow_dispatch**, not a cron). It restored the actual current full
private `07cf7fbab640023fff9d2739`, then preserved and freshly restored
**`f93b34d8640b84b195590c51`**, still **5,120 companies**.
Checkpoint SHA-256: `ced43907fcfb605fbc3cc0b665116b6a25f200cf2878736c89c45968d2bd2274`;
compressed size **31,144,806 bytes**. Original sealed accepted state remains intact.
All table/identity fingerprints and the 86 consumer bytes/generation were verified
by the existing empty-directory restore proof.

**30 due IR feeds + 45 SEC issuers** were checked: IR outcomes 16 NO_CHANGE,
12 SUCCESS, two TEMPORARY_FAILURE; all 45 SEC checks succeeded. HTTP reused 28
cached responses, including 14 not-modified results; downloaded bytes 1,410,787.
There were zero new news/events/financial updates. Zero new news is successful
operation, not an empty consumer: **314 news / 42 issuers / 45 German profiles**
were retained. The two source failures were isolated; detailed health remains in
the preserved private ledger and cooldowns remain effective. No rejected source
was enabled and no third-party article body was published.

Consumer **`b294efcf1cb0ff275a3d5481`** passed all 46 contracts and 16 candidate
cases, then actual Pages **37988544426** on code
`9b180aa5b35ad68ee8e7d492b2796a66b453902f`. The same 16 actual-production cases
and all 86 served hashes passed, including access/out-of-cohort guards, correct
issuer/generation/time, stale labels, collapsed sources, navigation and no JS
errors or overflow at 390/1440 dark. The protected production URL remains
https://research.visionuniverse.de/discover/#/s/US_REAL/TSLA.

Independent read-only health **37989381035** passed at 20:48:11 UTC:
private refresh **20:34:20**, consumer build **20:39:56.534**, actual accepted
publication **20:47:49.936**. All three SLOs HEALTHY, actual served generation
VERIFIED. This healthy receipt supersedes the incident's CRITICAL mismatch
receipt; both remain preserved. Recovery is complete and the ordinary routine
has no Codex/ChatGPT runtime dependency.

The 20:17 source cron was observed until 20:32 and remained absent from GitHub's
schedule-event registry through this acceptance. Workflow metadata is active,
main cron remains `17 */4 * * *`, and the successful manual run uses exactly the
same main job/production concurrency. **REAL-SCHEDULED-RUN-PASSED:
NOT-YET-OBSERVED**; do not label the manual trigger a scheduled run. The first
actual cron execution is the remaining observation, not a source or R2 permission
failure. No extra writer, discovery campaign or paid dependency was introduced.

Three substantive recovery reviews: (1) data/incrementality: full private restore,
identity/table/hash equality, durable cache reuse and retained news despite two
source failures; (2) production delivery: OFF canary recovery, actual 86 hashes +
16 mobile/desktop cases, with UI/access byte-equivalent to the previous full 368
V2 / 216 Discover-Quant / dark-light structural review; (3) safety/observability:
real fail-closed GOOD/gate rollback and OFF acceptance, historical-clock mismatch
correctly CRITICAL, then actual-generation HEALTHY without hidden gate changes.
The original 18:50 heading timeout was not reproduced; its old run lacked root-
cause diagnostics. New failure evidence is retained automatically if it recurs.

`recovery-measured-cost.json` adds this third production run (15m36s) and its
separately billed Pages jobs (7m19s) to the earlier two. Mean source job **16m45s**;
180 monthly refreshes project approximately **4,454 active / 5,040 rounded job
minutes** for these mixed samples. This includes parent wait plus dispatched
Pages plus read-only health; it excludes unrelated market workflows, initial
engineering, incident recovery and full structural QA. It is not a measurement
of all 105 sources being due together or a complete queue/latency distribution.
Public standard-Linux compute has no incremental minute charge; account-wide
artifact/billing remains unverified. R2/paid-data cost assumptions above remain
unchanged. There is no new cadence increase or per-visitor processing.

## Ausgelassene Schedule-Laeufe und Finanz-Gate (14 October 2026)

Reine Metadaten-Messung (GitHub Actions API, nur lesend), Fenster 10.10. 00:00 bis 14.10. 15:00 UTC,
28 Cron-Slots je Workflow.

| Workflow (Cron) | Soll-Slots | angelegt | ausgefallen | Verzug min / Median / max |
|---|---|---|---|---|
| Refresh `17 */4` | 28 | 16 | 12 | 36 / 145 / 239 min |
| Health `57 */4` (eigene Concurrency-Gruppe, Lauf ca. 1 min) | 28 | 16 | 12 | 42 / 127 / 226 min |

Muster: die Slots 00:17 und 08:17 fehlen an fast jedem Tag, 12:17, 16:17 und 20:17 kommen 1,5 bis 4 h
spaet. Health und Refresh verlieren dieselben Slots. Repo-weit entstanden vom 13.10. 00:00 bis 14.10. 15:00
nur 65 Schedule-Laeufe fuer 32 Cron-Workflows (z. B. `pages-release` `*/5` an Werktagen praktisch keine).

Urteil, BELEGT: Ausfall und Verzug sind plattformweit (GitHub-Scheduler), nicht
Concurrency-Verdraengung. (1) Der Health-Workflow hat eine eigene Gruppe und verliert dieselben Slots.
(2) Fuer die fehlenden Slots existiert kein Lauf in irgendeinem Status; im Fenster gibt es keinen
`cancelled` Schedule-Lauf des Refresh. Die `cancelled`-Laeufe (profile-source am 12.10., universe-release
am 10.10.) sind Dispatch-gegen-Dispatch in derselben Gruppe, ein Refresh-Lauf wurde am Timeout (60 min)
abgebrochen. HYPOTHESE, nicht belegt: Lastspitzen der Plattform bevorzugen bestimmte Stunden; die
Minute :17 ist nicht ursaechlich (Health :57 verhaelt sich gleich).
Unabhaengig davon scheiterten 8 von 17 Schedule-Laeufen seit 11.10. im Schritt "Restore, bounded
refresh, fresh restore, validate and commit consumer"; das ist kein Scheduler-Thema.

### Finanz-Gate (zustandsbasiert)

Vorher: `--financial` nur bei UTC-Stunde % 8 == 0. Verspaetete Schedule-Laeufe trafen das selten
(1 von 17 seit 10.10.). **Reale Verhaltensaenderung:** Finanzdaten werden jetzt etwa dreimal taeglich
(alle 8 h) statt fast nie lokal neu projiziert. Jetzt entscheidet `scripts/company_intelligence/scheduler-gate.mjs`
im Job `gate`: Finanz-Refresh laeuft, wenn der letzte erfolgreiche **Produktions**-Lauf mit Finanz-Refresh
(Start) aelter als `financialHours` (8 h, `continuous-refresh.json`) minus 0,5 h Verzugstoleranz ist.
`workflow_dispatch`/`workflow_call` behalten `--financial` (neuer optionaler Eingang `financial`, Default
`true`; nur ein ausdrueckliches `false` schaltet ihn dort ab). Jede Unklarheit (API-Fehler, kaputte
Antwort, ungueltige Konfiguration, Zeitstempel in der Zukunft, kein markierter Lauf, leere Gate-Ausgabe)
ergibt Finanz-Refresh AN und Lauf AN. Der Zustand kommt ohne R2 aus den Actions-Metadaten
(nur Laeufe auf `main`): ein erfolgreicher Lauf laedt ein Marker-Artefakt
`ci-refresh-mode-<runId>-<production|verification>-<financial|plain>` hoch. Der Gesundheits-Artefaktname
`company-intelligence-refresh-health-<runId>` bleibt unveraendert (das Scale-Receipt der Universe-Freigabe
liest ihn). Bis zum ersten Lauf mit Marker laeuft jeder Schedule-Lauf mit Finanz-Refresh.

Last: `--financial` selbst fuehrt `project_company(c)` ohne `fetch_sec` aus und liest nur lokale
Quant-SEC-Rohdaten; es sendet keine Anfrage. `advance_financial_filing` (hoechstens 20 companyfacts-Abrufe
je Lauf, nur bei ungesehenem 10-Q/10-K/20-F/40-F) laeuft pro Emittent, sobald dieser nicht uebersprungen
wird (`continuous_refresh.py`, Schleife ab Zeile 229: `if not poll_sec and not financial: continue`). Ohne
`--financial` wird ein Emittent bei erschoepftem SEC-Budget, SEC-Stoerung oder Cooldown uebersprungen und
bekommt keinen Faktenabruf; mit `--financial` sind bis zu 20 Abrufe auch dann moeglich. Sie bleiben im geteilten
SEC-Budget (110 Anfragen / 240 s, `BudgetExhausted` beendet sie), das unveraendert ist. Obergrenze der
zusaetzlichen companyfacts-Abrufe 3 x 20 = 60 pro Tag, real nur so viele wie neue periodische Filings.
Die Annahme `runsPerDay: 6` in `operating_cost.py` bleibt gueltig (Primaerslot, der Waechter fuellt nur Luecken).

### Frische-Gate im Primaerslot und Waechter-Workflow

Ein zusaetzlicher Cron im Refresh-Workflow wurde verworfen: Jeder Schedule-Lauf besetzt die Gruppe
`company-intelligence-continuous-production` vor jedem Gate-Job. GitHub haelt nur einen wartenden Lauf; ein neuer
verdraengt den alten (`cancelled`): betroffen waeren profile-source (03:47), universe-release,
Dispatch `verification=false` und der Caller `publish`. Der Refresh behaelt nur den Primaerslot `17 */4`.

Neu: `company-intelligence-refresh-watchdog.yml` (Cron `47 2-22/4 * * *`, eigene Gruppe
`company-intelligence-watchdog-<ref>`, Rechte contents read, Job: actions write nur fuer `gh workflow run`).
`refresh-watchdog.mjs` dispatcht `company-intelligence-refresh.yml` mit `verification=false` nur, wenn

* kein Lauf von Refresh, profile-source oder universe-release in einem Status
  queued/in_progress/waiting/pending/requested ist (sonst wuerde der Dispatch einen Wartenden verdraengen) und
* der letzte erfolgreiche markierte Produktionslauf aelter als 4,5 h ist (Primaerslot ausgefallen) und
  die 45-min-Fehlschlag-Wartezeit nicht greift.

Fail-safe-Richtung ist hier umgekehrt zum Gate: bei API-Fehler oder Unsicherheit wird nicht dispatcht und der
Job schlaegt sichtbar fehl (der Primaerslot laeuft ohnehin). Der Dispatch uebergibt `financial=<Gate-Urteil>`,
daher kostet ein Weckruf keinen unnoetigen Finanzlauf. Ausgangslage: im Normalbetrieb dispatcht der Waechter
nichts (02:47 sieht den 00:17-Lauf, Alter rund 2 h).

Der Gate-Job im Refresh bleibt, weil er (a) das Finanz-Gate fuer den Primaerslot liefert und (b) den
Primaerslot beendet, wenn der Waechter kurz zuvor einen Lauf erfolgreich beendet hat (Alter unter 2,5 h,
verhindert den Doppellauf). Er laeuft erst nach Erhalt der Gruppe und haelt sie nur etwa eine Minute.

Verbleibendes Restrisiko: Der Primaerslot und ein Waechter-Dispatch koennen gleichzeitig eintreffen
(einer laeuft, einer wartet; kein Dritter wird verdraengt). Ein Dispatch oder profile-source, der
waehrend eines laufenden Produktionslaufs wartet, kann weiterhin vom naechsten Primaerslot verdraengt werden
(das gilt schon vor diesem PR).
