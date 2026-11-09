"""V13b LARGECAP-STRICT independent check (stdlib only; run with python3 -I). Separate implementation of amendment 1.1.0
(STRICT_INTERVAL_BOUNDARY), not a port of evaluate-1.1.0.cjs:

1. every period of cases-1.0.0.json: band test re-computed from the committed series with its own unit conversion;
2. runs of protocol 1.0.0 re-formed with membership and compared with the 1.0.1 runs;
3. the strict boundaries re-derived (own clipping, own evidenced-start rule, own history-guard hash) and compared with cases-1.1.0.json;
4. every period that places or evidences a 1.1.0 boundary is re-read from the RAW private SEC body: sha256 of the bytes, quote located
   in an own flattening of the raw text, the period dates and the price re-parsed from the raw text at that position, the quarter
   mapped with the fiscal-year-end month of the registrant's 10-K (manifest), the band test repeated with the raw-text numbers.

python3 -I scripts/quant/v13b/largecap-strict/verify_strict.py <repo> <private largecap dir> <out.json>
"""
import datetime
import gzip
import hashlib
import html
import json
import os
import re
import sys

REPO, PRIV, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SCRATCH = os.path.dirname(os.path.dirname(PRIV.rstrip('/')))
CACHES = [os.path.join(PRIV, 'http-cache')] + [os.path.join(SCRATCH, p, 'http-cache') for p in (
    'v12-private/largecap', 'v10-private/corporate-actions', 'v10-private/population', 'v12-private/indexpop', 'v12-private/listref', 'v12-private/mcap')]
V13 = os.path.join(REPO, 'docs/quant-recovery/v13/largecap')
V13B = os.path.join(REPO, 'docs/quant-recovery/v13b/largecap-strict')
TOL_A, TOL_B, BUF_A, BIG, GAP, EVW, MAXF, MINBARS = 0.01, 0.10, 10, 0.10, 366, 120, 0.05, 104
BUFFER = {'A': 10, 'B': 0}
MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
problems = []


def D(s):
    return datetime.date.fromisoformat(s)


def plus(s, n):
    return (D(s) + datetime.timedelta(days=n)).isoformat()


def raw_body(url):
    key = hashlib.sha256(url.encode()).hexdigest()
    for c in CACHES:
        p = os.path.join(c, key[:2], key + '.gz')
        if os.path.exists(p):
            with gzip.open(p, 'rb') as fh:
                return fh.read()
    return None


def flatten(b):
    s = b.decode('utf-8', 'replace')
    s = re.sub(r'(?is)<(script|style)\b.*?</\1>', ' ', s)
    s = re.sub(r'(?s)<[^>]*>', ' ', s)
    return ' '.join(html.unescape(s).split())


def find_loose(text, needle):
    k = text.find(needle)
    if k >= 0:
        return k
    core = re.sub(r'\s+', '', needle)[:100]
    m = re.search(r'\s*'.join(map(re.escape, core)), text)
    return m.start() if m else -1


def jhash(points):
    return hashlib.sha256(json.dumps(points, separators=(',', ':')).encode()).hexdigest()


def mon(w):
    w = w.lower()[:3]
    return MONTHS.index(w) + 1 if w in MONTHS else None


