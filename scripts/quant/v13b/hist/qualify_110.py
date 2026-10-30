#!/usr/bin/env python3
"""V13b HIST part A step 3 - delisted register 1.1.0 (protocol 1.0.0 + 1.0.1 + 1.0.2 + amendment 1.1.0).

Identical to scripts/quant/v13/delisted/qualify.py (imported for every helper and input loader) except that the
split-sized jumps adjudicated in crash-adjudication-1.1.0.json are treated as resolved:
  A_REAL_PRICE_EVENT  jump accepted as a price move;
  B1_SPLIT            documented ratio applied as a split factor on that day (R4 adjClose cross-check skipped that day);
  B2_DISTRIBUTION     price unchanged; total-return ratio on that day = (close + documented D) / previous close;
  B3_TERMINAL_CASH    series cut before the day, terminal = documented cash (class DOCUMENTED_CASH).
Only chains whose adjudication is ADJUDICATED_RESOLVED get overrides; every other chain must reproduce its
register-1.0.0 row exactly (checked, abort otherwise). Series of changed chains are written to --out-series
(the unchanged ones stay in the V13 private series directory).

python3 -I scripts/quant/v13b/hist/qualify_110.py --root . --private <v13-private> --listref <v12-private/listref> \
    --jumpmap <v13b-private>/crash/jumpmap-1.1.0.json --out-public docs/quant-recovery/v13b/hist/register-1.1.0.json \
    --out-series <v13b-private>/series-1.1.0
"""
import argparse, collections, datetime as dt, gzip, hashlib, hmac, importlib.util, json, math, os, sys

D = dt.date.fromisoformat


def load_q(root):
    spec = importlib.util.spec_from_file_location('v13qualify', os.path.join(root, 'scripts/quant/v13/delisted/qualify.py'))
    Q = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(Q)
    return Q


