# Phase 23 — existing-view accessibility validation

Continues outstanding Master83/91/98 accessibility requirements within phase14–15 final validation. No Research reread/new product scope. Base PR85 head9537b0808a71c956d901c3c39810b3e67f5fc9a4. Current main e91095c documentation-only delta integrated unchanged.

Affected contracts: browser QA only, isolated pinned axe-core4.10.3 alongside existing Playwright1.58.2. No production bundle dependency, provider, SEC, metric, entitlement or UI change initially.
Owned files: .github/workflows/vu2-browser-qa.yml, scripts/vu2/browser-qa.mjs, phase/ledger documents; docs/VU_BUILD_STATUS.md imported unchanged from main.

Acceptance: preserve45 existing browser checks; scan16 existing VU2 pages at1440/390 after their interactions. Record all detected WCAG2.1A/AA violations and incomplete/manual checks in accessibility.json. Fail new gate on any detected violation, retaining report before failure. Do not treat automated checks as complete accessibility certification or substitute for blocked PR85 screenshot inspection. Repair actual findings within existing views only if required, with no rule suppression to make gate green.

Tests: node syntax and git diff checks during implementation; existing Actions browser gate plus32 automatic accessibility scans. No provider/full-universe or unrelated full regression. Rollback additive QA changes; production unchanged. Manual screen-reader and visual evidence remain separate requirements.
