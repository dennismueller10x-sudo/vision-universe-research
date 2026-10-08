# Discover Europe browser validation

The actual existing Discover UI passed the isolated opt-in Europe integration suite on 2026-10-08: **10 tests passed, 0 failed, 0 skipped** (seven service tests and three real-browser scenarios). This validates the Core/Discover hooks with synthetic accepted identity and explicitly synthetic display rights. It grants no production rights and publishes no Marketstack data.

| Scenario | Browser | Profile | Result | Provider requests | axe violations |
|---|---|---|---|---:|---:|
| `chromium-mobile` | Chromium 151.0.7922.173 | 390 × 844, mobile/touch | PASS | 0 | 0 |
| `webkit-desktop` | WebKit 26.5 | 1280 × 900 | PASS | 0 | 0 |
| `webkit-iphone13` | WebKit 26.5 | Playwright iPhone 13 device profile | PASS | 0 | 0 |

iPhone coverage is browser/device emulation, not a physical-device test. The suite loads the shipped `discover/index.html`, App, Search, Detail and Cards scripts from a local HTTP server. Synthetic fixtures are served in memory; production artifacts are never created or changed. External requests are blocked; the reports record only an attempted Google Fonts request and no Marketstack or Tiingo request.

## Verified behavior

- Existing US search and `#/s/US_REAL/TESTUS` detail use the existing US route. The US watchlist value remains unchanged throughout the Europe workflow.
- Default closed rights hide European identity/search/browse and prevent canonical series loading, including an accidentally injected private-research client.
- Explicit synthetic rights enable one canonical browse card and one alias-search result without duplicates. Keyboard `/`, ArrowDown, Enter and Escape exercise the existing search overlay.
- The canonical European detail route shows the raw unadjusted basis and native EUR currency, with no unqualified link into a US technical product. Chart loading uses only the injected Core contract.
- Canonical Watchlist Add/Save/Reload/Remove works through the existing UI. A full page reload on `#/watchlist/EUROPE`, followed by adapter reinjection, preserves Europe and the saved item without a forced universe switch.
- Dark-mode watchlist and light-mode detail are checked in all three profiles. Mobile WebKit screenshots were visually inspected; the title, removal control and dock remain legible.

axe-core checks the complete rendered document against WCAG 2 A/AA and WCAG 2.1 A/AA in four flows per profile: existing US detail, European search, European raw-price detail in light mode, and European watchlist after reload in dark mode. The recorded result is zero total violations in all twelve checks, including noncritical violations. Automated axe coverage does not replace a complete accessibility audit.

## Reproduction and private evidence

```sh
VU_EUROPE_WEBKIT_EXECUTABLE=/tmp/vu-europe-webkit-launcher.sh \
VU_EUROPE_BROWSER_TESTS=1 \
VU_EUROPE_BROWSER_EVIDENCE=/tmp/vu-europe-browser-evidence \
node --test discover/tests/europe-product.test.mjs
```

The execution workspace provides Playwright and Chromium. WebKit's official browser bundle was provisioned in the user's browser cache; missing Debian shared libraries and axe-core were extracted/installed under `/tmp` without changing product dependencies or system packages. The private launcher supplies the official MiniBrowser executable, bundle/resource paths and library paths. The final successful run uses this explicit executable and does not bypass browser runtime validation.

Private evidence remains outside the repository:

- `/tmp/vu-europe-browser-evidence/chromium-mobile.json`
- `/tmp/vu-europe-browser-evidence/webkit-desktop.json`
- `/tmp/vu-europe-browser-evidence/webkit-iphone13.json`
- Twelve screenshots in the same directory: US baseline, closed rights, European light detail and dark watchlist for each profile.

The existing Discover view bundle remains within its 180,000-byte gate (177,227 bytes for the measured App/Home/Detail/Themes JavaScript and CSS paths). No new UI, refresh schedule, provider request, engine method or production data is introduced by these tests.

The US browser comparison is a synthetic baseline through the existing US UI and static-data routes. It is not a full live-US-market regression. Full repository suites that depend on absent generated artifacts remain a separate environment limitation; this successful isolated browser run does not claim to resolve those missing artifacts. Public Europe rollout remains closed until canonical production evidence and concrete display/commercial rights are confirmed.
