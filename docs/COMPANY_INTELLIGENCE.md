# Company Intelligence Engine — Phase 2 engineering report

Validated on **2026-10-02**, continuing `feature/company-intelligence-engine` from the fetched and verified local/remote commit `cb9c8a3e828f93e87990b90bfe9179fa92adc110`. Original architecture baseline: `18bc2dddfaebcf3ec97079364f1203c2c09f83cb`. No merge or public rollout was performed. The tracked production intelligence manifest remains disabled.

## 1. Executive result

An additive intelligence layer now projects the entire existing 6,078-issuer universe, exports 4,873 company payloads, and makes validated financial summaries available for 4,869 issuers. The broader first-party pilot has 19 issuers with active news sources, 22 proven IR pages, 46 known/validated domains and 891 domain candidates. The ledger contains 219 normalized news stories, 60 earnings-release events, SEC reports, calendars, calls and presentation events. Sources degrade independently.

The important remaining acceptance blocker is **authenticated durable operation**: this workspace lacks R2 credentials; authenticated GitHub Actions configuration requests return HTTP 403. Local fresh-runner recovery and the existing signed S3 driver's interface are tested, but actual bucket privacy, namespace permissions and two authenticated Actions restore/write cycles cannot be certified here. Scheduling and public exposure must remain gated.

## 2. Architecture and protected boundaries

The previous SQLite ledger, source registry, resolver, issuer-scoped grouping and immutable exports are retained. This phase adds coverage reporting, catalogue discovery, candidate backfill, durable checkpoints, material discovery and narrow evidence enrichment. No runtime dependency, paid provider, hosted database, production producer or existing public API was added or replaced.

| Existing contract | Additive consumption |
| --- | --- |
| `quant/data/universe/instruments/<prefix>.json` | Authoritative active COMMON_STOCK/ADR subset, ELIGIBLE/SEPARATE_CLASS/REVIEW. Preserve instrumentId, masterMemberId, ticker, exchange, class and verified CIK. |
| Existing issuer identifiers | Group only master-verified CIK share classes. Unresolved issuers retain instrument identity; ticker collisions fail closed. |
| SEC `JsonRawStore` | Read existing submissions; never write its production archive. |
| SEC canonical / inspector index | Canonical ticker data used only with proven ticker/CIK identity. |
| SEC consumer CIK files | Validate schema, seven-column arrays, units, policy, accession provenance, dates and nonfinite/duplicate facts. |
| Existing SEC HTTP client | Reuse `SECHttpClient`, `SECProvider`, `RateLimiter`, `.sec-cache`; no companyfacts downloads. |
| Daily fundamentals manifest | Read `quant/data/fundamentals/daily/updated-issuers.json`; checkpoint issuer/accession work without modifying its producer. |
| Existing R2/fs drivers | Reuse unchanged storage drivers under `v1/company-intelligence/state/<branch-hash>/`. No bucket configuration or production-object modifications. |
| Existing static architecture | Dedicated sharded consumer contract and standalone preview. No stock-page redesign or existing deployment changes. |

Main files: `cli.py`, `coverage.py`, `discovery.py`, `platforms.py`, `pipeline.py`, `earnings.py`, `enrichment.py`, `sec_documents.py`, `ir_events.py`, `materials.py`, `store.py`, `transport.py`, `checkpoint.py`, `sync-state.mjs`; additive contract/preview changes; isolated workflow; fixtures and hardening tests. All are in Company Intelligence paths.

## 3. Universe coverage

Denominator: **6,078 company/issuer identities**, not listing rows or every instrument in the master.

| Metric | Companies | Universe percentage |
| --- | ---: | ---: |
| Official-domain candidates (not ownership proof) | 891 | 14.66% |
| Known or ownership-validated official domains | 46 | 0.76% |
| IR pages found (excludes corporate homepages) | 22 | 0.36% |
| Issuer news sources discovered | 19 | 0.31% |
| Issuer news sources validated | 19 | 0.31% |
| Issuer news sources with active content | 19 | 0.31% |
| Event sources found | 5 | 0.08% |
| Event sources producing events | 3 | 0.05% |
| Earnings/results pages found | 21 | 0.35% |
| Call source or normalized call found | 4 | 0.07% |
| Presentation endpoints found | 18 | 0.3% |
| Verified SEC identity in existing master | 5412 | 89.04% |
| Issuers with refreshed submissions in this ledger | 24 | 0.39% |
| Validated local financial summaries available | 4869 | 80.11% |
| Financial period within 180-day freshness guard | 3722 | 61.24% |
| Issuers with confirmed upcoming release/call | 1 | 0.02% |
| Issuers with estimated upcoming windows | 11 | 0.18% |
| No issuer feed or refreshed submissions | 6040 | 99.37% |
| No issuer source, known official site or usable financials | 1207 | 19.86% |

