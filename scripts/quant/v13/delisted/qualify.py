#!/usr/bin/env python3
"""V13 - qualification of fetched delisted daily histories (protocol 1.0.0 + amendment 1.0.1).

Inputs are private (decrypted fetch runs, V12 LISTREF reference chains, SEC delisting register/reasons);
outputs: private weekly series per QUALIFIED/PRICE_ONLY chain and a public register with redacted rows.

python3 -I scripts/quant/v13/delisted/qualify.py --root . --private <v13-private> --listref <v12-private/listref> \
    --out-public docs/quant-recovery/v13/delisted/register-1.0.0.json --out-series <v13-private/series>
"""
import argparse, datetime as dt, glob, gzip, hashlib, hmac, json, math, os, sys

LINK_OK = {"HIGH_CURRENT_MAP", "HIGH_V10_REGISTER", "MEDIUM_FTS_CONFIRMED", "MEDIUM_FTS_DISCOVERED"}
SPLIT_RATIOS = (2, 3, 4, 5, 10)
TOL = 0.03
D = dt.date.fromisoformat


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def split_sized(r):
    """(k, 'UP'|'DOWN') when r is within 3 % of k or 1/k (corporate-action-evidence.js#splitSized)."""
    if not (r > 0):
        return None
    for k in SPLIT_RATIOS:
        if abs(r / k - 1) < TOL:
            return (k, "UP")
        if abs(r * k - 1) < TOL:
            return (k, "DOWN")
    return None


def bucket(y):
    if y is None:
        return None
    b = y - y % 5
    return "%d-%d" % (b, b + 4)


def chain_id(key, ticker, exchange, end_year):
    return hmac.new(key.encode(), ("%s|%s|%s" % (ticker, exchange, end_year)).encode(), hashlib.sha256).hexdigest()[:16]


def iso_week(d):
    y, w, _ = D(d).isocalendar()
    return (y, w)


def next_week(yw):
    y, w = yw
    monday = dt.date.fromisocalendar(y, w, 1) + dt.timedelta(days=7)
    return monday.isocalendar()[:2]


def load_series(private):
    out = {}
    for f in sorted(glob.glob(os.path.join(private, "raw", "*", "series.jsonl.gz"))):
        for line in gzip.open(f, "rt"):
            r = json.loads(line)
            prev = out.get(r["ticker"])
            if prev is None or (not prev["rows"] and r["rows"]):
                r["_file"] = f
                out[r["ticker"]] = r
    return out


