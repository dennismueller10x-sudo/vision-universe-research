/* =========================================================================
   DER LETZTE VEROEFFENTLICHTE SCHLUSSKURS EINER TAGESREIHE.

   Eine Regel, zwei Leser. Die Universumsliste braucht diesen Kurs, um in
   Listenansichten eine Zahl zeigen zu koennen; der Faktorlauf braucht ihn,
   um einen Boersenwert zu bilden, wo kein Technical-Buendel existiert.
   Gemessen am 26.09.2026 sind das 131 Titel, die einen Anteilsbestand und
   einen veroeffentlichten Kurs haben und trotzdem keinen Boersenwert trugen -
   weil der Faktorlauf nur in die Buendel sah.

   Die Pruefungen sind bewusst vollstaendig und nicht "das Wesentliche": eine
   Reihe, die ihren Vertrag nicht erfuellt, liefert keinen Kurs, und dann
   fehlt der Boersenwert und sagt es. Was hier NICHT passiert, ist ein
   Schlusskurs aus einer Reihe, deren Basis, Modus oder Stichtag nicht
   nachweisbar ist.

   WARUM DER LETZTE PUNKT EINER SPLITBEREINIGTEN REIHE DER HEUTIGE KURS IST

   Die Bereinigung normiert auf den jüngsten Stand: am letzten Balken sind
   bereinigter und roher Schluss derselbe Wert. Gemessen an AAPL, dessen Reihe
   einen 4:1-Split von 2020 traegt, stimmen letzter bereinigter Punkt und
   letzter Rohschluss auf den Cent (341,07). Genau deshalb darf dieser eine
   Punkt eine Aktienzahl multiplizieren, waehrend ein frueherer Punkt derselben
   Reihe das nicht darf.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var SCHEMA = "discover-series-1.1.0";
  var BASIS = "SPLIT_ADJUSTED";

  function datum(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value); }

  /**
   * lastPoint(series, today) -> {close, date, currency, basis} | null
   *
   * `today` ist der Tag, ab dem ein Datum in der Zukunft liegt. Er wird
   * uebergeben und nicht hier gebildet, damit derselbe Aufruf zweimal
   * dasselbe Ergebnis hat.
   */
  function lastPoint(series, today) {
    if (!series || series.schemaVersion !== SCHEMA) return null;
    if (series.dataMode !== "real" || series.source !== "tiingo" || series.provider !== "tiingo") return null;
    if (series.status !== "CALCULATED" || series.priceSeriesType !== BASIS) return null;
    if (series.grain !== "daily" || !series.publishBasis || !series.currency) return null;
    if (!datum(series.asOf) || series.asOf > today) return null;
    if (!Array.isArray(series.points) || !series.points.length) return null;
    var last = series.points[series.points.length - 1];
    var tag = Array.isArray(last) ? last[0] : last && last.date;
    var kurs = Array.isArray(last) ? last[1] : last && last.close;
    if (!datum(tag) || tag > today) return null;
    if (typeof kurs !== "number" || !Number.isFinite(kurs) || kurs <= 0) return null;
    return { close: kurs, date: tag, currency: series.currency, basis: BASIS };
  }

  var api = { SCHEMA: SCHEMA, BASIS: BASIS, lastPoint: lastPoint };
  if (isNode) module.exports = api;
  else global.VUPublishedClose = api;
})(typeof window !== "undefined" ? window : globalThis);
