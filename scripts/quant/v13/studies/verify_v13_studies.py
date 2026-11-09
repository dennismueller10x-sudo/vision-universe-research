#!/usr/bin/env python3
"""V13 STUDIES: independent stdlib re-check (run with python3 -I).

New, separate implementation of everything V13 adds on top of the V10 study: register binding of the private delisted series
(points hash), the F1/F1c/F1w frame rule on F0's modal calendar (incl. the amendment-1.0.1 last-bar relabel), the terminal
scenarios, the S1 cell means (V10 semantics and terminal-resolved), S1 block-bootstrap p-values and Holm for F1 (both variants),
the S2 population returns and the S3 replaced exits of the PIT S&P 500. Reused from the already independent V10 Python reference
(scripts/quant/v10/studies/verify_v10_studies.py, imported by path; never ported from JS): F0 population from the run manifest,
the five signal rules, the outcome state rule, the circular block bootstrap and Holm. JS outputs are read only for comparison.

Usage: verify_v13_studies.py <private-run-root> <repo-root> <series-dir> <out.json> [--s3 <s3 json>] [--frames F0,F1,F1w,F1c] [--pvalues F1]
"""
import argparse, collections, datetime, gzip, hashlib, importlib.util, json, os, time

D = datetime.date.fromisoformat
SCEN = {'MERGER': (0.0, -0.10, 0.10), 'DISTRESS': (0.0, -0.30, -1.0), 'UNKNOWN': (0.0, -0.30, -1.0)}
SCEN_NAMES = ['S0_LAST_CLOSE', 'S1_MERGER_M10_OTHER_M30', 'S2_MERGER_P10_OTHER_M100']
EXCH = {'NASDAQ': 'XNAS', 'NYSE': 'XNYS', 'AMEX': 'XASE', 'NYSE MKT': 'XASE'}


def monday(d):
    t = D(d); return (t - datetime.timedelta(days=t.weekday())).isoformat()


