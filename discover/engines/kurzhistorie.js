/* =========================================================================
   VISION UNIVERSE DISCOVER — kurzhistorie.js

   Neu an der Boerse: weniger als 30 Schlusskurse.

   Die volle Discover-Seite beginnt bei 30 Schlusskursen
   (scripts/market/publish-discover-series.mjs: "Weniger als 30 Schlusskurse").
   Ein Neuemittent (Anthropic, ANT, erster Handel 19.11.2026) stuende bis
   dahin ohne Seite im Produkt. Dieses Modul beschreibt die schlanke Seite
   fuer diese Zeit: Name, Boerse, erster Handelstag, der letzte Kurs aus dem
   Intraday-Snapshot und die Tagesveraenderung - nur wenn der Snapshot den
   Vortagesschluss traegt. Kein Score, keine Rangliste, keine Rendite
   darueber hinaus, keine Schaetzung. Das Etikett steht sichtbar auf der Seite.
   ========================================================================= */
(function (global) {
  "use strict";

  var MIN_BARS = 30;
  var MAX_AGE_DAYS = 60;
  var LABEL = "Zu kurze Historie – Kennzahlen folgen ab 30 Handelstagen";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function round(v, n) { var f = Math.pow(10, n); return Math.round(v * f) / f; }

  /** Ein Titel kommt in Frage, wenn sein erster Handelstag hoechstens MAX_AGE_DAYS zurueckliegt. */
  function jungGenug(firstTradeDate, heute, maxAgeDays) {
    if (!firstTradeDate || !heute) return false;
    var a = Date.parse(firstTradeDate + "T00:00:00Z"), b = Date.parse(heute + "T00:00:00Z");
    if (!isNum(a) || !isNum(b)) return false;
    var tage = (b - a) / 86400000;
    return tage >= 0 && tage <= (maxAgeDays || MAX_AGE_DAYS);
  }

  /** Letzter Punkt des Intraday-Snapshots (Punkte: [Ortszeit, Schluss]) und, nur wenn belegt, die Tagesveraenderung. */
  function ausIntraday(snapshot) {
    if (!snapshot || snapshot.publishable !== true || !Array.isArray(snapshot.points) || !snapshot.points.length) return null;
    var last = snapshot.points[snapshot.points.length - 1];
    if (!Array.isArray(last) || !isNum(last[1]) || last[1] <= 0) return null;
    var vor = isNum(snapshot.previousClose) && snapshot.previousClose > 0 && snapshot.previousCloseWithheld !== true ? snapshot.previousClose : null;
    return {
      sessionDate: snapshot.sessionDate || null,
      lastLocal: String(last[0]),
      close: round(last[1], 4),
      previousClose: vor,
      changePercent: vor ? round((last[1] / vor - 1) * 100, 4) : null,
      pointCount: snapshot.points.length
    };
  }

  /** Der Block `kurzhistorie` der Detailseite. */
  function block(info, opts) {
    opts = opts || {};
    return {
      status: "ZU_KURZE_HISTORIE",
      label: LABEL,
      minBars: MIN_BARS,
      firstTradeDate: opts.firstTradeDate || null,
      stand: info ? { sessionDate: info.sessionDate, lokal: info.lastLocal, art: "INTRADAY_LETZTER_PUNKT" } : null,
      message: "Neu an der Börse: " + LABEL + ". Es gibt noch keine Scores, keine Rangliste und keine Renditekennzahlen."
    };
  }

  var api = { MIN_BARS: MIN_BARS, MAX_AGE_DAYS: MAX_AGE_DAYS, LABEL: LABEL, jungGenug: jungGenug, ausIntraday: ausIntraday, block: block };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { global.VUDiscover = global.VUDiscover || {}; global.VUDiscover.Kurzhistorie = api; }
})(typeof globalThis !== "undefined" ? globalThis : this);
