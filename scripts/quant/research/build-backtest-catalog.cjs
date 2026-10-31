#!/usr/bin/env node
'use strict';
// Precomputed backtest catalog for the internal preview: a registered grid of selections
// (docs/quant/backtest-catalog/grid.json) -> spec builder (registered templates, validateSpec) -> the existing research
// runner -> hash-bound results keyed by specHash. No second engine: every number comes from runBacktest. Budgets are
// enforced per run (runtime, memory) and in total; a breach stops the build (fail closed) and is recorded in the index.
//   node scripts/quant/research/build-backtest-catalog.cjs --out <dir> [--grid <grid.json>] [--cache <private dir>]
//        [--private-delisted <dir>] [--private-factor-panel <file>] [--qa-dir <private dir>]
// Writes <out>/results/<specHash>.json (runner result without the QA block) and <out>/catalog.json (index with
// catalogHash). With --qa-dir the full results (QA block) go there for verify-backtest-runner.py. Never writes into
// generated data roots. lookup(catalogDir, selection) answers a selection with PRECOMPUTED / NOT_PRECOMPUTED / a safe code.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const R = require('./backtest-runner.cjs');
const B = require('./backtest-spec-builder.cjs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const GRID = path.join(ROOT, 'docs/quant/backtest-catalog/grid.json');
const GRID_SCHEMA = 'backtest-catalog-grid-1.0.0';
const SCHEMA = 'backtest-catalog-1.0.0';
const GENERATED = ['quant/data', 'discover/data', 'supertrader/data', 'social/data'].map(p => path.join(ROOT, p));

const canonical = x => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((o, kk) => (o[kk] = v[kk], o), {}) : v));
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : canonical(x)).digest('hex');
const fail = (code, detail) => { const e = new Error(code + (detail ? ':' + detail : '')); e.code = code; throw e; };

function readGrid(file = GRID) {
  const g = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (g.schemaVersion !== GRID_SCHEMA) fail('GRID_SCHEMA_UNKNOWN');
  const b = g.budgets || {};
  for (const k of ['maxRuntimeMsPerRun', 'maxRssMbPerRun', 'maxTotalRuntimeMs', 'maxEntries']) if (!Number.isSafeInteger(b[k]) || b[k] <= 0) fail('GRID_BUDGET_INVALID', k);
  if (!Array.isArray(g.selections) || !g.selections.length || g.selections.length > b.maxEntries) fail('GRID_SELECTIONS_INVALID');
  return g;
}

/** Grid -> validated specs (pure; no execution). Duplicate specs are refused. */
function plan(grid, templates = B.loadTemplates()) {
  const seen = new Set();
  return grid.selections.map((s, i) => {
    const r = B.buildSpec(s.selection, templates);
    if (!r.ok) fail('GRID_SELECTION_REJECTED', i + ':' + r.code);
    if (seen.has(r.specHash)) fail('GRID_DUPLICATE_SPEC', i + ':' + r.specHash);
    seen.add(r.specHash);
    return { label: s.label, selection: s.selection, selectionHash: sha(s.selection), template: r.template, spec: r.spec, specHash: r.specHash };
  });
}

function insideGenerated(dir) { const p = path.resolve(dir); return GENERATED.some(g => p === g || p.startsWith(g + path.sep)); }

