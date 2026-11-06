> Aktueller Nachweis vom 7. Oktober: [Accepted-State Recovery](COMPANY_INTELLIGENCE_ACCEPTED_STATE_RECOVERY.md). Der akzeptierte Originalbestand ist inzwischen privat in R2 gesichert und auf unabhängigem Runner exakt wiederhergestellt. Frühere fehlende-Bestandsmeldungen unten sind historische Befunde. Kein Merge und keine öffentliche Aktivierung.

# Aktuelle sichere Übergabe und Discover-Beta — 6. Oktober 2026

Aktuelle Fortsetzung: [Full-Data State Handoff](COMPANY_INTELLIGENCE_FULL_DATA_HANDOFF.md). Authentifizierte Actions-Prüfung bestätigt den privaten R2-Bucket, findet aber keinen aktuellen Rollout-State-Pointer (`REMOTE_STATE_MISSING_INITIALIZATION_REQUIRED`). Kein Restore, kein kleiner Ersatzbestand und keine externe Full-Data-Freigabe.

Die Produktarbeit erfolgt auf `feature/company-intelligence-discover-beta` (#455). Die neueren Engine-Commits bis `59d8c2d527c58e3f129cf95abe7bc237664a76fb` wurden ohne PR-Merge übernommen. Der fremde aktive Coverage-Worker wird nicht verändert. Dieser Workspace besitzt weiterhin keinen erweiterten privaten Ledger; externe Sicherung und frischer authentifizierter Restore bleiben offen. Die bisherige lokale Vorschau ist ausschließlich der kleinere `REVIEW_ONLY`-Kandidat und kein Full-Data-Nachweis. Bisheriger Produktbericht: [COMPANY_INTELLIGENCE_DISCOVER_BETA.md](COMPANY_INTELLIGENCE_DISCOVER_BETA.md).

---

## Checkpoint: SEC annual website candidates and exact trademark-owner recovery — 2026-10-06

Validated implementation checkpoint while the bounded August discovery worker continues. The existing ownership version remains `corporate-ownership-10`; no blanket inventory reset occurs. An exact, same-legal-company trademark notice after a copyright address no longer extends the copyright owner incorrectly. Longer subsidiary owners, different trademark owners, and different initial copyright owners remain conflicting; four regression tests cover these cases.

`scripts/company_intelligence/sec_site_candidates.py` reads only the current exact-CIK issuer’s latest primary 10-K, 20-F, or 40-F filed within 365 days. Explicit website declarations produce candidates with filing provenance, a bounded excerpt and document hash. They confer no ownership authority: the unchanged corporate verifier and normal IR/source discovery must independently accept them. Raw SEC filing bodies and submissions are not persisted. Existing SEC HTTP fair-access rate limits and declaring User-Agent are reused without modifying Quant.

`scripts/company_intelligence/sec_site_runner.py` freezes its cohort and saves each result in the existing private ledger. It resumes pending candidates, retains independent candidate conflicts, bounds requests/time, cools down temporary errors and opens a short SEC-route circuit after four consecutive transient failures. An interrupted process preserves completed candidates. Use an existing restored intelligence ledger: `PYTHONPATH=scripts python -m company_intelligence.sec_site_runner --root . --state .company-intelligence --run-id annual-narrative-ownership-oct6 --limit 25 --request-budget 50 --max-seconds 300`. The command is an explicit discovery operation, not production polling; the 4-hour/12-hour/12–24-hour source cadence and rollout gates remain unchanged.

Validation: **626 full Company Intelligence Python tests passed** (48.873 seconds), including ten SEC candidate/parser/resumability tests and the four copyright-notice regressions. The final read-only live probe used four SEC requests for two exact-CIK annuals and recovered the declared AbbVie investor-relations root and American Airlines website/IR references; no ownership state was changed and no filing body was persisted. Exact SEC issuer-name possessives are supported; an unrelated name cannot supply that declaration. New candidate-derived coverage is not claimed at this implementation checkpoint. The following coverage report remains the preceding immutable, audited milestone; the active run will receive its own downstream metrics and restore proof.

# Company Intelligence — candidate completion and recovery (in progress)

Coverage measured **2026-10-06T14:00:37Z**; pass/queue checkpoint snapshot **2026-10-06T14:02:17Z**. Branch `feature/company-intelligence-rollout`, PR [#356](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/356). **Do not merge.** Production gates remain off. This report follows the requested 32-section structure and will be refreshed as resumable discovery continues.

### Ownership precision checkpoint — long subsidiary names

The copyright verifier now inspects the full existing 300-character ownership region for a legal suffix after the listed-company prefix. It rejects a ROOT-like extended owner even when more than four words separate the parent name from the subsidiary suffix. Hard separators, rights notices and explicit trademark-attribution clauses delimit the region; exact Aquestive and Invivyd copyright owners remain accepted. A new rejection contract fails on the preceding producer, and three new contracts cover extended owners, rights notices and actual cached trademark patterns. All 34 ownership contracts pass. A zero-request, read-only comparison of 54 current hash-verified operational root proofs preserves all 42 previously accepted roots and all 12 previously withheld roots; 1,701 missing current root caches remain untested. No ownership-version bump, global cooldown reset, candidate mutation or coverage gain is claimed. All 589 Company Intelligence Python tests pass (49.323 seconds). Discovery and resumable August metadata work continue; PR #356 remains open and unmerged.

### WordPress coverage discovery checkpoint — advertised feeds and REST

The existing WordPress metadata adapter now runs after advertised RSS validation. An empty/default or unrelated blog feed no longer suppresses an advertised, schema-proven REST news collection; a qualifying existing news source still prevents unnecessary fallback. The new `company_intelligence.wordpress_backfill` command freezes verified same-host WordPress IR identities lacking accepted first-party news, rechecks the current IR identity and approved host, reads the IR page and follows only its advertised API. It uses the existing adapter, issuer eligibility, ingestion, source health, writer lock, circuit breaker and private checkpoints. Each candidate outcome, pending identity, retry time, cumulative traffic and recovered issuer survives restart. Earlier REST access cooldowns and successful evaluated sources are preserved. Unexpected child exit still packs the idle durable ledger, as verified by a fresh restore test.

A zero-request planning census identified **121 eligible issuer identities** and withheld **11 unapproved IR-host identities**. This is a discovery cohort, not a coverage gain; the actual frozen count and accepted news will be measured after invocation. Resume bounded batches with `PYTHONPATH=scripts python -m company_intelligence.wordpress_backfill --root . --state .company-intelligence --run-id wordpress-missing-news-oct6 --limit 16 --request-budget 160 --max-seconds 900 --network`. All **599 Python tests pass (48.718 seconds)**, including **18 targeted WordPress contracts**. The empty-feed fallback contract fails on the preceding producer. No production gates, polling frequency, ownership thresholds, calendar estimator or unrelated product code changed. PR #356 remains open and unmerged.

## 1. Executive result

Verified domains increased **769 → 2546**. The **1777-new-domain cohort** now has **1596 IR pages, 1418 issuers with accepted news, 644 calls, 588 webcasts, 1285 presentations and 746 issuers with management content**. These are actual stored/consumer-exported references and metadata, not just candidate processing. The original frozen inventory is fully classified: 4248 / 4248, with 0 unchecked. Supplementary and due-time recovery queues remain separate. Downstream IR and source expansion continues.

**Historical-state limitation:** the preceding expanded private research ledger was not uploaded to R2 and is absent from this fresh workspace. No authenticated R2 credential bindings are available. Its committed 769 domains/510 source descriptors survive. New ledger totals are reconstructed measurements; they must not be added to lost historical per-issuer sets. The historical 519-news/137-call/212-presentation totals cannot be reported as exact current unions. Original historical reports are retained below with their timestamps.

| Component | Historical baseline | Current reconstructed ledger | Actual new-domain cohort | Current universe percentage |
|---|---:|---:|---:|---:|
| Verified domain | 769 | 2,546 | 1,777 | 41.89% |
| IR | 326 | 2,280 | 1,596 | 37.51% |
| News 180d | 519 | 2,601 | 1,418 | 42.79% |
| Call | 137 | 1,069 | 644 | 17.59% |
| Dated call | 120 | 943 | 559 | 15.51% |
| Webcast | 111 | 856 | 588 | 14.08% |
| Presentation | 212 | 1,821 | 1,285 | 29.96% |
| Transcript reference | 64 | 403 | 259 | 6.63% |
| Any management content | 149 | 1,106 | 746 | 18.2% |
| Confirmed upcoming earnings | 44 | 161 | 85 | 2.65% |

## 2. Candidate inventory — starting versus current

Prior private ledger: 4,283 total / 2,358 classified / 1,925 unchecked. Reconstructed original frozen inventory: **4,248**, with 35 old identities unavailable from Git. Runtime metadata imports have produced **4501** candidate identities. The current exact runtime funnel is **4501 processed / 0 unchecked**. Configured seeds and durable ambiguity/cooldown outcomes count as classifications, not fresh network verification.

| Durable current classification | Candidate identities |
|---|---:|
| AMBIGUOUS | 337 |
| BLOCKED | 141 |
| CONFLICTING_OWNER | 490 |
| DEFERRED_BUDGET | 15 |
| INSUFFICIENT_EVIDENCE | 752 |
| MISSING_PAGE | 19 |
| REDIRECTED | 68 |
| TEMPORARILY_UNAVAILABLE | 131 |
| UNRESOLVED | 3 |
| VERIFIED_OFFICIAL | 2,545 |

| Requested funnel field | Current checkpoint count |
|---|---:|
| TOTAL CANDIDATES | 4,501 |
| PROCESSED | 4,501 |
| VERIFIED | 2,545 |
| INSUFFICIENT OWNERSHIP | 752 |
| TEMPORARY FAILURE | 131 |
| BLOCKED | 141 |
| CONFLICTING | 490 |
| REDIRECTED | 68 |
| WRONG | 0 |
| DEAD | 0 |
| UNRESOLVED | 374 |
| UNCHECKED | 0 |
| RECOVERED ON SECOND PASS | 220 |
| RECOVERED ON THIRD PASS | 139 |

The requested UNRESOLVED bucket includes ambiguous ownership, bounded-budget deferrals, missing pages and any unchecked identities; their exact raw states are listed below. Missing pages and temporary DNS failures are not asserted dead. The requested outcome buckets partition the candidate inventory; master-wide verified-domain coverage uses a separate denominator.

WRONG_COMPANY, DEAD, PARKED, SUBSIDIARY_ONLY and BRAND_ONLY are zero explicit classifications; missing pages/unproven ownership/DNS failures are not relabelled as those states. The total unresolved/unproven population is **1956**; the explicit UNRESOLVED state is 3. Neither is an unchecked-candidate count. Second-pass unique verified recoveries: **220**; third-pass unique verified recoveries: **139**. Cohorts overlap historically; pass rows are not blindly summed into total candidates.

## 3. First pass

Frozen main pass: **4248 / 4248 classified**, **3141 cumulative fresh attempts**, **0 pending**, **527 due-time retry records**. Completed candidates persist individually. A restart selects unattempted pending identities before due retries. The original eight-worker domain batches selected up to 50 identities within the unchanged 200-request cap, interleaving eight-issuer IR/source ingestion every two domain batches. Current targeted recovery uses four workers and two-second admission; broad IR uses eight workers, one-second admission and its independent healthy circuit. The driver checkpoints every ten batches and on circuit, no-due, stop-file or bounded-run completion.

## 4. Second pass

Live prior insufficient-ownership and temporary-failure cohorts remain resumable. **220 distinct recovered domains** are supported by strong retained evidence. Source cooldowns and actual transport failures remain separate from unsafe identity failures.

| Pass | Frozen cohort | Classified | Pending | Validated outcomes | Requests |
|---|---:|---:|---:|---:|---:|
| complete | 4248 | 4248 | 0 | 1292 | 10977 |
| second-network | 74 | 74 | 0 | 16 | 210 |
| second-ownership-live | 235 | 235 | 0 | 46 | 1046 |
| second-dns-live | 125 | 125 | 0 | 41 | 433 |
| second-budget-live | 215 | 215 | 0 | 100 | 1436 |
| second-owner-v10 | 458 | 458 | 0 | 17 | 1927 |
| third-due-temporary | 223 | 223 | 0 | 46 | 1133 |
| third-orphan-recovery | 40 | 40 | 0 | 9 | 318 |
| publisher-owner | 25 | 25 | 0 | 0 | 48 |
| supplementary | 67 | 67 | 0 | 27 | 211 |
| metadata-new | 7 | 7 | 0 | 3 | 25 |
| metadata-additions | 11 | 11 | 0 | 7 | 35 |
| metadata-late | 23 | 23 | 0 | 10 | 66 |
| metadata-after-ir | 15 | 15 | 0 | 9 | 46 |
| metadata-after-news | 20 | 20 | 0 | 8 | 82 |
| metadata-after-recovery | 10 | 10 | 0 | 5 | 40 |
| third-footer | 3 | 3 | 0 | 3 | 0 |
| third-title-live | 2 | 2 | 0 | 2 | 6 |
| third-q4-live | 7 | 7 | 0 | 1 | 25 |
| third-redirect-live | 29 | 29 | 0 | 5 | 146 |
| third-legal-priority | 20 | 20 | 0 | 2 | 17 |
| third-copyright | 2 | 2 | 0 | 2 | 0 |
| metadata-after-backfill | 13 | 13 | 0 | 8 | 43 |
| metadata-late-backfill | 8 | 8 | 0 | 3 | 22 |
| metadata-after-current-news | 0 | 0 | 0 | 0 | 0 |
| current-news-tail-v2 | 0 | 0 | 0 | 0 | 0 |
| current-news-tail-v3 | 0 | 0 | 0 | 0 | 0 |
| current-news-tail-v4 | 0 | 0 | 0 | 0 | 0 |
| current-news-tail-v5 | 0 | 0 | 0 | 0 | 0 |
| current-news-tail-v6 | 0 | 0 | 0 | 0 | 0 |
| current-news-tail-v7 | 0 | 0 | 0 | 0 | 0 |
| current-news-tail-v8 | 0 | 0 | 0 | 0 | 0 |
| current-news-tail-v9 | 0 | 0 | 0 | 0 | 0 |
| current-news-tail-v10 | 3 | 3 | 0 | 1 | 13 |
| current-news-tail-v11 | 0 | 0 | 0 | 0 | 0 |
| current-news-tail-v12 | 11 | 11 | 0 | 6 | 46 |
| current-news-tail-v13 | 4 | 4 | 0 | 3 | 22 |
| current-news-tail-v14 | 0 | 0 | 0 | 0 | 0 |
| current-news-tail-v15 | 8 | 8 | 0 | 4 | 35 |
| current-news-tail-v16 | 8 | 8 | 0 | 4 | 24 |
| current-news-tail-v17 | 10 | 10 | 0 | 2 | 34 |
| current-news-tail-v18 | 11 | 11 | 0 | 2 | 41 |
| current-news-tail-v19 | 3 | 3 | 0 | 2 | 8 |
| current-news-tail-v20 | 4501 | 601 | 3900 | 0 | 49 |
| current-news-tail-v21 | 12 | 12 | 0 | 0 | 0 |
| current-news-tail-v22 | 10 | 10 | 0 | 0 | 0 |
| current-news-tail-v23 | 18 | 18 | 0 | 11 | 60 |
| current-news-tail-v24 | 8 | 8 | 0 | 2 | 26 |
| oversized-owned-ir-v1 | 24 | 24 | 0 | 6 | 137 |

A current zero-request home-logo ownership shadow review examined 875 eligible unresolved states, 45 retained root pages and 15 pages with scoped home-logo labels. It found zero additional strong ownership proofs; no verifier change or new recovery is claimed. Live older-version ownership rechecks continue in the durable cohort. Cached second reviews additionally recorded all missing-cache/rejected outcomes with zero requests; they are not claimed as recoveries. The missing preceding 578-temporary/578-insufficient cohorts cannot be fabricated; current logical second cohorts derive from retained reconstructed outcomes.

The separate 769-issuer retained-seed IR recovery now has immutable private phase receipts: {"firstpass-final": {"asOf": "2026-10-06T00:42:14Z", "componentCounts": {"anyCallContentReference": 357, "anyNews180d": 512, "anyNews30d": 364, "anyNews7d": 165, "callDates": 244, "calls": 287, "confirmedUpcomingEarnings": 62, "irPageFound": 683, "preparedRemarks": 19, "presentations": 529, "shareholderLetters": 27, "transcriptLinks": 144, "webcasts": 265}, "componentSnapshotAvailable": true, "progress": {"candidateIssuers": 769, "classified": 769, "freshAttempts": 776, "interpretation": "Reused/cooldown/ambiguous classifications are not fresh network verifications.", "lane": "ir", "networkRequests": 6397, "passId": "inventory-20261005-retained-seed-ir", "pending": 0, "retryPending": 103, "statuses": {"DEFERRED": 92, "DEGRADED": 24, "VALIDATED": 653}}}, "secondpass-final": {"asOf": "2026-10-06T01:27:45Z", "componentCounts": {"anyCallContentReference": 359, "anyNews180d": 545, "anyNews30d": 392, "anyNews7d": 181, "callDates": 250, "calls": 292, "confirmedUpcomingEarnings": 64, "irPageFound": 683, "preparedRemarks": 19, "presentations": 535, "shareholderLetters": 27, "transcriptLinks": 144, "webcasts": 267}, "componentSnapshotAvailable": true, "progress": {"candidateIssuers": 769, "classified": 769, "freshAttempts": 847, "interpretation": "Reused/cooldown/ambiguous classifications are not fresh network verifications.", "lane": "ir", "networkRequests": 7441, "passId": "inventory-20261005-retained-seed-ir", "pending": 0, "retryPending": 32, "statuses": {"DEFERRED": 21, "DEGRADED": 25, "VALIDATED": 723}}}, "thirdpass-final": {"asOf": "2026-10-06T02:34:35Z", "componentCounts": {"anyCallContentReference": 360, "anyNews180d": 553, "anyNews30d": 396, "anyNews7d": 185, "callDates": 251, "calls": 293, "confirmedUpcomingEarnings": 65, "irPageFound": 684, "preparedRemarks": 19, "presentations": 536, "shareholderLetters": 27, "transcriptLinks": 144, "webcasts": 268}, "componentSnapshotAvailable": true, "progress": {"candidateIssuers": 769, "classified": 769, "freshAttempts": 868, "interpretation": "Reused/cooldown/ambiguous classifications are not fresh network verifications.", "lane": "ir", "networkRequests": 7756, "passId": "inventory-20261005-retained-seed-ir", "pending": 0, "retryPending": 12, "statuses": {"DEFERRED": 1, "DEGRADED": 25, "VALIDATED": 743}}}}. Exact same-cohort second/third transitions: {"second": {"baselineAsOf": "2026-10-06T00:42:14Z", "componentGains": {"anyCallContentReference": 2, "anyNews180d": 33, "anyNews30d": 28, "anyNews7d": 16, "callDates": 6, "calls": 5, "confirmedUpcomingEarnings": 2, "irPageFound": 0, "preparedRemarks": 0, "presentations": 6, "shareholderLetters": 0, "transcriptLinks": 0, "webcasts": 2}, "componentLosses": {"anyCallContentReference": 0, "anyNews180d": 0, "anyNews30d": 0, "anyNews7d": 0, "callDates": 0, "calls": 0, "confirmedUpcomingEarnings": 0, "irPageFound": 0, "preparedRemarks": 0, "presentations": 0, "shareholderLetters": 0, "transcriptLinks": 0, "webcasts": 0}, "finalAsOf": "2026-10-06T01:27:45Z", "interpretation": "Component transitions describe the frozen issuer cohort during this phase, not causality for every stored item; news-window expiration is separately retained.", "recoveredSuccessfulIRIssuers": 70}, "third": {"baselineAsOf": "2026-10-06T01:27:45Z", "componentGains": {"anyCallContentReference": 1, "anyNews180d": 8, "anyNews30d": 4, "anyNews7d": 4, "callDates": 1, "calls": 1, "confirmedUpcomingEarnings": 1, "irPageFound": 1, "preparedRemarks": 0, "presentations": 1, "shareholderLetters": 0, "transcriptLinks": 0, "webcasts": 1}, "componentLosses": {"anyCallContentReference": 0, "anyNews180d": 0, "anyNews30d": 0, "anyNews7d": 0, "callDates": 0, "calls": 0, "confirmedUpcomingEarnings": 0, "irPageFound": 0, "preparedRemarks": 0, "presentations": 0, "shareholderLetters": 0, "transcriptLinks": 0, "webcasts": 0}, "finalAsOf": "2026-10-06T02:34:35Z", "interpretation": "Component transitions describe the frozen issuer cohort during this phase, not causality for every stored item; news-window expiration is separately retained.", "recoveredSuccessfulIRIssuers": 20}}. Component increases and expirations are reported separately; these downstream phases do not change the completed domain-inventory denominator.

The protected Boeing followup was admitted at its retained 03:20:43Z due time and completed with one additional HTTP request plus retained cache evidence. The 769-root seed cohort now has 744 validated walks, 25 degraded outcomes, zero unchecked and zero capacity deferrals. This is one additional recovery after the immutable third-pass baseline; the original 70 second-pass / 20 third-pass outcomes are not rewritten. Eleven temporary retry records retain their individual due times. This completion is a discovery outcome, not an inferred new news/call/material gain.

## 5. Third pass and current ceiling

Targeted footer/title/Q4-credit/redirect and oversized-root IR passes have **139 distinct verified recoveries**. Footer reanalysis recovered Rush Enterprises, Outdoor Holding and Wintrust without network; complete-title checks recovered Coffee Holding and Harmony; precise Q4-credit handling recovered Integer; redirect checks recovered M&T Bank, Magnera, National Beverage, NL and Big Sky Industrial. The new targeted legal-route pass recovered Accenture and Fastly through their advertised first-party privacy pages; 20 identities were classified using 17 requests, and transport cooldowns remain intact. The targeted copyright-format replay also recovered Park Hotels & Resorts and PAVmed from retained exact owner/header proof without network. Unsafe conflicts remain rejected. Remaining temporary cases keep due times. During the later shared outage, 22 budget-deferred cached roots still needed an uncached ownership route (zero HTTP); their live retries remain queued. Only two older ownership cases had retained root bodies; a strict cache-only version-10 replay recovered neither (zero HTTP), retaining live upgrade eligibility. A second cached IR cohort processed 16 recently verified roots with zero requests, adding two IR pages and three further presentation issuers. The technical free-source ceiling has **not** been established while pending candidates and recoverable retries remain.

The targeted temporary-failure cohort has **223 / 223 classified**, **0 pending**, and **46 strong verified recoveries**. Its explicit downstream IR snapshot contains only these recoveries: **46 / 46 classified**, **46 successful discovery outcomes**, **0 retry records**. Earlier shared failures retain cooldowns; healthy IR work continues independently. The metadata-derived ownership cohort has **25 / 25 classified**, **0 pending**, **0 verified** and **48 discovery requests**. It originally froze 25 currently due single-route CANDIDATE identities and left 61 source cooldowns intact. Publisher metadata supplies a candidate, never ownership proof. Multiple owners/routes are excluded and only strong recoveries enter its explicitly frozen downstream IR cohort.

A zero-HTTP current-cache review of all 523 ownership conflicts found no safe additional recovery: 500 lacked complete current evidence, 17 had ambiguous candidate routes and six still failed the current independent verifier. No footer conflict was auto-resolved. The older ownership cohort is now fully classified and its remaining recoverable deferrals retain due times. The due-temporary and publisher-derived queues likewise preserve outcomes. A zero-HTTP isolated JSON-LD name-field shadow checked the largest insufficient-ownership cluster: one potential Penguin Solutions recovery, 125 continued failures, 643 without complete current cache and 29 unsafe/ambiguous routes. No live verification rule or issuer outcome changed; the one potential field extension remains uncounted and low leverage relative to pending IR/source coverage.

The targeted single-route orphan recovery cohort contains **40 candidates**, **40 classified**, **0 unchecked**, **22 recoverable retry records** and **9 strong recoveries**, using **318 recorded discovery requests**. A retained DEFERRED / NETWORK_TIME_BUDGET_EXHAUSTED ownership attempt now receives a selective maximum 180-second candidate budget; unrelated attempts retain 60 seconds. The private invocation hint never mutates master/state identity. Shared batch deadline/request caps, source cooldowns, robots pacing, conflict rejection and circuits remain enforced. Three restored behavioral tests cover a simulated 75-second legal route, unchanged unrelated ceilings, global deadlines and protected offline/cooldown selection. The pre-fix producer fails the recovery regression. Live gains are counted only in the exact cohort results above, never inferred from the passing test. Smaller eight-candidate bounded retry batches retain original due times.

The zero-HTTP budget-cluster census found 48 IR deferrals, each with actual requests and retained partial discovery, rather than discarded unsent identities. The normal 200-request batch admits at most 16 issuers, giving 12 requests apiece. After pending identities finish, the planned targeted retry selects eight due issuers under the same 200-request global cap, allowing 25 per issuer; the global deadline, circuits, robots and existing cooldowns remain enforced. No production frequency is increased and no recovery is claimed until measured.

A zero-HTTP review recovered 702 still-fresh missing roots from 56 existing private restore checkpoints, then 730 exact advertised evidence pages selected by the existing two-route verifier. Hashes, requested URL identity, body limits and the existing 24-hour freshness bound were enforced. Across 704 replayed roots, no additional strong ownership proof was found: 635 remained insufficient, 46 retained unproven redirects, and 23 still need uncached pages. No live owner, source health, due time or coverage flag changed. This review reduces uncertainty in the large ownership cluster; it is not counted as a domain recovery.

The targeted broad-IR budget recovery baseline contains 62 retained deferred issuers; 61 now have successful discovery outcomes after smaller due batches under the same 200-request global cap. Actual downstream component gains are measured separately.

The coordinator stopped at an empty recovered-events cohort: coverage aggregation was called with zero companies. Completed September metadata, domain verification and source facts remained intact. An idle-writer recovery checkpoint preserved 242,312,387 expanded bytes / 28,102,459 compressed bytes, SHA-256 `4ef7e45fda6156d58a0cb6f2b67d598126819e54f2f5a7ea5eda6c240cbb1292`. The local metrics guard returns empty recovery sets without changing ownership, source selection, health, cooldowns or cadence. The same source cohort resumes rather than restarting discovery.

Only a due IR walk whose retained reason is NETWORK_TIME_BUDGET_EXHAUSTED receives a local 360-second candidate retry ceiling. Other IR walks retain 180 seconds; domain policy remains unchanged. The batch deadline, partitioned/shared request limits, robots pacing, circuit and persisted cooldowns still apply. A restored simulated 250-second walk fails with the previous ceiling and succeeds with this selective allowance; unrelated DNS/request-budget attempts remain deferred. Two additional contracts prove the shared deadline/request bound and future-cooldown/offline exclusion. No master or durable state contains the invocation hint. Live residual-cohort outcomes below are measured separately from tests.

The dated 03:01:35Z temporary-domain review completed 48 bounded HTTP requests, recovered zero new domains and opened the shared-proxy circuit again across unrelated hosts. Nineteen attempts received durable outcomes; one ownership-only result is now insufficient evidence, while transport/DNS/429/proxy failures remain deferred with their original new due times. Domain infrastructure has not broadly recovered. The unaffected publisher/IR lanes continue independently; no underlying company is invalidated merely for a transient failure.

The targeted residual request/time-budget pass froze 27 due identities, durably classified 27, left 0 pass entries pending and recovered 10 strong owners. Original cooldowns, the existing selective timeout allowance and shared-proxy circuit remain authoritative. Recovered owners receive bounded IR/source follow-through; source and component counts below are measured independently. Current statuses: {'COOLDOWN': 2, 'VALIDATED': 10, 'AMBIGUOUS': 4, 'REJECTED': 9, 'DEFERRED': 2}. This queue is separate from the original first/second/third-pass recovery counts.

The continuing advertised bare/WWW root-form recovery retains 233 original identities, classifies 233, leaves 0 pass entries pending and recovers 53 independently proven owners. Current states are {'ALREADY_VERIFIED': 69, 'COOLDOWN': 70, 'VALIDATED': 53, 'REJECTED': 30, 'DEFERRED': 11}. Both original forms retain ownership/hash evidence; unavailable, conflicting or divergent forms do not yield a verified owner. New owners receive bounded IR/source follow-through. The remaining frozen alias inventory resumes in subsequent batches, rather than restarting or declaring these opportunities blocked without attempts.

The root-form census is corrected against approved configured domain proof: its 233 frozen records include 67 already approved issuers and 166 without verified ownership. The original census considered only missing runtime officialSite proof, so its opportunity label was too broad. Original frozen identities remain intact; reused seeded proofs are local classifications, never newly verified domains or component gains. Individual cooldowns and the shared circuit still govern the remaining attempts.

The historical 06:23:54Z strict zero-HTTP root-alias shadow reviewed the original 166 unverified frozen records: {'CACHE_INCOMPLETE': 166}. No pair had complete retained proof at that review, so the subsequent live bounded verification was necessary. No outcome, source health or ownership rule was changed, and zero coverage is claimed from this review.

The alias cohort's original 70 cooldown records retain {'2026-10-11': 57, '2026-10-12': 13} and reasons {'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED': 27, 'HTTP_403': 2, 'ROBOTS_UNAVAILABLE:HTTP_403': 6, 'HTTP_404': 2, 'ROBOTS_DISALLOWED': 3, 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER': 30}; none of these records is a recent shared-proxy deferral. The original 96 pending records were then processed through the same durable queue; its current census is reported separately. Ownership-conflict/access cooldowns are not erased to manufacture retry gains; no new domain is claimed from the zero-HTTP census.

The zero-HTTP infrastructure census at 2026-10-06T06:49:46Z found 102 unresolved domain records with retained shared-proxy or robots503 reasons, of which 96 were currently due; groups {'DUE:ROBOTS_UNAVAILABLE:HTTP_503': 40, 'DUE:SHARED_INFRASTRUCTURE_CIRCUIT_OPEN:SHARED_PROXY_FAILURE': 56, '2026-10-06:ROBOTS_UNAVAILABLE:HTTP_503': 6}. Healthy independent source walks warrant a subsequent bounded frozen recovery cohort. This is a pending opportunity census, not recovered coverage; future due times and shared circuit rules remain intact.

The deterministic currently-due shared-proxy/robots503 recovery cohort has 37 / 95 classified and 58 pending, with 0 independently verified owners cumulatively (0 newly verified since the accepted preceding checkpoint). Current cohort components {'officialDomainFound': 0, 'irPageFound': 0, 'newsSourceDiscovered': 0, 'eventSourceFound': 0, 'anyNews180d': 0, 'anyNews30d': 0, 'calls': 0, 'callDates': 0, 'webcastLinks': 0, 'replayLinks': 0, 'presentations': 0, 'transcriptLinks': 0, 'preparedRemarks': 0, 'shareholderLetters': 0, 'managementCommentary': 0, 'anyCallContentReference': 0, 'confirmedUpcomingEarnings': 0} and same-time new components {'officialDomainFound': 0, 'irPageFound': 0, 'newsSourceDiscovered': 0, 'eventSourceFound': 0, 'anyNews180d': 0, 'anyNews30d': 0, 'calls': 0, 'callDates': 0, 'webcastLinks': 0, 'replayLinks': 0, 'presentations': 0, 'transcriptLinks': 0, 'preparedRemarks': 0, 'shareholderLetters': 0, 'managementCommentary': 0, 'anyCallContentReference': 0, 'confirmedUpcomingEarnings': 0} are separate. The actual-output audit found 0 useful new stock outputs and retained 0 domain-only cases separately. Due times, access restrictions and circuit admission remain authoritative; repeated infrastructure failures are recoverable outcomes, never evidence that a company is invalid.

The same-filter failure-cluster loop compares exact checkpoint82 reasons {'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED': 852, 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER': 562, 'ROBOTS_UNAVAILABLE:HTTP_403': 91, 'OFFICIAL_SITE_CANDIDATE_REDIRECT_OWNER_NOT_VALIDATED': 72, 'SHARED_INFRASTRUCTURE_CIRCUIT_OPEN:SHARED_PROXY_FAILURE': 55, 'ROBOTS_DISALLOWED': 46, 'ROBOTS_UNAVAILABLE:HTTP_503': 42, 'DNS_UNAVAILABLE': 26, 'HTTP_404': 23, 'HTTP_403': 15, 'OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:DNS_UNAVAILABLE': 12, 'ROBOTS_UNAVAILABLE:DNS_UNAVAILABLE': 9, 'ROBOTS_UNAVAILABLE:SOURCE_TOO_LARGE': 6, 'ROBOTS_UNAVAILABLE:HTTP_500': 6, 'ROBOTS_UNAVAILABLE:REDIRECT_LOOP': 5, 'REDIRECT_LOOP': 4, 'SOURCE_TOO_LARGE': 4, 'ROBOTS_UNAVAILABLE:NETWORK_UNAVAILABLE': 4, 'NETWORK_TIME_BUDGET_EXHAUSTED': 4, 'CRAWL_DELAY_REQUIRES_DEFERRED_SCHEDULING': 3, 'OFFICIAL_SITE_CANDIDATE_REDIRECT': 3, 'ROBOTS_UNAVAILABLE:HTTP_401': 3, 'HTTP_401': 3, 'ROBOTS_UNAVAILABLE:HTTP_429': 2, 'ROBOTS_UNAVAILABLE:HTTP_405': 2, 'OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:ROBOTS_UNAVAILABLE:HTTP_503': 2, 'ROBOTS_UNAVAILABLE:RATE_LIMIT_DEFER:86400': 1, 'ROBOTS_UNAVAILABLE:HTTP_526': 1, 'ROBOTS_UNAVAILABLE:HTTP_400': 1, 'ROBOTS_UNAVAILABLE:TOO_MANY_REDIRECTS': 1, 'TOO_MANY_REDIRECTS': 1, 'HTTP_405': 1, 'HTTP_500': 1, 'OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:HTTP_500': 1, 'HTTP_304': 1, 'ROBOTS_UNAVAILABLE:HTTP_406': 1, 'OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:ROBOTS_UNAVAILABLE:DNS_UNAVAILABLE': 1, 'ROBOTS_UNAVAILABLE:HTTP_418': 1} with current reasons {'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED': 855, 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER': 565, 'ROBOTS_UNAVAILABLE:HTTP_403': 91, 'OFFICIAL_SITE_CANDIDATE_REDIRECT_OWNER_NOT_VALIDATED': 74, 'SHARED_INFRASTRUCTURE_CIRCUIT_OPEN:SHARED_PROXY_FAILURE': 54, 'ROBOTS_DISALLOWED': 46, 'ROBOTS_UNAVAILABLE:HTTP_503': 43, 'DNS_UNAVAILABLE': 25, 'HTTP_404': 23, 'HTTP_403': 15, 'OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:DNS_UNAVAILABLE': 12, 'ROBOTS_UNAVAILABLE:DNS_UNAVAILABLE': 9, 'ROBOTS_UNAVAILABLE:SOURCE_TOO_LARGE': 8, 'NETWORK_TIME_BUDGET_EXHAUSTED': 8, 'ROBOTS_UNAVAILABLE:HTTP_500': 6, 'ROBOTS_UNAVAILABLE:REDIRECT_LOOP': 5, 'REDIRECT_LOOP': 4, 'SOURCE_TOO_LARGE': 4, 'ROBOTS_UNAVAILABLE:NETWORK_UNAVAILABLE': 4, 'CRAWL_DELAY_REQUIRES_DEFERRED_SCHEDULING': 3, 'OFFICIAL_SITE_CANDIDATE_REDIRECT': 3, 'ROBOTS_UNAVAILABLE:HTTP_401': 3, 'HTTP_401': 3, 'ROBOTS_UNAVAILABLE:HTTP_429': 2, 'ROBOTS_UNAVAILABLE:HTTP_405': 2, 'ROBOTS_UNAVAILABLE:RATE_LIMIT_DEFER:86400': 1, 'ROBOTS_UNAVAILABLE:HTTP_526': 1, 'ROBOTS_UNAVAILABLE:HTTP_400': 1, 'ROBOTS_UNAVAILABLE:TOO_MANY_REDIRECTS': 1, 'TOO_MANY_REDIRECTS': 1, 'HTTP_405': 1, 'HTTP_500': 1, 'OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:HTTP_500': 1, 'HTTP_304': 1, 'ROBOTS_UNAVAILABLE:HTTP_406': 1, 'OWNERSHIP_EVIDENCE_TEMPORARY_FAILURE:ROBOTS_UNAVAILABLE:DNS_UNAVAILABLE': 1, 'ROBOTS_UNAVAILABLE:HTTP_418': 1}. Current ownership-evidence clusters [{'reason': 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED', 'signals': 'NO_TRUE_RETAINED_FLAGS', 'issuers': 282}, {'reason': 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED', 'signals': 'shortBrand', 'issuers': 237}, {'reason': 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED', 'signals': 'headerBranded / shortBrand', 'issuers': 175}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'headerBranded / shortBrand', 'issuers': 144}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'NO_TRUE_RETAINED_FLAGS', 'issuers': 118}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'legalNameVisible / headerBranded / shortBrand', 'issuers': 111}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'shortBrand', 'issuers': 95}, {'reason': 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED', 'signals': 'legalNameVisible / shortBrand', 'issuers': 55}, {'reason': 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED', 'signals': 'legalNameVisible', 'issuers': 51}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'legalNameVisible / shortBrand', 'issuers': 47}, {'reason': 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED', 'signals': 'legalNameVisible / footerOwnerMatched', 'issuers': 41}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'legalNameVisible', 'issuers': 21}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'headerBranded', 'issuers': 8}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'legalNameVisible / headerBranded / shortBrand / structuredOwnerMatched', 'issuers': 8}, {'reason': 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED', 'signals': 'headerBranded', 'issuers': 7}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'headerBranded / shortBrand / structuredOwnerMatched', 'issuers': 4}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'shortBrand / structuredOwnerMatched', 'issuers': 3}, {'reason': 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED', 'signals': 'headerBranded / footerOwnerMatched', 'issuers': 3}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'legalNameVisible / headerBranded', 'issuers': 3}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'legalNameVisible / shortBrand / structuredOwnerMatched', 'issuers': 2}, {'reason': 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED', 'signals': 'legalNameVisible / footerOwnerMatched / structuredOwnerMatched', 'issuers': 2}, {'reason': 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED', 'signals': 'legalNameVisible / structuredOwnerMatched', 'issuers': 1}, {'reason': 'OFFICIAL_SITE_CANDIDATE_CONFLICTING_COPYRIGHT_OWNER', 'signals': 'legalNameVisible / structuredOwnerMatched', 'issuers': 1}, {'reason': 'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED', 'signals': 'structuredOwnerMatched', 'issuers': 1}] identify missing legal owner/header evidence rather than justify relaxing verification. Random cached conflict review found genuine operating-company, bank, subsidiary, adviser and stale-name ownership boundaries; those remain unsafe absent independent issuer proof. Supplemental alias/budget/proxy third-pass recoveries are unioned by exact company identity in the candidate funnel; original seed-IR second/third pass counts remain separate and unchanged.

## 6. Failure clusters — ranking loop

Old ledger: approximately 578 insufficient ownership, 578 temporary failures, 89 blocked, 62 conflicting owners and 60 redirects. These identities are unavailable, so before/after counts are not same-cohort recovery rates. Current retained reconstructed causes are ranked after every bounded batch:

| Cause | Current identities |
|---|---:|
| INSUFFICIENT_EVIDENCE | 855 |
| CONFLICTING_OWNER | 565 |
| BLOCKED | 161 |
| TEMPORARILY_UNAVAILABLE | 159 |
| REDIRECTED | 88 |
| MISSING_PAGE | 23 |
| DEFERRED_BUDGET | 22 |
| UNRESOLVED | 6 |

Attack pending inventory first, then the largest recoverable ownership/temporary cluster. A durable 215-case request-budget cohort uses smaller candidate batches within the unchanged 200-request cap. A preceding downstream census found 629 live-verified roots without IR state and 117 with cached partial analysis. Current queues expand as official roots recover; these earlier counts are not asserted as current final queue sizes. Frozen high-capability IR cohorts contain 60 Q4, 63 GCS, 18 STOCKPR, seven Investis and two Web Driver roots; these use existing adapters and preserve source due times. Corporate platform hints are scheduling priorities, not ownership/source proof. Local reused-proof/cooldown/ambiguity outcomes now preserve prior first-check timestamps, attempts, request counts and byte statistics; stale retry categories are cleared when current proof or ambiguity supersedes them. The existing runner retains exact cumulative batch traffic even for preceding rows whose old counters were reset. Two meaningful domain/IR tests prove cost-history preservation, cooldown retention and removal of obsolete retry categories. Cohort outcomes and total traffic (discovery plus follow-up ingestion) are measured below:

| IR cohort | Frozen | Classified | Pending | Validated | Retry records | Requests | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| q4 | 60 | 60 | 0 | 59 | 1 | 912 | 42848457 |
| gcs | 63 | 63 | 0 | 62 | 1 | 711 | 37312267 |
| stockpr | 18 | 18 | 0 | 18 | 0 | 201 | 6328565 |
| investis | 7 | 7 | 0 | 7 | 0 | 49 | 2985786 |
| web-driver | 2 | 2 | 0 | 2 | 0 | 17 | 998165 |

The Q4 and GCS cohorts are fully classified, and due retries have recovered additional successful outcomes. StockPR, Investis and Web Driver cohorts are likewise classified. Exact outcomes, remaining retry counts and cumulative discovery plus ingestion traffic are in the table above; successful discovery alone does not imply an actual IR homepage or accepted intelligence. Local IR capacity exhaustion now retries after one hour instead of being conflated with a 24-hour site failure. Actual DNS/503 failures retain 24-hour IR backoff and shared circuits retain 15 minutes. A meaningful test covers budget/time/deadline deferrals, DNS/503/circuit distinctions, retained prior IR proof and unchanged source due times/failure counts. Sixteen exact legacy local-capacity deferrals were migrated from their original failure timestamps; no source schedules or transport/access due times were changed. Four matching infrastructure failures across unrelated hosts open a 15-minute circuit and checkpoint in-flight outcomes. Corporate-domain and IR/source discovery now persist separate circuit scopes with the same four-unrelated-host threshold and 15-minute cooldown. A closed healthy lane can continue while the other remains paused; a failure shared by both independently trips both bounded breakers. Legacy unscoped cooldowns still block both lanes until expiry, without resetting their due time. Production polling cadence is unchanged. Isolated origin failures and access denials never invalidate corporate ownership. Cached IR/parser/export/audit work continues during the circuit. Existing source families can be probed in bounded isolated batches; if the outage affects them too, those probes stop early.

The one scoped HEICO attribution retry subsequently validated both independently advertised bare/WWW roots at 2026-10-06T07:33:51Z, with matching final host and retained body hashes. This is actual live ownership recovery, not the earlier cached grammar shadow. Original conflict evidence and requeue journal remain private; unrelated owner cooldowns were unchanged. Its new IR/material components are measured with the alias-owner cohort.

## 7. Verified domains — 769 → 2546

Actual new verified cohort: 1777; committed audited seeds: 2540. Actual per-seed verifier versions, URLs, evidence hashes and timestamps are retained. Missing cached bodies retain original strong proof; a current cached rejection cannot be promoted. Exact-CIK non-mock SEC legal aliases enrich the existing resolver copy without changing Company Master.

The scoped oversized-root first pass froze 24 single-route identities from 26 preflight cases; two ambiguous-route identities remain excluded rather than auto-resolved. It now has 24 durable classifications and 6 independently verified IR destinations, using 137 physical discovery requests. Its downstream frozen recovery cohort has 6 issuers / 6 classified / 6 successful IR outcomes. The original oversized corporate roots are not claimed verified; only the independently owned IR destinations are promoted. Corporate backlinks, original candidate/failure, hash and failed alternate attempts remain private. Actual newly visible components are measured in the downstream funnel.

## 8. IR pages — historical 326; current reconstructed 2280

New-domain cohort: **1596** actual IR pages. The frozen broader native/platform cohort has **901 verified roots / 901 classified / 0 pending**, with 836 successful outcomes and 9592 cumulative requests. Its first bounded batch stored 31 news items and added five presentation issuers; 19 successfully ingested source descriptors were promoted after quality review; the following five bounded IR batches produced another 120 independently successful descriptors (1,948 configured sources in total). The cumulative discovery-plus-follow-up traffic is **9592 requests / 642,866,252 bytes**; the current snapshot has **901 classifications / 836 successful outcomes** and retained cooldown/local-capacity records. New domains are queued for bounded root/navigation/platform/source discovery; zero roots remain unchecked in the frozen broad IR cohort; recoverable due-time outcomes remain. Cached partial results are preserved. Corporate dropdown self/fragment links and retail investing stories do not count as IR. Root ownership survives an IR redirect/parser/temporary failure.

Retained verified-seed IR queue: **769 frozen / 769 classified / 0 pending**. This is a separate downstream backlog; it does not alter the completed domain-candidate first pass.

## 9. Platform families

Actual IR fingerprints, not corporate CMS hints:

| Family | IR issuer fingerprints |
|---|---:|
| GCS | 796 |
| Q4 | 622 |
| GENERIC | 316 |
| STOCKPR | 282 |
| WORDPRESS | 245 |
| INVESTIS | 53 |
| WEB_DRIVER | 52 |
| BUSINESS_WIRE | 3 |
| NOTIFIED | 1 |

Registry capability/accessibility ranking (issuer count × supported source types × successful-source fraction; existing materials/event adapters expose additional document types):

| Family | Registry issuers | Sources | Ever successfully polled | Source types |
|---|---:|---:|---:|---|
| GCS | 766 | 1707 | 1657 | IR_EVENTS, IR_FEED, IR_MATERIALS |
| Q4 | 609 | 2436 | 2362 | IR_EVENTS, IR_FEED, IR_MATERIALS |
| WORDPRESS | 370 | 442 | 411 | IR_EVENTS, IR_FEED, IR_MATERIALS |
| STOCKPR | 288 | 513 | 498 | IR_EVENTS, IR_FEED, IR_MATERIALS |
| GENERIC | 150 | 174 | 154 | IR_EVENTS, IR_FEED, IR_MATERIALS |
| WEB_DRIVER | 37 | 50 | 44 | IR_FEED, IR_MATERIALS |
| INVESTIS | 23 | 33 | 28 | IR_EVENTS, IR_FEED, IR_MATERIALS |
| FIRST_PARTY | 1 | 1 | 1 | IR_FEED |
| BUSINESS_WIRE | 1 | 1 | 1 | IR_FEED |
| GLOBENEWSWIRE_ARTICLE | 0 | 3 | 3 | RSS |
| PUBLIC_RSS | 0 | 1 | 1 | RSS |
| GLOBENEWSWIRE_RSS | 0 | 4 | 4 | RSS |
| GLOBENEWSWIRE_SITEMAP | 0 | 1 | 1 | RSS |

Q4/GCS remain the largest useful accessible families. No new unsupported family with a comparable issuer population has emerged. Corporate WordPress hints alone do not establish news or IR coverage.

The platform priority rank uses IR issuer count × observed useful component count × recent accessible-source issuer fraction. Recent accessibility means an enabled source successfully ingested within 48 hours without a current failure; capability is observed stored news/events/calls/webcasts/material types, not a promise that every issuer exposes every type. Issuers may appear in multiple migration/provider groups, so rows are not additive. Approved global news is measured separately.

| Family | IR issuers | Observed data types | Recently accessible issuers | Priority score |
|---|---:|---:|---:|---:|
| GCS | 804 | 9 | 718 | 6462.0 |
| Q4 | 627 | 9 | 606 | 5454.0 |
| WORDPRESS | 452 | 9 | 341 | 3069.0 |
| STOCKPR | 288 | 9 | 273 | 2457.0 |
| GENERIC | 385 | 9 | 124 | 1116.0 |
| WEB_DRIVER | 53 | 6 | 31 | 186.0 |
| INVESTIS | 53 | 7 | 18 | 126.0 |
| BUSINESS_WIRE | 4 | 2 | 1 | 2.0 |
| FIRST_PARTY | 1 | 1 | 1 | 1.0 |
| NOTIFIED | 1 | 1 | 0 | 0.0 |

The largest productive families already have adapters. The only newly observed Notified family remains a single low-access issuer; no unsupported large platform cohort is established by this measurement. Generic/native is heterogeneous and is not asserted to be one vendor API. Targeted budget completion remains the largest recoverable source-discovery cluster.

The completed 122-issuer WordPress pass exposed four further schema-proven candidates at Village Farms, Cactus, InMed and Inventiva. Their advertised dated collections use `company_news`, `financial_news`, `announcement`, `news_release` and `inv_press_release`. The existing adapter now admits these exact names only with its unchanged GET/date schema proof, metadata-only fields, legal ownership and issuer-actor guards, and two-collection budget. All five new collection subcases fail on the preceding producer and pass on the corrected producer; the full targeted suite remains 25 passing tests. The separate `wordpress-observed-routes-third-oct6` cohort was frozen at milestone85 with 4 identities and original advertised-schema hashes for a targeted third pass after remote preservation. That queued cohort supplied zero claimed live coverage at milestone85; its subsequent third-pass outcomes are reported separately.

The SEC annual-candidate / named-trademark-owner implementation was remotely preserved at 59d8c2d527c58e3f129cf95abe7bc237664a76fb with 626 full Python tests and ten targeted SEC discovery tests passing. All ten workflows also passed without retries on that exact remote head. Exact same-company trademark notices do not extend a copyright owner; conflicting or subsidiary names remain withheld. The bounded SEC annual cohort retains candidate-only provenance, metadata/hash/excerpts, checkpoints and separate temporary-error cooldowns; it does not reset ownership version v10 or store filing bodies. Four live SEC requests recovered declared AbbVie and American Airlines routes as candidates, without making an ownership claim. Current route/IR/source outcomes are reported separately below.

Current exact-CIK primary annual website discovery: 100 frozen issuer identities, 25 classified and 75 pending; outcomes {"CANDIDATES": 19, "NO_DECLARED_SITES": 6, "PENDING": 75}. These produced 27 declared candidate routes for 19 issuers, with separate normal-verifier outcomes {"DEFERRED": 2, "TEMPORARY_FAILURE": 1, "VALIDATED": 1, "WITHHELD": 12}. Newly verified since immutable milestone 85: 1. New components since that baseline: {"anyCallContentReference": 0, "anyNews180d": 1, "anyNews30d": 1, "callDates": 1, "calls": 1, "confirmedUpcomingEarnings": 1, "eventSourceFound": 1, "irPageFound": 1, "newsSourceDiscovered": 1, "officialDomainFound": 1, "presentations": 1, "transcriptLinks": 0, "webcastLinks": 0}; current recovered-cohort components: {"anyCallContentReference": 0, "anyNews180d": 1, "anyNews30d": 1, "callDates": 1, "calls": 1, "confirmedUpcomingEarnings": 1, "eventSourceFound": 1, "irPageFound": 1, "newsSourceDiscovered": 1, "officialDomainFound": 1, "presentations": 1, "transcriptLinks": 0, "webcastLinks": 0}. Collection traffic for this bounded batch: 50 SEC requests and 157,534,295 successfully decoded response bytes (compressed wire/failed-body bytes not measured); independent public-route verification: 58 requests with 6,845,057 bytes. Filing declarations remain candidate-only, raw filing bodies are discarded, original unsafe conflicts stay in the private journal, and recoverable route failures retain cooldowns/circuit checkpoints. Pending SEC discovery is reported separately from the existing domain-candidate funnel.

Observed header-evidence implementation checkpoint (coverage discovery continues): retained SEC-route failures exposed exact matching legal copyright owners with missing header corroboration. The existing verifier now gathers logo alt text only from same-host homepage links, and recognizes an explicit uppercase two/three-letter brand present in the issuer name only with its exact legal footer. Customer images, unrelated links, ticker-only labels, conflicting owners and extended subsidiary owners remain withheld. Ownership version remains v10; no broad state reset or new SEC ownership authority is introduced. Five new behavioral contracts pass (43 targeted ownership tests / 637 full Python tests in 49.053s); the preceding producer fails all six observed positive subcases and preserves the ticker-only negative case. Zero-network, unchanged-content-hash replay validates eight distinct retained issuer routes under the existing legal-owner rules, but these cached technical results are not promoted or counted as new user coverage at this implementation checkpoint. The next targeted pass will promote accepted proof and attempt IR/source ingestion.

Scoped header-collector recovery now has a separate durable version marker. Within the existing queue, only a v10 ownership-only rejection with an exact matched legal footer and absent short-brand evidence can receive one collector recheck. Its next failed validation records the collector version, preventing repeated resets; successful proof follows normal domain/IR ingestion. Unknown/future versions, access denials, temporary transport failures, conflicting owners and unproven footers retain their cooldowns. Existing attempt/request accounting survives the recheck. Homepage-logo gathering also excludes fragment/customer-query links and tolerates valueless image attributes. Validation: **640 full Python tests passed in 49.714 seconds**, including 47 targeted collector, inventory and batch tests. A same-filter 29-identity follow-up inventory is planned for the largest demonstrated remaining header-only cluster; no unperformed recovery or source ingestion is counted here. This code milestone preserves implementation while the current SEC/source loop continues from its checkpoints.

## 10. New / improved adapters and verification

The existing discovery circuit now recognizes typed EAI_AGAIN errors, including nested urllib reasons and URL-validation failures before an HTTP opener is reached. Four unrelated hosts with that signature trigger a suspected temporary-DNS circuit; EAI_NONAME/ordinary missing-domain failures do not. Candidate reason strings, ownership requirements, robot controls and due times are unchanged. Four meaningful tests cover error-cause preservation, repeated-versus-unrelated hosts, unsent batch retention and serial polling/getter restoration. A DNS-only recovery route now checks one conventional www/apex spelling after DNS_UNAVAILABLE or ROBOTS_UNAVAILABLE:DNS_UNAVAILABLE, requiring the unchanged independent full legal/CIK ownership proof and normal robots/public-URL controls. Denials, proxy failures and DNS failures in linked ownership routes never trigger this alias probe. Original route, alternate route and primary failure remain in the hashed ownership evidence. A 125-case DNS recovery cohort is durable; the initial batch classified 26 and recovered four in 85 requests, followed by the completed resumable live recovery. The completed 125-case DNS cohort now has 41 validated outcomes, zero pending and retained unsafe/access/transport outcomes; 37 additional roots recovered in this resumed run. Eight current strong-proof recoveries used the conventional www/apex route, including ATI, Metropolitan Bank, Chatham Lodging, Floor & Decor, Mama’s Creations, Medalist, Enact and EUDA; final redirected destinations also passed independent ownership validation. Four new tests cover both host directions, wrong-company/brand-only rejection, no access/proxy workaround and bounded budget failure. Exact HTTP/HTTPS duplicates are normalized only when host, path and query agree; all raw provenance stays in the ledger. Non-equivalent routes receive durable ambiguity outcomes. This fixes producer-appended protocol duplicates that previously consumed selection slots without reaching the ownership verifier. Version 9 prioritizes advertised legal/privacy proof and diversifies the unchanged two-page allowance across legal/IR/about evidence families. Only an older ownership-only rejection is eligible for one version recheck; current-version, unknown-version, conflicting-owner, blocked and transient cooldowns stay intact. A 404-case version-9 upgrade cohort is durably recorded. Version 10 reuses full exact legal-name normalization and owner-extension checks for multiword suffixless copyright names, including ampersands; an ambiguous year followed by arbitrary words cannot terminate an owner. The explicit phrase “All Rights Reserved by” is parsed before an exact legal owner. Generic single-word names, longer subsidiary names, unrelated owners and conflict/access cooldowns remain protected. A separate version-10 ownership baseline and two-case cached copyright recovery cohort are durable. Existing architecture and Q4/GCS/STOCKPR/Web Driver/Investis/native adapters are reused. The new HTML materials adapter follows an advertised same-host IR hub, validates direct document references with the existing parser, preserves missing publication dates as NOT_PROVIDED, and polls at 24 hours. A live failure-cluster review found that 50-candidate domain batches split the 200-request allowance into four requests per issuer, producing budget deferrals while total allowance remained unused. Domain checks now borrow from a locked shared allowance with an individual ceiling of at least eight requests (bounded by the caller cap); admission remains paced, every actual request consumes the global allowance, and unsent candidates stay pending when it is exhausted. IR per-candidate allowances are unchanged. After infrastructure recovered, a 50-outcome batch reached 24 verified / 24 rejected / two deferred results in 186 requests; the next batch added 29 verified domains with four deferrals. Cohorts differ, so this is operational evidence rather than a controlled speed comparison. Three new tests prove uneven ownership-route workloads complete, concurrent borrowing never exceeds the cap, and exhausted admission leaves unsent candidates pending. The first resumed batch completed 19 candidate outcomes (seven verified domains) using 42 requests before four unrelated Envoy failures opened the domain circuit; remaining candidates stayed pending. This interrupted batch is not represented as a complete throughput benchmark. Annual-report links no longer suppress the existing one-hub discovery allowance when presentations are missing. The retained inventory exposes 101 issuers with this skipped-hub structure, including 48 without presentation coverage overall. The existing materials-backfill lane now derives both Q4 indexes and these first-party HTML hubs, preserves failure counts/due times/disabled sources, leaves unsent candidates derivable, and persists the shared IR circuit. The first HTML batch processed 32 sources using 65 requests / 4,063,560 bytes and added presentation coverage for seven issuers; 18 source failures retain backoff. Its Q4 JS-only cluster led to a structured public Presentation.svc/GetPresentationList adapter. The first Q4 batch processed 16 sources using 29 requests / 259,819 bytes, with zero failures, and added five further presentation issuers (12 distinct material recoveries across both batches). Q4 DocumentPath/AudioFile/VideoFile metadata produces public presentation/webcast references; bodies are discarded, grouping dates are not publication dates, and media links do not imply calls or confirmed earnings. Successful IR rediscovery now retains active, verified, same-company material-source configurations, protecting ingested documents from later overwrite. The second Q4 batch then processed 23 more source attempts using 39 requests / 299,178 bytes and added presentation coverage for seven further issuers; three isolated source failures retain backoff. Across the three material batches, 19 distinct issuers gained presentation coverage. A random material audit identified IHG’s explicit “HY26 Presentation and Q&A Transcript” link classified as a presentation. The specific transcript label now takes priority; URL-level replacement retires its preceding type instead of duplicating it. One retained, verified first-party reference was corrected without downloading a body or changing its source-success timestamp. Cached analysis of the next 101 retained new roots added four IR pages and presentation coverage for nine issuers with zero requests. A reference audit caught two Himalaya Shipping report PDFs carrying a generic “Download presentation” label. Specific report filenames now override that generic label while actual presentation filenames retain their type; both references were corrected from cached first-party links without changing source-success timestamps. Further eligible Q4 routes remain queued, so no platform ceiling is claimed. Improvements: linked first-party legal routes; advertised www/IR siblings with independent full ownership proof; retained-chain redirect verification; complete legal title/meta segments; bounded exact Q4 vendor-credit separation; partial endpoint/document preservation; cached replay; source-health publisher cooldown persistence; transient robots backoff; self-navigation material rejection; release/call-date separation; source-only accepted-earnings reconciliation using the existing estimator. Exact Q4 credit endpoints, unrelated legal-owner extensions and CIK conflicts remain fail-closed.

GCS layouts now support bounded nested event nodes, direct widget cards and dated table rows, including explicit year-first dates. Slash dates and missing years remain unproven. Cached, hashed first-party evidence was reanalyzed without HTTP requests and without changing source success/failure timestamps. An audit caught an Icahn PDF labelled “Webcast” and “View Presentation”; MIME and filename proof now prevent PDF references from becoming webcast/replay links, including during stored-event merges. Separate genuine webcast references remain intact. Eight new layout/material regression tests and a real HTTP401 slow-retry test pass. Actual authorization failures retain seven-day retry rather than one-hour local-capacity retry. Current configured seed/source counts above include the independently audited promotion waves; a source descriptor is promoted only after successful existing ingestion, and empty material sources are excluded.

The new StockPR event parser requires an already verified provider source, bounded balanced event cards, one valid machine date, an observed issuer event-detail route, visible calendar agreement and explicit timezone evidence for timed calls. Actual discovery and live-poll tests retain the unchanged issuer-actor/calendar safeguards. PDF MIME/filename proof remains distinct from webcast/replay URLs. Cached first-party events are applied only with current hash/age and verified issuer/IR provenance; existing source health is unchanged and a new source is explicitly unpolled. No generic ticker/name shortcut is introduced.

The reusable source-family runner persists traffic, failure clusters, distinct material recoveries and actual newly covered news identities after each bounded CLI batch, then packs the private checkpoint. Healthy local time/request boundaries continue; real circuits, publisher cooldowns and repeated publisher temporary failure pause the lane. Its operator stop file pauses after the current checkpoint. Reusing a run ID resumes source due-time selection and cumulative accounting; stale publisher batch counters are excluded. Three healthy publisher batches each adding at most one global news issuer pause for negligible incremental coverage; no such rule suppresses other useful material types. Seven runner tests cover restored continuation, source health, circuit/operator interruption, publisher cooldown/stale counts, month isolation and distinct issuer gains rather than item totals. A restored run that already reached negligible incremental issuer coverage now makes zero further requests under the same run ID; transport cooldowns still resume normally. A restore test preserves exact completed counters and proves no child launch. Production cadence is unchanged.

A further random material audit identified Q4 presentation indexes containing transcripts, financial supplements, proxy/ESG reports and investor reference books. The adapter now prioritizes explicit transcript/remarks/shareholder-letter evidence, preserves financial reports under their own type, excludes unrelated report/reference-book entries from presentation coverage and rejects PDF audio/video fields. Two tests prove classification and retirement of previously mislabelled retained references on later ingestion. A zero-request private correction reviewed 79 reference instances across 17 issuers, preserving original record hashes, observation dates and source health; these include repeated configuration representations, not 79 distinct issuer gains. Actual transcript references at SBSI/CAC/HNRG/MCHB/AMPY are now visible under the correct type. Genuine investor decks remain; historical TRST 2018/2015 annual-meeting references remain explicitly undated and are not claimed as current.

Material/navigation discovery now requires a complete presentation/slide word. The original substring pattern could follow a first-party product page called “Representations and Warranties” and mistake its legal agreement PDF for a presentation. One complete discovery test proves the unrelated product page cannot consume the one-hub allowance, the actual presentation hub is fetched, endpoint inventory remains correct and the legal PDF is excluded while the real deck survives. This improves the large native/WordPress conversion cohort without adding company-specific routes or weakening ownership. The same complete-word rule now applies to event-detail material enrichment; a separate test proves a legal-product link cannot hide the subsequent actual earnings slides.

A random expanded-stock audit found six issuers with news stories about scientific presentations incorrectly retained as presentation documents. HTML news/press routes and announcement headlines now cannot count as decks; actual PDF/static-file attachments and specific transcript/remarks/financial-report types remain valid. Existing HTML/Q4 polling retires known preceding mistakes rather than restoring them. Two tests prove fresh classification and retained-reference cleanup. A zero-request private correction removed 18 reference instances across six issuers while the complete source-health table hash remained unchanged. Useful webcast/earnings references and accepted news were preserved.

An additional native IR improvement follows the already advertised **earnings results** hub within the existing one-hub allowance. Explicit PDF filenames identify investor/corporate/earnings/merger presentations, earnings releases, prepared remarks, earnings/company transcripts and shareholder letters when accessible labels are generic or blank; HTML slugs and generic product/presentation filenames cannot supply this evidence. The cached shadow review identified eight attachment links across retained pages, including PepsiCo earnings releases and official investor decks. Three tests cover filename provenance/periods, product and HTML exclusions, earnings-estimate navigation rejection, the unchanged single-hub request bound and independent redirect ownership. A strongly proven materials destination may supply a separately scheduled source; wrong-company or unproven destinations produce explicit warnings and no source. The live PepsiCo check recovered two directly linked earnings releases but its investor-host redirect remained unproven under the unchanged verifier, so no transcript/remarks/webcast gain is claimed for PepsiCo. The 22-request bounded check also polled normally due global metadata sources; those accepted stories are distinct from PepsiCo materials. Exact export/consumer evidence is retained privately.

Exact native newsroom navigation now includes **News / Latest News / Company News / Press** as well as existing press-release/newsroom labels. An advertised corporate backlink from IR is eligible only under the already validated corporate host or conventional www alias; arbitrary external links and generic industry-news labels stay excluded. The cached review identified nine issuer pages with these labels. A complete discovery test proves a verified corporate backlink exposes its advertised RSS feed within the existing one-page allowance, while an external “Company News” link and an industry-news article are not requested. News schemas, source robots, publication-date requirements and issuer matching remain unchanged.

The actual Uber financial-index audit exposed vendor **presentation** categories containing financial supplements. Q4 financial-report parsing now reuses the existing specific document-type classifier. Explicit supplemental information/data without deck evidence remains a financial report; an explicitly named earnings-release file remains an earnings release. Actual investor presentations and supplemental slides remain presentations. A test covers both false category labels and genuine deck filenames, preserves fiscal labels/missing publication dates and verifies retained-reference correction. An initial read-only review found 28 affected financial/release reference instances across eight issuers (including repeated configurations), with zero matching event presentation URLs. Later live ingestion increased the idle correction to 36 reference instances across ten issuers. It retained original hashes/observation dates and the exact complete source-health table hash; zero HTTP requests were used. Exact restore and consumer revalidation follow the correction. This is a quality correction, not an invented new-content gain.

The preserved advertised WordPress REST adapter supplies metadata-only news from verified corporate/IR hosts. The original 37-site pass yielded 15 default sources and 111 new stories; three issuers gained 180-day news and zero gained 30-day news. The subsequent 17-site pass yielded four schema-proven custom collections at Insperity, CION, Relmada and 908 Devices and 37 new stories; three issuers gained 180-day news and two gained 30-day news. Taxonomies, guessed routes, wrong-company/default CMS entries, unproven redirects, invalid/date-only publication times and unexpected article-body fields fail closed. One schema index and one dated collection can supplement an empty/stale default blog; exact collection identity and schema hash survive configuration promotion. Eight meaningful tests cover these contracts. Existing RSS/structured sources retain precedence and production cadence is unchanged.

The publisher collector now opts out of disk and memo response persistence for article fetches. Normal source, robots and index caching retain their defaults. Corrected cleanup uses the transport's real `(canonical URL, robots)` memo key. A real-transport test covers valid/invalid metadata and proves raw responses never enter disk/memo caches. Private checkpoints exclude legacy GlobeNewswire article cache pairs left by an abruptly interrupted older collector while preserving staged SQLite metadata and safe robots/index cache. A restore-backed test proves the raw body is absent, staged metadata survives exactly and packing does not change the live ledger. The inherited URL-only fake had masked tuple-key memo retention. No full article body is exported, committed or included in the corrected private checkpoint.

The new one-time backfill freezes existing verified, active, unpolled issuer-owned news feeds for companies without stored news. The exact source/company/URL identity and optional issuer scope survive restore; changed identities are withheld. Existing ingestion, issuer matching, source health, cooldowns and four-hour production cadence remain authoritative. Its continuing run has **182 frozen sources**, **184 attempted source instances**, **1577 new stories**, **156 distinct newly news-covered issuers**, **344 requests / 11,743,819 bytes**, and stop reason **NO_DUE_SOURCES**. Nine meaningful tests cover restored continuation, cooldowns, shared failures, unsent budget deferrals, identity/scope preservation and existing CLI/runner isolation. Resume the same frozen cohort with `PYTHONPATH=scripts python -m company_intelligence.source_backfill_runner --run-id unpolled-news-oct5 --lane news --max-batches 8 --limit 32 --request-budget 160 --max-seconds 360 --network`; failed sources remain governed by their existing due times. It does not poll global feeds or download article bodies. The new verified-IR-feed item audit replayed current resolver identity for **103 newly accepted items across 11 issuers**, preserving exact current source/company/URL identity, frozen identities where applicable, and original timestamps; **0** were explicitly external destinations from an owned feed and retain their normal external match evidence.

The retained Q4 vendor-template correction withholds explicit TestItem labels and placeholder documents from presentation/management coverage. Sixteen reference instances across CVS, TTI, AGEN, VC, GKOS, OTTR, DKL and Alphabet were retired without HTTP or source-health mutation; original evidence remains private. Legitimate scientific testing and similarly named presentation titles remain accepted. Fresh parsing and retained consumer correction tests pass. The preceding nine-ticker audit (including GOOG/GOOGL's shared identity) proved those exact false references absent through local storage, API and browser delivery.

A live zero-request census found 51 verified unpolled first-party news feeds: 41 belonged to issuers already covered by publisher news, and 40 of those were due. The existing uncovered-issuer selector excluded them. An explicit opt-in `--news-backfill-include-covered` recovery mode now freezes these owned feeds without changing the default. It retains exact source/company/URL identity, last-success skipping, source cooldowns, robots, shared circuits and all request/time bounds. The coverage mode itself is durable and cannot change on a restored run ID. It applies only to the news lane; global feeds, financial projection and production cadence remain unchanged. Four behavioral tests prove new first-party items for already covered issuers, exact restored continuation, no later-source scope expansion, protected cooldowns/unverified/disabled sources, runner-mode invariance and CLI isolation. All 16 existing news/runner tests also pass. Live gain under this mode is reported from the frozen cohort below; it is not inferred from tests.

The cumulative explicit first-party recovery cohorts froze **69 feeds**, attempted **51 source instances**, and used **84 requests / 5,338,401 bytes**. Relative to the preceding milestone67 restored snapshot, these cohorts added **0 new stored stories across 0 issuers**, and **0 stories gained retained owned-feed provenance**, including **0 previously lacking verified first-party evidence**. Existing publisher coverage is preserved and counted separately. The frozen run stopped with **NO_DUE_SOURCES / NO_DUE_SOURCES / NOT_RUN**; remaining failures retain normal due times.

A reusable investor-navigation fix normalizes exact duplicated investor labels and accessibility new-tab hints before IR classification and ranking. A zero-HTTP review found five affected advertised routes: Deluxe, Hershey, Intel, Pitney Bowes and Nucor. Cached replay verifies retained IR pages where available; missing pages remain pending and no cache-shadow recovery is included in the current coverage counts. Four new behavioral contracts cover acquisition of a delegated IR hub and actual presentation, duplicate title/aria/visible labels, bounded hub priority and prose/fragment/asset/subscription exclusions. The old producer fails the positive cases; all 22 targeted migration/material/navigation tests, 537 full Python tests and 39 Node tests pass. The same maximum page walk, ownership/redirect rules, request budgets, source health and polling cadence are retained. The targeted durable recovery cohort now applies this validated parser to the five exact advertised routes. Its measured outcomes and downstream gains follow below.

The navigation recovery cohort is 5 / 5 classified, with 5 successful discovery outcomes, 0 pending and 9 discovery-plus-follow-up requests. The exact observed-link receipt is retained privately; successful walks and actual issuer-component gains are reported separately.

The external solicitation predicate is now shared by sitemap and unverified external RSS ingestion, before identity resolution or event/candidate creation. The initial correction withdrew fifteen newly stored law-firm solicitation items with exact original metadata preserved privately; zero linked calendar events and source-health changes were found. The approved global refresh produced 97 gross new stories / 37 gross newly covered issuers; the initial correction retained 82 net new stories and 29 newly covered issuers; the subsequent named-template corrections reduced these to 75 / 27. Five behavioral contracts preserve factual regulator/legal reporting and direct verified first-party announcements. The original 67 targeted checks passed; the latest 51 targeted checks, 537 full Python tests and 39 Node tests pass; the pre-fix RSS producer fails the new ingestion contract. An additional 15-ticker actual storage/API/browser withdrawal audit passed (29 assets / 403,214 bytes); two ad-only stocks correctly returned unavailable and three private-path probes were rejected. No full article bodies were stored.

The follow-up source-trust contract proves that an owned feed cannot pass its verification to externally hosted law-firm ads. Both a shared publisher destination and an unrelated destination failed on the pre-fix producer; the corrected effective-trust path rejects both before identity/event/candidate creation, while the direct verified first-party legal announcement remains accepted. Six external-news contracts, 51 targeted contracts, 537 full Python tests and 39 Node tests pass. The current retained-ledger scan finds zero external predicate matches and preserves three direct first-party legal announcements. The original 15-item correction and subsequent four-/three-item receipts retain exact evidence, unchanged source-health hashes and zero linked events: 22 total withdrawals, 75 net global-refresh stories and 27 retained newly covered global issuers. The 22-ticker actual withdrawal delivery audit passed for immutable generation `778b8a5e35b05408d96c7b60`; the new export is separately audited below.

The bounded oversized-root collector probes at most three conventional investor hosts only after an exact corporate SOURCE_TOO_LARGE failure. Each alternate independently requires legal-owner proof, visible investor context, a corporate backlink and unchanged proof-page hash. Its verified URL is the IR destination; the unread corporate root is not authorized. Robots/access failures do not trigger it and owner/CIK conflicts stop recovery. Alternate attempts retain evidence; budget and network errors preserve existing deferred/temporary treatment. A separate collector version permits one scoped upgrade without resetting ordinary ownership/access cooldowns. Six new behavioral contracts pass; the preceding collector validation was 544 Python and 39 Node tests. Code milestone e55189695cbd2b1dee77f151ce8bfe037a9484e6 was remotely preserved before further discovery. The preceding preflight found 26 size failures; actual frozen single-route cohort results follow below.

The actual approved WordPress missing-news cohort has 122 frozen issuers, 122 durable outcomes and 0 pending. Outcomes: {"COOLDOWN": 1, "INGESTED": 15, "NO_QUALIFYING_ADVERTISED_NEWS": 88, "TEMPORARY_FAILURE": 2, "WITHHELD": 16}. Its 11 completed bounded batches consumed 394 requests / 49,823,642 bytes. There are 23 successful advertised metadata sources, 300 retained accepted stories and 2 genuinely new first-party-news issuers relative to corrected generation 2b79a295b2f50e71da38a9ba. Same-time first-party issuer gains by 7/30/90/180-day window are {"180": 2, "30": 2, "7": 0, "90": 2}; an older-only source is not counted as current news coverage. Current resolver/URL/date/source ownership replay is separately checked for all new first-party items. The dedicated actual-delivery sample is INM / IVA. Due failures and shared circuits retain retry times; no guessed REST route, article-body storage or production-frequency change is introduced.

The separate schema-targeted WordPress second pass contains 6 frozen issuers: 6 durable outcomes, 0 pending, and {"INGESTED": 6}. It uses the same advertised-host, legal-owner, dated-schema, metadata-only and current-master CMS scope guards. Its completed batch accounting is 4 batches / 19 requests / 2,504,968 bytes. Source counts, retained stories and first-party/news-window gains above include accepted results from both WordPress runs, while the original 122-issuer inventory and this targeted six-issuer recovery have separate denominators.

The schema-observed WordPress third pass has 4 frozen identities / 4 durable outcomes / 0 pending, with {"INGESTED": 2, "NO_QUALIFYING_ADVERTISED_NEWS": 2}. Its separate accounting is 2 batches, 13 requests and 1,755,136 bytes. Accepted source/story and freshness totals above include all three WordPress cohorts; original, second and third outcomes retain separate denominators. Stable story IDs remain the new-content sample gate, while first-party canonical/provenance upgrades are measured separately.

## 11. News — historical 519; current reconstructed 180-day coverage 2601

**1418 new-domain issuers** have accepted recent metadata, from 1305 news-source issuers. Total stored metadata items: **20419**, across 2616 issuers including older retained metadata. First-party metadata: 17750 items / 1788 issuers; external metadata: 4430 items / 1487 issuers (sets can overlap). These item counts use explicit verified-first-party match evidence. External destinations linked by an official feed remain external items with the normal resolver proof; route-level first-party coverage retains its existing verified-source definition. Publisher/issuer identity precision remains unchanged; full article bodies are not retained. The initial local recovery checkpoint contains zero news items / zero news-covered identities; all 2616 identities in this reconstructed ledger were added during this run. That checkpoint is separate from the unavailable historical 519-issuer set, whose union cannot be reconstructed.

## 12. News freshness

| Window | Issuers |
|---|---:|
| 7 days | 712 |
| 30 days | 1753 |
| 90 days | 2578 |
| 180 days | 2601 |

Accepted timestamps retain publication/observation distinction; event starts never derive from RSS publication time.

The separate approved-global-news refresh uses existing active RSS/news-sitemap descriptors and normal due times, with force disabled: 5 bounded runs / 53 requests / 4,403,572 bytes. Latest normal-poll accounting: {'discoveryFailures': 0, 'documentFailures': 0, 'duplicate': 87, 'invalid': 0, 'new': 72, 'processedCompanies': 0, 'promotionalRejected': 186, 'secFailures': 0, 'sourceFailures': 0, 'unmatched': 842}. This is separate from monthly publisher backfill and preserves the four-hour production cadence.

The monthly census initially encountered pruned live sitemap cache entries. It resumed using the exact origin-matching, hash-verified August/September indexes retained in the accepted checkpoint81 restore, with explicit index timestamps/hashes and zero HTTP. Current release statuses come from the live ledger; retained index evidence is not claimed as a new source poll or new issuer coverage. Source cache limits and cadence were unchanged.

## 13. GlobeNewswire monthly backfill

September publisher-advertised sitemap contains 11,968 release URLs. Resumed completed batches have **3339 attempted / 3295 parsed releases**, **1691 newly stored items / 377 duplicate matches**, and **2053 source-associated issuer-scoped items from 2063 distinct accepted release URLs**, covering **1000 current-master identities**. Aggregate duplicate-match rate is 18.23% of accepted matches. Vivakor VIVK/VIVKD and CareCloud CCLD/CCLDO/CCLDP are explicitly listed publisher stock representations; one release may map to multiple retained master identities without cross-company leakage. These are master-identity counts, not invented distinct-economic-company counts. A publisher robots-503 attempt made three requests/zero accepted items and retained the release cursor. Current publisher nextCheck: **2026-10-13T02:58:35Z** (healthy explicit monthly backfill may continue; failed cooldowns cannot). Retry due times, parsed/ingested per-URL checkpoints and source failure counts survive fresh invocations. Full article bodies retained: **0**. The later publisher recovery processed 93 releases / 92 parsed and added 54 items / seven duplicate matches in 95 requests / 8,554,133 bytes. It added 30 global news-covered issuer identities (679 → 709), so incremental gain remains material. A subsequent shared-failure publisher attempt made three requests / zero bytes and retained that prior checkpoint without recounting it.

The preceding 93-release batch expanded publisher coverage from 339 to 374 identities. Four further healthy bounded October-5 batches attempted 376 releases, parsed 369, added 186 stored items with 18 duplicate matches and added 99 global news-covered identities; publisher coverage reached 483. The latest of those batches added 21 global news identities in 95 requests / 8,381,517 bytes, so the source ceiling has not been reached. An explicit checkpoint boundary pause retained the current cursor and source health; it was not a source failure. Eleven newly advertised domain candidates were all classified (seven validated, two insufficient, one conflicting owner, one authorization-blocked). An initial selector also included 736 existing configured seeds; they reused proof with zero requests. The corrected 11-candidate frozen cohort retains the exact original results. Both snapshots remain private; its 35 actual requests are counted once.

The continuing `september-oct5` run has completed **24 bounded batches** with **2,184 attempted / 2,166 parsed releases**, **1,058 newly stored stories**, **335 duplicate matches**, **2,219 requests / 203,622,763 bytes**, and **383 distinct newly covered global news issuers**. The healthy low-gain counter is **0** and current stop reason **NO_DUE_RELEASES**. Request limits are resumable batch boundaries, not site failures. Parsed releases are durably staged before ingestion; an interruption replays metadata without fetching/storing article bodies. The prior milestone71 resumed three September batches, adding 31 global news issuers with per-batch gains 8 / 10 / 13. Cumulative monthly accounting above includes those batches once. Older September releases are not presented as seven-day news. Backfill continues while incremental issuer gain remains material and source access allows it.

The cumulative explicit event backfill cohorts froze **180 verified unpolled event sources**, using the existing Q4, RSS, JSON-LD/iCalendar and HTML adapters. The source/company/URL identity and optional issuer scope remain fixed through restore, successful sources are skipped, and cooldowns/circuits remain authoritative. Its **8 completed batches / 180 source attempts / 320 requests / 7,888,905 bytes** recovered previously missing call coverage for **35 issuers**, dated-call coverage for **68**, webcast links for **52**, presentations for **19**, management content for **48**, and official upcoming earnings for **14**. These are distinct issuer gains across these runs; cross-cohort gains are not added twice to final coverage. Stop reason: **NO_DUE_SOURCES / NO_DUE_SOURCES / NOT_RUN**. A zero-HTTP audit checked **0 newly stored event records across 0 issuers**, exact frozen issuer/source identity, and local date/time against UTC plus the retained region or explicit offset. Six behavioral tests cover actual Q4 calls/dates/webcasts/presentations and confirmation, restored continuation, untouched budget deferrals, changed routes, protected cooldowns, shared infrastructure failure, CLI isolation and durable driver accounting. Production cadence is unchanged. Resume the same frozen cohort with `PYTHONPATH=scripts python -m company_intelligence.source_backfill_runner --lane events --run-id unpolled-events-oct5 --max-batches 10 --limit 32 --request-budget 160 --max-seconds 360 --network`. Newly discovered later event sources require a separate frozen run ID.

The same permitted metadata adapter also received bounded current-month October review: **1 batches / 2 requests / 0 parsed releases / 0 new stories / 0 newly news-covered issuers**, stop **NO_DUE_RELEASES**. September and October keep separate cursor/source/run identities. No full article bodies are retained; current-month freshness gain is measured separately from older historical releases.

The targeted call audit found synthesized earnings labels on nonfinancial clinical/strategy/transaction calls and replay deadlines. The producer now uses retained headline plus scheduling evidence to distinguish financial-result calls from existing IR_EVENT content, rejects joint-release host ambiguity, and requires live scheduling language rather than replay availability. Five behavioral tests cover clinical/strategy events with retained webcasts and zero earnings confirmation, preserved genuine quarter/financial-and-operating results calls and dates, shortened financial brands, joint-release wrong-host exclusion and replay-deadline rejection. The existing fourteen publisher contracts also pass. A zero-HTTP ledger repair corrected **17 original earnings classifications**: **14 useful investor events retained**, **2 unproven replay deadlines withdrawn**, and **1 wrong-issuer call withdrawn**. Exact original evidence remains in private audit records. BioVie's two independent retained references were reviewed together; Capital Bancorp's joint-release news remains accepted while the Peoples-hosted call is withheld. An operating-results-only title without retained financial proof stays a generic investor event. Source health stayed identical and affected estimates were refreshed through the existing unchanged model. Current counts below use the corrected export, rather than the higher unaudited snapshot.

The October publisher sitemap returned a well-formed empty URL set preserved with its SHA-256 integrity hash (62 bytes); the explicit current-month batch used two requests and parsed zero releases. This is an observed monthly-index limit, not negligible issuer matching or a completed October article inventory. Existing approved global RSS/news-sitemap feeds retain their normal four-hour due policy and remain a separate fresh-news opportunity.

The new publisher-event audit, relative to generation `ad1e580079c82c7e21620766`, covers 170 event records and 83 explicitly scheduled financial-result calls. Contributor/ticker identity, financial context and timestamp/timezone assertions pass with zero HTTP. Unsupported clocks remain unknown; the separate six-record explicit-U.S.-timezone correction is reported and delivered below.

A zero-HTTP September index census at 2026-10-06T14:01:14Z found 0 still-unattempted releases eligible for metadata inspection, 3200 ingested eligible entries and 25 degraded entries. Loose slug aliases budget requests only; they do not assign news or domain ownership. The next bounded continuation resumes these pending entries and respects existing degraded-entry cooldowns. The 11,968 indexed URLs are not asserted to be 11,968 supported-issuer releases.

The previously discarded August index uses publisher-relative dated release paths. The corrected strict archive adapter recognizes 11,325 entries at zero HTTP under index hash ab57f894a9fbdf9da2e9ec42a76061a6ade1c3cab8ced678d197d34b9257352e. It maps only dated article routes onto the already approved publisher origin, deduplicates absolute/relative forms, retains article canonical checkpoints and rejects external/scheme-relative hosts, unrelated routes and traversal. Three contracts cover origin scope, duplicates and metadata-stage resume/body eviction; all 23 archive contracts and 563 full Python tests pass. The same August run now has 34 completed batches, 3165 attempted / 3135 parsed releases, 1325 newly stored stories, 831 duplicate matches, 253 distinct globally newly covered news issuers, 3205 requests and 582,824,172 bytes; stop reason BUDGET_DEFERRED. Its initial two-request index attempt is included once. September accounting remains separate. Raw article bodies are not retained, and index entries are never ownership/accepted-news evidence.

The current zero-HTTP August index census has {'eligible_UNATTEMPTED': 583, 'eligible_INGESTED': 3132, 'eligible_DEGRADED': 0, 'eligible_PARSED': 0} among 11,325 advertised entries. All supported-company aliases are loaded before the same loose slug budgeting filter is evaluated; excluded entries are not counted as supported issuers. This is a resumable remaining-release queue, separate from accepted news and independently proven company domains. Material incremental issuer coverage warrants the next bounded continuation after this milestone is remotely preserved.

The publisher-article transport now UTF-8 percent-encodes advertised IRI paths for HTTP while keeping original ledger keys. Equivalent canonical/redirect URIs validate without trusting a changed host, release ID or route. Both original and encoded memo/cache keys are evicted; full article bodies remain unpersisted. Both new behavioral contracts failed on the previous producer; all 25 archive contracts and 565 full Python tests pass. The fix was remotely preserved independently before local-format recovery; actual outcomes follow below.

The targeted local-encoding recovery retained exact originals and a pre-recovery archive, admitted 2 failed releases after correcting request formatting, and recorded outcomes ['INGESTED', 'INGESTED']. Original Unicode release keys are unchanged. This is a format-error recovery, not an override of transport/site failure cooldowns or permission. Accepted issuer/news gains remain measured by the normal matcher and monthly driver.

The zero-HTTP August Unicode-path census found 146 literal-Unicode advertised entries, of which twelve passed the same supported-name request-budget filter: two retained local encoding failures and ten still unattempted. They remain discovery candidates, not accepted releases or proven issuer coverage. The reusable HTTP-path fix addresses this recurring source format without expanding ownership or publisher access.

The real-ingestion canonical-spelling audit reproduced a local edge case: an equivalent encoded publisher canonical could leave the raw index IRI PARSED while ingestion marked another spelling INGESTED. Fresh metadata and restored staged metadata now keep the exact original ledger key. Two additional integration contracts verify actual storage completion and zero-refetch staged replay. All 27 archive contracts pass; the latest full Python count is recorded separately. The two technical recoveries parsed successfully but remained issuer-unmatched and add zero news/coverage. Their small two-release sample is excluded from the main monthly low-gain stop counter with the original counter recorded; all physical requests and completed-batch accounting remain intact.

## 14. Calls — historical 137; current reconstructed 1069

New-domain cohort: **644 call-exists issuers / 559 dated-call issuers**. Structured event JSON-LD/iCalendar/Q4/GCS/feed metadata and issuer-authored release call schedules provide evidence. An announcement's results-release date cannot become a distinct conference-call date without explicit call evidence.

## 15. Webcasts — historical 111; current reconstructed 856

New-domain cohort: **588** issuers. Replay issuer count: **14**. Public webcast references are retained; explicit replay/recording availability is separate and never inferred from a webcast URL.

## 16. Presentations — historical 212; current reconstructed 1821

New-domain cohort: **1285** issuers. Official platform/document/event/results pages provide presentation references; arbitrary PDFs and self-navigation anchors do not.

The continuing materials runner has completed **14 batches**, using **803 requests / 25,580,110 bytes**, and recovered **86 distinct presentation issuers**. These are measured material-lane recoveries, not all newly discovered IR presentation gains. Original source health and due times remain authoritative.

## 17. Transcripts — historical 64; current reconstructed 403

New-domain cohort: **259** issuers with company transcript references. URLs are reference evidence, not claims that transcript bodies were downloaded, generated or licensed.

## 18. Management content — historical 149; current reconstructed 1106

Current issuer counts: transcript 403; prepared remarks 64; shareholder letters 90; other management commentary 25; any management content 1106. New-domain any-content cohort: **746**. Public webcast references contribute under the existing measured definition; success is not limited to transcript links.

## 19. Confirmed earnings — historical 44; current reconstructed 161

New-domain confirmed-upcoming cohort: **85**. Existing model reconciled 19 stale estimates overlapping official confirmation; no forecast parameters changed. Current estimated upcoming windows: **3132**. Historical backtest remains 95.48% window coverage over 3,847 predictions; it is historical validated evidence, not rerun/invented performance.

## 20. Downstream funnel

**1777 new verified domains → 1596 IR → 1305 news-source issuers → 788 event-source issuers → 644 calls → 588 webcasts → 1285 presentations → 746 management-content issuers.** These are overlapping component sets, not a claim that each sequential subset contains the next. 3703 operational source descriptors belong to the new-domain cohort; actual accepted news coverage is measured separately from source count.

The separate retained verified-seed cohort now has measured component gains relative to preceding generation `debf4b0c9f43c379cde56118`: {'irPageFound': 596, 'anyNews7d': 108, 'anyNews30d': 175, 'anyNews180d': 279, 'calls': 196, 'callDates': 170, 'webcasts': 166, 'presentations': 437, 'transcriptLinks': 115, 'anyCallContentReference': 258, 'confirmedUpcomingEarnings': 35}. Newly retained verified source identities: {'IR_FEED': {'sources': 371, 'issuers': 332, 'successes': 371}, 'IR_EVENTS': {'sources': 248, 'issuers': 219, 'successes': 248}, 'IR_MATERIALS': {'sources': 417, 'issuers': 286, 'successes': 393}}. These describe existing-seed downstream expansion, not new domain verification or an inference from successful discovery alone.

Kaltura's newly verified corporate domain now converts to independently owned GCS IR: ten news releases and 4 financial-result calls with retained dates, local times/timezones and webcast URLs passed actual local storage → API → browser delivery (3 assets / 80,136 bytes, three private-path probes rejected). Needham investor conferences remain IR_EVENT and do not confirm earnings. This is actual new-domain downstream conversion relative to milestone71, not a domain-only gain.

The newest monthly-metadata tail is 11/11 classified: six verified owners, three insufficient-evidence cases, one ambiguous and one temporary failure. All six current cached ownership replays pass. Its measured early downstream funnel is {'officialDomainFound': 6, 'irPageFound': 5, 'newsSourceDiscovered': 4, 'eventSourceFound': 1, 'anyNews': 6, 'calls': 0, 'callDates': 0, 'webcastLinks': 1, 'presentations': 3, 'transcriptLinks': 0, 'anyCallContentReference': 1, 'confirmedUpcomingEarnings': 0}; no call gain is inferred. Daktronics, Acrivon and Euroholdings have actual presentation references; Fort Technology still lacks a discovered IR page. These six-domain components are a cohort snapshot, separate from final cumulative counts and final newly enriched-stock audit.

The current August-derived ownership tail classified all eight identities: four independently verified, two rejected and two deferred. Its four verified issuers have measured downstream components {'officialDomainFound': 4, 'irPageFound': 2, 'newsSourceDiscovered': 2, 'eventSourceFound': 1, 'anyNews180d': 4, 'anyNews30d': 1, 'calls': 2, 'callDates': 2, 'webcastLinks': 1, 'presentations': 1, 'transcriptLinks': 0, 'anyCallContentReference': 1, 'confirmedUpcomingEarnings': 0}. Array retains an owned GCS IR hub, explicit August 5 17:00 EDT call, provider webcast and actual earnings/showcase decks; document dates remain unproven where the link metadata supplies no date. Nano Labs retains the explicit August 28 08:30 U.S. Eastern / 20:30 Hong Kong financial-results call, correctly normalized to 12:30Z. Airwa and TryHard add issuer-matched news but do not yet add presentation/call/management coverage. Successful bounded walks are not counted as IR pages unless the existing coverage model has an observed route.

The current eight-identity metadata tail has four strong owners, three rejected and one temporary failure. Its newly verified TVRD, VCIG, CISS and TRAX cohort has independently measured downstream counts {'officialDomainFound': 4, 'irPageFound': 3, 'newsSourceDiscovered': 2, 'eventSourceFound': 1, 'anyNews180d': 4, 'anyNews30d': 0, 'calls': 1, 'callDates': 1, 'webcastLinks': 1, 'presentations': 1, 'transcriptLinks': 0, 'anyCallContentReference': 1, 'confirmedUpcomingEarnings': 0}. These components are separate from the preceding four-owner August cohort and no source descriptor alone establishes news/call/material coverage.

The newest independently verified tail has measured downstream counts {'officialDomainFound': 2, 'irPageFound': 0, 'newsSourceDiscovered': 0, 'eventSourceFound': 0, 'anyNews180d': 2, 'anyNews30d': 0, 'calls': 0, 'callDates': 0, 'webcastLinks': 0, 'presentations': 0, 'transcriptLinks': 0, 'anyCallContentReference': 0, 'confirmedUpcomingEarnings': 0}. Actual coverage remains separate from domain verification and source descriptors.

The newest bounded ownership tail has independently measured downstream counts {'officialDomainFound': 2, 'irPageFound': 1, 'newsSourceDiscovered': 1, 'eventSourceFound': 1, 'anyNews180d': 2, 'anyNews30d': 0, 'calls': 1, 'callDates': 1, 'webcastLinks': 0, 'presentations': 1, 'transcriptLinks': 0, 'anyCallContentReference': 0, 'confirmedUpcomingEarnings': 0}. Source descriptors alone establish no coverage.

The advertised-root recovery has 53 independently proven owners cumulatively, including 0 newly verified since the accepted preceding checkpoint. Its same-time checkpoint comparison separates current cohort components {'officialDomainFound': 53, 'irPageFound': 46, 'newsSourceDiscovered': 41, 'eventSourceFound': 22, 'anyNews180d': 51, 'anyNews30d': 49, 'calls': 20, 'callDates': 17, 'webcastLinks': 14, 'replayLinks': 1, 'presentations': 35, 'transcriptLinks': 7, 'preparedRemarks': 0, 'shareholderLetters': 3, 'managementCommentary': 1, 'anyCallContentReference': 20, 'confirmedUpcomingEarnings': 4} from newly acquired components {'officialDomainFound': 0, 'irPageFound': 0, 'newsSourceDiscovered': 0, 'eventSourceFound': 0, 'anyNews180d': 0, 'anyNews30d': 0, 'calls': 2, 'callDates': 2, 'webcastLinks': 0, 'replayLinks': 0, 'presentations': 0, 'transcriptLinks': 0, 'preparedRemarks': 0, 'shareholderLetters': 0, 'managementCommentary': 0, 'anyCallContentReference': 0, 'confirmedUpcomingEarnings': 0}. Approved-seed reuse and mere corporate-root configurations are excluded from new owner/IR gain. Historical external news already covering these companies is not called a new news-issuer gain from domain verification.

The budget-recovery cohort has 10 proven owners cumulatively (0 newly verified since the accepted preceding checkpoint) with current components {'officialDomainFound': 10, 'irPageFound': 9, 'newsSourceDiscovered': 9, 'eventSourceFound': 7, 'anyNews180d': 8, 'anyNews30d': 7, 'calls': 6, 'callDates': 4, 'webcastLinks': 6, 'replayLinks': 0, 'presentations': 8, 'transcriptLinks': 2, 'preparedRemarks': 0, 'shareholderLetters': 0, 'managementCommentary': 0, 'anyCallContentReference': 6, 'confirmedUpcomingEarnings': 1} and new same-time checkpoint82 component gains {'officialDomainFound': 0, 'irPageFound': 0, 'newsSourceDiscovered': 0, 'eventSourceFound': 0, 'anyNews180d': 0, 'anyNews30d': 0, 'calls': 1, 'callDates': 1, 'webcastLinks': 0, 'replayLinks': 0, 'presentations': 0, 'transcriptLinks': 0, 'preparedRemarks': 0, 'shareholderLetters': 0, 'managementCommentary': 0, 'anyCallContentReference': 0, 'confirmedUpcomingEarnings': 0}. Its dedicated actual-new-content audit found 1 enriched stock outputs, sampled RWAY, and kept 9 owners without new visible useful information separate. Exact added content is tested through local storage/API/browser delivery rather than inferred from source descriptors. Independently owned IR-only recovery does not authorize an unread corporate root.

## 21. Coverage tiers and component percentages

| Existing tier | Issuers | Percentage |
|---|---:|---:|
| A_FULL | 256 | 4.21% |
| B_STRONG | 2990 | 49.19% |
| C_BASIC | 1623 | 26.7% |
| D_LIMITED | 1209 | 19.89% |

Component counts and percentages **within each tier** (financial strength alone does not imply these components):

| Tier | News 180d | News 30d | Calls | Dated calls | Presentations | Management content |
|---|---:|---:|---:|---:|---:|---:|
| A_FULL | 256 (100.0%) | 178 (69.5%) | 256 (100.0%) | 256 (100.0%) | 256 (100.0%) | 253 (98.8%) |
| B_STRONG | 1587 (53.1%) | 1063 (35.6%) | 586 (19.6%) | 490 (16.4%) | 1131 (37.8%) | 617 (20.6%) |
| C_BASIC | 648 (39.9%) | 437 (26.9%) | 207 (12.8%) | 180 (11.1%) | 386 (23.8%) | 215 (13.2%) |
| D_LIMITED | 110 (9.1%) | 75 (6.2%) | 20 (1.7%) | 17 (1.4%) | 48 (4.0%) | 21 (1.7%) |

Strong includes preserved financial/calendar/SEC identity evidence and must not imply broad current news/call coverage. Component percentages: news 42.79%; IR 37.51%; calls 17.59%; presentations 29.96%; management 18.2%; financial summaries 80.11%; SEC identities 89.04%. Financial summaries remain 4869; current summaries 3721; SEC identities 5412.

The cache-only broad IR audit checked 48 newly accepted records across 11 issuers relative to the preserved milestone74 ledger, including 8 dated earnings calls. Verified source/company identities and date/time/UTC conversions passed. Healthcare and general investor conferences retained IR_EVENT classification; historical calls retained their actual dates. This broader audit is separate from the frozen event-backfill audit.

A zero-HTTP known-error material scan reviewed 11324 new references across 1224 issuers relative to the preceding private restore and found 0 candidates matching test-placeholder or report/supplement/release filename misclassification signatures. This supplements, rather than replaces, actual-output and source/date audits.

The actual-output audit found a Jack Henry shareholder report presented by a generic View Presentation button. A reusable named-report rule now retains it as FINANCIAL_REPORT while preserving explicit investor-slide titles and shareholder letters. The old producer fails the new behavioral contract. Two retained references for one URL/issuer were corrected with original evidence/hash preserved, zero HTTP, unchanged source health and zero linked events. The valid Jack Henry company transcript remains available. All 65 targeted and 537 full Python tests pass. Final counts below use the corrected generation, and historical materials with absent dates remain undated rather than being promoted into fresh coverage.

The random enriched-stock audit caught an external investor.gov fraud warning misclassified as company IR through URL vocabulary. The associated SEC investor-bulletin feed had supplied 30 unrelated stories to Jefferies and Piper Sandler. All 30 sole-provenance records were withdrawn, both source descriptors removed from configuration, both runtime sources quarantined and both invalid IR page configurations removed. Original records and a pre-correction private checkpoint were retained. Existing Jefferies Q4 IR and presentation references remain. All unaffected source health, events and calendar records were unchanged; the two quarantined sources retain their original due times and history. Three behavioral regressions fail on the prior producer and pass after constraining path/hostname inference to the verified company domain. Exact delegated IR navigation still works. The final metrics and output/restore audits below use corrected state; these false records are not counted as coverage.

Manual review before preservation caught one Beam Global presentation-acceptance news article and one SoundThinking ESG-report PDF misclassified as presentations, plus generic plural shareholder-letter navigation. The exact private correction retired 8 reference instances across 5 URLs, while retaining actual Beam investor decks and Energy Recovery's individually linked shareholder letter. Eight explicit SEC-filing RSS endpoints contributed 100 sole-provenance news records; these metadata records were withdrawn, the sources quarantined and their descriptors removed. Originals and a private pre-correction archive survive. Calendar events, aliases and original source health/due times passed exact preservation checks. Five new behavioral contracts cover announcement/report/deck boundaries, navigation versus actual letter, direct/landing feeds and legacy ingestion; all 586 full Python tests pass (49.005s). Updated exports, cohort metrics and exact restored generation below use corrected state. The earlier milestone81 raw checkpoint is retained as pre-quality evidence and is not presented as the accepted final generation.

The first live WordPress quality review paused the writer at a bounded checkpoint after three batches. Exactly 2 Teekay Tankers stories had inherited parent ticker TK trust through its shared site. Both sole-provenance records were withdrawn with original metadata and a pre-correction checkpoint preserved; source health/due times and complete event/event-alias table hashes are unchanged. A current-master name-span guard now withholds a parent's CMS actor when every occurrence is contained in another issuer's longer name. Independent parent mentions, including joint announcements, remain accepted. The three REST/RSS/Provident contracts fail on the preceding producer and pass on the fix. Cached schema analysis identified 6 issuers exposing seven additional named, dated collections: {"financial-release": 1, "news-media": 1, "press": 1, "press-release": 1, "press-room": 1, "press_release": 1, "pressreleases": 1}. The adapter now accepts those exact advertised names and can inspect at most two schema-proven collections after the default blog; an unrelated first collection cannot suppress a qualifying second one. No route is guessed, full article body downloaded or polling frequency changed. Three additional route/privacy/budget contracts fail on the preceding adapter. All 25 targeted WordPress contracts and the full 609 Python suite are validated separately below. Live gains from newly supported routes are not claimed before the next resumable pass.

The new-stock consumer audit now compares stable news identities, rather than counting a canonical-URL change as a new story. First-party provenance/URL upgrades remain valuable and are measured separately; they do not by themselves qualify a stock for the new-content sample. Each newly sampled news record must retain its exact newsId and canonical URL through consumer delivery.

An additional stable-story-ID comparison of immutable milestone84 proves the three-stock gains were substantive: VCYT gained one visible story and 15 materials, TK gained six visible stories, and ONCY gained seven visible stories plus four separately counted canonical/provenance upgrades. A fresh three-stock storage/API/browser acceptance asserts genuinely added TK/ONCY newsId and URL pairs, rather than relying on a changed URL for an existing story. It passed for generation 76a78c65419e9d0ac00b2e0b with three private-path probes rejected.

The real WordPress stock-output sample caught exactly one instructional technical blog misclassified as a company announcement through its explicit author brand. The complete retained WordPress census found this one sole-CMS-provenance record. Its original metadata and verified pre-correction checkpoint are preserved privately; exactly 1 item was withdrawn, with complete source, event and event-alias table hashes unchanged. Grid Dynamics' genuine acquisition announcement on the same blog remains accepted. A narrow WordPress-only instructional-blog guard preserves corporate announcements and investor-call access information; external matching and ownership proof are unchanged. The old producer fails the regression; the corrected producer passes all 28 targeted WordPress tests and the full 612 Python tests. The corrected generation receives fresh restore/reprojection and storage/API/browser audits, and the raw generation 1b00b278700950d13b2e9ccb is excluded from final coverage claims.

Additional direct-page review of the newly verified cohort confirms Ridgepost/RPC's July 17 publication announces an August 5 call; the payload date is correct. The official page explicitly states 08:00 Eastern (12:00 UTC), but the bounded feed payload currently leaves its clock unknown. The two-request / 38,371-byte read-only audit independently revalidated the page under v10 and made no event or ownership mutation. SEC submissions independently confirm Dogwood/DWTX and former Virios share CIK 0001818844, with the rename dated October 15, 2024; the legacy domain is not credited as newly fresh first-party news. These limitations are retained rather than counting publication clocks or stale brand pages as new useful data.

Manual review of newly enriched stock outputs caught one external legal investigation advertisement at QBTS and an older HighPeak feed-derived call using the separate release date. The complete retained-news sweep found exactly one external solicitation and preserved three factual verified first-party legal announcements. One solicitation was withdrawn. HighPeak's official announcement explicitly confirms August 10 as the release and August 11 as the call; only the wrong historical same-source call was replaced by its release record, with its alias redirected and the independent August 11 call preserved. Complete source-health/due-time hashes and unrelated-event hashes remained unchanged; estimates and upcoming events were unaffected. Originals, source evidence hash/bounded excerpt, a journal and raw generation c6c333b6d367eb8364cb9309 remain private; that raw generation is excluded from final claims. The external solicitation filter now rejects the observed LLP encouragement/contact template before matching or candidate creation; truncated quarter-result release clauses cannot become calls. Three added behavioral tests preserve factual legal business announcements, ordinary investor access, and explicit call-only evidence. Current full suite: 632 Python tests passing; fresh corrected-generation storage/API/browser and restore proofs are required below.

The same manual sample exposed HighPeak's first-quarter predecessor as well: the official announcement separately states May 6 release and May 7 call. Its original event identity was retained and its historical date corrected to May 7 with bounded source excerpt/hash and original metadata journaled; unknown clock fields remain unknown. Source health/due times and upcoming/estimated calendar records were preserved. A separate 59-event / 27-company composite-announcement cohort is frozen for bounded exact-source review after this remote checkpoint; neither unreviewed records nor a complete date-cluster audit are claimed successful here.

## 22. Random quality audit

Preserved audited promotion waves retain exact CIKs, URLs, verification versions, original timestamps and hashes. A current cached verifier rejection cannot be promoted. The latest wave retains independently reverified cached proof or the original strong hashed proof after cache pruning. Six existing validated master identities without CIK remain operational without inventing or changing identity mappings. Configured seed counts and operational coverage are distinguished. The preceding 79-seed coverage wave audited 85 unconfigured roots with zero requests: 73 current cached revalidations and 12 retained strong hashed proofs. Seventy-nine had existing current-master CIKs and were promoted, together with 87 independently successful source descriptors; the six unmapped identities remain operational. Random actual enriched-stock audits inspected company/domain/IR/headline/date/call/material/source evidence. Three 12-issuer cohorts passed the existing local-storage → pilot API → browser-contract path; all returned actual useful content and all private-path probes were rejected. Later examples include POWI, UNM, ACCO, CBRE, RYN, WABC, AN, CPSH, TRST, UIS, KOPN and IBCP. The publisher-enriched cohort SAIA/DPRO/QCLS/KLRA/SGMT/VWAV/DYN/ARVN/PSIX/MLYS/VRCA/NEXR measured 25 assets / 150,595 bytes, maximum payload 18,038 bytes; retained contributor/exchange/ticker/date proof passed a separate 12-item random audit. Six navigation-only document instances across four issuers were retired with private audit evidence, and three self-linked IR dropdown configurations were corrected. An additional 12-stock materials audit (MDU/RTX/RJF/TTI/IHG/IDXX/BIIB/UNM/AVD/WRB/BF-A/CBSH) required a presentation in every consumer output and passed local storage/API/browser delivery: 25 assets / 568,814 bytes, maximum payload 64,554 bytes, with three private-path probes rejected. Twenty-two references passed issuer/source-provenance checks with no network requests. The corrected IHG transcript also passed local consumer delivery: three assets / 48,216 bytes, maximum payload 47,700 bytes, with three private-path probes rejected. A further random five-stock cohort from the latest promoted roots (BZAI/BLTE/EFXT/ZYME/MDCX) required actual acquired news/calls/non-filing materials and passed local storage/API/browser delivery with three private-path probes rejected. These five were the entire useful-content subset of the latest root wave at audit time; remaining new roots still require downstream IR discovery. The nine cached-presentation issuers ELBM/GRNT/RADX/CRML/HSHP/ARIS/GFR/CDLR/KLAR passed local consumer delivery with a presentation required for every stock: 19 assets / 80,254 bytes, maximum payload 13,303 bytes, with three private-path probes rejected. Their actual linked reference labels and filenames were reviewed; HSHP’s February-2022 company presentation remains explicitly undated metadata and is not represented as current. A further random 12-stock cohort (ACLS/ALGN/ARVN/CW/DNN/EPR/ESEA/MBWM/POWW/PTC/SA/WTFC) passed acquired-news/calls/non-filing-material consumer assertions: 25 assets / 373,528 bytes, maximum 65,387 bytes; all three private-path probes were rejected. Structured PTC and Mercantile call dates/times/timezones/webcast URLs were reviewed. Two exact untimed call groups remain duplicated in the retained event ledger, including EPR; no issuer-coverage count is inflated. This is a bounded remaining consumer display issue, not evidence of an extra call. A further deterministic random 12-stock Q4 cohort inspected CVGI/SLDP/RPD/INSW/TPB/KBDC/IPHA/AMPY/BATRA/WTFC/SIGA/CTRE against actual ownership, first-party news dates, structured call timezones and presentation/webcast references. The support-page audit corrected investor email-alert/RSS forms previously labelled as IR entry points, retaining all source records and source-success timestamps. A shared parser test now proves alert navigation cannot replace an observed IR hub and a direct signup page does not count as IR. The 12 sample consumer outputs each contain acquired news, calls or non-filing company materials; local storage/API/browser delivery passed with 25 assets / 613,882 bytes and all three private-path probes rejected. A further deterministic 12-stock GCS audit reviewed ECX/TNGX/AXSM/OLLI/EIKN/AQB/LQDA/NODK/SMPL/PYPD/DSGN/CAPL. Official first-party dates, delegated GCS hosts, published corporate presentations and Liquidia/PolyPid call timezones/webcasts were checked; clinical or product events were not reclassified as earnings calls. Actual local storage/API/browser delivery passed for all 12 with useful acquired content and all private-path probes rejected. Audits do not imply public deployment.

Latest cached conflict review inspected Abacus, Ardent Health, Autonomix, Robinhood, Clene and Alta Equipment against current legal-owner excerpts and hashed root pages. Several are actual subsidiary, brand or renamed-entity differences; none was automatically resolved. The remaining structural footer cases require stronger complete legal-owner evidence rather than convenient brand matches. A deterministic 12-item publisher audit reviewed FLYW, GPRK, BLNE, PARK, TOL, VS, SCOR, RPGL, RUN, MAAS and STEX, with two TOL releases. Explicit publisher exchange/ticker, exact contributor, canonical URL and publication timestamp agreed with the assigned current-master company in all 12; full bodies remain absent.

The latest 25-stock consumer cohort passed actual local storage → pilot API → browser-contract delivery: 50 assets / 805,654 bytes, maximum payload 73,764 bytes, and all three private paths rejected. OPTU/JBI/ARBE explicitly required stored structured calls; SBSI/CAC/HNRG/AMPY explicitly required correctly typed company transcripts; publisher-enriched stocks required useful accepted metadata. The obsolete HMST ticker was refused by current-master lookup rather than mapped by a name guess; its current identity is MCHB (Mechanics Bancorp). This is local delivery acceptance, not production publication.

The exact current-master MCHB identity also passed local consumer delivery (three assets / 48,383 bytes, maximum 47,864 bytes, three private-path probes rejected). Its first-party Joint Mechanics Bank/HomeStreet investor-call transcript is correctly typed and retained under the stable CIK, without remapping the obsolete HMST symbol.

The next material-source runner completed two bounded batches (63 source attempts) using 119 requests / 1,916,915 bytes, adding presentation coverage for 19 distinct issuers. The second batch had 11 isolated source failures with retained backoff; the IR circuit remained closed. A checkpoint boundary pause scheduled the next due domain retry rather than treating a healthy local limit as a source failure. Random actual metadata checks reviewed SIG, PLX, ZBRA, CWCO and KMPR (KMPB is the same issuer representation). Genuine first-party investor/KOL/earnings decks were confirmed. Signet's displayed September title and June index grouping date remain separate metadata; neither is invented as a publication date. Earlier historical decks remain explicitly historical/undated.

The five new-material stocks also passed local storage/API/browser delivery with an actual presentation required in every output: 11 assets / 199,595 bytes, maximum payload 62,321 bytes, and all three private-path probes rejected.

The next broad IR quality review inspected AP, OMC, FEIM, GTN and KEX against observed official IR routes and actual company-specific materials/news. All five passed local storage/API/browser delivery: 11 assets / 243,821 bytes, maximum payload 78,465 bytes, with all three private-path probes rejected. AP/OMC/FEIM/GTN require actual presentations, OMC additionally requires its acquired company transcript, and KEX requires accepted news. These are stored investor-visible references rather than filing-only payload checks. Publication dates absent from material references remain NOT_PROVIDED.

The next deterministic random 12-stock broad IR audit selected STRO/WOR/ASPN/FORM/FLO/LARK/BYRN/APLD/SVRA/MPT/INN/PLX from 46 issuers with actual new consumer-visible content relative to the preceding immutable export. It checks the exact newly acquired URL/type or call ID through local storage/API/browser delivery, rather than accepting pre-existing filing-only content. Investor/conference webcasts at WOR and SVRA are not classified as earnings calls; official earnings call dates and timezones at ASPN/LARK/BYRN/APLD/MPT/INN were inspected. FLO has correctly typed prepared remarks. Material references without publication-date proof stay NOT_PROVIDED. The initial audit led to the scientific-news correction above; the corrected cohort passed all 12 exact-new-content delivery assertions: 25 assets / 625,927 bytes, maximum payload 103,466 bytes, with three private-path probes rejected.

The preceding four-stock new-content consumer audit required exact additions relative to the immutable preceding export: **PEP** (Q2 2026 directly linked earnings-release PDF), **TRIB** (first-party diagnostics/corporate-update news), **LPTH** (August 2026 investor deck) and **EGO** (Q2 2026 earnings-call presentation). All four passed the local delivery → API → browser contract path: nine assets / 71,704 bytes, maximum 23,344 bytes, with three private-path probes rejected. Publication dates for PDFs remain absent unless the source supplies them; fiscal/file labels are not fabricated publication dates. No PepsiCo transcript or call is counted from its unproven redirected hub.

A subsequent random 12-stock audit selected actual new content from 54 eligible issuers relative to the immutable preceding checkpoint: **MPLX, FBIZ, EDSA, POST, GOGO, SLI, ETN, HTB, TPST, IPDN, FWONA and NPCE**. Exact newly acquired decks, prepared remarks, first-party news or public webcast references were required; existing filings alone did not qualify. All passed local delivery → API → browser checks: 25 assets / 442,612 bytes, maximum 92,239 bytes, with three private paths rejected. Investor-day/clinical-conference references remain their actual event types; a public webcast URL is not a transcript or a newly inferred earnings date.

The actual 12-stock review detected one older Profusa investor-presentation reference whose 7,464-byte PDF contains only PLACEHOLDER DOCUMENT (live SHA-256 22f06f4dbce6696f9ca55a5159e159b69d7f04358d24d30ac2b5b08eacd96f1c; two audit requests). A separately journaled correction retires exactly one reference; news, events, event aliases and full source health/due fields retain identical table hashes. Generic placeholder PDF assets are now withheld in advertised material discovery, event follow-up links, retained hub documents and consumer material export, while actual decks remain. All 20 material-hub contracts and all 603 Python tests pass (48.986 seconds); three placeholder contracts fail on the preceding producer. The pre-quality archive/proof remains retained, and final accepted measurements use a fresh corrected restore.

The latest publisher identity audit checked **232 newly accepted stories** relative to preserved milestone85 checkpoint and sampled up to 12 with seed 356. Each checked item retained current-master identity, exact contributor and explicit exchange/ticker evidence, canonical URL/publication timestamp pair retained in provenance; canonical duplicates retain the issuer-owned URL when that retained provenance supplies the canonical pair. Full article bodies remain absent.

The actual consumer audit found **313 stocks with newly visible content** relative to immutable milestone85 export and sampled **RGEN / INKT / AEHL / OBAI / HPK / LENZ / GLE / AAUC / ASLE / HIMX / TELO / RVMD**. Exact newly acquired URLs/types passed local storage → API → browser checks: **25 assets / 486,256 bytes**, maximum **103,152 bytes**, with three private-path probes rejected. The preceding milestone54 audit passed for REXR, ELTX, ZM, GRNQ, HRTG, AUPH, PANL, WVE, QTTB, ATEN, VIRT and NERV (25 assets / 427,825 bytes / max 102,843 bytes); earlier eight-stock recovery/custom-collection and 12-stock materials audits also passed. External company news can enrich a stock without inventing an official domain. No authenticated deployment is implied.

The live collision audit retained separate current identities for ROOT, U, XYZ, TOST, TGT, AFRM, META, AAPL, ORCL, RCI, PFS, PROV and PVBC. Correct newly acquired news for **AAPL / AFRM / ROOT / GOOG / GOOGL** passed actual storage → API → browser delivery: **9 assets / 358,397 bytes**, maximum **195,509 bytes**, three private-path probes rejected. GOOG/GOOGL resolve to one stable Alphabet CIK. Other stress identities still lacking accepted news are recorded as uncovered.

The preceding milestone55 verified-feed run had durable outcomes for all **182 frozen source identities**. Seven checkpointed batches include the final zero-request no-due boundary. It added **1,567 stored stories and 155 previously news-uncovered issuers** with **340 requests / 11,732,088 bytes**. Date windows above independently exclude older retained stories. Twenty publisher-discovered identities were separately frozen as `inventory-20261005-metadata-after-news` for the next recovery cycle. This is an in-progress checkpoint; the remaining recovery ceiling has not been reached.

A zero-HTTP cross-issuer artifact audit checked 13,683 distinct stored presentation URLs and found 0 shared across different stable issuer IDs. This supplements issuer/source/date and random actual-output checks; it does not replace ownership verification.

The preceding twelve-stock actual-output audit distinguished historical materials from fresh news: NOMA’s presentation retained no inferred date despite its 2025 URL path; DLHC’s annual shareholder webcast and ANRO/TTRX healthcare conferences remained WEBCAST/IR_EVENT rather than earnings calls. TRON’s renamed issuer remained attached to its retained official SRM-domain provenance; no crypto ticker match alone established ownership. Smurfit Westrock’s legacy corporate domain and new IR hostname retained their verified issuer relationship. These observations describe the immutable preceding snapshot, not additional gains in this checkpoint.

The normal approved-global-source refresh has 71 newly retained stories across 70 issuers relative to preserved milestone76. Each record passed replay of the current external issuer resolver, exact source URL identity, retained canonical URL/publication pair and solicitation exclusion; zero HTTP was used for this audit. These gains are separate from monthly historical metadata and first-party sources.

The preceding milestone73 manual review of its deterministic twelve-stock sample verified Builders FirstSource's October 29 10:00 America/New_York call and linked Q4 webcast, while Everspin's H.C. Wainwright conference remained IR_EVENT and separate from financial-result calls. iBio's Exhibit 99.1 URL retained an explicit Investor Presentation source label. Energy Recovery's shareholder-letter hub is accompanied by its actual 2026 Q2 letter PDF, separately asserted in consumer delivery. Iovance and SiTime UUID presentations remain undated; CorMedix and Meridian URL path dates were not inferred as publication dates. Meridian's retained GMGI slide labels stay attached to the same issuer CIK after its MRDN rename. OceanFirst's correctly matched external scheduling announcement supplies news without inventing domain ownership or an unsupported call date.

The corrected times are verified through actual local storage → API → browser-contract delivery for YB / UCL: 5 logical calls retain exact date, local time, timezone and UTC start, with three private-path probes rejected. This is a historical scheduling-quality acceptance and adds no issuer coverage.

The preceding milestone74 bounded quality verification of enCore Energy's verified issuer-owned events page reproduced the exact New Orleans Investment Conference JSON-LD event, October 28 date and external conference destination. It remains IR_EVENT, with no inferred destination ownership or earnings confirmation. The original body had been evicted by the bounded cache; verification used 2 requests / 277,616 bytes, with no source-health or due-time change.

Independent zero-HTTP manual review of the newest NCSM/MKLY roots retained exact footer/title and distributor author/ticker ownership evidence. NCS Multistage corporate navigation redirects its IR route through ir.weatherford.com to Weatherford, whose title and footer identify another owner. The existing redirect guard withheld that destination, preventing Weatherford call/material leakage into NCSM. McKinley navigation supplied only an investor-email unsubscribe route and no accepted source/material/call evidence. Successful root verification or a bounded walk is not treated as actual IR coverage.

A separate zero-HTTP manual review of August batch15 newly news-covered SUNE, SIEB, IRIX, STN, OSS and BANL retained exact contributor/exchange-ticker identities and August18 publication timestamps. The battery milestone, ETF partnership, storage order and issuer-bid amendment remained news; Iridex results supplied an earnings-published event without an inferred call. Existing estimated reporting windows remained separate.

The dedicated alias-owner consumer audit found 8 issuers with newly visible useful metadata or materials against the exact checkpoint85 public generation, sampled ARDX / VRCA / LOCO / OKYO / ZS / BFRG / FNGR / KDK, and separately retained 45 owners without new visible useful content. Exact added URLs/events must pass storage → loopback API → browser-contract delivery and three private-path rejection probes. These data are not inferred from root counts or source descriptors.

The publisher-event audit now keys source stories by both current master company identity and original URL. A CareCloud release legitimately matches CCLD, CCLDO and CCLDP through separate exact NASDAQ ticker metadata and the same legal contributor name; a global URL-only lookup incorrectly overwrote two identities. Every original confidence/author/ticker/date-time assertion is retained. Metrics continue to use the existing supported company-identity denominator; unmapped master share-class identities are not inferred into a new CIK or used to rewrite Company Master.

## 23. False-positive audit

Explicit fixtures retain ROOT, UNITY, BLOCK/XYZ, TOAST, TARGET, AFFIRM, META, APPLE, ORACLE, GOOG/GOOGL, Rogers, similarly named healthcare issuers, Provident and crypto ticker-collision checks. No generic-name/ticker shortcut was added. Root Inc. Japan LLC, wrong-CIK aliases, different ownership, forged Q4 credits, unsafe redirected hosts and unrelated announcement actors remain rejected. Exact master identities/share classes and foreign-issuer handling remain intact.

An additional twelve-ticker storage/API/browser call-context audit passed for BEAM, AVXL, GPCR, PYXS, BIVI, CBNK, NXGL, UPXI, TTAN, RELL, FANG and VNOM. Exact withdrawn source/event references are absent from the calls section; four genuine financial calls remain available. Publication used 25 public assets and 523,123 bytes, with three private-path probes rejected.

## 24. Requests and bandwidth

Main completed-batch accounting: **11007 requests / 902887766 downloaded bytes**. Supplementary completed batches: **211 requests / 11596440 bytes**. Main per-candidate counters retain 10977 requests; preceding local-reuse rows lost some counters before the preservation fix, so completed-batch accounting is the traffic authority. No per-candidate values are invented to fill that historical gap. Second/third per-pass counts are above. Discovery admission/per-host robots pacing remains bounded; downloaded bytes are retained per batch/candidate. Completed September metadata batches and the publisher failure used **3415 requests / 311306770 downloaded bytes**. Two successful known-family recovery batches accepted 290 stories in 62 requests / 2,822,276 bytes; the later shared-failure probe stopped after ten requests/zero bytes. These operational batch populations are separate and must not double-count stale last-batch reports. HTML and Q4 material batches used a separate 133 requests / 4,622,557 bytes; public SDK/API probes used three requests / 45,402 bytes. A subsequent Q4 outage batch stopped after 13 requests / zero bytes, with five isolated source failures and a four-host IR circuit; it added no coverage. Two later materials outage attempts each stopped after ten requests / zero bytes (four and five attempted descriptors), adding no coverage; their IR cooldowns are retained. The publisher robots outage used three requests / zero bytes and did not recount its preceding archive checkpoint. Discovery/backfill traffic is not recurring production traffic.

## 25. Actions cost model

Current 5366-source registry plans **16629 polls/day / 498870 per 30-day month**, before excluded SEC/robots/retry/discovery requests. Six existing 160-request runs admit at most **960/day**. At the planning assumption of eight minutes/run, six runs/day consume **1440 Actions minutes/month**. Shared URLs reduce the one-request-per-due-route scenario to **16552 network requests/day / 496560 per month**. With the existing serial two-second global pacing, this scenario alone needs at least **16546.0 aggregate Actions minutes/month**, excluding HTTP latency, robots, retries and five-second same-host waits. The eight-minute figure is therefore the bounded workflow cost, not a full-coverage runtime forecast. At least 18 disjoint 160-request capacity lanes would be needed before overhead; at the stated runtime assumption their aggregate capacity scenario is 25920 minutes/month. Parallel lanes reduce elapsed time but do not erase aggregate billed minutes. Shared-URL demand, the serial pacing floor and disabled sources are covered by a meaningful cost test. Sharding or scheduler optimization remains a planning requirement before broad activation. No broad production activation or higher polling frequency occurs.

Disk-pressure prevention verified both milestone79a/80 compressed checkpoints against their exact SHA-256 restore proofs before removing only their older expanded copies. Compressed archives, successful exact restore/reprojection receipts, the live ledger and every required current baseline remain retained. This recovered 930,689,024 bytes without any live-state mutation, and avoids exhausting space during the next fresh restore acceptance.

## 26. R2 cost model and recovery

Sizing-only consumer projection: **5120 payloads / 5759 assets / 144264748 bytes**, maximum payload 209766 bytes. Conservative full-change monthly bounds: public PUT 1037340; public verification GET 2073960; private PUT 540; private restore GET 900; two public/two private slots retain approximately 0.350343 GB. User delivery reads are excluded; unchanged-object hashes reduce actual writes, not all source requests.

Latest local proof checkpoint: `28d6f8a4f66a4cb775b6b81337160dc88a1c6ae995f455a7ea787341a0573215`, 30906769 compressed bytes; exact six-table logical hash `87d7a89b4949abd1c11d416005a9fde053196fabe25678d165189275abe39c7b`, immutable generation `21cc611a43b06f488418b58a`. Fresh restore/reprojection passed. **Authenticated R2 acceptance is unavailable**: `VU_HISTORY_S3_ENDPOINT`, `VU_HISTORY_S3_BUCKET`, `VU_HISTORY_S3_ACCESS_KEY_ID` and `VU_HISTORY_S3_SECRET_ACCESS_KEY` credential bindings are absent. State remains in the existing ignored private ledger/checkpoints; databases/generated exports/secrets are not committed.

## 27. Estimated monthly operating cost

Data-provider cost: **$0** under the existing permitted metadata/free first-party strategy. Actions/R2 cash cost can be $0 only under applicable public-repository/free-quota assumptions and available remaining account allowance; no credentials/billing evidence confirms those allowances here. The measured request/runtime/read/write/storage assumptions above are the actionable model. CDN/user delivery bandwidth and live changed-issuer workload remain unmeasured; a broad-rollout bill is not claimed.

An actual managed-environment transition stopped the long-running processes at 03:36 UTC. The workspace, ignored SQLite ledger, HTTP cache and private checkpoints survived. The broader IR queue retained **147 classified / 122 successful / 754 pending** and completed-run accounting **11 batches / 1,355 requests / 85,193,541 bytes**; domain and publisher checkpoints also retained their run IDs. The resumed selection continues pending/due identities, with at most the incomplete bounded batch needing cache-assisted reattempt. No completed inventory is restarted, and the preserved remote milestone remained intact. The replacement environment reports enforced unrestricted HTTP policy and no configured secrets; authenticated R2 acceptance remains unavailable.

The first explicit resumed temporary-domain IR invocation omitted its lane selector and selected a broader cohort: nine fresh attempts / 73 requests / 1,586,595 bytes, five completed outcomes and 20 accepted news items. All source facts, outcomes and accounting remain durable; they are not reported as 223-cohort domain recoveries. A separate **one-domain recovered-temporary IR cohort** is explicitly frozen. The reusable runner now inherits the frozen domain cohort when a same-pass IR inventory is absent, while retaining any already-frozen IR checkpoint unchanged. A restore-backed test proves both behaviors. The accidentally broader IR pass is recorded as an operator scope incident and is not resumed.

The subsequent fresh-IR guard withholds an explicitly conflicting legal owner or CIK before any metadata API request, while retaining prior approved-domain facts. Its ROOT-like subsidiary test, all 19 targeted WordPress contracts and all 600 Python tests pass (48.538 seconds). The ServiceTitan context audit now verifies the unchanged call ID/date/UTC start and retained original publisher provenance after stronger GCS IR evidence superseded the earlier label.

At 09:00 UTC another execution-server disconnect stopped the running processes. Workspace files, ledger/checkpoints and remotely preserved code survived; ledger integrity passed. Fifteen publisher metadata records were staged; all 15 were subsequently ingested after resumption, with the staged metadata cleared. The retained replay proof passes. Completed run counters survive exactly, but the interrupted partial batch request/byte totals are unavailable and are not invented. An immediate private recovery checkpoint was packed and restored into a fresh directory with SHA-256 verification. Ledger integrity, all 15 staged metadata records and exact owner 366/92 and temporary 221/2 classified/pending queues passed, with zero network requests. The same frozen pending/due queues resumed. Network policy is enforced and unrestricted, with no configured authenticated R2 bindings.

The 10:28 execution interruption eventually stopped the discovery processes after 16 priority outcomes (13 successful, 20 pending). An immediate private checkpoint (24,814,336 bytes; SHA-256 `462b14a4c03fec1898bb39ca863cbfcfe8744f34bfb79fbf5bb62c8923dea019`) restored the exact ledger into a fresh directory with zero HTTP. This is an exact ledger proof; the final export/reprojection proof is reported separately. Same frozen cohorts resumed without repeating successful discovery. Retained per-candidate discovery counters are exact, but the interrupted child's partial ingestion/driver traffic is unavailable. All cumulative completed-batch traffic remains a lower bound for physical traffic; no missing total is invented. The next due temporary retry hit shared proxy signatures across fhnc.com, nytco.com and the two PrimeEnergy routes; its circuit opened after ten requests and retained its 15-minute due time while IR work continued independently.

Published [R2 Standard pricing](https://developers.cloudflare.com/r2/pricing/) checked on 2026-10-05 is $0.015/GB-month, $4.50/million Class A operations and $0.36/million Class B operations, with billable-unit rounding; Internet egress is free. Standard free allowances are 10 GB-month, one million Class A and ten million Class B operations per account/month. Under this report's conservative full-change scenario (**1,037,880 writes / 2,074,860 verification/restore reads / 0.350 GB retained**), CI-only R2 cost is approximately **$4.50/month with the entire free allowance unused**, or **$10.10/month with no allowance**, before user-delivery reads and other namespaces. Hash skipping can lower writes; account allowance availability and an actual bill remain unauthenticated. The repository is confirmed public and workflows use standard ubuntu-latest runners, so Actions compute uses GitHub's public-repository model; artifact storage and account-specific charges remain outside this measured scenario. Data providers cost $0. These cash scenarios do not solve the separately measured full-demand scheduler capacity gap; broad rollout remains disabled. The single pricing-document request is documentation research, not company-source discovery traffic.

A later execution-service interruption initially left the IR worker alive, then stopped its parent and child. Completed event and first-party news cohorts remained exact. The IR ledger retained **519 classified / 382 pending**, with **4174 per-candidate discovery requests**. An idle recovery pack (**26,369,031 bytes**, SHA-256 `7b3a1abd22b71bda9f2c692894aa87e34028b4b2f27af60fd6a669b3a02f2ec5`) restored the exact logical ledger into a fresh directory with zero HTTP; hash `c3a9fad20975c7af6904f9e36c6a480ed1af19a9fb819491b131811576ad8286`. The partial child's driver/ingestion traffic was not returned, so completed-driver totals remain a lower bound. No completed candidate outcomes or source facts were cleared. The coordinator resumes detached from the interactive tool session; frozen queues and per-candidate checkpoints remain the recovery authority. The final export/reprojection proof above is separate from this recovery ledger proof.

The independent prepared-profile addition is now imported through the normal CLI and included in the measured generation: 3,678 available profiles. Exact description and issuer/source URL/hash delivery passed for CTOR, NAT, GOOD, ARIS, ATEX, NICM, CETX and SII using 17 public assets / 274,500 bytes; three private-path probes were rejected. Earlier independently prepared-only reports retain their original timestamp scope.

The latest empty-event-cohort recovery contract fails on the previous producer and passes after a bounded metrics guard. It verifies a zero-request NO_DUE_SOURCES result, unchanged source health, exact private restore, preservation of the empty frozen cohort when a later source appears, and successful ingestion only under a new cohort identity. All 32 targeted event/driver/calendar/coverage-cost tests, 538 full Python tests and 39 Node tests pass. The formerly failing live CLI now returns zero requests, zero attempted sources and zero recovery deltas.

The preceding milestone72 random source/date audit caught a Business Wire prefix dateline being misread as an investor conference schedule. Adjacent wire labels now identify publication on either side of a date; a wire label elsewhere after a headline date no longer hides the explicit schedule. Three new behavioral tests prove dateline-only exclusion, a genuine later conference date, same-day schedule preservation and the nearby-label headline case; the prior producer fails the positive and exclusion contracts. All 547 Python / 39 Node tests pass, including 67 targeted announcement/ingestion/calendar contracts. A bounded zero-HTTP retained-ledger correction preserved exact original events and source health: 30 unproven historical conference schedules withdrawn, 3 historical financial-result dates corrected from explicit retained headlines across 27 issuers. News and materials remain retained; no upcoming confirmation or estimate changed. The corrected milestone72 export superseded its earlier uncorrected local snapshot; the corrected baseline remains preserved; the current incremental audit uses the later immutable milestone74 snapshot.

The subsequent recovery-evidence fix preserves alternate ownership-route evidence through budget exhaustion, candidate/issuer checkpoint persistence, fresh private restore and cooldown reuse. The earlier deferred persistence path saved reasons/counters but dropped collector route evidence; no missing historical details are invented. Failed attempts remain separate from validated ownership, and an existing validated owner cannot be downgraded. Two new restore-backed/budget contracts failed on the previous producer and pass after the fix. Current full validation is 549 Python / 39 Node tests.

[GitHub's current runner rates](https://docs.github.com/en/billing/reference/actions-runner-pricing) and [billing rules](https://docs.github.com/en/billing/concepts/product-billing/github-actions), checked 2026-10-05, price standard Linux x64 two-core paid usage at $0.006/minute, rounded per job; standard public-repository runners are free, and GitHub Free includes 2,000 private-repository minutes. Applying these rates to this checkpoint's full-demand capacity scenario (25,920 assumed aggregate minutes/month) gives approximately $143.52 Actions with the entire 2,000-minute quota unused, or $155.52 with no quota. Combined with the conservative CI-only R2 full-change bounds above, illustrative monthly totals are roughly $4.50 for standard public Actions plus unused R2 allowance, $148.02 for paid private Actions with unused Free quotas, or $165.62 with no quotas. The bounded six-run pilot's 1,440 assumed minutes would cost $8.64 before private-runner quota. These are planning scenarios, not measured billing or proven capacity; they exclude user delivery, artifact/cache storage overages, SEC/robots/retries/discovery and other account namespaces. Larger runners have separate paid rates. Provider cost remains $0; no source polling frequency or production gate changes.

A malformed bracketed URL in an HTML link previously raised before canonical validation and could abort valid IR navigation on the same page. The parser now skips only destinations whose URL join raises ValueError and continues canonical validation for all other links; invalid ports, embedded credentials and script destinations remain rejected. Two behavioral contracts fail on the prior producer and pass after the fix, including actual advertised IR and presentation recovery with the same page and platform-probe bounds. All 551 Python tests pass. The single historical Astrotech IPv6 error remains uncounted as recovered: no current proof page was cached and its existing source cooldown was not reset.

Three new timezone contracts cover explicit U.S. Eastern/Pacific wording with date-specific offsets, unknown-zone withholding and daylight-saving contradiction rejection. The previous parser fails the positive/contradiction cases; all 563 Python tests pass. A current retained-evidence census found six affected dated call records across two issuers. At the preceding milestone74 idle writer boundary, 6 records gained exact time/timezone/UTC start from their original publication/scheduling evidence; 5 logical calls remain after existing store grouping preserves duplicate-call provenance. Dates, source health, news, upcoming confirmations and estimates are unchanged; zero HTTP was used and the prior checkpoint is retained. These are time-quality gains, not new issuer coverage.

The prepared time correction also passed isolated operational rehearsals against the immutable preceding ledger: six records grouped into five logical calls, unchanged source health, refusal after completed application, and successful journal-backed resume after deliberately interrupting immediately after the first mutation. Exact original evidence and a deterministic audit timestamp survived; no live state changed during these rehearsals.

The preceding external-IR-scope/coverage milestone was remotely preserved at exact head `bfb00188a58a7b76fb61903a1000dfb6b027ca36` and tree `3c63d61d98d4782a73b0dc154541041fc91e6080`, with local/remote/PR head equality and a clean working tree verified before resuming discovery. Its private generation `1a68f54b19dd53a0a1007e61` passed exact restore/reprojection. The current milestone is preserved and verified separately after its own audit; no PR merge occurs.

The latest implementation passes 567 full Python tests and 27 archive contracts; existing Node checks and the current consumer/correction/timezone audits remain separately verified. The following exact coverage/configuration head is checked independently in CI.

The preserved explicit date-separated clock parser admits only a full-date grammar between AM/PM and a supported timezone, with date validation and no arbitrary clause/second-clock bridging. Three additional behavioral contracts retain dual U.S./Asian separation, Pacific winter/summer, DST abbreviations, invalid dates and unsupported/intervening clauses; five assertions fail on the old parser. All 570 full Python tests passed in 48.083s. The immutable zero-HTTP correction normalized only TIGR and EH clocks to 08:00 America/New_York / 12:00Z; dates, news, source health, aliases and all unaffected events remained unchanged. Current source ingestion and consumer audits measure later outcomes separately.

The independently verified bare/WWW root-form intake preserves original candidate rows and requires current corporate ownership evidence from both forms, matching destinations and retained hashes. It does not use DNS alias fallback, cross-domain rescue or arbitrary path/query equivalence. Partial failures retain their evidence and normal due times without accepting the first root. Eight additional behavioral contracts pass; old selection and old worker intake each fail the new checkpoint contract. All 578 full Python tests passed in 48.736s. The original zero-HTTP census identified 233 ambiguous root-form records without runtime officialSite proof. The approved-seed replay corrects that scope: 67 already have approved domain proof and 166 remain unverified. Frozen records are retained and reused seeds are never counted as recovered owners; bounded live gains are measured separately.

Coverage checkpoint 6cabee4761e8f3d6b72d9929a9aecbde9e41bb06 preserved two additional approved ownership seeds and three successful source descriptors, with exact local/remote/PR equality and a clean tree. Its private generation 99d4b82276685de75c1f7df6 passed exact restore/reprojection before subsequent discovery resumed. Its manual twelve-stock review passed; Smartbird historic Allbirds materials retain the same CIK, while Jet.AI supplies its actual investor deck without an inferred call.

The inventory driver immediately archives retained state after a failed bounded child, without inventing incomplete batch accounting. The first-child partial-fact restore and interruption-after-completed-batch restore each failed on the previous producer; seven runner contracts and all 579 Python tests pass (50.043s). Recovery implementation 4903a961e3105ce8b76e6af92dcb0ce35b2f6918 was remotely preserved with exact local/remote/PR head equality and a clean tree while discovery continued. Current coverage is measured separately.

The copyright attribution parser retains original footer spelling and exact owner boundaries, recognizes one initial attribution token and preserves legal names beginning with By. All 581 Python tests pass (48.712s), including 31 ownership-route contracts; three prior-producer positive assertions failed. Parser head b18847b670136c724625d2f9fc9aeb2cf30f506c was remotely preserved with exact tree/head equality before a targeted second review. The zero-HTTP 88-conflict shadow found one newly supported HEICO route and retained 87 without safe gains. Only that unchanged-hash evidence is journaled for a scoped due recheck; the original conflict remains until both advertised roots independently prove ownership. Source/ownership cooldowns for unrelated conflicts are not reset.

After all 233 alias-domain candidates and all 43 recovered-owner IR candidates had durable outcomes, the 27-member due-budget cohort also reached zero pending. The next frozen shared-proxy cohort contains 95 candidates and remains pending at this preservation boundary. A local orchestration downstream ID exceeded the existing 48-character bound; validation rejected it before any proxy HTTP request. The ID was shortened without changing the frozen domain queue. An immediate idle archive (31671674 bytes, SHA-256 8279bc49e198312bd419acffcba23e8afc2b655b0599605043291bd7aba49dcf) preserved every completed fact before audit. The normal shorter-ID continuation resumes that queue after remote preservation; no company was marked invalid for this operator error.

Current implementation validation: 629 full Company Intelligence Python tests passed in 49.573 seconds, including 13 SEC annual-candidate/parser/resumability tests and the four ownership-notice regressions. The new observed declaration cases fail against the preserved first-pass parser (one failed assertion and two positive subcase errors), while the third-party negative case remains excluded. The grammar extension discovers candidates for explicit internet-website, maintained-website and company/corporation reporting clauses; it grants no ownership authority. The six filing bodies used for the bounded gap census had unchanged original hashes and were not persisted. Their targeted parser second pass follows this audited checkpoint; no unperformed recovery is counted here.

Current checkpoint validation: **632 Python tests passed in 49.629 seconds**, seven configuration/cost checks passed, and both newly observed quality failures reproduce on preserved head 59d8c2d. The corrected 12-stock new-content sample and two additional WordPress identities passed manual metadata review plus actual storage/API/browser checks. The unrelated frozen composite-event cohort remains explicitly pending source review.

The observed Greif announcement separately states November 3, 2026 financial-results release and November 4 conference call. Truncated feed evidence for the company's quarter-result release now stays a release record. A composite headline alone cannot turn an unsupported body date into a call: the explicit call-date safeguard examines the body, retaining supported call-only evidence. Both new regressions fail on the preceding producer; 71 targeted tests and all 642 Python tests pass (49.148 seconds). The separately checkpointed 59-event exact-source review remains queued; no review recovery is inferred from these tests. Exact remote head 1fe8eee4ebd82becc5491e1e26ffbc0ddde31a66 passed nine workflows; Discover Frontend failed its Chromium platform-home navigation lookup after 30 seconds (200/201), while WebKit passed 37/37. No unrelated frontend, Quant code or thresholds were changed.

An unchanged-hash Eagle Financial Services annual-source review exposed a 240-character candidate window cutting http://www.sec.gov into https://www.s/. A complete-token boundary guard now rejects chopped URLs rather than producing another hostname. Both SEC and company-host truncation cases fail against the preceding parser; a complete address at the same boundary remains accepted, and links beyond the evidence budget remain excluded. All 15 SEC candidate/runner tests and all 644 Python tests pass (49.778 seconds). A bounded exact-source replay produces the bogus route on the old parser and none on the corrected parser with zero new HTTP. The queued scoped route correction preserves the original outcome/proof and leaves official ownership unchanged. A separate read-only probe confirms PLDT's 23,798,286-byte primary filing exceeds the existing 16 MiB source limit; its body was discarded and the limit remains unchanged.

## 28. Tests

Latest preserved implementation validation: **603 Python tests pass**, plus seven targeted configuration/cost checks after source promotion. The unchanged Node consumer/storage/integration surface passed 39 tests; no JavaScript changed in the subsequent milestones. The Q4 milestone `8fd0aea5e9a515a6083e657ab1c387f8d5f1452d` passed seven repository workflows but failed the Company Intelligence configuration test: three materials descriptors duplicated existing event routes. The three redundant bootstrap descriptors were removed, retaining event sources and stored material references; future promotion rejects a previously configured issuer/URL route. The full suite and targeted post-promotion configuration checks pass. All eight workflows on correction milestone `5e12deda3b1592b92edb5e64c6e00304cd9fb108` passed. This was a configuration regression, not a pre-existing main failure. Materials/Q4/retention tests cover public structured presentation contracts, credential/private link rejection, discarded bodies and grouping dates, child source health, rediscovery retention, and one-hub bounds despite existing annual reports, correct issuer/host proof, undated/CDN reference handling, prior-material preservation on empty responses, accumulated source health, pending-issuer resumption, CLI seed overrides and four-host circuit cooldown. New meaningful tests cover infrastructure circuit admission/resume, exact-CIK aliases, unsafe ownership/redirects, legal/title/footer evidence, partial discovery/cache restore, publisher cooldown accumulation, self-navigation rejection, composite release/call dates and source-only estimate reconciliation (including interrupted accepted batches). The shared circuit now also guards follow-up polling after successful IR discovery; a CLI-path test proves it checkpoints the new circuit and leaves unsent sources untouched. Isolated failures/access denials remain independent. All eight workflows on preceding milestone `0cbdf52d7929d65a75b65bc5c58c78eecdc15a83` passed. All eight workflows on coverage milestone `6a1d9b94eb5a04f388915e5c456f5ed637470e75` and ownership/coverage milestone `13fde9ba1ad7fd89dd7b588a10c7d0291035d5fa` passed. All eight workflows on the next coverage milestone `e905f8d0ecc8e38b1d800c6baf2d44716dd246ec` also passed. All eight workflows on coverage milestone `78a29806c5831381f8ebe543fa05c334f4d22912` and copyright-recovery milestone `b5da682b5d02f02b9a9878875522c8dfcfb1adcf` passed. On recovery milestone `51e37799656c7acce798616d1596507f34f7bf37`, seven workflows passed; Quant Production Pages was canceled before jobs were created, with no reported test failure. It uses a repository-wide pages-production concurrency group; cancellation is not misrepresented as passing. On HTML-materials milestone `0b34ec5fec8b07b63e82637741c00dece6e444df`, seven workflows passed and Quant Production Pages was canceled; no test failure was reported. The publisher archive CLI now marks whether its visible durable checkpoint belongs to the current attempt; cooldowns and pre-index robots failures retain prior progress without counting an old batch again. Full parser tests and publisher failure/cooldown/success assertions pass. All eight workflows on allowance milestone `543d355400c5911ec6684f23235ddd78ad4a9f93` passed. On checkpoint/type milestone `f893985d26c42c0703d21a39375657310c96597c`, seven workflows passed and Quant Production Pages was canceled with no reported test failure. All eight workflows on DNS-alias milestone `cee4bb335d734ae5a9a45e610a93843d66b41fa9` passed. A compound-label regression test also proves explicit transcript/remarks classifications outrank presentation wording, corrected URLs replace preceding types, and unrelated archived materials remain intact. Three preceding consumer audits and exact fresh checkpoint/reprojection passed. An additional strict 12-stock audit (TGB/WT/LCTX/CSV/GE/CPF/GS/MESO/ALLY/WRB/RTO/MOD) required acquired news, calls or non-filing company materials and passed: 25 assets / 337,892 bytes, maximum 101,422 bytes. A separate filing-only cohort passed delivery but is explicitly excluded from evidence of new intelligence. Seven workflows passed on coverage milestone `85619e54a1b921bb8fee4fd993f8dfc0b77971a4` and report-type milestone `61556f0d3159188186244e16e1e610b27a4f5abf`; Quant Production Pages was canceled without a reported test failure on both. All eight workflows passed on temporary-DNS milestone `8548f83e9b5e2f1aae0744775b35941a6564d9d6`. All eight workflows passed on inventory milestone `814c17f18189471085be9416fb31b3082529d3fc`. All eight workflows passed on milestones `2cc43177e81670db0c59c5ad91fc9e680179f82d` and `909f2738207fcd590eec94a445d39b2a98089895`. The eight-stock GCS consumer audit (IEP, MXCT, ATEX, CAPL, AXSM, PYPD, MEDP, NBP) passed with actual stored metadata and references, plus private-path rejection. Credential-dependent authenticated pilot/R2 acceptance remains unavailable, not represented as passing.

All ten workflows on the strict integration checkpoint `086fed6749174fc7fda0c2b3e3dd8cfe7c1f9cdc` passed, including Discover, Quant and Company Intelligence. The preceding StockPR commit exposed a CI integration-scope failure after main strengthened its two-parent check; the first compatibility commit conflicted with concurrent main. These were our own integration/workflow issues, not Quant failures. The subsequent strict step approves only the original additive stock mount and four fixed Company Intelligence assets; all unrelated protected paths and removed/changed Quant logic remain rejected. The actual three-way workflow composition was verified to retain current main's corrected check without conflict; no main merge or Quant implementation changes were needed. Source-runner checkpoint `4dda8eb84fec73f3bc7d9aeb28b0e480a00d005e` passed 403 Python tests before the later distinct-news-issuer accounting test; all ten reported GitHub workflows passed.

All ten reported workflows also passed on audited coverage checkpoint `8aae9cd5693caa2f01549f3f31ea0d808160398d`, including Company Intelligence, Discover, Quant CI and Quant Browser QA. All 408 Python tests passed after its seed/source promotion; the subsequent navigation, event-detail and restored terminal-run regression tests bring current validation to 411. All ten reported workflows passed on milestone `075c1f05485e714a6994e8a2d8500cc8ab2b011e`; the next preserved milestone will be checked separately.

The preceding combined implementation passed all **537 Python tests and 39 Node tests**, including seven final configuration/cost checks. Current configuration audit, exact restored generation and actual consumer delivery proof are reported separately.

The first Company Intelligence validation checkout timed out before tests started after a 20-minute GitHub fetch stall. One unchanged retry of that cancelled job passed; no tests or time thresholds were weakened. All ten workflows passed on the preceding Q4 template checkpoint `9dc8e701cb0dc4e06a1796a52bd794fd70faf7c9` and the verified-news-source checkpoint `ad56547106c9f0f3f73f8e29050a3e91fb382b1e`. The latter passed 441 Python tests, 22 targeted backfill/runner/circuit tests and six configuration/cost tests. A dry integration check against later main `9c4dd6ba3ef73d62ba191b33233f21f712add1a5` was conflict-free, using actual merge base `3a13a31dd41efd65ce34f3b975030d3f715f7d51`; no branch merge occurred. Latest private restore and consumer proofs must match the final export generation.

All ten workflows passed on preserved coverage head 68e6390d7662d426427b97de742acb4433343a4f and the later combined 3,684-profile head 3c8b2fbb1438ed06dd7bdf9131b3ff984f851fa1. The next preserved checkpoint will be checked independently.

The event-recovery checkpoint `8f380d5a43a1048c9acd4f55304ba76cd1bf6834` passed Company Intelligence, Currency, SEC, Quant and Discover correctness workflows. Discover Frontend initially passed 36/37 checks but its 390-dark WebKit first-screen measurement was 6,944 ms versus the 5,000 ms limit; one unchanged-job retry passed. Core's first checkout was cancelled after a 15-minute Git fetch stall before tests began; one unchanged-job retry passed. All ten workflows passed on the preserved event-recovery head. No UI thresholds or unrelated Quant code changed.

All ten GitHub workflows passed on preserved selective-budget recovery head `615bcf70b70f742afa913e26cc2e1e2bd3b5c81d`. The next remotely preserved source-coverage checkpoint will be verified independently.

All ten workflows also passed on the exact preserved audited coverage head `9cf77147bfd6d7a316bffd79dfb654adb7b6687f`. The new source/configuration checkpoint is checked independently.

All ten workflows passed on the latest preserved audited source-coverage head `b22d9319e907acb71136c642f871ff1f984c6e5f`, without retries. The new checkpoint is checked independently.

All ten workflows passed without retries on preserved audited coverage head `d29454b3db5734256bfe4a0ddc33a77da33e0bf9`. The new checkpoint is checked independently.

All ten workflows passed without retries on the exact preserved source-coverage head `3a2ef51ab6012fe1e360da2884864e468e430204`. The next checkpoint is checked independently.

All ten workflows passed without retries on exact preserved navigation/coverage head `be8d097f43f84a509639373629c3987a7c585945`. The new checkpoint is checked independently.

On preserved head `39067bc77841820e819033888fae779e4b118bb6`, eight unrelated hosted jobs initially cancelled before any recorded steps; the validation log blob was absent (404). One unchanged retry passed seven workflows overall, including Company Intelligence and Quant Browser QA; three jobs again cancelled before steps and entered a fifteen-minute retry cooldown. These are hosted-runner interruptions rather than test assertion failures. Final exact-head outcomes are checked independently and no unrelated Quant implementation is modified.

On preserved milestone72 head 49638f1db35e62c8f532ec8ec52a0606d9486091, Discover Frontend initially passed all 201 Chromium checks and 36/37 WebKit checks; the 390-dark first-screen heuristic measured 5,316 ms against the unchanged 5,000 ms limit. One unchanged-job retry also passed all 201 Chromium and 36/37 WebKit checks but failed the same heuristic at 5,919 ms. Nine workflows pass; Discover timing remains unresolved on this exact head. No browser threshold, unrelated frontend or Quant code changed; later heads are checked independently.

Recovery-evidence milestone b7bcae2a425afc2ead788cad9e9f16bb8b2a9ff6 was preserved with exact local/remote HEAD and a clean tree while detached discovery continued. Its 549 Python tests and restore/cooldown/budget contracts passed. Discover Frontend again passed all 201 Chromium and 36/37 WebKit checks but failed the same first-screen timing heuristic at 5,204 ms. No retry or unrelated-code change was made on this head. Nine workflows passed; the timing issue remains explicit.

A read-only Git merge-tree integration check passed without conflicts for preserved head `59d8c2d527c58e3f129cf95abe7bc237664a76fb` against fetched main `f28d7e05fdc0f782815ee738496f077000c77278`. It created only an unattached tree object and applied no merge or branch change. This is an integration check of those exact heads, not a claim that all CI is green or approval to merge PR #356.

All ten workflows passed without retries on preserved coverage/parser head 49197b5eadd6f68f052111d36757fafeabb57ee6, including Discover Frontend and Company Intelligence. This resolves the timing blocker for that exact head; the previously failed 72/73a heads retain their actual results. The subsequent source/configuration checkpoint is validated independently. PR #356 remains draft and unmerged.

Preserved milestone74 f169f1cb923eb46aeaab47b1e3a6f2da67dde9ce reported a Discover Frontend WebKit entry-heuristic failure at 5,111 ms versus the unchanged 5,000-ms limit. Chromium passed and the other WebKit checks passed. No unchanged retry or unrelated UI/Quant adjustment was made. The preceding milestone73 passed all ten workflows without retries; each exact head keeps its own result.

All ten workflows passed without retries on the preceding preserved external-IR-scope/coverage head 9ced678ffdcda1bbd84465c8ff23d51b710138a4, including Company Intelligence, SEC, Discover, Quant, Currency and browser checks. The next selective IR-recovery milestone is validated independently.

All ten workflows passed without retries on the separately preserved selective IR-capacity head c9e8c6202aaa089cfc912113054d6a1043b0223d. The following coverage/configuration milestone awaits its own exact-head CI and is not credited with that result.

All ten workflows passed without retries on coverage/configuration checkpoint bfb00188a58a7b76fb61903a1000dfb6b027ca36. All ten workflows also passed without retries on exact relative-path parser checkpoint e250cb7df98169dca820009d4f3520b9b3d57b71. The following monthly coverage checkpoint retains its own exact-head CI result.

Coverage checkpoint 926f6a05b8b94b206f2373455be264d6655796c7 completed all ten workflows: nine passed, including Company Intelligence, and Discover Frontend reported one WebKit entry timing of 5,133 ms against the unchanged 5,000-ms threshold. No unchanged retry was made. All other frontend checks passed. The same code had passed all ten on the preceding parser checkpoint; the new source-path transport change is validated independently. Unrelated Discover/Quant code remains unchanged.

All ten workflows passed without retries on separately preserved Unicode-path transport head 6e518e364912c803e75137dcb296a624423eb65b. The preceding coverage head retains its documented single WebKit timing failure. The following coverage/configuration checkpoint is validated independently.

All ten workflows passed without retries on preserved ledger/coverage checkpoint 41a3f9ac61e2f32d73cd7fc3dc9c9119f0474ad3, including Company Intelligence, SEC, Quant, Discover and browser checks. The following configuration/coverage checkpoint is checked independently.

The preceding coverage head 116d0f76b068bac2d08b33824d654feea2a13bd9 passed nine workflows without retries. Its Company Intelligence parser/resolver validation step passed, then the existing-product regression step was cancelled. Its cancellation reason is not established by the job metadata. No failed test assertion is inferred from that cancellation, and it is not reported as ten workflows passed. The current head is checked independently.

All ten workflows passed without retries on exact date-separated-clock parser head 381a2a20ff66a4baa2247b5940ab422fee862dd3, including Company Intelligence, SEC, Quant, Discover and browser checks. The following coverage/configuration head receives its own exact-head CI result.

All ten workflows passed without retries on independently verified root-alias intake head 853f83ce286d394f1061866673a40e3cc79a234b, including Company Intelligence, SEC, Quant, Discover and browser checks. The subsequent live coverage/configuration checkpoint validates independently.

Coverage head 6cabee4761e8f3d6b72d9929a9aecbde9e41bb06 completed nine workflows successfully. Company Intelligence was canceled during existing-product regressions after its parser/resolver step passed; the cancellation cause is not established and no unchanged retry was made. The following recovery implementation is validated independently.

All ten workflows passed without retries on interrupted-child recovery implementation 4903a961e3105ce8b76e6af92dcb0ce35b2f6918, including Company Intelligence, SEC, Quant, Discover and browser checks. Its 579 local Python tests and first-failure/partial-fact restore contracts passed. Subsequent source/configuration gains are audited independently.

All ten workflows passed without retries on copyright-attribution parser head b18847b670136c724625d2f9fc9aeb2cf30f506c, including Company Intelligence, SEC, Quant, Discover and browser checks. Its 581 local Python tests and 31 ownership-route contracts passed. Following source/configuration coverage gains are validated independently.

All ten workflows passed without retries on exact corrected coverage/quality head fc2edce2083fb94a49e6167d10fe4a9d8f5247cd, including Company Intelligence, SEC, Quant, Discover and browser checks. The validated corrected private generation 592a3ce8fba281973a49c8fd is the baseline for the following bounded expansion; the earlier raw generation is excluded. The following configuration/documentation head receives its own exact-head CI check.

All ten workflows passed without retries on exact restored coverage head d76b7c6de0ebc11cd737988f7c6e2fbc0a660af9, including Company Intelligence, SEC, Quant, Discover and browser gates. It preserved 32 additional strong ownership seeds and 49 successful source descriptors, with exact generation 0deb9618766f9967ff3a1f35 restore/reprojection and 25 newly useful stock outputs passing a 12-stock actual delivery/manual sample. The following head receives its own CI check.

All ten workflows passed without retries on exact preserved head e80b8b0bedb41dee6cbbbc9c6ab25f8ed4dec90c, with all 603 local Python contracts, exact corrected generation 2b79a295b2f50e71da38a9ba restore/reprojection and the twelve-stock quality/delivery audit. PR #356 remains open and unmerged; the next coverage checkpoint receives its own exact-head validation.

All ten workflows passed without retries on exact preserved WordPress issuer-scope/collection head a64582e346aa305db037e0e1b1c02a2dffb7765a. All 609 Python and 25 targeted WordPress contracts, exact generation 76a78c65419e9d0ac00b2e0b restore/reprojection and the three-stock manual/delivery review passed. The next bounded expansion is checked independently.

All ten workflows passed without retries on exact preserved collection/instructional-scope head 5f3ce9a48a850e2430ca160735773b2e979f08e3, including Company Intelligence, SEC, Quant, Discover and browser gates. It preserved 18 successful first-party news descriptors and corrected exactly one instructional item, with 612 Python / 28 targeted WordPress / seven configuration-cost tests, corrected generation ad1e580079c82c7e21620766 exact restore/reprojection and both 12-stock manual/delivery samples passing. The following coverage head receives its own exact-head CI check.

Exact preserved coverage head 5a3ca18d3099df1f916e922e409aa01cb4a33436 passed nine of ten workflows. Discover frontend failed first on a Chromium platform-home navigation locator timeout (200/201 checks; WebKit 37/37), then one failed-job retry passed Chromium but missed the unchanged WebKit five-second entry heuristic at 5.557 seconds (36/37). No frontend code, Quant code or thresholds were changed. This is recorded separately from historical pre-existing main failures; the next meaningful header-evidence checkpoint receives its own exact-head CI checks. Read-only integration against actual main a41c85cbf4c7727ed76feb8784ed67e4c96de44d produced conflict-free unattached tree 4622f8f19ba60fde0abc25c16a12e691bff4dbbc using confirmed merge base 3a13a31dd41efd65ce34f3b975030d3f715f7d51; no merge occurred.

## 29. Regressions / pre-existing main failures

Concurrent main updates exposed one inherited generated-data conflict after milestone `facd922d8f0b173970c862a86caa2013100c8298`. The branch had retained a stale September FX debt-register snapshot. Its generated-artifact change is withdrawn to the actual merge-base version, making this PR contribute zero change to that unrelated register; a three-way dry run then retains current main’s generated data. No Quant logic is modified, and the original additive stock hooks remain. This is a mergeability correction, not a failing Quant test. The first correction then exposed the generated register’s two Discover source-line references: the original stock hooks added three lines before those references. Preserving the same mount/dispose statements on existing lines removes that offset; the actual merged source is checked against every current-main debt-register entry. The Currency gate remains unchanged, and no Quant logic or generated main data is rewritten. The previous milestone did not start CI while its merge conflict existed; its 411 local Python tests and consumer/restore proofs remain valid. All ten workflows subsequently passed on corrected integration checkpoint `2ad0e2dd912f0aa41b584fd5e304f0ad6e1e339a`, including Currency, Quant, Discover and Company Intelligence. The following native-PDF/materials-redirect checkpoint `b6a2e3a29bde157314e6c286752684ea75c401e1` also passed all ten workflows. Discover Frontend Quality Gates initially reported its WebKit first-screen timing at 5,005 ms versus a 5,000 ms limit while its other 36 checks passed; one unchanged-job retry passed. No threshold or unrelated UI code was changed. All ten workflows also passed on the source-expansion/presentation-quality checkpoint `5bd7afdd1617b7a9c35fa4da07396d6ed77c2618`, with 414 local Python tests and 37 Node tests passing.

Company Master, SEC, Quant, Discover, Supertrader, Screener, Markets, calendar estimator, R2/storage and consumer integration architecture remain intact. No unrelated Quant logic/test assertions were altered. Historical two Quant failures are preserved in the preceding report; current main/PR workflow runs passed, so historical failures are not presented as current. Consumer cohort controls and production gates remain unchanged.

An additional zero-HTTP shadow review targeted the retained Astrotech malformed-IPv6 and Yibo InvalidURL failures after the parser improvement. Neither official root remains in the bounded cache, so no offline source, IR page or coverage recovery is claimed. Their original live retry times remain intact. A broader cached delegated-IR census found no other observed non-navigation external links of the repaired form; missing retained root bodies remain inconclusive, not positive ownership evidence.

## 30. Remaining unresolved candidates

**0 frozen main-pass identities remain pending**, plus due recoverable cases in the exact funnel/pass tables. Missing preceding 35 inventory identities and unavailable private historical rows are explicit gaps. Temporary DNS/Envoy/proxy/site failures keep retry evidence and due times; unsafe parent/subsidiary/brand/conflicting-owner cases stay unproven rather than automatically resolved. No free-source ceiling is claimed prematurely.

A cache-only review of 57 existing HTML material hubs found one additional issuer with an explicit Investor Deck label missed by the current parser. No live parser, ownership outcome or coverage metric changed; that isolated label extension remains uncounted and lower leverage than the remaining IR inventory. The recent empty-material-hub cluster spans known WordPress, GCS, Q4, STOCKPR, Investis and generic families rather than a newly dominant unsupported vendor. Two bounded material batches were allowed to finish before effort returned to pending IR; three new presentation issuers were recovered. Source health and due times remain authoritative.

A zero-HTTP review checked whether cached primary SEC annual filings could establish safe alternate domain routes for unresolved ownership. This workspace retains sourced profile provenance but has no cached annual filing bodies available to extract those declarations. No domain was inferred from a business-description summary, no ownership rule was relaxed, and no additional SEC document crawl was started.

A broader full-universe review corrected the earlier runtime-only root census: 769 originally configured, verified seed issuers outside the 901-issuer new-root cohort have no retained successful or failed IR attempt. Existing source descriptors provide 611 verified owned routes across 241 of these issuers (238 with successful ingestion), dominated by Q4/GCS/STOCKPR. The prior census excluded configured seeds and therefore missed this separate recovery cohort. Its deterministic company/CIK/seed-route inventory is being processed through bounded existing-adapter discovery; batch checkpoints and a twelve-completed-batch remote-audit boundary preserve the continuation; no domain count or downstream recovery is inferred merely from finding the gap. These are existing trusted inputs, and no Company Master or ownership rule is changed.

A zero-HTTP structural review of 100 cached corporate pages found 1 issuer with an explicit investor URL in an AEM navigation-component JSON attribute. The exact advertised route is retained privately; this small cluster is recorded below the substantially larger existing-adapter seed backlog and budget-retry population. No speculative script-string extraction or niche adapter is included in the current producer.

A zero-HTTP review of the recovered workspace found no protected annual-document SEC cache at the existing profile-cache location. Retained profile/CIK metadata and hashes alone do not establish a newly mined official website claim. No domain verification is weakened or counted from that unavailable evidence. A future authenticated/cached annual-document review could test explicit issuer website claims, with current owner/redirect safeguards; the present accessible monthly metadata queue remains higher leverage.

A zero-network review of all 5412 retained SEC identity-state rows found no authenticated entity-name or website fields: these records retain projection counts, availability and timestamps. They do not supply safe new ownership aliases. Existing SEC identities/financial summaries and all unresolved ownership outcomes remain unchanged. Stronger SEC website/filing-link evidence remains a real opportunity when authenticated or freshly collected official evidence is available.

## 31. True remaining high-leverage opportunities

The original 4,248-candidate inventory is fully classified. New publisher-discovered candidates and remaining older-ownership/temporary retry queues retain separate frozen checkpoints. Revisit due failures in completed second cohorts and finish pending newer cohorts; retry due targeted third cases; convert every new verified root through existing high-issuer Q4/GCS/native platform discovery; continue permitted monthly metadata while incremental coverage remains material; recover untouched retained first-party source descriptors after infrastructure recovery. Before broad activation, implement/validate scheduler capacity for expanded source demand and authenticate private expanded-ledger preservation/restore. Maintain four-hour active news, approximately 12-hour events/calls, 12–24-hour materials and slow discovery/revalidation/blocked retries.

## 32. Readiness (in progress)

CANDIDATE-INVENTORY-SUBSTANTIALLY-COMPLETED: YES (original inventory classified; current unchecked: 0)

DOMAIN-COVERAGE-BREAKTHROUGH: YES (769 → 2546; downstream cohort measured)

NEWS-COVERAGE-BREAKTHROUGH: YES (current measured coverage exceeds the historical total; actual new-domain issuer cohort is reported independently)

CALLS-MATERIALS-BREAKTHROUGH: YES (current calls/webcasts/presentations/management coverage and actual new-domain cohorts have materially expanded; exact lost historical union is unavailable)

CODE-MERGE-READY: NO (this coverage checkpoint awaits its own exact-head CI; preceding preserved heads retain their separately reported results)

PILOT-READY: NO (authenticated expanded-state acceptance unavailable)

BROAD-ROLLOUT-READY: NO (recoverable downstream cohorts, capacity, authenticated preservation and live acceptance remain)

This is an interim checkpoint report. Discovery continues; PR #356 is open/draft/unmerged. Final local/remote HEAD verification and clean working tree will be recorded after the final validated milestone.

---

# Historical reports — preceding private ledger (not current restored totals)

## Independent profile recovery — 2026-10-05T17:21:53Z

The prepared profile catalogue increases **3,670 → 3,678 (60.51% of the unchanged 6,078-issuer universe)**. Eight issuer-owned web descriptions were source-reviewed and added for **CTOR, NAT, GOOD, ARIS, ATEX, NICM, CETX and SII**. All preceding profiles and exact-hash withdrawals remain identical. These are additive prepared catalogue facts; this workspace has not imported them into the absent operational ledger or published a new consumer generation.

A bounded review classified **80 currently missing profiles with committed verified websites**, across three completed batches and one retained time-budget boundary: **211 HTTP requests / 18,284,527 returned decoded bytes**. Thirteen parser proposals were reviewed; five with retained promotional or positioning statements were withheld without changing the shared parser or ownership rules. Sixty-six sources supplied no eligible explicit description and one retained a robots/403 failure. The other **531 seeded missing-profile cases remain unreviewed in this independent lane**; the 80–90% target remains unmet. Private attempts and corporate-page cache remain outside Git; no SEC filings were downloaded and no discovery/source queue was recreated.

Zero-HTTP acceptance checked every new exact source URL/body hash and reproduced all eight accepted descriptions. All 3,678 public contracts pass, and an isolated profile-only import accepts the complete catalogue with zero news, event or source rows. The existing 59 profile tests pass. This is a prepared-profile audit, separate from the operational restore/browser audit below.

Before preservation, concurrent audited head `d29454b3db5724256bfe4a0ddc33a77da33e0bf9` was incorporated: its 17:09:03 UTC operational snapshot reports **2,433 domains / 1,464 IR pages / 1,845 recent-news issuers / 644 calls / 612 webcasts / 1,232 presentations / 114 confirmed upcoming earnings**, with **741 / 901 broad-IR roots classified and 160 pending**. Its 180-source event cohort was already attempted in seven batches. These remain inherited operational measurements, not a local ledger recount or a newly executed backfill. The exact private checkpoint (27,102,249 bytes, SHA-256 `74507f671362bbd6d5ad816042f6cac70c7cf0a10edccd5fe8884d56ebb94476`) and SEC document cache are absent from this workspace; original IR/news/GlobeNewswire continuation is blocked here until that state is supplied. PR #356 remains draft and unmerged; production gates and polling cadence remain unchanged.

---

# Company Intelligence — profile and conversion continuation final report

Report date: 2026-10-05. Repository: `dennismueller10x-sudo/vision-universe-research`; branch: `feature/company-intelligence-rollout`; [PR #356](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/356), open and unmerged.

## 1. Executive result

**3,670 sourced company profiles (60.38% of 6,078 issuers)** are prepared, stored and exposed through the existing consumer projection and Discover/Quant stock component. All 5,412 SEC identities received an initial bounded attempt. Multiple network cohorts, cache-only recovery rounds and quality withdrawals were completed and preserved in successive Git milestones. This is substantial new coverage, but the requested 80–90% profile target is **not achieved**.

This work also adds Q4 materials classification and short-form quarterly-results confirmation fixes. Concurrent remotely preserved source conversion was fetched and incorporated without overwriting source/configuration progress. Its latest reported coverage improves news, IR, calls, webcasts, presentations and management content. These source-ledger gains are attributed to the remote conversion snapshots, not invented as local discoveries.

**Exact state boundary:** initial remote/PR head was `9dc8e701cb0dc4e06a1796a52bd794fd70faf7c9`. The latest incorporated conversion head is `7cc56daca1b425ba3c203e30125ee25b7e4cda99`, with coverage measured at **2026-10-05T12:47:20Z**. Its private checkpoint is SHA-256 `20a266218ad2a824907930d166ce55eaba21bd674d5fbb161f1947c91a0bcd5a`, **26,682,889 bytes**, logical hash `c76b9060289e4726f8ca793a3be6011f462b282a9949ed3f92ada79bc6cc4bdf`, generation `4d90abcc634c03d8055aa4f5`. That expanded ledger/cache/queue checkpoint is unavailable in this workspace; no private R2 credentials are configured. **No replacement rollout ledger or discovery queue was initialized.** A checkpoint location was requested but not received. Original IR/GlobeNewswire continuation cannot truthfully be claimed locally. The additive profile lane resumes its own per-issuer checkpoints and stores successful factual profiles in Git.

## 2. Company profile

The reusable `company-profile-1.0.0` contract contains issuer name, concise description, primary activity, explicit activities/products/markets, optional segments, official website, source provenance/hash/filing identity, confidence and verification time. No employee count is added. Empty fact arrays remain empty when evidence cannot support extraction.

SEC Business/Item 1 and foreign annual-report overview extraction reuse the existing SEC client and immutable compressed filing cache. First-party extraction is restricted to proven issuer roots and advertised About/overview routes. Deterministic rewriting removes ranks, promotional clauses and first-person wording; no paid provider, model, live translation or page-time generation is introduced. A profile can be one concise sentence when that is the only explicit safe evidence, rather than padding it with assumptions.

Profiles persist once per canonical issuer. Filing-driven updates join existing SEC change processing; first-party reviews are quarterly. Failed/new filing retrieval preserves previous facts and displays appropriate staleness. The catalogue lane uses one-writer locking, atomic per-issuer checkpoint writes, bounded budgets, cooldowns and a three-failure circuit. The production backfill refuses to initialize a missing discovery ledger.

## 3. Company profile coverage

| Metric | Exact prepared catalogue |
|---|---:|
| Supported issuers | 6,078 |
| SEC identities attempted | 5,412 / 5,412 |
| Available | 3,670 (60.38%) |
| From SEC | 3,659 (60.20%) |
| From first-party web | 11 (0.18%) |
| Combined SEC + web | 0 |
| Unavailable | 2,408 (39.62%) |
| Ambiguous profile attempt state | 0 |
| Stale | 7 |
| HIGH confidence | 3,659 |
| MEDIUM confidence | 11 |
| Source-hash-scoped quality withdrawals | 91 |

Confidence describes source/identity strength, **not completeness or statistical accuracy**. Unknown ownership and multiple-registrant first-person prose are excluded; zero AMBIGUOUS profile states does not mean all underlying ownership cases are resolved. 67.61% of SEC identities yield accepted descriptions. On current main's 6,073-issuer universe, 3,668 profiles are supported; two historically supported CIDs remain in the branch catalogue but are excluded by main's issuer intersection. The Master universe was not changed.

## 4. Company profile sources

3,659 profiles cite exact-CIK 10-K/20-F/40-F annual documents; 11 cite verified first-party pages; no low-quality third-party descriptions are imported. Annual documents are cached once and reprocessed locally. A separate 96-issuer missing-profile web fallback used 236 requests / 24,054,093 decoded bytes. Thirteen initial candidates were reviewed; two marketing-dominated candidates were rejected, leaving eleven sourced profiles. Web verification does not infer business facts from a ticker, sector, or domain alone.

First-party examples include MDU's regulated energy-delivery business, Scully Royalty's Royalty/Industrial/Merchant Banking segments, Worthington's building/consumer/energy products, and CVD's chemical-vapor-deposition and thermal-process equipment. Fifth Third's indirect bank-parent relationship is preserved; it is a deliberately partial holding-company description.

## 5. Company profile quality audit

All **3,670 public profiles and their cached source hashes** were checked with **zero HTTP audit requests and zero hash/contract errors**. A deterministic seed-356 manual/source sample covers the six requested tickers, small/micro caps, banking, insurance, industrial, biotech, consumer, software, semiconductor, ADR/FPI issuers, all eleven web profiles, and twelve random selections: **40 distinct profiles** in the final audit.

| Issuer | Consumer facts verified in source |
|---|---|
| AAPL | Smartphones, computers, tablets, wearables/accessories, related services and AppleCare. |
| NVDA | AI/computing infrastructure, CUDA/GPU platforms and stated computing markets. |
| TSLA | Current design/manufacture/sale of electric vehicles and energy generation/storage systems; future objective excluded. |
| MSFT | Software/cloud services, devices and stated business/product offerings. |
| PLTR | Government/commercial data software; Gotham, Foundry, Apollo and AIP. |
| XPEV | Smart EVs in China and explicitly stated driver-assistance technology. |
| ROOT | Personal auto-insurance products and explicitly stated US market. |
| BOH | Consumer Banking, Commercial Banking and Treasury segments. |
| LSCC | Programmable-logic semiconductors, enabling products, services and licenses. |
| MDU | Current regulated energy delivery; an About-page historical 2001 coal claim excluded. |

Audits rejected legal-formation-only MGRT/ILPT descriptions, mission/strategy copy, HR/employee counts, unsupported superlatives, corporate timelines and headings detached from regional facility counts. Combined annual-report registrant names are inspected: unqualified “we/the company” cannot safely describe the requested parent/subsidiary when multiple legal registrants exist. Named issuer statements remain eligible. Some accepted profiles are sparse or use source abbreviations and retain industry terminology; they are useful factual summaries, not a claim of uniform editorial polish or comprehensive segments/products.

## 6. Discover integration

The shared stock component places **Unternehmen** before the existing financial/intelligence chapters in Discover and Quant. It shows prepared description, company website where known and annual/source citation. German interface labels with English sourced prose (`lang="en"`) follow existing news conventions; no uncontrolled translation service is added. Existing sector/industry fundamentals are reused, not duplicated.

A stale annual description shows “Ältere Unternehmensbeschreibung” with the filing date, rather than disguising a cached replay as fresh verification. Unsupported profiles do not produce empty chapters. Wrong-issuer/unsafe source payloads are refused and prose is escaped as plain text. Existing rollout gates remain in force; this is not an unauthorized production expansion.

## 7. Verified domain conversion

Reported verified domains: **2,359 → 2,411**; committed official-site seeds: **2,353 → 2,405**. These distinct measures must not be conflated. The profile catalogue covers **1,799 / 2,405 seeded-site issuers (74.80%)**; **1,796** profiles carry a website. That is issuer overlap, not proof that SEC profiles were extracted from those websites.

The preserved remote report separately measures a 1,642-new-domain cohort: 1,154 IR, 1,017 accepted-news issuers, 431 calls, 418 webcasts, 946 presentations and 543 management-content issuers. These overlapping sets are not summed. The report's top table says zero cohort 180-day news while its executive and news sections say 1,017; **1,017 is narrative-reported accepted-news coverage, not an independently recounted union**. An exact “any useful intelligence” union for all 2,411 domains requires the absent ledger.

## 8. IR conversion

Reported IR pages: **910 → 1,239**. Latest source registry: **3,332 operational descriptors**, **3,057 committed descriptors**, versus 2,378 committed at start. Remote broad-IR checkpoint: **501 / 901 roots classified, 400 pending, 422 successful outcomes; 4,951 requests / 349,010,402 decoded bytes**. The queue was not restarted locally. Exact all-IR issuer unions for news/events/calls/materials and zero-conversion clusters remain unavailable until original checkpoint restore; fingerprints alone cannot supply those conversion rates.

## 9. News

180-day issuer coverage: **1,168 → 1,692**, **+524 (+44.86%)**, latest **27.84%** of the universe. Known structured adapters/feeds remain issuer-matched. Remote native-feed cohort processed 182 frozen sources / 184 attempted source instances (retries), accepted 1,577 stories and added 156 news issuers using 344 requests / 11,743,819 bytes; it reached NO_DUE. This is preserved remote evidence, not a rerun against an empty ledger.

## 10. News freshness

| Window | Before | After | Change |
|---|---:|---:|---:|
| 7 days | 474 | 520 | +46 |
| 30 days | 934 | 1,332 | +398 |
| 90 days | 1,163 | 1,679 | +516 |
| 180 days | 1,168 | 1,692 | +524 |

These are two dated remote snapshots. Snapshot windows move with time; counts are not all causal additions from this profile work. News retains approximately four-hour polling.

## 11. Confirmed earnings

**80 → 92** confirmed upcoming issuers; estimates **3,198 → 3,187**. Confirmation still requires explicit owner-matched dated announcement/event evidence, not pattern forecasts. The added short-quarter adapter recognizes owner-verified “Q3 FY26 Results” style event titles while rejecting clinical/production/generic third-party results. Existing event IDs are reclassified in place, period/year is only stored when explicit, and linked estimates retire without duplicate events. No numerical adapter-only gain is claimed without the ledger.

## 12. Calls

**372 → 528** call issuers; dated **316 → 432**. Fiscal periods and owner relationships remain required. Remote event audit still identifies two duplicate untimed-call groups, including EPR; no ledger deletion or claimed fix is made without the actual event records. This is an explicit remaining bundling limitation, not inflated issuer coverage.

## 13. Webcasts

**332 → 467** webcast issuers; replay **4 → 6**. Only public URLs are admitted; no login/captcha/access bypass is introduced. Q4 PDF attachments no longer become webcast links, and token/test/unsafe URLs are excluded.

## 14. Presentations

**760 → 1,028** issuers. Remote materials follow-up completed eleven batches using **637 requests / 17,765,817 bytes**, with **80 new presentation issuers** reported. Earnings/investor slides, supplemental reports and shareholder materials retain owner/source provenance. Q4 classification gives transcript/remarks/letter/report wording precedence over generic presentation labels and repairs inherited misclassifications on successful polling.

## 15. Transcripts / management content

Transcript references **157 → 223**; prepared remarks **31 → 40**; shareholder letters **26 → 42**; any management content **425 → 593**. Latest remote other-management count is 15. References are not represented as downloaded/licensed transcript bodies; public metadata and source links are preserved. Caption/transcript expansion still requires publicly supplied evidence.

## 16. GlobeNewswire backfill

Preserved monthly archive: **2,425 attempted / 2,395 parsed / 1,289 new items / 161 duplicate matches / 817 identities**; accepted issuer-scoped set **1,439 items / 1,436 URLs**. Continuing September–October 5 checkpoint: **thirteen batches; 1,270 attempted / 1,266 parsed / 656 stories / 119 duplicates; 1,289 requests / 115,497,665 bytes; 276 new news issuers**. The earlier three-batch issuer gains were **26 / 27 / 21**; the latest four batches added 73 issuer identities, low-gain streak zero. This remains meaningful marginal coverage, not a source ceiling.

The preceding nine-batch report had 880 parsed / 876 attempted (staged/replay accounting inconsistency); the latest thirteen-batch checkpoint reports 1,266 parsed / 1,270 attempted. Historical accounting is retained rather than silently rewritten. Bodies retained: **zero**. Continuation must restore the actual private publisher checkpoint; none was recreated in this workspace.

## 17. Platform conversion rates

| Platform | Sources ever successful / operational sources | Rate |
|---|---:|---:|
| Q4 | 1,457 / 1,677 | 86.88% |
| GCS | 845 / 966 | 87.47% |
| WordPress | 191 / 227 | 84.14% |
| STOCKPR | 268 / 295 | 90.85% |
| Generic | 76 / 94 | 80.85% |
| Web Driver | 35 / 40 | 87.50% |
| Investis | 20 / 25 | 80.00% |

**These are preserved source polling success rates, not issuer-to-news/call/material conversion rates.** Platform fingerprint issuer sets overlap: Q4 413, GCS 403, STOCKPR 145, generic 138, WordPress 122, Investis 36, Web Driver 29, others two. Exact downstream per-platform unions require restored ledger queries.

## 18. Remaining candidates

Remote original frozen inventory: **4,248 / 4,248 classified**; advertised/runtime inventory **4,399 / 4,412 processed; thirteen newly advertised unchecked candidates**. The original 15-candidate tail and earlier subsequent tails were processed remotely; the newest thirteen-candidate tail remains pending, as does a separate forty-issuer orphan-recovery cohort. **2,002 not-verified identities** include evidence/cooldown classifications and the thirteen unchecked identities; they are not 2,002 unchecked candidates. Broad IR's **400 pending roots** remain the largest explicit live continuation queue. Profile missing cases are distinct from domain candidates.

## 19. Random consumer audit

A disposable, explicitly profile-only audit database imports the actual prepared catalogue and projects the full 6,078-issuer universe; it is not a substitute rollout database. A 15-stock consumer cohort produces **31 assets / 40,655 bytes**, maximum payload **2,904 bytes**. Actual filesystem-backed public delivery and both stock pages were checked at 390/430/768/1440 widths.

Final browser validation covers **77 cases**: 64 responsive stock views, two disabled-gate zero-request cases, eight wrong-issuer/unsafe-link/XSS/stale cases and three private-path rejections. Profiles reuse the existing three lookup URLs (rerenders can abort/repeat requests); no extra profile endpoint/request is added. BOH's audit inclusion is browser-only; production cohort gates remain unchanged.

This local profile-only audit cannot show the latest original-ledger news/calls/events because that ledger is missing. Rich historical/current remote consumer cohorts are preserved below with their own generations and provenance; they are not described as fresh local all-section audits.

## 20. False positive audit

Exact CIK and legal issuer subject checks prevent same-name company, parent/subsidiary, renamed-issuer and ticker-reuse contamination. Multiple share classes reuse canonical issuer profiles. ADR/FPI priority XPEV and stratified VEON source wording were checked; combined registrant annuals cannot borrow subsidiary first-person text. Official website ownership comes from existing proof, not inferred SEC name similarity.

**91 cumulative exact-source withdrawals** suppress previously weaker descriptions only when the old parser/source hash matches; prior factual/source data remain private. Newer/manual/changed-source profiles survive. No news/event/source queues are reset. The final audit removes bare legal formation and excludes promotional IT/mission claims rather than importing invented products/customers.

## 21. Full-universe metrics

Profile counts below are exact local prepared-catalogue counts; other rows compare the initial and latest incorporated **remote measurement snapshots**, not a local ledger recount or deployed production claim.

| Measure | Starting snapshot | Latest snapshot | Change | Latest / 6,078 |
|---|---:|---:|---:|---:|
| Company profile | 0 | 3,670 | +3,670 | 60.38% |
| Verified domains | 2,359 | 2,411 | +52 | 39.67% |
| IR pages | 910 | 1,239 | +329 | 20.38% |
| News 7d | 474 | 520 | +46 | 8.56% |
| News 30d | 934 | 1,332 | +398 | 21.92% |
| News 90d | 1,163 | 1,679 | +516 | 27.62% |
| News 180d | 1,168 | 1,692 | +524 | 27.84% |
| Calls | 372 | 528 | +156 | 8.69% |
| Dated calls | 316 | 432 | +116 | 7.11% |
| Webcasts | 332 | 467 | +135 | 7.68% |
| Replays | 4 | 6 | +2 | 0.10% |
| Presentations | 760 | 1,028 | +268 | 16.91% |
| Transcript references | 157 | 223 | +66 | 3.67% |
| Prepared remarks | 31 | 40 | +9 | 0.66% |
| Shareholder letters | 26 | 42 | +16 | 0.69% |
| Any management content | 425 | 593 | +168 | 9.76% |
| Confirmed upcoming earnings | 80 | 92 | +12 | 1.51% |
| Estimated earnings windows | 3,198 | 3,187 | -11 | 52.44% |
| Consumer sizing payloads | 4,914 | 5,076 | +162 | 83.51% |

Financial summaries remain remotely reported **4,869**, current summaries **3,721**, SEC identities **5,412**. Historical material-intelligence coverage was approximately **4,021**; an exact latest original-ledger material-intelligence union is unavailable here and is **not fabricated**. Profiles enrich AVAILABLE payloads without relabelling their historical material-intelligence flag. The latest **5,076 consumer-sizing payloads** comes from the remote combined ledger projection; its exact imported profile version is not independently verified here. Do not add the final profile-only export count to that number. Exact final combined consumer/material union must follow checkpoint restore and projection.

## 22. Request / bandwidth metrics

Initial profile lane: **10,882 requests / 20,381,052,023 returned decoded bytes** (20.381 GB decimal); compressed wire bandwidth was **not measured**. These counters include SEC cohorts and the separately measured priority/web audits; successful immutable filing downloads are reused. Catalogue completed-batch runtime **7,902.835 seconds** is local execution, not Actions billing or total human elapsed time. At least **99 catalogue batches** used zero HTTP, plus read-only reviews and full source audits.

Broad IR, native feed, materials and publisher request counters are separate overlapping remote cohort/run measurements; they are not blindly summed into a claimed global total. Read-only cached missing-profile reviews examined 1,200 cases in four rounds with candidate gains 14/5/12/3. Every recovered profile was rechecked by the real extractor; candidate gains are not profile coverage counts.

## 23. Profile cost model

Paid data/model/translation provider cost: **$0**. Initial extraction requests are measured above. Conservative steady-state scenario: one new annual document per SEC profile/year, existing submissions refresh reused, and eleven web-only profiles reviewed quarterly with at most six source/robots requests per review: **326.92 source requests/month**. Real filing-driven activity is uneven, not a fixed monthly cron for each issuer.

No extra consumer profile request or recurring news wakeup is added. Prepared catalogue JSON occupies **6,406,504 bytes**; two public-slot profile content scenario **12,813,008 bytes**, before wrappers/index/compression. This is a scenario, not measured final combined R2 increment. Private compressed SEC cache is excluded from the existing R2 checkpoint allowlist; do not upload full filing bodies to public storage.

## 24. Total Actions cost model

Latest remote operational plan: **10,183 planned polls/day / 305,490 per month**, **10,150 unique URLs/day / 304,500 per month**. At two seconds serially that is a **10,144 aggregate-minute/month floor**, not measured or billed runtime. Existing bounded six-times-daily 160-source lane supports **960 polls/day**, with eight-minute × 180-run monthly envelope **1,440 minutes**; it does not cover the complete current source registry at all desired cadences. Eleven disjoint lanes would be a **15,840-minute monthly capacity scenario**, not activated here.

Local profile backfills consume no GitHub Actions runner minutes. Milestone pushes do trigger existing CI, so the work is not represented as zero CI cost. No new recurring production workflow is enabled. Existing free-plan/runner-rate eligibility and actual execution duration determine the bill; no unsupported dollar invoice is asserted.

## 25. R2 cost model

Remote two-public/two-private-slot retained-footprint scenario: **0.268203 GB**; conservative full-change monthly public PUT **1,029,420**, public verification GET **2,058,120**, private PUT **540**, restore GET **900**. Hash skipping lowers writes; user delivery traffic is excluded. The remote footprint already includes earlier profile content, so adding the final full catalogue size would double-count some data. Final incremental combined bytes need exact restored export/checkpoint measurement.

The existing two-slot policy remains; no new bucket or per-profile object is introduced. Expanded checkpoint upload and final authenticated R2 delivery were **not performed** without credentials. Git preserves the new prepared facts; private negative attempts/cache are locally durable but not magically remotely recoverable. No “$0 R2” claim is made without accounting for operation thresholds and consumer traffic.

## 26. Tests

Final local feature validation: **508 Python tests / 39 Company Intelligence Node tests**. Source hash/contract audit: **3,670 sources, zero errors**. Actual browser: **77 cases**. Broader existing Node regressions: **2,574 total; 2,569 pass, five intentional skips, zero failures**. A dry three-way integration check against current main passed; it does not merge PR #356.

Tests cover wrong issuer/URL/XSS, staleness, single/multiple registrants, annual filing changes/failure retention, cache-only reparse, budgets/circuits, no missing-ledger initialization, selective quality withdrawal, short-quarter confirmation and Q4 attachment classification. Full feature tests are rerun after final parser changes. The a20333dc profile head passed all test steps and nine workflows, but its feature workflow concluded cancelled when the concurrent conversion head arrived; cancellation is not reported as a pass. Final GitHub workflow conclusions and exact preservation SHAs are recorded in the PR/final response; cancelled concurrency jobs are not called passing.

## 27. Regressions

Existing financial/news/event/material source states are additive and preserved. No Master/fundamentals/production currency data is changed. Broader tests' generated total-return verification file was inspected and restored; unrelated generated artifacts are not committed. News ≈4h, SEC ≈4h/change-driven, events ≈12h, materials 12–24h, IR days, domains slow/weekly, profiles annual-change/quarterly conventions remain. Sparse consumers show available sections, with no empty profile clutter.

## 28. Limitations

80–90% profile coverage is unmet; **2,408 issuers lack an accepted profile**. Missing-case reasons include absent annual primary documents (roughly 235 SEC identities after web successes), explicit business text not safely extractable, linked 40-F/S-1/F-1 evidence, combined registrants, and 666 issuers without SEC identity. Some accepted type/holding descriptions remain partial. No language translation has been added. Seven profiles are marked stale rather than pretending current evidence.

The expanded discovery checkpoint is unavailable locally; therefore broad-IR/Globe/new-candidate continuation, exact domain/IR downstream unions, final combined material-intelligence coverage and full production R2 acceptance are blocked. Remote metrics have the two documented news/archive accounting inconsistencies. Untimed duplicate-call groups remain. Full-registry scheduling capacity is not proven. The free/public-source ceiling is not established.

## 29. Remaining high-leverage opportunities

1. Restore the exact expanded private checkpoint, preserve its digest/queue IDs, import this catalogue, resume the remaining 400 broad-IR roots and the profitable September–October metadata checkpoint, then reproject/audit the actual combined generation.
2. Exploit cached annual missing cases first: precise linked 40-F/annual business exhibits and issuer-scoped organization/managed-assets patterns; avoid weak identity-only fallbacks. Follow with bounded verified About/IR overview expansion beyond the initial 96 fallback issuers.
3. Query zero-downstream verified-domain and known-IR cohorts by platform; expand Q4/GCS/WordPress/STOCKPR explicit structured events/news/material feeds without relaxing owner matching.
4. Reconcile the two untimed call groups using actual event/fiscal-period/public-link evidence, improve public replay/captions/remarks discovery, and measure distinct issuer unions rather than adding overlapping channel totals.
5. Validate capacity and authenticated recovery/delivery for the precise final generation before widening Discover rollout. No production gate is widened merely because CI passes.

## 30. Readiness

Breakthroughs below refer to new prepared profiles and the incorporated remote source-conversion snapshots, not a completed 80–90% target or production activation. Code readiness requires final checks; pilot/broad readiness require missing checkpoint/authenticated delivery/capacity evidence.

COMPANY-PROFILE-BREAKTHROUGH: YES
DOMAIN-TO-INTELLIGENCE-CONVERSION-BREAKTHROUGH: YES
NEWS-COVERAGE-BREAKTHROUGH: YES
CALLS-MATERIALS-BREAKTHROUGH: YES
CODE-MERGE-READY: YES
PILOT-READY: NO
BROAD-ROLLOUT-READY: NO

PR #356 must remain open and unmerged. Successive validated milestones are preserved remotely in branch history, including the 3,177-profile milestone `d6abce3188ff603e8b6b894a2e87a7cd3c9ab875` and the 3,684-profile milestone `3c8b2fbb1438ed06dd7bdf9131b3ff984f851fa1`. Exact final local/remote/PR head verification belongs in the final response because a commit cannot contain its own SHA. Branch preservation uses verified Git Data API non-force ref updates when smart-HTTP pushes reject authentication.

---

## Preserved earlier reports and source-conversion checkpoints

The following reports are historical, contain earlier counts/limits and are retained for provenance. The 30-section report above is the current prepared-profile summary; historical source-ledger totals retain their own snapshot scope.


## Validated profile catalogue milestone — 2026-10-05 12:08 UTC

**3,684 profiles / 6,078 supported issuers (60.61%)**: 3,673 SEC and 11 verified first-party web profiles. All 5,412 SEC identities have received an initial attempt. Final targeted cache-only quality passes removed 43 weak descriptions, recovered two explicit descriptions and generated source-hash-scoped withdrawals; 77 cumulative withdrawals preserve prior facts privately rather than deleting other intelligence. All 3,684 persisted source hashes validate against cached evidence with zero audit requests. **507 Python tests and 39 Company Intelligence Node tests pass.** The 80–90% profile target remains unmet; the missing expanded discovery ledger and its private checkpoint remain explicitly unresolved locally. This milestone does not recount the original news/event ledger.

# Company Intelligence — stored profiles and conversion continuation

## Validated milestone, 2026-10-05

Repository/PR starting head: `9dc8e701cb0dc4e06a1796a52bd794fd70faf7c9`; branch `feature/company-intelligence-rollout`, [PR #356](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/356). Do not merge. Existing production gates and schedules remain unchanged.

**Exact restore boundary:** this fresh workspace does not contain the preceding private expanded ledger, retained web cache or discovery queues. That ledger was not uploaded in the preceding run; there are no configured private R2 credentials here and it is not in the inspected Actions artifacts. Its latest remotely documented SHA-256 is `461ae390d7f641e784da1d31a3fd7d614231d1554ed9c48b452095b4599b45e6` (23,167,678 compressed bytes). The initially inspected predecessor hash was `b5b1fc59f7f394d0859b172e005f26d8c998e6ea2bc5656bfb5bb11bafe9a789`. A checkpoint location has been requested. No substitute rollout ledger has been initialized. Existing committed seeds and the full preceding report below are preserved. Consequently old discovery, broad-IR, remaining-candidate and GlobeNewswire queues cannot honestly be resumed until that checkpoint is supplied.

Exact committed baseline: **6,078 supported issuers; 5,412 SEC identities; 2,353 official-site seeds; 2,378 source descriptors**. Site seeds are not a fresh recount of the preceding ledger's 2,359 verified domains. Concurrent remote milestone `ad56547106c9f0f3f72f8e29050a3e91fb382b1e` was fetched and incorporated before preservation. Its later measured ledger snapshot is 2026-10-05T07:55:12Z; its counters below are historical evidence, not newly verified after counts.

An additive public factual profile catalogue now supplies **74 SEC-grounded issuer profiles (1.22% of supported issuers)** at the initial audit boundary (the first pushed catalogue contained 98 profiles). This is prepared coverage, not a claim that the missing deployed ledger has been updated. Catalogue import prevalidates every profile and writes only profile state; newer and stronger existing profiles survive. Independent per-issuer attempt checkpoints and immutable SEC document caches are private/ignored. No discovery inventory or queue is rebuilt. Subsequent bounded batches continue from this new profile lane's checkpoints.

Implemented: normalized stored `companyProfile`, provenance/CIK/ownership checks, cached annual-business extraction, explicit issuer-subject first-party About extraction, deterministic neutral rewriting, slow filing-driven/quarterly refresh, bounded budgets/cooldowns/circuit breakers, public export and consumer contract, profile metrics, and shared Discover/Quant `Unternehmen` chapter. Existing English-source content remains English under German UI labels with a language attribute, following news conventions. No translation/model calls, employee count, generated page-time descriptions or paid provider are introduced. Unsupported structured facts remain empty.

A simultaneous Q4 conversion fix correctly classifies transcript, prepared-remarks, shareholder-letter and financial-supplement attachments; it prevents PDF links becoming webcasts and repairs inherited legacy attachment classifications on source polling. It does not assert numerical coverage gains against the absent ledger.

Initial evidence audits include Apple, NVIDIA, Tesla, Microsoft, Palantir, XPeng, a bank holding company, an insurer, industrial, biotech, consumer, software, semiconductor and foreign issuers. Marketing predicates, plural-verb rewriting, split business headings, legal comma suffixes and duplicate platform lists found during inspection were corrected through zero-request cache replays. IHG's annual document exceeds the 16 MiB parser ceiling and remains unavailable. Neither identity nor sector alone is used as a profile.

First 100 new-issuer SEC batch: **200 requests, 58 initial acceptances, 41 abstentions, one document-size failure, 429,880,101 returned decoded bytes**, 200.914 seconds. The 15 priority profiles reused audit caches with zero requests. Subsequent local parser replays use zero HTTP; their accepted counts describe reanalysis, not new network discoveries. Actual compressed wire bandwidth was not measured. Full Company Intelligence checks: **452 Python tests and 39 Node tests passed**. Browser, wider regressions, additional batches and the final coverage/cost report follow in subsequent remotely preserved milestones.

## Second validated milestone — 2026-10-05T08:47:53Z

**586 prepared profiles / 6,078 supported issuers (9.64%)**, all SEC-grounded; 815 exact-CIK issuer attempts have durable outcomes. First-party-only and combined-source catalogue counts are zero; the first-party audit is separate. The original discovery ledger still has not been restored. The 80–90% target has not been achieved; further SEC cohorts continue.

Eight new 100-issuer network batches plus priority-source audits used **1688 requests / 3,493,317,755 returned decoded bytes**, including the 59-request first-party audit. Parser replays used zero HTTP. The original 15-profile priority batch reused SEC audit caches. Rewritten profiles are counted separately from newly covered issuers. Immutable annual documents remain compressed in the existing SEC cache; no repeated filing downloads occur. Per-issuer checkpoints, one-writer locking, retry cooldowns and a three-failure SEC circuit protect continuation. Initial catalogue rate can explicitly be 1–3 SEC requests/second; scheduled production cadence is unchanged.

The source-grounded parser now recovers explicit legal short-name definitions, preserves holding-company/subsidiary wording, conjugates coordinated issuer verbs, rejects seasonality/footprint-only and promotional predicates, and removes promotional tails. Cache replay yielded 586 accepted profiles after quality correction. Sparse one-sentence results are permitted where richer facts cannot safely be normalized. No field is inferred from sector/ticker alone.

**Validation:** 471 Python tests; 39 feature Node tests; 2,569 broad Node regressions passed, five skipped. Actual Discover/Quant profile delivery passed 64 responsive cases, two disabled cases, six adversarial cases and three private-path rejections. The standalone preview shows the prepared company description and suppresses unavailable sections. First milestone's ten GitHub workflows passed. The broad regression command rewrote its generated total-return verification fixture; that test output was reviewed and reverted, with no unrelated production change retained.

**Profile-only cost scenario:** 48.83 source requests/month for this catalogue if one annual document/profile/year is refreshed, reusing existing submissions polling. Current cached projection adds zero requests and no new workflow is enabled. Prepared profile facts occupy 1,054,968 bytes; two public slots add at most 2,109,936 uncompressed profile bytes. The three-request immutable consumer lookup is unchanged; actual stock-page rerenders can repeat an aborted existing lookup. Profiles cause no additional fetch or live translation.

The incorporated remote conversion milestone preserves exact historical progress: verified domains 2,359 → 2,378; IR 910 → 938; 180-day news 1,168 → 1,416; calls 372 → 413; webcasts 332 → 353; presentations 760 → 785; management content 425 → 450; confirmed earnings 80 → 87. Those before/after numbers come from the two remotely committed measurement snapshots, not a new local recount. The original 15-candidate tail was processed remotely; the current remote checkpoint advertises a separate 20-candidate tail. Original broad IR remains 236/901 classified, and the September archive remains at seven batches. Both require the missing private checkpoint; neither is restarted.

## CI lifecycle correction

The second milestone's Company Intelligence merge-tree workflow failed on the new catalogue-membership test: current main had withdrawn Qwest Corp from supported equity scope after the branch's frozen master was prepared. This was an incorrect assumption in our new test, not a pre-existing main failure. The import implementation already intersects the current authoritative master and withholds absent identities. The corrected test validates every profile's exact CIK/provenance, asserts the complete supported import set, deliberately withdraws an issuer, proves it cannot be imported or exported, and proves its preceding private factual record survives. Twenty-seven targeted profile tests pass. Current-main dry master: 6,073 issuers versus the branch's fixed 6,078; the catalogue's Qwest record is withheld on main. No Company Master data or eligibility rules are changed and no main merge occurs. Subsequent workflow validation is required before merge-ready is asserted.

## Third validated milestone — cached quality recovery

The prepared catalogue now contains **1093 profiles / 6,078 issuers (17.98%)** after **1515 exact-CIK attempts**. All prepared profiles have SEC annual-filing provenance. Cache-only parser recovery adds no network requests. This pass strips legacy jurisdiction annotations from display names, excludes human-capital sections and employee-count facts while retaining employee-benefit products, preserves issuer names during adjective removal, and accepts larger annual documents within a 64 MiB ceiling. IHG now fits that ceiling but still lacks an eligible complete business statement; it remains unavailable rather than being assigned a guessed description.

Optional profile failures are isolated from the existing SEC financial/news pipeline. Failed extraction of a genuinely newer annual filing marks the preceding profile stale; a same-document parser update does not imply a new filing. **477 Python tests and 39 feature Node tests pass**; all ten GitHub workflows passed on lifecycle-correction head `73d327b3ddd133440e6c2161fdfb72c63c49ef55`. Further source backfill and consumer-quality review continue. The original discovery checkpoint remains unavailable; all inherited queues and prior reports are preserved.

## Fourth validated milestone — business-first quality selection

The source parser prioritizes explicit core business predicates ahead of customer-only sentences. It preserves SEC-described segment relationships and nested consolidated legal definitions, removes market-rank/superiority claims, fixes legal-suffix punctuation and avoids distribution-only descriptions or accidental product-list fragments. A prepared description that no longer satisfies these quality rules is retired from this new catalogue using its identical cached filing, with an explicit durable outcome; the preceding rollout ledger is not touched. Changed annual filings preserve earlier sourced facts with a stale flag if new extraction is unavailable.

Cache-only upgrades retain their original verification time. Catalogue import permits a newer parser on identical evidence at that timestamp, while preserving later verification, stronger sources and supersession. Regression coverage includes parent/subsidiary wording, wrong issuer, marketing introductions, ranked bank descriptions, customer-only abstention, nested legal definitions, no-request retirement and repeated-run cooldown. **485 Python tests / 39 feature Node tests pass.** All ten workflows passed on the preceding remotely preserved head. The next catalogue milestone follows after the cache replay and additional SEC cohorts; current source discovery queues remain unrestored.

## Fifth validated milestone — stored catalogue and annual-change refresh

**1169 prepared profiles (19.23% of 6,078 issuers)** are preserved at this milestone. The latest extraction correction is replaying cached source documents, followed by further bounded SEC cohorts. The source parser now avoids confusing a noun such as “chip designs” with the issuer's main business predicate and removes conjunctions left behind when promotional adjectives are stripped. The full-scope profile target is still unmet.

Existing authorized SEC change refreshes may fetch one genuinely newer annual filing for a stored SEC profile. They never trigger initial catalogue discovery, never fetch unchanged filings after a runner loses its document cache, respect unavailable/failure checkpoints, share existing SEC request/time budgets, and cannot suppress financial/news/event projection. Offline projection remains zero-request. An unavailable new description retains previous sourced facts with a stale warning. Discover/Quant now identify older descriptions using the annual filing date, rather than presenting today's cached verification as fresh business evidence.

**Validation:** 489 Python tests, 39 feature Node tests, and 77 actual browser/delivery cases pass (64 responsive, two disabled, eight adversarial including stale annual dates, three private-path rejections). All ten GitHub workflows passed on `a4b49967ed3839722732d61a1648acf32ce3bd2c`. Original expanded discovery state remains absent; no original queue or ledger is restarted. Catalogue facts are remotely durable; source-document cache and independent attempt metadata remain private in this workspace and cannot be remotely preserved through unauthenticated R2.

## Concurrent conversion preservation — 2026-10-05T09:42:04Z

Concurrent remote milestone `ebde42ccc815b4aa882d3dd4d5fe0d68fa75d9cb` was fetched and incorporated. Its updated conversion measurements, source seeds, completed recovery cohorts and private-checkpoint fingerprint are preserved below. These new remote ledger measurements supersede the 07:55:12 conversion snapshot; the current workspace still lacks that private ledger and cannot claim a local recount. Profile checkpoints remain separate and are resumed at the completed batch boundary.

## Sixth validated milestone — 1699 profiles and explicit-quarter earnings conversion

**1699 / 6,078 prepared company profiles (27.95%)** are preserved. Every profile has exact-CIK SEC annual provenance. The original discovered-source ledger remains unavailable here; network expansion continues from the separate profile lane's current checkpoint.

Explicit official event titles such as “Q3 2026 Results”, “2026 Q3 Results” and “Q3 FY26 Results” now establish the appropriate earnings event. Exact issuer/source ownership and explicit calendar date requirements are unchanged. Another named company, generic “Results”, production and clinical results remain excluded. A source-ingestion test proves an existing vendor event is reclassified in place, the issuer estimate is reconciled once and replay cannot duplicate the call; another issuer's estimate survives. Numerical confirmed-earnings gains against the missing ledger are not invented.

Consumer replay revealed that additive import could retain older descriptions previously withdrawn for weak business content. Seven exact cached-evidence quality withdrawals (six previously published, one only in the ephemeral audit store) now withhold those public descriptions. Every preceding factual field/source remains private; changed evidence, later verification, manual review and annual supersession are protected. Discovery queues, source health, news and financial state are not altered. The profile-only consumer recount now reconciles to the authoritative catalogue rather than accumulating obsolete descriptions.

**492 Python tests and 39 feature Node tests pass**. Source quality correction uses zero network requests. The prior real browser audit passed 77 cases. Remote conversion milestone `ebde42ccc815b4aa882d3dd4d5fe0d68fa75d9cb` remains incorporated, with 2,406 domains / 966 IR pages / 1,470 strict 180-day news issuers / 424 calls / 801 presentation issuers. These are its 09:42:04 remote measurement, not a local ledger recount. Latest expanded private checkpoint fingerprint there is `4052084632b4246d4d6cd81ef2bf2a73d3c032a7267d4bdebf44ed248d0f92f7` (24,560,579 compressed bytes); it has not been supplied here.


Latest concurrent discovery milestone incorporated: `95fd4d3513502d2d28eeaa5103a1c3b9228cc9c2`, coverage snapshot 2026-10-05T10:16:45Z. Original candidate tail is now fully classified (4399/4399); broad IR is 316/901 classified, 585 pending. Its private ledger/checkpoint remains unavailable here; the original queues were not recreated. Profiles remain additive prepared facts.


### Evidence-scope milestone — 2026-10-05T11:00 UTC

Prepared catalogue: **2,977 profiles / 6,078 supported issuers (48.98%)**, all sourced to exact-CIK SEC annual filings. The source audit inspected 2,846 cached annuals and found 42 multi-registrant reports. Version 1.0.11 rejects unqualified first-person statements in combined reports, retaining exact requested-issuer subjects. **22 sampled profiles retain named evidence; 20 are withheld**. The private ledger keeps preceding facts and exact-hash quality-withdrawal evidence; unrelated news, domain/source proofs and financials are untouched. Two targeted cached batches examined 177 attempts, recovered three previously unavailable profiles, updated 54 and retired 22 across the broader quality cohort, with **zero HTTP requests**. Combined Business/Properties headings and single-registrant Corporation voice are now supported; promotional culture/purpose copy and incorrect infinitive conjugation are excluded.

Concurrent remote discovery milestone `d30133ae5dc03d7b50ac816ba3c57b9f7a4b39fb` is incorporated without recreating its checkpoint: 1,539 recent-news issuers, 462 calls, 400 webcasts, 892 presentations, 507 management-content issuers and 89 confirmed upcoming earnings. Original frozen tail remains fully classified. Continued bounded SEC initial extraction remains pending; the 80–90% profile target is not reached. Validation: **498 integrated Python tests and 39 feature Node tests passed**. A profile-only full-universe export/consumer projection validated all 2,977 available profiles; the 15-stock browser cohort contains 31 prepared assets / 40,374 bytes. This isolated audit is not a replacement for the absent discovery ledger.


### Consumer-description quality milestone — 2026-10-05T11:11 UTC

**3,177 prepared profiles (52.27% of 6,078)**. A 403-issuer targeted cached review upgraded 285 descriptions and withheld three more weak descriptions with **zero HTTP requests**. Actual source-driven fixes now handle country abbreviations at sentence boundaries, pipe-separated SEC Business headings, explicitly stated banking segments, concrete/wire products and exact-issuer consolidated plural predicates. Corporate strategy, employee-channel prose and promotional interface/culture statements are excluded. Source verification dates remain unchanged on cached normalization. Root now explicitly states its personal auto-insurance market; Bank of Hawaii states Consumer Banking, Commercial Banking and Treasury segments; Lattice identifies programmable-logic semiconductor products and licenses. No customer or segment facts were invented. **500 integrated Python tests pass; 39 feature Node tests pass.**

<!-- PROFILE-CONTINUATION-MILESTONE-END -->


# Company Intelligence — domain verification and deep coverage passes

Validated **2026-10-03T15:21:32Z** on `feature/company-intelligence-rollout`, PR [#356](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/356). Initial local/remote HEAD: `17cd31b504d0d3365143ffb5f540e1477519860f`. This report supersedes the measurements below. PR remains unmerged and feature-gated; no public schedule or broad rollout was activated.

## 1. Executive result

Verified domains increased **306 → 769**, IR **155 → 326**, current news **374 → 519**, calls **75 → 137**, presentations **95 → 212**, and management-content references **72 → 149**. Stronger corporate ownership evidence and recovery of partial discoveries unlocked existing reusable adapters. These are real downstream gains and a **domain-coverage breakthrough (2.51× verified domains)**, but the complete candidate-pool mission and news breakthrough remain unfinished: 1,487 fresh first-pass candidate attempts completed, and 1,925 candidates still have no verification outcome. The practical free-source ceiling has not been established.

The authoritative denominator is **6,078 issuers**, not share-class/ticker rows. Calls/materials more than doubled across several components and constitute a scoped coverage breakthrough; references can be historical; news is accepted metadata within 180 days. All research-ledger totals below are distinct from production-published data. No missing values, times, transcripts or future earnings dates were invented.

| Component | Before | After | Absolute gain | Relative gain | Universe coverage |
|---|---:|---:|---:|---:|---:|
| News 180d | 374 | 519 | +145 | +38.77% | 8.54% |
| Verified domains | 306 | 769 | +463 | +151.31% | 12.65% |
| IR pages | 155 | 326 | +171 | +110.32% | 5.36% |
| Calls | 75 | 137 | +62 | +82.67% | 2.25% |
| Call date | 71 | 120 | +49 | +69.01% | 1.97% |
| Webcasts | 51 | 111 | +60 | +117.65% | 1.83% |
| Explicit replays | 0 | 0 | +0 | — | 0.00% |
| Presentations | 95 | 212 | +117 | +123.16% | 3.49% |
| Company transcripts | 39 | 64 | +25 | +64.10% | 1.05% |
| Prepared remarks | 2 | 6 | +4 | +200.00% | 0.10% |
| Shareholder letters | 5 | 11 | +6 | +120.00% | 0.18% |
| Management commentary | 0 | 1 | +1 | new | 0.02% |
| Any management content | 72 | 149 | +77 | +106.94% | 2.45% |
| Confirmed upcoming earnings | 27 | 44 | +17 | +62.96% | 0.72% |
| Estimated reporting windows | 3,317 | 3,302 | -15 | -0.45% | 54.33% |
| Active first-party news | 107 | 212 | +105 | +98.13% | 3.49% |
| Active external news | 162 | 162 | +0 | +0.00% | 2.67% |
| Material intelligence | 4,003 | 4,021 | +18 | +0.45% | 66.16% |
| Financial summaries | 4,869 | 4,869 | +0 | +0.00% | 80.11% |
| Fresh summaries | 3,721 | 3,721 | +0 | +0.00% | 61.22% |
| SEC identities | 5,412 | 5,412 | +0 | +0.00% | 89.04% |
| Recent material SEC | 594 | 594 | +0 | +0.00% | 9.77% |
| Consumer payloads | 4,982 | 4,985 | +3 | +0.06% | 82.02% |
| No consumer payload | 1,096 | 1,093 | -3 | -0.27% | 17.98% |

## 2. Domain candidate funnel

Inventory contains **4,283 candidates**, correcting the approximate 4,248 prompt baseline. **2,358** have existing/new classifications; **1,925** remain unchecked. This includes historical attempts and configured seeds, not that many new network verifications.

| Current classification | Candidate issuers |
|---|---:|
| INSUFFICIENT_EVIDENCE | 578 |
| VERIFIED_OFFICIAL | 768 |
| BLOCKED | 89 |
| MISSING_PAGE | 10 |
| AMBIGUOUS | 116 |
| REDIRECTED | 60 |
| TEMPORARILY_UNAVAILABLE | 578 |
| DEFERRED_BUDGET | 90 |
| UNRESOLVED | 7 |
| NOT_CHECKED | 1,925 |
| CONFLICTING_OWNER | 62 |

One verified domain is outside the candidate subset, so 768 candidate-verified issuers and 769 total domains are consistent. No domain was called WRONG_COMPANY, DEAD, PARKED, SUBSIDIARY_ONLY or BRAND_ONLY without adequate proof. Conflicting copyright and insufficient ownership remain unproven rather than guessed identities. Candidate downstream sets: **326 IR, 495 current news, 145 event sources, 137 calls, 212 presentations, 149 management-content references**. These sets overlap and do not imply domain verification caused every existing component.

## 3. Verified domains

The additive verifier reads bounded corporate title/OpenGraph/application metadata and legal copyright evidence. A complete multiword corporate name may omit Inc./Corp. only when the corporate header corroborates it and the ownership boundary is explicit. Generic single-word brands remain insufficient. Conflicting copyright ownership is now always rejected, even when the target is mentioned as a customer. Exact legal aliases/CIKs from the existing universe remain authoritative. Proof retains verification version, source hash, timestamp and bounded header/footer excerpts; no duplicate company master was created.

Actual metadata fixtures cover Werner Enterprises, Bio-Techne, Lattice Semiconductor and Helios Technologies. The changed rule handles corporate sites with a generic ‘Home’ title without accepting fuzzy brands. A subsequent bounded schema.org rule requires exact legalName, Organization/Corporation type, same-host organization URL and a corroborating corporate header; explicit conflicting CIK or copyright fails. It ignores generic brand-only legalName, unrelated types/hosts, malformed/oversized graphs and customer entities. Three observed structured identity fixtures include a similarly named foreign Iridex entity that must not match the US issuer. Seven structured-ownership tests plus the full feature suite pass; proof is versioned corporate-ownership-3. Current seeds total 769, including 463 machine-validated additions, not custom company scrapers.

## 4. IR pages

Bounded homepage/navigation/structured discovery on verified domains increased IR pages to 326. Three-page walks remain bounded and issuer ownership is required before delegated IR sources are trusted. Budget exhaustion now preserves independently validated endpoints and documents, records partial progress, and retries later without inventing a complete discovery success. A domain without downstream sources is never counted as news/call coverage.

## 5. Platform clusters

IR fingerprints and registered-source health are separate populations. Corporate-root WordPress hints (215 candidates) are not verified IR feed coverage. Verified root hints also include GENERIC 325 / WORDPRESS 215 / UNKNOWN 134 / Q4 50 / GCS 30 / INVESTIS 8 / STOCKPR 6.

| IR family | Fingerprinted issuers | Registry issuers / sources | ACTIVE sources | Undated metadata | Latest success |
|---|---:|---:|---:|---:|---|
| Q4 | 101 | 95 / 283 | 183 | 98 | 2026-10-03T15:11:14Z |
| BUSINESS_WIRE | 1 | 0 / 0 | 0 | 0 | — |
| GCS | 97 | 84 / 137 | 134 | 0 | 2026-10-03T15:11:14Z |
| STOCKPR | 29 | 31 / 42 | 40 | 0 | 2026-10-03T15:11:14Z |
| WEB_DRIVER | 13 | 10 / 11 | 10 | 0 | 2026-10-03T15:04:31Z |
| WORDPRESS | 38 | 33 / 38 | 16 | 0 | 2026-10-03T15:11:14Z |
| GENERIC | 61 | 10 / 13 | 12 | 0 | 2026-10-03T15:04:31Z |
| INVESTIS | 7 | 1 / 1 | 1 | 0 | 2026-10-03T04:21:03Z |

BUSINESS_WIRE is one embedded fingerprint only: no distributor aggregation adapter or reuse permission is implied. Robots and per-source access checks remain fail-closed. Existing platform health exposes failure/parser counts, active share, affected issuer count and last success; undated Q4 archives are not current news.


| Family | Registry issuers | News issuers | Event issuers | Material issuers | Sources | Current failures | Failure share | Last validated |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Q4 | 95 | 77 | 88 | 88 | 283 | 0 | 0.0% | 2026-10-03T15:11:14Z |
| GCS | 84 | 78 | 52 | 0 | 137 | 0 | 0.0% | 2026-10-03T15:11:14Z |
| WORDPRESS | 33 | 32 | 2 | 0 | 38 | 0 | 0.0% | 2026-10-03T15:11:14Z |
| STOCKPR | 31 | 31 | 1 | 0 | 42 | 1 | 2.38% | 2026-10-03T15:11:14Z |
| WEB_DRIVER | 10 | 10 | 0 | 0 | 11 | 1 | 9.09% | 2026-10-03T15:04:31Z |
| GENERIC | 10 | 9 | 2 | 1 | 13 | 0 | 0.0% | 2026-10-03T15:04:31Z |
| FIRST_PARTY | 1 | 1 | 0 | 0 | 1 | 0 | 0.0% | — |
| INVESTIS | 1 | 1 | 0 | 0 | 1 | 0 | 0.0% | 2026-10-02T14:53:16Z |
| UNKNOWN | 0 | 0 | 0 | 0 | 1 | 1 | 100.0% | — |
| PUBLIC_RSS | 0 | 0 | 0 | 0 | 1 | 0 | 0.0% | — |
| GLOBENEWSWIRE_RSS | 0 | 0 | 0 | 0 | 4 | 0 | 0.0% | — |
| GLOBENEWSWIRE_SITEMAP | 0 | 0 | 0 | 0 | 1 | 0 | 0.0% | — |
| GLOBENEWSWIRE_ARTICLE | 0 | 0 | 0 | 0 | 2 | 0 | 0.0% | — |
These are observed registry capabilities, not successful call/transcript coverage per vendor. Q4 event/report APIs, GCS event cards/RSS, STOCKPR feeds, Web Driver XML and native JSON-LD/iCalendar remain the adapters. Ownership and robots status are enforced per URL; no blanket platform access right is inferred. Current failure share is a point-in-time state, not a historical HTTP success rate. Parser-error counts and affected issuer counts are retained in aggregate evidence.

## 6. Generic adapter changes

The existing Q4, GCS, STOCKPR, Web Driver and structured-native adapters were expanded through verified inputs and partial-result recovery. No new vendor family was claimed without multiple-issuer evidence. Shared request admission no longer holds the global lock while one host waits, allowing independent hosts to progress while retaining at least five seconds per host and existing robots delays. Discovery has at most four workers and at most 200 requests per batch; the default global admission remains two seconds, with a discovery-only opt-in 0.5-second floor across independent hosts.

## 7. News

Accepted current-news coverage is 519 issuers, up 145 (+38.77%). This is insufficient for a news breakthrough and is not disguised using SEC coverage. Active first-party news rose 107 → 212; external news remained 162. Source ownership alone no longer turns a generic CMS post into an issuer announcement. Actual WordPress generator detection is independent of the IR vendor fingerprint; unrelated agency blogs, default posts and comments are rejected and audited before item/event creation.

## 8. News freshness

Issuer coverage: **7d 377 (6.2%), 30d 447 (7.35%), 90d 517 (8.51%), 180d 519 (8.54%)**. Source statuses: {"INACTIVE": 4, "ACTIVE": 403, "EMPTY": 6, "UNDATED_METADATA": 98, "STALE": 22, "DEGRADED": 2}. Successful HTTP and available archive metadata do not equal fresh news.

## 9. Global-source research

This phase concentrated on the high-leverage website inventory. It did not establish a new licensed global feed. Previously evaluated PR Newswire, Business Wire, AccessNewswire, Newsfile/EQS and exchange-index restrictions remain exclusions; accessible HTML/RSS alone is not commercial automation permission. GDELT remains optional/unreliable. The common workspace tunnel 503 cannot be interpreted as evidence that every external provider is intrinsically down. No paid search/provider was added.

## 10. GlobeNewswire depth and ceiling

Existing publisher-advertised rolling sitemap, permitted topic RSS and explicit monthly metadata-backfill lanes remain supported. No article-body mirror, prohibited search/API or tracker bypass was added. Previous measured monthly results remain in the historical report; the resumed September metadata lane inspected 133 candidate releases, parsed 119 and accepted 67 stories through conservative matching; it used 170 reported requests, 14,678,919 downloaded bytes and 31 retries. The publisher-advertised monthly index contains 11,968 URLs. This is bounded partial backfill, not a complete month or practical ceiling; August/July remained unvisited after the tunnel failed again. Wider permitted metadata archives remain a meaningful leverage point, subject to access and matching validation.

## 11–15. Calls, webcasts, presentations, transcripts and management content

Calls increased 75 → 137, dated calls 71 → 120, webcasts 51 → 111, presentations 95 → 212, transcripts 39 → 64, prepared remarks two → 6, letters five → 11, and any management-content references 72 → 149. Explicit replay/downloaded recording coverage remains zero. Sources retain explicit fiscal labels, date precision/timezone and evidence; unknown call times/periods remain missing. First-party Q4 report archives and GCS/structured event cards provide releases, presentations, company transcripts, remarks and links; documents are referenced rather than unnecessarily downloaded. Historical materials are not promoted as upcoming events.

Public webcast hosts observed include Q4 events, Viavid/Webcasts and issuer-linked YouTube. Public links do not prove recordings may be downloaded, that captions exist or that a transcript can legally be generated. No measured duration/media census or transcription pipeline was completed. A future queue must require permitted recording access, duration/volume caps and a compute budget. At 137 issuers × four annual calls × 60 hypothetical minutes, volume would be 32,880 minutes/year; this is a workload scenario, not observed availability or permission. At 4,869 issuers it would be 1,168,560 minutes/year. First-party transcripts, remarks, letters and presentations are the current alternatives; no paid transcription dependency was introduced.

## 16. Confirmed earnings and calendar preservation

Confirmed upcoming earnings increased **27 → 44**; superseded estimates were retired with existing audit history, reducing active estimates **3,317 → 3,302**. This is not loss of estimator capability or false confirmation. Confirmation-retirement audits and normal future-window retirement/recomputation remain enabled; the estimate-count change is not attributed solely to confirmations. Other historical events/materials do not automatically become confirmations. Financial/SEC extraction and forecast algorithms were unchanged.

Backtest: **3,847 predictions / 1,094 issuers, 95.48% window hit rate**, median 22 days/window and 4 days error. Non-calendar 96.44%; observed 20-F history 87.65%. These include periodic reports and XBRL filing proxies, not just verified earnings releases; this is a reporting-window backtest. The 4,102 sufficient-history population, Berlin handling and confirmed/estimated safeguards remain intact.

## 17. Coverage tiers

- A_FULL: **38 (0.63%)**.
- B_STRONG: **3,261 (53.65%)**.
- C_BASIC: **1,570 (25.83%)**.
- D_LIMITED: **1,209 (19.89%)**.

Component flags remain separate: domain, IR, current news, calendar, calls, materials and management content. Full/Strong gains are modest; domain verification alone does not upgrade an issuer to a richly populated product.

## 18. First pass

Frozen inventory 4,283; **2,291 checkpoint classifications**, **1487 fresh candidate attempts**, **1,992 pending** in this pass. Statuses: {"PRIOR_COOLDOWN": 443, "ALREADY_VERIFIED": 291, "AMBIGUOUS": 70, "DEFERRED": 600, "REJECTED": 476, "VALIDATED": 411}. Reused verified seeds, ambiguity and source cooldowns are not new verification attempts.

The new production CLI checkpoints each completed result serially in SQLite rather than waiting for an entire worker batch. It validates pass IDs and incompatible flags before creating state, keeps deterministic ordering and never silently completes a duplicate-host identity. Network discovery and frequent ingestion remain separate. A later IR pass can resume an issuer whose domain became verified after its initial selection.

```bash
PYTHONPATH=scripts python -m company_intelligence.cli sweep-inventory \
  --root . --state .company-intelligence/state.sqlite --network \
  --inventory-pass weekly-domains-v2 --inventory-lane domains \
  --limit 50 --request-budget 200 --max-seconds 900 --discovery-workers 4
```

Reuse the same pass ID to continue its pending inventory; use a new pass after improvements/eligible cooldown expiry. `--inventory-lane ir` consumes only verified domains and shares the same total batch budget with selected-source ingestion. Research helper checkpoint names used in this phase are retained privately; they are not claimed to be the production CLI's pass namespace.

## 19. Second pass

Sixteen domains were recovered from already retrieved, hash-verified current pages under the stronger ownership rules. A controlled retry of the documented temporary tunnel cohort completed **114 attempts, 22 verified, 34 rejected and 58 deferred**, excluding robots/403 restrictions. A small additional cached recovery and resumed first-pass completions account for the final domain seeds; sets overlap and are not summed as unique coverage. Cached IR replay recovered independently proven partial endpoints/documents without extra network requests.

## 20. Third pass and unfinished ceiling

A targeted current-cache review examined 158 unresolved same-host/`www` alias candidates; no additional ownership was proven in that review. A later stronger-rule cache review recovered one structured legal identity. After the final resumed first-pass batches, another 100 current cached rejection bodies were replayed with no additional accepted owner. The new ranked IR navigation rule reviewed 39 cached sites: five complete replays, 34 partial because required bodies were absent, three new document references and no new source endpoint. This is a targeted second pass, not a completed full-pool rerun. Redirect review examined nine retained responses and independently verified three final hosts (Ares, CVRx and Roblox); six were rejected, including an unrelated gambling destination, a search page and conflicting legal owners. Forty-four redirects lacked current retained bodies in the initial review. A later review inspected 18 retained redirect responses and recovered 11 more domains; seven remained unproven and 50 lacked current retained bodies. Review populations overlap; the 14 accepted redirect recoveries are not counted as 27 unique reviews. No automatic redirect-as-ownership rule was added: each final destination passed the complete legal verifier, and the previously fetched redirect chain had already respected target robots/URL safety. Redirect provenance is preserved in the seed. Twenty-four unresolved groups differ only by conventional www root aliases, but lack sufficient retained ownership evidence; they are not silently accepted. This is not a third complete network pass. Thousands lacked suitable retained cache. The outbound tunnel began failing across unrelated issuers and GitHub around 12:36 UTC; a later successful GitHub GET did not mean full recovery. A real access window around 14:57–15:13 allowed additional successful domain and IR batches and then closed again; the final first-pass checkpoint count and fresh-attempt count below are authoritative. By 15:16 three successive all-deferred domain batches, all-degraded IR batches and identical uncached Apple/Microsoft/GitHub 215-byte Envoy 503 controls demonstrated the tunnel failure again. Completed gains were retained; no access-control or proxy bypass was attempted. Writers were stopped with completed checkpoints preserved. **1,925 unchecked candidates are a real remaining task**, not evidence of exhaustion or legally inaccessible sources.

## 21. Failure clusters

Largest current clusters are insufficient ownership, temporary network/HTTP failures, explicit robots/access blocks, request budgets, redirects and conflicting copyright. DNS/503 do not mean dead domains. The funnel retains causes and timestamps; verified seeds do not report an earlier failure as a current failure. Access restrictions stay on cooldown and were never bypassed. Oversized responses remain refused rather than raising payload caps. Repeated shared tunnel errors are an environmental limitation; increasing polling frequency would waste requests without solving ownership.

## 22. Quality audit and real examples

Reviewed newly enriched mid/small/industrial/healthcare/consumer/foreign cases, not only mega-caps. Kelly now has current company releases and materials; Marcus has a Q2 FY2026 webcast dated July 30; Tenet has an October 29 Q3 webcast announcement and presentations; Nucor has dividend/guidance news and a July 28 Q2 call; Dycom and Unilever expose presentations and company transcripts; Ascent has financial results/investor materials. Twin Disc preserves its non-calendar fiscal Q4. Luxfer has a proven corporate domain but no newly validated IR content and is not counted as news coverage. Tutor Perini subsidiary releases are retained because its verified parent IR publishes them, not because arbitrary subsidiary names were matched.

## 23. False-positive red team

Current-cache revalidation of 162 earlier new-domain proofs reaffirmed 126, retracted one SKY/Champion Homes result for conflicting subsidiary copyright, and could not replay 35 after bounded cache eviction. The latter retain original hashes/evidence, but are not claimed as freshly revalidated. Generic Root/Unity/Block/Toast/Target/Affirm/Meta/Apple/Oracle, legal-prefix collisions and customer copyright references are regression-tested. GOOG/GOOGL share the same issuer identity and output.

A verified SPX corporate site advertised a WordPress feed containing unrelated agency podcasts. The audit removed ten unrelated agency/CMS items, two default/comment entries and 16 non-company marketing/research items across five feeds, removed inappropriate newly preserved sources, then rejected one additional CMS record during final probe merge. Legitimate general research/marketing is not automatically wrong-company content, but is excluded from this company-announcement product. The rules now reject before event/item creation and retain rejection evidence. Tests were added from these actual defects.
The final CMS audit additionally removed the broad event-keyword escape: financial/product words alone do not prove an issuer actor. A stricter pass initially also rejected legitimate Entergy, York Water and BBVA posts; ownership-scoped legal names and tested acronyms restored those without accepting generic Root/Unity/Target prose. Final accepted news is recounted after retractions. Source freshness is recomputed from retained records, actual crawl timestamps are preserved, import time is separate, and feeds with no accepted CMS announcements retry no sooner than daily. Verified event/material feeds retain generic earnings-call titles under their separate parser contracts.

## 24. Requests, repeated runs and recovery

Completed batch reports provide a lower bound of **6,867 requests, 331,819,905 downloaded bytes, 821 cache hits and 149.65 aggregate batch-runtime minutes**; reported retries 1690, conditional 304 responses 0. Interrupted work and individual access probes have incomplete accounting; no fabricated exact full-phase total is reported. This is discovery expenditure, not a four-hour recurring crawl.

Three final normal-prune offline runs each processed all 6,078 issuers in **44.63, 46.82, 45.52 seconds**, with zero network requests/new stories/duplicates/failures, stable item/event/source/alias hashes and generation **376ec9186dd6041c703744e4**. These are deterministic reruns, not a multi-day live pilot.

Fresh local checkpoint recovery preserved hot/cold ledger, source health, aliases, calendar, audit and checkpoints and re-exported the same generation. Snapshot **64,441,554 compressed / 631,057,608 expanded bytes**. Authenticated R2 was not rerun; existing foundation acceptance is unchanged. No R2 credentials were configured in this execution environment and the available GitHub connector cannot dispatch Actions. The private research ledger was deliberately not uploaded to a public Git repository. Remote code/config/evidence preservation does **not** imply the newly expanded private ledger is already stored in R2. Existing workflow expects `VU_HISTORY_S3_ENDPOINT`, `VU_HISTORY_S3_BUCKET`, `VU_HISTORY_S3_ACCESS_KEY_ID` and `VU_HISTORY_S3_SECRET_ACCESS_KEY` (plus established optional region/Cloudflare mechanisms).

## 25. Actions model

News remains 4h, events/calls 12h, materials 12–24h, discovery weekly and blocked retries daily/weekly. No full-universe discovery is placed in the four-hour lane. Current enabled research-registry cadence implies **57,870 source polls/month**, before robots, SEC, provider pages, backoff and event exceptions. A source poll is not necessarily one HTTP request. Source backoff and conditional GET remain enforced.

Six ingestion runs/day means 180/month. Using the prior authenticated pilot's measured 5.55 minutes/run gives **999 Actions minutes/month**; a 10-minute scenario gives 1,800. Neither is a newly measured full-registry recurring runtime. The current completed discovery reports represent about 149.65 aggregate manual/backfill batch-runtime minutes; projecting them as an ordinary ingestion run would be incorrect. Public Linux runner pricing and shared account quotas require account review; no new service or schedule was activated.

## 26. R2 and storage model

A full raw generation is approximately **233.3 MB / 4,985 payloads**, largest raw payload about 324 KB; 5,623 raw assets include 4,985 company payloads and 638 lookup shards. It is not the bounded public pilot release. Two full raw slots plus two ~64 MB private checkpoints would be about **0.595 GB** before indexes/consumer projection/history. Two slots prevent 180 snapshots/month from accumulating indefinitely. The existing bounded 30-issuer public review path remains unchanged; full-universe raw exports are not automatically published.

A pessimistic full-snapshot rewrite each of 180 monthly runs would make **897,300 payload PUTs plus 114,840 lookup-asset PUTs (1,012,140 asset writes)**, before indexes/checkpoints/verification GETs and user traffic. That slightly exceeds the referenced one-million Class A allowance even in an otherwise unused account; at the reference $4.50/million overage rate, the 12,140 extra asset writes alone would be about $0.055/month, not a promise of zero total R2 cost. Actual public projection/pilot asset counts differ from this raw full-generation scenario. Current pilot usage is far smaller. Content hashes skip unchanged destination objects, but generated timestamps can change payload bytes, so zero writes are not promised. Reference R2 free allowances remain 10 GB-month, one million Class A and ten million Class B, shared across the account; these are pricing assumptions, not verified account capacity. Existing 128 MB compressed/1 GB expanded checkpoint guards remain intact.

Storage growth is scenario-dependent: at 1,000 accepted metadata events/day × 3 KB logical/event, history adds about 90 MB/month, 1.095 GB/year or 5.475 GB/five years before SQLite/index overhead and compression. Repeated unchanged runs demonstrated zero item/event growth. Event archives preserve history, but full-ledger checkpoint sizing/sharding will become necessary before guards are reached under sustained high growth; safety caps must not be removed. No generated historical ledger/public snapshots were committed to Git.

## 27. Expected monthly cost

Financial/news provider cost remains **$0**. Inactive gates currently add no scheduled feature runs. Within referenced free-tier/account assumptions a controlled pilot can remain near $0 incremental storage/API cost; broad-source network/runner costs are not guaranteed zero. A planning scenario of 57,870 polls × 80 KB full bodies is about **4.63 GB/month** before 304 savings, SEC, retries and weekly discovery, not measured recurring bandwidth. Conditional requests reduce bytes, not GET counts. No paid database, search, transcript or IR vendor was introduced.

## 28. Tests

Final feature Python: **267 passed**; feature Node: **29 passed**. Added meaningful ownership metadata, conflicting identity, corporate-header evidence, same-host scheduling, serial checkpoint/resume/cooldown, partial IR preservation, historical-failure funnel, unsafe CLI, CMS defaults/comments/agency contamination and generic-name regressions. Existing malformed XML/JSON, unsafe URLs/SSRF, request caps, redirects, source failures, share-class/rename, fiscal/calendar and R2 recovery tests remain in the suite.

One acceptance run overlapped the configuration-preservation writer and failed `ACCEPTANCE_GENERATION_MISMATCH`: its producer inputs changed mid-test. The isolated acceptance suite then passed 32/32 and the final frozen-input feature suite passed 267/267. Assertions were not weakened. Consumer projection parity checks all 4,985 payloads and confirms no presentation/transcript/remarks/letter/webcast coverage is lost; private sources/checkpoints stay excluded. No new UI layout changes were made; the prior mobile evidence remains historical rather than claimed as a new browser run.

## 29. Regressions and current main

Broad Node: **2,569 passed, five existing skips**; SEC/Quant Python: **484 passed**; VU2 Python: **32 passed**; additional serving Node: **66 passed**. No changes to Company Master/universe/Quant/Discover/Supertrader/Screener/Markets/SEC fundamentals/price ingestion/deployment/workflows/UI outside the isolated intelligence files. A test-generated total-return artifact was restored exactly.

The previous Quant reconciliation failures are **resolved on current main**. GitHub current-main SHA `cf23c427665e15c7479998450ef6c7fccc3c217e` and relevant test/data Git blobs (including all 646 instrument records, with two changed records fetched) were hash-verified and tested separately: **13/13 assertions pass**. Native fetch later recovered; an isolated archive of the exact current-main test and its eight data inputs, including all instrument records, also passes 13/13. This is targeted main evidence, not a full-main regression checkout. No unrelated Quant changes were made to this feature. GitHub CI for the first preserved phase commit passed eight workflows. The following structured-identity commit passed six; two unrelated workflow runs were cancelled. Cancellation is recorded separately from failure. Final remote preservation is verified through authenticated Git objects/ref reads with exact local-tree and HEAD comparison; native push lacked usable credentials, and the authenticated connector was used without exposing secrets.


Final remote CI on feature HEAD `9a94d65b1488ed6482bce54768fbd1aca8de658f` passed the isolated **267 Python + 29 Node** feature step. Five workflows passed, including Discover CI/frontend, Quant Browser QA, Quant production pages and Currency/FX. Three workflows failed on the same two unrelated Node assertions: [Quant CI](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37133888785), [SEC CI](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37133888837) and [the combined intelligence check](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37133888790). The SEC Python step passed **486 tests** in that newer merge-tree run. Overall combined product Node results were 2,794 passed / two failed / five skipped; this is distinct from the earlier green local branch baseline.

Both new failures were reproduced with unmodified tests and exact current-main `cf23c427665e15c7479998450ef6c7fccc3c217e` code/data in an isolated native-Git archive: `quant/tests/launch-gates.test.mjs` reports **26 factor-evidence coverage mismatches**; `quant/tests/screener-surface.test.mjs` reports **45 of 50 rows with prices**, below its >90% requirement. The remaining 11 assertions in those two files pass. Initial archive attempts lacked ancillary methodology/smoke source files; those harness omissions were corrected before claiming the final 11-pass/two-failure reproduction. The tests are byte-identical on branch and main. These are different failures from the now-resolved 13 canonical-market assertions, and no unrelated Quant producer, data or assertion was changed. The intelligence workflow's pilot depends on `validate`, so the current combined check prevents a new pilot acceptance run; required GitHub checks are not represented as green.

## 30. Limitations

Large unchecked candidate inventory, common tunnel failures and unproven owner/redirect cohorts remain. Verification is deliberately conservative; legal aliases/official delegated identity may need additional public evidence. No new global licensing permission was obtained. Broad news, calls, materials and transcripts remain sparse; no 80–90% claim is made. Current research data is not a multi-day unattended pilot or broad public publication. Newly expanded private state still needs authenticated workflow/R2 preservation before it can be considered remotely durable production data.

## 31. Next high-leverage opportunities

Resume the remaining 1,925 unchecked candidates when outbound requests work reliably, continue late verified-domain IR discovery, and re-run ambiguous/redirect cohorts only with stronger issuer evidence. Rank the resulting Q4/GCS/native/WordPress clusters before adding vendor adapters. Complete permitted GlobeNewswire monthly metadata backfill and seek explicit automation rights for any currently excluded distributor. These are unresolved substantive workstreams, not cosmetic enhancements or a proven free-source ceiling.

## 32. Readiness

Domains (2.51×), IR (2.10×), webcasts (2.18×), presentations (2.23×) and management content (2.07×) improved substantially. News (1.39×) remains short of the requested breakthrough. Code can merge behind the existing controlled gate; the existing controlled pilot remains implemented, but a new current pilot run is blocked by its combined validation dependency. This phase does not certify broad rollout or complete the deep candidate-pool mission. Unrelated current-main Node failures block the pilot validation dependency; missing new R2 upload credentials and widespread outbound failures also limit fresh operational evidence; coverage remains far below the intended rich product.

```text
DOMAIN-COVERAGE-BREAKTHROUGH: YES
NEWS-COVERAGE-BREAKTHROUGH: NO
CALLS-MATERIALS-BREAKTHROUGH: YES
CODE-MERGE-READY: YES
PILOT-READY: NO
BROAD-ROLLOUT-READY: NO
```

---

# Historical phase reports
# Company Intelligence — news, calls and management-content coverage

Validated **2026-10-03T11:26:28Z** on `feature/company-intelligence-rollout`, PR [#356](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/356). This report supersedes earlier coverage/cadence/readiness measurements below. Initial fetched local/remote HEAD was `a4cb77e3928caeb7203783a1444787357b0399b2`. The feature remains disabled/controlled, PR #356 remains unmerged, and no public schedule or broad deployment was activated.

## Executive result and exact coverage

Current-news issuers increased **117 → 374 (3.20×)**, calls **36 → 75**, company transcript links **18 → 39**, presentations **55 → 95**, verified domains **134 → 306**, and IR pages **87 → 155**. These are measured gains across multiple sparse pillars, with a reusable global news-index lane and issuer-hosted Q4 financial-results adapter. They do **not** reach 80–90% rich coverage: news remains 6.15%, calls 1.23%, and verified domains 5.03%. The practical zero-cost ceiling has not been established; thousands of candidates and deeper controlled metadata backfill remain available. No claim of universal news or transcript coverage is justified.

The authoritative denominator is **6,078 issuer identities**, not ticker rows. Current news is accepted issuer-matched metadata within 180 days; calls/documents may be historical and undated archives remain explicitly undated. GOOG/GOOGL and BF-A/B share issuer identity. Financial freshness remains 180 days and recent material SEC events 90 days. Counts describe the full research ledger, **not already published production coverage**. The actual public review package is separately bounded to 30 issuers.

| Area | Before | After | Absolute gain | Relative gain | Universe coverage |
|---|---:|---:|---:|---:|---:|
| News within 180 days | 117 | 374 | +257 | +219.66% | 6.15% |
| Verified official domain | 134 | 306 | +172 | +128.36% | 5.03% |
| Verified IR page | 87 | 155 | +68 | +78.16% | 2.55% |
| Call identified | 36 | 75 | +39 | +108.33% | 1.23% |
| Call dated | 36 | 71 | +35 | +97.22% | 1.17% |
| Webcast link | 31 | 51 | +20 | +64.52% | 0.84% |
| Explicit replay | 0 | 0 | +0 | — | 0.00% |
| Presentation | 55 | 95 | +40 | +72.73% | 1.56% |
| Company transcript | 18 | 39 | +21 | +116.67% | 0.64% |
| Prepared remarks | 0 | 2 | +2 | new | 0.03% |
| Shareholder letter | 3 | 5 | +2 | +66.67% | 0.08% |
| Any management/call-content reference | 42 | 72 | +30 | +71.43% | 1.18% |
| Active first-party news | 64 | 107 | +43 | +67.19% | 1.76% |
| Active external news | 54 | 162 | +108 | +200.00% | 2.67% |
| Material intelligence | 3,984 | 4,003 | +19 | +0.48% | 65.86% |
| Consumer payload | 4,973 | 4,982 | +9 | +0.18% | 81.97% |
| Financial summary | 4,869 | 4,869 | +0 | +0.00% | 80.11% |
| Fresh financial summary | 3,721 | 3,721 | +0 | +0.00% | 61.22% |
| SEC identity | 5,412 | 5,412 | +0 | +0.00% | 89.04% |
| Recent material SEC event | 594 | 594 | +0 | +0.00% | 9.77% |
| Estimated upcoming reporting window | 3,332 | 3,317 | -15 | -0.45% | 54.57% |
| Confirmed upcoming earnings | 9 | 27 | +18 | +200.00% | 0.44% |
| No consumer payload | 1,105 | 1,096 | -9 | -0.81% | 18.03% |

News freshness after ingestion: **7 days 306 (5.03%), 30 days 337 (5.54%), 90 days 372 (6.12%), 180 days 374 (6.15%)**. The initial 117 count is the immutable baseline; reconstructed earlier bands from original records are not treated as an immutable point-in-time snapshot. First-party and external sets overlap and must not be summed. Registry coverage differs from accepted external stories: one global source serves many issuers. There are **4,283 domain candidates (70.47%)**, not verified domains. Prepared remarks, shareholder letters and webcast references are distinguished from transcripts; explicit replays, downloaded call recordings and standalone management-commentary documents remain **zero**.

## News sources, distribution networks and official announcements

The high-leverage new source is GlobeNewswire's publicly robots-advertised rolling **Google news sitemap**: one source poll reads up to 1,000 explicit headline/date/link entries. A final real request accepted **150 stories / 134 issuers**, rejected **158 promotional/law-solicitation entries**, left 692 unmatched, collapsed two duplicates, and recorded no source failure. The final real recovery used two HTTP requests, **717,486 bytes** and **11.11 seconds**. This is current metadata ingestion rather than per-ticker search. The parser pins the endpoint, rejects unsafe XML/entities and caps the payload. Existing GlobeNewswire topic/country RSS and Wallstreet-online remain complementary, with independent health and matching.

An explicit monthly metadata-backfill lane reads publisher-advertised archive URL indexes, then bounded public NewsArticle metadata. September contains 11,968 URL candidates, **not 11,968 stories or covered issuers**. The final bounded September run made 103 requests, downloaded 8,645,198 bytes, attempted 100 entries, parsed 96, accepted 53 new items and three duplicates, and left 41 unmatched; four per-article fetch failures were isolated. October testing used 153 requests, 9,660,756 bytes and 763.98 seconds, yielding 120 stories / 112 issuers, seven calls and four scheduled earnings events. These separate probe populations overlap the final ledger and must not be added to aggregate coverage.

Access review excludes prohibited paths and providers. GlobeNewswire's `/search`, `/api`, `/JsonData` and `/Tracker` paths are not used; tracker URLs are never decoded or followed. Only headline/date/link, issuer metadata and a bounded scheduling-evidence clause are retained. Downloaded HTML bodies are removed from body caches after metadata parsing; no full article is republished. Public robots-advertised metadata access is the basis for this lane, **not a blanket commercial full-text redistribution license**. PR Newswire and Business Wire terms require permission for commercial aggregation/storage; they were excluded despite accessible feeds. AccessNewswire, Newsfile and EQS restrictions likewise prevented adoption. GDELT remains unreliable with 503 responses and optional. Nasdaq finance RSS and Euronext pages did not yield a validated permitted issuer-wide contract; no new LSE/RNS or exchange feed is counted. This phase does not claim comprehensive international announcement coverage.

## Official-domain verification, IR discovery and reusable families

Existing company master/SEC identities remain authoritative. Read-only logo/website inventory and validated SEC legal aliases enrich candidates; no independent company master was introduced. Domain verification is a bounded weekly lane with at most four workers, per-host pacing, a total request/time budget and durable per-candidate retry checkpoints. Six hundred candidate attempts and 96 bounded IR walks produced the measured gains. Verification requires corporate title plus exact legal identity, or legal copyright ownership plus corroborating corporate brand; conflicting ownership fails. Only the same host's `www` alias is tolerated, not sibling/unrelated redirects. Temporary 429/5xx/network failures defer rather than become permanent identity rejections.

An adversarial cached revalidation of 180 new domain results reaffirmed **135**, retracted **8** for insufficient evidence under the tightened rule, and could not replay **37** after bounded cache eviction. The latter retain their original content hash/evidence; this report does not claim fresh replay validation for them. The eight withdrawals do not establish that their real brands are unrelated; they establish that our stronger proof was insufficient. Domain candidates, blocked access and verified IR pages remain separate. IR discovery currently reports **17 blocked / 12 degraded** results; these are not dead sources counted as active coverage.

| Observed IR family | Issuers with IR fingerprint | Registry issuers / sources | Capability and adapter status |
|---|---:|---:|---|
| Q4 | 46 | 41 / 120 | Generic news/events plus new issuer-hosted FinancialReport service; presentations, company transcripts, remarks, letters and webcast links |
| GCS | 45 | 40 / 70 | Existing generic release RSS and structured event cards, public event/material links |
| STOCKPR | 15 | 16 / 21 | Existing public issuer RSS/events and material navigation; registry/discovery populations differ |
| WordPress | 12 | 12 / 15 | Explicit RSS/index navigation; five stale sources are visible |
| Web Driver | 8 | 6 / 7 | Public provider feeds/events on validated issuer hosts |
| Investis | 3 | 1 / 1 | Validated public source; no unsupported broad API claim |
| Native/generic | 36 | 6 / 7 | Bounded structured/news/event navigation and first-party links |

One embedded Business Wire fingerprint does not mean a Business Wire aggregation adapter exists. Family counts can overlap; they are not a census of all 6,078 issuers. The registry has **251 sources: 200 ACTIVE, 38 UNDATED_METADATA, five EMPTY, five STALE and three INACTIVE**. Q4's 38 undated report-metadata sources are available archives, not active dated news; the `healthySourcePercent` metric counts ACTIVE only. Platform/source failures and parser failures are reported separately rather than inflating coverage.

## Calls, webcast links, presentations and management content

The generic Q4 FinancialReport adapter is derived from advertised issuer widgets or previously validated issuer-hosted Q4 event endpoints. Twenty unrelated hosts were probed with **34 requests, 686,395 bytes, six HTTP 304s (17.65%), zero retries/errors and 183.61 seconds**. Explicit document category/title distinguishes presentation, company transcript, prepared remarks, shareholder letter, financial report and webcast. Vendor `ReportDate` is a fiscal grouping date: it never fabricates publication or call time. Only bounded current/prior/next-year grouping metadata is accepted; links do not create a call date or replay without evidence.

Calls now cover **75 issuers**, **71 with dates**, while webcast links cover **51**. Four undated call references stay undated. Clorox fiscal-2026 prepared remarks and NVIDIA/Curtiss-Wright company transcript links demonstrate management content beyond third-party transcripts. Presentations cover 95 issuers, transcript links 39, prepared remarks two and shareholder letters five; the union of management/call-content references is **72**. Generic “Events & Presentations” navigation hubs were removed from document counts. “No presentation found” is not proof that an issuer does not publish presentations; that denominator is still unknown.

Explicit announcement clauses retain their date/time/timezone evidence. Real examples include Haemonetics Q2 FY2027 on November 5 at 08:00 New York, Valmont Q3 on October 20 at 09:00 New York, Columbia Banking Q3 on October 22 at 17:00 New York and Richardson Q1 FY2027 on October 8 with unavailable time. “Fourth Quarter Fiscal Year 2026” is now preserved explicitly; no calendar quarter is substituted. Calendar confirmations supersede estimates through the existing audit path.

No paid transcript provider, audio downloader or automatic transcription service was added. A public webcast URL does not prove download permission, duration, an open replay, or accessible captions. A future opt-in process should first validate access/permission and obtain explicit media metadata, then select important calls, queue bounded recordings/captions, retain source/evidence and process locally or under an separately approved cost budget. At an illustrative 20,000 annual one-hour calls and 64 kbps, recordings alone are approximately 0.58 TB/year; local ASR at 0.25–1× audio duration would require roughly 25,000–100,000 runner minutes/month. This is a planning scenario, not measured available recording volume. Prepared remarks, shareholder letters and presentations provide immediate zero-provider-cost alternatives.

## Consumer experience, event bundles and quality audits

The existing stock-page integration, exact-period earnings bundles and material SEC categories are preserved. A “Management & Ergebnisgespräche” section exposes available first-party remarks/transcripts/letters/webcasts with original links, honest fiscal grouping and unavailable-date labels. It excludes links already shown by earnings bundles, calls or upcoming events. It does not display empty administrative cards or invent content for sparse issuers.

The public projection audit found and fixed two genuine defects: six recent investor webcast references disappeared after their events passed, and a long BorgWarner report archive hid its transcript beyond the 30-material bound. Investor webcast links now survive as documents without becoming earnings calls or replays. A bounded type-aware projection preserves the latest available management-content types while retaining the same 30-item cap and original ordering. Across **4,982 actual payloads**, raw and public projections retain **95 presentation, 39 transcript, two prepared-remarks, five shareholder-letter and 51 webcast issuers**, with zero lost issuer coverage for these types. This checks public data, not only database counts.

Seeded random review covered CSL, RGLD, HTO/H2O America, PCYO, PRGS, CULP, COKE, HAE, SXT, MYE, KINS, CELU and GATX across small/large, healthcare, software, industrial, financial and unusual-fiscal issuers. HTO's Quadvest acquisition belongs to the renamed master issuer; PCYO's February period is preserved. CULP's March story is outside the 180-day window and not current news. COKE employee profiles remain LOW, not material corporate events. Actual call/time evidence and source ownership were inspected; URL presence is not a claim that every recording was played.

Adversarial review fixed exchange mentions assigning Nasdaq news to NDAQ, Rogers Communications assigning ROG, National Healthcare Properties assigning NHC, Provident Services confusing Provident Holdings, and a crypto cashtag confusing a stock. GlobeNewswire legal-name keywords plus an explicit stock and issuer actor can corroborate Scienture SCNX; keywords alone do not confer authorship. ROOT, U, XYZ, TOST, TGT, AFRM, META, Apple, Oracle and GOOG/GOOGL remain in the ambiguity/share-class tests. Unavailable news stays unavailable rather than generic-word matches filling the feed. Conservative issuer-level deduplication retains provenance; the final ledger has 1,406 retained stories and 178 event aliases.

## Calendar, earnings, material intelligence and tiers preserved

Financial summaries remain **4,869**, fresh summaries **3,721**, SEC identities **5,412**, and recent material SEC issuers **594**. Existing evidence-aware guidance, metric-aware What Changed and material-event importance were not rebuilt. Material intelligence increased **3,984 → 4,003**, separately from broad news. Estimated upcoming windows changed **3,332 → 3,317** as new official confirmations superseded/retired estimates; confirmed events increased **9 → 27**. This is not a calendar-model regression.

The historical backtest was rerun: **3,847 predictions / 1,094 issuers, 95.5% window hit rate, median 22-day window and four-day absolute error**. Non-calendar fiscal issuers achieved 96.44%; issuers with observed 20-F history 87.65%. These targets include 3,372 periodic reports, 431 XBRL filing proxies and only 44 verified release dates: this is a reporting-window backtest, not proof of point-in-time release-date accuracy for every company. The 4,102 sufficient-history population is preserved. Berlin date handling and confirmed/estimated labels remain regression-tested.

Coverage tiers are **FULL 26 (0.43%), STRONG 3,273 (53.85%), BASIC 1,570 (25.83%), LIMITED 1,209 (19.89%)**. Existing STRONG means fresh financials + SEC identity + confirmed/estimated calendar; it does **not** imply news/calls/materials richness. FULL additionally requires current news and recent call/presentation evidence. Limited tier differs from the **1,096 issuers without a consumer payload**; a payload can exist while its evidence fails stronger tiers.

## Repeated operation, fresh recovery and public delivery

Three final normal-prune full-universe runs each processed 6,078 issuers in **45.84, 44.47, 46.14 seconds**, with zero network requests, new stories, duplicate additions or source failures. Item/event/source/alias identities and payload hashes were stable, with **141dd50638120e908f289b52** in all three exports. These are offline incremental/rebuild checks, not three scheduled live source cycles. An early direct verification helper omitted production pruning and re-imported archived filings; the actual CLI already prunes. That harness failure was investigated, corrected and the complete normal-prune sequence repeated without growth.

A fresh local restore recovered exact logical hashes for hot/cold ledger, sources, aliases, checkpoints/audit and state, then exported the identical generation. The checkpoint is **63,540,542 compressed bytes / 620,571,639 expanded bytes**; packing took **20.46s**, restoration **2.47s**. This phase did **not** rerun authenticated R2 acceptance: credentials were unavailable locally; the foundation's existing authenticated fresh-runner acceptance remains unchanged. Local recovery does not substitute for a claim of new remote operation or a multi-day pilot.

The actual release builder and existing public sanitizer generated a **30-issuer / 60-asset / 2,737,788-byte** review package, largest payload **181,144 bytes**. The browser exercised the existing stock surfaces at 390/430/768/1440 px: **82 checks passed (64 responsive, two disabled zero-fetch, 16 adversarial)**. Private ledger, coverage/source health and checkpoints are excluded; generation, path and unsafe-link failures remain fail-closed. This is local production-package validation, not a public rollout. Test-only Clorox routing does not alter the production pilot cohort. Publisher's existing **100-ticker / 250-asset** pilot bound remains intact.

## Low-cost schedule, request/bandwidth and storage model

No cron frequency was increased. Active news/global metadata follows **4h**, events **12–24h**, financial-material sources **12–24h**, discovery **weekly** and blocked sources **daily/weekly with cooldown**. Ten existing feeds retain a slower six-hour interval. Event-aware priority does not override source failure backoff. Newly preserved configurations total **242 active sources**, including 124 machine-discovered, successfully validated additions; 306 domain seeds retain ownership evidence, not hand-written issuer scrapers. Monthly archives are explicitly requested backfills, not four-hour polling.

At configured source intervals, full-registry due polls are **919/day / 27,570/30-day month**, before SEC changed-issuer/index, robots refresh, retries and weekly discovery. A global sitemap costs about 180 normal polls/month, not 6,078 issuer searches. Combined instrumented domain/IR discovery cost 2,415 requests, 120,635,027 bytes, 332 retries and 94.75 minutes; 150 cache hits and 260 memo hits were recorded. This is controlled backfill expenditure, not a recurring four-hour run. Q4's six measured 304s save bytes; the overall discovery set recorded zero 304s. Interrupted early archive probes have incomplete accounting and are not hidden in an invented complete phase total.

Actions planning at the prior authenticated pilot's measured 5.55 minutes/run is **999 minutes/month** for six runs/day, plus bounded manual/weekly discovery. It is not a measured new full-registry scheduled runtime. Disabled scheduling presently adds no automatic executions. Existing public-repository runner policies may cover ordinary Linux execution; account quotas and actual billing are not certified.

For the actual 30-issuer public review size and current checkpoint, two public/private slots total **0.133 GB**. Conservative monthly rewrites are **12,060 Class A PUTs** and **23,220 Class B verification/restore GETs**, excluding user traffic. Hash skipping avoids writes to unchanged destination objects; generated timestamps can still change payload bytes, so zero writes are not promised. Cloudflare's reference R2 allowance is 10 GB/month, one million Class A and ten million Class B operations, shared with other account uses.

The complete raw export is about **226.90 MB / 5,620 assets per generation**. Publishing it every four hours is **not enabled or allowed by current pilot bounds**. A conservative full rewrite would require **1,012,860 monthly Class A** operations, around the free-tier boundary, plus delivery traffic. Controlled cohort delivery remains comfortably smaller. Illustrative ledger growth at 100 accepted news + 1,000 events/day is approximately 43 MB/month, 514 MB/year and 2.57 GB/five years before indexes/compression. HTTP cache stays bounded, exports retain two slots, and cold history must partition before enforced checkpoint capacity as broad event traffic grows. Generated ledger/history/cache/export artifacts are not committed to Git.

**Financial/news data-provider cost remains $0.** No new vendor, paid API, package or recurring transcript/transcription runtime was added. Expected incremental pilot storage/request charges fit reference free allowances if existing shared headroom remains; this is not an account bill or guarantee.

## Failure engineering, security and validation

Per-source/article failures isolate blocked sites, rate limits, malformed XML/JSON, wrong issuer metadata, changed provider markup and network outages. The real rolling source recovered after 503s; source health changed on an actual successful live fetch, not a fabricated replay. Archive checkpoints separate parsed metadata from completed ingestion so bounded interruption resumes safely. Early archive URL-variable shadowing and malformed publisher shapes were fixed; incorrect isolated probe records were discarded and only validated metadata reprocessed. Transient failures defer; restrictive ownership rules retract unsafe coverage. Bounded HTML/XML, entity rejection, URL/path constraints, private-address protections, redirect checks and rendering through safe text/links remain in place. Public output never includes private caches or rejected candidates.

Final feature validation: **236 Python + 29 Node pass**, plus **82 browser cases** and the complete consumer-projection/recovery checks. Existing regressions: **2,569 Node pass / five existing skips, 484 SEC/Quant Python branch pass, 63 serving/Node pass, 32 VU2 Python pass**. Protected producer/deployment paths have an empty phase diff. No tests were weakened, unrelated Quant code altered or broad formatter run.

Current main `268d4c89750ac682a0acc2f6ddbb7b5143fb2959` was independently checked in a fresh worktree: three existing Quant reconciliation assertions fail (`reconciliation=false`, price-history 6,849 versus 6,850, renderable 6,871 versus 6,850). The branch's 484-test suite passes. These main failures are recorded as pre-existing and do not make this isolated Company Intelligence code unmergeable. Test-generated provider-verification output was restored exactly.

Important changed files are isolated source adapters (`news_sitemap.py`, `distributor_archive.py`, `q4_reports.py`, `distribution.py`), bounded CLI/discovery/ownership, consumer `store.py`/`product.py` projection, source/domain evidence configs, stock-section management-content UI, real metadata fixtures and this report. `management-coverage-validation.json` preserves aggregate counts/hashes and a bounded review sample; `management-content-metadata.json` pins three unrelated Q4 issuer responses without document bodies. No operational ledger or credential is published through these fixtures.

## Limitations, next high-leverage work and readiness

The sparse pillars remain far below the long-term goal, including non-US exchange announcements, verified domains, dated calls, replays and prepared remarks. Free/legal source rights and issuer-specific publication patterns limit some approaches, but these measurements **do not prove an absolute zero-cost coverage ceiling**. The demonstrated next large levers are resumable verification of remaining candidate domains, generic Q4/GCS event/result discovery across newly verified IR hosts, and bounded monthly metadata backfill. Permission-based additional distributor/exchange contracts are separate from technically accessible endpoints. This phase provides working scalable lanes and measured gains rather than disguising remaining coverage as solved.

No immediate code-merge blocker remains behind the disabled gate. A controlled pilot is technically ready using existing isolated durable state and publisher gates, with observed live source recovery and local public-package validation. Broad rollout still requires reviewed enablement, repeated scheduled observation across real reporting/provider changes, actual delivery/rollback checks and a deliberately enlarged public publication budget. No multi-day acceptance, audio accessibility or universal company-news promise is claimed.

NEWS-COVERAGE-BREAKTHROUGH: YES

CALLS-MATERIALS-BREAKTHROUGH: YES

CODE-MERGE-READY: YES

PILOT-READY: YES

BROAD-ROLLOUT-READY: NO

---

# Historical coverage and four-hour operations report

Validated **2026-10-03** on `feature/company-intelligence-rollout`, PR [#356](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/356). This coverage-phase report supersedes the cadence, coverage and readiness numbers in the dated historical reports below. The public feature remains disabled. No merge, public activation, paid data provider or protected producer change occurred in this phase.

## 1. Executive result

The largest user-visible gain is **184 → 3,332 estimated reporting windows**, alongside calls **14 → 36**, presentations **25 → 55**, transcripts **10 → 18**, and accepted current-news issuers **87 → 117**. The estimator now serves **3,321 / 4,102 issuers with sufficient original reporting history (80.96%)**; 11 other estimates come from the existing fallback. This reaches the requested range for the evidence-qualified calendar population, **not for news or the whole universe**. News remains 1.92%, and the overall 80–90% rich-intelligence goal has not been achieved. This is a material multi-pillar improvement, not a claim of universal coverage.

The largest discovery lever was already in the repository: the protected logo website inventory. Reading it adds 4,112 current-issuer domain candidates without a network request; merging independent prior candidates yields 4,248 candidates. These are deliberately not counted as verified official domains. Generic Q4 event and GCS/news adapters turn validated sites into calls, calendar confirmations and materials without issuer-specific parsers. Operational state, consumer contract, SEC fundamentals and the existing stock-page integration were preserved.

## 2. Exact baseline and full-universe coverage

Counts below describe the full research ledger at the stated October 3 timestamp, not already published production coverage. The authenticated pilot has a separate cohort ledger and separate source-health results. Denominator is **6,078 issuer identities**, not ticker rows. GOOG/GOOGL share an issuer. Current news uses the existing **180-day** guard, material SEC events 90 days and fresh financial summaries 180 days. “Current news” consequently does not mean news today. Call and material references can be historical. Baseline was refreshed on October 3 before implementation: the prior 186 estimated dates became 184 because two windows had expired. Official-domain baseline includes the 17 preconfigured sites omitted by a bare-master-only query.

| Product area | Before | After | Universe % | Absolute gain | Relative gain |
|---|---:|---:|---:|---:|---:|
| Consumer payload | 4,973 | 4,973 | 81.82% | 0 | 0% |
| Any material intelligence | 3,984 | 3,984 | 65.55% | 0 | 0% |
| Financial summary | 4,869 | 4,869 | 80.11% | 0 | 0% |
| Fresh financial summary | 3,722 | 3,721 | 61.22% | −1 | −0.03% |
| SEC identity | 5,412 | 5,412 | 89.04% | 0 | 0% |
| Recent material SEC event | 594 | 594 | 9.77% | 0 | 0% |
| Active first-party news | 35 | 64 | 1.05% | +29 | +82.86% |
| Active external news | 53 | 54 | 0.89% | +1 | +1.89% |
| Any current news | 87 | 117 | 1.92% | +30 | +34.48% |
| Estimated upcoming results | 184 | 3,332 | 54.82% | +3,148 | +1,710.87% |
| Confirmed upcoming earnings | 4 | 9 | 0.15% | +5 | +125% |
| Call identified / dated | 14 | 36 | 0.59% | +22 | +157.14% |
| Webcast or replay reference | 8 | 31 | 0.51% | +23 | +287.50% |
| Presentation reference | 25 | 55 | 0.90% | +30 | +120% |
| Company transcript link | 10 | 18 | 0.30% | +8 | +80% |
| Verified official domain | 91 | 134 | 2.20% | +43 | +47.25% |
| Verified IR page | 50 | 87 | 1.43% | +37 | +74% |
| Domain candidate only | 891 | 4,248 | 69.89% | +3,357 | +376.77% |

Additional final counts: **31 webcast references, 0 explicit replay references, 0 prepared remarks, 3 shareholder-letter issuers (0.05%), 42 issuers with any management/call-content reference (0.69%)**, 67 earnings pages (1.10%), 40 discovered event sources (0.66%; 38 active), 38 call sources (0.63%), and 64 presentation sources (1.05%). A webcast link is not proof that a recording is still playable. Call content is a reference to materials, not an automatically generated full transcript. There are **1,105 issuers without a consumer payload (18.18%)**, 1,110 without a registered company source, and 5,961 without accepted current news.

The one-summary freshness decline is a date-boundary expiry, not removal of financial facts. Current first-party and external issuer sets overlap; do not sum them as distinct issuers. The full retained ledger holds **727 normalized stories**, up from 436; **609** have timestamps within the same 180-day window, up from 385; historical event counts are not current-event coverage.

## 3. Free-source research and press-release networks

Fresh bounded probes covered GDELT, GlobeNewswire, Newsfile, AccessNewswire, Business Wire, PR Newswire, Nasdaq market RSS, Frankfurt's existing RSS endpoint, EQS, FinanzNachrichten and Investing RSS, plus existing repository news outputs. The active broad architecture remains corroborated GlobeNewswire global/category feeds and the existing optional Wallstreet-online integration; conservative issuer matching preserves original publisher/discovery provenance and stores metadata rather than full article bodies.

GlobeNewswire's advertised RSS worked, but sampled feeds expose only a rolling 20-item window. Four-hour polling can miss intervening entries; it is not a complete market-news archive. **GDELT DOC and robots returned persistent 503s** and remain optional. Newsfile guessed RSS paths returned 404/no data and its [terms](https://www.newsfilecorp.com/TermsOfUse.php) restrict aggregation/storage/commercial reuse without consent, so it was excluded. AccessNewswire robots disallow the tested RSS/API paths; Business Wire tested routes were disallowed; PR Newswire access/reuse suitability remains unresolved. These were not bypassed or added as successful coverage.

Nasdaq RSS was reachable, but commercial reuse permission was not established. EQS guesses returned HTML/404, not a verified feed contract. The repository's Frankfurt RSS endpoint failed DNS. FinanzNachrichten and Investing RSS were reachable but small, mixed-language/macro samples with very few strict company matches; reuse permission was not established, and they were not configured. The curated dashboard news dataset was stale and small; Quant momentum events are not corporate announcements and were not relabeled as news. These results reject particular approaches, **not proof that every legitimate free news opportunity has been exhausted**.

## 4. IR platforms and official-domain discovery

`site_inventory.py` consumes `discover/logos/sites.json` and its evidence read-only. It requires current master identity, unique symbol/credit identity where present, a safe URL, and later independent corporate ownership validation. Social sites, news aggregators, private addresses and ambiguous mappings are rejected. A current identity fingerprint invalidates the checkpoint after relevant ticker/name changes. Q4/GCS/STOCKPR credit fingerprints prioritize discovery; they never establish ownership themselves.

`discovery_batch.py` overlaps independent hosts with 1–4 workers while sharing a two-second global/five-second host gate. Requests are budgeted before launching workers; each issuer and the whole batch have deadlines. SQLite writes occur serially. A deferred batch preserves progress; failure of the IR page cannot revoke an already validated corporate domain. Exact-CIK validated SEC legal aliases improve discovery without modifying the master. Generic IR fallbacks are tried only on relevant validated IR pages, not every corporate homepage.

Observed IR platform issuer counts: **GCS 27, Q4 24, STOCKPR 11, Web Driver 6, WordPress 5, Investis 2, generic/native 19**, plus one Business Wire fingerprint. These are detected configurations, not equivalent counts of active adapters or licensed network sources. Measured source registry: **120 ACTIVE, 3 EMPTY, 1 INACTIVE, 1 STALE**; no parser failures or blocked registered feeds (120/125 sources active: 96%; one stale source: 0.8%). Separately, IR discovery has **10 BLOCKED (0.16% of issuers), 8 DEGRADED (0.13%), 115 VALIDATED (1.89%), 5,945 NOT_CHECKED (97.81%)**. Missing or untested candidates are not counted as success.

Platform health exports source count, issuer count, current failures/parser failures, last success and healthy-source percentage. This percentage is a source-state measure, not a sampled HTTP success rate. The new public source configuration preserves **83 machine-discovered configurations for 53 issuers** with their validation evidence and four/twelve-hour intervals. It excludes private health, checkpoints and article history, allowing fresh runners to reproduce the source registry.

## 5. Earnings calendar and mandatory historical backtest

`reporting_calendar.py` reads existing strict SEC consumer facts and filing events. It preserves fiscal year/quarter, selects original short-lag filings rather than later comparative/restated filings, rejects amendments and contradictory periods, and prefers verified releases over periodic reports over XBRL filing proxies. It requires at least three original observations, comparable annual/quarterly history, stable reporting lag and fresh enough evidence. Annual reports are not mixed with quarterly cadence; stale or changed cadence abstains instead of repeatedly advancing missed quarters.

Forecasts use the prior-year fiscal season where possible, median reporting lag and an explicitly broad uncertainty window. Filing proxies retain a minimum 14-day lead and seven-day trail; all estimates carry **ESTIMATED**, methodology, sample count, target type and evidence. Most output is **PERIODIC_REPORT_PROXY / LOW confidence**, not an official future earnings date. Official confirmation supersedes the estimate in the consumer view while preserving audit history. No time or timezone is invented.

The date-only walk-forward backtest hides every observation filed after each historical forecast origin. It examined **21,618 eligible historical targets** and produced **3,847 predictions across 1,094 issuers**. Results: **95.50% window hit rate**, median **22-day window**, median **4-day absolute midpoint error**. Periodic-report targets: 3,372 predictions / 764 issuers, 95.37%; XBRL filing proxies: 431 / 330, 96.06%. Verified earnings-release targets: **44 / 24 issuers**, 100% in-window, median 21-day window and three-day error; this small selected sample cannot establish universal earnings accuracy.

Non-calendar fiscal years: 928 predictions / 222 issuers, 96.44%; calendar years: 2,919 / 872, 95.20%. Issuers with observed 20-F evidence: 243 predictions / 136 issuers, 87.65%, median 27-day window and five-day error. Listing-country data is US for this universe and cannot establish issuer domicile; 20-F evidence is the honest foreign-issuer proxy used here.

Current model abstentions are recorded in private per-issuer `calendarModel` diagnostics, making missing dates explainable without exposing operational checkpoints publicly: 1,976 insufficient original history, 276 insufficient comparable lags, 337 no future window within the 120-day horizon, 84 unstable lags, 44 stale history, 21 missing prior-year season, 10 changed fiscal cadence, and nine superseded by official confirmation. There are **4,847 issuers with some history; 4,102 with at least three original observations**. Current XBRL data uses latest-known restatements: the backtest is date-gated, **not a certified point-in-time financial snapshot**. Sparse foreign histories and wider windows remain real limitations.

## 6. Calls, webcasts, presentations and call-content alternatives

The new Q4 adapter consumes only a public `Event.svc/GetEventList` endpoint advertised by the issuer's validated evergreen widget script, with a bounded 20-record response. It does not use signed private services or execute provider JavaScript. Real unrelated initial issuers: **GOOG/GOOGL, AXP, BA, CVS, LNT, AVD, ARW and NVDA**. Existing GCS HTML/event patterns remain complementary.

Provider IDs, explicit dates, recognized issuer platform timezone conventions and labeled attachments create deterministic event/material references. Region-based IANA timezones handle DST. Unknown zones, ambiguous/gap times and midnight placeholders degrade to date-only. Historical webcast URLs are labeled **“Webcast öffnen”**, never “recording” without an explicit replay. NVIDIA ordinal fiscal prefixes and Boeing/Alphabet year-quarter title prefixes were real false negatives; normalization fixes retain protections against another issuer named after the prefix.

Presentation/transcript/prepared-remarks/shareholder-letter/report/release links retain provider/source evidence and event relationships. SEC inspection now preserves explicitly labeled same-accession materials already present in downloaded HTML; generic EX-99.2 is not automatically called a presentation. No redundant PDF/full-body ingestion was added. Q4 press-release JSON was reachable but its naive timezone metadata was insufficient, so it was not converted into fabricated UTC news timestamps.

No transcript service or automatic transcription was added. Future recording processing should require confirmed permission and playable recording evidence, a bounded queue, deduplication, duration caps and an explicit compute budget. At 36 issuers × four calls/year × 60 minutes, the hypothetical volume is 8,640 minutes/year; at 4,862 issuers it is about 1.17 million minutes/year. Current webcast references do not establish those recordings are downloadable or reusable. First-party transcripts, presentations and shareholder letters are the current lawful alternatives.

## 7. Material SEC intelligence, summaries, What Changed and guidance

Existing deterministic SEC item mapping, verified-release/candidate distinction, importance filtering and period-preserving financial summaries remain intact. **594 issuers** have recent material SEC events; **3,984** have any material intelligence. CIK coverage alone is not counted as user value. This phase expanded material-document links and calendar usability rather than relabeling routine filings as high-value news. Foreign operating updates remain distinct from earnings.

The existing metric-aware What Changed calculations remain source-backed. In the inspected NVDA FY2027 Q2 payload, gross margin expanded **72.42% → 74.98% (+2.55 percentage points)**; cash and share-count changes remain neutral-direction facts rather than automatic investment judgments. In TSLA's inspected payload, FCF moved **$146 million → −$1.092 billion** and is labeled deteriorated; increased debt is presented as a neutral balance change. These values come from existing consumer facts and carry filing evidence; this phase did not re-extract or overwrite production financials.

KPI and numeric-guidance extraction remains deliberately narrow and evidence-aware. Missing validated KPI/guidance documents are unavailable, not inferred. The coverage improvements do not establish broad ARR/NRR/NIM/segment-guidance coverage, and no unsupported “raised” comparison was added.

## 8. Consumer product, event bundles and quality audit

The existing Quant/Discover stock-page chapters, earnings bundles, prioritized timeline and safe original-source links remain the consumer surface. Estimates stay visibly distinct from confirmations; stale summaries, past calls and empty sections are suppressed or labeled. Provider evidence remains available without exposing CIK/accession/parser terminology by default. The only new UI behavior distinguishes a webcast from a verified recording.

Manual/programmatic cohort review included NVDA, GOOG/GOOGL, ROOT, AXP, BA, AFRM, CHE, MSFT, XPEV, RARE and CRWS, plus generic-name protections for U/XYZ/TOST/TGT/AFRM/META. Examples: NVDA Q2 FY2027 and November 4–27 estimated reporting window; AXP confirmed October 23 call at 08:30 New York / 12:30 UTC; Chemed October 27 results versus October 28 call remain distinct; Affirm's August Q4 FY2026 call is not relabeled a calendar Q3; Root has first-party partnership news and dated calls; XPeng's old FY2025 Q4 summary is explicitly stale with no invented next date. Boeing's fiscal title correction recovered its October 27 call. GOOG/GOOGL share source ownership and issuer evidence.

No wrong issuer was found in this inspected sample; this is **not a universe-wide zero false-positive statistic**. Ambiguous generic names, wrong provider actor, unsafe links, malformed dates, missing timezone and publication/announcement-date confusion have regression coverage. New German financial context accepts explicit “RBC stuft Tesla auf Outperform” evidence without allowing generic-word matches.

**74 browser cases passed** against a freshly built actual release: 56 responsive cases across 390/430/768/1440 px, two disabled-state zero-request cases and 16 adversarial cases. They include unsafe links/content, generation mismatch, stale snapshots, past calls and webcast-not-replay labeling. A stale temporary bundle initially caused an expected past-call assertion to fail; rebuilding canonical assets resolved it without weakening the assertion.

## 9. Coverage tiers

The tiers are exclusive, deterministic and bounded by freshness:

| Tier | Requirements | Issuers | Universe % |
|---|---|---:|---:|
| A_FULL | Current news + fresh financials + SEC + upcoming calendar + recent call/material evidence | 19 | 0.31% |
| B_STRONG | Fresh financials + SEC + upcoming calendar | 3,281 | 53.98% |
| C_BASIC | Financial summary + SEC | 1,569 | 25.81% |
| D_LIMITED | Remaining identities | 1,209 | 19.89% |

“Strong” is a defined coverage tier, not a claim of broad news or transcripts. Older/undated materials cannot promote an issuer into FULL. The goal of most issuers in A/B remains unmet; the expanded calendar moves many into B without fabricating announcements.

## 10. Full-universe performance and request volume

Offline projection/export processed all **6,078 issuers in 44.346 seconds**, making zero external requests and exporting 4,973 payloads. Six controlled live discovery batches consumed **771 requests, 41,716,091 downloaded bytes, 38.47 minutes total**, with 100 cache hits, 223 request memo hits, 51 HTTP 304s and three retries. They ingested 291 new representations and collapsed 447 duplicates. These counters exclude separate source-access research probes. Repeated/deferred attempts mean these are not 80 distinct newly discovered issuers. Early batches included legacy polling; later batches use selected-owned-source polling only, preventing accidental global feed re-polls during issuer discovery.

Immediate incremental poll cycles took 9.516 and 9.542 seconds, each **zero requests, zero downloaded bytes and zero new items**. IDs and event counts remained stable without new input. This proves due-state/incremental stability, not months of scheduled acceptance.

Hot SQLite is **382,140,416 bytes** after the broader historical projection; raw consumer generation **221,508,568 bytes / 5,612 assets**. The final compressed full checkpoint is **61,970,382 bytes** (616,661,517 expanded), restored exactly into a fresh local workspace after the final calendar fix. The local controlled cohort is 21 issuers / 22 tickers / 43 assets, 2,589,843 bytes, largest issuer payload 178,108 bytes. None of the generated history, ledgers or private checkpoints is committed to Git.

## 11. Four-hour cadence, Actions and R2 costs

Normal news/active feeds are **four-hour**, calls/event sources twelve-hour, with infrequent bounded domain/IR rediscovery and low-frequency blocked retries. Confirmed imminent events can make only their relevant source due earlier; the default cron remains four-hour. Preview scheduling is disabled when pilot scheduling is enabled, preventing two parallel six-run schedules. No production flag was activated and no full-universe rediscovery runs every four hours. The committed consumer index is `DISABLED`. Listing repository variables is denied to this integration (HTTP 403), so this phase did not independently certify their remote values or attempt to modify them; manual acceptance does not activate the public product.

The full persisted source configuration plans at most **542 ordinary source polls/day / 16,260 per 30-day month** before SEC changed-issuer metadata, robots refresh, retries and discovery. Filtering to the pilot cohort and global sources gives **74 configured ordinary polls/day / 2,220 per month**; previously durable sources and the listed extra request classes must be counted separately. Observed ledger due-state planning was 501/day; the conservative configuration estimate includes newly reproducible sources. ETag/Last-Modified and 304s reduce bytes, not operation count. Event scheduling is source-level and failure cooldown overrides urgency.

At six runs/day and an assumed four-minute end-to-end run, Actions is **720 minutes/month** (900 at five minutes), plus separate bounded discovery and tests. Scheduled runs skip the full regression job; manual/PR validation does not. The observed authenticated offline pilot took three minutes end-to-end; live polling adds its bounded source-processing time, so the final observed live duration must be used to revise the four-minute planning assumption. This repository is public; standard public Linux Actions ordinarily have no runner-minute charge. These are planning assumptions, not measured monthly bills or a promise about all repository account usage.

Final authenticated pilot planning (42 public assets, two public and two private slots): at most **8,280 public PUTs + 540 private PUTs/month; 15,840 publication verification GETs + 900 private restore GETs/month**, before consumer traffic/download verification. Full-universe planning only (5,612 assets): **1,010,880 public PUTs + 540 private PUTs; 2,021,040 verification GETs + 900 private restore GETs/month**, retained full snapshots about **0.567 GB**; the actual 726,902-byte consumer / 876,439-byte private pilot pair retains approximately **0.0032 GB**. Current controlled delivery limits prevent publishing all those assets automatically. The publisher skips unchanged destination-slot objects by hash; changing generation timestamps can still require many changed payloads, so the full upper bound matters.

[R2 pricing](https://developers.cloudflare.com/r2/pricing/) reference assumptions are 10 GB-month, one million Class A and ten million Class B free, with paid Class A roughly $4.50/million beyond allowance. Verify current account-wide pricing before activation; existing project workloads share allowances. Under these assumptions the isolated pilot is comfortably small; full-snapshot Class A slightly exceeds one million and may cost cents before shared usage. **Financial/news data-provider cost is $0.** User delivery, existing infrastructure and future broad-source growth are not silently included in this claim.

## 12. Storage growth and transcript-processing budget

Public generations retain two slots rather than accumulating every four-hour snapshot. Private checkpoints also use bounded slots; the ledger archives history before pruning hot rows. Current compressed/expanded checkpoint guards are 128 MB / 1 GB, and HTTP cache remains bounded. Broad historical news growth will require archive/checkpoint sizing or sharding before those guards are approached; do not remove safety caps or discard useful history.

Illustrative raw metadata growth at 4 KiB/story and one story/issuer/day: the current 117-news-issuer population adds roughly **14 MB/month, 175 MB/year, 875 MB/five years**; 4,862 issuers add roughly **0.60 GB/month, 7.27 GB/year, 36.3 GB/five years**. These are workload scenarios excluding indexes/SQLite overhead and compression, not observed ingestion rates. Consumer snapshot retention remains bounded; event archives grow with actual history. At a hypothetical 64-kbit/s recording rate, the 36-issuer transcript scenario is about 4.15 GB audio/year, the 4,862-issuer scenario about 560 GB/year, before compute. No such uncontrolled pipeline was enabled.

## 13. Durable recovery, public delivery and operating pilot

A full local checkpoint restored into a clean workspace with exact item/event/source IDs, source health, checkpoints, aliases, audits and generation hashes. Fixed-clock exports were byte-identical. An incremental five-issuer run then wrote updated state, packed it and restored it into another clean workspace: stable identities and source health, exact updated-state hashes. This is full-universe **local compatible-transport** evidence, not an assertion that the 61.8 MB full checkpoint was uploaded to R2.

Authenticated GitHub run [37099418120](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37099418120) passed on this phase's code: a fresh runner restored private state, incrementally updated the controlled cohort, preserved updated state, published hash-verified consumer assets and verified private-path rejection through the browser delivery contract. It restored a 291,329-byte checkpoint and preserved 297,815 bytes; 20 company payloads / 42 assets / 694,157 bytes were published. This run predates the final persisted-source configuration; additional acceptance evidence is recorded below when complete.

The authenticated cohort and the richer local full ledger are separate datasets. Do not present local full-universe coverage as already exposed on the live site. Manual repeated acceptance runs do not prove weeks of unattended operation. Gates remain disabled; broad consumer delivery retains issuer/asset/payload caps, separate private operational prefixes and pointer-last public generation publication.

## 14. Failure behavior, security and regression evidence

Bounded retries/deadlines, per-source health, resumable discovery, stale-state guards, strict actor ownership, safe URL/path checks, external text rendering and provider-response limits remain in place. One blocked provider degrades its sources rather than failing the universe. Tests cover malformed XML/JSON, failed requests, unknown/DST event times, wrong issuer, private URLs, source failure after domain validation, global polling exclusion in discovery, calendar lookahead/cadence/amendments, cohort delivery mismatch, private-path rejection and checkpoint corruption/recovery. No raw third-party HTML is rendered and no secrets/private state were committed or intentionally logged.

Current feature tests: **188 Python, 29 Node and 74 browser cases passed**. Existing regressions on this branch: **2,569 Node passed, five existing skips; 484 SEC Python passed; 63 other serving/Node passed; 32 VU2 Python passed**. No protected producer path changed in this phase. Test-generated Quant verification output was restored; unrelated failures were not “fixed” by changing production data or assertions.

PR merge-tree CI exposed **three pre-existing Quant canonical-market failures**. They were reproduced on unchanged current main **`164fe3369d053e9e69c9f2d6917dc30d45a6f0ed`**: reconciliation false, price-history coverage 6,849 versus expected 6,850, and renderable coverage 6,871 versus expected 6,850. Exact test command: `python3 -m unittest discover -s scripts/quant/tests -p test_canonical_market.py -v` (11 tests: eight passed, three failed). Both Company Intelligence and SEC CI encounter this unrelated imported suite. Subsequent main `ded5e8267` was fetched; the canonical-market test and all eight tested input paths were byte-identical to the reproduced `164fe3369` baseline, so later unrelated logo/Supertrader merges did not repair those failures. Authenticated branch workflow validation/pilot passed. A separate Quant Browser QA run initially exceeded its mobile stock-page resource budget (5,934,606 decoded bytes / 41 requests). The next exact-source run [37100631563](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37100631563) passed all eight budgets (mobile stock: 5,517,804 bytes / 40 requests), without changing the budget or unrelated Quant code. Unchanged current main also passed the full local browser QA: 88 checks, eight resource budgets and 76 accessibility pages with zero violations. The transient extra request was not proven to be a main regression and is not reported as one. The three canonical-market failures remain independently reproduced on current main.

### Authenticated all-issuer recovery across three fresh runners

Run [37101194023](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37101194023) **passed every stage** in its dedicated private `acceptance-37101194023-1` namespace. Runner A rebuilt the actual entire master/existing-facts scope, then preserved a **5,059,164-byte** checkpoint. Runner B restored that exact SHA, verified identities/health/checkpoints/aliases/generation, advanced the real offline projection and preserved **5,145,770 bytes**. Runner C restored the exact updated SHA `70a674d45db781132de63099a1e0f75fd2278cfec88af077f5d76ad817474124` and verified the updated logical hash `dff983856b9be8bb58d65433a82518c4a0d275d7398f43db6e32a4dda6628298` and generation `db7114167c501d5b9c37e98e`.

Event count stayed **3,463**, source count one and event alias count one; no event/identity explosion occurred. The single source and fixture story are explicit private acceptance canaries; calendar/source-health/alias canaries exercise recovery, **not reported live coverage or public content**. Per-run audits appended 666 expected no-SEC-identity diagnostics; this is recorded audit growth, not new company events. Scheduled ingestion does not rebuild all non-SEC issuers every four hours.

This is authenticated **all-issuer existing-facts** recovery, separate from the richer 61.8 MB local checkpoint containing historical submissions/live feeds. The larger research ledger's full exact recovery was locally verified; this R2 test does not imply that particular file was uploaded. The actual live pilot separately verifies real source state and consumer delivery. No acceptance fixture was published. Private checkpoints are never transferred as GitHub artifacts; only sanitized acceptance fingerprints are retained there.

### Authenticated live pilot and discovered scheduling weakness

Run [37100645561](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37100645561) passed after restoring the exact preceding checkpoint SHA `609428a95653b087d051846a5752085c3c8da28f5d01830a62041f11631a0ac4`. It preserved a 465,075-byte updated checkpoint, verified consumer publication and rejected all three tested private paths. Bounded live ingestion made **33 requests / 1,250,040 bytes / five retries**, ingested 98 representations and isolated two source failures (`ROBOTS_UNAVAILABLE:NETWORK_UNAVAILABLE` on non-cohort Dover/Atlantic American sources), stopping safely as **DEFERRED** at 241.363 seconds. The 20 published cohort companies remained 694,157 bytes; many newly checked sources belonged outside the cohort and therefore did not improve that consumer snapshot.

This exposed a real pilot starvation issue when the newly persisted source registry expanded: unscoped owned feeds could consume the time budget before cohort sources. The fix scopes pilot feed polling to cohort identities, preserves global feed polling, and adds independent `--source-tickers` for SEC-stream feed scope without discarding global SEC pending work. Explicit `poll --tickers` now checks those owned sources while retaining its no-financial-projection behavior. The SEC pilot batch is ten changed issuers with at most two document inspections, reserving substantially more of the 100-request budget for relevant feeds. Four integration regressions exercise quiet-cohort sources, unrelated pending SEC work, changed-cohort priority and invalid ticker failure before any request/state creation. Explicit scope prioritizes changed cohort issuers without discarding older unrelated pending work; unscoped operation remains oldest-first.

Observed live pilot job duration was **401 seconds / 6.68 minutes** including restore/publication; repeating that every four hours would be **about 1,203 Actions minutes/month**, not the four-minute planning assumption's 720. The separate manual validation job took 268 seconds and is skipped by scheduled runs. The four-hour source cadence remains unchanged. The subsequent scoped acceptance below verifies the tightened feed scope against real sources. The additional changed-issuer priority and obsolete-estimate fixes were validated by integration regressions and the bounded live SEC probe.

### Scoped follow-up pilot, SEC materials and final integrity fixes

Run [37101855386](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37101855386) **passed validation, restore, preservation, publication and delivery checks** on the tightened scope. It restored exactly the preceding 465,075-byte checkpoint SHA, then preserved **876,439 bytes** with SHA `e73e84bf9bdcd8cbdb915c63b6546577b85b619bb218f7d6c9381f4111331a44`. Ingestion made **21 requests / 1,280,308 bytes / six retries**, used two cache hits and one 304, ingested **30 new representations and collapsed 30 duplicates**. The new input increased events to 186 and stories to 285 in that separate pilot ledger; this is evidence-driven growth, not an unchanged-input repeat.

The consumer cohort increased **694,157 → 726,902 bytes**, with **20 issuer payloads / 21 available tickers / 42 assets**, maximum 183,181 bytes. One requested issuer remains unavailable and is handled honestly. Source processing took 190.943 seconds; the complete pilot job took **333 seconds / 5.55 minutes**, corresponding to **999 Actions minutes/month** at six runs/day, excluding manual validations/discovery. Public gate activation did not occur.

The run correctly reported **DEGRADED**: three owned GCS sources (Chemed events, Root events, A. O. Smith news) encountered `ROBOTS_UNAVAILABLE:NETWORK_UNAVAILABLE`. They were not bypassed or counted as successfully polled. Private pilot source states were **36 ACTIVE, 12 DEGRADED, 5 DISCOVERED, 64 VALIDATED**; this differs from the local research ledger and is not disguised as equivalent production coverage. Failure cooldown and resumability remain in effect. “Workflow succeeded” means publication/recovery stayed safe, not that every source succeeded.

A separate live SEC-stream probe passed with **12 public + six SEC requests**, 228,365 public downloaded bytes, no retries/source/document failures, and 57.290 seconds runtime. Quiet AAPL/Root feed scope coexisted with pending global SEC work; the changed issuer was **AAR / AIR**, an industrial issuer. Real 8-K evidence produced material agreement/securities-issuance and management-disclosure categories without inventing transaction details. A same-accession explicitly labeled **July 21, 2026 AAR slide presentation** was found in EX-99.2; the filing/document URL was preserved without mirroring its PDF. Reusing that cached SEC inspection in the full ledger made **zero new requests**, adding the 55th presentation issuer.

Manual inspection caught an obsolete seasonal fallback: AAR's September 19–October 3 estimate remained visible despite its already published September results. The fallback now excludes future observations and suppresses an already reported same-quarter season even when fiscal year differs from publication year. The estimate is retired with a private **ESTIMATE_RETIRED / ALREADY_REPORTED** audit and actual-report evidence, not silently overwritten. Other-quarter reports cannot suppress a valid upcoming estimate. Four calendar/audit regressions cover these cases; all **188 feature Python tests** passed. Final calendar coverage remains **3,332**, not the temporarily inflated 3,333 before the integrity fix. The large date-only backtest was rerun and retained the same reported metrics.

## 15. Limitations, next large levers and readiness

The requested 80–90% broad news/call/material coverage has **not** been reached. Ownership-validated domains remain 134, even though 4,248 reusable candidates now exist. Most candidates still require bounded responsible validation. Narrow rolling global feeds do not provide complete capture at four-hour cadence; expanding source permissions or finding another explicitly permitted broad feed is a genuine leverage point. Current free-source tests do not prove an absolute free-data ceiling.

The next meaningful lever is sustained, bounded provider-prioritized validation of the existing candidate inventory, not thousands of manual issuer URLs or repeated full-universe search requests. Richer foreign reporting histories and first-party release dates can improve estimate coverage/precision. Call recordings require playable-link/permission verification before transcription. Broad delivery needs validation beyond the controlled cohort and a reviewed archive budget; it does not require fake 100% coverage.

Reproduction commands (run live discovery only with the repository's existing identified User-Agent/network policy):

```sh
python3 -m unittest discover -s scripts/company_intelligence/tests
node --test scripts/company_intelligence/tests/*.test.mjs
python3 -m scripts.company_intelligence.calendar_backtest --root . --state .company-intelligence/state.sqlite --as-of 2026-10-03T05:20:00Z --out /tmp/intelligence-calendar-backtest.json
python3 -m scripts.company_intelligence.operating_cost --sources company-intelligence/config/sources.json --payloads 21 --assets 43 --consumer-bytes 2589843 --checkpoint-bytes 300000
```

The existing CLI's `discover-backfill --help` exposes bounded request/issuer budgets, deadlines and resumable checkpoints; `--discovery-workers` controls host concurrency. Live proof logs, sanitized quality reports and generated full-state artifacts were retained outside committed source under the workspace verification paths. The report deliberately contains aggregate evidence rather than publishing a private ledger.

### Final readiness

- **COVERAGE-BREAKTHROUGH-ACHIEVED: YES** — multiple sparse pillars improved materially, led by estimated reporting windows, calls and materials. The requested 80–90% broad news/rich-intelligence target remains unmet.
- **CODE-MERGE-READY: NO** — feature code is isolated and validated, but PR merge-tree checks remain blocked by the three independently reproduced, untouched main canonical-market reconciliation failures. This is the code-merge acceptance blocker; incomplete optional sources are not substituted as code blockers.
- **PILOT-READY: YES** — controlled automatic workflow execution, authenticated fresh-runner recovery, bounded live ingestion, safe publication and honest degradation have been exercised repeatedly. Repository variable activation requires the owner's available permission; no public flag was changed.
- **BROAD-ROLLOUT-READY: NO** — broad news/call coverage is still weak, multi-day unattended pilot evidence is absent, delivery remains capped to a controlled cohort, and expanded historical ingestion needs an archive/checkpoint budget before reaching existing safety limits.

The last all-issuer offline run processed 6,078 issuers in 44.346 seconds with zero requests after the calendar correction. Final clean-workspace recovery verified logical hash `0a80a51e77ee41437bbbca948fae767727de5a3eda92080a99c57d45f39ee555`, generation `3865798828022a4506e7a761`, 727 stories, 157,651 events, 125 sources and 140 event aliases. Changed source input was incorporated, while obsolete estimates were retired with evidence. These generated histories/checkpoints remain private and outside Git.

 The rollout PR remains unmerged; exact-SHA remote preservation uses the authenticated GitHub Git Data API because this workspace's native HTTPS Git push has no credential helper.

---

# Historical rollout report — 2026-10-02

The following evidence is retained for history. Its hourly cadence and earlier coverage/readiness statements are superseded by the 2026-10-03 phase above.

# Company Intelligence — controlled consumer rollout

Validated **2026-10-02**. Rollout PR [#356](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/356) remains open and unmerged. The foundation evidence is retained below as historical context. This section supersedes its rollout/readiness assessment.

## 1. Foundation transition

PR [#339](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/339), exact head `d3e1a2c6edfbcd42ff03a7038d1a606c03756032`, was verified and merged as **`3a13a31dd41efd65ce34f3b975030d3f715f7d51`**. Required foundation checks and additional merge-tree regressions passed; Vercel's deployment failure was its rate limit, not a code/test failure. The fresh rollout branch starts from that updated main. The committed public index remains `DISABLED`; no rollout flags were enabled and no new rollout PR was merged.

## 2. Executive result and architecture

Existing Quant and Discover stock pages now support an explicitly requested cohort chapter: important recent information, next results, financial summary, What Changed, guidance, calls, upcoming events and evidence/material links. The original ledger, fundamental producers, source registry, SEC stream, archive and checkpoint design remain intact. New `product.py` projects a bounded consumer view; `prepare-public.py` constructs immutable cohort snapshots. R2 consumer storage uses two bounded slots with hash-verified manifests and pointer-last publication. `download-public.mjs` verifies and materializes consumer assets into the **existing GitHub Pages release**. No production API or Vercel dependency was introduced.

## 3. News: measured improvement, not universal coverage

Current accepted news increased **71 → 87 issuers**; first-party **24 → 35**, external **48 → 53**. The hot ledger holds **324 → 436 normalized stories**, of which **385** have publication timestamps inside the 180-day current-news window. News coverage is still **1.43%** and must never be described as universal or daily comprehensive market coverage. First-party structured feeds, the existing optional Wallstreet-online feed and four corroborated GlobeNewswire feeds remain the active architecture. Global feeds resolve many issuers per poll, require publisher/issuer evidence and retain headlines/links rather than full articles.

Three resumable discovery batches processed 75 candidates in 1,407.241 seconds: **331 requests**, 24,305,606 downloaded bytes, 30 cache hits, 47 request memo hits, 16 HTTP 304 responses and six retries. They ingested 82 new representations and collapsed 271 duplicates; ten company discovery failures remained isolated. These batches were bounded and checkpointed, not a blind full-site crawl.

## 4. Reusable source/platform expansion

The new GCS adapter consumes bounded, explicit `nir-event` cards, date fields and issuer-owned event links; it supports observed field variants and dated cards without an event-details URL. It discovers explicit webcast/replay/material links and never invents a time from a publication timestamp. Real unrelated issuers tested: **AFRM, AMAT, AVA, AVT, BOH, BSET, UAL**. GCS added historical calls plus United's confirmed October 21 call and AMAT's date-only investor presentation. Provider fingerprints in the measured ledger: GCS 15, Q4 9, STOCKPR 9, Web Driver 5, WordPress 1, Investis 1 and native/generic 15; these are discovery counts, not claims that every provider has an active feed. Schema.org news-index support was added with ownership and missing-date guards; its live coverage gain has not been established and is not counted as a success.

A real endpoint bug let a generic “News & Events” release link replace the actual events link; discovery now excludes release URLs from event endpoints. Exact-CIK, nonmock SEC legal-name aliases improve Bank of Hawaii/Bassett matching, loaded only for candidate issuers to avoid thousands of unnecessary reads. Fiscal prefixes such as `3Q26` can no longer hide another issuer's name. No new wrong-issuer assignment was found in the inspected GCS/news cohort; this is a targeted audit, not a quantified universe-wide false-positive rate. Generic-name and wrong-contributor regressions remain mandatory.

## 5. Broad-source research and access suitability

Fresh bounded probes: GDELT DOC/timeline both stopped at `ROBOTS_UNAVAILABLE:HTTP_503`; the tested Business Wire path was `ROBOTS_DISALLOWED`; AccessNewswire returned 403. No bypass was attempted.

PR Newswire's advertised RSS now returns 20 entries, contrary to the earlier 404. Its own RSS directory advertises fourteen global/category feeds. Five bounded feed probes yielded eleven candidate representations for nine supported issuers with contributor/listing or multiword actor corroboration. However, [current terms](https://www.prnewswire.com/terms-of-use/) restrict robot retrieval, scraping/republication and commercial use; no clear RSS exception was found. **PR Newswire was excluded from production configuration and the experimental adapter was removed. No PR Newswire probe matches were ingested or counted as coverage.** Clear reuse permission is an external business/legal requirement before using it commercially. Rolling twenty-entry feeds are also insufficient for guaranteed outage backfill. No paid provider was added.

## 6. Material SEC intelligence

The existing deterministic 8-K item mappings and completed-day changed-issuer stream are preserved: agreements/terminations, M&A, financing, restructuring, impairments, listing notices and management/board/compensation changes. **594 issuers (9.77%)** have material SEC events within 90 days. CIK identity alone is not material coverage. Consumer timelines exclude routine `SEC_FILING` rows and candidates; the UI translates categories into investor language. Item 5.02 is deliberately “management, board or compensation”, never an unsupported CEO-departure assertion. Evidence links retain the original filing.

## 7. Earnings experience

**4,869** fact-based summaries; **3,722** within the 180-day freshness guard. Revenue, EPS, margins, net income, operating cash flow, FCF, CapEx, cash, debt and shares retain original facts and fiscal labels. UI skips unavailable values and marks historical summaries. The retained ledger has **77 verified published earnings** versus 75 at the foundation checkpoint; candidate and periodic-report records remain distinct. Large retained historical SEC record counts must not be compared with the older bounded-export counts as if all were new/current events.

## 8. What Changed

Metric-aware display labels supplement the existing deterministic classifications: revenue growth accelerated/decelerated; margins expanded/contracted; neutral cash/debt/share directions avoid automatic investment judgments. Rounding-level `UNCHANGED` results retain that state.

Real NVDA Q2 FY2027: revenue **$96.221B**, EPS **$2.46**, gross margin **74.98%**, FCF **$21.4B**; revenue growth **85.23% → 105.85%**, gross margin **72.42% → 74.98%**. TSLA Q2 FY2026: revenue **$22.496B → $28.236B** while FCF **$146M → −$1.092B** and net income **$1.172B → $1.114B**. These are source-derived period comparisons, not AI-written recommendations. Microsoft and Alphabet preserve their own fiscal labels; GOOG/GOOGL share an issuer without losing instrument identity.

## 9. KPIs and guidance

Existing evidence-aware KPI/guidance extraction remains narrow and conservative. Supported disclosed patterns include deliveries/production, retention and NIM evidence where explicit; no broad SaaS/segment/insurance/retail KPI coverage is claimed. Numeric revenue guidance retains source, period, bounds, confidence and currency ambiguity. The UI shows the latest guidance-bearing event and no longer mixes a prior quarter's outlook into it. NVDA Q3 FY2027 range **105.84–110.16B** is displayed with the existing currency-verification warning. No unsupported “guidance raised” or currency inference was added.

## 10. Earnings calendar

Confirmed upcoming earnings/call coverage **1 → 4 issuers (0.07%)**, estimated windows **186 (3.06%)**. A confirmed call is explicitly labelled a results conversation, not asserted to be the release date. The final consumer review found that already-started calls could remain upcoming for the rest of their calendar day; timed events now compare their start instant with the current clock. Two real-browser attack cases prevent past calls from becoming Next Earnings/Demnächst. Date-only events retain their actual date without invented time. Timed event headings use the same Berlin timezone as their displayed clock: October 24 at 23:30 UTC becomes October 25 at 01:30 Berlin, rather than combining the prior UTC date with the next local time. This boundary passes in both actual stock pages. CHE: release **October 27**, call **October 28, 10:00 America/New_York / 15:00 Berlin** after Europe's DST change. UAL: call **October 21, 10:30 EDT / 14:30 UTC**. Date-only presentations remain date-only. NVDA's **November 14–28** range is explicitly estimated.

Estimation still requires at least three seasonal observations, recent history and bounded dispersion; irregular/sparse issuers remain unavailable. A repeated-run audit found that estimates were deleted/recreated, resetting first discovery. Refreshes now retain matching records, preserve unchanged update/discovery timestamps and audit changed windows, including end-date changes. Earlier lost first-discovery timestamps cannot be reconstructed and were not fabricated.

## 11. Calls/webcasts

Call references **5 → 14 issuers (0.23%)**; webcast/replay references **2 → 8 (0.13%)**, with **46** normalized retained call records. These counts include historical calls. Publication timestamps never substitute for event times; DST ambiguous/nonexistent times remain unavailable. Calls attach to earnings only through existing confident event relationships. Generic `3Q26` card dates do not invent a four-digit fiscal year. A first-party release snippet may establish a separate call only when its call clause contains the same full date: Norfolk Southern’s October 22 release remains date-only, while its explicit 10:00 Eastern call becomes 14:00 UTC. An undated/different-date clause cannot create a call.

## 12. Materials/transcripts

Presentation references **17 → 25 issuers (0.41%)**, company transcript references **7 → 10 (0.16%)**. Reports, releases, presentations, webcast/replays and first-party transcripts remain external links, without duplicate document downloads or paywalled transcript scraping. Reference coverage does not mean every historical link was freshly revalidated. Unlinked materials remain accessible under “additional company materials”.

## 13. Event bundles and timeline

Bundles combine verified releases/reports only on exact issuer, report end, fiscal year and fiscal quarter. Unknown/conflicting periods remain separate; candidates and amendments are excluded. Calls require a verified event link, not temporal proximity alone. Materials retain evidence and deduplicate canonical source URLs even when document labels differ. Linked component timeline rows collapse into an earnings bundle while underlying records stay intact. Material timelines use a 90-day window and omit low-value filing noise. Latest information also includes recent verified results/reports, not only general news.

## 14. Real stock-page integration

Quant adds one disposable chapter hook in `quant/app/page-stock.js`; Discover mounts/disposes the shared chapter in `discover/ui/detail.js`. Their HTML entry points add the isolated scripts/styles. Existing charts and product producers remain unchanged. The twenty-two-ticker cohort is AAPL, NVDA, TSLA, MSFT, XPEV, PLTR, SOFI, ROOT, U, XYZ, TOST, TGT, AFRM, META, GOOG, GOOGL, ACU, CHE, AOS, RARE, PYXS, VEON. Stage defaults to zero; `?company-intelligence=preview` is required for an eligible ticker. The query is an opt-in UI control, not authentication; consumer materials are intentionally public after approved delivery. Missing data degrades without fake cards.

## 15. Mobile and product audit

The actual packaged Pages release passed **56 responsive cases** (seven issuers × two products × 390/430/768/1440 px), **two disabled/zero-data-request cases** and **fourteen adversarial cases**: HTTP 503, generation mismatch, expired snapshot, routine/old-amendment priority suppression, past timed-call suppression, Berlin date-boundary/DST conversion, XSS/unsafe links across both products. No horizontal overflow or browser exceptions were observed. Recorded mobile screenshots and manual reviews covered NVDA, ROOT and CHE. Fixed existing product navigation remains intact. Reports/links, genuine empty states, first-party calendar labels and financial comparisons were reviewed in the real stock pages. Reusable harness: `node scripts/company_intelligence/browser-qa.mjs --url <local-packaged-release> --out /tmp/intelligence-browser-qa`, using existing optional Playwright tooling.

## 16. Public delivery

`v1/company-intelligence/consumer/<pilot-namespace>/` is separate from private `.../state/<namespace>/`. Only manifest-listed index/shard/issuer JSON paths are allowed. Each object is bounded to 512KB and hash-verified on publish and download. Downloads pin current/previous manifests once and recheck the active pointer before any write (three manifest reads, versus per-asset rereads); a pointer swap fails before replacing the disabled index. Two R2 slots retain current/previous generations without accumulating snapshots. Pages copies both retained consumer generations before index replacement, and retains its committed disabled index if preparation fails. No ledger, cache or checkpoint enters the release. Old/mismatched generations fail closed; consumers warn after 48 hours and refuse snapshots older than seven days.

The Pages workflow change is one opt-in read-only projection step under `COMPANY_INTELLIGENCE_PUBLIC_PILOT_ENABLED`; it does not replace deployment. No public pilot gate was activated and the new stock integration is not yet on the public main deployment. `pilot-handler.cjs` is an isolated loopback acceptance harness, not a new production API endpoint.

## 17. Scheduling and cutover

The optional hourly pilot schedule is guarded by `COMPANY_INTELLIGENCE_PILOT_ENABLED` and `COMPANY_INTELLIGENCE_STATE_READY`; both gates must be explicitly reviewed before enablement. Dispatch controls independently select initial creation and network polling. `poll` updates due sources without thousands of financial re-projections. Global distributor feeds have a 30-minute due interval; the pilot's hourly job does not guarantee every rolling-window story. Normal first-party feeds use six hours, event sources 24 hours; confirmed events within 72 hours raise healthy owned-source priority to two hours. Failure cooldowns always win. Scheduled SEC lane checks completed-day changed issuers every six hours in bounded fifty-issuer batches; backlog/age must be monitored before increasing rollout size.

Set `COMPANY_INTELLIGENCE_CONSUMER_NAMESPACE` to a reviewed **`pilot-...`** namespace to carry the same private/public pilot identity across branch-to-main cutover. Without it, a branch-hashed isolated namespace is used; a different branch/main starts a different namespace and strict restore refuses silent replacement. Initialize exactly once by explicit dispatch. Public delivery remains a separate flag. No owner settings, bucket policies, public domains or scheduled flags were changed during this task.

## 18. Authenticated operating pilot

Three authenticated fresh-runner cycles passed: [A](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37022843050), [B](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37024197756), [C](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37026887351). B restored A’s exact 247,772-byte checkpoint and logical hash; C restored B’s exact 280,594-byte checkpoint and logical hash. C wrote 289,807 bytes and retained 157 news, 130 events, 34 sources and 44 state rows, with zero network requests or new records; item/event/source IDs and source-health bytes stayed stable. Both network cycles recorded bounded 240-second deferrals and source failures, while publishing successfully. Consumer R2 → verified Pages files → loopback consumer contract passed all three: 20 available issuer payloads, 21 available tickers, one unavailable, three private paths rejected. These smaller fresh working sets differ from the local 21-issuer historical consumer projection. The final producer `85c9a12ebeef105066c0a2c8acc114dc93a58da7` passed full regressions and [fresh runner D](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37032355229): restored C’s exact checkpoint SHA `5361b77959ecc2e3c053f1644a7e2610f6daa066708fb437512c5e6dbe82bae8` and logical hash `2ef7eeb96a6e724a9bd06eeb73f6783ac155cc5b93e3985315ddc0510425d9f3`, preserved item/event/source/alias IDs and source-health bytes, and wrote verified checkpoint `5f3b1b721e0b9040d700c326d14cbe02e8440eb58f18345bdb857d77f5673d57` (291,329 bytes). Incremental update: 1.201s, zero HTTP/new items/duplicates/failures. Final consumer generation `efbccf1495b2f0f32ea7a757`: 42 assets / 674,684 bytes; Pages downloaded both retained generations, 83 files / 1,349,038 bytes and zero private objects. Bucket privacy checks passed in all four runners. Reduced evidence is committed in `tests/fixtures/rollout-validation.json`. Runs use only R2 artifacts to transfer state, not local disk or Actions cache. A bounded network update may legitimately be `DEFERRED` while publication succeeds; source failures are recorded and isolated rather than hidden. This is short-cycle controlled acceptance, not weeks of production operation, and does not claim that the complete locally accumulated historical ledger was uploaded to the pilot namespace.

## 19. Universe coverage

| Metric | Foundation | Rollout | % of 6,078 issuers |
|---|---:|---:|---:|
| Supported issuers | 6,078 | 6,078 | 100.00% |
| Consumer payloads | 4,973 | 4,973 | 81.82% |
| Any material intelligence | 3,982 | 3,984 | 65.55% |
| Financial summaries | 4,869 | 4,869 | 80.11% |
| Fresh financial summaries | 3,722 | 3,722 | 61.24% |
| SEC identities | 5,412 | 5,412 | 89.04% |
| Recent material SEC events | 594 | 594 | 9.77% |
| Active first-party news | 24 | 35 | 0.58% |
| Active external news | 48 | 53 | 0.87% |
| Any current news | 71 | 87 | 1.43% |
| Confirmed upcoming earnings / calls | 1 | 4 | 0.07% |
| Estimated upcoming earnings windows | 186 | 186 | 3.06% |
| Calls (historical included) | 5 | 14 | 0.23% |
| Webcasts / replays (historical included) | 2 | 8 | 0.13% |
| Presentations (references) | 17 | 25 | 0.41% |
| Company transcript references | 7 | 10 | 0.16% |
| Validated official domains | 65 | 91 | 1.50% |
| IR pages found | 33 | 50 | 0.82% |
| No consumer payload | 1,105 | 1,105 | 18.18% |

Denominator is authoritative issuer identities, not instruments. Material intelligence requires current facts/reports/events/news; identity alone is excluded. “Current news” uses 180 days, “recent material SEC” 90 days, “fresh financials” 180 days. Calendar counts can include a confirmed call. All master listing-country values are US (including ADRs); they are not issuer domicile and must not be presented as a US/non-US company breakdown.

Additional source discovery (not equivalent to usable coverage): earnings pages 41 (0.67%), event-source pages 13 (0.21%; 11 active), call-source pages 16 (0.26%) and presentation-source pages 38 (0.63%). Existing SEC-only event intelligence covers 1,044 issuers (17.18%).

Source registry: **62 total; 59 ACTIVE, 2 EMPTY, 1 INACTIVE; zero registered BLOCKED/STALE/parser failures in the local final snapshot**. Discovery separately reports **10 BLOCKED, 4 DEGRADED, 77 VALIDATED, 5,987 NOT_CHECKED**. Robots/403 discovery candidates are not registered as active successes. The 891 Wikidata domain candidates remain candidates. Authenticated pilot source failures are separate from this local source-health snapshot.

## 20. Before/after and performance

Financial/SEC breadth is preserved; news coverage +16 issuers, first-party +11, calls +9, webcast issuers +6, presentation references +8 and IR pages +17. Final full-universe projection: **6,078 issuers, 4,973 exports, 42.687s, zero requests/failures/new items/duplicates**. Post-fix repeats took **41.989s / 44.440s**; rows/hashes for news/events/sources/aliases and cursor/pending/checkpoint records were identical. SQLite file allocation changed slightly with run metadata; record growth did not occur. Timestamps intentionally yield fresh generation IDs per run. At an identical clock, all **11,223 retained export JSON digests** were identical across repeated complete exports (20.581s combined).

Local reviewed consumer cohort: **21 issuers / 22 tickers, 43 files, 2,554,829 bytes**, maximum issuer payload **178,380 bytes**; total company payloads gzip to **226,562 bytes**, max **15,446** (measurement, not a claim that local test serving enabled gzip). Two retained consumer views: **85 files / 5,153,475 bytes**. No private object was copied.

## 21. Storage and recovery

The accumulated local hot ledger is **366.4MB**, cold archive approximately **201MB**, HTTP cache approximately 75MB and one raw internal generation **215.3MB** (current/previous retained). The public projection is much smaller. Generated history is ignored and never committed to Git. Private checkpoint/R2 pointer-last and restore integrity mechanisms remain unchanged; privacy verification precedes private writes on every authenticated runner.

Illustrative growth using measured mean payloads (1,286 bytes/event, 1,379 bytes/news item), **1,000 regulatory events + 100 news items/day** adds approximately **43MB/month, 520MB/year, 2.6GB/five years**, before SQLite overhead and compression. This is an explicit planning assumption, not a measured production arrival rate. Public current/previous snapshots do not accumulate per run; fixed 62-source metadata is roughly 51KB, cache/checkpoint caps remain enforced, and old rows move into archive before deletion. Archive partitioning must precede the existing enforced state/pack limits at sustained universe scale; it is unnecessary to redesign storage for the present small cohort.

## 22. Security and failure engineering

External HTML is rendered only via text nodes; unsafe/credential-bearing/private-network URLs are rejected. Existing XML entity/oversize, safe redirects/DNS/SSRF, cache integrity, timeout/backoff and malformed-input tests remain active. Consumer allowlists cannot address private paths. Invalid/nonpilot namespace overrides fail before credentials or network access. Partial object upload leaves the active pointer intact; corruption, expiry and permission failure do not initialize replacement state. Two-slot publication is serialized through the existing workflow concurrency group. A stale retained browser generation can fail unavailable during a later slot rotation; it cannot return mismatched bytes. Secrets remain existing Actions bindings and are not written into artifacts or logs.

## 23. Cost

**Financial/news data-provider cost: $0.** No new package, database vendor or paid data subscription. The repository is public; standard GitHub-hosted Actions use its existing public-repository infrastructure. An enabled hourly pilot might consume roughly 72–192 runner minutes/day depending on network deferral, checkout and R2 work; gates currently prevent activation. At measured source cardinality, indicative due polls are 4 × 48 global distributor + 40 × 4 first-party + 15 × 1 event + 1 materials + 4 Wallstreet-online requests/day (~372 before robots/retries), not 6,078 issuers × every source. Cohort R2 storage and request volumes are small; actual charges depend on existing account usage/free-tier headroom. The task did not change vendor plans.

## 24. Tests and protected-system regressions

**144 feature Python + 29 feature Node tests pass.** Existing suites: **2,569 Node pass / five existing skips; 484 SEC; 63 additional Node/serving; 32 VU2 Python**. Final broad Node rerun passed. Workflow YAML/shell validation, production packaging and browser gates pass. No test was weakened. The initial attempt to route frontend delivery through Vercel violated the actual Pages boundary and was corrected before commit; PR Newswire was excluded after terms review. The calendar audit failure was fixed, not hidden.

One Quant browser resource-budget job failed on mobile (5,967,969 decoded bytes), including an additional 416,861-byte existing Discover image. The **unchanged rerun** passed: 5,551,108 bytes, all eight budgets, 88 browser checks and 76 accessibility pages with zero violations. An independently packaged exact-main build (`3a13a31d`) also passed, stock 5,530,392 bytes. The tested `85c9a12e` revision adds 20,716 decoded bytes and one stylesheet request to the measured default stock route; there are zero intelligence-data requests when disabled. These observations demonstrate a timing-dependent resource measurement, not a proven test failure on main. The original failure and rerun remain in the reduced evidence; no resource budget, test assertion or unrelated image was changed.

Allowed production-path changes are the four stock-page HTML/hook files, the opt-in Pages download step and two source-line references in the currency audit register. A strict comparison permits only those audit-line shifts, rejecting changed findings or classifications. Company Master/universe, SEC fundamentals, prices/EOD/intraday, Quant calculation, Discover data, Supertrader, Screener, Markets, existing APIs/server, Vercel and release packager logic remain unchanged. Regression-generated provider metadata was restored. Currency CI additionally found two source-line references shifted by the Discover hook; only those two audit-register line numbers were updated (no finding/classification/currency logic changed).

## 25. Limitations, readiness and meaningful next gates

No immediate code-merge blocker remains after final CI and authenticated acceptance. Controlled pilot tooling is ready, with explicit initialization, isolated restore and independently gated publication. Broad enablement still needs: review/merge of rollout code (not authorized here), intended main pilot namespace/flags selected, repeated scheduled observation over real reporting/source-change windows, and a delivery health/rollback check on the actual Pages deployment. The consumer publisher currently enforces a 100-ticker pilot cap; enlarging that scope needs deliberate shard/budget validation rather than removing its safety bound. These are operational rollout gates, not requests for 100% coverage.

Broad news and confirmed calendar/call discovery remain sparse; the product must expose per-issuer depth honestly. A universal broad-news promise is unsupported. Commercial PR Newswire use requires permission; GDELT/blocked distribution sources remain optional/unavailable. Guidance/KPIs are narrow; exact evidence relationships leave some materials unbundled. The authenticated pilot initializes a fresh small working set and does not include the entire accumulated local historic archive. Long-term archive capacity must be addressed before enforced limits, and no long-running acceptance is inferred from four short-cycle runs.

## 26. Readiness

**CODE-MERGE-READY: YES** — additive, disabled-by-default code with full feature/regression, browser and authenticated durable-delivery acceptance.

**PILOT-READY: YES** — manual controlled cohort tested across four independent runners; gated hourly operation, explicit initialization, strict namespace restore and verified consumer delivery are implemented. Flags are not enabled automatically.

**BROAD-ROLLOUT-READY: NO** — actual main/Pages cutover and rollback check, scheduled observation across real reporting windows, and deliberate cohort/shard-budget expansion remain necessary. No claim of universal news or calendar coverage.

Rollout PR #356 remains unmerged. These judgments do not authorize public enablement or merge the rollout PR.

---

# Historical foundation acceptance (Phase 3)

Validated **2026-10-02**, continuing the fetched, exact local/remote baseline `0cb2179b34580351ab8d07f04420b702c107a4f4` on `feature/company-intelligence-engine`. Original production architecture baseline: `18bc2dddfaebcf3ec97079364f1203c2c09f83cb`. Foundation PR [#339](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/339) was subsequently merged on 2026-10-02 as `3a13a31dd41efd65ce34f3b975030d3f715f7d51`. The Phase 3 measurements below remain historical baseline evidence. This report supersedes the Phase 2 readiness assessment; prior measured evidence remains in `tests/fixtures/phase2-validation.json`.

## 1. Executive result

Authenticated private R2 recovery now works across separate GitHub runners. A completed-day SEC event stream discovers changed issuers globally, without modifying the existing fundamentals producer. It drained **1,063 unique supported issuer checkpoints** and surfaces recent material SEC disclosures for **594 issuers**. The complete universe produces **4,973 payloads**, with recent material intelligence for **3,982 issuers (65.51%)**.

News improved from 219 to **324 normalized stories**, with **71 issuers** having current accepted news. Strict first-party coverage is **24 issuers**, external coverage **48**. This is useful progress, not a universal-news breakthrough. The engine is suitable for a controlled, disabled-by-default merge; broad unattended public rollout still needs a production namespace pilot and a source/scheduling delivery strategy that meets the desired news experience.

## 2. R2 / durable state

Existing signed S3/R2 and filesystem drivers remain unchanged. New `acceptance.py` and `privacy.mjs` use `v1/company-intelligence/state/acceptance-<run>-<attempt>/`, separate from regular `branch-<SHA256-prefix>` state. No unrelated object, bucket policy, managed domain or custom domain was changed.

Authenticated runs [36985311979](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36985311979), [36988290710](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36988290710), and [36993714354](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36993714354) passed validation and all three fresh-runner jobs. The first tests `d829b2f1`; the second `3bcf5d0d`; the third `2e4bfd75`. Earlier producer-revision acceptance on frozen core `0e18e22d335ff6182094d961773febef434eb4e3`: **PASS**, all three fresh runners and validation succeeded ([36994296782](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36994296782)). The unchanged producer was tested with version-aware generation recovery.

In cohort mode, runner A starts empty, refuses an existing test namespace, projects actual AAPL/ROOT data and a recorded Root headline fixture, and stores explicitly labelled private calendar/alias/health/checkpoint canaries. Runner B receives only the safe hash/count artifact, restores exclusively from R2, verifies exact table hashes, regenerates the same consumer generation, runs another real offline update and writes a new checkpoint. Runner C restores the exact updated checkpoint and generation. News/event/source/alias identities, failure health and queue/cursor fields remain intact. Canaries never deploy.

The second run recovered 1 news item, 43 events, one source, one alias and ten state rows; its updated state had eleven state rows. Updated generation `46e823825f319491227600cd`, logical hash `ff177b5e7fc0f7b733051149b10f9e8936dbcd21a36702d1fa0b07d7d0e963b0`, restored snapshot SHA `0e28dd2451cc2db50fa391b4b15f269dcd0c6b3943ac9f7094ae70fda9a6c50a`. These are bounded authenticated tests, not a claim that the full historical pilot ledger was uploaded to R2.

The final whole-universe local acceptance used all **6,078 authoritative issuers** and existing financial facts, with no external-source polling. A → B incremental update → C exact restore passed in **38.78 seconds**. Updated checkpoint: **4,119,312 bytes compressed / 51,992,674 expanded**; recovered tables: one fixture news item, 208 events, one source, one alias, 11,498 state rows and 1,332 audit rows. This initializes an actual full-universe working set; it is distinct from the larger historical/network pilot below.

Authenticated **full-universe** acceptance also passed on `475a3b8b931c3848fcdf4817ab130ea25a053879`: [37002931001](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37002931001), validation plus all three independent runners. A uploaded 4,047,707 bytes; B restored A solely from R2 and uploaded 4,102,610 bytes (51,992,674 expanded); C recovered exact updated generation `4f6ec2637dbe6ea07889c122` and logical hash `84b5792f41566e0e1034d29da3920e33a796711842889d7a507d54c15401d7c9`. Updated checkpoint SHA `f4a599f3867ec1fe95bcd927c3379ef52b4a07fc1e40c2f4ff123c228627a42a`. Counts were 1 news item, 208 events, 1 source, 1 alias, 11,498 state rows and 1,332 audits. Bucket privacy checks passed before state operations in every runner. Reduced evidence: `tests/fixtures/r2-acceptance-universe.json`.

The final engine (including reported-financial-snippet verification) passed the same authenticated entire-universe sequence on `338b98a80d898523e927694ff49ca2120142e487`: [37006169174](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37006169174), validation and all three fresh runners. C recovered B’s exact generation `260c9aa802bd0e308feb5aaa`, logical hash `63e578d7ca0a2181cd840474cd031240cf195c494f6d81a4167290a9aff9ecaf` and updated snapshot `02fa0590997d2fe627beee2a796c9ec0a3db86abaddd792c645e20508ddb2959` (4,102,375 bytes). A prior final-HTML-parser proof also passed on `4957a5ca` ([37004162689](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37004162689)). Together with earlier cohort runs, seven authenticated acceptance workflows passed. Safe hash/count fixtures retain all proof stages; no private ledger crossed an artifact.

The full historical ledger separately passed local fresh-directory restore: approximately **61.2 MB compressed / 600.0 MB expanded**, exact logical state, cold archive and regenerated consumer generation; packing ~19.4 seconds, restoring ~2.4 seconds. Transport scope is explicit in committed evidence.

## 3. News coverage and research

Four public GlobeNewswire RSS polls share one reusable distributor adapter and the existing global Wallstreet-online feed remains optional. GlobeNewswire original contributor plus unique master ticker/exchange identity must agree; the global source is never declared an issuer-owned feed. Headlines, URLs, timestamps and metadata are retained, not publisher article bodies. Official IR/newsroom feeds remain the highest-quality tier.

Controlled probes found GlobeNewswire RSS usable; advertised PRNewswire RSS returned 404, guessed Business Wire/Newsfile endpoints returned 404 and AccessNewswire returned 403. These results do not prove that all endpoints from those vendors are unavailable. GDELT again returned repeated 503 responses and remains inactive/experimental. No bypass or paid provider was added.

GlobeNewswire feeds returned **20 entries**, including when a larger record count was requested. Legacy subject-code labels did not reliably describe every returned story. Industry variants returned 400. RSS documentation/terms URLs included soft-404 HTML, so no independent commercial-reuse licensing certification is claimed. Access is public, feed-oriented and robots checked; the product stores metadata and links. The 20-item rolling windows and six-hour pilot schedule cannot guarantee completeness. Missing or rolled-off stories are not counted as coverage. Final robots-aware HEAD probes returned 200 for nine representative originals: Ultragenyx/GlobeNewswire, CVS, Entergy, Apple, Root, Chemed and the Tesla Wallstreet-online story, A.O. Smith and Pyxis; other links are not claimed certified.

## 4. Source platforms and ownership

Observed IR families now: **GCS 10, Q4 8, STOCKPR 7, WEB_DRIVER 2, GENERIC 9** issuer configurations. Counts can overlap. Existing adapters are extended through empirical advertised endpoints, not thousands of issuer-specific scrapers. Three bounded candidate rounds selected 25 companies each, preserving attempts and partial progress. Official domains rose **46 → 65**, IR pages **22 → 33**. CVS and Entergy newly discovered feeds then returned ten and fifteen accepted stories with two feed requests. The third batch found a further issuer feed and ten issuer stories, alongside ten newly matched distributor stories. A subsequent global poll reached another ten matches. New Pyxis financing and Alta dividends were relevant; Nasdaq employee-inducement grants stayed routine, and did not contaminate NDAQ matching.

Ownership remains master-authoritative: exact CIK, validated corporate names/domains, official navigation, issuer-scoped feed resolution and explicit delegated materials. A corporate homepage is not an IR page. Wrong-contributor/stock/exchange metadata, unrelated redirects and scoped feeds containing other issuers fail closed. An issuer-owned announcement about a subsidiary, partner or another named company cannot confirm the parent’s earnings calendar. The 891 Wikidata domain candidates are still candidates, not active sources. Public bootstrap configuration additionally records 28 automatically discovered and successfully ingested first-party feed endpoints, preserving source IDs/issuer IDs/advertised ownership evidence. These are reproducible seeds, not 28 newly covered issuers: duplicates/overlap exist, and active coverage requires a new successful fetch. Private health, checkpoints and ledger rows are excluded from the public bootstrap; fresh runners can reuse discovery work without recrawling every issuer.

## 5. Material company intelligence

Current material coverage combines fresh financials, verified recent reports/releases, material SEC item disclosures, HIGH/CRITICAL matched news and confirmed upcoming earnings. CIK identity, an empty feed and an unverified candidate are insufficient. Financial/news freshness is 180 days; material SEC freshness is 90 days. Historical documents/calls remain accessible and are reported separately.

One `MATERIAL_SEC_EVENT` bundle represents each qualifying 8-K accession and retains item codes, filing date, evidence, source link and deterministic classification. **17,657 retained material bundles** include historical data. This count is not today's news or a count of independently verified transaction facts.

## 6. SEC enrichment and global discovery

`sec_stream.py` reuses the existing SEC HTTP client, rate limiter, cache and master-index parser. It scans at most three completed index days per normal run, joins exact master CIKs, transactionally records a durable queue/cursor and refreshes only changed issuers. Current-day indexes are excluded. Compact SEC metadata survives fresh runners; production SEC archives and fundamentals outputs remain read-only.

Mappings include 1.01/1.02 agreements, 1.03 bankruptcy, 2.01 acquisition **or** disposition completion, 2.03/2.04 obligations, 2.05 restructuring, 2.06 impairment, 3.01 listing-compliance notices, 3.02 equity issuance, 3.03 rights changes, 4.01 auditors, 4.02 accounting non-reliance and 5.02 management/director/compensation disclosure. Item 5.02 does not prove a CEO departure; 3.01 does not prove actual delisting. 7.01/8.01 alone stay ordinary filings. Item 2.02 uses the earnings verifier.

An actual SEC index revealed `File Name` headers and compact YYYYMMDD dates; the parser was corrected and regression-tested. 403/404 index days become audited retry gaps, rather than falsely healthy empty days; later completed days continue. Corrupt headers/500/timeouts do not silently advance. Wrong response CIK is rejected before durable metadata is written. The normal stream now initially imports only 180 days of submissions, preserving previously retained history; explicit backfills remain bounded and resumable.

## 7. Earnings intelligence

Existing SEC/XBRL consumer facts still provide **4,869 summaries (80.11%)**, **3,722 fresh (61.24%)**. Revenue, EPS, net income, gross/operating profit and margins, operating/free cash flow, CapEx, cash, debt and shares remain unit/period/accession checked. Missing values stay unavailable. Values are latest-known retrospective data, not certified point-in-time facts.

The ledger now has **75 published releases**, **11,654 unverified candidates**, **14,809 periodic reports**, and **4 operating updates**. The large historical candidate/report counts came from the controlled wider metadata backfill; candidates are never counted as published earnings. A 6-K description alone now produces a candidate. Two legacy Unilever descriptions were corrected while preserving IDs/filing links/dates. Document contradiction cannot be overridden by a convenient description.

Official or corroborated issuer-authored distributor releases can establish publication, with explicit evidence. Generic quarter-results titles additionally require at least two reported numerical financial metric families in the source-provided snippet; guidance-only/future snippets do not qualify. This recovered A.O. Smith Q1/Q2 2026 with explicit March 31/June 30 periods and existing SEC-derived summaries, without extracting invented values from news; subsidiary/partner results cannot certify parent earnings. A weaker SEC candidate cannot revoke independently verified first-party publication. Future-tense releases, board review/approval dates, operating results and clinical-phase results cannot establish published financial earnings; board-review-only dates cannot confirm an earnings calendar event. Fiscal labels/report ends come from evidence; no quarter is derived from an 8-K calendar month.

## 8. What Changed, guidance and KPIs

Quarterly YoY/QoQ require compatible units and plausible gaps. TTM sums contiguous quarterly flows, excluding balance values and EPS. Nonpositive bases and fiscal changes expose comparability reasons. Revenue acceleration compares two observed growth rates; margins use percentage-point changes. FCF changes preserve negative values. Cash/debt/share-count direction is neutral pending context; share count alone does not prove dilution or distinguish a split/buyback.

Narrow explicit-period numeric guidance retains bounds/midpoint/unit/currency/source/evidence/confidence. NVIDIA Q3 FY2027 revenue evidence remains 108B +/-2%, bounds 105.84–110.16B; bare `$` remains unverified currency. No invented raised/lowered judgment. The extensible deliveries/production/retention/NIM framework rejects ambiguous comparative numbers and uncertain periods; broad real KPI coverage is not claimed. Classification `rules-1.3.0` now recognizes explicit regulatory applications/European Medicines Agency announcements without calling a submission an approval. Coverage and exports use the same current classification.

## 9. Calendar

**1 (0.02%)** issuers have confirmed upcoming release/call evidence. **186 (3.06%)** have estimated windows; there are **202 retained estimated-window events**. Estimates use actual historical release/report dates and fiscal cadence, require sufficient stable history, and retain methodology/confidence. Unknown dates stay unknown. Amendments/comparative fact revision dates do not fabricate reporting history.

Chemed's release remains **October 27, date-only, following market close**; its call is **October 28, 10:00 America/New_York / 14:00Z**. Reporting-period end September 30 is not the event date. Official reschedules and estimated-to-confirmed transitions keep audit history. Floating/ambiguous/nonexistent DST times are rejected. Confirmed and estimated statuses remain distinct in every consumer view.

## 10. Calls / webcasts

**17 normalized calls across five issuers**, six issuers with a call endpoint/event and two with webcast/replay links. These references may be historical; they are not seventeen upcoming calls. Same-date linkage remains supported; unique explicit issuer/fiscal-quarter/fiscal-year evidence now permits a release-to-call gap of up to seven days, including Chemed's next-day call. Conflicts, amendments, missing periods and estimates do not authorize linkage. Planned release links use `scheduledEarningsEventId`, published links `earningsEventId`.

## 11. Materials / transcripts

Consumer reference counts are bounded views, not unique hosted-document totals:

| Type | References | Issuers |
| --- | ---: | ---: |
| COMPANY_TRANSCRIPT | 14 | 7 |
| EARNINGS_RELEASE | 88 | 41 |
| FINANCIAL_REPORT | 6,788 | 1,022 |
| OFFICIAL_COMPANY_EVENT | 47 | 8 |
| OFFICIAL_EARNINGS_RELEASE | 24 | 15 |
| PRESENTATION | 40 | 17 |
| SEC_EARNINGS_EXHIBIT | 55 | 26 |
| SEC_FACT_FILING_REFERENCE | 10,419 | 4,021 |
| SEC_FILING | 42,814 | 1,083 |
| SEC_PRIMARY_DOCUMENT | 60 | 27 |
| SHAREHOLDER_LETTER | 5 | 3 |

Issuer coverage: **17 (0.28%)** with presentation references, **7 (0.12%)** with company transcript references. First-party pages explicitly delegate PDFs/CDN materials; publisher news links are not blanket delegation proof. Unknown dates/periods stay null. Existing SEC reports are linked without duplicate hosting. Prepared remarks/shareholder letters are distinguished from full transcripts. No paid transcript source or paywall bypass.

## 12. Timeline and consumer experience

The additive contract retains schema `vu-company-intelligence-1.0.0`, listings, news, earnings/candidates, events, calls, filings, materials, financials and timeline; optional `materialEvents` is issuer-validated. SEC filing groups expose related event IDs. Rich material/report/release events suppress the corresponding generic filing timeline entry; richer provenance/documents remain accessible. News-to-release grouping requires reliable same-issuer period/date/source evidence.

Immutable generation hashes now include the producer revision as well as state/authoritative identities/timestamp: new classification code cannot overwrite an older immutable snapshot. Current and previous public snapshots are retained; no generated history is committed to Git.

The standalone preview shows recent material SEC disclosures, news, confirmed/estimated upcoming events, verified releases/periodic reports, current or stale financials, What Changed, guidance, materials and calls. It hides unverified candidates from the earnings-result display, labels unknown material periods and limits displayed references. External strings use DOM textContent; checked links carry noopener. Default-disabled preview makes zero data requests. Production stock pages/APIs/deployment remain unchanged.

## 13. Full-universe coverage

Denominator is issuer identity, not listing rows. Share classes such as GOOG/GOOGL share issuer facts while retaining distinct listings.

| Metric | Count / universe percentage |
| --- | ---: |
| Total issuers | 6,078 |
| Consumer payloads | 4,973 (81.82%) |
| Fresh financial summaries | 3,722 (61.24%) |
| Any recent material intelligence | 3,982 (65.51%) |
| Active first-party news, with accepted owner stories | 24 (0.39%) |
| Active external news | 48 (0.79%) |
| Any current accepted news | 71 (1.17%) |
| Authoritative SEC identity | 5,412 (89.04%) |
| Refreshed SEC submissions | 1,081 (17.79%) |
| Recent material SEC disclosures (90 days) | 594 (9.77%) |
| Confirmed upcoming release/call | 1 (0.02%) |
| Estimated upcoming earnings window | 186 (3.06%) |
| Call references | 5 (0.08%) |
| Webcast/replay links | 2 (0.03%) |
| Presentation references | 17 (0.28%) |
| Company transcript references | 7 (0.12%) |
| IR pages | 33 (0.54%) |
| Official domains | 65 (1.07%) |
| No consumer payload | 1,105 (18.18%) |
| No current news | 6,007 (98.83%) |

There are 666 issuers without a verified SEC identity (10.96%); this is separate from no-payload coverage. Registry: **42 sources; 39 ACTIVE, two EMPTY, one INACTIVE**, zero current feed parser failures, blocked registered sources or stale registered sources. Discovery separately has **ten BLOCKED, three DEGRADED, 52 validated bounded walks**, with other issuers not walked. Never count blocked navigation as a live feed. There are 25 active registered issuer news feeds but only 24 issuers with qualifying fresh owner news; the stricter number is the product coverage metric. First-party and external coverage overlap for one issuer; they must not be added as disjoint totals.

Master listing-country labels are US even for ADRs; they do not establish issuer domicile. Exchange/family groups overlap for multi-listings. No unsupported market-cap or US/non-US breakdown is invented. Coverage JSON retains reasons, statuses, endpoints and source evidence.

## 14. Before / after

| Metric | Phase 2 | Phase 3 |
| --- | ---: | ---: |
| Supported issuers | 6,078 | 6,078 |
| Payloads | 4,873 | 4,973 |
| Financial summaries / fresh | 4,869 / 3,722 | 4,869 / 3,722 |
| News stories | 219 | 324 |
| Active issuer news feeds | 19 | 25 (24 with qualifying owner news) |
| Any current news | Not previously measured under this definition | 71 |
| Official domains / IR pages | 46 / 22 | 65 / 33 |
| Refreshed SEC issuers | 24 | 1,081 |
| Recent structured material SEC issuers | No material-item layer | 594 |
| Published earnings events | 60 | 75 |
| Estimated upcoming issuers | 11 | 186 |
| Calls | 12 | 17 |
| Authenticated fresh-runner R2 acceptance | Unproven | Passed |

News and material-intelligence coverage are deliberately separate. Strict current metrics are not directly interchangeable with earlier coarser registry counts. Historical filing/event growth does not imply new stories today.

## 15. Representative real outputs

| Issuer / type | Inspected result |
| --- | --- |
| AAPL, mega-cap / non-calendar FY | Q3 FY2026 ending June 27; existing revenue 109.417B, EPS 2.02, FCF 31.914B; official newsroom. |
| NVDA, semiconductor | Q2 FY2027 ending July 26; existing revenue 96.221B, EPS 2.46, FCF 21.4B; explicit Q3 guidance with unverified bare-dollar currency. |
| MSFT, unusual fiscal year | Q4 FY2026 ending June 30; periodic reports remain distinct from verified release. |
| TSLA, automotive | Delivery update is operating intelligence; July 22 Q2 release is earnings; September agreement/termination/obligation items are category evidence, not invented deal terms. |
| XPEV, foreign private issuer | August 25 Q2 release verified; August 4 board approval is not published earnings; stale/missing facts remain visibly unavailable. |
| ROOT, ambiguous-name / insurance | Verified official feed, Q2 release/SEC linkage, shareholder materials and historical webcast; generic “root” headlines rejected. |
| GOOG / GOOGL, share classes | One Alphabet issuer and distinct listing identities; no cross-issuer share-class leak. |
| CHE, healthcare | Separate confirmed release and next-day call; exact quarter/year linkage and timezone preserved. |
| RARE, biotech | Contributor/ticker/exchange identifies Ultragenyx, EMA submission headline becomes material Regulation; no approval claim. |
| VEON, ADR | Contributor corroboration works; subsidiary results cannot become parent earnings. |
| CVS / ETR, recurring platforms | Newly discovered official Q4/native feeds produced ten/fifteen accepted company stories. |
| ACU / SGI, sparse / renamed | Missing facts remain unavailable; Somnigroup retains authoritative issuer identity. |
| UL, foreign annual reporter | Two old description-only releases demoted to candidates with stable IDs/evidence. |

The real cohort includes AAPL/NVDA/TSLA/MSFT/XPEV/PLTR/SOFI/ROOT/U/XYZ/TOST/TGT/AFRM/META/GOOG/GOOGL and existing small/micro-cap, renamed, bank, biotech, industrial and ADR cases. The index stream additionally processed over a thousand actual supported issuers. Reduced fixtures preserve metadata, not full publisher bodies.

## 16. Repeated-run stability

After the network backfill, three full-universe runs on the frozen producer took approximately **40.12, 39.89, 42.41 seconds**. Each processed all 6,078 issuers with **zero network requests, zero new items, zero duplicates and zero source/SEC failures**. News/event/source/alias identity hashes remained identical; complete news/source/alias hashes remained identical. Projected timestamps/financial-summary metadata can update, so different run timestamps correctly yield different export generations.

A final coverage-only fix included direct call presentation links (Chemed), aligning coverage with consumer references. Its full-universe rerun also preserved all four identity tables and complete news/source/alias hashes. Fresh restoration reproduced exact full ledger hashes and the same generation with the same producer/timestamp/authoritative sites. Archive rows were compared logically after staged VACUUM. The five-day stream queue is empty and 1,063 checkpoint identities persist. Remote acceptance repeats the equivalent restore/update/restore property with actual R2; it never passes a ledger through an artifact.

## 17. Failure recovery and adversarial review

Tests cover 403/404/429/500/503, timeout/DNS, robots denial, malformed XML/JSON/HTML, oversized responses, malicious XML, unsafe/private URLs, redirect abuse, damaged SQLite, checkpoint digest/size/path traversal, missing state, partial uploads/pointer failure and fallback to a verified previous slot. Permission failure never initializes an empty replacement ledger. One source/issuer failure remains isolated; budgets defer with durable progress.

Actual defects fixed: SEC index date/header variation; incidental Nasdaq index notices resolving to NDAQ; wrong SEC response poisoning durable metadata; legacy foreign descriptions claiming earnings; subsidiary/partner earnings publication and calendar attribution; future-tense release titles incorrectly claiming publication; board-review dates falsely confirming earnings; operating/clinical-phase results confused with financial earnings; weak candidates overriding independently verified publication; dangling aliases after pruning; malformed backslash links; next-day calls with conflicting periods; stale material disclosures dominating preview; regulatory applications treated as routine; coverage disagreeing with the current classifier; immutable generation reuse after producer changes; private-ledger copies in preview caches/artifacts; valueless HTML attributes crashing Smithfield Foods (SFD) IR discovery. Each material engine/security finding has a regression test or real browser/workflow check.

Integrity audit found zero wrong CIK filing links, orphan aliases, estimates marked confirmed or material-event fiscal periods inferred from an 8-K date. It also checked description-only foreign publication claims. This is targeted evidence, not certification of every external fact.

## 18. Performance, scheduling and storage

Ten 100-issuer drain batches plus a final 21-issuer batch used **1,008 SEC requests / 1,103 seconds**; the initial successful index/batch used another 52 requests / 55.7 seconds. Checkpoints represent 1,063 unique issuers; overlapping selections explain the larger processing-attempt count. Public source research/discovery is recorded separately. The ten-company material probe used 48 SEC + three public requests in 65.6 seconds. Candidate rounds used 100 requests / 421.5 seconds, 66 / 370.0 seconds and 98 / 388.0 seconds, including bounded time/request deferrals. The third round accepted 20 stories and suppressed 14 duplicate representations, with five isolated discovery failures/warnings. A subsequent global-feed poll accepted ten additional stories and suppressed 25 representations using five requests / 33.6 seconds. Smithfield retry used 17 requests / 82.2 seconds: the parser crash was fixed, but ownership validation correctly rejected the investor redirect; that source is not counted active. New-feed validation used two requests / 17.2 seconds for 25 new stories.

The wider history initially increased full-universe runtime to 103.4 seconds. Per-filing SQL indexing, per-period summary reuse and unchanged-event write avoidance reduced steady runs to ~40–43 seconds. Conditional requests, response memoization, robots caching and host delays remain implemented; discovery rounds observed four cache hits and 22 memo hits, with no 304s in those discovery rounds. A subsequent A.O. Smith earnings revalidation received one HTTP 304, one cache hit and zero downloaded body bytes. No invented request savings are claimed. The second global-feed poll suppressed 17 duplicate representations while accepting two genuinely new stories.

Normal proposed cadence remains six-hour SEC/feed batches, 75 changed issuers/run: capacity **300 issuer refreshes/day**, versus ~213 unique issuers/day in the observed five-day sample. This is a pilot sizing estimate, not a guaranteed upper bound; bursts queue durably. Three completed index days/run catch missed time. Optional document inspection is limited to four issuers/run. Global discovery polls sources, not 6,078 per-issuer queries. Catalogue discovery is weekly; source navigation is infrequent/checkpointed; blocked sources cool down. No schedule flag was activated. The preview job has a 25-minute outer limit to reserve checkpoint/write time after bounded catalogue, stream and discovery lanes; normal per-lane network budgets remain unchanged.

Current historical ledger is 364.9 MB, archive 200.8 MB and transient HTTP cache remains bounded at 64 MiB (67.1 MB). Public exports are ~215 MB/generation, retaining only current+previous (~430 MB), larger than the earlier ~55 MB snapshot because much more history is represented. No export history enters Git. Checkpoints compact staged SQLite backups only, cap HTTP cache pairs at 64 MiB and enforce 128 MiB compressed / 1 GiB expanded. Cache eviction removes whole metadata/body pairs; cache misses refetch safely. Ledger history is retained, not silently discarded to pass size limits.

Illustrative growth, **not a measured forecast**: 500 new normalized rows/day at 2 KB/row plus 25% indexing yields ~38 MB/month, 456 MB/year, 2.28 GB/five years beyond the current private state. Public current/previous snapshots stay bounded by section/payload limits rather than accumulating a generation per poll. At this scenario the expanded checkpoint threshold is approached in ~one year. Cold archive partitioning into the same private R2 infrastructure is required before capacity, not a new vendor or silent history deletion. Guard failure preserves the previous remote pointer. A wider public-source rollout must size its archive/working-set policy from actual ingestion rates.

## 19. Cost and request responsibility

**Financial/news data-provider cost: $0.** No new runtime dependency, service, database or paid transcript/calendar/news provider. Existing GitHub runners and R2 are reused. At current checkpoint size two remote slots are roughly 120 MB; operation counts are single-digit per sync stage, not per ticker. Incremental storage/request cost is small and may fit existing free allowances; account billing/quota was not independently certified. Four daily runs at an illustrative eight minutes are ~960 Actions minutes/month, plus occasional discovery; actual paid/free quota depends on the existing account. Disabled schedules currently add no scheduled runtime.

Public HTTP identifies Vision Universe, respects robots, uses global/host delays, finite retries/timeouts/2 MiB responses and caching/ETag/Last-Modified. SEC uses the existing identified, throttled client. No article-body republishing, paywall bypass, rate-limit evasion or credential logging.

## 20. Tests and regressions

Final feature suite: **126 Python tests and 15 Node tests passed** (Phase 2: 94/14). Added acceptance/restore, privacy, distributor ownership, ambiguity, SEC-item/category, index/date/gap, wrong-CIK, import-horizon, alias/prune, candidate/provenance, next-day/time-period, share-context, cache-cap and generation-version tests. Real metadata fixtures include GlobeNewswire and recorded Root news. Workflow private-copy exclusion has a regression guard.

Existing suites passed locally and in authenticated Actions validation: **2,507 Node product tests passed, five existing skips; 484 SEC tests passed; 63 additional Node/serving tests passed; 32 VU2 Python tests passed**. No test was weakened. Intermediate failures were investigated and corrected; real source/access failures remain explicit in probe evidence. Pending workflow runs replaced by GitHub's single pending concurrency slot are cancellations, not acceptance passes.

Browser: **64 cases**, 16 listing views at 390/430/768/1440 pixels, zero page errors/overflow; default-disabled view made zero intelligence fetches. Tesla/Chemed/Ultragenyx outputs were also inspected. Workflow YAML and all Bash blocks parse, JS syntax and diff whitespace checks pass. Final PR validation status is recorded with remote preservation.

Protected-path diff remains empty against both Phase 3 and original architecture baselines: Company Master/universe, SEC fundamentals, Quant/Discover/Supertrader/Screener/Markets, market prices/intraday/EOD, existing APIs/deployment are unchanged. A generated production test artifact was restored after the regression suite.

## 21. Security / privacy

Authenticated Cloudflare read-only privacy checks proved managed public access disabled and zero custom domains, before private writes and on every acceptance runner. Missing credentials, permission rejection, unknown schema or public exposure fail closed. Secrets remain existing Actions bindings: `VU_HISTORY_S3_ENDPOINT`, `VU_HISTORY_S3_BUCKET`, `VU_HISTORY_S3_REGION`, `VU_HISTORY_S3_ACCESS_KEY_ID`, `VU_HISTORY_S3_SECRET_ACCESS_KEY`, plus an available existing Cloudflare token binding for read-only account/bucket-domain verification. Local R2 bindings were absent, but Actions authentication worked; earlier configuration-read 403 did not imply dispatch/access was impossible.

Private state stays under fixed sanitized namespaces, with pointer-last writes and read-back hash verification. No private DB/cache is newly copied into GitHub preview artifacts or caches. Non-durable previews are explicitly ephemeral; durable/scheduled runs require private R2 state. Old preview artifacts/cache entries from previous versions were not destructively removed and expire under their existing retention. Consumer exports/review reports remain separate from operational checkpoints. All workflow permissions remain `contents: read`.

Both the public site and loopback preview returned **404** for `.company-intelligence/state.sqlite` and the tested private R2-prefix path. Public bucket-domain configuration was checked independently; no generic production endpoint accepting arbitrary intelligence object keys was added. UI/transport URL/XML/HTML guards remain tested. No production publishing occurred.

## 22. Known limitations

Current external/first-party news reaches 71/6,078 issuers. Short distributor RSS windows, sparse official domains and JS/blocked IR pages limit recall. Source availability does not guarantee full licensing for every later commercial use; uncertain/disallowed providers stay out. Exact contributor/ticker/exchange matching deliberately sacrifices recall. No broad paid-provider equivalence is claimed.

Only a bounded subset receives document-level earnings verification; candidates and uncertain periods remain explicit. 1,147 financial summaries are stale; current facts remain retrospective. Guidance/KPIs are narrow; materials/calls/transcripts can be historical or unlinked. The standalone preview is not a deployed stock-page integration. The full historical pilot checkpoint was validated locally, while authenticated R2 proofs now include a fresh full-universe working set, rather than the accumulated historical/network pilot. Long-term archive capacity needs a measured partition policy before growth reaches enforced bounds.

## 23. Remaining blockers and operating commands

**Code merge:** no remaining demonstrated blocker behind the disabled/controlled gate, subject to final green validation. Authenticated state recovery, privacy, failure isolation and protected-system regressions are proven.

**Broad production rollout:** the intended regular branch namespace still needs a controlled initialization/restore pilot at the real operating working-set size, plus reviewed enablement of the existing readiness flags. News polling/retention/source breadth must support the promised consumer experience; 71 issuers and twenty-entry rolling feeds do not justify universal-current-news claims. Delivery/public export integration and the intended regular working-set state still need operating acceptance before broad exposure. Archive partitioning before the enforced capacity limit is a later operations improvement, rather than an immediate code-merge blocker. These are rollout gates, not a demand for 100% coverage or a reason to add paid data.

```bash
# Zero-network whole-universe facts and retained events
python3 scripts/company_intelligence/cli.py run --all-offline
python3 scripts/company_intelligence/cli.py coverage
# Global completed-day material stream, bounded/resumable
python3 scripts/company_intelligence/cli.py sec-stream --network --sec-fetch --sec-documents --sec-document-issuers 4 --stream-days 3 --stream-history-days 180 --limit 75 --request-budget 160 --max-seconds 480
# Infrequent candidate/backfill lane
python3 scripts/company_intelligence/cli.py discover-catalogue --network
python3 scripts/company_intelligence/cli.py discover-backfill --network --discover-sites --discover-ir --limit 25 --request-budget 100 --max-seconds 480
python3 scripts/company_intelligence/preview_server.py
```

Authenticated acceptance dispatch uses `acceptance=true`, performs no deployment and does not enable flags. Adding `acceptance_universe=true` projects the actual entire master and existing facts offline; subsequent runners recover that scope from private state, rather than reverting to the cohort. Regular durable dispatch also requires explicit `COMPANY_INTELLIGENCE_STATE_READY=true` and first-run initialization; automatic schedule additionally requires `COMPANY_INTELLIGENCE_ENABLED=true`. Neither was activated. Missing/corrupt state never falls back to an empty cache-ledger. JSON/audit/source/index-gap/queue state explains missing news, rejects, material categories, calendar estimates and recovery.

Important new/changed paths: `sec_stream.py`, `sec_events.py`, `distribution.py`, `acceptance.py`, `privacy.mjs`; isolated pipeline/model/earnings/store/coverage/transport/checkpoint/CLI; source configuration, consumer contract/preview, isolated workflow, acceptance tests and reduced evidence fixtures. No unrelated production files changed.

## 24. Readiness and preservation

The complete intelligence layer is additive, conservative and useful, with proven private durable semantics and much broader material-event discovery. Broad news remains a real product gap, clearly separated from financial/regulatory intelligence. PR #339 stays draft; no merge, public deployment or scheduled activation. Validated changes and this report are committed and pushed with exact local/remote SHA verification in the final delivery. Generated pilot history/caches stay out of Git; committed metadata/count/hash fixtures preserve reviewable evidence.

CODE-MERGE-READY: YES

PRODUCTION-ROLLOUT-READY: NO

## News and management-content coverage phase — 2026-10-03

This phase starts from PR #356 commit `a4cb77e3928caeb7203783a1444787357b0399b2`, with the gate unchanged. The exact initial ledger contains 6,078 issuers, 117 with 180-day news, 36 calls, 31 webcast/replay references, 55 presentation issuers, 18 company transcript issuers, 42 with any call content, 134 verified official domains and 87 IR pages. Calendar, SEC, financial and durable-state foundations are retained.

The new bounded lanes separate weekly domain verification (`verify-domains`) from more expensive IR discovery and financial/export rebuilding. Homepage verification canonicalizes legal suffixes and initials and accepts short brands only with an exact legal copyright owner. HTTPS is preferred on the same candidate host. Failed, ambiguous, blocked and deferred candidates remain distinct; neither a candidate nor a successful homepage creates news/IR coverage. Old cached homepage results can be revalidated against stronger ownership rules without more requests.

Q4's issuer-hosted `FinancialReport.svc/GetFinancialReportList` is a reusable document-index contract validated on six unrelated issuers and tested on 20 existing validated Q4 event hosts. It retains document links, explicit fiscal labels and source evidence without downloading recordings/PDFs. Vendor `ReportDate` is a grouping date, including future calendar-year placeholders; it is **never** a publication date or call date. Only current/prior fiscal-year groups are retained. Explicit prepared remarks, company transcripts, shareholder letters, presentations, earnings webcasts and replay references are distinct. `materials-backfill` derives these sources from existing Q4 ownership/widget proof; ongoing checks are daily. Events and reports fail independently. Generic navigation hubs do not count as individual materials.

GlobeNewswire explicitly advertises a 1,000-entry rolling news sitemap and monthly URL archives in robots.txt. A new four-hour metadata adapter retains explicit headline/publication/link fields, never slug-derived headlines or `lastmod` as publication. Weekly, explicit `news-archive --archive-month YYYY-MM` batches inspect bounded public NewsArticle metadata, requiring exact legal contributor and exchange/ticker agreement for issuer-authored authority. URL slugs only select candidates. Archive XML alone has an 8 MiB cap; article/normal sources retain the existing 2 MiB limit. Checkpoints stage normalized metadata for crash recovery and mark ingestion completion separately. Article body caches are deleted after extraction. Scheduling clauses are limited to the actual `articleBody`, excluding related-story widgets and forward-looking boilerplate; time abbreviations are preserved. Tracker/API/search endpoints excluded by robots are not followed or decoded. Distributor author URLs add candidates, never verified domains.

Access research deliberately excluded commercial aggregation from PR Newswire and Business Wire: their actual terms restrict storing/aggregating/distributing releases or abstracts without consent despite accessible feeds. AccessNewswire/Newsfile restrictions, EQS bot restrictions, unvalidated exchange contracts and repeated GDELT 503s remain exclusions rather than artificial coverage. Publisher-advertised metadata discovery does not grant full-text republication rights.

Real-news audits found and fixed exchange mentions wrongly assigned to Nasdaq, Rogers Communications/Rogers Corporation collisions, National Healthcare Properties/National HealthCare collisions, Provident Financial Services/Provident Financial Holdings collisions and crypto cashtags mistaken for stock tickers. Regressions preserve common-word abstention and share-class issuer identity. The archive parser also rejected related-story call contamination and ambiguous/missing dates rather than fabricating schedules.

Checkpoint validation: 222 feature Python tests and 29 feature Node tests pass. Broad regression, full-universe recount, repeated runs and final quality review continue below; this checkpoint does not claim rollout acceptance or 80–90% news coverage.

# Company Intelligence — stored profiles and conversion continuation

## Validated milestone, 2026-10-05

Repository/PR starting head: `9dc8e701cb0dc4e06a1796a52bd794fd70faf7c9`; branch `feature/company-intelligence-rollout`, [PR #356](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/356). Do not merge. Existing production gates and schedules remain unchanged.

**Exact restore boundary:** this fresh workspace does not contain the preceding private expanded ledger, retained web cache or discovery queues. That ledger was not uploaded in the preceding run; there are no configured private R2 credentials here and it is not in the inspected Actions artifacts. Its latest remotely documented SHA-256 is `461ae390d7f641e784da1d31a3fd7d614231d1554ed9c48b452095b4599b45e6` (23,167,678 compressed bytes). The initially inspected predecessor hash was `b5b1fc59f7f394d0859b172e005f26d8c998e6ea2bc5656bfb5bb11bafe9a789`. A checkpoint location has been requested. No substitute rollout ledger has been initialized. Existing committed seeds and the full preceding report below are preserved. Consequently old discovery, broad-IR, remaining-candidate and GlobeNewswire queues cannot honestly be resumed until that checkpoint is supplied.

Exact committed baseline: **6,078 supported issuers; 5,412 SEC identities; 2,353 official-site seeds; 2,378 source descriptors**. Site seeds are not a fresh recount of the preceding ledger's 2,359 verified domains. Concurrent remote milestone `ad56547106c9f0f3f72f8e29050a3e91fb382b1e` was fetched and incorporated before preservation. Its later measured ledger snapshot is 2026-10-05T07:55:12Z; its counters below are historical evidence, not newly verified after counts.

An additive public factual profile catalogue now supplies **74 SEC-grounded issuer profiles (1.22% of supported issuers)** at the initial audit boundary (the first pushed catalogue contained 98 profiles). This is prepared coverage, not a claim that the missing deployed ledger has been updated. Catalogue import prevalidates every profile and writes only profile state; newer and stronger existing profiles survive. Independent per-issuer attempt checkpoints and immutable SEC document caches are private/ignored. No discovery inventory or queue is rebuilt. Subsequent bounded batches continue from this new profile lane's checkpoints.

Implemented: normalized stored `companyProfile`, provenance/CIK/ownership checks, cached annual-business extraction, explicit issuer-subject first-party About extraction, deterministic neutral rewriting, slow filing-driven/quarterly refresh, bounded budgets/cooldowns/circuit breakers, public export and consumer contract, profile metrics, and shared Discover/Quant `Unternehmen` chapter. Existing English-source content remains English under German UI labels with a language attribute, following news conventions. No translation/model calls, employee count, generated page-time descriptions or paid provider are introduced. Unsupported structured facts remain empty.

A simultaneous Q4 conversion fix correctly classifies transcript, prepared-remarks, shareholder-letter and financial-supplement attachments; it prevents PDF links becoming webcasts and repairs inherited legacy attachment classifications on source polling. It does not assert numerical coverage gains against the absent ledger.

Initial evidence audits include Apple, NVIDIA, Tesla, Microsoft, Palantir, XPeng, a bank holding company, an insurer, industrial, biotech, consumer, software, semiconductor and foreign issuers. Marketing predicates, plural-verb rewriting, split business headings, legal comma suffixes and duplicate platform lists found during inspection were corrected through zero-request cache replays. IHG's annual document exceeds the 16 MiB parser ceiling and remains unavailable. Neither identity nor sector alone is used as a profile.

First 100 new-issuer SEC batch: **200 requests, 58 initial acceptances, 41 abstentions, one document-size failure, 429,880,101 returned decoded bytes**, 200.914 seconds. The 15 priority profiles reused audit caches with zero requests. Subsequent local parser replays use zero HTTP; their accepted counts describe reanalysis, not new network discoveries. Actual compressed wire bandwidth was not measured. Full Company Intelligence checks: **452 Python tests and 39 Node tests passed**. Browser, wider regressions, additional batches and the final coverage/cost report follow in subsequent remotely preserved milestones.

## Second validated milestone — 2026-10-05T08:47:53Z

**586 prepared profiles / 6,078 supported issuers (9.64%)**, all SEC-grounded; 815 exact-CIK issuer attempts have durable outcomes. First-party-only and combined-source catalogue counts are zero; the first-party audit is separate. The original discovery ledger still has not been restored. The 80–90% target has not been achieved; further SEC cohorts continue.

Eight new 100-issuer network batches plus priority-source audits used **1688 requests / 3,493,317,755 returned decoded bytes**, including the 59-request first-party audit. Parser replays used zero HTTP. The original 15-profile priority batch reused SEC audit caches. Rewritten profiles are counted separately from newly covered issuers. Immutable annual documents remain compressed in the existing SEC cache; no repeated filing downloads occur. Per-issuer checkpoints, one-writer locking, retry cooldowns and a three-failure SEC circuit protect continuation. Initial catalogue rate can explicitly be 1–3 SEC requests/second; scheduled production cadence is unchanged.

The source-grounded parser now recovers explicit legal short-name definitions, preserves holding-company/subsidiary wording, conjugates coordinated issuer verbs, rejects seasonality/footprint-only and promotional predicates, and removes promotional tails. Cache replay yielded 586 accepted profiles after quality correction. Sparse one-sentence results are permitted where richer facts cannot safely be normalized. No field is inferred from sector/ticker alone.

**Validation:** 471 Python tests; 39 feature Node tests; 2,569 broad Node regressions passed, five skipped. Actual Discover/Quant profile delivery passed 64 responsive cases, two disabled cases, six adversarial cases and three private-path rejections. The standalone preview shows the prepared company description and suppresses unavailable sections. First milestone's ten GitHub workflows passed. The broad regression command rewrote its generated total-return verification fixture; that test output was reviewed and reverted, with no unrelated production change retained.

**Profile-only cost scenario:** 48.83 source requests/month for this catalogue if one annual document/profile/year is refreshed, reusing existing submissions polling. Current cached projection adds zero requests and no new workflow is enabled. Prepared profile facts occupy 1,054,968 bytes; two public slots add at most 2,109,936 uncompressed profile bytes. The three-request immutable consumer lookup is unchanged; actual stock-page rerenders can repeat an aborted existing lookup. Profiles cause no additional fetch or live translation.

The incorporated remote conversion milestone preserves exact historical progress: verified domains 2,359 → 2,378; IR 910 → 938; 180-day news 1,168 → 1,416; calls 372 → 413; webcasts 332 → 353; presentations 760 → 785; management content 425 → 450; confirmed earnings 80 → 87. Those before/after numbers come from the two remotely committed measurement snapshots, not a new local recount. The original 15-candidate tail was processed remotely; the current remote checkpoint advertises a separate 20-candidate tail. Original broad IR remains 236/901 classified, and the September archive remains at seven batches. Both require the missing private checkpoint; neither is restarted.

## CI lifecycle correction

The second milestone's Company Intelligence merge-tree workflow failed on the new catalogue-membership test: current main had withdrawn Qwest Corp from supported equity scope after the branch's frozen master was prepared. This was an incorrect assumption in our new test, not a pre-existing main failure. The import implementation already intersects the current authoritative master and withholds absent identities. The corrected test validates every profile's exact CIK/provenance, asserts the complete supported import set, deliberately withdraws an issuer, proves it cannot be imported or exported, and proves its preceding private factual record survives. Twenty-seven targeted profile tests pass. Current-main dry master: 6,073 issuers versus the branch's fixed 6,078; the catalogue's Qwest record is withheld on main. No Company Master data or eligibility rules are changed and no main merge occurs. Subsequent workflow validation is required before merge-ready is asserted.

## Third validated milestone — cached quality recovery

The prepared catalogue now contains **1093 profiles / 6,078 issuers (17.98%)** after **1515 exact-CIK attempts**. All prepared profiles have SEC annual-filing provenance. Cache-only parser recovery adds no network requests. This pass strips legacy jurisdiction annotations from display names, excludes human-capital sections and employee-count facts while retaining employee-benefit products, preserves issuer names during adjective removal, and accepts larger annual documents within a 64 MiB ceiling. IHG now fits that ceiling but still lacks an eligible complete business statement; it remains unavailable rather than being assigned a guessed description.

Optional profile failures are isolated from the existing SEC financial/news pipeline. Failed extraction of a genuinely newer annual filing marks the preceding profile stale; a same-document parser update does not imply a new filing. **477 Python tests and 39 feature Node tests pass**; all ten GitHub workflows passed on lifecycle-correction head `73d327b3ddd133440e6c2161fdfb72c63c49ef55`. Further source backfill and consumer-quality review continue. The original discovery checkpoint remains unavailable; all inherited queues and prior reports are preserved.

## Fourth validated milestone — business-first quality selection

The source parser prioritizes explicit core business predicates ahead of customer-only sentences. It preserves SEC-described segment relationships and nested consolidated legal definitions, removes market-rank/superiority claims, fixes legal-suffix punctuation and avoids distribution-only descriptions or accidental product-list fragments. A prepared description that no longer satisfies these quality rules is retired from this new catalogue using its identical cached filing, with an explicit durable outcome; the preceding rollout ledger is not touched. Changed annual filings preserve earlier sourced facts with a stale flag if new extraction is unavailable.

Cache-only upgrades retain their original verification time. Catalogue import permits a newer parser on identical evidence at that timestamp, while preserving later verification, stronger sources and supersession. Regression coverage includes parent/subsidiary wording, wrong issuer, marketing introductions, ranked bank descriptions, customer-only abstention, nested legal definitions, no-request retirement and repeated-run cooldown. **485 Python tests / 39 feature Node tests pass.** All ten workflows passed on the preceding remotely preserved head. The next catalogue milestone follows after the cache replay and additional SEC cohorts; current source discovery queues remain unrestored.

## Sixth validated milestone — 1699 profiles and explicit-quarter earnings conversion

**1699 / 6,078 prepared company profiles (27.95%)** are preserved. Every profile has exact-CIK SEC annual provenance. The original discovered-source ledger remains unavailable here; network expansion continues from the separate profile lane's current checkpoint.

Explicit official event titles such as “Q3 2026 Results”, “2026 Q3 Results” and “Q3 FY26 Results” now establish the appropriate earnings event. Exact issuer/source ownership and explicit calendar date requirements are unchanged. Another named company, generic “Results”, production and clinical results remain excluded. A source-ingestion test proves an existing vendor event is reclassified in place, the issuer estimate is reconciled once and replay cannot duplicate the call; another issuer's estimate survives. Numerical confirmed-earnings gains against the missing ledger are not invented.

Consumer replay revealed that additive import could retain older descriptions previously withdrawn for weak business content. Seven exact cached-evidence quality withdrawals (six previously published, one only in the ephemeral audit store) now withhold those public descriptions. Every preceding factual field/source remains private; changed evidence, later verification, manual review and annual supersession are protected. Discovery queues, source health, news and financial state are not altered. The profile-only consumer recount now reconciles to the authoritative catalogue rather than accumulating obsolete descriptions.

**492 Python tests and 39 feature Node tests pass**. Source quality correction uses zero network requests. The prior real browser audit passed 77 cases. Remote conversion milestone `ebde42ccc815b4aa882d3dd4d5fe0d68fa75d9cb` remains incorporated, with 2,406 domains / 966 IR pages / 1,470 strict 180-day news issuers / 424 calls / 801 presentation issuers. These are its 09:42:04 remote measurement, not a local ledger recount. Latest expanded private checkpoint fingerprint there is `4052084632b4246d4d6cd81ef2bf2a73d3c032a7267d4bdebf44ed248d0f92f7` (24,560,579 compressed bytes); it has not been supplied here.

<!-- PROFILE-CONTINUATION-MILESTONE-END -->

# Company Intelligence — stored profiles and conversion continuation

## Validated milestone, 2026-10-05

Repository/PR starting head: `9dc8e701cb0dc4e06a1796a52bd794fd70faf7c9`; branch `feature/company-intelligence-rollout`, [PR #356](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/356). Do not merge. Existing production gates and schedules remain unchanged.

**Exact restore boundary:** this fresh workspace does not contain the preceding private expanded ledger, retained web cache or discovery queues. That ledger was not uploaded in the preceding run; there are no configured private R2 credentials here and it is not in the inspected Actions artifacts. Its latest remotely documented SHA-256 is `461ae390d7f641e784da1d31a3fd7d614231d1554ed9c48b452095b4599b45e6` (23,167,678 compressed bytes). The initially inspected predecessor hash was `b5b1fc59f7f394d0859b172e005f26d8c998e6ea2bc5656bfb5bb11bafe9a789`. A checkpoint location has been requested. No substitute rollout ledger has been initialized. Existing committed seeds and the full preceding report below are preserved. Consequently old discovery, broad-IR, remaining-candidate and GlobeNewswire queues cannot honestly be resumed until that checkpoint is supplied.

Exact committed baseline: **6,078 supported issuers; 5,412 SEC identities; 2,353 official-site seeds; 2,378 source descriptors**. Site seeds are not a fresh recount of the preceding ledger's 2,359 verified domains. Concurrent remote milestone `ad56547106c9f0f3f72f8e29050a3e91fb382b1e` was fetched and incorporated before preservation. Its later measured ledger snapshot is 2026-10-05T07:55:12Z; its counters below are historical evidence, not newly verified after counts.

An additive public factual profile catalogue now supplies **74 SEC-grounded issuer profiles (1.22% of supported issuers)** at the initial audit boundary (the first pushed catalogue contained 98 profiles). This is prepared coverage, not a claim that the missing deployed ledger has been updated. Catalogue import prevalidates every profile and writes only profile state; newer and stronger existing profiles survive. Independent per-issuer attempt checkpoints and immutable SEC document caches are private/ignored. No discovery inventory or queue is rebuilt. Subsequent bounded batches continue from this new profile lane's checkpoints.

Implemented: normalized stored `companyProfile`, provenance/CIK/ownership checks, cached annual-business extraction, explicit issuer-subject first-party About extraction, deterministic neutral rewriting, slow filing-driven/quarterly refresh, bounded budgets/cooldowns/circuit breakers, public export and consumer contract, profile metrics, and shared Discover/Quant `Unternehmen` chapter. Existing English-source content remains English under German UI labels with a language attribute, following news conventions. No translation/model calls, employee count, generated page-time descriptions or paid provider are introduced. Unsupported structured facts remain empty.

A simultaneous Q4 conversion fix correctly classifies transcript, prepared-remarks, shareholder-letter and financial-supplement attachments; it prevents PDF links becoming webcasts and repairs inherited legacy attachment classifications on source polling. It does not assert numerical coverage gains against the absent ledger.

Initial evidence audits include Apple, NVIDIA, Tesla, Microsoft, Palantir, XPeng, a bank holding company, an insurer, industrial, biotech, consumer, software, semiconductor and foreign issuers. Marketing predicates, plural-verb rewriting, split business headings, legal comma suffixes and duplicate platform lists found during inspection were corrected through zero-request cache replays. IHG's annual document exceeds the 16 MiB parser ceiling and remains unavailable. Neither identity nor sector alone is used as a profile.

First 100 new-issuer SEC batch: **200 requests, 58 initial acceptances, 41 abstentions, one document-size failure, 429,880,101 returned decoded bytes**, 200.914 seconds. The 15 priority profiles reused audit caches with zero requests. Subsequent local parser replays use zero HTTP; their accepted counts describe reanalysis, not new network discoveries. Actual compressed wire bandwidth was not measured. Full Company Intelligence checks: **452 Python tests and 39 Node tests passed**. Browser, wider regressions, additional batches and the final coverage/cost report follow in subsequent remotely preserved milestones.

## Second validated milestone — 2026-10-05T08:47:53Z

**586 prepared profiles / 6,078 supported issuers (9.64%)**, all SEC-grounded; 815 exact-CIK issuer attempts have durable outcomes. First-party-only and combined-source catalogue counts are zero; the first-party audit is separate. The original discovery ledger still has not been restored. The 80–90% target has not been achieved; further SEC cohorts continue.

Eight new 100-issuer network batches plus priority-source audits used **1688 requests / 3,493,317,755 returned decoded bytes**, including the 59-request first-party audit. Parser replays used zero HTTP. The original 15-profile priority batch reused SEC audit caches. Rewritten profiles are counted separately from newly covered issuers. Immutable annual documents remain compressed in the existing SEC cache; no repeated filing downloads occur. Per-issuer checkpoints, one-writer locking, retry cooldowns and a three-failure SEC circuit protect continuation. Initial catalogue rate can explicitly be 1–3 SEC requests/second; scheduled production cadence is unchanged.

The source-grounded parser now recovers explicit legal short-name definitions, preserves holding-company/subsidiary wording, conjugates coordinated issuer verbs, rejects seasonality/footprint-only and promotional predicates, and removes promotional tails. Cache replay yielded 586 accepted profiles after quality correction. Sparse one-sentence results are permitted where richer facts cannot safely be normalized. No field is inferred from sector/ticker alone.

**Validation:** 471 Python tests; 39 feature Node tests; 2,569 broad Node regressions passed, five skipped. Actual Discover/Quant profile delivery passed 64 responsive cases, two disabled cases, six adversarial cases and three private-path rejections. The standalone preview shows the prepared company description and suppresses unavailable sections. First milestone's ten GitHub workflows passed. The broad regression command rewrote its generated total-return verification fixture; that test output was reviewed and reverted, with no unrelated production change retained.

**Profile-only cost scenario:** 48.83 source requests/month for this catalogue if one annual document/profile/year is refreshed, reusing existing submissions polling. Current cached projection adds zero requests and no new workflow is enabled. Prepared profile facts occupy 1,054,968 bytes; two public slots add at most 2,109,936 uncompressed profile bytes. The three-request immutable consumer lookup is unchanged; actual stock-page rerenders can repeat an aborted existing lookup. Profiles cause no additional fetch or live translation.

The incorporated remote conversion milestone preserves exact historical progress: verified domains 2,359 → 2,378; IR 910 → 938; 180-day news 1,168 → 1,416; calls 372 → 413; webcasts 332 → 353; presentations 760 → 785; management content 425 → 450; confirmed earnings 80 → 87. Those before/after numbers come from the two remotely committed measurement snapshots, not a new local recount. The original 15-candidate tail was processed remotely; the current remote checkpoint advertises a separate 20-candidate tail. Original broad IR remains 236/901 classified, and the September archive remains at seven batches. Both require the missing private checkpoint; neither is restarted.

## CI lifecycle correction

The second milestone's Company Intelligence merge-tree workflow failed on the new catalogue-membership test: current main had withdrawn Qwest Corp from supported equity scope after the branch's frozen master was prepared. This was an incorrect assumption in our new test, not a pre-existing main failure. The import implementation already intersects the current authoritative master and withholds absent identities. The corrected test validates every profile's exact CIK/provenance, asserts the complete supported import set, deliberately withdraws an issuer, proves it cannot be imported or exported, and proves its preceding private factual record survives. Twenty-seven targeted profile tests pass. Current-main dry master: 6,073 issuers versus the branch's fixed 6,078; the catalogue's Qwest record is withheld on main. No Company Master data or eligibility rules are changed and no main merge occurs. Subsequent workflow validation is required before merge-ready is asserted.

## Third validated milestone — cached quality recovery

The prepared catalogue now contains **1093 profiles / 6,078 issuers (17.98%)** after **1515 exact-CIK attempts**. All prepared profiles have SEC annual-filing provenance. Cache-only parser recovery adds no network requests. This pass strips legacy jurisdiction annotations from display names, excludes human-capital sections and employee-count facts while retaining employee-benefit products, preserves issuer names during adjective removal, and accepts larger annual documents within a 64 MiB ceiling. IHG now fits that ceiling but still lacks an eligible complete business statement; it remains unavailable rather than being assigned a guessed description.

Optional profile failures are isolated from the existing SEC financial/news pipeline. Failed extraction of a genuinely newer annual filing marks the preceding profile stale; a same-document parser update does not imply a new filing. **477 Python tests and 39 feature Node tests pass**; all ten GitHub workflows passed on lifecycle-correction head `73d327b3ddd133440e6c2161fdfb72c63c49ef55`. Further source backfill and consumer-quality review continue. The original discovery checkpoint remains unavailable; all inherited queues and prior reports are preserved.

## Fourth validated milestone — business-first quality selection

The source parser prioritizes explicit core business predicates ahead of customer-only sentences. It preserves SEC-described segment relationships and nested consolidated legal definitions, removes market-rank/superiority claims, fixes legal-suffix punctuation and avoids distribution-only descriptions or accidental product-list fragments. A prepared description that no longer satisfies these quality rules is retired from this new catalogue using its identical cached filing, with an explicit durable outcome; the preceding rollout ledger is not touched. Changed annual filings preserve earlier sourced facts with a stale flag if new extraction is unavailable.

Cache-only upgrades retain their original verification time. Catalogue import permits a newer parser on identical evidence at that timestamp, while preserving later verification, stronger sources and supersession. Regression coverage includes parent/subsidiary wording, wrong issuer, marketing introductions, ranked bank descriptions, customer-only abstention, nested legal definitions, no-request retirement and repeated-run cooldown. **485 Python tests / 39 feature Node tests pass.** All ten workflows passed on the preceding remotely preserved head. The next catalogue milestone follows after the cache replay and additional SEC cohorts; current source discovery queues remain unrestored.

## Fifth validated milestone — stored catalogue and annual-change refresh

**1169 prepared profiles (19.23% of 6,078 issuers)** are preserved at this milestone. The latest extraction correction is replaying cached source documents, followed by further bounded SEC cohorts. The source parser now avoids confusing a noun such as “chip designs” with the issuer's main business predicate and removes conjunctions left behind when promotional adjectives are stripped. The full-scope profile target is still unmet.

Existing authorized SEC change refreshes may fetch one genuinely newer annual filing for a stored SEC profile. They never trigger initial catalogue discovery, never fetch unchanged filings after a runner loses its document cache, respect unavailable/failure checkpoints, share existing SEC request/time budgets, and cannot suppress financial/news/event projection. Offline projection remains zero-request. An unavailable new description retains previous sourced facts with a stale warning. Discover/Quant now identify older descriptions using the annual filing date, rather than presenting today's cached verification as fresh business evidence.

**Validation:** 489 Python tests, 39 feature Node tests, and 77 actual browser/delivery cases pass (64 responsive, two disabled, eight adversarial including stale annual dates, three private-path rejections). All ten GitHub workflows passed on `a4b49967ed3839722732d61a1648acf32ce3bd2c`. Original expanded discovery state remains absent; no original queue or ledger is restarted. Catalogue facts are remotely durable; source-document cache and independent attempt metadata remain private in this workspace and cannot be remotely preserved through unauthenticated R2.

## Concurrent conversion preservation — 2026-10-05T09:42:04Z

Concurrent remote milestone `ebde42ccc815b4aa882d3dd4d5fe0d68fa75d9cb` was fetched and incorporated. Its updated conversion measurements, source seeds, completed recovery cohorts and private-checkpoint fingerprint are preserved below. These new remote ledger measurements supersede the 07:55:12 conversion snapshot; the current workspace still lacks that private ledger and cannot claim a local recount. Profile checkpoints remain separate and are resumed at the completed batch boundary.

## Sixth validated milestone — 1699 profiles and explicit-quarter earnings conversion

**1699 / 6,078 prepared company profiles (27.95%)** are preserved. Every profile has exact-CIK SEC annual provenance. The original discovered-source ledger remains unavailable here; network expansion continues from the separate profile lane's current checkpoint.

Explicit official event titles such as “Q3 2026 Results”, “2026 Q3 Results” and “Q3 FY26 Results” now establish the appropriate earnings event. Exact issuer/source ownership and explicit calendar date requirements are unchanged. Another named company, generic “Results”, production and clinical results remain excluded. A source-ingestion test proves an existing vendor event is reclassified in place, the issuer estimate is reconciled once and replay cannot duplicate the call; another issuer's estimate survives. Numerical confirmed-earnings gains against the missing ledger are not invented.

Consumer replay revealed that additive import could retain older descriptions previously withdrawn for weak business content. Seven exact cached-evidence quality withdrawals (six previously published, one only in the ephemeral audit store) now withhold those public descriptions. Every preceding factual field/source remains private; changed evidence, later verification, manual review and annual supersession are protected. Discovery queues, source health, news and financial state are not altered. The profile-only consumer recount now reconciles to the authoritative catalogue rather than accumulating obsolete descriptions.

**492 Python tests and 39 feature Node tests pass**. Source quality correction uses zero network requests. The prior real browser audit passed 77 cases. Remote conversion milestone `ebde42ccc815b4aa882d3dd4d5fe0d68fa75d9cb` remains incorporated, with 2,406 domains / 966 IR pages / 1,470 strict 180-day news issuers / 424 calls / 801 presentation issuers. These are its 09:42:04 remote measurement, not a local ledger recount. Latest expanded private checkpoint fingerprint there is `4052084632b4246d4d6cd81ef2bf2a73d3c032a7267d4bdebf44ed248d0f92f7` (24,560,579 compressed bytes); it has not been supplied here.

<!-- PROFILE-CONTINUATION-MILESTONE-END -->


## Event-source recovery implementation checkpoint — 2026-10-05

A zero-request census identified **180 verified unpolled event sources for 171 issuers**: 100 Q4 event endpoints, 30 RSS event feeds and 50 existing HTML/other event sources. The explicit `events-backfill` command and `source_backfill_runner --lane events` now freeze those proven source/company/URL identities and use the existing event adapters, source health, due times, request/time budgets, robots policy and shared IR circuit. Restored runs cannot widen issuer scope or follow a changed identity. Successfully polled sources are skipped on continuation. This one-time recovery does not change twelve-hour production event cadence, poll global news, rebuild financials, or export the universe.

Six behavioral tests passed, including real Q4 ingestion of dated calls/webcasts/presentations and official upcoming confirmation, exact checkpoint/restore continuation, untouched unsent budget deferrals, source cooldowns, identity changes, shared infrastructure failure, CLI isolation and durable runner accounting. The full Python suite passed **526 tests**. Live event-backfill gain remains **unmeasured** at this implementation checkpoint; the preceding operational report retains its stated 14:25:39 UTC snapshot. The bounded live cohort will run after remote preservation, and subsequent coverage counts require fresh export, provenance/consumer audits and restore proof. PR #356 remains draft, open and unmerged; production gates remain off.

## Continuous production refresh

The bounded 46-stock automation and its acceptance evidence are documented in
[CONTINUOUS_REFRESH.md](company-intelligence/CONTINUOUS_REFRESH.md).
