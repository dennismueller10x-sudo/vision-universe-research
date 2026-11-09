#!/usr/bin/env python3
"""V12 REQUAL - independent Python check (stdlib only, run with python3 -I).

Recomputes from raw inputs, without the JS modules:
  (1) every P5a series per period and scenario (population file parsed directly, frame series from the private export,
      SPY/EFFR raw series, SPY N-30D distributions);
  (2) P6 strategy S5_LOWVOL_Q1 (scenario ZERO, base costs) with its own realised-volatility computation from the weekly
      series (V10 definition: 52 weekly log returns, >= 50 valid, sample SD x sqrt(52)) and its own ledger.
  1.1.0 (correction after the independent V12 review): population SPXPOP 1.1.1; scenarios FATE and UPPER with an own
      computation of the takeover premium (V10 lifecycle register parsed as text + weekly series, population exits);
      S5 also on the span from 2013-03-31 and against CW_ALL.
Usage: python3 -I verify_requal.py <repo> <frame-export.json.gz> <after panel.jsonl.gz> <out.json> [result version, default 1.1.0]
"""
import gzip, json, math, sys, bisect, datetime, hashlib

REPO, EXPORT, PANEL, OUT = sys.argv[1:5]
RV = sys.argv[5] if len(sys.argv) > 5 else '1.1.0'
POP_RULES = '1.1.1' if RV == '1.1.0' else '1.1.0'
SCEN = ('ZERO', 'LOWER', 'FATE', 'UPPER') if RV == '1.1.0' else ('ZERO', 'LOWER')
D = lambda s: datetime.date.fromisoformat(s)


def load(p):
    with open(p, 'rb') as f:
        b = f.read()
    return json.loads(gzip.decompress(b) if p.endswith('.gz') else b)


def last_le(dates, d, max_gap=None):
    k = bisect.bisect_right(dates, d) - 1
    if k < 0:
        return -1
    if max_gap is not None and (D(d) - D(dates[k])).days > max_gap:
        return -1
    return k


# ---------------- raw inputs
pop = load(REPO + '/docs/quant-recovery/v12/spxpop/population-%s.json.gz' % POP_RULES)
STATUS = pop['columns']['status']
FATES = pop['columns']['fate']
TAKEOVER = {'ACQUIRED_OR_MERGED', 'ACQUIRED_OR_MERGED_NO_25_15', 'IDENTITY_BREAK'}
DELIST = {'DELISTED_OTHER', 'DELISTED_BANKRUPTCY', 'BANKRUPTCY_NO_25_15'}
INDEXCH = {'STILL_REPORTING_INDEX_EXIT', 'TEMPORARY_ABSENCE'}
spy_doc = load(REPO + '/quant/data/market/multi-asset/series/SPY.json')
spy_pts = sorted([p for p in spy_doc['points'] if isinstance(p[1], (int, float))])
spy_d = [p[0] for p in spy_pts]; spy_v = [p[1] for p in spy_pts]
def spy_at(d):
    k = last_le(spy_d, d, 7)
    return None if k < 0 else spy_v[k]
effr_doc = load(REPO + '/quant/data/market/multi-asset/series/US_EFFR.json')
effr = sorted([p for p in effr_doc['points'] if isinstance(p[1], (int, float))])
fy = load(REPO + '/docs/quant-recovery/v11/decomposition/benchmark-reference-check.json')['spyDividends']['fiscalYears']
exp = load(EXPORT)
cal = exp['calendar']
lst = {}
for sid, start, dates, closes, term in exp['listings']:
    lst[sid] = (start, dates, closes, term)

periods = [p for p in pop['periods'] if p['fund'] == 'SPY' and p['t0'] >= '2009-09-30' and p['t1'] <= '2026-06-30']
periods.sort(key=lambda p: p['t0'])


def interp_q(a, q):
    x = sorted(a)
    h = (len(x) - 1) * q
    lo = int(math.floor(h))
    return x[lo] + (x[min(lo + 1, len(x) - 1)] - x[lo]) * (h - lo)


