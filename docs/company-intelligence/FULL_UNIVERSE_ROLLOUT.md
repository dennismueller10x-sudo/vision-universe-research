# Company Intelligence: full-universe eligibility rollout

Evidence date: 2026-10-10 UTC. Full eligible production acceptance passed: generation `fad43887526d89bbcaaba628`, 4,789 issuers / 5,088 stocks. The remaining observability correction in PR #586 preserves these consumer bytes and both GOOD generations.

## Scope and authoritative state

The existing Discover V2 remains the product. No Company Master, Quant factor, SuperTrader, price-provider, chart or Screener semantics changed. Publication uses per-issuer eligibility, not a global universe enable switch. Source policy remains `OWNED_IR_SEC_METADATA_PREVIEW_V1`.

Authoritative private R2 CURRENT: `85ebdc8c1ff855929a828f38`, checkpoint SHA-256 `14aecddecadb4cd47d04f1cac58d4de87536a74dfb86e79ab3af608d5e6159b8`, archive 31,149,178 bytes. Real source schedule run [38059718852](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38059718852) preserved this state and verified a fresh-runner restore. Release [38062263190](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38062263190) restored CURRENT twice, matched IDs/table fingerprints/schema/consumer bytes, and generated `99ed34a9e1f01b19589fb14d` without source requests or private writes. Private ledgers, source registry, operational checkpoints and credentials remain in private storage.

| Inventory | Count |
|---|---:|
| Private issuers / payloads | 5,120 / 5,120 |
| Historical/current listings across the identity inventory | 6,416 |
| Historical/private listings | 5,446 |
| Current listings with private payloads | 5,428 |
| Current Company Master issuers | 6,073 |
| Combined identity inventory | 6,079 |
| Identities without private payload | 959 |
| Eligible issuers / current stocks | 4,789 / 5,088 |
| ELIGIBLE_FULL | 1,356 |
| ELIGIBLE_PARTIAL | 3,433 |
| Private ineligible issuers | 331 |

PR #584 corrected the legacy listing denominator. The fresh final receipt proves **5,446 private historical listings**, **5,428 current private listings**, and **6,416 listings in the wider identity inventory**. Master-only identities are excluded from private profile/financial/source classifications.

Private exclusions: mapping **2**, source policy **97**, too stale **9**, no safe meaningful content **223**; data invalid, consumer invalid and other **0**. The wider identity audit has **23** mapping failures and **1,161** no-content failures; these include the 959 identity-only records and must not be added to private coverage. Conflict examples CTGG/CTHH (CIK 68622) and TPTS (CIK 1674356) remain quarantined.

## Deterministic rules

Identity must resolve through existing issuer CIK/instrument/listing ownership without unresolved conflicts; name similarity is never a mapping rule. GOOG/GOOGL share issuer intelligence once. ADRs resolve to their issuer with original currency/fiscal period; no local-market facts are fabricated.

Each issuer has an explicit eligible/ineligible status, explanatory reasons, generation and independent flags for profile, Aktuelles, financials, What Changed, next event, calls and documents. Invalid modules are omitted while another valid module can authorize ELIGIBLE_PARTIAL. What Changed alone cannot authorize publication. ELIGIBLE_FULL requires at least four meaningful modules including financials and Aktuelles; partial requires at least one substantive consumer-safe module. Technical metadata, share counts alone, routine SEC filings or generic IR-library links do not meet the content minimum.

All consumer JSON/assets are schema/path/identity/generation/SHA validated. Source provenance and URL safety are required. Approved German profile copy is required for the profile module; safe source fragments or English acquisition text are not finished German profiles. There is no bulk AI translation. News freshness uses publication date: 30-day news, 90-day Aktuelles and 180-day retained content are distinct. Only deterministic HIGH/CRITICAL material SEC events enter Aktuelles; filings are not dumped into News.

Financial metrics require supported currency/unit/fiscal period and valid provenance. Over 180 days is visibly stale; over 730 days cannot authorize financials. Unsupported/invalid metrics are removed, not guessed. What Changed requires current comparable observations. Confirmed future events and estimated reporting windows remain distinct; date-only stays date-only and timezone offsets are preserved. Calls, transcripts, shareholder letters and recordings keep their actual type. Owned substantive documents are useful; unproved recordings and generic library links are hidden.

