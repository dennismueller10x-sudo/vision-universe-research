#!/usr/bin/env python3
"""V13c: independent stdlib re-check of study registration 3.0.0 (run with python3 -I).

S1/S2: re-uses the independent V13 Python verifier (scripts/quant/v13/studies/verify_v13_studies.py; frame rule, terminal
scenarios, all S1 cells in both variants, p-values and Holm, S2) and the V13b F1d frame function (verify_v13b_f1w.py), imported
by path, with a NEW register-1.1.0 series binding (file SHA-256, points hash, status, unique directory) written here. The F1d'
frame is checked in a second pass with the drop rule. S3': new code here - usable SPX terminal values (register 1.0.0 minus
First Data and review flags), their unique match in the SPXPOP population file, the documented returns, the per-period step-B
deltas of EW_ALL and CW_ALL (ZERO and LOWER scenarios) recomputed from the population file, and the step-A replacements of the
EARLY span (the P5A span is checked by the V13 verifier on register 1.1.0). JS outputs are read only for comparison.

Usage: verify_v13c.py --root <repo> --private <v13c-private> --series <v13-private/series> --series110 <v13b-private/series-1.1.0>
                      --f0manifest <F0-source-manifest.json.gz> --out <json>
"""
import argparse, collections, datetime, gzip, hashlib, importlib.util, json, os, sys, tempfile, time

D = datetime.date.fromisoformat
REG110 = 'docs/quant-recovery/v13b/hist/register-1.1.0.json'
REG110_SHA = '19e108e79c25d602ead7ec79583af50a8e0b620571667460ab04a017b936b270'
FIRST_DATA = '747c456cff6e81ac'
SCEN = {'MERGER': (0.0, -0.10, 0.10), 'DISTRESS': (0.0, -0.30, -1.0), 'UNKNOWN': (0.0, -0.30, -1.0)}


def load_mod(root, rel, name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(root, rel))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