The single bounded Wikidata query checked all 5,412 verified CIKs; this is **candidate discovery**, not 5,412 website crawls. There were 73 candidate-site validation outcomes: 29 validated, 44 rejected. Rejections included 28 ownership failures, 13 access/robots failures, two unrelated redirects and one oversized page. Legacy official-site seeds account for the other 17 known domains.

Registry: 31 sources, including one inactive experimental GDELT source; 28 ACTIVE, two EMPTY, one INACTIVE, zero current feed parser failures. IR discovery separately records 35 successful bounded walks, ten BLOCKED and one DEGRADED; 6,032 issuers have no IR walk. Successful corporate navigation is not a proven IR page. A successful HTTP response with old content is not active news. Failures and historical audit warnings remain visible.

`coverage.json` includes per-issuer evidence, source states, missing-data reasons, endpoints, exchanges and master listing country. All current master listing-country labels are US, including foreign issuers' US listings; this does **not** establish issuer domicile. Exchange/family counts can overlap for multiple listings/configurations. No unsupported US/non-US or market-cap classification is invented.

## 4. News

Source tiers: validated company newsroom/IR feeds; SEC regulatory evidence; existing permitted Wallstreet-online public RSS as optional broad discovery. GDELT remains inactive and experimental. No paywalls, prohibited access-control bypass or paid news service.

RSS, Atom and JSON Feed preserve headline, URL, publication/update precision, publisher, discovery source, original source, language where present, source confidence, match evidence and provenance. Missing summaries remain missing. Full publisher articles are not republished. Transient private HTTP caches contain structured feeds/pages, not a mirrored article product.

The inverted name index uses legal names, distinctive names plus financial context, explicit unique tickers and validated first-party ownership. Query hints do not prove identity. Root/Unity/Block/Toast/Target/Affirm/Meta/Oracle/Apple protections remain; actual-master regression cases now include ONON, GAP, MTCH, LTH and OPEN. German financial context helps distinctive NVIDIA/Tesla titles without accepting generic words. Shared Business Wire/GlobeNewswire/PRNewswire URLs require independent entity evidence, even when discovered through an official feed.

Deduplication remains issuer-scoped: canonical URL/exact identity, normalized titles within 72 hours, or similarity >=0.94 with substantial titles and matching numeric/action/category evidence. Different numbers, opposite actions, corrections and reused URLs stay separate. Stable group IDs and up to 32 provenance references survive reruns; truncation is explicit. Broad paraphrase clustering remains conservative.

Explainable `rules-1.1.0` classification covers earnings, guidance, financing, M&A, management, regulation/litigation, products, contracts, operations, dividends and other existing categories. Production/clinical results do not become earnings. Franchise/business purchases and stock offerings are material. Reclassification preserves IDs and publisher timestamps, including older ledger records.

## 5. IR platform discovery

One exact-CIK CC0 catalogue request seeds candidates; ownership requires a corporate title, legal company name and safe same-domain response. Only validated domains or existing official seeds authorize bounded IR navigation. Follow official investor links, rel=alternate feeds, structured events and delegated documents; never crawl an entire site or guess thousands of company domains.

Observed IR fingerprints: **GCS/Nasdaq: 7 issuers; Q4: 5; STOCKPR/Equisolve: 6; WEB_DRIVER: 1; GENERIC: 5**. Multiple configurations can produce overlapping family counts. Fingerprints come from script/link/meta URLs, not vendor names in prose. WordPress corporate sites were observed but are excluded from IR-family success unless a genuine IR page is established. No unobserved provider is claimed supported.

