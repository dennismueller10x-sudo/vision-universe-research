"""Canonical SEC fundamentals Product Service backed by the existing R2 store."""
from http.server import BaseHTTPRequestHandler
import gzip
import importlib.util
import io
import zlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.r2_reader import R2ReadError, configured, get_object

spec = importlib.util.spec_from_file_location("vu_fundamentals_serving", ROOT / "scripts/vu2/fundamentals-serving.py")
serving = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serving)

ALLOWED_ORIGINS = {"https://research.visionuniverse.de", "https://vision-universe-research.vercel.app"}
INDEX_KEY = "v1/sec/fundamentals/_index.json.gz"


def service_enabled(env=None):
    source = os.environ if env is None else env
    return str(source.get("VU_PIT_FUNDAMENTALS_ENABLED", "")).strip().lower() == "true"


def _shard_key(symbol):
    return re.sub(r"[^A-Z0-9]", "_", symbol)[:2].ljust(2, "_")


def _public_json(path):
    origin = str(os.environ.get("VU_PUBLIC_DATA_ORIGIN", "https://research.visionuniverse.de")).rstrip("/")
    if not re.fullmatch(r"https://[A-Za-z0-9.-]+(?::\d+)?", origin):
        raise ValueError("INVALID_ORIGIN")
    request = Request(origin + "/" + path.lstrip("/"), headers={"Accept": "application/json"})
    with urlopen(request, timeout=12) as response:
        return json.loads(response.read(2 * 1024 * 1024 + 1))


def resolve_identity(ticker, security_id=None, loader=None):
    ticker = str(ticker or "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9.-]{1,12}", ticker):
        return "INVALID_IDENTITY", None
    try:
        shard = (loader or _public_json)("quant/data/universe/instruments/" + _shard_key(ticker) + ".json")
    except (OSError, ValueError, TypeError):
        return "SOURCE_MISSING", None
    rows = [row for row in shard.get("instruments", []) if row.get("symbol") == ticker]
    row = next((item for item in rows if security_id and
                (item.get("instrumentId") == security_id or security_id in item.get("legacyIds", []))), None)
    if not security_id:
        row = next((item for item in rows if item.get("primaryListing")), rows[0] if rows else None)
    if not row:
        return "SYMBOL_NOT_SUPPORTED", None
    if row.get("productEligibility") not in ("ELIGIBLE", "SEPARATE_CLASS", "REVIEW") or not row.get("masterMemberId"):
        return "NOT_ELIGIBLE", None
    instrument_id, cik = row.get("instrumentId"), row.get("cik")
    if not re.fullmatch(r"vu_[a-f0-9]+", str(instrument_id or "")) or row["masterMemberId"] not in row.get("legacyIds", []):
        return "INVALID_IDENTITY", None
    if cik and (not re.fullmatch(r"\d{10}", cik) or row.get("issuerId") != "iss_cik_" + cik):
        return "INVALID_IDENTITY", None
    return "AVAILABLE", {"securityId": instrument_id, "instrumentId": instrument_id,
        "masterMemberId": row["masterMemberId"], "issuerId": row.get("issuerId"), "cik": cik,
        "ticker": ticker, "name": row.get("companyName") or ticker}


