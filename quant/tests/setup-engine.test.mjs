import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import methodology from "../methodology/setup-state-v1.json" with { type: "json" };

const require = createRequire(import.meta.url);
const Setup = require("../engines/setup-engine.js");
const Rules = require("../engines/rule-contract.js");
const Query = require("../engines/query.js");
const Catalog = require("../engines/catalog.js");

const mapping = methodology.stateMapping;
const ruleOf = (id) => mapping.cascade.rules.find((rule) => rule.ruleId === id);

/* A title that satisfies everything the CONFIRMED rule asks for. Each test
   then takes exactly one thing away, so a failure names the cause. */
const confirmedRow = {
  status: "active",
  technicalTrend: "BULLISH",
  technicalConfirmedStructure: "BULLISH",
  technicalStructure: "BULLISH",
  technicalSetupStatus: "COMPLETE",
  technicalPrimaryDirection: "BULLISH",
  technicalEntryStatus: "AWAITING_TRIGGER",
  technicalVolumeState: "EXPANSION",
  technicalMomentumState: "POSITIVE",
  technicalVolatilityRegime: "NORMAL",
  technicalDistanceTo52wHigh: -0.02
};
const evaluate = (row, extra) => Setup.evaluate(Object.assign({ row, close: 100, previous: null, historyDepth: 0, methodology }, extra || {}));
/* A copy of the methodology with BOTH locks open, for the tests that need
   to see the path-dependent tier behave. Production carries the second one
   shut, and a separate test holds it that way. */
function activated() {
  const copy = structuredClone(methodology);
  copy.stateMapping.pathDependentActivation.state = "ACTIVE";
  copy.stateMapping.pathDependentActivation.checks.forEach((check) => { check.state = "PASS"; });
  return copy;
}

test("the published mapping is a valid, ordered, exhaustive cascade", () => {
  assert.deepEqual(Setup.validateMapping(methodology), { valid: true, errors: [] });
  assert.equal(mapping.cascade.semantics, "FIRST_MATCH_WINS");
  const orders = mapping.cascade.rules.map((rule) => rule.order);
  assert.deepEqual(orders, orders.slice().sort((a, b) => a - b));
  assert.equal(new Set(orders).size, orders.length);
  for (const state of Setup.STATES) {
    assert.ok(mapping.cascade.rules.some((rule) => rule.state === state), state + " unreachable");
  }
  assert.equal(mapping.cascade.rules[mapping.cascade.rules.length - 1].always, true);
});

test("every point-in-time rule is a canonical rule predicate and therefore also a screener query", () => {
  const screenable = mapping.cascade.rules.filter((rule) => rule.screenable === true);
  assert.ok(screenable.length >= 4);
  for (const rule of screenable) {
    assert.equal(rule.tier, "POINT_IN_TIME");
    const predicate = Setup.predicateOfRule(rule);
    assert.equal(Rules.validate(predicate).valid, true, rule.ruleId);
    /* Same predicate in both directions: the rule that assigns the state
       and the query that screens for it carry one identity. */
    const query = Setup.screenQuery(rule);
    assert.equal(Rules.predicateHash(Rules.fromQuery(query)), Rules.predicateHash(predicate));
    assert.ok(/^rule_[a-f0-9]{16}$/.test(Setup.ruleHash(rule)));
    for (const filter of rule.filters) assert.ok(Catalog.field(filter.field), filter.field);
  }
});

test("the rule that assigns a state selects exactly the titles that carry it", () => {
  const rule = ruleOf("setup.confirmed.structure-trend-volume");
  const matching = evaluate(confirmedRow);
  assert.equal(matching.classification.state, "CONFIRMED");
  assert.equal(Query.matches(confirmedRow, rule.filters), true);

  const weakVolume = { ...confirmedRow, technicalVolumeState: "NORMAL" };
  assert.equal(Query.matches(weakVolume, rule.filters), false);
  assert.notEqual(evaluate(weakVolume).classification.state, "CONFIRMED");
});

test("the cascade falls through in the written order and never assigns two states", () => {
  assert.equal(evaluate(confirmedRow).classification.state, "CONFIRMED");
  /* A breakout without volume participation is not a confirmation. */
  assert.equal(evaluate({ ...confirmedRow, technicalVolumeState: "NORMAL" }).classification.state, "SETUP_FORMING");
  /* No complete setup left: the trend still carries, so WATCH. */
  assert.equal(evaluate({ ...confirmedRow, technicalVolumeState: "NORMAL", technicalSetupStatus: "INCOMPLETE" }).classification.state, "WATCH");
  /* Trend gone, but confirmed structure and proximity to the high remain. */
  assert.equal(evaluate({ ...confirmedRow, technicalVolumeState: "NORMAL", technicalSetupStatus: "INCOMPLETE", technicalTrend: "NEUTRAL" }).classification.state, "WATCH");
  /* And nothing at all left. */
  const empty = { ...confirmedRow, technicalVolumeState: "NORMAL", technicalSetupStatus: "INCOMPLETE", technicalTrend: "NEUTRAL", technicalConfirmedStructure: "RANGE" };
  assert.equal(evaluate(empty).classification.state, "NO_SETUP");
  assert.equal(evaluate(empty).direction, "NEUTRAL");
});

