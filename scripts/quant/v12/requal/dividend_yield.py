#!/usr/bin/env python3
"""V12 REQUAL 1.1.0: order of magnitude of the missing member dividends (correction after the independent V12 review, REQUAL MAJOR 3/4).

Stdlib only, run with python3 -I. For every P6 rebalancing date t0 (registered span, scenario ZERO, base costs) and every portfolio
(S1-S6 targets and the holdings-weighted population CW_ALL, exported privately by p6-strategies.cjs --export-holdings):
  dividend yield = sum_i w_i * DPS_i / P_i / sum_i w_i
  DPS_i: trailing annual dividends per share from SEC companyfacts (us-gaap CommonStockDividendsPerShareDeclared, else
         CommonStockDividendsPerShareCashPaid; unit USD/shares), only facts FILED on or before t0: the latest fiscal-year fact
         (duration 330-380 days, end >= t0 - 15 months), else the sum of the four latest quarterly facts (80-100 days, distinct
         ends within 12.5 months, latest end >= t0 - 6 months); a CIK without any such fact before t0 counts as non-payer (0).
  P_i: raw close at t0 = split-adjusted weekly close (last bar <= t0, <= 7 days) x product of the provider split factors dated after t0.
  Yields above 15 % are dropped (basis mismatch after a split between filing and t0) and counted.
Validation: CW_ALL yield against the SPY N-30D distribution yield of the same periods (p5a counts.spyTrDividendYield, annualised).
This is an order-of-magnitude estimate, not a total-return series (no ex-dates, no reinvestment timing).
Usage: python3 -I dividend_yield.py <repo> <holdings-export.json> <companyfacts.zip> <out.json>
"""
import bisect
import hashlib
import json
import statistics
import sys
import zipfile
from datetime import date, timedelta
from pathlib import Path

REPO, EXPORT, ZIP, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4])
CONCEPTS = ('CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid')
MAX_YIELD = 0.15
D = date.fromisoformat


def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def dps_facts(z, names, cik):
    n = 'CIK%010d.json' % int(cik)
    if n not in names:
        return None
    j = json.loads(z.read(n))
    out = []
    for c in CONCEPTS:
        u = j.get('facts', {}).get('us-gaap', {}).get(c, {}).get('units', {})
        for unit, lst in u.items():
            if unit != 'USD/shares':
                continue
            for f in lst:
                if f.get('start') and f.get('end') and f.get('filed') and isinstance(f.get('val'), (int, float)) and f['val'] >= 0:
                    out.append((c, f['start'], f['end'], f['filed'], float(f['val'])))
    return out


def ttm_dps(facts, t0):
    t = D(t0)
    for c in CONCEPTS:
        fs = [f for f in facts if f[0] == c and f[3] <= t0]
        if not fs:
            continue
        ann = [f for f in fs if 330 <= (D(f[2]) - D(f[1])).days <= 380 and D(f[2]) >= t - timedelta(days=457)]
        if ann:
            return max(ann, key=lambda f: (f[2], f[3]))[4], 'ANNUAL'
        q = {}
        for f in fs:
            if 80 <= (D(f[2]) - D(f[1])).days <= 100:
                if f[2] not in q or f[3] > q[f[2]][3]:
                    q[f[2]] = f
        ends = sorted(q)[-4:]
        if len(ends) == 4 and D(ends[-1]) >= t - timedelta(days=183) and (D(ends[-1]) - D(ends[0])).days <= 380:
            return sum(q[e][4] for e in ends), 'QUARTERLY_SUM'
        return 0.0, 'STALE_OR_INCOMPLETE'
    return 0.0, 'NO_FACT_NON_PAYER'


series_cache = {}


def raw_close(sid, t0):
    if sid not in series_cache:
        p = REPO / 'quant/data/market/discover-series-long' / (sid + '.json')
        if not p.exists():
            series_cache[sid] = None
        else:
            d = json.loads(p.read_text())
            pts = [x for x in d['points'] if x[1] and x[1] > 0]
            sp = [(s[0], s[1]) for s in ((d.get('corporateActions') or {}).get('splits') or []) if s[1] and s[1] > 0 and s[1] != 1]
            series_cache[sid] = ([x[0] for x in pts], [x[1] for x in pts], sp)
    s = series_cache[sid]
    if not s:
        return None
    i = bisect.bisect_right(s[0], t0) - 1
    if i < 0 or (D(t0) - D(s[0][i])).days > 7:
        return None
    m = 1.0
    for sd, f in s[2]:
        if sd > t0:
            m *= f
    return s[1][i] * m


