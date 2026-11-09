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
with open(OUT + '/data-mb.js', 'w') as fh:
    fh.write('/* Erzeugt von build-data.py (Stand 06.11.2026), nicht von Hand aendern. */\nwindow.MBD=' + json.dumps({'series': X, 'cards': cards}, ensure_ascii=False) + ';\n')
print(len(X), {t: (c['price'], round(c['d'], 2), c['rows'][:2]) for t, c in cards.items()})
