# Discover Admission 2.0 — product integration

Discover uses the canonical Core identity and close-chart contracts. A visible European browse card or search result must have `UNIVERSE_IDENTITY_READY`, `DISCOVER_ELIGIBLE` and an actually loaded `CHART_READY` or `CHART_LIMITED` series. The adapter checks at least 20 positive, ordered observations over 30 calendar days, listing/security/currency bindings, the latest close and the final permission after loading. Identity-only records, including a single-observation record, produce no visible result or new watchlist entry.

Technical certification, adjusted OHLC, volume, fundamentals and Quant readiness are separate. Their absence does not prevent the basic chart. Missing scores remain `null`. Existing analytical engines, US routing, rankings, strategy populations, schedules and the US watchlist store are unchanged.

The existing Discover screens and routes provide search, detail, charts and canonical watchlists. Search uses Core ticker/name/aliases/ISIN matching and deduplicates security IDs. Each displayed result resolves to its canonical detail and chart. Add, save, reload and remove use the separate Core European watchlist store; a saved record that later becomes unavailable can still be removed without displaying its former licensed identity. Explicit `#/watchlist/EUROPE` survives page reload. European world/strategy navigation stays within the admitted catalog and does not request nonexistent European row or feed files.

Charts use `discoverPriceBasis || priceBasis`; the new Discover proof specifies `RAW_UNADJUSTED`. This does not alter the stricter analytical price basis. Native listing currency is preserved in cards and details. A minor quote unit that differs from that currency is blocked until the UI supports it explicitly. Provider-validated segments render separate line and fill paths; missing observations are never connected or estimated. The default one-year window remains usable for a limited but meaningful history, with a shorter-history warning. Longer and maximum-history buttons are disabled until their own data path is implemented and validated.

The detail screen states missing analyses verbatim:

- “Quant-Analyse für dieses Wertpapier noch nicht verfügbar.”
- “Technische Analyse für dieses Wertpapier noch nicht verfügbar.”

It also labels limited charts and delayed EOD dates. It does not claim European realtime or adjusted-price certification.

## Private preview and public rights

The default product adapter requires a Core public tier of at least two before loading or displaying European data. Injecting a research Core client alone cannot bypass that requirement. Public display rights remain unconfirmed.

Private research requires both explicit options, captured when the adapter is created:

```js
VUDiscover.App.configureEurope({
  client: privateCanonicalCoreClient,
  watchlist: canonicalEuropeWatchlist,
  securityRefs: sourceBoundCanonicalReferences,
  audience: 'research',
  privateResearch: true,
  now: sourceEvaluationTime
});
VUDiscover.App.selectUniverse('EUROPE');
```

There is no URL or query-string activation. The screen says “Private Recherche-Vorschau · nicht öffentlich freigegeben.” Product envelopes, including chart responses, carry `publicationAllowed: false` in this mode. Unknown rights never become confirmed through the preview.

## Synthetic browser validation

The final targeted suite passed **19/19 tests, zero skips**. It includes actual Core admission, next-session-close expiry, post-load permission/basis/identity changes, default rights closure, private preview, alias deduplication and canonical watchlist persistence. Renderer tests preserve the original US SVG output and verify that neither a line nor an area fill spans quarantined gaps.

The existing UI passed Chromium 151 on a mobile viewport, WebKit 26.5 desktop, and WebKit iPhone 13 emulation. Each scenario exercised US detail routing, keyboard search, raw EUR detail, visible analysis messages, watchlist add/save/full-page reload/remove, dark mode, private preview and European navigation. All five accessibility flows per scenario had **zero Axe violations of any impact** after finite UI animations settled. No provider requests occurred. The measured existing Discover view budget remained **179,991 decoded bytes and seven requests**, within 180,000 bytes and twelve requests.

These fixtures are synthetic. They prove UI behavior and gates, not live prices, a current admitted-universe count or licensing rights. The private receipt is `/workspace/europe-discover20-private/browser-synthetic/validation-receipt.json`, SHA-256 `a3dc801ccc6d543f644727a99ca52484d3c628f5feb8d302a975d3c8268452be`; it pins browser reports and the tested Core/Discover source bytes. Earlier intermediate reports include defects corrected before this final run.

