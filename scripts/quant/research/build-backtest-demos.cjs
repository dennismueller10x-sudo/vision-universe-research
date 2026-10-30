#!/usr/bin/env node
'use strict';
// Runs the demonstration cases of docs/quant/backtest-demos/cases.json through the research backtest runner.
//   node scripts/quant/research/build-backtest-demos.cjs --out <dir> [--cache <private dir>] [--private-delisted <dir>]
//        [--private-factor-panel <panel.jsonl.gz>] [--qa-dir <private dir>] [--only <case id>]
// Writes <out>/results/<id>.json (runner result without the QA block: derived statistics and envelopes only),
// <out>/summary.json (key numbers, deterministic) and <out>/performance.json (measured runtime/memory per case).
// With --qa-dir the full results (with the QA block for the independent Python check) go to that private directory.
// Cases that need private data and do not get it end in state B (PREPARED_DATA_LIMITED) and are marked as such.
const fs = require('node:fs');
const path = require('node:path');
const R = require('./backtest-runner.cjs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const CASES = path.join(ROOT, 'docs/quant/backtest-demos/cases.json');

function parse(argv) {
  const o = {}, flags = { '--out': 'out', '--cache': 'cache', '--private-delisted': 'delisted', '--private-factor-panel': 'factorPanel', '--qa-dir': 'qaDir', '--only': 'only' };
  for (let i = 0; i < argv.length; i += 2) { const k = flags[argv[i]]; if (!k || !argv[i + 1] || o[k] !== undefined) throw Error('INVALID_ARGUMENTS:' + argv[i]); o[k] = argv[i + 1]; }
  if (!o.out) throw Error('OUT_REQUIRED');
  return o;
}
const num = x => typeof x === 'number' && Number.isFinite(x) ? x : null;
function keyNumbers(c, r) {
  const e = r.envelope, m = e.metrics, ex = r.extras || {};
  const method = id => e.methods.find(x => x.method === id);
  const funded = method('PORTFOLIO_REBALANCING');
  const row = { id: c.id, kind: c.kind, scenarios: c.scenarios, privateData: c.privateData, state: r.state, certificationStatus: e.status.certificationStatus, evidenceKind: e.status.evidenceKind,
    specHash: r.specHash, inputHash: r.inputHash, envelopeHash: r.envelopeHash, resultHash: r.resultHash, period: e.period,
    listings: r.population && Array.isArray(r.population.listings) ? r.population.listings.map(l => l.securityId) : r.population ? r.population.listings || [] : [],
    excluded: r.population && r.population.excluded ? (Array.isArray(r.population.excluded) && r.population.excluded.length > 20 ? { count: r.population.excluded.length } : r.population.excluded) : [],
    events: { occurrences: e.events.occurrences, completed: e.events.completed, immature: e.events.immature, censored: e.events.censored, ineligible: e.events.ineligible },
    metrics: { basis: m.basis, totalReturn: num(m.totalReturn), cagr: num(m.cagr), volatility: num(m.volatility), maxDrawdown: num(m.maxDrawdown), hitRate: num(m.hitRate), trades: num(m.trades), turnover: num(m.turnover), cashShare: num(m.cashShare),
      perEventMedian: m.perEvent ? num(m.perEvent.median) : null, perEventMean: m.perEvent ? num(m.perEvent.mean) : null, meanBenchmarkExcess: m.excess && 'meanExcess' in m.excess ? num(m.excess.meanExcess) : null,
      benchmarkTotalReturn: m.benchmark && 'totalReturn' in m.benchmark ? num(m.benchmark.totalReturn) : null, sharpeRiskFreeZero: m.excess ? num(m.excess.sharpeRiskFreeZero) : null,
      versusPriceOnly: m.excess && m.excess.versusPriceOnly ? m.excess.versusPriceOnly : null, factor: m.perEvent && m.perEvent.factor ? m.perEvent.factor : null },
    interval95: e.uncertainty ? e.uncertainty.interval : null,
    methods: Object.fromEntries(e.methods.map(x => [x.method, x.state])),
    funded: funded && funded.state === 'EXECUTED' && c.kind === 'SIGNAL_BACKTEST' ? { rule: funded.result.rule, totalReturn: funded.result.totalReturn, cagr: funded.result.cagr, maxDrawdown: funded.result.maxDrawdown, spyTotalReturn: funded.result.benchmark ? funded.result.benchmark.totalReturn : null, episodes: funded.result.episodes } : null,
    dataQuality: { totalReturnBasis: e.dataQuality.totalReturnBasis, warnings: e.dataQuality.warnings.length, terminal: e.dataQuality.terminal || null, survivorship: e.dataQuality.survivorship },
    missingInputs: e.limitations.filter(x => x.startsWith('MISSING_INPUT:')), limitations: e.limitations.length, pit: r.pit || null };
  if (ex.windowEvents !== undefined) row.engine = { engineEvents: ex.engineEvents, windowEvents: ex.windowEvents };
  return row;
}
function main(argv = process.argv.slice(2)) {
  const o = parse(argv);
  const cases = JSON.parse(fs.readFileSync(CASES, 'utf8')).cases.filter(c => !o.only || c.id === o.only);
  fs.mkdirSync(path.join(o.out, 'results'), { recursive: true });
  if (o.qaDir) fs.mkdirSync(o.qaDir, { recursive: true });
  const summary = [], performance = [];
  for (const c of cases) {
    const spec = JSON.parse(fs.readFileSync(path.join(path.dirname(CASES), c.spec), 'utf8'));
    const r = R.runBacktest(spec, { cacheDir: o.cache || null, privateDirs: { delistedSeries: o.delisted || null, factorPanel: o.factorPanel || null } });
    fs.writeFileSync(path.join(o.out, 'results', c.id + '.json'), JSON.stringify({ ...r, qa: null }, null, 1) + '\n');
    if (o.qaDir) fs.writeFileSync(path.join(o.qaDir, c.id + '.json'), JSON.stringify(r));
    summary.push(keyNumbers(c, r));
    performance.push({ id: c.id, kind: c.kind, state: r.state, ...r.diagnostics });
    console.log(JSON.stringify({ id: c.id, state: r.state, ...r.diagnostics }));
  }
  const write = (f, x) => fs.writeFileSync(path.join(o.out, f), JSON.stringify(x, null, 1) + '\n');
  if (!o.only) {
    write('summary.json', { schemaVersion: 'backtest-demo-summary-1.0.0', runner: R.VERSION, certificationStatus: 'NOT_CERTIFIED', productionApproved: false, cases: summary });
    write('performance.json', { schemaVersion: 'backtest-demo-performance-1.0.0', note: 'Measured on one machine; cache states as listed (population cache warm unless MISS). Not part of any result hash.', node: process.version, cases: performance });
  }
  return { summary, performance };
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.stack); process.exitCode = 1; } }
module.exports = { main, keyNumbers };
