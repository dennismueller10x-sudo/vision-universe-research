#!/usr/bin/env python3
"""V12 INDEXPOP: independent Python cross-check (stdlib only, run with python3 -I).

Separate implementation, not a port of the JS code:
  A  N-PORT: second parser with xml.etree (namespace aware) on the raw cached documents -> member count, member sum,
     net assets, ratio, report date; compared with validation-1.0.0.json (JS).
  B  Report schedules (N-30D, N-30B-2, N-Q): second parser built on html.parser.HTMLParser (HTML) and a line
     regex (text) -> member count, member sum, reported section total; compared with the JS validation.
  C  Cross-document: dates with both an N-PORT filing and a shareholder-report schedule (SPY/DIA semi-annual, QQQ
     annual since 2019): member count and total value of the two independent documents.
  D  Coverage recomputed from the register rows (values, not weights), the loader export (qualified.json) and an own
     +-7-day rule; compared with coverage-<rules>.json.
  E  Mapping spot check: for a deterministic sample of mapped position-dates, the bracket deviation is recomputed from
     the series file with an own split-factor product (splits strictly after the bar date).
Usage: python3 -I verify_indexpop.py <repo-root> <private-dir> <rules-version> <out.json>
"""
import gzip
import hashlib
import html
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from html.parser import HTMLParser
from pathlib import Path

ROOT, PRIV, V, OUT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), sys.argv[3], Path(sys.argv[4])
DOCS = ROOT / 'docs' / 'quant-recovery' / 'v12' / 'indexpop'
CACHE = PRIV / 'http-cache'
EXPECTED = json.loads((DOCS / ('rules-%s.json' % V)).read_text())['funds']


def cached(url):
    h = hashlib.sha256(url.encode()).hexdigest()
    p = CACHE / h[:2] / (h + '.gz')
    return gzip.decompress(p.read_bytes()) if p.exists() else None


# ---------------- A: N-PORT via ElementTree ----------------
def nport(raw):
    root = ET.fromstring(raw)
    ns = root.tag.split('}')[0] + '}' if root.tag.startswith('{') else ''
    def first(el, name):
        x = el.find('.//' + ns + name)
        return x.text if x is not None else None
    net = float(first(root, 'netAssets'))
    n, tot = 0, 0.0
    for sec in root.iter(ns + 'invstOrSec'):
        g = {c.tag.replace(ns, ''): (c.text or '').strip() for c in sec}
        try:
            val, bal = float(g.get('valUSD', 'nan')), float(g.get('balance', 'nan'))
        except ValueError:
            continue
        if g.get('assetCat') == 'EC' and g.get('payoffProfile') == 'Long' and g.get('units') == 'NS' and val > 0 and bal > 0:
            n += 1; tot += val
    return {'date': first(root, 'repPdDate'), 'series': first(root, 'seriesId'), 'members': n, 'sum': tot, 'netAssets': net, 'ratio': tot / net}


# ---------------- B: report schedules ----------------
class Rows(HTMLParser):
    """Collects table rows as lists of cell texts, and text outside tables as one-cell rows."""
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
        cells = [c.strip() for c in re.split(r'\s{2,}', line) if c.strip()]
        rows.append(cells)
    return rows


NUM = re.compile(r'^\(?\d{1,3}(?:,\d{3})*(?:\.\d+)?\)?$|^\d+(?:\.\d+)?$')


def report(raw, is_html, fund):
    if is_html:
        p = Rows(); p.feed(raw.decode('latin-1')); p.flush_text(); rows = p.rows
        rows = [[html.unescape(c).replace('®', '').replace('—', '-').replace('–', '-') for c in r] for r in rows]
    else:
        rows = text_rows(raw)
    fund_re = {'IWB': r'\biSHARES\s+RUSSELL 1000 (ETF|INDEX FUND)\b', 'IWM': r'\biSHARES\s+RUSSELL 2000 (ETF|INDEX FUND)\b', 'IWV': r'\biSHARES\s+RUSSELL 3000 (ETF|INDEX FUND)\b'}.get(fund)
    any_re = r'\biSHARES\s[^|]{0,70}?\b(ETF|INDEX FUND)\b'
    scope = fund_re is None
    started, schedule, total, n, s = False, False, None, 0, 0.0
    carry = ''
    seen = set()
    for r in rows:
        # split a value glued to a long name
        cells = []
        for c in r:
            m = re.match(r'^(.*[A-Za-z.)*])\s+\$?\s*(\d{1,3}(?:,\d{3})+)$', c)
            cells += [m.group(1), m.group(2)] if m and 'Cost' not in c and 'cost' not in c else [c]
        j = ' '.join(cells)
        if fund_re and re.search(any_re, j, re.I) and len(j) < 220:
            now = bool(re.search(fund_re, j, re.I))
            if now:
                schedule = True
            scope = now
            continue
        if not scope:
            continue
        if re.search(r'SCH?EDULE OF (INVESTMENTS|PORTFOLIO INVESTMENTS)', j, re.I) and len(j) < 200:
            schedule = True; carry = ''
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
            inline = re.search(r'\)\s*\$?\s*(\d{1,3}(?:,\d{3})+)\s*$', lab)
            if nums:
                total = float(nums[-1].strip('()').replace(',', '')); break
            if inline:
                total = float(inline.group(1).replace(',', '')); break
            carry = lab
            continue
        if not nums:
            continue  # names may wrap; only rows with numbers count as positions
        if len(nums) >= 2 and lab:
            sh, val = float(nums[-2].strip('()').replace(',', '')), float(nums[-1].strip('()').replace(',', ''))
            if sh > 0 and val >= 0:
                key = (re.sub(r'[^A-Z]', '', lab.upper())[-40:], sh, val)
                if key not in seen:
                    seen.add(key); n += 1; s += val
        carry = ''
    return {'members': n, 'sum': s, 'total': total, 'ratio': (s / total) if total else None}


