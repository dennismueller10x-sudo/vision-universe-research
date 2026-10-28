#!/usr/bin/env python3
"""V9 setup independence analysis: calendar weeks vs. independent observations.

Read-only. Quantifies, for the published setup events (quant/data/product/setup-outcomes-v1.json),
how many statistically independent observations a mean M6 outcome actually contains, compared
with the counts the certification gate uses (calendar months today, ISO weeks proposed).

Model (declared, deliberately simple and conservative-transparent):
  r_i = H-session log return after event i, daily log returns with common variance.
  Cov(r_i, r_j) / Var(r) = rho_ij * overlap(i, j) / H, overlap = shared sessions of the two
  H-session windows; rho_ij = 1 for the same title, rho_bar (mean pairwise daily-return
  correlation in the event universe) otherwise. Raw returns and SPY-excess returns separately.
  Design effect DEFF = sum_ij rho_ij*ov_ij/H / n, effective sample N_eff = n / DEFF.
The model ignores volatility differences, serial correlation of daily returns and sector
structure; it is a dependence yardstick, not an estimator of a certification outcome.
Writes only the file given by --out.
"""
import argparse, collections, datetime as dt, hashlib, json, os
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
P = lambda p: os.path.join(ROOT, p)
H = 126  # M6 horizon in sessions (contract: 6 months)


def sha(p):
    return hashlib.sha256(open(P(p), 'rb').read()).hexdigest()


def load_daily(ticker):
    p = P(f'quant/data/market/discover-series/ref_{ticker}.json')
    if not os.path.exists(p):
        return None
    d = json.load(open(p))
    if d.get('grain') != 'daily' or d.get('dataMode') != 'real':
        return None
    return {k: v for k, v in d['points']}


def mean_pairwise_corr(matrix):
    """Mean off-diagonal correlation of standardized columns (rows=dates)."""
    z = (matrix - matrix.mean(0)) / matrix.std(0)
    n_t, n = z.shape
    s = z.sum(1)
    return float(((s @ s) / n_t - n) / (n * (n - 1)))


def sessions_after(calendar, start, count):
    """Session list continuing beyond the observed calendar on weekdays (projection only)."""
    out = [d for d in calendar if d >= start][:count]
    last = dt.date.fromisoformat(out[-1] if out else start)
    while len(out) < count:
        last += dt.timedelta(days=1)
        if last.weekday() < 5:
            out.append(last.isoformat())
    return out


