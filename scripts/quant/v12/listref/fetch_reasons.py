"""V12 LISTREF step 6: 8-K item codes around linked delisting events (EDGAR full-text search metadata, no documents).

For every register event (operating issuer, not still listed) that is linked to an ended reference chain and dated on
or after 2004-08-23 (current 8-K item numbering), one efts.sec.gov query lists the issuer's 8-K filings in
[event-120d, last delisting form+30d] with their item codes. Only metadata is stored (accession/file id, form, date,
items). Fair-access client, 2 req/s, private cache, resumable.

    python3 scripts/quant/v12/listref/fetch_reasons.py --register <private>/work/delisting-register.json --out <private>/work/reasons-results.json
"""
import argparse
import datetime as dt
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrlib as L  # noqa: E402

ITEMS_FROM = '2004-08-23'


def add_days(d, n):
    return (dt.date.fromisoformat(d) + dt.timedelta(days=n)).isoformat()


def reason_url(cik, start, end):
    return ('https://efts.sec.gov/LATEST/search-index?forms=8-K&ciks=%010d&dateRange=custom&startdt=%s&enddt=%s' % (int(cik), start, end))


def selected(register):
    for e in register:
        if not e['linkedChains'] or e['eventDate'] < ITEMS_FROM:
            continue
        last = max(f[1] for f in e['forms'])
        yield e, reason_url(e['cik'], add_days(e['eventDate'], -120), add_days(last, 30))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--register', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    L._assert_private(a.out)
    reg = json.load(open(a.register))
    res = json.load(open(a.out)) if os.path.exists(a.out) else {'schemaVersion': 'v12-listref-reasons-results-1.0.0', 'results': {}, 'errors': {}}
    todo = [(e, u) for e, u in selected(reg) if u not in res['results']]
    t0 = time.time()
    for i, (e, u) in enumerate(todo):
        try:
            body, meta = L.get(u)
            d = json.loads(body)
            hits = d.get('hits', {}).get('hits', [])
            res['results'][u] = {'cik': e['cik'], 'eventDate': e['eventDate'], 'total': d.get('hits', {}).get('total', {}).get('value', 0), 'sha256': meta['sha256'],
                                 'hits': [[h.get('_id'), h['_source'].get('form'), h['_source'].get('file_date'), h['_source'].get('items') or []] for h in hits]}
            res['errors'].pop(u, None)
        except Exception as ex:  # noqa: BLE001
            res['errors'][u] = str(ex)[:200]
        if i % 200 == 0:
            json.dump(res, open(a.out, 'w'))
            print(i, len(todo), round(time.time() - t0), L.STATS, file=sys.stderr, flush=True)
    res['sec'] = dict(L.STATS)
    json.dump(res, open(a.out, 'w'))
    print(json.dumps({'done': len(todo), 'results': len(res['results']), 'errors': len(res['errors']), 'sec': L.STATS}))


if __name__ == '__main__':
    main()
