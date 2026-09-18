# Active phase — Strategy definitions and trust boundary

Base PR69 updated head a7ad9105c072979b984270ce431a5c196f64d565. Separate worktree workstream/vu2-strategy-workspace. Requirements Master19/47/48/49/55/79/82. Research2: understandable rules with professional depth, explicit trust before historical results.

Use existing Strategy/Query/Methodology engines. Screener filters transfer unchanged. User configures factor weights, positions, weighting, cadence, execution timing, costs, concentration and liquidity. New browser-local draft uses existing immutable createStrategy/addVersion and definition hashes. Corrupt records and failed writes are explicit; no silently replaced history. Existing legacy strategy/backtest routes preserved.

No historical results or synthetic fallback. Current filter preview is explicitly not a ranking, allocation or backtest. Real PIT, temporal universe/delistings, corporate actions, benchmark and reproducible execution remain combined release gates. No real backtest activation or ownership change in SEC/provider paths.

Affected: additive strategy-workspace adapter, service methodology context, VU2 route/CSS/index, existing browser QA, focused tests. Acceptance: canonical filter parity, immutable versions, invalid weights/no-change/no-reason rejection, browser persistence/reload and current filter selection,1440/390 screenshots.18 focused tests PASS; independent review PASS after repairs; browser gates pending. Rollback: revert additive UI/adapter, preserve browser record for export/recovery; old workspace untouched.
