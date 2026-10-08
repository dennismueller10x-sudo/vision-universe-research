/* =========================================================================
   VISION UNIVERSE QUANT 2.0 — PIT FUNDAMENTAL HISTORY v1

   What did the filings say about this company on a given historical date -
   not what they say about that year today.

   The consumer bundles carry, per metric, one row per fiscal year with the
   date it was FILED. That filing date is the only thing that decides
   visibility: a 2019 balance sheet filed in March 2020 was not knowable in
   January 2020, so a January 2020 observation does not read it. Reading by
   fiscal-year end instead would hand every historical observation a
   document that did not exist yet, and every pattern built on it would be
   a pattern built on the future.

   Restatements follow the same rule. What is visible at t is what had been
   filed by t; a later correction of the same fiscal year does not change
   what was known then, so it does not reach back into an earlier
   observation.

   VIEW CONTRACT (2.0.0, Migrationsblocker M-B5). The bundle's annual block
   is LATEST_RESTATED: one row per fiscal year, the newest version, dated by
   the filing that carried it. It cannot answer "what was known at t" - a
   restated year showed today's number or vanished until its restatement
   date (Piper Sandler FY2024: filed 2025-02-27, the latest row is dated
   2026-02-26). This module therefore reads ONLY the AS_REPORTED_AT_TIME document
   (quant/data/sec/consumer-pit/CIK*.json, block pit: every version with
   the day it became known) and
   every call must declare { view: "AS_REPORTED_AT_TIME" }. A bundle without
   that view, or a call without the declaration, is a hard failure - never a
   silent fallback to the latest values.

   This module reads. It does not normalize, does not derive a metric the
   SEC layer did not export, and does not substitute a value it cannot find.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "pit-fundamental-history-2.0.0";
  var VIEW = "AS_REPORTED_AT_TIME";

  /* The pit column layout: [fy, end, v, known, accn]. */
  var FY = 0, END = 1, VALUE = 2, FILED = 3;

  function contractError(message) {
    var error = new Error("PIT_CONTRACT: " + message);
    error.code = "PIT_CONTRACT";
    return error;
  }

  /* Hard contract: the caller declares the view it needs, and the bundle
     must carry it. LATEST_RESTATED is never accepted for a historical date. */
  function pitRows(bundle, metric, opts) {
    if (!opts || opts.view !== VIEW) {
      throw contractError("historical reads must declare view " + VIEW + " (got " + (opts && opts.view) + ")");
    }
    var pit = bundle && bundle.pit;
    if (!pit || pit.view !== VIEW || !pit.annual || typeof pit.annual !== "object") {
      throw contractError("bundle carries no " + VIEW + " view (LATEST_RESTATED only) - read quant/data/sec/consumer-pit (scripts/quant/cli.py consumer)");
    }
    var rows = pit.annual[metric];
    return Array.isArray(rows) ? rows : [];
  }

  function finite(value) { return typeof value === "number" && Number.isFinite(value); }
  function ratio(numerator, denominator) {
    if (!finite(numerator) || !finite(denominator) || denominator === 0) return null;
    return numerator / denominator;
  }

  /* Rows of one metric that had been filed by `asOf`, newest fiscal year
     first. A fiscal year that was restated keeps the newest filing that is
     still at or before asOf - the latest thing known then, not the latest
     thing known now. */
  function visibleAnnual(bundle, metric, asOf, opts) {
    var rows = pitRows(bundle, metric, opts);
    if (!rows.length) return [];
    var byYear = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var filed = row[FILED];
      if (typeof filed !== "string" || filed > asOf) continue;
      if (!finite(row[VALUE])) continue;
      var year = row[FY];
      var kept = byYear[year];
      if (!kept || filed > kept[FILED]) byYear[year] = row;
    }
    return Object.keys(byYear)
      .map(function (year) { return byYear[year]; })
      .sort(function (a, b) { return String(b[END]).localeCompare(String(a[END])); });
  }

  function latest(bundle, metric, asOf, opts) {
    var rows = visibleAnnual(bundle, metric, asOf, opts);
    return rows.length ? rows[0][VALUE] : null;
  }

  /* The visible row `years` fiscal years before the newest visible one.

     Selected BY FISCAL YEAR, never by position in the list. A company with
     a gap in its filed history - and they exist - would otherwise have
     rows[3] be four years back, and a three-year growth rate would quietly
     be a four-year one. The mismatch would never show up as an error,
     only as a slightly wrong number in every statistic downstream. */
  function pairYearsApart(bundle, metric, asOf, years, opts) {
    var rows = visibleAnnual(bundle, metric, asOf, opts);
    if (!rows.length) return null;
    var newest = rows[0];
    var wantedYear = Number(newest[FY]) - years;
    if (!Number.isFinite(wantedYear)) return null;
    for (var i = 1; i < rows.length; i++) {
      if (Number(rows[i][FY]) === wantedYear) return { newest: newest[VALUE], oldest: rows[i][VALUE] };
    }
    return null;
  }

  /* Annualised growth over `years` fiscal years. Both ends must be
     positive: a CAGR out of a negative base is a number without a meaning,
     and it is left empty rather than signed. */
  function cagr(bundle, metric, asOf, years, opts) {
    var pair = pairYearsApart(bundle, metric, asOf, years, opts);
    if (!pair || !(pair.newest > 0) || !(pair.oldest > 0)) return null;
    return Math.pow(pair.newest / pair.oldest, 1 / years) - 1;
  }

  function yoy(bundle, metric, asOf, opts) {
    var pair = pairYearsApart(bundle, metric, asOf, 1, opts);
    if (!pair || !(pair.oldest > 0)) return null;
    return pair.newest / pair.oldest - 1;
  }

  function changeOver(bundle, metric, asOf, years, opts) {
    var pair = pairYearsApart(bundle, metric, asOf, years, opts);
    if (!pair || !(pair.oldest > 0)) return null;
    return pair.newest / pair.oldest - 1;
  }

  /* The ten pre-registered fundamental features, as of a date. Every one is
     null when its inputs were not visible; nothing is filled in. */
  function featuresAt(bundle, asOf, opts) {
    if (!bundle || typeof asOf !== "string") return null;
    pitRows(bundle, "revenue", opts);       /* contract check before anything is read */
    var o = opts;
    var revenue = latest(bundle, "revenue", asOf, o);
    var visibleYears = visibleAnnual(bundle, "revenue", asOf, o).length;
    if (!visibleYears) return null;

    var netIncome = latest(bundle, "net_income", asOf, o);
    var grossProfit = latest(bundle, "gross_profit", asOf, o);
    var freeCashFlow = latest(bundle, "free_cash_flow", asOf, o);
    var capex = latest(bundle, "capital_expenditures", asOf, o);
    var assets = latest(bundle, "total_assets", asOf, o);
    var equity = latest(bundle, "stockholders_equity", asOf, o);
    var cash = latest(bundle, "cash_and_equivalents", asOf, o);

    return {
      revenueCagr3y: cagr(bundle, "revenue", asOf, 3, o),
      revenueGrowthYoy: yoy(bundle, "revenue", asOf, o),
      grossMargin: revenue > 0 ? ratio(grossProfit, revenue) : null,
      fcfMargin: revenue > 0 ? ratio(freeCashFlow, revenue) : null,
      netMargin: revenue > 0 ? ratio(netIncome, revenue) : null,
      equityToAssets: assets > 0 ? ratio(equity, assets) : null,
      profitableLastYear: finite(netIncome) ? netIncome > 0 : null,
      shareCountChange3y: changeOver(bundle, "shares_outstanding", asOf, 3, o),
      /* Capex is exported as a negative cash outflow; intensity is its
         magnitude against revenue, so the sign is taken out here rather
         than left to every reader to remember. */
      capexIntensity: revenue > 0 && finite(capex) ? Math.abs(capex) / revenue : null,
      cashToAssets: assets > 0 ? ratio(cash, assets) : null,
      visibleFiscalYears: visibleYears
    };
  }

  /* The earliest date at which this issuer had anything filed at all. Used
     to report the coverage window rather than to gate a single observation:
     an observation with no visible filing simply has null features. */
  function firstFiled(bundle, opts) {
    pitRows(bundle, "revenue", opts);
    var earliest = null;
    var annual = bundle.pit.annual;
    for (var metric in annual) {
      var rows = annual[metric];
      if (!Array.isArray(rows)) continue;
      for (var i = 0; i < rows.length; i++) {
        var filed = rows[i][FILED];
        if (typeof filed !== "string") continue;
        if (earliest === null || filed < earliest) earliest = filed;
      }
    }
    return earliest;
  }

  /* Loader helper: keep only the AS_REPORTED_AT_TIME rows of the metrics a
     consumer reads. A bundle without that view is a hard failure here, at
     load time, not an empty feature set later. */
  function pitSlice(payload, metrics) {
    var pit = payload && payload.pit;
    if (!pit || pit.view !== VIEW || !pit.annual) {
      throw contractError("bundle " + (payload && payload.cik) + " carries no " + VIEW + " view (LATEST_RESTATED only)");
    }
    var annual = {};
    for (var i = 0; i < metrics.length; i++) {
      if (Array.isArray(pit.annual[metrics[i]])) annual[metrics[i]] = pit.annual[metrics[i]];
    }
    return { cik: payload.cik, asOf: payload.asOf, pit: { view: VIEW, annual: annual } };
  }

  var api = {
    VERSION: VERSION,
    pitSlice: pitSlice,
    VIEW: VIEW,
    visibleAnnual: visibleAnnual,
    latest: latest,
    pairYearsApart: pairYearsApart,
    cagr: cagr,
    yoy: yoy,
    changeOver: changeOver,
    featuresAt: featuresAt,
    firstFiled: firstFiled
  };

  if (isNode) module.exports = api;
  else global.VUPitFundamentalHistory = api;
})(typeof window !== "undefined" ? window : globalThis);
