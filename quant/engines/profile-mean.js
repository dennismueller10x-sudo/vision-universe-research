/* =========================================================================
   VISION UNIVERSE — profile-mean.js

   Gesamtwert je Aktie = einfacher Durchschnitt der vorhandenen Profilwerte
   (Faktor-Scores 0-100 so, wie sie im Profil stehen). Keine Gewichtung, keine
   neue Rechnung der Einzelwerte, nur vorhandene Werte, mindestens 4.
   Methodenversion vu-profile-mean-1.0.0 (Owner-Entscheidung 14.11.2026).

   Der Wert beschreibt das Profil. Die Rueckwaertspruefung
   (backtest-research-v1.json, Faelle matrix-profile-mean) zeigt keinen
   Vorteil gegenueber dem Markt; er ist kein Composite Score der Methodik
   Quant V2 (dieser bleibt WITHHELD).
   UMD: globalThis.VUProfileMean
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUProfileMean = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "vu-profile-mean-1.0.0";
  var MIN_FACTORS = 4;
  var SCHEMA = "profile-ranking-1.0.0";
  var NO_ADVANTAGE_SENTENCE = "Durchschnitt der Profilwerte. Rückwärts geprüft: Aktien mit hohem Gesamtwert lagen früher nicht besser als der Markt – er beschreibt das Profil, er sagt nichts über künftige Kurse.";

  function finite(v) { return typeof v === "number" && isFinite(v); }
  function round2(v) { return Math.round(v * 100) / 100; }

  /* scores: Liste vorhandener Profilwerte (null/undefined = fehlt). */
  function mean(scores) {
    var v = (scores || []).filter(finite);
    if (v.length < MIN_FACTORS) return { state: "UNAVAILABLE", reason: "INSUFFICIENT_DATA", score: null, count: v.length };
    var sum = 0; v.forEach(function (x) { sum += x; });
    return { state: "AVAILABLE", reason: null, score: round2(sum / v.length), count: v.length };
  }

  /* Platz 1 = hoechster Gesamtwert; gleiche Werte teilen sich den Platz. */
  function places(scoreByTicker) {
    var list = Object.keys(scoreByTicker).filter(function (t) { return finite(scoreByTicker[t]); })
      .sort(function (a, b) { return scoreByTicker[b] - scoreByTicker[a] || (a < b ? -1 : 1); });
    var out = {}, place = 0, last = null;
    list.forEach(function (t, i) { if (scoreByTicker[t] !== last) { place = i + 1; last = scoreByTicker[t]; } out[t] = place; });
    return { places: out, total: list.length };
  }

  return { VERSION: VERSION, MIN_FACTORS: MIN_FACTORS, SCHEMA: SCHEMA, NO_ADVANTAGE_SENTENCE: NO_ADVANTAGE_SENTENCE, mean: mean, places: places };
});
