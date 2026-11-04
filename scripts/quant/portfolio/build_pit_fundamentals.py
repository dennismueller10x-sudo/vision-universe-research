"""Point-in-Time-Fundamentaldaten für den Portfolio-Baukasten (Forschung, nicht zertifiziert).

Baut je CIK ein Consumer-Bündel mit der Lesart ORIGINAL (Wert wie ERSTMALS eingereicht, mit dessen Einreichungsdatum;
scripts/quant/sec/restatements.py). Die committeten Bündel unter quant/data/sec/consumer tragen dagegen die zuletzt
eingereichte Fassung (Verzug im Mittel rund 600 Tage) und taugen deshalb kaum für historische Stichtage.

Quelle: SEC EDGAR companyfacts (öffentlich), wahlweise das Sammelarchiv companyfacts.zip (--bulk / --archive).
SIC je CIK aus den SEC-Submissions (nur für CIKs ohne SIC im Issuer-Verzeichnis, also vor allem delistete Titel).
Ausgabe nur nach --out (außerhalb des Repositorys vorgesehen), nie nach quant/data.

  python3 scripts/quant/portfolio/build_pit_fundamentals.py --out DIR [--universe product,delisted] [--bulk | --archive ZIP]
                                                            [--delisted-register docs/quant-recovery/v13/delisted/register-1.0.0.json]
                                                            [--limit N] [--ciks c1,c2]
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from quant.sec.consumer import build_consumer_bundle, load_product_universe_ciks  # noqa: E402
from quant.sec.provider import SECProvider, normalize_cik  # noqa: E402
from quant.sec.registry import MetricRegistry  # noqa: E402
from quant.sec.restatements import POLICY_ORIGINAL  # noqa: E402

VERSION = "pit-fundamentals-1.0.0"


def issuer_sic(root):
    out = {}
    for f in sorted((root / "quant/data/fundamentals/issuers").glob("*.json")):
        for row in json.loads(f.read_text(encoding="utf-8"))["issuers"]:
            if row.get("cik") and row.get("sic"):
                out[normalize_cik(row["cik"])] = str(row["sic"])
    return out


def delisted_ciks(register_file):
    reg = json.loads(Path(register_file).read_text(encoding="utf-8"))
    ix = {c: i for i, c in enumerate(reg["columns"])}
    out = {}
    for r in reg["rows"]:
        if r[ix["status"]] != "QUALIFIED" or not r[ix["cik"]]:
            continue
        out.setdefault(normalize_cik(r[ix["cik"]]), []).append("dl_" + r[ix["chainId"]])
    return out


_REGISTRY = None


def build_one(cik, payload, entry, annual_years):
    """Ein Bündel (JSON-Text) oder ein Fehlercode. Läuft auch in einem Unterprozess."""
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = MetricRegistry.load()
    try:
        bundle = build_consumer_bundle(cik, payload, _REGISTRY, policy=POLICY_ORIGINAL, annual_years=annual_years,
                                       tickers=entry["tickers"], security_ids=entry["securityIds"], name=entry["name"])
    except Exception as exc:  # noqa: BLE001 - ein Emittent darf den Lauf nicht stoppen
        return "ERR", type(exc).__name__
    if bundle is None:
        return "ERR", "NO_PERIODIC_FACTS"
    return "OK", json.dumps(bundle, separators=(",", ":"))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--universe", default="product,delisted")
    ap.add_argument("--names", default=str(ROOT / "quant/data/market/security-master/company-names.json"))
    ap.add_argument("--delisted-register", default=str(ROOT / "docs/quant-recovery/v13/delisted/register-1.0.0.json"))
    ap.add_argument("--bulk", action="store_true")
    ap.add_argument("--archive", default=None)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ciks", default="")
    ap.add_argument("--annual-years", type=int, default=25)
    ap.add_argument("--workers", type=int, default=1)
    args = ap.parse_args(argv)
    out = Path(args.out).resolve()
    if ROOT in out.parents or out == ROOT:
        if (ROOT / "quant/data") in out.parents or out == ROOT / "quant/data":
            raise SystemExit("--out darf nicht unter quant/data liegen")
    out.mkdir(parents=True, exist_ok=True)
    parts = set(args.universe.split(","))
    wanted = {}
    if "product" in parts:
        by_cik, _ = load_product_universe_ciks(Path(args.names))
        for cik, e in by_cik.items():
            wanted[cik] = {"tickers": e["tickers"], "securityIds": list(e["securityIds"]), "name": e["name"]}
    if "delisted" in parts:
        for cik, ids in delisted_ciks(args.delisted_register).items():
            e = wanted.setdefault(cik, {"tickers": [], "securityIds": [], "name": None})
            e["securityIds"].extend(ids)
    if args.ciks:
        keep = {normalize_cik(c) for c in args.ciks.split(",")}
        wanted = {c: e for c, e in wanted.items() if c in keep}
    ciks = sorted(wanted)
    if args.limit:
        ciks = ciks[: args.limit]
    provider = SECProvider()
    sics = issuer_sic(ROOT)
    if args.bulk or args.archive:
        source = provider.iter_bulk_company_facts(ciks=ciks, archive_path=args.archive)
    else:
        def one_by_one():
            for c in ciks:
                try:
                    yield c, provider.get_company_facts(c)
                except Exception as exc:  # noqa: BLE001 - z. B. 404 ohne XBRL-Fakten
                    yield c, exc
        source = one_by_one()
    index, failures = {}, []

    def done(cik, result):
        kind, value = result
        if kind != "OK":
            failures.append({"cik": cik, "error": value})
            return
        (out / f"CIK{cik}.json").write_text(value, encoding="utf-8")
        index[cik] = {"securityIds": wanted[cik]["securityIds"], "sic": sics.get(cik)}

    jobs = ((cik, payload) for cik, payload in source if cik in wanted)
    if args.workers > 1:
        from concurrent.futures import ProcessPoolExecutor
        pending = {}
        with ProcessPoolExecutor(max_workers=args.workers) as pool:
            for cik, payload in jobs:
                if isinstance(payload, Exception):
                    done(cik, ("ERR", "FETCH_" + type(payload).__name__))
                    continue
                pending[pool.submit(build_one, cik, payload, wanted[cik], args.annual_years)] = cik
                if len(pending) >= 4 * args.workers:
                    for f in [f for f in pending if f.done()] or [next(iter(pending))]:
                        done(pending.pop(f), f.result())
            for f, cik in list(pending.items()):
                done(cik, f.result())
    else:
        for cik, payload in jobs:
            done(cik, ("ERR", "FETCH_" + type(payload).__name__) if isinstance(payload, Exception) else build_one(cik, payload, wanted[cik], args.annual_years))
    # SIC für CIKs ohne Issuer-Eintrag (delistete Titel) aus den Submissions.
    missing = [c for c in sorted(index) if not index[c]["sic"]]
    for cik in missing:
        try:
            sub = provider.get_submissions(cik, include_history=False)
            index[cik]["sic"] = str(sub.get("sic") or "") or None
        except Exception:  # noqa: BLE001
            index[cik]["sic"] = None
    summary = {"schemaVersion": VERSION, "policy": POLICY_ORIGINAL, "requested": len(ciks), "written": len(index),
               "failures": len(failures), "failureKinds": sorted({f["error"] for f in failures}),
               "sicFromSubmissions": len(missing), "sicMissing": sum(1 for v in index.values() if not v["sic"])}
    (out / "index.json").write_text(json.dumps({**summary, "issuers": index}, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
