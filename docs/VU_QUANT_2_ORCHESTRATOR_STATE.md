# Vision Universe® Quant 2.0 — Orchestrator State

Updated: 2026-09-22 UTC

## CURRENT_MAIN

- GitHub `main` at this state write: `7b08a6eec` (Intraday-Takt 16, Discovery-Takt, unrelated to Quant).
- Last merged Quant release: PR #173, merge `a0bb8742b684c4ebfe145b7b148d475b0c33b53d`, deployed 2026-09-22.
- This section's work branch: `claude/quant-2-orchestration-hmuo69`, branched from `7b08a6eec`.
- Production URL: `https://research.visionuniverse.de`.

## CURRENT_PHASE

`M1_FACTOR_AND_CHANGE_EXPERIENCE_DELIVERED`

The Factor Engine and the Change Engine exist as versioned product engines over the broad
canonical universe, and the Quant Experience frontend renders them. The Quant V2 composite
remains closed; Setup, Pattern, Strategy Match, Backtest and Market Regime remain ahead.

## PRODUCT_MILESTONES

| Milestone | Scope | State |
|---|---|---|
| M1 | Factor + Change experience | **DONE** (this section) |
| M2 | Setup Engine + frontend | OPEN — journey surface exists, state assignment fail-closed |
| M3 | Strategy Match | OPEN — needs factor certification first |
| M4 | Pattern Research Engine | BLOCKED in-repo — needs deep canonical history (see KNOWN_BLOCKERS) |
| M5 | Pattern Match product | OPEN — downstream of M4 |
| M6 | Backtest integration | OPEN — downstream of PIT/execution gates |
| M7 | Market Regime | OPEN — Owner methodology gate |
| M8 | Full Quant experience | OPEN |

## COMPLETED_THIS_SECTION

- **Factor Evidence Engine** `vu-factor-evidence-1.0.0`, derived from `quant-v2.0.0`:
  `quant/engines/factor-evidence.js` (normalization, assembly, bands, confidence, publication gate).
- **Change Engine** `vu-change-1.0.0`: `quant/engines/change-engine.js`, eleven measured positions,
  change measured on inputs and never on scores.
- **Broad materialization**: `scripts/quant/build-factor-evidence.mjs` →
  `quant/data/product/factor-evidence-v1/` (637 shards + summary, 7.5 MB).
  Reads only existing artifacts: `factors-FULL_UNIVERSE.json`, `quant/data/sec/consumer/`,
  `technical-signals-v1`, `sic-peer-taxonomy-v1`. No provider call, no R2 write, no second pipeline.
- **Quant Experience frontend**: `/vu2/?view=quant` rebuilt as Meaning → Explanation → Evidence →
  Workspace (Stock Hero, Factor DNA with per-component evidence, "Was verändert sich gerade?",
  Setup journey with observable conditions, data-provenance panel).
- **Explain Quant**: new `/vu2/?view=explain` beginner surface.
- **Publication gate is enforced, not documented**: `publicationViolations()` runs on write for every
  security and on read in the browser. No `quantScore`, no `rank`, no score on a closed factor.
- **Derived input added honestly**: `downsideVolatility252d` computed from the published 270-bar
  series, labelled `SPLIT_ADJUSTED` per component. This is what opened the Risk factor.
- CI: factor evidence materialization wired into `product-intelligence-materialization.yml`
  right after the technical bundles it reads; new tests run in Quant CI and in that workflow.
- Browser QA extended to the rebuilt `quant` view and the new `explain` view, both widths.

## PRODUCTION_REALITY

Counts measured from the materialized artifact at data cutoff `2026-09-18`.

| Measure | Count/state |
|---|---:|
| Product Universe | 6,875 |
| `FACTOR_EVIDENCE_PUBLISHED` | 6,404 |
| `FACTOR_QUALITY_AVAILABLE` | 2,514 |
| `FACTOR_GROWTH_AVAILABLE` | 2,140 |
| `FACTOR_MOMENTUM_AVAILABLE` | 5,582 |
| `FACTOR_VALUE_AVAILABLE` | 1,999 |
| `FACTOR_PROFITABILITY_AVAILABLE` | 0 (gate `OPERATING_INCOME`) |
| `FACTOR_REVISIONS_AVAILABLE` | 0 (gate `PIT_ANALYST_CONSENSUS`) |
| `FACTOR_RISK_AVAILABLE` | 5,303 |
| `FACTOR_NOT_APPLICABLE_INDUSTRY` | 967 (banks, insurers, REITs) |
| `WITH_PIT_FUNDAMENTALS` | 5,008 |
| `WITH_MARKET_CAP` | 3,921 |
| `CHANGE_ENGINE_STATE` | AVAILABLE, 9 of 11 positions measurable for a typical covered title |
| `COMPOSITE_SCORE` | WITHHELD |
| `QUANT_V2_STATUS` | SPECIFIED_NOT_ACTIVE |
| `STRATEGY_RANKING_STATUS` | UNAVAILABLE |
| `SETUP_STATE_STATUS` | FAIL_CLOSED |
| `MARKET_REGIME_STATUS` | FAIL_CLOSED |
| `REVISIONS_STATUS` | BLOCKED_EXTERNAL |
| `RADAR_SIGNALS_CAPABLE_UNIVERSE` (20 EOD) | 5,888 |
| `WATCHLIST_SELECTABLE_UNIVERSE` | 6,875 |
| `WATCHLIST_TECHNICAL_CAPABLE_UNIVERSE` | 5,676 |
| `WATCHLIST_ELLIOTT_CAPABLE_UNIVERSE` | 5,590 |
| `FIVE_SCOPE_REMAINS` | false |
| `DISCOVERY_CHANGED` | false |

