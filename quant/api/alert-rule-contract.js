/* Internal alert evaluation over the canonical rule predicate.
 * No subscription storage, scheduling, notification delivery or public API. */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var Rules = isNode ? require("../engines/rule-contract.js") : global.VURuleContract;
  var Hash = isNode ? require("../engines/hash.js") : global.VUHash;

  function create(input) {
    input = input || {};
    if (typeof input.alertId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(input.alertId)) throw new Error("INVALID_ALERT_ID");
    var predicate = Rules.assertValid(input.predicate);
    return Object.freeze({
      schemaVersion: "1.0",
      alertId: input.alertId,
      predicate: JSON.parse(JSON.stringify(predicate)),
      predicateHash: Rules.predicateHash(predicate),
      delivery: "NOT_CONFIGURED"
    });
  }

  function evaluate(alert, previous, current, context) {
    if (!alert || alert.predicateHash !== Rules.predicateHash(alert.predicate)) throw new Error("INVALID_ALERT_RULE");
    var transition = Rules.transition(previous, current, alert.predicate);
    if (!transition) return null;
    context = context || {};
    var observedAt = context.observedAt || null;
    return {
      id: Hash.prefixedHash("alert", { alertId: alert.alertId, predicateHash: alert.predicateHash, transition: transition, observedAt: observedAt }),
      alertId: alert.alertId,
      predicateHash: alert.predicateHash,
      transition: transition,
      observedAt: observedAt,
      delivery: "NOT_CONFIGURED"
    };
  }

  var api = { create: create, evaluate: evaluate };
  if (isNode) module.exports = api;
  else global.VUAlertRuleContract = api;
})(typeof window !== "undefined" ? window : globalThis);
