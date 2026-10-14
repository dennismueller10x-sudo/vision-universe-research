# Higgsfield video integration

This directory adds an isolated production option. It does not modify or replace existing video systems. On the current `main` branch checked on 2026-10-14, `brand-media/`, a HeyGen integration, HyperFrames configuration, and `.gitattributes` were not present at repository root; the new files therefore establish a separate namespace. Re-audit branches or later work before merging if another production branch adds these assets.

## Evidence and model registry

`registry.json` records capabilities documented by Higgsfield, with source links next to each model. Kling 3.0 Standard, Seedance 2.0, Seedance 2.5, and Wan 3.0 have documented video workflows. Registry entries do not prove that the connected account is entitled to each model. No public API operation to enumerate an account's available models is documented in the shared API docs.

The exact estimate endpoint is `POST https://api.higgsfield.ai/estimate/<model-endpoint-id>`. The authenticated estimate includes USD and credits and is the documented account-specific price source. The integration blocks absent, malformed, or over-budget estimates. Higgsfield does not document a hard spending ceiling on generation; budget enforcement therefore governs the returned estimate and must not be represented as a guaranteed cap on eventual billing.

## Workflow

`.github/workflows/brand-media-higgsfield.yml` has only `workflow_dispatch`, read-only contents permission, checkout pinned to trusted `main`, and a single concurrency group. The `discover` action prints the checked-in documentation registry without an API call. `estimate` makes one account-specific price query but submits no video. `produce` is restricted to the registered Wan 3.0 20-second, 1080p, 9:16 order: it makes exactly one estimate call, stops if the documented USD quote exceeds 10.00, and submits at most one generation when the explicit one-shot approval phrase is present. The 10.00 USD threshold is an estimate gate, not a guaranteed billing ceiling; this one-shot approval accepts the risk that up to the user's 10 USD available account balance may be consumed. Reruns of that workflow run are blocked. The existing two-step `generate` action still checks the estimate against a prior reviewed quote. Native audio is enabled per order; the model's audio switch does not guarantee that output contains only requested foley, so audio needs review. API errors, concurrency/rate limits, malformed responses, and downloads fail closed. Higgsfield documents account/model concurrency limits; concurrency exhaustion can return HTTP 400 and standard rate-limit headers are not documented.

`HIGGSFIELD_API_KEY` is used only as a job environment secret and is never emitted. A main-branch estimate run confirmed the secret is non-empty and reached an HTTP 2xx JSON response; its Seedance 2.5 result did not contain a usable documented `usd` and `credits` quote. The estimate parser reports only safe response field names when this occurs. The secret value itself is not readable through the GitHub integration.

For Wan 3.0 and Seedance 2.5 Image-to-Video, the only accepted reference is the original THE ARRIVAL master at `brand-media/higgsfield/references/the-arrival-final-master.jpg`, registered with SHA-256 `f447e8eb2a4a30b430978e407390fa9b611dba9002ab7bcfaa5fd027f67f02a1` and asset ID `vu-the-arrival-final-master-20261014`. The script verifies both the exact path and checksum before upload; alternate or historical references fail closed. The JPEG is stored byte-for-byte (1536×864, 16:9). Higgsfield's signed upload URL is never logged or persisted. Metadata records asset ID, repository path, SHA-256, model, prompt, and parameters. Completed MP4, preview MP4, and JSON metadata are retained as a 14-day workflow artifact; there is no social-platform upload step.

No pricing claim is hard-coded. A successful run records the API estimate and output metadata; the run has no automatic retries or concurrent paid submissions.

## Local checks

Run the free standard-library tests with:

```sh
python -m unittest discover -s brand-media/higgsfield -p 'test_*.py' -v
```

These tests use mocked responses and do not contact Higgsfield or incur charges.
