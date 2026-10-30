"""V13 LARGECAP: SEC access helpers (stdlib only), protocol docs/quant-recovery/v13/largecap/protocol-1.0.0.json.

Every network request goes through the repository fair-access client scripts/quant/sec/http_client.py
(User-Agent 'VisionUniverseResearch info@visionuniverse.de', token bucket <= 2 requests/second, retry/backoff).
Raw bodies live only in the private scratchpad (V13_LARGECAP_PRIVATE/http-cache). Bodies cached by earlier strands are
re-used read-only and re-hashed on use. Ledger: V13_LARGECAP_PRIVATE/request-ledger.jsonl (one line per network request).
"""
import hashlib
import html
import json
import os
import pathlib
import re
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'scripts' / 'quant' / 'sec'))
from http_client import SECHttpClient, RateLimiter, DiskCache  # noqa: E402

SCRATCH = pathlib.Path('/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad')
PRIVATE = pathlib.Path(os.environ.get('V13_LARGECAP_PRIVATE', str(SCRATCH / 'v13-private' / 'largecap')))
REUSE_CACHES = [SCRATCH / 'v12-private' / 'largecap' / 'http-cache', SCRATCH / 'v10-private' / 'corporate-actions' / 'http-cache',
                SCRATCH / 'v10-private' / 'population' / 'http-cache', SCRATCH / 'v12-private' / 'indexpop' / 'http-cache',
                SCRATCH / 'v12-private' / 'listref' / 'http-cache', SCRATCH / 'v12-private' / 'mcap' / 'http-cache']


def _assert_private(p):
    p = pathlib.Path(p).resolve()
    if p == ROOT or ROOT in p.parents:
        raise SystemExit('PRIVATE_OUTPUT_REQUIRED: ' + str(p))
    return p


_cache = DiskCache(directory=_assert_private(PRIVATE / 'http-cache'), ttl_seconds=None)
_reuse = [DiskCache(directory=d, ttl_seconds=None) for d in REUSE_CACHES if d.exists()]
CLIENT = SECHttpClient(cache=_cache, rate_limiter=RateLimiter(rate_per_second=2, burst=1))
STATS = {'network': 0, 'ownCache': 0, 'reusedCache': 0}
BOT_TAG = re.compile(rb'<script type="text/javascript"\s+src="/[^"]*"></script>(?=</body>)')


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def norm_body(b):
    return BOT_TAG.sub(b'', b)


def cached(url):
    body = _cache.get(url)
    if body is not None:
        return body
    for c in _reuse:
        body = c.get(url)
        if body is not None:
            return body
    return None


def get(url):
    body = _cache.get(url)
    src = 'ownCache'
    if body is None:
        for c in _reuse:
            body = c.get(url)
            if body is not None:
                src = 'reusedCache'
                break
    if body is None:
        before = CLIENT.stats['requests']
        body = CLIENT.get_bytes(url, use_cache=False)
        _cache.put(url, body)
        src = 'network'
        with open(PRIVATE / 'request-ledger.jsonl', 'a') as fh:
            fh.write(json.dumps({'t': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'url': url, 'bytes': len(body),
                                 'requests': CLIENT.stats['requests'] - before}) + '\n')
    STATS[src] += 1
    return body, {'url': url, 'bytes': len(body), 'sha256': sha256(body), 'sha256Normalized': sha256(norm_body(body)), 'via': src}


def cik10(cik):
    return '%010d' % int(cik)


def submissions(cik):
    url = 'https://data.sec.gov/submissions/CIK%s.json' % cik10(cik)
    body, meta = get(url)
    doc = json.loads(body)
    metas = [meta]
    cols = doc['filings']['recent']
    filings = [dict(zip(cols.keys(), vals)) for vals in zip(*cols.values())]
    for f in doc['filings'].get('files', []):
        b, m = get('https://data.sec.gov/submissions/' + f['name'])
        metas.append(m)
        page = json.loads(b)
        filings += [dict(zip(page.keys(), vals)) for vals in zip(*page.values())]
    filings.sort(key=lambda f: (f['filingDate'], f['accessionNumber']))
    return {k: doc.get(k) for k in ('cik', 'name', 'tickers', 'exchanges', 'formerNames')}, filings, metas


def archive_url(cik, accession, name=''):
    return 'https://www.sec.gov/Archives/edgar/data/%d/%s/%s' % (int(cik), accession.replace('-', ''), name)


def full_text_url(cik, accession):
    return archive_url(cik, accession, accession + '.txt')


def text_of(body):
    t = body.decode('utf-8', errors='replace') if isinstance(body, bytes) else body
    t = re.sub(r'(?is)<(script|style)\b.*?</\1>', ' ', t)
    t = re.sub(r'<[^>]+>', ' ', t)
    return re.sub(r'\s+', ' ', html.unescape(t)).strip()
