(function (global) {
  "use strict";

  var FACTORS = ["quality", "growth", "momentum", "value", "profitability", "revisions", "risk"];
  var WEIGHTS = { quality: 0.10, growth: 0.15, momentum: 0.25, value: 0.15,
                  profitability: 0.15, revisions: 0.15, risk: 0.05 };
  var REQUIRED_FACTOR_FIELDS = ["components", "minimumDataRequirements", "sectorTreatment",
    "missingDataPolicy", "outlierHandling", "pitRequirements", "updateFrequency",
    "interpretation", "readiness"];

  function close(a, b) { return Math.abs(a - b) < 1e-9; }
  function validate(config) {
    var errors = [];
    if (!config || config.methodologyVersion !== "quant-v2.0.0" ||
        config.modelProfileId !== "quant-v2.0.0-full-7f") errors.push("VERSION");
    if (JSON.stringify(config && config.factorOrder) !== JSON.stringify(FACTORS)) errors.push("FACTOR_ORDER");
    var sum = 0, componentOwners = Object.create(null);
    FACTORS.forEach(function (id) {
      var f = config && config.factors && config.factors[id];
      var w = config && config.factorWeights && config.factorWeights[id];
      if (!close(w, WEIGHTS[id])) errors.push("FACTOR_WEIGHT:" + id);
      sum += Number(w) || 0;
      if (!f) { errors.push("FACTOR_MISSING:" + id); return; }
      REQUIRED_FACTOR_FIELDS.forEach(function (field) {
        if (f[field] === undefined || f[field] === null || f[field] === "") errors.push("POLICY_MISSING:" + id + ":" + field);
      });
      if (!Array.isArray(f.components) || f.components.length < 3) errors.push("COMPONENTS:" + id);
      var componentWeight = 0;
      (f.components || []).forEach(function (c) {
        componentWeight += Number(c.weight) || 0;
        ["id", "input", "window", "direction"].forEach(function (field) {
          if (c[field] === undefined || c[field] === null || c[field] === "") errors.push("COMPONENT_FIELD:" + id + ":" + field);
        });
        if (componentOwners[c.id]) errors.push("COMPONENT_REUSED:" + c.id);
        componentOwners[c.id] = id;
      });
      if (!close(componentWeight, 1)) errors.push("COMPONENT_WEIGHT_SUM:" + id);
    });
    if (!close(sum, 1)) errors.push("FACTOR_WEIGHT_SUM");
    if (!config || config.status !== "SPECIFIED_NOT_ACTIVE" || config.effectiveFrom !== null) errors.push("ACTIVATION_LOCK");
    if (!config || !config.publication || config.publication.allowed !== false ||
        config.publication.fullScoreRequiresEveryFactor !== true ||
        config.publication.missingFactorWeightRedistribution !== false) errors.push("PUBLICATION_LOCK");
    if (!config || !config.factors || !config.factors.revisions ||
        config.factors.revisions.readiness !== "BLOCKED_EXTERNAL") errors.push("REVISIONS_GATE");
    var binding = config && config.normalization && config.normalization.classificationBinding;
    if (!binding || binding.industry !== "sic4_industry" || binding.sector !== "sic_division" ||
        binding.universe !== "universe" || binding.scope !== "CURRENT_ONLY" ||
        binding.historicalPolicy !== "FAIL_CLOSED") errors.push("PEER_TAXONOMY_BINDING");
    return { ok: errors.length === 0, errors: errors };
  }

  var api = { FACTORS: FACTORS.slice(), WEIGHTS: Object.assign({}, WEIGHTS), validate: validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUQuantMethodologyContract = api;
})(typeof window !== "undefined" ? window : globalThis);
