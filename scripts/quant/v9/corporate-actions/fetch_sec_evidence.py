#!/usr/bin/env python3
"""V9 workstream B (corporate-actions): fetch SEC originals for suspected CA events.

Read-only against the repo. All raw SEC bodies are cached in the PRIVATE directory
given by --private (never inside the repo). Uses the repository's SEC client
(scripts/quant/sec/http_client.py) with its default User-Agent and a hard rate limit
of 2 requests/second (RateLimiter(rate_per_second=2, burst=2)).

Per CIK:   company_tickers.json (1 request total), submissions JSON (+ older pages only
           when an event predates the 'recent' block), companyfacts JSON (1 request).
Per event (filing date >= 2001-01-01, EDGAR full-text-search coverage):
           two efts.sec.gov full-text queries restricted to the CIK and a window
           [event-120d, event+60d]: SPLIT terms and DISTRIBUTION/SPIN-OFF terms.

Output: <private>/sec-evidence.json  (derived facts + sha256 of each source body).
"""
import argparse, datetime, hashlib, json, pathlib, sys, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from scripts.quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter, SECHTTPError  # noqa: E402

SPLIT_Q = '"stock split" OR "reverse split" OR "share consolidation" OR "reverse stock split"'
DIST_Q = '"spin-off" OR spinoff OR "special dividend" OR "special cash dividend" OR "distribution of all" OR "pro rata distribution" OR "separation and distribution"'
WINDOW_BEFORE, WINDOW_AFTER = 120, 60
SHARE_CONCEPTS = [("dei", "EntityCommonStockSharesOutstanding"), ("us-gaap", "CommonStockSharesOutstanding"),
                  ("us-gaap", "WeightedAverageNumberOfSharesOutstandingBasic")]
SPLIT_CONCEPTS = [("us-gaap", "StockholdersEquityNoteStockSplitConversionRatio1"),
                  ("us-gaap", "StockholdersEquityReverseStockSplit"), ("us-gaap", "StockholdersEquityNoteStockSplit"), ("dei", "EntityPublicFloat")]


def sha(b):
    return hashlib.sha256(b).hexdigest()


def norm_ticker(t):
    return t.upper().replace('.', '-')


def d(s):
    return datetime.date.fromisoformat(s[:10])


