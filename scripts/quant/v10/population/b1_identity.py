"""V10 POPULATION B1: check the 132 V9 RESOLVED_SINGLE_COMMON_LISTING bindings against SEC originals
under protocol-1.0.0 (Q-CIK, Q-CLS, Q-VEN, Q-CUR, Q-PX, Q-INT). Writes only --out (compact evidence).

    python3 scripts/quant/v10/population/b1_identity.py --out docs/quant-recovery/v10/population/identity-cases.json
"""
import argparse
import datetime as dt
import json
import sys

import v10lib as L
from v10lib import sec_lib

ANNUAL = {'10-K', '10-K405', '20-F', '40-F'}
PRICE_FORMS = ANNUAL | {'DEF 14A', '424B1', '424B2', '424B3', '424B4', '424B5', '424B7', 'S-1', 'S-3', 'S-4', 'S-8', '8-K'}
COVER_FORMS = ['10-K', '10-Q', '20-F', '40-F']
DELIST = {'25', '25-NSE', '15-12B', '15-12G', '15-15D'}
BUDGET = 40
ANNUAL_PREFIX, OTHER_PREFIX, VERIFY_PREFIX = 3 * 1024 * 1024, 2 * 1024 * 1024, 6 * 1024 * 1024
MAX_COVER_AGE = 400


def fetch(cik, f, prefix):
    url = sec_lib.doc_url(cik, f['accessionNumber'], f['primaryDocument'])
    try:
        body, meta = L.get(url, prefix=prefix)
    except Exception as e:  # noqa: BLE001
        return None, {'url': url, 'error': str(e)[:120]}
    return body, meta


def cover_rows(body):
    classes, entity = sec_lib.cover_classes(body)
    return classes, entity


def sym_row(classes, ticker):
    t = L.norm_sym(ticker)
    return next((c for c in classes if L.norm_sym(c.get('TradingSymbol')) == t), None)


def latest_cover(cik, filings, ticker):
    tried = []
    for f in sorted((f for f in filings if f['form'] in COVER_FORMS and f.get('primaryDocument')), key=lambda f: f['filingDate'], reverse=True)[:4]:
        body, meta = fetch(cik, f, ANNUAL_PREFIX)
        if body is None:
            tried.append(meta); continue
        classes, entity = cover_rows(body)
        row = sym_row(classes, ticker)
        tried.append({'accession': f['accessionNumber'], 'form': f['form'], 'filingDate': f['filingDate'], 'symbolFound': bool(row)})
        if row:
            commons = [c for c in classes if sec_lib.class_kind(c.get('Security12bTitle')) == 'COMMON']
            return {'accession': f['accessionNumber'], 'form': f['form'], 'filingDate': f['filingDate'], 'url': meta['url'], 'sha256': meta['sha256'], 'sha256Normalized': meta['sha256Normalized'],
                    'bytesRead': meta['bytesRead'], 'complete': meta['complete'], 'row': {k: row.get(k) for k in ('TradingSymbol', 'Security12bTitle', 'SecurityExchangeName')},
                    'commonSymbols': sorted({c.get('TradingSymbol') for c in commons if c.get('TradingSymbol')})}, tried
    return None, tried