test("the confirmed structure field is the pivot-confirmed one, not the revisable regime", () => {
  const field = Catalog.field("technicalConfirmedStructure");
  assert.ok(field);
  assert.equal(field.availability, "CURRENT_SNAPSHOT_ONLY");
  assert.equal(field.backtestEligibility, "NOT_CERTIFIED");
  assert.ok(mapping.repaintingPolicy.confirmedStructureOnly);
  assert.ok(mapping.repaintingPolicy.excludedInputs.includes("bundle.structure.state.developingPivot"));
  /* A rule that decides a state may not read the revisable regime. */
  for (const rule of mapping.cascade.rules) {
    for (const filter of rule.filters || []) assert.notEqual(filter.field, "technicalStructure", rule.ruleId);
  }
  /* And the two are genuinely different fields with different owners. */
  const revisable = { ...confirmedRow, technicalConfirmedStructure: "BEARISH", technicalStructure: "BULLISH",
    technicalTrend: "NEUTRAL", technicalSetupStatus: "INCOMPLETE", technicalVolumeState: "NORMAL" };
  assert.equal(evaluate(revisable).classification.state, "NO_SETUP");
});

test("a path-dependent state is never reconstructed from one cutoff", () => {
  const running = { ...confirmedRow, technicalEntryStatus: "ACTIVE" };
  /* Everything an ACTIVE title would show, but nothing was ever observed. */
  const withoutHistory = evaluate(running);
  assert.equal(Setup.PATH_STATES.includes(withoutHistory.classification.state), false);
  assert.equal(withoutHistory.pathTierOpen, false);
  /* The point-in-time state does publish - it claims nothing about a course
     of events. What must never appear is one of the four that does. */
  assert.equal(Setup.PATH_STATES.includes(withoutHistory.lifecycle.state), false);
  assert.equal(withoutHistory.pathTier.state, "CLOSED");
  for (const entry of withoutHistory.evaluatedRules.filter((e) => Setup.PATH_STATES.includes(e.state))) {
    assert.equal(entry.result, "NOT_EVALUABLE");
  }

  /* With an observed predecessor and an approved mapping the same title
     reaches ACTIVE - and only then. */
  const approved = activated();
  const withHistory = Setup.evaluate({
    row: running, close: 100, historyDepth: 2, methodology: approved,
    previous: { setupState: "CONFIRMED", asOf: "2026-09-15", invalidationPrice: 80, exitPrice: null }
  });
  assert.equal(withHistory.lifecycle.state, "ACTIVE");
  assert.equal(withHistory.lifecycle.availability.state, "AVAILABLE");
  assert.equal(withHistory.matchedRule.ruleId, "setup.active.entry-zone-running");
});

test("invalidation is measured against the level that was published then, not one computed now", () => {
  const approved = activated();
  const previous = { setupState: "CONFIRMED", asOf: "2026-09-15", invalidationPrice: 95, exitPrice: 130 };
  const broken = Setup.evaluate({ row: confirmedRow, close: 94.5, historyDepth: 2, methodology: approved, previous });
  assert.equal(broken.lifecycle.state, "INVALIDATED");
  assert.equal(broken.conditions.find((c) => c.input === "close").value, 94.5);
  assert.equal(broken.conditions.find((c) => c.input === "close").demand, "previous.invalidationPrice");

  const intact = Setup.evaluate({ row: confirmedRow, close: 95.5, historyDepth: 2, methodology: approved, previous });
  assert.notEqual(intact.lifecycle.state, "INVALIDATED");

  /* A previous observation without a recorded exit level cannot produce EXIT. */
  const noExit = Setup.evaluate({ row: { ...confirmedRow, technicalEntryStatus: "ACTIVE" }, close: 999, historyDepth: 2,
    methodology: approved, previous: { setupState: "ACTIVE", asOf: "2026-09-15", invalidationPrice: 80, exitPrice: null } });
  assert.notEqual(noExit.lifecycle.state, "EXIT");
});

test("a title without complete technical evidence gets no state, and specifically not NO_SETUP", () => {
  const blind = { ...confirmedRow, technicalTrend: null, technicalConfirmedStructure: null };
  const result = evaluate(blind);
  assert.equal(result.classification.state, "UNAVAILABLE");
  assert.equal(result.classification.reason, "SETUP_INPUTS_INCOMPLETE");
  assert.deepEqual(result.classification.missing, ["technicalTrend", "technicalConfirmedStructure"]);
  assert.equal(result.lifecycle.state, null);
  assert.equal(evaluate({ ...confirmedRow }, { close: null }).classification.reason, "SETUP_INPUTS_INCOMPLETE");
});