Discover checks the staged eligible ticker map before any intelligence request. Ineligible issuers have no Company Intelligence requests, empty shell or error card. Existing Discover still works. A bad runtime issuer payload removes only that chapter. Exact issuer operator overrides live in `company-intelligence/config/universe-rollout.json.disabledIssuers`; removing an issuer does not erase private data or disable other issuers. A newly available safe issuer can enter the next validated generation without individual customer approval.

## Module coverage in the accepted candidate

| Module | Eligible issuers | % of eligible |
|---|---:|---:|
| aktuelles | 1,717 | 35.85% |
| calls | 562 | 11.74% |
| documents | 1,793 | 37.44% |
| financials | 4,711 | 98.37% |
| nextEvent | 3,274 | 68.37% |
| profile | 45 | 0.94% |
| whatChanged | 3,626 | 75.72% |

Raw private profiles: 3,684; German approved: **45**. Private profile classifications: 45 approved German; 3,630 acquisition/source profiles without approved German copy; 1,438 without a safe profile source (including the two mapping failures); 7 stale/weak. There is no separately approved non-German consumer profile catalogue. These counts must not be described as approved translated profiles. News: raw 20,555 records / 2,628 issuers; approved exported 14,301 records / 1,749 issuers. Coverage: 1,106 issuers with 30-day approved news, 1,716 with 90-day news, 1,717 with 90-day Aktuelles, 1,750 with retained 180-day records (one archive-only ineligible issuer is absent from the consumer). Policy excludes 2,981 news, 275 calls, 25 events and 4,642 materials. Generic collections exclude another 126 links across 117 issuers; seven document flags disappear and two FULL issuers become PARTIAL without losing overall eligibility.

Financial classifications across **5,120 private payloads**: current 3,697; stale 1,014; no supported display KPI 141; too stale 15; no supported data 251; mapping not evaluated 2. The wider identity inventory additionally has 938 no-data and 21 mapping-not-evaluated identities; those are not private coverage. Invalid metric rows removed: 145; currency/fiscal-period ambiguity cannot surface. Confirmed upcoming events: 190 issuers; estimated: 3,123; both: 39. Management-content evidence: 481 issuers. Raw call/material issuer counts 948/4,944 are not approved consumer coverage.

Source registry: 5,384 rows; approved active 5,355 (2,138 feeds, 1,342 event sources, 1,875 materials). Audit health: 5,158 healthy, 174 temporary failure, 50 stale, 2 broken. Private registered first-party source classifications: **2,014 pollable approved**, **7 registered not pollable**, **3,099 no approved registered source**. Independently supported SEC financials remain eligible even without a registered first-party feed. The broader identity inventory includes one additional pollable master-only source. Registered does not mean recently checked.

## Gaps retained honestly

TSM stays off: reviewed content does not produce a supported meaningful module; IFRS normalization is not invented. GIB, DOX and TKC have only over-two-year-old financial evidence and remain off. ASML, BABA, BIDU, PDD and LI are sparse stale-financial-only; NVO has stale financials plus documents. BRK-A/B has financials, changes and reporting-window intelligence but no approved German profile/current news. XPEV keeps its German profile/news and visibly stale CNY financials. Only 0.94% of eligible issuers currently have approved German profiles; this is the largest consumer limitation.

## QA and reproducible sampling

Seed: `vision-universe-eligibility-20261010`; selection sorts SHA-256(seed + issuer identity). Candidate validation checks all 4,789 view models, 5,088 ticker lookups and 5,414 assets. Initial browser matrix: **239 cases**, **114 eligible** and **20 ineligible** stocks, 390/430/768/1440 px, dark/light, access gate, no overflow/JS errors, correct company/generation/module flags, stale and estimated labels, navigation and source links. Candidate interception is explicitly labelled; final production acceptance must use no interception and hash-read every served asset.

