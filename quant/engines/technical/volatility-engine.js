/* =========================================================================
   VISION UNIVERSE TECHNICAL — volatility-engine.js
   VOLATILITY ENGINE

   ATR (Preiseinheiten), ATR %, Realized/Downside Volatility, Range
   Expansion/Contraction, Compression (Perzentilrang von ATR/Preis und
   Bollinger-Breite gegen die eigene Historie), Regime.

   Zweck: Risiko, Stop-Distanz-Buffer, Entry-Zonen-Breite, Setup-Qualitaet,
   Projektionsbreite. ATR ist KEIN Stop-Loss-Modell — der strukturelle Level
   kommt aus Struktur/Elliott; ATR liefert den Noise Buffer.
   Die Familie VOLATILITY traegt zur Setup-Qualitaet bei, nicht zur Richtung.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var C = isNode ? require("./engine-common.js") : global.VUTechnical.Common;

  var ENGINE_VERSION = "volatility-1.0.0";
  var DEFAULTS = { compressionBelowPercentile: 20, expansionAbovePercentile: 80, regime: { lowBelowPercentile: 25, highAbovePercentile: 75 }, rangeChangeWindow: 20 };

  function analyzeVolatility(series, features, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    var f = features.columns, i = series.length - 1, ev = [];
    var atr = f.atr[i], atrPct = f.atrPct[i], pct = f.atrPctPercentile[i], bbPct = f.bollingerWidthPercentile[i];
    var prevAtrPct = f.atrPct[i - cfg.rangeChangeWindow];
    var rangeChange = C.isNum(atrPct) && C.isNum(prevAtrPct) && prevAtrPct > 0 ? atrPct / prevAtrPct - 1 : NaN;

    var regime = !C.isNum(pct) ? "UNDETERMINED" : pct < cfg.regime.lowBelowPercentile ? "LOW" : pct > cfg.regime.highAbovePercentile ? "HIGH" : "NORMAL";
    var compression = (C.isNum(pct) && pct < cfg.compressionBelowPercentile) || (C.isNum(bbPct) && bbPct < cfg.compressionBelowPercentile);
    var expansion = (C.isNum(pct) && pct > cfg.expansionAbovePercentile) || (C.isNum(bbPct) && bbPct > cfg.expansionAbovePercentile);
    var rangeState = C.isNum(rangeChange) ? (rangeChange > 0.2 ? "EXPANDING" : rangeChange < -0.2 ? "CONTRACTING" : "STABLE") : "UNDETERMINED";

    if (C.isNum(atrPct)) ev.push(C.evidence(ENGINE_VERSION, "VOLATILITY", "atrPct", "ATR " + C.round(atrPct * 100, 2) + " % des Kurses" + (C.isNum(pct) ? " (Perzentil " + C.round(pct, 0) + ")" : ""), atrPct, 0, 1));
    if (compression) ev.push(C.evidence(ENGINE_VERSION, "VOLATILITY", "compression", "Volatilitaets-Kompression (unter dem " + cfg.compressionBelowPercentile + ". Perzentil)", pct, 1, 1));
    if (expansion) ev.push(C.evidence(ENGINE_VERSION, "VOLATILITY", "expansion", "Volatilitaets-Expansion (ueber dem " + cfg.expansionAbovePercentile + ". Perzentil)", pct, -1, 1));
    if (rangeState !== "STABLE" && rangeState !== "UNDETERMINED") ev.push(C.evidence(ENGINE_VERSION, "VOLATILITY", "rangeChange", "Range " + (rangeState === "EXPANDING" ? "weitet sich aus" : "zieht sich zusammen") + " (" + C.round(rangeChange * 100, 0) + " % in " + cfg.rangeChangeWindow + " Bars)", rangeChange, 0, 0.5));

    /* Qualitaetswert: Kompression positiv (Setup-Qualitaet), hohe/expandierende Vol negativ. */
    var value = compression ? 0.6 : (expansion && regime === "HIGH") ? -0.6 : regime === "HIGH" ? -0.3 : regime === "LOW" ? 0.3 : 0;

    return {
      engineVersion: ENGINE_VERSION, repaintingPolicy: "NON_REPAINTING", family: "VOLATILITY",
      parametersHash: Hash.hashValue({ v: ENGINE_VERSION, cfg: cfg }),
      regime: regime, compression: compression, expansion: expansion, rangeState: rangeState, value: value,
      metrics: { atr: C.orNull(atr), atrPct: C.orNull(atrPct), atrPctPercentile: C.orNull(pct),
                 realizedVol: C.orNull(f.realizedVol[i]), realizedVolLong: C.orNull(f.realizedVolLong[i]), downsideVol: C.orNull(f.downsideVol[i]),
                 bollingerWidthPct: C.orNull(f.bollingerWidthPct[i]), bollingerWidthPercentile: C.orNull(bbPct), donchianWidthPct: C.orNull(f.donchianWidthPct[i]),
                 rangeChange: C.orNull(rangeChange) },
      /* Noise Buffer fuer Stops/Zonen — keine Stop-Empfehlung. */
      noiseBufferAtr: 1.0,
      evidence: ev, asOfIndex: i, asOf: series.timestamps[i]
    };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, analyzeVolatility: analyzeVolatility };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Volatility = api; }
})(typeof window !== "undefined" ? window : globalThis);
