#!/usr/bin/env python3
"""V10 corporate actions: agreement table (read only after the 1.1.2 verdicts were frozen).

Per event: protocol 1.1.2 verdict vs protocol 1.0.0 verdict (docs/quant-recovery/v9-followups/ca-registry/verdicts.json).
Per series of the 81 V9 dry-run cases (docs/quant-recovery/v9/corporate-actions/ca-dryrun.json newlyQualified): 1.1.2 outcome, each case
individually. stdlib only.
  python3 -I scripts/quant/v10/corporate-actions/compare_verdicts.py --root . --out docs/quant-recovery/v10/corporate-actions/agreement.json
"""
import argparse
import collections
import hashlib
import json
import os

ADM = {"GENUINE_MOVE", "SPINOFF_DISTRIBUTION"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    j = lambda p: json.load(open(os.path.join(a.root, p)))
    new = j("docs/quant-recovery/v10/corporate-actions/verdicts.json")
    old = j("docs/quant-recovery/v9-followups/ca-registry/verdicts.json")
    dry = j("docs/quant-recovery/v9/corporate-actions/ca-dryrun.json")
    n = {(r[0], r[1]): r for r in new["rows"]}
    o = {(r[0], r[1]): r for r in old["rows"]}
    trans = collections.Counter()
    changed = []
    for k in sorted(n):
        ov, nv = o[k][3], n[k][3]
        trans[ov + " -> " + nv] += 1
        if (ov in ADM) != (nv in ADM):
            changed.append({"securityId": k[0], "week": k[1], "v100": ov, "v112": nv, "detail112": n[k][4]})
    by_series = collections.defaultdict(list)
    for r in new["rows"]:
        by_series[r[0]].append(r)
    adm_new = set(new["admissibleSeries"])
    cases = []
    for c in dry["newlyQualified"]:
        rs = by_series.get(c["id"], [])
        cases.append({"securityId": c["id"], "v9DryRunEvents": c["events"], "v9PriceReturnOnly": c.get("priceReturnOnly"),
                      "v112Admitted": c["id"] in adm_new, "v112Verdicts": [[r[1], r[3], r[4]] for r in rs]})
    blocking = collections.Counter()
    for c in cases:
        if not c["v112Admitted"]:
            blocking["+".join(sorted({v[1] for v in c["v112Verdicts"] if v[1] not in ADM}))] += 1
    rep = {"schemaVersion": "v10-ca-agreement-1.0.0", "readAfterFreeze": True,
           "v112VerdictsSha256": hashlib.sha256(open(os.path.join(a.root, "docs/quant-recovery/v10/corporate-actions/verdicts.json"), "rb").read()).hexdigest(),
           "events": len(n), "transitions100to112": dict(sorted(trans.items(), key=lambda x: -x[1])), "admissibilityChanged": changed,
           "series": {"admitted100": len(old["admissibleSeries"]), "admitted112": len(adm_new),
                      "both": sorted(set(old["admissibleSeries"]) & adm_new), "only100": sorted(set(old["admissibleSeries"]) - adm_new), "only112": sorted(adm_new - set(old["admissibleSeries"]))},
           "v9DryRun81": {"cases": len(cases), "admitted112": sum(c["v112Admitted"] for c in cases), "heldByBlockingClasses": dict(blocking.most_common()), "perCase": cases}}
    open(a.out, "w").write(json.dumps(rep, indent=1) + "\n")
    print(json.dumps({k: rep["series"][k] for k in ("admitted100", "admitted112", "only100", "only112")}), rep["v9DryRun81"]["admitted112"], dict(blocking.most_common(8)))


if __name__ == "__main__":
    main()
