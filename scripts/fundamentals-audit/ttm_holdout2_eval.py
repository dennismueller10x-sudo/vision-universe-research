"""TTM-EPS-Holdout v2 (verwaessert) nach Praeregistrierung artifacts/FUNDAMENTAL-TTM-HOLDOUT2-PREREG.json.

Wahrheit = AS_KNOWN_AT(t) einschliesslich bis t eingereichter Korrekturen - dieselbe Semantik, die der Kern
(PIT_TTM, Policy AS_OF_LATEST) erfuellen soll, unabhaengig vom Kern direkt aus companyfacts gerechnet:
  Quartal     = ein von der SEC als Dreimonatswert (80-100 Tage) gemeldeter EPS aus einer periodischen Einreichung
                (10-K, 10-Q, Aenderungen), Konzeptfamilie EarningsPerShareDiluted / EarningsPerShareBasicAndDiluted;
                Periodenenden innerhalb von 7 Tagen sind dasselbe Quartal (52/53-Wochen-Varianten).
  Wert zu t   = die zuletzt (filed <= t) eingereichte Fassung; gleicher Tag: EarningsPerShareDiluted vor
                BasicAndDiluted, dann die hoehere Accession.
  Fenster     = vier aufeinanderfolgende Quartale (Abstand der Enden 77-105 Tage), eine Einheit.
  Verfuegbar  = alle vier Quartale zu t bekannt und dieselbe Aktienbasis: kein Split zwischen zwei benachbarten Quartalen
                (verwaesserte Aktien zu t; is_split_ratio: ab 1,9 innerhalb 5 % eines Split-Verhaeltnisses, darunter nur
                mit vom Emittenten gemeldetem Verhaeltnis; Emission/Rueckkauf sind keine neue Basis). Sonst NICHT
                VERFUEGBAR (Negativfall).
  knownFrom   = erster Tag, an dem alle vier bekannt waren; final = Tag der juengsten Fassung eines der vier.
Auswertung je Fall: t = knownFrom - 1 (frueh), knownFrom, final (wenn spaeter); Negativfaelle zu final.
Klassen: CORRECT, FALSE_AVAILABLE (EARLY | STRUCTURAL), FALSE_MISSING, WRONG_PERIOD, WRONG_CONCEPT, WRONG_VALUE,
TRUE_UNAVAILABLE, NOT_EVALUABLE (kein Fiskalslot im Kern-Kalender).
  python3 ttm_holdout2_eval.py <companyfacts.zip> <frame.json> <out.jsonl> [--shard i/n]
frame.json: {"ciks": [...]} - die Stichprobe, von sample erzeugt:
  python3 ttm_holdout2_eval.py sample <companyfacts.zip> <universe-ciks.json> <exclude.json> <frame.json>
"""
import hashlib
import json
import sys
import zipfile
from datetime import date, timedelta
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "scripts"))

from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import normalize_company  # noqa: E402
from quant.sec.periods import CONTINUING_PER_SHARE, PeriodResolver  # noqa: E402
from quant.sec.provider import PERIODIC_FORMS, SECProvider  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402

SALT = "vu-ttm-holdout-2"
FAMILY = ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted")
SHARES = ("WeightedAverageNumberOfDilutedSharesOutstanding",)
TRUTH_SINCE = "2009-06-01"
MAX_CASES_PER_ISSUER = 3
TOL_ABS, TOL_REL = 0.01, 0.005
# Split-Verhaeltnisse (und ihr Kehrwert fuer Reverse-Splits), ab 5:4.
SPLIT_RATIOS = (1.25, 4 / 3, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100)
STRATA = ("normal", "tag_switch", "split", "custom", "fy_change", "week52", "loss", "profit", "small", "large",
          "foreign", "restated", "negative")


def h(text):
    return hashlib.sha256((SALT + "|" + text).encode()).hexdigest()


