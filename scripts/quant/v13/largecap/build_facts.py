"""V13 LARGECAP step 2: per-document facts (anchors, symbol/exchange/split/change statements) from the private manifest.
Output: private JSONL (one line per document). Only reads cached bodies; no network unless --fetch-8k is given (symbol-change
8-Ks, protocol 'documents.symbolChange')."""
import argparse
import datetime as dt
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import seclib13 as S  # noqa: E402
import extract as X  # noqa: E402

PROTO = json.load(open(S.ROOT / 'docs/quant-recovery/v13/largecap/protocol-1.0.0.json'))
ANNUAL = ('10-K', '10-K405', '10-KT')


def doc_facts(d, body, cands, exchange):
    rows = X.rows_of(body)
    flat = S.text_of(body)
    rd = dt.date.fromisoformat(d['reportDate']) if d.get('reportDate') else None
    out = {k: d[k] for k in ('sid', 'cik', 'accession', 'form', 'filingDate', 'reportDate', 'kind', 'url', 'sha256', 'sha256Normalized', 'bytes')}
    if d['form'] in ANNUAL:
        a, ar = X.parse_quarterly(rows, rd.year if rd else None)
    else:
        a, ar = [], []
    b, br = X.parse_repurchases(rows, rd)
    out['A'], out['B'] = a, b
    out['rejects'] = ar + br
    out['symbols'] = X.symbol_statements(flat, cands)
    m = X.EXCH[exchange].search(flat)
    out['exchange'] = {'name': exchange, 'quote': flat[max(0, m.start() - 100):m.start() + 150][:300]} if m else None
    out['splits'] = X.split_statements(flat)
    ch = []
    for i, s1 in enumerate(cands):
        for s2 in cands[i + 1:]:
            ch += X.change_statements(flat, s1, s2)
    out['changes'] = ch
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    S._assert_private(a.out)
    exch = {'ref_AAPL': 'NASDAQ'}
    lines = [json.loads(l) for l in open(a.manifest)]
    with open(a.out, 'w') as fh:
        for d in lines:
            if d['kind'] in ('SUBMISSIONS', 'INDEX') or 'error' in d:
                continue
            if a.only and d['sid'] not in a.only.split(','):
                continue
            body = S.cached(d['url'])
            if body is None or S.sha256(body) != d['sha256']:
                raise SystemExit('BODY_MISSING_OR_CHANGED ' + d['url'])
            f = doc_facts(d, body, PROTO['listingIdentity']['candidateSymbols'][d['sid']], exch.get(d['sid'], 'NYSE'))
            fh.write(json.dumps(f) + '\n')
    print('ok')


if __name__ == '__main__':
    main()
