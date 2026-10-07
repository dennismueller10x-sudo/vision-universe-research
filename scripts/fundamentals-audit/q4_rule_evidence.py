"""Belege fuer die Frage: wann ist ein Q4-EPS aus Jahres- und Quartalswerten korrekt ableitbar?

Nur ENTWICKLUNGS-Partition des praeregistrierten TTM-Holdouts (FUNDAMENTAL-TTM-HOLDOUT-PREREG.json), ohne die bereits
gesehenen Emittenten der Entwicklungs-GT und des ersten Holdouts. Je (Emittent, Konzept, Geschaeftsjahr) mit gemeldetem
Dreimonats-Q4 (Erstmeldung) und FY derselben Konzeptfamilie (Erstmeldung):
  F1 = FY - 9M                      (9M-YTD derselben Familie)
  F2 = FY - (Q1 + Q2 + Q3)          (gemeldete Dreimonatswerte)
  F3 = (FY*SH_FY - 9M*SH_9M) / (4*SH_FY - 3*SH_9M)   Nettoergebnis je Aktie ueber gewichtete Aktien
       (SH = gewichtete verwaesserte bzw. unverwaesserte Aktien, Erstmeldung)
Merkmale: Aktienbasis |SH_FY - SH_9M| / SH_FY, Vorzeichenwechsel zwischen Quartalen, Aktiensprung (Split),
52/53-Wochen-Jahr, Familie (verwaessert/unverwaessert). Ausgabe JSONL je Beobachtung.
  python3 q4_rule_evidence.py <companyfacts.zip> <ciks.json> <exclude.json> <out.jsonl> [--partition development|holdout]
"""
import hashlib
import json
import sys
import zipfile
from datetime import date

FAMILIES = {
    "diluted": (("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"), "WeightedAverageNumberOfDilutedSharesOutstanding"),
    "basic": (("EarningsPerShareBasic", "EarningsPerShareBasicAndDiluted"), "WeightedAverageNumberOfSharesOutstandingBasic"),
}
FORMS = {"10-K", "10-Q", "10-K/A", "10-Q/A", "10-KT", "10-QT"}


def partition(cik10):
    return "development" if hashlib.sha256(f"vu-ttm-holdout-1|{cik10}".encode()).hexdigest()[0] in "01234567" else "holdout"


def days(start, end):
    return (date.fromisoformat(end) - date.fromisoformat(start)).days


def first_reports(rows):
    """(start, end) -> erste Meldung (frueheste Einreichung)."""
    out = {}
    for row in sorted(rows, key=lambda r: (r["filed"], r.get("accn", ""))):
        if row.get("form") not in FORMS or not row.get("start"):
            continue
        out.setdefault((row["start"], row["end"]), row)
    return out


def gather(cf, tags, unit_test):
    rows = []
    for tag in tags:
        body = (cf.get("facts") or {}).get("us-gaap", {}).get(tag)
        if not body:
            continue
        for unit, values in body.get("units", {}).items():
            if unit_test(unit):
                rows.extend(dict(v, tag=tag, unit=unit) for v in values)
    return first_reports(rows)


def near(a, b, tol=7):
    return abs((date.fromisoformat(a) - date.fromisoformat(b)).days) <= tol


def find(series, start=None, end=None, lo=0, hi=10_000):
    for (s, e), row in series.items():
        if (start is None or near(s, start)) and (end is None or near(e, end)) and lo <= days(s, e) <= hi:
            return row
    return None


def main():
    archive, ciks_path, exclude_path, out_path = sys.argv[1:5]
    wanted = sys.argv[sys.argv.index("--partition") + 1] if "--partition" in sys.argv else "development"
    exclude = {str(c).zfill(10) for c in json.load(open(exclude_path))}
    ciks = [str(c).zfill(10) for c in json.load(open(ciks_path))]
    ciks = [c for c in ciks if partition(c) == wanted and c not in exclude]
    zf = zipfile.ZipFile(archive)
    names = set(zf.namelist())
    n = 0
    with open(out_path, "w") as out:
        for cik in ciks:
            name = f"CIK{cik}.json"
            if name not in names:
                continue
            cf = json.loads(zf.read(name))
            for family, (tags, share_tag) in FAMILIES.items():
                eps = gather(cf, tags, lambda u: u.endswith("/shares"))
                shares = gather(cf, (share_tag,), lambda u: u == "shares")
                if not eps:
                    continue
                for (s, e), fy in eps.items():
                    if not 350 <= days(s, e) <= 380:
                        continue
                    q4 = find(eps, end=e, lo=80, hi=100)
                    if q4 is None:
                        continue
                    m9 = find(eps, start=s, lo=260, hi=285)
                    q1 = find(eps, start=s, lo=80, hi=100)
                    q2 = q3 = None
                    if q1:
                        q2 = next((r for (a, b), r in eps.items() if 80 <= days(a, b) <= 100 and 0 < days(q1["end"], a) <= 7), None)
                    if q2:
                        q3 = next((r for (a, b), r in eps.items() if 80 <= days(a, b) <= 100 and 0 < days(q2["end"], a) <= 7), None)
                    sh_fy = find(shares, start=s, end=e, lo=350, hi=380)
                    sh_9m = find(shares, start=s, lo=260, hi=285)
                    sh_q1 = find(shares, start=s, lo=80, hi=100)
                    sh_q4 = find(shares, end=e, lo=80, hi=100)
                    rec = {"cik": cik, "family": family, "fyStart": s, "fyEnd": e, "fyDays": days(s, e),
                           "fy": fy["val"], "fyTag": fy["tag"], "fyFiled": fy["filed"],
                           "q4": q4["val"], "q4Tag": q4["tag"], "q4Filed": q4["filed"], "q4Form": q4["form"], "q4Accn": q4.get("accn"), "fyAccn": fy.get("accn"),
                           "m9": m9["val"] if m9 else None, "m9Tag": m9["tag"] if m9 else None,
                           "q123": [q["val"] for q in (q1, q2, q3)] if (q1 and q2 and q3) else None,
                           "shFy": sh_fy["val"] if sh_fy else None, "sh9m": sh_9m["val"] if sh_9m else None,
                           "shQ1": sh_q1["val"] if sh_q1 else None, "shQ4": sh_q4["val"] if sh_q4 else None}
                    rec["f1"] = round(rec["fy"] - rec["m9"], 6) if rec["m9"] is not None else None
                    rec["f2"] = round(rec["fy"] - sum(rec["q123"]), 6) if rec["q123"] else None
                    if rec["m9"] is not None and rec["shFy"] and rec["sh9m"]:
                        denominator = 4 * rec["shFy"] - 3 * rec["sh9m"]
                        rec["f3"] = round((rec["fy"] * rec["shFy"] - rec["m9"] * rec["sh9m"]) / denominator, 6) if denominator > 0 else None
                        rec["shareBasis"] = round(abs(rec["shFy"] - rec["sh9m"]) / rec["shFy"], 6)
                    if rec["shQ1"] and rec["shQ4"]:
                        ratio = rec["shQ4"] / rec["shQ1"]
                        rec["shareJump"] = round(ratio, 4)
                    values = ([*rec["q123"], rec["q4"]] if rec["q123"] else [rec["q4"], rec["fy"]])
                    rec["signMix"] = len({v > 0 for v in values if v != 0}) > 1
                    rec["week52_53"] = rec["fyDays"] in (364, 371) or not (s.endswith("-01") and e[5:] in ("12-31", "06-30", "09-30", "03-31"))
                    out.write(json.dumps(rec) + "\n")
                    n += 1
    print("observations", n)


if __name__ == "__main__":
    main()
