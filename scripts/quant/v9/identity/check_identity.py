#!/usr/bin/env python3
"""V9 identity - INDEPENDENT consistency check (stdlib only; shares no code with the producing scripts).

Reads the inputs directly (weekly series, security master, private SEC cache bodies) and the stored facts
(dossiers-7.json, ambiguous-resolution.json, identity-evidence-proposal.json, dry-run-counts.json) and
re-derives, with its own implementation:
  A. every source hash: the cached SEC body for each cited URL (gzip DiskCache file keyed by sha256(url[+prefix
     fragment])) is re-hashed and compared with the stored sha256 (no network);
  B. dossier price checks, level checks and the decision state / validFrom (rules R1-R5);
  C. ambiguous resolution states / validFrom from stored cover facts, master rows and the series;
  D. proposal: every BIND/CONFIRM record carries accession + sha256 evidence; history guards recomputed;
  E. the dry-run headline: an independent re-implementation of the adapter checks on every bound slice and
     on the baseline AMBIGUOUS/INACTIVE/MISMATCH ids; newly-qualified count must agree exactly.
usage: check_identity.py --docs docs/quant-recovery/v9/identity --cache <private http-cache> --out <check.json>
"""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import math
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[4]
SERIES = ROOT / 'quant/data/market/discover-series-long'
MASTER = ROOT / 'quant/data/market/security-master/us-security-master.json'
HEX64 = re.compile(r'^[0-9a-f]{64}$')
ACC = re.compile(r'^\d{10}-\d{2}-\d{6}$')


def series(sid, memo={}):
    if sid not in memo:
        memo[sid] = json.loads((SERIES / (sid + '.json')).read_text())
    return memo[sid]


# ---------------------------------------------------------------- A. source hashes
class Cache:
    def __init__(self, d):
        self.d = pathlib.Path(d)

    def body(self, url, prefix):
        keys = [url + '#v9-prefix-%d' % prefix] if prefix else [url]
        for k in keys:
            h = hashlib.sha256(k.encode()).hexdigest()
            p = self.d / h[:2] / (h + '.gz')
            if p.exists():
                with gzip.open(p, 'rb') as f:
                    return f.read()
        return None


def check_hash(cache, src, prefix_default):
    url, sha = src.get('url'), src.get('sha256')
    if not url or not sha:
        return 'MISSING'
    for pref in ([src.get('prefixLimit')] if src.get('prefixLimit') else []) + [prefix_default, 6 * 1024 * 1024, None]:
        b = cache.body(url, pref)
        if b is not None and hashlib.sha256(b).hexdigest() == sha:
            return 'OK'
    return 'NO_MATCHING_CACHED_BODY'


# ---------------------------------------------------------------- B. dossier rules (independent implementation)
def isoweek(d):
    y, w, _ = dt.date.fromisoformat(d).isocalendar()
    return (y, w)


def adj_factor(doc, date):
    f = 1.0
    for d, k in doc['corporateActions']['splits']:
        if d > date:
            f *= k
    return f


def recheck_price(doc, date, raw):
    wk = isoweek(date)
    bar = next((p for p in doc['points'] if isoweek(p[0]) == wk), None)
    if bar is None:
        return 'NO_BAR_IN_WEEK', None
    ratio = bar[1] / (raw / adj_factor(doc, date))
    weekend = dt.date.fromisoformat(date).weekday() >= 5
    same = bar[0] == date or (weekend and bar[0] < date)
    if same:
        return ('MATCH' if abs(ratio - 1) <= 0.02 else 'MISMATCH_SAME_DAY'), ratio
    return ('WEAK_MATCH' if abs(ratio - 1) <= 0.15 else 'MIDWEEK_DEVIATION'), ratio


def recheck_level(doc, date):
    pts = doc['points']
    i = next((k for k, p in enumerate(pts) if p[0] >= date), None)
    if i is None or i == 0:
        return 'OUTSIDE_SERIES', None
    r = math.log(pts[i][1] / pts[i - 1][1])
    h = [math.log(pts[k][1] / pts[k - 1][1]) for k in range(max(1, i - 52), i)]
    if len(h) < 10:
        return 'INSUFFICIENT_HISTORY', None
    mu = sum(h) / len(h)
    sd = (sum((x - mu) ** 2 for x in h) / (len(h) - 1)) ** 0.5
    z = r / sd if sd else None
    return ('LEVEL_BREAK_SUSPECT' if z is not None and abs(z) > 4 else 'NO_LEVEL_BREAK'), (pts[i][0], z)


