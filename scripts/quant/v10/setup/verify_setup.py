#!/usr/bin/env python3
"""V10 SETUP: unabhaengige Python-Gegenrechnung (nur Standardbibliothek, Aufruf mit python3 -I).

Rechnet aus Rohdaten neu (kein JS-Code portiert, keine JS-Zwischenstaende als Eingabe ausser den zu pruefenden Zahlen):
  1. NYSE-Kalender (eigene Regeln) gegen SPY-Tagesdaten 1998-2026 und Reifedaten M3/M6 aller Original-Ereignisdaten
  2. Original-Ereignisse aus den veroeffentlichten Staenden, rho (taeglich, 126 Sitzungen), N_eff (Modell V9)
  3. Rekonstruktion: Ereignisse aus Replay-Zeilen + Wochenschluessen (discover-series-long direkt gelesen),
     Ausgaenge aller Zellen (Einstieg naechste Woche), Stichprobenvergleich je Ereignis, N_eff der Hauptzellen
  4. Projektion: fruehestes Erfuellungsdatum des empfohlenen Gates (N_eff >= 50, >= 4 disjunkte M6-Fenster)
Schreibt nur --out.
"""
import argparse, collections, datetime as dt, gzip, hashlib, json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
DOCS = 'docs/quant-recovery/v10/setup'
P = lambda p: os.path.join(ROOT, p)
D = dt.date.fromisoformat


def jload(p):
    with (gzip.open(P(p), 'rt') if p.endswith('.gz') else open(P(p))) as f:
        return json.load(f)


def sha(p):
    return hashlib.sha256(open(P(p), 'rb').read()).hexdigest()


# ---------- 1. Kalender ----------
SPECIAL = {'2001-09-11', '2001-09-12', '2001-09-13', '2001-09-14', '2004-06-11', '2007-01-02', '2012-10-29', '2012-10-30', '2018-12-05', '2025-01-09'}


