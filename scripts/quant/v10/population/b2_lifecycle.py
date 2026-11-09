"""V10 POPULATION B2: categorise every series with a frozen (identically carried-forward) end under protocol-1.0.0
B2_listingLifecycle and extract source-bound last trading days and terminal consideration from SEC filings.
Writes only --out. Repeated closes are never treated as trades.

    python3 scripts/quant/v10/population/b2_lifecycle.py --reasons <default-reasons.json> --out docs/quant-recovery/v10/population/lifecycle-cases.json
"""
import argparse
import datetime as dt
import json
import re
import sys
import urllib.parse

import v10lib as L
from v10lib import sec_lib

WEEKLY_MIN_RUN, DAILY_MIN_RUN = 4, 5
DELIST = {'25', '25-NSE', '15-12B', '15-12G', '15-15D'}
PERIODIC = {'10-K', '10-Q', '20-F', '40-F', '6-K', '8-K', '10-K/A', '10-Q/A'}
# Nasdaq fifth-letter convention for 5-letter symbols: M/N/O/P preferred classes, R rights, U units, W warrants
# (protocol B2 NOT_OPERATING_COMMON; the master marks several of them EQUITY_COMMON).
NOT_COMMON_RX = re.compile(r'(?:_P_|_WS?$|_U$|_R$|^[A-Z]{4}[MNOPRUW]$)')
TODAY = '2026-10-28'

DATE = r'(?P<date>(?:%s)\.? \d{1,2},? \d{4})' % L.MONTHS
LT_RULES = [
    ('PRIOR_TO_OPEN', re.compile(r'(?:suspend|halt|ceas|delist|remov|cease)[^.]{0,260}?(?:prior to|before) (?:the )?(?:opening|open|commencement) of (?:trading|the market|market|business|the trading day)(?: on)? ' + DATE, re.I), 'PREV'),
    ('PRIOR_TO_MARKET_OPEN', re.compile(r'(?:suspend|halt|ceas|delist|cease)[^.]{0,260}?(?:prior to|before) (?:the )?market open(?:ing)?(?: on)? ' + DATE, re.I), 'PREV'),
    ('EFFECTIVE_BEFORE_OPEN', re.compile(r'(?:suspend|halt)[^.]{0,120}?effective (?:as of |prior to |before )?(?:the )?(?:opening|open) of (?:trading|business)(?: on)? ' + DATE, re.I), 'PREV'),
    ('LAST_DAY_OF_TRADING', re.compile(r'last (?:day|date) of trading[^.]{0,100}?(?:was|will be|is|on) ' + DATE, re.I), 'SAME'),
    ('CLOSE_OF_TRADING', re.compile(r'(?:ceas|suspend|halt|cease)[^.]{0,160}?(?:at|after|following) the close of (?:trading|the market|business|regular trading)(?: on)? ' + DATE, re.I), 'SAME'),
]
CASH_RX = re.compile(r'(?:converted into|exchanged for|cancell?ed and converted into|automatically converted into)[^.]{0,80}?right to receive[^.$]{0,60}?\$\s?(?P<cash>\d{1,5}(?:,\d{3})*(?:\.\d{1,6})?)(?!\s*(?:million|billion))(?P<tail>[^.]{0,160})', re.I)
STOCK_RX = re.compile(r'right to receive[^.]{0,80}?(?P<ratio>\d{1,3}\.\d{2,6})\s+(?:of\s+a\s+)?(?:validly issued[^.]{0,60}?)?(?:fully paid[^.]{0,40}?)?(?:share|shares)\s+of\s+(?P<what>[^.]{0,120}?)(?:common stock|common shares|ordinary shares|Class [A-C] common)', re.I)
MIXED_TAIL_RX = re.compile(r'[^;]{0,120}?(?:\band\b|\bplus\b)\s*(?:\(ii\)\s*(?:(?P<ratio>\d{1,3}\.\d{1,6})\s+)?|(?P<ratio2>\d{1,3}\.\d{1,6})\s+)(?:of\s+a\s+)?(?:validly issued\s+|fully paid\s+)*(?:share|shares)\b', re.I)
ELECTION_RX = re.compile(r'election|prorat|contingent value right|\bCVR\b', re.I)
COMMON_CTX_RX = re.compile(r'(?:each|every)[^.]{0,40}?(?:share|outstanding share)[^.]{0,200}?common', re.I)
TICKER_PAREN_RX = re.compile(r'\((?:NYSE|NASDAQ|Nasdaq|NYSE American|NYSEAMERICAN)\s*:\s*(?P<t>[A-Z]{1,5}(?:\.[A-Z])?)\)')


