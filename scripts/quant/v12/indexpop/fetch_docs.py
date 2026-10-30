#!/usr/bin/env python3
"""V12 INDEXPOP step 1b: fetch the holdings documents named in the inventory (private cache only).

Selection (budget plan, see README):
  NPORT-P / NPORT-P/A    primary_doc.xml of every filing (all six funds)
  N-30D, N-30D/A, N-CSR  SPY and DIA reports (primary document; filings without one: complete submission .txt)
  N-30B-2                QQQ annual reports
  N-Q, N-Q/A             iShares trust-wide quarterly schedules (one document covers IWB, IWM and IWV); the main
                         document name is read from the filing index
  N-CSR/N-CSRS (iShares) NOT fetched: ~2.6 GB of trust-wide reports for two further dates per year; counted as
                         available-not-fetched in the manifest.
Writes a manifest (url, sha256, bytes) per document. Documents stay in the private HTTP cache.

Usage: python3 -I fetch_docs.py <repo-root> <private-dir> <inventory.json> <manifest-out.json> [--offline]
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT, PRIV, INV, OUT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), Path(sys.argv[3]), Path(sys.argv[4])
OFFLINE = '--offline' in sys.argv
sys.path.insert(0, str(ROOT / 'scripts' / 'quant' / 'v12' / 'indexpop'))
from secfetch import Fetcher, ledger_count  # noqa: E402

UIT_FORMS = {'N-30D', 'N-30D/A', 'N-CSR', 'N-30B-2', 'N-CSRS'}


def base(cik, accn):
    return 'https://www.sec.gov/Archives/edgar/data/%d/%s/' % (cik, accn.replace('-', ''))


def main_doc_from_index(f, cik, accn, form):
    page = f.get(base(cik, accn) + accn + '-index.htm').decode('latin-1')
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', page, re.S)
    for r in rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)
        href = re.search(r'href="(/Archives/[^"]+)"', r)
        if href and len(cells) >= 4 and re.sub('<[^>]+>', '', cells[3]).strip() == form:
            return 'https://www.sec.gov' + href.group(1)
    return None


def main():
    inv = json.loads(INV.read_text())
    f = Fetcher(ROOT, PRIV, offline=OFFLINE)
    docs, seen, skipped = [], set(), {}
    for fund in inv['funds']:
        cik = fund['cik']
        for r in fund['holdingsFilings']:
            form, accn = r['form'], r['accession']
            key = accn
            if form.startswith('NPORT-P'):
                url = base(cik, accn) + 'primary_doc.xml'; kind = 'NPORT_XML'
            elif fund['series'] is None and form in UIT_FORMS:
                pd = r.get('primaryDocument')
                url = base(cik, accn) + (pd if pd else accn + '.txt'); kind = 'REPORT_HTML' if (pd or '').endswith('.htm') else 'REPORT_TEXT'
            elif fund['series'] and form in ('N-Q', 'N-Q/A'):
                if accn in seen:
                    for d in docs:
                        if d['accession'] == accn:
                            d['funds'].append(fund['fund'])
                    continue
                try:
                    url = main_doc_from_index(f, cik, accn, form)
                except LookupError:
                    url = None
                kind = 'NQ_HTML'
                if url is None:
                    docs.append({'accession': accn, 'form': form, 'funds': [fund['fund']], 'state': 'MAIN_DOC_NOT_FOUND'}); seen.add(accn); continue
            else:
                skipped[form] = skipped.get(form, 0) + 1
                continue
            seen.add(key)
            rec = {'accession': accn, 'form': form, 'funds': [fund['fund']], 'cik': cik, 'filingDate': r['filingDate'], 'reportDate': r.get('reportDate'), 'url': url, 'kind': kind}
            try:
                b = f.get(url)
                rec.update({'state': 'FETCHED', 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()})
            except LookupError:
                rec['state'] = 'NOT_CACHED'
            except Exception as e:  # SECHTTPError
                rec.update({'state': 'FETCH_FAILED', 'error': str(e)[:200]})
            docs.append(rec)
            print(rec['funds'], form, rec['filingDate'], rec['state'], rec.get('bytes'), flush=True)
    out = {'schemaVersion': 'v12-indexpop-fetch-manifest-1.0.0', 'documents': docs, 'notFetchedByForm': skipped, 'secRequestsLedger': ledger_count(PRIV)}
    OUT.write_text(json.dumps(out, indent=1) + '\n')
    print(json.dumps({'documents': len(docs), 'notFetched': skipped, 'ledger': out['secRequestsLedger']}))


if __name__ == '__main__':
    main()
