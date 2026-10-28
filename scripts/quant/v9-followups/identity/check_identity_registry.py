#!/usr/bin/env python3
"""V9 follow-up (identity) - INDEPENDENT check of the opt-in research identity registry (stdlib only).

Shares no code with quant/engines/weekly-real-adapter.cjs. From the raw inputs (weekly series, security master,
registry file, classification registry) it re-derives, for each registry record:
  - the default-path reason (single master row -> adapter checks),
  - the opt-in reason ({identityEvidence: true}: SEC_SAME_DAY_PRICE_AND_COVER only) and
    the opt-in + cover-page reason ({..., identityEvidenceAllowCoverPageOnly: true}),
    incl. master-row check, history guard, 400-day cover expiry, interval cut and all weekly-series checks,
and compares them with the before/after evidence written by before-after.cjs. Optionally (--cache) every cited SEC
body is re-hashed from the private V9 http cache (no network).

usage: python3 -I check_identity_registry.py --root <repo> --before-after <before-after.json> [--cache <http-cache>] --out <json>
"""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import math
import pathlib
import re

SPLIT_RATIOS = [2, 3, 4, 5, 10]
TOL = 0.03
DOMINANT = 0.75
CA_VERSION = 'corporate-action-evidence-1.0.0'
MAX_AGE = 400


def js_module_json(path):
    t = pathlib.Path(path).read_text()
    i = t.index('module.exports = ') + len('module.exports = ')
    return json.loads(t[i:t.rstrip().rindex(';')])


def jsdump(x):
    return json.dumps(x, separators=(',', ':'), ensure_ascii=False)


def sha(b):
    return hashlib.sha256(b if isinstance(b, bytes) else b.encode('utf-8')).hexdigest()


