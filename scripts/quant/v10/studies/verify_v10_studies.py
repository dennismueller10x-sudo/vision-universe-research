#!/usr/bin/env python3
"""V10 STUDIES: independent Python recomputation (stdlib only; run with python3 -I).

Reads the committed registration, the run's source manifest and the repository source files
(weekly series, SPY daily series, pattern methodology) and re-derives, with an independent
implementation: series restriction + content hash, modal weekly calendar, frame exclusions, the five
signal rules with warm-up/cooldown, pattern features of the 15 registered candidates, event states,
outcomes, SPY returns, same-week controls, endpoint means, the circular calendar-block bootstrap
(xorshift parity), Holm, cost sensitivity, subperiods, SPY regimes, the funded long-only ledger and the
same-stock replay incl. persistence. The JS evidence files are read only for comparison.
Not reproduced: the loader qualification itself (the manifest QUALIFIED list and per-series date
bounds are inputs; the series content is re-hashed from the raw files).
Usage: verify_v10_studies.py <private-run-dir> <repo-root> [<parity-out.json>]
"""
import bisect, collections, datetime, gzip, hashlib, json, math, os, sys, time

TWO32 = 4294967296
MIC = {'NASDAQ': 'XNAS', 'NYSE': 'XNYS', 'AMEX': 'XASE', 'NYSE MKT': 'XASE'}
WARMUP, COOLDOWN = 53, 13
SIG_LOOKBACK = WARMUP + COOLDOWN


# ---------------- canonical JSON (JavaScript number formatting) ----------------
def js_num(x):
    if isinstance(x, bool): return 'true' if x else 'false'
    if isinstance(x, int): return str(x)
    if x == 0: return '0'
    if x == int(x) and abs(x) < 1e21: return str(int(x))
    r = repr(x)
    neg = r.startswith('-'); r = r.lstrip('-')
    if 'e' in r: mant, exp = r.split('e'); exp = int(exp)
    else: mant, exp = r, 0
    if '.' in mant: ip, fp = mant.split('.')
    else: ip, fp = mant, ''
    digits = (ip + fp).lstrip('0'); lead = len(ip.lstrip('0')) if ip.strip('0') else -(len(fp) - len(fp.lstrip('0')))
    point = lead + exp  # position of decimal point relative to digits
    digits = digits.rstrip('0') or '0'
    if -6 < point <= 21:
        if point <= 0: s = '0.' + '0' * (-point) + digits
        elif point >= len(digits): s = digits + '0' * (point - len(digits))
        else: s = digits[:point] + '.' + digits[point:]
    else:
        e = point - 1; s = digits[0] + ('.' + digits[1:] if len(digits) > 1 else '') + 'e' + ('+' if e > 0 else '-') + str(abs(e))
    return ('-' if neg else '') + s


def canon(x):
    if x is None: return 'null'
    if isinstance(x, bool): return 'true' if x else 'false'
    if isinstance(x, (int, float)): return js_num(x)
    if isinstance(x, str): return json.dumps(x, ensure_ascii=False)
    if isinstance(x, list): return '[' + ','.join(canon(v) for v in x) + ']'
    return '{' + ','.join(json.dumps(k, ensure_ascii=False) + ':' + canon(x[k]) for k in sorted(x)) + '}'


def chash(x): return hashlib.sha256(canon(x).encode()).hexdigest()
def sha(s): return hashlib.sha256(s.encode()).hexdigest()


class Parity:
    def __init__(self): self.checks = 0; self.max_rel = 0.0; self.fail = []

    def near(self, a, b, what, rel=1e-9, abs_=1e-12):
        self.checks += 1
        if a is None or b is None:
            if not (a is None and b is None): self.fail.append((what, a, b))
            return
        d = abs(a - b); r = d / max(abs(a), abs(b), 1e-300)
        if d > abs_: self.max_rel = max(self.max_rel, r)
        if not (d <= abs_ or r <= rel): self.fail.append((what, a, b))

    def eq(self, a, b, what):
        self.checks += 1
        if a != b: self.fail.append((what, str(a)[:160], str(b)[:160]))


def week_of(d):
    t = datetime.date.fromisoformat(d); return (t - datetime.timedelta(days=t.weekday())).isoformat()


def xs(s):
    s ^= (s << 13) & 0xffffffff; s ^= s >> 17; s ^= (s << 5) & 0xffffffff; return s & 0xffffffff


def net_of(g, fee, slip):
    s = (fee + slip) / 10000; return (1 + g) * (1 - s) / (1 + s) - 1


def mean(a): return sum(a) / len(a) if a else None


