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

/* =========================================================================
   The screening side: which titles stand in a state, and the proof that
   the answer is the cascade's own.
   ========================================================================= */

/* Three rows that separate the cascade from the raw predicate. `confirmed`
   satisfies the CONFIRMED rule AND the WATCH rule; `watching` satisfies only
   WATCH; `quiet` satisfies neither. */
const screenRows = [
  { ticker: "CONF", ...confirmedRow },
  { ticker: "WTCH", ...confirmedRow, technicalSetupStatus: "NONE", technicalEntryStatus: "NO_TRIGGER", technicalVolumeState: "CONTRACTION" },
  { ticker: "QUIET", ...confirmedRow, technicalTrend: "BEARISH", technicalConfirmedStructure: "BEARISH", technicalStructure: "BEARISH", technicalSetupStatus: "NONE", technicalEntryStatus: "NO_TRIGGER", technicalVolumeState: "CONTRACTION" }
];
const assignmentsFor = (rows) => rows.map((row) => {
  const observation = evaluate(row);
  return { ticker: row.ticker, ruleId: observation.matchedRule.ruleId, state: observation.matchedRule.state, sort: row.technicalDistanceTo52wHigh };
});

test("the state index publishes the cascade's assignment, not the raw predicate", () => {
  /* This is the whole point. CONF satisfies the WATCH predicate too, but it
     is CONFIRMED - a screener that shipped the predicate would list it in
     both, and one of the two listings would be a lie. */
  const assignments = assignmentsFor(screenRows);
  const index = Setup.screenIndex(assignments, methodology, { pathTierOpen: false, pathClosedReason: "PATH_DEPENDENT_STATES_NOT_ACTIVATED" });
  const stateOf = (name) => index.states.find((entry) => entry.state === name);
  const listed = (name) => stateOf(name).rules.flatMap((rule) => rule.tickers || []);

  assert.deepEqual(listed("CONFIRMED"), ["CONF"]);
  assert.deepEqual(listed("WATCH"), ["WTCH"]);
  assert.equal(listed("WATCH").includes("CONF"), false, "a confirmed title is listed as merely watched");
  assert.equal(stateOf("NO_SETUP").count, 1);
  /* The fallback has no predicate, so it has no published list. */
  assert.equal(stateOf("NO_SETUP").rules[0].tickers, null);
  assert.equal(stateOf("NO_SETUP").rules[0].screenable, false);

  /* Every published rule carries the predicate hash of the rule that
     assigned the state, so a screener can prove the list came from it. */
  for (const state of Setup.PIT_STATES) {
    for (const rule of stateOf(state).rules) {
      if (!rule.screenable) continue;
      assert.equal(rule.predicateHash, Setup.ruleHash(ruleOf(rule.ruleId)));
      assert.equal(rule.predicateHash, Rules.predicateHash(Rules.fromQuery(Setup.screenQuery(ruleOf(rule.ruleId)))));
    }
  }
});

test("a closed tier publishes no count, not a count of zero", () => {
  /* "INVALIDATED: 0" reads as "no title has been invalidated". That is a
     claim about the universe, and the engine has not earned it while the
     tier is shut. */
  const index = Setup.screenIndex(assignmentsFor(screenRows), methodology, { pathTierOpen: false, pathClosedReason: "INSUFFICIENT_OBSERVATION_HISTORY" });
  for (const state of Setup.PATH_STATES) {
    const entry = index.states.find((s) => s.state === state);
    assert.equal(entry.count, null, state + " publishes a count while its tier is closed");
    assert.equal(entry.availability.state, "UNAVAILABLE");
    assert.equal(entry.availability.reason, "INSUFFICIENT_OBSERVATION_HISTORY");
    assert.ok(Setup.PATH_CLOSED_REASONS.includes(entry.availability.reason));
    for (const rule of entry.rules) assert.equal(rule.tickers, null);
  }
  for (const state of Setup.PIT_STATES) {
    const entry = index.states.find((s) => s.state === state);
    assert.equal(entry.availability.state, "AVAILABLE");
    assert.equal(typeof entry.count, "number");
  }
});

