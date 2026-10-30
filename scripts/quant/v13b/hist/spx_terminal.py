#!/usr/bin/env python3
"""V13b HIST part B - source-backed terminal values for bounded S&P 500 exits 1995-2009 (rules spx-terminal-rules-1.0.0).

Scope: SPY periods of V12 SPXPOP 1.1.1 with t0 <= 2009-09-30, rows BOUNDED_EXIT / BOUNDED_EXIT_SERIES_DELISTED.
For acquisition candidates the issuer's merger/tender documents (SEC originals) are read; a fixed cash amount and/or a
fixed exchange ratio (acquirer price from the SPY report at t1) gives a period return; everything else stays bounded
with a reason code. Writes the public register and coverage, and a private detail file.

python3 -I scripts/quant/v13b/hist/spx_terminal.py --root . --private <v13b-private> --spxpop <v12-private/spxpop> \
    [--extra-cache DIR ...] [--offline] [--limit N]
"""
import argparse, collections, datetime as dt, gzip, hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C  # noqa: E402

D = dt.date.fromisoformat
DOCDIR = 'docs/quant-recovery/v13b/hist'
CANDIDATE_FATES = {'ACQUIRED_OR_MERGED', 'ACQUIRED_OR_MERGED_NO_25_15', 'DELISTED_OTHER', 'NO_SEC_EVIDENCE', 'NOT_FATED'}
CONS_FORMS = {'DEFM14A', 'DEFM14C', 'DEFS14A', 'DEFR14A', 'DEFA14A', 'PREM14A', 'SC TO-T', 'SC TO-T/A', 'SC 14D1', 'SC 14D1/A', 'SC 14D9',
              'SC 14D9/A', 'SC 13E3', 'SC 13E3/A', '425', '8-K', '8-K/A'}
