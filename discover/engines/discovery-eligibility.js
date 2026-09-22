(function (global) {
  "use strict";

  var VERSION = "discover-eligibility-1.0.0";
  var BLOCKED_QUALITY = ["FAIL", "UNAVAILABLE"];
  var RankingHygiene = typeof require === "function"
    ? require("../../quant/engines/ranking-hygiene.js")
    : global.VURankingHygiene;

  function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  /* Consumer Discovery is a recommendation surface, not the security
     directory. A quarantined title remains searchable and keeps its stock
     page; only rankings, collections and the swipe feed exclude it. */
  function assess(stock) {
    stock = stock || {};
    var quality = stock.dataQuality || "PASS";
    var qualityReason = stock.dataQualityReason || null;
    var hygieneIssues = RankingHygiene && RankingHygiene.inspectRow({
      dataQuality: "PASS",
      values: stock.rawValues || {}
    }) || [];
    var implausibleReturn = hygieneIssues.some(function (issue) {
      return issue.reason === "IMPLAUSIBLE_VALUE" &&
        (issue.metric.indexOf("returns.") === 0 || issue.metric === "return12M1M");
    });
    if (BLOCKED_QUALITY.indexOf(quality) >= 0 ||
        (quality === "WARNING" && implausibleReturn)) {
      return {
        eligible: false,
        reason: "DATA_QUALITY_REVIEW",
        message: "Die Kursreihe ist wegen einer auffälligen Bewegung oder einer möglichen " +
          "Kapitalmaßnahme in Prüfung. Die Aktie bleibt suchbar, erscheint aber nicht in " +
          "Discovery-Rankings oder im Entdecken-Feed.",
        quality: quality,
        qualityReason: qualityReason,
        policyVersion: VERSION
      };
    }

    var metrics = stock.metrics || {};
    var horizons = ["return1M", "return3M", "return6M", "return12M"];
    var known = horizons.filter(function (horizon) { return isNumber(metrics[horizon]); });
    if (!known.length) {
      return { eligible: false, reason: "NO_RETURNS",
        message: "Keine Rendite über irgendeinen Horizont berechenbar.",
        policyVersion: VERSION };
    }
    var allZero = known.every(function (horizon) { return metrics[horizon] === 0; });
    if (allZero && (metrics.volatility252d === 0 || metrics.volatility252d === null)) {
      return { eligible: false, reason: "STALE_SERIES",
        message: "Die Kursreihe steht seit über einem Jahr still (keine Rendite, keine " +
          "Volatilität). Ein Abstand von 0 % zum Jahreshoch ist hier kein Signal.",
        policyVersion: VERSION };
    }
    return { eligible: true, reason: null, message: null, policyVersion: VERSION };
  }

  var api = { VERSION: VERSION, BLOCKED_QUALITY: BLOCKED_QUALITY, assess: assess };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUDiscoveryEligibility = api;
})(typeof window !== "undefined" ? window : globalThis);