test("an index that disagrees with the cascade is refused rather than published", () => {
  const wrong = assignmentsFor(screenRows);
  wrong[0].state = "WATCH";
  assert.throws(() => Setup.screenIndex(wrong, methodology), /is filed as WATCH under rule/);
  assert.throws(() => Setup.screenIndex([{ ticker: "X", ruleId: "setup.invented", state: "WATCH" }], methodology), /unknown ruleId/);
});

test("every difference between the predicate and the assignment is explained by cascade priority", () => {
  const assignments = assignmentsFor(screenRows);
  const report = Setup.reconcile(screenRows, assignments, methodology, { unclassified: [] });
  assert.equal(report.parity, true);

  const watch = report.rules.find((rule) => rule.ruleId === "setup.watch.bullish-trend");
  /* The predicate reaches further than the state does, and by exactly the
     titles a higher-priority rule took. */
  assert.ok(watch.predicateMatched > watch.assigned);
  assert.equal(watch.predicateMatched, watch.assigned + watch.claimedByHigherPriority + watch.inputsIncomplete);
  for (const rule of report.rules) {
    assert.deepEqual(rule.assignedNotMatched, [], rule.ruleId + ": assigned a state its own predicate rejects");
    assert.deepEqual(rule.unexplained, [], rule.ruleId + ": a matched title no rule accounts for");
  }
});

test("a drifted cascade is caught, in both directions", () => {
  const assignments = assignmentsFor(screenRows);

  /* Direction one: a title filed under a rule whose predicate rejects it.
     That is a second evaluator having reached a different answer. */
  const forged = assignments.map((a) => a.ticker === "QUIET" ? { ...a, ruleId: "setup.confirmed.structure-trend-volume", state: "CONFIRMED" } : a);
  const one = Setup.reconcile(screenRows, forged, methodology, { unclassified: [] });
  assert.equal(one.parity, false);
  assert.ok(one.rules.find((r) => r.ruleId === "setup.confirmed.structure-trend-volume").assignedNotMatched.includes("QUIET"));
  assert.throws(() => Setup.assertParity(one), /disagree/);

  /* Direction two: a title the predicate matches that is filed under a
     LOWER-priority rule. Cascade priority cannot explain that one. */
  const demoted = assignments.map((a) => a.ticker === "CONF" ? { ...a, ruleId: "setup.watch.bullish-trend", state: "WATCH" } : a);
  const two = Setup.reconcile(screenRows, demoted, methodology, { unclassified: [] });
  assert.equal(two.parity, false);
  assert.ok(two.rules.find((r) => r.ruleId === "setup.confirmed.structure-trend-volume").unexplained.includes("CONF"));

  /* And a title with incomplete inputs is neither: it is named as such. */
  const partial = screenRows.concat([{ ticker: "PART", ...confirmedRow }]);
  const three = Setup.reconcile(partial, assignments, methodology, { unclassified: ["PART"] });
  assert.equal(three.parity, true);
  assert.equal(three.rules.find((r) => r.ruleId === "setup.confirmed.structure-trend-volume").inputsIncomplete, 1);
});

/* =========================================================================
   WAS DIESEN ZUSTAND AENDERN WUERDE

   Die Sektion konnte sagen, welcher Zustand gilt. Die naechste Frage eines
   Lesers - was muesste anders sein - beantwortet die Kaskade, weil sie fuer
   jeden Zustand seine Bedingungen benennt. Der Punkt dieser Tests: dieselbe
   Auswertung, kein zweiter Auswerter, und "nicht beantwortbar" bekommt nie
   das Zeichen von "nicht erfuellt".
   ========================================================================= */
const explainMapping = { mappingVersion: mapping.mappingVersion, cascade: { rules: mapping.cascade.rules } };
const explain = (row, context) => Setup.explainCascade(explainMapping, row, Object.assign({ close: 100, previous: null }, context || {}));

