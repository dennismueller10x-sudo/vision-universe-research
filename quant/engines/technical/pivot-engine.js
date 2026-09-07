/* =========================================================================
   VISION UNIVERSE TECHNICAL — pivot-engine.js
   CAUSAL, VOLATILITY-ADAPTIVE, MULTI-SCALE PIVOT ENGINE

   Die zentrale Foundation. Eine ZigZag-State-Machine je Skala:

     D_t = max(P_t * minPct, kAtr * ATR_t)

   Nach einer Aufwaertsbewegung bleibt das hoechste High ein DEVELOPING
   Swing High. Erst wenn der Kurs um mindestens D_t zurueckgelaufen ist,
   wird der Pivot CONFIRMED — am urspruenglichen Zeitstempel verankert
   (pivotTime), bestaetigt an der Reversal-Bar (confirmedAt).

   KEIN LOOK-AHEAD: die Maschine liest Bar fuer Bar, nie voraus. Ein Pivot,
   der an Bar t bestaetigt wurde, ist an Bar t bekannt und aendert sich
   danach nie mehr (NON-REPAINTING fuer CONFIRMED; das Developing-Extrem
   darf sich bewegen). Der Praefix-Test in technical-pivots.test.mjs haelt
   das fest.

   Skalen heissen scale-1 … scale-4, nicht Minor/Major und nicht Elliott-
   Degrees. Elliott mappt spaeter Degrees auf Skalen (elliott-v1.json).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;

  var ENGINE_VERSION = "pivot-1.0.0";
  var REPAINTING_POLICY = "CONFIRMS_WITH_DELAY";

  var DEFAULT_SCALES = [
    { scaleId: "scale-1", kAtr: 1.5, minPct: 0.02 },
    { scaleId: "scale-2", kAtr: 3.0, minPct: 0.04 },
    { scaleId: "scale-3", kAtr: 5.0, minPct: 0.08 },
    { scaleId: "scale-4", kAtr: 8.0, minPct: 0.15 }
  ];

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /** Schwelle an Bar t in Preiseinheiten. Vor ATR-Verfuegbarkeit nur Prozent. */
  function threshold(close, atr, scale) {
    var d = close * scale.minPct;
    if (isNum(atr) && atr > 0) d = Math.max(d, scale.kAtr * atr);
    return d;
  }

  /**
   * Eine Skala, eine State Machine, ein Durchlauf.
   * @returns {{pivots:Array, developing:object|null, state:object}}
   */
  function runScale(series, atrCol, scale, dataHash) {
    var n = series.length, high = series.high, low = series.low, close = series.close, ts = series.timestamps;
    var pivots = [];
    var dir = 0;                       // 0 unbekannt, 1 UP (suche Hoch), -1 DOWN (suche Tief)
    var extIdx = -1, extPrice = NaN;   // laufendes Extrem
    var candHighIdx = 0, candLowIdx = 0;
    var lastPivotIdx = -1, lastPivotPrice = NaN;

    function confirm(side, idx, price, t) {
      var atrAtPivot = atrCol[idx];
      var amp = isNum(lastPivotPrice) ? price - lastPivotPrice : NaN;
      var atrRef = isNum(atrAtPivot) && atrAtPivot > 0 ? atrAtPivot : (isNum(atrCol[t]) ? atrCol[t] : NaN);
      var p = {
        pivotId: "pv_" + scale.scaleId + "_" + side + "_" + ts[idx],
        side: side, scaleId: scale.scaleId,
        pivotIndex: idx, pivotTime: ts[idx], pivotPrice: price,
        confirmedIndex: t, confirmedAt: ts[t],
        status: "CONFIRMED",
        amplitude: isNum(amp) ? amp : null,
        amplitudePct: isNum(amp) && isNum(lastPivotPrice) ? amp / lastPivotPrice : null,
        amplitudeATR: isNum(amp) && isNum(atrRef) ? Math.abs(amp) / atrRef : null,
        durationBars: lastPivotIdx >= 0 ? idx - lastPivotIdx : null,
        confirmationLagBars: t - idx,
        prominenceScore: null,
        sourceBarsHash: Hash.hashValue({ d: dataHash, from: lastPivotIdx, to: t })
      };
      p.prominenceScore = p.amplitudeATR !== null ? round4(p.amplitudeATR / scale.kAtr) : null;
      pivots.push(p);
      lastPivotIdx = idx; lastPivotPrice = price;
    }

    for (var t = 0; t < n; t++) {
      var D = threshold(close[t], atrCol[t], scale);
      if (dir === 0) {
        if (high[t] > high[candHighIdx]) candHighIdx = t;
        if (low[t] < low[candLowIdx]) candLowIdx = t;
        var upMove = high[t] - low[candLowIdx];
        var downMove = high[candHighIdx] - low[t];
        /* Der erste bestaetigte Pivot ist das Extrem, von dem aus die
           Gegenbewegung die Schwelle zuerst ueberschreitet. */
        if (upMove >= D && candLowIdx < t && upMove >= downMove) {
          confirm("LOW", candLowIdx, low[candLowIdx], t);
          dir = 1; extIdx = t; extPrice = high[t];
          for (var k = candLowIdx; k <= t; k++) if (high[k] > extPrice) { extPrice = high[k]; extIdx = k; }
        } else if (downMove >= D && candHighIdx < t) {
          confirm("HIGH", candHighIdx, high[candHighIdx], t);
          dir = -1; extIdx = t; extPrice = low[t];
          for (var k2 = candHighIdx; k2 <= t; k2++) if (low[k2] < extPrice) { extPrice = low[k2]; extIdx = k2; }
        }
        continue;
      }
      if (dir === 1) {
        if (high[t] > extPrice) { extPrice = high[t]; extIdx = t; }
        else if (extPrice - low[t] >= D && extIdx < t) {
          confirm("HIGH", extIdx, extPrice, t);
          dir = -1; extIdx = t; extPrice = low[t];
        }
      } else {
        if (low[t] < extPrice) { extPrice = low[t]; extIdx = t; }
        else if (high[t] - extPrice >= D && extIdx < t) {
          confirm("LOW", extIdx, extPrice, t);
          dir = 1; extIdx = t; extPrice = high[t];
        }
      }
    }

    var developing = null;
    if (dir !== 0 && n > 0) {
      developing = {
        pivotId: "pv_" + scale.scaleId + "_" + (dir === 1 ? "HIGH" : "LOW") + "_" + ts[extIdx] + "_dev",
        side: dir === 1 ? "HIGH" : "LOW", scaleId: scale.scaleId,
        pivotIndex: extIdx, pivotTime: ts[extIdx], pivotPrice: extPrice,
        confirmedIndex: null, confirmedAt: null, status: "DEVELOPING",
        amplitude: isNum(lastPivotPrice) ? extPrice - lastPivotPrice : null,
        amplitudeATR: isNum(lastPivotPrice) && isNum(atrCol[n - 1]) && atrCol[n - 1] > 0 ? Math.abs(extPrice - lastPivotPrice) / atrCol[n - 1] : null,
        durationBars: lastPivotIdx >= 0 ? extIdx - lastPivotIdx : null,
        reversalNeeded: threshold(close[n - 1], atrCol[n - 1], scale)
      };
    }
    return { pivots: pivots, developing: developing,
             state: { direction: dir === 1 ? "UP" : dir === -1 ? "DOWN" : "UNDETERMINED", extremeIndex: extIdx } };
  }

  function round4(v) { return Math.round(v * 1e4) / 1e4; }

  /**
   * Alle Skalen.
   * @param {object} series   CanonicalBarSeries (SPLIT_ADJUSTED)
   * @param {object} features Feature-Store-Ergebnis (fuer ATR)
   * @param {object} [cfg]    { scales }
   */
  function runPivots(series, features, cfg) {
    cfg = cfg || {};
    var scales = cfg.scales || DEFAULT_SCALES;
    var atrCol = features.columns.atr;
    var byScale = {};
    scales.forEach(function (sc) { byScale[sc.scaleId] = Object.assign({ params: sc }, runScale(series, atrCol, sc, series.dataHash)); });

    /* Hierarchie: dasselbe Extrem auf mehreren Skalen = hoehere Signifikanz.
       Index-genaue Uebereinstimmung (Extreme fallen exakt zusammen). */
    var merged = Object.create(null);
    scales.forEach(function (sc, si) {
      byScale[sc.scaleId].pivots.forEach(function (p) {
        var key = p.side + "@" + p.pivotIndex;
        var m = merged[key];
        if (!m) merged[key] = m = { side: p.side, pivotIndex: p.pivotIndex, pivotTime: p.pivotTime, pivotPrice: p.pivotPrice,
                                    scales: [], maxScaleRank: -1, earliestConfirmedIndex: p.confirmedIndex, pivotIds: [] };
        m.scales.push(sc.scaleId); m.pivotIds.push(p.pivotId);
        if (si > m.maxScaleRank) m.maxScaleRank = si;
        if (p.confirmedIndex < m.earliestConfirmedIndex) m.earliestConfirmedIndex = p.confirmedIndex;
      });
    });
    var hierarchy = Object.keys(merged).map(function (k) { return merged[k]; })
      .sort(function (a, b) { return a.pivotIndex - b.pivotIndex; });
    hierarchy.forEach(function (h) { h.significance = h.scales.length; h.maxScaleId = scales[h.maxScaleRank].scaleId; });

    return {
      engineVersion: ENGINE_VERSION,
      repaintingPolicy: REPAINTING_POLICY,
      parametersHash: Hash.hashValue({ v: ENGINE_VERSION, scales: scales }),
      dataHash: series.dataHash,
      asOfIndex: series.length - 1,
      asOf: series.length ? series.timestamps[series.length - 1] : null,
      scaleIds: scales.map(function (s) { return s.scaleId; }),
      scales: byScale,
      hierarchy: hierarchy
    };
  }

  /** Bestaetigte Pivots einer Skala, die an Bar cutoffIndex bereits bekannt waren. */
  function confirmedAsOf(result, scaleId, cutoffIndex) {
    return result.scales[scaleId].pivots.filter(function (p) { return p.confirmedIndex <= cutoffIndex; });
  }

  /** Alternierende Sequenz pruefen (Datenqualitaet der Engine selbst). */
  function isAlternating(pivots) {
    for (var i = 1; i < pivots.length; i++) if (pivots[i].side === pivots[i - 1].side) return false;
    return true;
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION, REPAINTING_POLICY: REPAINTING_POLICY, DEFAULT_SCALES: DEFAULT_SCALES,
    threshold: threshold, runScale: runScale, runPivots: runPivots, confirmedAsOf: confirmedAsOf, isAlternating: isAlternating
  };

  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Pivots = api; }
})(typeof window !== "undefined" ? window : globalThis);