def verify_start_doc(v9row, ticker):
    """Re-fetch the V9 start document (first iXBRL cover or full-text ticker statement) and re-verify sha256 + ticker."""
    tc = v9row.get('tickerConfirmation') or {}
    ct = v9row['coverTimelines'][0]
    basis = v9row['usableInterval']['basis']
    if basis.startswith('FULLTEXT') or basis == 'EARLIEST_FULLTEXT_TICKER_CONFIRMATION':
        src = tc if tc.get('state') == 'FOUND' else None
        kind = 'FULLTEXT_TICKER_STATEMENT'
    else:
        src = ct.get('first')
        kind = 'IXBRL_COVER_FIRST'
    if not src:
        return {'kind': kind, 'state': 'NO_V9_START_DOCUMENT'}
    size = src.get('bytesRead') if not src.get('complete') else VERIFY_PREFIX
    try:
        body, meta = L.get(src['url'], prefix=size)
    except Exception as e:  # noqa: BLE001
        return {'kind': kind, 'state': 'FETCH_FAILED', 'url': src['url'], 'error': str(e)[:120]}
    same = meta['sha256'] == src['sha256']
    if kind == 'IXBRL_COVER_FIRST':
        classes, _ = cover_rows(body)
        row = sym_row(classes, ticker)
        ok = bool(row) and sec_lib.class_kind(row.get('Security12bTitle')) == 'COMMON'
        detail = {k: row.get(k) for k in ('TradingSymbol', 'Security12bTitle', 'SecurityExchangeName')} if row else None
    else:
        st = sec_lib.ticker_symbol_statements(L.text_of(body), ticker.replace('_', '.'), False)
        ok, detail = bool(st), (st[0][1][:300] if st else None)
    return {'kind': kind, 'state': 'VERIFIED' if ok else 'EVIDENCE_NOT_FOUND_IN_FRESH_BODY', 'v9Sha256Reproduced': same, 'accession': src.get('accession'),
            'filingDate': src.get('filingDate'), 'url': src['url'], 'sha256': meta['sha256'], 'sha256Normalized': meta['sha256Normalized'], 'v9Sha256': src['sha256'], 'bytesRead': meta['bytesRead'],
            'complete': meta['complete'], 'detail': detail}


def first_bar_on_or_after(points, d):
    return next((p[0] for p in points if p[0] >= d), None)


def first_bar_after(points, d):
    return next((p[0] for p in points if p[0] > d), None)


