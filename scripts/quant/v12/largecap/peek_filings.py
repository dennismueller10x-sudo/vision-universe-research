"""V12 LARGECAP: filing-list metadata around each blocking event (submissions API only, no document bodies).
Usage: python3 -I peek_filings.py <out.json>
Disclosed in protocol-1.0.0.json (priorKnowledge): this listing of form types/dates/items was produced before the
protocol was registered; no filing document was opened before registration.
"""
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import seclib  # noqa: E402

CASES = [  # (securityId, cik, event week or None)
    ('ref_AAPL', 320193, '2000-09-29'), ('ref_GOOGL', 1288776, '2014-04-04'), ('ref_GOOGL', 1652044, '2014-04-04'),
    ('ref_ABT', 1800, '2013-01-04'), ('ref_MS', 895421, '2008-10-17'), ('ref_USB', 36104, '1999-04-16'),
    ('ref_JCI', 833444, '2012-10-05'), ('ref_KDP', 1418135, '2018-07-13'), ('ref_WBD', 1437107, '2014-08-08'),
    ('ref_IFF', 51253, '1994-01-21'), ('ref_TEL', 1385157, None), ('ref_DD', 1666700, None), ('ref_DOW', 1751788, None),
    ('ref_COR', 1140859, None), ('ref_DOC', 765880, None), ('ref_MRNA', 1682852, None)]


def main(out):
    res = []
    for sid, cik, week in CASES:
        head, filings, metas = seclib.submissions(cik)
        row = {'securityId': sid, 'cik': cik, 'head': head, 'filings': len(filings), 'first': filings[0]['filingDate'] if filings else None,
               'submissions': [{'url': m['url'], 'sha256': m['sha256']} for m in metas]}
        if week:
            lo = (dt.date.fromisoformat(week) - dt.timedelta(days=130)).isoformat()
            hi = (dt.date.fromisoformat(week) + dt.timedelta(days=130)).isoformat()
            row['near'] = [[f['filingDate'], f.get('reportDate'), f['form'], f.get('items'), f['accessionNumber'], f.get('primaryDocument')]
                           for f in filings if lo <= f['filingDate'] <= hi and f['form'] in ('8-K', '8-K/A', '10-K', '10-Q', '10-K405', '8-A12B', '25', 'S-4', '424B3', 'DEF 14A', '10-12B', '425')]
        res.append(row)
        print(sid, cik, head.get('name'), head.get('tickers'), len(filings), row['first'], file=sys.stderr)
    pathlib.Path(out).write_text(json.dumps(res, indent=1))
    print('stats', seclib.STATS, file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1])
