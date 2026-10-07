"""TTM-EPS-Verlust: warum hat der Kern fuer einen Emittenten keinen TTM-EPS (mehr)?

Fuer jeden CIK der Population (alter Kern hatte TTM-EPS, korrigierter nicht) wird mit dem UNVERAENDERTEN Kern
(scripts/quant/sec) das Zielfenster bestimmt - die vier Quartale bis zum juengsten Quartal mit Nettogewinn oder
EPS - und jedes fehlende Quartal gegen die rohen SEC-companyfacts klassifiziert:

  REPORTED_3M_NOT_USED   ein gemeldeter Dreimonats-EPS (verwaessert) existiert, der Kern nutzt ihn nicht
  BASIC_ONLY             nur unverwaesserter Dreimonats-EPS gemeldet (BASIC_DILUTED_MISMATCH)
  Q4_NOT_DERIVED         Q4: nur FY und 9M gemeldet (EPS wird seit 1.11 nicht abgeleitet)
  YTD_ONLY               Q2/Q3: nur kumulierte Werte gemeldet
  NO_FACT                fuer dieses Quartalsende gar kein EPS-Fakt (verschiedene Unterursachen, s. issuer-Felder)

Dazu je Emittent: Formulare (Auslandsemittent/Halbjahr), Aktienbasis FY vs. 9M (gewichtete verwaesserte Aktien),
Split-Hinweise, Gewinn/Verlust, EPS-Tags. Nur Messung; keine Kernaenderung.
  python3 ttm_loss_taxonomy.py <companyfacts.zip> <population.json> <out.jsonl> [--shard i/n] [--as-of 2026-10-05]
"""
import json
import sys
import zipfile
from datetime import date
from pathlib import Path

args = sys.argv[1:]
root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "scripts"))

from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import normalize_company  # noqa: E402
from quant.sec.periods import PeriodResolver  # noqa: E402
from quant.sec.provider import PERIODIC_FORMS, SECProvider  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402
from quant.sec.restatements import POLICY_AS_OF_LATEST  # noqa: E402

DILUTED = ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted",
           "IncomeLossFromContinuingOperationsPerDilutedShare")
BASIC = ("EarningsPerShareBasic", "IncomeLossFromContinuingOperationsPerBasicShare")
SHARES_DILUTED = "WeightedAverageNumberOfDilutedSharesOutstanding"
SPLIT_TAGS = ("StockholdersEquityNoteStockSplitConversionRatio1", "StockholdersEquityReverseStockSplit",
              "StockholdersEquityNoteStockSplit")


def days(start, end):
    return (date.fromisoformat(end) - date.fromisoformat(start)).days


def facts_of(cf, tags, unit_suffix=None):
    out = []
    for taxonomy, concepts in (cf.get("facts") or {}).items():
        for tag in tags:
            body = concepts.get(tag)
            if not body:
                continue
            for unit, rows in body.get("units", {}).items():
                if unit_suffix and not unit.endswith(unit_suffix):
                    continue
                for row in rows:
                    if row.get("form") in PERIODIC_FORMS or (row.get("form") or "").startswith(("10-", "20-F", "40-F", "6-K")):
                        out.append(dict(row, tag=tag, unit=unit, taxonomy=taxonomy))
    return out


def near(a, b, tolerance=7):
    return abs((date.fromisoformat(a) - date.fromisoformat(b)).days) <= tolerance


def classify_slot(cf_eps, cf_basic, end):
    three = [r for r in cf_eps if r.get("start") and near(r["end"], end) and 80 <= days(r["start"], r["end"]) <= 100]
    if three:
        return "REPORTED_3M_NOT_USED", sorted({r["tag"] for r in three}), sorted({r["form"] for r in three})
    three_basic = [r for r in cf_basic if r.get("start") and near(r["end"], end) and 80 <= days(r["start"], r["end"]) <= 100]
    longer = [r for r in cf_eps if r.get("start") and near(r["end"], end) and days(r["start"], r["end"]) > 100]
    if three_basic:
        return "BASIC_ONLY", sorted({r["tag"] for r in three_basic}), sorted({r["form"] for r in three_basic})
    if longer:
        annual = [r for r in longer if days(r["start"], r["end"]) >= 350]
        return ("Q4_NOT_DERIVED" if annual else "YTD_ONLY"), sorted({r["tag"] for r in longer}), sorted({r["form"] for r in longer})
    return "NO_FACT", [], []


