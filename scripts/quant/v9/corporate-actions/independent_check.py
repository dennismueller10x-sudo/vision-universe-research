#!/usr/bin/env python3
"""V9 workstream B: INDEPENDENT Python re-implementation (stdlib only) of
  (1) the engine's split-sized suspect detection and evidence resolution (corporate-action-evidence.js),
  (2) the k-ratio computations, and
  (3) the v9-ca-resolution-rule-1.0.0 decisions,
reading the inputs DIRECTLY: weekly series files, the security master, and the raw SEC bodies in the private
DiskCache (company_tickers.json, submissions, companyfacts, efts responses). The JS outputs (triage events,
classify.cjs resolutions, dry run) are read ONLY to compare against.

Usage: python3 -I independent_check.py --private <dir> --resolutions <classify json> --dryrun <dryrun json> --out <json>
"""
import argparse, gzip, hashlib, json, math, pathlib, re, urllib.parse, datetime, collections

ROOT = pathlib.Path(__file__).resolve().parents[4]
SER = ROOT / 'quant/data/market/discover-series-long'
RATIOS, TOL, DOM = (2, 3, 4, 5, 10), 0.03, 0.75
SPLIT_Q = '"stock split" OR "reverse split" OR "share consolidation" OR "reverse stock split"'
DIST_Q = '"spin-off" OR spinoff OR "special dividend" OR "special cash dividend" OR "distribution of all" OR "pro rata distribution" OR "separation and distribution"'
STRONG_DIST = {'8-K', '8-K/A', '6-K', '10-12B', '10-12B/A', '10-12G', '10-12G/A'}
DAY = datetime.timedelta(days=1)


def D(s):
    return datetime.date.fromisoformat(s[:10])


class Cache:
    def __init__(self, d):
        self.d = pathlib.Path(d)

    def get(self, url):
        h = hashlib.sha256(url.encode()).hexdigest()
        p = self.d / h[:2] / (h + '.gz')
        if not p.exists():
            return None
        raw = gzip.open(p).read()
        return raw

    def json(self, url):
        b = self.get(url)
        return None if b is None else json.loads(b)


def split_sized(r):
    if not (isinstance(r, (int, float)) and math.isfinite(r) and r > 0):
        return None
    for k in RATIOS:
        if abs(r / k - 1) < TOL:
            return (k, 'UP')
        if abs(r * k - 1) < TOL:
            return (k, 'DOWN')
    return None


def engine_resolve(time, ca):
    if not ca or ca.get('version') != 'corporate-action-evidence-1.0.0' or not isinstance(ca.get('moves'), list):
        return 'NO_EVIDENCE', None
    m = next((x for x in ca['moves'] if x['week'] == time), None)
    if m is None:
        return 'NO_EVIDENCE_FOR_WEEK', None
    if m['splitInWeek']:
        return 'PROVIDER_SPLIT_IN_WEEK', m
    if not isinstance(m.get('maxDailyRatio'), (int, float)):
        return 'NO_DAILY_BARS', m
    if split_sized(m['maxDailyRatio']):
        return 'SINGLE_DAY_SPLIT_SIZED_JUMP', m
    if abs(math.log(m['maxDailyRatio'])) >= DOM * abs(math.log(m['weeklyRatio'])):
        return 'SINGLE_DAY_DOMINATES_WEEK', m
    return 'RESOLVED', m


def as_reported(rows, unit):
    best = {}
    for r in rows or []:
        if r.get('end') is None or not isinstance(r.get('val'), (int, float)) or r.get('unit_') != unit:
            continue
        cur = best.get(r['end'])
        if cur is None or r['filed'] < cur['filed']:
            best[r['end']] = {'filed': r['filed'], 'accn': r['accn'], 'vals': {r['val']}}
        elif r['filed'] == cur['filed'] and r['accn'] == cur['accn']:
            cur['vals'].add(r['val'])
    out = []
    for end, v in best.items():
        if len(v['vals']) == 1 and next(iter(v['vals'])) > 0:
            out.append((end, next(iter(v['vals'])), v['accn'], v['filed']))
    return sorted(out)