# ---------------- inference (independent implementation of the registered CBB) ----------------
def cbb(calendar, rows, B, reps=1999, seed=1729, alpha=0.05):
    if not rows: return dict(n=0, estimate=None, ci=None, p=None)
    if len(rows) > 100000: return dict(n=len(rows), estimate=mean([r[1] for r in rows]), ci=None, p=None)
    idx = {d: i for i, d in enumerate(calendar)}; T = len(calendar)
    sums = [0.0] * T; cnts = [0] * T
    for d, v in rows: k = idx[d]; sums[k] += v; cnts[k] += 1
    est = sum(sums) / len(rows)
    ps = [0.0]; pc = [0]
    for k in range(2 * T): ps.append(ps[-1] + sums[k % T]); pc.append(pc[-1] + cnts[k % T])
    st = seed; boot = []
    for _ in range(reps):
        s = 0.0; c = 0; used = 0
        while used < T:
            st = xs(st); start = math.floor(st / TWO32 * T); ln = min(B, T - used)
            s += ps[start + ln] - ps[start]; c += pc[start + ln] - pc[start]; used += B
        boot.append(s / c)
    srt = sorted(boot)
    def q(p):
        k = (len(srt) - 1) * p; i = math.floor(k); return srt[i] + (srt[min(i + 1, len(srt) - 1)] - srt[i]) * (k - i)
    tails = sum(1 for v in boot if abs(v - est) >= abs(est))
    return dict(n=len(rows), estimate=est, ci=[2 * est - q(1 - alpha / 2), 2 * est - q(alpha / 2)], p=(1 + tails) / (reps + 1))


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: (ps[i], i)); adj = [None] * len(ps); prev = 0.0
    for rank, i in enumerate(order): prev = max(prev, min(1.0, (len(ps) - rank) * ps[i])); adj[i] = prev
    return adj


def subsample(rows_keyed):
    if len(rows_keyed) <= 100000: return [(d, v) for (_, d, v) in rows_keyed]
    keyed = sorted(rows_keyed, key=lambda r: sha('V10-STUDIES-SUBSAMPLE-1.0.0|' + r[0] + '|' + r[1]))
    return [(d, v) for (_, d, v) in keyed[:100000]]


# ---------------- data ----------------
def load(root, run_dir):
    reg = json.load(open(os.path.join(root, 'docs/quant-recovery/v10/studies/registration-1.0.0.json')))
    man = json.loads(gzip.open(os.path.join(run_dir, 'source-manifest.json.gz')).read())
    return reg, man


def build_population(root, man, par):
    series = {}
    for row in man['qualified']:
        sid, fsha, first, last, npts, phash, lstart, mic, lid, lc = row
        b = open(os.path.join(root, 'quant/data/market/discover-series-long', sid + '.json'), 'rb').read()
        par.eq(hashlib.sha256(b).hexdigest(), fsha, 'fileSha:' + sid)
        pts = [p for p in json.loads(b)['points'] if first <= p[0] <= last]
        par.eq(len(pts), npts, 'points:' + sid)
        series[sid] = dict(id=sid, dates=[p[0] for p in pts], closes=[float(p[1]) for p in pts], listingStart=lstart, mic=mic, listingId=lid, lifecycle=lc, pointsHash=phash)
    # content hash on a deterministic tenth (full hashing is slow and the file sha already binds the bytes)
    for sid in sorted(series)[::10]:
        s = series[sid]; par.eq(chash([[d, c] for d, c in zip(s['dates'], s['closes'])]), s['pointsHash'], 'pointsHash:' + sid)
    labels = collections.defaultdict(collections.Counter)
    for s in series.values():
        for d in s['dates']: labels[week_of(d)][d] += 1
    modal = {w: sorted(c.items(), key=lambda x: (-x[1], [-ord(ch) for ch in x[0]]))[0][0] for w, c in labels.items()}
    calendar = sorted(modal.values())
    par.eq(chash(calendar), man['calendarHash'], 'calendarHash')
    frame, nonmodal, badex = [], [], []
    for sid in sorted(series):
        s = series[sid]
        if any(modal[week_of(d)] != d for d in s['dates']): nonmodal.append(sid); continue
        lid = s['listingId']
        mic = s['mic'] if lid.startswith('v9-sec-binding:') else MIC.get(lid.split(':')[1])
        if lid.startswith('v9-sec-binding:') and mic not in ('XNAS', 'XNYS', 'XASE'): mic = None
        if not mic: badex.append(sid); continue
        frame.append(sid)
    if os.environ.get('V10_VERIFY_SUBSET_FRAME') == '1':  # test/smoke runs on a registered subset of the frame
        assert set(man['frame']) <= set(frame); frame = list(man['frame'])
    else: par.eq(frame, man['frame'], 'frame')
    par.eq(nonmodal, man['excluded']['NON_MODAL_WEEK_LABEL'], 'nonModal'); par.eq(badex, man['excluded']['EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET'], 'exchange')
    ci = {d: i for i, d in enumerate(calendar)}
    panel = []
    for sid in frame:
        s = series[sid]; s['cal'] = [ci[d] for d in s['dates']]
        g = [0]
        for k in range(len(s['dates'])): g.append(g[-1] + (1 if k > 0 and s['cal'][k] != s['cal'][k - 1] + 1 else 0))
        s['gap'] = g; panel.append(s)
    return calendar, panel


