"""Exportiert Quartalswerte der Quant-SEC-Kernschicht (P1) im Zeilenformat des eingefrorenen Minervini-SEPA-Moduls.

Zeile: [periodEnd, value, filed(=Erstverfuegbarkeit, Datum), accession, form, derived(0/1), concept, componentsFiledFrom]
Erstmeldung je Quartal (POLICY_ORIGINAL), Sichtbarkeit = available_from (Annahmezeitpunkt, Datum in US-Ostzeit).
Nur fuer den Ground-Truth-Replay; die SEPA-Logik bleibt unveraendert.
  python3 export_sepa_fund.py <ciks.json> <cf-dir> <sub-dir> <out.json> [--repo-root <checkout>]
"""
import gzip
import json
import sys
from datetime import timedelta
from pathlib import Path

args = sys.argv[1:]
root = Path(args[args.index("--repo-root") + 1]) if "--repo-root" in args else Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "scripts"))

from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import build_availability_map, normalize_company  # noqa: E402
from quant.sec.periods import PeriodResolver  # noqa: E402
from quant.sec.provider import PERIODIC_FORMS, SECProvider  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402
from quant.sec.restatements import POLICY_ORIGINAL  # noqa: E402

FAR = "2099-12-31"
METRICS = {"eps": "eps_diluted", "rev": "revenue", "gp": "gross_profit", "opinc": "operating_income", "ni": "net_income"}


def load_gz(path):
    with gzip.open(path, "rt") as handle:
        return json.load(handle)


def available_date(obs):
    """Datum der Erstverfuegbarkeit in US-Ostzeit (SEC-Annahme), sonst Einreichungsdatum."""
    instant = getattr(obs, "available_instant", None)
    if instant is not None:
        try:
            # UTC-Instant -> Eastern (EST/EDT naeherungsweise -5h; Annahme nach 19:00 UTC bleibt am selben ET-Tag)
            return (instant - timedelta(hours=5)).date().isoformat()
        except TypeError:
            return str(instant)[:10]
    return str(obs.filed)[:10]


def main():
    ciks_path, cf_dir, sub_dir, out_path = args[:4]
    cf_dir, sub_dir = Path(cf_dir), Path(sub_dir)
    registry = MetricRegistry.load()
    provider = SECProvider.__new__(SECProvider)
    out = {}
    for cik in json.load(open(ciks_path)):
        cik10 = str(cik).zfill(10)
        cf_path = cf_dir / f"CIK{cik10}.json.gz"
        if not cf_path.exists():
            continue
        facts = load_gz(cf_path)
        facts["_retrieved_at"] = "2026-10-07T00:00:00+00:00"
        sub_path = sub_dir / f"CIK{cik10}.json.gz"
        submissions = load_gz(sub_path) if sub_path.exists() else {"filings": {"recent": {}}}
        for page in (submissions.get("filings", {}) or {}).get("files", []) or []:
            extra_path = sub_dir / (page["name"] + ".gz")
            if extra_path.exists():
                extra = load_gz(extra_path)
                for column, values in extra.items():
                    submissions["filings"]["recent"].setdefault(column, []).extend(values)
        submissions["_retrieved_at"] = "2026-10-07T00:00:00+00:00"
        profile = provider.get_company_profile(cik10, submissions)
        metadata = provider.get_filing_metadata(cik10, submissions)
        raw = list(provider.iter_raw_facts(facts, availability=build_availability_map(metadata), forms=PERIODIC_FORMS))
        calendar = FiscalCalendar.from_raw_facts(cik10, raw, fiscal_year_end_hint=profile.fiscal_year_end)
        result = normalize_company(cik10, raw, registry, profile=profile, filing_metadata=metadata, calendar=calendar)
        resolver = PeriodResolver(result.factbook, registry)
        years = sorted({fy for metric in METRICS.values() for fy in result.factbook.fiscal_years(metric)} - {None})
        record = {key: [] for key in METRICS}
        for key, metric in METRICS.items():
            seen = set()
            for fiscal_year in years:
                grid = resolver.quarter_grid(metric, fiscal_year, FAR, POLICY_ORIGINAL)
                for index in range(1, 5):
                    obs = grid.get(index)
                    if obs is None or obs.period_end is None:
                        continue
                    end = str(obs.period_end)[:10]
                    if end in seen:
                        continue
                    seen.add(end)
                    prov = getattr(obs, "provenance", None)
                    transformation = getattr(prov, "transformation", "AS_REPORTED")
                    derived = 0 if transformation == "AS_REPORTED" else 1
                    record[key].append([end, obs.value, available_date(obs), getattr(prov, "accession", None),
                                        getattr(prov, "form", None), derived, getattr(prov, "concept", None),
                                        available_date(obs) if derived else None])
            record[key].sort(key=lambda row: row[0])
        out[str(int(cik))] = record
        print(f"cik {cik} exported", flush=True)
    json.dump({"schema": "vu-sepa-fund-from-quant-core-1.0.0", "source": "SEC companyfacts + submissions via scripts/quant/sec (P1)",
               "policy": "POLICY_ORIGINAL (Erstmeldung) mit Erstverfuegbarkeit", "byCik": out}, open(out_path, "w"))


if __name__ == "__main__":
    main()