## Actual private catalog validation

The final authenticated source envelope is pinned to SHA-256 `9108eb59022c93e0ac8df7fdf134ffb7ea0e84e7deb0112444edf3146c26ba62`, evaluated at `2026-10-10T07:40:26.728449+00:00`. The central-logo catalog overlay is pinned to `4a8a32e839c206465c6c04edb1d9cd6c97f4e185e308dadb5109412f6c974fb9`; its receipt proves that every non-logo field matches the original catalog. Core uses the existing registry resolver, rather than trusting a producer logo status.

The actual consumer replay loaded the complete catalog and proved **449 admitted securities from 440 companies**. Of 504 retained canonical references, 55 remain unavailable. Admission comprises 260 previously accepted securities and 189 `DISCOVER_ONLY` securities. Germany has 319 admitted securities by verified issuer country. These counts describe private Discover admission, not public availability or analytical certification.

All 449 have an actually loaded, meaningful **CHART_LIMITED** one-year raw-close series and matching latest price, listing, currency, date and close. At the pinned evaluation they are **DELAYED**; the UI displays the dated EOD warning and makes no realtime claim. Core search passed **2,631 ticker/name/ISIN/alias queries**, with the requested canonical ID present and zero duplicate results. All 449 passed add, save, reload and remove. The existing US watchlist storage stayed byte-identical. The protected union contained 29,112 IDs with zero collisions. The replay observed 449 private series loads and zero public series loads, US calls or provider calls. All admitted scores remain null and the existing detail UI reports Quant and technical analysis as unavailable.

Actual central-logo resolution for admitted securities produced **13 VALID, 430 FALLBACK and 6 SUSPECT**, with no missing status. Each valid logo key and local asset SHA matched the current central registry; fallback and suspect statuses never block admission.

The full replay is `/workspace/europe-discover20-private/product-final/actual-consumer-replay.json`, SHA-256 `721e89a99a2f1b00ec8968162e15b290200811491e0929f86b030b919d73b38e`. It pins the exact catalog, series, protected-ID and logo inputs before and after execution, the actual Core/Product source bytes, and the private audit runner. Its rows record real chart tuples, source dates and successful query/watchlist proofs.

A separate actual-source browser replay passed Chromium mobile, WebKit desktop and WebKit iPhone 13 emulation. Its exact representative subset contains Deutsche Bank (German issuer and valid local logo), 123fahrschule (new Discover-only admission), and ABN AMRO (retained identity and fallback logo). Adyen's actual one-observation series and IOS's identity conflict remain invisible and cannot create new watchlist entries. ERF is not used as a blocked fixture: the final authenticated history now contains 239 observations.

Each browser verified raw EUR price/detail/chart coherence, keyboard ISIN search with one canonical result, visible missing-analysis messages, canonical add/save/full-page reload/remove, dark mode, explicit private labelling and default public zero-load closure. Five accessibility flows per scenario produced **zero Axe violations of any impact**. Provider and US calls were zero, the US watchlist sentinel was unchanged, and the existing view budget remained **179,991 bytes/seven requests**. These European chart observations come from the pinned actual private source; the independent US route sentinel remains synthetic. No live-price or display-rights claim follows from these tests.

Actual mobile validation found a long legal-name overflow. The optional Europe view now wraps the complete name inside its title; the US view and shared CSS are unchanged. Both final synthetic and actual browser matrices passed after this scoped fix.

The combined private validation receipt is `/workspace/europe-discover20-private/product-final/validation-receipt.json`, SHA-256 `95bb979d67d2a07361c23c3029f778a17737ab63f10072ba457e7a718365870f`. It binds the complete 449-security replay, the three actual browser reports and screenshots, the separately labelled synthetic receipt, the audited source bytes and the pinned input hashes. Public publication remains closed.
