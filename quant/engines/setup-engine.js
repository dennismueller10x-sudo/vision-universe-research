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

   TWO LOCKS, held separately:

   - the methodology approval covers the four states decidable from one
     cutoff. Once given, they publish; they need no history because they
     make no claim about one.
   - the activation of the path-dependent tier is its own gate. Approving a
     methodology does not make a course of events observable - that needs
     real ordered history and evidence that the states behave in it the way
     the methodology describes. Holding it separately means the methodology
     never has to sit unapproved just to keep four states shut.

   A classification alone is never presented as a lifecycle state, and a
   published point-in-time state never implies the path tier was even
   considered: `pathTier` says so in its own field.
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
  var SHARD_SCHEMA = "setup-observation-product-1.1.0";
  /* Beide Fassungen bleiben lesbar. 1.1.0 traegt die Zeile der
     Katalogfelder je Titel; ohne sie laesst sich nur die Regel erklaeren,
     die gegriffen hat, und nicht, was einen ANDEREN Zustand ausmachen
     wuerde. Die aeltere Fassung ist nicht falsch - sie kann diese eine
     Frage nur nicht beantworten, und die Oberflaeche sagt das dann. Ein
     harter Schemawechsel haette die ganze Setup-Sektion bis zur naechsten
     Materialisierung auf UNAVAILABLE gestellt. */
  var SHARD_SCHEMAS = ["setup-observation-product-1.0.0", "setup-observation-product-1.1.0"];
  var SCREEN_INDEX_SCHEMA = "setup-screen-index-1.0.0";

  var STATES = ["NO_SETUP", "WATCH", "SETUP_FORMING", "CONFIRMED", "ACTIVE", "RISK_RISING", "INVALIDATED", "EXIT"];
  var PIT_STATES = ["NO_SETUP", "WATCH", "SETUP_FORMING", "CONFIRMED"];
  var PATH_STATES = ["ACTIVE", "RISK_RISING", "INVALIDATED", "EXIT"];

  /* Why a lifecycle state is not published. Two of these went away when the
     mapping was approved for the point-in-time tier: a title with complete
     evidence now always carries one of the four decidable states. */
  var UNAVAILABLE_REASONS = [
    "SETUP_INPUTS_INCOMPLETE",
    "SETUP_MAPPING_NOT_APPROVED"
  ];

  /* Why the path-dependent tier is closed. This is a SEPARATE statement from
     the lifecycle above: a title can carry a published point-in-time state
     while the four course-of-events states were never even considered, and a
     reader has to be able to tell those two apart. */
  var PATH_CLOSED_REASONS = [
    "SETUP_MAPPING_NOT_APPROVED",
    "PATH_DEPENDENT_STATES_NOT_ACTIVATED",
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
    var activation = mapping.pathDependentActivation;
    if (!activation || ["PENDING_HISTORY", "ACTIVE"].indexOf(activation.state) === -1) {
      errors.push("pathDependentActivation is missing or carries an unknown state");
    } else {
      if (!Array.isArray(activation.states) || activation.states.slice().sort().join(",") !== PATH_STATES.slice().sort().join(",")) {
        errors.push("pathDependentActivation must name exactly the four path-dependent states");
      }
      if (!Array.isArray(activation.checks) || activation.checks.length < 7) {
        errors.push("pathDependentActivation must carry its checks; a gate without them is a promise");
      }
      /* The gate may not stand open while a check it names has not passed.
         Measured evidence and the owner's switch are both required, and
         this is the half that cannot be argued with. */
      if (activation.state === "ACTIVE") {
        (activation.checks || []).forEach(function (check) {
          if (check.state !== "PASS") errors.push("path tier is ACTIVE while check '" + check.id + "' is " + check.state);
        });
      }
    }
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
     THE SCREENING SIDE OF THE SAME RULE.

     A per-title observation answers "where does this one title stand".
     The other half of the same product question is "which titles stand
     there", and that is the same rule read the other way round: every
     point-in-time rule is a canonical predicate, so the screener query
     for a state already exists and carries the same predicateHash. No
     second engine, no second vocabulary, no second threshold.

     One thing does NOT follow, and publishing it would publish a wrong
     list: a rule's predicate matches MORE titles than the rule assigns.
     The cascade is first-match-wins, so a title that satisfies the WATCH
     predicate but was already taken by CONFIRMED is CONFIRMED, not
     WATCH. "Show me everything in this state" must therefore be answered
     from the cascade's assignment; the raw predicate is wrong by exactly
     the titles a higher-priority rule claimed.

     screenIndex() publishes the assignment. reconcile() proves the two
     sides still agree: the assignment is always a subset of the
     predicate, and every title in the difference is accounted for by
     cascade priority or by incomplete inputs. Anything left over means
     the two halves have drifted, which is the whole reason this pair
     exists.
     --------------------------------------------------------------------- */
  function sortAssignments(a, b) {
    var av = finite(a.sort) ? a.sort : -Infinity;
    var bv = finite(b.sort) ? b.sort : -Infinity;
    if (av !== bv) return bv - av;
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
  }

  function ruleIndexOf(mapping) {
    var byId = {};
    for (var i = 0; i < mapping.cascade.rules.length; i++) {
      byId[mapping.cascade.rules[i].ruleId] = mapping.cascade.rules[i];
    }
    return byId;
  }

  /**
   * assignments: [{ ticker, ruleId, state, sort }] - one per classified title,
   * exactly as the cascade decided it. options.pathTierOpen says whether the
   * second lock is open; options.pathClosedReason names why when it is not.
   */
  function screenIndex(assignments, methodology, options) {
    var mapping = assertMapping(methodology).stateMapping;
    options = options || {};
    var approved = mapping.approval.state === "APPROVED";
    var pathOpen = approved && options.pathTierOpen === true;
    var byId = ruleIndexOf(mapping);
    var byRule = {};

    for (var j = 0; j < assignments.length; j++) {
      var a = assignments[j];
      var rule = byId[a.ruleId];
      if (!rule) throw new Error("screenIndex: unknown ruleId '" + a.ruleId + "'");
      if (rule.state !== a.state) {
        throw new Error("screenIndex: '" + a.ticker + "' is filed as " + a.state +
          " under rule " + a.ruleId + ", which assigns " + rule.state);
      }
      (byRule[a.ruleId] || (byRule[a.ruleId] = [])).push(a);
    }

    var states = [];
    for (var k = 0; k < STATES.length; k++) {
      var state = STATES[k];
      var tier = PIT_STATES.indexOf(state) !== -1 ? "POINT_IN_TIME" : "PATH_DEPENDENT";
      var open = tier === "POINT_IN_TIME" ? approved : pathOpen;
      var reason = open ? null
        : !approved ? "SETUP_MAPPING_NOT_APPROVED"
        : options.pathClosedReason || "PATH_DEPENDENT_STATES_NOT_ACTIVATED";

      var ruleEntries = [];
      var total = 0;
      for (var r = 0; r < mapping.cascade.rules.length; r++) {
        var cascadeRule = mapping.cascade.rules[r];
        if (cascadeRule.state !== state) continue;
        var hits = (byRule[cascadeRule.ruleId] || []).slice().sort(sortAssignments);
        total += hits.length;
        ruleEntries.push({
          ruleId: cascadeRule.ruleId,
          order: cascadeRule.order,
          screenable: cascadeRule.screenable === true,
          predicateHash: ruleHash(cascadeRule),
          plain: cascadeRule.plain,
          /* A rule without filters has no predicate and therefore no
             screener query. The fallback is "whatever the other rules did
             not take", which is not a property of a title and must not be
             published as a list that reads like one. */
          matched: open ? hits.length : null,
          tickers: open && cascadeRule.screenable === true
            ? hits.map(function (h) { return h.ticker; })
            : null
        });
      }

      states.push({
        state: state,
        tier: tier,
        /* Null, never 0, while the tier is shut. A published "INVALIDATED: 0"
           reads as "no title is invalidated", and that is a claim this
           engine has not earned the right to make. */
        count: open ? total : null,
        availability: open
          ? { state: "AVAILABLE", reason: null }
          : { state: "UNAVAILABLE", reason: reason },
        rules: ruleEntries
      });
    }

    return {
      schemaVersion: SCREEN_INDEX_SCHEMA,
      engineVersion: ENGINE_VERSION,
      mappingVersion: mapping.mappingVersion,
      classified: assignments.length,
      states: states
    };
  }

  /**
   * rows: the canonical catalog rows the cascade was evaluated over, keyed by
   * ticker. assignments: the cascade's answer. unclassified: tickers whose
   * inputs were incomplete, so the cascade never reached a rule for them.
   */
  function reconcile(rows, assignments, methodology, options) {
    var mapping = assertMapping(methodology).stateMapping;
    options = options || {};
    var assignedRule = {};
    var i;
    for (i = 0; i < assignments.length; i++) assignedRule[assignments[i].ticker] = assignments[i].ruleId;
    var byId = ruleIndexOf(mapping);
    var unclassified = {};
    for (i = 0; i < (options.unclassified || []).length; i++) unclassified[options.unclassified[i]] = true;

    var reports = [];
    var parity = true;
    for (var r = 0; r < mapping.cascade.rules.length; r++) {
      var rule = mapping.cascade.rules[r];
      if (rule.screenable !== true) continue;

      /* Deliberately the screener path and not ruleMatches(): the claim
         under test is that the two evaluators agree, so one side has to be
         the one a screener runs. Query.matches is the function Query.execute
         itself filters with; it is used directly because execute() also
         applies a page limit and a listing status filter, and neither is
         part of the predicate. Paging a parity check would let a
         disagreement past row 500 go unnoticed. */
      var query = screenQuery(rule);
      var matched = {};
      var matchedCount = 0;
      for (var q = 0; q < rows.length; q++) {
        if (!Query.matches(rows[q], query.filters)) continue;
        matched[rows[q].ticker] = true;
        matchedCount += 1;
      }

      var assignedNotMatched = [];
      for (i = 0; i < assignments.length; i++) {
        if (assignments[i].ruleId === rule.ruleId && !matched[assignments[i].ticker]) {
          assignedNotMatched.push(assignments[i].ticker);
        }
      }

      var claimedByHigherPriority = [];
      var inputsIncomplete = [];
      var unexplained = [];
      for (var ticker in matched) {
        if (!Object.prototype.hasOwnProperty.call(matched, ticker)) continue;
        var own = assignedRule[ticker];
        if (own === rule.ruleId) continue;
        if (own === undefined) {
          (unclassified[ticker] ? inputsIncomplete : unexplained).push(ticker);
        } else if (byId[own] && byId[own].order < rule.order) {
          claimedByHigherPriority.push(ticker);
        } else {
          unexplained.push(ticker);
        }
      }

      var ok = assignedNotMatched.length === 0 && unexplained.length === 0;
      if (!ok) parity = false;
      reports.push({
        ruleId: rule.ruleId,
        state: rule.state,
        predicateHash: ruleHash(rule),
        predicateMatched: matchedCount,
        assigned: countAssigned(assignments, rule.ruleId),
        claimedByHigherPriority: claimedByHigherPriority.length,
        inputsIncomplete: inputsIncomplete.length,
        assignedNotMatched: assignedNotMatched.sort().slice(0, 25),
        unexplained: unexplained.sort().slice(0, 25),
        parity: ok
      });
    }

    return {
      engineVersion: ENGINE_VERSION,
      mappingVersion: mapping.mappingVersion,
      universe: rows.length,
      classified: assignments.length,
      unclassified: (options.unclassified || []).length,
      parity: parity,
      rules: reports
    };
  }

  function countAssigned(assignments, ruleId) {
    var n = 0;
    for (var i = 0; i < assignments.length; i++) if (assignments[i].ruleId === ruleId) n++;
    return n;
  }

  function assertParity(report) {
    if (report.parity) return report;
    var broken = report.rules.filter(function (r) { return !r.parity; }).map(function (r) {
      return r.ruleId + " (assigned but not matched: " + r.assignedNotMatched.join(",") +
        "; unexplained: " + r.unexplained.join(",") + ")";
    });
    throw new Error("the setup cascade and its screener queries disagree: " + broken.join(" | "));
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

    /* TWO LOCKS, not one.

       The first is the methodology approval. It covers the four states that
       are decidable from a single cutoff, and once it is given those states
       publish - they need no history, because they make no claim about one.

       The second is the activation of the path-dependent tier. A methodology
       approval does not make a course of events observable: that needs real
       ordered history AND evidence that the states behave in it the way the
       methodology describes. The owner holds that lock separately, so the
       methodology never has to sit unapproved just to keep four states shut. */
    var approved = mapping.approval.state === "APPROVED";
    var activation = mapping.pathDependentActivation || { state: "PENDING_HISTORY" };
    var historyOpen = !!input.previous && (input.historyDepth || 0) >= (mapping.tiers.PATH_DEPENDENT.minimumOrderedObservations || 2);

    var pathClosedReason = !approved ? "SETUP_MAPPING_NOT_APPROVED"
      : activation.state !== "ACTIVE" ? "PATH_DEPENDENT_STATES_NOT_ACTIVATED"
      : !input.previous ? "SETUP_OBSERVATION_HISTORY_NOT_MATERIALIZED"
      : !historyOpen ? "INSUFFICIENT_OBSERVATION_HISTORY"
      : null;
    var pathTierOpen = pathClosedReason === null;
    var pathTier = pathTierOpen
      ? { state: "OPEN", reason: null }
      : { state: "CLOSED", reason: pathClosedReason };

    if (missing.length) {
      return {
        engineVersion: ENGINE_VERSION,
        mappingVersion: mapping.mappingVersion,
        classification: { state: "UNAVAILABLE", reason: "SETUP_INPUTS_INCOMPLETE", missing: missing },
        lifecycle: { state: null, availability: { state: "UNAVAILABLE", reason: "SETUP_INPUTS_INCOMPLETE" } },
        pathTier: pathTier,
        matchedRule: null, direction: null, conditions: [], pathTierOpen: false
      };
    }

    var matched = null;
    var evaluated = [];
    for (var i = 0; i < mapping.cascade.rules.length; i++) {
      var rule = mapping.cascade.rules[i];
      var pathRule = rule.tier === "PATH_DEPENDENT";
      if (pathRule && !pathTierOpen) { evaluated.push({ ruleId: rule.ruleId, state: rule.state, result: "NOT_EVALUABLE" }); continue; }
      var hit = ruleMatches(rule, row, context);
      evaluated.push({ ruleId: rule.ruleId, state: rule.state, result: hit ? "MATCHED" : "NOT_MATCHED" });
      if (hit) { matched = rule; break; }
    }
    /* The cascade ends in a rule that always matches, so this cannot be null. */
    if (!matched) throw new Error("the cascade fell through, which its own contract forbids");

    var classification = PIT_STATES.indexOf(matched.state) !== -1
      ? { state: matched.state, reason: null, missing: [] }
      : { state: null, reason: "PATH_STATE_IS_NOT_A_CLASSIFICATION", missing: [] };

    /* With the mapping approved, a point-in-time state publishes on its own
       evidence. A path-dependent state can only have been matched at all
       when the second lock was open, so reaching here with one means it is
       publishable too. */
    var lifecycle = !approved
      ? { state: null, availability: { state: "UNAVAILABLE", reason: "SETUP_MAPPING_NOT_APPROVED" } }
      : { state: matched.state, availability: { state: "AVAILABLE", reason: null }, tier: matched.tier };

    return {
      engineVersion: ENGINE_VERSION,
      mappingVersion: mapping.mappingVersion,
      classification: classification,
      lifecycle: lifecycle,
      matchedRule: { ruleId: matched.ruleId, order: matched.order, state: matched.state, tier: matched.tier, plain: matched.plain, predicateHash: ruleHash(matched) },
      direction: matched.state === "NO_SETUP" ? "NEUTRAL" : "BULLISH",
      conditions: conditionsOf(matched, row, context),
      pathTier: pathTier,
      pathTierOpen: pathTierOpen,
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

  /* WANN EIN WERT KEINE AUSSAGE IST.

     Fuenf der neun Felder, gegen die die Kaskade filtert, stehen NICHT in
     coverage.requiredFields - ein Titel kann also eine veroeffentlichte
     Beobachtung haben und trotzdem bei einem davon "nicht bestimmbar"
     tragen. Gemessen am 25.09.2026: 146 von 5.676 Titeln beim
     Volumenzustand, 61 davon zusaetzlich beim Momentum.

     Die Regel greift dann zurecht nicht - aber "nicht erfuellt" und "nicht
     messbar" sind zwei verschiedene Aussagen, und die Oberflaeche soll
     dafuer nicht dasselbe Zeichen zeigen. Genau dieselbe Unterscheidung
     fuehrt der Strategy Match schon.

     NONE gehoert ausdruecklich NICHT dazu: "keine Zone beschrieben" ist
     eine Feststellung und kein fehlender Wert. */
  var UNDETERMINABLE = ["UNAVAILABLE", "UNDETERMINED"];

  function determinable(value) {
    if (value === null || value === undefined) return false;
    return UNDETERMINABLE.indexOf(value) === -1;
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
        met: row[filter.field] === null || row[filter.field] === undefined ? false : Query.matches(row, [filter]),
        measurable: determinable(row[filter.field])
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
    var pathTier = observation.pathTier || {};
    if (lifecycle.availability && lifecycle.availability.state === "AVAILABLE") {
      if (STATES.indexOf(lifecycle.state) === -1) errors.push("available lifecycle without a canonical state");
      if (!observation.matchedRule || !observation.matchedRule.ruleId) errors.push("available lifecycle without the rule that decided it");
      /* The point that matters: a course-of-events state may only be
         published while the second lock is open. A point-in-time state may
         be published without it, and must not be mistaken for one. */
      if (PATH_STATES.indexOf(lifecycle.state) !== -1 && pathTier.state !== "OPEN") {
        errors.push("path-dependent state '" + lifecycle.state + "' published while the path tier is closed");
      }
    } else {
      if (lifecycle.state !== null) errors.push("unavailable lifecycle must not carry a state");
      if (UNAVAILABLE_REASONS.indexOf(lifecycle.availability && lifecycle.availability.reason) === -1) errors.push("unavailable lifecycle without a typed reason");
    }
    if (["OPEN", "CLOSED"].indexOf(pathTier.state) === -1) errors.push("the path tier must say whether it is open");
    if (pathTier.state === "CLOSED" && PATH_CLOSED_REASONS.indexOf(pathTier.reason) === -1) {
      errors.push("a closed path tier without a typed reason");
    }
    if (pathTier.state === "OPEN" && pathTier.reason !== null) errors.push("an open path tier carries no reason");
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
     THE ACTIVATION GATE FOR THE PATH-DEPENDENT TIER.

     The owner approved the methodology and kept these four states shut
     until the history exists and behaves. This measures the seven named
     checks against the published observation history and reports each one
     as PASS, FAIL or NOT_EVALUABLE.

     It never opens the gate. Opening needs this report AND the owner
     setting pathDependentActivation.state - measured evidence alone would
     be self-approval, and a switch alone would be blind. While the history
     is missing, every check reads NOT_EVALUABLE rather than PASS: an
     unmeasured check that reports success is worse than no check at all.

     `series` is the ordered observation history, oldest first:
       [{ asOf, rows: { ticker: [state, invalidationPrice, exitPrice] } }]
     --------------------------------------------------------------------- */
  function activationGate(series, methodology) {
    var mapping = methodology.stateMapping;
    var activation = mapping.pathDependentActivation || {};
    var spec = {};
    (activation.checks || []).forEach(function (check) { spec[check.id] = check; });

    var ordered = (series || []).slice().sort(function (a, b) { return a.asOf < b.asOf ? -1 : 1; });
    var observations = ordered.length;
    var spanDays = observations > 1
      ? Math.round((Date.parse(ordered[observations - 1].asOf) - Date.parse(ordered[0].asOf)) / 86400000)
      : 0;
    var minimumObservations = (spec.SUFFICIENT_OBSERVATION_DURATION || {}).minimumObservations || 12;
    var minimumSpanDays = (spec.SUFFICIENT_OBSERVATION_DURATION || {}).minimumSpanDays || 90;

    var results = {};
    function record(id, state, measured) {
      results[id] = { id: id, label: (spec[id] || {}).label || id, state: state, measured: measured || null };
    }

    /* Duration first: it decides whether anything else can be said at all. */
    /* Too little history is a "not yet", never a "no": it cannot fail
       permanently, so calling it FAIL would misdescribe a gate that opens by
       itself as time passes. */
    var enough = observations >= minimumObservations && spanDays >= minimumSpanDays;
    record("SUFFICIENT_OBSERVATION_DURATION", enough ? "PASS" : "NOT_EVALUABLE",
      { observations: observations, spanDays: spanDays, minimumObservations: minimumObservations, minimumSpanDays: minimumSpanDays });

    /* Integrity is checkable from the first observation onward: a stored
       file either matches its own hash or it does not. */
    var corrupt = ordered.filter(function (entry) { return entry.contentHashValid === false; }).length;
    record("NO_RETROACTIVE_STATE_CHANGE", observations === 0 ? "NOT_EVALUABLE" : (corrupt ? "FAIL" : "PASS"),
      { snapshots: observations, corrupt: corrupt });

    if (observations < 2) {
      ["TRANSITION_MATRIX", "STATE_PERSISTENCE", "REVERSAL_BEHAVIOUR",
       "INVALIDATION_BEHAVIOUR", "EXIT_BEHAVIOUR"].forEach(function (id) {
        record(id, "NOT_EVALUABLE", { orderedObservations: observations, needed: 2 });
      });
      return summarise(results, activation, mapping);
    }

    /* Transitions between consecutive observations of the same title. */
    var matrix = {}, transitions = 0, impossible = [];
    var runs = {}, open = {}, reversals = 0, reversalCandidates = 0;
    var invalidationChecked = 0, invalidationUnbacked = 0;
    var exitChecked = 0, exitUnbacked = 0;
    var previousRows = ordered[0].rows || {};
    var previousState = {}, priorState = {};
    Object.keys(previousRows).forEach(function (ticker) { previousState[ticker] = previousRows[ticker][0]; open[ticker] = 1; });

    for (var i = 1; i < observations; i++) {
      var rows = ordered[i].rows || {};
      Object.keys(rows).forEach(function (ticker) {
        var to = rows[ticker][0];
        var from = previousState[ticker];
        if (!from) { previousState[ticker] = to; open[ticker] = 1; return; }
        if (from === to) { open[ticker] = (open[ticker] || 0) + 1; }
        else {
          transitions += 1;
          var key = from + ">" + to;
          matrix[key] = (matrix[key] || 0) + 1;
          if (!reachableTransition(from, to, mapping)) impossible.push(key);
          (runs[from] = runs[from] || []).push(open[ticker] || 1);
          if (priorState[ticker] === to) reversals += 1;
          if (priorState[ticker]) reversalCandidates += 1;
          /* A path state must be backed by the level stored in the row it
             came from - otherwise it was reached without its evidence. */
          if (to === "INVALIDATED") {
            invalidationChecked += 1;
            if (!finite(previousRows[ticker] && previousRows[ticker][1])) invalidationUnbacked += 1;
          }
          if (to === "EXIT") {
            exitChecked += 1;
            if (!finite(previousRows[ticker] && previousRows[ticker][2])) exitUnbacked += 1;
          }
          priorState[ticker] = from;
          previousState[ticker] = to;
          open[ticker] = 1;
        }
      });
      previousRows = rows;
    }

    record("TRANSITION_MATRIX", impossible.length ? "FAIL" : (transitions ? "PASS" : "NOT_EVALUABLE"),
      { transitions: transitions, distinct: Object.keys(matrix).length, matrix: matrix, impossible: impossible.slice(0, 10) });

    var persistence = {}, persistenceOk = true, persistenceSeen = false;
    PATH_STATES.forEach(function (state) {
      var lengths = runs[state] || [];
      if (!lengths.length) { persistence[state] = null; return; }
      persistenceSeen = true;
      var sorted = lengths.slice().sort(function (a, b) { return a - b; });
      var median = sorted[Math.floor(sorted.length / 2)];
      persistence[state] = { runs: lengths.length, medianObservations: median };
      if (median < 2) persistenceOk = false;
    });
    record("STATE_PERSISTENCE", !persistenceSeen ? "NOT_EVALUABLE" : (persistenceOk ? "PASS" : "FAIL"), persistence);

    var reversalShare = reversalCandidates ? reversals / reversalCandidates : null;
    record("REVERSAL_BEHAVIOUR", reversalCandidates === 0 ? "NOT_EVALUABLE" : (reversalShare < 0.2 ? "PASS" : "FAIL"),
      { reversals: reversals, candidates: reversalCandidates, share: reversalShare });

    record("INVALIDATION_BEHAVIOUR", invalidationChecked === 0 ? "NOT_EVALUABLE" : (invalidationUnbacked ? "FAIL" : "PASS"),
      { observed: invalidationChecked, withoutStoredLevel: invalidationUnbacked });
    record("EXIT_BEHAVIOUR", exitChecked === 0 ? "NOT_EVALUABLE" : (exitUnbacked ? "FAIL" : "PASS"),
      { observed: exitChecked, withoutStoredZone: exitUnbacked });

    return summarise(results, activation, mapping);
  }

  /* Can the cascade produce this transition at all? Every state is
     reachable from every other except where a path rule names the states it
     may follow - a transition outside those is evidence that something
     other than the mapping produced it. */
  function reachableTransition(from, to, mapping) {
    if (PATH_STATES.indexOf(to) === -1) return true;
    var allowed = [];
    (mapping.cascade.rules || []).forEach(function (rule) {
      if (rule.state !== to) return;
      (rule.historyConditions || []).forEach(function (condition) {
        if (condition.input === "previous.setupState" && condition.operator === "in") {
          allowed = allowed.concat(condition.value);
        }
      });
    });
    return allowed.length === 0 || allowed.indexOf(from) !== -1;
  }

  function summarise(results, activation, mapping) {
    var checks = Object.keys(results).map(function (id) { return results[id]; });
    var failed = checks.filter(function (check) { return check.state === "FAIL"; });
    var pending = checks.filter(function (check) { return check.state === "NOT_EVALUABLE"; });
    var allPass = checks.length > 0 && failed.length === 0 && pending.length === 0;
    return {
      gate: "PATH_DEPENDENT_STATES_ACTIVATION",
      mappingVersion: mapping.mappingVersion,
      contractState: activation.state || "PENDING_HISTORY",
      states: PATH_STATES.slice(),
      checks: checks,
      measuredReadiness: allPass ? "READY" : (failed.length ? "FAILED" : "PENDING_HISTORY"),
      /* Two locks. This report is only one of them, and it says so. */
      active: allPass && activation.state === "ACTIVE",
      blockedBy: failed.map(function (c) { return c.id; }).concat(pending.map(function (c) { return c.id; })),
      note: allPass
        ? "Alle Pruefungen bestanden. Die Aktivierung verlangt zusaetzlich, dass der Owner pathDependentActivation.state auf ACTIVE setzt."
        : "Das Gate bleibt geschlossen. Eine nicht auswertbare Pruefung zaehlt nicht als bestanden."
    };
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
      p: observation.pathTier ? observation.pathTier.state : "CLOSED",
      pr: observation.pathTier ? observation.pathTier.reason : "PATH_DEPENDENT_STATES_NOT_ACTIVATED",
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
      lifecycle: { state: compacted.l, availability: { state: compacted.l === null ? "UNAVAILABLE" : "AVAILABLE", reason: compacted.lr }, tier: rule ? rule.tier : null },
      pathTier: { state: compacted.p || "CLOSED", reason: compacted.p === "OPEN" ? null : (compacted.pr || "PATH_DEPENDENT_STATES_NOT_ACTIVATED") },
      matchedRule: rule ? { ruleId: rule.ruleId, order: rule.order, state: rule.state, tier: rule.tier, plain: rule.plain, predicateHash: null } : null,
      direction: compacted.d,
      pathTierOpen: compacted.p === "OPEN",
      conditions: (compacted.k || []).map(function (entry, index) {
        var source = rule ? (rule.historyConditions || []).concat(rule.filters || [])[index] : null;
        var field = source && source.field ? Catalog.field(source.field) : null;
        return {
          kind: source && source.field ? "FIELD" : "HISTORY",
          field: source ? source.field : null, input: source ? source.input : null,
          label: field ? field.label : (source ? source.input : entry[0]),
          operator: source ? source.operator : null, demand: source ? source.value : null,
          value: entry[1], met: entry[2] === 1,
          /* Aus dem veroeffentlichten Wert selbst abgeleitet, mit derselben
             Regel wie bei der Auswertung - nicht zweitens definiert. */
          measurable: (source && source.input) ? true : determinable(entry[1])
        };
      })
    };
  }

  /* =====================================================================
     WAS DIESEN ZUSTAND AENDERN WUERDE

     Die Setup-Sektion konnte bisher sagen, welcher Zustand gilt und welche
     Bedingungen der Regel dafuer erfuellt sind. Die naechste Frage eines
     Lesers stellt sie damit, beantwortet sie aber nicht: was muesste
     anders sein, damit ein anderer Zustand gilt?

     Beantwortbar ist das ohne neue Daten, weil die Kaskade jede Bedingung
     jedes Zustands benennt und die Zeile der Katalogfelder dieselbe ist,
     an der der Zustand entschieden wurde. Gerechnet wird deshalb mit
     denselben zwei Funktionen (ruleMatches, conditionsOf) und nicht mit
     einer zweiten, aehnlichen Auswertung - sonst koennte diese Ansicht
     eine Bedingung als erfuellt zeigen, die die Zuordnung nicht erfuellt
     sieht.

     Was hier NICHT passiert: eine Aussage darueber, ob ein Zustand
     eintreten WIRD, oder wie wahrscheinlich das ist. Die Funktion
     vergleicht Bedingungen mit dem heutigen Stand. Nichts anderes.

     @param {object} mapping {mappingVersion, cascade:{rules}}
     @param {object} row     die Zeile der Katalogfelder dieses Titels
     @param {object} context {close, previous}
   */
  function explainCascade(mapping, row, context) {
    var rules = (mapping && mapping.cascade && mapping.cascade.rules) || [];
    var ctx = { close: context && context.close, previous: (context && context.previous) || null };
    return rules.filter(function (rule) { return rule.always !== true; }).map(function (rule) {
      var conditions, matched, fehler = null;
      /* Eine Verlaufsbedingung ohne Vorbeobachtung ist nicht unerfuellt -
         sie ist nicht beantwortbar. Der Unterschied ist der ganze Punkt:
         "diese Bedingung gilt nicht" und "wir wissen es nicht" duerfen
         nicht dasselbe Zeichen bekommen. Die Vorbeobachtung wird ohne ihre
         Niveaus veroeffentlicht, deshalb wird auch das geprueft und nicht
         angenommen. */
      var verlangtVerlauf = (rule.historyConditions || []);
      if (verlangtVerlauf.length && !ctx.previous) fehler = "NO_PREVIOUS_OBSERVATION";
      else if (verlangtVerlauf.some(function (c) {
        var inputs = [c.input].concat(typeof c.value === "string" && c.value.indexOf("previous.") === 0 ? [c.value] : []);
        return inputs.some(function (input) {
          if (input.indexOf("previous.") !== 0) return false;
          var key = input.slice("previous.".length);
          return !ctx.previous || ctx.previous[key] === undefined;
        });
      })) fehler = "PREVIOUS_LEVEL_NOT_PUBLISHED";
      if (fehler) {
        return { ruleId: rule.ruleId, state: rule.state, order: rule.order, tier: rule.tier,
                 plain: rule.plain, matched: null, unanswerable: fehler,
                 conditions: [], met: 0, total: verlangtVerlauf.length + (rule.filters || []).length,
                 open: [] };
      }
      try {
        conditions = conditionsOf(rule, row || {}, ctx);
        matched = ruleMatches(rule, row || {}, ctx);
      } catch (e) {
        /* Eine Bedingung, die diese Fassung nicht kennt, macht die Regel
           nicht erfuellt - sie macht sie unbeantwortbar. Der Unterschied
           gehoert nach draussen, nicht in ein stilles false. */
        conditions = []; matched = null; fehler = String(e && e.message || e);
      }
      var offen = conditions.filter(function (c) { return !c.met; });
      return {
        ruleId: rule.ruleId, state: rule.state, order: rule.order, tier: rule.tier,
        plain: rule.plain, matched: matched, unanswerable: fehler,
        conditions: conditions, met: conditions.length - offen.length, total: conditions.length,
        open: offen
      };
    });
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION,
    explainCascade: explainCascade,
    UNDETERMINABLE: UNDETERMINABLE.slice(),
    determinable: determinable,
    OBSERVATION_SCHEMA: OBSERVATION_SCHEMA,
    OBSERVATION_INDEX_SCHEMA: OBSERVATION_INDEX_SCHEMA,
    SHARD_SCHEMA: SHARD_SCHEMA,
    SHARD_SCHEMAS: SHARD_SCHEMAS.slice(),
    SCREEN_INDEX_SCHEMA: SCREEN_INDEX_SCHEMA,
    STATES: STATES.slice(),
    PIT_STATES: PIT_STATES.slice(),
    PATH_STATES: PATH_STATES.slice(),
    UNAVAILABLE_REASONS: UNAVAILABLE_REASONS.slice(),
    PATH_CLOSED_REASONS: PATH_CLOSED_REASONS.slice(),
    UNIVERSE: UNIVERSE,
    validateMapping: validateMapping,
    activationGate: activationGate,
    assertMapping: assertMapping,
    predicateOfRule: predicateOfRule,
    ruleHash: ruleHash,
    screenQuery: screenQuery,
    screenIndex: screenIndex,
    reconcile: reconcile,
    assertParity: assertParity,
    evaluate: evaluate,
    publicationViolations: publicationViolations,
    assertPublishable: assertPublishable,
    compact: compact,
    hydrate: hydrate
  };

  if (isNode) module.exports = api;
  else global.VUSetupEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
