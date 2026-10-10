/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/chart-patterns.js
   KLASSISCHE CHARTFORMATIONEN (as-of, nur bestaetigte Pivots)

   Auswahl nach Formalisierbarkeit + Evidenz + Nutzen fuer Anleger:
     Double Top/Bottom, Head & Shoulders (+ invers), Dreiecke
     (aufsteigend/absteigend/symmetrisch), Rechteck, Flagge, Cup & Handle.
   Bewusst NICHT implementiert: Kerzenmuster (Marshall, Young & Rose 2006:
   kein Mehrwert), Wedges/Broadening (schwach formalisierbar, kaum
   Evidenz), Island Reversals (selten).

   Evidenz: Lo, Mamaysky & Wang (2000) — Formationen veraendern die
   bedingte Renditeverteilung (Informationsgehalt), Savin, Weller &
   Zvingelis (2007) — H&S nur in Kombination nuetzlich; Bulkowski (2005)
   liefert Praktiker-Basisraten (keine Signifikanztests). Grad C.
   Ob eine Formation in VU-Daten mehr leistet als der geometrisch gleiche
   Zufallseinstieg, misst die Evidence-Schicht.

   KAUSALITAET (wichtig, weil LMW mit zentrierten Kernel-Fenstern
   arbeiten, die live nicht verfuegbar sind): Formationen bestehen nur aus
   Pivots mit confirmedIndex <= t. Ein Ausbruch zaehlt ab dem ersten
   Schlusskurs jenseits der Nackenlinie NACH der Bestaetigung des letzten
   Formationspivots: detectionIndex = max(Ausbruchs-Bar, Bestaetigung).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "ti-chart-patterns-1.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function r4(v) { return isNum(v) ? Math.round(v * 1e4) / 1e4 : null; }

  var NAMES_DE = {
    DOUBLE_TOP: "Doppeltop", DOUBLE_BOTTOM: "Doppelboden", HEAD_AND_SHOULDERS: "Schulter-Kopf-Schulter", INVERSE_HEAD_AND_SHOULDERS: "Umgekehrte Schulter-Kopf-Schulter",
    ASCENDING_TRIANGLE: "Aufsteigendes Dreieck", DESCENDING_TRIANGLE: "Absteigendes Dreieck", SYMMETRICAL_TRIANGLE: "Symmetrisches Dreieck",
    RECTANGLE: "Seitwärtsrange (Rechteck)", BULL_FLAG: "Bullische Flagge", BEAR_FLAG: "Bärische Flagge", CUP_WITH_HANDLE: "Tasse mit Henkel"
  };

  /** Erster Schlusskurs jenseits einer (ggf. schraegen) Linie zwischen from+1 und t. */
  function firstCross(ctx, from, line, dir) {
    var s = ctx.series;
    for (var k = from + 1; k <= ctx.t; k++) {
      var lv = typeof line === "function" ? line(k) : line;
      if (dir > 0 ? s.close[k] > lv : s.close[k] < lv) return k;
    }
    return -1;
  }
  function lineThrough(p, q) { var m = (q.pivotPrice - p.pivotPrice) / Math.max(1, q.pivotIndex - p.pivotIndex); return function (k) { return p.pivotPrice + m * (k - p.pivotIndex); }; }

  /** Status nach dem letzten Formationspivot: Ausbruch, Fehlausbruch, Retest. */
  function resolve(ctx, last, breakLine, dir, invalidLevel) {
    var startIdx = last.pivotIndex;
    var bIdx = firstCross(ctx, startIdx, breakLine, dir);
    var invIdx = firstCross(ctx, startIdx, invalidLevel, -dir);
    var detection = bIdx >= 0 ? Math.max(bIdx, last.confirmedIndex) : -1;
    if (invIdx >= 0 && (bIdx < 0 || invIdx < bIdx)) return { status: "FAILED", failedIndex: invIdx };
    if (bIdx < 0) return { status: "FORMING", detectionIndex: last.confirmedIndex };
    /* Nach dem Ausbruch: Ruecklauf unter die Ausbruchslinie per Schluss = Fehlausbruch. */
    var s = ctx.series, lv = typeof breakLine === "function" ? breakLine(bIdx) : breakLine, retest = false, failed = -1;
    for (var k = detection + 1; k <= ctx.t; k++) {
      if (dir > 0 ? s.close[k] < lv - 0.5 * ctx.atr : s.close[k] > lv + 0.5 * ctx.atr) { failed = k; break; }
      if (Math.abs((dir > 0 ? s.low[k] : s.high[k]) - lv) <= 0.5 * ctx.atr) retest = true;
    }
    if (failed >= 0) return { status: "FAILED_BREAKOUT", breakoutIndex: bIdx, detectionIndex: detection, failedIndex: failed };
    return { status: retest ? "BREAKOUT_RETEST" : "BREAKOUT", breakoutIndex: bIdx, detectionIndex: detection, breakoutLevel: lv };
  }

  function pack(ctx, type, dir, pts, res, breakLevel, height, invalidation, extra) {
    var atr = ctx.atr;
    var base = isNum(breakLevel) ? breakLevel : ctx.close;
    var tgt = base + dir * height;
    var o = {
      type: type, name: NAMES_DE[type], direction: dir > 0 ? "BULLISH" : "BEARISH", status: res.status,
      points: pts.map(function (p) { return { side: p.side, time: p.pivotTime, price: r4(p.pivotPrice), confirmedAt: p.confirmedAt }; }),
      startTime: pts[0].pivotTime, endTime: pts[pts.length - 1].pivotTime, breakoutLevel: r4(breakLevel), height: r4(height),
      target: { zoneLow: r4(Math.min(tgt - 0.5 * atr, tgt + 0.5 * atr)), zoneHigh: r4(Math.max(tgt - 0.5 * atr, tgt + 0.5 * atr)), method: "MEASURED_MOVE", relation: "Höhe der Formation ab Ausbruchslinie" },
      invalidation: { price: r4(invalidation), direction: dir > 0 ? "below" : "above" },
      detectionIndex: res.detectionIndex === undefined ? null : res.detectionIndex,
      detectionTime: isNum(res.detectionIndex) ? ctx.series.timestamps[res.detectionIndex] : null,
      breakoutTime: isNum(res.breakoutIndex) ? ctx.series.timestamps[res.breakoutIndex] : null,
      barsSinceBreakout: isNum(res.breakoutIndex) ? ctx.t - res.breakoutIndex : null
    };
    return Object.assign(o, extra || {});
  }

  function analyze(ctx, opts) {
    opts = opts || {};
    var scaleId = opts.scaleId || "scale-2", v = ctx.view(scaleId);
    if (!v || v.confirmed.length < 4) return { engineVersion: ENGINE_VERSION, family: "PATTERN", evidenceGrade: "C", patterns: [], active: [], status: "UNAVAILABLE", reason: "TOO_FEW_SWINGS" };
    var c = v.confirmed, n = c.length, atr = ctx.atr, close = ctx.close, bpy = ctx.profile.barsPerYear;
    var tol = Math.max(0.75 * atr, 0.025 * close), minSep = Math.max(2, Math.round(bpy / 25)), maxAge = Math.round(bpy / 3);
    var found = [];
    function last(k) { return c[n - k]; }

    /* ---- Double Top / Bottom: X-H1-L-H2 bzw. X-L1-H-L2 ---- */
    if (n >= 4) {
      var a = last(3), m = last(2), b = last(1), pre = last(4);
      if (a.side === b.side && b.pivotIndex - a.pivotIndex >= minSep && Math.abs(a.pivotPrice - b.pivotPrice) <= tol) {
        var dir = a.side === "HIGH" ? -1 : 1;
        var top = a.side === "HIGH" ? Math.max(a.pivotPrice, b.pivotPrice) : Math.min(a.pivotPrice, b.pivotPrice);
        var height = Math.abs(top - m.pivotPrice);
        var priorTrend = dir < 0 ? pre.pivotPrice < m.pivotPrice : pre.pivotPrice > m.pivotPrice;
        if (height >= 2.5 * atr && priorTrend) {
          var res = resolve(ctx, b, m.pivotPrice, dir, top);
          found.push(pack(ctx, dir < 0 ? "DOUBLE_TOP" : "DOUBLE_BOTTOM", dir, [a, m, b], res, m.pivotPrice, height, top));
        }
      }
    }
    /* ---- Head & Shoulders: S1-N1-K-N2-S2 ---- */
    if (n >= 5) {
      var s1 = last(5), n1 = last(4), hd = last(3), n2 = last(2), s2 = last(1);
      if (s1.side === hd.side && hd.side === s2.side) {
        var d2 = s1.side === "HIGH" ? -1 : 1;   // H&S-Top → bearish
        var ext = function (p) { return -d2 * p.pivotPrice; };          // "höher" im Musterrichtungssinn
        var headDominant = ext(hd) > Math.max(ext(s1), ext(s2)) + 0.5 * tol;
        var shouldersMatch = Math.abs(s1.pivotPrice - s2.pivotPrice) <= 1.5 * tol;
        var neck = lineThrough(n1, n2);
        var headHeight = Math.abs(hd.pivotPrice - neck(hd.pivotIndex));
        if (headDominant && shouldersMatch && headHeight >= 3 * atr) {
          var res2 = resolve(ctx, s2, neck, d2, hd.pivotPrice);
          var lvl = isNum(res2.breakoutLevel) ? res2.breakoutLevel : neck(ctx.t);
          found.push(pack(ctx, d2 < 0 ? "HEAD_AND_SHOULDERS" : "INVERSE_HEAD_AND_SHOULDERS", d2, [s1, n1, hd, n2, s2], res2, lvl, headHeight, s2.pivotPrice,   /* ungueltig jenseits der rechten Schulter */
            { neckline: { from: { time: n1.pivotTime, price: r4(n1.pivotPrice) }, to: { time: n2.pivotTime, price: r4(n2.pivotPrice) }, atNow: r4(neck(ctx.t)) } }));
        }
      }
    }
    /* ---- Dreiecke / Rechteck: die letzten 4–5 Pivots ---- */
    if (n >= 4) {
      var win = c.slice(Math.max(0, n - 5));
      var highs = win.filter(function (p) { return p.side === "HIGH"; }), lows = win.filter(function (p) { return p.side === "LOW"; });
      if (highs.length >= 2 && lows.length >= 2) {
        var hA = highs[0], hB = highs[highs.length - 1], lA = lows[0], lB = lows[lows.length - 1];
        var flatH = Math.abs(hA.pivotPrice - hB.pivotPrice) <= tol, flatL = Math.abs(lA.pivotPrice - lB.pivotPrice) <= tol;
        var fallingH = hB.pivotPrice < hA.pivotPrice - tol * 0.5, risingL = lB.pivotPrice > lA.pivotPrice + tol * 0.5;
        var width = Math.max(hA.pivotPrice, hB.pivotPrice) - Math.min(lA.pivotPrice, lB.pivotPrice);
        var type = flatH && risingL ? "ASCENDING_TRIANGLE" : flatL && fallingH ? "DESCENDING_TRIANGLE" : fallingH && risingL ? "SYMMETRICAL_TRIANGLE" : flatH && flatL && width >= 3 * atr ? "RECTANGLE" : null;
        if (type && width >= 2.5 * atr) {
          var upper = flatH ? function () { return Math.max(hA.pivotPrice, hB.pivotPrice); } : lineThrough(hA, hB);
          var lower = flatL ? function () { return Math.min(lA.pivotPrice, lB.pivotPrice); } : lineThrough(lA, lB);
          var lastP = win[win.length - 1];
          var upIdx = firstCross(ctx, lastP.pivotIndex, upper, 1), dnIdx = firstCross(ctx, lastP.pivotIndex, lower, -1);
          var dir3 = upIdx >= 0 && (dnIdx < 0 || upIdx < dnIdx) ? 1 : dnIdx >= 0 ? -1 : (type === "ASCENDING_TRIANGLE" ? 1 : type === "DESCENDING_TRIANGLE" ? -1 : 0);
          var res3;
          if (dir3 === 0) res3 = { status: "FORMING", detectionIndex: lastP.confirmedIndex };
          else res3 = resolve(ctx, lastP, dir3 > 0 ? upper : lower, dir3, dir3 > 0 ? lower(ctx.t) : upper(ctx.t));
          var bl = dir3 >= 0 ? upper(ctx.t) : lower(ctx.t);
          found.push(pack(ctx, type, dir3 >= 0 ? 1 : -1, win, res3, isNum(res3.breakoutLevel) ? res3.breakoutLevel : bl, width, dir3 >= 0 ? lower(ctx.t) : upper(ctx.t),
            { bias: dir3 === 0 ? "OPEN" : null, upperNow: r4(upper(ctx.t)), lowerNow: r4(lower(ctx.t)) }));
        }
      }
    }
    /* ---- Flagge: steiler Mast (letztes bestaetigtes Leg) + flache Gegenbewegung ---- */
    if (n >= 2) {
      var p0 = last(2), p1 = last(1);
      var pole = p1.pivotPrice - p0.pivotPrice, poleBars = Math.max(1, p1.pivotIndex - p0.pivotIndex), fd = pole > 0 ? 1 : -1;
      var since = ctx.t - p1.pivotIndex;
      var retr = 0;
      for (var k2 = p1.pivotIndex + 1; k2 <= ctx.t; k2++) retr = Math.max(retr, fd > 0 ? p1.pivotPrice - ctx.series.low[k2] : ctx.series.high[k2] - p1.pivotPrice);
      if (Math.abs(pole) >= 5 * atr && Math.abs(pole) / poleBars >= 0.35 * atr && since >= 3 && since <= Math.max(6, 1.5 * poleBars) && retr <= 0.5 * Math.abs(pole) && retr >= 0.15 * Math.abs(pole)) {
        var res4 = resolve(ctx, p1, p1.pivotPrice, fd, p1.pivotPrice - fd * 0.5 * Math.abs(pole));
        if (res4.status === "FORMING") res4.detectionIndex = Math.max(p1.confirmedIndex, p1.pivotIndex + 3);
        found.push(pack(ctx, fd > 0 ? "BULL_FLAG" : "BEAR_FLAG", fd, [p0, p1], res4, p1.pivotPrice, Math.abs(pole), p1.pivotPrice - fd * 0.5 * Math.abs(pole), { pole: r4(Math.abs(pole)), poleBars: poleBars }));
      }
    }
    /* ---- Cup & Handle (O'Neil): Hoch – Tasse 12–35 % – rechter Rand nahe Hoch – Henkel ---- */
    var big = ctx.view(opts.baseScaleId || "scale-3");
    if (big && big.confirmed.length >= 3) {
      var bc = big.confirmed, L3 = bc.length;
      var leftRim = bc[L3 - 3], cupLow = bc[L3 - 2], rightRim = bc[L3 - 1];
      if (leftRim.side === "HIGH" && cupLow.side === "LOW" && rightRim.side === "HIGH") {
        var depth = 1 - cupLow.pivotPrice / leftRim.pivotPrice, rimGap = rightRim.pivotPrice / leftRim.pivotPrice - 1, dur = rightRim.pivotIndex - leftRim.pivotIndex;
        var handleLow = Infinity;
        for (var k3 = rightRim.pivotIndex + 1; k3 <= ctx.t; k3++) handleLow = Math.min(handleLow, ctx.series.low[k3]);
        var handleDepth = isNum(handleLow) ? 1 - handleLow / rightRim.pivotPrice : 0;
        if (depth >= 0.12 && depth <= 0.35 && rimGap >= -0.05 && rimGap <= 0.03 && dur >= Math.round(bpy * 7 / 52) && handleDepth <= Math.min(0.15, depth / 2)) {
          var res5 = resolve(ctx, rightRim, rightRim.pivotPrice, 1, handleLow === Infinity ? cupLow.pivotPrice : handleLow);
          found.push(pack(ctx, "CUP_WITH_HANDLE", 1, [leftRim, cupLow, rightRim], res5, rightRim.pivotPrice, rightRim.pivotPrice - cupLow.pivotPrice, handleLow === Infinity ? cupLow.pivotPrice : handleLow,
            { depthPct: r4(depth), handleDepthPct: r4(handleDepth), source: "O'Neil (2009), How to Make Money in Stocks" }));
        }
      }
    }

    /* Nur relevante: formend, oder Ausbruch/Fehlschlag nicht aelter als maxAge Bars. */
    var relevant = found.filter(function (p) {
      if (p.status === "FORMING") return ctx.t - (p.detectionIndex || 0) <= maxAge;
      return p.barsSinceBreakout === null || p.barsSinceBreakout <= maxAge;
    });
    var active = relevant.filter(function (p) { return p.status === "FORMING" || p.status === "BREAKOUT" || p.status === "BREAKOUT_RETEST"; });
    var ev = active.map(function (p) {
      var bull = p.direction === "BULLISH";
      return { key: "pattern_" + p.type, polarity: p.status === "FORMING" ? (bull ? 0.5 : -0.5) : (bull ? 1 : -1),
               statement: p.name + (p.status === "FORMING" ? " in Bildung" : p.status === "BREAKOUT_RETEST" ? ": Ausbruch bestätigt, Rücktest gehalten" : ": Ausbruch bestätigt") };
    });
    var dirSum = ev.reduce(function (a, e) { return a + e.polarity; }, 0);
    return { engineVersion: ENGINE_VERSION, family: "PATTERN", evidenceGrade: "C", scaleId: scaleId, patterns: relevant, active: active, evidence: ev,
             direction: dirSum > 0.4 ? 1 : dirSum < -0.4 ? -1 : 0,
             source: "Lo, Mamaysky & Wang (2000); Savin, Weller & Zvingelis (2007); Bulkowski (2005, Basisraten); O'Neil (2009)" };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, NAMES_DE: NAMES_DE, analyze: analyze, firstCross: firstCross };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIChartPatterns = api; }
})(typeof window !== "undefined" ? window : globalThis);
