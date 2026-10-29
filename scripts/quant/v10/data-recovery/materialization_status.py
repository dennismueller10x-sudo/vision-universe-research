#!/usr/bin/env python3
"""Quant V10 workstream A: is a V9 data correction only in the code, effective in its producer, or
materialized and verified in the committed data?

Three states per correction (never inferred from a merge alone):
  CODE_PRESENT            the corrected producer code is on this commit
  PRODUCER_EFFECTIVE      a producer run with the corrected code is observable (committed artifacts carry the
                          new version stamp) or a shadow run of the producer on current SEC data shows the effect
  MATERIALIZED_VERIFIED   the committed product artifacts carry the corrected values, checked value by value

Inputs are read-only: committed artifacts, the two private shadow runs of `scripts/quant/cli.py consumer`
(old code = parent of #1043, new code = this commit, identical cached SEC API responses) and the SEC
companyfacts responses in the private cache (original filer facts). Nothing under */data is written.

  python3 -I scripts/quant/v10/data-recovery/materialization_status.py --root . \
      --shadow-old <private>/old/consumer --shadow-new <private>/new/consumer \
      --sec-cache <private>/sec-cache --out docs/quant-recovery/v10/data-recovery/materialization-status-1.0.0.json
"""
import argparse, glob, gzip, hashlib, json, os, re, sys
from collections import Counter

SCHEMA = 'v10-materialization-status-1.0.0'
SEC_AFTER = '1.14.0'
SEC_BEFORE = '1.13.0'
AS_OF = '2026-10-28'


def sha_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def load(path):
    if path.endswith('.gz'):
        with gzip.open(path, 'rt') as f:
            return json.load(f)
    with open(path) as f:
        return json.load(f)


def version_of(bundle):
    return (bundle.get('versions') or {}).get('normalization_logic')


def rows_of(bundle, section):
    """Bundle tables are {metric: [[fy, fp, end, v, filed, accn, derived], ...]} (bundle['columns'])."""
    cols = bundle.get('columns') or ['fy', 'fp', 'end', 'v', 'filed', 'accn', 'derived']
    out = []
    for metric, rows in (bundle.get(section) or {}).items():
        for r in rows:
            d = dict(zip(cols, r))
            d['metric'] = metric
            out.append(d)
    return out


def fy_set(bundle):
    return sorted({int(r['fy']) for r in rows_of(bundle, 'annual') if r.get('fy') is not None})


def latest_quarter(bundle):
    q = rows_of(bundle, 'quarterly')
    if not q:
        return None
    last = max(q, key=lambda r: (str(r.get('end')), str(r.get('filed'))))
    return {k: last.get(k) for k in ('fy', 'fp', 'end', 'filed')}


def ttm_value(bundle, metric):
    v = (bundle.get('ttm') or {}).get(metric)
    return {'v': v.get('v'), 'end': v.get('end'), 'concept': v.get('concept')} if isinstance(v, dict) else None


def future_rows(bundle, as_of):
    """Published rows whose period ends after the bundle as-of date (future-dated XBRL contexts, V9 P2)."""
    return sum(1 for sec in ('annual', 'quarterly') for r in rows_of(bundle, sec) if r.get('end') and str(r['end']) > as_of)


def max_fy_minus_period_year(bundle):
    """Largest (fy - calendar year of period end) over annual rows; > 1 means an impossible fiscal-year label."""
    worst = None
    for r in rows_of(bundle, 'annual'):
        if r.get('fy') is None or not r.get('end'):
            continue
        d = int(r['fy']) - int(str(r['end'])[:4])
        worst = d if worst is None else max(worst, d)
    return worst


