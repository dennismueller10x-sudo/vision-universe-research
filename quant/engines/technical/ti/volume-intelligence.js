/* =========================================================================
   VISION UNIVERSE TECHNICAL INTELLIGENCE — ti/volume-intelligence.js
   VOLUMEN: BESTAETIGUNG, AKKUMULATION/DISTRIBUTION, ANCHORED VWAP,
   VOLUMENPROFIL (as-of)

   Datenlage ehrlich: Es gibt Tagesbalken mit Volumen, keine Ticks und
   keine Intraday-Historie. Deshalb:
     • Anchored VWAP rechnet mit dem typischen Preis (H+L+C)/3 je Tagesbar
       (Naeherung; Shannon 2023 nutzt Intraday-VWAP). Ausgewiesen als
       "tagesbasiert".
     • Volumenprofil verteilt das Tagesvolumen gleichmaessig ueber die
       Tagesspanne (Naeherung des Market Profile, Steidlmayer & Koy 1986).
       Kein Anspruch auf Auktionsgenauigkeit.
     • Reine Wochenschluss-Reihen haben kein Volumen → alles UNAVAILABLE.

   Evidenz: Volumen-Rendite-Beziehungen sind belegt (Karpoff 1987;
   Gervais, Kaniel & Mingelgrin 2001; Llorente et al. 2002 — Grad B);
   AVWAP und Volume Profile als Unterstuetzung sind Praktiker-Lehre (D).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "ti-volume-1.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function r4(v) { return isNum(v) ? Math.round(v * 1e4) / 1e4 : null; }

  function avwap(ctx, anchorIndex) {
    var s = ctx.series, pv = 0, vv = 0;
    for (var k = anchorIndex; k <= ctx.t; k++) {
      var vol = s.volume[k]; if (!isNum(vol) || vol <= 0) continue;
      pv += (s.high[k] + s.low[k] + s.close[k]) / 3 * vol; vv += vol;
    }
    return vv > 0 ? pv / vv : null;
  }

  function volumeProfile(ctx, bars, bins) {
    var s = ctx.series, from = Math.max(0, ctx.t - bars + 1), lo = Infinity, hi = -Infinity;
    for (var k = from; k <= ctx.t; k++) { if (s.low[k] < lo) lo = s.low[k]; if (s.high[k] > hi) hi = s.high[k]; }
    if (!(hi > lo)) return null;
    var w = (hi - lo) / bins, hist = new Array(bins).fill(0), total = 0;
    for (var j = from; j <= ctx.t; j++) {
      var vol = s.volume[j]; if (!isNum(vol) || vol <= 0) continue;
      var a = Math.max(0, Math.floor((s.low[j] - lo) / w)), b = Math.min(bins - 1, Math.floor((s.high[j] - lo) / w));
      var share = vol / (b - a + 1);
      for (var q = a; q <= b; q++) hist[q] += share;
      total += vol;
    }
    if (!total) return null;
    var poc = 0; hist.forEach(function (h, q) { if (h > hist[poc]) poc = q; });
    /* Value Area: vom POC aus symmetrisch erweitern, bis 70 % erreicht sind. */
    var inVa = hist[poc], L = poc, R = poc;
    while (inVa < 0.7 * total && (L > 0 || R < bins - 1)) {
      var left = L > 0 ? hist[L - 1] : -1, right = R < bins - 1 ? hist[R + 1] : -1;
      if (right >= left) { R++; inVa += hist[R]; } else { L--; inVa += hist[L]; }
    }
    var mean = total / bins;
    var hvn = [], lvn = [];
    for (var z = 1; z < bins - 1; z++) {
      if (hist[z] > hist[z - 1] && hist[z] >= hist[z + 1] && hist[z] > 1.3 * mean) hvn.push(r4(lo + (z + 0.5) * w));
      if (hist[z] < hist[z - 1] && hist[z] <= hist[z + 1] && hist[z] < 0.6 * mean) lvn.push(r4(lo + (z + 0.5) * w));
    }
    return { bars: ctx.t - from + 1, poc: r4(lo + (poc + 0.5) * w), valueAreaLow: r4(lo + L * w), valueAreaHigh: r4(lo + (R + 1) * w), highVolumeNodes: hvn, lowVolumeNodes: lvn,
             method: "DAILY_RANGE_UNIFORM", note: "Tagesvolumen gleichmäßig über die Tagesspanne verteilt (Näherung, keine Tickdaten)" };
  }

  function analyze(ctx, anchorScale) {
    if (!ctx.hasVolume) return { engineVersion: ENGINE_VERSION, family: "VOLUME", status: "UNAVAILABLE", reason: "NO_VOLUME_DATA", detail: "Die Kursreihe enthält kein Volumen.", evidence: [], direction: 0 };
    var s = ctx.series, t = ctx.t, w = Math.round(ctx.profile.barsPerYear / 5);
    var upV = 0, dnV = 0;
    for (var k = Math.max(1, t - w + 1); k <= t; k++) { var v = s.volume[k]; if (!isNum(v)) continue; if (s.close[k] > s.close[k - 1]) upV += v; else if (s.close[k] < s.close[k - 1]) dnV += v; }
    var udRatio = dnV > 0 ? upV / dnV : null;
    var rvol = ctx.col("relativeVolume"), volTrend = ctx.col("volumeTrend");
    /* Anker: letztes bestaetigtes großes Tief und Hoch der Anker-Skala. */
    var view = ctx.view(anchorScale || "scale-3"), anchors = [];
    if (view) {
      var lastLow = null, lastHigh = null;
      view.confirmed.forEach(function (p) { if (p.side === "LOW") lastLow = p; else lastHigh = p; });
      [lastLow, lastHigh].forEach(function (p) { if (!p) return; var val = avwap(ctx, p.pivotIndex); if (isNum(val)) anchors.push({ anchor: p.side === "LOW" ? "MAJOR_LOW" : "MAJOR_HIGH", anchorTime: p.pivotTime, anchorPrice: r4(p.pivotPrice), vwap: r4(val), priceAbove: ctx.close > val }); });
    }
    var profile = volumeProfile(ctx, Math.round(ctx.profile.barsPerYear / 2), 40);
    var accDist = udRatio === null ? "UNDETERMINED" : udRatio > 1.25 ? "ACCUMULATION" : udRatio < 0.8 ? "DISTRIBUTION" : "BALANCED";
    var ev = [];
    if (accDist === "ACCUMULATION") ev.push({ key: "up_down_volume", polarity: 1, statement: "An steigenden Tagen wird deutlich mehr gehandelt als an fallenden" });
    if (accDist === "DISTRIBUTION") ev.push({ key: "up_down_volume", polarity: -1, statement: "An fallenden Tagen wird deutlich mehr gehandelt als an steigenden" });
    var lowAnchor = anchors.filter(function (a) { return a.anchor === "MAJOR_LOW"; })[0];
    if (lowAnchor) ev.push({ key: "avwap_low", polarity: lowAnchor.priceAbove ? 1 : -1, statement: lowAnchor.priceAbove ? "Kurs über dem volumengewichteten Durchschnitt seit dem letzten großen Tief" : "Kurs unter dem volumengewichteten Durchschnitt seit dem letzten großen Tief" });
    return {
      engineVersion: ENGINE_VERSION, family: "VOLUME", evidenceGrade: "B", status: "OK",
      relativeVolume: r4(rvol), volumeTrend: r4(volTrend), upDownVolumeRatio: r4(udRatio), accumulation: accDist,
      anchoredVwap: anchors, anchoredVwapMethod: "TYPICAL_PRICE_DAILY", profile: profile, evidence: ev,
      direction: accDist === "ACCUMULATION" ? 1 : accDist === "DISTRIBUTION" ? -1 : 0,
      source: "Karpoff (1987); Gervais, Kaniel & Mingelgrin (2001); Llorente et al. (2002); Shannon (2023, AVWAP); Steidlmayer & Koy (1986)"
    };
  }

  /** Volumen an einer bestimmten Bar relativ zum Durchschnitt davor (fuer Ausbruchsbestaetigung). */
  function breakoutVolume(ctx, index) {
    if (!ctx.hasVolume) return null;
    var r = ctx.col("relativeVolume", index);
    return isNum(r) ? { relativeVolume: r4(r), confirmed: r >= 1.4 } : null;
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, analyze: analyze, avwap: avwap, volumeProfile: volumeProfile, breakoutVolume: breakoutVolume };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TIVolume = api; }
})(typeof window !== "undefined" ? window : globalThis);
