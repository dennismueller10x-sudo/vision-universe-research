"""SEC-Gegenprobe fuer eine geschichtete Stichprobe markierter Titel (DQ-PX-6/7).

Fuer jeden Titel: CIK aufloesen (1. quant/data/universe/cik-map.json, SEC-Tickerliste
2026-09-13, nur wenn dieser Inhaber schon vor dem Einfrierbeginn einreichte;
2. EDGAR-Volltextsuche: Ticker auf dem Deckblatt von 8-K/10-Q/10-K/20-F/6-K in den
drei Jahren vor dem Einfrierbeginn, eindeutige Mehrheit), EDGAR-Submissions lesen
und nach Delisting-Belegen suchen (Form 25 / 25-NSE, 15-12B / 15-12G / 15-15D,
8-K Item 2.01 / 3.01). Fenster: [Einfrierbeginn - 120 Tage, heute]; ist die ganze
veroeffentlichte Reihe flach, liegt der Einfrierbeginn davor und alle Einreichungen
zaehlen. Einstufung:

  CONFIRMED_DELISTED            Form 25/25-NSE oder 15-12B/15-12G/15-15D im Fenster,
                                und der Ticker steht heute nicht mehr in der SEC-Liste
  STILL_LISTED_PROVIDER_STALE   kein solches Formular, der Emittent hat in den letzten
                                120 Tagen 10-K/10-Q/8-K/20-F/6-K eingereicht und ist
                                heute unter diesem (oder einem neuen) Ticker an einer
                                Boerse gelistet
  UNKNOWN                       sonst (keine CIK, kein eindeutiger Emittent, kein Beleg,
                                oder Form 25 bei weiter gelistetem Ticker)

Schichten (deterministisch, Reihenfolge nach sha256(securityId), keine
Vorauswahl nach CIK-Verfuegbarkeit):
  DAILY_ONLY      nur DQ-PX-6 (Tageslauf >= 5, Wochenlauf < 4)
  WEEKLY_4_12     DQ-PX-7 mit 4..12 Wochen
  WEEKLY_13_52    13..52 Wochen
  WEEKLY_53_PLUS  >= 53 Wochen

SEC nur ueber scripts/quant/sec/http_client.py, RateLimiter 2 req/s, Burst 1.
Rohantworten nur im Cache (--cache, ausserhalb des Repositorys).

    python3 -I scripts/core/stale-tails/sec_sample.py --root . \
        --dq-report <dq-after.json> --cache <privat>/http-cache --per-stratum 6 --out <sample.json>
"""
import argparse
import datetime as dt
import glob
import hashlib
import json
import os
import re
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "quant", "sec"))
from http_client import DiskCache, RateLimiter, SECHttpClient, SECHTTPError  # noqa: E402

DELIST_FORMS = {"25", "25-NSE", "15-12B", "15-12G", "15-15D"}
PERIODIC = {"10-K", "10-Q", "8-K", "20-F", "6-K", "40-F", "10-K/A", "10-Q/A"}
WINDOW_BEFORE = 120
WHOLE_WINDOW_BEFORE = 5 * 365
RECENT_DAYS = 120
# Vorzugs-/Depositary-/Anteilsklassen: ein Emittentenformular belegt nicht den Status der Klasse.
CLASS_WORDS = re.compile(r"Depositary|Preferred|Pfd|Perp|Notes|Debentures|Warrant|Right|Unit", re.I)


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


class Sec:
    def __init__(self, cache):
        self.client = SECHttpClient(cache=DiskCache(cache, ttl_seconds=None), rate_limiter=RateLimiter(2.0, 1))

    def json(self, url):
        return json.loads(self.client.get_bytes(url, expected_statuses=(404,)).decode("utf-8"))


def submissions(sec, cik, since):
    base = sec.json("https://data.sec.gov/submissions/CIK%010d.json" % int(cik))
    rows = []

    def take(block):
        n = len(block.get("form", []))
        for i in range(n):
            rows.append({"form": block["form"][i], "filingDate": block["filingDate"][i],
                         "items": block.get("items", [""] * n)[i] or "", "accession": block["accessionNumber"][i],
                         "primaryDocument": block.get("primaryDocument", [""] * n)[i]})
    take(base["filings"]["recent"])
    for f in base["filings"].get("files", []):
        if rows and min(r["filingDate"] for r in rows) <= since:
            break
        take(sec.json("https://data.sec.gov/submissions/" + f["name"]))
    return base, rows


DISPLAY = re.compile(r"^(.*?)\s+\(([^()]*)\)\s+\(CIK (\d{10})\)$")


