/* =========================================================================
   VISION UNIVERSE TECHNICAL — support-resistance.js
   SUPPORT / RESISTANCE ENGINE

   Keine manuellen Linien, keine einzelne scheinpraezise Linie. Zonen
   entstehen aus gewichtetem 1-D-Clustering bestaetigter Pivots aller
   Skalen im Log-Preisraum:

     weight = scaleWeight × amplitudeATR × recencyDecay
     bandwidth = k × ATR/Preis           (nie feste Dollarbetraege)
     Zonenkern = gewichteter Median, Breite = Streuung + Mindest-ATR-Band

   Touches mit Cooldown (mehrere Beruehrungen in wenigen Bars zaehlen nicht
   als unabhaengige Tests). Dazu Gap-Zonen (deterministisch) und
   Periodenlevel (Vorwoche/Vormonat Hoch/Tief).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var C = isNode ? require("./engine-common.js") : global.VUTechnical.Common;
  var Timeframe = isNode ? require("./timeframe.js") : global.VUTechnical.Timeframe;

  var ENGINE_VERSION = "sr-1.0.0";
  var DEFAULTS = { scaleWeights: { "scale-1": 0.5, "scale-2": 1.0, "scale-3": 2.0, "scale-4": 3.5 }, recencyHalfLifeBars: 504,
                   bandwidthAtr: 0.75, minZoneHalfWidthAtr: 0.25, touchCooldownBars: 5, maxZones: 12, brokenBufferAtr: 0.5, gapMinAtr: 0.5, staleAfterBars: 756 };

  function weightedMedian(items) {
    var sorted = items.slice().sort(function (a, b) { return a.price - b.price; });
    var total = sorted.reduce(function (s, x) { return s + x.weight; }, 0), acc = 0;
    for (var i = 0; i < sorted.length; i++) { acc += sorted[i].weight; if (acc >= total / 2) return sorted[i].price; }
    return sorted[sorted.length - 1].price;
  }

  function analyzeSupportResistance(series, features, pivots, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    var n = series.length, i = n - 1, f = features.columns, close = series.close[i];
    var atr = C.isNum(f.atr[i]) ? f.atr[i] : close * 0.02;
    var ev = [];

    /* 1 Punkte aus bestaetigten Pivots aller Skalen. */
    var points = [];
    pivots.scaleIds.forEach(function (sid) {
      var w0 = cfg.scaleWeights[sid] || 1;
      pivots.scales[sid].pivots.forEach(function (p) {
        var amp = C.isNum(p.amplitudeATR) ? C.clamp(p.amplitudeATR, 0.5, 5) : 1;
        var decay = Math.pow(0.5, (i - p.pivotIndex) / cfg.recencyHalfLifeBars);
        points.push({ price: p.pivotPrice, logPrice: Math.log(p.pivotPrice), weight: w0 * amp * decay, index: p.pivotIndex, time: p.pivotTime, pivotId: p.pivotId, scaleId: sid, side: p.side });
      });
    });

    /* 2 Greedy-Clustering im Log-Raum mit ATR-relativer Bandbreite. */
    points.sort(function (a, b) { return a.logPrice - b.logPrice; });
    var bw = cfg.bandwidthAtr * atr / close;
    var clusters = [], cur = null;
    points.forEach(function (pt) {
      if (cur && pt.logPrice - cur.center <= bw) {
        cur.items.push(pt); cur.weight += pt.weight;
        cur.center = cur.items.reduce(function (s, x) { return s + x.logPrice * x.weight; }, 0) / cur.weight;
      } else { cur = { items: [pt], weight: pt.weight, center: pt.logPrice }; clusters.push(cur); }
    });

    /* 3 Zonen mit Touches. */
    var maxW = clusters.reduce(function (m, c) { return Math.max(m, c.weight); }, 0) || 1;
    var zones = clusters.map(function (cl, zi) {
      var centerPrice = weightedMedian(cl.items);
      var lo = Math.min.apply(null, cl.items.map(function (x) { return x.price; }));
      var hi = Math.max.apply(null, cl.items.map(function (x) { return x.price; }));
      var minHalf = cfg.minZoneHalfWidthAtr * atr;
      if (hi - centerPrice < minHalf) hi = centerPrice + minHalf;
      if (centerPrice - lo < minHalf) lo = centerPrice - minHalf;
      var first = Math.min.apply(null, cl.items.map(function (x) { return x.index; }));
      var touches = 0, lastTouch = -1, fromAbove = 0, fromBelow = 0;
      for (var t = first; t <= i; t++) {
        if (series.low[t] <= hi && series.high[t] >= lo) {
          if (t - lastTouch > cfg.touchCooldownBars) { touches++; if (t > 0) { if (series.close[t - 1] > hi) fromAbove++; else if (series.close[t - 1] < lo) fromBelow++; } }
          lastTouch = t;
        }
      }
      var role = close > hi ? "SUPPORT" : close < lo ? "RESISTANCE" : "INSIDE";
      var strength = C.round(100 * (0.7 * cl.weight / maxW + 0.3 * Math.min(1, touches / 6)), 1);
      return {
        zoneId: "zone_" + Hash.hashValue({ c: C.round(centerPrice, 4), lo: C.round(lo, 4), hi: C.round(hi, 4) }).slice(0, 10),
        origin: "PIVOT_CLUSTER", zoneLow: C.round(lo, 4), zoneHigh: C.round(hi, 4), centerPrice: C.round(centerPrice, 4),
        strength: strength, weight: C.round(cl.weight, 4), touchCount: touches,
        firstSeen: series.timestamps[first], lastSeen: lastTouch >= 0 ? series.timestamps[lastTouch] : null, lastTouchIndex: lastTouch,
        recency: lastTouch >= 0 ? C.round(Math.pow(0.5, (i - lastTouch) / cfg.recencyHalfLifeBars), 3) : 0,
        timeframeCoverage: cl.items.map(function (x) { return x.scaleId; }).filter(function (v, k, a) { return a.indexOf(v) === k; }),
        pivotIds: cl.items.map(function (x) { return x.pivotId; }),
        currentRole: role, flipped: fromAbove > 0 && fromBelow > 0,
        status: lastTouch >= 0 && i - lastTouch > cfg.staleAfterBars ? "STALE" : "ACTIVE",
        distanceAtr: C.round(role === "SUPPORT" ? (close - hi) / atr : role === "RESISTANCE" ? (lo - close) / atr : 0, 2)
      };
    });

    /* 4 Gap-Zonen (deterministisch aus Bars). */
    var gaps = [];
    for (var g = Math.max(1, n - 504); g < n; g++) {
      var a = C.isNum(f.atr[g]) ? f.atr[g] : atr;
      if (series.low[g] > series.high[g - 1] + cfg.gapMinAtr * a) {
        var filled = false; for (var q = g + 1; q < n; q++) if (series.low[q] <= series.high[g - 1]) { filled = true; break; }
        if (!filled) gaps.push({ zoneId: "gap_" + series.timestamps[g], origin: "GAP_UP", zoneLow: series.high[g - 1], zoneHigh: series.low[g], centerPrice: C.round((series.high[g - 1] + series.low[g]) / 2, 4),
          strength: 40, touchCount: 0, firstSeen: series.timestamps[g], lastSeen: null, recency: C.round(Math.pow(0.5, (i - g) / cfg.recencyHalfLifeBars), 3), timeframeCoverage: ["1D"], pivotIds: [],
          currentRole: close > series.low[g] ? "SUPPORT" : close < series.high[g - 1] ? "RESISTANCE" : "INSIDE", flipped: false, status: "ACTIVE",
          distanceAtr: C.round((close - series.low[g]) / atr, 2) });
      } else if (series.high[g] < series.low[g - 1] - cfg.gapMinAtr * a) {
        var filled2 = false; for (var q2 = g + 1; q2 < n; q2++) if (series.high[q2] >= series.low[g - 1]) { filled2 = true; break; }
        if (!filled2) gaps.push({ zoneId: "gap_" + series.timestamps[g], origin: "GAP_DOWN", zoneLow: series.high[g], zoneHigh: series.low[g - 1], centerPrice: C.round((series.high[g] + series.low[g - 1]) / 2, 4),
          strength: 40, touchCount: 0, firstSeen: series.timestamps[g], lastSeen: null, recency: C.round(Math.pow(0.5, (i - g) / cfg.recencyHalfLifeBars), 3), timeframeCoverage: ["1D"], pivotIds: [],
          currentRole: close > series.low[g - 1] ? "SUPPORT" : close < series.high[g] ? "RESISTANCE" : "INSIDE", flipped: false, status: "ACTIVE",
          distanceAtr: C.round((series.high[g] - close) / atr, 2) });
      }
    }

    /* 5 Periodenlevel: letzte abgeschlossene Woche / Monat. */
    var levels = [];
    function periodLevels(tf, prefix) {
      var agg = Timeframe.aggregate(series, tf);
      if (agg.length < 2) return;
      var k = agg.length - 2;  // letzte abgeschlossene Periode
      levels.push({ levelId: prefix + "_HIGH", origin: prefix + "_HIGH", price: agg.high[k], period: agg.timestamps[k], role: close > agg.high[k] ? "SUPPORT" : "RESISTANCE" });
      levels.push({ levelId: prefix + "_LOW", origin: prefix + "_LOW", price: agg.low[k], period: agg.timestamps[k], role: close > agg.low[k] ? "SUPPORT" : "RESISTANCE" });
    }
    if (series.timeframe === "1D") { periodLevels("1W", "PREV_WEEK"); periodLevels("1M", "PREV_MONTH"); }

    /* 6 Auswahl: relevanteste Zonen (Staerke × Naehe). */
    var all = zones.concat(gaps).filter(function (z) { return z.status !== "STALE" || z.strength > 60; });
    all.sort(function (a, b) { return (b.strength * (1 / (1 + Math.abs(b.distanceAtr) / 6))) - (a.strength * (1 / (1 + Math.abs(a.distanceAtr) / 6))); });
    var selected = all.slice(0, cfg.maxZones).sort(function (a, b) { return a.centerPrice - b.centerPrice; });

    var supports = selected.filter(function (z) { return z.currentRole === "SUPPORT"; }).sort(function (a, b) { return b.zoneHigh - a.zoneHigh; });
    var resistances = selected.filter(function (z) { return z.currentRole === "RESISTANCE"; }).sort(function (a, b) { return a.zoneLow - b.zoneLow; });
    var inside = selected.filter(function (z) { return z.currentRole === "INSIDE"; });
    var nearestSupport = supports[0] || null, nearestResistance = resistances[0] || null;

    if (nearestSupport) ev.push(C.evidence(ENGINE_VERSION, "PRICE_ZONES", "nearestSupport", "Naechste Unterstuetzungszone " + C.round(nearestSupport.zoneLow, 2) + "–" + C.round(nearestSupport.zoneHigh, 2) + " (Staerke " + nearestSupport.strength + ", " + nearestSupport.distanceAtr + " ATR entfernt)", nearestSupport.strength, nearestSupport.distanceAtr < 1.5 ? 1 : 0, 1));
    if (nearestResistance) ev.push(C.evidence(ENGINE_VERSION, "PRICE_ZONES", "nearestResistance", "Naechste Widerstandszone " + C.round(nearestResistance.zoneLow, 2) + "–" + C.round(nearestResistance.zoneHigh, 2) + " (Staerke " + nearestResistance.strength + ", " + nearestResistance.distanceAtr + " ATR entfernt)", nearestResistance.strength, nearestResistance.distanceAtr < 1.5 ? -1 : 0, 1));
    if (inside.length) ev.push(C.evidence(ENGINE_VERSION, "PRICE_ZONES", "inside", "Kurs innerhalb einer Zone (" + C.round(inside[0].zoneLow, 2) + "–" + C.round(inside[0].zoneHigh, 2) + ")", inside[0].strength, 0, 0.5));

    var value = 0;
    if (nearestSupport && nearestSupport.distanceAtr < 1.5) value += 0.4 * nearestSupport.strength / 100;
    if (nearestResistance && nearestResistance.distanceAtr < 1.5) value -= 0.4 * nearestResistance.strength / 100;
    /* Freier Raum nach oben ist Setup-relevant. */
    if (!nearestResistance && nearestSupport) value += 0.2;

    return {
      engineVersion: ENGINE_VERSION, repaintingPolicy: "CAN_REVISE", family: "PRICE_ZONES",
      parametersHash: Hash.hashValue({ v: ENGINE_VERSION, cfg: cfg }),
      zones: selected, allZoneCount: zones.length + gaps.length, periodLevels: levels,
      nearestSupport: nearestSupport, nearestResistance: nearestResistance,
      value: C.round(C.clamp(value, -1, 1), 4), evidence: ev, asOfIndex: i, asOf: series.timestamps[i]
    };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, weightedMedian: weightedMedian, analyzeSupportResistance: analyzeSupportResistance };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.SupportResistance = api; }
})(typeof window !== "undefined" ? window : globalThis);
