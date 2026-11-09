// Real-data runs of all demonstration cases through the research backtest runner (heavy, behind BACKTEST_RUNNER_FULL=1):
// key numbers must equal the committed summary, the independent Python re-computation must pass, and a second run must
// reproduce every envelope hash. Private cases (delisted series, V10 factor panel) need
//   VU_PRIVATE_DELISTED_SERIES=<dir>  VU_PRIVATE_FACTOR_PANEL=<panel.jsonl.gz>
// and are skipped cleanly (reported as skipped, not passed) when those are not set. Optional VU_BACKTEST_CACHE=<private dir>.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FULL = process.env.BACKTEST_RUNNER_FULL === '1';
const DEMOS = path.join(ROOT, 'docs/quant/backtest-demos');
const near = (a, b) => (a === null || b === null) ? a === b : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const privateOk = { delistedSeries: !!process.env.VU_PRIVATE_DELISTED_SERIES && fs.existsSync(process.env.VU_PRIVATE_DELISTED_SERIES), factorPanel: !!process.env.VU_PRIVATE_FACTOR_PANEL && fs.existsSync(process.env.VU_PRIVATE_FACTOR_PANEL) };

let built = null;
function build() {
  if (built) return built;
  const B = require('../../scripts/quant/research/build-backtest-demos.cjs');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-demos-')), qa = path.join(out, 'qa');
  const cache = process.env.VU_BACKTEST_CACHE || path.join(out, 'cache');
  const args = ['--out', out, '--cache', cache, '--qa-dir', qa];
  if (privateOk.delistedSeries) args.push('--private-delisted', process.env.VU_PRIVATE_DELISTED_SERIES);
  if (privateOk.factorPanel) args.push('--private-factor-panel', process.env.VU_PRIVATE_FACTOR_PANEL);
  const t0 = Date.now(), r = B.main(args);
  built = { out, qa, cache, ...r, seconds: (Date.now() - t0) / 1000 };
  return built;
}
const cases = JSON.parse(fs.readFileSync(path.join(DEMOS, 'cases.json'), 'utf8')).cases;
const committed = JSON.parse(fs.readFileSync(path.join(DEMOS, 'summary.json'), 'utf8')).cases;

for (const c of cases) {
  const skip = !FULL ? 'set BACKTEST_RUNNER_FULL=1 (real data, ~3 min with a warm population cache)' : c.privateData && !privateOk[c.privateData] ? 'PRIVATE_DATA_REQUIRED: ' + c.privateData + ' not available' : false;
  test('real data: demo case ' + c.id + ' reproduces the committed key numbers', { skip }, () => {
    const b = build();
    const s = b.summary.find(x => x.id === c.id), k = committed.find(x => x.id === c.id);
    assert.equal(s.state, k.state); assert.equal(s.specHash, k.specHash);
    assert.deepEqual(s.events, k.events);
    for (const f of ['totalReturn', 'cagr', 'volatility', 'maxDrawdown', 'hitRate', 'trades', 'perEventMedian', 'perEventMean', 'meanBenchmarkExcess', 'benchmarkTotalReturn']) assert.ok(near(s.metrics[f], k.metrics[f]), c.id + '.' + f + ' ' + s.metrics[f] + ' != ' + k.metrics[f]);
    assert.deepEqual(s.methods, k.methods);
    const perf = b.performance.find(x => x.id === c.id);
    console.log(JSON.stringify({ case: c.id, state: s.state, runtimeMs: perf.runtimeMs, rssMb: perf.rssMb, populationCache: perf.populationCache, resultCache: perf.resultCache }));
  });
}

test('real data: independent Python re-computation of all demo results passes', { skip: !FULL && 'set BACKTEST_RUNNER_FULL=1' }, () => {
  const b = build(), out = path.join(b.out, 'python-report.json');
  const args = ['-I', path.join(ROOT, 'scripts/quant/verify-backtest-runner.py'), '--qa-dir', b.qa, '--out', out];
  if (privateOk.delistedSeries) args.push('--private-delisted', process.env.VU_PRIVATE_DELISTED_SERIES);
  execFileSync('python3', args, { encoding: 'utf8' });
  const rep = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(rep.failures, 0); console.log(JSON.stringify({ pythonChecks: rep.checks, results: rep.results }));
});

test('real data: a second run without result cache reproduces every envelope hash (determinism)', { skip: !FULL && 'set BACKTEST_RUNNER_FULL=1' }, () => {
  const b = build();
  const R = require('../../scripts/quant/research/backtest-runner.cjs');
  for (const c of cases.filter(x => !x.privateData || privateOk[x.privateData]).filter(x => !['signal-2009-recovery', 'factor-momentum-v10-panel'].includes(x.id))) {
    const spec = JSON.parse(fs.readFileSync(path.join(DEMOS, c.spec), 'utf8'));
    const r = R.runBacktest(spec, { privateDirs: { delistedSeries: process.env.VU_PRIVATE_DELISTED_SERIES || null, factorPanel: process.env.VU_PRIVATE_FACTOR_PANEL || null } });
    assert.equal(r.envelopeHash, b.summary.find(x => x.id === c.id).envelopeHash, c.id);
  }
});
