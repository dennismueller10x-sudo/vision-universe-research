#!/usr/bin/env python3
"""Rolling window for the daily pipeline: merge a new form4.py output into the previous artifact.

Standard library only. Atomic write to --out; the previous artifact stays untouched on any error.
  python3 scripts/insider/merge.py --next new.json [--prev old.json] --keep-days 90 --out purchases.json
Rules: one row per id (the newer run wins), rows older than asOf - keep-days (by availableAt) leave the window,
the newer run must not be older than the previous one (monotonic asOf), schema must match.
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import tempfile

SCHEMA = "sec-form4-purchases-1.0.0"


def ts(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def merge(prev, nxt, keep_days):
    if nxt.get("schemaVersion") != SCHEMA or (prev and prev.get("schemaVersion") != SCHEMA):
        raise ValueError("schema mismatch")
    if prev and ts(nxt["asOf"]) < ts(prev["asOf"]):
        raise ValueError("new run is older than the previous artifact")
    floor = ts(nxt["asOf"]) - timedelta(days=keep_days)
    rows = {}
    for row in (prev or {}).get("purchases", []) + nxt["purchases"]:
        rows[row["id"]] = row
    kept = sorted((r for r in rows.values() if ts(r["availableAt"]) >= floor), key=lambda r: (r["availableAt"], r["id"]))
    start = min([nxt["window"]["filingDateFrom"]] + ([prev["window"]["filingDateFrom"]] if prev else []))
    start = max(start, floor.date().isoformat())
    out = dict(nxt)
    out.update({"window": {"filingDateFrom": start, "filingDateTo": nxt["window"]["filingDateTo"]},
                "rollingWindowDays": keep_days, "records": len(kept), "purchases": kept,
                "filingsProcessed": nxt["filingsProcessed"]})
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--next", required=True, type=Path)
    ap.add_argument("--prev", type=Path)
    ap.add_argument("--keep-days", type=int, default=90)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args(argv)
    prev = json.loads(a.prev.read_text(encoding="utf-8")) if a.prev and a.prev.exists() else None
    doc = merge(prev, json.loads(a.next.read_text(encoding="utf-8")), a.keep_days)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=a.out.parent, encoding="utf-8", delete=False) as f:
            name = f.name
            json.dump(doc, f, ensure_ascii=False, indent=2, allow_nan=False)
            f.write("\n")
        os.replace(name, a.out)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)
    print(json.dumps({"records": doc["records"], "asOf": doc["asOf"], "window": doc["window"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
