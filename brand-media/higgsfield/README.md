# Higgsfield video integration

This directory adds an isolated production option. It does not modify or replace existing video systems. On the current `main` branch checked on 2026-10-14, `brand-media/`, a HeyGen integration, HyperFrames configuration, and `.gitattributes` were not present at repository root; the new files therefore establish a separate namespace. Re-audit branches or later work before merging if another production branch adds these assets.

## Evidence and model registry

`registry.json` records capabilities documented by Higgsfield, with source links next to each model. Kling 3.0 Standard, Seedance 2.0, and Seedance 2.5 have documented video workflows. The docs advertise Seedance 2.5; it is not inferred from a price card. The registry is documentation-derived, not proof that a connected account is entitled to each model. The official console is the model catalog; no public API operation to enumerate an account's available models is documented in the shared API docs.

The exact estimate endpoint is `POST https://api.higgsfield.ai/estimate/<model-endpoint-id>`. The authenticated estimate includes USD and credits and is the documented account-specific price source. The integration blocks absent, malformed, or over-budget estimates. Higgsfield does not document a hard spending ceiling on generation; budget enforcement therefore governs the returned estimate and must not be represented as a guaranteed cap on eventual billing.

## Workflow

`.github/workflows/brand-media-higgsfield.yml` has only `workflow_dispatch`, read-only contents permission, checkout pinned to trusted `main`, and a single concurrency group. The `discover` action prints the checked-in documentation registry without an API call. `estimate` makes the account-specific price estimate but submits no video. For paid work, first run `estimate`, review the actual USD/credits against the approved budget, then start a separate `generate` dispatch and enter the exact prior estimate plus `APPROVE-ONE-PAID-GENERATION`. The current estimate must exactly match the prior approved amount and remain under budget or submission stops. There are no generation retries or model fallbacks. API errors, 429 rate limits, malformed responses, and downloads fail closed.

`HIGGSFIELD_API_KEY` is used only as a job environment secret. The code treats it as the complete copied credential and adds `Authorization: Key `, following the current quickstart. The shared authentication page also contains older examples referring to key ID/secret pairs; this documentation discrepancy must be reconciled against the actual repository secret before first use. Secret presence cannot be read through the GitHub integration available here, and no authenticated request was made. The workflow will fail safely if the secret is absent or malformed.

For reference frames, each order supplies an explicit path under the checked-out repository. The selected image is uploaded through Higgsfield's signed upload workflow; its signed URL is never logged or persisted. Metadata records asset ID, repository path, SHA-256, model, prompt, and parameters. No reference image is selected by default. Add the approved Loft master image and explicitly select it in a future dispatch. Completed MP4/JSON artifacts are retained for 14 days and can be used by a later HyperFrames assembly; there is no social-platform upload step.

No pricing claim is hard-coded. A successful run records the API estimate and output metadata; the run has no automatic retries or concurrent paid submissions.

## Local checks

Run the free standard-library tests with:

```sh
python -m unittest discover -s brand-media/higgsfield -p 'test_*.py' -v
```

These tests use mocked responses and do not contact Higgsfield or incur charges.
