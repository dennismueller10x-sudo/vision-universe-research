/* Compact, static Product Data projection of the existing Technical bundle.
 * The full private history is consumed at build time; browsers receive only
 * the validated display window and derived evidence. */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var VERSION = "technical-product-artifact-1.0.0";
  var DISPLAY_BARS = 270;

  function shardKey(ticker) {
    var t = String(ticker || "").toUpperCase();
    if (!/^[A-Z0-9.-]{1,12}$/.test(t)) throw new Error("INVALID_PRODUCT_TICKER");
    return (t + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_");
  }

  function compactBars(series, from) {
    function sl(a) { return a.slice(from); }
    return { from: series.timestamps[from], fromIndex: from,
      timestamps: sl(series.timestamps), open: sl(series.open), high: sl(series.high),
      low: sl(series.low), close: sl(series.close), volume: sl(series.volume),
      corporateActionFlags: sl(series.corporateActionFlags) };
  }

  function compactBundle(bundle, from, fromTime) {
    var out = Object.assign({}, bundle);
    out.display = { fromIndex: from, from: fromTime,
      bars: bundle.dataCutoffIndex - from + 1,
      note: "Analyse ueber " + bundle.analysisLookback.bars + " Bars; materialisierte Anzeige der letzten " + (bundle.dataCutoffIndex - from + 1) };
    if (bundle.pivots) {
      out.pivots = Object.assign({}, bundle.pivots, {
        hierarchy: (bundle.pivots.hierarchy || []).filter(function (h) { return h.pivotIndex >= from; }),
        scales: {}
      });
      for (var i = 0; i < (bundle.pivots.scaleIds || []).length; i++) {
        var sid = bundle.pivots.scaleIds[i], sc = bundle.pivots.scales[sid];
        var min = sid === "scale-1" ? Math.max(from, bundle.dataCutoffIndex - 126) : from;
        out.pivots.scales[sid] = Object.assign({}, sc, { totalPivots: sc.pivots.length,
          pivots: sc.pivots.filter(function (p) { return p.pivotIndex >= min; }).map(function (p) {
            var q = Object.assign({}, p); delete q.sourceBarsHash; return q;
          }) });
      }
    }
    if (bundle.structure) out.structure = Object.assign({}, bundle.structure, {
      swings: (bundle.structure.swings || []).filter(function (x) { return x.index >= from; }),
      events: (bundle.structure.events || []).filter(function (e) {
        return (e.index >= from && !/LEVEL_SWEEP/.test(e.type)) || e.index >= bundle.dataCutoffIndex - 126;
      }), totalSwings: (bundle.structure.swings || []).length,
      totalEvents: (bundle.structure.events || []).length
    });
    if (bundle.chartSeries) {
      out.chartSeries = {};
      Object.keys(bundle.chartSeries).forEach(function (key) { out.chartSeries[key] = bundle.chartSeries[key].slice(from); });
    }
    if (bundle.annotations) out.annotations = Object.assign({}, bundle.annotations, {
      totalAnnotations: bundle.annotations.annotations.length,
      annotations: bundle.annotations.annotations.filter(function (a) {
        return (a.endTime && a.endTime >= fromTime) || (a.startTime && a.startTime >= fromTime) || !a.startTime;
      })
    });
    return out;
  }

  function project(input) {
    var ticker = input.ticker, securityId = input.securityId, series = input.series,
        bundle = input.bundle, provenance = input.provenance || {};
    if (!/^[A-Z0-9.-]{1,12}$/.test(ticker) || securityId !== "ref_" + ticker ||
        !series || series.instrumentId !== ticker || series.priceSeriesType !== "SPLIT_ADJUSTED" ||
        series.length < 300 || !bundle || bundle.instrumentId !== ticker ||
        bundle.methodologyVersion !== "technical-v1.0.0") throw new Error("INVALID_PRODUCT_TECHNICAL_INPUT");
    var from = Math.max(0, series.length - DISPLAY_BARS), artifact = {
      schemaVersion: VERSION, instrumentId: ticker, securityId: securityId,
      dataMode: "real", isMock: false, source: "tiingo", sourceRevision: provenance.observedAt,
      priceSeriesType: "SPLIT_ADJUSTED", benchmarkId: input.benchmarkId || null,
      bars: compactBars(series, from), bundle: compactBundle(bundle, from, series.timestamps[from]),
      snapshotId: "pts_" + Hash.hashValue({ ticker: ticker, dataHash: bundle.dataHash,
        methodology: bundle.methodologyVersion, parameters: bundle.parametersHash }),
      provenance: {
        historyOwner: "quant/engines/history-store.js", processingOwner: "quant/engines/technical/technical-analysis.js",
        sourceObjectUpdatedAt: provenance.observedAt || null, sourceBars: series.length,
        first: series.timestamps[0], last: series.timestamps[series.length - 1],
        adjustmentStatus: provenance.adjustmentStatus,
        splitEvents: provenance.splitEvents || 0, dividendEvents: provenance.dividendEvents || 0,
        corporateActionReconciliation: provenance.corporateActionReconciliation,
        calendarValidation: provenance.calendarValidation
      }
    };
    return artifact;
  }

  function validateShard(shard, key) {
    if (!shard || shard.schemaVersion !== VERSION || shard.shard !== key ||
        !shard.instruments || typeof shard.instruments !== "object") return false;
    return Object.keys(shard.instruments).every(function (ticker) {
      var x = shard.instruments[ticker], b = x && x.bundle, bars = x && x.bars;
      return shardKey(ticker) === key && x.instrumentId === ticker && x.securityId === "ref_" + ticker &&
        x.dataMode === "real" && x.isMock === false && x.source === "tiingo" &&
        x.priceSeriesType === "SPLIT_ADJUSTED" && b && b.instrumentId === ticker &&
        b.methodologyVersion === "technical-v1.0.0" && Array.isArray(bars && bars.timestamps) && bars.timestamps.length >= 2;
    });
  }

  var api = { VERSION: VERSION, DISPLAY_BARS: DISPLAY_BARS, shardKey: shardKey,
    compactBars: compactBars, compactBundle: compactBundle, project: project, validateShard: validateShard };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ProductMaterialization = api; }
})(typeof window !== "undefined" ? window : globalThis);
