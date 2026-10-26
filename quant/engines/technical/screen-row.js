/* =========================================================================
   VISION UNIVERSE TECHNICAL — screen-row.js
   EINE SCREENER-ZEILE JE TITEL (Tag, Woche, Monat)

   Rechnet aus bereits veroeffentlichten, kanonischen Eingaben genau die
   Werte, nach denen der Technical Screener filtert. Keine eigene
   Kursableitung (ADR-002): Tagesbars und Vollhistorien-Features kommen aus
   technical-signals-v1 (Materialisierung, SPLIT_ADJUSTED aus Tiingo-EOD),
   Wochenschluesse aus discover-series-long, der Vergleich aus
   discover-series/ref_SPY.

   Herkunft je Wert (wichtig fuer Vergleichbarkeit mit Quant):
     featuresAtCutoff   SMA 50/200, EMA 20/50/200, RSI 14, ADX, MACD, 52W-Hoch,
                        relatives Volumen, ATR %, Bollinger-Breitenperzentil
                        -> auf der VOLLHISTORIE gerechnet (feature-store.js)
     indicators.js      Stochastik, CCI, MFI, Supertrend, Bollinger %B, OBV,
                        Parabolic SAR, Ichimoku-Wolke, Aroon, Williams %R, CMF
                        -> auf dem 270-Bar-Fenster; alle Aufwaermphasen
                        (<= 77 Bars, Ichimoku-Wolke) liegen im Fenster
     formations.js      Formationen Stand letzter Bar
   Fehlt ein Eingang, bleibt der Wert null (Missing != Zero); der Screener
   wertet null als "Bedingung nicht erfuellt" und zaehlt es im Trichter.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var I = isNode ? require("./indicators.js") : global.VUTechnical.Indicators;
  var Fm = isNode ? require("./formations.js") : global.VUTechnical.Formations;
  var Ctx = isNode ? require("./ti/context.js") : global.VUTechnical.TIContext;
  /* Veroeffentlichte Schlusskurse nur ueber published-close.js (ADR-002): ab 1 $ Cent, darunter 4 signifikante Stellen, nie 0. */
  var Close = isNode ? require("../published-close.js") : global.VUPublishedClose;

  var ROW_VERSION = "technical-screen-row-1.6.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function r(v, d) { if (!isNum(v)) return null; var f = Math.pow(10, d === undefined ? 4 : d); return Math.round(v * f) / f; }
  function last(a) { for (var i = a.length - 1; i >= 0; i--) if (isNum(a[i])) return a[i]; return null; }
  function lastAt(a, i) { return a && isNum(a[i]) ? a[i] : null; }
  function pct(a, b) { return isNum(a) && isNum(b) && b !== 0 ? a / b - 1 : null; }
  function bool(v) { return v === null || v === undefined ? null : !!v; }

  /** Schlusskurs-basierte Kennzahlen fuer Wochen- oder Monatsschluesse (ohne Hoch/Tief/Volumen). */
  function closeOnlyBlock(closes, longMa, shortMa, yearBars) {
    var n = closes.length;
    if (n < shortMa + 1) return null;
    var c = closes[n - 1], sl = I.sma(closes, longMa)[n - 1], ss = I.sma(closes, shortMa)[n - 1], rs = I.rsi(closes, 14)[n - 1];
    var hi = n >= yearBars ? Math.max.apply(null, closes.slice(n - yearBars)) : null;
    return {
      aboveSma200: isNum(sl) ? c > sl : null, aboveSma50: isNum(ss) ? c > ss : null,
      sma50AboveSma200: isNum(sl) && isNum(ss) ? ss > sl : null, distSma200: r(pct(c, sl)),
      rsi14: r(rs, 2), newHigh52w: isNum(hi) ? c >= hi : null, distHigh52w: r(pct(c, hi)),
      /* Nur aus der vollen Tageshistorie (bundle.multiTimeframe) berechenbar; Schlusskurse allein reichen nicht. */
      adx: null, macdPositive: null, stochK: null, atrPct: null, relVol: null, volAboveAvg: null, volSpike: null
    };
  }

  /**
   * Ereignisse als "Handelstage seit" (Audit B12). Je Ereignis zwei Werte:
   *   <feld>        Handelstage seit dem juengsten Ereignis (0 = am Stichtag), null = keines im Pruefraum
   *   <fenster>     Laenge des Pruefraums in Handelstagen (Tage 0..W-1 geprueft), null = nicht pruefbar
   * "Kein Ereignis" (Feld null, Fenster W) und "unzureichende Historie" (beide null) sind so unterscheidbar.
   * Pruefraum = zusammenhaengende Bars vom Stichtag rueckwaerts, an denen das Ereignis entscheidbar ist.
   * Linien aus chartSeries (Vollhistorie, je Bar kausal), nie aus den 270 Bars neu gerechnet; jede Pruefung an
   * Bar i nutzt nur Bars <= i (kein Vorgriff). Zeitraeume zaehlen Bars = Handelstage.
   * Kreuzung an i: am Vortag nicht darueber (<=), an i darueber (>), bzw. umgekehrt.
   */
  function eventBlock(b, cs, formations) {
    var n = b.close.length, t = n - 1, out = {};
    /* scan: von t rueckwaerts, solange decidable(i); erstes test(i) liefert die Tage. */
    function scan(decidable, test) {
      var w = 0, days = null;
      for (var i = t; i >= 0 && decidable(i); i--) { w++; if (days === null && test(i)) days = t - i; }
      return { days: days, window: w > 0 ? w : null };
    }
    function both(a, z) { return function (i) { return i >= 1 && isNum(a[i]) && isNum(z[i]) && isNum(a[i - 1]) && isNum(z[i - 1]); }; }
    function crossUp(a, z) { return function (i) { return a[i - 1] <= z[i - 1] && a[i] > z[i]; }; }
    function crossDown(a, z) { return function (i) { return a[i - 1] >= z[i - 1] && a[i] < z[i]; }; }
    function put(key, windowKey, r) { out[key] = r.days; if (windowKey) out[windowKey] = r.window; }
    var none = { days: null, window: null };
    var lines = cs && Array.isArray(cs.sma50) && cs.sma50.length === n && Array.isArray(cs.sma200) && cs.sma200.length === n;
    put("goldenCrossDays", "smaCrossWindow", lines ? scan(both(cs.sma50, cs.sma200), crossUp(cs.sma50, cs.sma200)) : none);
    put("deathCrossDays", null, lines ? scan(both(cs.sma50, cs.sma200), crossDown(cs.sma50, cs.sma200)) : none);
    put("crossAboveSma200Days", "sma200CrossWindow", lines ? scan(both(b.close, cs.sma200), crossUp(b.close, cs.sma200)) : none);
    put("crossBelowSma200Days", null, lines ? scan(both(b.close, cs.sma200), crossDown(b.close, cs.sma200)) : none);
    var rsi = cs && Array.isArray(cs.rsi14) && cs.rsi14.length === n ? cs.rsi14 : null;
    var l30 = [], l70 = []; for (var k = 0; k < n; k++) { l30.push(30); l70.push(70); }
    put("rsiExitOversoldDays", "rsiEventWindow", rsi ? scan(both(rsi, l30), crossUp(rsi, l30)) : none);
    put("rsiExitOverboughtDays", null, rsi ? scan(both(rsi, l70), crossDown(rsi, l70)) : none);
    /* Neues 52-Wochen-Hoch: Tageshoch >= Hoch der 251 Vorbars (wie newHigh52w); entscheidbar nur mit 251 Vorbars im Fenster. */
    put("newHigh52wDays", "high52wWindow", scan(function (i) {
      if (i < 251 || !isNum(b.high[i])) return false;
      for (var j = i - 251; j < i; j++) if (!isNum(b.high[j])) return false;
      return true;
    }, function (i) { var hi = -Infinity; for (var j = i - 251; j < i; j++) if (b.high[j] > hi) hi = b.high[j]; return b.high[i] >= hi; }));
    /* Juengste aktive Formations-Erkennung; Pruefraum = das Analysefenster (alle Bars), sofern die Erkennung lief. */
    if (formations === null || formations === undefined) put("formationNewDays", "formationWindow", none);
    else {
      var idx = {}; for (var m = 0; m < n; m++) idx[b.timestamps[m]] = m;
      var newest = null;
      formations.forEach(function (f) { var i = idx[f[2]]; if (i !== undefined && (newest === null || t - i < newest)) newest = t - i; });
      put("formationNewDays", "formationWindow", { days: newest, window: n });
    }
    return out;
  }

  /** Wochenschluesse -> Monatsschluesse (letzter Wochenschluss je Kalendermonat; laufender Monat zaehlt nicht). */
  function monthlyFromWeekly(points, asOf) {
    var out = [], cur = null, curKey = null, openKey = asOf ? asOf.slice(0, 7) : null;
    points.forEach(function (p) {
      var k = p[0].slice(0, 7);
      if (k !== curKey) { if (curKey !== null) out.push(cur); curKey = k; }
      cur = p[1];
    });
    if (curKey !== null && curKey !== openKey) out.push(cur);
    return out;
  }

  /**
   * @param input {
   *   ticker, name, securityId,
   *   bars: {timestamps, open, high, low, close, volume}   (technical-signals-v1, SPLIT_ADJUSTED)
   *   features: featuresAtCutoff | null, structure: bundle.structure.state | null,
   *   weekly: [[date, close], ...] | null                  (discover-series-long, nur abgeschlossene Wochen werden genutzt)
   *   multiTimeframe: bundle.multiTimeframe | null         (Wochen/Monat aus der vollen Tageshistorie; hat Vorrang)
   *   chartSeries: bundle.chartSeries | null               (SMA 50/200, RSI 14 je Bar aus der Vollhistorie; fuer Ereignisse)
   *   benchmark: {dates:[], close:[]} | null               (SPY, Schlusskurse)
   *   universeAsOf
   * }
   */
  function computeRow(input) {
    var b = input.bars, n = b.close.length, t = n - 1, f = input.features || {};
    var c = b.close[t], prev = b.close[t - 1];
    var row = { s: input.ticker, n: input.name || null, sid: input.securityId || null, asOf: b.timestamps[t], close: Close.roundClose(c), chg1d: r(pct(c, prev)) };

    /* ---- Tag: Trend ---- */
    row.aboveSma200 = isNum(f.sma200) ? c > f.sma200 : null;
    row.aboveSma50 = isNum(f.sma50) ? c > f.sma50 : null;
    row.sma50AboveSma200 = isNum(f.sma50) && isNum(f.sma200) ? f.sma50 > f.sma200 : null;
    row.aboveEma20 = isNum(f.ema20) ? c > f.ema20 : null;
    row.aboveEma50 = isNum(f.ema50) ? c > f.ema50 : null;
    /* EMA 200 nur, wenn die Materialisierung sie als eingeschwungen veroeffentlicht (ema-settled); sonst leer, nie geschaetzt. */
    row.aboveEma200 = isNum(f.ema200) ? c > f.ema200 : null;
    row.distEma200 = r(pct(c, f.ema200));
    row.distSma200 = r(pct(c, f.sma200));
    row.distSma50 = r(pct(c, f.sma50));
    row.adx = r(f.adx, 2);
    var st = I.compute(b, "supertrend").values;
    row.supertrendUp = st && st.direction ? bool(isNum(st.direction[t]) ? st.direction[t] > 0 : null) : null;
    row.structure = input.structure && input.structure.regime || null;
    var ps = I.compute(b, "psar").values;
    row.psarUp = isNum(ps.direction[t]) ? ps.direction[t] > 0 : null;
    var ich = I.compute(b, "ichimoku").values, ca = lastAt(ich.cloudA, t), cb = lastAt(ich.cloudB, t);
    row.aboveCloud = isNum(ca) && isNum(cb) ? c > Math.max(ca, cb) : null;
    row.aroonOsc = r(lastAt(I.compute(b, "aroon").values.oscillator, t), 1);

    /* ---- Tag: Hochs ---- */
    row.newHigh52w = isNum(f.high52w) ? b.high[t] >= f.high52w : null;
    row.distHigh52w = r(f.distanceTo52wHigh);

    /* ---- Tag: Momentum ---- */
    row.rsi14 = r(f.rsi14, 2);
    row.macdPositive = isNum(f.macdHistogram) ? f.macdHistogram > 0 : null;
    var sto = I.compute(b, "stochastic").values;
    row.stochK = r(sto.k ? lastAt(sto.k, t) : null, 2);
    row.cci20 = r(lastAt(I.compute(b, "cci").values, t), 2);
    row.roc21 = r(isNum(f.roc21) ? f.roc21 : null);
    row.williamsR = r(lastAt(I.compute(b, "williamsR").values, t), 2);

    /* ---- Tag: Volumen ---- */
    var hasVol = b.volume && b.volume.some(function (v) { return isNum(v) && v > 0; });
    row.relVol = hasVol ? r(f.relativeVolume, 3) : null;
    row.volAboveAvg = isNum(row.relVol) ? row.relVol > 1 : null;
    row.volSpike = isNum(row.relVol) ? row.relVol >= 2 : null;
    row.mfi14 = hasVol ? r(lastAt(I.compute(b, "mfi").values, t), 2) : null;
    var obv = hasVol ? I.compute(b, "obv").values : null;
    row.obvRising = obv && t >= 20 ? obv[t] > obv[t - 20] : null;
    row.cmf20 = hasVol ? r(lastAt(I.compute(b, "cmf").values, t), 3) : null;

    /* ---- Tag: Volatilitaet ---- */
    row.atrPct = r(f.atrPct);
    var bb = I.compute(b, "bollinger").values;
    row.bbPctB = r(lastAt(bb.percentB, t), 3);
    row.bbSqueeze = isNum(f.bollingerWidthPercentile) ? f.bollingerWidthPercentile <= 20 : null;

    /* ---- Relative Staerke gegen SPY (Schlusskurse, gleicher Stichtag) ---- */
    row.rs3m = null; row.rs6m = null; row.rsPositive = null;
    var bm = input.benchmark;
    if (bm && bm.dates && bm.dates.length) {
      var bi = bm.dates.lastIndexOf(b.timestamps[t]);
      [[63, "rs3m"], [126, "rs6m"]].forEach(function (h) {
        var w = h[0];
        if (bi >= w && t >= w && b.timestamps[t - w] === bm.dates[bi - w]) row[h[1]] = r(pct(c, b.close[t - w]) - pct(bm.close[bi], bm.close[bi - w]));
      });
      row.rsPositive = isNum(row.rs6m) ? row.rs6m > 0 : null;
    }

    /* ---- Formationen ---- */
    row.formationActive = []; row.formationConfirmed = []; row.formationOpen = []; row.formations = [];
    try {
      var series = input.series;
      var res = Fm.analyzeAt(Ctx.prepare(series), series.length - 1);
      res.formations.forEach(function (x) {
        if (x.state !== "INVALIDATED" && row.formationActive.indexOf(x.type) < 0) row.formationActive.push(x.type);
        if (x.state === "CONFIRMED" && row.formationConfirmed.indexOf(x.type) < 0) row.formationConfirmed.push(x.type);
        if (x.state === "DETECTED" && row.formationOpen.indexOf(x.type) < 0) row.formationOpen.push(x.type);
        /* [Typ, Zustand, erkannt, Ausbruchstag, Ausbruchsrichtung, Kennzeichen]: Kennzeichen "B" = bei Erkennung bereits
           ausgebrochen, "V" = vorlaeufiger Kanal (4 Punkte), "O" = Richtung offen. */
        if (x.state !== "INVALIDATED") row.formations.push([x.type, x.state, x.detectedAt, x.breakout ? x.breakout.at : null, x.breakout ? x.breakout.direction : null,
          (x.confirmedAtDetection ? "B" : "") + (x.provisional ? "V" : "") + (x.directionOpen ? "O" : "")]);
      });
    } catch (e) { row.formationActive = null; row.formationConfirmed = null; row.formationOpen = null; row.formations = null; row.formationError = String(e && e.message || e).slice(0, 80); }

    /* ---- Ereignisse (Audit B12): Handelstage seit dem letzten Ereignis im 270-Bar-Fenster ---- */
    Object.assign(row, eventBlock(b, input.chartSeries || null, row.formations));

    /* ---- Woche und Monat (Schlusskurse aus discover-series-long) ---- */
    var weekly = (input.weekly || []).filter(function (p) { return p && isNum(p[1]); });
    /* Nur abgeschlossene Wochen: endet die Reihe am Stichtag und ist der Stichtag kein Freitag, ist die letzte
       Woche noch offen und faellt weg (Feiertagsfreitage verlieren dadurch eine Woche - bewusst konservativ). */
    if (weekly.length && weekly[weekly.length - 1][0] === row.asOf && new Date(row.asOf + "T12:00:00Z").getUTCDay() !== 5) weekly = weekly.slice(0, -1);
    var wc = weekly.map(function (p) { return p[1]; });
    /* Vorrang: Wochen-/Monatskennzahlen der Materialisierung aus der vollen Tageshistorie
       (bundle.multiTimeframe, OHLCV, echter Monatsschluss). Ohne sie: Schlusskurs-Rechnung wie bisher. */
    var mtf = input.multiTimeframe && /^technical-mtf-1\./.test(input.multiTimeframe.version || "") ? input.multiTimeframe : null;
    var W = mtf && mtf["1W"] && mtf["1W"].values || closeOnlyBlock(wc, 40, 10, 52);
    if (W) Object.keys(W).forEach(function (k) { row[k + "@1W"] = W[k]; });
    var M = mtf && mtf["1M"] && mtf["1M"].values || closeOnlyBlock(monthlyFromWeekly(weekly, row.asOf), 10, 5, 12);
    if (M) Object.keys(M).forEach(function (k) { row[k + "@1M"] = M[k]; });
    row.mtfSource = mtf ? "DAILY_HISTORY" : "WEEKLY_CLOSES";
    var hi200 = wc.length >= 200 ? Math.max.apply(null, wc.slice(wc.length - 200)) : null;
    row.newHigh200w = isNum(hi200) ? wc[wc.length - 1] >= hi200 : null;
    row.distHigh200w = r(pct(wc[wc.length - 1], hi200));

    /* ---- Datenqualitaet ---- */
    row.bars = n;
    row.hasVolume = !!hasVol;
    row.weeks = wc.length;
    row.fresh = input.universeAsOf ? row.asOf === input.universeAsOf : null;
    /* Juengster Schlusssprung mit Datenverdacht (Split-Signatur oder Faktor ausserhalb 0,2..5) in den letzten 60 Bars:
       nicht nachgezogene Splits oder Abspaltungen verfaelschen Indikatoren und Formationen; der Screener zeigt ihn an. */
    row.suspectJumpAt = null;
    for (var q = n - 1; q >= Math.max(1, n - 60); q--) if (Fm.suspectJump(b.close[q] / b.close[q - 1])) { row.suspectJumpAt = b.timestamps[q]; break; }

    /* ---- Vorschau: letzte 60 Schluesse auf 0..99 normiert ---- */
    var tail = b.close.slice(Math.max(0, n - 60)), lo = Math.min.apply(null, tail), hi = Math.max.apply(null, tail);
    row.spark = tail.map(function (v) { return hi > lo ? Math.round(99 * (v - lo) / (hi - lo)) : 50; });
    return row;
  }

  var api = { ROW_VERSION: ROW_VERSION, computeRow: computeRow, monthlyFromWeekly: monthlyFromWeekly, closeOnlyBlock: closeOnlyBlock };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ScreenRow = api; }
})(typeof window !== "undefined" ? window : globalThis);