Generic adapters handle GCS RSS, Q4 press/event/presentation feeds, STOCKPR-style RSS and advertised RSS landing pages. Intel's `news-events/press-releases/rss` is news; Q4 singular `rss/event.aspx` is events; `rss/presentation.aspx` yields materials/timeline events rather than news. Corporate pages explicitly delegate CDN material links; shared news publishers are not document-feed ownership shortcuts. Reduced real fixtures cover Root/Affirm and Intel/Intuit families plus Alphabet.

## 6. SEC and earnings detection

Supported domestic/foreign forms: 8-K, 10-Q, 10-K, 6-K, 20-F, amendments and DEF 14A. Item 2.02 remains a candidate until explicit release proof; ordinary 6-Ks and operating updates are not earnings. Periodic reports are distinct from releases. Current ledger: **60 EARNINGS_PUBLISHED, 424 EARNINGS_CANDIDATE, 503 PERIODIC_REPORT_PUBLISHED, 2,014 SEC_FILING and one OPERATING_RESULTS_PUBLISHED**.

Optional document inspection uses the existing client, at most two recent candidate filings and one exhibit each per selected issuer. `sec-documents-1.3.1` recognizes explicit fiscal grammar, report-end evidence and actual financial results; rejects future board approvals, vehicle-production announcements and clinical-quarter results. Compatible older proof is re-evaluated conservatively from retained evidence; source links, parser version, short evidence, verification state and failure cooldown survive runner changes.

Fiscal identity comes from validated canonical metadata, exact report-end matches or explicit fiscal labels. Never derive a fiscal quarter from calendar month or an 8-K reportDate. Foreign annual 20-Fs remain FY. Corrected Tesla/XPeng cases are regression-tested and real SEC primary/exhibit responses were inspected. Amendments and conflicting explicit call periods remain separate.

## 7. Earnings intelligence and What Changed

Reuse existing SEC/XBRL consumer outputs for revenue, diluted EPS, net income, gross profit, operating income, operating cash flow, free cash flow, cash, debt, CapEx and shares; derive gross/operating margins only with compatible currency/period evidence. Missing metrics remain unavailable.

Quarterly YoY/QoQ comparisons require compatible units and plausible period gaps. TTM sums contiguous four-quarter flows; never sum balance-sheet values, shares or diluted EPS. Annual comparisons remain separate. Nonpositive bases have no fabricated growth percentages. Fiscal-calendar changes fail comparability checks.

`whatChanged` exposes previous/current values, absolute/percentage-point changes, source accessions and classifications. Revenue-growth acceleration uses two observed YoY rates. Cash/debt changes carry neutral interpretation because direction alone is not universally good. Unsupported or missing observations do not yield invented narratives.

All values remain **LATEST_KNOWN_RETROSPECTIVE / NOT_CERTIFIED PIT**, with `sourceAsOf`; they are not certified contemporaneous release facts. Data-source provenance is verified, not an independent re-audit of every upstream accounting value. Financial periods older than 180 days are visibly stale: **1,147 of 4,869 available summaries**. Stale figures remain accessible; they are not called current.

## 8. Guidance and KPI framework

`enrichment.py` supports narrow explicit-period revenue ranges and midpoint +/- tolerances, numerical consistency, scale, source URL, evidence and confidence. Explicit USD/US$ is verified as currency; `$` alone remains UNVERIFIED_CURRENCY. No LLM, guidance judgment or inferred numerical fact.

Real NVIDIA Q2 FY2027 SEC outlook evidence: next-quarter revenue **108.0 billion +/-2%**, bounds **105.84–110.16 billion**, Q3 FY2027. The bare dollar symbol does not certify USD; that limitation is exposed. Earlier Q1 evidence yields Q2 FY2027 bounds 89.18–92.82 billion. Reparsed guidance replaces obsolete evidence without changing event IDs.

The extensible KPI registry initially recognizes explicit deliveries/production, net-retention and net-interest-margin patterns with a verified fiscal period. Multiple comparative values, forward-looking language and unknown periods are rejected. This is a framework, not broad proven SaaS/banking/segment extraction; no real issuer KPI coverage is claimed beyond retained high-confidence evidence.

## 9. Earnings calendar

