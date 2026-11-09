"""Daten fuer die Konzept-Praesentation Technical: Logos und Kursreihen (1 Jahr, 52 Punkte) der gezeigten Aktien.
Liest nur discover/logos/files und quant/data/market/discover-series. Befunde, Zonen und Trefferzahlen stehen in deck-tc.js
wie am 09.11.2026 auf /technical/ abgelesen (Stand 06.11.2026).
Aufruf aus dem Repo-Wurzelverzeichnis:  python3 docs/design/technical-2026-11/build-data.py
"""
import json
import os
import shutil

OUT = os.path.dirname(os.path.abspath(__file__))
T = 'NVDA PEBK GMED DTIL AAPL MSFT TSLA'.split()
X = {}
os.makedirs(OUT + '/img/logos', exist_ok=True)
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
with open(OUT + '/data-tc.js', 'w') as fh:
    fh.write('/* Kursreihen (quant/data/market/discover-series, Stand 06.11.2026). Erzeugt von build-data.py. */\nwindow.TCD=' + json.dumps({'series': X}) + ';\n')
print('kursreihen', len(X), 'logos', len(os.listdir(OUT + '/img/logos')))
