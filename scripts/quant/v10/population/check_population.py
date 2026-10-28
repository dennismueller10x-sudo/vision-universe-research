"""V10 POPULATION: independent check (stdlib only, run with python3 -I). Separate implementation: it does NOT import
v10lib/sec_lib and re-derives every decision from raw inputs (series files, master, the private SEC cache bodies).

    python3 -I scripts/quant/v10/population/check_population.py --root . --cache <private>/http-cache \
        --out docs/quant-recovery/v10/population/independent-check.json

Checks
  I1  every cited SEC body (identity cases, lifecycle cases) is present in the cache and hashes to the recorded sha256
  I2  identity: each recorded MATCH anchor is re-found in its body by an own HTML-to-text + own date/price search,
      re-adjusted by own split factors and compared with the own same-day bar (MATCH within 2 %)
  I3  identity: own re-scan of the candidate documents (own selection from the cached submissions JSON, same protocol window/forms/budget)
      for same-day MISMATCH statements inside the final interval that the pipeline did not record
  I4  identity: own recomputation of cover/class/venue/age/delisting-after-cover/interval rules and of the decision
  I5  lifecycle: own re-derivation of lastTradeDate from the quoted sentence, own series gate, consideration amount present in quote
  I6  registers: history guards recomputed (JSON.stringify-compatible serialisation), record sets equal the qualified/resolved cases
"""
import argparse
import datetime as dt
import gzip
import hashlib
import html.parser
import json
import math
import os
import re
import subprocess

SIZES = (2097152, 3145728, 6291456)


class Cache:
    def __init__(self, d):
        self.d = d

    def body(self, url, sha=None, extra=()):
        keys = [url] + ['%s#v9-prefix-%d' % (url, n) for n in tuple(SIZES) + tuple(x for x in extra if x)]
        found = None
        for k in keys:
            h = hashlib.sha256(k.encode()).hexdigest()
            p = os.path.join(self.d, h[:2], h + '.gz')
            if os.path.exists(p):
                with gzip.open(p, 'rb') as f:
                    b = f.read()
                if sha is None or hashlib.sha256(b).hexdigest() == sha:
                    return b
                found = found or b
        return None if sha else found