def qualify_chain(ch, s, events_by_cik, reasons):
    res = {"status": None, "notes": []}
    if s is None or not s.get("rows"):
        res["status"] = "NOT_DELIVERED"
        return res, None
    if (ch.get("link") or {}).get("grade") not in LINK_OK:
        res["status"] = "EXCLUDED_NO_CIK_LINK"
        return res, None
    cols = s["cols"]
    ix = {c: i for i, c in enumerate(cols)}
    rows = [r for r in s["rows"] if r[ix["close"]] is not None]
    # C1: drop trailing untraded bars
    while rows and not (rows[-1][ix["volume"]] or 0) > 0:
        rows.pop()
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
    # R5 / R4 on daily bars
    close = [float(r[ix["close"]]) for r in rows]
    if any(not (c > 0 and math.isfinite(c)) for c in close):
        res["status"] = "PRICE_OUTLIER"
        return res, None
    sf = [float(r[ix["splitFactor"]] or 1.0) for r in rows]
    adj = [r[ix["adjClose"]] for r in rows]
    later = [1.0] * len(rows)
    acc = 1.0
    for i in range(len(rows) - 1, -1, -1):
        later[i] = acc
        acc *= sf[i]
    sadj = [close[i] / later[i] for i in range(len(rows))]
    for i in range(1, len(rows)):
        ss = split_sized(close[i] / close[i - 1])
        if ss:
            k, kind = ss
            hit = False
            for j in (i, i + 1):
                if j < len(rows) and sf[j] != 1.0:
                    f = sf[j]
                    if (kind == "DOWN" and abs(f / k - 1) < TOL) or (kind == "UP" and abs(f * k - 1) < TOL):
                        hit = True
            if not hit:
                res["status"] = "CA_UNRESOLVED"
                res["notes"].append(rows[i][0][:4])
                return res, None
        if sf[i] != 1.0 and adj[i] is not None and adj[i - 1] is not None and adj[i - 1] > 0:
            own = sadj[i] / sadj[i - 1]
            prov = float(adj[i]) / float(adj[i - 1])
            if abs(own / prov - 1) > 0.01:
                res["status"] = "CA_MISMATCH"
                res["notes"].append(rows[i][0][:4])
                return res, None
        if abs(math.log(sadj[i] / sadj[i - 1])) > math.log(10):
            res["status"] = "PRICE_OUTLIER"
            res["notes"].append(rows[i][0][:4])
            return res, None
    # C2 weekly
    weeks = []
    for i, r in enumerate(rows):
        wk = iso_week(r[0])
        a = float(adj[i]) if adj[i] is not None else None
        if weeks and weeks[-1][0] == wk:
            weeks[-1] = (wk, r[0], sadj[i], a, close[i])
        else:
            weeks.append((wk, r[0], sadj[i], a, close[i]))
    cut = None
    for i in range(1, len(weeks)):
        if weeks[i][0] != next_week(weeks[i - 1][0]):
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
    # R3 delisting evidence
    cik = ch["link"]["cik"]
    ev = None
    for e in events_by_cik.get(cik, []):
        delta = (D(e["eventDate"]) - D(last_trade)).days
        if -45 <= delta <= 120 and (ev is None or abs(delta) < abs((D(ev["eventDate"]) - D(last_trade)).days)):
            ev = e
    sourced = ev is not None or (ch.get("endSource") == "DERIVED_FROM_SEC_DELISTING_FORM" and cut is None)
    if cut is not None:
        sourced = False  # the cut removed the real end
    # R6 terminal
    last_raw = weeks[-1][4]
    label = reasons.get((cik, ev["eventDate"])) if ev else None
    if label == "MERGER_ACQUISITION_COMPLETED":
        tclass, scen = "MERGER", [0.0, -0.10, 0.10]
    elif label == "BANKRUPTCY" or last_raw < 1.0:
        tclass, scen = "DISTRESS", [0.0, -0.30, -1.0]
    else:
        tclass, scen = "UNKNOWN", [0.0, -0.30, -1.0]
    res["status"] = "QUALIFIED" if sourced else "PRICE_ONLY_CENSORED_END"
    res.update({"weeks": len(weeks), "endSourced": sourced, "terminalClass": tclass, "secEvent": ev["eventDate"] if ev else None,
                "reason": label, "lastTradeYear": int(last_trade[:4]), "firstYear": int(weeks[0][1][:4])})
    series = {"ticker": s["ticker"], "cik": cik, "status": res["status"], "points": [[w[1], round(w[2], 6)] for w in weeks],
              "totalReturn": [[w[1], round(w[3], 6)] for w in weeks if w[3] is not None], "lastTradeDate": last_trade,
              "lastRawClose": last_raw, "terminal": {"class": tclass, "scenarios": scen, "secEventDate": ev["eventDate"] if ev else None,
                                                     "reason": label}, "chain": {"startDate": start, "endDate": end}}
    return res, series


