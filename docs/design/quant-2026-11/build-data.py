"""Daten fuer die Konzept-Praesentation Quant.

Liest nur: quant/data/product/factor-evidence-v1/*.json.gz, quant/data/product/universe-list-v1.json.gz,
quant/data/market/discover-series/*.json, discover/data/stocks/US_REAL/*.json, discover/logos/files/*.png.
Schreibt nur in diesen Ordner. Aufruf aus dem Repo-Wurzelverzeichnis:
    python3 docs/design/quant-2026-11/build-data.py
"""
import gzip
import json
import os
import shutil

OUT = os.path.dirname(os.path.abspath(__file__))
TICKERS = ('NVDA AMD AAPL MSFT CARG EGP IRMD NVEC HRMY KNSL WSM UTHR SRCE PRI MTD STGW XERS KINS VMD PGNY EBF SPSC GABC '
           'HLT MPC TRV ILMN COST KO ABNB FIVN ORRF BLKB').split()
ORDER = ['profitability', 'growth', 'quality', 'momentum', 'value', 'risk', 'revisions']

names = {e['s']: e for e in json.load(gzip.open('quant/data/product/universe-list-v1.json.gz'))['entries']}


def shard(t):
    return 'quant/data/product/factor-evidence-v1/%s.json.gz' % t[:2].upper()


def series(t):
    p = 'quant/data/market/discover-series/ref_%s.json' % t
    if not os.path.exists(p):
        return None
    pts = [v for _, v in json.load(open(p))['points']]
    if len(pts) < 60:
        return None
    step = len(pts) / 52
    return [round(pts[int(i * step)], 2) for i in range(51)] + [pts[-1]]


cache, S, X = {}, {}, {}
os.makedirs(OUT + '/img/logos', exist_ok=True)
for t in TICKERS:
    f = shard(t)
    if f not in cache:
        cache[f] = json.load(gzip.open(f))['securities'] if os.path.exists(f) else {}
    sec = cache[f].get(t)
    if not sec:
        print('ohne Faktoren', t)
        continue
    fac = {k: (round(sec['factors'][k]['score']) if sec['factors'].get(k, {}).get('state') == 'AVAILABLE' and sec['factors'][k].get('score') is not None else None) for k in ORDER}
    pos = {k: (round(sec['factors'][k]['position']) if sec['factors'].get(k, {}).get('position') is not None else None) for k in ORDER}
    ds = 'discover/data/stocks/US_REAL/%s.json' % t
    dd = json.load(open(ds)) if os.path.exists(ds) else {}
    m = dd.get('metrics') or {}
    S[t] = {'t': t, 'n': (dd.get('companyName') or names.get(t, {}).get('n') or t), 'was': dd.get('was'), 'price': (dd.get('price') or {}).get('value') or names.get(t, {}).get('c'),
            'd': (dd.get('changePercent') or {}).get('value'), 'r12': m.get('return12M'), 'f': fac, 'pos': pos,
            'change': (sec.get('change') or {}).get('counts')}
    s = series(t)
    if s:
        X[t] = s
    lg = 'discover/logos/files/%s.png' % t
    if os.path.exists(lg):
        shutil.copy(lg, '%s/img/logos/%s.png' % (OUT, t))

with open(OUT + '/data-quant.js', 'w') as fh:
    fh.write('/* Echte Werte aus quant/data/product/factor-evidence-v1 (Stand 06.11.2026) und discover/data/stocks. '
             'Erzeugt von build-data.py, nicht von Hand aendern. */\nwindow.QD=' + json.dumps({'stocks': S, 'series': X, 'order': ORDER}, ensure_ascii=False) + ';\n')
print('aktien', len(S), 'kursreihen', len(X))
print({t: S[t]['f'] for t in ['NVDA', 'AMD', 'CARG']})
