"""Baut docs/quant-recovery/v9-followups/stale-tails/before-after.json.

Eingaben (alle ausserhalb des Repositorys erzeugt, nichts Committetes wird
neu geschrieben):
  --before   DQ-Bericht mit dem Code von origin/main   (data-quality.mjs --out)
  --after    DQ-Bericht mit dem Code dieses Zweigs     (data-quality.mjs --out)
  --parity   unabhaengige Nachrechnung                  (check_stale_tails.py)
  --sec      SEC-Stichprobe                             (sec_sample.py)
  --v9       entpacktes docs/quant-recovery/v9 des V9-Zweigs (nur lesen)

    python3 -I scripts/core/stale-tails/build_evidence.py --root . --before .. --after .. \
        --parity .. --sec .. --v9 <dir>/docs/quant-recovery/v9 --base-sha <sha> --out <json>
"""
import argparse
import json
import os
import re

TAIL_COLS = ("securityId", "run", "points", "since", "close", "master")
ID4_COLS = ("securityId", "class", "to", "lag", "run", "master", "masterRows", "masterEnd")


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def tail(points):
    if not points:
        return 0
    k = len(points) - 1
    while k > 0 and points[k - 1][1] == points[-1][1]:
        k -= 1
    return len(points) - k


def reading(sec):
    def tally(rows):
        c = {}
        for r in rows:
            c[r["classification"]] = c.get(r["classification"], 0) + 1
        return c
    wk = [r for r in sec["rows"] if r["stratum"] != "DAILY_ONLY"]
    dy = [r for r in sec["rows"] if r["stratum"] == "DAILY_ONLY"]
    tw, td = tally(wk), tally(dy)
    still_w = ", ".join(r["ticker"] for r in wk if r["classification"] == "STILL_LISTED_PROVIDER_STALE")
    still_d = ", ".join(r["ticker"] for r in dy if r["classification"] == "STILL_LISTED_PROVIDER_STALE")
    return ("Wochenschichten (>= 4 gleiche Wochen, n=%d): %d per Form 25/25-NSE/15 bestaetigt delistet, %d weiter gelistet (%s), %d ohne eindeutigen Beleg. "
            "Tagesschicht (nur Tageslauf >= 5, Wochenlauf < 4, n=%d): %d weiter gelistet (%s; kaum gehandelte SPAC-Aktien bzw. Nebenklasse), %d bestaetigt delistet, %d ohne Beleg. "
            "Der Wochenbefund ist das starke Signal; der reine Tagesbefund mischt Delistings mit Tagen ohne Umsatz."
            % (len(wk), tw.get("CONFIRMED_DELISTED", 0), tw.get("STILL_LISTED_PROVIDER_STALE", 0), still_w, tw.get("UNKNOWN", 0),
               len(dy), td.get("STILL_LISTED_PROVIDER_STALE", 0), still_d, td.get("CONFIRMED_DELISTED", 0), td.get("UNKNOWN", 0)))


