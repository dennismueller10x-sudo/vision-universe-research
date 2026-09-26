(function (global) {
  "use strict";

  var FACTORS = ["quality", "growth", "momentum", "value", "profitability", "revisions", "risk"];
  var WEIGHTS = { quality: 0.10, growth: 0.15, momentum: 0.25, value: 0.15,
                  profitability: 0.15, revisions: 0.15, risk: 0.05 };
  /* Die drei Kohorten, fuer die die generische Formel NOT_APPLICABLE ist
     und deshalb eine eigene Vorlage tragen muss, und die Faktoren, die eine
     Vorlage ersetzt. Wachstum steht nicht darin: es ist vom Branchentor
     ausgenommen und bleibt generisch. */
  var TEMPLATES = ["BALANCE_SHEET_FINANCIAL", "INSURANCE_CARRIER", "REAL_ESTATE_TRUST"];
  var TEMPLATE_FACTORS = ["quality", "value", "profitability"];
  var REQUIRED_FACTOR_FIELDS = ["components", "minimumDataRequirements", "sectorTreatment",
    "missingDataPolicy", "outlierHandling", "pitRequirements", "updateFrequency",
    "interpretation", "readiness"];

  function close(a, b) { return Math.abs(a - b) < 1e-9; }
  function validate(config) {
    var errors = [];
    /* Die Version ist gepinnt, damit keine stille Aenderung durchgeht.
       Seit 2026-09-24 traegt die Momentummethodik die Basis
       SPLIT_ADJUSTED_PRICE (Owner-Entscheidung, Option C); die alte
       Bedeutung laeuft unter quant-v2.0.0 weiter und nicht hier. Seit
       2026-09-26 fuehrt der Vertrag eigene Branchenvorlagen fuer Banken,
       Versicherungstraeger und REITs - quant-v2.2.0. */
    if (!config || config.methodologyVersion !== "quant-v2.2.0" ||
        config.modelProfileId !== "quant-v2.2.0-full-7f") errors.push("VERSION");
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

    /* Die Branchenvorlagen tragen dieselbe Beweislast wie die generischen
       Formeln: eigene Fassung, drei Komponenten aufwaerts, Gewichte auf
       eins, jede Komponente mit Formelzeile und Fenster, und eine
       Pflichtkomponente. Ohne diese Pruefung waere eine Vorlage der
       bequemste Ort fuer eine stille Absenkung: sie oeffnet einen Faktor
       dort, wo vorher nichts stand, und niemand vermisst einen Wert, den es
       nie gab. */
    TEMPLATES.forEach(function (templateId) {
      var template = config && config.industryTemplates && config.industryTemplates[templateId];
      if (!template) { errors.push("TEMPLATE_MISSING:" + templateId); return; }
      if (typeof template.version !== "string" || template.version.indexOf("quant-v2-") !== 0) {
        errors.push("TEMPLATE_VERSION:" + templateId);
      }
      if (!template.appliesTo) errors.push("TEMPLATE_SCOPE:" + templateId);
      TEMPLATE_FACTORS.forEach(function (factorId) {
        var factor = template.factors && template.factors[factorId];
        if (!factor) { errors.push("TEMPLATE_FACTOR_MISSING:" + templateId + ":" + factorId); return; }
        if (!Array.isArray(factor.components) || factor.components.length < 3) {
          errors.push("TEMPLATE_COMPONENTS:" + templateId + ":" + factorId);
        }
        if (!Array.isArray(factor.mandatory) || !factor.mandatory.length) {
          errors.push("TEMPLATE_MANDATORY:" + templateId + ":" + factorId);
        }
        var requirements = factor.minimumDataRequirements || {};
        if (requirements.minimumComponents < 3 || requirements.minimumOriginalWeight < 0.6) {
          errors.push("TEMPLATE_MINIMUM:" + templateId + ":" + factorId);
        }
        var weight = 0, owned = Object.create(null);
        (factor.components || []).forEach(function (component) {
          weight += Number(component.weight) || 0;
          ["id", "input", "window"].forEach(function (field) {
            if (component[field] === undefined || component[field] === null || component[field] === "") {
              errors.push("TEMPLATE_COMPONENT_FIELD:" + templateId + ":" + factorId + ":" + field);
            }
          });
          if (owned[component.id]) errors.push("TEMPLATE_COMPONENT_REUSED:" + templateId + ":" + factorId + ":" + component.id);
          owned[component.id] = true;
        });
        if (!close(weight, 1)) errors.push("TEMPLATE_COMPONENT_WEIGHT_SUM:" + templateId + ":" + factorId);
      });
    });
    return { ok: errors.length === 0, errors: errors };
  }

  var api = { FACTORS: FACTORS.slice(), WEIGHTS: Object.assign({}, WEIGHTS),
    TEMPLATES: TEMPLATES.slice(), TEMPLATE_FACTORS: TEMPLATE_FACTORS.slice(), validate: validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUQuantMethodologyContract = api;
})(typeof window !== "undefined" ? window : globalThis);