def kind_of(title):
    t = (title or '').lower()
    if not t:
        return 'UNKNOWN'
    if 'depositary' in t and 'preferred' in t:
        return 'DEPOSITARY_PREFERRED'
    if 'american depositary' in t or 'depositary share' in t:
        return 'ADS'
    if 'preferred' in t or 'preference' in t:
        return 'PREFERRED'
    if 'warrant' in t:
        return 'WARRANT'
    if re.search(r'\bunits?\b', t):
        return 'UNIT'
    if re.search(r'\brights?\b', t):
        return 'RIGHT'
    if re.search(r'\bnotes?\b|debenture|\bbonds?\b|senior|subordinated', t):
        return 'DEBT'
    if re.search(r'common stock|common shares?|ordinary shares|subordinate voting shares|shares of beneficial interest|limited voting shares|class [a-z] common', t):
        return 'COMMON'
    return 'UNKNOWN'


def days(a, b):
    return (dt.date.fromisoformat(a) - dt.date.fromisoformat(b)).days


def dossier_decision(c):
    doc = series(c['securityId'])
    issues = []
    # recompute checks
    for p in c['priceChecks']:
        if p.get('state') in ('FETCH_FAILED', 'NOT_FOUND', 'NO_BAR_IN_WEEK'):
            continue
        st, ratio = recheck_price(doc, p['date'], p['sourceRawPrice'])
        if st != p['state'] or abs(ratio - p['ratioSeriesToSource']) > 1e-6:
            issues.append(('PRICE_CHECK_DIFF', p['date'], st, p['state']))
    for lc in c['levelChecks']:
        st, info = recheck_level(doc, lc['date'])
        if st != lc['state'] or (info and lc.get('z') is not None and abs(info[1] - lc['z']) > 1e-3):
            issues.append(('LEVEL_CHECK_DIFF', lc['date'], st, lc['state']))
    cur = c['currentSecTickerMap']
    reasons = []
    if not (len(cur) == 1 and '%010d' % int(cur[0]['cik']) == c['seriesIssuer']['cik']):
        reasons.append('CIK')
    if not all(x['state'] == 'FOUND' and x['quote'] for e in c['evidence'] for x in e['claims']):
        reasons.append('CLAIMS')
    start = doc['from']
    est = c['earliestSourcedTicker']
    if est.get('state') == 'FOUND' and est['filingDate'] > start:
        start = est['filingDate']
    if est.get('state') == 'NOT_FOUND':
        reasons.append('EST')
    tl = c['currentTickerCovers']
    lt = tl.get('latest') or {}
    if tl.get('state') != 'OK' or not lt.get('symbolFound') or kind_of((lt.get('cls') or {}).get('Security12bTitle')) != 'COMMON' \
            or days(doc['asOf'], lt['filingDate']) > 200 or any(x['form'] in ('25', '25-NSE', '15-12B', '15-12G', '15-15D') and x['filingDate'] > lt['filingDate'] for x in tl.get('listingForms', [])):
        reasons.append('CURRENT')
    ca = [n['date'] for n in c['caNotes']]
    for d in ca:
        start = max(start, d)
    # segments by ticker
    segs = []
    for e in c['tickerChain']:
        f = e['from'] if e['from'] and re.match(r'^\d{4}-\d{2}-\d{2}$', e['from']) else None
        if segs and segs[-1][0] == e['ticker']:
            segs[-1][2] = e['to']
        else:
            segs.append([e['ticker'], f, e['to']])
    segs = [s for s in segs if not s[2] or s[2] >= start]
    matches = []
    for t, f, to in segs:
        lo, hi = max(start, f or '0000'), to or '9999'
        ok = False
        for p in c['priceChecks']:
            if p.get('state') in ('MATCH',) and lo <= p['date'] <= hi:
                ok = True
        matches.append(ok)
    if not (len(segs) == 1 and (segs[0][1] is None or segs[0][1] <= start)):
        i = len(segs)
        while i > 0 and matches[i - 1]:
            i -= 1
        if i == len(segs):
            reasons.append('SEG')
        elif i > 0 and segs[i][1] and segs[i][1] > start:
            start = segs[i][1]
    hold = False
    for lc in c['levelChecks']:
        st, info = recheck_level(doc, lc['date'])
        if st != 'LEVEL_BREAK_SUSPECT' or any(0 <= days(lc['date'], d) <= 7 for d in ca):
            continue
        if info[0] > start:
            rem = sum(1 for p in doc['points'] if p[0] >= info[0])
            if rem >= 55:
                start = info[0]
            else:
                hold = True
    mism = [p for p in c['priceChecks'] if p.get('state') == 'MISMATCH_SAME_DAY' and p['date'] >= start]
    state = 'SOURCE_PRICE_MISMATCH' if mism else 'UNRESOLVED' if reasons else 'HOLD_UNEXPLAINED_LEVEL_BREAK' if hold else 'RESOLVED_SINGLE_SECURITY_MASTER_MISBOUND'
    vf = next((p[0] for p in doc['points'] if p[0] >= start), None)
    return state, vf, issues


