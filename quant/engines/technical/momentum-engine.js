/* =========================================================================
   VISION UNIVERSE TECHNICAL — momentum-engine.js
   MOMENTUM ENGINE

   Kern-Momentum = direkte Multi-Horizon-Log-Returns (1M/3M/6M/12M),
   volatilitaetsstandardisiert, plus Beschleunigung z(kurz) − z(mittel).
   RSI und MACD werden ausgegeben (explanatory), sind aber KEIN eigener
   Confluence-Vote: sie stammen aus derselben Preisinformation.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var C = isNode ? require("./engine-common.js") : global.VUTechnical.Common;

  var ENGINE_VERSION = "momentum-1.0.0";
  var DEFAULTS = { horizonWeights: { "1M": 0.15, "3M": 0.30, "6M": 0.30, "12M": 0.25 }, zClamp: 3 };

  function analyzeMomentum(series, features, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    var f = features.columns, i = series.length - 1;
    var ev = [], horizons = {}, zs = {};
    Object.keys(cfg.horizonWeights).forEach(function (h) {
      var m = f["momentum" + h][i], z = f["momentum" + h + "Z"][i];
      horizons[h] = { logReturn: C.orNull(m), return: C.isNum(m) ? C.round(Math.exp(m) - 1, 4) : null, z: C.isNum(z) ? C.round(C.clamp(z, -cfg.zClamp, cfg.zClamp), 3) : null };
      if (C.isNum(z)) {
        zs[h] = C.clamp(z, -cfg.zClamp, cfg.zClamp);
        ev.push(C.evidence(ENGINE_VERSION, "MOMENTUM", "mom" + h, h + "-Momentum " + C.round((Math.exp(m) - 1) * 100, 1) + " % (z=" + C.round(zs[h], 2) + ")", zs[h], zs[h] > 0.3 ? 1 : zs[h] < -0.3 ? -1 : 0, cfg.horizonWeights[h]));
      }
    });
    var ws = C.weightedScore(zs, cfg.horizonWeights);
    var composite = C.isNum(ws.score) ? ws.score : null;
    var accel = C.isNum(zs["1M"]) && C.isNum(zs["3M"]) ? C.round(zs["1M"] - zs["3M"], 3) : null;
    if (accel !== null) ev.push(C.evidence(ENGINE_VERSION, "MOMENTUM", "acceleration", "Momentum-Beschleunigung " + (accel >= 0 ? "positiv" : "negativ") + " (" + accel + ")", accel, accel > 0.3 ? 1 : accel < -0.3 ? -1 : 0, 0.5));

    var score = composite === null ? null : C.round(50 + 50 * C.tanh(composite / 1.5), 1);
    var state = score === null || ws.coverage < 0.5 ? "UNDETERMINED" : score > 75 ? "STRONG_POSITIVE" : score > 58 ? "POSITIVE" : score < 25 ? "STRONG_NEGATIVE" : score < 42 ? "NEGATIVE" : "NEUTRAL";
    var rsi = f.rsi14[i], macd = f.macd[i], sig = f.macdSignal[i], hist = f.macdHistogram[i];

    return {
      engineVersion: ENGINE_VERSION, repaintingPolicy: "NON_REPAINTING", family: "MOMENTUM",
      parametersHash: Hash.hashValue({ v: ENGINE_VERSION, cfg: cfg }),
      state: state, momentumScore: score, scoreType: "methodology_score",
      value: score === null || state === "UNDETERMINED" ? 0 : C.round((score - 50) / 50, 4), coverage: C.round(ws.coverage, 2),
      composite: composite === null ? null : C.round(composite, 3), acceleration: accel, horizons: horizons,
      momentum12m1m: C.isNum(f.momentum12m1m[i]) ? C.round(Math.exp(f.momentum12m1m[i]) - 1, 4) : null,
      /* Explanatory-Indikatoren: dargestellt, nicht gewertet. */
      explanatory: {
        rsi14: { value: C.orNull(rsi), vote: false, zone: C.isNum(rsi) ? (rsi >= 70 ? "hoch" : rsi <= 30 ? "niedrig" : "mittel") : null },
        macd: { value: C.orNull(macd), signal: C.orNull(sig), histogram: C.orNull(hist), vote: false,
                cross: C.isNum(hist) ? (hist > 0 ? "ueber Signal" : "unter Signal") : null },
        roc10: C.orNull(f.roc10[i]), roc21: C.orNull(f.roc21[i])
      },
      evidence: ev, asOfIndex: i, asOf: series.timestamps[i]
    };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, analyzeMomentum: analyzeMomentum };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Momentum = api; }
})(typeof window !== "undefined" ? window : globalThis);
