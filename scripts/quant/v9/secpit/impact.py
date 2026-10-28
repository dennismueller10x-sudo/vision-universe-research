#!/usr/bin/env python3
"""V9 secpit tasks 3/6: before/after effect of the proposed corrections on the
consumer bundles that feed the factor engines (read-only; nothing in the repo
is written; bundles go to private scratch).

  BASE  = repo code as is (scripts/quant/sec/*), today's bulk companyfacts
  P1    = fiscal-year anchor plausibility bound: an annual filing's `fy` is used as
          a label only if fy - period_end.year in {-1, 0, +1}; otherwise the
          learned offset applies (recorded like any rejected anchor)
  P2    = future-period quarantine: a normalized observation whose period_end
          lies after its availability date is not a reported period and is
          removed from the timelines (would be recorded as issue
          FUTURE_PERIOD_END)
  P12   = P1 + P2

The patches are applied by wrapping functions at runtime in this process only.

usage: python3 -I impact.py --repro <dir> --out <private dir> --evidence <dir>
"""
import argparse
import json
import pathlib
import sys
import zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import PRIVATE, ROOT, guard_private, sha256_file, write_json  # noqa: E402

from scripts.quant.sec import consumer as consumer_module  # noqa: E402
from scripts.quant.sec import fiscal as fiscal_module  # noqa: E402
from scripts.quant.sec.registry import MetricRegistry  # noqa: E402

AS_OF = "2026-10-26"  # asOf of the committed consumer bundles
ORIGINAL_LABEL_YEARS = fiscal_module.FiscalCalendar._label_years
ORIGINAL_NORMALIZE = consumer_module.normalize_company


def bounded_label_years(fy_ends, anchors, label_offset):
    kept = {end: fy for end, fy in anchors.items() if fy - end.year in (-1, 0, 1)}
    labels, rejected = ORIGINAL_LABEL_YEARS(fy_ends, kept, label_offset)
    for end, fy in anchors.items():
        if end not in kept:
            rejected.append((end.isoformat(), fy, labels.get(end)))
    return labels, rejected


def quarantining_normalize(*args, **kwargs):
    result = ORIGINAL_NORMALIZE(*args, **kwargs)
    book = result.factbook
    removed = 0
    for key in list(book.timelines):
        tl = book.timelines[key]
        keep = [o for o in tl.observations
                if not (o.period_end and str(o.available_from or o.filed)[:10] < o.period_end)]
        removed += len(tl.observations) - len(keep)
        if not keep:
            del book.timelines[key]
        elif len(keep) != len(tl.observations):
            tl._observations = keep
            tl._sorted = False
    result.stats["future_period_quarantined"] = removed
    return result


def set_variant(name):
    fiscal_module.FiscalCalendar._label_years = staticmethod(
        bounded_label_years if name in ("P1", "P12") else ORIGINAL_LABEL_YEARS)
    consumer_module.normalize_company = quarantining_normalize if name in ("P2", "P12") else ORIGINAL_NORMALIZE


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repro", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--evidence", required=True)
    args = ap.parse_args()
    out = guard_private(args.out)
    out.mkdir(parents=True, exist_ok=True)
    affected = {}
    for line in open(pathlib.Path(args.repro) / "reproduce.jsonl"):
        r = json.loads(line)
        if r.get("status") != "OK":
            continue
        reasons = set()
        if r.get("badFiscalYearTimelines"):
            reasons.add("IMPLAUSIBLE_FY_LABEL")
        for fy in (r.get("calendar") or {}).get("fiscal_years") or []:
            if fy["fiscal_year"] - int(fy["period_end"][:4]) not in (-1, 0, 1):
                reasons.add("LABEL_FAR_FROM_END_YEAR")
        if any(o["strictOnBulkAvailability"] for o in r.get("availabilityBeforePeriodEnd") or []):
            reasons.add("AVAILABILITY_BEFORE_PERIOD_END")
        if reasons:
            affected[r["cik"]] = sorted(reasons)
    registry = MetricRegistry.load()
    hints = consumer_module.load_fiscal_year_end_hints(ROOT / "quant/data/fundamentals/issuers")
    industries = consumer_module.load_issuer_industries(ROOT / "quant/data/fundamentals/issuers")
    z = zipfile.ZipFile(PRIVATE / "bulk/companyfacts.zip")
    summary = {}
    for variant in ("BASE", "P1", "P2", "P12"):
        set_variant(variant)
        vdir = out / variant
        vdir.mkdir(exist_ok=True)
        for cik in sorted(affected):
            committed = ROOT / "quant/data/sec/consumer" / ("CIK%s.json" % cik)
            meta = json.loads(committed.read_text()) if committed.exists() else {}
            payload = json.loads(z.read("CIK%s.json" % cik))
            bundle = consumer_module.build_consumer_bundle(
                cik, payload, registry, as_of=AS_OF, tickers=meta.get("tickers") or [],
                security_ids=meta.get("securityIds") or [], name=meta.get("name"),
                fiscal_year_end_hint=hints.get(cik), industry=industries.get(cik))
            if bundle is not None:
                (vdir / ("CIK%s.json" % cik)).write_text(json.dumps(bundle, separators=(",", ":")))
        summary[variant] = len(list(vdir.glob("CIK*.json")))
    set_variant("BASE")
    write_json(out / "impact-meta.json", {"affected": affected, "variants": summary, "asOf": AS_OF,
                                          "codeSha256": sha256_file(pathlib.Path(__file__))})
    print(json.dumps({"affectedCiks": len(affected), "bundles": summary}))


if __name__ == "__main__":
    main()