def efts_json(url):
    body, meta = L.get(url)
    return json.loads(body), meta


DISPLAY = re.compile(r'^(.*?)\s+\(([^()]*)\)\s+\(CIK (\d{10})\)$')


def fts_cik(ticker, since):
    start = L.add_days(since, -3 * 365)
    end = L.add_days(since, 30)
    url = ('https://efts.sec.gov/LATEST/search-index?q=%s&forms=8-K,10-Q,10-K,20-F,6-K&dateRange=custom&startdt=%s&enddt=%s'
           % (urllib.parse.quote('"%s"' % ticker), start, end))
    try:
        res, meta = efts_json(url)
    except Exception as e:  # noqa: BLE001
        return None, {'method': 'EFTS', 'url': url, 'error': str(e)[:100]}
    count, names = {}, {}
    for h in res.get('hits', {}).get('hits', []):
        for dn in h['_source'].get('display_names', []):
            m = DISPLAY.match(dn.strip())
            if m and ticker in [t.strip() for t in m.group(2).split(',')]:
                count[m.group(3)] = count.get(m.group(3), 0) + 1
                names[m.group(3)] = m.group(1)
    total = sum(count.values())
    info = {'method': 'EFTS_DISPLAY_NAMES', 'url': url, 'sha256': meta['sha256'], 'tickerHits': count}
    if not total:
        return None, info
    best = max(count, key=lambda c: count[c])
    if count[best] >= 2 and count[best] >= 0.8 * total:
        return best, info
    return None, info


def resolve_cik(ticker, since, cikmap):
    tried = []
    sym = ticker.replace('_', '.')
    e = cikmap.get(sym) or cikmap.get(ticker.replace('_', '-'))
    if e:
        try:
            head, filings, metas = sec_lib.submissions(e['cik'])
            before = [f for f in filings if f['form'] in PERIODIC and L.add_days(since, -730) <= f['filingDate'] <= L.add_days(since, 14)]
            tried.append({'method': 'CIK_MAP_2026_09_13', 'cik': e['cik'], 'filedBeforeFreeze': len(before)})
            if before:
                return e['cik'], tried, (head, filings, metas)
        except Exception as ex:  # noqa: BLE001
            tried.append({'method': 'CIK_MAP_2026_09_13', 'cik': e['cik'], 'error': str(ex)[:100]})
    cik, info = fts_cik(sym, since)
    tried.append(info)
    if cik:
        head, filings, metas = sec_lib.submissions(cik)
        return cik, tried, (head, filings, metas)
    return None, tried, None


def doc_text(cik, f, prefix=3 * 1024 * 1024):
    url = sec_lib.doc_url(cik, f['accessionNumber'], f['primaryDocument'])
    body, meta = L.get(url, prefix=prefix)
    return L.text_of(body), meta


TERM = r'(?P<term>Closing Date|Effective Date|Merger Effective Date|Merger Closing Date|Closing|Effective Time)'
LT_DEFINED = re.compile(r'(?:suspend|halt|ceas)[^.]{0,200}?(?:prior to|before) (?:the )?(?:opening|open|commencement) of (?:trading|the market|business)(?: on)? the ' + TERM, re.I)


def defined_date(text, term):
    """Calendar date a document assigns to a defined term: '<date> (the "Closing Date")' or '("Closing Date") on <date>' or 'Effective Time") on <date>'."""
    q = r'["“”]'
    for rx in (re.compile(DATE + r'[^.;()]{0,60}?\(\s*(?:the\s+)?' + q + re.escape(term) + q, re.I),
               re.compile(re.escape(term) + q + r'\s*\)?\s*,?\s*(?:on|which occurred on)\s+' + DATE, re.I)):
        m = rx.search(text)
        if m:
            d = L.parse_date(m.group('date'))
            if d:
                s = max(0, m.start() - 20)
                return d, text[s:m.end() + 10][:300]
    return None, None


