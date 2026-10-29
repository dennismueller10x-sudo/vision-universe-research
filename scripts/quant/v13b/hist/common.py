#!/usr/bin/env python3
"""V13b HIST - shared SEC access and text helpers (stdlib only).

Every network request goes through scripts/quant/sec/http_client.py (fair access, declaring User-Agent
'VisionUniverseResearch info@visionuniverse.de', retry) at <= 2 requests/s. The own cache lives in the private
scratchpad (outside the repository); caches of earlier strands are only read. Each network request (not a cache
hit) is appended to request-ledger.jsonl in the private directory.
"""
import hashlib
import html
import json
import re
import sys
import time
from pathlib import Path

MAX_BYTES = 2_000_000


class Fetcher:
    def __init__(self, root, private_dir, extra_caches=(), offline=False):
        self.root = Path(root).resolve()
        self.private = Path(private_dir).resolve()
        if str(self.private).startswith(str(self.root) + '/'):
            raise SystemExit('PRIVATE_DIR_MUST_BE_OUTSIDE_REPOSITORY')
        sys.path.insert(0, str(self.root / 'scripts' / 'quant' / 'sec'))
        import http_client as H  # noqa: E402
        self.H = H
        self.client = H.SECHttpClient(cache=H.DiskCache(self.private / 'http-cache', ttl_seconds=None),
                                      rate_limiter=H.RateLimiter(rate_per_second=2.0, burst=1))
        self.extra = [H.DiskCache(Path(c), ttl_seconds=None) for c in extra_caches]
        self.offline = offline
        self.ledger = self.private / 'request-ledger.jsonl'

    def _cached(self, key):
        hit = self.client.cache.get(key)
        if hit is not None:
            return hit
        for c in self.extra:
            hit = c.get(key)
            if hit is not None:
                return hit
        return None

    def _log(self, url, status, n):
        with open(self.ledger, 'a') as fh:
            fh.write(json.dumps({'t': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'url': url, 'status': status, 'requests': n}) + '\n')

    def get(self, url):
        hit = self._cached(url)
        if hit is not None:
            return hit
        if self.offline:
            raise LookupError('NOT_CACHED:' + url)
        before = self.client.stats['requests']
        status = 200
        try:
            return self.client.get_bytes(url, expected_statuses=(404,))
        except self.H.SECHTTPError as e:
            status = e.status
            raise
        finally:
            self._log(url, status, self.client.stats['requests'] - before)

    def get_head(self, url, max_bytes=MAX_BYTES):
        """(bytes, total, truncated): the document (any cache, else one plain request; sec.gov does not honour
        HTTP ranges on Archives paths), cut to its first max_bytes for parsing."""
        full = self.get(url)
        return full[:max_bytes], len(full), len(full) > max_bytes


def submissions(f, cik):
    """All filings of a CIK: list of dicts form/filingDate/accession/items/primaryDocument (recent + older pages)."""
    url = 'https://data.sec.gov/submissions/CIK%010d.json' % int(cik)
    raw = f.get(url)
    d = json.loads(raw)
    rows = []

    def add(b):
        n = len(b['form'])
        for i in range(n):
            rows.append({'form': b['form'][i], 'filingDate': b['filingDate'][i], 'accession': b['accessionNumber'][i],
                         'items': (b.get('items') or [''] * n)[i] or '', 'primaryDocument': (b.get('primaryDocument') or [''] * n)[i] or ''})
    add(d['filings']['recent'])
    for extra in d['filings'].get('files', []):
        add(json.loads(f.get('https://data.sec.gov/submissions/' + extra['name'])))
    return {'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'name': d.get('name'),
            'formerNames': [x.get('name') for x in d.get('formerNames', [])], 'rows': rows}


def filing_url(cik, accession):
    return 'https://www.sec.gov/Archives/edgar/data/%d/%s/%s.txt' % (int(cik), accession.replace('-', ''), accession)


_TAG = re.compile(r'<[^>]{0,2000}>', re.S)


def text_of(raw):
    """Tag-stripped, entity-decoded, whitespace-normalised text of a complete submission (all documents)."""
    s = raw.decode('latin-1', 'replace')
    s = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', s)
    s = _TAG.sub(' ', s)
    s = html.unescape(s).replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', s)


def norm_ws(s):
    return re.sub(r'\s+', ' ', s).strip()


def sha(b):
    return hashlib.sha256(b if isinstance(b, bytes) else b.encode('utf-8')).hexdigest()


def header_ciks(raw):
    """(subject CIKs, filed-by CIKs) from an SGML submission header."""
    head = raw[:20000].decode('latin-1', 'replace')
    subj, by, cur = [], [], None
    for line in head.splitlines():
        u = line.strip().upper()
        if u.startswith('SUBJECT COMPANY'):
            cur = subj
        elif u.startswith('FILED BY') or u.startswith('FILER:'):
            cur = by
        m = re.match(r'CENTRAL INDEX KEY:\s*(\d+)', u)
        if m and cur is not None:
            cur.append(int(m.group(1)))
        if u.startswith('</SEC-HEADER>'):
            break
    return subj, by
