'use strict';
// Paritäts- und Verhaltenstests des E3-Quant-Adapters (synthetische Daten = Softwarevalidierung, keine Studienaussage).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
const BT = require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs'));
const Q = require('./quant-e3.cjs');

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const SECTORS = ['Money', 'Hlth', 'BusEq', 'Manuf', 'Shops', 'NoDur', 'Enrgy', 'Utils'];
function panel({ T = 420, n = 80, seed = 11 } = {}) {
  const r = rng(seed), cal = [], d0 = Date.parse('2010-01-08T00:00:00Z');
  for (let t = 0; t < T; t++) cal.push(new Date(d0 + t * 7 * 86400000).toISOString().slice(0, 10));
  const bench = [100]; for (let t = 1; t < T; t++) bench.push(bench[t - 1] * (1 + 0.0015 + gauss(r) * 0.02));
  const securities = [];
  for (let i = 0; i < n; i++) {
    const adj = new Array(T).fill(NaN), start = i % 7 === 0 ? 120 : 0, end = i % 9 === 0 ? 250 + (i % 50) : T - 1;
    let p = 20 + 30 * r();
    for (let t = start; t <= end; t++) { p *= 1 + 0.001 * (i % 5) + (bench[t] / (bench[t - 1] || bench[t]) - 1) * (0.6 + (i % 4) * 0.2) + gauss(r) * 0.03; adj[t] = p; }
    securities.push({ id: 'ref_S' + i, sector: SECTORS[i % SECTORS.length], mic: 'XNYS', adj, raw: adj.slice(), dv: new Array(T).fill(80e6), bundle: null,
      terminal: end < T - 1 ? { lastIdx: end, kind: i % 2 ? 'MERGER' : 'DISTRESS' } : null });
  }
  return { calendar: cal, basis: 'TOTAL_RETURN', benchmark: { label: 'SYN', levels: bench, sourceHash: 'a'.repeat(64) }, securities,
    provenance: { datasetHash: 'b'.repeat(64), identityEvidence: 'c'.repeat(64), populationEvidence: 'd'.repeat(64), corporateActionEvidence: 'e'.repeat(64), lifecycleEvidence: 'f'.repeat(64), licenseEvidence: '1'.repeat(64) } };
}
const FAM = ['momentum', 'risk'];

test('Parität: ohne Filter, 4 Wochen, Anker = Fensterstart, Engine-Standard -> identische Kurve wie runModelPortfolio', () => {
  const p = panel(), w = [p.calendar[0], p.calendar.at(-1)];
  const ref = BT.runModelPortfolio(p, { profileId: 'x', profileFamilies: FAM, window: w, weighting: 'EQUAL' });
  const sel = Q.createSelector(p);
  const firstIdx = p.calendar.findIndex(d => d >= w[0]);
  const got = Q.runVariant(p, sel, { id: 'parity', profileId: 'x', profileFamilies: FAM, weeks: 4, filter: false, standard: {} }, { window: w, anchorDate: p.calendar[firstIdx] });
  assert.equal(got.state, 'RUN');
  assert.equal(got.equity.length, ref.equity.length);
  for (let i = 0; i < ref.equity.length; i++) { assert.equal(got.equity[i][0], ref.equity[i][0]); assert.ok(Math.abs(got.equity[i][1] - ref.equity[i][1]) < 1e-6, 'Woche ' + i); }
});

test('Protokollstandard N=10: Positionsmaximum 10 %, genau 10 Titel; Filter aus = Cash mit Kosten, Uhr läuft über das Fenster', () => {
  const p = panel(), sel = Q.createSelector(p);
  // Filter: an, ab Woche 200 aus, ab Woche 260 wieder an.
  const off = new Set(p.calendar.slice(200, 260));
  const filter = d => !off.has(d);
  const v = { id: 'Q-x-N10-W13-F1', profileId: 'x', profileFamilies: FAM, weeks: 13, filter: true, standard: { minPositions: 10, maxPositions: 10, targetPositions: 10, maxPositionWeight: 0.1 } };
  const r = Q.runVariant(p, sel, v, { window: [p.calendar[120], p.calendar.at(-1)], anchorDate: p.calendar[106], filterStateAt: filter });
  assert.equal(r.state, 'RUN');
  assert.equal(r.construction.averagePositions, 10);
  assert.ok(r.construction.filterSwitches >= 2);
  // In der Filter-aus-Phase (nach Ausführung) ist der Wert konstant (Cash unverzinst).
  const seg = r.equity.filter(([d]) => d > p.calendar[201] && d <= p.calendar[259]).map(e => e[1]);
  assert.ok(seg.length > 10 && seg.every(x => Math.abs(x - seg[0]) < 1e-6));
  // Cash-Start: erster Wert = Startkapital.
  assert.equal(r.equity[0][1], 1e6);
});

test('Marktfilter: Schluss > SMA200 inklusive Tag, Gleichstand = Cash, vor 200 Sitzungen null', () => {
  const pts = []; for (let i = 0; i < 260; i++) pts.push([new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10), 100]);
  pts[230][1] = 150; const f = Q.marketFilter(pts);
  assert.equal(f(pts[100][0]), null);
  assert.equal(f(pts[220][0]), false, 'Gleichstand = Cash');
  assert.equal(f(pts[230][0]), true);
  assert.equal(f('2019-12-31'), null);
});
