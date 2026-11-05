// DQ-K5-Quarantäne im Musterportfolio-Panel: Schnitt statt Korrektur, BOOK/PRIOR wie Supertrader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const MP = require('../../scripts/quant/portfolio/model-portfolios.cjs');

const T = 30, cal = Array.from({ length: T }, (_, i) => new Date(Date.UTC(2020, 0, 3 + 7 * i)).toISOString().slice(0, 10));
const series = f => Float64Array.from({ length: T }, (_, t) => f(t));
const sec = (id, adj, dqFlags, terminal = null) => ({ id, sector: 'X', mic: 'XNYS', adj, raw: adj, dv: series(() => 1e8), bundle: null, terminal, dqFlags });
const panel = { calendar: cal, basis: 'TOTAL_RETURN', securities: [sec('ref_A', series(t => (t < 15 ? 10 : 100)), [15]), sec('ref_B', series(() => 20), [])] };

test('BOOK: früheres Stück endet mit der markierten Woche, späteres beginnt dort', () => {
  const { panel: q, census } = MP.applyDq(panel, 'DQ-K5-BOOK');
  const [a1, a2, b] = q.securities;
  assert.equal(a1.id, 'ref_A'); assert.equal(a2.id, 'ref_A:dq1'); assert.equal(b, panel.securities[1]);
  assert.equal(a1.terminal.lastIdx, 15); assert.equal(a1.terminal.kind, 'SERIES_END'); assert.equal(a1.adj[15], 100);
  assert.ok(Number.isNaN(a2.adj[14])); assert.equal(a2.adj[15], 100); assert.equal(a2.terminal, null);
  assert.deepEqual({ flaggedSecurities: census.flaggedSecurities, flags: census.flags, pieces: census.pieces }, { flaggedSecurities: 1, flags: 1, pieces: 2 });
});

test('PRIOR: Abrechnung vor dem Sprung, der Sprung wird von keinem Stück gebucht', () => {
  const { panel: q } = MP.applyDq(panel, 'DQ-K5-PRIOR');
  const [a1, a2] = q.securities;
  assert.equal(a1.terminal.lastIdx, 14); assert.ok(Number.isNaN(a1.adj[15]));
  assert.equal(a2.adj[15], 100);
  for (const s of q.securities) for (let t = 1; t < T; t++) if (s.adj[t] > 0 && s.adj[t - 1] > 0) assert.ok(s.adj[t] / s.adj[t - 1] < 5);
});

test('Kurze Stücke entfallen, das letzte Stück behält den Endwert der Delistung', () => {
  const p = { ...panel, securities: [sec('dl_X', series(t => (t < 3 ? 1 : 10)), [3], { lastIdx: T - 1, kind: 'DISTRESS' })] };
  const { panel: q, census } = MP.applyDq(p, 'DQ-K5-BOOK');
  assert.equal(census.droppedPieces, 1); assert.equal(q.securities.length, 1);
  assert.equal(q.securities[0].id, 'dl_X:dq1'); assert.deepEqual(q.securities[0].terminal, { lastIdx: T - 1, kind: 'DISTRESS' });
  assert.throws(() => MP.applyDq(panel, 'DQ-K3'), /DQ_POLICY_INVALID/);
});