Confirmed dates require validated first-party event/announcement evidence. **One issuer currently has confirmed upcoming earnings/call coverage; 11 issuers have 14 estimated windows.** A call date is not silently presented as the release date.

Chemed: confirmed Q3 2026 release **October 27, date-only, following market close**; confirmed call **October 28, 10:00 America/New_York / 14:00Z**. Its September 30 reporting-period end is ignored as an event date. A composite announcement cannot attach the call's date to the release. Source evidence and confidence remain attached.

Estimates derive bounded windows from repeated historical release/report dates, fiscal-period cadence and year-ago timing; sparse/unstable history yields no estimate. Never use comparative-fact revision dates as publication history. Confirmations suppress overlapping estimates; estimated-to-confirmed transitions and official reschedules retain audit history. Ambiguous/nonexistent DST times and floating calendar times are rejected; explicit JSON-LD offsets preserve the local day.

## 10. Calls

**12 normalized earnings calls**, four issuers with a call source/event. Root's official Q2 call page supplied a public webcast link. Chemed's upcoming call includes explicit quarter/year/timezone. Calls attach to a release only with a unique same-issuer same-date period and no conflicting explicit fiscal labels. Unsupported next-day linkage is left unlinked rather than guessed. Webcast/replay/material links survive re-ingestion.

No paid transcript provider. Missing transcript is valid. Company-hosted transcript references are stored without copying the document; prepared remarks/earnings scripts are distinguished from full transcripts.

## 11. Presentations and reports

Current consumer views contain **34 presentation references across 13 issuers**, including four Boeing PRESENTATION_PUBLISHED timeline events; five shareholder-letter references across three issuers; 12 company-transcript references across five issuers; and 275 financial-report references across 35 issuers. These are discoverable references, not complete period-verified material coverage or unique underlying document counts.

Explicit official-page/structured-feed links carry owner evidence and source URLs. Unknown document date, fiscal period or event association stays null. Existing SEC documents are linked without redundant hosting. Validated financial-fact accessions produce **SEC_FACT_FILING_REFERENCE**, never fictitious new SEC timeline filings from comparative revisions.

Robots-aware HEAD checks returned HTTP 200 for all six samples: Apple newsroom story, Root call page, Chemed future call page, Boeing story (safe HTTP-to-HTTPS redirect), Coca-Cola company-hosted Q2 transcript PDF and Applied Materials presentation. Not every exported link was fetched; missing/inaccessible sources degrade normally.

## 12. Consumer contract and timeline

Schema `vu-company-intelligence-1.0.0` retains news/events/earnings/filings/calls/timeline/listings; additive optional `latestFinancials`, `materials` and `presentations` preserve existing consumers. Identity, generation/path, array limits, calendar confidence and timestamp checks fail closed. UI uses DOM textContent/createElement and checked links; no raw external HTML.

Timeline types include NEWS, SEC_FILING, PERIODIC_REPORT_PUBLISHED, verified/candidate earnings, OPERATING_RESULTS_PUBLISHED, EARNINGS_SCHEDULED, EARNINGS_ESTIMATED, EARNINGS_CALL, IR_EVENT and PRESENTATION_PUBLISHED. Rich earnings events suppress redundant primary filing/news representations when source identity is established; originals remain in richer sections/provenance.

Standalone preview now demonstrates news, next events, latest earnings, current/stale financials, deterministic What Changed, guidance evidence, materials, filings and calls. Default-disabled preview makes zero intelligence requests. No unrelated stock-page/mobile/product redesign.

## 13. Real-world examples

