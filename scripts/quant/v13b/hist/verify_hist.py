#!/usr/bin/env python3
"""V13b HIST - independent stdlib check (python3 -I), written separately from the pipeline (no import of its modules).

Part A: re-derives the 28 crash chains from the raw fetch, re-finds every adjudication quote in the cached SEC bytes
(own HTML text extraction), re-checks windows and the B2 amount test, checks that register-1.1.0 equals register-1.0.0
outside the changed chains and re-derives the weekly points, end evidence and terminal class of the changed chains.
Part B: re-finds every accepted SPX terminal value in the cached document with own patterns, recomputes p0 from the raw
SPY report snapshot, the acquirer price at t1, the return, the completion filing and the bounded-weight bookkeeping.

python3 -I scripts/quant/v13b/hist/verify_hist.py --root . --v13-private <v13-private> --listref <v12-private/listref> \
    --private <v13b-private> --indexpop <v12-private/indexpop> --caches <dir> [<dir> ...] --out docs/quant-recovery/v13b/hist/python-check-1.0.0.json
"""
import argparse, collections, datetime as dt, glob, gzip, hashlib, hmac, html.parser, json, math, os, re

D = dt.date.fromisoformat


class Cache:
    def __init__(self, dirs):
        self.dirs = dirs

    def get(self, url):
        h = hashlib.sha256(url.encode()).hexdigest()
        for d in self.dirs:
            p = os.path.join(d, h[:2], h + '.gz')
            if os.path.exists(p):
                return gzip.open(p).read()
        return None


