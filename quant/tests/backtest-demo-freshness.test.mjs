// Freshness check of the committed backtest demonstration results (scripts/quant/research/check-backtest-demo-freshness.cjs):
// synthetic results in tmp, read-only against the repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts/quant/research/check-backtest-demo-freshness.cjs');
const F = require(SCRIPT);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function world() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-fresh-'));
  const results = path.join(root, 'results');
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true }); fs.mkdirSync(results);
  fs.writeFileSync(path.join(root, 'lib/a.cjs'), 'a1'); fs.writeFileSync(path.join(root, 'lib/b.cjs'), 'b1');
  const demo = (id, code) => fs.writeFileSync(path.join(results, id + '.json'),
    JSON.stringify({ kind: 'SIGNAL_BACKTEST', inputHashes: { code, certification: 'x', population: null } }));
  return { root, results, demo };
}

test('alle aufgezeichneten Code-Hashes stimmen: CURRENT', () => {
  const w = world();
  w.demo('d1', { 'lib/a.cjs': sha('a1'), 'lib/b.cjs': sha('b1') });
  const r = F.demoFreshness({ root: w.root, resultsDir: w.results });
  assert.equal(r.schemaVersion, F.SCHEMA); assert.equal(r.demos, 1);
  assert.equal(r.code.status, 'CURRENT'); assert.deepEqual(r.code.findings, []);
  assert.deepEqual(r.cases[0].codeStale, []);
});

test('geaenderte oder fehlende Code-Datei: STALE mit betroffenen Demos und beiden Hashes', () => {
  const w = world();
  w.demo('d1', { 'lib/a.cjs': sha('a0'), 'lib/b.cjs': sha('b1') });
  w.demo('d2', { 'lib/a.cjs': sha('a0'), 'lib/gone.cjs': sha('g') });
  const r = F.demoFreshness({ root: w.root, resultsDir: w.results });
  assert.equal(r.code.status, 'STALE');
  assert.deepEqual(r.code.findings.map(x => [x.file, x.cases]), [['lib/a.cjs', ['d1', 'd2']], ['lib/gone.cjs', ['d2']]]);
  assert.equal(r.code.findings[0].current, sha('a1')); assert.deepEqual(r.code.findings[0].recorded, [sha('a0')]);
  assert.equal(r.code.findings[1].current, null);
});

test('Demo ohne inputHashes oder leeres Verzeichnis bricht ab (fail closed)', () => {
  const w = world();
  assert.throws(() => F.demoFreshness({ root: w.root, resultsDir: w.results }), /NO_DEMO_RESULTS/);
  fs.writeFileSync(path.join(w.results, 'bad.json'), '{"kind":"X"}');
  assert.throws(() => F.demoFreshness({ root: w.root, resultsDir: w.results }), /DEMO_WITHOUT_INPUT_HASHES/);
});

test('CLI: --out nach tmp, --strict liefert Exit 1 nur bei Code-Befund, unbekannte Argumente Exit 2', () => {
  const w = world();
  w.demo('d1', { 'scripts/quant/research/check-backtest-demo-freshness.cjs': sha('nicht der Inhalt') });
  const out = path.join(w.root, 'rep.json');
  execFileSync(process.execPath, [SCRIPT, '--results', w.results, '--out', out], { stdio: 'pipe' });
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).code.status, 'STALE');
  const strict = () => execFileSync(process.execPath, [SCRIPT, '--results', w.results, '--strict'], { stdio: 'pipe' });
  assert.throws(strict, e => e.status === 1);
  assert.throws(() => execFileSync(process.execPath, [SCRIPT, '--bogus'], { stdio: 'pipe' }), e => e.status === 2);
});

test('committete Demos: Bericht entsteht fuer alle 16 Faelle, Befunde nennen nur aufgezeichnete Dateien', () => {
  const r = F.demoFreshness();
  assert.equal(r.demos, 16);
  for (const f of r.code.findings) {
    assert.ok(f.cases.length > 0 && f.recorded.every(h => /^[0-9a-f]{64}$/.test(h)), f.file);
    assert.notEqual(f.current, f.recorded[0]);
  }
});
