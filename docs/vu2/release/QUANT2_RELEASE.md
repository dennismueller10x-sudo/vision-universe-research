# Quant 2.0 final release execution graph

Scope: feature freeze. Existing PR96/a32a15d; no Discovery product changes, no new data architecture.
Owner decision: 8 MiB delivery budget remains fixed; full canonical fundamentals remain in R2.

## Production Pages handoff

- Production source before cutover: `main/(root)` at `c16e0badd510abc1801797d173c9985405c019f2`.
- Target source: GitHub Actions workflow `Quant 2.0 Production Pages`.
- The workflow builds the reviewed delivery projection, enforces the fixed 8 MiB SEC budget, proves canonical R2 storage is unchanged, and deploys only that artifact.
- `/quant/` becomes the stable Quant 2.0 entry and redirects to the reviewed `/vu2/` experience in the release artifact. Source workspaces remain intact.
- Rollback point: `c16e0badd510abc1801797d173c9985405c019f2`. Revert the release merge and restore Pages branch delivery from `main/(root)` if a critical production fault requires rollback.

| State / responsible role | Exit gate | Recovery / escalation |
| --- | --- | --- |
| SYNC / release orchestrator | PR96 exact head and main observed | Main overlap re-audit only |
| DELIVERY_REPAIR / release integration | Canonical source unchanged; deploy projection <=8 MiB; history contract parity | Repair projection; never delete fundamentals or raise budget |
| VERIFY / contract reviewer + existing CI | Quant, SEC, Company Master, browser/a11y/mobile/resource tests pass for candidate | Repair real defects; preserve assertions |
| VISUAL / experience reviewer | Inspect screenshots from exact candidate at1440/390 | External artifact access recorded separately; no invented PASS |
| RC_LOCK / release auditor | Commit, PR, data/known limitations, visual evidence, rollback artifact recorded | No merge if identity, data integrity, delivery path or required evidence unresolved |
| DEPLOY / release orchestrator | Existing Pages host publishes tested slim artifact | Owner authentication/configuration if unavailable; no branch-root source publication |
| PRODUCTION_SMOKE / browser QA | Live route, search, stock/history/technical/quant/screener/strategy/deep links, errors/mobile/resources pass | Critical regression: restore captured prior deployment, root cause, repair and revalidate |
| LIVE | Live PASS, smoke PASS, blockers0, no duplicate architecture, budget PASS, rollback ready | Stop; future work POST_LAUNCH |

Specialist release_delivery_review independently reviewed storage/runtime consumers and canonical identity. Shared contracts serialized. The same specialist implemented the bounded identity adapter after review; orchestrator reviews diff and full regression separately.

## Delivery evidence
Source disk footprint:103248 KiB. Exact tracked blob totals: consumer87198341 bytes/5067files; inspector4542149/6files; canonical3046782/5files; SEC root379538/8files. Disk allocation differs from content bytes.
`build-release.mjs` copies existing runtime assets, excludes full SEC/fundamental storage, emits index/factor panel, existing coverage/PIT evidence and the existing five inspector product projections. Every inspector row and metric retained. Only unconsumed source fields omitted. All annual/quarterly/TTM contract results compare exactly to source. R2 objects and canonical source files never mutated.
Measured projected SEC content:2762706 bytes of8388608; largest605317 bytes, under2MiB. Existing disk allocation8MiB check also retained against actual artifact. Symlink inputs, output-inside-source and stale destination reuse rejected.
Delivery-only VU2 classic-script concatenation preserves document order and source code. Instrument shard JSON compaction preserves all data and paths. Discovery files untouched. Browser QA now serves the actual packaged candidate, not the source tree. Candidate upload is not a deployment.

## Identity release defect
Existing product row used source sec_TICKER as primary identity. Adapter now resolves existing Instrument Directory/Company Master, requires Product Eligibility, validates legacy source identity, and returns canonical vu_ ID. Market aliases derive from masterMemberId; historical CIK crosschecked. No second resolver, metric definition or source store.

## Active evidence and remaining gates
Local1077/1077 Node tests PASS,0skips, including6new release/identity tests. Remote gates pending publication. Existing accepted a32a15d Quant1071, Python471, browser45/a11y32/resources8 remain evidence for that earlier commit, not the new candidate.
Pages configuration currently UNVERIFIED: GitHub connector rejects /pages endpoint as unsupported; browser settings route shows logged-out404 with Sign in. Authenticated Pages inspection/configuration needed before publishing. No access bypass attempted.
Budget CI measures the candidate artifact; production budget is NOT certified until the hosting path consumes that artifact. Never merge this change into branch-root publishing without first resolving that boundary.

Rollback source point: dac0c7d076a36b959563e80bdb499a6cbd3955db. Previous actual Pages deployment/artifact still must be captured before production; source SHA alone is not ROLLBACK_READY.
Known inherited limitations: real professional backtest gate remains unavailable, no future/PIT safety fabricated; full lifecycle production certification not inherited from old bounded R2 proof; realtime price semantics UNSPECIFIED. Current preview/display scope unchanged. Final release audit and production smoke NOT complete. No GO-LIVE claimed.

Recovery record: first packaged browser run35207566755 reached all desktop views but failed the injected service-error recovery: injection targeted the old unbundled URL. The same rejection and recovery assertions now target either delivery form and inject immediately after the original service code, before app initialization. No assertion removed. Adversarial review also caught missing coverage_matrix/pit_gates files; both existing evidence artifacts now retained with exact JSON equality tests. First revised SEC35207566769 and Quant35207566761 PASS. Company Master35207823967 PASS. Final repaired-head remote gates still required.

## Production activation

- PR #96 merged as `b429417308e31c0b9543641f6cf06bfc97b86385` after all release-candidate gates passed.
- Owner switched GitHub Pages from branch-root publishing to GitHub Actions.
- This documentation-only commit triggers the reviewed production artifact workflow; live and smoke status remain pending until deployment verification.
