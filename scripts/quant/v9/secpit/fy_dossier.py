#!/usr/bin/env python3
"""V9 secpit task 2a: dossier of implausible fiscal-year values.

Inputs: private reproduce.jsonl (repo pipeline rerun on today's bulk vintage),
the committed consumer bundles (read-only), and the ORIGINAL XBRL instance of
every anomalous periodic accession (fetched at 2 req/s, cached privately).

usage: python3 -I fy_dossier.py --repro <private dir> --evidence <evidence dir>
"""
import argparse
import datetime
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import ROOT, client, sha256_file, write_json  # noqa: E402
import xbrl  # noqa: E402

FY_MIN, FY_MAX = 1990, 2027
PERIODIC = {"10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A"}
EXCEL_EPOCH = datetime.date(1899, 12, 30)


def excel_serial_date(value):
    if 20000 <= value <= 80000:
        return (EXCEL_EPOCH + datetime.timedelta(days=value)).isoformat()
    return None


def pattern(fy, report_date, doc_period_end):
    serial = excel_serial_date(fy)
    if serial:
        if serial in {report_date, doc_period_end}:
            return "EXCEL_SERIAL_OF_PERIOD_END", serial
        return "EXCEL_SERIAL_OTHER_DATE", serial
    ref = int((report_date or doc_period_end or "0000")[:4]) if (report_date or doc_period_end) else None
    if ref and len(str(fy)) == 4 and any(sorted(str(fy)) == sorted(str(ref + d)) for d in (-1, 0, 1)):
        return "DIGIT_TRANSPOSITION", None
    if ref and abs(fy - ref) <= 15:
        return "WRONG_YEAR_NEAR", None
    return "OTHER", None


def load(repro):
    rows = []
    with open(pathlib.Path(repro) / "reproduce.jsonl") as handle:
        for line in handle:
            rows.append(json.loads(line))
    return rows


