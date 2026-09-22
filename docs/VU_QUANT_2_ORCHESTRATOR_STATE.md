# Vision Universe® Quant 2.0 — Orchestrator State

Updated: 2026-09-22 UTC

## CURRENT_MAIN

- GitHub `main` at latest follow-up audit capture: `f452688fe46eab0360e93b71eb0b100b0dc8b72c`
- P0 merge commit: `3d850b7176f4ef688047f02919209761e308f537`
- Production release source at acceptance: `3d850b7176f4ef688047f02919209761e308f537`
- Production URL: `https://research.visionuniverse.de`
- P0 integration branch head before merge: `533db7a5ee1b5499d0ffd0baaa2326f2543596f4`

## LAST_MERGED_PR

- PR #147 — P0 capability-driven Consumer Integration, merged as `3d850b7176f4ef688047f02919209761e308f537`.
- Relevant preceding gates: #138 ranking hygiene, #139 capability breadth, #140 SIC peer taxonomy, #141 canonical SetupState, #142 ledger repair, #143 Technical Scanner rule convergence and #145 Product Service scope removal.

## OPEN_PRS

- No open Quant-2.0 integration PR remains from this cycle.
- PR #146 was closed unmerged because #147 superseded it.

## CURRENT_PHASE

`P0_CONSUMER_INTEGRATION_ACCEPTED`

The capability-driven Stock Intelligence breadth gate is merged and deployed. The next dependency-correct phase is Radar/Signals/Watchlist breadth; Strategy Lab, Market Regime, Quant-V2 certification and Backtesting remain downstream.

## COMPLETED_GATES

- Canonical Company/Security Master and Product Eligibility reused; no second universe or data pipeline introduced.
- Searchable and stock-detail-routable canonical universe: 6,875 titles.
- Stock Detail, Fundamentals, Quant evidence, reduced Technical evidence and SetupState now follow explicit title capabilities rather than Preview/Five membership.
- Existing SEC consumer data, annual/quarterly Fundamentals, PIT/restatement artifacts, price history, factor artifacts, realtime infrastructure and Technical bundles reused.
- Full Technical/Elliott workspaces remain limited to published valid real bundles; reduced technical evidence is labeled separately.
- Full-Universe factors are loaded only by Universe/Discover/Screener consumers, not eagerly by Home or Stock Detail.
- Quant V2 remains `quant-v2.0.0`, `SPECIFIED_NOT_ACTIVE`; no uncertified score is exposed.
- Revisions and Market Regime remain fail-closed. SetupState is visible as a contract and inactive.
- Local regression: Quant Node 1,326/1,326; Quant Python 471/471; VU2 Python 32/32; Discovery Node 227/227; resource-budget tests 5/5; release build PASS.
- PR CI PASS: Company Master, Production Pages packaging, Quant CI, SEC Fundamentals CI and VU2 Browser QA. Browser QA passed 53 journeys plus accessibility and resource gates.
- Production serves the exact merge commit and returns HTTP 200 for `/vu2/` and `/discover/`.
- Production consumer artifacts return HTTP 200 for TSLA, AMD, MU, MET, O, ASML, BAC, PLAB and CRWV.
- Discovery product files, UX, navigation, design, collections, product logic and layout were not changed.
- `DISCOVERY_CHANGED = false` and `DISCOVERY_REGRESSION = false` for PR #147. Later unrelated main commits must be evaluated on their own scope.

## OPEN_GATES

- Radar/Signals/Watchlist must now be audited and widened in dependency order using the accepted capability contract.
- Strategy Lab follows only after the upstream breadth consumers are consistent.
- Market Regime requires its own certified evidence and stays fail-closed.
- Quant-V2 activation requires seven-factor certification, including licensed/reproducible PIT Revisions evidence.
- Backtesting remains blocked until the dependent PIT, historical-universe and execution certifications pass.

## OWNER_DECISIONS

- GitHub/main and deployed artifacts are the source of truth; chat history is not.
- Discovery is a separate product and remains a hard no-change gate.
- Existing data infrastructure is reused. No second Fundamentals, Tiingo, Realtime or market-data pipeline.
- A stock receives intelligence according to explicit capabilities, not membership in a five-title list.
- A curated five-title Home/Signals presentation may remain only as an explicitly named feature-specific set; it is not a Product Universe or Stock Intelligence gate.
- Full Technical/Elliott workspaces require published valid real bundles. Reduced price/factor evidence must not be mislabeled as a full workspace.
- Quant V2, Revisions, Market Regime and SetupState activation stay fail-closed until their respective gates are certified.