def fts_cik(sec, ticker, since, whole):
    """EDGAR-Volltextsuche nach dem Ticker in 8-K/10-Q/10-K/20-F/6-K. Die
    display_names tragen die Ticker des Emittenten zum Einreichungszeitpunkt
    (Deckblatt 'Trading Symbol'); gezaehlt wird nur ein exakter Tickertreffer.
    Eindeutig = eine CIK mit >= 2 Treffern und >= 80 % aller Tickertreffer."""
    q = "https://efts.sec.gov/LATEST/search-index?q=%s&forms=8-K,10-Q,10-K,20-F,6-K" % urllib.parse.quote('"%s"' % ticker)
    if not whole:
        start = (dt.date.fromisoformat(since) - dt.timedelta(days=3 * 365)).isoformat()
        end = (dt.date.fromisoformat(since) + dt.timedelta(days=30)).isoformat()
        q += "&dateRange=custom&startdt=%s&enddt=%s" % (start, end)
    res = sec.json(q)
    count, names = {}, {}
    for h in res.get("hits", {}).get("hits", []):
        for dn in h["_source"].get("display_names", []):
            m = DISPLAY.match(dn.strip())
            if m and ticker in [t.strip() for t in m.group(2).split(",")]:
                count[m.group(3)] = count.get(m.group(3), 0) + 1
                names[m.group(3)] = m.group(1)
    total = sum(count.values())
    if not total:
        return None, "EDGAR full-text: no filing names ticker %s" % ticker, None
    best = max(count, key=lambda c: count[c])
    if count[best] >= 2 and count[best] >= 0.8 * total:
        return best, "EDGAR full-text: ticker on cover (%d/%d hits)" % (count[best], total), names[best]
    return None, "EDGAR full-text: ambiguous %s" % json.dumps(count), None


SUFFIX = {"INC", "CORP", "CORPORATION", "CO", "COMPANY", "LTD", "LIMITED", "PLC", "LLC", "LP", "SA", "NV", "AG",
          "THE", "HOLDINGS", "HOLDING", "GROUP", "CLASS", "A", "B", "C", "ORDINARY", "SHARES", "COMMON", "STOCK", "DE"}


def norm(name):
    toks = re.sub(r"[^A-Z0-9 ]", " ", (name or "").upper().replace("&", " AND ")).split()
    return " ".join(t for t in toks if t not in SUFFIX)


def name_cik(sec, company_name):
    """Letzter Ausweg: EDGAR-Entitaetssuche nach dem Namen des Company Master,
    nur bei genau einem exakten Treffer (normalisiert). Wird danach gegen den
    Zeitraum geprueft (period_consistent), weil Namen alt sein koennen."""
    if not company_name:
        return None, "no company name", None
    res = sec.json("https://efts.sec.gov/LATEST/search-index?keysTyped=" + urllib.parse.quote(company_name))
    want = norm(company_name)
    cands = sorted({(h["_id"], h["_source"]["entity"]) for h in res.get("hits", {}).get("hits", []) if norm(h["_source"].get("entity")) == want})
    if len(cands) == 1:
        return "%010d" % int(cands[0][0]), "EDGAR entity search, exact normalized name (fallback)", cands[0][1]
    return None, "EDGAR entity search: %d exact name matches" % len(cands), None


def period_consistent(filings, since, whole):
    """Der Emittent muss zum Einfrierbeginn passen: bei teilweise flacher Reihe
    eine Einreichung in [Einfrierbeginn - 400 Tage, + 60 Tage]; bei ganz flacher
    Reihe (Beginn unbekannt, <= since) eine Einreichung vor since."""
    dates = [r["filingDate"] for r in filings]
    if whole:
        return any(d <= since for d in dates)
    lo = (dt.date.fromisoformat(since) - dt.timedelta(days=400)).isoformat()
    hi = (dt.date.fromisoformat(since) + dt.timedelta(days=60)).isoformat()
    return any(lo <= d <= hi for d in dates)