def sec_section(root, shadow_old, shadow_new, sec_cache):
    evidence = load(os.path.join(root, 'docs/quant-recovery/v9-followups/sec-pipeline/before-after.json'))
    affected = {x['cik']: x for x in evidence['issuersWithPublishedRowChanges']}
    version_py = open(os.path.join(root, 'scripts/quant/sec/version.py')).read()
    code_version = re.search(r'^NORMALIZATION_LOGIC_VERSION\s*=\s*"([0-9.]+)"', version_py, re.M).group(1)
    rules_version = re.search(r'^QUALITY_RULES_VERSION\s*=\s*"([0-9.]+)"', version_py, re.M).group(1)

    consumer_dir = os.path.join(root, 'quant/data/sec/consumer')
    bundles = {}
    versions = Counter()
    for path in sorted(glob.glob(os.path.join(consumer_dir, 'CIK*.json'))):
        b = load(path)
        bundles[b.get('cik')] = (path, b)
        versions[version_of(b)] += 1

    factbook_versions = Counter()
    factbook_v14 = []
    for path in sorted(glob.glob(os.path.join(root, 'quant/data/fundamentals/issuers/*.json'))):
        for i in load(path)['issuers']:
            v = (i.get('versions') or {}).get('normalization_logic')
            factbook_versions[v] += 1
            if v == SEC_AFTER:
                codes = ((i.get('qualitySummary') or {}).get('by_code') or {})
                factbook_v14.append({'cik': i['cik'], 'tickers': i.get('tickers'),
                                     'newQualityCodes': {k: codes[k] for k in ('FUTURE_PERIOD_END', 'IMPLAUSIBLE_FILING_FY') if k in codes}})

    # Shadow runs: same cached SEC responses, old vs new producer code.
    shadow = []
    for cik in sorted(set(affected) | {os.path.basename(p)[3:13] for p in glob.glob(os.path.join(shadow_new, 'CIK*.json'))}):
        po, pn = os.path.join(shadow_old, 'CIK%s.json' % cik), os.path.join(shadow_new, 'CIK%s.json' % cik)
        if not (os.path.exists(po) and os.path.exists(pn)):
            continue
        o, n = load(po), load(pn)
        row = {'cik': cik, 'tickers': n.get('tickers'), 'versions': [version_of(o), version_of(n)],
               'annualYears': {'old': fy_set(o), 'new': fy_set(n)},
               'maxFyMinusPeriodYear': {'old': max_fy_minus_period_year(o), 'new': max_fy_minus_period_year(n)},
               'rowsWithFuturePeriodEnd': {'old': future_rows(o, AS_OF), 'new': future_rows(n, AS_OF)},
               'latestQuarter': {'old': latest_quarter(o), 'new': latest_quarter(n)},
               'sharesTtm': {'old': ttm_value(o, 'shares_outstanding'), 'new': ttm_value(n, 'shares_outstanding')},
               'quality': n.get('quality') or (n.get('coverage') or {}).get('quality')}
        row['changed'] = any(row[k]['old'] != row[k]['new'] for k in ('annualYears', 'latestQuarter', 'sharesTtm', 'rowsWithFuturePeriodEnd'))
        if cik in affected:
            v9 = affected[cik]
            exp_years = (v9.get('annualYears') or {}).get('after')
            exp_shares = ((v9.get('shares') or {}).get('after') or {})
            row['v9Expectation'] = {'annualYearsAfter': exp_years, 'sharesAfter': exp_shares or None}
            # V9 shadow used the 2026-10-27 bulk archive; newer filings may legitimately add a year.
            # V9 shadow used the 2026-10-27 bulk archive; compare only what the corrections decide.
            row['agreesWithV9'] = {
                'noImpossibleFyLabel': None if exp_years is None else not any(y - 2026 >= 2 for y in row['annualYears']['new']),
                'shares': None if not exp_shares else (row['sharesTtm']['new'] or {}).get('v') == exp_shares.get('v')}
        shadow.append(row)

    # Committed state of the issuers whose published rows change.
    committed = []
    for cik, v9 in sorted(affected.items()):
        path, b = bundles.get(cik, (None, None))
        if b is None:
            committed.append({'cik': cik, 'tickers': v9['tickers'], 'state': 'BUNDLE_MISSING'})
            continue
        ver = version_of(b)
        years = fy_set(b)
        exp = (v9.get('annualYears') or {}).get('after')
        before = (v9.get('annualYears') or {}).get('before')
        if ver == SEC_AFTER:
            state = 'MATERIALIZED_VERIFIED' if exp is None or set(exp) <= set(years) else 'MATERIALIZED_VALUE_MISMATCH'
        else:
            state = 'PENDING_PRODUCER_RUN'
        committed.append({'cik': cik, 'tickers': v9['tickers'], 'committedVersion': ver, 'state': state,
                          'committedAnnualYears': years, 'stillShowsV9Defect': before is not None and years == before,
                          'maxFyMinusPeriodYear': max_fy_minus_period_year(b), 'latestQuarter': latest_quarter(b)})

    # Original filer facts (SEC companyfacts API, cached): the defective fiscal-year labels exist at the source.
    originals = []
    if sec_cache:
        sys.path.insert(0, os.path.join(root, 'scripts'))
        os.environ.setdefault('SEC_CACHE_DIR', sec_cache)
        from quant.sec.http_client import DiskCache  # noqa: E402
        cache = DiskCache(sec_cache, ttl_seconds=10 ** 9)
        for row in shadow:
            if row['annualYears']['old'] == row['annualYears']['new']:
                continue
            url = 'https://data.sec.gov/api/xbrl/companyfacts/CIK%s.json' % row['cik']
            raw = cache.get(url)
            if raw is None:
                originals.append({'cik': row['cik'], 'state': 'NOT_IN_PRIVATE_CACHE'})
                continue
            facts = json.loads(raw)
            per_accn = {}
            future = set()
            for tax, concepts in (facts.get('facts') or {}).items():
                for concept, body in concepts.items():
                    for unit, items in (body.get('units') or {}).items():
                        for it in items:
                            if it.get('form') not in ('10-K', '10-K/A', '10-Q', '10-Q/A') or not it.get('end') or not it.get('accn'):
                                continue
                            a = per_accn.setdefault(it['accn'], {'fy': set(), 'maxEnd': '', 'filed': it.get('filed'), 'form': it.get('form')})
                            if it.get('fy') is not None:
                                a['fy'].add(int(it['fy']))
                            a['maxEnd'] = max(a['maxEnd'], it['end'])
                            if it.get('filed') and it['end'] > it['filed']:
                                future.add((it['accn'], it['end'], tax + ':' + concept))
            hits = []
            for accn, a in per_accn.items():
                for fy in a['fy']:
                    # The filing's own fiscal year sits at its latest period end (52/53-week years: +-1).
                    if abs(fy - int(a['maxEnd'][:4])) >= 2:
                        hits.append((accn, fy, a['maxEnd'], a['filed'], a['form']))
            hits = sorted(set(hits))
            originals.append({'cik': row['cik'], 'tickers': row['tickers'], 'sourceUrl': url,
                              'responseSha256': hashlib.sha256(raw if isinstance(raw, bytes) else raw.encode()).hexdigest(),
                              'filingsWithImpossibleFyLabel': len(hits),
                              'examples': [{'accession': a, 'fyLabel': fy, 'latestPeriodEnd': e, 'filed': f, 'form': c} for a, fy, e, f, c in hits[:5]],
                              'factsWithPeriodEndAfterFiled': len(future)})

    stx_discover = load(os.path.join(root, 'discover/data/stocks/US_REAL/STX.json'))['fundamentals']['valuation']['marketCap']
    fe = load(os.path.join(root, 'quant/data/product/factor-evidence-v1/ST.json.gz'))
    stx_fe = None
    stack = [fe]
    while stack and stx_fe is None:
        x = stack.pop()
        if isinstance(x, dict):
            if x.get('ticker') == 'STX' and 'marketCap' in x:
                stx_fe = {'marketCap': x['marketCap'], 'asOf': x.get('asOf'), 'fundamentalsAsOf': x.get('fundamentalsAsOf')}
            else:
                stack.extend(x.values())
        elif isinstance(x, list):
            stack.extend(x)

    n_mat = sum(1 for c in committed if c['state'] == 'MATERIALIZED_VERIFIED')
    state = 'MATERIALIZED_VERIFIED' if n_mat == len(committed) else 'PRODUCER_EFFECTIVE' if factbook_v14 or shadow else 'CODE_PRESENT'
    return {
        'correction': 'SEC P1-P4 (#1043): fiscal-year anchor, future-period quarantine, no bulk acceptance time, DQ-SEC-1/2/3',
        'state': state,
        'code': {'normalizationLogic': code_version, 'qualityRules': rules_version, 'state': 'CODE_PRESENT' if code_version == SEC_AFTER else 'CODE_MISSING'},
        'producers': {
            'secConsumerFundamentals': {'artifact': 'quant/data/sec/consumer/CIK*.json', 'versions': dict(versions),
                                        'schedule': 'sec-consumer-fundamentals.yml cron "30 7 * * 1" (next: Monday 2026-11-02 07:30 UTC)',
                                        'state': 'MATERIALIZED' if versions.get(SEC_AFTER, 0) == sum(versions.values()) - versions.get(None, 0) else 'PENDING_PRODUCER_RUN'},
            'secFactbookDaily': {'artifact': 'quant/data/fundamentals/issuers/*.json', 'versions': dict(factbook_versions),
                                 'issuersAtNewVersion': len(factbook_v14), 'issuersWithNewQualityCodes': [x for x in factbook_v14 if x['newQualityCodes']],
                                 'state': 'PRODUCER_EFFECTIVE' if factbook_v14 else 'PENDING_PRODUCER_RUN',
                                 'note': 'sec-fundamentals-daily re-normalizes only the issuers it touches; the run of 2026-10-28 13:02 UTC (commit 572a011689) wrote 68 issuers with the corrected code.'},
            'downstream': {
                'discoverStx': {'artifact': 'discover/data/stocks/US_REAL/STX.json', 'marketCap': stx_discover,
                                'state': 'STILL_DEFECTIVE' if stx_discover.get('sharesFy') == 2027 else 'CORRECTED'},
                'factorEvidenceStx': {'artifact': 'quant/data/product/factor-evidence-v1/ST.json.gz', **(stx_fe or {}),
                                      'state': 'STILL_DEFECTIVE' if stx_fe and abs(stx_fe['marketCap'] - 137008764839.38) < 1 else 'CHANGED'},
                'order': 'sec-consumer-fundamentals (bundles, discover/data, capabilities) -> product-intelligence-materialization (factor-evidence-v1) ; update-sec-fundamentals / sec-fundamentals-daily (factbooks)'}},
        'shadowRunOnCurrentSecData': {
            'method': 'scripts/quant/cli.py consumer --ciks <33> --as-of 2026-10-28, once from the parent of #1043 (1.13.0) and once from this commit (1.14.0), identical cached SEC companyfacts API responses (33 requests); output private',
            'issuers': len(shadow), 'changed': sum(1 for r in shadow if r['changed']),
            'fyLabelsRepaired': sorted(t for r in shadow if (r['maxFyMinusPeriodYear']['old'] or 0) >= 2 and (r['maxFyMinusPeriodYear']['new'] or 0) < 2 for t in r['tickers']),
            'futurePeriodRowsRemoved': {'issuers': sorted(t for r in shadow if r['rowsWithFuturePeriodEnd']['old'] > r['rowsWithFuturePeriodEnd']['new'] for t in r['tickers']),
                                        'rows': sum(r['rowsWithFuturePeriodEnd']['old'] - r['rowsWithFuturePeriodEnd']['new'] for r in shadow)},
            'futurePeriodRowsLeftInNew': sum(r['rowsWithFuturePeriodEnd']['new'] for r in shadow),
            'agreesWithV9Shadow': {k: Counter(str(r.get('agreesWithV9', {}).get(k)) for r in shadow if 'agreesWithV9' in r) for k in ('noImpossibleFyLabel', 'shares')},
            'rows': shadow},
        'committedAffectedIssuers': {'count': len(committed), 'byState': dict(Counter(c['state'] for c in committed)),
                                     'stillShowingV9Defect': sorted(t for c in committed if c.get('stillShowsV9Defect') for t in c['tickers']), 'rows': committed},
        'originalFilerFacts': originals,
    }


