/* =========================================================================
   VISION UNIVERSE TECHNICAL — strategy-packs.js
   LEGENDARY STRATEGIES — ARCHITEKTUR (V1.5 Workstream, nur Interface)

   Plugin-/Rule-Pack-Architektur fuer spaetere Methodiken (Minervini-artige
   Trend-Templates, VCP, Darvas, Donchian, Stage Analysis). V1 implementiert
   KEINE Named-Strategy-Regel: Methodik-/IP-/Trademark-Fragen sind offen
   (LEGAL REVIEW REQUIRED laut Research). Es existiert nur der Vertrag:

     RulePack { packId, version, label, origin: "VU" | "NAMED_METHOD",
                requires: [engine keys], evaluate(bundle) → { packId, criteria: [{ id, passed, value, statement }], score, status } }

   Die Engine-APIs (Trend, RS, 52W-Naehe, Volumen, Kompression, Ausbruch,
   Pivots/Struktur fuer Box-Logik) liefern bereits alle Eingaben, die diese
   Packs spaeter brauchen (Minervini-/Darvas-Readiness, §61/§62).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);

  var PACK_INTERFACE = ["packId", "version", "label", "origin", "requires", "evaluate"];
  var packs = Object.create(null);

  function validatePack(pack) {
    var errors = [];
    PACK_INTERFACE.forEach(function (k) { if (!(k in pack)) errors.push("RulePack ohne " + k); });
    if (pack.origin === "NAMED_METHOD" && !pack.legalReview) errors.push("Named Method ohne legalReview-Nachweis (LEGAL REVIEW REQUIRED)");
    if (typeof pack.evaluate !== "function") errors.push("evaluate fehlt");
    return { valid: errors.length === 0, errors: errors };
  }
  function registerPack(pack) {
    var v = validatePack(pack);
    if (!v.valid) throw new Error(v.errors.join("; "));
    packs[pack.packId] = pack;
    return pack;
  }
  function listPacks() { return Object.keys(packs).map(function (k) { return { packId: k, version: packs[k].version, label: packs[k].label, origin: packs[k].origin, requires: packs[k].requires }; }); }
  function evaluateAll(bundle) {
    return Object.keys(packs).map(function (k) {
      var p = packs[k];
      var missing = p.requires.filter(function (r) { return !bundle[r]; });
      if (missing.length) return { packId: k, status: "UNAVAILABLE", missing: missing };
      return Object.assign({ packId: k, version: p.version }, p.evaluate(bundle));
    });
  }

  /** Eingabe-Readiness fuer spaetere Packs — reine Feature-Extraktion, keine Regel. */
  function readinessInputs(bundle) {
    return {
      trend: { direction: bundle.trend.direction, score: bundle.trend.trendScore, priceVsSma50: bundle.trend.metrics.sma50 ? bundle.lastBar.close / bundle.trend.metrics.sma50 - 1 : null, priceVsSma200: bundle.trend.metrics.sma200 ? bundle.lastBar.close / bundle.trend.metrics.sma200 - 1 : null, sma200SlopeAtr: bundle.featuresAtCutoff.sma200SlopeAtr },
      relativeStrength: { state: bundle.relativeStrength.state, score: bundle.relativeStrength.rsScore, universeRank: bundle.relativeStrength.universeRank },
      proximity52w: { distanceToHigh: bundle.trend.metrics.distanceTo52wHigh, distanceToLow: bundle.trend.metrics.distanceTo52wLow },
      volume: { state: bundle.volume.state, relativeVolume: bundle.volume.metrics ? bundle.volume.metrics.relativeVolume : null, dryUp: bundle.volume.dryUp },
      contraction: { compression: bundle.volatility.compression, atrPctPercentile: bundle.volatility.metrics.atrPctPercentile, swingVolatility: bundle.structure.state.swingVolatility },
      breakout: { lastEvent: bundle.structure.events.filter(function (e) { return /BOS|BREAKOUT/.test(e.type); }).slice(-1)[0] || null, lastStructuralHigh: bundle.structure.state.lastStructuralHigh },
      boxLogic: { pivots: bundle.pivots.scales[bundle.structure.scaleId].pivots.slice(-6).map(function (p) { return { side: p.side, price: p.pivotPrice, time: p.pivotTime, confirmedAt: p.confirmedAt }; }) }
    };
  }

  var api = { PACK_INTERFACE: PACK_INTERFACE, validatePack: validatePack, registerPack: registerPack, listPacks: listPacks, evaluateAll: evaluateAll, readinessInputs: readinessInputs,
              PLANNED: ["vu-trend-leadership", "vu-vcp-research", "vu-darvas-box", "vu-donchian-breakout", "vu-stage-analysis"] };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.StrategyPacks = api; }
})(typeof window !== "undefined" ? window : globalThis);
