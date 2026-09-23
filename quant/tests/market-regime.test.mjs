import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import methodology from "../methodology/market-regime-v1.json" with { type: "json" };

const require = createRequire(import.meta.url);
const Regime = require("../engines/market-regime.js");
const Language = require("../engines/product-language.js");

/* Shares are given directly; the engine classifies measured shares and does
   no bar arithmetic, so a test may hand it the numbers. */
const counts = (shares, universe = 5000) => Object.fromEntries(
  methodology.measures.map((m) => [m.id, { hits: Math.round((shares[m.id] ?? 0.5) * universe), observed: universe }]));
const run = (shares, extra = {}) => Regime.evaluate({
  methodology, universe: 5000, counts: counts(shares), ...extra });

test("the published methodology is a valid, ordered, exhaustive cascade", () => {
  assert.deepEqual(Regime.validateMethodology(methodology), { valid: true, errors: [] });
  const orders = methodology.cascade.rules.map((r) => r.order);
  assert.deepEqual(orders, orders.slice().sort((a, b) => a - b));
  for (const state of Regime.PIT_STATES) {
    assert.ok(methodology.cascade.rules.some((r) => r.state === state), state + " unreachable");
  }
  assert.equal(methodology.cascade.rules.at(-1).always, true);
  /* Every rule says what it means and why, in the contract rather than in a
     caption somebody can quietly reword. */
  for (const rule of methodology.cascade.rules) {
    assert.ok(rule.plain.length > 20, rule.ruleId);
    assert.ok(rule.rationale.length > 40, rule.ruleId);
  }
});

test("the thresholds actually decide, in both directions and at the edge", () => {
  assert.equal(run({ above200: 0.70, trendBullish: 0.45, trendBearish: 0.10 }).regime, "BROAD_STRENGTH");
  assert.equal(run({ above200: 0.30, trendBullish: 0.10, trendBearish: 0.45 }).regime, "BROAD_WEAKNESS");
  /* Exactly on the boundary counts as met: the operators are gte/lte and
     the contract says so, so a reader can reproduce the call. */
  assert.equal(run({ above200: 0.60, trendBullish: 0.40, trendBearish: 0.10 }).regime, "BROAD_STRENGTH");
  assert.equal(run({ above200: 0.40, trendBullish: 0.10, trendBearish: 0.35 }).regime, "BROAD_WEAKNESS");
  /* One condition short of either is MIXED, not the nearer of the two. */
  assert.equal(run({ above200: 0.61, trendBullish: 0.39, trendBearish: 0.10 }).regime, "MIXED");
  assert.equal(run({ above200: 0.39, trendBullish: 0.10, trendBearish: 0.34 }).regime, "MIXED");
});

test("claiming breadth is held to a higher bar than denying it", () => {
  /* Deliberate asymmetry in the contract: strength needs 60 % above the
     200-day line, weakness triggers at 40 %. A market at 50 % is neither,
     and that gap is where MIXED lives rather than a coin flip. */
  const strength = methodology.cascade.rules.find((r) => r.state === "BROAD_STRENGTH");
  const weakness = methodology.cascade.rules.find((r) => r.state === "BROAD_WEAKNESS");
  const above = (rule) => rule.all.find((c) => c.measure === "above200").value;
  assert.ok(above(strength) > above(weakness));
  assert.equal(run({ above200: 0.50, trendBullish: 0.30, trendBearish: 0.30 }).regime, "MIXED");
});

test("a thin input is named, never counted as a zero share", () => {
  /* A share of 0 and a share nobody could measure are different claims.
     Half the universe missing must not read as "0 % are above the line". */
  const thin = counts({ above200: 0.7, trendBullish: 0.5 });
  thin.above200 = { hits: 100, observed: 200 };
  const result = Regime.evaluate({ methodology, universe: 5000, counts: thin });
  assert.equal(result.state, "UNAVAILABLE");
  assert.equal(result.reason, "MARKET_REGIME_INPUT_COVERAGE_TOO_LOW");
  assert.deepEqual(result.fields, ["above200"]);
  assert.equal(result.regime, null);
  assert.deepEqual(Regime.publicationViolations(result), []);
});

test("a universe too small to describe produces no description", () => {
  const result = Regime.evaluate({ methodology, universe: 100, counts: counts({}, 100) });
  assert.equal(result.state, "UNAVAILABLE");
  assert.equal(result.reason, "MARKET_REGIME_UNIVERSE_TOO_SMALL");
  assert.ok(Regime.UNAVAILABLE_REASONS.includes(result.reason));
});

test("the course-of-events tier stays shut and says so in its own field", () => {
  const result = run({ above200: 0.7, trendBullish: 0.5 });
  assert.equal(result.transitions.state, "CLOSED");
  assert.equal(result.transitions.reason, "MARKET_REGIME_TRANSITIONS_NOT_ACTIVATED");
  assert.ok(Regime.PATH_CLOSED_REASONS.includes(result.transitions.reason));
  /* A published point-in-time regime never implies the three transition
     states were considered - their absence is stated, not inferred. */
  assert.equal(Regime.PATH_STATES.includes(result.regime), false);
  assert.equal(methodology.gateStatus.MARKET_REGIME_TRANSITIONS_ACTIVE, false);
  assert.equal(methodology.gateStatus.MARKET_REGIME_POINT_IN_TIME_ACTIVE, "PASS");

  /* Even with the owner's switch flipped, too little history keeps it shut,
     and a contract that stands it open with a failing check is refused. */
  const activated = structuredClone(methodology);
  activated.pathDependentActivation.state = "ACTIVE";
  assert.match(Regime.validateMethodology(activated).errors.join("; "), /ACTIVE while check/);
  activated.pathDependentActivation.checks.forEach((c) => { c.state = "PASS"; });
  assert.equal(Regime.validateMethodology(activated).valid, true);
  const short = Regime.evaluate({ methodology: activated, universe: 5000,
    counts: counts({ above200: 0.7, trendBullish: 0.5 }), historyDepth: 3 });
  assert.equal(short.transitions.reason, "INSUFFICIENT_REGIME_HISTORY");
});

test("the thresholds are not fitted to outcomes, and the contract says so", () => {
  assert.equal(methodology.thresholdPolicy.fittedToOutcomes, false);
  assert.equal(methodology.thresholdPolicy.kind, "DESCRIPTIVE_ONLY");
  assert.match(methodology.notAForecast, /keine Prognose/);
  /* Round pre-set shares, not values that look tuned. */
  for (const rule of methodology.cascade.rules) {
    for (const condition of rule.all || []) {
      assert.equal(Math.round(condition.value * 100) / 100, condition.value, rule.ruleId + " " + condition.measure);
    }
  }
});

test("every regime and every reason has a user label", () => {
  for (const state of Regime.PIT_STATES) {
    assert.ok(Language.has(state), state + " has no user label");
    assert.notEqual(Language.label(state), state);
  }
  for (const reason of Regime.UNAVAILABLE_REASONS.concat(Regime.PATH_CLOSED_REASONS)) {
    if (reason === "INSUFFICIENT_REGIME_HISTORY") continue;
    assert.ok(Language.has(reason), reason + " has no user label");
  }
});
