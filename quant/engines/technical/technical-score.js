/* =========================================================================
   VISION UNIVERSE TECHNICAL — technical-score.js
   VU TECHNICAL OPPORTUNITY SCORE 0–100

   Ein METHODOLOGISCHER SETUP-RANK. Keine Erfolgswahrscheinlichkeit.

   Maximale Beitraege (technical-v1.json → opportunityScore):
     Trend + Struktur                 30
     Momentum (absolut + relativ)     20
     Volumen                          10
     Volatilitaet / Kompression       10
     Trade Setup / RR                 20
     Projektion (Fib/Elliott)         10   — gekappt

   Fibonacci/Elliott koennen einen schwachen Trend-/Strukturzustand nicht
   in einen 90er-Score verwandeln. Der Scanner ergaenzt spaeter den
   Cross-Sectional-Perzentilrang.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var C = isNode ? require("./engine-common.js") : global.VUTechnical.Common;

  var SCORE_VERSION = "tos-1.0.0";
  var DEFAULTS = { maxContribution: { TREND_STRUCTURE: 30, MOMENTUM: 20, VOLUME: 10, VOLATILITY: 10, SETUP: 20, PROJECTION_AUXILIARY: 10 },
                   bands: [{ min: 80, label: "Starkes Setup", tone: "good" }, { min: 60, label: "Konstruktiv", tone: "neutral" }, { min: 40, label: "Neutral", tone: "neutral" }, { min: 0, label: "Schwach", tone: "poor" }] };

  function unit(v) { return C.isNum(v) ? C.clamp((v + 1) / 2, 0, 1) : NaN; }   // −1..1 → 0..1

  /**
   * @param {object} b { confluence, scenarios, tradeSetup, engines }
   */
  function computeOpportunityScore(b, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    var max = cfg.maxContribution, fam = b.confluence.families;
    var primary = b.scenarios.primary;
    var dirSign = primary && primary.direction === "BULLISH" ? 1 : primary && primary.direction === "BEARISH" ? -1 : 0;
    var contrib = {}, notes = [];

    function directional(v) { return v === null ? NaN : dirSign === 0 ? unit(v) * 0.5 + 0.25 : unit(v * dirSign); }
    var ts = [fam.STRUCTURE.value, fam.TREND.value].filter(function (v) { return v !== null; });
    contrib.TREND_STRUCTURE = ts.length ? max.TREND_STRUCTURE * directional(ts.reduce(function (a, x) { return a + x; }, 0) / ts.length) : 0;
    var mom = fam.MOMENTUM.value, rs = fam.RELATIVE_STRENGTH.value;
    var momMix = mom === null && rs === null ? null : mom === null ? rs : rs === null ? mom : 0.6 * mom + 0.4 * rs;
    contrib.MOMENTUM = momMix === null ? 0 : max.MOMENTUM * directional(momMix);
    if (rs === null) notes.push("Relative Staerke nicht verfuegbar — Momentum-Beitrag nur absolut.");
    contrib.VOLUME = fam.VOLUME.value === null ? max.VOLUME * 0.4 : max.VOLUME * directional(fam.VOLUME.value);
    if (fam.VOLUME.value === null) notes.push("Volumen nicht verfuegbar — reduzierter Beitrag.");
    contrib.VOLATILITY = fam.VOLATILITY.value === null ? max.VOLATILITY * 0.5 : max.VOLATILITY * unit(fam.VOLATILITY.value);
    var setup = b.tradeSetup;
    if (setup && (setup.status === "COMPLETE") && C.isNum(setup.setupQuality)) contrib.SETUP = max.SETUP * setup.setupQuality / 100;
    else if (setup && setup.status === "COMPLETE_LOW_RR" && C.isNum(setup.setupQuality)) contrib.SETUP = max.SETUP * setup.setupQuality / 100 * 0.6;
    else if (primary && primary.invalidation) contrib.SETUP = max.SETUP * 0.2;
    else contrib.SETUP = 0;
    if (!setup || setup.status === "INCOMPLETE") notes.push("Kein vollstaendiges Trade Setup (" + (setup ? setup.missing.join(", ") : "kein Szenario") + ").");
    contrib.PROJECTION_AUXILIARY = fam.PROJECTION_AUXILIARY.value === null ? 0 : max.PROJECTION_AUXILIARY * directional(fam.PROJECTION_AUXILIARY.value / 0.3);

    var total = 0;
    Object.keys(contrib).forEach(function (k) { contrib[k] = C.round(C.clamp(contrib[k], 0, max[k]), 2); total += contrib[k]; });
    total = C.round(C.clamp(total * (1 - b.confluence.conflictPenalty), 0, 100), 1);
    var band = null;
    for (var k = 0; k < cfg.bands.length; k++) if (total >= cfg.bands[k].min) { band = cfg.bands[k]; break; }

    return {
      scoreVersion: SCORE_VERSION, parametersHash: Hash.hashValue({ v: SCORE_VERSION, cfg: cfg }),
      score: total, interpretation: "methodology_rank", isProbability: false,
      band: band, contributions: contrib, maxContribution: max, conflictPenalty: b.confluence.conflictPenalty,
      direction: primary ? primary.direction : "UNDETERMINED", percentile: null, universeId: null, notes: notes,
      disclaimer: "Methodologischer Setup-Rang 0–100. Keine Wahrscheinlichkeit, keine Renditeerwartung."
    };
  }

  var api = { SCORE_VERSION: SCORE_VERSION, DEFAULTS: DEFAULTS, computeOpportunityScore: computeOpportunityScore };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Score = api; }
})(typeof window !== "undefined" ? window : globalThis);
