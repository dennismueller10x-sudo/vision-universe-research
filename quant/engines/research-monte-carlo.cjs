'use strict';

// Offline, conditional scenario simulation. This module never certifies its inputs.
const crypto = require('node:crypto');
const fs = require('node:fs');
const VERSION = 'research-monte-carlo-1.0.0';
const BUDGETS = Object.freeze({ observations: 100000, simulations: 100000, horizon: 20000, sampledSteps: 20000000, retainedPoints: 100000, percentiles: 101 });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const CODE_HASH = sha(fs.readFileSync(__filename));
function canonical(x) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
  if (typeof x === 'number' && Number.isFinite(x)) return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && Object.getPrototypeOf(x) === Object.prototype) return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  throw new Error('NON_CANONICAL_INPUT');
}
function object(x, keys, name) {
  if (!x || Object.getPrototypeOf(x) !== Object.prototype || Object.keys(x).some((k) => !keys.includes(k))) throw new Error('INVALID_' + name);
}
function integer(x, min, max, name) {
  if (!Number.isSafeInteger(x) || x < min || x > max) throw new Error('INVALID_' + name);
}
function date(x) {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x) || !Number.isFinite(Date.parse(x + 'T00:00:00Z')) || new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) !== x) throw new Error('INVALID_OBSERVATION_DATE');
}
let runtimeCache;
function runtime() {
  if (!runtimeCache) runtimeCache = { node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch,
    glibc: process.report?.getReport().header.glibcVersionRuntime || null,
    binaryHash: sha(fs.readFileSync(process.execPath)) };
  return { ...runtimeCache };
}
// xorshift32, nonzero uint32 state. Rejection sampling avoids modulo bias.
function createRandom(seed) {
  integer(seed, 1, 0xffffffff, 'SEED');
  let state = seed >>> 0;
  function uint32() { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; }
  return { uint32, index(n) {
    integer(n, 1, BUDGETS.observations, 'INDEX_BOUND');
    const limit = Math.floor(0xffffffff / n) * n;
    let r; do { r = uint32() - 1; } while (r >= limit);
    return r % n;
  } };
}
function quantile(sorted, p) {
  const at = (sorted.length - 1) * p, i = Math.floor(at), f = at - i;
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * f;
}
function empiricalInverse(sorted, p) { return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]; }
function summarize(values, ps, epsilon) {
  const sorted = values.slice().sort((a, b) => a - b);
  let mean = 0; for (let i = 0; i < values.length; i++) mean += (values[i] - mean) / (i + 1);
  return { mean, min: sorted[0], max: sorted.at(-1), quantiles: ps.map((p) => ({ p, value: quantile(sorted, p),
    conditionalMonteCarloBand: [p - epsilon <= 0 ? null : empiricalInverse(sorted, p - epsilon), p + epsilon >= 1 ? null : empiricalInverse(sorted, p + epsilon)],
    conditionalMonteCarloBandBounds: [p - epsilon <= 0 ? 'UNBOUNDED' : 'FINITE', p + epsilon >= 1 ? 'UNBOUNDED' : 'FINITE'] })) };
}
function normalize(input) {
  object(input, ['model', 'seed', 'simulations', 'horizon', 'initialCapital', 'observations', 'returnBasis', 'costs', 'provenance', 'blockLength', 'retainPaths', 'percentiles'], 'INPUT');
  if (!['TRADE_IID', 'CIRCULAR_BLOCK'].includes(input.model)) throw new Error('INVALID_MODEL');
  integer(input.seed, 1, 0xffffffff, 'SEED');
  integer(input.simulations, 1, BUDGETS.simulations, 'SIMULATIONS');
  integer(input.horizon, 1, BUDGETS.horizon, 'HORIZON');
  if (input.simulations * input.horizon > BUDGETS.sampledSteps) throw new Error('SAMPLED_STEPS_BUDGET_EXCEEDED');
  if (!Number.isFinite(input.initialCapital) || input.initialCapital <= 0) throw new Error('INVALID_INITIAL_CAPITAL');
  if (!['PRICE_RETURN', 'TOTAL_RETURN'].includes(input.returnBasis)) throw new Error('INVALID_RETURN_BASIS');
  if (!Array.isArray(input.observations)) throw new Error('INVALID_OBSERVATIONS');
  integer(input.observations.length, 2, BUDGETS.observations, 'OBSERVATION_COUNT');
  object(input.provenance, ['sourceKind', 'sourceHash', 'sourceVersion', 'samplingUnit', 'scope'], 'PROVENANCE');
  const p = input.provenance;
  if (!['SYNTHETIC_TEST', 'HISTORICAL_OBSERVED'].includes(p.sourceKind) || typeof p.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(p.sourceHash) || typeof p.sourceVersion !== 'string' || !p.sourceVersion || p.sourceVersion.length > 256 || typeof p.scope !== 'string' || !p.scope || p.scope.length > 4096) throw new Error('INVALID_PROVENANCE');
  if (p.samplingUnit !== (input.model === 'TRADE_IID' ? 'NON_OVERLAPPING_TRADE' : 'REGULAR_PERIOD')) throw new Error('MODEL_SAMPLING_UNIT_MISMATCH');
  object(input.costs, ['basis', 'modelVersion', 'feeBps', 'slippageBps'], 'COSTS');
  const costs = input.costs;
  if (typeof costs.modelVersion !== 'string' || !costs.modelVersion || costs.modelVersion.length > 256 || !['ALREADY_NET', 'PER_SIDE_NOTIONAL'].includes(costs.basis)) throw new Error('INVALID_COSTS');
  let c = 0;
  if (costs.basis === 'ALREADY_NET') {
    if (costs.feeBps !== undefined || costs.slippageBps !== undefined) throw new Error('NET_COSTS_MUST_NOT_BE_APPLIED_TWICE');
  } else {
    if (input.model !== 'TRADE_IID') throw new Error('BLOCK_REQUIRES_OBSERVED_NET_PERIOD_RETURNS');
    if (![costs.feeBps, costs.slippageBps].every((v) => Number.isFinite(v) && v >= 0) || costs.feeBps + costs.slippageBps >= 10000) throw new Error('INVALID_COST_BPS');
    c = (costs.feeBps + costs.slippageBps) / 10000;
  }
  const returns = input.observations.map((o, i, all) => {
    object(o, ['date', 'return'], 'OBSERVATION'); date(o.date);
    if (i && o.date <= all[i - 1].date) throw new Error('OBSERVATIONS_NOT_STRICTLY_ORDERED');
    if (!Number.isFinite(o.return) || o.return < -1) throw new Error('INVALID_OBSERVATION_RETURN');
    const r = costs.basis === 'ALREADY_NET' ? o.return : (1 + o.return) * (1 - c) / (1 + c) - 1;
    if (!Number.isFinite(r)) throw new Error('NON_FINITE_NET_RETURN'); return r;
  });
  const blockLength = input.model === 'CIRCULAR_BLOCK' ? input.blockLength : 1;
  integer(blockLength, 1, returns.length, 'BLOCK_LENGTH');
  if (input.model === 'TRADE_IID' && input.blockLength !== undefined) throw new Error('TRADE_MODEL_HAS_NO_BLOCK_LENGTH');
  const retainPaths = input.retainPaths ?? 0;
  integer(retainPaths, 0, input.simulations, 'RETAIN_PATHS');
  if (retainPaths * (input.horizon + 1) > BUDGETS.retainedPoints) throw new Error('RETAINED_PATH_BUDGET_EXCEEDED');
  const percentiles = input.percentiles ?? [0.01, 0.05, 0.5, 0.95, 0.99];
  if (!Array.isArray(percentiles) || percentiles.length < 1 || percentiles.length > BUDGETS.percentiles || percentiles.some((p, i, a) => !Number.isFinite(p) || p < 0 || p > 1 || (i > 0 && p <= a[i - 1]))) throw new Error('INVALID_PERCENTILES');
  // Normalize defaults before hashing. No caller-owned object is mutated.
  const normalized = JSON.parse(canonical({ ...input, retainPaths, percentiles }));
  return { input: normalized, returns, blockLength, retainPaths, percentiles };
}
function runMonteCarlo(raw) {
  const { input, returns, blockLength, retainPaths, percentiles } = normalize(raw);
  const calculationRuntime = runtime(), rng = createRandom(input.seed), n = returns.length;
  const ends = [], drawdowns = [], streaks = [], totals = [], paths = [];
  for (let simulation = 0; simulation < input.simulations; simulation++) {
    let capital = input.initialCapital, peak = capital, drawdown = 0, streak = 0, longest = 0, start = 0;
    const saved = simulation < retainPaths ? { simulation, equity: [capital], sourceIndices: [] } : null;
    for (let t = 0; t < input.horizon; t++) {
      if (input.model === 'TRADE_IID' || t % blockLength === 0) start = rng.index(n);
      const index = input.model === 'TRADE_IID' ? start : (start + t % blockLength) % n;
      const r = returns[index]; capital *= 1 + r;
      if (!Number.isFinite(capital)) throw new Error('NON_FINITE_CAPITAL_PATH');
      peak = Math.max(peak, capital); drawdown = Math.min(drawdown, capital / peak - 1);
      streak = r < 0 ? streak + 1 : 0; longest = Math.max(longest, streak);
      if (saved) { saved.equity.push(capital); saved.sourceIndices.push(index); }
    }
    ends.push(capital); totals.push(capital / input.initialCapital - 1); drawdowns.push(drawdown); streaks.push(longest);
    if (saved) paths.push(saved);
  }
  // DKW quantile bands quantify finite simulation error conditional on the fixed
  // empirical resampling model. They do NOT quantify historical estimation risk.
  const alpha = 0.05, epsilon = Math.min(1, Math.sqrt(Math.log(2 / alpha) / (2 * input.simulations)));
  const payload = {
    schemaVersion: VERSION, model: input.model, synthetic: true, forecast: false, certification: 'NOT_CERTIFIED', productionApproved: false,
    sourceKind: input.provenance.sourceKind, returnBasis: input.returnBasis,
    dataEligibility: 'NOT_ESTABLISHED_BY_SIMULATION', independentEvidence: 'NOT_ESTABLISHED_BY_SIMULATION',
    modelAssumptions: input.model === 'TRADE_IID'
      ? ['EMPIRICAL_TRADE_RETURNS_ARE_IID', 'TRADES_ARE_NON_OVERLAPPING', 'NO_CALENDAR_DURATION_OR_IDLE_CASH_MODEL', 'FIXED_EMPIRICAL_DISTRIBUTION']
      : ['CIRCULAR_BLOCKS_MAY_WRAP_SOURCE_END', 'FIXED_BLOCK_LENGTH', 'OBSERVED_NET_PERIOD_RETURNS_INCLUDE_COSTS', 'REGULAR_PERIODS_DECLARED_BY_CALLER', 'FIXED_EMPIRICAL_DISTRIBUTION'],
    inputHash: sha(canonical(input)), codeHash: CODE_HASH, calculationRuntime,
    generationHash: sha(canonical({ version: VERSION, input, codeHash: CODE_HASH, calculationRuntime })),
    configuration: { seed: input.seed, simulations: input.simulations, horizon: input.horizon, initialCapital: input.initialCapital,
      blockLength: input.model === 'CIRCULAR_BLOCK' ? blockLength : null, retainPaths, percentiles, costs: input.costs },
    sample: { observations: n, distinctReturns: new Set(returns).size, sourceFrom: input.observations[0].date,
      sourceTo: input.observations.at(-1).date, nonOverlappingSourceBlocks: Math.floor(n / blockLength),
      note: 'Observation/block counts are not an estimate of independent sample size; dependence and suitability need external validation.' },
    uncertainty: { kind: 'CONDITIONAL_MONTE_CARLO_DKW', scope: 'PER_METRIC_SIMULTANEOUS_OVER_QUANTILES', alpha, cdfEpsilon: epsilon, nullBandBound: 'UNBOUNDED', bandQuantiles: 'EMPIRICAL_GENERALIZED_INVERSE', pointQuantiles: 'LINEAR_INTERPOLATION',
      note: 'Conditional numerical resampling uncertainty only; excludes parameter, data, regime, selection and future-model uncertainty.' },
    distributions: { endCapital: summarize(ends, percentiles, epsilon), totalReturn: summarize(totals, percentiles, epsilon),
      maxDrawdown: summarize(drawdowns, percentiles, epsilon), longestLossStreak: summarize(streaks, percentiles, epsilon) },
    paths, pathAxis: 'SYNTHETIC_SEQUENCE_STEP', budgets: BUDGETS,
    work: { sampledSteps: input.simulations * input.horizon, retainedPoints: retainPaths * (input.horizon + 1) },
    limitations: ['RESAMPLING_CANNOT_CREATE_MISSING_HISTORY', 'SOURCE_ELIGIBILITY_REQUIRES_EXTERNAL_EVIDENCE', 'NO_ECONOMIC_ADVANTAGE_OR_OUT_OF_SAMPLE_CLAIM']
  };
  return { ...payload, resultHash: sha(canonical(payload)) };
}
module.exports = { VERSION, BUDGETS, createRandom, runMonteCarlo };
