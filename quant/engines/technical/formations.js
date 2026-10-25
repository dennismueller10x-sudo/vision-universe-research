/* =========================================================================
   VISION UNIVERSE TECHNICAL — formations.js
   FORMATIONSERKENNUNG DER PRODUKTWELT TECHNICAL (as-of, ohne Look-ahead)

   Baut auf der bestehenden, kausalen Kette auf und schreibt sie nicht neu:
     ti/context.js         Features + Pivots einmal je Serie, Stand Bar t
     ti/chart-patterns.js  Doppeltop/-boden, SKS (+ invers), Dreiecke,
                           Rechteck, Flagge, Tasse mit Henkel
     ti/levels.js          Unterstuetzungs-/Widerstandszonen
   Neu hier (bisher nicht im Bestand):
     Trendlinien, Trendkanaele, Keile, Wimpel, Range-Ausbruch,
     Widerstands-Ausbruch, Volatilitaetskontraktion; seit 1.1.0
     Kursluecken nach oben/unten (Gap Up / Gap Down).

   EIN ZUSTANDSMODELL fuer alle Formationen (Produktsprache):
     DETECTED     Formation erkannt (in Bildung, noch ohne Ausloeser)
     CONFIRMED    Formation bestaetigt (Ausbruch/Bestaetigungsregel erfuellt)
     INVALIDATED  Formation invalidiert (Invalidierungsregel ausgeloest)

   KAUSALITAET: Jede Funktion bekommt einen Kontext "Stand Bar t" und liest
   nur Bars <= t sowie Pivots mit confirmedIndex <= t. detectedAt ist der
   erste Bar, an dem die Formation mit dem damaligen Wissen erkennbar war —
   nie der Zeitpunkt des ersten Formationspunkts. Der Test
   technical-formations.test.mjs vergiftet die Zukunft und verlangt
   identische Ergebnisse.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Ctx = isNode ? require("./ti/context.js") : global.VUTechnical.TIContext;
  var Pat = isNode ? require("./ti/chart-patterns.js") : global.VUTechnical.TIChartPatterns;
  var Lv = isNode ? require("./ti/levels.js") : global.VUTechnical.TILevels;

  var ENGINE_VERSION = "technical-formations-1.1.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function r4(v) { return isNum(v) ? Math.round(v * 1e4) / 1e4 : null; }

  var STATES = { DETECTED: "Erkannt", CONFIRMED: "Bestätigt", INVALIDATED: "Invalidiert" };

  /* Regeltexte je Typ: Erkennung, Bestaetigung, Invalidierung (Methodikseite + Detailkarte). */
  var RULES = {
    SUPPORT_TRENDLINE: { name: "Steigende Unterstützungslinie", direction: "BULLISH", family: "TRENDLINE",
      detect: "Linie durch die letzten zwei bestätigten, steigenden Swing-Tiefs (Pivot-Skala 2).",
      confirm: "Dritter Kontakt: ein späteres Tief berührt die Linie (±0,5 ATR) und der Schluss bleibt darüber.",
      invalidate: "Schlusskurs mehr als 0,5 ATR unter der Linie." },
    RESISTANCE_TRENDLINE: { name: "Fallende Widerstandslinie", direction: "BEARISH", family: "TRENDLINE",
      detect: "Linie durch die letzten zwei bestätigten, fallenden Swing-Hochs (Pivot-Skala 2).",
      confirm: "Dritter Kontakt: ein späteres Hoch berührt die Linie (±0,5 ATR) und der Schluss bleibt darunter.",
      invalidate: "Schlusskurs mehr als 0,5 ATR über der Linie (Ausbruch nach oben)." },
    ASCENDING_CHANNEL: { name: "Aufwärtskanal", direction: "BULLISH", family: "CHANNEL",
      detect: "Swing-Hochs und -Tiefs steigen mit annähernd gleicher Steigung (Abweichung ≤ 35 %), Breite ≥ 2 ATR.",
      confirm: "Mindestens fünf Swing-Punkte im Kanal (±0,5 ATR).",
      invalidate: "Schlusskurs mehr als 0,5 ATR unter der unteren Kanallinie." },
    DESCENDING_CHANNEL: { name: "Abwärtskanal", direction: "BEARISH", family: "CHANNEL",
      detect: "Swing-Hochs und -Tiefs fallen mit annähernd gleicher Steigung (Abweichung ≤ 35 %), Breite ≥ 2 ATR.",
      confirm: "Mindestens fünf Swing-Punkte im Kanal (±0,5 ATR).",
      invalidate: "Schlusskurs mehr als 0,5 ATR über der oberen Kanallinie." },
    RISING_WEDGE: { name: "Steigender Keil", direction: "BEARISH", family: "WEDGE",
      detect: "Hochs und Tiefs steigen, die untere Linie steiler als die obere: die Spanne verengt sich um mindestens 25 %.",
      confirm: "Schlusskurs unter der unteren Keillinie nach dem letzten Formationspunkt.",
      invalidate: "Schlusskurs über dem höchsten Formationshoch." },
    FALLING_WEDGE: { name: "Fallender Keil", direction: "BULLISH", family: "WEDGE",
      detect: "Hochs und Tiefs fallen, die obere Linie steiler als die untere: die Spanne verengt sich um mindestens 25 %.",
      confirm: "Schlusskurs über der oberen Keillinie nach dem letzten Formationspunkt.",
      invalidate: "Schlusskurs unter dem tiefsten Formationstief." },
    BULL_PENNANT: { name: "Bullischer Wimpel", direction: "BULLISH", family: "PENNANT",
      detect: "Steiler Anstieg (≥ 5 ATR), danach mindestens 5 Bars Konsolidierung mit fallenden Hochs und steigenden Tiefs, Rücklauf ≤ 50 % des Masts.",
      confirm: "Schlusskurs über der oberen Wimpellinie und über dem jüngsten Konsolidierungshoch.",
      invalidate: "Schlusskurs unter dem tiefsten Tief der Konsolidierung." },
    BEAR_PENNANT: { name: "Bärischer Wimpel", direction: "BEARISH", family: "PENNANT",
      detect: "Steiler Abfall (≥ 5 ATR), danach mindestens 5 Bars Konsolidierung mit fallenden Hochs und steigenden Tiefs, Rücklauf ≤ 50 % des Masts.",
      confirm: "Schlusskurs unter der unteren Wimpellinie und unter dem jüngsten Konsolidierungstief.",
      invalidate: "Schlusskurs über dem höchsten Hoch der Konsolidierung." },
    RANGE_BREAKOUT: { name: "Range-Ausbruch", direction: "BULLISH", family: "BREAKOUT",
      detect: "Schluss über dem höchsten Hoch der vorherigen 30 Bars, deren Spanne höchstens 6 ATR und 15 % betrug.",
      confirm: "Zweiter Schluss in Folge über der Range-Oberkante.",
      invalidate: "Schlusskurs zurück unter der Range-Mitte." },
    RESISTANCE_BREAKOUT: { name: "Ausbruch über Widerstand", direction: "BULLISH", family: "BREAKOUT",
      detect: "Schluss über der Oberkante der nächsten Widerstandszone mit mindestens zwei Swing-Kontakten (Zone so, wie sie am Vortag bekannt war).",
      confirm: "Zweiter Schluss in Folge über der Zonenoberkante.",
      invalidate: "Schlusskurs zurück unter der Zonenunterkante." },
    VOLATILITY_CONTRACTION: { name: "Volatilitätskontraktion", direction: "BULLISH", family: "CONTRACTION",
      detect: "Mindestens drei aufeinanderfolgende Rücksetzer (Pivot-Skala 1) mit je mindestens 20 % geringerer Tiefe, letzter Rücksetzer ≤ 12 %, Kurs über der SMA 50.",
      confirm: "Schluss über dem letzten Kontraktionshoch (Pivot).",
      invalidate: "Schlusskurs unter dem Tief der letzten Kontraktion." },
    GAP_UP: { name: "Kurslücke nach oben", direction: "BULLISH", family: "GAP",
      detect: "Tagestief über dem Vortageshoch, Lücke mindestens 0,5 ATR; mit Volumendaten zusätzlich mindestens 1,5-faches relatives Volumen. Jüngste Lücke der letzten 20 Bars.",
      confirm: "Die Lücke hält: drei Schlusskurse in Folge über dem Vortageshoch (Unterkante der Lücke).",
      invalidate: "Schlusskurs unter dem Vortageshoch – die Lücke ist per Schluss geschlossen." },
    GAP_DOWN: { name: "Kurslücke nach unten", direction: "BEARISH", family: "GAP",
      detect: "Tageshoch unter dem Vortagestief, Lücke mindestens 0,5 ATR; mit Volumendaten zusätzlich mindestens 1,5-faches relatives Volumen. Jüngste Lücke der letzten 20 Bars.",
      confirm: "Die Lücke hält: drei Schlusskurse in Folge unter dem Vortagestief (Oberkante der Lücke).",
      invalidate: "Schlusskurs über dem Vortagestief – die Lücke ist per Schluss geschlossen." }
  };

  /* Bestandsformationen aus ti/chart-patterns.js: Zustandsabbildung + Regeltexte. */
  var LEGACY = {
    DOUBLE_TOP: { family: "REVERSAL", confirm: "Schluss unter dem Zwischentief (Nackenlinie).", invalidate: "Schluss über dem höheren der beiden Hochs." },
    DOUBLE_BOTTOM: { family: "REVERSAL", confirm: "Schluss über dem Zwischenhoch (Nackenlinie).", invalidate: "Schluss unter dem tieferen der beiden Tiefs." },
    HEAD_AND_SHOULDERS: { family: "REVERSAL", confirm: "Schluss unter der Nackenlinie.", invalidate: "Schluss über der rechten Schulter." },
    INVERSE_HEAD_AND_SHOULDERS: { family: "REVERSAL", confirm: "Schluss über der Nackenlinie.", invalidate: "Schluss unter der rechten Schulter." },
    ASCENDING_TRIANGLE: { family: "TRIANGLE", confirm: "Schluss über der flachen Oberkante.", invalidate: "Schluss unter der steigenden Unterkante." },
    DESCENDING_TRIANGLE: { family: "TRIANGLE", confirm: "Schluss unter der flachen Unterkante.", invalidate: "Schluss über der fallenden Oberkante." },
    SYMMETRICAL_TRIANGLE: { family: "TRIANGLE", confirm: "Schluss jenseits einer der beiden Dreieckslinien (Richtung = Ausbruchsseite).", invalidate: "Schluss jenseits der Gegenlinie nach dem Ausbruch." },
    RECTANGLE: { family: "RANGE", confirm: "Schluss jenseits der Rechteckkante.", invalidate: "Schluss jenseits der Gegenkante." },
    BULL_FLAG: { family: "FLAG", confirm: "Schluss über dem Mast-Hoch.", invalidate: "Rücklauf über 50 % des Masts." },
    BEAR_FLAG: { family: "FLAG", confirm: "Schluss unter dem Mast-Tief.", invalidate: "Rücklauf über 50 % des Masts." },
    CUP_WITH_HANDLE: { family: "CONTINUATION", confirm: "Schluss über dem rechten Tassenrand.", invalidate: "Schluss unter dem Henkeltief." }
  };
  var LEGACY_STATE = { FORMING: "DETECTED", BREAKOUT: "CONFIRMED", BREAKOUT_RETEST: "CONFIRMED", FAILED: "INVALIDATED", FAILED_BREAKOUT: "INVALIDATED" };

  /* -------------------------------------------------------------- Helfer */
  function lineThrough(a, b) {
    var m = (b.price - a.price) / Math.max(1, b.index - a.index);
    return { slope: m, at: function (k) { return a.price + m * (k - a.index); } };
  }
  function pt(p) { return { index: p.pivotIndex, price: p.pivotPrice, time: p.pivotTime, confirmedIndex: p.confirmedIndex }; }
  function seg(s, line, from, to) {
    return { from: { time: s.timestamps[from], price: r4(line.at(from)) }, to: { time: s.timestamps[to], price: r4(line.at(to)) } };
  }
  function quality(ctx) {
    return { bars: ctx.t + 1, hasVolume: !!ctx.hasVolume, closeOnly: !!ctx.closeOnly, atr: r4(ctx.atr), timeframe: ctx.series.timeframe || "1D" };
  }
  function base(ctx, type, state, detectedIdx, extra) {
    var r = RULES[type], s = ctx.series;
    return Object.assign({
      id: type + "@" + s.timestamps[detectedIdx], type: type, name: r.name, family: r.family, direction: r.direction,
      state: state, stateLabel: STATES[state], timeframe: s.timeframe || "1D", asOf: ctx.time,
      detectedAt: s.timestamps[detectedIdx], detectedIndex: detectedIdx,
      rules: { detect: r.detect, confirm: r.confirm, invalidate: r.invalidate }, dataQuality: quality(ctx), source: "vu-technical"
    }, extra || {});
  }

  /* Verfolgt eine Linie ab Bar `from` bis t: Kontakte, Bruch. dir = +1 Stuetzlinie (unten), −1 Widerstand (oben). */
  function followLine(ctx, line, from, dir) {
    var s = ctx.series, tol = 0.5 * ctx.atr, touches = [], broken = -1;
    for (var k = from + 1; k <= ctx.t; k++) {
      var lv = line.at(k);
      if (dir > 0 ? s.close[k] < lv - tol : s.close[k] > lv + tol) { broken = k; break; }
      var probe = dir > 0 ? s.low[k] : s.high[k];
      if (Math.abs(probe - lv) <= tol && (touches.length === 0 || k - touches[touches.length - 1] >= 3)) touches.push(k);
    }
    return { touches: touches, broken: broken };
  }

  /* ------------------------------------------------------ Trendlinien */
  function trendlines(ctx) {
    var v = ctx.view("scale-2"), out = [];
    if (!v) return out;
    var lows = v.confirmed.filter(function (p) { return p.side === "LOW"; }).map(pt);
    var highs = v.confirmed.filter(function (p) { return p.side === "HIGH"; }).map(pt);
    var s = ctx.series, tol = 0.5 * ctx.atr;
    function make(list, dir, type) {
      if (list.length < 2) return;
      var a = list[list.length - 2], b = list[list.length - 1];
      if (dir > 0 ? !(b.price > a.price + tol * 0.5) : !(b.price < a.price - tol * 0.5)) return;
      var line = lineThrough(a, b), detectIdx = b.confirmedIndex;
      /* Zwischen a und der Bestaetigung von b darf kein Schluss die Linie gebrochen haben. */
      for (var k = a.index + 1; k <= detectIdx; k++) if (dir > 0 ? s.close[k] < line.at(k) - tol : s.close[k] > line.at(k) + tol) return;
      var f = followLine(ctx, line, detectIdx, dir);
      var confirmIdx = f.touches.length && (f.broken < 0 || f.touches[0] < f.broken) ? f.touches[0] : -1;
      var state = f.broken >= 0 ? "INVALIDATED" : confirmIdx >= 0 ? "CONFIRMED" : "DETECTED";
      out.push(base(ctx, type, state, detectIdx, {
        points: [a, b].map(function (p) { return { time: p.time, price: r4(p.price) }; }),
        lines: [Object.assign({ role: dir > 0 ? "support" : "resistance" }, seg(s, line, a.index, f.broken >= 0 ? f.broken : ctx.t))],
        levels: { lineNow: r4(line.at(ctx.t)), slopePerBar: r4(line.slope) },
        confirmedAt: confirmIdx >= 0 ? s.timestamps[confirmIdx] : null,
        invalidatedAt: f.broken >= 0 ? s.timestamps[f.broken] : null,
        touches: 2 + f.touches.filter(function (k) { return f.broken < 0 || k < f.broken; }).length
      }));
    }
    make(lows, 1, "SUPPORT_TRENDLINE");
    make(highs, -1, "RESISTANCE_TRENDLINE");
    return out;
  }

  /* ------------------------------------------- Kanaele und Keile (Swings) */
  function channelsAndWedges(ctx) {
    var v = ctx.view("scale-2"), out = [];
    if (!v || v.confirmed.length < 4) return out;
    var win = v.confirmed.slice(-5).map(function (p) { return Object.assign(pt(p), { side: p.side }); });
    var hs = win.filter(function (p) { return p.side === "HIGH"; }), ls = win.filter(function (p) { return p.side === "LOW"; });
    if (hs.length < 2 || ls.length < 2) return out;
    var s = ctx.series, atr = ctx.atr, tol = 0.5 * atr;
    var up = lineThrough(hs[0], hs[hs.length - 1]), lo = lineThrough(ls[0], ls[ls.length - 1]);
    var start = Math.min(hs[0].index, ls[0].index), last = win[win.length - 1], detectIdx = last.confirmedIndex;
    var w0 = up.at(start) - lo.at(start), w1 = up.at(last.index) - lo.at(last.index);
    if (!(w0 > 0 && w1 > 0)) return out;
    var flat = 0.05 * atr;          // Steigung je Bar, unter der eine Linie als flach gilt (Dreieck/Rechteck: chart-patterns.js)
    var bothUp = up.slope > flat && lo.slope > flat, bothDown = up.slope < -flat && lo.slope < -flat;
    if (!bothUp && !bothDown) return out;
    var rel = Math.abs(up.slope - lo.slope) / Math.max(Math.abs(up.slope), Math.abs(lo.slope));
    var lines = [Object.assign({ role: "upper" }, seg(s, up, start, ctx.t)), Object.assign({ role: "lower" }, seg(s, lo, start, ctx.t))];
    var pts = win.map(function (p) { return { time: p.time, price: r4(p.price), side: p.side }; });
    if (rel <= 0.35 && w1 >= 2 * atr) {
      var dirC = bothUp ? 1 : -1, guard = dirC > 0 ? lo : up;
      var f = followLine(ctx, guard, detectIdx, dirC);
      var inside = win.length + f.touches.length;
      out.push(base(ctx, bothUp ? "ASCENDING_CHANNEL" : "DESCENDING_CHANNEL", f.broken >= 0 ? "INVALIDATED" : inside >= 5 ? "CONFIRMED" : "DETECTED", detectIdx, {
        points: pts, lines: lines, levels: { upperNow: r4(up.at(ctx.t)), lowerNow: r4(lo.at(ctx.t)), widthAtr: r4(w1 / atr) },
        confirmedAt: inside >= 5 && f.broken < 0 ? s.timestamps[win.length >= 5 ? detectIdx : f.touches[4 - win.length]] : null,
        invalidatedAt: f.broken >= 0 ? s.timestamps[f.broken] : null
      }));
      return out;
    }
    /* Keil: gleiche Richtung, Spanne verengt sich um >= 25 %, die "fuehrende" Linie steiler. */
    if (w1 <= 0.75 * w0) {
      var rising = bothUp && lo.slope > up.slope, falling = bothDown && up.slope < lo.slope;
      if (!rising && !falling) return out;
      var dirW = rising ? -1 : 1, breakLine = rising ? lo : up;
      var invalid = rising ? Math.max.apply(null, hs.map(function (p) { return p.price; })) : Math.min.apply(null, ls.map(function (p) { return p.price; }));
      var bIdx = -1, iIdx = -1;
      for (var k = last.index + 1; k <= ctx.t; k++) {
        if (iIdx < 0 && (dirW > 0 ? s.close[k] < invalid : s.close[k] > invalid)) iIdx = k;
        if (bIdx < 0 && (dirW > 0 ? s.close[k] > breakLine.at(k) + 0.1 * atr : s.close[k] < breakLine.at(k) - 0.1 * atr)) bIdx = k;
      }
      var state = iIdx >= 0 && (bIdx < 0 || iIdx < bIdx) ? "INVALIDATED" : bIdx >= 0 ? "CONFIRMED" : "DETECTED";
      /* Erkennung frueher als die Bestaetigung des letzten Punkts ist unmoeglich. */
      var cIdx = bIdx >= 0 ? Math.max(bIdx, detectIdx) : -1;
      out.push(base(ctx, rising ? "RISING_WEDGE" : "FALLING_WEDGE", state, detectIdx, {
        points: pts, lines: lines, levels: { breakoutLineNow: r4(breakLine.at(ctx.t)), invalidation: r4(invalid), narrowing: r4(1 - w1 / w0) },
        confirmedAt: state === "CONFIRMED" ? s.timestamps[cIdx] : null, invalidatedAt: state === "INVALIDATED" ? s.timestamps[iIdx] : null
      }));
    }
    return out;
  }

  /* -------------------------------------------------------------- Wimpel */
  /* Mast = eines der letzten beiden bestaetigten Legs: der erste Ruecksetzer im Wimpel kann selbst schon
     als Pivot bestaetigt sein, dann ist das vorletzte Leg der Mast. Der juengere Kandidat hat Vorrang. */
  function pennants(ctx) {
    var v = ctx.view("scale-2"), out = [];
    if (!v || v.confirmed.length < 2) return out;
    var c = v.confirmed;
    for (var q = c.length - 1; q >= Math.max(1, c.length - 2); q--) {
      var found = pennantFrom(ctx, c[q - 1], c[q]);
      if (found) { out.push(found); break; }
    }
    return out;
  }

  function pennantFrom(ctx, p0, p1) {
    var s = ctx.series, atr = ctx.atr;
    var pole = p1.pivotPrice - p0.pivotPrice, poleBars = Math.max(1, p1.pivotIndex - p0.pivotIndex), dir = pole > 0 ? 1 : -1;
    if (Math.abs(pole) < 5 * atr || Math.abs(pole) / poleBars < 0.35 * atr) return null;
    var from = p1.pivotIndex + 1, maxLen = Math.max(8, Math.round(1.5 * poleBars));
    /* Scan Bar fuer Bar: Linien nur aus Bars VOR k, Ausbruch an k. */
    for (var k = from + 5; k <= Math.min(ctx.t, from + maxLen); k++) {
      var hiA = -Infinity, hiAi = -1, hiB = -Infinity, hiBi = -1, loA = Infinity, loAi = -1, loB = Infinity, loBi = -1, lowest = Infinity, highest = -Infinity;
      var mid = from + Math.floor((k - from) / 2);
      for (var j = from; j < k; j++) {
        if (j < mid) { if (s.high[j] > hiA) { hiA = s.high[j]; hiAi = j; } if (s.low[j] < loA) { loA = s.low[j]; loAi = j; } }
        else { if (s.high[j] > hiB) { hiB = s.high[j]; hiBi = j; } if (s.low[j] < loB) { loB = s.low[j]; loBi = j; } }
        lowest = Math.min(lowest, s.low[j]); highest = Math.max(highest, s.high[j]);
      }
      var retr = dir > 0 ? p1.pivotPrice - lowest : highest - p1.pivotPrice;
      var converging = hiB < hiA && loB > loA;
      if (retr > 0.5 * Math.abs(pole) || retr < 0) return null;
      if (!converging) continue;          // Konsolidierung noch nicht verengt: weiter beobachten
      var up = lineThrough({ index: hiAi, price: hiA }, { index: hiBi, price: hiB });
      var lo = lineThrough({ index: loAi, price: loA }, { index: loBi, price: loB });
      var detectIdx = Math.max(from + 5, p1.confirmedIndex);
      var invalid = dir > 0 ? lowest : highest;
      var extra = {
        points: [{ time: p0.pivotTime, price: r4(p0.pivotPrice) }, { time: p1.pivotTime, price: r4(p1.pivotPrice) }],
        lines: [Object.assign({ role: "upper" }, seg(s, up, from, k)), Object.assign({ role: "lower" }, seg(s, lo, from, k)),
                { role: "pole", from: { time: p0.pivotTime, price: r4(p0.pivotPrice) }, to: { time: p1.pivotTime, price: r4(p1.pivotPrice) } }],
        levels: { pole: r4(Math.abs(pole)), invalidation: r4(invalid), upperNow: r4(up.at(k)), lowerNow: r4(lo.at(k)) }, confirmedAt: null, invalidatedAt: null
      };
      var type = dir > 0 ? "BULL_PENNANT" : "BEAR_PENNANT";
      if (dir > 0 ? s.close[k] < invalid : s.close[k] > invalid) { extra.invalidatedAt = s.timestamps[k]; return base(ctx, type, "INVALIDATED", detectIdx, extra); }
      if (dir > 0 ? s.close[k] > Math.max(up.at(k), hiB) : s.close[k] < Math.min(lo.at(k), loB)) {
        if (k < detectIdx) return null;
        extra.confirmedAt = s.timestamps[k]; return base(ctx, type, "CONFIRMED", detectIdx, extra);
      }
      if (k === ctx.t && k >= detectIdx) return base(ctx, type, "DETECTED", detectIdx, extra);
    }
    return null;
  }

  /* ------------------------------------------------- Range-Ausbruch */
  function rangeBreakout(ctx, lookback) {
    lookback = lookback || 30;
    var s = ctx.series, out = [], atrCol = ctx.prep.features.columns.atr;
    /* Juengster Ausbruchsbar in den letzten 10 Bars (Ausbruch an k: Range = Bars k-lookback .. k-1). */
    for (var k = ctx.t; k >= Math.max(lookback, ctx.t - 9); k--) {
      var hi = -Infinity, lo = Infinity;
      for (var j = k - lookback; j < k; j++) { hi = Math.max(hi, s.high[j]); lo = Math.min(lo, s.low[j]); }
      var a = atrCol[k - 1];
      if (!isNum(a) || hi - lo > 6 * a || (hi - lo) / hi > 0.15) continue;
      if (!(s.close[k] > hi && s.close[k - 1] <= hi)) continue;
      var midR = (hi + lo) / 2, inv = -1, conf = -1;
      for (var m = k + 1; m <= ctx.t; m++) { if (s.close[m] < midR) { inv = m; break; } if (conf < 0 && s.close[m] > hi) conf = m; }
      var state = inv >= 0 ? "INVALIDATED" : conf >= 0 ? "CONFIRMED" : "DETECTED";
      out.push(base(ctx, "RANGE_BREAKOUT", state, k, {
        points: [], lines: [{ role: "range-top", from: { time: s.timestamps[k - lookback], price: r4(hi) }, to: { time: s.timestamps[ctx.t], price: r4(hi) } },
                            { role: "range-bottom", from: { time: s.timestamps[k - lookback], price: r4(lo) }, to: { time: s.timestamps[k], price: r4(lo) } }],
        zone: { from: s.timestamps[k - lookback], to: s.timestamps[k - 1], low: r4(lo), high: r4(hi) },
        levels: { rangeHigh: r4(hi), rangeLow: r4(lo), invalidation: r4(midR), breakoutClose: r4(s.close[k]) },
        confirmedAt: state === "CONFIRMED" ? s.timestamps[conf] : null, invalidatedAt: inv >= 0 ? s.timestamps[inv] : null
      }));
      break;
    }
    return out;
  }

  /* ------------------------------------------ Widerstands-Ausbruch */
  function resistanceBreakout(ctx, atFn) {
    var s = ctx.series, out = [];
    for (var k = ctx.t; k >= Math.max(1, ctx.t - 9); k--) {
      var prev = atFn(k - 1), lv = Lv.supportResistance(prev);
      /* Widerstand = naechste Zone ueber dem Vortagesschluss mit mindestens zwei Swing-Kontakten. */
      var z = (lv.resistances || []).filter(function (x) { return x.touches >= 2; })[0];
      if (!z || !(s.close[k] > z.zoneHigh && s.close[k - 1] <= z.zoneHigh)) continue;
      var inv = -1, conf = -1;
      for (var m = k + 1; m <= ctx.t; m++) { if (s.close[m] < z.zoneLow) { inv = m; break; } if (conf < 0 && s.close[m] > z.zoneHigh) conf = m; }
      var state = inv >= 0 ? "INVALIDATED" : conf >= 0 ? "CONFIRMED" : "DETECTED";
      out.push(base(ctx, "RESISTANCE_BREAKOUT", state, k, {
        points: [], lines: [],
        zone: { from: s.timestamps[Math.max(0, k - 60)], to: s.timestamps[ctx.t], low: r4(z.zoneLow), high: r4(z.zoneHigh) },
        levels: { zoneLow: r4(z.zoneLow), zoneHigh: r4(z.zoneHigh), touches: z.touches, invalidation: r4(z.zoneLow), breakoutClose: r4(s.close[k]) },
        confirmedAt: state === "CONFIRMED" ? s.timestamps[conf] : null, invalidatedAt: inv >= 0 ? s.timestamps[inv] : null
      }));
      break;
    }
    return out;
  }

  /* ------------------------------------------------- Kursluecken */
  /* Je Richtung die juengste Luecke der letzten 20 Bars; Volumenbedingung nur, wenn die Reihe Volumen hat. */
  function gaps(ctx) {
    var s = ctx.series, out = [], atrCol = ctx.prep.features.columns.atr, rv = ctx.prep.features.columns.relativeVolume;
    [1, -1].forEach(function (dir) {
      for (var k = ctx.t; k >= Math.max(1, ctx.t - 19); k--) {
        var a = atrCol[k - 1], edge = dir > 0 ? s.high[k - 1] : s.low[k - 1];
        var size = dir > 0 ? s.low[k] - s.high[k - 1] : s.low[k - 1] - s.high[k];
        if (!isNum(a) || !isNum(size) || size < 0.5 * a) continue;
        if (ctx.hasVolume && !(isNum(rv[k]) && rv[k] >= 1.5)) continue;
        var inv = -1, conf = -1, held = 0;
        for (var m = k; m <= ctx.t; m++) {
          if (dir > 0 ? s.close[m] < edge : s.close[m] > edge) { inv = m; break; }
          if (m > k && ++held === 3 && conf < 0) conf = m;
        }
        var state = inv >= 0 ? "INVALIDATED" : conf >= 0 ? "CONFIRMED" : "DETECTED";
        var far = dir > 0 ? s.low[k] : s.high[k];
        out.push(base(ctx, dir > 0 ? "GAP_UP" : "GAP_DOWN", state, k, {
          points: [], lines: [],
          zone: { from: s.timestamps[k - 1], to: s.timestamps[ctx.t], low: r4(Math.min(edge, far)), high: r4(Math.max(edge, far)) },
          levels: { gapLow: r4(Math.min(edge, far)), gapHigh: r4(Math.max(edge, far)), gapAtr: r4(size / a), relativeVolume: ctx.hasVolume ? r4(rv[k]) : null, invalidation: r4(edge) },
          confirmedAt: conf >= 0 ? s.timestamps[conf] : null, invalidatedAt: inv >= 0 ? s.timestamps[inv] : null
        }));
        break;
      }
    });
    return out;
  }

  /* -------------------------------------- Volatilitaetskontraktion */
  function contraction(ctx) {
    var v = ctx.view("scale-1"), out = [], s = ctx.series;
    if (!v || v.confirmed.length < 6) return out;
    var c = v.confirmed, horizon = ctx.t - 2 * ctx.profile.barsPerYear / 4;   // ~6 Monate
    var legs = [];
    for (var i = 1; i < c.length; i++) if (c[i - 1].side === "HIGH" && c[i].side === "LOW" && c[i - 1].pivotIndex >= horizon)
      legs.push({ high: c[i - 1], low: c[i], depth: 1 - c[i].pivotPrice / c[i - 1].pivotPrice });
    if (legs.length < 3) return out;
    /* laengste Folge streng kleiner werdender Ruecksetzer am Ende */
    var seq = [legs[legs.length - 1]];
    for (var q = legs.length - 2; q >= 0; q--) { if (legs[q].depth * 0.8 >= seq[0].depth) seq.unshift(legs[q]); else break; }
    if (seq.length < 3) return out;
    var lastLeg = seq[seq.length - 1];
    if (lastLeg.depth > 0.12) return out;
    var detectIdx = lastLeg.low.confirmedIndex, sma50 = ctx.prep.features.columns.sma50;
    if (!isNum(sma50 && sma50[detectIdx]) || s.close[detectIdx] <= sma50[detectIdx]) return out;
    /* Pivot = Hoch nach dem letzten Tief, bekannt bis t; sonst das Hoch des letzten Rücksetzers. */
    var pivot = lastLeg.high.pivotPrice, inv = lastLeg.low.pivotPrice, conf = -1, broken = -1;
    for (var k = detectIdx + 1; k <= ctx.t; k++) {
      if (s.close[k] < inv) { broken = k; break; }
      if (s.close[k] > pivot) { conf = k; break; }
    }
    var state = broken >= 0 ? "INVALIDATED" : conf >= 0 ? "CONFIRMED" : "DETECTED";
    out.push(base(ctx, "VOLATILITY_CONTRACTION", state, detectIdx, {
      points: seq.reduce(function (a, l) { return a.concat([{ time: l.high.pivotTime, price: r4(l.high.pivotPrice), side: "HIGH" }, { time: l.low.pivotTime, price: r4(l.low.pivotPrice), side: "LOW" }]); }, []),
      lines: [{ role: "pivot", from: { time: lastLeg.high.pivotTime, price: r4(pivot) }, to: { time: s.timestamps[ctx.t], price: r4(pivot) } }],
      levels: { pivot: r4(pivot), invalidation: r4(inv), depths: seq.map(function (l) { return r4(l.depth); }) },
      confirmedAt: conf >= 0 ? s.timestamps[conf] : null, invalidatedAt: broken >= 0 ? s.timestamps[broken] : null
    }));
    return out;
  }

  /* -------------------------------- Bestandsformationen uebersetzen */
  function legacy(ctx) {
    var r = Pat.analyze(ctx), s = ctx.series;
    return (r.patterns || []).map(function (p) {
      var L = LEGACY[p.type] || { family: "OTHER", confirm: "", invalidate: "" };
      var state = LEGACY_STATE[p.status] || "DETECTED";
      var detIdx = isNum(p.detectionIndex) ? p.detectionIndex : ctx.t;
      /* Erkannt wird eine Formation, sobald ihr letzter Punkt bestaetigt war — nicht erst beim Ausbruch. */
      var lastConfirmed = p.points.length ? s.timestamps.indexOf(p.points[p.points.length - 1].confirmedAt) : -1;
      var firstKnown = lastConfirmed >= 0 ? lastConfirmed : detIdx;
      var lines = [];
      if (p.neckline) lines.push({ role: "neckline", from: p.neckline.from, to: { time: s.timestamps[ctx.t], price: p.neckline.atNow } });
      /* Ober-/Unterkante beginnen am ersten Hoch bzw. Tief der Formation (nicht am ersten Punkt schlechthin). */
      var firstHigh = p.points.filter(function (q) { return q.side === "HIGH"; })[0], firstLow = p.points.filter(function (q) { return q.side === "LOW"; })[0];
      var endT = s.timestamps[ctx.t];
      if (isNum(p.upperNow) && firstHigh) lines.push({ role: "upper", from: { time: firstHigh.time, price: firstHigh.price }, to: { time: endT, price: p.upperNow } });
      if (isNum(p.lowerNow) && firstLow) lines.push({ role: "lower", from: { time: firstLow.time, price: firstLow.price }, to: { time: endT, price: p.lowerNow } });
      return {
        id: p.type + "@" + s.timestamps[firstKnown], type: p.type, name: p.name, family: L.family, direction: p.direction,
        state: state, stateLabel: STATES[state], timeframe: s.timeframe || "1D", asOf: ctx.time,
        detectedAt: s.timestamps[firstKnown], detectedIndex: firstKnown,
        confirmedAt: state === "CONFIRMED" ? p.detectionTime : null,
        invalidatedAt: state === "INVALIDATED" && isNum(p.failedIndex) ? s.timestamps[p.failedIndex] : null,
        points: p.points.map(function (q) { return { time: q.time, price: q.price, side: q.side }; }), lines: lines,
        levels: { breakout: p.breakoutLevel, invalidation: p.invalidation && p.invalidation.price, targetLow: p.target && p.target.zoneLow, targetHigh: p.target && p.target.zoneHigh, height: p.height },
        rules: { detect: "Regelwerk ti-chart-patterns-1.0.0 (bestätigte Pivots, Skala 2).", confirm: L.confirm, invalidate: L.invalidate },
        dataQuality: quality(ctx), source: Pat.ENGINE_VERSION
      };
    });
  }

  /**
   * Alle Formationen Stand Bar t.
   * @param prep  Ergebnis von TIContext.prepare(series)
   * @param t     Stand-Bar (Standard: letzte Bar)
   */
  function analyzeAt(prep, t) {
    var ctx = Ctx.at(prep, t);
    var memo = {};
    function atFn(k) { if (!memo[k]) memo[k] = Ctx.at(prep, k); return memo[k]; }
    var all = [].concat(legacy(ctx), trendlines(ctx), channelsAndWedges(ctx), pennants(ctx), rangeBreakout(ctx), resistanceBreakout(ctx, atFn), contraction(ctx), gaps(ctx));
    all.forEach(function (f) { if (f.detectedIndex > ctx.t) throw new Error("LOOKAHEAD:" + f.id); });
    var order = { CONFIRMED: 0, DETECTED: 1, INVALIDATED: 2 };
    all.sort(function (a, b) { return order[a.state] - order[b.state] || b.detectedIndex - a.detectedIndex || (a.type < b.type ? -1 : 1); });
    return { engineVersion: ENGINE_VERSION, asOf: ctx.time, asOfIndex: ctx.t, timeframe: prep.series.timeframe || "1D", formations: all, dataQuality: quality(ctx) };
  }

  function analyze(series, opts) {
    var prep = Ctx.prepare(series, opts);
    return analyzeAt(prep, series.length - 1);
  }

  /**
   * Historische Erkennungen im Fenster [fromIndex, t]: an jedem Bar, an dem ein neuer Pivot bestaetigt wurde,
   * plus am letzten Bar. Jede Formation erscheint mit dem Zustand, den sie AM ERKENNUNGSZEITPUNKT hatte,
   * und dem heutigen Zustand (`stateNow`). Damit ist nachvollziehbar, was damals bekannt war.
   */
  function history(prep, fromIndex, t) {
    t = isNum(t) ? t : prep.series.length - 1;
    var marks = {};
    Object.keys(prep.pivots.scales).forEach(function (sid) {
      prep.pivots.scales[sid].pivots.forEach(function (p) { if (p.confirmedIndex >= fromIndex && p.confirmedIndex <= t) marks[p.confirmedIndex] = true; });
    });
    var seen = {}, list = [];
    Object.keys(marks).map(Number).sort(function (a, b) { return a - b; }).concat([t]).forEach(function (k) {
      analyzeAt(prep, k).formations.forEach(function (f) {
        if (seen[f.id] || f.detectedIndex < fromIndex) return;
        seen[f.id] = true;
        list.push({ id: f.id, type: f.type, name: f.name, direction: f.direction, detectedAt: f.detectedAt, stateAtDetection: f.state, knownAt: prep.series.timestamps[k] });
      });
    });
    var now = analyzeAt(prep, t).formations, byId = {};
    now.forEach(function (f) { byId[f.id] = f.state; });
    list.forEach(function (h) { h.stateNow = byId[h.id] || null; });
    return list;
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, STATES: STATES, RULES: RULES, LEGACY: LEGACY, LEGACY_STATE: LEGACY_STATE,
              analyze: analyze, analyzeAt: analyzeAt, history: history };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Formations = api; }
})(typeof window !== "undefined" ? window : globalThis);
