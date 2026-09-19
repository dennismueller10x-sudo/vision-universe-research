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
