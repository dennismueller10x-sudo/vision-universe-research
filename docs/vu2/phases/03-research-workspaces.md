# Active phase — Historical Fundamentals and professional journeys

Accepted base: PR64 head d0f12b84253bdc843f277e5619f74b848471515e, same tree as local3c6fb95. Main still533245e8bb1b805c24c1ce9ba2051345ad215e24 after fetch. Separate worktree ../vu2-research-workspaces, branch workstream/vu2-research-workspaces. PR65 EOD gate remains independent; remote Quant34477744961 and SEC34477745020 SUCCESS.

Requirements: Master7/20/21/39/42/48/55/65/79/97; Research2 meaning → evidence → workspace. No repeated audit or full research reread. Preserve existing SEC inspector and full Technical/Elliott workspace.

Affected contract: current SEC inspector latest_known payload, normalization_schema1.0.0; owner remains SEC workstream. Add presentation contract only, no new financial calculation. Exactly reported or pre-derived values, actual start/end, filing and availability timestamps. No PIT/backtest eligibility. Quarterly filings can contain YTD cashflows; label explicitly and preserve their interval. TTM unavailable until a validated series exists.

Affected files: new quant/api/fundamentals-contract.js, product-services.js, vu2 experience, chart renderer width/label density, focused tests and existing browser workflow. No SEC-owned files edited.

Acceptance: all displayed facts have validated identity, dates, units, quality and provenance; invalid/future facts yield typed missing values; duplicate periods fail closed; original exact numbers preserved; annual/quarterly selector and ticker/metric navigation work at390px and1440px; new Fundamentals access from Stock/Research; all existing directory links respond; full Elliott chart/scenarios/alternative interaction still works.

Validation: targeted contract/service tests; existing Actions browser with screenshots and journey checks. No full-universe/provider rerun. Rollback: remove the additive route/service and restore prior inspector links; existing inspector untouched.

Status: implementation in progress; visual gate pending new route screenshots.

## Review and visual iteration
Initial Browser34485242919 PASS for24 view/width journeys (including full Elliott). All research directory destinations respond. Inspected Fundamentals1440 and390 viewport, Elliott390 full page. Mobile controls condensed to two rows so the historical chart moves higher.
Adversarial review identified ambiguous derived-quarter intervals, empty XOM ticker metadata and acceptance-before-official-filing compatibility. Repairs: only AS_REPORTED quarterly values render; ambiguous derived rows remain unavailable with reason; index-bound exact CIK accepts an empty ticker list; original acceptance timestamp retained in UI. Existing canonical.py and normalize.py explicitly describe acceptance preceding effective filing date. No SEC changes. Six focused history-contract and11 product-service tests PASS (17 total); independent re-review PASS with no remaining critical/high finding. TTM and ambiguous transformed quarters remain bounded dependencies.