def facts_of(cf, ns, concept):
    node = ((cf or {}).get('facts', {}).get(ns, {}) or {}).get(concept)
    rows = []
    if node:
        for unit, arr in node['units'].items():
            for x in arr:
                rows.append(dict(x, unit_=unit))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--private', required=True)
    ap.add_argument('--resolutions', required=True)
    ap.add_argument('--dryrun', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    C = Cache(pathlib.Path(a.private) / 'http-cache')
    master = json.load(open(ROOT / 'quant/data/market/security-master/us-security-master.json'))
    tick = C.json('https://www.sec.gov/files/company_tickers.json')
    t2c = collections.defaultdict(list)
    for row in tick.values():
        t2c[row['ticker'].upper().replace('.', '-')].append(str(row['cik_str']).zfill(10))
    js = json.load(open(a.resolutions))
    js_rows = {(r['id'], r['week']): r for r in js['rows']}
    held_ids = sorted({r['id'] for r in js['rows']})
    # (1)+(2): recompute suspects/engine reasons/k for every held listing directly from series bytes
    py_events = {}
    for sid in held_ids:
        doc = json.loads((SER / (sid + '.json')).read_bytes())
        pts = doc['points']
        for i in range(1, len(pts)):
            r = pts[i][1] / pts[i - 1][1]
            ss = split_sized(r)
            if not ss:
                continue
            reason, m = engine_resolve(pts[i][0], doc.get('corporateActions'))
            py_events[(sid, pts[i][0])] = {'ratio': r, 'k': ss[0], 'dir': ss[1], 'reason': reason, 'm': m, 'i': i, 'doc': doc}
    ev_parity = {'jsEvents': len(js_rows), 'pyEvents': len(py_events), 'missingInPy': [], 'missingInJs': [], 'kMismatch': [], 'ratioMaxAbsDiff': 0.0, 'reasonMismatch': []}
    for key, r in js_rows.items():
        p = py_events.get(key)
        if p is None:
            ev_parity['missingInPy'].append(key)
            continue
        if (p['k'], p['dir']) != (r['k'], r['direction']):
            ev_parity['kMismatch'].append(key)
        ev_parity['ratioMaxAbsDiff'] = max(ev_parity['ratioMaxAbsDiff'], abs(round(p['ratio'], 6) - r['weeklyRatio']))
        js_reason = 'RESOLVED' if r['engineStatus'] == 'RESOLVED_GENUINE_MOVE' else r['engineReason']
        if p['reason'] != js_reason:
            ev_parity['reasonMismatch'].append(key)
    ev_parity['missingInJs'] = [k for k in py_events if k not in js_rows]
    # (3) resolution rule, independently
    cache_sub, cache_cf = {}, {}
    decisions = {}
    for key, p in py_events.items():
        sid, week = key
        doc, i = p['doc'], p['i']
        pts = doc['points']
        if p['reason'] == 'RESOLVED':
            decisions[key] = 'ENGINE_RESOLVED'
            continue
        ciks = t2c.get(doc['ticker'].upper().replace('.', '-'), [])
        if len(ciks) != 1:
            decisions[key] = 'UNRESOLVED_NO_SEC_MAPPING'
            continue
        cik = ciks[0]
        if cik not in cache_cf:
            cache_cf[cik] = C.json(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json')
            sub = C.json(f'https://data.sec.gov/submissions/CIK{cik}.json')
            fl = []
            if sub:
                blocks = [sub['filings']['recent']]
                for pg in sub['filings'].get('files', []):
                    b = C.json('https://data.sec.gov/submissions/' + pg['name'])
                    if b:
                        blocks.append(b)
                for b in blocks:
                    for j in range(len(b['accessionNumber'])):
                        fl.append((b['form'][j], b['filingDate'][j], b['accessionNumber'][j], b.get('items', [''] * len(b['form']))[j] or ''))
            cache_sub[cik] = fl
        cf, fl = cache_cf[cik], cache_sub[cik]
        prev_week = pts[i - 1][0]
        m = p['m'] or {}
        start = m.get('maxDailyDate') if m.get('maxDailyDate') and m['maxDailyDate'] > prev_week else week
        br = None
        for ns, c in (('dei', 'EntityCommonStockSharesOutstanding'), ('us-gaap', 'CommonStockSharesOutstanding')):
            ar = as_reported(facts_of(cf, ns, c), 'shares')
            pre = [x for x in ar if D(prev_week) - 200 * DAY <= D(x[0]) <= D(prev_week)]
            post = [x for x in ar if D(start) <= D(x[0]) <= D(week) + 200 * DAY]
            if pre and post:
                br = (pre[-1], post[0])
                break
        lo, hi = D(week) - 120 * DAY, D(week) + 60 * DAY
        near = lambda f: D(prev_week) - 30 * DAY <= D(f) <= D(week) + 30 * DAY

        def efts(q):
            u = 'https://efts.sec.gov/LATEST/search-index?' + urllib.parse.urlencode({'q': q, 'ciks': cik, 'dateRange': 'custom', 'startdt': lo.isoformat(), 'enddt': hi.isoformat()})
            r = C.json(u)
            return [] if r is None else [(h['_id'], h['_source'].get('form') or '', h['_source'].get('file_date')) for h in r['hits']['hits']]
        noise = re.compile(r'ex-?_?10|ex-?_?2[-_.]|ex2-|ex10|ex-2d|ex10d', re.I)
        window = [f for f in fl if lo <= D(f[1]) <= hi]
        acc3503 = {f[2] for f in window if f[0].startswith('8-K') and re.search(r'(^|,)(3\.03|5\.03)(,|$)', f[3])}
        covered = week >= '2001-01-01'
        sh = efts(SPLIT_Q) if covered else []
        sh = [h for h in sh if not noise.search(h[0].split(':', 1)[1] if ':' in h[0] else '')]
        strong = [h for h in sh if h[1].startswith('8-K') and h[0].split(':')[0] in acc3503 and near(h[2])]
        weak = [h for h in sh if re.match(r'^(8-K|6-K)', h[1]) and h not in strong and near(h[2])]
        k = p['k']
        ratio_facts = [x for x in facts_of(cf, 'us-gaap', 'StockholdersEquityNoteStockSplitConversionRatio1')
                       if x.get('end') and near(x['end']) and (abs(x['val'] / k - 1) < 0.03 or abs(x['val'] * k - 1) < 0.03)]
        dh = efts(DIST_Q) if covered else []
        dist = [h for h in dh if not noise.search(h[0].split(':', 1)[1] if ':' in h[0] else '') and h[1] in STRONG_DIST
                and (h[1].startswith('10-12') or D(prev_week) - 90 * DAY <= D(h[2]) <= D(week) + 30 * DAY)]
        i201 = [f for f in window if f[0].startswith('8-K') and re.search(r'(^|,)2\.01(,|$)', f[3]) and near(f[1])]
        # round trip
        L = abs(math.log(p['ratio']))
        rt = any(abs(math.log(c[1] / pts[i - 1][1])) < 0.5 * L for c in pts[i + 1:i + 5])
        # identity via public float
        fl_rows = as_reported(facts_of(cf, 'dei', 'EntityPublicFloat'), 'USD')
        sh_rows = as_reported(facts_of(cf, 'dei', 'EntityCommonStockSharesOutstanding'), 'shares')
        splits = (doc.get('corporateActions') or {}).get('splits') or []
        ratios = []
        for end, val, accn, filed in fl_rows:
            if abs((D(end) - D(week)).days) > 730:
                continue
            cand = sorted([s for s in sh_rows if abs((D(s[0]) - D(end)).days) <= 200], key=lambda s: abs((D(s[0]) - D(end)).days))
            px = None
            for pt in pts:
                if pt[0] <= end:
                    px = pt[1]
                else:
                    break
            if not cand or px is None:
                continue
            fac = 1.0
            for s in splits:
                if s[0] > end:
                    fac *= s[1]
            ratios.append(val / (px * fac * cand[0][1]))
        ident = 'NO_FLOAT_FACT' if not ratios else ('CONSISTENT' if any(0.2 <= round(x, 4) <= 1.1 for x in ratios) else 'INCONSISTENT')
        if br is None:
            dec = 'UNRESOLVED_PRE_XBRL_NO_SHARE_BRACKET' if week < '2009-06-15' else 'UNRESOLVED_NO_SHARE_BRACKET'
        else:
            R = br[1][1] / br[0][1]
            S = k if p['dir'] == 'DOWN' else 1 / k
            cont = abs(math.log(R)) <= math.log(1.25)
            splitc = abs(math.log(R) - math.log(S)) <= math.log(1.2)
            if splitc:
                dec = 'UNRESOLVED_NO_FULLTEXT_COVERAGE' if not covered else ('SPLIT_CONFIRMED_SERIES_UNADJUSTED' if (strong or ratio_facts or weak) else 'SHARES_K_CHANGE_UNEXPLAINED')
            elif cont:
                if not covered:
                    dec = 'UNRESOLVED_NO_FULLTEXT_COVERAGE'
                elif strong or ratio_facts:
                    dec = 'CONFLICT_SPLIT_FILING_WITH_CONTINUOUS_SHARES'
                elif weak:
                    dec = 'SPLIT_MENTION_NEAR_DATE_REVIEW'
                elif m.get('splitInWeek'):
                    dec = 'PROVIDER_SPLIT_UNSUPPORTED'
                elif p['dir'] == 'DOWN' and (dist or i201):
                    dec = 'SPIN_OFF_OR_DISTRIBUTION_CANDIDATE'
                elif rt:
                    dec = 'ROUND_TRIP_PRICE_INTEGRITY'
                elif ident == 'INCONSISTENT':
                    dec = 'UNRESOLVED_IDENTITY_INCONSISTENT'
                else:
                    dec = 'GENUINE_MOVE_SUPPORTED'
            else:
                dec = 'UNRESOLVED_SHARES_OTHER_CHANGE'
        decisions[key] = (dec, ident)
    mism = []
    for key, r in js_rows.items():
        d = decisions.get(key)
        dec = d if isinstance(d, str) else (d[0] if d else None)
        if dec != r['resolution']:
            mism.append({'key': key, 'js': r['resolution'], 'py': dec})
        elif isinstance(d, tuple) and r.get('identity') and d[1] != r['identity']['status'] and dec == 'GENUINE_MOVE_SUPPORTED':
            mism.append({'key': key, 'js': r['identity']['status'], 'py': d[1], 'field': 'identity'})
    py_counts = collections.Counter(d if isinstance(d, str) else d[0] for d in decisions.values())
    # accepted GENUINE (identity consistent) per listing -> would-qualify count, independently
    by_id = collections.defaultdict(list)
    for key, d in decisions.items():
        by_id[key[0]].append(d)
    MANUAL_DIST = {('ref_ABT', '2013-01-04')}
    would = []
    for sid, ds in by_id.items():
        ok = True
        for (key, d) in [(k2, decisions[k2]) for k2 in decisions if k2[0] == sid]:
            if d == 'ENGINE_RESOLVED':
                continue
            if isinstance(d, tuple) and d[0] == 'GENUINE_MOVE_SUPPORTED' and d[1] == 'CONSISTENT':
                continue
            if isinstance(d, tuple) and d[0] == 'SPIN_OFF_OR_DISTRIBUTION_CANDIDATE' and key in MANUAL_DIST:
                continue
            ok = False
        if ok:
            would.append(sid)
    dry = json.load(open(a.dryrun))
    js_new = sorted(x['id'] for x in dry['newlyQualified'])
    rep = {'schemaVersion': 'v9-ca-independent-check-1.0.0', 'implementation': 'Python stdlib, reads series + master + raw SEC cache bodies directly',
           'eventParity': {k: (v if not isinstance(v, list) else len(v)) for k, v in ev_parity.items()},
           'eventParityExamples': {k: v[:5] for k, v in ev_parity.items() if isinstance(v, list) and v},
           'resolutionParity': {'events': len(js_rows), 'mismatches': len(mism), 'examples': mism[:20]},
           'pyResolutionCounts': dict(py_counts), 'jsResolutionCounts': js['counts']['byResolution'],
           'wouldQualify': {'py': len(would), 'js': len(js_new), 'identical': sorted(would) == js_new, 'onlyPy': sorted(set(would) - set(js_new)), 'onlyJs': sorted(set(js_new) - set(would))},
           'tolerance': 'weekly ratios compared after rounding to 6 decimals (engine stores r6); k/direction/reasons/decisions must match exactly.'}
    pathlib.Path(a.out).write_text(json.dumps(rep, indent=1))
    print(json.dumps({k: rep[k] for k in ('eventParity', 'resolutionParity', 'wouldQualify')}, indent=1))


if __name__ == '__main__':
    main()
