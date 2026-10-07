# Independent review F — final regression safety

Baseline: `b39d8d7ddbd093d138e2844ddec2cb2bb07a6962`.
Reviewed: new `providers/marketstack/client.js`, `audit-adapter.js`, `tests/audit.test.mjs`, `scripts/marketstack/capability-audit.mjs`, and new `docs/marketstack-audit/**`.

## Result

Final result: **PASS**, with no open regression/safety blocker. The private-output path check finding was corrected and independently rechecked. Repository-internal `..private` and `..hidden/raw` names are now rejected through a `..` path segment check, and committed regression tests cover both paths plus symlink ancestors. No actual account API call was made.

## Scope and dependency verification

`git diff --name-only b39d8d7ddbd093d138e2844ddec2cb2bb07a6962` returned no changed existing tracked files during review. New paths are limited to provider connector/tests, audit script and audit documentation. No workflow, schedule, registry, product dataset, ranking, quant method, SuperTrader file, US product data, Tiingo implementation, or Core identity file changed.

The adapter imports only its Marketstack client; the client reads the existing unchanged provider-neutral MarketClient. There is no product registration and no new identity fabrication. Independent import verification compared actual `Provider.registry.list()` before and after module load, with no change. Global fetch is preserved. The client test bypass requires an explicitly injected transport distinct from global fetch; a supplied key plus a bypass flag alone cannot make a request without a shared budget.

## Tests

Executed with Node **v24.19.0**; repository documentation specifies Node 22, so this records the available runtime rather than claiming a Node 22 run.

`node --test providers/marketstack/tests/audit.test.mjs core/tests/identity.test.mjs quant/tests/provider.test.mjs quant/tests/tiingo.test.mjs quant/tests/verify-tiingo-realtime-wiring.test.mjs`

**81 passed, 0 failed**:

- Marketstack connector/observations: 19.
- Existing Core identity: 5.
- Existing provider registry/contracts: 21.
- Existing Tiingo adapter: 34.
- Existing Tiingo realtime wiring: 2.

The initial baseline failures were resolved by materializing 66 existing tracked sparse-checkout fixtures under `quant/config`, `quant/methodology`, `quant/data/market/security-master`, and `quant/data/market/scale`. Their contents were not changed; no tracked diff resulted.

`node scripts/quality/check-test-isolation.mjs --suite 'providers/marketstack/tests/*.test.mjs'`: passed; new suite exited successfully and changed no production data.

`node scripts/marketstack/capability-audit.mjs`: `OFFLINE_PLAN_ONLY`, 42 cases, target 1,999 credits, hard cap 3,500, **zero account requests**.

Additional independent scratch probe `review-f-guards.mjs` passed using one injected fake HTTP response and zero real network calls. It verified:

- Existing provider registry unchanged on import.
- Ordinary product output and symlink paths refused.
- Credit cap above 3,500 refused.
- Existing ledger reuse refused.
- Credit reservation written before fake fetch.
- One-credit budget stopped further fake requests.
- Original whitespace-bearing JSON raw text preserved separately from normalized observations.
- Private evidence files have no group/other permission bits.
- Summary contains no supplied synthetic credential.

The independent scratch probe uses a synthetic key and temp output that is removed afterward. Its credit reservation is not a provider/account credit.

## Findings and limits

1. **Resolved:** repository-internal `..private` path bypass described above. The corrected path segment check and dedicated regression tests passed. No such private data was written by the review.
2. No live credential was available. Provider account entitlement, current prices, European realtime, raw API coverage and real ETF completeness remain unverified; successful offline tests must not be reported as evidence of those provider capabilities.
3. The adapter remains observational and unregistered. These tests demonstrate safe connector behavior with fixtures and no existing-US/Tiingo implementation regressions; they do not activate Marketstack in production or repair the separate unmerged European product PR.


## Final recheck after review fixes

Reviewed the corrected `privateOutput` guard, complete-provider-pagination versus suffix-only semantics, batch incomplete propagation, ETF listing/report/overlap validation, warm-cache bypass, action venue observations, and the added runner tests. All stay inside the authorized provider/audit boundary.

`node --test 'providers/marketstack/tests/*.test.mjs' core/tests/identity.test.mjs quant/tests/provider.test.mjs quant/tests/tiingo.test.mjs quant/tests/verify-tiingo-realtime-wiring.test.mjs`

**90 passed, 0 failed** on Node v24.19.0: 28 new Marketstack tests plus the same 62 existing regression tests. Full output: `review-f-final-tests.tap`.

Production-isolation gate passed again for the final 28-test Marketstack suite. Independent scratch guards passed again with no real network traffic. Existing tracked-path diff against baseline still empty; only new Marketstack provider, script, and documentation paths are present. Parent is separately arranging Node 22 validation; this reviewer does not claim its result.

No open regression/safety finding remains. Live account capability limitations remain as explicitly stated above.
