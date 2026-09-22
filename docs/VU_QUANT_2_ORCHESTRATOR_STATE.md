# Vision Universe® Quant 2.0 — Orchestrator State

Updated: 2026-09-22 UTC

## CURRENT_MAIN

- GitHub `main`: `f4f6656bcacfc0964c8b9f450967a08387e2f002`
- Production release source before this integration: `c2d51dcba1a42d8066a18e0e817a4cf3af950271`
- Active integration branch: `codex/p0-consumer-integration-recovery`
- Branch includes current `main` through merge commit `0aa2bc06` plus the P0 consumer-breadth candidate.

## LAST_MERGED_PR

- PR #145 — removal of the five-title Product Service standard scope.
- Relevant preceding gates: #138 ranking hygiene, #139 capability breadth, #140 SIC peer taxonomy, #141 canonical SetupState, #142 ledger repair, #143 Technical Scanner rule convergence.

## OPEN_PRS

- PR #146 — obsolete narrow broad-factor bridge; superseded by #147 and must not be merged.
- PR #147 — P0 capability-driven Quant consumer integration; active integration target.

## CURRENT_PHASE

`P0_CONSUMER_INTEGRATION_ACCEPTANCE`

The canonical product universe is searchable and routable. The active work closes the remaining consumer-side five-scope assumptions and verifies real capability-driven Stock, Fundamentals, Quant, Technical and SetupState behavior before continuing the master plan.

## COMPLETED_GATES

- Canonical Company/Security Master and Product Eligibility are reused.
- Canonical searchable/routable universe: 6,875 titles.
- Product capability summary is consumed by the VU2 product service.
- Search, stock detail, annual/quarterly Fundamentals and Quant evidence no longer branch on Preview/Five membership.
- Existing materialized SEC consumer data, price history, factor artifacts and Technical bundles are reused; no second pipeline was introduced.
- Technical base evidence is separated from the full Technical/Elliott workspace capability.
- Quant V2 remains `quant-v2.0.0`, `SPECIFIED_NOT_ACTIVE`; no uncertified score is exposed.
- Revisions remains unavailable without licensed analyst PIT evidence.
- Market Regime remains fail-closed.
- SetupState contract is visible but inactive/fail-closed.
- Representative local acceptance passes for TSLA, AMD, MU, MET, O, ASML, BAC, PLAB and CRWV.
- Discovery product files and behavior were not changed by this integration.

## OPEN_GATES

- Run the full Quant, Python VU2, Discovery regression and release-build suites on the integration candidate.
- Run Browser QA with updated capability-driven assertions.
- Push PR #147, obtain CI green and merge it.
- Verify the deployed release commit and repeat the breadth/sample measurement against Production.
- Close obsolete PR #146 after #147 is merged.
- Continue only then with the next dependency-correct master-plan phase.

## OWNER_DECISIONS

- GitHub/main and deployed artifacts are the source of truth; chat history is not.
- Discovery is a separate product. Its UX, navigation, design, collections, product logic and layout are a hard no-change gate.
- Existing data infrastructure must be reused. No second Fundamentals, Tiingo, Realtime or market-data pipeline.
- A stock receives intelligence according to explicit capabilities, not membership in a five-title list.
- A curated five-title Home/Signals presentation may remain only as an explicitly named feature-specific set; it is not a Product Universe or Stock Intelligence gate.
- Full Technical/Elliott workspaces are shown only for published, valid real bundles. Reduced technical factor evidence must not be mislabeled as a full workspace.
- Quant V2, Revisions and Market Regime stay fail-closed until their respective certification/external-data gates are satisfied.

## KNOWN_BLOCKERS

- PR #147 Browser QA on the previous head failed on stale five-title assertions, not on the product contract. Assertions are being replaced with capability-driven acceptance.
- Vercel checks on the prior PR head reported a build-rate limit. This is an external deployment-provider condition, not evidence of product correctness.
- Only five canonical real Technical/Elliott bundles are currently published. This is an explicit capability boundary, not a reason to hide other Stock/Quant/Fundamentals/technical base evidence.
- CRWV, the young-IPO sample, has no published Fundamentals capability and correctly remains typed unavailable for that adapter.

## PRODUCTION_REALITY

Production before this integration reports the following canonical capability counts from `capabilities-summary-v1.json` (generated 2026-09-21T22:52:52.576Z):

| Measure | Count | Meaning |
|---|---:|---|
| `PRODUCTION_SEARCHABLE_UNIVERSE` | 6,875 | Canonical product titles |
| `STOCK_DETAIL_ROUTABLE_UNIVERSE` | 6,875 | Canonical identities route to stock detail |
| `FUNDAMENTAL_VISIBLE_UNIVERSE` | 5,378 | Published Fundamentals capability |
| `QUANT_EVIDENCE_VISIBLE_UNIVERSE` | 6,404 | Published current factor evidence; not Quant-V2 scores |
| `TECHNICAL_VISIBLE_UNIVERSE` | 6,404 | Reduced current price/factor technical evidence |
| `FULL_TECHNICAL_WORKSPACE_VISIBLE_UNIVERSE` | 5 | Canonical real full Technical bundles |
| `ELLIOTT_VISIBLE_UNIVERSE` | 5 | Elliott evidence inside those full bundles |
| `SETUPSTATE_VISIBLE_UNIVERSE` | 6,875 | Contract can be returned fail-closed |
| `SETUPSTATE_ACTIVE_UNIVERSE` | 0 | No certified active SetupState |

`FIVE_SCOPE_REMAINS = false` for Search, Stock Detail, Fundamentals, Quant evidence, technical base evidence and SetupState. Five-title feature-specific data remains explicit for Home/Signals and full Technical/Elliott bundles.

The candidate measurement is reproducible with:

```bash
node scripts/vu2/measure-consumer-breadth.mjs
node scripts/vu2/measure-consumer-breadth.mjs --base-url=https://visionuniverse.de
```

## NEXT_DEPENDENCY_CORRECT_STEP

Complete CI and Production acceptance for PR #147. After the deployed P0 gate passes, resume the master plan at Radar/Signals/Watchlist breadth, then Strategy Lab, Market Regime, Quant-V2 certification and Backtesting in dependency order.

## RESUME_STATE

1. Checkout `codex/p0-consumer-integration-recovery` and compare it with current GitHub `main`.
2. Read this file, the Product Constitution, Lost Work Register, Master Rematch Report, execution ledger and operating handoff.
3. Inspect PR #147 and its latest checks. Do not merge #146.
4. If #147 is not merged, finish its full regression/Browser QA gates, push and merge only when green.
5. If #147 is merged, confirm Production serves that merge/release commit and run the Production breadth measurement plus the nine representative title probes.
6. Keep Discovery unchanged and keep Quant V2, Revisions, Market Regime and SetupState activation fail-closed.
