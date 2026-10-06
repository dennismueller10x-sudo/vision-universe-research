/* =========================================================================
   VISION UNIVERSE TECHNICAL — scenario-engine.js
   SCENARIO ENGINE

   Output ist kein BUY/SELL, sondern strukturierte Szenarien:
     PRIMARY      der derzeit am staerksten gestuetzte strukturelle Kandidat
     ALTERNATIVE  eine plausible andere Interpretation
     BEAR         der strukturelle Zustand NACH Bruch der Primary-Hypothese

   Jedes Szenario traegt Entry Zone (optional! ein bullischer Chart darf
   NO_ACTIONABLE_ENTRY liefern), objektive Invalidation, Target Zones
   (Zonen, keine Einzelwerte), Evidence, Provenienz. Entry Zones entstehen
   aus Struktur + Support + Retracement + Volatilitaet — nie aus einem
   einzelnen RSI-Wert. Ohne objektive Invalidation gibt es kein Setup.

   Count Invalidation (Analyse) und Trade Stop sind getrennte Felder.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var C = isNode ? require("./engine-common.js") : global.VUTechnical.Common;

  var ENGINE_VERSION = "scenario-1.0.0";
  var DEFAULTS = { entryZoneMinWidthAtr: 0.5, entryZoneMaxWidthAtr: 2.0, invalidationBufferAtr: 0.5, retracementBand: [0.382, 0.618], deepRetracementBand: [0.618, 0.786],
                   targetMinDistanceAtr: 1.0, projectionHorizonBars: 60, maxEntryDistanceAtr: 4.0, breakoutLookbackBars: 5 };

  /** displayPrecisionPolicy: Rundungsschritt aus dem ATR — keine Cent-Praezision bei Dollar-Rauschen. */
  function priceStep(atr) {
    if (!C.isNum(atr) || atr <= 0) return 0.01;
    var step = Math.pow(10, Math.floor(Math.log10(atr / 4)));
    return Math.max(0.01, step);
  }
  function roundTo(price, step) { return Math.round(price / step) * step; }
  function zone(low, high, step, sources, extra) {
    var lo = Math.min(low, high), hi = Math.max(low, high);
    return Object.assign({ zoneLow: C.round(roundTo(lo, step), 6), zoneHigh: C.round(roundTo(hi, step), 6), sources: sources || [], methodologyVersion: ENGINE_VERSION }, extra || {});
  }
  function overlap(a, b) { return Math.min(a.zoneHigh, b.zoneHigh) - Math.max(a.zoneLow, b.zoneLow); }

  /** Richtung aus Familien-Evidenz — kein Doppelzaehlen einzelner Indikatoren. */
  function deriveDirection(e) {
    var bias = 0;
    if (e.trend.direction === "BULLISH") bias += 2; else if (e.trend.direction === "BEARISH") bias -= 2;
    var reg = e.structure.state.regime;
    if (reg === "BULLISH") bias += 2; else if (reg === "BEARISH") bias -= 2;
    if (Math.abs(e.momentum.value) > 0.3) bias += e.momentum.value > 0 ? 1 : -1;
    if (e.relativeStrength && e.relativeStrength.state !== "UNAVAILABLE" && Math.abs(e.relativeStrength.value) > 0.3) bias += e.relativeStrength.value > 0 ? 0.5 : -0.5;
    if (bias >= 2) return "BULLISH";
    if (bias <= -2) return "BEARISH";
    return reg === "RANGE" ? "RANGE" : "NEUTRAL";
  }

  function splitEvidence(engines, dirSign) {
    var sup = [], con = [];
    ["structure", "trend", "momentum", "relativeStrength", "volatility", "volume", "supportResistance", "fibonacci", "elliott"].forEach(function (k) {
      var eng = engines[k]; if (!eng || !eng.evidence) return;
      eng.evidence.forEach(function (ev) {
        if (dirSign === 0 || ev.polarity === 0) return;
        if (ev.polarity * dirSign > 0) sup.push(ev); else con.push(ev);
      });
    });
    /* Struktur-Events als Evidence. */
    var st = engines.structure;
    if (st) {
      st.events.slice(-4).forEach(function (evn) {
        /* AUDIT-FIX: FAILURE_BULLISH ist ein bearischer Bruch — zuerst pruefen, sonst matcht "BULLISH". */
        var pol = /FAILURE_BULLISH|BEARISH|DOWN/.test(evn.type) ? -1 : /FAILURE_BEARISH|BULLISH|UP/.test(evn.type) ? 1 : 0;
        if (!pol || dirSign === 0) return;
        var item = C.evidence(st.engineVersion, "STRUCTURE", evn.eventId, evn.type.replace(/_/g, " ") + " am " + evn.time + (evn.level ? " (Level " + C.round(evn.level, 2) + ")" : ""), evn.level, pol, 1);
        if (pol * dirSign > 0) sup.push(item); else con.push(item);
      });
    }
    return { supporting: sup, conflicting: con };
  }

  function describeStructure(e) {
    var st = e.structure.state, parts = [];
    parts.push("Struktur " + st.regime.toLowerCase() + (st.lastHighLabel && st.lastLowLabel ? " (" + st.lastHighLabel + "/" + st.lastLowLabel + ")" : ""));
    parts.push("Trend " + e.trend.direction.toLowerCase() + " " + (e.trend.trendScore === null ? "" : e.trend.trendScore + "/100"));
    if (st.developingPivot) parts.push("laufender Swing seit " + st.developingPivot.pivotTime + (st.developingPivot.side === "HIGH" ? " (Aufwaertsbewegung, Hoch developing)" : " (Abwaertsbewegung, Tief developing)"));
    return parts.join(" · ");
  }

  /**
   * @param {object} ctx { series, features, engines:{...}, cfg, setupScaleId }
   */
  function buildScenarios(ctx) {
    var cfg = Object.assign({}, DEFAULTS, ctx.cfg || {});
    var series = ctx.series, f = ctx.features.columns, e = ctx.engines;
    var i = series.length - 1, close = series.close[i], atr = C.isNum(f.atr[i]) ? f.atr[i] : close * 0.02;
    var step = priceStep(atr);
    var direction = deriveDirection(e);
    var scale = ctx.setupScaleId || e.structure.scaleId;
    var pv = e.pivots.scales[scale].pivots, dev = e.pivots.scales[scale].developing;
    var base = {
      instrumentId: series.instrumentId, analysisTime: series.timestamps[i], dataCutoff: series.timestamps[i], dataVersion: series.dataVersion,
      timeframe: series.timeframe, setupScaleId: scale, currentStructure: describeStructure(e),
      engineVersions: { scenario: ENGINE_VERSION, structure: e.structure.engineVersion, trend: e.trend.engineVersion, pivots: e.pivots.engineVersion, supportResistance: e.supportResistance.engineVersion, fibonacci: e.fibonacci ? e.fibonacci.engineVersion : null, elliott: e.elliott ? e.elliott.engineVersion : null },
      displayStep: step, atr: C.round(atr, 4), projectionHorizonBars: cfg.projectionHorizonBars
    };
    var out = [];

    if (pv.length < 2 || e.trend.direction === "UNDETERMINED") {
      out.push(finish(Object.assign({}, base, { type: "PRIMARY", direction: "UNDETERMINED", template: "INSUFFICIENT_STRUCTURE", status: "UNDETERMINED",
        entryZone: null, entryStatus: "NONE", invalidation: null, tradeStop: null, targetZones: [], supportingEvidence: [], conflictingEvidence: [],
        whatMustHappen: "Zu wenig bestaetigte Struktur fuer ein Szenario.", expiryRule: "Neubewertung mit der naechsten bestaetigten Struktur." })));
      return { engineVersion: ENGINE_VERSION, direction: "UNDETERMINED", scenarios: out, primary: out[0], alternative: null, bear: null };
    }

    var sign = direction === "BULLISH" ? 1 : direction === "BEARISH" ? -1 : 0;
    if (sign !== 0) {
      var s = directional(sign, base, e, pv, dev, close, atr, step, cfg, i, series);
      out = out.concat(s);
    } else {
      out = out.concat(rangeScenarios(base, e, pv, close, atr, step, cfg));
    }
    out.forEach(finish);
    return { engineVersion: ENGINE_VERSION, direction: direction, scenarios: out,
             primary: out.filter(function (s) { return s.type === "PRIMARY"; })[0] || null,
             alternative: out.filter(function (s) { return s.type === "ALTERNATIVE"; })[0] || null,
             bear: out.filter(function (s) { return s.type === "BEAR"; })[0] || null };
  }

  function finish(s) {
    s.scenarioId = "sc_" + Hash.hashValue({ i: s.instrumentId, t: s.analysisTime, ty: s.type, tpl: s.template, e: s.entryZone, inv: s.invalidation, tg: s.targetZones, d: s.dataVersion });
    s.confidence = s.confidence === undefined ? null : s.confidence;
    s.confidenceType = "methodology_confidence";
    return s;
  }

  /** Bullish (sign=+1) oder bearish (sign=-1) Szenariofamilie — gespiegelt. */
  function directional(sign, base, e, pv, dev, close, atr, step, cfg, i, series) {
    var dirName = sign > 0 ? "BULLISH" : "BEARISH";
    var sr = e.supportResistance, st = e.structure.state;
    /* Referenz-Swing in Trendrichtung: letzter bestaetigter Swing, der in Richtung zeigt. */
    var last = pv[pv.length - 1], prev = pv[pv.length - 2];
    var swingStart, swingEnd, inPullback;
    if ((sign > 0 && last.side === "HIGH") || (sign < 0 && last.side === "LOW")) { swingStart = prev; swingEnd = last; inPullback = true; }
    else { swingStart = last; swingEnd = dev && dev.side === (sign > 0 ? "HIGH" : "LOW") ? dev : null; inPullback = false;
           if (!swingEnd && pv.length >= 3) { swingStart = pv[pv.length - 3]; swingEnd = pv[pv.length - 2]; inPullback = true; } }
    if (!swingEnd) swingEnd = { pivotPrice: close, pivotTime: series.timestamps[i], pivotId: null, status: "DEVELOPING" };
    var A = swingStart.pivotPrice, B = swingEnd.pivotPrice, len = Math.abs(B - A);
    var ev = splitEvidence(e, sign);

    /* --- Entry Zone: Retracement-Band ∩ Support/Resistance-Zone, ATR-begrenzt --- */
    var band = zone(B - sign * len * cfg.retracementBand[0], B - sign * len * cfg.retracementBand[1], step, [{ type: "RETRACEMENT", ref: swingStart.pivotId + "→" + (swingEnd.pivotId || "developing"), band: cfg.retracementBand }]);
    var candidates = sign > 0 ? sr.zones.filter(function (z) { return z.currentRole === "SUPPORT" || z.currentRole === "INSIDE"; })
                              : sr.zones.filter(function (z) { return z.currentRole === "RESISTANCE" || z.currentRole === "INSIDE"; });
    var bestZone = null, bestOv = -Infinity;
    candidates.forEach(function (z) { var ov = overlap(z, band); if (ov > bestOv) { bestOv = ov; bestZone = z; } });
    var entry, entrySources = band.sources.slice();
    if (bestZone && bestOv > -atr) {
      var lo = Math.max(Math.min(band.zoneLow, bestZone.zoneLow), Math.min(band.zoneLow, bestZone.zoneLow));
      entry = zone(Math.max(band.zoneLow, bestZone.zoneLow) - (bestOv < 0 ? Math.abs(bestOv) : 0), Math.min(band.zoneHigh, bestZone.zoneHigh) + (bestOv < 0 ? Math.abs(bestOv) : 0), step);
      entrySources.push({ type: bestZone.currentRole === "SUPPORT" ? "SUPPORT_ZONE" : bestZone.currentRole === "RESISTANCE" ? "RESISTANCE_ZONE" : "PRICE_ZONE", ref: bestZone.zoneId, strength: bestZone.strength });
      void lo;
    } else entry = band;
    /* Breite auf [min,max] ATR normieren. */
    var width = entry.zoneHigh - entry.zoneLow, mid = (entry.zoneHigh + entry.zoneLow) / 2;
    if (width < cfg.entryZoneMinWidthAtr * atr) entry = zone(mid - cfg.entryZoneMinWidthAtr * atr / 2, mid + cfg.entryZoneMinWidthAtr * atr / 2, step);
    if (width > cfg.entryZoneMaxWidthAtr * atr) entry = sign > 0 ? zone(entry.zoneHigh - cfg.entryZoneMaxWidthAtr * atr, entry.zoneHigh, step) : zone(entry.zoneLow, entry.zoneLow + cfg.entryZoneMaxWidthAtr * atr, step);
    entry.sources = entrySources; entry.sources.push({ type: "VOLATILITY", ref: "ATR " + C.round(atr, 2) });

    /* Breakout-Template, wenn gerade ein close-basierter Strukturbruch stattfand. */
    var template = "PULLBACK_TO_" + (sign > 0 ? "SUPPORT" : "RESISTANCE");
    var recentBos = e.structure.events.filter(function (evn) { return evn.index > i - cfg.breakoutLookbackBars && (sign > 0 ? /^(BOS_BULLISH|BREAKOUT_UP|STRUCTURE_CHANGE_BULLISH|STRUCTURE_FAILURE_BEARISH)$/ : /^(BOS_BEARISH|BREAKOUT_DOWN|STRUCTURE_CHANGE_BEARISH|STRUCTURE_FAILURE_BULLISH)$/).test(evn.type); })[0];
    if (recentBos && C.isNum(recentBos.level) && Math.abs(close - recentBos.level) < 1.5 * atr) {
      template = "BREAKOUT_" + (sign > 0 ? "RETEST" : "RETEST");
      entry = zone(recentBos.level - (sign > 0 ? 0.25 : 0.75) * atr, recentBos.level + (sign > 0 ? 0.75 : 0.25) * atr, step,
                   [{ type: "STRUCTURE_BREAK", ref: recentBos.eventId, level: recentBos.level }, { type: "VOLATILITY", ref: "ATR " + C.round(atr, 2) }]);
    }

    /* --- Invalidation: strukturell, unterhalb/oberhalb der Entry Zone --- */
    var structLevel = sign > 0 ? (st.lastStructuralLow && !st.lastStructuralLow.broken ? st.lastStructuralLow : null) : (st.lastStructuralHigh && !st.lastStructuralHigh.broken ? st.lastStructuralHigh : null);
    var invPrice, invRef, invRule;
    if (structLevel && (sign > 0 ? structLevel.price < entry.zoneLow : structLevel.price > entry.zoneHigh)) {
      invPrice = structLevel.price - sign * cfg.invalidationBufferAtr * atr; invRef = structLevel.pivotId;
      invRule = "Close " + (sign > 0 ? "unter" : "ueber") + " dem letzten bestaetigten Struktur" + (sign > 0 ? "tief" : "hoch") + " (" + C.round(structLevel.price, 2) + ") minus " + cfg.invalidationBufferAtr + " ATR Buffer";
    } else {
      invPrice = A - sign * cfg.invalidationBufferAtr * atr; invRef = swingStart.pivotId;
      invRule = "Close " + (sign > 0 ? "unter" : "ueber") + " dem Ursprung des Referenz-Swings (" + C.round(A, 2) + ") minus " + cfg.invalidationBufferAtr + " ATR Buffer";
    }
    if (sign > 0 ? invPrice >= entry.zoneLow : invPrice <= entry.zoneHigh) invPrice = sign > 0 ? entry.zoneLow - cfg.invalidationBufferAtr * atr : entry.zoneHigh + cfg.invalidationBufferAtr * atr;
    var invalidation = { price: C.round(roundTo(invPrice, step), 6), rule: invRule, refPivotId: invRef, basis: "STRUCTURE", kind: "analysisInvalidation" };

    /* --- Target Zones: Struktur/Zonen zuerst, Measured Move + Fib-Cluster als Verstaerkung --- */
    var beyond = sign > 0 ? sr.zones.filter(function (z) { return z.currentRole === "RESISTANCE" && z.zoneLow > entry.zoneHigh + cfg.targetMinDistanceAtr * atr; }).sort(function (a, b) { return a.zoneLow - b.zoneLow; })
                          : sr.zones.filter(function (z) { return z.currentRole === "SUPPORT" && z.zoneHigh < entry.zoneLow - cfg.targetMinDistanceAtr * atr; }).sort(function (a, b) { return b.zoneHigh - a.zoneHigh; });
    var refEntry = sign > 0 ? entry.zoneHigh : entry.zoneLow;
    var measured1 = zone(refEntry + sign * len * 1.0 - 0.5 * atr, refEntry + sign * len * 1.0 + 0.5 * atr, step, [{ type: "MEASURED_MOVE", ratio: 1.0, ref: "swing " + C.round(len, 2) }]);
    var measured2 = zone(refEntry + sign * len * 1.618 - 0.75 * atr, refEntry + sign * len * 1.618 + 0.75 * atr, step, [{ type: "MEASURED_MOVE", ratio: 1.618, ref: "swing " + C.round(len, 2) }]);
    var t1 = beyond[0] ? zone(beyond[0].zoneLow, beyond[0].zoneHigh, step, [{ type: beyond[0].currentRole === "RESISTANCE" ? "RESISTANCE_ZONE" : "SUPPORT_ZONE", ref: beyond[0].zoneId, strength: beyond[0].strength }]) : measured1;
    if (beyond[0] && overlap(t1, measured1) > -atr) t1.sources.push(measured1.sources[0]);
    var t2 = beyond[1] && (sign > 0 ? beyond[1].zoneLow > t1.zoneHigh : beyond[1].zoneHigh < t1.zoneLow) ? zone(beyond[1].zoneLow, beyond[1].zoneHigh, step, [{ type: beyond[1].currentRole === "RESISTANCE" ? "RESISTANCE_ZONE" : "SUPPORT_ZONE", ref: beyond[1].zoneId, strength: beyond[1].strength }]) : measured2;
    if (sign > 0 ? t2.zoneLow <= t1.zoneHigh : t2.zoneHigh >= t1.zoneLow) t2 = measured2;
    if (sign > 0 ? t2.zoneLow <= t1.zoneHigh : t2.zoneHigh >= t1.zoneLow) { var farEdge = sign > 0 ? t1.zoneHigh : t1.zoneLow; t2 = zone(farEdge + sign * atr, farEdge + sign * 2 * atr, step, [{ type: "VOLATILITY", ref: "ATR-Projektion" }]); }
    [t1, t2].forEach(function (tz) {
      (e.fibonacci ? e.fibonacci.clusters : []).forEach(function (cl) { if (overlap(tz, cl) > 0) tz.sources.push({ type: "FIB_CLUSTER", ref: cl.clusterId }); });
      (e.elliott && e.elliott.projection ? e.elliott.projection.zones : []).forEach(function (pz) { if (overlap(tz, pz) > 0) tz.sources.push({ type: "ELLIOTT_PROJECTION", ref: pz.zoneId }); });
    });
    t1.label = "Target Zone 1"; t2.label = "Target Zone 2";

    /* Entry-Status */
    var entryStatus, status;
    var distToEntry = sign > 0 ? (close - entry.zoneHigh) / atr : (entry.zoneLow - close) / atr;
    if (close >= entry.zoneLow && close <= entry.zoneHigh) { entryStatus = "ACTIVE"; status = "ACTIVE"; }
    else if (distToEntry > 0 && distToEntry <= cfg.maxEntryDistanceAtr) { entryStatus = "AWAITING_PULLBACK"; status = "AWAITING_TRIGGER"; }
    else if (distToEntry > cfg.maxEntryDistanceAtr) { entryStatus = "EXTENDED"; status = "AWAITING_TRIGGER"; }
    else { entryStatus = "BELOW_ZONE"; status = "WEAKENED"; }
    if (sign > 0 ? close <= invalidation.price : close >= invalidation.price) { status = "INVALIDATED"; entryStatus = "NONE"; }

    var primary = Object.assign({}, base, {
      type: "PRIMARY", direction: dirName, template: template, status: status,
      referenceSwing: { from: { pivotId: swingStart.pivotId, price: A, time: swingStart.pivotTime }, to: { pivotId: swingEnd.pivotId || null, price: B, time: swingEnd.pivotTime, status: swingEnd.status || "CONFIRMED" }, length: C.round(len, 4), inPullback: inPullback },
      entryZone: entry, entryStatus: entryStatus, invalidation: invalidation, tradeStop: { price: invalidation.price, kind: "tradeStop", note: "V1: identisch mit der Analyse-Invalidation; getrennt gespeichert" },
      targetZones: [t1, t2], supportingEvidence: ev.supporting, conflictingEvidence: ev.conflicting,
      whatMustHappen: sign > 0 ? "Kurs haelt die Entry Zone bzw. das letzte Strukturtief und erzeugt ein neues Higher High." : "Kurs scheitert an der Entry Zone bzw. dem letzten Strukturhoch und erzeugt ein neues Lower Low.",
      expiryRule: "Verfaellt bei Invalidation oder wenn Target Zone 1 ohne Entry erreicht wird; Neubewertung mit jedem neuen bestaetigten Pivot der Setup-Skala."
    });

    /* ALTERNATIVE: tiefere Korrektur (61.8–78.6) — Struktur bleibt intakt. */
    var deep = zone(B - sign * len * cfg.deepRetracementBand[0], B - sign * len * cfg.deepRetracementBand[1], step, [{ type: "RETRACEMENT", band: cfg.deepRetracementBand, ref: swingStart.pivotId + "→" + (swingEnd.pivotId || "developing") }, { type: "VOLATILITY", ref: "ATR " + C.round(atr, 2) }]);
    var altInv = { price: C.round(roundTo(A - sign * cfg.invalidationBufferAtr * atr, step), 6), rule: "Close " + (sign > 0 ? "unter" : "ueber") + " dem Ursprung des Referenz-Swings (" + C.round(A, 2) + ")", refPivotId: swingStart.pivotId, basis: "STRUCTURE", kind: "analysisInvalidation" };
    var altValid = sign > 0 ? altInv.price < deep.zoneLow : altInv.price > deep.zoneHigh;
    var alternative = Object.assign({}, base, {
      type: "ALTERNATIVE", direction: dirName, template: "DEEPER_CORRECTION", status: altValid ? (close > deep.zoneLow && close < deep.zoneHigh ? "ACTIVE" : "AWAITING_TRIGGER") : "WEAKENED",
      referenceSwing: primary.referenceSwing,
      entryZone: altValid ? deep : null, entryStatus: altValid ? (close > deep.zoneLow && close < deep.zoneHigh ? "ACTIVE" : "AWAITING_PULLBACK") : "NONE",
      invalidation: altInv, tradeStop: altValid ? { price: altInv.price, kind: "tradeStop" } : null,
      targetZones: [t1, t2], supportingEvidence: ev.supporting.filter(function (x) { return x.family === "STRUCTURE" || x.family === "TREND"; }), conflictingEvidence: ev.conflicting,
      whatMustHappen: "Kurs korrigiert tiefer (61.8–78.6 % des Referenz-Swings), haelt aber den Swing-Ursprung.",
      expiryRule: "Verfaellt, wenn die Primary Entry Zone haelt und ein neues Extrem entsteht, oder bei Invalidation."
    });

    /* BEAR / INVALIDATION: Zustand nach Bruch — Analyse, kein Setup. */
    var after = sign > 0 ? sr.zones.filter(function (z) { return z.zoneHigh < invalidation.price; }).sort(function (a, b) { return b.zoneHigh - a.zoneHigh; })
                         : sr.zones.filter(function (z) { return z.zoneLow > invalidation.price; }).sort(function (a, b) { return a.zoneLow - b.zoneLow; });
    var b1 = after[0] ? zone(after[0].zoneLow, after[0].zoneHigh, step, [{ type: after[0].origin === "PIVOT_CLUSTER" ? (sign > 0 ? "SUPPORT_ZONE" : "RESISTANCE_ZONE") : after[0].origin, ref: after[0].zoneId }]) : zone(invalidation.price - sign * len * 0.618 - 0.5 * atr, invalidation.price - sign * len * 0.618 + 0.5 * atr, step, [{ type: "MEASURED_MOVE", ratio: 0.618, ref: "swing" }]);
    var b2 = after[1] ? zone(after[1].zoneLow, after[1].zoneHigh, step, [{ type: after[1].origin === "PIVOT_CLUSTER" ? (sign > 0 ? "SUPPORT_ZONE" : "RESISTANCE_ZONE") : after[1].origin, ref: after[1].zoneId }]) : zone(invalidation.price - sign * len * 1.0 - 0.75 * atr, invalidation.price - sign * len * 1.0 + 0.75 * atr, step, [{ type: "MEASURED_MOVE", ratio: 1.0, ref: "swing" }]);
    b1.label = "Target Zone 1"; b2.label = "Target Zone 2";
    var bear = Object.assign({}, base, {
      type: "BEAR", direction: sign > 0 ? "BEARISH" : "BULLISH", template: "STRUCTURE_FAILURE", status: status === "INVALIDATED" ? "ACTIVE" : "CONDITIONAL",
      trigger: { rule: "Close " + (sign > 0 ? "unter " : "ueber ") + C.round(invalidation.price, 2) + " (Invalidation des Primary Scenario)", price: invalidation.price },
      entryZone: null, entryStatus: "NONE", invalidation: { price: C.round(roundTo(B + sign * cfg.invalidationBufferAtr * atr, step), 6), rule: "Rueckeroberung des Referenz-Extrems (" + C.round(B, 2) + ")", refPivotId: swingEnd.pivotId || null, basis: "STRUCTURE", kind: "analysisInvalidation" },
      tradeStop: null, targetZones: [b1, b2], supportingEvidence: ev.conflicting, conflictingEvidence: ev.supporting,
      whatMustHappen: "Bruch der Invalidation per Close; danach gilt die Gegenstruktur.",
      expiryRule: "Verfaellt, wenn das Primary Scenario Target Zone 1 erreicht."
    });
    return [primary, alternative, bear];
  }

  function rangeScenarios(base, e, pv, close, atr, step, cfg) {
    var st = e.structure.state, sr = e.supportResistance;
    var top = st.range ? st.range.top : (st.lastStructuralHigh ? st.lastStructuralHigh.price : close + 2 * atr);
    var bottom = st.range ? st.range.bottom : (st.lastStructuralLow ? st.lastStructuralLow.price : close - 2 * atr);
    var ev = splitEvidence(e, 0);
    var primary = Object.assign({}, base, {
      type: "PRIMARY", direction: "NEUTRAL", template: "RANGE",
      status: (close < bottom - cfg.invalidationBufferAtr * atr || close > top + cfg.invalidationBufferAtr * atr) ? "INVALIDATED" : "ACTIVE",
      rangeBounds: { top: C.round(top, 4), bottom: C.round(bottom, 4) },
      entryZone: null, entryStatus: "NONE",
      /* AUDIT-FIX: zweiseitig — die Range-Hypothese endet oben wie unten. */
      invalidation: { price: C.round(roundTo(bottom - cfg.invalidationBufferAtr * atr, step), 6), upperPrice: C.round(roundTo(top + cfg.invalidationBufferAtr * atr, step), 6), rule: "Close unter der Range-Unterkante (" + C.round(bottom, 2) + ") oder ueber der Oberkante (" + C.round(top, 2) + ")", refPivotId: st.lastStructuralLow ? st.lastStructuralLow.pivotId : null, basis: "STRUCTURE", kind: "analysisInvalidation" },
      tradeStop: null, targetZones: [],
      supportingEvidence: ev.supporting, conflictingEvidence: ev.conflicting,
      whatMustHappen: "Ein Close ueber " + C.round(top, 2) + " oder unter " + C.round(bottom, 2) + " beendet die Range; bis dahin keine richtungsgebende Hypothese.",
      expiryRule: "Verfaellt mit dem ersten close-basierten Ausbruch."
    });
    var up = Object.assign({}, base, {
      type: "ALTERNATIVE", direction: "BULLISH", template: "RANGE_BREAKOUT_UP", status: "CONDITIONAL",
      trigger: { rule: "Close ueber " + C.round(top, 2) + " + Buffer", price: C.round(top, 4) },
      entryZone: zone(top - 0.25 * atr, top + 0.75 * atr, step, [{ type: "RANGE_TOP", ref: "range" }, { type: "VOLATILITY", ref: "ATR " + C.round(atr, 2) }]), entryStatus: "AWAITING_TRIGGER",
      invalidation: { price: C.round(roundTo(top - cfg.invalidationBufferAtr * atr - atr, step), 6), rule: "Rueckfall in die Range unter " + C.round(top, 2), refPivotId: st.lastStructuralHigh ? st.lastStructuralHigh.pivotId : null, basis: "STRUCTURE", kind: "analysisInvalidation" },
      tradeStop: null, targetZones: [zone(top + (top - bottom) - 0.5 * atr, top + (top - bottom) + 0.5 * atr, step, [{ type: "MEASURED_MOVE", ratio: 1.0, ref: "range height" }], { label: "Target Zone 1" })],
      supportingEvidence: [], conflictingEvidence: [], whatMustHappen: "Close-basierter Ausbruch ueber die Range-Oberkante.", expiryRule: "Verfaellt bei Ausbruch nach unten."
    });
    var down = Object.assign({}, base, {
      type: "BEAR", direction: "BEARISH", template: "RANGE_BREAKDOWN", status: "CONDITIONAL",
      trigger: { rule: "Close unter " + C.round(bottom, 2) + " − Buffer", price: C.round(bottom, 4) },
      entryZone: null, entryStatus: "NONE",
      invalidation: { price: C.round(roundTo(bottom + cfg.invalidationBufferAtr * atr + atr, step), 6), rule: "Rueckeroberung der Range ueber " + C.round(bottom, 2), refPivotId: st.lastStructuralLow ? st.lastStructuralLow.pivotId : null, basis: "STRUCTURE", kind: "analysisInvalidation" },
      tradeStop: null, targetZones: [zone(bottom - (top - bottom) - 0.5 * atr, bottom - (top - bottom) + 0.5 * atr, step, [{ type: "MEASURED_MOVE", ratio: 1.0, ref: "range height" }], { label: "Target Zone 1" })],
      supportingEvidence: [], conflictingEvidence: [], whatMustHappen: "Close-basierter Bruch der Range-Unterkante.", expiryRule: "Verfaellt bei Ausbruch nach oben."
    });
    void sr; void pv;
    return [primary, up, down];
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, priceStep: priceStep, roundTo: roundTo, zone: zone, deriveDirection: deriveDirection, buildScenarios: buildScenarios };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Scenario = api; }
})(typeof window !== "undefined" ? window : globalThis);