def load_spy(root):
    d = json.load(open(os.path.join(root, 'quant/data/market/multi-asset/series/SPY.json')))
    return {p[0]: float(p[1]) for p in d['points']}


def spy_ret(spy, a, z):
    x, y = spy.get(a), spy.get(z)
    return y / x - 1 if x and y else None


def eligible(s, k, lookback):
    if k < WARMUP or s['dates'][k] < s['listingStart']: return False
    lo = 0 if lookback is None else max(0, k - lookback)
    return s['gap'][k + 1] - s['gap'][lo] == 0


def state_of(s, k, h, T, lookback):
    """Event state following the registered outcome rule (independent of the JS code)."""
    if not eligible(s, k, lookback): return 'INELIGIBLE', None
    n = len(s['closes']); cal = s['cal']
    if k + 1 >= n: return ('CENSORED' if cal[k] + 1 < T else 'IMMATURE'), None
    if cal[k + 1] != cal[k] + 1: return 'CENSORED', None
    if k + 1 + h >= n: return ('CENSORED' if cal[k] + 1 + h < T else 'IMMATURE'), None
    if cal[k + 1 + h] - cal[k] != 1 + h: return 'CENSORED', None
    c = s['closes']; return 'OBSERVED', c[k + 1 + h] / c[k + 1] - 1


# ---------------- signal rules (independent) ----------------
def exact_sma(c, i, w):
    t = 0.0
    for k in range(i - w + 1, i + 1): t += c[k]
    return t / w


def detect_flags(c):
    n = len(c); out = {r: bytearray(n) for r in ('MOMENTUM_IMPROVED', 'MOMENTUM_DETERIORATED', 'TREND_UP', 'TREND_DOWN', 'NEW_52W_HIGH')}
    m26 = [None] * n
    for i in range(26, n): m26[i] = c[i] / c[i - 26] - 1
    roll = [None] * n; t = 0.0
    for i in range(n):
        t += c[i]
        if i >= 40: t -= c[i - 40]
        if i >= 39: roll[i] = t / 40
    def above(i):  # c[i] >= sma40(i), exact near ties
        s = roll[i]
        if abs(c[i] - s) <= 1e-9 * c[i]: s = exact_sma(c, i, 40)
        return c[i] >= s
    pm = [None] * n; dq = collections.deque()
    for i in range(n):
        # prior max of c[i-52..i-1]
        if i >= 52:
            while dq and dq[0] < i - 52: dq.popleft()
            pm[i] = c[dq[0]]
        while dq and c[dq[-1]] <= c[i]: dq.pop()
        dq.append(i)
    for i in range(max(1, WARMUP), n):
        a, b = m26[i], m26[i - 1]
        if a is not None and b is not None:
            if a >= 0 and b < 0: out['MOMENTUM_IMPROVED'][i] = 1
            if a < 0 and b >= 0: out['MOMENTUM_DETERIORATED'][i] = 1
        if roll[i] is not None and roll[i - 1] is not None:
            u, v = above(i), above(i - 1)
            if u and not v: out['TREND_UP'][i] = 1
            if (not u) and v: out['TREND_DOWN'][i] = 1
        if pm[i] is not None and pm[i - 1] is not None:
            if c[i] > pm[i] and not (c[i - 1] > pm[i - 1]): out['NEW_52W_HIGH'][i] = 1
    return out


def cooldown_events(flags):
    ev = []; last = -10 ** 9
    for i in range(len(flags)):
        if not flags[i]: continue
        if i - last >= COOLDOWN: ev.append(i)
        last = i
    return ev


# ---------------- pattern features (independent, exact near thresholds) ----------------
PATTERN_FEATURES = ('return12m1m', 'return6m', 'return3m', 'distanceTo52wHigh', 'drawdownFromPeak', 'volatility52w', 'aboveSma40w', 'sma10wAboveSma40w', 'rangeCompression52w', 'priceToAllTimeHigh')


