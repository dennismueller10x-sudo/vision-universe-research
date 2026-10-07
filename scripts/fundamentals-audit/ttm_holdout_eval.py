"""TTM-EPS-Holdout nach Praeregistrierung (artifacts/FUNDAMENTAL-TTM-HOLDOUT-PREREG.json) - einmalige Auswertung.

Wahrheit je Beobachtung: vier aufeinanderfolgende, von der SEC als Dreimonatswert (80-100 Tage) gemeldete EPS desselben
Konzepts (verwaessert: EarningsPerShareDiluted / EarningsPerShareBasicAndDiluted; unverwaessert: EarningsPerShareBasic /
EarningsPerShareBasicAndDiluted), Erstmeldung; knownFrom = spaeteste Erstmeldung der vier.
Kern (Experiment A: alle Fakten; B: gemeldete Q4-Dreimonats-EPS aus 10-K entfernt) zum Stichtag knownFrom und
knownFrom - 1 Tag (PIT).
Klassen: CORRECT, NOT_AVAILABLE, FALSE_AVAILABLE (TTM bis zu diesem Quartal vor knownFrom sichtbar), WRONG_CONCEPT
(fortgefuehrtes EPS bzw. falsche Klasse im Fenster), WRONG_PERIOD (anderes Fensterende), WRONG_VALUE (ausserhalb Toleranz).
  python3 ttm_holdout_eval.py <companyfacts.zip> <ciks.json> <exclude.json> <out.jsonl> [--shard i/n]
"""
import copy
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

FAMILIES = {"eps_diluted": ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"),
            "eps_basic": ("EarningsPerShareBasic", "EarningsPerShareBasicAndDiluted")}
TRUTH_SINCE = "2009-01-01"


def holdout(cik10):
    return hashlib.sha256(("vu-ttm-holdout-1|" + cik10).encode()).hexdigest()[0] in "89abcdef"


def days(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def first_reports(cf, concepts):
    """{(start, end): (value, filed, concept, form)} - Erstmeldung je Dreimonatsperiode, nicht-dimensional."""
    out = {}
    for concept in concepts:
        for unit, rows in (cf.get("facts", {}).get("us-gaap", {}).get(concept, {}).get("units", {})).items():
            if not unit.endswith("/shares"):
                continue
            for r in rows:
                if not r.get("start") or r["end"] < TRUTH_SINCE or not 80 <= days(r["start"], r["end"]) <= 100:
                    continue
                if r.get("form") not in PERIODIC_FORMS:
                    continue
                key = (r["start"], r["end"])
                if key not in out or r["filed"] < out[key][1]:
                    out[key] = (r["val"], r["filed"], concept, r.get("form"), unit)
    return out


def truth_windows(reports):
    periods = sorted(reports, key=lambda k: k[1])
    windows = []
    for k in range(3, len(periods)):
        four = periods[k - 3:k + 1]
        if not all(0 <= days(a[1], b[0]) <= 7 for a, b in zip(four, four[1:])):
            continue
        if len({reports[p][4] for p in four}) != 1:
            continue
        windows.append(four)
    return windows


def hide_q4(cf):
    """Experiment B: Dreimonats-EPS aus 10-K-Einreichungen entfernen (gemeldetes Q4)."""
    cf = copy.deepcopy(cf)
    for concepts in FAMILIES.values():
        for concept in concepts:
            body = cf.get("facts", {}).get("us-gaap", {}).get(concept)
            if not body:
                continue
            for unit, rows in body["units"].items():
                body["units"][unit] = [r for r in rows if not (r.get("start") and r.get("form", "").startswith("10-K")
                                                               and 80 <= days(r["start"], r["end"]) <= 100)]
    return cf


def resolver_for(cik, cf, registry, provider):
    raw = list(provider.iter_raw_facts(cf, availability={}, forms=PERIODIC_FORMS))
    if not raw:
        return None, None
    calendar = FiscalCalendar.from_raw_facts(cik, raw)
    return calendar, PeriodResolver(normalize_company(cik, raw, registry, calendar=calendar).factbook, registry)


def classify(resolver, metric, four, reports, known):
    truth = sum(reports[p][0] for p in four)
    end = four[-1][1]
    before = resolver.ttm(metric, (date.fromisoformat(known) - timedelta(days=1)).isoformat())
    if before.available and str(before.period_end)[:10] >= end:
        return "FALSE_AVAILABLE", truth, before.value, before.reason
    fact = resolver.ttm(metric, known)
    if not fact.available:
        return "NOT_AVAILABLE", truth, None, fact.reason
    if abs(days(str(fact.period_end)[:10], end)) > 7:
        return "WRONG_PERIOD", truth, fact.value, str(fact.period_end)[:10]
    quarters = resolver.latest_quarters(metric, known, count=4)
    concepts = {q[2].provenance.concept for q in quarters}
    if concepts & CONTINUING_PER_SHARE or not concepts <= set(FAMILIES[metric]):
        return "WRONG_CONCEPT", truth, fact.value, sorted(concepts)
    if abs(fact.value - truth) <= 0.02 or abs(fact.value - truth) <= 0.01 * abs(truth):
        return "CORRECT", truth, fact.value, None
    return "WRONG_VALUE", truth, fact.value, None


def main():
    archive, ciks_path, exclude_path, out_path = sys.argv[1:5]
    shard = sys.argv[sys.argv.index("--shard") + 1] if "--shard" in sys.argv else "0/1"
    i, n = (int(x) for x in shard.split("/"))
    exclude = {str(c).zfill(10) for c in json.load(open(exclude_path))}
    ciks = [c for c in sorted(json.load(open(ciks_path))) if holdout(c) and c not in exclude]
    ciks = [c for k, c in enumerate(ciks) if k % n == i]
    registry = MetricRegistry.load()
    provider = SECProvider.__new__(SECProvider)
    zf = zipfile.ZipFile(archive)
    names = set(zf.namelist())
    with open(out_path, "w") as out:
        for cik in ciks:
            if f"CIK{cik}.json" not in names:
                continue
            cf = json.loads(zf.read(f"CIK{cik}.json"))
            windows = {m: (lambda r: (r, truth_windows(r)))(first_reports(cf, FAMILIES[m])) for m in FAMILIES}
            if not any(w for _, w in windows.values()):
                continue
            for experiment, payload in (("A", cf), ("B", hide_q4(cf))):
                calendar, resolver = resolver_for(cik, payload, registry, provider)
                if resolver is None:
                    continue
                for metric, (reports, wins) in windows.items():
                    for four in wins:
                        known = max(reports[p][1] for p in four)
                        cls, truth, value, detail = classify(resolver, metric, four, reports, known)
                        out.write(json.dumps({
                            "cik": cik, "experiment": experiment, "metric": metric, "end": four[-1][1], "known": known,
                            "class": cls, "truth": truth, "core": value, "detail": detail,
                            "loss": any(reports[p][0] < 0 for p in four), "year": four[-1][1][:4],
                            "weekBased": bool(calendar.to_dict().get("week_based")),
                            "unit": reports[four[0]][4]}) + "\n")
            out.flush()


if __name__ == "__main__":
    main()