def qualify_chain(Q, ch, s, events_by_cik, reasons, adj):
    """qualify.py#qualify_chain with the amendment-1.1.0 overrides (adj: date -> decision); adj = {} reproduces 1.0.0."""
    res = {"status": None, "notes": []}
    if s is None or not s.get("rows"):
        res["status"] = "NOT_DELIVERED"
        return res, None
    if (ch.get("link") or {}).get("grade") not in Q.LINK_OK:
        res["status"] = "EXCLUDED_NO_CIK_LINK"
        return res, None
    ix = {c: i for i, c in enumerate(s["cols"])}
    rows = [r for r in s["rows"] if r[ix["close"]] is not None]
    while rows and not (rows[-1][ix["volume"]] or 0) > 0:
        rows.pop()
    b3 = [d for d, v in adj.items() if v["subClass"] == "B3_TERMINAL_CASH"]
    terminal_cash = None
    if b3:
        cut_day = min(b3)
        terminal_cash = adj[cut_day]["perShare"]
        rows = [r for r in rows if r[0][:10] < cut_day]
    if not rows:
        res["status"] = "EXCLUDED_SHORT"
        return res, None
    first, last = rows[0][0], rows[-1][0]
    start, end, pend = ch["startDate"], ch["endDate"], ch["providerEnd"]
    if D(first) > D(end) + dt.timedelta(days=7):
        res["status"] = "NEWER_LISTING_ONLY"
        return res, None
    meta_start = (s.get("meta") or {}).get("startDate")
    want_first = max(D(start), D("1990-01-02"))
    ok_start = (meta_start and abs((D(meta_start[:10]) - D(start)).days) <= 7) or abs((D(first) - want_first).days) <= 7
    if not ok_start or D(last) > D(pend) + dt.timedelta(days=7):
        res["status"] = "EXCLUDED_IDENTITY"
        res["notes"].append("start" if not ok_start else "end")
        return res, None
    close = [float(r[ix["close"]]) for r in rows]
    if any(not (c > 0 and math.isfinite(c)) for c in close):
        res["status"] = "PRICE_OUTLIER"
        return res, None
    sf = [float(r[ix["splitFactor"]] or 1.0) for r in rows]
    b1_days = set()
    for i, r in enumerate(rows):
        v = adj.get(r[0][:10])
        if v and v["subClass"] == "B1_SPLIT":
            sf[i] = float(v["factor"])
            b1_days.add(i)
    adjc = [r[ix["adjClose"]] for r in rows]
    later = [1.0] * len(rows)
    acc = 1.0
    for i in range(len(rows) - 1, -1, -1):
        later[i] = acc
        acc *= sf[i]
    sadj = [close[i] / later[i] for i in range(len(rows))]
    used = set()
    for i in range(1, len(rows)):
        ss = Q.split_sized(close[i] / close[i - 1])
        if ss:
            k, kind = ss
            hit = False
            for j in (i, i + 1):
                if j < len(rows) and sf[j] != 1.0:
                    fct = sf[j]
                    if (kind == "DOWN" and abs(fct / k - 1) < Q.TOL) or (kind == "UP" and abs(fct * k - 1) < Q.TOL):
                        hit = True
            v = adj.get(rows[i][0][:10])
            if not hit and v and v["class"] in ("A_REAL_PRICE_EVENT", "B_CORPORATE_ACTION"):
                hit = True
                used.add(rows[i][0][:10])
            if not hit:
                res["status"] = "CA_UNRESOLVED"
                res["notes"].append(rows[i][0][:4])
                return res, None
        if sf[i] != 1.0 and i not in b1_days and adjc[i] is not None and adjc[i - 1] is not None and adjc[i - 1] > 0:
            own = sadj[i] / sadj[i - 1]
            prov = float(adjc[i]) / float(adjc[i - 1])
            if abs(own / prov - 1) > 0.01:
                res["status"] = "CA_MISMATCH"
                res["notes"].append(rows[i][0][:4])
                return res, None
        if abs(math.log(sadj[i] / sadj[i - 1])) > math.log(10):
            res["status"] = "PRICE_OUTLIER"
            res["notes"].append(rows[i][0][:4])
            return res, None
    # total-return level: provider adjClose, except B2 days (documented distribution)
    tr = [float(x) if x is not None else None for x in adjc]
    b2 = {i for i, r in enumerate(rows) if (adj.get(r[0][:10]) or {}).get("subClass") == "B2_DISTRIBUTION"}
    if b2:
        lvl = [None] * len(rows)
        lvl[0] = tr[0] if tr[0] is not None else sadj[0]
        for i in range(1, len(rows)):
            if i in b2:
                ratio = (close[i] + float(adj[rows[i][0][:10]]["perShare"])) / close[i - 1] * (later[i - 1] / later[i])
            elif tr[i] is not None and tr[i - 1] is not None and tr[i - 1] > 0:
                ratio = tr[i] / tr[i - 1]
            else:
                ratio = None
            lvl[i] = lvl[i - 1] * ratio if (ratio is not None and lvl[i - 1] is not None) else None
        tr = lvl
    weeks = []
    for i, r in enumerate(rows):
        wk = Q.iso_week(r[0])
        a = tr[i]
        if weeks and weeks[-1][0] == wk:
            weeks[-1] = (wk, r[0], sadj[i], a, close[i])
        else:
            weeks.append((wk, r[0], sadj[i], a, close[i]))
    cut = None
    for i in range(1, len(weeks)):
        if weeks[i][0] != Q.next_week(weeks[i - 1][0]):
            cut = i
            break
    if cut is not None:
        if cut >= 55:
            weeks = weeks[:cut]
            res["notes"].append("GAP_CUT")
        else:
            res["status"] = "EXCLUDED_GAPS"
            return res, None
    if len(weeks) < 55:
        res["status"] = "EXCLUDED_SHORT"
        return res, None
    last_trade = weeks[-1][1]
    cik = ch["link"]["cik"]
    ev = None
    for e in events_by_cik.get(cik, []):
        delta = (D(e["eventDate"]) - D(last_trade)).days
        if -45 <= delta <= 120 and (ev is None or abs(delta) < abs((D(ev["eventDate"]) - D(last_trade)).days)):
            ev = e
    sourced = ev is not None or (ch.get("endSource") == "DERIVED_FROM_SEC_DELISTING_FORM" and cut is None)
    if cut is not None:
        sourced = False
    last_raw = weeks[-1][4]
    label = reasons.get((cik, ev["eventDate"])) if ev else None
    if terminal_cash is not None and cut is None:
        tclass, scen = "DOCUMENTED_CASH", [0.0]
    elif label == "MERGER_ACQUISITION_COMPLETED":
        tclass, scen = "MERGER", [0.0, -0.10, 0.10]
    elif label == "BANKRUPTCY" or last_raw < 1.0:
        tclass, scen = "DISTRESS", [0.0, -0.30, -1.0]
    else:
        tclass, scen = "UNKNOWN", [0.0, -0.30, -1.0]
    res["status"] = "QUALIFIED" if sourced else "PRICE_ONLY_CENSORED_END"
    res.update({"weeks": len(weeks), "endSourced": sourced, "terminalClass": tclass, "secEvent": ev["eventDate"] if ev else None,
                "reason": label, "lastTradeYear": int(last_trade[:4]), "firstYear": int(weeks[0][1][:4]), "adjudicatedJumpsUsed": sorted(used)})
    terminal = {"class": tclass, "scenarios": scen, "secEventDate": ev["eventDate"] if ev else None, "reason": label}
    if tclass == "DOCUMENTED_CASH":
        terminal["documentedValue"] = terminal_cash  # raw cash per share; B3 days are cut, no later split factor applies
    series = {"ticker": s["ticker"], "cik": cik, "status": res["status"], "points": [[w[1], round(w[2], 6)] for w in weeks],
              "totalReturn": [[w[1], round(w[3], 6)] for w in weeks if w[3] is not None], "lastTradeDate": last_trade,
              "lastRawClose": last_raw, "terminal": terminal, "chain": {"startDate": start, "endDate": end}}
    return res, series