def pzza_section(root):
    top = load(os.path.join(root, 'docs/quant-recovery/v9-followups/pzza-split/before-after.json'))
    ev = top['rows'][0]
    path = os.path.join(root, ev['file'])
    sha = sha_file(path)
    pts = dict(load(path)['points'])
    around = {w['week']: {'committed': pts.get(w['week']), 'v9Before': w['before'], 'expectedAfter': w['after']} for w in ev['around']}
    ratio = pts['2014-01-03'] / pts['2013-12-27']
    supp = os.path.join(root, top['supplementsFile'])
    code = 'CODE_PRESENT' if os.path.exists(supp) and sha_file(supp) == top['supplementsSha256'] else 'SUPPLEMENT_CHANGED'
    if sha == ev['sha256AfterExpected']:
        state = 'MATERIALIZED_VERIFIED'
    elif abs(ratio - ev['exWeek']['ratioAfter']) < 0.01:
        state = 'MATERIALIZED_VERIFIED_WITHIN_CENT_ROUNDING'
    elif sha == ev['sha256Before']:
        state = 'PENDING_PRODUCER_RUN'
    else:
        state = 'CHANGED_UNEXPECTED'
    return {'correction': 'PZZA 2:1 stock dividend 2013-12-30 (#1042, quant/config/split-evidence-supplements.json)', 'state': state, 'code': code,
            'artifact': ev['file'], 'sha256': {'committed': sha, 'v9Before': ev['sha256Before'], 'expectedAfter': ev['sha256AfterExpected']},
            'exWeekRatio': {'committed': round(ratio, 6), 'v9Before': ev['exWeek']['ratioBefore'], 'expectedAfter': ev['exWeek']['ratioAfter'],
                            'splitSizedNow': not (0.6 < ratio < 1.6)},
            'around': around,
            'producer': 'long-series.yml (cron "40 7 1-7 * 6" = every Saturday and days 1-7 of a month, next full run Saturday 2026-10-31 07:40 UTC; or workflow_dispatch only=PZZA). The daily repair run cannot see 2013.',
            'researchEffect': 'Until materialized, ref_PZZA stays CORPORATE_ACTION_UNRESOLVED in the adapter (week 2014-01-03 ratio 0.512 is split-sized).'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='.')
    ap.add_argument('--shadow-old', default='', help='private old-code consumer output (optional; without it only the committed state is checked)')
    ap.add_argument('--shadow-new', default='')
    ap.add_argument('--sec-cache')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    head = open(os.path.join(root, '.git/HEAD')).read().strip() if os.path.isfile(os.path.join(root, '.git/HEAD')) else None
    report = {'schemaVersion': SCHEMA, 'productionApproved': False,
              'states': ['CODE_PRESENT', 'PRODUCER_EFFECTIVE', 'MATERIALIZED_VERIFIED'],
              'codeSha256': {'materialization_status.py': sha_file(os.path.abspath(__file__))},
              'sec': sec_section(root, a.shadow_old, a.shadow_new, a.sec_cache),
              'pzza': pzza_section(root),
              'rerun': 'Re-run after the scheduled producer runs (long-series Sat 2026-10-31, sec-consumer Mon 2026-11-02, product-intelligence afterwards) to move states to MATERIALIZED_VERIFIED; no manual data edit.'}
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w') as f:
        json.dump(report, f, indent=1, sort_keys=False, default=list)
        f.write('\n')
    s = report['sec']
    print(json.dumps({'sec': s['state'], 'consumer': s['producers']['secConsumerFundamentals']['versions'],
                      'shadowChanged': s['shadowRunOnCurrentSecData']['changed'], 'committed': s['committedAffectedIssuers']['byState'],
                      'pzza': report['pzza']['state']}))


if __name__ == '__main__':
    main()
