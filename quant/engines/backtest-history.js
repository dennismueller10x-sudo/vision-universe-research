/* =========================================================================
   QUANT BACKTEST HISTORY ELIGIBILITY

   Resolves a requested chart/backtest window from the dated observations
   actually supplied by its required dependencies. A range label is never a
   claim that every required source covers that range.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var DAY = 86400000;
  var PERIODS = {
    "1Y": { kind: "CALENDAR_DAYS", days: 366 },
    "3Y": { kind: "CALENDAR_DAYS", days: 1096 },
    "5Y": { kind: "CALENDAR_DAYS", days: 1827 },
    "10Y": { kind: "CALENDAR_DAYS", days: 3653 },
    "MAX": { kind: "ALL_ELIGIBLE_HISTORY", days: null }
  };

  function isoDate(v) {
    var s = typeof v === "string" ? v.slice(0, 10) : "";
    var t = Date.parse(s + "T00:00:00Z");
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : null;
  }

  function validateDates(dates) {
    if (!Array.isArray(dates) || !dates.length) return { ok: false, reason: "NO_DATED_OBSERVATIONS", dates: [] };
    var out = [];
    for (var i = 0; i < dates.length; i++) {
      var date = isoDate(dates[i]);
      if (!date) return { ok: false, reason: "INVALID_OBSERVATION_DATE", dates: [] };
      if (i && date <= out[i - 1]) return { ok: false, reason: "OBSERVATIONS_NOT_STRICTLY_ORDERED", dates: [] };
      out.push(date);
    }
    return { ok: true, reason: null, dates: out };
  }

  function resolve(dependencies, options) {
    options = options || {};
    var deps = Array.isArray(dependencies) ? dependencies : [];
    var errors = [], rows = [];
    var earliestAvailable = null, earliestEligible = null, latestEligible = null;
    var coverageStatus = "PASS";
    var asOf = options.asOf ? isoDate(options.asOf) : null;
    if (!deps.length) errors.push("NO_REQUIRED_DEPENDENCIES");
    if (options.asOf && !asOf) errors.push("INVALID_AS_OF");

    deps.forEach(function (dep) {
      dep = dep || {};
      var id = String(dep.id || "UNNAMED_DEPENDENCY");
      var required = dep.required !== false;
      var data = validateDates(dep.dates);
      var warmupBars = Number.isInteger(dep.warmupBars) && dep.warmupBars >= 0 ? dep.warmupBars : 0;
      var trailingBars = Number.isInteger(dep.trailingBars) && dep.trailingBars >= 0 ? dep.trailingBars : 0;
      var reasons = [];
      if (!data.ok) reasons.push(data.reason);
      if (dep.status && dep.status !== "AVAILABLE" && dep.status !== "PASS") reasons.push(String(dep.status));
      if (data.ok && data.dates.length <= warmupBars + trailingBars) reasons.push("INSUFFICIENT_BARS_FOR_WARMUP_AND_OUTCOME");

      var start = null, end = null;
      if (!reasons.length) {
        start = data.dates[warmupBars];
        // Future observations cannot satisfy an outcome/entry lag at asOf.
        // Resolve the last known observation FIRST, then reserve trailing bars.
        var knownIndex = data.dates.length - 1;
        if (asOf) {
          var lo = 0, hi = knownIndex, best = -1;
          while (lo <= hi) {
            var mid = (lo + hi) >> 1;
            if (data.dates[mid] <= asOf) { best = mid; lo = mid + 1; } else hi = mid - 1;
          }
          knownIndex = best;
        }
        var endIndex = knownIndex - trailingBars;
        end = endIndex >= warmupBars ? data.dates[endIndex] : null;
        if (!end) reasons.push("NO_ELIGIBLE_OBSERVATION_AT_OR_BEFORE_AS_OF");
      }
      if (reasons.length && required) errors.push(id + ":" + reasons.join(","));
      if (dep.coverageStatus && dep.coverageStatus !== "PASS") coverageStatus = "LIMITED";
      if (required && data.ok && data.dates.length) {
        if (!earliestAvailable || data.dates[0] < earliestAvailable) earliestAvailable = data.dates[0];
        if (!reasons.length) {
          if (!earliestEligible || start > earliestEligible) earliestEligible = start;
          if (!latestEligible || end < latestEligible) latestEligible = end;
        }
      }
      rows.push({ id: id, required: required, earliestAvailableDataDate: data.ok ? data.dates[0] : null,
        latestAvailableDataDate: data.ok ? data.dates[data.dates.length - 1] : null,
        earliestEligibleDate: start, latestEligibleDate: end,
        warmupBars: warmupBars, trailingBars: trailingBars,
        status: reasons.length ? "BLOCKED" : (dep.coverageStatus === "PASS" || !dep.coverageStatus ? "AVAILABLE" : "LIMITED"),
        exclusionReasons: reasons, source: dep.source || null });
    });

    var blocking = errors.length > 0 || !earliestEligible || !latestEligible || earliestEligible > latestEligible;
    if (blocking) coverageStatus = "BLOCKED";
    var limiting = rows.filter(function (r) {
      return r.required && (r.earliestEligibleDate === earliestEligible || r.latestEligibleDate === latestEligible || r.status === "BLOCKED");
    }).map(function (r) { return r.id; });
    if (blocking && !errors.length) errors.push("DEPENDENCY_WINDOWS_DO_NOT_OVERLAP");

    return {
      schemaVersion: "backtest-history-eligibility-1.0.0",
      state: blocking ? "BLOCKED" : "AVAILABLE",
      earliestAvailableDataDate: earliestAvailable,
      earliestEligibleBacktestDate: blocking ? null : earliestEligible,
      latestEligibleBacktestDate: blocking ? null : latestEligible,
      warmupRequirement: rows.filter(function (r) { return r.required; }).map(function (r) { return { dependency: r.id, bars: r.warmupBars }; }),
      limitingDataDependencies: limiting,
      coverageStatus: coverageStatus,
      dependencies: rows,
      exclusionReasons: errors
    };
  }

  function windowFor(period, eligibility, endDate) {
    var spec = PERIODS[period];
    if (!spec) throw new Error("UNKNOWN_HISTORY_PERIOD:" + period);
    if (!eligibility || eligibility.state !== "AVAILABLE") return { state: "BLOCKED", period: period, startDate: null, endDate: null, reason: "HISTORY_NOT_ELIGIBLE" };
    var end = isoDate(endDate || eligibility.latestEligibleBacktestDate);
    if (!end || end > eligibility.latestEligibleBacktestDate) end = eligibility.latestEligibleBacktestDate;
    if (end < eligibility.earliestEligibleBacktestDate) return { state: "BLOCKED", period: period, startDate: null, endDate: end, reason: "NO_ELIGIBLE_DATA_IN_PERIOD" };
    var start = eligibility.earliestEligibleBacktestDate;
    var complete = true;
    if (spec.days !== null) {
      var target = new Date(end + "T00:00:00Z");
      target.setTime(target.getTime() - spec.days * DAY);
      var requestedStart = target.toISOString().slice(0, 10);
      if (requestedStart > start) start = requestedStart;
      else complete = false;
    }
    return { state: "AVAILABLE", period: period, requestedWindowDays: spec.days,
      startDate: start, endDate: end,
      complete: complete };
  }

  var api = { VERSION: "backtest-history-eligibility-1.0.0", PERIODS: PERIODS, resolve: resolve, windowFor: windowFor };
  if (isNode) module.exports = api; else global.VUBacktestHistory = api;
})(typeof window !== "undefined" ? window : globalThis);
