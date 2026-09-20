# Phase 18 — explicit route and render recovery

Base PR80 d216ebb6e4f06707283c91bc8e5372e2b556f607. Active Master §§42,55,64–65,67,91: honest unavailable state, preserved navigation and meaningful recovery. No new audit/research.

Owned: vu2/experience.js, existing browser QA, execution documentation. No data or metric contract change.

Unknown view now produces an explicit not-found page before data loading, instead of silently showing a Home-like fallback. A rejected render clears partial content and offers retry, Research and Home while preserving the shell. No production mock or synthetic data fallback.

Acceptance: unknown route -> one honest heading -> Research on desktop/mobile; existing41 checks preserved,45 total. Syntax and diff checks targeted, remote browser and screenshot gate required. A test-only rejected Home product promise verifies clearing partial content and retry after source recovery. This boundary covers rejected render promises, not missing initial application scripts or service outages that already have their own typed product states.

Rollback: revert additive route/recovery handling. No storage or deployment changes.
