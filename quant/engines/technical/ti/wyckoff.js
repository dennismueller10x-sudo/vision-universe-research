/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/wyckoff.js
   WYCKOFF: HANDELSSPANNEN, EREIGNISSE, PHASEN A–E (as-of)

   Quellen: Wyckoff (1931, Kursmaterial); Pruden (2007) "The Three Skills
   of Top Trading" (Schemata Akkumulation/Distribution); Villahermosa
   (2019) "The Wyckoff Methodology in Depth". Eine quantitative,
   begutachtete Pruefung der Schemata existiert nicht (Evidenzgrad D).
   VU uebersetzt jedes Ereignis in messbare Bedingungen, statt ein
   "schoenes Chartbild" zu erkennen:

   Handelsspanne (TR): die juengsten bestaetigten Swings (>= 4) liegen in
     einem Band der Hoehe 3–15 ATR (max. 30 %), Dauer >= 1/12 Jahr; die
     Hochs und die Tiefs streuen je hoechstens um die halbe Spannenhoehe und
     die Mitte driftet um hoechstens 40 % der Hoehe (sonst Trend, keine Spanne).
   Kontext: Kursveraenderung im Vierteljahr VOR der Spanne
     <= −15 % → Akkumulation   >= +15 % → Distribution   sonst offen.
   Akkumulation (Distribution gespiegelt):
     SC   Selling Climax — tiefstes Tief am Spannenanfang, Volumen >= 1,8×
          Durchschnitt (ohne Volumen: nur Preis, als unbestaetigt markiert)
     AR   Automatic Rally — erstes Hoch nach SC = Spannenobergrenze
     ST   Secondary Test — spaeteres Tief innerhalb 1 ATR um SC, Volumen < SC
     Spring — Tief unter der Unterstuetzung (>= 0,2 ATR), Schluss innerhalb
          von 3 Bars wieder darueber
     SOS  Sign of Strength — Schluss ueber der Obergrenze mit Volumen >= 1,3×
     LPS  Last Point of Support — nach SOS ein hoeheres Tief, das die
          Obergrenze von oben haelt (+/- 0,5 ATR)
   Phasen: A (SC/AR/ST), B (Aufbau), C (Spring), D (SOS/LPS), E (Kurs
     verlaesst die Spanne um >= 0,5 Spannenhoehen).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "ti-wyckoff-1.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function r4(v) { return isNum(v) ? Math.round(v * 1e4) / 1e4 : null; }

  function findRange(ctx, scaleId) {
    var v = ctx.view(scaleId); if (!v) return null;
    var c = v.confirmed, atr = ctx.atr, n = c.length;
    if (n < 4) return null;
    var maxH = Math.min(15 * atr, 0.30 * ctx.close);
    var hi = -Infinity, lo = Infinity, start = -1;
    for (var k = n - 1; k >= 0; k--) {
      var nh = Math.max(hi, c[k].pivotPrice), nl = Math.min(lo, c[k].pivotPrice);
      if (nh - nl > maxH) break;
      hi = nh; lo = nl; start = k;
    }
    if (start < 0 || n - start < 4) return null;
    var pts = c.slice(start);
    if (pts.filter(function (p) { return p.side === "HIGH"; }).length < 2 || pts.filter(function (p) { return p.side === "LOW"; }).length < 2) return null;
    if (hi - lo < 3 * atr) return null;
    /* Eine Spanne ist seitwaerts: flache Raender und keine Drift. Sonst ist es ein Trend mit Ruecksetzern. */
    var h = hi - lo, H = pts.filter(function (p) { return p.side === "HIGH"; }).map(function (p) { return p.pivotPrice; }), Lw = pts.filter(function (p) { return p.side === "LOW"; }).map(function (p) { return p.pivotPrice; });
    if (Math.max.apply(null, H) - Math.min.apply(null, H) > 0.5 * h || Math.max.apply(null, Lw) - Math.min.apply(null, Lw) > 0.5 * h) return null;
    var firstMid = (pts[0].pivotPrice + pts[1].pivotPrice) / 2, lastMid = (pts[pts.length - 1].pivotPrice + pts[pts.length - 2].pivotPrice) / 2;
    if (Math.abs(lastMid - firstMid) > 0.4 * h) return null;
    if (ctx.close > hi + 0.75 * h || ctx.close < lo - 0.75 * h) return null;
    var dur = ctx.t - pts[0].pivotIndex;
    if (dur < Math.round(ctx.profile.barsPerYear / 12)) return null;
    return { pivots: pts, high: hi, low: lo, startIndex: pts[0].pivotIndex, duration: dur };
  }

  function rvolAt(ctx, i) { return ctx.hasVolume ? ctx.col("relativeVolume", i) : null; }

  function analyze(ctx, opts) {
    opts = opts || {};
    var base = { engineVersion: ENGINE_VERSION, family: "WYCKOFF", evidenceGrade: "D", source: "Wyckoff (1931); Pruden (2007); Villahermosa (2019)" };
    var tr = findRange(ctx, opts.scaleId || "scale-2");
    if (!tr) return Object.assign(base, { status: "NO_TRADING_RANGE", phase: null, events: [], evidence: [], direction: 0 });
    var s = ctx.series, atr = ctx.atr, q = Math.round(ctx.profile.barsPerYear / 4);
    var preIdx = Math.max(0, tr.startIndex - q);
    var prior = s.close[tr.startIndex] / s.close[preIdx] - 1;
    var schematic = prior <= -0.15 ? "ACCUMULATION" : prior >= 0.15 ? "DISTRIBUTION" : "UNDETERMINED";
    var acc = schematic !== "DISTRIBUTION";      // offener Kontext wird beidseitig geprueft, Ereignisse entscheiden
    var events = [], volOk = ctx.hasVolume;
    function ev(code, p, idx, extra) { events.push(Object.assign({ event: code, time: s.timestamps[idx], index: idx, price: r4(p), volumeConfirmed: volOk ? (extra && extra.vol === true) : null }, extra ? { relativeVolume: r4(extra.rv) } : {})); }
    var lows = tr.pivots.filter(function (p) { return p.side === "LOW"; }), highs = tr.pivots.filter(function (p) { return p.side === "HIGH"; });
    var support = tr.low, resistance = tr.high;

    function sideEvents(isAcc) {
      events = [];
      var climax = isAcc ? lows.reduce(function (a, p) { return p.pivotPrice < a.pivotPrice ? p : a; }, lows[0]) : highs.reduce(function (a, p) { return p.pivotPrice > a.pivotPrice ? p : a; }, highs[0]);
      var rvC = rvolAt(ctx, climax.pivotIndex);
      ev(isAcc ? "SC" : "BC", climax.pivotPrice, climax.pivotIndex, { rv: rvC, vol: isNum(rvC) && rvC >= 1.8 });
      var arP = (isAcc ? highs : lows).filter(function (p) { return p.pivotIndex > climax.pivotIndex; })[0];
      if (arP) ev("AR", arP.pivotPrice, arP.pivotIndex, null);
      var st = (isAcc ? lows : highs).filter(function (p) { return p.pivotIndex > climax.pivotIndex && Math.abs(p.pivotPrice - climax.pivotPrice) <= 1.0 * atr; })[0];
      if (st) { var rvS = rvolAt(ctx, st.pivotIndex); ev(isAcc ? "ST" : "ST_DIST", st.pivotPrice, st.pivotIndex, { rv: rvS, vol: isNum(rvS) && isNum(rvC) && rvS < rvC }); }
      var edge = isAcc ? support : resistance, far = isAcc ? resistance : support, dir = isAcc ? 1 : -1;
      /* Spring / UTAD */
      for (var k = tr.startIndex + 1; k <= ctx.t; k++) {
        var pierce = isAcc ? s.low[k] < edge - 0.2 * atr : s.high[k] > edge + 0.2 * atr;
        if (!pierce) continue;
        for (var j = k; j <= Math.min(ctx.t, k + 3); j++) {
          if (isAcc ? s.close[j] > edge : s.close[j] < edge) { ev(isAcc ? "SPRING" : "UTAD", isAcc ? s.low[k] : s.high[k], j, { rv: rvolAt(ctx, k), vol: true }); k = ctx.t + 1; break; }
        }
      }
      /* SOS / SOW */
      var sosIdx = -1;
      for (var m = tr.startIndex + 1; m <= ctx.t; m++) {
        if (isAcc ? s.close[m] > far : s.close[m] < far) { var rv = rvolAt(ctx, m); ev(isAcc ? "SOS" : "SOW", s.close[m], m, { rv: rv, vol: isNum(rv) && rv >= 1.3 }); sosIdx = m; break; }
      }
      /* LPS / LPSY: nach SOS haelt ein Ruecklauf die alte Grenze von der anderen Seite */
      if (sosIdx >= 0) {
        var extreme = null;
        for (var z = sosIdx + 1; z <= ctx.t; z++) { var val = isAcc ? s.low[z] : s.high[z]; if (extreme === null || (isAcc ? val < extreme.v : val > extreme.v)) extreme = { v: val, i: z }; }
        if (extreme && Math.abs(extreme.v - far) <= 0.5 * atr + 0.02 * far && (isAcc ? s.close[ctx.t] > far : s.close[ctx.t] < far)) ev(isAcc ? "LPS" : "LPSY", extreme.v, extreme.i, null);
      }
      events.sort(function (a, b) { return a.index - b.index; });
      return { dir: dir, edge: edge, far: far };
    }
    var side;
    if (schematic === "UNDETERMINED") {
      /* Offener Kontext: das juengste Ausbruchsereignis entscheidet die Lesart. */
      var accSide = sideEvents(true), accEvents = events.slice();
      var distSide = sideEvents(false), distEvents = events.slice();
      var lastA = accEvents.filter(function (e) { return e.event === "SOS" || e.event === "SPRING"; }).pop();
      var lastD = distEvents.filter(function (e) { return e.event === "SOW" || e.event === "UTAD"; }).pop();
      if (lastA && (!lastD || lastA.index > lastD.index)) { events = accEvents; side = accSide; acc = true; schematic = "REACCUMULATION_OR_ACCUMULATION"; }
      else if (lastD) { events = distEvents; side = distSide; acc = false; schematic = "REDISTRIBUTION_OR_DISTRIBUTION"; }
      else { events = accEvents.filter(function (e) { return ["SC", "AR", "ST"].indexOf(e.event) >= 0; }); side = accSide; schematic = "UNDETERMINED"; }
    } else side = sideEvents(acc);

    var has = function (code) { return events.some(function (e) { return e.event === code; }); };
    var height = resistance - support, close = ctx.close;
    var phase = "B";
    if (acc) {
      if (close > resistance + 0.5 * height) phase = "E";
      else if (has("SOS") || has("LPS")) phase = "D";
      else if (has("SPRING")) phase = "C";
      else if (!has("ST")) phase = "A";
    } else {
      if (close < support - 0.5 * height) phase = "E";
      else if (has("SOW") || has("LPSY")) phase = "D";
      else if (has("UTAD")) phase = "C";
      else if (!has("ST_DIST")) phase = "A";
    }
    var direction = schematic === "UNDETERMINED" ? 0 : (acc ? 1 : -1) * (phase === "C" || phase === "D" || phase === "E" ? 1 : 0.5);
    var names = { SC: "Ausverkaufs-Höhepunkt (Selling Climax)", AR: "Automatische Gegenbewegung", ST: "Test des Tiefs", SPRING: "Spring (Fehlausbruch nach unten)", SOS: "Zeichen von Stärke (Ausbruch)", LPS: "Letzter Unterstützungspunkt",
                  BC: "Kaufhöhepunkt (Buying Climax)", ST_DIST: "Test des Hochs", UTAD: "Upthrust (Fehlausbruch nach oben)", SOW: "Zeichen von Schwäche (Bruch)", LPSY: "Letzter Angebotspunkt" };
    events.forEach(function (e) { e.name = names[e.event] || e.event; });
    var evidence = [];
    if (schematic !== "UNDETERMINED") evidence.push({ key: "wyckoff_phase", polarity: direction,
      statement: acc ? "Seitwärtsphase mit Merkmalen einer Akkumulation (Phase " + phase + ")" : "Seitwärtsphase mit Merkmalen einer Distribution (Phase " + phase + ")" });
    return Object.assign(base, {
      status: "TRADING_RANGE", schematic: schematic, phase: phase, range: { support: r4(support), resistance: r4(resistance), height: r4(height), startTime: s.timestamps[tr.startIndex], durationBars: tr.duration },
      priorMovePct: r4(prior), events: events, volumeAvailable: volOk, evidence: evidence, direction: direction,
      note: volOk ? null : "Ohne Volumendaten sind Climax- und Test-Ereignisse nur preislich bestimmt und nicht bestätigt."
    });
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, analyze: analyze, findRange: findRange };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIWyckoff = api; }
})(typeof window !== "undefined" ? window : globalThis);