class TextOf(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        self.parts.append(' ')

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.skip:
            self.skip -= 1
        self.parts.append(' ')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def text(raw):
    p = TextOf()
    p.feed(raw.decode('latin-1', 'replace'))
    p.close()
    return ''.join(p.parts)


def squash(s):
    return re.sub(r'\s+', '', s.replace('\xa0', ' '))


def sha(b):
    return hashlib.sha256(b if isinstance(b, bytes) else b.encode()).hexdigest()


def fil_url(cik, acc):
    return 'https://www.sec.gov/Archives/edgar/data/%d/%s/%s.txt' % (int(cik), acc.replace('-', ''), acc)


class Checks:
    def __init__(self):
        self.n = collections.Counter()
        self.fail = []

    def ok(self, cond, label, detail=''):
        self.n['checks'] += 1
        if cond:
            self.n['pass'] += 1
        else:
            self.fail.append('%s %s' % (label, detail))


def ratio_k(r):
    for k in (2, 3, 4, 5, 10):
        if abs(r / k - 1) < 0.03:
            return k, 'UP'
        if abs(r * k - 1) < 0.03:
            return k, 'DOWN'
    return None


def own_series(root_priv):
    out = {}
    for f in sorted(glob.glob(os.path.join(root_priv, 'raw', '*', 'series.jsonl.gz'))):
        for line in gzip.open(f, 'rt'):
            r = json.loads(line)
            if r['ticker'] not in out or (not out[r['ticker']]['rows'] and r['rows']):
                out[r['ticker']] = r
    return out


def part_a(a, cache, ck):
    reg0 = json.load(open(os.path.join(a.root, 'docs/quant-recovery/v13/delisted/register-1.0.0.json')))
    reg1 = json.load(open(os.path.join(a.root, 'docs/quant-recovery/v13b/hist/register-1.1.0.json')))
    adj = json.load(open(os.path.join(a.root, 'docs/quant-recovery/v13b/hist/crash-adjudication-1.1.0.json')))
    i0 = {c: i for i, c in enumerate(reg0['columns'])}
    st0 = {r[0]: r for r in reg0['rows']}
    work = os.path.join(a.listref, 'work')
    key = open(os.path.join(work, 'chain-hash-key.txt')).read().strip()
    chains = [c for c in (json.loads(l) for l in gzip.open(os.path.join(work, 'reference-listings.jsonl.gz'), 'rt')) if c['ended'] and not c['series']]
    hid = lambda t, e, y: hmac.new(key.encode(), ('%s|%s|%s' % (t, e, y)).encode(), hashlib.sha256).hexdigest()[:16]
    base = collections.Counter(hid(c['ticker'], c['exchange'], c['endDate'][:4]) for c in chains)
    ser = own_series(a.v13_private)
    found = {}
    for ch in chains:
        cid = hid(ch['ticker'], ch['exchange'], ch['endDate'][:4])
        if base[cid] > 1:
            cid += '-' + hmac.new(key.encode(), ch['startDate'].encode(), hashlib.sha256).hexdigest()[:4]
        if st0.get(cid, [None] * 5)[4] != 'CA_UNRESOLVED':
            continue
        s = ser[ch['ticker']]
        c = {n: i for i, n in enumerate(s['cols'])}
        rows = [r for r in s['rows'] if r[c['close']] is not None]
        while rows and not ((rows[-1][c['volume']] or 0) > 0):
            rows = rows[:-1]
        jumps = []
        for i in range(1, len(rows)):
            x = ratio_k(rows[i][c['close']] / rows[i - 1][c['close']])
            if not x:
                continue
            k, kind = x
            sfs = [float(rows[j][c['splitFactor']] or 1) for j in (i, i + 1) if j < len(rows)]
            if any(f != 1 and ((kind == 'DOWN' and abs(f / k - 1) < 0.03) or (kind == 'UP' and abs(f * k - 1) < 0.03)) for f in sfs):
                continue
            jumps.append((rows[i][0][:10], kind, k, rows[i - 1][c['close']], rows[i][c['close']], rows[i - 1][0][:10], i))
        if jumps and jumps[0][1] == 'DOWN' and (D(rows[-1][0][:10]) - D(jumps[0][0])).days <= 365:
            found[cid] = (ch, jumps, rows, c)
    ck.ok(len(found) == 28, 'A.scope28', str(len(found)))
    cases = {x['chainId']: x for x in adj['cases']}
    ck.ok(set(cases) == set(found), 'A.scopeEqualsAdjudication')
    for cid, x in cases.items():
        ch, jumps, rows, c = found[cid]
        ck.ok(len(x['jumps']) == len(jumps), 'A.jumpCount', cid)
        for j in x['jumps']:
            J = jumps[j['n'] - 1]
            ck.ok(j['year'] == int(J[0][:4]) and j['ratioClass'] == J[2] and (j['direction'] == 'FALL') == (J[1] == 'DOWN'), 'A.jumpIdentity', cid)
            for e in j['evidence']:
                raw = cache.get(e['url'])
                ck.ok(raw is not None and sha(raw[:2000000] if e['truncated'] else raw) == e['docSha256'], 'A.docHash', e['accession'])
                if raw is None:
                    continue
                ck.ok(len(e['quote']) <= 300 and squash(e['quote']) in squash(text(raw[:2000000])), 'A.quote', e['accession'])
                ck.ok(sha(e['quote']) == e['quoteSha256'], 'A.quoteHash', e['accession'])
            if j['class'] == 'A_REAL_PRICE_EVENT':
                ck.ok(any(-14 <= (D(e['filingDate']) - D(J[0])).days <= 7 for e in j['evidence']), 'A.E1window', cid)
                near = [r for r in rows[max(0, J[6] - 5): J[6] + 6] if float(r[c['splitFactor']] or 1) != 1]
                ck.ok(not near, 'A.E2providerSplit', cid)
            if j['class'] == 'B_CORPORATE_ACTION':
                ck.ok(j['exDate'] in (J[0], J[5]), 'A.BexDate', cid)
                ck.ok(abs(j['perShare'] / J[3] - (1 - J[4] / J[3])) <= 0.15, 'A.B2amount', cid)
    # register 1.1.0 vs 1.0.0
    i1 = {c: i for i, c in enumerate(reg1['columns'])}
    changed = {c['chainId'] for c in reg1['changedChains'] if not c.get('unchangedRow')}
    admitted = {cid for cid, x in cases.items() if x['chainDecision'] == 'ADJUDICATED_RESOLVED'}
    ck.ok(changed <= admitted, 'A.changedSubsetOfAdmitted')
    same = sum(1 for r in reg1['rows'] if r[0] not in changed and r[:10] == st0[r[0]])
    ck.ok(same == len(reg1['rows']) - len(changed), 'A.unchangedRowsEqual', '%d/%d' % (same, len(reg1['rows']) - len(changed)))
    cnt = collections.Counter(r[i1['status']] for r in reg1['rows'])
    ck.ok(dict(cnt) == reg1['counts'], 'A.counts')
    # own re-derivation of the changed chains
    events = json.load(open(os.path.join(work, 'delisting-register.json')))
    ev = collections.defaultdict(list)
    for e in events:
        ev[e['cik']].append(D(e['eventDate']))
    rr = json.load(open(os.path.join(work, 'delisting-reasons.json')))
    rc = {n: i for i, n in enumerate(rr['columns'])}
    reasons = {(r[rc['cik']], r[rc['eventDate']]): r[rc['reason']] for r in rr['rows']}
    for r in reg1['rows']:
        if r[0] not in changed:
            continue
        ch, jumps, rows, c = found[r[0]]
        adjdays = {jumps[j['n'] - 1][0]: j for j in cases[r[0]]['jumps']}
        sf = [float(x[c['splitFactor']] or 1) for x in rows]
        cl = [x[c['close']] for x in rows]
        later, acc = [1.0] * len(rows), 1.0
        for i in range(len(rows) - 1, -1, -1):
            later[i] = acc
            acc *= sf[i]
        sadj = [cl[i] / later[i] for i in range(len(rows))]
        ok = all(not ratio_k(cl[i] / cl[i - 1]) or rows[i][0][:10] in adjdays or any(
            sf[j] != 1 for j in (i, i + 1) if j < len(rows)) for i in range(1, len(rows)))
        ok = ok and all(abs(math.log(sadj[i] / sadj[i - 1])) <= math.log(10) for i in range(1, len(rows)))
        wk = collections.OrderedDict()
        for i, x in enumerate(rows):
            y, w, _ = D(x[0][:10]).isocalendar()
            wk[(y, w)] = (x[0], round(sadj[i], 6), cl[i])
        keys = list(wk)
        contiguous = all((dt.date.fromisocalendar(*keys[i - 1], 1) + dt.timedelta(days=7)).isocalendar()[:2] == keys[i] for i in range(1, len(keys)))
        pts = [[v[0], v[1]] for v in wk.values()]
        ck.ok(ok and contiguous and len(pts) >= 55, 'A.ownRules', r[0])
        ck.ok(sha(json.dumps(pts, separators=(',', ':'))) == r[i1['pointsSha256']], 'A.pointsSha256', r[0])
        last = D(pts[-1][0][:10])
        cik = ch['link']['cik']
        evs = [e for e in ev.get(cik, []) if -45 <= (e - last).days <= 120]
        ck.ok(bool(evs) == bool(r[i1['endSourced']]), 'A.endSourced', r[0])
        e0 = min(evs, key=lambda e: abs((e - last).days)) if evs else None
        lab = reasons.get((cik, e0.isoformat())) if e0 else None
        lastraw = list(wk.values())[-1][2]
        tcl = 'MERGER' if lab == 'MERGER_ACQUISITION_COMPLETED' else ('DISTRESS' if (lab == 'BANKRUPTCY' or lastraw < 1) else 'UNKNOWN')
        ck.ok(tcl == r[i1['terminalClass']], 'A.terminalClass', r[0])


CASH_RX = re.compile(r'\$\s?(\d+(?:\.\d+)?)')


def part_b(a, cache, ck, version):
    reg = json.load(open(os.path.join(a.root, 'docs/quant-recovery/v13b/hist/spx-terminal-register-%s.json' % version)))
    snaps = json.load(open(os.path.join(a.indexpop, 'work', 'snapshots.json')))['snapshots']
    spy = {s['date']: s for s in snaps if s['fund'] == 'SPY' and s['state'] == 'PARSED'}
    norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
    pop = json.load(gzip.open(os.path.join(a.root, 'docs/quant-recovery/v12/spxpop/population-1.1.1.json.gz')))
    bw = {p['t0']: p['summary']['boundedW'] for p in pop['periods'] if p['fund'] == 'SPY'}
    acc = [r for r in reg['rows'] if r['status'].startswith('TERMINAL_')]
    for r in acc:
        tag = '%s %s' % (r['t0'], r['name'][:20])
        raw = cache.get(r['evidence']['url'])
        ck.ok(raw is not None and sha(raw[:2000000] if r['evidence']['truncated'] else raw) == r['evidence']['sha256'], 'B%s.docHash' % version, tag)
        if raw is None:
            continue
        t = text(raw[:2000000])
        ck.ok(squash(r['evidence']['quote']) in squash(t), 'B%s.quote' % version, tag)
        q = r['evidence']['quote']
        c = r['consideration']
        if c['cashPerShare']:
            vals = {float(x) for x in CASH_RX.findall(q)}
            ck.ok(c['cashPerShare'] in vals, 'B%s.cashInQuote' % version, tag)
        if c['exchangeRatio']:
            ck.ok(re.search(r'(?<![\d.])0?%s(?!\d)' % re.escape(('%g' % c['exchangeRatio']).lstrip('0') if c['exchangeRatio'] < 1 else '%g' % c['exchangeRatio']), q) is not None, 'B%s.ratioInQuote' % version, tag)
        mem = [m for m in spy[r['t0']]['members'] if norm(m['name']).startswith(norm(r['name'])[:12])]
        p0s = sorted({round(m['value'] / m['shares'], 6) for m in mem if m['shares']})
        ck.ok(any(abs(p - r['p0']) < 1e-4 for p in p0s), 'B%s.p0' % version, '%s %s %s' % (tag, p0s, r['p0']))
        pacq = 0.0
        if c['exchangeRatio']:
            cands = [m for m in spy[r['t1']]['members'] if m['shares'] and abs(m['value'] / m['shares'] - r['acquirerPriceT1']) < 1e-4]
            ck.ok(len(cands) >= 1 and any(norm(m['name'])[:6] in norm(q) for m in cands), 'B%s.acquirerPrice' % version, tag)
            pacq = r['acquirerPriceT1']
        ret = ((c['cashPerShare'] or 0) + (c['exchangeRatio'] or 0) * pacq) / r['p0'] - 1
        ck.ok(abs(ret - r['return']) < 1e-5, 'B%s.return' % version, tag)
        sub = json.loads(cache.get('https://data.sec.gov/submissions/CIK%010d.json' % int(r['cik'])))
        rows = sub['filings']['recent']
        idx = {rows['accessionNumber'][i]: (rows['form'][i], rows['filingDate'][i]) for i in range(len(rows['form']))}
        for ex in sub['filings'].get('files', []):
            b = json.loads(cache.get('https://data.sec.gov/submissions/' + ex['name']))
            idx.update({b['accessionNumber'][i]: (b['form'][i], b['filingDate'][i]) for i in range(len(b['form']))})
        cp = r['completion']
        ok = cp['accession'] in idx and idx[cp['accession']][1] == cp['filingDate'] and D(r['t0']) < D(cp['filingDate']) <= D(r['t1']) + dt.timedelta(days=10)
        ck.ok(ok, 'B%s.completion' % version, tag)
        v = ret + 1
        ck.ok(1 / 3 <= v <= 3 and not ratio_k(v), 'B%s.plausibility' % version, tag)
    for r in reg['rows']:
        if r['status'] == 'BOUNDED':
            if r['reason'] == 'NO_CIK':
                ck.ok(not r['cik'], 'B%s.noCik' % version)
            if r['reason'].startswith('FATE_'):
                ck.ok(r['reason'] == 'FATE_' + (r['fate'] or 'NONE'), 'B%s.fate' % version)
    for c in reg['coverageByPeriod']:
        w = sum(r['weight'] for r in acc if r['t0'] == c['t0'])
        ck.ok(abs(c['boundedWAfter'] - (bw[c['t0']] - w)) < 2e-6, 'B%s.boundedW' % version, c['t0'])
    return len(acc)


def main():
    ap = argparse.ArgumentParser()
    for k in ('root', 'v13-private', 'listref', 'private', 'indexpop', 'out'):
        ap.add_argument('--' + k, required=True)
    ap.add_argument('--caches', nargs='+', required=True)
    a = ap.parse_args()
    cache = Cache([os.path.join(a.private, 'http-cache')] + a.caches)
    ck = Checks()
    part_a(a, cache, ck)
    nb = {v: part_b(a, cache, ck, v) for v in ('1.0.0', '1.0.1')}
    rev = json.load(open(os.path.join(a.root, 'docs/quant-recovery/v13b/hist/spx-terminal-review-1.0.0.json')))
    for fl in rev['register_1.0.0']['flagged'] + rev['register_1.0.1']['flagged']:
        for e in fl.get('evidence', []):
            raw = cache.get(e['url'])
            ck.ok(raw is not None and squash(e['quote']) in squash(text(raw[:2000000])) and sha(e['quote']) == e['quoteSha256'], 'review.quote', fl['name'])
    led = [json.loads(l) for l in open(os.path.join(a.private, 'request-ledger.jsonl'))]
    res = {'schemaVersion': 'v13b-hist-python-check-1.0.0', 'implementation': 'independent stdlib (html.parser text, own patterns, own series/week logic)',
           'checks': ck.n['checks'], 'passed': ck.n['pass'], 'failed': len(ck.fail), 'failures': ck.fail, 'acceptedTerminalRows': nb,
           'secRequestsLedger': {'networkRequests': sum(x['requests'] for x in led), 'ledgerLines': len(led), 'errors': sum(1 for x in led if x['status'] not in (200, 206))}}
    with open(a.out, 'w') as fh:
        json.dump(res, fh, indent=1)
        fh.write('\n')
    print(json.dumps({k: res[k] for k in ('checks', 'passed', 'failed', 'acceptedTerminalRows', 'secRequestsLedger')}), '\n', '\n'.join(ck.fail[:40]))


if __name__ == '__main__':
    main()