test("the explanation agrees with the assignment - there is no second evaluator", () => {
  /* Der harte Teil: was die Erklaerung als erfuellt zeigt, muss dieselbe
     Regel sein, die der Zustand zugewiesen hat. Zwei Auswertungen, die
     auseinanderlaufen, waeren auf der Oberflaeche nicht zu unterscheiden -
     eine Bedingung stuende als erfuellt da, waehrend der Zustand sie nicht
     erfuellt sah. */
  for (const row of [confirmedRow,
                     { ...confirmedRow, technicalVolumeState: "NORMAL" },
                     { ...confirmedRow, technicalSetupStatus: "INCOMPLETE" },
                     { ...confirmedRow, technicalTrend: "BEARISH", technicalConfirmedStructure: "BEARISH" }]) {
    const observation = evaluate(row);
    const erklaert = explain(row);
    const zugewiesen = observation.matchedRule ? observation.matchedRule.ruleId : null;
    const ersteTreffer = erklaert.filter((r) => r.matched === true)
      .sort((a, b) => a.order - b.order)[0];
    if (zugewiesen === "setup.none.fallback") {
      assert.equal(ersteTreffer, undefined, "keine Regel darf greifen, wenn der Auffangzustand gilt");
    } else {
      assert.equal(ersteTreffer.ruleId, zugewiesen);
    }
    /* Und die Bedingungen der zugewiesenen Regel sind wortgleich dieselben. */
    if (ersteTreffer) {
      const ausErklaerung = erklaert.find((r) => r.ruleId === zugewiesen).conditions;
      assert.deepEqual(ausErklaerung.map((c) => [c.field || c.input, c.value, c.met]),
        observation.conditions.map((c) => [c.field || c.input, c.value, c.met]));
    }
  }
});

test("a rule one condition short names that one condition", () => {
  const row = { ...confirmedRow, technicalVolumeState: "NORMAL" };
  const confirmed = explain(row).find((r) => r.ruleId === "setup.confirmed.structure-trend-volume");
  assert.equal(confirmed.matched, false);
  assert.equal(confirmed.total - confirmed.met, 1);
  assert.equal(confirmed.open.length, 1);
  assert.equal(confirmed.open[0].field, "technicalVolumeState");
  assert.equal(confirmed.open[0].value, "NORMAL");
  assert.deepEqual(confirmed.open[0].demand, ["BREAKOUT_VOLUME_UP", "EXPANSION"]);
});

test("without a previous observation a course-of-events rule is unanswerable, not unmet", () => {
  /* Der Unterschied, der das Ganze ehrlich haelt. 'Nicht erfuellt' waere
     eine Aussage ueber den Titel; hier fehlt die Vorbeobachtung. */
  for (const rule of explain(confirmedRow).filter((r) => r.tier === "PATH_DEPENDENT")) {
    assert.equal(rule.unanswerable, "NO_PREVIOUS_OBSERVATION");
    assert.equal(rule.matched, null);
    assert.deepEqual(rule.conditions, []);
    assert.equal(rule.met, 0);
    assert.ok(rule.total > 0, "die Anzahl der Bedingungen bleibt nennbar");
  }
});

test("a previous observation without its levels is named as such", () => {
  /* Das veroeffentlichte `previous` traegt Zustand und Datum, nicht die
     Niveaus. Eine Regel, die gegen ein Niveau vergleicht, ist damit nicht
     beantwortbar - und sagt genau das. */
  const mitZustand = explain(confirmedRow, { previous: { setupState: "CONFIRMED", asOf: "2026-09-04" } });
  const invalidated = mitZustand.find((r) => r.ruleId === "setup.invalidated.below-previous-invalidation");
  assert.equal(invalidated.unanswerable, "PREVIOUS_LEVEL_NOT_PUBLISHED");
  assert.equal(invalidated.matched, null);
  /* Eine Verlaufsregel OHNE Niveauvergleich ist mit derselben
     Vorbeobachtung beantwortbar - sonst waere die Unterscheidung nur ein
     pauschales Nein. */
  const active = mitZustand.find((r) => r.ruleId === "setup.active.entry-zone-running");
  assert.equal(active.unanswerable, null);
  assert.equal(typeof active.matched, "boolean");
});

test("the fallback rule is not offered as something to reach", () => {
  /* 'Alles, was keine andere Regel genommen hat' ist keine Bedingung, die
     ein Titel erfuellen koennte. Sie taucht in der Erklaerung nicht auf. */
  assert.equal(explain(confirmedRow).some((r) => r.ruleId === "setup.none.fallback"), false);
});