Samples include AAPL, MSFT, NVDA, TSLA, META, GOOG, GOOGL, PLTR and XPEV; 10 each large/mid/small/micro, international/ADR, sparse and seeded random; extra nano and Company-Master-only routes. Size bands use **dated USD closing price × dated reported common shares**, single-listing common stock only, excluding ADR/multiple-class assumptions. They are reproducible proxies, not current intraday capitalization claims.

Large: MOD DVA DVN FRHC DXCM MRK EG GFI ARW VTR. Mid: PTEN WGS TDS CHRD CPB KNSL SKT PACS SLGN ESNT. Small: SPCE DMRA NX HIPO NECB RPD NUTX VTOL SEPN TGLS. Micro: SCNX ASRV PLBY RGS USNA SAFX HCKT BMEA INMB LAW. International: GLNG LYG GDEV CLLS JYD NYAX LBGJ ENLV AIIO HUIZ. Seeded random: MOD DVA GLNG PTEN SCNX DVN FRHC ARGX RAND AIDX. Ineligible: BATL RYDE APLM CPN FSOL STXL WDCVV BLAC HNNAZ SCTX RWAYZ OCFCP SCA PIK ARCL SSMG DCOMP HOOZ GV NXB (17 no safe content, 3 policy exclusions). All negative cases require zero intelligence requests.

Three substantive reviews: (1) generic IR collections were excluded rather than counted as documents; (2) document-only/sparse cards were made substantive and first-action source links retained; (3) measured full-scale R2 throughput led to bounded concurrency, safe public cache, release headroom and recovery fixes. IMO's actual 2025 report was independently opened and issuer-verified; ACU profile-only, SCNX financials-only and XPEV ADR/stale-currency views were inspected. Runtime tests never become coverage or private payloads.

## Source-centric unattended refresh

No discovery, full-universe source rediscovery, paid feeds or Codex/ChatGPT runtime. Registered sources use due timestamps, ETag/Last-Modified, health backoff and checkpoints. Fair lanes: 8 news, 2 event, 1 materials, 1 dormant, oldest due first. News active 4h, dormant 24h, events 8h, materials 24h; SEC uses one shared Atom source plus bounded existing-issuer metadata repairs. IR budget 240 requests/600s, SEC budget 110/240s. Unfinished work remains checkpointed for subsequent runs.

Full-scale isolated [38052669901](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38052669901): **220 external requests** (137 IR + 83 SEC), 83 source checks and 80 SEC issuers. 5,294 due / 5,211 deferred; two new company-facts fetches, 66 financial projections reused. Engine **723.595s**; pipeline before Pages/live **1,564s**; actual job **1,660s / 28 rounded minutes**. 116 delta/canary browser cases passed. Isolated probe had 5,122 private companies and 4,790 eligible issuers; those probe counts are NOT production baseline coverage. Fresh R2 restore/readback passed. The six producer/scheduler/gate/storage guard paths stayed byte-identical through initial release.

This budget does **not** promise every one of 5,355 sources is checked every four hours. At initial backlog, materials may need roughly 52 days and events roughly 19 days for a sweep. No 30-day unattended history or universal 8–12h freshness SLO has been demonstrated. Next optimization should use measured freshness demand and platform sharing, not blind 5,120-issuer polling or broader crawls.

A real source-triggered **event `schedule`** was observed: run 38059718852, 92 requests (47 IR/45 SEC), 153.725s engine, 237s pipeline before Pages/live, no content additions, fresh private state preserved. It used the legacy 46/45 scope. This proves real cron execution, not a full-universe scheduled production cycle. Workflow_dispatch scaling is reported separately. Next scheduled full-scope proof remains required if not observed by completion.

## Publication, cache and rollback

Each run restores current private GOOD, processes bounded deltas, validates affected issuers, generates all consumer assets/eligibility, compares previous generation and writes atomically only after R2 readback. Guard unexpected issuer loss above max(10, 2%), module drops above 10% plus absolute 5/100 thresholds, backward periods, identity remapping, missing assets, malformed schemas and policy violations. Normal small changes pass. Changed issuers plus permanent canaries run bounded delta QA; thousands of browsers do not run every four hours. Full structural checks always run.

