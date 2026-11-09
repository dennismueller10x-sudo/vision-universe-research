import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, '..', '..');
const K = require('../engines/backtest-kinds.cjs');
const read = p => readFileSync(join(root, p), 'utf8');
const json = p => JSON.parse(read(p));
const sorted = list => [...new Set(list)].sort();
const mapped = name => Object.keys(K.TAXONOMIES[name].map).sort();

/* Jede Taxonomie wird aus den echten Dateien gelesen - nicht aus dieser Registry. */
function found() {
  const readinessSource = [...read('scripts/quant/build-backtest-readiness.mjs').matchAll(/\{ id: "([A-Z])", key: "([A-Z_]+)"/g)];
  const readinessArtifact = json('quant/data/product/backtest-readiness-v2.json').kinds;
  const evidenceSource = [...read('scripts/quant/build-evidence-status.mjs').matchAll(/\{ id: "([A-Z_]+)", label:/g)].map(m => m[1]);
  const evidenceArtifact = json('quant/data/product/evidence-status-v1.json').kinds.map(k => k.id);
  const studies = [...read('quant/engines/research-studies.cjs').matchAll(/finish\(c, '([A-Z_]+)'/g)].map(m => m[1]);
  return {
    certification: { source: Object.keys(json('quant/methodology/backtest-certification-v1.json').kinds), artifact: json('quant/data/product/backtest-certification-v1.json').kinds.map(k => k.id) },
    readinessV2Id: { source: readinessSource.map(m => m[1]), artifact: readinessArtifact.map(k => k.id) },
    readinessV2Key: { source: readinessSource.map(m => m[2]), artifact: readinessArtifact.map(k => k.key) },
    evidenceStatus: { source: evidenceSource, artifact: evidenceArtifact },
    researchArea: { source: require('../engines/research-contract.cjs').AREAS },
    runResearchMethod: { source: Object.keys(require('../../scripts/quant/run-research.cjs').METHODS) },
    researchStudyKind: { source: studies }
  };
}

test('every id found in the real taxonomy files is mapped, and no mapping is stale', () => {
  const f = found();
  assert.deepEqual(Object.keys(f).sort(), Object.keys(K.TAXONOMIES).sort());
  for (const [name, sources] of Object.entries(f)) {
    for (const [where, ids] of Object.entries(sources)) {
      assert.ok(ids.length >= 5, name + '/' + where + ' found only ' + ids.length + ' ids - is the reader still reading the right file?');
      assert.deepEqual(sorted(ids), mapped(name), name + '/' + where + ' differs from the registry mapping');
    }
  }
});

test('readiness id and key resolve to the same canonical kind; F/MARKET_PATTERN_BACKTEST is PATTERN_EVIDENCE', () => {
  for (const k of json('quant/data/product/backtest-readiness-v2.json').kinds) assert.equal(K.kindOf('readinessV2Id', k.id), K.kindOf('readinessV2Key', k.key), k.id);
  assert.equal(K.kindOf('readinessV2Id', 'F'), 'PATTERN_EVIDENCE');
  assert.equal(K.kindOf('readinessV2Key', 'MARKET_PATTERN_BACKTEST'), 'PATTERN_EVIDENCE');
  assert.equal(K.kindOf('evidenceStatus', 'HISTORICAL_REPLAY'), 'SAME_STOCK_REPLAY');
  assert.equal(K.kindOf('researchStudyKind', 'SAME_STOCK_REPLAY_RULE'), 'SAME_STOCK_REPLAY');
});

test('the run-research CLI names agree with the area each method writes', () => {
  const R = require('../../scripts/quant/run-research.cjs');
  for (const [name, [area]] of Object.entries(R.METHODS)) assert.deepEqual(K.resolve('runResearchMethod', name), K.resolve('researchArea', area), name);
});

test('every id resolves to exactly one kind or one method; canonical lists match the research contract', () => {
  const areas = require('../engines/research-contract.cjs').AREAS;
  assert.deepEqual([...K.KINDS, ...K.METHODS], [...areas]);
  for (const [name, t] of Object.entries(K.TAXONOMIES)) for (const [id, r] of Object.entries(t.map)) {
    assert.ok((r.kind === null) !== (r.method === null), name + ':' + id);
    if (r.kind) assert.ok(K.isKind(r.kind)); else assert.ok(K.isMethod(r.method));
  }
  for (const kind of K.KINDS) assert.deepEqual(K.idsFor('certification', kind), [kind]);
  assert.deepEqual(K.idsFor('evidenceStatus', 'FACTOR_RANKING_BACKTEST'), [], 'evidence-status does not list factor ranking');
  const rows = K.table(); assert.equal(rows.length, 13); assert.ok(rows.every(r => r.researchArea.length === 1));
});

test('unknown ids, unknown taxonomies and methods-as-kinds fail closed', () => {
  assert.throws(() => K.resolve('certification', 'MARKET_PATTERN_BACKTEST'), /UNKNOWN_TAXONOMY_ID/);
  assert.throws(() => K.resolve('readinessV2Id', 'G'), /UNKNOWN_TAXONOMY_ID/);
  assert.throws(() => K.resolve('evidenceStatus', 'FACTOR_RANKING_BACKTEST'), /UNKNOWN_TAXONOMY_ID/);
  assert.throws(() => K.resolve('researchStudyKind', 'SUPPLEMENTAL_TREND_VOLATILITY_REGIMES'), /UNKNOWN_TAXONOMY_ID/);
  assert.throws(() => K.resolve('runResearchMethod', '__proto__'), /UNKNOWN_TAXONOMY_ID/);
  assert.throws(() => K.resolve('nope', 'A'), /UNKNOWN_TAXONOMY/);
  assert.throws(() => K.kindOf('researchStudyKind', 'EVENT_DRIVEN'), /IS_A_METHOD/);
  assert.throws(() => K.idsFor('certification', 'ALPHA'), /UNKNOWN_KIND_OR_METHOD/);
  assert.ok(Object.isFrozen(K.TAXONOMIES.certification.map));
});
