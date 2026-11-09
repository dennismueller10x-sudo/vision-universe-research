"""Daten fuer die Konzept-Praesentation Elliott, Hedgefonds, Vorsorge.

Liest nur: quant/data/technical-intelligence/v3/index.json.gz (Elliott-Lesarten), quant/data/market/discover-series,
vorsorge/data/series/URTH.json, vorsorge/data/eu/etf-eu-ucits.json (ESMA-Register), discover/logos/files,
hedgefonds/img/managers. Hedgefonds- und Vorsorge-Zahlen stehen in deck-ehv.js wie am 09.11.2026 auf den Seiten abgelesen.
Aufruf aus dem Repo-Wurzelverzeichnis:  python3 docs/design/elliott-hedgefonds-vorsorge-2026-11/build-data.py
"""
import gzip
import json
import os
import shutil

OUT = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT + '/img/logos', exist_ok=True)
os.makedirs(OUT + '/img/managers', exist_ok=True)

ix = json.load(gzip.open('quant/data/technical-intelligence/v3/index.json.gz'))['rows']
app = [r for r in ix if r.get('elliottApplicable') in ('HIGH', 'MODERATE')]
app.sort(key=lambda r: (r['elliottApplicable'] != 'HIGH', r.get('elliottClarity') != 'HIGH', -(r.get('close') or 0)))
KEYS = ['t', 'tf', 'close', 'elliott', 'elliottClarity', 'elliottApplicable', 'direction', 'invalidation', 'structure', 'relabelRisk', 'countQuality']
ell = {'n': len(ix), 'applicable': len(app), 'high': sum(1 for r in ix if r.get('elliottApplicable') == 'HIGH'),
       'wave3': sum(1 for r in ix if str(r.get('elliott') or '').endswith(':3')),
       'rows': [{k: r.get(k) for k in KEYS} for r in app if (r.get('close') or 0) > 5][:8],
       'nvda': next(({k: r.get(k) for k in KEYS} for r in ix if r['t'] == 'NVDA'), None)}

SYMS = ['NVDA', 'AAPL', 'AXP', 'KO', 'GOOGL', 'BAC', 'CVX', 'OXY', 'CB', 'MCO', 'MU', 'AMZN', 'META', 'TSM'] + [r['t'] for r in ell['rows']]
X = {}
for t in SYMS:
    p = 'quant/data/market/discover-series/ref_%s.json' % t
    if os.path.exists(p):
        pts = [v for _, v in json.load(open(p))['points']]
        if len(pts) >= 60:
            step = len(pts) / 52
            X[t] = [round(pts[int(i * step)], 2) for i in range(51)] + [pts[-1]]
    lg = 'discover/logos/files/%s.png' % t
    if os.path.exists(lg):
        shutil.copy(lg, '%s/img/logos/%s.png' % (OUT, t))
# URTH: woechentliche Kurse ueber den Vorsorge-Codec (node), letzte 52 Wochen
import subprocess
X['URTH'] = json.loads(subprocess.check_output(['node', '-e', "const C=require('./vorsorge/engines/series-codec.js');const d=require('./vorsorge/data/series/URTH.json');console.log(JSON.stringify(C.decode(d.price.weekly).slice(-52).map(p=>p[1])))"]))
for m in ['berkshire', 'pershing-square', 'scion', 'ark', 'fisher']:
    p = 'hedgefonds/img/managers/%s.jpg' % m
    if os.path.exists(p):
        shutil.copy(p, '%s/img/managers/%s.jpg' % (OUT, m))

e = json.load(open('vorsorge/data/eu/etf-eu-ucits.json'))
F = e['fields']
R = [dict(zip(F, r)) if isinstance(r, list) else r for r in e['rows']]
world = [r for r in R if 'MSCI WORLD' in str(r.get('fundName', '')).upper() and 'UCITS ETF' in str(r.get('fundName', '')).upper()]
ucits = {'register': e['ucitsFundsInRegister'], 'runDate': e['runDate'], 'msciWorld': len(world),
         'examples': [{'isin': r['isin'], 'name': r['fundName']} for r in world if r['isin'] in ('IE00B4L5Y983', 'IE00BJ0KDQ92')]}

with open(OUT + '/data-ehv.js', 'w') as fh:
    fh.write('/* Erzeugt von build-data.py (Stand 06.11.2026), nicht von Hand aendern. */\nwindow.EHV=' + json.dumps({'elliott': ell, 'ucits': ucits, 'series': X}, ensure_ascii=False) + ';\n')
print('elliott', ell['n'], ell['applicable'], ell['high'], 'welle3', ell['wave3'], [r['t'] for r in ell['rows']], 'ucits', ucits['msciWorld'], ucits['examples'])