def last_trade(text):
    for name, rx, mode in LT_RULES:
        m = rx.search(text)
        if m:
            d = L.parse_date(m.group('date'))
            if not d:
                continue
            ltd = L.prev_trading_day(d) if mode == 'PREV' else d
            s = max(0, m.start() - 40)
            return {'rule': name, 'statedDate': d, 'lastTradeDate': ltd, 'quote': text[s:m.end() + 10][-300:]}
    m = LT_DEFINED.search(text)
    if m:
        d, dq = defined_date(text, m.group('term'))
        if d:
            s = max(0, m.start() - 40)
            return {'rule': 'PRIOR_TO_OPEN_ON_DEFINED_DATE', 'statedDate': d, 'lastTradeDate': L.prev_trading_day(d),
                    'quote': text[s:m.end() + 10][-300:], 'definitionQuote': dq}
    return None


def consideration(text):
    cash = stock = None
    for m in CASH_RX.finditer(text):
        ctx = text[max(0, m.start() - 320):m.start()]
        if COMMON_CTX_RX.search(ctx) and not re.search(r'option|restricted stock unit|RSU|preferred|warrant|performance', ctx[-160:], re.I):
            cash = {'amount': float(m.group('cash').replace(',', '')), 'quote': text[max(0, m.start() - 120):m.end()][-300:]}
            # V10 review: a cash amount followed by a share component ("$2.00 in cash ... and (ii) 0.60 shares") is mixed
            # consideration; the sentence-bounded tail stops at the decimal point of the ratio, so read past it.
            after = text[m.end('cash'):m.end('cash') + 260]
            mix = MIXED_TAIL_RX.match(after)
            if mix:
                cash['mixedTail'] = after[:mix.end()]
                if stock is None and (mix.group('ratio') or mix.group('ratio2')):
                    stock = {'ratio': float(mix.group('ratio') or mix.group('ratio2')), 'quote': text[max(0, m.start() - 120):m.end('cash') + mix.end()][-300:]}
                cash['mixedUnparsed'] = stock is None
            break
    for m in STOCK_RX.finditer(text) if stock is None else ():
        ctx = text[max(0, m.start() - 320):m.start()]
        if COMMON_CTX_RX.search(ctx) and not re.search(r'option|restricted stock unit|RSU|preferred|warrant', ctx[-160:], re.I):
            stock = {'ratio': float(m.group('ratio')), 'quote': text[max(0, m.start() - 120):m.end()][-300:]}
            break
    acq = None
    tm = TICKER_PAREN_RX.findall(text[:20000])
    election = bool(ELECTION_RX.search((cash or {}).get('quote', '') + (stock or {}).get('quote', '')))
    return cash, stock, tm, election


def consideration_quote(c):
    # Mixed consideration parsed from the cash tail: the stock quote spans cash and share component.
    if c[0] and c[1] and c[0].get('mixedTail'):
        return c[1]['quote']
    return (c[0] or c[1])['quote']


def series_gate(points, ltd, frozen_close, daily=False):
    after = [p for p in points if p[0] > ltd]
    if any(p[1] != frozen_close for p in after):
        return 'MOVES_AFTER_LAST_TRADE'
    if daily:
        bar = next((p for p in points if p[0] == ltd), None)
        if points and points[0][0] <= ltd and (not bar or bar[1] != frozen_close):
            return 'DAILY_BAR_AT_LAST_TRADE_DIFFERS'
    return 'OK'


