# Release scope correction — 2026-09-18

Observed main: 7eef4b8eb740784ccd559fcbd80d96714d6a7a5f.

PR 96 deployed the VU2 experience, not a complete full-universe Quant product.
The earlier all-PASS release report overstates the evidence. The recorded
production browser checks did not establish production mobile, performance,
full-universe data availability, or current R2 product delivery. Candidate CI
evidence must remain separate from production smoke evidence.

## Confirmed integration defect

`quant/config/development-preview.json` already grants public market display
for PRODUCT_UNIVERSE on the owner's 2026-09-13 declaration. The five `scope`
symbols are not the full public entitlement boundary.

`quant/api/product-services.js` nevertheless selects only `preview.scope`,
checks the `development_preview` audience and requires rows in the small
`quant/data/sec/quant-factor-inputs.json` panel. The existing
`instrument-directory.js#getFundamentals` reads that same panel.
Changing only permissions or removing the five-symbol check cannot supply
missing normalized fundamentals or a valid full-universe ranking.

## Existing storage and delivery boundary

`quant/data/fundamentals/persistence.json` records 5,480 persisted issuers
at `r2:vision-universe-history/v1/sec/fundamentals/`. This is storage evidence,
not a browser delivery endpoint or fresh end-to-end product-service proof.
The release packager intentionally excludes full SEC consumer/canonical and
fundamental stores. Keep the fixed 8 MiB budget and all source data.

Next integration: establish the existing authorized R2 product read endpoint
and contract, adapt the existing Product Service using Company Master IDs,
and validate missing-data, metric, PIT and ranking semantics before broadening
the public Quant universe. Do not import Discovery product logic or calculate
replacement scores. Do not call this integration completed by deploying a URL.

Both `/quant/` and `/Quant/` resolve to the same experience in the proposed
release artifact. This routing repair does not resolve the data integration.

FULL_QUANT_UNIVERSE_RELEASE = NOT_COMPLETE
PUBLIC_MARKET_ENTITLEMENT = OWNER_DECLARATION_PRESENT
R2_PRODUCT_DELIVERY = INTEGRATION_REQUIRED
PRODUCTION_MOBILE_AND_PERFORMANCE = NOT_REVERIFIED
