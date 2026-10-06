/* =========================================================================
   VISION UNIVERSE QUANT — canonical rule contract v1

   A rule is only the stock-selection predicate: universe + filters. Sort,
   limit, delivery channel and portfolio constraints are consumers of that
   predicate and must not change its identity.

   Query remains the sole validator and evaluator. This module adds stable
   cross-product identity and transition semantics; it does not calculate a
   metric, load data, deliver alerts or enable a real backtest.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var Query = isNode ? require("./query.js") : global.VUQuery;
  var Hash = isNode ? require("./hash.js") : global.VUHash;
  var SCHEMA_VERSION = "1.0";
  var TYPE = "stock_selection";
  var ALLOWED_KEYS = ["schemaVersion", "type", "universe", "filters"];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function create(partial) {
    partial = partial || {};
    var query = Query.createQuery({
      universe: partial.universe,
      filters: partial.filters || [],
      sort: [{ field: "quantScore", direction: "desc" }],
      limit: 1
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      type: TYPE,
      universe: clone(query.universe),
      filters: clone(query.filters)
    };
  }

  function validate(predicate) {
    var errors = [];
    if (!predicate || typeof predicate !== "object" || Array.isArray(predicate)) {
      return { valid: false, errors: ["predicate must be an object"], warnings: [] };
    }
    Object.keys(predicate).forEach(function (key) {
      if (ALLOWED_KEYS.indexOf(key) === -1) errors.push("unknown predicate field '" + key + "'");
    });
    if (predicate.schemaVersion !== SCHEMA_VERSION) errors.push("schemaVersion: expected '" + SCHEMA_VERSION + "'");
    if (predicate.type !== TYPE) errors.push("type: expected '" + TYPE + "'");
    var queryValidation;
    try {
      var query = Query.createQuery({
        universe: predicate.universe,
        filters: predicate.filters,
        sort: [{ field: "quantScore", direction: "desc" }],
        limit: 1
      });
      queryValidation = Query.validate(query);
      queryValidation.errors.forEach(function (error) {
        if (error.indexOf("filters") === 0 || error.indexOf("universe") === 0) errors.push(error);
      });
    } catch (error) {
      errors.push("predicate shape: " + error.message);
      queryValidation = { warnings: [] };
    }
    return { valid: errors.length === 0, errors: errors, warnings: queryValidation.warnings };
  }

  function assertValid(predicate) {
    var result = validate(predicate);
    if (!result.valid) throw new Error("Invalid rule predicate: " + result.errors.join("; "));
    return predicate;
  }

  function fromQuery(query) {
    var validation = Query.validate(query);
    if (!validation.valid) throw new Error("Invalid query: " + validation.errors.join("; "));
    return create({ universe: query.universe, filters: query.filters });
  }

  function toQuery(predicate, presentation) {
    assertValid(predicate);
    presentation = presentation || {};
    var query = Query.createQuery({
      universe: predicate.universe,
      filters: predicate.filters,
      sort: presentation.sort || [{ field: "quantScore", direction: "desc" }],
      limit: presentation.limit === undefined ? 50 : presentation.limit
    });
    var validation = Query.validate(query);
    if (!validation.valid) throw new Error("Invalid rule presentation: " + validation.errors.join("; "));
    return query;
  }

  function predicateHash(predicate) {
    assertValid(predicate);
    return Hash.prefixedHash("rule", predicate);
  }

  function matches(row, predicate) {
    assertValid(predicate);
    return Query.matches(row, predicate.filters);
  }

  function transition(previous, current, predicate) {
    var before = matches(previous, predicate);
    var after = matches(current, predicate);
    if (before === after) return null;
    return after ? "ENTERED" : "EXITED";
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    TYPE: TYPE,
    create: create,
    validate: validate,
    assertValid: assertValid,
    fromQuery: fromQuery,
    toQuery: toQuery,
    predicateHash: predicateHash,
    matches: matches,
    transition: transition
  };

  if (isNode) module.exports = api;
  else global.VURuleContract = api;
})(typeof window !== "undefined" ? window : globalThis);
