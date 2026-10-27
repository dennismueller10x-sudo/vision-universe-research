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
        clean, _, size = url.partition('#v9-prefix-')
        request = urllib.request.Request(clean, headers={k: v for k, v in headers.items() if k.lower() != 'accept-encoding'})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read(int(size or PREFIX_BYTES))


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
        size = PREFIX_BYTES if prefix is True else int(prefix)
        body = PREFIX_CLIENT.get_bytes(url + '#v9-prefix-%d' % size)
        meta = {'url': url, 'bytesRead': len(body), 'prefixLimit': size,
                'complete': len(body) < size, 'sha256': sha256(body)}
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
    """Inline-XBRL cover facts per class row: dei:Security12bTitle, dei:TradingSymbol,
    dei:SecurityExchangeName (+ dei:EntityRegistrantName, dei:EntityCentralIndexKey).
    Rows are grouped by contextRef when every context carries at most one fact of each name;
    otherwise (several classes tagged in one context, e.g. ADS + ordinary shares) by document order."""
    text = body.decode('utf-8', errors='replace')
    facts, entity = [], {}
    for attrs, inner in IX_RE.findall(text):
        a = dict(ATTR_RE.findall(attrs))
        name = a.get('name', '')
        if name in ('dei:Security12bTitle', 'dei:TradingSymbol', 'dei:SecurityExchangeName', 'dei:NoTradingSymbolFlag'):
            facts.append((a.get('contextRef', ''), name.split(':')[1], _text(inner)))
        elif name in ('dei:EntityRegistrantName', 'dei:EntityCentralIndexKey', 'dei:DocumentType', 'dei:EntityFileNumber'):
            entity.setdefault(name.split(':')[1], _text(inner))
    seen, collision = set(), False
    for ctx, name, _ in facts:
        if (ctx, name) in seen:
            collision = True
        seen.add((ctx, name))
    rows = []
    if not collision:
        by_ctx = {}
        for ctx, name, val in facts:
            if ctx not in by_ctx:
                by_ctx[ctx] = {'ctx': ctx}
                rows.append(by_ctx[ctx])
            by_ctx[ctx][name] = val
    else:
        for ctx, name, val in facts:
            if not rows or name in rows[-1]:
                rows.append({'ctx': ctx, 'grouping': 'DOCUMENT_ORDER'})
            rows[-1][name] = val
    classes = [r for r in rows if 'TradingSymbol' in r or 'Security12bTitle' in r]
    return classes, entity


