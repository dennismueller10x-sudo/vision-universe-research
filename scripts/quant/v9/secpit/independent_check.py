#!/usr/bin/env python3
"""V9 secpit task 5: independent recomputation (stdlib only).

Does NOT import the secpit modules nor scripts/quant/sec. Reads the inputs
directly: bulk companyfacts.zip, the private HTTP cache bodies (original
instances / API submissions), the repo population files, and compares with the
evidence JSONs.

  A  fy anomalies: rescan companyfacts entries of the population for fy outside
     [1990, 2027]; entries / accessions / issuers; Excel-serial share.
  B  availability rows: every evidence row is re-found in companyfacts (accn,
     concept, start, end, val); its true acceptance is re-read from the cached
     API body when present; the predicate date < period_end is re-evaluated; the
     class is recomputed by an independently written rule set.
  C  parity: every compared fact is recomputed from the cached original
     instance with xml.dom.minidom and from companyfacts.
  D  restatement pairs recounted from companyfacts.

usage: python3 -I independent_check.py --evidence <dir> --private <dir>
"""
import argparse
import datetime
import glob
import gzip
import hashlib
import json
import os
import zipfile
from decimal import Decimal
from xml.dom import minidom

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../.."))


def cache_body(private, url):
    digest = hashlib.sha256(url.encode()).hexdigest()
    path = os.path.join(private, "http-cache", digest[:2], digest + ".gz")
    if not os.path.exists(path):
        return None
    with gzip.open(path, "rb") as handle:
        return handle.read()


def population():
    ciks = set()
    for path in glob.glob(os.path.join(ROOT, "quant/data/fundamentals/issuers/*.json")):
        with open(path) as handle:
            for issuer in json.load(handle)["issuers"]:
                ciks.add(issuer["cik"])
    return ciks


def check_a(z, names, pop, dossier):
    entries, accs, issuers, serial = 0, set(), set(), 0
    for cik in sorted(pop):
        name = "CIK%s.json" % cik
        if name not in names:
            continue
        facts = json.loads(z.read(name)).get("facts") or {}
        for concepts in facts.values():
            for body in concepts.values():
                for rows in (body.get("units") or {}).values():
                    for e in rows:
                        fy = e.get("fy")
                        if fy is None or 1990 <= fy <= 2027:
                            continue
                        entries += 1
                        accs.add((cik, e.get("accn")))
                        issuers.add(cik)
                        if 20000 <= fy <= 80000:
                            serial += 1
    c = dossier["counts"]
    return {"entries": entries, "accessions": len(accs), "issuers": len(issuers), "excelSerialRangeEntries": serial,
            "parity": {"entries": entries == c["rawEntriesWithImplausibleFy"],
                       "accessions": len(accs) == c["accessionsWithImplausibleFy"],
                       "issuers": len(issuers) == c["issuersWithImplausibleFy"]}}


def klass(row):
    """Independent re-implementation of the availability classes."""
    def day(x):
        return datetime.date(int(x[:4]), int(x[5:7]), int(x[8:10]))
    end, avail = day(row["period_end"]), day(row["trueAvailable"])
    rep = day(row["reportDate"]) if row.get("reportDate") else None
    start = day(row["period_start"]) if row.get("period_start") else None
    cover = "COVER_DATE_INSTANT" in (row.get("flags") or [])
    if rep and rep > avail:
        return "FILING_ACCEPTED_BEFORE_ITS_REPORT_PERIOD_END"
    for k in range(1, 11):
        y = end.year - k
        try:
            s = end.replace(year=y)
        except ValueError:
            s = datetime.date(y, end.month, 28)
        if rep and -7 <= (s - rep).days <= 7:
            return "CONTEXT_YEAR_TYPO_ON_REPORT_PERIOD"
        if cover and rep and rep <= s <= avail + datetime.timedelta(days=1):
            return "COVER_DATE_YEAR_TYPO"
    if cover:
        return "COVER_DATE_AFTER_ACCEPTANCE_LE_31D" if (end - avail).days <= 31 else "COVER_DATE_AFTER_ACCEPTANCE_GT_31D"
    if start is None:
        if rep and end.month == rep.month and abs(end.day - rep.day) <= 3:
            return "FUTURE_INSTANT_SAME_MONTHDAY_AS_REPORT_PERIOD"
        return "FUTURE_INSTANT_OTHER"
    if rep and start > rep:
        return "DURATION_ENTIRELY_AFTER_REPORT_PERIOD"
    if rep and start <= rep < end:
        return "DURATION_STRADDLING_REPORT_PERIOD_END"
    return "DURATION_OTHER"