Four consumer storage slots retain current/previous GOOD; private CURRENT is independent. Public cache contains only hash-listed consumer JSON, never private manifests/validation certificates/ledgers. Each Pages build re-authenticates R2 GOOD/gate, validates cache paths/bytes/hashes and falls back to R2 on misses. Measured initial full cache acceptance: **10,827 cached assets / 1 remote index read**. Actual GitHub cache size for two generations: **17,848,961 bytes**. Immutable object collision, symlink/path escapes, generation mismatch and snapshot expiry remain blocked.

Known-good rollback namespace `eligible-rollback-top46-v1`, generation `71dc0485476cfa74e59f7fc3`, scope 46 stocks/45 issuers. Tested actual rollback run 38056559970 attempt 2: all 86 consumer assets and 16 real production cases passed, newer private CURRENT untouched. Main-only release mode `rollback` restores its bytes and selects `ROLLBACK_46`; explicit recovery may replace the inactive newer slot, while normal publication remains monotonic. Recovery closes the universe gate before copying and dispatches Pages even if copying fails. Global emergency gate: Pages workflow input `company_intelligence_off=true`; Discover remains intact. Frozen snapshots retain the normal seven-day consumer expiry (Oct17 for this freeze); after expiry use global OFF or a newly verified safe rollback, never bypass expiry.

Production release [38062263190](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38062263190) accepted and served the full generation via Pages 38064882359, whose build and production canaries passed. Broad all-asset readback hit one transient 200 HTML fallback (1,517 bytes instead of expected 10,324), subsequently verified as correct JSON. Recovery then exposed `STALE_PUBLICATION_REFUSED` for the inactive previous slot. PR #582 adds strict bounded hosting retries (maximum 3, four concurrent reads; JSON hash/length corruption is never retried) and explicit frozen recovery. Final release acceptance must be rerun; an initial page load/canary success is not broad acceptance.

Earlier real navigation regression was reproduced in the unchanged back/forward smoke and fixed in PR #576: disposal detaches without aborting a prepared static-data request; existing deadline and disposed-host checks still prevent late mutation. Regression test fails on the original renderer and passes on the fix. PR #578 prevents ignored workflow completions from evicting a valid pending Pages dispatch; original queue expression fails the regression test. No smoke assertion was weakened. All validated code was remotely preserved and merged; final documentation records remaining verification honestly.

## Measured capacity and cost

One full consumer generation: **96,952,850 bytes / 5,414 assets**, two retained ≈194 MB/10,828 objects. Existing public Pages package before widening: **74,552 files / 1,505,394,392 bytes**. Actual widened package: **86,885 files / 1,770,189,709 bytes**, maximum individual asset 20,106,527 bytes. The package also includes independent Europe/market changes; the entire increase is not attributed to Company Intelligence. Browser initial cost 239 cases; routine delta 116 in the scale benchmark. Final cold full R2 stage measured **3m55s**, 0 cached / 10,828 remote assets. Actual unchanged-generation warm Pages run **38071557581** restores a **17,867,588-byte** cache and stages in **14 seconds**, with **10,827 cached / 1 remote asset**. Warm cache avoids repeated 10,827 R2 object reads; every changed generation is still cold by its immutable identity. Shared GitHub cache quota/eviction and other products' costs remain account-wide concerns.

At six cycles/day × 30 days, measured source job **28 rounded minutes → 5,040 runner minutes/month BEFORE Pages wait/live acceptance**. Pages and source waits are reported separately; 5,040 is not a measured end-to-end monthly total or an average of many production full-scope cycles. Existing Pages five-minute weekday schedule implies 2,376 builds per 22-trading-day month plus other triggers; no polling cadence is increased. Repository is public: standard Linux Actions runner incremental billing is currently $0, while usage minutes are still measured.

