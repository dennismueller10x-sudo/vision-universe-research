"""Daten fuer die Konzept-Praesentation Fundamental + Screener.

Liest nur: discover/data/stocks/US_REAL/*.json, screener/data/universe-US_REAL.json (lokal mit
scripts/screener/build-universe.mjs erzeugt, nicht eingecheckt), quant/data/market/discover-series/*.json,
dashboard/data/analyst_ratings.json, discover/logos/files/*.png. Schreibt nur in diesen Ordner.
Aufruf aus dem Repo-Wurzelverzeichnis:  python3 docs/design/fundamental-screener-2026-11/build-data.py
"""
import json
import os
import shutil

OUT = os.path.dirname(os.path.abspath(__file__))
U = json.load(open('screener/data/universe-US_REAL.json'))
T, N, SYM = U['cols'], U['count'], U['cols']['s']
IDX = {s: i for i, s in enumerate(SYM)}


def val(k, t):
    return T[k][IDX[t]] if t in IDX else None


def ok(x, f):
    try:
        return x is not None and f(x)
    except TypeError:
        return False


# Checklisten (Regel-Entwurf, siehe Folie FS05): je Bedingung Spalte und Schwelle
CHECKS = {
    'qualitaet': ('Qualität', [('Umsatz wächst 3 Jahre je ≥ 10 %', 'revCagr3', lambda x: x >= 0.10), ('Nettomarge ≥ 10 %', 'netMargin', lambda x: x >= 0.10),
                               ('Free-Cashflow-Marge ≥ 10 %', 'fcfMargin', lambda x: x >= 0.10), ('Kapitalrendite (ROIC) ≥ 15 %', 'roic', lambda x: x >= 0.15),
                               ('Mehr Kasse als Schulden', 'netCash', lambda x: x > 0), ('Gewinn zu ≥ 80 % durch Zahlungsfluss gedeckt', 'cashConversion', lambda x: x >= 0.8),
                               ('Operative Marge in 3 Jahren gestiegen', 'marginExp3y', lambda x: x >= 0), ('Gewinn je Aktie wächst 3 Jahre je ≥ 10 %', 'epsCagr3', lambda x: x >= 0.10)]),
    'wachstum': ('Wachstum', [('Umsatz zuletzt ≥ +15 %', 'revGrowth', lambda x: x >= 0.15), ('Umsatz 3 Jahre je ≥ 15 %', 'revCagr3', lambda x: x >= 0.15),
                              ('Umsatz 10 Jahre je ≥ 10 %', 'revCagr10', lambda x: x >= 0.10), ('Gewinn je Aktie 3 Jahre je ≥ 15 %', 'epsCagr3', lambda x: x >= 0.15),
                              ('Free Cashflow wächst', 'fcfGrowth', lambda x: x > 0), ('Operative Marge in 3 Jahren gestiegen', 'marginExp3y', lambda x: x >= 0)]),
    'bewertung': ('Bewertung', [('KGV ≤ 20', 'pe', lambda x: 0 < x <= 20), ('KUV ≤ 3', 'ps', lambda x: x <= 3), ('Börsenwert / Free Cashflow ≤ 20', 'pFcf', lambda x: 0 < x <= 20),
                                ('PEG ≤ 1,5', 'peg', lambda x: 0 < x <= 1.5), ('EV/EBITDA ≤ 12', 'evEbitda', lambda x: 0 < x <= 12)]),
}
checks = {}
for cid, (name, crit) in CHECKS.items():
    full, hits = 0, []
    for i in range(N):
        if all(ok(T[c][i], f) for _, c, f in crit):
            full += 1
            hits.append(SYM[i])
    checks[cid] = {'name': name, 'items': [x[0] for x in crit], 'full': full, 'hits': sorted(hits, key=lambda s: -(val('mcap', s) or 0))[:8],
                   'nvda': [ok(val(c, 'NVDA'), f) for _, c, f in crit]}

