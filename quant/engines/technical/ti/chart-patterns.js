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

   LEBENSZYKLUS-MODUS (seit 1.1.0, opts.lifecycle, nur formations.js):
   Ohne ihn wird jede Formation an jedem Bar t aus den letzten Pivots neu
   abgeleitet. Ein neuer bestaetigter Pivot verschiebt das Fenster — und fast
   jede Invalidierung (Kurs jenseits des Formationsextrems) sowie viele
   Ausbrueche (Flagge, Tasse) setzen genau so einen neuen Pivot voraus. Die
   Formation verschwand dann, statt als invalidiert/bestaetigt zu enden.
   Im Lebenszyklus-Modus wird die Geometrie Stand ctx.t (Anker) bestimmt
   und Ausbruch/Invalidierung bis opts.until (>= ctx.t) verfolgt:
     • Dreiecke: Invalidierung an der (schraegen) Gegenlinie je Bar statt
       an ihrem Wert am Stand-Bar.
     • Tasse mit Henkel: Henkel Stand Bestaetigung des rechten Rands;
       invalidiert, sobald ein Schluss die zulaessige Henkeltiefe
       (min(15 %, halbe Tassentiefe) unter dem rechten Rand) unterschreitet.
     • Flagge: erkannt am ersten Bar, an dem Mast, Ruecklauf (15–50 %) und
       Mindestdauer erfuellt sind; ohne Ausbruch bis 1,5 × Mastdauer
       (mind. 6 Bars) nach dem Mast-Extrem gilt sie als invalidiert.
     • ATR und Kurs fuer Toleranzen stammen vom Bestaetigungsbar des
       juengsten Pivots (Fensterbeginn), nicht vom Stand-Bar.
   Ohne opts.lifecycle ist das Ergebnis identisch zu 1.0.0 (ti/engine.js).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "ti-chart-patterns-1.3.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  /* Zahlen ab Betrag 1 auf 4 Nachkommastellen, darunter 4 signifikante Stellen (wie published-close.js): Bei Kursen unter
     einem Cent machte die feste Rundung aus 0,000001 eine 0 (CPTAF, FORMATION_VALIDATION.md §4). 0 bleibt 0. */
  function r4(v) { return isNum(v) ? (Math.abs(v) >= 1 || v === 0 ? Math.round(v * 1e4) / 1e4 : Number(v.toPrecision(4))) : null; }

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
    /* Lebenszyklus: Bar der Invalidierung (1.0.0 gab ihn nicht weiter, invalidatedAt blieb deshalb immer leer). */
    if (ctx.lifecycle) { o.failedIndex = isNum(res.failedIndex) ? res.failedIndex : null; if (isNum(res.breakoutIndex)) o.breakoutIndex = res.breakoutIndex; }
    return Object.assign(o, extra || {});
  }

  function analyze(ctx, opts) {
    opts = opts || {};
    var scaleId = opts.scaleId || "scale-2", v = ctx.view(scaleId);
    if (!v || v.confirmed.length < 4) return { engineVersion: ENGINE_VERSION, family: "PATTERN", evidenceGrade: "C", patterns: [], active: [], status: "UNAVAILABLE", reason: "TOO_FEW_SWINGS" };
    var c = v.confirmed, n = c.length, atr = ctx.atr, close = ctx.close, bpy = ctx.profile.barsPerYear;
    /* Lebenszyklus: Geometrie Stand ctx.t, Aufloesung (Ausbruch/Invalidierung) bis U >= ctx.t. */
    var life = opts.lifecycle === true, U = life && isNum(opts.until) ? Math.max(ctx.t, Math.min(opts.until, ctx.series.length - 1)) : ctx.t;
    if (life) {
      /* Geometrie eingefroren am Bar, an dem der juengste Pivot bestaetigt wurde (Beginn dieses Pivot-Fensters):
         ATR und Kurs fuer Toleranzen/Mindesthoehen aendern sich innerhalb des Fensters nicht mehr, sonst kaeme und
         ginge dieselbe Formation mit der Tagesvolatilitaet. */
      var g = c[n - 1].confirmedIndex, atrG = ctx.col("atr", g);
      if (isNum(atrG) && atrG > 0) atr = atrG;
      close = ctx.series.close[g];
    }
    var rctx = life ? Object.assign({}, ctx, { t: U, lifecycle: true, atr: atr, close: close }) : ctx;
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
          var res = resolve(rctx, b, m.pivotPrice, dir, top);
          found.push(pack(rctx, dir < 0 ? "DOUBLE_TOP" : "DOUBLE_BOTTOM", dir, [a, m, b], res, m.pivotPrice, height, top));
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
          var res2 = resolve(rctx, s2, neck, d2, hd.pivotPrice);
          var lvl = isNum(res2.breakoutLevel) ? res2.breakoutLevel : neck(U);
          found.push(pack(rctx, d2 < 0 ? "HEAD_AND_SHOULDERS" : "INVERSE_HEAD_AND_SHOULDERS", d2, [s1, n1, hd, n2, s2], res2, lvl, headHeight, s2.pivotPrice,   /* ungueltig jenseits der rechten Schulter */
            { neckline: { from: { time: n1.pivotTime, price: r4(n1.pivotPrice) }, to: { time: n2.pivotTime, price: r4(n2.pivotPrice) }, atNow: r4(neck(U)) } }));
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
        /* Seit 1.2.0: "Flach" (Abstand <= tol) und "steigend/fallend" (> 0,5 tol) ueberlappen. Gelten aufsteigendes
           (Hochs flach, Tiefs steigen) und absteigendes Dreieck (Tiefs flach, Hochs fallen) zugleich, fallen die Hochs und
           steigen die Tiefs: das Muster konvergiert und ist symmetrisch. Vorher entschied die Reihenfolge ("aufsteigend"),
           und das Spiegelbild war wieder "aufsteigend" statt "absteigend". Beide Kanten sind dann Linien durch die Pivots. */
        var both = flatH && risingL && flatL && fallingH;
        var type = both ? "SYMMETRICAL_TRIANGLE" : flatH && risingL ? "ASCENDING_TRIANGLE" : flatL && fallingH ? "DESCENDING_TRIANGLE" : fallingH && risingL ? "SYMMETRICAL_TRIANGLE" : flatH && flatL && width >= 3 * atr ? "RECTANGLE" : null;
        if (type && width >= 2.5 * atr) {
          /* Seit 1.3.0: die Kanten folgen dem Typ, nicht "flach" allein. Waagrecht ist nur die Oberkante des aufsteigenden
             und die Unterkante des absteigenden Dreiecks (beide beim Rechteck); die Gegenkante ist die Linie durch die Pivots.
             Vorher wurde jede "flache" Kante waagrecht gezeichnet, auch die steigende Unterkante eines aufsteigenden Dreiecks. */
          var upper = type === "ASCENDING_TRIANGLE" || type === "RECTANGLE" ? function () { return Math.max(hA.pivotPrice, hB.pivotPrice); } : lineThrough(hA, hB);
          var lower = type === "DESCENDING_TRIANGLE" || type === "RECTANGLE" ? function () { return Math.min(lA.pivotPrice, lB.pivotPrice); } : lineThrough(lA, lB);
          var lastP = win[win.length - 1];
          var upIdx = firstCross(rctx, lastP.pivotIndex, upper, 1), dnIdx = firstCross(rctx, lastP.pivotIndex, lower, -1);
          var dir3 = upIdx >= 0 && (dnIdx < 0 || upIdx < dnIdx) ? 1 : dnIdx >= 0 ? -1 : (type === "ASCENDING_TRIANGLE" ? 1 : type === "DESCENDING_TRIANGLE" ? -1 : 0);
          /* Lebenszyklus (Regeltexte): aufsteigendes Dreieck bricht nur nach oben aus, ein Schluss unter der Unterkante
             invalidiert es (und umgekehrt); symmetrisches Dreieck und Rechteck bleiben beidseitig. */
          if (life && type === "ASCENDING_TRIANGLE") dir3 = 1;
          if (life && type === "DESCENDING_TRIANGLE") dir3 = -1;
          var res3;
          if (dir3 === 0) res3 = { status: "FORMING", detectionIndex: lastP.confirmedIndex };
          /* Lebenszyklus: Gegenlinie je Bar (Regel "Schluss unter der steigenden Unterkante"), nicht ihr Wert am Stand-Bar. */
          else res3 = resolve(rctx, lastP, dir3 > 0 ? upper : lower, dir3, life ? (dir3 > 0 ? lower : upper) : (dir3 > 0 ? lower(ctx.t) : upper(ctx.t)));
          var bl = dir3 >= 0 ? upper(U) : lower(U);
          found.push(pack(rctx, type, dir3 >= 0 ? 1 : -1, win, res3, isNum(res3.breakoutLevel) ? res3.breakoutLevel : bl, width, dir3 >= 0 ? lower(U) : upper(U),
            { bias: dir3 === 0 ? "OPEN" : null, upperNow: r4(upper(U)), lowerNow: r4(lower(U)), upperFrom: r4(upper(hA.pivotIndex)), lowerFrom: r4(lower(lA.pivotIndex)) }));
        }
      }
    }
    /* ---- Flagge: steiler Mast (letztes bestaetigtes Leg) + flache Gegenbewegung ---- */
    if (n >= 2) {
      var p0 = last(2), p1 = last(1);
      var pole = p1.pivotPrice - p0.pivotPrice, poleBars = Math.max(1, p1.pivotIndex - p0.pivotIndex), fd = pole > 0 ? 1 : -1;
      var since = ctx.t - p1.pivotIndex, maxLen = Math.max(6, 1.5 * poleBars), steep = Math.abs(pole) >= 5 * atr && Math.abs(pole) / poleBars >= 0.35 * atr;
      var retr = 0, known = -1;
      for (var k2 = p1.pivotIndex + 1; k2 <= ctx.t; k2++) {
        retr = Math.max(retr, fd > 0 ? p1.pivotPrice - ctx.series.low[k2] : ctx.series.high[k2] - p1.pivotPrice);
        /* Lebenszyklus: erster Bar k2 (<= Anker), an dem die Flagge mit dem damaligen Wissen erkennbar war. */
        if (life && known < 0 && k2 >= p1.confirmedIndex && k2 - p1.pivotIndex >= 3 && k2 - p1.pivotIndex <= maxLen && retr <= 0.5 * Math.abs(pole) && retr >= 0.15 * Math.abs(pole)) known = k2;
      }
      var flagOk = life ? steep && known >= 0
        : steep && since >= 3 && since <= maxLen && retr <= 0.5 * Math.abs(pole) && retr >= 0.15 * Math.abs(pole);
      if (flagOk) {
        var res4 = resolve(rctx, p1, p1.pivotPrice, fd, p1.pivotPrice - fd * 0.5 * Math.abs(pole));
        if (res4.status === "FORMING") res4.detectionIndex = life ? known : Math.max(p1.confirmedIndex, p1.pivotIndex + 3);
        if (life) {
          /* Zeitgrenze: Ausbruch nur bis 1,5 x Mastdauer (mind. 6 Bars) nach dem Mast-Extrem, sonst invalidiert. */
          var deadline = p1.pivotIndex + Math.floor(maxLen);
          var firstEvent = isNum(res4.breakoutIndex) ? res4.breakoutIndex : res4.status === "FAILED" ? res4.failedIndex : Infinity;
          if (firstEvent > deadline && U > deadline) res4 = { status: "FAILED", failedIndex: deadline + 1, expired: true };
          res4.knownIndex = known;
        }
        found.push(pack(rctx, fd > 0 ? "BULL_FLAG" : "BEAR_FLAG", fd, [p0, p1], res4, p1.pivotPrice, Math.abs(pole), p1.pivotPrice - fd * 0.5 * Math.abs(pole),
          life ? { pole: r4(Math.abs(pole)), poleBars: poleBars, knownIndex: known, expired: !!res4.expired } : { pole: r4(Math.abs(pole)), poleBars: poleBars }));
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
        /* Lebenszyklus: Henkel Stand Bestaetigung des rechten Rands (erster Kenntnisstand); ein spaeter zu tiefer Henkel
           ist dann die Invalidierung (Schluss unter der zulaessigen Henkeltiefe), kein stilles Verschwinden. */
        var handleTo = life ? rightRim.confirmedIndex : ctx.t, maxHandle = Math.min(0.15, depth / 2);
        for (var k3 = rightRim.pivotIndex + 1; k3 <= handleTo; k3++) handleLow = Math.min(handleLow, ctx.series.low[k3]);
        var handleDepth = isNum(handleLow) ? 1 - handleLow / rightRim.pivotPrice : 0;
        if (depth >= 0.12 && depth <= 0.35 && rimGap >= -0.05 && rimGap <= 0.03 && dur >= Math.round(bpy * 7 / 52) && handleDepth <= maxHandle) {
          var cupInvalid = life ? rightRim.pivotPrice * (1 - maxHandle) : handleLow === Infinity ? cupLow.pivotPrice : handleLow;
          var res5 = resolve(rctx, rightRim, rightRim.pivotPrice, 1, cupInvalid);
          found.push(pack(rctx, "CUP_WITH_HANDLE", 1, [leftRim, cupLow, rightRim], res5, rightRim.pivotPrice, rightRim.pivotPrice - cupLow.pivotPrice, cupInvalid,
            { depthPct: r4(depth), handleDepthPct: r4(handleDepth), source: "O'Neil (2009), How to Make Money in Stocks" }));
        }
      }
    }

    /* Nur relevante: formend, oder Ausbruch/Fehlschlag nicht aelter als maxAge Bars. */
    var relevant = found.filter(function (p) {
      if (p.status === "FORMING") return U - (p.detectionIndex || 0) <= maxAge;
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