def sha(b): return hashlib.sha256(b).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    for k in ('root', 'private', 'series', 'series110', 'f0manifest', 'out'): ap.add_argument('--' + k, required=True)
    a = ap.parse_args(); t0 = time.time(); root = os.path.abspath(a.root)
    V13 = load_mod(root, 'scripts/quant/v13/studies/verify_v13_studies.py', 'v13verify')
    V13B = load_mod(root, 'scripts/quant/v13b/f1w/verify_v13b_f1w.py', 'v13bverify')
    V10 = V13.load_v10(root); par = V10.Parity()
    # ---------- register-1.1.0 binding (replaces the register-1.0.0 loader of the V13 verifier) ----------
    binding = {}

    def load_delisted(root_, sdir, p, include):
        buf = open(os.path.join(root_, REG110), 'rb').read(); par.eq(sha(buf), REG110_SHA, 'reg110:sha')
        reg = json.loads(buf); ix = {c: i for i, c in enumerate(reg['columns'])}
        par.eq(reg['schemaVersion'], 'v13-delisted-register-1.1.0', 'reg110:schema'); par.eq(reg['controls']['pass'], True, 'reg110:controls')
        out, n_new = {}, 0
        for r in reg['rows']:
            if r[ix['status']] != 'QUALIFIED': continue
            cid = r[ix['chainId']]; hits = [d for d in (sdir, a.series110) if os.path.exists(os.path.join(d, cid + '.json'))]
            par.eq(len(hits), 1, 'reg110:uniqueFile:' + cid)
            if not hits: continue
            n_new += hits[0] == a.series110
            s = json.load(open(os.path.join(hits[0], cid + '.json')))
            par.eq(sha(json.dumps(s['points'], separators=(',', ':')).encode()), r[ix['pointsSha256']], 'reg110:points:' + cid)
            par.eq(s['status'], 'QUALIFIED', 'reg110:status:' + cid); par.eq(str(s['cik']), str(r[ix['cik']]), 'reg110:cik:' + cid); par.eq(len(s['points']), r[ix['weeks']], 'reg110:weeks:' + cid)
            out['dl_' + cid] = s
        binding.update(loaded=len(out), fromSeries110=n_new)
        return out
    V13.load_delisted = load_delisted
    orig_frame, mode, frames_seen = V13.delisted_frame, {'drop': False}, []

    def delisted_frame(cal, series, relabel):
        res = V13B.f1d_frame(cal, series, V13.monday) if mode['drop'] else orig_frame(cal, series, relabel)
        frames_seen.append(('F1d' if mode['drop'] else ('F1w' if relabel else 'F1'), res[1], sorted(x['id'] for x in res[0])))
        return res
    V13.delisted_frame = delisted_frame
    s3 = json.load(open(os.path.join(root, 'docs/quant-recovery/v13c/s3-spx-3.0.0.json')))
    tmp = tempfile.mkdtemp(prefix='v13c-verify-')
    reports = {}
    for name, frames, links, drop, with_s3 in (('F1p_F1wp', 'F1,F1w', {'F1': 'F1p', 'F1w': 'F1wp'}, False, True), ('F1dp', 'F1', {'F1': 'F1dp'}, True, False)):
        rr = os.path.join(tmp, name); os.makedirs(rr)
        os.symlink(os.path.abspath(a.f0manifest), os.path.join(rr, 'F0-source-manifest.json.gz'))
        for k, v in links.items(): os.symlink(os.path.join(os.path.abspath(a.private), v), os.path.join(rr, k))
        argv = [rr, root, a.series, os.path.join(tmp, name + '.json'), '--frames', frames, '--pvalues', frames]
        if with_s3:
            f3 = os.path.join(tmp, 's3a.json'); json.dump({'replacedRows': s3['P5A']['stepA']['replacedRows']}, open(f3, 'w')); argv += ['--s3', f3]
        mode['drop'] = drop; sys.argv = ['verify_v13_studies.py'] + argv
        V13.main(); reports[name] = json.load(open(os.path.join(tmp, name + '.json')))
    # frame counts against the JS run meta (incl. the new chains)
    new_ids = set()
    r0 = json.load(open(os.path.join(root, 'docs/quant-recovery/v13/delisted/register-1.0.0.json'))); i0 = {c: i for i, c in enumerate(r0['columns'])}
    q0 = {x[i0['chainId']] for x in r0['rows'] if x[i0['status']] == 'QUALIFIED'}
    r1 = json.load(open(os.path.join(root, REG110))); i1 = {c: i for i, c in enumerate(r1['columns'])}
    new_ids = {'dl_' + x[i1['chainId']] for x in r1['rows'] if x[i1['status']] == 'QUALIFIED' and x[i1['chainId']] not in q0}
    par.eq(len(new_ids), 13, 'newChains')
    js = {f: json.load(open(os.path.join(a.private, f, 'run-meta-v13c.json'))) for f in ('F1p', 'F1wp', 'F1dp')}
    seen = {k: (c, ids) for k, c, ids in frames_seen}
    for f, k in (('F1p', 'F1'), ('F1wp', 'F1w'), ('F1dp', 'F1d')):
        c, ids = seen[k]
        par.eq(c['added'], js[f]['delisted']['added'], f + ':added')
        par.eq(sorted(set(ids) & new_ids), js[f]['delisted']['newChains']['addedIds'], f + ':newAdded')
    # ---------- S3': step B (SPX terminal values) ----------
    spx = json.load(open(os.path.join(root, 'docs/quant-recovery/v13b/hist/spx-terminal-register-1.0.0.json')))
    rev = json.load(open(os.path.join(root, 'docs/quant-recovery/v13b/hist/spx-terminal-review-1.0.0.json')))
    flagged = {(f['t0'], int(f['cik'])) for f in rev['register_1.0.0']['flagged']}
    usable = [r for r in spx['rows'] if r['status'] in ('TERMINAL_CASH', 'TERMINAL_STOCK', 'TERMINAL_MIXED') and r['keyHash16'] != FIRST_DATA and (r['t0'], int(r['cik'])) not in flagged]
    par.eq(len(usable), 28, 's3:usable')
    jsB = s3['P5A']['stepB']['replacedRows'] + s3['EARLY']['stepB']['replacedRows']
    par.eq(sorted((r['t0'], r['keyHash16']) for r in usable), sorted((r['t0'], r['keyHash16']) for r in jsB), 's3:usableKeys')
    jb = {(r['t0'], r['keyHash16']): r for r in jsB}
    pop = json.load(gzip.open(os.path.join(root, 'docs/quant-recovery/v12/spxpop/population-1.1.1.json.gz')))
    names = pop['columns']['status']; per = {p['t0']: p for p in pop['periods'] if p['fund'] == 'SPY' and p['cols'] is not None}
    delta = collections.defaultdict(lambda: {'ZERO': [0.0, 0.0], 'LOWER': [0.0, 0.0]})
    for r in usable:
        p = per[r['t0']]; c = p['cols']; bnd = {x[0]: x for x in c['bnd']}
        hits = [i for i, ci in enumerate(c['chain']) if pop['chains'][ci][1][:16] == r['keyHash16'] and pop['chains'][ci][3] is not None and int(pop['chains'][ci][3]) == int(r['cik']) and c['w'][i] == round(r['weight'] * 1e8)]
        par.eq(len(hits), 1, 's3:match:' + r['t0'] + ':' + r['keyHash16'])
        if len(hits) != 1: continue
        i = hits[0]; st = names[c['status'][i]] if isinstance(c['status'][i], int) else c['status'][i]
        par.eq(st.startswith('BOUNDED_EXIT'), True, 's3:bounded:' + r['keyHash16'])
        j = jb[(r['t0'], r['keyHash16'])]
        par.near(round(r['return'], 4), j['documented'], 's3:return:' + r['keyHash16'], abs_=1e-9)
        if j['state'] != 'REPLACED': continue
        ret = None if c['ret'][i] is None else c['ret'][i] / 1e6
        zero = 0.0 if ret is None else ret
        lower = (None if bnd[i][1] is None else bnd[i][1] / 1e6) if i in bnd else ret
        n, wsum, w = len(c['chain']), sum(c['w']) / 1e8, c['w'][i] / 1e8
        for sc, before in (('ZERO', zero), ('LOWER', lower)):
            par.near(before, j['beforeZero' if sc == 'ZERO' else 'beforeLower'], 's3:before:' + sc + ':' + r['keyHash16'], abs_=6e-5)
            delta[r['t0']][sc][0] += (r['return'] - before) / n; delta[r['t0']][sc][1] += w * (r['return'] - before) / wsum
    tables = {x['t0']: x for x in s3['EARLY']['periodTable'] + s3['P5A']['periodTableStepB']}
    for t, dd in delta.items():
        for sc in ('ZERO', 'LOWER'):
            tb = tables[t]
            par.near(dd[sc][0], tb['EW_ALL'][sc]['B'] - tb['EW_ALL'][sc]['A'], f's3:dEW:{t}:{sc}', abs_=2.5e-6)
            par.near(dd[sc][1], tb['CW_ALL'][sc]['B'] - tb['CW_ALL'][sc]['A'], f's3:dCW:{t}:{sc}', abs_=2.5e-6)
    # ---------- S3': step A on the EARLY span (register 1.1.0 chains, V13 O6 rule) ----------
    sq = load_delisted(root, a.series, par, 'QUALIFIED'); by_cik = collections.defaultdict(list)
    for sid, s in sq.items(): by_cik[int(s['cik'])].append((sid, s))
    got = {}
    for t, p in per.items():
        if not ('1995-12-31' <= t and p['t1'] <= '2009-09-30'): continue
        c = p['cols']
        for k, ci in enumerate(c['chain']):
            st = names[c['status'][k]] if isinstance(c['status'][k], int) else c['status'][k]; cik = pop['chains'][ci][3]
            if not st.startswith('BOUNDED_EXIT') or not cik: continue
            lim = (D(p['t1']) + datetime.timedelta(days=120)).isoformat()
            hits = sorted([(sid, s) for sid, s in by_cik.get(int(cik), []) if t <= s['lastTradeDate'] <= lim], key=lambda x: (abs((D(x[1]['lastTradeDate']) - D(p['t1'])).days), x[0]))
            if not hits: continue
            sid, s = hits[0]; dates = [x[0] for x in s['points']]; cl = [x[1] for x in s['points']]
            k0 = max([i for i, d in enumerate(dates) if d <= t], default=-1)
            if k0 < 0 or (D(t) - D(dates[k0])).days > 7: continue
            k1 = max([i for i, d in enumerate(dates) if d <= p['t1']], default=-1)
            if k1 >= k0 and (D(p['t1']) - D(dates[k1])).days <= 7: rs = [cl[k1] / cl[k0] - 1] * 3
            elif dates[-1] >= p['t1']: continue
            else: rs = [(cl[-1] / cl[k0]) * (1 + x) - 1 for x in SCEN[s['terminal']['class']]]
            got[(t, int(cik), sid)] = rs
    jea = s3['EARLY']['stepA']['replacedRows']
    par.eq(sorted(got), sorted((x['t0'], int(x['cik']), x['chainId']) for x in jea), 's3:earlyA:keys')
    for x in jea:
        rs = got.get((x['t0'], int(x['cik']), x['chainId']))
        if rs:
            for j, nm in enumerate(('afterS0', 'afterS1', 'afterS2')): par.near(round(rs[j], 4), x[nm], 's3:earlyA:' + nm, abs_=1.5e-4)
    sub = {k: {kk: v[kk] for kk in ('state', 'checks', 'failures', 'maxRelativeDifference', 'seconds', 'frames', 'pValuesChecked', 'firstFailures') if kk in v} for k, v in reports.items()}
    fails = par.fail + [x for v in reports.values() for x in v.get('firstFailures', [])]
    total = par.checks + sum(v['checks'] for v in reports.values())
    nfail = len(par.fail) + sum(v['failures'] for v in reports.values())
    report = dict(schemaVersion='v13c-python-check-3.0.0', implementation='independent stdlib Python: V13 verifier + V13b F1d frame imported by path, new register-1.1.0 binding and S3-prime checks',
                  binding=binding, v13VerifierPasses=sub, s3=dict(usable=len(usable), stepBReplacedChecked=sum(1 for r in jsB if r['state'] == 'REPLACED'), earlyStepA=len(got),
                  scenariosRecomputed=['ZERO', 'LOWER'], note='FATE/UPPER step-B deltas not recomputed (they need the V12 takeover premium); covered by the identical replacement logic'),
                  checks=total, failures=nfail, firstFailures=[list(map(str, x)) for x in fails[:40]], maxRelativeDifference=max([par.max_rel] + [v['maxRelativeDifference'] for v in reports.values()]),
                  seconds=round(time.time() - t0, 1), state='PASS' if nfail == 0 else 'FAIL')
    json.dump(report, open(a.out, 'w'), indent=1)
    print(json.dumps({k: report[k] for k in ('state', 'checks', 'failures', 'seconds')}))


if __name__ == '__main__':
    main()