| Issuer | Inspected output |
| --- | --- |
| AAPL | First-party newsroom; Q3 FY2026 ends June 27, 2026; existing revenue 109.417B, diluted EPS 2.02, FCF 31.914B. Original fiscal labels preserved. |
| NVDA | Verified Q2 FY2027 ends July 26, 2026; existing revenue 96.221B, EPS 2.46, FCF 21.4B; explicit Q3 outlook ranges with unverified currency clearly marked. |
| MSFT | Q4 FY2026 ends June 30; quarterly/annual reports remain distinct; financial comparisons use source periods. |
| TSLA | Delivery update is operations, not earnings; July 22 Q2 release is earnings. Negative FCF remains negative, not fabricated growth against a nonpositive base. |
| XPEV | August 25 foreign Q2 release verified; August 4 future board-approval notice rejected as published earnings. Missing quarterly revenue/EPS remain missing, older balance facts visibly stale. |
| ROOT | Ambiguous-name guard plus validated official feed; Q2 release, shareholder materials and historical call/webcast; first-party/SEC evidence groups conservatively. |
| AFRM | First-party Q4 FY2026 release and current partnership stories; non-calendar fiscal quarter preserved. |
| CHE | Separate confirmed October 27 earnings release and October 28 10:00 EDT call; subsidiary franchise purchases classified as material company announcements from its own source. |
| BA | Official news feed plus four presentations; singular event feed yielding no parseable event remains EMPTY. |
| GOOG/GOOGL | One Alphabet issuer, distinct listings, shared official Q4 feed and no share-class leakage. |
| ACU/SGI | Sparse metrics remain unavailable; renamed Somnigroup keeps verified issuer identity. |

Live selected cohort expanded to 60 tickers/59 issuers before candidate batches, including all requested AAPL/NVDA/TSLA/MSFT/XPEV/PLTR/SOFI/ROOT/U/XYZ/TOST/TGT/AFRM/META/GOOG/GOOGL plus ACU/SGI, SaaS, semiconductors, banks, ADRs and unusual fiscal calendars. Additional discovery/SEC validation covered AXP, AVT, BSET, HRB, BA, BC, CHE, DLX, EFX, AVD, CALM, CAG, PRGS and GURE. Generic-name false positives were tested separately from live source availability.

## 14. Full-universe and broader runs

Every authoritative issuer was processed offline; no unsupported equity was independently inserted. Final full-master projection: PASS, **11.49s**, **zero public/SEC requests**, **4,873 exported company payloads**, ledger **60514304 bytes**. It is a full-master facts/contract run, not a claim of live news coverage for all 6,078 issuers.

| Controlled live run | Selected issuers | Seconds | Public requests | SEC requests | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| expanded-probe1 | 34 | 295.884 | 72 | 0 | DEGRADED |
| expanded-probe2 | 25 | 423.218 | 103 | 0 | DEGRADED |
| earnings-probe | 8 | 38.761 | 0 | 37 | PASS |
| candidate-backfill2 | 15 | 310.691 | 75 | 0 | DEGRADED |
| daily-manifest-real1 | 3 | 18.111 | 0 | 15 | PASS |
| daily-manifest-real2 | 3 | 13.785 | 0 | 11 | PASS |

One catalogue request found 891 candidate issuers. The first larger candidate batch reached its 180-request cap, then coverage reporting failed on `lastError: null`; completed ledger work survived. The null-error bug was fixed and regression-tested. The following 15-issuer batch resumed saved per-company progress, made 75 requests, added 105 stories and reported one isolated discovery warning. Failures are not hidden behind process success.

## 15. Repeated runs

Final cycles: full-master offline **12.001s**, due-source incremental **3.631s**, full-master offline **12.163s**; all PASS and **zero external requests** because sources were not due. News/event/source IDs, 219 stories, 3,057 events, 31 registry entries and ledger size **60,301,312 bytes** remained stable across these cycles. Fresh snapshots have new generatedAt/generation identifiers; their content and identities remain reproducible for the same input/time.

Earlier forced validation reruns each made seven public requests with five HTTP 304s, six cache hits, 69,109 downloaded bytes, 68 duplicate sightings and zero new stories; another ordinary rerun made zero requests. Repeated force is a probe option, not unattended behavior.

The real daily manifest processed AVD/BSET/CALM, then CAG/PRGS/GURE, in two successful runs with 15 and 11 SEC requests. Six issuer/accession checkpoints persist; five unfinished manifest entries remain queued. A newer or empty producer manifest cannot discard that queue. Retry cooldowns prevent a failed issuer from starving the rest.

## 16. Failure recovery and adversarial reviews

Tests cover 403/404/429/500/503, timeout/network failures, malformed XML/JSON, redirect loops, oversized/decompressed payloads, private destinations, robots failures, bad source ownership, corrupted snapshots and failed object writes. Budgets produce DEFERRED with committed progress; operational source failures produce DEGRADED and continue. Fatal unsafe state/configuration and concurrent writers fail closed. Source/checkpoint 403 is never treated as a missing ledger.

