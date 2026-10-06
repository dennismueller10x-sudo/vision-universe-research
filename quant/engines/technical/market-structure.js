/* =========================================================================
   VISION UNIVERSE TECHNICAL — market-structure.js
   MARKET STRUCTURE ENGINE

   Auf BESTAETIGTEN Pivots einer Skala: HH / HL / LH / LL mit Toleranzband
   eps = c * ATR (kein Tick-Rauschen als Strukturwechsel), Break of
   Structure close-basiert, Structure Continuation, Structure Failure
   (formal definierter "Structure Change"), Range, Compression, Expansion,
   Level Sweep (High ueber Level, Close darunter — messbare Beobachtung,
   keine Liquiditaets-Narration).

   Kausal: der Zustand an Bar t benutzt nur Pivots mit confirmedIndex <= t
   und den Close von t. Der Zustandsverlauf wird bar-weise aufgebaut; das
   Ergebnis fuer Bar t haengt nie von Bars > t ab.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;

  var ENGINE_VERSION = "structure-1.0.0";
  var REPAINTING_POLICY = "CONFIRMS_WITH_DELAY";
  var DEFAULTS = { toleranceAtr: 0.25, bosBufferAtr: 0.1, rangeMaxSpanAtr: 1.5, rangeMinPivots: 4, compressionSwings: 3, sweepBufferAtr: 0.1 };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  function regimeOf(lastHighLabel, lastLowLabel) {
    if (!lastHighLabel || !lastLowLabel) return "UNDETERMINED";
    if (lastHighLabel === "HH" && lastLowLabel === "HL") return "BULLISH";
    if (lastHighLabel === "LH" && lastLowLabel === "LL") return "BEARISH";
    if ((lastHighLabel === "EQH" || lastHighLabel === "LH") && (lastLowLabel === "EQL" || lastLowLabel === "HL")) return "RANGE";
    return "MIXED";
  }

  /**
   * @param {object} series    CanonicalBarSeries
   * @param {object} features  Feature-Store
   * @param {object} pivots    Ergebnis von pivot-engine.runPivots
   * @param {object} [opts]    { scaleId, cfg }
   */
  function analyzeStructure(series, features, pivots, opts) {
    opts = opts || {};
    var cfg = Object.assign({}, DEFAULTS, opts.cfg || {});
    var scaleId = opts.scaleId || pivots.scaleIds[1] || pivots.scaleIds[0];
    var confirmed = pivots.scales[scaleId].pivots;
    var atr = features.columns.atr;
    var n = series.length, close = series.close, high = series.high, low = series.low, ts = series.timestamps;

    var swings = [];
    var events = [];
    var timeline = [];
    var lastHigh = null, lastLow = null;          // letzte bestaetigte Swing-Pivots (mit Label)
    var lastHighLabel = null, lastLowLabel = null;
    var regime = "UNDETERMINED";            // effektiver Zustand (Pivots + Close-Brueche)
    var confirmedRegime = "UNDETERMINED";   // rein pivot-basiert
    var trendBias = null;                   // letzter Trendzustand BULLISH | BEARISH (Pivot oder Close-Bruch)
    var lastConfirmedTrend = null;          // letzter pivot-bestaetigter Trendzustand
    var brokenHighIds = Object.create(null), brokenLowIds = Object.create(null);
    var sweptHighIds = Object.create(null), sweptLowIds = Object.create(null);
    var rangeState = null, volState = null;
    var pi = 0;
    var seq = 0;

    function pushEvent(type, t, price, level, refPivotId, evidence) {
      events.push({ eventId: "se_" + (seq++), type: type, index: t, time: ts[t], price: price, level: level, refPivotId: refPivotId || null, evidence: evidence || null });
    }

    for (var t = 0; t < n; t++) {
      var a = isNum(atr[t]) ? atr[t] : close[t] * 0.02;
      var eps = cfg.toleranceAtr * a, buffer = cfg.bosBufferAtr * a;

      /* Neu bestaetigte Pivots an dieser Bar einordnen. */
      while (pi < confirmed.length && confirmed[pi].confirmedIndex <= t) {
        var p = confirmed[pi++];
        var label = null;
        if (p.side === "HIGH") {
          if (lastHigh) label = p.pivotPrice > lastHigh.price + eps ? "HH" : p.pivotPrice < lastHigh.price - eps ? "LH" : "EQH";
          lastHigh = { pivotId: p.pivotId, price: p.pivotPrice, index: p.pivotIndex, time: p.pivotTime, confirmedIndex: p.confirmedIndex, label: label };
          lastHighLabel = label;
        } else {
          if (lastLow) label = p.pivotPrice > lastLow.price + eps ? "HL" : p.pivotPrice < lastLow.price - eps ? "LL" : "EQL";
          lastLow = { pivotId: p.pivotId, price: p.pivotPrice, index: p.pivotIndex, time: p.pivotTime, confirmedIndex: p.confirmedIndex, label: label };
          lastLowLabel = label;
        }
        swings.push({ pivotId: p.pivotId, side: p.side, label: label, index: p.pivotIndex, time: p.pivotTime, price: p.pivotPrice,
                      confirmedIndex: p.confirmedIndex, confirmedAt: p.confirmedAt, amplitudeATR: p.amplitudeATR });

        var newRegime = regimeOf(lastHighLabel, lastLowLabel);
        if (newRegime !== confirmedRegime) {
          confirmedRegime = newRegime;
          if (newRegime === "BULLISH" || newRegime === "BEARISH") {
            if (lastConfirmedTrend && lastConfirmedTrend !== newRegime) {
              pushEvent(newRegime === "BULLISH" ? "STRUCTURE_CHANGE_BULLISH" : "STRUCTURE_CHANGE_BEARISH", t, close[t], p.pivotPrice, p.pivotId,
                        newRegime === "BULLISH" ? "HH+HL nach LH+LL" : "LH+LL nach HH+HL");
            } else {
              pushEvent("STRUCTURE_CONTINUATION", t, close[t], p.pivotPrice, p.pivotId, newRegime);
            }
            lastConfirmedTrend = newRegime; trendBias = newRegime;
          }
          if (newRegime !== regime) { regime = newRegime; timeline.push({ index: t, time: ts[t], regime: regime, via: "pivot" }); }
        } else if (label === "HH" || label === "HL" || label === "LH" || label === "LL") {
          if ((regime === "BULLISH" && (label === "HH" || label === "HL")) || (regime === "BEARISH" && (label === "LH" || label === "LL"))) {
            pushEvent("STRUCTURE_CONTINUATION", t, close[t], p.pivotPrice, p.pivotId, label);
          }
        }

        /* Range: die letzten k Pivots liegen in engen Baendern. */
        var recent = swings.slice(-cfg.rangeMinPivots);
        if (recent.length >= cfg.rangeMinPivots) {
          var hs = recent.filter(function (s) { return s.side === "HIGH"; }).map(function (s) { return s.price; });
          var ls = recent.filter(function (s) { return s.side === "LOW"; }).map(function (s) { return s.price; });
          if (hs.length >= 2 && ls.length >= 2) {
            var hSpan = Math.max.apply(null, hs) - Math.min.apply(null, hs), lSpan = Math.max.apply(null, ls) - Math.min.apply(null, ls);
            var top = Math.max.apply(null, hs), bottom = Math.min.apply(null, ls);
            var inRange = hSpan <= cfg.rangeMaxSpanAtr * a && lSpan <= cfg.rangeMaxSpanAtr * a &&
                          close[t] <= top + a && close[t] >= bottom - a;
            if (inRange && !rangeState) {
              rangeState = { since: ts[t], sinceIndex: t, top: Math.max.apply(null, hs), bottom: Math.min.apply(null, ls) };
              pushEvent("RANGE_START", t, close[t], rangeState.top, p.pivotId, "Hochs/Tiefs innerhalb " + cfg.rangeMaxSpanAtr + " ATR");
            } else if (inRange && rangeState) {
              rangeState.top = Math.max.apply(null, hs); rangeState.bottom = Math.min.apply(null, ls);
            } else if (!inRange && rangeState) {
              pushEvent("RANGE_END", t, close[t], null, p.pivotId, null);
              rangeState = null;
            }
          }
        }

        /* Compression / Expansion: Amplituden der letzten Swings. */
        var amps = swings.slice(-cfg.compressionSwings).map(function (s) { return s.amplitudeATR; });
        if (amps.length === cfg.compressionSwings && amps.every(isNum)) {
          var dec = true, inc = true;
          for (var q = 1; q < amps.length; q++) { if (!(amps[q] < amps[q - 1])) dec = false; if (!(amps[q] > amps[q - 1])) inc = false; }
          var next = dec ? "COMPRESSION" : inc ? "EXPANSION" : null;
          if (next && next !== volState) pushEvent(next, t, close[t], null, p.pivotId, "Swing-Amplituden " + amps.map(function (x) { return x.toFixed(2); }).join(" → ") + " ATR");
          volState = next;
        }
      }

      /* Close-basierte Brueche gegen bestaetigte Strukturlevel. Ein Bruch
         setzt den Regimezustand sofort (formal, close-basiert): das letzte
         bestaetigte Strukturtief per Close zu unterschreiten IST der
         Strukturwechsel — nicht erst der naechste bestaetigte Pivot. */
      if (lastHigh && !brokenHighIds[lastHigh.pivotId] && close[t] > lastHigh.price + buffer) {
        brokenHighIds[lastHigh.pivotId] = true;
        pushEvent(trendBias === "BULLISH" ? "BOS_BULLISH" : (trendBias === "BEARISH" ? "STRUCTURE_FAILURE_BEARISH" : "BREAKOUT_UP"), t, close[t], lastHigh.price, lastHigh.pivotId,
                  "Close > " + round2(lastHigh.price) + " + " + round2(buffer));
        trendBias = "BULLISH";
        if (regime !== "BULLISH") { regime = "BULLISH"; timeline.push({ index: t, time: ts[t], regime: regime, via: "close-break" }); }
        if (rangeState) { pushEvent("RANGE_END", t, close[t], lastHigh.price, lastHigh.pivotId, "Ausbruch"); rangeState = null; }
      }
      if (lastLow && !brokenLowIds[lastLow.pivotId] && close[t] < lastLow.price - buffer) {
        brokenLowIds[lastLow.pivotId] = true;
        pushEvent(trendBias === "BEARISH" ? "BOS_BEARISH" : (trendBias === "BULLISH" ? "STRUCTURE_FAILURE_BULLISH" : "BREAKOUT_DOWN"), t, close[t], lastLow.price, lastLow.pivotId,
                  "Close < " + round2(lastLow.price) + " − " + round2(buffer));
        trendBias = "BEARISH";
        if (regime !== "BEARISH") { regime = "BEARISH"; timeline.push({ index: t, time: ts[t], regime: regime, via: "close-break" }); }
        if (rangeState) { pushEvent("RANGE_END", t, close[t], lastLow.price, lastLow.pivotId, "Ausbruch"); rangeState = null; }
      }
      /* Level Sweep: Docht ueber das Level, Close wieder darunter. */
      if (lastHigh && !brokenHighIds[lastHigh.pivotId] && !sweptHighIds[lastHigh.pivotId] && high[t] > lastHigh.price + cfg.sweepBufferAtr * a && close[t] < lastHigh.price) {
        sweptHighIds[lastHigh.pivotId] = true;
        pushEvent("LEVEL_SWEEP_HIGH", t, close[t], lastHigh.price, lastHigh.pivotId, "High ueber Level, Close darunter");
      }
      if (lastLow && !brokenLowIds[lastLow.pivotId] && !sweptLowIds[lastLow.pivotId] && low[t] < lastLow.price - cfg.sweepBufferAtr * a && close[t] > lastLow.price) {
        sweptLowIds[lastLow.pivotId] = true;
        pushEvent("LEVEL_SWEEP_LOW", t, close[t], lastLow.price, lastLow.pivotId, "Low unter Level, Close darueber");
      }
    }

    var lastIdx = n - 1;
    var state = {
      regime: regime, confirmedRegime: confirmedRegime, trendBias: trendBias,
      lastHighLabel: lastHighLabel, lastLowLabel: lastLowLabel,
      lastStructuralHigh: lastHigh ? { pivotId: lastHigh.pivotId, price: lastHigh.price, time: lastHigh.time, index: lastHigh.index, broken: !!brokenHighIds[lastHigh.pivotId] } : null,
      lastStructuralLow: lastLow ? { pivotId: lastLow.pivotId, price: lastLow.price, time: lastLow.time, index: lastLow.index, broken: !!brokenLowIds[lastLow.pivotId] } : null,
      range: rangeState,
      swingVolatility: volState,
      developingPivot: pivots.scales[scaleId].developing,
      asOfIndex: lastIdx, asOf: ts[lastIdx] || null
    };
    /* Score −1..1 fuer die Confluence-Familie STRUCTURE. */
    var recentEvents = events.filter(function (e) { return e.index > lastIdx - 60; });
    var score = regime === "BULLISH" ? 0.6 : regime === "BEARISH" ? -0.6 : 0;
    recentEvents.forEach(function (e) {
      if (e.type === "BOS_BULLISH" || e.type === "STRUCTURE_CHANGE_BULLISH" || e.type === "BREAKOUT_UP") score += 0.2;
      if (e.type === "BOS_BEARISH" || e.type === "STRUCTURE_CHANGE_BEARISH" || e.type === "BREAKOUT_DOWN") score -= 0.2;
      if (e.type === "STRUCTURE_FAILURE_BULLISH") score -= 0.4;
      if (e.type === "STRUCTURE_FAILURE_BEARISH") score += 0.4;
    });
    state.structureScore = Math.max(-1, Math.min(1, score));

    return {
      engineVersion: ENGINE_VERSION, repaintingPolicy: REPAINTING_POLICY,
      parametersHash: Hash.hashValue({ v: ENGINE_VERSION, cfg: cfg, scaleId: scaleId }),
      scaleId: scaleId, state: state, swings: swings, events: events, timeline: timeline
    };
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  var api = { ENGINE_VERSION: ENGINE_VERSION, REPAINTING_POLICY: REPAINTING_POLICY, DEFAULTS: DEFAULTS, regimeOf: regimeOf, analyzeStructure: analyzeStructure };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Structure = api; }
})(typeof window !== "undefined" ? window : globalThis);
