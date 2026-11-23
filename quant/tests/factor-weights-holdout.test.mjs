import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const H = require('../../scripts/quant/research/factor-weights-holdout.cjs');
const X = require('../../scripts/quant/v10/factor/factors.cjs');

test('FWH-1 Raster: cur entspricht dem Vertrag, jede Variante deckt alle sechs Faktoren ab', () => {
  assert.deepEqual(H.VARIANTS.cur, X.COMPOSITE_WEIGHTS);
  for (const w of Object.values(H.VARIANTS)) assert.deepEqual(Object.keys(w).sort(), [...X.FACTORS].sort());
});
test('FWH-2 Gewichtung: normiert, null bei fehlendem Faktor', () => {
  const sc = Object.fromEntries(X.FACTORS.map(f => [f, 50]));
  assert.ok(Math.abs(H.weighted(sc, H.VARIANTS.cur) - 50) < 1e-9);
  assert.equal(H.weighted({ ...sc, growth: null }, H.VARIANTS.cur), null);
});
test('FWH-3 gepaarte Differenz nur auf gemeinsamen Stichtagen', () => {
  const a = new Map([['2010-01-31', { ic: 0.1 }], ['2010-02-28', { ic: 0.3 }]]), b = new Map([['2010-02-28', { ic: 0.1 }]]);
  assert.deepEqual(H.pairedDiff(a, b, 'ic').map(x => +x.toFixed(6)), [0.2]);
});