Five review rounds produced material fixes:

1. Product completeness: entire-master financial projection, What Changed, guidance evidence, first-party calendar, calls/materials and stable consumer integration, alongside broader source discovery.
2. Adversarial data: corporate/IR overcounts, empty-event coverage, shared-publisher wrong-issuer shortcuts, Q4 feed roles, reporting-period vs event dates, conflicting call quarters, old classification/evidence, fiscal-gap comparisons, EPS summation, debt/cash judgment, DST and missing currency.
3. Scale: catalogue vs per-company queries, feeds before optional discovery/SEC projection, retry/pending queues, budget-limited candidate rollout, bounded checkpoints/exports and archival before pruning.
4. Consumer value: stale financial labels, numerical comparisons, unavailable facts, source materials/webcasts, verified vs candidate earnings and mobile preview.
5. Unattended challenge: fresh runner restores, two-slot corruption recovery without overwriting the only good slot, upload verification/pointer ordering, hashed branch namespace, global writer lock/concurrency, manifest queues and source-change recovery.

A syntax error introduced while tightening call grouping was caught immediately by the feature suite, corrected, and followed by a fully passing run. No test assertion was weakened to conceal a failure.

## 17. Durable state and safe activation

SQLite remains the ledger. `checkpoint.py` creates consistent database backups of state and archive, bounded HTTP cache metadata/bodies and the latest run report. Public exports are reproducible and excluded; protected SEC cache, WAL/shm files and locks are not copied. Safe staged restore rejects traversal, symlinks/hardlinks, duplicate members, oversize archives, bad digest/integrity and existing target state.

`sync-state.mjs` uses the unchanged production S3/fs drivers: two snapshot slots plus a pointer, full SHA-256 read-back verification, pointer last, previous-good recovery and identical-digest skip. No bucket-management API, public ACL change, paid storage class or uncontrolled object versioning. Compressed/expanded bounds: 128MiB/1GiB. Global workflow concurrency serializes all feature-branch writers; local fcntl prevents overlapping CLI/checkpoint writers. Arbitrary external multiwriters are unsupported.

Measured real-ledger checkpoint: **14382373 bytes compressed / 111705026 expanded**. Restore into a fresh directory retained 219 news IDs, 3,057 event IDs, 31 source IDs and identical source health; both SQLite integrity checks passed. A fresh full-universe projection also passed. Filesystem-driver integration and the actual signed S3 driver interface were tested; **no authenticated R2 upload/restore is claimed**.

**A prefix does not itself make a bucket private.** Backend non-public access and namespace permissions must be independently verified before setting `COMPANY_INTELLIGENCE_STATE_READY=true`; this guard also applies to manual durable runs. First controlled durable initialization is explicit, then a second run must restore the same state and demonstrate replay/recovery. Only after acceptance set `COMPANY_INTELLIGENCE_ENABLED=true` for scheduling. No variables, secrets, bucket settings or production deployment were changed in this task. A missing/denied/corrupt state cannot fall back to an empty cache in durable mode. Manual non-durable cache/artifact preview is explicitly disposable.

## 18. Performance, scheduling and storage growth

Opt-in six-hour schedule: known news feeds first; changed SEC issuer queue (25/batch, including bounded exhibit proof); catalogue weekly; five candidate discoveries/batch in a separate 120-second lane. Main network batch <=160 requests/480s; catalogue <=6 requests/120s; discovery lane <=30 requests/120s. Maximum per run: **196 external requests / 720 network seconds**, plus local projection/backup/setup. Source intervals: news six hours, event/material sources normally daily, IR verification fourteen days, ownership rejection seven days, 403/404/robots retry seven days, transient exponential retry capped at 72 hours. Current candidate/sources enforce their own due times.

No scheduler was activated. Four worst-case scheduled runs/day can consume roughly **1,440 network runner minutes/month**, plus local/setup/test time; actual due-source/catalogue reuse reduces this. Fifteen-minute job timeout remains a hard cap; if the pilot exceeds it, reduce batch budgets before activation. Existing CI runs broad regressions for PR/manual validation; scheduled batches run the small feature suite.