class Fetcher:
    def __init__(self, private):
        self.client = SECHttpClient(cache=DiskCache(private / 'http-cache', ttl_seconds=None),
                                    rate_limiter=RateLimiter(rate_per_second=2, burst=2))
        self.hashes = {}

    def get(self, url, allow404=True):
        try:
            b = self.client.get_bytes(url, expected_statuses=(404,))
        except SECHTTPError as e:
            if allow404 and e.status == 404:
                self.hashes[url] = None
                return None
            raise
        self.hashes[url] = sha(b)
        return json.loads(b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--events', required=True)
    ap.add_argument('--private', required=True)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--workers', type=int, default=4)
    a = ap.parse_args()
    private = pathlib.Path(a.private).resolve()
    if private == ROOT or ROOT in private.parents:
        raise SystemExit('PRIVATE_OUTPUT_REQUIRED')
    F = Fetcher(private)
    events = [e for e in json.load(open(a.events))['events']
              if e['listingStatus'] == 'CORPORATE_ACTION_UNRESOLVED' and e['itemStatus'] != 'RESOLVED_GENUINE_MOVE']
    tick = F.get('https://www.sec.gov/files/company_tickers.json', allow404=False)
    t2c = {}
    for row in tick.values():
        t2c.setdefault(norm_ticker(row['ticker']), []).append((str(row['cik_str']).zfill(10), row['title']))
    ids = sorted({e['id'] for e in events})
    if a.limit:
        ids = ids[:a.limit]
    out = {'schemaVersion': 'v9-ca-sec-evidence-1.0.0', 'tickerMapUrl': 'https://www.sec.gov/files/company_tickers.json',
           'tickerMapSha256': F.hashes['https://www.sec.gov/files/company_tickers.json'],
           'splitQuery': SPLIT_Q, 'distQuery': DIST_Q, 'windowDays': [WINDOW_BEFORE, WINDOW_AFTER], 'listings': {}}
    outpath = private / 'sec-evidence.json'
    def process(sid):
        evs = [e for e in events if e['id'] == sid]
        ticker = evs[0]['ticker']
        cands = t2c.get(norm_ticker(ticker), [])
        rec = {'ticker': ticker, 'cikCandidates': cands, 'events': []}
        if len(cands) != 1:
            rec['mapping'] = 'NO_CURRENT_SEC_TICKER' if not cands else 'MULTIPLE_CIKS'
            for e in evs:
                rec['events'].append({'week': e['week']})
            return rec
        cik, title = cands[0]
        rec['cik'], rec['secTitle'], rec['mapping'] = cik, title, 'CURRENT_SEC_TICKER_MAP'
        subu = f'https://data.sec.gov/submissions/CIK{cik}.json'
        sub = F.get(subu)
        filings = []
        if sub:
            rec['submissions'] = {'url': subu, 'sha256': F.hashes[subu], 'name': sub.get('name'), 'formerNames': sub.get('formerNames'),
                                  'tickers': sub.get('tickers'), 'exchanges': sub.get('exchanges'), 'sic': sub.get('sic'),
                                  'sicDescription': sub.get('sicDescription')}
            def take(blk):
                for i in range(len(blk.get('accessionNumber', []))):
                    filings.append({'acc': blk['accessionNumber'][i], 'form': blk['form'][i], 'filed': blk['filingDate'][i],
                                    'report': blk.get('reportDate', [''] * 99999)[i], 'items': blk.get('items', [''] * 99999)[i],
                                    'doc': blk.get('primaryDocument', [''] * 99999)[i]})
            take(sub['filings']['recent'])
            earliest_needed = min(e['week'] for e in evs)
            pages = sub['filings'].get('files', [])
            older = []
            for p in pages:
                if p.get('filingTo', '9999') >= str(d(earliest_needed) - datetime.timedelta(days=400)):
                    u = 'https://data.sec.gov/submissions/' + p['name']
                    blk = F.get(u)
                    if blk:
                        take(blk)
                        older.append({'url': u, 'sha256': F.hashes[u]})
            rec['submissions']['olderPages'] = older
        rec['earliestFilingSeen'] = min((f['filed'] for f in filings), default=None)
        rec['filingCount'] = len(filings)
        cfu = f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json'
        cf = F.get(cfu)
        rec['companyfacts'] = {'url': cfu, 'sha256': F.hashes.get(cfu), 'present': cf is not None}
        facts = {}
        if cf:
            rec['companyfacts']['entityName'] = cf.get('entityName')
            for ns, c in SHARE_CONCEPTS + SPLIT_CONCEPTS:
                node = cf.get('facts', {}).get(ns, {}).get(c)
                if not node:
                    continue
                rows = []
                for unit, arr in node.get('units', {}).items():
                    for x in arr:
                        rows.append({'unit': unit, 'start': x.get('start'), 'end': x.get('end'), 'val': x.get('val'), 'accn': x.get('accn'),
                                     'fy': x.get('fy'), 'fp': x.get('fp'), 'form': x.get('form'), 'filed': x.get('filed')})
                facts[ns + ':' + c] = rows
        rec['shareFacts'] = facts
        for e in evs:
            ev = {'week': e['week']}
            wk = d(e['week'])
            lo, hi = wk - datetime.timedelta(days=WINDOW_BEFORE), wk + datetime.timedelta(days=WINDOW_AFTER)
            ev['filingsInWindow'] = [f for f in filings if lo <= d(f['filed']) <= hi and (f['form'].startswith('8-K') or f['form'].startswith('10-')
                                     or f['form'] in ('6-K', '20-F', '40-F', 'DEF 14A', 'DEF 14C', 'PRE 14A', 'PRE 14C', '10-12B', '10-12G', 'S-1', 'S-3', '424B4', '25-NSE', '25', '15-12B', '15-12G'))]
            if wk >= datetime.date(2001, 1, 1) and filings:
                for key, q in (('splitSearch', SPLIT_Q), ('distSearch', DIST_Q)):
                    qs = urllib.parse.urlencode({'q': q, 'ciks': cik, 'dateRange': 'custom', 'startdt': lo.isoformat(), 'enddt': hi.isoformat()})
                    u = 'https://efts.sec.gov/LATEST/search-index?' + qs
                    r = F.get(u)
                    hits = []
                    if r:
                        for h in r['hits']['hits']:
                            s = h['_source']
                            hits.append({'id': h['_id'], 'form': s.get('form'), 'filed': s.get('file_date'), 'items': s.get('items'), 'root': s.get('root_forms')})
                    ev[key] = {'url': u, 'sha256': F.hashes.get(u), 'total': r['hits']['total']['value'] if r else None, 'hits': hits}
            rec['events'].append(ev)
        return rec
    # a few workers only overlap download latency; the shared RateLimiter(2/s) still caps the request rate
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as ex:
        for n, (sid, rec) in enumerate(zip(ids, ex.map(process, ids))):
            out['listings'][sid] = rec
            if n % 20 == 0:
                print(n, len(ids), sid, F.client.stats, flush=True)
    out['requestStats'] = F.client.stats
    out['sourceHashes'] = F.hashes
    outpath.write_text(json.dumps(out))
    print('done', F.client.stats)


if __name__ == '__main__':
    main()
