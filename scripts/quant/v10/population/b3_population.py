"""V10 POPULATION B3: historical base population that is qualifiable with the existing data, per ISO year 2000-2026,
against an SEC order-of-magnitude reference from the EDGAR full indices (protocol-1.0.0 + amendment 1.0.1).
Writes only --out (population frame) and --reference-out.

    node scripts/quant/v10/population/reasons.cjs --out <private>/reasons.json
    python3 scripts/quant/v10/population/b3_population.py --reasons <private>/reasons.json \
        --out docs/quant-recovery/v10/population/population-frame-1.0.0.json --reference-out docs/quant-recovery/v10/population/sec-reference-full-index.json
"""
import argparse
import datetime as dt
import gzip
import io
import json
import re

import v10lib as L
from v10lib import sec_lib

YEARS = list(range(2000, 2027))
PRIMARY = {'NYSE': 'XNYS', 'NASDAQ': 'XNAS', 'NYSE MKT': 'XASE', 'AMEX': 'XASE', 'NYSE AMERICAN': 'XASE'}
# Nasdaq fifth-letter convention for 5-letter symbols (M/N/O/P preferred, R rights, U units, W warrants) and provider suffixes.
NON_COMMON_SYMBOL = re.compile(r'(?:_P_|_WS?$|_U$|_R$|^[A-Z]{4}[MNOPRUW]$)')
FRAME_OPTIONS = {'identityEvidence': True, 'identityEvidenceProtocolV10': True, 'corporateActionEvidence': True, 'listingLifecycleEvidence': True}


def iso_year(d):
    return dt.date.fromisoformat(d).isocalendar()[0]


