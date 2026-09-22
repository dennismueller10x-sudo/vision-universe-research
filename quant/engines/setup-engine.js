/* =========================================================================
   VISION UNIVERSE QUANT 2.0 — SETUP ENGINE v1

   The product question is "is a situation forming here right now, and
   where does this title stand in it". The answer is one of eight
   canonical states, reached by a written, versioned, ordered cascade.

   THIS IS NOT A SECOND RULE ENGINE and not a second technical analysis.
   Every point-in-time rule is one canonical rule predicate over catalog
   fields (rule-contract.js, evaluated by query.js), so the same rule that
   assigns a state also screens the universe for it. Every input already
   exists in the materialized technical artifact; nothing is recomputed
   from bars here.

   TWO TIERS, kept apart on purpose:

   - POINT_IN_TIME (NO_SETUP, WATCH, SETUP_FORMING, CONFIRMED) is
     decidable from one cutoff. It is a classification of today's
     evidence and is published as exactly that.
   - PATH_DEPENDENT (ACTIVE, RISK_RISING, INVALIDATED, EXIT) is a
     statement about a course of events. "Became invalid" needs a state
     that was actually observed and published earlier. Without an ordered
     observation history these four stay closed; they are never
     reconstructed from today's data, because a reconstruction would be
     hindsight wearing a lifecycle's clothes.

   The lifecycle is therefore only AVAILABLE when the mapping is
   approved, the observation history carries the required ordered
   observations and the inputs are complete. A classification alone is
   never presented as a lifecycle state.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var Rules = isNode ? require("./rule-contract.js") : global.VURuleContract;
  var Query = isNode ? require("./query.js") : global.VUQuery;
  var Catalog = isNode ? require("./catalog.js") : global.VUCatalog;

  var ENGINE_VERSION = "vu-setup-1.0.0";
  var OBSERVATION_SCHEMA = "setup-observation-1.0.0";
  var OBSERVATION_INDEX_SCHEMA = "setup-observation-index-1.0.0";
  var SHARD_SCHEMA = "setup-observation-product-1.0.0";

  var STATES = ["NO_SETUP", "WATCH", "SETUP_FORMING", "CONFIRMED", "ACTIVE", "RISK_RISING", "INVALIDATED", "EXIT"];
  var PIT_STATES = ["NO_SETUP", "WATCH", "SETUP_FORMING", "CONFIRMED"];
  var PATH_STATES = ["ACTIVE", "RISK_RISING", "INVALIDATED", "EXIT"];

  var UNAVAILABLE_REASONS = [
    "SETUP_INPUTS_INCOMPLETE",
    "SETUP_MAPPING_NOT_APPROVED",
    "SETUP_OBSERVATION_HISTORY_NOT_MATERIALIZED",
    "INSUFFICIENT_OBSERVATION_HISTORY"
  ];

  var UNIVERSE = { universeId: "US_EQUITIES", region: "US", assetType: "equity" };

  function finite(value) { return typeof value === "number" && Number.isFinite(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  /* ---------------------------------------------------------------------
     Contract validation. A mapping is refused, never repaired.
     --------------------------------------------------------------------- */
  function validateMapping(methodology) {
    var errors = [];
    if (!methodology || typeof methodology !== "object") return { valid: false, errors: ["methodology must be an object"] };
    var mapping = methodology.stateMapping;
    if (!mapping || typeof mapping !== "object") return { valid: false, errors: ["stateMapping missing"] };
    if (typeof mapping.mappingVersion !== "string" || !mapping.mappingVersion) errors.push("mappingVersion missing");
    if (!mapping.approval || ["PENDING_OWNER", "APPROVED"].indexOf(mapping.approval.state) === -1) errors.push("invalid approval state");
    if (!mapping.cascade || mapping.cascade.semantics !== "FIRST_MATCH_WINS") errors.push("cascade must be first-match-wins");
    if (!mapping.cascade || !Array.isArray(mapping.cascade.rules) || !mapping.cascade.rules.length) errors.push("cascade has no rules");
    if (errors.length) return { valid: false, errors: errors };

    var seenIds = {};
    var order = 0;
    var reachable = {};
    mapping.cascade.rules.forEach(function (rule) {
      var where = "rule '" + (rule && rule.ruleId) + "'";
      if (!rule || typeof rule.ruleId !== "string" || !rule.ruleId) { errors.push("a rule has no ruleId"); return; }
      if (seenIds[rule.ruleId]) errors.push(where + ": duplicate ruleId");
      seenIds[rule.ruleId] = true;
      if (!(rule.order > order)) errors.push(where + ": cascade order must be strictly ascending");
      order = rule.order;
      if (STATES.indexOf(rule.state) === -1) errors.push(where + ": unknown state '" + rule.state + "'");
      reachable[rule.state] = true;
      if (rule.tier === "POINT_IN_TIME") {
        if (PIT_STATES.indexOf(rule.state) === -1) errors.push(where + ": '" + rule.state + "' is not decidable at one cutoff");
      } else if (rule.tier === "PATH_DEPENDENT") {
        if (PATH_STATES.indexOf(rule.state) === -1) errors.push(where + ": '" + rule.state + "' does not need history");
        if (!Array.isArray(rule.historyConditions) || !rule.historyConditions.length) {
          errors.push(where + ": a path-dependent rule without a history condition would be decidable today");
        }
      } else {
        errors.push(where + ": unknown tier");
      }
      if (rule.always !== true && !rule.filters.length && !(rule.historyConditions || []).length) {
        errors.push(where + ": a rule without conditions would match everything");
      }
      (rule.filters || []).forEach(function (filter) {
        var field = Catalog.field(filter.field);
        if (!field) { errors.push(where + ": unknown field '" + filter.field + "'"); return; }
        if (!Catalog.operator(filter.operator)) errors.push(where + ": unknown operator '" + filter.operator + "'");
        if (field.values && filter.operator !== "ne") {
          var wanted = [].concat(filter.value);
          wanted.forEach(function (value) {
            if (field.values.indexOf(value) === -1) errors.push(where + ": '" + value + "' is not a value of " + filter.field);
          });
        }
      });
      /* A point-in-time rule claims to be a screener query. Hold it to it. */
      if (rule.tier === "POINT_IN_TIME" && rule.screenable === true) {
        try { Rules.assertValid(predicateOfRule(rule)); }
        catch (error) { errors.push(where + ": not a valid rule predicate (" + error.message + ")"); }
      }
    });
    STATES.forEach(function (state) { if (!reachable[state]) errors.push("state '" + state + "' is unreachable in the cascade"); });
    var last = mapping.cascade.rules[mapping.cascade.rules.length - 1];
    if (!last || last.always !== true) errors.push("the cascade must end in a rule that always matches");
    return { valid: errors.length === 0, errors: errors };
  }

  function assertMapping(methodology) {
    var result = validateMapping(methodology);
    if (!result.valid) throw new Error("Invalid setup mapping: " + result.errors.join("; "));
    return methodology;
  }

  /* ---------------------------------------------------------------------
     A rule IS a predicate. Same contract, same hash, same evaluator.
     --------------------------------------------------------------------- */
  function predicateOfRule(rule) {
    return Rules.create({ universe: UNIVERSE, filters: clone(rule.filters || []) });
  }

  function ruleHash(rule) {
    if (!rule.filters || !rule.filters.length) return null;
    return Rules.predicateHash(predicateOfRule(rule));
  }

  function screenQuery(rule, presentation) {
    presentation = presentation || {};
    if (!rule.filters || !rule.filters.length) {
      throw new Error("rule '" + rule.ruleId + "' carries no filters and is not a screener query");
    }
    return Rules.toQuery(predicateOfRule(rule), {
      sort: presentation.sort || [{ field: "technicalDistanceTo52wHigh", direction: "desc" }],
      limit: presentation.limit === undefined ? 50 : presentation.limit
    });
  }

  /* ---------------------------------------------------------------------
     History conditions. Deliberately a handful of named comparisons over
     one previous observation of the same title - not an expression
     language, and not a second query engine.
     --------------------------------------------------------------------- */
  function historyValue(condition, context) {
    if (condition.input === "close") return finite(context.close) ? context.close : null;
    if (condition.input === "previous.setupState") return context.previous ? context.previous.setupState : null;
    if (condition.input === "previous.invalidationPrice") return context.previous && finite(context.previous.invalidationPrice) ? context.previous.invalidationPrice : null;
    if (condition.input === "previous.exitPrice") return context.previous && finite(context.previous.exitPrice) ? context.previous.exitPrice : null;
    return undefined;
  }

  function historyMatches(condition, context) {
    var left = historyValue(condition, context);
    if (left === undefined) throw new Error("unknown history input '" + condition.input + "'");
    if (condition.operator === "isNotNull") return left !== null;
    if (left === null) return false;
    var right = condition.value;
    if (typeof right === "string" && right.indexOf("previous.") === 0) {
      right = historyValue({ input: right }, context);
      if (right === undefined) throw new Error("unknown history reference '" + condition.value + "'");
      if (right === null) return false;
    }
    if (condition.operator === "in") return [].concat(right).indexOf(left) !== -1;
    if (condition.operator === "eq") return left === right;
    if (condition.operator === "ne") return left !== right;
    if (condition.operator === "lt") return left < right;
    if (condition.operator === "lte") return left <= right;
    if (condition.operator === "gt") return left > right;
    if (condition.operator === "gte") return left >= right;
    throw new Error("unknown history operator '" + condition.operator + "'");
  }

  /* ---------------------------------------------------------------------
     Evaluation.

     input = {
       row:        catalog-field row for this title (technical fields)
       close:      last close from the same technical bundle
       previous:   the previous published observation of this title, or null
       historyDepth: how many ordered observations exist for this title
       methodology: the loaded setup-state methodology
     }
     --------------------------------------------------------------------- */
  function evaluate(input) {
    var methodology = assertMapping(input.methodology);
    var mapping = methodology.stateMapping;
    var row = input.row || {};
    var context = { close: input.close, previous: input.previous || null };

    var missing = (mapping.coverage.requiredFields || []).filter(function (field) {
      return row[field] === null || row[field] === undefined;
    });
    if (!finite(input.close)) missing.push("close");

    var historyOpen = !!input.previous && (input.historyDepth || 0) >= (mapping.tiers.PATH_DEPENDENT.minimumOrderedObservations || 2);
    var approved = mapping.approval.state === "APPROVED";

    if (missing.length) {
      return {
        engineVersion: ENGINE_VERSION,
        mappingVersion: mapping.mappingVersion,
        classification: { state: "UNAVAILABLE", reason: "SETUP_INPUTS_INCOMPLETE", missing: missing },
        lifecycle: { state: null, availability: { state: "UNAVAILABLE", reason: "SETUP_INPUTS_INCOMPLETE" } },
        matchedRule: null, direction: null, conditions: [], pathTierOpen: false
      };
    }

    var matched = null;
    var evaluated = [];
    for (var i = 0; i < mapping.cascade.rules.length; i++) {
      var rule = mapping.cascade.rules[i];
      var pathRule = rule.tier === "PATH_DEPENDENT";
      if (pathRule && !historyOpen) { evaluated.push({ ruleId: rule.ruleId, state: rule.state, result: "NOT_EVALUABLE" }); continue; }
      var hit = ruleMatches(rule, row, context);
      evaluated.push({ ruleId: rule.ruleId, state: rule.state, result: hit ? "MATCHED" : "NOT_MATCHED" });
      if (hit) { matched = rule; break; }
    }
    /* The cascade ends in a rule that always matches, so this cannot be null. */
    if (!matched) throw new Error("the cascade fell through, which its own contract forbids");

    var classification = PIT_STATES.indexOf(matched.state) !== -1
      ? { state: matched.state, reason: null, missing: [] }
      : { state: null, reason: "PATH_STATE_IS_NOT_A_CLASSIFICATION", missing: [] };

    var lifecycle;
    if (!approved) lifecycle = { state: null, availability: { state: "UNAVAILABLE", reason: "SETUP_MAPPING_NOT_APPROVED" } };
    else if (!input.previous) lifecycle = { state: null, availability: { state: "UNAVAILABLE", reason: "SETUP_OBSERVATION_HISTORY_NOT_MATERIALIZED" } };
    else if (!historyOpen) lifecycle = { state: null, availability: { state: "UNAVAILABLE", reason: "INSUFFICIENT_OBSERVATION_HISTORY" } };
    else lifecycle = { state: matched.state, availability: { state: "AVAILABLE", reason: null } };

    return {
      engineVersion: ENGINE_VERSION,
      mappingVersion: mapping.mappingVersion,
      classification: classification,
      lifecycle: lifecycle,
      matchedRule: { ruleId: matched.ruleId, order: matched.order, state: matched.state, tier: matched.tier, plain: matched.plain, predicateHash: ruleHash(matched) },
      direction: matched.state === "NO_SETUP" ? "NEUTRAL" : "BULLISH",
      conditions: conditionsOf(matched, row, context),
      pathTierOpen: historyOpen,
      evaluatedRules: evaluated
    };
  }

  function ruleMatches(rule, row, context) {
    if (rule.always === true) return true;
    var conditions = rule.historyConditions || [];
    for (var i = 0; i < conditions.length; i++) {
      if (!historyMatches(conditions[i], context)) return false;
    }
    if (!rule.filters || !rule.filters.length) return true;
    return Query.matches(row, rule.filters);
  }

  /* What the reader gets to check. One line per condition of the rule that
     actually decided the state - value, demand and outcome. */
  function conditionsOf(rule, row, context) {
    var out = [];
    (rule.historyConditions || []).forEach(function (condition) {
      out.push({
        kind: "HISTORY", input: condition.input, operator: condition.operator, demand: condition.value,
        value: historyValue(condition, context), met: historyMatches(condition, context)
      });
    });
    (rule.filters || []).forEach(function (filter) {
      var field = Catalog.field(filter.field);
      out.push({
        kind: "FIELD", field: filter.field, label: field ? field.label : filter.field,
        operator: filter.operator, demand: filter.value, value: row[filter.field] === undefined ? null : row[filter.field],
        met: row[filter.field] === null || row[filter.field] === undefined ? false : Query.matches(row, [filter])
      });
    });
    return out;
  }

  /* ---------------------------------------------------------------------
     Publication gate. Enforced on write and on read, exactly like the
     factor evidence gate: a violation is a thrown contract breach, not a
     styling problem.
     --------------------------------------------------------------------- */
  var FORBIDDEN_KEYS = ["probability", "successRate", "expectedReturn", "targetPrice", "winRate", "hitRate", "confidenceOfSuccess"];

  function publicationViolations(observation) {
    var errors = [];
    if (!observation || typeof observation !== "object") return ["observation must be an object"];
    FORBIDDEN_KEYS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(observation, key)) errors.push("forbidden field '" + key + "'");
    });
    var lifecycle = observation.lifecycle || {};
    if (lifecycle.availability && lifecycle.availability.state === "AVAILABLE") {
      if (STATES.indexOf(lifecycle.state) === -1) errors.push("available lifecycle without a canonical state");
      if (!observation.pathTierOpen) errors.push("available lifecycle without ordered observation history");
      if (!observation.matchedRule || !observation.matchedRule.ruleId) errors.push("available lifecycle without the rule that decided it");
    } else {
      if (lifecycle.state !== null) errors.push("unavailable lifecycle must not carry a state");
      if (UNAVAILABLE_REASONS.indexOf(lifecycle.availability && lifecycle.availability.reason) === -1) errors.push("unavailable lifecycle without a typed reason");
    }
    var classification = observation.classification || {};
    if (classification.state !== null && classification.state !== "UNAVAILABLE" && PIT_STATES.indexOf(classification.state) === -1) {
      errors.push("classification may only carry a point-in-time state");
    }
    if (classification.state === "UNAVAILABLE" && UNAVAILABLE_REASONS.indexOf(classification.reason) === -1) {
      errors.push("unavailable classification without a typed reason");
    }
    return errors;
  }

  function assertPublishable(observation) {
    var errors = publicationViolations(observation);
    if (errors.length) throw new Error("Setup observation is not publishable: " + errors.join("; "));
    return observation;
  }

  /* ---------------------------------------------------------------------
     Wire format. The static part of a rule lives once per shard; a title
     carries only what is true about that title.
     --------------------------------------------------------------------- */
  function compact(observation) {
    return {
      c: observation.classification.state === null ? null : observation.classification.state,
      cr: observation.classification.reason,
      l: observation.lifecycle.state,
      lr: observation.lifecycle.availability.reason,
      r: observation.matchedRule ? observation.matchedRule.ruleId : null,
      d: observation.direction,
      k: (observation.conditions || []).map(function (condition) {
        return [condition.kind === "FIELD" ? condition.field : condition.input, condition.value, condition.met ? 1 : 0];
      })
    };
  }

  function hydrate(compacted, mapping) {
    var rule = compacted.r ? mapping.cascade.rules.filter(function (r) { return r.ruleId === compacted.r; })[0] : null;
    return {
      engineVersion: ENGINE_VERSION,
      mappingVersion: mapping.mappingVersion,
      classification: { state: compacted.c, reason: compacted.cr, missing: [] },
      lifecycle: { state: compacted.l, availability: { state: compacted.l === null ? "UNAVAILABLE" : "AVAILABLE", reason: compacted.lr } },
      matchedRule: rule ? { ruleId: rule.ruleId, order: rule.order, state: rule.state, tier: rule.tier, plain: rule.plain, predicateHash: null } : null,
      direction: compacted.d,
      pathTierOpen: compacted.l !== null,
      conditions: (compacted.k || []).map(function (entry, index) {
        var source = rule ? (rule.historyConditions || []).concat(rule.filters || [])[index] : null;
        var field = source && source.field ? Catalog.field(source.field) : null;
        return {
          kind: source && source.field ? "FIELD" : "HISTORY",
          field: source ? source.field : null, input: source ? source.input : null,
          label: field ? field.label : (source ? source.input : entry[0]),
          operator: source ? source.operator : null, demand: source ? source.value : null,
          value: entry[1], met: entry[2] === 1
        };
      })
    };
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION,
    OBSERVATION_SCHEMA: OBSERVATION_SCHEMA,
    OBSERVATION_INDEX_SCHEMA: OBSERVATION_INDEX_SCHEMA,
    SHARD_SCHEMA: SHARD_SCHEMA,
    STATES: STATES.slice(),
    PIT_STATES: PIT_STATES.slice(),
    PATH_STATES: PATH_STATES.slice(),
    UNAVAILABLE_REASONS: UNAVAILABLE_REASONS.slice(),
    UNIVERSE: UNIVERSE,
    validateMapping: validateMapping,
    assertMapping: assertMapping,
    predicateOfRule: predicateOfRule,
    ruleHash: ruleHash,
    screenQuery: screenQuery,
    evaluate: evaluate,
    publicationViolations: publicationViolations,
    assertPublishable: assertPublishable,
    compact: compact,
    hydrate: hydrate
  };

  if (isNode) module.exports = api;
  else global.VUSetupEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
