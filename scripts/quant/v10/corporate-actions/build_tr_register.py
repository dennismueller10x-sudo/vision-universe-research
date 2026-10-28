#!/usr/bin/env python3
"""V10 TR register: consolidate the private dividend extractions into the research total-return register (tr-protocol-1.0.1).

Admission, completeness windows, split consistency and the derived (never sourced) ex-date follow the protocol. Network use:
split statements (re-fetched), index-headers of each admitted event's earliest source (acceptance time), companyfacts cross-check;
all through scripts/quant/sec/http_client.py at <= 1 request/s with the harvester's private cache.
  python3 scripts/quant/v10/corporate-actions/build_tr_register.py --private <dir> --out docs/quant-recovery/v10/corporate-actions/tr-register-1.0.0.json
"""
import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import zoneinfo
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "scripts" / "quant" / "sec"))
import http_client  # noqa: E402

PROTOCOL = ROOT / "docs/quant-recovery/v10/corporate-actions/tr-protocol-1.0.1.json"
TP = json.loads(PROTOCOL.read_text())
PROTOCOL_SHA = hashlib.sha256(PROTOCOL.read_bytes()).hexdigest()
PERIOD = (TP["period"]["recordDateFrom"], TP["period"]["recordDateTo"])
CAL = json.loads((ROOT / "quant/config/market-calendar.json").read_text())
HOL = set(CAL["exchanges"]["XNYS"]["holidays"])
CAL_FROM = CAL["coverage"]["from"]
V9_SPLITS = json.loads((ROOT / "docs/quant-recovery/v9/portfolio/split-evidence.json").read_text())
RATIO_WORDS = {2: "two", 3: "three", 4: "four", 10: "ten"}


def quarter(d):
    return f"{d[:4]}Q{(int(d[5:7]) - 1) // 3 + 1}"


def quarters(a, b):
    out, y, q = [], int(a[:4]), int(a[5])
    while f"{y}Q{q}" <= b:
        out.append(f"{y}Q{q}")
        q += 1
        if q == 5:
            y, q = y + 1, 1
    return out


def qstart(q):
    return dt.date(int(q[:4]), 3 * int(q[5]) - 2, 1).isoformat()


def qend(q):
    y, n = int(q[:4]), int(q[5])
    return (dt.date(y + (n == 4), 1 if n == 4 else 3 * n + 1, 1) - dt.timedelta(days=1)).isoformat()


def norm(x):
    v = Decimal(x)
    return format(v.normalize(), "f") if v != v.to_integral() else format(v.quantize(Decimal(1)), "f")


def business_back(d, n):
    """n business days before date d (weekends; XNYS holidays only where the repository calendar covers the year)."""
    t = dt.date.fromisoformat(d)
    while n > 0:
        t -= dt.timedelta(days=1)
        iso = t.isoformat()
        if t.weekday() < 5 and not (iso >= CAL_FROM and iso in HOL):
            n -= 1
    return t.isoformat()


def ex_derived(record):
    n = 0 if record >= "2024-05-28" else 1 if record >= "2017-09-07" else 2
    return business_back(record, n), {0: "T+1 (record date)", 1: "T+2 (record - 1 business day)", 2: "T+3 (record - 2 business days)"}[n]


class Client:
    def __init__(self, private, rate=1.0):
        self.c = http_client.SECHttpClient(cache=http_client.DiskCache(directory=str(Path(private) / "div-cache"), ttl_seconds=None),
                                           rate_limiter=http_client.RateLimiter(rate_per_second=rate, burst=1))

    def get(self, url):
        return self.c.get_bytes(url)


def text(raw):
    t = raw.decode("utf8", "replace")
    t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", t)
    t = re.sub(r"<[^>]+>", " ", t)
    import html
    return re.sub(r"\s+", " ", html.unescape(t).replace("\xa0", " "))


