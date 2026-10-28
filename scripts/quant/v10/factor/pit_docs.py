#!/usr/bin/env python3
"""V10 FACTOR (RECONSTRUCTION): point-in-time consumer documents per issuer and rank date.

For every issuer of the frame and every monthly rank date t, this writes the
`vu-consumer-fundamentals-1.0.0` document the existing SEC pipeline resolves
with policy as_of_latest at as_of = t - 1 day (a fact filed on day d is usable
from the first weekly close strictly after d). It reuses the pipeline end to end
(SECProvider.iter_raw_facts, FiscalCalendar, normalize_company incl. P1-P4,
PeriodResolver, consumer._facts_for_period / _ttm / _row, merge_company_facts);
only the window of fiscal years is chosen relative to as_of instead of today.

A document is recomputed only when a new filing date became visible or the
newest TTM window crossed the pipeline's 400-day staleness bound; identical
consecutive documents are stored once (field `from`).

Usage: python3 -I pit_docs.py <companyfacts.zip> <jobs.json> <out_dir> [--workers N]
jobs.json: {"rankDates": [...], "ciks": {"0000320193": "2010-01-29", ...}} (first rank date per CIK)
Writes <out_dir>/<cik>.json.gz and <out_dir>/_summary.json. Private output only.
"""
import gzip
import json
import multiprocessing
import pathlib
import sys
import time
import zipfile
from datetime import date, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "scripts"))

from quant.sec import consumer  # noqa: E402
from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import normalize_company  # noqa: E402
from quant.sec.periods import PeriodResolver  # noqa: E402
from quant.sec.provider import PERIODIC_FORMS, SECProvider, normalize_cik  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402
from quant.sec.restatements import POLICY_AS_OF_LATEST  # noqa: E402
from quant.sec.version import version_stamp  # noqa: E402

ANNUAL_BACK = 8      # fiscal years before as_of's year kept in the window (compute() reads <= 6)
QUARTER_SLOTS = 16   # same slot count as the consumer bundle (quarters * 2)
QUARTERS = 8

_STATE = {}


def _init(zip_path):
    _STATE["zip"] = zipfile.ZipFile(zip_path)
    _STATE["registry"] = MetricRegistry.load()
    _STATE["hints"] = consumer.load_fiscal_year_end_hints(ROOT / "quant/data/fundamentals/issuers")
    _STATE["industries"] = consumer.load_issuer_industries(ROOT / "quant/data/fundamentals/issuers")
    _STATE["successors"] = consumer.load_successor_issuers(ROOT / "quant/config/sec-successor-issuers.json")
    _STATE["names"] = set(_STATE["zip"].namelist())


def _payload(cik):
    name = "CIK%s.json" % cik
    if name not in _STATE["names"]:
        return None
    payload = json.loads(_STATE["zip"].read(name))
    preds = [p for p in _STATE["successors"].get(cik, []) if "CIK%s.json" % p in _STATE["names"]]
    if preds:
        payload = consumer.merge_company_facts(payload, [json.loads(_STATE["zip"].read("CIK%s.json" % p)) for p in preds])
    return payload


def build_doc(resolver, registry, years, as_of):
    """The consumer document at as_of, with the pipeline's own period functions."""
    as_year = int(as_of[:4])
    annual, quarterly, units, concepts = {}, {}, {}, {}
    for fy in [y for y in years if as_year - ANNUAL_BACK <= y <= as_year + 1]:
        for metric, (fact, derived) in consumer._facts_for_period(resolver, registry, fy, "FY", as_of, POLICY_AS_OF_LATEST).items():
            annual.setdefault(metric, []).append(consumer._row(fact, derived))
            units.setdefault(metric, fact.unit)
            if not derived and consumer._concept(fact):
                concepts.setdefault(metric, set()).add(consumer._concept(fact))
    slots = []
    for fy in reversed([y for y in years if y <= as_year + 1]):
        for index in (4, 3, 2, 1):
            slots.append((fy, index))
        if len(slots) >= QUARTER_SLOTS:
            break
    for fy, index in slots:
        for metric, (fact, derived) in consumer._facts_for_period(resolver, registry, fy, "Q%d" % index, as_of, POLICY_AS_OF_LATEST).items():
            if metric not in consumer.QUARTERLY_METRICS:
                continue
            rows = quarterly.setdefault(metric, [])
            if len(rows) < QUARTERS:
                rows.append(consumer._row(fact, derived))
                units.setdefault(metric, fact.unit)
    for metric in list(quarterly):
        quarterly[metric] = list(reversed(quarterly[metric]))
    ttm, through = consumer._ttm(resolver, registry, as_of, POLICY_AS_OF_LATEST)
    windows = sorted({row["end"] for row in ttm.values() if row.get("kind") == "TTM" and row.get("through")}, reverse=True)
    expiry = (date.fromisoformat(windows[0]) + timedelta(days=consumer.TTM_MAX_AGE_DAYS)).isoformat() if windows else None
    doc = {"schema": consumer.SCHEMA, "asOf": as_of, "policy": POLICY_AS_OF_LATEST, "columns": consumer.ROW_COLUMNS,
           "units": units, "conceptsUsed": {k: sorted(v) for k, v in sorted(concepts.items())},
           "annual": annual, "quarterly": quarterly, "ttm": ttm, "ttmThrough": through}
    return doc, expiry