At 6,078 one-feed issuers every six hours: **24,312 requests/day**, at least **13.5 serial network hours/day** at the two-second global floor. This cannot fit the pilot's four bounded lanes. The scheduler limits load and exposes stale/deferred coverage; it does not promise universal six-hour refresh. A larger active-source rollout needs measured fair queue throughput and appropriately budgeted orchestration. Whole-universe official-source backfill remains batched/resumable; no immediate 6,000-site crawl.

Current one-generation exports: **55682913 bytes**, largest company **219359 bytes**, 638 lookup shards; retain two generations. Per-company limits: news100, filings30, earnings12, upcoming30, calls20, materials/presentations50, timeline100, max1MiB. Oversized issuer views trim or expose a clear unavailable reason without failing the whole universe; ledger history is preserved. Generated data is not committed to Git.

Hot retention: news 365 days/500 per issuer, events five years/500 per issuer; older/overflow records are first committed to `archive.sqlite`. Operational audits 30 days, public HTTP caches 7 days, SEC inspection proof one year. Archive is not silently deleted. SQLite high-water pages are reused; vacuum/compaction is operator maintenance.

At two items/issuer/week and 1–2KB/item before indexes/provenance: **one month 53k items / 53–106MB; one year 632k / 0.63–1.26GB; five years 3.16M / 3.16–6.32GB**. Source records at ~2KB for 6,078 feeds add ~12MB, plus bounded cache bodies. Exports retain two capped generations rather than accumulating five years of files. These are scaling scenarios, not extrapolated current pilot traffic. Multi-year full-news archives exceed the checkpoint cap: partition cold history before crossing that limit; the guard fails safely rather than silently dropping useful history or increasing quota.

## 19. Cost and public-source responsibility

**Data-provider cost: $0.** No new paid SaaS/database/news/calendar/transcript service or runtime package. Existing bucket/Actions/storage quotas still apply. Two capped checkpoints use <=256MiB plus an index; measured pilot snapshots are far smaller. Existing R2 free-tier availability and shared private Actions minutes cannot be certified from inaccessible account configuration; do not promise zero infrastructure billing regardless of usage.

Public sources: identifying User-Agent, TLS verification, safe public DNS/IP/ports, robots/crawl-delay, >=2s global / >=5s host spacing, bounded redirects, 15s timeouts, 2MiB compressed/decompressed source limits, ETag/Last-Modified, memo/cache reuse and bounded Retry-After/backoff. SEC uses the existing identifying client at one request/second, below its ten-request/second ceiling. Documented Wikidata/GDELT automation APIs use their own access patterns; IR feeds follow robots. No access-control bypass or paywall scraping.

GDELT retry remained HTTP 503 on three controlled requests/two retries in 40.68s; this environment cannot establish whether geographic/transient/provider issues cause it. It is optional and inactive. Wallstreet-online offers legal-title discovery corroboration but short feed windows, German breadth/noise and six-hour pilot polling cannot guarantee timely universe-wide reporting. RSS/IR/SEC diversification is preferred to inflating coverage with unverified providers.

## 20. Tests and browser validation

**93 Python + 14 Node feature tests pass** (previous phase: 58 + nine). New tests exercise fresh recovery/archives, signed driver compatibility, corruption/failed writes/403, manifest continuation, source-health reporting, real provider/feed metadata, materials ownership, common-name resolution, fiscal comparability, OCF/EPS rules, guidance/currency/KPI evidence, call-period conflicts, confirmed release/call dates and DST. Existing four-source dedup/security/API tests remain intact.

Final mobile/browser: nine issuers (AAPL, NVDA, MSFT, ROOT, AFRM, KLAC, XPEV, CHE, BA) at 390/430/768/1,440px: **36 cases, zero horizontal overflow, zero JavaScript errors, zero default-disabled data requests**. Real consumer output was inspected, including Chemed's two distinct upcoming dates and foreign missing/stale facts.

Workflow YAML and every run block pass parsing/Bash syntax checks; `git diff --check` passes. Protected-path guard uses a complete-history three-dot merge-base diff rather than treating unrelated newer main commits as feature changes. Compact aggregate evidence and retrieval provenance are committed at `scripts/company_intelligence/tests/fixtures/phase2-validation.json`; private caches, raw logs, screenshots and generated payloads remain ignored.

