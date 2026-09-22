# Vision Universe® Quant 2.0 — Orchestrator State

Updated: 2026-09-22 UTC

## CURRENT_MAIN

- GitHub `main`: `35b2037983e298c8a9d4fecf71026c5247897bcc`
- Production release source before this gate: `3d850b7176f4ef688047f02919209761e308f537`
- Integration branch: `codex/p0-technical-signals-materialization`
- Final materialized branch head: `399acc75874d1d8ad5d885bf2a0f2ed89aa01f27`
- Production URL: `https://research.visionuniverse.de`

## LAST_MERGED_PR

- PR #156 — Browser-QA measurement deadlock repair, merged before this integration branch.
- Last accepted P0 product gate: PR #147 — capability-driven Consumer Integration.

## OPEN_PRS

- PR #157 — P0 broad Technical, Signals and Elliott Product Data; final artifact and PR acceptance in progress.

## CURRENT_PHASE

`P0_TECHNICAL_SIGNALS_MATERIALIZED_PR_ACCEPTANCE`

The existing canonical R2 history has been processed internally by the existing Technical and Signals engines. Contract-compliant, bounded, gzip-compressed Product Data is materialized for the Quant 2.0 UI. No public R2 history API or browser-side live calculation was introduced.

## COMPLETED_GATES

- Reused the existing Company/Security Master, Product Eligibility, R2 history store, canonical bars, Technical engine, Signals rule contract, corporate-action data and trading calendar.
- Validated 6,874 existing canonical histories; one product title (`GLMD`) has no restored source object.
- Validated adjusted provenance and corporate actions for all 6,874 restored histories, including 5,970 split events.
- Removed derived `ref_<ticker>` identity assumptions from Technical and Signals. Canonical `member.m` now owns identity, including punctuation-normalized class/preferred tickers.
- Technical and Signals eligibility are independent. A stricter Signals rejection no longer suppresses a valid Technical bundle.
- Elliott availability is independent from Technical availability and remains fail-closed when no valid count exists.
- Invalid renderer annotations are excluded at the Product Data boundary; the full Technical artifact is validated against the same Workspace Contract used by the UI.
- Materialized 632 bounded Technical shards with at most 270 display bars and three Signals artifacts for 5/20/60 EOD observations.
- Final materialized breadth:
  - `TECHNICAL_FULL_BUNDLE_UNIVERSE = 5,676`
  - `SIGNALS_CAPABLE_UNIVERSE = 5,772`
  - `ELLIOTT_CAPABLE_UNIVERSE = 5,590`
  - `FIVE_SCOPE_REMAINS = false`
- TSLA, AMD, MU, MET, O, ASML, BAC, PLAB and CRWV are all Technical-, Signals- and Elliott-available in the final branch artifact.
- Local Quant regression: 1,332/1,332 PASS. Final batch Contract/regression tests and Public Data Hygiene: PASS.
- Signals UI rendering is bounded to 200 events while retaining complete materialized results and explicit coverage counts.
- `QUANT_MODEL_VERSION = quant-v2.0.0`; `QUANT_V2_STATUS = SPECIFIED_NOT_ACTIVE`.
- Revisions and Market Regime remain fail-closed. No uncertified Quant-V2 score was activated.
- Discovery product files, UX, navigation, design, collections, product logic and layout were not changed.
- `DISCOVERY_CHANGED = false`; `DISCOVERY_REGRESSION = false`.

## OPEN_GATES

- PR #157 final CI, merge, GitHub Pages deployment and Production measurement.
- Re-measure Radar and Watchlist against the accepted broad Signals/Technical artifacts; neither may treat a curated presentation slice as Product Universe breadth.
- Strategy Lab follows only after the upstream breadth consumers are consistent.
- Market Regime requires certified evidence and remains fail-closed.
- Quant-V2 activation requires seven-factor certification, including licensed/reproducible PIT Revisions evidence.
- Backtesting remains blocked until PIT, historical-universe, corporate-action and execution certifications pass.

## OWNER_DECISIONS

- GitHub/main and deployed artifacts are the source of truth; chat history is not.
- Discovery is a separate product and remains a hard no-change gate.
- No second data pipeline, Fundamentals layer, Tiingo integration, realtime infrastructure, public R2 API or market-data architecture.
- Private full history is consumed only in the internal batch. Browsers receive bounded materialized Product Data and derived evidence.
- A title receives intelligence by canonical identity and explicit capabilities, never by Legacy-Five membership or a derived ticker map.
- Technical, Signals and Elliott have independent fail-closed capability results.
- Quant V2, Revisions, Market Regime and SetupState activation stay fail-closed until certified.

## KNOWN_BLOCKERS

- `GLMD`: the only canonical Product Universe member without a restored history object (`SOURCE_MISSING`). This is the exact remaining missing-input data gap.
- 897 histories do not meet the Signals comparison-history threshold.
- 205 histories fail the strict Signals trading-session contract.
- 208 otherwise Technical-ready histories fail the 270-display-bar trading-calendar validation and are not materialized as full Technical bundles.
- These typed exclusions are not replaced with fixtures, synthetic data or live browser calculations.

## PRODUCTION_REALITY

The final branch artifact is accepted but not yet merged/deployed at this checkpoint. Its measured source is `2026-09-22T11:39:15.118Z`:

| Measure | Count |
|---|---:|
| Product Universe | 6,875 |
| Histories found/validated | 6,874 |
| ≥261-bar lookback coverage | 5,977 |
| `TECHNICAL_FULL_BUNDLE_UNIVERSE` | 5,676 |
| `SIGNALS_CAPABLE_UNIVERSE` | 5,772 |
| `ELLIOTT_CAPABLE_UNIVERSE` | 5,590 |

Production must not claim these counts until `release-delivery.json`, the summary, representative shards and live UI routes resolve from the merged commit.

## NEXT_DEPENDENCY_CORRECT_STEP

Complete PR #157 CI, merge it, wait for GitHub Pages deployment, then run the live Production breadth measurement and representative Technical/Elliott/Signals route checks. If Production matches the accepted artifact, close this P0 gate and continue with Radar/Watchlist breadth before Strategy Lab.

## RESUME_STATE

1. Read this file and GitHub/main first.
2. If PR #157 is still open, verify its exact head, CI and materialized summary; do not rebuild the architecture.
3. If merged, verify Production `release-delivery.json`, summary/shards and the live breadth report before marking the gate complete.
4. Preserve `DISCOVERY_CHANGED = false`, `DISCOVERY_REGRESSION = false`, `QUANT_V2_STATUS = SPECIFIED_NOT_ACTIVE`, Revisions fail-closed and Market Regime fail-closed.
5. The next product work after Production acceptance is Radar/Watchlist breadth, then Strategy Lab in dependency order.
