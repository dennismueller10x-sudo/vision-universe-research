/* =========================================================================
   VISION UNIVERSE QUANT 2.0 — RETURN SERIES v1

   Baut aus EINEM Satz Bars die beiden Return-Reihen, die der
   Return-Semantics-Vertrag trennt. Keine neue Datenquelle: beide
   entstehen aus Spalten, die jeder kanonische Bar ohnehin traegt.

   SPLIT_ADJUSTED_PRICE
     Rueckwaerts aus close und splitFactor rekonstruiert, nicht aus der
     adjClose-Spalte des Anbieters - denn die ist total-return-bereinigt
     und traegt damit genau das, was hier NICHT hineingehoert.

   TOTAL_RETURN
     Die adjustedClose-Spalte, deren Total-Return-Eigenschaft gegen die
     Dividendenereignisse nachgewiesen ist (siehe
     verify-total-return-capability).

   WARUM DIE REKONSTRUKTION UND NICHT DIE ROHE SPALTE

   Der rohe close springt an einem Split - ein SMA200 darueber ist keine
   Naeherung, sondern eine falsche Zahl. Die Rekonstruktion nimmt den
   Sprung heraus und laesst die Dividendenluecke stehen, weil die am Markt
   wirklich passiert ist. Genau diese Trennung ist der Vertrag.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var ENGINE_VERSION = "vu-return-series-1.0.0";

  function finite(v) { return typeof v === "number" && Number.isFinite(v); }

  /**
   * Bars muessen aufsteigend nach Datum sortiert sein. Unsortierte Bars
   * werden abgelehnt statt sortiert: eine Reihe, deren Reihenfolge nicht
   * stimmt, ist entweder falsch zusammengesetzt oder aus zwei Quellen
   * gemischt, und beides still zu reparieren verdeckt den Fehler.
   */
  function assertOrdered(bars) {
    for (var i = 1; i < bars.length; i++) {
      if (!(bars[i].date > bars[i - 1].date)) {
        throw new Error("return-series: bars are not strictly ascending at " + bars[i].date);
      }
    }
  }

  /**
   * Die splitbereinigte Reihe. Rueckwaerts: der letzte Kurs bleibt der
   * gehandelte, frueheren wird der kumulierte Splitfaktor herausgerechnet.
   */
  function splitAdjusted(bars) {
    var out = new Array(bars.length);
    if (!bars.length) return out;
    out[bars.length - 1] = finite(bars[bars.length - 1].close) ? bars[bars.length - 1].close : null;
    var factor = 1;
    for (var i = bars.length - 1; i > 0; i--) {
      var sf = bars[i].splitFactor;
      /* Ein Split wirkt AB seinem Tag. Der Faktor wird deshalb aufgenommen,
         bevor der Vortag gerechnet wird - andersherum verschoebe sich die
         ganze Reihe um einen Tag, was an einem 1:7 sofort sichtbar waere
         und an einem 1:1.05 nie. */
      if (finite(sf) && sf > 0 && sf !== 1) factor *= sf;
      var previous = bars[i - 1].close;
      out[i - 1] = finite(previous) && previous > 0 ? previous / factor : null;
    }
    return out;
  }

  function totalReturn(bars) {
    return bars.map(function (bar) {
      return finite(bar.adjustedClose) && bar.adjustedClose > 0 ? bar.adjustedClose : null;
    });
  }

  /**
   * Beide Reihen plus die Angaben, die der Audit zaehlt. `usable` sagt,
   * ob BEIDE Reihen ueber die ganze Laenge tragen - eine halbe Reihe ist
   * fuer einen Vergleich nichts wert und wird nicht als Teilerfolg
   * ausgegeben.
   */
  function build(payload) {
    var bars = (payload && Array.isArray(payload.bars)) ? payload.bars : [];
    if (!bars.length) {
      return { engineVersion: ENGINE_VERSION, usable: false, reason: "NO_BARS", bars: 0 };
    }
    assertOrdered(bars);

    var price = splitAdjusted(bars);
    var total = totalReturn(bars);
    var dates = bars.map(function (b) { return b.date; });

    var priceComplete = price.every(function (v) { return finite(v) && v > 0; });
    var totalComplete = total.every(function (v) { return finite(v) && v > 0; });
    var splitColumn = bars.every(function (b) { return b.splitFactor !== null && b.splitFactor !== undefined; });

    var reason = null;
    if (!splitColumn) reason = "SPLIT_FACTOR_COLUMN_INCOMPLETE";
    else if (!priceComplete) reason = "RAW_CLOSE_INCOMPLETE";
    else if (!totalComplete) reason = "ADJUSTED_CLOSE_INCOMPLETE";

    return {
      engineVersion: ENGINE_VERSION,
      usable: reason === null,
      reason: reason,
      bars: bars.length,
      dates: dates,
      price: price,
      total: total,
      dividendEvents: bars.filter(function (b) { return finite(b.dividend) && b.dividend > 0; }).length,
      splitEvents: bars.filter(function (b) { return finite(b.splitFactor) && b.splitFactor !== 1; }).length,
      adjustmentStatus: payload.adjustmentStatus || null
    };
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION,
    splitAdjusted: splitAdjusted,
    totalReturn: totalReturn,
    build: build
  };

  if (isNode) module.exports = api;
  else global.VUReturnSeries = api;
})(typeof window !== "undefined" ? window : globalThis);
