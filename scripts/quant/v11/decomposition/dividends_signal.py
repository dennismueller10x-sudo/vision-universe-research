#!/usr/bin/env python3
"""V11 DECOMPOSITION A5: order-of-magnitude dividend yield of signal titles vs the population (2010+).

yield(issuer, t) = PaymentsOfDividendsCommonStock (fallback PaymentsOfDividends), the latest annual value
(10-K, duration 330-400 days) filed BEFORE t with period end within 550 days of t, divided by the PIT market cap
of the listing at the latest V10 factor-panel rank date <= t. An issuer with a visible 10-K (any us-gaap fact,
annual, filed before t, end within 550 days) but without a dividend fact counts as yield 0; otherwise unknown
(excluded, counted). Issuer level (ignores multiple share classes and special dividends) - order of magnitude only.

Inputs are private (companyfacts bulk archive and factor panel of the V10 factor strand) plus the committed
CIK map quant/data/product/sic-peer-taxonomy-v1.json. No network access.
Usage: python3 -I dividends_signal.py <repo-root> <events-export.json.gz> <panel.jsonl.gz> <companyfacts.zip> <out.json>
"""
import bisect, datetime, gzip, json, sys, zipfile

ROOT, EVENTS, PANEL, ZIP, OUT = sys.argv[1:6]
CONCEPTS = ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends']


def days(a, b):
    return (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days


def main():
    tax = json.load(open(ROOT + '/quant/data/product/sic-peer-taxonomy-v1.json'))
    col = {n: i for i, n in enumerate(tax['rowColumns'])}
    cik_of = {r[col['securityId']]: r[col['cik']] for r in tax['rows'] if r[col['cik']]}
    # panel: rank dates and market caps
    caps, dates = {}, []
    with gzip.open(PANEL, 'rt') as f:
        f.readline()
        for line in f:
            d = json.loads(line)
            if 'rows' not in d or 'date' not in d:
                continue
            dates.append(d['date'])
            caps[d['date']] = {r[0]: r[4] for r in d['rows'] if isinstance(r[4], (int, float)) and r[4] > 0}
    dates.sort()
    ev = json.load(gzip.open(EVENTS, 'rt'))
    need = set()
    for d in dates:
        need.update(cik_of[i] for i in caps[d] if i in cik_of)
    z = zipfile.ZipFile(ZIP)
    names = set(z.namelist())
    facts = {}   # cik -> {'div': sorted [(filed, end, val)], 'any': sorted [(filed, end)]}
    for cik in sorted(need):
        n = 'CIK%010d.json' % int(cik)
        if n not in names:
            continue
        g = json.loads(z.read(n)).get('facts', {}).get('us-gaap', {})
        div, anyf = [], []
        for c in CONCEPTS:
            for u in g.get(c, {}).get('units', {}).get('USD', []):
                if u.get('form') in ('10-K', '10-K/A') and u.get('start') and 330 <= days(u['start'], u['end']) <= 400:
                    div.append((u['filed'], u['end'], float(u['val'])))
            if div:
                break
        for c in ('NetIncomeLoss', 'Assets', 'StockholdersEquity'):
            for u in g.get(c, {}).get('units', {}).get('USD', []):
                if u.get('form') in ('10-K', '10-K/A'):
                    anyf.append((u['filed'], u['end']))
        facts[cik] = {'div': sorted(div), 'any': sorted(anyf)}

    def yield_at(sid, t, rank):
        cik = cik_of.get(sid)
        cap = caps[rank].get(sid)
        if not cik or not cap or cik not in facts:
            return None
        fx = facts[cik]
        best = None
        for filed, end, val in fx['div']:
            if filed < t and days(end, t) <= 550 and (best is None or end > best[0] or (end == best[0] and filed > best[1])):
                best = (end, filed, val)
        if best:
            return max(0.0, best[2]) / cap
        if any(filed < t and days(end, t) <= 550 for filed, end in fx['any']):
            return 0.0
        return None

    pop = {}
    for d in dates:
        vals = [y for y in (yield_at(i, d, d) for i in caps[d]) if y is not None and y < 1]
        pop[d] = (sum(vals) / len(vals) if vals else None, len(vals), len(caps[d]))
    out = {'schemaVersion': 'v11-decomposition-signal-dividends-1.0.0', 'evidenceKind': 'RECONSTRUCTION (order of magnitude)', 'definition': __doc__.split('\n\n')[1].replace('\n', ' '),
           'population': {'rankDates': len(dates), 'meanYield': sum(v[0] for v in pop.values() if v[0] is not None) / sum(1 for v in pop.values() if v[0] is not None),
                          'byYear': {}}, 'rules': {}}
    for y in sorted({d[:4] for d in dates}):
        v = [pop[d][0] for d in dates if d[:4] == y and pop[d][0] is not None]
        out['population']['byYear'][y] = sum(v) / len(v) if v else None
    for rule, rows in ev.items():
        ys, py, unknown, n = [], [], 0, 0
        for sid, t in rows:
            if t < dates[0]:
                continue
            n += 1
            k = bisect.bisect_right(dates, t) - 1
            rank = dates[k]
            y = yield_at(sid, t, rank)
            if y is None or y >= 1:
                unknown += 1; continue
            ys.append(y)
            py.append(pop[rank][0])
        out['rules'][rule] = {'eventsFrom2010': n, 'withYield': len(ys), 'unknown': unknown, 'meanYield': sum(ys) / len(ys) if ys else None,
                              'populationMeanSameRankDates': sum(py) / len(py) if py else None, 'shareZeroYield': sum(1 for y in ys if y == 0) / len(ys) if ys else None,
                              'differencePpPerYear': (sum(ys) / len(ys) - sum(py) / len(py)) * 100 if ys else None}
    json.dump(out, open(OUT, 'w'), indent=1)
    print(json.dumps({k: (v['meanYield'], v['populationMeanSameRankDates'], v['withYield'], v['unknown']) for k, v in out['rules'].items()}), out['population']['meanYield'])


if __name__ == '__main__':
    main()
