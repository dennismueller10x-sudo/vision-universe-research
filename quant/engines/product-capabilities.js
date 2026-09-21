(function (global) {
  "use strict";
  var VERSION = "product-capabilities-1.0.0";
  var EXPECTED = ["HAS_MARKET_DATA", "HAS_HISTORICAL", "HAS_INTRADAY", "HAS_LIVE", "HAS_FACTORS",
    "HAS_FUNDAMENTALS", "HAS_FUNDAMENTALS_5Y", "HAS_FUNDAMENTALS_10Y", "HAS_TTM",
    "HAS_NAME", "DISCOVER_ELIGIBLE", "HAS_STOCK_PAGE"];
  var COUNT_FIELDS = {
    HAS_MARKET_DATA: "historicalQualityAccepted", HAS_HISTORICAL: "historicalAvailable",
    HAS_INTRADAY: "intradayAvailable", HAS_LIVE: "liveCapable", HAS_FACTORS: "factorEligible",
    HAS_FUNDAMENTALS: "fundamentals", HAS_FUNDAMENTALS_5Y: "fundamentals5y",
    HAS_FUNDAMENTALS_10Y: "fundamentals10y", HAS_TTM: "fundamentalsTtm",
    DISCOVER_ELIGIBLE: "discoverEligible", HAS_STOCK_PAGE: "stockPages"
  };

  function measuredCounts(rows) {
    var result = Object.fromEntries(EXPECTED.map(function (name) { return [name, 0]; }));
    Object.values(rows || {}).forEach(function (row) {
      EXPECTED.forEach(function (name, index) { if ((row[1] & Math.pow(2, index)) !== 0) result[name] += 1; });
    });
    return result;
  }

  function validate(payload) {
    var generatedAt = payload && Date.parse(payload.generatedAt);
    if (!payload || payload.version !== VERSION || payload.schemaVersion !== "1.0.0" ||
        payload.scope !== "CANONICAL_PRODUCT_UNIVERSE" ||
        JSON.stringify(payload.capabilities) !== JSON.stringify(EXPECTED) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(payload.generatedAt || "") || !Number.isFinite(generatedAt) || generatedAt > Date.now() ||
        !payload.source || payload.source.version !== "capability-matrix-1.0.0" || payload.source.generatedAt !== payload.generatedAt ||
        !payload.rows || !payload.counts || !payload.measuredCounts || Object.keys(payload.rows).length !== payload.counts.productUniverse) return false;
    var seen = new Set(), maxMask = Math.pow(2, EXPECTED.length) - 1;
    for (var entry of Object.entries(payload.rows)) {
      var ticker = entry[0], row = entry[1];
      if (!/^[A-Z0-9.-]{1,12}$/.test(ticker) || !Array.isArray(row) || row.length !== 2 ||
          !/^ref_[A-Z0-9._-]+$/.test(row[0] || "") || seen.has(row[0]) ||
          !Number.isSafeInteger(row[1]) || row[1] < 0 || row[1] > maxMask) return false;
      seen.add(row[0]);
    }
    var measured = measuredCounts(payload.rows);
    if (JSON.stringify(payload.measuredCounts) !== JSON.stringify(measured)) return false;
    for (var capability of Object.keys(COUNT_FIELDS)) if (payload.counts[COUNT_FIELDS[capability]] !== measured[capability]) return false;
    if (payload.counts.namesMissing !== payload.counts.productUniverse - measured.HAS_NAME) return false;
    return true;
  }
  function get(payload, ticker, masterMemberId) {
    if (!validate(payload)) return { status: "INVALID_ARTIFACT", capabilities: null };
    ticker = String(ticker || "").toUpperCase();
    var row = payload.rows[ticker];
    if (!row || row[0] !== masterMemberId || !Number.isSafeInteger(row[1]) || row[1] < 0) {
      return { status: "NOT_IN_PRODUCT_UNIVERSE", capabilities: null };
    }
    var values = {};
    EXPECTED.forEach(function (name, index) { values[name] = (row[1] & Math.pow(2, index)) !== 0; });
    return { status: "OK", capabilities: values, generatedAt: payload.generatedAt,
      sourceVersion: payload.source && payload.source.version };
  }
  var api = { VERSION: VERSION, CAPABILITIES: EXPECTED.slice(), COUNT_FIELDS: Object.assign({}, COUNT_FIELDS), measuredCounts: measuredCounts, validate: validate, get: get };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUProductCapabilities = api;
})(typeof window !== "undefined" ? window : globalThis);
