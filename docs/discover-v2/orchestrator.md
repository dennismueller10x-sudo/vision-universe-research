# Discover 2.0 execution graph

Baseline: e4bcd8e1a89687078cea4dd77c89d5c1ebbcaf93.
Target: parallel noindex preview at /discover-v2/, shared navigation, unchanged Discover 1.0 and canonical data.

## State transitions

ACCESS -> AUDIT -> DESIGN -> BUILD -> SCREENSHOT -> CRITIQUE -> QA -> PREVIEW -> PRODUCTION_SMOKE -> DONE

- Missing access: ACCESS_BLOCKED; recover through authorized GitHub connector.
- Design/visual failure: CRITIQUE -> DESIGN/BUILD -> SCREENSHOT.
- Contract, runtime, accessibility, performance or regression failure: QA -> BUILD -> QA; obtain new screenshots for affected surfaces.
- Deployment failure: PREVIEW -> RELEASE_RECOVERY -> QA/PREVIEW.
- Smoke failure: PRODUCTION_SMOKE -> RELEASE_RECOVERY; never mark DONE.
- Owner decisions only: paid infrastructure, irreversible operations, canonical research/licence changes, replacing Discover 1.0, strategic changes.

## Specialized responsibilities

| Agent | Responsibilities | Gate |
|---|---|---|
| contracts_audit | Repository/Architecture, Existing Product, Data Contract Integration, Realtime Integration | shared contract inventory; no parallel pipeline |
| consumer_design | Consumer UX, Visual Design, IA, Mobile Experience, Discover/Recommendation UX, Search/Navigation | understandable first viewport, canonical ordering, varied journey, functioning swipe |
| stock_experience | Stock Detail, Chart Experience, Fundamental Experience | large semantic charts, shared source states, evidence and professional depth preserved |
| qa_release | Accessibility, Performance, Browser QA, Regression Protection, Preview Deployment, Production Smoke | browser interactions, protected file comparison, exact authorized nav delta, noindex, real release route |
| root | Orchestration, integration, independent Visual QA and release decision | screenshot critique + all evidence reconciled |

## Executable gates

- `node scripts/discover-v2/regression-gate.mjs`
- `node --test discover/tests/*.test.mjs`
- `node scripts/discover-v2/browser-qa.mjs --url http://127.0.0.1:8765 --out /tmp/discover-v2-qa`
- GitHub workflow `discover-v2-ci.yml`: browser verification and screenshot artifact.
- Existing Pages release compiler and workflow; no new infrastructure.

Five-second test is explicitly a heuristic expert review unless an independent human participant is available. It must show the purpose, search and a stock action in the first mobile viewport. Screenshots alone do not prove function. Saturday closed-market evidence cannot prove receipt of a new regular-session live event.

## Scope and recovery constraints

Only new discover-v2 view/assets, its QA/docs and one shared-navigation link may affect the product. Data, freshness, rankings, eligibility, sources, index membership, SEC/market pipelines, Worker and zero-cost configuration remain unchanged. A new view may rearrange DOM and restyle shared components; it may not reinterpret source state.

Local browser installation was unavailable. The cloud browser cannot access the local server (ERR_BLOCKED_BY_CLIENT). Browser QA runs in GitHub Actions; screenshot artifacts are reviewed before release. No browser gate is waived.

## Iteration 1 — observed failures and recovery

CI run 35427743051 / PR #113 preserved screenshot and JSON evidence.
- All canonical/navigation tests, source preservation, release packaging, feed continuation, back navigation, stock identity, width and resource gates passed.
- Accessibility found insufficient rank and shared-detail text contrast in both themes; scoped v2 colors corrected.
- Closed search retained CSS visibility despite opacity zero; v2 now removes the closed dialog from visibility/focus navigation.
- Visual review found a clipped desktop hero chart and mobile detail chart below the fold; new hero grid and compact detail hierarchy correct these.
- Independent contract review found fallback-caption, zero-change color and repeated LiveHub lifecycle-binding issues. V2 adapters now follow rendered data, show zero changes neutrally, and own subscription cleanup with one shared Hub initialization.
- Heuristic mobile entry review: purpose, search, company identity, performance, reason and stock action were visible; no claim of an independent human usability study.

Second browser/visual gate remains required after these changes.

## Iteration 2 — interaction and visual critique

CI run 35428042586: WebKit 24/24 passed; Chromium 128/131 passed. First-screen heuristic completed in 1.46–1.90 seconds locally (not a production latency claim).
- Remaining failures: 320px chart controls overlapped by intraday note, and light search surface contrast. Natural chart flow and an opaque themed search surface correct these.
- Fundamental visual critique: wrapping metric tabs consumed the viewport. Replaced with a single horizontal tab rail and compact side-by-side period values; the actual chart must now appear in the chapter screenshot.
- Feed screenshot revealed missing bounded viewport in the new shell: IntersectionObserver could treat many cards as visible. The shared feed now has its required fixed viewport height and native scrolling. Added a bounded-initial-load and visible-next-stock check, beyond mere DOM pagination.
- Full home-chunk completion test added once on mobile dark, comparing actual rendered surfaces to the canonical three-chunk manifest.

## Iteration 3 — final visual recovery

CI run 35428372759: all product assertions passed, including contrast, 320px chart controls, visible feed movement, pagination, and all 34 canonical home surfaces. The remaining test failure was a case-sensitive counter assertion against CSS-uppercase innerText ("2 VON 400"); corrected without changing the product or its semantic assertions.

Reviewed mobile chart, fundamentals, immersive feed, light search and desktop home screenshots. Fundamental tabs now leave room for the large chart; the feed presents one stock per viewport with readable actions. Five-second entry gate is a browser/heuristic review, not an independent human study. Realtime integration reuses the canonical client; a new regular-session tick cannot be demonstrated on Saturday.
