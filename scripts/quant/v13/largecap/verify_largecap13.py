"""V13 LARGECAP independent check (stdlib only; run with python3 -I). Separate implementation, not a port of evaluate.cjs/extract.py:
it re-reads the raw private bodies, re-hashes them, finds every cited quote in its own flattening of the raw text, re-derives the
anchor numbers, years/quarters and periods with its own rules, re-derives identity (symbol + exchange) per filing from the raw
documents, recomputes the unit conversion, every band test, the runs and the unlocked intervals from the committed series, and
compares everything with cases-1.0.0.json.

python3 -I scripts/quant/v13/largecap/verify_largecap13.py <repo> <private dir> <out.json>
"""
import datetime
import glob
import gzip
import hashlib
import html
import json
import os
import re
import sys

REPO, PRIV, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SCRATCH = os.path.dirname(os.path.dirname(PRIV.rstrip('/')))
CACHES = [os.path.join(PRIV, 'http-cache')] + [os.path.join(SCRATCH, p, 'http-cache') for p in (
    'v12-private/largecap', 'v10-private/corporate-actions', 'v10-private/population', 'v12-private/indexpop', 'v12-private/listref', 'v12-private/mcap')]


def body_of(url):
    h = hashlib.sha256(url.encode()).hexdigest()
    for c in CACHES:
        p = os.path.join(c, h[:2], h + '.gz')
        if os.path.exists(p):
            with gzip.open(p, 'rb') as fh:
                return fh.read()
    return None


def flat(b):
    t = b.decode('utf-8', 'replace')
    t = re.sub(r'(?is)<(script|style)\b.*?</\1>', ' ', t)
    t = re.sub(r'<[^>]+>', ' ', t)
    return re.sub(r'\s+', ' ', html.unescape(t)).strip()


def nows(s):
    return re.sub(r'\s+', '', s)


def locate(t, q):
    """start offset of quote q in flat text t, tolerant to whitespace differences."""
    i = t.find(q)
    if i >= 0:
        return i
    core = nows(q)[:120]
    pat = r'\s*'.join(re.escape(ch) for ch in core)
    m = re.search(pat, t)
    return m.start() if m else -1


STANDALONE_YEAR = r'(?<![\d$.,/])((?:19|20)\d\d)(?![\d,.%/])'


def label_year(window):
    """nearest year label before a row: 'Fiscal 2002:', '2009:', 'Year Ended September 30, 2005', 'Year Ended 9/30/00', a year standing alone."""
    best = None
    for m in re.finditer(r'(?i)(?:fiscal\s+(?:year\s+)?(?:ended\s+[A-Za-z]+\s+\d{1,2},\s*)?|year\s+ended\s+[A-Za-z]+\s+\d{1,2},\s*)?' + STANDALONE_YEAR, window):
        best = (m.start(), int(m.group(1)))
    for m in re.finditer(r'(?i)year\s+ended\s+\d{1,2}/\d{1,2}/(\d{2})\b', window):
        y = int(m.group(1))
        y = y + (2000 if y < 50 else 1900)
        if best is None or m.start() > best[0]:
            best = (m.start(), y)
    return best[1] if best else None


def header_years(window, g):
    """the last run of g consecutive stand-alone years (header of a multi-year table)."""
    runs = list(re.finditer(STANDALONE_YEAR + r'((?:\s+(?:fiscal\s+)?(?:19|20)\d\d(?![\d,.%/])){' + str(g - 1) + '})', window))
    if not runs:
        return None
    ys = [int(y) for y in re.findall(r'(?:19|20)\d\d', runs[-1].group(0))]
    return ys if len(ys) == g else None


def D(s):
    return datetime.date.fromisoformat(s)