def research(sid, ticker, weekly, daily, wrun, drun, cikmap, master_rows_):
    frozen = wrun if wrun and wrun['run'] >= WEEKLY_MIN_RUN else drun
    since = frozen['since']
    out = {'securityId': sid, 'ticker': ticker, 'weeklyTail': wrun, 'dailyTail': drun, 'sources': [], 'notes': []}
    types = sorted({r['instrument_type'] for r in master_rows_})
    out['masterTypes'] = types
    out['masterStatus'] = sorted({r['active_status'] for r in master_rows_})
    if (types and 'EQUITY_COMMON' not in types) or NOT_COMMON_RX.search(ticker):
        out['category'] = 'NOT_OPERATING_COMMON'; return out
    cik, tried, sub = resolve_cik(ticker, since, cikmap)
    out['cikResolution'] = tried
    if not cik:
        out['category'] = 'UNRESOLVED'; out['notes'].append('NO_CIK'); return out
    head, filings, metas = sub
    out.update({'cik': cik, 'issuer': head.get('name'), 'secTickersNow': head.get('tickers'), 'secExchangesNow': head.get('exchanges'),
                'submissions': [{'url': m['url'], 'sha256': m['sha256']} for m in metas]})
    lo = L.add_days(since, -120)
    window = [f for f in filings if f['filingDate'] >= lo]
    delist = [f for f in window if f['form'] in DELIST]
    k8 = [f for f in window if f['form'] in ('8-K', '8-K/A') and any(i in (f.get('items') or '') for i in ('2.01', '3.01'))]
    recent = [f for f in filings if f['form'] in PERIODIC and f['filingDate'] >= L.add_days(TODAY, -120)]
    out['forms'] = {'delisting': [{'form': f['form'], 'filingDate': f['filingDate'], 'accession': f['accessionNumber']} for f in delist],
                    'k8_201_301': [{'filingDate': f['filingDate'], 'items': f.get('items'), 'accession': f['accessionNumber']} for f in k8],
                    'periodicLast120d': len(recent)}
    # ticker reuse: SEC now maps the ticker to this CIK but the CIK is a different filer from the frozen issuer is caught by
    # resolve_cik (filedBeforeFreeze); here: current SEC map gives the ticker to ANOTHER cik than the resolved one.
    now = cikmap.get(ticker.replace('_', '.'))
    if now and now['cik'] != cik:
        out['tickerNowHeldBy'] = {'cik': now['cik'], 'name': now['name']}
    lt, cons, terminal_docs = None, None, []
    for f in sorted(k8, key=lambda f: f['filingDate']):
        if not f.get('primaryDocument'):
            continue
        try:
            text, meta = doc_text(cik, f)
        except Exception as e:  # noqa: BLE001
            out['notes'].append('FETCH_FAILED ' + f['accessionNumber']); continue
        src = {'role': '8-K ' + (f.get('items') or ''), 'accession': f['accessionNumber'], 'filingDate': f['filingDate'], 'url': meta['url'],
               'sha256': meta['sha256'], 'sha256Normalized': meta['sha256Normalized'], 'bytesRead': meta['bytesRead'], 'complete': meta['complete']}
        x = last_trade(text)
        c = consideration(text) if '2.01' in (f.get('items') or '') else (None, None, [], False)
        if x and not lt:
            lt = {**x, 'accession': f['accessionNumber']}
            src['lastTradeQuote'] = x['quote']
            if x.get('definitionQuote'):
                src['definitionQuote'] = x['definitionQuote']
        if (c[0] or c[1]) and not cons:
            cons = {'cash': c[0], 'stock': c[1], 'tickersInDoc': c[2], 'election': c[3], 'accession': f['accessionNumber'], 'effectiveFiling': f['filingDate']}
            src['considerationQuote'] = consideration_quote(c)
        if 'lastTradeQuote' in src or 'considerationQuote' in src:
            out['sources'].append(src)
    if not cons and k8 and any('2.01' in (f.get('items') or '') for f in k8):
        dm = [f for f in filings if f['form'] in ('DEFM14A', 'S-4', '424B3', 'PREM14A', 'SC TO-T', 'SC 14D9') and L.add_days(since, -540) <= f['filingDate'] <= L.add_days(since, 30)]
        for f in sorted(dm, key=lambda f: f['filingDate'], reverse=True)[:2]:
            if not f.get('primaryDocument'):
                continue
            try:
                text, meta = doc_text(cik, f, prefix=2 * 1024 * 1024)
            except Exception:  # noqa: BLE001
                continue
            c = consideration(text)
            if c[0] or c[1]:
                cons = {'cash': c[0], 'stock': c[1], 'tickersInDoc': c[2], 'election': c[3], 'accession': f['accessionNumber'], 'effectiveFiling': None}
                out['sources'].append({'role': f['form'], 'accession': f['accessionNumber'], 'filingDate': f['filingDate'], 'url': meta['url'], 'sha256': meta['sha256'],
                                       'sha256Normalized': meta['sha256Normalized'], 'bytesRead': meta['bytesRead'], 'complete': meta['complete'],
                                       'considerationQuote': consideration_quote(c)})
                break
    for f in delist[:2]:
        out['sources'].append({'role': 'FORM_' + f['form'], 'accession': f['accessionNumber'], 'filingDate': f['filingDate'],
                               'url': sec_lib.doc_url(cik, f['accessionNumber'], f.get('primaryDocument') or ''), 'index': True})
    # categorise
    if lt:
        out['lastTrade'] = lt
        frozen_close = (wrun or drun)['close']
        g = series_gate(weekly['points'], lt['lastTradeDate'], wrun['close']) if weekly else 'NO_WEEKLY_SERIES'
        gd = series_gate(daily['points'], lt['lastTradeDate'], drun['close'], True) if daily and drun else 'NO_DAILY'
        out['gate'] = {'weekly': g, 'daily': gd}
    has_merger = bool(cons) or any('2.01' in (f.get('items') or '') for f in k8)
    if out.get('tickerNowHeldBy') and not delist and not k8:
        out['category'] = 'TICKER_REUSE'
    elif has_merger:
        out['category'] = 'MERGER_TERMINAL_CONSIDERATION'
    elif any(f['form'] in ('25', '25-NSE') for f in delist) or any('3.01' in (f.get('items') or '') for f in k8):
        out['category'] = 'DELISTED_FORM25'
    elif any(f['form'].startswith('15') for f in delist):
        out['category'] = 'DEREGISTERED_FORM15'
    elif recent and ticker.replace('_', '.') in (head.get('tickers') or []):
        out['category'] = 'STILL_LISTED_PROVIDER_STALE'
    else:
        out['category'] = 'UNRESOLVED'
    # terminal
    if out['category'] in ('MERGER_TERMINAL_CONSIDERATION', 'DELISTED_FORM25', 'DEREGISTERED_FORM15'):
        kind, cash, ratio, acq = 'UNKNOWN', None, None, None
        if cons and not cons['election'] and not (cons['cash'] or {}).get('mixedUnparsed'):
            cash = cons['cash']['amount'] if cons['cash'] else None
            ratio = cons['stock']['ratio'] if cons['stock'] else None
            kind = 'CASH_AND_STOCK' if cash is not None and ratio is not None else ('CASH_MERGER' if cash is not None else 'STOCK_MERGER')
            if ratio is not None:
                own = set(head.get('tickers') or []) | {ticker}
                cand = [t for t in cons['tickersInDoc'] if t not in own]
                acq = cand[0] if len(set(cand)) == 1 else None
        elif not has_merger:
            kind = 'DELISTED_NO_CONSIDERATION'
        out['terminal'] = {'kind': kind, 'cashPerShare': cash, 'stockRatio': ratio, 'acquirerTicker': acq, 'paymentDate': None,
                           'paymentDateNote': 'PAYMENT_DATE_NOT_STATED'}
    # master conflict flag
    if out['category'] in ('MERGER_TERMINAL_CONSIDERATION', 'DELISTED_FORM25', 'DEREGISTERED_FORM15') and 'ACTIVE' in out['masterStatus']:
        out['masterConflict'] = 'MASTER_ACTIVE_DESPITE_DELISTING_EVIDENCE'
    # resolution status for the loader register
    ok = (lt and out['gate']['weekly'] == 'OK' and out['gate']['daily'] in ('OK', 'NO_DAILY')
          and out['category'] in ('MERGER_TERMINAL_CONSIDERATION', 'DELISTED_FORM25', 'DEREGISTERED_FORM15'))
    if lt and not ok and out['category'] in ('MERGER_TERMINAL_CONSIDERATION', 'DELISTED_FORM25', 'DEREGISTERED_FORM15'):
        out['notes'].append('LIFECYCLE_SOURCE_CONFLICT')
    out['resolved'] = bool(ok)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--reasons', required=True, help='default-path reasons json (scripts/quant/v10/population/reasons.cjs)')
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    reasons = {r['securityId']: r['reason'] for r in json.loads(open(a.reasons).read())['configs']['default']['rows']}
    cikmap = json.loads((L.ROOT / 'quant/data/universe/cik-map.json').read_text())['byTicker']
    master, by = L.master_rows()
    ids = sorted(p.stem for p in L.WEEKLY_DIR.glob('ref_*.json'))
    dids = sorted(p.stem for p in L.DAILY_DIR.glob('ref_*.json'))
    allids = sorted(set(ids) | set(dids))
    hist_w, hist_d = {}, {}
    cases = []
    for sid in allids:
        w = L.load_weekly(sid) if sid in ids else None
        d = L.load_daily(sid) if sid in dids else None
        wr = L.tail_run(w['points']) if w else None
        dr = L.tail_run(d['points']) if d else None
        if wr:
            k = wr['run'] if wr['run'] < 30 else '30+'; hist_w[k] = hist_w.get(k, 0) + 1
        if dr:
            k = dr['run'] if dr['run'] < 30 else '30+'; hist_d[k] = hist_d.get(k, 0) + 1
        if (wr and wr['run'] >= WEEKLY_MIN_RUN) or (dr and dr['run'] >= DAILY_MIN_RUN):
            cases.append((sid, w, d, wr, dr))
    if a.only:
        cases = [c for c in cases if c[0] in a.only.split(',')]
    res = []
    for i, (sid, w, d, wr, dr) in enumerate(cases):
        ticker = (w or d)['ticker']
        try:
            o = research(sid, ticker, w, d, wr, dr, cikmap, by.get(sid, []))
        except Exception as e:  # noqa: BLE001
            o = {'securityId': sid, 'ticker': ticker, 'weeklyTail': wr, 'dailyTail': dr, 'category': 'UNRESOLVED', 'notes': ['ERROR ' + str(e)[:120]]}
        o['hasWeeklySeries'] = bool(w)
        o['weeklyFrozen'] = bool(wr and wr['run'] >= WEEKLY_MIN_RUN)
        o['dailyFrozen'] = bool(dr and dr['run'] >= DAILY_MIN_RUN)
        o['defaultReason'] = reasons.get(sid)
        if w and o.get('resolved'):
            ltd = o['lastTrade']['lastTradeDate']
            kept = [p for p in w['points'] if p[0] <= ltd]
            o['historyGuard'] = {'checkedFrom': w['points'][0][0], 'checkedTo': ltd, 'bars': len(kept), 'pointsSha256': L.js_hash(kept)}
            o['frozenTailBarsRemoved'] = len(w['points']) - len(kept)
            o['sourceSha256'] = L.sha256_file(L.WEEKLY_DIR / (sid + '.json'))
        res.append(o)
        print(i + 1, len(cases), sid, o['category'], o.get('resolved'), file=sys.stderr, flush=True)
    counts = {}
    for o in res:
        key = o['category']
        counts[key] = counts.get(key, 0) + 1
    doc = {'schemaVersion': 'v10-population-lifecycle-cases-1.0.0', 'protocolSha256': L.sha256_file(L.ROOT / 'docs/quant-recovery/v10/population/protocol-1.0.0.json'),
           'generatedAt': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
           'codeSha256': {n: L.sha256_file(L.ROOT / 'scripts/quant/v10/population' / n) for n in ('b2_lifecycle.py', 'v10lib.py')},
           'thresholds': {'weeklyMinRun': WEEKLY_MIN_RUN, 'dailyMinRun': DAILY_MIN_RUN},
           'tailRunHistogram': {'weekly': hist_w, 'daily': hist_d},
           'counts': {'cases': len(res), 'weeklyFrozen': sum(o['weeklyFrozen'] for o in res), 'dailyFrozen': sum(o['dailyFrozen'] for o in res),
                      'byCategory': counts, 'resolvedForLoader': sum(bool(o.get('resolved')) for o in res)},
           'secRequests': sec_lib.CLIENT.stats['requests'] + sec_lib.PREFIX_CLIENT.stats['requests'], 'productionApproved': False, 'cases': res}
    L.write_json(a.out, doc)
    print(json.dumps(doc['counts'], indent=1))


if __name__ == '__main__':
    main()