def assess(v9row, master_by, ticker_map):
    sid, ticker = v9row['securityId'], v9row['ticker']
    b = v9row['binding']
    cik = b['cik']
    weekly, daily = L.load_weekly(sid), L.load_daily(sid)
    pts = weekly['points']
    asof = weekly['asOf']
    out = {'securityId': sid, 'ticker': ticker, 'cik': cik, 'issuer': b['issuer'], 'selectedCanonicalId': b['canonicalId'],
           'v9': {'validFrom': v9row['usableInterval']['validFrom'], 'basis': v9row['usableInterval']['basis'], 'subState': v9row['subState']},
           'series': {'from': pts[0][0], 'to': pts[-1][0], 'asOf': asof, 'bars': len(pts), 'sourceSha256': L.sha256_file(L.WEEKLY_DIR / (sid + '.json'))},
           'reasons': [], 'notes': []}
    rows = master_by.get(sid, [])
    out['masterRowSet'] = sorted(r['canonical_id'] for r in rows)
    sel = next((r for r in rows if r['canonical_id'] == b['canonicalId']), None)
    if not sel:
        out['reasons'].append('SELECTED_MASTER_ROW_MISSING'); out['decision'] = 'EXCLUDED'; return out
    out['selectedRow'] = {k: sel.get(k) for k in ('exchange', 'instrument_type', 'active_status', 'eligible_us_equity', 'start_date', 'end_date')}
    if sum(r['canonical_id'] == b['canonicalId'] for r in rows) != 1:
        # the loader identifies the selected master row by canonical_id; duplicates make the selection non-unique (fail closed)
        out['reasons'].append('SELECTED_ROW_NOT_UNIQUE')
    try:
        head, filings, metas = sec_lib.submissions(cik)
    except Exception as e:  # noqa: BLE001
        out['reasons'].append('SOURCE_UNAVAILABLE'); out['notes'].append(str(e)[:120]); out['decision'] = 'EXCLUDED'; return out
    out['submissions'] = [{'url': m['url'], 'sha256': m['sha256']} for m in metas]
    out['secName'] = head.get('name')
    out['secTickers'] = head.get('tickers')
    out['filerType'] = 'FOREIGN_PRIVATE_ISSUER' if any(f['form'] in ('20-F', '40-F') for f in filings[-60:]) else 'DOMESTIC'

    # Q-CIK / Q-CLS / Q-VEN / Q-CUR
    cov, tried = latest_cover(cik, filings, ticker)
    out['latestCover'] = cov or {'tried': tried}
    if not cov:
        out['reasons'].append('CIK_NOT_CONFIRMED')
    else:
        kind = sec_lib.class_kind(cov['row'].get('Security12bTitle'))
        if kind != 'COMMON':
            out['reasons'].append('CLASS_NOT_COMMON')
        mic = L.exchange_mic(cov['row'].get('SecurityExchangeName'))
        out['latestCover']['mic'] = mic
        if mic not in ('XNYS', 'XNAS', 'XASE') or mic != L.MASTER_MIC.get(sel['exchange']):
            out['reasons'].append('EXCHANGE_MISMATCH')
        age = L.days_between(cov['filingDate'], asof)
        out['latestCover']['ageDays'] = age
        if age > MAX_COVER_AGE:
            out['reasons'].append('COVER_NOT_CURRENT')
        later = [f for f in filings if f['form'] in DELIST and f['filingDate'] > cov['filingDate']]
        if later:
            out['reasons'].append('DELISTING_FORM_AFTER_LAST_COVER')
            out['delistingFormsAfterCover'] = [{'form': f['form'], 'filingDate': f['filingDate'], 'accession': f['accessionNumber']} for f in later]
    start = verify_start_doc(v9row, ticker)
    out['startDocument'] = start
    if start['state'] != 'VERIFIED':
        if start['state'] == 'NO_V9_START_DOCUMENT' and v9row['usableInterval']['basis'] == 'SERIES_STARTS_INSIDE_COVER_CONFIRMED_INTERVAL':
            out['notes'].append('V9 start = series start inside cover-confirmed interval; start document is the first iXBRL cover')
        else:
            out['reasons'].append('START_DOCUMENT_NOT_REVERIFIED')
    if start.get('kind') == 'IXBRL_COVER_FIRST' and start.get('detail') and cov:
        if sec_lib.class_kind(start['detail'].get('Security12bTitle')) != sec_lib.class_kind(cov['row'].get('Security12bTitle')):
            out['reasons'].append('CLASS_CHANGE')

    # Q-PX: price anchors
    s0 = v9row['usableInterval']['validFrom']
    lo = L.add_days(s0, -30)
    cands = [f for f in filings if f['form'] in PRICE_FORMS and lo <= f['filingDate'] <= asof and f.get('primaryDocument')
             and (f['form'] != '8-K' or any(i in (f.get('items') or '') for i in ('2.01', '8.01')))]
    cands.sort(key=lambda f: (f['filingDate'], f['accessionNumber']), reverse=True)
    cands = cands[:BUDGET]
    anchors, docs_read = [], 0
    multi_latest = len((cov or {}).get('commonSymbols') or []) > 1
    for f in cands:
        body, meta = fetch(cik, f, ANNUAL_PREFIX if f['form'] in ANNUAL else OTHER_PREFIX)
        docs_read += 1
        if body is None:
            continue
        text = L.text_of(body)
        classes, _ = cover_rows(body)
        commons = [c for c in classes if sec_lib.class_kind(c.get('Security12bTitle')) == 'COMMON']
        multi = len({c.get('TradingSymbol') for c in commons}) > 1 if classes else multi_latest
        for st in L.price_statements(text):
            chk = L.same_day_check(weekly, daily, st['date'], st['price'])
            if chk['state'] not in ('MATCH', 'MISMATCH_SAME_DAY'):
                continue
            attributed = True
            if multi:
                row = cov['row'] if cov else {}
                ctx = text[max(0, st['start'] - 300):st['start'] + 300]
                attributed = (ticker in ctx) or bool(row.get('Security12bTitle') and row['Security12bTitle'].split(',')[0][:20].lower() in ctx.lower())
            anchors.append({**chk, 'accession': f['accessionNumber'], 'form': f['form'], 'filingDate': f['filingDate'], 'url': meta['url'],
                            'sha256': meta['sha256'], 'sha256Normalized': meta['sha256Normalized'], 'bytesRead': meta['bytesRead'], 'complete': meta['complete'], 'quote': st['quote'],
                            'attributed': attributed})
    out['priceSearch'] = {'candidates': len(cands), 'documentsRead': docs_read}
    use = [a for a in anchors if a['attributed']]
    out['unattributedMultiClass'] = len(anchors) - len(use)

    # Q-INT
    moves = []
    matches = sorted({a['date'] for a in use if a['state'] == 'MATCH'})
    s1 = s0
    if matches and L.days_between(s0, matches[0]) > 730:
        s1 = first_bar_on_or_after(pts, L.add_days(matches[0], -730)); moves.append({'rule': 'FIRST_ANCHOR_730D', 'to': s1})
    for r in rows:
        if r['canonical_id'] == sel['canonical_id']:
            continue
        rs, re_ = r.get('start_date'), r.get('end_date') or asof
        ov_from, ov_to = max(rs, s1), min(re_, asof)
        if ov_from <= ov_to and L.days_between(ov_from, ov_to) > 31:
            nxt = first_bar_after(pts, re_)
            if nxt and nxt > s1:
                s1 = nxt; moves.append({'rule': 'CONCATENATION_GUARD', 'otherRow': r['canonical_id'], 'to': s1})
            elif not nxt:
                s1 = None; moves.append({'rule': 'CONCATENATION_GUARD', 'otherRow': r['canonical_id'], 'to': None}); break
    # venue transfers inside the interval: 8-A12B and 25 within 30 days of each other
    transfers = []
    if s1:
        a12 = [f for f in filings if f['form'] in ('8-A12B',) and f['filingDate'] >= s1]
        f25 = [f for f in filings if f['form'] in ('25', '25-NSE') and f['filingDate'] >= s1]
        for a in a12:
            if any(abs(L.days_between(a['filingDate'], x['filingDate'])) <= 30 for x in f25):
                transfers.append(a['filingDate'])
    out['venueTransfers'] = transfers
    for t in transfers:
        before = [d for d in matches if s1 and s1 <= d < t]
        after = [d for d in matches if d >= t]
        if not (before and after):
            nxt = first_bar_on_or_after(pts, t)
            if nxt and s1 and nxt > s1:
                s1 = nxt; moves.append({'rule': 'VENUE_TRANSFER_UNANCHORED', 'transfer': t, 'to': s1})
    # level breaks near other-row boundaries / transfers
    if s1:
        bounds = [(r.get('start_date'), r['canonical_id']) for r in rows if r['canonical_id'] != sel['canonical_id']]
        bounds += [(r.get('end_date'), r['canonical_id']) for r in rows if r['canonical_id'] != sel['canonical_id'] and r.get('end_date')]
        bounds += [(t, 'VENUE_TRANSFER') for t in transfers]
        breaks = []
        for bd, what in bounds:
            if not bd:
                continue
            for i, p in enumerate(pts):
                if p[0] >= s1 and abs(L.days_between(bd, p[0])) <= 14:
                    z = L.zscore_at(pts, i)
                    if z is not None and abs(z) > 4:
                        breaks.append({'bar': p[0], 'z': round(z, 3), 'boundary': bd, 'what': what})
        out['levelBreaks'] = breaks
        for br in sorted(breaks, key=lambda x: x['bar']):
            if br['bar'] > s1 or (br['bar'] == s1 and False):
                s1 = br['bar']; moves.append({'rule': 'LEVEL_BREAK_AT_BOUNDARY', 'bar': br['bar'], 'z': br['z'], 'to': s1})
    out['intervalMoves'] = moves
    out['validFrom'] = s1
    out['validTo'] = None
    inside = [a for a in use if s1 and a['date'] >= s1]
    out['anchors'] = sorted(inside, key=lambda a: a['date'])
    out['anchorsOutsideInterval'] = len(use) - len(inside)
    out['anchorsBeforeInterval'] = sorted(({k: a[k] for k in ('date', 'state', 'sourceRawPrice', 'ratioSeriesToSource', 'accession', 'form')} for a in use if not (s1 and a['date'] >= s1)),
                                          key=lambda a: a['date'])
    m_in = [a for a in inside if a['state'] == 'MATCH']
    mm_in = [a for a in inside if a['state'] == 'MISMATCH_SAME_DAY']
    if not s1:
        out['reasons'].append('NO_INTERVAL_LEFT')
    elif not m_in:
        out['reasons'].append('NO_SAME_DAY_PRICE_EVIDENCE')
    if mm_in:
        out['reasons'].append('SOURCE_PRICE_CONFLICT')
    if s1:
        kept = [p for p in pts if p[0] >= s1]
        out['historyGuard'] = {'checkedFrom': s1, 'checkedTo': pts[-1][0], 'bars': len(kept), 'pointsSha256': L.js_hash(kept)}
        md = sorted({a['date'] for a in m_in})
        gaps = [L.days_between(md[i - 1], md[i]) for i in range(1, len(md))]
        if md and cov:
            gaps.append(max(0, L.days_between(md[-1], cov['filingDate'])))
        out['anchorGaps'] = {'matchDates': len(md), 'firstMatch': md[0] if md else None, 'lastMatch': md[-1] if md else None, 'maxGapDays': max(gaps) if gaps else None}
    out['decision'] = 'QUALIFIED_SEC_SAME_DAY_PRICE_AND_COVER' if not out['reasons'] else 'EXCLUDED'
    out['evidenceLevel'] = 'SEC_SAME_DAY_PRICE_AND_COVER' if not out['reasons'] else ('COVER_PAGE_ONLY' if out['reasons'] == ['NO_SAME_DAY_PRICE_EVIDENCE'] else 'HOLD')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    amb = json.loads((L.ROOT / 'docs/quant-recovery/v9/identity/ambiguous-resolution.json').read_text())
    master, by = L.master_rows()
    cases = [r for r in amb['rows'] if r['state'] == 'RESOLVED_SINGLE_COMMON_LISTING']
    if a.only:
        cases = [r for r in cases if r['securityId'] in a.only.split(',')]
    res = []
    for i, r in enumerate(cases):
        o = assess(r, by, None)
        res.append(o)
        print(i + 1, len(cases), o['securityId'], o['decision'], o['reasons'], len(o.get('anchors', [])), file=sys.stderr, flush=True)
    counts = {}
    for o in res:
        counts[o['decision']] = counts.get(o['decision'], 0) + 1
    reasons = {}
    for o in res:
        for x in o['reasons']:
            reasons[x] = reasons.get(x, 0) + 1
    doc = {'schemaVersion': 'v10-population-identity-cases-1.0.0', 'protocol': 'docs/quant-recovery/v10/population/protocol-1.0.0.json',
           'protocolSha256': L.sha256_file(L.ROOT / 'docs/quant-recovery/v10/population/protocol-1.0.0.json'),
           'amendments': {n: L.sha256_file(L.ROOT / 'docs/quant-recovery/v10/population' / n) for n in ('protocol-amendment-1.0.1.json', 'protocol-amendment-1.0.2.json', 'protocol-amendment-1.0.3.json')},
           'generatedAt': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
           'codeSha256': {n: L.sha256_file(L.ROOT / 'scripts/quant/v10/population' / n) for n in ('b1_identity.py', 'v10lib.py')},
           'inputs': {'masterSha256': L.sha256_file(L.MASTER), 'ambiguousSha256': L.sha256_file(L.ROOT / 'docs/quant-recovery/v9/identity/ambiguous-resolution.json')},
           'productionApproved': False, 'counts': {'checked': len(res), 'byDecision': counts, 'excludedByReason': reasons},
           'secRequests': sec_lib.CLIENT.stats['requests'] + sec_lib.PREFIX_CLIENT.stats['requests'], 'cases': res}
    L.write_json(a.out, doc)
    print(json.dumps(doc['counts'], indent=1))


if __name__ == '__main__':
    main()
