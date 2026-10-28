"""Shared helpers for V9 workstream F (secpit). Stdlib only.

Private raw SEC bodies live under PRIVATE (outside the repo); only derived
evidence is written to docs/quant-recovery/v9/secpit/.
"""
import hashlib
import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from scripts.quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter  # noqa: E402

PRIVATE = pathlib.Path(os.environ.get(
    "SECPIT_PRIVATE",
    "/tmp/claude-0/-home-user-vision-universe-research/84af0cda-6f74-5ce8-afa8-dfb2e62db3b4/scratchpad/v9-private/secpit"))
EVIDENCE = ROOT / "docs/quant-recovery/v9/secpit"
BULK_FACTS_URL = "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip"
BULK_SUBMISSIONS_URL = "https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip"


def guard_private(path):
    path = pathlib.Path(path).resolve()
    if path == ROOT or ROOT in path.parents:
        raise SystemExit("PRIVATE_OUTPUT_REQUIRED: %s" % path)
    return path


def client():
    # HARD LIMIT for this stream: 2 req/s.
    return SECHttpClient(cache=DiskCache(directory=PRIVATE / "http-cache", ttl_seconds=10 ** 9),
                         rate_limiter=RateLimiter(rate_per_second=2, burst=2), timeout=120)


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def code_hash(path):
    return sha256_file(path)


def population():
    """CIKs of the repo's ingested SEC population (quant/data/fundamentals/issuers)."""
    out = {}
    for shard in sorted((ROOT / "quant/data/fundamentals/issuers").glob("*.json")):
        for issuer in json.loads(shard.read_text())["issuers"]:
            out[issuer["cik"]] = {"tickers": issuer.get("tickers") or [], "name": issuer.get("name"),
                                  "fiscalYearEnd": issuer.get("fiscalYearEnd")}
    return out


def write_json(path, payload):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=1, sort_keys=False, default=str) + "\n")
