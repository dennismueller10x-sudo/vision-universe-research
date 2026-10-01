# Company Intelligence Engine

This is an isolated, opt-in preview foundation. It does not enable a production news feed, change any existing product pipeline, or promise news coverage for every issuer. Source coverage and durable unattended operation remain rollout blockers. No paid data provider, hosted database, runtime package dependency, production secret or deployment change was introduced.

Implementation and validation date: 2026-10-01. Baseline: `origin/main` commit `18bc2dddfaebcf3ec97079364f1203c2c09f83cb`. Feature branch: `feature/company-intelligence-engine`.

## Existing architecture and protected boundaries

| Existing system | Consumed contract / integration decision |
| --- | --- |
| Company master | Read `quant/data/universe/instruments/<prefix>.json`; preserve instrumentId, masterMemberId, symbol, exchange, securityType, eligibility and verified CIK. No producer changes. |
| Product universe | Active COMMON_STOCK/ADR with ELIGIBLE, SEPARATE_CLASS or REVIEW eligibility. Current snapshot resolves 6,078 issuer/company identities; 666 lack a verified CIK. This is the supported equity subset, not a replacement universe. |
| Issuer identity | Group share classes only by master-verified CIK/issuer identity. Unresolved companies retain their stable instrument identity. Ticker collisions fail closed; never choose the first exchange listing. |
| SEC raw archive | Read existing `JsonRawStore` submissions. No writes into its append-only production archive. |
| SEC canonical bundles | Read existing ticker files only when `inspector_index.json` proves the same ticker/CIK. |
| SEC consumer fundamentals | Read existing `CIK<10 digits>.json`, schema `vu-consumer-fundamentals-1.0.0`, seven-column quarterly/annual arrays, units, policy and provenance. |
| SEC network | Optional submissions/exhibits use existing `SECHttpClient`, `SECProvider`, `RateLimiter` and `.sec-cache`. No second SEC downloader; no companyfacts requests. |
| Existing news | Dashboard news generation remains untouched. Its permitted public RSS source is separately consumed as discovery metadata. |
| Products/APIs | Existing static data contracts are the prevailing pattern. Add a separate browser/Node contract; no new production endpoint or changes to Discover, Quant, Supertrader, Screener, Markets or existing API handlers. |
| Deployment/storage | Existing static release projection can carry the dedicated directory. The checked-in manifest is DISABLED. Generated snapshots and SQLite remain ignored working artifacts. Existing deployment workflows, R2 serving and generated production datasets are unchanged. |

The engine lives in `scripts/company_intelligence/`; public contracts/configuration and the standalone noindex preview live in `company-intelligence/`. The new workflow has read-only repository permissions, tests and explicit manual preview batches. There is no cron, automatic commit, push or deployment.

## State and public data contract

Python's built-in SQLite provides transactions, indexes, deduplication, source registry/health, audit evidence, event aliases and restart checkpoints. Tables: `items`, `events`, `sources`, `event_alias`, `audit`, `state`. The working path is `.company-intelligence/state.sqlite`; a process lock rejects concurrent writers. No production migration is necessary.

Exports use schema `vu-company-intelligence-1.0.0`:

```text
index.json                                      small PREVIEW manifest
snapshots/<content-generation>/lookup/AA.json     ticker/listing/issuer lookup shard
snapshots/<content-generation>/<companyId>.json  company intelligence
```

Each issuer payload contains `news`, `events`, `earnings`, `filings`, `calls`, `timeline`, `listings`, `coverage` and timestamps. Timeline entries reference news/event IDs rather than duplicate financial summaries. A verified release appearing in news and earnings is linked into one timeline entry when its source URL matches. Filings remain separately typed regulatory events.

The browser loads only the manifest, requested ticker prefix and issuer payload. Unknown/colliding symbols, wrong issuer records, mismatched generations, unsafe paths, oversized sections and invalid calendar confidence are rejected. GOOG/GOOGL share the same verified issuer payload while retaining separate listing identities. A known master company without intelligence returns `NO_COMPANY_DATA`, not fabricated content.

