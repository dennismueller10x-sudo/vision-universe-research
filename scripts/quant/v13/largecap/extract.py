"""V13 LARGECAP step 2: extract price anchors (A quarterly ranges, B repurchase average prices), symbol/exchange statements and
split statements from the fetched documents (protocol-1.0.0.json + protocol-amendment-1.0.1.json).

Row model: HTML documents are read row by row (<tr>, cells <td>/<th>); plain-text documents line by line (cells split at tabs,
runs of >= 2 spaces and dot leaders). The quote of an anchor is the row text with whitespace collapsed (<= 300 characters).
This module only reads documents; it never computes a band test.
"""
import datetime as dt
import html
import re

MONTHS = {m: i + 1 for i, m in enumerate(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
                                          'october', 'november', 'december'])}
MONTHS.update({k[:3]: v for k, v in list(MONTHS.items())})
MONTHS['sept'] = 9
UFRAC = {'½': 0.5, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875}
DENS = {2, 4, 8, 16, 32, 64}
WS = re.compile(r'\s+')


def clean(s):
    s = re.sub(r'(?is)<(script|style)\b.*?</\1>', ' ', s)
    s = re.sub(r'<[^>]+>', ' ', s)
    return WS.sub(' ', html.unescape(s)).strip()


# ------------------------------------------------------------------ rows
def sections(body):
    t = body.decode('utf-8', 'replace') if isinstance(body, bytes) else body
    if '<DOCUMENT>' not in t:
        yield 'MAIN', t
        return
    for part in t.split('<DOCUMENT>')[1:]:
        m = re.search(r'<TYPE>([^\n<]+)', part)
        typ = m.group(1).strip() if m else ''
        if re.match(r'(EX-(27|99|101)|GRAPHIC|ZIP|EXCEL|XML|JSON|PDF)', typ, re.I) and not typ.upper().startswith('EX-99'):
            continue
        yield typ, part


def rows_of(body):
    """[(sectionType, rowIndex, cells, text, tableId)]; tableId None for plain-text lines."""
    out = []
    tcount = 0
    for typ, part in sections(body):
        if re.search(r'<tr[\s>]', part, re.I):
            for tab in re.split(r'(?i)<table\b', part)[1:]:
                tab = re.split(r'(?i)</table>', tab)[0]
                tcount += 1
                for tr in re.findall(r'(?is)<tr\b[^>]*>(.*?)(?=<tr\b|$)', tab):
                    cells = [clean(c) for c in re.findall(r'(?is)<t[dh]\b[^>]*>(.*?)(?=<t[dh]\b|</tr>|$)', tr)]
                    cells = [c for c in cells if c]
                    if cells:
                        out.append((typ, len(out), cells, ' '.join(cells), tcount))
        else:
            txt = re.sub(r'<[^>]+>', ' ', part)
            for line in txt.split('\n'):
                line = html.unescape(line).rstrip()
                if not line.strip():
                    continue
                cells = [c.strip() for c in re.split(r'\t|\s{2,}|\.{3,}', line) if c.strip() and c.strip() != '.']
                if cells:
                    out.append((typ, len(out), cells, WS.sub(' ', line).strip(), None))
    return out


# ------------------------------------------------------------------ numbers
NUM = re.compile(r'(?<![\w.,/])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:(?:\s+|\s*-\s*)(\d{1,2})\s*/\s*(\d{1,2}))?([½¼¾⅛-⅞])?(?![\w/]|,\d)')
FOOT = re.compile(r'\(\s*(?:\d{1,2}|[a-zA-Z]{1,2})\s*\)')


