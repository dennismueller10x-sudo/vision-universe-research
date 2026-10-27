#!/usr/bin/env python3
"""V9 identity: assemble the PROPOSED source-backed identity evidence registry from the dossiers and the
ambiguous-id resolution table. Proposal only: nothing here is wired into an engine.

Record decisions:
  BIND_SOURCE_RESOLVED_LISTING  positive binding securityId -> issuer CIK / class / MIC / usable interval;
                                 the adapter would evaluate the series restricted to [validFrom, validTo].
  CONFIRM_NOT_COMMON             SEC cover class is not common stock (preferred, depositary, ADS, unit, right ...);
                                 stays excluded (informational, supports a master reclassification).
  HOLD_SOURCE_CONFLICT           issuer known but a source conflict (price mismatch / unexplained level break)
                                 blocks qualification.
usage: build_proposal.py --dossiers <dossiers-7.json> --ambiguous <ambiguous-resolution.json> --out <proposal.json>
"""
import argparse
import hashlib
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import series_lib as L  # noqa: E402

SCHEMA = 'research-identity-evidence-1.0.0-proposal'


def points_guard(security_id, valid_from, valid_to):
    """SHA-256 of JSON.stringify(points within [validFrom, checkedTo]) - same bytes in Node and Python for
    these finite decimal prices (verified by the dry run). Guards against a silent rewrite of the history the
    sources were checked against; later weekly bars beyond checkedTo are not covered."""
    doc = L.load(security_id)
    pts = [p for p in doc['points'] if p[0] >= valid_from and (valid_to is None or p[0] <= valid_to)]
    raw = json.dumps(pts, separators=(',', ':'))
    return {'checkedFrom': pts[0][0], 'checkedTo': pts[-1][0], 'bars': len(pts),
            'pointsSha256': hashlib.sha256(raw.encode()).hexdigest()}


def src(e, role):
    keep = ('cik', 'accession', 'form', 'filingDate', 'document', 'url', 'sha256', 'bytesRead', 'complete')
    out = {k: e.get(k) for k in keep if e.get(k) is not None}
    out['role'] = role
    return out


def from_dossier(c):
    d = c['decision']
    base = {'securityId': c['securityId'], 'ticker': c['ticker'], 'origin': 'DOSSIER', 'baseReason': c['baseReason'],
            'masterRowsSeen': [r['canonical_id'] for r in c['masterRows']]}
    sources = []
    for e in c['evidence']:
        s = src(e, e['role'])
        s['claims'] = [{'claim': x['claim'], 'quote': x['quote']} for x in e['claims'] if x['state'] == 'FOUND']
        sources.append(s)
    est = c['earliestSourcedTicker']
    if est.get('state') == 'FOUND':
        s = src(est, 'EARLIEST_TICKER_CONFIRMATION')
        s['quote'] = est['quote']
        sources.append(s)
    tl = c['currentTickerCovers']
    for k in ('first', 'latest'):
        if tl.get(k):
            s = src(tl[k], 'IXBRL_COVER_%s' % k.upper())
            s['coverClass'] = {kk: v for kk, v in (tl[k].get('cls') or {}).items() if kk in ('Security12bTitle', 'TradingSymbol', 'SecurityExchangeName')}
            sources.append(s)
    price = [{'date': p['date'], 'state': p['state'], 'ratioSeriesToSource': p.get('ratioSeriesToSource'), 'accession': p.get('accession'), 'sha256': p.get('sha256')}
             for p in c['priceChecks'] if p.get('state') in ('MATCH', 'MISMATCH_SAME_DAY')]
    base['priceEvidence'] = price
    base['sources'] = sources
    base['submissions'] = c['seriesIssuer']['sources']
    if d['state'] == 'RESOLVED_SINGLE_SECURITY_MASTER_MISBOUND':
        ui = d['usableInterval']
        mic = {'XNAS': 'XNAS', 'XNYS': 'XNYS'}
        venue = c['tickerChain'][-1]['venue'].split()[0]
        base.update(decision='BIND_SOURCE_RESOLVED_LISTING', binding={
            'canonicalId': 'v9-sec-binding:%s:%s:%s' % (c['seriesIssuer']['cik'], c['ticker'], ui['validFrom']),
            'masterRowAction': 'REPLACE_MISBOUND_ROW', 'replacesCanonicalIds': [r['canonical_id'] for r in c['masterRows']],
            'cik': c['seriesIssuer']['cik'], 'issuer': c['issuer'], 'instrumentClass': c['instrumentClass'],
            'mic': mic.get(venue, venue), 'currency': 'USD', 'provider': 'tiingo',
            'validFrom': ui['validFrom'], 'validTo': ui['validTo'], 'intervalBasis': ui['basis'],
            'activeStatus': 'ACTIVE_SEC_CONFIRMED', 'lastConfirmedCover': {k: tl['latest'][k] for k in ('accession', 'filingDate', 'sha256')}},
            tickerIntervals=c['tickerChain'], corporateActionNotes=c['caNotes'],
            predecessorOfMasterRow=c.get('masterRowIssuer', {}).get('name'),
            historyGuard=points_guard(c['securityId'], ui['validFrom'], ui['validTo']))
    else:
        base.update(decision='HOLD_SOURCE_CONFLICT', holdState=d['state'], holdReasons=d['unresolvedReasons'] + ([d['hold']] if d['hold'] else []) +
                    ['SAME_DAY_PRICE_MISMATCH:' + x for x in d['sameDayMismatches']], issuerCik=c['seriesIssuer']['cik'], issuer=c['issuer'])
    return base


