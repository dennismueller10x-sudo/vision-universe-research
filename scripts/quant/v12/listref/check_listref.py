"""V12 LISTREF independent check (stdlib only; run with python3 -I).

Second implementation, written separately from build_reference.cjs/reflib.cjs, that rebuilds from RAW inputs:
  - Tiingo supported_tickers.zip (read through zipfile, not the extracted CSV)
  - EDGAR full-index form.gz bodies straight from the private HTTP caches (own parser)
  - EDGAR full-text-search bodies straight from the private HTTP cache (own URL construction and parsing)
  - holdings export, SEC ticker map, V10 registers, public float extract
and compares with the committed outputs: reference/chain/reuse counts, CIK link per chain, effective ends, the
year x {all, exchange} coverage matrix, EDGAR event counts and completeness bounds, reason counts and P4 readiness.

    python3 -I scripts/quant/v12/listref/check_listref.py --out docs/quant-recovery/v12/listref/independent-check-1.0.2.json
"""
import argparse
import collections
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import os
import pathlib
import re
import sys
import urllib.parse
import zipfile

HERE = pathlib.Path(os.path.abspath(__file__)).parent
ROOT = HERE.parents[3]
SCRATCH = pathlib.Path(os.environ.get('V12_SCRATCH', '/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad'))
PRIV = SCRATCH / 'v12-private' / 'listref'
CACHES = [PRIV / 'http-cache', SCRATCH / 'v10-private' / 'population' / 'http-cache', SCRATCH / 'v10-private' / 'corporate-actions' / 'http-cache']
DOCS = ROOT / 'docs' / 'quant-recovery' / 'v12' / 'listref'
YEARS = range(1995, 2027)
ENDED_BEFORE = dt.date(2026, 9, 28)
FTS_FORMS = '8-K,10-K,10-Q,DEF 14A,S-1,424B4,20-F,6-K,F-1'
D = dt.date.fromisoformat


def cached(url):
    h = hashlib.sha256(url.encode()).hexdigest()
    for c in CACHES:
        p = c / h[:2] / (h + '.gz')
        if p.exists():
            return gzip.decompress(p.read_bytes())
    return None


def q(s):
    return urllib.parse.quote(s, safe="-_.!~*'()")


def fts_url(ticker, lo, hi, cik=None):
    u = 'https://efts.sec.gov/LATEST/search-index?q=' + q('"%s"' % ticker.replace('-', '.'))
    if cik:
        u += '&ciks=%010d' % int(cik)
    return u + '&forms=' + q(FTS_FORMS) + '&dateRange=custom&startdt=%s&enddt=%s' % (lo, hi)


def plus(d, n):
    return (D(d) + dt.timedelta(days=n)).isoformat()


# ---------------- symbol rule (own formulation) ----------------
BAD5 = set('WURPONMVYFGHIT')


def common_symbol(t, exch):
    if re.fullmatch(r'[A-Z]{1,4}', t) or re.fullmatch(r'[A-Z]{1,4}-[ABC]', t):
        return True
    if re.fullmatch(r'[A-Z]{5}', t):
        return exch == 'NASDAQ' and t[4] not in BAD5
    return False


# ---------------- affinity (own formulation) ----------------
LEGAL = {'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED', 'PLC', 'LP', 'LLC', 'L', 'P', 'THE', 'NEW', 'DEL', 'DE', 'SA', 'NV', 'AG', 'SE', 'NA'}


def words(name):
    s = re.sub(r'/[A-Z]{2,3}/?', ' ', name.upper()).replace('&', ' AND ')
    s = re.sub(r'[^A-Z0-9 ]+', ' ', s)
    w = s.split()
    sig = [x for x in w if x not in LEGAL and x not in ('AND', 'OF')] or w
    allw = [x for x in w if x not in ('THE', 'AND', 'OF')] or w
    return sig, allw


def subseq(t, s):
    it = iter(s)
    return all(ch in it for ch in t)


def segments(t, ws):
    # can t be written as prefixes of words with increasing index, first piece from ws[0]?
    from functools import lru_cache

    @lru_cache(maxsize=None)
    def f(i, j, first):
        if i == len(t):
            return True
        rng = [0] if first else range(j, len(ws))
        for k in rng:
            if k >= len(ws):
                break
            w = ws[k]
            n = 0
            while n < len(w) and i + n < len(t) and w[n] == t[i + n]:
                n += 1
                if f(i + n, k + 1, False):
                    return True
        return False
    return f(0, 0, True) if ws else False


