/* =========================================================================
   VISION UNIVERSE QUANT 2.0 — RETURN SEMANTICS v1

   Two questions, two bases. How did the PRICE move, and what did an
   INVESTOR earn. One series cannot answer both, and the confusion goes
   unnoticed because both answers look like a price.

   THE FAILURE THIS PREVENTS

   market-factors.priceBasis() chose adjustedClose whenever a trustworthy
   adjusted column existed - split-adjusted or total-return, it did not
   distinguish. The provider's capability currently reports splitAdjusted,
   so everything computes on split-adjusted prices today. Raise that
   capability to "adjusted" and technical structure, setup states and the
   momentum factor would switch to total return without one line of code
   changing and without one published number announcing it.

   So a module no longer takes the best available column. It declares the
   basis it needs, and a series that cannot serve it is refused rather
   than silently substituted.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;

  var ENGINE_VERSION = "vu-return-semantics-1.0.0";
  var MISMATCH = "RETURN_BASIS_MISMATCH";
  /* Not a basis: a marker that the module is out of scope for this
     contract, and for two different reasons that must not be merged. */
  var LEGACY = "LEGACY_IMMUTABLE";
  var PENDING = "PENDING_METHODOLOGY_DECISION";
  /* A module whose CURRENT basis has not been measured. Different from
     PENDING, which is about the future decision: this is about not
     knowing what is published today. Naming a basis here would be a
     guess wearing a contract's clothes. */
  var UNMEASURED = "UNKNOWN_UNTIL_MEASURED";

  var contract = null;

  function load(document) {
    contract = document;
    var result = validate(document);
    if (!result.valid) throw new Error("Invalid return semantics contract: " + result.errors.join("; "));
    return contract;
  }

  function ready() {
    if (!contract) throw new Error("return-semantics: contract not loaded");
    return contract;
  }

  function validate(document) {
    var errors = [];
    if (!document || typeof document !== "object") return { valid: false, errors: ["contract must be an object"] };
    if (!Array.isArray(document.bases) || !document.bases.length) errors.push("no bases");
    if (!Array.isArray(document.modules) || !document.modules.length) errors.push("no modules");
    if (errors.length) return { valid: false, errors: errors };

    var byId = {};
    document.bases.forEach(function (basis) {
      if (byId[basis.id]) errors.push("duplicate basis '" + basis.id + "'");
      byId[basis.id] = basis;
      if (typeof basis.column !== "string" || !basis.column) errors.push(basis.id + ": no column");
      if (typeof basis.includesDistributions !== "boolean") errors.push(basis.id + ": includesDistributions missing");
      if (!basis.why || basis.why.length < 40) errors.push(basis.id + ": no reason given");
    });

    var seen = {};
    document.modules.forEach(function (entry) {
      var where = "module '" + entry.id + "'";
      if (seen[entry.id]) errors.push(where + ": duplicate");
      seen[entry.id] = true;
      if (entry.basis !== LEGACY && entry.basis !== PENDING && !byId[entry.basis]) {
        errors.push(where + ": unknown basis '" + entry.basis + "'");
      }
      /* A module without a stated reason is a number nobody can argue
         with, which is the opposite of what a written contract is for. */
      if (!entry.why || entry.why.length < 40) errors.push(where + ": no reason given");
      if (entry.basis === PENDING) {
        if (!entry.decision || !entry.decision.report) errors.push(where + ": pending without a report to decide from");
        var current = entry.decision && entry.decision.currentPublishedBasis;
        if (current !== UNMEASURED && !byId[current]) {
          errors.push(where + ": pending without a valid published basis to keep meanwhile");
        }
        /* If the current basis is unmeasured the module must not be bound,
           or the binding would impose the answer it is waiting for. */
        if (current === UNMEASURED && entry.decision.boundToContract !== false) {
          errors.push(where + ": the current basis is unmeasured, so it must not be bound to the contract");
        }
        if (current === UNMEASURED && !entry.decision.whyNotBound) {
          errors.push(where + ": unmeasured without saying why it is not bound");
        }
      }
    });
    return { valid: errors.length === 0, errors: errors };
  }

  function moduleEntry(id) {
    var document = ready();
    for (var i = 0; i < document.modules.length; i++) {
      if (document.modules[i].id === id) return document.modules[i];
    }
    throw new Error("return-semantics: no module '" + id + "'");
  }

  function basisEntry(id) {
    var document = ready();
    for (var i = 0; i < document.bases.length; i++) {
      if (document.bases[i].id === id) return document.bases[i];
    }
    throw new Error("return-semantics: no basis '" + id + "'");
  }

  /**
   * The basis a module must compute on. A module whose basis is still
   * being decided keeps the one it publishes today: leaving it unresolved
   * would make every caller invent an answer.
   */
  function requiredBasis(moduleId) {
    var entry = moduleEntry(moduleId);
    if (entry.basis === LEGACY) return LEGACY;
    if (entry.basis === PENDING) {
      var current = entry.decision.currentPublishedBasis;
      /* Refused, not guessed. A caller that gets a basis back will compute
         on it; handing one out for a module whose published basis nobody
         has measured is how an assumption becomes a published number. */
      if (current === UNMEASURED) {
        throw new Error("return-semantics: the current basis of '" + moduleId +
          "' has not been measured; it must not be bound until it is");
      }
      return current;
    }
    return entry.basis;
  }

  function isUnmeasured(moduleId) {
    var entry = moduleEntry(moduleId);
    return entry.basis === PENDING && entry.decision.currentPublishedBasis === UNMEASURED;
  }

  function isPending(moduleId) { return moduleEntry(moduleId).basis === PENDING; }
  function isLegacy(moduleId) { return moduleEntry(moduleId).basis === LEGACY; }

  /**
   * Which basis a provider's adjustment status can actually serve. This is
   * the point the contract turns on: "adjusted" means total return and
   * must NOT be handed to a module that asked for a price series.
   */
  function basisOfAdjustmentStatus(status) {
    var document = ready();
    for (var i = 0; i < document.bases.length; i++) {
      var basis = document.bases[i];
      if ((basis.requiresAdjustmentStatus || []).indexOf(status) !== -1) return basis.id;
    }
    return "RAW_PRICE";
  }

  /**
   * The column a module may read, or a refusal. Never a fallback to
   * whatever happens to be present: substituting a basis is the failure
   * this engine exists to prevent.
   */
  function resolveColumn(moduleId, adjustmentStatus, hasAdjustedColumn) {
    if (isLegacy(moduleId)) {
      return { ok: false, reason: "MODULE_IS_LEGACY_IMMUTABLE", column: null, basis: LEGACY };
    }
    var wanted = requiredBasis(moduleId);
    var served = basisOfAdjustmentStatus(adjustmentStatus);
    if (wanted === "RAW_PRICE") return { ok: true, column: "close", basis: "RAW_PRICE", served: served };
    if (served !== wanted) {
      return { ok: false, reason: MISMATCH, column: null, basis: wanted, served: served };
    }
    if (!hasAdjustedColumn) {
      return { ok: false, reason: "ADJUSTED_COLUMN_MISSING", column: null, basis: wanted, served: served };
    }
    return { ok: true, column: basisEntry(wanted).column, basis: wanted, served: served };
  }

  function assertBasis(moduleId, adjustmentStatus, hasAdjustedColumn) {
    var resolved = resolveColumn(moduleId, adjustmentStatus, hasAdjustedColumn);
    if (!resolved.ok) {
      throw new Error("return basis refused for '" + moduleId + "': " + resolved.reason +
        " (wanted " + resolved.basis + ", the series serves " + (resolved.served || "nothing") + ")");
    }
    return resolved;
  }

  /* Modules grouped by what they answer, for a reader and for a test that
     wants to assert the split rather than restate it. */
  function modulesByBasis(basisId) {
    return ready().modules.filter(function (entry) { return entry.basis === basisId; })
      .map(function (entry) { return entry.id; });
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION,
    MISMATCH: MISMATCH,
    LEGACY: LEGACY,
    PENDING: PENDING,
    UNMEASURED: UNMEASURED,
    load: load,
    validate: validate,
    moduleEntry: moduleEntry,
    basisEntry: basisEntry,
    requiredBasis: requiredBasis,
    isPending: isPending,
    isUnmeasured: isUnmeasured,
    isLegacy: isLegacy,
    basisOfAdjustmentStatus: basisOfAdjustmentStatus,
    resolveColumn: resolveColumn,
    assertBasis: assertBasis,
    modulesByBasis: modulesByBasis
  };

  if (isNode) {
    api.load(require("../methodology/return-semantics-v1.json"));
    module.exports = api;
  } else {
    global.VUReturnSemantics = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
