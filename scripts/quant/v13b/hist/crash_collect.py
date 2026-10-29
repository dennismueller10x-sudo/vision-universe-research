#!/usr/bin/env python3
"""V13b HIST part A step 1 - collect SEC evidence for the 28 CA_UNRESOLVED crash chains (amendment 1.1.0).

Selects the chains exactly like scripts/quant/v13/studies/ca_unresolved_count.py (PRICE_FELL, last trade <= 365 d after
the first unresolved jump), lists ALL unresolved split-sized jumps of each chain (qualify.py R4 test), retrieves the
issuer's filings in [J-60d, J+30d] (amendment 1.1.0 evidence.window) and runs the corporate-action scan. Writes a
PRIVATE evidence file (provider dates/prices inside) used for adjudication; nothing public.

python3 -I scripts/quant/v13b/hist/crash_collect.py --root . --v13-private <v13-private> --listref <v12-private/listref> \
    --private <v13b-private> [--extra-cache DIR ...] [--offline]
"""
import argparse, collections, datetime as dt, gzip, hashlib, hmac, importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C  # noqa: E402

D = dt.date.fromisoformat
FORMS = {'8-K', '8-K/A', '6-K', '25', '25-NSE', '15-12B', '15-12G', '15-15D', 'DEF 14A', 'DEFA14A', 'DEFM14A', 'DEFR14A',
         'PRE 14A', 'PREM14A', 'DEF 14C', 'PRE 14C', '10-Q', '10-K', '20-F', '40-F', 'SC TO-I', 'SC TO-T', 'SC 14D9', '425', '424B3'}
CA_TERMS = ['stock split', 'reverse split', 'reverse stock split', 'share consolidation', 'consolidation of shares', 'stock dividend',
            'special dividend', 'special cash dividend', 'special distribution', 'liquidating distribution', 'return of capital',
            'spin-off', 'spinoff', 'spin off', 'distribution of all', 'rights offering', 'subscription rights', 'ads ratio',
            'ratio change', 'redemption of all', 'trust account distribution']
CA_RX = re.compile('|'.join(re.escape(t) for t in CA_TERMS), re.I)
E1_TERMS = ['chapter 11', 'chapter 7', 'voluntary petition', 'bankruptcy', 'going concern', 'substantial doubt', 'forbearance',
            'event of default', 'delist', 'suspend', 'deficiency', 'receivership', 'terminat', 'restructuring support agreement',
            'merger agreement', 'business combination', 'per share in cash', 'consummat', 'redeem', 'redemption', 'guidance',
            'complete response letter', 'did not meet', 'primary endpoint', 'liquidat', 'wind down', 'tender offer']
E1_RX = re.compile('|'.join(re.escape(t) for t in E1_TERMS), re.I)


def load_qualify(root):
    spec = importlib.util.spec_from_file_location('v13qualify', os.path.join(root, 'scripts/quant/v13/delisted/qualify.py'))
    Q = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(Q)
    return Q


