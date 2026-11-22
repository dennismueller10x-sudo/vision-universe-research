import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../../scripts/quant/research/factor-predictive-power.cjs');
const X = require('../../scripts/quant/v10/factor/factors.cjs');

test('FPP-1 Vertragsgewichte: v2.4.1 nutzt Margeneinbruch, v2.4.0-Variante das Fuenf-Jahres-Fenster', () => {
  assert.ok(P.SPECS.v241.quality.some(c => c[0] === 'operatingMarginDrawdown'));
  assert.ok(P.SPECS.v240.quality.some(c => c[0] === 'operatingMarginDrawdown5y'));
  assert.equal(P.SPECS.v241.quality.length, P.SPECS.v240.quality.length);
});
test('FPP-2 Einbruch: gekappt, Dauerverlust zaehlt', () => {
  assert.ok(Math.abs(P.drawdownOf([0.2, 0.3, 0.1]) - 0.2) < 1e-12);
  assert.ok(Math.abs(P.drawdownOf([-0.5, -0.4, -0.3]) - 0.4) < 1e-12);
});
test('FPP-3 Bewertung: zu kleine Population gibt null, alle Signale je Zeile', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: 'ref_T' + i, template: false, raws: { priceReturn12m1m: i } }));
  const sc = P.scoreCrossSection(rows, P.SPECS.v241);
  assert.equal(sc.length, 10);
  for (const s of sc) { assert.equal(s.momentum, null); assert.equal(s.composite, null); assert.equal(s.PROFILE_MEAN, null); }
  assert.deepEqual(Object.keys(sc[0]).sort(), [...X.FACTORS, 'composite', 'PROFILE_MEAN'].sort());
});
