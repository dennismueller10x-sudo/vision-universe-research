#!/usr/bin/env python3
"""V9 sensitivity: independent Python reference (stdlib + numpy).

Reads the committed registration and source manifest plus the repository source files
directly (weekly prices, security master, SPY). Re-derives the modal weekly calendar,
frame exclusions, the hash-seeded sample, NEW_52W_HIGH events and outcomes, SPY excess,
calendar-aggregated series, ACF/Ljung-Box, Bartlett LRV, Andrews bandwidth, Politis-White
(PPW 2009), KPSS, CUSUM, ADF, split-period Wald, CBB/SB/MBB bootstraps (xorshift parity),
Holm, neighbourhood, criteria and decision. JS outputs are read only for comparison.
Not reproduced here: createLoader qualification itself (the registered QUALIFIED list is input).
Usage: verify_v9_sensitivity.py <private-dir> <repo-root> [<parity-out.json>]
"""
import gzip, hashlib, json, math, pathlib, sys, time
import numpy as np

TWO32 = 4294967296
DIMS = {'entryDelayBars': [1, 2], 'feeBps': [0, 10], 'horizonBars': [4, 13, 26], 'slippageBps': [0, 5, 20]}
BASE = {'horizonBars': 13, 'entryDelayBars': 1, 'feeBps': 10, 'slippageBps': 5}
WINDOW = ('2000-01-01', '2025-12-31')
SEED, REPS, ALPHA = 1729, 1999, 0.05
SE_BLOCKS = [1, 2, 4, 8, 13, 26, 39, 52, 78, 104, 156, 208]
PLATEAU = [39, 52, 78, 104]
EXCH_OK = {'NASDAQ', 'NYSE', 'AMEX', 'NYSE MKT'}


class Parity:
    def __init__(self):
        self.checks = 0; self.maxRel = 0.0; self.fail = []; self.exact = 0

    def near(self, a, b, what, rel=1e-9, abs_=1e-12):
        self.checks += 1
        if a is None or b is None:
            if a is not b: self.fail.append((what, a, b))
            return
        d = abs(a - b); r = d / max(abs(a), abs(b), 1e-300)
        if d > abs_: self.maxRel = max(self.maxRel, r)
        if not (d <= abs_ or r <= rel): self.fail.append((what, a, b))

    def eq(self, a, b, what):
        self.checks += 1; self.exact += 1
        if a != b: self.fail.append((what, str(a)[:200], str(b)[:200]))


