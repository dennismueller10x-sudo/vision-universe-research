/* =========================================================================
   VISION UNIVERSE TECHNICAL — multi-timeframe.js
   WOCHEN- UND MONATSKENNZAHLEN AUS DER VOLLEN TAGESHISTORIE (Audit B8)

   Die Materialisierung kennt die volle Tageshistorie (R2, Median 2.903 Bars),
   veroeffentlicht aber nur 270 Tagesbars. Wochen- und Monatsbars als Reihe
   waeren neue oeffentliche Kursdaten (Rechtsfrage). Dieses Modul rechnet
   deshalb im Lauf aus der Tageshistorie die Wochen- und Monatsbars
   (timeframe.js#aggregate, Handelskalender) und veroeffentlicht nur die
   Kennzahlen am letzten ABGESCHLOSSENEN Wochen- bzw. Monatsbar, so wie
   featuresAtCutoff fuer den Tag.

   Abgeschlossen:
     • Woche: Der Stichtag ist ein Freitag. Sonst gehoert er zu einer noch
       offenen Woche, die wegfaellt (Feiertagsfreitage verlieren dadurch eine
       Woche; bewusst konservativ, wie screen-row.js bisher).
     • Monat: Nach dem Stichtag liegt kein Werktag (Mo–Fr) mehr im Monat.
   Der Monatsschluss ist der Schluss des letzten Handelstags im Monat
   (behebt Audit B5: der aus Wochenschluessen gebildete Monatsschluss war in
   50,7 % der Titel-Monate falsch).

   Die Feldnamen folgen screen-row.js, damit Tag, Woche und Monat dieselbe
   Bedeutung haben:
     aboveSma200/aboveSma50/sma50AboveSma200/distSma200
         Woche: 40- und 10-Wochen-Linie, Monat: 10- und 5-Monats-Linie
     newHigh52w/distHigh52w   Schluss-Hoch ueber 52 Wochen bzw. 12 Monate
     rsi14, adx (14), macdPositive (12/26/9), stochK (14, 3)
     atrPct (ATR 14 / Schluss), relVol (Volumen / Median der 20 Vorbars),
     volAboveAvg (relVol > 1), volSpike (relVol >= 2)
   Seit 1.1.0 (L7, docs/technical/SCREENER_FIELDS_L7.md):
     roc21/roc63/roc126/roc252  Kursaenderung ueber 1/3/6/12 Monate:
         Woche 4/13/26/52 Bars, Monat 1/3/6/12 Bars
     insideBar, nr7             aus dem Katalog (indicators.js), am Wochen- bzw. Monatsbar
     candleBullish/candleBearish/candleNeutral
                                Kerzenmuster am abgeschlossenen Bar, dieselbe feste
                                Liste wie screen-row.js (SCREEN_CANDLES)
   Fehlt Historie, ist der Wert null, nie 0 und nie geschaetzt.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var TF = isNode ? require("./timeframe.js") : global.VUTechnical.Timeframe;
  var I = isNode ? require("./indicators.js") : global.VUTechnical.Indicators;
  var Cdl = isNode ? require("./candlesticks.js") : global.VUTechnical.Candlesticks;

  var MTF_VERSION = "technical-mtf-1.1.0";
  /* roc: Feldname des Tages (Handelstage) -> Bars dieses Zeitrahmens fuer dieselbe Kalenderspanne. */
  var SPEC = {
    "1W": { shortMa: 10, longMa: 40, highBars: 52, closedRule: "STICHTAG_FREITAG", roc: { roc21: 4, roc63: 13, roc126: 26, roc252: 52 } },
    "1M": { shortMa: 5, longMa: 10, highBars: 12, closedRule: "KEIN_WERKTAG_MEHR_IM_MONAT", roc: { roc21: 1, roc63: 3, roc126: 6, roc252: 12 } }
  };
  /* Dieselbe feste Musterliste wie screen-row.js SCREEN_CANDLES (ein Test prueft die Gleichheit). */
  var CANDLES = ["doji", "dragonflyDoji", "gravestoneDoji", "longLeggedDoji", "hammer", "hangingMan", "invertedHammer", "shootingStar",
    "marubozu", "spinningTop", "engulfing", "harami", "haramiCross", "piercing", "darkCloudCover", "tweezer", "kicking", "morningStar",
    "eveningStar", "morningDojiStar", "eveningDojiStar", "abandonedBaby", "threeWhiteSoldiers", "threeBlackCrows", "threeInside",
    "threeOutside", "threeMethods"];
  /* Felder seit 1.1.0; ein Buendel 1.0.0 hat sie nicht (screen-row.js setzt sie dann auf null). */
  var FIELDS_1_1 = ["roc21", "roc63", "roc126", "roc252", "insideBar", "nr7", "candleBullish", "candleBearish", "candleNeutral"];

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function r(v, d) { if (!isNum(v)) return null; var f = Math.pow(10, d === undefined ? 4 : d); return Math.round(v * f) / f; }
  function at(a, i) { return a && isNum(a[i]) ? a[i] : null; }
  function pct(a, b) { return isNum(a) && isNum(b) && b !== 0 ? a / b - 1 : null; }
  function day(iso) { return new Date(String(iso).slice(0, 10) + "T12:00:00Z"); }

  /** Ist die Woche bzw. der Monat des Stichtags mit dem Stichtag abgeschlossen? */
  function closedAt(cutoff, tf) {
    var d = day(cutoff);
    if (tf === "1W") return d.getUTCDay() === 5;
    var m = d.getUTCMonth();
    for (var k = 1; k <= 7; k++) {
      var n = new Date(d.getTime() + k * 86400000);
      if (n.getUTCMonth() !== m) return true;
      var wd = n.getUTCDay();
      if (wd >= 1 && wd <= 5) return false;
    }
    return true;
  }

  /** Kennzahlen am letzten Bar einer (abgeschlossenen) Wochen- oder Monatsreihe. */
  function blockOf(bars, spec) {
    var n = bars.close.length, t = n - 1;
    if (n < 2) return null;
    var c = bars.close[t], h = bars.high, l = bars.low, cl = bars.close;
    var smaS = at(I.sma(cl, spec.shortMa), t), smaL = at(I.sma(cl, spec.longMa), t);
    var hist = at(I.macd(cl, 12, 26, 9).histogram, t);
    var atr = at(I.atr(h, l, cl, 14), t);
    var hasVol = bars.volume.some(function (v) { return isNum(v) && v > 0; });
    var rv = hasVol ? at(I.relativeVolume(bars.volume, 20), t) : null;
    var hi = n >= spec.highBars ? Math.max.apply(null, cl.slice(n - spec.highBars)) : null;
    return {
      aboveSma200: isNum(smaL) ? c > smaL : null,
      aboveSma50: isNum(smaS) ? c > smaS : null,
      sma50AboveSma200: isNum(smaS) && isNum(smaL) ? smaS > smaL : null,
      distSma200: r(pct(c, smaL)),
      rsi14: r(at(I.rsi(cl, 14), t), 2),
      newHigh52w: isNum(hi) ? c >= hi : null,
      distHigh52w: r(pct(c, hi)),
      adx: r(at(I.adx(h, l, cl, 14).adx, t), 2),
      macdPositive: isNum(hist) ? hist > 0 : null,
      stochK: r(at(I.stochastic(h, l, cl, 14, 3, 3).k, t), 2),
      atrPct: r(isNum(atr) && c ? atr / c : null),
      relVol: r(rv, 3),
      volAboveAvg: isNum(rv) ? rv > 1 : null,
      volSpike: isNum(rv) ? rv >= 2 : null
    };
  }

  /** Seit 1.1.0: ROC, Inside Bar, NR7 und Kerzenmuster am letzten Bar; nutzt nur Bars <= t. */
  function blockL7(bars, spec) {
    var n = bars.close.length, t = n - 1, c = bars.close[t], out = {};
    Object.keys(spec.roc).forEach(function (k) { var h = spec.roc[k]; out[k] = t >= h ? r(pct(c, bars.close[t - h])) : null; });
    var ib = I.compute(bars, "insideBar").values, nr = I.compute(bars, "nr7").values;
    out.insideBar = isNum(ib[t]) ? ib[t] === 1 : null;
    out.nr7 = isNum(nr[t]) ? nr[t] === 1 : null;
    var res = Cdl.detect({ open: bars.open, high: bars.high, low: bars.low, close: bars.close }, { only: CANDLES }).patterns;
    var bull = [], bear = [], neutral = [], ok = true;
    for (var k = 0; k < CANDLES.length; k++) {
      var p = Cdl.pattern(CANDLES[k]), v = res[CANDLES[k]][t];
      if (!isNum(v)) { ok = false; break; }
      if (v === 0) continue;
      (p.direction === "neutral" ? neutral : v > 0 ? bull : bear).push(p.id);
    }
    out.candleBullish = ok ? bull : null;
    out.candleBearish = ok ? bear : null;
    out.candleNeutral = ok ? neutral : null;
    return out;
  }

  /**
   * @param {object} series CanonicalBarSeries (1D, SPLIT_ADJUSTED)
   * @returns {{version, input, "1W": object|null, "1M": object|null}}
   *   je Zeitrahmen: { asOf, bars, closedRule, droppedOpenBar, close, values }
   */
  function compute(series) {
    if (!series || series.timeframe !== "1D" || !series.length) return { version: MTF_VERSION, input: null, "1W": null, "1M": null };
    var cutoff = series.timestamps[series.length - 1];
    var out = { version: MTF_VERSION, input: { timeframe: "1D", priceSeriesType: series.priceSeriesType, bars: series.length, cutoff: cutoff, aggregation: TF.AGGREGATION_VERSION } };
    ["1W", "1M"].forEach(function (tf) {
      var agg = TF.aggregate(series, tf), spec = SPEC[tf];
      var drop = !closedAt(cutoff, tf) ? 1 : 0, n = agg.close.length - drop;
      if (n < 2) { out[tf] = null; return; }
      var bars = { open: agg.open.slice(0, n), high: agg.high.slice(0, n), low: agg.low.slice(0, n), close: agg.close.slice(0, n), volume: agg.volume.slice(0, n) };
      out[tf] = { asOf: String(agg.timestamps[n - 1]).slice(0, 10), bars: n, closedRule: spec.closedRule, droppedOpenBar: drop === 1,
        close: bars.close[n - 1], values: Object.assign(blockOf(bars, spec), blockL7(bars, spec)) };
    });
    return out;
  }

  var api = { MTF_VERSION: MTF_VERSION, SPEC: SPEC, CANDLES: CANDLES, FIELDS_1_1: FIELDS_1_1, compute: compute, closedAt: closedAt, blockOf: blockOf, blockL7: blockL7 };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.MultiTimeframe = api; }
})(typeof window !== "undefined" ? window : globalThis);
