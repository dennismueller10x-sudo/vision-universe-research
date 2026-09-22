# Vision Universe® Quant 2.0 — Orchestrator State

Updated: 2026-09-22 UTC

## CURRENT_MAIN

- GitHub `main` at this state write: `8e5d820e81d5a708ca06dd22e00eab0fc68cc0ad`.
- Quant product release source: PR #173 merge `a0bb8742b684c4ebfe145b7b148d475b0c33b53d`.
- Later main commit `8e5d820e81d5a708ca06dd22e00eab0fc68cc0ad` is an unrelated Discovery intraday update; it does not alter the Quant release.
- Production URL: `https://research.visionuniverse.de`.

## LAST_MERGED_PR

- PR #173 — Quant 2.0: broaden Radar, Watchlist and Strategy selection.
- Merge commit: `a0bb8742b684c4ebfe145b7b148d475b0c33b53d`.
- Merged and deployed on 2026-09-22 UTC.

## OPEN_PRS

- No open Quant 2.0 PR supersedes PR #173.
- Repository still contains older VU2 handoff/performance/accessibility PRs #76–#92 and Social authoring/diagnostic PRs. They were not merged or modified by this section and are not evidence of current Product Reality.

## CURRENT_PHASE

`P0_RADAR_WATCHLIST_BREADTH_COMPLETE_P1_STRATEGY_SELECTION_COMPLETE_OWNER_GATE_MARKET_REGIME_METHODOLOGY`

Radar and Watchlist consume the existing materialized Signals/Technical/Elliott Product Data by capability across the canonical Product Universe. Strategy Lab current criteria selection is bound to the same universe. Ranking, Quant V2 publication, Revisions, Market Regime and Backtesting remain unavailable until their independent certification gates pass.

## COMPLETED_GATES

- Reused the existing Company/Security Master, Product Eligibility, canonical history, Technical bundles, Signals artifacts, Query Engine and Strategy definition contracts. No new pipeline, R2 API, provider or serving architecture was introduced.
- Radar no longer exposes the synthetic legacy Quant-Score radar. `/quant/radar/` and classic Quant navigation hand off to `/vu2/?view=radar`.
- Radar projects four bounded modules from contract-valid `ENTERED`/`EXITED` events in materialized `signals-{5,20,60}.json.gz`; it computes no score, recommendation or browser-live signal.
- Watchlist is explicit user selection across all canonical product identities and attaches exact per-title Signals, Technical and Elliott capability evidence. Missing evidence remains typed and fail-closed.
- Strategy Lab current criteria checks use the canonical Query Engine across 6,875 products. Ranking remains `UNAVAILABLE / QUANT_V2_NOT_ACTIVE`.
- Strategy context verifies the canonical Quant V2 methodology: `quant-v2.0.0`, seven-factor order, `SPECIFIED_NOT_ACTIVE`, `publication.allowed = false`.
- Representative non-Legacy-Five probes TSLA, AMD, MU, MET, O, ASML, BAC, PLAB and CRWV have Watchlist Signals/Technical/Elliott evidence.
- `FIVE_SCOPE_REMAINS = false`.
- Local verification: full Quant suite 1,411/1,411 passed; focused post-Strategy suite 47/47 passed; consolidated breadth measurement and exact static release build passed.
- PR #173 gates passed: Quant CI, VU2 Browser QA, Production Pages PR package, SEC Fundamentals, Company Master and Currency/FX.
- Post-merge `main` gates passed: Quant CI run 35737847240, SEC Fundamentals run 35737847301, shared navigation run 35737847309 and Production Pages run 35737847352.
- Production Pages run 35737847352 built and deployed exact source `a0bb8742b684c4ebfe145b7b148d475b0c33b53d`. Package and deploy jobs passed.
- Deployed Pages artifact: id `10698352717`, size `367,776,041` bytes, digest `sha256:317676551987e58ff8c2c8a13ec93c0a4df4d23c197b22f4cf09832a8c44030b`.
- Discovery product code, UX, navigation, collections, layout and product logic were not changed by PR #173.
- `DISCOVERY_CHANGED = false`; `DISCOVERY_REGRESSION = false`.

## OPEN_GATES

- Market Regime has broad market/benchmark history available but no versioned and owner-approved Product methodology contract. It remains fail-closed until exact inputs, thresholds, minimum breadth, benchmark/calendar alignment, transition/hysteresis rules, missing-data policy, driver/counterargument output and certification tests are approved.
- Revisions remains `BLOCKED_EXTERNAL`: no licensed, immutable historical PIT analyst-consensus source is present. SEC restatements are not a substitute.
- Quant V2 activation requires certified inputs and publication gates for all seven factors; `QUANT_V2_STATUS = SPECIFIED_NOT_ACTIVE`.
- Strategy ranking must not claim Quant V2 ranking while Quant V2 is inactive.
- Backtesting remains blocked until PIT fundamentals, historical universe membership, corporate actions, benchmark and execution methodology are certified.

