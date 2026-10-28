#!/usr/bin/env python3
"""V9-Folgearbeit SEC-Pipeline: unabhaengige Nachrechnung von P1/P2 aus Rohdaten.

Importiert NICHTS aus scripts/quant/sec. Liest companyfacts.zip, die
Metrikregistry (JSON) und die Emittenten-Scherben (Branche) selbst und
rechnet je CIK nach:

  P1  welche Jahresberichte (10-K/20-F/40-F, fp=FY) ein fy tragen, das mehr als
      ein Jahr vom Kalenderjahr ihres juengsten Jahresdauer-Endes (330-390 Tage,
      Ende <= Einreichung) abweicht -> (Periodenende, fy).
  P2  wie viele (Fakt, Kennzahl)-Paare zu quarantaenieren sind: periodische
      Form, Konzept der Registry, Einheit erlaubt, Instant/Dauer passend, nicht
      branchenausgeschlossen, Ende nach dem Einreichungsdatum (Konsumpfad:
      Verfuegbarkeit = Einreichungsdatum). Doppelte Fakten zaehlen einmal.

und vergleicht mit dem Feld `quality` der NEU gebauten Buendel (--new) sowie
mit dem ALTEN Stand (--old): dort muessen genau die nachgerechneten
unplausiblen fy als Geschaeftsjahreslabel auftauchen. Schreibt nur --out.

  python3 -I independent_check.py --archive companyfacts.zip --new <dir> --old <dir>
          --registry quant/config/sec-metric-registry.json --issuers quant/data/fundamentals/issuers
          --successors quant/config/sec-successor-issuers.json --out <file.json>
"""
import argparse
import hashlib
import json
import pathlib
import zipfile
from collections import Counter, defaultdict
from datetime import date

PERIODIC = {"10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A"}
ANCHOR_FORMS = {"10-K", "20-F", "40-F"}


def iso(value):
    if not isinstance(value, str) or len(value) < 10:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def load_registry(path):
    body = json.loads(pathlib.Path(path).read_text())
    index = defaultdict(list)          # (taxonomy, concept) -> [(metric, kind, units, excluded)]
    for group in ("metrics", "industry_metrics"):
        for name, metric in (body.get(group) or {}).items():
            for rule in metric.get("concepts") or []:
                index[(rule["taxonomy"], rule["concept"])].append(
                    (name, metric["kind"], set(metric.get("units") or []), set(rule.get("excluded_industries") or [])))
    return index


def unit_allowed(unit, units):
    if unit in units:
        return True
    cur = lambda c: len(c) == 3 and c.isalpha() and c.isupper()   # noqa: E731
    if "USD" in units and unit and cur(unit):
        return True
    if "USD/shares" in units and unit and unit.endswith("/shares") and cur(unit.split("/", 1)[0]):
        return True
    return False


def industries(directory):
    out = {}
    for path in sorted(pathlib.Path(directory).glob("*.json")):
        for row in json.loads(path.read_text()).get("issuers") or []:
            if row.get("cik") and row.get("industry"):
                out[str(row["cik"]).zfill(10)] = row["industry"]
    return out


def entries(payload):
    for taxonomy, concepts in (payload.get("facts") or {}).items():
        for concept, body in (concepts or {}).items():
            for unit, rows in ((body or {}).get("units") or {}).items():
                for row in rows or []:
                    yield taxonomy, concept, unit, row


def recompute(payloads, index, industry):
    anchors = defaultdict(lambda: {"ends": set(), "fy": None})
    seen = set()
    quarantined = Counter()
    for payload in payloads:
        for taxonomy, concept, unit, row in entries(payload):
            form = (row.get("form") or "").strip()
            end, filed, start = iso(row.get("end")), iso(row.get("filed")), row.get("start")
            if form not in PERIODIC or row.get("val") is None or end is None or filed is None:
                continue
            if start and form in ANCHOR_FORMS and row.get("fp") == "FY" and iso(start) and end <= filed:
                days = (end - iso(start)).days
                if 330 <= days <= 390:
                    bucket = anchors[row.get("accn")]
                    bucket["ends"].add(end)
                    if row.get("fy") is not None:
                        bucket["fy"] = int(row["fy"])
            fact_id = (taxonomy, concept, unit, start or "", row.get("end"), row.get("accn"))
            mapped = index.get((taxonomy, concept))
            if not mapped:
                continue
            if fact_id in seen:
                continue
            seen.add(fact_id)
            for metric, kind, units, excluded in mapped:
                if industry and industry in excluded:
                    continue
                if not unit_allowed(unit, units) or (kind == "instant") != (start is None):
                    continue
                if end > filed:
                    quarantined[metric] += 1
    implausible = sorted({(max(b["ends"]).isoformat(), b["fy"]) for b in anchors.values()
                          if b["fy"] is not None and b["ends"] and abs(b["fy"] - max(b["ends"]).year) > 1})
    return implausible, quarantined