def pattern_hits(c, terms):
    """terms: list of (feature, operator, value). returns list of bytearrays: 1 hit, 0 non-hit, 2 not measurable; index < 53 -> 3."""
    n = len(c); out = [bytearray([3]) * n for _ in terms]
    lc = [None] + [math.log(c[k] / c[k - 1]) for k in range(1, n)]
    run = []; m = 0.0
    for v in c: m = v if v > m else m; run.append(m)
    hi = collections.deque(); lo = collections.deque(); his = [None] * n; los = [None] * n
    for i in range(n):
        while hi and hi[0] <= i - 52: hi.popleft()
        while lo and lo[0] <= i - 52: lo.popleft()
        while hi and c[hi[-1]] <= c[i]: hi.pop()
        hi.append(i)
        while lo and c[lo[-1]] >= c[i]: lo.pop()
        lo.append(i)
        his[i] = c[hi[0]]; los[i] = c[lo[0]]
    s10 = [None] * n; s40 = [None] * n; t10 = t40 = 0.0
    for i in range(n):
        t10 += c[i]; t40 += c[i]
        if i >= 10: t10 -= c[i - 10]
        if i >= 40: t40 -= c[i - 40]
        if i >= 9: s10[i] = t10 / 10
        if i >= 39: s40[i] = t40 / 40
    for k in range(WARMUP, n):
        def feat(f):
            if f == 'return12m1m': return c[k - 4] / c[k - 52] - 1 if k >= 52 else None
            if f == 'return6m': return c[k] / c[k - 26] - 1
            if f == 'return3m': return c[k] / c[k - 13] - 1
            if f == 'distanceTo52wHigh': return c[k] / his[k] - 1
            if f == 'drawdownFromPeak': return c[k] / run[k] - 1
            if f == 'priceToAllTimeHigh': return c[k] / run[k]
            if f == 'rangeCompression52w': return (his[k] - los[k]) / los[k]
            if f == 'volatility52w':
                w = lc[max(1, k - 51):k + 1]
                if len(w) < 40: return None
                mu = 0.0
                for v in w: mu += v
                mu /= len(w); var = 0.0
                for v in w: var += (v - mu) * (v - mu)
                return math.sqrt(var / (len(w) - 1)) * math.sqrt(52)
            if f == 'aboveSma40w':
                s = s40[k]
                if abs(c[k] - s) <= 1e-9 * c[k]: s = exact_sma(c, k, 40)
                return c[k] > s
            if f == 'sma10wAboveSma40w':
                a, b = s10[k], s40[k]
                if abs(a - b) <= 1e-9 * abs(b): a, b = exact_sma(c, k, 10), exact_sma(c, k, 40)
                return a > b
        cache = {}
        for j, (f, op, val) in enumerate(terms):
            if f not in cache: cache[f] = feat(f)
            x = cache[f]
            if x is None: out[j][k] = 2; continue
            if op == 'eq': hit = x == val
            elif op == 'gte': hit = x >= val
            elif op == 'lte': hit = x <= val
            elif op == 'gt': hit = x > val
            else: hit = x < val
            out[j][k] = 1 if hit else 0
    return out


# ---------------- generic cell computation ----------------
def endpoint_rows(events, endpoint, fee, slip, ctrl, win):
    rows = []
    for e in events:
        if e['state'] != 'OBSERVED' or not (win[0] <= e['date'] <= win[1]): continue
        net = net_of(e['gross'], fee, slip)
        if endpoint == 'RAW_NET': v = net
        elif endpoint == 'SPY_EXCESS': v = None if e['bench'] is None else net - e['bench']
        else:
            c = ctrl.get(e['date'])
            v = None if not c or c[1] == 0 else net - net_of(c[0] / c[1], fee, slip)
        if v is not None: rows.append((e['sid'], e['date'], v))
    return rows


