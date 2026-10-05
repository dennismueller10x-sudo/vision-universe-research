#!/usr/bin/env python3
"""Mission VII — TradingView-Rahmen der weiteren qualifizierten Autoren (Protokoll-Nachtrag 7 b), nur Metadaten.

Gleiche Regeln wie tradingview-frame.py (Nachtrag 5 d: Fenster 2022-01-01..2026-06-30, Zielinstrumente, Elliott-Idee nach
Titel/Kurzbeschreibung, item = [chart_url, created_at, Titel, [Zeitrahmen]]). Autoren = qualifiedSeededOrder aus
tradingview-qualification.json ohne bereits gezogene (selected) und ohne gleiche Familie (excludedSameFamily).
Keine Ziehung: der Konsens-Abgleich (consensus-match.mjs) waehlt je Fall die zeitlich naechste Fundstelle.

Aufruf: tradingview-consensus-frames.py <dir mit tvauth/<Autor>.json> <consensus/frames-Verzeichnis> <qual.json> <retrievedAt>"""
import importlib.util, json, os, sys

spec = importlib.util.spec_from_file_location('tvf', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tradingview-frame.py'))
tvf = importlib.util.module_from_spec(spec); spec.loader.exec_module(tvf)

if __name__ == '__main__':
    src, out, qual, retrieved = sys.argv[1:5]
    q = json.load(open(qual))
    authors = [a for a in q['qualifiedSeededOrder'] if a not in q['selected'] and a not in q['excludedSameFamily']]
    os.makedirs(out, exist_ok=True)
    for a in authors:
        d = json.load(open(os.path.join(src, 'tvauth', a + '.json')))
        items, years, nonpub = tvf.qualify(d['items'])
        items.sort(key=lambda i: (i['created_at'], i['id']))
        sid = 'tv-' + a.lower()
        earliest = min(i['created_at'] for i in d['items'])[:10]
        frame = {'sourceId': sid, 'window': ['2022-01-01', '2026-06-30'], 'timezone': 'UTC', 'retrievedAt': retrieved,
                 'frameSource': f'TradingView oeffentliche Ideen-Liste /api/v1/ideas/?by={a} (Metadaten), Nachtrag 7 b',
                 'itemFormat': '[chart_url, created_at (UTC), Titel, [Chart-Zeitrahmen]]', 'datePrecision': 'SECOND',
                 'instrumentFilter': 'AT_DRAW', 'sampleTarget': max(1, len(items)), 'pilotQuota': 0,
                 'qualification': {'qualifyingIdeas': len(items), 'years': sorted(years), 'nonPublicInWindow': len(nonpub)},
                 'coverage': {'ideasCrawled': len(d['items']), 'apiCount': d.get('count'), 'earliestCrawled': earliest,
                              'truncatedByApiCap': len(d['items']) >= 1000 and earliest > '2022-01-01'},
                 'items': [[i['chart_url'], i['created_at'], i['name'], [tvf.norm_iv(i.get('interval'))]] for i in items],
                 'consensus': {'amendment': 'Nachtrag 7 b', 'draw': 'keine Ziehung; Auswahl je Fall in consensus-match.mjs'}}
        json.dump(frame, open(os.path.join(out, sid + '.json'), 'w'), ensure_ascii=False)
        print(sid, len(items), sorted(years), 'crawled', len(d['items']), 'earliest', earliest, 'nonpub', len(nonpub))
