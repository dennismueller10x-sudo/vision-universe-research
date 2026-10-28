"""Unabhaengige Nachrechnung von DQ-PX-6, DQ-PX-7 und DQ-ID-4 (stdlib only).

Liest die Rohartefakte (Tages-/Wochenreihen, us-security-master.json,
market-calendar.json) und rechnet die markierten Mengen OHNE den JS-Code
(core/listing-staleness.js, core/data-quality.js) neu. Vergleicht mit einem
DQ-Bericht (node scripts/core/data-quality.mjs --out=...) und schreibt die
Paritaet.

    python3 -I scripts/core/stale-tails/check_stale_tails.py \
        --root . --dq-report <dq-after.json> --out <parity.json>

Schreibt nichts ins Repository ausser --out.
"""
import argparse
import datetime as dt
import json
import os

DAILY_MIN = 5
WEEKLY_MIN = 4
GRACE_DAYS = 7
MAX_LAG = 2


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def trailing(points):
    """(run, since, close, to) of the trailing block of exactly equal closes."""
    if not points:
        return None
    last = points[-1][1]
    k = len(points) - 1
    while k > 0 and points[k - 1][1] == last:
        k -= 1
    return len(points) - k, points[k][0], last, points[-1][0]


def read_series(directory):
    out = {}
    for name in sorted(os.listdir(directory)):
        if name.startswith("ref_") and name.endswith(".json"):
            try:
                doc = load(os.path.join(directory, name))
            except (OSError, ValueError):
                continue
            out[doc["securityId"]] = doc
    return out


def master_states(master):
    states = {}
    for row in master["rows"]:
        sid = row.get("baseline_security_id")
        if not sid:
            continue
        st = states.setdefault(sid, {"statuses": set(), "ends": [], "n": 0})
        st["n"] += 1
        st["statuses"].add(row.get("active_status"))
        if row.get("end_date"):
            st["ends"].append(row["end_date"])
    return states


def make_lag(calendar):
    xnys = calendar["exchanges"]["XNYS"]
    holidays = set(xnys["holidays"])
    weekdays = set(xnys["weekdays"])  # 1=Mon .. 5=Fri (JS getUTCDay)

    def trading(day):
        return (day.isoweekday() % 7) in weekdays and day.isoformat() not in holidays

    def lag(date, expected):
        if date >= expected:
            return 0
        d = dt.date.fromisoformat(date)
        e = dt.date.fromisoformat(expected)
        n = 0
        while d < e and n < 60:
            d += dt.timedelta(days=1)
            while not trading(d):
                d += dt.timedelta(days=1)
            n += 1
        return n
    return lag


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--dq-report", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root = a.root
    market = os.path.join(root, "quant", "data", "market")
    daily = read_series(os.path.join(market, "discover-series"))
    weekly = read_series(os.path.join(market, "discover-series-long"))
    states = master_states(load(os.path.join(market, "security-master", "us-security-master.json")))
    lag = make_lag(load(os.path.join(root, "quant", "config", "market-calendar.json")))
    report = load(a.dq_report)
    expected = report["expectedSession"]

    def stale(series, minimum):
        flagged = {}
        for sid, doc in series.items():
            st = states.get(sid)
            if not st or "ACTIVE" not in st["statuses"]:
                continue
            t = trailing(doc["points"])
            if t and t[0] >= minimum:
                flagged[sid] = t[0]
        return flagged

    py_daily = stale(daily, DAILY_MIN)
    py_weekly = stale(weekly, WEEKLY_MIN)

    py_conflict = {}
    for sid, doc in daily.items():
        st = states.get(sid)
        if not st:
            continue
        t = trailing(doc["points"])
        if not t:
            continue
        run, _, _, to = t
        lg = lag(to, expected)
        if "ACTIVE" in st["statuses"]:
            if lg > MAX_LAG:
                py_conflict[sid] = "MASTER_ACTIVE_SERIES_ENDED"
            continue
        if not st["ends"]:
            continue
        limit = (dt.date.fromisoformat(max(st["ends"])) + dt.timedelta(days=GRACE_DAYS)).isoformat()
        if to <= limit:
            continue
        if run >= DAILY_MIN:
            py_conflict[sid] = "MASTER_INACTIVE_SERIES_FROZEN"
        elif lg <= MAX_LAG:
            py_conflict[sid] = "MASTER_INACTIVE_SERIES_CURRENT"
        else:
            py_conflict[sid] = "MASTER_INACTIVE_SERIES_AFTER_END"

    rules = {r["id"]: r for r in report["rules"]}
    js_daily = {f["securityId"]: f["run"] for f in rules["DQ-PX-6"]["findings"]}
    js_weekly = {f["securityId"]: f["run"] for f in rules["DQ-PX-7"]["findings"]}
    js_conflict = {f["securityId"]: f["class"] for f in rules["DQ-ID-4"]["findings"]}

    def diff(py, js):
        keys = sorted(set(py) | set(js))
        bad = [{"securityId": k, "python": py.get(k), "js": js.get(k)} for k in keys if py.get(k) != js.get(k)]
        return {"python": len(py), "js": len(js), "mismatches": bad, "parity": not bad}

    out = {
        "schemaVersion": "v9-followup-stale-tails-independent-check-1.0.0",
        "implementation": "python3 stdlib, no JS code reused",
        "expectedSession": expected,
        "thresholds": {"dailyMinRun": DAILY_MIN, "weeklyMinRun": WEEKLY_MIN, "graceDays": GRACE_DAYS, "maxLag": MAX_LAG},
        "DQ-PX-6": diff(py_daily, js_daily),
        "DQ-PX-7": diff(py_weekly, js_weekly),
        "DQ-ID-4": diff(py_conflict, js_conflict),
    }
    out["parity"] = all(out[k]["parity"] for k in ("DQ-PX-6", "DQ-PX-7", "DQ-ID-4"))
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1, sort_keys=False)
        fh.write("\n")
    print(json.dumps({k: (v if not isinstance(v, dict) else {kk: vv for kk, vv in v.items() if kk != "mismatches"}) for k, v in out.items()}, indent=1))


if __name__ == "__main__":
    main()
