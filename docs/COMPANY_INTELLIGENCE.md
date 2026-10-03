# Company Intelligence — coverage expansion and four-hour operations

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