# ---------------------------------------------------------------- C. ambiguous rows
EXCH = {'NYSE': r'new york stock exchange|^nyse$|^nyse\b(?! (american|arca|mkt))', 'NASDAQ': r'nasdaq', 'NYSE MKT': r'nyse american|nyse mkt',
        'AMEX': r'nyse american|nyse mkt|american stock exchange', 'NYSE ARCA': r'arca', 'BATS': r'cboe|bats'}


def norm(s):
    s = (s or '').upper().strip()
    s = s.replace('_P_', 'P')
    s = re.sub(r'[\s.\-/]+PR(?=[A-Z]?$)', 'P', s)
    s = re.sub(r'[\s.\-/]+P(?=[A-Z]$)', 'P', s)
    return re.sub(r'[^A-Z0-9]', '', s)


def ambiguous_decision(r, master_by):
    sid = r['securityId']
    if r['state'] == 'UNRESOLVED':
        return 'UNRESOLVED', None
    doc = series(sid)
    tls = [t for t in r['coverTimelines'] if t.get('state') == 'OK']
    if len(tls) != 1:
        return 'UNRESOLVED', None
    tl = tls[0]
    cls = tl['latest']['cls']
    if norm(cls['TradingSymbol']) != norm(doc['ticker']):
        return 'SYMBOL_DIFF', None
    kinds = sorted({kind_of(x.get('Security12bTitle')) for x in cls.get('allClassesWithSymbol', [cls])})
    kind = kinds[0] if len(kinds) == 1 else ('ADS' if 'ADS' in kinds else 'UNKNOWN')
    if kind != 'COMMON':
        return ('RESOLVED_NOT_COMMON' if kind != 'UNKNOWN' else 'UNRESOLVED'), None
    rows = master_by[sid]
    active = [x for x in rows if x['active_status'] == 'ACTIVE' and x['instrument_type'] == 'EQUITY_COMMON' and x.get('eligible_us_equity') is True]
    limit = 400 if tl['latest']['form'] in ('20-F', '40-F') else 200
    if days(doc['asOf'], tl['latest']['filingDate']) > limit or len(active) != 1 \
            or not re.search(EXCH.get(active[0]['exchange'], '^$'), cls.get('SecurityExchangeName') or '', re.I):
        return 'UNRESOLVED', None
    if any(x['form'] in ('25', '25-NSE', '15-12B', '15-12G', '15-15D') and x['filingDate'] > tl['latest']['filingDate'] for x in tl['listingForms']):
        return 'UNRESOLVED', None
    first_title = (tl['first'].get('cls') or {}).get('Security12bTitle')
    if first_title and kind_of(first_title) != 'COMMON':
        return 'UNRESOLVED', None
    row = active[0]
    fc = tl['first']['filingDate']
    conf = r.get('tickerConfirmation') or {}
    if doc['from'] >= fc:
        start = doc['from']
    elif conf.get('state') == 'FOUND' and days(conf['filingDate'], doc['from']) <= 7:
        start = doc['from']
    elif conf.get('state') == 'FOUND' and conf['filingDate'] < fc:
        start = conf['filingDate']
    else:
        start = fc
    start = max(start, row['start_date'])
    bounds = sorted({d for x in rows if x['canonical_id'] != row['canonical_id'] for d in (x['start_date'], x['end_date']) if start < d <= doc['to']})
    hold = False
    for d in bounds:
        st, info = recheck_level(doc, d)
        if st == 'LEVEL_BREAK_SUSPECT' and info[0] > start:
            rem = sum(1 for p in doc['points'] if p[0] >= info[0])
            if rem >= 55:
                start = info[0]
            else:
                hold = True
    vf = next((p[0] for p in doc['points'] if p[0] >= start), None)
    return ('HOLD_LEVEL_BREAK' if hold else 'RESOLVED_SINGLE_COMMON_LISTING'), vf


