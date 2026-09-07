"""SEC fair-access HTTP client.

This is the ONLY place in the repository that talks to sec.gov for fundamentals.
Everything the SEC asks of automated clients lives here:

  - a declaring User-Agent with a contact address (SEC requirement),
  - a token-bucket rate limiter well below the published ~10 req/s ceiling,
  - retry with exponential backoff and jitter, but only for retryable classes,
  - request de-duplication so a fan-out never fetches the same URL twice,
  - an on-disk cache with a TTL, so re-runs and tests do not re-hit the SEC,
  - structured logging of every request outcome.

Standard library only, matching the rest of scripts/ in this repository.
"""
import gzip
import hashlib
import io
import json
import logging
import os
import random
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

LOGGER = logging.getLogger("vu.sec.http")

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CACHE_DIR = Path(os.environ.get("SEC_CACHE_DIR") or (ROOT / ".sec-cache"))

# The SEC asks automated clients to identify themselves with a contact address.
# Same convention as scripts/hedgefonds/fetch_edgar_data.py.
DEFAULT_USER_AGENT = os.environ.get(
    "SEC_USER_AGENT", "VisionUniverseResearch info@visionuniverse.de"
)

# SEC publishes ~10 requests/second. We deliberately stay far below it: this
# pipeline is never latency-critical, and a blocked IP costs far more than time.
DEFAULT_RATE_PER_SECOND = 5.0
DEFAULT_BURST = 5
DEFAULT_TIMEOUT = 30.0
DEFAULT_MAX_RETRIES = 4
DEFAULT_CACHE_TTL_SECONDS = 24 * 3600

RETRYABLE_STATUS = frozenset({403, 429, 500, 502, 503, 504})


class SECHTTPError(RuntimeError):
    """A non-retryable HTTP failure, or a retryable one that exhausted retries."""

    def __init__(self, url, status, message, attempts):
        super().__init__(f"{url} -> HTTP {status} after {attempts} attempt(s): {message}")
        self.url = url
        self.status = status
        self.attempts = attempts


class RateLimiter:
    """Thread-safe token bucket.

    Kept as a separate object so tests can drive it with an injected clock
    instead of sleeping in real time.
    """

    def __init__(self, rate_per_second=DEFAULT_RATE_PER_SECOND, burst=DEFAULT_BURST,
                 monotonic=time.monotonic, sleep=time.sleep):
        if rate_per_second <= 0:
            raise ValueError("rate_per_second must be > 0")
        self.rate = float(rate_per_second)
        self.capacity = float(max(1, burst))
        self._tokens = self.capacity
        self._monotonic = monotonic
        self._sleep = sleep
        self._last = monotonic()
        self._lock = threading.Lock()

    def _refill(self):
        now = self._monotonic()
        elapsed = max(0.0, now - self._last)
        self._last = now
        self._tokens = min(self.capacity, self._tokens + elapsed * self.rate)

    # Refilling exactly one token can land a hair below 1.0 in floating point,
    # which would otherwise spin forever on ever-smaller waits.
    TOKEN_EPSILON = 1e-9

    def acquire(self):
        """Block until a token is available. Returns the seconds actually waited."""
        waited = 0.0
        while True:
            with self._lock:
                self._refill()
                if self._tokens >= 1.0 - self.TOKEN_EPSILON:
                    self._tokens = max(0.0, self._tokens - 1.0)
                    return waited
                deficit = 1.0 - self._tokens
                delay = deficit / self.rate
            self._sleep(delay)
            waited += delay


class DiskCache:
    """Content cache keyed by URL hash, with a TTL and gzip storage.

    Raw SEC payloads are large (companyfacts for a mega-cap runs tens of MB),
    so the cache directory is gitignored and compressed on disk.
    """

    def __init__(self, directory=DEFAULT_CACHE_DIR, ttl_seconds=DEFAULT_CACHE_TTL_SECONDS,
                 now=time.time):
        self.directory = Path(directory)
        self.ttl = ttl_seconds
        self._now = now
        self.hits = 0
        self.misses = 0

    def _path(self, url):
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
        return self.directory / digest[:2] / f"{digest}.gz"

    def get(self, url):
        path = self._path(url)
        if not path.exists():
            self.misses += 1
            return None
        if self.ttl is not None and (self._now() - path.stat().st_mtime) > self.ttl:
            self.misses += 1
            return None
        try:
            with gzip.open(path, "rb") as handle:
                payload = handle.read()
        except OSError:
            self.misses += 1
            return None
        self.hits += 1
        return payload

    def put(self, url, payload):
        path = self._path(url)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        with gzip.open(tmp, "wb") as handle:
            handle.write(payload)
        tmp.replace(path)


