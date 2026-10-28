#!/usr/bin/env python3
"""V11 DISCOVERY - independent stdlib recomputation (run with python3 -I).

Recomputes from the exported raw inputs (weekly closes, split factors, SPY, PIT panel scores and market caps)
the selection, the funded portfolio (costs per side on traded notional), CAGR, max drawdown, Sharpe, weekly
excess vs SPY and its circular calendar block bootstrap p-value for the final hypotheses in VALIDATION and TEST,
and one ORACLE_LOOKAHEAD cell (TRAIN, price universe, 52-week horizon, N 20). Separate implementation; it does
not import or port the JavaScript modules. Usage: python3 -I verify_discovery.py <input.json.gz> <docs_dir> [--out f]
"""
import gzip, json, math, sys, os
from datetime import date

def load(p):
    with gzip.open(p, 'rt') as f:
        return json.load(f)

def years_between(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days / 365.25

class Data:
    def __init__(self, d):
        self.cal = d['calendar']; self.spy = d['spy']; self.T = len(self.cal)
        self.L = {}
        for l in d['listings']:
            l['last'] = l['cal0'] + len(l['closes']) - 1
            sp = sorted(l['splits'])
            # quoted price factor: product of split factors dated after the bar date
            fac = [1.0] * len(l['closes']); acc = 1.0; q = len(sp) - 1
            for k in range(len(l['closes']) - 1, -1, -1):
                d0 = self.cal[l['cal0'] + k]
                while q >= 0 and sp[q][0] > d0:
                    acc *= sp[q][1]; q -= 1
                fac[k] = acc
            l['fac'] = fac
            self.L[l['id']] = l
        self.panel = {p['date']: {r[0]: r for r in p['rows']} for p in d['panel']}
        last = {}
        for j, dd in enumerate(self.cal):
            last[dd[:7]] = j
        self.month_ends = sorted(last.values())

    def c(self, l, j):
        if j < l['cal0'] or j > l['last']:
            return None
        return l['closes'][j - l['cal0']]

    def base_ok(self, l, j):
        return (self.c(l, j) is not None and self.c(l, j + 1) is not None and l['listingStart'] <= self.cal[j]
                and j - l['cal0'] + 1 >= 57)

def pct_rank(vals):
    """midrank percentile, higher value -> higher percentile"""
    idx = sorted(range(len(vals)), key=lambda i: vals[i])
    out = [0.0] * len(vals); s = 0; n = len(vals)
    while s < n:
        e = s
        while e + 1 < n and vals[idx[e + 1]] == vals[idx[s]]:
            e += 1
        pr = ((s + e) / 2 + 0.5) / n
        for k in range(s, e + 1):
            out[idx[k]] = pr
        s = e + 1
    return out

def select_fund(D, j, kind, N):
    rows = D.panel.get(D.cal[j])
    if rows is None:
        return []
    cand = []
    for lid, l in D.L.items():
        if not D.base_ok(l, j):
            continue
        r = rows.get(lid)
        if r is None:
            continue
        raw = D.c(l, j) * l['fac'][j - l['cal0']]
        if not raw >= 5:
            continue
        q, p, mcap = r[1], r[2], r[3]
        if mcap is None or not mcap >= 3e8:
            continue
        if kind == 'QUAL':
            if q is None:
                continue
            cand.append((lid, [q]))
        else:
            r12 = D.c(l, j - 4) / D.c(l, j - 52) - 1
            if p is None:
                continue
            cand.append((lid, [p, r12]))
    if not cand:
        return []
    k = len(cand[0][1])
    ranks = [pct_rank([c[1][m] for c in cand]) for m in range(k)]
    scored = [(sum(ranks[m][i] for m in range(k)) / k, cand[i][0]) for i in range(len(cand))]
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [x[1] for x in scored[:N]]

def simulate(D, decisions, end_exec, picker, fee=10, slip=5):
    rate = (fee + slip) / 1e4
    cash = 1.0; units = {}; eq = []
    targets = {j + 1: j for j in decisions if j + 1 < end_exec}
    for s in range(decisions[0], end_exec + 1):
        price = {k: D.c(D.L[k], s) for k in units}
        if s in targets or s == end_exec:
            picks = picker(targets[s]) if s != end_exec else []
            w = {k: 1.0 / len(picks) for k in picks} if picks else {}
            for k in w:
                price[k] = D.c(D.L[k], s)
            m = {k: units.get(k, 0.0) * price[k] for k in set(units) | set(w)}
            before = cash + sum(m.values())
            lo, hi = 0.0, before
            for _ in range(200):
                mid = (lo + hi) / 2
                cost = rate * sum(abs(w.get(k, 0.0) * mid - m[k]) for k in m)
                if mid + cost > before:
                    hi = mid
                else:
                    lo = mid
            after = (lo + hi) / 2
            for k in m:
                delta = w.get(k, 0.0) * after - m[k]
                cash -= delta + abs(delta) * rate
                nu = units.get(k, 0.0) + delta / price[k]
                if abs(nu * price[k]) <= 1e-12:
                    units.pop(k, None)
                else:
                    units[k] = nu
        val = cash + sum(u * D.c(D.L[k], s) for k, u in units.items())
        eq.append((D.cal[s], val, s))
    return eq

def xorshift_block_p(dates_n, values, block, reps=1999, seed=1729):
    n = len(values); est = sum(values) / n
    pre = [0.0]
    for k in range(2 * n):
        pre.append(pre[-1] + values[k % n])
    st = seed; boots = []
    for _ in range(reps):
        tot = 0.0; cnt = 0; used = 0
        while used < n:
            st ^= (st << 13) & 0xFFFFFFFF; st ^= st >> 17; st ^= (st << 5) & 0xFFFFFFFF; st &= 0xFFFFFFFF
            start = int(st / 4294967296 * n); ln = min(block, n - used)
            tot += pre[start + ln] - pre[start]; cnt += ln; used += block
        boots.append(tot / cnt)
    tails = sum(1 for b in boots if abs(b - est) >= abs(est))
    return est, (1 + tails) / (reps + 1)

def metrics(D, eq):
    v = [e[1] for e in eq]; d = [e[0] for e in eq]
    r = [v[k + 1] / v[k] - 1 for k in range(len(v) - 1)]
    rs = [D.spy[eq[k + 1][2]] / D.spy[eq[k][2]] - 1 for k in range(len(eq) - 1)]
    y = years_between(d[0], d[-1]); cagr = (v[-1] / v[0]) ** (1 / y) - 1
    peak = v[0]; mdd = 0.0
    for x in v:
        peak = max(peak, x); mdd = min(mdd, x / peak - 1)
    m = sum(r) / len(r); sd = math.sqrt(sum((x - m) ** 2 for x in r) / (len(r) - 1))
    ex = [a - b for a, b in zip(r, rs)]
    est, p = xorshift_block_p(len(ex), ex, 26)
    return {'cagr': cagr, 'maxDrawdown': mdd, 'sharpe': m / sd * math.sqrt(52), 'excessVsSpyAnnualised': est * 52, 'pValueBlock26': p, 'weeks': len(r)}

def schedule_monthly(D, a, b, every):
    me = D.month_ends
    inp = [j for j in me if a <= D.cal[j] <= b]
    inp = [j for k, j in enumerate(inp) if k % every == 0]
    nxt = me[me.index(inp[-1]) + every]
    return inp, nxt + 1

def main():
    inp, docs = sys.argv[1], sys.argv[2]
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(docs, 'python-check-1.0.0.json')
    D = Data(load(inp))
    val = json.load(open(os.path.join(docs, 'validation-results-1.0.0.json')))
    tst = json.load(open(os.path.join(docs, 'test-results-1.0.0.json')))
    ora = json.load(open(os.path.join(docs, 'oracle-train-1.0.0.json')))
    checks = []
    cases = [('VALIDATION', 'CF06', 'QUAL', 10, ('2017-01-01', '2020-12-31'), val), ('VALIDATION', 'CF10', 'PROF_MOM', 20, ('2017-01-01', '2020-12-31'), val),
             ('TEST', 'H1', 'QUAL', 10, ('2021-01-01', '2025-12-31'), tst), ('TEST', 'H2', 'PROF_MOM', 20, ('2021-01-01', '2025-12-31'), tst)]
    for stage, cid, kind, N, (a, b), ref in cases:
        decs, end = schedule_monthly(D, a, b, 3)
        eq = simulate(D, decs, end, lambda j, kind=kind, N=N: select_fund(D, j, kind, N))
        mm = metrics(D, eq)
        js = next(r for r in ref['results'] if r['id'] == cid)
        jsv = {'cagr': js['strategy']['cagr'], 'maxDrawdown': js['strategy']['maxDrawdown'], 'sharpe': js['strategy']['sharpe'], 'excessVsSpyAnnualised': js['excess']['vsSpy']['annualisedMean'], 'pValueBlock26': js['excess']['vsSpy']['pValue'], 'weeks': js['strategy']['weeks']}
        diff = {k: abs(mm[k] - jsv[k]) for k in mm}
        checks.append({'stage': stage, 'id': cid, 'python': mm, 'javascript': jsv, 'absDiff': diff, 'pass': all(diff[k] <= (1e-6 if k != 'pValueBlock26' else 1e-9) for k in diff)})
    # Oracle cell: TRAIN, price universe (quoted >= 5), 52-week horizon, N 20.
    first = next(j for j, d in enumerate(D.cal) if d >= '2001-01-01')
    decs = list(range(first, D.T, 52)); decs = [j for j in decs if D.cal[j] <= '2012-12-31']; end = decs[-1] + 52 + 1
    per = []
    def oracle_pick(j):
        rows = []
        for lid, l in D.L.items():
            if not D.base_ok(l, j):
                continue
            if not D.c(l, j) * l['fac'][j - l['cal0']] >= 5:
                continue
            e = min(j + 53, l['last'])
            rows.append((D.c(l, e) / D.c(l, j + 1) - 1, lid))
        rows.sort(key=lambda x: (-x[0], x[1]))
        per.append((sum(x[0] for x in rows[:20]) / 20, sum(x[0] for x in rows) / len(rows)))
        return [x[1] for x in rows[:20]]
    eq = simulate(D, decs, end, oracle_pick)
    v = [e[1] for e in eq]; cagr = (v[-1] / v[0]) ** (1 / years_between(eq[0][0], eq[-1][0])) - 1
    cell = next(c for c in ora['cells'] if c.get('cadence') == 'WEEKS_52' and c['N'] == 20 and c['universe']['filters'] == [['rawPx', 'gte', 5]])
    o = {'oracleFundedCagrNet': cagr, 'perIntervalOracleGross': sum(x[0] for x in per) / len(per), 'perIntervalPopulationGross': sum(x[1] for x in per) / len(per)}
    od = {k: abs(o[k] - cell[k]) / max(1e-12, abs(cell[k])) for k in o}
    checks.append({'stage': 'TRAIN', 'id': 'ORACLE_LOOKAHEAD PRICE PX5 WEEKS_52 N20', 'python': o, 'javascript': {k: cell[k] for k in o}, 'relDiff': od, 'pass': all(x <= 1e-6 for x in od.values())})
    res = {'schemaVersion': 'v11-discovery-python-check-1.0.0', 'evidenceKind': 'TECHNICAL_PARITY', 'implementation': 'python3 -I stdlib, separate implementation from exported loader output (not a holdout)',
           'checks': checks, 'allPass': all(c['pass'] for c in checks), 'certificationStatus': 'NOT_CERTIFIED', 'productionApproved': False}
    with open(out, 'w') as f:
        json.dump(res, f, indent=1)
        f.write('\n')
    for c in checks:
        print(c['stage'], c['id'], 'PASS' if c['pass'] else 'FAIL', json.dumps(c.get('absDiff') or c.get('relDiff')))

if __name__ == '__main__':
    main()