def own_premium():
    # (a) V10 lifecycle register (JS data module): the JSON after 'module.exports = '
    txt = open(REPO + '/quant/engines/research-listing-lifecycle.cjs').read()
    reg = json.loads(txt[txt.index('module.exports = ') + len('module.exports = '):].rstrip().rstrip(';'))
    cases, seen = [], set()
    for r in reg['records']:
        t = r.get('terminal') or {}
        if t.get('kind') != 'CASH_MERGER' or not (t.get('cashPerShare') or 0) > 0:
            continue
        try:
            pts = load(REPO + '/quant/data/market/discover-series-long/%s.json' % r['securityId'])['points']
        except FileNotFoundError:
            continue
        y, m = int(r['lastTradeDate'][:4]), int(r['lastTradeDate'][5:7])
        qm = (m - 1) // 3 * 3
        q0 = '%d-12-31' % (y - 1) if qm == 0 else '%d-%02d-%s' % (y, qm, '31' if qm == 3 else '30')
        k = last_le([x[0] for x in pts], q0, 7)
        if k < 0:
            continue
        cases.append((r['securityId'], q0, t['cashPerShare'] / pts[k][1] - 1)); seen.add((r['securityId'], q0))
    # (b) population exits with an acquired fate and an estimated/observed return
    for fund in ('SPY', 'QQQ'):
        for pp in pop['periods']:
            if pp['fund'] != fund or not (pp['t0'] >= '2009-09-30' and pp['t1'] <= '2026-06-30') or not pp.get('cols'):
                continue
            c = pp['cols']
            for i in range(len(c['chain'])):
                st = STATUS[c['status'][i]]; fate = FATES[c['fate'][i]] or ''
                if fate.startswith('ACQUIRED') and st in ('EST_CASH', 'EST_SERIES_END', 'OBS_SERIES'):
                    sid = None if c['sid'][i] is None else pop['securityIds'][c['sid'][i]]
                    key = (sid or pop['chains'][c['chain'][i]][2], pp['t0'])
                    if key in seen:
                        continue
                    seen.add(key); cases.append((key[0], pp['t0'], c['ret'][i] / 1e6))
    rs = [x[2] for x in cases]
    return {'n': len(rs), 'median': interp_q(rs, 0.5), 'p75': interp_q(rs, 0.75)}


PREM = own_premium() if RV == '1.1.0' else None


def members(p):
    c = p['cols']
    bnd = {b[0]: b for b in c['bnd']}
    out = []
    obs = [c['ret'][i] / 1e6 for i in range(len(c['chain'])) if not STATUS[c['status'][i]].startswith('BOUNDED')]
    pop_ret = sum(obs) / len(obs)
    for i in range(len(c['chain'])):
        st = STATUS[c['status'][i]]
        ret = None if c['ret'][i] is None else c['ret'][i] / 1e6
        b = bnd.get(i)
        lo = (None if b[1] is None else b[1] / 1e6) if b else ret
        hi = (None if b[2] is None else b[2] / 1e6) if b else ret
        bounded = st.startswith('BOUNDED')
        fate = FATES[c['fate'][i]] or ''
        if not bounded:
            z = l = f = u = ret
        elif st == 'BOUNDED_AMBIGUOUS_CA':
            z, l = (lo + hi) / 2, lo
            f, u = z, hi
        elif st == 'BOUNDED_EXIT_SERIES_DELISTED':
            z, l = (0.0 if ret is None else ret), lo
            f, u = (-1.0 if fate in DELIST else ret), hi
        else:
            z, l = (0.0 if ret is None else ret), lo
            if PREM:
                f = PREM['median'] if fate in TAKEOVER else -1.0 if fate in DELIST else pop_ret if fate in INDEXCH else 0.0
                u = max(PREM['p75'], pop_ret)
            else:
                f = u = None
        sid = None if c['sid'][i] is None else pop['securityIds'][c['sid'][i]]
        out.append({'chain': c['chain'][i], 'w': c['w'][i] / 1e8, 'sid': sid, 'bounded': bounded, 'ZERO': z, 'LOWER': l, 'FATE': f, 'UPPER': u})
    return out