def month_end(y, m):
    return datetime.date(y + m // 12, m % 12 + 1, 1) - datetime.timedelta(days=1)


def raw_b_period(seg, report):
    """own parse of the row label at the start of seg (raw text)."""
    lab = seg[:160]
    two = [(a, b, c) for a, b, c in re.findall(r'([A-Z][a-z]{2,8})\.?\s+(\d{1,2}),?\s+((?:19|20)\d\d)', lab) if mon(a)][:2]
    if len(two) == 2:
        return [datetime.date(int(c), mon(a), int(b)).isoformat() for a, b, c in two]
    sl = re.findall(r'(\d{1,2})/(\d{1,2})/(\d{2,4})', lab)[:2]
    if len(sl) == 2:
        out = []
        for m_, d_, y_ in sl:
            y = int(y_)
            y = y if y > 99 else (2000 + y if y < 50 else 1900 + y)
            out.append(datetime.date(y, int(m_), int(d_)).isoformat())
        return out
    m = re.search(r'([A-Z][a-z]{2,8})\.?\s+(\d{1,2})\s*(?:-|–|—|to|through)\s*(?:([A-Z][a-z]{2,8})\.?\s*)?(\d{1,2})\b(?:,?\s*((?:19|20)\d\d))?', lab)
    if m and mon(m.group(1)):
        m1, m2 = mon(m.group(1)), mon(m.group(3)) if m.group(3) else mon(m.group(1))
        y2 = int(m.group(5)) if m.group(5) else (report.year if m2 <= report.month else report.year - 1)
        y1 = y2 if m1 <= m2 else y2 - 1
        return [datetime.date(y1, m1, int(m.group(2))).isoformat(), datetime.date(y2, m2, int(m.group(4))).isoformat()]
    m = re.search(r'([A-Z][a-z]{2,8})\s+((?:19|20)\d\d)?', lab)
    if m and mon(m.group(1)):
        mm = mon(m.group(1))
        y = int(m.group(2)) if m.group(2) else (report.year if mm <= report.month else report.year - 1)
        return [datetime.date(y, mm, 1).isoformat(), month_end(y, mm).isoformat()]
    return None


cases0_bytes = open(os.path.join(V13, 'cases-1.0.0.json'), 'rb').read()
cases0 = json.loads(cases0_bytes)
cases1_bytes = open(os.path.join(V13B, 'cases-1.1.0.json'), 'rb').read()
cases1 = json.loads(cases1_bytes)
amend_bytes = open(os.path.join(V13B, 'protocol-amendment-1.1.0.json'), 'rb').read()
if hashlib.sha256(amend_bytes).hexdigest() != open(os.path.join(V13B, 'protocol-amendment-1.1.0.sha256')).read().split()[0]:
    problems.append('AMENDMENT_SIDECAR_SHA256')
if cases1['amendment110Sha256'] != hashlib.sha256(amend_bytes).hexdigest() or cases1['basedOn']['casesSha256'] != hashlib.sha256(cases0_bytes).hexdigest():
    problems.append('CASES_1.1.0_CHAIN')
manifest = [json.loads(x) for x in open(os.path.join(PRIV, 'manifest.jsonl')) if x.strip()]
report_of = {d['url']: d.get('reportDate') for d in manifest if 'url' in d}
for x in open(os.path.join(PRIV, 'facts-8k.jsonl')):
    if x.strip():
        d = json.loads(x)
        report_of.setdefault(d['url'], d.get('reportDate'))

per = {}
for c0 in cases0['cases']:
    sid = c0['securityId']
    c1 = next(c for c in cases1['cases'] if c['securityId'] == sid)
    series = json.load(open(os.path.join(REPO, 'quant/data/market/discover-series-long', sid + '.json')))
    pts = series['points']
    split_cls = {f['date']: f['class'] for f in c0['factors']}
    facs = series['corporateActions'].get('splits') or []

    def conv(i, filing):
        m = 1.0
        for d, fct in facs:
            if (split_cls[d] == 'SPLIT' and d > filing) or (split_cls[d] != 'SPLIT' and d > pts[i][0]):
                m *= fct
        return pts[i][1] * m

    def band(kind, start, end, filing, low=None, high=None, avg=None):
        if kind == 'A':
            idx = [i for i, p in enumerate(pts) if (D(p[0]) - D(start)).days > BUF_A and (D(end) - D(p[0])).days > BUF_A]
            cs = [conv(i, filing) for i in idx]
            ok = len(cs) >= 3 and all(low * (1 - TOL_A) <= v <= high * (1 + TOL_A) for v in cs)
            dev = max([0.0] + [max((low - v) / low, (v - high) / high) for v in cs])
            return ok, dev
        idx = [i for i, p in enumerate(pts) if start <= p[0] <= plus(end, 6)]
        prev = [i for i, p in enumerate(pts) if p[0] < start]
        if prev:
            idx = [prev[-1]] + idx
        cs = [conv(i, filing) for i in idx]
        if len(cs) < 2:
            return False, 0.0
        lo, hi = min(cs), max(cs)
        return lo * (1 - TOL_B) <= avg <= hi * (1 + TOL_B), max(0.0, (lo - avg) / lo, (avg - hi) / hi)

    # 1. band tests of every period (own conversion)
    P = c0['periods']
    own = []
    nb = 0
    for k, p in enumerate(P):
        ok, dev = band(p['type'], p['start'], p['end'], p['filingDate'], p.get('low'), p.get('high'), p.get('avgPrice'))
        if ok != p['pass'] or abs(round(dev, 4) - p['deviation']) > 1e-4:
            problems.append('BAND %s #%d own=%s/%.4f' % (sid, k, ok, dev))
        else:
            nb += 1
        own.append({'k': k, 'type': p['type'], 'start': p['start'], 'end': p['end'], 'pass': ok, 'dev': dev})
    order = sorted(own, key=lambda x: (x['end'], x['start'], x['k']))
    if [x['k'] for x in order] != list(range(len(own))):
        problems.append('SORT_ORDER ' + sid)

    # 2. runs with membership
    ev = []
    for i in range(1, len(pts)):
        r = pts[i][1] / pts[i - 1][1]
        if any(abs(r / f - 1) < 0.05 or abs(r * f - 1) < 0.05 for f in (2, 3, 4, 5, 10, 1.5)):
            ev.append(pts[i][0])
    ev = sorted(ev + [d for d, _ in facs])
    runs, cur, k = [], [], 0
    while k < len(own):
        x = own[k]
        if not x['pass'] and x['dev'] > BIG:
            runs, cur = runs + ([cur] if cur else []), []
            k += 1
            continue
        if not x['pass'] and k + 1 < len(own) and not own[k + 1]['pass']:
            runs, cur = runs + ([cur] if cur else []), []
            k += 2
            while k < len(own) and not own[k]['pass']:
                k += 1
            continue
        good = [own[j] for j in cur if own[j]['pass']]
        if x['pass'] and good and (D(x['start']) - D(good[-1]['end'])).days > GAP:
            runs, cur = runs + [cur], []
        cur.append(k)
        k += 1
    if cur:
        runs.append(cur)

    def cut(run):
        good = [own[j] for j in run if own[j]['pass']]
        if not good:
            return [run]
        lo, hi = min(g['start'] for g in good), max(g['end'] for g in good)
        for e in ev:
            if not (lo < e <= hi):
                continue
            b = any(g['start'] <= e <= g['end'] or (e > g['end'] and (D(e) - D(g['end'])).days <= EVW) for g in good)
            a = any(g['start'] <= e <= g['end'] or (g['start'] > e and (D(g['start']) - D(e)).days <= EVW) for g in good)
            if not (a and b):
                r1, r2 = [j for j in run if own[j]['end'] < e], [j for j in run if own[j]['start'] > e]
                return (cut(r1) if r1 else []) + (cut(r2) if r2 else [])
        return [run]
    runs = [r for rr in runs for r in cut(rr)]
    runs_ok = len(runs) == len(c0['runs'])
    for r, b in zip(runs, c0['runs']):
        good = [own[j] for j in r if own[j]['pass']]
        if len(r) != b['periods'] or len(good) != b['pass'] or (good and (min(g['start'] for g in good), max(g['end'] for g in good)) != (b['anchoredStart'], b['anchoredEnd'])):
            runs_ok = False
    if not runs_ok:
        problems.append('RUNS ' + sid)

    # 3. strict boundaries (own)
    rec = {'bandAgree': nb, 'periods': len(P), 'runsAgree': runs_ok}
    if c0['status'] == 'UNLOCKED':
        iv = c0['interval']
        j = next(n for n, b in enumerate(c0['runs']) if b.get('accepted') and b['validFrom'] == iv['validFrom'] and b['validTo'] == iv['validTo'])
        mem = set(runs[j])
        lo_i, hi_i = min(mem), max(mem)
        s0, e0 = c0['runs'][j]['start'], c0['runs'][j]['end']
        fails = [x for x in own if not x['pass'] and x['k'] not in mem]
        inner = [x for x in fails if lo_i < x['k'] < hi_i]
        S, E = s0, e0
        pre = [x for x in fails if x['k'] < lo_i]
        post = [x for x in fails if x['k'] > hi_i]
        moved = True
        while moved:
            moved = False
            for x in pre:
                lim = plus(x['end'], BUFFER[x['type']])
                if lim >= S:
                    S, moved = plus(lim, 1), True
            for x in post:
                lim = plus(x['start'], -BUFFER[x['type']])
                if lim <= E:
                    E, moved = plus(lim, -1), True
        good = [own[m] for m in sorted(mem) if own[m]['pass']]
        cont_s = [g for g in good if g['start'] <= S <= g['end']]
        if not cont_s:
            nxt = sorted([g for g in good if g['start'] > S], key=lambda g: g['start'])
            if nxt:
                S, cont_s = nxt[0]['start'], [nxt[0]]
        cont_e = [g for g in good if g['start'] <= E <= g['end']]
        if not cont_e:
            prv = sorted([g for g in good if g['end'] < E], key=lambda g: g['end'])
            if prv:
                E, cont_e = prv[-1]['end'], [prv[-1]]
        inside = [p for p in pts if S <= p[0] <= E]
        mine = None if inner or not cont_s or not cont_e or len(inside) < MINBARS else (inside[0][0], inside[-1][0], len(inside), jhash(inside))
        theirs = (c1['interval']['validFrom'], c1['interval']['validTo'], c1['interval']['bars'], c1['historyGuard']['pointsSha256']) if c1.get('interval') else None
        if mine != theirs:
            problems.append('STRICT_INTERVAL %s own=%s cases=%s' % (sid, mine and mine[:3], theirs and theirs[:3]))
        clip_s = sorted(x['k'] for x in pre if plus(x['end'], BUFFER[x['type']]) >= s0)
        clip_e = sorted(x['k'] for x in post if plus(x['start'], -BUFFER[x['type']]) <= e0)
        if clip_s != [x['index'] for x in c1['strict']['clipStart']] or clip_e != [x['index'] for x in c1['strict']['clipEnd']]:
            problems.append('CLIP_SET ' + sid)
        if mine and not (mine[0] >= iv['validFrom'] and mine[1] <= iv['validTo']):
            problems.append('MONOTONICITY ' + sid)
        moves_in = [m['week'] for m in c0['bandConfirmedMoves'] if mine and m['prevWeek'] >= mine[0] and m['week'] <= mine[1]]
        if moves_in != [m['week'] for m in c1.get('bandConfirmedMoves', [])]:
            problems.append('MOVES ' + sid)
        rec.update({'v101': [iv['validFrom'], iv['validTo'], iv['bars']], 'own110': list(mine[:3]) if mine else None, 'strictStart': S, 'strictEnd': E,
                    'clipStart': clip_s, 'clipEnd': clip_e, 'bandConfirmedMovesInside': moves_in, 'match': mine == theirs})

        # 4. raw-source re-read of every boundary-placing / boundary-evidencing period
        raw = []
        roles = [('clipStart', x) for x in c1['strict']['clipStart']] + [('clipEnd', x) for x in c1['strict']['clipEnd']] + \
                [('startEvidence', c1['strict']['startEvidence']), ('endEvidence', c1['strict']['endEvidence'])]
        for role, x in roles:
            b = raw_body(x['url'])
            r = {'role': role, 'index': x['index'], 'type': x['type'], 'url': x['url'], 'accession': x['accession']}
            if b is None:
                problems.append('RAW_BODY_MISSING %s %s' % (sid, x['url']))
                raw.append(r)
                continue
            r['sha256Match'] = hashlib.sha256(b).hexdigest() == x['sha256']
            t = flatten(b)
            row = x['quote'].split(' | ')[-1]
            at = find_loose(t, row)
            r['quoteFound'] = at >= 0
            rep = D(report_of.get(x['url']) or x['filingDate'])
            if x['type'] == 'B':
                lab = x['quote'].split(' | ')[0] if ' | ' in x['quote'] else row
                la = find_loose(t, lab)
                perd = raw_b_period(t[la:la + len(lab) + 5], rep) if la >= 0 else None
                seg = t[at:at + len(row) + 40] if at >= 0 else ''
                seg = re.sub(r'[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+(?:19|20)\d\d|\d{1,2}/\d{1,2}/\d{2,4}|\((?:\d{1,2}|[A-Za-z]{1,2})\)', ' ', seg)
                price = None
                for m in re.finditer(r'(\$\s*)?(\d[\d,]*)(\.\d+)?', seg):
                    if m.group(1) or m.group(3):
                        price = float(m.group(2).replace(',', '') + (m.group(3) or ''))
                        break
                r.update({'rawPeriod': perd, 'rawPrice': price})
                okp = perd == [x['start'], x['end']] and price is not None and abs(price - x['avgPrice']) < 1e-9
                if okp:
                    ok, dev = band('B', perd[0], perd[1], x['filingDate'], avg=price)
                    okp = ok == x['pass'] and abs(round(dev, 4) - x['deviation']) < 1e-4
            else:
                seg = t[at:at + len(row) + 20] if at >= 0 else ''
                nums = [float(v.replace(',', '')) for v in re.findall(r'\d[\d,]*\.\d+|\d[\d,]*', re.sub(r'(?<!\d)(?:19|20)\d\d(?!\d)', ' ', seg))]
                pair = (x['high'], x['low']) in zip(nums, nums[1:]) or (x['low'], x['high']) in zip(nums, nums[1:]) or (x['high'] in nums and x['low'] in nums)
                fyem = [d for d in manifest if d.get('sid') == sid and str(d.get('form', '')).startswith('10-K') and str(d.get('reportDate') or '').startswith(str(x['fy']))]
                m = int(sorted(fyem, key=lambda d: d['filingDate'])[-1]['reportDate'][5:7]) if fyem else rep.month
                end_i = x['fy'] * 12 + (m - 1) - 3 * (4 - x['q'])
                qs, qe = datetime.date((end_i - 2) // 12, (end_i - 2) % 12 + 1, 1).isoformat(), month_end(end_i // 12, end_i % 12 + 1).isoformat()
                r.update({'rawNumbersFound': pair, 'ownQuarter': [qs, qe], 'fyeMonth': m})
                okp = pair and [qs, qe] == [x['start'], x['end']]
                if okp:
                    ok, dev = band('A', qs, qe, x['filingDate'], low=x['low'], high=x['high'])
                    okp = ok == x['pass'] and abs(round(dev, 4) - x['deviation']) < 1e-4
            r['ok'] = bool(r['sha256Match'] and r['quoteFound'] and okp)
            if not r['ok']:
                problems.append('RAW %s %s #%d' % (sid, role, x['index']))
            raw.append(r)
        rec['rawBoundaryPeriods'] = raw
    per[sid] = rec

res = {'schemaVersion': 'v13b-largecap-strict-independent-check-1.1.0', 'implementation': 'python3 -I stdlib, own band tests, runs, strict clipping and raw-text parsing',
       'cases101Sha256': hashlib.sha256(cases0_bytes).hexdigest(), 'cases110Sha256': hashlib.sha256(cases1_bytes).hexdigest(),
       'amendment110Sha256': hashlib.sha256(amend_bytes).hexdigest(), 'codeSha256': hashlib.sha256(open(__file__, 'rb').read()).hexdigest(),
       'perListing': per, 'problems': problems, 'problemCount': len(problems), 'verdict': 'PASS' if not problems else 'FINDINGS'}
with open(OUT, 'w') as fh:
    json.dump(res, fh, indent=1)
    fh.write('\n')
print(json.dumps({'verdict': res['verdict'], 'problems': len(problems)}))
for p in problems[:40]:
    print(' ', p)