def full_index_reference(last_quarter=(2026, 4)):
    """Distinct CIKs per filing calendar year for 10-K/10-K405, 8-A12B, 25/25-NSE from EDGAR full-index form.gz."""
    per = {y: {'tenK': set(), 'a12b': set(), 'f25': set()} for y in YEARS}
    files = []
    for y in YEARS:
        for q in range(1, 5):
            if (y, q) > last_quarter:
                continue
            url = 'https://www.sec.gov/Archives/edgar/full-index/%d/QTR%d/form.gz' % (y, q)
            try:
                body, meta = L.get(url)
            except Exception as e:  # noqa: BLE001
                files.append({'url': url, 'error': str(e)[:100]}); continue
            raw = gzip.decompress(body) if body[:2] == b'\x1f\x8b' else body
            files.append({'url': url, 'sha256': meta['sha256'], 'bytes': len(body)})
            started = False
            for line in io.StringIO(raw.decode('latin-1')):
                if not started:
                    started = line.startswith('-----')
                    continue
                parts = line.rstrip('\n').split()
                if len(parts) < 5:
                    continue
                # fixed layout: form type, company name (spaces), CIK, date filed, file name
                form, cik, filed = parts[0], parts[-3], parts[-2]
                if form == '8-A12B' or parts[0:2] == ['8-A12B', '/A']:
                    form = '8-A12B'
                if not filed[:4].isdigit():
                    continue
                fy = int(filed[:4])
                if fy not in per:
                    continue
                if form in ('10-K', '10-K405'):
                    per[fy]['tenK'].add(cik)
                elif form == '8-A12B':
                    per[fy]['a12b'].add(cik)
                elif form in ('25', '25-NSE'):
                    per[fy]['f25'].add(cik)
    table = {str(y): {'distinctCiks10K': len(v['tenK']), 'distinctCiks8A12B': len(v['a12b']), 'distinctCiks25': len(v['f25'])} for y, v in per.items()}
    return table, files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--reasons', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--reference-out', required=True)
    ap.add_argument('--reference', help='reuse an existing reference file instead of fetching')
    a = ap.parse_args()
    R = json.loads(open(a.reasons).read())
    cfg = R['configs']['all']
    assert cfg['options'] == FRAME_OPTIONS, cfg['options']
    master, by = L.master_rows()
    reg = None
    ids, excluded, perYear = [], {}, {str(y): {'providerSeries': 0, 'qualified': 0, 'laterDelisted': 0, 'survivors': 0} for y in YEARS}
    lifecycle = {}
    try:
        lc = json.loads(open(L.ROOT / 'docs/quant-recovery/v10/population/lifecycle-cases.json').read())
        lifecycle = {c['securityId']: c for c in lc['cases'] if c.get('resolved')}
    except FileNotFoundError:
        pass
    allrows = {r['securityId']: r for r in cfg['rows']}
    for sid in sorted(allrows):
        w = L.load_weekly(sid)
        f, t = w['points'][0][0], w['points'][-1][0]
        for y in range(max(2000, iso_year(f)), min(2026, iso_year(t)) + 1):
            perYear[str(y)]['providerSeries'] += 1
    for sid, r in sorted(allrows.items()):
        if r['reason'] != 'QUALIFIED':
            excluded[r['reason']] = excluded.get(r['reason'], 0) + 1
            continue
        lid = r['listingId']
        exch = None
        row = next((x for x in by.get(sid, []) if x['canonical_id'] == lid), None)
        if row:
            exch = row['exchange']
        if exch is None and lid.startswith('v9-sec-binding:'):
            if reg is None:
                import subprocess
                reg = json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('./quant/engines/research-identity-evidence.cjs')))"], cwd=str(L.ROOT)))
            rec = next(x for x in reg['records'] if x['canonicalId'] == lid)
            exch = {'XNAS': 'NASDAQ', 'XNYS': 'NYSE', 'XASE': 'NYSE MKT'}[rec['mic']]
        if NON_COMMON_SYMBOL.search(sid[4:]):
            # the master marks many Nasdaq preferred/notes symbols EQUITY_COMMON; the symbol convention decides here
            excluded['NON_COMMON_SYMBOL_CONVENTION'] = excluded.get('NON_COMMON_SYMBOL_CONVENTION', 0) + 1
            continue
        if exch not in PRIMARY or (row and row.get('instrument_type') != 'EQUITY_COMMON'):
            excluded['NOT_PRIMARY_US_COMMON_VENUE'] = excluded.get('NOT_PRIMARY_US_COMMON_VENUE', 0) + 1
            continue
        delisted = sid in lifecycle and r.get('lifecycle') == 'DELISTED_SOURCE_VERIFIED'
        ids.append({'securityId': sid, 'listingId': lid, 'mic': PRIMARY[exch], 'from': r['from'], 'to': r['to'], 'bars': r['bars'],
                    'laterDelisted': delisted, 'lastTradeDate': lifecycle[sid]['lastTrade']['lastTradeDate'] if delisted else None})
        for y in range(max(2000, iso_year(r['from'])), min(2026, iso_year(r['to'])) + 1):
            p = perYear[str(y)]
            p['qualified'] += 1
            if delisted:
                p['laterDelisted'] += 1
            else:
                p['survivors'] += 1
    if a.reference:
        ref = json.loads(open(a.reference).read())
    else:
        table, files = full_index_reference()
        ref = {'schemaVersion': 'v10-population-sec-reference-1.0.0', 'source': 'EDGAR full-index form.gz per quarter (same content as form.idx, gzip)',
               'definition': 'distinct CIKs per filing calendar year: 10-K or 10-K405 (all registrants, includes OTC and non-listed; order of magnitude); 8-A12B (incl. /A); 25 and 25-NSE',
               'files': files, 'perYear': table, 'generatedAt': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
        L.write_json(a.reference_out, ref)
    for y in YEARS:
        p = perYear[str(y)]
        tk = ref['perYear'][str(y)]['distinctCiks10K']
        p['sec10KFilers'] = tk
        p['coverageVs10KFilers'] = round(p['qualified'] / tk, 4) if tk else None
        p['survivorShare'] = round(p['survivors'] / p['qualified'], 4) if p['qualified'] else None
    idlist = [x['securityId'] for x in ids]
    rule = {'loaderOptions': FRAME_OPTIONS, 'include': 'createResearchLoader(root, loaderOptions) QUALIFIED and listing exchange NYSE/NASDAQ/NYSE MKT(AMEX) and master instrument_type EQUITY_COMMON (or SEC-bound common) and symbol not a preferred/right/unit/warrant by the Nasdaq fifth-letter or provider suffix convention (_P_, _W, _WS, _U, _R, 4 letters + M/N/O/P/R/U/W)',
            'perYear': 'listing counted in ISO year y when its qualified weekly series has >= 1 bar in y (series are gap-free by validate())',
            'laterDelisted': 'listingLifecycle.status == DELISTED_SOURCE_VERIFIED (SEC-sourced last trading day)'}
    frame = {'schemaVersion': 'v10-population-frame-1.0.0', 'evidenceKind': 'SOURCE_EVIDENCE', 'certificationStatus': 'NOT_CERTIFIED', 'productionApproved': False,
             'protocolSha256': L.sha256_file(L.ROOT / 'docs/quant-recovery/v10/population/protocol-1.0.0.json'),
             'rule': rule, 'ruleSha256': L.js_hash(rule), 'dataAsOf': {'weekly': max(x['to'] for x in ids) if ids else None, 'masterSha256': L.sha256_file(L.MASTER)},
             'counts': {'candidates': len(allrows), 'qualified': len(ids), 'laterDelisted': sum(x['laterDelisted'] for x in ids), 'excludedByReason': dict(sorted(excluded.items()))},
             'idsSha256': L.js_hash(idlist), 'perIsoYear': perYear,
             'secReference': {'path': a.reference_out, 'definition': ref['definition']},
             'scope': ('The qualifiable population is the current provider baseline universe (tickers present in today\'s security master baseline), not the historical US market population. '
                       'Listings that disappeared before the provider baseline was built are absent; delisted listings appear only where the provider still carries a frozen series and a SEC-sourced '
                       'last trading day exists. Coverage against SEC 10-K filers is an order of magnitude (10-K filers include OTC and non-listed registrants). '
                       'Early-year counts are additionally reduced by identity truncation (validFrom) and by INSUFFICIENT_HISTORY/MISSING_WEEKS/CORPORATE_ACTION holds.'),
             'listings': ids}
    L.write_json(a.out, frame)
    print(json.dumps({k: frame['counts'][k] for k in ('candidates', 'qualified', 'laterDelisted')}))
    for y in YEARS:
        print(y, perYear[str(y)])


if __name__ == '__main__':
    main()
