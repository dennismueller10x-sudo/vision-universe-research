#!/usr/bin/env python3
"""V11 WINNERS - independent stdlib re-computation (technical parity, not a holdout).

Usage: python3 -I verify_winners.py <private_dir> <pit_docs_dir> <out_json>

Inputs (private, outside the repository):
  <private_dir>/python-input.json.gz  loader-qualified weekly closes on the frame calendar, lifecycle, SPY, cohort dates
                                      (the loader qualification itself is taken as input, as in V10)
  <private_dir>/js-check.json.gz      the JavaScript classes, features and pooled lift tables to compare against
  <pit_docs_dir>/<cik>.json.gz        V10 PIT documents (fundamental sample only)
Re-implemented here from the rules in registration-1.0.0.json, without porting the JavaScript code:
membership, forward outcomes, classes, all price features, three fundamental ratios for a hash sample,
mid-rank percentiles and the pooled top-quintile lift tables.
"""
import datetime, gzip, hashlib, json, math, os, sys

HORIZONS = {'1Y': 52, '3Y': 156, '5Y': 260}
PRICE = ['mom3m', 'mom6m', 'mom12_1m', 'rsSpy12_1m', 'near52wHigh', 'shareAbove40w', 'trendSlope52w', 'trendR2_52w', 'drawdown52w', 'vol52w']
DIRECTION = {'mom3m': 1, 'mom6m': 1, 'mom12_1m': 1, 'rsSpy12_1m': 1, 'near52wHigh': 1, 'shareAbove40w': 1, 'trendSlope52w': 1, 'trendR2_52w': 1,
             'drawdown52w': -1, 'vol52w': -1, 'logMarketCap': 1, 'revenueGrowthTtmYoy': 1, 'revenueCagr3y': 1, 'epsCagr3y': 1, 'grossMarginTtm': 1,
             'operatingMarginTtm': 1, 'roaTtm': 1, 'roeTtm': 1, 'salesYield': 1, 'earningsYield': 1, 'bookToMarket': 1, 'accrualRatio': -1,
             'netDebtToAssets': -1, 'fcfMarginTtm': 1, 'salesToMarketCap': 1, 'equityToAssets': 1}


def load(p):
    with gzip.open(p, 'rb') as f:
        return json.loads(f.read().decode('utf-8'))


