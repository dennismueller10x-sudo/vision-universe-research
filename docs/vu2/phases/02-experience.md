# Active pack — product services and experience foundation
Requirements: current user §§1–17; R2 meaning → explanation → evidence → workspace; preserve all modules; Master §§39–42,55,67,68.
Files: quant/api/product-services.js; vu2/ preview; scripts/vu2 browser QA; focused tests. SEC and existing production pages excluded.
Contracts: current approved SEC panel and scoped Golden-Five EOD files behind existing DisplayPolicy; no new calculations or provider payloads in UI. Research directory maintains full workspace access.
Acceptance: Home/Markets/Discover/Stock/Research coherent on desktop and390px; search opens stock; chart ranges reuse current engine; missing total-market state explicit; discover rules editable; no synthetic fallback; all professional/editorial destinations reachable.
QA: User explicitly authorizes local static server + Playwright/Chromium or Actions, superseding the previous skill preview-only limitation for this repository. Local browser test produces screenshots and interaction assertions. No production deployment.
Flags: preview route /vu2/ is opt-in, no root-navigation change. Owner VU2 workstream; remove preview isolation only after parity, visual and release gates.

### Active iteration context
Requirements: Master18/19 (Discover → editable canonical rules),55/63 (390px readability),42/67 (typed missing data; no mocks), additional module parity.
Affected contracts: existing Query AST and scoped Product Services; recipe version1.0.0, legacy percent units preserved.
Files: product-services.js, experience.js/css, charts.js, browser-qa.mjs.
Acceptance: recipe results equal direct query results; growth recipe opens at20%; mobile dates legible; all professional/editorial entry points searchable.
Tests: seven service tests; existing Actions browser workflow screenshots and handoff interaction. No provider-scale test required.

Market/Stock extension: Master15/16/20/23/24/39/42. Product service projects existing trend/momentum/volatility/Elliott states; unknown states remain unavailable. Markets shows scoped observations, never a synthetic full-market pulse. Acceptance: actual NVDA bundle projection, out-of-scope denial before read, reject future/mock/mismatched bundles, browser evidence disclosure and full workspace links. No metric engine changed.
