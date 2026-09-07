/* =========================================================================
   VISION UNIVERSE TECHNICAL — annotations.js
   RENDERER-NEUTRAL CHART ANNOTATIONS

   Analysis Engines zeichnen nichts. Sie erzeugen ChartAnnotation-Objekte
   (Zeit × Preis + Semantik); der Renderer interpretiert das Schema. Ein
   Wechsel der Chart-Library darf Scenario- oder Elliott-Engine nicht
   beruehren.

   Status je Objekt: CONFIRMED | DEVELOPING | PROJECTED | INVALIDATED |
   EXPIRED. Alles rechts des NOW_DIVIDER ist PROJECTED — nie mit der
   Semantik echter Historie. Labels haengen an realen Pivot-Zeitpunkten,
   nie an freien x/y-Koordinaten.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var Timeframe = isNode ? require("./timeframe.js") : global.VUTechnical.Timeframe;

  var SCHEMA_VERSION = "annotation-1.0.0";
  var LAYERS = ["AUTO", "STRUCTURE", "TREND", "MOMENTUM", "SUPPORT_RESISTANCE", "FIBONACCI", "ELLIOTT"];
  var STATUSES = ["CONFIRMED", "DEVELOPING", "PROJECTED", "INVALIDATED", "EXPIRED"];
  var FIELDS = ["annotationId", "type", "layers", "startTime", "endTime", "startPrice", "endPrice", "label", "status", "method", "degree", "scenarioId", "evidenceRef", "confidence", "semanticStyle", "zOrder"];

  function make(a) {
    var o = {
      annotationId: null, type: a.type, layers: a.layers || ["AUTO"],
      startTime: a.startTime || null, endTime: a.endTime === undefined ? null : a.endTime,
      startPrice: a.startPrice === undefined ? null : a.startPrice, endPrice: a.endPrice === undefined ? null : a.endPrice,
      label: a.label || null, status: a.status || "CONFIRMED", method: a.method || null, degree: a.degree || null,
      scenarioId: a.scenarioId || null, evidenceRef: a.evidenceRef || null, confidence: a.confidence === undefined ? null : a.confidence,
      semanticStyle: a.semanticStyle || "neutral", zOrder: a.zOrder === undefined ? 0 : a.zOrder,
      meta: a.meta || null
    };
    o.annotationId = "an_" + Hash.hashValue({ t: o.type, s: o.startTime, e: o.endTime, p: o.startPrice, q: o.endPrice, l: o.label, st: o.status, sc: o.scenarioId, m: o.method });
    return o;
  }

  /**
   * @param {object} b  Analyse-Bundle (technical-analysis.js)
   * @param {object} o  { calendarDays }
   */
  function buildAnnotations(b, o) {
    o = o || {};
    var cal = Timeframe.createCalendar(o.calendarDays || []);
    var now = b.analysisTime;
    var horizon = (b.scenarios.primary && b.scenarios.primary.projectionHorizonBars) || 60;
    var future = cal.offset(now, horizon);
    var out = [];

    out.push(make({ type: "NOW_DIVIDER", layers: LAYERS, startTime: now, endTime: now, label: "Now", status: "CONFIRMED", semanticStyle: "divider", zOrder: 100, method: "analysisCutoff" }));

    /* --- Struktur: Swing-Linie, Pivots, Labels, Brueche --- */
    var setup = b.structure.scaleId, ctxScale = b.pivots.scaleIds[Math.min(b.pivots.scaleIds.length - 1, b.pivots.scaleIds.indexOf(setup) + 1)];
    var pv = b.pivots.scales[setup].pivots;
    for (var k = 1; k < pv.length; k++) {
      out.push(make({ type: "SWING_SEGMENT", layers: ["AUTO", "STRUCTURE"], startTime: pv[k - 1].pivotTime, endTime: pv[k].pivotTime, startPrice: pv[k - 1].pivotPrice, endPrice: pv[k].pivotPrice,
                      status: "CONFIRMED", method: "pivot:" + setup, semanticStyle: "historical", zOrder: 10, evidenceRef: pv[k].pivotId }));
    }
    var devP = b.pivots.scales[setup].developing;
    if (pv.length && devP) {
      out.push(make({ type: "SWING_SEGMENT", layers: ["AUTO", "STRUCTURE"], startTime: pv[pv.length - 1].pivotTime, endTime: devP.pivotTime, startPrice: pv[pv.length - 1].pivotPrice, endPrice: devP.pivotPrice,
                      status: "DEVELOPING", method: "pivot:" + setup, semanticStyle: "developing", zOrder: 10, evidenceRef: devP.pivotId }));
      out.push(make({ type: "PIVOT", layers: ["STRUCTURE"], startTime: devP.pivotTime, startPrice: devP.pivotPrice, label: devP.side === "HIGH" ? "H?" : "L?", status: "DEVELOPING", method: "pivot:" + setup, semanticStyle: "developing", zOrder: 20 }));
    }
    b.structure.swings.forEach(function (s) {
      out.push(make({ type: "STRUCTURE_LABEL", layers: ["AUTO", "STRUCTURE"], startTime: s.time, startPrice: s.price, label: s.label || (s.side === "HIGH" ? "H" : "L"), status: "CONFIRMED",
                      method: "structure", semanticStyle: s.side === "HIGH" ? "label-high" : "label-low", zOrder: 20, evidenceRef: s.pivotId, meta: { confirmedAt: s.confirmedAt, side: s.side } }));
    });
    b.pivots.scales[ctxScale].pivots.forEach(function (p) {
      out.push(make({ type: "PIVOT", layers: ["STRUCTURE"], startTime: p.pivotTime, startPrice: p.pivotPrice, label: null, status: "CONFIRMED", method: "pivot:" + ctxScale, degree: ctxScale, semanticStyle: "pivot-major", zOrder: 15, evidenceRef: p.pivotId, meta: { confirmedAt: p.confirmedAt } }));
    });
    b.structure.events.filter(function (e) { return /BOS|STRUCTURE_CHANGE|STRUCTURE_FAILURE|BREAKOUT/.test(e.type) && e.level; }).slice(-8).forEach(function (e) {
      var ref = b.structure.swings.filter(function (s) { return s.pivotId === e.refPivotId; })[0];
      out.push(make({ type: "STRUCTURE_EVENT", layers: ["STRUCTURE"], startTime: ref ? ref.time : e.time, endTime: e.time, startPrice: e.level, endPrice: e.level, label: e.type.replace(/_/g, " "), status: "CONFIRMED",
                      method: "structure", semanticStyle: /BULLISH|UP|FAILURE_BEARISH/.test(e.type) ? "event-bullish" : "event-bearish", zOrder: 12, evidenceRef: e.eventId }));
    });

    /* --- Trend: Serienreferenzen + Zustand --- */
    [["sma50", "SMA 50"], ["sma200", "SMA 200"], ["sma20", "SMA 20"]].forEach(function (pair, idx) {
      out.push(make({ type: "SERIES", layers: idx < 2 ? ["AUTO", "TREND", "MOMENTUM"] : ["TREND"], label: pair[1], status: "CONFIRMED", method: "features:" + pair[0], semanticStyle: "ma-" + pair[0], zOrder: 5, meta: { seriesRef: pair[0] } }));
    });
    out.push(make({ type: "STATE_LABEL", layers: ["TREND"], startTime: now, startPrice: b.lastBar.close, label: "Trend " + b.trend.direction + (b.trend.trendScore !== null ? " " + b.trend.trendScore + "/100" : ""), status: "CONFIRMED", method: "trend", semanticStyle: "state", zOrder: 30 }));
    out.push(make({ type: "STATE_LABEL", layers: ["MOMENTUM"], startTime: now, startPrice: b.lastBar.close, label: "Momentum " + b.momentum.state, status: "CONFIRMED", method: "momentum", semanticStyle: "state", zOrder: 30 }));

    /* --- Support / Resistance --- */
    b.supportResistance.zones.forEach(function (z) {
      var auto = (b.supportResistance.nearestSupport && z.zoneId === b.supportResistance.nearestSupport.zoneId) || (b.supportResistance.nearestResistance && z.zoneId === b.supportResistance.nearestResistance.zoneId);
      out.push(make({ type: "ZONE", layers: auto ? ["AUTO", "SUPPORT_RESISTANCE"] : ["SUPPORT_RESISTANCE"], startTime: z.firstSeen, endTime: future, startPrice: z.zoneLow, endPrice: z.zoneHigh,
                      label: (z.currentRole === "SUPPORT" ? "S " : z.currentRole === "RESISTANCE" ? "R " : "") + z.strength, status: z.status === "STALE" ? "EXPIRED" : "CONFIRMED", method: "sr:" + z.origin,
                      semanticStyle: z.currentRole === "SUPPORT" ? "support" : z.currentRole === "RESISTANCE" ? "resistance" : "zone-inside", zOrder: 2, confidence: z.strength, evidenceRef: z.zoneId, meta: { touchCount: z.touchCount, flipped: z.flipped } }));
    });
    b.supportResistance.periodLevels.forEach(function (l) {
      out.push(make({ type: "LEVEL", layers: ["SUPPORT_RESISTANCE"], startTime: l.period, endTime: future, startPrice: l.price, endPrice: l.price, label: l.origin.replace(/_/g, " ").toLowerCase(), status: "CONFIRMED", method: "periodLevel", semanticStyle: "period-level", zOrder: 3 }));
    });

    /* --- Fibonacci --- */
    if (b.fibonacci) {
      b.fibonacci.anchors.slice(0, 2).forEach(function (a) {
        b.fibonacci.levels.filter(function (l) { return l.anchorId === a.anchorId; }).forEach(function (l) {
          out.push(make({ type: "FIB_LEVEL", layers: ["FIBONACCI"], startTime: a.to.time, endTime: future, startPrice: l.price, endPrice: l.price, label: l.label + (l.kind === "EXTENSION" ? " ext" : ""),
                          status: l.status, method: "fib:" + l.kind, degree: l.scaleId, semanticStyle: l.kind === "EXTENSION" ? "fib-extension" : "fib-retracement", zOrder: 4, evidenceRef: l.levelId }));
        });
        out.push(make({ type: "FIB_ANCHOR", layers: ["FIBONACCI"], startTime: a.from.time, endTime: a.to.time, startPrice: a.from.price, endPrice: a.to.price, label: "Anker " + a.scaleId, status: "CONFIRMED", method: "fib:anchor", semanticStyle: "anchor", zOrder: 6 }));
      });
      b.fibonacci.clusters.forEach(function (c) {
        out.push(make({ type: "FIB_CLUSTER", layers: ["FIBONACCI"], startTime: now, endTime: future, startPrice: c.zoneLow, endPrice: c.zoneHigh, label: "Fib-Cluster", status: c.status, method: "fib:cluster", semanticStyle: "fib-cluster", zOrder: 4, evidenceRef: c.clusterId }));
      });
    }

    /* --- Szenario: Entry, Invalidation, Targets, Projektionspfad --- */
    var p = b.scenarios.primary;
    if (p && p.direction !== "UNDETERMINED") {
      var scLayers = ["AUTO"];
      if (p.entryZone) out.push(make({ type: "ENTRY_ZONE", layers: scLayers, startTime: now, endTime: future, startPrice: p.entryZone.zoneLow, endPrice: p.entryZone.zoneHigh, label: "Entry Zone", status: "PROJECTED", method: "scenario:" + p.template, scenarioId: p.scenarioId, semanticStyle: "entry", zOrder: 40, confidence: p.confidence }));
      if (p.invalidation) out.push(make({ type: "INVALIDATION_LEVEL", layers: scLayers.concat(["STRUCTURE"]), startTime: now, endTime: future, startPrice: p.invalidation.price, endPrice: p.invalidation.price, label: "Invalidation", status: "PROJECTED", method: "scenario:invalidation", scenarioId: p.scenarioId, semanticStyle: "invalidation", zOrder: 41, evidenceRef: p.invalidation.refPivotId }));
      p.targetZones.forEach(function (tz, ti) {
        out.push(make({ type: "TARGET_ZONE", layers: scLayers, startTime: now, endTime: future, startPrice: tz.zoneLow, endPrice: tz.zoneHigh, label: tz.label || ("Target Zone " + (ti + 1)), status: "PROJECTED", method: "scenario:target", scenarioId: p.scenarioId, semanticStyle: "target", zOrder: 40, meta: { sources: tz.sources } }));
      });
      if (p.entryZone && p.targetZones.length) {
        var sign = p.direction === "BULLISH" ? 1 : -1;
        var mid = (p.entryZone.zoneLow + p.entryZone.zoneHigh) / 2;
        var path = [{ time: now, price: b.lastBar.close }, { time: cal.offset(now, Math.round(horizon * 0.25)), price: mid }, { time: cal.offset(now, Math.round(horizon * 0.65)), price: (p.targetZones[0].zoneLow + p.targetZones[0].zoneHigh) / 2 }];
        if (p.targetZones[1]) path.push({ time: future, price: (p.targetZones[1].zoneLow + p.targetZones[1].zoneHigh) / 2 });
        for (var q = 1; q < path.length; q++) {
          out.push(make({ type: "PROJECTION_PATH", layers: scLayers, startTime: path[q - 1].time, endTime: path[q].time, startPrice: path[q - 1].price, endPrice: path[q].price, status: "PROJECTED", method: "scenario:path", scenarioId: p.scenarioId, semanticStyle: sign > 0 ? "projected-bullish" : "projected-bearish", zOrder: 39 }));
        }
      }
    }
    if (b.scenarios.alternative && b.scenarios.alternative.entryZone) {
      var a = b.scenarios.alternative;
      out.push(make({ type: "ENTRY_ZONE", layers: ["ALTERNATIVE"], startTime: now, endTime: future, startPrice: a.entryZone.zoneLow, endPrice: a.entryZone.zoneHigh, label: "Alt. Entry Zone", status: "PROJECTED", method: "scenario:" + a.template, scenarioId: a.scenarioId, semanticStyle: "entry-alt", zOrder: 38 }));
    }

    /* --- Elliott --- */
    if (b.elliott && b.elliott.status !== "UNAVAILABLE" && b.elliott.primaryCount) {
      appendElliott(out, b.elliott.primaryCount, "ELLIOTT", cal, now, future, b.elliott.degreeIndex, false);
      if (b.elliott.alternativeCount) appendElliott(out, b.elliott.alternativeCount, "ELLIOTT_ALT", cal, now, future, b.elliott.degreeIndex, true);
    }
    out.sort(function (x, y) { return x.zOrder - y.zOrder; });
    return { schemaVersion: SCHEMA_VERSION, layers: LAYERS, analysisTime: now, projectionEnd: future, annotations: out };
  }

  function appendElliott(out, count, layer, cal, now, future, degree, isAlt) {
    count.waves.forEach(function (w) {
      var style = w.status === "CONFIRMED" ? "wave-historical" : w.status === "DEVELOPING" ? "wave-developing" : "wave-projected";
      if (w.fromTime && w.toTime) out.push(make({ type: "WAVE_SEGMENT", layers: [layer], startTime: w.fromTime, endTime: w.toTime, startPrice: w.fromPrice, endPrice: w.toPrice, label: w.label, status: w.status, method: "elliott:" + w.patternType, degree: degree, semanticStyle: style + (isAlt ? " alt" : ""), zOrder: 25, evidenceRef: w.toPivotId || null }));
      if (w.toTime && w.status !== "PROJECTED") out.push(make({ type: "WAVE_LABEL", layers: [layer], startTime: w.toTime, startPrice: w.toPrice, label: w.label, status: w.status, method: "elliott:" + w.patternType, degree: degree, semanticStyle: style + (isAlt ? " alt" : ""), zOrder: 26, evidenceRef: w.toPivotId || null, meta: { pivotId: w.toPivotId, confirmedAt: w.confirmedAt } }));
    });
    if (count.projection) {
      (count.projection.path || []).forEach(function (seg) {
        out.push(make({ type: "WAVE_SEGMENT", layers: [layer], startTime: seg.fromTime, endTime: seg.toTime, startPrice: seg.fromPrice, endPrice: seg.toPrice, label: seg.label, status: "PROJECTED", method: "elliott:projection", degree: degree, semanticStyle: "wave-projected" + (isAlt ? " alt" : ""), zOrder: 24 }));
        out.push(make({ type: "WAVE_LABEL", layers: [layer], startTime: seg.toTime, startPrice: seg.toPrice, label: seg.label + "?", status: "PROJECTED", method: "elliott:projection", degree: degree, semanticStyle: "wave-projected" + (isAlt ? " alt" : ""), zOrder: 26 }));
      });
      (count.projection.zones || []).forEach(function (z) {
        out.push(make({ type: "PROJECTION_ZONE", layers: [layer], startTime: now, endTime: future, startPrice: z.zoneLow, endPrice: z.zoneHigh, label: z.label, status: "PROJECTED", method: "elliott:projection", degree: degree, semanticStyle: "projection-zone" + (isAlt ? " alt" : ""), zOrder: 23, evidenceRef: z.zoneId, meta: { sources: z.sources } }));
      });
    }
    if (count.invalidation && count.invalidation.price !== null) {
      out.push(make({ type: "INVALIDATION_LEVEL", layers: [layer], startTime: now, endTime: future, startPrice: count.invalidation.price, endPrice: count.invalidation.price, label: "Count invalid " + (count.invalidation.direction === "below" ? "unter" : "ueber") + " " + count.invalidation.price, status: "PROJECTED", method: "elliott:" + count.invalidation.ruleId, degree: degree, semanticStyle: "invalidation" + (isAlt ? " alt" : ""), zOrder: 41 }));
    }
  }

  /** Annotationen eines Layers (AUTO enthaelt nur, was das Primary Scenario erklaert). */
  function forLayer(doc, layer) {
    return doc.annotations.filter(function (a) { return a.layers.indexOf(layer) !== -1; });
  }
  /** Kompakter Positions-Hash fuer Visual-Regression-Tests (Zeit/Preis/Status/Typ). */
  function positionHash(doc) {
    return Hash.hashValue(doc.annotations.map(function (a) { return [a.type, a.startTime, a.endTime, a.startPrice, a.endPrice, a.status, a.label]; }));
  }
  function validate(a) {
    var errors = [];
    FIELDS.forEach(function (f) { if (!(f in a)) errors.push("Feld fehlt: " + f); });
    if (STATUSES.indexOf(a.status) === -1) errors.push("Status unbekannt: " + a.status);
    return { valid: errors.length === 0, errors: errors };
  }

  var api = { SCHEMA_VERSION: SCHEMA_VERSION, LAYERS: LAYERS, STATUSES: STATUSES, FIELDS: FIELDS, make: make, buildAnnotations: buildAnnotations, forLayer: forLayer, positionHash: positionHash, validate: validate };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Annotations = api; }
})(typeof window !== "undefined" ? window : globalThis);
