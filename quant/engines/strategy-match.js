/* =========================================================================
   VISION UNIVERSE QUANT 2.0 — STRATEGY MATCH v1

   The product question is "which investment style does this title fit
   right now, and what is missing". The answer is a counted set of
   conditions, not a verdict.

   THIS IS NOT A SECOND RULE ENGINE. Every condition is one filter of the
   canonical rule predicate (rule-contract.js), evaluated by the canonical
   query engine (query.js). The same profile therefore screens, identifies
   itself by a stable predicate hash, and could later carry a signal or a
   backtest without being restated anywhere.

   HARD BOUNDARIES, enforced rather than documented:

   - Only the quantV2.factorEvidence namespace. A profile that reaches
     into Quant V1 is rejected at load. Quant V1 stays LEGACY_IMMUTABLE,
     and one title must never carry two methodologies at once.
   - No ranking across titles. A match is a property of one title against
     one profile, never an ordering of the universe.
   - No historical evidence. "How would this profile have worked" is a
     backtest, and that gate is closed. The model says so in a field so
     that no surface can quietly imply otherwise.
   - A condition without a factor value is neither met nor violated. It
     leaves the denominator and is reported.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var Rules = isNode ? require("./rule-contract.js") : global.VURuleContract;
  var Query = isNode ? require("./query.js") : global.VUQuery;
  var Catalog = isNode ? require("./catalog.js") : global.VUCatalog;

  var METHODOLOGY_VERSION = "strategy-profiles-1.0.0";
  var CONDITION_STATES = ["MET", "NOT_MET", "NOT_MEASURABLE"];
  var PROFILE_STATES = ["AVAILABLE", "UNAVAILABLE"];
  var UNAVAILABLE_REASONS = ["INSUFFICIENT_MEASURABLE_WEIGHT", "INSUFFICIENT_MEASURABLE_CONDITIONS", "NO_EVIDENCE"];

  var UNIVERSE = { universeId: "US_EQUITIES", region: "US", assetType: "equity" };

  function finite(value) { return typeof value === "number" && Number.isFinite(value); }

  /* ---------------------------------------------------------------------
     Contract validation. A profile is refused, not repaired.
     --------------------------------------------------------------------- */
  function validateContract(contract) {
    var errors = [];
    if (!contract || typeof contract !== "object") return { valid: false, errors: ["contract must be an object"] };
    if (contract.methodologyVersion !== METHODOLOGY_VERSION) errors.push("unexpected methodologyVersion");
    if (!contract.publication || contract.publication.rankingAllowed !== false) errors.push("ranking must stay closed");
    if (!contract.publication || contract.publication.historicalEvidenceAllowed !== false) errors.push("historical evidence must stay closed");
    if (!Array.isArray(contract.allowedNamespaces) || !contract.allowedNamespaces.length) errors.push("allowedNamespaces missing");
    if (!Array.isArray(contract.profiles) || !contract.profiles.length) errors.push("no profiles");
    if (errors.length) return { valid: false, errors: errors };

    var allowed = contract.allowedNamespaces.slice();
    var seen = {};
    contract.profiles.forEach(function (profile) {
      var where = "profile '" + (profile && profile.profileId) + "'";
      if (!profile || typeof profile.profileId !== "string" || !profile.profileId) { errors.push("profile without id"); return; }
      if (seen[profile.profileId]) errors.push(where + ": duplicate id");
      seen[profile.profileId] = true;
      if (!Array.isArray(profile.conditions) || !profile.conditions.length) { errors.push(where + ": no conditions"); return; }
      var total = 0;
      profile.conditions.forEach(function (condition) {
        var fd = Catalog.field(condition.field);
        if (!fd) { errors.push(where + ": unknown field '" + condition.field + "'"); return; }
        /* The boundary that keeps two methodologies apart. */
        if (allowed.indexOf(fd.namespace) === -1) {
          errors.push(where + ": field '" + condition.field + "' belongs to namespace '" +
            String(fd.namespace) + "', which this contract does not allow");
        }
        if (!Catalog.operator(condition.operator)) errors.push(where + ": unknown operator '" + condition.operator + "'");
        if (!finite(condition.weight) || condition.weight <= 0) errors.push(where + ": condition weight must be positive");
        else total += condition.weight;
      });
      if (Math.abs(total - 1) > 1e-9) errors.push(where + ": condition weights must sum to 1, got " + total);
    });
    return { valid: errors.length === 0, errors: errors };
  }

  function assertContract(contract) {
    var result = validateContract(contract);
    if (!result.valid) throw new Error("Invalid strategy profile contract: " + result.errors.join("; "));
    return contract;
  }

  /* The canonical rule predicate of a whole profile: every condition as a
     filter, so the same object that explains a match can also screen. */
  function predicateOf(profile) {
    return Rules.create({
      universe: UNIVERSE,
      filters: profile.conditions.map(function (condition) {
        return { field: condition.field, operator: condition.operator, value: condition.value, scale: "raw" };
      })
    });
  }

  function conditionPredicate(condition) {
    return Rules.create({
      universe: UNIVERSE,
      filters: [{ field: condition.field, operator: condition.operator, value: condition.value, scale: "raw" }]
    });
  }

  function bandOf(contract, percentage) {
    if (!finite(percentage)) return null;
    var bands = contract.bands || [];
    for (var i = 0; i < bands.length; i += 1) if (percentage >= bands[i].min) return bands[i];
    return bands.length ? bands[bands.length - 1] : null;
  }

  /* ---------------------------------------------------------------------
     evaluate(contract, row) -> one title against every profile.

     `row` carries canonical catalog field ids, so it is the same row the
     screener filters on. No adapter, no second naming scheme.
     --------------------------------------------------------------------- */
  function evaluateProfile(contract, profile, row) {
    var minimumWeight = (contract.matching && contract.matching.minimumMeasurableWeight) || 0;
    var minimumConditions = (contract.matching && contract.matching.minimumMeasurableConditions) || 1;

    var conditions = profile.conditions.map(function (condition) {
      var value = Query.readValue(row, condition.field, "raw");
      var field = Catalog.field(condition.field);
      var measurable = value !== null && value !== undefined;
      var met = measurable && Rules.matches(row, conditionPredicate(condition));
      return {
        id: condition.id,
        field: condition.field,
        label: field ? field.label : condition.field,
        operator: condition.operator,
        threshold: condition.value,
        weight: condition.weight,
        rationale: condition.rationale || null,
        value: measurable ? value : null,
        state: measurable ? (met ? "MET" : "NOT_MET") : "NOT_MEASURABLE"
      };
    });

    var measurable = conditions.filter(function (c) { return c.state !== "NOT_MEASURABLE"; });
    var measurableWeight = measurable.reduce(function (sum, c) { return sum + c.weight; }, 0);
    var matchedWeight = conditions.filter(function (c) { return c.state === "MET"; })
      .reduce(function (sum, c) { return sum + c.weight; }, 0);

    var base = {
      profileId: profile.profileId,
      label: profile.label,
      plain: profile.plain || null,
      mainRisk: profile.mainRisk || null,
      conditions: conditions,
      measurableWeight: Math.round(measurableWeight * 1e6) / 1e6,
      measurableConditions: measurable.length,
      predicateHash: Rules.predicateHash(predicateOf(profile)),
      /* Stated in the model, not left to a caption: no surface may imply
         a historical result that this layer does not compute. */
      historicalEvidence: { state: "UNAVAILABLE", reason: "BACKTEST_NOT_CERTIFIED" }
    };

    if (!measurable.length) {
      return Object.assign(base, { state: "UNAVAILABLE", reason: "NO_EVIDENCE", match: null, band: null });
    }
    if (measurable.length < minimumConditions) {
      return Object.assign(base, { state: "UNAVAILABLE", reason: "INSUFFICIENT_MEASURABLE_CONDITIONS", match: null, band: null });
    }
    if (measurableWeight + 1e-9 < minimumWeight) {
      return Object.assign(base, { state: "UNAVAILABLE", reason: "INSUFFICIENT_MEASURABLE_WEIGHT", match: null, band: null });
    }

    var percentage = (matchedWeight / measurableWeight) * 100;
    var band = bandOf(contract, percentage);
    return Object.assign(base, {
      state: "AVAILABLE",
      reason: null,
      match: Math.round(percentage * 10) / 10,
      band: band ? band.id : null,
      bandLabel: band ? band.label : null
    });
  }

  function evaluate(contract, row) {
    assertContract(contract);
    if (!row || typeof row !== "object") {
      return { methodologyVersion: METHODOLOGY_VERSION, state: "UNAVAILABLE", reason: "NO_EVIDENCE", profiles: [] };
    }
    var profiles = contract.profiles.map(function (profile) { return evaluateProfile(contract, profile, row); });
    var available = profiles.filter(function (p) { return p.state === "AVAILABLE"; });
    return {
      methodologyVersion: METHODOLOGY_VERSION,
      evidenceNamespace: contract.evidenceNamespace,
      evidenceMethodologyVersion: contract.evidenceMethodologyVersion,
      state: available.length ? "AVAILABLE" : "UNAVAILABLE",
      reason: available.length ? null : "NO_EVIDENCE",
      /* Presentation order only, and said so: the caller may show the best
         fits first without that becoming a ranking of the universe. */
      profiles: profiles,
      bestFit: available.slice().sort(function (a, b) { return b.match - a.match; }).slice(0, 3)
        .map(function (p) { return p.profileId; }),
      ranking: { state: "WITHHELD", reason: "RANKING_NOT_PUBLISHED" },
      thresholdPolicy: contract.thresholdPolicy || null
    };
  }

  /* What is missing for a profile a title nearly fits. The product needs
     this as its own answer: "3 of 4, and the fourth is Bewertung". */
  function missingConditions(profileResult) {
    if (!profileResult) return [];
    return profileResult.conditions.filter(function (c) { return c.state !== "MET"; });
  }

  var api = {
    METHODOLOGY_VERSION: METHODOLOGY_VERSION,
    CONDITION_STATES: CONDITION_STATES.slice(),
    PROFILE_STATES: PROFILE_STATES.slice(),
    UNAVAILABLE_REASONS: UNAVAILABLE_REASONS.slice(),
    UNIVERSE: JSON.parse(JSON.stringify(UNIVERSE)),
    validateContract: validateContract,
    assertContract: assertContract,
    predicateOf: predicateOf,
    conditionPredicate: conditionPredicate,
    evaluate: evaluate,
    evaluateProfile: evaluateProfile,
    missingConditions: missingConditions
  };

  if (isNode) module.exports = api;
  else global.VUStrategyMatch = api;
})(typeof window !== "undefined" ? window : globalThis);