def select_cases(root, v13p, listref, Q):
    reg = json.load(open(os.path.join(root, 'docs/quant-recovery/v13/delisted/register-1.0.0.json')))
    ix = {c: i for i, c in enumerate(reg['columns'])}
    status = {r[ix['chainId']]: r[ix['status']] for r in reg['rows']}
    work = os.path.join(listref, 'work')
    key = open(os.path.join(work, 'chain-hash-key.txt')).read().strip()
    chains = [c for c in (json.loads(l) for l in gzip.open(os.path.join(work, 'reference-listings.jsonl.gz'), 'rt')) if c['ended'] and not c['series']]
    base = collections.Counter(Q.chain_id(key, c['ticker'], c['exchange'], int(c['endDate'][:4])) for c in chains)
    series = Q.load_series(v13p)
    out = []
    for ch in chains:
        cid = Q.chain_id(key, ch['ticker'], ch['exchange'], int(ch['endDate'][:4]))
        if base[cid] > 1:
            cid += '-' + hmac.new(key.encode(), ch['startDate'].encode(), hashlib.sha256).hexdigest()[:4]
        if status.get(cid) != 'CA_UNRESOLVED':
            continue
        s = series[ch['ticker']]
        ci = {c: i for i, c in enumerate(s['cols'])}
        rows = [r for r in s['rows'] if r[ci['close']] is not None]
        while rows and not (rows[-1][ci['volume']] or 0) > 0:
            rows.pop()
        close = [float(r[ci['close']]) for r in rows]
        sf = [float(r[ci['splitFactor']] or 1.0) for r in rows]
        jumps = []
        for i in range(1, len(rows)):
            ss = Q.split_sized(close[i] / close[i - 1])
            if not ss:
                continue
            k, kind = ss
            hit = any(j < len(rows) and sf[j] != 1.0 and ((kind == 'DOWN' and abs(sf[j] / k - 1) < Q.TOL) or (kind == 'UP' and abs(sf[j] * k - 1) < Q.TOL)) for j in (i, i + 1))
            if not hit:
                jumps.append({'date': rows[i][0][:10], 'prevDate': rows[i - 1][0][:10], 'kind': kind, 'k': k, 'prevClose': close[i - 1], 'close': close[i],
                              'index': i, 'splitNear': [(rows[j][0][:10], sf[j]) for j in range(max(0, i - 5), min(len(rows), i + 6)) if sf[j] != 1.0]})
        if not jumps:
            continue
        days = (D(rows[-1][0][:10]) - D(jumps[0]['date'])).days
        if jumps[0]['kind'] == 'DOWN' and days <= 365:
            out.append({'chainId': cid, 'ticker': ch['ticker'], 'exchange': ch['exchange'], 'cik': int(ch['link']['cik']), 'linkGrade': ch['link']['grade'],
                        'lastTrade': rows[-1][0][:10], 'jumps': jumps, 'tradingDays': [r[0][:10] for r in rows]})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--v13-private', required=True)
    ap.add_argument('--listref', required=True)
    ap.add_argument('--private', required=True)
    ap.add_argument('--extra-cache', action='append', default=[])
    ap.add_argument('--offline', action='store_true')
    a = ap.parse_args()
    Q = load_qualify(a.root)
    cases = select_cases(a.root, a.v13_private, a.listref, Q)
    assert len(cases) == 28, len(cases)
    f = C.Fetcher(a.root, a.private, a.extra_cache, offline=a.offline)
    out = []
    for c in cases:
        sub = C.submissions(f, c['cik'])
        c['secName'] = sub['name']
        c['submissionsSha256'] = sub['sha256']
        lo = min(D(j['date']) for j in c['jumps']) - dt.timedelta(days=60)
        hi = max(D(j['date']) for j in c['jumps']) + dt.timedelta(days=30)
        docs = []
        for r in sorted(sub['rows'], key=lambda r: (r['filingDate'], r['accession'])):
            if r['form'] not in FORMS or not (lo <= D(r['filingDate']) <= hi):
                continue
            url = C.filing_url(c['cik'], r['accession'])
            try:
                raw, total, trunc = f.get_head(url)
            except Exception as e:  # recorded, adjudication treats a missing needed document as class C
                docs.append({**r, 'url': url, 'error': str(e)[:200]})
                continue
            txt = C.text_of(raw)
            ca = [{'term': m.group(0).lower(), 'context': txt[max(0, m.start() - 200): m.end() + 200]} for m in CA_RX.finditer(txt)]
            e1 = [{'term': m.group(0).lower(), 'context': txt[max(0, m.start() - 250): m.end() + 250]} for m in E1_RX.finditer(txt)]
            docs.append({**r, 'url': url, 'sha256': C.sha(raw), 'bytes': len(raw), 'total': total, 'truncated': trunc, 'caHits': ca[:60], 'caHitCount': len(ca),
                         'e1Hits': e1[:40], 'e1HitCount': len(e1)})
        c['documents'] = docs
        del c['tradingDays']
        out.append(c)
        print(c['ticker'], len(docs), sum(1 for d in docs if 'error' in d), file=sys.stderr)
    os.makedirs(os.path.join(a.private, 'crash'), exist_ok=True)
    json.dump(out, open(os.path.join(a.private, 'crash', 'evidence-1.1.0.json'), 'w'), indent=1)
    print(json.dumps({'cases': len(out), 'documents': sum(len(c['documents']) for c in out), 'requests': f.client.stats['requests']}))


if __name__ == '__main__':
    main()
