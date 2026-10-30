#!/usr/bin/env python3
"""V13b HIST part B - gap quantification 1995-2009 and coverage before/after (spx-terminal-rules-1.0.0 outputs.coverage).

(a) per year: SEC delisting events (V12 delisting register, private) vs. price evidence (V13 coverage-1.0.0, register-1.1.0
    additions, SPX terminal register) and the provider reference (V12 coverage matrix, ended chains);
(b) per SPY period: bounded weight before/after for both terminal registers (1.0.0 primary, 1.0.1 sensitivity);
(c) Tiingo: supported_tickers listings ending 1995-2009 (US stock), whether the V13 fetch requested them, and a
    fetch specification for S&P 500 index exits that kept trading (current ticker in the provider list since <= t0);
(d) sparse price observations of exited S&P members in other cached fund reports (IWB/IWM/QQQ/DIA, V12 SPXPOP).
Only counts, CIKs and tickers as identifiers are written (no provider rows, no prices).

python3 -I scripts/quant/v13b/hist/spx_coverage.py --root . --listref <v12-private/listref> --indexpop <v12-private/indexpop> \
    --out docs/quant-recovery/v13b/hist/spx-terminal-coverage-1.0.0.json --fetch-spec <v13b-private>/tiingo-fetch-spec.json
"""
import argparse, collections, csv, datetime as dt, gzip, hashlib, json, os, subprocess

