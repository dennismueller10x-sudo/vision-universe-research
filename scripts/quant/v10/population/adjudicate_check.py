"""V10 POPULATION: record the manual reading of every same-day MISMATCH that the (deliberately looser) independent
re-scan reports for a QUALIFIED identity case. The readings were made by hand in the cached bodies; this script only
attaches them to the current check output and fails if a new, unread hit appears.

    python3 -I scripts/quant/v10/population/adjudicate_check.py --root . --out docs/quant-recovery/v10/population/independent-check-adjudication.json
"""
import argparse
import json
import os
import sys

READINGS = {
    'ref_AERT': ('DATE_MISATTRIBUTED', 'statements are "On November 26 / September 26, 2025, the last reported sale price ... was $x"; the checker took the next sentence "As of October 1, 2025"'),
    'ref_BEAT': ('DATE_MISATTRIBUTED', 'statement dates are May 1, 2024 / March 7, 2023 / February 1, 2023; the checker took the following "As of <date>" sentence'),
    'ref_COGT': ('NOT_A_MARKET_CLOSE', 'private placement purchase price $7.50 per share, not a closing price'),
    'ref_CRC': ('OTHER_ISSUER', 'closing price of Berry common stock (merger partner), not of the bound listing'),
    'ref_CZR': ('DATE_MISATTRIBUTED', 'PSU footnotes: the price is the closing price as of December 31 of the prior year; the checker took the PSU grant date'),
    'ref_DERM': ('NOT_A_MARKET_CLOSE', 'IPO price $10.00 per share'),
    'ref_EE': ('DATE_MISATTRIBUTED', '$0.001 is the par value; the cover statement gives no per-share price'),
    'ref_HCC': ('DATE_MISATTRIBUTED', 'statement is the close on July 2, 2018 "(as June 30, 2018 was not a trading day)"'),
    'ref_INM': ('NOT_A_MARKET_CLOSE', '$5.15 is a five-day average / average selling price; the same-day close stated there is $5.26'),
    'ref_MOVE': ('DATE_MISATTRIBUTED', 'private placement price and last-sale statements dated Feb 10, 2026 / Jan 6, 2026 / Dec 17, 2025; the checker took "On October 1, 2025, we received a written notice"'),
    'ref_VS': ('DATE_MISATTRIBUTED', 'statements dated April 11, 2024 / February 9, 2024; the checker took "As at December 31, 2023" of the next sentence'),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    base = os.path.join(a.root, 'docs/quant-recovery/v10/population')
    d = json.load(open(os.path.join(base, 'independent-check.json')))
    q = {c['securityId'] for c in json.load(open(os.path.join(base, 'identity-cases.json')))['cases'] if c['decision'].startswith('QUAL')}
    items, unread = [], []
    for m in d['checks']['identity']['rescan']['missedMismatchesInsideInterval']:
        if m['securityId'] not in q:
            continue
        if m['securityId'] not in READINGS:
            unread.append(m)
            continue
        cat, why = READINGS[m['securityId']]
        items.append(dict(m, category=cat, verdict='NOT_A_SAME_DAY_CLOSE_OF_THE_BOUND_LISTING', reading=why))
    out = {'schemaVersion': 'v10-population-independent-check-adjudication-1.0.0', 'checkFile': 'docs/quant-recovery/v10/population/independent-check.json',
           'scope': 'every same-day MISMATCH the looser independent re-scan reports for a QUALIFIED id that the pipeline did not record; read by hand in the cached body. Hits for EXCLUDED ids cannot change an exclusion and are not adjudicated.',
           'counts': {'adjudicated': len(items), 'unread': len(unread), 'genuineMismatchesFound': 0,
                      'byCategory': {k: sum(1 for i in items if i['category'] == k) for k in sorted({i['category'] for i in items})}},
           'items': items, 'unread': unread}
    with open(a.out, 'w') as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(json.dumps(out['counts']))
    if unread:
        sys.exit(1)


if __name__ == '__main__':
    main()
