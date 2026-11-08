/* Europa-Spalten des Screeners: einfache Kennzahlen aus veröffentlichten, unbereinigten
   Tagesschlusskursen (discover/data/europe/series). Kein Fachmodell, keine Schätzung:
   Fehlt ein Wert oder ist das Fenster nicht lückenfrei genug, bleibt die Zelle leer (null).

   Regel (Strang M, 08.11.2026):
   - Fenster = die letzten N Börsentage des exakten Handelsplatzes (core/europe-exchange-calendar.js)
     bis zum letzten veröffentlichten Schluss der Aktie.
   - Kursveränderung 1M/3M/6M/1J (21/63/126/252 Börsentage): Schlusskurs am Anfangs- UND Endtag vorhanden,
     mindestens 90 % der Börsentage des Fensters mit Schlusskurs.
   - Abstand zum 52-Wochen-Hoch (252 Börsentage): mindestens 90 % der Börsentage mit Schlusskurs; Hoch = höchster Schluss.
   - Abstand zur 50-Tage-Linie: mindestens 90 % der letzten 50 Börsentage (45) mit Schlusskurs; Mittel nur über
     vorhandene Schlüsse, der letzte Schluss muss vorliegen.
   - Ein Sprung von mehr als 40 % zwischen zwei aufeinanderfolgenden Schlüssen im Fenster macht den Wert leer
     (möglicher Split oder Kapitalschnitt; die Kurse sind unbereinigt).
   Lücken werden nie aufgefüllt. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VUScreenerEuropeMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = 'vu-screener-europe-close-metrics-1';
  var RULE = { minCoverage: 0.9, maxJump: 0.4, windows: { r1m: 21, r3m: 63, r6m: 126, r1y: 252 }, high52w: 252, sma50: 50 };

  function finite(x) { return typeof x === 'number' && Number.isFinite(x) && x > 0; }
  function round(x, d) { var f = Math.pow(10, d); return Math.round(x * f) / f; }

  /** Die letzten n+1 erwarteten Börsentage (Anfangstag und n Folgetage) mit ihren Schlüssen oder null. */
  function window(expected, closes, n) {
    if (expected.length < n + 1) return null;
    return expected.slice(expected.length - n - 1).map(function (d) { return closes.has(d) ? closes.get(d) : null; });
  }
  function coverage(values) { var k = 0; values.forEach(function (v) { if (v !== null) k++; }); return k / values.length; }
  function jump(values) {
    var prev = null;
    for (var i = 0; i < values.length; i++) {
      var v = values[i]; if (v === null) continue;
      if (prev !== null && Math.abs(v / prev - 1) > RULE.maxJump) return true;
      prev = v;
    }
    return false;
  }

  /**
   * points: [[YYYY-MM-DD, close], ...] aufsteigend; expected: erwartete Börsentage (YYYY-MM-DD) des Handelsplatzes
   * bis einschließlich zum letzten Punkt. Ergebnis: Kennzahlen in Prozent oder null, dazu der Grund je Feld.
   */
  function compute(points, expected) {
    var out = { values: {}, reasons: {} };
    var closes = new Map();
    (points || []).forEach(function (p) { if (Array.isArray(p) && typeof p[0] === 'string' && finite(p[1])) closes.set(p[0], p[1]); });
    var last = expected.length ? expected[expected.length - 1] : null;
    var close = last && closes.has(last) ? closes.get(last) : null;
    out.values.price = close;
    function set(id, value, reason) { out.values[id] = value === null ? null : round(value, 2); if (value === null) out.reasons[id] = reason; }
    Object.keys(RULE.windows).forEach(function (id) {
      var n = RULE.windows[id], w = window(expected, closes, n);
      if (close === null) return set(id, null, 'NO_CLOSE_AT_LAST_SESSION');
      if (!w) return set(id, null, 'HISTORY_TOO_SHORT');
      if (w[0] === null) return set(id, null, 'NO_CLOSE_AT_WINDOW_START');
      if (coverage(w) < RULE.minCoverage) return set(id, null, 'WINDOW_COVERAGE_BELOW_90');
      if (jump(w)) return set(id, null, 'POSSIBLE_CORPORATE_ACTION');
      set(id, (close / w[0] - 1) * 100);
    });
    var h = window(expected, closes, RULE.high52w - 1);
    if (close === null) set('fromHigh52w', null, 'NO_CLOSE_AT_LAST_SESSION');
    else if (!h) set('fromHigh52w', null, 'HISTORY_TOO_SHORT');
    else if (coverage(h) < RULE.minCoverage) set('fromHigh52w', null, 'WINDOW_COVERAGE_BELOW_90');
    else if (jump(h)) set('fromHigh52w', null, 'POSSIBLE_CORPORATE_ACTION');
    else set('fromHigh52w', (close / Math.max.apply(null, h.filter(function (v) { return v !== null; })) - 1) * 100);
    var s = window(expected, closes, RULE.sma50 - 1);
    if (close === null) set('vsSma50', null, 'NO_CLOSE_AT_LAST_SESSION');
    else if (!s) set('vsSma50', null, 'HISTORY_TOO_SHORT');
    else if (coverage(s) < RULE.minCoverage) set('vsSma50', null, 'WINDOW_COVERAGE_BELOW_90');
    else if (jump(s)) set('vsSma50', null, 'POSSIBLE_CORPORATE_ACTION');
    else set('vsSma50', (close / (function (v) { return v.reduce(function (a, b) { return a + b; }, 0) / v.length; })(s.filter(function (v) { return v !== null; })) - 1) * 100);
    var g = window(expected, closes, Math.min(RULE.high52w - 1, expected.length - 1));
    out.values.coverage1y = g ? round(coverage(g) * 100, 1) : null;
    return out;
  }

  return { VERSION: VERSION, RULE: RULE, compute: compute };
});