def nums(s):
    """own number reader: integers, decimals, 'a b/c', 'a-b/c', 'a b / c' fractions."""
    s = re.sub(r'\((?:\d{1,2}|[A-Za-z]{1,2})\)', ' ', s)
    out = []
    toks = re.findall(r'(?<![\d,.])\d{1,2}\s*/\s*\d{1,2}(?![\d/])|\$?\d[\d,]*\.?\d*|[-\u2013\u2014]', s)
    i = 0
    while i < len(toks):
        tk = toks[i]
        if re.fullmatch(r'\$?\d[\d,]*\.?\d*', tk):
            v = float(tk.lstrip('$').replace(',', '').rstrip('.') or 0)
            if i + 1 < len(toks) and '/' in toks[i + 1] and '.' not in tk:
                a, b = [int(x) for x in toks[i + 1].replace(' ', '').split('/')]
                if b in (2, 4, 8, 16, 32, 64) and 0 < a < b:
                    v += a / b
                    i += 1
            out.append(v)
        i += 1
    return out


cases_doc = json.load(open(os.path.join(REPO, 'docs/quant-recovery/v13/largecap/cases-1.0.0.json')))
proto = json.load(open(os.path.join(REPO, 'docs/quant-recovery/v13/largecap/protocol-1.0.0.json')))
manifest = [json.loads(l) for l in open(os.path.join(PRIV, 'manifest.jsonl'))]
facts8k = [json.loads(l) for l in open(os.path.join(PRIV, 'facts-8k.jsonl'))]
TOL_A, TOL_B, BUF = 0.01, 0.10, 10
checks, problems = {}, []


def fail(msg):
    problems.append(msg)


# ---------------------------------------------------------------- A: hashes
docs_by_url = {}
for d in manifest + facts8k:
    if d.get('kind') in ('SUBMISSIONS', 'INDEX') or 'error' in d:
        continue
    docs_by_url[d['url']] = d
flat_cache = {}


def text(url):
    if url not in flat_cache:
        b = body_of(url)
        if b is None:
            fail('BODY_MISSING ' + url)
            flat_cache[url] = ''
        else:
            flat_cache[url] = flat(b)
    return flat_cache[url]


cited = set()
for c in cases_doc['cases']:
    for d in c['documents']:
        cited.add((d['url'], d['sha256']))
    for q in (c['identity'].get('firstIdentityQuote'), c['identity'].get('lastIdentityQuote')):
        if q:
            cited.add((q['url'], q['sha256']))
    for f in c['factors']:
        if f['evidence']:
            cited.add((f['evidence']['url'], f['evidence']['sha256']))
    for a in c['identity']['changeAnchors']:
        cited.add((a['url'], a['sha256']))
nh = 0
for url, s in sorted(cited):
    b = body_of(url)
    if b is None or hashlib.sha256(b).hexdigest() != s:
        fail('SHA_MISMATCH ' + url)
    nh += 1
checks['A_rehash'] = {'documents': nh, 'ok': not any(p.startswith(('SHA_', 'BODY_')) for p in problems)}

# ---------------------------------------------------------------- identity per filing (own detection)
EXCH = {'NASDAQ': r'\bnasdaq\b', 'NYSE': r'new york stock exchange|\bnyse\b'}


def own_symbols(t, cands):
    found = set()
    for s in cands:
        if re.search(r'(?i:symbol|ticker)[^.]{0,70}?(?<![A-Za-z])["“\']?' + s + r'(?![A-Za-z0-9-])', t) or \
           re.search(r'(?i:trading\s+symbol)[\s\S]{0,320}?(?<![A-Za-z])' + s + r'(?![A-Za-z0-9-])', t) or \
           re.search(r'\((?i:nyse|nasdaq)\s*:\s*' + s + r'\)', t):
            found.add(s)
    return found


def own_change(t, a, b):
    for m in re.finditer(r'(?<![A-Za-z])' + a + r'(?![A-Za-z0-9-])', t):
        w = t[max(0, m.start() - 400):m.start() + 400]
        if re.search(r'(?<![A-Za-z])' + b + r'(?![A-Za-z0-9-])', w) and re.search(r'(?i)\b(changed?|changes|new|formerly|previously|will begin trading|began trading|under the symbol)\b', w) and re.search(r'(?i)symbol|ticker', w):
            return True
    return False