def controls_check(root, series):
    out = {}
    for t, s in series.items():
        if not s.get("control"):
            continue
        p = os.path.join(root, "quant/data/market/discover-series-long", "ref_%s.json" % t)
        if not os.path.exists(p) or not s.get("rows"):
            out[t] = {"status": "NO_REFERENCE"}
            continue
        held = {d: v for d, v in json.load(open(p))["points"]}
        ix = {c: i for i, c in enumerate(s["cols"])}
        rows = s["rows"]
        sf = [float(r[ix["splitFactor"]] or 1) for r in rows]
        later, acc = [1.0] * len(rows), 1.0
        for i in range(len(rows) - 1, -1, -1):
            later[i] = acc
            acc *= sf[i]
        wk = {}
        for i, r in enumerate(rows):
            wk[iso_week(r[0])] = (r[0], float(r[ix["close"]]) / later[i])
        common = [(v[1], held[v[0]]) for v in wk.values() if v[0] in held]
        within = sum(1 for a, b in common if abs(a / b - 1) <= 0.005)
        out[t] = {"commonWeeks": len(common), "within0p5pct": within, "share": round(within / len(common), 6) if common else None}
    ok = all(v.get("share") is not None and v["share"] >= 0.99 for v in out.values()) and len(out) > 0
    return ok, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--private", required=True)
    ap.add_argument("--listref", required=True)
    ap.add_argument("--out-public", required=True)
    ap.add_argument("--out-series", required=True)
    a = ap.parse_args()
    work = os.path.join(a.listref, "work")
    key = open(os.path.join(work, "chain-hash-key.txt")).read().strip()
    chains = [c for c in (json.loads(l) for l in gzip.open(os.path.join(work, "reference-listings.jsonl.gz"), "rt"))
              if c["ended"] and not c["series"]]
    reg = json.load(open(os.path.join(work, "delisting-register.json")))
    events_by_cik = {}
    for e in reg:
        events_by_cik.setdefault(e["cik"], []).append(e)
    rr = json.load(open(os.path.join(work, "delisting-reasons.json")))
    ci = {c: i for i, c in enumerate(rr["columns"])}
    reasons = {(r[ci["cik"]], r[ci["eventDate"]]): r[ci["reason"]] for r in rr["rows"]}
    series = load_series(a.private)
    ok_controls, controls = controls_check(a.root, series)
    os.makedirs(a.out_series, exist_ok=True)
    rows, counts = [], {}
    base_ids = {}
    for ch in chains:
        k = chain_id(key, ch["ticker"], ch["exchange"], int(ch["endDate"][:4]))
        base_ids[k] = base_ids.get(k, 0) + 1
    fetched = {t for t, s in series.items() if not s.get("control")}
    for ch in sorted(chains, key=lambda c: c["id"]):
        if ch["ticker"] not in fetched:
            st = {"status": "NOT_REQUESTED_YET"}
            ser = None
        else:
            st, ser = qualify_chain(ch, series.get(ch["ticker"]), events_by_cik, reasons)
        if not ok_controls and st["status"] in ("QUALIFIED", "PRICE_ONLY_CENSORED_END"):
            st["status"] = "SOURCE_MISMATCH"
            ser = None
        counts[st["status"]] = counts.get(st["status"], 0) + 1
        end_year = int(ch["endDate"][:4])
        cid = chain_id(key, ch["ticker"], ch["exchange"], end_year)
        if base_ids[cid] > 1:  # amendment 1.0.2: V12 id collides (same ticker/exchange/end year) -> keyed start-date suffix
            cid += "-" + hmac.new(key.encode(), ch["startDate"].encode(), hashlib.sha256).hexdigest()[:4]
        if ser is not None:
            ser["chainId"] = cid
            ser["exchange"] = ch["exchange"]
            ser["pointsSha256"] = hashlib.sha256(json.dumps(ser["points"], separators=(",", ":")).encode()).hexdigest()
            with open(os.path.join(a.out_series, cid + ".json"), "w") as f:
                json.dump(ser, f, separators=(",", ":"))
        rows.append([cid, (ch.get("link") or {}).get("cik"), bucket(int(ch["startDate"][:4])), bucket(end_year), st["status"],
                     st.get("endSourced"), st.get("terminalClass"), st.get("weeks"), "GAP_CUT" in st.get("notes", []),
                     ser["pointsSha256"] if ser is not None else None])
    runs = sorted(glob.glob(os.path.join(a.private, "raw", "*", "sha256.txt")))
    enc = []
    for r in runs:
        for line in open(r):
            h, n = line.split()
            if n == "series.jsonl.gz.enc":
                enc.append({"runId": os.path.basename(os.path.dirname(r)), "ciphertextSha256": h})
    here = os.path.dirname(os.path.abspath(__file__))
    pub = {"schemaVersion": "v13-delisted-register-1.0.0",
           "protocolSha256": {"protocol-1.0.0": sha(os.path.join(a.root, "docs/quant-recovery/v13/delisted/protocol-1.0.0.json")),
                              "amendment-1.0.1": sha(os.path.join(a.root, "docs/quant-recovery/v13/delisted/protocol-amendment-1.0.1.json"))},
           "codeSha256": sha(os.path.join(here, "qualify.py")),
           "inputs": {"fetchRuns": enc, "referenceChainsSha256": sha(os.path.join(work, "reference-listings.jsonl.gz")),
                      "delistingRegisterSha256": sha(os.path.join(work, "delisting-register.json")),
                      "delistingReasonsSha256": sha(os.path.join(work, "delisting-reasons.json"))},
           "evidenceKind": "SOURCE_EVIDENCE", "certificationStatus": "NOT_CERTIFIED", "productionApproved": False,
           "controls": {"pass": ok_controls, "detail": controls},
           "endedChainsWithoutSeries": len(chains), "counts": dict(sorted(counts.items())),
           "columns": ["chainId", "cik", "startYearBucket", "endYearBucket", "status", "endSourced", "terminalClass", "weeks", "gapCut", "pointsSha256"],
           "rows": rows}
    with open(a.out_public, "w") as f:
        json.dump(pub, f, indent=0)
        f.write("\n")
    print(json.dumps({"counts": pub["counts"], "controls": ok_controls}))


if __name__ == "__main__":
    main()
