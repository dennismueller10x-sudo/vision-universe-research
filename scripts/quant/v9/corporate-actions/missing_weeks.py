#!/usr/bin/env python3
"""V9 workstream B: classification of MISSING_WEEKS gaps (documentation only, no repair).

Independent of the JS adapter: re-reads every weekly series directly, recomputes the
ISO-week gaps exactly as weekly-real-adapter.cjs#validate defines them
(monday(date) - monday(prev) != 7 days), and compares the gap set with the
JS triage output (--triage, private). Never interpolates or fills anything.

Usage: python3 -I missing_weeks.py --triage <triage-full.json> --sec <mw-sec.json or ''> --out <json>
"""
import argparse, collections, datetime, hashlib, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[4]
SER = ROOT / 'quant/data/market/discover-series-long'
D = datetime.date.fromisoformat


def monday(s):
    x = D(s)
    return x - datetime.timedelta(days=x.weekday())


def gaps_of(points):
    out = []
    for i in range(1, len(points)):
        a, b = points[i - 1][0], points[i][0]
        if (monday(b) - monday(a)).days != 7:
            out.append({'after': a, 'before': b})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--triage', required=True)
    ap.add_argument('--sec', default='')
    ap.add_argument('--out', required=True)
    ap.add_argument('--delisted', default='')
    a = ap.parse_args()
    tri = json.load(open(a.triage))['results']
    js_mw = {r['id']: r['gaps'] for r in tri if r['status'] == 'MISSING_WEEKS'}
    # coverage of every ISO week across ALL series (to exclude market-wide closures)
    weekcov = collections.Counter()
    series = {}
    for f in sorted(SER.glob('ref_*.json')):
        doc = json.loads(f.read_bytes())
        pts = doc['points']
        series[f.stem] = pts
        for p in pts:
            weekcov[monday(p[0]).isoformat()] += 1
    py_mw = {}
    for sid, pts in series.items():
        g = gaps_of(pts)
        if g:
            py_mw[sid] = g
    # parity of gap sets for the adapter's MISSING_WEEKS listings (the adapter reports gaps only for
    # listings that pass the earlier identity/eligibility/history checks)
    parity_fail = [s for s, g in js_mw.items() if py_mw.get(s) != g]
    other_with_gaps = sorted(set(py_mw) - set(js_mw))
    windows = collections.Counter()
    for sid, g in js_mw.items():
        for x in g:
            windows[(x['after'][:0] + (monday(x['after']) + datetime.timedelta(days=7)).isoformat(), (monday(x['before']) - monday(x['after'])).days // 7 - 1)] += 1
    sec = json.load(open(a.sec)) if a.sec else {}
    rows, cls_count, len_count = [], collections.Counter(), collections.Counter()
    for sid in sorted(js_mw):
        pts = series[sid]
        idx = {p[0]: i for i, p in enumerate(pts)}
        for x in js_mw[sid]:
            first_missing = monday(x['after']) + datetime.timedelta(days=7)
            n = (monday(x['before']) - monday(x['after'])).days // 7 - 1
            missing_weeks = [(first_missing + datetime.timedelta(days=7 * k)).isoformat() for k in range(n)]
            min_cov = min(weekcov.get(w, 0) for w in missing_weeks)
            i = idx[x['before']]
            tail = [p[1] for p in pts[i:]]
            pre = pts[i - 1][1]
            stale_after = len(tail) >= 4 and all(v == pre for v in tail)
            cluster = windows[(first_missing.isoformat(), n)]
            if stale_after:
                c = 'STALE_CARRY_FORWARD_AFTER_GAP'
            elif cluster >= 5:
                c = 'PROVIDER_BATCH_WINDOW'
            else:
                c = 'ISOLATED_GAP'
            lb = '1' if n == 1 else '2-4' if n <= 4 else '5-13' if n <= 13 else '14-52' if n <= 52 else '>52'
            cls_count[c] += 1
            len_count[lb] += 1
            rows.append({'id': sid, 'after': x['after'], 'before': x['before'], 'weeksMissing': n, 'firstMissingWeek': first_missing.isoformat(),
                         'minSeriesWithBarInMissingWeeks': min_cov, 'listingsSharingIdenticalWindow': cluster,
                         'closeBefore': pre, 'closeAfter': pts[i][1], 'ratioAcrossGap': round(pts[i][1] / pre, 6),
                         'constantTailAfterGap': stale_after, 'class': c, 'lengthBucket': lb,
                         'sec': sec.get('gaps', {}).get(sid + '|' + x['after'])})
    per_listing = collections.Counter()
    for sid in js_mw:
        cs = {r['class'] for r in rows if r['id'] == sid}
        per_listing['+'.join(sorted(cs))] += 1
    rep = {
        'schemaVersion': 'v9-ca-missing-weeks-1.0.0',
        'rule': 'gap = consecutive observed bars whose ISO-week Mondays differ by != 7 days (weekly-real-adapter.cjs#validate). Classification is descriptive. NOTHING is interpolated or filled.',
        'listings': len(js_mw), 'gaps': len(rows),
        'parityWithAdapterGaps': {'listingsCompared': len(js_mw), 'mismatches': parity_fail},
        'seriesWithGapsHeldForEarlierReasons': len(other_with_gaps),
        'minSeriesWithBarInAnyMissingWeek': min(r['minSeriesWithBarInMissingWeeks'] for r in rows),
        'classCounts': dict(cls_count), 'lengthCounts': dict(len_count), 'listingClassCombos': dict(per_listing),
        'largestSharedWindows': [{'firstMissingWeek': k[0], 'weeksMissing': k[1], 'listings': v} for k, v in windows.most_common(12)],
        'staleConstantTailListings': sorted({r['id'] for r in rows if r['constantTailAfterGap']}),
        'gapRows': rows,
        'secSample': {'rule': sec.get('sampleRule'), 'coverage': sec.get('coverageNote'), 'sampled': sec.get('sampled'), 'summary': sec.get('summary')} if sec else None,
        'delistedVerification': (lambda d: {'note': d['note'], 'results': {k: {'verdict': v['verdict'], 'nameHypothesis': v['nameHypothesis'], 'verified': v['verified']} for k, v in d['results'].items()}})(json.load(open(a.delisted))) if a.delisted else None,
        'productionApproved': False,
    }
    pathlib.Path(a.out).write_text(json.dumps(rep, indent=1))
    print(json.dumps({k: rep[k] for k in ('listings', 'gaps', 'parityWithAdapterGaps', 'seriesWithGapsHeldForEarlierReasons', 'minSeriesWithBarInAnyMissingWeek', 'classCounts', 'lengthCounts', 'listingClassCombos', 'largestSharedWindows')}, indent=1))
    print('stale', len(rep['staleConstantTailListings']))


if __name__ == '__main__':
    main()
