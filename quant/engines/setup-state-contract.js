/* Canonical product SetupState observation contract.
 * This is a projection over the existing Rule Contract and evidence. It is
 * not a second evaluator. Until the versioned mapping and ordered real
 * snapshot history exist, observations deliberately remain unavailable. */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var Hash = isNode ? require("./hash.js") : global.VUHash;

  var SCHEMA_VERSION = "1.0.0";
  var CONTRACT_VERSION = "setup-state-1.0.0";
  var AVAILABLE_OBSERVATIONS_ALLOWED = false;
  var STATES = ["NO_SETUP", "WATCH", "SETUP_FORMING", "CONFIRMED", "ACTIVE", "RISK_RISING", "INVALIDATED", "EXIT"];
  var TOP_KEYS = ["schemaVersion", "contractVersion", "setupStateId", "availability", "identity", "observedAt", "asOf", "dataCutoff", "setupState", "previousSetupState", "transitionObservedAt", "direction", "timeHorizon", "whyNow", "entryCondition", "confirmation", "invalidation", "risk", "exitCondition", "ruleRefs", "strategyRef", "technicalRef", "evidenceRefs", "provenance", "backtestCertification", "contentHash"];
  var UNAVAILABLE_REASONS = ["SETUP_STATE_MAPPING_NOT_ACTIVE", "SETUP_STATE_HISTORY_NOT_MATERIALIZED", "INVALID_SETUP_STATE_EVIDENCE"];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function iso(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function date(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value; }
  function identityValid(value) { return !!value && /^vu_[a-f0-9]{14}$/.test(value.instrumentId || "") && /^ref_[A-Z0-9._-]+$/.test(value.securityId || "") && /^[A-Z0-9.-]{1,12}$/.test(value.ticker || ""); }
  function provenanceValid(value) { return !!value && value.dataMode === "real" && value.isMock === false && typeof value.source === "string" && value.source.length > 0 && typeof value.dataVersion === "string" && value.dataVersion.length > 0 && value.methodologyVersions && typeof value.methodologyVersions === "object" && typeof value.parametersHash === "string" && /^[a-f0-9]{16}$/.test(value.parametersHash); }
  function technicalRefValid(value) { return value === null || (!!value && /^snap_[a-f0-9]{16}$/.test(value.snapshotId || "") && /^sc_[a-f0-9]{16}$/.test(value.scenarioId || "") && /^ts_[a-f0-9]{16}$/.test(value.setupId || "")); }
  function ruleRefValid(value) { return !!value && typeof value.ruleId === "string" && value.ruleId.length > 0 && /^\d+\.\d+\.\d+$/.test(value.ruleVersion || "") && /^rule_[a-f0-9]{16}$/.test(value.predicateHash || ""); }
  function core(value) {
    var out = {};
    TOP_KEYS.filter(function (key) { return key !== "setupStateId" && key !== "contentHash"; }).forEach(function (key) { out[key] = value[key]; });
    return out;
  }
  function seal(value) {
    var payload = core(value);
    value.contentHash = Hash.hashValue(payload);
    value.setupStateId = Hash.prefixedHash("setup", { identity: payload.identity, observedAt: payload.observedAt, asOf: payload.asOf, dataCutoff: payload.dataCutoff, contractVersion: payload.contractVersion, contentHash: value.contentHash });
    return value;
  }
  function validate(value) {
    var errors = [];
    if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["contract must be an object"] };
    Object.keys(value).forEach(function (key) { if (TOP_KEYS.indexOf(key) === -1) errors.push("unknown field '" + key + "'"); });
    if (value.schemaVersion !== SCHEMA_VERSION) errors.push("invalid schemaVersion");
    if (value.contractVersion !== CONTRACT_VERSION) errors.push("invalid contractVersion");
    if (!identityValid(value.identity)) errors.push("invalid identity");
    if (!iso(value.observedAt) || !date(value.asOf) || !date(value.dataCutoff)) errors.push("invalid observation time");
    if (iso(value.observedAt) && date(value.asOf) && value.asOf > value.observedAt.slice(0, 10)) errors.push("future asOf");
    if (date(value.dataCutoff) && date(value.asOf) && value.dataCutoff > value.asOf) errors.push("dataCutoff after asOf");
    if (!provenanceValid(value.provenance)) errors.push("invalid provenance");
    if (!value.availability || ["AVAILABLE", "UNAVAILABLE"].indexOf(value.availability.state) === -1) errors.push("invalid availability");
    if (value.availability && value.availability.state === "UNAVAILABLE") {
      if (UNAVAILABLE_REASONS.indexOf(value.availability.reason) === -1) errors.push("invalid unavailability reason");
      if (value.setupState !== null || value.previousSetupState !== null || value.transitionObservedAt !== null) errors.push("unavailable lifecycle must be null");
      if (value.direction !== null || value.timeHorizon !== null || value.whyNow !== null || value.entryCondition !== null || value.confirmation !== null || value.invalidation !== null || value.risk !== null || value.exitCondition !== null) errors.push("unavailable meaning must be null");
      if (!Array.isArray(value.ruleRefs) || value.ruleRefs.length || value.strategyRef !== null) errors.push("unavailable rule binding must be empty");
    } else {
      if (!AVAILABLE_OBSERVATIONS_ALLOWED) errors.push("setup-state methodology is not active");
      if (STATES.indexOf(value.setupState) === -1) errors.push("invalid setupState");
      if (["BULLISH", "BEARISH", "NEUTRAL"].indexOf(value.direction) === -1 || typeof value.timeHorizon !== "string" || !value.timeHorizon) errors.push("invalid available context");
      ["whyNow", "entryCondition", "confirmation", "invalidation", "risk", "exitCondition"].forEach(function (key) { if (!value[key] || typeof value[key] !== "object") errors.push("missing " + key); });
      if (!Array.isArray(value.ruleRefs) || !value.ruleRefs.length || value.ruleRefs.some(function (ref) { return !ruleRefValid(ref); })) errors.push("invalid ruleRefs");
      if (!Array.isArray(value.evidenceRefs) || !value.evidenceRefs.length) errors.push("missing evidenceRefs");
    }
    if (value.previousSetupState !== null && STATES.indexOf(value.previousSetupState) === -1) errors.push("invalid previousSetupState");
    if (value.transitionObservedAt !== null && !iso(value.transitionObservedAt)) errors.push("invalid transitionObservedAt");
    if (!Array.isArray(value.ruleRefs) || !Array.isArray(value.evidenceRefs) || value.evidenceRefs.some(function (ref) { return typeof ref !== "string" || !ref; })) errors.push("invalid references");
    if (!technicalRefValid(value.technicalRef)) errors.push("invalid technicalRef");
    if (value.backtestCertification !== "NOT_CERTIFIED") errors.push("invalid backtest certification");
    if (typeof value.contentHash !== "string" || value.contentHash !== Hash.hashValue(core(value))) errors.push("contentHash mismatch");
    if (typeof value.setupStateId !== "string" || value.setupStateId !== Hash.prefixedHash("setup", { identity: value.identity, observedAt: value.observedAt, asOf: value.asOf, dataCutoff: value.dataCutoff, contractVersion: value.contractVersion, contentHash: value.contentHash })) errors.push("setupStateId mismatch");
    return { valid: errors.length === 0, errors: errors };
  }
  function unavailable(input, reason) {
    input = clone(input || {});
    var value = {
      schemaVersion: SCHEMA_VERSION, contractVersion: CONTRACT_VERSION, setupStateId: null,
      availability: { state: "UNAVAILABLE", reason: reason || "SETUP_STATE_MAPPING_NOT_ACTIVE" }, identity: input.identity,
      observedAt: input.observedAt, asOf: input.asOf, dataCutoff: input.dataCutoff,
      setupState: null, previousSetupState: null, transitionObservedAt: null,
      direction: null, timeHorizon: null, whyNow: null, entryCondition: null, confirmation: null,
      invalidation: null, risk: null, exitCondition: null, ruleRefs: [], strategyRef: null,
      technicalRef: input.technicalRef || null, evidenceRefs: input.evidenceRefs || [], provenance: input.provenance,
      backtestCertification: "NOT_CERTIFIED", contentHash: null
    };
    seal(value);
    var result = validate(value);
    if (!result.valid) throw new Error("Invalid SetupState observation: " + result.errors.join("; "));
    return value;
  }
  function fromCurrentSnapshot(input) {
    return unavailable(input, "SETUP_STATE_HISTORY_NOT_MATERIALIZED");
  }

  var api = { SCHEMA_VERSION: SCHEMA_VERSION, CONTRACT_VERSION: CONTRACT_VERSION, AVAILABLE_OBSERVATIONS_ALLOWED: AVAILABLE_OBSERVATIONS_ALLOWED, STATES: STATES.slice(), UNAVAILABLE_REASONS: UNAVAILABLE_REASONS.slice(), validate: validate, unavailable: unavailable, fromCurrentSnapshot: fromCurrentSnapshot };
  if (isNode) module.exports = api;
  else global.VUSetupStateContract = api;
})(typeof window !== "undefined" ? window : globalThis);
