/* =========================================================================
   VISION UNIVERSE TECHNICAL — elliott/rules.js
   ELLIOTT CONSTRAINT LIBRARY (versioniert)

   Getrennt in HARD RULE (Gate — Verletzung verwirft den Kandidaten),
   GUIDELINE (rankt, legitimiert nie eine Regelverletzung) und HEURISTIC.

   V1: Standard Impulse (5 Legs) + Simple Zigzag (3 Legs). Eine Welle wird
   ueber ihre Legs (Segmente) beschrieben: legs[k] = {fromPrice, toPrice,
   duration, ...}. Bullish/bearish werden gespiegelt geprueft.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);

  var RULE_SET_VERSION = "elliott-rules-1.0.0";

  function len(l) { return Math.abs(l.toPrice - l.fromPrice); }
  function ratio(a, b) { return b > 0 ? a / b : Infinity; }

  /**
   * Standard Impulse: legs 0..4 = Wellen 1..5 (Welle 5 optional fuer
   * developing Kandidaten). sign = +1 bullish, −1 bearish.
   */
  function impulseHardRules(legs, sign) {
    var res = [];
    var w1 = legs[0], w2 = legs[1], w3 = legs[2], w4 = legs[3], w5 = legs[4];
    function rule(id, ok, detail) { res.push({ ruleId: id, type: "HARD", passed: ok, detail: detail }); }
    if (w1) {
      /* Wellenrichtungen: 1,3,5 in Trendrichtung; 2,4 dagegen. */
      var dirOk = true;
      legs.forEach(function (l, k) { var d = (l.toPrice - l.fromPrice) * sign; if ((k % 2 === 0 && d <= 0) || (k % 2 === 1 && d >= 0)) dirOk = false; });
      rule("MOTIVE_ALTERNATION", dirOk, "5 alternierende Segmente in Trendrichtung");
    }
    if (w2) rule("W2_NOT_BEYOND_W1_ORIGIN", (w2.toPrice - w1.fromPrice) * sign > 0, "W2-Ende " + w2.toPrice + " vs. W1-Ursprung " + w1.fromPrice);
    if (w3) rule("W3_BEYOND_W1_END", (w3.toPrice - w1.toPrice) * sign > 0, "W3-Ende " + w3.toPrice + " vs. W1-Ende " + w1.toPrice);
    if (w4) {
      rule("W4_NO_W1_OVERLAP", (w4.toPrice - w1.toPrice) * sign > 0, "W4-Ende " + w4.toPrice + " vs. W1-Ende " + w1.toPrice);
      rule("W4_NOT_BEYOND_W3_ORIGIN", (w4.toPrice - w3.fromPrice) * sign > 0, "W4-Ende " + w4.toPrice + " vs. W3-Ursprung " + w3.fromPrice);
    }
    if (w5) rule("W3_NOT_SHORTEST", len(w3) >= Math.min(len(w1), len(w5)), "len1=" + len(w1).toFixed(2) + " len3=" + len(w3).toFixed(2) + " len5=" + len(w5).toFixed(2));
    else if (w3) {
      /* Ohne W5 pruefbar: W3 kuerzer als W1 UND W3 waere zwingend kuerzeste, wenn W5 >= W3 … nicht entscheidbar → offen. */
      res.push({ ruleId: "W3_NOT_SHORTEST", type: "HARD", passed: null, detail: "erst mit Welle 5 pruefbar" });
    }
    return res;
  }

  /** Simple Zigzag: legs 0..2 = A, B, C. sign = Richtung von A. */
  function zigzagHardRules(legs, sign) {
    var res = [], a = legs[0], b = legs[1], c = legs[2];
    function rule(id, ok, detail) { res.push({ ruleId: id, type: "HARD", passed: ok, detail: detail }); }
    if (a) {
      var dirOk = (a.toPrice - a.fromPrice) * sign > 0 && (!b || (b.toPrice - b.fromPrice) * sign < 0) && (!c || (c.toPrice - c.fromPrice) * sign > 0);
      rule("ZIGZAG_ALTERNATION", dirOk, "A und C in Korrekturrichtung, B dagegen");
    }
    if (b) rule("B_NOT_BEYOND_A_ORIGIN", (b.toPrice - a.fromPrice) * sign > 0, "B-Ende " + b.toPrice + " vs. A-Ursprung " + a.fromPrice);
    if (c) rule("C_BEYOND_B_END", (c.toPrice - b.toPrice) * sign > 0, "C bewegt sich ueber B hinaus");
    return res;
  }

  function within(x, band) { return x >= band[0] && x <= band[1]; }
  function bandScore(x, ideal, acceptable) {
    if (!Number.isFinite(x)) return 0;
    if (within(x, ideal)) return 1;
    if (within(x, acceptable)) {
      var d = x < ideal[0] ? (ideal[0] - x) / (ideal[0] - acceptable[0]) : (x - ideal[1]) / (acceptable[1] - ideal[1]);
      return Math.max(0, 1 - d);
    }
    return 0;
  }

  /** Guidelines/Heuristiken eines Impulses → Soft Metrics 0..1 je Kriterium. */
  function impulseGuidelines(legs, g) {
    g = g || {};
    var w1 = legs[0], w2 = legs[1], w3 = legs[2], w4 = legs[3], w5 = legs[4];
    var m = {};
    if (w2) m.W2_RETRACE_RATIO = bandScore(ratio(len(w2), len(w1)), gl(g, "W2_RETRACE_RATIO", [0.5, 0.618], [0.236, 0.9]));
    if (w3) m.W3_EXTENSION_RATIO = bandScore(ratio(len(w3), len(w1)), gl(g, "W3_EXTENSION_RATIO", [1.618, 2.618], [1.0, 4.236]));
    if (w4) m.W4_RETRACE_RATIO = bandScore(ratio(len(w4), len(w3)), gl(g, "W4_RETRACE_RATIO", [0.236, 0.382], [0.1, 0.618]));
    if (w5) m.W5_RATIO_TO_W1 = bandScore(ratio(len(w5), len(w1)), gl(g, "W5_RATIO_TO_W1", [0.618, 1.0], [0.382, 1.618]));
    if (w2 && w4) {
      var depthDiff = Math.abs(ratio(len(w2), len(w1)) - ratio(len(w4), len(w3)));
      var timeDiff = Math.abs(Math.log((w2.duration || 1) / (w4.duration || 1)));
      m.ALTERNATION = Math.min(1, depthDiff / 0.3 * 0.5 + Math.min(1, timeDiff / Math.log(2)) * 0.5);
    }
    if (w3 && w1 && w3.momentumSummary && w1.momentumSummary) m.MOMENTUM_W3 = w3.momentumSummary.perBar >= w1.momentumSummary.perBar ? 1 : 0.4;
    if (w3 && w1 && w3.volumeProfileSummary && w1.volumeProfileSummary) m.VOLUME_W3 = w3.volumeProfileSummary.mean >= w1.volumeProfileSummary.mean ? 1 : 0.5;
    if (w1 && w3 && w5) {
      /* Kanal: Linie durch Ende W2/W4 und Parallele durch Ende W3 → W5-Ende nahe Kanal. */
      var t2 = w2.toIndex, t4 = w4.toIndex, p2 = w2.toPrice, p4 = w4.toPrice;
      var slope = t4 !== t2 ? (p4 - p2) / (t4 - t2) : 0;
      var upper = w3.toPrice + slope * (w5.toIndex - w3.toIndex);
      var dev = Math.abs(w5.toPrice - upper) / Math.max(1e-9, len(w3));
      m.CHANNEL_FIT = Math.max(0, 1 - dev / 0.5);
    }
    return m;
  }

  function zigzagGuidelines(legs, g) {
    g = g || {};
    var a = legs[0], b = legs[1], c = legs[2], m = {};
    if (b) m.B_RETRACE_RATIO = bandScore(ratio(len(b), len(a)), gl(g, "B_RETRACE_RATIO", [0.382, 0.786], [0.1, 0.99]));
    if (c) m.C_RATIO_TO_A = bandScore(ratio(len(c), len(a)), gl(g, "C_RATIO_TO_A", [0.618, 1.618], [0.382, 2.618]));
    return m;
  }

  function gl(g, id, ideal, acceptable) {
    var spec = (g[id] || {});
    return [spec.ideal || ideal, spec.acceptable || acceptable];
  }
  /* bandScore mit [ideal, acceptable]-Paar */
  var _bandScore = bandScore;
  bandScore = function (x, pair) { return Array.isArray(pair[0]) ? _bandScore(x, pair[0], pair[1]) : _bandScore(x, pair, pair); };

  /** Objektive Invalidation aus Hard Rules fuer die laufende Welle. */
  function impulseInvalidation(legs, sign, developingWave) {
    var w1 = legs[0], w2 = legs[1], w3 = legs[2], w4 = legs[3];
    var dir = sign > 0 ? "below" : "above";
    switch (developingWave) {
      case 2: return { price: w1.fromPrice, direction: dir, ruleId: "W2_NOT_BEYOND_W1_ORIGIN", statement: "Count invalid " + dir + " W1-Ursprung " + w1.fromPrice };
      case 3: return { price: w2.toPrice, direction: dir, ruleId: "W2_NOT_BEYOND_W1_ORIGIN", statement: "Count invalid " + dir + " W2-Ende " + w2.toPrice + " (W2 wuerde > 100 % retracen)" };
      case 4: return { price: w1.toPrice, direction: dir, ruleId: "W4_NO_W1_OVERLAP", statement: "Standard-Impuls invalid bei Eintritt in W1-Gebiet (" + w1.toPrice + ")" };
      case 5: return { price: w4.toPrice, direction: dir, ruleId: "W4_NOT_BEYOND_W3_ORIGIN", statement: "Count invalid " + dir + " W4-Ende " + w4.toPrice };
      default: return { price: w3 ? w4 ? w4.toPrice : w2.toPrice : w1 ? w1.fromPrice : null, direction: dir, ruleId: "STRUCTURE", statement: "letztes strukturelles Korrekturende" };
    }
  }
  function zigzagInvalidation(legs, sign, developingWave) {
    var a = legs[0], b = legs[1];
    var dir = sign > 0 ? "below" : "above";     // sign = Richtung von A
    switch (developingWave) {
      case 2: return { price: a.fromPrice, direction: dir, ruleId: "B_NOT_BEYOND_A_ORIGIN", statement: "Zigzag invalid " + dir + " A-Ursprung " + a.fromPrice };
      case 3: return { price: b.toPrice, direction: dir, ruleId: "C_BEYOND_B_END", statement: "Zigzag invalid, wenn der Kurs das B-Ende (" + b.toPrice + ") gegen die C-Richtung durchbricht" };
      default: return { price: a ? a.fromPrice : null, direction: dir, ruleId: "STRUCTURE", statement: "A-Ursprung" };
    }
  }

  var api = { RULE_SET_VERSION: RULE_SET_VERSION, len: len, ratio: ratio, bandScore: bandScore,
              impulseHardRules: impulseHardRules, zigzagHardRules: zigzagHardRules, impulseGuidelines: impulseGuidelines, zigzagGuidelines: zigzagGuidelines,
              impulseInvalidation: impulseInvalidation, zigzagInvalidation: zigzagInvalidation };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ElliottRules = api; }
})(typeof window !== "undefined" ? window : globalThis);