def series_ret(sid, t0, t1):
    start, dates, closes, term = lst[sid]
    k0 = last_le(dates, t0, 7)
    if k0 < 0 or dates[k0] < start:
        return None
    k1 = last_le(dates, t1, 7)
    if k1 >= 0 and k1 >= k0:
        return ('SERIES', closes[k1] / closes[k0] - 1)
    if dates[-1] >= t1:
        return None
    if term and term.get('kind') == 'CASH_MERGER' and term.get('cashPerShare'):
        return ('TERMINAL_CASH', term['cashPerShare'] / closes[k0] - 1)
    return ('LAST_CLOSE', closes[-1] / closes[k0] - 1)


def spy_tr(t0, t1):
    g = 1.0; a = t0
    y, m = int(t0[:4]), int(t0[5:7])
    qe = {3: '-03-31', 6: '-06-30', 9: '-09-30', 12: '-12-31'}
    while True:
        m += 3
        if m > 12:
            m -= 12; y += 1
        b = '%d%s' % (y, qe[m])
        if b > t1:
            break
        fyk = '%d-09-30' % (y + 1 if m >= 10 else y)
        dps = fy.get(fyk, {}).get('distributionsPerUnit')
        if dps is None:
            dps = fy[sorted(k for k in fy if k < fyk)[-1]]['distributionsPerUnit']
        pa = spy_at(a)
        g *= 1 + spy_at(b) / pa - 1 + dps / 4 / pa
        a = b
        if b == t1:
            break
    return g - 1


# weekly rebalanced EW frame index on the calendar
ci = {d: i for i, d in enumerate(cal)}
S = [0.0] * len(cal); N = [0] * len(cal)
for sid, (start, dates, closes, term) in lst.items():
    for k in range(1, len(dates)):
        c, cp = ci.get(dates[k]), ci.get(dates[k - 1])
        if c is None or cp is None or c != cp + 1 or dates[k - 1] < start:
            continue
        S[c] += closes[k] / closes[k - 1] - 1; N[c] += 1
I = [1.0] * len(cal)
for c in range(1, len(cal)):
    I[c] = I[c - 1] * (1 + (S[c] / N[c] if N[c] else 0.0))


def mean(a):
    return sum(a) / len(a) if a else None


py = []
for p in periods:
    t0, t1 = p['t0'], p['t1']
    mem = members(p)
    w0, w1 = last_le(cal, t0, 7), last_le(cal, t1, 7)
    withs, without = [], []
    for m in mem:
        sr = series_ret(m['sid'], t0, t1) if m['sid'] in lst else None
        if sr and m['sid'] in lst:
            start, dates, closes, term = lst[m['sid']]
            k0 = last_le(dates, t0, 7)
            if k0 < 0 or dates[k0] < start:
                sr = None
        (withs if sr else without).append((m, sr))
    frame = []
    for sid, (start, dates, closes, term) in lst.items():
        k0 = last_le(dates, t0, 7)
        if k0 < 0 or dates[k0] < start:
            continue
        sr = series_ret(sid, t0, t1)
        if sr:
            frame.append(sr)
    row = {'t0': t0, 't1': t1, 'counts': {'members': len(mem), 'withSeries': len(withs), 'frame': len(frame)}, 'series': {}}
    for sc in SCEN:
        low = lambda sr: -1.0 if (sc == 'LOWER' and sr[0] == 'LAST_CLOSE') else sr[1]
        row['series'][sc] = {
            'SPY': spy_at(t1) / spy_at(t0) - 1, 'SPY_TR': spy_tr(t0, t1), 'SPY_W': spy_at(cal[w1]) / spy_at(cal[w0]) - 1,
            'EW_ALL': mean([m[sc] for m in mem]), 'CW_ALL': sum(m['w'] * m[sc] for m in mem) / sum(m['w'] for m in mem),
            'EW_WITH_H': mean([m[sc] for m, _ in withs]), 'EW_WITHOUT_H': mean([m[sc] for m, _ in without]),
            'EW_WITH_S': mean([low(sr) for _, sr in withs]), 'EW_FRAME': mean([low(sr) for sr in frame]), 'EW_FRAME_WREB': I[w1] / I[w0] - 1}
    py.append(row)

