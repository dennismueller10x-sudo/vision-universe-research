#!/usr/bin/env python3
"""V9 events harvester: SEC submissions JSON -> original Form 8-K Item 2.02 ledger.

Phase 'fetch' downloads (rate limited, disk cached, private dir only):
  company_tickers_exchange.json and data.sec.gov/submissions/CIK##########.json for the
  eligible population; older 'files' pages only when 'recent' does not reach the window start.
Phase 'parse' builds the private ledger from the cache only (no network).
Raw SEC bodies never enter the repository; only derived facts and SHA-256 hashes do.
"""
import argparse, hashlib, json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from scripts.quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter  # noqa: E402

TICKERS_URL = 'https://www.sec.gov/files/company_tickers_exchange.json'
SUB_URL = 'https://data.sec.gov/submissions/CIK{cik:010d}.json'
PAGE_URL = 'https://data.sec.gov/submissions/{name}'
# Harvest window: a little before the daily price window so the +-10 trading-day
# control exclusion around 2025-09-30 is informed by real filings.
HARVEST_FROM = '2025-08-15'
WINDOW_START = '2025-09-30'


def sha(b):
    return hashlib.sha256(b).hexdigest()


def private(out):
    out = pathlib.Path(out).resolve()
    if out == ROOT or ROOT in out.parents:
        raise SystemExit('PRIVATE_OUTPUT_REQUIRED')
    out.mkdir(parents=True, exist_ok=True)
    return out


class OfflineCache:
    """Cache-only reader: never touches the network nor the rate limiter."""
    def __init__(self, out):
        self.cache = DiskCache(directory=out / 'sec-cache', ttl_seconds=None)
        self.stats = {'requests': 0}

    def get_bytes(self, url):
        b = self.cache.get(url)
        if b is None:
            raise RuntimeError('OFFLINE_CACHE_MISS ' + url)
        return b


def client(out, offline=False):
    if offline:
        return OfflineCache(out)
    return SECHttpClient(cache=DiskCache(directory=out / 'sec-cache', ttl_seconds=None),
                         rate_limiter=RateLimiter(rate_per_second=2, burst=2), max_retries=3)


def ticker_map(c):
    body = c.get_bytes(TICKERS_URL)
    d = json.loads(body)
    f = d['fields']
    rows = [dict(zip(f, r)) for r in d['data']]
    by = {}
    for r in rows:
        by.setdefault(r['ticker'].upper(), []).append(r)
    return body, by


def eligible_population(out):
    pop = json.loads((out / 'population.json').read_text())
    return pop, [r for r in pop['rows'] if r['eligible']]


def norm(t):
    return t.upper().replace('.', '-')


def fetch(out):
    c = client(out)
    body, by = ticker_map(c)
    pop, rows = eligible_population(out)
    ciks = sorted({by[norm(r['ticker'])][0]['cik'] for r in rows if norm(r['ticker']) in by and len(by[norm(r['ticker'])]) == 1})
    print(json.dumps(dict(eligible=len(rows), ciks=len(ciks))), flush=True)
    failures = []
    for k, cik in enumerate(ciks):
        try:
            sub = json.loads(c.get_bytes(SUB_URL.format(cik=cik)))
            recent = sub.get('filings', {}).get('recent', {})
            dates = recent.get('filingDate') or []
            if dates and min(dates) > HARVEST_FROM:
                for page in sub.get('filings', {}).get('files', []):
                    if page.get('filingTo', '') >= HARVEST_FROM:
                        c.get_bytes(PAGE_URL.format(name=page['name']))
        except Exception as e:  # recorded, never silently dropped
            failures.append(dict(cik=cik, error=str(e)[:200]))
        if k % 250 == 0:
            print(json.dumps(dict(done=k, stats=c.stats, failures=len(failures))), flush=True)
    (out / 'fetch-failures.json').write_text(json.dumps(failures))
    print(json.dumps(dict(done=len(ciks), stats=c.stats, failures=len(failures))), flush=True)


def recent_rows(block):
    keys = list(block.keys())
    n = len(block.get('accessionNumber', []))
    return [{k: block[k][i] for k in keys} for i in range(n)]


