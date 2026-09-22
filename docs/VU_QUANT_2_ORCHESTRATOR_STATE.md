# Vision Universe® Quant 2.0 — Orchestrator State

Updated: 2026-09-22 UTC

## CURRENT_MAIN

- GitHub `main` at rehydration: `751bf9cb3ba084e6d7fc3cf0819c7b515be2a883`.
- Current Quant candidate: branch `codex/p0-radar-watchlist`, based on that main.
- Last confirmed Production release source remains PR #157 merge `2f2beeb3a735f9c696c1c0f1055a26e9a0809e2a` until this candidate is merged and Pages completes.
- Production URL: `https://research.visionuniverse.de`.

## LAST_MERGED_PR

- PR #157 — P0 broad Technical, Signals and Elliott Product Data.
- Merge commit: `2f2beeb3a735f9c696c1c0f1055a26e9a0809e2a`.

## OPEN_PRS

- No open Quant 2.0 PR existed at rehydration.
- Open repository PRs were Social authoring requests and are outside Quant 2.0.
- The Radar/Watchlist/Strategy breadth candidate must become the next Quant 2.0 PR.

## CURRENT_PHASE

`P0_RADAR_WATCHLIST_BREADTH_AND_P1_STRATEGY_CURRENT_SELECTION_CANDIDATE`

Radar and Watchlist now consume the existing materialized Signals/Technical/Elliott Product Data by capability. Strategy Lab current criteria selection is explicitly bound to the canonical Product Universe while ranking and historical execution remain unavailable.

## COMPLETED_GATES

- Reused the existing Company/Security Master, Product Eligibility, canonical history, Technical bundles, Signals artifacts, Query Engine and Strategy definition contracts. No new pipeline, R2 API, provider or serving architecture was introduced.
- The productive Radar route no longer exposes the synthetic legacy Quant-Score radar. `/quant/radar/` and the classic Quant navigation hand off to `/vu2/?view=radar`.
- Radar projects four bounded modules from contract-valid `ENTERED`/`EXITED` events in `signals-{5,20,60}.json.gz`; it computes no score, recommendation or live signal.
- Watchlist remains an explicit user selection over all canonical product identities and attaches exact per-title Signals, Technical and Elliott capability states. Missing evidence remains typed and fail-closed.
- Strategy Lab current criteria checks use the existing canonical Query Engine over the broad Product Universe. Its current ranking state is `UNAVAILABLE / QUANT_V2_NOT_ACTIVE`.
- Strategy context reads the canonical Quant V2 methodology and verifies `quant-v2.0.0`, seven-factor order, `SPECIFIED_NOT_ACTIVE` and `publication.allowed = false` before rendering.
- Local candidate coverage:
  - `RADAR_SIGNALS_CAPABLE_UNIVERSE = 5,888` for the default 20-EOD window.
  - `RADAR_EVENT_VISIBLE_UNIVERSE = 2,212` and `RADAR_EVENT_COUNT = 8,504` for that window.
  - `WATCHLIST_SELECTABLE_UNIVERSE = 6,875`.
  - `WATCHLIST_SIGNALS_CAPABLE_UNIVERSE = 5,772` for the strict 60-EOD member view.
  - `WATCHLIST_TECHNICAL_CAPABLE_UNIVERSE = 5,676`.
  - `WATCHLIST_ELLIOTT_CAPABLE_UNIVERSE = 5,590`.
  - `STRATEGY_CURRENT_SELECTION_UNIVERSE = 6,875`.
- TSLA, AMD, MU, MET, O, ASML, BAC, PLAB and CRWV all pass Watchlist Signals/Technical/Elliott probes.
- `FIVE_SCOPE_REMAINS = false`.
- 1,411/1,411 Quant tests passed before the Strategy context addition; focused post-addition contract tests and the consolidated breadth measurement pass.
- Exact static release build passes and contains the broad Radar/Watchlist/Strategy consumer code. Local browser execution is deferred to PR CI because the orchestration environment could not download Chromium from the Playwright CDN.
- Discovery files and product behavior were not changed.
- `DISCOVERY_CHANGED = false`; `DISCOVERY_REGRESSION = false`.

## OPEN_GATES

