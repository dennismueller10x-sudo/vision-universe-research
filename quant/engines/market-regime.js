/* =========================================================================
   VISION UNIVERSE QUANT 2.0 — MARKET REGIME v1

   The product question is "how broadly is the measured market carried right
   now". It is NOT "where is it going". Everything here describes a present
   state; nothing forecasts, times or recommends.

   TWO TIERS, kept apart for the same reason as in the setup engine:

   - POINT_IN_TIME (BROAD_STRENGTH, MIXED, BROAD_WEAKNESS) is decidable from
     one cutoff and is published as exactly that. Deliberately WITHOUT
     hysteresis: a smoothed state is a claim about a course of events, and a
     claim about a course of events needs ordered history. The state may
     therefore differ between two runs, which is not a defect - it is the
     honest shape of a snapshot.
   - PATH_DEPENDENT (REGIME_SHIFT, REGIME_PERSISTING, REGIME_WEAKENING) is a
     statement about a course of events and stays shut until real ordered
     observations exist and behave.

   The thresholds are round, pre-set shares. They are not fitted to market
   outcomes, because a threshold tuned against outcomes would turn a
   description into a claim - and it would be the overfit this whole layer
   exists to avoid.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var ENGINE_VERSION = "vu-market-regime-1.0.0";
  var PIT_STATES = ["BROAD_STRENGTH", "MIXED", "BROAD_WEAKNESS"];
  var PATH_STATES = ["REGIME_SHIFT", "REGIME_PERSISTING", "REGIME_WEAKENING"];
  var UNAVAILABLE_REASONS = ["MARKET_REGIME_INPUT_COVERAGE_TOO_LOW", "MARKET_REGIME_UNIVERSE_TOO_SMALL", "MARKET_REGIME_INPUT_INCONSISTENT"];
  var PATH_CLOSED_REASONS = ["MARKET_REGIME_TRANSITIONS_NOT_ACTIVATED", "INSUFFICIENT_REGIME_HISTORY"];

  function finite(v) { return typeof v === "number" && Number.isFinite(v); }

  function validateMethodology(methodology) {
    var errors = [];
    if (!methodology || typeof methodology !== "object") return { valid: false, errors: ["methodology must be an object"] };
    if (!Array.isArray(methodology.measures) || !methodology.measures.length) errors.push("no measures");
    if (!methodology.cascade || methodology.cascade.semantics !== "FIRST_MATCH_WINS") errors.push("cascade must be first-match-wins");
    var rules = (methodology.cascade || {}).rules;
    if (!Array.isArray(rules) || !rules.length) return { valid: false, errors: errors.concat(["cascade has no rules"]) };

    var order = 0;
    var seen = {};
    var reachable = {};
    rules.forEach(function (rule) {
      var where = "rule '" + rule.ruleId + "'";
      if (seen[rule.ruleId]) errors.push(where + ": duplicate ruleId");
      seen[rule.ruleId] = true;
      if (!(rule.order > order)) errors.push(where + ": order must be strictly ascending");
      order = rule.order;
      if (PIT_STATES.indexOf(rule.state) === -1) errors.push(where + ": unknown state '" + rule.state + "'");
      reachable[rule.state] = true;
      if (rule.always !== true) {
        if (!Array.isArray(rule.all) || !rule.all.length) errors.push(where + ": no conditions and not a fallback");
        (rule.all || []).forEach(function (condition) {
          var known = methodology.measures.some(function (m) { return m.id === condition.measure; });
          if (!known) errors.push(where + ": unknown measure '" + condition.measure + "'");
          if (!finite(condition.value)) errors.push(where + ": threshold is not a number");
        });
      }
      /* A rule with prose but no rationale is a number nobody can argue
         with, which is the opposite of what a written methodology is for. */
      if (!rule.plain || !rule.rationale) errors.push(where + ": plain or rationale missing");
    });
    PIT_STATES.forEach(function (state) { if (!reachable[state]) errors.push("'" + state + "' is unreachable"); });
    if (rules[rules.length - 1].always !== true) errors.push("the cascade must end in a rule that always matches");

    var activation = methodology.pathDependentActivation;
    if (!activation || ["PENDING_HISTORY", "ACTIVE"].indexOf(activation.state) === -1) {
      errors.push("pathDependentActivation is missing or carries an unknown state");
    } else if (activation.state === "ACTIVE") {
      (activation.checks || []).forEach(function (check) {
        if (check.state !== "PASS") errors.push("transitions are ACTIVE while check '" + check.id + "' is " + check.state);
      });
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function assertMethodology(methodology) {
    var result = validateMethodology(methodology);
    if (!result.valid) throw new Error("Invalid market regime methodology: " + result.errors.join("; "));
    return methodology;
  }

  function compare(operator, left, right) {
    if (operator === "gte") return left >= right;
    if (operator === "lte") return left <= right;
    if (operator === "gt") return left > right;
    if (operator === "lt") return left < right;
    throw new Error("unknown operator '" + operator + "'");
  }

  /**
   * counts: { measureId: { hits, observed } } - counted by the caller over
   * the published technical artifact. This engine does no bar arithmetic and
   * reads no file; it classifies shares that were already measured.
   */
  function evaluate(input) {
    var methodology = assertMethodology(input.methodology);
    var universe = input.universe || 0;
    var counts = input.counts || {};

    if (universe < (methodology.minimumUniverse || 0)) {
      return unavailable(methodology, "MARKET_REGIME_UNIVERSE_TOO_SMALL", universe, []);
    }

    var shares = {};
    var thin = [];
    var broken = [];
    methodology.measures.forEach(function (measure) {
      var entry = counts[measure.id] || { hits: 0, observed: 0 };
      /* A counter that reports more hits than observations, or observations
         beyond the universe, is broken. Published, it becomes "199,8 % of
         titles are above the line" - a number no reader can interpret and
         nobody would think to check. It refuses instead: a nonsensical
         share is a defect in the count, not a finding about the market. */
      if (!finite(entry.hits) || !finite(entry.observed) || entry.hits < 0 ||
          entry.observed < 0 || entry.hits > entry.observed || entry.observed > universe) {
        broken.push(measure.id);
        return;
      }
      var coverage = universe > 0 ? entry.observed / universe : 0;
      if (coverage < (measure.minimumCoverage || 0)) { thin.push(measure.id); return; }
      shares[measure.id] = {
        id: measure.id, label: measure.label, why: measure.why,
        share: entry.observed > 0 ? entry.hits / entry.observed : null,
        hits: entry.hits, observed: entry.observed,
        coverage: Math.round(coverage * 1e4) / 1e4
      };
    });
    /* Checked before coverage: a broken count would otherwise be reported
       as merely thin, which reads as a data gap rather than as the defect
       it is. */
    if (broken.length) return unavailable(methodology, "MARKET_REGIME_INPUT_INCONSISTENT", universe, broken);
    /* A measure whose coverage is too thin is named, never silently treated
       as zero. A zero share and an unmeasured share are different claims. */
    if (thin.length) return unavailable(methodology, "MARKET_REGIME_INPUT_COVERAGE_TOO_LOW", universe, thin);

    var matched = null;
    var evaluated = [];
    var rules = methodology.cascade.rules;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule.always === true) { matched = rule; evaluated.push({ ruleId: rule.ruleId, result: "MATCHED" }); break; }
      var hit = rule.all.every(function (condition) {
        return compare(condition.operator, shares[condition.measure].share, condition.value);
      });
      evaluated.push({ ruleId: rule.ruleId, result: hit ? "MATCHED" : "NOT_MATCHED" });
      if (hit) { matched = rule; break; }
    }
    if (!matched) throw new Error("the cascade fell through, which its own contract forbids");

    var activation = methodology.pathDependentActivation || { state: "PENDING_HISTORY" };
    var historyDepth = input.historyDepth || 0;
    var required = (methodology.tiers.PATH_DEPENDENT || {}).minimumOrderedObservations || 12;
    var pathReason = activation.state !== "ACTIVE" ? "MARKET_REGIME_TRANSITIONS_NOT_ACTIVATED"
      : historyDepth < required ? "INSUFFICIENT_REGIME_HISTORY" : null;

    return {
      engineVersion: ENGINE_VERSION,
      methodologyVersion: methodology.methodologyVersion,
      state: "AVAILABLE",
      regime: matched.state,
      matchedRule: { ruleId: matched.ruleId, order: matched.order, plain: matched.plain, rationale: matched.rationale },
      measures: methodology.measures.map(function (m) { return shares[m.id]; }),
      universe: universe,
      evaluatedRules: evaluated,
      /* Its own field, so a reader can tell that the three course-of-events
         states were never even considered - rather than inferring from
         their absence that they were ruled out. */
      transitions: pathReason === null
        ? { state: "OPEN", reason: null }
        : { state: "CLOSED", reason: pathReason },
      notAForecast: methodology.notAForecast
    };
  }

  function unavailable(methodology, reason, universe, fields) {
    return {
      engineVersion: ENGINE_VERSION,
      methodologyVersion: methodology.methodologyVersion,
      state: "UNAVAILABLE",
      reason: reason,
      fields: fields,
      regime: null,
      universe: universe,
      transitions: { state: "CLOSED", reason: "MARKET_REGIME_TRANSITIONS_NOT_ACTIVATED" },
      notAForecast: methodology.notAForecast
    };
  }

  /* A published regime must never carry a path-dependent state while that
     tier is shut, and never a state outside the written list. */
  function publicationViolations(result) {
    var out = [];
    if (!result) return ["no result"];
    if (result.state === "AVAILABLE") {
      if (PIT_STATES.indexOf(result.regime) === -1) out.push("unknown regime '" + result.regime + "'");
      if (PATH_STATES.indexOf(result.regime) !== -1 && result.transitions.state !== "OPEN") {
        out.push("a course-of-events regime is published while the tier is closed");
      }
    } else {
      if (result.regime !== null) out.push("an unavailable result carries a regime");
      if (UNAVAILABLE_REASONS.indexOf(result.reason) === -1) out.push("unknown reason '" + result.reason + "'");
    }
    return out;
  }

  function assertPublishable(result) {
    var violations = publicationViolations(result);
    if (violations.length) throw new Error("market regime publication gate violated: " + violations.join("; "));
    return result;
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION,
    PIT_STATES: PIT_STATES.slice(),
    PATH_STATES: PATH_STATES.slice(),
    UNAVAILABLE_REASONS: UNAVAILABLE_REASONS.slice(),
    PATH_CLOSED_REASONS: PATH_CLOSED_REASONS.slice(),
    validateMethodology: validateMethodology,
    assertMethodology: assertMethodology,
    evaluate: evaluate,
    publicationViolations: publicationViolations,
    assertPublishable: assertPublishable
  };

  if (isNode) module.exports = api;
  else global.VUMarketRegime = api;
})(typeof window !== "undefined" ? window : globalThis);
