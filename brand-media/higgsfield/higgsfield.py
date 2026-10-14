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
        approved = model.get("approved_production_reference")
        if approved and operation == "image_to_video":
            if not approved or candidate.as_posix() != approved["path"]:
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


def run(args):
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
    parser.add_argument("--action", choices=("estimate", "generate", "produce"), required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--operation", choices=("text_to_video", "image_to_video", "reference_to_video"), required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--duration", type=int, required=True)
    parser.add_argument("--resolution", default="")
    parser.add_argument("--aspect-ratio", default="16:9")
    parser.add_argument("--native-audio", choices=("true", "false"), default="true")
    parser.add_argument("--reference", default="")
    parser.add_argument("--asset-id", default="")
    parser.add_argument("--budget-usd", default="")
    parser.add_argument("--approval", default="")
    parser.add_argument("--approved-estimate-usd", default="")
    parser.add_argument("--output-dir", default="brand-media/output/higgsfield")
    args = parser.parse_args(argv)
    try:
        run(args)
    except HiggsfieldError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
