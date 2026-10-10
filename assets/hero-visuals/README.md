# Hero backdrops

Decorative Vision Universe compositions: Discover globe, Screener glass filter,
Vorsorge plant in glass sphere and Hedgefonds institutional architecture.
Original background artwork generated for this fidelity pass, encoded once as
640px WebP (22–46 KB). No stock photographs, interface text or product icons.
SuperTrader SVG is a decorative chart without market data, numbers or returns.
Quant reuses `QX.globe()`; it needs no additional image resource.

Original product symbols remain in `assets/product-icons.svg`, unchanged.
Only matching `.vu-hero-fidelity[data-product]` elements request these images.
Shared CSS source: `assets/product-hero.css`. Regenerate its committed product
style inclusions with `node scripts/design/sync-product-hero.mjs`; verify with
`--check`. No runtime CSS loading or application library is required.
