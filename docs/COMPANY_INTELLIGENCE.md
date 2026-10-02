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

A real endpoint bug let a generic “News & Events” release link replace the actual events link; discovery now excludes release URLs from event endpoints. Exact-CIK, nonmock SEC legal-name aliases improve Bank of Hawaii/Bassett matching, loaded only for candidate issuers to avoid thousands of unnecessary reads. Fiscal prefixes such as `3Q26` can no longer hide another issuer's name.

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

Confirmed upcoming earnings/call coverage **1 → 4 issuers (0.07%)**, estimated windows **186 (3.06%)**. A confirmed call is explicitly labelled a results conversation, not asserted to be the release date. CHE: release **October 27**, call **October 28, 10:00 America/New_York / 15:00 Berlin** after Europe's DST change. UAL: call **October 21, 10:30 EDT / 14:30 UTC**. Date-only presentations remain date-only. NVDA's **November 14–28** range is explicitly estimated.

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

The actual packaged Pages release passed **56 responsive cases** (seven issuers × two products × 390/430/768/1440 px), **two disabled/zero-data-request cases** and **ten adversarial cases**: HTTP 503, generation mismatch, expired snapshot, routine/old-amendment priority suppression, XSS/unsafe links across both products. No horizontal overflow or browser exceptions were observed. Recorded mobile screenshots and manual reviews covered NVDA, ROOT and CHE. Fixed existing product navigation remains intact. Reports/links, genuine empty states, first-party calendar labels and financial comparisons were reviewed in the real stock pages. Reusable harness: `node scripts/company_intelligence/browser-qa.mjs --url <local-packaged-release> --out /tmp/intelligence-browser-qa`, using existing optional Playwright tooling.

## 16. Public delivery

`v1/company-intelligence/consumer/<pilot-namespace>/` is separate from private `.../state/<namespace>/`. Only manifest-listed index/shard/issuer JSON paths are allowed. Each object is bounded to 512KB and hash-verified on publish and download. Downloads pin current/previous manifests once and recheck the active pointer before any write (three manifest reads, versus per-asset rereads); a pointer swap fails before replacing the disabled index. Two R2 slots retain current/previous generations without accumulating snapshots. Pages copies both retained consumer generations before index replacement, and retains its committed disabled index if preparation fails. No ledger, cache or checkpoint enters the release. Old/mismatched generations fail closed; consumers warn after 48 hours and refuse snapshots older than seven days.

The Pages workflow change is one opt-in read-only projection step under `COMPANY_INTELLIGENCE_PUBLIC_PILOT_ENABLED`; it does not replace deployment. No public pilot gate was activated and the new stock integration is not yet on the public main deployment. `pilot-handler.cjs` is an isolated loopback acceptance harness, not a new production API endpoint.

## 17. Scheduling and cutover

The optional hourly pilot schedule is guarded by `COMPANY_INTELLIGENCE_PILOT_ENABLED` and `COMPANY_INTELLIGENCE_STATE_READY`; both gates must be explicitly reviewed before enablement. Dispatch controls independently select initial creation and network polling. `poll` updates due sources without thousands of financial re-projections. Global distributor feeds have a 30-minute due interval; the pilot's hourly job does not guarantee every rolling-window story. Normal first-party feeds use six hours, event sources 24 hours; confirmed events within 72 hours raise healthy owned-source priority to two hours. Failure cooldowns always win. Scheduled SEC lane checks completed-day changed issuers every six hours in bounded fifty-issuer batches; backlog/age must be monitored before increasing rollout size.

Set `COMPANY_INTELLIGENCE_CONSUMER_NAMESPACE` to a reviewed **`pilot-...`** namespace to carry the same private/public pilot identity across branch-to-main cutover. Without it, a branch-hashed isolated namespace is used; a different branch/main starts a different namespace and strict restore refuses silent replacement. Initialize exactly once by explicit dispatch. Public delivery remains a separate flag. No owner settings, bucket policies, public domains or scheduled flags were changed during this task.

