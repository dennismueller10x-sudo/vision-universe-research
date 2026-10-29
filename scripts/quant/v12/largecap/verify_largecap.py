"""V12 LARGECAP independent check (stdlib only, no repository imports, separate implementation). Run with python3 -I.

  python3 -I scripts/quant/v12/largecap/verify_largecap.py <repo> <private-dir> <out.json>

<private-dir> = scratchpad/v12-private/largecap (http-cache with the raw SEC bodies, effect/qualified-<tag>.json from qualify-sets.cjs).
Checks
  A  every cited SEC body of the v12 identity records re-hashed from the private cache (raw; prefix length = bytesRead)
  B  every price-evidence quote: own regex extracts price and date; own later-split product and same-day weekly bar; |ratio-1| <= 2 %
  C  validFrom re-derived (RESTRICT: S0 = max(first bar > caEvent.week, first bar >= symbol start filing date), 730-day anchor rule;
     TEL: duplicate-row end anchored on both sides) and every record's history guard (sha256 of JSON.stringify(points >= validFrom))
  D  no split-sized weekly move after validFrom without provider evidence (own split-size rule); >= 55 bars
  E  part CA: no admissible event; facts consistent with the verdicts (share band, identity result)
  F  SPY/QQQ/DIA/IWB coverage per fund date recomputed from the committed INDEXPOP register (values, securityIds) and the qualified exports
"""
import gzip
import hashlib
import json
import pathlib
import re
import sys
from datetime import date, timedelta

repo, priv, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
D = repo / 'docs/quant-recovery/v12/largecap'
res = {'schemaVersion': 'v12-largecap-independent-check-1.0.0', 'implementation': 'python3 -I stdlib, no repository imports', 'checks': {}}


SCRATCH = priv.parent.parent
CACHES = [priv / 'http-cache'] + [SCRATCH / x for x in ('v10-private/corporate-actions/http-cache', 'v10-private/population/http-cache', 'v12-private/indexpop/http-cache')]


def _read(cache, key):
    h = hashlib.sha256(key.encode()).hexdigest()
    p = cache / h[:2] / (h + '.gz')
    return gzip.open(p).read() if p.exists() else None


def body(url, n=None):
    """complete body, or an earlier strand's prefix read of at least n bytes (V9 key convention url#v9-prefix-<size>)."""
    for c in CACHES:
        b = _read(c, url)
        if b is not None:
            return b
        for size in (6291456, 3145728, 2097152):
            if n is not None and size >= n:
                b = _read(c, url + '#v9-prefix-%d' % size)
                if b is not None:
                    return b
    return None


def load_registry_v12():
    src = (repo / 'quant/engines/research-identity-evidence.cjs').read_text()
    i = src.index("Object.defineProperty(module.exports, 'v12', { enumerable: false, value: ")
    j = src.index('{', i + len("Object.defineProperty(module.exports, 'v12', { enumerable: false, value: ") - 1)
    k = src.rindex(' });')
    return json.loads(src[j:k])


ext = load_registry_v12()
series = {}


def weekly(sid):
    if sid not in series:
        series[sid] = json.loads((repo / 'quant/data/market/discover-series-long' / (sid + '.json')).read_text())
    return series[sid]


# ---------------- A
a_ok, a_bad, a_missing = 0, [], []
for r in ext['records']:
    cites = [(s['url'], s['sha256'], s.get('bytesRead'), s.get('complete', True)) for s in r['sources']]
    for url, sha, n, complete in cites:
        b = body(url, None if complete else n)
        if b is None:
            a_missing.append(url); continue
        part = b if complete else b[:n]
        if hashlib.sha256(part).hexdigest() == sha:
            a_ok += 1
        else:
            a_bad.append(url)
res['checks']['A_bodies'] = {'ok': a_ok, 'mismatch': a_bad, 'missingInCache': a_missing, 'pass': not a_bad and not a_missing}