Worst case six changed consumer generations/day: **32,484 consumer object writes/day**, about **974,520/month**, plus approximately 42 metadata/private writes/day (two private backup PUTs plus about five publication/observation PUTs per cycle). The measured private preservation counter includes reads and must not be labelled as a write count. Four consumer slots plus two private archives ≈0.45 GB. Outside free allowances, storage ≈$0.007/month; consumer Class A ≈$4.39/month. Source+changed/cold Pages reads projected ≈7.8M/month, Class B ≈$2.81 outside free allowance. These are operation-count projections, not account invoices; shared free-tier usage and R2 analytics are unavailable. Without the safe cache, existing scheduled cold Pages alone could add ≈25.7M reads/month. Generation reuse/cache avoids that unnecessary cost.

## Evidence and completion

Public-safe aggregate receipts: `evidence/company-intelligence-full-universe-20261010/`. Full screenshot/browser artifacts remain attached to their Actions runs; no private operational data is committed. Production URL: https://research.visionuniverse.de/discover/#/s/US_REAL/TSLA . Existing Research access control remains in force.



## Final actual acceptance and narrow observability correction

[Release 38068493308](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38068493308) completed **SUCCESS**, code `5dad04b1dcc49bd7c2a791426bdff557fff33f73`. Two authoritative private restorations produced the same consumer bytes. R2 upload, fresh consumer readback, guarded eligibility and cached readback all passed. Actual Pages [38070739184](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38070739184) completed **SUCCESS**, served code `b6e9fefa53ac864eb297f005f997afc770795efe`. Actual wide readback verified **all 5,414 asset lengths/hashes and all 239 cases**, including all 20 ineligible routes with zero CI requests. All 390/430/768/1440 and dark/light cases passed. Consumer generation remains `fad43887526d89bbcaaba628`.

Final private R2 state remains `85ebdc8c1ff855929a828f38`, archive/hash as above. Private state and source registry were not replaced by the 4,789-issuer public subset. The actual final immutable-46 recovery [38067988121](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38067988121) completed **SUCCESS** with all 86 hashes and 16 real production browser cases; frozen generation `71dc0485476cfa74e59f7fc3` was served by code `5dad04b1dcc49bd7c2a791426bdff557fff33f73`.

A third review found a genuine observability defect: initial release copied frozen rollback health (05:54 source / 06:00 build), producing WARNING despite the authoritative 14:36 refresh and the newly verified build. PR #586 initializes health from the restored CURRENT record and provides serialized exact-checkpoint metadata reconciliation. It preserves consumer generation, manifest, assets, eligibility, inventory, previous GOOD and private state. Original acceptance receipt time certifies the historical build; repair time is never substituted for source refresh. Wrong source/hash, future/backwards dates, concurrent pointer changes and failed readback are rejected/compensated. Its actual reconciliation receipt is appended after the main-only run; no completed healthy observability is claimed before that proof.

Actual production screenshots and the complete sample are in [artifact 11677385373](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38068493308/artifacts/11677385373). Human review checked Tesla/Apple/NVIDIA/Palantir/XPeng plus ACU profile-only, SCNX sparse financials and IMO report-only. The screenshots are chapter captures with fixed navigation/keyboard-focus overlays; they are not presented as unmodified full-device screenshots. Source type/date, readable KPI hierarchy, visible stale/estimated labels and useful sparse composition were checked.

Automatic acceptance question: **YES**. Once an issuer is unambiguously in the authoritative identity inventory and has a meaningful approved module, the next successful deterministic generation can publish it without Dennis approving the individual stock. Unsupported/unsafe issuers remain off. Initial rollout expands availability, not commercial source permissions or polling cadence.

Measured Pages jobs (rounded separately): cold full publish 38070739184 = package 10 + deploy 1 + live 2 = **13 minutes**; unchanged warm 38071557581 = 7 + 1 + 2 = **10 minutes**. Existing 2,376 scheduled warm builds therefore project **23,760 minutes/month**; 180 changed-generation cold refresh deployments add **2,340**. Source-only scale jobs add **5,040 before Pages wait/live**. Combined measured-component projection is **at least 31,140 minutes/month**, excluding source-job waiting/live delta QA, other code pushes and other repository products. This is not a measured full-scope production average. Most scheduled Pages volume predates this rollout; cadence was not increased. Public standard Linux runner incremental billing remains $0. A production full-source end-to-end duration will be reported once actually observed.
