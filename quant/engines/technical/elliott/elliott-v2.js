/* =========================================================================
   VISION UNIVERSE TECHNICAL — elliott/elliott-v2.js
   ELLIOTT V2 — MULTI-DEGREE COUNT ENGINE

   Was V2 gegenueber V1 (elliott-engine.js) neu macht:

   1. VOLLE GRAMMATIK. Impuls, Leading/Ending Diagonal, Zigzag, Flat
      (regulaer/expandiert/running), Dreieck (kontrahierend/expandierend),
      Double Three (W-X-Y) und Double Zigzag — Regeln in patterns.js.
   2. ECHTE UNTERTEILUNG. Jedes Leg der Analyseskala wird auf der naechst-
      feineren Pivot-Skala zerlegt und gegen die Musterregeln GEPRUEFT
      (5 Unterwellen → ist das ein regelkonformer Impuls/Diagonal? 3 → eine
      regelkonforme Korrektur?). Eine Motivwelle, die sich sichtbar in drei
      Wellen gliedert, verliert Plausibilitaet. Die Pruefung ist durch die
      Aufloesung der feineren Skala begrenzt (1 sichtbares Leg = "nicht
      aufgeloest", neutral) — deshalb Evidenz, kein Gate.
   3. HOEHERER GRAD. Dieselbe Analyse laeuft auf der naechstgroeberen Skala;
      die aktuelle Welle dort bewertet, ob die Lesart der Analyseskala in
      den grossen Zusammenhang passt.
   4. KAUSALE AS-OF-SICHT. analyzeElliottV2({..., asOfIndex}) nutzt nur
      Pivots mit confirmedIndex <= asOfIndex und rekonstruiert das
      Developing-Extrem aus Bars <= asOfIndex. Keine Bar nach asOf wird
      gelesen (Test: identisch zur Analyse der abgeschnittenen Serie).
      Damit kann der Backtest Pivots EINMAL rechnen und Elliott an jedem
      Erkennungszeitpunkt billig neu auswerten.
   5. ZWEI INVALIDATIONS-NIVEAUS. hard (Regelbruch, Muster tot) und
      revision (Muster lebt, Wellenzuordnung aendert sich).
   6. KEINE WAHRSCHEINLICHKEIT. structuralScore = Rangwert der Lesart,
      clarity = Abstand zur besten materiell anderen Lesart. Empirische
      Trefferquoten kommen ausschliesslich aus der Evidence-Schicht.

   Historische Karte: kausaler Links-nach-rechts-Parser mit lokalen
   Entscheidungen (eine Position wird erst entschieden, wenn auch die
   laengste Alternative — 7 Legs — bewertbar ist; Unterteilungen werden zum
   Bestaetigungszeitpunkt des Legs eingefroren). Bestaetigte Labels werden
   dadurch nie umgeschrieben (Test EV2-NR).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../../hash.js") : global.VUHash;
  var P = isNode ? require("./patterns.js") : global.VUTechnical.ElliottPatterns;
  var S = isNode ? require("./sources.js") : (global.VUTechnical && global.VUTechnical.ElliottSources) || null;

  var ENGINE_VERSION = "elliott-2.2.0";
  var REPAINTING_POLICY = "CONFIRMS_WITH_DELAY";
  var MAX_PATTERN_LEGS = 7;

  var DEFAULTS = {
    analysisScale: null,                 // null = automatisch (siehe chooseScales)
    minLegs: 5,                          // so viele bestaetigte Legs braucht die Analyseskala
    trailingWindowLegs: 11,
    maxAlternatives: 2,
    rankWeights: { guidelines: 0.22, subdivision: 0.22, coverage: 0.14, higherDegree: 0.16, trendContext: 0.12, grammar: 0.09, prior: 0.05 },
    typePrior: { IMPULSE: 1, ZIGZAG: 1, FLAT: 0.8, TRIANGLE: 0.6, LEADING_DIAGONAL: 0.5, ENDING_DIAGONAL: 0.55, WXY: 0.6, DOUBLE_ZIGZAG: 0.6 },
    parser: { mdlPerLeg: 0.06, minScore: 0.45 },
    clarity: { high: 0.12, moderate: 0.05 },
    structural: { high: 0.68, moderate: 0.55 },
    clusterToleranceAtr: 0.6, minZoneHalfWidthAtr: 0.35,
    alternativeMinInvalidationGapAtr: 0.5,
    /* V2.1 — A-PRIORI festgelegt (vor jeder Ergebnisbetrachtung, siehe ELLIOTT_VALIDATION_REPORT §5):
       Count Quality = fachliche Guete der Zaehlung, KEINE Trefferwahrscheinlichkeit. */
    countQuality: { weights: { guidelines: 0.25, subdivision: 0.15, higherDegree: 0.2, proportion: 0.15, personality: 0.1, clarity: 0.15 },
                    high: 0.7, moderate: 0.55, clarityFull: 0.15 },
    applicability: { high: 0.62, moderate: 0.48, minSignalToNoise: 1.6 },
    coarserScalePreference: 0.03,
    /* "MULTI" (V2.2) oder "LEGACY" (V2.1: zweitgroebste Skala mit genug Legs) — fuer Vorher/Nachher-Vergleiche */
    scaleSelection: "MULTI", nestedHigherDegree: true,
    stickiness: 0.03
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function round(v, d) { var m = Math.pow(10, d === undefined ? 4 : d); return Math.round(v * m) / m; }
  function mean(a) { a = a.filter(isNum); return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  // =================================================================
  //  AS-OF PIVOT VIEW
  // =================================================================
  /**
   * Bestaetigte Pivots einer Skala, wie sie an Bar asOf bekannt waren,
   * plus das Developing-Extrem — ausschliesslich aus Bars <= asOf.
   * Entspricht dem Zustand der Pivot-State-Machine nach Bar asOf
   * (technical-pivots.test: Praefix-Identitaet).
   */
  function pivotView(series, pivots, scaleId, asOf) {
    var sc = pivots.scales[scaleId];
    if (!sc) return null;
    var conf = [];
    for (var k = 0; k < sc.pivots.length; k++) if (sc.pivots[k].confirmedIndex <= asOf) conf.push(sc.pivots[k]);
    var developing = null;
    if (conf.length) {
      /* Spiegelt die Pivot-Zustandsmaschine exakt (Review-Befund 9): Start am Bestaetigungsbar, davor nur
         strikt bessere Werte, danach nur strikt bessere — so stimmt der laufende Pivot mit pivotEngine ueberein. */
      var last = conf[conf.length - 1], ci = last.confirmedIndex, up = last.side === "LOW";
      var col = up ? series.high : series.low;
      var better = function (a, b) { return up ? a > b : a < b; };
      var idx = ci, px = col[ci];
      for (var i = last.pivotIndex + 1; i < ci; i++) if (better(col[i], px)) { px = col[i]; idx = i; }
      for (var j = ci + 1; j <= asOf; j++) if (better(col[j], px)) { px = col[j]; idx = j; }
      if (idx > last.pivotIndex) developing = { side: up ? "HIGH" : "LOW", pivotIndex: idx, pivotPrice: px, pivotTime: series.timestamps[idx], pivotId: "dev_" + scaleId + "_" + idx, status: "DEVELOPING" };
    }
    return { scaleId: scaleId, confirmed: conf, developing: developing };
  }

  // =================================================================
  //  LEGS + UNTERTEILUNG
  // =================================================================
  function makeLeg(series, a, b, status) {
    var vols = [], from = a.pivotIndex, to = b.pivotIndex;
    for (var i = from + 1; i <= to; i++) if (isNum(series.volume[i]) && series.volume[i] > 0) vols.push(series.volume[i]);
    var dur = Math.max(1, to - from);
    return { fromIndex: from, toIndex: to, fromTime: a.pivotTime, toTime: b.pivotTime, fromPrice: a.pivotPrice, toPrice: b.pivotPrice,
             fromPivotId: a.pivotId, toPivotId: b.pivotId, duration: dur, status: status, confirmedIndex: b.confirmedIndex === undefined ? null : b.confirmedIndex,
             perBar: Math.abs(b.pivotPrice - a.pivotPrice) / dur, meanVolume: vols.length >= dur * 0.6 ? mean(vols) : null };
  }
  function legsOf(series, view) {
    var legs = [], c = view.confirmed;
    for (var k = 1; k < c.length; k++) legs.push(makeLeg(series, c[k - 1], c[k], "CONFIRMED"));
    var developing = view.developing && c.length ? makeLeg(series, c[c.length - 1], view.developing, "DEVELOPING") : null;
    return { legs: legs, developing: developing };
  }

  /**
   * Zerlegt ein Leg der Analyseskala auf der feineren Skala. Nur feine
   * Pivots, die bis `knownAt` bestaetigt waren, zaehlen — fuer bestaetigte
   * Legs ist knownAt die Bestaetigung des Leg-Endes (eingefroren, damit die
   * historische Karte nicht repainted).
   */
  function subdivide(series, finePivots, leg, knownAt) {
    if (!finePivots) return null;
    var up = leg.toPrice > leg.fromPrice;
    var inner = [];
    for (var k = 0; k < finePivots.length; k++) {
      var p = finePivots[k];
      if (p.pivotIndex <= leg.fromIndex || p.pivotIndex >= leg.toIndex || p.confirmedIndex > knownAt) continue;
      inner.push(p);
    }
    /* Alternation erzwingen: gleiche Seiten zusammenfassen (Extrem behalten). */
    var seq = [];
    inner.forEach(function (p) {
      var last = seq[seq.length - 1];
      if (last && last.side === p.side) { if ((p.side === "HIGH" && p.pivotPrice > last.pivotPrice) || (p.side === "LOW" && p.pivotPrice < last.pivotPrice)) seq[seq.length - 1] = p; }
      else seq.push(p);
    });
    var firstSide = up ? "HIGH" : "LOW", lastSide = up ? "LOW" : "HIGH";
    while (seq.length && seq[0].side !== firstSide) seq.shift();
    while (seq.length && seq[seq.length - 1].side !== lastSide) seq.pop();
    /* Innere Extreme muessen innerhalb der Leg-Spanne liegen. */
    var lo = Math.min(leg.fromPrice, leg.toPrice), hi = Math.max(leg.fromPrice, leg.toPrice);
    seq = seq.filter(function (p) { return p.pivotPrice > lo && p.pivotPrice < hi; });
    var pts = [{ pivotIndex: leg.fromIndex, pivotPrice: leg.fromPrice, pivotId: leg.fromPivotId, pivotTime: leg.fromTime }].concat(seq)
      .concat([{ pivotIndex: leg.toIndex, pivotPrice: leg.toPrice, pivotId: leg.toPivotId, pivotTime: leg.toTime }]);
    /* Nach dem Filtern kann die Alternation brechen → erneut bereinigen. */
    var clean = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var prev = clean[clean.length - 1], d = pts[i].pivotPrice - prev.pivotPrice;
      var prevDir = clean.length >= 2 ? Math.sign(prev.pivotPrice - clean[clean.length - 2].pivotPrice) : 0;
      if (prevDir !== 0 && Math.sign(d) === prevDir) clean[clean.length - 1] = pts[i]; else clean.push(pts[i]);
    }
    var count = clean.length - 1;
    var sub = { count: count, cls: "?", motiveValid: false, correctiveValid: false, pattern: null };
    if (count < 3) return sub;
    var subLegs = [];
    for (var j = 1; j < clean.length; j++) subLegs.push({ fromIndex: clean[j - 1].pivotIndex, toIndex: clean[j].pivotIndex, fromPrice: clean[j - 1].pivotPrice, toPrice: clean[j].pivotPrice, duration: Math.max(1, clean[j].pivotIndex - clean[j - 1].pivotIndex), status: "CONFIRMED" });
    if (count === 5) {
      ["IMPULSE", "LEADING_DIAGONAL", "ENDING_DIAGONAL"].some(function (t) { var e = P.evaluate(t, subLegs); if (e && e.valid) { sub.motiveValid = true; sub.pattern = t; return true; } return false; });
      if (!sub.motiveValid) { var tri = P.evaluate("TRIANGLE", subLegs); if (tri && tri.valid) { sub.correctiveValid = true; sub.pattern = "TRIANGLE"; } }
      sub.cls = sub.motiveValid ? "M" : sub.correctiveValid ? "K" : "?";
    } else if (count === 3) {
      ["ZIGZAG", "FLAT"].some(function (t) { var e = P.evaluate(t, subLegs); if (e && e.valid) { sub.correctiveValid = true; sub.pattern = t; return true; } return false; });
      sub.cls = "K";
    } else if (count === 7) { sub.cls = "K"; sub.pattern = "COMBINATION"; }
    else if (count === 9) { sub.cls = "M"; sub.pattern = "EXTENDED_IMPULSE"; }
    else sub.cls = "?";
    return sub;
  }

  /** Passung einer beobachteten Unterteilung zur erwarteten (M, K oder MK). */
  function subdivisionFit(expected, sub) {
    if (!sub || sub.count < 3 || sub.cls === "?") return 0.5;
    var m = sub.cls === "M" ? (sub.motiveValid ? 1 : 0.8) : 0.12;
    var k = sub.cls === "K" ? (sub.correctiveValid ? 1 : sub.count === 7 ? 0.85 : 0.75) : 0.15;
    return expected === "M" ? m : expected === "K" ? k : Math.max(m, k);
  }

  // =================================================================
  //  BEWERTUNG EINES KANDIDATEN
  // =================================================================
  function scoreCandidate(type, legs, ctx) {
    var e = P.evaluate(type, legs);
    if (!e || !e.valid) return e;
    var spec = P.PATTERNS[type];
    var subs = legs.map(function (l, k) { return l.status === "DEVELOPING" ? null : subdivisionFit(spec.subdivision[k], l.sub); }).filter(isNum);
    e.subdivisionFit = subs.length ? mean(subs) : 0.5;
    e.subdivisionDetail = legs.map(function (l, k) { return { wave: spec.labels[k], expected: spec.subdivision[k], observed: l.sub ? l.sub.count : null, observedClass: l.sub ? l.sub.cls : null, pattern: l.sub ? l.sub.pattern : null, fit: l.status === "DEVELOPING" ? null : round(subdivisionFit(spec.subdivision[k], l.sub), 3) }; });
    e.prior = (ctx.cfg.typePrior[type] === undefined ? 0.6 : ctx.cfg.typePrior[type]);
    return e;
  }

  // =================================================================
  //  HISTORISCHE KARTE (kausaler Parser)
  // =================================================================
  function parseHistory(legs, ctx) {
    var patterns = [], pos = 0, expectMotive = null, unlabeled = 0, consumed = 0;
    while (pos + MAX_PATTERN_LEGS <= legs.length) {
      var options = [];
      (P.TYPES_V2 || P.TYPES).forEach(function (t) {
        var w = P.PATTERNS[t].waves;
        if (pos + w > legs.length) return;
        var e = scoreCandidate(t, legs.slice(pos, pos + w), ctx);
        if (!e || !e.valid) return;
        var g = isNum(e.guidelineFit) ? e.guidelineFit : 0.5;
        e.score = 0.55 * g + 0.45 * e.subdivisionFit;
        if (e.score < ctx.cfg.parser.minScore) return;
        e.rank = e.score + ctx.cfg.parser.mdlPerLeg * w + 0.08 * e.prior;
        if (expectMotive === true && e.family === "MOTIVE") e.rank += 0.1;
        if (expectMotive === false && e.family === "CORRECTIVE") e.rank += 0.1;
        options.push(e);
      });
      if (!options.length) { pos += 1; unlabeled += 1; expectMotive = null; continue; }
      options.sort(function (a, b) { return b.rank - a.rank || (a.type < b.type ? -1 : 1); });
      var best = options[0];
      best.startLeg = pos;
      patterns.push(best);
      pos += best.legs.length; consumed = pos;
      expectMotive = best.family !== "MOTIVE";
    }
    return { patterns: patterns, consumed: consumed, unlabeledLegs: unlabeled };
  }

  // =================================================================
  //  TRAILING-KANDIDATEN
  // =================================================================
  /** Rolle der aktuellen Welle: Motiv (in Musterrichtung) oder Korrektur. */
  function currentRole(type, dw) {
    var spec = P.PATTERNS[type];
    var code = spec.subdivision[dw - 1];
    if (type === "IMPULSE" || type.indexOf("DIAGONAL") >= 0) return dw % 2 === 1 ? "MOTIVE" : "CORRECTIVE";
    if (type === "TRIANGLE" || type === "WXY") return "CORRECTIVE";
    return code === "M" ? "MOTIVE" : "CORRECTIVE";
  }
  /** Richtung der aktuell laufenden Welle (+1/−1). */
  function waveDirection(sign, dw) { return dw % 2 === 1 ? sign : -sign; }
  /** Uebergeordneter Trend, den das Muster impliziert. */
  function impliedTrend(e) { return e.family === "MOTIVE" ? e.sign : -e.sign; }

  /**
   * V2.2 — Eltern-Kind-Konsistenz (EWP Kap. 1 "Degree"; NEoWave "Similarity"): Die Lesart der Analyseskala muss
   * IN die Welle des hoeheren Grades passen, die ihren Zeitraum enthaelt — Richtung gleich, Musterfamilie passend
   * zur erwarteten Unterteilung dieser Welle (M = Motiv, K = Korrektur). Ein Muster, das ueber mehrere Wellen des
   * hoeheren Grades reicht, ist schlecht verschachtelt.
   */
  function nestedFit(e, higher) {
    if (!higher || !higher.waveSpecs || !higher.waveSpecs.length) return null;
    var a = e.waves[0].fromIndex, b = e.waves[e.waves.length - 1].toIndex, span = Math.max(1, b - a);
    var best = null, bestOv = 0;
    higher.waveSpecs.forEach(function (w) { var ov = Math.min(b, w.toIndex) - Math.max(a, w.fromIndex); if (ov > bestOv) { bestOv = ov; best = w; } });
    if (!best) return 0.3;
    var r = Math.min(1, bestOv / span);
    var dirOk = e.sign === best.dir, fam = e.family;
    var match = best.expected === "M" ? (fam === "MOTIVE" && dirOk ? 1 : dirOk ? 0.45 : 0.1)
              : best.expected === "K" ? (fam === "CORRECTIVE" && dirOk ? 1 : dirOk ? 0.5 : fam === "CORRECTIVE" ? 0.35 : 0.15)
              : (dirOk ? 0.9 : 0.25);
    return r * match + (1 - r) * 0.3;
  }
  function higherDegreeFit(e, dw, complete, higher) {
    var nf = higher && higher.nested === false ? null : nestedFit(e, higher);
    if (isNum(nf)) return nf;
    if (!higher || !higher.current) return 0.5;
    var H = higher.current.direction, role = higher.current.role;
    var moveDir = complete ? -waveDirection(e.sign, e.waves.length) : waveDirection(e.sign, dw);
    var motive = e.family === "MOTIVE";
    if (role === "MOTIVE") {
      if (motive && e.sign === H) return 1;
      if (!motive && e.sign === -H) return 0.8;
      if (moveDir === H) return 0.55;
      return 0.25;
    }
    if (!motive && e.sign === H) return 1;
    if (motive && e.sign === H) return 0.8;
    if (!motive && e.sign === -H) return 0.6;
    return 0.35;
  }

  function trailingCandidates(all, histEnd, lastHistPattern, ctx, higher) {
    var out = [], n = all.length, cfg = ctx.cfg;
    var hasDev = n && all[n - 1].status === "DEVELOPING";
    var confirmedN = hasDev ? n - 1 : n;
    var minStart = Math.max(0, n - cfg.trailingWindowLegs);
    var expectMotive = lastHistPattern ? lastHistPattern.family !== "MOTIVE" : null;
    function push(type, s, k, complete) {
      var legs = all.slice(s, s + k);
      var e = scoreCandidate(type, legs, ctx);
      if (!e || !e.valid) return;
      /* Eine Diagonale ist erst unterscheidbar, wenn ihr Definitionsmerkmal
         (W4 ueberlappt W1) sichtbar ist — vorher waere sie nur eine
         Kopie der Impuls-Lesart mit anderem Namen. */
      if (type.indexOf("DIAGONAL") >= 0 && !e.rules.some(function (r) { return r.ruleId === "DIAGONAL_W4_OVERLAPS_W1" && r.passed === true; })) return;
      var spec = P.PATTERNS[type], dw = complete ? spec.waves : k;
      e.startLeg = s; e.developingWave = dw; e.complete = complete; e.waves = legs;
      var explained = complete ? k + (hasDev ? 0 : 0) : k;
      var tailLegs = confirmedN - Math.max(s, histEnd) + (hasDev ? 1 : 0);
      var unexplained = Math.max(0, (s > histEnd ? s - histEnd : 0));
      e.components = {
        guidelines: isNum(e.guidelineFit) ? e.guidelineFit : 0.5,
        subdivision: e.subdivisionFit,
        coverage: Math.max(0, Math.min(1, explained / 5) - 0.15 * unexplained),
        trendContext: ctx.trendDir === 0 ? 0.5 : (impliedTrend(e) === ctx.trendDir ? 1 : 0.2),
        higherDegree: higherDegreeFit(e, dw, complete, higher),
        grammar: s === histEnd ? (expectMotive === null ? 0.5 : ((e.family === "MOTIVE") === expectMotive ? 1 : 0.3)) : (s < histEnd ? 0.45 : 0.4),
        prior: e.prior
      };
      void tailLegs;
      var r = 0; Object.keys(cfg.rankWeights).forEach(function (key) { r += cfg.rankWeights[key] * e.components[key]; });
      /* Ein einzelnes laufendes Leg traegt kaum Struktur — ehrlich abwerten. */
      if (!complete && k === 1) r *= 0.75;
      e.rank = round(r, 4);
      out.push(e);
    }
    for (var s = minStart; s < n; s++) {
      (P.TYPES_V2 || P.TYPES).forEach(function (t) {
        var w = P.PATTERNS[t].waves, k = n - s;
        if (k >= 1 && k <= w) push(t, s, k, false);
        /* abgeschlossen am letzten bestaetigten Leg, das laufende Leg beginnt das Folgende */
        if (hasDev && confirmedN - s === w) push(t, s, w, true);
        if (!hasDev && n - s === w) push(t, s, w, true);
      });
    }
    out.sort(function (a, b) { return b.rank - a.rank || a.startLeg - b.startLeg || (a.type < b.type ? -1 : 1); });
    return out;
  }

  // =================================================================
  //  PROJEKTION → ZONEN
  // =================================================================
  function clusterZones(items, atr, cfg) {
    var tol = cfg.clusterToleranceAtr * atr, half = cfg.minZoneHalfWidthAtr * atr;
    var groups = {};
    items.filter(function (x) { return x.kind !== "CAP"; }).forEach(function (x) { (groups[x.phase + "|" + x.kind] = groups[x.phase + "|" + x.kind] || []).push(x); });
    var zones = [];
    Object.keys(groups).forEach(function (g) {
      var arr = groups[g].slice().sort(function (a, b) { return a.price - b.price; }), cur = null;
      arr.forEach(function (x) {
        if (cur && x.price - cur.hi <= tol) { cur.items.push(x); cur.hi = x.price; }
        else { cur = { items: [x], lo: x.price, hi: x.price, phase: x.phase, kind: x.kind }; zones.push(cur); }
      });
    });
    return zones.map(function (z) {
      var w = z.items.reduce(function (a, x) { return a + x.weight; }, 0);
      var center = z.items.reduce(function (a, x) { return a + x.price * x.weight; }, 0) / Math.max(1e-9, w);
      var lo = Math.min(z.lo, center - half), hi = Math.max(z.hi, center + half);
      return { phase: z.phase, kind: z.kind, zoneLow: round(lo, 4), zoneHigh: round(hi, 4), center: round(center, 4), weight: round(w, 3), confluence: z.items.length,
               relations: z.items.map(function (x) { return x.relation; }), status: "PROJECTED" };
    }).sort(function (a, b) { return b.weight - a.weight; });
  }

  // =================================================================
  //  COUNT-OBJEKT
  // =================================================================
  function labelWaves(e, degreeNotation) {
    var spec = P.PATTERNS[e.type];
    var labels = spec.displayLabels || spec.labels;
    return e.waves.map(function (l, k) {
      return { label: labels[k], notation: notate(labels[k], degreeNotation), fromIndex: l.fromIndex, toIndex: l.toIndex, fromTime: l.fromTime, toTime: l.toTime,
               fromPrice: round(l.fromPrice, 4), toPrice: round(l.toPrice, 4), toPivotId: l.toPivotId, status: l.status, confirmedIndex: l.confirmedIndex,
               subdivision: l.sub ? { count: l.sub.count, class: l.sub.cls, pattern: l.sub.pattern } : null };
    });
  }
  /** Relative Grad-Notation: hoeherer Grad (1), Analysegrad 1, tieferer Grad i. */
  function notate(label, degree) {
    var roman = { "1": "i", "2": "ii", "3": "iii", "4": "iv", "5": "v", A: "a", B: "b", C: "c", D: "d", E: "e", W: "w", X: "x", Y: "y" };
    if (degree === "HIGHER") return "(" + label + ")";
    if (degree === "LOWER") return roman[label] || label.toLowerCase();
    return label;
  }

  var PATTERN_NAMES_DE = {
    IMPULSE: "Impuls", LEADING_DIAGONAL: "Leading Diagonal", ENDING_DIAGONAL: "Ending Diagonal", ZIGZAG: "Zigzag", FLAT: "Flat",
    TRIANGLE: "Dreieck", WXY: "Doppelte Korrektur (W-X-Y)", DOUBLE_ZIGZAG: "Doppel-Zigzag", TRIPLE_ZIGZAG: "Dreifach-Zigzag"
  };

  /** Identitaet einer Lesart ueber die Zeit: Muster, Startpivot, Richtung (unabhaengig von der laufenden Welle). */
  function candidateKey(e) { return e.type + "|" + e.waves[0].fromIndex + "|" + e.sign; }
  function buildCountId(e) { return "ev2_" + Hash.hashValue({ t: e.type, s: e.startLeg, dw: e.developingWave, c: e.complete, p: e.waves.map(function (l) { return [l.fromIndex, l.toIndex]; }) }).slice(0, 12); }
  function buildCount(e, ctx, atr) {
    var spec = P.PATTERNS[e.type], dw = e.developingWave;
    var inv = e.complete ? { hard: null, revision: null } : P.invalidation(e.type, e.waves, dw);
    if (e.complete) {
      /* Nach abgeschlossenem Muster: das Muster-Ende ist die Revisionsgrenze der Folgewelle. */
      var endP = e.waves[e.waves.length - 1].toPrice, nextDir = -waveDirection(e.sign, spec.waves);
      inv.revision = { price: endP, direction: nextDir > 0 ? "below" : "above", ruleId: "PATTERN_END", statement: "jenseits des Musterendes ist das Muster nicht abgeschlossen" };
    }
    var proj = P.projections(e.type, e.waves, dw, e.complete);
    var caps = proj.filter(function (x) { return x.kind === "CAP"; });
    var role = e.complete ? "COMPLETE" : currentRole(e.type, dw);
    var curDir = e.complete ? -waveDirection(e.sign, spec.waves) : waveDirection(e.sign, dw);
    /* Erwartete naechste Bewegung nach Abschluss der laufenden Welle. */
    var nextDir = e.complete ? curDir : (dw === spec.waves ? -curDir : -curDir);
    var labels = spec.displayLabels || spec.labels;
    var count = {
      countId: buildCountId(e),
      pattern: e.type, patternName: PATTERN_NAMES_DE[e.type], family: e.family, variant: e.variant, direction: e.sign > 0 ? "UP" : "DOWN",
      impliedTrend: impliedTrend(e) > 0 ? "UP" : "DOWN",
      complete: !!e.complete,
      currentWave: e.complete ? { label: "nach " + labels[labels.length - 1], role: "COMPLETE", direction: curDir > 0 ? "UP" : "DOWN", status: "DEVELOPING" }
                              : { label: labels[dw - 1], role: role, direction: curDir > 0 ? "UP" : "DOWN", status: "DEVELOPING", wave: dw, of: spec.waves },
      nextMove: nextDir > 0 ? "UP" : "DOWN",
      waves: labelWaves(e, "ANALYSIS"),
      rules: e.rules, openRules: e.openRules, guidelines: roundMap(e.guidelines), subdivision: e.subdivisionDetail,
      /* Ohne harte Grenze (expandierendes Dreieck) ist die Revisionsgrenze die einzige pruefbare Grenze der Lesart. */
      invalidation: inv.hard ? Object.assign({}, inv.hard, { price: round(inv.hard.price, 4), kind: "HARD_RULE" })
        : (!e.complete && inv.revision ? Object.assign({}, inv.revision, { price: round(inv.revision.price, 4), kind: "REVISION" }) : null),
      revision: inv.revision ? Object.assign({}, inv.revision, { price: round(inv.revision.price, 4), kind: "REVISION" }) : null,
      caps: caps.map(function (c) { return { price: round(c.price, 4), relation: c.relation }; }),
      projection: { candidates: proj.filter(function (x) { return x.kind !== "CAP"; }).map(function (x) { return { phase: x.phase, kind: x.kind, price: round(x.price, 4), ratio: x.ratio, relation: x.relation, weight: x.weight }; }), zones: clusterZones(proj, atr, ctx.cfg) },
      rank: e.rank, rankComponents: roundMap(e.components), source: spec.source
    };
    return count;
  }
  function roundMap(m) { var o = {}; Object.keys(m || {}).forEach(function (k) { o[k] = isNum(m[k]) ? round(m[k], 3) : m[k]; }); return o; }

  /** Zwei Counts sind materiell verschieden, wenn Muster/Welle/naechste Bewegung oder Invalidation abweichen. */
  function materiallyDifferent(a, b, atr, cfg) {
    /* Leading/Ending Diagonal mit identischen Wellen sind dieselbe Geometrie — nur die Lage im hoeheren Grad unterscheidet sie. */
    var fam = function (x) { return x.pattern.indexOf("DIAGONAL") >= 0 ? "DIAGONAL" : x.pattern; };
    var sameWaves = a.waves.length === b.waves.length && a.waves.every(function (w, k) { return w.toIndex === b.waves[k].toIndex && w.fromIndex === b.waves[k].fromIndex; });
    if (fam(a) === "DIAGONAL" && fam(b) === "DIAGONAL" && sameWaves) return false;
    if (a.pattern !== b.pattern || a.currentWave.label !== b.currentWave.label || a.nextMove !== b.nextMove || a.complete !== b.complete) return true;
    var ia = a.invalidation ? a.invalidation.price : null, ib = b.invalidation ? b.invalidation.price : null;
    if ((ia === null) !== (ib === null)) return true;
    return ia !== null && Math.abs(ia - ib) > cfg.alternativeMinInvalidationGapAtr * atr;
  }

  // =================================================================
  //  EINE SKALA ANALYSIEREN
  // =================================================================
  function analyzeScale(series, pivots, scaleId, lowerScaleId, asOf, ctx, higher) {
    var view = pivotView(series, pivots, scaleId, asOf);
    if (!view) return null;
    var lp = legsOf(series, view);
    var fine = lowerScaleId && pivots.scales[lowerScaleId] ? pivots.scales[lowerScaleId].pivots : null;
    lp.legs.forEach(function (l) { l.sub = subdivide(series, fine, l, l.confirmedIndex); });
    if (lp.developing) lp.developing.sub = subdivide(series, fine, lp.developing, asOf);
    var hist = parseHistory(lp.legs, ctx);
    var all = lp.developing ? lp.legs.concat([lp.developing]) : lp.legs.slice();
    var last = hist.patterns[hist.patterns.length - 1] || null;
    var cands = all.length ? trailingCandidates(all, hist.consumed, last, ctx, higher) : [];
    return { scaleId: scaleId, view: view, legs: lp.legs, developing: lp.developing, history: hist, candidates: cands };
  }

  /** Grad-Skalen waehlen: groesste Skala mit genug Legs = Analysegrad. */
  function chooseScales(pivots, asOf, cfg) {
    var ids = pivots.scaleIds;
    if (cfg.analysisScale) {
      var ix = ids.indexOf(cfg.analysisScale);
      return { analysis: cfg.analysisScale, lower: ix > 0 ? ids[ix - 1] : null, higher: ix < ids.length - 1 ? ids[ix + 1] : null };
    }
    /* Bevorzugt die zweitgroebste Skala mit genug Legs, damit ein hoeherer
       Grad als Kontext existiert; die groebste nur als Rueckfall. */
    function legsAt(id) { var n = 0; pivots.scales[id].pivots.forEach(function (p) { if (p.confirmedIndex <= asOf) n++; }); return n - 1; }
    for (var k = ids.length - 2; k >= 0; k--) {
      if (legsAt(ids[k]) >= cfg.minLegs + 3) return { analysis: ids[k], lower: k > 0 ? ids[k - 1] : null, higher: legsAt(ids[k + 1]) >= 3 ? ids[k + 1] : null };
    }
    if (legsAt(ids[ids.length - 1]) >= cfg.minLegs) return { analysis: ids[ids.length - 1], lower: ids.length > 1 ? ids[ids.length - 2] : null, higher: null };
    return { analysis: ids[0], lower: null, higher: ids.length > 1 ? ids[1] : null };
  }

  /**
   * Langfristiger Trendkontext an asOf (kausal): Vorzeichen der 1-Jahres-
   * Rendite, nur wenn der Kurs zugleich auf derselben Seite seines
   * 1-Jahres-Mittels liegt; sonst 0 (kein klarer Trend).
   */
  function trendDirection(series, asOf, barsPerYear) {
    var bpy = barsPerYear || (series.timeframe === "1W" ? 52 : series.timeframe === "1M" ? 12 : 252);
    if (asOf < bpy) return 0;
    var c = series.close, ret = Math.log(c[asOf] / c[asOf - bpy]), sum = 0;
    for (var i = asOf - bpy + 1; i <= asOf; i++) sum += c[i];
    var avg = sum / bpy;
    if (ret > 0 && c[asOf] > avg) return 1;
    if (ret < 0 && c[asOf] < avg) return -1;
    return 0;
  }

  // =================================================================
  //  V2.1: COUNT QUALITY, ERKENNUNGSVERZUG, ANWENDBARKEIT, KANDIDATENBAUM
  // =================================================================
  /** Zeitproportion: aufeinanderfolgende Wellen desselben Grades haben vergleichbare Dauer (EWP Kap. 2 "Proportion"). */
  function proportionScore(legs) {
    var sc = [];
    for (var k = 1; k < legs.length; k++) {
      if (legs[k].status === "DEVELOPING") continue;
      sc.push(P.band(legs[k].duration / Math.max(1, legs[k - 1].duration), [0.382, 2.618], [0.2, 5]));
    }
    return sc.length ? mean(sc) : null;
  }
  /** Wellencharakter: W5-Momentum-Divergenz gegenueber W3 (EWP Kap. 2 "Wave Personality") — nur Impuls/Diagonale. */
  function personalityScore(e, features) {
    if (!features || !features.columns.rsi14 || !(e.family === "MOTIVE") || e.waves.length < 5) return null;
    var r3 = features.columns.rsi14[e.waves[2].toIndex], r5 = features.columns.rsi14[e.waves[4].toIndex];
    if (!isNum(r3) || !isNum(r5)) return null;
    return e.sign * (r3 - r5) > 0 ? 1 : 0.4;
  }
  function countQuality(e, count, clarity, features, cfg) {
    /* Harte Regeln und Definitionen sind nie kompensierbar: jede Verletzung → UNGUELTIG, kein Score. */
    if ((e.rules || []).some(function (r) { return r.passed === false; })) return { score: null, level: "INVALID", components: {}, note: "Mindestens eine Regel oder Definition ist verletzt — die Zählung ist ungültig." };
    var q = cfg.countQuality, comp = {
      guidelines: isNum(e.guidelineFit) ? e.guidelineFit : null,
      subdivision: isNum(e.subdivisionFit) ? e.subdivisionFit : null,
      higherDegree: e.components ? e.components.higherDegree : null,
      proportion: proportionScore(e.waves),
      personality: personalityScore(e, features),
      clarity: isNum(clarity) ? Math.max(0, Math.min(1, clarity / q.clarityFull)) : null
    };
    var num = 0, den = 0;
    Object.keys(q.weights).forEach(function (k) { if (isNum(comp[k])) { num += q.weights[k] * comp[k]; den += q.weights[k]; } });
    var score = den ? num / den : null;
    return { score: isNum(score) ? round(score, 3) : null, level: !isNum(score) ? "UNKNOWN" : score >= q.high ? "HIGH" : score >= q.moderate ? "MODERATE" : "LOW",
             components: roundMap(comp), note: "Fachliche Guete der Zaehlung (Regeln, Richtlinien, Unterteilung, Grad, Proportion, Charakter, Eindeutigkeit) — keine Trefferwahrscheinlichkeit." };
  }
  /**
   * Erkennungsverzug der juengsten bestaetigten Welle: Wellenende (Pivot-Bar), fruehestmoegliche Bestaetigung
   * (feinste Skala, gleiches Extrem ±1 Bar) und Bestaetigung auf der Analyseskala (= wann die Engine die Welle als
   * abgeschlossen fuehrt).
   */
  function detectionLatency(count, pivots, series, asOf) {
    var conf = count.waves.filter(function (w) { return w.status === "CONFIRMED"; });
    if (!conf.length) return null;
    var w = conf[conf.length - 1], finest = pivots.scales[pivots.scaleIds[0]];
    var earliest = null;
    /* Review-Fix: nur Pivots, die bis asOf bestaetigt waren (sonst Blick in die Zukunft). */
    if (finest) finest.pivots.forEach(function (p) { if (p.confirmedIndex <= asOf && Math.abs(p.pivotIndex - w.toIndex) <= 1 && Math.abs(p.pivotPrice - w.toPrice) <= Math.abs(w.toPrice) * 0.005 && (earliest === null || p.confirmedIndex < earliest)) earliest = p.confirmedIndex; });
    var ci = w.confirmedIndex, dir = w.toPrice < w.fromPrice ? 1 : -1;   // Folgebewegung nach dem Wellenende
    var px = isNum(ci) ? series.close[ci] : null;
    return { wave: w.label, waveEndIndex: w.toIndex, waveEndTime: w.toTime, earliestConfirmIndex: earliest, engineConfirmIndex: ci,
             barsToEarliest: isNum(earliest) ? earliest - w.toIndex : null, barsToEngine: isNum(ci) ? ci - w.toIndex : null,
             avoidableDelayBars: isNum(earliest) && isNum(ci) ? Math.max(0, ci - earliest) : null,
             moveAtEngineConfirmPct: isNum(px) ? round(dir * (px / w.toPrice - 1), 4) : null };
  }
  /**
   * Signal/Rauschen der Analyseskala: Median von |Leg| / Umkehrschwelle der Skala (max(minPct·Kurs, kAtr·ATR)) ueber
   * die letzten 8 bestaetigten Legs. Legs, die die Schwelle kaum ueberschreiten, sind von Rauschen nicht zu
   * unterscheiden (a priori: ≤ 1,3 → 0, ≥ 3 → 1).
   */
  function signalToNoise(series, features, pivots, scaleId, asOf) {
    var sc = pivots.scales[scaleId]; if (!sc || !sc.params) return null;
    var pv = sc.pivots.filter(function (p) { return p.confirmedIndex <= asOf; }).slice(-9), r = [];
    for (var k = 1; k < pv.length; k++) {
      var atr = features && features.columns.atr ? features.columns.atr[pv[k].pivotIndex] : null;
      var thr = Math.max(sc.params.minPct * pv[k].pivotPrice, isNum(atr) ? sc.params.kAtr * atr : 0);
      if (thr > 0) r.push(Math.abs(pv[k].pivotPrice - pv[k - 1].pivotPrice) / thr);
    }
    if (r.length < 3) return null;
    r.sort(function (a, b) { return a - b; });
    var med = r[Math.floor(r.length / 2)];
    return { ratio: round(med, 3), score: round(Math.max(0, Math.min(1, (med - 1.3) / 1.7)), 3) };
  }
  /** Preisproportion gleicher Grade: Anteil benachbarter bestaetigter Wellenpaare, deren kleinere >= 1/3 der groesseren ist. */
  function priceSimilarity(legs) {
    var ok = 0, n = 0;
    for (var k = 1; k < legs.length; k++) {
      if (legs[k].status === "DEVELOPING") continue;
      var a = Math.abs(legs[k].toPrice - legs[k].fromPrice), b = Math.abs(legs[k - 1].toPrice - legs[k - 1].fromPrice);
      n++; if (Math.min(a, b) >= Math.max(a, b) / 3) ok++;
    }
    return n ? ok / n : null;
  }
  var FIB_GUIDES = ["W2_RETRACEMENT", "W3_EXTENSION", "W4_RETRACEMENT", "W5_PROPORTION", "B_RETRACEMENT", "C_PROPORTION", "B_PROPORTION", "LEG_RATIOS", "X_PROPORTION", "Y_PROPORTION", "W2_DEEP", "W4_DEEP"];
  /**
   * Regel-Audit einer Zaehlung (Addendum §2/§5): jede Dimension einzeln, mit Klasse und Quelle — kein Black-Box-Score.
   * Richtlinie "erfuellt" = Wert >= 0,7 (a priori). Zeitreihen-Dimensionen (Stabilitaet, Verzug) ergaenzt die Produktschicht.
   */
  function ruleAudit(e, count) {
    var rules = e.rules || [], g = e.guidelines || {};
    function meta(id, kind) { var m = S ? (kind === "R" ? S.ruleMeta(id) : S.guidelineMeta(id)) : null; return m ? { statement: m.statement, class: m.class, source: m.source, locator: m.locator } : null; }
    function tally(filter) { var a = rules.filter(filter); return { satisfied: a.filter(function (r) { return r.passed === true; }).length, violated: a.filter(function (r) { return r.passed === false; }).length, open: a.filter(function (r) { return r.passed === null; }).length, total: a.length }; }
    var gl = Object.keys(g).filter(function (k) { return isNum(g[k]); }).map(function (k) { return Object.assign({ id: k, value: round(g[k], 3), matched: g[k] >= 0.7 }, meta(k, "G")); });
    var fib = gl.filter(function (x) { return FIB_GUIDES.indexOf(S ? S.baseId(x.id) : x.id) >= 0 || FIB_GUIDES.indexOf(x.id) >= 0; });
    var pick = function (id) { var x = gl.filter(function (y) { return y.id === id; })[0]; return x ? x.value : null; };
    var hd = e.components ? e.components.higherDegree : null;
    var violated = rules.some(function (r) { return r.passed === false; });
    return {
      validity: violated ? "INVALID" : "VALID",
      hardRules: tally(function (r) { return r.class === "HARD"; }),
      definitions: tally(function (r) { return r.class === "DEFINITION"; }),
      vuOperational: tally(function (r) { return r.class === "VU_OPERATIONAL"; }),
      guidelines: { matched: gl.filter(function (x) { return x.matched; }).length, total: gl.length, items: gl },
      dimensions: {
        subdivision: { value: isNum(e.subdivisionFit) ? round(e.subdivisionFit, 3) : null, detail: e.subdivisionDetail || null },
        degreeConsistency: { value: isNum(hd) ? round(hd, 3) : null, label: !isNum(hd) ? "unbekannt" : hd >= 0.8 ? "passt" : hd >= 0.5 ? "neutral" : "widerspricht" },
        timeProportion: { value: isNum(proportionScore(e.waves)) ? round(proportionScore(e.waves), 3) : null },
        priceProportion: { value: isNum(priceSimilarity(e.waves)) ? round(priceSimilarity(e.waves), 3) : null, note: "nur Audit" },
        fibonacci: { value: fib.length ? round(mean(fib.map(function (x) { return x.value; })), 3) : null, items: fib.map(function (x) { return x.id; }) },
        alternation: { value: pick("ALTERNATION") }, channel: { value: pick("CHANNEL") }, extension: { value: pick("EXTENSION_IN_ONE") !== null ? pick("EXTENSION_IN_ONE") : pick("W3_EXTENSION") },
        overlap: { value: rules.filter(function (r) { return /OVERLAP/.test(r.ruleId); }).map(function (r) { return r.ruleId + ":" + (r.passed === true ? "ok" : r.passed === false ? "verletzt" : "offen"); }) },
        correctiveStructure: { value: e.family === "CORRECTIVE" ? (violated ? 0 : 1) : null },
        momentum: { value: pick("W3_MOMENTUM") }, volume: { value: pick("W3_VOLUME"), note: pick("W3_VOLUME") === null ? "keine Volumendaten oder nicht anwendbar" : null }
      },
      rules: rules.map(function (r) { return Object.assign({ id: r.ruleId, passed: r.passed }, meta(r.ruleId, "R") || { class: r.class, source: null, locator: r.source }); }),
      verification: S ? S.VERIFICATION : null
    };
  }

  function applicability(quality, clarity, hmap, cfg, snr) {
    var parts = { countQuality: quality && isNum(quality.score) ? quality.score : null, clarity: isNum(clarity) ? Math.max(0, Math.min(1, clarity / cfg.countQuality.clarityFull)) : null,
                  historyCoverage: hmap && isNum(hmap.coverage) ? hmap.coverage : null, signalToNoise: snr ? snr.score : null };
    var v = Object.keys(parts).map(function (k) { return parts[k]; }).filter(isNum);
    var score = v.length ? mean(v) : null, a = cfg.applicability;
    var level = !isNum(score) ? "LOW" : score >= a.high ? "HIGH" : score >= a.moderate ? "MODERATE" : "LOW";
    /* Harte Enthaltung: Schwuenge kaum ueber der Umkehrschwelle (a priori < 1,6) sind von Rauschen nicht zu trennen. */
    if (snr && snr.ratio < a.minSignalToNoise) level = "LOW";
    var reasons = [];
    if (isNum(parts.clarity) && parts.clarity < 0.34) reasons.push("Mehrere Lesarten liegen fast gleichauf");
    if (isNum(parts.historyCoverage) && parts.historyCoverage < 0.5) reasons.push("Die Kurshistorie lässt sich nur zum Teil als Elliott-Struktur lesen");
    if (quality && quality.level === "LOW") reasons.push("Die beste Zählung erfüllt die Richtlinien nur schwach");
    if (snr && (snr.ratio < a.minSignalToNoise || snr.score < 0.34)) reasons.push("Die Schwünge sind kaum größer als die normale Schwankung");
    return { score: isNum(score) ? round(score, 3) : null, level: level, abstain: level === "LOW", components: roundMap(parts), signalToNoise: snr ? snr.ratio : null, reasons: reasons };
  }
  /** Kandidatenbaum: was sich aus dem aktuellen Zustand entwickeln kann (Hauptlesart, Ausdehnung der laufenden Welle, Alternativen). */
  function candidateTree(primary, alternatives) {
    var tree = [];
    if (primary) {
      var z = primary.projection.zones.filter(function (x) { return x.phase === "CURRENT"; })[0] || null;
      tree.push({ branch: "PRIMARY", countId: primary.countId, text: primary.complete ? primary.patternName + " abgeschlossen – Gegenbewegung beginnt" : "Welle " + primary.currentWave.label + " endet" + (z ? " im Zielbereich" : "") + ", danach " + (primary.nextMove === "UP" ? "aufwärts" : "abwärts"),
                 zone: z ? { low: z.zoneLow, high: z.zoneHigh } : null, invalidation: primary.invalidation ? primary.invalidation.price : null });
      if (!primary.complete && primary.invalidation) tree.push({ branch: "EXTENSION", countId: primary.countId, text: "Welle " + primary.currentWave.label + " dehnt sich aus – gültig bis zur Grenze", zone: null, invalidation: primary.invalidation.price });
    }
    (alternatives || []).forEach(function (a, k) { tree.push({ branch: "ALTERNATIVE_" + (k + 1), countId: a.countId, text: a.patternName + ", aktuell " + (a.complete ? "abgeschlossen" : "Welle " + a.currentWave.label), zone: null, invalidation: a.invalidation ? a.invalidation.price : null }); });
    return tree;
  }

  // =================================================================
  //  HAUPTFUNKTION
  // =================================================================
  /**
   * @param {object} input { series, features, pivots, asOfIndex?, methodology? }
   */
  function analyzeElliottV2(input) {
    var m = (input.methodology && input.methodology.elliottV2) || input.methodology || {};
    var cfg = Object.assign({}, DEFAULTS, m.engine || {});
    cfg.rankWeights = Object.assign({}, DEFAULTS.rankWeights, (m.engine && m.engine.rankWeights) || {});
    cfg.typePrior = Object.assign({}, DEFAULTS.typePrior, (m.engine && m.engine.typePrior) || {});
    var series = input.series, pivots = input.pivots, features = input.features;
    var asOf = isNum(input.asOfIndex) ? Math.min(input.asOfIndex, series.length - 1) : series.length - 1;
    var atr = features && isNum(features.columns.atr[asOf]) ? features.columns.atr[asOf] : series.close[asOf] * 0.02;
    var ctx = { cfg: cfg, trendDir: trendDirection(series, asOf, input.barsPerYear) };
    /* V2.2 — Gradwahl ueber ALLE Skalen mit genug Legs: jede wird mit ihrem hoeheren Grad (Verschachtelung)
       gezaehlt; gewaehlt wird die Skala, deren beste Lesart den hoechsten Rang hat (kleiner, fester Vorzug fuer
       groebere Skalen, damit die dominante Struktur gezaehlt wird und nicht ihre Unterwellen).
       cfg.analysisScale erzwingt eine Skala (Tests, Studien). */
    var ids = pivots.scaleIds;
    function legsAt(id) { var n = 0; pivots.scales[id].pivots.forEach(function (p) { if (p.confirmedIndex <= asOf) n++; }); return n - 1; }
    var higherCache = {};
    function higherOf(k) {
      if (k >= ids.length - 1 || legsAt(ids[k + 1]) < 3) return null;
      if (higherCache[k] !== undefined) return higherCache[k];
      var H = analyzeScale(series, pivots, ids[k + 1], ids[k], asOf, ctx, null), hh = null;
      if (H && H.candidates.length && H.legs.length >= 3) {
        var hc = H.candidates[0], hdw = hc.developingWave;
        hh = { scaleId: ids[k + 1], pattern: hc.type, patternName: PATTERN_NAMES_DE[hc.type], rank: hc.rank,
               current: { label: hc.complete ? "nach " + P.PATTERNS[hc.type].labels[P.PATTERNS[hc.type].waves - 1] : P.PATTERNS[hc.type].labels[hdw - 1],
                          notation: hc.complete ? notate(P.PATTERNS[hc.type].labels[P.PATTERNS[hc.type].waves - 1], "HIGHER") + " abgeschlossen" : notate(P.PATTERNS[hc.type].labels[hdw - 1], "HIGHER"),
                          role: hc.complete ? "CORRECTIVE" : currentRole(hc.type, hdw),
                          direction: hc.complete ? -waveDirection(hc.sign, P.PATTERNS[hc.type].waves) : waveDirection(hc.sign, hdw) },
               waves: labelWaves(hc, "HIGHER"), historicalPatterns: H.history.patterns.length, nested: cfg.nestedHigherDegree,
               waveSpecs: hc.waves.map(function (l, q) { return { fromIndex: l.fromIndex, toIndex: l.toIndex, dir: l.toPrice >= l.fromPrice ? 1 : -1, expected: P.PATTERNS[hc.type].subdivision[q] }; }) };
        /* abgeschlossenes Muster des hoeheren Grades: die laufende Folgewelle (unbekannte Klasse) mitfuehren */
        if (hc.complete && H.developing) hh.waveSpecs.push({ fromIndex: H.developing.fromIndex, toIndex: H.developing.toIndex, dir: H.developing.toPrice >= H.developing.fromPrice ? 1 : -1, expected: "MK" });
      }
      higherCache[k] = hh;
      return hh;
    }
    var options = [];
    var forced = cfg.analysisScale ? ids.indexOf(cfg.analysisScale) : cfg.scaleSelection === "LEGACY" ? ids.indexOf(chooseScales(pivots, asOf, cfg).analysis) : -1;
    for (var k = 0; k < ids.length; k++) {
      if (forced >= 0 && k !== forced) continue;
      if (forced < 0 && legsAt(ids[k]) < cfg.minLegs) continue;
      var hgh = higherOf(k);
      var AA = analyzeScale(series, pivots, ids[k], k > 0 ? ids[k - 1] : null, asOf, ctx, hgh);
      if (!AA) continue;
      var top = AA.candidates[0];
      /* Skalen, deren Schwuenge kaum ueber der Umkehrschwelle liegen, sind rauschgetrieben → Rang abwerten (a priori). */
      var sn = signalToNoise(series, features, pivots, ids[k], asOf), snf = sn ? 0.7 + 0.3 * sn.score : 0.85;
      options.push({ k: k, A: AA, higher: hgh, snr: sn, score: top ? top.rank * snf + cfg.coarserScalePreference * k : -1 });
    }
    options.sort(function (x, y) { return y.score - x.score || y.k - x.k; });
    var pick = options[0] || null;
    /* V2.2 Persistenz (optional, input.previous aus dem Vortag — kausal): eine weiterhin regelkonforme Lesart
       wird nur verdraengt, wenn eine andere um mehr als cfg.stickiness besser ist (Hysterese gegen Flackern). */
    var prevState = input.previous || null;
    if (prevState && pick) {
      var same = options.filter(function (o) { return ids[o.k] === prevState.scaleId; })[0];
      if (same && same !== pick && same.score >= pick.score - cfg.stickiness) pick = same;
    }
    var scales = pick ? { analysis: ids[pick.k], lower: pick.k > 0 ? ids[pick.k - 1] : null, higher: pick.higher ? pick.higher.scaleId : null,
                          considered: options.map(function (o) { return { scaleId: ids[o.k], score: round(o.score, 4) }; }) }
                      : { analysis: ids[0], lower: null, higher: null, considered: [] };
    var base = { engineVersion: ENGINE_VERSION, ruleSetVersion: P.RULE_SET_VERSION, repaintingPolicy: REPAINTING_POLICY, isProbability: false,
                 parametersHash: Hash.hashValue({ v: ENGINE_VERSION, cfg: cfg }), asOfIndex: asOf, asOf: series.timestamps[asOf], degrees: scales };
    var higher = pick ? pick.higher : null;
    var A = pick ? pick.A : null;
    if (!A || A.legs.length < cfg.minLegs) {
      return Object.assign(base, { status: "UNAVAILABLE", reason: "TOO_FEW_SWINGS", detail: "Zu wenige bestätigte Swings für eine Wellenzählung (" + (A ? A.legs.length : 0) + " < " + cfg.minLegs + ")",
                                   primary: null, alternatives: [], higherDegree: higher, historicalMap: null });
    }
    if (!A.candidates.length) {
      return Object.assign(base, { status: "UNAVAILABLE", reason: "NO_VALID_COUNT", detail: "Keine regelkonforme Lesart der jüngsten Swings", primary: null, alternatives: [], higherDegree: higher,
                                   historicalMap: historicalMap(A) });
    }
    if (prevState && prevState.key) {
      var keep = A.candidates.filter(function (c) { return candidateKey(c) === prevState.key; })[0];
      if (keep && keep !== A.candidates[0] && keep.rank >= A.candidates[0].rank - cfg.stickiness) { A.candidates.splice(A.candidates.indexOf(keep), 1); A.candidates.unshift(keep); }
    }
    var primary = buildCount(A.candidates[0], ctx, atr);
    primary.persistenceKey = candidateKey(A.candidates[0]);
    var alternatives = [];
    for (var k = 1; k < A.candidates.length && alternatives.length < cfg.maxAlternatives; k++) {
      var c = buildCount(A.candidates[k], ctx, atr);
      if (!materiallyDifferent(primary, c, atr, cfg)) continue;
      if (alternatives.some(function (a) { return !materiallyDifferent(a, c, atr, cfg); })) continue;
      alternatives.push(c);
    }
    var clarity = alternatives.length ? round(primary.rank - alternatives[0].rank, 4) : round(primary.rank, 4);
    var hmap = historicalMap(A);
    primary.countQuality = countQuality(A.candidates[0], primary, clarity, features, cfg);
    alternatives.forEach(function (a) { var src = A.candidates.filter(function (x) { return buildCountId(x) === a.countId; })[0]; a.countQuality = src ? countQuality(src, a, null, features, cfg) : null; });
    primary.detection = detectionLatency(primary, pivots, series, asOf);
    primary.ruleAudit = ruleAudit(A.candidates[0], primary);
    alternatives.forEach(function (a) { var src = A.candidates.filter(function (x) { return buildCountId(x) === a.countId; })[0]; a.ruleAudit = src ? ruleAudit(src, a) : null; });
    var appl = applicability(primary.countQuality, alternatives.length ? clarity : null, hmap, cfg, signalToNoise(series, features, pivots, A.scaleId, asOf));
    var structuralLevel = primary.rank >= cfg.structural.high ? "HIGH" : primary.rank >= cfg.structural.moderate ? "MODERATE" : "LOW";
    var clarityLevel = clarity >= cfg.clarity.high ? "HIGH" : clarity >= cfg.clarity.moderate ? "MODERATE" : "LOW";
    var status = primary.currentWave.wave === 1 && !primary.complete ? "EARLY" : clarityLevel === "LOW" ? "AMBIGUOUS" : "OK";
    return Object.assign(base, {
      status: status, reason: status === "OK" ? null : status === "EARLY" ? "FIRST_WAVE_ONLY" : "ALTERNATIVES_CLOSE",
      primary: primary, alternatives: alternatives,
      structuralScore: primary.rank, structuralLevel: structuralLevel, clarity: clarity, clarityLevel: clarityLevel,
      confidenceType: "structural_fit", confidenceNote: "Rangwert der Regel- und Richtlinienpassung, keine Wahrscheinlichkeit.",
      higherDegree: higher, trendContext: ctx.trendDir,
      candidateCount: A.candidates.length,
      applicability: appl, candidateTree: candidateTree(primary, alternatives),
      historicalMap: hmap,
      atr: round(atr, 4)
    });
  }

  function historicalMap(A) {
    var explained = 0;
    A.history.patterns.forEach(function (p) { explained += p.legs.length; });
    return {
      scaleId: A.scaleId, legs: A.legs.length,
      coverage: A.legs.length ? round(explained / A.legs.length, 3) : 0,
      unlabeledLegs: A.history.unlabeledLegs,
      patterns: A.history.patterns.map(function (p, k) {
        var spec = P.PATTERNS[p.type], labels = spec.displayLabels || spec.labels;
        return { patternId: "hp_" + k, pattern: p.type, patternName: PATTERN_NAMES_DE[p.type], variant: p.variant, direction: p.sign > 0 ? "UP" : "DOWN", score: round(p.score, 3), status: "CONFIRMED",
                 waves: p.legs.map(function (l, j) { return { label: labels[j], toIndex: l.toIndex, toTime: l.toTime, toPrice: round(l.toPrice, 4), confirmedIndex: l.confirmedIndex }; }) };
      })
    };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, pivotView: pivotView, legsOf: legsOf, subdivide: subdivide, subdivisionFit: subdivisionFit,
              parseHistory: parseHistory, nestedFit: nestedFit, ruleAudit: ruleAudit, priceSimilarity: priceSimilarity, countQuality: countQuality, applicability: applicability, signalToNoise: signalToNoise, detectionLatency: detectionLatency, trendDirection: trendDirection, chooseScales: chooseScales, analyzeElliottV2: analyzeElliottV2, PATTERN_NAMES_DE: PATTERN_NAMES_DE, notate: notate,
              /* fuer Engine 3.0 (gleiche Count-Objekte, gleiche Audit-/Qualitaets-Logik) */
              buildCount: buildCount, materiallyDifferent: materiallyDifferent, candidateKey: candidateKey, buildCountId: buildCountId, historicalMap: historicalMap, analyzeScale: analyzeScale, candidateTree: candidateTree, labelWaves: labelWaves, currentRole: currentRole, waveDirection: waveDirection, impliedTrend: impliedTrend, makeLeg: makeLeg };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ElliottV2 = api; }
})(typeof window !== "undefined" ? window : globalThis);
