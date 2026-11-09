#!/usr/bin/env python3
"""Unabhaengige Gegenrechnung des Setup-OOS-Auswerters (quant/engines/setup-oos.cjs).

Nur Standardbibliothek. Liest {"input": ..., "result": ...} von stdin
(--stdin), rechnet Status, Grund, Schnitt, Segmentgroessen und Kennzahlen
selbst nach und gibt {"ok": bool, "expected": {...}, "diff": [...]} aus.
Kennzahlen werden mit Toleranz 1e-12 verglichen.
"""
import json
import sys
from datetime import date, timedelta

METHODS = ("CHRONOLOGICAL_MEDIAN_EVENT_DATE", "FIXED_CALENDAR_CUT")
METRICS = ("MEDIAN_EXCESS", "MEDIAN_NET")
RULES = ("POSITIVE_IN_BOTH", "SIGN_REPLICATES")


def parse_date(s):
    if not isinstance(s, str) or len(s) != 10:
        return None
    try:
        d = date.fromisoformat(s)
    except ValueError:
        return None
    return d if d.isoformat() == s else None


def is_int(x):
    return isinstance(x, int) and not isinstance(x, bool)


def is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and x == x and x not in (float("inf"), float("-inf"))


def med(values):
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def sgn(x):
    return 1 if x > 0 else (-1 if x < 0 else 0)


def valid_seg(s):
    if not isinstance(s, dict) or not isinstance(s.get("id"), str) or not s["id"]:
        return False
    if s.get("method") not in METHODS:
        return False
    if s["method"] == "FIXED_CALENDAR_CUT":
        if parse_date(s.get("cutDate")) is None:
            return False
    elif s.get("cutDate") is not None:
        return False
    e = s.get("embargoDays")
    if not is_int(e) or e < 0 or e > 3660:
        return False
    c = s.get("criterion")
    if "countBy" in s and s["countBy"] not in ("ROWS", "EVENT_DAY"):
        return False
    return isinstance(c, dict) and c.get("metric") in METRICS and c.get("rule") in RULES


def evaluate(inp):
    out = {"status": "FAIL", "reasonCode": None, "completed": 0, "segmentation": None, "purged": 0, "segments": None}
    m = inp.get("minPerSegment")
    if not is_int(m) or m < 1:
        out["reasonCode"] = "OOS_MIN_PER_SEGMENT_INVALID"
        return out
    rows = None
    if isinstance(inp.get("rows"), list):
        rows = []
        for r in inp["rows"]:
            if not isinstance(r, dict) or parse_date(r.get("date")) is None or not is_num(r.get("net")):
                continue
            b = r.get("b")
            ex = r["net"] - b["median"] if isinstance(b, dict) and is_num(b.get("median")) else None
            rows.append((r["date"], r["net"], ex))
        rows.sort(key=lambda x: x[0])
        completed = len(rows)
    else:
        cc = inp.get("completedCount")
        completed = cc if is_int(cc) and cc > 0 else 0
    out["completed"] = completed
    if completed < 2 * m:
        out["reasonCode"] = "OOS_NOT_MEASURABLE_YET"
        return out
    s = inp.get("segmentation")
    if s is None:
        out["reasonCode"] = "OOS_SEGMENT_DEFINITION_MISSING"
        return out
    if not valid_seg(s):
        out["reasonCode"] = "OOS_SEGMENT_DEFINITION_INVALID"
        return out
    out["segmentation"] = s["id"]
    if rows is None:
        out["reasonCode"] = "OOS_ROWS_NOT_EXPORTED"
        return out
    cut = s["cutDate"] if s["method"] == "FIXED_CALENDAR_CUT" else rows[(len(rows) - 1) // 2][0]
    cut_d = parse_date(cut)
    test = [r for r in rows if r[0] >= cut]
    before = [r for r in rows if r[0] < cut]
    train = [r for r in before if parse_date(r[0]) + timedelta(days=s["embargoDays"]) < cut_d]
    idx = 2 if s["criterion"]["metric"] == "MEDIAN_EXCESS" else 1

    def summ(lst):
        valid = [r for r in lst if r[idx] is not None]
        vals = [r[idx] for r in valid]
        if s.get("countBy") == "EVENT_DAY":
            return {"n": len(set(r[0] for r in valid)), "nAll": len(lst), "metric": med(vals)}
        return {"n": len(vals), "nAll": len(lst), "metric": med(vals)}

    seg = {"cutDate": cut, "train": summ(train), "test": summ(test)}
    out["purged"] = len(before) - len(train)
    out["segments"] = seg
    if seg["train"]["n"] < m or seg["test"]["n"] < m:
        out["reasonCode"] = "OOS_SEGMENT_TOO_SMALL"
        return out
    a, b = sgn(seg["train"]["metric"]), sgn(seg["test"]["metric"])
    ok = (a > 0 and b > 0) if s["criterion"]["rule"] == "POSITIVE_IN_BOTH" else (a != 0 and a == b)
    out["status"] = "PASS" if ok else "FAIL"
    out["reasonCode"] = None if ok else "OOS_DIRECTION_NOT_REPLICATED"
    return out


def compare(exp, got):
    diff = []
    for k in ("status", "reasonCode", "completed", "segmentation", "purged"):
        if exp[k] != got.get(k):
            diff.append(k)
    es, gs = exp["segments"], got.get("segments")
    if (es is None) != (gs is None):
        diff.append("segments")
    elif es is not None:
        if es["cutDate"] != gs.get("cutDate"):
            diff.append("segments.cutDate")
        for part in ("train", "test"):
            for k in ("n", "nAll"):
                if es[part][k] != gs[part].get(k):
                    diff.append("segments." + part + "." + k)
            em, gm = es[part]["metric"], gs[part].get("metric")
            if (em is None) != (gm is None) or (em is not None and abs(em - gm) > 1e-12):
                diff.append("segments." + part + ".metric")
    return diff


def main():
    if "--stdin" not in sys.argv:
        print("usage: verify-setup-oos.py --stdin", file=sys.stderr)
        return 2
    payload = json.load(sys.stdin)
    exp = evaluate(payload["input"])
    diff = compare(exp, payload["result"])
    print(json.dumps({"ok": not diff, "expected": exp, "diff": diff}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