def load_projection(identity, *, policy, as_of, usage, reader=get_object, full_history=False):
    if not configured():
        return {"state": "NOT_CONFIGURED", "identity": identity}
    if not identity.get("cik"):
        return {"state": "UNAVAILABLE", "reason": "NO_CIK", "identity": identity}
    for attempt in range(2):
        index_bytes = reader(INDEX_KEY, max_bytes=16 * 1024 * 1024)
        if not index_bytes:
            return {"state": "SOURCE_MISSING", "reason": "FUNDAMENTALS_INDEX_MISSING", "identity": identity}
        try:
            with gzip.GzipFile(fileobj=io.BytesIO(index_bytes)) as source:
                decoded = source.read(32 * 1024 * 1024 + 1)
            if len(decoded) > 32 * 1024 * 1024:
                raise ValueError("INDEX_TOO_LARGE")
            index = json.loads(decoded)
            meta = (index.get("objects") or {}).get(identity["cik"])
        except (OSError, EOFError, ValueError, TypeError, AttributeError, zlib.error):
            return {"state": "PIPELINE_ERROR", "reason": "INVALID_FUNDAMENTALS_INDEX", "identity": identity}
        if not meta:
            return {"state": "SOURCE_MISSING", "reason": "FUNDAMENTALS_NOT_STORED", "identity": identity}
        expected_key = "v1/sec/fundamentals/facts/" + identity["cik"] + ".json.gz"
        if not isinstance(meta, dict) or meta.get("key") != expected_key or not re.fullmatch(r"[0-9a-f]{64}", str(meta.get("sha256", ""))):
            return {"state": "PIPELINE_ERROR", "reason": "INVALID_FUNDAMENTALS_INDEX", "identity": identity}
        factbook = reader(expected_key, max_bytes=serving.MAX_COMPRESSED_BYTES)
        if not factbook:
            return {"state": "SOURCE_MISSING", "reason": "FUNDAMENTALS_OBJECT_MISSING", "identity": identity}
        try:
            return serving.project_factbook(factbook, expected_sha256=meta.get("sha256"), identity=identity,
                eligible=True, policy=policy, as_of=as_of, usage=usage, full_history=full_history)
        except serving.ServingError as error:
            if error.code == "OBJECT_DIGEST_MISMATCH" and attempt == 0:
                continue
            return {"state": "PIPELINE_ERROR", "reason": error.code, "identity": identity}
    return {"state": "PIPELINE_ERROR", "reason": "OBJECT_DIGEST_MISMATCH", "identity": identity}


class handler(BaseHTTPRequestHandler):
    def _headers(self, status=200):
        origin = self.headers.get("Origin", "")
        self.send_response(status)
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
        self.end_headers()

    def _json(self, status, body):
        encoded = json.dumps(body, separators=(",", ":"), allow_nan=False).encode()
        if len(encoded) > 4 * 1024 * 1024:
            status, encoded = 200, b'{"state":"UNAVAILABLE","reason":"RESPONSE_BUDGET_EXCEEDED"}'
        self._headers(status)
        self.wfile.write(encoded)

    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "")
        if origin and origin not in ALLOWED_ORIGINS:
            return self._json(403, {"state": "ORIGIN_NOT_ALLOWED"})
        self._headers(204)

    def do_GET(self):
        origin = self.headers.get("Origin", "")
        if origin and origin not in ALLOWED_ORIGINS:
            return self._json(403, {"state": "ORIGIN_NOT_ALLOWED"})
        query = parse_qs(urlsplit(self.path).query)
        one = lambda name, default=None: (query.get(name) or [default])[0]
        # This retained adapter is authorized for explicit historical requests,
        # never as an implicit replacement for ordinary static product views.
        if one("scope") != "full_history" or not one("asOf"):
            return self._json(200, {"state": "UNAVAILABLE", "reason": "EXPLICIT_HISTORY_SCOPE_REQUIRED"})
        if not service_enabled():
            return self._json(200, {"state": "NOT_CONFIGURED", "reason": "PIT_SERVICE_DISABLED"})
        state, identity = resolve_identity(one("ticker"), one("securityId"))
        if state != "AVAILABLE":
            return self._json(200, {"state": state, "identity": None})
        policy = one("policy", "as_of_latest")
        usage = one("usage", "research")
        as_of = one("asOf", datetime.now(timezone.utc).date().isoformat())
        try:
            result = load_projection(identity, policy=policy, as_of=as_of, usage=usage, full_history=True)
        except R2ReadError as error:
            result = {"state": error.code, "identity": identity}
        return self._json(200, result)
