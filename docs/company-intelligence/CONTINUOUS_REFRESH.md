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

Globaler Stempel `lastSuccessfulRefresh`: `continuous_refresh.py` setzt ihn nur noch nach
einem fachlich vollständigen Lauf (`refresh_completeness`) und erst am Ende, nachdem Export,
Consumer-Kandidat, Inventar und Profilprüfung konsistent sind (`commit_refresh_stamp`); der
GOOD-Zeiger übernimmt ihn danach unverändert. Produktentscheidung zur Definition von
"vollständig" (Begründung: der echte Betrieb hat immer einzelne Quellenausfälle, z. B. 2 von
30 fälligen Quellen im dokumentierten Prod-Lauf, 174 von ~5.384 im Universum, 91x
`ROBOTS_UNAVAILABLE:HTTP_403`; ein Null-Fehler-Kriterium hielte den Stempel dauerhaft an
und meldete `CRITICAL` trotz publizierter Daten):

1. Systemische Fehler blockieren immer: Offline-Lauf, kein einziger Erfolg, Abbruch durch
   Anfragebudget (öffentlich oder SEC), SEC-Abbruch nach 4 Fehlern in Folge, temporärer
   Fehler bei den Finanzfakten.
2. Bekannte Dauerfehler blockieren nicht: Quellen, die schon vor dem Lauf im Cooldown
   (`failureCount>0`) oder `health` `blocked`/`temporarily_failed` waren, zählen weder im
   Nenner noch als Blockade, werden aber als `KNOWN_FAILING_SOURCES:n` in `incompleteReasons`
   und als `knownFailingSources` im Bericht ausgewiesen. Bewusst blockierte Ausgänge
   (`ROBOTS_BLOCKED`, `AUTH_REQUIRED`, `SOURCE_REMOVED`) sind ebenfalls ausgenommen.
3. Frisch fällige Quellen und SEC-Emittenten: Erfolgsquote `(SUCCESS+NO_CHANGE)/geprüft`
   mindestens `MIN_FRESH_SUCCESS_RATIO` (0,8) bei mindestens `MIN_FRESH_SAMPLE` (5)
   geprüften Einheiten; bei weniger muss jede gelingen. Fehler unterhalb der Schwelle
   werden informativ als `SOURCE_FAILURE_RATE_INFO` ausgewiesen.
4. Quellenseite muss leben (gegen schleichenden Totalausfall): Gibt es fällige oder bekannt
   fehlerhafte Quellen, braucht der Lauf mindestens einen Quellenerfolg (`SUCCESS`/`NO_CHANGE`);
   SEC-Erfolge allein setzen den Stempel dann nicht. Außerdem blockiert ein Anteil bekannter
   Dauerfehler an allen aktiven, nicht dauerhaft blockierten Quellen (inkl. Cooldown-Quellen,
   vor der Queue-Auswahl gezählt) über `MAX_KNOWN_FAILING_SHARE` (0,5). 174/5.384 (3,2 %)
   bleibt vollständig. Randfall: ohne fällige und ohne bekannt fehlerhafte Quellen (Scope ohne
   Quellen) kann ein reiner SEC-Lauf den Stempel setzen.

Grenzen: Dauerhaft fehlschlagende Quellen halten den Stempel nicht an, bleiben aber
sichtbar. Sie sollten repariert oder als blockiert klassifiziert werden. Der
SEC-Hinweis-Feed (`poll_sec_hints`) ist kein Kriterium: er beschleunigt nur, der
Emittentenpfad läuft unabhängig weiter. Bei Teilerfolg bleiben Fortschrittsfelder
(Lane-Stempel, `lastAttempt`, je Quelle `refreshSource:*`) erhalten. Schwellen 8 h / 12 h
und Zeitstempel bleiben unverändert. `source_onboarding.py` setzt den globalen Stempel
nicht mehr (nur den News-Lane-Stempel).

Python-Tests lokal: `PYTHONPATH=scripts python3 -m unittest discover -s scripts/company_intelligence/tests`
(die CI in `company-intelligence.yml` ruft sie ohne `PYTHONPATH` auf; die Testmodule ergänzen den
Pfad selbst, `quant.sec` braucht `scripts/` und `quant/config`).

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

### Rollback: idempotent und gegen konkurrierende Generationen geschuetzt

`refresh-run.mjs rollback [--expect-generation <Generation>]` wirkt nur auf die
Generation, die zurueckgerollt werden soll. Ergebnis als JSON (`status`):

- `ROLLED_BACK`: der Zeiger stand auf der erwarteten Generation und zeigt jetzt auf den
  Vorgaenger (Marker `rolledBackFrom.generation` im Zeiger). Exit 0.
- `ALREADY_ROLLED_BACK`: genau diese Generation wurde schon zurueckgerollt (Retry, zweiter
  Fehlerpfad). Kein Schreiben, Exit 0. Ohne `--expect-generation` gilt ein Zeiger mit Marker
  und ohne Vorgaenger ebenso als erledigt und wird nicht weiter zurueckgeschoben.
- `GENERATION_MISMATCH`: der Zeiger steht auf einer anderen Generation (ein anderer Lauf hat
  weiterveroeffentlicht) oder aenderte sich waehrend des Rollbacks. Kein Schreiben, Exit 1.
- `LEGACY_FALLBACK`: kein GOOD-Zeiger vorhanden, nichts zu tun.

Fail-closed bleibt erhalten: Alle Aufrufer (Refresh, Profile-Source, Pages-Handler) lassen
danach `production-release.mjs disable` und den OFF-Dispatch folgen; ein Mismatch bricht
diese Kette nicht ab (`|| true` bzw. `gate_failure`), sondern macht den Rollback-Schritt
sichtbar rot, ohne den Zeiger zu verfaelschen. Bei Universe-Rollback wird die Aktivierung
`ROLLBACK_46` nur bei `ROLLED_BACK` geschrieben oder nachgezogen, falls ein frueherer Lauf
dazwischen abbrach. Teilfehler (Put-Fehler, Nachlesen) stellen den vorherigen Zeiger
byte-genau wieder her (`ROLLBACK_RECOVERY_FAILED`, falls auch das scheitert).

Grenzen: Der S3-Treiber hat keine bedingten Writes (If-Match/ETag). Die Atomaritaet
beruht auf der Concurrency-Gruppe `company-intelligence-continuous-production`; der
Rollback liest, vergleicht, liest direkt vor dem Put erneut und prueft danach. Ein
Restfenster zwischen letztem Lesen und Put bleibt. Die Workflows uebergeben noch keine
Erwartungsgeneration; ohne Argument ist die aktuelle Generation die Erwartung. Nach einem
Universe-Rollback verschiebt ein weiterer Aufruf ohne Argument die dann aktive alte
Namespace (bisheriges Verhalten); mit `--expect-generation` ist auch das idempotent.

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
(Start) aelter als `financialHours` (bis 20.11.2026 8 h, jetzt 7 h wegen der Werktags-Slots, `continuous-refresh.json`) minus 0,5 h Verzugstoleranz ist.
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
`refresh-watchdog.mjs` dispatcht `company-intelligence-refresh.yml` (`--ref main` fest, nur wenn der Wächter selbst
auf `refs/heads/main` läuft) mit `verification=false` nur, wenn

* kein Lauf von Refresh, profile-source, universe-release oder company-intelligence.yml (nur `workflow_dispatch`,
  der Caller `continuous`/`publish`; PR-Läufe zählen nicht) in einem Status queued/in_progress/waiting/pending/requested
  ist (sonst würde der Dispatch einen Wartenden verdrängen), und
* im Fenster von 4,5 h auf main **kein** Refresh-Lauf begonnen hat, gleich welchen Status, welcher Conclusion und
  welches Ereignisses (Schedule, Dispatch auch des Wächters, laufend, wartend, failure, cancelled, skipped, Caller).
  "Slot ausgefallen" heißt: es existiert kein Lauf. Ein Fehlschlag ist kein Ausfall; Wiederholungen laufen über den
  Primärslot (bei Dauerfehler 6 statt 12 Versuche pro Tag). Existiert im Fenster ein erfolgreicher Lauf ohne Marker,
  dispatcht der Wächter nicht und gibt `::warning::` aus. Lauf-Aufrufer (`workflow_call`) liefern keine Frische, nur
  die Busy-Prüfung deckt sie ab.

Nach dem Dispatch wartet der Job 15 s und warnt (`::warning::`), wenn kein neuer Dispatch-Lauf sichtbar ist.

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

## Pages-Auslieferung des Refresh und Rollback-Entscheidungen (PR I, nach dem Vorfall 15.10.2026 20:14-20:18Z)

Hinweis zu oben: Das Job-Timeout des Refresh betrug damals 60 min; es ist jetzt **100 min** (25 min Pipeline + 50 min Wartefrist
auf die Pages-Auslieferung + 15 min Live-QA-Budget + 10 min Reserve fuer Rollback, disable, OFF-Dispatch, Upload). Alle Fristen
rechnen ab `JOB_STARTED_AT`; Quelle der Konstanten ist `refresh-live-verify.mjs` (`LIMITS`) und `refresh-dispatch-wait.mjs`.