def compare_cell(par, label, rows, jcell, study_cal, B, costs_sens, events, ctrl, win, regimes=None, check_inference=True):
    par.eq(len(rows), jcell['n'], label + ':n')
    par.near(mean([r[2] for r in rows]), jcell['estimate'], label + ':estimate')
    if check_inference:
        inf = cbb(study_cal, subsample(rows), B)
        par.near(inf['p'], jcell['pValue'], label + ':p')
        if inf['ci'] and jcell['ci']: par.near(inf['ci'][0], jcell['ci'][0], label + ':ci0'); par.near(inf['ci'][1], jcell['ci'][1], label + ':ci1')
        else: par.eq(inf['ci'], jcell['ci'], label + ':ci')
    for cs in jcell.get('costSensitivity', []):
        rr = endpoint_rows(events, jcell['endpoint'], cs['feeBps'], cs['slippageBps'], ctrl, win)
        par.eq(len(rr), cs['n'], label + ':cost:n'); par.near(mean([r[2] for r in rr]), cs['mean'], label + ':cost:mean')
    for sp in jcell.get('subperiods', []):
        sub = [r[2] for r in rows if sp['from'] <= r[1] <= sp['to']]
        par.eq(len(sub), sp['n'], label + ':sub:n'); par.near(mean(sub), sp['mean'], label + ':sub:mean')
    if regimes is not None:
        for axis in ('trend', 'volatility'):
            groups = collections.defaultdict(list)
            for r in rows: groups[regimes.get(r[1], {}).get(axis, 'REGIME_UNAVAILABLE')].append(r[2])
            for g in jcell['regimes'][axis]:
                par.eq(len(groups.get(g['state'], [])), g['n'], label + ':reg:' + g['state'] + ':n'); par.near(mean(groups.get(g['state'], [])), g['mean'], label + ':reg:' + g['state'])
    return rows


def spy_regimes(spy, calendar, cfg):
    bars = [(d, spy[d]) for d in calendar if d in spy]; out = {}
    L, VL = cfg['lookbackBars'], cfg['volatilityLookbackBars']
    for k in range(max(L, VL), len(bars)):
        tr = bars[k][1] / bars[k - L][1] - 1
        rets = [bars[k - VL + 1 + j][1] / bars[k - VL + j][1] - 1 for j in range(VL)]
        mu = sum(rets) / len(rets); vol = math.sqrt(sum((r - mu) ** 2 for r in rets) / (len(rets) - 1)) * math.sqrt(cfg['annualization'])
        out[bars[k][0]] = dict(trend='POSITIVE_TREND' if tr > cfg['trendBand'] else 'NEGATIVE_TREND' if tr < -cfg['trendBand'] else 'SIDEWAYS', volatility='HIGH_VOLATILITY' if vol >= cfg['volatilityThreshold'] else 'LOW_VOLATILITY')
    return out


# ---------------- funded ledger (independent accounting) ----------------
def solve_target(before, weights, marked, rate):
    """Exact solution of v + rate * sum|w_k v - m_k| = before (piecewise linear, increasing)."""
    keys = sorted(set(weights) | set(marked))
    def f(v): return v + rate * sum(abs(weights.get(k, 0) * v - marked.get(k, 0)) for k in keys)
    bps = sorted({marked.get(k, 0) / weights[k] for k in keys if weights.get(k, 0) > 0} | {0.0, before})
    lo = 0.0
    for b in bps:
        if b > before: b = before
        if f(b) > before: hi = b; break
        lo = b
    else: hi = before
    flo, fhi = f(lo), f(hi)
    return lo if fhi == flo else lo + (before - flo) * (hi - lo) / (fhi - flo)


def funded(par, label, panel, calendar, flags_by_id, rule, study_cal, F, costs, spy, jv):
    ci = {d: i for i, d in enumerate(calendar)}
    jF, jL, H, N = ci[study_cal[0]], ci[study_cal[-1]], F['holdingWeeks'], F['maxPositions']
    last_s = jL + 1 + H
    uni = [s for s in panel if s['gap'][-1] == 0 and s['cal'][-1] >= last_s]
    sig = collections.defaultdict(list)
    for s in uni:
        for k in cooldown_events(flags_by_id[s['id']][rule]):
            j = s['cal'][k]
            if jF <= j <= jL and s['dates'][k] >= s['listingStart']: sig[j].append(s)
    held = {}; targets = {}; eps = []
    for j in range(jF, last_s):
        ex = j + 1; ch = False
        for sid in list(held):
            if held[sid][0] + H == ex: del held[sid]; ch = True
        if j <= jL:
            cands = sorted([s for s in sig.get(j, []) if s['id'] not in held], key=lambda s: sha('V10-STUDIES-FUNDED-1.0.0|' + s['id'] + '|' + calendar[j]))
            for s in cands[:max(0, N - len(held))]: held[s['id']] = (ex, s); eps.append((s['id'], ex)); ch = True
        if ch: targets[ex] = {held[k][1]['listingId']: 1 / N for k in held}
    byl = {s['listingId']: s for s in uni}
    pos = {s['listingId']: {d: c for d, c in zip(s['dates'], s['closes'])} for s in uni}
    rate = (costs['feeBps'] + costs['slippageBps']) / 10000; init = jv.get('ledgerInitialCapital', F['initialCapital'])
    cash = float(init); units = {}; vals = []; bvals = []
    sessions = calendar[jF:last_s + 1]
    for i, d in enumerate(sessions):
        idx = jF + i
        marked = {k: u * pos[k][d] for k, u in units.items()}
        before = cash + sum(marked.values())
        if idx in targets:
            w = targets[idx]; after = solve_target(before, w, marked, rate)
            deltas = sorted([(w.get(k, 0) * after - marked.get(k, 0), k) for k in set(w) | set(marked)])
            for delta, k in deltas:
                if abs(delta) <= 1e-12 * init: continue
                cash -= delta + abs(delta) * rate
                nu = units.get(k, 0) + delta / pos[k][d]
                if abs(nu) <= 1e-12: units.pop(k, None)
                else: units[k] = nu
        vals.append(cash + sum(u * pos[k][d] for k, u in units.items())); bvals.append(init * spy[d] / spy[sessions[0]])
    years = (datetime.date.fromisoformat(sessions[-1]) - datetime.date.fromisoformat(sessions[0])).days / 365.25
    allv = [init] + vals; peak = allv[0]; mdd = 0.0
    for v in allv: peak = max(peak, v); mdd = min(mdd, v / peak - 1)
    rs = [allv[i + 1] / allv[i] - 1 for i in range(len(vals))]
    mu = mean(rs); sd = math.sqrt(sum((r - mu) ** 2 for r in rs) / (len(rs) - 1))
    par.eq(len(eps), jv['_episodes'], label + ':episodes')
    par.near(vals[-1], jv['endCapital'], label + ':endCapital', rel=1e-8)
    par.near((vals[-1] / init) ** (1 / years) - 1, jv['metrics']['cagr'], label + ':cagr', rel=1e-8)
    par.near(mdd, jv['metrics']['maxDrawdown'], label + ':maxDD', rel=1e-8)
    par.near(mu / sd * math.sqrt(52), jv['sharpe'], label + ':sharpe', rel=1e-7)
    par.near(bvals[-1], jv['spy']['endCapital'], label + ':spyEnd', rel=1e-9)


