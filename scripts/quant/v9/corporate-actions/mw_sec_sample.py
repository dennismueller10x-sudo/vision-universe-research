#!/usr/bin/env python3
"""V9 workstream B: SEC filing context for a deterministic sample of MISSING_WEEKS gaps.

Sample: for every gap class (missing_weeks.py draft output) the first N listings by id, plus all
gaps sharing the 2025-12-15 window. For each sampled gap the issuer's EDGAR submissions are scanned for
delisting / deregistration / merger-completion filings (Form 25, 25-NSE, 15-12B, 15-12G, 8-K items
3.01 / 2.01) and for periodic reports (10-Q/10-K/20-F/6-K) inside the gap. SEC trading-suspension orders are
Exchange Act releases, not issuer filings, and are NOT covered by this check.

Usage: python3 mw_sec_sample.py --draft <mw-draft.json> --private <dir> --out <mw-sec.json> [--n 6]
"""
import argparse, collections, datetime, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from scripts.quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter, SECHTTPError  # noqa: E402

DELIST = ('25', '25-NSE', '25/A', '25-NSE/A', '15-12B', '15-12G', '15-15D', '15-12B/A', '15-12G/A')
PERIODIC = ('10-Q', '10-K', '20-F', '6-K', '10-K/A', '10-Q/A', '40-F', 'NT 10-Q', 'NT 10-K')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--draft', required=True)
    ap.add_argument('--private', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--n', type=int, default=6)
    a = ap.parse_args()
    client = SECHttpClient(cache=DiskCache(pathlib.Path(a.private) / 'http-cache', ttl_seconds=None), rate_limiter=RateLimiter(rate_per_second=2, burst=2))
    draft = json.load(open(a.draft))
    rows = draft['gapRows']
    tick = json.loads(client.get_bytes('https://www.sec.gov/files/company_tickers.json'))
    t2c = collections.defaultdict(list)
    for r in tick.values():
        t2c[r['ticker'].upper().replace('.', '-')].append((str(r['cik_str']).zfill(10), r['title']))
    sample, per = [], collections.Counter()
    for r in sorted(rows, key=lambda x: (x['id'], x['after'])):
        key = (r['class'], r['lengthBucket'])
        if r['firstMissingWeek'] == '2025-12-15' or per[key] < a.n:
            if r['firstMissingWeek'] != '2025-12-15':
                per[key] += 1
            sample.append(r)
    out, summ = {}, collections.Counter()
    for r in sample:
        ticker = r['id'][4:]
        c = t2c.get(ticker.upper().replace('_', '-').replace('.', '-'), [])
        key = r['id'] + '|' + r['after']
        if len(c) != 1:
            out[key] = {'mapping': 'NO_UNIQUE_CURRENT_SEC_TICKER'}
            summ[(r['class'], 'NO_MAPPING')] += 1
            continue
        cik, title = c[0]
        u = f'https://data.sec.gov/submissions/CIK{cik}.json'
        try:
            sub = json.loads(client.get_bytes(u, expected_statuses=(404,)))
        except SECHTTPError:
            out[key] = {'mapping': 'SUBMISSIONS_404', 'cik': cik}
            continue
        fl = []
        blocks = [sub['filings']['recent']]
        lo = datetime.date.fromisoformat(r['after']) - datetime.timedelta(days=60)
        hi = datetime.date.fromisoformat(r['before']) + datetime.timedelta(days=30)
        for pg in sub['filings'].get('files', []):
            if pg.get('filingTo', '9999') >= lo.isoformat() and pg.get('filingFrom', '0000') <= hi.isoformat():
                blocks.append(json.loads(client.get_bytes('https://data.sec.gov/submissions/' + pg['name'])))
        for b in blocks:
            for j in range(len(b['accessionNumber'])):
                fl.append({'form': b['form'][j], 'filed': b['filingDate'][j], 'acc': b['accessionNumber'][j], 'items': (b.get('items') or [''] * 99999)[j] or ''})
        inwin = [f for f in fl if lo <= datetime.date.fromisoformat(f['filed']) <= hi]
        delist = [f for f in inwin if f['form'] in DELIST or (f['form'].startswith('8-K') and ('3.01' in f['items'] or '2.01' in f['items']))]
        periodic = [f for f in fl if r['after'] < f['filed'] < r['before'] and f['form'] in PERIODIC]
        last_filing = max((f['filed'] for f in fl), default=None)
        verdict = ('DELISTING_OR_MERGER_FILING_AT_GAP' if delist else
                   'ISSUER_REPORTING_CONTINUOUS_DURING_GAP' if periodic else 'NO_SEC_EXPLANATION_FOUND')
        summ[(r['class'], verdict)] += 1
        out[key] = {'cik': cik, 'secTitle': title, 'submissionsUrl': u, 'delistingContext': delist[:6], 'periodicDuringGap': len(periodic),
                    'lastFiling': last_filing, 'verdict': verdict}
    rep = {'schemaVersion': 'v9-ca-mw-sec-sample-1.0.0', 'sampleRule': f'first {a.n} listings by id per (class, length bucket) + all gaps sharing the 2025-12-15 window',
           'coverageNote': 'Issuer filings only. SEC trading-suspension orders (Exchange Act releases) and exchange halts are not covered. Ticker->CIK uses the CURRENT SEC map.',
           'sampled': len(sample), 'summary': {f'{k[0]}|{k[1]}': v for k, v in sorted(summ.items())}, 'gaps': out, 'requestStats': client.stats}
    pathlib.Path(a.out).write_text(json.dumps(rep, indent=1))
    print(json.dumps(rep['summary'], indent=1), client.stats)


if __name__ == '__main__':
    main()