def numbers(s, dashes=False):
    """[(value, hasDollar, hasDecimal, isInteger)] ; dashes=True adds None for stand-alone dashes ('-', '—', '–')."""
    s = FOOT.sub(' ', s)
    toks = []
    pat = re.compile(NUM.pattern + (r'|(?<!\S)([—–-])(?!\S)' if dashes else ''))
    for m in pat.finditer(s):
        if dashes and m.group(6):
            toks.append((None, False, False, False))
            continue
        ip, dec, fn, fd, uf = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
        v = float(ip.replace(',', '') + (dec or ''))
        if fn and fd:
            n, d = int(fn), int(fd)
            if d in DENS and 0 < n < d and not dec:
                v += n / d
            else:
                toks.append((v, '$' in s[max(0, m.start() - 3):m.start()], bool(dec), not dec))
                continue
        if uf:
            v += UFRAC[uf]
        toks.append((v, '$' in s[max(0, m.start() - 3):m.start()], bool(dec or fn or uf), not (dec or fn or uf)))
    return toks


# ------------------------------------------------------------------ A: quarterly ranges
QLAB = re.compile(r'^\s*(?:(first|second|third|fourth|1st|2nd|3rd|4th)\s+(?:fiscal\s+)?quarter\b|q([1-4])\b|(first|second|third|fourth)(?=\s*$|\s*[$(\d]))', re.I)
QWORD = {'first': 1, 'second': 2, 'third': 3, 'fourth': 4, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4}
YEAR = re.compile(r'(?<!\d)(19[89]\d|20[0-3]\d)(?!\d)')
YROW = re.compile(r'^\s*(?:fiscal\s+(?:year\s+)?)?(19[89]\d|20[0-3]\d)\s*:?\s*$', re.I)
YROW_ENDED = re.compile(r'^\s*(?:fiscal\s+)?(?:year|fiscal\s+year)\s+(?:ended|ending)\b[^$]{0,60}?(?:(19[89]\d|20[0-3]\d)|\d{1,2}/\d{1,2}/(\d{2}))\s*:?\s*$', re.I)


def year_row(text):
    m = YROW.match(text)
    if m:
        return int(m.group(1))
    m = YROW_ENDED.match(text)
    if m and len(text) <= 80:
        if m.group(1):
            return int(m.group(1))
        v = int(m.group(2))
        return v + (2000 if v < 50 else 1900)
    return None



def qnum(cell):
    m = QLAB.match(cell)
    if not m:
        return None
    w = (m.group(1) or m.group(3) or '').lower()
    if w:
        return QWORD[w]
    if m.group(2):
        return int(m.group(2))
    return None


def header_tokens(text):
    out = []
    for w in re.findall(r'[a-z]+', text.lower()):
        if w in ('high', 'highest'):
            out.append('H')
        elif w in ('low', 'lowest'):
            out.append('L')
        elif w in ('close', 'closing', 'last'):
            out.append('C')
        elif w in ('dividend', 'dividends', 'paid', 'declared'):
            out.append('D')
    return out


