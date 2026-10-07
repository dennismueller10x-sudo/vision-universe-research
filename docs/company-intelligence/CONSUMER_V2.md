# Company Intelligence Consumer V2

Status: V2 merged in [#480](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/480), but its first production acceptance failed on one HTTP 503 during static asset readback. The existing fail-closed mechanism disabled the persistent gate and completed the emergency OFF deployment. Discover/Quant navigation and access controls remain working; Company Intelligence is temporarily OFF pending the bounded delivery-resilience correction and repeat full production acceptance. Only the approved 46 stocks / 45 issuers are in scope. No discovery, source-policy expansion, private-state mutation, polling cadence change or wider activation occurred.

## Consumer structure

The existing shared Discover/Quant chapter now uses `Auf einen Blick`, a compact company card and website action; labelled `Aktuelles` cards; financial KPI cards; metric-aware factual comparisons; and concise confirmed/estimated next-event cards. Three stories appear initially, with an explicit expansion. News, relevant high/critical material regulatory events and published earnings/report events are unified and deduplicated by original URL. Routine filings and amendments do not become news.

The displayed intelligence window is explicitly **90 days**. Today, 7/30/90 days, older, future and undated are separate deterministic classes. Publication timestamps/date-only dates are used; observation and source update times are never silently promoted to publication dates. Older/undated items remain in the secondary archive. Empty primary news/calendar/financial/document sections are suppressed. Missing approved German profiles receive one small honest note. Supported historical calls, reports and provenance are collapsed under `Dokumente & Quellen` and `Datenstand und Quellenhinweise`. A source filing with unknown form remains a financial evidence link, not an invented quarterly report.

No new content generation/translation service, employee counts, speculative tags or third-party bodies were added. Full original profile text remains in the expansion; the summary does not change its facts. Financial period/end, currency, comparison basis, retrospective data methodology and visible stale state remain available. Growth acceleration differs from margin changes; debt/cash movements carry neutral increased/decreased labels rather than investment judgements.

## Accepted state and immutable consumer

Authenticated fresh R2 restore and actual production readback: [Actions 37644770891](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37644770891).

- Private accepted state: `21cc611a43b06f488418b58a`.
- Checkpoint SHA-256: `2368931508ec869fed1246733465b15dd550a6bcaec1d2154aed2359cb7ba6f9`.
- Six-table logical restore hash: `87d7a89b4949abd1c11d416005a9fde053196fabe25678d165189275abe39c7b`.
- Original producer `5a3ca18d3099df1f916e922e409aa01cb4a33436` reproduces accepted generation; pinned current producer `abbea154a90ffece598e494530eea38661a20a95` projects `2b1a4bcdffb54e9b40a23a98` from identical rows/timestamp.
- Consumer: `d700d480d9b2858eb8fa34f4`, data time `2026-10-06T14:00:21Z`, 45 issuer payloads / 46 symbols, 86 byte/hash-verified production assets.
- The private full state remains 5,120 payloads, 3,678 profiles, 2,601 news issuers, 1,069 call issuers and 1,821 presentation issuers. These totals are not customer coverage or current-news claims.
- Consumer source policy remains `OWNED_IR_SEC_METADATA_PREVIEW_V1` (legacy policy name; existing production approval still applies): verified company-owned/IR platform metadata and SEC/regulatory facts/original links. Publisher reuse is not inferred from public access. No full article bodies are published.

## End-to-end cohort audit

[Per-issuer audit](consumer-v2/delivery-audit.json) contains every issuer, ticker aliases, ledger/export/allowed/consumer/production counts, latest ledger publication timestamp, freshness buckets, accepted module combinations and stage-specific exclusions. [Actual protected before browser report](consumer-v2/live-before-report.json) and saved DOM prove the existing production display for all 46 stocks, without query opt-in. The initial URL intersection also counted document links; reconciled primary counts use the saved actual `Neuigkeiten` DOM, not those supporting links.

| Stage or gap | Records | Issuers | Meaning |
|---|---:|---:|---|
| Private ledger NEWS | 286 | 30 | Accepted private rows, not worldwide coverage |
| Engine consumer export NEWS | 286 | 30 | No cohort news lost at ledger-to-engine export |
| Allowed after source policy | 255 | 25 | Metadata with approved source basis |
| Excluded by source policy | 31 | 8 | 21 publisher items and 10 lacking a verified owned host |
| Excluded by consumer retention | 42 | 10 | Every excluded date is before the accepted 180-day retention boundary |
| Approved consumer / actual production NEWS | 213 | 25 | Exact production bytes verified; no delivery mismatch |
| No ledger NEWS | 0 | 15 | **Data does not exist** in this accepted ledger |
| NEWS with publication date within 30 days | — | 18 | Current-news issuer count, not raw article count |
| NEWS within 90 days | — | 24 | Explicitly labelled recent window; not all current |
| Apple NEWS without publication date | 20 | 1 | **Exported**, accessible in archive; never claimed as dated current news |

**DATA DOES NOT EXIST:** 15 issuers have no accepted ledger NEWS; the cohort has no accepted material SEC events. Financial source references alone do not establish Tesla material announcements. **DATA EXISTS BUT IS FILTERED:** 31 items / eight issuers; source policy remains intact. **DATA EXISTS BUT IS NOT EXPORTED:** 42 old items / ten issuers intentionally outside consumer retention; zero unexplained ledger/export loss. **DATA IS EXPORTED BUT NOT RENDERED AS PRIMARY CURRENT NEWS:** older, undated and items beyond the initial story limit remain in labelled secondary/expanded views; this is presentation selection, not missing production bytes. The previous shared list limits omitted 57 exported news records across 19 issuers, including all 20 undated Apple items. The final local V2 package renders all 213 metadata items in primary/expanded/archive views; actual production validation remains pending.

The same approved cohort has 31 German profiles, 44 issuers with financials/What Changed, four with explicitly stale financials, 15 with supported calls, 38 with calendar content and 44 with documents. Sparse combinations are valid; no issuer is required to have every module.

### Tesla

`iss_cik_0001318605`: **ledger 1 → engine export 1 → allowed 0 → consumer 0 → production 0 → primary visible news 0**. The ledger item is a Wallstreet Online opinion headline from `2026-10-01T14:13:00Z`, correctly excluded as unapproved publisher content. There is no accepted official announcement, delivery/production update, earnings release, material SEC event or supported call in these accepted Tesla rows. The ledger calendar has one estimated earnings window; financial evidence links are supporting documents, not manufactured news.

Tesla V2 consequently shows its source-based German business description, website, available Q2 2026 metrics, factual changes, the clearly estimated Q3 reporting window and three financial evidence links in collapsed documents. It does not show a large no-news or no-confirmed-event block. Solar/product specifics and annual-report profile provenance remain inspectable.

## Three substantive reviews

1. **Consumer value:** reordered around business, developments, performance and next step. Removed dominant missing-data blocks and repetitive report-source lists; supported first-party categories and relevant regulatory/earnings events now share one consumer layer. Tesla's source exclusion is explained rather than bypassed.
2. **Visual/mobile:** compact cards, current values stronger than previous values, neutral comparison labels, restrained borders, source/website touch targets and VU theme tokens. Profile specifics can expand. Fixed navigation is preserved; all four viewport sizes and both themes are reviewed.
3. **Data honesty:** a 30-day status could mislabel older entries mixed into a 90-day list; the list now explicitly says 90 days. Unknown Apple dates stay unknown. Estimated windows remain marked, date-only remains date-only, Berlin times use DST-aware formatting, stale financials remain visible, and replay/transcript types require explicit evidence. Documents with unknown forms do not acquire guessed fiscal/report labels.

## Validation and deployment boundary

669 Company Intelligence Python tests and 65 Node tests passed. Dedicated consumer-view tests cover publication/observation distinction, freshness, material-event/release unification, duplicate/unsafe/wrong-issuer/future records, separate date-only release/call, cancellation, estimates, unsupported comparisons and share-count context. 216 actual Discover/Quant and 38 adversarial browser cases preserve uncertainty, source safety, exact fiscal basis and failure-closed generation handling. The final frozen package passed all 368 Discover stock/theme/viewport combinations, plus 216 Discover/Quant cases and 38 adversarial cases. Additional access-gate/resource/Ask/Academy/worker tests: 64 pass; VU2 Python: 32 pass. All 45 representative original links returned HTTP 200 in the refreshed HEAD-only review.

The original V2 broad regression classifier independently reproduced the four known failures on exact pre-V2 base `b2d0f3c842895d631b2cd4825c74df9f8d5ca670`. The delivery-resilience follow-up uses its own exact production base `ffb076ec2e5a86add3e50e72a228c272765289b9`; protected price/provider/engine/test inputs must be identical. It never waives an unknown failure. The four previously known price-data/regeneration failures must also reproduce on the independent baseline.

## Rollback

The previously proven rollback remains:

```sh
gh workflow run company-intelligence.yml --repo dennismueller10x-sudo/vision-universe-research --ref main -f production_release=disable
gh workflow run pages-release.yml --repo dennismueller10x-sudo/vision-universe-research --ref main -f company_intelligence_off=true
```

Persistent R2 gate OFF plus emergency Pages deployment returns existing Discover/Quant to their prior gated state with zero intelligence requests. Existing proof runs: gate `37619316680`, actual production OFF `37621430662` and routine OFF `37631776819`. Keep immutable accepted state/consumer and failed evidence. A V2 code regression may additionally revert this consumer-only UI commit through the normal production pipeline. Previously loaded tabs require a reload; static deployment propagation is not described as instantaneous revocation. No locks, generations or private state are forcibly removed.

## Next recommendation

**C, staged:** prioritize targeted approved first-party news/date and supported management-content gaps in the existing live product, then extend V2 only to additional issuers whose German profiles, financial period, source basis and sparse combinations pass the same checks. The measured 18/45 current-news and 31/45 German-profile availability does not justify enabling all 5,120. No expansion occurs in this task.

## First deployment failure and proven rollback

[Failure evidence](consumer-v2/failed-production-20261007.json): [production run 37648837955](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37648837955) built and deployed merge `b65889f247b463d585e794fa1d703806536cfde7`; one TOST immutable payload returned HTTP 503 before browser acceptance. No hash or issuer mismatch was observed. The existing safety step disabled the persistent gate and dispatched [emergency OFF run 37650122560](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37650122560), which passed all eight actual Discover/Quant viewport OFF cases with zero consumer requests ([report](consumer-v2/rollback-20261007.json)). Failed code and immutable generation remain preserved.

The correction permits at most three attempts per static resource, with 250/750 ms backoff, only for transient 429/500/502/503/504 or network errors. Abort cancels backoff. Normal requests and source cadence are unchanged. 403/404, malformed JSON, identity/schema/generation/hash failures are not retried or waived. The production verifier records transient retries and still requires every final response and all 86 hashes. Unit and adversarial browser cases prove both recovery and permanent failure closure.
