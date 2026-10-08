# Top-46 content release: acceptance evidence

This release keeps the existing V2 interface and the approved 46-stock / 45-issuer cohort. It adds reviewed German profiles and first-party news metadata, repairs exact publication days, and adds explicitly announced Tesla dates. It does not broaden production or change the accepted private baseline.

## Preserved baseline

Accepted state `21cc611a43b06f488418b58a`, accepted R2 namespace `accepted-20261006-21cc611a43b06f488418b58a`, checkpoint SHA-256 `2368931508ec869fed1246733465b15dd550a6bcaec1d2154aed2359cb7ba6f9`. Fresh authenticated restore: [run 37777875327](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37777875327). All 5,120 payloads and the reviewed D700 cohort reproduced.

The new full derivative is backed up in a separate `content-top46-*` namespace before consumer publication. The original accepted R2 pointer must remain byte-identical. Full tables, aliases, audit, source registry, operational checkpoints and archive are checked; all non-cohort records remain unchanged. Public evidence contains counts/hashes only.

## Source and date review

- `profile-source-review.json`: all 14 formerly unavailable or inadequate profiles, source URLs, German paraphrases and review status.
- `zero-news-source-review.json`: all 20 baseline zero-approved-NEWS issuers, including exact technical/policy exclusions.
- `publication-date-review.json`: 20 Apple publication days recovered from each original article; no observation timestamp is represented as publication.
- `stale-financial-review.json`: fresh checks of TK, VEON, XPEV and ARBE. Existing normalization still yields quarter-end 2025-12-31; stale labels remain. XPeng newer official results are news evidence, not silently substituted financial metrics.

First-party ownership verification is required. Existing approved source policy remains unchanged. Full third-party bodies, rejected publishers, private state and credentials are excluded. No new discovery campaign or polling cadence is activated.

## Rollback

Baseline manifest, release candidate and production approval are preserved alongside these notes. The old `production-discover-d700d480d9b2858eb8fa34f4` namespace remains available. A normal reviewed revert of the generation bindings restores it. For a material production error, first run the existing Company Intelligence workflow with `production_release=disable`, then Pages Release with `company_intelligence_off=true`; verify disabled delivery and zero Company Intelligence requests on Discover and Quant. Navigation and access control remain unchanged.

Final measured counts, restore/readback runs, cohort/browser results and production URLs are recorded after acceptance. Preparation alone is not production success.
