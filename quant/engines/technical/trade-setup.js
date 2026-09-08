/* =========================================================================
   VISION UNIVERSE TECHNICAL — trade-setup.js
   TRADE SETUP / RISK-REWARD

   Technische Analyse ≠ Trade Setup. Ein Setup entsteht NUR, wenn
   Scenario + Entry + Invalidation + Target vorhanden sind (Quality Gate).
   Fehlt eines: status INCOMPLETE mit missing[] — kein Teilsetup, kein
   erfundener Wert.

     Risk   = Entry − Stop                (als Range ueber die Entry Zone)
     RR_low = (TargetLow − EntryHigh) / (EntryHigh − Stop)
     RR_high= (TargetHigh − EntryLow) / (EntryLow − Stop)

   Keine Positionsgroesse, keine Brokerage, keine persoenliche Empfehlung.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var C = isNode ? require("./engine-common.js") : global.VUTechnical.Common;

  var ENGINE_VERSION = "setup-1.0.0";
  var DEFAULTS = { minRiskRewardForSetup: 1.5, minRiskAtr: 0.75, maxRiskAtr: 6, maxEntryDistanceAtr: 4 };

  /**
   * @param {object} scenario Scenario-Objekt
   * @param {object} ctx      { close, atr, averageVolume, cfg }
   */
  function buildTradeSetup(scenario, ctx) {
    var cfg = Object.assign({}, DEFAULTS, (ctx && ctx.cfg) || {});
    var missing = [];
    if (!scenario) return { engineVersion: ENGINE_VERSION, status: "INCOMPLETE", missing: ["scenario"], scenarioId: null };
    if (!scenario.entryZone) missing.push("entry");
    if (!scenario.invalidation || !C.isNum(scenario.invalidation.price)) missing.push("invalidation");
    if (!scenario.targetZones || !scenario.targetZones.length) missing.push("target");
    if (scenario.status === "INVALIDATED" || scenario.status === "UNDETERMINED") missing.push("validScenario");
    var setupBase = { engineVersion: ENGINE_VERSION, scenarioId: scenario.scenarioId, direction: scenario.direction, parametersHash: Hash.hashValue({ v: ENGINE_VERSION, cfg: cfg }) };
    if (missing.length) return Object.assign(setupBase, { setupId: "ts_" + Hash.hashValue({ s: scenario.scenarioId, m: missing }), status: "INCOMPLETE", missing: missing, riskReward: null, setupQuality: null });

    var sign = scenario.direction === "BULLISH" ? 1 : -1;
    var entry = scenario.entryZone, stop = scenario.tradeStop && C.isNum(scenario.tradeStop.price) ? scenario.tradeStop.price : scenario.invalidation.price;
    var atr = ctx.atr, close = ctx.close;
    var riskLow = sign > 0 ? entry.zoneLow - stop : stop - entry.zoneHigh;
    var riskHigh = sign > 0 ? entry.zoneHigh - stop : stop - entry.zoneLow;
    if (riskLow <= 0) return Object.assign(setupBase, { setupId: "ts_" + Hash.hashValue({ s: scenario.scenarioId, m: ["stopInsideEntry"] }), status: "INCOMPLETE", missing: ["stopInsideEntry"], riskReward: null, setupQuality: null });

    var targets = scenario.targetZones.map(function (tz, k) {
      var rewardLow = sign > 0 ? tz.zoneLow - entry.zoneHigh : entry.zoneLow - tz.zoneHigh;
      var rewardHigh = sign > 0 ? tz.zoneHigh - entry.zoneLow : entry.zoneHigh - tz.zoneLow;
      return { label: tz.label || ("Target Zone " + (k + 1)), zoneLow: tz.zoneLow, zoneHigh: tz.zoneHigh, sources: tz.sources,
               rewardLow: C.round(rewardLow, 4), rewardHigh: C.round(rewardHigh, 4),
               rrLow: C.round(rewardLow / riskHigh, 2), rrHigh: C.round(rewardHigh / riskLow, 2),
               upsideLow: C.round(sign > 0 ? tz.zoneLow / entry.zoneHigh - 1 : 1 - tz.zoneHigh / entry.zoneLow, 4),
               upsideHigh: C.round(sign > 0 ? tz.zoneHigh / entry.zoneLow - 1 : 1 - tz.zoneLow / entry.zoneHigh, 4) };
    });
    var t1 = targets[0];
    var riskAtr = C.isNum(atr) && atr > 0 ? riskHigh / atr : NaN;
    /* AUDIT-FIX: Distanz zur Zone auf beiden Seiten; liegt der Kurs jenseits der
       Zone Richtung Stop, ist die Entry-Naehe keine Qualitaet (0). */
    var beyondTowardStop = sign > 0 ? close < entry.zoneLow : close > entry.zoneHigh;
    var entryDist = C.isNum(atr) && atr > 0 ? (close >= entry.zoneLow && close <= entry.zoneHigh ? 0 : Math.min(Math.abs(close - entry.zoneLow), Math.abs(close - entry.zoneHigh)) / atr) : NaN;

    /* Setup Quality 0–100: RR, Stop-Distanz-Sanity, Entry-Naehe, Liquiditaet. */
    var q = {};
    q.riskReward = C.clamp((t1.rrLow - 0.5) / 3, 0, 1) * 100;
    q.stopDistance = !C.isNum(riskAtr) ? NaN : riskAtr < cfg.minRiskAtr ? 40 : riskAtr > cfg.maxRiskAtr ? 30 : 100;
    q.entryProximity = !C.isNum(entryDist) ? NaN : beyondTowardStop ? 0 : 100 * C.clamp(1 - entryDist / cfg.maxEntryDistanceAtr, 0, 1);
    q.liquidity = C.isNum(ctx.averageVolume) ? (ctx.averageVolume > 0 ? 100 : 0) : NaN;
    var ws = C.weightedScore(q, { riskReward: 0.45, stopDistance: 0.2, entryProximity: 0.25, liquidity: 0.1 });
    var quality = C.isNum(ws.score) ? C.round(ws.score, 1) : null;
    var status = t1.rrLow >= cfg.minRiskRewardForSetup ? "COMPLETE" : "COMPLETE_LOW_RR";

    return Object.assign(setupBase, {
      setupId: "ts_" + Hash.hashValue({ s: scenario.scenarioId, e: entry, stop: stop, t: targets.map(function (t) { return [t.zoneLow, t.zoneHigh]; }) }),
      status: status, missing: [],
      entry: { zoneLow: entry.zoneLow, zoneHigh: entry.zoneHigh, reference: C.round((entry.zoneLow + entry.zoneHigh) / 2, 4), status: scenario.entryStatus, sources: entry.sources },
      analysisInvalidation: scenario.invalidation, tradeStop: { price: stop, note: scenario.tradeStop ? scenario.tradeStop.note : null },
      riskToInvalidation: { low: C.round(riskLow, 4), high: C.round(riskHigh, 4), atr: C.isNum(riskAtr) ? C.round(riskAtr, 2) : null,
                            pctLow: C.round(riskLow / (sign > 0 ? entry.zoneLow : entry.zoneHigh), 4), pctHigh: C.round(riskHigh / (sign > 0 ? entry.zoneHigh : entry.zoneLow), 4) },
      targets: targets,
      potentialReward: { low: t1.rewardLow, high: targets[targets.length - 1].rewardHigh },
      potentialUpside: { low: t1.upsideLow, high: targets[targets.length - 1].upsideHigh },
      riskReward: { low: t1.rrLow, high: t1.rrHigh, target2Low: targets[1] ? targets[1].rrLow : null, target2High: targets[1] ? targets[1].rrHigh : null },
      setupQuality: quality, qualityComponents: Object.keys(q).reduce(function (o, k) { o[k] = C.isNum(q[k]) ? C.round(q[k], 1) : null; return o; }, {}),
      entryDistanceAtr: C.isNum(entryDist) ? C.round(entryDist, 2) : null,
      scoreType: "methodology_score", note: "Kein Positionsmass, keine Ausfuehrung, keine persoenliche Empfehlung."
    });
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, buildTradeSetup: buildTradeSetup };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.TradeSetup = api; }
})(typeof window !== "undefined" ? window : globalThis);
