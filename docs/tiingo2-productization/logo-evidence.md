## Central logo materialization

The 102 accepted additions and DNA/AMC/BIRD/AMWL were resolved through the existing `scripts/discover/build-company-logos.mjs` pipeline into `.verification/tiingo2-logo-shadow/discover/logos`. Production assets were read only. SEC submissions and issuer filings identified 51 official domains; the existing website icon/logo parser downloaded and normalized the images. No logo vendor or separate acquisition pipeline was introduced.

The final report contains 106 securities: 35 `LOGO_VALID`, 68 `LOGO_FALLBACK`, zero `LOGO_MISSING`, and three `LOGO_SUSPECT`. Valid assets include DNA, AMWL, CART, FLY, Q, VLTO, and SKHY. SKHY's logo came from its SEC registration filing and was visually verified. AMC, FIG, and SNDK use the existing `/discover/ui/logos.js` fallback. Missing or rejected logos never block securities or factor materialization.

BIRD's issuer identity remains unresolved. SEG's downloaded icon was a solid placeholder. PASW's icon displayed “Majestic Ideal Holdings” while its canonical issuer is Ping An Biomedical; it remains quarantined for brand review. Suspect assets were removed from the shadow index and asset files. Review evidence is recorded in `logo-asset-reviews.json`.

All downloaded candidates were decoded and checked for size, visibility, transparency, placeholders, and broken images. A contact sheet was visually inspected for issuer/brand mistakes. The central renderer's existing `dark` treatment and optional wide images remain available; assets are not recolored. Website assets retain the pipeline's trademark attribution and identification-only boundary. Sources, domains, license labels, canonical paths, and SHA-256 cache hashes are recorded per security in `tiingo2_logo_report.json`.

The shadow adapter uses one asset per canonical company (company ID, or validated CIK), with ticker aliases pointing to the same central path. Its tests cover SVG/PNG/WEBP validation, broken/blank images, primary issuer evidence, deduplication, baseline preservation, nonblocking fallbacks, brand quarantine, and protection against production paths and symlink aliases.
