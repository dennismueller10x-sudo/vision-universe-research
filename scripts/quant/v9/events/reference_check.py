#!/usr/bin/env python3
"""V9 events: independent Python (stdlib) reference.

Re-derives from raw inputs (population.json facts re-checked against the security master,
sec-ledger.json, header-parity.json, daily series, SPY, market-calendar.json, registration):
listing guards, original Item 2.02 events, placebo controls, XNYS session closes (zoneinfo),
entry/exit selection, gross/net returns, SPY returns, abnormal returns, endpoint rows,
two-way cluster SEs, normal p-values, Holm and the circular calendar-block bootstrap.
Only AFTER computing everything does it read the JS outputs and report parity.
Does not import or execute any JS engine code.
Usage: python3 -I reference_check.py --priv <privateDir> --evidence <evidenceDir>
"""
import argparse, datetime, hashlib, json, math, pathlib, zoneinfo

ROOT = pathlib.Path(__file__).resolve().parents[4]
ET = zoneinfo.ZoneInfo('America/New_York')
UTC = datetime.timezone.utc
HARVEST_FROM = '2025-08-15'
WINDOW_FROM_UTC = '2025-09-30T20:00:00.000Z'
MIC = {'NYSE': 'XNYS', 'NASDAQ': 'XNAS', 'AMEX': 'XASE', 'NYSE MKT': 'XASE'}
SEC_EX = {'NYSE': 'NYSE', 'AMEX': 'NYSE', 'NYSE MKT': 'NYSE', 'NASDAQ': 'Nasdaq'}
HORIZONS = (1, 5, 20)
K, SEED, EXCL = 2, 'V9-EVENTS-CONTROL-1', 10
SIDE = (10 + 5) / 10000


def sha(b):
    return hashlib.sha256(b if isinstance(b, bytes) else b.encode()).hexdigest()


def iso(dt):
    return dt.astimezone(UTC).strftime('%Y-%m-%dT%H:%M:%S.') + '%03dZ' % (dt.microsecond // 1000)


def sessions(cal):
    x = cal['exchanges']['XNYS']
    hol = set(x['holidays']); early = x['earlyCloses']; reg = x['sessions']['REGULAR']
    out = []
    d = datetime.date(2025, 7, 1)
    while d <= datetime.date(2027, 6, 30):
        ds = d.isoformat()
        if d.isoweekday() in x['weekdays'] and ds not in hol:
            def at(hhmm):
                h, m = map(int, hhmm.split(':'))
                return datetime.datetime(d.year, d.month, d.day, h, m, tzinfo=ET)
            out.append(dict(date=ds, open=iso(at(reg['start'])), close=iso(at(early.get(ds, reg['end'])))))
        d += datetime.timedelta(days=1)
    return out


def two_way(rows):
    if not rows:
        return None
    vals = [r['value'] for r in rows]
    mean = sum(vals) / len(vals)
    N = len(rows)

    def cv(key):
        g = {}
        for r in rows:
            k = key(r); s = g.setdefault(k, [0.0, 0]); s[0] += r['value']; s[1] += 1
        G = len(g)
        if G <= 1:
            return G, None
        acc = 0.0
        for s in g.values():
            acc += (s[0] - s[1] * mean) ** 2
        return G, G / (G - 1) * acc / N ** 2
    gt, t = cv(lambda r: r['timeCluster']); gi, i = cv(lambda r: r['issuerId']); gx, x = cv(lambda r: json.dumps([r['issuerId'], r['timeCluster']], separators=(',', ':')))
    v = t + i - x if None not in (t, i, x) else None
    se = math.sqrt(v) if v is not None and v >= 0 else None
    z = mean / se if se else None
    return dict(n=N, mean=mean, standardError=se, z=z, pValue=None if z is None else math.erfc(abs(z) / math.sqrt(2)), timeClusters=gt, issuerClusters=gi, intersectionClusters=gx)


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: (ps[i], i)); adj = [0.0] * len(ps); prev = 0.0
    for rank, i in enumerate(order):
        prev = max(prev, min(1.0, (len(ps) - rank) * ps[i])); adj[i] = prev
    return adj


