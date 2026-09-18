# Canonical Quant product integration — execution graph

Base main: `08bced0084373b34d5344ecd5e61e9c36a3f0ffa`.
Branch: `integration/quant-canonical`. Started: 2026-09-18.
Predecessors: PR96 and PR107 merged; full product data integration NOT complete.

## Executable state transitions

SYNC -> OBSERVE -> AUDIT -> PLAN -> LOCK_SCOPE -> IMPLEMENT -> TEST -> REVIEW -> VALIDATE -> RECORD -> DEPLOY -> PRODUCTION_VERIFY -> GATE -> CONTINUE.
Any TEST/REVIEW/VALIDATE failure -> ROOT_CAUSE -> REPAIR -> TEST.
Main shared-contract drift -> AUDIT_DELTA -> LOCK_SCOPE.
Owner decision -> record exact action/evidence -> OWNER_WAIT; continue independent safe work.
Missing evidence never becomes PASS. A green PR is not product completion.

## Specialist ownership and gates

| Lane | Specialists | Inputs | Gate |
| --- | --- | --- | --- |
| Contract audit | Architecture, Company Master | current main, parallel branches, eligibility, contracts | exact identity and data paths documented |
| Existing services | Fundamentals, Market Data, Realtime | SEC/R2 contracts, existing worker/relay and lifecycle | no duplicate storage/provider adapter; independent data availability; quote/trade semantics |
| Quant consumption (serialized shared contracts) | Product Service, Quant, Technical, Elliott, Screener | validated shared service responses | no synthetic fallback; canonical eligible securities retained despite missing datasets |
| Historical research | Strategy, Backtesting | shared rules, PIT and corporate-action evidence | future data rejected; unresolved backtest prerequisites remain gated |
| Experience validation | UX, QA, Accessibility, Performance | actual release artifact | desktop/mobile, semantic tests, resource budgets, error/loading/empty states |
| Release | Release | all preceding evidence and unchanged Discovery | bounded PRs, rollback, deployment and measured production coverage |

Named roles are activated per dependency rather than spawning all agents before scope is known.
Read-only specialist audits run concurrently; shared code mutations are serialized.

## Active requirements

User sections 1–13, 24–30: two products/one platform; stable IDs; eligibility source of truth; existing R2 and relay; no browser provider/R2 credentials; independent availability; Discovery unchanged.
Sections 16–23 remain downstream acceptance requirements; no substitute score or PIT claim.

## Affected contracts and candidate paths

- docs/VU_FUNDAMENTAL_DATA_CONTRACT.md, docs/VU_SEC_DAILY_LIFECYCLE.md (consume)
- worker/src/, worker/wrangler.toml (existing service; modify only after audit)
- quant/api/product-services.js, quant/engines/instrument-directory.js (canonical consumption)
- quant/api/*workspace*.js, vu2/ (integration only)
- scripts/vu2/ and existing CI (validation and delivery)
- discover/** is read-only. No Discovery UI, product logic, collections, navigation or data edits.

## Acceptance and tests

Measure canonical eligible count and coverage per data family from real artifacts. No fixed historical count as test oracle.
Run targeted contract tests during edits; Quant/SEC/Company Master and existing Discovery regression at shared-platform gates.
Browser QA must exercise diverse issuers, absent data, unsupported/invalid instruments, errors, stable IDs and deep links on desktop and 390px mobile.
Production verification and artifact validation remain separate evidence.

## State

AUDIT_COMPLETE / IMPLEMENTATION_IN_PROGRESS. Three specialist audits completed. Bounded search/identity and server-side SEC projection are implemented; relay semantic metadata is under targeted review.
Prior production report was corrected by PR107. No new completion claim.


## Current evidence and architecture delta (2026-09-18)

| Existing system | Measured current state | Integration action |
| --- | --- | --- |
| Company Master / eligibility | 7,803 members; 6,875 unique product members; 6,881 eligible listing rows | KEEP; search existing shards, deduplicate masterMemberId; instrumentId vu_* and masterMemberId ref_* are distinct |
| Quant products | Five fully connected panel securities; other identities previously hidden | ADAPT indexed search and honest identity-only stock state; aggregates remain explicitly scoped until services supply real data |
| SEC persistence | 5,479 issuers in current manifest; latest daily report Sep17 success, seven updates | KEEP; use existing export_inspector_view and PeriodResolver, never normalize in browser |
| Market R2 | Coverage Sep15: 6,871 chart-renderable product titles, 5,884 technical-history eligible | KEEP existing history-store/S3 driver; counts are storage evidence, not production-serving counts |
| Intraday | Sep17 partial index 520 entries, previous completed Sep16 5,259 | KEEP existing ingestion/snapshot contract; no backfill |
| Realtime | main relay equals shared Discovery implementation; compact rows omit price semantics | HARDEN additively; retain old rows and Discovery behavior; Quant must reject unverified trade mutations |
| HTTP serving | Pages static; live Worker has no R2 binding or Fundamentals route; older protected Vercel branch has history handler | Owner runtime decision needed before public server binding; no new host/cost assumed |

Discovery product paths remain read-only. No successful production-data integration is claimed.

## Required owner decision, prepared but not bypassed

The full private R2 factbooks require the existing Python SEC projection for faithful annual/quarterly/PIT semantics. The currently deployed JavaScript Worker cannot run that Python exporter; GitHub Pages cannot execute server code. An older protected preview contains a Node history handler, not a deployed public Fundamentals service.

Identify/authorize the existing Python-capable server runtime and its server-only R2 binding, or explicitly choose a hosting/cost/security change. Do not rewrite SEC in JavaScript or expose private R2 directly to avoid this decision. Continue independent search and relay contract validation first.

## Active tranche tests

- Canonical search + existing product-service tests: 36 PASS locally.
- Identity and UI asynchronous tests: stable IDs, missing CIK, excluded instruments, I/O error versus empty results, stale response suppression.
- Browser QA extended with TSLA canonical search and identity-only page at desktop/390px; pending remote run.
- Release artifact build: SEC 2,762,706 bytes < 8,388,608-byte gate; full canonical SEC/R2 objects excluded.
- Fundamentals projection tests use synthetic canonical pipeline fixtures only; real R2 access remains unverified.
- Full-universe provider tests intentionally not rerun: no persistence/provider contract replaced.