def quote(body, pattern, width=280):
    """Short verbatim quote (<=300 chars) around the first regex match in tag-stripped text."""
    text = _text(body.decode('utf-8', errors='replace'))
    m = re.search(pattern, text, re.I)
    if not m:
        return None
    s = max(0, m.start() - width // 3)
    return text[s:s + width]


KIND_RULES = [
    ('DEPOSITARY_PREFERRED', re.compile(r'depositary.{0,200}preferred|preferred.{0,200}depositary', re.I)),
    ('ADS', re.compile(r'american depositary|depositary shares|\bADS\b|\bADR', re.I)),
    ('PREFERRED', re.compile(r'preferred|preference', re.I)),
    ('WARRANT', re.compile(r'warrant', re.I)),
    ('UNIT', re.compile(r'\bunits?\b', re.I)),
    ('RIGHT', re.compile(r'\brights?\b', re.I)),
    ('DEBT', re.compile(r'\bnotes?\b|debenture|\bbonds?\b|senior|subordinated', re.I)),
    ('COMMON', re.compile(r'common stock|common shares|ordinary shares|class [a-z] common|subordinate voting shares|common share|ordinary share|shares of beneficial interest|limited voting shares', re.I)),
]


def class_kind(title):
    """Instrument class from an SEC cover 'Title of each class' (dei:Security12bTitle)."""
    if not title:
        return 'UNKNOWN'
    for kind, rx in KIND_RULES:
        if rx.search(title):
            return kind
    return 'UNKNOWN'


def norm_symbol(sym):
    """Comparable symbol: provider 'DBRG_P_H' / SEC 'DBRG PRH' / map 'DBRG-PH' -> 'DBRGPH'."""
    s = re.sub(r'(?<=[A-Z])Pr(?=[A-Z]?$)', 'P', (sym or '').strip())  # SEC style 'PSAPrQ'
    s = s.upper()
    s = re.sub(r'_P_', 'P', s)
    s = re.sub(r'[\s.\-/]+PR\s*(?=[A-Z]?$)', 'P', s)
    s = re.sub(r'[\s.\-/]+P(?=[A-Z]$)', 'P', s)
    return re.sub(r'[^A-Z0-9]', '', s)


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


US_VENUE_RE = re.compile(r'new york stock exchange|\bnyse\b|nasdaq|american stock exchange|\bamex\b|nyse american|nyse mkt|nyse arca|cboe|bats', re.I)
NON_US_OR_OTC_RE = re.compile(r'\btsx\b|toronto stock exchange|canadian securities exchange|\bcse\b|tsx venture|euronext|lima stock exchange|bolsa|london stock exchange|\baim\b|frankfurt|six swiss|\botc\b|otcqb|otcqx|pink sheets|bulletin board|over[- ]the[- ]counter|hong kong stock exchange|australian securities exchange|\basx\b|oslo|b\u00f8rs|bermuda|tel aviv|\btase\b|johannesburg|\bjse\b|deutsche b\u00f6rse|xetra|stockholm|copenhagen|helsinki|mexican stock|singapore|tokyo|korea exchange|shanghai|shenzhen|borsa|bourse|\bnzx\b', re.I)
OWN_RE = re.compile(r'\bour\b|\bwe\b|the company[\u2019\']s|\bregistrant', re.I)
INTENT_RE = re.compile(r'appl(?:y|ied|ication)|intend|expect|will |anticipate|propos|to be listed|approved for listing|subject to|upon (?:the )?(?:closing|consummation|completion)', re.I)
SENTENCE_END_RE = re.compile(r'[a-z0-9\)\u201d"]\.\s+(?=[A-Z\u201c"])')


def ticker_symbol_statements(text, sym, factual=False):
    """Statements binding `sym` (case-sensitive, whole token, not a when-issued 'WI' or '.XX' foreign suffix)
    to 'symbol', where the same sentence names a US national exchange before the symbol and no non-US/OTC
    venue appears between that exchange name and the symbol. factual=True additionally rejects statements of
    intent (apply/expect/will/...). Returns [(start, quote)]."""
    t = re.escape(sym)
    pat = re.compile(r'(?i:symbols?)\W{0,6}(?:is\W{0,3})?["\u201c\u2018\'(]{0,2}%s["\u201d\u2019\')]{0,2}(?![A-Za-z0-9])(?!\s?WI\b)(?!\s?PR[A-Z]?\b)(?!\.[A-Z]{1,2}\b)' % t)
    out = []
    for m in pat.finditer(text):
        pre = text[max(0, m.start() - 220):m.start()]
        ends = list(SENTENCE_END_RE.finditer(pre))
        if ends:
            pre = pre[ends[-1].end():]
        us = list(US_VENUE_RE.finditer(pre))
        if not us:
            continue
        if NON_US_OR_OTC_RE.search(pre[us[-1].start():]):
            continue
        if factual and INTENT_RE.search(pre):
            continue
        if not OWN_RE.search(pre):
            continue  # the sentence must speak about the filer's own security, not a merger partner's
        out.append((m.start(), text[max(0, m.start() - 120):m.start() + 160]))
    return out


def fulltext_ticker_confirmation(cik, sym, start, limit, forms, windows=8, per_window=10, factual=False):
    """Earliest EDGAR full-text-search (2001+) document of this CIK with a venue-checked ticker statement
    (ticker_symbol_statements). Searches consecutive 3-year windows from `start` until `limit`."""
    import datetime as _dt
    q = sym.replace('_P_', ' PR').replace('_', '.')
    if len(q) < 2:
        return {'state': 'SKIPPED_SINGLE_LETTER_TICKER'}
    lo = max(start, '2001-01-01')
    searches = []
    for _ in range(windows):
        if lo >= limit:
            break
        hi = min(limit, (_dt.date.fromisoformat(lo) + _dt.timedelta(days=3 * 366)).isoformat())
        url = ('https://efts.sec.gov/LATEST/search-index?q=%%22%s%%22&ciks=%010d&forms=%s&dateRange=custom&startdt=%s&enddt=%s'
               % (q.replace(' ', '%20'), int(cik), forms, lo, hi))
        try:
            body, meta = get(url)
            hits = json.loads(body)['hits']['hits']
        except Exception as e:  # noqa: BLE001
            return {'state': 'SEARCH_FAILED', 'error': str(e)[:160], 'searches': searches + [{'url': url}]}
        searches.append({'url': url, 'sha256': meta['sha256'], 'hits': len(hits)})
        hits.sort(key=lambda h: (h['_source'].get('file_date', ''), h['_id']))
        for h in hits[:per_window]:
            acc, fname = h['_id'].split(':', 1)
            try:
                doc, dmeta = get(doc_url(cik, acc, fname), prefix=True)
            except Exception:  # noqa: BLE001
                continue
            st = ticker_symbol_statements(_text(doc.decode('utf-8', errors='replace')), q, factual)
            if st:
                return {'state': 'FOUND', 'accession': acc, 'document': fname, 'filingDate': h['_source'].get('file_date'),
                        'form': h['_source'].get('form'), 'url': dmeta['url'], 'sha256': dmeta['sha256'],
                        'bytesRead': dmeta['bytesRead'], 'complete': dmeta['complete'], 'quote': st[0][1][:300], 'searches': searches,
                        'factualOnly': factual}
        lo = hi
    return {'state': 'NOT_FOUND', 'searches': searches}
