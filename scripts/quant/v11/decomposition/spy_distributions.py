#!/usr/bin/env python3
"""V11 DECOMPOSITION A5: SPY distributions and total return from the SPDR S&P 500 ETF Trust annual reports.

Source: SEC EDGAR, CIK 884394, form N-30D (fiscal year ending 30 September); the Financial Highlights table of
each annual report covers five fiscal years (net asset value, distributions per unit, total return at NAV).
Fetched only through scripts/quant/sec/http_client.py (fair access, <= 2 requests/s, private cache outside the
repository). Writes derived facts with accession, URL, SHA-256 of the document and a quote <= 300 characters.

Usage: python3 -I spy_distributions.py <repo-root> <private-cache-dir> <out.json> [--fetch]
Without --fetch only cached documents are read (no network).
"""
import hashlib, html, json, re, sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
CACHE = Path(sys.argv[2]).resolve()
OUT = Path(sys.argv[3]).resolve()
FETCH = '--fetch' in sys.argv
sys.path.insert(0, str(ROOT / 'scripts' / 'quant' / 'sec'))
import http_client as H  # noqa: E402

CIK = '884394'
# Annual reports whose five-year Financial Highlights together cover fiscal years 1996-2025.
DOCS = [
    ('0001193125-25-297563', 'd18808dn30d.htm', '2025-09-30'),
    ('0001193125-20-305082', 'd72640dn30d.htm', '2020-09-30'),
    ('0001193125-15-390230', 'd80506dn30d.htm', '2015-09-30'),
    ('0000950123-10-109631', 'b82994a1nv30d.htm', '2010-09-30'),
    ('0000950135-05-006765', 'b57342mfnv30d.txt', '2005-09-30'),
    ('0000950135-00-005227', 'b37488ssn-30d.txt', '2000-09-30'),
]


def url_of(accn, doc):
    return 'https://www.sec.gov/Archives/edgar/data/%s/%s/%s' % (CIK, accn.replace('-', ''), doc)


def text_of(raw, is_html):
    s = raw.decode('utf-8', 'replace')
    if is_html:
        s = re.sub(r'(?is)<(script|style).*?</\1>', ' ', s)
        s = re.sub(r'(?i)<br\s*/?>|</(p|tr|div|table)>', '\n', s)
        s = re.sub(r'(?i)</t[dh]>', ' | ', s)
        s = re.sub(r'<[^>]+>', ' ', s)
        s = html.unescape(s)
    s = s.replace('\xa0', ' ')
    return s


NUM = r'\(?\s*-?[\d,]*\.\d+\s*\)?'


def numbers_after(t, label_re, n, start=0):
    m = re.compile(label_re, re.I).search(t, start)
    if not m:
        return None, None
    vals, pos = [], m.end()
    for x in re.finditer(NUM, t[pos:pos + 900]):
        v = x.group(0).replace(' ', '').replace(',', '')
        neg = v.startswith('(')
        vals.append(-float(v.strip('()')) if neg else float(v.strip('()')))
        if len(vals) == n:
            return vals, (m.start(), pos + x.end())
    return None, None


def parse(doc):
    t = re.sub(r'[\s|]+', ' ', doc['text'])
    fy = int(doc['periodOfReport'][:4])
    a = t.upper().find('NET ASSET VALUE, BEGINNING OF')
    if a < 0:
        return None, 'BEGIN_ROW_NOT_FOUND'
    ncol = 2 if fy == 2000 else 5  # the 2000 report mixes fiscal and calendar years after the second column
    begin, _ = numbers_after(t, r'NET ASSET VALUE, BEGINNING OF (YEAR|PERIOD)', ncol, a - 5)
    lab = r'TOTAL DISTRIBUTIONS' if fy == 2000 else r'LESS DISTRIBUTIONS FROM: NET INVESTMENT INCOME'
    dist, span = numbers_after(t, lab, ncol, a)
    end, _ = numbers_after(t, r'NET ASSET VALUE, END OF (YEAR|PERIOD)', ncol, a)
    tr, _ = numbers_after(t, r'TOTAL (INVESTMENT )?RETURN ?(\(\w\)|\(\d\))?', ncol, a) if fy != 2000 else (None, None)
    if not (begin and dist and end):
        return None, 'ROWS_NOT_FOUND'
    quote = t[span[0]:span[1]][:300]
    rows = []
    for i in range(ncol):
        rows.append({'fiscalYearEnd': '%d-09-30' % (fy - i), 'navBegin': begin[i], 'distributionsPerUnit': -dist[i] if dist[i] < 0 else dist[i], 'navEnd': end[i],
                     'reportedNavTotalReturnPct': tr[i] if tr else None})
    return {'rows': rows, 'quote': quote}, None


