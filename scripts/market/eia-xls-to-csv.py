#!/usr/bin/env python3
"""
VISION UNIVERSE — eia-xls-to-csv.py   (Multi-Asset Core, Rohstoffe)

Die EIA ist die Primaerquelle fuer die US-Spotpreise von WTI, Brent und
Henry-Hub-Erdgas. Ihre API verlangt einen Schluessel (gemessen: HTTP 403
ohne), die Historientabellen gibt es schluessellos nur als altes
Excel-Format (.xls, BIFF). Dieses Skript wandelt genau diese Dateien in
ein flaches CSV (Datum, Wert) - nichts anderes. Die Einheit und der Titel
der Reihe werden aus dem Kopf der Datei gelesen und mitgeschrieben, damit
niemand sie aus dem Dateinamen erraten muss.

Aufruf:
  python3 scripts/market/eia-xls-to-csv.py <out_dir> RWTC RBRTE RNGWHHD

Die Ausgabe liegt im Arbeitsstand (.market-cache), nicht im Repository.
"""
import csv
import json
import os
import sys
import urllib.request

import xlrd  # nur .xls (BIFF); pip install xlrd==2.0.1

URLS = {
    "RWTC": "https://www.eia.gov/dnav/pet/hist_xls/RWTCd.xls",
    "RBRTE": "https://www.eia.gov/dnav/pet/hist_xls/RBRTEd.xls",
    "RNGWHHD": "https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls",
}
UA = "VisionUniverse-DataCore/1.0 (+https://research.visionuniverse.de)"


def convert(series, out_dir):
    req = urllib.request.Request(URLS[series], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        blob = res.read()
    book = xlrd.open_workbook(file_contents=blob)
    sheet = None
    for name in book.sheet_names():
        if name.lower().startswith("data"):
            sheet = book.sheet_by_name(name)
            break
    if sheet is None:
        raise SystemExit(f"{series}: kein Datenblatt gefunden ({book.sheet_names()})")
    title = None
    rows = []
    for r in range(sheet.nrows):
        c0, c1 = sheet.cell(r, 0), sheet.cell(r, 1) if sheet.ncols > 1 else None
        if c0.ctype == xlrd.XL_CELL_DATE and c1 is not None and c1.ctype == xlrd.XL_CELL_NUMBER:
            d = xlrd.xldate.xldate_as_datetime(c0.value, book.datemode).date().isoformat()
            rows.append((d, c1.value))
        elif title is None and c1 is not None and isinstance(c1.value, str) and "(" in c1.value:
            title = c1.value.strip()
    rows.sort()
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{series}.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["date", "value"])
        w.writerows(rows)
    meta = {"series": series, "url": URLS[series], "title": title, "observations": len(rows),
            "firstDate": rows[0][0] if rows else None, "lastDate": rows[-1][0] if rows else None}
    with open(os.path.join(out_dir, f"{series}.meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    print(json.dumps(meta))


def main():
    out_dir = sys.argv[1]
    for s in sys.argv[2:] or list(URLS):
        try:
            convert(s, out_dir)
        except Exception as err:  # eine fehlende Reihe haelt die anderen nicht auf
            print(json.dumps({"series": s, "error": str(err)[:200]}))


if __name__ == "__main__":
    main()
