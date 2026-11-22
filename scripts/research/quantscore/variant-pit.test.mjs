// Quant-Varianten: Gegentests auf künstlichen Querschnitten. Forschung, nicht zertifiziert; schreibt nichts ins Repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const V = require('./variant-pit.cjs');
const X = require('../../quant/v10/factor/factors.cjs');

test('Varianten: live entspricht den Produktgewichten der V10-Rekonstruktion; die anderen summieren auf 1 (live 0,85 ohne Revisionen, renormiert)', () => {
  assert.deepEqual(V.VARIANTS.live, { ...X.COMPOSITE_WEIGHTS });
  for (const [n, w] of Object.entries(V.VARIANTS)) if (n !== 'live') assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.deepEqual(V.COMPARISONS.map((c) => c[1]), ['live', 'live', 'live']);
});

test('Gesamtscore: gewichtetes Mittel, fehlender Teil -> null', () => {
  assert.equal(V.composite({ momentum: 0.5, gpa: 0.5 }, { momentum: 80, gpa: 40 }), 60);
  assert.equal(V.composite({ momentum: 0.5, gpa: 0.5 }, { momentum: 80, gpa: null }), null);
});

test('Querschnitt: mgpa folgt Momentum und Bruttogewinn/Bilanz, live dem Produkt-Gesamtscore', () => {
  const ids = X.COMPONENT_IDS;
  const rows = Array.from({ length: 260 }, (_, k) => ({ id: 'ref_T' + String(k).padStart(3, '0'), template: false,
    raws: Object.fromEntries(ids.map((c, j) => [c, ((k * (j + 3)) % 97) / 97 + (c === 'positiveFcfYears' ? 0 : 0.01)])) }));
  for (const r of rows) { r.raws.positiveFcfYears = Number(r.id.slice(-1)) % 6; }
  const out = V.scoreDate(rows);
  assert.ok(out.length > 200, String(out.length));
  const scores = X.scoreCrossSection(rows);
  const byId = new Map(rows.map((r, k) => [r.id, scores[k]]));
  for (const o of out.slice(0, 20)) assert.ok(Math.abs(o.live - byId.get(o.id).composite) < 1e-9);
  // gpa mit gleicher Rangfolge wie der Rohwert: höherer Rohwert -> höherer mgpa bei gleichem Momentum-Score
  const pair = out.map((o) => [o, rows.find((r) => r.id === o.id)]).filter(([o]) => Math.abs(byId.get(o.id).momentum - byId.get(out[0].id).momentum) < 1e-9);
  for (const [o, r] of pair) for (const [o2, r2] of pair) if (r.raws.grossProfitabilityTtm > r2.raws.grossProfitabilityTtm) assert.ok(o.mgpa > o2.mgpa);
});

test('Rangkorrelation und Vorher/Nachher', () => {
  assert.ok(Math.abs(V.spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-12);
  assert.ok(Math.abs(V.spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-12);
  const rows = Array.from({ length: 50 }, (_, k) => ({ id: 'a' + k, live: k, tilt: k, mp: 50 - k, mgpa: k % 7 }));
  const b = V.beforeAfter([{ date: '2025-12-26', rows }]);
  assert.equal(b.variants.tilt.top10Overlap, 1);
  assert.equal(b.variants.mp.top10Overlap, 0);
  assert.ok(b.variants.mp.spearmanVsLive < -0.99);
});
