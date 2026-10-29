#!/usr/bin/env python3
"""V13b F1W: independent stdlib re-check of the new parts of study registration 2.0.0 (run with python3 -I).

New Python implementation (never ported from the JS of scripts/quant/v13b/f1w): the F1d frame rule (drop the non-modal last bar of
exactly the F1w chains), all F1d S1 cells (V10 semantics, terminal scenarios 0/1/2), F1d block-bootstrap p-values and Holm (both
variants), F1d S2 (buy-and-hold, weekly-rebalanced EW), DG1 (partial-week returns), DG2 (SPY legs moved to the true last trade date,
F1w), DG3 (funded universe membership and episode statistics, all four frames). Reused by path (already independent references): the
V10 Python reference (signal rules, outcome state rule, circular block bootstrap, Holm, F0 population from the manifest) and the V13
Python reference (register binding of the private series, F1/F1w frame rule). JS outputs are read only for comparison.

Usage: verify_v13b_f1w.py <v13-private-run-root> <v13b-private-run-root> <repo-root> <series-dir> <out.json> [--no-pvalues]
"""
import argparse, collections, datetime, gzip, importlib.util, json, os, time

D = datetime.date.fromisoformat
SCEN = {'MERGER': (0.0, -0.10, 0.10), 'DISTRESS': (0.0, -0.30, -1.0), 'UNKNOWN': (0.0, -0.30, -1.0)}
SCEN_NAMES = ['S0_LAST_CLOSE', 'S1_MERGER_M10_OTHER_M30', 'S2_MERGER_P10_OTHER_M100']
EXCH = {'NASDAQ': 'XNAS', 'NYSE': 'XNYS', 'AMEX': 'XASE', 'NYSE MKT': 'XASE'}
PERIODS = [('2000-01-01', '2007-12-31'), ('2008-01-01', '2012-12-31'), ('2013-01-01', '2019-12-31'), ('2020-01-01', '2025-12-31')]


def load_mod(root, rel, name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(root, rel))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


def jgz(p):
    return json.loads(gzip.open(p).read()) if p.endswith('.gz') else json.load(open(p))