# ---------------------------------------------------------------- E. independent adapter re-implementation
RATIOS, TOL, DOM = [2, 3, 4, 5, 10], 0.03, 0.75


def split_sized(r):
    if not (isinstance(r, (int, float)) and math.isfinite(r) and r > 0):
        return False
    return any(abs(r / k - 1) < TOL or abs(r * k - 1) < TOL for k in RATIOS)


def monday(d):
    x = dt.date.fromisoformat(d)
    return x - dt.timedelta(days=x.weekday())


def adapter_slice_reason(doc, vf, vt):
    pts = [p for p in doc['points'] if p[0] >= vf and (vt is None or p[0] <= vt)]
    if len(pts) < 55:
        return 'INSUFFICIENT_HISTORY'
    for d, k in doc['corporateActions']['splits']:
        if not (k > 0) or d > doc['asOf']:
            return 'INVALID_SPLIT_EVIDENCE'
    gaps = 0
    for i, (d, p) in enumerate(pts):
        if dt.date.fromisoformat(d).weekday() > 4 or not p > 0 or d > doc['asOf']:
            return 'INVALID_WEEKLY_BAR'
        if i:
            a, b = monday(pts[i - 1][0]), monday(d)
            if d <= pts[i - 1][0] or b <= a:
                return 'UNORDERED_OR_DUPLICATE_WEEK'
            if (b - a).days != 7:
                gaps += 1
    if gaps:
        return 'MISSING_WEEKS'
    moves = {m['week']: m for m in doc['corporateActions'].get('moves', [])}
    for i in range(1, len(pts)):
        if split_sized(pts[i][1] / pts[i - 1][1]):
            m = moves.get(pts[i][0])
            if doc['corporateActions'].get('version') != 'corporate-action-evidence-1.0.0' or m is None or m.get('splitInWeek') \
                    or not isinstance(m.get('maxDailyRatio'), (int, float)) or split_sized(m['maxDailyRatio']) \
                    or abs(math.log(m['maxDailyRatio'])) >= DOM * abs(math.log(m['weeklyRatio'])):
                return 'CORPORATE_ACTION_UNRESOLVED'
            if abs(m['weeklyRatio'] - pts[i][1] / pts[i - 1][1]) > 0.00001:
                return 'CORPORATE_ACTION_EVIDENCE_MISMATCH'
    return 'QUALIFIED'


