"""V12 LISTREF: shared helpers (stdlib only).

SEC access goes exclusively through the repository fair-access client scripts/quant/sec/http_client.py
(User-Agent "VisionUniverseResearch info@visionuniverse.de", RateLimiter 2 req/s). New bodies are cached in this
strand's private scratchpad cache; read-only lookups first consult the V10 private caches (same URL-hash layout), so
EDGAR full-index files already fetched by V10 are reused instead of re-downloaded. Raw bodies never enter the repo.
"""
import gzip
import hashlib
import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
SCRATCH = pathlib.Path(os.environ.get(
    'V12_SCRATCH', '/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad'))
PRIVATE = pathlib.Path(os.environ.get('V12_LISTREF_PRIVATE', str(SCRATCH / 'v12-private' / 'listref')))
READONLY_CACHES = [SCRATCH / 'v10-private' / 'population' / 'http-cache', SCRATCH / 'v10-private' / 'corporate-actions' / 'http-cache']
UA = 'VisionUniverseResearch info@visionuniverse.de'

sys.path.insert(0, str(ROOT / 'scripts' / 'quant' / 'sec'))
from http_client import SECHttpClient, RateLimiter, DiskCache  # noqa: E402


def _assert_private(path):
    p = pathlib.Path(path).resolve()
    if p == ROOT or ROOT in p.parents:
        raise SystemExit('PRIVATE_OUTPUT_REQUIRED: ' + str(p))
    return p


_cache = DiskCache(directory=_assert_private(PRIVATE / 'http-cache'), ttl_seconds=None)
CLIENT = SECHttpClient(user_agent=UA, cache=_cache, rate_limiter=RateLimiter(rate_per_second=2, burst=2))
STATS = {'network': 0, 'ownCache': 0, 'v10Cache': 0}


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def _readonly(url):
    d = hashlib.sha256(url.encode('utf-8')).hexdigest()
    for c in READONLY_CACHES:
        p = c / d[:2] / (d + '.gz')
        if p.exists():
            with gzip.open(p, 'rb') as h:
                return h.read()
    return None


def get(url, network=True):
    """Returns (bytes, meta). Order: own private cache, V10 caches (read-only), network (fair-access client)."""
    body = _cache.get(url)
    src = 'ownCache'
    if body is None:
        body = _readonly(url)
        src = 'v10Cache'
    if body is None:
        if not network:
            raise LookupError('NOT_CACHED ' + url)
        before = CLIENT.stats['requests']
        body = CLIENT.get_bytes(url)
        STATS['network'] += CLIENT.stats['requests'] - before
        src = 'network'
    else:
        STATS[src] += 1
    return body, {'url': url, 'bytes': len(body), 'sha256': sha256(body), 'from': src}


def write_json(path, obj, compact=False):
    p = pathlib.Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        txt = json.dumps(obj, separators=(',', ':'), ensure_ascii=False, sort_keys=False)
    else:
        txt = json.dumps(obj, indent=1, ensure_ascii=False)
    if str(p).endswith('.gz'):
        with gzip.open(p, 'wt', encoding='utf-8') as h:
            h.write(txt + '\n')
    else:
        p.write_text(txt + '\n')


def js_hash(obj):
    return sha256(json.dumps(obj, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))


def sha256_file(p):
    return sha256(pathlib.Path(p).read_bytes())
