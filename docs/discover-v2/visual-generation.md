# Discover 2.0 visual generation — executable orchestration

Baseline: `27b045971cb5a96db71646a5e5befe63943b4e5e`.
Owner brief: consumer discovery, swipe and return visits; reject the linear editorial prototype.

## State graph

AUDIT → EXPERIENCE_DESIGN → PARALLEL_BUILD → INTEGRATE → BROWSER_SCREENSHOTS → CROSS_CRITIQUE → QUALITY_GATES → RELEASE → LIVE_SMOKE → DONE

Visual failure returns CROSS_CRITIQUE → EXPERIENCE_DESIGN/PARALLEL_BUILD. Functional, contract, accessibility or performance failures return QUALITY_GATES → PARALLEL_BUILD. CI/environment failures enter TOOL_RECOVERY and repeat the unfulfilled gate. Release failure returns RELEASE_RECOVERY → RELEASE. Smoke failure returns PARALLEL_BUILD or RELEASE_RECOVERY. No failed gate is waived because another passed.

## Responsibilities and edit ownership

| Specialist | Responsibility | Files |
|---|---|---|
| architecture_truth | Repository/product audit, canonical data/realtime, source/freshness, return-content feasibility, regression review | read-only report |
| discovery_experience | Consumer UX/IA/visual design, first viewport, touch hero, distinctive surfaces, worlds, ranking rhythm, home continuation | discover-v2/home.js, home.css |
| mobile_shell | Mobile/desktop navigation, accessible search, feed presentation/session behavior, route lifecycle | discover-v2/app.js, app.css |
| stock_research | Chart-first stock page, fundamentals, consumer research layer, depth and onward discovery | discover-v2/detail.js, detail.css |
| quality_release | Browser/visual/a11y/performance QA, protection gates, preview release readiness | scripts/discover-v2/*, .github/workflows/discover-v2-ci.yml |
| root | Product direction, integration, independent screenshot critique, deployment and live smoke | index.html, docs, integration fixes |

## Design contract

Product-led opening: compact purpose above a swipeable chart/performance hero; home is exploration rather than a reading task. Use a coordinated graphite/ivory base with clearly colored worlds. Price direction stays green/red/neutral. At least five materially different surface compositions, using canonical content/order; no fabricated recommendation, popularity or day-over-day change. Permanent labeled mobile navigation; desktop has desktop chrome. Progressive consumer stock depth follows a dominant chart. Existing search/feed/session contracts are reused.

## Gates and evidence

1. Protected Discover 1.0 and canonical files unchanged against this baseline; only v2 and QA/docs changes allowed.
2. Existing contract/navigation suite passes. Release compiler succeeds.
3. Chromium 320/390/1440 light/dark and WebKit mobile: no overflow/errors, semantic chart ranges, search focus, feed second-screen identity and continuation, all canonical home chunks, route cleanup.
4. Mobile first-five-seconds heuristic: purpose, named stock, timeframe, reason/action visible and understandable. Explicitly not an independent participant study.
5. Visual critique: compare first view and ten-screen rhythm, visible palette/surface diversity, mobile safe area, dominant charts, readable fundamentals. A technically passing reskin fails.
6. Session depth: hero next, collection→stock, stock→similar/next, feed beyond first batch. Return reason only from available dated canonical state.
7. Existing Pages deployment passes; live v2/noindex, v1, navigation, search/detail/feed smoke pass.

Owner escalation only for irreversible/strategic change, paid infrastructure, licensing, canonical data/research rule change, or replacement of v1. Ordinary UX/CSS/engineering recovery remains autonomous.

DONE requires deployed parallel `/discover-v2/`, all gates above, retained `noindex`, unchanged canonical architecture, and explicit limitations in final evidence.

## Executed critique loop

The first integrated screenshot run exposed narrow-screen fundamental value clipping, a doubled chapter scroll offset, truncated onward headings, and index rank overlap/nested vertical scrolling. These were corrected and reviewed in the next image set. German title casing uses explicit presentation mappings, preserving unknown canonical titles.

Run `35449799501` passed 227 existing tests, the 39,223-file preservation gate, the Pages release compiler, 163 Chromium checks across 320/390/1440 light/dark, and 29 mobile WebKit checks. It produced 77 screenshots. Root and specialist visual review covered home, distinct worlds, feed/resume, stock, fundamentals and onward discovery. The initial screenshot timeout was traced to bounding boxes counting artwork clipped outside its scroll container; readiness now uses actual intersection and retains a failing diagnostic gate for genuinely visible unloaded artwork.

Final commit verification, release and live smoke evidence are recorded in pull request #119. The five-second gate is an automated first-screen heuristic, not an independent participant test; WebKit is not a physical iPhone. A Saturday run cannot establish receipt of a regular-session realtime trade. Retention and return frequency require subsequent usage evidence.
