#!/usr/bin/env python3
"""V13 - coverage before/after adding qualified delisted series.

(a) provider reference: V12 LISTREF coverage matrix (all chains, by year) + QUALIFIED delisted chains with a weekly bar in the year;
(b) independent SEC reference: V12 delisting register events per year (25-NSE/15-12B, operating issuers) with a price series
    reaching the event (before: linked chain already held; after: + QUALIFIED delisted chain matched to that event);
(c) independent fund-holdings reference: PIT S&P 500 (V12 SPXPOP 1.1.1, SPY) exits that had to be bounded for lack of a
    price (BOUNDED_EXIT*) and are now covered by a QUALIFIED delisted chain of the same CIK ending in [t0, t1 + 120 d].

python3 -I scripts/quant/v13/delisted/coverage.py --root . --listref <v12-private/listref> --series <v13-private/series> \
    --out docs/quant-recovery/v13/delisted/coverage-1.0.0.json
"""
import argparse, datetime as dt, glob, gzip, hashlib, json, os

D = dt.date.fromisoformat


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--listref", required=True)
    ap.add_argument("--series", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    regf = os.path.join(a.root, "docs/quant-recovery/v13/delisted/register-1.0.0.json")
    reg = json.load(open(regf))
    ix = {c: i for i, c in enumerate(reg["columns"])}
    status = {r[ix["chainId"]]: r[ix["status"]] for r in reg["rows"]}
    ser = {}
    for f in glob.glob(os.path.join(a.series, "*.json")):
        s = json.load(open(f))
        if status.get(s["chainId"]) in ("QUALIFIED", "PRICE_ONLY_CENSORED_END") and s["status"] == status[s["chainId"]]:
            ser[s["chainId"]] = s
    years_q, years_p, ended_q = {}, {}, {}
    for cid, s in ser.items():
        ys = sorted({int(p[0][:4]) for p in s["points"]})
        tgt = years_q if s["status"] == "QUALIFIED" else years_p
        for y in ys:
            tgt[y] = tgt.get(y, 0) + 1
        if s["status"] == "QUALIFIED":
            y = int(s["lastTradeDate"][:4])
            ended_q[y] = ended_q.get(y, 0) + 1
    # (a) provider reference
    mf = os.path.join(a.root, "docs/quant-recovery/v12/listref/coverage-matrix-1.0.2.json")
    m = json.load(open(mf))
    prov = {}
    for y, cell in sorted(m["years"].items()):
        c = cell["all"]["ALL"]
        yi = int(y)
        q, p = years_q.get(yi, 0), years_p.get(yi, 0)
        prov[y] = {"ref": c["ref"], "withSeriesBefore": c["withSeries"], "withSeriesAfter": c["withSeries"] + q, "addedQualified": q, "addedPriceOnly": p,
                   "coverageBefore": round(c["withSeries"] / c["ref"], 4) if c["ref"] else None,
                   "coverageAfter": round((c["withSeries"] + q) / c["ref"], 4) if c["ref"] else None,
                   "coverageAfterInclPriceOnly": round((c["withSeries"] + q + p) / c["ref"], 4) if c["ref"] else None,
                   "endedRef": c["ended"], "endedWithSeriesBefore": c["endedWithSeries"], "endedQualifiedAdded": ended_q.get(yi, 0)}
    # (b) SEC delisting register
    work = os.path.join(a.listref, "work")
    events = json.load(open(os.path.join(work, "delisting-register.json")))
    matched = {(s["cik"], s["terminal"]["secEventDate"]) for s in ser.values() if s["status"] == "QUALIFIED" and s["terminal"]["secEventDate"]}
    sec = {}
    for e in events:
        y = e["eventDate"][:4]
        r = sec.setdefault(y, {"events": 0, "coveredBefore": 0, "coveredAfter": 0})
        r["events"] += 1
        before = any(lc.get("withSeries") for lc in e.get("linkedChains") or [])
        after = before or (e["cik"], e["eventDate"]) in matched
        r["coveredBefore"] += before
        r["coveredAfter"] += after
    for r in sec.values():
        r["shareBefore"] = round(r["coveredBefore"] / r["events"], 4)
        r["shareAfter"] = round(r["coveredAfter"] / r["events"], 4)
    # (c) PIT S&P 500 bounded exits
    pf = os.path.join(a.root, "docs/quant-recovery/v12/spxpop/population-1.1.1.json.gz")
    pop = json.load(gzip.open(pf))
    st_names = pop["columns"]["status"]
    by_cik = {}
    for s in ser.values():
        if s["status"] == "QUALIFIED":
            by_cik.setdefault(int(s["cik"]), []).append(s)
    spx = {"boundedExitRows": 0, "withCik": 0, "coveredByQualifiedDelisted": 0, "byPeriodEra": {}}
    for p in pop["periods"]:
        if p["fund"] != "SPY":
            continue
        cols = p["cols"]
        for k, ci in enumerate(cols["chain"]):
            stv = st_names[cols["status"][k]] if isinstance(cols["status"][k], int) else cols["status"][k]
            if not stv.startswith("BOUNDED_EXIT"):
                continue
            spx["boundedExitRows"] += 1
            era = p["t0"][:4]
            e = spx["byPeriodEra"].setdefault(era, {"bounded": 0, "covered": 0})
            e["bounded"] += 1
            cik = pop["chains"][ci][3]
            if not cik:
                continue
            spx["withCik"] += 1
            hit = any(D(p["t0"]) <= D(s["lastTradeDate"]) <= D(p["t1"]) + dt.timedelta(days=120) for s in by_cik.get(int(cik), []))
            spx["coveredByQualifiedDelisted"] += hit
            e["covered"] += hit
    out = {"schemaVersion": "v13-delisted-coverage-1.0.0", "evidenceKind": "SOURCE_EVIDENCE", "certificationStatus": "NOT_CERTIFIED", "productionApproved": False,
           "codeSha256": sha(os.path.abspath(__file__)),
           "inputs": {"register": sha(regf), "v12CoverageMatrix": sha(mf), "v12SpxPopulation": sha(pf), "delistingRegisterPrivateSha256": sha(os.path.join(work, "delisting-register.json"))},
           "definitions": {"providerReference": "V12 LISTREF chains active in year (survivorship-biased before 2013); withSeries = held weekly series with a bar in year; after adds QUALIFIED delisted chains with a weekly bar in year",
                           "secReference": "V12 delisting register events (25-NSE/15-12B) of operating issuers no longer listed; covered = a price series reaching the event (before: linked reference chain held; after: or QUALIFIED delisted chain matched to this event under R3)",
                           "spxReference": "PIT S&P 500 (SPY holdings) exit rows without a following price (BOUNDED_EXIT*), covered = QUALIFIED delisted chain with the same CIK whose last trade lies in [t0, t1+120d]"},
           "providerReference": prov, "secReference": dict(sorted(sec.items())), "spxReference": spx}
    with open(a.out, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    tot = {k: sum(v[k] for v in sec.values()) for k in ("events", "coveredBefore", "coveredAfter")}
    print(json.dumps({"sec": tot, "spx": {k: v for k, v in spx.items() if k != "byPeriodEra"}}))


if __name__ == "__main__":
    main()