def main():
    val = json.loads((DOCS / 'validation-1.0.0.json').read_text())
    man = json.loads((PRIV / 'work' / 'manifest.json').read_text())
    by_acc = {d['accession']: d for d in man['documents'] if d.get('state') == 'FETCHED'}
    out = {'schemaVersion': 'v12-indexpop-python-check-1.0.0', 'rulesVersion': V, 'evidenceKind': 'TECHNICAL_PARITY',
           'note': 'Second implementation in another language on the same raw documents; not an independent data source except part C (two different SEC documents for the same date).'}
    # A + B on the chosen documents
    a = {'checked': 0, 'countEqual': 0, 'sumWithin1e-6': 0, 'validPy': 0, 'mismatches': []}
    b = {'checked': 0, 'countEqual': 0, 'sumWithin1e-6': 0, 'totalEqual': 0, 'validPy': 0, 'mismatches': []}
    for d in val['dates']:
        doc = by_acc[d['accession']]
        raw = cached(doc['url'])
        if hashlib.sha256(raw).hexdigest() != d['sha256']:
            raise SystemExit('SHA_MISMATCH ' + doc['url'])
        lo, hi = EXPECTED[d['fund']]['expectedPositions']
        if doc['kind'] == 'NPORT_XML':
            r = nport(raw); a['checked'] += 1
            ok = r['members'] == d['memberCount']; a['countEqual'] += ok
            sok = abs(r['sum'] - d['memberSum']) <= max(1.0, 1e-6 * r['sum']); a['sumWithin1e-6'] += sok
            a['validPy'] += (0.98 <= r['ratio'] <= 1.01 and lo <= r['members'] <= hi and r['date'] == d['date'])
            if not (ok and sok):
                a['mismatches'].append({'fund': d['fund'], 'date': d['date'], 'js': [d['memberCount'], d['memberSum']], 'py': [r['members'], round(r['sum'])]})
        else:
            r = report(raw, doc['url'].lower().endswith('.htm'), d['fund']); b['checked'] += 1
            ok = r['members'] == d['memberCount']; b['countEqual'] += ok
            sok = abs(r['sum'] - d['memberSum']) <= 1.0; b['sumWithin1e-6'] += sok
            b['totalEqual'] += (r['total'] == d['check']['reportedTotal'])
            b['validPy'] += bool(r['ratio'] and 0.99 <= r['ratio'] <= 1.01 and lo <= r['members'] <= hi)
            if not (ok and sok):
                b['mismatches'].append({'fund': d['fund'], 'date': d['date'], 'form': d['form'], 'js': [d['memberCount'], d['memberSum'], d['check']['reportedTotal']], 'py': [r['members'], round(r['sum']), r['total']]})
    out['A_nport'] = a; out['B_reports'] = b
    print('A', {k: v for k, v in a.items() if k != 'mismatches'}, len(a['mismatches']), flush=True)
    print('B', {k: v for k, v in b.items() if k != 'mismatches'}, len(b['mismatches']), flush=True)
    # C: cross-document (superseded report schedules on N-PORT dates)
    chosen = {(d['fund'], d['date']): d for d in val['dates']}
    c = []
    for sdoc in val['superseded']:
        ch = chosen.get((sdoc['fund'], sdoc['date']))
        if not ch or ch['form'] not in ('NPORT-P', 'NPORT-P/A') or sdoc['form'].startswith('NPORT'):
            continue
        doc = by_acc[sdoc['accession']]
        r = report(cached(doc['url']), doc['url'].lower().endswith('.htm'), sdoc['fund'])
        c.append({'fund': sdoc['fund'], 'date': sdoc['date'], 'reportForm': sdoc['form'], 'nportMembers': ch['memberCount'], 'reportMembers': r['members'],
                  'nportSum': ch['memberSum'], 'reportSum': round(r['sum']), 'relDiff': round(r['sum'] / ch['memberSum'] - 1, 6)})
    out['C_crossDocument'] = {'pairs': len(c), 'countEqual': sum(1 for x in c if x['nportMembers'] == x['reportMembers']),
                              'sumWithin0_1pct': sum(1 for x in c if abs(x['relDiff']) <= 0.001), 'sumWithin1pct': sum(1 for x in c if abs(x['relDiff']) <= 0.01), 'rows': c}
    print('C', {k: v for k, v in out['C_crossDocument'].items() if k != 'rows'}, flush=True)
    # D: coverage recomputation
    reg = json.loads(gzip.decompress((DOCS / ('register-%s.json.gz' % V)).read_bytes()))
    for snap in reg['snapshots']:  # columnar -> row tuples (key, shares, value, -, securityIdIndex, status, covered)
        c, k, rows = snap['cols'], 0, []
        for i in range(len(c['dk'])):
            k += c['dk'][i]
            rows.append((k, c['sh'][i], c['v'][i], None, c['id'][i], c['st'][i], c['cov'][i]))
        snap['rows'] = rows
    cov = {(x['fund'], x['date']): x for x in json.loads((DOCS / ('coverage-%s.json' % V)).read_text())['dates']}
    q = json.loads((PRIV / 'work' / 'qualified.json').read_text())['series']
    vsum = {(d['fund'], d['date']): d['memberSum'] for d in val['dates']}
    dd = {'snapshots': 0, 'coveredNEqual': 0, 'coveredWWithin0_01pp': 0, 'registerSumEqualsValidation': 0, 'mismatches': []}
    def covered(sid, d0):
        s = q.get(sid)
        if not s or not s.get('q'):
            return False
        d = date.fromisoformat(d0)
        return date.fromisoformat(s['first']) <= d + timedelta(days=7) and date.fromisoformat(s['last']) >= d - timedelta(days=7)
    for snap in reg['snapshots']:
        tot = sum(r[2] for r in snap['rows'])
        cn = sum(1 for r in snap['rows'] if r[4] >= 0 and covered(reg['securityIds'][r[4]], snap['date']))
        cw = sum(r[2] for r in snap['rows'] if r[4] >= 0 and covered(reg['securityIds'][r[4]], snap['date'])) / tot
        js = cov[(snap['fund'], snap['date'])]
        dd['snapshots'] += 1
        okn = abs(100 * cn / len(snap['rows']) - js['coveredPctN']) < 0.001; dd['coveredNEqual'] += okn
        okw = abs(100 * cw - js['coveredPctW']) < 0.01; dd['coveredWWithin0_01pp'] += okw
        dd['registerSumEqualsValidation'] += abs(tot - vsum[(snap['fund'], snap['date'])]) <= len(snap['rows'])
        if not (okn and okw):
            dd['mismatches'].append({'fund': snap['fund'], 'date': snap['date'], 'js': [js['coveredPctN'], js['coveredPctW']], 'py': [round(100 * cn / len(snap['rows']), 3), round(100 * cw, 3)]})
    out['D_coverage'] = dd
    print('D', {k: v for k, v in dd.items() if k != 'mismatches'}, flush=True)
    # E: mapping spot check (every 37th mapped row)
    series_cache = {}
    def series(sid):
        if sid not in series_cache:
            d = json.loads((ROOT / 'quant/data/market/discover-series-long' / (sid + '.json')).read_text())
            series_cache[sid] = (d['points'], (d.get('corporateActions') or {}).get('splits') or [])
        return series_cache[sid]
    def week_start(d0):
        d = date.fromisoformat(d0); return d - timedelta(days=d.weekday())
    e = {'sampled': 0, 'within5pct': 0, 'within25pct': 0, 'noBar': 0, 'worst': []}
    k = 0
    for snap in reg['snapshots']:
        for r in snap['rows']:
            if r[4] < 0:
                continue
            k += 1
            if k % 37:
                continue
            sid = reg['securityIds'][r[4]]
            pts, splits = series(sid)
            ws = week_start(snap['date'])
            cur = [p for p in pts if week_start(p[0]) == ws]
            prev = [p for p in pts if week_start(p[0]) == ws - timedelta(days=7)]
            if not cur:
                e['noBar'] += 1; continue
            def raw_close(p):
                f = 1.0
                for sd, sf in splits:
                    if sd > p[0]:
                        f *= sf
                return p[1] * f
            vals = [raw_close(cur[-1])] + ([raw_close(prev[-1])] if prev else [])
            price = r[2] / r[1]
            lo, hi = min(vals), max(vals)
            dev = 0.0 if lo * (1 - 5e-5) <= price <= hi * (1 + 5e-5) else (lo - price) / lo if price < lo else (price - hi) / hi
            e['sampled'] += 1; e['within5pct'] += dev <= 0.05 + 1e-4; e['within25pct'] += dev <= 0.25 + 1e-4
            e['worst'].append((round(dev, 4), snap['fund'], snap['date'], sid))
    e['worst'] = sorted(e['worst'], reverse=True)[:15]
    out['E_mappingSpotCheck'] = e
    print('E', {kk: v for kk, v in e.items() if kk != 'worst'}, flush=True)
    OUT.write_text(json.dumps(out, indent=1) + '\n')


if __name__ == '__main__':
    main()
