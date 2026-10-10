/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/momentum-volatility.js
   MOMENTUM ALS BESTAETIGUNG + VOLATILITAETS-REGIME (as-of)

   Momentum ist hier kein eigenes Signal (das leistet die bestehende
   Quant-Momentum-Faktorik), sondern BESTAETIGUNG oder WIDERSPRUCH zur
   Struktur:
     • Divergenz: neues Swing-Hoch mit niedrigerem RSI-Hoch (bearish) bzw.
       neues Swing-Tief mit hoeherem RSI-Tief (bullish) — gemessen an den
       BESTAETIGTEN Pivots, RSI-Wert an der Pivot-Bar (kausal, da der Pivot
       erst nach seiner Bar bestaetigt wird).
     • Beschleunigung: kurzes vs. mittleres Momentum (vola-normiert).
     • Trend-Persistenz: Anteil steigender Bars (Fenster ~ 1 Quartal).
   Quellen: Jegadeesh & Titman (1993); Moskowitz, Ooi & Pedersen (2012);
   Wilder (1978) fuer RSI/ATR. Divergenz selbst ist Praktiker-Lehre
   (Evidenzgrad C) — sie wird empirisch in der Evidence-Schicht geprueft.

   Volatilitaet (Evidenzgrad A fuer Clustering, Engle 1982; Bollerslev
   1986): ATR in % und als Perzentil des letzten Jahres → Regime
   COMPRESSED / NORMAL / ELEVATED / EXTREME. Zonenbreiten aller Szenarien
   skalieren mit ATR — dieselbe Geometrie ist nie fuer jede Aktie gleich.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "ti-momentum-volatility-1.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function r4(v) { return isNum(v) ? Math.round(v * 1e4) / 1e4 : null; }

  function divergence(ctx, scaleId) {
    var v = ctx.view(scaleId), out = { bearish: null, bullish: null };
    if (!v) return out;
    var highs = v.confirmed.filter(function (p) { return p.side === "HIGH"; }), lows = v.confirmed.filter(function (p) { return p.side === "LOW"; });
    /* Das laufende Extrem zaehlt mit (der RSI an seiner Bar ist bekannt). */
    if (v.developing && v.developing.side === "HIGH") highs = highs.concat([v.developing]);
    if (v.developing && v.developing.side === "LOW") lows = lows.concat([v.developing]);
    var rsi = function (p) { return ctx.col("rsi14", p.pivotIndex); };
    if (highs.length >= 2) {
      var a = highs[highs.length - 2], b = highs[highs.length - 1], ra = rsi(a), rb = rsi(b);
      if (isNum(ra) && isNum(rb) && b.pivotPrice > a.pivotPrice && rb < ra - 2) out.bearish = { priceHigh: [r4(a.pivotPrice), r4(b.pivotPrice)], rsi: [r4(ra), r4(rb)], at: b.pivotTime, developing: b.status === "DEVELOPING" };
    }
    if (lows.length >= 2) {
      var c = lows[lows.length - 2], d = lows[lows.length - 1], rc = rsi(c), rd = rsi(d);
      if (isNum(rc) && isNum(rd) && d.pivotPrice < c.pivotPrice && rd > rc + 2) out.bullish = { priceLow: [r4(c.pivotPrice), r4(d.pivotPrice)], rsi: [r4(rc), r4(rd)], at: d.pivotTime, developing: d.status === "DEVELOPING" };
    }
    return out;
  }

  function analyzeMomentum(ctx, scaleId) {
    var z1 = ctx.col("momentum1MZ"), z3 = ctx.col("momentum3MZ"), z6 = ctx.col("momentum6MZ"), z12 = ctx.col("momentum12MZ");
    var parts = [[z3, 0.35], [z6, 0.35], [z12, 0.3]].filter(function (x) { return isNum(x[0]); });
    var composite = parts.length ? parts.reduce(function (a, x) { return a + x[0] * x[1]; }, 0) / parts.reduce(function (a, x) { return a + x[1]; }, 0) : null;
    var accel = isNum(z1) && isNum(z3) ? z1 - z3 : null;
    var w = Math.round(ctx.profile.barsPerYear / 4), up = 0, n = 0;
    for (var k = Math.max(1, ctx.t - w + 1); k <= ctx.t; k++) { n++; if (ctx.series.close[k] > ctx.series.close[k - 1]) up++; }
    var persistence = n ? up / n : null;
    var div = divergence(ctx, scaleId || "scale-2");
    var state = composite === null ? "UNDETERMINED" : composite > 0.5 ? "POSITIVE" : composite < -0.5 ? "NEGATIVE" : "NEUTRAL";
    var dynamics = accel === null ? null : accel > 0.4 ? "ACCELERATING" : accel < -0.4 ? "DECELERATING" : "STEADY";
    var ev = [];
    if (state !== "UNDETERMINED") ev.push({ key: "momentum_state", polarity: state === "POSITIVE" ? 1 : state === "NEGATIVE" ? -1 : 0,
      statement: state === "POSITIVE" ? "Mittelfristiges Momentum positiv" : state === "NEGATIVE" ? "Mittelfristiges Momentum negativ" : "Momentum neutral" });
    if (dynamics === "ACCELERATING" || dynamics === "DECELERATING") ev.push({ key: "momentum_dynamics", polarity: dynamics === "ACCELERATING" ? 1 : -1,
      statement: dynamics === "ACCELERATING" ? "Bewegungsstärke nimmt zu" : "Bewegungsstärke lässt nach" });
    if (div.bearish) ev.push({ key: "bearish_divergence", polarity: -1, statement: "Neues Hoch, aber schwächere Bewegungsstärke (Divergenz)" });
    if (div.bullish) ev.push({ key: "bullish_divergence", polarity: 1, statement: "Neues Tief, aber nachlassender Verkaufsdruck (Divergenz)" });
    return { engineVersion: ENGINE_VERSION, family: "MOMENTUM", evidenceGrade: "A", state: state, composite: r4(composite), acceleration: r4(accel), dynamics: dynamics,
             persistence: r4(persistence), rsi14: r4(ctx.col("rsi14")), divergence: div, evidence: ev,
             direction: state === "POSITIVE" ? 1 : state === "NEGATIVE" ? -1 : 0,
             source: "Jegadeesh & Titman (1993); Moskowitz, Ooi & Pedersen (2012); Wilder (1978)" };
  }

  function analyzeVolatility(ctx) {
    /* Perzentile kommen aus feature-store.js auf der Skala 0–100 → hier 0–1. */
    var atrPct = ctx.col("atrPct"), pct100 = ctx.col("atrPctPercentile"), bbw100 = ctx.col("bollingerWidthPercentile"), rv = ctx.col("realizedVol"), rvl = ctx.col("realizedVolLong");
    var pct = isNum(pct100) ? pct100 / 100 : null, bbw = isNum(bbw100) ? bbw100 / 100 : null;
    var regime = !isNum(pct) ? "UNDETERMINED" : pct < 0.15 ? "COMPRESSED" : pct < 0.7 ? "NORMAL" : pct < 0.93 ? "ELEVATED" : "EXTREME";
    var squeeze = isNum(bbw) && bbw < 0.1;
    var expanding = isNum(rv) && isNum(rvl) && rvl > 0 ? rv / rvl > 1.25 : null;
    return { engineVersion: ENGINE_VERSION, family: "VOLATILITY", evidenceGrade: "A", regime: regime, atr: r4(ctx.atr), atrPct: r4(atrPct), atrPercentile: r4(pct),
             squeeze: squeeze, expanding: expanding, realizedVol: r4(rv),
             evidence: regime === "UNDETERMINED" ? [] : [{ key: "vol_regime", polarity: 0, statement: regime === "COMPRESSED" ? "Ungewöhnlich ruhige Schwankungen — oft vor einer größeren Bewegung" : regime === "NORMAL" ? "Normale Schwankungsbreite" : regime === "ELEVATED" ? "Erhöhte Schwankungen" : "Extreme Schwankungen — Zonen sind entsprechend breit" }],
             source: "Wilder (1978); Engle (1982); Bollerslev (1986); Bollinger (2001)" };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, analyzeMomentum: analyzeMomentum, analyzeVolatility: analyzeVolatility, divergence: divergence };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIMomentumVolatility = api; }
})(typeof window !== "undefined" ? window : globalThis);
