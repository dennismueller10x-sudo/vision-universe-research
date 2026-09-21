/* =========================================================================
   VISION UNIVERSE TECHNICAL — scanner.js
   TECHNICAL UNIVERSE SCANNER

   Dieselben Engines ueber ein Universum. Liefert kompakte Summaries
   (kein Bundle je Titel), einen Cross-Sectional-Perzentilrang des
   Opportunity Score und der Relativen Staerke, und einen Filter-DSL fuer
   Screener-Integration ("technicalScore > 80 AND RR > 3 AND trend bullish").

   Precompute-freundlich: scanUniverse() ist reine Funktion ueber
   {instrumentId → CanonicalBarSeries}; Storage bleibt aussen.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var Rules = isNode ? require("../rule-contract.js") : global.VURuleContract;
  var Analysis = isNode ? require("./technical-analysis.js") : global.VUTechnical.Analysis;

  var SCANNER_VERSION = "scanner-1.0.0";

  function percentileRanks(values) {
    var idx = values.map(function (v, i) { return { v: v, i: i }; }).filter(function (x) { return Number.isFinite(x.v); }).sort(function (a, b) { return a.v - b.v; });
    var out = new Array(values.length).fill(null);
    idx.forEach(function (x, r) { out[x.i] = Math.round(100 * (r + 0.5) / idx.length * 10) / 10; });
    return out;
  }

  /**
   * @param {object} input {
   *   universe: [{ instrumentId, series, sectorSeries?, meta? }], benchmarkSeries, methodology, options,
   *   universeId, universeVersion
   * }
   */
  function scanUniverse(input) {
    if (!input || typeof input.universeId !== "string" || !input.universeId || typeof input.universeVersion !== "string" || !input.universeVersion) {
      throw new Error("Technical scanner requires universeId and universeVersion");
    }
    var rows = [], errors = [];
    var opts = Object.assign({ annotations: false, elliott: false, includeChartSeries: false }, input.options || {});
    input.universe.forEach(function (u) {
      try {
        var b = Analysis.analyze({ series: u.series, benchmarkSeries: input.benchmarkSeries || null, sectorSeries: u.sectorSeries || null, methodology: input.methodology, options: opts });
        var s = Analysis.summarize(b);
        s.meta = u.meta || null;
        s.rsComposite = b.relativeStrength.vsBenchmark && b.relativeStrength.vsBenchmark.composite !== undefined ? b.relativeStrength.vsBenchmark.composite : null;
        s.momentum12M = b.momentum.horizons["12M"] ? b.momentum.horizons["12M"].return : null;
        s.distanceTo52wHigh = b.trend.metrics.distanceTo52wHigh;
        s.atrPct = b.volatility.metrics.atrPct;
        s.averageVolume = b.volume.metrics ? b.volume.metrics.averageVolume : null;
        s.entryStatus = b.scenarios.primary ? b.scenarios.primary.entryStatus : null;
        s.contributions = b.opportunityScore.contributions;
        rows.push(s);
      } catch (e) { errors.push({ instrumentId: u.instrumentId, error: e.message }); }
    });
    var scorePct = percentileRanks(rows.map(function (r) { return r.opportunityScore; }));
    var rsPct = percentileRanks(rows.map(function (r) { return r.rsComposite; }));
    rows.forEach(function (r, i) { r.scorePercentile = scorePct[i]; r.rsPercentile = rsPct[i]; r.universeId = input.universeId || null; });
    rows.sort(function (a, b) { return (b.opportunityScore || 0) - (a.opportunityScore || 0); });
    return { scannerVersion: SCANNER_VERSION, universeId: input.universeId || null, universeVersion: input.universeVersion || null,
             asOf: rows.length ? rows.map(function (r) { return r.analysisTime; }).sort().pop() : null, count: rows.length, errors: errors,
             methodologyVersion: input.methodology && input.methodology.technical ? input.methodology.technical.methodologyVersion : null,
             scanHash: Hash.hashValue(rows.map(function (r) { return [r.instrumentId, r.opportunityScore, r.parametersHash]; })), rows: rows };
  }

  /* Filter: strukturierte Bedingungen (kein freier Ausdruck). */
  var FIELDS = { technicalScore: "opportunityScore", scorePercentile: "scorePercentile", riskReward: "riskReward", trend: "trend", structure: "structure", momentum: "momentum",
                 relativeStrength: "relativeStrength", rsPercentile: "rsPercentile", confidence: "confidence", setupStatus: "setupStatus", entryStatus: "entryStatus",
                 primaryDirection: "primaryDirection", elliottStatus: "elliott", volatilityRegime: "volatilityRegime", volume: "volume", distanceTo52wHigh: "distanceTo52wHigh", momentum12M: "momentum12M" };
  /* Legacy names/operators are accepted only at the boundary and translated
     into the Canonical Rule Contract. There is deliberately no second
     evaluator in this module. */
  var CANONICAL_OPS = { ">": "gt", ">=": "gte", "<": "lt", "<=": "lte", "==": "eq", "!=": "ne", "in": "in" };
  var CANONICAL_FIELDS = {
    technicalOpportunityScore: function (r) { return Number.isFinite(r.opportunityScore) ? r.opportunityScore : null; },
    technicalOpportunityPercentile: function (r) { return Number.isFinite(r.scorePercentile) ? r.scorePercentile : null; },
    technicalRiskReward: function (r) { return Number.isFinite(r.riskReward) ? r.riskReward : null; },
    technicalTrend: function (r) { return typeof r.trend === "string" ? r.trend : null; },
    technicalStructure: function (r) { return typeof r.structure === "string" ? r.structure : null; },
    technicalMomentumState: function (r) { return typeof r.momentum === "string" ? r.momentum : null; },
    technicalRelativeStrengthState: function (r) { return typeof r.relativeStrength === "string" ? r.relativeStrength : null; },
    technicalRelativeStrengthPercentile: function (r) { return Number.isFinite(r.rsPercentile) ? r.rsPercentile : null; },
    technicalScenarioConfidence: function (r) { return Number.isFinite(r.confidence) ? r.confidence : null; },
    technicalSetupStatus: function (r) { return typeof r.setupStatus === "string" ? r.setupStatus : null; },
    technicalEntryStatus: function (r) { return typeof r.entryStatus === "string" ? r.entryStatus : null; },
    technicalPrimaryDirection: function (r) { return typeof r.primaryDirection === "string" ? r.primaryDirection : null; },
    technicalVolatilityRegime: function (r) { return typeof r.volatilityRegime === "string" ? r.volatilityRegime : null; },
    technicalVolumeState: function (r) { return typeof r.volume === "string" ? r.volume : null; },
    technicalDistanceTo52wHigh: function (r) { return Number.isFinite(r.distanceTo52wHigh) ? r.distanceTo52wHigh : null; },
    technicalMomentum12MReturn: function (r) { return Number.isFinite(r.momentum12M) ? r.momentum12M : null; },
    elliottCountStatus: function (r) { return r.elliott && typeof r.elliott.status === "string" ? r.elliott.status : null; }
  };
  var LEGACY_CANONICAL_FIELDS = {
    technicalScore: "technicalOpportunityScore", scorePercentile: "technicalOpportunityPercentile", riskReward: "technicalRiskReward",
    trend: "technicalTrend", structure: "technicalStructure", momentum: "technicalMomentumState", relativeStrength: "technicalRelativeStrengthState",
    rsPercentile: "technicalRelativeStrengthPercentile", confidence: "technicalScenarioConfidence", setupStatus: "technicalSetupStatus",
    entryStatus: "technicalEntryStatus", primaryDirection: "technicalPrimaryDirection", elliottStatus: "elliottCountStatus",
    volatilityRegime: "technicalVolatilityRegime", volume: "technicalVolumeState", distanceTo52wHigh: "technicalDistanceTo52wHigh",
    momentum12M: "technicalMomentum12MReturn"
  };

  function validateFilter(filters) {
    var errors = [];
    (filters || []).forEach(function (f, i) {
      if (!FIELDS[f.field]) errors.push("Filter " + i + ": unbekanntes Feld '" + f.field + "'");
      if (!CANONICAL_OPS[f.op]) errors.push("Filter " + i + ": unbekannter Operator '" + f.op + "'");
      if (f.value === undefined) errors.push("Filter " + i + ": Wert fehlt");
    });
    return { valid: errors.length === 0, errors: errors };
  }

  function canonicalRow(row) {
    var out = Object.assign({}, row);
    Object.keys(CANONICAL_FIELDS).forEach(function (field) { out[field] = CANONICAL_FIELDS[field](row); });
    return out;
  }

  function assertCanonicalPredicate(predicate) {
    if (!Rules) throw new Error("Canonical Rule Contract ist nicht geladen");
    var validation = Rules.validate(predicate);
    if (!validation.valid) throw new Error("Invalid rule predicate: " + validation.errors.join("; "));
    predicate.filters.forEach(function (filter) {
      if (!CANONICAL_FIELDS[filter.field]) throw new Error("Technical scanner: nicht gemapptes kanonisches Feld '" + filter.field + "'");
      if (filter.scale !== "raw") throw new Error("Technical scanner: nur raw-Skala fuer '" + filter.field + "'");
    });
    return predicate;
  }

  function applyPredicate(scan, predicate, limit) {
    assertCanonicalPredicate(predicate);
    if (!scan || typeof scan.universeId !== "string" || !scan.universeId || typeof scan.universeVersion !== "string" || !scan.universeVersion ||
        predicate.universe.constituentSetId !== scan.universeId || predicate.universe.constituentSetVersion !== scan.universeVersion) {
      throw new Error("Technical scanner: Rule-Universum stimmt nicht mit dem Scan ueberein");
    }
    var rows = scan.rows.filter(function (row) { return Rules.matches(canonicalRow(row), predicate); });
    return { count: rows.length, total: scan.rows.length, predicate: predicate, predicateHash: Rules.predicateHash(predicate), rows: limit ? rows.slice(0, limit) : rows };
  }

  function predicateFromFilters(filters, scan) {
    if (!Rules) throw new Error("Canonical Rule Contract ist nicht geladen");
    if (!scan || typeof scan.universeId !== "string" || !scan.universeId || typeof scan.universeVersion !== "string" || !scan.universeVersion) {
      throw new Error("Technical scanner: kanonischer Universumskontext fehlt");
    }
    var validation = validateFilter(filters);
    if (!validation.valid) throw new Error(validation.errors.join("; "));
    var canonical = (filters || []).map(function (filter) {
      var field = LEGACY_CANONICAL_FIELDS[filter.field];
      if (!field) throw new Error("Legacy-Filter '" + filter.field + "' hat kein kanonisches Technical-Mapping");
      return { field: field, operator: CANONICAL_OPS[filter.op], value: filter.value, scale: "raw" };
    });
    var predicate = Rules.create({ universe: { universeId: "US_EQUITIES", region: "US", assetType: "equity", constituentSetId: scan.universeId, constituentSetVersion: scan.universeVersion }, filters: canonical });
    var ruleValidation = Rules.validate(predicate);
    if (!ruleValidation.valid) throw new Error("Legacy-Filter ist nicht kanonisch abbildbar: " + ruleValidation.errors.join("; "));
    return predicate;
  }

  function applyFilters(scan, filters, limit) {
    var v = validateFilter(filters);
    if (!v.valid) throw new Error(v.errors.join("; "));
    var predicate = predicateFromFilters(filters || [], scan);
    var canonicalResult = applyPredicate(scan, predicate, limit);
    return { count: canonicalResult.count, total: canonicalResult.total, filters: filters || [], predicateHash: canonicalResult.predicateHash, rows: canonicalResult.rows };
  }

  var api = { SCANNER_VERSION: SCANNER_VERSION, FIELDS: FIELDS, OPS: Object.keys(CANONICAL_OPS), CANONICAL_FIELDS: Object.keys(CANONICAL_FIELDS), LEGACY_CANONICAL_FIELDS: Object.assign({}, LEGACY_CANONICAL_FIELDS), percentileRanks: percentileRanks, scanUniverse: scanUniverse, validateFilter: validateFilter, canonicalRow: canonicalRow, predicateFromFilters: predicateFromFilters, applyPredicate: applyPredicate, applyFilters: applyFilters };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Scanner = api; }
})(typeof window !== "undefined" ? window : globalThis);