def days(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def shift(day, n):
    return (date.fromisoformat(day) + timedelta(days=n)).isoformat()


# ----------------------------------------------------------------- truth

def cluster_quarters(cf, concepts, unit_suffix):
    """[{"end": canonical end, "rows": [...]}] sorted by end; rows: (filed, rank, accn, val, unit, concept, start, end)."""
    rows = []
    gaap = (cf.get("facts") or {}).get("us-gaap") or {}
    for rank, concept in enumerate(concepts):
        for unit, items in ((gaap.get(concept) or {}).get("units") or {}).items():
            if not unit.endswith(unit_suffix):
                continue
            for r in items:
                if not r.get("start") or r["end"] < TRUTH_SINCE or r.get("form") not in PERIODIC_FORMS:
                    continue
                if not 80 <= days(r["start"], r["end"]) <= 100 or not isinstance(r.get("val"), (int, float)):
                    continue
                rows.append((r["filed"], rank, r.get("accn") or "", float(r["val"]), unit, concept, r["start"], r["end"]))
    rows.sort(key=lambda x: x[7])
    clusters = []
    for row in rows:
        if clusters and days(clusters[-1]["end"], row[7]) <= 7:
            clusters[-1]["rows"].append(row)
        else:
            clusters.append({"end": row[7], "rows": [row]})
    return clusters


def version_at(cluster, t):
    seen = [r for r in cluster["rows"] if r[0] <= t]
    if not seen:
        return None
    # juengste Einreichung; gleicher Tag: Diluted vor BasicAndDiluted, dann hoehere Accession
    return max(seen, key=lambda r: (r[0], -r[1], r[2]))


def shares_at(share_clusters, end, t):
    for c in share_clusters:
        if abs(days(c["end"], end)) <= 7:
            v = version_at(c, t)
            return v[3] if v else None
    return None


def reported_split_ratios(cf):
    """Vom Emittenten selbst gemeldete Split-Verhaeltnisse (StockholdersEquityNoteStockSplitConversionRatio1)."""
    gaap = (cf.get("facts") or {}).get("us-gaap") or {}
    out = set()
    for rows in ((gaap.get("StockholdersEquityNoteStockSplitConversionRatio1") or {}).get("units") or {}).values():
        for r in rows:
            if isinstance(r.get("val"), (int, float)) and r["val"] > 0:
                out.add(r["val"] if r["val"] >= 1 else 1 / r["val"])
    return out


def is_split_ratio(ratio, reported=()):
    """Ein Aktienverhaeltnis zweier Quartale, das ein Split ist - nicht Emission oder Rueckkauf.
    Ab 1,9: innerhalb 5 % eines Split-Verhaeltnisses. Darunter (5:4, 4:3, 3:2) nur, wenn der Emittent ein passendes
    Verhaeltnis selbst meldet (Emissionen von 20-35 % liegen sonst zufaellig daneben: ClearSign 2024, WW 2012,
    Douglas Emmett 2011 in der Entwicklungsstichprobe). Verhaeltnisse >= 500 sind Skalierungsfehler."""
    if ratio < 1:
        ratio = 1 / ratio
    if ratio >= 500:
        return False
    if ratio >= 1.9:
        return any(abs(ratio / r - 1) <= 0.05 for r in SPLIT_RATIOS if r >= 2)
    return any(abs(ratio / r - 1) <= 0.05 for r in reported if r < 1.9) and \
        any(abs(ratio / r - 1) <= 0.05 for r in SPLIT_RATIOS if r < 2)


def split_between(shares, reported=()):
    """Ein Split zwischen zwei benachbarten Quartalen der vier, beide Aktienzahlen gemeldet und positiv."""
    return any(a and b and a > 0 and b > 0 and is_split_ratio(b / a, reported) for a, b in zip(shares, shares[1:]))


def truth_at(four, share_clusters, t, reported=()):
    versions = [version_at(c, t) for c in four]
    if any(v is None for v in versions):
        return {"available": False, "reason": "QUARTER_NOT_YET_KNOWN"}
    if len({v[4] for v in versions}) != 1:
        return {"available": False, "reason": "UNIT_MIXED"}
    shares = [shares_at(share_clusters, c["end"], t) for c in four]
    if split_between(shares, reported):
        return {"available": False, "reason": "SHARE_BASIS_MIXED"}
    return {"available": True, "value": sum(v[3] for v in versions), "concepts": sorted({v[5] for v in versions}),
            "end": four[-1]["end"], "unit": versions[0][4]}


def windows(clusters):
    out = []
    for k in range(3, len(clusters)):
        four = clusters[k - 3:k + 1]
        if all(77 <= days(a["end"], b["end"]) <= 105 for a, b in zip(four, four[1:])):
            out.append(four)
    return out


def quarter_grid_from(cf):
    """Quartalsenden, an denen das Unternehmen ueberhaupt Dreimonatswerte meldete (Ergebnis/Umsatz)."""
    return cluster_quarters(cf, ("NetIncomeLoss", "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
                                 "ProfitLoss"), "USD")


def negative_windows(cf, eps_clusters):
    """Vier aufeinanderfolgende Berichtsquartale, von denen mindestens einem ein Dreimonats-EPS fehlt."""
    grid = quarter_grid_from(cf)
    eps_ends = [c["end"] for c in eps_clusters]
    out = []
    for four in windows(grid):
        missing = [c for c in four if not any(abs(days(c["end"], e)) <= 7 for e in eps_ends)]
        if missing and len(missing) < 4:
            out.append({"end": four[-1]["end"], "final": max(r[0] for c in four for r in c["rows"])})
    return out


# ----------------------------------------------------------------- strata

def issuer_traits(cf, eps_clusters):
    forms = {r.get("form") for t in (cf.get("facts") or {}).values() for b in t.values()
             for rows in (b.get("units") or {}).values() for r in rows}
    gaap = (cf.get("facts") or {}).get("us-gaap") or {}
    foreign = bool({"20-F", "40-F", "20-F/A", "40-F/A"} & forms) or "ifrs-full" in (cf.get("facts") or {})
    if not foreign:
        units = {u for b in gaap.values() for u in (b.get("units") or {})}
        foreign = any(u.endswith("/shares") and not u.startswith("USD") for u in units)
    assets = [r["val"] for r in ((gaap.get("Assets") or {}).get("units") or {}).get("USD", []) if r.get("form") in PERIODIC_FORMS]
    size = max(assets) if assets else None
    fy_ends = sorted({r["end"][5:7] for r in ((gaap.get("NetIncomeLoss") or {}).get("units") or {}).get("USD", [])
                      if r.get("start") and r.get("form", "").startswith("10-K") and 350 <= days(r["start"], r["end"]) <= 380})
    net_q = len(quarter_grid_from(cf))
    return {"foreign": foreign, "small": size is not None and size < 3e8, "large": size is not None and size > 1e10,
            "fy_change": len(fy_ends) > 1 and len({int(m) for m in fy_ends}) > 1 and
            max(int(m) for m in fy_ends) - min(int(m) for m in fy_ends) not in (0, 1, 11),
            "custom": net_q >= 8 and len(eps_clusters) < 0.6 * net_q, "split_ratios": reported_split_ratios(cf)}


def case_strata(traits, four, share_clusters, final_truth, calendar):
    tags = set()
    concepts = {r[5] for c in four for r in c["rows"]}
    if len(concepts) > 1:
        tags.add("tag_switch")
    if any(len({r[3] for r in c["rows"]}) > 1 for c in four):
        tags.add("restated")
    first_shares = []
    for c in four:
        match = [s for s in share_clusters if abs(days(s["end"], c["end"])) <= 7]
        first_shares.append(min(match[0]["rows"])[3] if match else None)
    if split_between(first_shares, traits["split_ratios"]) or final_truth.get("reason") == "SHARE_BASIS_MIXED":
        tags.add("split")
    for key in ("custom", "fy_change", "small", "large", "foreign"):
        if traits[key]:
            tags.add(key)
    if calendar.to_dict().get("week_based"):
        tags.add("week52")
    if final_truth.get("available"):
        tags.add("loss" if final_truth["value"] < 0 or any(version_at(c, "9999")[3] < 0 for c in four) else "profit")
    if not tags - {"profit", "loss"}:
        tags.add("normal")
    return tags


# ----------------------------------------------------------------- core

def core_for(cik, cf, registry, provider):
    raw = list(provider.iter_raw_facts(cf, availability={}, forms=PERIODIC_FORMS))
    if not raw:
        return None, None
    calendar = FiscalCalendar.from_raw_facts(cik, raw)
    return calendar, PeriodResolver(normalize_company(cik, raw, registry, calendar=calendar).factbook, registry)


def core_at(resolver, calendar, end, t):
    fiscal_year, index = calendar.fiscal_year_for(end), calendar.quarter_index(end)
    if fiscal_year is None or index is None:
        return None
    fact = resolver.ttm_ending("eps_diluted", fiscal_year, index, t)
    if not fact.available:
        return {"available": False, "reason": fact.reason}
    concepts = set()
    for step in range(4):
        year, q = resolver.step_back(fiscal_year, index, step)
        obs = resolver.quarter_grid("eps_diluted", year, t).get(q)
        if obs is not None:
            concepts.add(obs.provenance.concept)
    return {"available": True, "value": fact.value, "end": str(fact.period_end)[:10], "concepts": sorted(concepts)}


def classify(truth, core):
    if core is None:
        return "NOT_EVALUABLE", None
    if not truth["available"]:
        return ("FALSE_AVAILABLE", "STRUCTURAL") if core["available"] else ("TRUE_UNAVAILABLE", None)
    if not core["available"]:
        return "FALSE_MISSING", core.get("reason")
    if abs(days(core["end"], truth["end"])) > 7:
        return "WRONG_PERIOD", core["end"]
    if set(core["concepts"]) & CONTINUING_PER_SHARE or not set(core["concepts"]) <= set(FAMILY):
        return "WRONG_CONCEPT", core["concepts"]
    diff = abs(core["value"] - truth["value"])
    if diff <= TOL_ABS + 1e-9 or diff <= TOL_REL * abs(truth["value"]):
        return "CORRECT", None
    return "WRONG_VALUE", None


def evaluate_issuer(cik, cf, registry, provider):
    eps = cluster_quarters(cf, FAMILY, "/shares")
    shares = cluster_quarters(cf, SHARES, "shares")
    positives = windows(eps)
    negatives = negative_windows(cf, eps)
    if not positives and not negatives:
        return []
    calendar, resolver = core_for(cik, cf, registry, provider)
    if resolver is None:
        return []
    traits = issuer_traits(cf, eps)
    candidates = []
    for four in positives:
        known_from = max(min(r[0] for r in c["rows"]) for c in four)
        final = max(r[0] for c in four for r in c["rows"])
        final_truth = truth_at(four, shares, final, traits["split_ratios"])
        tags = case_strata(traits, four, shares, final_truth, calendar)
        if not final_truth["available"]:
            tags = tags | {"negative"}
        candidates.append({"kind": "WINDOW", "end": four[-1]["end"], "four": four, "knownFrom": known_from,
                           "final": final, "tags": sorted(tags)})
    for neg in negatives:
        candidates.append({"kind": "MISSING_QUARTER", "end": neg["end"], "four": None, "knownFrom": None,
                           "final": neg["final"], "tags": sorted({"negative", "custom"} if traits["custom"] else {"negative"})})
    # bis zu MAX_CASES_PER_ISSUER Faelle je Emittent, deterministisch, seltene Schichten zuerst
    rarity = {"negative": 0, "tag_switch": 1, "split": 2, "fy_change": 3, "week52": 4, "custom": 5, "foreign": 6,
              "restated": 7, "large": 8, "small": 9, "loss": 10, "normal": 11, "profit": 12}
    candidates.sort(key=lambda c: (min(rarity[t] for t in c["tags"]), h(cik + c["end"] + c["kind"])))
    chosen, seen_tags = [], set()
    for c in candidates:
        if len(chosen) >= MAX_CASES_PER_ISSUER:
            break
        if chosen and set(c["tags"]) <= seen_tags:
            continue
        chosen.append(c)
        seen_tags |= set(c["tags"])
    out = []
    for c in chosen:
        evals = []
        if c["kind"] == "MISSING_QUARTER":
            truth = {"available": False, "reason": "QUARTER_EPS_NOT_REPORTED"}
            evals.append(("final", c["final"], truth))
        else:
            if c["knownFrom"] > TRUTH_SINCE:
                evals.append(("early", shift(c["knownFrom"], -1), truth_at(c["four"], shares, shift(c["knownFrom"], -1), traits["split_ratios"])))
            evals.append(("knownFrom", c["knownFrom"], truth_at(c["four"], shares, c["knownFrom"], traits["split_ratios"])))
            if c["final"] > c["knownFrom"]:
                evals.append(("final", c["final"], truth_at(c["four"], shares, c["final"], traits["split_ratios"])))
        for label, t, truth in evals:
            core = core_at(resolver, calendar, c["end"], t)
            cls, detail = classify(truth, core)
            if label == "early" and cls == "FALSE_AVAILABLE":
                detail = "EARLY"
            out.append({"cik": cik, "kind": c["kind"], "end": c["end"], "eval": label, "t": t, "class": cls,
                        "detail": detail if not isinstance(detail, set) else sorted(detail), "tags": c["tags"],
                        "truth": truth.get("value"), "truthReason": truth.get("reason"),
                        "core": (core or {}).get("value"), "coreEnd": (core or {}).get("end")})
    return out


# ----------------------------------------------------------------- sampling frame

def sample(archive, universe_path, exclude_path, out_path):
    """Rahmen: alle CIKs in companyfacts.zip, die nie in einer frueheren Analyse lagen (nicht im Produktuniversum,
    nicht in Fixtures/Ground Truth/Holdout v1), deterministisch nach SALT geordnet."""
    universe = {str(c).zfill(10) for c in json.load(open(universe_path))}
    exclude = {str(c).zfill(10) for c in json.load(open(exclude_path))}
    names = [n for n in zipfile.ZipFile(archive).namelist() if n.startswith("CIK") and n.endswith(".json")]
    frame = sorted((n[3:13] for n in names if n[3:13] not in universe and n[3:13] not in exclude), key=h)
    json.dump({"salt": SALT, "excludedUniverse": len(universe), "excludedOther": len(exclude), "ciks": frame},
              open(out_path, "w"))
    print(out_path, len(frame), "CIKs im Rahmen")


def main():
    if sys.argv[1] == "sample":
        return sample(*sys.argv[2:6])
    archive, frame_path, out_path = sys.argv[1:4]
    shard = sys.argv[sys.argv.index("--shard") + 1] if "--shard" in sys.argv else "0/1"
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    i, n = (int(x) for x in shard.split("/"))
    ciks = json.load(open(frame_path))["ciks"]
    ciks = [c for k, c in enumerate(ciks[:limit] if limit else ciks) if k % n == i]
    registry = MetricRegistry.load()
    provider = SECProvider.__new__(SECProvider)
    zf = zipfile.ZipFile(archive)
    with open(out_path, "w") as out:
        for cik in ciks:
            cf = json.loads(zf.read(f"CIK{cik}.json"))
            try:
                rows = evaluate_issuer(cik, cf, registry, provider)
            except Exception as exc:  # noqa: BLE001 - ein Emittent bricht die Auswertung nicht ab, wird aber gezaehlt
                rows = [{"cik": cik, "class": "EVALUATOR_ERROR", "detail": f"{type(exc).__name__}: {exc}"[:200]}]
            for row in rows:
                out.write(json.dumps(row) + "\n")
            out.flush()


if __name__ == "__main__":
    main()