def main():
    archive, population_path, out_path = args[:3]
    shard = args[args.index("--shard") + 1] if "--shard" in args else "0/1"
    as_of = args[args.index("--as-of") + 1] if "--as-of" in args else "2026-10-05"
    index, count = (int(x) for x in shard.split("/"))
    population = json.load(open(population_path))["lost"]
    population = [p for i, p in enumerate(population) if i % count == index]
    registry = MetricRegistry.load()
    provider = SECProvider.__new__(SECProvider)
    zf = zipfile.ZipFile(archive)
    with open(out_path, "w") as out:
        for item in population:
            cik = item["cik"]
            cf = json.loads(zf.read(f"CIK{cik}.json"))
            raw = list(provider.iter_raw_facts(cf, availability={}, forms=PERIODIC_FORMS))
            calendar = FiscalCalendar.from_raw_facts(cik, raw)
            book = normalize_company(cik, raw, registry, calendar=calendar).factbook
            resolver = PeriodResolver(book, registry)
            anchor = (resolver.latest_reported_quarter("net_income", as_of)
                      or resolver.latest_reported_quarter("eps_diluted", as_of))
            record = {"cik": cik, "ticker": item["ticker"], "anchor": anchor}
            forms = {r.get("form") for body in (cf.get("facts") or {}).get("us-gaap", {}).values()
                     for rows in body.get("units", {}).values() for r in rows}
            ifrs = bool((cf.get("facts") or {}).get("ifrs-full"))
            record["filer"] = ("FOREIGN_IFRS" if ifrs else "FOREIGN_20F_40F" if ({"20-F", "40-F"} & forms and "10-Q" not in forms)
                               else "DOMESTIC_10Q")
            if anchor is None:
                record["slots"] = []
                record["primary"] = "NO_RECENT_QUARTER"
                out.write(json.dumps(record) + "\n")
                continue
            cf_eps = facts_of(cf, DILUTED, "/shares")
            cf_basic = facts_of(cf, BASIC, "/shares")
            slots = []
            for step in range(4):
                fy, q = resolver.step_back(anchor[0], anchor[1], step)
                grid_eps = resolver.quarter_grid("eps_diluted", fy, as_of, POLICY_AS_OF_LATEST)
                grid_ni = resolver.quarter_grid("net_income", fy, as_of, POLICY_AS_OF_LATEST)
                obs = grid_eps.get(q)
                ref = grid_ni.get(q) or obs
                end = str(ref.period_end)[:10] if ref is not None and ref.period_end else None
                if obs is not None:
                    slots.append({"fy": fy, "q": q, "end": end, "status": "PRESENT", "concept": obs.provenance.concept})
                    continue
                if end is None:
                    slots.append({"fy": fy, "q": q, "end": None, "status": "NO_PERIOD"})
                    continue
                status, tags, slot_forms = classify_slot(cf_eps, cf_basic, end)
                slot = {"fy": fy, "q": q, "end": end, "status": status, "tags": tags, "forms": slot_forms}
                if status == "Q4_NOT_DERIVED":
                    fy_obs = resolver.annual("eps_diluted", fy, as_of, POLICY_AS_OF_LATEST)
                    slot["fyEps"] = fy_obs.value if getattr(fy_obs, "available", False) else None
                slots.append(slot)
            record["slots"] = slots
            missing = [s for s in slots if s["status"] != "PRESENT"]
            record["missingQuarters"] = [f"Q{s['q']}" for s in missing]
            record["primary"] = (missing[0]["status"] if len(missing) == 1 else
                                 "MULTIPLE:" + "+".join(sorted({s["status"] for s in missing})) if missing else "COMPLETE_WINDOW")
            # Aktienbasis fuer die Q4-Ableitung: verwaesserte gewichtete Aktien FY vs. 9M desselben Jahres
            q4 = next((s for s in slots if s["q"] == 4 and s.get("end")), None)
            if q4:
                sh = [r for r in facts_of(cf, (SHARES_DILUTED,), "shares") if r.get("start") and near(r["end"], q4["end"], 100)]
                fy_sh = [r for r in sh if near(r["end"], q4["end"]) and days(r["start"], r["end"]) >= 350]
                m9_sh = [r for r in sh if 260 <= days(r["start"], r["end"]) <= 285 and r["start"] == (fy_sh[0]["start"] if fy_sh else None)]
                if fy_sh and m9_sh:
                    record["shareBasisFy9mRelDiff"] = round(abs(fy_sh[0]["val"] - m9_sh[0]["val"]) / max(fy_sh[0]["val"], 1), 5)
            record["splitTags"] = sorted({t for t in SPLIT_TAGS if any(t in c for c in (cf.get("facts") or {}).values())})
            out.write(json.dumps(record) + "\n")
            out.flush()


if __name__ == "__main__":
    main()
