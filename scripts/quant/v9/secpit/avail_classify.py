#!/usr/bin/env python3
"""V9 secpit task 2b: observations whose availability precedes their period end.

1. Resolve the true acceptance for boundary candidates (bulk submissions.zip
   carries +4h/+5h shifted acceptanceDateTime for part of the filers) from the
   data.sec.gov submissions API (2 req/s, cached privately).
2. Classify every observation that satisfies the V8 predicate
   `available_from[:10] < period_end` on the true acceptance.
3. Verify a registered, stratified sample (>= 50) against the ORIGINAL XBRL
   instance contexts.

usage:
  python3 -I avail_classify.py classify --repro <dir> --evidence <dir>
  python3 -I avail_classify.py register-sample --evidence <dir>
  python3 -I avail_classify.py verify-sample --evidence <dir>
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import sys
from decimal import Decimal

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import PRIVATE, client, sha256_file, write_json  # noqa: E402
import xbrl  # noqa: E402

SEED = "v9-secpit-avail-sample-1"
SAMPLE_TOTAL = 60
SAMPLE_MIN_PER_CLASS = 4


def d(text):
    return datetime.date.fromisoformat(str(text)[:10])


def shift_years(day, years):
    try:
        return day.replace(year=day.year + years)
    except ValueError:
        return day.replace(year=day.year + years, day=28)


DIVIDEND_CONCEPTS = {"CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid",
                     "PaymentsOfDividends", "PaymentsOfDividendsCommonStock", "DividendsCommonStock",
                     "DividendsCommonStockCash"}


def classify(o, future_ends):
    """Return (class, assessment) for one observation with availability < period_end.

    `future_ends` = distinct period ends after availability for the same
    accession and concept. Classes are structural; whether a context is a filer
    error is decided only by the original-instance verification.
    """
    end = d(o["period_end"])
    avail = d(o["trueAvailable"])
    report = d(o["reportDate"]) if o.get("reportDate") else None
    start = d(o["period_start"]) if o.get("period_start") else None
    cover = "COVER_DATE_INSTANT" in (o.get("flags") or [])
    if report is not None and report > avail:
        return "FILING_ACCEPTED_BEFORE_ITS_REPORT_PERIOD_END", "FILING_METADATA_REVIEW"
    if cover:
        for k in range(1, 11):
            shifted = shift_years(end, -k)
            if report is not None and report <= shifted <= avail + datetime.timedelta(days=1):
                return "COVER_DATE_YEAR_SHIFT", "FILER_CONTEXT_DATE_ERROR_CANDIDATE"
        gap = (end - avail).days
        return ("COVER_DATE_AFTER_ACCEPTANCE_LE_31D" if gap <= 31 else "COVER_DATE_AFTER_ACCEPTANCE_GT_31D",
                "FILER_CONTEXT_DATE_ERROR_CANDIDATE")
    if o["concept"] in DIVIDEND_CONCEPTS and start is not None:
        return "DIVIDEND_DECLARED_FOR_LATER_PERIOD", "LEGITIMATE_DECLARATION_NOT_A_REPORTED_PERIOD"
    if len(future_ends) >= 2:
        return "FORWARD_SCHEDULE_MULTIPLE_FUTURE_PERIODS", "LEGITIMATE_FORWARD_DISCLOSURE_NOT_A_REPORTED_PERIOD"
    year_shift = report is not None and any(abs((shift_years(end, -k) - report).days) <= 7 for k in range(1, 11))
    # the date lies within twelve months after the report period (one year back it would
    # sit in the prior-year comparative window); verification decides typo vs forward fact
    comparative = report is not None and \
        shift_years(report, -1) - datetime.timedelta(days=7) <= shift_years(end, -1) < report
    kind = "INSTANT" if start is None else "DURATION"
    if start is not None and report is not None and start <= report:
        return "DURATION_STRADDLING_REPORT_PERIOD_END", "REQUIRES_ORIGINAL_CONTEXT"
    if year_shift:
        return "SINGLE_FUTURE_%s_YEAR_SHIFT_OF_REPORT_PERIOD" % kind, "REQUIRES_ORIGINAL_CONTEXT"
    if comparative:
        return "SINGLE_FUTURE_%s_WITHIN_12M_AFTER_REPORT_PERIOD" % kind, "REQUIRES_ORIGINAL_CONTEXT"
    return "SINGLE_FUTURE_%s_OTHER" % kind, "REQUIRES_ORIGINAL_CONTEXT"


def load_candidates(repro):
    rows = []
    with open(pathlib.Path(repro) / "reproduce.jsonl") as handle:
        for line in handle:
            r = json.loads(line)
            if r.get("status") != "OK":
                continue
            for o in r["availabilityBeforePeriodEnd"]:
                rows.append(dict(o, cik=r["cik"], tickers=r.get("tickers")))
    return rows


def api_acceptance(c, cik):
    data = json.loads(c.get_bytes("https://data.sec.gov/submissions/CIK%s.json" % cik))
    out = {}
    recent = data["filings"]["recent"]
    for a, t in zip(recent["accessionNumber"], recent["acceptanceDateTime"]):
        out[a] = t
    for page in data["filings"].get("files") or []:
        extra = json.loads(c.get_bytes("https://data.sec.gov/submissions/" + page["name"]))
        for a, t in zip(extra["accessionNumber"], extra["acceptanceDateTime"]):
            out[a] = t
    return out


def cmd_classify(args):
    c = client()
    rows = load_candidates(args.repro)
    boundary_ciks = sorted({r["cik"] for r in rows if not r["strictOnBulkAvailability"]})
    api = {}
    for cik in boundary_ciks:
        api[cik] = api_acceptance(c, cik)
    final = []
    unresolved = 0
    for r in rows:
        if r["strictOnBulkAvailability"]:
            # bulk acceptance is equal to or later than the true one, so the predicate also holds on the truth
            true_avail = (api.get(r["cik"]) or {}).get(r["accession"]) or r["available_from"]
            r["trueAvailable"] = true_avail
            r["availabilitySource"] = "API" if r["cik"] in api else "BULK_STRICT"
            final.append(r)
            continue
        true_avail = (api.get(r["cik"]) or {}).get(r["accession"])
        if true_avail is None:
            unresolved += 1
            continue
        if str(true_avail)[:10] < r["period_end"]:
            r["trueAvailable"] = true_avail
            r["availabilitySource"] = "API_BOUNDARY"
            final.append(r)
    future = {}
    for r in final:
        future.setdefault((r["accession"], r["taxonomy"], r["concept"]), set()).add(r["period_end"])
    classes = {}
    for r in final:
        r["class"], r["legitimacy"] = classify(r, future[(r["accession"], r["taxonomy"], r["concept"])])
        classes.setdefault(r["class"], 0)
        classes[r["class"]] += 1
    def tally(key):
        out = {}
        for r in final:
            k = r[key] if not callable(key) else key(r)
            out[k] = out.get(k, 0) + 1
        return dict(sorted(out.items(), key=lambda kv: -kv[1]))
    concept_by_class = {}
    for r in final:
        concept_by_class.setdefault(r["class"], {}).setdefault("%s:%s" % (r["taxonomy"], r["concept"]), 0)
        concept_by_class[r["class"]]["%s:%s" % (r["taxonomy"], r["concept"])] += 1
    report = {
        "schemaVersion": "v9-secpit-availability-before-period-end-1.0.0",
        "codeSha256": sha256_file(pathlib.Path(__file__)),
        "predicate": "String(available_from).slice(0,10) < period_end (V8 audit-v8-archives.mjs line 34), on the "
                     "true acceptance (data.sec.gov API = SGML header) for boundary rows",
        "candidatesRecorded": len(rows),
        "strictOnBulk": sum(r["strictOnBulkAvailability"] for r in rows),
        "boundaryCiksResolvedViaApi": len(boundary_ciks),
        "boundaryUnresolved": unresolved,
        "final": len(final),
        "v8ArchiveCount": 911,
        "issuers": len({r["cik"] for r in final}),
        "accessions": len({r["accession"] for r in final}),
        "byClass": tally("class"),
        "byLegitimacy": tally("legitimacy"),
        "byMetric": tally("metric"),
        "byForm": tally("form"),
        "byFiscalPeriod": tally("fiscal_period"),
        "byGapDaysBucket": tally(lambda r: _bucket((d(r["period_end"]) - d(r["trueAvailable"])).days)),
        "conceptsByClass": concept_by_class,
        "requestStats": c.stats,
        "rows": [{k: r.get(k) for k in ("cik", "tickers", "accession", "form", "metric", "taxonomy", "concept",
                                         "fiscal_year", "fiscal_period", "period_start", "period_end", "value",
                                         "unit", "available_from", "trueAvailable", "availabilitySource", "filed",
                                         "reportDate", "flags", "class", "legitimacy", "observationsInTimeline")}
                 for r in sorted(final, key=lambda r: (r["cik"], r["accession"], r["metric"], r["period_end"]))],
        "productionApproved": False,
    }
    write_json(pathlib.Path(args.evidence) / "availability-before-period-end.json", report)
    print(json.dumps({k: report[k] for k in ("candidatesRecorded", "strictOnBulk", "boundaryCiksResolvedViaApi",
                                             "boundaryUnresolved", "final", "byClass", "byLegitimacy")}, indent=1))


def _bucket(days):
    for limit in (1, 7, 31, 92, 366, 3660):
        if days <= limit:
            return "<=%d" % limit
    return ">3660"


def h(text):
    return hashlib.sha256((text + SEED).encode()).hexdigest()


def cmd_register(args):
    ev = pathlib.Path(args.evidence)
    data = json.loads((ev / "availability-before-period-end.json").read_text())
    rows = data["rows"]
    by_class = {}
    for r in rows:
        by_class.setdefault(r["class"], []).append(r)
    total = len(rows)
    alloc = {}
    for cls, items in by_class.items():
        alloc[cls] = min(len(items), max(SAMPLE_MIN_PER_CLASS, round(SAMPLE_TOTAL * len(items) / total)))
    sample = []
    for cls, items in sorted(by_class.items()):
        # one row per accession first (spread across filers), then fill
        ranked = sorted(items, key=lambda r: h(r["accession"] + r["metric"] + r["period_end"]))
        chosen, accs = [], set()
        for r in ranked:
            if len(chosen) >= alloc[cls]:
                break
            if r["accession"] in accs:
                continue
            chosen.append(r); accs.add(r["accession"])
        for r in ranked:
            if len(chosen) >= alloc[cls]:
                break
            if r not in chosen:
                chosen.append(r)
        sample.extend(chosen)
    registration = {"schemaVersion": "v9-secpit-avail-sample-registration-1.0.0", "seed": SEED,
                    "rule": "stratified by class; allocation max(%d, round(%d*share)), capped by class size; within "
                            "class ranked by sha256(accession+metric+period_end+seed), distinct accessions first"
                            % (SAMPLE_MIN_PER_CLASS, SAMPLE_TOTAL),
                    "verification": "original instance: a non-dimensional context of the same taxonomy:concept "
                                    "with identical start/end (instant: end) and identical value",
                    "classificationSha256": sha256_file(ev / "availability-before-period-end.json"),
                    "codeSha256": sha256_file(pathlib.Path(__file__)),
                    "allocation": alloc, "sample": sample}
    registration["registrationSha256"] = hashlib.sha256(json.dumps(registration, sort_keys=True).encode()).hexdigest()
    write_json(ev / "availability-sample-registration.json", registration)
    print(json.dumps({"sample": len(sample), "allocation": alloc}))


def cmd_verify(args):
    ev = pathlib.Path(args.evidence)
    reg = json.loads((ev / "availability-sample-registration.json").read_text())
    c = client()
    out = []
    cache = {}
    for s in reg["sample"]:
        key = (s["cik"], s["accession"])
        if key not in cache:
            inst = xbrl.fetch_instance(c, s["cik"], s["accession"])
            if inst["state"] == "OK":
                ctx, _, facts = xbrl.parse_instance(inst["body"])
                dei = {k: xbrl.dei_values(ctx, facts, k) for k in
                       ("DocumentPeriodEndDate", "DocumentFiscalYearFocus", "DocumentFiscalPeriodFocus", "DocumentType")}
                cache[key] = (inst, ctx, facts, dei)
            else:
                cache[key] = (inst, None, None, None)
        inst, ctx, facts, dei = cache[key]
        row = {"cik": s["cik"], "accession": s["accession"], "class": s["class"], "metric": s["metric"],
               "concept": "%s:%s" % (s["taxonomy"], s["concept"]), "period_start": s["period_start"],
               "period_end": s["period_end"], "value": s["value"], "trueAvailable": s["trueAvailable"],
               "reportDate": s["reportDate"], "instanceState": inst["state"], "instanceUrl": inst.get("url"),
               "instanceSha256": inst.get("sha256")}
        if ctx is not None:
            same_concept = [f for f in facts if f["taxonomy"] == s["taxonomy"] and f["concept"] == s["concept"]]
            hits = []
            for f in same_concept:
                cx = ctx.get(f["context"])
                if cx is None or cx["dimensional"]:
                    continue
                if cx["end"] == s["period_end"] and ((s["period_start"] is None and cx["instant"]) or
                                                     cx["start"] == s["period_start"]):
                    hits.append({"context": f["context"][:120], "raw": f["raw"][:60],
                                 "valueEqual": f["value"] is not None and f["value"] == Decimal(str(s["value"]))})
            row["contextsWithSameDates"] = hits[:5]
            row["verdict"] = ("CONFIRMED_IN_FILER_ORIGINAL_INSTANCE" if any(x["valueEqual"] for x in hits) else
                              "DATE_PRESENT_VALUE_DIFFERS" if hits else "NOT_FOUND_IN_ORIGINAL_INSTANCE")
            if row["verdict"] == "NOT_FOUND_IN_ORIGINAL_INSTANCE" and s["taxonomy"] == "dei":
                # normalize.period_end_for_cover_date / assign_cover_date re-date a cover-date instant;
                # look for the filer's raw cover date carrying the same value
                raw = sorted({ctx[f["context"]]["end"] for f in same_concept
                              if f["context"] in ctx and not ctx[f["context"]]["dimensional"]
                              and f["value"] == Decimal(str(s["value"]))})
                row["rawCoverDates"] = raw
                if raw and all(x > s["trueAvailable"][:10] for x in raw):
                    row["verdict"] = "FILER_COVER_DATE_AFTER_ACCEPTANCE_REDATED_BY_PIPELINE"
                elif raw:
                    row["verdict"] = "PIPELINE_REDATED_COVER_DATE_INTO_FUTURE"
            row["dei"] = dei
            # counterpart of the same concept k years earlier (k = 1..3): absent -> the future date
            # stands in for a missing comparative/current context (date error); present with a
            # different value -> a separate forward-dated fact
            target = Decimal(str(s["value"]))
            counterpart = {}
            for k in (1, 2, 3):
                e_k = shift_years(d(s["period_end"]), -k).isoformat()
                s_k = shift_years(d(s["period_start"]), -k).isoformat() if s["period_start"] else None
                vals = [f["value"] for f in same_concept
                        if f["context"] in ctx and not ctx[f["context"]]["dimensional"]
                        and abs((d(ctx[f["context"]]["end"]) - d(e_k)).days) <= 7
                        and ((s_k is None and ctx[f["context"]]["instant"]) or
                             (s_k is not None and ctx[f["context"]]["start"] and
                              abs((d(ctx[f["context"]]["start"]) - d(s_k)).days) <= 7))]
                counterpart["minus%dy" % k] = ("ABSENT" if not vals else "SAME_VALUE" if target in vals
                                               else "DIFFERENT_VALUE")
            row["counterpart"] = counterpart
            # same-concept contexts in the instance on the report period (to see the "intended" date)
            row["sameConceptPeriodEnds"] = sorted({ctx[f["context"]]["end"] for f in same_concept
                                                   if f["context"] in ctx and not ctx[f["context"]]["dimensional"]})[:12]
        else:
            row["verdict"] = "ORIGINAL_NOT_RETRIEVED"
        out.append(row)
    counts = {}
    for r in out:
        counts.setdefault(r["class"], {}).setdefault(r["verdict"], 0)
        counts[r["class"]][r["verdict"]] += 1
    counterpart = {}
    for r in out:
        if "counterpart" in r:
            key = r["counterpart"]["minus1y"]
            counterpart.setdefault(r["class"], {}).setdefault(key, 0)
            counterpart[r["class"]][key] += 1
    report = {"schemaVersion": "v9-secpit-avail-sample-verification-1.0.0",
              "registrationSha256": reg["registrationSha256"], "codeSha256": sha256_file(pathlib.Path(__file__)),
              "sample": len(out), "accessions": len(cache),
              "verdicts": {v: sum(r["verdict"] == v for r in out) for v in sorted({r["verdict"] for r in out})},
              "verdictsByClass": counts, "counterpartMinus1yByClass": counterpart, "requestStats": c.stats, "rows": out, "productionApproved": False}
    write_json(ev / "availability-sample-verification.json", report)
    print(json.dumps({k: report[k] for k in ("sample", "accessions", "verdicts", "verdictsByClass",
                                             "counterpartMinus1yByClass")}, indent=1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["classify", "register-sample", "verify-sample"])
    ap.add_argument("--repro")
    ap.add_argument("--evidence", required=True)
    args = ap.parse_args()
    {"classify": cmd_classify, "register-sample": cmd_register, "verify-sample": cmd_verify}[args.cmd](args)


if __name__ == "__main__":
    main()