CONFLICT_HOLDS = {('ref_FRMEP', 'tiingo:NASDAQ:FRMEP:2022-04-01'), ('ref_MBINM', 'tiingo:NASDAQ:MBINM:2022-09-23')}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--docs', required=True)
    ap.add_argument('--cache', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    d = pathlib.Path(a.docs)
    dos = json.loads((d / 'dossiers-7.json').read_text())
    amb = json.loads((d / 'ambiguous-resolution.json').read_text())
    prop = json.loads((d / 'identity-evidence-proposal.json').read_text())
    dry = json.loads((d / 'dry-run-counts.json').read_text())
    cache = Cache(a.cache)
    master = json.loads(MASTER.read_text())
    by = {}
    for r in master['rows']:
        if r.get('baseline_security_id'):
            by.setdefault(r['baseline_security_id'], []).append(r)
    report = {'schemaVersion': 'v9-identity-independent-check-1.0.0', 'codeSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()}
    # B
    dres = []
    for c in dos['cases']:
        st, vf, issues = dossier_decision(c)
        dres.append({'securityId': c['securityId'], 'stored': c['decision']['state'], 'recomputed': st,
                     'storedValidFrom': c['decision']['usableInterval']['validFrom'], 'recomputedValidFrom': vf,
                     'agree': st == c['decision']['state'] and vf == c['decision']['usableInterval']['validFrom'] and not issues, 'issues': issues})
    report['dossiers'] = {'agree': sum(x['agree'] for x in dres), 'total': len(dres), 'rows': dres}
    # C
    ares = []
    for r in amb['rows']:
        st, vf = ambiguous_decision(r, by)
        svf = (r.get('usableInterval') or {}).get('validFrom') if r['state'] == 'RESOLVED_SINGLE_COMMON_LISTING' else None
        ok = st == r['state'] and (vf == svf if st == 'RESOLVED_SINGLE_COMMON_LISTING' else True)
        ares.append({'securityId': r['securityId'], 'stored': r['state'], 'recomputed': st, 'storedValidFrom': svf, 'recomputedValidFrom': vf, 'agree': ok})
    report['ambiguous'] = {'agree': sum(x['agree'] for x in ares), 'total': len(ares), 'disagreements': [x for x in ares if not x['agree']]}
    # A + D
    hres, missing = {'OK': 0}, []
    for rec in prop['records']:
        srcs = [s for s in rec.get('sources', []) if s.get('accession') or s.get('role') == 'SUBMISSIONS']
        doc_srcs = [s for s in srcs if s.get('accession')]
        if rec['decision'] in ('BIND_SOURCE_RESOLVED_LISTING', 'CONFIRM_NOT_COMMON') and not any(ACC.match(s['accession']) and HEX64.match(s.get('sha256') or '') for s in doc_srcs):
            missing.append(rec['securityId'])
        for s in srcs:
            st = check_hash(cache, s, 2 * 1024 * 1024)
            hres[st] = hres.get(st, 0) + 1
            if st != 'OK':
                missing.append('%s:%s:%s' % (rec['securityId'], s.get('accession') or s.get('url'), st))
        if rec['decision'] == 'BIND_SOURCE_RESOLVED_LISTING':
            g = rec['historyGuard']
            pts = [p for p in series(rec['securityId'])['points'] if g['checkedFrom'] <= p[0] <= g['checkedTo']]
            if hashlib.sha256(json.dumps(pts, separators=(',', ':')).encode()).hexdigest() != g['pointsSha256']:
                missing.append(rec['securityId'] + ':HISTORY_GUARD')
    report['sources'] = {'hashChecks': hres, 'problems': missing}
    # E
    binds = {r['securityId']: r for r in prop['records'] if r['decision'] == 'BIND_SOURCE_RESOLVED_LISTING'}
    after = {}
    for sid, rec in binds.items():
        b = rec['binding']
        reason = 'ORIGINAL_SOURCE_CLASSIFICATION_CONFLICT' if (sid, b['canonicalId']) in CONFLICT_HOLDS else adapter_slice_reason(series(sid), b['validFrom'], b['validTo'])
        after[sid] = reason
    js = {x['securityId']: x['after'] for x in dry['bindings']}
    diff = {k: (after[k], js.get(k)) for k in after if after[k] != js.get(k)}
    newly = sum(1 for k, v in after.items() if v == 'QUALIFIED')
    report['dryRun'] = {'pythonNewlyQualified': newly, 'jsNewlyQualified': dry['newlyQualified'], 'agree': newly == dry['newlyQualified'] and not diff,
                        'perIdDisagreements': diff,
                        'pythonAfterByReason': {k: sum(1 for v in after.values() if v == k) for k in sorted(set(after.values()))}}
    report['overall'] = ('PASS' if report['dossiers']['agree'] == report['dossiers']['total'] and not report['ambiguous']['disagreements']
                         and not missing and report['dryRun']['agree'] else 'FAIL')
    pathlib.Path(a.out).write_text(json.dumps(report, indent=1) + '\n')
    print(json.dumps({k: report[k] if k in ('overall',) else None for k in ('overall',)}),
          'dossiers', report['dossiers']['agree'], '/', report['dossiers']['total'],
          'ambiguous', report['ambiguous']['agree'], '/', report['ambiguous']['total'],
          'hashes', hres, 'problems', len(missing), 'dryRun', report['dryRun']['pythonNewlyQualified'], report['dryRun']['jsNewlyQualified'])


if __name__ == '__main__':
    main()