def process(job):
    cik, first_rank, rank_dates, out_dir = job
    started = time.time()
    registry = _STATE["registry"]
    try:
        payload = _payload(cik)
        if payload is None:
            return {"cik": cik, "state": "NOT_IN_COMPANYFACTS"}
        provider = SECProvider.__new__(SECProvider)
        raw = list(SECProvider.iter_raw_facts(provider, payload, availability={}, forms=PERIODIC_FORMS))
        if not raw:
            return {"cik": cik, "state": "NO_PERIODIC_FACTS"}
        calendar = FiscalCalendar.from_raw_facts(cik, raw, fiscal_year_end_hint=_STATE["hints"].get(cik))
        result = normalize_company(cik, raw, registry, profile=None, filing_metadata=None, calendar=calendar,
                                   industry=_STATE["industries"].get(cik))
        resolver = PeriodResolver(result.factbook, registry)
        years = result.factbook.fiscal_years()
        filed = sorted({f.filed[:10] for f in raw if f.filed})
        versions, last_key, last_text, expiry, computed = [], None, None, None, 0
        for t in rank_dates:
            if t < first_rank:
                continue
            as_of = (date.fromisoformat(t) - timedelta(days=1)).isoformat()
            n_visible = sum(1 for d in filed if d <= as_of)
            if n_visible == 0:
                continue
            key = n_visible
            if key == last_key and (expiry is None or as_of <= expiry):
                continue
            doc, expiry = build_doc(resolver, registry, years, as_of)
            computed += 1
            last_key = key
            body = dict(doc)
            body.pop("asOf")
            text = json.dumps(body, sort_keys=True, separators=(",", ":"))
            if text == last_text:
                continue
            last_text = text
            versions.append({"from": t, "asOf": as_of, "doc": body})
        out = {"schema": "v10-factor-pit-docs-1.0.0", "cik": normalize_cik(cik), "versions": versions,
               "versionsStamp": version_stamp(registry.version), "rawFacts": len(raw), "filedDates": len(filed)}
        with gzip.open(pathlib.Path(out_dir) / ("%s.json.gz" % cik), "wt", encoding="utf-8", compresslevel=6) as handle:
            json.dump(out, handle, separators=(",", ":"))
        return {"cik": cik, "state": "OK", "versions": len(versions), "computed": computed, "seconds": round(time.time() - started, 2)}
    except Exception as exc:  # noqa: BLE001 - one bad issuer must not stop the run; counted
        return {"cik": cik, "state": "FAILED", "error": "%s: %s" % (type(exc).__name__, str(exc)[:200])}


def main():
    zip_path, jobs_path, out_dir = sys.argv[1], sys.argv[2], pathlib.Path(sys.argv[3]).resolve()
    if out_dir == ROOT or ROOT in out_dir.parents:
        raise SystemExit("PRIVATE_OUTPUT_REQUIRED")
    workers = int(sys.argv[sys.argv.index("--workers") + 1]) if "--workers" in sys.argv else 3
    out_dir.mkdir(parents=True, exist_ok=True)
    spec = json.loads(pathlib.Path(jobs_path).read_text())
    rank_dates = spec["rankDates"]
    todo = [(c, f, rank_dates, str(out_dir)) for c, f in sorted(spec["ciks"].items())
            if not (out_dir / ("%s.json.gz" % c)).exists()]
    started = time.time()
    results = []
    with multiprocessing.Pool(workers, initializer=_init, initargs=(zip_path,)) as pool:
        for i, r in enumerate(pool.imap_unordered(process, todo, chunksize=4)):
            results.append(r)
            if i % 200 == 0:
                print(json.dumps({"done": i + 1, "of": len(todo), "elapsed": round(time.time() - started)}), flush=True)
    summary_path = out_dir / "_summary.json"
    prior = json.loads(summary_path.read_text()) if summary_path.exists() else {"results": []}
    merged = {r["cik"]: r for r in prior["results"]}
    merged.update({r["cik"]: r for r in results})
    states = {}
    for r in merged.values():
        states[r["state"]] = states.get(r["state"], 0) + 1
    summary_path.write_text(json.dumps({"states": states, "results": sorted(merged.values(), key=lambda r: r["cik"]),
                                        "lastRunSeconds": round(time.time() - started)}, indent=0))
    print(json.dumps({"states": states, "seconds": round(time.time() - started)}))


if __name__ == "__main__":
    main()