def from_ambiguous(r):
    if r['state'] not in ('RESOLVED_SINGLE_COMMON_LISTING', 'RESOLVED_NOT_COMMON'):
        return None
    tl = next(t for t in r['coverTimelines'] if t.get('state') == 'OK')
    sources = [{'role': 'SUBMISSIONS', **s} for s in tl['submissions']]
    for k in ('first', 'latest', 'before'):
        if tl.get(k):
            s = src(tl[k], 'IXBRL_COVER_%s' % k.upper())
            if k == 'before':
                s['symbolsOnCover'] = tl[k].get('symbols')
            else:
                s['coverClass'] = {kk: v for kk, v in (tl[k].get('cls') or {}).items() if kk in ('Security12bTitle', 'TradingSymbol', 'SecurityExchangeName', 'allClassesWithSymbol')}
            sources.append(s)
    conf = r.get('tickerConfirmation') or {}
    if conf.get('state') == 'FOUND':
        s = src(conf, 'FULLTEXT_TICKER_CONFIRMATION')
        s['quote'] = conf['quote']
        sources.append(s)
    base = {'securityId': r['securityId'], 'ticker': r['ticker'], 'origin': 'AMBIGUOUS_RESOLUTION', 'baseReason': 'AMBIGUOUS_LISTING_IDENTITY',
            'ambiguityStructure': r['structure'], 'sources': sources}
    if r['state'] == 'RESOLVED_NOT_COMMON':
        base.update(decision='CONFIRM_NOT_COMMON', issuerCik=tl['cik'], issuer=tl['name'], secClass=r['secClass'], instrumentClass=r['instrumentClass'])
        return base
    b, ui = r['binding'], r['usableInterval']
    base.update(decision='BIND_SOURCE_RESOLVED_LISTING', subState=r['subState'], binding={
        'canonicalId': b['canonicalId'], 'masterRowAction': 'SELECT_EXISTING_ROW', 'cik': b['cik'], 'issuer': b['issuer'],
        'instrumentClass': 'COMMON_STOCK', 'secTitle': b['secTitle'], 'secExchange': b['secExchange'], 'mic': b['mic'],
        'currency': 'USD', 'provider': 'tiingo', 'validFrom': ui['validFrom'], 'validTo': ui['validTo'], 'intervalBasis': ui['basis'],
        'activeStatus': 'ACTIVE_SEC_CONFIRMED', 'lastConfirmedCover': {k: tl['latest'][k] for k in ('accession', 'filingDate', 'sha256')}},
        excludedLeadingBars=ui['excludedLeadingBars'], historyGuard=points_guard(r['securityId'], ui['validFrom'], ui['validTo']))
    return base


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dossiers', required=True)
    ap.add_argument('--ambiguous', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    dos = json.loads(pathlib.Path(a.dossiers).read_text())
    amb = json.loads(pathlib.Path(a.ambiguous).read_text())
    records = [from_dossier(c) for c in dos['cases']] + [x for x in (from_ambiguous(r) for r in amb['rows']) if x]
    counts = {}
    for r in records:
        counts[r['decision']] = counts.get(r['decision'], 0) + 1
    doc = {
        'schemaVersion': SCHEMA,
        'status': 'PROPOSAL_NOT_WIRED',
        'productionApproved': False,
        'scope': 'Source-resolved listing bindings for offline weekly research (weekly-real-adapter). Positive bindings restrict a series to the SEC-sourced usable interval; no history outside it is asserted. No complete historical security-master correction.',
        'inputs': {'dossiersSha256': hashlib.sha256(pathlib.Path(a.dossiers).read_bytes()).hexdigest(),
                   'ambiguousSha256': hashlib.sha256(pathlib.Path(a.ambiguous).read_bytes()).hexdigest()},
        'recordContract': {
            'securityId': 'baseline security id (ref_*)',
            'decision': 'BIND_SOURCE_RESOLVED_LISTING | CONFIRM_NOT_COMMON | HOLD_SOURCE_CONFLICT',
            'binding.canonicalId': 'existing master canonical_id (SELECT_EXISTING_ROW) or v9-sec-binding:<cik>:<ticker>:<validFrom> (REPLACE_MISBOUND_ROW)',
            'binding.validFrom/validTo': 'first weekly bar of the sourced usable interval / null = open while lastConfirmedCover is current',
            'historyGuard': 'sha256 of JSON.stringify(points in [checkedFrom, checkedTo]); adapter refuses the binding if it differs',
            'sources[]': 'accession, url, filingDate, sha256 of the fetched body (or of its first bytesRead bytes when complete=false), short quotes'},
        'proposedAdapterChange': 'see docs/quant-recovery/v9/identity/README.md#proposed-adapter-change',
        'counts': counts,
        'records': records,
    }
    pathlib.Path(a.out).write_text(json.dumps(doc, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps(counts))


if __name__ == '__main__':
    main()
