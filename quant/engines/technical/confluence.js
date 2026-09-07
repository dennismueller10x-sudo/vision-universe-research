/* =========================================================================
   VISION UNIVERSE TECHNICAL — confluence.js
   DEPENDENCY-AWARE CONFLUENCE

   Keine naive Zaehlung "6 bullische Signale = 6 Votes". Signale werden
   zuerst innerhalb ihrer Familie aggregiert (das tun die Engines), nur
   Familien-Evidenz gelangt hierher:

     STRUCTURE, TREND, MOMENTUM, RELATIVE_STRENGTH, VOLUME, PRICE_ZONES
       → richtungsgebend
     VOLATILITY                → Setup-Qualitaet, nicht Richtung
     PROJECTION_AUXILIARY      → Fibonacci + Elliott, hart gekappt

   Ein Conflict Penalty aus der Streuung der Vorzeichen verhindert, dass
   ein einzelner Ausreisser zum Konsens umgedeutet wird. Ergebnis ist ein
   Methodology Score, keine Wahrscheinlichkeit.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var C = isNode ? require("./engine-common.js") : global.VUTechnical.Common;

  var ENGINE_VERSION = "confluence-1.0.0";
  var FAMILIES = ["STRUCTURE", "TREND", "MOMENTUM", "RELATIVE_STRENGTH", "VOLATILITY", "VOLUME", "PRICE_ZONES", "PROJECTION_AUXILIARY"];
  var DIRECTIONAL_WEIGHTS = { STRUCTURE: 0.25, TREND: 0.25, MOMENTUM: 0.15, RELATIVE_STRENGTH: 0.10, VOLUME: 0.10, PRICE_ZONES: 0.10, PROJECTION_AUXILIARY: 0.05 };
  var AUX_CAP = 0.3;
  var DEFAULTS = { conflictPenalty: 0.15 };

  /**
   * @param {object} engines { structure, trend, momentum, relativeStrength, volatility, volume, supportResistance, fibonacci, elliott }
   * @param {string} direction BULLISH | BEARISH | NEUTRAL
   */
  function computeConfluence(engines, direction, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    var e = engines;
    var aux = (e.fibonacci ? e.fibonacci.value : 0) + (e.elliott && C.isNum(e.elliott.value) ? e.elliott.value : 0);
    var families = {
      STRUCTURE: fam(e.structure && e.structure.state ? e.structure.state.structureScore : NaN, e.structure, "structure"),
      TREND: fam(e.trend ? e.trend.value : NaN, e.trend, "trend"),
      MOMENTUM: fam(e.momentum ? e.momentum.value : NaN, e.momentum, "momentum"),
      RELATIVE_STRENGTH: fam(e.relativeStrength && e.relativeStrength.state !== "UNAVAILABLE" ? e.relativeStrength.value : NaN, e.relativeStrength, "relativeStrength"),
      VOLATILITY: fam(e.volatility ? e.volatility.value : NaN, e.volatility, "volatility"),
      VOLUME: fam(e.volume && e.volume.state !== "UNAVAILABLE" ? e.volume.value : NaN, e.volume, "volume"),
      PRICE_ZONES: fam(e.supportResistance ? e.supportResistance.value : NaN, e.supportResistance, "supportResistance"),
      PROJECTION_AUXILIARY: fam(C.clamp(aux, -AUX_CAP, AUX_CAP), e.fibonacci, "fibonacci+elliott")
    };
    function fam(value, engine, name) {
      return { value: C.isNum(value) ? C.round(value, 4) : null, available: C.isNum(value), engine: name,
               engineVersion: engine ? engine.engineVersion : null, evidenceCount: engine && engine.evidence ? engine.evidence.length : 0 };
    }

    var sum = 0, wsum = 0, total = 0, signs = [];
    Object.keys(DIRECTIONAL_WEIGHTS).forEach(function (k) {
      var w = DIRECTIONAL_WEIGHTS[k]; total += w;
      var v = families[k].value;
      if (v === null) return;
      sum += w * v; wsum += w;
      if (Math.abs(v) > 0.2 && k !== "PROJECTION_AUXILIARY") signs.push(v > 0 ? 1 : -1);
    });
    var signed = wsum > 0 ? sum / wsum : 0;
    var coverage = total > 0 ? wsum / total : 0;
    var pos = signs.filter(function (s) { return s > 0; }).length, neg = signs.length - pos;
    var minority = signs.length ? Math.min(pos, neg) / signs.length : 0;
    var penalty = C.round(cfg.conflictPenalty * minority * 2, 4);
    var dirSign = direction === "BULLISH" ? 1 : direction === "BEARISH" ? -1 : 0;
    var aligned = dirSign === 0 ? Math.abs(signed) : signed * dirSign;
    var score = C.round(C.clamp(50 + 50 * aligned, 0, 100) * (1 - penalty), 1);
    var agreeing = Object.keys(DIRECTIONAL_WEIGHTS).filter(function (k) { var v = families[k].value; return v !== null && dirSign !== 0 && v * dirSign > 0.2; });
    var opposing = Object.keys(DIRECTIONAL_WEIGHTS).filter(function (k) { var v = families[k].value; return v !== null && dirSign !== 0 && v * dirSign < -0.2; });

    return {
      engineVersion: ENGINE_VERSION, parametersHash: Hash.hashValue({ v: ENGINE_VERSION, w: DIRECTIONAL_WEIGHTS, cfg: cfg }),
      direction: direction, families: families, weights: DIRECTIONAL_WEIGHTS, auxiliaryCap: AUX_CAP,
      signedScore: C.round(signed, 4), coverage: C.round(coverage, 2), conflictPenalty: penalty,
      confluenceScore: score, scoreType: "methodology_score", agreeingFamilies: agreeing, opposingFamilies: opposing
    };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, FAMILIES: FAMILIES, DIRECTIONAL_WEIGHTS: DIRECTIONAL_WEIGHTS, AUX_CAP: AUX_CAP, DEFAULTS: DEFAULTS, computeConfluence: computeConfluence };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Confluence = api; }
})(typeof window !== "undefined" ? window : globalThis);