def parse_quarterly(rows, report_fy):
    """Format R (protocol 1.0.0): quarter rows with high/low columns; Format C (amendment 1.0.1): quarter columns with
    'high - low' pairs. Returns (anchors, rejects)."""
    anchors, rejects = [], []
    n = len(rows)
    i = 0
    while i < n:
        typ, idx, cells, text = rows[i][:4]
        q = qnum(cells[0]) if cells else None
        # ---- Format C header: >= 4 quarter labels in one row, no numbers
        labels = [qnum(c) for c in cells]
        if sum(1 for x in labels if x) >= 4 and not numbers(' '.join(c for c in cells if not qnum(c))):
            order = [x for x in labels if x][:4]
            if sorted(order) == [1, 2, 3, 4]:
                year, j, got = None, i + 1, 0
                while j < min(n, i + 60):
                    t2 = rows[j][3]
                    if j > i + 1 and sum(1 for c in rows[j][2] if qnum(c)) >= 4:
                        break
                    if year_row(t2):
                        year = year_row(t2); j += 1; continue
                    c2 = rows[j][2]
                    body2 = ' '.join(c2[1:]) if len(c2) > 1 and '$' not in c2[0] else re.sub(r'^[^$]*', '', t2)
                    nums = [x for x in numbers(body2.replace('\u2013', ' ').replace('\u2014', ' ')) if x[0] is not None]
                    prev = rows[j - 1][3] if j > i + 1 and '$' not in rows[j - 1][3] and len(numbers(YEAR.sub(' ', rows[j - 1][3]))) == 0 else ''
                    labtext = (prev + ' ' + t2.split('$')[0]) if prev and not YROW.match(prev) else t2.split('$')[0]
                    lab = re.sub(r'[\d$.,/\-\u2013\u2014\s]+', ' ', labtext).lower()
                    if len(nums) == 8 and ('price' in lab or 'high' in lab or 'range' in lab or 'common share' in lab):
                        ym = YEAR.search(labtext)
                        y = int(ym.group(1)) if ym else year
                        if y is None:
                            rejects.append({'row': rows[j][1], 'reason': 'FORMAT_C_NO_YEAR', 'quote': t2[:300]})
                        else:
                            vals = [x[0] for x in nums]
                            ok = all(vals[2 * k] >= vals[2 * k + 1] > 0 for k in range(4))
                            if not ok:
                                rejects.append({'row': rows[j][1], 'reason': 'FORMAT_C_HIGH_BELOW_LOW', 'quote': t2[:300]})
                            else:
                                for k in range(4):
                                    anchors.append({'format': 'C', 'fy': y, 'q': order[k], 'high': vals[2 * k], 'low': vals[2 * k + 1],
                                                    'row': rows[j][1], 'section': rows[j][0], 'quote': t2[:300]})
                                got += 1
                    j += 1
                if got:
                    i = j
                    continue
        # ---- Format R: a block of quarter rows
        if q:
            block, j, years_rows = [], i, []
            cur_year = None
            # look back for a year row directly above the block
            for b in range(i - 1, max(-1, i - 3), -1):
                if year_row(rows[b][3]):
                    cur_year = year_row(rows[b][3])
                    break
            while j < n and j < i + 24:
                t2, c2 = rows[j][3], rows[j][2]
                if year_row(t2):
                    cur_year = year_row(t2); years_rows.append(cur_year); j += 1; continue
                qq = qnum(c2[0])
                if not qq:
                    if re.match(r'(?i)^\s*(fiscal\s+)?(19|20)\d\d\s*:', t2):  # 'Fiscal 2002: Fourth Quarter ...' inline year label
                        pass
                    break
                block.append((qq, cur_year, rows[j]))
                j += 1
            # header: token row within 10 rows above the block
            tok, hdr_years, hdr_text = None, [], ''
            for b in range(i - 1, max(-1, i - 11), -1):
                tt = header_tokens(rows[b][3])
                if 'H' in tt and 'L' in tt and tok is None:
                    tok = tt
                    hdr_text = rows[b][3]
                    hdr_years = [int(y) for y in YEAR.findall(rows[b][3])]
                    for b2 in range(b - 1, max(-1, b - 5), -1):
                        if not hdr_years:
                            ys = [int(y) for y in YEAR.findall(rows[b2][3])]
                            if ys and not numbers(YEAR.sub(' ', rows[b2][3])):
                                hdr_years = ys
                    break
                if 'H' in tt or 'L' in tt:  # tokens split over rows: merge with the row above
                    up = header_tokens(rows[b - 1][3]) if b > 0 else []
                    if ('H' in tt + up) and ('L' in tt + up):
                        tok = up + tt
                        hdr_text = rows[b - 1][3] + ' | ' + rows[b][3]
                        hdr_years = [int(y) for y in YEAR.findall(rows[b - 1][3] + ' ' + rows[b][3])]
                        break
            if tok is None or len(block) < 2:
                if tok is None and len(block) >= 2 and any(len(numbers(r[2][3])) >= 2 for r in block):
                    rejects.append({'row': idx, 'reason': 'FORMAT_R_NO_HIGH_LOW_HEADER', 'quote': text[:300]})
                i = max(j, i + 1)
                continue
            hl = [t for t in tok if t in 'HL']
            g_hdr = len(hdr_years) if hdr_years and len(hl) == 2 * len(hdr_years) else (1 if len(hl) == 2 else None)
            year_rows_mode = any(y is not None for _, y, _ in block) and g_hdr in (1, None)
            if year_rows_mode:
                g = 1
            elif g_hdr is None:
                rejects.append({'row': idx, 'reason': 'FORMAT_R_HEADER_YEARS_MISMATCH', 'quote': (hdr_text + ' || ' + text)[:300]}); i = j; continue
            else:
                g = g_hdr
            first = tok[:len(tok) // g] if len(tok) % g == 0 else None
            seen, bad = set(), False
            parsed = []
            for qq, yr, r in block:
                vals = [x[0] for x in numbers(' '.join(r[2][1:]), dashes=True)]
                if not vals or len(vals) % g:
                    bad = True; break
                m = len(vals) // g
                if first and len(first) == m:
                    ph, pl = first.index('H'), first.index('L')
                else:
                    fh = [t for t in (first or tok) if t in 'HL']
                    ph, pl = (0, 1) if fh[:2] == ['H', 'L'] else (1, 0)
                    if first and first[:2] not in (['H', 'L'], ['L', 'H']):
                        bad = True; break
                if max(ph, pl) >= m:
                    bad = True; break
                for k in range(g):
                    if year_rows_mode:
                        y = yr
                    elif hdr_years:
                        y = hdr_years[k]
                    else:
                        y = None  # amendment 1.0.1: no year label -> table not used
                    h, lo = vals[k * m + ph], vals[k * m + pl]
                    if y is None or h is None or lo is None:
                        bad = True; break
                    if not (h >= lo > 0) or (y, qq) in seen:
                        bad = True; break
                    seen.add((y, qq))
                    parsed.append({'format': 'R', 'fy': y, 'q': qq, 'high': h, 'low': lo, 'row': r[1], 'section': r[0], 'quote': r[3][:300],
                                   'header': hdr_text[:300]})
                if bad:
                    break
            if bad:
                rejects.append({'row': idx, 'reason': 'FORMAT_R_PARSE_REJECTED', 'quote': (hdr_text + ' || ' + text)[:300]})
            else:
                anchors.extend(parsed)
            i = max(j, i + 1)
            continue
        i += 1
    return anchors, rejects


# ------------------------------------------------------------------ B: repurchase rows
MON = r'(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?'
D_FULL = re.compile(MON + r'\s+(\d{1,2})\s*,?\s*(\d{4})', re.I)
D_NUM = re.compile(r'(?<!\d)(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})(?!\d)')
D_RANGE1 = re.compile(MON + r'\s+(\d{1,2})\s*(?:-|–|—|to|through)\s*' + r'(?:' + MON + r')?\s*(\d{1,2})\s*,?\s*(\d{4})', re.I)
D_RANGE_NOYEAR = re.compile(r'^\s*' + MON + r'\s+(\d{1,2})\s*(?:-|\u2013|\u2014|to|through)\s*' + r'(?:' + MON + r')?\s*(\d{1,2})\s*(?:$|\(|:)', re.I)
D_MONTHYEAR = re.compile(r'^\s*' + MON + r'\s*,?\s*(\d{4})\b', re.I)
D_MONTH = re.compile(r'^\s*(?:month\s*#?\d\s*)?\(?\s*' + MON + r'\s*(?:\)|$|\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2}\b)', re.I)
EXCL = re.compile(r'(?i)\b(total|accelerated|asr|forward|collar|structured|three months|quarter)\b')


def _mon(s):
    return MONTHS[s.lower().rstrip('.')[:4] if s.lower().startswith('sept') else s.lower().rstrip('.')[:3]]


def _date(y, m, d):
    try:
        return dt.date(y, m, d)
    except ValueError:
        return None


PERIOD_REST = re.compile(r'(?i)\b(month|to|through|thru|and|period|fiscal|from)\b|#\s*\d|' + MON + r'|\d+')


def period_of(cell, report_date):
    """(start, end) dates or None, from the first cell of a row. The cell must hold only the period (amendment 1.0.1):
    after removing month names, numbers and connector words at most 3 letters may remain."""
    c = cell.strip()
    if len(re.sub(r'[^A-Za-z]', '', PERIOD_REST.sub(' ', c))) > 1:
        return None
    full = list(D_FULL.finditer(c))
    if len(full) >= 2:
        a, b = full[0], full[1]
        s, e = _date(int(a.group(3)), _mon(a.group(1)), int(a.group(2))), _date(int(b.group(3)), _mon(b.group(1)), int(b.group(2)))
        return (s, e) if s and e else None
    nm = list(D_NUM.finditer(c))
    if len(nm) >= 2:
        def yy(x):
            v = int(x)
            return v + (2000 if v < 50 else 1900) if v < 100 else v
        s = _date(yy(nm[0].group(3)), int(nm[0].group(1)), int(nm[0].group(2)))
        e = _date(yy(nm[1].group(3)), int(nm[1].group(1)), int(nm[1].group(2)))
        return (s, e) if s and e else None
    r1 = D_RANGE1.search(c)
    if r1:
        m1, d1, m2, d2, y = _mon(r1.group(1)), int(r1.group(2)), (_mon(r1.group(3)) if r1.group(3) else None), int(r1.group(4)), int(r1.group(5))
        m2 = m2 or m1
        s, e = _date(y if m1 <= m2 else y - 1, m1, d1), _date(y, m2, d2)
        return (s, e) if s and e else None
    ny = D_RANGE_NOYEAR.match(c)
    if ny and report_date:
        m1, d1, m2, d2 = _mon(ny.group(1)), int(ny.group(2)), (_mon(ny.group(3)) if ny.group(3) else None), int(ny.group(4))
        m2 = m2 or m1
        y2 = report_date.year if m2 <= report_date.month else report_date.year - 1
        y1 = y2 if m1 <= m2 else y2 - 1
        st, en = _date(y1, m1, d1), _date(y2, m2, d2)
        return (st, en) if st and en else None
    my = D_MONTHYEAR.match(c)
    if my:
        y, m = int(my.group(2)), _mon(my.group(1))
        e = _date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1)
        return dt.date(y, m, 1), e
    mo = D_MONTH.match(c)
    if mo and report_date:
        m = _mon(mo.group(1))
        y = report_date.year if m <= report_date.month else report_date.year - 1
        e = _date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1)
        return dt.date(y, m, 1), e
    return None


