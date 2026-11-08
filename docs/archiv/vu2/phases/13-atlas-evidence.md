# Phase 13 — Atlas evidence tools and guided explanations

Base PR75 aad3c67b69f68e42adb7bc6f8de43174c8769984. State IMPLEMENTED; review and browser gate pending.

## Active requirements
Master §§39–40,51–52,67,69: AI explains existing truth; structured tools, original Atlas, no hallucinated data, no mock leakage or credentials in client. Free model conversation is not enabled by this phase.

## Owned files and contracts
- quant/api/atlas-tools.js adapts the existing ai-tools.js registry, exposing only five read-only product tools. Does not instantiate the existing mock AI provider or legacy client.
- Existing Quant/Technical/History/Screener services remain calculation, display-policy and provenance owners. Metric definitions come from shared registry.
- vu2/experience.js/css and index.html add guided questions, exact evidence, dates, definition disclosure and deep dives. Original assets/atlas.png unchanged. Existing AI workspace retained.
- Targeted tests and the existing browser script. No backend credential, deployment, provider or SEC changes.

## Acceptance criteria
No free code/SQL/network/filesystem call, strategy write, backtest execution or fabricated ranking. Unknown names/arguments and prototype-named arguments rejected before product access. Definition-list consumers cannot mutate registry validation. Canonical Screener semantics preserved. No new formula. Unsupported/missing evidence stays unavailable.
UI explicitly says fixed questions and no language model connection. Shows methodology and source dates before any implication of personalized advice. Original AI capabilities remain accessible in their existing workspace.

## Gates and rollback
29 targeted tool/product-service tests PASS. Browser suite now34 view/width checks with Atlas company/question changes, evidence reference values, out-of-scope and execution rejection. Desktop1440/390 screenshots required. Broader regressions at PR gate; no provider backfill.
Revert additive phase to restore legacy Atlas links; no persistent user data or production mutation. Home EOD badge receives neutral rather than positive coloring after screenshot critique. Full language-model integration remains pending a configured server-side provider and its separate review, not replaced with a mock.
Final focused gate:30 tool/service tests PASS. Independent re-review PASS after central raw-quote/price-query permission repair. Public display scope unchanged. Browser/regression gate pending.
