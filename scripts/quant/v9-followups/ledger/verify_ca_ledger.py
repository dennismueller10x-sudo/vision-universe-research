#!/usr/bin/env python3
"""V9 follow-up (ledger): independent Python reference for the new event types.

Stdlib only, Decimal(50). Rebuilds every input itself from the committed SEC
evidence (ca-events.json), the V9 dividend evidence and the repository price
files -- sessions, close instants, raw IBM closes, KD regular-way bars, WBS bars
up to the sourced last trading day, SAN ADS bars, dividend / spin-off / terminal
events, information times, targets -- and runs its own cash/unit/receivable/
NOT_STATED journal including the information-time decision guard, the ADS
successor-only rule and the double-application guard. JS results are read only
at the end for comparison.

Tolerance: relative 1e-9 on every equity, cash, receivable and NOT_STATED value
(the JS engine uses doubles and an 80-step bisection; float drift ~1e-13).
"""
import argparse
import datetime
import hashlib
import json
import zoneinfo
from decimal import Decimal, getcontext
from pathlib import Path

getcontext().prec = 50
D = Decimal
ROOT = Path(__file__).resolve().parents[4]
NY = zoneinfo.ZoneInfo("America/New_York")
TOL = D("1e-9")


def load(p):
    return json.loads(Path(p).read_text())


CAL = load(ROOT / "quant/config/market-calendar.json")
HOL = set(CAL["exchanges"]["XNYS"]["holidays"])
EARLY = CAL["exchanges"]["XNYS"]["earlyCloses"]
EVID = load(ROOT / "docs/quant-recovery/v9-followups/ledger/ca-events.json")


