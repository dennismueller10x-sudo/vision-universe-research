#!/usr/bin/env python3
"""V13b HIST part A step 2 - verify the adjudicator's decisions against the cached SEC bytes and the frozen rule
(amendment 1.1.0) and write the public adjudication file plus a private jump map for qualify_110.py.

python3 -I scripts/quant/v13b/hist/crash_adjudicate.py --root . --private <v13b-private> [--extra-cache DIR ...]
"""
import argparse, collections, datetime as dt, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C  # noqa: E402

D = dt.date.fromisoformat
DOCDIR = 'docs/quant-recovery/v13b/hist'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--private', required=True)
    ap.add_argument('--extra-cache', action='append', default=[])
    a = ap.parse_args()
    f = C.Fetcher(a.root, a.private, a.extra_cache, offline=True)
    ev = json.load(open(os.path.join(a.private, 'crash', 'evidence-1.1.0.json')))
    dec = json.load(open(os.path.join(a.root, DOCDIR, 'crash-decisions-1.1.0.json')))
    by_cik = {c['cik']: c for c in ev}
    assert sorted(by_cik) == sorted(x['cik'] for x in dec['cases']), 'case sets differ'
    cats = set(dec['dispositionCategories'])
    errors, public, jumpmap = [], [], {}
    for x in dec['cases']:
        c = by_cik[x['cik']]
        assert c['ticker'] == x['ticker']
        docs = {d['accession']: d for d in c['documents']}
        texts = {}

        def text(acc):
            if acc not in texts:
                raw = f.get(docs[acc]['url'])
                texts[acc] = C.norm_ws(C.text_of(raw[:C.MAX_BYTES]))
            return texts[acc]
        if len(x['jumps']) != len(c['jumps']):
            errors.append('%s: %d jumps decided, %d found' % (x['ticker'], len(x['jumps']), len(c['jumps'])))
        out_j = []
        for jd in x['jumps']:
            j = c['jumps'][jd['n'] - 1]
            J = D(j['date'])
            row = {'n': jd['n'], 'year': J.year, 'direction': 'FALL' if j['kind'] == 'DOWN' else 'RISE', 'ratioClass': j['k'], 'class': jd['class']}
            for k in ('subClass', 'eventType', 'reason', 'perShare', 'unit', 'exDate', 'exDateKind'):
                if k in jd:
                    row[k] = jd[k]
            evs = []
            for e in jd.get('evidence', []):
                d = docs.get(e['accession'])
                if d is None:
                    errors.append('%s: evidence %s not among retrieved documents' % (x['ticker'], e['accession']))
                    continue
                q = C.norm_ws(e['quote'])
                if len(q) > 300:
                    errors.append('%s: quote > 300 chars' % x['ticker'])
                found = q in text(e['accession'])
                if not found:
                    errors.append('%s: quote not found in %s: %s' % (x['ticker'], e['accession'], q[:80]))
                evs.append({'form': d['form'], 'filingDate': d['filingDate'], 'accession': d['accession'], 'url': d['url'], 'docSha256': d['sha256'],
                            'bytes': d['total'], 'parsedBytes': d['bytes'], 'truncated': d['truncated'], 'docSha256Scope': 'first 2,000,000 bytes' if d['truncated'] else 'whole document', 'quote': q, 'quoteSha256': C.sha(q), 'quoteFound': found})
            row['evidence'] = evs
            checks = {}
            if jd['class'] == 'A_REAL_PRICE_EVENT':
                checks['E1_filingInWindow'] = any(-14 <= (D(e['filingDate']) - J).days <= 7 for e in evs)
                checks['E2_noProviderSplitWithin5Bars'] = not j['splitNear']
                if 'takeUnderCheck' in x:
                    checks['takeUnderBelowPriorClose'] = x['takeUnderCheck']['offerPerShare'] < j['prevClose']
            elif jd['class'] == 'B_CORPORATE_ACTION':
                ex = D(jd['exDate'])
                checks['B_dateWithin1TradingDay'] = ex in (J, D(j['prevDate'])) or (J < ex <= J + dt.timedelta(days=3))
                if jd['subClass'] == 'B2_DISTRIBUTION':
                    drop = 1 - j['close'] / j['prevClose']
                    checks['B2_amountMatchesDrop'] = abs(jd['perShare'] / j['prevClose'] - drop) <= 0.15
            row['checks'] = checks
            for k, v in checks.items():
                if v is not True:
                    errors.append('%s jump %d: check %s failed' % (x['ticker'], jd['n'], k))
            out_j.append(row)
        # caScan dispositions (documents in [J-60d, J+30d] of any jump = all retrieved documents)
        hits = [(d['accession'], h['term']) for d in c['documents'] for h in d.get('caHits', [])]
        disp = x['dispositions']
        chain_c = any(r['class'] == 'C_UNRESOLVED' for r in out_j)
        cnt = collections.Counter()
        if disp == 'CHAIN_CLASS_C':
            if not chain_c:
                errors.append('%s: CHAIN_CLASS_C disposition but no class C jump' % x['ticker'])
            cnt['CHAIN_CLASS_C'] = len(hits)
        else:
            for acc, term in hits:
                cat = disp.get(acc)
                if cat not in cats:
                    errors.append('%s: caScan hit %s/%s without disposition' % (x['ticker'], acc, term))
                cnt[cat] += 1
        admitted = not chain_c
        public.append({'chainId': c['chainId'], 'cik': c['cik'], 'secName': c['secName'], 'submissionsSha256': c['submissionsSha256'],
                       'documentsRetrieved': len(c['documents']), 'documentsTruncated': sum(1 for d in c['documents'] if d.get('truncated')),
                       'caScanHits': len(hits), 'caScanDispositions': dict(cnt), 'jumps': out_j,
                       'chainDecision': 'ADJUDICATED_RESOLVED' if admitted else 'STAYS_CA_UNRESOLVED'})
        jumpmap[c['chainId']] = {'admitted': admitted, 'jumps': [{'date': c['jumps'][r['n'] - 1]['date'], 'class': r['class'], 'subClass': r.get('subClass'),
                                                                   'perShare': r.get('perShare')} for r in out_j]}
    summ = collections.Counter(p['chainDecision'] for p in public)
    jc = collections.Counter(r['class'] + (':' + r['subClass'] if r.get('subClass') else '') for p in public for r in p['jumps'])
    res = {'schemaVersion': 'v13b-crash-adjudication-1.1.0', 'protocol': 'protocol-amendment-1.1.0.json',
           'protocolSha256': C.sha(open(os.path.join(a.root, DOCDIR, 'protocol-amendment-1.1.0.json'), 'rb').read()),
           'decisionsSha256': C.sha(open(os.path.join(a.root, DOCDIR, 'crash-decisions-1.1.0.json'), 'rb').read()),
           'codeSha256': C.sha(open(os.path.abspath(__file__), 'rb').read()),
           'evidenceKind': 'SOURCE_EVIDENCE', 'certificationStatus': 'NOT_CERTIFIED', 'productionApproved': False,
           'publicRedaction': 'no prices, no provider dates (jump year only); SEC filing dates/accessions/quotes are public SEC facts',
           'chains': len(public), 'chainDecisions': dict(summ), 'jumpClasses': dict(sorted(jc.items())), 'errors': errors, 'cases': public}
    with open(os.path.join(a.root, DOCDIR, 'crash-adjudication-1.1.0.json'), 'w') as fh:
        json.dump(res, fh, indent=1, ensure_ascii=False)
        fh.write('\n')
    json.dump(jumpmap, open(os.path.join(a.private, 'crash', 'jumpmap-1.1.0.json'), 'w'), indent=1)
    print(json.dumps({'chainDecisions': res['chainDecisions'], 'jumpClasses': res['jumpClasses'], 'errors': errors}, indent=1))


if __name__ == '__main__':
    main()
