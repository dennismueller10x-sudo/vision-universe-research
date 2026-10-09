"""TTM-EPS-Holdout v4 (verwaessert) nach Praeregistrierung artifacts/FUNDAMENTAL-TTM-HOLDOUT4-PREREG.json.

Wahrheit = AS_KNOWN_AT(t) einschliesslich bis t veroeffentlichter Korrekturen - dieselbe Semantik, die der Kern 1.21.0
(PIT_TTM, Policy AS_OF_LATEST) erfuellen soll, unabhaengig vom Kern direkt aus companyfacts gerechnet.
Gegenueber v3 (ttm_holdout3_eval.py, unveraendert) geaendert, vor Oeffnung festgelegt:
  Geschaeftsjahre  aus der Kette der Jahresenden statt "Quartal liegt in einer 12-Monats-Periode": zwei
               aufeinanderfolgende 12-Monats-Jahre auf DEMSELBEN Zyklus (Jahrestag +-14 Tage) mit einer Luecke von k Jahren
               sind k normale Jahre (geteiltes Predecessor/Successor-Jahr oder fehlender Bericht: Kalender unveraendert;
               v3 wertete das faelschlich als Geschaeftsjahreswechsel, F-TTM-5); auf VERSCHIEDENEN Zyklen ist der Zeitraum
               dazwischen ein Uebergangszeitraum (NOT_QUARTER_ELIGIBLE). 10-KT zaehlt als Jahresbericht (Vergleichsjahre).
  Formulare    zusaetzlich 10-KT und 10-KT/A (Korrekturen im Transition Report zaehlen zur Wahrheit).
  Gesperrt     Fensterquartale der gewerteten Faelle aus Holdout v2 UND v3.
  Formulare    10-K, 10-K/A, 10-Q, 10-Q/A, 20-F(/A), 40-F(/A) (periodische Berichte; 10-KT nicht)
  Quartal      gemeldeter Dreimonats-EPS (77-105 Tage), Konzeptfamilie EarningsPerShareDiluted /
               EarningsPerShareBasicAndDiluted (Gesamt-EPS); Periodenenden innerhalb 7 Tagen = dasselbe Quartal
  Wert zu t    juengste Einreichung mit filed <= t; in derselben Einreichung Diluted vor BasicAndDiluted.
               Same-Day-Policy: melden am juengsten Tag zwei verschiedene Einreichungen verschiedene Werte, ist das
               Quartal zu t AMBIGUOUS_SAME_DAY (keine Uhrzeit in companyfacts; nicht per Formular/Accession entschieden)
  Fenster      vier Quartale als Kette tatsaechlicher Perioden: Beginn -3 bis +8 Tage um das Ende des vorigen, zusammen
               357-374 Tage (Stub-Policy), eine Einheit
  EPS-Plausib. ein EPS, dessen implizite Aktienzahl (Dreimonats-Ergebnis / EPS) unter 1.000 liegt, ist kein EPS
               (gewichtete Aktien als EPS getaggt); das Quartal ist dann ungueltig (Wahrheit nicht verfuegbar)
  Aktienbasis  kein Split zwischen benachbarten Quartalen (verwaesserte Aktien zu t; is_split_ratio wie Holdout v2)
  Geschaeftsjahr  Jahresenden = Periodenende jedes 10-K/20-F/40-F (Ende seiner laengsten Periode); ein Abstand zweier
               Jahresenden ausserhalb 350-380 Tagen ist ein Uebergangszeitraum; seine Quartale sind
               NOT_QUARTER_ELIGIBLE (Fiscal-Year-Change-Policy)
  knownFrom    erster Tag, an dem die Wahrheit verfuegbar war; final = Tag der juengsten Fassung eines der vier
Auswertung je Fall: t = knownFrom - 1 (frueh), knownFrom, final (wenn spaeter); Negativfaelle zu final.
  python3 ttm_holdout4_eval.py sample <companyfacts.zip> <holdout3-frame.json> <earlier-rows-glob> <exclude.json> <frame.json>
  python3 ttm_holdout4_eval.py <companyfacts.zip> <frame.json> <out.jsonl> [--shard i/n]
"""
import glob
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
from quant.sec.provider import CALENDAR_FORMS, PERIODIC_FORMS, SECProvider  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402

