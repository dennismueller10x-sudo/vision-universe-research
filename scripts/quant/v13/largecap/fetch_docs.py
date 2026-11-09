"""V13 LARGECAP step 1: fetch the document set of protocol 1.0.0 'documents' (annual + quarterly; 8-K symbol-change
documents are fetched later by build_anchors.py only where needed). Writes a private manifest (one line per document)."""
import argparse, json, re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import seclib13 as S

PROTO = json.load(open(S.ROOT / 'docs/quant-recovery/v13/largecap/protocol-1.0.0.json'))
ANNUAL = ('10-K', '10-K405', '10-KT')


def ex13_from_index(body):
    t = body.decode('utf-8', 'replace')
    out = []
    for row in re.findall(r'(?is)<tr[^>]*>(.*?)</tr>', t):
        cells = [S.text_of(c) for c in re.findall(r'(?is)<td[^>]*>(.*?)</td>', row)]
        href = re.search(r'href="(/Archives/edgar/data/[^"]+)"', row)
        if len(cells) >= 4 and href and re.match(r'EX-13', cells[3].strip(), re.I):
            out.append('https://www.sec.gov' + href.group(1).replace('/ix?doc=', ''))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    out = pathlib.Path(a.out).resolve()
    S._assert_private(out)
    lines = []
    for sid, cik in PROTO['listingIdentity']['cik'].items():
        if a.only and sid not in a.only.split(','):
            continue
        head, filings, metas = S.submissions(cik)
        for m in metas:
            lines.append({'sid': sid, 'cik': cik, 'kind': 'SUBMISSIONS', **m})
        for f in filings:
            fd, form = f['filingDate'], f['form']
            if not ('1993-01-01' <= fd <= '2026-10-28'):
                continue
            acc = f['accessionNumber']
            base = {'sid': sid, 'cik': cik, 'accession': acc, 'form': form, 'filingDate': fd, 'reportDate': f.get('reportDate') or ''}
            urls = []
            if form in ANNUAL:
                if fd < '2009-01-01':
                    urls.append(('FULL_TEXT', S.full_text_url(cik, acc)))
                else:
                    ib, im = S.get(S.archive_url(cik, acc, acc + '-index.htm'))
                    lines.append({**base, 'kind': 'INDEX', **im})
                    if f.get('primaryDocument'):
                        urls.append(('PRIMARY', S.archive_url(cik, acc, f['primaryDocument'])))
                    for u in ex13_from_index(ib):
                        urls.append(('EX13', u))
            elif form == '10-Q' and fd >= '2004-01-01':
                urls.append(('PRIMARY', S.archive_url(cik, acc, f['primaryDocument'])) if f.get('primaryDocument') else ('FULL_TEXT', S.full_text_url(cik, acc)))
            for kind, u in urls:
                try:
                    body, meta = S.get(u)
                except Exception as e:  # noqa: BLE001 - recorded, fail closed (document missing)
                    lines.append({**base, 'kind': kind, 'url': u, 'error': str(e)[:200]})
                    continue
                lines.append({**base, 'kind': kind, **meta})
        print(sid, S.STATS, flush=True)
    with open(out, 'w') as fh:
        for l in lines:
            fh.write(json.dumps(l) + '\n')
    print('done', len(lines), S.STATS)


if __name__ == '__main__':
    main()