def header(cl, cik, acc):
    url = "https://www.sec.gov/Archives/edgar/data/%d/%s/%s-index-headers.html" % (int(cik), acc.replace("-", ""), acc)
    raw = cl.get(url)
    m = re.search(r"<ACCEPTANCE-DATETIME>(\d{14})", raw.decode("utf8", "replace"))
    if not m:
        return {"url": url, "sha256": hashlib.sha256(raw).hexdigest(), "acceptanceUtc": None}
    east = dt.datetime.strptime(m.group(1), "%Y%m%d%H%M%S").replace(tzinfo=zoneinfo.ZoneInfo("America/New_York"))
    return {"url": url, "sha256": hashlib.sha256(raw).hexdigest(), "rawEastern": m.group(1),
            "acceptanceUtc": east.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")}


def provider_factors(cl, tk, series):
    """Provider split factors inside the period, each confirmed (or labelled non-split) by a re-fetched SEC document."""
    out = []
    for date, factor in series["corporateActions"]["splits"]:
        if not (PERIOD[0] <= date <= "2026-10-23"):
            continue
        cand = [s for s in V9_SPLITS["splits"] if s["ticker"] == tk and [date, factor] in s.get("providerSplitFactor", [])]
        rec = {"date": date, "factor": factor, "sources": []}
        for s in cand:
            for doc in s["documents"]:
                raw = cl.get(doc["url"])
                t = text(raw)
                acc = re.search(r"/(\d{10})(\d{2})(\d{6})/", doc["url"])
                accession = "%s-%s-%s" % acc.groups()
                src = {"url": doc["url"], "accession": accession, "sha256": hashlib.sha256(raw).hexdigest()}
                if s["kind"] == "SPLIT":
                    k = int(round(factor))
                    w = RATIO_WORDS.get(k, str(k))
                    m = re.search(r"(?i)(%s|%d)[- ]for[- ](one|1)\b|dividend of (%s|%d) additional shares|(%s|%d) additional shares" % (w, k, RATIO_WORDS.get(k - 1, "x"), k - 1, RATIO_WORDS.get(k - 1, "x"), k - 1), t)
                    src["quote"] = t[max(0, m.start() - 120): m.end() + 150][:300] if m else None
                else:
                    m = re.search(r"(?i)distribution[^.]{0,200}Kyndryl|Kyndryl[^.]{0,200}distribution|spin[- ]?off", t)
                    src["quote"] = t[max(0, m.start() - 60): m.end() + 200][:300] if m else None
                rec["sources"].append(src)
            rec["kind"] = "STOCK_SPLIT" if s["kind"] == "SPLIT" else "PROVIDER_NON_SPLIT_FACTOR"
            rec["v9Kind"] = s["kind"]
        if not cand:
            rec["kind"] = "UNCONFIRMED_PROVIDER_FACTOR"
        rec["confirmed"] = bool(rec["sources"]) and all(x["quote"] for x in rec["sources"][:1])
        out.append(rec)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--private", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    cl = Client(a.private)
    titles = []
    for tk, cik in sorted(TP["titles"].items()):
        ext = json.loads((Path(a.private) / "dividend-extractions" / f"{tk}.json").read_text())
        series = json.loads((ROOT / f"quant/data/market/discover-series-long/ref_{tk}.json").read_text())
        weeks = [p[0] for p in series["points"]]
        pf = provider_factors(cl, tk, series)
        splits = [p for p in pf if p["kind"] == "STOCK_SPLIT" and p["confirmed"]]
        groups, partial, errors, docs = {}, {}, [], 0
        for r in ext["documents"]:
            if r.get("error"):
                errors.append({"accession": r["accession"], "file": r["file"], "error": r["error"]})
                continue
            docs += 1
            for e in r["events"]:
                if not e.get("recordDate"):
                    if e.get("payDate") and e.get("amount"):
                        partial.setdefault(quarter(e["payDate"]), []).append({"accession": r["accession"], "payDate": e["payDate"], "amount": norm(e["amount"])})
                    continue
                if not (PERIOD[0] <= e["recordDate"] <= PERIOD[1]) or e.get("intentOnly"):
                    continue
                groups.setdefault(e["recordDate"], []).append({"accession": r["accession"], "file": r["file"], "url": r["url"], "form": r["form"],
                                                               "fileDate": r["fileDate"], "sha256": r["sha256"], "discovery": r.get("discovery"),
                                                               "pattern": e["pattern"], "kind": e["kind"], "payDate": e["payDate"],
                                                               "amount": norm(e["amount"]) if e.get("amount") else None,
                                                               "declarationDate": e.get("declarationDate"), "quote": e["quote"][:300]})
        events, rejected = [], []
        for rec, atts in sorted(groups.items()):
            later = [s for s in splits if s["date"] > rec]
            contemp, restated = set(), []
            for x in atts:
                f = Decimal(1)
                for s in later:
                    if s["date"] <= x["fileDate"]:
                        f *= Decimal(str(s["factor"]))
                if x["amount"]:
                    (contemp.add(x["amount"]) if f == 1 else restated.append({"accession": x["accession"], "amount": x["amount"], "factor": str(f)}))
            pays = sorted({x["payDate"] for x in atts if x["payDate"]})
            kinds = sorted({x["kind"] for x in atts})
            why = None
            if "SPECIAL" in kinds:
                why = "SPECIAL_OR_MIXED_KIND"
            elif len(pays) != 1:
                why = "PAY_DATE_CONFLICT" if pays else "PAY_DATE_MISSING"
            elif len(contemp) != 1:
                why = "AMOUNT_CONFLICT" if contemp else "CONTEMPORANEOUS_AMOUNT_MISSING"
            elif pays[0] < rec:
                why = "PAY_BEFORE_RECORD"
            if why is None and restated:
                c = Decimal(next(iter(contemp)))
                if not all(abs(Decimal(r_["amount"]) * Decimal(r_["factor"]) - c) <= Decimal(r_["factor"]) * Decimal("0.0005") for r_ in restated):
                    why = "RESTATED_AMOUNT_INCONSISTENT"
            if why:
                rejected.append({"recordDate": rec, "reason": why, "payDates": pays, "amounts": sorted(contemp), "attestations": len(atts)})
                continue
            amount = next(iter(contemp))
            exd, rule = ex_derived(rec)
            factor = Decimal(1)
            for p in pf:
                if p["date"] > exd and p["kind"] in ("STOCK_SPLIT", "PROVIDER_NON_SPLIT_FACTOR"):
                    factor *= Decimal(str(p["factor"]))
            ent = next((w for w in weeks if w >= exd), None)
            pay_session = next((w for w in weeks if w >= pays[0]), None)
            invariant = next((w for w in weeks if w >= business_back(rec, 3)), None) == next((w for w in weeks if w >= rec), None)
            timed = sorted(atts, key=lambda x: (x["fileDate"], x["accession"]))
            first = next(x for x in timed if x["payDate"] == pays[0] and x["amount"] == amount)
            h = header(cl, cik, first["accession"])
            decls = sorted({x["declarationDate"] for x in atts if x["declarationDate"]})
            events.append({
                "id": f"{tk}:DIV:{rec}", "recordDate": rec, "payDate": pays[0], "amount": amount, "currency": "USD", "kind": "REGULAR",
                "exDateDerived": exd, "exDateState": "DERIVED_SETTLEMENT_RULE_NOT_SOURCED", "exDateRule": rule,
                "declarationDate": decls[0] if len(decls) == 1 else None, "declarationDateState": "STATED" if len(decls) == 1 else ("NOT_STATED" if not decls else "CONFLICT"),
                "seriesUnitFactor": float(factor), "amountSeriesUnits": float(Decimal(amount) / factor),
                "entitlementSession": ent, "paySession": pay_session, "weeklyMappingInvariantToExDateRule": invariant,
                "informationAvailableAt": h["acceptanceUtc"], "availabilitySource": {"accession": first["accession"], "header": h},
                "restatedAttestations": restated, "attestationCount": len(atts), "distinctFilings": len({x["accession"] for x in atts}),
                "sources": [{k: x[k] for k in ("accession", "url", "sha256", "form", "fileDate", "pattern", "discovery", "quote")} for x in timed],
            })
        first_q = "2024Q1" if tk == "META" else "2015Q1"
        expected = quarters(first_q, "2026Q3")
        byq = {}
        for ev in events:
            byq.setdefault(quarter(ev["recordDate"]), []).append(ev["recordDate"])
        rej_q = {}
        for r in rejected:
            rej_q.setdefault(quarter(r["recordDate"]), []).append(r["reason"])
        status = []
        for q in expected:
            if len(byq.get(q, [])) == 1:
                status.append({"quarter": q, "status": "COVERED", "recordDate": byq[q][0]})
            elif len(byq.get(q, [])) > 1:
                status.append({"quarter": q, "status": "GAP_MULTIPLE_RECORD_DATES", "recordDates": byq[q]})
            elif q in rej_q:
                status.append({"quarter": q, "status": "GAP_CONFLICT", "reasons": rej_q[q]})
            elif q in partial:
                status.append({"quarter": q, "status": "GAP_RECORD_DATE_NOT_STATED", "payDatesStated": sorted({x["payDate"] for x in partial[q]})})
            else:
                status.append({"quarter": q, "status": "GAP_NO_SEC_ATTESTATION"})
        cuts = sorted(p["date"] for p in pf if p["kind"] != "STOCK_SPLIT" or not p["confirmed"])
        windows, run = [], []
        for s in status + [{"status": "END"}]:
            if s["status"] == "COVERED":
                run.append(s["quarter"])
                continue
            if run:
                windows.append((run[0], run[-1]))
            run = []
        tr_windows = []
        for q0, q1 in windows:
            lo, hi = qstart(q0), min(qend(q1), "2026-10-23")
            bounds = [lo] + [c for c in cuts if lo < c <= hi] + [hi]
            for i in range(len(bounds) - 1):
                w_lo, w_hi = bounds[i], bounds[i + 1] if i + 2 == len(bounds) else (dt.date.fromisoformat(bounds[i + 1]) - dt.timedelta(days=1)).isoformat()
                tr_windows.append({"from": w_lo, "to": w_hi, "quarters": len([q for q in expected if q0 <= q <= q1 and qend(q) >= w_lo and qstart(q) <= w_hi]),
                                   "cutBy": [c for c in cuts if c == bounds[i + 1]] if i + 2 < len(bounds) else []})
        covered = sum(s["status"] == "COVERED" for s in status)
        titles.append({
            "ticker": tk, "cik": cik, "securityId": "ref_" + tk, "documentsScanned": docs, "documentErrors": errors,
            "expectedQuarters": len(expected), "coveredQuarters": covered, "complete": covered == len(expected),
            "v9Covered": next((c["eventsInExpectedQuartersWithPayDateAndAmount"] for c in json.loads((ROOT / "docs/quant-recovery/v9/portfolio/dividend-evidence.json").read_text())["companies"] if c["ticker"] == tk), None),
            "gapSearch": {"gapsAfterPass1": ext.get("gapsAfterPass1"), "log": ext.get("gapSearch")},
            "providerFactors": pf, "totalReturnWindows": tr_windows, "quarterStatus": status, "rejectedRecordDates": rejected, "events": events,
            "portfolioEvents": [{"id": ev["id"], "type": "CASH_DIVIDEND", "effectiveDate": ev["entitlementSession"], "payDate": ev["payDate"], "amount": ev["amountSeriesUnits"],
                                 "currency": "USD", "informationAvailableAt": ev["informationAvailableAt"], "sourceHash": ev["sources"][0]["sha256"], "sequence": 0}
                                for ev in events if ev["entitlementSession"] and ev["informationAvailableAt"]],
        })
    reg = {
        "schemaVersion": "v10-tr-register-1.0.0", "protocol": "docs/quant-recovery/v10/corporate-actions/tr-protocol-1.0.1.json", "protocolSha256": PROTOCOL_SHA,
        "evidenceKind": "SOURCE_EVIDENCE", "certificationStatus": "NOT_CERTIFIED", "productionApproved": False,
        "returnBasisLabels": {"PRICE_RETURN": "split-adjusted closes only (default everywhere)", "TOTAL_RETURN": "only for holding periods fully inside a totalReturnWindow of the title, dividends credited at payDate",
                              "CA_UNRESOLVED": "series not QUALIFIED by createResearchLoader {identityEvidence, corporateActionEvidence}: no return basis", "TERMINAL_UNKNOWN": "terminal proceeds without sourced pay date: never credited (research-portfolio NOT_STATED)"},
        "rules": ["exDate never used as payDate and never sourced (exDateDerived only)", "no cash booked on the ex-date", "fields not stated stay null", "no dividend inferred from neighbouring quarters",
                  "SEC acceptance from index-headers = availability upper bound, not publication time", "amountSeriesUnits = amount / product of later provider factors (split-consistent with the series)"],
        "codeSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "harvesterSha256": hashlib.sha256((Path(__file__).parent / "harvest_dividends_v10.py").read_bytes()).hexdigest(),
        "titles": titles,
    }
    Path(a.out).write_text(json.dumps(reg, indent=1) + "\n")
    for t in titles:
        print(t["ticker"], "covered", t["coveredQuarters"], "/", t["expectedQuarters"], "v9", t["v9Covered"], "windows", [(w["from"], w["to"]) for w in t["totalReturnWindows"]],
              "rejected", len(t["rejectedRecordDates"]), "docs", t["documentsScanned"])
    print("requests", cl.c.stats)


if __name__ == "__main__":
    main()