def isdate(s):
    try:
        return isinstance(s, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', s) and dt.date.fromisoformat(s).isoformat() == s
    except ValueError:
        return False


def split_sized(r):
    if not isinstance(r, (int, float)) or not math.isfinite(r) or r <= 0:
        return False
    return any(abs(r / k - 1) < TOL or abs(r * k - 1) < TOL for k in SPLIT_RATIOS)


def ca_resolve(suspected, ev):
    if not suspected:
        return 'CLEAN'
    ok = True
    for t in suspected:
        if not ev or ev.get('version') != CA_VERSION or not isinstance(ev.get('moves'), list):
            return 'UNRESOLVED'
        m = next((x for x in ev['moves'] if x.get('week') == t), None)
        if not m:
            return 'UNRESOLVED'
        # Full resolution rules live in the engine; a bound series in this check must be CLEAN or is reported.
        ok = False
    return 'RESOLVED' if ok else 'NEEDS_ENGINE_RESOLUTION'


def monday(d):
    x = dt.date.fromisoformat(d)
    return x - dt.timedelta(days=x.weekday())


def weekly_checks(doc, identity, holds):
    """Independent re-implementation of the adapter's validate(); returns a reason or 'QUALIFIED'."""
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    if not isdate(doc.get('asOf')) or doc['asOf'] > today or doc.get('instrumentId') != doc.get('ticker'):
        return 'INVALID_SOURCE_METADATA'
    if doc.get('dataMode') != 'real' or doc.get('priceSeriesType') != 'SPLIT_ADJUSTED' or doc.get('grain') != 'weekly':
        return 'REAL_WEEKLY_PRICE_REQUIRED'
    if (not identity.get('canonical_id') or identity.get('baseline_security_id') != doc.get('securityId') or identity.get('ticker') != doc.get('ticker')
            or identity.get('currency') != doc.get('currency') or identity.get('provider') != doc.get('provider') or doc.get('from') < identity.get('start_date')):
        return 'LISTING_IDENTITY_MISMATCH'
    if any(h['decision'] == 'HOLD_COMMON_STOCK_RESEARCH' and h['securityId'] == doc['securityId'] and h['canonicalId'] == identity['canonical_id'] and h['ticker'] == doc['ticker'] for h in holds):
        return 'ORIGINAL_SOURCE_CLASSIFICATION_CONFLICT'
    if identity.get('active_status') != 'ACTIVE':
        return 'INACTIVE_LISTING_TERMINAL_VALUE_UNVERIFIED'
    if identity.get('eligible_us_equity') is not True or identity.get('instrument_type') != 'EQUITY_COMMON':
        return 'INELIGIBLE_EQUITY_LISTING'
    pts = doc.get('points')
    if not isinstance(pts, list) or len(pts) < 55:
        return 'INSUFFICIENT_HISTORY'
    for a in (doc.get('corporateActions') or {}).get('splits') or []:
        if not isinstance(a, list) or not isdate(a[0]) or not isinstance(a[1], (int, float)) or a[1] <= 0 or a[0] > doc['asOf']:
            return 'INVALID_SPLIT_EVIDENCE'
    gaps = 0
    for i, (d, p) in enumerate(pts):
        if not isdate(d) or dt.date.fromisoformat(d).weekday() > 4 or not isinstance(p, (int, float)) or p <= 0 or d > doc['asOf']:
            return 'INVALID_WEEKLY_BAR'
        if i:
            prev = pts[i - 1][0]
            if d <= prev or monday(d) <= monday(prev):
                return 'UNORDERED_OR_DUPLICATE_WEEK'
            if (monday(d) - monday(prev)).days != 7:
                gaps += 1
    if doc.get('from') != pts[0][0] or doc.get('to') != pts[-1][0]:
        return 'SERIES_BOUNDARY_MISMATCH'
    if gaps:
        return 'MISSING_WEEKS'
    suspected = [pts[i][0] for i in range(1, len(pts)) if split_sized(pts[i][1] / pts[i - 1][1])]
    st = ca_resolve(suspected, doc.get('corporateActions'))
    if st != 'CLEAN':
        return 'CORPORATE_ACTION_' + st
    return 'QUALIFIED'


def bound_reason(rec, sid, doc, rows, canonical, holds):
    for cid in rec['replacesCanonicalIds']:
        if not any(r['canonical_id'] == cid for r in rows):
            return 'IDENTITY_EVIDENCE_MASTER_ROW_MISSING', None
    for r in rows:
        if r['canonical_id'] not in rec['replacesCanonicalIds'] or r['ticker'] != rec['ticker'] or len(canonical.get(r['canonical_id'], ())) != 1:
            return 'IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED', None
    g = rec['historyGuard']
    guarded = [p for p in doc['points'] if g['checkedFrom'] <= p[0] <= g['checkedTo']]
    if sha(jsdump(guarded)) != g['pointsSha256']:
        return 'IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH', None
    age = (dt.date.fromisoformat(doc['asOf']) - dt.date.fromisoformat(rec['lastConfirmedCover']['filingDate'])).days
    if age > MAX_AGE:
        return 'IDENTITY_EVIDENCE_EXPIRED', None
    pts = [p for p in doc['points'] if p[0] >= rec['validFrom'] and (rec['validTo'] is None or p[0] <= rec['validTo'])]
    if not pts:
        return 'INSUFFICIENT_HISTORY', None
    sliced = dict(doc, points=pts, **{'from': pts[0][0], 'to': pts[-1][0]})
    identity = {'canonical_id': rec['canonicalId'], 'baseline_security_id': sid, 'ticker': rec['ticker'], 'currency': rec['currency'],
                'provider': rec['provider'], 'start_date': rec['validFrom'], 'active_status': 'ACTIVE', 'eligible_us_equity': True, 'instrument_type': 'EQUITY_COMMON'}
    reason = weekly_checks(sliced, identity, holds)
    return reason, {'from': pts[0][0], 'to': pts[-1][0], 'bars': len(pts), 'coverAgeDays': age, 'listingId': rec['canonicalId']}


class Cache:
    def __init__(self, d):
        self.d = pathlib.Path(d)

    def verify(self, url, digest):
        for key in (url, url + '#v9-prefix-2097152', url + '#v9-prefix-6291456'):
            h = sha(key)
            p = self.d / h[:2] / (h + '.gz')
            if p.exists():
                with gzip.open(p, 'rb') as f:
                    if sha(f.read()) == digest:
                        return True
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--before-after', required=True)
    ap.add_argument('--cache')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    root = pathlib.Path(a.root)
    reg_path = root / 'quant/engines/research-identity-evidence.cjs'
    reg = js_module_json(reg_path)
    holds = js_module_json(root / 'quant/engines/research-classification-evidence.cjs')['records']
    master = json.loads((root / 'quant/data/market/security-master/us-security-master.json').read_text())
    by_id, canonical = {}, {}
    for r in master['rows']:
        k = r.get('baseline_security_id')
        if k:
            by_id.setdefault(k, []).append(r)
            if r.get('canonical_id'):
                canonical.setdefault(r['canonical_id'], set()).add(k)
    ba = json.loads(pathlib.Path(a.before_after).read_text())
    cache = Cache(a.cache) if a.cache else None
    results, mismatches, src_stats = {}, [], {'checked': 0, 'ok': 0, 'missing': []}
    for rec in reg['records']:
        sid = rec['securityId']
        doc = json.loads((root / 'quant/data/market/discover-series-long' / (sid + '.json')).read_text())
        rows = by_id.get(sid, [])
        if len(rows) != 1 or len(canonical.get(rows[0]['canonical_id'], ())) != 1:
            default = 'AMBIGUOUS_LISTING_IDENTITY'
        else:
            default = weekly_checks(doc, rows[0], holds)
        bound, detail = bound_reason(rec, sid, doc, rows, canonical, holds)
        opt_in = bound if rec['evidenceLevel'] == 'SEC_SAME_DAY_PRICE_AND_COVER' else default
        res = {'evidenceLevel': rec['evidenceLevel'], 'default': default, 'optIn': opt_in, 'optInCoverPageOnly': bound, 'boundDetail': detail,
               'sourceCount': len(rec['sources']), 'priceEvidenceCount': len(rec['priceEvidence'])}
        results[sid] = res
        node = ba['perBoundId'][sid]
        for mode in ('default', 'optIn', 'optInCoverPageOnly'):
            if node[mode]['reason'] != res[mode]:
                mismatches.append({'securityId': sid, 'mode': mode, 'node': node[mode]['reason'], 'python': res[mode]})
        n = node['optInCoverPageOnly']
        if detail and n['reason'] == 'QUALIFIED' and (n['from'], n['to'], n['bars'], n['listingId'], n['binding']['coverAgeDays']) != (detail['from'], detail['to'], detail['bars'], detail['listingId'], detail['coverAgeDays']):
            mismatches.append({'securityId': sid, 'mode': 'interval', 'node': n, 'python': detail})
        if cache:
            for s in rec['sources']:  # incl. lastConfirmedCover (schema requires it among the sources)
                src_stats['checked'] += 1
                if cache.verify(s['url'], s['sha256']):
                    src_stats['ok'] += 1
                else:
                    src_stats['missing'].append([sid, s['accession'], s['url']])
    q = lambda mode: sum(1 for r in results.values() if r[mode] == 'QUALIFIED')
    delta_ok = {
        'optIn': ba['qualified']['optIn'] - ba['qualified']['default'] == q('optIn') - q('default') and sorted(ba['changedVsDefault']['optIn']) == sorted(s for s, r in results.items() if r['optIn'] != r['default']),
        'optInCoverPageOnly': ba['qualified']['optInCoverPageOnly'] - ba['qualified']['default'] == q('optInCoverPageOnly') - q('default') and sorted(ba['changedVsDefault']['optInCoverPageOnly']) == sorted(results),
    }
    report = {
        'schemaVersion': 'v9-followup-identity-independent-check-1.0.0',
        'codeSha256': sha(pathlib.Path(__file__).read_bytes()),
        'registrySha256': sha(reg_path.read_bytes()),
        'beforeAfterSha256': sha(pathlib.Path(a.before_after).read_bytes()),
        'masterSha256': sha((root / 'quant/data/market/security-master/us-security-master.json').read_text()),
        'records': results,
        'qualifiedAmongBound': {m: q(m) for m in ('default', 'optIn', 'optInCoverPageOnly')},
        'countDeltaConsistent': delta_ok,
        'sourceHashes': src_stats if cache else 'NOT_CHECKED (no --cache)',
        'mismatches': mismatches,
        'verdict': 'PASS' if not mismatches and all(delta_ok.values()) and (not cache or not src_stats['missing']) else 'FAIL',
    }
    pathlib.Path(a.out).write_text(json.dumps(report, indent=1) + '\n')
    print(json.dumps({'verdict': report['verdict'], 'qualifiedAmongBound': report['qualifiedAmongBound'], 'delta': delta_ok,
                      'sources': src_stats if cache else None, 'mismatches': mismatches}, indent=1))


if __name__ == '__main__':
    main()