SALT = "vu-ttm-holdout-4"
FAMILY = ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted")
SHARES = ("WeightedAverageNumberOfDilutedSharesOutstanding",)
ANNUAL_FORMS = {"10-K", "10-K/A", "10-KT", "10-KT/A", "20-F", "20-F/A", "40-F", "40-F/A"}
# Wahrheit "bekannt zu t einschliesslich veroeffentlichter Korrekturen": auch Transition Reports (eine Korrektur, die nur
# in einem 10-KT/A steht, ist eine veroeffentlichte Korrektur; der Kern liest Werte nur aus PERIODIC_FORMS - F-TTM-6)
TRUTH_FORMS = set(PERIODIC_FORMS) | {"10-KT", "10-KT/A"}
CYCLE_DAYS = 14
TRUTH_SINCE = "2009-06-01"
QUARTER_DAYS = (77, 105)
CHAIN_GAP_DAYS = (-3, 8)
SPAN_DAYS = (357, 374)
YEAR_DAYS = (350, 380)
FY_END_MIN_CONCEPTS = 5
MAX_CASES_PER_ISSUER = 3
TOL_ABS, TOL_REL = 0.01, 0.005
SPLIT_RATIOS = (1.25, 4 / 3, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100)
STRATA = ("normal", "fy_change", "split_year", "week52", "stub", "tag_switch", "split", "custom", "loss", "profit",
          "small", "large", "foreign", "domestic", "restated", "amendment", "same_day", "negative")


def h(text):
    return hashlib.sha256((SALT + "|" + text).encode()).hexdigest()


