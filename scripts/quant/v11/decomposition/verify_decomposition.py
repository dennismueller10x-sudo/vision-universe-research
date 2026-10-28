#!/usr/bin/env python3
"""V11 DECOMPOSITION A5: independent Python reference computation (stdlib only; run with python3 -I).

Re-derives from the raw weekly series files (quant/data/market/discover-series-long) and the raw SPY daily
file, with its own implementation (not a port of the JS code):
  - series restriction to the loader bounds of the committed V10 lifecycle source manifest (loader qualification
    and bounds are inputs; file SHA-256 and point counts are checked), modal weekly calendar (checked against
    the manifest calendar hash length), the frame list (input);
  - the five signal rules with warm-up 53 and cooldown 13, signal eligibility (no calendar gap in the previous
    66 bars, date >= listingStart);
  - event outcomes, SPY price return over identical dates, the equal-weighted population mean of the same
    signal week (all eligible complete observations), net of 10+5 bps per side, and the A1 terms
    (SPY, P-S, g-P, cost, SPY excess) for h 13 and 52, plus entry delays 0/1/2/4 at h 13;
  - the funded NEW_52W_HIGH strategy (N 10, 13 weeks, hash tie-break, equal 1/N, cash without interest,
    costs on traded notional) with its own ledger (fixed-point post-cost equity instead of bisection), and the
    checks that strategy and SPY use identical session dates and the same price-return definition.
Compares with the JS result files and writes a parity report.
Usage: verify_decomposition.py <repo-root> <events-result.json> <portfolio-result.json> <out.json>
"""
import collections, datetime, gzip, hashlib, json, math, os, sys, time

ROOT, JS_EVENTS, JS_PORT, OUT = sys.argv[1:5]
MANIFEST = 'docs/quant-recovery/v10/studies/source-manifest-ca-id-lifecycle-1.0.0.json.gz'
WARM, COOL, LOOK = 53, 13, 66
FEE, SLIP = 10, 5
RULES = ['MOMENTUM_IMPROVED', 'MOMENTUM_DETERIORATED', 'TREND_UP', 'TREND_DOWN', 'NEW_52W_HIGH']


def monday(d):
    t = datetime.date.fromisoformat(d)
    return (t - datetime.timedelta(days=t.weekday())).isoformat()


def net(g):
    s = (FEE + SLIP) / 1e4
    return (1 + g) * (1 - s) / (1 + s) - 1


# ---------- rules (own implementation of the documented definitions) ----------
def ret_n(c, i, w):
    j = i - w
    return None if j < 0 or c[i] <= 0 or c[j] <= 0 else c[i] / c[j] - 1


def sma(c, i, w):
    if i - w + 1 < 0:
        return None
    return sum(c[i - w + 1:i + 1]) / w


def pmax(c, i, w):
    if i - w < 0:
        return None
    seg = [x for x in c[i - w:i] if x > 0]
    return max(seg) if len(seg) >= w * 0.8 else None


def detect(rule, c, i):
    if rule in ('MOMENTUM_IMPROVED', 'MOMENTUM_DETERIORATED'):
        a, b = ret_n(c, i, 26), ret_n(c, i - 1, 26)
        if a is None or b is None:
            return False
        return (a >= 0 and b < 0) if rule == 'MOMENTUM_IMPROVED' else (a < 0 and b >= 0)
    if rule in ('TREND_UP', 'TREND_DOWN'):
        s, t = sma(c, i, 40), sma(c, i - 1, 40)
        if s is None or t is None:
            return False
        return (c[i] >= s and c[i - 1] < t) if rule == 'TREND_UP' else (c[i] < s and c[i - 1] >= t)
    m, mp = pmax(c, i, 52), pmax(c, i - 1, 52)
    return m is not None and mp is not None and c[i] > 0 and c[i - 1] > 0 and c[i] > m and not (c[i - 1] > mp)


