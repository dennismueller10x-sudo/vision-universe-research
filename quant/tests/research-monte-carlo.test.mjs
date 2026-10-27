import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { runMonteCarlo, createRandom, BUDGETS } = require('../engines/research-monte-carlo.cjs');

function fixture(overrides = {}) {
  return { model: 'TRADE_IID', seed: 12345, simulations: 200, horizon: 6, initialCapital: 100,
    observations: [{ date: '2020-01-01', return: 0.1 }, { date: '2020-02-01', return: -0.05 }, { date: '2020-03-01', return: 0.03 }, { date: '2020-04-01', return: -0.02 }],
    returnBasis: 'TOTAL_RETURN', costs: { basis: 'ALREADY_NET', modelVersion: 'test-net-1' }, retainPaths: 3,
    provenance: { sourceKind: 'SYNTHETIC_TEST', sourceHash: 'a'.repeat(64), sourceVersion: 'analytical-fixture-1', samplingUnit: 'NON_OVERLAPPING_TRADE', scope: 'SYNTHETIC TEST ONLY' },
    ...overrides };
}
function blocks(overrides = {}) {
  const f = fixture();
  return fixture({ model: 'CIRCULAR_BLOCK', blockLength: 2, provenance: { ...f.provenance, samplingUnit: 'REGULAR_PERIOD' }, ...overrides });
}
function reference(input, result) {
  const script = fileURLToPath(new URL('../../scripts/quant/verify-research-monte-carlo.py', import.meta.url));
  return JSON.parse(execFileSync('python3', [script, '--stdin'], { input: JSON.stringify({ input, result }), stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024, encoding: 'utf8' }));
}
test('MC deterministic repeated result, runtime/binary/code hashes and changed seeds', () => {
  const f = fixture(), a = runMonteCarlo(f), b = runMonteCarlo(f);
  assert.deepEqual(a, b);
  for (const h of [a.inputHash, a.codeHash, a.resultHash, a.generationHash, a.calculationRuntime.binaryHash]) assert.match(h, /^[a-f0-9]{64}$/);
  assert.equal(a.calculationRuntime.node, process.version);
  const changed = runMonteCarlo({ ...f, seed: 12346 });
  assert.notEqual(a.inputHash, changed.inputHash); assert.notEqual(a.resultHash, changed.resultHash);
  assert.notDeepEqual(a.paths, changed.paths);
});
test('MC does not mutate input and normalizes default percentiles/path retention for hashing', () => {
  const f = fixture(), before = JSON.stringify(f);
  const a = runMonteCarlo(f); assert.equal(JSON.stringify(f), before);
  const b = runMonteCarlo({ ...f, percentiles: [0.01, 0.05, 0.5, 0.95, 0.99] });
  assert.equal(a.resultHash, b.resultHash);
});
test('MC constant zero returns are analytically invariant', () => {
  const f = fixture(); f.observations.forEach((o) => { o.return = 0; });
  const r = runMonteCarlo(f);
  assert.equal(r.distributions.endCapital.min, 100); assert.equal(r.distributions.endCapital.max, 100);
  assert.equal(r.distributions.maxDrawdown.mean, 0); assert.equal(r.distributions.longestLossStreak.mean, 0);
});
test('MC constant losses produce exact compounding, drawdown and loss streak', () => {
  const f = fixture({ horizon: 3 }); f.observations.forEach((o) => { o.return = -0.5; });
  const r = runMonteCarlo(f);
  assert.equal(r.distributions.endCapital.mean, 12.5); assert.equal(r.distributions.maxDrawdown.mean, -0.875);
  assert.equal(r.distributions.longestLossStreak.mean, 3);
});
test('MC observed total loss produces ruin without negative equity', () => {
  const f = fixture(); f.observations.forEach((o) => { o.return = -1; });
  const r = runMonteCarlo(f);
  assert.equal(r.distributions.endCapital.mean, 0); assert.equal(r.distributions.maxDrawdown.mean, -1);
});
test('MC per-side notional charges purchase on financed notional and sale on actual proceeds', () => {
  const f = fixture({ horizon: 1, costs: { basis: 'PER_SIDE_NOTIONAL', modelVersion: 'test-gross-1', feeBps: 10, slippageBps: 5 } });
  f.observations.forEach((o) => { o.return = 0.1; });
  const r = runMonteCarlo(f), expected = 100 / 1.0015 * 1.1 * 0.9985;
  assert.ok(Math.abs(r.distributions.endCapital.mean - expected) < 1e-12);
  assert.equal(reference(f, r).ok, true);
});
test('MC circular blocks preserve within-block temporal adjacency including wrap', () => {
  const f = blocks({ horizon: 11, retainPaths: 200 });
  const r = runMonteCarlo(f);
  for (const path of r.paths) for (let t = 1; t < path.sourceIndices.length; t++) {
    if (t % 2) assert.equal(path.sourceIndices[t], (path.sourceIndices[t - 1] + 1) % 4);
  }
  assert.ok(r.paths.some((p) => p.sourceIndices.some((v, i, a) => i % 2 === 1 && a[i - 1] === 3 && v === 0)));
});
test('MC a complete source-length block has rotation-invariant final capital', () => {
  const f = blocks({ horizon: 4, blockLength: 4 }); const r = runMonteCarlo(f);
  const expected = f.observations.reduce((capital, o) => capital * (1 + o.return), 100);
  assert.ok(Math.abs(r.distributions.endCapital.min - expected) < 1e-12);
  assert.ok(Math.abs(r.distributions.endCapital.max - expected) < 1e-12);
});
test('MC IID trade and block dependence models cannot be silently mixed', () => {
  assert.throws(() => runMonteCarlo(fixture({ blockLength: 2 })), /TRADE_MODEL/);
  assert.throws(() => runMonteCarlo(blocks({ provenance: fixture().provenance })), /SAMPLING_UNIT/);
  assert.throws(() => runMonteCarlo(blocks({ costs: { basis: 'PER_SIDE_NOTIONAL', modelVersion: 'x', feeBps: 10, slippageBps: 5 } })), /BLOCK_REQUIRES/);
});
test('MC Python independently reproduces seeded trade bootstrap and conditional uncertainty', () => {
  const f = fixture({ simulations: 701, horizon: 17, retainPaths: 4, percentiles: [0, 0.1, 0.5, 0.9, 1] });
  assert.equal(reference(f, runMonteCarlo(f)).ok, true);
});
test('MC Python independently reproduces block bootstrap and wrap/partial final blocks', () => {
  const f = blocks({ simulations: 701, horizon: 17, blockLength: 3, retainPaths: 5 });
  assert.equal(reference(f, runMonteCarlo(f)).ok, true);
});
test('MC Python detects corrupted result statistics and seeded paths', () => {
  const f = fixture(), a = runMonteCarlo(f); a.distributions.endCapital.mean += 1;
  assert.throws(() => reference(f, a));
  const b = runMonteCarlo(f); b.paths[0].sourceIndices[0] = 99;
  assert.throws(() => reference(f, b));
});
test('MC PRNG known vector and rejection-safe index frequencies', () => {
  const r = createRandom(1);
  assert.deepEqual(Array.from({ length: 5 }, () => r.uint32()), [270369, 67634689, 2647435461, 307599695, 2398689233]);
  const g = createRandom(7), counts = Array(5).fill(0);
  for (let i = 0; i < 100000; i++) counts[g.index(5)]++;
  assert.ok(counts.every((n) => Math.abs(n - 20000) < 600), counts.join(','));
});
test('MC sample frequencies match an exact two-point one-step distribution and DKW shrinks', () => {
  const f = fixture({ horizon: 1, simulations: 50000, retainPaths: 0, observations: [{ date: '2020-01-01', return: -0.1 }, { date: '2020-02-01', return: 0.1 }] });
  const r = runMonteCarlo(f), small = runMonteCarlo({ ...f, simulations: 100 });
  assert.ok(Math.abs(r.distributions.endCapital.mean - 100) < 0.12);
  assert.equal(r.distributions.endCapital.min, 90); assert.ok(Math.abs(r.distributions.endCapital.max - 110) < 1e-12);
  assert.ok(r.uncertainty.cdfEpsilon < small.uncertainty.cdfEpsilon);
  assert.ok(Math.abs(r.uncertainty.cdfEpsilon / small.uncertainty.cdfEpsilon - Math.sqrt(100 / 50000)) < 1e-12);
});
test('MC DKW tails are explicitly unbounded, never spuriously bounded by sampled extrema', () => {
  const f = fixture({ simulations: 1, retainPaths: 1, percentiles: [0, 0.5, 1] });
  const r = runMonteCarlo(f);
  for (const metric of Object.values(r.distributions)) for (const q of metric.quantiles) {
    assert.deepEqual(q.conditionalMonteCarloBand, [null, null]);
    assert.deepEqual(q.conditionalMonteCarloBandBounds, ['UNBOUNDED', 'UNBOUNDED']);
  }
  assert.equal(reference(f, r).ok, true);
});
test('MC positive/negative serial correlation is retained within declared source blocks', () => {
  const observations = Array.from({ length: 20 }, (_, i) => ({ date: `2020-01-${String(i + 1).padStart(2, '0')}`, return: i % 2 ? -0.05 : 0.05 }));
  const f = blocks({ observations, blockLength: 20, horizon: 20, retainPaths: 20 }); const r = runMonteCarlo(f);
  for (const p of r.paths) for (let i = 1; i < p.sourceIndices.length; i++) assert.notEqual(p.sourceIndices[i] % 2, p.sourceIndices[i - 1] % 2);
});
test('MC all outputs are scenarios and do not inherit certification or independent evidence', () => {
  const f = fixture(); f.provenance.sourceKind = 'HISTORICAL_OBSERVED'; const r = runMonteCarlo(f);
  assert.equal(r.synthetic, true); assert.equal(r.forecast, false); assert.equal(r.certification, 'NOT_CERTIFIED');
  assert.equal(r.productionApproved, false); assert.equal(r.dataEligibility, 'NOT_ESTABLISHED_BY_SIMULATION');
  assert.equal(r.independentEvidence, 'NOT_ESTABLISHED_BY_SIMULATION'); assert.equal(r.pathAxis, 'SYNTHETIC_SEQUENCE_STEP');
});
test('MC exact source edits invalidate inputs; caller cannot supply forged result/input hashes', () => {
  const f = fixture(), a = runMonteCarlo(f); f.observations[0].return += 0.001;
  assert.notEqual(runMonteCarlo(f).inputHash, a.inputHash);
  assert.throws(() => runMonteCarlo({ ...f, inputHash: a.inputHash }), /INVALID_INPUT/);
  assert.throws(() => runMonteCarlo({ ...f, certification: 'CERTIFIED' }), /INVALID_INPUT/);
});
test('MC rejects unsuitable/missing/duplicated/out-of-order return data and ambiguous costs', () => {
  for (const value of [NaN, Infinity, -1.01, undefined, null, '0.1']) {
    const f = fixture(); f.observations[0].return = value; assert.throws(() => runMonteCarlo(f), /OBSERVATION_RETURN/);
  }
  for (const value of ['2020-02-30', '2020-01-01T12:00:00Z', 'not-a-date']) {
    const f = fixture(); f.observations[0].date = value; assert.throws(() => runMonteCarlo(f), /OBSERVATION_DATE/);
  }
  const same = fixture(); same.observations[1].date = same.observations[0].date;
  assert.throws(() => runMonteCarlo(same), /STRICTLY_ORDERED/);
  assert.throws(() => runMonteCarlo(fixture({ costs: { basis: 'ALREADY_NET', modelVersion: 'x', feeBps: 0 } })), /TWICE/);
  assert.throws(() => runMonteCarlo(fixture({ returnBasis: 'ADJUSTED_UNKNOWN' })), /RETURN_BASIS/);
});
test('MC enforces work/path/input budgets before allocating simulations', () => {
  assert.throws(() => runMonteCarlo(fixture({ simulations: BUDGETS.simulations + 1 })), /SIMULATIONS/);
  assert.throws(() => runMonteCarlo(fixture({ simulations: 100000, horizon: 1000 })), /SAMPLED_STEPS/);
  assert.throws(() => runMonteCarlo(fixture({ simulations: 100000, horizon: 10, retainPaths: 100000 })), /RETAINED_PATH/);
  assert.throws(() => runMonteCarlo(fixture({ observations: Array(BUDGETS.observations + 1).fill({}) })), /OBSERVATION_COUNT/);
  const f = fixture(); f.provenance.scope = 'x'.repeat(4097); assert.throws(() => runMonteCarlo(f), /PROVENANCE/);
});
test('MC rejects invalid seeds, dimensions and overflow instead of manufacturing finite paths', () => {
  for (const seed of [0, -1, 1.2, 2 ** 32, NaN]) assert.throws(() => runMonteCarlo(fixture({ seed })), /SEED/);
  for (const horizon of [0, -1, Infinity]) assert.throws(() => runMonteCarlo(fixture({ horizon })), /HORIZON/);
  const f = fixture({ initialCapital: Number.MAX_VALUE }); f.observations.forEach((o) => { o.return = 1; });
  assert.throws(() => runMonteCarlo(f), /NON_FINITE_CAPITAL_PATH/);
});
