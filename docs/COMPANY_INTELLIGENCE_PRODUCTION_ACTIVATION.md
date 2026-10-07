# Company Intelligence — controlled production activation

Dennis explicitly authorized controlled production activation on 7 October 2026. This supersedes the historical preview-only / no-merge limits in the recovery reports. The existing Discover and Quant integration is retained; the first production cohort is the 46 reviewed stock tickers (45 issuers), not a claim that all 5,120 private payloads are publicly available.

## Accepted data and publication boundary

The authoritative private R2 state is `21cc611a43b06f488418b58a`, in the existing accepted-state namespace. It contains 5,120 consumer payloads, 3,678 source profiles, 2,601 news issuers, 1,069 call issuers and 1,821 presentation issuers. The six-table restore proof is `87d7a89b4949abd1c11d416005a9fde053196fabe25678d165189275abe39c7b`. The accepted archive, private checkpoints, raw ledger, aliases and audit histories never enter the Pages release.

The exact reviewed consumer is `d700d480d9b2858eb8fa34f4`: 86 assets, 1,780,647 bytes, 46 tickers and 45 issuers. The reviewed manifest SHA-256 is `3fc25e0be8d0686ea15da101e508da23e5a573fe9b19474f86bad8d8a940a3ce`. Production publication changes only the manifest approval marker; it preserves every consumer asset byte, generation and original timestamp. Promotion checks the entire approved asset set, cohort, source policy and timestamp. A fresh runner restores the durable private state, reproduces the export, verifies that consumer, publishes into a dedicated consumer namespace and independently reads back every approved asset before enabling the gate.

Consumer namespace: `production-discover-d700d480d9b2858eb8fa34f4`. Production Pages downloads consumer-safe assets from this namespace; it never serves workspace state or private checkpoint objects. Generation mismatch, absent gate, wrong approval or corrupt bytes stop release construction.

## Source and product acceptance

The existing `OWNED_IR_SEC_METADATA_PREVIEW_V1` policy remains pinned; its historical name does not enable unreviewed publishers. Enabled: exact verified company-owned IR metadata and company materials/webcast references; SEC regulatory metadata, facts and original links. Excluded: GlobeNewswire, BusinessWire and other external feeds lacking suitable reuse evidence. No third-party article bodies, employee counts, paid AI/translation services or new data-provider integration.

The cohort includes AAPL, NVDA, TSLA, MSFT, PLTR, GOOG, GOOGL, XPEV, large and smaller issuers, ADRs, foreign issuers, banks, insurers, industrials, healthcare/biotech and sparse-data cases. [Inventory](company-intelligence/full-data-release-candidate.json) records the actual available modules. There are 31 verified German profiles, 25 news issuers, 44 financial modules (four stale), five issuers with confirmed upcoming events, 15 historical call issuers and 44 materials issuers. Missing profiles are honestly labelled; unsupported sections are suppressed. Filing-derived estimates remain explicitly estimated reporting windows, not confirmed earnings dates. Webcasts are not automatically labelled recordings; shareholder letters are not transcripts.

[Current numeric band review](company-intelligence/production-numeric-band-review.json): BOH mid cap ($2.655bn), SBSI small cap ($899.9m), AMPY micro cap ($185.7m). These are 6 October 2026 unadjusted USD closes multiplied by separately dated, unambiguous SEC-reported common shares, not intraday market-cap promises. The existing authenticated Tiingo adapter and SEC API were read only; no market-data or factor changes.

[Independent regression classification](company-intelligence/production-regression-classification.json): candidate and separate main baseline reproduce the same four existing JPM total-return price-data failures, with identical protected data/engine/test inputs and zero new branch failures. Original PR CI is not weakened or described as green. Current #478 Core is green. Vercel's deployment quota failure is independently present on unchanged main; production uses GitHub Pages. Production Pages packaging and actual access-gated smoke must pass before activation.

## Activation sequence and rollback

