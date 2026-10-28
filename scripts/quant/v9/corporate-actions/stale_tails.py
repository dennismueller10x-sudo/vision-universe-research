#!/usr/bin/env python3
"""V9 workstream B side finding: weekly series whose LAST >= 8 published closes are identical (stale carry-forward
candidates), counted per adapter status from the JS triage output. Descriptive only; identical closes over >= 8 weeks
can in rare cases be genuine for illiquid listings, so this is a candidate list, not a verdict.
Usage: python3 -I stale_tails.py --triage <triage-full.json> --out <json>"""
import argparse, collections, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[4]
ap = argparse.ArgumentParser(); ap.add_argument('--triage', required=True); ap.add_argument('--out', required=True); a = ap.parse_args()
res = json.load(open(a.triage))['results']
by, rows = collections.Counter(), []
for r in res:
    p = json.loads((ROOT / 'quant/data/market/discover-series-long' / (r['id'] + '.json')).read_bytes())['points']
    n = 1
    while n < len(p) and p[-1 - n][1] == p[-1][1]:
        n += 1
    if n >= 8:
        by[r['status']] += 1
        rows.append({'id': r['id'], 'status': r['status'], 'identicalTailWeeks': n, 'firstIdenticalWeek': p[-n][0], 'close': p[-1][1]})
pathlib.Path(a.out).write_text(json.dumps({'schemaVersion': 'v9-ca-stale-tail-1.0.0', 'rule': 'last >= 8 weekly closes exactly identical', 'byStatus': dict(by),
    'qualifiedWithStaleTail': sorted(x['id'] for x in rows if x['status'] == 'QUALIFIED'), 'rows': rows, 'productionApproved': False}, indent=1))
print(dict(by))
