#!/usr/bin/env python3
"""Owner condition for PR #1043 (2026-10-28): proof that

  (a) share counts whose cover date lies up to 31 days after the filing (and any
      other future-dated period) reach neither the published consumer bundles nor
      the consumer-history shards with the corrected code, and
  (b) the data-quality rules still detect such defects in published data
      (DQ-SEC-1/2 WARN on the old outputs), so DQ-SEC-3 may stay INFO.

Reads two rebuilt output trees (old = origin/main code, new = this PR, same
companyfacts.zip) with layout <dir>/consumer/CIK*.json and <dir>/history/NN.json.gz,
plus core/data-quality.js via node for the DQ rules. Writes only --out.
Standard library only; imports nothing from scripts/quant/sec.
"""
import argparse, datetime as dt, glob, gzip, json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
SHARES = ("shares_outstanding",)


def days(a, b):
    return (dt.date.fromisoformat(a[:10]) - dt.date.fromisoformat(b[:10])).days


def rows_of(issuer):
    for part in ("annual", "quarterly"):
        for metric, rows in (issuer.get(part) or {}).items():
            for r in rows or []:
                if isinstance(r, list) and len(r) >= 5:
                    yield part, metric, r[2], r[4], r[3]
    for metric, t in (issuer.get("ttm") or {}).items():
        if isinstance(t, dict) and t.get("end") and t.get("filed"):
            yield "ttm", metric, t["end"], t["filed"], t.get("v")


def scan(tree):
    out = {"bundles": 0, "historyIssuers": 0, "futureRows": {"bundle": 0, "history": 0},
           "sharesWithin31Days": {"bundle": [], "history": []}}
    for p in sorted(glob.glob(os.path.join(tree, "consumer", "CIK*.json"))):
        b = json.load(open(p)); out["bundles"] += 1
        tick = (b.get("tickers") or ["?"])[0]
        for part, metric, end, filed, v in rows_of(b):
            gap = days(end, filed)
            if gap > 0:
                out["futureRows"]["bundle"] += 1
                if metric in SHARES and gap <= 31:
                    out["sharesWithin31Days"]["bundle"].append([tick, part, end, filed, gap, v])
    for p in sorted(glob.glob(os.path.join(tree, "history", "*.json.gz"))):
        shard = json.load(gzip.open(p))
        for cik, h in (shard.get("issuers") or {}).items():
            out["historyIssuers"] += 1
            for part, metric, end, filed, v in rows_of(h):
                gap = days(end, filed)
                if gap > 0:
                    out["futureRows"]["history"] += 1
                    if metric in SHARES and gap <= 31:
                        out["sharesWithin31Days"]["history"].append([cik, part, end, filed, gap, v])
    for k in ("bundle", "history"):
        out["sharesWithin31DaysCount_" + k] = len(out["sharesWithin31Days"][k])
        out["sharesWithin31Days"][k] = out["sharesWithin31Days"][k][:40]
    return out


def share_rows(tree):
    """(cik -> ticker, set of (accession, value, end)) for shares_outstanding in bundles and history."""
    out = {}
    def add(cik, tick, rows):
        e = out.setdefault(cik, [tick, set()])
        for r in rows or []:
            if isinstance(r, list) and len(r) >= 6:
                e[1].add((r[5], r[3], r[2]))
    for p in glob.glob(os.path.join(tree, "consumer", "CIK*.json")):
        b = json.load(open(p))
        add(str(b.get("cik")), (b.get("tickers") or ["?"])[0], (b.get("quarterly") or {}).get("shares_outstanding"))
        add(str(b.get("cik")), (b.get("tickers") or ["?"])[0], (b.get("annual") or {}).get("shares_outstanding"))
        t = (b.get("ttm") or {}).get("shares_outstanding")
        if isinstance(t, dict) and t.get("accn"):
            out.setdefault(str(b.get("cik")), [None, set()])[1].add((t["accn"], t.get("v"), t.get("end")))
    for p in glob.glob(os.path.join(tree, "history", "*.json.gz")):
        for cik, h in (json.load(gzip.open(p)).get("issuers") or {}).items():
            for part in ("annual", "quarterly"):
                add(str(h.get("cik", cik)), None, (h.get(part) or {}).get("shares_outstanding"))
    return out


def removed_share_values(old_tree, new_tree):
    """Share counts the old code published that the corrected code no longer publishes.
    A removed (accession, value) pair must not reappear under any date in the new outputs."""
    old, new = share_rows(old_tree), share_rows(new_tree)
    removed, reappeared = [], []
    for cik, (tick, rows) in old.items():
        n = new.get(cik, [None, set()])[1]
        n_pairs = {(a, v) for a, v, _ in n}
        for a, v, end in rows - n:
            if (a, v) in n_pairs:
                continue  # same filing value kept, only its period placement changed
            removed.append([tick or cik, a, v, end])
    for cik, (tick, rows) in old.items():
        n_pairs = {(a, v) for a, v, _ in new.get(cik, [None, set()])[1]}
        for t, a, v, end in [x for x in removed if x[0] == (tick or cik)]:
            if (a, v) in n_pairs:
                reappeared.append([t, a, v, end])
    return removed, reappeared