def main():
    exp = json.loads(EXPORT.read_text())
    p5a = json.loads((REPO / 'docs/quant-recovery/v12/requal/p5a-population-1.1.0.json').read_text())
    spy_dy = {r['t0']: (r['counts']['spyTrDividendYield'], r['months']) for r in p5a['periods']}
    z = zipfile.ZipFile(ZIP)
    names = set(z.namelist())
    ciks = sorted({h[0] for p in exp['periods'] for h in p['CW_ALL'] if h[0]})
    facts = {}
    for c in ciks:
        facts[c] = dps_facts(z, names, c)
    ports = ['CW_ALL'] + sorted(exp['periods'][0]['strategies'])
    res = {k: [] for k in ports}
    states = {}
    dropped = 0
    for p in exp['periods']:
        t0 = p['t0']
        memo = {}

        def y_of(cik, sid):
            nonlocal dropped
            key = (cik, sid)
            if key in memo:
                return memo[key]
            v = None
            if cik and facts.get(cik) is not None and sid:
                dps, st = ttm_dps(facts[cik], t0)
                states[st] = states.get(st, 0) + 1
                px = raw_close(sid, t0)
                if px:
                    v = dps / px
                    if v > MAX_YIELD:
                        dropped += 1
                        v = None
            memo[key] = v
            return v
        for k in ports:
            hold = p['CW_ALL'] if k == 'CW_ALL' else p['strategies'][k]
            tw = sum(h[2] for h in hold)
            cov = [(h[2], y_of(h[0], h[1])) for h in hold]
            cw = sum(w for w, y in cov if y is not None)
            yv = sum(w * y for w, y in cov if y is not None) / cw if cw > 0 else None
            res[k].append({'t0': t0, 'equityWeight': round(tw, 6), 'coveredShareOfEquity': round(cw / tw, 4) if tw > 0 else None, 'yield': round(yv, 6) if yv is not None else None})
    spy_ann = []
    for p in exp['periods']:
        dy, mo = spy_dy.get(p['t0'], (None, None))
        spy_ann.append(dy * 12 / mo if dy is not None and mo else None)
    summary = {}
    for k in ports:
        ys = [r['yield'] for r in res[k] if r['yield'] is not None]
        eq = [r['equityWeight'] for r in res[k]]
        # portfolio-level dividend contribution per year = equity weight x member yield (cash part earns no dividend)
        contrib = [r['equityWeight'] * r['yield'] for r in res[k] if r['yield'] is not None]
        summary[k] = {'meanMemberYieldPct': round(100 * statistics.mean(ys), 3) if ys else None, 'meanEquityWeight': round(statistics.mean(eq), 4),
                      'meanPortfolioDividendPctPerYear': round(100 * statistics.mean(contrib), 3) if contrib else None,
                      'meanCoveredShareOfEquity': round(statistics.mean([r['coveredShareOfEquity'] for r in res[k] if r['coveredShareOfEquity'] is not None]), 4)}
    base = summary['CW_ALL']['meanPortfolioDividendPctPerYear']
    for k in ports:
        summary[k]['minusCwAllPp'] = round(summary[k]['meanPortfolioDividendPctPerYear'] - base, 3) if summary[k]['meanPortfolioDividendPctPerYear'] is not None else None
    spy_mean = round(100 * statistics.mean([x for x in spy_ann if x is not None]), 3)
    for k in ports:
        summary[k]['minusSpyN30dPp'] = round(summary[k]['meanPortfolioDividendPctPerYear'] - spy_mean, 3) if summary[k]['meanPortfolioDividendPctPerYear'] is not None else None
    cw = [r['yield'] for r in res['CW_ALL']]
    pairs = [(a, b) for a, b in zip(cw, spy_ann) if a is not None and b is not None]
    out = {'schemaVersion': 'v12-requal-dividends-1.1.0', 'evidenceKind': 'RECONSTRUCTION', 'certificationStatus': 'NOT_CERTIFIED', 'productionApproved': False,
           'method': __doc__.split('Usage:')[0].strip(), 'inputs': {'companyfactsZipSha256': sha(ZIP), 'holdingsExportSha256': sha(EXPORT), 'p5aSha256': sha(REPO / 'docs/quant-recovery/v12/requal/p5a-population-1.1.0.json')},
           'validationCwAllVsSpyN30D': {'periods': len(pairs), 'meanCwAllYieldPct': round(100 * statistics.mean(a for a, _ in pairs), 3), 'meanSpyN30dYieldPct': round(100 * statistics.mean(b for _, b in pairs), 3),
                                        'medianAbsDiffPp': round(100 * statistics.median(abs(a - b) for a, b in pairs), 3)},
           'spyN30dMeanYieldPct': spy_mean, 'summary': summary, 'dpsStates': states, 'droppedAboveMaxYield': dropped, 'ciks': len(ciks), 'ciksWithoutCompanyfacts': sum(1 for c in ciks if facts[c] is None),
           'periods': res,
           'reading': 'minusCwAllPp is the dividend term missing in a price-vs-price comparison against CW_ALL (positive: the strategy would gain relative to CW_ALL on a total-return basis); minusSpyN30dPp the same against SPY. Order of magnitude only.'}
    OUT.write_text(json.dumps(out, indent=1) + '\n')
    print(json.dumps({k: v for k, v in out.items() if k in ('validationCwAllVsSpyN30D', 'spyN30dMeanYieldPct', 'summary', 'dpsStates', 'droppedAboveMaxYield', 'ciksWithoutCompanyfacts')}, indent=0))


main()
