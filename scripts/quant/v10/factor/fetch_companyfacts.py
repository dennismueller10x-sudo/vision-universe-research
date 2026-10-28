#!/usr/bin/env python3
"""V10 FACTOR: download SEC bulk companyfacts.zip once into the strand's private scratch.

One request through the existing fair-access client (User-Agent from http_client,
<= 2 requests/s). The bulk filing-index archive is NOT downloaded (its acceptance
times carry a +4/5 h offset and are never used). Only the manifest (url, bytes, sha256) is printed.
Usage: python3 -I fetch_companyfacts.py <private_dir>
"""
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from scripts.quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter  # noqa: E402

URL = "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip"


def main():
    private = pathlib.Path(sys.argv[1]).resolve()
    if private == ROOT or ROOT in private.parents:
        raise SystemExit("PRIVATE_OUTPUT_REQUIRED")
    client = SECHttpClient(cache=DiskCache(directory=private / "http-cache", ttl_seconds=10 ** 9),
                           rate_limiter=RateLimiter(rate_per_second=2, burst=2), timeout=600)
    target = private / "bulk" / "companyfacts.zip"
    path, size, cached = client.download_to(URL, target)
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    manifest = {"url": URL, "bytes": size, "sha256": digest.hexdigest(), "cached": cached,
                "stats": dict(client.stats)}
    (private / "bulk" / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