test("the approved mapping publishes the point-in-time states on their own evidence", () => {
  assert.equal(mapping.approval.state, "APPROVED");
  assert.ok(mapping.approval.approvedBy);
  assert.ok(mapping.approval.approvedAt);
  assert.equal(methodology.gateStatus.SETUP_MAPPING_V1_APPROVED, "PASS");
  assert.equal(methodology.gateStatus.SNAPSHOT_STATES_ACTIVE, "PASS");
  /* No history at all, and the state still publishes: a point-in-time
     state makes no claim about a course of events, so it needs none. */
  const result = evaluate(confirmedRow);
  assert.equal(result.lifecycle.availability.state, "AVAILABLE");
  assert.equal(result.lifecycle.state, "CONFIRMED");
  assert.equal(result.lifecycle.tier, "POINT_IN_TIME");
  assert.deepEqual(Setup.publicationViolations(result), []);
});

test("the path-dependent tier stays shut although the methodology is approved", () => {
  assert.equal(mapping.pathDependentActivation.state, "PENDING_HISTORY");
  assert.equal(methodology.gateStatus.PATH_DEPENDENT_STATES_ACTIVE, false);
  assert.equal(methodology.gateStatus.PATH_DEPENDENT_STATES_GATE, "PENDING_HISTORY");

  /* Everything an ACTIVE title would show, and abundant history: the four
     states are still not considered, because the second lock is shut. */
  const running = { ...confirmedRow, technicalEntryStatus: "ACTIVE" };
  const result = Setup.evaluate({ row: running, close: 100, historyDepth: 50, methodology,
    previous: { setupState: "CONFIRMED", asOf: "2026-09-15", invalidationPrice: 80, exitPrice: null } });
  assert.equal(result.pathTier.state, "CLOSED");
  assert.equal(result.pathTier.reason, "PATH_DEPENDENT_STATES_NOT_ACTIVATED");
  assert.equal(Setup.PATH_STATES.includes(result.lifecycle.state), false);
  assert.equal(result.lifecycle.state, "CONFIRMED");
  for (const entry of result.evaluatedRules.filter((e) => Setup.PATH_STATES.includes(e.state))) {
    assert.equal(entry.result, "NOT_EVALUABLE");
  }
  assert.deepEqual(Setup.publicationViolations(result), []);
});

test("a path-dependent state published while its tier is closed is refused", () => {
  const honest = evaluate(confirmedRow);
  const smuggled = structuredClone(honest);
  smuggled.lifecycle = { state: "ACTIVE", availability: { state: "AVAILABLE", reason: null }, tier: "PATH_DEPENDENT" };
  assert.ok(Setup.publicationViolations(smuggled).some((e) => e.includes("published while the path tier is closed")));

  const untyped = structuredClone(honest);
  untyped.pathTier = { state: "CLOSED", reason: "because" };
  assert.ok(Setup.publicationViolations(untyped).includes("a closed path tier without a typed reason"));
});

test("the contract may not stand the path tier open while a check has not passed", () => {
  const forced = structuredClone(methodology);
  forced.stateMapping.pathDependentActivation.state = "ACTIVE";
  const errors = Setup.validateMapping(forced).errors.join("; ");
  assert.match(errors, /path tier is ACTIVE while check/);
  /* And with every check passing, the contract is valid again - the switch
     alone is not enough, and the measurement alone is not enough either. */
  const earned = structuredClone(forced);
  earned.stateMapping.pathDependentActivation.checks.forEach((check) => { check.state = "PASS"; });
  assert.equal(Setup.validateMapping(earned).valid, true);
});

