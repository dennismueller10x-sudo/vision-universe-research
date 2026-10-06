"""Small read-only S3/R2 transport for the Python product-service runtime."""
from __future__ import annotations

import hashlib
import hmac
import os
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

EMPTY_SHA256 = hashlib.sha256(b"").hexdigest()


class R2ReadError(RuntimeError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def configured(env=None):
    source = env or os.environ
    return all(str(source.get(name, "")).strip() for name in (
        "VU_HISTORY_S3_ENDPOINT", "VU_HISTORY_S3_BUCKET",
        "VU_HISTORY_S3_ACCESS_KEY_ID", "VU_HISTORY_S3_SECRET_ACCESS_KEY"))


def _hmac(key, message):
    return hmac.new(key, message.encode(), hashlib.sha256).digest()


def get_object(key, *, env=None, opener=urlopen, max_bytes=64 * 1024 * 1024):
    source = env or os.environ
    if not configured(source):
        raise R2ReadError("NOT_CONFIGURED")
    if not key or key.startswith("/") or ".." in key.split("/"):
        raise R2ReadError("INVALID_OBJECT_KEY")
    endpoint = str(source["VU_HISTORY_S3_ENDPOINT"]).rstrip("/")
    parsed = urlsplit(endpoint)
    if parsed.scheme != "https" or not parsed.hostname:
        raise R2ReadError("INVALID_STORAGE_ENDPOINT")
    bucket = str(source["VU_HISTORY_S3_BUCKET"]).strip()
    region = str(source.get("VU_HISTORY_S3_REGION", "auto")).strip() or "auto"
    access = str(source["VU_HISTORY_S3_ACCESS_KEY_ID"]).strip()
    secret = str(source["VU_HISTORY_S3_SECRET_ACCESS_KEY"]).strip()
    path = "/" + quote(bucket, safe="-_.~") + "/" + quote(key, safe="/-_.~")
    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date = amz_date[:8]
    headers = {"host": parsed.netloc, "x-amz-content-sha256": EMPTY_SHA256, "x-amz-date": amz_date}
    canonical_headers = "".join(f"{name}:{headers[name]}\n" for name in sorted(headers))
    signed_headers = ";".join(sorted(headers))
    canonical = "\n".join(("GET", path, "", canonical_headers, signed_headers, EMPTY_SHA256))
    scope = f"{date}/{region}/s3/aws4_request"
    string_to_sign = "\n".join(("AWS4-HMAC-SHA256", amz_date, scope,
                                  hashlib.sha256(canonical.encode()).hexdigest()))
    signing = _hmac(_hmac(_hmac(_hmac(("AWS4" + secret).encode(), date), region), "s3"), "aws4_request")
    signature = hmac.new(signing, string_to_sign.encode(), hashlib.sha256).hexdigest()
    headers["authorization"] = (f"AWS4-HMAC-SHA256 Credential={access}/{scope}, "
                                f"SignedHeaders={signed_headers}, Signature={signature}")
    request = Request(f"{parsed.scheme}://{parsed.netloc}{path}", headers=headers, method="GET")
    try:
        with opener(request, timeout=15) as response:
            length = response.headers.get("Content-Length")
            if length and int(length) > max_bytes:
                raise R2ReadError("OBJECT_TOO_LARGE")
            body = response.read(max_bytes + 1)
            if len(body) > max_bytes:
                raise R2ReadError("OBJECT_TOO_LARGE")
            return body
    except HTTPError as error:
        if error.code == 404:
            return None
        raise R2ReadError("STORE_UNREACHABLE") from None
    except R2ReadError:
        raise
    except Exception:
        raise R2ReadError("STORE_UNREACHABLE") from None