def days(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def shift(day, n):
    return (date.fromisoformat(day) + timedelta(days=n)).isoformat()


# ----------------------------------------------------------------- facts

def cluster_quarters(cf, concepts, unit_suffix):
    rows = []
    gaap = (cf.get("facts") or {}).get("us-gaap") or {}
    for rank, concept in enumerate(concepts):
        for unit, items in ((gaap.get(concept) or {}).get("units") or {}).items():
            if not unit.endswith(unit_suffix):
                continue
            for r in items:
                if not r.get("start") or r["end"] < TRUTH_SINCE or r.get("form") not in TRUTH_FORMS:
                    continue
                if not QUARTER_DAYS[0] <= days(r["start"], r["end"]) <= QUARTER_DAYS[1]:
                    continue
                if not isinstance(r.get("val"), (int, float)):
                    continue
                rows.append((r["filed"], rank, r.get("accn") or "", float(r["val"]), unit, concept, r["start"], r["end"],
                             r.get("form") or ""))
    rows.sort(key=lambda x: x[7])
    clusters = []
    for row in rows:
        if clusters and days(clusters[-1]["end"], row[7]) <= 7:
            clusters[-1]["rows"].append(row)
        else:
            clusters.append({"end": row[7], "rows": [row]})
    return clusters


def version_at(cluster, t):
    """(row | None, ambiguous): juengste Fassung zu t; Konflikt verschiedener Einreichungen am selben Tag -> ambiguous."""
    seen = [r for r in cluster["rows"] if r[0] <= t]
    if not seen:
        return None, False
    last_day = max(r[0] for r in seen)
    same_day = [r for r in seen if r[0] == last_day]
    by_filing = {}
    for r in sorted(same_day, key=lambda r: r[1]):        # innerhalb einer Einreichung: Diluted vor BasicAndDiluted
        by_filing.setdefault(r[2], r)
    values = {round(r[3], 6) for r in by_filing.values()}
    if len(values) > 1:
        return None, True
    return next(iter(by_filing.values())), False


def shares_at(share_clusters, end, t):
    for c in share_clusters:
        if abs(days(c["end"], end)) <= 7:
            v, _ = version_at(c, t)
            return v[3] if v else None
    return None


def reported_split_ratios(cf):
    gaap = (cf.get("facts") or {}).get("us-gaap") or {}
    out = set()
    for rows in ((gaap.get("StockholdersEquityNoteStockSplitConversionRatio1") or {}).get("units") or {}).values():
        for r in rows:
            if isinstance(r.get("val"), (int, float)) and r["val"] > 0:
                out.add(r["val"] if r["val"] >= 1 else 1 / r["val"])
    return out


def is_split_ratio(ratio, reported=()):
    if ratio < 1:
        ratio = 1 / ratio
    if ratio >= 500:
        return False
    if ratio >= 1.9:
        return any(abs(ratio / r - 1) <= 0.05 for r in SPLIT_RATIOS if r >= 2)
    return any(abs(ratio / r - 1) <= 0.05 for r in reported if r < 1.9) and \
        any(abs(ratio / r - 1) <= 0.05 for r in SPLIT_RATIOS if r < 2)


def split_between(shares, reported=()):
    return any(a and b and a > 0 and b > 0 and is_split_ratio(b / a, reported) for a, b in zip(shares, shares[1:]))


def fiscal_years(cf):
    """Normale Geschaeftsjahre [(start, end)]: Zwoelfmonatsperioden (350-380 Tage) in Jahresberichten (einschliesslich
    Vergleichsjahren), gestuetzt von mindestens FY_END_MIN_CONCEPTS verschiedenen Konzepten."""
    support = {}
    for taxonomy in ((cf.get("facts") or {}).get("us-gaap") or {}, (cf.get("facts") or {}).get("ifrs-full") or {}):
        for concept, body in taxonomy.items():
            for rows in (body.get("units") or {}).values():
                for r in rows:
                    if r.get("form") not in ANNUAL_FORMS or not r.get("start"):
                        continue
                    if YEAR_DAYS[0] <= days(r["start"], r["end"]) <= YEAR_DAYS[1]:
                        support.setdefault((r["start"], r["end"]), set()).add(concept)
    years = []
    for (start, end), concepts in sorted(support.items(), key=lambda kv: kv[0][1]):
        if len(concepts) < FY_END_MIN_CONCEPTS:
            continue
        if years and abs(days(years[-1][1], end)) <= 7:
            continue
        years.append((start, end))
    return years


def same_cycle(a, b):
    """Zwei Jahresenden auf demselben Geschaeftsjahreszyklus (Jahrestag +-CYCLE_DAYS, ueber den Jahreswechsel)."""
    da, db = date.fromisoformat(a).timetuple().tm_yday, date.fromisoformat(b).timetuple().tm_yday
    return min(abs(da - db), 366 - abs(da - db)) <= CYCLE_DAYS


def fiscal_structure(years):
    """(normale Jahre, Uebergangszeitraeume) aus der Kette der 12-Monats-Jahre.
    Aufeinanderfolgende Jahre: schliessen sie an (Luecke <= 8 Tage) -> normal. Sonst auf demselben Zyklus mit einer Luecke
    von m Jahren (+-10 Tage) -> m ergaenzte normale Jahre (Kalender unveraendert: geteiltes Predecessor/Successor-Jahr,
    fehlender Bericht). Sonst (anderer Zyklus) -> der Zeitraum zwischen den Jahren ist ein Uebergangszeitraum."""
    normal, transitions = [], []
    for k, year in enumerate(years):
        normal.append(year)
        if k + 1 == len(years):
            break
        nxt = years[k + 1]
        gap = days(year[1], nxt[0]) - 1          # Tage zwischen Ende und naechstem Beginn
        if gap <= 8:
            continue
        missing = round(gap / 365.25)
        if same_cycle(year[1], nxt[1]) and missing >= 1 and abs(gap - missing * 365.25) <= 10:
            previous_end = year[1]
            for j in range(1, missing + 1):
                end = shift(year[1], round(365.25 * j)) if j < missing else shift(nxt[0], -1)
                normal.append((shift(previous_end, 1), end))
                previous_end = end
            continue
        transitions.append((shift(year[1], 1), shift(nxt[0], -1)))
    return normal, transitions


def eligible_windows(years, last_data):
    """Normale Geschaeftsjahre (einschliesslich ergaenzter Jahre auf unveraendertem Zyklus) plus Fortschreibung des
    ersten Jahres rueckwaerts und des letzten vorwaerts (je ein Jahr, bis zum Datenbereich); dazu die
    Uebergangszeitraeume."""
    if not years:
        return [], []
    normal, transitions = fiscal_structure(years)
    out = list(normal)
    start, end = years[-1]
    while end < last_data:
        start, end = shift(end, 1), shift(end, 365)
        out.append((start, end))
    start, end = years[0]
    first = shift(TRUTH_SINCE, -400)
    while start > first:
        start, end = shift(start, -365), shift(start, -1)
        out.append((start, end))
    return out, transitions


def quarter_eligible(quarter_start, quarter_end, windows_):
    """Ein Quartal liegt vollstaendig in einem normalen Geschaeftsjahr (Toleranz 7 Tage) und beruehrt keinen
    Uebergangszeitraum."""
    normal, transitions = windows_
    if any(quarter_start <= shift(te, -7) and quarter_end >= shift(ts, 7) for ts, te in transitions):
        return False
    return any(shift(ws, -7) <= quarter_start and quarter_end <= shift(we, 7) for ws, we in normal)


def transition_gaps(years):
    """Uebergangszeitraeume (Geschaeftsjahreswechsel); ein fehlendes Jahr auf unveraendertem Zyklus ist keiner."""
    return fiscal_structure(years)[1]


def split_years(years):
    """Ergaenzte Jahre auf unveraendertem Zyklus (kein 12-Monats-Zeitraum im Jahresbericht: geteiltes Jahr)."""
    normal, _ = fiscal_structure(years)
    real = set(years)
    return [y for y in normal if y not in real]


def income_at(income_clusters, end, t):
    for c in income_clusters or []:
        if abs(days(c["end"], end)) <= 7:
            v, ambiguous = version_at(c, t)
            return None if ambiguous or v is None else v[3]
    return None


def truth_at(four, share_clusters, t, reported, eligible, income_clusters=None):
    versions = []
    for c in four:
        v, ambiguous = version_at(c, t)
        if ambiguous:
            return {"available": False, "reason": "AMBIGUOUS_SAME_DAY"}
        if v is None:
            return {"available": False, "reason": "QUARTER_NOT_YET_KNOWN"}
        versions.append(v)
    if len({v[4] for v in versions}) != 1:
        return {"available": False, "reason": "UNIT_MIXED"}
    if not all(quarter_eligible(v[6], v[7], eligible) for v in versions):
        return {"available": False, "reason": "FISCAL_TRANSITION"}
    for older, newer in zip(versions, versions[1:]):
        gap = days(older[7], newer[6])
        if not CHAIN_GAP_DAYS[0] <= gap <= CHAIN_GAP_DAYS[1]:
            return {"available": False, "reason": "NOT_CONTIGUOUS"}
    span = days(versions[0][6], versions[-1][7]) + 1
    if not SPAN_DAYS[0] <= span <= SPAN_DAYS[1]:
        return {"available": False, "reason": "STUB_SPAN"}
    for c, v in zip(four, versions):
        income = income_at(income_clusters, c["end"], t)
        if income and abs(v[3]) >= 0.05 and abs(income / v[3]) < 1000:
            return {"available": False, "reason": "EPS_IMPLAUSIBLE"}
    shares = [shares_at(share_clusters, c["end"], t) for c in four]
    if split_between(shares, reported):
        return {"available": False, "reason": "SHARE_BASIS_MIXED"}
    return {"available": True, "value": sum(v[3] for v in versions), "concepts": sorted({v[5] for v in versions}),
            "end": four[-1]["end"], "unit": versions[0][4]}


def windows(clusters):
    out = []
    for k in range(3, len(clusters)):
        four = clusters[k - 3:k + 1]
        if all(77 <= days(a["end"], b["end"]) <= 126 for a, b in zip(four, four[1:])):
            out.append(four)
    return out


def quarter_grid_from(cf):
    return cluster_quarters(cf, ("NetIncomeLoss", "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
                                 "ProfitLoss"), "USD")


def negative_windows(cf, eps_clusters):
    grid = quarter_grid_from(cf)
    eps_ends = [c["end"] for c in eps_clusters]
    out = []
    for four in windows(grid):
        missing = [c for c in four if not any(abs(days(c["end"], e)) <= 7 for e in eps_ends)]
        if missing and len(missing) < 4:
            out.append({"end": four[-1]["end"], "final": max(r[0] for c in four for r in c["rows"]),
                        "quarters": [c["end"] for c in four]})
    return out


# ----------------------------------------------------------------- strata

def issuer_traits(cf, eps_clusters, years):
    forms = {r.get("form") for t in (cf.get("facts") or {}).values() for b in t.values()
             for rows in (b.get("units") or {}).values() for r in rows}
    gaap = (cf.get("facts") or {}).get("us-gaap") or {}
    foreign = bool({"20-F", "40-F", "20-F/A", "40-F/A"} & forms) or "ifrs-full" in (cf.get("facts") or {})
    if not foreign:
        units = {u for b in gaap.values() for u in (b.get("units") or {})}
        foreign = any(u.endswith("/shares") and not u.startswith("USD") for u in units)
    assets = [r["val"] for r in ((gaap.get("Assets") or {}).get("units") or {}).get("USD", []) if r.get("form") in PERIODIC_FORMS]
    size = max(assets) if assets else None
    weekdays = {date.fromisoformat(e).weekday() for _, e in years[-5:]}
    net_q = len(quarter_grid_from(cf))
    return {"foreign": foreign, "small": size is not None and size < 3e8, "large": size is not None and size > 1e10,
            "week52": len(years) >= 3 and len(weekdays) == 1,
            "custom": net_q >= 8 and len(eps_clusters) < 0.6 * net_q, "split_ratios": reported_split_ratios(cf)}


def case_strata(traits, four_ends, four, share_clusters, final_truth, gaps, splits=()):
    tags = set()
    if any(shift(a, -400) <= e <= shift(b, 400) for e in four_ends for a, b in splits):
        tags.add("split_year")
    if four:
        if any(str(r[8]).endswith("/A") for c in four for r in c["rows"]):
            tags.add("amendment")
        if len({r[5] for c in four for r in c["rows"]}) > 1:
            tags.add("tag_switch")
        if any(len({r[3] for r in c["rows"]}) > 1 for c in four):
            tags.add("restated")
        if any(len({r[3] for r in c["rows"] if r[0] == d}) > 1 for c in four for d in {r[0] for r in c["rows"]}):
            tags.add("same_day")
        first_shares = []
        for c in four:
            match = [s for s in share_clusters if abs(days(s["end"], c["end"])) <= 7]
            first_shares.append(min(match[0]["rows"])[3] if match else None)
        if split_between(first_shares, traits["split_ratios"]) or final_truth.get("reason") == "SHARE_BASIS_MIXED":
            tags.add("split")
        if final_truth.get("reason") in ("STUB_SPAN", "NOT_CONTIGUOUS"):
            tags.add("stub")
    if any(a <= e <= shift(b, 400) for e in four_ends for a, b in gaps) or final_truth.get("reason") == "FISCAL_TRANSITION":
        tags.add("fy_change")
    for key in ("custom", "small", "large", "foreign", "week52"):
        if traits[key]:
            tags.add(key)
    if not traits["foreign"]:
        tags.add("domestic")
    if final_truth.get("available"):
        tags.add("loss" if final_truth["value"] < 0 else "profit")
    if not tags - {"profit", "loss", "domestic"}:
        tags.add("normal")
    return tags


# ----------------------------------------------------------------- core

def core_for(cik, cf, registry, provider):
    everything = list(provider.iter_raw_facts(cf, availability={}, forms=CALENDAR_FORMS))
    raw = [fact for fact in everything if fact.form in PERIODIC_FORMS]   # wie pipeline.py/consumer.py
    if not raw:
        return None, None
    calendar = FiscalCalendar.from_raw_facts(cik, everything)
    return calendar, PeriodResolver(normalize_company(cik, raw, registry, calendar=calendar).factbook, registry)


def core_at(resolver, calendar, end, t):
    """Kern-TTM, dessen Fenster am Wahrheitsende endet. Der Kern wird ueber seinen Kalender gefragt; hat das Ende dort
    keinen Quartalsslot (Uebergangsjahr, 1.20.0), liefert der Kern dafuer kein TTM (= nicht verfuegbar)."""
    fiscal_year, index = calendar.fiscal_year_for(end), calendar.quarter_index(end)
    if fiscal_year is None or index is None:
        return {"available": False, "reason": "NO_QUARTER_SLOT"}
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


def known_from(four, shares, reported, eligible, income=None):
    """Erster Einreichungstag, an dem die Wahrheit verfuegbar ist (oder None)."""
    for t in sorted({r[0] for c in four for r in c["rows"]}):
        if truth_at(four, shares, t, reported, eligible, income)["available"]:
            return t
    return None


def evaluate_issuer(cik, cf, registry, provider, blocked_quarters):
    eps = cluster_quarters(cf, FAMILY, "/shares")
    shares = cluster_quarters(cf, SHARES, "shares")
    income = cluster_quarters(cf, ("NetIncomeLoss",), "USD")
    years = fiscal_years(cf)
    last_data = max([r[7] for c in eps for r in c["rows"]] + [TRUTH_SINCE])
    eligible = eligible_windows(years, last_data)
    gaps = transition_gaps(years)
    splits = split_years(years)

    def free(ends):
        # kein Quartal im Bereich eines gewerteten v2-Fensters [Ende - 380 Tage, Ende + 7 Tage]
        return not any(shift(b, -380) <= e <= shift(b, 7) for e in ends for b in blocked_quarters)

    positives = [w for w in windows(eps) if free([c["end"] for c in w])]
    negatives = [n for n in negative_windows(cf, eps) if free(n["quarters"])]
    if not positives and not negatives:
        return []
    calendar, resolver = core_for(cik, cf, registry, provider)
    if resolver is None:
        return []
    traits = issuer_traits(cf, eps, years)
    candidates = []
    for four in positives:
        final = max(r[0] for c in four for r in c["rows"])
        final_truth = truth_at(four, shares, final, traits["split_ratios"], eligible, income)
        kf = known_from(four, shares, traits["split_ratios"], eligible, income)
        tags = case_strata(traits, [c["end"] for c in four], four, shares, final_truth, gaps, splits)
        if not final_truth["available"]:
            tags = tags | {"negative"}
        candidates.append({"kind": "WINDOW", "end": four[-1]["end"], "four": four, "knownFrom": kf, "final": final,
                           "tags": sorted(tags)})
    for neg in negatives:
        tags = case_strata(traits, neg["quarters"], None, shares, {"available": False}, gaps, splits) | {"negative"}
        tags.discard("normal")
        candidates.append({"kind": "MISSING_QUARTER", "end": neg["end"], "four": None, "knownFrom": None,
                           "final": neg["final"], "tags": sorted(tags)})
    rarity = {s: k for k, s in enumerate(("fy_change", "split_year", "stub", "same_day", "negative", "amendment",
                                          "tag_switch", "split", "week52", "custom", "foreign", "restated", "large",
                                          "small", "loss", "normal", "profit", "domestic"))}
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
        if c["kind"] == "MISSING_QUARTER" or c["knownFrom"] is None:
            truth = {"available": False, "reason": "QUARTER_EPS_NOT_REPORTED"} if c["kind"] == "MISSING_QUARTER" else \
                truth_at(c["four"], shares, c["final"], traits["split_ratios"], eligible, income)
            evals.append(("final", c["final"], truth))
        else:
            kf = c["knownFrom"]
            if kf > TRUTH_SINCE:
                evals.append(("early", shift(kf, -1), truth_at(c["four"], shares, shift(kf, -1), traits["split_ratios"], eligible, income)))
            evals.append(("knownFrom", kf, truth_at(c["four"], shares, kf, traits["split_ratios"], eligible, income)))
            if c["final"] > kf:
                evals.append(("final", c["final"], truth_at(c["four"], shares, c["final"], traits["split_ratios"], eligible, income)))
        for label, t, truth in evals:
            core = core_at(resolver, calendar, c["end"], t)
            cls, detail = classify(truth, core)
            if label == "early" and cls == "FALSE_AVAILABLE":
                detail = "EARLY"
            out.append({"cik": cik, "kind": c["kind"], "end": c["end"], "eval": label, "t": t, "class": cls,
                        "detail": detail, "tags": c["tags"], "truth": truth.get("value"),
                        "truthReason": truth.get("reason"), "core": core.get("value"), "coreEnd": core.get("end")})
    return out


# ----------------------------------------------------------------- sampling frame

def sample(archive, holdout2_frame, holdout2_rows_glob, exclude_path, out_path):
    """Rahmen: die Emittenten des Holdout-v3-Rahmens (= v2-Rahmen ohne die damals untersuchten), ohne die manuell
    untersuchten (Exclude-Liste v4: Exclude v3, Fixtures, Holdout-v3-Fehlerfaelle, Red-Team- und Nachbarsuch-Faelle,
    jeder in dieser Arbeitsrunde genannte CIK). Gesperrt sind je Emittent alle Quartale jedes gewerteten Falls aus
    Holdout v2 und v3 (rows-glob ueber beide Laeufe); ein v4-Fall teilt kein Quartal mit einem frueheren Fall."""
    exclude = {str(c).zfill(10) for c in json.load(open(exclude_path))}
    frame = [c for c in json.load(open(holdout2_frame))["ciks"] if c not in exclude]
    blocked = {}
    for path in sorted(glob.glob(holdout2_rows_glob)):
        for line in open(path):
            row = json.loads(line)
            if row.get("end"):
                end = row["end"]
                blocked.setdefault(row["cik"], set()).add(end)   # Fensterende; gesperrt: [Ende - 380, Ende + 7]
    frame = sorted(frame, key=h)
    json.dump({"salt": SALT, "excluded": len(exclude), "ciks": frame,
               "blockedQuarters": {c: sorted(v) for c, v in sorted(blocked.items())}}, open(out_path, "w"))
    print(out_path, len(frame), "CIKs im Rahmen,", sum(len(v) for v in blocked.values()), "gesperrte v2-Fenster")


def main():
    if sys.argv[1] == "sample":
        return sample(*sys.argv[2:7])
    archive, frame_path, out_path = sys.argv[1:4]
    shard = sys.argv[sys.argv.index("--shard") + 1] if "--shard" in sys.argv else "0/1"
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    i, n = (int(x) for x in shard.split("/"))
    frame = json.load(open(frame_path))
    ciks = frame["ciks"][:limit] if limit else frame["ciks"]
    ciks = [c for k, c in enumerate(ciks) if k % n == i]
    blocked_all = frame.get("blockedQuarters", {})
    registry = MetricRegistry.load()
    provider = SECProvider.__new__(SECProvider)
    zf = zipfile.ZipFile(archive)
    names = set(zf.namelist())
    with open(out_path, "w") as out:
        for cik in ciks:
            if f"CIK{cik}.json" not in names:
                continue
            cf = json.loads(zf.read(f"CIK{cik}.json"))
            try:
                rows = evaluate_issuer(cik, cf, registry, provider, set(blocked_all.get(cik, [])))
            except Exception as exc:  # noqa: BLE001
                rows = [{"cik": cik, "class": "EVALUATOR_ERROR", "detail": f"{type(exc).__name__}: {exc}"[:200]}]
            for row in rows:
                out.write(json.dumps(row) + "\n")
            out.flush()


if __name__ == "__main__":
    main()
