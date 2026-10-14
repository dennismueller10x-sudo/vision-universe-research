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
            amount = Decimal(str(response["usd"]))
            credits = str(response["credits"])
        except (KeyError, InvalidOperation, TypeError):
            raise HiggsfieldError("Malformed price estimate; generation blocked") from None
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

    def submit(self, endpoint, params):
        reply = self._request("POST", "/" + endpoint, params, idempotency_key=str(uuid.uuid4()))
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
    if not amount.is_finite() or amount < 0 or not cap.is_finite() or cap <= 0 or amount > cap:
        raise HiggsfieldError("Budget exceeded or invalid; generation blocked")
    if action == "generate":
        try:
            approved = Decimal(str(approved_estimate_usd))
        except (InvalidOperation, TypeError):
            raise HiggsfieldError("A separately reviewed estimate is required") from None
        if approved != amount:
            raise HiggsfieldError("Current estimate differs from the separately approved estimate; generation blocked")
    return amount, cap


def run(args):
    model = get_model(args.model)
    endpoint = validate(model, args.operation, args.prompt, args.duration, args.resolution, args.aspect_ratio, args.reference)
    client = Client(os.environ.get("HIGGSFIELD_API_KEY"))
    params = {"prompt": args.prompt, "duration": args.duration, "aspect_ratio": args.aspect_ratio}
    if args.resolution:
        params["resolution"] = args.resolution
    if args.operation == "image_to_video":
        params["image_url"] = client.upload_image(args.reference)
    elif args.operation == "reference_to_video":
        if not args.reference or not Path(args.reference).is_file():
            raise HiggsfieldError("Reference image file is missing")
        params["image_urls"] = [client.upload_image(args.reference)]
    # Estimate is performed for this exact endpoint and parameter set before any paid submission.
    estimate = client.estimate(endpoint, params)
    amount, cap = enforce_cost(estimate["usd"], args.budget_usd, args.action, args.approved_estimate_usd)
    print(json.dumps({"preflight": "passed", "model_id": model["model_id"], "estimate_usd": estimate["usd"], "budget_usd": str(cap)}))
    if args.action == "estimate":
        return
    if args.approval != APPROVAL_PHRASE:
        raise HiggsfieldError("Explicit single-generation approval is required")
    request_id = client.submit(endpoint, params)
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
        reference = {"asset_id": args.asset_id or Path(args.reference).stem, "path": args.reference, "sha256": hashlib.sha256(Path(args.reference).read_bytes()).hexdigest()}
    metadata = safe_metadata({
        "request_id": request_id, "model_id": model["model_id"], "provider": model["provider"],
        "prompt": args.prompt, "seed": None, "parameters": params,
        "reference_image": reference, "estimate": estimate,
        "status": result["status"], "result_file": str(video_path),
        "hyperframes_ready": True, "social_upload": False
    }, secret=os.environ.get("HIGGSFIELD_API_KEY"))
    (out / f"{request_id}.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", choices=("estimate", "generate"), required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--operation", choices=("text_to_video", "image_to_video", "reference_to_video"), required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--duration", type=int, required=True)
    parser.add_argument("--resolution", default="")
    parser.add_argument("--aspect-ratio", default="16:9")
    parser.add_argument("--reference", default="")
    parser.add_argument("--asset-id", default="")
    parser.add_argument("--budget-usd", required=True)
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
