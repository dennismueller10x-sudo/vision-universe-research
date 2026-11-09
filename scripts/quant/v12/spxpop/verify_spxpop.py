#!/usr/bin/env python3
"""V12 SPXPOP: independent Python cross-check (stdlib only, run with python3 -I).

Separate implementation, not a port of build-population.cjs:
  P  Positions parsed again from the raw SEC holdings documents (private HTTP cache, sha256-checked):
     N-PORT with xml.etree, report schedules (N-30D/N-30B-2/N-Q) with html.parser / a line splitter (parser lineage:
     INDEXPOP verify_indexpop.py, extended here to return the positions).
  L  Own identity link between consecutive dates: CUSIP/ISIN, else an own normalized name key (unique on both sides).
     No CIK and no fuzzy tier (the JS chain has both) - the Python chain is deliberately simpler.
  S  Own implementation of the split rule (rules-1.1.0 splitDetection): fund flow = median share ratio, q, trigger,
     nearest ratio, residual test with margin.  S2: an alternative decision method (sensitivity, not the rule): least
     combined squared standardized error over s in {1} + ratios, ambiguous when the two best are within 1.0.
  R  Period index price return sum(w0 * R) with exits at 0 and ambiguous cases at the midpoint, against the fund price
     return from the multi-asset series (read independently).
  M  Member-level comparison with the JS detail (private detail-<v>.json): same fund, t0, name and weight.
  I  (1.1.1, correction after independent review) Identity breaks at mergers: for every link the JS build unlinked
     (detail identityBreaks), the two positions are located in the own parse (name, else unique weight / name), q, p1/p0
     and the index base are recomputed with the own chain and the rule (C3/C4 link, SHARE_CHANGE/AMBIGUOUS_CA, every
     hypothesis > log 2 above the index) is evaluated independently; and the own CUSIP/name chain is scanned for links
     with the same price/share signature (exempt by tier, reported).
Usage: python3 -I verify_spxpop.py <repo-root> <indexpop-private-dir> <spxpop-private-dir> <rules-version> <out.json> [funds]
"""
import bisect
import gzip
import hashlib
import html
import json
import math
import re
import statistics
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT, PRIV, WORK, V, OUT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve(), sys.argv[4], Path(sys.argv[5])
FUNDS = (sys.argv[6] if len(sys.argv) > 6 else 'SPY,IWB,QQQ,IWM').split(',')
RULES = json.loads((ROOT / 'docs/quant-recovery/v12/spxpop' / ('rules-%s.json' % V)).read_text())
CACHE = PRIV / 'http-cache'


def ratio_value(s):
    a, _, b = s.partition('/')
    return float(a) / float(b or 1)


RATIOS = sorted(ratio_value(x) for x in RULES['splitDetection']['ratios'])
TOL = float(re.search(r'<=\s*([0-9.]+)', RULES['splitDetection']['ratioTolerance']).group(1))
TRIGGER, MARGIN, MAXRES, CLEAN = math.log(1.15), 0.10, 1.0, math.log(1.10)


def cached(url):
    h = hashlib.sha256(url.encode()).hexdigest()
    p = CACHE / h[:2] / (h + '.gz')
    return gzip.decompress(p.read_bytes()) if p.exists() else None


# ---------------- P: parsers ----------------
def nport_positions(raw):
    root = ET.fromstring(raw)
    ns = root.tag.split('}')[0] + '}' if root.tag.startswith('{') else ''
    out = []
    for sec in root.iter(ns + 'invstOrSec'):
        g = {c.tag.replace(ns, ''): (c.text or '').strip() for c in sec}
        isin = None
        for c in sec.iter(ns + 'isin'):
            isin = c.get('value')
        try:
            val, bal = float(g.get('valUSD', 'nan')), float(g.get('balance', 'nan'))
        except ValueError:
            continue
        if g.get('assetCat') == 'EC' and g.get('payoffProfile') == 'Long' and g.get('units') == 'NS' and val > 0 and bal > 0:
            cus = g.get('cusip') or ''
            out.append({'name': g.get('name') or g.get('title') or '', 'title': g.get('title') or '', 'cusip': cus if re.fullmatch(r'[0-9A-Z]{8}[0-9]', cus) and cus.strip('0') else None,
                        'isin': isin if isin and re.fullmatch(r'[A-Z]{2}[0-9A-Z]{9}[0-9]', isin) and not re.match(r'[A-Z]{2}0{9}', isin) else None, 'shares': bal, 'value': val})
    return out


