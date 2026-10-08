/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/context.js
   AS-OF-KONTEXT

   Grundsatz der TI-Schicht: DERSELBE Code rechnet das Live-Produkt und den
   Backtest. Deshalb arbeitet jede TI-Engine auf einem Kontext "Stand Bar t":

     • Feature-Spalten werden einmal ueber die ganze Serie gerechnet — sie
       sind kausal (Wert an i nutzt nur Bars <= i, feature-store.js).
     • Pivots werden einmal gerechnet; an t zaehlen nur Pivots mit
       confirmedIndex <= t, das Developing-Extrem wird aus Bars <= t
       rekonstruiert (elliott-v2.pivotView).
     • Engines lesen series[k] nur fuer k <= t. Tests vergiften die Zukunft
       und verlangen identische Ergebnisse (ti-causality.test.mjs).

   Zeitrahmen-Profile uebersetzen "50/200 Tage" in Wochenbars (10/40) usw.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Features = isNode ? require("../feature-store.js") : global.VUTechnical.Features;
  var Pivots = isNode ? require("../pivot-engine.js") : global.VUTechnical.Pivots;
  var ElliottV2 = isNode ? require("../elliott/elliott-v2.js") : global.VUTechnical.ElliottV2;

  var CONTEXT_VERSION = "ti-context-1.0.0";

  /* Bars je Zeitrahmen. fast/slow = Trend-MAs, stage = Weinstein-30-Wochen-Linie. */
  var PROFILES = {
    "1D": { barsPerYear: 252, fast: "sma50", slow: "sma200", stage: "sma150", label: "Tageschart",
            features: { smaPeriods: [20, 50, 150, 200], emaPeriods: [20, 50] },
            pivotScales: null },
    "1W": { barsPerYear: 52, fast: "sma10", slow: "sma40", stage: "sma30", label: "Wochenchart",
            features: { smaPeriods: [10, 20, 30, 40], emaPeriods: [10, 20], yearWindow: 52, volumeWindow: 10, volumeLongWindow: 26, regressionWindow: 26,
                        realizedVolWindow: 13, realizedVolLongWindow: 26, annualizationFactor: 52, rollingWindow: 10,
                        momentumHorizons: { "1M": 4, "3M": 13, "6M": 26, "12M": 52 } },
            /* Wochenbars: groessere Mindestbewegungen, da eine Bar ~5 Handelstage umfasst. */
            pivotScales: [{ scaleId: "scale-1", kAtr: 1.0, minPct: 0.04 }, { scaleId: "scale-2", kAtr: 2.0, minPct: 0.08 },
                          { scaleId: "scale-3", kAtr: 3.5, minPct: 0.15 }, { scaleId: "scale-4", kAtr: 6.0, minPct: 0.28 }] }
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  function profileOf(series) { return PROFILES[series.timeframe] || PROFILES["1D"]; }

  /**
   * Teure, kausale Vorberechnung: einmal je Serie.
   * @returns {{series, features, pivots, profile, hasVolume, hasRange}}
   */
  function prepare(series, opts) {
    opts = opts || {};
    var profile = profileOf(series);
    var fcfg = Object.assign({}, profile.features, opts.features || {});
    var features = Features.computeFeatures(series, fcfg);
    var pivots = Pivots.runPivots(series, features, { scales: opts.pivotScales || profile.pivotScales || undefined });
    /* Kumulierte Zaehler, damit die Datenlage je Stand-Bar t kausal bestimmt wird (Review-Befund 11):
       ob Volumen/Spannweiten vorhanden sind, darf nicht von Bars nach t abhaengen. */
    var n = series.length, volCum = new Array(n + 1), rngCum = new Array(n + 1);
    volCum[0] = 0; rngCum[0] = 0;
    for (var i = 0; i < n; i++) {
      volCum[i + 1] = volCum[i] + (series.volume && isNum(series.volume[i]) && series.volume[i] > 0 ? 1 : 0);
      rngCum[i + 1] = rngCum[i] + (series.high[i] > series.low[i] ? 1 : 0);
    }
    var prep = { version: CONTEXT_VERSION, series: series, features: features, pivots: pivots, profile: profile, volCum: volCum, rngCum: rngCum };
    var whole = availability(prep, n - 1);
    prep.hasVolume = whole.hasVolume; prep.hasRange = whole.hasRange; prep.closeOnly = whole.closeOnly;
    return prep;
  }

  var AVAIL_WINDOW = 252;
  /** Datenlage aus den letzten AVAIL_WINDOW Bars bis einschliesslich t. */
  function availability(prep, t) {
    if (t < 0) return { hasVolume: false, hasRange: false, closeOnly: true };
    var a = Math.max(0, t + 1 - AVAIL_WINDOW), w = t + 1 - a;
    var vol = prep.volCum[t + 1] - prep.volCum[a], rng = prep.rngCum[t + 1] - prep.rngCum[a];
    var meta = prep.series.meta && prep.series.meta.closeOnly;
    return { hasVolume: vol >= w * 0.8, hasRange: rng >= w * 0.5, closeOnly: !!meta || rng < w * 0.5 };
  }

  /** Billiger Stand-Bar-t-Zugriff. */
  function at(prep, t) {
    var s = prep.series, f = prep.features.columns;
    t = Math.min(isNum(t) ? t : s.length - 1, s.length - 1);
    var views = {};
    function view(scaleId) { if (!views[scaleId]) views[scaleId] = ElliottV2.pivotView(s, prep.pivots, scaleId, t); return views[scaleId]; }
    function col(name, k) { var c = f[name]; if (!c) return null; var v = c[k === undefined ? t : k]; return isNum(v) ? v : null; }
    var atr = col("atr"), av = availability(prep, t);
    return {
      prep: prep, series: s, t: t, time: s.timestamps[t], close: s.close[t], atr: atr !== null ? atr : s.close[t] * 0.02,
      profile: prep.profile, hasVolume: av.hasVolume, closeOnly: av.closeOnly,
      col: col, view: view, scaleIds: prep.pivots.scaleIds
    };
  }

  var api = { CONTEXT_VERSION: CONTEXT_VERSION, PROFILES: PROFILES, profileOf: profileOf, prepare: prepare, at: at, availability: availability };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIContext = api; }
})(typeof window !== "undefined" ? window : globalThis);