def main():
    ap = argparse.ArgumentParser()
    for k in ("root", "private", "listref", "jumpmap", "out-public", "out-series"):
        ap.add_argument("--" + k, required=True)
    a = ap.parse_args()
    Q = load_q(a.root)
    work = os.path.join(a.listref, "work")
    key = open(os.path.join(work, "chain-hash-key.txt")).read().strip()
    chains = [c for c in (json.loads(l) for l in gzip.open(os.path.join(work, "reference-listings.jsonl.gz"), "rt")) if c["ended"] and not c["series"]]
    reg = json.load(open(os.path.join(work, "delisting-register.json")))
    events_by_cik = {}
    for e in reg:
        events_by_cik.setdefault(e["cik"], []).append(e)
    rr = json.load(open(os.path.join(work, "delisting-reasons.json")))
    ci = {c: i for i, c in enumerate(rr["columns"])}
    reasons = {(r[ci["cik"]], r[ci["eventDate"]]): r[ci["reason"]] for r in rr["rows"]}
    series = Q.load_series(a.private)
    ok_controls, controls = Q.controls_check(a.root, series)
    old = json.load(open(os.path.join(a.root, "docs/quant-recovery/v13/delisted/register-1.0.0.json")))
    oix = {c: i for i, c in enumerate(old["columns"])}
    old_rows = {r[0]: r for r in old["rows"]}
    jm = json.load(open(a.jumpmap))
    adjf = os.path.join(a.root, "docs/quant-recovery/v13b/hist/crash-adjudication-1.1.0.json")
    adjpub = json.load(open(adjf))
    assert not adjpub["errors"], "adjudication has errors"
    pub_decision = {c["chainId"]: c["chainDecision"] for c in adjpub["cases"]}
    assert set(pub_decision) == set(jm)
    base_ids = collections.Counter(Q.chain_id(key, c["ticker"], c["exchange"], int(c["endDate"][:4])) for c in chains)
    fetched = {t for t, s in series.items() if not s.get("control")}
    os.makedirs(a.out_series, exist_ok=True)
    rows, counts, changed = [], collections.Counter(), []
    for ch in sorted(chains, key=lambda c: c["id"]):
        end_year = int(ch["endDate"][:4])
        cid = Q.chain_id(key, ch["ticker"], ch["exchange"], end_year)
        if base_ids[cid] > 1:
            cid += "-" + hmac.new(key.encode(), ch["startDate"].encode(), hashlib.sha256).hexdigest()[:4]
        adj = {}
        adjclass = None
        if cid in jm:
            adjclass = pub_decision[cid]
            if jm[cid]["admitted"]:
                for j in jm[cid]["jumps"]:
                    adj[j["date"]] = j
        if ch["ticker"] not in fetched:
            st, ser = {"status": "NOT_REQUESTED_YET"}, None
        else:
            st, ser = qualify_chain(Q, ch, series.get(ch["ticker"]), events_by_cik, reasons, adj)
        if not ok_controls and st["status"] in ("QUALIFIED", "PRICE_ONLY_CENSORED_END"):
            st["status"], ser = "SOURCE_MISMATCH", None
        counts[st["status"]] += 1
        psha = None
        if ser is not None:
            ser["chainId"] = cid
            ser["exchange"] = ch["exchange"]
            psha = hashlib.sha256(json.dumps(ser["points"], separators=(",", ":")).encode()).hexdigest()
            ser["pointsSha256"] = psha
        row = [cid, (ch.get("link") or {}).get("cik"), Q.bucket(int(ch["startDate"][:4])), Q.bucket(end_year), st["status"], st.get("endSourced"),
               st.get("terminalClass"), st.get("weeks"), "GAP_CUT" in st.get("notes", []), psha, adjclass]
        o = old_rows[cid]
        if row[:10] != o:
            if not adj:
                raise SystemExit("REPRODUCTION_FAILURE %s: %s != %s" % (cid, row[:10], o))
            changed.append({"chainId": cid, "cik": row[1], "before": o[oix["status"]], "after": row[4], "terminalClass": row[6], "endYearBucket": row[3],
                            "endSourced": row[5], "weeks": row[7]})
            if ser is not None:
                ser["adjudicatedJumpsUsed"] = st.get("adjudicatedJumpsUsed")
                with open(os.path.join(a.out_series, cid + ".json"), "w") as fh:
                    json.dump(ser, fh, separators=(",", ":"))
        elif adj:
            changed.append({"chainId": cid, "cik": row[1], "before": o[oix["status"]], "after": row[4], "unchangedRow": True})
        rows.append(row)
    sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
    here = os.path.dirname(os.path.abspath(__file__))
    before = old["counts"]
    after = dict(sorted(counts.items()))
    pub = {"schemaVersion": "v13-delisted-register-1.1.0",
           "basedOn": {"register-1.0.0.json": sha(os.path.join(a.root, "docs/quant-recovery/v13/delisted/register-1.0.0.json")),
                       "reproducedUnchangedRows": len(rows) - len([c for c in changed if not c.get("unchangedRow")])},
           "protocolSha256": dict(old["protocolSha256"], **{"amendment-1.1.0": sha(os.path.join(a.root, "docs/quant-recovery/v13b/hist/protocol-amendment-1.1.0.json"))}),
           "adjudicationSha256": sha(adjf), "codeSha256": {"qualify_110.py": sha(os.path.abspath(__file__)), "qualify.py": sha(os.path.join(a.root, "scripts/quant/v13/delisted/qualify.py"))},
           "inputs": old["inputs"], "evidenceKind": "SOURCE_EVIDENCE", "certificationStatus": "NOT_CERTIFIED", "productionApproved": False,
           "controls": {"pass": ok_controls}, "endedChainsWithoutSeries": len(chains),
           "countsBefore": before, "counts": after,
           "countsDelta": {k: after.get(k, 0) - before.get(k, 0) for k in sorted(set(before) | set(after)) if after.get(k, 0) != before.get(k, 0)},
           "changedChains": changed,
           "columns": old["columns"] + ["adjudication"], "rows": rows}
    with open(a.out_public, "w") as fh:
        json.dump(pub, fh, indent=0)
        fh.write("\n")
    print(json.dumps({"countsDelta": pub["countsDelta"], "changed": changed}, indent=1))


if __name__ == "__main__":
    main()