def events_of(rule, c):
    out, last = [], -10 ** 9
    for i in range(WARM, len(c)):
        if detect(rule, c, i):
            if i - last >= COOL:
                out.append(i)
            last = i
    return out


def main():
    t0 = time.time()
    man = json.loads(gzip.open(os.path.join(ROOT, MANIFEST)).read())
    cols = man['columns']
    q = {r[0]: dict(zip(cols, r)) for r in man['qualified']}
    checks = collections.Counter()
    series = {}
    labels = collections.defaultdict(collections.Counter)
    for sid, r in q.items():
        b = open(os.path.join(ROOT, 'quant/data/market/discover-series-long', sid + '.json'), 'rb').read()
        checks['fileSha'] += hashlib.sha256(b).hexdigest() == r['fileSha256']
        pts = [p for p in json.loads(b)['points'] if r['firstDate'] <= p[0] <= r['lastDate']]
        checks['pointCount'] += len(pts) == r['points']
        for p in pts:
            labels[monday(p[0])][p[0]] += 1
        series[sid] = (pts, r)
    modal = {w: max(cnt.items(), key=lambda x: (x[1], x[0]))[0] for w, cnt in labels.items()}
    cal = sorted(modal.values())
    checks['calendarLength'] = int(len(cal) == man['calendarLength'])
    ci = {d: i for i, d in enumerate(cal)}
    frame = man['frame']
    spy = {p[0]: float(p[1]) for p in json.load(open(os.path.join(ROOT, 'quant/data/market/multi-asset/series/SPY.json')))['points']}
    spy_ret = lambda a, z: spy[z] / spy[a] - 1 if a in spy and z in spy else None
    P = []
    for sid in frame:
        pts, r = series[sid]
        d = [p[0] for p in pts]
        c = [float(p[1]) for p in pts]
        k_cal = [ci[x] for x in d]
        brk = [0] * (len(d) + 1)
        for k in range(len(d)):
            brk[k + 1] = brk[k] + (1 if k > 0 and k_cal[k] != k_cal[k - 1] + 1 else 0)
        elig = [k >= WARM and d[k] >= r['listingStart'] and brk[k + 1] - brk[max(0, k - LOOK)] == 0 for k in range(len(d))]
        P.append(dict(id=sid, d=d, c=c, cal=k_cal, elig=elig, start=r['listingStart'], lid=r['listingId'], brk=brk))
    print('loaded', len(P), round(time.time() - t0, 1), file=sys.stderr)

    def win(p, k, a, L):
        s, e = k + a, k + a + L
        lo = min(k, s)
        if lo < 0 or e >= len(p['c']) or p['cal'][e] - p['cal'][lo] != e - lo:
            return None
        return p['c'][e] / p['c'][s] - 1

    def popmean(a, L):
        sm, n = collections.defaultdict(float), collections.Counter()
        for p in P:
            for k in range(WARM, len(p['c'])):
                if p['elig'][k]:
                    g = win(p, k, a, L)
                    if g is not None:
                        sm[p['cal'][k]] += g; n[p['cal'][k]] += 1
        return {c: sm[c] / n[c] for c in n}

    evs = {rule: [] for rule in RULES}
    for p in P:
        for rule in RULES:
            for k in events_of(rule, p['c']):
                if '2000-01-01' <= p['d'][k] <= '2025-12-31':
                    evs[rule].append((p, k))
    js = json.load(open(JS_EVENTS))
    res = {'A1': [], 'entryDelay': []}
    maxdiff = 0.0
    for h in (13, 52):
        pm = popmean(1, h)
        for rule in RULES:
            rows = []
            for p, k in evs[rule]:
                if not p['elig'][k]:
                    continue
                g = win(p, k, 1, h)
                if g is None:
                    continue
                s = spy_ret(p['d'][k + 1], p['d'][k + 1 + h])
                if s is None:
                    continue
                rows.append((g, s, pm[p['cal'][k]]))
            n = len(rows)
            m = lambda f: sum(f(x) for x in rows) / n
            py = {'n': n, 'rawNet': m(lambda x: net(x[0])), 'spy': m(lambda x: x[1]), 'populationMinusSpy': m(lambda x: x[2] - x[1]), 'signalMinusPopulation': m(lambda x: x[0] - x[2]),
                  'cost': m(lambda x: x[0] - net(x[0])), 'spyExcessNet': m(lambda x: net(x[0]) - x[1])}
            jc = next(c for c in js['A1']['cells'] if c['rule'] == rule and c['horizonWeeks'] == h)
            diffs = {k: abs(py[k] - jc['terms'][k]) for k in ('rawNet', 'spy', 'populationMinusSpy', 'signalMinusPopulation', 'cost', 'spyExcessNet')}
            maxdiff = max(maxdiff, *diffs.values())
            res['A1'].append({'rule': rule, 'horizonWeeks': h, 'python': py, 'nEqual': n == jc['n'], 'maxAbsDiff': max(diffs.values())})
        print('A1', h, round(time.time() - t0, 1), file=sys.stderr)
    for dly in (0, 1, 2, 4):
        pm = popmean(dly, 13)
        for rule in RULES:
            rows = []
            for p, k in evs[rule]:
                if not p['elig'][k]:
                    continue
                g = win(p, k, dly, 13)
                if g is None:
                    continue
                s = spy_ret(p['d'][k + dly], p['d'][k + dly + 13])
                if s is None:
                    continue
                rows.append((g, s, pm[p['cal'][k]]))
            n = len(rows)
            sp = sum(net(g) - s for g, s, _ in rows) / n
            po = sum(g - pp for g, _, pp in rows) / n
            jc = next(c for c in js['A2']['entryDelay'] if c['rule'] == rule and c['delayWeeks'] == dly)
            dd = max(abs(sp - jc['spyExcessNet']['estimate']), abs(po - jc['populationExcessGross']['estimate']))
            maxdiff = max(maxdiff, dd)
            res['entryDelay'].append({'rule': rule, 'delayWeeks': dly, 'n': n, 'nEqual': n == jc['n'], 'spyExcessNet': sp, 'populationExcessGross': po, 'maxAbsDiff': dd})
    print('delays', round(time.time() - t0, 1), file=sys.stderr)

    # ---------- funded NEW_52W_HIGH, HASH tie-break, N 10, 13 weeks, equal 1/N ----------
    H, N, rate = 13, 10, (FEE + SLIP) / 1e4
    study = [d for d in cal if '2000-01-01' <= d <= '2025-12-31']
    j0, j1 = ci[study[0]], ci[study[-1]]
    last = j1 + 1 + H
    uni = [p for p in P if p['brk'][len(p['d'])] == 0 and p['cal'][-1] >= last]
    sig = collections.defaultdict(list)
    for p in uni:
        for k in events_of('NEW_52W_HIGH', p['c']):
            j = p['cal'][k]
            if j0 <= j <= j1 and p['d'][k] >= p['start']:
                sig[j].append(p)
    px = lambda p, j: p['c'][j - p['cal'][0]]
    held, cash, units, eq, inv_share, sessions = {}, 1.0, {}, [], [], []
    targets = {}
    for j in range(j0, last):
        ex = j + 1
        changed = False
        for sid in [s for s, e in held.items() if e + H == ex]:
            del held[sid]; changed = True
        if j <= j1:
            cands = sorted((hashlib.sha256(('V10-STUDIES-FUNDED-1.0.0|' + p['id'] + '|' + cal[j]).encode()).hexdigest(), p['id'], p) for p in sig.get(j, []) if p['id'] not in held)
            for _, sid, p in cands[:max(0, N - len(held))]:
                held[sid] = ex; changed = True
        if changed:
            targets[ex] = {sid: 1.0 / N for sid in held}
    byid = {p['id']: p for p in uni}
    for s in range(j0, last + 1):
        mk = {sid: u * px(byid[sid], s) for sid, u in units.items()}
        before = cash + sum(mk.values())
        if s in targets:
            w = targets[s]
            keys = set(mk) | set(w)
            after = before
            for _ in range(200):
                nxt = before - rate * sum(abs(w.get(k, 0) * after - mk.get(k, 0)) for k in keys)
                if abs(nxt - after) < 1e-15:
                    break
                after = nxt
            for k in keys:
                delta = w.get(k, 0) * after - mk.get(k, 0)
                cash -= delta + abs(delta) * rate
                if w.get(k, 0) > 0:
                    units[k] = units.get(k, 0) + delta / px(byid[k], s)
                else:
                    units.pop(k, None)
        val = cash + sum(u * px(byid[sid], s) for sid, u in units.items())
        eq.append(val); sessions.append(cal[s]); inv_share.append((val - cash) / val)
    yrs = (datetime.date.fromisoformat(sessions[-1]) - datetime.date.fromisoformat(sessions[0])).days / 365.25
    cagr = eq[-1] ** (1 / yrs) - 1
    spy_cagr = (spy[sessions[-1]] / spy[sessions[0]]) ** (1 / yrs) - 1
    port = json.load(open(JS_PORT))
    jr = next(r for r in port['results'] if r['rule'] == 'NEW_52W_HIGH' and r['N'] == 10 and r['weighting'] == 'EQUAL' and r['tie'] == 'HASH_V10' and r['group'] == 'EQUAL_N10')
    res['funded'] = {'rule': 'NEW_52W_HIGH', 'N': N, 'sessions': len(sessions), 'from': sessions[0], 'to': sessions[-1], 'cagr': cagr, 'spyCagr': spy_cagr, 'jsCagr': jr['cagr'], 'jsSpyCagr': jr['spyCagr'],
                     'cagrAbsDiff': abs(cagr - jr['cagr']), 'spyCagrAbsDiff': abs(spy_cagr - jr['spyCagr']), 'meanInvestedShare': sum(inv_share) / len(inv_share), 'jsMeanInvestedShare': jr['averageInvestedShare'],
                     'sessionDatesAllOnSpy': all(d in spy for d in sessions), 'sessionCountEqualJs': len(sessions) == jr['sessions'], 'firstLastEqualJs': sessions[0] == jr['from'] and sessions[-1] == jr['to']}
    res['definitions'] = {
        'strategyReturn': 'PRICE_RETURN: split-adjusted weekly closes of the provider series; no dividends; costs 10+5 bps per side on traded notional; uninvested weight in cash at 0 % interest',
        'spyReturn': 'PRICE_RETURN: SPY split-adjusted daily close (Tiingo) at exactly the strategy session dates; no dividends; no costs; fully invested from the first session',
        'eventSpy': 'SPY price return from the entry close date to the exit close date of each event (identical dates)',
        'populationBenchmark': 'equal-weighted mean of the same-window price returns of all eligible frame listings of the signal week (no costs)'}
    res['inputChecks'] = {'qualified': len(q), 'fileShaOk': checks['fileSha'], 'pointCountOk': checks['pointCount'], 'calendarLengthOk': bool(checks['calendarLength']), 'frame': len(frame)}
    res['parity'] = {'maxAbsDiffEventTerms': maxdiff, 'allEventCountsEqual': all(x['nEqual'] for x in res['A1'] + res['entryDelay']), 'tolerance': 1e-9,
                     'pass': maxdiff < 1e-9 and all(x['nEqual'] for x in res['A1'] + res['entryDelay']) and res['funded']['cagrAbsDiff'] < 1e-9 and res['funded']['spyCagrAbsDiff'] < 1e-12}
    res['seconds'] = round(time.time() - t0, 1)
    json.dump(res, open(OUT, 'w'), indent=1)
    print(json.dumps(res['parity']), json.dumps({k: v for k, v in res['funded'].items()}))


if __name__ == '__main__':
    main()