- Merge the candidate only after Quant CI, VU2 Browser QA, Production Pages, SEC Fundamentals, Company Master and Currency/FX checks pass; then measure the deployed artifact.
- Market Regime requires its methodology, breadth inputs, benchmark/calendar alignment and certification gates to be audited next. It remains fail-closed.
- Quant-V2 activation requires seven-factor certification. Revisions remains `BLOCKED_EXTERNAL` because no licensed, immutable historical PIT analyst-consensus source is present.
- Strategy ranking must not migrate from its legacy draft schema to a claimed Quant-V2 rank until Quant V2 is active.
- Backtesting remains blocked until PIT fundamentals, historical universe membership, corporate actions, benchmark and execution certification all pass.

## OWNER_DECISIONS

- GitHub/main, release artifacts and Production are the source of truth; chat history is not.
- Discovery is a separate product and remains a hard no-change gate.
- No second data pipeline, Fundamentals layer, Tiingo integration, realtime infrastructure, public R2 API or market-data architecture.
- A title receives intelligence by canonical identity and explicit capabilities, never by Legacy-Five membership.
- Browsers consume bounded materialized Product Data; they do not fetch private full history or calculate broad Technical/Signals live.
- Quant V2, Revisions, Market Regime, Strategy ranking, SetupState activation and Backtesting stay fail-closed until their own contracts are certified.

## KNOWN_BLOCKERS

- `GLMD` is the only canonical Product Universe member without a restored history object (`SOURCE_MISSING`).
- 897 histories do not meet the Signals comparison-history threshold; 205 fail the strict Signals trading-session contract.
- 208 otherwise Technical-ready histories fail the 270-display-bar calendar validation.
- Revisions has no licensed, certified immutable PIT analyst-consensus source. SEC restatements are explicitly not a substitute.
- Direct custom-domain reads remain blocked in this orchestration environment; Production acceptance must use the exact Pages artifact, workflow deployment proof and CI browser/service probes unless edge access becomes available.

## PRODUCTION_REALITY

Confirmed deployed Production before this candidate is PR #157. The new values below are measured from the exact current candidate artifacts and services, not yet claimed as deployed Production:

| Measure | Candidate count/state |
|---|---:|
| Product Universe | 6,875 |
| `RADAR_SIGNALS_CAPABLE_UNIVERSE` (20 EOD) | 5,888 |
| `RADAR_EVENT_VISIBLE_UNIVERSE` | 2,212 |
| `WATCHLIST_SELECTABLE_UNIVERSE` | 6,875 |
| `WATCHLIST_SIGNALS_CAPABLE_UNIVERSE` (60 EOD) | 5,772 |
| `WATCHLIST_TECHNICAL_CAPABLE_UNIVERSE` | 5,676 |
| `WATCHLIST_ELLIOTT_CAPABLE_UNIVERSE` | 5,590 |
| `STRATEGY_CURRENT_SELECTION_UNIVERSE` | 6,875 |
| `STRATEGY_RANKING_STATUS` | UNAVAILABLE |
| `QUANT_V2_STATUS` | SPECIFIED_NOT_ACTIVE |
| `MARKET_REGIME_STATUS` | FAIL_CLOSED |
| `FIVE_SCOPE_REMAINS` | false |

## NEXT_DEPENDENCY_CORRECT_STEP

Create and validate the Radar/Watchlist/Strategy breadth PR, deploy its exact merge commit and repeat the coverage measurement against the deployed artifact. Then audit the existing Market Regime methodology and inputs; implement only already-supported certified inputs and report any objective missing input as an Owner/Data gate. Do not activate Quant V2, Revisions, Strategy ranking or Backtesting.

## RESUME_STATE

1. Re-read this file and current GitHub/main; rebase only non-overlapping upstream changes.
2. Treat Technical/Signals/Elliott materialization as accepted and do not rebuild the history or serving architecture.
3. Finish the Radar/Watchlist/Strategy candidate through PR CI, merge, Pages deployment and deployed-artifact coverage.
4. Continue at Market Regime input/methodology certification; an external job is a wait-state, not a stop-state.
5. Preserve `DISCOVERY_CHANGED = false`, `DISCOVERY_REGRESSION = false`, `QUANT_V2_STATUS = SPECIFIED_NOT_ACTIVE`, Revisions fail-closed and Market Regime fail-closed.