1. Merge the foundation PR #356 first, with gates off. Merge SHA: `3942e358c26f6c960e4df95894504ce5d3676a82`.
2. Verify the restored production consumer and final cohort, then merge only the dependent Discover/production delivery change (#455), with current main ancestry, expected remote head and clean working tree.
3. Deploy while the persistent R2 gate is `STAGED`; prove the real Discover/Quant release still performs zero Company Intelligence requests.
4. Explicitly enable the R2 gate only after all 86 approved asset hashes have been reread. Deploy through the existing Pages release/access pattern.
5. Verify the actual `https://research.visionuniverse.de` release source SHA and all public consumer bytes; test the 46-stock cohort at 390, 430, 768 and 1440 pixels plus dark mode and representative Quant compatibility. Failed acceptance disables the persistent gate and dispatches an emergency gate-off release.

Manual rollback, using the existing authenticated workflows on main:

```sh
gh workflow run company-intelligence.yml --ref main -f production_release=disable
gh workflow run pages-release.yml --ref main -f company_intelligence_off=true
```

Disabling writes and rereads only the dedicated `gate.json`; it preserves the failed consumer generation and every private object. The emergency Pages flag requires zero R2 consumer reads and closes both the standalone Discover config and the shared Quant bundle, including query overrides. An unavailable generation therefore cannot prevent gate-off delivery. Future ordinary releases also remain off until the persistent gate is deliberately re-enabled. The previous two-slot consumer pointer/recovery mechanism remains intact; no richer private generation is overwritten. Static Pages propagation takes a release cycle, and already-loaded browser tabs are not remotely evicted immediately.

Full 46-stock responsive and dark-mode acceptance runs only with the explicit `company_intelligence_acceptance=true` Pages input, including activation. Existing automation also uses workflow dispatch, so event type alone does not select full acceptance. The post-deploy mode is bound to the package output; a concurrently enabled R2 gate cannot relabel an already built off artifact as active. Ordinary existing Pages/data deliveries use a short real-production AAPL/XPEV/hash/access smoke; release construction still verifies all 86 R2 assets on every enabled delivery. No full browser cohort or discovery campaign is added to the existing five-minute market-data delivery bridge.

The automatic live workflow executes the same disable + emergency redeploy on any material production acceptance failure. A deliberate off release is tested in eight real-product/viewport cases rather than triggering a rollback loop.

## Freshness and costs

The served facts retain their real 6 October data timestamp. Existing 48-hour stale warnings and seven-day consumer expiry remain operational; an expired export is not indefinitely advertised as current. This activation does not start a new discovery/backfill campaign or increase cadence. Consumer delivery is approximately 1.8 MB per static deployment; all visitors reuse prepared assets. R2 publication/read-back is bounded by 86 assets and the existing retained slots. No new paid provider or AI cost is introduced. [Cost assumptions](company-intelligence/full-data-cost-model.json) distinguish the 96-source cohort model from the unmeasured full-source operation; they are not measured spend or full-universe cost guarantees.

## Live evidence

**Production acceptance passed on 7 October 2026.** [Actual production proof](company-intelligence/production-live-acceptance.json), [R2 fresh restore/publication/readback](company-intelligence/production-r2-acceptance.json), [rechecked 45 original source links](company-intelligence/production-source-links.json), [responsive report](company-intelligence/production-evidence/live-cohort-report.json) and [dark report](company-intelligence/production-evidence/live-dark-report.json) are consumer-safe evidence.

Actual URL: `https://research.visionuniverse.de/discover/#/s/US_REAL/AAPL`, behind the existing Research login. Pages run [37633101864](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37633101864) passed package, both product smokes, deployment and complete live acceptance. Served SHA: `f5b9acf0c8db9b443a0763096b39d7260d3f6d24`. Consumer: `d700d480d9b2858eb8fa34f4`, all 86 asset hashes verified on the actual origin, 45 payloads/46 stocks; no private objects read by public delivery. R2 enable/readback run [37632810047](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37632810047) passed without modifying private state.

All 46 Discover stocks passed at 390/430/768/1440 px; eight additional Quant stocks passed in those widths: 216 responsive cases, plus eight dark cases. Out-of-cohort cases made zero consumer requests. Tested JavaScript errors and horizontal overflows: zero. Existing access gate verified; no preview query opt-in. All 45 representative original links returned successful HEAD responses on 7 October; no article body fetched. This is sampled production observability, not a claim to account-wide telemetry or inspection of every private issuer.

Manual production screenshot review: [AAPL](company-intelligence/production-evidence/discover-AAPL-390-chapter.png) has correct fiscal periods, archived-only old news and explicitly estimated reporting windows; [ACU](company-intelligence/production-evidence/discover-ACU-390-chapter.png) preserves its sourced German description and honest sparse-data hints; [XPEV dark](company-intelligence/production-evidence/discover-XPEV-390-chapter.png) preserves CNY, clearly stale FY2025 Q4 figures, correct comparisons and readable contrast. No material Company Intelligence issue remained.

Sequential merges: #356 `3942e358c26f6c960e4df95894504ce5d3676a82`; #455 `7a8bab67944724a218abae3ed33955a7e7547077`; minimal German-label fix #477 `b39d8d7ddbd093d138e2844ddec2cb2bb07a6962`; release-transition/rollback-QA fix #478 `e41dfc756966c42c2031466b862ef8295dbc8139`. #478 adds six files/paths only; regular upstream data commits were preserved. Current PR Core, package, both access smokes, currency and workflow configuration passed. The original Company Intelligence regression job reproduced exactly the independently classified four existing price-return failures; no new failures were waived.

The byte-identical approved index retains its historical PREVIEW marker. The production manifest is APPROVED_CONTROLLED_PRODUCTION and persistent R2 gate AVAILABLE; the exact expected-generation production binding suppresses preview mode in the customer UI. No generation or data timestamp was rewritten to manufacture freshness.

Rollback was actually proven by persistent disable/readback and hard-off Pages run [37621430662](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37621430662), all eight real Discover/Quant width cases. The transition false alarm additionally exercised automatic persistent disable and emergency dispatch; #478 fixes the packaged-state race and waits for the asynchronously restored hard-off runtime. Static redeployment propagation remains necessary; already loaded tabs are not instantly revoked.

Remaining visible limits: 14 issuers lack an approved German profile; four financial modules are stale and labelled; news titles can retain their original language, and old/undated items are separately archived. Approved facts remain dated 6 October; refresh before the seven-day consumer expiry on 13 October is the next operating task. No broad discovery, provider upgrade or polling-cadence increase was started. No blocker remains for the approved 46-stock activation.

The evidence above records actual completed production and R2 runs. Post-launch evidence is preserved on a separate documentation branch to avoid another runtime deployment solely for the report; all production implementation commits are already on main.

Activation after verified R2 enable uses `gh workflow run pages-release.yml --ref main -f company_intelligence_acceptance=true`. Regular automated dispatches retain short smoke. A late disable of an enabled artifact still triggers fail-closed rollback.
