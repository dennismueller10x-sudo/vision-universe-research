#!/usr/bin/env python3
"""V9 secpit: rerun the repo's own SEC normalization on today's public SEC bulk
vintage for the repo population and extract

  * every normalized timeline whose fiscal_year label is outside a plausible
    range, with the calendar anchor that produced it,
  * every raw companyfacts entry (any form, any taxonomy) whose filing-level
    `fy` is outside the plausible range,
  * every normalized observation whose availability date (UTC date of
    acceptance, else filed) precedes its stored period_end -- the exact V8
    predicate `String(available_from).slice(0,10) < period_end`.

Read-only use of scripts/quant/sec/* (no file in the repo is written). Inputs
are the bulk companyfacts.zip and submissions.zip in private scratch; output is
JSONL in private scratch. Nothing is fetched here.

usage: python3 -I reproduce.py --out <private dir> [--workers 3] [--limit N]
"""
import argparse
import json
import multiprocessing as mp
import pathlib
import sys
import time
import zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import ROOT, PRIVATE, guard_private, population, sha256_file  # noqa: E402

from scripts.quant.sec.fiscal import FiscalCalendar  # noqa: E402
from scripts.quant.sec.normalize import normalize_company, build_availability_map  # noqa: E402
from scripts.quant.sec.provider import SECProvider, PERIODIC_FORMS  # noqa: E402
from scripts.quant.sec.registry import MetricRegistry  # noqa: E402

FY_MIN, FY_MAX = 1990, 2027  # plausibility window for a filing/fiscal year label

_STATE = {}

# The bulk submissions.zip carries acceptanceDateTime shifted +4h/+5h against the
# SGML header and the data.sec.gov API for part of the filers (see
# acceptance-timezone-check.json). A candidate is therefore recorded when the
# availability shifted 5h earlier already precedes the period end; the exact
# V8 predicate on the bulk value is kept as `strictOnBulkAvailability` and
# boundary cases are resolved against the API afterwards.
BULK_SHIFT_HOURS = 5


def _early_date(avail):
    import datetime as _dt
    if not avail:
        return None
    text = str(avail)
    if "T" not in text:
        return text[:10]
    moment = _dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    return (moment - _dt.timedelta(hours=BULK_SHIFT_HOURS)).date().isoformat()


def _init(facts_zip, subs_zip):
    _STATE["facts"] = zipfile.ZipFile(facts_zip)
    _STATE["subs"] = zipfile.ZipFile(subs_zip)
    _STATE["subs_names"] = set(_STATE["subs"].namelist())
    _STATE["facts_names"] = set(_STATE["facts"].namelist())
    _STATE["registry"] = MetricRegistry.load()
    _STATE["provider"] = SECProvider(client=object())  # never used for network here


def _submissions(cik):
    subs, names = _STATE["subs"], _STATE["subs_names"]
    name = "CIK%s.json" % cik
    if name not in names:
        return None
    payload = json.loads(subs.read(name))
    for page in (payload.get("filings", {}) or {}).get("files", []) or []:
        pname = page.get("name")
        if not pname or pname not in names:
            continue
        extra = json.loads(subs.read(pname))
        recent = payload["filings"]["recent"]
        for column, values in extra.items():
            recent.setdefault(column, [])
            recent[column].extend(values)
    return payload


def process(cik):
    try:
        return _process(cik)
    except Exception as exc:  # noqa: BLE001 - recorded, never silently dropped
        return {"cik": cik, "status": "ERROR", "error": "%s: %s" % (type(exc).__name__, str(exc)[:200])}


