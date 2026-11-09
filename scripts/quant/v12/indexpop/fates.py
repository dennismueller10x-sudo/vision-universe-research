#!/usr/bin/env python3
"""V12 INDEXPOP step 5: fate of exited index members from SEC submissions metadata (Form 25/15, 8-K items).

Input: the private exits list written by build-outputs.cjs (exits-<rules>.json). For every exit of SPY, QQQ, DIA and
IWV (Russell 3000 = broad market; IWB/IWM exits are largely migrations between the two halves) with a CIK, the issuer's
submissions JSON (data.sec.gov, fair access via secfetch.py / http_client.py, <= 2 requests/s, private cache) is read
and filings after the last holding date are classified:

  window = (lastHoldingDate, lastHoldingDate + 400 days]
  DELISTING_NOTICE      Form 25 / 25-NSE in window
  DEREGISTRATION        Form 15-12B / 15-12G / 15-15D in window
  ACQUISITION_EVIDENCE  8-K item 2.01 (completion of acquisition/disposition), DEFM14A, SC 14D9 or SC TO-T in window
  BANKRUPTCY_EVIDENCE   8-K item 1.03 in window
  STILL_REPORTING       10-K/10-Q/20-F/40-F filed later than the window
  fate: with Form 25/15 in the window -> ACQUIRED_OR_MERGED (plus acquisition evidence), DELISTED_BANKRUPTCY (plus
        8-K 1.03) or DELISTED_OTHER; else STILL_REPORTING_INDEX_EXIT when periodic reports continue; else
        ACQUIRED_OR_MERGED_NO_25_15 / BANKRUPTCY_NO_25_15 / NO_SEC_EVIDENCE. (Rule fixed after a 20-CIK trial run that
        showed issuers taken private continuing to file for their debt, e.g. Aeroflex 2007.)
A CIK found only by name (EDGAR_NAME_UNIQUE) is used only when the submissions name or a former name normalizes to the
holdings name (else CIK_NAME_MISMATCH, no fate).

Usage: python3 -I fates.py <repo-root> <private-dir> <exits.json> <out.json> [--offline] [--limit N]
"""
import hashlib
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT, PRIV, EXITS, OUT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), Path(sys.argv[3]), Path(sys.argv[4])
OFFLINE = '--offline' in sys.argv
LIMIT = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else None
sys.path.insert(0, str(ROOT / 'scripts' / 'quant' / 'v12' / 'indexpop'))
from secfetch import Fetcher, ledger_count  # noqa: E402

FUNDS = {'SPY', 'QQQ', 'DIA', 'IWV'}
LEGAL = {'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED', 'PLC', 'LLC', 'LP', 'NV', 'SA', 'AG', 'SE'}
FILLER = {'COM', 'COMMON', 'STOCK', 'SHS', 'SHARES', 'ORD', 'ADR', 'NVS', 'THE'}


def norm(raw):
    """Independent re-implementation of the 1.1.0 name normalization (key only)."""
    s = (raw or '').upper().replace('&AMP;', '&').replace('&', ' AND ')
    s = re.sub(r'/THE\b', ' ', s)
    s = re.sub(r'/[A-Z]{2}/?$', ' ', s)
    s = re.sub(r'/[A-Z]{2}\s', ' ', s)
    s = re.sub(r'\b(?:CLASS|CL)\s*[- .]?\s*[A-C]\b', ' ', s)
    toks = [t for t in re.sub(r'[^A-Z0-9 ]+', ' ', s).split() if t not in FILLER]
    while len(toks) > 1 and (toks[-1] in LEGAL or toks[-1] == 'NEW'):
        toks.pop()
    return ' '.join(toks)


def iso(d):
    return date.fromisoformat(d)