/** Runs the plan through the runner. deps.runBacktest and deps.now are test seams. */
function buildCatalog({ grid, out, qaDir = null, runOptions = {}, deps = {} }) {
  if (!out) fail('OUT_REQUIRED');
  if (insideGenerated(out) || (qaDir && insideGenerated(qaDir))) fail('OUT_INSIDE_GENERATED_DATA');
  const run = deps.runBacktest || R.runBacktest, now = deps.now || (() => Date.now());
  const items = plan(grid, deps.templates);
  const budgets = grid.budgets;
  fs.mkdirSync(path.join(out, 'results'), { recursive: true });
  if (qaDir) fs.mkdirSync(qaDir, { recursive: true });
  const entries = []; let total = 0, stopped = null;
  for (const it of items) {
    const t0 = now();
    const r = run(it.spec, runOptions);
    const ms = Math.max(0, now() - t0), rss = (r.diagnostics && r.diagnostics.rssMb) || Math.round(process.memoryUsage().rss / 1e6);
    total += ms;
    if (r.specHash !== it.specHash) fail('RUNNER_SPEC_HASH_MISMATCH', it.label);
    const env = r.envelope;
    const entry = { label: it.label, selectionHash: it.selectionHash, template: it.template, kind: r.kind, specHash: r.specHash, state: r.state,
      certificationStatus: env.status.certificationStatus, evidenceKind: env.status.evidenceKind, productionApproved: env.status.productionApproved,
      envelopeHash: r.envelopeHash, resultHash: r.resultHash, inputHash: r.inputHash,
      privateInputs: it.spec.population.privateInputs || [], missingInputs: env.limitations.filter(l => l.startsWith('MISSING_INPUT:')),
      runtimeMs: ms, rssMb: rss };
    if (ms > budgets.maxRuntimeMsPerRun || rss > budgets.maxRssMbPerRun) { entry.budget = 'EXCEEDED'; stopped = 'RUN_BUDGET_EXCEEDED:' + it.label; }
    fs.writeFileSync(path.join(out, 'results', r.specHash + '.json'), JSON.stringify({ ...r, qa: null }, null, 1) + '\n');
    if (qaDir) fs.writeFileSync(path.join(qaDir, r.specHash + '.json'), JSON.stringify(r));
    entries.push(entry);
    if (!stopped && total > budgets.maxTotalRuntimeMs) stopped = 'TOTAL_BUDGET_EXCEEDED';
    if (stopped) break;
  }
  const body = { schemaVersion: SCHEMA, runner: R.VERSION, gridHash: sha(grid), budgets, complete: !stopped && entries.length === items.length, stopped,
    certificationStatus: 'NOT_CERTIFIED', productionApproved: false, claim: 'NO_ALPHA_OR_CERTIFICATION_CLAIM', entries };
  const index = { ...body, catalogHash: sha(body) };
  fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify(index, null, 1) + '\n');
  return index;
}

/** Integrity of a written catalog: index hash, every result present and hash-identical, no stray file. */
function catalogViolations(dir) {
  const errors = [];
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
  const { catalogHash, ...body } = idx;
  if (sha(body) !== catalogHash) errors.push('CATALOG_HASH_MISMATCH');
  if (idx.productionApproved !== false || idx.certificationStatus !== 'NOT_CERTIFIED') errors.push('CATALOG_CLAIMS_CERTIFICATION');
  const files = new Set(fs.readdirSync(path.join(dir, 'results')));
  for (const e of idx.entries) {
    const f = e.specHash + '.json';
    if (!files.has(f)) { errors.push('RESULT_MISSING:' + e.specHash); continue; }
    files.delete(f);
    const r = JSON.parse(fs.readFileSync(path.join(dir, 'results', f), 'utf8'));
    if (r.specHash !== e.specHash || r.envelopeHash !== e.envelopeHash || r.resultHash !== e.resultHash || r.state !== e.state) errors.push('RESULT_MISMATCH:' + e.specHash);
    if (r.envelope && r.envelope.status && r.envelope.status.productionApproved !== false) errors.push('RESULT_PRODUCTION_APPROVED:' + e.specHash);
  }
  for (const f of files) errors.push('STRAY_RESULT:' + f);
  return errors;
}

/** Selection -> precomputed result. Never runs the runner. */
function lookup(dir, selection, templates) {
  const r = B.buildSpec(selection, templates);
  if (!r.ok) return { state: 'REJECTED', code: r.code };
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
  const e = idx.entries.find(x => x.specHash === r.specHash);
  if (!e) return { state: 'NOT_PRECOMPUTED', specHash: r.specHash };
  const result = JSON.parse(fs.readFileSync(path.join(dir, 'results', e.specHash + '.json'), 'utf8'));
  if (result.resultHash !== e.resultHash) return { state: 'REJECTED', code: 'CATALOG_RESULT_MISMATCH' };
  return { state: 'PRECOMPUTED', specHash: r.specHash, entry: e, result };
}

if (require.main === module) {
  const argv = process.argv.slice(2), at = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  try {
    const grid = readGrid(at('--grid') || GRID);
    const idx = buildCatalog({ grid, out: at('--out'), qaDir: at('--qa-dir'),
      runOptions: { cacheDir: at('--cache'), privateDirs: { delistedSeries: at('--private-delisted'), factorPanel: at('--private-factor-panel') } } });
    console.log(JSON.stringify({ entries: idx.entries.length, complete: idx.complete, stopped: idx.stopped, catalogHash: idx.catalogHash,
      states: idx.entries.reduce((m, e) => (m[e.state] = (m[e.state] || 0) + 1, m), {}) }));
    if (!idx.complete) process.exitCode = 3;
  } catch (e) { console.error('ABBRUCH: ' + String(e.code || e.message)); process.exitCode = 2; }
}
module.exports = { SCHEMA, GRID_SCHEMA, readGrid, plan, buildCatalog, catalogViolations, lookup, sha };
