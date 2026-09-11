# Active phase — transparent Quant evidence

Base: PR68 updated head a7dc9d0f74ca046a012166fec438494ab635e228. Separate branch/worktree workstream/vu2-quant-workspace. Shared contracts serialized after Technical; no SEC-owned changes.

Active requirements: Master22/37/38/39/42/55. Research2 meaning/explanation/evidence applied to five existing factor families: profitability, growth, value, momentum, risk. Eighteen raw fields map to existing Catalog definitions and factors.js ownership, not a second metric engine. Existing legacy Quant and methodology remain linked.

Contract: consume validated factor-panel version sec-quant-panel-1.1.0 / sec-fact-panel-1.0.0; retain values and units, explicit missing data, dates and provenance. Market-dependent valuation/risk/momentum follow display policy. No percentile or score from Golden Five. No PIT/backtest eligibility claim. marginExpansion is displayed in percentage points, as documented by Catalog. SEC registry remains owned by its parallel workstream.

Affected files: quant-workspace-contract.js, product service, VU2 route/styles/index, existing service tests, browser QA, ledger. Acceptance: all five real sources,18 evidence rows, no mock or score, null differs from zero, denied market values suppressed, company switch, definitions reachable,1440/390 screenshots inspected.

Targeted service tests:15 PASS. Browser30 checks and broad remote CI pending. Rollback: revert additive route/adapter; existing Quant workspace remains available. Global metric registry migration remains incomplete: this is an ownership/UX mapping of existing fields, not new semantic aliases.