def _process(cik):
    started = time.time()
    name = "CIK%s.json" % cik
    out = {"cik": cik}
    if name not in _STATE["facts_names"]:
        out["status"] = "NO_BULK_COMPANYFACTS"
        return out
    facts = json.loads(_STATE["facts"].read(name))
    if facts.get("cik") is None:
        out["status"] = "BULK_COMPANYFACTS_WITHOUT_CIK"
        out["topLevelKeys"] = sorted(facts)[:10]
        return out
    subs = _submissions(cik)
    if subs is None:
        out["status"] = "NO_BULK_SUBMISSIONS"
        return out
    provider, registry = _STATE["provider"], _STATE["registry"]
    profile = provider.get_company_profile(cik, subs)
    filing_metadata = provider.get_filing_metadata(cik, subs)
    by_acc = {row["accession"]: row for row in filing_metadata}
    availability = build_availability_map(filing_metadata)

    # Raw-level fy anomalies across ALL forms and taxonomies.
    raw_fy = {}
    raw_total = 0
    for taxonomy, concepts in (facts.get("facts") or {}).items():
        for concept, body in (concepts or {}).items():
            for unit, entries in ((body or {}).get("units") or {}).items():
                for e in entries or []:
                    raw_total += 1
                    fy = e.get("fy")
                    if fy is None or (FY_MIN <= int(fy) <= FY_MAX):
                        continue
                    key = (e.get("accn"), e.get("form"), int(fy), e.get("fp"), e.get("filed"))
                    rec = raw_fy.setdefault(key, {"facts": 0, "examples": []})
                    rec["facts"] += 1
                    if len(rec["examples"]) < 3:
                        rec["examples"].append({"concept": "%s:%s" % (taxonomy, concept), "unit": unit,
                                                "start": e.get("start"), "end": e.get("end"),
                                                "val": e.get("val"), "frame": e.get("frame")})
    out["rawEntries"] = raw_total
    out["rawFyAnomalies"] = [
        {"accession": k[0], "form": k[1], "fy": k[2], "fp": k[3], "filed": k[4],
         "acceptance": (by_acc.get(k[0]) or {}).get("acceptance_datetime"),
         "reportDate": (by_acc.get(k[0]) or {}).get("report_date"), **v}
        for k, v in sorted(raw_fy.items(), key=lambda kv: str(kv[0]))]

    raw_facts = list(provider.iter_raw_facts(facts, availability=availability, forms=PERIODIC_FORMS))
    calendar = FiscalCalendar.from_raw_facts(cik, raw_facts, fiscal_year_end_hint=profile.fiscal_year_end)
    result = normalize_company(cik, raw_facts, registry, profile=profile,
                               filing_metadata=filing_metadata, calendar=calendar)
    cal = calendar.to_dict()
    out["calendar"] = {"label_offset": cal["label_offset"], "anchor_source": cal["anchor_source"],
                       "fiscal_years": cal["fiscal_years"], "rejected_anchors": cal["rejected_anchors"],
                       "fiscal_year_end_hint": cal["fiscal_year_end_hint"]}
    timelines = observations = restated = 0
    fy_lo = fy_hi = None
    bad_fy_timelines = []
    before = []
    date_only = 0
    for (metric, fy, fp), tl in result.factbook.timelines.items():
        timelines += 1
        if tl.is_restated():
            restated += 1
        if isinstance(fy, int):
            fy_lo = fy if fy_lo is None else min(fy_lo, fy)
            fy_hi = fy if fy_hi is None else max(fy_hi, fy)
        obs_list = tl.observations
        if isinstance(fy, int) and not (FY_MIN <= fy <= FY_MAX):
            bad_fy_timelines.append({"metric": metric, "fiscal_year": fy, "fiscal_period": fp,
                                     "observations": [{"period_end": o.period_end, "accession": o.accession,
                                                       "form": o.form, "available_from": o.available_from}
                                                      for o in obs_list]})
        for o in obs_list:
            observations += 1
            avail = o.available_from
            if avail and "T" not in str(avail):
                date_only += 1
            early = _early_date(avail)
            if avail and o.period_end and early is not None and early < o.period_end:
                p = o.provenance
                filing = by_acc.get(o.accession) or {}
                before.append({
                    "metric": metric, "fiscal_year": fy, "fiscal_period": fp,
                    "period_start": o.period_start, "period_end": o.period_end,
                    "available_from": avail, "filed": o.filed, "accession": o.accession, "form": o.form,
                    "taxonomy": p.taxonomy, "concept": p.concept, "unit": o.unit, "value": o.value,
                    "flags": list(o.flags), "reportDate": filing.get("report_date"),
                    "primaryDocument": filing.get("primary_document"),
                    "observationsInTimeline": len(obs_list),
                    "strictOnBulkAvailability": str(avail)[:10] < o.period_end,
                })
    out.update(status="OK", timelines=timelines, observations=observations, restatedTimelines=restated,
               dateOnlyAvailability=date_only, fiscalYearMin=fy_lo, fiscalYearMax=fy_hi,
               badFiscalYearTimelines=bad_fy_timelines, availabilityBeforePeriodEnd=before,
               filingIndexEntries=len(filing_metadata),
               tickers=list(subs.get("tickers") or []), name=subs.get("name"),
               seconds=round(time.time() - started, 2))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--ciks")
    args = ap.parse_args()
    out = guard_private(args.out)
    out.mkdir(parents=True, exist_ok=True)
    facts_zip = PRIVATE / "bulk/companyfacts.zip"
    subs_zip = PRIVATE / "bulk/submissions.zip"
    pop = population()
    ciks = sorted(pop)
    if args.ciks:
        ciks = [c for c in args.ciks.split(",")]
    if args.limit:
        ciks = ciks[: args.limit]
    target = out / "reproduce.jsonl"
    done = set()
    if target.exists():
        for line in target.read_text().splitlines():
            done.add(json.loads(line)["cik"])
    todo = [c for c in ciks if c not in done]
    print("population=%d todo=%d" % (len(ciks), len(todo)), flush=True)
    with open(target, "a") as handle, mp.Pool(args.workers, initializer=_init,
                                               initargs=(str(facts_zip), str(subs_zip))) as pool:
        for i, res in enumerate(pool.imap_unordered(process, todo, chunksize=4)):
            handle.write(json.dumps(res, default=str) + "\n")
            if i % 200 == 0:
                handle.flush()
                print(i, res["cik"], res.get("status"), res.get("seconds"), flush=True)
    meta = {"populationCiks": len(ciks), "companyfactsZipSha256": sha256_file(facts_zip),
            "submissionsZipSha256": sha256_file(subs_zip),
            "codeSha256": sha256_file(pathlib.Path(__file__)), "fyWindow": [FY_MIN, FY_MAX]}
    (out / "reproduce-meta.json").write_text(json.dumps(meta, indent=1))
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