Generations are immutable content hashes covering master identity, items, events, sources and SEC/IR coverage state. Company files and lookup shards are written before atomic manifest replacement; retain current and previous generations for in-flight requests. A missing/evicted older generation fails safely and can be retried. The contract exposes stale snapshots after 48 hours. Exports are PREVIEW; promotion to an approved production destination is deliberately absent.

## Free sources and access decisions

| Source | Role, validation and observed result |
| --- | --- |
| [Apple newsroom Atom](https://www.apple.com/newsroom/rss-feed.rss) | Verified first-party source; 20 relevant newsroom headlines in the live probe. It supplies updated timestamps without publication timestamps. Preserve `publishedAt: null` and `SOURCE_UPDATED_TIME`; do not display updates as publication. |
| [Root news RSS](https://ir.joinroot.com/rss/news-releases.xml) | Automatically discovered through a linked RSS landing page on its verified IR host. Ten first-party releases; earnings, operations and partnerships. |
| [Root events RSS](https://ir.joinroot.com/rss/events.xml) | Automatically discovered alongside news. Explicit dates in official event titles supply call/conference dates; RSS pubDate is never an event start. Four earnings calls and five other IR events were retained. |
| [Wallstreet-online global RSS](https://www.wallstreet-online.de/rss/nachrichten-alle.xml) | Existing repository permission rationale: headlines/excerpts/backlinks. Intelligence stores headlines and links, not article bodies. One global request, 101 items inspected: three conservative matches and 98 rejected titles. German coverage is useful but sparse. |
| [SEC EDGAR](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) | Existing local outputs first; optional public submissions and bounded primary/exhibit checks through existing fair-access infrastructure. All 17 cohort issuers returned submissions successfully. |
| [Wikidata SPARQL](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service) | CC0 official-site discovery, exact padded CIK (P5531) and official website (P856), batches of at most 25. Multiple domains are ambiguous and rejected. A unique candidate still needs corporate title + visible legal-company ownership and no unrelated redirect before activation. It is not an authoritative company master. |
| [GDELT DOC API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) | Experimental explicit flag only. Up to ten legal names per OR query, 250 results maximum, conservative independent title resolution. Repeated live HTTP 503 errors prevented establishing reliability, latency or useful coverage. No verified availability/SLA is assumed. `seendate` is observation time, not publisher time. Registered inactive after one-off use. |

Google News search RSS was evaluated and rejected: robots disallows `/rss/search`. No prohibited search-feed scraping, article scraping, paywall bypass, paid financial API or paid transcript provider was added. Public RSS availability alone is not a universal republication license: keep existing permission rationale for the configured publisher and validate permission before enabling a new publisher source.

IR discovery uses verified corporate/IR seeds and exact-CIK Wikidata candidates, then bounded links to news, feeds, events, presentations and reports. It supports RSS, Atom, JSON Feed, JSON-LD events and iCalendar, with Q4/GCS endpoint patterns and reusable platform hints. Bootstrap URLs cover the 17-issuer validation cohort, not thousands of custom scrapers. Static assets and repeated homepage links do not consume the IR walk budget. Optional oversized/broken pages produce warnings while preserving successfully discovered feeds. HTTP errors, robots failures and redirects to unrelated hosts require revalidation; no bypass.

Several real IR sites returned HTTP 403, DNS/robots failures or oversized optional HTML. Initially six IR entry points were reachable; repeat probes showed changing availability. Only two issuer news feeds and one event feed were validated. Successful SEC/feed runs do not mean those failed IR paths recovered. The registry and per-company coverage record these differences.

## News quality, provenance and deduplication

Entity resolution uses the existing master and an inverted alias-token index. Multiword legal/normalized names require word boundaries; distinctive short names require financial co-occurrence. Generic names such as Root, Unity, Block, Toast, Target, Affirm, Meta, Apple and Oracle are rejected as short aliases. Explicit `$TICKER`/exchange ticker evidence resolves only a unique issuer. A query's company hint alone is insufficient. Verified first-party feeds can identify their issuer only for validated/delegated article domains. Arbitrary article snippets and generic body mentions are not company proof.

Every accepted item stores confidence and matching evidence. Rejected titles, invalid timestamps, stale entries and source failures are audited. Discovery URL/source/type are distinct from original publisher/domain and canonical article URL. Publisher metadata does not mistake RSS authors for publishers. A source health record includes checks, success/failure times, counts, errors and next due time. Numeric confidence values are deterministic rule weights, not calibrated probability estimates.

Deduplication is issuer-scoped: canonical URL + exact title, normalized title within 72 hours, or very high title similarity (>=0.94) for substantial titles with identical numbers, actions and categories. Reused URLs with different headlines, changed numerical guidance and opposite actions do not merge. Unknown-publication sightings preserve earlier publisher evidence and first discovery. Preference: first party, SEC, public RSS, experimental aggregator. Group IDs remain stable; retain up to 32 provenance references and an explicit truncation flag. Earnings events additionally group on exact issuer/fiscal period/report end/publication date; confirmed calls group only on exact start time. Amendments/corrections stay separate. Calendar aliases survive rescheduling and date/time changes are audited.

Categories and LOW/MEDIUM/HIGH/CRITICAL importance come from deterministic headline rules with evidence. There is no LLM dependency. Missing summaries remain null. This does not perform general semantic news clustering: differently worded syndicated stories can remain separate unless strong identity evidence exists. Conservative matching and grouping intentionally trade recall for precision.

Private transient feed caches support conditional requests; public payloads contain headlines, links, metadata, compact evidence and existing structured financial facts. They do not mirror full publisher articles. Frontend rendering uses textContent/createElement and checked links; no external HTML is inserted.

## SEC earnings and financial summaries

Supported forms include 8-K, 10-Q, 10-K, 6-K, 20-F, amendments and DEF 14A. An 8-K Item 2.02 is `EARNINGS_CANDIDATE` / UNVERIFIED until explicit release evidence. A periodic report is `PERIODIC_REPORT_PUBLISHED`, not proof that earnings were released at that instant. A generic 6-K is not earnings. Explicit release descriptions/documents can identify foreign earnings; a future board approval notice cannot.

Optional document mode inspects at most two recent candidate filings and one exhibit each per issuer per run. It follows only primary/exhibit links within the SEC accession directory, uses existing cached downloads, stores short evidence and source document references, and resumes past already inspected accessions. Parser versions invalidate old evidence. Primary/exhibit failures are visible and retry after a day. Only the last year is inspected; this is a controlled discovery window, not a full historical document backfill. SEC metadata can still expose older filings. The existing SEC disk cache remains subject to its existing operational cleanup policy; document mode can increase private cache disk usage and is disabled in routine manual CI batches.

Fiscal periods come from validated canonical data, exact report-end matches against existing normalized facts, or explicit release fiscal labels. Never infer a quarter from calendar month or use an 8-K reportDate as its quarter end. Latest-known revisions may no longer contain the original accession; exact report-end identity prevents assigning comparative facts to the wrong year. A 20-F remains FY and is never silently Q4. Annual and quarterly summaries reject duplicate periods, invalid units, nonfinite values, invalid derivation flags, future filings and mismatched provenance.

Revenue, diluted EPS, net income, gross/operating margins, free cash flow, cash, debt, CapEx and shares are reported where validated consumer data exists. Quarterly summaries compare previous quarter/year-ago quarter and contiguous four-quarter flow totals; never sum balance sheets or outstanding shares. Annual summaries compare previous years. Nonpositive comparison bases have unavailable percentages with an explicit reason. Margin calculations require compatible currencies and the same period end. Deterministic `whatChanged` records carry metric, direction, absolute change and units.

These are `LATEST_KNOWN_RETROSPECTIVE` values with `sourceAsOf` and NOT_CERTIFIED PIT eligibility, not values certified available on the historical release date. Foreign/small-company gaps, company-specific KPIs and absent segment metrics stay UNAVAILABLE. Guidance extraction only preserves narrowly parsed numerical-range evidence as UNVERIFIED_EVIDENCE, with source/confidence and missing currency/period explicit. It does not publish validated management guidance or infer a guidance increase.

## Calendar, calls and materials

CONFIRMED dates require a validated first-party announcement, event feed, JSON-LD or iCalendar date. Explicit time zones are converted with zoneinfo; date-only events do not acquire midnight instants. EST/EDT/PST/PDT must agree with the date. Syndication datelines are excluded from event-date selection, ambiguous multiple dates are rejected, and floating calendar times are unavailable. Changed dates/times retain history. Structured cancellations remain cancelled.

ESTIMATED windows require at least three same-quarter seasonal historical observations. Use a median and range (at least +/-7 days, capped at +/-30), record observations, methodology and confidence. Periodic-report timing is an explicitly weaker proxy than observed earnings timing. Stale history is rejected; an official schedule supersedes nearby estimates. Never display an estimate as confirmed. The real cohort produced seven estimated windows, not seven officially announced future earnings dates.

Calls, conferences, investor days and meetings retain first-party event/source links. Webcast/presentation links are populated only when supplied; transcript links require a supplied first-party URL. No transcript download/provider dependency exists. Missing transcript, webcast or presentation remains null and does not fail the event. Historical Root calls verified EDT/EST conversion, including August 5, 2026 at 21:00Z. Full guidance validation and transcript enrichment are future work.

## Run, inspect, resume and preview

Requires Python 3.12 and Node 22 for validation (matches existing CI). Runtime is standard-library Python and browser/Node JavaScript. The commands below operate in the repository root.

```bash
# Offline consumption of existing outputs; no public network enabled.
python3 scripts/company_intelligence/cli.py run --tickers AAPL,NVDA,TSLA,MSFT,ROOT,XPEV

# Controlled current-data probe. SEC documents are a separate explicit opt-in.
python3 scripts/company_intelligence/cli.py probe --tickers AAPL,NVDA,TSLA,MSFT,ROOT,XPEV \
  --limit 6 --network --sec-fetch --sec-documents --request-budget 80 --max-seconds 180

# Discover reusable first-party sources from trusted sites; failures remain observable.
python3 scripts/company_intelligence/cli.py probe --tickers ROOT --limit 1 \
  --network --discover-ir --request-budget 40 --max-seconds 120

# Resumable universe batches, initially offline; checkpoints advance per issuer.
python3 scripts/company_intelligence/cli.py backfill --limit 25
# Add --network --sec-fetch --discover-sites --discover-ir only for bounded live initialization.

# Read source health and materialize immutable public exports.
python3 scripts/company_intelligence/cli.py quality
python3 scripts/company_intelligence/cli.py export
python3 scripts/company_intelligence/preview_server.py
```

Open `http://127.0.0.1:8766/company-intelligence/?preview=1&ticker=AAPL`. Without `preview=1`, the page makes no intelligence data requests. Production consumers likewise must explicitly pass `enabled: true` to `VUCompanyIntelligence.load`. The server binds loopback and serves only allowlisted UI/data paths, not the repository or private working store.

Optional flags: `--updated-issuers <existing SEC manifest>` consumes the existing daily issuer-change manifest without altering its producer; `--discover-sites` performs validated Wikidata discovery; `--gdelt` is an experimental one-off probe; `--force-sources` bypasses due times for explicit validation only. `--state`/`--out` support isolated test destinations, with protected-path guards. Limits: 1..100 issuers, 1..200 requests, 30..1,800 seconds. SEC/public budgets are split; discovery runs after existing feeds. Pending SEC/IR work and failed-company retry queues take priority on the next backfill batch. A cache miss does not provide durable historical recovery.

The CLI writes `.company-intelligence/latest-run.json`, structured logs, health and audit evidence. PASS means the requested bounded operations had no failures, not universal coverage. DEGRADED exposes source/discovery/document failures; DEFERRED exposes budget exhaustion. These operational statuses return exit 0 so a failed source does not discard successful snapshots; malformed configuration/unsafe paths/concurrent writers are hard failures. Operators must inspect report status, not only process exit code. Audit codes answer missing-news, entity rejection, source failure, date change and grouping questions. Individual matches/dedup reasons live in item/event provenance rather than noisy per-item logs.

After a 12-hour gap, use the same state and run due sources; conditional requests and SEC submissions catch retained changes. Stories already rolled off short RSS windows cannot be guaranteed recovered. Backfill is restartable per issuer, but ticker selection truncated by --limit must be run again with the omitted symbols. No uncontrolled universe network backfill was run.

## Request, storage and cost budgets

Public requests: one writer, global >=2-second spacing, per-host >=5 seconds, GDELT >=15 seconds, source robots/crawl-delay handling, identifying User-Agent, TLS verification, safe public DNS/IP/ports, redirects rechecked, ETag/Last-Modified, memoization, bounded retries/Retry-After, 15-second timeouts and 2-MB body/decompression limits. Cache checksums reject incomplete/corrupt responses. API exceptions to robots apply only to documented GDELT and Wikidata API endpoints; IR/public feeds follow robots. SEC uses the existing identifying client at 1 request/second, below [SEC's 10 requests/second ceiling](https://www.sec.gov/about/developer-resources). No access-control bypass.

The current pilot has three news feeds every six hours plus one daily event feed: 13 scheduled feed checks/day, plus cached robots and conditional metadata. IR verification is due every 14 days; failures back off. SEC refresh should consume changed-issuer manifests, not redownload every company every few minutes. The manual runner exposes these intervals but no scheduler has been activated.

At 6,078 issuers, one feed each every six hours would be 24,312 requests/day. At the global two-second floor that alone consumes >=13.5 serial hours/day, before host waits, retries and extra feeds. A 25-issuer daily backfill needs >=244 successful batches for initial coverage. GDELT batches of ten require >=608 queries per daily pass and >=2.5 hours at 15 seconds/query, with a 250-result truncation risk. Its observed failures make it unsuitable as the sole broad-feed solution. These calculations prohibit an unvalidated universe cron. Future operation needs source-level incremental/global discovery and a measured sharded schedule.

Retention: news 365 days / at most 500 per issuer; events five years / at most 500 per issuer; audits 30 days; public-source caches seven days; SEC inspection state one year. Public issuer payloads: news<=100, filings<=30, earnings<=12, upcoming events<=30, calls<=20, compact timeline<=100, max1 MB; retain two snapshot generations. Record caps can shorten history for busy issuers and provenance has an explicit 32-reference cap. SQLite deletion reuses pages; reclaiming high-water disk usage is an operator maintenance concern.

Measured on the actual master: 1,000 relevant title resolutions in ~14 ms; manifest 3.4 KB; 638 lookup shards, largest 5.8 KB; pilot current generation ~2.9 MB, largest issuer ~175 KB; working SQLite ~8 MB. These are pilot measurements, not full-universe throughput certification. At two news items/issuer/week, roughly 632,000 annual items * 1..2 KB = 0.6..1.3 GB before indexes/provenance. Maximum news retention is ~3.04 million records, roughly 3..6 GB before indexes; event evidence/metrics can add several GB. Full-universe exports may reach hundreds of MB or more; a theoretical 1-MB/issuer cap still allows ~6 GB per generation. Generated history must not be auto-committed to Git.

Provider cost: $0. No new paid service or subscription. Public GitHub standard Linux Actions/manual artifact previews use existing infrastructure; private-plan minutes, cache quotas and artifact/storage usage still follow the account's existing billing. Cache eviction and 14-day artifacts are not durable multi-year storage. Production continuity must reuse an appropriate existing persistent storage destination with backup/recovery and quota evidence before enabling a scheduler. No credentials are required for the local/public-source foundation. Browser QA used environment-provided Playwright/Chromium only; neither is a new runtime repository dependency.

## Validation and adversarial reviews

New suites: 58 Python tests and nine Node contract tests, all pass. Coverage includes malformed XML/DTD, RSS/Atom/JSON, ambiguous names/ticker collisions/share classes, four-source dedup/provenance, numeric/opposite-action separation, repeated URLs, old rediscovery, exact fiscal periods, annual duplicates/units, NaN/infinity/zero/negative values, non-calendar quarters, conditional HTTP/304, timeouts/429/robots/private redirects, gzip bounds, restart checkpoints, unsafe paths, failed-document retries, removal of disproved foreign earnings, calendar changes/aliases, DST, source isolation, compact timeline grouping, actual master performance, workflow isolation and sharded API generation integrity.

Existing regressions were measured before and after changes:

| Command | Result |
| --- | --- |
| `node --test quant/tests/*.test.mjs discover/tests/*.test.mjs scripts/supertrader/tests/*.test.mjs screener/tests/*.test.mjs` | 2,512 total; 2,507 passed; five existing skips; zero failures, before and after. Includes Markets, company data, existing news/UI, intraday and market-price behavior. |
| `python3 scripts/quant/cli.py test` | 484 passed, before and after. |
| `node --test scripts/access-gate/build.test.mjs scripts/vu2/resource-budget.test.mjs ask/tests/*.test.mjs academy/engines/*.test.mjs worker/tests/*.test.mjs` | 63 passed. |
| `python3 -m unittest discover -s scripts/vu2 -p 'test_*.py'` | 32 passed. |
| New Python / Node suites | 58 / nine passed. |
| Workflow YAML / whitespace | Structure/permissions/triggers parsed; `git diff --check` passed. |
| Original-source links | Robots-aware HEAD probes for sampled Apple, Root and Meta/publisher story URLs all returned HTTP 200; actual SEC documents/exhibits returned HTTP 200 during inspection. |
| Browser/mobile | AAPL, ROOT, NVDA, XPEV at 390/430/820/1,440 px: 16 cases, no horizontal overflow or JS errors. Default-disabled preview made no data requests. Estimated/source-updated/fiscal-year labels verified. |

The existing Node suite updates `quant/data/providers/total-return-verification.json` as a test artifact. It was restored after tests; it is not a feature change. No unrelated failure was hidden or existing assertion weakened. Validation logs/screenshots/state remain ignored local evidence under `.verification/intelligence/` and `.company-intelligence/`, not generated production commits. CI executes regressions and rejects this feature PR if it changes protected production paths.

Real cohort: AAPL, NVDA, TSLA, MSFT, XPEV, PLTR, SOFI, ROOT, U, XYZ, TOST, TGT, AFRM, META, GOOG, GOOGL, ACU, SGI (18 tickers / 17 issuers).

| Real evidence | Inspected finding |
| --- | --- |
| AAPL | 20 relevant first-party headlines; updated-only timestamps safely distinguished; Q3 FY2026 ends 2026-06-27 with validated comparisons. |
| NVDA | Q2 FY2027 ends 2026-07-26, not calendar Q3 or FY2026. Actual SEC primary/exhibit proof. |
| MSFT | Q4 FY2026 ends 2026-06-30; annual reports retained separately. |
| TSLA | July 2 delivery update is operations, not earnings; July 22 release is Q2 FY2026 earnings. |
| XPEV | Foreign 6-K release on August 25 explicitly identifies Q2 2026; missing consumer quarter metrics remain unavailable. August 4 future board approval notice is rejected as published earnings. FY2025/FY2024 20-F report-end mapping does not borrow comparative accession years. |
| ROOT | Ten relevant official stories despite ambiguous name. August 5 Q2 release groups IR/SEC evidence; one 21:00Z call groups announcement/event-feed provenance. Conferences retain date-only precision where no time is provided. |
| META/TGT/U/XYZ/TOST/AFRM | Generic-word rejection tests pass; actual SEC mappings retained. XYZ uses Block's stable CIK across ticker rename. |
| GOOG/GOOGL | Shared Alphabet issuer, distinct listings; no ticker/company leakage. |
| ACU/SGI | Sparse/unverified period metrics stay unavailable. Active renamed Somnigroup listing retains verified CIK; inactive duplicate listing excluded. |
| PLTR/SOFI | Actual SEC release/exhibit events projected; missing IR feed does not hide available regulatory events. |

A representative final bounded cohort run passed with 33 retained news items, 33 duplicate sightings, 98 conservative global-feed rejections and no SEC/feed/document failures. It reused cached SEC documents with zero SEC network requests after an earlier successful 50-request inspection run. Additional bounded foreign batches found actual XPeng releases. Separate repeat IR discovery returned DEGRADED for robots/network/oversized optional pages; those failures are recorded and are not called a coverage success. Four active feeds remain healthy even when a discovery page fails. The final Root discovery rerun passed after excluding asset links from HTML-page discovery and retained both news/event feeds; the historical warnings remain in the audit.

Three self-review checkpoints resulted in substantive fixes:

1. Architecture/failure review: isolated optional Wikidata/provider failures, preserved fair-access SEC reuse, indexed resolution/registry queries, added overall network budgets, removed duplicate processing of a feed, and preserved discovery-vs-original provenance.
2. Data-integrity review: corrected Apple updated-only dates, repeated-URL overmerging, fiscal-year assignment from latest revised facts, annual unit/duplicate handling, future Tesla/XPeng disclosures incorrectly resembling earnings, old parser evidence, stale derived events, duplicated Root calls/releases, and cross-generation lookup paths. Added regression cases for the actual defects.
3. Operations review: added cooldown retries for failed exhibits, backfill pending queues, immutable sharded snapshots, compact timelines, bounded retention, optional-page isolation, preserved last successful health on later failures, and request/storage growth calculations. Kept production scheduling/export activation disabled because coverage and durable recovery are not proven.

## Remaining production blockers and next work

This foundation is tested and isolated, but the requested full production definition of done is not met. Exact blockers:

1. **Universe news/IR coverage:** only two validated issuer news feeds and one event feed. Several required first-party endpoints reject automated access; GDELT returned repeated 503s. A reliable, permitted broad discovery source and substantially wider reusable first-party coverage must pass a monitored pilot. No prohibited scraping fallback is acceptable.
2. **Unattended continuity and durable retention:** no approved persistent state/export deployment or incremental production schedule has been activated and validated. Actions caches can be evicted; artifacts expire. Establish this on existing storage, prove restore/replay and sustained request/storage budgets, then enable source-level scheduling and feature rollout.
3. **Production acceptance at scale:** 17 live issuers and full-master lookup/performance checks do not prove several thousand continuously updated company feeds. Validate coverage/precision, RSS gaps, foreign formats, provider changes and recovery over a reporting cycle before exposing data broadly.

Other explicit limitations: title-only conservative discovery misses generic-brand and body-only mentions; broad semantic syndication collapse is incomplete; unsupported JS-only IR pages degrade to missing sources; dates may be unavailable when unstructured evidence is ambiguous; document inspection is bounded rather than exhaustive; foreign and sparse fundamentals can remain unavailable; no deterministic company-specific KPIs, segment summaries or certified guidance yet; transcripts/materials are supplied links only; public UI is a standalone preview, not stock-page integration. These limitations are visible, not inferred as data.

Next engineering work should address the three blockers first. Expand legally accessible platform/global feeds using measured source health and precision, connect the isolated ledger/snapshots to existing persistent storage and change-manifest orchestration, then validate the sustained pilot before integrating a small stock-page consumer. Guidance/KPI enrichment should remain evidence-based and follow reliable ingestion.
