/* =========================================================================
   VISION UNIVERSE TECHNICAL — trend-engine.js
   TREND ENGINE

   Fuenf Informationsgruppen statt zehn fast identischer Moving Averages:
     MA / price location, normalisierte Regressionssteigung, Persistenz,
     Naehe zum 52W-Hoch, Richtungsstaerke (ADX, sekundaer).

     Trend = 0.35 MAState + 0.25 RegressionSlope + 0.20 Persistence
           + 0.10 HighProximity + 0.10 DirectionalStrength      (0..100)

   >65 BULLISH, <35 BEARISH, dazwischen NEUTRAL. Score = Methodology Score,
   keine Wahrscheinlichkeit. MA-Steigungen sind in ATR-Einheiten
   normalisiert. Alle Gewichte/Schwellen: technical-v1.json → trend.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var C = isNode ? require("./engine-common.js") : global.VUTechnical.Common;

  var ENGINE_VERSION = "trend-1.0.0";
  var DEFAULTS = { weights: { maState: 0.35, regressionSlope: 0.25, persistence: 0.20, highProximity: 0.10, directionalStrength: 0.10 },
                   bullishAbove: 65, bearishBelow: 35, persistenceWindow: 63 };

  function analyzeTrend(series, features, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    var f = features.columns, i = series.length - 1, close = series.close[i];
    var atr = f.atr[i];
    var ev = [];
    var comp = {};

    /* 1 MA-State: graduell in ATR-Distanzen, nicht binaer. */
    var parts = [];
    function loc(price, ma, label) {
      if (!C.isNum(ma) || !C.isNum(atr) || atr <= 0) return;
      var d = (price - ma) / atr;                     // ATR-Distanz
      parts.push(50 + 50 * C.tanh(d / 2));
      ev.push(C.evidence(ENGINE_VERSION, "TREND", label, (d >= 0 ? "Kurs ueber " : "Kurs unter ") + label + " (" + C.round(d, 2) + " ATR)", d, d >= 0 ? 1 : -1, 1));
    }
    loc(close, f.sma50[i], "SMA50");
    loc(close, f.sma200[i], "SMA200");
    if (C.isNum(f.sma50[i]) && C.isNum(f.sma200[i]) && C.isNum(atr) && atr > 0) {
      var dd = (f.sma50[i] - f.sma200[i]) / atr;
      parts.push(50 + 50 * C.tanh(dd / 3));
      ev.push(C.evidence(ENGINE_VERSION, "TREND", "SMA50_vs_SMA200", (dd >= 0 ? "SMA50 ueber SMA200" : "SMA50 unter SMA200") + " (" + C.round(dd, 2) + " ATR)", dd, dd >= 0 ? 1 : -1, 1));
    }
    [50, 200].forEach(function (p) {
      var s = f["sma" + p + "SlopeAtr"][i];
      if (!C.isNum(s)) return;
      parts.push(50 + 50 * C.tanh(s));
      ev.push(C.evidence(ENGINE_VERSION, "TREND", "SMA" + p + "_slope", "SMA" + p + " " + (s >= 0 ? "steigt" : "faellt") + " (" + C.round(s, 2) + " ATR / 20 Bars)", s, s >= 0 ? 1 : -1, 0.5));
    });
    comp.maState = parts.length ? parts.reduce(function (a, b) { return a + b; }, 0) / parts.length : NaN;

    /* 2 Regression: volatilitaetsnormierte Steigung. */
    var z = f.regressionSlopeZ[i];
    comp.regressionSlope = C.isNum(z) ? 50 + 50 * C.tanh(z / 2) : NaN;
    if (C.isNum(z)) ev.push(C.evidence(ENGINE_VERSION, "TREND", "regression", "Regressionssteigung (60 Bars) " + (z >= 0 ? "positiv" : "negativ") + ", z=" + C.round(z, 2) + ", R²=" + C.round(f.regressionR2[i], 2), z, z >= 0 ? 1 : -1, 1));

    /* 3 Persistenz: Anteil der Bars ueber SMA50 im Fenster. */
    var w = cfg.persistenceWindow, above = 0, cnt = 0;
    for (var k = Math.max(0, i - w + 1); k <= i; k++) { if (!C.isNum(f.sma50[k])) continue; cnt++; if (series.close[k] > f.sma50[k]) above++; }
    comp.persistence = cnt >= w * 0.8 ? 100 * above / cnt : NaN;
    if (C.isNum(comp.persistence)) ev.push(C.evidence(ENGINE_VERSION, "TREND", "persistence", C.round(comp.persistence, 0) + " % der letzten " + w + " Bars ueber SMA50", comp.persistence / 100, comp.persistence >= 50 ? 1 : -1, 1));

    /* 4 Naehe zum 52W-Hoch. */
    var d52 = f.distanceTo52wHigh[i];
    comp.highProximity = C.isNum(d52) ? 100 * C.clamp(1 + d52 / 0.3, 0, 1) : NaN;
    if (C.isNum(d52)) ev.push(C.evidence(ENGINE_VERSION, "TREND", "high52w", C.round(-d52 * 100, 1) + " % unter dem 52-Wochen-Hoch", d52, d52 > -0.1 ? 1 : d52 < -0.25 ? -1 : 0, 0.5));

    /* 5 Richtungsstaerke (ADX) — sekundaer. */
    var adx = f.adx[i];
    if (C.isNum(adx) && C.isNum(f.plusDI[i]) && C.isNum(f.minusDI[i])) {
      var strength = C.clamp(adx * 2, 0, 100);
      comp.directionalStrength = f.plusDI[i] >= f.minusDI[i] ? 50 + strength / 2 : 50 - strength / 2;
      ev.push(C.evidence(ENGINE_VERSION, "TREND", "adx", "ADX " + C.round(adx, 1) + " (" + (f.plusDI[i] >= f.minusDI[i] ? "+DI dominiert" : "−DI dominiert") + ")", adx, f.plusDI[i] >= f.minusDI[i] ? 1 : -1, 0.5));
    } else comp.directionalStrength = NaN;

    var ws = C.weightedScore(comp, cfg.weights);
    var score = C.isNum(ws.score) ? C.round(ws.score, 1) : null;
    var direction = score === null || ws.coverage < 0.5 ? "UNDETERMINED" : score > cfg.bullishAbove ? "BULLISH" : score < cfg.bearishBelow ? "BEARISH" : "NEUTRAL";
    var components = {};
    Object.keys(comp).forEach(function (k) { components[k] = C.isNum(comp[k]) ? C.round(comp[k], 1) : null; });

    return {
      engineVersion: ENGINE_VERSION, repaintingPolicy: "NON_REPAINTING", family: "TREND",
      parametersHash: Hash.hashValue({ v: ENGINE_VERSION, cfg: cfg }),
      direction: direction, trendScore: score, scoreType: "methodology_score",
      value: score === null ? 0 : C.round((score - 50) / 50, 4),
      coverage: C.round(ws.coverage, 2), components: components, evidence: ev,
      metrics: { close: close, sma20: C.orNull(f.sma20[i]), sma50: C.orNull(f.sma50[i]), sma200: C.orNull(f.sma200[i]),
                 ema20: C.orNull(f.ema20[i]), ema50: C.orNull(f.ema50[i]), distanceTo52wHigh: C.orNull(d52), distanceTo52wLow: C.orNull(f.distanceTo52wLow[i]),
                 regressionSlopeZ: C.orNull(z), adx: C.orNull(adx) },
      asOfIndex: i, asOf: series.timestamps[i]
    };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, analyzeTrend: analyzeTrend };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Trend = api; }
})(typeof window !== "undefined" ? window : globalThis);
