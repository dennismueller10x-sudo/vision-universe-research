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
  assert.equal(withoutHistory.lifecycle.state, null);
  for (const entry of withoutHistory.evaluatedRules.filter((e) => Setup.PATH_STATES.includes(e.state))) {
    assert.equal(entry.result, "NOT_EVALUABLE");
  }

  /* With an observed predecessor and an approved mapping the same title
     reaches ACTIVE - and only then. */
  const approved = structuredClone(methodology);
  approved.stateMapping.approval = { ...approved.stateMapping.approval, state: "APPROVED", approvedBy: "test", approvedAt: "2026-09-22T00:00:00.000Z" };
  const withHistory = Setup.evaluate({
    row: running, close: 100, historyDepth: 2, methodology: approved,
    previous: { setupState: "CONFIRMED", asOf: "2026-09-15", invalidationPrice: 80, exitPrice: null }
  });
  assert.equal(withHistory.lifecycle.state, "ACTIVE");
  assert.equal(withHistory.lifecycle.availability.state, "AVAILABLE");
  assert.equal(withHistory.matchedRule.ruleId, "setup.active.entry-zone-running");
});

test("invalidation is measured against the level that was published then, not one computed now", () => {
  const approved = structuredClone(methodology);
  approved.stateMapping.approval = { ...approved.stateMapping.approval, state: "APPROVED", approvedBy: "test", approvedAt: "2026-09-22T00:00:00.000Z" };
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

test("the lifecycle stays closed while the owner has not approved the mapping", () => {
  assert.equal(mapping.approval.state, "PENDING_OWNER");
  assert.equal(methodology.status, "SPECIFIED_NOT_ACTIVE");
  assert.equal(methodology.publication.enabled, false);
  const result = Setup.evaluate({ row: { ...confirmedRow, technicalEntryStatus: "ACTIVE" }, close: 100, historyDepth: 5,
    methodology, previous: { setupState: "CONFIRMED", asOf: "2026-09-15", invalidationPrice: 80, exitPrice: null } });
  assert.equal(result.lifecycle.state, null);
  assert.equal(result.lifecycle.availability.reason, "SETUP_MAPPING_NOT_APPROVED");
});

test("the publication gate refuses an invented lifecycle, an outcome claim and an untyped closure", () => {
  const honest = evaluate(confirmedRow);
  assert.deepEqual(Setup.publicationViolations(honest), []);

  const invented = structuredClone(honest);
  invented.lifecycle = { state: "ACTIVE", availability: { state: "AVAILABLE", reason: null } };
  assert.ok(Setup.publicationViolations(invented).includes("available lifecycle without ordered observation history"));

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