def parse_repurchases(rows, report_date):
    anchors, rejects = [], []
    in_table, cur, cur_row, tid = 0, None, None, None
    for k, (typ, idx, cells, text, tb) in enumerate(rows):
        low = text.lower()
        if 'average price' in low and 'paid' in low:
            in_table, cur, tid = 30, None, tb
            continue
        if in_table <= 0:
            continue
        if tid is not None and tb != tid:  # HTML: only rows of the header's own table
            in_table, cur = 0, None
            continue
        in_table -= 1
        p = period_of(cells[0], report_date)
        label = cells[0]
        rest = cells[1:]
        if p:
            cur, cur_row = p, text
            in_table = max(in_table, 8)
            # period cell may also carry the sub-row label after the dates
        elif cur is None:
            continue
        if re.match(r'(?i)^\s*total\b', label):
            cur = None
            continue
        if not rest:
            continue
        lab_all = (label if not p else '') + ' ' + ' '.join(c for c in rest if not numbers(c))
        if EXCL.search(label) or EXCL.search(lab_all):
            rejects.append({'row': idx, 'reason': 'B_EXCLUDED_LABEL', 'quote': text[:300]})
            continue
        toks = numbers(' '.join(rest))
        sh = next((i for i, t in enumerate(toks) if t[3] and not t[1] and t[0] and t[0] >= 1), None)
        if sh is None:
            continue
        pr = next((t for t in toks[sh + 1:] if (t[1] or t[2]) and t[0] is not None), None)
        if pr is None or not (0 < pr[0] < 100000):
            rejects.append({'row': idx, 'reason': 'B_NO_PRICE', 'quote': text[:300]})
            continue
        s, e = cur
        if not (s and e) or e < s or (e - s).days > 100:
            rejects.append({'row': idx, 'reason': 'B_PERIOD_INVALID', 'quote': text[:300]})
            continue
        q = text if p else (cur_row + ' | ' + text)
        anchors.append({'start': s.isoformat(), 'end': e.isoformat(), 'shares': toks[sh][0], 'avgPrice': pr[0], 'row': idx, 'section': typ,
                        'quote': q[:300]})
    return anchors, rejects


