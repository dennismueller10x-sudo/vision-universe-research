#!/usr/bin/env python3
"""V12 INDEXPOP step 1: inventory of SEC holdings filings per index fund.

Funds (SEC identifiers verified from https://www.sec.gov/files/company_tickers_mf.json and the submissions API):
  SPY  SPDR S&P 500 ETF Trust                 CIK 884394   (UIT; N-30D annual/semi-annual reports, NPORT-P from 2019)
  QQQ  Invesco QQQ Trust, Series 1            CIK 1067839  (UIT until 2025; N-30B-2 annual reports, NPORT-P)
  DIA  SPDR Dow Jones Industrial Average ETF  CIK 1041130  (UIT; N-30D, NPORT-P)
  IWB  iShares Russell 1000 ETF   iShares Trust CIK 1100663, series S000004347
  IWM  iShares Russell 2000 ETF   series S000004344
  IWV  iShares Russell 3000 ETF   series S000004341
For the UITs the filing list comes from data.sec.gov/submissions; for the iShares series from the series-filtered
EDGAR company browse (atom). Series tagging on EDGAR starts in 2006; earlier trust-wide iShares filings are not
attributable to a series by this route and are counted as such.

Usage: python3 -I inventory.py <repo-root> <private-dir> <out.json>
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT, PRIV, OUT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), Path(sys.argv[3])
sys.path.insert(0, str(ROOT / 'scripts' / 'quant' / 'v12' / 'indexpop'))
from secfetch import Fetcher, ledger_count  # noqa: E402

FUNDS = [
    {'fund': 'SPY', 'index': 'SP500', 'cik': 884394, 'series': None, 'expectedPositions': [480, 520]},
    {'fund': 'QQQ', 'index': 'NDX', 'cik': 1067839, 'series': None, 'expectedPositions': [95, 110]},
    {'fund': 'DIA', 'index': 'DJIA', 'cik': 1041130, 'series': None, 'expectedPositions': [30, 31]},
    {'fund': 'IWB', 'index': 'R1000', 'cik': 1100663, 'series': 'S000004347', 'expectedPositions': [950, 1050]},
    {'fund': 'IWM', 'index': 'R2000', 'cik': 1100663, 'series': 'S000004344', 'expectedPositions': [1900, 2100]},
    {'fund': 'IWV', 'index': 'R3000', 'cik': 1100663, 'series': 'S000004341', 'expectedPositions': [2800, 3100]},
]
# Forms that carry a complete schedule of investments (holdings) for the fund.
HOLDINGS_FORMS = {'NPORT-P', 'NPORT-P/A', 'N-Q', 'N-Q/A', 'N-CSR', 'N-CSR/A', 'N-CSRS', 'N-CSRS/A', 'N-30D', 'N-30D/A', 'N-30B-2'}


def submissions_rows(f, cik):
    d = f.get_json('https://data.sec.gov/submissions/CIK%010d.json' % cik)
    blocks = [d['filings']['recent']] + [f.get_json('https://data.sec.gov/submissions/' + x['name']) for x in d['filings'].get('files', [])]
    rows = []
    for r in blocks:
        for i in range(len(r['form'])):
            rows.append({'form': r['form'][i], 'filingDate': r['filingDate'][i], 'reportDate': r['reportDate'][i] or None,
                         'accession': r['accessionNumber'][i], 'primaryDocument': r['primaryDocument'][i] or None, 'size': r['size'][i]})
    return rows, d.get('formerNames', [])


ENTRY = re.compile(r'<entry>(.*?)</entry>', re.S)


def tag(s, t):
    m = re.search(r'<%s>(.*?)</%s>' % (t, t), s, re.S)
    return m.group(1).strip() if m else None


def series_rows(f, series, form):
    rows, start = [], 0
    while True:
        url = ('https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=%s&type=%s&dateb=&owner=include&start=%d&count=100&output=atom'
               % (series, form, start))
        page = f.get(url).decode('latin-1')
        ents = ENTRY.findall(page)
        for e in ents:
            rows.append({'form': tag(e, 'filing-type'), 'filingDate': tag(e, 'filing-date'), 'reportDate': None,
                         'accession': tag(e, 'accession-number'), 'primaryDocument': None, 'size': tag(e, 'size')})
        if len(ents) < 100:
            return rows
        start += 100


def main():
    f = Fetcher(ROOT, PRIV)
    out = {'schemaVersion': 'v12-indexpop-inventory-1.0.0', 'evidenceKind': 'SOURCE_EVIDENCE',
           'sources': {'mfTickers': 'https://www.sec.gov/files/company_tickers_mf.json', 'submissions': 'https://data.sec.gov/submissions/CIK##########.json',
                       'seriesBrowse': 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=<seriesId>&type=<form>&output=atom'},
           'funds': []}
    for fund in FUNDS:
        if fund['series'] is None:
            rows, former = submissions_rows(f, fund['cik'])
        else:
            former, seen, rows = [], set(), []
            for form in ('NPORT-P', 'N-Q', 'N-CSR', 'N-CSRS', 'N-30D'):
                for r in series_rows(f, fund['series'], form):
                    if r['accession'] not in seen and r['form'] in HOLDINGS_FORMS:
                        seen.add(r['accession']); rows.append(r)
        hold = sorted([r for r in rows if r['form'] in HOLDINGS_FORMS], key=lambda r: (r['filingDate'], r['accession']))
        byYear = defaultdict(Counter)
        for r in hold:
            byYear[r['filingDate'][:4]][r['form']] += 1
        out['funds'].append({**fund, 'formerNames': former, 'holdingsFilings': hold,
                             'countsByFilingYear': {y: dict(c) for y, c in sorted(byYear.items())}})
        print(fund['fund'], len(hold), {y: dict(c) for y, c in sorted(byYear.items())})
    out['secRequestsLedger'] = ledger_count(PRIV)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1) + '\n')


if __name__ == '__main__':
    main()
