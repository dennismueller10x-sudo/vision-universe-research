#!/usr/bin/env python3
"""V13 STUDIES - counts for the 209 CA_UNRESOLVED delisted chains (study amendment 1.0.1 O8, no new rule, no returns).

Re-derives with the unchanged qualify.py logic (imported by path) the first unresolved split-sized daily jump of every chain
whose public register status is CA_UNRESOLVED, and counts: direction of the jump (DOWN = close fell to ~1/k, UP = rose ~k-fold),
and whether the chain's last traded bar lies within 365 days after the jump. Only counts are written (no dates, no prices).

python3 -I scripts/quant/v13/studies/ca_unresolved_count.py --root . --private <v13-private> --listref <v12-private/listref> --out <json>
"""
import argparse, collections, datetime as dt, gzip, hashlib, hmac, importlib.util, json, os

D = dt.date.fromisoformat


def main():
    ap = argparse.ArgumentParser()
    for k in ("root", "private", "listref", "out"):
        ap.add_argument("--" + k, required=True)
    a = ap.parse_args()
    spec = importlib.util.spec_from_file_location("v13qualify", os.path.join(a.root, "scripts/quant/v13/delisted/qualify.py"))
    Q = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(Q)
    reg = json.load(open(os.path.join(a.root, "docs/quant-recovery/v13/delisted/register-1.0.0.json")))
    ix = {c: i for i, c in enumerate(reg["columns"])}
    status = {r[ix["chainId"]]: r[ix["status"]] for r in reg["rows"]}
    work = os.path.join(a.listref, "work")
    key = open(os.path.join(work, "chain-hash-key.txt")).read().strip()
    chains = [c for c in (json.loads(l) for l in gzip.open(os.path.join(work, "reference-listings.jsonl.gz"), "rt")) if c["ended"] and not c["series"]]
    base = collections.Counter(Q.chain_id(key, c["ticker"], c["exchange"], int(c["endDate"][:4])) for c in chains)
    series = Q.load_series(a.private)
    out = collections.Counter()
    for ch in chains:
        cid = Q.chain_id(key, ch["ticker"], ch["exchange"], int(ch["endDate"][:4]))
        if base[cid] > 1:
            cid += "-" + hmac.new(key.encode(), ch["startDate"].encode(), hashlib.sha256).hexdigest()[:4]
        if status.get(cid) != "CA_UNRESOLVED":
            continue
        s = series.get(ch["ticker"])
        res, _ = Q.qualify_chain(ch, s, {}, {})
        if res["status"] != "CA_UNRESOLVED":
            out["statusNotReproduced"] += 1
            continue
        cols = s["cols"]; ci = {c: i for i, c in enumerate(cols)}
        rows = [r for r in s["rows"] if r[ci["close"]] is not None]
        while rows and not (rows[-1][ci["volume"]] or 0) > 0:
            rows.pop()
        close = [float(r[ci["close"]]) for r in rows]
        sf = [float(r[ci["splitFactor"]] or 1.0) for r in rows]
        jump = None
        for i in range(1, len(rows)):
            ss = Q.split_sized(close[i] / close[i - 1])
            if not ss:
                continue
            k, kind = ss
            hit = any(j < len(rows) and sf[j] != 1.0 and ((kind == "DOWN" and abs(sf[j] / k - 1) < Q.TOL) or (kind == "UP" and abs(sf[j] * k - 1) < Q.TOL)) for j in (i, i + 1))
            if not hit:
                jump = (i, kind, k)
                break
        if jump is None:
            out["jumpNotFound"] += 1
            continue
        i, kind, k = jump
        # qualify.split_sized: 'DOWN' means r ~ 1/k (the close fell), 'UP' means r ~ k (the close rose)
        direction = "PRICE_FELL" if kind == "DOWN" else "PRICE_ROSE"
        days = (D(rows[-1][0][:10]) - D(rows[i][0][:10])).days
        out["chains"] += 1
        out[direction] += 1
        out[direction + ":ratio" + str(k)] += 1
        if days <= 365:
            out[direction + ":lastTradeWithin365d"] += 1
        if days <= 30:
            out[direction + ":lastTradeWithin30d"] += 1
        if i == len(rows) - 1:
            out[direction + ":jumpOnLastTradedBar"] += 1
    res = {"schemaVersion": "v13-studies-ca-unresolved-counts-1.0.0", "evidenceKind": "SOURCE_EVIDENCE", "label": "COUNTS_ONLY (study amendment 1.0.1 O8); no returns, no new rule",
           "registerCount": reg["counts"]["CA_UNRESOLVED"], "counts": dict(sorted(out.items())),
           "reading": "PRICE_FELL jumps close to the last trade are candidates for real crashes that the CA rule excluded (survivor tilt of F1); PRICE_ROSE jumps are candidates for unrecorded reverse splits or takeover jumps."}
    with open(a.out, "w") as f:
        json.dump(res, f, indent=1)
        f.write("\n")
    print(json.dumps(res))


if __name__ == "__main__":
    main()