## KNOWN_BLOCKERS

- Only five canonical real full Technical/Elliott bundles are published. This is an explicit capability boundary, not a reason to hide other intelligence.
- CRWV has no published Fundamentals capability and correctly remains typed unavailable for that adapter.
- The Vercel status on the merge commit reports an external build-rate-limit failure. Production for this repository is GitHub Pages at `research.visionuniverse.de`; its deployed `release-delivery.json` names the exact merge commit.

## PRODUCTION_REALITY

Production `release-delivery.json` names `3d850b7176f4ef688047f02919209761e308f537`, storage `EXISTING_R2_UNCHANGED`, and delivery status `PASS`. Production `capabilities-summary-v1.json` was read live and reports:

| Measure | Count | Meaning |
|---|---:|---|
| `PRODUCTION_SEARCHABLE_UNIVERSE` | 6,875 | Canonical product titles |
| `STOCK_DETAIL_ROUTABLE_UNIVERSE` | 6,875 | Canonical identities accepted by the Stock Detail contract |
| `FUNDAMENTAL_VISIBLE_UNIVERSE` | 5,378 | Published Fundamentals capability |
| `QUANT_EVIDENCE_VISIBLE_UNIVERSE` | 6,404 | Current factor evidence; not Quant-V2 scores |
| `TECHNICAL_VISIBLE_UNIVERSE` | 6,404 | Reduced current price/factor technical evidence |
| `FULL_TECHNICAL_WORKSPACE_VISIBLE_UNIVERSE` | 5 | Canonical real full Technical bundles |
| `ELLIOTT_VISIBLE_UNIVERSE` | 5 | Elliott evidence inside those full bundles |
| `SETUPSTATE_VISIBLE_UNIVERSE` | 6,875 | Contract returned fail-closed |
| `SETUPSTATE_ACTIVE_UNIVERSE` | 0 | No certified active SetupState |

`FIVE_SCOPE_REMAINS = false` for Search, Stock Detail, Fundamentals, Quant evidence, reduced Technical evidence and SetupState.

Representative acceptance on the exact deployed artifact:

| Cohort | Ticker | Stock/History | Fundamentals | Quant evidence | Technical evidence | Full Technical/Elliott |
|---|---|---|---|---|---|---|
| Large cap | TSLA | available | available | available; score unavailable | reduced available | unavailable |
| Semiconductors | AMD, MU | available | available | available; score unavailable | reduced available | unavailable |
| Insurer | MET | available | available | available; score unavailable | reduced available | unavailable |
| REIT | O | available | available | available; score unavailable | reduced available | unavailable |
| International ADR | ASML | available | available | available; score unavailable | reduced available | unavailable |
| Bank | BAC | available | available | available; score unavailable | reduced available | unavailable |
| Small cap | PLAB | available | available | available; score unavailable | reduced available | unavailable |
| Young IPO | CRWV | available | correctly unavailable | available; score unavailable | reduced available | unavailable |

The counts come from the live Production capability artifact; the adapter states were probed by the accepted consumer-service measurement against the identical deployed commit. All nine Production consumer artifacts returned HTTP 200.

## NEXT_DEPENDENCY_CORRECT_STEP

The first read-only follow-up audit found:

- Watchlist already resolves arbitrary validated user selections through the canonical universe and is not Five-gated.
- Radar/Markets consumes the canonical broad market-intelligence service, while the current UI deliberately renders only five observations; this is a presentation/performance slice and must remain explicitly named rather than treated as breadth evidence.
- Signals still enumerates `development-preview.scope` and reads Golden-Preview histories. Expanding that call to all 6,875 titles would create prohibited history fanout.

Therefore the next implementation is an on-demand, capability-gated Signals consumer for a selected title or bounded user selection, reusing canonical history and the existing Market Signal contract. Do not replace it with an all-universe history fanout. Re-measure Radar and Watchlist after that integration before proceeding to Strategy Lab.

## RESUME_STATE

1. Start from current GitHub `main` and confirm Production still names the same or a newer main commit.
2. Read this state file, the Product Constitution, Lost Work Register, Master Rematch Report, execution ledger and operating handoff.
3. Treat P0 Consumer Integration as accepted; do not rebuild its architecture or reopen Five-Scope assumptions.
4. Begin with Radar/Signals/Watchlist breadth and record each material integration result here.
5. Keep Discovery unchanged and keep Quant V2, Revisions, Market Regime and SetupState activation fail-closed.