# ------------------------------------------------------------------ identity and split statements
EXCH = {'NYSE': re.compile(r'New York Stock Exchange|\bNYSE\b', re.I), 'NASDAQ': re.compile(r'\bNasdaq\b|\bNASDAQ\b', re.I)}


def symbol_statements(flat, candidates):
    out = []
    for s in candidates:
        pats = [r'\b(?:symbols?|ticker)\b[^.]{0,60}?(?<![A-Za-z])["“‘\']?' + s + r'["”’\']?(?![A-Za-z0-9-])',
                r'Trading\s+Symbol\(?s?\)?[\s\S]{0,300}?(?<![A-Za-z])' + s + r'(?![A-Za-z0-9-])',
                r'\((?:NYSE|Nasdaq|NASDAQ)\s*:\s*' + s + r'\)']
        for p in pats:
            for m in re.finditer(p, flat):
                out.append({'symbol': s, 'pos': m.start(), 'quote': flat[max(0, m.start() - 60):m.start() + 240][:300]})
                break
    return out


WORDS = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10}


def split_statements(flat):
    out = []
    for m in re.finditer(r'(?i)\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})[\s-]*(?:for|-for-)[\s-]*(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b(?=[^.]{0,80}\b(split|stock dividend)\b)', flat):
        a, b = m.group(1).lower(), m.group(2).lower()
        p, q = WORDS.get(a, None) or int(a), WORDS.get(b, None) or int(b)
        out.append({'ratio': [p, q], 'pos': m.start(), 'quote': flat[max(0, m.start() - 100):m.start() + 200][:300]})
    for m in re.finditer(r'(?i)\b(100|50)\s*(?:%|percent)\s+stock\s+dividend', flat):
        out.append({'ratio': [2, 1] if m.group(1) == '100' else [3, 2], 'pos': m.start(), 'quote': flat[max(0, m.start() - 100):m.start() + 200][:300]})
    return out


def change_statements(flat, a, b):
    """both symbols within 400 characters together with a change word."""
    out = []
    for m in re.finditer(r'(?<![A-Za-z])' + a + r'(?![A-Za-z0-9-])', flat):
        win = flat[max(0, m.start() - 400):m.start() + 400]
        if re.search(r'(?<![A-Za-z])' + b + r'(?![A-Za-z0-9-])', win) and re.search(r'(?i)\b(change[sd]?|new|formerly|previously|will begin trading|began trading|under the symbol)\b', win) and re.search(r'(?i)\b(symbol|ticker)\b', win):
            out.append({'from': a, 'to': b, 'pos': m.start(), 'quote': win[200:500][:300] if len(win) > 500 else win[:300]})
            break
    return out
