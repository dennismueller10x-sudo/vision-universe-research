"""V12 LISTREF step 1: EDGAR full-index form.gz 1994Q1-2026Q4 -> private event table.

form.gz is the gzip of form.idx (same rows as company.idx, sorted by form type instead of company), so one file per
quarter carries form type, company name, CIK, filing date and accession path. Files already fetched by the V10
population strand (2000-2026) are reused from its private cache; only missing quarters go over the network through
the fair-access client (2 req/s).

Writes (private only):
  <private>/work/edgar-events.tsv.gz   form, cik, date, accession, company name   (selected forms only)
  <private>/work/edgar-annual.tsv.gz   year, cik, form-family  (distinct annual-report filers per calendar year)
  <private>/work/edgar-index-manifest.json   url, sha256, bytes, rows, cache origin per quarter

    python3 scripts/quant/v12/listref/fetch_indices.py
"""
import gzip
import json
import re
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrlib as L  # noqa: E402

FIRST, LAST = (1994, 1), (2026, 4)
LINE = re.compile(r'^(?P<form>\S.*?)\s{2,}(?P<name>.*?)\s+(?P<cik>\d{1,10})\s+(?P<date>\d{4}-?\d{2}-?\d{2})\s+(?P<file>edgar/\S+)\s*$')
ANNUAL = {'10-K': '10K', '10-K405': '10K', '10-KSB': '10KSB', '10-KSB40': '10KSB', '10KSB': '10KSB', '10KSB40': '10KSB', '10-KSB405': '10KSB', '10-KT': '10K', '10-K405T': '10K', '20-F': '20F', '40-F': '40F'}
EVENT_FORMS = {
    '25', '25/A', '25-NSE', '25-NSE/A', '15-12B', '15-12B/A', '15-12G', '15-12G/A', '15-15D', '15-15D/A', '15F-12B', '15F-12G', '15F-15D',
    '8-A12B', '8-A12B/A', '8-A12G', '8-A12G/A', '10-12B', '10-12G',
    'DEFM14A', 'DEFM14C', 'PREM14A', 'SC 14D9', 'SC TO-T', 'SC 13E3', 'SC 14D1', 'SC 13E4',
    '8-K', '424B4', 'S-1', 'S-4', 'F-1', 'F-4',
}


def quarters():
    y, q = FIRST
    while (y, q) <= LAST:
        yield y, q
        q += 1
        if q == 5:
            y, q = y + 1, 1


def acc_of(path):
    m = re.search(r'(\d{10}-\d{2}-\d{6})', path)
    return m.group(1) if m else path.rsplit('/', 1)[-1]


def main():
    out = L.PRIVATE / 'work'
    out.mkdir(parents=True, exist_ok=True)
    manifest, annual = [], {}
    bad = 0
    with gzip.open(out / 'edgar-events.tsv.gz', 'wt', encoding='utf-8') as ev:
        for y, q in quarters():
            url = 'https://www.sec.gov/Archives/edgar/full-index/%d/QTR%d/form.gz' % (y, q)
            body, meta = L.get(url)
            raw = gzip.decompress(body) if body[:2] == b'\x1f\x8b' else body
            text = raw.decode('latin-1')
            lastrecv = re.search(r'Last Data Received:\s*(.+)', text)
            started, rows, kept = False, 0, 0
            for line in text.splitlines():
                if not started:
                    started = line.startswith('-----')
                    continue
                if not line.strip():
                    continue
                m = LINE.match(line)
                if not m:
                    bad += 1
                    continue
                rows += 1
                form = re.sub(r'\s+/A$', '/A', m.group('form').strip())
                d = m.group('date')
                if len(d) == 8:
                    d = d[:4] + '-' + d[4:6] + '-' + d[6:]
                cik = str(int(m.group('cik')))
                fam = ANNUAL.get(form)
                if fam:
                    annual.setdefault((d[:4], cik), set()).add(fam)
                if form in EVENT_FORMS or fam:
                    ev.write('\t'.join([form, cik, d, acc_of(m.group('file')), m.group('name').strip().replace('\t', ' ')]) + '\n')
                    kept += 1
            manifest.append({'url': url, 'sha256': meta['sha256'], 'bytes': meta['bytes'], 'from': meta['from'], 'rows': rows, 'kept': kept,
                             'lastDataReceived': lastrecv.group(1).strip() if lastrecv else None})
            print(y, q, meta['from'], rows, kept, file=sys.stderr)
    with gzip.open(out / 'edgar-annual.tsv.gz', 'wt', encoding='utf-8') as fh:
        for (yr, cik), fams in sorted(annual.items()):
            fh.write('%s\t%s\t%s\n' % (yr, cik, ','.join(sorted(fams))))
    L.write_json(out / 'edgar-index-manifest.json', {'files': manifest, 'unparsedLines': bad, 'sec': dict(L.STATS)})
    print(json.dumps({'quarters': len(manifest), 'unparsedLines': bad, 'sec': L.STATS}))


if __name__ == '__main__':
    main()