def ok(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def price_features(c, k, spy, cal_of):
    """closes c (list), bar k; spy(j) -> SPY close at the calendar date of bar j."""
    out = {}
    def g(j):
        return c[j] if 0 <= j < len(c) and c[j] > 0 else None
    c0 = g(k)
    if c0 is None:
        return out
    if g(k - 13): out['mom3m'] = c0 / g(k - 13) - 1
    if g(k - 26): out['mom6m'] = c0 / g(k - 26) - 1
    if g(k - 4) and g(k - 52):
        out['mom12_1m'] = g(k - 4) / g(k - 52) - 1
        a, b = spy(k - 4), spy(k - 52)
        if a and b:
            out['rsSpy12_1m'] = math.log(g(k - 4) / g(k - 52)) - math.log(a / b)
    if k >= 51:
        w = c[k - 51:k + 1]
        out['near52wHigh'] = c0 / max(w)
        ys = [math.log(v) for v in w]
        xm, ym = 25.5, sum(ys) / 52
        sxy = sum((i - xm) * (y - ym) for i, y in enumerate(ys)); sxx = sum((i - xm) ** 2 for i in range(52)); syy = sum((y - ym) ** 2 for y in ys)
        out['trendSlope52w'] = sxy / sxx * 52
        out['trendR2_52w'] = sxy * sxy / (sxx * syy) if syy > 0 else 0.0
        if k >= 52:
            r = [math.log(c[j] / c[j - 1]) for j in range(k - 51, k + 1)]
            m = sum(r) / 52
            out['vol52w'] = math.sqrt(sum((x - m) ** 2 for x in r) / 51) * math.sqrt(52)
    if k >= 52:
        peak, dd = 0.0, 0.0
        for j in range(k - 52, k + 1):
            peak = max(peak, c[j]); dd = min(dd, c[j] / peak - 1)
        out['drawdown52w'] = -dd
    if k >= 90:
        above = ties = 0
        for j in range(k - 51, k + 1):
            sma = sum(c[j - 39:j + 1]) / 40
            if abs(c[j] - sma) <= 1e-12 * abs(sma): ties += 1  # close equals its SMA: '>' depends on summation rounding
            elif c[j] > sma: above += 1
        out['shareAbove40w'] = above / 52
        out['_ties'] = ties
    return out


def midrank_pct(vals, sign):
    idx = [i for i, v in enumerate(vals) if v is not None]
    n = len(idx); out = [None] * len(vals)
    idx.sort(key=lambda i: sign * vals[i])
    i = 0
    while i < n:
        j = i
        while j + 1 < n and vals[idx[j + 1]] == vals[idx[i]]: j += 1
        mid = (i + j) / 2 + 1
        for q in range(i, j + 1): out[idx[q]] = (mid - 0.5) / n
        i = j + 1
    return out


def classes(rets, dnc):
    n = len(rets); d = sorted(rets, reverse=True); a = sorted(rets)
    t1 = d[max(0, math.ceil(0.01 * n) - 1)]; t5 = d[max(0, math.ceil(0.05 * n) - 1)]; tl = a[max(0, math.ceil(0.10 * n) - 1)]
    pct = midrank_pct(rets, 1)
    return [(r >= t1, r >= t5, r <= tl or dnc[i], 0.2 < pct[i] <= 0.8) for i, r in enumerate(rets)]


def outcome(dates_ci, closes, life, k, h, cal_last):
    n = len(closes); e, x = k + 1, k + 1 + h
    if dates_ci[k] + 1 + h > cal_last: return ('IMMATURE', None)
    if e >= n or dates_ci[e] != dates_ci[k] + 1: return ('NO_ENTRY_BAR', None)
    if x < n:
        if dates_ci[x] - dates_ci[k] != 1 + h: return ('GAP', None)
        return ('OBSERVED', closes[x] / closes[e] - 1)
    term = (life or {}).get('terminal') or {}
    if term.get('kind') == 'CASH_MERGER' and ok(term.get('cashPerShare')) and term['cashPerShare'] > 0:
        return ('TERMINAL_CONSIDERATION', term['cashPerShare'] / closes[e] - 1)
    if term.get('kind') == 'DELISTED_NO_CONSIDERATION': return ('DELISTED_NO_CONSIDERATION', -1.0)
    return ('CENSORED', closes[-1] / closes[e] - 1)


def rel_close(a, b, tol):
    if a is None or b is None: return a is None and b is None
    return abs(a - b) <= tol * max(1.0, abs(a), abs(b))


def doc_at(versions, t):
    d = None
    for v in versions:
        if v['from'] <= t: d = v
        else: break
    return d


def main():
    priv, docs_dir, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    P = load(os.path.join(priv, 'python-input.json.gz')); J = load(os.path.join(priv, 'js-check.json.gz'))
    cal = P['calendar']; ci = {d: i for i, d in enumerate(cal)}; cal_last = len(cal) - 1; spy = P['spy']
    listings = []
    for l in P['listings']:
        listings.append((l['id'], l['listingStart'], [ci[d] for d in l['dates']], l['closes'], l['lifecycle']))
    report = {'schemaVersion': 'v11-winners-python-check-1.0.0', 'evidenceKind': 'TECHNICAL_PARITY', 'implementation': 'python3 -I, stdlib only, independent re-implementation',
              'note': 'A second language on the same loader output is technical parity, not a holdout.'}
    # ---- membership + price features ----
    members = {}  # date -> list of (id, k, li)
    feat_checks = feat_fail = tie_resolved = 0; feat_fail_examples = []
    js_feat = {d: {row[0]: row[1] for row in rows} for d, rows in J['features'].items()}
    for date in P['cohorts']:
        t = ci[date]; mem = []
        for li, (sid, start, dci, closes, life) in enumerate(listings):
            k = t - dci[0]
            if k < 0 or k >= len(dci) or dci[k] != t: continue
            if cal[dci[k]] < start: continue
            if k < 52 or dci[k] - dci[k - 52] != 52: continue
            mem.append((sid, k, li))
            pf = price_features(closes, k, lambda j: spy[dci[j]] if spy[dci[j]] else None, None)
            jf = js_feat[date].get(sid, {})
            ties = pf.pop('_ties', 0)
            if ties and ok(pf.get('shareAbove40w')) and ok(jf.get('shareAbove40w')) and -1e-12 <= jf['shareAbove40w'] - pf['shareAbove40w'] <= ties / 52 + 1e-12:
                tie_resolved += 1; pf['shareAbove40w'] = jf['shareAbove40w']
            for f in PRICE:
                feat_checks += 1
                if not rel_close(pf.get(f), jf.get(f), 1e-9):
                    feat_fail += 1
                    if len(feat_fail_examples) < 5: feat_fail_examples.append([date, sid, f, pf.get(f), jf.get(f)])
            for f in PRICE:
                if f in pf: jf['_py_' + f] = pf[f]
        members[date] = mem
    js_members = {d: set(r[0] for r in rows) for d, rows in J['features'].items()}
    mem_mismatch = sum(1 for d in P['cohorts'] if set(m[0] for m in members[d]) != js_members.get(d, set()))
    report['membership'] = {'cohorts': len(P['cohorts']), 'memberCohortRows': sum(len(v) for v in members.values()), 'cohortsWithDifferentMemberSet': mem_mismatch}
    report['priceFeatures'] = {'checks': feat_checks, 'failures': feat_fail, 'tolerance': 'relative 1e-9', 'examples': feat_fail_examples,
                              'shareAbove40wExactTiesAccepted': tie_resolved, 'tieRule': 'a weekly close equal to its 40-week SMA within 1e-12 is an exact tie; strict > then depends on floating-point summation order (Python sum() is compensated). Accepted when the JS value lies within [python, python + ties/52].'}
    # ---- outcomes + classes ----
    oc = {}; cls_checks = cls_fail = ret_fail = 0; cls_examples = []
    for h, hb in HORIZONS.items():
        js_rows = {d: rows for d, rows in J['classes'][h]}
        oc[h] = {}
        for date in P['cohorts']:
            rows = []
            for sid, k, li in members[date]:
                _, _, dci, closes, life = listings[li]
                st, r = outcome(dci, closes, life, k, hb, cal_last)
                if st in ('OBSERVED', 'TERMINAL_CONSIDERATION', 'DELISTED_NO_CONSIDERATION', 'CENSORED'): rows.append((sid, r, st == 'DELISTED_NO_CONSIDERATION'))
            if not rows:
                if date in js_rows: cls_fail += 1
                continue
            cl = classes([r for _, r, _ in rows], [x for _, _, x in rows])
            oc[h][date] = {sid: (r, c) for (sid, r, _), c in zip(rows, cl)}
            jr = js_rows.get(date)
            if jr is None: cls_fail += 1; continue
            for sid, jret, j1, j5, jl, ja in jr:
                cls_checks += 1
                pr = oc[h][date].get(sid)
                if pr is None: cls_fail += 1; continue
                if abs(pr[0] - jret) > 5.000001e-7: ret_fail += 1  # JS export rounds to 1e-6
                if (pr[1][0], pr[1][1], pr[1][2], pr[1][3]) != (bool(j1), bool(j5), bool(jl), bool(ja)):
                    cls_fail += 1
                    if len(cls_examples) < 5: cls_examples.append([h, date, sid, pr[0], list(pr[1]), [j1, j5, jl, ja]])
    report['outcomesAndClasses'] = {'checks': cls_checks, 'classFailures': cls_fail, 'returnFailures': ret_fail, 'examples': cls_examples,
                                    'winnersTop1': {h: sum(1 for d in oc[h].values() for _, c in d.values() if c[0]) for h in HORIZONS},
                                    'winnersTop5': {h: sum(1 for d in oc[h].values() for _, c in d.values() if c[1]) for h in HORIZONS}}
    # ---- pooled lift tables (top quintile) ----
    lift_checks = lift_fail = 0; lift_examples = []; py_lift = {}
    for h in HORIZONS:
        py_lift[h] = {}
        for f, sign in DIRECTION.items():
            acc = {'top1': [0, 0, 0, 0], 'top5': [0, 0, 0, 0], 'loser': [0, 0, 0, 0], 'top5Bottom': [0, 0, 0, 0]}
            for date, d in oc[h].items():
                ids = list(d.keys())
                vals = []
                for sid in ids:
                    jf = js_feat[date].get(sid, {})
                    v = jf.get('_py_' + f) if f in PRICE else jf.get(f)  # price: own values; fundamentals: JS values (stated)
                    vals.append(v if ok(v) else None)
                if sum(1 for v in vals if v is not None) < 50: continue
                pct = midrank_pct(vals, sign)
                for i, sid in enumerate(ids):
                    if pct[i] is None: continue
                    c = d[sid][1]
                    for key, lab, top in (('top1', c[0], True), ('top5', c[1], True), ('loser', c[2], True), ('top5Bottom', c[1], False)):
                        sel = pct[i] > 0.8 if top else pct[i] <= 0.2
                        a = acc[key]; a[0] += 1; a[1] += lab; a[2] += sel; a[3] += (sel and lab)
            py_lift[h][f] = {}
            jl = J['lift'].get(h, {}).get(f)
            for key, a in acc.items():
                n, pos, sel, sp = a
                if not n: continue
                prec = sp / sel if sel else None; base = pos / n
                mine = {'n': n, 'positives': pos, 'selected': sel, 'selectedPositives': sp, 'precision': prec, 'lift': prec / base if base and prec is not None else None, 'recall': sp / pos if pos else None}
                py_lift[h][f][key] = mine
                if jl is None: lift_fail += 1; continue
                theirs = jl[key]
                for m in ('n', 'positives', 'selected', 'selectedPositives', 'precision', 'lift', 'recall'):
                    lift_checks += 1
                    if not rel_close(mine[m], theirs[m], 2e-6):
                        lift_fail += 1
                        if len(lift_examples) < 5: lift_examples.append([h, f, key, m, mine[m], theirs[m]])
    report['liftTables'] = {'checks': lift_checks, 'failures': lift_fail, 'examples': lift_examples, 'basis': 'price features from this implementation; fundamental feature values taken from the JS export (their PIT derivation is checked on a sample below)'}
    # ---- fundamental sample from PIT documents ----
    rows = []
    for date, rws in J['features'].items():
        if date < '2011-01-01': continue
        for sid, f, cik in rws:
            if cik and any(k in f for k in ('grossMarginTtm', 'operatingMarginTtm', 'roeTtm')):
                key = hashlib.sha256((date + '|' + sid).encode()).hexdigest()
                rows.append((key, date, sid, cik, f))
    rows.sort(); sample = rows[:400]
    fchk = fagree = 0; fdis = []; cache = {}
    cutoff = lambda d: (datetime.date.fromisoformat(d) - datetime.timedelta(days=1)).isoformat()
    for _, date, sid, cik, f in sample:
        if cik not in cache:
            p = os.path.join(docs_dir, cik + '.json.gz')
            cache[cik] = load(p)['versions'] if os.path.exists(p) else None
        vs = cache[cik]
        if not vs: continue
        v = doc_at(vs, date)
        if not v or v['asOf'] > cutoff(date): continue
        ttm = v['doc'].get('ttm') or {}
        def tv(name):
            x = ttm.get(name)
            return x if x and ok(x.get('v')) and x.get('filed', '9999') <= cutoff(date) else None
        rev, gp, oi, ni = tv('revenue'), tv('gross_profit'), tv('operating_income'), tv('net_income')
        eq = None
        ann = (v['doc'].get('quarterly') or {}).get('stockholders_equity') or []
        cand = [r for r in ann if r[4] <= cutoff(date)]
        if cand: eq = sorted(cand, key=lambda r: (r[2], r[4]))[-1][3]
        mine = {}
        if rev and gp and rev['v'] > 0 and rev['end'] == gp['end']: mine['grossMarginTtm'] = gp['v'] / rev['v']
        if rev and oi and rev['v'] > 0 and rev['end'] == oi['end']: mine['operatingMarginTtm'] = oi['v'] / rev['v']
        if ni and eq and eq > 0: mine['roeTtm'] = ni['v'] / eq
        for k in ('grossMarginTtm', 'operatingMarginTtm', 'roeTtm'):
            if k in f and k in mine:
                fchk += 1
                if rel_close(mine[k], f[k], 1e-6): fagree += 1
                elif len(fdis) < 8: fdis.append([date, sid, k, mine[k], f[k]])
    report['fundamentalSample'] = {'sampleRows': len(sample), 'comparisons': fchk, 'agree': fagree, 'agreeShare': fagree / fchk if fchk else None,
                                   'definition': 'Simple ratios from the PIT document TTM facts filed before t (gross profit/revenue, operating income/revenue, net income/latest quarterly equity) vs. fundamental-inputs.compute; disagreements come from that engine\'s period alignment and quarter summation, listed not resolved', 'disagreementExamples': fdis}
    passed = report['membership']['cohortsWithDifferentMemberSet'] == 0 and feat_fail == 0 and cls_fail == 0 and ret_fail == 0 and lift_fail == 0
    report['verdict'] = 'PASS' if passed else 'FAIL'
    report['verdictScope'] = 'membership, forward returns, classes, price features and pooled lift tables; the fundamental sample is reported as an agreement share'
    with open(out_path, 'w') as fo:
        json.dump(report, fo, indent=1); fo.write('\n')
    print(json.dumps({k: report[k] for k in ('membership', 'priceFeatures', 'outcomesAndClasses', 'liftTables', 'verdict')})[:3000])
    print(json.dumps(report['fundamentalSample'])[:1500])


if __name__ == '__main__':
    main()