def filings_of(f, cik, need_from):
    url = 'https://data.sec.gov/submissions/CIK%010d.json' % cik
    raw = f.get(url)
    d = json.loads(raw)
    blocks = [d['filings']['recent']]
    rows = []
    def add(b):
        for i in range(len(b['form'])):
            rows.append((b['form'][i], b['filingDate'][i], b['accessionNumber'][i], b.get('items', [''] * len(b['form']))[i] or ''))
    add(blocks[0])
    for extra in d['filings'].get('files', []):
        # older pages only when the recent block does not reach back to the window start
        if rows and min(r[1] for r in rows) <= need_from:
            break
        if extra.get('filingTo', '9999') < need_from:
            continue
        add(json.loads(f.get('https://data.sec.gov/submissions/' + extra['name'])))
    names = [d.get('name') or ''] + [x.get('name') or '' for x in d.get('formerNames', [])]
    return {'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'name': d.get('name'), 'names': names, 'tickers': d.get('tickers', []), 'exchanges': d.get('exchanges', []), 'rows': rows}


def classify(sub, last):
    lo, hi = iso(last), iso(last) + timedelta(days=400)
    ev = {'DELISTING_NOTICE': [], 'DEREGISTRATION': [], 'ACQUISITION_EVIDENCE': [], 'BANKRUPTCY_EVIDENCE': []}
    still = None
    for form, fd, accn, items in sub['rows']:
        d = iso(fd)
        if form in ('10-K', '10-Q', '20-F', '40-F', '10-K405') and d > hi:
            still = still or fd
        if not (lo < d <= hi):
            continue
        rec = {'form': form, 'filingDate': fd, 'accession': accn}
        if form in ('25', '25-NSE', '25/A', '25-NSE/A'):
            ev['DELISTING_NOTICE'].append(rec)
        elif form.startswith('15-') or form in ('15-12B', '15-12G', '15-15D'):
            ev['DEREGISTRATION'].append(rec)
        elif form in ('DEFM14A', 'SC 14D9', 'SC TO-T', 'DEFM14C', 'SC 14D9/A'):
            ev['ACQUISITION_EVIDENCE'].append(rec)
        elif form.startswith('8-K'):
            its = set(x.strip() for x in items.split(','))
            if '2.01' in its:
                ev['ACQUISITION_EVIDENCE'].append({**rec, 'items': items})
            if '1.03' in its:
                ev['BANKRUPTCY_EVIDENCE'].append({**rec, 'items': items})
    # Form 25/15 in the window decides (issuers taken private may keep filing for their debt); 8-K 2.01 alone is
    # also filed by acquirers, so it counts only together with 25/15 or when the issuer stops reporting.
    if ev['DELISTING_NOTICE'] or ev['DEREGISTRATION']:
        fate = 'ACQUIRED_OR_MERGED' if ev['ACQUISITION_EVIDENCE'] else 'DELISTED_BANKRUPTCY' if ev['BANKRUPTCY_EVIDENCE'] else 'DELISTED_OTHER'
    elif still:
        fate = 'STILL_REPORTING_INDEX_EXIT'
    elif ev['ACQUISITION_EVIDENCE']:
        fate = 'ACQUIRED_OR_MERGED_NO_25_15'
    elif ev['BANKRUPTCY_EVIDENCE']:
        fate = 'BANKRUPTCY_NO_25_15'
    else:
        fate = 'NO_SEC_EVIDENCE'
    return fate, {k: v[:3] for k, v in ev.items() if v}, still


def main():
    exits = [x for x in json.loads(EXITS.read_text())['exits'] if x['fund'] in FUNDS]
    f = Fetcher(ROOT, PRIV, offline=OFFLINE)
    ciks = sorted({x['cik'] for x in exits if x['cik']})
    if LIMIT:
        ciks = ciks[:LIMIT]
    earliest = {}
    for x in exits:
        if x['cik']:
            earliest[x['cik']] = min(earliest.get(x['cik'], '9999'), x['lastHoldingDate'])
    subs, failed = {}, {}
    for i, cik in enumerate(ciks):
        try:
            subs[cik] = filings_of(f, cik, earliest[cik])
        except LookupError:
            failed[cik] = 'NOT_CACHED'
        except Exception as e:  # noqa: BLE001 - SECHTTPError and malformed payloads are counted, not fatal
            failed[cik] = str(e)[:160]
        if i % 250 == 0:
            print(i, len(ciks), ledger_count(PRIV), flush=True)
    out_rows, counts = [], {}
    for x in exits:
        r = {k: x[k] for k in ('fund', 'index', 'identity', 'securityId', 'cik', 'name', 'firstHoldingDate', 'lastHoldingDate', 'nextFundDate', 'datesHeld', 'lastWeightPct', 'lastPrice', 'hasQualifiedSeriesAtExit', 'seriesStatus')}
        sub = subs.get(x['cik']) if x['cik'] else None
        if not x['cik']:
            r['fate'] = 'NO_CIK'
        elif sub is None:
            r['fate'] = 'SUBMISSIONS_UNAVAILABLE'
        else:
            names = {norm(n) for n in sub['names']}
            name_ok = norm(x['name']) in names or bool(x['securityId'])
            if not name_ok:
                r['fate'] = 'CIK_NAME_MISMATCH'
            else:
                r['fate'], r['evidence'], r['stillReportingFiling'] = classify(sub, x['lastHoldingDate'])
                r['submissions'] = {'url': sub['url'], 'sha256': sub['sha256'], 'secName': sub['name']}
        c = counts.setdefault(x['fund'], {})
        c[r['fate']] = c.get(r['fate'], 0) + 1
        key = 'withQualifiedSeries' if x['hasQualifiedSeriesAtExit'] else 'withoutQualifiedSeries'
        c2 = counts.setdefault(x['fund'] + ':' + key, {})
        c2[r['fate']] = c2.get(r['fate'], 0) + 1
        out_rows.append(r)
    doc = {'schemaVersion': 'v12-indexpop-exits-1.0.0', 'evidenceKind': 'SOURCE_EVIDENCE', 'certificationStatus': 'NOT_CERTIFIED', 'productionApproved': False,
           'method': __doc__.split('Usage:')[0].strip(), 'funds': sorted(FUNDS), 'ciks': len(ciks), 'submissionsFailed': failed, 'counts': counts,
           'secRequestsLedger': ledger_count(PRIV), 'exits': out_rows}
    OUT.write_text(json.dumps(doc, indent=0) + '\n')
    print(json.dumps({'exits': len(out_rows), 'ciks': len(ciks), 'failed': len(failed), 'counts': counts, 'ledger': doc['secRequestsLedger']}, indent=1))


if __name__ == '__main__':
    main()
