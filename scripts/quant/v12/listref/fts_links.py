"""V12 LISTREF step 5: EDGAR full-text search (efts.sec.gov) for link confirmation and discovery (amendment 1.0.1 A3/A4).

Reads the query list emitted by build_reference.cjs and fetches each URL once through the fair-access client
(2 req/s, private cache; resumable). Stores only compact metadata per query: total hit count and, per hit on the first
result page, the CIK list, form and filing date. Merges into an existing results file.

    python3 scripts/quant/v12/listref/fts_links.py --queries <private>/work/fts-queries-pass1.json --out <private>/work/fts-results.json [--limit N]
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrlib as L  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--queries', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    L._assert_private(a.out)
    qs = json.load(open(a.queries))['queries']
    res = json.load(open(a.out)) if os.path.exists(a.out) else {'schemaVersion': 'v12-listref-fts-results-1.0.0', 'results': {}, 'errors': {}}
    todo = [q for q in qs if q['url'] not in res['results']]
    if a.limit:
        todo = todo[:a.limit]
    t0 = time.time()
    for i, q in enumerate(todo):
        try:
            body, meta = L.get(q['url'])
            d = json.loads(body)
            if 'hits' not in d:
                L.drop_cached(q['url'])
                raise RuntimeError('EFTS_ERROR_BODY ' + str(d)[:120])
            hits = d.get('hits', {}).get('hits', [])
            res['results'][q['url']] = {'kind': q['kind'], 'total': d.get('hits', {}).get('total', {}).get('value', 0), 'sha256': meta['sha256'],
                                        'hits': [[h['_source'].get('ciks', []), h['_source'].get('form'), h['_source'].get('file_date')] for h in hits]}
            res['errors'].pop(q['url'], None)
        except Exception as e:  # noqa: BLE001
            res['errors'][q['url']] = str(e)[:200]
        if i % 200 == 0:
            json.dump(res, open(a.out, 'w'))
            print(i, len(todo), round(time.time() - t0), L.STATS, file=sys.stderr, flush=True)
    res['sec'] = dict(L.STATS)
    json.dump(res, open(a.out, 'w'))
    print(json.dumps({'done': len(todo), 'results': len(res['results']), 'errors': len(res['errors']), 'sec': L.STATS}))


if __name__ == '__main__':
    main()
