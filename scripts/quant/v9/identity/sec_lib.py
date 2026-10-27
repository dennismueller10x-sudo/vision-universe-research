"""V9 identity: thin wrapper around the repository SEC client (scripts/quant/sec/http_client.py).

- Rate limit 2 req/s (shared SEC fair-access budget), existing default User-Agent.
- Raw bodies live only in the private scratch cache (never in the repo).
- Every fetched body is described by url, bytes and SHA-256 so committed evidence can cite it.
Standard library only.
"""
import hashlib
import html
import json
import os
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'scripts' / 'quant' / 'sec'))
from http_client import SECHttpClient, RateLimiter, DiskCache  # noqa: E402

PRIVATE = pathlib.Path(os.environ.get(
    'V9_IDENTITY_PRIVATE',
    '/tmp/claude-0/-home-user-vision-universe-research/84af0cda-6f74-5ce8-afa8-dfb2e62db3b4/scratchpad/v9-private/identity'))
PREFIX_BYTES = 2 * 1024 * 1024


class _PrefixClient(SECHttpClient):
    """Reads at most PREFIX_BYTES of a body (same convention as V8 prefix audits).
    A distinct URL fragment keys the cache so a prefix never masquerades as a full body."""
    def _urlopen(self, url, headers, timeout):
        clean = url.split('#v9-prefix-')[0]
        request = urllib.request.Request(clean, headers={k: v for k, v in headers.items() if k.lower() != 'accept-encoding'})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read(PREFIX_BYTES)


def _assert_private(path):
    p = pathlib.Path(path).resolve()
    if p == ROOT or ROOT in p.parents:
        raise SystemExit('PRIVATE_OUTPUT_REQUIRED: ' + str(p))
    return p


_cache = DiskCache(directory=_assert_private(PRIVATE / 'http-cache'), ttl_seconds=None)
_limiter = RateLimiter(rate_per_second=2, burst=2)
CLIENT = SECHttpClient(cache=_cache, rate_limiter=_limiter)
PREFIX_CLIENT = _PrefixClient(cache=_cache, rate_limiter=_limiter)


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def get(url, prefix=False):
    """Returns (bytes, meta). prefix=True reads at most PREFIX_BYTES (meta.prefixBytes)."""
    if prefix:
        body = PREFIX_CLIENT.get_bytes(url + '#v9-prefix-%d' % PREFIX_BYTES)
        meta = {'url': url, 'bytesRead': len(body), 'prefixLimit': PREFIX_BYTES,
                'complete': len(body) < PREFIX_BYTES, 'sha256': sha256(body)}
    else:
        body = CLIENT.get_bytes(url)
        meta = {'url': url, 'bytesRead': len(body), 'complete': True, 'sha256': sha256(body)}
    return body, meta


def cik10(cik):
    return '%010d' % int(cik)


def tickers_exchange():
    body, meta = get('https://www.sec.gov/files/company_tickers_exchange.json')
    doc = json.loads(body)
    rows = [dict(zip(doc['fields'], r)) for r in doc['data']]
    return rows, meta


def submissions(cik):
    """Submissions JSON incl. all older pages, merged into one filing list."""
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
    head = {k: doc.get(k) for k in ('cik', 'name', 'tickers', 'exchanges', 'formerNames', 'sic', 'sicDescription', 'entityType', 'stateOfIncorporation', 'fiscalYearEnd')}
    return head, filings, metas


def doc_url(cik, accession, primary):
    return 'https://www.sec.gov/Archives/edgar/data/%d/%s/%s' % (int(cik), accession.replace('-', ''), primary)


def _text(fragment):
    t = re.sub(r'<[^>]+>', ' ', fragment)
    return re.sub(r'\s+', ' ', html.unescape(t)).strip()


IX_RE = re.compile(r'<ix:nonNumeric\b([^>]*)>(.*?)</ix:nonNumeric>', re.S | re.I)
ATTR_RE = re.compile(r'(\w+(?::\w+)?)\s*=\s*"([^"]*)"')


