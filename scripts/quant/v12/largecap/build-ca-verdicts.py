"""V12 LARGECAP part CA: compact evidence file from the private facts of verify_ca.py (no SEC access).
  python3 -I scripts/quant/v12/largecap/build-ca-verdicts.py --facts <ca-facts.jsonl> --out docs/quant-recovery/v12/largecap/ca-verdicts-1.0.0.json
"""
import argparse
import hashlib
import json
import pathlib

ADM = {'GENUINE_MOVE': 'PRICE_RETURN', 'SPINOFF_DISTRIBUTION': 'PRICE_RETURN_ONLY'}


def clip(s, n=300):
    return None if s is None else str(s)[:n]


def side(c):
    if not c:
        return None
    return {k: c.get(k) for k in ('accession', 'form', 'filingDate', 'coverDate', 'shares', 'coverVia', 'tradingSymbols', 'instanceUrl', 'instanceSha256', 'textUrl', 'textSha256')}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--facts', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    raw = pathlib.Path(a.facts).read_bytes()
    series = [json.loads(l) for l in raw.decode().splitlines() if l.strip()]
    rows = []
    for s in series:
        for e in s['events']:
            r = {'securityId': s['securityId'], 'ticker': s['ticker'], 'candidateCiks': s.get('candidateCiks'), 'week': e['week'], 'prevWeek': e['prevWeek'],
                 'prevClose': e['prevClose'], 'close': e['close'], 'weeklyRatio': round(e['weeklyRatio'], 6), 'jumpDay': e.get('jumpDay'), 'providerReason': e['reason'],
                 'era': e.get('era'), 'verdict': e.get('verdict'), 'detail': e.get('detail'), 'admissible': e.get('verdict') in ADM}
            ids = []
            for idr in e.get('identity') or []:
                x = {'cik': idr['cik'], 'issuer': idr.get('issuer'), 'result': idr.get('result'), 'insufficientDetail': idr.get('insufficientDetail'),
                     'shareIssues': idr.get('shareIssues'), 'before': side(idr.get('before')), 'after': side(idr.get('after'))}
                for k in ('idBefore', 'idAfter'):
                    v = idr.get(k)
                    if v:
                        x[k] = {kk: (clip(vv) if kk == 'quote' else vv) for kk, vv in v.items()}
                if idr.get('exchangeEvidence'):
                    x['exchangeEvidence'] = idr['exchangeEvidence']
                ids.append(x)
            r['identity'] = ids
            if 'shareRatio' in e:
                r['shareRatio'] = e['shareRatio']
            if e.get('periodicText'):
                r['periodicText'] = {**e['periodicText'], 'match': clip(e['periodicText'].get('match'))}
            if e.get('xbrlSplitFacts') is not None:
                r['xbrlSplitFactsInWindow'] = len(e['xbrlSplitFacts'])
            if e.get('splitWindow8K') is not None:
                r['splitWindow8K'] = [{**k, 'match': clip(k.get('match'))} for k in e['splitWindow8K']]
            if e.get('spinoffCandidates') is not None:
                r['spinoffCandidates'] = [{k: v for k, v in c.items() if k not in ('distributionDateHits', 'splitMatchesOtherThanStockDividend')}
                                          | {'distributionDateHits': [{'date': h['date'], 'quote': clip(h['quote'])} for h in c['distributionDateHits']],
                                             'splitMatchesOtherThanStockDividend': [clip(x) for x in c['splitMatchesOtherThanStockDividend']]} for c in e['spinoffCandidates']]
            if e.get('affirmativeCandidates') is not None:
                r['affirmativeCandidates'] = [{**c, 'splitMatch': clip(c.get('splitMatch')), 'spinoffMatch': clip(c.get('spinoffMatch')), 'quote': clip(c.get('quote'))} for c in e['affirmativeCandidates']]
            if s.get('error'):
                r['error'] = s['error']
            rows.append(r)
    count = {}
    for r in rows:
        k = r['verdict'] + ('|' + r['detail'] if r['detail'] else '')
        count[k] = count.get(k, 0) + 1
    adm_series = sorted({r['securityId'] for r in rows} - {r['securityId'] for r in rows if not r['admissible']})
    doc = {'schemaVersion': 'v12-largecap-ca-verdicts-1.0.0', 'protocol': 'docs/quant-recovery/v12/largecap/protocol-1.0.0.json', 'protocolSha256': series[0]['protocolSha256'],
           'caProtocolSha256': series[0]['caProtocolSha256'], 'factsSha256': hashlib.sha256(raw).hexdigest(), 'certificationStatus': 'NOT_CERTIFIED', 'productionApproved': False,
           'series': len(series), 'events': len(rows), 'byVerdict': count, 'admissibleSeries': adm_series, 'registeredEvents': sum(1 for r in rows if r['securityId'] in adm_series),
           'note': 'Part CA = V10 protocol 1.1.2 + L1-L3. Admissible series would be written to the CA v12 extension; with none admissible no CA register change and no CA loader option was made.',
           'events_': rows}
    pathlib.Path(a.out).write_text(json.dumps(doc, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps({'events': len(rows), 'byVerdict': count, 'admissibleSeries': adm_series}))


if __name__ == '__main__':
    main()