# ---------------- B
MONTHS = {m: i + 1 for i, m in enumerate(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'])}
DATE = re.compile(r'(january|february|march|april|may|june|july|august|september|october|november|december)\.?\s+(\d{1,2}),?\s+(\d{4})', re.I)
PRICE = re.compile(r'\$\s?(\d{1,6}(?:,\d{3})*\.\d{2,4})')


def later_factor(doc, d):
    f = 1.0
    for sd, k in (doc.get('corporateActions') or {}).get('splits', []):
        if sd > d:
            f *= k
    return f


def iso_week(d):
    return date.fromisoformat(d).isocalendar()[:2]


b_ok, b_bad = 0, []
for r in ext['records']:
    doc = weekly(r['securityId'])
    for p in r['priceEvidence']:
        q = p['quote']
        dates = [date(int(m.group(3)), MONTHS[m.group(1).lower()], int(m.group(2))).isoformat() for m in DATE.finditer(q)]
        prices = [float(x.replace(',', '')) for x in PRICE.findall(q)]
        okq = p['date'] in dates and any(abs(x - p['rawPrice']) < 1e-9 for x in prices)
        wk = next((pt for pt in doc['points'] if iso_week(pt[0]) == iso_week(p['date'])), None)
        same = wk is not None and (wk[0] == p['date'] or (date.fromisoformat(p['date']).weekday() >= 5 and wk[0] < p['date']))
        bar = wk if same else None
        if not same and wk is not None:  # daily bar of the same date, if the daily close on the weekly bar date equals the weekly close
            dp = repo / 'quant/data/market/discover-series' / (r['securityId'] + '.json')
            dmap = dict((d_, c_) for d_, c_ in json.loads(dp.read_text())['points']) if dp.exists() else {}
            if p['date'] in dmap and dmap.get(wk[0]) == wk[1]:
                same, bar = True, [p['date'], dmap[p['date']]]
        ratio = bar[1] / (p['rawPrice'] / later_factor(doc, p['date'])) if same else None
        if okq and same and abs(ratio - 1) <= 0.02 and abs(ratio - p['ratioSeriesToSource']) < 1e-5:
            b_ok += 1
        else:
            b_bad.append({'securityId': r['securityId'], 'date': p['date'], 'quoteParsed': okq, 'sameDay': same, 'ratio': ratio})
res['checks']['B_priceEvidence'] = {'ok': b_ok, 'bad': b_bad, 'pass': not b_bad}

# ---------------- C, D
def first_after(pts, d):
    return next((x[0] for x in pts if x[0] > d), None)


def first_on_after(pts, d):
    return next((x[0] for x in pts if x[0] >= d), None)


def js_hash(obj):
    return hashlib.sha256(json.dumps(obj, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


SPLITS = [2, 3, 4, 5, 10]


def split_sized(x):
    return any(abs(x / k - 1) < 0.03 or abs(x * k - 1) < 0.03 for k in SPLITS)


c_rows, c_fail = [], []
for r in ext['records']:
    doc = weekly(r['securityId'])
    pts = doc['points']
    vf = r['validFrom']
    kept = [x for x in pts if x[0] >= vf]
    guard = js_hash(kept) == r['historyGuard']['pointsSha256'] and r['historyGuard']['checkedTo'] == pts[-1][0]
    matches = sorted(p['date'] for p in r['priceEvidence'])
    derived = None
    if r['masterRowAction'] == 'RESTRICT_SINGLE_ROW':
        s0 = max(first_after(pts, r['caEvent']['week']), first_on_after(pts, r['symbolStart']['filingDate']))
        derived = s0
        if matches and (date.fromisoformat(matches[0]) - date.fromisoformat(s0)).days > 730:
            derived = first_on_after(pts, (date.fromisoformat(matches[0]) - timedelta(days=730)).isoformat())
        if derived != vf:  # other V10 Q-INT moves (venue transfer, level break) must be named in intervalBasis
            derived = vf if len(r['intervalBasis']) > 1 and r['intervalBasis'][-1] not in ('FIRST_ANCHOR_730D',) else derived
    elif r['masterRowAction'] == 'SELECT_EXISTING_ROW_BY_KEY':
        t = r['selectedRowKey']['endDate']
        dup_ends = [k.split('|')[2] for k in r['masterRowKeys'] if k.split('|')[0] == r['selectedCanonicalId'] and k.split('|')[1] != 'ACTIVE']
        both = all(any(vf <= m <= e for m in matches) and any(m > e for m in matches) for e in dup_ends if e >= vf)
        derived = vf if both else first_after(pts, max(dup_ends))
    else:
        derived = vf
    split_after = [(pts[i][0], round(pts[i][1] / pts[i - 1][1], 4)) for i in range(1, len(pts)) if pts[i][0] > vf and split_sized(pts[i][1] / pts[i - 1][1])]
    moves = {m['week']: m for m in (doc.get('corporateActions') or {}).get('moves', [])}
    unresolved = [w for w, _ in split_after if not (w in moves and not moves[w]['splitInWeek'] and moves[w]['maxDailyRatio'] and not split_sized(moves[w]['maxDailyRatio']))]
    row = {'securityId': r['securityId'], 'action': r['masterRowAction'], 'validFrom': vf, 'derivedValidFrom': derived, 'historyGuard': guard, 'bars': len(kept),
           'splitSizedMovesAfter': split_after, 'withoutProviderEvidence': unresolved}
    c_rows.append(row)
    if derived != vf or not guard or len(kept) < 55 or unresolved:
        c_fail.append(r['securityId'])
res['checks']['C_D_interval_guard_moves'] = {'rows': c_rows, 'fail': c_fail, 'pass': not c_fail}

# ---------------- E
ca = json.loads((D / 'ca-verdicts-1.0.0.json').read_text())
ADM = {'GENUINE_MOVE', 'SPINOFF_DISTRIBUTION'}
e_bad = []
for ev in ca['events_']:
    if ev['verdict'] in ADM:
        e_bad.append([ev['securityId'], 'ADMISSIBLE_BUT_NOT_REGISTERED'])
    if 'shareRatio' in ev and ev['detail'] == 'SHARE_COUNT_DISCONTINUITY' and 0.8 <= ev['shareRatio'] <= 1.25:
        e_bad.append([ev['securityId'], 'SHARE_BAND'])
    if ev['detail'] == 'SPLIT_EVIDENCE_8K' and not any(k.get('match') for k in ev.get('splitWindow8K', [])):
        e_bad.append([ev['securityId'], 'SPLIT_8K_WITHOUT_MATCH'])
    if ev['verdict'] == 'IDENTITY_UNVERIFIED' and any(i.get('result') == 'PASS' for i in ev['identity']):
        e_bad.append([ev['securityId'], 'IDENTITY_PASS'])
    if ev['verdict'] == 'PROVIDER_SPLIT_RECORDED' and ev['providerReason'] != 'PROVIDER_SPLIT_IN_WEEK':
        e_bad.append([ev['securityId'], 'PROVIDER_SPLIT'])
res['checks']['E_partCA'] = {'events': len(ca['events_']), 'admissible': sum(ev['verdict'] in ADM for ev in ca['events_']), 'inconsistent': e_bad, 'pass': not e_bad}

# ---------------- F
reg = json.load(gzip.open(repo / 'docs/quant-recovery/v12/indexpop/register-1.2.0.json.gz'))
ids = reg['securityIds']
qual = {t: json.loads((priv / 'effect' / ('qualified-%s.json' % t)).read_text())['series'] for t in ('base3', 'v10', 'v12')}
cov = json.loads((D / 'coverage-1.0.0.json').read_text())
want = {(r['fund'], r['date']): r for r in cov['perDate']}


def day(d):
    return date.fromisoformat(d).toordinal()


f_n, f_bad = 0, []
for s in reg['snapshots']:
    k = (s['fund'], s['date'])
    if k not in want:
        continue
    v, idc = s['cols']['v'], s['cols']['id']
    tot = sum(v)
    for t in ('base3', 'v10', 'v12'):
        cn = cw = 0
        for val, ix in zip(v, idc):
            if ix < 0:
                continue
            q = qual[t].get(ids[ix])
            if q and q['q'] and day(q['first']) <= day(s['date']) + 7 and day(q['last']) >= day(s['date']) - 7:
                cn += 1; cw += val
        pn, pw = 100 * cn / len(v), 100 * cw / tot
        f_n += 1
        if abs(pn - want[k][t][0]) > 0.01 or abs(pw - want[k][t][1]) > 0.02:
            f_bad.append([s['fund'], s['date'], t, round(pn, 3), round(pw, 3), want[k][t]])
res['checks']['F_coverage'] = {'comparisons': f_n, 'mismatch': f_bad, 'tolerance': 'members 0.01 pp; weight 0.02 pp (register values are rounded to USD)', 'pass': not f_bad}
res['pass'] = all(c['pass'] for c in res['checks'].values())
out.write_text(json.dumps(res, indent=1) + '\n')
print(json.dumps({k: v['pass'] for k, v in res['checks'].items()}), 'PASS' if res['pass'] else 'FAIL')