def main():
    client = H.SECHttpClient(cache=H.DiskCache(CACHE, ttl_seconds=None), rate_limiter=H.RateLimiter(rate_per_second=2.0, burst=1))
    out = {'schemaVersion': 'v11-decomposition-spy-distributions-1.0.0', 'issuer': 'SPDR S&P 500 ETF Trust (SPY)', 'cik': CIK, 'form': 'N-30D annual report, Financial Highlights',
           'evidenceKind': 'SOURCE_EVIDENCE', 'documents': [], 'fiscalYears': {}}
    for accn, doc, period in DOCS:
        url = url_of(accn, doc)
        if not FETCH and client.cache.get(url) is None:
            out['documents'].append({'accession': accn, 'url': url, 'state': 'NOT_CACHED'}); continue
        raw = client.get_bytes(url)
        rec = {'accession': accn, 'url': url, 'periodOfReport': period, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}
        parsed, err = parse({'text': text_of(raw, doc.endswith('.htm')), 'periodOfReport': period})
        if err:
            rec['state'] = err
        else:
            rec['state'] = 'PARSED'; rec['quote'] = parsed['quote']
            for r in parsed['rows']:
                prev = out['fiscalYears'].get(r['fiscalYearEnd'])
                r['source'] = accn
                if prev is None:
                    out['fiscalYears'][r['fiscalYearEnd']] = r
                else:
                    rec.setdefault('overlapChecks', []).append({'fiscalYearEnd': r['fiscalYearEnd'], 'distributionsAgree': abs(prev['distributionsPerUnit'] - r['distributionsPerUnit']) < 0.006, 'navEndAgree': abs(prev['navEnd'] - r['navEnd']) < 0.006})
        out['documents'].append(rec)
    fys = sorted(out['fiscalYears'])
    chain = []
    for i, k in enumerate(fys):
        r = out['fiscalYears'][k]
        r['priceReturnNav'] = r['navEnd'] / r['navBegin'] - 1
        r['distributionYieldOnBeginNav'] = r['distributionsPerUnit'] / r['navBegin']
        r['totalReturnNavApprox'] = (r['navEnd'] + r['distributionsPerUnit']) / r['navBegin'] - 1
        if i > 0:
            chain.append(abs(out['fiscalYears'][fys[i - 1]]['navEnd'] - r['navBegin']) < 0.006)
    out['navChainConsistent'] = {'checks': len(chain), 'agree': sum(chain)}
    sel = [out['fiscalYears'][k] for k in fys if '2000-09-30' <= k <= '2025-09-30']
    pr = tr = 1.0
    for r in sel:
        pr *= 1 + r['priceReturnNav']; tr *= 1 + r['totalReturnNavApprox']
    n = len(sel)
    out['summary'] = {'fiscalYears': [sel[0]['fiscalYearEnd'], sel[-1]['fiscalYearEnd']] if sel else None, 'years': n,
                      'cagrPriceNav': pr ** (1 / n) - 1 if n else None, 'cagrTotalNavApprox': tr ** (1 / n) - 1 if n else None,
                      'meanDistributionYield': sum(r['distributionYieldOnBeginNav'] for r in sel) / n if n else None,
                      'note': 'Approximate TR = (NAV end + distributions)/NAV begin - 1 (distributions not reinvested within the year; equalization ignored). Reported NAV total return listed where parsed for comparison. NAV is not the exchange price; SPY trades at a negligible premium/discount.'}
    out['requests'] = client.stats['requests']
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1) + '\n')
    print(json.dumps({'documents': len(out['documents']), 'fiscalYears': len(fys), 'requests': out['requests'], 'summary': out['summary'], 'chain': out['navChainConsistent']}))


if __name__ == '__main__':
    main()
