(function (global) {
  "use strict";

  var VERSION = "ranking-hygiene-2.0.0";
  var BLOCKED_QUALITY = ["FAIL", "UNAVAILABLE"];
  var BOUNDS = {
    "returns.1M": 5,
    "returns.3M": 8,
    "returns.6M": 10,
    "returns.12M": 10,
    "return12M1M": 10,
    "relativeStrength.1M": 5,
    "relativeStrength.3M": 8,
    "relativeStrength.6M": 10,
    "relativeStrength.12M": 10,
    "momentumAcceleration": 10,
    "volatility20d": 5,
    "volatility60d": 5,
    "volatility252d": 5,
    "maxDrawdown252d": 1.01
  };

  function valueAt(values, path) {
    return String(path).split(".").reduce(function (v, key) {
      return v === null || v === undefined ? undefined : v[key];
    }, values);
  }

  function inspectRow(row) {
    var issues = [];
    if (BLOCKED_QUALITY.indexOf(row && row.dataQuality) >= 0) {
      issues.push({ metric: "dataQuality", reason: "DATA_QUALITY_" + row.dataQuality,
        value: row.dataQuality, bound: null });
    }
    Object.keys(BOUNDS).forEach(function (metric) {
      var value = valueAt(row && row.values, metric);
      if (Number.isFinite(value) && Math.abs(value) > BOUNDS[metric]) {
        issues.push({ metric: metric, reason: "IMPLAUSIBLE_VALUE", value: value,
          bound: BOUNDS[metric] });
      }
    });
    return issues;
  }

  function rankRows(rows, options) {
    options = options || {};
    var clean = [], quarantined = [], notEvaluable = [];
    (rows || []).forEach(function (row) {
      var value = options.pick ? options.pick(row.values) : valueAt(row.values, options.metric);
      if (!Number.isFinite(value)) {
        notEvaluable.push(row.ticker);
        return;
      }
      var entry = { ticker: row.ticker, value: value };
      var issues = inspectRow(row);
      if (issues.length) quarantined.push(Object.assign({}, entry, { reasons: issues }));
      else clean.push(entry);
    });
    clean.sort(function (a, b) {
      return options.direction === "asc" ? a.value - b.value : b.value - a.value;
    });
    return {
      top: clean.slice(0, options.limit || 50),
      evaluated: clean.length,
      quarantined: quarantined,
      quarantinedCount: quarantined.length,
      notEvaluable: notEvaluable,
      hygieneVersion: VERSION,
      policy: "Quarantine is applied to every full-universe row before sorting and top-K; raw factor rows remain unchanged."
    };
  }

  var api = { VERSION: VERSION, BOUNDS: BOUNDS, BLOCKED_QUALITY: BLOCKED_QUALITY,
    valueAt: valueAt, inspectRow: inspectRow, rankRows: rankRows };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VURankingHygiene = api;
})(typeof window !== "undefined" ? window : globalThis);