def f1d_frame(cal, series, monday):
    """Registration 2.0.0 F1d: chains whose last bar is earlier than the modal label of its week (all earlier bars modal) lose that bar."""
    modal = {monday(d): d for d in cal}
    added, nonmodal, badex, trunc, short = [], 0, 0, 0, 0
    for sid in sorted(series):
        s = series[sid]; pts = [list(p) for p in s['points']]; tr = {p[0]: p[1] for p in s['totalReturn']}; cut = False
        last = pts[-1][0]; m = modal.get(monday(last))
        if m and last < m and all(modal.get(monday(p[0])) == p[0] for p in pts[:-1]):
            if len(pts) - 1 < 2: short += 1; continue
            pts = pts[:-1]; tr.pop(last, None); cut = True
        if any(modal.get(monday(p[0])) != p[0] for p in pts): nonmodal += 1; continue
        if not EXCH.get(s['exchange']): badex += 1; continue
        trunc += cut
        added.append(dict(id=sid, dates=[p[0] for p in pts], closes=[float(p[1]) for p in pts], listingStart=pts[0][0], tr=tr, cls=s['terminal']['class'], endedFlag=True,
                          lastTradeDate=s['lastTradeDate'], truncated=cut))
    return added, dict(added=len(added), nonModal=nonmodal, exchange=badex, truncated=trunc, tooShort=short)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('v13_root'); ap.add_argument('run_root'); ap.add_argument('root'); ap.add_argument('series'); ap.add_argument('out')
    ap.add_argument('--no-pvalues', action='store_true')
    a = ap.parse_args(); t0 = time.time()
    V13 = load_mod(a.root, 'scripts/quant/v13/studies/verify_v13_studies.py', 'v13verify'); V = V13.load_v10(a.root); par = V.Parity()
    reg = json.load(open(os.path.join(a.root, 'docs/quant-recovery/v10/studies/registration-1.0.0.json')))['registration']
    SB = reg['studies']['SIGNAL_BACKTEST']; fee, slip = reg['costs']['base']['feeBps'], reg['costs']['base']['slippageBps']
    man = jgz(os.path.join(a.v13_root, 'F0-source-manifest.json.gz'))
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
    for s in panel0: prep(s)
    sq = V13.load_delisted(a.root, a.series, par, 'QUALIFIED')
    extra = {}
    extra['F1'], c1 = V13.delisted_frame(calendar, sq, False)
    extra['F1w'], cw = V13.delisted_frame(calendar, sq, True)
    extra['F1d'], cd = f1d_frame(calendar, sq, V13.monday)
    for f in extra:
        for s in extra[f]: prep(s)
    meta = {f: json.load(open(os.path.join(a.run_root, f, 'run-meta-v13b.json'))) for f in ('F0', 'F1', 'F1w', 'F1d')}
    md = meta['F1d']['delisted']
    par.eq(cd['added'], md['added'], 'F1d:added'); par.eq(cd['truncated'], md['truncatedLastBars'], 'F1d:truncated'); par.eq(cd['tooShort'], md['tooShortAfterDrop'], 'F1d:tooShort')
    par.eq(cd['nonModal'], md['excluded']['NON_MODAL_WEEK_LABEL'], 'F1d:nonModal'); par.eq(cd['exchange'], md['excluded']['EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET'], 'F1d:exchange')
    par.eq(sorted(s['id'] for s in extra['F1d']), sorted(s['id'] for s in extra['F1w']), 'F1d:sameChainsAsF1w')
    par.eq(cw['relabelled'], meta['F1w']['delisted']['relabelledLastBars'], 'F1w:relabelled'); par.eq(cw['added'], meta['F1w']['delisted']['added'], 'F1w:added')
    fdir = os.path.join(a.run_root, 'F1d')
    J = json.load(open(os.path.join(fdir, 'signal-backtest-evidence.json'))); JT = json.load(open(os.path.join(fdir, 's1-terminal.json'))); JS2 = json.load(open(os.path.join(fdir, 's2-population.json')))
    par.eq(len(panel0) + len(extra['F1d']), J['population']['frame'], 'F1d:frameSize')
    jcells = {(c['rule'], c['horizonWeeks'], c['endpoint']): c for c in J['cells']}
    jterm = {(c['rule'], c['horizonWeeks'], c['endpoint'], c['scenario']): c for c in JT['cells']}
    print('frames ready', round(time.time() - t0, 1), 's', file=__import__('sys').stderr)
    flags_cache = {}

    def scen(s): return SCEN[s['cls']] if s['cls'] else (0.0, 0.0, 0.0)

    def term_base(s, k, h):
        n = len(s['closes']); c = s['cal']
        if not s['ended'] or k + 1 + h < n or k + 1 >= n: return None
        if c[k + 1] != c[k] + 1 or c[n - 1] - c[k] != n - 1 - k or c[k] + 1 + h > T - 1: return None
        return s['closes'][-1] / s['closes'][k + 1]

    def flags(s):
        key = (s['id'], len(s['dates']), s['dates'][-1])
        if key not in flags_cache: flags_cache[key] = V.detect_flags(s['closes'])
        return flags_cache[key]

    def contrib(s, h):
        fl = flags(s); sv = scen(s); evs, ctl = [], []
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
                evs.append(dict(rule=r, date=s['dates'][k], sid=s['id'], cidx=s['cal'][k], k=k, state=st, gross=g, bench=b, tg=tg, tbench=tbench, trg=trg))
        for k in range(V.WARMUP, len(s['closes'])):
            if not V.eligible(s, k, V.SIG_LOOKBACK): continue
            st, g = V.state_of(s, k, h, T, V.SIG_LOOKBACK)
            tb = term_base(s, k, h) if st == 'CENSORED' else None
            if st != 'OBSERVED' and tb is None: continue
            ctl.append((s['cal'][k], g if st == 'OBSERVED' else None, tuple(tb * (1 + x) - 1 for x in sv) if tb is not None else None, frozenset(r for r in SB['rules'] if fl[r][k])))
        return evs, ctl

    rows_v10, rows_s0 = {}, {}

    def aggregate(h, ev, ct):
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
            cov = jcells[(r, h, 'RAW_NET')]['coverage']
            for st, key in (('OBSERVED', 'observed'), ('CENSORED', 'censored'), ('IMMATURE', 'immature')):
                par.eq(sum(1 for e in inw if e['state'] == st), cov[key], f'F1d:{r}:{h}:{key}')
            par.eq(len(inw), cov['events'], f'F1d:{r}:{h}:events')
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
                jc = jcells[(r, h, ep)]
                par.eq(len(rows), jc['n'], f'F1d:{r}:{h}:{ep}:n'); par.near(V.mean([x[2] for x in rows]), jc['estimate'], f'F1d:{r}:{h}:{ep}:mean')
                rows_v10[(r, h, ep)] = rows
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
                    jt = jterm[(r, h, ep, SCEN_NAMES[j])]
                    par.eq(len(trows), jt['n'], f'F1d:{r}:{h}:{ep}:{j}:tn'); par.near(V.mean([x[2] for x in trows]), jt['estimate'], f'F1d:{r}:{h}:{ep}:{j}:tmean')
                    if j == 0: rows_s0[(r, h, ep)] = trows
            trp = [((e['gross'] if e['state'] == 'OBSERVED' else e['tg'][0]), e['trg']) for e in inw if e['sid'].startswith('dl_') and e['trg'] is not None and (e['state'] == 'OBSERVED' or e['tg'] is not None)]
            jtr = JT['totalReturnDelistedSubset'][f'{r}:{h}']
            par.eq(len(trp), jtr['n'], f'F1d:{r}:{h}:tr:n'); par.near(V.mean([x[0] for x in trp]), jtr['priceGrossMean'], f'F1d:{r}:{h}:tr:price'); par.near(V.mean([x[1] for x in trp]), jtr['totalReturnGrossMean'], f'F1d:{r}:{h}:tr:tr')
        periods = [('FULL', win[0], win[1])] + [(x[0][:4] + '-' + x[1][:4], x[0], x[1]) for x in PERIODS]
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
                j2 = JS2['buyAndHold'][str(h)][name][label]
                par.eq(len(P), j2['weeks'], f'F1d:s2:{h}:{name}:{label}:weeks'); par.near(V.mean(P), j2['populationGross'], f'F1d:s2:{h}:{name}:{label}:pop'); par.near(V.mean(Sp), j2['spy'], f'F1d:s2:{h}:{name}:{label}:spy')

    # ---------- DG2 (F1w): SPY legs on relabelled bars moved to the true last trade date ----------
    dg2 = {(x['rule'], x['horizonWeeks'], x['variant']): x for x in meta['F1w']['dg2']}
    rl = {s['id']: (s['dates'][-1], sq[s['id']]['lastTradeDate']) for s in extra['F1w'] if s['dates'][-1] != sq[s['id']]['points'][-1][0]}
    par.eq(len(rl), cw['relabelled'], 'dg2:relabelledMap')

    def true_d(sid, d):
        x = rl.get(sid); return x[1] if x and d == x[0] else d

    for h in SB['horizonsWeeks']:
        ev, ct = [], []
        for s in panel0 + extra['F1d']: e, c = contrib(s, h); ev += e; ct += c
        aggregate(h, ev, ct)
        evw = []
        for s in extra['F1w']: evw += contrib(s, h)[0]
        ev0 = [e for e in ev if not e['sid'].startswith('dl_')]
        allw = ev0 + evw
        byid = {s['id']: s for s in extra['F1w']}
        for r in SB['rules']:
            acc = {'V10': [[], [], 0], 'S0': [[], [], 0]}
            for e in allw:
                if e['rule'] != r or not (win[0] <= e['date'] <= win[1]): continue
                s = byid.get(e['sid'])
                if e['state'] == 'OBSERVED':
                    net = V.net_of(e['gross'], fee, slip)
                    dts = (s['dates'] if s else None)
                    ed = dts[e['k'] + 1] if s else None; xd = dts[e['k'] + 1 + h] if s else None
                    b1 = V.spy_ret(spy, true_d(e['sid'], ed), true_d(e['sid'], xd)) if s else e['bench']
                    moved = bool(s) and (true_d(e['sid'], ed) != ed or true_d(e['sid'], xd) != xd)
                    for v in ('V10', 'S0'):
                        if e['bench'] is not None: acc[v][0].append(net - e['bench'])
                        if b1 is not None: acc[v][1].append(net - b1)
                        acc[v][2] += moved
                elif e['tg'] is not None:
                    net = V.net_of(e['tg'][0], fee, slip); ed = s['dates'][e['k'] + 1] if s else None
                    xd = calendar[(s['cal'][e['k']] if s else e['cidx']) + 1 + h]
                    b1 = V.spy_ret(spy, true_d(e['sid'], ed), xd) if s else e['tbench']
                    if e['tbench'] is not None: acc['S0'][0].append(net - e['tbench'])
                    if b1 is not None: acc['S0'][1].append(net - b1)
                    acc['S0'][2] += bool(s) and true_d(e['sid'], ed) != ed
            for v in ('V10', 'S0'):
                j = dg2[(r, h, v)]
                par.eq(len(acc[v][0]), j['nModalDate'], f'dg2:{r}:{h}:{v}:n'); par.near(V.mean(acc[v][0]), j['estimateModalDate'], f'dg2:{r}:{h}:{v}:modal')
                par.eq(len(acc[v][1]), j['nTrueDate'], f'dg2:{r}:{h}:{v}:ntrue'); par.near(V.mean(acc[v][1]), j['estimateTrueDate'], f'dg2:{r}:{h}:{v}:true'); par.eq(acc[v][2], j['affectedEvents'], f'dg2:{r}:{h}:{v}:affected')
        print('h', h, round(time.time() - t0, 1), 's', file=__import__('sys').stderr)
    pcount = 0
    if not a.no_pvalues:
        for kind, store, jall in (('V10', rows_v10, J['cells']), ('S0', rows_s0, [c for c in JT['cells'] if c['scenario'] == SCEN_NAMES[0]])):
            keys = sorted(store); ps = []
            for key in keys:
                B = 104 if key[1] >= 52 else 52
                inf = V.cbb(study_cal, V.subsample(store[key]), B); ps.append(inf['p'])
                jc = next(c for c in jall if (c['rule'], c['horizonWeeks'], c['endpoint']) == key)
                par.near(inf['p'], jc['pValue'], f'F1d:{kind}:{key}:p'); pcount += 1
            for key, x in zip(keys, V.holm(ps)):
                jc = next(c for c in jall if (c['rule'], c['horizonWeeks'], c['endpoint']) == key)
                par.near(x, jc['holmAdjustedP'], f'F1d:{kind}:{key}:holm')
        print('p-values', round(time.time() - t0, 1), 's', file=__import__('sys').stderr)
    # ---------- F1d S2 weekly-rebalanced EW index, lifetime TR ----------
    panel = panel0 + extra['F1d']
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
        for label, jv in JS2['weeklyRebalancedEW'][SCEN_NAMES[j]].items():
            c0, c1 = ci[jv['from']], ci[jv['to']]
            yrs = (D(jv['to']) - D(jv['from'])).days / 365.25; tot = I[c1] / I[c0] - 1
            par.near((1 + tot) ** (1 / yrs) - 1, jv['cagr'], f'F1d:ew:{j}:{label}:cagr', rel=1e-8)
    pr, tr = [], []
    for s in extra['F1d']:
        xa, xb = s['tr'].get(s['dates'][0]), s['tr'].get(s['dates'][-1])
        if xa and xb: pr.append(s['closes'][-1] / s['closes'][0] - 1); tr.append(xb / xa - 1)
    jl = JS2['delistedSubsetLifetime']
    par.eq(len(pr), jl['withTotalReturn'], 'F1d:life:n'); par.near(V.mean(pr), jl['priceMean'], 'F1d:life:price'); par.near(V.mean(tr), jl['totalReturnMean'], 'F1d:life:tr')
    # ---------- DG1 (F1w relabelled = F1d truncated chains) ----------
    by = collections.defaultdict(list)
    for s in extra['F1w']:
        if s['id'] not in rl: continue
        r = s['closes'][-1] / s['closes'][-2] - 1; by[s['cls']].append(r); by['ALL'].append(r)
    dg1 = meta['F1w']['dg1']
    for k, xs in by.items():
        par.eq(len(xs), dg1[k]['n'], f'dg1:{k}:n'); par.near(V.mean(xs), dg1[k]['mean'], f'dg1:{k}:mean')
        par.near(sum(1 for x in xs if x < -0.5) / len(xs), dg1[k]['shareBelowMinus50'], f'dg1:{k}:below')
        sx = sorted(xs); md = sx[len(sx) // 2] if len(sx) % 2 else (sx[len(sx) // 2 - 1] + sx[len(sx) // 2]) / 2
        par.near(md, dg1[k]['median'], f'dg1:{k}:median')
    # ---------- DG3: funded universe and episodes (all four frames) ----------
    H = SB['fundedStrategy']['parameters']['holdingWeeks']; last_session = ci[study_cal[-1]] + 1 + H
    src = {'F0': os.path.join(a.v13_root, 'F0'), 'F1': os.path.join(a.v13_root, 'F1'), 'F1w': os.path.join(a.v13_root, 'F1w'), 'F1d': fdir}
    f1eps = {r: {(e['securityId'], e['signalDate']) for e in jgz(os.path.join(src['F1'], f'funded-{r}-equity.json.gz'))['episodes']} for r in SB['fundedStrategy']['rules']}
    for f in ('F0', 'F1', 'F1w', 'F1d'):
        pnl = panel0 + extra.get(f, []); uni = [s for s in pnl if s['gap'][-1] == 0 and s['cal'][-1] >= last_session]
        d3 = meta[f]['dg3']; par.eq(len(uni), d3['universe'], f'dg3:{f}:universe'); par.eq(sum(1 for s in uni if s['id'].startswith('dl_')), d3['delistedInUniverse'], f'dg3:{f}:dl')
        byid = {s['id']: s for s in pnl}
        for r in SB['fundedStrategy']['rules']:
            eps = jgz(os.path.join(src[f], f'funded-{r}-equity.json.gz'))['episodes']
            def ret(e):
                s = byid[e['securityId']]; m = {c: k for k, c in enumerate(s['cal'])}; return s['closes'][m[e['exitExec']]] / s['closes'][m[e['entryExec']]] - 1
            dl = [e for e in eps if e['securityId'].startswith('dl_')]; jr = d3['rules'][r]
            par.eq(len(eps), jr['episodes'], f'dg3:{f}:{r}:episodes'); par.eq(len(dl), jr['episodesInDelisted'], f'dg3:{f}:{r}:dl')
            par.near(V.mean([ret(e) for e in eps]), jr['meanGrossEpisodeAll'], f'dg3:{f}:{r}:meanAll')
            if dl: par.near(V.mean([ret(e) for e in dl]), jr['meanGrossEpisodeDelisted'], f'dg3:{f}:{r}:meanDl')
            if f != 'F1': par.eq(sum(1 for e in eps if (e['securityId'], e['signalDate']) not in f1eps[r]), jr['episodesNotInF1'], f'dg3:{f}:{r}:notInF1')
        if f == 'F1d':
            jf = json.load(open(os.path.join(fdir, 'funded-strategy-evidence.json')))
            for p in jf['performance']: par.eq(len(uni), p['universe']['listings'], f'dg3:F1d:{p["rule"]}:engineUniverse')
    kinds = collections.Counter(':'.join(str(fl[0]).split(':')[:2]) for fl in par.fail)
    report = dict(schemaVersion='v13b-f1w-python-check-2.0.0', implementation='independent stdlib Python (F1d frame, cells, S2, DG1-DG3 new; V10/V13 Python references imported by path)',
                  frames=dict(F1=c1, F1w=cw, F1d=cd), pValuesChecked=pcount, checks=par.checks, failures=len(par.fail), failureKinds=dict(kinds.most_common(40)),
                  firstFailures=[list(map(str, x)) for x in par.fail[:40]], maxRelativeDifference=par.max_rel, seconds=round(time.time() - t0, 1), state='PASS' if not par.fail else 'FAIL')
    json.dump(report, open(a.out, 'w'), indent=1)
    print(json.dumps({k: report[k] for k in ('state', 'checks', 'failures', 'maxRelativeDifference', 'seconds')}))


if __name__ == '__main__':
    main()
