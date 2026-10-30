#!/usr/bin/env python3
"""V12 INDEXPOP: SEC access for the index-population strand.

Every request goes through scripts/quant/sec/http_client.py (fair access, declaring User-Agent, retry, cache)
at <= 2 requests/s. The cache lives OUTSIDE the repository (private scratchpad). Every network request (not cache
hit) is appended to a ledger so the strand can report its SEC request budget.

Library use:  from secfetch import Fetcher; f = Fetcher(repo_root, private_dir); f.get(url)
CLI:          python3 -I secfetch.py <repo-root> <private-dir> <url> [<out-file>]
"""
import json
import sys
import time
from pathlib import Path


class Fetcher:
    def __init__(self, root, private_dir, offline=False):
        self.root = Path(root).resolve()
        self.private = Path(private_dir).resolve()
        if str(self.private).startswith(str(self.root) + '/'):
            raise SystemExit('PRIVATE_DIR_MUST_BE_OUTSIDE_REPOSITORY')
        sys.path.insert(0, str(self.root / 'scripts' / 'quant' / 'sec'))
        import http_client as H  # noqa: E402
        self.H = H
        self.client = H.SECHttpClient(cache=H.DiskCache(self.private / 'http-cache', ttl_seconds=None),
                                      rate_limiter=H.RateLimiter(rate_per_second=2.0, burst=1))
        self.offline = offline
        self.ledger = self.private / 'request-ledger.jsonl'

    def cached(self, url):
        return self.client.cache.get(url) is not None

    def get(self, url, expected_statuses=(404,)):
        """Bytes of url (cache first). Raises H.SECHTTPError on failure; LookupError when offline and not cached."""
        hit = self.client.cache.get(url)
        if hit is not None:
            return hit
        if self.offline:
            raise LookupError('NOT_CACHED:' + url)
        before = self.client.stats['requests']
        status = 200
        try:
            data = self.client.get_bytes(url, expected_statuses=expected_statuses)
        except self.H.SECHTTPError as e:
            status = e.status
            raise
        finally:
            with open(self.ledger, 'a') as fh:
                fh.write(json.dumps({'t': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'url': url, 'status': status,
                                     'requests': self.client.stats['requests'] - before}) + '\n')
        return data

    def get_json(self, url):
        return json.loads(self.get(url).decode('utf-8'))


def ledger_count(private_dir):
    p = Path(private_dir) / 'request-ledger.jsonl'
    if not p.exists():
        return {'urls': 0, 'requests': 0}
    rows = [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
    return {'urls': len(rows), 'requests': sum(r['requests'] for r in rows), 'failed': sum(1 for r in rows if r['status'] != 200)}


if __name__ == '__main__':
    f = Fetcher(sys.argv[1], sys.argv[2])
    b = f.get(sys.argv[3])
    if len(sys.argv) > 4:
        Path(sys.argv[4]).write_bytes(b)
    else:
        sys.stdout.write(b[:4000].decode('utf-8', 'replace'))
