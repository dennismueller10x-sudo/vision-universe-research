#!/usr/bin/env python3
"""Practitioner Reference — TradingView-Rahmen (Protokoll-Nachtrag 5 d), nur Metadaten, keine Ideen-Inhalte.

Kandidaten: Autoren im oeffentlichen Tag-Feed /ideas/elliottwaves/ (Seiten 1-42, Stand 04.10.2026) ohne Broker-Ideen
(is_platinum_broker_idea) und ohne Konten bestehender Quellenfamilien. Ideen-Liste je Autor: GET /api/v1/ideas/?by=<Autor>
(oeffentlich, ohne Login). Qualifikation: >= 40 oeffentliche Elliott-Ideen (Titel/Kurzbeschreibung enthaelt "elliott" oder
"wave") auf Zielinstrumenten 2022-01-01..2026-06-30 in >= 3 Kalenderjahren, keine nicht oeffentlichen Ideen im Fenster.
Auswahl: bis zu 3 Qualifizierte nach aufsteigendem SHA-256("20261004|tv|"+Autor). Rahmen = qualifizierende Ideen,
item = [chart_url, created_at, Titel, [Zeitrahmen]] chronologisch; Phase-2-Ziehung in sampling-frame.mjs (nur 1D/1W/1M).

Aufruf: tradingview-frame.py <dir mit tvauth/<Autor>.json> <frames-Verzeichnis> <qual.json>"""
import json, re, sys, hashlib, os

IDX = {'SPX','SPY','ES1!','ES','NDX','NQ1!','NQ','QQQ','DJI','DIA','YM1!','YM','RUT','IWM','RTY1!','RTY','US500','SPX500','SPX500USD',
       'NAS100','NAS100USD','US100','USTEC','US30','US30USD','DJ30','US2000','US2000USD','NDQ','IXIC'}
US_EX = {'NASDAQ', 'NYSE', 'AMEX', 'NYSE ARCA', 'ARCA', 'BATS', 'CBOE'}
EL = re.compile(r'elliott|wave', re.I)
ticker = lambda s: (s or '').split(':')[-1].upper()
exch = lambda s: (s or '').split(':')[0].upper() if ':' in (s or '') else ''

def target(it):
    t, ex, ty = ticker(it['symbol']), exch(it['symbol']), (it.get('type') or '').lower()
    if t in IDX or re.match(r'^(ES|NQ|YM|RTY|MES|MNQ)[A-Z]?\d*!?$', t): return 'INDEX'
    if t.startswith('BTC') and ty in ('crypto', 'spot', '', 'futures', 'swap'): return 'BTC'
    if ex in US_EX and ty in ('stock', 'fund', 'dr', 'etf', ''): return 'USSTOCK'
    return None

def norm_iv(iv):
    iv = str(iv or '').upper()
    return {'D': '1D', '1D': '1D', 'W': '1W', '1W': '1W', 'M': '1M', '1M': '1M'}.get(iv, 'INTRADAY' if re.match(r'^\d+$', iv) else iv or 'UNKNOWN')

def qualify(items):
    win = lambda i: '2022-01-01' <= i['created_at'][:10] <= '2026-06-30'
    q = [i for i in items if win(i) and target(i) and EL.search((i.get('name') or '') + ' ' + (i.get('description') or '')) and not i.get('is_script')]
    return q, {i['created_at'][:4] for i in q}, [i for i in items if win(i) and i.get('is_public') is False]

if __name__ == '__main__':
    src, out, qual = sys.argv[1:4]
    sel = json.load(open(qual))['selected']
    for a in sel:
        d = json.load(open(os.path.join(src, 'tvauth', a + '.json')))
        q, years, nonpub = qualify(d['items'])
        q.sort(key=lambda i: (i['created_at'], i['id']))
        sid = 'tv-' + a.lower()
        frame = {'sourceId': sid, 'window': ['2022-01-01', '2026-06-30'], 'timezone': 'UTC', 'retrievedAt': '2026-10-04',
                 'frameSource': f'TradingView oeffentliche Ideen-Liste /api/v1/ideas/?by={a} (Metadaten), Nachtrag 5 d',
                 'itemFormat': '[chart_url, created_at (UTC), Titel, [Chart-Zeitrahmen]]', 'datePrecision': 'SECOND',
                 'instrumentFilter': 'AT_DRAW', 'sampleTarget': max(1, len(q)), 'pilotQuota': 0,
                 'qualification': {'qualifyingIdeas': len(q), 'years': sorted(years), 'nonPublicInWindow': len(nonpub)},
                 'items': [[i['chart_url'], i['created_at'], i['name'], [norm_iv(i.get('interval'))]] for i in q],
                 'phase2': {'includeTags': ['1D', '1W', '1M'], 'stepK': 'AUTO20', 'seedKey': '20261004|phase2|' + sid, 'amendment': 'Nachtrag 5 d'}}
        json.dump(frame, open(os.path.join(out, sid + '.json'), 'w'), ensure_ascii=False)
        print(sid, len(q), sorted(years))
