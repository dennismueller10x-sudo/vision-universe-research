"""Perioden- und Sichtbarkeitskette eines TTM-EPS-Falls (Audit, nur Lesen).

Zeigt fuer (Emittent, Fensterende, as_of), warum der Kern genau diese vier Quartale waehlt - oder keine:
  calendar    Geschaeftsjahresgrenzen um das Fensterende, Uebergangsjahr ja/nein, FY/Quartal je Periode
  candidates  die sechs juengsten gemeldeten Dreimonats-EPS-Perioden bis zum Fensterende, direkt aus den SEC-Fakten
              (unabhaengig vom Kalender): Beginn, Ende, Laenge, Luecke/Ueberlappung zur vorigen, alle Fassungen mit
              Accession, Formular, Einreichungstag (first known) und Korrekturen
  selected    die vier Zellen des Kerns (ttm_ending) zu as_of: Zelle, Periode, Wert, Konzept, Accession, filed,
              known_from <= as_of
  result      TTM-Wert oder Grund
Quelle: eine companyfacts-JSON-Datei (SEC) oder ein Fixture aus scripts/quant/tests/fixtures/sec-real.
  python3 ttm_period_chain.py <companyfacts.json> <window-end YYYY-MM-DD> <as_of YYYY-MM-DD> [--metric eps_diluted]
"""
import json
import sys
from datetime import date
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "scripts"))

from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import normalize_company  # noqa: E402
from quant.sec.periods import PeriodResolver  # noqa: E402
from quant.sec.provider import SECProvider, fundamental_facts  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402

FAMILY = ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted")


def d(value):
    return date.fromisoformat(str(value)[:10])


def build(payload):
    cik = str(payload["cik"]).zfill(10)
    everything, raw = fundamental_facts(SECProvider.__new__(SECProvider), payload)   # wie pipeline.py/consumer.py
    calendar = FiscalCalendar.from_raw_facts(cik, everything)
    registry = MetricRegistry.load()
    resolver = PeriodResolver(normalize_company(cik, raw, registry, calendar=calendar).factbook, registry)
    return calendar, resolver


def raw_candidates(payload, end, count=6):
    periods = {}
    for concept in FAMILY:
        for unit, rows in ((payload["facts"].get("us-gaap") or {}).get(concept, {}).get("units") or {}).items():
            for r in rows:
                if not r.get("start") or r["end"] > end:
                    continue
                length = (d(r["end"]) - d(r["start"])).days + 1
                if not 77 <= length <= 105:
                    continue
                periods.setdefault((r["start"], r["end"]), []).append(
                    {"value": r["val"], "concept": concept, "accession": r["accn"], "form": r["form"], "filed": r["filed"]})
    chosen = sorted(periods, key=lambda p: p[1])[-count:]
    out, previous_end = [], None
    for start, stop in chosen:
        versions = sorted(periods[(start, stop)], key=lambda v: (v["filed"], v["accession"]))
        out.append({"start": start, "end": stop, "days": (d(stop) - d(start)).days + 1,
                    "gapToPrevious": None if previous_end is None else (d(start) - d(previous_end)).days - 1,
                    "firstKnown": versions[0]["filed"],
                    "corrections": sorted({v["filed"] for v in versions if v["filed"] > versions[0]["filed"]
                                           and v["value"] != versions[0]["value"]}),
                    "versions": versions})
        previous_end = stop
    return out


def chain(payload, end, as_of, metric="eps_diluted"):
    calendar, resolver = build(payload)
    previous, fy_end = calendar._boundaries_covering(end)
    year, index = calendar.fiscal_year_for(end), calendar.quarter_index(end)
    report = {"cik": str(payload["cik"]).zfill(10), "entity": payload.get("entityName"), "windowEnd": end, "asOf": as_of,
              "calendar": {"fyEnds": [str(x) for x in calendar.fy_ends],
                           "previousFyEnd": str(previous) if previous else None, "fyEnd": str(fy_end) if fy_end else None,
                           "transitionYear": bool(previous and fy_end and calendar.is_transition_year(previous, fy_end)),
                           "fiscalYear": year, "quarterIndex": index},
              "candidates": raw_candidates(payload, end)}
    for c in report["candidates"]:
        c["calendarCell"] = [calendar.fiscal_year_for(c["end"]), calendar.quarter_index(c["end"])]
    if year is None or index is None:
        report["selected"], report["result"] = [], {"available": False, "reason": "NO_QUARTER_SLOT"}
        return report
    selected = []
    for step in range(4):
        y, i = resolver.step_back(year, index, step)
        obs = resolver.quarter_grid(metric, y, as_of).get(i)
        timeline = resolver.factbook.get(metric, y, f"Q{i}")
        versions = [{"value": o.value, "accession": o.accession, "form": o.form, "filed": o.filed,
                     "available_from": o.available_from}
                    for o in (timeline.observations if timeline else [])]
        selected.append({"cell": f"FY{y}Q{i}",
                         "periodStart": obs.period_start if obs else None, "periodEnd": obs.period_end if obs else None,
                         "value": obs.value if obs else None,
                         "concept": obs.provenance.concept if obs else None,
                         "accession": obs.accession if obs else None, "filed": obs.filed if obs else None,
                         "knownBeforeAsOf": bool(obs and str(obs.available_from or obs.filed)[:10] <= as_of),
                         "transformation": obs.provenance.transformation if obs else None,
                         "versions": versions})
    report["selected"] = selected
    fact = resolver.ttm_ending(metric, year, index, as_of)
    report["result"] = {"available": fact.available, "value": fact.value, "reason": fact.reason,
                        "periodStart": fact.period_start, "periodEnd": fact.period_end}
    return report


def main():
    path, end, as_of = sys.argv[1:4]
    metric = sys.argv[sys.argv.index("--metric") + 1] if "--metric" in sys.argv else "eps_diluted"
    print(json.dumps(chain(json.load(open(path)), end, as_of, metric), indent=1, default=str))


if __name__ == "__main__":
    main()