def main():
    ap = argparse.ArgumentParser()
    for name in ("archive", "new", "old", "registry", "issuers", "successors", "out"):
        ap.add_argument("--" + name, required=True)
    args = ap.parse_args()
    index = load_registry(args.registry)
    branch = industries(args.issuers)
    successors = {k: v["predecessors"] for k, v in
                  (json.loads(pathlib.Path(args.successors).read_text()).get("successors") or {}).items()}
    new_dir, old_dir = pathlib.Path(args.new), pathlib.Path(args.old)
    ciks = sorted(p.stem[3:] for p in new_dir.glob("CIK*.json"))
    archive = zipfile.ZipFile(args.archive)
    names = set(archive.namelist())
    tally = Counter()
    mismatches = []
    p1_old_labels = []
    for cik in ciks:
        payloads = [json.loads(archive.read(f"CIK{c}.json")) for c in [cik, *successors.get(cik, [])]
                    if f"CIK{c}.json" in names]
        implausible, quarantined = recompute(payloads, index, branch.get(cik))
        bundle = json.loads((new_dir / f"CIK{cik}.json").read_text())
        quality = bundle.get("quality") or {}
        got_p1 = sorted((r["periodEnd"], r["filingClaimedFy"]) for r in quality.get("implausibleFilingFy") or [])
        got_p2 = (quality.get("futurePeriodEnd") or {}).get("byMetric") or {}
        tally["ciks"] += 1
        tally["p1Anchors"] += len(implausible)
        tally["p1Issuers"] += bool(implausible)
        tally["p2Pairs"] += sum(quarantined.values())
        tally["p2Issuers"] += bool(quarantined)
        p1_ok = got_p1 == implausible
        p2_ok = dict(sorted(quarantined.items())) == dict(sorted(got_p2.items()))
        tally["p1Parity"] += p1_ok
        tally["p2Parity"] += p2_ok
        if not (p1_ok and p2_ok):
            mismatches.append({"cik": cik, "p1": {"independent": implausible, "pipeline": got_p1},
                               "p2": {"independent": dict(quarantined), "pipeline": got_p2},
                               "successor": cik in successors})
        # The OLD bundles carried the implausible fy as a label wherever the
        # anchor's year stayed in the published window.
        old_path = old_dir / f"CIK{cik}.json"
        if implausible and old_path.exists():
            old = json.loads(old_path.read_text())

            def labels_at(doc, end):
                return sorted({row[0] for part in ("annual", "quarterly")
                               for rows in (doc.get(part) or {}).values() for row in rows
                               if str(row[2])[:10] == end})
            p1_old_labels.append({"cik": cik, "tickers": bundle.get("tickers"),
                                  "anchors": [{"periodEnd": end, "claimedFy": fy,
                                               "publishedLabelsBefore": labels_at(old, end),
                                               "publishedLabelsAfter": labels_at(bundle, end)}
                                              for end, fy in implausible]})
    report = {
        "schemaVersion": "v9-followup-sec-pipeline-independent-check-1.0.0",
        "generatedBy": "scripts/quant/v9_followups/sec_pipeline/independent_check.py",
        "codeSha256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        "importsPipeline": False,
        "scope": "duration-anchor path of the fiscal calendar (P1) and per-(fact, metric) quarantine (P2) on the "
                 "consumer path (availability = filing date); issuer-specific extension concepts not modelled",
        "tally": dict(tally),
        "p1LabelEffect": p1_old_labels,
        "mismatches": mismatches,
    }
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps(report["tally"]))


if __name__ == "__main__":
    main()
