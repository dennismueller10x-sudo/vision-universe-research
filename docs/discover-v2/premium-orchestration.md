# Discover 2.1 Premium — executable orchestration

Owner decision: Discover 1.0 is frozen. Discover 2.0 at `/discover-v2/` is the only implementation base and is refined in place into Discover 2.1 Premium.

Graph-start baseline: `32b4796b51bcb95b7ef37bff36e18e34a85ad9c1` (21 September 2026). The gate resolves the current PR merge-base at runtime, compares every path outside the explicit 2.1 allowlist against it and independently requires the frozen Discover 1.0 tree `de6baacf4c8c08891f7d4d2dc17ff40459517a8d`. This keeps the isolation proof exact while unrelated mainline data or Quant commits continue.

## State graph

`BASELINE_LOCK → PRODUCT_AUDIT → CONTRACT_AUDIT → PREMIUM_SYSTEM → PARALLEL_BUILD → INTEGRATE → BUILD_QA → SCREENSHOT_QA → CROSS_CRITIQUE → IMPROVE → RELEASE_QA → DEPLOY → PRODUCTION_SMOKE → DONE`

`SCREENSHOT_QA → CROSS_CRITIQUE → IMPROVE → BUILD_QA` repeats until visual and technical gates pass together. A successful build does not satisfy visual quality. A convincing screenshot does not satisfy contracts, interaction or regression safety.

## Specialized ownership

| Owner | Responsibility | Files |
|---|---|---|
| `premium_home` | Consumer UX, visual system, information rhythm, worlds, recommendation/discovery home, surface diversity | `discover-v2/home.js`, `discover-v2/home.css` |
| `premium_shell` | Mobile experience, premium glass navigation, search, worlds directory, immersive feed and session continuity | `discover-v2/app.js`, `discover-v2/app.css` |
| `premium_stock` | Stock detail, chart experience, fundamental journey, valuation, risks and onward discovery | `discover-v2/detail.js`, `discover-v2/detail.css` |
| `contracts_truth` | Canonical data adapters, freshness/intraday parity, structured chart captions, realtime payload measurement, eligibility audit | `discover-v2/*`, `scripts/discover-v2/*`, contract audit |
| `design_qa` | Independent visual, mobile, accessibility, performance and browser QA; first-five-seconds and ten-screen diversity | QA scripts and design-QA report |
| `root` | Repository/architecture audit, integration, conflict resolution, regression protection, screenshot critique, release and live smoke | orchestration, integration and release evidence |

Agents may reject another agent's result. File ownership avoids concurrent edits; cross-cutting contract work is integrated only after the visual owner has frozen the relevant file.

## Product contract

- Keep the 2.0 information architecture: Start, Welten, Entdecken, Suchen.
- Use clear white for neutral surfaces, controlled adult colour worlds and near-black cinema surfaces.
- Use a floating, translucent, monochrome mobile dock with safe-area support and explicit active states.
- Keep every canonical collection, ranking and card order. Add no unsupported world, ranking or change claim.
- Price charts stay semantic green/red/neutral regardless of world colour.
- Charts become the dominant visual asset with less framing and chrome.
- Home, worlds and feed expose the same canonical source/freshness truth as Discover 1.0.
- Stock pages remain the only realtime client surface unless the existing contract already provides a bounded client path.
- Visible chart captions consume structured metadata; accessible prose is not parsed as a data API.

## Quality gates

1. **Freeze gate:** the complete tree outside the explicit 2.1 allowlist is byte-identical to the baseline. `/discover/` and shared navigation are immutable.
2. **Architecture gate:** no provider, pipeline, ranking, eligibility, SEC, realtime runtime or source-of-truth change.
3. **First-five-seconds gate:** at 320 and 390 px, product purpose, a named stock, performance/timeframe, chart and clear action are visible without instruction text doing the work. This is an expert heuristic unless tested with independent participants.
4. **Premium gate:** true-white neutral surfaces; no global beige; three visual intensities; restrained adult colour palette; no lime tab block; glass dock remains legible on white, colour and cinema surfaces.
5. **Diversity gate:** ten consecutive mobile screen heights include materially different composition, density and colour patterns. No run of three identical stock-card compositions.
6. **Interaction gate:** native hero swipe, horizontal rails, worlds, search/focus trap, range changes, fundamental metric changes, feed continuation/deep resume and onward-stock route all work.
7. **Truth gate:** source state, freshness, date and timeframe remain visible; stale data cannot appear fresh; semantic chart colour is preserved; captions remain correct after accessible text changes.
8. **Mobile/accessibility gate:** 320/390 Chromium plus 390 WebKit, safe areas, 44 px targets, focus, reduced motion, heading order, no body overflow or dock obstruction; no serious/critical axe findings.
9. **Performance gate:** decoded v2 view assets stay within the existing 150 KB budget, DOM and bounded feed limits hold, lazy charts load only when actually visible, no uncaught errors.
10. **Release gate:** exact Pages artifact, `noindex`, both `/discover/` and `/discover-v2/`, release commit identity and production smoke all pass.

## Recovery paths

- Visual weakness or repeated template rhythm: `CROSS_CRITIQUE → PREMIUM_SYSTEM/PARALLEL_BUILD` and regenerate affected screenshots.
- Contract/freshness/caption failure: `BUILD_QA → CONTRACT_AUDIT → PARALLEL_BUILD`; do not hide or restyle the failure.
- Accessibility/performance/browser failure: `BUILD_QA → responsible owner`; rerun only after the product fix.
- CI/environment failure: `TOOL_RECOVERY`; preserve diagnostics and repeat the unfulfilled gate.
- Deployment failure: `DEPLOY → RELEASE_RECOVERY → RELEASE_QA → DEPLOY`.
- Production smoke failure: route to product or release recovery based on evidence; never declare DONE.

## Owner escalation

Escalate only for a canonical ranking/eligibility/research rule change, paid infrastructure, provider/licence decision, new backend/realtime architecture, irreversible release action outside the authorized preview, or replacement of Discover 1.0. Extreme but contract-valid content is documented rather than silently filtered.

`DONE` requires a deployed `/discover-v2/` visibly identified as Discover 2.1, preserved `noindex`, unchanged Discover 1.0, green browser and regression gates, reviewed screenshots after the last product change, and a live smoke test of both versions.