class Rows(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.cell, self.row, self.intr, self.incell, self.buf = [], [], None, False, False, []
    def flush_text(self):
        t = ' '.join(''.join(self.buf).split())
        if t:
            self.rows.append([t])
        self.buf = []
    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.flush_text(); self.row, self.intr = [], True
        elif tag in ('td', 'th') and self.intr:
            if self.incell:
                self.end_cell()
            self.incell, self.cell = True, []
        elif tag in ('br', 'p', 'div') and not self.intr:
            self.flush_text()
    def end_cell(self):
        t = ' '.join(''.join(self.cell).replace('\xa0', ' ').split())
        if t:
            self.row.append(t)
        self.incell = False
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.incell:
            self.end_cell()
        elif tag == 'tr' and self.intr:
            if self.incell:
                self.end_cell()
            if self.row:
                self.rows.append(self.row)
            self.intr, self.row = False, None
        elif tag in ('p', 'div', 'table', 'h1', 'h2', 'h3', 'h4', 'center') and not self.intr:
            self.flush_text()
    def handle_data(self, data):
        (self.cell if self.incell else self.buf if not self.intr else []).append(data)


def text_rows(raw):
    rows = []
    for line in raw.decode('latin-1').splitlines():
        line = re.sub(r'</?(TABLE|CAPTION|S|C|PAGE|FN)>', ' ', line, flags=re.I)
        if not line.strip():
            continue
        line = re.sub(r'\.{3,}', '  ', line.replace('\t', '    '))
        rows.append([c.strip() for c in re.split(r'\s{2,}', line) if c.strip()])
    return rows


NUM = re.compile(r'^\(?\d{1,3}(?:,\d{3})*(?:\.\d+)?\)?$|^\d+(?:\.\d+)?$')


def report_positions(raw, is_html, fund):
    if is_html:
        p = Rows(); p.feed(raw.decode('latin-1')); p.flush_text()
        rows = [[html.unescape(c).replace('®', '').replace('—', '-').replace('–', '-') for c in r] for r in p.rows]
    else:
        rows = text_rows(raw)
    fund_re = {'IWB': r'\biSHARES\s+RUSSELL 1000 (ETF|INDEX FUND)\b', 'IWM': r'\biSHARES\s+RUSSELL 2000 (ETF|INDEX FUND)\b', 'IWV': r'\biSHARES\s+RUSSELL 3000 (ETF|INDEX FUND)\b'}.get(fund)
    any_re = r'\biSHARES\s[^|]{0,70}?\b(ETF|INDEX FUND)\b'
    scope, started, schedule, carry, seen, out = fund_re is None, False, False, '', set(), []
    for r in rows:
        cells = []
        for c in r:
            m = re.match(r'^(.*[A-Za-z.)*])\s+\$?\s*(\d{1,3}(?:,\d{3})+)$', c)
            cells += [m.group(1), m.group(2)] if m and 'ost' not in c else [c]
        j = ' '.join(cells)
        if fund_re and re.search(any_re, j, re.I) and len(j) < 220:
            now = bool(re.search(fund_re, j, re.I))
            schedule = schedule or now
            scope = now
            continue
        if not scope:
            continue
        if re.search(r'SCH?EDULE OF (INVESTMENTS|PORTFOLIO INVESTMENTS)', j, re.I) and len(j) < 200:
            schedule, carry = True, ''
            continue
        texts = [c for c in cells if re.search('[A-Za-z]', c)]
        nums = [c.replace('$', '').replace(' ', '') for c in cells if not re.search('[A-Za-z]', c)]
        nums = [c for c in nums if c and NUM.match(c)]
        tj = ' '.join(texts)
        if not started:
            if schedule and re.search(r'COMMON STOCK|^SECURITY$|^NAME OF ISSUER', tj, re.I) and 'TOTAL' not in tj.upper():
                started = True
            continue
        lab = (carry + ' ' + tj).strip()
        if re.search(r'TOTAL (COMMON STOCKS?|INVESTMENTS)', lab, re.I):
            if nums or re.search(r'\)\s*\$?\s*(\d{1,3}(?:,\d{3})+)\s*$', lab):
                break
            carry = lab
            continue
        if not nums:
            continue
        if len(nums) >= 2 and lab:
            sh, val = float(nums[-2].strip('()').replace(',', '')), float(nums[-1].strip('()').replace(',', ''))
            if sh > 0 and val > 0:
                key = (re.sub(r'[^A-Z]', '', lab.upper())[-40:], sh, val)
                if key not in seen:
                    seen.add(key); out.append({'name': tj, 'title': '', 'cusip': None, 'isin': None, 'shares': sh, 'value': val})
        carry = ''
    return out


# ---------------- L: own name key ----------------
DROP = {'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED', 'PLC', 'LLC', 'LP', 'NV', 'SA', 'AG', 'SE', 'THE', 'NEW', 'COM', 'COMMON', 'STOCK', 'SHS', 'SHARES', 'ORD', 'ADR', 'NVS'}


def name_key(name, title=''):
    name = re.sub(r'^\s*\(Percentages shown are based on [^)]*\)\s*', '', re.sub(r'^.*\(continued\)\s*', '', name, flags=re.I), flags=re.I)
    name = re.sub(r'\(\s*[a-z]\s*\)', ' ', name)  # footnote markers (a), (b)
    s = (title if re.search(r'\b(CLASS|CL)\b', title or '', re.I) else name).upper().replace('&', ' AND ')
    cls = ''
    m = re.search(r'\b(?:CLASS|CL)\s*[- .]?\s*([A-C])\b', s)
    if m:
        cls, s = m.group(1), s.replace(m.group(0), ' ')
    s = re.sub(r'\([^)]*\)', lambda x: ' ' + x.group(0)[1:-1] + ' ', s)
    toks = [t for t in re.sub(r'[^A-Z0-9]+', ' ', s).split() if t not in DROP]
    return (' '.join(toks) + '|' + cls) if toks else None


def months(a, b):
    return (int(b[:4]) - int(a[:4])) * 12 + int(b[5:7]) - int(a[5:7])


def classify(q, pr, base):
    e_none = math.log(pr) - base
    if abs(math.log(q)) < TRIGGER:
        return 'NONE', 1.0, pr - 1, pr - 1
    s = min(RATIOS, key=lambda r: abs(math.log(q) - math.log(r)))
    within = abs(math.log(q) - math.log(s)) <= TOL
    e_split = math.log(s * pr) - base
    if within and abs(e_split) + MARGIN <= abs(e_none) and abs(e_split) <= MAXRES:
        return 'SPLIT', s, s * pr - 1, s * pr - 1
    if (not within or abs(e_none) + MARGIN <= abs(e_split)) and abs(e_none) <= MAXRES:
        return 'SHARE_CHANGE', 1.0, pr - 1, pr - 1
    a, b = pr - 1, (s * pr - 1 if within else pr - 1)
    return 'AMBIGUOUS_CA', None, min(a, b), max(a, b)


def classify_alt(q, pr, base, mo):
    sig_p = 0.25 * math.sqrt(max(mo, 1) / 6.0)
    sc = sorted(((math.log(q) - math.log(s)) / 0.12) ** 2 * (0.15 if s == 1 else 1.0) + ((math.log(s * pr) - base) / sig_p) ** 2 for s in [1.0] + RATIOS)
    best = min([1.0] + RATIOS, key=lambda s: ((math.log(q) - math.log(s)) / 0.12) ** 2 * (0.15 if s == 1 else 1.0) + ((math.log(s * pr) - base) / sig_p) ** 2)
    return (best if sc[1] - sc[0] >= 1.0 else None)


def fund_points(f):
    p = ROOT / 'quant/data/market/multi-asset/series' / (f + '.json')
    if not p.exists():
        return None
    pts = json.loads(p.read_text())['points']
    return [x[0] for x in pts], [x[1] for x in pts]


def close_on_or_before(fp, d):
    i = bisect.bisect_right(fp[0], d) - 1
    return (fp[0][i], fp[1][i]) if i >= 0 else None


def main():
    val = json.loads((ROOT / 'docs/quant-recovery/v12/indexpop/validation-1.0.0.json').read_text())
    snaps = {}
    for d in val['dates']:
        if d['fund'] not in FUNDS or not d['valid']:
            continue
        raw = cached(d['url'])
        if raw is None or hashlib.sha256(raw).hexdigest() != d['sha256']:
            raise SystemExit('RAW_MISSING_OR_SHA ' + d['url'])
        pos = nport_positions(raw) if d['form'].startswith('NPORT') else report_positions(raw, d['url'].lower().endswith('.htm'), d['fund'])
        tot = sum(p['value'] for p in pos)
        for p in pos:
            p['w'], p['p'], p['nk'] = p['value'] / tot, p['value'] / p['shares'], name_key(p['name'], p['title'])
        snaps.setdefault(d['fund'], []).append((d['date'], pos, d['form']))
        print(d['fund'], d['date'], len(pos), d['memberCount'], flush=True)
    detail = {(x['fund'], x['t0']): x for x in json.loads((WORK / ('detail-%s.json' % V)).read_text())}
    periods_js = {(x['fund'], x['t0']): x for x in json.loads((ROOT / 'docs/quant-recovery/v12/spxpop' / ('periods-%s.json' % V)).read_text())['periods']}
    out = {'schemaVersion': 'v12-spxpop-python-check-%s' % V, 'ruleVersion': V, 'evidenceKind': 'TECHNICAL_PARITY', 'funds': FUNDS,
           'note': 'Second implementation in another language on the same raw SEC documents (own parser, own chain without CIK/fuzzy tiers, own split code); not an independent data source.',
           'periods': [], 'member': {}, 'splitParity': {}, 'alternativeMethod': {}}
    idb = {'jsCases': 0, 'located': 0, 'pyRuleBreak': 0, 'pyLinkedByCusipOrName': 0, 'cases': [], 'ownChainSameSignature': []}
    agg = {'pairs': 0, 'classEqual': 0, 'returnWithin1e-6': 0, 'returnWithin0_1pp': 0, 'jsMissing': 0, 'diffs': []}
    sp = {'NONE': 0, 'SPLIT': 0, 'SHARE_CHANGE': 0, 'AMBIGUOUS_CA': 0}
    alt = {'pairs': 0, 'sameFactor': 0, 'altAmbiguous': 0, 'ruleAmbiguous': 0, 'differentFactorWeight': 0.0, 'pairsWeight': 0.0, 'examples': []}
    for f, lst in snaps.items():
        lst.sort()
        fp = fund_points(f)
        for (t0, A, form0), (t1, B, form1) in zip(lst, lst[1:]):
            mo = months(t0, t1)
            lb, links = {}, {}
            bc = {}
            for j, b in enumerate(B):
                for k in (b['cusip'], b['isin']):
                    if k:
                        bc[k] = -1 if k in bc else j
            for i, a in enumerate(A):
                for k in (a['cusip'], a['isin']):
                    if k and bc.get(k, -1) >= 0 and bc[k] not in lb:
                        links[i] = bc[k]; lb[bc[k]] = i; break
            na, nb = {}, {}
            for i, a in enumerate(A):
                if i not in links and a['nk']:
                    na.setdefault(a['nk'], []).append(i)
            for j, b in enumerate(B):
                if j not in lb and b['nk']:
                    nb.setdefault(b['nk'], []).append(j)
            for k, ia in na.items():
                ib = nb.get(k)
                if ib and len(ia) == 1 and len(ib) == 1:
                    links[ia[0]] = ib[0]; lb[ib[0]] = ia[0]
            F = statistics.median(B[j]['shares'] / A[i]['shares'] for i, j in links.items())
            num = den = 0.0
            for i, j in links.items():
                q = B[j]['shares'] / A[i]['shares'] / F
                if abs(math.log(q)) < CLEAN:
                    num += A[i]['w'] * (B[j]['p'] / A[i]['p'] - 1); den += A[i]['w']
            base = math.log(1 + num / den)
            for x in (detail.get((f, t0)) or {}).get('identityBreaks', []):
                idb['jsCases'] += 1
                ia = [i for i, a in enumerate(A) if a['name'].strip() == x['nameT0'].strip()] or [i for i, a in enumerate(A) if abs(a['w'] - x['w']) < 1e-9]
                jb = [j for j, b in enumerate(B) if b['name'].strip() == x['nameT1'].strip()]
                rec = {'fund': f, 't0': t0, 'nameT0': x['nameT0'], 'nameT1': x['nameT1'], 'located': len(ia) == 1 and len(jb) == 1}
                if rec['located']:
                    idb['located'] += 1
                    a, b = A[ia[0]], B[jb[0]]
                    q, pr = b['shares'] / a['shares'] / F, b['p'] / a['p']
                    cls, s_, lo, hi = classify(q, pr, base)
                    hyp = [lo] if s_ is not None else [lo, hi]
                    ex = min(math.log(1 + h) for h in hyp) - base
                    brk = cls in ('SHARE_CHANGE', 'AMBIGUOUS_CA') and ex > math.log(2)
                    idb['pyRuleBreak'] += brk
                    linked = links.get(ia[0]) == jb[0]
                    idb['pyLinkedByCusipOrName'] += linked
                    rec.update({'qPy': round(q, 4), 'qJs': round(x['q'], 4), 'classPy': cls, 'classJs': x['cls'], 'excessLogPy': round(ex, 4), 'excessLogJs': round(x['excessLog'], 4), 'breakPy': brk, 'linkedInPyChain': linked})
                idb['cases'].append(rec)
            for i, j in links.items():
                a, b = A[i], B[j]
                q, pr = b['shares'] / a['shares'] / F, b['p'] / a['p']
                cls, s_, lo, hi = classify(q, pr, base)
                if cls in ('SHARE_CHANGE', 'AMBIGUOUS_CA') and min(math.log(1 + h) for h in ([lo] if s_ is not None else [lo, hi])) - base > math.log(2):
                    idb['ownChainSameSignature'].append([f, t0, a['name'][:40], b['name'][:40], cls, round(q, 4), round(pr, 4), round(100 * a['w'], 4)])
            rp = 0.0
            jsrows, jsw = {}, {}
            for r in (detail.get((f, t0)) or {}).get('rows', []):
                jsrows.setdefault((r['name'], round(r['w'], 9)), []).append(r)
                jsw.setdefault(round(r['w'], 9), []).append(r)
            for i, a in enumerate(A):
                if i not in links:
                    continue
                b = B[links[i]]
                q, pr = b['shares'] / a['shares'] / F, b['p'] / a['p']
                cls, s, lo, hi = classify(q, pr, base)
                sp[cls] += 1
                rp += a['w'] * ((lo + hi) / 2)
                # alternative method
                al = classify_alt(q, pr, base, mo); alt['pairs'] += 1; alt['pairsWeight'] += a['w']
                if al is None:
                    alt['altAmbiguous'] += 1
                if s is None:
                    alt['ruleAmbiguous'] += 1
                if al is not None and s is not None:
                    if abs(math.log(al / s)) < 1e-9:
                        alt['sameFactor'] += 1
                    else:
                        alt['differentFactorWeight'] += a['w']
                        if len(alt['examples']) < 40:
                            alt['examples'].append([f, t0, a['name'][:40], round(q, 4), round(pr, 4), s, al, round(100 * a['w'], 4)])
                # member parity with JS
                cand = jsrows.get((a['name'], round(a['w'], 9))) or []
                if not cand and len(jsw.get(round(a['w'], 9), [])) == 1:
                    cand = jsw[round(a['w'], 9)]  # same weight, unique in the period (names are parsed differently)
                if not cand:
                    agg['jsMissing'] += 1
                    continue
                r = cand[0]
                agg['pairs'] += 1
                jcls = r.get('cls')
                agg['classEqual'] += (jcls == cls)
                jpt = r.get('point')
                ppt = None if s is None else lo
                if jpt is None and ppt is None:
                    agg['returnWithin1e-6'] += 1; agg['returnWithin0_1pp'] += 1
                elif jpt is not None and ppt is not None:
                    d = abs(jpt - ppt)
                    agg['returnWithin1e-6'] += d <= 1e-6; agg['returnWithin0_1pp'] += d <= 1e-3
                    if d > 1e-3 and len(agg['diffs']) < 60:
                        agg['diffs'].append([f, t0, a['name'][:40], jcls, cls, round(jpt, 5), round(ppt, 5)])
                elif len(agg['diffs']) < 60:
                    agg['diffs'].append([f, t0, a['name'][:40], jcls, cls, jpt, ppt])
            rf = None
            if fp:
                c0, c1 = close_on_or_before(fp, t0), close_on_or_before(fp, t1)
                rf = c1[1] / c0[1] - 1
            js = periods_js.get((f, t0), {})
            linkedw = sum(A[i]['w'] for i in links)
            out['periods'].append({'fund': f, 't0': t0, 't1': t1, 'membersPy': len(A), 'linkedPy': len(links), 'linkedWPy': round(linkedw, 6), 'obsChainWJs': (js.get('byStatus', {}).get('OBS_CHAIN') or {}).get('w'),
                                   'rPointLinkedPy': round(rp, 6), 'rFundPy': None if rf is None else round(rf, 6), 'errorPpPy_linkedExitsZero': None if rf is None else round(100 * (rp - rf), 4),
                                   'rPointJs': js.get('rPoint'), 'errorPpJs': js.get('errorPp'), 'qualificationJs': js.get('qualification')})
        print(f, 'done', flush=True)
    out['member'] = agg
    idb['note'] = 'ownChainSameSignature: links of the own CUSIP/name chain with the merger price/share signature; the rule exempts them by tier (same CUSIP or name = same security; reverse splits outside the ratio set, distress recoveries).'
    out['identityBreaks'] = idb
    out['splitParity'] = {'pythonClassCounts': sp}
    alt['differentFactorWeightShare'] = round(alt['differentFactorWeight'] / alt['pairsWeight'], 6) if alt['pairsWeight'] else None
    out['alternativeMethod'] = alt
    # period-level agreement of the two implementations
    pe = [p for p in out['periods'] if p['rPointJs'] is not None]
    dif = sorted(abs(100 * (p['rPointLinkedPy'] - p['rPointJs'])) for p in pe)
    out['periodSummary'] = {'periods': len(pe), 'medianAbsDiffPp_rPoint': dif[len(dif) // 2] if dif else None, 'p90AbsDiffPp_rPoint': dif[int(0.9 * len(dif))] if dif else None,
                            'note': 'Python rPoint covers own-chain links only (exits/cross-fund/series cases at 0); the JS rPoint includes cross-fund/series returns for exits - differences of the order of the JS non-chain weight times their return are expected.'}
    OUT.write_text(json.dumps(out, indent=1) + '\n')
    print(json.dumps({k: v for k, v in agg.items() if k != 'diffs'}), json.dumps(out['periodSummary']), json.dumps({k: v for k, v in alt.items() if k != 'examples'}))


main()
