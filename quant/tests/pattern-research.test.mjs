import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import methodology from "../methodology/pattern-research-v1.json" with { type: "json" };

const require = createRequire(import.meta.url);
const Patterns = require("../engines/pattern-research.js");

/* A deterministic series with a known shape: 200 weeks of slow drift, then a
   step. Every leakage test needs a series where "before" and "after" are
   visibly different, so a feature that peeked would show up as a number. */
function series(length, shape) {
  const closes = [];
  for (let i = 0; i < length; i++) closes.push(shape(i));
  return closes;
}
const flatThenJump = series(400, (i) => (i < 200 ? 100 + Math.sin(i / 7) * 2 : 400 + Math.sin(i / 7) * 2));

test("the pre-registration is fixed, counted and machine-readable", () => {
  assert.equal(methodology.methodologyVersion, Patterns.METHODOLOGY_VERSION);
  assert.equal(methodology.preRegistration.state, "FIXED_BEFORE_MEASUREMENT");
  assert.equal(methodology.publication.predictionAllowed, false);
  assert.equal(methodology.publication.backtestAllowed, false);
  assert.ok(methodology.candidates.length >= 10);
  assert.equal(new Set(methodology.candidates.map((c) => c.id)).size, methodology.candidates.length);
  for (const candidate of methodology.candidates) {
    assert.ok(Patterns.FEATURE_IDS.includes(candidate.feature), candidate.feature);
  }
  /* Every feature a candidate names must actually be produced. A candidate
     against a feature that is always null would silently never match. */
  const produced = Patterns.featuresAt(flatThenJump, 300);
  for (const candidate of methodology.candidates) {
    assert.ok(candidate.feature in produced, candidate.feature);
  }
});

test("no forbidden current-universe attribute is used as a historical feature", () => {
  const produced = Object.keys(Patterns.featuresAt(flatThenJump, 300));
  for (const forbidden of methodology.leakage.forbiddenFeatures) {
    assert.equal(produced.includes(forbidden), false, forbidden);
  }
  /* Market cap needs a share count from back then; there is no such series
     here, so there is no size feature rather than a wrong one. */
  assert.equal(produced.includes("marketCap"), false);
});

test("a feature at t cannot see past t", () => {
  /* The tell: truncate the series right after t. If a feature read the
     future, the value would change. */
  const t = 250;
  const full = Patterns.featuresAt(flatThenJump, t);
  const truncated = Patterns.featuresAt(flatThenJump.slice(0, t + 1), t);
  assert.deepEqual(full, truncated);

  /* And replacing everything after t with nonsense must not move a value. */
  const poisoned = flatThenJump.slice();
  for (let i = t + 1; i < poisoned.length; i++) poisoned[i] = 1e9;
  assert.deepEqual(Patterns.featuresAt(poisoned, t), full);
});

test("an outcome after t cannot see t or earlier, and is unavailable rather than invented", () => {
  const t = 200, weeks = 52;
  const outcome = Patterns.outcomeAfter(flatThenJump, t, weeks);
  assert.equal(outcome.state, "AVAILABLE");

  /* Poisoning the past must not move the outcome. */
  const poisoned = flatThenJump.slice();
  for (let i = 0; i < t; i++) poisoned[i] = 1e9;
  assert.equal(Patterns.outcomeAfter(poisoned, t, weeks).forwardReturn, outcome.forwardReturn);

  /* A series that ends before the horizon closes has no outcome. It must
     not quietly become a non-winner. */
  const short = flatThenJump.slice(0, t + weeks);
  const missing = Patterns.outcomeAfter(short, t, weeks);
  assert.equal(missing.state, "OUTCOME_UNAVAILABLE");
  assert.equal(missing.reason, "SERIES_ENDS_BEFORE_HORIZON");
  const observation = Patterns.observe(short, t, weeks, 1.0);
  assert.equal(observation.cohort, "OUTCOME_UNAVAILABLE");
  assert.notEqual(observation.cohort, "NON_WINNER");
});

test("the running-max optimisation produces exactly the reference features", () => {
  const context = { runningMax: Patterns.runningMaxOf(flatThenJump) };
  for (const t of [120, 200, 250, 399]) {
    assert.deepEqual(Patterns.featuresAt(flatThenJump, t, context), Patterns.featuresAt(flatThenJump, t));
  }
});

