"""V12 LARGECAP parts RESTRICT and IDENTITY: V10 B1 identity rules (scripts/quant/v10/population/b1_identity.py#assess, imported
unchanged) under docs/quant-recovery/v12/largecap/protocol-1.0.0.json with
  L4  price-document budget: the 40 newest 1.0.0 candidates plus every DEF 14A / 10-K / 10-K405 in [S0 - 30 d, asOf]
  L5  duplicate master rows (same canonical_id): ACTIVE-row key, other rows' end_date treated like a venue transfer
and, for part RESTRICT, the symbol start document after the last non-admissible corporate-action week (S0 rule).
SEC access: seclib (fair-access client <= 2 req/s, private cache, earlier strands' caches read-only), V9/V10 prefix sizes kept.

  python3 -I scripts/quant/v12/largecap/b1run.py --ca-facts <ca-facts.jsonl> --restrict-out <restrict.json> --identity-out <identity.json>
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE))
import seclib  # noqa: E402

sys.path.insert(0, str(ROOT / 'scripts/quant/v10/population'))
import v10lib as L  # noqa: E402
from v10lib import sec_lib  # noqa: E402
import b1_identity as B1  # noqa: E402

PROTOCOL = ROOT / 'docs/quant-recovery/v12/largecap/protocol-1.0.0.json'
P12 = json.loads(PROTOCOL.read_text())
PROTOCOL_SHA = hashlib.sha256(PROTOCOL.read_bytes()).hexdigest()
V10_PROTOCOL_SHA = L.sha256_file(ROOT / 'docs/quant-recovery/v10/population/protocol-1.0.0.json')
assert V10_PROTOCOL_SHA == P12['inputs']['identityProtocol']['sha256'], 'V10 identity protocol changed'
ADMISSIBLE = {'GENUINE_MOVE', 'SPINOFF_DISTRIBUTION'}
BOUND_CIK = {'ref_WBD': '0001437107'}


# ---- SEC access through seclib, V9 prefix convention unchanged
def _get(url, prefix=False):
    if prefix:
        return seclib.get_prefix(url, B1.ANNUAL_PREFIX if prefix is True else int(prefix))
    body, meta = seclib.get(url)
    return body, {'url': url, 'bytesRead': len(body), 'complete': True, 'sha256': meta['sha256']}


sec_lib.get = _get

# ---- L4: candidate list = 40 newest (1.0.0) + every DEF 14A / 10-K / 10-K405 of the window
_submissions = sec_lib.submissions
L4_CONTEXT = {}


def submissions_l4(cik):
    head, filings, metas = _submissions(cik)
    ctx = L4_CONTEXT.get('case')
    if not ctx:
        return head, filings, metas
    lo, asof = L.add_days(ctx['s0'], -30), ctx['asOf']
    is_cand = lambda f: (f['form'] in B1.PRICE_FORMS and lo <= f['filingDate'] <= asof and f.get('primaryDocument')
                         and (f['form'] != '8-K' or any(i in (f.get('items') or '') for i in ('2.01', '8.01'))))
    cands = sorted([f for f in filings if is_cand(f)], key=lambda f: (f['filingDate'], f['accessionNumber']), reverse=True)
    keep = {f['accessionNumber'] for f in cands[:40]} | {f['accessionNumber'] for f in cands if f['form'] in ('DEF 14A', '10-K', '10-K405')}
    ctx['l4'] = {'oneZeroZeroCandidates': min(40, len(cands)), 'added': len(keep) - min(40, len(cands)), 'allCandidatesInWindow': len(cands)}
    return head, [f for f in filings if not is_cand(f) or f['accessionNumber'] in keep], metas


sec_lib.submissions = submissions_l4
B1.BUDGET = 10 ** 9  # the filing list above already holds exactly the L4 candidates


def run_assess(v9row, master_by):
    L4_CONTEXT['case'] = {'s0': v9row['usableInterval']['validFrom'], 'asOf': L.load_weekly(v9row['securityId'])['asOf']}
    try:
        out = B1.assess(v9row, master_by, None)
    finally:
        ctx = L4_CONTEXT.pop('case')
    out['l4'] = ctx.get('l4')
    return out


# ---- L5: duplicate master rows
def apply_l5(out, rows):
    if 'SELECTED_ROW_NOT_UNIQUE' not in out['reasons']:
        return out
    sel_id = out['selectedCanonicalId']
    dup = [r for r in rows if r['canonical_id'] == sel_id]
    active = [r for r in dup if r.get('active_status') == 'ACTIVE']
    keys = sorted('%s|%s|%s' % (r['canonical_id'], r.get('active_status'), r.get('end_date')) for r in rows)
    if len(active) != 1 or len(set(keys)) != len(keys):
        out['l5'] = {'applied': False, 'why': 'ACTIVE_KEY_NOT_UNIQUE'}
        return out
    a = active[0]
    out['reasons'] = [x for x in out['reasons'] if x != 'SELECTED_ROW_NOT_UNIQUE']
    out['selectedRow'] = {k: a.get(k) for k in ('exchange', 'instrument_type', 'active_status', 'eligible_us_equity', 'start_date', 'end_date')}
    out['selectedRowKey'] = {'canonicalId': sel_id, 'activeStatus': 'ACTIVE', 'endDate': a.get('end_date')}
    out['masterRowKeys'] = keys
    pts = L.load_weekly(out['securityId'])['points']
    s1 = out['validFrom']
    moves = []
    matches = sorted({x['date'] for x in out['anchors'] if x['state'] == 'MATCH'})
    for r in dup:
        if r is a or not r.get('end_date') or not s1:
            continue
        t = r['end_date']
        if t < s1:
            continue
        before = [d for d in matches if s1 <= d <= t]
        after = [d for d in matches if d > t]
        if not (before and after):
            nxt = B1.first_bar_after(pts, t)
            s1 = nxt
            moves.append({'rule': 'L5_DUPLICATE_ROW_END_UNANCHORED', 'row': '%s|%s|%s' % (r['canonical_id'], r.get('active_status'), t), 'to': s1})
        else:
            moves.append({'rule': 'L5_DUPLICATE_ROW_END_ANCHORED_BOTH_SIDES', 'row': '%s|%s|%s' % (r['canonical_id'], r.get('active_status'), t), 'before': before[-1], 'after': after[0]})
    out['l5'] = {'applied': True, 'moves': moves}
    if s1 != out['validFrom']:
        out['intervalMoves'] = out['intervalMoves'] + [m for m in moves if 'to' in m]
        out['validFrom'] = s1
        keep = [x for x in out['anchors'] if s1 and x['date'] >= s1]
        out['anchorsOutsideInterval'] += len(out['anchors']) - len(keep)
        out['anchors'] = keep
        out['reasons'] = [x for x in out['reasons'] if x not in ('NO_SAME_DAY_PRICE_EVIDENCE', 'SOURCE_PRICE_CONFLICT', 'NO_INTERVAL_LEFT')]
        if not s1:
            out['reasons'].append('NO_INTERVAL_LEFT')
        elif not [x for x in keep if x['state'] == 'MATCH']:
            out['reasons'].append('NO_SAME_DAY_PRICE_EVIDENCE')
        if [x for x in keep if x['state'] == 'MISMATCH_SAME_DAY']:
            out['reasons'].append('SOURCE_PRICE_CONFLICT')
        if s1:
            kept = [p for p in pts if p[0] >= s1]
            out['historyGuard'] = {'checkedFrom': s1, 'checkedTo': pts[-1][0], 'bars': len(kept), 'pointsSha256': L.js_hash(kept)}
            md = sorted({x['date'] for x in keep if x['state'] == 'MATCH'})
            gaps = [L.days_between(md[i - 1], md[i]) for i in range(1, len(md))]
            if md and out.get('latestCover', {}).get('filingDate'):
                gaps.append(max(0, L.days_between(md[-1], out['latestCover']['filingDate'])))
            out['anchorGaps'] = {'matchDates': len(md), 'firstMatch': md[0] if md else None, 'lastMatch': md[-1] if md else None, 'maxGapDays': max(gaps) if gaps else None}
    out['decision'] = 'QUALIFIED_SEC_SAME_DAY_PRICE_AND_COVER' if not out['reasons'] else 'EXCLUDED'
    out['evidenceLevel'] = 'SEC_SAME_DAY_PRICE_AND_COVER' if not out['reasons'] else ('COVER_PAGE_ONLY' if out['reasons'] == ['NO_SAME_DAY_PRICE_EVIDENCE'] else 'HOLD')
    return out


# ---- part RESTRICT: symbol start document after the last non-admissible event
def symbol_start(cik, filings, ticker, after_week):
    tried = []
    periodic = sorted([f for f in filings if f['form'] in ('10-K', '10-Q') and f['filingDate'] > after_week], key=lambda f: (f['filingDate'], f['accessionNumber']))[:16]
    for f in periodic:
        name = f.get('primaryDocument') or (f['accessionNumber'] + '.txt')
        url = sec_lib.doc_url(cik, f['accessionNumber'], name)
        body, meta = L.get(url, prefix=B1.ANNUAL_PREFIX)
        classes, _ = sec_lib.cover_classes(body)
        row = B1.sym_row(classes, ticker)
        rec = {'accession': f['accessionNumber'], 'form': f['form'], 'filingDate': f['filingDate'], 'url': url, 'sha256': meta['sha256'], 'sha256Normalized': meta['sha256Normalized'],
               'bytesRead': meta['bytesRead'], 'complete': meta['complete']}
        if row and sec_lib.class_kind(row.get('Security12bTitle')) == 'COMMON':
            return {**rec, 'kind': 'IXBRL_COVER_FIRST', 'cls': {k: row.get(k) for k in ('TradingSymbol', 'Security12bTitle', 'SecurityExchangeName')}}, tried
        st = sec_lib.ticker_symbol_statements(L.text_of(body), ticker.replace('_', '.'), False)
        if st:
            return {**rec, 'kind': 'FULLTEXT_TICKER_STATEMENT', 'quote': st[0][1][:300]}, tried
        tried.append({k: rec[k] for k in ('accession', 'form', 'filingDate')})
    return None, tried


def restrict_case(sid, facts, master_by, tickers):
    weekly = L.load_weekly(sid)
    pts, ticker = weekly['points'], weekly['ticker']
    rows = master_by.get(sid, [])
    out = {'securityId': sid, 'ticker': ticker, 'part': 'RESTRICT', 'reasons': []}
    nonadm = [e for e in facts['events'] if e.get('verdict') not in ADMISSIBLE]
    out['caEvents'] = [{'week': e['week'], 'prevWeek': e['prevWeek'], 'verdict': e.get('verdict'), 'detail': e.get('detail')} for e in facts['events']]
    if not nonadm:
        out['reasons'].append('ALL_EVENTS_ADMISSIBLE_PART_CA'); out['decision'] = 'NOT_APPLICABLE'; return out
    if len(rows) != 1 or sum(r['canonical_id'] == rows[0]['canonical_id'] for rs in master_by.values() for r in rs) != 1:
        out['reasons'].append('NOT_SINGLE_MASTER_ROW'); out['decision'] = 'EXCLUDED'; return out
    cik = BOUND_CIK.get(sid) or ('%010d' % tickers[ticker]) if (BOUND_CIK.get(sid) or ticker in tickers) else None
    if not cik:
        out['reasons'].append('NO_BOUND_CIK'); out['decision'] = 'EXCLUDED'; return out
    last = max(e['week'] for e in nonadm)
    head, filings, _ = _submissions(cik)
    start, tried = symbol_start(cik, filings, ticker, last)
    out['symbolStartSearch'] = {'after': last, 'tried': tried}
    if not start:
        out['reasons'].append('NO_SYMBOL_START_DOCUMENT'); out['decision'] = 'EXCLUDED'; return out
    first_after = B1.first_bar_after(pts, last)
    first_on_doc = B1.first_bar_on_or_after(pts, start['filingDate'])
    if not first_after or not first_on_doc:
        out['reasons'].append('NO_INTERVAL_LEFT'); out['decision'] = 'EXCLUDED'; return out
    s0 = max(first_after, first_on_doc)
    out['S0'] = {'firstBarAfterLastNonAdmissibleEvent': first_after, 'firstBarOnOrAfterSymbolStart': first_on_doc, 'S0': s0}
    ixbrl = start['kind'] == 'IXBRL_COVER_FIRST'
    v9row = {'securityId': sid, 'ticker': ticker, 'subState': 'RESTRICTED_AFTER_UNRESOLVED_CORPORATE_ACTION',
             'binding': {'cik': cik, 'issuer': head.get('name'), 'canonicalId': rows[0]['canonical_id']},
             'usableInterval': {'validFrom': s0, 'basis': 'FIRST_IXBRL_COVER_WITH_TICKER_AFTER_CA' if ixbrl else 'FULLTEXT_TICKER_CONFIRMATION_AFTER_CA'},
             'coverTimelines': [{'first': start if ixbrl else None}],
             'tickerConfirmation': {'state': 'FOUND', **start} if not ixbrl else {}}
    res = run_assess(v9row, master_by)
    res.update({'part': 'RESTRICT', 'caEvents': out['caEvents'], 'symbolStartSearch': out['symbolStartSearch'], 'S0': out['S0'], 'symbolStartDocument': start})
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ca-facts', required=True)
    ap.add_argument('--restrict-out', required=True)
    ap.add_argument('--identity-out', required=True)
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    only = set(x for x in a.only.split(',') if x)
    master, by = L.master_rows()
    tick_body, _ = seclib.get('https://www.sec.gov/files/company_tickers_exchange.json')
    tj = json.loads(tick_body)
    tickers = {}
    for row in tj['data']:
        tickers.setdefault(row[2], row[0])
    facts = {json.loads(l)['securityId']: json.loads(l) for l in pathlib.Path(a.ca_facts).read_text().splitlines() if l.strip()}
    restrict = []
    for sid in P12['scope']['corporateAction']:
        if only and sid not in only:
            continue
        o = restrict_case(sid, facts[sid], by, tickers)
        restrict.append(o)
        print('RESTRICT', sid, o.get('decision'), o.get('reasons'), o.get('validFrom'), len(o.get('anchors', [])), o.get('l4'), seclib.STATS, file=sys.stderr, flush=True)
    amb = json.loads((ROOT / 'docs/quant-recovery/v9/identity/ambiguous-resolution.json').read_text())
    v9 = {r['securityId']: r for r in amb['rows']}
    ident = []
    for sid in [x for x in P12['scope']['identity'] if x not in ('ref_MRNA', 'ref_CZR')]:
        if only and sid not in only:
            continue
        o = apply_l5(run_assess(v9[sid], by), by.get(sid, []))
        o['part'] = 'IDENTITY'
        ident.append(o)
        print('IDENTITY', sid, o['decision'], o['reasons'], o.get('validFrom'), len(o.get('anchors', [])), o.get('l4'), seclib.STATS, file=sys.stderr, flush=True)
    meta = {'protocol': 'docs/quant-recovery/v12/largecap/protocol-1.0.0.json', 'protocolSha256': PROTOCOL_SHA, 'v10ProtocolSha256': V10_PROTOCOL_SHA,
            'generatedAt': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'codeSha256': {n: L.sha256_file(HERE / n) for n in ('b1run.py', 'seclib.py')} | {'b1_identity.py': L.sha256_file(ROOT / 'scripts/quant/v10/population/b1_identity.py'), 'v10lib.py': L.sha256_file(ROOT / 'scripts/quant/v10/population/v10lib.py')},
            'inputs': {'masterSha256': L.sha256_file(L.MASTER), 'caFactsSha256': L.sha256_file(a.ca_facts)}, 'productionApproved': False, 'certificationStatus': 'NOT_CERTIFIED'}
    cnt = lambda xs: {k: sum(1 for x in xs if x.get('decision') == k) for k in sorted({x.get('decision') for x in xs})}
    L.write_json(a.restrict_out, {'schemaVersion': 'v12-largecap-restrict-cases-1.0.0', **meta, 'counts': cnt(restrict), 'cases': restrict})
    L.write_json(a.identity_out, {'schemaVersion': 'v12-largecap-identity-cases-1.0.0', **meta, 'counts': cnt(ident), 'cases': ident})
    print(json.dumps({'restrict': cnt(restrict), 'identity': cnt(ident), 'sec': seclib.STATS}), file=sys.stderr)


if __name__ == '__main__':
    main()
