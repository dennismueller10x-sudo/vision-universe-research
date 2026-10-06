/* =========================================================================
   VISION UNIVERSE TECHNICAL — elliott/wave-graph.js
   ELLIOTT V0 — WAVE SEGMENT GRAPH, STATUS MODEL, DEGREE MAPPING

   Elliott arbeitet auf Segmenten zwischen bestaetigten Pivots einer
   Skala, nicht auf Pixeln. Jedes Segment traegt Preis-, Zeit-, ATR-,
   Volumen- und Momentum-Zusammenfassungen. Degrees sind strukturelle
   Stufen der Pivot-Hierarchie (elliott-v1.json → degreeMapping), keine
   Kalenderzeitraeume.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../../hash.js") : global.VUHash;

  var VERSION = "wave-graph-1.0.0";
  var WAVE_STATUSES = ["CONFIRMED", "DEVELOPING", "PROJECTED", "INVALIDATED"];
  var DEFAULT_DEGREE_MAPPING = { "scale-1": "D0", "scale-2": "D1", "scale-3": "D2", "scale-4": "D3" };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : NaN; }

  function segment(series, features, from, to, status) {
    var f = features.columns;
    var vols = [], rets = [], atrs = [];
    for (var i = from.pivotIndex + 1; i <= to.pivotIndex; i++) {
      if (isNum(series.volume[i])) vols.push(series.volume[i]);
      if (isNum(f.logReturns[i])) rets.push(f.logReturns[i]);
      if (isNum(f.atr[i])) atrs.push(f.atr[i]);
    }
    var change = to.pivotPrice - from.pivotPrice, dur = to.pivotIndex - from.pivotIndex;
    var atrRef = atrs.length ? mean(atrs) : NaN;
    return {
      segmentId: "seg_" + from.pivotId + "→" + (to.pivotId || "dev"),
      fromPivotId: from.pivotId, toPivotId: to.pivotId || null,
      fromIndex: from.pivotIndex, toIndex: to.pivotIndex, fromTime: from.pivotTime, toTime: to.pivotTime,
      fromPrice: from.pivotPrice, toPrice: to.pivotPrice,
      direction: change >= 0 ? "UP" : "DOWN", priceChange: change, percentChange: change / from.pivotPrice, absChange: Math.abs(change),
      duration: dur, ATRMultiple: isNum(atrRef) && atrRef > 0 ? Math.abs(change) / atrRef : null,
      volumeProfileSummary: vols.length ? { mean: mean(vols), max: Math.max.apply(null, vols), bars: vols.length } : null,
      momentumSummary: rets.length ? { meanLogReturn: mean(rets), sumLogReturn: rets.reduce(function (s, x) { return s + x; }, 0), perBar: dur > 0 ? Math.abs(change) / dur : 0 } : null,
      status: status || "CONFIRMED", confirmedAt: to.confirmedAt || null
    };
  }

  /**
   * Segment-Graph einer Skala: alle Legs zwischen aufeinanderfolgenden
   * bestaetigten Pivots + das developing Leg.
   */
  function buildSegmentGraph(series, features, pivots, scaleId, mapping) {
    mapping = mapping || DEFAULT_DEGREE_MAPPING;
    var sc = pivots.scales[scaleId];
    if (!sc) throw new Error("Unbekannte Skala " + scaleId);
    var nodes = sc.pivots.map(function (p) { return { pivotId: p.pivotId, pivotIndex: p.pivotIndex, pivotTime: p.pivotTime, pivotPrice: p.pivotPrice, side: p.side, confirmedAt: p.confirmedAt, confirmedIndex: p.confirmedIndex, status: "CONFIRMED", significance: null }; });
    /* Signifikanz: auf wie vielen Skalen existiert das Extrem. */
    var sig = Object.create(null);
    pivots.hierarchy.forEach(function (h) { sig[h.side + "@" + h.pivotIndex] = h.significance; });
    nodes.forEach(function (n) { n.significance = sig[n.side + "@" + n.pivotIndex] || 1; });
    var segments = [];
    for (var k = 1; k < nodes.length; k++) segments.push(segment(series, features, nodes[k - 1], nodes[k], "CONFIRMED"));
    var developing = null;
    if (sc.developing && nodes.length) {
      var d = { pivotId: sc.developing.pivotId, pivotIndex: sc.developing.pivotIndex, pivotTime: sc.developing.pivotTime, pivotPrice: sc.developing.pivotPrice, side: sc.developing.side, status: "DEVELOPING" };
      developing = segment(series, features, nodes[nodes.length - 1], d, "DEVELOPING");
      developing.toNode = d;
    }
    return { version: VERSION, scaleId: scaleId, degreeIndex: mapping[scaleId] || null, nodes: nodes, segments: segments, developing: developing,
             graphHash: Hash.hashValue(segments.map(function (s) { return [s.fromPivotId, s.toPivotId]; })) };
  }

  var api = { VERSION: VERSION, WAVE_STATUSES: WAVE_STATUSES, DEFAULT_DEGREE_MAPPING: DEFAULT_DEGREE_MAPPING, segment: segment, buildSegmentGraph: buildSegmentGraph };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.WaveGraph = api; }
})(typeof window !== "undefined" ? window : globalThis);
