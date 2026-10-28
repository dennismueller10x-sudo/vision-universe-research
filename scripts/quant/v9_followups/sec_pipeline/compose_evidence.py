#!/usr/bin/env python3
"""V9-Folgearbeit SEC-Pipeline: kompakte Evidenz aus den privaten Laufergebnissen.

Liest die Ausgaben von before-after.mjs, independent_check.py und der
DQ-SEC-Auswertung (alle privat) und schreibt EINE kleine Datei (--out).

  python3 -I compose_evidence.py --before-after <json> --independent <json> --dq <json>
          --companyfacts-sha256 <hex> --out docs/quant-recovery/v9-followups/sec-pipeline/before-after.json
"""
import argparse
import hashlib
import json
import pathlib

V9_CLAIMS = {
    "STX": "marketCap 137,008,764,839 -> 146,006,664,941; netDebtToAssets 0.416667 -> 0.1904",
    "PRTH": "marketCap null (NO_PIT_SHARE_COUNT) -> computable, shares 82,440,372; revenueGrowthTtmYoy -0.0106 -> 0.0891",
    "WTBA": "marketCap null (NO_PIT_SHARE_COUNT) -> computable, shares 17,043,743",
    "ASLE": "shares 52,990,947 (cover date 2034-03-05) -> 47,726,763; marketCap 249,587,360 -> 224,793,054",
    "AXR": "shares 5,271,309 (cover date 2033-09-12) -> 5,324,849",
    "AAL": "shares 661,969,951 (cover date 2027-07-17) -> 661,936,666",
}


def main():
    ap = argparse.ArgumentParser()
    for name in ("before-after", "independent", "dq", "companyfacts-sha256", "out"):
        ap.add_argument("--" + name, required=True)
    a = ap.parse_args()
    ba = json.loads(pathlib.Path(a.before_after).read_text())
    ic = json.loads(pathlib.Path(a.independent).read_text())
    dq = json.loads(pathlib.Path(a.dq).read_text())

    published, counter_only, quality_only = [], [], []
    for row in ba["issuers"]:
        if "cik" not in row:
            continue
        if row.get("qualityBlockOnly"):
            quality_only.append(row["cik"])
            continue
        r = row["rows"]
        if r["removed"] + r["added"] + r["changed"] == 0:
            counter_only.append(row["cik"])        # coverage.mapped count or a ttm concept label, no value
            continue
        pf = row.get("publishedFacing") or {}
        published.append({k: v for k, v in {
            "cik": row["cik"], "tickers": row["tickers"][:3], "quality": row["quality"],
            "annualYears": row.get("annualYears"), "latestQuarter": row.get("latestQuarter"),
            "rows": row["rows"], "shares": pf.get("shares"), "marketCap": pf.get("marketCap"),
            "publishedNow": pf.get("publishedNow"), "cutoff": pf.get("cutoff"), "close": pf.get("close"),
            "rawsChanged": pf.get("rawsChanged") or {},
            "v9Claim": V9_CLAIMS.get((row["tickers"] or [None])[0]),
        }.items() if v is not None})

    out = {
        "schemaVersion": "v9-followup-sec-pipeline-evidence-1.0.0",
        "productionApproved": False,
        "topic": "V9 SEC/PIT P1-P4 (fiscal-year anchor bound, future-period quarantine, no bulk acceptance, DQ rules)",
        "inputs": {
            "companyfactsZipSha256": a.companyfacts_sha256,
            "companyfactsZipSource": "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip (retrieved 2026-10-27, V9 private bulk)",
            "asOf": "2026-10-26",
            "build": "scripts/quant/cli.py consumer --archive <zip> --as-of 2026-10-26 --out <private>, run once with "
                     "origin/main SEC code (old) and once with this branch (new); no FSDS supplement, no issuer facts "
                     "(the producer adds both; they do not interact with P1/P2)",
        },
        "scripts": {
            "beforeAfter": {"path": ba["generatedBy"], "sha256": ba["codeSha256"]},
            "independentCheck": {"path": ic["generatedBy"], "sha256": ic["codeSha256"]},
            "composer": {"path": "scripts/quant/v9_followups/sec_pipeline/compose_evidence.py",
                         "sha256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()},
        },
        "totals": ba["totals"],
        "bundleChangeSummary": {
            "bundles": ba["totals"]["bundlesNew"],
            "everyBundle": "versions.normalization_logic 1.13.0 -> 1.14.0, versions.quality_rules 1.0.0 -> 1.1.0 "
                           "(generatedAtUtc changes on every run anyway)",
            "contentChanged": ba["totals"]["contentChanged"],
            "publishedRowsChanged": len(published),
            "noValueChange": len(counter_only),
            "noValueChangeMeans": "only coverage.mapped (number of mapped facts) or, for NIXX and RVPH, the concept label of an unchanged ttm share count (dei cover value quarantined, us-gaap balance-sheet value of the same date used)",
            "qualityBlockOnly": len(quality_only),
            "historyIssuersChanged": ba["totals"]["historyChanged"],
        },
        "issuersWithPublishedRowChanges": published,
        "noValueChangeCiks": counter_only,
        "qualityBlockOnlyCiks": quality_only,
        "historyChanged": ba["historyChanged"],
        "dataQuality": {k: {rule: {"failed": v["failed"], "checked": v["checked"],
                                   **({"samples": v["samples"][:5]} if rule != "DQ-SEC-3" else {"note": v["note"]})}
                            for rule, v in rules.items()} for k, rules in dq.items()},
        "independentCheck": {"importsPipeline": ic["importsPipeline"], "scope": ic["scope"], "tally": ic["tally"],
                             "mismatches": ic["mismatches"], "p1LabelEffect": ic["p1LabelEffect"]},
        "productionEffectAfterMerge": {
            "committedInThisPr": "no file under quant/data, discover/data or any other producer tree",
            "secConsumerFundamentals": ".github/workflows/sec-consumer-fundamentals.yml (cron Mon 07:30 UTC or dispatch) "
                                       "rewrites quant/data/sec/consumer/CIK*.json (all: versions; content as above), "
                                       "consumer/index.json, consumer-history/*.json.gz (shards of the changed issuers), "
                                       "consumer_coverage.json (new block secQuality), then discover/data "
                                       "(build-discover-data.mjs) and the capability matrix/projection",
            "productIntelligence": ".github/workflows/product-intelligence-materialization.yml (build-factor-evidence.mjs) "
                                   "then carries the new shares/marketCap/raw factor inputs into "
                                   "quant/data/product/factor-evidence-v1 for the issuers listed above",
            "factbookPipeline": "update-sec-fundamentals.yml (cron Mon 06:00 UTC) and sec-fundamentals-daily.yml "
                                "re-normalize every stored factbook they touch, because the version stamp moved "
                                "(pipeline._is_current); their canonical/inspector outputs change accordingly",
        },
    }
    path = pathlib.Path(a.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(path, path.stat().st_size)


if __name__ == "__main__":
    main()