js = load(REPO + '/docs/quant-recovery/v12/requal/p5a-population-%s.json' % RV)
cmp = {}
for sc in SCEN:
    for key in js['periods'][0]['series'][sc]:
        diffs = [abs(a['series'][sc][key] - b['series'][sc][key]) for a, b in zip(py, js['periods']) if a['series'][sc][key] is not None and b['series'][sc][key] is not None]
        cmp[sc + ':' + key] = {'n': len(diffs), 'maxAbsDiff': max(diffs) if diffs else None}
count_mismatch = [a['t0'] for a, b in zip(py, js['periods']) if a['counts']['withSeries'] != b['counts']['withSeries'] or a['counts']['frame'] != b['counts']['frameListings']]

# ---------------- P6 S5_LOWVOL_Q1 (ZERO, base costs) with own volatility
rank_dates = None; panel_ids = {}
with gzip.open(PANEL, 'rt') as f:
    for i, line in enumerate(f):
        x = json.loads(line)
        if i == 0:
            rank_dates = x['rankDates']; continue
        if 'date' in x:
            panel_ids[x['date']] = set(r[0] for r in x['rows'])


def rank_for(t0):
    k = bisect.bisect_right(rank_dates, t0) - 1
    if k < 0 or (D(t0) - D(rank_dates[k])).days > 35:
        return None
    return rank_dates[k]


def vol(sid, r):
    if sid not in lst:
        return None
    start, dates, closes, term = lst[sid]
    k = bisect.bisect_left(dates, r)
    if k >= len(dates) or dates[k] != r or k + 1 < 53:
        return None
    lr = [math.log(closes[j] / closes[j - 1]) for j in range(k - 51, k + 1) if closes[j] > 0 and closes[j - 1] > 0]
    if len(lr) < 50:
        return None
    m = sum(lr) / len(lr)
    return math.sqrt(sum((v - m) ** 2 for v in lr) / (len(lr) - 1)) * math.sqrt(52)


def run_s5(sp):
  held = {}  # chain -> weight (fraction of portfolio) after drift
  first = True; wealth = 1.0; s5 = []
  for idx, p in enumerate(sp):
      mem = members(p); r = rank_for(p['t0']); ids = panel_ids[r]
      seen = set(); cand = []
      for m in mem:
          if not m['sid'] or m['sid'] in seen or m['sid'] not in ids:
              continue
          seen.add(m['sid'])
          v = vol(m['sid'], r)
          if v is not None:
              cand.append((v, m['sid'], m['chain']))
      cand.sort()
      pick = cand[:math.ceil(len(cand) / 5)]
      tgt = {c: 1.0 / len(pick) for _, _, c in pick}
      traded = sum(abs(tgt.get(c, 0) - (0 if first else held.get(c, 0))) for c in set(tgt) | set(held))
      byc = {m['chain']: m for m in mem}
      gross = sum(w * byc[c]['ZERO'] for c, w in tgt.items())
      ret = (1 - traded * 15e-4) * (1 + gross) - 1
      nxt = set(m['chain'] for m in members(periods[periods.index(p) + 1])) if periods.index(p) + 1 < len(periods) else set()
      held = {c: w * (1 + byc[c]['ZERO']) / (1 + gross) for c, w in tgt.items() if c in nxt}
      first = False; wealth *= 1 + ret
      s5.append({'t0': p['t0'], 'r': ret, 'traded': traded, 'picked': [s for _, s, _ in pick]})
  yrs = (D(sp[-1]['t1']) - D(sp[0]['t0'])).days / 365.25
  return s5, wealth ** (1 / yrs) - 1, yrs


