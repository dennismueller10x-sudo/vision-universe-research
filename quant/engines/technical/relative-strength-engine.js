/* =========================================================================
   VISION UNIVERSE TECHNICAL — relative-strength-engine.js
   RELATIVE STRENGTH ENGINE (nicht RSI)

     RS_benchmark,h = R_stock,h − R_benchmark,h
     RS_sector,h    = R_stock,h − R_sector,h
     + relativer Trend (Steigung der Ratio-Linie)
     + Cross-Sectional-Rang (falls das Universum ihn liefert)

   Ohne Benchmark: status UNAVAILABLE mit Grund — kein neutraler Ersatzwert.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var C = isNode ? require("./engine-common.js") : global.VUTechnical.Common;
  var Features = isNode ? require("./feature-store.js") : global.VUTechnical.Features;

  var ENGINE_VERSION = "rs-1.0.0";
  var DEFAULTS = { horizons: { "1M": 21, "3M": 63, "6M": 126, "12M": 252 }, horizonWeights: { "1M": 0.15, "3M": 0.30, "6M": 0.30, "12M": 0.25 }, ratioTrendWindow: 63, scaleAbs: 0.25 };

  /** Benchmark-Close je Timestamp der Instrumentserie (letzter bekannter Wert, nie ein spaeterer). */
  function alignedCloses(series, bench) {
    var out = new Array(series.length), j = 0, last = NaN;
    for (var i = 0; i < series.length; i++) {
      while (j < bench.length && bench.timestamps[j] <= series.timestamps[i]) { last = bench.close[j]; j++; }
      out[i] = last;
    }
    return out;
  }

  function relative(series, benchSeries, cfg, label) {
    if (!benchSeries || !benchSeries.length) return { status: "UNAVAILABLE", reason: label + " nicht verfuegbar" };
    var b = alignedCloses(series, benchSeries);
    var i = series.length - 1, horizons = {}, comps = {}, ev = [];
    Object.keys(cfg.horizons).forEach(function (h) {
      var w = cfg.horizons[h];
      if (i - w < 0 || !C.isNum(b[i]) || !C.isNum(b[i - w])) { horizons[h] = null; return; }
      var rs = Math.log(series.close[i] / series.close[i - w]) - Math.log(b[i] / b[i - w]);
      horizons[h] = C.round(rs, 4); comps[h] = rs;
    });
    var ws = C.weightedScore(comps, cfg.horizonWeights);
    var composite = C.isNum(ws.score) ? ws.score : null;
    /* Relativer Trend: Regressionssteigung der Log-Ratio, normiert. */
    var logRatio = series.close.map(function (c, k) { return C.isNum(b[k]) ? Math.log(c / b[k]) : NaN; });
    var reg = Features.regressionSlope(logRatio, cfg.ratioTrendWindow);
    var diffs = logRatio.map(function (v, k) { return k > 0 && C.isNum(v) && C.isNum(logRatio[k - 1]) ? v - logRatio[k - 1] : NaN; });
    var sd = Features.rollingStd(diffs, cfg.ratioTrendWindow)[i];
    var slopeZ = C.isNum(reg.slope[i]) && C.isNum(sd) && sd > 0 ? reg.slope[i] / sd * Math.sqrt(cfg.ratioTrendWindow) : NaN;
    return { status: "OK", benchmarkId: benchSeries.instrumentId, horizons: horizons, composite: composite === null ? null : C.round(composite, 4),
             coverage: C.round(ws.coverage, 2), ratioTrendZ: C.isNum(slopeZ) ? C.round(slopeZ, 3) : null, ratioR2: C.orNull(reg.r2[i]) };
  }

  /**
   * @param {object} series          Instrument (SPLIT_ADJUSTED)
   * @param {object} benchmarkSeries Benchmark-Serie (nur close/timestamps noetig)
   * @param {object} [opts]          { sectorSeries, universeRank: {percentile, universeId, n}, cfg }
   */
  function analyzeRelativeStrength(series, benchmarkSeries, opts) {
    opts = opts || {};
    var cfg = Object.assign({}, DEFAULTS, opts.cfg || {});
    var vsBench = relative(series, benchmarkSeries, cfg, "Benchmark");
    var vsSector = relative(series, opts.sectorSeries, cfg, "Sektor-Benchmark");
    var ev = [];
    var score = null, value = 0, state = "UNAVAILABLE", reason = null;
    if (vsBench.status === "OK" && vsBench.composite !== null && vsBench.coverage >= 0.5) {
      var x = vsBench.composite / cfg.scaleAbs;
      if (C.isNum(vsBench.ratioTrendZ)) x = 0.7 * x + 0.3 * C.tanh(vsBench.ratioTrendZ / 2);
      score = C.round(50 + 50 * C.tanh(x), 1);
      value = C.round((score - 50) / 50, 4);
      state = score > 70 ? "STRONG" : score > 55 ? "OUTPERFORMING" : score < 30 ? "WEAK" : score < 45 ? "UNDERPERFORMING" : "IN_LINE";
      Object.keys(vsBench.horizons).forEach(function (h) {
        var v = vsBench.horizons[h]; if (v === null) return;
        ev.push(C.evidence(ENGINE_VERSION, "RELATIVE_STRENGTH", "rs" + h, "Relative Staerke " + h + " vs. " + vsBench.benchmarkId + ": " + C.round((Math.exp(v) - 1) * 100, 1) + " Pp", v, v > 0.02 ? 1 : v < -0.02 ? -1 : 0, cfg.horizonWeights[h]));
      });
      if (C.isNum(vsBench.ratioTrendZ)) ev.push(C.evidence(ENGINE_VERSION, "RELATIVE_STRENGTH", "ratioTrend", "Relativer Trend (Ratio-Linie) " + (vsBench.ratioTrendZ >= 0 ? "steigend" : "fallend") + ", z=" + vsBench.ratioTrendZ, vsBench.ratioTrendZ, vsBench.ratioTrendZ > 0.5 ? 1 : vsBench.ratioTrendZ < -0.5 ? -1 : 0, 0.5));
    } else reason = vsBench.reason || "zu wenig gemeinsame Historie";
    if (opts.universeRank && C.isNum(opts.universeRank.percentile)) {
      ev.push(C.evidence(ENGINE_VERSION, "RELATIVE_STRENGTH", "universeRank", "RS-Perzentil " + C.round(opts.universeRank.percentile, 0) + " im Universum (" + opts.universeRank.n + " Titel)", opts.universeRank.percentile, opts.universeRank.percentile >= 70 ? 1 : opts.universeRank.percentile <= 30 ? -1 : 0, 0.5));
    }
    return {
      engineVersion: ENGINE_VERSION, repaintingPolicy: "NON_REPAINTING", family: "RELATIVE_STRENGTH",
      parametersHash: Hash.hashValue({ v: ENGINE_VERSION, cfg: cfg }),
      state: state, reason: reason, rsScore: score, scoreType: "methodology_score", value: value,
      vsBenchmark: vsBench, vsSector: vsSector, universeRank: opts.universeRank || null,
      evidence: ev, asOfIndex: series.length - 1, asOf: series.timestamps[series.length - 1]
    };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, alignedCloses: alignedCloses, analyzeRelativeStrength: analyzeRelativeStrength };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.RelativeStrength = api; }
})(typeof window !== "undefined" ? window : globalThis);
