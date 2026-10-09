/* =========================================================================
   VISION UNIVERSE — corporate-action-evidence.js
   KAPITALMASSNAHMEN-BELEG FUER WOCHENREIHEN (corporate-action-evidence-1.0.0)

   DAS PROBLEM
   Die Elliott-Engine (elliott-v3.js#dataQuality) erkennt "unbereinigte
   Splits" allein am Kursverhaeltnis zweier Wochenschluesse: liegt es
   innerhalb von 3 % an 2, 3, 4, 5 oder 10 (bzw. dem Kehrwert), gilt die
   Reihe als vermutlich unbereinigt. Die Wochenreihen
   (discover-series-long) tragen nur Schluesse - keinen Beleg, ob an
   diesem Tag eine Kapitalmassnahme stattfand. Eine ECHTE Kursbewegung in
   Split-Groesse (OSCR, Woche zum 31.03.2023: 3,36 -> 6,54, Tagesverlauf
   3,59 -> 5,61 -> 6,40 -> 6,62 bei 71 Mio. Stueck, kein Split beim
   Anbieter) sperrt damit dauerhaft jede Projektion.

   DER BELEG
   Die Historienablage fuehrt je Tagesbalken den splitFactor des Anbieters
   (Tiingo); die Wochenreihe wird daraus bereinigt (ADR-002,
   return-series.js#splitFactors). Der Herausgeber der Wochenreihe
   (publish-long-series.mjs) schreibt diesen Beleg jetzt mit:
     splits     jeder Tag mit splitFactor != 1 (Datum, Faktor)
     moves      jede Woche, deren Verhaeltnis zur Vorwoche in Split-Groesse
                liegt (dieselbe Regel wie die Engine), mit dem groessten
                Tagesverhaeltnis innerhalb dieser Woche

   DIE AUFLOESUNG (deterministisch)
   Ein Verdacht der Engine zum Wochendatum t ist
     RESOLVED_GENUINE_MOVE   wenn die Reihe einen vollstaendigen Beleg traegt
                             (splitFactor an jedem Tagesbalken), der Anbieter
                             in dieser Woche KEINEN Split fuehrt und der
                             Sprung NICHT an einem einzigen Tag geschah: kein
                             Tagessprung in Split-Groesse und kein Tag mit
                             >= 75 % der Wochenbewegung (log) — eine verpasste
                             Bereinigung wirkt immer ueber Nacht in voller Groesse
     UNRESOLVED              sonst: kein Beleg (alte Reihe), Split
                             verzeichnet (Bereinigung fraglich) oder
                             Tagessprung in Split-Groesse.
   Nur RESOLVED_GENUINE_MOVE hebt die Datensperre der PRODUKTSCHICHT auf.
   Die Engine selbst bleibt unveraendert (eingefroren): ihre Enthaltung
   wegen dq.blocking steht weiter in pro.elliott.
   ========================================================================= */
