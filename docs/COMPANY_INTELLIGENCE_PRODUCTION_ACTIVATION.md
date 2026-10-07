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

[Independent regression classification](company-intelligence/production-regression-classification.json): candidate and separate main baseline reproduce the same four existing JPM total-return price-data failures, with identical protected data/engine/test inputs and zero new branch failures. Original PR CI is not weakened or described as green. Main's separately reproduced platform-home navigation timeout and unrelated Vercel deployment quota status remain separately classified. Production Pages packaging and actual access-gated smoke must pass before activation.

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

Actual production deployment, served SHA, R2 read-back and browser results will be appended only after their corresponding real runs pass. A successful local or packaged preview is not recorded as a production deployment.

Activation after verified R2 enable uses `gh workflow run pages-release.yml --ref main -f company_intelligence_acceptance=true`. Regular automated dispatches retain short smoke. A late disable of an enabled artifact still triggers fail-closed rollback.