## VERIFICATION

- Full Quant suite: 1,428/1,428 passed locally (1,411 before, +17 new factor-evidence tests).
- Public data hygiene guard: passed against the new artifact.
- Headless Chromium at 1440 px and 390 px, `quant` (NVDA, JPM, AAPL) and `explain`:
  one `h1` per page, no horizontal overflow, seven factors in canonical order, change groups
  rendered, setup conditions rendered, no page errors.
- Largest shard: 41 KB gzipped, 0.46 MiB uncompressed — inside the browser artifact caps.
- Production acceptance for this section is not yet claimed: it needs a merged release and a
  Pages deploy of the exact commit.

## OPEN_INPUT_GATES

Machine-readable in `quant/data/product/factor-evidence-v1/summary.json` → `openInputGates`.

| Gate | Blocks | Owner |
|---|---|---|
| `OPERATING_INCOME` | 5 components across Quality, Growth, Profitability | SEC normalization metric registry (mapping 1.5.0) |
| `EBITDA` | `value.ebitdaYield` | SEC normalization metric registry |
| `BETA_252D` | `risk.beta252d` | `market-factors-1.0.0` (benchmark daily series is not published) |
| `RELATIVE_STRENGTH_12M1M` | `momentum.relativeStrength12m1m` | `market-factors-1.0.0` (artifact carries 12M, contract wants 12-1) |
| `NET_DEBT_PERIOD_ALIGNMENT` | `quality.netDebtToAssets`, `value.salesYield` | SEC normalization (stale debt instants are dropped, not mixed) |
| `PIT_ANALYST_CONSENSUS` | `revisions.*` | external licence |
| `INDUSTRY_TEMPLATES_BANKS_INSURERS_REITS` | Quality, Value, Profitability for 967 titles | quant-v2 methodology |
| `FACTOR_SNAPSHOT_HISTORY` | `change.scoreMomentum` | this materializer, from its first weekly snapshot forward |

`OPERATING_INCOME` is the single highest-leverage gate: it alone closes Profitability entirely
and holds back one component each in Quality and Growth.

## OWNER_DECISIONS

- GitHub/main, reviewed release artifacts and Production are the source of truth; chat history is not.
- Discovery is a separate product and remains a hard no-change gate.
- No second data pipeline, Fundamentals layer, Tiingo integration, realtime infrastructure,
  public R2 API or market-data architecture.
- A title receives intelligence by canonical identity and explicit capabilities, never by
  Legacy-Five membership.
- Browsers consume bounded materialized Product Data.
- Quant V2 composite, Revisions, Market Regime, Strategy ranking, SetupState activation and
  Backtesting stay fail-closed until their own contracts are certified.
- Per-factor evidence under an independently versioned contract is explicitly **not** the Quant V2
  composite and does not open that gate.
- Market Regime methodology remains an Owner gate; implementation must not invent thresholds.

## KNOWN_BLOCKERS

- Market Regime: no certified versioned method with exact thresholds, minimum breadth, state
  transitions/hysteresis, missing-data behaviour, benchmark/calendar rules.
- Revisions: no licensed, immutable historical PIT analyst-consensus source.
- Backtesting: blocked until PIT fundamentals, historical universe membership, corporate actions,
  benchmark and execution methodology are certified.
- **Pattern Research (M4)**: outcome labels over 12–60 months need deep canonical price history.
  The repository publishes 270 bars per title; the deep history lives in private R2 and is only
  reachable from a workflow with the `VU_HISTORY_S3_*` credentials. Pattern research is therefore
  a workflow-side job (`product-intelligence-materialization.yml` already restores that history),
  not something this checkout can compute. It is not blocked on a decision, only on being run
  where the data is.
- `GLMD` is the only canonical Product Universe member without a restored history object.
- Direct custom-domain reads remain blocked in this orchestration environment; production
  acceptance uses the exact Pages artifact, deploy job and CI probes.

## NEXT_DEPENDENCY_CORRECT_STEP

1. **`OPERATING_INCOME` and `EBITDA` into the SEC normalization metric registry.** One change
   opens six components across three factors and is the only thing standing between the current
   state and a fully evidenced Profitability factor. Extend the existing mapping; do not add a
   Fundamentals pipeline.
2. **`beta252d` and `relativeStrength12m1m` in `market-factors-1.0.0`**, plus publishing the
   benchmark daily series alongside the factor artifact. Completes Momentum and Risk.
3. **Weekly factor snapshot** from this materializer, so `change.scoreMomentum` can open from
   real published history rather than reconstruction.
4. **Setup Engine (M2)**: bind the canonical SetupState contract to rules over the now-available
   factor and change evidence, certify, then flip `AVAILABLE_OBSERVATIONS_ALLOWED`.
5. **Pattern Research (M4)** as a workflow job against the restored canonical history.
6. Market Regime stays on the Owner gate.

## RESUME_STATE

1. Re-read this file and current GitHub/main. Measure, do not assume the counts above.
2. Do not rebuild Technical/Signals/Elliott materialization, canonical history, the factor
   evidence artifact's inputs, or the serving architecture.
3. `vu-factor-evidence-1.0.0` is a published contract. Changing a formula means a new version,
   not a silent reinterpretation.
4. Keep `QUANT_V2_STATUS = SPECIFIED_NOT_ACTIVE`, composite WITHHELD, Revisions fail-closed,
   Market Regime fail-closed, Strategy ranking unavailable, Backtesting closed.
5. Preserve `DISCOVERY_CHANGED = false` and `DISCOVERY_REGRESSION = false`.