def load_v10(root):
    spec = importlib.util.spec_from_file_location('v10verify', os.path.join(root, 'scripts/quant/v10/studies/verify_v10_studies.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


def load_delisted(root, sdir, par, include):
    reg = json.load(open(os.path.join(root, 'docs/quant-recovery/v13/delisted/register-1.0.0.json')))
    ix = {c: i for i, c in enumerate(reg['columns'])}
    want = ('QUALIFIED',) if include == 'QUALIFIED' else ('QUALIFIED', 'PRICE_ONLY_CENSORED_END')
    out = {}
    for r in reg['rows']:
        if r[ix['status']] not in want: continue
        s = json.load(open(os.path.join(sdir, r[ix['chainId']] + '.json')))
        h = hashlib.sha256(json.dumps(s['points'], separators=(',', ':')).encode()).hexdigest()
        par.eq(h, r[ix['pointsSha256']], 'pointsSha:' + r[ix['chainId']]); par.eq(s['status'], r[ix['status']], 'status:' + r[ix['chainId']])
        out['dl_' + r[ix['chainId']]] = s
    return out


def delisted_frame(cal, series, relabel):
    """F0 modal calendar rule (one label per ISO week), optional last-bar relabel (amendment 1.0.1)."""
    modal = {monday(d): d for d in cal}
    added, nonmodal, badex, relab = [], 0, 0, 0
    for sid in sorted(series):
        s = series[sid]; pts = [list(p) for p in s['points']]; tr = {p[0]: p[1] for p in s['totalReturn']}
        rl = False
        if relabel:
            last = pts[-1][0]; m = modal.get(monday(last))
            if m and last < m and all(modal.get(monday(p[0])) == p[0] for p in pts[:-1]):
                pts[-1] = [m, pts[-1][1]]
                if last in tr: tr[m] = tr.pop(last)
                rl = True
        if any(modal.get(monday(p[0])) != p[0] for p in pts): nonmodal += 1; continue
        if not EXCH.get(s['exchange']): badex += 1; continue
        relab += rl
        added.append(dict(id=sid, dates=[p[0] for p in pts], closes=[float(p[1]) for p in pts], listingStart=pts[0][0], tr=tr, cls=s['terminal']['class'], endedFlag=True))
    return added, dict(added=len(added), nonModal=nonmodal, exchange=badex, relabelled=relab)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('run_root'); ap.add_argument('root'); ap.add_argument('series'); ap.add_argument('out')
    ap.add_argument('--frames', default='F0,F1,F1w,F1c'); ap.add_argument('--pvalues', default='F1'); ap.add_argument('--s3', default=None)
    a = ap.parse_args(); frames = a.frames.split(','); pframes = set(a.pvalues.split(',')) if a.pvalues else set()
    t0 = time.time(); V = load_v10(a.root); par = V.Parity()
    reg = json.load(open(os.path.join(a.root, 'docs/quant-recovery/v10/studies/registration-1.0.0.json')))['registration']
    SB = reg['studies']['SIGNAL_BACKTEST']; fee, slip = reg['costs']['base']['feeBps'], reg['costs']['base']['slippageBps']
    man = json.loads(gzip.open(os.path.join(a.run_root, 'F0-source-manifest.json.gz')).read())
    calendar, panel0 = V.build_population(a.root, man, par)
    T = len(calendar); ci = {d: i for i, d in enumerate(calendar)}; win = reg['window']['signalDates']
    study_cal = [d for d in calendar if win[0] <= d <= win[1]]; spy = V.load_spy(a.root)
    for s in panel0:
        lc = s['lifecycle'] or {}
        s['endedFlag'] = bool(lc.get('lastTradeDate')); s['cls'] = None; s['tr'] = None

    def prep(s):
        s['cal'] = [ci[d] for d in s['dates']]; g = [0]
        for k in range(len(s['dates'])): g.append(g[-1] + (1 if k > 0 and s['cal'][k] != s['cal'][k - 1] + 1 else 0))
        s['gap'] = g; s['ended'] = s['endedFlag'] and s['cal'][-1] < T - 1
    for s in panel0: s['ended'] = s['endedFlag'] and s['cal'][-1] < T - 1
    sq = load_delisted(a.root, a.series, par, 'QUALIFIED'); sa = load_delisted(a.root, a.series, par, 'ALL') if 'F1c' in frames else {}
    src = {'F1': (sq, False), 'F1w': (sq, True), 'F1c': (sa, False)}
    FR = {}
    for f in frames:
        fdir = os.path.join(a.run_root, f)
        J = json.load(open(os.path.join(fdir, 'signal-backtest-evidence.json'))); JT = json.load(open(os.path.join(fdir, 's1-terminal.json'))); JS2 = json.load(open(os.path.join(fdir, 's2-population.json')))
        extra, cnt = ([], {}) if f == 'F0' else delisted_frame(calendar, *src[f])
        for s in extra: prep(s)
        par.eq(len(panel0) + len(extra), J['population']['frame'], f + ':frameSize')
        FR[f] = dict(J=J, JT=JT, JS2=JS2, extra=extra, counts=cnt, rows={}, trows={}, jcells={(c['rule'], c['horizonWeeks'], c['endpoint']): c for c in J['cells']},
                     jterm={(c['rule'], c['horizonWeeks'], c['endpoint'], c['scenario']): c for c in JT['cells']})
    print('frames ready', round(time.time() - t0, 1), 's', file=__import__('sys').stderr)
    flags_cache = {}

    def scen(s): return SCEN[s['cls']] if s['cls'] else (0.0, 0.0, 0.0)

    def term_base(s, k, h):
        n = len(s['closes']); c = s['cal']
        if not s['ended'] or k + 1 + h < n or k + 1 >= n: return None
        if c[k + 1] != c[k] + 1 or c[n - 1] - c[k] != n - 1 - k or c[k] + 1 + h > T - 1: return None
        return s['closes'][-1] / s['closes'][k + 1]

    def contrib(s, h):
        key = (s['id'], s['dates'][-1])
        if key not in flags_cache: flags_cache[key] = V.detect_flags(s['closes'])
        fl = flags_cache[key]; sv = scen(s); evs, ctl = [], []
        for r in SB['rules']:
            for k in V.cooldown_events(fl[r]):
                st, g = V.state_of(s, k, h, T, V.SIG_LOOKBACK)
                b = V.spy_ret(spy, s['dates'][k + 1], s['dates'][k + 1 + h]) if st == 'OBSERVED' else None
                tb = term_base(s, k, h) if st == 'CENSORED' else None
                tg = tuple(tb * (1 + x) - 1 for x in sv) if tb is not None else None
                tbench = V.spy_ret(spy, s['dates'][k + 1], calendar[s['cal'][k] + 1 + h]) if tb is not None else None
                trg = None
                if s['tr'] is not None and (st == 'OBSERVED' or tb is not None):
                    xa = s['tr'].get(s['dates'][k + 1]); xb = s['tr'].get(s['dates'][k + 1 + h] if st == 'OBSERVED' else s['dates'][-1])
                    if xa and xb: trg = xb / xa - 1
                evs.append(dict(rule=r, date=s['dates'][k], sid=s['id'], cidx=s['cal'][k], state=st, gross=g, bench=b, tg=tg, tbench=tbench, trg=trg))
        for k in range(V.WARMUP, len(s['closes'])):
            if not V.eligible(s, k, V.SIG_LOOKBACK): continue
            st, g = V.state_of(s, k, h, T, V.SIG_LOOKBACK)
            tb = term_base(s, k, h) if st == 'CENSORED' else None
            if st != 'OBSERVED' and tb is None: continue
            ctl.append((s['cal'][k], g if st == 'OBSERVED' else None, tuple(tb * (1 + x) - 1 for x in sv) if tb is not None else None, frozenset(r for r in SB['rules'] if fl[r][k])))
        return evs, ctl

    def aggregate(f, h, ev, ct):
        F = FR[f]
        os_ = collections.defaultdict(float); on = collections.defaultdict(int)
        ds = {r: collections.defaultdict(float) for r in SB['rules']}; dn = {r: collections.defaultdict(int) for r in SB['rules']}
        ts = [collections.defaultdict(float) for _ in range(3)]; tn = collections.defaultdict(int)
        tds = [{r: collections.defaultdict(float) for r in SB['rules']} for _ in range(3)]; tdn = {r: collections.defaultdict(int) for r in SB['rules']}
        for c, g, tg, fl in ct:
            if g is not None:
                os_[c] += g; on[c] += 1
                for r in fl: ds[r][c] += g; dn[r][c] += 1
            tn[c] += 1
            for j in range(3):
                v = g if g is not None else tg[j]; ts[j][c] += v
                for r in fl: tds[j][r][c] += v
            for r in fl: tdn[r][c] += 1
        for r in SB['rules']:
            inw = [e for e in ev if e['rule'] == r and win[0] <= e['date'] <= win[1]]
            cov = F['jcells'][(r, h, 'RAW_NET')]['coverage']
            for st, key in (('OBSERVED', 'observed'), ('CENSORED', 'censored'), ('IMMATURE', 'immature')):
                par.eq(sum(1 for e in inw if e['state'] == st), cov[key], f'{f}:{r}:{h}:{key}')
            par.eq(len(inw), cov['events'], f'{f}:{r}:{h}:events')
            for ep in SB['endpoints']:
                rows = []
                for e in inw:
                    if e['state'] != 'OBSERVED': continue
                    net = V.net_of(e['gross'], fee, slip)
                    if ep == 'RAW_NET': v = net
                    elif ep == 'SPY_EXCESS': v = None if e['bench'] is None else net - e['bench']
                    else:
                        n = on[e['cidx']] - dn[r][e['cidx']]
                        v = None if n <= 0 else net - V.net_of((os_[e['cidx']] - ds[r][e['cidx']]) / n, fee, slip)
                    if v is not None: rows.append((e['sid'], e['date'], v))
                jc = F['jcells'][(r, h, ep)]
                par.eq(len(rows), jc['n'], f'{f}:{r}:{h}:{ep}:n'); par.near(V.mean([x[2] for x in rows]), jc['estimate'], f'{f}:{r}:{h}:{ep}:mean')
                if f in pframes: F['rows'][(r, h, ep)] = rows
                for j in range(3):
                    trows = []
                    for e in inw:
                        if e['state'] == 'OBSERVED': g, b = e['gross'], e['bench']
                        elif e['tg'] is not None: g, b = e['tg'][j], e['tbench']
                        else: continue
                        net = V.net_of(g, fee, slip)
                        if ep == 'RAW_NET': v = net
                        elif ep == 'SPY_EXCESS': v = None if b is None else net - b
                        else:
                            n = tn[e['cidx']] - tdn[r][e['cidx']]
                            v = None if n <= 0 else net - V.net_of((ts[j][e['cidx']] - tds[j][r][e['cidx']]) / n, fee, slip)
                        if v is not None: trows.append((e['sid'], e['date'], v))
                    jt = F['jterm'][(r, h, ep, SCEN_NAMES[j])]
                    par.eq(len(trows), jt['n'], f'{f}:{r}:{h}:{ep}:{j}:tn'); par.near(V.mean([x[2] for x in trows]), jt['estimate'], f'{f}:{r}:{h}:{ep}:{j}:tmean')
                    if j == 0 and f in pframes: F['trows'][(r, h, ep)] = trows
            # total return subset (delisted events, scenario 0)
            trp = [((e['gross'] if e['state'] == 'OBSERVED' else e['tg'][0]), e['trg']) for e in inw if e['sid'].startswith('dl_') and e['trg'] is not None and (e['state'] == 'OBSERVED' or e['tg'] is not None)]
            jtr = F['JT']['totalReturnDelistedSubset'][f'{r}:{h}']
            par.eq(len(trp), jtr['n'], f'{f}:{r}:{h}:tr:n'); par.near(V.mean([x[0] for x in trp]), jtr['priceGrossMean'], f'{f}:{r}:{h}:tr:price'); par.near(V.mean([x[1] for x in trp]), jtr['totalReturnGrossMean'], f'{f}:{r}:{h}:tr:tr')
        # S2 buy-and-hold
        periods = [('FULL', win[0], win[1])] + [(x[0][:4] + '-' + x[1][:4], x[0], x[1]) for x in [('2000-01-01', '2007-12-31'), ('2008-01-01', '2012-12-31'), ('2013-01-01', '2019-12-31'), ('2020-01-01', '2025-12-31')]]
        variants = {'V10_COMPLETED_ONLY': (os_, on), 'TERMINAL_S0': (ts[0], tn), 'TERMINAL_' + SCEN_NAMES[1]: (ts[1], tn), 'TERMINAL_' + SCEN_NAMES[2]: (ts[2], tn)}
        for name, (S, N) in variants.items():
            for label, lo, hi in periods:
                P, Sp = [], []
                for d in study_cal:
                    c = ci[d]
                    if not (lo <= d <= hi) or not N[c] or c + 1 + h > T - 1: continue
                    sr = V.spy_ret(spy, calendar[c + 1], calendar[c + 1 + h])
                    if sr is None: continue
                    P.append(S[c] / N[c]); Sp.append(sr)
                j2 = F['JS2']['buyAndHold'][str(h)][name][label]
                par.eq(len(P), j2['weeks'], f'{f}:s2:{h}:{name}:{label}:weeks'); par.near(V.mean(P), j2['populationGross'], f'{f}:s2:{h}:{name}:{label}:pop'); par.near(V.mean(Sp), j2['spy'], f'{f}:s2:{h}:{name}:{label}:spy')

    for h in SB['horizonsWeeks']:
        ev0, ct0 = [], []
        for s in panel0: e, c = contrib(s, h); ev0 += e; ct0 += c
        for f in frames:
            ev, ct = list(ev0), list(ct0)
            for s in FR[f]['extra']: e, c = contrib(s, h); ev += e; ct += c
            aggregate(f, h, ev, ct)
        print('h', h, round(time.time() - t0, 1), 's', file=__import__('sys').stderr)
    # p-values and Holm (V10 semantics and terminal scenario 0)
    pcount = 0
    for f in pframes:
        F = FR[f]
        for kind, store, jget in (('V10', F['rows'], lambda k: F['jcells'][k]), ('S0', F['trows'], lambda k: F['jterm'][k + (SCEN_NAMES[0],)])):
            keys = sorted(store); ps = []
            for key in keys:
                B = 104 if key[1] >= 52 else 52
                inf = V.cbb(study_cal, V.subsample(store[key]), B); ps.append(inf['p'])
                par.near(inf['p'], jget(key)['pValue'], f'{f}:{kind}:{key}:p'); pcount += 1
            jall = (F['J']['cells'] if kind == 'V10' else [c for c in F['JT']['cells'] if c['scenario'] == SCEN_NAMES[0]])
            adj = V.holm(ps)
            for key, x in zip(keys, adj):
                jc = next(c for c in jall if (c['rule'], c['horizonWeeks'], c['endpoint']) == key)
                par.near(x, jc['holmAdjustedP'], f'{f}:{kind}:{key}:holm')
        print('p-values', f, round(time.time() - t0, 1), 's', file=__import__('sys').stderr)
    # S2 weekly rebalanced EW index and delisted lifetime TR
    for f in frames:
        F = FR[f]; panel = panel0 + F['extra']
        for j in range(3):
            S = [0.0] * T; N = [0] * T
            for s in panel:
                n = len(s['closes']); sv = scen(s)[j]
                for k in range(1, n):
                    if s['cal'][k] != s['cal'][k - 1] + 1 or s['dates'][k - 1] < s['listingStart']: continue
                    r = s['closes'][k] / s['closes'][k - 1] - 1
                    if s['ended'] and k == n - 1: r = (1 + r) * (1 + sv) - 1
                    S[s['cal'][k]] += r; N[s['cal'][k]] += 1
            I = [1.0] * T
            for c in range(1, T): I[c] = I[c - 1] * (1 + (S[c] / N[c] if N[c] else 0.0))
            for label, jv in F['JS2']['weeklyRebalancedEW'][SCEN_NAMES[j]].items():
                c0, c1 = ci[jv['from']], ci[jv['to']]
                yrs = (D(jv['to']) - D(jv['from'])).days / 365.25; tot = I[c1] / I[c0] - 1
                par.near((1 + tot) ** (1 / yrs) - 1, jv['cagr'], f'{f}:ew:{j}:{label}:cagr', rel=1e-8)
                sr = V.spy_ret(spy, jv['from'], jv['to']); par.near((1 + sr) ** (1 / yrs) - 1, jv['spyCagr'], f'{f}:ew:{j}:{label}:spy', rel=1e-8)
        if F['extra']:
            pr, tr = [], []
            for s in F['extra']:
                xa, xb = s['tr'].get(s['dates'][0]), s['tr'].get(s['dates'][-1])
                if xa and xb: pr.append(s['closes'][-1] / s['closes'][0] - 1); tr.append(xb / xa - 1)
            jl = F['JS2']['delistedSubsetLifetime']
            par.eq(len(pr), jl['withTotalReturn'], f'{f}:life:n'); par.near(V.mean(pr), jl['priceMean'], f'{f}:life:price'); par.near(V.mean(tr), jl['totalReturnMean'], f'{f}:life:tr')
        FR[f]['summary'] = dict(frameListings=len(panel), delisted=F['counts'])
    report = dict(schemaVersion='v13-studies-python-check-1.0.0', implementation='independent stdlib Python (V13 parts new; V10 Python rule/state/bootstrap reference imported by path)',
                  frames={f: FR[f]['summary'] for f in frames}, pValuesChecked=pcount)
    # S3: replaced exits of the PIT S&P 500
    if a.s3:
        J3 = json.load(open(a.s3)); pop = json.load(gzip.open(os.path.join(a.root, 'docs/quant-recovery/v12/spxpop/population-1.1.1.json.gz')))
        names = pop['columns']['status']; by_cik = collections.defaultdict(list)
        for sid, s in sq.items(): by_cik[int(s['cik'])].append((sid, s))
        got = {}
        for p in pop['periods']:
            if p['fund'] != 'SPY' or p['t0'] < '2009-09-30' or p['t1'] > '2026-06-30': continue
            cols = p['cols']
            for k, chi in enumerate(cols['chain']):
                stv = names[cols['status'][k]] if isinstance(cols['status'][k], int) else cols['status'][k]
                cik = pop['chains'][chi][3]
                if not stv.startswith('BOUNDED_EXIT') or not cik: continue
                lim = (D(p['t1']) + datetime.timedelta(days=120)).isoformat()
                hits = [(sid, s) for sid, s in by_cik.get(int(cik), []) if p['t0'] <= s['lastTradeDate'] <= lim]
                if not hits: continue
                hits.sort(key=lambda x: (abs((D(x[1]['lastTradeDate']) - D(p['t1'])).days), x[0]))
                sid, s = hits[0]; dates = [x[0] for x in s['points']]; cl = [x[1] for x in s['points']]
                k0 = max([i for i, d in enumerate(dates) if d <= p['t0']], default=-1)
                if k0 < 0 or (D(p['t0']) - D(dates[k0])).days > 7: continue
                k1 = max([i for i, d in enumerate(dates) if d <= p['t1']], default=-1)
                if k1 >= k0 and (D(p['t1']) - D(dates[k1])).days <= 7: rs = [cl[k1] / cl[k0] - 1] * 3
                elif dates[-1] >= p['t1']: continue
                else: rs = [(cl[-1] / cl[k0]) * (1 + x) - 1 for x in SCEN[s['terminal']['class']]]
                got[(p['t0'], int(cik), sid, k)] = rs
        jrows = J3['replacedRows']
        par.eq(len(got), len(jrows), 's3:replacedCount')
        gl = sorted(got.items()); jl = sorted(jrows, key=lambda x: (x['t0'], int(x['cik']), x['chainId']))
        for (key, rs), jr in zip(gl, jl):
            par.eq((key[0], key[1], key[2]), (jr['t0'], int(jr['cik']), jr['chainId']), 's3:key')
            for j, nm in enumerate(('afterS0', 'afterS1', 'afterS2')): par.near(round(rs[j], 4), jr[nm], f's3:{key[0]}:{key[1]}:{nm}', abs_=1.5e-4)
        report['s3'] = dict(replacedRows=len(got))
    kinds = collections.Counter(':'.join(x for x in str(fl[0]).split(':')[:2]) for fl in par.fail)
    report.update(checks=par.checks, failures=len(par.fail), failureKinds=dict(kinds.most_common(40)), firstFailures=[list(map(str, x)) for x in par.fail[:40]], maxRelativeDifference=par.max_rel,
                  seconds=round(time.time() - t0, 1), state='PASS' if not par.fail else 'FAIL')
    json.dump(report, open(a.out, 'w'), indent=1)
    print(json.dumps({k: report[k] for k in ('state', 'checks', 'failures', 'maxRelativeDifference', 'seconds')}))


if __name__ == '__main__':
    main()