def consumer_bad_fy():
    out = []
    for path in sorted((ROOT / "quant/data/sec/consumer").glob("CIK*.json")):
        d = json.loads(path.read_text())
        bad = set()
        for section in ("annual", "quarterly"):
            for metric, rows in (d.get(section) or {}).items():
                for r in rows:
                    if isinstance(r[0], int) and not (FY_MIN <= r[0] <= FY_MAX):
                        bad.add(r[0])
        if bad:
            out.append({"cik": d["cik"], "tickers": d.get("tickers"), "file": str(path.relative_to(ROOT)),
                        "badFiscalYears": sorted(bad), "coverageAnnualYears": (d.get("coverage") or {}).get("annualYears")})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repro", required=True)
    ap.add_argument("--evidence", required=True)
    args = ap.parse_args()
    rows = load(args.repro)
    ok = [r for r in rows if r.get("status") == "OK"]
    c = client()

    raw = []
    for r in ok:
        for a in r.get("rawFyAnomalies") or []:
            raw.append(dict(a, cik=r["cik"], tickers=r.get("tickers")))
    by_acc = {}
    for a in raw:
        by_acc.setdefault((a["cik"], a["accession"]), []).append(a)

    labels = []
    for r in ok:
        cal = r.get("calendar") or {}
        for fy in cal.get("fiscal_years") or []:
            end_year = int(fy["period_end"][:4])
            label = fy["fiscal_year"]
            if not (FY_MIN <= label <= FY_MAX) or label - end_year not in (-1, 0, 1):
                labels.append({"cik": r["cik"], "tickers": r.get("tickers"), "periodEnd": fy["period_end"],
                               "label": label, "labelMinusEndYear": label - end_year,
                               "labelOffset": cal.get("label_offset"), "anchorSource": cal.get("anchor_source"),
                               "rejectedAnchors": cal.get("rejected_anchors")})
    bad_timelines = {}
    for r in ok:
        for t in r.get("badFiscalYearTimelines") or []:
            k = (r["cik"], t["fiscal_year"])
            rec = bad_timelines.setdefault(k, {"cik": r["cik"], "tickers": r.get("tickers"), "fiscalYear": t["fiscal_year"],
                                               "timelines": 0, "observations": 0, "periodEnds": set(), "metrics": set()})
            rec["timelines"] += 1
            rec["observations"] += len(t["observations"])
            rec["metrics"].add(t["metric"])
            for o in t["observations"]:
                if o.get("period_end"):
                    rec["periodEnds"].add(o["period_end"])
    bad_timelines = [dict(v, periodEnds=sorted(v["periodEnds"])[:6], periodEndCount=len(v["periodEnds"]),
                          metrics=len(v["metrics"])) for v in bad_timelines.values()]

    # verify every anomalous PERIODIC accession against its original instance
    dossier = []
    for (cik, acc), items in sorted(by_acc.items()):
        a0 = items[0]
        entry = {"cik": cik, "tickers": a0.get("tickers"), "accession": acc, "form": a0["form"],
                 "companyfactsFy": sorted({i["fy"] for i in items}), "companyfactsFp": sorted({str(i["fp"]) for i in items}),
                 "filed": a0["filed"], "acceptance": a0.get("acceptance"), "reportDate": a0.get("reportDate"),
                 "factsWithThisFy": sum(i["facts"] for i in items)}
        anchor = [l for l in labels if l["cik"] == cik and l["label"] in entry["companyfactsFy"]]
        entry["becamePipelineFiscalYearLabel"] = [{"periodEnd": l["periodEnd"], "label": l["label"]} for l in anchor]
        if a0["form"] in PERIODIC:
            inst = xbrl.fetch_instance(c, cik, acc)
            entry["instanceState"] = inst["state"]
            if inst["state"] == "OK":
                ctx, _, facts = xbrl.parse_instance(inst["body"])
                dei = {k: xbrl.dei_values(ctx, facts, k) for k in
                       ("DocumentFiscalYearFocus", "DocumentFiscalPeriodFocus", "DocumentPeriodEndDate", "DocumentType")}
                entry.update(instanceUrl=inst["url"], instanceSha256=inst["sha256"], dei=dei)
                original = dei["DocumentFiscalYearFocus"]
                if original and all(str(fy) in original for fy in entry["companyfactsFy"]):
                    entry["origin"] = "FILER_ORIGINAL_XBRL"  # SEC companyfacts passes the filer's dei value through
                elif original:
                    entry["origin"] = "DIFFERS_FROM_ORIGINAL_INSTANCE"
                else:
                    entry["origin"] = "NO_DOCUMENT_FISCAL_YEAR_FOCUS_IN_INSTANCE"
                pe = (dei["DocumentPeriodEndDate"] or [None])[0]
            else:
                entry["origin"] = "ORIGINAL_NOT_RETRIEVED"
                pe = None
        else:
            entry["origin"] = "NON_PERIODIC_FORM_NOT_VERIFIED"
            entry["note"] = "form outside PERIODIC_FORMS; never read by the pipeline"
            pe = None
        entry["pattern"], entry["excelSerialDate"] = pattern(entry["companyfactsFy"][0], entry["reportDate"], pe)
        dossier.append(entry)

    report = {
        "schemaVersion": "v9-secpit-fy-dossier-1.0.0",
        "codeSha256": sha256_file(pathlib.Path(__file__)),
        "reproduceMeta": json.loads((pathlib.Path(args.repro) / "reproduce-meta.json").read_text())
        if (pathlib.Path(args.repro) / "reproduce-meta.json").exists() else None,
        "plausibleWindow": [FY_MIN, FY_MAX],
        "population": {"ciks": len(rows), "processed": len(ok),
                       "statusCounts": {s: sum(r.get("status") == s for r in rows) for s in {r.get("status") for r in rows}}},
        "mechanism": {
            "sourceField": "companyfacts entry.fy (= the filing's dei:DocumentFiscalYearFocus as reported); "
                           "provider.iter_raw_facts -> RawFact.filing_fy",
            "codePath": "fiscal.FiscalCalendar.from_raw_facts: anchors[max(ends of a 10-K/20-F/40-F with fp=FY)] = "
                        "int(filing_fy); _label_years accepts any anchor that is greater than the previous label "
                        "(no plausibility bound), so a too-large fy becomes the label of that fiscal year and the "
                        "NEXT correct anchor is rejected as 'repeating or preceding'; normalize assigns timeline "
                        "fiscal_year from calendar labels (not from fy directly).",
            "downstream": "consumer.build_consumer_bundle orders fiscal years by label: annual_scope = years[-N:], "
                          "quarter slots from reversed(years), latestAnnual/latestQuarter = max(fy); "
                          "PeriodResolver.latest_quarters/latest_instant iterate reversed(fiscal_years())."},
        "counts": {
            "rawEntriesWithImplausibleFy": sum(a["facts"] for a in raw),
            "accessionsWithImplausibleFy": len(by_acc),
            "issuersWithImplausibleFy": len({k[0] for k in by_acc}),
            "periodicAccessions": sum(1 for d in dossier if d["form"] in PERIODIC),
            "originsVerified": {o: sum(d["origin"] == o for d in dossier) for o in sorted({d["origin"] for d in dossier})},
            "patterns": {p: sum(d["pattern"] == p for d in dossier) for p in sorted({d["pattern"] for d in dossier})},
            "pipelineLabelAnomalies": len(labels),
            "issuersWithPipelineLabelAnomaly": len({l["cik"] for l in labels}),
            "timelinesWithImplausibleLabel": sum(b["timelines"] for b in bad_timelines),
            "observationsWithImplausibleLabel": sum(b["observations"] for b in bad_timelines),
            "fiscalYearMin": min((r["fiscalYearMin"] for r in ok if r.get("fiscalYearMin") is not None), default=None),
            "fiscalYearMax": max((r["fiscalYearMax"] for r in ok if r.get("fiscalYearMax") is not None), default=None),
        },
        "accessions": dossier,
        "pipelineLabelAnomalies": labels,
        "timelinesWithImplausibleLabel": bad_timelines,
        "committedConsumerBundlesWithImplausibleFy": consumer_bad_fy(),
        "requestStats": c.stats,
        "productionApproved": False,
    }
    write_json(pathlib.Path(args.evidence) / "fy-anomaly-dossier.json", report)
    print(json.dumps(report["counts"], indent=1))


if __name__ == "__main__":
    main()
