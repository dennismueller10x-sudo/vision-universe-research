# Tiingo 2.0 finalization — current-baseline safety stop

## Current publish-path assessment (2026-10-03)

The current-main productization preview is read-only. Its final QA manifest and
private history source remain on the preview runner; only derived JSON is
exported. The existing HistoryStore sync writes the full universe, while the
Tiingo 2.0 scoped history preflight has no writer. The canonical apply API has
no production workflow caller. Pages deploys Git-tracked main without a Tiingo 2.0
index activation barrier. A merge could therefore expose a chart-ready title
before its R2 index entry is active. Publication remains blocked; no production
write was made by this assessment. The exact handoff, CAS and rollback
requirements are in [tiingo2_current_publish_blocker.json](tiingo2_current_publish_blocker.json).

The historical observations below describe the earlier Foundation integration
and must not be treated as a current production package.

The live Pages release currently reports source `33e0938fadd4c035002631d537e363bb9017ffd4`, while repository `main` advanced to `41d1381c5bbe3725d817d0bb7878ab2ebbe1d710` with independent SuperTrader work. The delivered eligibility and repository membership still agree at 7,803 raw, 6,853 product and **6,397 consumer** titles. PR #366 intentionally excluded 22 named debt listings; no security IDs changed. Applying the old 113-title set would yield **6,510**, not the previously proposed 6,532. The latest authenticated Tiingo staging run (`37114183148`) proposes **104** candidate additions and 6,501 consumer titles before product materialization; eleven older additions moved back to review, while VYLR and CHWM newly passed candidate checks. Neither set is approved for publication. No publication, membership removal or production storage write was performed by this finalization verification.

## Foundation merge preparation

Three conflicts between accepted PR #349 and current main were resolved by preserving both sides: current DEBT/schema 1.3.0 and total-return contracts, plus accepted Tiingo classification, split and ex-close dividend semantics. Independent classifier rules advance to 1.3.3 so old discovery classifications cannot silently reuse caches missing the debt or ADR spelling rules. Known Tiingo daily, benchmark, repair and delisted-history readers explicitly forward the provider convention; generic contract defaults and explicit caller overrides remain unchanged. Split plus dividend on the same day is tested without allowing missing cash adjustment. Only the derived delisted weekly-bundle cache version advances; existing historical series and study artifacts remain untouched.

The later SuperTrader main update changed 24 files and merged into the Foundation with zero conflicts. All new SuperTrader files remain byte-identical to current main; the Foundation's ten reviewed canonical metadata/search paths are the only protected file differences against it. The old #353 package still mismatches 7,509 of 10,014 files on current main; those 24 SuperTrader changes do not overlap its file manifest.

Current main had three SEC CI failures from comparing unchanged September coverage evidence with the newer membership. The contract tests now strictly distinguish the historical 6,875 members/6,871 charts/5,884 technical titles from current 6,853/6,849/5,876. All four historical chart exceptions (GLMD, BNRG, BRTM, JAB) remain present; 6,850 was unsupported. Every removed row must be one of the 22 explicit DEBT exclusions with unchanged canonical IDs. The native reconciliation must continue to report `reconciled: false` and exact explained differences; historical measurements are not regenerated or relabeled as current.

The native browser journey check previously expected a measured pattern denominator for AAAP even though the shipped typed pattern artifact says `NO_WEEKLY_SERIES`. It now accepts the exact honest unavailable text only for that typed state; a fabricated denominator fails. The native company-master rebuild also exposed two stale metadata rows. PFBC's issuer name “Preferred Bank” is not evidence of a preferred share, while AAPGV's “American Depository Shares” is explicit ADR evidence. Their native regenerated instrument and search rows preserve IDs and membership. A paired native factor replay showed that correcting PFBC would increase the factor evidence cohort from 6,288 to 6,289. Normalization or peer-size fields change on 5,977 existing rows; score/percentile fields change on 5,875, by at most 0.02 points. The factor artifacts were restored after that diagnostic; no existing Quant output was silently republished. This population change needs review in the current-baseline product materialization gate.

CHWM's ADR form became classifiable in the final staging run, but its two daily bars do not satisfy the existing product projection's five-bar chart minimum. The staging chart-readiness flag now requires five actual bars and carries `INSUFFICIENT_CHART_HISTORY` for shorter valid listings. Membership, Search and Watchlist candidate readiness can remain true; delivered projections and their independent publication gates remain mandatory.

## Production publication remains blocked

The old authenticated package is bound to the previous production bytes. Current eligibility, capability, factor, logo and Discover hashes differ, and PR #353 has thousands of merge-conflicted generated paths against current main. Resolving generated artifacts by choosing an old side would overwrite newer production data. A fresh current-baseline materialization, exact protected comparison, eligibility/readiness checks and complete QA are required before that PR can merge or publish. The old 113-title readiness certificate remains a staging reference, not a live production result. The latest 104-title staging set has candidate data checks only; it has no canonical product projection or readiness certificate.

The existing final-package workflow is a QA/encryption workflow with no production apply step. The canonical apply/rollback APIs support exact local-file CAS and before-images. The legacy history-store-sync workflow does not consume the authenticated 113-title history intent, and its storage/index writer lacks the required absent-only history writes and conditional index CAS. It must not be used as an unguarded substitute. No special publisher, routing change, provider replacement or new architecture was introduced.

Vercel reports an external 24-hour build-rate limit on the Foundation preview. The live research app presents its existing login gate, so authenticated live Search/Chart/Watchlist/product checks were not certified. Public release and membership checks are read-only and valid; no authentication gate was bypassed.

The weekday 08:20 UTC staging workflow is active in GitHub but is not yet on main. Scheduled execution activates only when the Foundation workflow reaches the default branch. A new-production `NO_CHANGES` claim and a rollback certificate for 6,397 current titles are not inferred from the earlier 6,419 review-package proofs.

The machine-readable baseline report contains the exact 22 exclusions, all 113 proposed additions, preserved IDs and explicit publication blockers. Merge and publication decisions must be based on current checks, not the preceding review-branch certificate.
