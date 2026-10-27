#!/usr/bin/env python3
"""V9 identity: SEC-original dossiers for the 4 INACTIVE_LISTING_TERMINAL_VALUE_UNVERIFIED and
3 LISTING_IDENTITY_MISMATCH weekly listings.

For each case it fetches (rate-limited, cached privately) the SEC submissions JSON of the issuer the
weekly series actually represents and of the issuer the security master row points to, the key
filings (ticker changes, exchange transfers, successor registration, terminal events, splits /
spin-offs) and SEC-stated closing prices. Committed output holds only derived facts: accession,
URL, filing date, SHA-256 of the fetched body (or of its fixed 2 MiB prefix), short quotes.

Then it tests the weekly series itself against the SEC-stated prices (split convention of
return-series.js#splitFactors) and for level breaks at the claimed transition dates.

usage: build_dossiers.py --out docs/quant-recovery/v9/identity/dossiers-7.json
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import sec_lib as S  # noqa: E402
import series_lib as L  # noqa: E402
import resolve_ambiguous as R  # noqa: E402

ROOT = L.ROOT
MASTER = ROOT / 'quant/data/market/security-master/us-security-master.json'

# Each doc: (role, cik, accession, primaryDocument, [(claim, regex)], [price claims])
# price claim: (date, regex with one capture group for the price, issuerLabel)
CASES = [
    dict(securityId='ref_COHR', priceSubject=r'our common stock|the company.s common stock|ii-vi common stock|the common stock on', priceExclude=r'coherent common stock|coherent, inc', reason='INACTIVE_LISTING_TERMINAL_VALUE_UNVERIFIED', seriesCik=820318, masterCik=21510,
         tickerChain=[('IIVI', None, '2022-09-07', 'XNAS'), ('COHR', '2022-09-08', '2023-02-22', 'XNAS'), ('COHR', '2023-02-23', None, 'XNYS')],
         instrumentClass='COMMON_STOCK_NO_PAR', issuer='Coherent Corp. (formerly II-VI Incorporated)',
         docs=[
             ('TICKER_CHANGE', 820318, '0001193125-22-240836', 'd347635d8k.htm', [('IIVI_TO_COHR', r'began trading under the ticker symbol .COHR.')], []),
             ('EXCHANGE_TRANSFER', 820318, '0001193125-23-027571', 'd444935d8k.htm', [('NASDAQ_TO_NYSE', r'expected to begin trading on the NYSE')], []),
             ('PRICE_IDENTITY', 820318, '0001193125-21-134433', 'd150472ds4.htm', [('MERGER_TERMS', r'.cash consideration. refers to \$220\.00'), ('EXCHANGE_RATIO', r'.exchange ratio. refers to 0\.91')],
              [('2021-03-24', r'closing price of II-VI common stock on the Nasdaq Global Select Market .{0,80}?on March 24, 2021.{0,80}?of \$([0-9.]+)', 'II-VI'),
               ('2021-04-26', r'closing price of II-VI common stock on Nasdaq on April 26, 2021 of \$([0-9.]+)', 'II-VI')]),
             ('PREDECESSOR_TERMINAL', 21510, '0001104659-22-076572', 'tm2220124d1_8k.htm', [('COHERENT_INC_MERGER_COMPLETED', r'(merger consideration|\$220\.00)'), ('DELISTING', r'(delist|Form 25)')], []),
             ('SPLIT_EVIDENCE', 820318, '0001193125-11-143673', 'd8k.htm', [('SPLIT_2011', r'two-for-one')], []),
             ('SPLIT_EVIDENCE', 820318, '0000820318-05-000005', 'r-8k02172005.txt', [('SPLIT_2005', r'two-for-one')], []),
         ],
         transitions=['2021-03-26', '2022-07-01', '2022-09-08', '2023-02-23'],
         earliestTicker=('IIVI', 820318)),
    dict(securityId='ref_BGC', priceSubject=r'our class a common stock|bgc partners class a common stock|espeed class a common stock|bgc group class a common stock', priceExclude=r'newmark|cantor', reason='INACTIVE_LISTING_TERMINAL_VALUE_UNVERIFIED', seriesCik=1094831, masterCik=886035,
         tickerChain=[('ESPD', None, '2008-04-01', 'XNAS'), ('BGCP', '2008-04-02', '2023-06-30', 'XNAS'), ('BGC', '2023-07-03', None, 'XNAS')],
         instrumentClass='CLASS_A_COMMON_STOCK', issuer='BGC Group, Inc. (successor issuer of BGC Partners, Inc., formerly eSpeed, Inc.)',
         docs=[
             ('TICKER_CHANGE', 1094831, '0001193125-08-076419', 'd8k.htm', [('ESPD_TO_BGCP', r'under the symbol .BGCP.')], []),
             ('SUCCESSOR_REGISTRATION', 1094831, '0001193125-23-180979', 'd521017d8k12b.htm', [('SUCCESSOR_ISSUER', r'BGC Group, Inc\. is the successor issuer'), ('ONE_FOR_ONE', r'converted into the right to receive one share of BGC Group Class A Common Stock'), ('PRIOR_TICKER', r'prior ticker symbol BGCP')], []),
             ('SPINOFF_NOT_SPLIT', 1094831, '0001193125-18-342885', 'd657778d8k.htm', [('NEWMARK_DISTRIBUTION', r'received in the Distribution 0\.463895 of a share of Newmark Class A common stock')], []),
             ('PRICE_IDENTITY', 1094831, '0001193125-08-025543', 'ddefm14a.htm', [],
              [('2007-09-28', r'closing price of eSpeed Class A common stock on September 28, 2007 of \$([0-9.]+)', 'eSpeed')]),
             ('PRICE_IDENTITY', 1094831, '0001193125-23-154748', 'd476089ddefm14a.htm', [],
              [('2023-05-19', r'assumed stock price of \$([0-9.]+), the closing price of a share of BGC Partners Class A common stock on May 19, 2023', 'BGC Partners')]),
             ('PREDECESSOR_TERMINAL', 886035, '0001193125-18-185029', 'd600292d8k.htm', [('GENERAL_CABLE_CASH', r'right to receive \$30\.00'), ('DELISTING', r'(delist|Form 25)')], []),
         ],
         transitions=['2008-04-04', '2018-06-08', '2018-12-03', '2023-07-03'],
         earliestTicker=('ESPD', 1094831),
         caNotes=[{'date': '2018-12-03', 'providerFactor': 1.555, 'sourceEvent': 'SPIN_OFF_DISTRIBUTION_NOT_SPLIT',
                   'detail': 'Provider split factor coincides with the Newmark Group distribution (0.463895 NMRK per BGCP Class A share, distribution date 2018-11-30). No share split. Bars before 2018-12-03 are distribution-adjusted, not split-adjusted.'}]),
    dict(securityId='ref_DCOM', priceSubject=r'our common stock|bridge.s closing|bridge common stock', priceExclude=r'dime common stock|legacy dime', reason='INACTIVE_LISTING_TERMINAL_VALUE_UNVERIFIED', seriesCik=846617, masterCik=1005409,
         tickerChain=[('BDGE', None, '2021-01-29', 'XNAS'), ('DCOM', '2021-02-01', '2026-04-?', 'XNAS'), ('DCOM', '2026-04-?', None, 'XNYS')],
         instrumentClass='COMMON_STOCK', issuer='Dime Commercial Bancshares, Inc. (formerly Dime Community Bancshares, Inc.; formerly Bridge Bancorp, Inc.)',
         docs=[
             ('TICKER_CHANGE_AND_MERGER', 846617, '0001104659-21-009751', 'tm214412d1_8k.htm', [('BDGE_TO_DCOM', r'from .BDGE. to .DCOM.'), ('LEGACY_DIME_RATIO', r'was converted into the right to receive 0\.648 shares')], []),
             ('PRICE_IDENTITY', 846617, '0001104659-20-104883', 'tm2028785-1_s4.htm', [],
              [('2020-06-30', r"Based on Bridge.s closing price of \$([0-9.]+) on June 30, 2020", 'Bridge Bancorp')]),
             ('EXCHANGE_REGISTRATION', 846617, '0001068800-08-000250', 'bridge8a.txt', [('NASDAQ_12B_2008', r'Common stock\s+The NASDAQ Global Select Market')], []),
             ('EXCHANGE_TRANSFER', 846617, '0000943374-26-000131', 'form8a_0326.htm', [('NYSE_REGISTRATION_2026', r'Common Stock, par value \$0\.01 per share The New York Stock Exchange')], []),
             ('EXCHANGE_TRANSFER', 846617, '0000943374-26-000159', 'form25_040626.htm', [('NASDAQ_FORM25_2026', r'(Nasdaq|NASDAQ)')], []),
             ('NAME_CHANGE', 846617, '0000943374-26-000219', 'form8k_052826.htm', [('DIME_COMMERCIAL', r'Dime Commercial Bancshares, Inc\., formerly known as Dime Community Bancshares')], []),
         ],
         transitions=['2020-07-03', '2021-02-01', '2026-04-06'],
         earliestTicker=('BDGE', 846617)),
    dict(securityId='ref_TRAK', priceSubject=r'our common stock|the company.s common stock', priceExclude=r'^$', reason='INACTIVE_LISTING_TERMINAL_VALUE_UNVERIFIED', seriesCik=50471, masterCik=None,
         tickerChain=[('PCYG', None, '2024-06-16', 'XNAS; XNYS from 2023 (8-K 0001437749-23-028469); end is an upper bound'), ('TRAK', '2024-06-17', None, 'XNYS (first TRAK cover in this dossier: 8-K 0001437749-24-020637)')],
         instrumentClass='COMMON_STOCK', issuer='ReposiTrak, Inc. (formerly Park City Group, Inc.)',
         docs=[
             ('EXCHANGE_TRANSFER', 50471, '0001437749-23-028469', 'pcyg20231017_8k.htm', [('NASDAQ_TO_NYSE_2023', r'to the New York Stock Exchange')], []),
             ('COVER_TICKER', 50471, '0001437749-24-020637', 'trak20240617_8k.htm', [], []),
             ('COVER_TICKER', 50471, '0001437749-24-030452', 'trak20241002_8k.htm', [], []),
         ],
         transitions=[],
         earliestTicker=None),
    dict(securityId='ref_EFOR', priceSubject=r'our common stock|on assignment common stock|the stock on', priceExclude=r'apex', reason='LISTING_IDENTITY_MISMATCH', seriesCik=890564, masterCik=None,
         tickerChain=[('ASGN', None, '2012-08-30', 'XNAS'), ('ASGN', '2012-08-31', '2026-04-23', 'XNYS'), ('EFOR', '2026-04-24', None, 'XNYS')],
         instrumentClass='COMMON_STOCK', issuer='Everforth, Inc. (formerly ASGN Incorporated; formerly On Assignment, Inc.)',
         docs=[
             ('TICKER_CHANGE', 890564, '0000890564-26-000025', 'asgn-20260424.htm', [('ASGN_TO_EFOR', r'cease trading under the ticker symbol .ASGN. and begin trading under its new ticker symbol, .EFOR.')], []),
             ('EXCHANGE_TRANSFER', 890564, '0000890564-12-000066', 'form8-k090712.htm', [('NASDAQ_TO_NYSE_2012', r'continue to trade under the stock symbol .ASGN. on NYSE')], []),
             ('PRICE_IDENTITY', 890564, '0001140361-12-020406', 'defm14a.htm', [],
              [('2012-03-20', r'closing price per share of On Assignment common stock of \$([0-9.]+) on March 20, 2012', 'On Assignment')]),
             ('SPLIT_EVIDENCE', 890564, '0000950148-01-500266', 'v70910e10-k.txt', [('SPLIT_2000', r'two-for-one')], []),
         ],
         transitions=['2012-08-31', '2022-05-13', '2026-04-24'],
         earliestTicker=('ASGN', 890564)),
    dict(securityId='ref_SGI', priceSubject=r'our common stock|the company.s common stock|tempur', priceExclude=r'sealy common stock|leggett|mattress firm', reason='LISTING_IDENTITY_MISMATCH', seriesCik=1206264, masterCik=1316625,
         tickerChain=[('TPX', '2003-12-18', '2025-02-14', 'XNYS'), ('SGI', '2025-02-18', None, 'XNYS')],
         instrumentClass='COMMON_STOCK', issuer='Somnigroup International Inc. (formerly Tempur Sealy International, Inc.; formerly Tempur-Pedic International Inc.)',
         docs=[
             ('TICKER_CHANGE', 1206264, '0001206264-25-000037', 'tpx-20250218.htm', [('TPX_TO_SGI', r'under a new ticker symbol .SGI.')], []),
             ('LISTING_REGISTRATION', 1206264, '0001193125-03-090649', 'd8a12b.htm', [('NYSE_8A_2003', r'New York Stock Exchange')], []),
             ('SPLIT_EVIDENCE', 1206264, '0001206264-20-000228', 'tpx-20201029.htm', [('SPLIT_2020', r'four-for-one stock split effected in the form of a stock dividend payable on November 23, 2020')], []),
             ('PRICE_IDENTITY_DERIVED', 1206264, '0001206264-26-000085', 'sgis-4.htm', [('EXCHANGE_RATIO_0_1455', r'right to receive 0\.1455 shares of Somnigroup common stock')],
              [('2026-04-10', r'closing price of Somnigroup common stock on the NYSE on April 10, 2026.{0,120}?approximately \$([0-9.]+) in value for each share', 'Somnigroup x0.1455')]),
             ('PREDECESSOR_TERMINAL', 1316625, '0001193125-16-754864', 'd278677d8k.htm', [('SGI_INTL_CASH', r'right to receive \$7\.75 in cash')], []),
         ],
         transitions=['2016-11-04', '2020-11-27', '2025-02-21'],
         earliestTicker=('TPX', 1206264),
         derivedPrice={'2026-04-10': {'divideBy': 0.1455, 'note': 'Stated per-LEG-share value ($, rounded to cents) divided by the fixed exchange ratio 0.1455; rounding of the stated value gives +-0.005/0.1455 = +-0.034 USD.'}}),
    dict(securityId='ref_SUNE', priceSubject=r'our common stock|csi.s common stock|csi common stock', priceExclude=r'pineapple energy llc', reason='LISTING_IDENTITY_MISMATCH', seriesCik=22701, masterCik=945436,
         tickerChain=[('JCS', None, '2022-03-28', 'XNAS (AMEX 2003-2008 per 8-A/25)'), ('PEGY', '2022-03-29', '2024-11-18', 'XNAS'), ('SUNE', '2024-11-19', None, 'XNAS')],
         instrumentClass='COMMON_STOCK', issuer='SUNation Energy, Inc. (formerly Pineapple Energy Inc.; formerly Communications Systems, Inc.)',
         docs=[
             ('TICKER_CHANGE', 22701, '0000897101-22-000345', 'csi220413_8k.htm', [('JCS_TO_PEGY', r'commence trading on the Nasdaq Capital Market under the ticker symbol .PEGY.'), ('CVR_DISTRIBUTION', r'received one contractual non-transferable contingent value right'), ('REVERSE_1_FOR_4', r'1-for-4 reverse stock split effected on March 18, 2022')], []),
             ('TICKER_CHANGE', 22701, '0000897101-24-000584', 'pegy241204_8k.htm', [('PEGY_TO_SUNE', r'from PEGY to SUNE, effective November 19, 2024')], []),
             ('SPLIT_EVIDENCE', 22701, '0000897101-24-000235', 'pegy240653_8k.htm', [('REVERSE_1_FOR_15', r'fifteen-for-one reverse stock split')], []),
             ('SPLIT_EVIDENCE', 22701, '0000897101-24-000537', 'pegy241094_8k.htm', [('REVERSE_1_FOR_50', r'one-for-fifty reverse stock split')], []),
             ('SPLIT_EVIDENCE', 22701, '0001213900-25-032666', 'ea0238424-8k_sunation.htm', [('REVERSE_1_FOR_200', r'one-for-two hundred reverse stock split')], []),
             ('PRICE_IDENTITY', 22701, '0000897101-21-000932', 'a211292_s-4.htm', [],
              [('2021-03-01', r"closing price of CSI.s common stock on March 1, 2021.{0,80}?was \$([0-9.]+) per share", 'Communications Systems')]),
             ('PREDECESSOR_TERMINAL', 945436, '0001193125-16-559806', 'd185590d8k.htm', [('SUNEDISON_CHAPTER11', r'(Chapter 11|voluntary petition)'), ('SUNEDISON_DELISTING', r'(delist|New York Stock Exchange)')], []),
         ],
         transitions=['2016-04-22', '2022-03-25', '2022-03-29', '2024-11-22'],
         earliestTicker=('JCS', 22701),
         caNotes=[{'date': '2022-03-28', 'providerFactor': None, 'sourceEvent': 'CVR_DISTRIBUTION_AT_REVERSE_MERGER_CLOSING',
                   'detail': 'Holders of record on 2022-03-25 received one non-transferable CVR per share at the closing of the Pineapple reverse merger (8-K 0000897101-22-000345). The split-adjusted price series carries no adjustment for it; the week ending 2022-04-01 falls 43 %. Price returns across this date are not comparable.'}]),
]


def fetch_doc(cik, acc, prim):
    url = S.doc_url(cik, acc, prim)
    body, meta = S.get(url, prefix=True)
    return body, meta


def earliest_ticker_confirmation(ticker, cik, series_from):
    """Earliest venue-checked (US national exchange) full-text 10-K/10-Q statement of the ticker by this CIK."""
    return S.fulltext_ticker_confirmation(cik, ticker, series_from, datetime.date.today().isoformat(), '10-K,10-K405,10-Q', factual=True)


GLOBAL_EXCLUDE = re.compile(r'would have (had )?a value|reference range|implied|represented (an )?(aggregate )?value|exercise price|value of approximately|in value for each', re.I)
COVERS = R.Covers()
SCAN_FORMS = ('DEF 14A', 'DEFM14A', '424B3', '424B4', '424B5', 'S-4', 'S-4/A')


def price_scan(case, doc, filings):
    """Generic scan of proxies/prospectuses of the series issuer for SEC-stated closing / last-sale prices
    of its own common stock (subject regex), compared with the weekly series."""
    subj = re.compile(case['priceSubject'], re.I)
    excl = re.compile(case['priceExclude'], re.I)
    out = []
    for f in filings:
        if f['form'] not in SCAN_FORMS or f['filingDate'] < max('2001-01-01', doc['from']) or not f['primaryDocument']:
            continue
        try:
            body, meta = fetch_doc(case['seriesCik'], f['accessionNumber'], f['primaryDocument'])
        except Exception as e:  # noqa: BLE001
            out.append({'state': 'FETCH_FAILED', 'accession': f['accessionNumber'], 'error': str(e)[:120]})
            continue
        for d, p, q in S.price_statements(body):
            if not subj.search(q) or excl.search(q) or GLOBAL_EXCLUDE.search(q) or d < doc['from'] or d > doc['asOf']:
                continue
            out.append(dict(L.price_check(doc, d, p), issuer='series issuer (scan)', accession=f['accessionNumber'],
                            form=f['form'], filingDate=f['filingDate'], sha256=meta['sha256'], complete=meta['complete'], quote=q))
    return out


def master_rows(security_id):
    m = json.loads(MASTER.read_text())
    keys = ('ticker', 'canonical_id', 'exchange', 'instrument_type', 'active_status', 'start_date', 'end_date', 'eligible_us_equity', 'reconciliation_reason')
    return [{k: r.get(k) for k in keys} for r in m['rows'] if r.get('baseline_security_id') == security_id]


def submissions_summary(cik):
    head, filings, metas = S.submissions(cik)
    forms = {}
    for f in filings:
        if f['form'] in ('25', '25-NSE', '15-12B', '15-12G', '8-K12B', '8-A12B', '8-A12G'):
            forms.setdefault(f['form'], []).append({'filingDate': f['filingDate'], 'accession': f['accessionNumber']})
    return {'cik': head['cik'], 'name': head['name'], 'tickers': head['tickers'], 'exchanges': head['exchanges'],
            'formerNames': head['formerNames'], 'firstFiling': filings[0]['filingDate'] if filings else None,
            'lastFiling': filings[-1]['filingDate'] if filings else None, 'listingForms': forms,
            'sources': [{'url': m['url'], 'sha256': m['sha256']} for m in metas]}, filings


def build_case(case, tickers_rows):
    doc = L.load(case['securityId'])
    out = {'securityId': case['securityId'], 'baseReason': case['reason'], 'ticker': doc['ticker'],
           'series': {'from': doc['from'], 'to': doc['to'], 'asOf': doc['asOf'], 'bars': len(doc['points']),
                      'providerSplits': doc['corporateActions']['splits'], 'providerMoves': doc['corporateActions']['moves'],
                      'sha256': hashlib.sha256((L.SERIES_DIR / (case['securityId'] + '.json')).read_bytes()).hexdigest()},
           'masterRows': master_rows(case['securityId'])}
    cur = [r for r in tickers_rows if r['ticker'] == doc['ticker']]
    out['currentSecTickerMap'] = cur
    out['seriesIssuer'], filings = submissions_summary(case['seriesCik'])
    if case['masterCik']:
        out['masterRowIssuer'], _ = submissions_summary(case['masterCik'])
    else:
        out['masterRowIssuer'] = {'state': 'NOT_ESTABLISHED'}
    fdate = {f['accessionNumber']: f for f in filings}
    for c in {d[1] for d in case['docs']} - {case['seriesCik']}:
        fdate.update({f['accessionNumber']: f for f in S.submissions(c)[1]})
    evidence, prices = [], []
    for role, cik, acc, prim, claims, pclaims in case['docs']:
        body, meta = fetch_doc(cik, acc, prim)
        classes, entity = S.cover_classes(body)
        item = {'role': role, 'cik': '%010d' % cik, 'accession': acc, 'document': prim, 'url': meta['url'],
                'sha256': meta['sha256'], 'bytesRead': meta['bytesRead'], 'complete': meta['complete'],
                'filingDate': fdate.get(acc, {}).get('filingDate'), 'form': fdate.get(acc, {}).get('form'),
                'coverClasses': [{k: v for k, v in c.items() if k != 'ctx'} for c in classes], 'claims': []}
        for label, rx in claims:
            q = S.quote(body, rx)
            item['claims'].append({'claim': label, 'state': 'FOUND' if q else 'NOT_FOUND', 'quote': q})
        text = S._text(body.decode('utf-8', errors='replace'))
        for date, rx, issuer in pclaims:
            m = re.search(rx, text, re.I | re.S)
            if not m:
                prices.append({'date': date, 'issuer': issuer, 'state': 'NOT_FOUND', 'accession': acc})
                continue
            raw = float(m.group(1).rstrip('.'))
            derived = (case.get('derivedPrice') or {}).get(date)
            if derived:
                raw = raw / derived['divideBy']
            chk = L.price_check(doc, date, raw)
            s = max(0, m.start() - 20)
            prices.append(dict(chk, issuer=issuer, accession=acc, sha256=meta['sha256'], derived=derived,
                               quote=text[s:s + 280]))
        evidence.append(item)
    out['evidence'] = evidence
    prices += price_scan(case, doc, filings)
    out['priceChecks'] = prices
    out['levelChecks'] = [L.discontinuity(doc, d) for d in case['transitions']]
    out['tickerChain'] = [{'ticker': t, 'from': a, 'to': b, 'venue': v} for t, a, b, v in case['tickerChain']]
    if case.get('earliestTicker'):
        t, cik = case['earliestTicker']
        out['earliestSourcedTicker'] = earliest_ticker_confirmation(t, cik, doc['from'])
    else:
        out['earliestSourcedTicker'] = {'state': 'NOT_NEEDED_SERIES_STARTS_AFTER_CONFIRMED_TICKER'}
    tl, _ = R.cover_timeline(case['seriesCik'], doc['ticker'], COVERS)
    out['currentTickerCovers'] = tl
    out['caNotes'] = case.get('caNotes', [])
    out['issuer'] = case['issuer']
    out['instrumentClass'] = case['instrumentClass']
    return out, doc


ISO = re.compile(r'^\d{4}-\d{2}-\d{2}$')
MIN_BARS = 55  # weekly-real-adapter INSUFFICIENT_HISTORY threshold


def segments(chain):
    """Ticker segments (consecutive chain entries with the same ticker merged)."""
    segs = []
    for e in chain:
        start = e['from'] if e['from'] and ISO.match(e['from']) else None
        if segs and segs[-1]['ticker'] == e['ticker']:
            segs[-1]['to'] = e['to']
        else:
            segs.append({'ticker': e['ticker'], 'from': start, 'to': e['to']})
    return segs


def decide(case_out, doc):
    """Mechanical decision from stored facts. Re-derived independently by check_identity.py.

    Rules (declared in docs/quant-recovery/v9/identity/README.md; revised once after the first run, see there):
      R1 identity: current SEC ticker map names the series issuer CIK, every listed claim quote is found,
         and no same-day price MISMATCH inside the usable interval.
      R2 start = max(series.from, earliest SEC full-text ticker confirmation, end of sourced CA cuts).
      R3 each ticker segment that touches a ticker transition inside the usable interval needs >= 1 same-day
         price MATCH; the usable interval starts at the earliest segment from which on all segments match.
         A single segment without transition inside the series needs no price check.
      R4 an unexplained weekly level break (|z|>4, not within 7 days after a sourced CA event) moves the start
         behind the break if >= 55 bars remain, else HOLD.
    """
    checks = case_out['priceChecks']
    claims_ok = all(c['state'] == 'FOUND' for e in case_out['evidence'] for c in e['claims'])
    cur = case_out['currentSecTickerMap']
    cik_ok = len(cur) == 1 and '%010d' % cur[0]['cik'] == case_out['seriesIssuer']['cik']
    start, basis = doc['from'], ['SERIES_START']
    est = case_out['earliestSourcedTicker']
    if est.get('state') == 'FOUND' and est['filingDate'] > start:
        start, basis = est['filingDate'], ['EARLIEST_SEC_FULLTEXT_TICKER_CONFIRMATION']
    unresolved = []
    if not cik_ok:
        unresolved.append('CURRENT_SEC_TICKER_NOT_SERIES_ISSUER')
    if not claims_ok:
        unresolved.append('CLAIM_QUOTE_NOT_FOUND')
    if est.get('state') == 'NOT_FOUND':
        unresolved.append('NO_SOURCED_TICKER_CONFIRMATION')
    # R5 current listing: latest iXBRL cover of the series issuer carries the series ticker as a common class,
    # is recent (<= 200 days before asOf) and no Form 25/15 follows it.
    tl = case_out['currentTickerCovers']
    latest = tl.get('latest') or {}
    if tl.get('state') != 'OK' or not latest.get('symbolFound'):
        unresolved.append('CURRENT_TICKER_NOT_ON_LATEST_COVER')
    else:
        if S.class_kind((latest.get('cls') or {}).get('Security12bTitle')) != 'COMMON':
            unresolved.append('LATEST_COVER_CLASS_NOT_COMMON')
        if (datetime.date.fromisoformat(doc['asOf']) - datetime.date.fromisoformat(latest['filingDate'])).days > R.CURRENT_DAYS:
            unresolved.append('LATEST_CONFIRMING_COVER_NOT_CURRENT')
        if [x for x in tl['listingForms'] if x['form'] in ('25', '25-NSE', '15-12B', '15-12G', '15-15D') and x['filingDate'] > latest['filingDate']]:
            unresolved.append('DELISTING_FORM_AFTER_LATEST_COVER')
    ca_dates = [n['date'] for n in case_out['caNotes']]
    for n in case_out['caNotes']:
        if n['date'] > start:
            start, basis = n['date'], ['AFTER_SOURCED_CA_EVENT:' + n['sourceEvent']]
    segs = [g for g in segments(case_out['tickerChain']) if not g['to'] or g['to'] >= start]
    for g in segs:
        lo, hi = max(start, g['from'] or '0000'), g['to'] or '9999'
        g['matches'] = [c['date'] for c in checks if c.get('state') == 'MATCH' and lo <= c['date'] <= hi]
    if len(segs) == 1 and (segs[0]['from'] is None or segs[0]['from'] <= start):
        seg_rule = 'SINGLE_SEGMENT_NO_TRANSITION_IN_SERIES'
    else:
        i = len(segs)
        while i > 0 and segs[i - 1]['matches']:
            i -= 1
        if i == len(segs):
            seg_rule = 'LAST_SEGMENT_WITHOUT_PRICE_MATCH'
            unresolved.append('NO_PRICE_CORROBORATION_IN_CURRENT_TICKER_SEGMENT')
        else:
            seg_rule = 'ALL_SEGMENTS_FROM_%s_MATCHED' % segs[i]['ticker']
            if i > 0 and segs[i]['from'] and segs[i]['from'] > start:
                start, basis = segs[i]['from'], ['FIRST_PRICE_CORROBORATED_SEGMENT']
    def after_ca(d):
        return any(0 <= (datetime.date.fromisoformat(d) - datetime.date.fromisoformat(c)).days <= 7 for c in ca_dates)
    breaks = [lc for lc in case_out['levelChecks'] if lc.get('state') == 'LEVEL_BREAK_SUSPECT' and not after_ca(lc['date'])]
    hold = None
    for br in breaks:
        if br['bar'][0] > start:
            remaining = sum(1 for d, _ in doc['points'] if d >= br['bar'][0])
            if remaining >= MIN_BARS:
                start, basis = br['bar'][0], ['AFTER_UNEXPLAINED_LEVEL_BREAK']
            else:
                hold = 'UNEXPLAINED_LEVEL_BREAK_%s_LEAVES_%d_BARS' % (br['bar'][0], remaining)
    mismatch = [c['date'] for c in checks if c.get('state') == 'MISMATCH_SAME_DAY' and c['date'] >= start]
    if mismatch:
        state = 'SOURCE_PRICE_MISMATCH'
    elif unresolved:
        state = 'UNRESOLVED'
    elif hold:
        state = 'HOLD_UNEXPLAINED_LEVEL_BREAK'
    else:
        state = 'RESOLVED_SINGLE_SECURITY_MASTER_MISBOUND'
    first_bar = next((d for d, _ in doc['points'] if d >= start), None)
    bars = sum(1 for d, _ in doc['points'] if d >= start)
    return {'state': state, 'unresolvedReasons': unresolved, 'hold': hold, 'sameDayMismatches': mismatch,
            'priceCheckCounts': {k: sum(1 for c in checks if c.get('state') == k) for k in sorted({c.get('state') for c in checks})},
            'segments': segs, 'segmentRule': seg_rule, 'unexplainedLevelBreaks': [b['date'] for b in breaks],
            'usableInterval': {'validFrom': first_bar, 'validTo': None, 'basis': basis, 'bars': bars}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    tickers_rows, tmeta = S.tickers_exchange()
    cases = []
    for case in CASES:
        o, doc = build_case(case, tickers_rows)
        o['decision'] = decide(o, doc)
        cases.append(o)
        print(case['securityId'], o['decision']['state'], o['decision']['usableInterval'], o['decision']['priceCheckCounts'], o['decision']['segmentRule'], o['decision']['hold'], o['decision']['unresolvedReasons'], file=sys.stderr)
    report = {'schemaVersion': 'v9-identity-dossiers-1.0.0', 'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
              'codeSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
              'secTickerMap': {'url': tmeta['url'], 'sha256': tmeta['sha256'], 'note': 'CURRENT mapping only, not historical'},
              'conventions': {'prefixBytes': S.PREFIX_BYTES, 'hash': 'sha256 of the fetched body or of its first prefixBytes when complete=false',
                              'splitConvention': 'quant/engines/return-series.js#splitFactors (factor acts from its date)',
                              'acceptanceTime': 'not used; filingDate only (identity, not availability timing)'},
              'productionApproved': False, 'cases': cases}
    pathlib.Path(args.out).write_text(json.dumps(report, indent=1, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
