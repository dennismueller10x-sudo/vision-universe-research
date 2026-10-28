"""Independent cross-check (stdlib only) of the PZZA split supplement.

Inputs: committed weekly series, the supplement config, the SEC originals downloaded
in this session, and the Node-produced before-after.json. Recomputes everything from
the raw inputs with its own code (decimal rounding, own split-sized rule, own date
logic) and reports parity.
"""
import sys, json, hashlib, re, html, datetime
from decimal import Decimal, ROUND_HALF_UP

repo, secdir, out = sys.argv[1], sys.argv[2], sys.argv[3]
cfg = json.load(open(f"{repo}/quant/config/split-evidence-supplements.json"))
e = cfg["entries"][0]
doc = json.load(open(f"{repo}/quant/data/market/discover-series-long/ref_PZZA.json"))
node = json.load(open(f"{repo}/docs/quant-recovery/v9-followups/pzza-split/before-after.json"))["rows"][0]
res = {"checks": {}}

def text_of(path):
    raw = open(path, "rb").read()
    t = raw.decode("utf-8", "replace")
    t = re.sub(r"(?is)<(script|style).*?</\1>", " ", t)
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    t = html.unescape(t).replace("’", "'")
    return raw, re.sub(r"\s+", " ", t)

# 1) SEC documents: sha256 and verbatim quotes
for d in e["evidence"]:
    raw, t = text_of(f"{secdir}/{d['url'].rsplit('/', 1)[1]}")
    res["checks"][f"sha256 {d['accession']}"] = hashlib.sha256(raw).hexdigest() == d["sha256"]
    res["checks"][f"quote {d['accession']}"] = d["quote"].replace("’", "'") in t
    res["checks"][f"record date in {d['accession']}"] = "December 12, 2013" in t
    res["checks"][f"distribution date in {d['accession']}"] = "December 27, 2013" in t

# 2) ex-date: first business day after payable date (NYSE holidays around year end 2013)
holidays = {datetime.date(2013, 12, 25), datetime.date(2014, 1, 1)}
pay = datetime.date.fromisoformat(e["payableDate"])
d = pay + datetime.timedelta(days=1)
while d.weekday() >= 5 or d in holidays:
    d += datetime.timedelta(days=1)
res["checks"]["exDate = first business day after payable"] = d.isoformat() == e["exDate"]
res["exDateComputed"] = d.isoformat()

# 3) corrected weekly series
def rnd(v):
    v = Decimal(repr(v))
    if v >= 1:
        return float(v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    return float(Decimal(format(float(v), ".4g")))

pts = doc["points"]
changed = ambiguous = 0
bad = []
after = []
for date, p in pts:
    if date >= e["exDate"]:
        after.append(p); continue
    changed += 1
    unit = Decimal("0.01") if p >= 1 else Decimal(10) ** (Decimal(p).adjusted() - 3)
    P = Decimal(repr(p))
    lo, hi = (P - unit / 2) / 2, (P + unit / 2) / 2
    mid = float(P / 2)
    after.append(mid)
    if rnd(float(lo)) != rnd(float(hi) - 1e-12):
        ambiguous += 1
res["pointsChanged"] = changed
res["pointsAmbiguousByCentRounding"] = ambiguous
res["checks"]["pointsChanged parity"] = changed == node["pointsChanged"]
res["checks"]["ambiguous parity"] = ambiguous == node["pointsAmbiguousByCentRounding"]
res["checks"]["lastChanged parity"] = max(dt for dt, _ in pts if dt < e["exDate"]) == node["lastChanged"]

# 4) split-sized weekly moves before/after (own rule: within 3% of 2,3,4,5,10 or reciprocal)
def split_sized(r):
    return any(abs(r / k - 1) < 0.03 or abs(r * k - 1) < 0.03 for k in (2, 3, 4, 5, 10))
moves_before = [pts[i][0] for i in range(1, len(pts)) if split_sized(pts[i][1] / pts[i - 1][1])]
moves_after = [pts[i][0] for i in range(1, len(pts)) if split_sized(after[i] / after[i - 1])]
res["movesBefore"], res["movesAfter"] = moves_before, moves_after
res["checks"]["only the ex-week was split-sized before"] = moves_before == ["2014-01-03"]
res["checks"]["no split-sized week after"] = moves_after == []
i = [p[0] for p in pts].index("2014-01-03")
res["exWeekRatioAfter"] = round(after[i] / after[i - 1], 6)
res["checks"]["ex-week ratio parity (+-rounding)"] = abs(res["exWeekRatioAfter"] - node["exWeek"]["ratioAfter"]) < 1e-3

# 5) node 'after' points within this check's rounding band
node_around = {a["week"]: a["after"] for a in node["around"]}
res["checks"]["around parity"] = all(abs(node_around[w] - (after[[p[0] for p in pts].index(w)])) <= 0.0050001 for w in node_around)
res["maxRangeReturnAfter"] = round(after[-1] / after[0], 6)
res["checks"]["max-range return parity"] = abs(res["maxRangeReturnAfter"] - node["maxRangeReturn"]["after"]) < 1e-6
res["allPass"] = all(res["checks"].values())
json.dump(res, open(out, "w"), indent=1)
print(json.dumps(res, indent=1))