## OWNER_DECISIONS

- GitHub/main, reviewed release artifacts and Production are the source of truth; chat history is not.
- Discovery is a separate product and remains a hard no-change gate.
- No second data pipeline, Fundamentals layer, Tiingo integration, realtime infrastructure, public R2 API or market-data architecture.
- A title receives intelligence by canonical identity and explicit capabilities, never by Legacy-Five membership.
- Browsers consume bounded materialized Product Data; they do not fetch private full history or calculate broad Technical/Signals live.
- Quant V2, Revisions, Market Regime, Strategy ranking, SetupState activation and Backtesting stay fail-closed until their own contracts are certified.
- Market Regime methodology is an Owner gate; implementation must not invent thresholds or state transitions.

## KNOWN_BLOCKERS

- Market Regime: current repository contains target states and candidate input families, but no certified versioned method with exact thresholds, minimum breadth, state transitions/hysteresis, missing-data behavior, benchmark/calendar rules and driver/counterargument semantics.
- Existing data evidence is sufficient to avoid a new pipeline: the materialized factor input contains 6,404 rows and SPY benchmark history contains 930 bars through 2026-09-17. This does not itself certify a regime methodology.
- `GLMD` is the only canonical Product Universe member without a restored history object (`SOURCE_MISSING`).
- 897 histories do not meet the Signals comparison-history threshold; 205 fail the strict Signals trading-session contract.
- 208 otherwise Technical-ready histories fail the 270-display-bar calendar validation.
- Revisions has no licensed, certified immutable PIT analyst-consensus source.
- Direct custom-domain reads remain blocked in this orchestration environment. Production acceptance therefore uses the exact Pages artifact, successful deploy job, CI browser/service probes and release-source coverage measurement.

## PRODUCTION_REALITY

PR #173 is merged and its exact merge commit is deployed by GitHub Pages. Counts below come from the release-source/materialized Product Data used to build that deployed artifact and are backed by the successful release contract and deploy jobs.

| Measure | Production count/state |
|---|---:|
| Product Universe | 6,875 |
| `RADAR_SIGNALS_CAPABLE_UNIVERSE` (20 EOD) | 5,888 |
| `RADAR_EVENT_VISIBLE_UNIVERSE` | 2,212 |
| `RADAR_EVENT_COUNT` | 8,504 |
| `WATCHLIST_SELECTABLE_UNIVERSE` | 6,875 |
| `WATCHLIST_SIGNALS_CAPABLE_UNIVERSE` (60 EOD) | 5,772 |
| `WATCHLIST_TECHNICAL_CAPABLE_UNIVERSE` | 5,676 |
| `WATCHLIST_ELLIOTT_CAPABLE_UNIVERSE` | 5,590 |
| `STRATEGY_CURRENT_SELECTION_UNIVERSE` | 6,875 |
| `STRATEGY_RANKING_STATUS` | UNAVAILABLE |
| `QUANT_V2_STATUS` | SPECIFIED_NOT_ACTIVE |
| `REVISIONS_STATUS` | BLOCKED_EXTERNAL / FAIL_CLOSED |
| `MARKET_REGIME_STATUS` | FAIL_CLOSED |
| `FIVE_SCOPE_REMAINS` | false |

## NEXT_DEPENDENCY_CORRECT_STEP

Owner must approve and version the Market Regime methodology contract before implementation: state definitions, exact input set, thresholds, minimum breadth, benchmark and trading-calendar alignment, transition/hysteresis behavior, missing-data policy, and required drivers/counterarguments. Existing canonical market history and materialized factor inputs must be reused. Do not create a pipeline or activate a provisional regime.

After that gate, implement and certify Market Regime against existing inputs, then continue to seven-factor Quant V2 certification. Revisions remains independently blocked on its licensed PIT consensus source; Backtesting remains downstream of the stated PIT/execution gates.

## RESUME_STATE

1. Re-read this file and current GitHub/main; treat PR #173 / merge `a0bb8742b684c4ebfe145b7b148d475b0c33b53d` as the deployed Radar/Watchlist/Strategy release.
2. Do not rebuild Technical/Signals/Elliott materialization, canonical history or serving architecture.
3. Resume at the Market Regime methodology Owner gate. If an approved versioned contract appears, implement it with existing history/factor inputs and certify before activation.
4. Keep `QUANT_V2_STATUS = SPECIFIED_NOT_ACTIVE`, Revisions fail-closed, Market Regime fail-closed, Strategy ranking unavailable and Backtesting closed.
5. Preserve `DISCOVERY_CHANGED = false` and `DISCOVERY_REGRESSION = false`.