per_sid = {}
for c in cases_doc['cases']:
    sid, tick = c['securityId'], c['ticker']
    cands = proto['listingIdentity']['candidateSymbols'][sid]
    exch = 'NASDAQ' if sid == 'ref_AAPL' else 'NYSE'
    fil = {}
    for d in docs_by_url.values():
        if d['sid'] != sid:
            continue
        f = fil.setdefault(d['accession'], {'date': d['filingDate'], 'syms': set(), 'ex': False, 'pairs': set()})
        t = text(d['url'])
        f['syms'] |= own_symbols(t, cands)
        f['ex'] = f['ex'] or bool(re.search(EXCH[exch], t, re.I))
        for i, a in enumerate(cands):
            for b in cands[i + 1:]:
                if own_change(t, a, b):
                    f['pairs'].add((a, b))
    edges = {}
    for f in fil.values():
        for a, b in f['pairs']:
            edges.setdefault(a, set()).add(b)
            edges.setdefault(b, set()).add(a)
    valid, st = {tick}, [tick]
    while st:
        x = st.pop()
        for y in edges.get(x, ()):
            if y not in valid:
                valid.add(y)
                st.append(y)
    idd = sorted(f['date'] for f in fil.values() if len(f['syms']) == 1 and f['ex'] and next(iter(f['syms'])) in valid)

    def ident(acc, fil=fil, idd=idd, valid=valid):
        f = fil.get(acc)
        if f is None:
            return None
        if len(f['syms']) == 1 and f['ex'] and next(iter(f['syms'])) in valid:
            return 'OWN'
        bef = [x for x in idd if x <= f['date']]
        aft = [x for x in idd if x >= f['date']]
        if bef and aft and (D(aft[0]) - D(bef[-1])).days <= 400:
            return 'BRACKETED'
        return None
    per_sid[sid] = {'ident': ident, 'idd': idd, 'valid': sorted(valid)}
    if sorted(valid) != c['identity']['validSymbols']:
        fail('VALID_SYMBOLS %s %s %s' % (sid, sorted(valid), c['identity']['validSymbols']))
    if (idd[0] if idd else None) != c['identity']['firstIdentityFiling'] or (idd[-1] if idd else None) != c['identity']['lastIdentityFiling']:
        fail('IDENTITY_RANGE %s %s..%s vs %s..%s' % (sid, idd[:1], idd[-1:], c['identity']['firstIdentityFiling'], c['identity']['lastIdentityFiling']))

# ---------------------------------------------------------------- anchors: quotes, numbers, years, periods
WORDQ = {'first': 1, 'second': 2, 'third': 3, 'fourth': 4, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4}
MONS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']


def month_num(w):
    return MONS.index(w.lower()[:3]) + 1


def last_day(y, m):
    return (datetime.date(y + (m == 12), m % 12 + 1, 1) - datetime.timedelta(days=1))


def own_period(q, report):
    """period of a B quote from its leading text."""
    head = q.split('|')[0]
    full = re.findall(r'([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})', head)
    full = [x for x in full if x[0].lower()[:3] in MONS]
    if len(full) >= 2:
        (m1, d1, y1), (m2, d2, y2) = full[0], full[1]
        return datetime.date(int(y1), month_num(m1), int(d1)), datetime.date(int(y2), month_num(m2), int(d2))
    nm = re.findall(r'(\d{1,2})/(\d{1,2})/(\d{2,4})', head)
    if len(nm) >= 2:
        def yy(v):
            v = int(v)
            return v + (2000 if v < 50 else 1900) if v < 100 else v
        return datetime.date(yy(nm[0][2]), int(nm[0][0]), int(nm[0][1])), datetime.date(yy(nm[1][2]), int(nm[1][0]), int(nm[1][1]))
    m = re.match(r'\s*(?:Month\s*#\d\s*)?\(?\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*(?:-|–|—|to|through)\s*(?:([A-Za-z]{3,9})\.?\s*)?(\d{1,2})(?:\s*,?\s*(\d{4}))?', head)
    if m and m.group(1).lower()[:3] in MONS:
        m1 = month_num(m.group(1))
        m2 = month_num(m.group(3)) if m.group(3) else m1
        if m.group(5):
            y2 = int(m.group(5))
        else:
            y2 = report.year if m2 <= report.month else report.year - 1
        y1 = y2 if m1 <= m2 else y2 - 1
        return datetime.date(y1, m1, int(m.group(2))), datetime.date(y2, m2, int(m.group(4)))
    m = re.match(r'\s*([A-Za-z]{3,9})\.?\s*(\d{4})?\b', head)
    if m and m.group(1).lower()[:3] in MONS:
        mm = month_num(m.group(1))
        y = int(m.group(2)) if m.group(2) else (report.year if mm <= report.month else report.year - 1)
        return datetime.date(y, mm, 1), last_day(y, mm)
    return None


