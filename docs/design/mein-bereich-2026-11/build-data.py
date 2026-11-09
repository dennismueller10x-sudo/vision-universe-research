"""Daten fuer die Konzept-Praesentation Mein Bereich, Portfolios, AI-Atlas: Logos und Kursreihen (1 Jahr, 52 Punkte).
Liest nur discover/logos/files und quant/data/market/discover-series. Depot-, Watchlist- und Atlas-Werte stehen in deck-mb.js
wie am 09.11.2026 auf den Seiten abgelesen bzw. aus discover/data/stocks/US_REAL/NVDA.json (Stand 06.11.2026).
Aufruf aus dem Repo-Wurzelverzeichnis:  python3 docs/design/mein-bereich-2026-11/build-data.py
"""
import json
import os
import shutil

OUT = os.path.dirname(os.path.abspath(__file__))
T = 'NVDA AAPL MSFT MU AMD AVGO VREX TMP MEDP ASH KIDS NUE PRSU PGNY ACHC PARR'.split()
X = {}
for t in T:
    p = 'quant/data/market/discover-series/ref_%s.json' % t
    if os.path.exists(p):
        pts = [v for _, v in json.load(open(p))['points']]
        if len(pts) >= 60:
            step = len(pts) / 52
            X[t] = [round(pts[int(i * step)], 2) for i in range(51)] + [pts[-1]]
    lg = 'discover/logos/files/%s.png' % t
    if os.path.exists(lg):
        shutil.copy(lg, '%s/img/logos/%s.png' % (OUT, t))
cards = {}
for t in ['NVDA', 'AAPL', 'MSFT', 'MU']:
    d = json.load(open('discover/data/stocks/US_REAL/%s.json' % t))
    cards[t] = {'n': d['companyName'], 'price': d['price']['value'], 'd': d['changePercent']['value'], 'was': d.get('was'),
                'rows': [(m['title'], m['rank'], m['of']) for m in d.get('memberships', [])][:3]}
# Willkommen: echte Poster der Videos (assets/stories), verkleinert
from PIL import Image
os.makedirs(OUT + '/img/stories', exist_ok=True)
STORIES = json.load(open('willkommen/config/stories.json'))['stories']
stories = []
for st in STORIES:
    th = st.get('thumb', '').lstrip('/')
    if th and os.path.exists(th):
        name = os.path.basename(th)
        im = Image.open(th).convert('RGB')
        im.thumbnail((420, 760))
        im.save('%s/img/stories/%s' % (OUT, name), quality=72)
        stories.append({'id': st['id'], 'title': st['title'], 'product': st['product'], 'tagline': st.get('tagline'), 'thumb': 'img/stories/' + name,
                        'dur': round(sum(x.get('duration', 0) for x in st['slides'] if x.get('type') == 'video'))})
# Musterdepot Weinstein: letzte 30 Handelstage je Position mit Datum
DEP = ['VREX', 'TMP', 'MEDP', 'ASH', 'KIDS', 'NUE']
daily = {}
for t in DEP:
    p = 'quant/data/market/discover-series/ref_%s.json' % t
    if os.path.exists(p):
        daily[t] = json.load(open(p))['points'][-30:]
# Atlas-Antwort: Boersenwert 0,3-2 Mrd. $, KGV bis 15, Nettokasse > 0 (Screener-Universum, lokal gebaut)
U = json.load(open('screener/data/universe-US_REAL.json'))
C, N = U['cols'], U['count']
hits = [i for i in range(N) if C['mcap'][i] and 3e8 <= C['mcap'][i] < 2e9 and C['pe'][i] and 0 < C['pe'][i] <= 15 and C['netCash'][i] is not None and C['netCash'][i] > 0]
hits.sort(key=lambda i: C['pe'][i])
atlas = {'n': len(hits), 'universe': N, 'rows': [{'t': C['s'][i], 'n': C['n'][i], 'pe': C['pe'][i], 'mcap': C['mcap'][i], 'cash': C['netCash'][i], 'was': C['was'][i]} for i in hits[:6]]}
for r in atlas['rows']:
    lg = 'discover/logos/files/%s.png' % r['t']
    if os.path.exists(lg):
        shutil.copy(lg, '%s/img/logos/%s.png' % (OUT, r['t']))
with open(OUT + '/data-mb.js', 'w') as fh:
    fh.write('/* Erzeugt von build-data.py (Stand 06.11.2026), nicht von Hand aendern. */\nwindow.MBD=' + json.dumps({'series': X, 'cards': cards, 'stories': stories, 'daily': daily, 'atlas': atlas}, ensure_ascii=False) + ';\n')
print(len(X), {t: (c['price'], round(c['d'], 2), c['rows'][:2]) for t, c in cards.items()})
