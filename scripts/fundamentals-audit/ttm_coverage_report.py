"""TTM-Abdeckung mit Semantik (Auftrag Abschnitt 19): je Emittent und Kennzahl, ob der Kern ein CURRENT_TTM hat und
sonst warum nicht (Grund des Kerns). Daneben EPS_FY und EPS_LATEST_QUARTER, damit sichtbar ist, was statt eines TTM
vorliegt - ohne es als TTM zu zaehlen.
  python3 ttm_coverage_report.py <companyfacts.zip> <ciks.json> <out.jsonl> [--shard i/n] [--as-of 2026-10-05]
                                 [--scripts-root <pfad>]   (anderer Kernstand, z. B. ein ausgecheckter Vorgaenger)
Kalender und Werte wie pipeline.py/consumer.py (provider.fundamental_facts; aeltere Kerne: CALENDAR_FORMS/PERIODIC_FORMS).
"""
import json
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
scripts_root = sys.argv[sys.argv.index("--scripts-root") + 1] if "--scripts-root" in sys.argv else str(root / "scripts")
sys.path.insert(0, scripts_root)

from quant.sec import provider as provider_module  # noqa: E402
from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import normalize_company  # noqa: E402
from quant.sec.periods import PeriodResolver  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402

SECProvider = provider_module.SECProvider


def split_facts(provider, payload):
    if hasattr(provider_module, "fundamental_facts"):
        return provider_module.fundamental_facts(provider, payload)
    forms = getattr(provider_module, "CALENDAR_FORMS", provider_module.PERIODIC_FORMS)
    everything = list(provider.iter_raw_facts(payload, availability={}, forms=forms))
    return everything, [f for f in everything if f.form in provider_module.PERIODIC_FORMS]

METRICS = ("eps_diluted", "eps_basic", "revenue", "net_income")


def main():
    archive, ciks_path, out_path = sys.argv[1:4]
    shard = sys.argv[sys.argv.index("--shard") + 1] if "--shard" in sys.argv else "0/1"
    as_of = sys.argv[sys.argv.index("--as-of") + 1] if "--as-of" in sys.argv else "2026-10-05"
    i, n = (int(x) for x in shard.split("/"))
    ciks = [c for k, c in enumerate(sorted(json.load(open(ciks_path)))) if k % n == i]
    registry = MetricRegistry.load(str(root / "quant" / "config" / "sec-metric-registry.json"))
    provider = SECProvider.__new__(SECProvider)
    zf = zipfile.ZipFile(archive)
    names = set(zf.namelist())
    with open(out_path, "w") as out:
        for cik in ciks:
            if f"CIK{cik}.json" not in names:
                continue
            everything, raw = split_facts(provider, json.loads(zf.read(f"CIK{cik}.json")))
            if not raw:
                continue
            calendar = FiscalCalendar.from_raw_facts(cik, everything)
            resolver = PeriodResolver(normalize_company(cik, raw, registry, calendar=calendar).factbook, registry)
            rec = {"cik": cik}
            for metric in METRICS:
                fact = resolver.ttm(metric, as_of)
                rec[metric] = {"ttm": fact.value if fact.available else None,
                               "reason": None if fact.available else fact.reason,
                               "end": str(fact.period_end)[:10] if fact.available else None,
                               "flags": [f for f in fact.flags if f.startswith("TTM_CONCEPT_ALIGNED")]}
                if metric.startswith("eps"):
                    quarters = resolver.latest_quarters(metric, as_of, count=1)
                    rec[metric]["latestQuarterEnd"] = str(quarters[0][2].period_end)[:10] if quarters else None
            out.write(json.dumps(rec) + "\n")


if __name__ == "__main__":
    main()
