#!/usr/bin/env python3
"""V9 portfolio: consolidate harvested SEC dividend attestations into one
evidence table with provenance, completeness and cross-checks.

Rules (V9_AGENT_RULES): no inferred fields; ex-dates are never pay dates; SEC
acceptance is an availability upper bound only. Amounts stated in documents
filed after a later stock split are classified as restated and checked against
the contemporaneous amount with the sourced split ratio, never silently mixed.
"""
import argparse
import datetime
import hashlib
import json
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import secfetch as S  # noqa: E402

PERIOD = ("2015-01-01", "2026-10-23")  # record dates; weekly price data end 2026-10-23
EXPECTED_QUARTERS = ("2015Q1", "2026Q3")
FIRST_QUARTER = {"META": "2024Q1"}  # META's first dividend declared Feb 2024 (stated in its 10-K)
SPLITS_PATH = Path(__file__).resolve().parents[4] / "docs/quant-recovery/v9/portfolio/split-evidence.json"


def quarter(d):
    return f"{d[:4]}Q{(int(d[5:7]) - 1) // 3 + 1}"


def quarters(a, b):
    out, y, q = [], int(a[:4]), int(a[5])
    while f"{y}Q{q}" <= b:
        out.append(f"{y}Q{q}")
        q += 1
        if q == 5:
            y, q = y + 1, 1
    return out


def load_splits():
    if not SPLITS_PATH.exists():
        return {}
    d = json.loads(SPLITS_PATH.read_text())
    out = {}
    for s in d["splits"]:
        if s.get("status") == "SOURCED":
            out.setdefault(s["ticker"], []).append(s)
    return out