D = dt.date.fromisoformat
DOCDIR = 'docs/quant-recovery/v13b/hist'
US = {'NYSE', 'NASDAQ', 'NYSE MKT', 'AMEX', 'NYSE ARCA'}


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    for k in ('root', 'listref', 'indexpop', 'out', 'fetch-spec'):
        ap.add_argument('--' + k, required=True)
    a = ap.parse_args()
    R = lambda p: os.path.join(a.root, p)
    cov13 = json.load(open(R('docs/quant-recovery/v13/delisted/coverage-1.0.0.json')))
    reg110 = json.load(open(R(DOCDIR + '/register-1.1.0.json')))
    t100 = json.load(open(R(DOCDIR + '/spx-terminal-register-1.0.0.json')))
    t101 = json.load(open(R(DOCDIR + '/spx-terminal-register-1.0.1.json')))
    work = os.path.join(a.listref, 'work')
    events = json.load(open(os.path.join(work, 'delisting-register.json')))
    ev_by_year = collections.Counter(e['eventDate'][:4] for e in events)
    ev_ciks = collections.defaultdict(set)
    for e in events:
        ev_ciks[e['eventDate'][:4]].add(int(e['cik']))
    # (a) gap table
    gap = {}
    for y in range(1995, 2010):
        ys = str(y)
        s13 = cov13['secReference'].get(ys, {})
        p13 = cov13['providerReference'].get(ys, {})
        term = [r for r in t100['rows'] if r['status'].startswith('TERMINAL_') and r.get('completion') and r['completion']['filingDate'][:4] == ys]
        term_ev = {int(r['cik']) for r in term} & ev_ciks[ys]
        gap[ys] = {'secDelistingEvents': ev_by_year.get(ys, 0), 'eventsWithPriceSeriesBefore': s13.get('coveredBefore'), 'eventsWithPriceSeriesAfterV13': s13.get('coveredAfter'),
                   'providerEndedChains': p13.get('endedRef'), 'providerEndedWithSeries': p13.get('endedWithSeriesBefore'), 'v13QualifiedEndingThisYear': p13.get('endedQualifiedAdded'),
                   'register110AddedEndingThisYear': sum(1 for c in reg110['changedChains'] if not c.get('unchangedRow') and c['after'] == 'QUALIFIED' and c['endYearBucket'] < '2010'), 'spxTerminalValues100': len(term), 'spxTerminalValuesMatchingAnSecEvent': len(term_ev)}
    tot = {k: sum(v[k] or 0 for v in gap.values()) for k in next(iter(gap.values()))}
    # (b) SPY periods
    def per(reg):
        return [{k: c[k] for k in ('t0', 't1', 'boundedRows', 'terminalRows', 'boundedWBefore', 'boundedExitWScope', 'boundedWAfter', 'diagnosticErrorPpBefore', 'diagnosticErrorPpAfter', 'tolerancePp')} for c in reg['coverageByPeriod']]
    reasons100 = collections.Counter(r['status'] if r['status'] != 'BOUNDED' else r['reason'] for r in t100['rows'])
    w_by_reason = collections.defaultdict(float)
    for r in t100['rows']:
        w_by_reason[r['status'] if r['status'] != 'BOUNDED' else r['reason']] += r['weight']
    # (c) Tiingo
    tk = list(csv.DictReader(open(os.path.join(a.listref, 'raw', 'tiingo', 'supported_tickers.csv'))))
    ended = collections.Counter()
    for r in tk:
        if r['assetType'] == 'Stock' and r['priceCurrency'] == 'USD' and r['exchange'] in US and r['endDate'] and '1995' <= r['endDate'][:4] <= '2009':
            ended[r['endDate'][:4]] += 1
    reg_rows = reg110['rows']
    cols = reg110['columns']
    ci = {c: i for i, c in enumerate(cols)}
    chains_by_cik = collections.defaultdict(list)
    for row in reg_rows:
        if row[ci['cik']]:
            chains_by_cik[int(row[ci['cik']])].append(row)
    ctk = json.load(open(os.path.join(a.indexpop, 'work', 'company_tickers.json')))
    cur_ticker = collections.defaultdict(list)
    for v in ctk.values():
        cur_ticker[int(v['cik_str'])].append(v['ticker'])
    tk_by = collections.defaultdict(list)
    for r in tk:
        if r['assetType'] == 'Stock' and r['priceCurrency'] == 'USD' and r['exchange'] in US:
            tk_by[r['ticker'].upper()].append(r)
    scope = t100['rows']
    linked = collections.Counter()
    spec = []
    for r in scope:
        if not r['cik']:
            linked['noCik'] += 1
            continue
        chs = chains_by_cik.get(int(r['cik']), [])
        st = sorted({c[ci['status']] for c in chs})
        linked['withCik'] += 1
        if chs:
            linked['hasEndedListrefChain'] += 1
        if any(s == 'QUALIFIED' for s in st):
            linked['hasQualifiedDelistedSeries'] += 1
        if r['fate'] == 'STILL_REPORTING_INDEX_EXIT':
            linked['stillReporting'] += 1
            cands = []
            for t in cur_ticker.get(int(r['cik']), []):
                for x in tk_by.get(t.upper(), []):
                    if x['startDate'] and D(x['startDate'][:10]) <= D(r['t0']) and (not x['endDate'] or D(x['endDate'][:10]) >= D(r['t1'])):
                        cands.append(t.upper())
            if cands:
                linked['stillReportingWithProviderHistory'] += 1
                spec.append({'cik': int(r['cik']), 'ticker': sorted(set(cands))[0], 't0': r['t0'], 't1': r['t1'], 'weight': r['weight']})
    tickers = sorted({s['ticker'] for s in spec})
    # are these already held? security id only via core/identity.js (ADR-001)
    sids = json.loads(subprocess.check_output(['node', '-e', "const I=require('./core/identity.js');console.log(JSON.stringify(process.argv.slice(1).map(t=>I.securityIdForTicker(t))))"] + tickers, cwd=a.root, text=True)) if tickers else []
    held = {}
    for t, sid in zip(tickers, sids):
        pth = R('quant/data/market/discover-series-long/%s.json' % sid)
        if os.path.exists(pth):
            pts = json.load(open(pth))['points']
            held[t] = {'securityId': sid, 'first': pts[0][0][:4], 'last': pts[-1][0][:4]}
    for s_ in spec:
        s_['heldSeries'] = s_['ticker'] in held and held[s_['ticker']]['first'] <= s_['t0'][:4]
    fetch = {'purpose': 'S&P 500 index exits 1995-2009 that kept trading (V12 fate STILL_REPORTING_INDEX_EXIT): a daily close at the SPY report date t1 closes the bound. NOT RUN - for the lead agent via the existing encrypted fetch workflow.',
             'endpoint': 'Tiingo daily prices (same endpoint and request format as scripts/quant/v13/delisted/fetch.mjs, request-1.0.0.json pattern: full history, raw close + splitFactor + adjClose)',
             'tickers': tickers, 'uniqueTickers': len(tickers), 'rows': len(spec), 'expectedRequests': len(tickers),
             'caveat': 'ticker = CURRENT SEC ticker of the CIK; identity must be re-checked (R1-style start-date match is impossible for continuing listings; check split-adjusted close at t0 against p0 from the SPY report within 1 %).',
             'heldAlready': held,
             'recommendation': 'NO_FETCH: all candidates already have a held weekly series reaching back before t0; the bound comes from V12 SPXPOP identity/qualification (OBS_SERIES needs a qualified, mapped series), not from missing provider data.' if tickers and all(s_['heldSeries'] for s_ in spec) else 'FETCH the tickers without held series',
             'rowsDetail': spec}
    json.dump(fetch, open(a.fetch_spec, 'w'), indent=1)
    # (d) sparse observations in other funds
    pop = json.load(gzip.open(R('docs/quant-recovery/v12/spxpop/population-1.1.1.json.gz')))
    other = collections.defaultdict(set)  # cik -> set of (fund, date)
    for p in pop['periods']:
        if p['fund'] == 'SPY' or p['cols'] is None:
            continue
        for k, chi in enumerate(p['cols']['chain']):
            ch = pop['chains'][chi]
            if ch[3]:
                other[int(ch[3])].add((p['fund'], p['t0']))
    sparse = collections.Counter()
    for r in scope:
        if not r['cik']:
            continue
        obs = [(f_, d) for f_, d in other.get(int(r['cik']), ()) if D(r['t0']) < D(d) <= D(r['t1'])]
        if obs:
            sparse['rowsWithObservation'] += 1
            sparse['observations'] += len(obs)
            if r['status'] == 'BOUNDED':
                sparse['boundedRowsWithObservation'] += 1
    out = {'schemaVersion': 'v13b-spx-terminal-coverage-1.0.0', 'evidenceKind': 'SOURCE_EVIDENCE', 'certificationStatus': 'NOT_CERTIFIED', 'productionApproved': False,
           'codeSha256': sha(os.path.abspath(__file__)),
           'inputs': {'coverage-1.0.0.json': sha(R('docs/quant-recovery/v13/delisted/coverage-1.0.0.json')), 'register-1.1.0.json': sha(R(DOCDIR + '/register-1.1.0.json')),
                      'spx-terminal-register-1.0.0.json': sha(R(DOCDIR + '/spx-terminal-register-1.0.0.json')), 'spx-terminal-register-1.0.1.json': sha(R(DOCDIR + '/spx-terminal-register-1.0.1.json')),
                      'delistingRegisterPrivateSha256': sha(os.path.join(work, 'delisting-register.json')), 'tiingoSupportedTickersPrivateSha256': sha(os.path.join(a.listref, 'raw', 'tiingo', 'supported_tickers.csv'))},
           'gapByYear': gap, 'gapTotals1995to2009': tot,
           'notes': {'register110': 'the 13 chains admitted by register-1.1.0 all end 2010 or later (end-year buckets 2010-2014: 1, 2015-2019: 7, 2020-2024: 5); they add nothing before 2010',
                     'spxTerminalValuesMatchingAnSecEvent': 'accepted terminal value whose issuer CIK has a V12 delisting-register event in the completion year'},
           'spyPeriods': {'primary_rules_1.0.0': per(t100), 'sensitivity_rules_1.0.1': per(t101)},
           'spyScopeStatus_1.0.0': {k: {'rows': reasons100[k], 'weightSum': round(w_by_reason[k], 6)} for k in sorted(reasons100)},
           'spyScopeStatus_1.0.1': dict(sorted(collections.Counter(r['status'] if r['status'] != 'BOUNDED' else r['reason'] for r in t101['rows']).items())),
           'tiingo': {'supportedTickersUSStockEndingByYear': dict(sorted(ended.items())), 'scopeRows': len(scope), 'scopeLinkage': dict(linked),
                      'fetchSpecification': {k: fetch[k] for k in ('purpose', 'endpoint', 'tickers', 'uniqueTickers', 'rows', 'expectedRequests', 'caveat', 'heldAlready', 'recommendation')}},
           'fundHoldingsSparseObservations': dict(sparse)}
    with open(a.out, 'w') as fh:
        json.dump(out, fh, indent=1)
        fh.write('\n')
    print(json.dumps({'gapTotals': tot, 'tiingo': out['tiingo']['scopeLinkage'], 'ended': out['tiingo']['supportedTickersUSStockEndingByYear'], 'fetch': fetch['uniqueTickers'], 'sparse': out['fundHoldingsSparseObservations']}, indent=1))


if __name__ == '__main__':
    main()
