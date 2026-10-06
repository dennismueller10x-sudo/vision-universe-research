/* =========================================================================
   VISION UNIVERSE TECHNICAL — engine-common.js
   Gemeinsame Hilfen der Zustandsengines: Evidence-Objekte, Skalierung,
   NaN-sichere Aggregation. Keine Fachlogik.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function tanh(x) { return Math.tanh(x); }
  function round(v, d) { var m = Math.pow(10, d === undefined ? 4 : d); return Math.round(v * m) / m; }
  function orNull(v) { return isNum(v) ? v : null; }

  /** Ein Evidence-Eintrag: strukturiert, referenzierbar, mit Polaritaet. */
  function evidence(engine, family, key, statement, value, polarity, weight) {
    return { evidenceId: engine + ":" + key, engine: engine, family: family, key: key,
             statement: statement, value: orNull(value), polarity: polarity || 0, weight: weight === undefined ? 1 : weight };
  }

  /**
   * Gewichteter Mittelwert ueber verfuegbare Komponenten. Fehlende
   * Komponenten werden ausgeschlossen und die Gewichte renormalisiert;
   * `coverage` sagt, wie viel Gewicht tatsaechlich vorlag (Missing != Zero).
   */
  function weightedScore(components, weights) {
    var sum = 0, wsum = 0, total = 0;
    Object.keys(weights).forEach(function (k) {
      total += weights[k];
      var v = components[k];
      if (isNum(v)) { sum += weights[k] * v; wsum += weights[k]; }
    });
    return { score: wsum > 0 ? sum / wsum : NaN, coverage: total > 0 ? wsum / total : 0 };
  }

  var api = { isNum: isNum, clamp: clamp, tanh: tanh, round: round, orNull: orNull, evidence: evidence, weightedScore: weightedScore };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Common = api; }
})(typeof window !== "undefined" ? window : globalThis);