def close_at(d):
    hhmm = EARLY.get(d, "16:00") if d >= CAL["coverage"]["from"] else "16:00"
    h, m = map(int, hhmm.split(":"))
    loc = datetime.datetime.fromisoformat(d).replace(hour=h, minute=m, tzinfo=NY)
    return loc.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def ts(x):
    return datetime.datetime.strptime(x[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=datetime.timezone.utc)


def rule_ex(rec):
    n = 0 if rec >= "2024-05-28" else 1 if rec >= "2017-09-07" else 2
    t = datetime.date.fromisoformat(rec)
    while n > 0:
        t -= datetime.timedelta(days=1)
        if t.weekday() < 5 and t.isoformat() not in HOL:
            n -= 1
    return t.isoformat()


def first_on_or_after(dates, d):
    return next((x for x in dates if x >= d), None)


def series(kind, t):
    return load(ROOT / f"quant/data/market/{kind}/ref_{t}.json")


# ---------------- input reconstruction ----------------
def spin_world(div, to):
    sp = next(e for e in EVID["events"] if e["kind"] == "SPINOFF")
    ibm, kd = series("discover-series-long", "IBM"), series("discover-series-long", "KD")
    dates = [p[0] for p in ibm["points"] if "2021-07-01" <= p[0] <= to]
    ex_session = first_on_or_after(dates, sp["exDate"])
    factor = next(D(str(s[1])) for s in ibm["corporateActions"]["splits"] if s[0] == sp["exDate"])
    # Raw close = provider-adjusted close x provider spin-off factor for bars before the first bar on/after the ex-date.
    first_ex_bar = first_on_or_after([p[0] for p in ibm["points"] if p[0] in dates], sp["exDate"])
    raw = {p[0]: D(str(p[1])) * (factor if p[0] < first_ex_bar else 1) for p in ibm["points"] if p[0] in dates}
    adj = {p[0]: D(str(p[1])) for p in ibm["points"] if p[0] in dates}
    kdpx = {p[0]: D(str(p[1])) for p in kd["points"] if p[0] in dates and p[0] >= sp["distributedFirstRegularWayDate"]}
    divs = []
    for e in next(c for c in div["companies"] if c["ticker"] == "IBM")["events"]:
        ex = rule_ex(e["recordDate"])
        if dates[0] <= ex <= dates[-1]:
            divs.append({"id": "IBM:DIV:" + e["recordDate"], "k": "ref_IBM", "type": "CASH_DIVIDEND", "eff": first_on_or_after(dates, ex), "pay": e["payDate"],
                         "amount": D(e["amount"]), "time": e["firstSecAvailability"]["acceptanceUtc"]})
    spin = lambda key: {"id": "IBM:SPINOFF:KD:" + sp["recordDate"], "k": "ref_IBM", "type": "SPINOFF", "eff": ex_session, "dist": "ref_KD",
                        "ratio": D(sp["shareRatio"]), "time": sp["informationAvailableAt"][key], "info": True}
    return {"dates": dates, "ex_session": ex_session, "raw": raw, "adj": adj, "kd": kdpx, "divs": divs, "spin": spin}


def spin_runs(w, legacy_old_ext=False):
    dates, R = w["dates"], {}
    every4 = {dates[i + 1]: (dates[i], {"ref_IBM": D("0.9")}) for i in range(len(dates) - 1) if i % 4 == 0}
    pre = dates[dates.index(w["ex_session"]) - 1]
    special = {dates[1]: (dates[0], {"ref_IBM": D("0.9")}), w["ex_session"]: (pre, {"ref_IBM": D("0.45"), "ref_KD": D("0.45")})}
    leg = [dict(d, info=False) for d in w["divs"]]
    inf = [dict(d, info=True) for d in w["divs"]]
    px_raw = {"ref_IBM": w["raw"], "ref_KD": w["kd"]}
    kd_listing = {"ref_KD": {"cls": "COMMON_STOCK", "first": "2021-11-04"}}
    base = {"ref_IBM": {"cls": "COMMON_STOCK", "first": dates[0]}}
    R["SPIN_BEFORE_NO_SPINOFF_RAW"] = dict(px={"ref_IBM": w["raw"]}, listings=base, events=leg, targets=every4)
    R["SPIN_PRICE_ADJUSTED"] = dict(px={"ref_IBM": w["adj"]}, listings=base, events=[], targets=every4)
    R["SPIN_TERMS"] = dict(px=px_raw, listings={**base, **kd_listing}, events=inf + [w["spin"]("TERMS")], targets=every4)
    R["SPIN_COMPLETION"] = dict(px=px_raw, listings={**base, **kd_listing}, events=inf + [w["spin"]("COMPLETION")], targets=every4)
    R["SPIN_GUARD_DECISION_BEFORE_COMPLETION"] = dict(px=px_raw, listings={**base, **kd_listing}, events=inf + [w["spin"]("COMPLETION")], targets=special)
    R["SPIN_SAME_SCHEDULE_TERMS"] = dict(px=px_raw, listings={**base, **kd_listing}, events=inf + [w["spin"]("TERMS")], targets=special)
    R["SPIN_DOUBLE_APPLICATION"] = dict(px=px_raw, listings={**base, **kd_listing}, events=inf + [w["spin"]("TERMS"), dict(w["spin"]("COMPLETION"), id="IBM:SPINOFF:KD:dup")], targets=every4)
    R["SPIN_TERMS_OLD_ENGINE"] = dict(R["SPIN_TERMS"], old=True)
    return R


def wbs_world():
    x = next(e for e in EVID["events"] if e["kind"] == "TERMINAL_EXCHANGE")
    dates = [p[0] for p in series("discover-series", "MSFT")["points"] if "2026-07-01" <= p[0] <= "2026-10-26"]
    wbs = {p[0]: D(str(p[1])) for p in series("discover-series", "WBS")["points"] if p[0] in dates and p[0] <= x["lastTradeDate"]}
    san = {p[0]: D(str(p[1])) for p in series("discover-series", "SAN")["points"] if p[0] in dates}
    ev = {"id": "WBS:TERMINAL_EXCHANGE:" + x["closingDate"], "k": "ref_WBS", "type": "TERMINAL_EXCHANGE", "eff": x["firstSuccessorSession"], "pay": None,
          "amount": D(x["cashPerShare"]), "succ": "ref_SAN", "ratio": D(x["shareRatio"]), "time": x["informationAvailableAt"], "info": True}
    return {"dates": dates, "x": x, "wbs": wbs, "san": san, "ev": ev}


def wbs_runs(w):
    dates, x, ev = w["dates"], w["x"], w["ev"]
    px = {"ref_WBS": w["wbs"], "ref_SAN": w["san"]}
    nxt = lambda d: dates[dates.index(d) + 1]
    t1 = {dates[1]: (dates[0], {"ref_WBS": D("0.9")})}
    exit_ = {nxt(x["firstSuccessorSession"]): (x["firstSuccessorSession"], {})}
    early = {nxt(x["lastTradeDate"]): (x["lastTradeDate"], {})}
    ads = {"ref_WBS": {"cls": "COMMON_STOCK", "first": dates[0], "last": x["lastTradeDate"]}, "ref_SAN": {"cls": "ADS", "first": dates[0]}}
    mis = {"ref_WBS": ads["ref_WBS"], "ref_SAN": {"cls": "COMMON_STOCK", "first": dates[0]}}
    cons = dict(ev, pay=dates[-1])
    return {
        "WBS_NOT_STATED": dict(px=px, listings=ads, events=[ev], targets={**t1, **exit_}),
        "WBS_NOT_STATED_OLD_ENGINE": dict(px=px, listings=ads, events=[ev], targets={**t1, **exit_}, old=True),
        "WBS_CONSERVATIVE_LAST_SESSION": dict(px=px, listings=ads, events=[cons], targets={**t1, **exit_}),
        "WBS_V9_STYLE_MISLABELLED_OLD_ENGINE": dict(px=px, listings=mis, events=[dict(cons, info=False)], targets={**t1, **exit_}),
        "WBS_GUARD_DECISION_BEFORE_INFORMATION": dict(px=px, listings=ads, events=[ev], targets={**t1, **early}),
        "WBS_GUARD_ADS_TARGETED": dict(px=px, listings=ads, events=[ev], targets={**t1, nxt(x["firstSuccessorSession"]): (x["firstSuccessorSession"], {"ref_SAN": D("0.5")})}),
        "WBS_GUARD_ADS_WITHOUT_EXCHANGE": dict(px=px, listings=ads, events=[], targets=t1),
    }


# ---------------- reference journal ----------------
def solve_after(before, marked, weights, rate):
    keys = sorted(set(marked) | set(weights))
    bps = sorted({marked.get(k, D(0)) / weights[k] for k in keys if weights.get(k, D(0)) > 0} | {D(0), before})
    f = lambda a: a + rate * sum(abs(weights.get(k, D(0)) * a - marked.get(k, D(0))) for k in keys) - before
    lo = D(0)
    for b in bps:
        if b < 0:
            continue
        if f(b) > 0:
            flo, fhi = f(lo), f(b)
            return lo + (b - lo) * (-flo) / (fhi - flo) if fhi != flo else lo
        lo = b
    return lo


def legacy_rejects(run):
    """Version 1.1.0 schema: no SPINOFF, no ADS, no informationAvailableAt, no null pay date."""
    return any(e.get("info") or e["type"] == "SPINOFF" or ("pay" in e and e["pay"] is None) for e in run["events"]) or any(v["cls"] != "COMMON_STOCK" for v in run["listings"].values())


def simulate(dates, run):
    init, fee, slip = D(100000), D(10) / 10000, D(5) / 10000
    rate = fee + slip
    L, px = run["listings"], run["px"]
    # static rules
    for k, v in L.items():
        if v["cls"] == "ADS" and not any(e["type"] == "TERMINAL_EXCHANGE" and e.get("succ") == k for e in run["events"]):
            return {"error": "ADS_SUCCESSOR_ONLY"}
    seen = set()
    for e in run["events"]:
        if e["type"] == "SPINOFF":
            key = (e["k"], e["dist"], e["eff"])
            if key in seen:
                return {"error": "DUPLICATE_SPINOFF"}
            seen.add(key)
    for _, (_, w) in run["targets"].items():
        if any(v > 0 and L[k]["cls"] == "ADS" for k, v in w.items()):
            return {"error": "ADS_SUCCESSOR_ONLY"}
    closes = {d: close_at(d) for d in dates}
    cash, hold, recv, nst, pending = init, {}, [], D(0), []
    out, ledger, ntr = [], [], 0
    evs = sorted(run["events"], key=lambda e: (e["eff"], e["id"]))
    for d in dates:
        for e in [e for e in evs if e["eff"] == d]:
            if not e.get("info") and ts(e["time"]) > ts(closes[d]):
                return {"error": "EVENT_NOT_AVAILABLE"}
            u = hold.get(e["k"], D(0))
            if e.get("info") and u:
                pending.append((e["id"], ts(e["time"])))
            if e["type"] == "SPINOFF":
                if u:
                    hold[e["dist"]] = hold.get(e["dist"], D(0)) + u * e["ratio"]
            else:
                if u and e["amount"]:
                    if e["pay"] is None:
                        nst += u * e["amount"]
                    else:
                        recv.append((u * e["amount"], e["pay"]))
                if e["type"].startswith("TERMINAL"):
                    hold.pop(e["k"], None)
                    if e["type"] == "TERMINAL_EXCHANGE" and u:
                        hold[e["succ"]] = hold.get(e["succ"], D(0)) + u * e["ratio"]
            ledger.append((d, e["id"], u))
        cash += sum((a for a, p in recv if p <= d), D(0))
        recv = [(a, p) for a, p in recv if p > d]
        marked = {k: u * px[k][d] for k, u in hold.items()}
        claims = sum((a for a, _ in recv), D(0))
        before = cash + claims + sum(marked.values(), D(0))
        if d in run["targets"]:
            dec, w = run["targets"][d]
            if any(t > ts(closes[dec]) for _, t in pending):
                return {"error": "DECISION_BEFORE_EVENT_INFORMATION"}
            after = solve_after(before, marked, w, rate)
            keys = set(marked) | set(w)
            cost = sum(abs(w.get(k, D(0)) * after - marked.get(k, D(0))) for k in keys) * rate
            if sum(w.values(), D(0)) * after > (before - claims) - cost + D("1e-9") * init:
                return {"error": "UNSETTLED_CASH_NOT_INVESTABLE"}
            for k in sorted(keys):
                delta = w.get(k, D(0)) * after - marked.get(k, D(0))
                if abs(delta) <= D("1e-12") * init:
                    continue
                n = abs(delta)
                cash -= delta + n * rate
                hold[k] = hold.get(k, D(0)) + delta / px[k][d]
                if abs(hold[k]) <= D("1e-12"):
                    del hold[k]
                ntr += 1
        out.append((d, cash + claims + sum(u * px[k][d] for k, u in hold.items()), cash, claims, nst))
    return {"equity": out, "ledger": ledger, "trades": ntr, "end": out[-1][1], "notStated": nst}


def rel(a, b):
    a, b = D(str(a)), D(str(b))
    return abs(a - b) / max(D(1), abs(b))


def input_parity(js_input, dates, run):
    s_ok = [s["date"] for s in js_input["sessions"]] == dates and all(s["closeAt"] == close_at(s["date"]) for s in js_input["sessions"])
    px_dev = max((rel(b["close"], run["px"][l["listingId"]][b["date"]]) for l in js_input["listings"] for b in l["bars"]), default=D(0))
    bars_ok = all(sorted(b["date"] for b in l["bars"]) == sorted(run["px"][l["listingId"]]) for l in js_input["listings"])
    cls_ok = all(l["instrumentClass"] == run["listings"][l["listingId"]]["cls"] for l in js_input["listings"])

    def jsev(e):
        return (e["id"], e["type"], e["effectiveDate"], e.get("payDate"), str(D(str(e.get("amount", e.get("ratio", 0))))) if "amount" in e else None,
                str(D(str(e["shareRatio"]))) if "shareRatio" in e else None, e.get("informationAvailableAt") or e.get("availableAt"), "informationAvailableAt" in e)

    def pyev(e):
        return (e["id"], e["type"], e["eff"], e.get("pay"), str(e["amount"]) if "amount" in e else None, str(e["ratio"]) if "ratio" in e and e["type"] != "SPLIT" else None,
                e["time"], bool(e.get("info")))
    js_ev = sorted(jsev(e) for l in js_input["listings"] for e in l["events"])
    py_ev = sorted(pyev(e) for e in run["events"])
    norm = lambda rows: [(r[0], r[1], r[2], r[3], None if r[4] is None else str(D(r[4]).normalize()), None if r[5] is None else str(D(r[5]).normalize()), r[6], r[7]) for r in rows]
    tg = sorted((t["executionDate"], t["decisionDate"], tuple(sorted((k, str(D(str(v)).normalize())) for k, v in t["weights"].items()))) for t in js_input["targets"])
    tp = sorted((ex, dec, tuple(sorted((k, str(v.normalize())) for k, v in w.items()))) for ex, (dec, w) in run["targets"].items())
    return {"sessions": s_ok, "bars": bars_ok, "instrumentClasses": cls_ok, "events": norm(js_ev) == norm(py_ev), "targets": tg == tp, "maxRelPriceInputDiff": str(px_dev)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--private", required=True, help="private run dir written by run_ca_ledger.cjs")
    ap.add_argument("--v9-dividends", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    priv = Path(a.private)
    summ = load(priv / "summary.json")
    div = load(a.v9_dividends)
    worlds = {"SPIN": (spin_world(div, "2022-01-31"), None), "SPIN_2022": (spin_world(div, "2022-12-31"), None), "WBS": (wbs_world(), None)}
    defs = {"SPIN": spin_runs(worlds["SPIN"][0]), "WBS": wbs_runs(worlds["WBS"][0])}
    s22 = spin_runs(worlds["SPIN_2022"][0])
    defs["SPIN_2022"] = {"SPIN_2022_TERMS": s22["SPIN_TERMS"], "SPIN_2022_TERMS_OLD_ENGINE": dict(s22["SPIN_BEFORE_NO_SPINOFF_RAW"], old=True)}
    report = {"schemaVersion": "v9-followup-ledger-parity-1.0.0", "reference": "Python Decimal(50) journal; inputs rebuilt independently from ca-events.json, V9 dividend evidence and price files",
              "tolerance": str(TOL), "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "runs": {}}
    ok = True
    for sk, rows in summ["studies"].items():
        dates = worlds[sk][0]["dates"]
        for key, js_row in rows["runs"].items():
            name, _, eng = key.partition("@")
            run = defs[sk][name]
            engine = eng or js_row["engine"]
            inp = load(priv / f"{key}-input.json")
            row = {"engine": engine, "inputParity": input_parity(inp, dates, run)}
            in_ok = all(v for k, v in row["inputParity"].items() if k != "maxRelPriceInputDiff") and D(row["inputParity"]["maxRelPriceInputDiff"]) <= D("1e-12")
            if engine == "old" and legacy_rejects(run):
                row.update({"python": "REJECTED_BY_1.1.0_SCHEMA", "js": js_row.get("error"), "match": bool(js_row.get("error"))})
            else:
                py = simulate(dates, run)
                if "error" in py:
                    row.update({"python": py["error"], "js": js_row.get("error"), "match": py["error"] == js_row.get("error")})
                else:
                    js = load(priv / f"{key}-result.json")
                    dev = max(rel(e["value"], v) for e, (_, v, _, _, _) in zip(js["equity"], py["equity"]))
                    cdev = max(rel(e["cash"], c) for e, (_, _, c, _, _) in zip(js["equity"], py["equity"]))
                    rdev = max(rel(e["receivables"], r) for e, (_, _, _, r, _) in zip(js["equity"], py["equity"]))
                    ndev = max(rel(e.get("notStatedClaims", 0), n) for e, (_, _, _, _, n) in zip(js["equity"], py["equity"]))
                    led = [(x["date"], x["eventId"], x["entitlementUnits"]) for x in js["eventLedger"]]
                    ldev = max([rel(x[2], y[2]) for x, y in zip(led, py["ledger"])] or [D(0)])
                    row.update({"pythonEnd": str(py["end"]), "jsEnd": js["endCapital"], "pythonNotStated": str(py["notStated"]),
                                "jsNotStated": sum(c["amount"] for c in js.get("notStatedClaims", [])), "maxEquityRelDiff": str(dev), "maxCashRelDiff": str(cdev),
                                "maxReceivableRelDiff": str(rdev), "maxNotStatedRelDiff": str(ndev), "maxEntitlementRelDiff": str(ldev),
                                "ledgerOrderMatch": [x[:2] for x in led] == [x[:2] for x in py["ledger"]], "sessions": len(py["equity"]) == len(js["equity"]),
                                "tradesPython": py["trades"], "tradesJs": len(js["trades"])})
                    row["match"] = all(D(row[k]) <= TOL for k in ("maxEquityRelDiff", "maxCashRelDiff", "maxReceivableRelDiff", "maxNotStatedRelDiff", "maxEntitlementRelDiff")) \
                        and row["ledgerOrderMatch"] and row["sessions"] and py["trades"] == len(js["trades"])
            row["match"] = bool(row["match"] and in_ok)
            ok &= row["match"]
            report["runs"][sk + "/" + key] = row
            print(sk, key, row["match"], row.get("python") or row.get("pythonEnd"))
    report["status"] = "PASS" if ok else "FAIL"
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(report, indent=1) + "\n")
    print(report["status"])


if __name__ == "__main__":
    main()