DEREG_FORMS = {'15-12B', '15-12G', '15-15D', '25', '25-NSE'}
MAX_DOCS = 6
G1_FORMS = {'DEFM14A', 'DEFM14C', 'DEFS14A', 'DEFR14A', 'PREM14A', 'SC TO-T', 'SC TO-T/A', 'SC 14D1', 'SC 14D1/A', 'SC 14D9', 'SC 14D9/A', 'SC 13E3', 'SC 13E3/A'}
G2_FORMS = {'8-K', '8-K/A', '425', 'DEFA14A'}
RULES = '1.0.0'
ACQ_FORMS = ('425', 'SC TO-T', 'SC TO-T/A')
DIST = re.compile(r'spin-?off|spin off|special (?:cash )?dividend|special distribution|liquidating distribution|distribution of all (?:of )?(?:the )?outstanding (?:shares|common stock)', re.I)
MONTHS = {m: i + 1 for i, m in enumerate(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'])}
DATE_RX = re.compile(r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})', re.I)


def dist_dates(txt):
    """ISO dates written within 300 characters of a spin-off / special distribution statement (rules 1.0.1 A3)."""
    out = set()
    for m in DIST.finditer(txt):
        for d in DATE_RX.finditer(txt[max(0, m.start() - 300): m.end() + 300]):
            try:
                out.add(dt.date(int(d.group(3)), MONTHS[d.group(1).lower()], int(d.group(2))).isoformat())
            except ValueError:
                pass
    return sorted(out)

ANCHOR = re.compile(r'converted into|exchanged for|in exchange for|right to receive|offer to purchase|increase[sd]? (?:the )?(?:offer|purchase) price|amended[^.]{0,80}?to increase', re.I)
CASH = re.compile(r'\$\s?(\d{1,4}(?:,\d{3})*(?:\.\d{1,4})?)(?!\d)(?!\s*(?:million|billion|thousand))(?=[^.$]{0,60}?(?:net to the seller in cash|in cash|per share in cash|per share, (?:net )?in cash|, without interest|net to the holder in cash))', re.I)
INCREASE = re.compile(r'increase[sd]? (?:the )?(?:offer|purchase) price[^.$]{0,60}?to \$\s?(\d{1,4}(?:\.\d{1,4})?)|amended[^.]{0,80}?to increase[^.$]{0,80}?to \$\s?(\d{1,4}(?:\.\d{1,4})?)', re.I)
STOCK = re.compile(r'right to receive(?:[^.]|\.(?=\d)){0,120}?(?<![\d.])(\d{0,2}\.\d{1,6}|\d{1,2}(?=\s+shares?\b)|(?:one|two|three|four|five)(?=\s+(?:\(\d\)\s+)?(?:shares?|ordinary)\b))\s+(?:of\s+a\s+|fully paid[^.]{0,30}?|validly issued[^.]{0,30}?)*shares?\s+of\s+(?:the\s+)?(?:common stock|[A-Z][^.]{0,80}?\s+common stock)', re.I)
RATIO_TERM = re.compile(r'exchange ratio of\s+(\d{0,2}\.\d{1,6})', re.I)
FLOATING = re.compile(r'\belect(?:ion|ing|s)?\b|in cash[^.]{0,60}?\bor\b|prorat|collar|contingent value|\bCVR\b|value of|average (?:closing |daily |trading )?(?:sale |sales )?price|exchange ratio\b(?! of \d)|number of shares equal to', re.I)
NOT_COMMON = re.compile(r'\b(?:options?|warrants?|restricted stock units?|RSUs?|preferred|debentures?|notes|stock appreciation rights?)\b[^.]{0,80}?(?:converted into|right to receive|exchanged for)', re.I)
COMMON_CTX = re.compile(r'\beach\b[^.]{0,60}?\bshares?\b[^.]{0,160}?\bcommon\b', re.I)
COMPLETION = re.compile(r'(?:merger|offer|acquisition|transaction)[^.]{0,100}?(?:was|has been|were|have been) (?:completed|consummated)|completed (?:its|the) (?:acquisition|merger)|consummated the (?:merger|acquisition)|merger became effective', re.I)
OTHER_SECURITY = re.compile(r'in cash,?(?: without interest,?)?\s+(?:and|plus)\s+(?:\(ii\)\s+)?(\d{0,2}\.\d{1,6}|one|two|three|\d{1,2})\s+(?:of\s+an?\s+)?(?:[A-Z][\w&.\'-]*\s+){0,4}(?:ADSs?|American Depositary|ordinary shares?|common shares?|shares?|units?)\b', re.I)
WORDNUM = {'one': 1.0, 'two': 2.0, 'three': 3.0, 'four': 4.0, 'five': 5.0}
SECURITY_NOUN = re.compile(r'common (?:stock|shares?)|ordinary shares?|preferred (?:stock|shares?)\b(?!\s*purchase rights)|class [a-c] (?:common )?(?:stock|shares?)|series [a-z0-9]+ (?:cumulative )?(?:convertible )?(?:preferred )?(?:stock|shares?)', re.I)
SPLIT_RATIOS = (2, 3, 4, 5, 10)


def sentences(txt):
    """Anchor-bounded consideration sentences: the text from the previous sentence end to the next one (max 700 chars)."""
    out = []
    for m in ANCHOR.finditer(txt):
        a = max(txt.rfind('. ', 0, m.start()), m.start() - 400)
        b = txt.find('. ', m.end())
        b = m.end() + 300 if b < 0 or b - m.end() > 300 else b
        out.append(txt[a + 1 if a >= 0 else 0: b + 1].strip())
    seen, res = set(), []
    for s in out:
        if s not in seen:
            seen.add(s)
            res.append(s)
    return res


def num(s):
    s = s.strip().lower()
    return WORDNUM[s] if s in WORDNUM else float(s.replace(',', ''))


def cash_amounts(s):
    """Cash amounts of a sentence, skipping amounts whose nearest preceding security noun is a preferred/series class (bug fix 1)."""
    out = set()
    for m in CASH.finditer(s):
        nouns = list(SECURITY_NOUN.finditer(s[max(0, m.start() - 250): m.start()]))
        if nouns and re.match(r'(?i)preferred|series', nouns[-1].group(0)):
            continue
        out.add(num(m.group(1)))
    return out


def analyse(txt):
    """-> dict(kind, cash, ratio, sentences): consideration analysis of one document (S3/S4)."""
    cash, ratio, floating, used = set(), set(), False, []
    inc = set()
    for m in INCREASE.finditer(txt):
        v = m.group(1) or m.group(2)
        inc.add(num(v))
    for s in sentences(txt):
        if NOT_COMMON.search(s):
            continue
        c = cash_amounts(s)
        r = {num(x) for x in STOCK.findall(s) for x in ([x[0]] if isinstance(x, tuple) else [x])}
        r |= {num(x) for x in OTHER_SECURITY.findall(s)}
        r |= {num(x) for x in RATIO_TERM.findall(s)}
        # a consideration sentence states an amount/ratio, or speaks of each (outstanding) common share being converted/exchanged
        # (implementation correction: floating markers count only inside consideration sentences, as the rule text says)
        if not c and not r and not COMMON_CTX.search(s):
            continue
        fl = bool(FLOATING.search(s))
        if not c and not r and not fl:
            continue
        if fl:
            floating = True
        cash |= c
        ratio |= r
        used.append(s[:600])
    if inc:
        cash = {max(inc)}
    if not used and not inc:
        return {'kind': None}
    if floating:
        kind = 'AMBIGUOUS'
    elif len(cash) == 1 and not ratio:
        kind = 'CASH'
    elif len(ratio) == 1 and not cash:
        kind = 'STOCK'
    elif len(cash) == 1 and len(ratio) == 1 and any(CASH.search(s) and (STOCK.search(s) or RATIO_TERM.search(s) or OTHER_SECURITY.search(s)) for s in used):
        kind = 'MIXED'
    else:
        kind = 'AMBIGUOUS'
    return {'kind': kind, 'cash': sorted(cash), 'ratio': sorted(ratio), 'floating': floating, 'sentences': used[:8]}


def split_sized(v):
    for k in SPLIT_RATIOS:
        if abs(v / k - 1) < 0.03 or abs(v * k - 1) < 0.03:
            return True
    return False


def load_scope(root, spxpop):
    pop = json.load(gzip.open(os.path.join(root, 'docs/quant-recovery/v12/spxpop/population-1.1.1.json.gz')))
    det = json.load(open(os.path.join(spxpop, 'detail-1.1.1.json')))
    detp = {(p['fund'], p['t0']): p for p in det}
    st = pop['columns']['status']
    periods = []
    for p in pop['periods']:
        if p['fund'] != 'SPY' or p['cols'] is None:
            continue
        dp = detp[('SPY', p['t0'])]
        assert dp['t1'] == p['t1'] and len(dp['rows']) == len(p['cols']['chain'])
        rows = []
        for i, ci in enumerate(p['cols']['chain']):
            ch = pop['chains'][ci]
            r = dp['rows'][i]
            # Row-order check (implementation note, disclosed): the population chain carries the key hash of the chain's FIRST
            # date, so a chain whose holdings key changed later (C3/C4 links, renames) differs from sha(key)[:16] of this row.
            # The check therefore uses the weight (x 1e8) and the status, which are per row and period.
            if round(r['w'] * 1e8) != p['cols']['w'][i] or st[p['cols']['status'][i]] != r['status']:
                raise SystemExit('ROW_ORDER_MISMATCH %s %d' % (p['t0'], i))
            rows.append({'i': i, 'keyHash16': ch[1], 'rowKeyHash16': hashlib.sha256(r['key'].encode()).hexdigest()[:16], 'name': r['name'], 'cik': ch[3], 'w': r['w'], 'p0': r['p0'], 'cls': r.get('cls'),
                         'status': st[p['cols']['status'][i]], 'fate': r.get('fate') or ''})
        periods.append({'t0': p['t0'], 't1': p['t1'], 'summary': p['summary'], 'rows': rows})
    return pop, periods


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--private', required=True)
    ap.add_argument('--spxpop', required=True)
    ap.add_argument('--extra-cache', action='append', default=[])
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--limit', type=int)
    ap.add_argument('--rules', default='1.0.0', choices=['1.0.0', '1.0.1'])
    a = ap.parse_args()
    global RULES, ACQ_FORMS
    RULES = a.rules
    if RULES != '1.0.0':
        ACQ_FORMS = ('425', 'SC TO-T', 'SC TO-T/A', 'SC 14D1', 'SC 14D1/A')
    f = C.Fetcher(a.root, a.private, a.extra_cache, offline=a.offline)
    pop, periods = load_scope(a.root, a.spxpop)
    by_t0 = {p['t0']: p for p in periods}
    scope = [(p, r) for p in periods if p['t0'] <= '2009-09-30' for r in p['rows'] if r['status'] in ('BOUNDED_EXIT', 'BOUNDED_EXIT_SERIES_DELISTED')]
    out, priv = [], []
    n_cand = 0
    subs_cache = {}
    for p, r in scope:
        t0, t1 = D(p['t0']), D(p['t1'])
        row = {'t0': p['t0'], 't1': p['t1'], 'keyHash16': r['keyHash16'], 'name': r['name'], 'cik': r['cik'], 'weight': round(r['w'], 8),
               'p0': round(r['p0'], 6), 'fate': r['fate'], 'status': 'BOUNDED', 'reason': None}
        if not r['cik']:
            row['reason'] = 'NO_CIK'
        elif r['fate'] not in CANDIDATE_FATES:
            row['reason'] = 'FATE_' + (r['fate'] or 'NONE')
        if row['reason']:
            out.append(row)
            continue
        n_cand += 1
        if a.limit and n_cand > a.limit:
            row['reason'] = 'NOT_PROCESSED_LIMIT'
            out.append(row)
            continue
        cik = int(r['cik'])
        if cik not in subs_cache:
            try:
                subs_cache[cik] = C.submissions(f, cik)
            except Exception as e:
                subs_cache[cik] = {'error': str(e)[:200]}
        sub = subs_cache[cik]
        if 'error' in sub:
            row['reason'] = 'SUBMISSIONS_UNAVAILABLE'
            out.append(row)
            continue
        lo, hi = t0 - dt.timedelta(days=540), t1 + dt.timedelta(days=30)
        cons = sorted([x for x in sub['rows'] if x['form'] in CONS_FORMS and lo < D(x['filingDate']) <= hi], key=lambda x: (x['filingDate'], x['accession']), reverse=True)
        dereg = sorted([x for x in sub['rows'] if x['form'] in DEREG_FORMS and t0 < D(x['filingDate']) <= t1 + dt.timedelta(days=120)], key=lambda x: x['filingDate'])
        row['deregistration'] = [{'form': x['form'], 'filingDate': x['filingDate'], 'accession': x['accession']} for x in dereg]
        docs, chosen = [], None
        dereg_first = D(dereg[0]['filingDate']) if dereg else None

        def read(x):
            url = C.filing_url(cik, x['accession'])
            try:
                raw, total, trunc = f.get_head(url)
            except Exception as e:
                d = {'accession': x['accession'], 'form': x['form'], 'filingDate': x['filingDate'], 'error': str(e)[:120]}
                docs.append(d)
                return d
            txt = C.norm_ws(C.text_of(raw))
            an = analyse(txt)
            subj, by = C.header_ciks(raw)
            filers = sorted(set(int(c) for c in re.findall(r'CENTRAL INDEX KEY:\s*(\d+)', raw[:20000].decode('latin-1', 'replace'))))
            d = {'accession': x['accession'], 'form': x['form'], 'filingDate': x['filingDate'], 'url': url, 'sha256': C.sha(raw), 'bytes': total,
                 'truncated': trunc, 'kind': an['kind'], 'cash': an.get('cash'), 'ratio': an.get('ratio'), 'sentences': an.get('sentences'),
                 'filedBy': by, 'headerCiks': filers, 'completionText': bool(COMPLETION.search(txt)), 'distDates': dist_dates(txt)}
            docs.append(d)
            return d
        if RULES == '1.0.0':
            for x in cons[:MAX_DOCS]:
                d = read(x)
                if d.get('kind') is not None:
                    chosen = d
                    break
        else:  # 1.0.1 A1: deciding documents first, nothing after completion
            cutoff = dereg_first if dereg_first else t1 + dt.timedelta(days=30)
            g1 = [x for x in cons if x['form'] in G1_FORMS and D(x['filingDate']) <= cutoff][:4]
            g2 = [x for x in cons if x['form'] in G2_FORMS and dereg_first and abs((D(x['filingDate']) - dereg_first).days) <= 10][:3]
            c2 = None
            for x in g2:
                d = read(x)
                if d.get('kind') is not None:
                    c2 = d
                    break
            c1 = None
            for x in g1:
                d = read(x)
                if d.get('kind') is not None:
                    c1 = d
                    break
            chosen = c2 or c1
            if c1 and c2 and c1['kind'] != 'AMBIGUOUS' and c2['kind'] != 'AMBIGUOUS' and (c1['kind'], c1['cash'], c1['ratio']) != (c2['kind'], c2['cash'], c2['ratio']):
                chosen = dict(c2, kind='AMBIGUOUS', cash=sorted(set(c1['cash'] or []) | set(c2['cash'] or [])), ratio=sorted(set(c1['ratio'] or []) | set(c2['ratio'] or [])))
        row['documentsRead'] = len(docs)
        priv.append({'t0': p['t0'], 'keyHash16': r['keyHash16'], 'name': r['name'], 'cik': cik, 'docs': docs})
        if chosen is None:
            row['reason'] = 'NO_CONSIDERATION_DOCUMENT'
            out.append(row)
            continue
        row['evidence'] = {k: chosen[k] for k in ('form', 'filingDate', 'accession', 'url', 'sha256', 'bytes', 'truncated')}
        row['evidence']['sha256Scope'] = 'first 2,000,000 bytes' if chosen['truncated'] else 'whole document'
        sent = chosen['sentences'][0] if chosen['sentences'] else ''
        if chosen['kind'] == 'AMBIGUOUS':
            row['reason'] = 'AMBIGUOUS_CONSIDERATION'
            row['evidence']['cashCandidates'], row['evidence']['ratioCandidates'] = chosen['cash'], chosen['ratio']
            out.append(row)
            continue
        cash = chosen['cash'][0] if chosen['cash'] else 0.0
        ratio = chosen['ratio'][0] if chosen['ratio'] else 0.0
        row['consideration'] = {'kind': chosen['kind'], 'cashPerShare': cash or None, 'exchangeRatio': ratio or None}
        # quote: the consideration sentence containing the amount, cut to <= 300 chars around it
        q = None
        for s in chosen['sentences']:
            key = ('$%s' % chosen['cash'][0]) if chosen['cash'] else None
            m = CASH.search(s) if chosen['cash'] else (STOCK.search(s) or RATIO_TERM.search(s))
            if m:
                a0 = max(0, m.start() - 150)
                q = s[a0: a0 + 300]
                break
        row['evidence']['quote'] = C.norm_ws(q or sent[:300])
        row['evidence']['quoteSha256'] = C.sha(row['evidence']['quote'])
        # S5 completion
        cd = D(chosen['filingDate'])
        if RULES == '1.0.0':
            in_win = [x for x in dereg if D(x['filingDate']) <= t1 + dt.timedelta(days=10) and D(x['filingDate']) >= cd]
            txt_done = [d for d in docs if d.get('completionText') and t0 < D(d['filingDate']) <= t1 + dt.timedelta(days=10)]
        else:  # 1.0.1 A2: completion evidence in (t0, t1+10d]; decision document at most 30 days after it
            in_win = [x for x in dereg if D(x['filingDate']) <= t1 + dt.timedelta(days=10)]
            txt_done = [d for d in docs if d.get('completionText') and t0 < D(d['filingDate']) <= t1 + dt.timedelta(days=10)]
            ev_ = sorted([D(x['filingDate']) for x in in_win + txt_done])
            if ev_ and cd > ev_[0] + dt.timedelta(days=30):
                in_win, txt_done = [], []
                row['reason'] = 'DOCUMENT_LONG_AFTER_COMPLETION'
                out.append(row)
                continue
        if in_win or txt_done:
            row['completion'] = {'kind': 'DEREGISTRATION' if in_win else 'TEXT', 'filingDate': (in_win or txt_done)[0]['filingDate'], 'accession': (in_win or txt_done)[0]['accession']}
        elif [x for x in dereg if D(x['filingDate']) <= t1 + dt.timedelta(days=10)]:
            row['reason'] = 'DEREGISTRATION_BEFORE_DOCUMENT'  # S5 requires the deregistration after the consideration document
            out.append(row)
            continue
        elif dereg:
            row['reason'] = 'COMPLETION_AFTER_T1'
            out.append(row)
            continue
        else:
            row['reason'] = 'NO_COMPLETION_EVIDENCE'
            out.append(row)
            continue
        # S6 acquirer price
        pacq = 0.0
        if ratio:
            acq = set()
            for d in docs:
                if d.get('form') in ACQ_FORMS and d.get('filedBy'):
                    acq |= set(d['filedBy'])
            if not acq:
                # S6: 'FILED BY' CIK of a 425 or SC TO-T in the issuer's window - read the newest such filing when none was fetched
                for x in cons:
                    if x['form'] in ACQ_FORMS:
                        try:
                            raw = f.get(C.filing_url(cik, x['accession']))
                        except Exception:
                            break
                        acq |= set(C.header_ciks(raw)[1])
                        row['acquirerSource'] = {'form': x['form'], 'accession': x['accession'], 'filingDate': x['filingDate']}
                        break
            acq |= set(c for c in chosen['headerCiks'] if c != cik)
            acq.discard(cik)
            if len(acq) != 1:
                row['reason'] = 'NO_ACQUIRER_PRICE'
                row['acquirerCandidates'] = sorted(acq)
                out.append(row)
                continue
            acik = acq.pop()
            row['acquirerCik'] = acik
            nxt = by_t0.get(p['t1'])
            hits = [x for x in (nxt['rows'] if nxt else []) if x['cik'] and int(x['cik']) == acik]
            if len(hits) != 1:
                row['reason'] = 'NO_ACQUIRER_PRICE'
                out.append(row)
                continue
            pacq = hits[0]['p0']
            ok = True
            for q_ in periods:
                if D(q_['t1']) > cd and D(q_['t0']) < t1:
                    ar = [x for x in q_['rows'] if x['cik'] and int(x['cik']) == acik]
                    if not ar or any(x['cls'] in ('SPLIT', 'AMBIGUOUS_CA') for x in ar):
                        ok = False
            if not ok:
                row['reason'] = 'ACQUIRER_CA'
                out.append(row)
                continue
            row['acquirerPriceT1'] = round(pacq, 6)
        if RULES != '1.0.0':  # 1.0.1 A3: spin-off / special distribution dated in [t0 - 5d, completion]
            comp = D(row['completion']['filingDate'])
            extra = [x for x in sub['rows'] if x['form'] in ('10-K', '10-K405', '10-Q') and t0 < D(x['filingDate']) <= comp + dt.timedelta(days=30)]
            for form in ('10-K', '10-Q'):
                xs = sorted([x for x in extra if x['form'].startswith(form)], key=lambda x: x['filingDate'], reverse=True)[:1]
                for x in xs:
                    read(x)
            hitd = sorted({dd for d in docs for dd in (d.get('distDates') or []) if t0 - dt.timedelta(days=5) <= D(dd) <= comp})
            row['distributionScan'] = {'documents': len(docs), 'datesInWindow': hitd}
            if hitd:
                row['reason'] = 'DISTRIBUTION_IN_PERIOD'
                out.append(row)
                continue
        v = (cash + ratio * pacq) / r['p0']
        if not (1 / 3 <= v <= 3) or split_sized(v):
            row['reason'] = 'CA_SUSPECT'
            out.append(row)
            continue
        row['status'] = 'TERMINAL_' + chosen['kind']
        row['return'] = round(v - 1, 6)
        out.append(row)
    # coverage per period
    cov = []
    for p in periods:
        if p['t0'] > '2009-09-30':
            continue
        rs = [x for x in out if x['t0'] == p['t0']]
        acc = [x for x in rs if x['status'].startswith('TERMINAL_')]
        s = p['summary']
        add = sum(x['weight'] * x['return'] for x in acc)
        wacc = sum(x['weight'] for x in acc)
        cov.append({'t0': p['t0'], 't1': p['t1'], 'boundedRows': len(rs), 'terminalRows': len(acc), 'boundedWBefore': s['boundedW'],
                    'boundedExitWScope': round(sum(x['weight'] for x in rs), 6), 'boundedWAfter': round(s['boundedW'] - wacc, 6),
                    'diagnosticErrorPpBefore': s['errorPp'], 'diagnosticErrorPpAfter': round(s['errorPp'] + 100 * add, 4), 'tolerancePp': s['tolerancePp']})
    cnt = collections.Counter(x['status'] if x['status'] != 'BOUNDED' else 'BOUNDED:' + x['reason'] for x in out)
    reg = {'schemaVersion': 'v13b-spx-exit-terminal-register-' + RULES,
           'rules': 'spx-terminal-rules-%s.json' % RULES, 'rulesSha256': C.sha(open(os.path.join(a.root, DOCDIR, 'spx-terminal-rules-%s.json' % RULES), 'rb').read()),
           'codeSha256': C.sha(open(os.path.abspath(__file__), 'rb').read()) , 'commonSha256': C.sha(open(os.path.join(HERE, 'common.py'), 'rb').read()),
           'inputs': {'population-1.1.1.json.gz': C.sha(open(os.path.join(a.root, 'docs/quant-recovery/v12/spxpop/population-1.1.1.json.gz'), 'rb').read()),
                      'detail-1.1.1.json (private)': C.sha(open(os.path.join(a.spxpop, 'detail-1.1.1.json'), 'rb').read())},
           'evidenceKind': 'SOURCE_EVIDENCE', 'certificationStatus': 'NOT_CERTIFIED', 'productionApproved': False,
           'scopeRows': len(out), 'candidates': n_cand, 'counts': dict(sorted(cnt.items())), 'coverageByPeriod': cov, 'rows': out}
    with open(os.path.join(a.root, DOCDIR, 'spx-terminal-register-%s.json' % RULES), 'w') as fh:
        json.dump(reg, fh, indent=1, ensure_ascii=False)
        fh.write('\n')
    os.makedirs(os.path.join(a.private, 'spx'), exist_ok=True)
    json.dump(priv, open(os.path.join(a.private, 'spx', 'documents-%s.json' % RULES), 'w'), indent=1)
    print(json.dumps({'counts': reg['counts'], 'candidates': n_cand, 'requests': f.client.stats['requests']}, indent=1))


if __name__ == '__main__':
    main()