def check_b(z, names, private, avail):
    found = predicate = class_ok = api_checked = api_equal = 0
    by_class = {}
    cf_cache = {}
    for row in avail["rows"]:
        cik = row["cik"]
        if cik not in cf_cache:
            cf_cache.clear()
            cf_cache[cik] = json.loads(z.read("CIK%s.json" % cik))
        body = cf_cache[cik]["facts"].get(row["taxonomy"], {}).get(row["concept"], {})
        hit = any(e.get("accn") == row["accession"] and e.get("end") == row["period_end"] and
                  e.get("start") == row["period_start"] and float(e["val"]) == float(row["value"])
                  for rows in (body.get("units") or {}).values() for e in rows)
        found += hit
        api = cache_body(private, "https://data.sec.gov/submissions/CIK%s.json" % cik)
        if api is not None:
            recent = json.loads(api)["filings"]["recent"]
            if row["accession"] in recent["accessionNumber"]:
                api_checked += 1
                api_equal += recent["acceptanceDateTime"][recent["accessionNumber"].index(row["accession"])] == row["trueAvailable"]
        predicate += str(row["trueAvailable"])[:10] < row["period_end"]
        k = klass(row)
        class_ok += k == row["class"]
        by_class[k] = by_class.get(k, 0) + 1
    return {"rows": len(avail["rows"]), "foundInCompanyfacts": found, "predicateHolds": predicate,
            "classAgreement": class_ok, "apiChecked": api_checked, "apiEqual": api_equal,
            "byClassIndependent": dict(sorted(by_class.items(), key=lambda kv: -kv[1])),
            "byClassParity": by_class == avail["byClass"], "finalParity": len(avail["rows"]) == avail["final"]}


def parse_dom(body):
    dom = minidom.parseString(body)
    root = dom.documentElement
    ctx = {}
    for node in root.getElementsByTagNameNS("http://www.xbrl.org/2003/instance", "context"):
        def text(tag):
            el = node.getElementsByTagNameNS("http://www.xbrl.org/2003/instance", tag)
            return el[0].firstChild.data.strip()[:10] if el and el[0].firstChild else None
        dims = node.getElementsByTagNameNS("http://www.xbrl.org/2003/instance", "segment").length + \
            node.getElementsByTagNameNS("http://www.xbrl.org/2003/instance", "scenario").length
        ctx[node.getAttribute("id")] = (text("startDate"), text("endDate") or text("instant"), dims > 0)
    facts = {}
    for node in root.childNodes:
        if node.nodeType != node.ELEMENT_NODE or not node.hasAttribute("contextRef"):
            continue
        ns = node.namespaceURI or ""
        tax = "us-gaap" if "us-gaap" in ns else "dei" if "/dei" in ns else ns
        c = ctx.get(node.getAttribute("contextRef"))
        if c is None or c[2] or not node.firstChild:
            continue
        try:
            v = Decimal(node.firstChild.data.strip())
        except Exception:  # noqa: BLE001
            continue
        facts.setdefault((tax, node.localName, c[0], c[1]), set()).add(v)
    return facts


def check_c(z, private, parity):
    compared = match = sha_ok = 0
    for acc in parity["accessions"]:
        body = cache_body(private, acc["instanceUrl"])
        if body is None:
            continue
        sha_ok += hashlib.sha256(body).hexdigest() == acc["instanceSha256"]
        facts = parse_dom(body)
        cf = json.loads(z.read("CIK%s.json" % acc["cik"]))["facts"]
        for f in acc["facts"]:
            tax, con = f["concept"].split(":", 1)
            vals = [e["val"] for e in cf.get(tax, {}).get(con, {}).get("units", {}).get(f["unit"], [])
                    if e.get("accn") == acc["accession"] and e.get("start") == f["start"] and e.get("end") == f["end"]]
            compared += 1
            inst = facts.get((tax, con, f["start"], f["end"]), set())
            match += any(Decimal(str(v)) in inst for v in vals)
    c = parity["counts"]
    return {"factsRecomputed": compared, "matches": match, "instanceShaMatches": sha_ok,
            "parity": {"facts": compared == c["factsCompared"], "matches": match == c["MATCH"]}}


def check_d(z, parity_reg, pairs):
    forms = {"10-K", "10-Q", "10-K/A", "10-Q/A"}
    concepts = [c.split(":", 1) for c in parity_reg["concepts"]]
    total = 0
    for rows in parity_reg["selection"].values():
        for row in rows:
            cf = json.loads(z.read("CIK%s.json" % row["cik"]))["facts"]
            for tax, con in concepts:
                for unit, es in cf.get(tax, {}).get(con, {}).get("units", {}).items():
                    groups = {}
                    for e in es:
                        if e.get("form") in forms:
                            groups.setdefault((e.get("start"), e["end"]), []).append(e)
                    for g in groups.values():
                        g.sort(key=lambda e: (e["filed"], e["accn"]))
                        total += sum(Decimal(str(a["val"])) != Decimal(str(b["val"])) for a, b in zip(g, g[1:]))
    return {"restatementPairs": total, "parity": total == len(pairs["pairs"])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--evidence", required=True)
    ap.add_argument("--private", required=True)
    args = ap.parse_args()
    ev = lambda n: json.load(open(os.path.join(args.evidence, n)))  # noqa: E731
    z = zipfile.ZipFile(os.path.join(args.private, "bulk/companyfacts.zip"))
    names = set(z.namelist())
    pop = population()
    out = {"schemaVersion": "v9-secpit-independent-check-1.0.0",
           "codeSha256": hashlib.sha256(open(__file__, "rb").read()).hexdigest(),
           "A_fiscalYear": check_a(z, names, pop, ev("fy-anomaly-dossier.json")),
           "B_availability": check_b(z, names, args.private, ev("availability-before-period-end.json")),
           "C_parity": check_c(z, args.private, ev("parity-results.json")),
           "D_restatements": check_d(z, ev("parity-registration.json"), ev("parity-restatement-pairs.json"))}
    with open(os.path.join(args.evidence, "independent-check.json"), "w") as handle:
        json.dump(out, handle, indent=1)
        handle.write("\n")
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
