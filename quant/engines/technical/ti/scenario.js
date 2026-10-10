/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/scenario.js
   KONFLUENZ + VU SCENARIO ENGINE + CONFIDENCE-MODELL (as-of)

   1. KONFLUENZ (Richtung)
      Jede Methodenfamilie liefert eine Richtung d ∈ [−1, 1]. Gewichte =
      Evidenzgrad-Prior (A 0,30 … D 0,05, methodology/technical-intelligence-
      v2.json), optional ersetzt durch empirisch validierte Gewichte, wenn
      die Ablationsstudie sie freigibt. Agreement = Σ w·d / Σ w.
      Widersprueche werden NICHT weggemittelt: ab einem Gegengewicht von
      35 % des Fuergewichts heisst das Ergebnis MIXED und nennt den Konflikt.

   2. SZENARIEN
      PRIMARY     Richtung des Agreements. Geometrie aus Konfluenz:
                  Entry = Cluster aus Elliott-Abschlusszone, Fibonacci-
                  Retracement des Referenz-Swings und Unterstuetzung;
                  Ziele = Cluster aus Elliott-Projektion, Widerstaenden,
                  Measured Move, Fib-Extension, Formationsziel.
                  Invalidation = engste STRUKTURELLE Grenze jenseits der
                  Entry-Zone (Elliott-Regelbruch, Swing-Tief, Zonenrand).
      ALTERNATIVE materiell andere Lesart (Elliott-Alternative mit anderer
                  Richtung) oder der Pfad nach Bruch der Invalidation.
      TAIL        tiefere Korrektur bzw. ausgedehnte Bewegung.

   3. CONFIDENCE — vier getrennte Groessen, nie vermischt:
      structural   Klarheit der Struktur (Elliott-Rangabstand, Swing-Lage)
      agreement    Uebereinstimmung der Methodenfamilien
      empirical    Trefferquote vergleichbarer historischer Setups (n, Wilson-
                   KI, Baseline gleicher Geometrie) — nur aus Evidence-Tabellen
      calibrated   Wahrscheinlichkeit NUR, wenn die Kalibrierung den Gate-Test
                   besteht; sonst null.
      Das Konsumentenlabel (Hoch/Mittel/Niedrig) folgt einer offengelegten
      Regel aus diesen Groessen — keine Prozentzahl ohne Kalibrierung.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../../hash.js") : global.VUHash;
  var ENGINE_VERSION = "ti-scenario-1.2.1";   // 1.1.0 (Mission IV): Kursniveaus nur positiv und plausibel, Measured Move prozentual; 1.1.1: ATR-Deckel 25 % des Kurses; 1.2.0 (Red-Team 2): keine Szenarien auf toten Reihen, Elliott formt nur bei Anwendbarkeit ≥ MITTEL, Abstandsgrenzen relativ zum Kurs; 1.2.1: ATR-Untergrenze je Zeitebene, Bestaetigung hoechstens 50 % vom Kurs

  var DEFAULTS = {
    /* Prior aus Evidenzgraden (METHOD_RESEARCH.md). WYCKOFF = 0: keine Literatur-Evidenz (Grad D) UND in der
       VU-Entwicklungsstudie (TRAIN/VALIDATION) Richtungstrefferquote unter 50 % → nur beschreibend, nicht stimmberechtigt. */
    familyWeights: { TREND: 0.30, MOMENTUM: 0.20, STRUCTURE: 0.15, HIGHER_TIMEFRAME: 0.15, VOLUME: 0.10, PATTERN: 0.08, ELLIOTT: 0, WYCKOFF: 0 },   // ELLIOTT 0: vorab registrierte Entscheidung (PREREGISTRATION §4, Bestaetigungsstichprobe: kein Prognosebeitrag)
    biasThreshold: 0.15, mixedConflictShare: 0.35,
    agreementLevels: { high: 0.5, moderate: 0.25 },
    zone: { minWidthAtr: 0.6, maxWidthAtr: 2.0, clusterTolAtr: 0.75 },
    entry: { maxDistanceAtr: 4.0, retracementBand: [0.382, 0.618], maxShareOfClose: 0.3 },
    invalidation: { minGapAtr: 0.3, maxRiskAtr: 4.5, bufferAtr: 0.25, maxShareOfClose: 0.35 },
    targets: { minDistanceAtr: 1.5, separationAtr: 1.5, maxFactor: 3, maxDistanceAtr: 12 },
    confirmation: { maxDistanceAtr: 8, maxShareOfClose: 0.5 },
    /* Nach einem Einbruch traegt die ATR noch die alten Kursniveaus (AIXI: Kurs 3,10, Einstiegszone 14,60–20,50). Fuer die
       Szenario-Geometrie hoechstens 25 % des Kurses je Bar. */
    atrMaxShareOfClose: 0.25,
    /* Untergrenze: auf fast flachen Reihen faellt die ATR gegen 0 und das Chance/Risiko-Verhaeltnis wird absurd (Red-Team 2 C1). */
    atrMinShareOfClose: { "1W": 0.015, "1D": 0.005 },   // Wochen-ATR unter 1,5 % des Kurses: praktisch nur gebundene Kurse (Uebernahmeangebot)
    /* Tote Reihe (uebernommen, delistet, ausgesetzt): so viele gleiche Schlusskurse am Ende → kein Szenario. */
    staleFlatBars: { "1W": 4, "1D": 10 },
    empirical: { minSample: 30 }
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function r4(v) { return isNum(v) ? Math.round(v * 1e4) / 1e4 : null; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ================================================================ Familien
  function elliottDirection(E) {
    if (!E || !E.primary || E.status === "UNAVAILABLE") return { d: 0, note: "keine Zählung" };
    var p = E.primary, cur = p.currentWave.direction === "UP" ? 1 : -1, next = p.nextMove === "UP" ? 1 : -1;
    /* Handelbare naechste Bewegung: in einer Korrekturwelle die Folgebewegung, in einer Motivwelle die laufende. */
    var d = p.complete ? next : p.currentWave.role === "CORRECTIVE" ? next : cur;
    var strength = E.clarityLevel === "HIGH" ? 1 : E.clarityLevel === "MODERATE" ? 0.7 : 0.4;
    if (p.currentWave.wave === 1 && !p.complete) strength *= 0.5;
    return { d: d * strength, note: p.patternName + ", Welle " + p.currentWave.label };
  }

  function votes(x) {
    var v = {};
    if (x.dow && x.dow.direction !== undefined) v.TREND = { d: x.dow.direction * (x.dow.maAgrees === false ? 0.6 : 1), available: x.dow.primary.direction !== "NONE" || x.dow.direction !== 0 };
    if (x.momentum && x.momentum.state !== "UNDETERMINED") {
      var md = x.momentum.composite === null ? 0 : clamp(x.momentum.composite / 1.5, -1, 1);
      if (x.momentum.divergence.bearish && md > 0) md *= 0.5;
      if (x.momentum.divergence.bullish && md < 0) md *= 0.5;
      v.MOMENTUM = { d: md, available: true };
    }
    if (x.dow) {
      var sec = x.dow.secondary.state === "UP" ? 1 : x.dow.secondary.state === "DOWN" ? -1 : 0;
      var sh = x.dow.shortTerm.state === "UP" ? 1 : x.dow.shortTerm.state === "DOWN" ? -1 : 0;
      v.STRUCTURE = { d: 0.65 * sec + 0.35 * sh, available: x.dow.secondary.state !== "UNDETERMINED" };
    }
    if (x.higher) v.HIGHER_TIMEFRAME = { d: x.higher.direction, available: x.higher.available };
    if (x.volume && x.volume.status === "OK") v.VOLUME = { d: x.volume.direction * 0.8 + (x.volume.anchoredVwap.some(function (a) { return a.anchor === "MAJOR_LOW" && a.priceAbove; }) ? 0.2 : x.volume.anchoredVwap.some(function (a) { return a.anchor === "MAJOR_LOW"; }) ? -0.2 : 0), available: true };
    if (x.patterns && x.patterns.active && x.patterns.active.length) v.PATTERN = { d: x.patterns.direction, available: true };
    var ed = elliottDirection(x.elliott);
    if (x.elliott && x.elliott.primary) v.ELLIOTT = { d: ed.d, available: true, note: ed.note };
    if (x.wyckoff && x.wyckoff.status === "TRADING_RANGE" && x.wyckoff.schematic !== "UNDETERMINED") v.WYCKOFF = { d: x.wyckoff.direction, available: true };
    return v;
  }

  function confluence(x, cfg) {
    var v = votes(x), W = cfg.familyWeights, sum = 0, wsum = 0, pro = 0, con = 0, total = 0, fam = [];
    Object.keys(W).forEach(function (k) { total += W[k]; });
    Object.keys(v).forEach(function (k) {
      if (!v[k].available || !W[k]) return;
      sum += W[k] * v[k].d; wsum += W[k];
      fam.push({ family: k, direction: r4(v[k].d), weight: W[k], note: v[k].note || null });
    });
    var A = wsum > 0 ? sum / wsum : 0;
    var dir = A >= cfg.biasThreshold ? 1 : A <= -cfg.biasThreshold ? -1 : 0;
    fam.forEach(function (f) { if (dir !== 0 && f.direction * dir > 0.1) pro += f.weight * Math.abs(f.direction); if (dir !== 0 && f.direction * dir < -0.1) con += f.weight * Math.abs(f.direction); });
    var mixed = dir !== 0 && pro > 0 && con / pro >= cfg.mixedConflictShare;
    var level = Math.abs(A) >= cfg.agreementLevels.high ? "HIGH" : Math.abs(A) >= cfg.agreementLevels.moderate ? "MODERATE" : "LOW";
    return { agreement: r4(A), direction: dir, outlook: dir === 0 ? "NEUTRAL" : mixed ? "MIXED" : dir > 0 ? "BULLISH" : "BEARISH", mixed: mixed, level: level,
             coverage: r4(wsum / total), families: fam.sort(function (a, b) { return b.weight - a.weight; }),
             supporting: fam.filter(function (f) { return dir !== 0 && f.direction * dir > 0.1; }).map(function (f) { return f.family; }),
             opposing: fam.filter(function (f) { return dir !== 0 && f.direction * dir < -0.1; }).map(function (f) { return f.family; }) };
  }

  // ================================================================ Geometrie
  function cluster(items, atr, tolAtr) {
    var arr = items.filter(function (x) { return isNum(x.price); }).sort(function (a, b) { return a.price - b.price; }), out = [], cur = null;
    arr.forEach(function (x) {
      if (cur && x.price - cur.hi <= tolAtr * atr) { cur.items.push(x); cur.hi = x.price; }
      else { cur = { items: [x], lo: x.price, hi: x.price }; out.push(cur); }
    });
    return out.map(function (c) {
      var w = c.items.reduce(function (a, x) { return a + x.weight; }, 0);
      return { lo: c.lo, hi: c.hi, center: c.items.reduce(function (a, x) { return a + x.price * x.weight; }, 0) / w, weight: w,
               sources: c.items.map(function (x) { return { type: x.type, relation: x.relation || null }; }) };
    });
  }
  /** Anzeigeschritt: keine Scheingenauigkeit (183–190 statt 182,7431–189,6612). */
  function priceStep(p) { return p < 1 ? 0.01 : p < 10 ? 0.05 : p < 50 ? 0.1 : p < 200 ? 0.5 : p < 1000 ? 1 : 5; }
  function down(v, st) { return Math.round(Math.floor(v / st + 1e-9) * st * 1e4) / 1e4; }
  function up(v, st) { return Math.round(Math.ceil(v / st - 1e-9) * st * 1e4) / 1e4; }
  function toZone(c, atr, cfg, label) {
    var lo = c.lo, hi = c.hi, mid = (lo + hi) / 2;
    if (hi - lo < cfg.zone.minWidthAtr * atr) { lo = mid - cfg.zone.minWidthAtr * atr / 2; hi = mid + cfg.zone.minWidthAtr * atr / 2; }
    if (hi - lo > cfg.zone.maxWidthAtr * atr) { lo = c.center - cfg.zone.maxWidthAtr * atr / 2; hi = c.center + cfg.zone.maxWidthAtr * atr / 2; }
    var types = {}; c.sources.forEach(function (s) { types[s.type] = true; });
    var st = priceStep(c.center);
    /* nach aussen runden: die Zone wird nie schmaler als berechnet */
    return { label: label, zoneLow: down(lo, st), zoneHigh: up(hi, st), center: r4(c.center), weight: r4(c.weight), confluence: Object.keys(types).length, sources: c.sources, displayStep: st };
  }

  /** Referenz-Swing in Richtung d: letzter abgeschlossener Swing der Sekundaer-Skala. */
  function referenceSwing(x, d) {
    var ctx = x.ctx, sid = x.dow && x.dow.secondary && x.dow.secondary.scaleId ? x.dow.secondary.scaleId : "scale-2", v = ctx.view(sid);
    if (!v || v.confirmed.length < 2) return null;
    var c = v.confirmed, last = c[c.length - 1], prev = c[c.length - 2];
    var wantEnd = d > 0 ? "HIGH" : "LOW";
    if (last.side === wantEnd) return { from: prev, to: last, inPullback: true, scaleId: sid };
    /* letztes Pivot ist das Gegenende: der laufende Swing in Richtung d */
    if (v.developing && v.developing.side === wantEnd) return { from: last, to: v.developing, inPullback: false, scaleId: sid };
    return c.length >= 3 ? { from: c[c.length - 3], to: prev, inPullback: true, scaleId: sid } : null;
  }

  function directional(x, d, cfg, kind) {
    if (x.ctx.stale) return null;
    var ctx = x.ctx, atr = ctx.atr, close = ctx.close, E = x.elliott;
    var ref = referenceSwing(x, d);
    if (!ref) return null;
    var A = ref.from.pivotPrice, B = ref.to.pivotPrice, L = Math.abs(B - A);
    // ------------------------------------------------ Entry-Kandidaten
    var ent = [];
    cfg.entry.retracementBand.concat([0.5]).forEach(function (r) { ent.push({ price: B - d * L * r, weight: r === 0.5 ? 0.8 : 0.6, type: "FIB_RETRACEMENT", relation: Math.round(r * 1000) / 10 + " % Rücklauf des letzten Swings" }); });
    (d > 0 ? x.levels.sr.supports : x.levels.sr.resistances).forEach(function (z) { ent.push({ price: z.center, weight: 0.5 + 0.25 * Math.min(4, z.strength), type: d > 0 ? "SUPPORT" : "RESISTANCE", relation: (d > 0 ? "Unterstützungszone" : "Widerstandszone") + " (" + z.touches + " Berührungen)" }); });
    var elliottUsed = false;
    if (E && E.primary && !E.primary.complete && E.primary.currentWave.role === "CORRECTIVE" && (E.primary.nextMove === "UP") === (d > 0)) {
      E.primary.projection.zones.filter(function (z) { return z.kind === "COMPLETION"; }).forEach(function (z) { ent.push({ price: z.center, weight: 1.0, type: "ELLIOTT_COMPLETION", relation: z.relations[0] }); });
      elliottUsed = true;
    }
    (x.levels.fib.clusters || []).forEach(function (fc) { ent.push({ price: fc.center, weight: 0.4 * fc.anchors, type: "FIB_CLUSTER", relation: "Fibonacci-Konfluenz aus " + fc.anchors + " Ankern" }); });
    ent = ent.filter(function (e) { return isNum(e.price) && e.price > 0 && Math.abs(e.price - close) <= cfg.entry.maxShareOfClose * close; });
    var near = ent.filter(function (e) { return d > 0 ? e.price <= close + 0.5 * atr && e.price >= close - cfg.entry.maxDistanceAtr * atr : e.price >= close - 0.5 * atr && e.price <= close + cfg.entry.maxDistanceAtr * atr; });
    var cl = cluster(near, atr, cfg.zone.clusterTolAtr).sort(function (a, b) { return b.weight - a.weight || Math.abs(a.center - close) - Math.abs(b.center - close); });
    var template, entry;
    var activePattern = (x.patterns.active || []).filter(function (p) { return (p.direction === "BULLISH") === (d > 0); })[0];
    if (activePattern && (activePattern.status === "BREAKOUT" || activePattern.status === "BREAKOUT_RETEST") && Math.abs(close - activePattern.breakoutLevel) <= 2 * atr) {
      template = "BREAKOUT_RETEST";
      entry = toZone({ lo: activePattern.breakoutLevel - 0.4 * atr, hi: activePattern.breakoutLevel + 0.4 * atr, center: activePattern.breakoutLevel, weight: 1, sources: [{ type: "PATTERN_BREAKOUT", relation: activePattern.name + ": Ausbruchsniveau" }] }, atr, cfg, "Einstiegszone");
    } else if (cl.length) {
      template = ref.inPullback || elliottUsed ? "PULLBACK" : "CONTINUATION";
      entry = toZone(cl[0], atr, cfg, "Einstiegszone");
    } else {
      template = "CONTINUATION";
      entry = toZone({ lo: close - 0.5 * atr, hi: close + 0.5 * atr, center: close, weight: 0.3, sources: [{ type: "VOLATILITY", relation: "Bandbreite ±0,5 ATR um den Kurs" }] }, atr, cfg, "Einstiegszone");
    }
    var entryEdgeFar = d > 0 ? entry.zoneLow : entry.zoneHigh, entryEdgeNear = d > 0 ? entry.zoneHigh : entry.zoneLow;
    // ------------------------------------------------ Invalidation
    var inv = [];
    if (E && E.primary && E.primary.invalidation && ((E.primary.invalidation.direction === "below") === (d > 0))) inv.push({ price: E.primary.invalidation.price, basis: "ELLIOTT_RULE", rule: E.primary.invalidation.statement, ruleId: E.primary.invalidation.ruleId });
    if (E && E.primary && E.primary.revision && ((E.primary.revision.direction === "below") === (d > 0))) inv.push({ price: E.primary.revision.price, basis: "ELLIOTT_REVISION", rule: E.primary.revision.statement });
    [x.dow.secondary, x.dow.shortTerm, x.dow.primary].forEach(function (lv) {
      if (!lv || !lv.lastLow) return;
      inv.push({ price: d > 0 ? lv.lastLow.price : lv.lastHigh.price, basis: "SWING_" + (d > 0 ? "LOW" : "HIGH"), rule: "letztes bestätigtes " + (d > 0 ? "Swing-Tief" : "Swing-Hoch") + " (" + lv.scaleId + ")" });
    });
    (d > 0 ? x.levels.sr.supports : x.levels.sr.resistances).forEach(function (z) { inv.push({ price: d > 0 ? z.zoneLow - cfg.invalidation.bufferAtr * atr : z.zoneHigh + cfg.invalidation.bufferAtr * atr, basis: "ZONE_EDGE", rule: "Rand der " + (d > 0 ? "Unterstützungszone" : "Widerstandszone") }); });
    if (activePattern) inv.push({ price: activePattern.invalidation.price, basis: "PATTERN", rule: activePattern.name + " ungültig" });
    var valid = inv.filter(function (c) { return isNum(c.price) && (d > 0 ? c.price <= entryEdgeFar - cfg.invalidation.minGapAtr * atr : c.price >= entryEdgeFar + cfg.invalidation.minGapAtr * atr) && Math.abs(entryEdgeFar - c.price) <= cfg.invalidation.maxRiskAtr * atr && Math.abs(entryEdgeFar - c.price) <= cfg.invalidation.maxShareOfClose * close; })
      .sort(function (a, b) { return d > 0 ? b.price - a.price : a.price - b.price; });
    /* Regelbasierte Grenzen (Elliott/Swing) haben Vorrang vor Zonenraendern, wenn sie nicht mehr als 1,5 ATR weiter liegen. */
    var invalidation = valid[0] || null;
    var structural = valid.filter(function (c) { return c.basis !== "ZONE_EDGE"; })[0];
    if (structural && invalidation && invalidation.basis === "ZONE_EDGE" && Math.abs(structural.price - invalidation.price) <= 1.5 * atr) invalidation = structural;
    if (!invalidation) invalidation = { price: entryEdgeFar - d * Math.min(1.5 * atr, cfg.invalidation.maxShareOfClose * close), basis: "VOLATILITY", rule: "1,5 ATR jenseits der Einstiegszone (keine strukturelle Grenze in Reichweite)" };
    /* Invalidation nach aussen runden (weg von der Einstiegszone). */
    var ist = priceStep(invalidation.price);
    invalidation = { price: d > 0 ? down(invalidation.price, ist) : up(invalidation.price, ist), direction: d > 0 ? "below" : "above", basis: invalidation.basis, rule: invalidation.rule, ruleId: invalidation.ruleId || null, closeBasis: true };
    // ------------------------------------------------ Ziele
    var tg = [];
    if (E && E.primary) {
      E.primary.projection.zones.filter(function (z) { return z.kind === "TARGET"; }).forEach(function (z) {
        var zDir = z.center > close ? 1 : -1;
        if (zDir === d) tg.push({ price: z.center, weight: 0.9 * Math.min(1.5, z.weight), type: "ELLIOTT_TARGET", relation: z.relations[0] });
      });
    }
    (d > 0 ? x.levels.sr.resistances : x.levels.sr.supports).forEach(function (z) { tg.push({ price: z.center, weight: 0.5 + 0.25 * Math.min(4, z.strength), type: d > 0 ? "RESISTANCE" : "SUPPORT", relation: (d > 0 ? "Widerstandszone" : "Unterstützungszone") + " (" + z.touches + " Berührungen)" }); });
    /* Measured Move prozentual (Mission IV): linear in Kurspunkten ergab nach starken Einbruechen negative Ziele
       (ACON: Swing 2.700 → 2, Ziel −2.695). Gleiche prozentuale Bewegung bleibt immer positiv. */
    if (A > 0 && B > 0) [1.0, 1.618].forEach(function (r) { tg.push({ price: entryEdgeNear * Math.pow(B / A, r), weight: r === 1 ? 0.8 : 0.6, type: "MEASURED_MOVE", relation: r + " × prozentuale Länge des letzten Swings ab Einstiegszone" }); });
    (x.levels.fib.levels || []).filter(function (f) { return f.kind === "EXTENSION" && (f.ratio === 1.272 || f.ratio === 1.618); }).forEach(function (f) { tg.push({ price: f.price, weight: 0.35, type: "FIB_EXTENSION", relation: "Fibonacci-Extension " + f.ratio }); });
    if (activePattern) tg.push({ price: (activePattern.target.zoneLow + activePattern.target.zoneHigh) / 2, weight: 0.7, type: "PATTERN_TARGET", relation: activePattern.name + ": Höhe der Formation" });
    var minT = entryEdgeNear + d * cfg.targets.minDistanceAtr * atr;
    /* Nur positive Ziele innerhalb des Faktors maxFactor um den Kurs (sonst keine sinnvolle Szenario-Aussage). */
    tg = tg.filter(function (c) { return isNum(c.price) && c.price > 0 && c.price <= close * cfg.targets.maxFactor && c.price >= close / cfg.targets.maxFactor && Math.abs(c.price - entryEdgeNear) <= cfg.targets.maxDistanceAtr * atr; });
    var cands = cluster(tg.filter(function (c) { return d > 0 ? c.price >= minT : c.price <= minT; }), atr, cfg.zone.clusterTolAtr)
      .sort(function (a, b) { return d > 0 ? a.center - b.center : b.center - a.center; });
    var targets = [];
    cands.forEach(function (c) {
      if (targets.length >= 3) return;
      if (c.weight < 0.6 && targets.length === 0 && cands.length > 1) return;   // T1 braucht Substanz
      var prev = targets[targets.length - 1];
      if (prev && Math.abs(c.center - prev.center) < cfg.targets.separationAtr * atr) return;
      var z = toZone(c, atr, cfg, "Ziel " + (targets.length + 1));
      /* Zielzonen duerfen sich nach dem Runden weder mit der Einstiegszone noch untereinander beruehren. */
      var edge = prev ? (d > 0 ? prev.zoneHigh : prev.zoneLow) : entryEdgeNear;
      if (z.zoneLow > 0 && z.zoneLow >= close / cfg.targets.maxFactor && z.zoneHigh <= close * cfg.targets.maxFactor && (d > 0 ? z.zoneLow > edge : z.zoneHigh < edge)) targets.push(z);
    });
    /* Volatilitaet groesser als das Kursniveau (z. B. nach einem Einbruch um 99 %): Zone oder Grenze laege bei ≤ 0.
       Dann gibt es kein in Kursen ausdrueckbares Szenario – lieber keins als ein unmoegliches. */
    if (!(entry.zoneLow > 0) || !(invalidation.price > 0)) return null;
    // ------------------------------------------------ Status
    var inEntry = close >= entry.zoneLow && close <= entry.zoneHigh;
    var beyondInv = d > 0 ? close < invalidation.price : close > invalidation.price;
    var distAtr = d > 0 ? (close - entry.zoneHigh) / atr : (entry.zoneLow - close) / atr;
    var status = beyondInv ? "INVALIDATED" : inEntry ? "IN_ENTRY_ZONE" : distAtr > 0 ? (distAtr <= 2 ? "APPROACHING" : "EXTENDED") : "BEYOND_ENTRY";
    var confirmation = null;
    var sh = x.dow.shortTerm;
    if (sh && sh.lastHigh) confirmation = { price: d > 0 ? sh.lastHigh.price : sh.lastLow.price, rule: "Schluss " + (d > 0 ? "über dem letzten kurzfristigen Hoch" : "unter dem letzten kurzfristigen Tief") };
    /* Ein uraltes Swing-Niveau weit weg vom Kurs (ACON: 949,73 bei Kurs 2,44) ist keine Bestaetigungsmarke. */
    if (confirmation && !(confirmation.price > 0 && Math.abs(confirmation.price - close) <= cfg.confirmation.maxDistanceAtr * atr && Math.abs(confirmation.price - close) <= cfg.confirmation.maxShareOfClose * close)) confirmation = null;
    var riskAtr = Math.abs((entry.zoneLow + entry.zoneHigh) / 2 - invalidation.price) / atr;
    var t1 = targets[0];
    var rr = t1 ? Math.abs(t1.center - (entry.zoneLow + entry.zoneHigh) / 2) / Math.max(1e-9, Math.abs((entry.zoneLow + entry.zoneHigh) / 2 - invalidation.price)) : null;
    return {
      kind: kind, direction: d > 0 ? "BULLISH" : "BEARISH", template: template, status: status,
      referenceSwing: { from: { time: ref.from.pivotTime, price: r4(A) }, to: { time: ref.to.pivotTime, price: r4(B), developing: ref.to.status === "DEVELOPING" }, scaleId: ref.scaleId },
      entryZone: entry, confirmation: confirmation, invalidation: invalidation, targets: targets,
      riskZone: { zoneLow: r4(Math.min(invalidation.price, entryEdgeFar)), zoneHigh: r4(Math.max(invalidation.price, entryEdgeFar)) },
      riskAtr: r4(riskAtr), rewardRiskT1: r4(rr), elliottShaped: elliottUsed,
      expectedStructure: E && E.primary ? expectedStructure(E.primary, d) : null
    };
  }

  function expectedStructure(p, d) {
    if (p.complete) return "Nach abgeschlossenem " + p.patternName + " beginnt eine neue Bewegung " + (p.nextMove === "UP" ? "aufwärts" : "abwärts");
    var nextLabel = { "1": "2", "2": "3", "3": "4", "4": "5", A: "B", B: "C", W: "X", X: "Y" }[p.currentWave.label] || null;
    if (p.currentWave.role === "CORRECTIVE" && nextLabel) return "Korrektur (Welle " + p.currentWave.label + ") vor einer Bewegung " + (d > 0 ? "aufwärts" : "abwärts") + " (Welle " + nextLabel + ")";
    return "Laufende Welle " + p.currentWave.label + " " + (p.currentWave.direction === "UP" ? "aufwärts" : "abwärts");
  }

  function rangeScenario(x, cfg) {
    if (x.ctx.stale) return null;
    var sr = x.levels.sr, atr = x.ctx.atr, close = x.ctx.close;
    var sup = sr.nearestSupport, res = sr.nearestResistance;
    if (!sup || !res) return null;
    return { kind: "PRIMARY", direction: "NEUTRAL", template: "RANGE", status: close > res.zoneHigh || close < sup.zoneLow ? "BREAKING" : "IN_RANGE",
             entryZone: null, confirmation: { up: up(res.zoneHigh, priceStep(res.zoneHigh)), down: down(sup.zoneLow, priceStep(sup.zoneLow)), rule: "Schluss außerhalb der Spanne entscheidet die Richtung" },
             invalidation: null, targets: [], range: { support: { zoneLow: down(sup.zoneLow, priceStep(sup.zoneLow)), zoneHigh: up(sup.zoneHigh, priceStep(sup.zoneHigh)) }, resistance: { zoneLow: down(res.zoneLow, priceStep(res.zoneLow)), zoneHigh: up(res.zoneHigh, priceStep(res.zoneHigh)) } },
             riskAtr: null, rewardRiskT1: null, widthAtr: r4((res.center - sup.center) / atr) };
  }

  // ================================================================ Confidence
  function wilson(k, n, z) {
    z = z || 1.96; if (!n) return null;
    var p = k / n, den = 1 + z * z / n, c = (p + z * z / (2 * n)) / den, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
    return [r4(c - h), r4(c + h)];
  }

  /** Setup-Signatur: identisch im Live-Produkt und im Backtest. */
  function signature(sc, conf, E, timeframe) {
    var ab = Math.abs(conf.agreement) >= 0.5 ? "HIGH" : Math.abs(conf.agreement) >= 0.25 ? "MODERATE" : "LOW";
    return { timeframe: timeframe, template: sc.template, direction: sc.direction, agreement: ab,
             elliott: E && E.primary ? (E.primary.pattern + ":" + (E.primary.complete ? "done" : E.primary.currentWave.label)) : "none",
             elliottRole: E && E.primary ? (E.primary.complete ? "COMPLETE" : E.primary.currentWave.role) : "NONE",
             key: [timeframe, sc.template, sc.direction, ab].join("|") };
  }

  /** Empirische Evidenz aus einer Evidence-Tabelle (vom Backtest erzeugt). */
  function empiricalLookup(table, sig, cfg) {
    if (!table || !table.setups) return null;
    var row = table.setups[sig.key] || null;
    if (!row) return { status: "NO_HISTORY", key: sig.key };
    if (row.n < cfg.empirical.minSample) return { status: "INSUFFICIENT_SAMPLE", key: sig.key, n: row.n, minSample: cfg.empirical.minSample };
    return Object.assign({ status: "OK", key: sig.key }, row);
  }

  function overallConfidence(conf, structural, empirical) {
    /* Offengelegte Regel (UI_UX_SPEC / BACKTEST_METHODOLOGY):
       HIGH     Agreement HIGH, Struktur >= MODERATE, und — falls Empirie
                vorliegt — Uplift gegen die Baseline mit unterem KI-Rand > 0.
       LOW      Agreement LOW, gemischtes Bild, oder Empirie zeigt keinen
                Vorteil gegenueber der geometrisch gleichen Baseline.
       MODERATE sonst. */
    var empOk = empirical && empirical.status === "OK";
    var noEdge = empOk && isNum(empirical.liftCiLow) && empirical.liftCiLow <= 0 && isNum(empirical.lift) && empirical.lift <= 0.02;
    if (conf.mixed || conf.level === "LOW" || noEdge) return { level: "LOW", reasons: [conf.mixed ? "MIXED_SIGNALS" : conf.level === "LOW" ? "LOW_AGREEMENT" : "NO_HISTORICAL_EDGE"] };
    if (conf.level === "HIGH" && structural !== "LOW" && (!empOk || (isNum(empirical.liftCiLow) && empirical.liftCiLow > 0))) return { level: "HIGH", reasons: ["HIGH_AGREEMENT"].concat(empOk ? ["HISTORICAL_EDGE"] : []) };
    return { level: "MODERATE", reasons: ["PARTIAL_AGREEMENT"] };
  }

  // ================================================================ Haupt
  /**
   * @param {object} x { ctx, dow, momentum, volatility, volume, levels:{sr,fib}, patterns, wyckoff, elliott, higher?, evidenceTable?, calibration?, timeframe }
   */
  function build(x, cfgIn) {
    var cfg = Object.assign({}, DEFAULTS, cfgIn || {});
    cfg.familyWeights = Object.assign({}, DEFAULTS.familyWeights, (cfgIn && cfgIn.familyWeights) || {});
    ["zone", "entry", "invalidation", "targets", "confirmation"].forEach(function (k) { cfg[k] = Object.assign({}, DEFAULTS[k], (cfgIn && cfgIn[k]) || {}); });
    if (x.ctx && isNum(x.ctx.atr) && isNum(x.ctx.close) && x.ctx.close > 0) {
      var tf0 = x.timeframe || (x.ctx.series && x.ctx.series.timeframe), minShare = typeof cfg.atrMinShareOfClose === "number" ? cfg.atrMinShareOfClose : (cfg.atrMinShareOfClose[tf0] || 0.005);
      var c0 = x.ctx.close, atr0 = Math.min(Math.max(x.ctx.atr, minShare * c0), cfg.atrMaxShareOfClose * c0);
      var cl = x.ctx.series && x.ctx.series.close, flat = 0;
      var tEnd = isNum(x.ctx.t) ? x.ctx.t : (cl ? cl.length - 1 : -1);   // nur bis zum Analysebar (kausal, Test TI-C2)
      if (cl) for (var i = tEnd; i > 0 && cl[i] === cl[i - 1]; i--) flat++;
      var staleN = cfg.staleFlatBars[x.timeframe || (x.ctx.series && x.ctx.series.timeframe)] || 4;
      x = Object.assign({}, x, { ctx: Object.assign({}, x.ctx, { atr: atr0, atrAdjusted: atr0 !== x.ctx.atr, stale: flat + 1 >= staleN, flatBars: flat + 1 }) });
    }
    var conf = confluence(x, cfg);
    /* Red-Team 2 H1: Eine enthaltene Elliott-Zaehlung (Anwendbarkeit NIEDRIG) darf das Szenario nicht formen – weder Einstieg,
       Invalidation, Ziele noch "Erwartete Struktur". Sie bleibt in der Elliott-Ansicht sichtbar, nicht in den Szenarien. */
    var E0 = x.elliott, shapes = !!(E0 && E0.primary && E0.applicability && !E0.applicability.abstain);
    x = Object.assign({}, x, { elliott: shapes ? E0 : null });
    var structuralLevel = shapes ? (E0.applicability.level === "HIGH" ? "HIGH" : "MODERATE") : "LOW";
    var scenarios = [];
    var d = conf.direction;
    if (d !== 0) {
      var prim = directional(x, d, cfg, "PRIMARY");
      if (prim) scenarios.push(prim);
    } else {
      var rg = rangeScenario(x, cfg);
      if (rg) scenarios.push(rg);
    }
    /* Alternative: Elliott-Alternative mit anderer Richtung, sonst Gegenrichtung (Pfad nach Invalidation). */
    var altDir = d !== 0 ? -d : (conf.agreement >= 0 ? 1 : -1);
    var alt = directional(x, altDir, cfg, "ALTERNATIVE");
    if (alt) {
      var p0 = scenarios[0];
      if (p0 && p0.invalidation) alt.trigger = { price: p0.invalidation.price, rule: "Wird " + p0.invalidation.price + " per Schlusskurs " + (p0.invalidation.direction === "below" ? "unterschritten" : "überschritten") + ", tritt diese Lesart in den Vordergrund" };
      var ealt = x.elliott && x.elliott.alternatives ? x.elliott.alternatives.filter(function (a) { return (a.nextMove === "UP") === (altDir > 0) || (a.currentWave.direction === "UP") === (altDir > 0); })[0] : null;
      if (ealt) alt.elliottAlternative = { pattern: ealt.patternName, wave: ealt.currentWave.label, invalidation: ealt.invalidation ? ealt.invalidation.price : null };
      scenarios.push(alt);
    }
    /* Tail: tiefere Korrektur (naechste tiefere Unterstuetzung) bzw. ausgedehnte Bewegung. */
    var p = scenarios[0];
    if (p && p.direction !== "NEUTRAL" && p.targets && p.targets.length) {
      var dd = p.direction === "BULLISH" ? 1 : -1, zs = dd > 0 ? x.levels.sr.supports : x.levels.sr.resistances;
      /* Die tiefere Zone muss vollstaendig JENSEITS der Invalidation liegen (sonst waere sie keine Tail-Lesart). */
      var inv = p.invalidation && isNum(p.invalidation.price) ? p.invalidation.price : null;
      var cT = x.ctx.close, deeper = inv === null ? null : zs.filter(function (z) { return (dd > 0 ? z.zoneHigh < inv && z.zoneLow > inv - 4 * x.ctx.atr : z.zoneLow > inv && z.zoneHigh < inv + 4 * x.ctx.atr) && z.zoneLow >= cT / cfg.targets.maxFactor && z.zoneHigh <= cT * cfg.targets.maxFactor; })[0];
      if (deeper) scenarios.push({ kind: "TAIL", direction: p.direction, template: "DEEPER_CORRECTION", status: "WATCH", entryZone: toZone({ lo: deeper.zoneLow, hi: deeper.zoneHigh, center: deeper.center, weight: deeper.strength, sources: [{ type: dd > 0 ? "SUPPORT" : "RESISTANCE", relation: "nächste stärkere Zone jenseits der Invalidation" }] }, x.ctx.atr, cfg, "Tiefere Zone"),
                                   invalidation: null, targets: p.targets.slice(0, 1), note: "Bruch der Invalidation, aber Halt an der nächsten größeren Zone" });
      else if (p.targets.length >= 2) scenarios.push({ kind: "TAIL", direction: p.direction, template: "EXTENDED_MOVE", status: "WATCH", entryZone: null, invalidation: p.invalidation,
                                   targets: [p.targets[p.targets.length - 1]], note: "Ausgedehnte Bewegung bis in die äußerste Zielzone" });
    }
    var empirical = null, sig = null;
    if (p && p.direction !== "NEUTRAL") {
      sig = signature(p, conf, E0, x.timeframe);
      empirical = empiricalLookup(x.evidenceTable, sig, cfg);
    }
    var calibrated = null;
    if (empirical && empirical.status === "OK" && x.calibration && x.calibration.passed && isNum(empirical.calibratedProbability)) calibrated = { probability: empirical.calibratedProbability, method: x.calibration.method, brier: x.calibration.brier };
    var overall = overallConfidence(conf, structuralLevel, empirical);
    if (x.ctx.stale) overall = { level: "LOW", reasons: ["STALE_PRICE"] };
    scenarios.forEach(function (s) { s.scenarioId = "tis_" + Hash.hashValue({ k: s.kind, d: s.direction, t: s.template, e: s.entryZone && [s.entryZone.zoneLow, s.entryZone.zoneHigh], i: s.invalidation && s.invalidation.price }).slice(0, 12); });   // ohne Zeitstempel: gleiche Lesart → gleiche ID (Alerts)
    return {
      engineVersion: ENGINE_VERSION, isProbability: !!calibrated,
      outlook: conf.outlook, confluence: conf, scenarios: scenarios,
      primary: scenarios[0] || null, alternative: scenarios.filter(function (s) { return s.kind === "ALTERNATIVE"; })[0] || null, tail: scenarios.filter(function (s) { return s.kind === "TAIL"; })[0] || null,
      confidence: { overall: overall.level, reasons: overall.reasons, structural: structuralLevel, agreement: conf.level, agreementValue: conf.agreement, empirical: empirical, calibrated: calibrated },
      signature: sig,
      dataStatus: { stale: !!x.ctx.stale, flatBars: x.ctx.flatBars || null, atrAdjusted: !!x.ctx.atrAdjusted, elliottShapesScenarios: shapes }
    };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, priceStep: priceStep, build: build, confluence: confluence, votes: votes, wilson: wilson, signature: signature, empiricalLookup: empiricalLookup, overallConfidence: overallConfidence, directional: directional };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIScenario = api; }
})(typeof window !== "undefined" ? window : globalThis);
