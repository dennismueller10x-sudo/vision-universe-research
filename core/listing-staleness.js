/* =========================================================================
   VISION UNIVERSE CORE — listing-staleness.js

   EINGEFRORENE KURSENDEN UND WIDERSPRUECHE WERTPAPIERSTAMM <-> REIHE.

   Reine Erkennung, kein I/O, keine Korrektur. Gefunden wird:

     STALE_TAIL     eine Reihe endet mit >= minRun exakt gleichen Schluessen,
                    waehrend der Wertpapierstamm den Titel ACTIVE fuehrt.
                    Typisch: Delisting/Uebernahme, der Anbieter schreibt den
                    letzten Kurs weiter (CHL 65 Wochen, ADEX 147 Wochen).
     MASTER_*       Stamm und Reihe widersprechen sich:
                    - Stamm nur INACTIVE, Reihe laeuft aktuell und bewegt
                      sich (Ticker-Wiederverwendung: Stammzeile gehoert einem
                      frueheren Inhaber, z. B. COHR, SGI, BGC),
                    - Stamm nur INACTIVE, Reihe laeuft nach dem Stamm-Ende
                      eingefroren weiter,
                    - Stamm ACTIVE, Reihe ist aber zu Ende (letzte Sitzung
                      liegt > maxLag zurueck).

   Schwellen (Begruendung und Verteilung:
   docs/quant-recovery/v9-followups/stale-tails/before-after.json):
     Tagesreihe  >= 5 gleiche Schluesse (eine volle Handelswoche ohne eine
                 einzige Kursaenderung). 3 und 4 liegen noch im natuerlichen
                 Abfall illiquider Titel (Endlaeufe Stand 2026-10-26:
                 2:236, 3:73, 4:25, danach Plateau ~20 je Laenge).
     Wochenreihe >= 4 gleiche Wochenschluesse (ein Monat). Endlaeufe
                 2:113, 3:24, ab 4 Plateau (4:4, 5:3, 6:2 ...).

   Diese Datei schliesst nichts aus Produkten aus; sie macht sichtbar.
   Genutzt von core/data-quality.js (DQ-PX-6, DQ-PX-7, DQ-ID-4) und
   scripts/core/diagnose.mjs.

   UMD: globalThis.VUCore.ListingStaleness
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.ListingStaleness = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "core-listing-staleness-1.0.0";
  var DEFAULTS = { dailyMinRun: 5, weeklyMinRun: 4, graceDays: 7, maxLag: 2 };

  function addDays(date, n) {
    var d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /** Laenge des Endlaufs exakt gleicher Schluesse.
   *  -> { run, since, close, to } | null (keine Punkte) */
  function tailRun(points) {
    var p = points || [];
    if (!p.length) return null;
    var last = p[p.length - 1], run = 1;
    for (var i = p.length - 2; i >= 0 && p[i][1] === last[1]; i--) run++;
    return { run: run, since: p[p.length - run][0], close: last[1], to: last[0], points: p.length };
  }

  /** Index des Wertpapierstamms (us-security-master.json) je baseline_security_id.
   *  Mehrere Zeilen je ID (mehrdeutige Identitaet) werden zusammengefasst:
   *  active = mindestens eine ACTIVE-Zeile. */
  function masterIndex(master) {
    var byId = {};
    ((master && master.rows) || []).forEach(function (r) {
      var id = r && r.baseline_security_id;
      if (!id) return;
      var s = byId[id] || (byId[id] = { securityId: id, rows: 0, statuses: [], tickers: [], active: false, maxEnd: null, activeEnd: null, inactiveEnd: null });
      s.rows++;
      if (s.statuses.indexOf(r.active_status) < 0) s.statuses.push(r.active_status);
      if (s.tickers.indexOf(r.ticker) < 0) s.tickers.push(r.ticker);
      var end = r.end_date || null;
      if (end && (!s.maxEnd || end > s.maxEnd)) s.maxEnd = end;
      if (r.active_status === "ACTIVE") {
        s.active = true;
        if (end && (!s.activeEnd || end > s.activeEnd)) s.activeEnd = end;
      } else if (end && (!s.inactiveEnd || end > s.inactiveEnd)) s.inactiveEnd = end;
    });
    Object.keys(byId).forEach(function (k) { byId[k].statuses.sort(); byId[k].status = byId[k].statuses.join("+"); });
    return { version: master && master.version || null, generatedAt: master && master.generatedAt || null, today: master && master.today || null, byId: byId };
  }

  /** STALE_TAIL: Endlauf >= minRun bei einem im Stamm ACTIVE gefuehrten Titel.
   *  -> Befund | null. Ohne Stammzeile oder nur INACTIVE: null (das zeigt masterConflict). */
  function staleTail(series, state, minRun) {
    if (!series || !state || !state.active) return null;
    var t = tailRun(series.points);
    if (!t || t.run < minRun) return null;
    return { securityId: series.securityId, ticker: series.ticker || null, grain: series.grain || null, run: t.run,
             points: t.points, since: t.since, to: t.to, close: t.close, master: state.status, masterEnd: state.maxEnd };
  }

  /** Widerspruch Stamm <-> (Tages-)Reihe.
   *  opts: { expectedSession, lagFn(date, expected) -> n|null, maxLag, minRun, graceDays }
   *  -> { class, ... } | null */
  function masterConflict(series, state, opts) {
    var o = opts || {};
    if (!series || !state) return null;
    var maxLag = typeof o.maxLag === "number" ? o.maxLag : DEFAULTS.maxLag;
    var minRun = o.minRun || DEFAULTS.dailyMinRun, grace = typeof o.graceDays === "number" ? o.graceDays : DEFAULTS.graceDays;
    var t = tailRun(series.points);
    if (!t) return null;
    var lag = o.lagFn && o.expectedSession ? o.lagFn(t.to, o.expectedSession) : null;
    var base = { securityId: series.securityId, ticker: series.ticker || null, to: t.to, lag: lag, run: t.run, since: t.since, close: t.close,
                 master: state.status, masterRows: state.rows, masterEnd: state.maxEnd, masterTickers: state.tickers.slice() };
    if (!state.active) {
      if (!state.maxEnd || t.to <= addDays(state.maxEnd, grace)) return null;
      var cls = t.run >= minRun ? "MASTER_INACTIVE_SERIES_FROZEN" : (lag !== null && lag <= maxLag ? "MASTER_INACTIVE_SERIES_CURRENT" : "MASTER_INACTIVE_SERIES_AFTER_END");
      return Object.assign({ class: cls }, base);
    }
    if (lag !== null && lag > maxLag) return Object.assign({ class: "MASTER_ACTIVE_SERIES_ENDED" }, base);
    return null;
  }

  var CLASS_TEXT = {
    MASTER_INACTIVE_SERIES_CURRENT: "Stamm INACTIVE, Reihe aktuell und beweglich (Ticker-Wiederverwendung?)",
    MASTER_INACTIVE_SERIES_FROZEN: "Stamm INACTIVE, Reihe laeuft nach dem Stamm-Ende eingefroren weiter",
    MASTER_INACTIVE_SERIES_AFTER_END: "Stamm INACTIVE, Reihe reicht ueber das Stamm-Ende hinaus",
    MASTER_ACTIVE_SERIES_ENDED: "Stamm ACTIVE, Reihe ist zu Ende"
  };

  /** Alle Befunde fuer EIN Wertpapier (Diagnose). */
  function assess(input, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {}), out = [];
    var state = input.state || null;
    if (!state) return [{ kind: "NO_MASTER_ROW", text: "keine Zeile im Wertpapierstamm (baseline_security_id)" }];
    var d = input.daily ? staleTail(input.daily, state, o.dailyMinRun) : null;
    if (d) out.push({ kind: "STALE_TAIL_DAILY", text: (d.run === d.points ? "alle " : "") + d.run + " gleiche Tagesschluesse seit " + d.since + " (" + d.close + "), Stamm " + d.master, finding: d });
    var w = input.weekly ? staleTail(input.weekly, state, o.weeklyMinRun) : null;
    if (w) out.push({ kind: "STALE_TAIL_WEEKLY", text: (w.run === w.points ? "alle " : "") + w.run + " gleiche Wochenschluesse seit " + w.since + " (" + w.close + "), Stamm " + w.master, finding: w });
    var c = input.daily ? masterConflict(input.daily, state, { expectedSession: o.expectedSession, lagFn: o.lagFn, maxLag: o.maxLag, minRun: o.dailyMinRun, graceDays: o.graceDays }) : null;
    if (c) out.push({ kind: c.class, text: CLASS_TEXT[c.class] + " (Reihe bis " + c.to + ", Stamm-Ende " + c.masterEnd + ", Stamm " + c.master + ")", finding: c });
    return out;
  }

  return { VERSION: VERSION, DEFAULTS: DEFAULTS, CLASS_TEXT: CLASS_TEXT, addDays: addDays,
           tailRun: tailRun, masterIndex: masterIndex, staleTail: staleTail, masterConflict: masterConflict, assess: assess };
});