def main():
    run_dir, root = sys.argv[1], sys.argv[2]; outp = sys.argv[3] if len(sys.argv) > 3 else os.path.join(run_dir, 'python-parity.json')
    t0 = time.time(); par = Parity()
    reg, man = load(root, run_dir); R = reg['registration']
    calendar, panel = build_population(root, man, par)
    T = len(calendar); win = R['window']['signalDates']; study_cal = [d for d in calendar if win[0] <= d <= win[1]]
    spy = load_spy(root); base = R['costs']['base']; fee, slip = base['feeBps'], base['slippageBps']
    regimes = spy_regimes(spy, calendar, {'lookbackBars': 26, 'volatilityLookbackBars': 26, 'annualization': 52, 'trendBand': 0.05, 'volatilityThreshold': 0.25})
    print('population', len(panel), round(time.time() - t0, 1), 's', file=sys.stderr)
    report = dict(schemaVersion='v10-studies-python-parity-1.0.0', implementation='independent stdlib Python', run=os.path.basename(run_dir.rstrip('/')), frame=len(panel))
    B = lambda h: 104 if h >= 52 else 52

    # ---------- SIGNAL ----------
    sig_path = os.path.join(run_dir, 'signal-backtest-evidence.json')
    flags_by_id = {s['id']: detect_flags(s['closes']) for s in panel}
    if os.path.exists(sig_path):
        J = json.load(open(sig_path)); SB = R['studies']['SIGNAL_BACKTEST']
        jcells = {(c['rule'], c['horizonWeeks'], c['endpoint']): c for c in J['cells']}
        pvals = []
        for h in SB['horizonsWeeks']:
            ev_by_rule = {r: [] for r in SB['rules']}
            all_s = collections.defaultdict(float); all_n = collections.defaultdict(int)
            det_s = {r: collections.defaultdict(float) for r in SB['rules']}; det_n = {r: collections.defaultdict(int) for r in SB['rules']}
            for s in panel:
                fl = flags_by_id[s['id']]; c = s['closes']
                for r in SB['rules']:
                    for k in cooldown_events(fl[r]):
                        st, g = state_of(s, k, h, T, SIG_LOOKBACK)
                        bench = None
                        if st == 'OBSERVED': bench = spy_ret(spy, s['dates'][k + 1], s['dates'][k + 1 + h])
                        ev_by_rule[r].append(dict(sid=s['id'], date=s['dates'][k], state=st, gross=g, bench=bench))
                for k in range(WARMUP, len(c)):
                    if not eligible(s, k, SIG_LOOKBACK): continue
                    st, g = state_of(s, k, h, T, SIG_LOOKBACK)
                    if st != 'OBSERVED': continue
                    d = s['dates'][k]; all_s[d] += g; all_n[d] += 1
                    for r in SB['rules']:
                        if fl[r][k]: det_s[r][d] += g; det_n[r][d] += 1
            for r in SB['rules']:
                ctrl = {d: (all_s[d] - det_s[r][d], all_n[d] - det_n[r][d]) for d in all_n}
                evs = ev_by_rule[r]; inw = [e for e in evs if win[0] <= e['date'] <= win[1]]
                cov = jcells[(r, h, 'RAW_NET')]['coverage']
                par.eq(len(inw), cov['events'], f'sig:{r}:{h}:events'); par.eq(sum(1 for e in inw if e['state'] == 'OBSERVED'), cov['observed'], f'sig:{r}:{h}:observed')
                par.eq(sum(1 for e in inw if e['state'] == 'CENSORED'), cov['censored'], f'sig:{r}:{h}:censored'); par.eq(sum(1 for e in inw if e['state'] == 'IMMATURE'), cov['immature'], f'sig:{r}:{h}:immature')
                for ep in SB['endpoints']:
                    jc = jcells[(r, h, ep)]; rows = endpoint_rows(evs, ep, fee, slip, ctrl, win)
                    compare_cell(par, f'sig:{r}:{h}:{ep}', rows, jc, study_cal, B(h), True, evs, ctrl, win, regimes)
                    pvals.append(((r, h, ep), cbb(study_cal, subsample(rows), B(h))['p']))
            print('signal h', h, round(time.time() - t0, 1), 's', file=sys.stderr)
        adj = holm([p for _, p in pvals])
        for (key, _), a in zip(pvals, adj): par.near(a, jcells[key]['holmAdjustedP'], 'sig:holm:' + ':'.join(map(str, key)))
        report['signalCells'] = len(pvals)
        # funded
        fp = os.path.join(run_dir, 'funded-strategy-evidence.json')
        if os.path.exists(fp):
            FJ = json.load(open(fp)); Fp = SB['fundedStrategy']['parameters']
            for o in FJ['performance']:
                for name, costs in (('base', Fp['costs']), ('costSensitivity', Fp['costSensitivity'])):
                    jv = dict(o['variants'][name]); jv['_episodes'] = o['episodes']
                    funded(par, f"funded:{o['rule']}:{name}", panel, calendar, flags_by_id, o['rule'], study_cal, Fp, costs, spy, jv)
            report['fundedStrategies'] = len(FJ['performance'])
        print('signal done', round(time.time() - t0, 1), 's', file=sys.stderr)

    # ---------- PATTERN + REPLAY ----------
    pat_path = os.path.join(run_dir, 'pattern-evidence.json'); rep_path = os.path.join(run_dir, 'same-stock-replay-evidence.json')
    if os.path.exists(pat_path) or os.path.exists(rep_path):
        meth = json.load(open(os.path.join(root, 'quant/methodology/pattern-research-v1.json'))); PE = R['studies']['PATTERN_EVIDENCE']
        cands = [next(c for c in meth['candidates'] if c['id'] == pid) for pid in PE['candidates']]
        terms = [(c['feature'], c['operator'], c['value']) for c in cands]
        hits = {s['id']: pattern_hits(s['closes'], terms) for s in panel}
        print('pattern hits', round(time.time() - t0, 1), 's', file=sys.stderr)
        J = json.load(open(pat_path)) if os.path.exists(pat_path) else None
        jcells = {(c['pattern'], c['horizonWeeks'], c['endpoint']): c for c in J['cells']} if J else {}
        pvals = []; above = {}
        for j, pid in enumerate(PE['candidates']):
            for h in PE['horizonsWeeks']:
                evs = []; cs = collections.defaultdict(float); cn = collections.defaultdict(int)
                for s in panel:
                    hv = hits[s['id']][j]; last = -10 ** 9; c = s['closes']
                    for k in range(WARMUP, len(c)):
                        x = hv[k]
                        if x == 2: continue
                        if x == 1 and k - last < COOLDOWN: continue
                        st, g = state_of(s, k, h, T, None)
                        if x == 1:
                            last = k; bench = spy_ret(spy, s['dates'][k + 1], s['dates'][k + 1 + h]) if st == 'OBSERVED' else None
                            evs.append(dict(sid=s['id'], date=s['dates'][k], state=st, gross=g, bench=bench))
                        elif st == 'OBSERVED': cs[s['dates'][k]] += g; cn[s['dates'][k]] += 1
                ctrl = {d: (cs[d], cn[d]) for d in cn}
                if pid == 'above-40w-line': above[h] = (evs, ctrl)
                if J:
                    cov = J['maturedOutcomes'][pid + ':' + str(h)]; inw = [e for e in evs if win[0] <= e['date'] <= win[1]]
                    par.eq(len(inw), cov['events'], f'pat:{pid}:{h}:events'); par.eq(sum(1 for e in inw if e['state'] == 'OBSERVED'), cov['observed'], f'pat:{pid}:{h}:observed')
                    for ep in PE['endpoints']:
                        rows = endpoint_rows(evs, ep, fee, slip, ctrl, win)
                        compare_cell(par, f'pat:{pid}:{h}:{ep}', rows, jcells[(pid, h, ep)], study_cal, B(h), True, evs, ctrl, win, regimes)
                        pvals.append(((pid, h, ep), cbb(study_cal, subsample(rows), B(h))['p']))
            print('pattern', pid, round(time.time() - t0, 1), 's', file=sys.stderr)
        if J:
            adj = holm([p for _, p in pvals])
            for (key, _), a in zip(pvals, adj): par.near(a, jcells[key]['holmAdjustedP'], 'pat:holm:' + ':'.join(map(str, key)))
            report['patternCells'] = len(pvals)
        if os.path.exists(rep_path):
            RJ = json.load(open(rep_path)); SR = R['studies']['SAME_STOCK_REPLAY']
            salt = 'V10-STUDIES-REPLAY-SAMPLE-1.0.0|seed=20261028|'
            sample = sorted(panel, key=lambda s: sha(salt + s['id']))[:SR['caseSelection']['listings']]
            par.eq([s['id'] for s in sample], RJ['population']['sampledListings'], 'replay:sample')
            order = {s['id']: i for i, s in enumerate(sample)}
            rp = []
            for h in SR['horizonsWeeks']:
                evs_all, ctrl = above[h]
                evs = sorted([e for e in evs_all if e['sid'] in order], key=lambda e: (order[e['sid']], e['date']))
                for ep in SR['endpoints']:
                    jc = next(c for c in RJ['cells'] if c['horizonWeeks'] == h and c['endpoint'] == ep)
                    rows = endpoint_rows(evs, ep, fee, slip, ctrl, win)
                    compare_cell(par, f'rep:{h}:{ep}', rows, jc, study_cal, B(h), True, evs, ctrl, win, regimes)
                    rp.append(cbb(study_cal, subsample(rows), B(h))['p'])
                rows = endpoint_rows(evs, 'BASE_RATE_EXCESS', fee, slip, ctrl, win); by = collections.defaultdict(list)
                for sid, d, v in rows: by[sid].append((d, v))
                pairs = []
                for sid in by:
                    rs = sorted(by[sid]); m = len(rs) // 2; a, b = rs[:m], rs[m:]
                    if len(a) >= 2 and len(b) >= 2: pairs.append((mean([x[1] for x in a]), mean([x[1] for x in b])))
                def ranks(v):
                    o = sorted(range(len(v)), key=lambda i: v[i]); r = [0.0] * len(v); i = 0
                    while i < len(o):
                        j = i
                        while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]: j += 1
                        for t in range(i, j + 1): r[o[t]] = (i + j) / 2
                        i = j + 1
                    return r
                ra, rb = ranks([p[0] for p in pairs]), ranks([p[1] for p in pairs]); ma, mb = mean(ra), mean(rb)
                cov = sum((x - ma) * (y - mb) for x, y in zip(ra, rb)); rho = cov / math.sqrt(sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb))
                z = math.atanh(max(-0.999999, min(0.999999, rho))) * math.sqrt(len(pairs) - 3); p = math.erfc(abs(z) / math.sqrt(2))
                jp = next(x for x in RJ['persistence'] if x['horizonWeeks'] == h)
                par.eq(len(pairs), jp['n'], f'rep:persist:{h}:n'); par.near(rho, jp['estimate'], f'rep:persist:{h}:rho'); par.near(p, jp['pValue'], f'rep:persist:{h}:p', rel=1e-5)
                rp.append(p)
            report['replayTests'] = len(rp)
        print('pattern/replay done', round(time.time() - t0, 1), 's', file=sys.stderr)

    kinds = collections.Counter(':'.join(x for x in str(f[0]).split(':') if not x.isdigit())[:80] for f in par.fail)
    report.update(checks=par.checks, failures=len(par.fail), failureKinds=dict(kinds.most_common(60)), firstFailures=par.fail[:40], maxRelativeDifference=par.max_rel, seconds=round(time.time() - t0, 1), state='PASS' if not par.fail else 'FAIL')
    json.dump(report, open(outp, 'w'), indent=1, default=str)
    print(json.dumps({k: report[k] for k in ('state', 'checks', 'failures', 'maxRelativeDifference', 'seconds')}))


if __name__ == '__main__':
    main()
