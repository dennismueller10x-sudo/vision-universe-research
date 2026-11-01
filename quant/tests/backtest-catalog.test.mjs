// Vorgerechneter Backtest-Katalog (scripts/quant/research/build-backtest-catalog.cjs): Raster -> Spec-Builder -> Runner.
// Schnelle Tests mit eingesetztem Runner (Test-Naht deps.runBacktest), schreiben nur nach tmp.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../../scripts/quant/research/build-backtest-catalog.cjs');
const R = require('../../scripts/quant/research/backtest-runner.cjs');
const ROOT = path.join(import.meta.dirname, '..', '..');

const fakeRun = (spec) => ({ kind: spec.kind, state: 'RESEARCH_EXECUTED', specHash: R.specHash(spec), inputHash: 'i', envelopeHash: 'e' + R.specHash(spec).slice(0, 8), resultHash: 'r' + R.specHash(spec).slice(0, 8),
  envelope: { status: { certificationStatus: 'LIMITED', evidenceKind: 'TESTED', productionApproved: false }, limitations: ['NO_ALPHA_OR_CERTIFICATION_CLAIM'] }, diagnostics: { rssMb: 100 } });
const grid = (n, budgets = {}) => { const g = C.readGrid(); return { ...g, budgets: { ...g.budgets, ...budgets }, selections: g.selections.slice(0, n) }; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bt-catalog-'));

test('committetes Raster: gueltig, alle sechs Arten, eindeutige Specs, nur registrierte Vorlagen, Budgets gesetzt', () => {
  const g = C.readGrid(), p = C.plan(g);
  assert.equal(new Set(p.map((x) => x.specHash)).size, p.length);
  assert.deepEqual([...new Set(p.map((x) => x.spec.kind))].sort(), ['FACTOR_RANKING_BACKTEST', 'PATTERN_EVIDENCE', 'SAME_STOCK_REPLAY', 'SETUP_BACKTEST', 'SIGNAL_BACKTEST', 'STRATEGY_BACKTEST']);
  for (const x of p) { assert.equal(R.validateSpec(x.spec), true); assert.equal(x.spec.status, undefined); }
  assert.ok(g.budgets.maxRuntimeMsPerRun > 0 && g.budgets.maxTotalRuntimeMs >= g.budgets.maxRuntimeMsPerRun);
});

test('Bau: Ergebnisse je specHash, Index hashgebunden, Integritaetspruefung erkennt Manipulation; Nachschlagen ohne Runner', () => {
  const out = tmp(), g = grid(4);
  const idx = C.buildCatalog({ grid: g, out, deps: { runBacktest: fakeRun } });
  assert.equal(idx.complete, true); assert.equal(idx.entries.length, 4); assert.equal(idx.productionApproved, false);
  assert.deepEqual(C.catalogViolations(out), []);
  const hit = C.lookup(out, g.selections[0].selection);
  assert.equal(hit.state, 'PRECOMPUTED'); assert.equal(hit.result.specHash, hit.specHash);
  const miss = C.lookup(out, { ...g.selections[0].selection, costPreset: 'NONE' });
  assert.equal(miss.state, 'NOT_PRECOMPUTED');
  assert.equal(C.lookup(out, { schemaVersion: 'backtest-spec-selection-1.0.0', template: 'nope' }).code, 'UNKNOWN_TEMPLATE');
  const f = path.join(out, 'results', idx.entries[1].specHash + '.json'); const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  fs.writeFileSync(f, JSON.stringify({ ...r, resultHash: 'x' }));
  assert.ok(C.catalogViolations(out).some((e) => e.startsWith('RESULT_MISMATCH')));
  fs.writeFileSync(path.join(out, 'results', 'fremd.json'), '{}');
  assert.ok(C.catalogViolations(out).includes('STRAY_RESULT:fremd.json'));
});

test('Budgets: Ueberschreitung stoppt den Bau (fail closed) und steht im Index', () => {
  let t = 0; const now = () => (t += 1000);
  const idx = C.buildCatalog({ grid: grid(5, { maxRuntimeMsPerRun: 500 }), out: tmp(), deps: { runBacktest: fakeRun, now } });
  assert.equal(idx.complete, false); assert.match(idx.stopped, /^RUN_BUDGET_EXCEEDED/); assert.equal(idx.entries.length, 1); assert.equal(idx.entries[0].budget, 'EXCEEDED');
  t = 0;
  const tot = C.buildCatalog({ grid: grid(5, { maxRuntimeMsPerRun: 5000, maxTotalRuntimeMs: 2500 }), out: tmp(), deps: { runBacktest: fakeRun, now } });
  assert.equal(tot.stopped, 'TOTAL_BUDGET_EXCEEDED'); assert.equal(tot.entries.length, 3);
});

test('verweigert: Ziel in generierten Daten, abweichender specHash des Runners, doppelte Spec im Raster', () => {
  assert.throws(() => C.buildCatalog({ grid: grid(1), out: path.join(ROOT, 'quant/data/x'), deps: { runBacktest: fakeRun } }), /OUT_INSIDE_GENERATED_DATA/);
  assert.throws(() => C.buildCatalog({ grid: grid(1), out: tmp(), deps: { runBacktest: (s) => ({ ...fakeRun(s), specHash: 'anders' }) } }), /RUNNER_SPEC_HASH_MISMATCH/);
  const g = grid(1); g.selections = [g.selections[0], g.selections[0]];
  assert.throws(() => C.plan(g), /GRID_DUPLICATE_SPEC/);
});

test('committeter Katalog: vollstaendig, integer, an Raster und Spec-Builder gebunden, nichts zertifiziert', () => {
  const dir = path.join(ROOT, 'docs/quant/backtest-catalog');
  assert.deepEqual(C.catalogViolations(dir), []);
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
  assert.equal(idx.complete, true); assert.equal(idx.productionApproved, false);
  assert.equal(idx.gridHash, C.sha(C.readGrid()), 'Raster seit dem Bau geaendert: Katalog neu rechnen ([v13-archive:catalog])');
  assert.deepEqual(idx.entries.map((e) => e.specHash).sort(), C.plan(C.readGrid()).map((p) => p.specHash).sort(), 'Spec-Builder liefert andere Specs: Katalog neu rechnen');
  assert.ok(idx.entries.every((e) => e.certificationStatus !== 'CERTIFIED' && e.productionApproved === false));
  const v = JSON.parse(fs.readFileSync(path.join(dir, 'verify-report.json'), 'utf8'));
  assert.equal(v.results, idx.entries.length); assert.equal(v.failures, 0);
  const hit = C.lookup(dir, C.readGrid().selections[5].selection);
  assert.equal(hit.state, 'PRECOMPUTED');
});
