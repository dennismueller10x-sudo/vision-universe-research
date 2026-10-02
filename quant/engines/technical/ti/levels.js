/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/levels.js
   SUPPORT/RESISTANCE-ZONEN + FIBONACCI-KONFLUENZ (as-of)

   SUPPORT/RESISTANCE
   Zonen statt Linien: bestaetigte Swing-Extreme (Skalen 2–4) werden
   ATR-tolerant geclustert. Gewicht = Anzahl Skalen, auf denen das Extrem
   existiert (Signifikanz) × Aktualitaet (Halbwertszeit 1 Jahr) — mehrfach
   beruehrte Bereiche werden staerker. Dazu offene Kursluecken und das
   52-Wochen-Hoch/Tief. Mechanismus: Auftragsballung an markanten Preisen
   (Osler 2000/2003; Kavajecz & Odders-White 2004) — Evidenzgrad B/C.

   FIBONACCI
   Retracements/Extensions nur von OBJEKTIVEN Ankern (bestaetigte Swings
   mehrerer Skalen). Ein einzelnes Fib-Niveau hat keine belegte Sonder-
   stellung (Tsinaslanidis et al. 2022: "Treffer" steigen mit der
   Zonenbreite, nicht mit dem Verhaeltnis). VU nutzt Fibonacci deshalb nur
   als KONFLUENZ: wo mehrere Anker auf denselben Bereich zeigen, entsteht
   ein Cluster. Ob 38,2/50/61,8 % empirisch haeufiger Wendepunkte sind als
   Nachbarverhaeltnisse, prueft die Evidence-Schicht (fib-study).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "ti-levels-1.0.0";
  var RETRACEMENTS = [0.236, 0.382, 0.5, 0.618, 0.786];
  var EXTENSIONS = [1.272, 1.618, 2.0, 2.618];

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function r4(v) { return isNum(v) ? Math.round(v * 1e4) / 1e4 : null; }

  function supportResistance(ctx, opts) {
    opts = opts || {};
    var s = ctx.series, t = ctx.t, atr = ctx.atr, close = ctx.close, bpy = ctx.profile.barsPerYear;
    var lookback = opts.lookbackBars || bpy * 3, from = Math.max(0, t - lookback);
    var tol = Math.max(0.6 * atr, 0.008 * close);
    var sig = {}, pts = [];
    ctx.scaleIds.slice(1).forEach(function (sid) {
      var v = ctx.view(sid); if (!v) return;
      v.confirmed.forEach(function (p) { if (p.pivotIndex < from) return; var key = p.side + "@" + p.pivotIndex; sig[key] = (sig[key] || 0) + 1; if (sig[key] === 1) pts.push(p); });
    });
    var items = pts.map(function (p) {
      var age = (t - p.pivotIndex) / bpy, recency = Math.pow(0.5, age);
      return { price: p.pivotPrice, weight: (sig[p.side + "@" + p.pivotIndex] || 1) * (0.4 + 0.6 * recency), kind: p.side === "HIGH" ? "SWING_HIGH" : "SWING_LOW", time: p.pivotTime, index: p.pivotIndex };
    });
    /* 52-Wochen-Extreme als Referenz. */
    var h52 = ctx.col("high52w"), l52 = ctx.col("low52w");
    if (isNum(h52)) items.push({ price: h52, weight: 1, kind: "HIGH_52W" });
    if (isNum(l52)) items.push({ price: l52, weight: 1, kind: "LOW_52W" });
    /* Offene Luecken (nur echte OHLC-Bars). */
    if (!ctx.closeOnly) {
      for (var k = Math.max(1, t - bpy); k <= t; k++) {
        var up = s.low[k] > s.high[k - 1], dn = s.high[k] < s.low[k - 1];
        if (!up && !dn) continue;
        var gLo = up ? s.high[k - 1] : s.high[k], gHi = up ? s.low[k] : s.low[k - 1], filled = false;
        for (var j = k + 1; j <= t; j++) { if (up ? s.low[j] <= gLo : s.high[j] >= gHi) { filled = true; break; } }
        if (!filled && gHi - gLo > 0.3 * atr) { items.push({ price: gLo, weight: 0.6, kind: "GAP_EDGE", time: s.timestamps[k] }); items.push({ price: gHi, weight: 0.6, kind: "GAP_EDGE", time: s.timestamps[k] }); }
      }
    }
    items.sort(function (a, b) { return a.price - b.price; });
    var clusters = [], cur = null;
    items.forEach(function (it) {
      if (cur && it.price - cur.hi <= tol) { cur.items.push(it); cur.hi = it.price; }
      else { cur = { items: [it], lo: it.price, hi: it.price }; clusters.push(cur); }
    });
    var zones = clusters.map(function (c) {
      var w = c.items.reduce(function (a, x) { return a + x.weight; }, 0);
      var center = c.items.reduce(function (a, x) { return a + x.price * x.weight; }, 0) / w;
      var lo = Math.min(c.lo, center - 0.25 * atr), hi = Math.max(c.hi, center + 0.25 * atr);
      var role = hi < close ? "SUPPORT" : lo > close ? "RESISTANCE" : "INSIDE";
      return { zoneLow: r4(lo), zoneHigh: r4(hi), center: r4(center), strength: r4(w), touches: c.items.filter(function (x) { return x.kind === "SWING_HIGH" || x.kind === "SWING_LOW"; }).length,
               kinds: Array.from(new Set(c.items.map(function (x) { return x.kind; }))), role: role, distanceAtr: r4((center - close) / atr) };
    }).filter(function (z) { return z.strength >= 0.8; });
    var supports = zones.filter(function (z) { return z.role !== "RESISTANCE" && z.center <= close; }).sort(function (a, b) { return b.center - a.center; });
    var resistances = zones.filter(function (z) { return z.role !== "SUPPORT" && z.center >= close; }).sort(function (a, b) { return a.center - b.center; });
    return { engineVersion: ENGINE_VERSION, family: "SUPPORT_RESISTANCE", evidenceGrade: "B", zones: zones, nearestSupport: supports[0] || null, nearestResistance: resistances[0] || null,
             supports: supports.slice(0, 4), resistances: resistances.slice(0, 4), tolerance: r4(tol),
             source: "Osler (2000, 2003); Kavajecz & Odders-White (2004)" };
  }

  /** Fibonacci-Niveaus eines Swings A→B: Retracements zurueck Richtung A,
      Extensions als Vielfaches der Swinglaenge ab A (1,272 / 1,618 … ueber B hinaus). */
  function fibOfSwing(a, b, label) {
    var d = b - a, out = [];
    RETRACEMENTS.forEach(function (r) { out.push({ kind: "RETRACEMENT", ratio: r, price: b - d * r, anchor: label }); });
    EXTENSIONS.forEach(function (r) { out.push({ kind: "EXTENSION", ratio: r, price: a + d * r, anchor: label }); });
    return out;
  }

  function fibonacci(ctx) {
    var anchors = [], atr = ctx.atr, close = ctx.close;
    ctx.scaleIds.slice(1).forEach(function (sid) {
      var v = ctx.view(sid); if (!v || !v.confirmed.length) return;
      var c = v.confirmed, last = c[c.length - 1], prev = c[c.length - 2];
      /* Juengster abgeschlossener Swing + (falls vorhanden) laufender Swing. */
      if (prev) anchors.push({ a: prev, b: last, label: sid + ":" + prev.pivotTime + "→" + last.pivotTime });
      if (v.developing) anchors.push({ a: last, b: v.developing, label: sid + ":" + last.pivotTime + "→laufend", developing: true });
    });
    var levels = [];
    anchors.forEach(function (an) { fibOfSwing(an.a.pivotPrice, an.b.pivotPrice, an.label).forEach(function (l) { l.developing = !!an.developing; levels.push(l); }); });
    levels = levels.filter(function (l) { return l.price > 0 && Math.abs(l.price - close) <= 8 * atr; });
    levels.sort(function (x, y) { return x.price - y.price; });
    var tol = 0.5 * atr, clusters = [], cur = null;
    levels.forEach(function (l) {
      if (cur && l.price - cur.hi <= tol) { cur.items.push(l); cur.hi = l.price; }
      else { cur = { items: [l], lo: l.price, hi: l.price }; clusters.push(cur); }
    });
    var cl = clusters.filter(function (c) { return new Set(c.items.map(function (x) { return x.anchor; })).size >= 2; }).map(function (c) {
      var center = c.items.reduce(function (a, x) { return a + x.price; }, 0) / c.items.length;
      return { zoneLow: r4(Math.min(c.lo, center - 0.25 * atr)), zoneHigh: r4(Math.max(c.hi, center + 0.25 * atr)), center: r4(center), anchors: c.items.length,
               members: c.items.map(function (x) { return x.kind + " " + x.ratio + " (" + x.anchor + ")"; }), role: center < close ? "BELOW" : "ABOVE" };
    });
    return { engineVersion: ENGINE_VERSION, family: "FIBONACCI", evidenceGrade: "C", levels: levels.map(function (l) { return { kind: l.kind, ratio: l.ratio, price: r4(l.price), anchor: l.anchor, developing: l.developing }; }),
             clusters: cl, note: "Fibonacci nur als Konfluenz mehrerer objektiver Anker; einzelne Niveaus haben keine belegte Sonderstellung.",
             source: "Frost & Prechter (2005) Kap. 4; Tsinaslanidis, Guijarro & Voukelatos (2022)" };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, RETRACEMENTS: RETRACEMENTS, EXTENSIONS: EXTENSIONS, supportResistance: supportResistance, fibonacci: fibonacci, fibOfSwing: fibOfSwing };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TILevels = api; }
})(typeof window !== "undefined" ? window : globalThis);
