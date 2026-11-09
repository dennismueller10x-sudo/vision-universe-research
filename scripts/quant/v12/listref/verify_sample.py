"""V12 LISTREF step 8: verification sample against original documents (>= 50 cases, budget <= 3000 documents).

Deterministic stratified sample of register events with linked reference chains and 8-K item metadata. For every case:
  - the Form 25 / 25-NSE filing (filing index JSON -> primary document): class of security and rule provision
    (17 CFR 240.12d2-2 (a)(1)-(4) redemption/conversion/extinction, (b) exchange removal, (c) issuer withdrawal);
  - the decisive 8-K named by the item metadata: the item paragraph (quote <= 300 characters) and whether the linked
    ticker occurs in the 8-K or the Form 25 filing (link check).
Writes the committed evidence file (quotes <= 300 chars, URLs, SHA-256) and counts documents fetched.

    python3 scripts/quant/v12/listref/verify_sample.py --out docs/quant-recovery/v12/listref/verification-sample-1.0.2.json
"""
import argparse
import hashlib
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrlib as L  # noqa: E402

QUOTAS = [('MERGER_ACQUISITION_COMPLETED', 22), ('LISTING_RULE_OR_TRANSFER_NOTICE', 14), ('BANKRUPTCY', 8), ('MERGER_PROCESS_INDICATED', 4), ('VOLUNTARY_ISSUER_FILING', 3), ('UNKNOWN', 9)]
ITEM_RX = {'2.01': r'Item\s*2\.01', '3.01': r'Item\s*3\.01', '1.03': r'Item\s*1\.03'}
ITEM_TITLE = {'2.01': r'Item\s*2\.01\.?\s*[:\-\u2013\u2014]?\s*Completion\s+of\s+Acquisition', '3.01': r'Item\s*3\.01\.?\s*[:\-\u2013\u2014]?\s*Notice\s+of\s+Delisting',
              '1.03': r'Item\s*1\.03\.?\s*[:\-\u2013\u2014]?\s*Bankruptcy'}
RULE_MEANING = {'(a)(1)': 'CALLED_FOR_REDEMPTION', '(a)(2)': 'REDEEMED_OR_RETIRED', '(a)(3)': 'CONVERTED_OR_EXCHANGED_SUBSTITUTED', '(a)(4)': 'RIGHTS_EXTINGUISHED',
                '(b)': 'EXCHANGE_REMOVAL_RULES', '(c)': 'ISSUER_VOLUNTARY_WITHDRAWAL'}


def text_of(body):
    t = body.decode('utf-8', 'replace')
    t = re.sub(r'(?is)<(script|style).*?</\1>', ' ', t)
    t = re.sub(r'(?s)<[^>]+>', ' ', t)
    return re.sub(r'\s+', ' ', html.unescape(t)).strip()


