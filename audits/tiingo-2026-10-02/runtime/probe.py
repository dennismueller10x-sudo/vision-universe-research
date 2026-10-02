"""Read-only account evidence collector. Never writes production data.

Usage: python audits/tiingo-2026-10-02/runtime/probe.py --out DIRECTORY
Loads reviewed probes.json manifests beneath this audit, deduplicates URLs,
caps requests and halts on authentication/rate-limit denial. No credentials in URLs.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

AUDIT = Path(__file__).resolve().parents[1]
BASE = "https://api.tiingo.com"


def merge_manifests():
    unique = {}
    for path in sorted(AUDIT.glob("*/probes.json")):
        for p in json.loads(path.read_text())["probes"]:
            endpoint = p["path"]
            if not (endpoint.startswith(("/tiingo/", "/iex/", "/boats/")) or endpoint == "/api/test") or ".." in endpoint or "?" in endpoint:
                raise ValueError("Unapproved endpoint path")
            params = p.get("params", {})
            if any(k.lower() in {"token", "authorization", "key", "apikey"} for k in params):
                raise ValueError("Credentials are forbidden in parameters")
            query = urllib.parse.urlencode(sorted(params.items()))
            url = BASE + endpoint + ("?" + query if query else "")
            unique.setdefault(url, {"url": url, "references": []})["references"].append(p)
    return list(unique.values())


def redact(value, key):
    return value.replace(key, "[REDACTED]") if key else value


def collect(out, max_requests=600, interval=2.1):
    key = os.environ.get("TIINGO_API_KEY", "")
    plan = merge_manifests()
    out.mkdir(parents=True, exist_ok=True)
    report = {"generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
              "commit": os.environ.get("GITHUB_SHA"), "runId": os.environ.get("GITHUB_RUN_ID"),
              "authentication": "CONFIGURED" if key else "MISSING", "requestCap": max_requests,
              "minimumIntervalSeconds": interval, "plannedUniqueRequests": len(plan),
              "responses": [], "stopReason": None}
    if len(plan) > max_requests:
        raise ValueError("Reviewed manifest exceeds request cap; reduce before running")
    target = out / "account_evidence.json"
    def save():
        raw = json.dumps(report, indent=2, ensure_ascii=False)
        if key and key in raw:
            raise ValueError("Secret detected; refusing output")
        target.write_text(raw + "\n")
    if not key:
        report["stopReason"] = "NO_CREDENTIAL_REQUESTS_NOT_RUN"
        save()
        return report
    for i, p in enumerate(plan):
        started = time.monotonic()
        row = {**p, "observedAt": dt.datetime.now(dt.timezone.utc).isoformat()}
        request = urllib.request.Request(p["url"], headers={"Authorization": "Token " + key,
                                                        "Accept": "application/json"})
        try:
            try:
                response = urllib.request.urlopen(request, timeout=45)
            except urllib.error.HTTPError as e:
                response = e
            with response:
                row["status"] = response.code
                row["headers"] = {k: redact(v, key) for k, v in response.headers.items()
                                  if k.lower() in {"date", "content-type", "last-modified", "retry-after"}
                                  or "ratelimit" in k.lower() or "rate-limit" in k.lower()}
                body = response.read(16 * 1024 * 1024 + 1)
                if len(body) > 16 * 1024 * 1024:
                    raise ValueError("Response exceeds bounded payload limit")
                row["sha256"] = hashlib.sha256(body).hexdigest()
                raw = redact(body.decode("utf-8", errors="replace"), key)
                try:
                    row["payload"] = json.loads(raw)
                except ValueError:
                    row["payload"] = raw
        except Exception as e:
            row["status"] = None
            row["error"] = redact(str(e), key)
        row["elapsedMs"] = round(1000 * (time.monotonic() - started))
        report["responses"].append(row)
        # Status/logs omit bodies and headers. 403 alone can be endpoint entitlement.
        print(json.dumps({"request": i + 1, "total": len(plan), "status": row["status"],
                          "id": p["references"][0]["id"]}), flush=True)
        if row["status"] in {401, 429}:
            report["stopReason"] = "AUTHENTICATION_OR_RATE_LIMIT_STOP"
        if row["status"] == 403 and "invalid token" in str(row.get("payload", "")).lower():
            report["stopReason"] = "AUTHENTICATION_STOP"
        save()
        if report["stopReason"]:
            break
        if i + 1 < len(plan):
            time.sleep(max(0, interval - (time.monotonic() - started)))
    save()
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path)
    parser.add_argument("--plan-only", action="store_true")
    args = parser.parse_args()
    if args.plan_only:
        print(json.dumps({"requests": len(merge_manifests()), "plan": merge_manifests()}, indent=2))
    else:
        if args.out is None:
            parser.error("--out is required for evidence collection")
        collect(args.out)