**Auslieferung (`refresh-dispatch-wait.mjs`).** Der Refresh dispatcht `pages-release.yml` und verfolgt den eigenen Lauf. Wird er
verdraengt (`cancelled`/`skipped`) oder erscheint er binnen 3 min nicht, folgt ein Re-Dispatch, hoechstens 2 Mal und nur solange die
erwartete Generation nicht ausgeliefert ist. Nach der Obergrenze wird nicht aufgegeben: es wird weiter nur gelesen (kein Dispatch),
bis die Wartefrist ablaeuft, denn die workflow_run-Pages-Laeufe der Datenjobs liefern die Generation selbst aus (im Vorfall 3,5 min
nach der alten Frist). Ein echter Fehler des eigenen Pages-Laufs (`failure`, `timed_out`) beendet sofort (Rollback wie bisher).

**Nicht uebernommen, live unveraendert (Exit 4, seit 10.11.2026).** War der eigene Pages-Lauf `success`, kam die neue Generation bis
zum Fristende aber nie an und liefert die Seite unveraendert die Generation von vor dem Dispatch aus, endet das Skript mit
`NOT_DELIVERED_PRODUCTION_UNCHANGED` (Exit 4). Das ist keine Regression: kein Rollback, kein `disable`, kein `ROLLBACK_46`; der Lauf
wird im Schritt "Delivery not taken over" rot, der GOOD-Zeiger steht vor der Produktion (Health MISMATCH), und die naechste
Pages-Release mit neuem Commit liefert die Generation aus. Steht live eine dritte Generation, bleibt es der bisherige Fehler mit
Rollback. Anlass: Refresh 42744743112. Pages 42753904874 deployte 2ff33541 um 04:19 mit demselben Commit `adbfda1c` wie die
Deploys davor (nachts kein neuer Commit); ausgeliefert blieb e1d74267, und der Fail-closed-Schritt schaltete um 04:32 den gesunden
Vollumfang ab. Der Universe-Release (`--expected`) ist davon nicht betroffen; dort entscheidet seine Recovery.

**Marker-Commit vor dem eigenen Dispatch (seit 10.11.2026).** `actions/deploy-pages@v4` nimmt den Commit als Build-Version; ein
zweiter Deploy desselben Commits mit neuem Inhalt wird nicht uebernommen (Pages 42753904874 und 42760183738), und `env: GITHUB_SHA`
am Deploy-Schritt wirkt nicht (Lauf 42763174678). Deshalb starten Refresh, Universe-Release und dessen Rueckweg vor dem eigenen
Pages-Dispatch den Workflow `pages-release-marker.yml` und warten bis zu 5 min auf ihn (`pages-release-marker.mjs --dispatch`). Nur
dieser Workflow hat `contents: write`; er schreibt `company-intelligence/release-marker.json` ueber die Contents-API mit dem
`GITHUB_TOKEN` auf main (kein Pages-Push-Lauf, der den eigenen Dispatch verdraengen wuerde). Refresh und `company-intelligence.yml`
bleiben lesend. Scheitert der Marker, geht es mit Warnung weiter wie zuvor. Begruendete Ausnahme von ADR-005 (Push nur ueber
`push-with-retry.sh`): kein Checkout und kein `git push`; den Wettlauf faengt die Datei-SHA als Vergleichswert mit hoechstens
4 Versuchen ab.

**Ehrliche Rechnung.** 50 min Wartefrist sind rund 8 warme Pages-Laeufe (6 min) oder rund 4 kalte (13 min, siehe
`FULL_UNIVERSE_ROLLOUT.md`) hintereinander. Eine tiefere Warteschlange scheitert weiterhin, dann Rollback nach der Frist.

