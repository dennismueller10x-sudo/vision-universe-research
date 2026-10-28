#!/usr/bin/env python3
"""V9 secpit task 4: value-level parity between ORIGINAL XBRL instances and
companyfacts as-filed values per accession, plus restatement detection.

Two phases (registration is written and hashed before any original is fetched):
  python3 -I parity.py register --evidence <dir>
  python3 -I parity.py run      --evidence <dir>

Population: repo issuers (quant/data/fundamentals/issuers). Four strata x 5
issuers, ranked by sha256(cik + SEED); V7/V8 issuers excluded. Per issuer the
earliest, median and latest original 10-K/10-Q accession present in today's
bulk companyfacts. Raw bodies stay in private scratch; evidence holds derived
facts only (accessions, URLs, hashes, values).
"""
import argparse
import hashlib
import json
import pathlib
import statistics
import sys
import zipfile
from decimal import Decimal

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import PRIVATE, ROOT, client, sha256_file, write_json  # noqa: E402
import xbrl  # noqa: E402

SEED = "v9-secpit-parity-1"
EXCLUDED_CIKS = {"0000019617", "0000034088", "0000789019", "0001045810",  # V7/V8 originals
                 "0000320193", "0000070858", "0001018724"}
CONCEPTS = [("us-gaap", "Revenues"), ("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax"),
            ("us-gaap", "SalesRevenueNet"), ("us-gaap", "NetIncomeLoss"), ("us-gaap", "Assets"),
            ("us-gaap", "StockholdersEquity"), ("us-gaap", "OperatingIncomeLoss"),
            ("dei", "EntityCommonStockSharesOutstanding"), ("us-gaap", "CommonStockSharesOutstanding"),
            ("us-gaap", "WeightedAverageNumberOfDilutedSharesOutstanding")]
FORMS = ("10-K", "10-Q")
PER_STRATUM = 5
MAX_RESTATEMENT_VERIFICATIONS = 10


def h(text):
    return hashlib.sha256((text + SEED).encode()).hexdigest()


def issuers():
    rows = []
    for shard in sorted((ROOT / "quant/data/fundamentals/issuers").glob("*.json")):
        rows.extend(json.loads(shard.read_text())["issuers"])
    return rows


def stratum(row, median_raw):
    sic = int(row["sic"]) if str(row.get("sic") or "").isdigit() else None
    if sic is not None and 6000 <= sic <= 6799:
        return "C_FINANCIAL_SIC_6000_6799"
    if row.get("fiscalYearEnd") and row["fiscalYearEnd"] != "1231":
        return "B_NON_DECEMBER_FYE"
    return "A_DECEMBER_LARGER" if (row.get("rawFacts") or 0) >= median_raw else "D_DECEMBER_SMALLER"


def companyfacts(z, cik):
    return json.loads(z.read("CIK%s.json" % cik))


def entries(facts, accession=None):
    for taxonomy, concept in CONCEPTS:
        body = (facts.get("facts") or {}).get(taxonomy, {}).get(concept)
        if not body:
            continue
        for unit, rows in body.get("units", {}).items():
            for e in rows:
                if accession is None or e.get("accn") == accession:
                    yield taxonomy, concept, unit, e


