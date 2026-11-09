"""V13 LARGECAP: protocol 'documents.symbolChange'. For every symbol transition between consecutive symbol-naming filings whose
two symbols are not yet linked by a change anchor, fetch the 8-K primary documents of the CIK filed between them (at most 25,
chronological) and write their facts (symbols, exchange, change statements) as additional private facts lines."""
import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import seclib13 as S  # noqa: E402
import build_facts as BF  # noqa: E402


def linked(edges, a, b):
    seen, stack = {a}, [a]
    while stack:
        x = stack.pop()
        if x == b:
            return True
        for y in edges.get(x, ()):
            if y not in seen:
                seen.add(y)
                stack.append(y)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--facts', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    S._assert_private(a.out)
    facts = [json.loads(l) for l in open(a.facts)]
    out, log = [], []
    for sid, cik in BF.PROTO['listingIdentity']['cik'].items():
        cands = BF.PROTO['listingIdentity']['candidateSymbols'][sid]
        by_acc = {}
        for d in facts:
            if d['sid'] != sid:
                continue
            f = by_acc.setdefault(d['accession'], {'filingDate': d['filingDate'], 'symbols': set(), 'changes': []})
            f['symbols'] |= {s['symbol'] for s in d['symbols']}
            f['changes'] += d['changes']
        edges = {}
        for f in by_acc.values():
            for c in f['changes']:
                edges.setdefault(c['from'], set()).add(c['to'])
                edges.setdefault(c['to'], set()).add(c['from'])
        seq = sorted((f['filingDate'], sorted(f['symbols'])) for f in by_acc.values() if len(f['symbols']) == 1)
        for (d0, s0), (d1, s1) in zip(seq, seq[1:]):
            if s0 == s1 or linked(edges, s0[0], s1[0]):
                continue
            head, filings, _ = S.submissions(cik)
            eks = [f for f in filings if f['form'] == '8-K' and d0 <= f['filingDate'] <= d1][:25]
            log.append({'sid': sid, 'transition': [s0[0], s1[0]], 'window': [d0, d1], 'eightKs': len(eks)})
            for f in eks:
                url = S.archive_url(cik, f['accessionNumber'], f['primaryDocument']) if f.get('primaryDocument') else S.full_text_url(cik, f['accessionNumber'])
                body, meta = S.get(url)
                d = {'sid': sid, 'cik': cik, 'accession': f['accessionNumber'], 'form': '8-K', 'filingDate': f['filingDate'], 'reportDate': f.get('reportDate') or '',
                     'kind': 'SYMBOL_CHANGE_8K', **meta}
                fx = BF.doc_facts(d, body, cands, 'NASDAQ' if sid == 'ref_AAPL' else 'NYSE')
                fx['A'], fx['B'] = [], []  # 8-Ks are identity/change sources only
                out.append(fx)
                for c in fx['changes']:
                    edges.setdefault(c['from'], set()).add(c['to'])
                    edges.setdefault(c['to'], set()).add(c['from'])
    with open(a.out, 'w') as fh:
        for f in out:
            fh.write(json.dumps(f) + '\n')
    print(json.dumps({'transitions': log, 'documents': len(out), 'stats': S.STATS}))


if __name__ == '__main__':
    main()
