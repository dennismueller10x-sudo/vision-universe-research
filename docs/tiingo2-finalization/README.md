# Tiingo 2.0 finalization — current-baseline safety stop

Observed production source: `268d4c89750ac682a0acc2f6ddbb7b5143fb2959` (2026-10-03). Both the public release-delivery certificate and delivered eligibility source identify this production baseline. It has 7,803 raw, 6,853 product and **6,397 consumer** members. PR #366 intentionally excluded 22 named debt listings; no security IDs changed. With the same 113 proposed additions the arithmetic result would be **6,510**, not the previously proposed 6,532. None of those additions is already present. No publication, membership removal or production storage write was performed by this finalization verification.

## Foundation merge preparation

Three conflicts between accepted PR #349 and current main were resolved by preserving both sides: current DEBT/schema 1.3.0 and total-return contracts, plus accepted Tiingo classification, split and ex-close dividend semantics. Independent classifier rules advance to 1.3.2 so old discovery classifications cannot silently reuse caches missing the debt rules. Known Tiingo daily, benchmark, repair and delisted-history readers explicitly forward the provider convention; generic contract defaults and explicit caller overrides remain unchanged. Split plus dividend on the same day is tested without allowing missing cash adjustment. Only the derived delisted weekly-bundle cache version advances; existing historical series and study artifacts remain untouched.

Current main had three SEC CI failures from comparing unchanged September coverage evidence with the newer membership. The contract tests now strictly distinguish the historical 6,875 members/6,871 charts/5,884 technical titles from current 6,853/6,849/5,876. All four historical chart exceptions (GLMD, BNRG, BRTM, JAB) remain present; 6,850 was unsupported. Every removed row must be one of the 22 explicit DEBT exclusions with unchanged canonical IDs. The native reconciliation must continue to report `reconciled: false` and exact explained differences; historical measurements are not regenerated or relabeled as current.

## Production publication remains blocked

The old authenticated package is bound to the previous production bytes. Current eligibility, capability, factor, logo and Discover hashes differ, and PR #353 has 7,513 merge-conflicted paths against this baseline. Resolving generated artifacts by choosing an old side would overwrite newer production data. A fresh current-baseline materialization, exact protected comparison, eligibility/readiness checks and complete QA are required before that PR can merge or publish. The old 113-title readiness certificate remains a staging reference, not a live production result.

The existing final-package workflow is a QA/encryption workflow with no production apply step. The canonical apply/rollback APIs support exact local-file CAS and before-images. The legacy history-store-sync workflow does not consume the authenticated 113-title history intent, and its storage/index writer lacks the required absent-only history writes and conditional index CAS. It must not be used as an unguarded substitute. No special publisher, routing change, provider replacement or new architecture was introduced.

The latest Vercel status for the old #353 commit still reports its preview rate limit; current main has a successful Vercel deployment. The live research app presents its existing login gate, so authenticated live Search/Chart/Watchlist/product checks were not certified. Public release and membership checks are read-only and valid; no authentication gate was bypassed.

The weekday 08:20 UTC staging workflow is active in GitHub but is not yet on main. Scheduled execution activates only when the Foundation workflow reaches the default branch. A new-production `NO_CHANGES` claim and a rollback certificate for 6,397 current titles are not inferred from the earlier 6,419 review-package proofs.

The machine-readable baseline report contains the exact 22 exclusions, all 113 proposed additions, preserved IDs and explicit publication blockers. Merge and publication decisions must be based on current checks, not the preceding review-branch certificate.
