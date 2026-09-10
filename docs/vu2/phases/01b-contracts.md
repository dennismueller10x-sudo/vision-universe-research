# Phase 1b — existing market metric registry and product boundary

Active: Master §§37–42,60,67,68; R1 one definition / many consumers; R3 versioned contracts and no mock fallback.
Relevant excerpts: “Ein Wert. Eine Definition. Viele Consumer.” / “Providerwissen endet im Adapter.”
Affected contracts: observed market-factors-1.0.0 outputs only. Do not change existing calculations or claim legacy factor equivalence. New product view accepts canonical feature snapshots, explicit provenance and a display-policy decision. It performs no provider fetch or new financial calculation.
Files: new quant/engines/market-metric-registry.js, quant/api/intelligence-contract.js, targeted contract tests. Existing engines and SEC stay untouched.
Acceptance: one owner/version/input/unit/time/adjustment/missing/PIT/cadence/UX/method per registered metric; dependency selection without recompute; no synthetic fallback, no future snapshot, no NaN/Infinity/undefined numeric values; zero and false remain real values; unknown engine version fails closed; denied display exposes no values; current-state view never claims historical PIT eligibility.
Tests: deterministic engine fixtures → view identity; malformed/future/mock/denied snapshots; legacy units remain separate; read-only Golden-Five engine compatibility. No provider requests, scale rerun or public data publication.
Gate boundaries: registry begins with existing market family; fundamental/technical ownership migration remains pending. No production UI rollout from these internal additive contracts.
