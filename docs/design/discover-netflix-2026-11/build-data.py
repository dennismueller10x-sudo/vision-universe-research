"""Daten fuer die Konzept-Praesentation Discover (Reihen-Startseite).

Liest nur: discover/data/rows/US_REAL/*.json, quant/data/market/discover-series/*.json,
discover/logos/files/*.png, assets/themen/480/*.webp. Schreibt nur in diesen Ordner.
Aufruf aus dem Repo-Wurzelverzeichnis:  python3 docs/design/discover-netflix-2026-11/build-data.py
"""
import glob
import json
import os
import shutil

OUT = os.path.dirname(os.path.abspath(__file__))
ROWS = 'discover/data/rows/US_REAL'

# Reihen, die auf der Startseite als Schiene erscheinen
SHOW = ['im-blick', 'new-52-week-highs', 'comeback', 'langfristige-compounder', 'ueberraschungen', 'bekannte-namen',
        'breakout-watch', 'thema-halbleiter-chips', 'umsatz-waechst-stark', 'gewinne-beschleunigen', 'cashflow-maschinen',
        'qualitaet-wachstum', 'margen-werden-staerker', 'momentum-leaders', 'trend-quality', 'fundamentale-turnarounds',
        'sp500-staerkste', 'ndx-staerkste', 'djia-staerkste', 'market-leaders', 'qualitaet-zum-preis', 'starke-bilanz-wachstum']
EXTRA = ['NVDA', 'AAPL', 'MSFT', 'MU', 'ARDT', 'XERS']
QUALITY = {'langfristige-compounder', 'qualitaet-wachstum', 'profitables-wachstum'}


def series(path):
    p = (path or '').lstrip('/')
    if not p or not os.path.exists(p):
        return None
    pts = [v for _, v in json.load(open(p))['points']]
    if len(pts) < 60:
        return None
    n = 52
    step = len(pts) / n
    return [round(pts[int(i * step)], 2) for i in range(n - 1)] + [pts[-1]]


rows, cards, raw = {}, {}, {}
for f in sorted(glob.glob(ROWS + '/*.json')):
    rid = os.path.basename(f)[:-5]
    d = json.load(open(f))
    raw[rid] = d.get('cards') or []
    rows[rid] = {'title': d.get('title'), 'sub': d.get('subtitle'), 'n': (d.get('coverage') or {}).get('matched'), 'asOf': d.get('asOf')}
    for c in raw[rid]:
        m = c.get('metrics') or {}
        e = cards.setdefault(c['symbol'], {
            't': c['symbol'], 'n': c.get('companyName'), 'd': (c.get('changePercent') or {}).get('value'),
            'r12': m.get('return12M'), 'r3': m.get('return3M'), 'dh': m.get('distanceTo52wHigh'),
            'hook': (c.get('hook') or {}).get('text'), 'path': (c.get('priceSeries') or {}).get('path'), 'rows': []})
        e['rows'].append(rid)


def showcase(c):
    """Schaufenster-Regel (Vorschlag): Kursreihe vorhanden, kein Totalverlust-Fall."""
    return (c.get('path') and os.path.exists(c['path'].lstrip('/'))
            and c.get('r12') is not None and c['r12'] > -0.6 and c.get('d') is not None)


picks, dropped = {}, {}
for rid in SHOW:
    ok, bad = [], []
    for c in raw.get(rid, []):
        (ok if showcase(cards[c['symbol']]) else bad).append(c['symbol'])
    picks[rid] = ok[:10]
    dropped[rid] = [t for t in bad if raw[rid].index(next(x for x in raw[rid] if x['symbol'] == t)) < 5]

# Fallen Angels (Regel-Entwurf): in einer Qualitaets-Reihe UND Kurs >= 30 % unter dem 52-Wochen-Hoch
fa = []
for t, c in cards.items():
    if set(c['rows']) & QUALITY and c.get('dh') is not None and -0.75 < c['dh'] <= -0.30 and showcase(c):
        fa.append((len(set(c['rows']) & QUALITY), c['dh'], t))
fa.sort(key=lambda x: (-x[0], x[1]))
picks['fallen-angels'] = [t for _, _, t in fa][:10]
rows['fallen-angels'] = {'title': 'FALLEN ANGELS', 'sub': 'Starke Zahlen, aber der Kurs liegt weit unter seinem Hoch.', 'n': len(fa), 'asOf': rows['im-blick']['asOf'], 'draft': True}

need = set(EXTRA)
for v in picks.values():
    need.update(v)
C, X = {}, {}
os.makedirs(OUT + '/img/logos', exist_ok=True)
for t in sorted(need):
    if t not in cards:
        continue
    c = cards[t]
    s = series(c.get('path'))
    if s:
        X[t] = s
    C[t] = {k: c[k] for k in ['t', 'n', 'd', 'r12', 'r3', 'dh', 'hook', 'rows']}
    logo = 'discover/logos/files/%s.png' % t
    if os.path.exists(logo):
        shutil.copy(logo, '%s/img/logos/%s.png' % (OUT, t))

os.makedirs(OUT + '/img/themen', exist_ok=True)
for f in glob.glob('assets/themen/480/*.webp'):
    shutil.copy(f, OUT + '/img/themen/')

data = {'rows': rows, 'picks': picks, 'dropped': dropped, 'cards': C, 'series': X,
        'themes': sum(1 for r in rows if r.startswith('thema-')),
        'reihen': sum(1 for r, v in rows.items() if not r.startswith('thema-') and v.get('n') and not v.get('draft'))}
with open(OUT + '/data-discover.js', 'w') as fh:
    fh.write('/* Echte Daten aus discover/data/rows/US_REAL und quant/data/market/discover-series (1 Jahr, 52 Punkte). '
             'Erzeugt von build-data.py, nicht von Hand aendern. */\nwindow.DX=' + json.dumps(data, ensure_ascii=False) + ';\n')
print('karten', len(C), 'reihen', data['reihen'], 'themen', data['themes'], 'fallen angels', len(fa))
for k, v in dropped.items():
    if v:
        print('schaufenster blendet aus', k, v)
