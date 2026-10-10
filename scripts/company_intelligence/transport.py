"""Bounded public-source HTTP with robots, cache validators and safe redirect handling."""
import hashlib
import ipaddress
import json
import socket
import time
import urllib.error
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from .model import canonical_url
from .store import atomic_json


class SourceError(RuntimeError):
    pass


class BudgetExhausted(SourceError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def validate_public_url(url, resolve=socket.getaddrinfo):
    canonical = canonical_url(url)
    if not canonical or urlsplit(canonical).port not in (None, 80, 443):
        raise SourceError('UNSAFE_URL')
    host = urlsplit(canonical).hostname
    if host in ('localhost', 'metadata.google.internal') or host.endswith(('.local', '.internal')):
        raise SourceError('PRIVATE_HOST')
    try:
        addresses = {r[4][0] for r in resolve(host, urlsplit(canonical).port or 443, type=socket.SOCK_STREAM)}
    except OSError as exc:
        raise SourceError('DNS_UNAVAILABLE') from exc
    if not addresses or any(not ipaddress.ip_address(a).is_global for a in addresses):
        raise SourceError('PRIVATE_ADDRESS')
    return canonical


class PublicHTTP:
    MAX_BYTES = 2 * 1024 * 1024

    def __init__(self, cache, budget=60, timeout=15, interval=2, max_seconds=600, opener=None, sleep=time.sleep, clock=time.time, validator=validate_public_url):
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.budget, self.timeout, self.interval = budget, timeout, interval
        self.opener = opener or urllib.request.build_opener(NoRedirect()).open
        self.sleep, self.clock, self.validator = sleep, clock, validator
        self.requests = 0
        self.stats = {'memoHits': 0, 'cacheHits': 0, 'notModified': 0, 'retries': 0, 'bytesDownloaded': 0}
        self.deadline = clock() + max_seconds
        self.host_delay = {}
        self.last_request = 0
        self.host_last = {}
        self.memo, self.robots = {}, {}
        self.user_agent = 'VisionUniverseResearch/CompanyIntelligence (+https://visionuniverse.de; info@visionuniverse.de)'

    def _paths(self, url):
        key = hashlib.sha256(url.encode()).hexdigest()
        return self.cache / (key + '.json'), self.cache / (key + '.body')

    def _cached(self, url):
        meta, body = self._paths(url)
        try:
            data = json.loads(meta.read_text())
            payload = body.read_bytes()
            if hashlib.sha256(payload).hexdigest() != data.get('sha256'):
                return {}, None
            return data, payload
        except (OSError, ValueError):
            return {}, None

    def _wait(self, url):
        if self.clock() >= self.deadline:
            raise BudgetExhausted('NETWORK_TIME_BUDGET_EXHAUSTED')
        if self.requests >= self.budget:
            raise BudgetExhausted('NETWORK_BUDGET_EXHAUSTED')
        host = urlsplit(url).hostname
        delay = max(self.interval - (self.clock() - self.last_request),
                    max(15 if host == 'api.gdeltproject.org' else 5, self.host_delay.get(host, 0)) - (self.clock() - self.host_last.get(host, 0)), 0)
        if delay:
            if self.clock() + delay >= self.deadline:
                raise BudgetExhausted('NETWORK_TIME_BUDGET_EXHAUSTED')
            self.sleep(delay)
        if self.clock() >= self.deadline:
            raise BudgetExhausted('NETWORK_TIME_BUDGET_EXHAUSTED')
        self.requests += 1
        self.last_request = self.clock()
        self.host_last[host] = self.clock()

    def robots_allowed(self, url):
        parts = urlsplit(url)
        origin = parts.scheme + '://' + parts.netloc
        if origin not in self.robots:
            try:
                r = self.get(origin + '/robots.txt', robots=False, ttl=86400)
                parser = urllib.robotparser.RobotFileParser()
                parser.parse(r['body'].decode('utf-8', 'replace').splitlines())
                self.robots[origin] = parser
            except BudgetExhausted:
                raise
            except SourceError as exc:
                if str(exc) == 'HTTP_404':
                    parser = urllib.robotparser.RobotFileParser()
                    parser.parse([])
                    self.robots[origin] = parser
                else:
                    raise SourceError('ROBOTS_UNAVAILABLE:' + str(exc)) from exc
        parser = self.robots[origin]
        if not parser.can_fetch(self.user_agent, url):
            raise SourceError('ROBOTS_DISALLOWED')
        delay = parser.crawl_delay(self.user_agent) or parser.crawl_delay('*') or 0
        self.host_delay[parts.hostname] = max(5, min(delay, 60))
        if delay > 60:
            raise SourceError('CRAWL_DELAY_REQUIRES_DEFERRED_SCHEDULING')
        return True

    def get(self, url, robots=True, ttl=0, persist=True):
        if self.clock() >= self.deadline:
            raise BudgetExhausted('NETWORK_TIME_BUDGET_EXHAUSTED')
        url = self.validator(url)
        key = (url, robots)
        if not persist:
            self.memo.pop(key, None)
        if persist and key in self.memo:
            self.stats['memoHits'] += 1
            return self.memo[key]
        if robots:
            self.robots_allowed(url)
        cached, body = self._cached(url)
        if body is not None and self.clock() - cached.get('checked', 0) < ttl:
            self.stats['cacheHits'] += 1
            result = {**cached, 'body': body, 'cached': True}
            if persist:self.memo[key] = result
            return result
        headers = {'User-Agent': self.user_agent, 'Accept': 'application/rss+xml,application/atom+xml,application/json,text/html,text/plain;q=0.8', 'Accept-Encoding': 'identity'}
        if body is not None:
            if cached.get('etag'):
                headers['If-None-Match'] = cached['etag']
            if cached.get('lastModified'):
                headers['If-Modified-Since'] = cached['lastModified']
        current = url
        redirects = []
        for attempt in range(3):
            try:
                for _ in range(5):
                    self._wait(current)
                    try:
                        with self.opener(urllib.request.Request(current, headers=headers), timeout=min(self.timeout, self.deadline - self.clock())) as response:
                            payload = response.read(self.MAX_BYTES + 1)
                            self.stats['bytesDownloaded'] += len(payload)
                            if len(payload) > self.MAX_BYTES:
                                raise SourceError('SOURCE_TOO_LARGE')
                            encoding = response.headers.get('Content-Encoding', '').lower()
                            if encoding in ('gzip', 'deflate'):
                                import zlib
                                decoder = zlib.decompressobj(16 + zlib.MAX_WBITS if encoding == 'gzip' else zlib.MAX_WBITS)
                                try:
                                    payload = decoder.decompress(payload, self.MAX_BYTES + 1)
                                except zlib.error as exc:
                                    raise SourceError('INVALID_COMPRESSED_SOURCE') from exc
                                if len(payload) > self.MAX_BYTES or not decoder.eof:
                                    raise SourceError('SOURCE_TOO_LARGE_OR_TRUNCATED')
                            meta = {'url': url, 'finalUrl': current, 'checked': self.clock(), 'contentType': response.headers.get('Content-Type', ''),
                                    'etag': response.headers.get('ETag'), 'lastModified': response.headers.get('Last-Modified'), 'redirects': redirects,
                                    'sha256': hashlib.sha256(payload).hexdigest()}
                            if persist:
                                mp, bp = self._paths(url)
                                tmp = bp.with_suffix('.tmp')
                                tmp.write_bytes(payload)
                                tmp.replace(bp)
                                atomic_json(mp, meta)
                            result = {**meta, 'body': payload, 'cached': False}
                            if persist:self.memo[key] = result
                            return result
                    except urllib.error.HTTPError as exc:
                        if exc.code in (301, 302, 303, 307, 308):
                            new = self.validator(urljoin(current, exc.headers.get('Location', '')))
                            if not exc.headers.get('Location') or new in redirects or new == current:
                                raise SourceError('REDIRECT_LOOP')
                            if robots:
                                self.robots_allowed(new)
                            redirects.append(current)
                            current = new
                            # Never send a source's cache validators to another host.
                            headers = {k: v for k, v in headers.items() if not k.startswith('If-')}
                            continue
                        raise
                raise SourceError('TOO_MANY_REDIRECTS')
            except urllib.error.HTTPError as exc:
                if exc.code == 304 and body is not None:
                    self.stats['notModified'] += 1
                    cached['checked'] = self.clock()
                    if persist:atomic_json(self._paths(url)[0], cached)
                    result = {**cached, 'body': body, 'cached': True}
                    if persist:self.memo[key] = result
                    return result
                if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                    raise SourceError('HTTP_' + str(exc.code)) from exc
                self.stats['retries'] += 1
                retry = exc.headers.get('Retry-After')
                delay = 2 ** attempt
                if retry:
                    try:
                        delay = max(delay, float(retry))
                    except ValueError:
                        try:
                            delay = max(delay, parsedate_to_datetime(retry).timestamp() - self.clock())
                        except (ValueError, TypeError):
                            pass
                if delay > 30:
                    raise SourceError('RATE_LIMIT_DEFER:' + str(int(delay))) from exc
                self.sleep(delay)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                if attempt == 2:
                    raise SourceError('NETWORK_UNAVAILABLE') from exc
                self.stats['retries'] += 1
                self.sleep(2 ** attempt)
        raise SourceError('RETRY_EXHAUSTED')

    def prune(self, age_days=7, byte_budget=64 * 1024 * 1024):
        cutoff = self.clock() - age_days * 86400
        retained = 0
        for path in sorted(self.cache.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True):
            body = path.with_suffix('.body')
            size = path.stat().st_size + (body.stat().st_size if body.is_file() else 0)
            if path.stat().st_mtime < cutoff or retained + size > byte_budget:
                path.unlink(missing_ok=True)
                body.unlink(missing_ok=True)
            else:
                retained += size