def parse(out):
    c = client(out, offline=True)
    body, by = ticker_map(c)
    pop, rows = eligible_population(out)
    listings, issuers, excluded, filings = [], {}, [], []
    counts = {}

    def bump(k, n=1):
        counts[k] = counts.get(k, 0) + n
    for r in rows:
        t = norm(r['ticker'])
        m = by.get(t, [])
        if not m:
            excluded.append(dict(securityId=r['securityId'], ticker=r['ticker'], reason='TICKER_NOT_IN_SEC_CURRENT_MAP')); continue
        if len(m) > 1:
            excluded.append(dict(securityId=r['securityId'], ticker=r['ticker'], reason='TICKER_MAPS_TO_MULTIPLE_CIKS')); continue
        cik = m[0]['cik']
        listings.append(dict(securityId=r['securityId'], ticker=r['ticker'], cik=cik, secExchange=m[0]['exchange'], secName=m[0]['name'], masterExchange=r['exchange'], canonicalId=r['canonicalId']))
    sources = {}
    for cik in sorted({l['cik'] for l in listings}):
        url = SUB_URL.format(cik=cik)
        try:
            raw = c.get_bytes(url)
        except Exception as e:
            issuers[cik] = dict(state='SUBMISSIONS_UNAVAILABLE', error=str(e)[:200]); continue
        sources[url] = sha(raw)
        sub = json.loads(raw)
        fl = recent_rows(sub['filings']['recent'])
        pages = []
        if fl and min(x['filingDate'] for x in fl) > HARVEST_FROM:
            for page in sub['filings'].get('files', []):
                if page.get('filingTo', '') >= HARVEST_FROM:
                    purl = PAGE_URL.format(name=page['name'])
                    try:
                        praw = c.get_bytes(purl)
                    except Exception as e:
                        issuers[cik] = dict(state='PAGE_UNAVAILABLE', error=str(e)[:200]); break
                    sources[purl] = sha(praw); pages.append(page['name'])
                    fl += recent_rows(json.loads(praw))
        if issuers.get(cik, {}).get('state') == 'PAGE_UNAVAILABLE':
            continue
        cover = min((x['filingDate'] for x in fl), default=None)
        former = [f for f in sub.get('formerNames', []) if (f.get('to') or '')[:10] >= HARVEST_FROM]
        own = [x for x in fl if x['filingDate'] >= HARVEST_FROM]
        n8k = [x for x in own if x['form'] in ('8-K', '8-K/A')]
        periodic = sum(x['form'] in ('10-K', '10-Q', '10-K/A', '10-Q/A') for x in own)
        issuers[cik] = dict(state='OK', name=sub.get('name'), tickers=sub.get('tickers'), exchanges=sub.get('exchanges'),
                            entityType=sub.get('entityType'), sic=sub.get('sic'), stateOfIncorporation=sub.get('stateOfIncorporation'),
                            formerNamesInWindow=former, coverageFrom=cover, pages=pages, periodicFilingsInWindow=periodic,
                            eightKInWindow=len(n8k), submissionsSha256=sources[url])
        for x in n8k:
            items = [i.strip() for i in (x.get('items') or '').split(',') if i.strip()]
            filings.append(dict(cik=cik, accession=x['accessionNumber'], form=x['form'], filingDate=x['filingDate'],
                                reportDate=x.get('reportDate'), acceptanceDateTimeRaw=x['acceptanceDateTime'], items=items,
                                primaryDocument=x.get('primaryDocument'), item202='2.02' in items))
    filings.sort(key=lambda f: (f['acceptanceDateTimeRaw'], f['accession']))
    seen = set(); dupl = 0
    uniq = []
    for f in filings:
        if (f['cik'], f['accession']) in seen:
            dupl += 1; continue
        seen.add((f['cik'], f['accession'])); uniq.append(f)
    doc = dict(schemaVersion='v9-events-sec-ledger-1.0.0', harvestFrom=HARVEST_FROM, tickersUrl=TICKERS_URL, tickersSha256=sha(body),
               populationSha256=sha((out / 'population.json').read_bytes()), listings=listings, excluded=excluded, issuers=issuers,
               filings=uniq, duplicatesRemoved=dupl, sourceHashes=sources,
               counts=dict(eligibleListings=len(rows), mappedListings=len(listings), excludedListings=len(excluded),
                           issuers=len(issuers), issuersOk=sum(v['state'] == 'OK' for v in issuers.values()),
                           eightK=len(uniq), eightKOriginal=sum(f['form'] == '8-K' for f in uniq), eightKAmend=sum(f['form'] == '8-K/A' for f in uniq),
                           item202Original=sum(f['form'] == '8-K' and f['item202'] for f in uniq),
                           item202Amend=sum(f['form'] == '8-K/A' and f['item202'] for f in uniq)))
    (out / 'sec-ledger.json').write_text(json.dumps(doc))
    print(json.dumps(doc['counts']))


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('phase', choices=['fetch', 'parse']); p.add_argument('--out', required=True)
    a = p.parse_args(); o = private(a.out)
    fetch(o) if a.phase == 'fetch' else parse(o)
