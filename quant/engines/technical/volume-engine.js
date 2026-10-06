/* =========================================================================
   VISION UNIVERSE TECHNICAL — volume-engine.js
   VOLUME ENGINE (V1: Average, Relative, Breakout, Expansion, Dry-Up, Trend)

   RVOL gegen den Median der vorherigen Bars (robust). Kein Volume Profile,
   kein AVWAP in V1 (Intraday-Daten noetig). Fehlt Volumen: UNAVAILABLE.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var C = isNode ? require("./engine-common.js") : global.VUTechnical.Common;

  var ENGINE_VERSION = "volume-1.0.0";
  var DEFAULTS = { dryUpBelow: 0.6, dryUpBars: 5, breakoutAbove: 1.5, expansionAbove: 1.3, recentBars: 5, directionWindow: 20 };

  function analyzeVolume(series, features, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    var f = features.columns, i = series.length - 1, ev = [];
    var vol = series.volume;
    if (!vol.some(C.isNum) || !C.isNum(f.relativeVolume[i])) {
      return { engineVersion: ENGINE_VERSION, repaintingPolicy: "NON_REPAINTING", family: "VOLUME",
               parametersHash: Hash.hashValue({ v: ENGINE_VERSION, cfg: cfg }), state: "UNAVAILABLE",
               reason: "Kein (ausreichendes) Volumen in der Serie", value: 0, coverage: 0, evidence: [], asOfIndex: i, asOf: series.timestamps[i] };
    }
    var rvol = f.relativeVolume[i];
    var recent = [];
    for (var k = Math.max(0, i - cfg.recentBars + 1); k <= i; k++) if (C.isNum(f.relativeVolume[k])) recent.push(f.relativeVolume[k]);
    var meanRecent = recent.length ? recent.reduce(function (a, b) { return a + b; }, 0) / recent.length : NaN;
    var dry = [];
    for (var d = Math.max(0, i - cfg.dryUpBars + 1); d <= i; d++) if (C.isNum(f.relativeVolume[d])) dry.push(f.relativeVolume[d]);
    dry.sort(function (a, b) { return a - b; });
    var dryMedian = dry.length ? dry[dry.length >> 1] : NaN;
    var dryUp = C.isNum(dryMedian) && dryMedian < cfg.dryUpBelow;
    var expansion = C.isNum(meanRecent) && meanRecent > cfg.expansionAbove;

    /* Breakout-Volumen: neues 20-Tage-Hoch mit RVOL > Schwelle in den letzten Bars. */
    var breakout = null;
    for (var b = i; b >= Math.max(1, i - cfg.recentBars + 1); b--) {
      var prevHigh = f.rollingHigh[b - 1];
      if (C.isNum(prevHigh) && series.close[b] > prevHigh && C.isNum(f.relativeVolume[b]) && f.relativeVolume[b] > cfg.breakoutAbove) {
        breakout = { index: b, time: series.timestamps[b], relativeVolume: C.round(f.relativeVolume[b], 2), direction: "UP" }; break;
      }
      var prevLow = f.rollingLow[b - 1];
      if (C.isNum(prevLow) && series.close[b] < prevLow && C.isNum(f.relativeVolume[b]) && f.relativeVolume[b] > cfg.breakoutAbove) {
        breakout = { index: b, time: series.timestamps[b], relativeVolume: C.round(f.relativeVolume[b], 2), direction: "DOWN" }; break;
      }
    }
    /* Richtungsanteil: Volumen an Up-Tagen / Gesamtvolumen. */
    var up = 0, total = 0;
    for (var q = Math.max(1, i - cfg.directionWindow + 1); q <= i; q++) {
      if (!C.isNum(vol[q])) continue;
      total += vol[q]; if (series.close[q] > series.close[q - 1]) up += vol[q];
    }
    var upShare = total > 0 ? up / total : NaN;
    var trend = f.volumeTrend[i];

    ev.push(C.evidence(ENGINE_VERSION, "VOLUME", "rvol", "Relatives Volumen " + C.round(rvol, 2) + "× (Median " + 20 + " Bars)", rvol, 0, 0.5));
    if (C.isNum(upShare)) ev.push(C.evidence(ENGINE_VERSION, "VOLUME", "upShare", C.round(upShare * 100, 0) + " % des Volumens an Aufwaertstagen (" + cfg.directionWindow + " Bars)", upShare, upShare > 0.58 ? 1 : upShare < 0.42 ? -1 : 0, 1));
    if (breakout) ev.push(C.evidence(ENGINE_VERSION, "VOLUME", "breakout", "Ausbruch " + (breakout.direction === "UP" ? "nach oben" : "nach unten") + " mit " + breakout.relativeVolume + "× Volumen am " + breakout.time, breakout.relativeVolume, breakout.direction === "UP" ? 1 : -1, 1));
    if (dryUp) ev.push(C.evidence(ENGINE_VERSION, "VOLUME", "dryUp", "Volumen trocknet aus (Median " + C.round(dryMedian, 2) + "× ueber " + cfg.dryUpBars + " Bars)", dryMedian, 0, 0.5));
    if (expansion && !breakout) ev.push(C.evidence(ENGINE_VERSION, "VOLUME", "expansion", "Volumen-Expansion (" + C.round(meanRecent, 2) + "× im Mittel)", meanRecent, 0, 0.5));
    if (C.isNum(trend)) ev.push(C.evidence(ENGINE_VERSION, "VOLUME", "trend", "Volumentrend " + (trend >= 0 ? "+" : "") + C.round(trend * 100, 0) + " % (20 vs 60 Bars)", trend, 0, 0.25));

    var value = 0;
    if (C.isNum(upShare)) value += C.clamp((upShare - 0.5) * 4, -0.7, 0.7);
    if (breakout) value += breakout.direction === "UP" ? 0.3 : -0.3;
    value = C.round(C.clamp(value, -1, 1), 4);
    var state = breakout ? (breakout.direction === "UP" ? "BREAKOUT_VOLUME_UP" : "BREAKOUT_VOLUME_DOWN") : dryUp ? "DRY_UP" : expansion ? "EXPANSION" : "NORMAL";

    return {
      engineVersion: ENGINE_VERSION, repaintingPolicy: "NON_REPAINTING", family: "VOLUME",
      parametersHash: Hash.hashValue({ v: ENGINE_VERSION, cfg: cfg }),
      state: state, value: value, coverage: 1,
      metrics: { volume: vol[i], averageVolume: C.orNull(f.averageVolume[i]), relativeVolume: C.round(rvol, 3), recentRelativeVolume: C.orNull(meanRecent),
                 dryUpMedian: C.orNull(dryMedian), volumeTrend: C.orNull(trend), upVolumeShare: C.orNull(upShare) },
      breakout: breakout, dryUp: dryUp, expansion: expansion,
      evidence: ev, asOfIndex: i, asOf: series.timestamps[i]
    };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, analyzeVolume: analyzeVolume };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Volume = api; }
})(typeof window !== "undefined" ? window : globalThis);
