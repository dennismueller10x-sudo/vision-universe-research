# Higgsfield video integration

This directory adds an isolated production option. It does not modify or replace existing video systems. On the current `main` branch checked on 2026-10-14, `brand-media/`, a HeyGen integration, HyperFrames configuration, and `.gitattributes` were not present at repository root; the new files therefore establish a separate namespace. Re-audit branches or later work before merging if another production branch adds these assets.

## Evidence and model registry

`registry.json` records capabilities documented by Higgsfield, with source links next to each model. Kling 3.0 Standard, Seedance 2.0, Seedance 2.5, and Wan 3.0 have documented video workflows. Registry entries do not prove that the connected account is entitled to each model. No public API operation to enumerate an account's available models is documented in the shared API docs.

The documented estimate endpoint is `POST https://api.higgsfield.ai/estimate/<model-endpoint-id>`. For the connected account, previous responses did not include the numeric `usd` and `credits` fields expected by the parser. The explicitly authorized Wan production path therefore does not call the estimate endpoint or apply a numeric estimate threshold. The paid generation submission itself is the only way in this workflow to learn whether the provider accepts the account/order; there is no separate balance preflight. Higgsfield does not document a hard spending ceiling on generation; the user's stated 10 USD balance is accepted as the risk for this single test, not a guaranteed billing cap.

## Workflow

`.github/workflows/brand-media-higgsfield.yml` has only `workflow_dispatch`, read-only contents permission, checkout pinned to trusted `main`, and a single concurrency group. The `discover` action prints the checked-in documentation registry without an API call. `estimate` makes one account-specific price query but submits no video. `produce` is restricted to the registered Wan 3.0 20-second, 1080p, 9:16 order: after the explicit no-estimate approval phrase it makes no price request and submits exactly one generation request. The provider may reject the submission if the account cannot fund it. This path has no numerical spending ceiling; the user's stated 10 USD balance is the accepted risk for this single test, not a guaranteed billing cap. A workflow rerun is rejected, and the API request uses a run-specific idempotency key. Reuse of the approval phrase on a separate new workflow dispatch is not technically prevented; the phrase is an explicit manual confirmation and the workflow implements no automatic retries or model fallbacks. The code makes no balance-top-up request; provider-side auto-recharge settings are outside repository control. The `status` action makes read-only status requests for an existing Wan request ID and downloads the MP4 if complete; it cannot estimate or submit a generation. The existing two-step `generate` action still checks the estimate against a prior reviewed quote. Native audio is enabled per order; the model's audio switch does not guarantee output contains only requested foley, so audio needs review. API errors, concurrency/rate limits, malformed responses, and downloads fail closed. Higgsfield documents account/model concurrency limits; concurrency exhaustion can return HTTP 400 and standard rate-limit headers are not documented.

`HIGGSFIELD_API_KEY` is used only as a job environment secret and is never emitted. A main-branch estimate run confirmed the secret is non-empty and reached an HTTP 2xx JSON response; its Seedance 2.5 result did not contain a usable documented `usd` and `credits` quote. The estimate parser reports only safe response field names when this occurs. The secret value itself is not readable through the GitHub integration.

For Wan 3.0 and Seedance 2.5 Image-to-Video, the only accepted reference is the original THE ARRIVAL master at `brand-media/higgsfield/references/the-arrival-final-master.jpg`, registered with SHA-256 `f447e8eb2a4a30b430978e407390fa9b611dba9002ab7bcfaa5fd027f67f02a1` and asset ID `vu-the-arrival-final-master-20261014`. The script verifies both the exact path and checksum before upload; alternate or historical references fail closed. The JPEG is stored byte-for-byte (1536×864, 16:9). Higgsfield's signed upload URL is never logged or persisted. Metadata records asset ID, repository path, SHA-256, model, prompt, and parameters. Completed MP4, preview MP4, and JSON metadata are retained as a 14-day workflow artifact; there is no social-platform upload step.

No price is estimated in the one-shot production path. Successful output metadata records `estimate: null` and `actual_cost: null`; this integration does not have a documented actual-cost response field. The run has no automatic retries or concurrent paid submissions. The no-estimate approval phrase is reusable across new dispatches; repository workflow state does not technically enforce one-time phrase consumption. Status retrieval is read-only and may be repeated without another paid generation submission.

## Local checks

Run the free standard-library tests with:

```sh
python -m unittest discover -s brand-media/higgsfield -p 'test_*.py' -v
```

These tests use mocked responses and do not contact Higgsfield or incur charges.

## Three-shot Wan text-to-video mode

The official Wan 3.0 text-to-video schema documents `POST /alibaba/wan-3.0/text-to-video`, 2–30 seconds, 480p/720p/1080p, 9:16, `generate_audio`, and `enable_thinking`. Source: <https://docs.higgsfield.ai/docs/models/wan-3/text-to-video.md>. The manual `produce-three` action accepts only Wan 3.0 text-to-video, 1080p, 9:16, native audio, and exactly three independent prompts. It submits 6s, 6s, and 8s jobs sequentially, without references, estimate calls, retries, parallel submissions, or model fallbacks. It requires `APPROVE-WAN-3.0-THREE-TEXT-TO-VIDEO-SHOTS` and rejects workflow reruns. Each request uses a run-and-shot idempotency key. The phrase is not consumed across distinct workflow dispatches, so a new manual dispatch can authorize another set. Provider billing has no repository-enforced ceiling; actual costs may not be returned, and native audio does not guarantee only the requested natural effects. If a job remains nonterminal after polling, its request ID is recorded in the manifest for read-only retrieval; no replacement generation is submitted. Independent text-only clips cannot guarantee identical human identity between shots.
