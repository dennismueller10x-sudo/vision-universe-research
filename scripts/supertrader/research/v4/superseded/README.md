# V4.0 – superseded before any result

* Freeze `V4-bbc5fbdc5a12d978` was built and pushed in run 38719285932 (commit 55f2b601c65).
* The measuring job failed closed before any computation: `CANONICAL_CONTENT_DIFFERS_FROM_FREEZE:normalizedInputsSha256`.
  Its second capture (in a separate job, about 10 minutes later) produced identical price parts and manifest, but different
  provenance-input metadata (non-price store objects changed in between). No construction, comparison or book ran;
  no summary or sealed result exists.
* Before any result existed, the independent adversarial review (R1–R17, see `SUPERTRADER-V4-ADVERSARIAL-FINDINGS.json`,
  section `v4IndependentReview`) found HIGH issues. All fixes were committed as V4.1 before the V4.1 freeze;
  V4.1 freezes and measures on one capture in one job.
* The V4.0 files are kept unchanged here as evidence (moved, not edited).