test("the activation gate measures the seven checks and never opens itself", () => {
  const empty = Setup.activationGate([], methodology);
  assert.equal(empty.checks.length, 7);
  assert.equal(empty.active, false);
  assert.equal(empty.measuredReadiness, "PENDING_HISTORY");
  for (const check of empty.checks) assert.equal(check.state, "NOT_EVALUABLE", check.id);

  /* One snapshot: integrity is checkable, a course of events is not. */
  const single = Setup.activationGate([{ asOf: "2026-09-10", contentHashValid: true, rows: { AAA: ["WATCH", 80, null] } }], methodology);
  assert.equal(single.checks.find((c) => c.id === "NO_RETROACTIVE_STATE_CHANGE").state, "PASS");
  assert.equal(single.checks.find((c) => c.id === "TRANSITION_MATRIX").state, "NOT_EVALUABLE");
  assert.equal(single.active, false);

  /* A corrupted stored file fails the integrity check outright. */
  const corrupt = Setup.activationGate([{ asOf: "2026-09-10", contentHashValid: false, rows: {} }], methodology);
  assert.equal(corrupt.checks.find((c) => c.id === "NO_RETROACTIVE_STATE_CHANGE").state, "FAIL");
  assert.equal(corrupt.measuredReadiness, "FAILED");

  /* Even a series where every check passes does not open the gate on its
     own: the contract state is the second lock. */
  const series = [];
  for (let i = 0; i < 14; i++) {
    const day = String(10 + i).padStart(2, "0");
    series.push({ asOf: "2026-0" + (i < 20 ? "9" : "9") + "-" + day, contentHashValid: true,
      rows: { AAA: [i < 7 ? "CONFIRMED" : "ACTIVE", 80, 130] } });
  }
  const rich = Setup.activationGate(series, methodology);
  assert.equal(rich.active, false, "the report must never open the gate by itself");
  assert.equal(rich.contractState, "PENDING_HISTORY");
});

test("a point-in-time state never implies the path tier was considered", () => {
  /* The difference a reader has to be able to see: the lifecycle is
     available AND the four course-of-events states were not examined. */
  const result = evaluate(confirmedRow);
  assert.equal(result.lifecycle.availability.state, "AVAILABLE");
  assert.equal(result.pathTier.state, "CLOSED");
  assert.ok(Setup.PATH_CLOSED_REASONS.includes(result.pathTier.reason));
});

test("the publication gate refuses an invented lifecycle, an outcome claim and an untyped closure", () => {
  const honest = evaluate(confirmedRow);
  assert.deepEqual(Setup.publicationViolations(honest), []);

  const invented = structuredClone(honest);
  invented.lifecycle = { state: "ACTIVE", availability: { state: "AVAILABLE", reason: null }, tier: "PATH_DEPENDENT" };
  assert.ok(Setup.publicationViolations(invented).some((e) => e.includes("published while the path tier is closed")));

  const claiming = structuredClone(honest);
  claiming.successRate = 0.62;
  assert.ok(Setup.publicationViolations(claiming).includes("forbidden field 'successRate'"));

  const untyped = structuredClone(honest);
  untyped.lifecycle = { state: null, availability: { state: "UNAVAILABLE", reason: "because" } };
  assert.ok(Setup.publicationViolations(untyped).includes("unavailable lifecycle without a typed reason"));

  const smuggled = structuredClone(honest);
  smuggled.classification = { state: "ACTIVE", reason: null, missing: [] };
  assert.ok(Setup.publicationViolations(smuggled).includes("classification may only carry a point-in-time state"));

  assert.throws(() => Setup.assertPublishable(invented), /not publishable/);
});

test("a mapping that would decide a path state without history, or leave a state unreachable, is refused", () => {
  const cheating = structuredClone(methodology);
  cheating.stateMapping.cascade.rules.find((rule) => rule.ruleId === "setup.active.entry-zone-running").historyConditions = [];
  assert.match(Setup.validateMapping(cheating).errors.join("; "), /would be decidable today/);

  const unreachable = structuredClone(methodology);
  unreachable.stateMapping.cascade.rules = unreachable.stateMapping.cascade.rules.filter((rule) => rule.state !== "EXIT");
  assert.match(Setup.validateMapping(unreachable).errors.join("; "), /'EXIT' is unreachable/);

  const unknownField = structuredClone(methodology);
  unknownField.stateMapping.cascade.rules[5].filters.push({ field: "quantV2.factorEvidence.composite", operator: "gte", value: 80 });
  assert.match(Setup.validateMapping(unknownField).errors.join("; "), /unknown field 'quantV2.factorEvidence.composite'/);

  const openEnded = structuredClone(methodology);
  openEnded.stateMapping.cascade.rules[openEnded.stateMapping.cascade.rules.length - 1].always = false;
  assert.match(Setup.validateMapping(openEnded).errors.join("; "), /must end in a rule that always matches/);
});

test("the wire format survives a round trip without gaining or losing meaning", () => {
  const observation = evaluate(confirmedRow);
  const restored = Setup.hydrate(Setup.compact(observation), mapping);
  assert.equal(restored.classification.state, observation.classification.state);
  assert.equal(restored.lifecycle.state, observation.lifecycle.state);
  assert.equal(restored.lifecycle.availability.reason, observation.lifecycle.availability.reason);
  assert.equal(restored.matchedRule.ruleId, observation.matchedRule.ruleId);
  assert.deepEqual(restored.conditions.map((c) => [c.field, c.value, c.met]), observation.conditions.map((c) => [c.field, c.value, c.met]));
  assert.deepEqual(Setup.publicationViolations(restored), []);
});
