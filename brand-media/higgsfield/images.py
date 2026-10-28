"""Higgsfield image jobs: character drafts, pose sheets and reference edits. Python standard library only.

A job is a reviewed JSON file at brand-media/<area>/image-jobs/<job>.json. Paid submission requires an
explicit approval phrase, a budget and a single workflow attempt; there are no retries or fallbacks.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal, InvalidOperation
from pathlib import Path

from higgsfield import TERMINAL, Client, HiggsfieldError, safe_metadata

APPROVAL_PHRASE = "APPROVE-HIGGSFIELD-IMAGE-JOB"
NO_ESTIMATE_APPROVAL_PHRASE = "APPROVE-HIGGSFIELD-IMAGE-JOB-WITHOUT-ESTIMATE"
MAX_IMAGES_PER_JOB = 12
REFERENCE_ROOT = "brand-media/"
REFERENCE_SUFFIXES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
RECRAFT_RATIOS = ["1:1", "2:1", "1:2", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "6:10", "14:10", "10:14", "16:9", "9:16"]
QWEN_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "7:9", "9:7", "9:16", "16:9", "21:9"]

# Schemas from docs.higgsfield.ai/docs/models/<model>.md, checked 2026-10-28.
IMAGE_MODELS = {
    "recraft-v4.1": {
        "endpoint": "recraft/v4.1/text-to-image", "resolutions": ["1k"], "aspect_ratios": RECRAFT_RATIOS,
        "references": (0, 0), "fields": {"colors", "background_color", "output_format"},
    },
    "recraft-v4.1-pro": {
        "endpoint": "recraft/v4.1/pro/text-to-image", "resolutions": ["2k"], "aspect_ratios": RECRAFT_RATIOS,
        "references": (0, 0), "fields": {"colors", "background_color", "output_format"},
    },
    "grok-image-2": {
        "endpoint": "xai/grok-imagine-image-2.0", "resolutions": ["1k", "2k"],
        "aspect_ratios": ["auto", "1:1", "1:2", "2:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"],
        "references": (0, 10), "fields": {"quality"},
    },
    "qwen-image-3": {
        "endpoint": "alibaba/qwen-image-3/text-to-image", "resolutions": ["1k", "2k"], "aspect_ratios": QWEN_RATIOS,
        "references": (0, 0), "fields": {"seed", "negative_prompt"},
    },
    "qwen-image-3-edit": {
        "endpoint": "alibaba/qwen-image-3/edit", "resolutions": ["1k", "2k"], "aspect_ratios": QWEN_RATIOS,
        "references": (1, 3), "fields": {"seed", "negative_prompt"},
    },
}
ITEM_KEYS = {"id", "model", "prompt", "aspect_ratio", "resolution", "references"} | set().union(
    *(m["fields"] for m in IMAGE_MODELS.values()))


def _rgb(value):
    if (not isinstance(value, list) or len(value) != 3
            or any(isinstance(c, bool) or not isinstance(c, int) or not 0 <= c <= 255 for c in value)):
        raise HiggsfieldError("RGB colors must be three integers 0-255")
    return {"rgb": value}


def reference_path(path):
    candidate = Path(path)
    if (not isinstance(path, str) or candidate.is_absolute() or ".." in candidate.parts
            or not candidate.as_posix().startswith(REFERENCE_ROOT)):
        raise HiggsfieldError("References must be repository paths under brand-media/")
    if candidate.suffix.lower() not in REFERENCE_SUFFIXES:
        raise HiggsfieldError("References must be PNG or JPEG")
    if not candidate.is_file():
        raise HiggsfieldError(f"Reference file is missing: {candidate.as_posix()}")
    return candidate


def build_params(item):
    """Validate one job item against the documented schema and return the API body (without image_urls)."""
    if not isinstance(item, dict):
        raise HiggsfieldError("Each image item must be an object")
    unknown = set(item) - ITEM_KEYS
    if unknown:
        raise HiggsfieldError(f"Unknown image item fields: {', '.join(sorted(unknown))}")
    if not isinstance(item.get("id"), str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", item["id"]):
        raise HiggsfieldError("Image id must be lowercase letters, digits and dashes")
    model = IMAGE_MODELS.get(item.get("model"))
    if model is None:
        raise HiggsfieldError(f"Unsupported image model for {item['id']}")
    extra = {k for k in item if k in ITEM_KEYS - {"id", "model", "prompt", "aspect_ratio", "resolution", "references"}}
    if extra - model["fields"]:
        raise HiggsfieldError(f"Fields not supported by {item['model']}: {', '.join(sorted(extra - model['fields']))}")
    prompt = item.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 10000:
        raise HiggsfieldError(f"Prompt for {item['id']} must be 1-10000 characters")
    params = {"prompt": prompt}
    resolution = item.get("resolution", model["resolutions"][0])
    if resolution not in model["resolutions"]:
        raise HiggsfieldError(f"Unsupported resolution for {item['id']}")
    params["resolution"] = resolution
    ratio = item.get("aspect_ratio", "1:1")
    if ratio not in model["aspect_ratios"]:
        raise HiggsfieldError(f"Unsupported aspect ratio for {item['id']}")
    params["aspect_ratio"] = ratio
    references = item.get("references", [])
    low, high = model["references"]
    if not isinstance(references, list) or not low <= len(references) <= high:
        raise HiggsfieldError(f"{item['model']} accepts {low}-{high} references")
    for ref in references:
        reference_path(ref)
    if "colors" in item:
        if not isinstance(item["colors"], list) or not item["colors"]:
            raise HiggsfieldError("colors must be a non-empty list")
        params["colors"] = [_rgb(c) for c in item["colors"]]
    if "background_color" in item:
        params["background_color"] = _rgb(item["background_color"])
    if "output_format" in item:
        if item["output_format"] not in {"jpg", "png", "webp"}:
            raise HiggsfieldError("output_format must be jpg, png or webp")
        params["output_format"] = item["output_format"]
    if "quality" in item:
        if item["quality"] not in {"low", "medium"}:
            raise HiggsfieldError("quality must be low or medium")
        params["quality"] = item["quality"]
    if "seed" in item:
        if isinstance(item["seed"], bool) or not isinstance(item["seed"], int) or not 0 <= item["seed"] <= 2147483647:
            raise HiggsfieldError("seed must be an integer 0-2147483647")
        params["seed"] = item["seed"]
    if "negative_prompt" in item:
        if not isinstance(item["negative_prompt"], str):
            raise HiggsfieldError("negative_prompt must be text")
        params["negative_prompt"] = item["negative_prompt"]
    if item["model"].startswith("qwen-image-3"):
        # Keep the prompt as written; provider-side rewriting would drift the character design.
        params["prompt_extend"] = False
        params["enable_thinking"] = False
    return params


def load_job(path):
    candidate = Path(path)
    parts = candidate.parts
    if (candidate.is_absolute() or ".." in parts or len(parts) != 4 or parts[0] != "brand-media"
            or parts[2] != "image-jobs" or candidate.suffix != ".json"):
        raise HiggsfieldError("Job files must live in brand-media/<area>/image-jobs/")
    try:
        job = json.loads(candidate.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raise HiggsfieldError("Job file is missing or not valid JSON") from None
    if not isinstance(job, dict) or not isinstance(job.get("job_id"), str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", job["job_id"]):
        raise HiggsfieldError("job_id must be lowercase letters, digits and dashes")
    images = job.get("images")
    if not isinstance(images, list) or not 1 <= len(images) <= MAX_IMAGES_PER_JOB:
        raise HiggsfieldError(f"A job holds 1-{MAX_IMAGES_PER_JOB} images")
    ids = [item.get("id") if isinstance(item, dict) else None for item in images]
    if len(set(ids)) != len(ids):
        raise HiggsfieldError("Image ids must be unique within a job")
    plans = [{"id": item["id"], "model": item["model"], "endpoint": IMAGE_MODELS[item["model"]]["endpoint"],
              "params": params, "references": item.get("references", [])}
             for item, params in ((item, build_params(item)) for item in images)]
    return job, plans


def parse_usd(response):
    """The documented estimate response is {"usd": "0.094"}; anything else is unknown, never zero."""
    try:
        amount = Decimal(str(response["usd"]))
    except (KeyError, TypeError, InvalidOperation):
        return None
    return amount if amount.is_finite() and amount >= 0 else None


class ImageClient(Client):
    def estimate_usd(self, endpoint, params):
        return parse_usd(self._request("POST", "/estimate/" + endpoint, params))

    def download_image(self, url, destination):
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or not parsed.netloc:
            raise HiggsfieldError("Invalid image download URL")
        # No Higgsfield auth header is sent to provider output storage.
        request = urllib.request.Request(url, headers={"Accept": "image/*"})
        try:
            with self._opener(request, timeout=self.timeout) as resp, open(destination, "wb") as out:
                if not 200 <= resp.status < 300:
                    raise HiggsfieldError(f"Image download returned HTTP {resp.status}")
                shutil.copyfileobj(resp, out)
        except urllib.error.HTTPError as exc:
            raise HiggsfieldError(f"Image download returned HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise HiggsfieldError(f"Image download failed ({type(exc).__name__})") from None


def attach_references(client, plans):
    uploaded = {}
    for plan in plans:
        if plan["references"]:
            for ref in plan["references"]:
                if ref not in uploaded:
                    path = reference_path(ref)
                    uploaded[ref] = client.upload_image(path, REFERENCE_SUFFIXES[path.suffix.lower()])
            plan["params"]["image_urls"] = [uploaded[ref] for ref in plan["references"]]


def estimate_job(client, plans):
    rows = [{"id": p["id"], "model": p["model"], "usd": client.estimate_usd(p["endpoint"], p["params"])} for p in plans]
    known = [r["usd"] for r in rows if r["usd"] is not None]
    total = sum(known, Decimal("0")) if len(known) == len(rows) else None
    return rows, total


def extension_for(url, params):
    suffix = Path(urllib.parse.urlparse(url).path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return suffix
    return "." + params.get("output_format", "png")


def run(args):
    job, plans = load_job(args.job)
    if args.action == "validate":
        print(json.dumps({"job_id": job["job_id"], "images": len(plans),
                          "models": sorted({p["model"] for p in plans}), "api_calls": 0}))
        return
    secret = os.environ.get("HIGGSFIELD_API_KEY")
    client = ImageClient(secret)
    attach_references(client, plans)
    rows, total = estimate_job(client, plans)
    print(json.dumps({"job_id": job["job_id"], "estimates": [{**r, "usd": None if r["usd"] is None else str(r["usd"])} for r in rows],
                      "total_usd": None if total is None else str(total)}))
    if args.action == "estimate":
        return

    if args.approval not in {APPROVAL_PHRASE, NO_ESTIMATE_APPROVAL_PHRASE}:
        raise HiggsfieldError("Explicit image-job approval is required")
    try:
        budget = Decimal(str(args.budget_usd))
    except InvalidOperation:
        raise HiggsfieldError("A numeric budget is required") from None
    if not budget.is_finite() or budget <= 0:
        raise HiggsfieldError("A positive budget is required")
    if total is None:
        if args.approval != NO_ESTIMATE_APPROVAL_PHRASE:
            raise HiggsfieldError("Provider returned no complete price estimate; generation blocked")
    elif total > budget:
        raise HiggsfieldError(f"Estimated {total} USD exceeds the {budget} USD budget; generation blocked")
    if os.environ.get("GITHUB_RUN_ATTEMPT", "1") != "1":
        raise HiggsfieldError("Image jobs are single-attempt; workflow reruns are blocked")
    run_id = os.environ.get("GITHUB_RUN_ID")
    if not run_id:
        raise HiggsfieldError("Image jobs require a unique GitHub Actions run ID")

    out = Path(args.output_dir) / job["job_id"]
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "manifest.json"
    manifest = {"job_id": job["job_id"], "purpose": job.get("purpose"), "job_file": args.job,
                "estimate_total_usd": None if total is None else str(total), "budget_usd": str(budget),
                "actual_cost": None, "social_upload": False, "images": []}
    print(json.dumps({"approval_gate": "passed", "generation_submissions": len(plans), "submission_mode": "sequential_no_retry"}))
    for plan, row in zip(plans, rows):
        request_id = client.submit(plan["endpoint"], plan["params"], idempotency_key=f"vu-higgsfield-img-{run_id}-{plan['id']}")
        entry = {"id": plan["id"], "model": plan["model"], "request_id": request_id, "prompt": plan["params"]["prompt"],
                 "parameters": {k: v for k, v in plan["params"].items() if k not in {"prompt", "image_urls"}},
                 "references": plan["references"], "estimate_usd": None if row["usd"] is None else str(row["usd"]),
                 "status": "submitted", "files": []}
        manifest["images"].append(entry)
        result = None
        for delay in (2, 3, 5, 5, 8, 10, 15, 20, 30):
            result = client.status(request_id)
            if result["status"] in TERMINAL:
                break
            time.sleep(delay)
        entry["status"] = result["status"] if result else "submitted"
        if entry["status"] == "completed":
            images = result.get("images") if isinstance(result.get("images"), list) else []
            for index, image in enumerate(images):
                url = image.get("url") if isinstance(image, dict) else None
                if url:
                    suffix = "" if len(images) == 1 else f"-{index + 1}"
                    path = out / f"{plan['id']}{suffix}{extension_for(url, plan['params'])}"
                    client.download_image(url, path)
                    entry["files"].append(path.name)
            if not entry["files"]:
                entry["status"] = "completed_without_images"
        manifest_path.write_text(json.dumps(safe_metadata(manifest, secret=secret), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    done = sum(e["status"] == "completed" for e in manifest["images"])
    print(json.dumps({"job_id": job["job_id"], "generation_submissions": len(plans), "completed": done, "manifest": str(manifest_path)}))


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", choices=("validate", "estimate", "generate"), required=True)
    parser.add_argument("--job", required=True)
    parser.add_argument("--budget-usd", default="")
    parser.add_argument("--approval", default="")
    parser.add_argument("--output-dir", default="brand-media/output/higgsfield-images")
    args = parser.parse_args(argv)
    try:
        run(args)
    except HiggsfieldError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