test("every field and every value the explanation can show has a user label", () => {
  /* Die Oberflaeche zeigt diese Bedingungen. Ein englischer Feldname oder
     ein roher Enum-Wert in der Hauptaussage ist genau das, was das
     Woerterbuch abschafft - also wird hier geprueft, dass es fuer jeden
     Wert, den die Kaskade verlangt oder ein Titel tragen kann, ein Wort
     gibt. */
  const Language = require("../engines/product-language.js");
  for (const rule of mapping.cascade.rules) {
    for (const filter of rule.filters || []) {
      assert.ok(Language.has(filter.field), "field " + filter.field + " has no user label");
      const field = Catalog.field(filter.field);
      const werte = field.type === "enum" ? field.values : [];
      for (const value of werte) {
        assert.ok(Language.has(filter.field + "." + value),
          "value " + filter.field + "." + value + " has no user label");
      }
      for (const demanded of [].concat(filter.value)) {
        if (typeof demanded !== "string") continue;
        assert.ok(Language.has(filter.field + "." + demanded),
          "demanded value " + filter.field + "." + demanded + " has no user label");
      }
    }
  }
});

test("a value that means 'not determinable' is not counted as unmet", () => {
  /* Fuenf der neun Filterfelder stehen nicht in coverage.requiredFields, und
     die Pflichtpruefung prueft ohnehin nur ANWESENHEIT: "UNDETERMINED" ist
     ein Wert. Gemessen am 25.09.2026: 146 von 5.676 Titeln tragen beim
     Volumenzustand "nicht auswertbar", 56 in einem Pflichtfeld einen
     unbestimmten Wert. Die Regel greift dann zurecht nicht - behauptet wird
     damit aber nichts ueber den Titel, und die Oberflaeche darf dafuer nicht
     dasselbe Zeichen zeigen wie fuer eine widerlegte Bedingung. */
  const row = { ...confirmedRow, technicalVolumeState: "UNAVAILABLE" };
  const confirmed = explain(row).find((r) => r.ruleId === "setup.confirmed.structure-trend-volume");
  const volume = confirmed.conditions.find((c) => c.field === "technicalVolumeState");
  assert.equal(volume.met, false, "die Regel greift nicht - das bleibt so");
  assert.equal(volume.measurable, false, "aber sie ist nicht widerlegt, sondern unmessbar");
  /* Und ein bestimmter Wert bleibt messbar, auch wenn er nicht passt. */
  const trend = confirmed.conditions.find((c) => c.field === "technicalTrend");
  assert.equal(trend.measurable, true);
  const negativ = explain({ ...confirmedRow, technicalTrend: "BEARISH" })
    .find((r) => r.ruleId === "setup.confirmed.structure-trend-volume")
    .conditions.find((c) => c.field === "technicalTrend");
  assert.equal(negativ.met, false);
  assert.equal(negativ.measurable, true);
  /* 'NONE' ist eine Feststellung und kein fehlender Wert - "keine Zone
     beschrieben" ist gemessen. */
  assert.equal(Setup.determinable("NONE"), true);
  assert.deepEqual(Setup.UNDETERMINABLE, ["UNAVAILABLE", "UNDETERMINED"]);
});

test("the hydrated observation carries the same distinction", () => {
  /* Die gegriffene Regel kommt aus hydrate(), die anderen aus
     conditionsOf() - wenn nur eine der beiden das Feld fuehrt, zeigt die
     Oberflaeche zwei verschiedene Zeichen fuer denselben Zustand. */
  const observation = evaluate({ ...confirmedRow, technicalVolumeState: "UNAVAILABLE" });
  const compacted = Setup.compact(observation);
  const hydrated = Setup.hydrate(compacted, { mappingVersion: mapping.mappingVersion, cascade: { rules: mapping.cascade.rules } });
  for (const condition of hydrated.conditions) {
    assert.equal(typeof condition.measurable, "boolean");
    if (condition.value === "UNAVAILABLE" || condition.value === "UNDETERMINED") {
      assert.equal(condition.measurable, false, condition.field);
    }
  }
});