## 18. Authenticated operating pilot

Three authenticated fresh-runner cycles passed: [A](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37022843050), [B](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37024197756), [C](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37026887351). B restored A’s exact 247,772-byte checkpoint and logical hash; C restored B’s exact 280,594-byte checkpoint and logical hash. C wrote 289,807 bytes and retained 157 news, 130 events, 34 sources and 44 state rows, with zero network requests or new records; item/event/source IDs and source-health bytes stayed stable. Both network cycles recorded bounded 240-second deferrals and source failures, while publishing successfully. Consumer R2 → verified Pages files → loopback consumer contract passed all three: 20 available issuer payloads, 21 available tickers, one unavailable, three private paths rejected. These smaller fresh working sets differ from the local 21-issuer historical consumer projection. A fourth cycle will validate the final pinned-manifest downloader before final acceptance. Runs use only R2 artifacts to transfer state, not local disk or Actions cache. A bounded network update may legitimately be `DEFERRED` while publication succeeds; source failures are recorded and isolated rather than hidden. This is short-cycle controlled acceptance, not weeks of production operation, and does not claim that the complete locally accumulated historical ledger was uploaded to the pilot namespace.

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

Source registry: **62 total; 59 ACTIVE, 2 EMPTY, 1 INACTIVE; zero registered BLOCKED/STALE/parser failures in the local final snapshot**. Discovery separately reports **10 BLOCKED, 4 DEGRADED, 77 VALIDATED, 5,987 NOT_CHECKED**. Robots/403 discovery candidates are not registered as active successes. The 891 Wikidata domain candidates remain candidates. Authenticated pilot source failures are separate from this local source-health snapshot.

## 20. Before/after and performance

Financial/SEC breadth is preserved; news coverage +16 issuers, first-party +11, calls +9, webcast issuers +6, presentation references +8 and IR pages +17. Final full-universe projection: **6,078 issuers, 4,973 exports, 42.687s, zero requests/failures/new items/duplicates**. Post-fix repeats took **41.989s / 44.440s**; rows/hashes for news/events/sources/aliases and cursor/pending/checkpoint records were identical. SQLite file allocation changed slightly with run metadata; record growth did not occur. Timestamps intentionally yield fresh generation IDs per run. At an identical clock, all **5,612 export JSON digests** were identical across repeated complete exports (20.38s combined).

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

Allowed production-path changes are exactly the four stock-page HTML/hook files plus the opt-in Pages download step. Company Master/universe, SEC fundamentals, prices/EOD/intraday, Quant calculation, Discover data, Supertrader, Screener, Markets, existing APIs/server, Vercel and release packager logic remain unchanged. Regression-generated provider metadata was restored. Currency CI additionally found two source-line references shifted by the Discover hook; only those two audit-register line numbers were updated (no finding/classification/currency logic changed).

## 25. Limitations, readiness and meaningful next gates

No immediate code-merge blocker remains after final CI and authenticated acceptance. Controlled pilot tooling is ready, with explicit initialization, isolated restore and independently gated publication. Broad enablement still needs: review/merge of rollout code (not authorized here), intended main pilot namespace/flags selected, repeated scheduled observation over real reporting/source-change windows, and a delivery health/rollback check on the actual Pages deployment. These are operational rollout gates, not requests for 100% coverage.

Broad news and confirmed calendar/call discovery remain sparse; the product must expose per-issuer depth honestly. A universal broad-news promise is unsupported. Commercial PR Newswire use requires permission; GDELT/blocked distribution sources remain optional/unavailable. Guidance/KPIs are narrow; exact evidence relationships leave some materials unbundled. The authenticated pilot initializes a fresh small working set and does not include the entire accumulated local historic archive. Long-term archive capacity must be addressed before enforced limits, and no long-running acceptance is inferred from three short-cycle runs.

## 26. Readiness

Final authenticated runner evidence and readiness judgments are appended below. Rollout PR #356 is not merged and no broad public exposure is enabled.

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