# Verteilung Umsatzwachstum (-50 % … +150 %, 10er Schritte) fuer den Filter-Regler
hist = [0] * 20
for x in T['revGrowth']:
    if x is not None:
        hist[int((max(-0.5, min(1.499, x)) + 0.5) / 0.1)] += 1
gt = {t: sum(1 for x in T['revGrowth'] if x is not None and x > t / 100) for t in (0, 10, 20, 30, 50)}

pegHits = sorted([s for s in SYM if ok(val('peg', s), lambda x: 0 < x <= 1.5) and ok(val('revCagr3', s), lambda x: x >= 0.1) and ok(val('netMargin', s), lambda x: x > 0)], key=lambda s: -(val('mcap', s) or 0))
# Treffer "Umsatz > 20 %", nach Boersenwert (wie der heutige Screener)
hits20 = sorted([s for s in SYM if ok(val('revGrowth', s), lambda x: x > 0.2)], key=lambda s: -(val('mcap', s) or 0))[:12]

TICK = set(['NVDA', 'AVGO', 'MU', 'AMD', 'INTC', 'GE', 'ALAB', 'CRDO', 'SMCI', 'ONC', 'ALNY', 'GOOGL', 'LLY', 'PLTR', 'ORCL', 'TSM', 'MSFT', 'AAPL'] + hits20)
for c in checks.values():
    TICK.update(c['hits'])
TICK.update(pegHits[:6])
KEYS = ['n', 'was', 'price', 'chg1d', 'mcap', 'revGrowth', 'revCagr3', 'netMargin', 'fcfMargin', 'grossMargin', 'opMargin', 'roic', 'pe', 'ps', 'peg', 'epsGrowth', 'perf1y', 'sec']
stocks = {t: {k: val(k, t) for k in KEYS} for t in TICK if t in IDX}

sd = json.load(open('discover/data/stocks/US_REAL/NVDA.json'))
tr = sd['fundamentals']['journey']['tracks']
nvda = {'revenue': [[r['fy'], r['v']] for r in tr['revenue']], 'netIncome': [[r['fy'], r['v']] for r in tr['net_income']],
        'fcf': [[r['fy'], r['v']] for r in tr['free_cash_flow']], 'netMargin': [[r['fy'], r['v']] for r in tr['margins']['net']] if isinstance(tr['margins'], dict) and 'net' in tr['margins'] else None,
        'story': [s['text'] for s in sd['fundamentals']['story']['statements']]}
an = json.load(open('dashboard/data/analyst_ratings.json'))['symbols'].get('NVDA', {})
nvda['analysts'] = an.get('trend_history', [None])[0]
nvda['analystsAsOf'] = json.load(open('dashboard/data/analyst_ratings.json'))['generated_at_utc'][:10]


def series(t):
    p = 'quant/data/market/discover-series/ref_%s.json' % t
    if not os.path.exists(p):
        return None
    pts = [v for _, v in json.load(open(p))['points']]
    step = len(pts) / 52
    return [round(pts[int(i * step)], 2) for i in range(51)] + [pts[-1]] if len(pts) >= 60 else None


X = {t: s for t in stocks for s in [series(t)] if s}
os.makedirs(OUT + '/img/logos', exist_ok=True)
for t in stocks:
    lg = 'discover/logos/files/%s.png' % t
    if os.path.exists(lg):
        shutil.copy(lg, '%s/img/logos/%s.png' % (OUT, t))

data = {'peg': {'full': len(pegHits), 'hits': pegHits[:8]}, 'n': N, 'asOf': U.get('asOf'), 'checks': checks, 'hist': hist, 'gt': gt, 'hits20': hits20, 'stocks': stocks, 'nvda': nvda, 'series': X}
with open(OUT + '/data-fs.js', 'w') as fh:
    fh.write('/* Echte Werte (Stand 06.11.2026) aus dem Screener-Universum und discover/data/stocks. Erzeugt von build-data.py, nicht von Hand aendern. */\nwindow.FS=' + json.dumps(data, ensure_ascii=False) + ';\n')
print('aktien', len(stocks), {k: v['full'] for k, v in checks.items()}, 'gt', gt, 'nvda margins', bool(nvda['netMargin']))