def easter(y):  # Gauss / Lichtenberg-Formel (andere Herleitung als im JS-Modul)
    k = y // 100; m = 15 + (3 * k + 3) // 4 - (8 * k + 13) // 25; s = 2 - (3 * k + 3) // 4
    a = y % 19; d = (19 * a + m) % 30; r = (d + a // 11) // 29; og = 21 + d - r
    sz = 7 - (y + y // 4 + s) % 7; oe = 7 - (og - sz) % 7; os_ = og + oe
    return dt.date(y, 3, 1) + dt.timedelta(days=os_ - 1)


def holidays(y):
    def nth(month, wd, n):
        d0 = dt.date(y, month, 1); return d0 + dt.timedelta(days=(wd - d0.weekday()) % 7 + 7 * (n - 1))

    def last(month, wd):
        d0 = (dt.date(y, month + 1, 1) if month < 12 else dt.date(y + 1, 1, 1)) - dt.timedelta(days=1); return d0 - dt.timedelta(days=(d0.weekday() - wd) % 7)

    def obs(d, sat=True):
        if d.weekday() == 5: return d - dt.timedelta(days=1) if sat else None
        if d.weekday() == 6: return d + dt.timedelta(days=1)
        return d
    h = {obs(dt.date(y, 1, 1), False), nth(1, 0, 3), nth(2, 0, 3), easter(y) - dt.timedelta(days=2), last(5, 0), obs(dt.date(y, 7, 4)), nth(9, 0, 1), nth(11, 3, 4), obs(dt.date(y, 12, 25))}
    if y >= 2022: h.add(obs(dt.date(y, 6, 19)))
    h.discard(None)
    return {x.isoformat() for x in h}


_hc = {}


def is_session(d):
    if d.weekday() >= 5: return False
    if d.year not in _hc: _hc[d.year] = holidays(d.year)
    s = d.isoformat(); return s not in _hc[d.year] and s not in SPECIAL


def next_session(s):
    d = D(s) + dt.timedelta(days=1)
    while not is_session(d): d += dt.timedelta(days=1)
    return d.isoformat()


def add_sessions(s, n):
    for _ in range(n): s = next_session(s)
    return s


def check_calendar():
    spy = [p[0] for p in jload('quant/data/market/multi-asset/series/SPY.json')['points'] if p[0] >= '1998-01-02']
    d, end, cal = D(spy[0]), D(spy[-1]), []
    while d <= end:
        if is_session(d): cal.append(d.isoformat())
        d += dt.timedelta(days=1)
    return {'sessions': len(cal), 'spySessions': len(spy), 'equal': cal == spy}


# ---------- 2. Original ----------
RANK = {'NO_SETUP': 0, 'WATCH': 1, 'SETUP_FORMING': 2, 'CONFIRMED': 3}


def kind_of(a, b):
    if a not in RANK or b not in RANK or a == b: return None
    if b == 'CONFIRMED': return 'SETUP_CONFIRMED'
    if b == 'SETUP_FORMING' and RANK[a] < 2: return 'SETUP_NEW'
    if RANK[a] >= 2 and RANK[b] < RANK[a]: return 'SETUP_WEAKENED'
    return None


def mean_corr(cols):
    n, T = len(cols), len(cols[0]); s = [0.0] * T
    for c in cols:
        m = sum(c) / T; sd = math.sqrt(sum((x - m) ** 2 for x in c) / T)
        for t in range(T): s[t] += (c[t] - m) / sd
    return (sum(x * x for x in s) / T - n) / (n * (n - 1))


def neff(events, rho, H):
    """events: Liste (titel, position). Direkte Doppelsumme ueber Positionspaare mit Titelzaehlern."""
    by = collections.defaultdict(collections.Counter)
    for t, p in events: by[p][t] += 1
    ps = sorted(by); tot = 0.0
    for i, a in enumerate(ps):
        ca = sum(by[a].values())
        for b in ps[i:]:
            if b - a >= H: break
            cb = sum(by[b].values()); same = sum(c * by[b][t] for t, c in by[a].items() if t in by[b])
            v = (H - (b - a)) / H * (rho * (ca * cb - same) + same)
            tot += v if a == b else 2 * v
    return len(events) ** 2 / tot


def original():
    hist = 'quant/data/product/setup-observation-history/setup-mapping-1.0.0'
    files = sorted(f for f in os.listdir(P(hist)) if f.endswith('.json.gz'))
    seq = collections.defaultdict(list)
    for f in files:
        s = jload(hist + '/' + f)
        for t, row in s['rows'].items(): seq[t].append((s['asOf'], row[0]))
    ev = []
    for t, lst in seq.items():
        for k in range(1, len(lst)):
            x = kind_of(lst[k - 1][1], lst[k][1])
            if x: ev.append((t, x, lst[k][0]))
    spydoc = jload('quant/data/market/discover-series/ref_SPY.json'); win = [p[0] for p in spydoc['points']][-127:]
    spy = dict(spydoc['points']); sr = [math.log(spy[win[i + 1]] / spy[win[i]]) for i in range(126)]
    raw, exc = [], []
    for t in sorted({e[0] for e in ev}):
        f = P('quant/data/market/discover-series/ref_%s.json' % t)
        if not os.path.exists(f): continue
        d = json.load(open(f))
        if d.get('grain') != 'daily' or d.get('dataMode') != 'real': continue
        m = dict(d['points'])
        if not all(x in m for x in win): continue
        r = [math.log(m[win[i + 1]] / m[win[i]]) for i in range(126)]; raw.append(r); exc.append([r[i] - sr[i] for i in range(126)])
    rho_raw, rho_exc = mean_corr(raw), mean_corr(exc)
    start = D('2026-09-01'); axis = {}
    d, i = start, 0
    while d <= D('2027-12-31'):
        if is_session(d): axis[d.isoformat()] = i; i += 1
        d += dt.timedelta(days=1)
    pos = lambda s: axis[next_session(s)]
    out = {}
    for k in ('ALL', 'ENTRY', 'SETUP_NEW', 'SETUP_CONFIRMED'):
        sub = [(t, pos(d)) for t, x, d in ev if k == 'ALL' or (x in ('SETUP_NEW', 'SETUP_CONFIRMED') if k == 'ENTRY' else x == k)]
        out[k] = {'n': len(sub), 'nEffRaw': neff(sub, rho_raw, 126), 'nEffSpyExcess': neff(sub, rho_exc, 126)}
    mat = {}
    for d0 in sorted({e[2] for e in ev}):
        e = next_session(d0); mat[d0] = {'entry': e, 'm3': add_sessions(e, 63), 'm6': add_sessions(e, 126)}
    return ev, {'rhoRaw': rho_raw, 'rhoSpyExcess': rho_exc, 'titles': len(raw)}, out, mat


# ---------- 3. Rekonstruktion ----------
def week_key(s):
    d = D(s); return (d - dt.timedelta(days=d.weekday())).isoformat()


def reconstruction(reg, res):
    pop = reg['registration']['population']; frame = pop['frameIds']
    loaded = list(frame) + pop['exclusions'].get('NON_MODAL_WEEK_LABEL', {}).get('ids', [])
    series = {i: dict(jload('quant/data/market/discover-series-long/%s.json' % i)['points']) for i in loaded}
    labels = collections.defaultdict(collections.Counter)
    for i in loaded:
        for d in series[i]: labels[week_key(d)][d] += 1
    modal = {k: sorted(c.items(), key=lambda x: (-x[1], [-ord(ch) for ch in x[0]]))[0][0] for k, c in labels.items()}
    cal = sorted(modal.values()); cidx = {d: i for i, d in enumerate(cal)}
    spy = dict(jload('quant/data/market/multi-asset/series/SPY.json')['points'])
    side = 0.0015
    lo, hi = '2005-01-01', '2025-12-31'
    exits = {'M3_TIME': ('T', 13), 'M6_TIME': ('T', 26), 'M6_INVALIDATION': ('I', 26), 'M6_TARGET': ('G', 26)}
    rows = []
    for i in frame:
        rep = jload('quant/data/product/setup-replay-v1/%s.json.gz' % i)['rows']; pts = sorted(series[i].items()); dates = [p[0] for p in pts]; closes = [p[1] for p in pts]
        di = {d: k for k, d in enumerate(dates)}
        for k in range(1, len(rep)):
            x = kind_of(rep[k - 1][1], rep[k][1]); s = rep[k][0]
            if x not in ('SETUP_NEW', 'SETUP_CONFIRMED') or not (lo <= s <= hi) or s not in di: continue
            j = di[s] + 1
            for name, (typ, H) in exits.items():
                if j >= len(dates) or j + H >= len(dates): rows.append((i, x, s, name, None, None, None, None, None)); continue
                if cidx.get(dates[j + H], -1) - cidx.get(dates[j], -9) != H or cidx[dates[j]] != cidx[s] + 1:
                    rows.append((i, x, s, name, 'GAP', None, None, None, None)); continue
                e, z, why = j, j + H, 'TIME_EXIT'
                thr = rep[k][2] if typ == 'I' else rep[k][3] if typ == 'G' else None
                if typ != 'T':
                    if not (isinstance(thr, (int, float)) and thr > 0): rows.append((i, x, s, name, 'LEVEL_MISSING', None, None, None, None)); continue
                    for q in range(e + 1, e + H):
                        if q + 1 >= len(dates): break
                        if (closes[q] < thr) if typ == 'I' else (closes[q] >= thr): z, why = q + 1, ('INVALIDATION_CLOSE' if typ == 'I' else 'TARGET_CLOSE'); break
                g = closes[z] / closes[e] - 1; b = spy[dates[z]] / spy[dates[e]] - 1 if dates[z] in spy and dates[e] in spy else None
                net = (1 + g) * (1 - side) / (1 + side) - 1
                rows.append((i, x, s, name, 'OBSERVED', dates[e], dates[z], why, (g, b, net)))
    # Zellen
    cells = {}
    for kind in ('SETUP_NEW', 'SETUP_CONFIRMED'):
        for name in exits:
            obs = [r for r in rows if r[1] == kind and r[3] == name and r[4] == 'OBSERVED' and r[8][1] is not None]
            ex = [r[8][2] - r[8][1] for r in obs]
            cells[kind + '|' + name] = {'n': len(obs), 'meanExcess': sum(ex) / len(ex) if ex else None, 'states': dict(collections.Counter(r[4] for r in rows if r[1] == kind and r[3] == name))}
    # Stichprobenvergleich
    js = {(r[0], r[1], r[2], r[3]): r for r in res['verificationSample']['rows']}
    mine = {(r[0], r[1], r[2], r[3]): r for r in rows}
    cmp = {'compared': 0, 'equal': 0, 'maxAbsDiffGross': 0.0, 'maxAbsDiffBenchmark': 0.0, 'mismatches': []}
    for key, j in js.items():
        m = mine.get(key); cmp['compared'] += 1
        ok = m is not None and m[4] == j[4] and m[5] == j[5] and m[6] == j[6] and m[7] == j[7]
        if ok and j[8] is not None:
            dg = abs(m[8][0] - j[8]); db = abs(m[8][1] - j[9]) if j[9] is not None and m[8][1] is not None else 0.0
            cmp['maxAbsDiffGross'] = max(cmp['maxAbsDiffGross'], dg); cmp['maxAbsDiffBenchmark'] = max(cmp['maxAbsDiffBenchmark'], db); ok = dg < 1e-8 and db < 1e-8
        if ok: cmp['equal'] += 1
        elif len(cmp['mismatches']) < 10: cmp['mismatches'].append({'js': j, 'python': None if m is None else [m[4], m[5], m[6], m[7], m[8]]})
    # N_eff Hauptzellen (Wochenachse, rho aus Titeln mit voller Abdeckung des Studienkalenders)
    scal = [d for d in cal if lo <= d <= hi]
    sr = [math.log(spy[scal[t + 1]] / spy[scal[t]]) for t in range(len(scal) - 1)]
    rawc, excc = [], []
    for i in frame:
        s = series[i]
        if all(d in s for d in scal):
            r = [math.log(s[scal[t + 1]] / s[scal[t]]) for t in range(len(scal) - 1)]; rawc.append(r); excc.append([r[t] - sr[t] for t in range(len(r))])
    rr, re_ = mean_corr(rawc), mean_corr(excc)
    neffs = {}
    for kind in ('SETUP_NEW', 'SETUP_CONFIRMED'):
        ev = [('tiingo:' + r[0], cidx[r[5]]) for r in rows if r[1] == kind and r[3] == 'M6_TIME' and r[4] == 'OBSERVED' and r[8][1] is not None]
        neffs[kind] = {'n': len(ev), 'nEffRaw': neff(ev, rr, 26), 'nEffSpyExcess': neff(ev, re_, 26)}
    return cells, cmp, {'rhoRaw': rr, 'rhoSpyExcess': re_, 'titles': len(rawc)}, neffs


# ---------- 4. Projektion ----------
def projection(ev, kind, rho, nmin, k, upper):
    dates = sorted({e[2] for e in ev})
    panels = [collections.Counter(t for t, x, d in ev if d == dd and x == kind) for dd in dates]
    first = next_session(dates[0]); axis = []; d = D(first)
    while d <= D('2031-12-31'):
        if is_session(d): axis.append(d.isoformat())
        d += dt.timedelta(days=1)
    idx = {s: i for i, s in enumerate(axis)}
    pos = [(idx[next_session(dd)], q, True) for q, dd in enumerate(dates)]
    p0 = idx[next_session(dates[-1])]
    pos += [(p, (p - p0 - 1) % len(dates), False) for p in range(p0 + 1, len(axis))]
    tot, n = 0.0, 0
    for a, (pa, qa, oa) in enumerate(pos):
        ca = sum(panels[qa].values()); tot += rho * (ca * ca - ca) + ca; n += ca
        b = a - 1
        while b >= 0 and pa - pos[b][0] < 126:
            pb, qb, ob = pos[b]; cb = sum(panels[qb].values())
            same = 0 if (upper and not (oa and ob)) else sum(c * panels[qb][t] for t, c in panels[qa].items())
            tot += 2 * (126 - (pa - pb)) / 126 * (rho * (ca * cb - same) + same); b -= 1
        if pa + 126 < len(axis) and n * n / tot >= nmin and pa // 126 + 1 >= k:
            return axis[pa + 126], n * n / tot
    return None, None


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); a = ap.parse_args()
    inv = jload(DOCS + '/setup-original-inventory-1.0.0.json'); reg = jload(DOCS + '/setup-reconstruction-registration-1.0.0.json')
    res = jload(DOCS + '/setup-reconstruction-result-1.0.0.json'); dec = jload(DOCS + '/setup-independence-decision-1.0.0.json')
    cal = check_calendar()
    ev, rho, ne, mat = original()
    js_mat = {m['eventDate']: m for m in inv['maturityByEventDate']}
    mat_equal = all(js_mat[d]['entryNextClose'] == v['entry'] and js_mat[d]['m3'] == v['m3'] and js_mat[d]['m6'] == v['m6'] for d, v in mat.items()) and len(mat) == len(js_mat)
    cells, cmp, rrho, rneff = reconstruction(reg, res)
    jcell = {c['eventKind'] + '|' + c['exitVariant']: c for c in res['cells'] if c['entryVariant'] == 'NEXT_WEEK_CLOSE'}
    cell_cmp = {k: {'python': v, 'js': {'n': jcell[k]['performance']['n'], 'meanExcess': jcell[k]['performance']['meanBenchmarkExcess']},
                    'equal': v['n'] == jcell[k]['performance']['n'] and abs(v['meanExcess'] - jcell[k]['performance']['meanBenchmarkExcess']) < 1e-9} for k, v in cells.items()}
    rec_neff_cmp = {k: {'python': v, 'js': {'nEffRaw': jcell[k + '|M6_TIME']['independence']['nEffModelRaw'], 'nEffSpyExcess': jcell[k + '|M6_TIME']['independence']['nEffModelSpyExcess']}} for k, v in rneff.items()}
    rho_gate = max(rho['rhoSpyExcess'], 0.05)
    proj = {}
    for kind in ('SETUP_NEW', 'SETUP_CONFIRMED'):
        jd = next(x for x in dec['earliestFulfilment']['recommendedGate'] if x['eventKind'] == kind)['gate']
        lo_d, lo_n = projection(ev, kind, rho_gate, 50, 4, False); up_d, up_n = projection(ev, kind, rho_gate, 50, 4, True)
        proj[kind] = {'python': {'repeatedTitles': lo_d, 'newTitles': up_d, 'nEffRepeated': lo_n, 'nEffNew': up_n}, 'js': {'repeatedTitles': jd['repeatedTitles']['date'], 'newTitles': jd['newTitles']['date']},
                      'equal': lo_d == jd['repeatedTitles']['date'] and up_d == jd['newTitles']['date']}
    close = lambda x, y, tol: abs(x - y) <= tol * max(1.0, abs(y))
    checks = {
        'calendarEqualsSpy1998_2026': cal['equal'],
        'originalEventsCount': len(ev) == inv['events']['total'],
        'maturityDatesEqual': mat_equal,
        'originalRhoEqual': close(rho['rhoRaw'], inv['independence']['rho']['rhoRaw'], 1e-9) and close(rho['rhoSpyExcess'], inv['independence']['rho']['rhoSpyExcess'], 1e-9),
        'originalNEffEqual': all(close(ne[k]['nEffRaw'], inv['independence']['byKind'][k]['nEffRaw'], 1e-9) and close(ne[k]['nEffSpyExcess'], inv['independence']['byKind'][k]['nEffSpyExcess'], 1e-9) for k in ne),
        'originalNEffEqualsV9': close(ne['ALL']['nEffRaw'], 17.13160862533324, 1e-6) and close(ne['ALL']['nEffSpyExcess'], 13.340373264740375, 1e-6),
        'reconstructionSampleEqual': cmp['equal'] == cmp['compared'],
        'reconstructionCellsEqual': all(v['equal'] for v in cell_cmp.values()),
        'reconstructionRhoEqual': close(rrho['rhoRaw'], res['independenceModel']['rho']['rhoRaw'], 1e-9) and close(rrho['rhoSpyExcess'], res['independenceModel']['rho']['rhoSpyExcess'], 1e-9),
        'reconstructionNEffEqual': all(close(v['python']['nEffRaw'], v['js']['nEffRaw'], 1e-9) and close(v['python']['nEffSpyExcess'], v['js']['nEffSpyExcess'], 1e-9) for v in rec_neff_cmp.values()),
        'projectionDatesEqual': all(v['equal'] for v in proj.values())}
    doc = {'schemaVersion': 'quant-v10-setup-python-verification-1.0.0', 'evidenceKind': 'TECHNICAL_PARITY', 'note': 'Zweite Implementierung (Python stdlib) - kein Holdout, keine unabhaengige Datenquelle.',
           'sources': {p: sha(p) for p in [DOCS + '/setup-original-inventory-1.0.0.json', DOCS + '/setup-reconstruction-registration-1.0.0.json', DOCS + '/setup-reconstruction-result-1.0.0.json', DOCS + '/setup-independence-decision-1.0.0.json', 'quant/data/product/setup-outcomes-v1.json']},
           'calendar': cal, 'original': {'rho': rho, 'nEff': ne}, 'reconstruction': {'sample': cmp, 'cells': cell_cmp, 'rho': rrho, 'nEff': rec_neff_cmp}, 'projection': proj,
           'checks': checks, 'state': 'PASS' if all(checks.values()) else 'FAIL', 'productionApproved': False}
    json.dump(doc, open(a.out, 'w'), indent=1, ensure_ascii=False, default=str)
    print(json.dumps({'state': doc['state'], 'checks': checks, 'sample': {k: cmp[k] for k in ('compared', 'equal', 'maxAbsDiffGross', 'maxAbsDiffBenchmark')}}))


if __name__ == '__main__':
    main()
