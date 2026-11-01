// Research backtest runner (scripts/quant/research/backtest-runner.cjs): fast tests on synthetic inputs (test seam deps),
// committed demonstration results, negative cases, PIT, determinism, cache and isolation. Real-data runs of all demo cases
// and the Python re-computation: quant/tests/backtest-runner-real.test.mjs (BACKTEST_RUNNER_FULL=1).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { syntheticWorld, baseSpec, NEAR_HIGH, TICKERS, fakeCertified } from './helpers/backtest-runner-fixtures.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = require('../../scripts/quant/research/backtest-runner.cjs');
const Contract = require('../engines/backtest-result-contract.cjs');
const S = require('../engines/research-studies.cjs');
const W = syntheticWorld();
const deps = (extra = {}) => ({ population: W.population, benchmark: W.benchmark, ...extra });
const cert = JSON.parse(fs.readFileSync(path.join(ROOT, R.CERTIFICATION_PATH), 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bt-runner-'));
const valid = (r, certification = cert) => { const v = Contract.validate(r.envelope, { certification }); assert.ok(v.valid, v.errors.join(',')); };
const method = (r, m) => r.envelope.methods.find(x => x.method === m);

const replaySpec = (extra = {}) => baseSpec('SAME_STOCK_REPLAY', { population: { profile: 'V10_PRIMARY', tickers: ['SYNC'] }, engine: { variant: 'RULE_EVENTS', pattern: NEAR_HIGH, cooldownBars: 13, horizonBars: 26 }, ...extra });
const signalSpec = (extra = {}) => baseSpec('SIGNAL_BACKTEST', { engine: { ruleIds: ['NEW_52W_HIGH', 'TREND_UP'], horizonBars: 26 }, ...extra });
const strategySpec = (extra = {}) => baseSpec('STRATEGY_BACKTEST', { window: { from: '2016-01-01', to: '2018-12-31' }, engine: { variant: 'FIXED_WEIGHTS', weights: 'EQUAL', rebalance: { frequency: 'sessions', everySessions: 4 } }, ...extra });

test('spec validation is fail-closed: unknown kind, method, key; method that does not fit; window after asOf', () => {
  assert.throws(() => R.validateSpec({ ...replaySpec(), kind: 'MAGIC_BACKTEST' }), /UNKNOWN_KIND/);
  assert.throws(() => R.validateSpec(replaySpec({ methods: { BOOTSTRAP: {} } })), /UNKNOWN_METHOD:BOOTSTRAP/);
  assert.throws(() => R.validateSpec(replaySpec({ methods: { PORTFOLIO_REBALANCING: {} } })), /METHOD_NOT_APPLICABLE_TO_KIND:SAME_STOCK_REPLAY:PORTFOLIO_REBALANCING/);
  assert.throws(() => R.validateSpec(baseSpec('SETUP_BACKTEST', { engine: {}, methods: { MONTE_CARLO: {} } })), /METHOD_NOT_APPLICABLE_TO_KIND/);
  assert.throws(() => R.validateSpec({ ...replaySpec(), extra: 1 }), /SPEC_UNKNOWN_KEY:spec.extra/);
  assert.throws(() => R.validateSpec(replaySpec({ engine: { variant: 'RULE_EVENTS', weights: 'EQUAL' } })), /SPEC_UNKNOWN_KEY:engine.weights/);
  assert.throws(() => R.validateSpec(replaySpec({ window: { from: '2015-01-01', to: '2025-06-30' } })), /SPEC_INVALID:window/);
  assert.throws(() => R.validateSpec({ ...replaySpec(), schemaVersion: 'x' }), /SPEC_SCHEMA_UNKNOWN/);
  assert.throws(() => R.runBacktest(replaySpec({ population: { profile: 'NO_SUCH_PROFILE', tickers: ['SYNC'] } }), { deps: deps() }), /UNKNOWN_POPULATION_PROFILE/);
  for (const k of Object.keys(R.METHOD_FIT)) assert.ok(R.METHOD_FIT[k].length > 0);
});

test('SAME_STOCK_REPLAY (rule events): valid v2 envelope, state A, methods executed, spec + input hashes inside', () => {
  const spec = replaySpec({ methods: { MONTE_CARLO: { simulations: 300, horizon: 8 }, WALK_FORWARD: { trainSize: 52, validationSize: 26, testSize: 52 }, MARKET_REGIME: {}, PARAMETER_SENSITIVITY: { dimensions: { holdingPeriods: [13, 26] }, blockLength: 13 } } });
  const r = R.runBacktest(spec, { deps: deps() });
  valid(r);
  assert.equal(r.state, 'RESEARCH_EXECUTED'); assert.equal(r.envelope.identity.kind, 'SAME_STOCK_REPLAY'); assert.equal(r.envelope.identity.scope, 'SINGLE_LISTING');
  assert.equal(r.envelope.metrics.basis, 'PER_EVENT'); assert.ok(r.envelope.events.completed > 0);
  for (const m of ['MONTE_CARLO', 'WALK_FORWARD', 'OUT_OF_SAMPLE', 'MARKET_REGIME']) assert.equal(method(r, m).state, 'EXECUTED', m);
  const p = r.envelope.spec.parameters;
  assert.equal(p.runnerSpecHash, R.specHash(spec)); assert.equal(p.inputHash, r.inputHash); assert.deepEqual(p.runnerSpec, spec);
  assert.ok(p.inputHashes.code['quant/engines/research-studies.cjs']); assert.ok(p.inputHashes.listings.ref_SYNC.sourceBytesHash);
  assert.equal(r.envelope.status.productionApproved, false); assert.ok(r.envelope.limitations.includes('NO_ALPHA_OR_CERTIFICATION_CLAIM'));
  assert.equal(r.kindPath.engine, 'research-studies.runReplayValidation');
  // One listing, few events: the block bootstrap of a grid point may refuse (EMPTY_BOOTSTRAP_SAMPLE); then the grid is NOT_RUN with the reason.
  const g = method(r, 'PARAMETER_SENSITIVITY');
  if (g.state === 'EXECUTED') { assert.equal(g.result.grid.length, 2); assert.equal(g.result.multiplicity, 'HOLM_WITHIN_REGISTERED_GRID_ONLY'); }
  else assert.match(g.result.reason, /^GRID_POINT_INFERENCE_REFUSED:EMPTY_BOOTSTRAP_SAMPLE/);
});

test('PARAMETER_SENSITIVITY on a population: recorded grid evaluated by the same engine, Holm within the grid, no parameter selected', () => {
  const r = R.runBacktest(signalSpec({ methods: { PARAMETER_SENSITIVITY: { dimensions: { holdingPeriods: [13, 26], feeBps: [5, 25] }, blockLength: 13 } } }), { deps: deps() });
  valid(r);
  const g = method(r, 'PARAMETER_SENSITIVITY');
  assert.equal(g.state, 'EXECUTED'); assert.equal(g.result.grid.length, 4); assert.equal(g.result.note, 'EXPLORATORY_ROBUSTNESS_NO_PARAMETER_SELECTED');
  assert.deepEqual(g.result.baseline, { feeBps: 5, holdingPeriods: 26 });
  for (const row of g.result.grid) assert.ok(row.adjustedPValue >= row.pValue);
});

test('determinism: same spec and inputs give the same envelope and result hash; diagnostics stay outside the hash', () => {
  const spec = signalSpec();
  const a = R.runBacktest(spec, { deps: deps() }), b = R.runBacktest(spec, { deps: deps() });
  assert.equal(a.envelopeHash, b.envelopeHash); assert.equal(a.resultHash, b.resultHash);
  assert.equal(Object.keys(a).includes('diagnostics'), false); assert.ok(a.diagnostics.runtimeMs >= 0);
  const c = R.runBacktest(signalSpec({ costs: { feeBps: 6, slippageBps: 5 } }), { deps: deps() });
  assert.notEqual(c.envelopeHash, a.envelopeHash);
});

test('windowed view: counts and statistics equal the engine inference on the window events', () => {
  const r = R.kindEvents(signalSpec(), { deps: deps() });
  assert.ok(r.events.length > 0 && r.events.every(e => e.signalDate >= '2015-01-01' && e.signalDate <= '2019-12-31'));
  assert.deepEqual(r.statistics, S.inference(r.events));
  assert.equal(r.coverage.expected, r.events.length); assert.equal(r.coverage.observed, r.events.filter(e => e.state === 'OBSERVED').length);
  assert.ok(r.window.engineEvents > r.events.length, 'engine ran over the full history');
});

test('signal history trim (warm-up + cooldown + 52 bars) leaves every window event unchanged', () => {
  const a = R.kindEvents(signalSpec({ engine: { horizonBars: 26 } }), { deps: deps() }), b = R.kindEvents(signalSpec({ engine: { horizonBars: 26 } }), { deps: deps() }, { untrimmed: true });
  assert.deepEqual(a.events, b.events); assert.deepEqual(a.statistics, b.statistics);
});

test('PIT: no input after asOf, entry strictly after the signal, no exit after asOf; outcomes do not change when later data is added', () => {
  const r = R.runBacktest(signalSpec(), { deps: deps() });
  assert.equal(r.pit.inputsAfterAsOf, 0); assert.ok(r.pit.latestInputBar <= '2024-12-31');
  assert.equal(r.pit.entryNotAfterSignal, 0); assert.equal(r.pit.exitAfterAsOf, 0);
  for (const e of r.qa.events) { assert.ok(!e.entryDate || e.entryDate > e.signalDate); if (e.state === 'OBSERVED') assert.ok(e.exitDate <= '2024-12-31'); }
  // Same window, later asOf (more future data supplied): every event observed under the earlier asOf keeps its outcome.
  const later = R.runBacktest(signalSpec({ asOf: '2026-06-30' }), { deps: deps() });
  const key = e => e.securityId + '|' + e.ruleId + '|' + e.signalDate, map = new Map(later.qa.events.map(e => [key(e), e]));
  for (const e of r.qa.events) assert.deepEqual(map.get(key(e)), e);
});

test('SIGNAL_BACKTEST with the funded variant: PORTFOLIO_REBALANCING executed through research-portfolio, Monte Carlo on the funded ledger', () => {
  const r = R.runBacktest(signalSpec({ window: { from: '2012-01-01', to: '2016-12-31' }, engine: { ruleIds: ['TREND_UP'], horizonBars: 26, funded: { rule: 'TREND_UP', maxPositions: 3, holdingWeeks: 13 } }, methods: { MONTE_CARLO: { simulations: 200, horizon: 13 }, PORTFOLIO_REBALANCING: {} } }), { deps: deps() });
  valid(r);
  const f = method(r, 'PORTFOLIO_REBALANCING');
  assert.equal(f.state, 'EXECUTED'); assert.ok(f.result.episodes > 0); assert.ok(Number.isFinite(f.result.totalReturn)); assert.match(f.result.engine, /research-portfolio/);
  assert.equal(method(r, 'MONTE_CARLO').result.model, 'CIRCULAR_BLOCK');
  assert.throws(() => R.runBacktest(signalSpec({ methods: { PORTFOLIO_REBALANCING: {} } }), { deps: deps() }), /requires engine.funded/);
});

test('PATTERN_EVIDENCE: population per-event envelope with regimes', () => {
  const r = R.runBacktest(baseSpec('PATTERN_EVIDENCE', { engine: { pattern: NEAR_HIGH, cooldownBars: 13, horizonBars: 13 }, methods: { MARKET_REGIME: {} } }), { deps: deps() });
  valid(r); assert.equal(r.envelope.identity.scope, 'POPULATION'); assert.equal(method(r, 'MARKET_REGIME').state, 'EXECUTED');
  assert.equal(method(r, 'MARKET_REGIME').result.mode, 'PIT_AVAILABLE');
});

test('STRATEGY_BACKTEST (fixed weights): portfolio envelope, backtest-metrics statistics, Monte Carlo, regime, cost sensitivity', () => {
  const r = R.runBacktest(strategySpec({ methods: { MONTE_CARLO: { simulations: 200, horizon: 26, blockLength: 4 }, MARKET_REGIME: {}, PARAMETER_SENSITIVITY: { dimensions: { feeBps: [0, 5, 25] }, blockLength: 8 } } }), { deps: deps() });
  valid(r);
  assert.equal(r.envelope.metrics.basis, 'PORTFOLIO'); assert.equal(r.envelope.period.grain, 'WEEKLY');
  assert.ok(Number.isFinite(r.envelope.metrics.excess.sharpeRiskFreeZero)); assert.equal(r.envelope.metrics.benchmark.pathStatistics.state, 'SAME_DATES');
  assert.equal(r.extras.metricsDetail.schemaVersion, 'backtest-metrics-1.0.0');
  assert.ok(Math.abs(r.extras.metricsDetail.returns.totalReturn - r.envelope.metrics.totalReturn) < 1e-12);
  for (const m of ['MONTE_CARLO', 'MARKET_REGIME', 'PARAMETER_SENSITIVITY', 'PORTFOLIO_REBALANCING']) assert.equal(method(r, m).state, 'EXECUTED', m);
  assert.equal(method(r, 'PARAMETER_SENSITIVITY').result.grid.length, 3);
  assert.equal(r.qa.portfolio.input.targets[0].executionDate > r.qa.portfolio.input.targets[0].decisionDate, true);
});

test('state B: private data unavailable, missing factor panel, profile strategy -> PREPARED_DATA_LIMITED with exact missing inputs, no numbers', () => {
  const dl = R.runBacktest({ ...replaySpec(), population: { profile: 'V13_DELISTED_F1', securityIds: ['dl_2ad5c4a973ce5a19'], privateInputs: ['delistedSeries'] } }, {});
  valid(dl); assert.equal(dl.state, 'PREPARED_DATA_LIMITED');
  assert.ok(dl.envelope.limitations.some(x => x.startsWith('MISSING_INPUT:PRIVATE_DATA_UNAVAILABLE:delistedSeries')));
  assert.equal(dl.envelope.metrics.basis, 'NONE'); assert.equal(dl.envelope.events.completed, null);
  assert.throws(() => R.runBacktest({ ...replaySpec(), population: { profile: 'V13_DELISTED_F1', securityIds: ['dl_2ad5c4a973ce5a19'] } }, { privateDirs: { delistedSeries: path.join(ROOT, 'docs') } }), /PRIVATE_DIR_INSIDE_REPOSITORY:delistedSeries/);
  const f = R.runBacktest(baseSpec('FACTOR_RANKING_BACKTEST', { engine: { factorId: 'momentum', horizonBars: 13, buckets: 5 } }), { deps: deps() });
  valid(f); assert.equal(f.state, 'PREPARED_DATA_LIMITED'); assert.ok(f.envelope.limitations.some(x => x.startsWith('MISSING_INPUT:PRIVATE_FACTOR_PANEL')));
  const p = R.runBacktest(strategySpec({ engine: { variant: 'PROFILE' } }), { deps: deps() });
  assert.equal(p.state, 'PREPARED_DATA_LIMITED'); assert.ok(p.envelope.limitations.some(x => x.includes('buildProfileTargets')));
  const none = R.runBacktest(replaySpec({ population: { profile: 'V10_PRIMARY', tickers: ['NOPE'] } }), { deps: deps() });
  assert.equal(none.state, 'PREPARED_DATA_LIMITED'); assert.ok(none.envelope.limitations.some(x => x.includes('ref_NOPE=SERIES_FILE_MISSING')));
});

test('state C only via a certification artifact that certifies the kind and follows its gates, and only on explicit request', () => {
  const ask = { status: { requestProductCertifiedState: true } };
  assert.throws(() => R.runBacktest(replaySpec(ask), { deps: deps() }), /PRODUCT_CERTIFIED_STATE_REFUSED:LIMITED/);
  // Spoofs: CERTIFIED with an open gate, or with insufficient trust -> the artifact is refused before any run.
  assert.throws(() => R.runBacktest(replaySpec(ask), { deps: deps({ certification: fakeCertified('SAME_STOCK_REPLAY', 'FAIL') }) }), /CERTIFICATION_ARTIFACT_VIOLATES_ITS_CONTRACT/);
  assert.throws(() => R.runBacktest(replaySpec(), { deps: deps({ certification: fakeCertified('SAME_STOCK_REPLAY', 'FAIL') }) }), /CERTIFICATION_ARTIFACT_VIOLATES_ITS_CONTRACT/);
  const spoof = fakeCertified('SAME_STOCK_REPLAY'); spoof.kinds[0].trust = 'NOT_READY';
  assert.throws(() => R.runBacktest(replaySpec(ask), { deps: deps({ certification: spoof }) }), /CERTIFICATION_ARTIFACT_VIOLATES_ITS_CONTRACT/);
  assert.throws(() => R.runBacktest(signalSpec(ask), { deps: deps({ certification: fakeCertified('SAME_STOCK_REPLAY') }) }), /CERTIFICATION_KIND_MISSING|PRODUCT_CERTIFIED_STATE_REFUSED/);
  const plain = R.runBacktest(replaySpec(), { deps: deps({ certification: fakeCertified('SAME_STOCK_REPLAY') }) });
  assert.equal(plain.state, 'RESEARCH_EXECUTED', 'A never becomes C automatically');
  const c = R.runBacktest(replaySpec(ask), { deps: deps({ certification: fakeCertified('SAME_STOCK_REPLAY') }) });
  assert.equal(c.state, 'PRODUCT_CERTIFIED'); valid(c, fakeCertified('SAME_STOCK_REPLAY'));
  assert.equal(Contract.validate(c.envelope, { certification: cert }).valid, false, 'the real artifact does not certify the kind');
  assert.ok(cert.kinds.every(k => k.status !== 'CERTIFIED'), 'no kind is certified today');
});

test('alpha wording in the spec is refused by the contract (no Holm-adjusted evidence)', () => {
  assert.throws(() => R.runBacktest(replaySpec({ description: 'NVDA rule with proven alpha' }), { deps: deps() }), /ALPHA_CLAIM_WITHOUT_HOLM_ADJUSTED_EVIDENCE/);
  assert.throws(() => R.runBacktest(replaySpec({ description: 'this rule beats the market' }), { deps: deps() }), /ALPHA_CLAIM_WITHOUT_HOLM_ADJUSTED_EVIDENCE/);
});

test('result cache: private directory only, key = spec hash + input hashes, identical result on hit', () => {
  const dir = tmp();
  try {
    const d = deps({ cacheTag: 'synthetic-world-1' });
    const a = R.runBacktest(replaySpec(), { deps: d, cacheDir: dir }), b = R.runBacktest(replaySpec(), { deps: d, cacheDir: dir });
    assert.equal(a.diagnostics.resultCache, 'MISS_WRITTEN'); assert.equal(b.diagnostics.resultCache, 'HIT');
    assert.equal(a.resultHash, b.resultHash); assert.equal(fs.readdirSync(dir).length, 1);
    assert.equal(R.runBacktest(replaySpec(), { deps: deps(), cacheDir: dir }).diagnostics.resultCache, 'DISABLED');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.throws(() => R.runBacktest(replaySpec(), { deps: deps(), cacheDir: path.join(ROOT, 'quant') }), /CACHE_DIR_INSIDE_REPOSITORY/);
});

test('CLI writes only --out, refuses generated-data paths and prints runtime/memory', () => {
  const dir = tmp();
  try {
    const spec = path.join(dir, 'spec.json'), out = path.join(dir, 'out', 'r.json');
    fs.writeFileSync(spec, JSON.stringify({ ...replaySpec(), population: { profile: 'V13_DELISTED_F1', securityIds: ['dl_2ad5c4a973ce5a19'], privateInputs: ['delistedSeries'] } }));
    const before = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
    const env = { ...process.env }; delete env.VU_PRIVATE_DELISTED_SERIES;
    const line = JSON.parse(execFileSync(process.execPath, ['scripts/quant/research/run-backtest.cjs', '--spec', spec, '--out', out], { cwd: ROOT, encoding: 'utf8', env }));
    assert.equal(line.state, 'PREPARED_DATA_LIMITED'); assert.ok(line.runtimeMs >= 0 && line.rssMb > 0);
    assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).envelopeHash, line.envelopeHash);
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }), before);
    assert.throws(() => execFileSync(process.execPath, ['scripts/quant/research/run-backtest.cjs', '--spec', spec, '--out', 'quant/data/x.json'], { cwd: ROOT, stdio: 'pipe' }), /OUT_INSIDE_GENERATED_DATA/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('committed demonstration cases: specs, results and summary are consistent, valid, uncertified and free of QA rows', () => {
  const dir = path.join(ROOT, 'docs/quant/backtest-demos');
  const cases = JSON.parse(fs.readFileSync(path.join(dir, 'cases.json'), 'utf8'));
  const summary = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8'));
  const kinds = new Set();
  for (const c of cases.cases) {
    const spec = JSON.parse(fs.readFileSync(path.join(dir, c.spec), 'utf8'));
    R.validateSpec(spec);
    const r = JSON.parse(fs.readFileSync(path.join(dir, 'results', c.id + '.json'), 'utf8'));
    assert.equal(r.specHash, R.specHash(spec), c.id); assert.deepEqual(r.spec, spec);
    assert.equal(r.qa, null, 'no QA rows committed: ' + c.id);
    const v = Contract.validate(r.envelope); assert.ok(v.valid, c.id + ': ' + v.errors.join(','));
    assert.equal(r.envelopeHash, r.envelope.envelopeHash); assert.equal(r.envelope.spec.parameters.runnerSpecHash, r.specHash);
    assert.notEqual(r.state, 'PRODUCT_CERTIFIED'); assert.equal(r.envelope.status.productionApproved, false);
    const s = summary.cases.find(x => x.id === c.id); assert.equal(s.envelopeHash, r.envelopeHash); assert.equal(s.state, r.state);
    if (c.privateData) assert.ok(r.envelope.limitations.includes('PRIVATE_DATA_REQUIRED') || c.privateData === 'delistedSeries' && r.envelope.dataQuality.survivorship.state === 'INCLUDES_PRIVATE_DELISTED_SERIES', c.id);
    if (r.state === 'RESEARCH_EXECUTED') kinds.add(c.kind);
  }
  assert.deepEqual([...kinds].sort(), ['FACTOR_RANKING_BACKTEST', 'PATTERN_EVIDENCE', 'SAME_STOCK_REPLAY', 'SETUP_BACKTEST', 'SIGNAL_BACKTEST', 'STRATEGY_BACKTEST']);
  const scenarios = new Set(cases.cases.flatMap(c => c.scenarios));
  for (const sc of ['BULL', 'BEAR_CRASH', 'RECOVERY', 'SIDEWAYS', 'STRONG_WINNER', 'STRONG_LOSER', 'DELISTED', 'ACQUISITION', 'DIVIDENDS', 'CORPORATE_ACTION_SPLIT']) assert.ok(scenarios.has(sc), sc);
});

test('isolation: the runner module is not wired into any product path', () => {
  for (const f of ['quant/api/product-services.js', 'quant/index.html']) assert.equal(fs.readFileSync(path.join(ROOT, f), 'utf8').includes('backtest-runner'), false, f);
  const appDir = path.join(ROOT, 'quant/app');
  for (const f of fs.readdirSync(appDir)) if (/\.(js|html|css)$/.test(f)) assert.equal(fs.readFileSync(path.join(appDir, f), 'utf8').includes('backtest-runner'), false, f);
  assert.equal(fs.existsSync(path.join(ROOT, 'quant/engines/backtest-runner.cjs')), false);
  assert.ok(TICKERS.length > 1);
});

test('independent Python re-computation (python3 -I) of synthetic runner results: per-event statistics, signal outcomes, portfolio path, PIT', () => {
  const dir = tmp();
  try {
    const runs = {
      'signal': R.runBacktest(signalSpec({ engine: { ruleIds: ['NEW_52W_HIGH', 'TREND_UP'], horizonBars: 13 } }), { deps: deps() }),
      'replay': R.runBacktest(replaySpec(), { deps: deps() }),
      'strategy': R.runBacktest(strategySpec(), { deps: deps() }),
      'strategy-monthly': R.runBacktest(strategySpec({ engine: { variant: 'FIXED_WEIGHTS', weights: { SYNA: 0.5, SYNB: 0.3, SYNC: 0.1 }, rebalance: { frequency: 'monthly' } }, costs: { feeBps: 10, slippageBps: 15 } }), { deps: deps() }),
      'prepared': R.runBacktest(strategySpec({ engine: { variant: 'PROFILE' } }), { deps: deps() }),
    };
    for (const [k, r] of Object.entries(runs)) fs.writeFileSync(path.join(dir, k + '.json'), JSON.stringify(r));
    const fixture = path.join(dir, 'fixture.json');
    fs.writeFileSync(fixture, JSON.stringify({ closes: Object.fromEntries([...W.docs].map(([id, d]) => [id, d.points])), spy: [...W.benchmark.byDate] }));
    const qa = path.join(dir, 'qa'); fs.mkdirSync(qa);
    for (const k of Object.keys(runs)) fs.renameSync(path.join(dir, k + '.json'), path.join(qa, k + '.json'));
    const out = path.join(dir, 'report.json');
    execFileSync('python3', ['-I', path.join(ROOT, 'scripts/quant/verify-backtest-runner.py'), '--qa-dir', qa, '--fixture', fixture, '--out', out], { encoding: 'utf8' });
    const rep = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(rep.failures, 0); assert.ok(rep.checks > 100);
    for (const name of ['signal.NEW_52W_HIGH.outcome', 'signal.TREND_UP.signalDates', 'metrics.hitRate', 'event.netFromGross']) assert.ok(rep.cases.signal[name].passed > 0, name);
    for (const name of ['portfolio.equityPath', 'path.cagr', 'path.maxDrawdown', 'path.annualReturns', 'portfolio.spyTotalReturn']) assert.equal(rep.cases['strategy-monthly'][name].failed, 0, name);
    assert.equal(rep.cases.prepared['stateB.noNumbers'].passed, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('state B: incomplete private delisted directory -> PREPARED_DATA_LIMITED with the count, never a hard error or a smaller population', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-incomplete-'));
  const incomplete = () => { throw Error('PRIVATE_DATA_INCOMPLETE:12 of 1675 register rows without a private file'); };
  const r = R.runBacktest({ ...replaySpec(), population: { profile: 'V13_DELISTED_F1', securityIds: ['dl_2ad5c4a973ce5a19'], privateInputs: ['delistedSeries'] } },
    { privateDirs: { delistedSeries: dir }, deps: deps({ population: incomplete }) });
  valid(r); assert.equal(r.state, 'PREPARED_DATA_LIMITED');
  assert.ok(r.envelope.limitations.some(x => x.startsWith('MISSING_INPUT:PRIVATE_DATA_INCOMPLETE:delistedSeries 12 of 1675')), JSON.stringify(r.envelope.limitations));
  assert.equal(r.envelope.metrics.basis, 'NONE');
  /* Andere Fehler bleiben harte Fehler. */
  const broken = () => { throw Error('DELISTED_POINTS_HASH_MISMATCH:x'); };
  assert.throws(() => R.runBacktest({ ...replaySpec(), population: { profile: 'V13_DELISTED_F1', securityIds: ['dl_2ad5c4a973ce5a19'], privateInputs: ['delistedSeries'] } },
    { privateDirs: { delistedSeries: dir }, deps: deps({ population: broken }) }), /DELISTED_POINTS_HASH_MISMATCH/);
});
