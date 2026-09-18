# Vision Universe® 2.0 — current-state audit

Base and first observed main: `533245e8bb1b805c24c1ce9ba2051345ad215e24`.
Initial inspection and source reading: 2026-09-09. This records already collected evidence; no new provider calls were made. Attached Product, Experience and Orchestration researches were read in full; hashes and exact inventories are in inventory.json. Implementation reality takes precedence over proposed designs.

## A / L — architecture and deployment
Static HTML/UMD JavaScript, Node test runner, Python SEC pipeline, GitHub Actions and GitHub Pages at research.visionuniverse.de. No package manager/build framework or database migration is required. Provider adapters → canonical schemas/working store → feature engines → published snapshots → existing API/shell → pages. Legacy dashboard and Quant are separate consumers. Original assets: assets/vision-universe-logo.png and assets/atlas.png.

## B / J / K — providers and validated states
Tiingo: KEEP + HARDEN. Committed FULL_UNIVERSE gate generated 2026-09-09 17:04Z reports 5,684 resolved, zero unavailable, 5,663 historical coverage, **45 quality failures**, 3,401 warnings. Full gate PASS does not mean every series is clean. Factor summary: 5,639 evaluable; technical coverage: 5,661 ready, 23 short. Data-quality summary PASSED_WITH_WARNINGS. These are prior-run artefacts, not a rerun on this branch. Source: quant/data/market/scale/. Full working history is approximately 7,566 MB; it is not present in this checkout. Public screener answers and rankings are truncated to 50 tickers; full arbitrary-query data must not be inferred from them. 5,584 sector classifications are unknown. Never invent sector breadth.

Realtime: intraminute event updates proven by existing evidence; price type UNSPECIFIED / PROVIDER_CONFIRMATION_REQUIRED. No last-trade labeling, trade-based signals or backtests. Capability is separate from display entitlement.

SEC on main: five canonical companies, 4,271 facts and 27,385 PIT observations; validated public-domain fundamentals. Historical survivor-free universe gate remains FAIL. Parallel PR #59 scales SEC: Golden Five passes, gate 100 fails (23/91 attempts); no claim of full-universe fundamentals. Protected scope: scripts/quant/sec/, quant/config/sec-metric-registry.json, quant/data/sec/, scripts/quant/cli.py, SEC workflows/tests and its existing project-master document. Never take over this workstream.

Other existing providers include Twelve Data, Finnhub analyst ratings, FMP and SEC 13F. Alternative profile entries are configured options, not proof of operational coverage. See providers/, quant/config/provider-profiles.json, analysten/, scripts/hedgefonds/.

## C / D / E — contracts, metrics and consumers
Canonical schema/PIT: quant/engines/schema.js. Data selection: data-precedence.js, data-mode.js. Existing product interface: quant/api/client.js; Golden-Five stock UI still directly composes snapshots. Shared Query AST: query.js → screener, VUQL, strategies and AI. Keep the AST and extend only after compatibility tests.

Metric ownership is inconsistent: factors.js returns percent momentum and uses raw-close SMA/high; market-factors.js returns fractional momentum and high-based, sometimes adjusted 52-week distances; technical/feature-store.js supplies primitives and technical momentum uses logarithmic returns. These are **not interchangeable aliases**. Registry must version and document semantics before consumer migration. Preserve shared primitives; do not replace all engines.

Consumer graph: canonical market → market-factors → scale screener/rankings; market → technical feature-store → technical/scenarios/Elliott/chart; canonical SEC → panels/PIT; legacy synthetic snapshots → Quant API → screener/ranking/radar/strategy/backtest/AI. A new product service must enforce provenance/availability rather than silently joining these paths.

## F / G / I — routes, components and data/mock map
Exact route, component, engine and workflow inventory: inventory.json. Global assets/site-navigation.js currently exposes 13 flat destinations. Quant shell adds local workspace tabs. Keep safe textContent DOM construction and existing charts. Technical contains a full Elliott layer, not a standalone route. MAX must retain actual available history.

Legacy Quant dataset contains **482 synthetic securities**. Golden-Five real market/fundamental paths coexist with it. data-mode.js allows a labeled mock fallback; that must not become a production intelligence fallback. Technical scan includes scan-mock.json. New production services must return SOURCE_MISSING/UNAVAILABLE, never synthetic substitutes. Existing demos may remain explicitly identified.

## H — baseline tests and CI
Local baseline: 684 Node Quant tests PASS; 249 Python tests PASS; 8 Academy tests PASS. Quant reproducibility: 482 synthetic rows, zero differences, 29 historical references and 11 DNA shards. Technical reproducibility: 18 instruments/18 snapshots. Secret scan and public-data hygiene PASS. Raw logs: sibling vu2-evidence directory (temporary; counts recorded here).
Main CI evidence: Quant run 34383365467 PASS; SEC 34383365504 PASS; Pages 34383362996 PASS. Existing live smoke 34384486434 PASS on separate smoke commit. These do not validate future VU2 UI. No desktop/mobile redesign screenshot gate has passed yet.

## M — risks and gates
HIGH: permanent incremental checkpoint IDs can skip subsequent days; corrupt working JSON is treated as absent; full-history persistence is not established (scale cache save limit 2,500 MB < measured 7,566 MB). Corporate-action updates do not reconcile past adjusted bars. Technical-ready and quality-eligible denominators differ. Legacy production/demo boundaries need explicit contracts. Full factor rows and sector coverage are not available publicly.

Public display remains limited to documented Golden-Five EOD development permission. Provider profiles retain LEGAL_REVIEW_REQUIRED, including derived analytics. Do not broaden permission, expose keys, publish working histories or enable full-universe realtime. Durable production storage activation and corporate-action rebasing require measured verification; UI and internal contracts can proceed independently.

## Open workstreams
#59 SEC scale (parallel dependency; protected ownership), #53 realtime UI/semantics integration (audit before overlapping), #44 older home Quant link (avoid duplicate work). Main is not branch-protected according to observed API; this does not authorize unsafe merge. All VU2 work stays on isolated branches and reviewable PRs.
