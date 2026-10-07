"""Echter SEC-companyfacts-Auszug als Regressions-Fixture: alle von der Metrik-Registry gemappten Konzepte
(us-gaap, ifrs-full, dei) eines Emittenten mit Periodenende ab einem Datum. Nur oeffentliche SEC-Daten.
  python3 make_fixture.py <companyfacts.zip> <cik> <since YYYY-MM-DD> <out.json> [--until YYYY-MM-DD] [--include REGEX]
--include: zusaetzlich nicht gemappte Konzepte (der Fiskalkalender liest ALLE Fakten, z. B. Steuersatz-Angaben
fuer Kalenderjahre - Hovnanian; ohne sie baut das Fixture einen anderen Kalender als die Vollquelle).
"""
import re
import json
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "scripts"))
from quant.sec.registry import MetricRegistry  # noqa: E402


def main():
    archive, cik, since, out_path = sys.argv[1:5]
    until = sys.argv[sys.argv.index("--until") + 1] if "--until" in sys.argv else "9999-12-31"
    include = re.compile(sys.argv[sys.argv.index("--include") + 1]) if "--include" in sys.argv else None
    registry = MetricRegistry.load()
    cf = json.loads(zipfile.ZipFile(archive).read(f"CIK{str(cik).zfill(10)}.json"))
    out = {"cik": cf["cik"], "entityName": cf.get("entityName"),
           "_source": f"SEC companyfacts (companyfacts.zip Stand 2026-10-07), registry-gemappte Konzepte, Periodenende {since} bis {until}",
           "facts": {}}
    for taxonomy, concepts in (cf.get("facts") or {}).items():
        for concept, body in concepts.items():
            if not registry.metrics_for_concept(taxonomy, concept) and not (include and include.search(concept)):
                continue
            units = {u: [r for r in rows if since <= r["end"] <= until] for u, rows in body.get("units", {}).items()}
            units = {u: r for u, r in units.items() if r}
            if units:
                out["facts"].setdefault(taxonomy, {})[concept] = {"label": body.get("label"), "units": units}
    Path(out_path).write_text(json.dumps(out, separators=(",", ":")))
    print(out_path, sum(len(r) for t in out["facts"].values() for b in t.values() for r in b["units"].values()), "Fakten")


if __name__ == "__main__":
    main()
