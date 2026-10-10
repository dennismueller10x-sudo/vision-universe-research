/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/outcomes.js
   OUTCOME-SIMULATION + STATISTIK FUER DIE EVIDENCE-SCHICHT

   Zeitachsen strikt getrennt:
     EVENT TIME      Bar, an der ein Pivot/Muster stattfand
     DETECTION TIME  Bar t, an der das System es kennen konnte (Pivot
                     bestaetigt, Ausbruch per Schluss) — das Szenario wird an
                     t mit Bars <= t berechnet
     OUTCOME         beginnt fruehestens an t+1

   Ausfuehrungsregeln (vorab festgelegt, nicht optimiert):
     • Einstieg: Limit an der nahen Kante der Einstiegszone, gueltig
       `entryWindow` Bars ab t+1. Eroeffnet eine Bar jenseits der Kante,
       Fill zur Eroeffnung. Jede Beruehrung ist ein Fill — schliesst die
       Fill-Bar jenseits der Invalidation, ist das ein Verlust (INVALIDATED).
     • Ziel 1 erreicht: High (bullish) >= Zielzonen-Untergrenze.
     • Invalidation: SCHLUSS jenseits der Invalidation (close basis, wie
       im Produkt kommuniziert). Ziel und Invalidation in derselben Bar →
       als Invalidation gezaehlt (konservativ).
     • Ausstieg an Ziel 1; Ziel 2 wird nur als "erreicht vor Invalidation"
       mitgezaehlt (ohne Einfluss auf Ausstieg und Rendite).
     • Zeitablauf nach `horizon` Bars → TIMEOUT mit Rendite zum Schluss.
     • Kosten: `costBps` je Seite auf die Rendite (Standard 10 bp).
   Baseline: DIESELBE Geometrie (Ziel-/Invalidationsabstand in %) an einem
   zufaelligen Bar desselben Titels mit sofortigem Einstieg. Damit misst
   der Uplift den Wert des TIMINGS und der Auswahl, nicht der Geometrie
   (Treffer vor Stopp haengt bei Zufallspfaden fast nur vom Abstands-
   verhaeltnis ab: P ≈ b/(a+b), "Gambler's Ruin").
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var VERSION = "ti-outcomes-1.0.0";
  var DEFAULTS = { entryWindow: 20, horizon: 126, costBps: 10 };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function r4(v) { return isNum(v) ? Math.round(v * 1e4) / 1e4 : null; }

  /**
   * @param {object} s     Serie (open/high/low/close)
   * @param {number} t     Erkennungs-Bar
   * @param {object} g     { dir:+1|-1, entryLow, entryHigh, invalidation, t1Low, t1High, t2Low?, t2High? }
   * @param {object} [o]   { entryWindow, horizon, costBps, immediate }
   */
  function simulate(s, t, g, o) {
    o = Object.assign({}, DEFAULTS, o || {});
    var n = s.length, d = g.dir;
    var near = d > 0 ? g.entryHigh : g.entryLow;
    var entryIdx = -1, entryPx = NaN, atClose = false;
    if (o.immediate) {
      /* Baseline: Einstieg zum Schluss der Bar t+1; diese Bar zaehlt danach nicht mehr mit. */
      if (t + 1 >= n) return { outcome: "NO_DATA" };
      entryIdx = t + 1; entryPx = s.close[t + 1]; atClose = true;
    } else {
      /* Einheitliche Regel (Review-Fix 02.10.2026): Limit an der nahen Zonenkante ab t+1.
         Wer die Zone beruehrt, ist gefuellt — auch wenn dieselbe Bar unter der
         Invalidation schliesst (das ist ein Verlust, kein "kein Einstieg"). */
      for (var k = t + 1; k < Math.min(n, t + 1 + o.entryWindow); k++) {
        var touched = d > 0 ? s.low[k] <= near : s.high[k] >= near;
        if (touched) { entryIdx = k; entryPx = d > 0 ? Math.min(s.open[k], near) : Math.max(s.open[k], near); break; }
      }
      if (entryIdx < 0) return { outcome: t + o.entryWindow >= n ? "NO_DATA" : "NO_ENTRY", reason: "ZONE_NOT_REACHED" };
    }
    var risk = Math.abs(entryPx - g.invalidation);
    if (!(risk > 0)) risk = Math.abs(entryPx) * 1e-4;
    var mfe = 0, mae = 0, outcome = null, exitIdx = -1, exitPx = NaN, t2 = false, t1Idx = -1;
    var last = Math.min(n - 1, entryIdx + o.horizon);
    /* Die Einstiegsbar selbst zaehlt nur ab dem Fill: Ziel in derselben Bar nur, wenn Einstieg zur Eroeffnung. */
    for (var j = atClose ? entryIdx + 1 : entryIdx; j <= last; j++) {
      var hi = s.high[j], lo = s.low[j], c = s.close[j];
      var fav = d > 0 ? hi - entryPx : entryPx - lo, adv = d > 0 ? entryPx - lo : hi - entryPx;
      if (j === entryIdx) { fav = d > 0 ? Math.max(0, c - entryPx) : Math.max(0, entryPx - c); adv = d > 0 ? Math.max(0, entryPx - c) : Math.max(0, c - entryPx); }
      if (fav > mfe) mfe = fav; if (adv > mae) mae = adv;
      var invHit = d > 0 ? c < g.invalidation : c > g.invalidation;
      var t1Hit = j > entryIdx ? (d > 0 ? hi >= g.t1Low : lo <= g.t1High) : false;
      if (invHit) { outcome = "INVALIDATED"; exitIdx = j; exitPx = c; break; }
      if (t1Hit && t1Idx < 0) { t1Idx = j; }
      /* Standardregel: Ausstieg an Ziel 1 (Limit an der Zonen-Untergrenze bzw. Eroeffnung, falls darueber). */
      if (t1Idx >= 0) { outcome = "TARGET1"; exitIdx = j; exitPx = d > 0 ? Math.max(g.t1Low, s.open[j]) : Math.min(g.t1High, s.open[j]); break; }
    }
    /* Ziel 2 wird getrennt erfasst: erreicht vor Invalidation innerhalb des Horizonts (ohne Einfluss auf den Ausstieg). */
    if (outcome === "TARGET1" && isNum(g.t2Low)) {
      for (var q = t1Idx; q <= last; q++) {
        if (d > 0 ? s.close[q] < g.invalidation : s.close[q] > g.invalidation) break;
        if (d > 0 ? s.high[q] >= g.t2Low : s.low[q] <= g.t2High) { t2 = true; break; }
      }
    }
    if (!outcome) { outcome = last - entryIdx >= o.horizon ? "TIMEOUT" : "OPEN"; exitIdx = last; exitPx = s.close[last]; }
    var cost = 2 * o.costBps / 1e4;
    var ret = d * (exitPx / entryPx - 1) - cost;
    var fwd = entryIdx + o.horizon < n ? d * (s.close[entryIdx + o.horizon] / entryPx - 1) : null;
    return { outcome: outcome, entryIndex: entryIdx, entryPrice: r4(entryPx), exitIndex: exitIdx, barsToEntry: entryIdx - t,
             barsToT1: t1Idx >= 0 ? t1Idx - entryIdx : null, barsToExit: exitIdx - entryIdx, target2: t2,
             mfeR: r4(mfe / risk), maeR: r4(mae / risk), mfePct: r4(mfe / entryPx), maePct: r4(mae / entryPx), returnPct: r4(ret), forwardReturnH: r4(fwd),
             riskPct: r4(risk / entryPx), rewardPct: r4(Math.abs((d > 0 ? g.t1Low : g.t1High) - entryPx) / entryPx) };
  }

  /** Geometrie eines Szenarios relativ zum Einstieg (fuer die Baseline). */
  function relativeGeometry(sim, g) {
    if (!isNum(sim.entryPrice)) return null;
    return { dir: g.dir, stopPct: Math.abs(sim.entryPrice - g.invalidation) / sim.entryPrice, targetPct: Math.abs((g.dir > 0 ? g.t1Low : g.t1High) - sim.entryPrice) / sim.entryPrice };
  }
  /** Dieselbe Geometrie, sofortiger Einstieg an Bar u. */
  function baseline(s, u, rg, o) {
    var px = s.close[u];
    var g = { dir: rg.dir, entryLow: px, entryHigh: px, invalidation: px * (1 - rg.dir * rg.stopPct), t1Low: px * (1 + rg.dir * rg.targetPct), t1High: px * (1 + rg.dir * rg.targetPct) };
    return simulate(s, u - 1, g, Object.assign({}, o, { immediate: true }));
  }

  // ------------------------------------------------------------ Statistik
  function wilson(k, n, z) {
    z = z || 1.96; if (!n) return [null, null];
    var p = k / n, den = 1 + z * z / n, c = (p + z * z / (2 * n)) / den, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
    return [r4(c - h), r4(c + h)];
  }
  function median(a) { a = a.filter(isNum).slice().sort(function (x, y) { return x - y; }); if (!a.length) return null; var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function quantile(a, q) { a = a.filter(isNum).slice().sort(function (x, y) { return x - y; }); if (!a.length) return null; var pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return a[lo] + (a[hi] - a[lo]) * (pos - lo); }
  function mean(a) { a = a.filter(isNum); return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  /**
   * Aggregiert Outcome-Records. Jeder Record: { outcome, …sim, baselineHit?, symbol }.
   * Trefferquote = TARGET1 / (TARGET1 + INVALIDATED + TIMEOUT) unter gefuellten Einstiegen.
   */
  function aggregate(recs) {
    var filled = recs.filter(function (r) { return r.outcome === "TARGET1" || r.outcome === "INVALIDATED" || r.outcome === "TIMEOUT"; });
    var signals = recs.filter(function (r) { return r.outcome !== "NO_DATA" && r.outcome !== "OPEN"; });
    var n = filled.length, k = filled.filter(function (r) { return r.outcome === "TARGET1"; }).length;
    var inv = filled.filter(function (r) { return r.outcome === "INVALIDATED"; }).length;
    /* Baseline: je Record baselineHits Treffer aus baselineDraws Zufallseinstiegen gleicher Geometrie. */
    var nb = 0, kb = 0;
    filled.forEach(function (r) { if (isNum(r.baselineDraws) && r.baselineDraws > 0) { nb += r.baselineDraws; kb += r.baselineHits; } });
    var p = n ? k / n : null, pb = nb ? kb / nb : null;
    var lift = p !== null && pb !== null ? p - pb : null;
    var se = p !== null && pb !== null && n && nb ? Math.sqrt(p * (1 - p) / n + pb * (1 - pb) / nb) : null;
    var ruin = mean(filled.map(function (r) { return isNum(r.riskPct) && isNum(r.rewardPct) && r.riskPct + r.rewardPct > 0 ? r.riskPct / (r.riskPct + r.rewardPct) : null; }));
    var symbols = {}; recs.forEach(function (r) { symbols[r.symbol] = true; });
    return {
      signals: signals.length, n: n, symbols: Object.keys(symbols).length, fillRate: signals.length ? r4(n / signals.length) : null,
      t1HitRate: r4(p), t1Ci: wilson(k, n), invalidationRate: n ? r4(inv / n) : null, timeoutRate: n ? r4((n - k - inv) / n) : null,
      t2HitRate: n ? r4(filled.filter(function (r) { return r.target2; }).length / n) : null,
      baselineRate: r4(pb), baselineN: nb, martingaleRate: r4(ruin), lift: r4(lift), liftCiLow: se !== null ? r4(lift - 1.96 * se) : null, liftCiHigh: se !== null ? r4(lift + 1.96 * se) : null,
      medianBarsToT1: median(filled.map(function (r) { return r.barsToT1; })), p25BarsToT1: r4(quantile(filled.map(function (r) { return r.barsToT1; }), 0.25)), p75BarsToT1: r4(quantile(filled.map(function (r) { return r.barsToT1; }), 0.75)),
      medianReturn: r4(median(filled.map(function (r) { return r.returnPct; }))), meanReturn: r4(mean(filled.map(function (r) { return r.returnPct; }))),
      medianMfeR: r4(median(filled.map(function (r) { return r.mfeR; }))), medianMaeR: r4(median(filled.map(function (r) { return r.maeR; }))),
      medianMfePct: r4(median(filled.map(function (r) { return r.mfePct; }))), medianMaePct: r4(median(filled.map(function (r) { return r.maePct; }))),
      medianRiskPct: r4(median(filled.map(function (r) { return r.riskPct; }))), medianRewardPct: r4(median(filled.map(function (r) { return r.rewardPct; }))),
      meanForwardReturnH: r4(mean(filled.map(function (r) { return r.forwardReturnH; })))
    };
  }

  /** Reliability-Tabelle + Brier fuer Vorhersagen p_i und Ausgaenge y_i. */
  function reliability(preds, ys, bins) {
    bins = bins || 5;
    var pairs = preds.map(function (p, i) { return [p, ys[i] ? 1 : 0]; }).filter(function (x) { return isNum(x[0]); }).sort(function (a, b) { return a[0] - b[0]; });
    var out = [], per = Math.max(1, Math.floor(pairs.length / bins));
    for (var b = 0; b < bins; b++) {
      var seg = pairs.slice(b * per, b === bins - 1 ? pairs.length : (b + 1) * per);
      if (!seg.length) continue;
      out.push({ predicted: r4(mean(seg.map(function (x) { return x[0]; }))), observed: r4(mean(seg.map(function (x) { return x[1]; }))), n: seg.length });
    }
    var brier = pairs.length ? pairs.reduce(function (a, x) { return a + Math.pow(x[0] - x[1], 2); }, 0) / pairs.length : null;
    return { bins: out, brier: r4(brier), n: pairs.length };
  }

  var api = { VERSION: VERSION, DEFAULTS: DEFAULTS, simulate: simulate, relativeGeometry: relativeGeometry, baseline: baseline, aggregate: aggregate, reliability: reliability, wilson: wilson, median: median, quantile: quantile, mean: mean };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIOutcomes = api; }
})(typeof window !== "undefined" ? window : globalThis);