fye_cache = {}


def fye_month(sid, fy, own_report):
    key = (sid, fy)
    if key not in fye_cache:
        ms = [d for d in manifest if d['sid'] == sid and d.get('form', '').startswith('10-K') and (d.get('reportDate') or '').startswith(str(fy))]
        ms.sort(key=lambda d: d['filingDate'])
        fye_cache[key] = int(ms[-1]['reportDate'][5:7]) if ms else None
    return fye_cache[key] or own_report.month


def qperiod(fy, q, m):
    end_idx = fy * 12 + (m - 1) - 3 * (4 - q)
    st = end_idx - 2
    return datetime.date(st // 12, st % 12 + 1, 1), last_day(end_idx // 12, end_idx % 12 + 1)


summary = {}
for c in cases_doc['cases']:
    sid = c['securityId']
    series = json.load(open(os.path.join(REPO, 'quant/data/market/discover-series-long', sid + '.json')))
    pts = series['points']
    dates = [D(p[0]) for p in pts]
    facs = series['corporateActions']['splits']
    cls = {f['date']: f['class'] for f in c['factors']}
    # own check of split classification evidence
    for f in c['factors']:
        if f['class'] == 'SPLIT':
            ev = f['evidence']
            words = {1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten'}
            p, q = f['ratio']
            pat = r'(?i)\b(%s|%d)[\s-]*for[\s-]*(%s|%d)\b' % (words[p], p, words[q], q)
            stock_div = (p, q) == (2, 1) and re.search(r'(?i)100\s*(%|percent)\s+stock\s+dividend', ev['quote'])
            if not (re.search(pat, ev['quote']) or stock_div) or not (D(f['date']) - datetime.timedelta(days=400) <= D(ev['filingDate']) <= D(f['date']) + datetime.timedelta(days=800)):
                fail('SPLIT_EVIDENCE %s %s' % (sid, f['date']))
            if nows(ev['quote']) not in nows(text(ev['url'])):
                fail('SPLIT_QUOTE %s %s' % (sid, f['date']))

    def conv(i, filing):
        m = 1.0
        for d, fct in facs:
            if (cls[d] == 'SPLIT' and d > filing) or (cls[d] != 'SPLIT' and d > pts[i][0]):
                m *= fct
        return pts[i][1] * m

    ident = per_sid[sid]['ident']
    own = []
    n_quote = n_num = n_year = n_band = n_id = 0
    for p in c['periods']:
        t = text(p['url'])
        if nows(p['quote'].split(' | ')[-1]) not in nows(t):
            fail('QUOTE_NOT_FOUND %s %s %s' % (sid, p['type'], p['start']))
        else:
            n_quote += 1
        if ident(p['accession']) != p['identity']:
            fail('IDENTITY_STATUS %s %s %s own=%s cases=%s' % (sid, p['accession'], p['start'], ident(p['accession']), p['identity']))
        else:
            n_id += 1
        rep = D(docs_by_url[p['url']]['reportDate'])
        if p['type'] == 'A':
            row = p['quote']
            vals = nums(re.sub(r'^[^$\d]*?(19|20)\d\d\b', ' ', row) if p['format'] == 'C' else re.sub(r'^\D*', '', row))
            if p['format'] == 'C':
                pairs = [(vals[2 * k], vals[2 * k + 1]) for k in range(len(vals) // 2)]
                pos = pairs.index((p['high'], p['low'])) if (p['high'], p['low']) in pairs else None
                at = locate(t, row)
                win = t[max(0, at - 2500):at] if at >= 0 else ''
                runs4 = list(re.finditer(r'(?i)\b(first|second|third|fourth)(?:\s+quarter)?\s+(first|second|third|fourth)(?:\s+quarter)?\s+(first|second|third|fourth)(?:\s+quarter)?\s+(first|second|third|fourth)\b', win))
                order = [WORDQ[x.lower()] for x in runs4[-1].groups()] if runs4 else []
                ym = re.search(STANDALONE_YEAR, row.split('$')[0])
                yv = int(ym.group(1)) if ym else label_year(win[-700:])
                ok = pos is not None and len(order) == 4 and order[pos] == p['q'] and yv == p['fy']
            else:
                hl = [(vals[i], vals[i + 1]) for i in range(len(vals) - 1)]
                ok_num = (p['high'], p['low']) in hl or (p['low'], p['high']) in hl
                # own year rule: several (high, low) groups per row -> the last run of that many stand-alone years above the row,
                # in order; one group per row -> the nearest year label above the row
                at = locate(t, row)
                win = t[max(0, at - 1500):at] if at >= 0 else ''
                if not ok_num:
                    ok = False
                else:
                    k = next(i for i in range(len(vals) - 1) if (vals[i], vals[i + 1]) in ((p['high'], p['low']), (p['low'], p['high'])))
                    yv = None
                    for g in (3, 2):
                        if len(vals) % g == 0 and len(vals) // g >= 2 and k % (len(vals) // g) in (0, 1):
                            ys = header_years(win, g)
                            if ys:
                                yv = ys[k // (len(vals) // g)]
                                break
                    if yv is None:
                        yv = label_year(win[-600:])
                    ok = yv == p['fy']
            if ok:
                n_year += 1
            else:
                fail('A_MAPPING %s %s fy%s q%s %s' % (sid, p['filingDate'], p['fy'], p['q'], p['quote'][:120]))
            m = fye_month(sid, p['fy'], rep)
            s, e = qperiod(p['fy'], p['q'], m)
            if (s.isoformat(), e.isoformat()) != (p['start'], p['end']):
                fail('A_PERIOD %s %s' % (sid, p['start']))
            idx_b = [i for i, d in enumerate(dates) if (d - s).days > BUF and (e - d).days > BUF]
            cs = [conv(i, p['filingDate']) for i in idx_b]
            passed = len(cs) >= 3 and all(p['low'] * (1 - TOL_A) <= x <= p['high'] * (1 + TOL_A) for x in cs)
            dev = max([0.0] + [max((p['low'] - x) / p['low'], (x - p['high']) / p['high']) for x in cs])
        else:
            q = p['quote']
            per = own_period(q, rep)
            if per is None or (per[0].isoformat(), per[1].isoformat()) != (p['start'], p['end']):
                fail('B_PERIOD %s %s %s %s' % (sid, p['start'], per, q[:100]))
            body = q.split(' | ')[-1]
            # own rule: dates removed, the first number written with '$' or a decimal point is the average price
            body = re.sub(r'(?i)[A-Za-z]{3,9}\.?\s+\d{1,2}\s*,\s*\d{4}|\d{1,2}/\d{1,2}/\d{2,4}', ' ', body)
            body = re.sub(r'\((?:\d{1,2}|[A-Za-z]{1,2})\)', ' ', body)
            got = None
            for m in re.finditer(r'(\$\s*)?(\d[\d,]*)(\.\d+)?', body):
                if m.group(1) or m.group(3):
                    got = float(m.group(2).replace(',', '') + (m.group(3) or ''))
                    break
            if got is None or abs(got - p['avgPrice']) > 1e-9:
                fail('B_NUMBER %s %s own=%s cases=%s %s' % (sid, p['start'], got, p['avgPrice'], body[:100]))
            else:
                n_num += 1
            s, e = D(p['start']), D(p['end'])
            idx_b = [i for i, d in enumerate(dates) if s <= d <= e + datetime.timedelta(days=6)]
            prior = [i for i, d in enumerate(dates) if d < s]
            if prior:
                idx_b = [prior[-1]] + idx_b
            cs = [conv(i, p['filingDate']) for i in idx_b]
            lo, hi = (min(cs), max(cs)) if cs else (0, 0)
            passed = len(cs) >= 2 and lo * (1 - TOL_B) <= p['avgPrice'] <= hi * (1 + TOL_B)
            dev = max(0.0, (lo - p['avgPrice']) / lo, (p['avgPrice'] - hi) / hi) if cs else 0
        if passed != p['pass'] or abs(round(dev, 4) - p['deviation']) > 1e-4:
            fail('BAND %s %s %s own=%s/%.4f cases=%s/%s' % (sid, p['type'], p['start'], passed, dev, p['pass'], p['deviation']))
        else:
            n_band += 1
        own.append({'start': p['start'], 'end': p['end'], 'pass': passed, 'dev': dev})
    # ---------------- own runs (protocol intervalRule) and interval
    own.sort(key=lambda x: (x['end'], x['start']))
    events = []
    for i in range(1, len(pts)):
        r = pts[i][1] / pts[i - 1][1]
        for k in (2, 3, 4, 5, 10, 1.5):
            if abs(r / k - 1) < 0.05 or abs(r * k - 1) < 0.05:
                events.append(pts[i][0])
                break
    events += [d for d, _ in facs]
    events.sort()
    runs, cur, k = [], [], 0
    while k < len(own):
        x = own[k]
        if not x['pass'] and x['dev'] > 0.10:
            if cur:
                runs.append(cur)
            cur = []
            k += 1
            continue
        if not x['pass'] and k + 1 < len(own) and not own[k + 1]['pass']:
            if cur:
                runs.append(cur)
            cur = []
            k += 2
            while k < len(own) and not own[k]['pass']:
                k += 1
            continue
        lp = [y for y in cur if y['pass']]
        if x['pass'] and lp and (D(x['start']) - D(lp[-1]['end'])).days > 366:
            runs.append(cur)
            cur = []
        cur.append(x)
        k += 1
    if cur:
        runs.append(cur)

    def split(run):
        ps = [y for y in run if y['pass']]
        if not ps:
            return [run]
        lo, hi = min(y['start'] for y in ps), max(y['end'] for y in ps)
        for ev in events:
            if not (lo < ev <= hi):
                continue
            b = any((y['start'] <= ev <= y['end']) or (ev > y['end'] and (D(ev) - D(y['end'])).days <= 120) for y in ps)
            a = any((y['start'] <= ev <= y['end']) or (y['start'] > ev and (D(y['start']) - D(ev)).days <= 120) for y in ps)
            if not (a and b):
                r1, r2 = [y for y in run if y['end'] < ev], [y for y in run if y['start'] > ev]
                return (split(r1) if r1 else []) + (split(r2) if r2 else [])
        return [run]
    bound = c['identity']['bound']
    acc = []
    for run in [r for rr in runs for r in split(rr)]:
        ps = [y for y in run if y['pass']]
        if not ps or (len(run) - len(ps)) / len(run) > 0.05:
            continue
        s0, e0 = min(y['start'] for y in ps), max(y['end'] for y in ps)
        s0, e0 = max(s0, bound['from']), min(e0, bound['to'])
        ins = [p for p in pts if s0 <= p[0] <= e0]
        if len(ins) >= 104:
            acc.append((e0, ins[0][0], ins[-1][0], len(ins), ins))
    acc.sort(reverse=True)
    mine = acc[0] if acc else None
    theirs = c.get('interval')
    match = (mine is None and theirs is None) or (mine and theirs and (mine[1], mine[2], mine[3]) == (theirs['validFrom'], theirs['validTo'], theirs['bars']))
    gh = hashlib.sha256(json.dumps(mine[4], separators=(',', ':')).encode()).hexdigest() if mine else None
    if not match:
        fail('INTERVAL %s own=%s cases=%s' % (sid, mine[1:4] if mine else None, theirs))
    if mine and gh != c['historyGuard']['pointsSha256']:
        fail('HISTORY_GUARD %s' % sid)
    # coverage (informational): filings inside the unlocked interval whose text contains a repurchase table header or a
    # quarterly price-range table but from which no anchor was used (missed anchors could hide a failing period)
    unparsed = []
    if theirs:
        lo_d, hi_d = D(theirs['validFrom']), D(theirs['validTo']) + datetime.timedelta(days=130)
        used_acc = {(p['accession'], p['type']) for p in c['periods']}
        for d in docs_by_url.values():
            if d['sid'] != sid or d.get('form') == '8-K' or not (lo_d <= D(d['filingDate']) <= hi_d):
                continue
            tt = text(d['url'])
            if re.search(r'(?i)average\s+price\s+paid', tt) and (d['accession'], 'B') not in used_acc:
                unparsed.append({'accession': d['accession'], 'filingDate': d['filingDate'], 'table': 'B_REPURCHASE'})
            if d['form'].startswith('10-K') and re.search(r'(?i)(price range|high\s+low|sales prices?)[^.]{0,400}quarter', tt) and (d['accession'], 'A') not in used_acc and d['filingDate'] < '2019-01-01':
                unparsed.append({'accession': d['accession'], 'filingDate': d['filingDate'], 'table': 'A_QUARTERLY'})
    summary[sid] = {'unusedTablesInsideInterval': unparsed, 'periods': len(c['periods']), 'quotesFound': n_quote, 'identityStatusAgree': n_id, 'aMappingAgree': n_year, 'bNumberAgree': n_num,
                    'bandAgree': n_band, 'ownInterval': [mine[1], mine[2], mine[3]] if mine else None, 'intervalMatch': bool(match), 'historyGuardMatch': (gh == c['historyGuard']['pointsSha256']) if mine else None}

# classification: identity statements found here but not by the extractor only make the registered result more conservative
# (a filing counted as BRACKETED instead of OWN, or an earlier last identity filing = an earlier interval end bound).
conservative = [p for p in problems if re.match(r'IDENTITY_STATUS \S+ \S+ \S+ own=OWN cases=BRACKETED$', p)]
for p in problems:
    m = re.match(r"IDENTITY_RANGE (\S+) \['([\d-]+)'\]\.\.\['([\d-]+)'\] vs ([\d-]+)\.\.([\d-]+)$", p)
    if m and m.group(2) == m.group(4) and m.group(3) > m.group(5):
        conservative.append(p)
other = [p for p in problems if p not in conservative]
all_match = all(v['intervalMatch'] and v['historyGuardMatch'] in (True, None) and v['bandAgree'] == v['periods'] and v['quotesFound'] == v['periods'] for v in summary.values())
verdict = 'PASS' if not problems else ('PASS_WITH_CONSERVATIVE_IDENTITY_FINDINGS' if not other and all_match else 'FINDINGS')
res = {'schemaVersion': 'v13-largecap-independent-check-1.0.0', 'implementation': 'python3 -I stdlib, separate parser and rules', 'cases': 'docs/quant-recovery/v13/largecap/cases-1.0.0.json',
       'casesSha256': hashlib.sha256(open(os.path.join(REPO, 'docs/quant-recovery/v13/largecap/cases-1.0.0.json'), 'rb').read()).hexdigest(),
       'codeSha256': hashlib.sha256(open(__file__, 'rb').read()).hexdigest(), 'checks': checks, 'perListing': summary,
       'problems': problems, 'problemCount': len(problems), 'conservativeIdentityFindings': len(conservative), 'otherFindings': len(other), 'verdict': verdict}
with open(OUT, 'w') as fh:
    json.dump(res, fh, indent=1)
    fh.write('\n')
print(json.dumps({'verdict': res['verdict'], 'problems': len(problems)}))
for p in problems[:40]:
    print(' ', p)