def resolve_cik(sec, ticker, cik_map, since, whole):
    hit = cik_map.get(ticker)
    if hit and hit.get("cik"):
        return hit["cik"], "cik-map.json (SEC company_tickers 2026-09-13)", hit.get("name")
    return fts_cik(sec, ticker, since, whole)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--dq-report", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--per-stratum", type=int, default=6)
    ap.add_argument("--today", default=None)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root = a.root
    rep = load(a.dq_report)
    today = a.today or rep["checkedAt"][:10]
    rules = {r["id"]: r for r in rep["rules"]}
    daily = {f["securityId"]: f for f in rules["DQ-PX-6"]["findings"]}
    weekly = {f["securityId"]: f for f in rules["DQ-PX-7"]["findings"]}

    def stratum(sid):
        w = weekly.get(sid)
        if not w:
            return "DAILY_ONLY"
        return "WEEKLY_4_12" if w["run"] <= 12 else "WEEKLY_13_52" if w["run"] <= 52 else "WEEKLY_53_PLUS"

    strata = {}
    for sid in sorted(set(daily) | set(weekly), key=lambda s: hashlib.sha256(s.encode()).hexdigest()):
        strata.setdefault(stratum(sid), []).append(sid)
    picked = [(s, sid) for s in ("DAILY_ONLY", "WEEKLY_4_12", "WEEKLY_13_52", "WEEKLY_53_PLUS") for sid in strata.get(s, [])[: a.per_stratum]]

    master = load(os.path.join(root, "quant/data/market/security-master/us-security-master.json"))
    mtype = {}
    for r in master["rows"]:
        mtype.setdefault(r["baseline_security_id"], set()).add(r["instrument_type"])
    names = {}
    for f in sorted(glob.glob(os.path.join(root, "quant/data/universe/instruments/*.json"))):
        for i in load(f).get("instruments", []):
            names.setdefault(i["symbol"], i.get("companyName"))
    cik_map = load(os.path.join(root, "quant/data/universe/cik-map.json"))["byTicker"]

    sec = Sec(a.cache)
    current = sec.json("https://www.sec.gov/files/company_tickers_exchange.json")
    fields = current["fields"]
    cur = {}
    for row in current["data"]:
        rec = dict(zip(fields, row))
        cur.setdefault(rec["ticker"], []).append(rec)

    out_rows = []
    recent_lo = (dt.date.fromisoformat(today) - dt.timedelta(days=RECENT_DAYS)).isoformat()
    for st, sid in picked:
        d, w = daily.get(sid), weekly.get(sid)
        f = w or d
        ticker = f["ticker"]
        since = f["since"]
        whole = f["run"] == f["points"]  # ganze Reihe flach: Einfrierbeginn liegt vor dem Reihenanfang
        lo = (dt.date.fromisoformat(since) - dt.timedelta(days=WHOLE_WINDOW_BEFORE if whole else WINDOW_BEFORE)).isoformat()
        rec = {"securityId": sid, "ticker": ticker, "stratum": st, "weeklyRun": w["run"] if w else None,
               "dailyRun": d["run"] if d else None, "frozenSince": since, "wholeSeriesFlat": whole, "frozenClose": f["close"],
               "masterInstrumentType": "+".join(sorted(mtype.get(sid, []))), "companyName": names.get(ticker),
               "evidenceWindowFrom": lo}
        nowcur = cur.get(ticker, [])
        rec["secTickerMapToday"] = [{"cik": "%010d" % c["cik"], "name": c["name"], "exchange": c["exchange"]} for c in nowcur]
        try:
            cik, how, _ = resolve_cik(sec, ticker, cik_map, since, whole)
            base, filings = submissions(sec, cik, lo) if cik else (None, [])
            if cik and how.startswith("cik-map") and filings and min(r["filingDate"] for r in filings) > since:
                # Ticker-Inhaber von 2026-09 hat erst nach dem Einfrierbeginn eingereicht: frueherer Inhaber gesucht
                cik, how2, _ = fts_cik(sec, ticker, since, whole)
                how = "cik-map holder starts after freeze; " + how2
                base, filings = submissions(sec, cik, lo) if cik else (None, [])
            if not cik:
                cik, how3, _ = name_cik(sec, names.get(ticker))
                how = how + "; " + how3
                base, filings = submissions(sec, cik, lo) if cik else (None, [])
                if cik and not period_consistent(filings, since, whole):
                    how += "; rejected: no filings around freeze start (stale name / other issuer)"
                    cik, base, filings = None, None, []
        except SECHTTPError as exc:
            rec.update({"cik": None, "cikSource": "SEC error HTTP %s" % exc.status, "classification": "UNKNOWN",
                        "reason": "SEC nicht lesbar: HTTP %s" % exc.status, "evidence": []})
            out_rows.append(rec)
            continue
        rec.update({"cik": cik, "cikSource": how})
        if not cik:
            rec.update({"classification": "UNKNOWN", "reason": "CIK nicht eindeutig aufloesbar (" + how + ")", "evidence": []})
            out_rows.append(rec)
            continue
        rec["secName"] = base.get("name")
        rec["secTickersNow"] = base.get("tickers", [])
        rec["secExchangesNow"] = base.get("exchanges", [])
        ev = []
        for r in filings:
            if r["filingDate"] < lo:
                continue
            items = r["items"].split(",") if r["items"] else []
            if r["form"] in DELIST_FORMS or (r["form"] == "8-K" and ("2.01" in items or "3.01" in items)):
                acc = r["accession"].replace("-", "")
                ev.append({"form": r["form"], "filingDate": r["filingDate"], "items": r["items"], "accession": r["accession"],
                           "url": "https://www.sec.gov/Archives/edgar/data/%d/%s/%s" % (int(cik), acc, r["primaryDocument"]),
                           "daysFromFrozenSince": (dt.date.fromisoformat(r["filingDate"]) - dt.date.fromisoformat(since)).days})
        ev.sort(key=lambda e: e["filingDate"])
        rec["evidence"] = ev
        periodic = [r for r in filings if r["form"] in PERIODIC and r["filingDate"] >= recent_lo]
        rec["latestPeriodicFiling"] = max((r["filingDate"] + " " + r["form"] for r in periodic), default=None)
        delist = [e for e in ev if e["form"] in DELIST_FORMS]
        same_ticker_listed = [c for c in nowcur if ("%010d" % c["cik"]) == cik and c.get("exchange")]
        other_tickers = [t for t in rec["secTickersNow"] if t != ticker]
        is_class = bool(CLASS_WORDS.search(rec["companyName"] or ""))
        if delist and is_class:
            rec.update({"classification": "UNKNOWN", "reason": "%s am %s auf Emittentenebene; betroffene Klasse (Vorzug/Depositary) nicht belegt"
                        % (delist[0]["form"], delist[0]["filingDate"])})
        elif delist and not same_ticker_listed:
            rec.update({"classification": "CONFIRMED_DELISTED",
                        "reason": "%s am %s (%+d Tage zum Einfrierbeginn)" % (delist[0]["form"], delist[0]["filingDate"], delist[0]["daysFromFrozenSince"])})
        elif delist:
            rec.update({"classification": "UNKNOWN", "reason": "%s am %s, Ticker steht aber heute noch in der SEC-Liste (%s): Boersenwechsel oder andere Klasse?"
                        % (delist[0]["form"], delist[0]["filingDate"], same_ticker_listed[0]["exchange"])})
        elif same_ticker_listed and periodic:
            rec.update({"classification": "STILL_LISTED_PROVIDER_STALE",
                        "reason": "kein Delisting-Formular; Ticker heute in der SEC-Liste (%s), letzte Einreichung %s" % (same_ticker_listed[0]["exchange"], rec["latestPeriodicFiling"])})
        elif other_tickers and rec["secExchangesNow"] and periodic and not CLASS_WORDS.search(rec["companyName"] or ""):
            rec.update({"classification": "STILL_LISTED_PROVIDER_STALE",
                        "reason": "kein Delisting-Formular; Emittent heute unter %s gelistet (Tickerwechsel, Anbieter fuehrt den alten Ticker eingefroren weiter), letzte Einreichung %s"
                        % (",".join(other_tickers), rec["latestPeriodicFiling"])})
        else:
            rec.update({"classification": "UNKNOWN",
                        "reason": "kein Delisting-Formular ab " + lo + "; " + ("Ticker nicht in der heutigen SEC-Liste" if not same_ticker_listed else "keine Einreichung in 120 Tagen")
                        + ("; 8-K 2.01/3.01 vorhanden" if ev else "")})
        out_rows.append(rec)

    counts = {}
    for r in out_rows:
        counts.setdefault(r["stratum"], {}).setdefault(r["classification"], 0)
        counts[r["stratum"]][r["classification"]] += 1
    total = {}
    for r in out_rows:
        total[r["classification"]] = total.get(r["classification"], 0) + 1
    doc = {"schemaVersion": "v9-followup-stale-tails-sec-sample-1.0.0", "today": today,
           "method": __doc__.strip().split("\n\n")[1].strip(),
           "rateLimit": "2 req/s, burst 1 (scripts/quant/sec/http_client.py)", "requests": sec.client.stats,
           "secTickerMap": {"url": "https://www.sec.gov/files/company_tickers_exchange.json", "note": "CURRENT mapping only"},
           "strataSizes": {k: len(v) for k, v in strata.items()}, "perStratum": a.per_stratum,
           "byStratum": counts, "total": total, "rows": out_rows}
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=1)
        fh.write("\n")
    print(json.dumps({"total": total, "byStratum": counts, "requests": sec.client.stats}, indent=1))


if __name__ == "__main__":
    main()