(function (global) {
  "use strict";
  var VERSION = "corporate-action-evidence-1.0.0";
  /* Spiegel der Engine-Regel (elliott-v3.js#dataQuality): Verhaeltnisse und Toleranz */
  var SPLIT_RATIOS = [2, 3, 4, 5, 10];
  var TOLERANCE = 0.03;
  var DOMINANT_DAY = 0.75;   // Anteil eines Tages an der Wochenbewegung (log), ab dem der Sprung als Ein-Tages-Ereignis gilt
  function isNum(v) { return typeof v === "number" && isFinite(v); }

  /** Liegt ein Kursverhaeltnis in Split-Groesse? → { k, kind:"UP"|"DOWN" } oder null */
  function splitSized(r) {
    if (!isNum(r) || r <= 0) return null;
    for (var i = 0; i < SPLIT_RATIOS.length; i++) {
      var k = SPLIT_RATIOS[i];
      if (Math.abs(r / k - 1) < TOLERANCE) return { k: k, kind: "UP" };
      if (Math.abs(r * k - 1) < TOLERANCE) return { k: k, kind: "DOWN" };
    }
    return null;
  }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }

  /**
   * Beleg aus bereinigten Tagesschluessen und den Splittagen des Anbieters.
   * @param {{date:string, close:number}[]} daily   split-bereinigt, aufsteigend
   * @param {[string, number][]} weekly              [Wochendatum, Schluss] wie veroeffentlicht
   * @param {{date:string, splitFactor:number}[]} bars  Rohbalken (nur splitFactor wird gelesen)
   */
  function evidence(daily, weekly, bars) {
    var splits = [];
    /* Fehlt die splitFactor-Spalte (auch nur teilweise), ist das KEIN Beleg fuer "kein Split" → kein Beleg */
    if (!bars || !bars.length || !bars.every(function (b) { return b && isNum(b.splitFactor) && b.splitFactor > 0; })) return null;
    bars.forEach(function (b) { if (b.splitFactor !== 1) splits.push([String(b.date).slice(0, 10), r6(b.splitFactor)]); });
    var moves = [], di = 0;
    for (var w = 1; w < weekly.length; w++) {
      var r = weekly[w][1] / weekly[w - 1][1];
      if (!splitSized(r)) continue;
      var from = weekly[w - 1][0], to = weekly[w][0], best = null;
      /* Tagesverhaeltnisse innerhalb der Woche (from, to] */
      while (di < daily.length && daily[di].date <= from) di++;
      for (var q = Math.max(1, di); q < daily.length && daily[q].date <= to; q++) {
        var a = daily[q - 1].close, b = daily[q].close;
        if (!(a > 0 && b > 0)) continue;
        var rd = b / a, mag = Math.abs(Math.log(rd));
        if (!best || mag > best.mag) best = { date: daily[q].date, ratio: rd, mag: mag };
      }
      var split = splits.filter(function (s) { return s[0] > from && s[0] <= to; });
      moves.push({ week: to, weeklyRatio: r6(r), maxDailyRatio: best ? r6(best.ratio) : null, maxDailyDate: best ? best.date : null, splitInWeek: split.length > 0 });
    }
    return { version: VERSION, source: "PROVIDER_SPLIT_FACTOR", splits: splits, moves: moves };
  }

  /**
   * Verdachtsfaelle der Engine gegen den Beleg aufloesen.
   * @param {{time:string}[]} suspected   dataQuality.suspectedSplits der Engine
   * @param {object|null} ev              corporateActions der Wochenreihe (oder null)
   * @returns {{status:"CLEAN"|"RESOLVED"|"UNRESOLVED", items:object[]}}
   */
  function resolve(suspected, ev) {
    if (!suspected || !suspected.length) return { status: "CLEAN", items: [] };
    var items = suspected.map(function (s) {
      var t = String(s.time || "").slice(0, 10);
      if (!ev || ev.version !== VERSION || !Array.isArray(ev.moves)) return { time: t, status: "UNRESOLVED", reason: "NO_EVIDENCE" };
      var m = ev.moves.filter(function (x) { return x.week === t; })[0];
      if (!m) return { time: t, status: "UNRESOLVED", reason: "NO_EVIDENCE_FOR_WEEK" };
      if (m.splitInWeek) return { time: t, status: "UNRESOLVED", reason: "PROVIDER_SPLIT_IN_WEEK" };
      if (!isNum(m.maxDailyRatio)) return { time: t, status: "UNRESOLVED", reason: "NO_DAILY_BARS" };
      if (splitSized(m.maxDailyRatio)) return { time: t, status: "UNRESOLVED", reason: "SINGLE_DAY_SPLIT_SIZED_JUMP" };
      /* eine verpasste Bereinigung mit zusaetzlicher Tagesbewegung (z. B. 2:1 an einem Tag mit −6 %): Ein Tag traegt
         dann fast die ganze Wochenbewegung. Aufgeloest nur, wenn der groesste Tag < 75 % der Wochenbewegung (log) ausmacht. */
      if (Math.abs(Math.log(m.maxDailyRatio)) >= DOMINANT_DAY * Math.abs(Math.log(m.weeklyRatio))) return { time: t, status: "UNRESOLVED", reason: "SINGLE_DAY_DOMINATES_WEEK" };
      return { time: t, status: "RESOLVED_GENUINE_MOVE", reason: "NO_PROVIDER_SPLIT_AND_MULTI_DAY_MOVE", weeklyRatio: m.weeklyRatio, maxDailyRatio: m.maxDailyRatio, maxDailyDate: m.maxDailyDate };
    });
    return { status: items.every(function (x) { return x.status === "RESOLVED_GENUINE_MOVE"; }) ? "RESOLVED" : "UNRESOLVED", items: items };
  }

  var api = { VERSION: VERSION, SPLIT_RATIOS: SPLIT_RATIOS, TOLERANCE: TOLERANCE, DOMINANT_DAY: DOMINANT_DAY, splitSized: splitSized, evidence: evidence, resolve: resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { global.VUCorporateActionEvidence = api; }
})(typeof window !== "undefined" ? window : globalThis);
