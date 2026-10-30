"""V12 LISTREF step 3: dei:EntityPublicFloat per CIK from the private companyfacts.zip (V10 factor strand, reused).

Public float (aggregate market value held by non-affiliates, as of the last business day of the second fiscal quarter,
reported on the 10-K cover) is the only size measure available for listings we hold no price series for. It is an
under-estimate of market capitalisation (affiliates excluded) and is subject to the same filer scale errors P1 studies;
values > 5e12 USD are flagged, not corrected. Writes only the private --out TSV: cik, end, val, form, filed, accn.

    python3 scripts/quant/v12/listref/extract_float.py --out <private>/work/public-float.tsv.gz
"""
import argparse
import gzip
import json
import os
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrlib as L  # noqa: E402

ZIP = L.SCRATCH / 'v10-private' / 'factor' / 'bulk' / 'companyfacts.zip'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    L._assert_private(a.out)
    n = rows = 0
    with zipfile.ZipFile(ZIP) as z, gzip.open(a.out, 'wt') as out:
        for info in z.infolist():
            if not info.filename.endswith('.json'):
                continue
            raw = z.read(info)
            if b'EntityPublicFloat' not in raw:
                continue
            d = json.loads(raw)
            cik = str(int(d.get('cik') or info.filename[3:13]))
            units = (((d.get('facts') or {}).get('dei') or {}).get('EntityPublicFloat') or {}).get('units') or {}
            seen = set()
            for unit, facts in units.items():
                if unit != 'USD':
                    continue
                for f in facts:
                    if not str(f.get('form', '')).startswith('10-K'):
                        continue
                    k = (f.get('end'), f.get('val'))
                    if k in seen:
                        continue
                    seen.add(k)
                    out.write('%s\t%s\t%s\t%s\t%s\t%s\n' % (cik, f.get('end'), f.get('val'), f.get('form'), f.get('filed'), f.get('accn')))
                    rows += 1
            n += 1
    print(json.dumps({'ciksWithFloat': n, 'rows': rows, 'zipSha256Manifest': json.loads((ZIP.parent / 'manifest.json').read_text())}))


if __name__ == '__main__':
    main()