class _Text(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_starttag(self, tag, attrs):
        self.parts.append(' ')

    def handle_endtag(self, tag):
        self.parts.append(' ')


def to_text(b):
    p = _Text()
    try:
        p.feed(b.decode('utf-8', errors='replace'))
    except Exception:  # noqa: BLE001
        pass
    return ' '.join(''.join(p.parts).split())


MON = {m: i + 1 for i, m in enumerate(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'])}
DATE_RX = re.compile(r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\.?\s+(\d{1,2}),?\s+(\d{4})\b', re.I)
DOLLAR_RX = re.compile(r'\$\s?(\d{1,6}(?:,\d{3})*\.\d{2,4})(?!\d)(?!\s*(?:million|billion|thousand))', re.I)
KEY_RX = re.compile(r'closing|last reported|last sale', re.I)
BAD_RX = re.compile(r'exercise|conversion|offering price|tender|purchase price|strike|would|implied|average|\bhigh\b|\blow\b|range|vwap|warrant|preferred|premium|\bbid\b|par value|day prior|C\$|CAD|increase', re.I)


def own_statements(text):
    """(date, price) pairs: a 'closing/last reported' keyword, then the first $x.xx amount of the same clause (<= 260 chars,
    no ';', no sentence end); no exclusion word between keyword and amount; the date is the last month-name date between
    keyword and amount, else the first one within 60 chars after the amount. Deliberately looser than the pipeline:
    it over-reports (other issuers, footnote dates); every over-report for a qualified id is adjudicated in
    independent-check-adjudication.json."""
    out = set()
    for k in KEY_RX.finditer(text):
        seg = text[k.start():k.start() + 260].split(';')[0]
        cut = re.search(r'[a-z)]\.\s+[A-Z(]', seg)
        if cut:
            seg = seg[:cut.start() + 2]
        pm = DOLLAR_RX.search(seg)
        if not pm:
            continue
        span = seg[:pm.end()]
        if BAD_RX.search(span):
            continue
        ds = DATE_RX.findall(span)
        if not ds:
            ds = DATE_RX.findall(text[k.start() + pm.end():k.start() + pm.end() + 60])[:1]
        if not ds:
            continue
        m, d, y = ds[-1]
        try:
            iso = dt.date(int(y), MON[m.lower()], int(d)).isoformat()
        except ValueError:
            continue
        out.add((iso, float(pm.group(1).replace(',', ''))))
    return out


def isowk(d):
    return dt.date.fromisoformat(d).isocalendar()[:2]


def split_after(doc, d):
    f = 1.0
    for sd, k in (doc.get('corporateActions') or {}).get('splits', []):
        if sd > d:
            f *= k
    return f


def same_day(weekly, daily, d, raw):
    wb = [p for p in weekly['points'] if isowk(p[0]) == isowk(d)]
    if not wb:
        return 'NO_BAR', None
    wb = wb[0]
    bar = None
    if wb[0] == d or (dt.date.fromisoformat(d).weekday() >= 5 and wb[0] < d):
        bar = wb
    elif daily:
        dm = {x[0]: x[1] for x in daily['points']}
        if d in dm and dm.get(wb[0]) == wb[1]:
            bar = [d, dm[d]]
    if not bar:
        return 'NOT_SAME_DAY', None
    ratio = bar[1] / (raw / split_after(weekly, d))
    return ('MATCH' if abs(ratio - 1) <= 0.02 else 'MISMATCH_SAME_DAY'), ratio


def zval(pts, i):
    if i < 1:
        return None
    r = math.log(pts[i][1] / pts[i - 1][1])
    h = [math.log(pts[k][1] / pts[k - 1][1]) for k in range(max(1, i - 52), i)]
    if len(h) < 10:
        return None
    mu = sum(h) / len(h)
    sd = math.sqrt(sum((x - mu) ** 2 for x in h) / (len(h) - 1))
    return r / sd if sd else None


def jsdump(x):
    return json.dumps(x, separators=(',', ':'), ensure_ascii=False)


def dd(a, b):
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


def plus(a, n):
    return (dt.date.fromisoformat(a) + dt.timedelta(days=n)).isoformat()


# own NYSE calendar (independent formulation)
def holidays(y):
    def obs(d):
        return d - dt.timedelta(1) if d.weekday() == 5 else (d + dt.timedelta(1) if d.weekday() == 6 else d)

    def nth(m, wd, n):
        first = dt.date(y, m, 1)
        return first + dt.timedelta(days=(wd - first.weekday()) % 7 + 7 * (n - 1))

    def lastwd(m, wd):
        nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
        last = nxt - dt.timedelta(1)
        return last - dt.timedelta(days=(last.weekday() - wd) % 7)
    a, b, c = y % 19, y % 4, y % 7
    k = y // 100
    p = (13 + 8 * k) // 25
    q = k // 4
    M = (15 - p + k - q) % 30
    N = (4 + k - q) % 7
    d = (19 * a + M) % 30
    e = (2 * b + 4 * c + 6 * d + N) % 7
    day = 22 + d + e
    easter = dt.date(y, 3, day) if day <= 31 else dt.date(y, 4, day - 31)
    if easter.month == 4 and easter.day == 26:
        easter = dt.date(y, 4, 19)
    if easter.month == 4 and easter.day == 25 and d == 28 and e == 6 and a > 10:
        easter = dt.date(y, 4, 18)
    s = {obs(dt.date(y, 1, 1)), nth(1, 0, 3), nth(2, 0, 3), easter - dt.timedelta(2), lastwd(5, 0), obs(dt.date(y, 7, 4)), nth(9, 0, 1), nth(11, 3, 4), obs(dt.date(y, 12, 25))}
    if y >= 2022:
        s.add(obs(dt.date(y, 6, 19)))
    return s


def prev_session(d):
    x = dt.date.fromisoformat(d) - dt.timedelta(1)
    while x.weekday() >= 5 or x in holidays(x.year):
        x -= dt.timedelta(1)
    return x.isoformat()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--cache', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    cache = Cache(a.cache)
    ev = lambda p: json.load(open(os.path.join(root, 'docs/quant-recovery/v10/population', p)))  # noqa: E731
    wk = lambda s: json.load(open(os.path.join(root, 'quant/data/market/discover-series-long', s + '.json')))  # noqa: E731
    dp = lambda s: os.path.join(root, 'quant/data/market/discover-series', s + '.json')  # noqa: E731
    daily = lambda s: json.load(open(dp(s))) if os.path.exists(dp(s)) else None  # noqa: E731
    master = json.load(open(os.path.join(root, 'quant/data/market/security-master/us-security-master.json')))
    rows_by = {}
    for r in master['rows']:
        if r.get('baseline_security_id'):
            rows_by.setdefault(r['baseline_security_id'], []).append(r)
    report = {'schemaVersion': 'v10-population-independent-check-1.0.0', 'implementation': 'python3 -I stdlib, own HTML text, own regexes, own calendar; no import of the pipeline code',
              'checks': {}}
    hashes = {'checked': 0, 'ok': 0, 'missing': []}

    def hcheck(url, sha, extra=()):
        hashes['checked'] += 1
        b = cache.body(url, sha, extra)
        if b is None:
            hashes['missing'].append(url)
            return None
        hashes['ok'] += 1
        return b

    # ------------------------------------------------ identity
    idc = ev('identity-cases.json')
    disagree, anchor_stats, rescans = [], {'recorded': 0, 'reverified': 0, 'notRefound': []}, {'documents': 0, 'missedMismatches': [], 'missedMatches': 0}
    own_q = {}
    for c in idc['cases']:
        sid = c['securityId']
        w, dly = wk(sid), daily(sid)
        reasons = []
        cov = c.get('latestCover') or {}
        if cov.get('accession'):
            b = hcheck(cov['url'], cov['sha256'], (cov.get('bytesRead'),))
            row = None
            if b is not None:
                t = b.decode('utf-8', errors='replace')
                facts = {}
                for m in re.finditer(r'<ix:nonNumeric[^>]*name="dei:(TradingSymbol|Security12bTitle|SecurityExchangeName)"[^>]*contextRef="([^"]*)"[^>]*>(.*?)</ix:nonNumeric>|<ix:nonNumeric[^>]*contextRef="([^"]*)"[^>]*name="dei:(TradingSymbol|Security12bTitle|SecurityExchangeName)"[^>]*>(.*?)</ix:nonNumeric>', t, re.S | re.I):
                    name, ctx, val = (m.group(1), m.group(2), m.group(3)) if m.group(1) else (m.group(5), m.group(4), m.group(6))
                    facts.setdefault(name, []).append(' '.join(re.sub(r'<[^>]+>', ' ', val).split()))
                syms = [re.sub(r'[\s.\-/_]', '', s.upper()) for s in facts.get('TradingSymbol', [])]
                row = re.sub(r'[\s.\-/_]', '', c['ticker'].upper()) in syms
            if not row:
                reasons.append('CIK_NOT_CONFIRMED')
            title = (cov.get('row') or {}).get('Security12bTitle') or ''
            if not re.search(r'common|ordinary|beneficial interest|subordinate voting|limited voting', title, re.I) or re.search(r'depositary|preferred|warrant|unit', title, re.I):
                reasons.append('CLASS_NOT_COMMON')
            exch = (cov.get('row') or {}).get('SecurityExchangeName') or ''
            mic = 'XASE' if re.search(r'american|mkt|amex', exch, re.I) else ('XNAS' if re.search(r'nasdaq', exch, re.I) else ('XNYS' if re.search(r'new york|nyse', exch, re.I) else None))
            sel = next((r for r in rows_by.get(sid, []) if r['canonical_id'] == c['selectedCanonicalId']), None)
            mmic = {'NYSE': 'XNYS', 'NASDAQ': 'XNAS', 'NYSE MKT': 'XASE', 'AMEX': 'XASE'}.get(sel['exchange']) if sel else None
            if mic is None or mic != mmic:
                reasons.append('EXCHANGE_MISMATCH')
            if dd(cov['filingDate'], w['asOf']) > 400:
                reasons.append('COVER_NOT_CURRENT')
            # own read of the cached submissions JSON
            subs = []
            for s in c.get('submissions', []):
                sb = hcheck(s['url'], s['sha256'])
                if sb is None:
                    continue
                j = json.loads(sb)
                blk = j['filings']['recent'] if 'filings' in j else j
                subs += [dict(zip(blk.keys(), v)) for v in zip(*blk.values())]
            if any(f['form'] in ('25', '25-NSE', '15-12B', '15-12G', '15-15D') and f['filingDate'] > cov['filingDate'] for f in subs):
                reasons.append('DELISTING_FORM_AFTER_LAST_COVER')
        else:
            subs = []
            reasons.append('CIK_NOT_CONFIRMED')
        if sum(r['canonical_id'] == c['selectedCanonicalId'] for r in rows_by.get(sid, [])) != 1:
            reasons.append('SELECTED_ROW_NOT_UNIQUE')
        sd = c.get('startDocument') or {}
        if sd.get('kind') == 'IXBRL_COVER_FIRST' and isinstance(sd.get('detail'), dict) and cov.get('row'):
            kind = lambda t: 'COMMON' if (re.search(r'common|ordinary|beneficial interest|subordinate voting|limited voting', t or '', re.I) and not re.search(r'depositary|preferred|warrant|unit', t or '', re.I)) else 'OTHER'  # noqa: E731
            if kind(sd['detail'].get('Security12bTitle')) != kind(cov['row'].get('Security12bTitle')):
                reasons.append('CLASS_CHANGE')
        if sd.get('state') == 'VERIFIED':
            hcheck(sd['url'], sd['sha256'], (sd.get('bytesRead'),))
        elif not (sd.get('state') == 'NO_V9_START_DOCUMENT' and c['v9']['basis'] == 'SERIES_STARTS_INSIDE_COVER_CONFIRMED_INTERVAL'):
            reasons.append('START_DOCUMENT_NOT_REVERIFIED')
        # anchors
        own_matches, own_mm = set(), set()
        for an in c.get('anchors', []):
            anchor_stats['recorded'] += 1
            b = hcheck(an['url'], an['sha256'], (an.get('bytesRead'),))
            if b is None:
                continue
            st = own_statements(to_text(b))
            if (an['date'], an['sourceRawPrice']) in st or any(x[1] == an['sourceRawPrice'] and abs(dd(x[0], an['date'])) <= 0 for x in st):
                anchor_stats['reverified'] += 1
            else:
                anchor_stats['notRefound'].append({'securityId': sid, 'date': an['date'], 'price': an['sourceRawPrice'], 'accession': an['accession']})
            stt, ratio = same_day(w, dly, an['date'], an['sourceRawPrice'])
            if an.get('attributed', True):
                (own_matches if stt == 'MATCH' else own_mm if stt == 'MISMATCH_SAME_DAY' else set()).add(an['date'])
            if stt != an['state']:
                disagree.append({'securityId': sid, 'what': 'ANCHOR_STATE', 'date': an['date'], 'pipeline': an['state'], 'own': stt})
        # I3 re-scan: own candidate selection
        forms = {'10-K', '10-K405', '20-F', '40-F', 'DEF 14A', '424B1', '424B2', '424B3', '424B4', '424B5', '424B7', 'S-1', 'S-3', 'S-4', 'S-8', '8-K'}
        lo = plus(c['v9']['validFrom'], -30)
        cands = sorted([f for f in subs if f['form'] in forms and lo <= f['filingDate'] <= w['asOf'] and f.get('primaryDocument')
                        and (f['form'] != '8-K' or '2.01' in (f.get('items') or '') or '8.01' in (f.get('items') or ''))],
                       key=lambda f: (f['filingDate'], f['accessionNumber']), reverse=True)[:40]
        for f in cands:
            url = 'https://www.sec.gov/Archives/edgar/data/%d/%s/%s' % (int(c['cik']), f['accessionNumber'].replace('-', ''), f['primaryDocument'])
            b = cache.body(url)
            if b is None:
                continue
            rescans['documents'] += 1
            for (d, p) in own_statements(to_text(b)):
                if not c.get('validFrom') or d < c['validFrom']:
                    continue
                stt, ratio = same_day(w, dly, d, p)
                if stt == 'MISMATCH_SAME_DAY' and d not in own_mm and not any(x['date'] == d and x['sourceRawPrice'] == p for x in c.get('anchors', [])):
                    rescans['missedMismatches'].append({'securityId': sid, 'date': d, 'price': p, 'url': url, 'ratio': round(ratio, 4)})
                if stt == 'MATCH' and d not in own_matches:
                    rescans['missedMatches'] += 1
        # interval rules (own)
        pts = w['points']
        s1 = c['v9']['validFrom']
        mdates = sorted(own_matches)
        allm = sorted({an['date'] for an in c.get('anchors', []) + c.get('anchorsBeforeInterval', []) if an['state'] == 'MATCH' and an.get('attributed', True)})
        first_any = allm[0] if allm else None
        # the 730-day rule uses all attributed MATCH dates the pipeline saw (including those before the final start)
        if first_any and dd(s1, first_any) > 730:
            s1 = next((p[0] for p in pts if p[0] >= plus(first_any, -730)), None)
        for r in rows_by.get(sid, []):
            if r['canonical_id'] == c['selectedCanonicalId'] or not s1:
                continue
            e = r.get('end_date') or w['asOf']
            lo2, hi2 = max(r['start_date'], s1), min(e, w['asOf'])
            if lo2 <= hi2 and dd(lo2, hi2) > 31:
                s1 = next((p[0] for p in pts if p[0] > e), None)
        own_from = s1
        if c.get('validFrom') != own_from and not c.get('venueTransfers') and not c.get('levelBreaks'):
            disagree.append({'securityId': sid, 'what': 'VALID_FROM', 'pipeline': c.get('validFrom'), 'own': own_from})
        vf = c.get('validFrom')
        if vf:
            inside_m = [d for d in own_matches if d >= vf]
            inside_mm = [d for d in own_mm if d >= vf]
            if not inside_m:
                reasons.append('NO_SAME_DAY_PRICE_EVIDENCE')
            if inside_mm:
                reasons.append('SOURCE_PRICE_CONFLICT')
            g = c.get('historyGuard')
            if g and hashlib.sha256(jsdump([p for p in pts if p[0] >= vf]).encode()).hexdigest() != g['pointsSha256']:
                disagree.append({'securityId': sid, 'what': 'HISTORY_GUARD'})
        else:
            reasons.append('NO_INTERVAL_LEFT')
        dec = 'QUALIFIED_SEC_SAME_DAY_PRICE_AND_COVER' if not reasons else 'EXCLUDED'
        own_q[sid] = dec
        if dec != c['decision'] or sorted(set(reasons)) != sorted(set(c['reasons'])):
            disagree.append({'securityId': sid, 'what': 'DECISION', 'pipeline': [c['decision'], c['reasons']], 'own': [dec, sorted(set(reasons))]})
    nr = {(x['securityId'], x['date'], x['accession']) for x in anchor_stats['notRefound']}
    refound_ok = sum(1 for c in idc['cases'] if c['decision'].startswith('QUALIFIED') and any(
        an['state'] == 'MATCH' and an.get('attributed', True) and (c['securityId'], an['date'], an['accession']) not in nr for an in c['anchors']))
    report['checks']['identity'] = {'qualifiedWithIndependentlyRefoundMatch': refound_ok,'cases': len(idc['cases']), 'ownQualified': sum(v.startswith('QUALIFIED') for v in own_q.values()),
                                    'pipelineQualified': sum(c['decision'].startswith('QUALIFIED') for c in idc['cases']),
                                    'anchors': {'recorded': anchor_stats['recorded'], 'reverifiedInBody': anchor_stats['reverified'], 'notRefound': anchor_stats['notRefound'][:50], 'notRefoundCount': len(anchor_stats['notRefound'])},
                                    'rescan': {'documents': rescans['documents'], 'missedMismatchesInsideInterval': rescans['missedMismatches'], 'ownMatchesNotRecorded': rescans['missedMatches']},
                                    'disagreements': disagree}
    # ------------------------------------------------ lifecycle
    lcd = ev('lifecycle-cases.json')
    ldis, lres = [], 0
    for c in lcd['cases']:
        if not c.get('resolved'):
            continue
        lres += 1
        sid = c['securityId']
        w = wk(sid)
        q = next(s for s in c['sources'] if s.get('lastTradeQuote'))
        b = hcheck(q['url'], q['sha256'], (q.get('bytesRead'),))
        if b is None:
            continue
        lt = c['lastTrade']
        txt = to_text(b)
        stated = DATE_RX.findall(lt.get('definitionQuote') or lt['quote'])
        if lt.get('definitionQuote') and lt['definitionQuote'] not in txt:
            ldis.append({'securityId': sid, 'what': 'DEFINITION_QUOTE_NOT_IN_BODY'})
        if ' '.join(lt['quote'].split()[2:-2]) not in txt:
            ldis.append({'securityId': sid, 'what': 'LAST_TRADE_QUOTE_NOT_IN_BODY'})
        own_stated = None
        for m, d, y in (stated[:1] if lt.get('definitionQuote') else stated[::-1]):
            try:
                own_stated = dt.date(int(y), MON[m.lower()], int(d)).isoformat()
                break
            except ValueError:
                pass
        prior = re.search(r'(prior to|before|as of)\s+(the\s+)?(opening|open|commencement|market open)', lt['quote'], re.I)
        own_ltd = prev_session(own_stated) if (own_stated and prior) else own_stated
        if own_ltd != lt['lastTradeDate']:
            ldis.append({'securityId': sid, 'what': 'LAST_TRADE_DATE', 'pipeline': lt['lastTradeDate'], 'own': own_ltd})
        frozen = c['weeklyTail']['close']
        if any(p[1] != frozen for p in w['points'] if p[0] > lt['lastTradeDate']):
            ldis.append({'securityId': sid, 'what': 'SERIES_GATE'})
        kept = [p for p in w['points'] if p[0] <= lt['lastTradeDate']]
        if hashlib.sha256(jsdump(kept).encode()).hexdigest() != c['historyGuard']['pointsSha256']:
            ldis.append({'securityId': sid, 'what': 'HISTORY_GUARD'})
        t = c.get('terminal') or {}
        cs = next((s for s in c['sources'] if s.get('considerationQuote')), None)
        if t.get('cashPerShare') is not None:
            if not cs or ('%g' % t['cashPerShare']) not in cs['considerationQuote'].replace(',', '') and ('%.2f' % t['cashPerShare']) not in cs['considerationQuote']:
                ldis.append({'securityId': sid, 'what': 'CASH_NOT_IN_QUOTE'})
            elif hcheck(cs['url'], cs['sha256'], (cs.get('bytesRead'),)) is None:
                ldis.append({'securityId': sid, 'what': 'CONSIDERATION_BODY_MISSING'})
        if t.get('kind') == 'CASH_MERGER' and cs and re.search(r'(?:\band\b|\bplus\b)\s*(?:\(ii\)\s*)?\d', cs['considerationQuote'].split('$')[-1]):
            ldis.append({'securityId': sid, 'what': 'CASH_ONLY_KIND_BUT_QUOTE_NAMES_SECOND_COMPONENT'})
        if t.get('stockRatio') is not None and (not cs or str(t['stockRatio']).rstrip('0') not in cs['considerationQuote']):
            ldis.append({'securityId': sid, 'what': 'RATIO_NOT_IN_QUOTE'})
    report['checks']['lifecycle'] = {'resolvedCases': lres, 'disagreements': ldis}
    # ------------------------------------------------ registers (via node only to read the module data)
    reg = json.loads(subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify({i:require('./quant/engines/research-identity-evidence.cjs'),l:require('./quant/engines/research-listing-lifecycle.cjs')}))"], cwd=root))
    v10ids = sorted(r['securityId'] for r in reg['i'].get('v10', {}).get('records', []))
    rdis = []
    if v10ids != sorted(k for k, v in own_q.items() if v.startswith('QUALIFIED')):
        rdis.append({'what': 'V10_RECORD_SET', 'registry': v10ids, 'own': sorted(k for k, v in own_q.items() if v.startswith('QUALIFIED'))})
    for r in reg['i'].get('v10', {}).get('records', []):
        pts = [p for p in wk(r['securityId'])['points'] if r['historyGuard']['checkedFrom'] <= p[0] <= r['historyGuard']['checkedTo']]
        if hashlib.sha256(jsdump(pts).encode()).hexdigest() != r['historyGuard']['pointsSha256']:
            rdis.append({'what': 'V10_GUARD', 'securityId': r['securityId']})
    lids = sorted(r['securityId'] for r in reg['l']['records'])
    if lids != sorted(c['securityId'] for c in lcd['cases'] if c.get('resolved')):
        rdis.append({'what': 'LIFECYCLE_RECORD_SET'})
    report['checks']['registers'] = {'v10Records': len(v10ids), 'lifecycleRecords': len(lids), 'disagreements': rdis}
    report['checks']['hashes'] = {'checked': hashes['checked'], 'ok': hashes['ok'], 'missing': hashes['missing'][:30], 'missingCount': len(hashes['missing'])}
    core = not disagree and not ldis and not rdis and not hashes['missing'] and refound_ok == report['checks']['identity']['pipelineQualified']
    # The looser re-scan over-reports; its hits for qualified ids need the manual reading (independent-check-adjudication.json).
    report['verdict'] = ('PASS' if not rescans['missedMismatches'] else 'PASS_DECISIONS_AGREE_RESCAN_HITS_NEED_ADJUDICATION') if core else 'DIFFERENCES_REPORTED'
    with open(a.out, 'w') as f:
        json.dump(report, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(json.dumps({'verdict': report['verdict'], 'identity': {k: v for k, v in report['checks']['identity'].items() if k != 'disagreements'},
                      'identityDisagreements': len(disagree), 'lifecycleDisagreements': len(ldis), 'registerDisagreements': len(rdis), 'hashes': report['checks']['hashes']['ok']}, indent=1)[:3000])


if __name__ == '__main__':
    main()
