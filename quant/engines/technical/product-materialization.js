/* Compact, static Product Data projection of the existing Technical bundle.
 * The full private history is consumed at build time; browsers receive only
 * the validated display window and derived evidence. */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var VERSION = "technical-product-artifact-1.0.0";
  var DISPLAY_BARS = 270;
  /* Chart-Historie (Owner 19.11.2026: jeder Indikator in jedem Zeitraum). Rein additiv neben `bars` und `bundle`:
     `daily` = die HISTORY_DAILY_BARS Tageskerzen VOR dem Anzeigefenster (Anlaufzeit, damit 200-Tage-Linie, EMA-Baender
     und alle Indikatoren ueber das ganze Jahr reichen; der Leser haengt `bars` an), `weekly` = die ganze Reihe als
     Wochenkerzen (3J, 5J, 10J, Max). Dieselbe SPLIT_ADJUSTED-Reihe wie `bars`. Bewusst kein 3-Jahres-Tagesfenster:
     die Scherben werden je Lauf neu committet, Wochenkerzen kosten ein Fuenftel. */
  var HISTORY_DAILY_BARS = 250, HISTORY_SCHEMA = "technical-chart-history-1.0.0";
  function r4(v) { return Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null; }
  function isoWeek(date) {
    var d = new Date(String(date).slice(0, 10) + "T00:00:00Z"), day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    var y = d.getUTCFullYear(), first = new Date(Date.UTC(y, 0, 4));
    return y + "-W" + String(1 + Math.round(((d - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)).padStart(2, "0");
  }
  /* Wochenkerze je ISO-Woche: Eroeffnung des ersten, Hoch/Tief ueber alle, Schluss des letzten Tages, Volumen summiert;
     Datum = letzter Handelstag der Woche (wie die Wochenpunkte der langen Kursreihe). */
  function weeklyBars(series) {
    var out = { timestamps: [], open: [], high: [], low: [], close: [], volume: [] }, key = null, n = -1;
    for (var i = 0; i < series.timestamps.length; i++) {
      var k = isoWeek(series.timestamps[i]);
      if (k !== key) { key = k; n++; out.timestamps.push(null); out.open.push(series.open[i]); out.high.push(series.high[i]); out.low.push(series.low[i]); out.close.push(null); out.volume.push(0); }
      out.timestamps[n] = String(series.timestamps[i]).slice(0, 10);
      if (series.high[i] > out.high[n]) out.high[n] = series.high[i];
      if (series.low[i] < out.low[n]) out.low[n] = series.low[i];
      out.close[n] = series.close[i];
      out.volume[n] += Number.isFinite(series.volume[i]) ? series.volume[i] : 0;
    }
    ["open", "high", "low", "close"].forEach(function (c) { out[c] = out[c].map(r4); });
    out.volume = out.volume.map(function (v) { return Math.round(v); });
    return out;
  }
  function chartHistory(series, from) {
    var start = Math.max(0, from - HISTORY_DAILY_BARS);
    function sl(a, f) { return a.slice(start, from).map(f || function (v) { return v; }); }
    return { schemaVersion: HISTORY_SCHEMA,
      daily: { timestamps: sl(series.timestamps, function (d) { return String(d).slice(0, 10); }), open: sl(series.open, r4), high: sl(series.high, r4),
        low: sl(series.low, r4), close: sl(series.close, r4), volume: sl(series.volume) },
      weekly: weeklyBars(series) };
  }

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

  function isDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
  }

  function validAnnotation(a, bundle) {
    var historical = { PIVOT: 1, SWING_SEGMENT: 1, WAVE_SEGMENT: 1, STRUCTURE_EVENT: 1,
      FIB_ANCHOR: 1, STRUCTURE_LABEL: 1, WAVE_LABEL: 1, STATE_LABEL: 1, NOW_DIVIDER: 1 };
    if (!a || typeof a.type !== "string" || !a.type || ["CONFIRMED", "DEVELOPING", "PROJECTED"].indexOf(a.status) < 0 ||
        !Array.isArray(a.layers) || a.layers.some(function (v) { return typeof v !== "string"; }) || !Number.isFinite(a.zOrder)) return false;
    if ([a.startTime, a.endTime].some(function (t) { return t !== null && !isDate(t); }) ||
        [a.startPrice, a.endPrice].some(function (v) { return v !== null && !Number.isFinite(v); })) return false;
    if (a.startTime && a.endTime && a.startTime > a.endTime) return false;
    if (a.status !== "PROJECTED" && historical[a.type] && [a.startTime, a.endTime].some(function (t) { return t && t > bundle.dataCutoff; })) return false;
    if (a.meta && a.meta.confirmedAt && (!isDate(a.meta.confirmedAt) || a.meta.confirmedAt > bundle.dataCutoff)) return false;
    if (a.type === "SERIES" && (!a.meta || !Object.prototype.hasOwnProperty.call(bundle.chartSeries || {}, a.meta.seriesRef))) return false;
    return true;
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
    if (bundle.annotations) {
      var visible = bundle.annotations.annotations.filter(function (a) {
        return (a.endTime && a.endTime >= fromTime) || (a.startTime && a.startTime >= fromTime) || !a.startTime;
      }), accepted = visible.filter(function (a) { return validAnnotation(a, bundle); });
      out.annotations = Object.assign({}, bundle.annotations, {
        totalAnnotations: bundle.annotations.annotations.length, materializedAnnotations: accepted.length,
        rejectedAnnotations: visible.length - accepted.length, annotations: accepted
      });
    }
    return out;
  }

  function project(input) {
    var ticker = input.ticker, securityId = input.securityId, series = input.series,
        bundle = input.bundle, provenance = input.provenance || {};
    if (!/^[A-Z0-9.-]{1,12}$/.test(ticker) || !/^ref_[A-Z0-9_]{1,32}$/.test(securityId) ||
        !series || series.instrumentId !== ticker || series.priceSeriesType !== "SPLIT_ADJUSTED" ||
        series.length < 300 || !bundle || bundle.instrumentId !== ticker ||
        bundle.methodologyVersion !== "technical-v1.0.0") throw new Error("INVALID_PRODUCT_TECHNICAL_INPUT");
    var from = Math.max(0, series.length - DISPLAY_BARS), artifact = {
      schemaVersion: VERSION, instrumentId: ticker, securityId: securityId,
      dataMode: "real", isMock: false, source: "tiingo", sourceRevision: provenance.observedAt,
      priceSeriesType: "SPLIT_ADJUSTED", benchmarkId: input.benchmarkId || null,
      bars: compactBars(series, from), bundle: compactBundle(bundle, from, series.timestamps[from]),
      history: chartHistory(series, from),
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
      return shardKey(ticker) === key && x.instrumentId === ticker && /^ref_[A-Z0-9_]{1,32}$/.test(x.securityId) &&
        x.dataMode === "real" && x.isMock === false && x.source === "tiingo" &&
        x.priceSeriesType === "SPLIT_ADJUSTED" && b && b.instrumentId === ticker &&
        b.methodologyVersion === "technical-v1.0.0" && Array.isArray(bars && bars.timestamps) && bars.timestamps.length >= 2;
    });
  }

  var api = { VERSION: VERSION, DISPLAY_BARS: DISPLAY_BARS, HISTORY_DAILY_BARS: HISTORY_DAILY_BARS, HISTORY_SCHEMA: HISTORY_SCHEMA,
    weeklyBars: weeklyBars, chartHistory: chartHistory, isoWeek: isoWeek, shardKey: shardKey,
    compactBars: compactBars, compactBundle: compactBundle, project: project, validateShard: validateShard };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ProductMaterialization = api; }
})(typeof window !== "undefined" ? window : globalThis);
