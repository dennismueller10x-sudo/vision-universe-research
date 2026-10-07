"""Audit-Harness: fuehrt die Quant-SEC-Kernschicht (P1, unveraendert) auf lokal gespeicherten SEC-Rohdaten aus.

Liefert je Quartal (Periodenende aus der Ground Truth) und Kennzahl, was die Kernschicht zu einem Stichtag sieht:
  at_known  : Wert mit Politik AS_OF_LATEST am Ground-Truth-Erstmeldedatum (Tagesende)
  before    : Wert am Vortag (muss fehlen, sonst FALSE_AVAILABLE)
  original  : Erstmeldung (POLICY_ORIGINAL, as_of weit in der Zukunft) mit available_from
  latest    : spaetester Stand (AS_OF_LATEST, as_of weit in der Zukunft)
Nur Lesen; keine Aenderung an der Pipeline. Aufruf:
  python3 scripts/fundamentals-audit/quant_core_dump.py <issuers.json> <cf-dir> <sub-dir> <gt.jsonl> <out.jsonl>
"""
import gzip
import json
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import build_availability_map, normalize_company  # noqa: E402
from quant.sec.periods import PeriodResolver  # noqa: E402
from quant.sec.provider import PERIODIC_FORMS, SECProvider  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402
from quant.sec.restatements import POLICY_AS_OF_LATEST, POLICY_ORIGINAL  # noqa: E402

METRICS = {"EPS_DILUTED": "eps_diluted", "REVENUE": "revenue", "NET_INCOME": "net_income", "EPS_BASIC": "eps_basic"}
FAR = "2099-12-31"


def load_gz(path):
    with gzip.open(path, "rt") as handle:
        return json.load(handle)


def submissions_with_history(sub_dir, cik10):
    payload = load_gz(sub_dir / f"CIK{cik10}.json.gz")
    for page in (payload.get("filings", {}) or {}).get("files", []) or []:
        extra_path = sub_dir / (page["name"] + ".gz")
        if not extra_path.exists():
            continue
        extra = load_gz(extra_path)
        recent = payload["filings"]["recent"]
        for column, values in extra.items():
            recent.setdefault(column, [])
            recent[column].extend(values)
    return payload


def obs_view(obs):
    if obs is None:
        return None
    return {"value": obs.value, "available_from": str(obs.available_from)[:19] if obs.available_from else None,
            "filed": str(obs.filed) if obs.filed else None, "period_end": str(obs.period_end) if obs.period_end else None,
            "concept": getattr(getattr(obs, "provenance", None), "concept", None),
            "accession": getattr(getattr(obs, "provenance", None), "accession", None),
            "transformation": getattr(getattr(obs, "provenance", None), "transformation", None)}


def main():
    issuers_path, cf_dir, sub_dir, gt_path, out_path = sys.argv[1:6]
    cf_dir, sub_dir = Path(cf_dir), Path(sub_dir)
    registry = MetricRegistry.load()
    provider = SECProvider.__new__(SECProvider)  # nur reine Funktionen (keine HTTP-Nutzung)
    gt_by_cik = {}
    with open(gt_path) as handle:
        for line in handle:
            row = json.loads(line)
            gt_by_cik.setdefault(row["cik"], []).append(row)
    out = open(out_path, "w")
    for ticker, cik, *_ in json.load(open(issuers_path)):
        cik10 = str(cik).zfill(10)
        cf_path = cf_dir / f"CIK{cik10}.json.gz"
        if not cf_path.exists() or not (sub_dir / f"CIK{cik10}.json.gz").exists():
            continue
        company_facts = load_gz(cf_path)
        company_facts["_retrieved_at"] = "2026-10-07T00:00:00+00:00"
        submissions = submissions_with_history(sub_dir, cik10)
        submissions["_retrieved_at"] = "2026-10-07T00:00:00+00:00"
        profile = provider.get_company_profile(cik10, submissions)
        filing_metadata = provider.get_filing_metadata(cik10, submissions)
        availability = build_availability_map(filing_metadata)
        raw_facts = list(provider.iter_raw_facts(company_facts, availability=availability, forms=PERIODIC_FORMS))
        calendar = FiscalCalendar.from_raw_facts(cik10, raw_facts, fiscal_year_end_hint=profile.fiscal_year_end)
        result = normalize_company(cik10, raw_facts, registry, profile=profile, filing_metadata=filing_metadata, calendar=calendar)
        resolver = PeriodResolver(result.factbook, registry)
        for gt in gt_by_cik.get(int(cik), []):
            metric = METRICS.get(gt["concept"])
            if not metric:
                continue
            fy = calendar.fiscal_year_for(gt["end"])
            qi = calendar.quarter_index(gt["end"])
            rec = {"ticker": ticker, "cik": int(cik), "concept": gt["concept"], "end": gt["end"], "fy": fy, "q": qi}
            if fy is None or qi is None:
                rec["status"] = "UNPLACEABLE"
                out.write(json.dumps(rec) + "\n")
                continue
            known = gt["known_from"]
            before = (date.fromisoformat(known) - timedelta(days=1)).isoformat()
            def grid(as_of, policy):
                try:
                    return resolver.quarter_grid(metric, fy, as_of, policy).get(qi)
                except Exception as exc:  # noqa: BLE001 - audit records failures
                    rec.setdefault("errors", []).append(str(exc)[:200])
                    return None
            rec["at_known"] = obs_view(grid(known, POLICY_AS_OF_LATEST))
            rec["before"] = obs_view(grid(before, POLICY_AS_OF_LATEST))
            rec["original"] = obs_view(grid(FAR, POLICY_ORIGINAL))
            rec["latest"] = obs_view(grid(FAR, POLICY_AS_OF_LATEST))
            out.write(json.dumps(rec) + "\n")
        print(f"{ticker} done", flush=True)
    out.close()


if __name__ == "__main__":
    main()