def key(x):
    return hashlib.sha256(('%s|%s' % (x[0], x[1])).encode()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    reasons = json.load(open(L.PRIVATE / 'work' / 'delisting-reasons.json'))
    reg = {(e['cik'], e['eventDate']): e for e in json.load(open(L.PRIVATE / 'work' / 'delisting-register.json'))}
    cols = reasons['columns']
    rows = [dict(zip(cols, r)) for r in reasons['rows'] if r[2] == 'LINKED_ITEMS_QUERIED']
    sample = []
    for cls, n in QUOTAS:
        pool = sorted((r for r in rows if r['reason'] == cls), key=lambda r: key((r['cik'], r['eventDate'])))
        sample += pool[:n]
    docs = 0
    cases = []
    for r in sample:
        ev = reg[(r['cik'], r['eventDate'])]
        tick = sorted({c['ticker'] for c in ev['linkedChains']})
        case = {'cik': r['cik'], 'eventDate': r['eventDate'], 'issuer': ev['name'], 'linkedTickers': tick, 'linkGrades': sorted({c['grade'] for c in ev['linkedChains']}),
                'claimedReason': r['reason'], 'items': r['items'], 'documents': []}
        form25 = next((f for f in ev['forms'] if f[0] in ('25-NSE', '25')), None)
        texts = []
        if form25:
            acc = form25[2]
            base = 'https://www.sec.gov/Archives/edgar/data/%s/%s/' % (int(r['cik']), acc.replace('-', ''))
            try:
                idx, m = L.get(base + 'index.json')
                docs += 1
                files = [f['name'] for f in json.loads(idx)['directory']['item']]
                prim = next((f for f in files if f.lower() == 'primary_doc.xml'), None) or next((f for f in files if f.lower().endswith(('.xml', '.htm', '.txt')) and not f.endswith('-index.htm') and acc not in f), None)
                case['form25'] = {'form': form25[0], 'accession': acc, 'filingDate': form25[1], 'files': files[:12]}
                if prim:
                    body, m2 = L.get(base + prim)
                    docs += 1
                    t = body.decode('utf-8', 'replace')
                    cls_m = re.search(r'<descriptionClassSecurity>(.*?)</descriptionClassSecurity>', t, re.S)
                    rule_m = re.search(r'12d2-2\s*(\([a-c]\)(?:\(\d\))?)', t)
                    case['form25'].update({'url': base + prim, 'sha256': m2['sha256'], 'classOfSecurity': cls_m.group(1).strip()[:120] if cls_m else None,
                                           'ruleProvision': rule_m.group(1) if rule_m else None, 'ruleMeaning': RULE_MEANING.get(rule_m.group(1)) if rule_m else None})
                    texts.append(text_of(body))
                    case['documents'].append(base + prim)
                # Nasdaq attaches '<ticker>-form25.txt'-style exhibits; the file name itself is evidence of the symbol
                case['form25']['tickerInFileNames'] = any(re.match(r'(?i)%s[-_.]' % re.escape(t), f) for f in files for t in tick)
            except Exception as e:  # noqa: BLE001
                case['form25'] = {'error': str(e)[:120]}
        if r['decisive8K']:
            adsh, fname = r['decisive8K'].split(':', 1)
            url = 'https://www.sec.gov/Archives/edgar/data/%s/%s/%s' % (int(r['cik']), adsh.replace('-', ''), fname)
            try:
                body, m = L.get(url)
                docs += 1
                t = text_of(body)
                texts.append(t)
                it = {'MERGER_ACQUISITION_COMPLETED': '2.01', 'LISTING_RULE_OR_TRANSFER_NOTICE': '3.01', 'BANKRUPTCY': '1.03'}[r['reason']]
                # body heading = the LAST occurrence of 'Item x.xx <title>' (the cover page may list the title too); fallback: last bare occurrence
                heads = list(re.finditer(ITEM_TITLE[it], t, re.I))
                mm = heads[-1] if heads else None
                if mm is None:
                    for mm in re.finditer(ITEM_RX[it], t):
                        pass
                quote = t[mm.start(): mm.start() + 300] if mm else None
                case['eightK'] = {'url': url, 'sha256': m['sha256'], 'filingDate': r['decisive8KDate'], 'item': it, 'quote': quote}
                case['documents'].append(url)
            except Exception as e:  # noqa: BLE001
                case['eightK'] = {'url': url, 'error': str(e)[:120]}
        joined = ' '.join(texts)
        case['tickerInDocuments'] = any(re.search(r'(?<![A-Za-z])%s(?![A-Za-z])' % re.escape(t.replace('-', '.')), joined) for t in tick) if joined else None
        case['commonStock'] = bool(re.search(r'(?i)common|ordinary|class a', (case.get('form25') or {}).get('classOfSecurity') or '')) if (case.get('form25') or {}).get('classOfSecurity') else None
        rm = (case.get('form25') or {}).get('ruleMeaning')
        q = (case.get('eightK') or {}).get('quote') or ''
        if r['reason'] == 'MERGER_ACQUISITION_COMPLETED':
            case['reasonVerdict'] = 'CONFIRMED' if re.search(r'(?i)merger|acqui|consummat|completion', q) else 'NOT_CONFIRMED'
        elif r['reason'] == 'LISTING_RULE_OR_TRANSFER_NOTICE':
            case['reasonVerdict'] = 'CONFIRMED' if re.search(r'(?i)delist|listing rule|continued listing|transfer|notice', q) else 'NOT_CONFIRMED'
        elif r['reason'] == 'BANKRUPTCY':
            case['reasonVerdict'] = 'CONFIRMED' if re.search(r'(?i)bankruptcy|chapter 11|chapter 7|receiver', q) else 'NOT_CONFIRMED'
        else:
            case['reasonVerdict'] = 'NO_ITEM_TEXT_CLAIM'
        case['ruleConsistency'] = None if not rm else ('CONSISTENT' if (r['reason'] == 'MERGER_ACQUISITION_COMPLETED' and rm == 'CONVERTED_OR_EXCHANGED_SUBSTITUTED') or
                                                       (r['reason'] == 'LISTING_RULE_OR_TRANSFER_NOTICE' and rm in ('EXCHANGE_REMOVAL_RULES', 'ISSUER_VOLUNTARY_WITHDRAWAL')) or
                                                       (r['reason'] == 'BANKRUPTCY' and rm in ('EXCHANGE_REMOVAL_RULES', 'RIGHTS_EXTINGUISHED')) else 'OTHER')
        cases.append(case)
    agg = {'cases': len(cases), 'documentsFetched': docs, 'reasonVerdict': {}, 'ruleConsistency': {}, 'tickerInDocuments': {}, 'commonStock': {}, 'ruleMeaningByReason': {}}
    for c in cases:
        for k in ('reasonVerdict', 'ruleConsistency', 'tickerInDocuments', 'commonStock'):
            agg[k][str(c.get(k))] = agg[k].get(str(c.get(k)), 0) + 1
        rm = str((c.get('form25') or {}).get('ruleMeaning'))
        agg['ruleMeaningByReason'].setdefault(c['claimedReason'], {})
        agg['ruleMeaningByReason'][c['claimedReason']][rm] = agg['ruleMeaningByReason'][c['claimedReason']].get(rm, 0) + 1
    doc = {'schemaVersion': 'v12-listref-verification-sample-1.0.2', 'evidenceKind': 'SOURCE_EVIDENCE', 'certificationStatus': 'NOT_CERTIFIED', 'productionApproved': False,
           'selection': 'deterministic: per claimed reason the first N LINKED_ITEMS_QUERIED events ordered by sha256(cik|eventDate); quotas %s' % QUOTAS,
           'quoteRule': 'quote = 300 characters from the last occurrence of the item heading with its title (else the last bare item number) in the 8-K text (HTML stripped); verdict = keyword check on the quote (merger/acquisition/consummation; delisting/listing rule/transfer/notice; bankruptcy/chapter 11/7/receiver)', 'summary': agg, 'sec': dict(L.STATS), 'cases': cases}
    L.write_json(a.out, doc)
    print(json.dumps(agg, indent=1))


if __name__ == '__main__':
    main()
