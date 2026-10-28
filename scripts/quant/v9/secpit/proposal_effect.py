#!/usr/bin/env python3
"""V9 secpit task 6: before/after effect of the proposed corrections on the
normalized factbooks (the archive-level counts V8 reported), for every issuer
touched by either finding. Runtime patches only (see impact.py); nothing in the
repo is written.

usage: python3 -I proposal_effect.py --repro <dir> --evidence <dir>
"""
import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import PRIVATE, sha256_file, write_json  # noqa: E402
import reproduce  # noqa: E402
import impact  # noqa: E402
from scripts.quant.sec import fiscal as fiscal_module  # noqa: E402


def run_variant(name, ciks):
    fiscal_module.FiscalCalendar._label_years = staticmethod(
        impact.bounded_label_years if name in ("P1", "P12") else impact.ORIGINAL_LABEL_YEARS)
    reproduce.normalize_company = impact.quarantining_normalize if name in ("P2", "P12") else impact.ORIGINAL_NORMALIZE
    totals = {"timelines": 0, "observations": 0, "implausibleLabelTimelines": 0, "implausibleLabelObservations": 0,
              "labelsFarFromEndYear": 0, "availabilityBeforePeriodEndStrictBulk": 0, "fiscalYearMin": None,
              "fiscalYearMax": None}
    per = {}
    for cik in ciks:
        r = reproduce._process(cik)
        if r.get("status") != "OK":
            continue
        far = [fy for fy in r["calendar"]["fiscal_years"] if fy["fiscal_year"] - int(fy["period_end"][:4]) not in (-1, 0, 1)]
        before = sum(o["strictOnBulkAvailability"] for o in r["availabilityBeforePeriodEnd"])
        bad_obs = sum(len(t["observations"]) for t in r["badFiscalYearTimelines"])
        totals["timelines"] += r["timelines"]
        totals["observations"] += r["observations"]
        totals["implausibleLabelTimelines"] += len(r["badFiscalYearTimelines"])
        totals["implausibleLabelObservations"] += bad_obs
        totals["labelsFarFromEndYear"] += len(far)
        totals["availabilityBeforePeriodEndStrictBulk"] += before
        for key, fn in (("fiscalYearMin", min), ("fiscalYearMax", max)):
            value = r["fiscalYearMin" if key == "fiscalYearMin" else "fiscalYearMax"]
            if value is not None:
                totals[key] = value if totals[key] is None else fn(totals[key], value)
        per[cik] = {"labelsFarFromEndYear": [(f["period_end"], f["fiscal_year"]) for f in far],
                    "implausibleLabelObservations": bad_obs, "availabilityBeforePeriodEnd": before}
    return totals, per


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repro", required=True)
    ap.add_argument("--evidence", required=True)
    args = ap.parse_args()
    meta = json.loads((PRIVATE / "impact/impact-meta.json").read_text())
    ciks = sorted(meta["affected"])
    reproduce._init(str(PRIVATE / "bulk/companyfacts.zip"), str(PRIVATE / "bulk/submissions.zip"))
    out = {"schemaVersion": "v9-secpit-proposal-effect-1.0.0", "codeSha256": sha256_file(pathlib.Path(__file__)),
           "ciks": len(ciks), "variants": {}}
    per_variant = {}
    for name in ("BASE", "P1", "P2", "P12"):
        totals, per = run_variant(name, ciks)
        out["variants"][name] = totals
        per_variant[name] = per
    out["labelFixesP1"] = {cik: {"before": per_variant["BASE"][cik]["labelsFarFromEndYear"],
                                 "after": per_variant["P1"][cik]["labelsFarFromEndYear"]}
                           for cik in ciks if per_variant["BASE"].get(cik, {}).get("labelsFarFromEndYear")}
    write_json(pathlib.Path(args.evidence) / "proposal-effect.json", out)
    print(json.dumps(out["variants"], indent=1))


if __name__ == "__main__":
    main()