def companyfacts_quarters(cik):
    try:
        cf = S.get_json(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{str(cik).zfill(10)}.json")
    except Exception as e:  # recorded
        return {"error": str(e)[:200]}
    facts = cf.get("facts", {}).get("us-gaap", {}).get("CommonStockDividendsPerShareDeclared", {}).get("units", {})
    rows = {}
    for unit, vals in facts.items():
        for v in vals:
            if not v.get("start") or not v.get("end"):
                continue
            days = (datetime.date.fromisoformat(v["end"]) - datetime.date.fromisoformat(v["start"])).days
            if 80 <= days <= 100:
                rows.setdefault((v["start"], v["end"]), set()).add((str(v["val"]), v["accn"]))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--extractions", default=str(S.PRIVATE / "dividend-extractions"))
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    splits = load_splits()
    companies = []
    for f in sorted(Path(a.extractions).glob("*.json")):
        d = json.loads(f.read_text())
        tk, cik = d["ticker"], d["cik"]
        tsplits = sorted(splits.get(tk, []), key=lambda s: s["effectiveDate"])
        groups, intents, docs_seen, errors = {}, {}, 0, []
        for r in d["documents"]:
            if r.get("error"):
                errors.append({"accession": r["accession"], "file": r["file"], "error": r["error"]})
                continue
            docs_seen += 1
            ix_vals = {x["value"] for x in r.get("ixFacts", [])}
            for e in r["events"]:
                if not (PERIOD[0] <= e["recordDate"] <= PERIOD[1]):
                    continue
                att = {"accession": r["accession"], "file": r["file"], "url": r["url"], "form": r["form"],
                       "fileType": r["fileType"], "fileDate": r["fileDate"], "sha256": r["sha256"],
                       "acceptanceUtc": r.get("acceptanceDateTimeSubmissions"), "pattern": e["pattern"],
                       "amount": e["amount"], "payDate": e["payDate"], "declarationDate": e["declarationDate"],
                       "kind": e["kind"], "quote": e["quote"],
                       "ixTaggedValuesPresent": bool(ix_vals)}
                (intents if e["intentOnly"] else groups).setdefault(e["recordDate"], []).append(att)
        events = []
        for rec, atts in sorted(groups.items()):
            pays = sorted({x["payDate"] for x in atts})
            # A later split restates per-share amounts: classify each attestation.
            later = [s for s in tsplits if s["effectiveDate"] > rec]
            cls = []
            for x in atts:
                after = [s for s in later if s["effectiveDate"] <= x["fileDate"]]
                factor = Decimal(1)
                for s in after:
                    factor *= Decimal(str(s["ratio"]))
                cls.append((x, factor))
            contemp = sorted({x["amount"] for x, fct in cls if fct == 1 and x["amount"]})
            restated = []
            for x, fct in cls:
                if fct != 1 and x["amount"]:
                    restated.append({"amount": x["amount"], "factor": str(fct), "accession": x["accession"],
                                     "impliedContemporaneous": str(Decimal(x["amount"]) * fct)})
            amount_state = "CONSISTENT" if len(contemp) == 1 else ("MISSING_CONTEMPORANEOUS" if not contemp else "CONFLICT")
            restate_ok = None
            if restated and len(contemp) == 1:
                c = Decimal(contemp[0])
                # Reported restated values are rounded to the document's decimals; allow that rounding only.
                restate_ok = all(abs(Decimal(r_["impliedContemporaneous"]) - c) <= Decimal(r_["factor"]) * Decimal("0.0005") for r_ in restated)
            decls = sorted({x["declarationDate"] for x in atts if x["declarationDate"]})
            kinds = sorted({x["kind"] for x in atts})
            timed = sorted([x for x in atts if x["acceptanceUtc"]], key=lambda x: x["acceptanceUtc"])
            first = timed[0] if timed else None
            pay_state = "CONSISTENT" if len(pays) == 1 else "CONFLICT"
            events.append({
                "ticker": tk, "recordDate": rec, "payDate": pays[0] if pay_state == "CONSISTENT" else None,
                "payDatesStated": pays, "payDateState": pay_state,
                "amount": contemp[0] if amount_state == "CONSISTENT" else None, "amountState": amount_state,
                "contemporaneousAmountsStated": contemp, "restatedAttestations": restated, "restatementConsistent": restate_ok,
                "declarationDatesStated": decls, "declarationDate": decls[0] if len(decls) == 1 else None,
                "declarationDateState": "STATED" if len(decls) == 1 else ("NOT_STATED" if not decls else "CONFLICT"),
                "kind": "SPECIAL" if "SPECIAL" in kinds else "REGULAR",
                "exDate": None, "exDateState": "NOT_STATED_IN_SEC_SOURCES_USED",
                "firstSecAvailability": {"accession": first["accession"], "file": first["file"], "url": first["url"],
                                         "form": first["form"], "acceptanceUtcSubmissions": first["acceptanceUtc"],
                                         "sha256": first["sha256"], "quote": first["quote"]} if first else None,
                "attestationCount": len(atts), "distinctFilings": len({x["accession"] for x in atts}),
                "intentOnlyCorroborations": len(intents.get(rec, [])),
                "attestations": [{k: x[k] for k in ("accession", "file", "fileDate", "form", "pattern", "amount", "payDate", "declarationDate", "sha256")} for x in atts],
            })
        # Verify acceptance of each first-availability accession against the SGML header (Eastern -> UTC).
        for ev in events:
            fa = ev["firstSecAvailability"]
            if not fa:
                continue
            h = S.header(cik, fa["accession"])
            fa["sgmlHeader"] = {"url": h["url"], "sha256": h["sha256"], "rawEastern": h.get("rawEastern"),
                                "acceptanceUtc": h.get("acceptanceUtc")}
            fa["acceptanceUtc"] = h.get("acceptanceUtc")
            fa["submissionsMatchesHeader"] = h.get("acceptanceUtc") == fa["acceptanceUtcSubmissions"]
        # Completeness against quarterly cadence (record-date quarter).
        q0 = FIRST_QUARTER.get(tk, EXPECTED_QUARTERS[0])
        expected = quarters(q0, EXPECTED_QUARTERS[1])
        byq = {}
        for ev in events:
            byq.setdefault(quarter(ev["recordDate"]), []).append(ev["recordDate"])
        complete_fields = [ev for ev in events if ev["payDate"] and ev["amount"] and quarter(ev["recordDate"]) in expected]
        gaps = []
        for q in expected:
            if q not in byq:
                gaps.append({"quarter": q, "gap": "NO_SEC_ATTESTATION_FOUND"})
            elif len(byq[q]) > 1:
                gaps.append({"quarter": q, "gap": "MULTIPLE_RECORD_DATES", "recordDates": byq[q]})
        for ev in events:
            if not ev["payDate"]:
                gaps.append({"recordDate": ev["recordDate"], "gap": "PAY_DATE_" + ev["payDateState"], "stated": ev["payDatesStated"]})
            if not ev["amount"]:
                gaps.append({"recordDate": ev["recordDate"], "gap": "AMOUNT_" + ev["amountState"], "stated": ev["contemporaneousAmountsStated"]})
            if ev["restatementConsistent"] is False:
                gaps.append({"recordDate": ev["recordDate"], "gap": "RESTATED_AMOUNT_INCONSISTENT_WITH_SPLIT"})
        cf = companyfacts_quarters(cik)
        xcheck = []
        if isinstance(cf, dict) and "error" not in cf:
            for (st, en), vals in sorted(cf.items()):
                if en < PERIOD[0] or st > PERIOD[1]:
                    continue
                inq = [ev for ev in events if ev["declarationDate"] and st <= ev["declarationDate"] <= en and ev["amount"]]
                vs = sorted({v for v, _ in vals})
                if not inq:
                    xcheck.append({"period": [st, en], "xbrl": vs, "state": "NO_EVENT_WITH_STATED_DECLARATION_IN_PERIOD"})
                    continue
                tot = sum(Decimal(ev["amount"]) for ev in inq)
                state = "MATCH" if any(Decimal(v) == tot for v in vs) else ("MATCH_RESTATED" if any(Decimal(v) != 0 and abs(tot / Decimal(v) - round(tot / Decimal(v))) < Decimal("0.001") and round(tot / Decimal(v)) in (4, 10, 40, 3) for v in vs) else "MISMATCH")
                xcheck.append({"period": [st, en], "xbrl": vs, "eventsDeclaredInPeriod": [ev["recordDate"] for ev in inq], "sum": str(tot), "state": state})
        companies.append({
            "ticker": tk, "cik": cik, "documentsScanned": docs_seen, "documentErrors": errors,
            "expectedQuarters": len(expected), "expectedBasis": "one regular dividend per record-date calendar quarter " + q0 + ".." + EXPECTED_QUARTERS[1],
            "eventsFound": len(events), "eventsInExpectedQuartersWithPayDateAndAmount": len(complete_fields),
            "gaps": gaps, "companyFactsCrossCheck": {
                "concept": "us-gaap:CommonStockDividendsPerShareDeclared (3-month durations)",
                "match": sum(x["state"] == "MATCH" for x in xcheck), "matchRestated": sum(x["state"] == "MATCH_RESTATED" for x in xcheck),
                "mismatch": sum(x["state"] == "MISMATCH" for x in xcheck),
                "unmatchable": sum(x["state"].startswith("NO_EVENT") for x in xcheck), "rows": xcheck},
            "events": events,
        })
    report = {
        "schemaVersion": "v9-portfolio-dividend-evidence-1.0.0",
        "period": {"recordDateFrom": PERIOD[0], "recordDateTo": PERIOD[1], "expectedQuarters": EXPECTED_QUARTERS},
        "sources": "SEC EDGAR originals: 10-Q/10-K primary documents and 8-K/10-K exhibits located by EDGAR full-text search; companyfacts for cross-check",
        "rules": ["exDate is never used as payDate", "fields not stated in a source stay null", "SEC acceptance is an availability upper bound, not the company's publication time",
                  "restated (post-split) amounts are classified and checked, never mixed with contemporaneous amounts"],
        "splitEvidenceFile": str(SPLITS_PATH.relative_to(Path(__file__).resolve().parents[4])) if SPLITS_PATH.exists() else None,
        "codeSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "harvesterSha256": hashlib.sha256((Path(__file__).parent / "harvest_dividends.py").read_bytes()).hexdigest(),
        "companies": companies, "certification": "NOT_CERTIFIED", "productionApproved": False,
    }
    Path(a.out).write_text(json.dumps(report, indent=1) + "\n")
    for c in companies:
        print(c["ticker"], "docs", c["documentsScanned"], "events", c["eventsFound"], "expected", c["expectedQuarters"],
              "complete", c["eventsInExpectedQuartersWithPayDateAndAmount"], "gaps", len(c["gaps"]),
              "cf", {k: c["companyFactsCrossCheck"][k] for k in ("match", "matchRestated", "mismatch", "unmatchable")})


if __name__ == "__main__":
    main()
