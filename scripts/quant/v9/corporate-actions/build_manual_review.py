#!/usr/bin/env python3
"""V9 workstream B: manual review verdicts for automatically flagged events, bound to original SEC documents.

Every verdict below was taken after reading the extracted document text (evidence_quotes.py output). Each quoted
string is VERIFIED to occur verbatim in the normalised text of the cited document (cached raw body, sha256 recorded);
the script fails if a quote is not found. Output: docs/quant-recovery/v9/corporate-actions/ca-manual-review.json
"""
import argparse, hashlib, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from scripts.quant.sec.http_client import DiskCache  # noqa: E402
from evidence_quotes import text_of  # noqa: E402

A = 'https://www.sec.gov/Archives/edgar/data/'
REVIEW = [
    # ---- confirmed distributions (spin-off / special dividend): price drop is real for PRICE_RETURN, total return needs the distribution
    {'key': 'ref_ABT|2013-01-04', 'verdict': 'SPIN_OFF_CONFIRMED', 'distribution': {'asset': 'AbbVie Inc. common stock', 'ratio': '1 AbbVie share per Abbott share', 'distributionDate': '2013-01-01', 'recordDate': None},
     'docs': [(A + '1800/000104746913000015/a2212294z8-k.htm', ['On January 1, 2013, Abbott Laboratories ("Abbott") completed the previously announced distribution of 100% of the outstanding common stock of AbbVie Inc']),
              (A + '1800/000110465912080568/a12-28134_18k.htm', ['Each Abbott shareholder as of the Record Date will receive one (1) share of AbbVie common stock for every share of Abbott common stock held at the close of business on the Record Date'])]},
    {'key': 'ref_JCI|2012-10-05', 'verdict': 'SPIN_OFF_CONFIRMED', 'identityNote': 'CIK 833444 filed in 2012 as Tyco International Ltd.; the weekly series carries the Tyco price history (2x drop at the ADT/Pentair distribution).',
     'distribution': {'asset': 'ADT Corp. and Pentair Ltd. (New Pentair) common shares', 'ratio': '1 ADT share per 2 Tyco shares and 0.239943 New Pentair share per Tyco share', 'distributionDate': '2012-09-28', 'recordDate': '2012-09-17'},
     'docs': [(A + '833444/000119312512411575/d418617d8k.htm', ['each Tyco shareholder received (i) one share of ADT for every two shares of Tyco held by such shareholder on the Record Date and (ii) 0.239943 of common shares of New Pentair for every share of Tyco held by such shareholder on the Record Date'])]},
    {'key': 'ref_SPXC|2015-10-02', 'verdict': 'SPIN_OFF_CONFIRMED', 'distribution': {'asset': 'SPX FLOW, Inc. common stock', 'ratio': '1 SPX FLOW share per SPX share', 'distributionDate': '2015-09-26', 'recordDate': '2015-09-16'},
     'docs': [(A + '88205/000110465915067759/a15-20300_18k.htm', ['on September 26, 2015, SPX Corporation (the “Company”) completed the previously announced tax-free spin-off', 'the Company distributed to its stockholders one share of SPX FLOW common stock, par value $0.01 per share, for every one share of SPX Corporation common stock'])]},
    {'key': 'ref_VATE|2013-08-30', 'verdict': 'SPECIAL_CASH_DIVIDEND_CONFIRMED', 'distribution': {'asset': 'cash', 'ratio': 'USD 8.50 per share', 'paymentDate': '2013-08-27', 'recordDate': '2013-08-20', 'exDate': None,
     'exDateNote': 'ex-date not established from these filings; the payment date is NOT an ex-date'},
     'docs': [(A + '1006837/000119312513345503/d587378d8k.htm', ['special cash dividend (the “ Dividend ”) of $8.50 per share on all issued and outstanding Company common stock, which will be paid on August 27, 2013 to holders of record of the Company common stock as of the close of business on August 20, 2013'])]},
    # ---- confirmed unadjusted split (data defect)
    {'key': 'ref_PZZA|2014-01-03', 'verdict': 'SPLIT_CONFIRMED_SERIES_UNADJUSTED', 'split': {'ratio': 2, 'form': 'stock dividend', 'recordDate': '2013-12-12', 'xbrlRatioFactEnd': '2013-12-29'},
     'providerSplitFactorsInSeries': [['1996-03-26', 1.5], ['1996-11-25', 1.5], ['2006-01-17', 2]],
     'docs': [(A + '901491/000115752313005314/a50743495ex99_1.htm', ['The Board of Directors also declared a two-for-one split of the company’s outstanding shares of common stock, which will be effected in the form of a stock dividend', 'The stock dividend entitles each shareholder of record at the close of business on December 12, 2013 to receive one additional share'])]},
    # ---- automated SPLIT_CONFIRMED flags rejected on review (boilerplate / authorization only / other date / wrong direction)
    {'key': 'ref_CELZ|2018-01-12', 'verdict': 'SPLIT_NOT_CONFIRMED', 'reason': 'split phrase only in preferred-stock adjustment boilerplate; share increase 2.29x is not tied to a split filing'},
    {'key': 'ref_GCTK|2024-11-15', 'verdict': 'SPLIT_NOT_CONFIRMED', 'reason': 'split phrase only in warrant/exercise-price adjustment boilerplate; shares x4.43 without split filing'},
    {'key': 'ref_GOVX|2025-07-03', 'verdict': 'SPLIT_NOT_CONFIRMED', 'reason': 'reverse-split authorization language only; shares INCREASED 1.67x, inconsistent with a reverse split'},
    {'key': 'ref_INBS|2023-03-10', 'verdict': 'SPLIT_NOT_CONFIRMED', 'reason': 'reverse split approved Feb 2023 but bracket shares INCREASED 1.89x; a reverse split would reduce shares; not consistent with the price move direction'},
    {'key': 'ref_MTVA|2025-04-17', 'verdict': 'SPLIT_NOT_CONFIRMED', 'reason': 'split phrase only in warrant adjustment boilerplate'},
    {'key': 'ref_QXL|2022-11-25', 'verdict': 'SPLIT_NOT_CONFIRMED', 'reason': 'the reverse split quoted was effected on 2022-08-31, three months before the event week'},
    {'key': 'ref_ZONE|2026-07-31', 'verdict': 'SPLIT_NOT_CONFIRMED', 'reason': 'split phrase only in warrant/share-combination boilerplate'},
    # ---- pre-2001 manual genuine-move check (outside automated rule: no EDGAR full-text search before 2001)
    {'key': 'ref_AAPL|2000-09-29', 'verdict': 'GENUINE_MOVE_SUPPORTED_MANUAL_PRE2001',
     'shareCounts': [{'end': '2000-07-21', 'val': 324969055, 'acc': '0000912057-00-033901', 'form': '10-Q'}, {'end': '2000-12-01', 'val': 335881977, 'acc': '0000912057-00-053623', 'form': '10-K'}],
     'negativeEvidence': 'issuer submissions list no 8-K between 2000-01-24 and 2001 (the only filings in the window are the 10-Q of 2000-07-31 and the 10-K of 2000-12-14); provider 2:1 split of 2000-06-21 precedes the pre share count (post-split level)',
     'docs': [(A + '320193/000091205700033901/a10-q.txt', ['324,969,055 shares of Common Stock Issued and Outstanding as of July 21, 2000']),
              (A + '320193/000091205700053623/a2032880z10-k.txt', ['335,881,977 shares of Common Stock Issued and Outstanding as of December 1, 2000'])]},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--private', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    c = DiskCache(pathlib.Path(a.private) / 'http-cache', ttl_seconds=None)
    out = []
    for r in REVIEW:
        r = dict(r)
        docs = []
        for url, quotes in r.pop('docs', []):
            raw = c.get(url)
            if raw is None:
                raise SystemExit('MISSING_SOURCE ' + url)
            txt = text_of(raw)
            for q in quotes:
                if q not in txt:
                    raise SystemExit('QUOTE_NOT_FOUND ' + url + ' :: ' + q[:80])
                if len(q) > 300:
                    raise SystemExit('QUOTE_TOO_LONG')
            docs.append({'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'quotes': quotes})
        r['documents'] = docs
        out.append(r)
    rep = {'schemaVersion': 'v9-ca-manual-review-1.0.0', 'note': 'Manual verdicts; quotes verified verbatim against the normalised text (HTML tags removed, entities unescaped, whitespace collapsed) of the cached original body.', 'reviews': out}
    pathlib.Path(a.out).write_text(json.dumps(rep, indent=1, ensure_ascii=False))
    print(len(out), 'reviews written')


if __name__ == '__main__':
    main()
