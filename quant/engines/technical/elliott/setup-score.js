/* =========================================================================
   VISION UNIVERSE TECHNICAL — elliott/setup-score.js
   SETUP-SCORE (Owner 24.11.2026): eine Zahl 0–100 je Aktie, wie geschlossen die Belege in eine Richtung zeigen.
   50 = kein Bild, über 50 = aufwärts, unter 50 = abwärts. Elliott liefert das Bild (Zonen, Ziele, Ungültig-Marke), der Score sagt,
   wie belastbar die Richtung ist.

   Bausteine (je −1 … +1) und Gewichte – VORHER festgelegt, nicht an die Vergangenheit angepasst (Rückwärtstest M3, 23.11.2026:
   Relative Stärke trägt die meiste Richtungsinformation, Trend und Momentum je etwas, die Elliott-Zählung allein keine):
     Relative Stärke  0,40   Perzentil der Rendite im Querschnitt aller Titel, 2·p − 1
     Trend            0,20   Schluss über (+1) oder unter (−1) dem 40-Wochen-Schnitt
     Momentum         0,20   26-Wochen-Rendite positiv (+1) oder negativ (−1)
     Elliott-Plan     0,20   Richtung des Kursziels im Pfad der Zählung von oben (+1 aufwärts, −1 abwärts, 0 ohne Pfad)
   Score = 50 + 50 · Σ Gewicht · Baustein. Stufen: ≥ 80 stark aufwärts, ≥ 65 aufwärts, ≤ 35 abwärts, ≤ 20 stark abwärts, sonst gemischt.
   Keine Wahrscheinlichkeit; was eine Stufe in der Vergangenheit bedeutete, misst scripts/technical/elliott-topdown/backtest.mjs (M4).
   ========================================================================= */
(function (global) {
  "use strict";
  var VERSION = "setup-score-1.0.0";
  var WEIGHTS = { rs: 0.4, trend: 0.2, mom: 0.2, elliott: 0.2 };
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function clamp(x) { return Math.max(-1, Math.min(1, x)); }
  /** Trend und Momentum aus einer Wochenreihe (Schlusskurse, kausal bis asOf). */
  function priceParts(close, asOf) {
    var n = isNum(asOf) ? asOf + 1 : close.length;
    if (n < 40) return null;
    var c = close[n - 1], sma = 0;
    for (var i = n - 40; i < n; i++) sma += close[i];
    sma /= 40;
    return { trend: c > sma ? 1 : -1, mom: n > 26 && close[n - 27] > 0 ? (c > close[n - 27] ? 1 : -1) : 0 };
  }
  /** parts: { rs: Perzentil 0..1 | null, trend: ±1, mom: ±1/0, elliott: "UP"|"DOWN"|null } */
  function score(parts) {
    if (!parts) return null;
    var b = { rs: isNum(parts.rs) ? clamp(2 * parts.rs - 1) : 0, trend: parts.trend || 0, mom: parts.mom || 0, elliott: parts.elliott === "UP" ? 1 : parts.elliott === "DOWN" ? -1 : 0 };
    var s = 0; Object.keys(WEIGHTS).forEach(function (k) { s += WEIGHTS[k] * b[k]; });
    var v = Math.round(50 + 50 * s);
    var level = v >= 80 ? "STRONG_UP" : v >= 65 ? "UP" : v <= 20 ? "STRONG_DOWN" : v <= 35 ? "DOWN" : "MIXED";
    return { v: v, level: level, dir: v > 50 ? "UP" : v < 50 ? "DOWN" : null, parts: b, version: VERSION };
  }
  /** Richtung des Elliott-Plans: Richtung des Kursziels (nach einer Wende die des zweiten Schritts), wie im Großen Bild. */
  function planDir(path) {
    var P = path || []; if (!P.length) return null;
    var d = function (s) { return s.dir || s.direction; };
    return P.length > 1 && d(P[0]) !== d(P[1]) ? d(P[1]) : d(P[0]);
  }
  var api = { VERSION: VERSION, WEIGHTS: WEIGHTS, score: score, priceParts: priceParts, planDir: planDir };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.SetupScore = api; }
})(typeof globalThis !== "undefined" ? globalThis : this);
