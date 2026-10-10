/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/dow-trend.js
   DOW-THEORIE / TREND-ENGINE (as-of)

   Quelle: Hamilton (1922) "The Stock Market Barometer", Rhea (1932) "The
   Dow Theory": drei gleichzeitige Bewegungen — Primary (Monate bis Jahre),
   Secondary (Reaktionen gegen den Primary, Wochen bis Monate), Minor
   (Tage). Ein Aufwaertstrend besteht aus hoeheren Hochs UND hoeheren
   Tiefs; er gilt, bis das letzte bestaetigte Tief per Schlusskurs
   unterschritten wird. Brown, Goetzmann & Kumar (1998, JF 53(4)) fanden
   fuer Hamiltons Signale 1902–29 positive risikoadjustierte Renditen
   (Evidenzgrad C: ein Autor, eine Epoche).

   Formalisierung VU:
     • Primary  = Swings der groebsten Pivot-Skala mit >= 4 Pivots
                  (+ Bestaetigung durch die langsame MA, Evidenzgrad A:
                  Zeitreihen-Momentum/Trendfolge, Moskowitz et al. 2012).
     • Secondary = naechstfeinere Skala, Short-Term = darunter.
     • Zustand je Ebene: UP / DOWN / MIXED + "Kipp-Niveau" (das Niveau,
       dessen Bruch per Schlusskurs den Trend nach Dow beendet).
     • Weinstein-Stufe (1988) ueber die 30-Wochen-Linie (Tag: 150 Tage).

   Alles kausal: Pivots per pivotView(t), MAs aus kausalen Spalten.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "ti-dow-trend-1.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }

  /** Struktureller Zustand einer Skala an t. */
  function swingState(ctx, scaleId) {
    var v = ctx.view(scaleId);
    if (!v) return { scaleId: scaleId, state: "UNDETERMINED", reason: "NO_SCALE" };
    var highs = v.confirmed.filter(function (p) { return p.side === "HIGH"; }), lows = v.confirmed.filter(function (p) { return p.side === "LOW"; });
    if (highs.length < 2 || lows.length < 2) return { scaleId: scaleId, state: "UNDETERMINED", reason: "TOO_FEW_SWINGS", swings: v.confirmed.length };
    var h1 = highs[highs.length - 1], h0 = highs[highs.length - 2], l1 = lows[lows.length - 1], l0 = lows[lows.length - 2];
    var hh = h1.pivotPrice > h0.pivotPrice, hl = l1.pivotPrice > l0.pivotPrice;
    var state = hh && hl ? "UP" : !hh && !hl ? "DOWN" : "MIXED";
    var close = ctx.close, flip = null, status = "INTACT";
    if (state === "UP") { flip = l1.pivotPrice; if (close < l1.pivotPrice) status = "BROKEN"; }
    else if (state === "DOWN") { flip = h1.pivotPrice; if (close > h1.pivotPrice) status = "BROKEN"; }
    else {
      /* Uebergang: der naechste Bruch entscheidet. */
      if (close > h1.pivotPrice) { state = "UP"; status = "NEW"; flip = l1.pivotPrice; }
      else if (close < l1.pivotPrice) { state = "DOWN"; status = "NEW"; flip = h1.pivotPrice; }
    }
    /* Developing-Leg: laeuft gerade eine Reaktion gegen den Zustand? */
    var dev = v.developing, reacting = false;
    if (dev && state === "UP" && dev.side === "LOW") reacting = true;
    if (dev && state === "DOWN" && dev.side === "HIGH") reacting = true;
    var since = state === "UP" ? Math.min(h1.pivotIndex, l1.pivotIndex) : state === "DOWN" ? Math.min(h1.pivotIndex, l1.pivotIndex) : null;
    return { scaleId: scaleId, state: state, status: status, reacting: reacting, flipLevel: isNum(flip) ? r4(flip) : null,
             lastHigh: { price: r4(h1.pivotPrice), time: h1.pivotTime, confirmedAt: h1.confirmedAt }, prevHigh: { price: r4(h0.pivotPrice), time: h0.pivotTime },
             lastLow: { price: r4(l1.pivotPrice), time: l1.pivotTime, confirmedAt: l1.confirmedAt }, prevLow: { price: r4(l0.pivotPrice), time: l0.pivotTime },
             sinceIndex: since };
  }

  /** MA-Trend der langsamen Linie: Lage + Steigung. */
  function maTrend(ctx) {
    var p = ctx.profile, slow = ctx.col(p.slow), fast = ctx.col(p.fast);
    var k = Math.round(p.barsPerYear / 12), past = ctx.t - k >= 0 ? ctx.col(p.slow, ctx.t - k) : null;
    if (!isNum(slow) || !isNum(past)) return { state: "UNDETERMINED" };
    var slope = (slow - past) / past;
    var above = ctx.close > slow;
    var state = above && slope > 0 ? "UP" : !above && slope < 0 ? "DOWN" : "MIXED";
    return { state: state, slowMa: r4(slow), fastMa: isNum(fast) ? r4(fast) : null, slowSlopePerMonth: r4(slope), priceVsSlowPct: r4(ctx.close / slow - 1), fastAboveSlow: isNum(fast) ? fast > slow : null };
  }

  /** Weinstein-Stufe: 1 Basis, 2 Aufwaerts, 3 Top, 4 Abwaerts. */
  function weinsteinStage(ctx) {
    var p = ctx.profile, ma = ctx.col(p.stage), k = Math.round(p.barsPerYear / 12);
    var past = ctx.t - k >= 0 ? ctx.col(p.stage, ctx.t - k) : null;
    var farIdx = ctx.t - Math.round(p.barsPerYear / 2), far = farIdx >= 0 ? ctx.col(p.stage, farIdx) : null;
    if (!isNum(ma) || !isNum(past)) return { stage: null };
    var slope = (ma - past) / past, flat = Math.abs(slope) < 0.005;   // < 0,5 % je Monat = "flach"
    var above = ctx.close > ma, priorUp = isNum(far) ? ma > far : null;
    var stage = !flat && slope > 0 && above ? 2 : !flat && slope < 0 && !above ? 4 : flat ? (priorUp === false ? 1 : priorUp === true ? 3 : null) : (above ? 1 : 3);
    return { stage: stage, line: r4(ma), slopePerMonth: r4(slope), source: "Weinstein (1988), Secrets for Profiting in Bull and Bear Markets" };
  }

  function analyze(ctx) {
    var ids = ctx.scaleIds;
    /* Primary = groebste Skala mit >= 4 bestaetigten Pivots. */
    var levels = [];
    for (var k = ids.length - 1; k >= 0; k--) { var v = ctx.view(ids[k]); if (v && v.confirmed.length >= 4) levels.push(ids[k]); }
    var prim = levels[0] ? swingState(ctx, levels[0]) : { state: "UNDETERMINED", reason: "TOO_FEW_SWINGS" };
    var sec = levels[1] ? swingState(ctx, levels[1]) : { state: "UNDETERMINED", reason: "TOO_FEW_SWINGS" };
    var shortT = levels[2] ? swingState(ctx, levels[2]) : { state: "UNDETERMINED", reason: "TOO_FEW_SWINGS" };
    var ma = maTrend(ctx), stage = weinsteinStage(ctx);

    /* Primary-Richtung: Struktur zuerst; die MA bestaetigt oder relativiert. */
    var primaryDir = prim.state === "UP" && prim.status !== "BROKEN" ? 1 : prim.state === "DOWN" && prim.status !== "BROKEN" ? -1 : 0;
    if (primaryDir === 0 && (ma.state === "UP" || ma.state === "DOWN")) primaryDir = ma.state === "UP" ? 1 : -1;
    var maAgrees = ma.state === "UP" ? primaryDir > 0 : ma.state === "DOWN" ? primaryDir < 0 : null;
    var secDir = sec.state === "UP" ? 1 : sec.state === "DOWN" ? -1 : 0;
    /* Dow: Secondary-Reaktion = Bewegung gegen den Primary. */
    var phase = primaryDir === 0 ? "NO_PRIMARY_TREND"
      : secDir === primaryDir && !sec.reacting ? "TREND_ADVANCING"
      : secDir === -primaryDir ? "SECONDARY_REACTION"
      : sec.reacting || shortT.state === (primaryDir > 0 ? "DOWN" : "UP") ? "PULLBACK" : "TREND_ADVANCING";
    var strength = primaryDir === 0 ? 0 : (maAgrees ? 2 : 1) + (secDir === primaryDir ? 1 : 0);
    var evidence = [];
    if (prim.state !== "UNDETERMINED") evidence.push({ key: "primary_structure", polarity: prim.state === "UP" ? 1 : prim.state === "DOWN" ? -1 : 0,
      statement: prim.state === "UP" ? "Übergeordnet steigende Hochs und Tiefs" : prim.state === "DOWN" ? "Übergeordnet fallende Hochs und Tiefs" : "Übergeordnete Struktur gemischt" });
    if (ma.state !== "UNDETERMINED") evidence.push({ key: "slow_ma", polarity: ma.state === "UP" ? 1 : ma.state === "DOWN" ? -1 : 0,
      statement: ma.state === "UP" ? "Kurs über steigender langer Durchschnittslinie" : ma.state === "DOWN" ? "Kurs unter fallender langer Durchschnittslinie" : "Lange Durchschnittslinie ohne klare Richtung" });
    return {
      engineVersion: ENGINE_VERSION, family: "TREND", evidenceGrade: "A", repaintingPolicy: "CONFIRMS_WITH_DELAY",
      primary: Object.assign({ direction: primaryDir > 0 ? "UP" : primaryDir < 0 ? "DOWN" : "NONE" }, prim, { maTrend: ma, maAgrees: maAgrees }),
      secondary: sec, shortTerm: shortT, stage: stage, phase: phase, strength: strength,
      direction: primaryDir, evidence: evidence,
      source: "Hamilton (1922); Rhea (1932); Brown, Goetzmann & Kumar (1998); Moskowitz, Ooi & Pedersen (2012)"
    };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, analyze: analyze, swingState: swingState, maTrend: maTrend, weinsteinStage: weinsteinStage };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIDowTrend = api; }
})(typeof window !== "undefined" ? window : globalThis);
