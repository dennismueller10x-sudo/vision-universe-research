'use strict';
// Strang G: Parität des Aktien-Runners mit dem E3-Adapter und Verhalten (synthetische Daten, keine Studienaussage).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Q = require('../edge/quant-e3.cjs');
const SE = require('./stock-engine.cjs');
const Pr = require('./protocol.cjs');

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const SECTORS = ['Money', 'Hlth', 'BusEq', 'Manuf', 'Shops', 'NoDur', 'Enrgy', 'Utils'];
function panel({ T = 420, n = 90, seed = 11 } = {}) {
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
const STD = Pr.std(20);

test('Parität: LVOL ohne Zins = E3-Adapter mit Profil [risk] (gleiche Kurve, gleiche Kosten)', () => {
  const p = panel(), w = [p.calendar[130], p.calendar.at(-1)];
  const ref = Q.runVariant(p, Q.createSelector(p), { id: 'r', profileId: 'x', profileFamilies: ['risk'], weeks: 13, filter: false, standard: STD }, { window: w, anchorDate: p.calendar[130] });
  const got = SE.runVariant(p, SE.createSelector(p, null), { id: 'g', score: 'LVOL', weeks: 13, filter: false, standard: STD }, { window: w, trainStart: p.calendar[0], terminalRecovery: Pr.TERMINAL });
  assert.equal(ref.state, 'RUN'); assert.equal(got.state, 'RUN');
  assert.equal(got.equity.length, ref.equity.length);
  for (let i = 0; i < ref.equity.length; i++) assert.ok(Math.abs(got.equity[i][1] - ref.equity[i][1]) < 1e-6, 'Woche ' + i);
  assert.ok(got.cashShare instanceof Map && [...got.cashShare.values()].every(x => x >= -1e-9 && x <= 1 + 1e-9));
});

test('Cash-Verzinsung: Filter aus = Zins auf Cash, nie Reinvestition; vor Erstkauf voll verzinst', () => {
  const p = panel(), w = [p.calendar[130], p.calendar.at(-1)];
  const off = new Set(p.calendar.slice(220, 280)), filt = d => !off.has(d);
  const r = SE.runVariant(p, SE.createSelector(p, null), { id: 'f', score: 'M12', weeks: 13, filter: true, standard: STD }, { window: w, trainStart: p.calendar[0], filterStateAt: filt, terminalRecovery: Pr.TERMINAL });
  const bil = new Map(r.equity.map(([d]) => [d, 0.001]));
  const withI = SE.withCashInterest(r.equity, r.cashShare, bil);
  const seg = i => withI[i][1] - r.equity[i][1];
  assert.ok(seg(1) > 0 && Math.abs(seg(1) - 1e6 * 0.001) < 1e-6, 'erste Woche: volles Startkapital verzinst');
  const k = r.equity.findIndex(([d]) => d > p.calendar[230]), k2 = r.equity.findIndex(([d]) => d > p.calendar[270]);
  assert.ok(seg(k2) - seg(k) > 0.0009 * r.equity[k][1] * (k2 - k) * 0.9, 'Filter-aus-Phase verzinst');
  assert.equal(SE.withCashInterest(r.equity, r.cashShare, new Map()).at(-1)[1], r.equity.at(-1)[1]);
});

test('Lernendes Ranking: Gleichgewicht vor 52 Stichtagen, danach Ridge; nur bekannte Labels', () => {
  const p = panel({ T: 520 }), w = [p.calendar[130], p.calendar.at(-1)];
  const r = SE.runVariant(p, SE.createSelector(p, null), { id: 'l', score: 'LERN', lambda: 0.1, weeks: 13, filter: false, standard: STD }, { window: w, trainStart: p.calendar[110], terminalRecovery: Pr.TERMINAL });
  assert.equal(r.state, 'RUN');
  const m = r.construction.models;
  assert.equal(m[0].kind, 'EQUAL_FALLBACK');
  assert.ok(m.some(x => x.kind === 'RIDGE'));
  for (const x of m) { const t = p.calendar.indexOf(x.date); assert.ok(x.samples === Math.max(0, Math.floor((t - 14 - 110) / 4) + 1)); }
});