def affinity(ticker, name):
    t = re.sub(r'[^A-Z]', '', re.sub(r'-[ABC]$', '', ticker.upper()))
    sig, allw = words(name)
    if not t or not sig:
        return 0
    if segments(t, tuple(sig)) or segments(t, tuple(allw)):
        return 3
    if len(t) >= 3 and t[0] == sig[0][0] and subseq(t, sig[0]):
        return 3
    if t[0] == sig[0][0] and subseq(t, ''.join(sig)):
        return 2
    return 1 if subseq(t, ''.join(allw)) else 0


def size_class(v):
    if v is None or v <= 0 or v > 5e12:
        return 'UNKNOWN'
    return 'MEGA_LARGE' if v >= 1e10 else 'MID' if v >= 2e9 else 'SMALL' if v >= 3e8 else 'MICRO'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    out = {'schemaVersion': 'v12-listref-independent-check-1.0.2', 'implementation': 'python3 -I stdlib, separate code', 'checks': {}, 'mismatches': {}}
    chk, mis = out['checks'], out['mismatches']

    def compare(name, mine, theirs, sample=None):
        ok = mine == theirs
        chk[name] = 'MATCH' if ok else 'MISMATCH'
        if not ok:
            mis[name] = sample if sample is not None else {'independent': mine, 'primary': theirs}

    summary = json.loads((DOCS / 'reference-summary-1.0.2.json').read_text())
    # ---------- reference rows from the raw zip ----------
    with zipfile.ZipFile(PRIV / 'raw' / 'tiingo' / 'supported_tickers.zip') as z:
        text = z.read('supported_tickers.csv').decode('utf-8')
    allrows = list(csv.DictReader(io.StringIO(text)))
    us = [r for r in allrows if r['assetType'] == 'Stock' and r['exchange'] in ('NYSE', 'NASDAQ', 'NYSE MKT', 'AMEX') and r['priceCurrency'] == 'USD' and r['startDate'] and r['endDate']]
    ref = [r for r in us if common_symbol(r['ticker'], r['exchange'])]
    compare('tiingoRows', len(allrows), summary['counts']['tiingoRows'])
    compare('usExchangeStockUsdRows', len(us), summary['counts']['usExchangeStockUsdRows'])
    compare('referenceRows', len(ref), summary['counts']['referenceRows'])
    # chains
    by = collections.defaultdict(list)
    for r in ref:
        by[r['ticker']].append(r)
    chains = []
    restart = gap = 0
    for t, lst in by.items():
        lst.sort(key=lambda r: r['startDate'])
        cur = None
        for r in lst:
            if cur is not None and (D(r['startDate']) - D(cur['end'])).days <= 5:
                restart += 1
                cur['rows'].append('tiingo:%s:%s:%s' % (r['exchange'], t, r['startDate']))
                cur['end'] = max(cur['end'], r['endDate'])
                cur['exchange'] = r['exchange']
                continue
            if cur is not None:
                gap += 1
            cur = {'ticker': t, 'exchange': r['exchange'], 'start': r['startDate'], 'end': r['endDate'], 'rows': ['tiingo:%s:%s:%s' % (r['exchange'], t, r['startDate'])]}
            chains.append(cur)
        for i, c in enumerate([c for c in chains if c['ticker'] == t]):
            pass
    latest = {}
    for c in chains:
        if c['ticker'] not in latest or c['start'] > latest[c['ticker']]['start']:
            latest[c['ticker']] = c
    compare('chains', len(chains), summary['counts']['referenceChains'])
    compare('adjacentRestartPairs', restart, summary['tickerReuse']['adjacentRestartPairs'])
    compare('reuseGapPairs', gap, summary['tickerReuse']['reuseGapPairs'])
    # ---------- EDGAR index (raw bodies, own parser) ----------
    man = json.loads((PRIV / 'work' / 'edgar-index-manifest.json').read_text())
    events = []
    annual = collections.defaultdict(set)
    ann_forms = {'10-K': 'D', '10-K405': 'D', '10-KT': 'D', '10-K405T': 'D', '10-KSB': 'D', '10-KSB40': 'D', '10KSB': 'D', '10KSB40': 'D', '10-KSB405': 'D', '20-F': 'F', '40-F': 'F'}
    keep = {'25', '25-NSE', '15-12B', '15-12G', '15-15D', 'DEFM14A', 'DEFM14C', 'PREM14A', 'SC 14D9', 'SC TO-T', 'SC 13E3', '8-A12B', '8-A12G'}
    raw_hash_ok = 0
    for f in man['files']:
        body = cached(f['url'])
        if body is None:
            mis.setdefault('indexBodiesMissing', []).append(f['url'])
            continue
        if hashlib.sha256(body).hexdigest() == f['sha256']:
            raw_hash_ok += 1
        txt = gzip.decompress(body).decode('latin-1') if body[:2] == b'\x1f\x8b' else body.decode('latin-1')
        lines = txt.split('\n')
        start = next(i for i, l in enumerate(lines) if l.startswith('-----')) + 1
        for l in lines[start:]:
            parts = l.split()
            if len(parts) < 5 or not parts[-1].startswith('edgar/'):
                continue
            date, cik = parts[-2], str(int(parts[-3]))
            if len(date) == 8:
                date = date[:4] + '-' + date[4:6] + '-' + date[6:]
            head = l[:l.find('  ')] if '  ' in l else parts[0]
            form = re.sub(r'\s+/A$', '/A', head.strip())
            if form in ann_forms:
                annual[(int(date[:4]), cik)].add(ann_forms[form])
            if form in keep:
                name = l[len(head):].strip()
                name = re.sub(r'\s+\d+\s+\d{4}-?\d{2}-?\d{2}\s+edgar/\S+\s*$', '', name).strip()
                events.append((form, cik, date, parts[-1], name))
    compare('edgarIndexFilesHashMatch', raw_hash_ok, len(man['files']))
    cikmap = json.loads((ROOT / 'quant' / 'data' / 'universe' / 'cik-map.json').read_text())['byTicker']
    still = {}
    for t, e in cikmap.items():
        c = str(int(e['cik']))
        if c not in still or re.search('NYSE|Nasdaq', e.get('exchange') or ''):
            still[c] = e.get('exchange') or ''
    # ---------- holdings ----------
    hold = json.loads((PRIV / 'work' / 'holdings.json').read_text())
    # ---------- claims from the primary (private reference) ----------
    claims = {}
    with gzip.open(PRIV / 'work' / 'reference-listings.jsonl.gz', 'rt') as fh:
        for line in fh:
            r = json.loads(line)
            claims[r['id']] = r
    compare('chainIdsEqual', sorted(c['rows'][0] for c in chains), sorted(claims))
    # ---------- links, re-derived ----------
    delist = sorted((e for e in events if e[0] in ('25', '25-NSE', '15-12B', '15-12G', '15-15D')), key=lambda e: e[2])
    ddates = [e[2] for e in delist]
    starts = sorted((e for e in events if e[0] in ('8-A12B', '8-A12G')), key=lambda e: e[2])
    sdates = [e[2] for e in starts]
    import bisect

    def window(arr, ds, lo, hi):
        i = bisect.bisect_left(ds, lo)
        while i < len(arr) and ds[i] <= hi:
            yield arr[i]
            i += 1

    def fts(url):
        b = cached(url)
        d = json.loads(b) if b is not None else None
        return d if d is not None and 'hits' in d else None

    sid_canon = collections.defaultdict(list)
    for s in hold['series']:
        for m in s['masterRows']:
            if m.get('baselineMember') is not False:
                sid_canon[s['securityId']].append(m['canonicalId'].replace('tiingo:NYSE MKT:', 'tiingo:AMEX:'))
    v10 = {}
    lc = json.loads((ROOT / 'docs/quant-recovery/v10/population/lifecycle-cases.json').read_text())
    for c in lc['cases']:
        if c.get('cik'):
            for cid in sid_canon.get(c['securityId'], []):
                v10[cid] = str(int(c['cik']))
    ic = json.loads((ROOT / 'docs/quant-recovery/v10/population/identity-cases.json').read_text())
    for c in ic['cases']:
        if c.get('cik') and c.get('selectedCanonicalId'):
            v10[c['selectedCanonicalId'].replace('tiingo:NYSE MKT:', 'tiingo:AMEX:')] = str(int(c['cik']))
    # holdings -> chains
    row2chain = {}
    for c in chains:
        for r in c['rows']:
            row2chain[r.replace('tiingo:NYSE MKT:', 'tiingo:AMEX:')] = c
    for c in chains:
        c['series'] = []
    for s in hold['series']:
        tgt = None
        for cid in sid_canon.get(s['securityId'], []) + ([s['listingId'].replace('tiingo:NYSE MKT:', 'tiingo:AMEX:')] if s.get('listingId') else []):
            if cid in row2chain:
                tgt = row2chain[cid]
                break
        if tgt is None and s.get('rawFirst'):
            cands = [c for c in chains if c['ticker'] == s['ticker'] and (D(min(c['end'], s['rawLast'])) - D(max(c['start'], s['rawFirst']))).days >= 365]
            if len(cands) == 1:
                tgt = cands[0]
        if tgt is not None:
            tgt['series'].append(s)
    # effective end from lifecycle
    for c in chains:
        c['lifecycle'] = False
        for s in c['series']:
            lcy = s.get('lifecycle')
            if lcy and lcy.get('status') == 'DELISTED_SOURCE_VERIFIED' and lcy.get('lastTradeDate'):
                c['lifecycle'] = True
                if lcy['lastTradeDate'] < c['end']:
                    c['end'] = lcy['lastTradeDate']
        c['ended'] = D(c['end']) < ENDED_BEFORE

    def pick(res, allowed, ticker, prefer=None):
        cnt = collections.Counter()
        for h in res.get('hits', {}).get('hits', []):
            for k in h['_source'].get('ciks', []):
                cnt[str(int(k))] += 1
        cands = sorted(((n, k) for k, n in cnt.items() if k in allowed and affinity(ticker, allowed[k][4]) >= 1 and (prefer is None or k == prefer)), reverse=True)
        if not cands or cands[0][0] < 2 or (len(cands) > 1 and cands[1][0] == cands[0][0]):
            return None
        return cands[0][1], allowed[cands[0][1]]

    link_mismatch = []
    grades = collections.Counter()
    missing_fts = 0
    for c in chains:
        t = c['ticker']
        cm = cikmap.get(t.replace('-', '.')) or cikmap.get(t)
        is_latest = latest[t] is c
        frozen = (not c['ended']) and is_latest and (cm is None or cm.get('exchange') == 'OTC')
        link = None
        vv = next((v10[r.replace('tiingo:NYSE MKT:', 'tiingo:AMEX:')] for r in c['rows'] if r.replace('tiingo:NYSE MKT:', 'tiingo:AMEX:') in v10), None)
        if (not c['ended']) and is_latest and cm and cm.get('exchange') != 'OTC':
            link = ('HIGH_CURRENT_MAP', str(int(cm['cik'])))
        elif vv:
            link = ('HIGH_V10_REGISTER', vv)
        if link is None and c['ended']:
            best = {}
            for e in window(delist, ddates, plus(c['end'], -15), plus(c['end'], 120)):
                if not (e[0] in ('25', '25-NSE', '15-12B') or (e[0] == '15-12G' and c['exchange'] == 'NASDAQ' and e[2] < '2007-01-01')):
                    continue
                af = affinity(t, e[4])
                dd = (D(e[2]) - D(c['end'])).days
                cur = best.get(e[1])
                if cur is None or af > cur[0] or (af == cur[0] and abs(dd) < abs(cur[1])):
                    best[e[1]] = (af, dd, e)
            a3 = [v for v in best.values() if v[0] == 3]
            idx = None
            if len(a3) == 1:
                idx = a3[0]
            elif c['start'] > '1995-01-03':
                sc = {e[1] for e in window(starts, sdates, plus(c['start'], -30), plus(c['start'], 10))}
                both = [v for v in best.values() if v[0] >= 2 and v[2][1] in sc]
                if len({v[2][1] for v in both}) == 1:
                    idx = both[0]
            pending = False
            if idx:
                lo = max('2001-01-01', c['start'], plus(c['end'], -3 * 365))
                res = fts(fts_url(t, lo, plus(c['end'], 30), idx[2][1])) if c['end'] >= '2001-01-01' else None
                if c['end'] >= '2001-01-01' and res is None:
                    missing_fts += 1
                    pending = True
                if res and res['hits']['total']['value'] > 0:
                    link = ('MEDIUM_FTS_CONFIRMED', idx[2][1])
            if link is None and c['end'] >= '2002-01-01' and not pending:
                res = fts(fts_url(t, plus(c['end'], -730), plus(c['end'], 30)))
                if res is None:
                    missing_fts += 1
                else:
                    allowed = {}
                    for e in window(delist, ddates, plus(c['end'], -15), plus(c['end'], 120)):
                        allowed.setdefault(e[1], e)
                    p = pick(res, allowed, t)
                    if p:
                        link = ('MEDIUM_FTS_DISCOVERED', p[0])
        if link is None and frozen:
            lo = max('2001-01-01', c['start'], plus(c['end'], -3 * 365))
            res = fts(fts_url(t, lo, c['end']))
            if res is None:
                missing_fts += 1
            else:
                allowed = {}
                for e in window(delist, ddates, c['start'], c['end']):
                    prev = allowed.get(e[1])
                    rank = 0 if e[0] in ('25', '25-NSE') else 1
                    if prev is None or rank < (0 if prev[0] in ('25', '25-NSE') else 1):
                        allowed[e[1]] = e
                p = pick(res, allowed, t, str(int(cm['cik'])) if cm else None)
                if p:
                    link = ('MEDIUM_FTS_DISCOVERED', p[0])
                    if p[1][2] < c['end']:
                        c['end'] = p[1][2]
                        c['ended'] = D(c['end']) < ENDED_BEFORE
        c['link'] = link
        grades[link[0] if link else 'UNLINKED'] += 1
        cl = claims.get(c['rows'][0])
        theirs = (cl['link']['grade'], cl['link'].get('cik')) if cl and cl['link']['grade'] != 'UNLINKED' else None
        if (link and (link[0], link[1])) != theirs or (cl and cl['endDate'] != c['end']):
            link_mismatch.append([c['rows'][0], link, theirs, c['end'], cl['endDate'] if cl else None])
    primary_grades = collections.Counter()
    for k, v in summary['cikLinks'].items():
        primary_grades[k.split(':')[0]] += v
    compare('linkGradeCounts', dict(sorted(grades.items())), dict(sorted(primary_grades.items())))
    compare('linkAndEffectiveEndPerChain', len(link_mismatch), 0, sample={'count': len(link_mismatch), 'first': link_mismatch[:15]})
    out['ftsBodiesMissing'] = missing_fts
    # ---------- coverage matrix: all + exchange ----------
    floats = collections.defaultdict(list)
    with gzip.open(PRIV / 'work' / 'public-float.tsv.gz', 'rt') as fh:
        for line in fh:
            k, end, val, _form, filed, accn = line.rstrip('\n').split('\t')[:6]
            floats[k].append((end, filed, accn, float(val)))
    grp = {'NYSE': 'NYSE', 'NASDAQ': 'NASDAQ', 'NYSE MKT': 'AMEX', 'AMEX': 'AMEX'}
    mat = collections.defaultdict(lambda: [0, 0, 0, 0, 0, 0])
    for c in chains:
        sy, fy = set(), set()
        for s in c['series']:
            if s.get('rawFirst'):
                sy.update(range(int(s['rawFirst'][:4]), int(s['rawLast'][:4]) + 1))
            if s.get('inFrame') and s.get('frameFirst'):
                fy.update(range(int(s['frameFirst'][:4]), int(s['frameLast'][:4]) + 1))
        cik = c['link'][1] if c['link'] else None
        fl = sorted(floats.get(cik, [])) if cik else []
        for y in YEARS:
            if not (c['start'] <= '%d-12-31' % y and c['end'] >= '%d-01-01' % y):
                continue
            cand = [v for e, _f, _a, v in fl if '%d-07-01' % (y - 2) <= e <= '%d-06-30' % y]
            sz = size_class(cand[-1] if cand else None)
            endh = c['ended'] and int(c['end'][:4]) == y
            for key in (('all', 'ALL'), ('exchange', grp[c['exchange']]), ('sizeClass', sz)):
                m = mat[(y,) + key]
                m[0] += 1
                m[1] += y in sy
                m[2] += y in fy
                if endh:
                    m[3] += 1
                    m[4] += y in sy
                    m[5] += c['lifecycle']
    cm_doc = json.loads((DOCS / 'coverage-matrix-1.0.2.json').read_text())
    cmis = []
    for (y, seg, val), m in sorted(mat.items()):
        p = cm_doc['years'].get(str(y), {}).get(seg, {}).get(val)
        theirs = [p['ref'], p['withSeries'], p['frameQualified'], p['ended'], p['endedWithSeries'], p['endedWithLifecycle']] if p else None
        if theirs != m:
            cmis.append([y, seg, val, m, theirs])
    compare('coverageMatrixAllExchangeSize', len(cmis), 0, sample={'count': len(cmis), 'first': cmis[:10]})
    # ---------- EDGAR events + completeness ----------
    per = collections.defaultdict(list)
    for e in events:
        if e[0] in ('25', '25-NSE', '15-12B') and (e[0] == '15-12B' or e[2] >= '2001-01-01'):
            per[e[1]].append(e)
    evs = []
    for cik, lst in per.items():
        lst.sort(key=lambda e: e[2])
        cur = None
        for e in lst:
            if cur and (D(e[2]) - D(cur['last'])).days <= 180:
                cur['forms'].append(e)
                cur['last'] = e[2]
                continue
            cur = {'cik': cik, 'date': e[2], 'last': e[2], 'name': e[4], 'forms': [e]}
            evs.append(cur)
    linked_by = collections.defaultdict(list)
    for c in chains:
        if c['link']:
            linked_by[c['link'][1]].append(c)
    ended = sorted((c for c in chains if c['ended']), key=lambda c: c['end'])
    edates = [c['end'] for c in ended]
    comp = collections.defaultdict(lambda: collections.Counter())
    agents_doc = json.loads((PRIV / 'work' / 'exchange-agents.json').read_text())
    agent_group = {}
    for pfx, ag in agents_doc['agents'].items():
        body = cached('https://data.sec.gov/submissions/CIK%s.json' % pfx)
        nm = (json.loads(body).get('name') or '').upper() if body else ''
        g = 'OTHER' if re.search('TEXAS|CHICAGO|NATIONAL', nm) else 'ARCA' if 'ARCA' in nm else 'AMEX' if re.search('AMERICAN|NYSE MKT|AMEX', nm) else 'NYSE' if ('NEW YORK STOCK EXCHANGE' in nm or nm.startswith('NYSE')) else 'NASDAQ' if 'NASDAQ STOCK MARKET' in nm else 'OTHER'
        agent_group[pfx] = g
    compare('exchangeAgentGroups', agent_group, {k: v['group'] for k, v in agents_doc['agents'].items()})
    segc = collections.defaultdict(lambda: collections.Counter())
    for ev in evs:
        y = int(ev['date'][:4])
        if y < 1995:
            continue
        if not any((yy, ev['cik']) in annual for yy in (y - 2, y - 1, y)):
            continue
        if re.fullmatch(r'(?i)NYSE|Nasdaq|NYSE American|NYSE MKT|AMEX', still.get(ev['cik'], '') or ''):
            continue
        comp[y]['considered'] += 1
        nse = next((f for f in ev['forms'] if f[0] == '25-NSE'), None)
        exch = agent_group.get(nse[3].split('/')[-1][:10], 'OTHER') if nse else 'UNKNOWN'
        fl = sorted(floats.get(ev['cik'], []))
        cand = [v for e, _f, _a, v in fl if '%d-07-01' % (y - 2) <= e <= '%d-06-30' % y]
        size = size_class(cand[-1] if cand else None)
        keys = [('exchange', exch), ('sizeClass', size)]
        for k in keys:
            segc[(y,) + k]['considered'] += 1
        lk = [c for c in linked_by.get(ev['cik'], []) if c['ended'] and any(-15 <= (D(f[2]) - D(c['end'])).days <= 120 for f in ev['forms'])]
        if lk:
            comp[y]['linked'] += 1
            for k in keys:
                segc[(y,) + k]['linked'] += 1
        else:
            i = bisect.bisect_left(edates, plus(ev['date'], -120))
            while i < len(ended) and edates[i] <= plus(ev['last'], 15):
                if affinity(ended[i]['ticker'], ev['name']) >= 2:
                    comp[y]['nameCand'] += 1
                    for k in keys:
                        segc[(y,) + k]['nameCand'] += 1
                    break
                i += 1
    cdoc = json.loads((DOCS / 'reference-completeness-1.0.2.json').read_text())['perYear']
    comp_mis = []
    for y in YEARS:
        p = cdoc.get(str(y))
        mine = [comp[y]['considered'], comp[y]['linked'], comp[y]['nameCand']]
        theirs = [p['consideredEvents'], p['linkedToReferenceChain'], p['nameCandidateOnly']] if p else [0, 0, 0]
        if mine != theirs:
            comp_mis.append([y, mine, theirs])
    compare('completenessPerYear', len(comp_mis), 0, sample={'count': len(comp_mis), 'rows': comp_mis})
    cfull = json.loads((DOCS / 'reference-completeness-1.0.2.json').read_text())['perYearSegment']
    seg_mis = []
    for (y, sk, sv), cnt in sorted(segc.items()):
        p = cfull.get(str(y), {}).get(sk, {}).get(sv)
        theirs = [p['considered'], p['linked'], p['nameCand']] if p else None
        if theirs != [cnt['considered'], cnt['linked'], cnt['nameCand']]:
            seg_mis.append([y, sk, sv, [cnt['considered'], cnt['linked'], cnt['nameCand']], theirs])
    compare('completenessPerYearExchangeSize', len(seg_mis), 0, sample={'count': len(seg_mis), 'first': seg_mis[:10]})
    # ---------- P4 readiness (all/ALL) ----------
    p4 = json.loads((DOCS / 'coverage-by-year-segment.json').read_text())
    cols = p4['columns']
    p4mis = []
    for row in p4['rows']:
        r = dict(zip(cols, row))
        if r['segment'] != 'all':
            continue
        m = mat[(r['year'], 'all', 'ALL')]
        up = (comp[r['year']]['linked'] + comp[r['year']]['nameCand']) / comp[r['year']]['considered'] if comp[r['year']]['considered'] else None
        if m[0] < 30 or up is None or round(up, 4) < 0.8:
            rd = 'INSUFFICIENT'
        else:
            cov = m[1] / m[0]
            rd = 'STUDY_READY_TRANSPARENT_GAP' if cov >= 0.95 else 'PARTIAL' if cov >= 0.8 else 'INSUFFICIENT'
        if rd != r['readiness']:
            p4mis.append([r['year'], rd, r['readiness']])
    compare('p4ReadinessAll', len(p4mis), 0, sample={'count': len(p4mis), 'rows': p4mis})
    # ---------- reasons ----------
    rp = DOCS / 'delisting-reasons-1.0.2.json.gz'
    if rp.exists():
        rdoc = json.loads(gzip.decompress(rp.read_bytes()))
        rr = collections.Counter()
        for row in rdoc['rows']:
            cik, date, scope = row[0], row[1], row[2]
            if scope != 'LINKED_ITEMS_QUERIED':
                continue
            regev = next(e for e in evs if e['cik'] == cik and e['date'] == date)
            last = max(f[2] for f in regev['forms'])
            url = 'https://efts.sec.gov/LATEST/search-index?forms=8-K&ciks=%010d&dateRange=custom&startdt=%s&enddt=%s' % (int(cik), plus(date, -120), plus(last, 30))
            b = cached(url)
            items = set()
            for h in json.loads(b)['hits']['hits'] if b else []:
                items.update(h['_source'].get('items') or [])
            cls = 'MERGER_ACQUISITION_COMPLETED' if '2.01' in items else 'BANKRUPTCY' if '1.03' in items else 'LISTING_RULE_OR_TRANSFER_NOTICE' if '3.01' in items else None
            if cls is None:
                cls = row[3] if row[3] in ('MERGER_PROCESS_INDICATED', 'VOLUNTARY_ISSUER_FILING', 'UNKNOWN') else 'ITEM_CLASS_EXPECTED'
            rr[cls] += 1
        compare('reasonCountsLinkedItemsQueried', dict(sorted(rr.items())), dict(sorted(rdoc['counts']['byScope'].get('LINKED_ITEMS_QUERIED', {}).items())))
    out['independentYearTable'] = {str(y): {'ref': mat[(y, 'all', 'ALL')][0], 'withSeries': mat[(y, 'all', 'ALL')][1], 'frame': mat[(y, 'all', 'ALL')][2], 'ended': mat[(y, 'all', 'ALL')][3],
                                            'edgarConsidered': comp[y]['considered'], 'edgarLinked': comp[y]['linked'], 'edgarNameCandidate': comp[y]['nameCand']} for y in YEARS}
    out['allMatch'] = all(v == 'MATCH' for v in chk.values())
    pathlib.Path(a.out).write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps({'checks': chk, 'allMatch': out['allMatch']}, indent=1))


if __name__ == '__main__':
    main()
