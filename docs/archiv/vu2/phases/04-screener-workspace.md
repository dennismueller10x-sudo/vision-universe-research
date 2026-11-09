# Active phase — combined Screener rules

Base: PR66 head5e4e981d8e56b8fb5531331dead98228c5530985, same tree as localbeeb1e6. Branch/worktree workstream/vu2-screener-workspace / ../vu2-screener-workspace. Dependencies: scoped product-service screen, existing Query/Catalog, Discover recipes. SEC ownership isolated.

Requirements: Master8/18/19/38/55/65/79. Relevant Research2 principle: guided discovery and free professional exploration share definitions. No new metric calculation, percentile or score.

Owned files: screener-workspace.js UI adapter, experience.js/css/index, targeted tests, existing browser QA, phase/ledger. Eight existing numeric fields and Catalog operators; Query.MAX_FILTERS governs count. AND composition uses existing Query.execute. Criteria can be added/removed; sort explicit. URL contains only validated canonical rules, not data, credentials or snapshots. Invalid links do not silently execute replacement queries. Existing full Screener remains directly accessible.

Acceptance: combined growth/momentum yields identical results via direct Query; encode/decode preserves hash; unsupported/oversized links fail closed; browser tests exercise zero results, adding a rule, saving/reopening and invalid links at1440/390. No provider-scale test required.

Targeted tests:3 UI-adapter tests plus11 existing product-service tests PASS. Browser gate pending. Rollback: revert this bounded UI adapter; Discover/old professional Screener preserved.
