"""Agreement of this protocol's verdicts with V9 workstream B (read only AFTER the verdicts were frozen).

Inputs: the frozen facts (verify_ca_events.py), V9 ca-evidence-proposal.json, ca-event-resolutions.json.gz and ca-dryrun.json
(from claude/vision-universe-quant-v9-dsvle1, extracted with `git show`). Writes only --out.
"""
import argparse
import collections
import gzip
import hashlib
import json

ADMISSIBLE = {"GENUINE_MOVE", "SPINOFF_DISTRIBUTION"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--facts", required=True)
    ap.add_argument("--v9-proposal", required=True)
    ap.add_argument("--v9-resolutions", required=True)
    ap.add_argument("--v9-dryrun", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    facts_bytes = open(a.facts, "rb").read()
    facts = [json.loads(l) for l in facts_bytes.decode().splitlines() if l.strip()]
    prop = json.load(open(a.v9_proposal))
    res = json.load(gzip.open(a.v9_resolutions))
    dry = json.load(open(a.v9_dryrun))
    v9_entry = {(e["securityId"], e["week"]): e for e in prop["entries"]}
    v9_res = {(r["id"], r["week"]): r for r in res["rows"]}
    v9_series = {x["id"] for x in dry["newlyQualified"]}
    rows, matrix = [], collections.Counter()
    for s in facts:
        for e in s["events"]:
            key = (s["securityId"], e["week"])
            pe, re_ = v9_entry.get(key), v9_res.get(key)
            v9_class = (pe["resolution"] + (":ACCEPTED" if pe["accepted"] else ":NOT_ACCEPTED")) if pe else (re_["resolution"] if re_ else "NOT_IN_V9")
            v9_adm = bool(pe and pe["accepted"])
            mine_adm = e["verdict"] in ADMISSIBLE
            agree = "AGREE_ADMIT" if v9_adm and mine_adm else "AGREE_HOLD" if not v9_adm and not mine_adm else "V9_ONLY_ADMIT" if v9_adm else "OURS_ONLY_ADMIT"
            matrix[agree] += 1
            if v9_adm or mine_adm:
                rows.append({"securityId": s["securityId"], "week": e["week"], "ours": e["verdict"], "oursDetail": e.get("detail"), "v9": v9_class,
                             "v9Effect": pe["effect"] if pe else None, "agreement": agree})
    ours_series = sorted(s["securityId"] for s in facts if s["events"] and all(e["verdict"] in ADMISSIBLE for e in s["events"]))
    v9_reasons = collections.Counter((r["ours"], r["oursDetail"]) for r in rows if r["agreement"] == "V9_ONLY_ADMIT")
    report = {
        "schemaVersion": "v9-followup-ca-v9-agreement-1.0.0",
        "factsSha256": hashlib.sha256(facts_bytes).hexdigest(),
        "note": "V9 files were read only after the verdicts (facts) were frozen; facts sha256 recorded before this comparison.",
        "events": sum(matrix.values()), "eventMatrix": dict(matrix),
        "whyV9AdmitButNotOurs": [{"ours": k[0], "detail": k[1], "events": v} for k, v in v9_reasons.most_common()],
        "series": {"v9NewlyQualified": len(v9_series), "oursAdmissible": len(ours_series), "both": sorted(v9_series & set(ours_series)),
                   "v9Only": len(v9_series - set(ours_series)), "oursOnly": sorted(set(ours_series) - v9_series)},
        "rows": sorted(rows, key=lambda r: (r["agreement"], r["securityId"], r["week"])),
    }
    open(a.out, "w").write(json.dumps(report, indent=1) + "\n")
    print(json.dumps({k: report[k] for k in ("events", "eventMatrix", "whyV9AdmitButNotOurs")}, indent=1))
    print(json.dumps({k: (v if not isinstance(v, list) or len(v) < 30 else len(v)) for k, v in report["series"].items()}))


if __name__ == "__main__":
    main()
