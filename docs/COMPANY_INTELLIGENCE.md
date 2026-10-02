# Company Intelligence Engine — Phase 3 acceptance and hardening report

Validated **2026-10-02**, continuing the fetched, exact local/remote baseline `0cb2179b34580351ab8d07f04420b702c107a4f4` on `feature/company-intelligence-engine`. Original production architecture baseline: `18bc2dddfaebcf3ec97079364f1203c2c09f83cb`. PR [#339](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/339) remains a draft and is not merged. This report supersedes the Phase 2 readiness assessment; prior measured evidence remains in `tests/fixtures/phase2-validation.json`.

## 1. Executive result

Authenticated private R2 recovery now works across separate GitHub runners. A completed-day SEC event stream discovers changed issuers globally, without modifying the existing fundamentals producer. It drained **1,063 unique supported issuer checkpoints** and surfaces recent material SEC disclosures for **594 issuers**. The complete universe produces **4,972 payloads**, with recent material intelligence for **3,982 issuers (65.51%)**.

News improved from 219 to **294 normalized stories**, with **51 issuers** having current accepted news. Strict first-party coverage is **23 issuers**, external coverage **28**. This is useful progress, not a universal-news breakthrough. The engine is suitable for a controlled, disabled-by-default merge; broad unattended public rollout still needs a production namespace pilot and a source/scheduling delivery strategy that meets the desired news experience.

## 2. R2 / durable state

Existing signed S3/R2 and filesystem drivers remain unchanged. New `acceptance.py` and `privacy.mjs` use `v1/company-intelligence/state/acceptance-<run>-<attempt>/`, separate from regular `branch-<SHA256-prefix>` state. No unrelated object, bucket policy, managed domain or custom domain was changed.

Authenticated runs [36985311979](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36985311979), [36988290710](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36988290710), and [36993714354](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36993714354) passed validation and all three fresh-runner jobs. The first tests `d829b2f1`; the second `3bcf5d0d`; the third `2e4bfd75`. Final producer-revision acceptance on frozen core `0e18e22d335ff6182094d961773febef434eb4e3`: **PASS**, all three fresh runners and validation succeeded ([36994296782](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36994296782)). The unchanged producer was tested with version-aware generation recovery.

Runner A starts empty, refuses an existing test namespace, projects actual AAPL/ROOT data and a recorded Root headline fixture, and stores explicitly labelled private calendar/alias/health/checkpoint canaries. Runner B receives only the safe hash/count artifact, restores exclusively from R2, verifies exact table hashes, regenerates the same consumer generation, runs another real offline update and writes a new checkpoint. Runner C restores the exact updated checkpoint and generation. News/event/source/alias identities, failure health and queue/cursor fields remain intact. Canaries never deploy.

The second run recovered 1 news item, 43 events, one source, one alias and ten state rows; its updated state had eleven state rows. Updated generation `46e823825f319491227600cd`, logical hash `ff177b5e7fc0f7b733051149b10f9e8936dbcd21a36702d1fa0b07d7d0e963b0`, restored snapshot SHA `0e28dd2451cc2db50fa391b4b15f269dcd0c6b3943ac9f7094ae70fda9a6c50a`. These are bounded authenticated tests, not a claim that the full historical pilot ledger was uploaded to R2.

The full historical ledger separately passed local fresh-directory restore: approximately **60.1 MB compressed / 592.4 MB expanded**, exact logical state, cold archive and regenerated consumer generation; packing ~19 seconds, restoring ~2.2 seconds. Transport scope is explicit in committed evidence.

## 3. News coverage and research

Four public GlobeNewswire RSS polls share one reusable distributor adapter and the existing global Wallstreet-online feed remains optional. GlobeNewswire original contributor plus unique master ticker/exchange identity must agree; the global source is never declared an issuer-owned feed. Headlines, URLs, timestamps and metadata are retained, not publisher article bodies. Official IR/newsroom feeds remain the highest-quality tier.

Controlled probes found GlobeNewswire RSS usable; advertised PRNewswire RSS returned 404, guessed Business Wire/Newsfile endpoints returned 404 and AccessNewswire returned 403. These results do not prove that all endpoints from those vendors are unavailable. GDELT again returned repeated 503 responses and remains inactive/experimental. No bypass or paid provider was added.

GlobeNewswire feeds returned **20 entries**, including when a larger record count was requested. Legacy subject-code labels did not reliably describe every returned story. Industry variants returned 400. RSS documentation/terms URLs included soft-404 HTML, so no independent commercial-reuse licensing certification is claimed. Access is public, feed-oriented and robots checked; the product stores metadata and links. The 20-item rolling windows and six-hour pilot schedule cannot guarantee completeness. Missing or rolled-off stories are not counted as coverage. Final robots-aware HEAD probes returned 200 for seven representative originals: Ultragenyx/GlobeNewswire, CVS, Entergy, Apple, Root, Chemed and the Tesla Wallstreet-online story; other links are not claimed certified.

## 4. Source platforms and ownership

Observed IR families now: **GCS 8, Q4 8, STOCKPR 7, WEB_DRIVER 2, GENERIC 7** issuer configurations. Counts can overlap. Existing adapters are extended through empirical advertised endpoints, not thousands of issuer-specific scrapers. Two bounded candidate rounds processed 25 companies each, preserving attempts and partial progress. Official domains rose **46 → 59**, IR pages **22 → 30**. CVS and Entergy newly discovered feeds then returned ten and fifteen accepted stories with two feed requests.

Ownership remains master-authoritative: exact CIK, validated corporate names/domains, official navigation, issuer-scoped feed resolution and explicit delegated materials. A corporate homepage is not an IR page. Wrong-contributor/stock/exchange metadata, unrelated redirects and scoped feeds containing other issuers fail closed. An issuer-owned announcement about a subsidiary, partner or another named company cannot confirm the parent’s earnings calendar. The 891 Wikidata domain candidates are still candidates, not active sources.

## 5. Material company intelligence

Current material coverage combines fresh financials, verified recent reports/releases, material SEC item disclosures, HIGH/CRITICAL matched news and confirmed upcoming earnings. CIK identity, an empty feed and an unverified candidate are insufficient. Financial/news freshness is 180 days; material SEC freshness is 90 days. Historical documents/calls remain accessible and are reported separately.

One `MATERIAL_SEC_EVENT` bundle represents each qualifying 8-K accession and retains item codes, filing date, evidence, source link and deterministic classification. **17,657 retained material bundles** include historical data. This count is not today's news or a count of independently verified transaction facts.

## 6. SEC enrichment and global discovery

`sec_stream.py` reuses the existing SEC HTTP client, rate limiter, cache and master-index parser. It scans at most three completed index days per normal run, joins exact master CIKs, transactionally records a durable queue/cursor and refreshes only changed issuers. Current-day indexes are excluded. Compact SEC metadata survives fresh runners; production SEC archives and fundamentals outputs remain read-only.

Mappings include 1.01/1.02 agreements, 1.03 bankruptcy, 2.01 acquisition **or** disposition completion, 2.03/2.04 obligations, 2.05 restructuring, 2.06 impairment, 3.01 listing-compliance notices, 3.02 equity issuance, 3.03 rights changes, 4.01 auditors, 4.02 accounting non-reliance and 5.02 management/director/compensation disclosure. Item 5.02 does not prove a CEO departure; 3.01 does not prove actual delisting. 7.01/8.01 alone stay ordinary filings. Item 2.02 uses the earnings verifier.

An actual SEC index revealed `File Name` headers and compact YYYYMMDD dates; the parser was corrected and regression-tested. 403/404 index days become audited retry gaps, rather than falsely healthy empty days; later completed days continue. Corrupt headers/500/timeouts do not silently advance. Wrong response CIK is rejected before durable metadata is written. The normal stream now initially imports only 180 days of submissions, preserving previously retained history; explicit backfills remain bounded and resumable.

## 7. Earnings intelligence

Existing SEC/XBRL consumer facts still provide **4,869 summaries (80.11%)**, **3,722 fresh (61.24%)**. Revenue, EPS, net income, gross/operating profit and margins, operating/free cash flow, CapEx, cash, debt and shares remain unit/period/accession checked. Missing values stay unavailable. Values are latest-known retrospective data, not certified point-in-time facts.

The ledger now has **73 published releases**, **11,654 unverified candidates**, **14,809 periodic reports**, and **4 operating updates**. The large historical candidate/report counts came from the controlled wider metadata backfill; candidates are never counted as published earnings. A 6-K description alone now produces a candidate. Two legacy Unilever descriptions were corrected while preserving IDs/filing links/dates. Document contradiction cannot be overridden by a convenient description.

Official or corroborated issuer-authored distributor releases can establish publication, with explicit evidence; subsidiary/partner results cannot certify parent earnings. A weaker SEC candidate cannot revoke independently verified first-party publication. Fiscal labels/report ends come from evidence; no quarter is derived from an 8-K calendar month.

## 8. What Changed, guidance and KPIs

Quarterly YoY/QoQ require compatible units and plausible gaps. TTM sums contiguous quarterly flows, excluding balance values and EPS. Nonpositive bases and fiscal changes expose comparability reasons. Revenue acceleration compares two observed growth rates; margins use percentage-point changes. FCF changes preserve negative values. Cash/debt/share-count direction is neutral pending context; share count alone does not prove dilution or distinguish a split/buyback.

Narrow explicit-period numeric guidance retains bounds/midpoint/unit/currency/source/evidence/confidence. NVIDIA Q3 FY2027 revenue evidence remains 108B +/-2%, bounds 105.84–110.16B; bare `$` remains unverified currency. No invented raised/lowered judgment. The extensible deliveries/production/retention/NIM framework rejects ambiguous comparative numbers and uncertain periods; broad real KPI coverage is not claimed. Classification `rules-1.2.0` now recognizes explicit regulatory applications/European Medicines Agency announcements without calling a submission an approval. Coverage and exports use the same current classification.

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
| Consumer payloads | 4,972 (81.8%) |
| Fresh financial summaries | 3,722 (61.24%) |
| Any recent material intelligence | 3,982 (65.51%) |
| Active first-party news, with accepted owner stories | 23 (0.38%) |
| Active external news | 28 (0.46%) |
| Any current accepted news | 51 (0.84%) |
| Authoritative SEC identity | 5,412 (89.04%) |
| Refreshed SEC submissions | 1,081 (17.79%) |
| Recent material SEC disclosures (90 days) | 594 (9.77%) |
| Confirmed upcoming release/call | 1 (0.02%) |
| Estimated upcoming earnings window | 186 (3.06%) |
| Call references | 5 (0.08%) |
| Webcast/replay links | 2 (0.03%) |
| Presentation references | 17 (0.28%) |
| Company transcript references | 7 (0.12%) |
| IR pages | 30 (0.49%) |
| Official domains | 59 (0.97%) |
| No consumer payload | 1,106 (18.2%) |
| No current news | 6,027 (99.16%) |

There are 666 issuers without a verified SEC identity (10.96%); this is separate from no-payload coverage. Registry: **41 sources; 38 ACTIVE, two EMPTY, one INACTIVE**, zero current feed parser failures, blocked registered sources or stale registered sources. Discovery separately has **ten BLOCKED, one DEGRADED, 47 validated bounded walks**, with other issuers not walked. Never count blocked navigation as a live feed. There are 24 active registered issuer news feeds but only 23 issuers with qualifying fresh owner news; the stricter number is the product coverage metric.

Master listing-country labels are US even for ADRs; they do not establish issuer domicile. Exchange/family groups overlap for multi-listings. No unsupported market-cap or US/non-US breakdown is invented. Coverage JSON retains reasons, statuses, endpoints and source evidence.

## 14. Before / after

| Metric | Phase 2 | Phase 3 |
| --- | ---: | ---: |
| Supported issuers | 6,078 | 6,078 |
| Payloads | 4,873 | 4,972 |
| Financial summaries / fresh | 4,869 / 3,722 | 4,869 / 3,722 |
| News stories | 219 | 294 |
| Active issuer news feeds | 19 | 24 (23 with qualifying owner news) |
| Any current news | Not previously measured under this definition | 51 |
| Official domains / IR pages | 46 / 22 | 59 / 30 |
| Refreshed SEC issuers | 24 | 1,081 |
| Recent structured material SEC issuers | No material-item layer | 594 |
| Published earnings events | 60 | 73 |
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

After the network backfill, three full-universe runs on the frozen producer took approximately **40.1, 43.3 and 42.7 seconds**. Each processed all 6,078 issuers with **zero network requests, zero new items, zero duplicates and zero source/SEC failures**. News/event/source/alias identity hashes remained identical; complete news/source/alias hashes remained identical. Projected timestamps/financial-summary metadata can update, so different run timestamps correctly yield different export generations.

A final coverage-only fix included direct call presentation links (Chemed), aligning coverage with consumer references. Its full-universe rerun also preserved all four identity tables and complete news/source/alias hashes. Fresh restoration reproduced exact full ledger hashes and the same generation with the same producer/timestamp/authoritative sites. Archive rows were compared logically after staged VACUUM. The five-day stream queue is empty and 1,063 checkpoint identities persist. Remote acceptance repeats the equivalent restore/update/restore property with actual R2; it never passes a ledger through an artifact.

## 17. Failure recovery and adversarial review

Tests cover 403/404/429/500/503, timeout/DNS, robots denial, malformed XML/JSON/HTML, oversized responses, malicious XML, unsafe/private URLs, redirect abuse, damaged SQLite, checkpoint digest/size/path traversal, missing state, partial uploads/pointer failure and fallback to a verified previous slot. Permission failure never initializes an empty replacement ledger. One source/issuer failure remains isolated; budgets defer with durable progress.

Actual defects fixed: SEC index date/header variation; incidental Nasdaq index notices resolving to NDAQ; wrong SEC response poisoning durable metadata; legacy foreign descriptions claiming earnings; subsidiary/partner earnings publication and calendar attribution; future-tense release titles incorrectly claiming publication; weak candidates overriding independently verified publication; dangling aliases after pruning; malformed backslash links; next-day calls with conflicting periods; stale material disclosures dominating preview; regulatory applications treated as routine; coverage disagreeing with the current classifier; immutable generation reuse after producer changes; private-ledger copies in preview caches/artifacts. Each material engine/security finding has a regression test or real browser/workflow check.

Integrity audit found zero wrong CIK filing links, orphan aliases, estimates marked confirmed or material-event fiscal periods inferred from an 8-K date. It also checked description-only foreign publication claims. This is targeted evidence, not certification of every external fact.

## 18. Performance, scheduling and storage

Ten 100-issuer drain batches plus a final 21-issuer batch used **1,008 SEC requests / 1,103 seconds**; the initial successful index/batch used another 52 requests / 55.7 seconds. Checkpoints represent 1,063 unique issuers; overlapping selections explain the larger processing-attempt count. Public source research/discovery is recorded separately. The ten-company material probe used 48 SEC + three public requests in 65.6 seconds. Candidate rounds used 100 requests / 421.5 seconds and 66 / 370.0 seconds, including bounded time/request deferrals. New-feed validation used two requests / 17.2 seconds for 25 new stories.

The wider history initially increased full-universe runtime to 103.4 seconds. Per-filing SQL indexing, per-period summary reuse and unchanged-event write avoidance reduced steady runs to ~40–43 seconds. Conditional requests, response memoization, robots caching and host delays remain implemented; discovery rounds observed four cache hits and 22 memo hits, but zero 304s. No invented conditional-network savings are claimed. The second global-feed poll suppressed 17 duplicate representations while accepting two genuinely new stories.

Normal proposed cadence remains six-hour SEC/feed batches, 75 changed issuers/run: capacity **300 issuer refreshes/day**, versus ~213 unique issuers/day in the observed five-day sample. This is a pilot sizing estimate, not a guaranteed upper bound; bursts queue durably. Three completed index days/run catch missed time. Optional document inspection is limited to four issuers/run. Global discovery polls sources, not 6,078 per-issuer queries. Catalogue discovery is weekly; source navigation is infrequent/checkpointed; blocked sources cool down. No schedule flag was activated. The preview job has a 25-minute outer limit to reserve checkpoint/write time after bounded catalogue, stream and discovery lanes; normal per-lane network budgets remain unchanged.

Current historical ledger is ~363 MB, archive ~201 MB and transient HTTP cache ~61 MB before the 64 MiB cap. Public exports are ~215 MB/generation, retaining only current+previous (~430 MB), larger than the earlier ~55 MB snapshot because much more history is represented. No export history enters Git. Checkpoints compact staged SQLite backups only, cap HTTP cache pairs at 64 MiB and enforce 128 MiB compressed / 1 GiB expanded. Cache eviction removes whole metadata/body pairs; cache misses refetch safely. Ledger history is retained, not silently discarded to pass size limits.

Illustrative growth, **not a measured forecast**: 500 new normalized rows/day at 2 KB/row plus 25% indexing yields ~38 MB/month, 456 MB/year, 2.28 GB/five years beyond the current private state. Public current/previous snapshots stay bounded by section/payload limits rather than accumulating a generation per poll. At this scenario the expanded checkpoint threshold is approached in ~one year. Cold archive partitioning into the same private R2 infrastructure is required before capacity, not a new vendor or silent history deletion. Guard failure preserves the previous remote pointer. A wider public-source rollout must size its archive/working-set policy from actual ingestion rates.

## 19. Cost and request responsibility

**Financial/news data-provider cost: $0.** No new runtime dependency, service, database or paid transcript/calendar/news provider. Existing GitHub runners and R2 are reused. At current checkpoint size two remote slots are roughly 120 MB; operation counts are single-digit per sync stage, not per ticker. Incremental storage/request cost is small and may fit existing free allowances; account billing/quota was not independently certified. Four daily runs at an illustrative eight minutes are ~960 Actions minutes/month, plus occasional discovery; actual paid/free quota depends on the existing account. Disabled schedules currently add no scheduled runtime.

Public HTTP identifies Vision Universe, respects robots, uses global/host delays, finite retries/timeouts/2 MiB responses and caching/ETag/Last-Modified. SEC uses the existing identified, throttled client. No article-body republishing, paywall bypass, rate-limit evasion or credential logging.

## 20. Tests and regressions

Final feature suite: **121 Python tests and 15 Node tests passed** (Phase 2: 94/14). Added acceptance/restore, privacy, distributor ownership, ambiguity, SEC-item/category, index/date/gap, wrong-CIK, import-horizon, alias/prune, candidate/provenance, next-day/time-period, share-context, cache-cap and generation-version tests. Real metadata fixtures include GlobeNewswire and recorded Root news. Workflow private-copy exclusion has a regression guard.

Existing suites passed locally and in authenticated Actions validation: **2,507 Node product tests passed, five existing skips; 484 SEC tests passed; 63 additional Node/serving tests passed; 32 VU2 Python tests passed**. No test was weakened. Intermediate failures were investigated and corrected; real source/access failures remain explicit in probe evidence. Pending workflow runs replaced by GitHub's single pending concurrency slot are cancellations, not acceptance passes.

Browser: **52 cases**, 13 listing views at 390/430/768/1440 pixels, zero page errors/overflow; default-disabled view made zero intelligence fetches. Tesla/Chemed/Ultragenyx outputs were also inspected. Workflow YAML and all Bash blocks parse, JS syntax and diff whitespace checks pass. Final PR validation status is recorded with remote preservation.

Protected-path diff remains empty against both Phase 3 and original architecture baselines: Company Master/universe, SEC fundamentals, Quant/Discover/Supertrader/Screener/Markets, market prices/intraday/EOD, existing APIs/deployment are unchanged. A generated production test artifact was restored after the regression suite.

## 21. Security / privacy

Authenticated Cloudflare read-only privacy checks proved managed public access disabled and zero custom domains, before private writes and on every acceptance runner. Missing credentials, permission rejection, unknown schema or public exposure fail closed. Secrets remain existing Actions bindings: `VU_HISTORY_S3_ENDPOINT`, `VU_HISTORY_S3_BUCKET`, `VU_HISTORY_S3_REGION`, `VU_HISTORY_S3_ACCESS_KEY_ID`, `VU_HISTORY_S3_SECRET_ACCESS_KEY`, plus an available existing Cloudflare token binding for read-only account/bucket-domain verification. Local R2 bindings were absent, but Actions authentication worked; earlier configuration-read 403 did not imply dispatch/access was impossible.

Private state stays under fixed sanitized namespaces, with pointer-last writes and read-back hash verification. No private DB/cache is newly copied into GitHub preview artifacts or caches. Non-durable previews are explicitly ephemeral; durable/scheduled runs require private R2 state. Old preview artifacts/cache entries from previous versions were not destructively removed and expire under their existing retention. Consumer exports/review reports remain separate from operational checkpoints. All workflow permissions remain `contents: read`.

Both the public site and loopback preview returned **404** for `.company-intelligence/state.sqlite` and the tested private R2-prefix path. Public bucket-domain configuration was checked independently; no generic production endpoint accepting arbitrary intelligence object keys was added. UI/transport URL/XML/HTML guards remain tested. No production publishing occurred.

## 22. Known limitations

Current external/first-party news reaches 51/6,078 issuers. Short distributor RSS windows, sparse official domains and JS/blocked IR pages limit recall. Source availability does not guarantee full licensing for every later commercial use; uncertain/disallowed providers stay out. Exact contributor/ticker/exchange matching deliberately sacrifices recall. No broad paid-provider equivalence is claimed.

Only a bounded subset receives document-level earnings verification; candidates and uncertain periods remain explicit. 1,147 financial summaries are stale; current facts remain retrospective. Guidance/KPIs are narrow; materials/calls/transcripts can be historical or unlinked. The standalone preview is not a deployed stock-page integration. The full historical pilot checkpoint was validated locally, while authenticated R2 proofs used bounded representative state. Long-term archive capacity needs a measured partition policy before growth reaches enforced bounds.

## 23. Remaining blockers and operating commands

**Code merge:** no remaining demonstrated blocker behind the disabled/controlled gate, subject to final green validation. Authenticated state recovery, privacy, failure isolation and protected-system regressions are proven.

**Broad production rollout:** the intended regular branch namespace still needs a controlled initialization/restore pilot at the real operating working-set size, plus reviewed enablement of the existing readiness flags. News polling/retention/source breadth must support the promised consumer experience; 51 issuers and twenty-entry rolling feeds do not justify universal-current-news claims. Delivery/public export integration and the archive capacity policy need operating acceptance before sustained broad exposure. These are rollout gates, not a demand for 100% coverage or a reason to add paid data.

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

Authenticated acceptance dispatch uses `acceptance=true`, performs no deployment and does not enable flags. Regular durable dispatch also requires explicit `COMPANY_INTELLIGENCE_STATE_READY=true` and first-run initialization; automatic schedule additionally requires `COMPANY_INTELLIGENCE_ENABLED=true`. Neither was activated. Missing/corrupt state never falls back to an empty cache-ledger. JSON/audit/source/index-gap/queue state explains missing news, rejects, material categories, calendar estimates and recovery.

Important new/changed paths: `sec_stream.py`, `sec_events.py`, `distribution.py`, `acceptance.py`, `privacy.mjs`; isolated pipeline/model/earnings/store/coverage/transport/checkpoint/CLI; source configuration, consumer contract/preview, isolated workflow, acceptance tests and reduced evidence fixtures. No unrelated production files changed.

## 24. Readiness and preservation

The complete intelligence layer is additive, conservative and useful, with proven private durable semantics and much broader material-event discovery. Broad news remains a real product gap, clearly separated from financial/regulatory intelligence. PR #339 stays draft; no merge, public deployment or scheduled activation. Validated changes and this report are committed and pushed with exact local/remote SHA verification in the final delivery. Generated pilot history/caches stay out of Git; committed metadata/count/hash fixtures preserve reviewable evidence.

CODE-MERGE-READY: YES

PRODUCTION-ROLLOUT-READY: NO