sp = [p for p in periods if rank_for(p['t0'])]
s5, cagr, yrs = run_s5(sp)
p6 = load(REPO + '/docs/quant-recovery/v12/requal/p6-strategies-%s.json' % RV)
jsS5 = p6['results']['registeredSpan']['scenarios']['ZERO']['BASE']['strategies']['S5_LOWVOL_Q1']
dr = [abs(a['r'] - b['r']) for a, b in zip(s5, jsS5['periods'])]
extra = {}
if RV == '1.1.0':
    sp13 = [p for p in sp if p['t0'] >= '2013-03-31']
    s5b, cagr13, _ = run_s5(sp13)
    js13 = p6['results']['span2013_rule101']['scenarios']['ZERO']['BASE']['strategies']['S5_LOWVOL_Q1']
    cw = {r['t0']: r['series']['ZERO']['CW_ALL'] for r in py}
    g = 1.0
    for x in s5:
        g *= 1 + cw[x['t0']]
    cw_cagr = g ** (1 / yrs) - 1
    jsP = js['takeoverPremium']
    extra = {'takeoverPremium': {'python': PREM, 'js': {'n': jsP['n'], 'median': jsP['median'], 'p75': jsP['p75']},
                                 'maxAbsDiff': max(abs(PREM['median'] - jsP['median']), abs(PREM['p75'] - jsP['p75'])), 'nEqual': PREM['n'] == jsP['n']},
             'P6_S5_LOWVOL_Q1_ZERO_BASE_span2013': {'periods': len(s5b), 'pythonCagr': cagr13, 'jsCagr': js13['performance']['cagr'], 'cagrDiff': cagr13 - js13['performance']['cagr']},
             'P6_S5_vs_CW_ALL_ZERO_BASE': {'pythonCagrDiff': cagr - cw_cagr, 'jsCagrDiff': jsS5['vsCwAll']['cagrDiff']}}
res = {'schemaVersion': 'v12-requal-python-check-%s' % RV, **extra, 'python': sys.version.split()[0], 'evidenceKind': 'TECHNICAL_PARITY', 'note': 'second language, not a holdout',
       'inputs': {'frameExportSha256': hashlib.sha256(open(EXPORT, 'rb').read()).hexdigest(), 'panelSha256': hashlib.sha256(open(PANEL, 'rb').read()).hexdigest()},
       'P5a': {'periods': len(py), 'seriesComparison': cmp, 'withSeriesOrFrameCountMismatchPeriods': count_mismatch,
               'maxAbsDiffAll': max(v['maxAbsDiff'] for v in cmp.values() if v['maxAbsDiff'] is not None)},
       'P6_S5_LOWVOL_Q1_ZERO_BASE': {'periods': len(s5), 'pythonCagr': cagr, 'jsCagr': jsS5['performance']['cagr'], 'cagrDiff': cagr - jsS5['performance']['cagr'],
                                     'maxAbsPeriodReturnDiff': max(dr), 'medianAbsPeriodReturnDiff': sorted(dr)[len(dr) // 2],
                                     'pythonTurnoverOneSidedPerYear': sum(x['traded'] for x in s5) / 2 / yrs, 'jsTurnoverOneSidedPerYear': jsS5['turnoverOneSidedPerYear'],
                                     'pickCountsPython': [len(x['picked']) for x in s5], 'pickCountsJs': [x['picked'] for x in jsS5['periods']]}}
with open(OUT, 'w') as f:
    json.dump(res, f, indent=1)
print(json.dumps({'P5a_maxAbsDiff': res['P5a']['maxAbsDiffAll'], 'countMismatch': len(count_mismatch), 'S5_cagr_py': round(cagr, 6), 'S5_cagr_js': jsS5['performance']['cagr'], 'S5_maxPeriodDiff': max(dr)}))
