# Higgsfield video integration

This directory adds an isolated production option. It does not modify or replace existing video systems. On the current `main` branch checked on 2026-10-14, `brand-media/`, a HeyGen integration, HyperFrames configuration, and `.gitattributes` were not present at repository root; the new files therefore establish a separate namespace. Re-audit branches or later work before merging if another production branch adds these assets.

## Evidence and model registry

`registry.json` records capabilities documented by Higgsfield, with source links next to each model. Kling 3.0 Standard, Seedance 2.0, Seedance 2.5, and Wan 3.0 have documented video workflows. Registry entries do not prove that the connected account is entitled to each model. No public API operation to enumerate an account's available models is documented in the shared API docs.

The documented estimate endpoint is `POST https://api.higgsfield.ai/estimate/<model-endpoint-id>`. For the connected account, previous responses did not include the numeric `usd` and `credits` fields expected by the parser. The explicitly authorized Wan production path therefore does not call the estimate endpoint or apply a numeric estimate threshold. The paid generation submission itself is the only way in this workflow to learn whether the provider accepts the account/order; there is no separate balance preflight. Higgsfield does not document a hard spending ceiling on generation; the user's stated 10 USD balance is accepted as the risk for this single test, not a guaranteed billing cap.

## Workflow

`.github/workflows/brand-media-higgsfield.yml` has only `workflow_dispatch`, read-only contents permission, checkout pinned to trusted `main`, and a single concurrency group. The `discover` action prints the checked-in documentation registry without an API call. `estimate` makes one account-specific price query but submits no video. `produce` is restricted to the registered Wan 3.0 20-second, 1080p, 9:16 order: after the explicit no-estimate approval phrase it makes no price request and submits exactly one generation request. The provider may reject the submission if the account cannot fund it. This path has no numerical spending ceiling; the user's stated 10 USD balance is the accepted risk for this single test, not a guaranteed billing cap. A workflow rerun is rejected, and the API request uses a run-specific idempotency key. Reuse of the approval phrase on a separate new workflow dispatch is not technically prevented; the phrase is an explicit manual confirmation and the workflow implements no automatic retries or model fallbacks. The code makes no balance-top-up request; provider-side auto-recharge settings are outside repository control. The `status` action makes read-only status requests for an existing Wan request ID and downloads the MP4 if complete; it cannot estimate or submit a generation. The existing two-step `generate` action still checks the estimate against a prior reviewed quote. Native audio is enabled per order; the model's audio switch does not guarantee output contains only requested foley, so audio needs review. API errors, concurrency/rate limits, malformed responses, and downloads fail closed. Higgsfield documents account/model concurrency limits; concurrency exhaustion can return HTTP 400 and standard rate-limit headers are not documented.

`HIGGSFIELD_API_KEY` is used only as a job environment secret and is never emitted. A main-branch estimate run confirmed the secret is non-empty and reached an HTTP 2xx JSON response; its Seedance 2.5 result did not contain a usable documented `usd` and `credits` quote. The estimate parser reports only safe response field names when this occurs. The secret value itself is not readable through the GitHub integration.

For Seedance 2.5 Image-to-Video, the only accepted reference remains the original THE ARRIVAL master at `brand-media/higgsfield/references/the-arrival-final-master.jpg`, registered with SHA-256 `f447e8eb2a4a30b430978e407390fa9b611dba9002ab7bcfaa5fd027f67f02a1` and asset ID `vu-the-arrival-final-master-20261014`. Wan 3.0 Image-to-Video accepts only SHA-256-verified references listed in that model's `approved_production_references`: the original master and a single frame extracted from Video 1 at `brand-media/higgsfield/references/the-arrival-video1-frame-18.png` (1080×1920, SHA-256 `5c98f66dc23b0261f232f7c208372c576184d3697a9f594ded1e672bed83f54a`, asset ID `vu-the-arrival-video1-frame-18-20261020`). The frame is a direct PNG extraction at 00:00:18.000 from `/THE ARRIVAL – Original.mp4`; no new image was generated. The script verifies the selected path and checksum before upload; unregistered references fail closed. The original JPEG master remains byte-for-byte unchanged. Higgsfield's signed upload URL is never logged or persisted. Metadata records asset ID, repository path, SHA-256, model, prompt, and parameters. Completed MP4, preview MP4, and JSON metadata are retained as a 14-day workflow artifact; there is no social-platform upload step.

No price is estimated in the one-shot production path. Successful output metadata records `estimate: null` and `actual_cost: null`; this integration does not have a documented actual-cost response field. The run has no automatic retries or concurrent paid submissions. The no-estimate approval phrase is reusable across new dispatches; repository workflow state does not technically enforce one-time phrase consumption. Status retrieval is read-only and may be repeated without another paid generation submission.