def block_bootstrap(calendar, obs, block=20, reps=9999, seed=20261027, alpha=0.05):
    n = len(calendar); idx = {d: k for k, d in enumerate(calendar)}
    sums = [0.0] * n; cnt = [0] * n
    for o in obs:
        k = idx[o['date']]; sums[k] += o['value']; cnt[k] += 1
    est = 0.0
    for v in sums:
        est += v
    est = est / len(obs)
    ps, pc = [0.0], [0]
    for k in range(2 * n):
        ps.append(ps[k] + sums[k % n]); pc.append(pc[k] + cnt[k % n])
    s = seed; M = 0xFFFFFFFF; boot = []
    for _ in range(reps):
        tot = 0.0; c = 0; used = 0
        while used < n:
            s ^= (s << 13) & M; s ^= s >> 17; s ^= (s << 5) & M; s &= M
            start = math.floor(s / 4294967296 * n); ln = min(block, n - used)
            tot += ps[start + ln] - ps[start]; c += pc[start + ln] - pc[start]
            used += block
        boot.append(tot / c)
    srt = sorted(boot)

    def q(p):
        kk = (len(srt) - 1) * p; i = math.floor(kk)
        return srt[i] + (srt[min(i + 1, len(srt) - 1)] - srt[i]) * (kk - i)
    tails = sum(1 for v in boot if abs(v - est) >= abs(est))
    return dict(estimate=est, pValue=(1 + tails) / (reps + 1), ci=[2 * est - q(1 - alpha / 2), 2 * est - q(alpha / 2)])


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--priv', required=True); ap.add_argument('--evidence', required=True); a = ap.parse_args()
    priv = pathlib.Path(a.priv).resolve(); evd = pathlib.Path(a.evidence).resolve()
    reg = json.loads((ROOT / 'docs/quant-recovery/v9/events/registration-retrospective-1.0.0.json').read_text())
    asof = reg['engineContract']['asOf']; asof_end = asof + 'T23:59:59.999Z'
    pop = json.loads((priv / 'population.json').read_text()); led = json.loads((priv / 'sec-ledger.json').read_text()); hdr = json.loads((priv / 'header-parity.json').read_text())
    master = json.loads((ROOT / 'quant/data/market/security-master/us-security-master.json').read_text())
    cal = json.loads((ROOT / 'quant/config/market-calendar.json').read_text())
    spy = json.loads((ROOT / 'quant/data/market/discover-series/ref_SPY.json').read_text())
    true_utc = hdr['conclusion'] == 'SUBMISSIONS_ACCEPTANCE_IS_TRUE_UTC'
    assert hdr['conclusion'] in ('SUBMISSIONS_ACCEPTANCE_IS_TRUE_UTC', 'SUBMISSIONS_ACCEPTANCE_IS_EASTERN_LABELED_Z')

    def to_utc(raw):
        dt = datetime.datetime.strptime(raw[:19], '%Y-%m-%dT%H:%M:%S')
        return iso(dt.replace(tzinfo=UTC if true_utc else ET))
    ext = sessions(cal); ext_idx = {s['date']: i for i, s in enumerate(ext)}

    def session_after(u):
        for i, s in enumerate(ext):
            if s['close'] > u:
                return i
        raise SystemExit('CAL_EXHAUSTED')
    calendar = [d for d, _ in spy['points'] if d <= asof]
    assert calendar == [s['date'] for s in ext if calendar[0] <= s['date'] <= asof], 'calendar'
    cal_idx = {d: i for i, d in enumerate(calendar)}
    spy_c = {d: c for d, c in spy['points']}
    # ---- master re-check of population facts ----
    mrows = {}
    for r in master['rows']:
        if r.get('baseline_security_id'):
            mrows.setdefault(r['baseline_security_id'], []).append(r)
    pop_by = {r['securityId']: r for r in pop['rows']}
    master_disagree = 0
    for r in pop['rows']:
        m = mrows.get(r['securityId'], [])
        ok = len(m) == 1 and m[0]['instrument_type'] == 'EQUITY_COMMON' and m[0]['eligible_us_equity'] is True and m[0]['primary_listing'] is True and m[0]['exchange'] in MIC and m[0]['ticker'] == r['ticker']
        expected = ok and r.get('weekly') == 'QUALIFIED'
        if r['eligible'] and not expected:
            master_disagree += 1
    # ---- listing guards ----
    by_cik_f = {}
    for f in led['filings']:
        by_cik_f.setdefault(str(f['cik']), []).append(f)
    stage = []
    for L in led['listings']:
        p = pop_by[L['securityId']]; m = mrows[L['securityId']][0]; cik = str(L['cik']); iss = led['issuers'].get(cik)
        if SEC_EX.get(m['exchange']) != L['secExchange']:
            continue
        if not iss or iss['state'] != 'OK' or iss['formerNamesInWindow']:
            continue
        tick = [t.upper().replace('.', '-') for t in (iss['tickers'] or [])]
        t0 = L['ticker'].upper().replace('.', '-')
        if t0 not in tick or p['dailyFrom'] < m['start_date']:
            continue
        doc = json.loads((ROOT / p['dailyPath']).read_bytes())
        pts = [(d, c) for d, c in doc['points'] if d <= asof]
        if not pts or any(d not in cal_idx for d, _ in pts):
            continue
        stage.append(dict(securityId=L['securityId'], ticker=L['ticker'], cik=cik, rank=tick.index(t0), listingId=m['canonical_id'], start=m['start_date'], pts=pts))
    groups = {}
    for s in stage:
        groups.setdefault(s['cik'], []).append(s)
    retained = []
    for cik, g in groups.items():
        g.sort(key=lambda s: (s['rank'], s['ticker']))
        s = g[0]
        if any(f['form'] == '8-K' and f['item202'] and f['acceptanceDateTimeRaw'][:10] >= HARVEST_FROM and to_utc(f['acceptanceDateTimeRaw']) <= asof_end for f in by_cik_f.get(cik, [])):
            retained.append(s)
    retained.sort(key=lambda s: s['securityId'])
    bars = {}
    for s in retained:
        bars[s['listingId']] = [dict(date=d, close=c, closeAt=ext[ext_idx[d]]['close']) for d, c in s['pts']]
    bmap = {lid: {b['date']: b['close'] for b in bs} for lid, bs in bars.items()}
    # ---- events ----
    events, item_sess = [], {}
    for s in retained:
        cand, idxs = [], []
        for f in by_cik_f.get(s['cik'], []):
            if not f['item202']:
                continue
            u = to_utc(f['acceptanceDateTimeRaw']); si = session_after(u); idxs.append(si)
            if f['form'] != '8-K' or u <= WINDOW_FROM_UTC or u > asof_end:
                continue
            cand.append((u, f['accession'], si, f))
        item_sess[s['listingId']] = idxs
        cand.sort(key=lambda c: (c[0], c[1])); seen = set()
        for u, acc, si, f in cand:
            if si in seen:
                continue
            seen.add(si)
            events.append(dict(eventId='EVT|' + s['cik'].zfill(10) + '|' + acc, listingId=s['listingId'], issuerId='CIK' + s['cik'].zfill(10), availableAt=u, entryIdx=si, start=s['start']))
    events.sort(key=lambda e: (e['availableAt'], e['eventId']))
    starts = {s['listingId']: s['start'] for s in retained}
    controls = []
    for e in events:
        si = e['entryIdx']; E = ext[si]['date']; P = ext[si - 1]['date']; cands = []
        for s in retained:
            lid = s['listingId']
            if lid == e['listingId'] or E not in bmap[lid] or P not in bmap[lid]:
                continue
            if any(abs(j - si) <= EXCL for j in item_sess[lid]):
                continue
            cands.append((sha(SEED + '|' + e['eventId'] + '|' + lid), lid))
        cands.sort()
        for k, (_, lid) in enumerate(cands[:K]):
            controls.append(dict(eventId='CTRL|' + e['eventId'] + '|' + str(k), parent=e['eventId'], listingId=lid, availableAt=e['availableAt'], entryIdx=si, start=starts[lid]))

    # ---- outcomes ----
    def outcome(row, h):
        bs = bars[row['listingId']]; av = row['availableAt']
        ent = next((i for i, b in enumerate(bs) if b['closeAt'] > av), None)
        if ent is None:
            return dict(state='CENSORED' if any(d > av[:10] and d <= asof for d in calendar) else 'IMMATURE')
        if row['start'] > av[:10]:
            return dict(state='INELIGIBLE')
        ex = ent + h
        if ex >= len(bs):
            ci = cal_idx[bs[ent]['date']] + h
            return dict(state='CENSORED' if ci < len(calendar) and calendar[ci] <= asof else 'IMMATURE', entryDate=bs[ent]['date'])
        path = bs[ent:ex + 1]
        if any(cal_idx[path[k]['date']] != cal_idx[path[k - 1]['date']] + 1 for k in range(1, len(path))):
            return dict(state='CENSORED')
        a, z = bs[ent]['close'], bs[ex]['close']
        st = 'OBSERVED' if bs[ent]['date'] == ext[row['entryIdx']]['date'] else 'ENTRY_SESSION_GAP'
        ea, ez = bs[ent]['date'], bs[ex]['date']
        br = spy_c[ez] / spy_c[ea] - 1 if ea in spy_c and ez in spy_c else None
        net = z / a * (1 - SIDE) / (1 + SIDE) - 1
        if br is None and st == 'OBSERVED':
            st = 'BENCHMARK_MISSING'
        return dict(state=st, entryDate=ea, exitDate=ez, gross=z / a - 1, net=net, bench=br, ar=None if br is None else (z / a - 1) - br, excess=None if br is None else net - br)
    per, fam, rowsets = {}, [], {}
    out_rows = {}
    for h in HORIZONS:
        oc = {r['eventId']: outcome(r, h) for r in events + controls}
        out_rows[h] = oc
        byp = {}
        for c in controls:
            byp.setdefault(c['parent'], []).append(c['eventId'])
        A, B, D = [], [], []
        for e in events:
            x = oc[e['eventId']]
            if x['state'] != 'OBSERVED':
                continue
            cs = [oc[c] for c in byp.get(e['eventId'], []) if oc[c]['state'] == 'OBSERVED']
            base = dict(eventId=e['eventId'], timeCluster=x['entryDate'], issuerId=e['issuerId'], date=x['entryDate'])
            B.append(dict(base, value=x['excess']))
            if not cs:
                continue
            sa = 0.0
            for c in cs:
                sa += abs(c['ar'])
            ss = 0.0
            for c in cs:
                ss += c['ar']
            A.append(dict(base, value=abs(x['ar']) - sa / len(cs))); D.append(dict(base, value=x['ar'] - ss / len(cs)))
        rowsets[h] = (A, B)
        per[h] = dict(A=two_way(A), B=two_way(B), diff=two_way(D), bootA=block_bootstrap(calendar, A), bootB=block_bootstrap(calendar, B),
                      states={g: {} for g in ('EVENT', 'CONTROL')})
        for rid, x in oc.items():
            g = 'CONTROL' if rid.startswith('CTRL|') else 'EVENT'; per[h]['states'][g][x['state']] = per[h]['states'][g].get(x['state'], 0) + 1
    # ---- pre-entry diagnostic (events, and controls on the parent's window) ----
    ctrl_of = {}
    for c in controls:
        ctrl_of.setdefault(c['parent'], []).append(c)
    pre = {b: [] for b in ('PRE_OPEN', 'REGULAR', 'POST_CLOSE', 'NON_SESSION_DAY')}; prec = {b: [] for b in pre}; bucket_of = {}
    for e in events:
        u = datetime.datetime.strptime(e['availableAt'][:19], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=UTC)
        d_et = u.astimezone(ET).date().isoformat(); s_ = ext[ext_idx[d_et]] if d_et in ext_idx else None
        b = 'NON_SESSION_DAY' if not s_ else 'PRE_OPEN' if e['availableAt'] < s_['open'] else 'REGULAR' if e['availableAt'] < s_['close'] else 'POST_CLOSE'
        bucket_of[e['eventId']] = b
        E, P = ext[e['entryIdx']]['date'], ext[e['entryIdx'] - 1]['date']
        for lid, tgt in [(e['listingId'], pre)] + [(c['listingId'], prec) for c in ctrl_of.get(e['eventId'], [])]:
            bm = bmap[lid]
            if E in bm and P in bm and E in spy_c and P in spy_c:
                tgt[b].append(bm[E] / bm[P] - 1 - (spy_c[E] / spy_c[P] - 1))
    ps = [per[h][ep]['pValue'] for ep in ('A', 'B') for h in HORIZONS]
    adj = holm(ps)
    # ---- parity against JS (read only now) ----
    js = json.loads((evd / 'results-retrospective-1.0.0.json').read_text())
    ref = json.loads((priv / 'run' / 'events-for-reference.json').read_text())
    checks, fails = 0, []

    def close(name, a_, b_, rel=1e-9, abs_=1e-12):
        nonlocal checks
        checks += 1
        if a_ is None or b_ is None:
            if a_ is not b_:
                fails.append((name, a_, b_))
            return
        if isinstance(a_, str) or isinstance(b_, str) or isinstance(a_, bool):
            if a_ != b_:
                fails.append((name, a_, b_))
            return
        if abs(a_ - b_) > max(abs_, rel * max(abs(a_), abs(b_))):
            fails.append((name, a_, b_))
    close('eventIds', json.dumps([e['eventId'] for e in events]), json.dumps([e['eventId'] for e in ref['events']]))
    close('controlIds', json.dumps([(c['eventId'], c['listingId']) for c in controls]), json.dumps([(c['eventId'], c['listingId']) for c in ref['controls']]))
    close('listingIds', json.dumps(sorted(bars)), json.dumps(sorted(l['listingId'] for l in ref['listings'])))
    close('acceptanceUtc', json.dumps([e['availableAt'] for e in events]), json.dumps([e['acceptanceUtc'] for e in ref['events']]))
    close('entrySessions', json.dumps([ext[e['entryIdx']]['date'] for e in events]), json.dumps([e['entrySession'] for e in ref['events']]))
    row_checks = 0
    for h in HORIZONS:
        eng = json.loads((priv / 'run' / f'engine-result-h{h}.json').read_text())
        for x in eng['events']:
            r = out_rows[h][x['eventId']]
            st = x['state']
            if st == 'OBSERVED':
                st = 'OBSERVED' if r['state'] in ('OBSERVED', 'ENTRY_SESSION_GAP', 'BENCHMARK_MISSING') else st
            close(f'state h{h} {x["eventId"]}', st if st != 'OBSERVED' else 'OBSERVED', 'OBSERVED' if r['state'] in ('OBSERVED', 'ENTRY_SESSION_GAP', 'BENCHMARK_MISSING') else r['state'])
            if x['state'] == 'OBSERVED':
                row_checks += 1
                close(f'entry h{h} {x["eventId"]}', x['entryDate'], r['entryDate']); close(f'exit h{h} {x["eventId"]}', x['exitDate'], r['exitDate'])
                close(f'gross h{h} {x["eventId"]}', x['grossReturn'], r['gross'], rel=0); close(f'net h{h} {x["eventId"]}', x['netReturn'], r['net'], rel=0)
                close(f'bench h{h} {x["eventId"]}', x['benchmarkReturn'], r['bench'], rel=0); close(f'excess h{h} {x["eventId"]}', x['benchmarkExcess'], r['excess'], rel=0)
        P = js['perHorizon'][str(h)]
        for ep, key in (('A', 'A'), ('B', 'B')):
            ji, pi = P[ep]['inference'], per[h][key]
            for f in ('n', 'mean', 'standardError', 'z', 'pValue', 'timeClusters', 'issuerClusters', 'intersectionClusters'):
                close(f'{ep}{h}.{f}', ji[f], pi[f])
            jb, pb = P[ep]['bootstrap'], per[h]['boot' + key]
            close(f'{ep}{h}.boot.estimate', jb['estimate'], pb['estimate']); close(f'{ep}{h}.boot.p', jb['pValue'], pb['pValue']); close(f'{ep}{h}.boot.ci0', jb['ci'][0], pb['ci'][0]); close(f'{ep}{h}.boot.ci1', jb['ci'][1], pb['ci'][1])
        close(f'diff{h}.mean', P['eventMinusControlSignedAR']['mean'], per[h]['diff']['mean']); close(f'diff{h}.se', P['eventMinusControlSignedAR']['standardError'], per[h]['diff']['standardError'])
        for g in ('EVENT', 'CONTROL'):
            close(f'states{h}{g}', json.dumps(js['stateCounts'][str(h)][g], sort_keys=True), json.dumps(per[h]['states'][g], sort_keys=True))
    for b in pre:
        for nm, src, key in (('events', pre, 'byBucket'), ('controls', prec, 'controlsByBucketPostRegistrationDiagnostic')):
            jsb = js['preEntryMoveMarketAdjusted'][key][b]; xs = src[b]
            close(f'pre.{nm}.{b}.n', jsb['n'], len(xs))
            if xs:
                close(f'pre.{nm}.{b}.meanAbs', jsb['meanAbs'], sum(abs(v) for v in xs) / len(xs)); close(f'pre.{nm}.{b}.mean', jsb['mean'], sum(xs) / len(xs))
    for i, f in enumerate(js['holmFamily']):
        close('holm.' + f['endpoint'], f['holm'], adj[i])
    report = dict(schemaVersion='v9-events-parity-1.0.0', codeSha256=sha((pathlib.Path(__file__)).read_bytes()), inputs=dict(population=sha((priv / 'population.json').read_bytes()), ledger=sha((priv / 'sec-ledger.json').read_bytes()), header=sha((priv / 'header-parity.json').read_bytes()), jsResults=sha((evd / 'results-retrospective-1.0.0.json').read_bytes())),
                  tolerance='returns/excess abs 1e-12; statistics max(1e-12 abs, 1e-9 rel); ids/dates/states exact', populationMasterRecheckDisagreements=master_disagree,
                  counts=dict(retainedListings=len(bars), events=len(events), controls=len(controls), observedRowComparisons=row_checks, checks=checks, failures=len(fails)),
                  reference=dict((str(h), dict(A=per[h]['A'], B=per[h]['B'], bootA=per[h]['bootA'], bootB=per[h]['bootB'])) for h in HORIZONS), holm=adj,
                  firstFailures=[list(map(str, f)) for f in fails[:20]], result='PASS' if not fails and master_disagree == 0 else 'FAIL',
                  scope='Same-data computational parity in a second language; not an independent holdout. Weekly qualification flag taken from population.json (not re-derived).')
    (evd / 'parity-1.0.0.json').write_text(json.dumps(report, indent=1) + '\n')
    print(json.dumps(dict(report['counts'], result=report['result'], master=master_disagree, firstFailures=report['firstFailures'][:5])))


if __name__ == '__main__':
    main()