## 21. Existing regressions and compatibility

| Existing suite | Measured result |
| --- | --- |
| Quant/Discover/Supertrader/Screener Node suites | 2,512 total: 2,507 passed, five existing skips, zero failures (71.34s). Includes relevant Markets/master/price/UI checks. |
| Existing SEC/Quant Python suite | 484 passed (22.65s). |
| Access gate, VU2 budget, Ask, Academy, Worker Node | 63 passed. |
| Existing VU2 Python serving/materialization | 32 passed. |
| Feature Python / Node | 93 / 14 passed. |

Protected-path diff is empty against both the phase-start commit and original architecture baseline. Production master/universe, SEC fundamentals, market/intraday/EOD data, Discover, Quant, Supertrader, Screener, Markets, deployment and existing public APIs remain unchanged. The Node suite's generated `quant/data/providers/total-return-verification.json` artifact was restored after testing. No pre-existing failure was hidden or unrelated code changed to make CI green.

## 22. Operational commands and known limits

```bash
# Existing facts for every issuer: zero external traffic
python3 scripts/company_intelligence/cli.py run --all-offline
# Honest universe/source report
python3 scripts/company_intelligence/cli.py coverage
# One weekly bounded candidate catalogue query
python3 scripts/company_intelligence/cli.py discover-catalogue --network
# Resumable candidate-site/IR discovery; failures retain per-issuer checkpoints
python3 scripts/company_intelligence/cli.py discover-backfill --network --discover-sites --discover-ir --limit 25 --request-budget 100 --max-seconds 480
# Follow the existing changed-issuer output, with accession checkpoints
python3 scripts/company_intelligence/cli.py run --updated-issuers quant/data/fundamentals/daily/updated-issuers.json --network --sec-fetch --sec-documents --limit 25 --request-budget 160 --max-seconds 480
# Explicit representative probe; never defaults to whole-universe networking
python3 scripts/company_intelligence/cli.py probe --network --sec-fetch --sec-documents --materials --tickers AAPL,NVDA,TSLA,MSFT,XPEV,ROOT,CHE --limit 7 --request-budget 100
python3 scripts/company_intelligence/preview_server.py
# Open http://127.0.0.1:8766/company-intelligence/?preview=1&ticker=NVDA
```

Writes stay in `.company-intelligence/` (override only to isolated safe paths). RUN statuses are PASS/DEGRADED/DEFERRED; isolated operational failures return exit0 with explicit reporting so successful checkpoint work survives. Unsafe configuration/concurrent writers are fatal. Logs/audits and source states explain missing news, matching rejection, grouping, date changes and failure reasons. A six-hour feed outage can recover retained RSS content; rolled-off stories cannot be guaranteed recovered.

Genuine limits: sparse official/news coverage; JS-only or blocked IR sites; short global RSS retention; conservative title matching/dedup; bounded SEC document history; foreign/missing/stale fundamentals; narrow guidance/KPI grammars; unknown document periods; supplied materials/transcript links rather than hosted copies; same-date-only call linkage; standalone preview rather than public stock-page integration; archive partitioning required before a large long-term rollout.

## 23. Remaining product gaps and acceptance

**Blocking acceptance:** authenticated existing-bucket namespace/privacy validation plus successful restore/write/recovery in repeated fresh GitHub runners. Missing local R2 credentials and GitHub Actions configuration HTTP403 prevent that proof. Do not activate durable uploads, scheduled ingestion or public deployment without completing it.

Later improvements are not disguised merge blockers: continue measured candidate/platform rollout; improve legally permitted broad discovery and source refresh throughput; increase period-verified guidance/KPI/material recall; improve next-day call associations using explicit fiscal evidence; partition cold archives at measured capacity; integrate the opt-in contract into stock pages after operational acceptance. Incomplete coverage remains honestly unavailable and does not by itself require 100% coverage before merging a safe layer.

## 24. Merge readiness

The implementation is additive, regression-tested and substantially stronger. This report conservatively withholds readiness because actual production-state acceptance remains unverified. The draft PR is preserved and updated; no merge. All validated code/docs are committed and remotely preserved, with exact branch/SHA verification recorded in the final delivery. No completed implementation is intentionally left local-only.

MERGE-READY: NO