## Local checks

Run the free standard-library tests with:

```sh
python -m unittest discover -s brand-media/higgsfield -p 'test_*.py' -v
```

These tests use mocked responses and do not contact Higgsfield or incur charges.

## Three-shot Wan text-to-video mode

The official Wan 3.0 text-to-video schema documents `POST /alibaba/wan-3.0/text-to-video`, 2–30 seconds, 480p/720p/1080p, 9:16, `generate_audio`, and `enable_thinking`. Source: <https://docs.higgsfield.ai/docs/models/wan-3/text-to-video.md>. The manual `produce-three` action accepts only Wan 3.0 text-to-video, 1080p, 9:16, native audio, and exactly three independent prompts. It submits 6s, 6s, and 8s jobs sequentially, without references, estimate calls, retries, parallel submissions, or model fallbacks. It requires `APPROVE-WAN-3.0-THREE-TEXT-TO-VIDEO-SHOTS` and rejects workflow reruns. Each request uses a run-and-shot idempotency key. The phrase is not consumed across distinct workflow dispatches, so a new manual dispatch can authorize another set. Provider billing has no repository-enforced ceiling; actual costs may not be returned, and native audio does not guarantee only the requested natural effects. If a job remains nonterminal after polling, its request ID is recorded in the manifest for read-only retrieval; no replacement generation is submitted. Independent text-only clips cannot guarantee identical human identity between shots.

The manual `produce-single-t2v` action supports one continuous text-to-video order: exactly 20 seconds, 1080p, 9:16, native audio, and no reference image or asset ID. It requires `APPROVE-WAN-3.0-SINGLE-CONTINUOUS-T2V-NO-ESTIMATE`, skips estimate calls, rejects workflow reruns, and submits one request with a run-specific idempotency key. Its manifest records the request ID immediately after submission, including when the provider job is still processing. The action never retries, changes models, or requests a top-up. The approval phrase is not consumed across separate manual dispatches; each new dispatch is a distinct paid authorization. The provider decides whether the account can accept the request, and this workflow does not impose a billing ceiling or guarantee the actual cost is returned. The generated original and JSON manifest are uploaded as the workflow artifact; a compressed preview can be made from the original after download.

## Image jobs

`images.py` and `.github/workflows/brand-media-higgsfield-images.yml` generate still images, for example character drafts and pose sheets for HyperFrames compositions. They share the client, secret handling and concurrency group with the video path but do not change it.

A job is a reviewed JSON file in `image-jobs/` with a `job_id`, a `purpose` and 1–12 `images`. Each image names one model and only the fields that model documents (schemas from docs.higgsfield.ai, checked 2026-10-28):

| `model` | Endpoint | References | Extra fields |
|---|---|---|---|
| `recraft-v4.1` | `recraft/v4.1/text-to-image` (1k) | none | `colors`, `background_color`, `output_format` |
| `recraft-v4.1-pro` | `recraft/v4.1/pro/text-to-image` (2k) | none | `colors`, `background_color`, `output_format` |
| `grok-image-2` | `xai/grok-imagine-image-2.0` (1k/2k) | 0–10 | `quality` |
| `qwen-image-3` | `alibaba/qwen-image-3/text-to-image` (1k/2k) | none | `seed`, `negative_prompt` |
| `qwen-image-3-edit` | `alibaba/qwen-image-3/edit` (1k/2k) | 1–3 | `seed`, `negative_prompt` |

Unknown fields fail the job. References are PNG/JPEG paths under `brand-media/`. Qwen prompt rewriting is switched off so the character description stays as written.

Actions:

- `validate` checks the job file without an API call.
- `estimate` uploads references and asks the estimate endpoint for every image. The documented response is `{"usd": "…"}`; a missing value is reported as unknown, never as zero.
- `generate` needs `budget_usd` and `APPROVE-HIGGSFIELD-IMAGE-JOB`. It blocks when the summed estimate exceeds the budget. If the provider returns no price, only `APPROVE-HIGGSFIELD-IMAGE-JOB-WITHOUT-ESTIMATE` lets it continue. Images are submitted once each, sequentially, with run-specific idempotency keys and no retries; reruns are blocked. Images, `manifest.json` and a `contact-sheet.jpg` are kept as a 14-day workflow artifact. Nothing is published.

Local check: `python brand-media/higgsfield/images.py --action validate --job brand-media/higgsfield/image-jobs/<job>.json`.