test("the masked fast path returns exactly what the readable path returns", () => {
  /* Built from real published series, not from a fixture: a fast path that
     agrees on synthetic data and diverges on production data is the bug
     this test exists to catch. */
  const dir = new URL("../data/market/discover-series-long/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.startsWith("ref_")).slice(0, 40);
  const observations = [];
  for (const file of files) {
    const payload = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    if (payload.status !== "CALCULATED" || (payload.points || []).length < 300) continue;
    const closes = payload.points.map((p) => p[1]);
    const context = { runningMax: Patterns.runningMaxOf(closes) };
    for (let i = 156; i + 104 < closes.length; i += 13) {
      const features = Patterns.featuresAt(closes, i, context);
      if (!features) continue;
      const outcome = Patterns.outcomeAfter(closes, i, 104);
      observations.push({
        features,
        cohort: outcome.state !== "AVAILABLE" ? "OUTCOME_UNAVAILABLE" : (outcome.forwardReturn >= 1 ? "WINNER" : "NON_WINNER"),
        outcome
      });
    }
  }
  assert.ok(observations.length > 500, "need real observations to compare on");

  const candidates = methodology.candidates;
  const n = observations.length;
  const hit = new Int32Array(n), measurable = new Int32Array(n);
  const cohort = new Uint8Array(n), forward = new Float64Array(n), drawdown = new Float64Array(n);
  observations.forEach((o, i) => {
    const masks = Patterns.candidateMasks(o.features, candidates);
    hit[i] = masks.hit; measurable[i] = masks.measurable;
    cohort[i] = o.cohort === "OUTCOME_UNAVAILABLE" ? 2 : (o.cohort === "WINNER" ? 1 : 0);
    forward[i] = o.outcome.state === "AVAILABLE" ? o.outcome.forwardReturn : 0;
    drawdown[i] = o.outcome.state === "AVAILABLE" ? o.outcome.maxDrawdownWithinHorizon : 0;
  });
  const columns = { hit, measurable, cohort, forward, drawdown };

  for (let i = 0; i < candidates.length; i++) {
    const pattern = { id: candidates[i].id, terms: [candidates[i]] };
    const readable = Patterns.evaluatePattern(observations, pattern);
    const fast = Patterns.evaluateMasked(columns, 1 << i, pattern.id, -0.5);
    for (const key of ["support", "winners", "population", "notMeasurable", "outcomeUnavailableInPattern",
                       "baseRate", "conditionalRate", "lift", "medianForwardReturn", "medianMaxDrawdownWithinHorizon"]) {
      assert.deepEqual(fast[key], readable[key], pattern.id + "." + key);
    }
  }
  /* And for an interaction, where the mask has two bits. */
  const pair = { id: "pair", terms: [candidates[0], candidates[3]] };
  const readablePair = Patterns.evaluatePattern(observations, pair);
  const fastPair = Patterns.evaluateMasked(columns, (1 << 0) | (1 << 3), "pair", -0.5);
  assert.equal(fastPair.support, readablePair.support);
  assert.equal(fastPair.winners, readablePair.winners);
  assert.equal(fastPair.lift, readablePair.lift);
});

test("an unmeasurable term makes the pattern unmeasurable, never a miss", () => {
  const features = { return12m1m: 0.5, distanceTo52wHigh: null };
  const both = { id: "x", terms: [
    { feature: "return12m1m", operator: "gte", value: 0.3 },
    { feature: "distanceTo52wHigh", operator: "gte", value: -0.05 }
  ] };
  assert.equal(Patterns.matchesPattern(features, both), null);
  /* A failing measurable term short-circuits to false before the
     unmeasurable one is reached - that is a genuine miss, not a gap. */
  const failing = { id: "y", terms: [
    { feature: "return12m1m", operator: "gte", value: 0.9 },
    { feature: "distanceTo52wHigh", operator: "gte", value: -0.05 }
  ] };
  assert.equal(Patterns.matchesPattern(features, failing), false);
});

test("walk-forward folds are purged, so train and test never share a future", () => {
  const horizon = 104;
  const observations = [];
  for (let week = 0; week < 1000; week++) observations.push({ t: week, features: {}, cohort: "NON_WINNER", outcome: {} });
  const folds = Patterns.walkForwardFolds(observations, 5, horizon, (o) => o.t);
  assert.ok(folds.length >= 3);
  for (const fold of folds) {
    const testStart = Math.min(...fold.test.map((o) => o.t));
    for (const trained of fold.train) {
      assert.ok(trained.t < testStart, "training observation is not before the test block");
      assert.ok(trained.t + horizon < testStart, "training outcome window reaches into the test block");
    }
    assert.ok(fold.purged > 0, "nothing was purged, so the embargo did not run");
  }
});

test("Benjamini-Hochberg corrects over the hypotheses that were actually tested", () => {
  const nothing = Patterns.benjaminiHochberg(Array.from({ length: 100 }, (_, i) => (i + 0.5) / 100), 0.05);
  assert.equal(nothing.hypotheses, 100);
  assert.equal(Object.keys(nothing.passing).length, 0, "uniform p-values must not produce findings");

  const some = Patterns.benjaminiHochberg([1e-9, 1e-8, 0.2, 0.4, 0.9], 0.05);
  assert.equal(some.hypotheses, 5);
  assert.ok(some.passing[0] && some.passing[1]);
  assert.ok(!some.passing[2] && !some.passing[3] && !some.passing[4]);

  /* One strong p-value among a thousand hypotheses must survive; one weak
     one must not. That is the whole point of counting the hypotheses. */
  const many = [1e-12].concat(Array.from({ length: 999 }, (_, i) => (i + 1) / 1000));
  assert.ok(Patterns.benjaminiHochberg(many, 0.05).passing[0]);
  const weak = [0.01].concat(Array.from({ length: 999 }, (_, i) => (i + 1) / 1000));
  assert.ok(!Patterns.benjaminiHochberg(weak, 0.05).passing[0]);
});

test("the Wilson interval stays inside [0,1] and widens as evidence thins", () => {
  const wide = Patterns.wilson(1, 10);
  const narrow = Patterns.wilson(1000, 10000);
  assert.ok(wide[0] >= 0 && wide[1] <= 1);
  assert.ok(narrow[0] >= 0 && narrow[1] <= 1);
  assert.ok(wide[1] - wide[0] > narrow[1] - narrow[0]);
  assert.equal(Patterns.wilson(0, 0), null);
});

test("parameter stability sees through a pattern fitted to one threshold", () => {
  /* A population where the outcome depends on a sharp cut. Sweeping the
     threshold must move the lift a lot, and that is what "unstable" means. */
  const observations = [];
  for (let i = 0; i < 4000; i++) {
    const value = i / 4000;
    const winner = value > 0.499 && value < 0.501;
    observations.push({
      features: { return12m1m: value },
      cohort: winner || i % 7 === 0 ? "WINNER" : "NON_WINNER",
      outcome: { state: "AVAILABLE", forwardReturn: winner ? 2 : 0, maxDrawdownWithinHorizon: -0.2 }
    });
  }
  const pattern = { id: "knife-edge", terms: [{ feature: "return12m1m", operator: "gte", value: 0.499 }] };
  const stability = Patterns.parameterStability(observations, pattern, [0.5, 0.75, 1.0, 1.25, 1.5], 10);
  assert.equal(stability.state, "MEASURED");
  assert.ok(stability.points.length === 5);
  assert.ok(stability.maxLift > stability.minLift);
});

test("the publication gate refuses a forecast, a missing survivorship statement and an unearned verdict", () => {
  const honest = {
    methodologyVersion: Patterns.METHODOLOGY_VERSION,
    backtest: "NOT_CERTIFIED",
    survivorship: { state: "PRESENT_AND_UNQUANTIFIED_IN_PART" },
    thresholds: { minimumSupport: 200 },
    findings: [{ patternId: "a", support: 500, conditionalRate: 0.2, wilsonInterval: [0.1, 0.3], verdict: "ROBUST", outOfSample: { lift: 1.4 } }]
  };
  assert.deepEqual(Patterns.publicationViolations(honest), []);

  const forecasting = { ...honest, forecast: "up" };
  assert.ok(Patterns.publicationViolations(forecasting).includes("forbidden field 'forecast'"));

  const quiet = { ...honest, survivorship: { state: "NONE" } };
  assert.ok(Patterns.publicationViolations(quiet)[0].includes("survivorship"));

  const opened = { ...honest, backtest: "CERTIFIED" };
  assert.ok(Patterns.publicationViolations(opened).includes("backtest gate must stay closed"));

  const unearned = { ...honest, findings: [{ ...honest.findings[0], outOfSample: { lift: 0.8 } }] };
  assert.ok(Patterns.publicationViolations(unearned).some((e) => e.includes("called robust")));

  const bare = { ...honest, findings: [{ ...honest.findings[0], wilsonInterval: null }] };
  assert.ok(Patterns.publicationViolations(bare).some((e) => e.includes("without an interval")));

  const thin = { ...honest, findings: [{ ...honest.findings[0], support: 5, verdict: "ROBUST" }] };
  assert.ok(Patterns.publicationViolations(thin).some((e) => e.includes("below minimum support")));

  assert.throws(() => Patterns.assertPublishable(forecasting), /not publishable/);
});

test("a boolean-only pattern is recorded as untested, not as stable", () => {
  /* Sweeping a threshold that does not exist produces a spread of zero,
     which would otherwise read exactly like a pattern that survived the
     sweep. The absence of a test and a passed test must not look alike. */
  const observations = [];
  for (let i = 0; i < 1000; i++) {
    observations.push({
      features: { aboveSma40w: i % 2 === 0 },
      cohort: i % 5 === 0 ? "WINNER" : "NON_WINNER",
      outcome: { state: "AVAILABLE", forwardReturn: i % 5 === 0 ? 1.5 : 0.1, maxDrawdownWithinHorizon: -0.2 }
    });
  }
  const boolean = { id: "b", terms: [{ feature: "aboveSma40w", operator: "eq", value: true }] };
  assert.equal(Patterns.parameterStability(observations, boolean, [0.8, 1, 1.25], 10).state, "NOT_APPLICABLE_NO_THRESHOLD");
});

test("the published study, when it exists, carries its caveats and no single-title story", () => {
  const path = new URL("../data/product/pattern-research-v1/study.json", import.meta.url);
  if (!existsSync(path)) return;
  const study = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(Patterns.publicationViolations(study), []);
  assert.equal(study.population.totalReturn, false);
  assert.equal(study.independence.state, "OVERLAPPING_OBSERVATIONS");
  assert.equal(study.survivorship.effectOnAbsoluteRates, "UPWARD");
  /* Winners and non-winners come from one population: every usable
     observation is in exactly one cohort, and the unavailable ones are
     counted rather than absorbed. */
  assert.equal(study.primary.usableObservations + study.primary.outcomeUnavailable, study.primary.observations);
  assert.ok(study.primary.winners > 0 && study.primary.winners < study.primary.usableObservations);
  /* No finding may rest on a handful of cases, and every reported rate
     carries its downside beside it. */
  for (const finding of study.findings) {
    if (finding.verdict === "INSUFFICIENT_SUPPORT") continue;
    assert.ok(finding.support >= study.thresholds.minimumSupport, finding.patternId);
    assert.ok(finding.winners >= 20, finding.patternId);
    assert.equal(typeof finding.conditionalLossRate, "number", finding.patternId + " has no loss rate");
    assert.equal(typeof finding.medianMaxDrawdownWithinHorizon, "number", finding.patternId);
  }
  /* And the study names no instrument at all: a pattern is a population
     statement, so a ticker in here would be the cherry pick by construction. */
  assert.equal(JSON.stringify(study).includes("\"ticker\""), false);
});

test("the fundamental overlay, when it exists, is point-in-time and reports what it adds", () => {
  const path = new URL("../data/product/pattern-research-fundamentals-v1/study.json", import.meta.url);
  if (!existsSync(path)) return;
  const study = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(Patterns.publicationViolations(study), []);
  assert.equal(study.family, "PIT_FUNDAMENTAL_OVERLAY");
  assert.equal(study.pitSource.visibilityRule, "filed <= t");
  /* Its own family version, so the price study's hypothesis count was not
     changed after that study was measured. */
  assert.equal(study.familyVersion, "pattern-research-fundamentals-1.0.0");
  assert.ok(study.population.firstDate >= study.coverageWindow.usableFrom + "-01-01");
  assert.equal(JSON.stringify(study).includes("\"ticker\""), false);

  /* A cross pair has to say whether it beats its own halves. A pair that
     merely repeats its stronger half is not a discovery. */
  const crossPairs = study.findings.filter((f) => f.kind === "CROSS_PAIR" && f.verdict !== "INSUFFICIENT_SUPPORT");
  assert.ok(crossPairs.length > 0);
  for (const pair of crossPairs) {
    assert.ok(pair.halves && pair.halves.price && pair.halves.fundamental, pair.patternId);
    assert.equal(typeof pair.addsOverBetterHalf, "boolean", pair.patternId);
  }
  /* None of the forbidden debt-derived features may appear as a term: they
     cover a fraction of issuers and would narrow the sample silently. */
  const terms = study.findings.flatMap((f) => f.terms.map((t) => t.feature));
  for (const forbidden of ["total_debt", "net_debt", "roic"]) {
    assert.equal(terms.includes(forbidden), false, forbidden);
  }
});

test("every reported finding states its downside beside its upside", () => {
  for (const file of ["pattern-research-v1", "pattern-research-fundamentals-v1"]) {
    const path = new URL("../data/product/" + file + "/study.json", import.meta.url);
    if (!existsSync(path)) continue;
    const study = JSON.parse(readFileSync(path, "utf8"));
    for (const finding of study.findings) {
      if (finding.verdict === "INSUFFICIENT_SUPPORT") continue;
      assert.equal(finding.lossThreshold, -0.5, file + " " + finding.patternId);
      assert.equal(typeof finding.lossLift, "number", file + " " + finding.patternId);
      assert.equal(typeof finding.asymmetry, "number", file + " " + finding.patternId + " has no asymmetry");
      /* The asymmetry must be exactly the ratio it claims to be. */
      assert.ok(Math.abs(finding.asymmetry - finding.lift / finding.lossLift) < 1e-3,
        file + " " + finding.patternId + " asymmetry does not match lift/lossLift");
    }
  }
});
