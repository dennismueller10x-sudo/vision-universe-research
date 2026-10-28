#!/usr/bin/env python3
"""Relation of submissions-JSON acceptanceDateTime to the SGML header ACCEPTANCE-DATETIME (Eastern).

Deterministic sample: population CIKs ranked by sha256(cik+seed); per CIK one periodic
filing chosen by sha256(accession+seed). Writes derived evidence only.
usage: python3 -I tz_check.py --n 60 --evidence <json>
"""
import argparse, datetime, hashlib, json, pathlib, sys, zipfile
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import PRIVATE, client, population, write_json, sha256_file  # noqa
import xbrl  # noqa

SEED = "v9-secpit-tz-1"
FORMS = {"10-K", "10-Q", "10-K/A", "10-Q/A", "20-F", "40-F"}


def h(s):
    return hashlib.sha256((s + SEED).encode()).hexdigest()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=60); ap.add_argument("--evidence", required=True)
    args = ap.parse_args()
    z = zipfile.ZipFile(PRIVATE / "bulk/submissions.zip")
    names = set(z.namelist())
    ciks = sorted(population(), key=h)
    c = client(); rows = []
    for cik in ciks:
        if len(rows) >= args.n:
            break
        name = "CIK%s.json" % cik
        if name not in names:
            continue
        r = json.loads(z.read(name))["filings"]["recent"]
        cands = [i for i, f in enumerate(r["form"]) if f in FORMS and r["acceptanceDateTime"][i]]
        if not cands:
            continue
        i = min(cands, key=lambda i: h(r["accessionNumber"][i]))
        acc = r["accessionNumber"][i]
        try:
            hd = xbrl.header_acceptance(c, cik, acc)
        except Exception as e:  # noqa
            rows.append({"cik": cik, "accession": acc, "state": "UNRESOLVED", "reason": str(e)[:200]}); continue
        sub = r["acceptanceDateTime"][i]
        row = {"cik": cik, "accession": acc, "form": r["form"][i], "filingDate": r["filingDate"][i],
               "submissionsAcceptance": sub, "headerEastern": hd.get("rawEastern"),
               "headerUtc": hd.get("acceptanceUtc"), "headerSha256": hd.get("sha256"), "state": hd["state"]}
        if hd["state"] == "OK":
            a = datetime.datetime.fromisoformat(sub.replace("Z", "+00:00"))
            b = datetime.datetime.fromisoformat(hd["acceptanceUtc"].replace("Z", "+00:00"))
            row["deltaHours"] = (a - b).total_seconds() / 3600
            east = datetime.datetime.strptime(hd["rawEastern"], "%Y%m%d%H%M%S")
            row["submissionsEqualsEasternWallClockAsUtc"] = a.replace(tzinfo=None) == east
            row["easternHour"] = east.hour
        api = json.loads(c.get_bytes("https://data.sec.gov/submissions/CIK%s.json" % cik))["filings"]["recent"]
        if acc in api["accessionNumber"]:
            row["apiAcceptance"] = api["acceptanceDateTime"][api["accessionNumber"].index(acc)]
            row["apiEqualsHeaderUtc"] = row["apiAcceptance"] == hd.get("acceptanceUtc")
            row["bulkEqualsApi"] = row["apiAcceptance"] == sub
        else:
            row["apiAcceptance"] = None  # only in older paged files; not fetched
        rows.append(row)
    deltas = {}
    for r in rows:
        if "deltaHours" in r:
            deltas[str(r["deltaHours"])] = deltas.get(str(r["deltaHours"]), 0) + 1
    out = {"schemaVersion": "v9-secpit-tz-1.0.0", "seed": SEED, "submissionsZipSha256": sha256_file(PRIVATE / "bulk/submissions.zip"),
           "codeSha256": sha256_file(pathlib.Path(__file__)), "sample": len(rows), "deltaHoursHistogram": deltas,
           "requestStats": c.stats, "rows": rows,
           "apiComparable": sum(1 for r in rows if r.get("apiAcceptance")),
           "apiEqualsHeaderUtc": sum(1 for r in rows if r.get("apiEqualsHeaderUtc")),
           "bulkEqualsApi": sum(1 for r in rows if r.get("bulkEqualsApi")),
           "meaning": "delta = submissions acceptanceDateTime (as parsed, Z=UTC) minus SGML ACCEPTANCE-DATETIME converted America/New_York->UTC"}
    write_json(args.evidence, out)
    print(json.dumps({"sample": len(rows), "deltas": deltas, "stats": c.stats}))


if __name__ == "__main__":
    main()