**Grenzen.**
- "Eigener Lauf" = neuer `workflow_dispatch`-Lauf von `pages-release.yml` auf `main` seit dem ersten Dispatch. Ein fremder Dispatch
  im selben Fenster (manuell, Re-Freeze #731, profile-source) kann so als eigen zaehlen; entscheidend bleibt die ausgelieferte Generation.
- Jeder (Re-)Dispatch belegt den einen Wartesteckplatz der Gruppe `pages-production` (cancel-in-progress false) und kann dort einen
  wartenden fremden Lauf verdraengen (Re-Freeze, profile-source). Das ist Eigenschaft der Gruppe; begrenzt auf hoechstens 3 Dispatches.
- Am Fristende wird nur ein eigener, noch nicht gestarteter Lauf abgebrochen (Status direkt davor neu gelesen), nie `in_progress`.
- Ein spaet in der Laufliste erscheinender frueherer Dispatch bleibt ein eigener Lauf und wird verfolgt.

**Rollback-Entscheidungen (`pages-rollback-decision.mjs`).**
- Pages-Handler: Rollback nur, wenn `approved` erfolgreich war, `enabled == 'true'` und das Gate (R2, 2-3 Lesungen bei Lesefehler)
  AVAILABLE ist; der Rollback bekommt `--expect-generation <GOOD-Generation>` (im Schritt `approved` aus dem GOOD-Zeiger gelesen, nicht die
  Gate-Generation). Sonst nur `production-release disable` und OFF-Dispatch.
- Refresh-Workflow (`--refresh`): Der Rollback-Schritt rollt nur zurueck, wenn das Gate noch AVAILABLE ist; hat der Pages-Handler
  bereits zurueckgerollt und geschlossen, entfaellt der zweite Rollback. Argument `--expect-generation` aus `health.json`.
- Bleibt das Gate unlesbar, gibt es nur disable (fail-closed) und eine Warnung: der GOOD-Zeiger kann dann der Produktion vorauslaufen.
- Bewusste Folge: Scheitert `approved` aus einem anderen Grund als `PRODUCTION_GATE_CHANGED_AFTER_PACKAGE`, obwohl das Artefakt schon
  ausgeliefert ist, erfolgt nur disable und OFF-Dispatch, kein Rollback.
- `--expect-generation` wertet `refresh-run.mjs rollback` erst mit PR #726 (CAS in `rollbackGood`) aus; bis dahin wird es ignoriert.

## observe: Fehlerklassen REAL und BOOKKEEPING (B4/B5, nach dem Vorfall 18.10.2026, Lauf 39128011059)

**Vorfall.** Auslieferung und Live-QA (16 Faelle) waren bestanden, danach scheiterte nur `refresh-run.mjs observe`; ein leeres `catch{}`
verschluckte die Ursache. Der Fail-closed-Pfad wertete das als Produktionsfehler, rollte zurueck und schloss das Gate (DISABLED).

**Klassen (`observe-production.mjs`).**

| Klasse | Exit | Bedeutung | Folge |
|---|---|---|---|
| PASS / DEFERRED | 0 | Generation belegt und `observed.json` geschrieben, bzw. mit `--same-generation-only` ohne passende Vorbeobachtung aufgeschoben (Ursache steht im Log) | keine |
| REAL | 1 | Produktion nicht belegbar: Auslieferung nach Wiederholung nicht lesbar (HTTP, HTML statt JSON, Netz, Zeitlimit), ausgelieferte Generation != GOOD, GOOD in R2 nicht lesbar | Schritt rot, **Fail closed** (Rollback, disable, OFF-Dispatch) wie bisher |
| BOOKKEEPING | 3 | Generation == GOOD ist **belegt**; nur das Schreiben/Zuruecklesen von `observed.json`, das Lesen der Vorbeobachtung (`--same-generation-only`) oder das Schreiben von `health.json` scheitert | **kein** Rollback, kein disable; Lauf wird rot (Refresh) bzw. warnt (Pages) |

Exit 3 entsteht nur nach belegter Generationsgleichheit. Die Wiederholung (3 Versuche, 20 s Pause, je Versuch GOOD und Auslieferung neu
gelesen) gilt unveraendert fuer Lesefehler und Generationsabweichung; ein Wechsel von GOOD zwischen den Versuchen wird immer gegen den
aktuellen GOOD verglichen. Das Zuruecklesen belegt die **Generation** der Beobachtung (nicht Byte-Gleichheit): ein paralleler Schreiber
derselben Generation ist kein Fehler, eine fremde oder fehlende Generation bleibt BOOKKEEPING.

**Refresh-Workflow.** `deploy_live` setzt bei Exit 3 den Output `observe_bookkeeping=true` und endet mit 0 (`::error::`-Zeile im Log);
nur Exit 3 wird so behandelt, jeder andere Exit-Code bleibt Exit-Code des Schritts. Aggregate-health, `Mark successful run` und
`Upload run marker` laufen weiter. **Letzter Schritt** `Observation bookkeeping failed` macht den Lauf rot, ohne Rollback/disable/Dispatch.
Der Marker ist in diesem Fall ein Erfolgs-Marker eines roten Laufs: unschaedlich, weil das Scheduler-Gate (`scheduler-gate.mjs`) einen
Marker nur bei `conclusion == success` als frisch zaehlt; ein roter Lauf zaehlt nicht als frisch (Cooldown nach rotem Lauf: 45 min).

**Pages-Workflow.** Der Schritt `Record actual verified publication ...` (`observe --same-generation-only`) behandelt Exit 3 wie der
Refresh: `::warning::` plus Eintrag in die Step-Summary, Exit 0 fuer den Schritt. Damit wird `failure()` nicht wahr, und der Handler
`Fail-closed persistent consumer gate and emergency Pages rollback` (pages-rollback-decision, Rollback, disable, OFF-Dispatch) laeuft nicht.
Der Pages-Lauf bleibt gruen, die Warnung steht an der Zusammenfassung. Jeder andere Nicht-Null-Exit scheitert wie bisher.
Nicht angefasst: `company-intelligence-profile-source.yml` und `company-intelligence-universe-release.yml` rufen `observe` ebenfalls auf,
ohne Exit-3-Behandlung (manuelle Laeufe mit eigener Entscheidungslogik); eine Angleichung gehoert in einen eigenen PR.

**Diagnose-Codes.** Jeder Fehler traegt einen Code im Log (`::error::observe <Klasse> (<Code>)`), nie Meldungstext, Schluessel, URLs oder Header
(`codeOf`): `HTTP_403` / `HTTP_503` (Antwort des S3-Treibers), `FETCH_FAILED[:ECONNRESET]` (Netz), `TIMEOUT`, `S3_CONFIG` (Zugangsdaten/Bucket
fehlen), `ZERO_COST_GUARD_BLOCKED`, sonst Fehlercode bzw. Fehlername (`[A-Za-z0-9_]`, hoechstens 40 Zeichen) oder `UNKNOWN`. Beispiele:
`BOOKKEEPING (OBSERVED_WRITE_FAILED:HTTP_403)`, `BOOKKEEPING (OBSERVABILITY_READBACK_FAILED)`, `BOOKKEEPING (OBSERVED_READ_FAILED:FETCH_FAILED)`,
`BOOKKEEPING (HEALTH_WRITE_FAILED:ENOSPC)`, `REAL (DELIVERY_HTTP_503)`, `REAL (OBSERVED_PRODUCTION_GENERATION_MISMATCH)`,
`REAL (GOOD_UNREADABLE:HTTP_403)`. Aufschub mit Ursache: `OBSERVATION_DEFERRED_TO_FULL_REFRESH_QA (PRIOR_OBSERVATION_MISSING |
PRIOR_OBSERVATION_UNPARSEABLE | PRIOR_OBSERVATION_GENERATION_DIFFERS | SERVED_GENERATION_NOT_GOOD | GOOD_ABSENT)`.
Der Sammel-Fehler `CONTINUOUS_REFRESH_FAILED (<Code>)` nutzt dieselbe Klassifikation.

**Vorgehen nach einem roten Exit-3-Lauf.**
1. Im Log des Schritts `deploy_live` den Code lesen (`OBSERVED_WRITE_FAILED:HTTP_403` = R2-Schluessel/Rechte, `FETCH_FAILED` = Netz, `ENOSPC` = Runner).
2. Nichts zurueckrollen, das Gate nicht anfassen: die Produktion ist belegt und gesund.
3. Der naechste Refresh-Lauf schreibt `observed.json` neu und heilt (`node scripts/core/system-health.mjs` bzw. `refresh-run.mjs health`
   zeigen bis dahin ggf. eine veraltete Veroeffentlichungsuhr).
4. Der Re-Freeze-Guard bleibt **BLOCKED**, bis `observed.json` == GOOD gilt; er wird nicht umgangen.
5. Bleibt Exit 3 ueber mehrere Laeufe bestehen (gleicher Code), ist es ein Speicher-/Rechteproblem und gehoert behoben, nicht ignoriert.

**Tests.** `observe-production.test.mjs` (Klassifikation), `observe-cli.test.mjs` (CLI-Zweig im Kindprozess mit Fake-R2: Exit 0/1/3, Log-Zeile,
Verdrahtung `keyFor`/`--health`/`--same-generation-only`, Wiederholungs-Default 3 x 20 s, GOOD-Wechsel, Diagnose-Codes gegen die echten
Fehlerformate des S3-Treibers; die Workflow-Snippets beider Workflows werden mit einem `node`-Stub tatsaechlich in bash ausgefuehrt).

## Top-30 ohne Profil oder Finanzen (Prüfung 11.11.2026, Generation 432a05cc)

Grundlage: Live-Vollumfang, Top-30 nach Marktkapitalisierung, dazu ausdrücklich XOM, UNH und SPCX. Das Profil-Modul erscheint nur mit einer geprüften
deutschen Fassung in `company-intelligence/config/profile-reviewed-de.json`, die per Hash an der englischen Quelle in `company-profiles.json` hängt.

**Entscheidung (Steuerung 11.11.2026):** Fehlende deutsche Fassungen für Titel mit gültiger 10-K-Quelle trägt Strang R wie die 2.830 vom 12.10. als
`APPROVED`/`MODEL_ASSISTED_STATIC_PARAPHRASE` ein (neutral nach `docs/legal/WORTWAHL.md`, keine Bewertung, Hash an der Quelle); das ist keine
Owner-Freigabe.

| Titel | Ursache | Behoben |
|---|---|---|
| BRK.A/B, WMT, LLY, V, JNJ, PG, KO | gültige 10-K-Quelle, aber keine geprüfte deutsche Fassung | ja: 7 Fassungen eingetragen (`approved_copy` geprüft) |
| COST | Parser: Überschrift „Item 1—Business“ (Geviertstrich) nicht erkannt; Satz „is principally engaged in the operation of membership warehouses“ nicht als Tätigkeit gewertet | ja (Code) und deutsche Fassung: zweiter, gelockerter Durchgang in `profiles.py`, nur wenn der unveränderte erste nichts findet |
| UNH | aktueller 10-K (2026-03-02) wird schon heute korrekt gelesen; der frühere Fehlversuch ist ohne privaten Checkpoint nicht nachvollziehbar | ja: Parser-Version 1.0.21 stößt die Neuauswertung an, deutsche Fassung eingetragen |
| CVX | Item 1 beschreibt nur die Holding („manages its investments in subsidiaries …“); Holding-/Tochter-Sätze sind absichtlich ausgeschlossen. Geprüft (Auftrag Steuerung): Die Segmentteile von Item 1 enthalten fast nur Beteiligungs- und Feldangaben („has a 60 percent-owned … interest in …“) oder nur den Vertrieb („markets petroleum products under …“); ein erweitertes Lesefenster lieferte eine falsche Aussage („is the producer of LNG in Australia“ aus „largest producer“). Item 7 enthält Ergebnisanalysen, keine Beschreibung. | nein (keine zulässige Gesamtbeschreibung) |
| GE | 10-K im Querverweis-Format; das Geschäft steht unter „ABOUT GE AEROSPACE“ mit Handelsname „GE Aerospace“ statt Item 1 | ja (Code, Parser 1.0.22): im zweiten Durchgang zählt die Inline-Überschrift „ABOUT …“, und ein vom Emittenten selbst genannter Handelsname („General Electric Company operates as GE Aerospace (GE Aerospace or the Company)“) gilt als Alias; deutsche Fassung eingetragen |
| SPCX | Space Exploration Technologies hat noch keinen Jahresbericht (nur S-1, 424B4, 10-Q) | nein (Quelldokument fehlt) |
| XOM (Finanzen) | Identitätsbruch: Seit 01.07.2026 ist ExxonMobil Holdings Corp (CIK 0002115436) die börsennotierte Gesellschaft für XOM; der Security-Master führt noch CIK 0000034088 (`quant/data/sec/universe_resolution.json`, match false), daher keine Consumer-Fundamentals | Finanzen: Strang X stellt XOM auf `iss_cik_0002115436` um (#1820; Consumer-Datei `CIK0002115436.json` führt beide CIKs zusammen). Profil: Eintrag in `company-profiles.json` und `profile-reviewed-de.json` unter der neuen companyId (gleicher Text, Quelle 10-K der Vorgänger-CIK, zulässig über `quant/config/sec-successor-issuers.json`, #1818); greift erst, wenn die neue companyId im Universum ist. Der Profil-Erzeuger (`profile_catalogue.py`) kann den Eintrag nicht selbst bilden, weil unter der neuen CIK noch kein 10-K liegt; er ist eine Kopie seiner Ausgabe für die Vorgänger-ID mit neuer companyId. Die IR-Quelle in `sources.json` zieht ebenfalls auf die neue companyId um (sourceId bleibt, damit Quellenzustand und Verlauf erhalten bleiben) |

Der Parser-Durchgang ist rückwirkungsfrei (1.0.22 gegen main: 17 unverändert, COST und GE neu verfügbar): Vorher/Nachher auf 19 echten 10-Ks (COST, GE, CVX, UNH, XOM, KO, WMT, PG, LLY, V, JNJ, AAPL, MSFT,
NVDA, JPM, BRK, AMZN, META, HD): 18 unverändert, nur COST wechselt von UNAVAILABLE zu AVAILABLE. Bestehende Beschreibungen und damit ihre geprüften
deutschen Fassungen bleiben unverändert.

Die deutschen Fassungen für COST, UNH und GE hängen an der englischen Quelle, die Parser 1.0.22 aus dem jeweils aktuellen 10-K
erzeugt (lokal nachgebaut, `approved_copy` geprüft). Weicht die Quelle im privaten Zustand ab, greift die Fassung nicht
(PROFILE_COPY_SOURCE_CHANGED) und das Modul bleibt aus; es entsteht kein falscher Text.

## Universum-Aktivierung: Startfenster und Vorbedingungen (Vorfall 11./12.11.2026)

Entscheidung (Steuerung 12.11.2026): `universe-release.yml` mode=activate startet **nicht zwischen 23:00 und 00:00 UTC** und so, dass der Lauf (ca. 55 min) vor dem
nächsten UTC-Mitternachtswechsel endet. Grund: Der Aufbau (`universe_eligibility.py`, `upcoming()`) und die Seite (`stock-section.js`) bewerten geschätzte
Termine mit `dateEnd >= today`. Läuft das Live-QA nach Mitternacht, fehlt ein am Bautag endender Schätztermin (Lauf 43116431258, Fall `MBNKO:events`), und der
Fail-closed-Schritt rollt auf die 46er-Kohorte zurück. Ein Neubau nach Mitternacht ist wieder konsistent.

Weitere Vorbedingungen von activate (aus dem Vorfall): (1) `scaling_run` ist byte-gleich zu den sechs Quittungsdateien (`continuous_refresh.py`,
`universe_scheduler.py`, `universe_eligibility.py`, `refresh-run.mjs`, `public-delivery.mjs`, `refresh-storage.mjs`; `git diff --exit-code <Quittungs-Commit> HEAD -- …`
leer); (2) der Rollback-Freeze liegt höchstens 24 h hinter dem Legacy-GOOD (`REFREEZE_MAX_LAG_MS`), sonst vorher `mode=refreeze` mit der Legacy-Generation;
(3) Live-Auslieferung = Legacy-GOOD (46/45). Zwischen refreeze und activate keinen Refresh starten.

## Stand 12.11.2026 (Strang AE): Freeze, Universum, Profile COST/UNH/GE, XOM neue CIK

**Freeze:** Rollback-Freeze `8fb1232a` (46er-Projektion des Universe-GOOD `0d07937d`, `refreeze-auto` 12.11. 01:55Z, gültig 7 Tage ab dessen generatedAt, also bis ca. 19.11. 00:52Z). Vorher `eb2e8ca9`, davor `128c2192`. Der Auto-Refreeze läuft weiter alle 2 Tage; Quelle bei aktivem Universum ist `universe`.

**Universum-Aktivierung (Regeln aus dem Vorfall):** `activate` prüft `LATEST_GOOD_46_REQUIRED` und `LIVE_DELIVERY_46` und ist nur für den Wechsel von 46er-Scope auf Universum da; bei bereits aktivem Universum veröffentlichen die normalen Produktionsläufe in den Universe-Namespace, `activate` würde scheitern. Nicht zwischen 23:00 und 00:00 UTC starten (geschätzte Termine mit `dateEnd >= today` fallen nach Mitternacht aus, Lauf 43116431258). Der Freeze darf höchstens 24 h hinter dem Legacy-GOOD liegen (`REFREEZE_MAX_LAG_MS`), sonst vorher `refreeze`. Die Skalierungsquittung verlangt Byte-Gleichheit von `continuous_refresh.py`, `universe_scheduler.py`, `universe_eligibility.py`, `refresh-run.mjs`, `public-delivery.mjs`, `refresh-storage.mjs` (Quittung 43179353807 auf 5b942c9a). Manuelle Refresh-Dispatches brauchen `verification=false` für Produktion (Standard ist `true`, ein isolierter Lauf ohne Wirkung).

**Profile COST/UNH/GE:** Die deutschen Fassungen standen im Reviewed-Register ohne englische Quelle im privaten Zustand (`NO_PROFILE_SOURCE`). Die Produktionsläufe säten den Katalog `company-profiles.json` nicht; nur die manuellen CLI-Befehle taten das. Fix: Erzeuger-Workflow `company-intelligence-profile-catalogue.yml` (nur Dispatch, Ergebnis als Artefakt, daraus ein PR), Re-Pin der Reviewed-Einträge an die Erzeuger-Quelle (#1872), Quellsnapshot (#1879) und `profile_catalogue_seed.py` im profile-source-Lauf (#1880). Katalog-Tranche der 139 Indexmitglieder ohne Eintrag: 3 von 139 verfügbar (EXPD, DELL, BE); die übrigen scheitern am Parser (67× `NO_EXPLICIT_ISSUER_BUSINESS_DESCRIPTION`, 1× `NO_EXPLICIT_ANNUAL_PRIMARY_DOCUMENT`). Offen: Parser-Arbeit (eigener PR mit Vorher/Nachher auf echten 10-Ks) und deutsche Fassungen für ca. 1.383 Titel ohne Quelle und Fassung.

**XOM unter der neuen CIK 0002115436:** Ursachen (1) Pin des Identitätsstands `abbea154` in `refresh`, `profile-source`, `universe-release` kannte nur die alte CIK (#1873, neuer Pin `42957c9e`, geprüfter Vorher/Nachher: 14 neue, 278 wegfallende Emittenten, keiner live außer XOM) und (2) `validProfile` in `company-intelligence/api/contract.js` lehnte das Profil mit dem 10-K der Vorgängerin ab (`SUCCESSOR_PREDECESSORS`, #1885, gleich dem Register `quant/config/sec-successor-issuers.json`). Live: XOM mit deutschem Profil unter `iss_cik_0002115436`; Nachrichten, Ereignisse und Finanzzahlen fehlen noch (neue Firma im privaten Zustand), die alte ID `iss_cik_0000034088` wird nicht mehr ausgeliefert, bleibt aber in `official-sites.json` und `sources.json` als Alias der Konfiguration.

**Offen/Betrieb:** GitHub startet geplante Läufe verzögert (Refresh ca. alle 8 h statt 4 h); profile-source im Schedule scheitert seit 10.11. im Quellen-Onboarding (`ONBOARDING_PROCESS_FAILURE`, Diagnose seit #1867 mit Signal/Exit); Fehlerdiagnose der Läufe: `failureDetail` (#1862, vorübergehend zurückgenommen wegen der Quittung, #1864) und `consumerDiagnostic.detail` (#1883).

## Stand 12.11.2026 (Strang AF): Zeitpläne über den Cloudflare-Wecker

Die fünf Workflows `refresh`, `refresh-watchdog`, `health`, `profile-source`, `refreeze-auto` haben keinen GitHub-`schedule:` mehr; ihre Einträge stehen in `core/registry/schedule.json` (`timer: waker`, Crons unverändert), Vertragstest SZ-3 verlangt das. Grund: GitHub startete sie nur etwa alle 8 h oder gar nicht (Frische ab 8 h WARNING, ab 12 h CRITICAL). Der Wecker startet per `workflow_dispatch` mit `inputs.zeitplan`; der Refresh-Eintrag setzt `verification=false` (Standard wäre der isolierte Lauf ohne Wirkung). Im Workflow gilt `inputs.zeitplan` wie `schedule` (`VU_EVENT`, Concurrency-Gruppe, Onboarding `--sources --source-limit 100`); `scheduler-gate.mjs` liest `VU_EVENT` und wertet Wecker-Läufe (Titel „· Takt …“) bei der Fehler-Abkühlung wie Schedule-Läufe. Die sechs Quittungsdateien sind unverändert.

**Profil-Parser 1.0.23 (Strang AF, Freigabe Steuerung 12.11.2026):** Kurzname des Rechtsnamens als Subjekt und Überspringen von „, together with the subsidiaries … (the Company),“ bzw. „, through our/its subsidiaries,“, nur im zweiten Durchlauf (`relaxed`), der nur läuft, wenn der erste nichts findet. Vorher/Nachher auf 115 Titeln (Läufe 43234880109, 43234886631): 113 gleich, 2 neu verfügbar (BAX, DIS), kein bisher verfügbarer Titel mit anderem Text. Ursachenklassen der 31 Titel ohne Beschreibung und Blockauszug: `profile_diagnosis.py`, Bericht im Katalog-Lauf (`diagnoses`, `comparisons`); der Katalog-Workflow hat die Eingänge `compare` und `only_missing` (Standard an: ohne `tickers` nur fehlende Einträge, kein Neu-Parsing bestehender). Offen: Blockbau für CALM/CATO (10-K in Wortfetzen), Satzklassen A(c)/A(d), 40-F und Verbundberichte bleiben außen vor.

**Profil-Parser 1.0.24 (Strang AF, Freigabe Steuerung 12.11.2026):** dritter Durchlauf für PDF-artig gesetzte 10-K (jedes Wort in `<div style="display:inline-block">`, Wortfetzen statt Sätzen), nur wenn Durchlauf 1 und 2 nichts finden; „is the largest X“ wird dort „is a/an X“. Vorher/Nachher auf 320 Titeln (120 aus der Diagnose plus 199 Zufallstitel, Seed 20261112): ein neuer Treffer (CALM), 0 Textänderungen. Katalog-Serie: `only_missing` parst nur Titel ohne Katalogzeile; da der Lauf keinen Checkpoint behält, bekommt jeder Lauf eine feste Tickerliste (höchstens 100), sonst belegen früh scheiternde Titel jedes Mal dieselben Plätze.

## Stand 14.11.2026 (Strang AP): Health rot seit 13.11., Produktion 14.11. 05:50–11:50 UTC aus

**Ursache 1, Frische-Stempel:** `lastSuccessfulRefresh` blieb ab 13.11. 00:19Z stehen (refreshSLO CRITICAL ab 12 h). Die Läufe waren grün, zählten aber nie als vollständig: `refresh_completeness` in `continuous_refresh.py` meldete `REQUEST_BUDGET_EXHAUSTED` (Rückstand ca. 5.100–5.200 fällige Quellen gegen 240 Anfragen je Lauf, `continuous-refresh.json` Z. 20–23) und `SOURCE_FAILURE_RATE` (`ROBOTS_TEMPORARY_FAILURE` steht nicht in `POLICY_TERMINAL_OUTCOMES`, Z. 142; `MIN_FRESH_SUCCESS_RATIO=0.8`, Z. 134). Lauf 171 (14.11. 08:19Z) setzte den Stempel wieder. Die Datei gehört zu den sechs gesperrten Quittungsdateien und wurde nicht geändert.

**Ursache 2, Produktion aus:** Das Live-QA von Lauf 170 (43555876511, 14.11. 05:50Z) sah kurz nach dem Deploy delivery `6f0b7a87…` gegen Refresh-Nachweis `1606745396…` (Mischstand), wertete das als `SAME_STATE_REAL_FAILURE`, und der Fail-closed-Pfad schloss das Gate (rollback, `disable`, `company_intelligence_off`). Der Health-Lauf blieb grün (Status OFF endet mit Exit 0). **„Für Nutzer nicht sichtbar“ war falsch:** Company Intelligence war von 05:50Z bis zur Wiedereröffnung am 14.11. gegen 11:30Z (Gate `enable`, Lauf 43590323693; Pages-Lauf 43590294977, Live-QA PASS auf Generation `7d49263c`) für Nutzer aus (u. a. Profile von NFLX, INTC, ASML).

**Behoben (#1990):** Ein Mischstand delivery≠Refresh-Nachweis trägt jetzt den Code `DELIVERY_PROOF_GENERATION_MIXED` (`runtime-candidate.mjs`, `refresh-qa.mjs`), und `decide()` in `refresh-live-verify.mjs` stuft ihn als Ausbreitungsfall ein (Wiederholung innerhalb der vorhandenen `LIMITS`, 2 × 30/60 s). Besteht der Mischstand fort, gilt wie zuvor `RETRIES_EXHAUSTED` und das Gate schließt. Tests: `refresh-live-verify.test.mjs`.

**Wiedereröffnung (ohne Owner-Freigabe, nur über die Workflows):** `company-intelligence.yml` mit `production_release=enable` (liest GOOD vollständig zurück, setzt das Gate AVAILABLE), danach der normale Pages-Lauf mit Live-QA. Nicht zwischen 23 und 00 UTC. `activate` ist dafür nicht gedacht (nur Wechsel 46er→Universum).

**Offen, drei Vorschläge für den Stempel (Änderung betrifft gesperrte Dateien, eigener Beschluss):** (a) `REQUEST_BUDGET_EXHAUSTED` im Universum-/Backlog-Abbau nicht als Blocker werten; (b) `ROBOTS_TEMPORARY_FAILURE` aus der Fehlerquote nehmen; (c) Stempel nach Fortschritt statt nach Vollständigkeit setzen oder die SLO-Schwellen fürs Universum anpassen. Stellschrauben außerhalb der sechs Dateien: `refresh-approval.mjs` Z. 28 (`freshness()`: >12 h CRITICAL, >8 h WARNING) und Z. 33 (`FRESHNESS_HOURS`); `warningHours`/`criticalHours` in der JSON werden nicht gelesen. Zusätzlich: Ein Health-Lauf mit Status OFF ist grün; ein roter Lauf bei OFF wäre sichtbarer.

**Nachtrag 16.11./17.11.2026 (Strang AS): zweite Abschaltung, Zeiger bleibt `ROLLBACK_46`.**
- **Erste Beobachtung:** Der 14.11.-Wiedereröffnung per `production_release=enable` fehlte der Zeiger: `enable` öffnet nur das Gate, der Rollback hatte `activation.json` auf `ROLLBACK_46` gesetzt, ausgeliefert wurde das Legacy-46, und der Takt „Reviewed Profiles" scheiterte an `CURRENT_FULL_ELIGIBLE_PRODUCTION_REQUIRED` (`universeActive` false). Weg zurück zur Vollmenge: `company-intelligence-profile-source.yml` mit `publish=true`, `recover_full_scope=true` (Baseline Gate `DISABLED` oder `AVAILABLE` plus `ROLLBACK_46`; öffnet das Gate selbst nach Vollabnahme und Readback). Lauf 43856812981 (16.11., 11:20–13:03Z) war grün.
- **Zweite Abschaltung:** Refresh-Takt 43865184193 (16.11., 13:03Z) veröffentlichte Generation c451fda2…, das Hosting lieferte 13:57Z 503 auf Snapshots, danach `fetch failed` (ECONNRESET) in `universe-browser-qa.mjs`/`live-asset-read.mjs`. Ohne Bericht und bei unverändertem Beweisstand wertete `refresh-live-verify` das als `SAME_STATE_REAL_FAILURE`: Rollback (→ `ROLLBACK_46`), `disable`, OFF-Pages. Dieselbe Klasse wie 14.11., nur im Lese­pfad statt im Mischstand. Ab 21:11Z kam zusätzlich Playwright auf `ubuntu-latest` = 26.04 (`BROWSER_SETUP_FAILED`, Strang AT, Browser-Jobs auf ubuntu-24.04).
- **Behoben:** `readLiveAsset` wiederholt Netzfehler (`ECONNRESET`, `ETIMEDOUT`, „fetch failed" u. a.) wie Hosting-Antworten (3 Versuche) und endet dann mit `TransientNetworkError`; `universe-browser-qa.mjs --live` schreibt dafür einen Bericht (`error.name: TransientNetworkError`) statt abzustürzen; `decide()` in `refresh-live-verify.mjs` stuft ihn als Ausbreitungsfall ein (Wiederholung in den festen `LIMITS`, wartender Beweis vor jeder Wiederholung). Inhalts-, Hash- und Generationsfehler bleiben fail-closed. Tests: `live-asset-read.test.mjs`, `refresh-live-verify.test.mjs`.
- **Dritte Abschaltung 17.11.2026 08:26Z (recover_full_scope 44038420337):** Restore und Abnahme grün, Live-QA (`refresh-qa --live`, ~5.580 Snapshot-Zugriffe, 4 parallel) bekam direkt nach dem Deploy 503, dann 429; nach 3 Versuchen in 2 s `LIVE_ASSET_HOSTING_FAILURE`, `CLOSE_GATE`, Rollback (→ `ROLLBACK_46`), Gate zu. `readLiveAsset` hat jetzt feste Geduld: 8 Versuche, Pausen 1/2/4/8/15/30/30 s, `Retry-After` beachtet (höchstens 30 s). Zusätzlich im Live-Pfad von `universe-browser-qa.mjs`: 60 s Wartezeit nach dem Deploy vor dem ersten Lesen (`LIVE_SETTLE_MS`) und höchstens 2 gleichzeitige Zugriffe statt 4 (`LIVE_READ_CONCURRENCY`). Hash- und Inhaltsfehler bleiben sofort fatal. Der profile-source-Workflow ruft die Live-QA weiter direkt auf (ohne `refresh-live-verify`-Wiederholung).
- **Vierter recover_full_scope 17.11.2026 (44052659037):** Restore, Remapping-Schutz und Verträge grün, dann `CONTENT_ACCEPTANCE`/`REFRESH_STAGE_FAILED` ohne Ursache (kein `profile-browser-qa.json`, 293 Case-Screenshots). `child-run.mjs#childRun` ersetzt die nackten `execFileSync`-Aufrufe in `profile-source-run.mjs` (außer dem Onboarding mit eigenem Fang): Fehlercode `<SCHRITT>_FAILED[_EXIT<n>|_<SIGNAL>|_TIMEOUT|_STDERR_OVERFLOW]` (SIGKILL = Speicher) und das Ende von stderr (3.000 Zeichen) in `source-onboarding-stderr.txt` (steht schon im Artefakt-Pfad).
- **Nach einer Abschaltung im Universe-Namespace gilt:** erst Ursache klären, dann `recover_full_scope` (nicht nur `enable`), dann Live-Beleg: `/company-intelligence/data/index.json` nicht `DISABLED`, `config/rollout.js` nicht `productionOff`. Nicht zwischen 23 und 00 UTC.

### Durchsatz bei Vollumfang: `publicMaxSeconds` 600 → 1020 (20.11.2026)

Belegt aus den Gesundheitsartefakten (Läufe 19.–20.11.): je Lauf 82 geprüfte Quellen, 141 öffentliche Anfragen (≈ 1,7 je Quelle, ≈ 4,3 s je Anfrage), Laufzeit 730 s; das Anfragebudget 240 wird nie erreicht, das Zeitlimit von 600 s bindet (Schlussfolgerung aus den Zahlen, nicht aus dem Transport-Code). 240 Anfragen brauchen ≈ 1.020 s, dann bindet das Budget: ≈ 140 Quellen je Lauf, 840 am Tag statt 492 (6 Läufe, Takt unverändert `17 */4`). Rechnung "Tage bis < 10 %" (Reihenfolge älteste zuerst, 5.342 Quellen, heute 3.154 mehr als 7 Tage überfällig, 2.188 jünger, im Mittel 313 je Tag neu überfällig): bisher sinkt der Rückstand um nur 179/Tag, der Zyklus dauert 10,9 Tage und der Dauerzustand liegt bei ≈ 36 % überfällig, also nie unter 10 %. Neu: Zyklus 6,4 Tage; unter 25 % nach ≈ 3,5 Tagen, unter 10 % nach ≈ 5 Tagen (3.154 + 313·d − 840·d ≤ 534). Prüfung nach dem nächsten Lauf: `publicRequests` deutlich über 141, `sourcesChecked` ≈ 140. Der Lauf wird um ≈ 7 Minuten länger (Job-Limit 100 min, heute ≈ 60 min); Takt und 23–0-UTC-Sperre unverändert.

## Refresh-SLO bei Vollumfang: Rückstandsquote (Entscheidung Steuerung 20.11.2026)

Ab dem Vollumfang-Lauf vom 18.11. (5.342 Quellen, Budget 240 Anfragen je Lauf) endet jeder Lauf mit `REQUEST_BUDGET_EXHAUSTED`; `lastSuccessfulRefresh` wird nur bei vollständigem Lauf gesetzt und stand deshalb ab 18.11. 16:19 UTC still (SLO CRITICAL nach 12 h, obwohl die Läufe grün waren). Entscheidung: Bei Vollumfang (`PER_ISSUER_ELIGIBILITY`) urteilt `scripts/company_intelligence/backlog-slo.mjs` (Schritt im Health-Workflow, nur Lesen) über den Anteil `dueOverSevenDays / eligibleSources` des jüngsten Produktions-Gesundheitsartefakts: ≤ 10 % HEALTHY, ≤ 25 % WARNING, darüber CRITICAL. Zusätzlich müssen die Lane-Stempel News und SEC sowie der Berichtsstand frisch sein (8 h / 12 h); sie ergänzen die Quote, ersetzen sie nicht. Build- und Auslieferungs-SLO bleiben unverändert. Ist das Artefakt nicht lesbar oder kein Vollumfang, gilt das strenge Stempel-Urteil. `continuous_refresh.py` und die übrigen Belegdateien bleiben unverändert. Das Verdikt führt `refreshBasis`, `stampRefreshSLO`, `backlogRatio`, `backlogSLO`.

### Frische-Wache 2,5 h → 1 h (20.11.2026)

Die Wache `FRESH_PRODUCTION_RUN` überspringt einen Takt, wenn der letzte Produktionslauf weniger als `guardHours` zurückliegt (Ende des Laufs). Bei Takt 4 h und 2,5 h Wache darf ein Lauf höchstens 90 min dauern; der 04:17-Lauf vom 20.11. dauerte 80 min (bis 06:06 UTC), der Takt 08:17 wurde übersprungen (Alter 2,19 h), mit dem größeren Zeitlimit (1020 s, #2149) wären es regelmäßig mehr als 90 min und der Durchsatz hätte sich auf 3 Läufe am Tag halbiert. Die Concurrency-Gruppe serialisiert die Läufe ohnehin; die Wache dient nur noch gegen versetzte Doppel-Slots. `CI_GATE_GUARD_HOURS=1` im Gate-Schritt von `company-intelligence-refresh.yml`.

**Korrektur zum Durchsatz (20.11.2026):** Im Vollumfang-Produktionslauf (`universe=True`, Scheduler-Daten im Bericht) überschreibt `universe-rollout.json` die Werte `publicRequestBudget`, `publicMaxSeconds`, `secRequestBudget`, `secMaxSeconds` (`continuous_refresh.py` Zeile 220–221). Die Änderung auf 1020 s in `continuous-refresh.json` (#2149) blieb daher in der Produktion ohne Wirkung (Lauf 44734503496: 162 Anfragen, 103 Quellen, 740 s; Schwankung, kein Effekt). Jetzt auch `universe-rollout.json` `publicMaxSeconds` 1020; das Budget 240 bleibt, bis belegt ist, dass es bindet (der Transport wirft `NETWORK_TIME_BUDGET_EXHAUSTED` bei Zeit, `NETWORK_BUDGET_EXHAUSTED` bei Anfragen; das Gesundheitsartefakt trägt den Grund nicht).

### Rollback-Freeze: Frischealarm und Notfall-Re-Freeze (23.11.2026)

Der eingefrorene 46er-Rollback verfällt sieben Tage nach `generatedAt`. Ist er abgelaufen und das Gate zu, gibt es weder Wiederherstellung (braucht frischen Freeze) noch Auto-Re-Freeze (braucht ausgelieferten, offenen Stand). Gegenmaßnahmen: (1) `freeze-slo.mjs` im Health-Lauf hebt das Urteil an: WARNING ab 5 Tagen (< 48 h Restlaufzeit), CRITICAL ab 6 Tagen (< 24 h) oder bei abgelaufen, fehlend, unlesbar. (2) Notfall-Pfad `company-intelligence-refreeze-recover.yml` (`confirm=recover-expired`, nur von Hand): `refreezeFromUniverse(…, {recoverExpired:true})` friert die 46er-Projektion des frischen, freigegebenen Universe-GOOD ein, nur bei Aktivierung `ROLLBACK_46`, Gate `DISABLED` und abgelaufenem Freeze. Tests mit Mutanten in `tests/universe-projection-freeze.test.mjs` und `tests/freeze-slo.test.mjs`. Die sechs CI-Belegdateien bleiben unverändert.

**Herkunft des Rückstands-Berichts (BB 24.11.2026):** `backlog-slo.mjs` nimmt nur Gesundheitsartefakte von Läufen auf `main` aus dem eigenen Repository (`workflow_run.head_branch == main`, `head_repository_id == repository_id`); PR-, Fork- und herkunftslose Artefakte zählen nie (fail-closed: ohne passendes Artefakt bleibt das strenge Stempel-Urteil).

### Durchsatz Vollumfang: Anfragebudget 320, publicMaxSeconds 1400, Job 130 min (Entscheidung Steuerung 24.11.2026)

Messung 22.–24.11.: Der Rückstand (> 7 Tage überfällig) sank nur um ca. 186 Quellen je Tag (2.225 am 22.11. 20:17 auf 1.985 am 24.11. 03:10) statt der geplanten 400–450; netto je wirksamem Vollumfang-Lauf nur −32…−45 bei 115–152 geprüften Quellen. Gleichgewichtsrechnung: 5.309 Quellen in 7 Tagen brauchen 758 Prüfungen je Tag; wirksam waren ca. 127 Quellen je Lauf bei 5–6 Läufen, also 640–760 je Tag, an der Grenze. Im Gleichgewicht liegt der Rückstand bei etwa 5.309 − 7 × (Prüfungen je Tag), bei 650 je Tag also um 760 (14 %): das Ziel unter 25 % ist mit dem heutigen Durchsatz erreichbar, unter 10 % nicht. Mehrere Läufe waren zeitgebunden (223–230 statt 240 Anfragen bei publicMaxSeconds 1020), ein höheres Anfragebudget allein hilft nicht. Entscheidung: `publicRequestBudget` 240 → 320 und `publicMaxSeconds` 1020 → 1400 in `universe-rollout.json` (dort greift es, #2155); erwartet 170–200 Quellen je Lauf, ca. 850–1.000 Prüfungen je Tag, Gleichgewicht deutlich unter 25 % (Rechnung: 5.309 − 7 × 900 ≈ 0, praktisch begrenzt durch die Taktzahl). Höflichkeit unverändert: `PublicHTTP` (transport.py, `interval=2`, je Host mindestens 5 s, GDELT 15 s) hängt weder von Budget noch von Laufzeit ab; kein Host bekommt mehr als bisher (höchstens 12 Anfragen je Minute und Host, global höchstens 30); die mittlere Gesamtrate bleibt gleich (240/1.020 s = 14,1 je Minute, 320/1.400 s = 13,7 je Minute), nur die Laufzeit wächst. Zeitbudget: Die Pipeline vor dem Pages-Schritt dauert gemessen 41–49 min (nicht mehr die früher angesetzten 25 min), mit +380 s höchstens ca. 56 min; darum `pipelineMaxMs` 56 min und das Job-Limit 100 → 130 min (`refresh-live-verify.mjs` `jobTimeoutMs` und `timeout-minutes` des Jobs `refresh`); garantiertes Warten auf Pages = 130 − 10 (Reserve) − 15 (Live-QA) − 56 = 49 min, über dem Testminimum von 40 min. Frische-Wache bleibt bei 1 h. Beobachtung: Trend über zwei Tage (Soll: überfällig deutlich unter 1.985, Quote auf dem Weg unter 25 %).

**Quelle des Rückstands-Berichts (24.11.2026):** `backlog-slo.mjs` liest die Gesundheitsartefakte über die letzten 20 Läufe von `company-intelligence-refresh.yml` auf `main` und je Lauf dessen Artefakte (`listRefreshArtifacts`), nicht mehr über das repoweite Fenster `actions/artifacts?per_page=100`. Anlass: Die Health-Läufe 20:57 und 00:57 meldeten „kein Vollumfang-Bericht lesbar“ und fielen auf die Stempelbasis zurück, weil der Bericht des 12:10-Laufs bei dem Artefaktaufkommen anderer Läufe nicht mehr im Fenster lag.

**Live-QA und Hosting-503 (24.11.2026, Lauf 45344615779):** Der 07:00-Refresh lieferte aus (DELIVERED, 08:02:40) und brach danach in `universe-browser-qa.mjs --live` bei `requests.every(status===200)` ab. Davor hatte derselbe Schritt 18-mal HTTP 503 (`text/html`) auf Snapshot-Dateien der neuen Generation gelesen; wenige Minuten später lieferten dieselben URLs 200. Das war Hosting-Rauschen im Auslieferungsfenster, kein Inhaltsfehler, löste aber Rollback und Abschaltung aus. Jetzt gilt in `qa-retry.mjs`: sind alle nicht-200-Datenrequests eines Falls 5xx, wird der Fall einmal mit frischer Seite wiederholt (`TransientHostingError`); 4xx, 3xx und Mischformen mit 4xx bleiben sofort ein harter Fehler, jede inhaltliche Prüfung bleibt unverändert. Eine anhaltende 5xx scheitert auch im zweiten Versuch.

**Korrektur Durchsatz: publicMaxSeconds wieder 1020, Anfragebudget 320 bleibt (Steuerung, 24.11.2026):** Der 20:40-Takt (Lauf 45483191760) scheiterte mit `PYTHON_PROCESS_FAILURE` in `POLL_BUILD` nach 1385 s, ohne Auslieferung und ohne Rollback: `refresh-run.mjs` begrenzt den Python-Prozess fest auf 1200 s, `publicMaxSeconds` 1400 passte nicht hinein. `refresh-run.mjs` ist Belegdatei und bleibt unverändert; die Zeitgrenze von 1400 s auf 1020 s zurückgenommen. Test `refresh-timeout-budget.test.mjs` liest den Timeout nur aus `refresh-run.mjs` und verlangt `publicMaxSeconds` plus 120 s Reserve unter dem Prozess-Timeout (1020 + 120 = 1140 s < 1200 s). Das SEC-Zeitbudget (`secMaxSeconds` 240 s) läuft getrennt in einer eigenen HTTP-Sitzung und ist darin nicht enthalten; mehr Durchsatz kommt über mehr wirksame Läufe, nicht über längere. Der Absatz zum Durchsatz Vollumfang oben gilt für Anfragebudget 320; die Zeitgrenze 1400 s ist ersetzt.

**Laufzeit-Frühwarnung (25.11.2026, Steuerung):** Die Voll-Läufe des Python-Refresh enden bei Median 1.140 s und Maximum 1.158 s (16 Läufe seit 20.11.), der feste Prozess-Timeout liegt mit 1.200 s nur 42 s darüber und steht in `refresh-run.mjs` (Belegdatei, gesperrt). Statt die Budgets zu ändern, meldet der Health-Lauf (`backlog-slo.mjs`) ab `runtimeSeconds` > 1.180 s eine WARNING (`runtimeSLO`, `pythonRuntimeSeconds`), nie CRITICAL und ohne Abbruch; `refresh-timeout-budget.test.mjs` hält `publicMaxSeconds` + 120 s unter dem Timeout.

**Mehr wirksame Läufe pro Tag (Entscheidung Steuerung, 25.11.2026):** Der Rückstand (> 7 Tage überfällig) sank in 20 h nur um 75 Quellen: Gemessen sind im Schnitt 143 geprüfte Quellen je Lauf (115–171), rund 650 Prüfungen pro Tag halten den Stand, ca. 900–950 pro Tag bauen den Rückstand in etwa sieben Tagen unter 10 % ab; Mo–Fr trugen die sechs Slots im Schnitt nur etwa 5,2 wirksame Läufe (≈ 744 pro Tag, 12:10 übersprungen, 20:40 rot). Drei Änderungen, alle in `core/registry/schedule.json` und im Refresh-Workflow, keine Belegdatei: (a) Frische-Wache `CI_GATE_GUARD_HOURS` von 1 h auf 30 min, (b) zusätzlicher Werktags-Slot 05:05 UTC (03:10-Lauf endet ca. 04:25, 05:05-Lauf ca. 06:25, 07:00 bleibt mit 35 min Abstand zur Wache; Quants Eignungs-Takt 06:20 wartet in der Pages-Gruppe), (c) Wochenende alle 3 h statt 4 h (8 statt 6 Slots, letzter Start 21:17, Ende vor 23:00). Keine Veröffentlichung fällt dadurch in das Börsenfenster 13:30–21:30 oder in 23–00 UTC. Erwartung: Werktags ≈ 940, am Wochenende ≈ 1.144 Prüfungen pro Tag; Trend zwei Tage beobachten und bei Auffälligkeiten zurückstellen (Test SZ-CI-1).

**profile-source-Takt von 03:47 auf 16:47 UTC verlegt (26.11.2026, Steuerung):** Der tägliche profile-source-Takt (`company-intelligence-profile-source`, `publish=false`, ca. 70–110 min) liegt in derselben Concurrency-Gruppe `company-intelligence-continuous-production` wie der Refresh. Um 03:47 wartete er hinter dem 03:10-Lauf und hielt die Gruppe von 04:15 bis 05:23 besetzt; der neue Werktags-Slot 05:05 startete deshalb erst 05:24 (Lauf 45759259394) und endete 06:38, der 07:00-Takt wurde von der 30-min-Wache übersprungen: kein Netto-Gewinn. Jetzt 16:47 (Werktags zwischen 12:10-Takt, Ende ca. 13:30, und 20:40-Takt, Ende ca. 18:40 weit davor; am Wochenende folgt auf den 15:17-Lauf, Ende ca. 16:35, der profile-source-Takt, der 18:17-Slot wartet dann höchstens ca. 20 min). Die Wiederherstellung (`recover_full_scope`, #2315) ist ein von Hand gestarteter Lauf und bleibt unberührt, der Takt veröffentlicht nichts im Börsenfenster. Test SZ-CI-2.

**publicMaxSeconds 1020 → 980 (Entscheidung Steuerung, 27.11.2026):** Auswertung der 15 Läufe vom 25.11. 03:10 bis 27.11. 07:00: Python-Laufzeit Median 1.141 s, Maximum 1.162,6 s, zwei Läufe über 1.150 s (1.162,6 und 1.156,1), Abstand zum festen Prozess-Timeout (1.200 s, `refresh-run.mjs` gesperrt) mindestens 37 s. Mit 980 s endet der öffentliche Teil 40 s früher (Maximum ca. 1.120 s, rund 80 s Puffer), das kostet etwa 5 geprüfte Quellen je Lauf (ca. 35 pro Tag). Zufluss: ca. 578 Quellen pro Tag werden neu über sieben Tage alt (26.11. 03:10 → 27.11. 03:10: 767 geprüft, Rückstand −189), bei sieben Werktagsläufen sind es ca. 900 geprüfte Quellen pro Tag und netto etwa −320; Rückstand 1.399 von 5.300 (26,4 %) am 27.11. 07:00, WARNING ab ≤ 25 %, HEALTHY ab ≤ 10 %. Test `refresh-timeout-budget.test.mjs` (TB-3) hält 320 und 980.

**Zeitplan-Änderungen lösen die Company-Intelligence-CI aus (27.11.2026):** Der Python-Test `test_scheduled_lanes_cannot_double_four_hour_polling` (in `scripts/company_intelligence/tests/test_coverage_cost.py`) pinnt die Refresh-Takte. #2432 änderte nur `core/registry/schedule.json`; diese Datei stand weder in den Pfaden von `company-intelligence.yml` noch im Produktvertrag, die Python-Suite lief im Gate nicht und der Test blieb unbemerkt rot (erst #2468 fing ihn). Jetzt steht `core/registry/schedule.json` in `core/registry/product-contracts.json` (`companyIntelligence.paths`) und in den `paths` von `company-intelligence.yml`.

**Zeitlimit-Fehler der Historienablage wieder als TIMEOUT erkannt (27.11.2026):** #2426 (26.11.) lässt `scripts/market/storage/s3-driver.mjs` ein abgebrochenes S3-Request als `Error('… Zeitlimit … ms (Versuch n)')` ohne Namen `TimeoutError` melden; `codeOf` (`observe-production.mjs`) meldete dafür `Error` statt `TIMEOUT`, Test `observe-cli.test.mjs` (codeOf) war rot, die CI lief nicht, weil `s3-driver.mjs` nicht in den Pfaden von `company-intelligence.yml` stand. `codeOf` erkennt jetzt „Zeitlimit“ als TIMEOUT; `scripts/market/storage/s3-driver.mjs` steht in den Pfaden der CI und im Produktvertrag.

**ROBOTS_TEMPORARY_FAILURE: Diagnosezeile im Lauf-Log (Steuerung 27.11.2026):** Seit mindestens 25.11. 03:10 UTC endet ein schubweise großer Teil der geprüften Quellen mit ROBOTS_TEMPORARY_FAILURE (27.11. 12:10: 100 von 193; 26.11. 03:10: 43 von 149; Läufe dazwischen 0). Eine solche Quelle gilt nicht als geprüft (das Alter rechnet aus `lastSuccess`), bleibt im Rückstand und kostet eine robots.txt-Anfrage je Origin und Lauf. Welche Hosts und welcher Fehler dahinterstehen, steht nur im privaten Quellenstand. `transport.py` schreibt deshalb bei einem gescheiterten robots.txt-Abruf eine Zeile `ROBOTS_DIAG origin=<Schema>://<Host> error=<Fehler> cause=<Ausnahmeklasse>` ins Lauf-Log (je Origin einmal pro Lauf; kein Pfad, keine Query, keine Zugangsdaten; Test `test_robots_diag.py`). Das Abrufverhalten ist unverändert, robots.txt wird nie umgangen. Auswertung nach dem ersten Takt mit den Zeilen; erst danach wird ein Fix entschieden.

**Toter Testschritt im Job preview entfernt, übrige schedule-Zweige offen (Steuerung 28.11.2026):** Der Schritt „Validate isolated engine before a scheduled batch“ in `company-intelligence.yml` lief nur bei `github.event_name == 'schedule'`; seit der Umstellung auf den Cloudflare-Wecker (alle Takte per `workflow_dispatch`) lief er nie mehr. Er führte dieselben Python- und Node-Tests aus wie der Job `validate`, von dem `preview` abhängt (`needs: validate`), und war damit ein Duplikat, keine verlorene Prüfung. Er ist entfernt. **Offener Punkt:** Die übrigen `schedule`-Zweige im Job `preview` (sec-stream-Batch, Durable-State-Restore und -Push bei `schedule`, `LIVE_SOURCES`) laufen seit der Wecker-Umstellung ebenfalls nicht mehr; sie sind bewusst unberührt (Eingriff in Durable-State-Pfade) und brauchen eine eigene Entscheidung (entfernen oder bewusst dispatch-only dokumentieren).

**Blockiert vom Betreiber: eigene Zahl statt stillem Herausrechnen (Entscheidung Steuerung 28.11.2026):** Am 28.11. (00:17 und 03:17 UTC) waren 176 von 176 robots.txt-Fehlern HTTP 403 auf 173 verschiedenen Hosts, überwiegend IR-Seiten mit Bot-Schutz; das ist je Host dauerhaft, keine vorübergehende Störung. Nur robots.txt mit HTTP 403 oder 401 gilt als „vom Betreiber blockiert“ (`blocked_by_operator` in `transport.py`); 5xx, Timeout, DNS und alles andere bleibt vorübergehend. Eine solche Quelle ruht nach drei Fehlschlägen in Folge sieben Tage (statt höchstens 72 Stunden), robots.txt wird nie umgangen. Die Messlatte bleibt ehrlich: Die Quellen bleiben im Rückstand (`dueOverSevenDays`, Nenner unverändert), werden aber im Health als eigene Zahl `blockedByOperator` mit Anteil an den aktiven Quellen ausgewiesen (`sourceRegistryAudit.blockedByOperator` aus `source_registry_audit.py`, im Urteil von `backlog-slo.mjs` als `blockedByOperator`/`blockedByOperatorSLO`); ein eigener Alarm (WARNING, nie CRITICAL) greift, sobald der Anteil über 15 % der aktiven Quellen steigt. Grund: ein Anteil, der nicht mehr durch unsere Last, sondern durch Sperren der Betreiber verursacht wird, soll sichtbar bleiben, damit niemand den Rückstand als gelöst liest und das Produkt keine stille Lücke hat.

**Refresh-SLO auf /status/ (Steuerung 28.11.2026):** Das Urteil von `backlog-slo.mjs` (Rückstand, Anteil „blockiert vom Betreiber“, Laufzeit, Lane-Stempel) steht nicht mehr nur im Workflow-Artefakt, sondern als Aggregat `company-intelligence/data/refresh-slo.json` (nur Zahlen, Verlauf der letzten 60 Berichte, kein Quellen-, Host- oder Inhaltsbezug; Baustein `refresh-slo-aggregate.mjs`). Schreibweg: der Health-Workflow (alle 4 h) legt sie über `scripts/ci/push-data-branch.sh` in den Datenzweig `data/live` (`core/registry/data-branch.json`, `companyIntelligenceRefresh`, BRANCH_ONLY), nie nach `main`; es entsteht kein zusätzlicher Commit auf `main`, also auch kein Release-Auslöser und kein Push-Aufschub. Warum nicht an den Commit des Refresh-Laufs: der Refresh-Job ist lesend, sein einziger Commit entsteht in `refresh-run.mjs` (Belegdatei), und der Pages-Marker schreibt genau eine Datei über die Contents-API. Der Health-Workflow bekommt `contents: write` nur auf Job-Ebene (der Push-Baustein verweigert `main`). `core/registry/domains.json` führt die Domäne `companyIntelligenceRefresh` (Frische: Warnung ab 12 h, veraltet ab 36 h), `/status/` zeigt Zustand, Rückstand, Anteil blockiert und den Verlauf (Abschnitt „Company Intelligence · Refresh“). Bis zum ersten Lauf nach dem Merge fehlt die Datei (`pendingFirstRun`).

**Richtigstellung zu „Blockiert vom Betreiber“ (Steuerung 28.11.2026):** Der Absatz „Blockiert vom Betreiber: eigene Zahl statt stillem Herausrechnen“ (#2488) beschreibt `blockedByOperator` als Zahl im Health der Produktions-Takte. Das stimmt nicht: Die Zahl entsteht in `source_registry_audit.py`, und `refresh-run.mjs` ruft den Audit nur mit `--source-audit` auf, den `company-intelligence-refresh.yml` nur bei Verifikationsläufen setzt. Die Produktions-Takte tragen deshalb kein `sourceRegistryAudit`; `blockedByOperator` im Aggregat blieb `null` und der Alarm „über 15 % der aktiven Quellen“ konnte nicht auslösen. Seit dem Fix zeigt das Aggregat (`refresh-slo.json`, `/status/`) den **Anteil der in einem Lauf geprüften Quellen, die an robots.txt scheiterten** (`sourceOutcomes.ROBOTS_TEMPORARY_FAILURE` im Verhältnis zu `sourcesChecked`; fehlt der Schlüssel, waren es null), mit Verlauf je Lauf. Das ist **nicht** der Anteil der aktiven Quellen. Alarm: gleitend über die letzten 3 Läufe (Summe der Fehlschläge durch Summe der geprüften Quellen), WARNING über 25 %, nie CRITICAL, erst ab 3 Läufen, damit einzelne Ausreißer nicht auslösen; die Schwelle 25 % ist eine Entscheidung nach der Lage vom 28.11. (125 von 207 um 00:17, 53 von 165 um 03:17, 9 von 118 um 09:17, 6 von 115 um 12:17: die ersten beiden Läufe hätten ausgelöst, die späteren nicht). Der Anteil der aktiven Quellen bleibt ein Tageswert: Der Quellen-Audit soll einmal täglich in einem Takt mit viel Luft laufen (Vorschlag nach der Messung der Audit-Dauer; Eingriff in die Produktionskette erst nach Freigabe der Steuerung), bis dahin bleibt `blockedByOperator` leer.
