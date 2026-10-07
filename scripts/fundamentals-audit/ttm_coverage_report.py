"""TTM-Abdeckung mit Semantik (Auftrag Abschnitt 19): je Emittent und Kennzahl, ob der Kern ein CURRENT_TTM hat und
sonst warum nicht (Grund des Kerns). Daneben EPS_FY und EPS_LATEST_QUARTER, damit sichtbar ist, was statt eines TTM
vorliegt - ohne es als TTM zu zaehlen.
  python3 ttm_coverage_report.py <companyfacts.zip> <ciks.json> <out.jsonl> [--shard i/n] [--as-of 2026-10-05]
"""
import json
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "scripts"))

from quant.sec.fiscal import FiscalCalendar  # noqa: E402
from quant.sec.normalize import normalize_company  # noqa: E402
from quant.sec.periods import PeriodResolver  # noqa: E402
from quant.sec.provider import PERIODIC_FORMS, SECProvider  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402

METRICS = ("eps_diluted", "eps_basic", "revenue", "net_income")


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
            raw = list(provider.iter_raw_facts(json.loads(zf.read(f"CIK{cik}.json")), availability={}, forms=PERIODIC_FORMS))
            if not raw:
                continue
            calendar = FiscalCalendar.from_raw_facts(cik, raw)
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
