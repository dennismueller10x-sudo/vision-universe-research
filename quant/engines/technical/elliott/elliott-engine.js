/* =========================================================================
   VISION UNIVERSE TECHNICAL — elliott/elliott-engine.js
   ELLIOTT V1 BETA — HISTORICAL WAVE MAP, PRIMARY/ALTERNATIVE COUNT,
   PROJECTION ZONES, INVALIDATION, CONFIDENCE

   Perspektive: nicht "erkenne die Welle", sondern: finde strukturell
   zulaessige Wave-Patterns ueber einer KAUSAL beobachtbaren Pivot-Skala,
   verwirf harte Regelverletzungen, ranke den Rest transparent.

   HISTORICAL WAVE MAP (Pflicht): Die Engine erklaert zuerst die
   Vergangenheit. Der Parser laeuft links nach rechts ueber die Legs des
   Segment-Graphen und entscheidet je Position lokal (Impulse 5 Legs /
   Zigzag 3 Legs / unlabeled). Eine Entscheidung haengt nur von den Legs
   des Patterns selbst ab — sobald deren Pivots bestaetigt sind, aendert
   sie sich nie mehr (CONFIRMED = NON-REPAINTING by construction). Nur das
   trailing Pattern ist DEVELOPING, alles rechts davon PROJECTED.

   Confidence = 0.8 Fit + 0.2 Stability, 0–100, Method Fit — KEINE
   Wahrscheinlichkeit. Harte Regeln sind Gates, keine Punkte.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../../hash.js") : global.VUHash;
  var Rules = isNode ? require("./rules.js") : global.VUTechnical.ElliottRules;
  var WaveGraph = isNode ? require("./wave-graph.js") : global.VUTechnical.WaveGraph;
  var Pivots = isNode ? require("../pivot-engine.js") : global.VUTechnical.Pivots;
  var C = isNode ? require("../engine-common.js") : global.VUTechnical.Common;

  var ENGINE_VERSION = "elliott-1.0.0-beta";
  var REPAINTING_POLICY = "CONFIRMS_WITH_DELAY";
  var DEFAULTS = {
    primaryDegreeScale: "scale-3", fallbackDegreeScales: ["scale-2"], minConfirmedPivots: 6, maxLegsConsidered: 40,
    degreeMapping: WaveGraph.DEFAULT_DEGREE_MAPPING,
    fitWeights: { internalStructure: 0.25, higherDegreeConsistency: 0.20, pivotQuality: 0.15, proportionality: 0.10, marketStructure: 0.10, momentumVolume: 0.10, alternationChannel: 0.05, fibonacciFit: 0.05 },
    confidence: { fit: 0.8, stability: 0.2 }, stabilityPerturbations: [0.9, 1.0, 1.1],
    minPatternScoreForMap: 0.35, alternativeMinSeparation: 0.05, lowConfidenceBelow: 40,
    projection: { w3Targets: [1.618, 2.618], w4Retracements: [0.236, 0.382], w5Targets: [0.618, 1.0], cTargets: [1.0, 1.618], w2Retracements: [0.5, 0.618], bRetracements: [0.382, 0.618],
                  durationRatios: { w2: [0.5, 1.0], w3: [1.0, 1.618], w4: [0.618, 1.0], w5: [0.618, 1.0], b: [0.5, 1.0], c: [0.618, 1.0] }, clusterToleranceAtr: 0.75, minZoneHalfWidthAtr: 0.5 }
  };
  var IMPULSE_LABELS = ["1", "2", "3", "4", "5"], ZIGZAG_LABELS = ["A", "B", "C"];

  function mean(a) { a = a.filter(C.isNum); return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : NaN; }
  function signOf(leg) { return leg.toPrice >= leg.fromPrice ? 1 : -1; }

  // ------------------------------------------------------------ Kandidat
  /** Bewertet ein Pattern aus legs (vollstaendig oder partiell). */
  function evaluate(type, legs, guidelines) {
    var sign = signOf(legs[0]);
    var hard = type === "IMPULSE" ? Rules.impulseHardRules(legs, sign) : Rules.zigzagHardRules(legs, sign);
    var violated = hard.filter(function (r) { return r.passed === false; });
    var soft = type === "IMPULSE" ? Rules.impulseGuidelines(legs, guidelines) : Rules.zigzagGuidelines(legs, guidelines);
    var softVals = Object.keys(soft).map(function (k) { return soft[k]; }).filter(C.isNum);
    var guidelineFit = softVals.length ? mean(softVals) : 0.5;
    return { type: type, sign: sign, legs: legs, hardRuleResults: hard, valid: violated.length === 0, violations: violated.map(function (r) { return r.ruleId; }),
             softMetrics: soft, guidelineFit: guidelineFit, score: violated.length ? 0 : C.round(0.4 + 0.6 * guidelineFit, 4) };
  }

  function wavesOf(cand, statusForLast) {
    var labels = cand.type === "IMPULSE" ? IMPULSE_LABELS : ZIGZAG_LABELS;
    return cand.legs.map(function (l, k) {
      var last = k === cand.legs.length - 1;
      return { label: labels[k], patternType: cand.type, fromPivotId: l.fromPivotId, toPivotId: l.toPivotId, fromIndex: l.fromIndex, toIndex: l.toIndex, fromTime: l.fromTime, toTime: l.toTime,
               fromPrice: l.fromPrice, toPrice: l.toPrice, duration: l.duration, status: last && statusForLast ? statusForLast : (l.status === "DEVELOPING" ? "DEVELOPING" : "CONFIRMED"), confirmedAt: l.confirmedAt || null };
    });
  }

  // ------------------------------------------------ Historical Wave Map
  /**
   * Kausaler Links-nach-rechts-Parser. Entscheidungen sind lokal: an
   * Position pos wird nur legs[pos .. pos+4] betrachtet.
   */
  function parseHistory(legs, cfg, guidelines) {
    var patterns = [], pos = 0, expectMotive = null, unlabeled = [], lastPatternEnd = 0;
    while (pos < legs.length) {
      var options = [];
      if (pos + 5 <= legs.length) { var imp = evaluate("IMPULSE", legs.slice(pos, pos + 5), guidelines); if (imp.valid && imp.score >= cfg.minPatternScoreForMap) options.push(imp); }
      if (pos + 3 <= legs.length) { var zz = evaluate("ZIGZAG", legs.slice(pos, pos + 3), guidelines); if (zz.valid && zz.score >= cfg.minPatternScoreForMap) options.push(zz); }
      if (!options.length) { unlabeled.push(pos); pos += 1; expectMotive = null; continue; }
      /* Grammatik-Praeferenz: nach Motive erwarten wir Corrective und umgekehrt (Bonus, kein Gate). */
      /* Coverage-Praeferenz: ein valides Pattern, das mehr Legs erklaert,
         geht vor (5 Legs Impuls vs. 3 Legs Zigzag). */
      options.forEach(function (o) {
        o.rank = 0.5 * o.score + 0.08 * o.legs.length;
        if (expectMotive === true && o.type === "IMPULSE") o.rank += 0.2;
        if (expectMotive === false && o.type === "ZIGZAG") o.rank += 0.2;
      });
      options.sort(function (a, b) { return b.rank - a.rank; });
      var best = options[0];
      patterns.push(best);
      pos += best.legs.length;
      lastPatternEnd = pos;
      expectMotive = best.type !== "IMPULSE";
    }
    /* Legs nach dem letzten gelabelten Pattern gehoeren zur Trailing-Region. */
    return { patterns: patterns, unlabeled: unlabeled.filter(function (u) { return u < lastPatternEnd; }), consumed: lastPatternEnd };
  }

  /** Trailing: letzte k bestaetigte Legs + developing Leg als Pattern-Anfang. */
  function trailingCandidates(legs, developing, startFrom, cfg, guidelines, expectMotive) {
    var out = [];
    var tail = legs.slice(startFrom);
    var all = developing ? tail.concat([developing]) : tail;
    if (!all.length) return out;
    /* Startpunkte: jedes Leg des Tails (auch frueher, um Alternativen zu erlauben), begrenzt. */
    var minStart = Math.max(0, all.length - 5);
    for (var s = minStart; s < all.length; s++) {
      var span = all.slice(s);
      if (span.length >= 1 && span.length <= 5) {
        var imp = evaluate("IMPULSE", span, guidelines);
        if (imp.valid) out.push(Object.assign(imp, { startOffset: startFrom + s, developingWave: span.length, complete: span.length === 5 && !developing }));
      }
      if (span.length >= 1 && span.length <= 3) {
        var zz = evaluate("ZIGZAG", span, guidelines);
        if (zz.valid) out.push(Object.assign(zz, { startOffset: startFrom + s, developingWave: span.length, complete: span.length === 3 && !developing }));
      }
    }
    /* Vollstaendigkeit belohnen: mehr erklaerte Legs = hoeherer Rank. */
    /* Rank: erklaerte Legs (MDL), Grammatik-Prior (nach Korrektur Motive erwartet), Fit. */
    out.forEach(function (o) {
      o.rank = 0.5 * o.score + 0.08 * o.legs.length;
      if (o.startOffset === startFrom && expectMotive === true && o.type === "IMPULSE") o.rank += 0.2;
      if (o.startOffset === startFrom && expectMotive === false && o.type === "ZIGZAG") o.rank += 0.2;
    });
    out.sort(function (a, b) { return b.rank - a.rank; });
    return out;
  }

  // ---------------------------------------------------------- Projektion
  function clusterTargets(cands, atr, cfg, srZones, calendarOffset) {
    var tol = cfg.clusterToleranceAtr * atr, half = cfg.minZoneHalfWidthAtr * atr;
    var sorted = cands.slice().sort(function (a, b) { return a.price - b.price; }), clusters = [], cur = null;
    sorted.forEach(function (c) {
      if (cur && c.price - cur.center <= tol && c.label === cur.label) { cur.items.push(c); cur.weight += c.weight; cur.center = cur.items.reduce(function (s, x) { return s + x.price * x.weight; }, 0) / cur.weight; }
      else { cur = { items: [c], weight: c.weight, center: c.price, label: c.label }; clusters.push(cur); }
    });
    return clusters.map(function (cl) {
      var prices = cl.items.map(function (x) { return x.price; });
      var lo = Math.min.apply(null, prices), hi = Math.max.apply(null, prices);
      if (hi - cl.center < half) hi = cl.center + half;
      if (cl.center - lo < half) lo = cl.center - half;
      var sources = cl.items.map(function (x) { return { type: "WAVE_RELATION", ref: x.source, ratio: x.ratio }; });
      (srZones || []).forEach(function (z) { if (Math.min(hi, z.zoneHigh) - Math.max(lo, z.zoneLow) > 0) { sources.push({ type: "SR_ZONE", ref: z.zoneId, strength: z.strength }); cl.weight += 0.5; } });
      return { zoneId: "pz_" + Hash.hashValue({ l: cl.label, lo: C.round(lo, 4), hi: C.round(hi, 4) }).slice(0, 10), label: cl.label, zoneLow: C.round(lo, 4), zoneHigh: C.round(hi, 4), center: C.round(cl.center, 4),
               weight: C.round(cl.weight, 3), sources: sources, status: "PROJECTED", methodologyVersion: ENGINE_VERSION };
    });
  }

  function project(cand, atr, cfg, srZones, calendar, now) {
    var P = cfg.projection, legs = cand.legs, sign = cand.sign, dw = cand.developingWave, out = { zones: [], path: [] };
    if (!legs.length) return out;
    function L(k) { return Rules.len(legs[k]); }
    var cands = [], steps = [];
    var lastPrice = legs[legs.length - 1].toPrice, lastTime = now;
    function push(label, base, lenRef, ratios, dir, weightBase, durRef, durRatios) {
      ratios.forEach(function (r, k) { cands.push({ label: label, price: base + dir * lenRef * r, ratio: r, weight: weightBase * (k === 0 ? 1 : 0.7), source: label + " = " + r + " × Referenz" }); });
      var midRatio = (ratios[0] + ratios[ratios.length - 1]) / 2;
      var dur = Math.max(2, Math.round(durRef * (durRatios[0] + durRatios[1]) / 2));
      steps.push({ label: label, price: base + dir * lenRef * midRatio, bars: dur });
    }
    if (cand.type === "IMPULSE") {
      var w1len = L(0), d1 = legs[0].duration || 10;
      if (dw === 1) return out;                          // ein einzelnes Leg: keine Projektion
      if (dw === 2) { push("2", legs[0].toPrice, w1len, P.w2Retracements, -sign, 1, d1, P.durationRatios.w2); }
      var w2end = dw === 2 ? steps[0].price : legs[1].toPrice;
      if (dw <= 3) { push("3", w2end, w1len, P.w3Targets, sign, dw === 3 ? 1 : 0.6, d1, P.durationRatios.w3); }
      var w3end = dw <= 3 ? steps[steps.length - 1].price : legs[2].toPrice;
      var w3len = dw <= 3 ? Math.abs(w3end - w2end) : L(2);
      if (dw <= 4) { push("4", w3end, w3len, P.w4Retracements, -sign, dw === 4 ? 1 : 0.5, dw <= 3 ? d1 : (legs[2].duration || d1), P.durationRatios.w4); }
      var w4end = dw <= 4 ? steps[steps.length - 1].price : legs[3].toPrice;
      if (dw <= 5) { push("5", w4end, w1len, P.w5Targets, sign, dw === 5 ? 1 : 0.4, d1, P.durationRatios.w5); }
    } else {
      var alen = L(0);
      if (dw === 1) return out;
      if (dw === 2) push("B", legs[0].toPrice, alen, P.bRetracements, -sign, 1, legs[0].duration || 10, P.durationRatios.b);
      var bend = dw === 2 ? steps[0].price : legs[1].toPrice;
      if (dw <= 3) push("C", bend, alen, P.cTargets, sign, dw === 3 ? 1 : 0.6, legs[0].duration || 10, P.durationRatios.c);
    }
    out.zones = clusterTargets(cands, atr, P, srZones);
    /* Pfad: nur die naechsten zwei Phasen, gestrichelt/PROJECTED. */
    var t = now, price = lastPrice;
    steps.slice(0, 3).forEach(function (st) {
      var next = calendar.offset(t, st.bars);
      out.path.push({ label: st.label, fromTime: t, toTime: next, fromPrice: C.round(price, 4), toPrice: C.round(st.price, 4), status: "PROJECTED" });
      t = next; price = st.price;
    });
    return out;
  }

  // ------------------------------------------------------------- Fit
  function fitOf(cand, ctx, graph) {
    var w = ctx.cfg.fitWeights, sm = cand.softMetrics, comp = {};
    var hardPassed = cand.hardRuleResults.filter(function (r) { return r.passed === true; }).length, hardTotal = cand.hardRuleResults.filter(function (r) { return r.passed !== null; }).length;
    comp.internalStructure = hardTotal ? hardPassed / hardTotal * (0.5 + 0.5 * cand.guidelineFit) : 0.5;
    var regime = ctx.structure ? ctx.structure.state.regime : "UNDETERMINED";
    var patternBull = cand.type === "IMPULSE" ? cand.sign > 0 : cand.sign < 0;   // Zigzag ist Korrektur gegen den Trend
    comp.higherDegreeConsistency = regime === "UNDETERMINED" || regime === "RANGE" || regime === "MIXED" ? 0.5 : (patternBull === (regime === "BULLISH") ? 1 : 0.2);
    var sigs = cand.legs.map(function (l) { var n = graph.nodes.filter(function (x) { return x.pivotId === l.toPivotId; })[0]; return n ? n.significance : 1; });
    comp.pivotQuality = C.clamp(mean(sigs) / 3, 0, 1);
    comp.proportionality = mean([sm.W3_EXTENSION_RATIO, sm.W5_RATIO_TO_W1, sm.C_RATIO_TO_A].filter(C.isNum)); if (!C.isNum(comp.proportionality)) comp.proportionality = 0.5;
    comp.marketStructure = ctx.structure ? C.clamp(0.5 + 0.5 * ctx.structure.state.structureScore * (patternBull ? 1 : -1), 0, 1) : 0.5;
    comp.momentumVolume = mean([sm.MOMENTUM_W3, sm.VOLUME_W3].filter(C.isNum)); if (!C.isNum(comp.momentumVolume)) comp.momentumVolume = 0.5;
    comp.alternationChannel = mean([sm.ALTERNATION, sm.CHANNEL_FIT].filter(C.isNum)); if (!C.isNum(comp.alternationChannel)) comp.alternationChannel = 0.5;
    comp.fibonacciFit = mean([sm.W2_RETRACE_RATIO, sm.W4_RETRACE_RATIO, sm.B_RETRACE_RATIO].filter(C.isNum)); if (!C.isNum(comp.fibonacciFit)) comp.fibonacciFit = 0.5;
    var fit = 0; Object.keys(w).forEach(function (k) { fit += w[k] * comp[k]; });
    var rounded = {}; Object.keys(comp).forEach(function (k) { rounded[k] = C.round(comp[k], 3); });
    return { fit: C.round(fit, 4), components: rounded };
  }

  // -------------------------------------------------------- Count bauen
  function buildCount(historyPatterns, trailing, ctx, graph, atr, calendar, now) {
    var waves = [];
    historyPatterns.forEach(function (p, pi) { wavesOf(p).forEach(function (w) { w.patternId = "pat_" + pi; waves.push(w); }); });
    var current = null, invalidation = null, projection = { zones: [], path: [] }, hard = [];
    if (trailing) {
      var tw = wavesOf(trailing, trailing.complete ? "CONFIRMED" : "DEVELOPING");
      tw.forEach(function (w) { w.patternId = "pat_trailing"; waves.push(w); });
      var labels = trailing.type === "IMPULSE" ? IMPULSE_LABELS : ZIGZAG_LABELS;
      current = trailing.complete
        ? { label: labels[labels.length - 1], patternType: trailing.type, status: "CONFIRMED", note: "Pattern abgeschlossen — naechste Phase erwartet" }
        : { label: labels[trailing.developingWave - 1], patternType: trailing.type, status: "DEVELOPING", direction: trailing.sign > 0 ? "UP" : "DOWN" };
      var invRaw = trailing.type === "IMPULSE" ? Rules.impulseInvalidation(trailing.legs, trailing.sign, trailing.complete ? 6 : trailing.developingWave) : Rules.zigzagInvalidation(trailing.legs, trailing.sign, trailing.complete ? 4 : trailing.developingWave);
      invalidation = invRaw && C.isNum(invRaw.price) ? { price: C.round(invRaw.price, 4), direction: invRaw.direction, ruleId: invRaw.ruleId, statement: invRaw.statement, kind: "analysisInvalidation" } : null;
      hard = trailing.hardRuleResults;
      if (!trailing.complete && invalidation) projection = project(trailing, atr, ctx.cfg, ctx.supportResistance ? ctx.supportResistance.zones : [], calendar, now);
      if (trailing.complete) {
        /* Nach abgeschlossenem Impuls: Korrekturzone 38.2–61.8 % des gesamten Impulses. */
        var start = trailing.legs[0].fromPrice, end = trailing.legs[trailing.legs.length - 1].toPrice, len = Math.abs(end - start), sign = trailing.sign;
        var cands = [0.382, 0.5, 0.618].map(function (r, k) { return { label: trailing.type === "IMPULSE" ? "ABC" : "next", price: end - sign * len * r, ratio: r, weight: k === 1 ? 1 : 0.7, source: "Korrektur " + r + " × Pattern" }; });
        projection = { zones: clusterTargets(cands, atr, ctx.cfg.projection, ctx.supportResistance ? ctx.supportResistance.zones : []), path: [] };
      }
    }
    var fit = trailing ? fitOf(trailing, ctx, graph) : { fit: 0, components: {} };
    return { countId: "ec_" + Hash.hashValue(waves.map(function (w) { return [w.label, w.toPivotId, w.status]; })), waves: waves, currentWave: current,
             invalidation: invalidation, projection: projection, hardRuleResults: hard, softMetrics: trailing ? trailing.softMetrics : {},
             fit: fit.fit, fitComponents: fit.components, trailingType: trailing ? trailing.type : null, trailingStart: trailing ? trailing.startOffset : null,
             trailingScore: trailing ? trailing.score : null, complete: trailing ? !!trailing.complete : false };
  }

  /** Vollstaendige Analyse fuer eine Skala (wird auch fuer Stability-Perturbationen benutzt). */
  function analyzeScale(ctx, pivotsResult, scaleId, calendar, now) {
    var graph = WaveGraph.buildSegmentGraph(ctx.series, ctx.features, pivotsResult, scaleId, ctx.cfg.degreeMapping);
    var legsAll = graph.segments;
    var offset = Math.max(0, legsAll.length - ctx.cfg.maxLegsConsidered);
    var legs = legsAll.slice(offset);
    var hist = parseHistory(legs, ctx.cfg, ctx.guidelines);
    var trailingStart = hist.consumed;
    /* Das letzte Pattern darf auch als Anfang des Trailing neu interpretiert werden — nur fuer Alternativen. */
    var lastPattern = hist.patterns[hist.patterns.length - 1] || null;
    var expectMotive = lastPattern ? lastPattern.type !== "IMPULSE" : null;
    var cands = trailingCandidates(legs, graph.developing, trailingStart, ctx.cfg, ctx.guidelines, expectMotive);
    return { graph: graph, legs: legs, offset: offset, history: hist, trailingStart: trailingStart, candidates: cands };
  }

  /**
   * @param {object} input { series, features, pivots, structure, momentum, volume, supportResistance, methodology }
   */
  function analyzeElliott(input) {
    var m = input.methodology || {};
    var cfg = Object.assign({}, DEFAULTS, {
      primaryDegreeScale: m.primaryDegreeScale || DEFAULTS.primaryDegreeScale, minConfirmedPivots: m.minConfirmedPivots || DEFAULTS.minConfirmedPivots,
      maxLegsConsidered: m.maxLegsConsidered || DEFAULTS.maxLegsConsidered, degreeMapping: (m.degreeMapping && typeof m.degreeMapping === "object") ? m.degreeMapping : DEFAULTS.degreeMapping,
      fitWeights: (m.scoring && m.scoring.fitWeights) || DEFAULTS.fitWeights, confidence: (m.scoring && m.scoring.confidence) || DEFAULTS.confidence,
      stabilityPerturbations: (m.scoring && m.scoring.stabilityPerturbations) || DEFAULTS.stabilityPerturbations,
      minPatternScoreForMap: (m.scoring && m.scoring.minPatternScoreForMap) || DEFAULTS.minPatternScoreForMap,
      alternativeMinSeparation: (m.scoring && m.scoring.alternativeMinSeparation) || DEFAULTS.alternativeMinSeparation,
      lowConfidenceBelow: (m.scoring && m.scoring.lowConfidenceBelow) || DEFAULTS.lowConfidenceBelow,
      projection: Object.assign({}, DEFAULTS.projection, m.projection || {}, { durationRatios: Object.assign({}, DEFAULTS.projection.durationRatios, (m.projection && m.projection.durationRatios) || {}) })
    });
    var guidelines = {};
    if (m.guidelines) { ["IMPULSE", "ZIGZAG"].forEach(function (t) { (m.guidelines[t] || []).forEach(function (g) { guidelines[g.guidelineId] = g; }); }); }
    var series = input.series, features = input.features, pivots = input.pivots;
    var i = series.length - 1, now = series.timestamps[i], atr = C.isNum(features.columns.atr[i]) ? features.columns.atr[i] : series.close[i] * 0.02;
    var Timeframe = isNode ? require("../timeframe.js") : global.VUTechnical.Timeframe;
    var calendar = Timeframe.createCalendar(series.timestamps);
    var ctx = { series: series, features: features, structure: input.structure, supportResistance: input.supportResistance, cfg: cfg, guidelines: guidelines };
    var base = { engineVersion: ENGINE_VERSION, methodologyVersion: m.methodologyVersion || "elliott-v1.0.0-beta", ruleSetVersion: Rules.RULE_SET_VERSION, repaintingPolicy: REPAINTING_POLICY,
                 parametersHash: Hash.hashValue({ v: ENGINE_VERSION, cfg: cfg }), family: "PROJECTION_AUXILIARY", role: "BETA", isProbability: false, asOf: now, asOfIndex: i };

    /* Degree waehlen: Primary-Degree-Skala, wenn sie eine projizierbare
       Struktur liefert (developing Welle >= 2 oder abgeschlossenes Pattern);
       sonst die naechstfeinere Skala mit genug Pivots. Degrees bleiben
       strukturell — die gewaehlte Skala wird als degreeScale ausgewiesen. */
    var scaleId = null, A = null, primaryTrailing = null, degrees = {};
    var order = [cfg.primaryDegreeScale].concat(cfg.fallbackDegreeScales);
    for (var oi = 0; oi < order.length; oi++) {
      var sid = order[oi];
      if (!pivots.scales[sid] || pivots.scales[sid].pivots.length < cfg.minConfirmedPivots) { degrees[sid] = { status: "TOO_FEW_PIVOTS" }; continue; }
      var R = analyzeScale(ctx, pivots, sid, calendar, now);
      var t = R.candidates[0] || null;
      var projectable = !!t && (t.complete || t.developingWave >= 2);
      degrees[sid] = { status: projectable ? "PROJECTABLE" : (t ? "FIRST_LEG_ONLY" : "NO_VALID_STRUCTURE"), patterns: R.history.patterns.length, currentWave: t ? (t.type === "IMPULSE" ? IMPULSE_LABELS : ZIGZAG_LABELS)[t.developingWave - 1] : null, patternType: t ? t.type : null };
      if (!scaleId && (projectable || oi === order.length - 1)) { scaleId = sid; A = R; primaryTrailing = t; }
      if (!scaleId && !projectable && !A) { A = R; primaryTrailing = t; }
    }
    if (!scaleId) {
      var firstOk = order.filter(function (sid2) { return degrees[sid2] && degrees[sid2].status !== "TOO_FEW_PIVOTS"; })[0];
      if (!firstOk) return Object.assign(base, { status: "UNAVAILABLE", reason: "TOO_FEW_PIVOTS", detail: "Weniger als " + cfg.minConfirmedPivots + " bestaetigte Pivots auf den Degree-Skalen", degrees: degrees, value: 0, confidence: null, primaryCount: null, alternativeCount: null, evidence: [] });
      scaleId = firstOk; A = analyzeScale(ctx, pivots, scaleId, calendar, now); primaryTrailing = A.candidates[0] || null;
    }
    if (!A.history.patterns.length && !primaryTrailing) return Object.assign(base, { status: "UNAVAILABLE", reason: "NO_VALID_STRUCTURE", degreeScale: scaleId, degreeIndex: A.graph.degreeIndex, value: 0, confidence: null, primaryCount: null, alternativeCount: null, historicalMap: { patterns: [], coverage: 0 }, evidence: [] });

    var primary = buildCount(A.history.patterns, primaryTrailing, ctx, A.graph, atr, calendar, now);

    /* Alternative: materiell anders (Typ oder aktuelle Welle), valide, nahe genug. */
    var alternative = null;
    for (var k = 1; k < A.candidates.length; k++) {
      var c = A.candidates[k];
      var different = !primaryTrailing || c.type !== primaryTrailing.type || c.developingWave !== primaryTrailing.developingWave || c.startOffset !== primaryTrailing.startOffset;
      if (!different) continue;
      var altHist = A.history.patterns.filter(function (p) { return true; });
      /* Wenn die Alternative frueher beginnt als das Trailing, ueberlappt sie das letzte Historienpattern — dieses wird dann verworfen. */
      var altPatterns = [], consumed = 0;
      for (var q = 0; q < altHist.length; q++) { if (consumed + altHist[q].legs.length <= c.startOffset) { altPatterns.push(altHist[q]); consumed += altHist[q].legs.length; } else break; }
      alternative = buildCount(altPatterns, c, ctx, A.graph, atr, calendar, now);
      if (primary.trailingScore !== null && alternative.trailingScore !== null && primary.trailingScore - alternative.trailingScore > 0.35) alternative = null;
      break;
    }

    /* Coverage: gewichtete Pivots, die von einem Pattern erklaert werden. */
    var explained = 0, total = 0;
    A.graph.nodes.slice(A.offset).forEach(function (n) {
      total += n.significance;
      if (primary.waves.some(function (w) { return w.toPivotId === n.pivotId || w.fromPivotId === n.pivotId; })) explained += n.significance;
    });
    var coverage = total ? C.round(explained / total, 3) : 0;

    /* Stability: Perturbation der Pivot-Schwelle → bleibt die aktuelle Welle? */
    var agree = 0, tries = 0;
    var scaleParams = pivots.scales[scaleId].params;
    cfg.stabilityPerturbations.forEach(function (mult) {
      if (mult === 1) { agree++; tries++; return; }
      var sc = { scaleId: scaleId, kAtr: scaleParams.kAtr * mult, minPct: scaleParams.minPct * mult };
      var r = Pivots.runScale(series, features.columns.atr, sc, series.dataHash);
      var pv2 = { scaleIds: [scaleId], scales: {}, hierarchy: pivots.hierarchy }; pv2.scales[scaleId] = Object.assign({ params: sc }, r);
      if (r.pivots.length < cfg.minConfirmedPivots) { tries++; return; }
      var B = analyzeScale(ctx, pv2, scaleId, calendar, now);
      var t2 = B.candidates[0];
      tries++;
      if (t2 && primaryTrailing && t2.type === primaryTrailing.type && t2.developingWave === primaryTrailing.developingWave) agree++;
    });
    var stability = tries ? C.round(agree / tries, 3) : 0;
    var ecs = C.round(cfg.confidence.fit * primary.fit + cfg.confidence.stability * stability, 4);
    var confidence = Math.round(ecs * 100);
    var ambiguous = alternative && primary.trailingScore !== null && alternative.trailingScore !== null && (primary.trailingScore - alternative.trailingScore) < cfg.alternativeMinSeparation;
    var status = confidence < cfg.lowConfidenceBelow ? "LOW_CONFIDENCE" : ambiguous ? "AMBIGUOUS" : "OK";
    if (!primary.currentWave) status = "LOW_CONFIDENCE";
    /* Ein einzelnes laufendes Leg ist weder Welle 1 noch A — ehrlich: unbestimmt. */
    var firstLegOnly = primaryTrailing && !primaryTrailing.complete && primaryTrailing.developingWave === 1;
    if (firstLegOnly) { status = "LOW_CONFIDENCE"; primary.currentWave.label = "1/A"; primary.currentWave.note = "erstes Leg — Impuls oder Korrektur noch nicht unterscheidbar"; }

    /* Aux-Wert fuer die Confluence-Familie (gekappt), Richtung aus dem Count. */
    var value = 0, dir = 0;
    if (primary.currentWave && primary.currentWave.status === "DEVELOPING" && primaryTrailing) {
      dir = primaryTrailing.type === "IMPULSE" ? primaryTrailing.sign : -primaryTrailing.sign;   // Zigzag: nach C wird der Trend erwartet
      if (primaryTrailing.type === "ZIGZAG" && primaryTrailing.developingWave < 3) dir = primaryTrailing.sign; // waehrend A/B laeuft die Korrektur
      value = C.round(0.3 * dir * confidence / 100 * (status === "OK" ? 1 : 0.5), 4);
    }
    var ev = [];
    if (primary.currentWave) ev.push(C.evidence(ENGINE_VERSION, "PROJECTION_AUXILIARY", "currentWave", "Elliott Beta: Welle " + primary.currentWave.label + " (" + primary.currentWave.patternType + ") " + primary.currentWave.status.toLowerCase() + ", Method Fit " + confidence + "/100", confidence, dir, 0.5));
    if (primary.invalidation) ev.push(C.evidence(ENGINE_VERSION, "PROJECTION_AUXILIARY", "invalidation", primary.invalidation.statement, primary.invalidation.price, 0, 0.25));
    if (alternative && alternative.currentWave) ev.push(C.evidence(ENGINE_VERSION, "PROJECTION_AUXILIARY", "alternative", "Alternative Count: Welle " + alternative.currentWave.label + " (" + alternative.currentWave.patternType + ")", alternative.trailingScore, 0, 0.25));

    return Object.assign(base, {
      status: status, reason: status === "OK" ? null : (firstLegOnly ? "FIRST_LEG_ONLY" : status), degreeScale: scaleId, degreeIndex: A.graph.degreeIndex, degrees: degrees,
      segmentGraph: { scaleId: scaleId, nodeCount: A.graph.nodes.length, segmentCount: A.graph.segments.length, developing: A.graph.developing ? { fromPivotId: A.graph.developing.fromPivotId, toTime: A.graph.developing.toTime, toPrice: A.graph.developing.toPrice, status: "DEVELOPING" } : null, graphHash: A.graph.graphHash, legsConsidered: A.legs.length, legsSkipped: A.offset },
      historicalMap: { patterns: A.history.patterns.map(function (p, k) { return { patternId: "pat_" + k, type: p.type, direction: p.sign > 0 ? "UP" : "DOWN", score: p.score, status: "CONFIRMED", waves: wavesOf(p).map(function (w) { return { label: w.label, toPivotId: w.toPivotId, toTime: w.toTime, toPrice: w.toPrice, confirmedAt: w.confirmedAt }; }), hardRuleResults: p.hardRuleResults, softMetrics: p.softMetrics }; }),
                       unlabeledLegs: A.history.unlabeled.length, coverage: coverage },
      primaryCount: primary, alternativeCount: alternative,
      candidateCount: A.candidates.length, candidates: A.candidates.slice(0, 5).map(function (c) { return { type: c.type, developingWave: c.developingWave, startOffset: c.startOffset, score: c.score, complete: !!c.complete, violations: c.violations }; }),
      confidence: confidence, confidenceType: "method_fit", fit: primary.fit, stability: stability, coverage: coverage, value: value, evidence: ev,
      abortConditions: { tooFewPivots: false, noValidStructure: false, ambiguous: !!ambiguous, dataGap: false },
      disclaimer: "Elliott Confidence " + confidence + "/100 = Method Fit. Keine Wahrscheinlichkeit."
    });
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, REPAINTING_POLICY: REPAINTING_POLICY, DEFAULTS: DEFAULTS, evaluate: evaluate, parseHistory: parseHistory, trailingCandidates: trailingCandidates, project: project, analyzeElliott: analyzeElliott };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Elliott = api; }
})(typeof window !== "undefined" ? window : globalThis);