def canon_hash(x):
    return hashlib.sha256(json.dumps(x, separators=(',', ':'), ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def week_of(d):
    import datetime
    t = datetime.date.fromisoformat(d); return (t - datetime.timedelta(days=t.weekday())).isoformat()


def xs(s):
    s ^= (s << 13) & 0xffffffff; s ^= s >> 17; s ^= (s << 5) & 0xffffffff; return s & 0xffffffff


# ---------------- statistics (independent implementations) ----------------
def gamma_q(a, x):
    if x == 0: return 1.0
    gl = math.lgamma(a)
    if x < a + 1:
        term = 1.0 / a; total = term; k = a
        for _ in range(100000):
            k += 1; term *= x / k; total += term
            if abs(term) < abs(total) * 1e-16: break
        return max(0.0, 1.0 - total * math.exp(-x + a * math.log(x) - gl))
    # modified Lentz for the continued fraction of Q
    tiny = 1e-300; b = x + 1 - a; c = 1 / tiny; d = 1 / b; h = d
    for i in range(1, 100000):
        an = -i * (i - a); b += 2
        d = an * d + b; d = tiny if abs(d) < tiny else d
        c = b + an / c; c = tiny if abs(c) < tiny else c
        d = 1 / d; delta = d * c; h *= delta
        if abs(delta - 1) < 1e-16: break
    return min(1.0, math.exp(-x + a * math.log(x) - gl) * h)


def chi2_sf(x, k): return gamma_q(k / 2.0, x / 2.0)


def acov(x, maxlag):
    e = x - x.mean(); T = len(x)
    return np.array([np.dot(e[k:], e[:T - k]) / T for k in range(maxlag + 1)])


def lrv(x, bw):
    g = acov(x, bw); w = 1 - np.arange(1, bw + 1) / (bw + 1)
    return g[0] + 2 * np.dot(w, g[1:])


def andrews(x):
    e = x - x.mean(); den = np.dot(e[:-1], e[:-1]); rho = np.dot(e[1:], e[:-1]) / den if den > 0 else 0.0
    r = min(0.97, max(-0.97, rho)); alpha = 4 * r * r / ((1 - r) ** 2 * (1 + r) ** 2)
    return min(len(x) - 1, math.floor(1.1447 * (alpha * len(x)) ** (1 / 3)))


def pw(x):
    T = len(x); K = max(5, math.ceil(math.sqrt(math.log10(T)))); mmax = math.ceil(math.sqrt(T)) + K
    thr = 2 * math.sqrt(math.log10(T) / T); g = acov(x, min(T - 1, mmax + K)); rho = g / g[0]
    mhat = None
    for m in range(0, len(rho) - K):
        if all(abs(rho[m + k]) < thr for k in range(1, K + 1)): mhat = m; break
    M = min(mmax if mhat is None else 2 * max(mhat, 1), mmax)
    lam = np.array([1.0 if k / M <= 0.5 else 2 * (1 - k / M) for k in range(1, M + 1)])
    ks = np.arange(1, M + 1); G = float(np.sum(2 * lam * ks * g[1:M + 1])); g0 = float(g[0] + np.sum(2 * lam * g[1:M + 1]))
    bmax = math.ceil(min(3 * math.sqrt(T), T / 3))
    f = lambda D: None if D <= 0 else min((2 * G * G / D) ** (1 / 3) * T ** (1 / 3), bmax)
    return dict(mhat=mhat, M=M, G=G, g0=g0, bSB=f(2 * g0 * g0), bCB=f(4 / 3 * g0 * g0))


def kpss(x, bw):
    S = np.cumsum(x - x.mean()); v = lrv(x, bw); return float(np.sum(S * S) / (len(x) ** 2 * v)) if v > 0 else None


def cusum(x, bw):
    S = np.cumsum(x - x.mean()); v = lrv(x, bw); return float(np.max(np.abs(S)) / math.sqrt(len(x) * v)) if v > 0 else None


def adf(x, p):
    dy = np.diff(x); rows = []; ys = []
    for t in range(p + 1, len(x)):
        rows.append([1.0, x[t - 1]] + [dy[t - 1 - j] for j in range(1, p + 1)]); ys.append(dy[t - 1])
    X = np.array(rows); Y = np.array(ys); beta, *_ = np.linalg.lstsq(X, Y, rcond=None)
    res = Y - X @ beta; s2 = res @ res / (len(Y) - X.shape[1]); cov = s2 * np.linalg.inv(X.T @ X)
    return float(beta[1] / math.sqrt(cov[1, 1]))


def split(sums, counts, parts=4, cap=52):
    T = len(sums); out = []
    for i in range(parts):
        lo, hi = (i * T) // parts, ((i + 1) * T) // parts; n = counts[lo:hi].sum()
        if n == 0: out.append(None); continue
        th = sums[lo:hi].sum() / n; z = sums[lo:hi] - th * counts[lo:hi]; bw = min(cap, (hi - lo) // 4); v = lrv(z, bw)
        out.append((th, math.sqrt((hi - lo) * v) / n if v > 0 else None))
    if any(o is None or o[1] is None for o in out): return None
    w = np.array([1 / o[1] ** 2 for o in out]); th = np.array([o[0] for o in out]); pooled = float(np.sum(w * th) / np.sum(w))
    W = float(np.sum(w * (th - pooled) ** 2)); return W, chi2_sf(W, parts - 1)


def summarize(vals, est):
    v = np.array(vals); R = len(v); se = float(np.sqrt(np.sum((v - v.mean()) ** 2) / (R - 1))); o = sorted(vals)
    def q(p):
        k = (R - 1) * p; i = math.floor(k); return o[i] + (o[min(i + 1, R - 1)] - o[i]) * (k - i)
    tails = sum(1 for x in vals if abs(x - est) >= abs(est))
    return se, [2 * est - q(1 - ALPHA / 2), 2 * est - q(ALPHA / 2)], (1 + tails) / (R + 1)


# ---------------- bootstrap plans (data independent; cached) ----------------
_plans = {}


def block_plan(kind, T, b):
    key = (kind, T, b)
    if key in _plans: return _plans[key]
    s = SEED; span = T if kind == 'CBB' else T - b + 1; nb = -(-T // b)
    starts = np.zeros((REPS, nb), dtype=np.int64); lens = np.array([min(b, T - u) for u in range(0, T, b)], dtype=np.int64)
    for r in range(REPS):
        for j in range(nb):
            s = xs(s); starts[r, j] = (s * span) // TWO32
    _plans[key] = (starts, lens); return _plans[key]


def sb_plan(T, b):
    key = ('SB', T, b)
    if key in _plans: return _plans[key]
    thr = TWO32 // b; s = SEED; idx = np.zeros((REPS, T), dtype=np.int64)
    for r in range(REPS):
        s = xs(s); i = (s * T) // TWO32; idx[r, 0] = i
        for u in range(1, T):
            s = xs(s)
            if s < thr: s = xs(s); i = (s * T) // TWO32
            else: i = 0 if i + 1 == T else i + 1
            idx[r, u] = i
    _plans[key] = idx; return idx


def block_boot(kind, sums, counts, b):
    T = len(sums); starts, lens = block_plan(kind, T, b)
    ps = [0.0]; pc = [0]
    for k in range(2 * T): ps.append(ps[-1] + float(sums[k % T])); pc.append(pc[-1] + int(counts[k % T]))
    ps = np.array(ps); pc = np.array(pc); acc = np.zeros(REPS); cnt = np.zeros(REPS, dtype=np.int64)
    for j in range(starts.shape[1]):
        st = starts[:, j]; acc += ps[st + lens[j]] - ps[st]; cnt += pc[st + lens[j]] - pc[st]
    assert (cnt > 0).all(); return list(acc / cnt)


def sb_boot(sums, counts, b):
    idx = sb_plan(len(sums), b); acc = np.zeros(REPS); cnt = np.zeros(REPS, dtype=np.int64)
    for u in range(idx.shape[1]): acc += sums[idx[:, u]]; cnt += counts[idx[:, u]]
    assert (cnt > 0).all(); return list(acc / cnt)


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: (ps[i], i)); adj = [0.0] * len(ps); prev = 0.0
    for rank, i in enumerate(order): prev = max(prev, min(1.0, (len(ps) - rank) * ps[i])); adj[i] = prev
    return adj


def grid_points():
    pts = [{}]
    for k in sorted(DIMS): pts = [dict(p, **{k: v}) for p in pts for v in DIMS[k]]
    return pts


# ---------------- main ----------------
def main(private, root, out_path=None):
    t0 = time.monotonic(); private = pathlib.Path(private); root = pathlib.Path(root); P = Parity()
    regdoc = json.loads((root / 'docs/quant-recovery/v9/sensitivity/registration-1.0.0.json').read_text())
    reg = regdoc['registration']; P.eq(canon_hash(reg), regdoc['registrationHash'], 'registrationHash')
    manifest = json.loads(gzip.decompress((root / 'docs/quant-recovery/v9/sensitivity/source-manifest-1.0.0.json.gz').read_bytes()))
    P.eq(canon_hash(manifest), reg['sourceManifestHash'], 'manifestHash')
    docs = {}
    for f, h in manifest['files'].items():
        b = (root / f).read_bytes(); P.eq(hashlib.sha256(b).hexdigest(), h, 'sha:' + f)
        if '/discover-series-long/' in f: docs[pathlib.Path(f).stem] = json.loads(b)
    master = json.loads((root / 'quant/data/market/security-master/us-security-master.json').read_text())
    mrow = {}
    for r in master['rows']:
        if r.get('baseline_security_id'): mrow.setdefault(r['baseline_security_id'], []).append(r)
    qualified = manifest['qualified']
    # modal calendar & frame
    lab = {}
    for i in qualified:
        for d, _ in docs[i]['points']: lab.setdefault(week_of(d), {}).setdefault(d, 0); lab[week_of(d)][d] += 1
    modal = {k: sorted(m.items(), key=lambda x: (-x[1], [-ord(c) for c in x[0]]))[0][0] for k, m in lab.items()}
    calendar = sorted(modal.values()); P.eq(canon_hash(calendar), reg['populations']['calendar']['hash'], 'calendarHash')
    nonmodal, badex, frame = [], [], []
    for i in qualified:
        exch = mrow[i][0]['canonical_id'].split(':')[1]
        if any(modal[week_of(d)] != d for d, _ in docs[i]['points']): nonmodal.append(i)
        elif exch not in EXCH_OK: badex.append(i)
        else: frame.append(i)
    P.eq(nonmodal, reg['populations']['exclusions']['NON_MODAL_WEEK_LABEL']['ids'], 'nonModal')
    P.eq(badex, reg['populations']['exclusions']['EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET']['ids'], 'exchangeExcl')
    seed = reg['populations']['sampling']['seedString']; size = reg['populations']['sampling']['size']
    ranked = sorted(frame, key=lambda i: hashlib.sha256((seed + '|' + i).encode()).hexdigest())
    p1 = sorted(ranked[:size]); p1s = set(p1); p2 = [i for i in frame if i not in p1s]
    P.eq(p1, reg['populations']['P1']['ids'], 'P1ids'); P.eq(canon_hash(p2), reg['populations']['P2']['idsHash'], 'P2hash')
    spy = {d: v for d, v in json.loads((root / 'quant/data/market/multi-asset/series/SPY.json').read_text())['points']}
    trio = reg['populations']['TRIO']['ids']
    trio_cal = sorted({d for i in trio for d, _ in docs[i]['points']})
    pops = {'TRIO': (trio, trio_cal), 'P1': (p1, calendar), 'P2': (p2, calendar)}
    summ = json.loads((private / 'run-summary.json').read_text()); full = json.loads((private / 'run-full.json').read_text())
    P.eq(summ['registrationHash'], regdoc['registrationHash'], 'runRegistration')
    report = {'populations': {}}
    crit_counts_py = {}
    for name, (ids, cal) in pops.items():
        cidx = {d: k for k, d in enumerate(cal)}; study = [d for d in cal if WINDOW[0] <= d <= WINDOW[1]]
        P.eq(study, full['populations'][name]['studyCalendar'], name + ':studyCalendar')
        events = {}
        for h in DIMS['horizonBars']:
            for dl in DIMS['entryDelayBars']:
                ev = []
                for i in ids:
                    pts = docs[i]['points']; c = [p[1] for p in pts]; dates = [p[0] for p in pts]; start = mrow[i][0]['start_date']
                    last = -10 ** 9
                    for k in range(53, len(c)):
                        m = max(c[k - 52:k]); mp = max(c[k - 53:k - 1])
                        if not (c[k] > m and not (c[k - 1] > mp)): continue
                        take = k - last >= 13; last = k
                        if not take: continue
                        sd = dates[k]
                        if not (WINDOW[0] <= sd <= WINDOW[1]): continue
                        e = {'listing': i, 'signalDate': sd, 'completed': False}
                        if sd >= start and k + dl + h < len(c):
                            en, ex = k + dl, k + dl + h
                            assert all(cidx[dates[j]] == cidx[dates[j - 1]] + 1 for j in range(k + 1, ex + 1)), (i, sd)
                            e.update(completed=True, entryDate=dates[en], exitDate=dates[ex], gross=c[ex] / c[en] - 1,
                                     bench=(spy[dates[ex]] / spy[dates[en]] - 1) if dates[en] in spy and dates[ex] in spy else None)
                        ev.append(e)
                events[(h, dl)] = ev
                js = full['populations'][name]['events'][f'{h}:{dl}']
                P.eq(len(ev), len(js), f'{name}:{h}:{dl}:windowEvents')
                pyc = [e for e in ev if e['completed']]; jsc = [e for e in js if e['completed']]
                P.eq([(e['signalDate'], e['entryDate'], e['exitDate']) for e in pyc], [(e['signalDate'], e['entryDate'], e['exitDate']) for e in jsc], f'{name}:{h}:{dl}:eventDates')
                P.eq([mrow[e['listing']][0]['canonical_id'] for e in pyc], [e['listingId'] for e in jsc], f'{name}:{h}:{dl}:eventListings')
                for a, b in zip(pyc, jsc):
                    P.near(a['gross'], b['grossReturn'], 'gross', rel=1e-12)
                    if a['bench'] is None or b['benchmarkReturn'] is None: P.eq(a['bench'], b['benchmarkReturn'], 'benchNull')
                    else: P.near(a['bench'], b['benchmarkReturn'], 'bench', rel=1e-12)
        T = len(study); sidx = {d: k for k, d in enumerate(study)}
        popsum = summ['populations'][name]; popfull = full['populations'][name]; report['populations'][name] = {'events': {f'{h}:{d}': sum(e['completed'] for e in v) for (h, d), v in events.items()}}
        for endpoint in ['primary', 'secondary']:
            jd = popsum['endpoints'][endpoint]; jf = popfull['endpoints'][endpoint]; pvals = []; ests = []; crit = []
            bmax = 0.0
            for pi, p in enumerate(grid_points()):
                side = (p['feeBps'] + p['slippageBps']) / 10000
                vals = []
                for e in events[(p['horizonBars'], p['entryDelayBars'])]:
                    if not e['completed']: continue
                    v = (1 + e['gross']) * (1 - side) / (1 + side) - 1
                    if endpoint == 'secondary':
                        if e['bench'] is None: continue
                        v = v - e['bench']
                    vals.append((e['signalDate'], v))
                sums = [0.0] * T; counts = [0] * T
                for d, v in vals: sums[sidx[d]] += v; counts[sidx[d]] += 1
                n = len(vals); est = sum(sums) / n; sums = np.array(sums); counts = np.array(counts, dtype=np.int64); z = sums - est * counts
                jdp = jd['diagnostics'][pi]; jfp = jf['diagnosticsFull'][pi]
                assert jdp['parameters'] == p
                P.eq(list(map(float, sums)), jfp['sums'], 'sums'); P.eq(list(map(int, counts)), jfp['counts'], 'counts'); P.eq(est, jdp['estimate'], 'estimate')
                rho = acov(z, 104); rho = rho / rho[0]
                for a, b in zip(rho, jfp['acf']): P.near(float(a), b, 'acf', rel=1e-8, abs_=1e-12)
                for lb in jdp['ljungBox']:
                    m = lb['lags']; q = T * (T + 2) * sum(rho[k] ** 2 / (T - k) for k in range(1, m + 1))
                    P.near(q, lb['q'], 'lbQ', rel=1e-8); P.near(chi2_sf(q, m), lb['pValue'], 'lbP', rel=1e-7, abs_=1e-12)
                bws = {'newey_west_1994': math.floor(4 * (T / 100) ** (2 / 9)), 'schwert_l4': math.floor(4 * (T / 100) ** 0.25), 'schwert_l12': math.floor(12 * (T / 100) ** 0.25), 'andrews_ar1': andrews(z), 'fixed_26': 26, 'fixed_52': 52, 'fixed_104': 104}
                g0 = acov(z, 0)[0]
                for k, bw in bws.items():
                    P.eq(bw, jdp['lrv'][k]['bandwidth'], 'bw:' + k); v = lrv(z, bw)
                    P.near(v, jdp['lrv'][k]['lrv'], 'lrv:' + k, rel=1e-8); P.near(math.sqrt(T * v) / n, jdp['lrv'][k]['se'], 'lrvse', rel=1e-8)
                pwr = pw(z); P.eq(pwr['mhat'], jdp['politisWhite']['mhat'], 'pw.mhat'); P.eq(pwr['M'], jdp['politisWhite']['M'], 'pw.M')
                P.near(pwr['bCB'], jdp['politisWhite']['bCB'], 'pw.bCB', rel=1e-7); P.near(pwr['bSB'], jdp['politisWhite']['bSB'], 'pw.bSB', rel=1e-7)
                bmax = max(bmax, pwr['bCB'] or 0)
                ses = {}
                for b in [x for x in SE_BLOCKS if x <= T // 2]:
                    boot = block_boot('CBB', sums, counts, b); se, ci, pv = summarize(boot, est); ses[b] = se
                    jc = [x for x in jdp['cbbCurve'] if x['b'] == b][0]
                    P.near(se, jc['se'], 'cbbSe', rel=1e-9); P.near(pv, jc['pValue'], 'cbbP', rel=1e-12); P.near(ci[0], jc['ci'][0], 'cbbCi', rel=1e-9); P.near(ci[1], jc['ci'][1], 'cbbCi', rel=1e-9)
                    P.near(math.sqrt(T * lrv(z, b)) / n, jc['nwSe'], 'nwSe', rel=1e-8)
                    if b == 52:
                        for a, c in zip(boot, jf['inference'][pi]['result']['bootstrap']): P.near(a, c, 'boot52', rel=1e-12, abs_=1e-15)
                        P.near(pv, jd['grid']['rows'][pi]['pValue'], 'gridP', rel=1e-12); pvals.append(pv); ests.append(est)
                    if b == 104:
                        for a, c in zip(boot, jf['robustness'][pi]['result']['bootstrap']): P.near(a, c, 'boot104', rel=1e-12, abs_=1e-15)
                m52 = {'CBB': summarize(block_boot('CBB', sums, counts, 52), est), 'MBB': summarize(block_boot('MBB', sums, counts, 52), est), 'SB': summarize(sb_boot(sums, counts, 52), est)}
                for k, (se, ci, pv) in m52.items():
                    P.near(se, jdp['methods52'][k]['se'], 'm52se:' + k, rel=1e-9); P.near(pv, jdp['methods52'][k]['pValue'], 'm52p:' + k, rel=1e-12)
                    P.near(ci[0], jdp['methods52'][k]['ci'][0], 'm52ci', rel=1e-9); P.near(ci[1], jdp['methods52'][k]['ci'][1], 'm52ci', rel=1e-9)
                l4, l12 = bws['schwert_l4'], bws['schwert_l12']
                for key, bw in [('l4', l4), ('l12', l12), ('bw52', 52)]:
                    P.near(kpss(z, bw), jdp['kpssZ'][key]['statistic'], 'kpssZ', rel=1e-8); P.near(kpss(counts.astype(float), bw), jdp['kpssCounts'][key]['statistic'], 'kpssN', rel=1e-8)
                for key, bw in [('l12', l12), ('bw52', 52)]: P.near(cusum(z, bw), jdp['cusum'][key]['statistic'], 'cusum', rel=1e-8)
                P.near(adf(z, l12), jdp['adf']['statistic'], 'adf', rel=1e-6)
                sp = split(sums, counts)
                if sp is None: P.eq(None, jdp['split']['wald'], 'split')
                else: P.near(sp[0], jdp['split']['wald'], 'splitW', rel=1e-7); P.near(sp[1], jdp['split']['pValue'], 'splitP', rel=1e-6, abs_=1e-12)
                nw52 = math.sqrt(T * lrv(z, 52)) / n; vv = np.array([v for _, v in vals]); s2 = float(np.sum((vv - vv.mean()) ** 2) / (n - 1))
                P.near(min(n, s2 / nw52 ** 2), jdp['effectiveN'], 'effN', rel=1e-8); P.near(min(n, s2 / nw52 ** 2), jd['grid']['rows'][pi]['effectiveN'], 'gridEffN', rel=1e-8)
                pl = [ses[b] for b in PLATEAU]
                c = {'C1_PW': pwr['bCB'] is not None and 52 >= pwr['bCB'], 'C2_PLATEAU': max(pl) / min(pl) <= 1.25,
                     'C3_METHODS': abs(m52['SB'][0] / ses[52] - 1) <= 0.2 and abs(m52['MBB'][0] / ses[52] - 1) <= 0.2,
                     'C4_LRV': abs(nw52 / ses[52] - 1) <= 0.25, 'C5_STATIONARITY': kpss(z, 52) <= 0.463 and cusum(z, 52) <= 1.358,
                     'C6_SPLIT': sp is not None and sp[1] > 0.01}
                P.eq(c, jdp['criteria'], f'{name}:{endpoint}:{pi}:criteria'); crit.append(c)
            adj = holm(pvals)
            for r, a in zip(jd['grid']['rows'], adj): P.near(a, r['adjustedPValue'], 'holm', rel=1e-12); P.eq(r['reject'], a <= ALPHA, 'reject')
            rob = [summarize(block_boot('CBB', np.array(jf['diagnosticsFull'][i]['sums']), np.array(jf['diagnosticsFull'][i]['counts'], dtype=np.int64), 104), ests[i])[2] for i in range(36)]
            for r, a in zip(jd['grid']['robustness104']['rows'], holm(rob)): P.near(a, r['adjustedPValue'], 'holm104', rel=1e-12)
            badapt = min(T // 3, max(52, math.ceil(bmax))); P.eq(badapt, jd['grid']['adaptive']['blockLength'], 'adaptiveB')
            if badapt > 52:
                ap = [summarize(block_boot('CBB', np.array(jf['diagnosticsFull'][i]['sums']), np.array(jf['diagnosticsFull'][i]['counts'], dtype=np.int64), badapt), ests[i]) for i in range(36)]
                for r, a, h in zip(jd['grid']['adaptive']['rows'], ap, holm([x[2] for x in ap])): P.near(a[2], r['pValue'], 'adaptP', rel=1e-12); P.near(h, r['adjustedPValue'], 'adaptHolm', rel=1e-12)
            pts = grid_points(); base = [i for i, p in enumerate(pts) if p == BASE][0]
            neigh = [i for i, p in enumerate(pts) if sum(abs(DIMS[k].index(p[k]) - DIMS[k].index(BASE[k])) for k in DIMS) == 1]
            P.eq(len(neigh), jd['grid']['neighborhood']['count'], 'neighCount'); P.eq(all(math.copysign(1, ests[i]) == math.copysign(1, ests[base]) for i in neigh), jd['grid']['neighborhood']['sameDirection'], 'neighSign')
            counts_ = {k: sum(c[k] for c in crit) for k in crit[0]}; P.eq(counts_, jd['criteriaCounts'], f'{name}:{endpoint}:criteriaCounts'); crit_counts_py[(name, endpoint)] = counts_
            report['populations'][name][endpoint] = {'criteriaCounts': counts_, 'holmRejections': sum(a <= ALPHA for a in adj), 'nominalRejections': sum(p <= ALPHA for p in pvals)}
    ok = lambda n: all(v >= 33 for v in crit_counts_py[(n, 'primary')].values())
    decision = 'ACCEPTED_WITH_DEFINED_SCOPE' if ok('P1') and ok('P2') else 'PARTIALLY_VALIDATED'
    P.eq(decision, summ['decision']['methodStatus'], 'decision')
    out = {'schemaVersion': 'v9-sensitivity-parity-1.0.0', 'state': 'PASS' if not P.fail else 'FAIL', 'checks': P.checks, 'exactChecks': P.exact, 'maxRelativeDifferenceNonExact': P.maxRel,
           'failures': [list(map(str, f)) for f in P.fail[:50]], 'failureCount': len(P.fail), 'decision': decision, 'populations': report['populations'],
           'scope': 'Independent re-derivation from registered QUALIFIED list + source files: modal calendar, exclusions, sample, NEW_52W_HIGH events/outcomes, SPY excess, aggregated series, ACF/LB, LRV, Andrews, PW, KPSS, CUSUM, ADF, split Wald, CBB/MBB/SB bootstraps (xorshift parity), Holm, neighbourhood, criteria, decision. Not re-derived: createLoader qualification (input).',
           'tolerances': 'Exact for hashes/ids/dates/counts/sums/estimates/criteria; bootstrap replicates rel 1e-12; SE/CI rel 1e-9; ACF/LRV/KPSS/CUSUM rel 1e-8 (numpy dot vs sequential loop); ADF rel 1e-6 (lstsq vs normal equations); chi2 tails rel 1e-6..1e-7',
           'seconds': time.monotonic() - t0, 'numpy': np.__version__, 'python': sys.version.split()[0],
           'referenceSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
           'runSummarySha256': hashlib.sha256((private / 'run-summary.json').read_bytes()).hexdigest(), 'runFullSha256': hashlib.sha256((private / 'run-full.json').read_bytes()).hexdigest(),
           'independentTradingEvidence': False}
    text = json.dumps(out, indent=1) + '\n'
    if out_path: pathlib.Path(out_path).write_text(text)
    print(json.dumps({k: out[k] for k in ['state', 'checks', 'failureCount', 'maxRelativeDifferenceNonExact', 'decision', 'seconds']}))
    return out


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
