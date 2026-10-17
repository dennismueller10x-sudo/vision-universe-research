"""Wie oft verletzt ein TTM des Kerns (Sicht CURRENT_TTM, as_of) eine der TTM-Integritaetsregeln?

Je Emittent und Kennzahl (eps_diluted, eps_basic, revenue, net_income) die vier Quartale, die PeriodResolver.ttm summiert:
  PERIODS     Periodenenden verschieden und je 80-100 Tage auseinander (keine Doppelzaehlung, keine Luecke)
  EPS_CLASS   Je-Aktie: alle Quartale aus derselben Konzeptklasse (gesamt vs. fortgefuehrte Bereiche)
  SHARE_BASIS Je-Aktie: Aktienzahl (gewichtet verwaessert bzw. unverwaessert, sonst ausstehende Aktien) im Fenster
              max/min < 1,5 (sonst Split/Reverse-Split oder Kapitalmassnahme im Fenster); unbekannt, wenn < 2 Punkte
  CONCEPT_MIX Additiv: Quartale aus verschiedenen Konzepten, obwohl eine Einreichung des Fensters das andere Konzept
              mit abweichendem Wert meldet (ALT:-Beleg)
Ausgabe JSONL je (Emittent, Kennzahl) mit Befund und Beispielwerten (fuer echte Regressionsfaelle).
  python3 ttm_integrity_scan.py <companyfacts.zip> <ciks.json> <out.jsonl> [--shard i/n] [--as-of 2026-10-05]
"""
import json
import sys
import zipfile
from datetime import date
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "scripts"))

from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import normalize_company  # noqa: E402
from quant.sec.periods import PeriodResolver, _alternates  # noqa: E402
from quant.sec.provider import PERIODIC_FORMS, SECProvider  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402
from quant.sec.restatements import POLICY_AS_OF_LATEST  # noqa: E402

CONTINUING = ("IncomeLossFromContinuingOperationsPerDilutedShare", "IncomeLossFromContinuingOperationsPerBasicShare")
SHARES = {"eps_diluted": "diluted_weighted_average_shares", "eps_basic": "basic_weighted_average_shares"}


def gaps(ends):
    ds = [date.fromisoformat(e) for e in ends]
    return [(ds[i] - ds[i + 1]).days for i in range(len(ds) - 1)]


def main():
    archive, ciks_path, out_path = sys.argv[1:4]
    shard = sys.argv[sys.argv.index("--shard") + 1] if "--shard" in sys.argv else "0/1"
    as_of = sys.argv[sys.argv.index("--as-of") + 1] if "--as-of" in sys.argv else "2026-10-05"
    i, n = (int(x) for x in shard.split("/"))
    ciks = [c for k, c in enumerate(sorted(json.load(open(ciks_path)))) if k % n == i]
    registry = MetricRegistry.load()
    provider = SECProvider.__new__(SECProvider)
    zf = zipfile.ZipFile(archive)
    names = set(zf.namelist())
    with open(out_path, "w") as out:
        for cik in ciks:
            if f"CIK{cik}.json" not in names:
                continue
            cf = json.loads(zf.read(f"CIK{cik}.json"))
            raw = list(provider.iter_raw_facts(cf, availability={}, forms=PERIODIC_FORMS))
            if not raw:
                continue
            calendar = FiscalCalendar.from_raw_facts(cik, raw)
            book = normalize_company(cik, raw, registry, calendar=calendar).factbook
            resolver = PeriodResolver(book, registry)
            for metric in ("eps_diluted", "eps_basic", "revenue", "net_income"):
                quarters = resolver.latest_quarters(metric, as_of, count=4, policy=POLICY_AS_OF_LATEST)
                if len(quarters) < 4:
                    continue
                obs = [q[2] for q in quarters]
                ends = [str(o.period_end)[:10] for o in obs]
                rec = {"cik": cik, "metric": metric, "ends": ends, "values": [o.value for o in obs],
                       "concepts": [o.provenance.concept for o in obs], "labels": [f"{q[0]}Q{q[1]}" for q in quarters]}
                g = gaps(ends) if all(ends) else []
                rec["PERIODS"] = bool(g) and len(set(ends)) == 4 and all(80 <= x <= 100 for x in g)
                if metric.startswith("eps"):
                    classes = {("CONTINUING" if c in CONTINUING else "TOTAL") for c in rec["concepts"]}
                    rec["EPS_CLASS"] = len(classes) == 1
                    points = []
                    for fy, qi, _ in quarters:
                        s = resolver.quarter_grid(SHARES[metric], fy, as_of, POLICY_AS_OF_LATEST).get(qi)
                        if s is None:
                            s = resolver.quarter_grid("shares_outstanding", fy, as_of, POLICY_AS_OF_LATEST).get(qi)
                        if s is not None and s.value and s.value > 0:
                            points.append(s.value)
                    rec["sharePoints"] = points
                    rec["SHARE_BASIS"] = None if len(points) < 2 else max(points) / min(points) < 1.5
                else:
                    target = rec["concepts"][0]
                    alt_newest = _alternates(obs[0])
                    conflict = False
                    for o in obs[1:]:
                        c = o.provenance.concept
                        if c == target or target in _alternates(o):
                            continue
                        if c in alt_newest and abs(alt_newest[c][1] - o.value) > 0.005 * max(abs(o.value), 1):
                            conflict = True
                    rec["CONCEPT_MIX_CONFLICT"] = conflict
                    rec["conceptSwitch"] = len(set(rec["concepts"])) > 1
                out.write(json.dumps(rec) + "\n")
            out.flush()


if __name__ == "__main__":
    main()