def n_eff(events, rho, index):
    """events: list of (ticker, entryIdx); index positions in a session axis."""
    by_pos = collections.Counter(p for _, p in events)
    titles_at = collections.defaultdict(collections.Counter)
    for t, p in events:
        titles_at[p][t] += 1
    positions = sorted(by_pos)
    total = 0.0
    for a in positions:
        for b in positions:
            ov = max(0, H - abs(a - b))
            if not ov:
                continue
            small, large = sorted((titles_at[a], titles_at[b]), key=len)
            same = sum(c * large.get(t, 0) for t, c in small.items())
            total += ov / H * (rho * (by_pos[a] * by_pos[b] - same) + same)
    n = len(events)
    return n * n / total


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); a = ap.parse_args()
    src = 'quant/data/product/setup-outcomes-v1.json'
    o = json.load(open(P(src)))
    events = [(t, k, d) for t, k, d in o['events']]
    spy = load_daily('SPY')
    calendar = sorted(spy)
    tickers = sorted({t for t, _, _ in events})
    series = {t: load_daily(t) for t in tickers}
    covered = [t for t in tickers if series[t] and all(d in series[t] for d in calendar[-127:])]
    window = calendar[-127:]
    mat = np.array([[np.log(series[t][window[i + 1]] / series[t][window[i]]) for t in covered] for i in range(len(window) - 1)])
    spy_r = np.array([np.log(spy[window[i + 1]] / spy[window[i]]) for i in range(len(window) - 1)])
    rho_raw = mean_pairwise_corr(mat)
    rho_excess = mean_pairwise_corr(mat - spy_r[:, None])
    pos = {d: i for i, d in enumerate(calendar)}

    def entry_pos(d):  # entry at next session close after the published state (contract default)
        nxt = [x for x in calendar if x > d]
        return pos[nxt[0]] if nxt else pos[calendar[-1]] + 1

    ev = [(t, entry_pos(d)) for t, _, d in events]
    kinds = {}
    for kind in ('ALL', 'SETUP_NEW', 'SETUP_CONFIRMED'):
        sub = [(t, entry_pos(d)) for t, k, d in events if kind == 'ALL' or k == kind]
        kinds[kind] = {'n': len(sub), 'nEffRaw': n_eff(sub, rho_raw, pos), 'nEffExcess': n_eff(sub, rho_excess, pos)}
    dates = sorted({d for _, _, d in events})
    iso = sorted({'%d-W%02d' % dt.date.fromisoformat(d).isocalendar()[:2] for d in dates})

    # Counterfactual designs to separate "calendar weeks" from "independent observations":
    # k weekly event dates, m distinct titles per date, titles never repeated.
    def design(k, m, step_sessions=5):
        evs = [(f'T{w}_{j}', w * step_sessions) for w in range(k) for j in range(m)]
        return {'weeks': k, 'titlesPerWeek': m, 'n': k * m, 'spanSessions': (k - 1) * step_sessions,
                'nonOverlappingM6Blocks': (k - 1) * step_sessions // H + 1,
                'nEffRaw': n_eff(evs, rho_raw, None), 'nEffExcess': n_eff(evs, rho_excess, None)}
    designs = [design(k, m) for k in (6, 20, 52, 104) for m in (1, 200)]

    doc = {'schemaVersion': 'quant-v9-setup-independence-1.0.0', 'status': 'ANALYSIS_ONLY_NO_GATE_CHANGE',
           'sources': {src: sha(src), 'quant/data/market/discover-series/ref_SPY.json': sha('quant/data/market/discover-series/ref_SPY.json')},
           'model': {'horizonSessions': H, 'covariance': 'rho_ij * overlap/H; rho_ij=1 same title else mean pairwise daily-return correlation',
                     'correlationWindow': [window[0], window[-1]], 'titlesInCorrelation': len(covered),
                     'rhoRaw': rho_raw, 'rhoSpyExcess': rho_excess,
                     'limitations': ['Equal variances and no serial correlation assumed', 'Correlation estimated on the last ~6 months only; regime dependent',
                                     'Sector/size clustering beyond the mean correlation ignored (understates dependence)', 'Yardstick for design, not an inferential result']},
           'observed': {'events': len(events), 'titles': len(tickers), 'eventDates': len(dates), 'isoWeeks': len(iso), 'calendarMonths': len({d[:7] for d in dates}),
                        'maxEventsOnOneDate': max(collections.Counter(d for _, _, d in events).values()), 'byKind': kinds,
                        'nonOverlappingM6Blocks': (pos[dates[-1]] - pos[dates[0]]) // H + 1},
           'counterfactualDesigns': designs}
    worst = min(x['nEffRaw'] for x in designs if x['weeks'] == 20 and x['titlesPerWeek'] == 200)
    doc['findings'] = [
        f"Observed: {len(events)} events on {len(dates)} dates / {len(iso)} ISO weeks / {doc['observed']['calendarMonths']} months; all M6 windows overlap (1 non-overlapping M6 block).",
        f"Mean pairwise daily-return correlation {rho_raw:.3f} raw, {rho_excess:.3f} SPY-excess.",
        f"N_eff for the mean M6 outcome of all events: raw {kinds['ALL']['nEffRaw']:.1f}, SPY-excess {kinds['ALL']['nEffExcess']:.1f} (n={len(events)}).",
        f"20 consecutive weeks x 200 titles (n=4000) give raw N_eff {worst:.1f}: twenty calendar weeks are not twenty independent observations of an M6 outcome; overlapping horizons and the common market factor dominate.",
        'Neither a month count nor an ISO-week count measures independence. A dependence-aware criterion (minimum N_eff from a declared cluster/block model, plus a minimum number of non-overlapping horizon blocks) is required to make the gate meaningful.']
    doc['recommendationUpdate'] = {
        'status': 'NOT_APPROVED_RECOMMENDATION', 'supersedes': 'docs/quant-recovery/v9/setup-decision-recommendation-1.0.0.json (ISO-week counter alone is insufficient)',
        'proposal': ['Keep the active gate (calendar months, independentWeeks=20) unchanged until owner approval.',
                     'If changed: rename the field to what is counted (eventCalendarWeeks) and add a separate independence gate: minimum effective sample size of the M6 endpoint under a pre-registered calendar-block/cluster model (e.g. N_eff >= 30 on SPY-excess returns) AND at least k non-overlapping M6 horizon blocks (e.g. k >= 4, i.e. >= ~2 years of history).',
                     'Report raw and market-excess N_eff on every certification build; never infer independence from event counts.'],
        'consequence': 'A real independence requirement for M6 outcomes is materially stricter than either counter: with ~1 non-overlapping M6 block today, setup certification cannot be justified on independence grounds before multiple years of forward-collected history.'}
    doc['activeGateChanged'] = False; doc['productionApproved'] = False
    json.dump(doc, open(a.out, 'w'), indent=1, ensure_ascii=False)
    print(json.dumps({'rho': [rho_raw, rho_excess], 'kinds': kinds, 'designs': [(x['weeks'], x['titlesPerWeek'], round(x['nEffRaw'], 1), round(x['nEffExcess'], 1)) for x in designs]}, indent=0))


if __name__ == '__main__':
    main()