def register(evidence):
    z = zipfile.ZipFile(PRIVATE / "bulk/companyfacts.zip")
    names = set(z.namelist())
    rows = [r for r in issuers() if r["cik"] not in EXCLUDED_CIKS and "CIK%s.json" % r["cik"] in names]
    median_raw = statistics.median(r.get("rawFacts") or 0 for r in rows)
    strata = {}
    for r in sorted(rows, key=lambda r: h(r["cik"])):
        s = stratum(r, median_raw)
        if len(strata.setdefault(s, [])) >= PER_STRATUM:
            continue
        facts = companyfacts(z, r["cik"])
        accs = {}
        for _, _, _, e in entries(facts):
            if e.get("form") in FORMS and e.get("accn"):
                accs.setdefault(e["accn"], (e["filed"], e["form"]))
        if len(accs) < 3:
            continue
        ordered = sorted(accs.items(), key=lambda kv: (kv[1][0], kv[0]))
        picks = [ordered[0], ordered[len(ordered) // 2], ordered[-1]]
        strata[s].append({"cik": r["cik"], "tickers": r.get("tickers"), "sic": r.get("sic"),
                          "fiscalYearEnd": r.get("fiscalYearEnd"), "rawFacts": r.get("rawFacts"),
                          "accessions": [{"accession": a, "filed": f, "form": fm} for a, (f, fm) in picks]})
        if all(len(strata.get(k, [])) >= PER_STRATUM for k in
               ("A_DECEMBER_LARGER", "B_NON_DECEMBER_FYE", "C_FINANCIAL_SIC_6000_6799", "D_DECEMBER_SMALLER")):
            break
    registration = {
        "schemaVersion": "v9-secpit-parity-registration-1.0.0",
        "seed": SEED,
        "rule": "Per accession: every companyfacts entry (accn == accession) of the registered concepts is "
                "compared with the ORIGINAL XBRL instance of that accession: same taxonomy/concept, a "
                "non-dimensional context with identical start/end (instant: end), exact decimal value equality.",
        "concepts": ["%s:%s" % c for c in CONCEPTS],
        "forms": list(FORMS),
        "strata": "A Dec FYE non-financial rawFacts>=median; B non-Dec FYE non-financial; C SIC 6000-6799; "
                  "D Dec FYE non-financial rawFacts<median",
        "medianRawFacts": median_raw,
        "accessionRule": "earliest, median, latest 10-K/10-Q accession (by filed) carrying a registered concept",
        "restatementRule": "same concept/unit/start/end in companyfacts, later accession (by filed), value differs; "
                           "up to %d pairs touching the sample verified in both original instances" %
                           MAX_RESTATEMENT_VERIFICATIONS,
        "primaryEndpoint": "share of compared facts with exact value parity; mismatches explained individually",
        "excludedCiks": sorted(EXCLUDED_CIKS),
        "priorExposure": "Issuers not used by V7 (8 originals) or V8 (4 issuers' acceptance audit). Values have not "
                         "been looked at before registration.",
        "companyfactsZipSha256": sha256_file(PRIVATE / "bulk/companyfacts.zip"),
        "codeSha256": sha256_file(pathlib.Path(__file__)),
        "selection": strata,
        "productionApproved": False,
    }
    payload = json.dumps(registration, sort_keys=True).encode()
    registration["registrationSha256"] = hashlib.sha256(payload).hexdigest()
    write_json(pathlib.Path(evidence) / "parity-registration.json", registration)
    print(json.dumps({"issuers": sum(len(v) for v in strata.values()),
                      "accessions": sum(len(i["accessions"]) for v in strata.values() for i in v),
                      "sha": registration["registrationSha256"]}))


def dec(value):
    return Decimal(str(value)) if not isinstance(value, Decimal) else value


def compare_accession(c, z, cik, accession, facts):
    inst = xbrl.fetch_instance(c, cik, accession)
    result = {"accession": accession, "instanceState": inst["state"], "instanceUrl": inst.get("url"),
              "instanceSha256": inst.get("sha256"), "instanceBytes": inst.get("bytes"), "facts": []}
    if inst["state"] != "OK":
        return result, None
    contexts, _, ifacts = xbrl.parse_instance(inst["body"])
    index = {}
    for f in ifacts:
        ctx = contexts.get(f["context"])
        if ctx is None or ctx["dimensional"] or f["value"] is None:
            continue
        key = (f["taxonomy"], f["concept"], None if ctx["instant"] else ctx["start"], ctx["end"])
        index.setdefault(key, []).append(f)
    seen = set()
    for taxonomy, concept, unit, e in entries(facts, accession):
        key = (taxonomy, concept, e.get("start"), e.get("end"))
        cands = index.get(key, [])
        seen.add(key)
        values = sorted({str(f["value"]) for f in cands})
        if not cands:
            state = "NOT_IN_INSTANCE_NON_DIMENSIONAL"
        elif any(f["value"] == dec(e["val"]) for f in cands):
            state = "MATCH"
        else:
            state = "VALUE_MISMATCH"
        result["facts"].append({"concept": "%s:%s" % (taxonomy, concept), "unit": unit, "start": e.get("start"),
                                "end": e.get("end"), "companyfactsValue": e["val"], "instanceValues": values,
                                "fy": e.get("fy"), "fp": e.get("fp"), "frame": e.get("frame"), "state": state})
    concept_set = {(t, c_) for t, c_ in CONCEPTS}
    instance_only = sorted({"%s:%s|%s|%s" % (k[0], k[1], k[2], k[3]) for k in index
                            if (k[0], k[1]) in concept_set and k not in seen})
    result["instanceOnlyNonDimensional"] = instance_only
    dei = {k: xbrl.dei_values(contexts, ifacts, k) for k in
           ("DocumentFiscalYearFocus", "DocumentFiscalPeriodFocus", "DocumentPeriodEndDate", "DocumentType")}
    result["dei"] = dei
    return result, index


def run(evidence):
    evidence = pathlib.Path(evidence)
    reg_path = evidence / "parity-registration.json"
    registration = json.loads(reg_path.read_text())
    z = zipfile.ZipFile(PRIVATE / "bulk/companyfacts.zip")
    c = client()
    results = []
    restatements = []
    instance_cache = {}
    for stratum_name, rows in sorted(registration["selection"].items()):
        for row in rows:
            facts = companyfacts(z, row["cik"])
            for a in row["accessions"]:
                res, index = compare_accession(c, z, row["cik"], a["accession"], facts)
                res.update(cik=row["cik"], stratum=stratum_name, form=a["form"], filed=a["filed"])
                results.append(res)
                instance_cache[(row["cik"], a["accession"])] = index
            # restatement groups across all of this issuer's companyfacts entries
            groups = {}
            for taxonomy, concept, unit, e in entries(facts):
                if e.get("form") not in FORMS + ("10-K/A", "10-Q/A"):
                    continue
                groups.setdefault((taxonomy, concept, unit, e.get("start"), e.get("end")), []).append(e)
            sampled = {a["accession"] for a in row["accessions"]}
            for key, es in groups.items():
                es = sorted(es, key=lambda e: (e["filed"], e["accn"]))
                for first, later in zip(es, es[1:]):
                    if dec(first["val"]) != dec(later["val"]):
                        restatements.append({"cik": row["cik"], "concept": "%s:%s" % key[:2], "unit": key[2],
                                             "start": key[3], "end": key[4],
                                             "earlier": {"accession": first["accn"], "filed": first["filed"],
                                                         "form": first["form"], "value": first["val"]},
                                             "later": {"accession": later["accn"], "filed": later["filed"],
                                                       "form": later["form"], "value": later["val"]},
                                             "touchesSample": first["accn"] in sampled or later["accn"] in sampled})
    # verify a deterministic subset of restatement pairs touching the sample in both originals
    touching = sorted([r for r in restatements if r["touchesSample"]],
                      key=lambda r: h(r["cik"] + r["concept"] + str(r["end"]) + r["later"]["accession"]))
    verified = []
    for r in touching[:MAX_RESTATEMENT_VERIFICATIONS]:
        out = {"pair": r}
        for side in ("earlier", "later"):
            key = (r["cik"], r[side]["accession"])
            if key not in instance_cache:
                facts = companyfacts(z, r["cik"])
                _, instance_cache[key] = compare_accession(c, z, r["cik"], r[side]["accession"], facts)
            index = instance_cache[key] or {}
            tax, con = r["concept"].split(":", 1)
            cands = index.get((tax, con, r["start"], r["end"]), [])
            out[side + "InOriginal"] = any(f["value"] == dec(r[side]["value"]) for f in cands)
            out[side + "OriginalValues"] = sorted({str(f["value"]) for f in cands})
        verified.append(out)
    counts = {"accessions": len(results),
              "accessionsWithInstance": sum(r["instanceState"] == "OK" for r in results),
              "factsCompared": sum(len(r["facts"]) for r in results)}
    for state in ("MATCH", "VALUE_MISMATCH", "NOT_IN_INSTANCE_NON_DIMENSIONAL"):
        counts[state] = sum(f["state"] == state for r in results for f in r["facts"])
    counts["instanceOnlyNonDimensional"] = sum(len(r.get("instanceOnlyNonDimensional", [])) for r in results)
    counts["restatementPairsAllIssuers"] = len(restatements)
    counts["restatementPairsTouchingSample"] = len(touching)
    counts["restatementPairsVerified"] = len(verified)
    counts["restatementPairsBothSidesConfirmed"] = sum(v["earlierInOriginal"] and v["laterInOriginal"] for v in verified)
    report = {"schemaVersion": "v9-secpit-parity-1.0.0", "registrationSha256": registration["registrationSha256"],
              "codeSha256": sha256_file(pathlib.Path(__file__)), "counts": counts, "requestStats": c.stats,
              "accessions": results, "restatementVerifications": verified,
              "restatementPairsSummaryByConcept": _by(restatements, "concept"),
              "productionApproved": False,
              "runHistory": [{"run": 1, "counts": json.loads((PRIVATE / "parity-run1-counts.json").read_text())
                              if (PRIVATE / "parity-run1-counts.json").exists() else None,
                              "defect": "instance selector picked defnref.xml for 6 pre-2012 accessions (all 104 "
                                        "NOT_IN_INSTANCE); fixed in xbrl.choose_instance (xsd-stem pairing) and xbrl._taxonomy "
                                        "(2009-2011 namespaces http://xbrl.us/us-gaap|dei/2009-01-31). "
                                        "Registration unchanged."}],
              "scope": "Original instance vs companyfacts for the registered sample only; not the archived vintage."}
    write_json(evidence / "parity-results.json", report)
    # restatement pair list (derived values) for the independent check
    write_json(evidence / "parity-restatement-pairs.json", {"pairs": restatements})
    print(json.dumps(counts))


def _by(rows, key):
    out = {}
    for r in rows:
        out[r[key]] = out.get(r[key], 0) + 1
    return dict(sorted(out.items()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("phase", choices=["register", "run"])
    ap.add_argument("--evidence", required=True)
    args = ap.parse_args()
    register(args.evidence) if args.phase == "register" else run(args.evidence)


if __name__ == "__main__":
    main()