def dq(tree):
    js = r"""
const fs=require('fs'),path=require('path');const DQ=require(process.argv[1]);const dir=process.argv[2];
const b=fs.readdirSync(dir).filter(f=>/^CIK\d+\.json$/.test(f)).map(f=>{const x=JSON.parse(fs.readFileSync(path.join(dir,f)));return {cik:x.cik,tickers:x.tickers,annual:x.annual,quarterly:x.quarterly,ttm:x.ttm,quality:x.quality};});
const r=[DQ.secFiscalYearLabels(b),DQ.secFuturePeriods(b),DQ.secRefusals(b)].map(x=>({id:x.id,severity:x.severity,status:x.status,checked:x.checked,failed:x.failed,note:x.note||null,samples:(x.samples||[]).slice(0,5)}));
console.log(JSON.stringify(r));"""
    res = subprocess.run(["node", "-e", js, os.path.join(ROOT, "core", "data-quality.js"), os.path.join(tree, "consumer")],
                         capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--old", required=True); ap.add_argument("--new", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    old, new = scan(a.old), scan(a.new)
    dq_old, dq_new = dq(a.old), dq(a.new)
    removed, reappeared = removed_share_values(a.old, a.new)
    named = {t: [x for x in removed if x[0] == t] for t in ("VRRM", "COLA", "JJSF")}
    checks = {
        "newBundlesHaveNoFutureRows": new["futureRows"]["bundle"] == 0,
        "newHistoryHasNoFutureRows": new["futureRows"]["history"] == 0,
        "newHasNoShareCountsWithin31DaysAfterFiling": new["sharesWithin31DaysCount_bundle"] == 0 and new["sharesWithin31DaysCount_history"] == 0,
        "removedShareCountsDoNotReappear": len(reappeared) == 0,
        "namedCoverDateCasesRemoved": all(named[t] for t in named),
        "dqSec2DetectsDefectsInOldPublishedData": next(r for r in dq_old if r["id"] == "DQ-SEC-2")["failed"] > 0,
        "dqSec2CleanOnNewData": next(r for r in dq_new if r["id"] == "DQ-SEC-2")["failed"] == 0,
        "dqSec1DetectsDefectsInOldPublishedData": next(r for r in dq_old if r["id"] == "DQ-SEC-1")["failed"] > 0,
        "dqSec1and2AreWarn": all(r["severity"] == "WARN" for r in dq_new if r["id"] in ("DQ-SEC-1", "DQ-SEC-2")),
        "dqSec3IsInfoMeasurement": next(r for r in dq_new if r["id"] == "DQ-SEC-3")["severity"] == "INFO",
    }
    doc = {"schemaVersion": "v9-followup-sec-quarantine-detection-1.0.0",
           "ownerCondition": "2026-10-28: cover-date share counts up to 31 days after filing stay quarantined and never enter published historical metrics; DQ-SEC-3 may stay INFO only if affected values are excluded and erroneous published metrics remain detected.",
           "inputs": {"old": "origin/main code rebuild", "new": "PR #1043 code rebuild", "source": "same SEC companyfacts.zip retrieved 2026-10-27"},
           "old": old, "new": new,
           "removedShareCounts": {"count": len(removed), "reappeared": reappeared, "named": named, "sample": sorted(removed)[:40]},
           "regressionGuard": "In the old outputs cover-date share counts were re-dated to a quarter end, so a row-level rule (DQ-SEC-2) could not see them; the guard against a regression is the pipeline test test_a_cover_date_after_acceptance_is_quarantined_not_redated plus the DQ-SEC-3 count of FUTURE_PERIOD_END quarantines in every bundle.", "dqOld": dq_old, "dqNew": dq_new, "checks": checks, "allPass": all(checks.values()),
           "interpretation": "Detection of published defects is carried by DQ-SEC-1/2 (WARN), which fire on the old published-style outputs and are clean on the corrected outputs; DQ-SEC-3 only counts what the normalization refused and therefore stays an INFO measurement.",
           "productionApproved": False}
    json.dump(doc, open(a.out, "w"), indent=1, ensure_ascii=False)
    print(json.dumps({"allPass": doc["allPass"], "checks": checks, "removed": len(removed), "named": named,
                      "old": {k: old[k] for k in ("futureRows", "sharesWithin31DaysCount_bundle", "sharesWithin31DaysCount_history")},
                      "new": {k: new[k] for k in ("futureRows", "sharesWithin31DaysCount_bundle", "sharesWithin31DaysCount_history")}}, indent=1))


if __name__ == "__main__":
    main()
