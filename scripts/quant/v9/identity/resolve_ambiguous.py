#!/usr/bin/env python3
"""V9 identity: classify and SEC-resolve the AMBIGUOUS_LISTING_IDENTITY weekly listings.

Input: per-id reasons produced by reproduce-weekly-reasons.cjs (unchanged createLoader), the security
master and the weekly series. For every ambiguous id:
  1. structural reason of the ambiguity (master rows per baseline id, ticker reuse, duplicate rows,
     non-common master types, ticker suffix conventions);
  2. SEC resolution: CIK via the CURRENT SEC ticker map (exact / normalised / base-ticker), the issuer's
     inline-XBRL cover facts (dei:TradingSymbol, dei:Security12bTitle, dei:SecurityExchangeName) on the
     latest and on the earliest filing that carries the ticker (binary search over iXBRL filings),
     EDGAR full-text confirmation of the ticker before the iXBRL era, Form 25/15 after the confirmation;
  3. a mechanical decision (no heuristic merging): RESOLVED_SINGLE_COMMON_LISTING with a usable interval,
     RESOLVED_NOT_COMMON, HOLD_LEVEL_BREAK or UNRESOLVED(reason).
Raw SEC bodies stay in the private cache; output holds accession, URL, date, SHA-256, short quotes.

usage: resolve_ambiguous.py --reasons <base-reasons.json> --out <ambiguous-resolution.json>
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

ROOT = L.ROOT
MASTER = ROOT / 'quant/data/market/security-master/us-security-master.json'
COVER_FORMS = ('8-K', '10-Q', '10-K', '10-KT', '20-F', '40-F', '8-K12B')
BIG_FORMS = ('10-K', '10-KT', '20-F', '40-F', '10-Q')
MIN_BARS = 55
CURRENT_DAYS = 200  # latest confirming cover must be this recent relative to the series asOf
CURRENT_DAYS_ANNUAL = 400  # 20-F/40-F filers carry cover classes only on the annual report
EXCHANGE_NAMES = {
    'NYSE': re.compile(r'new york stock exchange|^nyse$|^nyse\b(?! (american|arca|mkt))', re.I),
    'NASDAQ': re.compile(r'nasdaq', re.I),
    'NYSE MKT': re.compile(r'nyse american|nyse mkt', re.I),
    'AMEX': re.compile(r'nyse american|nyse mkt|american stock exchange', re.I),
    'NYSE ARCA': re.compile(r'arca', re.I),
    'BATS': re.compile(r'cboe|bats', re.I),
}
MIC = {'NYSE': 'XNYS', 'NASDAQ': 'XNAS', 'NYSE MKT': 'XASE', 'AMEX': 'XASE', 'NYSE ARCA': 'ARCX', 'BATS': 'BATS'}


def iso(d):
    return datetime.date.fromisoformat(d)


def structure(sid, rows, doc):
    t = doc['ticker']
    flags = set()
    starts = [r['start_date'] for r in rows]
    if len(set(starts)) < len(starts):
        flags.add('DUPLICATE_START_DATE_ROWS')
    if any((iso(r['end_date']) - iso(r['start_date'])).days <= 31 for r in rows):
        flags.add('SHORT_LIVED_ROW_<=31D')
    if len({r['exchange'] for r in rows}) > 1:
        flags.add('DIFFERENT_VENUES')
    types = {r['instrument_type'] for r in rows}
    if types - {'EQUITY_COMMON'}:
        flags.add('MASTER_TYPES:' + '+'.join(sorted(types)))
    inactive = [r for r in rows if r['active_status'] != 'ACTIVE']
    active = [r for r in rows if r['active_status'] == 'ACTIVE']
    if inactive and active and any(i['start_date'] < a['start_date'] for i in inactive for a in active):
        flags.add('TICKER_REUSE_EARLIER_INACTIVE_ROW')
    if inactive and active and any(i['start_date'] > a['start_date'] for i in inactive for a in active):
        flags.add('LATER_INACTIVE_ROW_SAME_TICKER')
    if len(active) > 1:
        flags.add('MULTIPLE_ACTIVE_ROWS')
    if '_P_' in t:
        flags.add('SUFFIX_PREFERRED_PROVIDER_P')
    elif re.fullmatch(r'[A-Z]{5}', t) and t[-1] in 'PLMNOZ' and any(r['exchange'] == 'NASDAQ' for r in rows):
        flags.add('SUFFIX_NASDAQ_5TH_LETTER_%s' % t[-1])
    elif re.fullmatch(r'[A-Z]{5}', t) and t[-1] in 'RUW':
        flags.add('SUFFIX_RIGHT_UNIT_WARRANT_%s' % t[-1])
    if '_' in t and '_P_' not in t:
        flags.add('SHARE_CLASS_SUFFIX')
    covering = [r for r in rows if r['start_date'] <= doc['from'] <= r['end_date']]
    return {'masterRows': len(rows), 'flags': sorted(flags),
            'rowsCoveringSeriesStart': [r['canonical_id'] for r in covering]}


class Covers:
    def __init__(self):
        self.memo = {}

    def get(self, cik, f):
        key = (cik, f['accessionNumber'])
        if key not in self.memo:
            size = 6 * 1024 * 1024 if f['form'] in BIG_FORMS else True
            try:
                body, meta = S.get(S.doc_url(cik, f['accessionNumber'], f['primaryDocument']), prefix=size)
                classes, entity = S.cover_classes(body)
            except Exception as e:  # noqa: BLE001
                classes, entity, meta = [], {}, {'error': str(e)[:160]}
            self.memo[key] = (classes, entity, meta)
        return self.memo[key]

    def pred(self, cik, f, sym):
        classes, _, _ = self.get(cik, f)
        syms = [c for c in classes if c.get('TradingSymbol')]
        if not syms:
            return None, None
        hit = [{k: v for k, v in c.items() if k != 'ctx'} for c in syms if S.norm_symbol(c['TradingSymbol']) == S.norm_symbol(sym)]
        if not hit:
            return False, None
        best = dict(hit[0])
        if len(hit) > 1:
            best['allClassesWithSymbol'] = hit
        return True, best


def ref(cik, f, meta):
    return {'cik': '%010d' % int(cik), 'accession': f['accessionNumber'], 'form': f['form'], 'filingDate': f['filingDate'],
            'document': f['primaryDocument'], 'url': meta.get('url'), 'sha256': meta.get('sha256'),
            'bytesRead': meta.get('bytesRead'), 'complete': meta.get('complete')}


def cover_timeline(cik, sym, covers):
    head, filings, metas = S.submissions(cik)
    fx = [f for f in filings if f['form'] in COVER_FORMS and f.get('isInlineXBRL') == 1 and f['primaryDocument']]
    out = {'cik': head['cik'], 'name': head['name'], 'secTickers': head['tickers'], 'secExchanges': head['exchanges'],
           'formerNames': head['formerNames'], 'submissions': [{'url': m['url'], 'sha256': m['sha256']} for m in metas],
           'ixbrlCoverFilings': len(fx)}
    listing = [{'form': f['form'], 'filingDate': f['filingDate'], 'accession': f['accessionNumber']}
               for f in filings if f['form'] in ('25', '25-NSE', '15-12B', '15-12G', '15-15D', '8-A12B', '8-A12G', '8-K12B')]
    out['listingForms'] = listing[-12:]
    if not fx:
        out['state'] = 'NO_IXBRL_COVERS'
        return out, filings
    # latest filing carrying a class list
    last = None
    for i in range(len(fx) - 1, max(-1, len(fx) - 8), -1):
        v, hit = covers.pred(cik, fx[i], sym)
        if v is not None:
            last = (i, v, hit)
            break
    if last is None:
        out['state'] = 'NO_COVER_CLASSES_IN_LATEST_FILINGS'
        return out, filings
    i_last, v_last, hit_last = last
    out['latest'] = dict(ref(cik, fx[i_last], covers.get(cik, fx[i_last])[2]), symbolFound=v_last, cls=hit_last)
    if not v_last:
        out['state'] = 'TICKER_NOT_ON_LATEST_COVER'
        out['latestSymbols'] = [c.get('TradingSymbol') for c in covers.get(cik, fx[i_last])[0]]
        return out, filings
    lo, hi = 0, i_last
    while lo < hi:
        mid = (lo + hi) // 2
        j, v = mid, None
        while j < hi:
            v, _ = covers.pred(cik, fx[j], sym)
            if v is not None:
                break
            j += 1
        if j >= hi or v:
            hi = mid if j >= hi else j
        else:
            lo = j + 1
    while lo < i_last and covers.pred(cik, fx[lo], sym)[0] is None:
        lo += 1  # earliest filings may carry no tagged class list; take the first one that does
    v_first, hit_first = covers.pred(cik, fx[lo], sym)
    out['first'] = dict(ref(cik, fx[lo], covers.get(cik, fx[lo])[2]), symbolFound=v_first, cls=hit_first)
    out['tickerPredatesFirstIxbrl'] = all(covers.pred(cik, fx[k], sym)[0] is None for k in range(lo)) if lo < 40 else False
    if lo > 0:
        k = lo - 1
        while k >= 0 and covers.pred(cik, fx[k], sym)[0] is None:
            k -= 1
        if k >= 0:
            out['before'] = dict(ref(cik, fx[k], covers.get(cik, fx[k])[2]),
                                 symbols=[c.get('TradingSymbol') for c in covers.get(cik, fx[k])[0]])
    mid = (lo + i_last) // 2
    vm, _ = covers.pred(cik, fx[mid], sym)
    out['monotoneSpotCheck'] = {'accession': fx[mid]['accessionNumber'], 'filingDate': fx[mid]['filingDate'], 'symbolFound': vm}
    out['state'] = 'OK' if v_first and vm is not False else 'NON_MONOTONE_OR_MISSING'
    return out, filings


FT_FORMS = '10-K,10-Q,424B4,424B1,424B3,S-1,F-1,F-10,20-F,40-F,6-K,8-K'


def efts_confirmation(cik, sym, series_from, limit_date):
    """Earliest venue-checked full-text ticker statement of this CIK from (series start - 120 days) on."""
    start = (iso(series_from) - datetime.timedelta(days=120)).isoformat()
    return S.fulltext_ticker_confirmation(cik, sym, start, limit_date, FT_FORMS)


def efts_cik_candidates(sym, as_of):
    """Fallback: CIKs of recent filings whose text contains the exact symbol (cover pages list it)."""
    q = sym.replace('_P_', ' PR').replace('_', '.')
    start = (iso(as_of) - datetime.timedelta(days=730)).isoformat()
    url = ('https://efts.sec.gov/LATEST/search-index?q=%%22%s%%22&forms=8-K,10-K,10-Q&dateRange=custom&startdt=%s&enddt=%s'
           % (q.replace(' ', '%20'), start, as_of))
    try:
        body, meta = S.get(url)
        hits = json.loads(body)['hits']['hits']
    except Exception:  # noqa: BLE001
        return [], 'EFTS_FALLBACK_FAILED'
    ciks = {}
    for h in hits:
        for dn in h['_source'].get('display_names', []):
            m = re.search(r'\(CIK (\d{10})\)', dn)
            if m and h['_source'].get('ciks') and m.group(1) in h['_source']['ciks']:
                ciks.setdefault(int(m.group(1)), dn)
    if len(ciks) > 3:
        return [], 'EFTS_FALLBACK_TOO_MANY_CIKS_%d' % len(ciks)
    return [{'cik': c, 'name': n, 'ticker': sym, 'exchange': None} for c, n in ciks.items()], 'EFTS_FULLTEXT_SYMBOL_FALLBACK'


def exchange_ok(master_exchange, sec_name):
    rx = EXCHANGE_NAMES.get(master_exchange)
    return bool(rx and sec_name and rx.search(sec_name))


def resolve_one(sid, rows, tmap, covers):
    doc = L.load(sid)
    sym = doc['ticker']
    res = {'securityId': sid, 'ticker': sym, 'series': {'from': doc['from'], 'to': doc['to'], 'asOf': doc['asOf'], 'bars': len(doc['points'])},
           'masterRowsDetail': [{k: r.get(k) for k in ('canonical_id', 'exchange', 'instrument_type', 'active_status', 'start_date', 'end_date', 'eligible_us_equity')} for r in rows],
           'structure': structure(sid, rows, doc)}
    cands, how = cik_candidates(sym, tmap)
    res['cikLookup'] = {'method': how, 'candidates': [{'cik': '%010d' % c['cik'], 'name': c['name'], 'ticker': c['ticker'], 'exchange': c['exchange']} for c in cands]}
    if not cands:
        cands, how = efts_cik_candidates(sym, doc['asOf'])
        res['cikLookup'] = {'method': how, 'candidates': [{'cik': '%010d' % c['cik'], 'name': c['name']} for c in cands]}
    if not cands:
        return dict(res, state='UNRESOLVED', reasons=['NO_SEC_TICKER_MAP_ENTRY'])
    timelines = []
    for c in {c['cik'] for c in cands}:
        tl, filings = cover_timeline(c, sym, covers)
        timelines.append((tl, filings, c))
    good = [t for t in timelines if t[0].get('state') == 'OK']
    res['coverTimelines'] = [t[0] for t in timelines]
    if len(good) != 1:
        reasons = ['COVER_TIMELINE_' + (timelines[0][0].get('state') if len(good) == 0 else 'MULTIPLE_CIKS')]
        return dict(res, state='UNRESOLVED', reasons=reasons)
    tl, filings, cik = good[0]
    cls = tl['latest']['cls']
    title, sec_exch = cls.get('Security12bTitle'), cls.get('SecurityExchangeName')
    kinds = sorted({S.class_kind(c.get('Security12bTitle')) for c in cls.get('allClassesWithSymbol', [cls])})
    if len(kinds) == 1:
        kind = kinds[0]
    elif 'ADS' in kinds:
        kind = 'ADS'  # symbol shared by ADS and underlying ordinary shares: the traded instrument is the ADS
    else:
        kind = 'UNKNOWN'
    first_title = (tl['first'].get('cls') or {}).get('Security12bTitle')
    res['secClass'] = {'latestTitle': title, 'latestExchange': sec_exch, 'kind': kind,
                       'firstTitle': first_title, 'firstKind': S.class_kind(first_title)}
    if kind != 'COMMON':
        state = 'RESOLVED_NOT_COMMON' if kind != 'UNKNOWN' else 'UNRESOLVED'
        return dict(res, state=state, reasons=[] if kind != 'UNKNOWN' else ['SEC_CLASS_TITLE_UNCLASSIFIED'], instrumentClass=kind)
    if first_title and S.class_kind(first_title) != 'COMMON':
        return dict(res, state='UNRESOLVED', reasons=['CLASS_CHANGED_WITHIN_COVER_INTERVAL'])
    reasons = []
    annual_only = tl['latest']['form'] in ('20-F', '40-F')
    if (iso(doc['asOf']) - iso(tl['latest']['filingDate'])).days > (CURRENT_DAYS_ANNUAL if annual_only else CURRENT_DAYS):
        reasons.append('LATEST_CONFIRMING_COVER_NOT_CURRENT')
    delist_after = [x for x in tl['listingForms'] if x['form'] in ('25', '25-NSE', '15-12B', '15-12G', '15-15D') and x['filingDate'] > tl['latest']['filingDate']]
    if delist_after:
        reasons.append('DELISTING_FORM_AFTER_LATEST_COVER')
    active = [r for r in rows if r['active_status'] == 'ACTIVE' and r['instrument_type'] == 'EQUITY_COMMON' and r.get('eligible_us_equity') is True]
    if len(active) != 1:
        reasons.append('MASTER_ACTIVE_COMMON_ROWS_%d' % len(active))
    elif not exchange_ok(active[0]['exchange'], sec_exch):
        reasons.append('EXCHANGE_CONFLICT_MASTER_%s_SEC_%s' % (active[0]['exchange'], sec_exch))
    if reasons:
        return dict(res, state='UNRESOLVED', reasons=reasons)
    row = active[0]
    # usable interval
    first_cover = tl['first']['filingDate']
    if doc['from'] >= first_cover:
        start, basis, conf = doc['from'], 'SERIES_STARTS_INSIDE_COVER_CONFIRMED_INTERVAL', None
    else:
        conf = efts_confirmation(cik, sym, doc['from'], first_cover)
        if conf.get('state') == 'FOUND' and conf['filingDate'] <= (iso(doc['from']) + datetime.timedelta(days=7)).isoformat():
            start, basis = doc['from'], 'FULLTEXT_TICKER_CONFIRMATION_AT_SERIES_START'
        elif conf.get('state') == 'FOUND' and conf['filingDate'] < first_cover:
            start, basis = conf['filingDate'], 'EARLIEST_FULLTEXT_TICKER_CONFIRMATION'
        else:
            start, basis = first_cover, 'FIRST_IXBRL_COVER_WITH_TICKER'
    if row['start_date'] > start:
        start, basis = row['start_date'], basis + '+MASTER_ROW_START'
    res['tickerConfirmation'] = conf
    # level checks at other rows' boundaries inside the usable interval
    lchecks, hold = [], None
    for r in rows:
        if r is row:
            continue
        for d in (r['start_date'], r['end_date']):
            if start < d <= doc['to']:
                lc = L.discontinuity(doc, d)
                lc['otherRow'] = r['canonical_id']
                lchecks.append(lc)
    for lc in sorted(lchecks, key=lambda x: x['date']):
        if lc.get('state') == 'LEVEL_BREAK_SUSPECT' and lc['bar'][0] > start:
            remaining = sum(1 for d, _ in doc['points'] if d >= lc['bar'][0])
            if remaining >= MIN_BARS:
                start, basis = lc['bar'][0], 'AFTER_LEVEL_BREAK_AT_OTHER_ROW_BOUNDARY'
            else:
                hold = 'LEVEL_BREAK_%s_LEAVES_%d_BARS' % (lc['bar'][0], remaining)
    res['levelChecks'] = lchecks
    first_bar = next((d for d, _ in doc['points'] if d >= start), None)
    bars = sum(1 for d, _ in doc['points'] if d >= start)
    excluded = sum(1 for d, _ in doc['points'] if d < start)
    overlapping_other = [r['canonical_id'] for r in rows if r is not row and r['start_date'] < (first_bar or doc['to']) and r['end_date'] >= doc['from']]
    res['binding'] = {'canonicalId': row['canonical_id'], 'cik': tl['cik'], 'issuer': tl['name'], 'instrumentClass': 'COMMON',
                      'secTitle': title, 'secExchange': sec_exch, 'mic': MIC.get(row['exchange']), 'masterExchange': row['exchange']}
    res['usableInterval'] = {'validFrom': first_bar, 'validTo': None, 'basis': basis, 'bars': bars, 'excludedLeadingBars': excluded,
                             'excludedPartOverlapsOtherMasterRows': overlapping_other if excluded else []}
    if hold:
        return dict(res, state='HOLD_LEVEL_BREAK', reasons=[hold])
    sub = 'CONCATENATION_RISK_TRUNCATED' if excluded and overlapping_other else ('TRUNCATED_UNSOURCED_HISTORY' if excluded else 'FULL_SERIES')
    return dict(res, state='RESOLVED_SINGLE_COMMON_LISTING', subState=sub, reasons=[])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--reasons', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', nargs='*')
    args = ap.parse_args()
    reasons = json.loads(pathlib.Path(args.reasons).read_text())
    ids = [r['securityId'] for r in reasons['rows'] if r['reason'] == 'AMBIGUOUS_LISTING_IDENTITY']
    if args.only:
        ids = [i for i in ids if i in args.only]
    master = json.loads(MASTER.read_text())
    by = {}
    for r in master['rows']:
        if r.get('baseline_security_id'):
            by.setdefault(r['baseline_security_id'], []).append(r)
    tmap, tmeta = S.tickers_exchange()
    covers = Covers()
    out = []
    for n, sid in enumerate(ids):
        try:
            r = resolve_one(sid, sorted(by[sid], key=lambda x: x['start_date']), tmap, covers)
        except Exception as e:  # noqa: BLE001
            r = {'securityId': sid, 'state': 'UNRESOLVED', 'reasons': ['PIPELINE_ERROR:' + str(e)[:200]]}
        out.append(r)
        print(n, sid, r['state'], r.get('subState', ''), r.get('reasons'), (r.get('usableInterval') or {}).get('validFrom'), file=sys.stderr)
    counts = {}
    for r in out:
        counts[r['state']] = counts.get(r['state'], 0) + 1
    report = {'schemaVersion': 'v9-identity-ambiguous-resolution-1.0.0',
              'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
              'codeSha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (pathlib.Path(__file__), HERE / 'sec_lib.py', HERE / 'series_lib.py')},
              'inputs': {'reasonsMasterHash': reasons.get('masterHash'), 'masterSha256': hashlib.sha256(MASTER.read_bytes()).hexdigest(),
                         'secTickerMap': {'url': tmeta['url'], 'sha256': tmeta['sha256'], 'note': 'CURRENT mapping only'}},
              'rules': {'minBars': MIN_BARS, 'currentDays': CURRENT_DAYS, 'levelBreak': '|z|>4 vs trailing 52 weekly log returns',
                        'prefixBytes': {'8-K': S.PREFIX_BYTES, 'annual/quarterly': 6 * 1024 * 1024}},
              'counts': counts, 'productionApproved': False, 'rows': out}
    pathlib.Path(args.out).write_text(json.dumps(report, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps(counts), file=sys.stderr)


if __name__ == '__main__':
    main()