class SECHttpClient:
    """Fair-access SEC HTTP client with cache, rate limit, retry and dedup."""

    def __init__(self, user_agent=DEFAULT_USER_AGENT, cache=None, rate_limiter=None,
                 opener=None, timeout=DEFAULT_TIMEOUT, max_retries=DEFAULT_MAX_RETRIES,
                 sleep=time.sleep, jitter=random.random):
        if not user_agent or "@" not in user_agent:
            raise ValueError(
                "SEC requires a declaring User-Agent containing a contact address"
            )
        self.user_agent = user_agent
        self.cache = cache if cache is not None else DiskCache()
        self.rate_limiter = rate_limiter if rate_limiter is not None else RateLimiter()
        self.timeout = timeout
        self.max_retries = max_retries
        self._sleep = sleep
        self._jitter = jitter
        # opener(url, headers, timeout) -> bytes. Injected in tests; no network there.
        self._opener = opener or self._urlopen
        self._inflight = {}
        self._inflight_lock = threading.Lock()
        self.stats = {"requests": 0, "cache_hits": 0, "retries": 0, "deduplicated": 0}

    def _urlopen(self, url, headers, timeout):
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read()
            if response.headers.get("Content-Encoding") == "gzip":
                payload = gzip.decompress(payload)
            return payload

    def _headers(self):
        return {
            "User-Agent": self.user_agent,
            "Accept-Encoding": "gzip, deflate",
            "Accept": "application/json, text/plain, */*",
            # SEC serves data.sec.gov without auth; Host is set by urllib.
        }

    def _backoff_seconds(self, attempt):
        # 1s, 2s, 4s, 8s ... plus up to 1s of jitter to avoid lockstep retries.
        return (2 ** attempt) + self._jitter()

    def get_bytes(self, url, use_cache=True):
        """Fetch a URL, honouring cache, dedup, rate limit and retry policy."""
        if use_cache:
            cached = self.cache.get(url)
            if cached is not None:
                self.stats["cache_hits"] += 1
                LOGGER.debug("cache hit %s", url)
                return cached

        # De-duplicate concurrent/repeated in-flight requests for the same URL.
        with self._inflight_lock:
            event = self._inflight.get(url)
            if event is None:
                event = threading.Event()
                self._inflight[url] = event
                owner = True
            else:
                owner = False
        if not owner:
            self.stats["deduplicated"] += 1
            event.wait(timeout=self.timeout * (self.max_retries + 1))
            cached = self.cache.get(url) if use_cache else None
            if cached is not None:
                return cached
            # The owner failed; fall through and try once ourselves.

        try:
            payload = self._fetch_with_retry(url)
        finally:
            if owner:
                with self._inflight_lock:
                    self._inflight.pop(url, None)
                event.set()

        if use_cache:
            self.cache.put(url, payload)
        return payload

    def _fetch_with_retry(self, url):
        last_status = None
        last_message = ""
        for attempt in range(self.max_retries + 1):
            waited = self.rate_limiter.acquire()
            self.stats["requests"] += 1
            started = time.monotonic()
            try:
                payload = self._opener(url, self._headers(), self.timeout)
                LOGGER.info(
                    "sec_get url=%s status=200 bytes=%d attempt=%d wait=%.2fs elapsed=%.2fs",
                    url, len(payload), attempt + 1, waited, time.monotonic() - started,
                )
                return payload
            except urllib.error.HTTPError as exc:
                last_status, last_message = exc.code, str(exc.reason)
                retryable = exc.code in RETRYABLE_STATUS
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                last_status, last_message = None, str(exc)
                retryable = True

            LOGGER.warning(
                "sec_get url=%s status=%s attempt=%d retryable=%s error=%s",
                url, last_status, attempt + 1, retryable, last_message,
            )
            if not retryable or attempt == self.max_retries:
                break
            self.stats["retries"] += 1
            self._sleep(self._backoff_seconds(attempt))

        raise SECHTTPError(url, last_status, last_message, self.max_retries + 1)

    def get_json(self, url, use_cache=True):
        payload = self.get_bytes(url, use_cache=use_cache)
        try:
            return json.loads(payload)
        except json.JSONDecodeError as exc:
            raise SECHTTPError(url, 200, f"invalid JSON: {exc}", 1) from exc

    def get_zip(self, url, use_cache=True):
        """Return a BytesIO of a bulk ZIP payload (companyfacts.zip et al.)."""
        return io.BytesIO(self.get_bytes(url, use_cache=use_cache))