def cover_classes(body):
    """Inline-XBRL cover facts per contextRef: dei:Security12bTitle, dei:TradingSymbol,
    dei:SecurityExchangeName (+ dei:EntityRegistrantName, dei:EntityCentralIndexKey)."""
    text = body.decode('utf-8', errors='replace')
    by_ctx, entity = {}, {}
    for attrs, inner in IX_RE.findall(text):
        a = dict(ATTR_RE.findall(attrs))
        name = a.get('name', '')
        if name in ('dei:Security12bTitle', 'dei:TradingSymbol', 'dei:SecurityExchangeName', 'dei:NoTradingSymbolFlag'):
            by_ctx.setdefault(a.get('contextRef', ''), {})[name.split(':')[1]] = _text(inner)
        elif name in ('dei:EntityRegistrantName', 'dei:EntityCentralIndexKey', 'dei:DocumentType', 'dei:EntityFileNumber'):
            entity.setdefault(name.split(':')[1], _text(inner))
    classes = [dict(ctx=k, **v) for k, v in by_ctx.items() if 'TradingSymbol' in v or 'Security12bTitle' in v]
    return classes, entity


def quote(body, pattern, width=280):
    """Short verbatim quote (<=300 chars) around the first regex match in tag-stripped text."""
    text = _text(body.decode('utf-8', errors='replace'))
    m = re.search(pattern, text, re.I)
    if not m:
        return None
    s = max(0, m.start() - width // 3)
    return text[s:s + width]


NOT_COMMON_RE = re.compile(r'preferred|depositary|warrant|\bunits?\b|\bnotes?\b|debenture|rights?\b|senior|subordinated|trust preferred|% ', re.I)
COMMON_RE = re.compile(r'common stock|common shares|ordinary shares|class [a-z] common|shares of beneficial interest', re.I)


def class_kind(title):
    if not title:
        return 'UNKNOWN'
    if NOT_COMMON_RE.search(title):
        return 'NOT_COMMON'
    if COMMON_RE.search(title):
        return 'COMMON'
    return 'UNKNOWN'


MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
PRICE_STMT_RE = re.compile(
    r'(?:last reported (?:sale|sales) price|closing (?:sale |sales )?price)(?:[^$.]|\.(?=\d)){0,160}?'
    r'(?:on|as of) (?P<date>(?:%s) \d{1,2}, \d{4})(?:[^$]){0,60}?\$\s?(?P<price>\d{1,6}(?:,\d{3})*\.\d{2,4})' % MONTHS, re.I)
PRICE_STMT_RE2 = re.compile(
    r'(?:last reported (?:sale|sales) price|closing (?:sale |sales )?price)(?:[^$]){0,60}?\$\s?(?P<price>\d{1,6}(?:,\d{3})*\.\d{2,4})'
    r'(?:[^$.]|\.(?=\d)){0,80}?(?:on|as of) (?P<date>(?:%s) \d{1,2}, \d{4})' % MONTHS, re.I)


def price_statements(body):
    """(isoDate, price, quote) triples for 'closing/last reported sale price ... on <date> ... $x' sentences.
    The quote is kept so every extraction can be re-read by a human and re-parsed independently."""
    import datetime as _dt
    text = _text(body.decode('utf-8', errors='replace'))
    out, seen = [], set()
    for rx in (PRICE_STMT_RE, PRICE_STMT_RE2):
        for m in rx.finditer(text):
            try:
                d = _dt.datetime.strptime(m.group('date'), '%B %d, %Y').date().isoformat()
            except ValueError:
                continue
            p = float(m.group('price').replace(',', ''))
            if (d, p) in seen:
                continue
            seen.add((d, p))
            s = max(0, m.start() - 60)
            out.append((d, p, text[s:min(len(text), m.end() + 20)][:300]))
    return out
