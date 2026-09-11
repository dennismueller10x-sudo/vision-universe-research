# Phase 10 — shared metric catalogue

State: IMPLEMENTED; remote regression/browser gate pending.
Base: PR72 d30135989e402d0405207be1ea7a16e70cc25dfe; main unchanged at 533245e8bb1b805c24c1ce9ba2051345ad215e24.

## Active requirements
Master §§28,37–39: one definition owner, explicit dependencies, units, temporal/adjustment/missing-data semantics. Research experience contract: explanation before methodology. This phase indexes existing semantics; it does not reconcile differing engine definitions or change values.

## Contracts and owned files
- quant/engines/metric-registry.js: 26 original market entries plus 18 namespaced existing factor entries. Source revision pinned; no fictional engine version.
- quant/api/quant-workspace-contract.js: consume catalogue explanation, units and definition provenance.
- vu2/index.html: browser dependency order.
- quant/tests/metric-registry.test.mjs; scripts/vu2/browser-qa.mjs.
SEC-owned contracts, providers, data and legacy calculation engines remain untouched.

## Acceptance and validation
Original 26 definitions retain object identity; ratio metrics never alias percent factors. Preserve all 18 Quant values and permissions. Filing versus EOD inputs stay distinct, including availability dependencies. Owner changes require definition review. Missing values remain missing; catalogue does not certify PIT.
21 targeted registry/product-service tests PASS. Independent review found adjusted-close availability dependency for raw SMA factor; repaired and reproduced with an engine reference regression.
Browser gate reuses all existing journeys at 1440/390 and renders expanded German Quant explanation. Broader regression runs once at PR gate; no provider backfill.

## Scope and rollback
Additive preview consumer migration. Revert this phase to restore Catalog-backed Quant metadata. No production rollout. Technical, further fundamental, portfolio and strategy definitions remain progressive catalogue gaps; 44 entries are not full registry completion. Existing separate factor engines are documented, not silently unified.
