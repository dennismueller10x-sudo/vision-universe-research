"""Conservative Higgsfield REST client. Python standard library only."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path

BASE_URL = "https://api.higgsfield.ai"
REGISTRY_PATH = Path(__file__).with_name("registry.json")
TERMINAL = {"completed", "failed", "nsfw", "canceled"}
APPROVAL_PHRASE = "APPROVE-ONE-PAID-GENERATION"
WAN_APPROVAL_PHRASE = "APPROVE-WAN-3.0-ONE-GENERATION-NO-ESTIMATE"
WAN_THREE_SHOTS_APPROVAL_PHRASE = "APPROVE-WAN-3.0-THREE-TEXT-TO-VIDEO-SHOTS"
WAN_SINGLE_T2V_APPROVAL_PHRASE = "APPROVE-WAN-3.0-SINGLE-CONTINUOUS-T2V-NO-ESTIMATE"
WAN_I2V_SHOT_APPROVAL_PHRASE = "APPROVE-WAN-3.0-I2V-SHOT-NO-ESTIMATE"
WAN_I2V_SHOT_DURATION = (3, 15)


class HiggsfieldError(RuntimeError):
    pass


def registry():
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def get_model(model_id):
    for model in registry()["models"]:
        if model["model_id"] == model_id:
            return model
    raise HiggsfieldError("Invalid model ID")


def validate(model, operation, prompt, duration, resolution, aspect_ratio, reference_path=None):
    endpoints = model["operations"]
    if operation not in endpoints:
        raise HiggsfieldError("Unsupported operation for model")
    if not isinstance(prompt, str) or not prompt.strip():
        raise HiggsfieldError("Prompt is required")
    limits = model["duration_seconds"]
    if isinstance(duration, bool) or not isinstance(duration, int) or not limits["min"] <= duration <= limits["max"]:
        raise HiggsfieldError("Invalid video duration")
    supported_resolutions = model["resolutions"]
    if resolution and (not supported_resolutions or resolution not in supported_resolutions):
        raise HiggsfieldError("Unsupported resolution")
    ratios = model["aspect_ratios"]
    if aspect_ratio and aspect_ratio not in ratios:
        raise HiggsfieldError("Unsupported aspect ratio")
    if operation in {"image_to_video", "reference_to_video"}:
        if not reference_path or not Path(reference_path).is_file():
            raise HiggsfieldError("Reference image file is missing")
        candidate = Path(reference_path)
        if candidate.is_absolute() or ".." in candidate.parts:
            raise HiggsfieldError("Reference path must stay inside the checked-out repository")
        approved_references = model.get("approved_production_references")
        approved = model.get("approved_production_reference")
        if approved_references and operation == "image_to_video":
            approved = next((item for item in approved_references if candidate.as_posix() == item["path"]), None)
            if approved is None:
                raise HiggsfieldError("Image-to-video accepts only a registered production reference")
            digest = hashlib.sha256(candidate.read_bytes()).hexdigest()
            if digest != approved["sha256"]:
                raise HiggsfieldError("Registered production reference checksum mismatch")
        elif approved and operation == "image_to_video":
            if candidate.as_posix() != approved["path"]:
                raise HiggsfieldError("Image-to-video accepts only the registered THE ARRIVAL master reference")
            digest = hashlib.sha256(candidate.read_bytes()).hexdigest()
            if digest != approved["sha256"]:
                raise HiggsfieldError("Registered master reference checksum mismatch")
    return endpoints[operation]


def safe_metadata(value, secret=None):
    """Fail closed if common secret-bearing fields or credential patterns leak."""
    encoded = json.dumps(value, sort_keys=True)
    if (secret and secret in encoded) or re.search(r"(?i)(api[_-]?key|secret|authorization|hf_credentials)\s*[:=]", encoded):
        raise HiggsfieldError("Refusing to write secret-bearing metadata")
    return value


class Client:
    def __init__(self, api_key, opener=None, timeout=45):
        if not api_key or not api_key.strip():
            raise HiggsfieldError("HIGGSFIELD_API_KEY is missing")
        # Store the complete copied credential as an opaque string; never emit it.
        self._authorization = "Key " + api_key.strip()
        self._opener = opener or urllib.request.urlopen
        self.timeout = timeout

    def _request(self, method, path, body=None, idempotency_key=None):
        url = BASE_URL + path
        headers = {"Authorization": self._authorization, "Accept": "application/json"}
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with self._opener(req, timeout=self.timeout) as resp:
                raw = resp.read()
                status = resp.status
        except urllib.error.HTTPError as exc:
            # Do not echo server response bodies or request headers: either could carry secrets.
            status = exc.code
            if status == 429:
                raise HiggsfieldError("Higgsfield rate limit; stopped without retry") from None
            raise HiggsfieldError(f"Higgsfield API returned HTTP {status}; stopped without retry") from None
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise HiggsfieldError(f"Higgsfield network failure ({type(exc).__name__}); stopped without retry") from None
        if not 200 <= status < 300:
            raise HiggsfieldError(f"Higgsfield API returned HTTP {status}; stopped without retry")
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HiggsfieldError("Higgsfield returned invalid JSON") from None

    def estimate(self, endpoint, params):
        response = self._request("POST", "/estimate/" + endpoint, params)
        try:
            if not isinstance(response, dict):
                raise TypeError
            amount = Decimal(str(response["usd"]))
            credits = str(response["credits"])
        except (KeyError, InvalidOperation, TypeError):
            names = sorted(k for k in response if isinstance(response, dict) and isinstance(k, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,40}", k)) if isinstance(response, dict) else []
            detail = ",".join(names) if names else "no top-level fields"
            raise HiggsfieldError(f"Malformed price estimate; expected documented usd and credits fields (received field names: {detail}); generation blocked") from None
        if amount < 0 or not amount.is_finite():
            raise HiggsfieldError("Malformed price estimate; generation blocked")
        return {"usd": str(amount), "credits": credits, "source": "authenticated estimate endpoint"}

    def upload_image(self, path, content_type=None):
        path = Path(path)
        if not path.is_file():
            raise HiggsfieldError("Reference image file is missing")
        content_type = content_type or ("image/png" if path.suffix.lower() == ".png" else "image/jpeg")
        signed = self._request("POST", "/files/generate-upload-url", {"content_type": content_type})
        try:
            upload_url = signed["upload_url"]
            upload_headers = signed.get("upload_headers", {})
            public_url = signed["public_url"]
        except (KeyError, TypeError):
            raise HiggsfieldError("Malformed signed upload response") from None
        parsed = urllib.parse.urlparse(upload_url)
        if parsed.scheme != "https" or not parsed.netloc or urllib.parse.urlparse(public_url).scheme != "https":
            raise HiggsfieldError("Invalid signed upload response")
        request = urllib.request.Request(upload_url, data=path.read_bytes(), headers=upload_headers, method="PUT")
        try:
            with self._opener(request, timeout=self.timeout) as resp:
                if not 200 <= resp.status < 300:
                    raise HiggsfieldError(f"Reference upload returned HTTP {resp.status}")
        except urllib.error.HTTPError as exc:
            raise HiggsfieldError(f"Reference upload returned HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise HiggsfieldError(f"Reference upload failed ({type(exc).__name__})") from None
        return public_url

    def submit(self, endpoint, params, idempotency_key=None):
        reply = self._request("POST", "/" + endpoint, params, idempotency_key=idempotency_key or str(uuid.uuid4()))
        try:
            request_id = reply["request_id"]
            status_url = reply["status_url"]
        except (KeyError, TypeError):
            raise HiggsfieldError("Malformed job submission response") from None
        if not isinstance(request_id, str) or not request_id or not isinstance(status_url, str):
            raise HiggsfieldError("Malformed job submission response")
        # Do not follow arbitrary provider-returned URLs with credentials.
        expected = f"{BASE_URL}/requests/{request_id}/status"
        if status_url.rstrip("/") != expected:
            raise HiggsfieldError("Unexpected job status URL")
        return request_id

    def status(self, request_id):
        if not re.fullmatch(r"[A-Za-z0-9-]+", request_id):
            raise HiggsfieldError("Invalid request ID")
        reply = self._request("GET", f"/requests/{request_id}/status")
        if not isinstance(reply, dict) or reply.get("status") not in TERMINAL | {"queued", "processing", "in_progress"}:
            raise HiggsfieldError("Malformed job status response")
        return reply

    def download(self, url, destination):
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or not parsed.netloc:
            raise HiggsfieldError("Invalid video download URL")
        # No Higgsfield auth header is sent to provider output storage.
        request = urllib.request.Request(url, headers={"Accept": "video/*"})
        try:
            with self._opener(request, timeout=self.timeout) as resp, open(destination, "wb") as out:
                if not 200 <= resp.status < 300:
                    raise HiggsfieldError(f"Video download returned HTTP {resp.status}")
                shutil.copyfileobj(resp, out)
        except urllib.error.HTTPError as exc:
            raise HiggsfieldError(f"Video download returned HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise HiggsfieldError(f"Video download failed ({type(exc).__name__})") from None


def enforce_cost(estimate_usd, budget_usd, action, approved_estimate_usd=""):
    try:
        amount = Decimal(str(estimate_usd))
        cap = Decimal(str(budget_usd))
    except (InvalidOperation, TypeError):
        raise HiggsfieldError("Invalid cost or budget amount; generation blocked") from None
    if not amount.is_finite() or amount < 0 or not cap.is_finite() or cap <= 0:
        raise HiggsfieldError("Budget exceeded or invalid; generation blocked")
    if amount > cap:
        raise HiggsfieldError("Budget exceeded or invalid; generation blocked")
    if action == "generate":
        try:
            approved = Decimal(str(approved_estimate_usd))
        except (InvalidOperation, TypeError):
            raise HiggsfieldError("A separately reviewed estimate is required") from None
        if approved != amount:
            raise HiggsfieldError("Current estimate differs from the separately approved estimate; generation blocked")
    return amount, cap


def retrieve_completed_job(args):
    """Read one existing job status and download its completed output; never submits work."""
    if args.model != "alibaba/wan-3.0":
        raise HiggsfieldError("Status retrieval is restricted to the approved Wan 3.0 job")
    if not re.fullmatch(r"[A-Za-z0-9-]+", args.request_id or ""):
        raise HiggsfieldError("Invalid request ID")
    model = get_model(args.model)
    client = Client(os.environ.get("HIGGSFIELD_API_KEY"))
    result = client.status(args.request_id)
    if result["status"] in {"queued", "processing", "in_progress"}:
        print(json.dumps({"request_id": args.request_id, "status": result["status"], "generation_submissions": 0}))
        return
    if result["status"] != "completed" or not isinstance(result.get("video"), dict) or not result["video"].get("url"):
        raise HiggsfieldError(f"Generation ended with status {result['status']}")

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    video_path = out / f"{args.request_id}.mp4"
    client.download(result["video"]["url"], video_path)
    approved = model.get("approved_production_reference", {})
    reference_path = Path(approved.get("path", ""))
    reference = None
    if reference_path.is_file():
        digest = hashlib.sha256(reference_path.read_bytes()).hexdigest()
        if digest != approved.get("sha256"):
            raise HiggsfieldError("Registered master reference checksum mismatch")
        reference = {"asset_id": approved.get("asset_id"), "path": approved["path"], "sha256": digest}
    metadata = safe_metadata({
        "request_id": args.request_id, "model_id": model["model_id"], "provider": model["provider"],
        "prompt": args.prompt, "seed": None,
        "parameters": build_params(model, "image_to_video", args.prompt, 20, "1080p", "9:16", True),
        "requested_aspect_ratio": "9:16", "aspect_ratio_source": "request parameter",
        "reference_image": reference, "estimate": None, "actual_cost": None,
        "status": result["status"], "result_file": str(video_path),
        "hyperframes_ready": True, "social_upload": False,
    }, secret=os.environ.get("HIGGSFIELD_API_KEY"))
    (out / f"{args.request_id}.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"request_id": args.request_id, "status": "completed", "video_file": str(video_path), "actual_cost": None}))


def approved_wan_reference(model, path):
    """Return the registry entry for a SHA-256-verified Wan production reference."""
    candidate = Path(path)
    if candidate.is_absolute() or ".." in candidate.parts or not candidate.is_file():
        raise HiggsfieldError("Reference image file is missing")
    entry = next((item for item in model.get("approved_production_references", [])
                  if candidate.as_posix() == item["path"]), None)
    if entry is None:
        raise HiggsfieldError("Image-to-video accepts only a registered production reference")
    digest = hashlib.sha256(candidate.read_bytes()).hexdigest()
    if digest != entry["sha256"]:
        raise HiggsfieldError("Registered production reference checksum mismatch")
    return {"asset_id": entry["asset_id"], "path": entry["path"], "sha256": digest}


def produce_i2v_shot(args):
    """Submit and retrieve exactly one approved Wan I2V shot from registered start (and optional end) frames."""
    if args.model != "alibaba/wan-3.0" or args.operation != "image_to_video":
        raise HiggsfieldError("Image-to-video shots are restricted to Wan 3.0 image-to-video")
    low, high = WAN_I2V_SHOT_DURATION
    if isinstance(args.duration, bool) or not isinstance(args.duration, int) or not low <= args.duration <= high:
        raise HiggsfieldError(f"Image-to-video shots must last {low} to {high} seconds")
    if (args.resolution, args.aspect_ratio, args.native_audio) != ("1080p", "9:16", "true"):
        raise HiggsfieldError("Image-to-video shots require 1080p, 9:16, and native audio")
    if args.approval != WAN_I2V_SHOT_APPROVAL_PHRASE:
        raise HiggsfieldError("Explicit approval for exactly one Wan image-to-video shot is required")
    if os.environ.get("GITHUB_RUN_ATTEMPT", "1") != "1":
        raise HiggsfieldError("Image-to-video shots are single-attempt; workflow reruns are blocked")
    run_id = os.environ.get("GITHUB_RUN_ID")
    if not run_id:
        raise HiggsfieldError("Image-to-video shots require a unique GitHub Actions run ID")

    model = get_model(args.model)
    endpoint = validate(model, "image_to_video", args.prompt, args.duration, "1080p", "9:16", args.reference)
    start = approved_wan_reference(model, args.reference)
    end = approved_wan_reference(model, args.end_reference) if args.end_reference else None
    params = build_params(model, "image_to_video", args.prompt, args.duration, "1080p", "9:16", True)
    client = Client(os.environ.get("HIGGSFIELD_API_KEY"))
    params["image_url"] = client.upload_image(start["path"])
    if end:
        params["end_image_url"] = client.upload_image(end["path"])
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "i2v-shot-manifest.json"
    print(json.dumps({"approval_gate": "passed", "model_id": args.model, "operation": "image_to_video",
                      "start_image": start["asset_id"], "end_image": end["asset_id"] if end else None,
                      "price_estimate": "not_requested", "generation_submissions": 1,
                      "submission_mode": "single_attempt_no_retry"}))
    request_id = client.submit(endpoint, params, idempotency_key=f"vu-higgsfield-{run_id}-i2v-shot")
    item = {"request_id": request_id, "model_id": args.model, "operation": "image_to_video",
            "prompt": args.prompt, "parameters": {k: v for k, v in params.items() if not k.endswith("image_url")},
            "reference_image": start, "end_reference_image": end,
            "estimate": None, "actual_cost": None, "status": "submitted", "social_upload": False}

    def write_manifest():
        manifest_path.write_text(json.dumps(safe_metadata(item, secret=os.environ.get("HIGGSFIELD_API_KEY")), indent=2) + "\n", encoding="utf-8")

    write_manifest()
    print(json.dumps({"request_id": request_id, "status": "submitted", "generation_submissions": 1}))
    result = None
    for delay in (2, 3, 5, 8, 10, 15, 20, 30):
        result = client.status(request_id)
        if result["status"] in TERMINAL:
            break
        time.sleep(delay)
    if not result or result["status"] not in TERMINAL:
        item["status"] = result["status"] if result else "submitted"
        write_manifest()
        print(json.dumps({"request_id": request_id, "status": item["status"], "generation_submissions": 1}))
        return
    if result["status"] != "completed" or not isinstance(result.get("video"), dict) or not result["video"].get("url"):
        item["status"] = result["status"]
        write_manifest()
        raise HiggsfieldError(f"Generation ended with status {result['status']}; no retry submitted")
    video_path = out / f"{request_id}.mp4"
    client.download(result["video"]["url"], video_path)
    item.update({"status": "completed", "result_file": str(video_path), "hyperframes_ready": True})
    write_manifest()
    print(json.dumps({"request_id": request_id, "status": "completed", "video_file": str(video_path),
                      "generation_submissions": 1, "actual_cost": None}))


def build_params(model, operation, prompt, duration, resolution, aspect_ratio, native_audio):
    params = {"prompt": prompt, "duration": duration}
    # Seedance 2.5 image-to-video derives framing from image_url and rejects this field.
    if not (model["model_id"] == "bytedance/seedance-2.5" and operation == "image_to_video") and aspect_ratio:
        params["aspect_ratio"] = aspect_ratio
    if resolution:
        params["resolution"] = resolution
    if model["model_id"].startswith("kling-video/"):
        params["sound"] = "on" if native_audio else "off"
    else:
        params["generate_audio"] = native_audio
    if model["model_id"] == "alibaba/wan-3.0":
        params["enable_thinking"] = False
    return params


def produce_three_text_shots(args):
    """Submit exactly three sequential, approved WAN T2V jobs without references or retries."""
    if args.model != "alibaba/wan-3.0" or args.operation != "text_to_video":
        raise HiggsfieldError("Three-shot production is restricted to Wan 3.0 text-to-video")
    if (args.resolution, args.aspect_ratio, args.native_audio) != ("1080p", "9:16", "true"):
        raise HiggsfieldError("Three-shot production requires 1080p, 9:16, and native audio")
    if args.reference or args.asset_id:
        raise HiggsfieldError("Text-to-video production does not accept references or asset IDs")
    if args.approval != WAN_THREE_SHOTS_APPROVAL_PHRASE:
        raise HiggsfieldError("Explicit approval for exactly three Wan text-to-video jobs is required")
    if os.environ.get("GITHUB_RUN_ATTEMPT", "1") != "1":
        raise HiggsfieldError("Three-shot production is single-attempt; workflow reruns are blocked")
    run_id = os.environ.get("GITHUB_RUN_ID")
    if not run_id:
        raise HiggsfieldError("Three-shot production requires a unique GitHub Actions run ID")
    shots = (("shot-1-arrival", args.shot1_prompt, 6),
             ("shot-2-approach", args.shot2_prompt, 6),
             ("shot-3-orbit", args.shot3_prompt, 8))
    if any(not isinstance(prompt, str) or not prompt.strip() for _, prompt, _ in shots):
        raise HiggsfieldError("All three separate shot prompts are required")
    model = get_model(args.model)
    endpoint = validate(model, "text_to_video", shots[0][1], 6, "1080p", "9:16")
    client = Client(os.environ.get("HIGGSFIELD_API_KEY"))
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    manifest = {"model_id": args.model, "operation": "text_to_video", "reference_image": None,
                "estimate": None, "actual_cost": None, "social_upload": False, "shots": []}
    print(json.dumps({"approval_gate": "passed", "model_id": args.model,
                      "generation_submissions": 3, "submission_mode": "sequential_no_retry"}))
    for shot_id, prompt, duration in shots:
        params = build_params(model, "text_to_video", prompt, duration, "1080p", "9:16", True)
        request_id = client.submit(endpoint, params, idempotency_key=f"vu-higgsfield-{run_id}-{shot_id}")
        item = {"shot_id": shot_id, "request_id": request_id, "prompt": prompt,
                "parameters": params, "status": "submitted", "actual_cost": None}
        # Poll only this request. A non-terminal job remains recorded for read-only retrieval.
        result = None
        for delay in (2, 3, 5, 8, 10, 15, 20, 30):
            result = client.status(request_id)
            if result["status"] in TERMINAL:
                break
            time.sleep(delay)
        item["status"] = result["status"] if result else "submitted"
        if item["status"] == "completed" and isinstance(result.get("video"), dict) and result["video"].get("url"):
            video_path = out / f"{shot_id}-{request_id}.mp4"
            client.download(result["video"]["url"], video_path)
            item["result_file"] = str(video_path)
            item["hyperframes_ready"] = True
        elif item["status"] in TERMINAL and item["status"] != "completed":
            item["failure"] = "provider terminal failure; no retry submitted"
        manifest["shots"].append(item)
        safe_metadata(manifest, secret=os.environ.get("HIGGSFIELD_API_KEY"))
        (out / "three-shot-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"generation_submissions": len(manifest["shots"]),
                      "completed": sum(x["status"] == "completed" for x in manifest["shots"]),
                      "manifest": str(out / "three-shot-manifest.json")}))


def produce_single_text_video(args):
    """Submit and retrieve exactly one manually approved, reference-free Wan T2V job."""
    if args.model != "alibaba/wan-3.0" or args.operation != "text_to_video":
        raise HiggsfieldError("Single continuous production is restricted to Wan 3.0 text-to-video")
    if (args.duration, args.resolution, args.aspect_ratio, args.native_audio) != (20, "1080p", "9:16", "true"):
        raise HiggsfieldError("Single continuous production requires 20 seconds, 1080p, 9:16, and native audio")
    if args.reference or args.asset_id:
        raise HiggsfieldError("Text-to-video production does not accept references or asset IDs")
    if args.approval != WAN_SINGLE_T2V_APPROVAL_PHRASE:
        raise HiggsfieldError("Explicit approval for exactly one Wan text-to-video generation is required")
    if os.environ.get("GITHUB_RUN_ATTEMPT", "1") != "1":
        raise HiggsfieldError("Single continuous production is single-attempt; workflow reruns are blocked")
    run_id = os.environ.get("GITHUB_RUN_ID")
    if not run_id:
        raise HiggsfieldError("Single continuous production requires a unique GitHub Actions run ID")

    model = get_model(args.model)
    endpoint = validate(model, "text_to_video", args.prompt, 20, "1080p", "9:16")
    params = build_params(model, "text_to_video", args.prompt, 20, "1080p", "9:16", True)
    client = Client(os.environ.get("HIGGSFIELD_API_KEY"))
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "single-t2v-manifest.json"
    print(json.dumps({"approval_gate": "passed", "model_id": args.model,
                      "operation": "text_to_video", "reference_image": None,
                      "price_estimate": "not_requested", "generation_submissions": 1,
                      "submission_mode": "single_attempt_no_retry"}))
    request_id = client.submit(endpoint, params, idempotency_key=f"vu-higgsfield-{run_id}-single-continuous-t2v")
    item = {"request_id": request_id, "model_id": args.model, "operation": "text_to_video",
            "prompt": args.prompt, "parameters": params, "reference_image": None,
            "estimate": None, "actual_cost": None, "status": "submitted", "social_upload": False}
    safe_metadata(item, secret=os.environ.get("HIGGSFIELD_API_KEY"))
    manifest_path.write_text(json.dumps(item, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"request_id": request_id, "status": "submitted", "generation_submissions": 1}))

    result = None
    for delay in (2, 3, 5, 8, 10, 15, 20, 30):
        result = client.status(request_id)
        if result["status"] in TERMINAL:
            break
        time.sleep(delay)
    if not result or result["status"] not in TERMINAL:
        item["status"] = result["status"] if result else "submitted"
        manifest_path.write_text(json.dumps(safe_metadata(item, secret=os.environ.get("HIGGSFIELD_API_KEY")), indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"request_id": request_id, "status": item["status"], "generation_submissions": 1}))
        return
    if result["status"] != "completed" or not isinstance(result.get("video"), dict) or not result["video"].get("url"):
        item["status"] = result["status"]
        manifest_path.write_text(json.dumps(safe_metadata(item, secret=os.environ.get("HIGGSFIELD_API_KEY")), indent=2) + "\n", encoding="utf-8")
        raise HiggsfieldError(f"Generation ended with status {result['status']}; no retry submitted")

    video_path = out / f"{request_id}.mp4"
    client.download(result["video"]["url"], video_path)
    item.update({"status": "completed", "result_file": str(video_path), "hyperframes_ready": True})
    manifest_path.write_text(json.dumps(safe_metadata(item, secret=os.environ.get("HIGGSFIELD_API_KEY")), indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"request_id": request_id, "status": "completed", "video_file": str(video_path),
                      "generation_submissions": 1, "actual_cost": None}))


def run(args):
    if args.action == "status":
        return retrieve_completed_job(args)
    if args.action == "produce-three":
        return produce_three_text_shots(args)
    if args.action == "produce-single-t2v":
        return produce_single_text_video(args)
    if args.action == "produce-i2v-shot":
        return produce_i2v_shot(args)
    model = get_model(args.model)
    endpoint = validate(model, args.operation, args.prompt, args.duration, args.resolution, args.aspect_ratio, args.reference)
    if model["model_id"] == "alibaba/wan-3.0" and args.action == "generate":
        raise HiggsfieldError("Wan 3.0 production must use the manually approved one-shot produce action")
    if args.action == "produce":
        if args.model != "alibaba/wan-3.0" or args.operation != "image_to_video":
            raise HiggsfieldError("Single-shot production is restricted to the approved Wan 3.0 image-to-video order")
        if (args.duration, args.resolution, args.aspect_ratio, args.native_audio) != (20, "1080p", "9:16", "true"):
            raise HiggsfieldError("Wan production parameters must be 20 seconds, 1080p, 9:16, and native audio enabled")
        if args.approval != WAN_APPROVAL_PHRASE:
            raise HiggsfieldError("Explicit approval for one Wan generation without a price estimate is required")
        if os.environ.get("GITHUB_RUN_ATTEMPT", "1") != "1":
            raise HiggsfieldError("Wan production is single-attempt; reruns are blocked")
        if not os.environ.get("GITHUB_RUN_ID"):
            raise HiggsfieldError("Wan production requires a unique GitHub Actions run ID; generation blocked")
    client = Client(os.environ.get("HIGGSFIELD_API_KEY"))
    params = build_params(model, args.operation, args.prompt, args.duration, args.resolution, args.aspect_ratio, args.native_audio == "true")
    if args.operation == "image_to_video":
        params["image_url"] = client.upload_image(args.reference)
    elif args.operation == "reference_to_video":
        if not args.reference or not Path(args.reference).is_file():
            raise HiggsfieldError("Reference image file is missing")
        params["image_urls"] = [client.upload_image(args.reference)]
    estimate = None
    if args.action != "produce":
        # Non-production estimate/generate actions retain their numeric estimate checks.
        estimate = client.estimate(endpoint, params)
        amount, cap = enforce_cost(estimate["usd"], args.budget_usd, args.action, args.approved_estimate_usd)
        print(json.dumps({"preflight": "passed", "model_id": model["model_id"], "estimate_usd": estimate["usd"], "budget_usd": str(cap)}))
        if args.action == "estimate":
            return
    else:
        # The user explicitly authorized one paid test despite the provider's non-numeric quote.
        # No estimate request is made; the generation API itself decides whether the account can submit it.
        print(json.dumps({"approval_gate": "passed", "model_id": model["model_id"], "price_estimate": "not_requested", "generation_submissions": 1}))
    if args.action == "generate" and args.approval != APPROVAL_PHRASE:
        raise HiggsfieldError("Explicit single-generation approval is required")
    run_id = os.environ.get("GITHUB_RUN_ID")
    idempotency_key = f"vu-higgsfield-{run_id}" if run_id and args.action == "produce" else None
    request_id = client.submit(endpoint, params, idempotency_key=idempotency_key)
    result = None
    for delay in (2, 3, 5, 8, 10):
        result = client.status(request_id)
        if result["status"] in TERMINAL:
            break
        time.sleep(delay)
    if not result or result["status"] not in TERMINAL:
        raise HiggsfieldError(f"Job {request_id} remains non-terminal; no second generation submitted")
    if result["status"] != "completed" or not isinstance(result.get("video"), dict) or not result["video"].get("url"):
        raise HiggsfieldError(f"Generation ended with status {result['status']}")
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    video_path = out / f"{request_id}.mp4"
    client.download(result["video"]["url"], video_path)
    reference = None
    if args.reference:
        approved = model.get("approved_production_reference", {})
        reference = {
            "asset_id": approved.get("asset_id") if approved and args.operation == "image_to_video" else (args.asset_id or Path(args.reference).stem),
            "path": args.reference,
            "sha256": hashlib.sha256(Path(args.reference).read_bytes()).hexdigest(),
        }
    metadata = safe_metadata({
        "request_id": request_id, "model_id": model["model_id"], "provider": model["provider"],
        "prompt": args.prompt, "seed": None, "parameters": params,
        "requested_aspect_ratio": args.aspect_ratio,
        "aspect_ratio_source": "request parameter" if model["model_id"] == "alibaba/wan-3.0" else ("reference image framing" if args.operation == "image_to_video" else "request parameter"),
        "reference_image": reference, "estimate": estimate,
        "actual_cost": None,
        "status": result["status"], "result_file": str(video_path),
        "hyperframes_ready": True, "social_upload": False
    }, secret=os.environ.get("HIGGSFIELD_API_KEY"))
    (out / f"{request_id}.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", choices=("estimate", "generate", "produce", "produce-three", "produce-single-t2v", "produce-i2v-shot", "status"), required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--operation", choices=("text_to_video", "image_to_video", "reference_to_video"), required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--duration", type=int, required=True)
    parser.add_argument("--resolution", default="")
    parser.add_argument("--aspect-ratio", default="16:9")
    parser.add_argument("--native-audio", choices=("true", "false"), default="true")
    parser.add_argument("--reference", default="")
    parser.add_argument("--end-reference", default="")
    parser.add_argument("--asset-id", default="")
    parser.add_argument("--budget-usd", default="")
    parser.add_argument("--approval", default="")
    parser.add_argument("--approved-estimate-usd", default="")
    parser.add_argument("--request-id", default="")
    parser.add_argument("--output-dir", default="brand-media/output/higgsfield")
    parser.add_argument("--shot1-prompt", default="")
    parser.add_argument("--shot2-prompt", default="")
    parser.add_argument("--shot3-prompt", default="")
    args = parser.parse_args(argv)
    try:
        run(args)
    except HiggsfieldError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
