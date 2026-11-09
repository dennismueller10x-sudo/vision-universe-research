"""V12 LISTREF: map 25-NSE filer prefixes (accession prefix = filing exchange) to an exchange group (amendment 1.0.2 B1).

Prefixes with >= 30 25-NSE filings in the private index extract are resolved to the SEC entity name through
data.sec.gov submissions (one request each, fair-access client); the group follows from the name.

    python3 scripts/quant/v12/listref/resolve_agents.py --out <private>/work/exchange-agents.json
"""
import argparse
import collections
import gzip
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrlib as L  # noqa: E402


def group(name):
    n = name.upper()
    if re.search(r'TEXAS|CHICAGO|NATIONAL', n):
        return 'OTHER'
    if 'ARCA' in n:
        return 'ARCA'
    if re.search(r'AMERICAN|NYSE MKT|AMEX', n):
        return 'AMEX'
    if 'NEW YORK STOCK EXCHANGE' in n or n.startswith('NYSE'):
        return 'NYSE'
    if re.fullmatch(r'NASDAQ STOCK MARKET.*', n) or n.startswith('THE NASDAQ STOCK MARKET'):
        return 'NASDAQ'
    return 'OTHER'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    L._assert_private(a.out)
    c = collections.Counter()
    with gzip.open(L.PRIVATE / 'work' / 'edgar-events.tsv.gz', 'rt') as fh:
        for line in fh:
            f, cik, d, acc, name = line.rstrip('\n').split('\t')
            if f in ('25-NSE', '25-NSE/A'):
                c[acc[:10]] += 1
    agents = {}
    for prefix, n in c.most_common():
        if n < 30:
            continue
        body, meta = L.get('https://data.sec.gov/submissions/CIK%s.json' % prefix)
        name = json.loads(body).get('name')
        agents[prefix] = {'name': name, 'group': group(name or ''), 'filings25NSE': n, 'source': meta['url'], 'sha256': meta['sha256']}
    L.write_json(a.out, {'agents': agents, 'rule': 'group from SEC entity name: ARCA, AMEX (American/NYSE MKT/Amex), NYSE (New York Stock Exchange), NASDAQ (The Nasdaq Stock Market), else OTHER', 'sec': dict(L.STATS)})
    print(json.dumps(agents, indent=1))


if __name__ == '__main__':
    main()
