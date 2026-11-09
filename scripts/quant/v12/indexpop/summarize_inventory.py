#!/usr/bin/env python3
"""V12 INDEXPOP: compact repository copy of the filing inventory and fetch manifest (derived facts only).

Usage: python3 -I summarize_inventory.py <private-dir> <out.json>
"""
import json
import sys
from pathlib import Path

PRIV, OUT = Path(sys.argv[1]), Path(sys.argv[2])
inv = json.loads((PRIV / 'work' / 'inventory.json').read_text())
man = json.loads((PRIV / 'work' / 'manifest.json').read_text())
fetched = {d['accession']: d for d in man['documents']}
funds = []
for f in inv['funds']:
    rows = []
    for r in f['holdingsFilings']:
        d = fetched.get(r['accession'])
        rows.append([r['form'], r['filingDate'], r['reportDate'], r['accession'], d['state'] if d else 'NOT_FETCHED_BY_PLAN',
                     d.get('sha256') if d else None])
    funds.append({k: f[k] for k in ('fund', 'index', 'cik', 'series', 'formerNames', 'countsByFilingYear')} | {
        'columns': ['form', 'filingDate', 'reportDate(submissions; null for series browse)', 'accession', 'fetchState', 'sha256'], 'filings': rows})
out = {'schemaVersion': 'v12-indexpop-inventory-1.0.0', 'evidenceKind': 'SOURCE_EVIDENCE', 'sources': inv['sources'],
       'fetchPlan': 'NPORT-P primary_doc.xml for all six funds; SPY/DIA N-30D (+N-CSR 2004), QQQ N-30B-2/N-CSRS; iShares trust-wide N-Q (one document covers IWB/IWM/IWV). iShares N-CSR/N-CSRS (~2.6 GB, two further dates per year) not fetched.',
       'notFetchedByForm': man['notFetchedByForm'], 'documentsFetched': sum(1 for d in man['documents'] if d.get('state') == 'FETCHED'),
       'bytesFetched': sum(d.get('bytes', 0) for d in man['documents']), 'funds': funds}
OUT.write_text(json.dumps(out, indent=0) + '\n')
print(out['documentsFetched'], out['bytesFetched'])
