// P0.5: run-backtest.cjs --help und Pruefung der eigenen Ausgabe gegen den Ergebnisvertrag (fail closed, nur --out).
// P0.7: Kennzahlen-Hash ohne Laufzeitbezug (scripts/quant/research/backtest-metrics-hash.cjs), zusaetzlich zu den
// bestehenden Hashes; zwei verschiedene Node-Binaere liefern denselben Kennzahlen-Hash.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syntheticWorld, baseSpec } from './helpers/backtest-runner-fixtures.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = require('../../scripts/quant/research/backtest-runner.cjs');
const CLI = require('../../scripts/quant/research/run-backtest.cjs');
const MH = require('../../scripts/quant/research/backtest-metrics-hash.cjs');
const W = syntheticWorld();
const deps = () => ({ population: W.population, benchmark: W.benchmark });
const cert = JSON.parse(fs.readFileSync(path.join(ROOT, R.CERTIFICATION_PATH), 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bt-cli-'));
const clone = x => JSON.parse(JSON.stringify(x));
const strategySpec = () => baseSpec('STRATEGY_BACKTEST', { window: { from: '2016-01-01', to: '2018-12-31' }, engine: { variant: 'FIXED_WEIGHTS', weights: 'EQUAL', rebalance: { frequency: 'sessions', everySessions: 4 } }, methods: { MONTE_CARLO: { simulations: 200, horizon: 26, blockLength: 4 } } });
const git = () => execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
const reseal = r => { const b = { ...r }; delete b.resultHash; return { ...r, resultHash: R.hash(b) }; };

test('P0.5 --help: Aufruf, Pflichtangaben und fail closed beschrieben; schreibt nichts', () => {
  const before = git();
  for (const flag of ['--help', '-h']) {
    const r = spawnSync(process.execPath, ['scripts/quant/research/run-backtest.cjs', flag], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    for (const s of ['--spec', '--out', '--cache', '--private-delisted', '--private-factor-panel', '--no-qa', 'Ergebnisvertrag', 'nichts']) assert.ok(r.stdout.includes(s), s);
  }
  assert.equal(git(), before);
  assert.equal(spawnSync(process.execPath, ['scripts/quant/research/run-backtest.cjs'], { cwd: ROOT, encoding: 'utf8' }).status, 1);
});

test('P0.5 checkResult: gueltiges Ergebnis ohne Verstoss, jede Manipulation wird erkannt', () => {
  const spec = strategySpec();
  const r = R.runBacktest(spec, { deps: deps() });
  assert.deepEqual(CLI.checkResult(r, spec, cert), []);
  const metric = clone(r); metric.envelope.metrics.totalReturn += 0.01;
  assert.ok(CLI.checkResult(metric, spec, cert).includes('ENVELOPE:ENVELOPE_HASH_MISMATCH'));
  assert.ok(CLI.checkResult(metric, spec, cert).includes('RESULT_HASH_MISMATCH'));
  const approved = clone(r); approved.envelope.status.productionApproved = true;
  assert.ok(CLI.checkResult(reseal(approved), spec, cert).includes('PRODUCTION_APPROVAL_FORBIDDEN'));
  const certified = clone(r); certified.state = 'PRODUCT_CERTIFIED';
  const v = CLI.checkResult(reseal(certified), spec, cert);
  assert.ok(v.includes('STATE_MISMATCH') && v.includes('PRODUCT_CERTIFIED_WITHOUT_REQUEST'), v.join(','));
  assert.ok(CLI.checkResult(r, { ...spec, id: 'anders' }, cert).includes('SPEC_HASH_MISMATCH'));
  assert.deepEqual(CLI.checkResult(null, spec, cert), ['RESULT_NOT_AN_OBJECT']);
});

test('P0.5 main: Vertragsverstoss schreibt nichts (fail closed); gueltiges Ergebnis landet nur in --out', () => {
  const dir = tmp(), orig = R.runBacktest;
  try {
    const spec = strategySpec(), specFile = path.join(dir, 'spec.json'), out = path.join(dir, 'out', 'r.json');
    fs.writeFileSync(specFile, JSON.stringify(spec));
    const good = orig(spec, { deps: deps() });
    R.runBacktest = () => { const x = clone(good); x.envelope.metrics.totalReturn = 9; return x; };
    assert.throws(() => CLI.main(['--spec', specFile, '--out', out], { stdout: () => {} }), /RESULT_CONTRACT_VIOLATION:.*ENVELOPE_HASH_MISMATCH/);
    assert.equal(fs.existsSync(out), false);
    assert.equal(fs.existsSync(path.dirname(out)) ? fs.readdirSync(path.dirname(out)).length : 0, 0);
    R.runBacktest = () => good;
    let line = '';
    assert.equal(CLI.main(['--spec', specFile, '--out', out], { stdout: s => { line += s; } }), 0);
    const summary = JSON.parse(line);
    assert.equal(summary.contract, 'VALID'); assert.equal(summary.metricsHash, MH.metricsHash(good)); assert.equal(summary.resultHash, good.resultHash);
    assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).resultHash, good.resultHash, 'Ergebnisdatei unveraendert (kein Zusatzfeld)');
    assert.deepEqual(fs.readdirSync(path.dirname(out)), ['r.json'], 'keine Zwischendatei bleibt liegen');
  } finally { R.runBacktest = orig; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('P0.7 Kennzahlen-Hash: ohne Hash- und Laufzeitfelder, empfindlich fuer jede Zahl', () => {
  const r = R.runBacktest(strategySpec(), { deps: deps() });
  const h = MH.metricsHash(r);
  assert.match(h, /^[0-9a-f]{64}$/); assert.notEqual(h, r.envelopeHash); assert.notEqual(h, r.resultHash);
  const runtime = clone(r);
  for (const m of runtime.envelope.methods) if (m.result && m.result.resultHash) m.result.resultHash = 'f'.repeat(64);
  runtime.envelope.metrics.runtime = { node: 'v99.0.0', nodeBinaryHash: 'e'.repeat(64) };
  runtime.envelope.dataQuality.survivorship.control = runtime.envelope.dataQuality.survivorship.control.replace(/[0-9a-f]{16}/, '0123456789abcdef');
  assert.equal(MH.metricsHash(runtime), h, 'Laufzeit, Hash-Felder und eingebettete Hash-Praefixe gehen nicht ein');
  const changed = clone(r); changed.envelope.metrics.totalReturn += 1e-12;
  assert.notEqual(MH.metricsHash(changed), h);
  const lim = clone(r); lim.envelope.limitations.push('X');
  assert.notEqual(MH.metricsHash(lim), h);
  assert.throws(() => MH.metricsHash({}), /ENVELOPE_MISSING/);
});

test('P0.7 committete Katalog- und Demoergebnisse: Kennzahlen-Hash berechenbar, bestehende Hashes unberuehrt', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant/backtest-catalog/catalog.json'), 'utf8'));
  for (const dir of ['docs/quant/backtest-catalog/results', 'docs/quant/backtest-demos/results']) {
    const files = fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.json'));
    assert.ok(files.length >= 16, dir);
    const seen = new Set();
    for (const f of files) {
      const r = JSON.parse(fs.readFileSync(path.join(ROOT, dir, f), 'utf8'));
      const e = catalog.entries.find(x => x.specHash + '.json' === f);
      if (dir.includes('catalog')) { assert.ok(e, f); assert.equal(r.resultHash, e.resultHash); assert.equal(r.envelopeHash, e.envelopeHash); }
      const before = JSON.stringify(r);
      seen.add(MH.metricsHash(r));
      assert.equal(JSON.stringify(r), before, 'die Hilfsfunktion veraendert das Ergebnis nicht');
    }
    assert.equal(seen.size, files.length, dir + ': verschiedene Faelle, verschiedene Kennzahlen-Hashes');
  }
});

test('P0.7 zwei verschiedene Node-Binaere: gleicher Kennzahlen-Hash, verschiedener Umschlag-Hash', (t) => {
  const dir = tmp();
  try {
    const alt = path.join(dir, 'node-alt');
    try { fs.copyFileSync(process.execPath, alt); fs.appendFileSync(alt, Buffer.from('VU-P0.7')); fs.chmodSync(alt, 0o755); execFileSync(alt, ['-e', '0']); }
    catch (e) { t.skip('zweites Node-Binaer nicht ausfuehrbar: ' + e.message); return; }
    const script = path.join(dir, 'run.mjs');
    fs.writeFileSync(script, [
      "import { createRequire } from 'node:module';",
      "import { syntheticWorld, baseSpec } from " + JSON.stringify(pathToFileURL(path.join(ROOT, 'quant/tests/helpers/backtest-runner-fixtures.mjs')).href) + ';',
      "const require = createRequire(" + JSON.stringify(pathToFileURL(path.join(ROOT, 'quant/tests/x.mjs')).href) + ');',
      "const R = require('../../scripts/quant/research/backtest-runner.cjs'), MH = require('../../scripts/quant/research/backtest-metrics-hash.cjs');",
      'const W = syntheticWorld();',
      'const spec = baseSpec(' + JSON.stringify('STRATEGY_BACKTEST') + ', ' + JSON.stringify({ window: { from: '2016-01-01', to: '2018-12-31' }, engine: { variant: 'FIXED_WEIGHTS', weights: 'EQUAL', rebalance: { frequency: 'sessions', everySessions: 4 } }, methods: { MONTE_CARLO: { simulations: 200, horizon: 26, blockLength: 4 } } }) + ');',
      'const r = R.runBacktest(spec, { deps: { population: W.population, benchmark: W.benchmark } });',
      'process.stdout.write(JSON.stringify({ metricsHash: MH.metricsHash(r), envelopeHash: r.envelopeHash }));'
    ].join('\n'));
    const a = JSON.parse(execFileSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' }));
    const b = JSON.parse(execFileSync(alt, [script], { cwd: ROOT, encoding: 'utf8' }));
    assert.equal(a.metricsHash, b.metricsHash);
    assert.notEqual(a.envelopeHash, b.envelopeHash, 'der Umschlag bindet den Binaer-Hash mittelbar (Grund fuer P0.7)');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