def main():
    ap = argparse.ArgumentParser()
    for k in ("root", "before", "after", "parity", "sec", "v9", "base-sha", "out"):
        ap.add_argument("--" + k, required=True)
    a = ap.parse_args()
    before, after = load(a.before), load(a.after)
    rb = {r["id"]: r for r in before["rules"]}
    ra = {r["id"]: r for r in after["rules"]}

    def brief(r):
        return None if r is None else {"severity": r["severity"], "status": r["status"], "checked": r["checked"], "failed": r["failed"]}
    counts = [{"rule": rid, "before": brief(rb.get(rid)), "after": brief(ra.get(rid))} for rid in list(dict.fromkeys(list(rb) + list(ra)))]
    unchanged = all(brief(rb[k]) == brief(ra[k]) for k in rb)

    market = os.path.join(a.root, "quant", "data", "market")
    master = load(os.path.join(market, "security-master", "us-security-master.json"))
    states = {}
    for row in master["rows"]:
        states.setdefault(row["baseline_security_id"], set()).add(row["active_status"])

    def runs(sub):
        out = {}
        d = os.path.join(market, sub)
        for name in os.listdir(d):
            if name.startswith("ref_") and name.endswith(".json"):
                doc = load(os.path.join(d, name))
                out[doc["securityId"]] = (tail(doc["points"]), len(doc["points"]))
        return out
    drun, wrun = runs("discover-series"), runs("discover-series-long")
    active = {k for k, v in states.items() if "ACTIVE" in v}
    sens = {"daily": {str(n): sum(1 for k, (r, _) in drun.items() if k in active and r >= n) for n in range(2, 11)},
            "weekly": {str(n): sum(1 for k, (r, _) in wrun.items() if k in active and r >= n) for n in range(2, 11)}}

    px6 = ra["DQ-PX-6"]["findings"]
    px7 = ra["DQ-PX-7"]["findings"]
    id4 = ra["DQ-ID-4"]["findings"]
    w_by = {f["securityId"]: f for f in px7}
    d_by = {f["securityId"]: f for f in px6}
    c_by = {f["securityId"]: f for f in id4}

    # ---- Abgleich mit V9 (ca-stale-tail-finding.json, >= 8 gleiche Wochen, nur QUALIFIED = 96)
    v9 = load(os.path.join(a.v9, "corporate-actions", "ca-stale-tail-finding.json"))
    v9rows = {r["id"]: r for r in v9["rows"]}
    q96 = v9["qualifiedWithStaleTail"]

    def why_missing(sid):
        if sid not in wrun:
            return "NO_WEEKLY_SERIES_NOW"
        if sid not in states:
            return "NO_MASTER_ROW"
        if "ACTIVE" not in states[sid]:
            return "MASTER_INACTIVE"
        return "TAIL_NOW_%d_LT_4" % wrun[sid][0]
    v9_in = [s for s in q96 if s in w_by]
    v9_out = [{"securityId": s, "v9Run": v9rows[s]["identicalTailWeeks"], "reason": why_missing(s)} for s in q96 if s not in w_by]
    run_cmp = {"same": 0, "longerNow": 0, "shorterNow": 0}
    for s in v9_in:
        d = w_by[s]["run"] - v9rows[s]["identicalTailWeeks"]
        run_cmp["same" if d == 0 else "longerNow" if d > 0 else "shorterNow"] += 1
    extra = [s for s in w_by if s not in set(q96)]
    extra_reason = {}
    for s in extra:
        if s in v9rows:
            key = "V9_STATUS_" + v9rows[s]["status"]
        elif w_by[s]["run"] < 8:
            key = "RUN_4_TO_7_BELOW_V9_THRESHOLD_8"
        else:
            key = "NOT_IN_V9_ROWS_RUN_GE_8"
        extra_reason[key] = extra_reason.get(key, 0) + 1
    all_v9_ids = set(v9rows)
    v9_all_flagged = sum(1 for s in all_v9_ids if s in w_by)
    not_in_v9_ge8 = sorted(s for s in extra if s not in v9rows and w_by[s]["run"] >= 8)

    # ---- V9 Fehlwochen: STALE_CARRY_FORWARD_AFTER_GAP
    mw = load(os.path.join(a.v9, "corporate-actions", "ca-missing-weeks.json"))
    scf = mw.get("staleConstantTailListings", [])
    scf_cmp = {"listings": len(scf), "flaggedDQ_PX_7": sum(1 for s in scf if s in w_by), "flaggedDQ_PX_6": sum(1 for s in scf if s in d_by),
               "notFlagged": [{"securityId": s, "reason": why_missing(s)} for s in scf if s not in w_by]}

    # ---- V9 Terminal-Dossiers (Tagesreihe mit 1-2 wiederholten Schluessen nach dem letzten Handelstag)
    te = load(os.path.join(a.v9, "portfolio", "terminal-evidence.json"))
    term = []
    for x in te["dossiers"]:
        sid = x["securityId"]
        term.append({"securityId": sid, "v9TrailingUnchanged": x["trailingUnchangedCloses"], "v9SeriesLastDate": x["seriesLastDate"],
                     "form25": [f["form"] + " " + f["filingDate"] for f in x.get("form25", [])],
                     "dailyTailNow": drun.get(sid, (None,))[0], "DQ-PX-6": sid in d_by, "DQ-ID-4": c_by[sid]["class"] if sid in c_by else None})

    # ---- V9 Identitaets-Dossiers (Stammzeile eines frueheren Ticker-Inhabers)
    dos = load(os.path.join(a.v9, "identity", "dossiers-7.json"))
    ident = [{"securityId": c["securityId"], "v9BaseReason": c["baseReason"],
              "masterStatusNow": "+".join(sorted(states.get(c["securityId"], []))),
              "DQ-ID-4": c_by[c["securityId"]]["class"] if c["securityId"] in c_by else None} for c in dos["cases"]]

    sec = load(a.sec)
    parity = load(a.parity)
    hist_d = ra["DQ-PX-6"]["histogram"]
    hist_w = ra["DQ-PX-7"]["histogram"]

    doc = {
        "schemaVersion": "v9-followup-stale-tails-before-after-1.0.0",
        "purpose": "Eingefrorene Kursenden und falsche Delisting-/Ticker-Zuordnungen sichtbar und pruefbar machen. Nur Bericht (WARN): dieser PR schliesst nichts aus Produkten aus, aendert keine Daten, keinen Adapter (quant/engines/weekly-real-adapter.cjs unberuehrt) und keinen Erzeuger.",
        "productionApproved": False,
        "base": {"commit": a.base_sha, "dataAsOf": {"daily": "2026-10-26", "weekly": "2026-10-23"}, "dqNow": after["checkedAt"], "expectedSession": after["expectedSession"],
                 "master": {"file": "quant/data/market/security-master/us-security-master.json", "version": master.get("version"), "today": master.get("today")}},
        "reproduce": [
            "git checkout <base> -- core scripts/core   # Vorher-Code",
            "node scripts/core/data-quality.mjs --now=2026-10-28T12:00:00Z --out=<privat>/dq-before.json",
            "node scripts/core/data-quality.mjs --now=2026-10-28T12:00:00Z --out=<privat>/dq-after.json   # dieser Zweig",
            "python3 -I scripts/core/stale-tails/check_stale_tails.py --root . --dq-report <privat>/dq-after.json --out <privat>/parity.json",
            "python3 -I scripts/core/stale-tails/sec_sample.py --root . --dq-report <privat>/dq-after.json --cache <privat>/http-cache --per-stratum 6 --today 2026-10-28 --out <privat>/sec-sample.json",
            "python3 -I scripts/core/stale-tails/build_evidence.py --root . --before .. --after .. --parity .. --sec .. --v9 <V9-Zweig>/docs/quant-recovery/v9 --base-sha <base> --out docs/quant-recovery/v9-followups/stale-tails/before-after.json"],
        "thresholds": {
            "dailyMinRun": 5, "weeklyMinRun": 4, "graceDays": 7, "maxLag": 2,
            "justification": "Verteilung der Endlaeufe exakt gleicher Schluesse ueber alle Reihen. Tag: 2:236, 3:73, 4:25 faellt noch steil (natuerliche Tage ohne Umsatz illiquider Titel), ab 5 Plateau um ~20 je Laenge plus 373 Reihen >= 30 -> Schwelle 5 (eine volle Handelswoche ohne Kursaenderung). Woche: 2:113, 3:24, ab 4 Plateau (4:4, 5:3, 6:2) plus 287 >= 30 -> Schwelle 4 (ein Monat). V9 nutzte >= 8 Wochen; 4 findet dieselben Faelle frueher und nur 9 zusaetzliche Titel mit 4..7 Wochen (341 statt 332).",
            "tailRunHistogram": {"daily": hist_d, "weekly": hist_w},
            "sensitivityActiveFlagged": sens},
        "dqRuleCounts": {"overall": {"before": before["overall"], "after": after["overall"]},
                         "failedBySeverity": {"before": before["failedBySeverity"], "after": after["failedBySeverity"]},
                         "existingRulesUnchanged": unchanged, "rules": counts},
        "flagged": {
            "columns": {"DQ-PX-6": list(TAIL_COLS), "DQ-PX-7": list(TAIL_COLS), "DQ-ID-4": list(ID4_COLS)},
            "DQ-PX-6": [[f[k] for k in TAIL_COLS] for f in px6],
            "DQ-PX-7": [[f[k] for k in TAIL_COLS] for f in px7],
            "DQ-ID-4": [[f[k] for k in ID4_COLS] for f in id4],
            "overlap": {"weeklyAlsoDaily": sum(1 for s in w_by if s in d_by), "dailyOnly": sum(1 for s in d_by if s not in w_by), "weeklyOnly": sum(1 for s in w_by if s not in d_by)},
            "byClassDQ_ID_4": ra["DQ-ID-4"]["byClass"]},
        "crossCheckV9": {
            "staleTailFinding": {
                "v9Rule": v9["rule"], "v9Qualified": len(q96), "v9QualifiedFlaggedNow": len(v9_in), "v9QualifiedNotFlaggedNow": v9_out,
                "runLengthVsV9": run_cmp, "v9AllStatusesRows": len(all_v9_ids), "v9AllStatusesFlaggedNow": v9_all_flagged,
                "flaggedNowNotInV9Qualified": len(extra), "flaggedNowNotInV9QualifiedReasons": extra_reason, "flaggedNowRunGe8NotInV9Rows": not_in_v9_ge8,
                "explanation": "V9 zaehlte nur Wochenreihen, die der Wochenadapter QUALIFIED liess (96 von 332 Reihen mit >= 8 gleichen Wochen), auf dem Datenstand von V9. DQ-PX-7 prueft jede Wochenreihe mit ACTIVE-Stammzeile ab 4 Wochen. Mehr Treffer kommen aus (a) V9-Status MISSING_WEEKS/INSUFFICIENT_HISTORY/AMBIGUOUS/... (vom Adapter ohnehin ausgeschlossen, im Produkt aber sichtbar), (b) Laeufen 4..7 Wochen, (c) Titeln, die seit dem V9-Stand eingefroren sind."},
            "missingWeeksStaleCarryForward": scf_cmp,
            "terminalDossiers": {"rows": term, "note": "Die V9-Terminalfaelle tragen 0-2 wiederholte Tagesschluesse nach dem letzten belegten Handelstag; das liegt unter der Schwelle 5 und wird von DQ-PX-6 bewusst NICHT gemeldet (sonst haetten illiquide Titel massenhaft Fehlalarme). Sie erscheinen stattdessen in DQ-ID-4 als MASTER_ACTIVE_SERIES_ENDED. Regel (c) 'wiederholter Schluss nach belegtem letztem Handelstag' ist nicht umgesetzt: auf main gibt es kein gepflegtes Register belegter Terminaldaten (terminal-evidence.json liegt nur auf dem V9-Zweig, productionApproved=false)."},
            "identityDossiers": {"rows": ident, "note": "Alle sieben V9-Identitaetsfaelle (Stammzeile gehoert einem frueheren Ticker-Inhaber) plus CNL erscheinen in DQ-ID-4 als MASTER_INACTIVE_SERIES_CURRENT."}},
        "secSample": {"method": sec["method"], "rateLimit": sec["rateLimit"], "requests": sec["requests"], "strataSizes": sec["strataSizes"],
                      "perStratum": sec["perStratum"], "total": sec["total"], "byStratum": sec["byStratum"],
                      "rows": [{k: r.get(k) for k in ("securityId", "ticker", "stratum", "weeklyRun", "dailyRun", "frozenSince", "wholeSeriesFlat", "frozenClose",
                                                      "companyName", "cik", "cikSource", "secName", "secTickersNow", "classification", "reason", "evidence")} for r in sec["rows"]],
                      "reading": reading(sec)},
        "independentCheck": parity,
        "productEffect": "Keine. Neue Regeln sind WARN (nur Bericht); --strict faellt nur bei ERROR. Keine Datei unter quant/data, discover/data, supertrader/data, social/data, technical/data geaendert; data-quality.mjs schreibt weiterhin nur mit --out. Diagnose (scripts/core/diagnose.mjs) zeigt die Befunde zusaetzlich an; core/diagnose.js und /status/ bleiben unveraendert.",
        "proposalNotImplemented": [
            "Erzeuger des Wertpapierstamms (us-security-master): ACTIVE nicht allein aus dem Anbieter-endDate ableiten (Tiingo fuehrt eingefrorene Titel mit aktuellem endDate weiter); DQ-PX-7-Befund + SEC Form 25/15 -> active_status INACTIVE mit belegtem end_date (Datum des Form 25 bzw. letzter Handelstag).",
            "Wochenadapter (separater PR, weekly-real-adapter.cjs): neuer Ablehnungsgrund STALE_TAIL_UNVERIFIED fuer Reihen mit >= 4 gleichen Endwochen, solange kein belegter Terminalwert existiert; mit Beleg die Reihe am letzten Handelstag abschneiden statt fortzuschreiben.",
            "Discover/Long-Series-Erzeuger: eingefrorenen Endlauf nicht als aktuellen Kurs veroeffentlichen, sondern Reihe am Beginn des Endlaufs enden lassen und den Titel als 'Handel eingestellt (Stand ...)' kennzeichnen - erst nach Freigabe und mit Vorher/Nachher je Produkt.",
            "Identitaet: MASTER_INACTIVE_SERIES_CURRENT-Faelle (BGC, COHR, DCOM, EFOR, SGI, SUNE, TRAK, CNL) ueber das V9-Identitaetsregister an den heutigen Emittenten binden (Workstream A), nicht ueber Ticker.",
            "Regel (c) erst, wenn ein gepflegtes Register belegter letzter Handelstage auf main existiert (z. B. aus SEC Form 25/8-K 2.01); dann WARN fuer jeden Schluss nach diesem Datum."]
    }
    with open(a.out, "w", encoding="utf-8") as fh:
        text = json.dumps(doc, indent=1, ensure_ascii=False)
        # Listen aus Skalaren (Tabellenzeilen) auf eine Zeile: klein und diffbar.
        text = re.sub(r"\[\s+([^\[\]{}]+?)\s+\]", lambda m: "[" + re.sub(r",\s*\n\s*", ", ", m.group(1)) + "]", text)
        fh.write(text)
        fh.write("\n")
    print(json.dumps({"existingRulesUnchanged": unchanged, "v9QualifiedFlaggedNow": len(v9_in), "v9Out": v9_out, "extraReasons": extra_reason,
                      "scf": {k: v for k, v in scf_cmp.items() if k != "notFlagged"}, "scfNot": scf_cmp["notFlagged"][:10],
                      "sens": sens, "runCmp": run_cmp, "notInV9ge8": len(not_in_v9_ge8), "term": term, "ident": ident}, indent=1))


if __name__ == "__main__":
    main()
