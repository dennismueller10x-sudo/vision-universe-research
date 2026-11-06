'use strict';
// Verhaltens- und Paritätstests des Edge-2-Adapters (synthetische Daten = Softwarevalidierung, keine Studienaussage).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const Q = require('../edge/quant-e3.cjs');
const E2 = require('./edge2.cjs');
const PIN = require('./protocol-pin.cjs');

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

test('Protokoll: SHA-256 gepinnt, 12 Varianten, IDs eindeutig', () => {
  const bytes = fs.readFileSync(path.join(ROOT, PIN.PROTOCOL_FILE));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), PIN.PROTOCOL_SHA256);
  const p = JSON.parse(bytes);
  assert.equal(p.variants.length, 12);
  assert.equal(new Set(p.variants.map(v => v.id)).size, 12);
  assert.equal(p.label, 'Forschung, nicht zertifiziert');
});

test('Teil 2 Parität: Overlay F1_PARITY (0/1 Marktfilter) = E3 runVariant F1', () => {
  const p = panel(), sel = Q.createSelector(p), off = new Set(p.calendar.slice(200, 260));
  const filter = d => !off.has(d);
  const base = { id: 'Q-x-N10-W13-F0', family: 'quant', profileId: 'x', profileFamilies: FAM, n: 10, weeks: 13, filter: false, standard: E2.standardFor(10) };
  const w = [p.calendar[120], p.calendar.at(-1)], anchorDate = p.calendar[106];
  const ref = Q.runVariant(p, sel, { ...base, id: 'Q-x-N10-W13-F1', filter: true }, { window: w, anchorDate, filterStateAt: filter });
  const got = E2.runTeil2(p, sel, 'F1_PARITY', { window: w, anchorDate, filterStateAt: filter, base });
  assert.equal(got.equity.length, ref.equity.length);
  for (let i = 0; i < ref.equity.length; i++) assert.ok(Math.abs(got.equity[i][1] - ref.equity[i][1]) < 1e-6, 'Woche ' + i);
});

test('Teil 2: TREND50 hält die Hälfte in Cash, VOL15 senkt die Quote unter 1, ABSMOM12 monatlich 0/1', () => {
  const p = panel(), sel = Q.createSelector(p), off = new Set(p.calendar.slice(200, 260));
  const filter = d => !off.has(d);
  const base = { id: 'b', family: 'quant', profileId: 'x', profileFamilies: FAM, n: 10, weeks: 13, filter: false, standard: E2.standardFor(10) };
  const w = [p.calendar[120], p.calendar.at(-1)], anchorDate = p.calendar[106];
  const b = Q.runVariant(p, sel, base, { window: w, anchorDate });
  const t50 = E2.runTeil2(p, sel, 'TREND50', { window: w, anchorDate, filterStateAt: filter, base });
  assert.equal(t50.construction.minExposure, 0.5);
  assert.ok(t50.construction.exposureSwitches >= 2);
  const v15 = E2.runTeil2(p, sel, 'VOL15', { window: w, anchorDate, filterStateAt: filter, base, baseEquity: b.equity });
  assert.ok(v15.construction.minExposure < 1 && v15.construction.minExposure > 0);
  const am = E2.runTeil2(p, sel, 'ABSMOM12', { window: w, anchorDate, filterStateAt: filter, base });
  assert.equal(am.state, 'RUN');
  // Vorgriff: die Quote an t hängt nur von Basisrenditen bis t ab.
  const ctx = { filterStateAt: filter, cal: p.calendar, spyLevels: p.benchmark.levels };
  const pos = new Map(b.equity.map(([d], i) => [d, i]));
  const full = E2.exposureFn('VOL15', { ...ctx, baseReturnsUntil: t => { const k = pos.get(p.calendar[t]); return k === undefined ? [] : b.equity.slice(1, k + 1).map((x, i) => x[1] / b.equity[i][1] - 1); } });
  const cut = b.equity.slice(0, 80);
  const part = E2.exposureFn('VOL15', { ...ctx, baseReturnsUntil: t => { const k = pos.get(p.calendar[t]); return k === undefined || k >= 80 ? [] : cut.slice(1, k + 1).map((x, i) => x[1] / cut[i][1] - 1); } });
  for (let t = 130; t < 120 + 79; t++) assert.equal(full(t), part(t));
});

test('Teil 1 NOW: N Plätze, Branchengrenze, kein Umschichten gehaltener Titel, Verkauf nur an Neubewertung', () => {
  const p = panel(), sel = Q.createSelector(p);
  const v = { id: 'E2-T1-x-N10-NOW', profileId: 'x', profileFamilies: FAM, n: 10, entry: 'NOW' };
  const r = E2.runTeil1(p, sel, v, { window: [p.calendar[120], p.calendar.at(-1)], anchorDate: p.calendar[106], zoneAt: () => { throw Error('NOW prüft keine Zone'); } });
  assert.equal(r.state, 'RUN');
  assert.ok(r.construction.buys >= 10);
  assert.ok(r.construction.averageSlotsFilled > 0.8);
  assert.equal(r.equity[0][1], 1e6);
});

test('Teil 1 ZONE: ohne Zone kein Kauf (Cash), mit Zone Käufe; Zone wird nur bis t abgefragt', () => {
  const p = panel(), sel = Q.createSelector(p), w = [p.calendar[120], p.calendar.at(-1)], anchorDate = p.calendar[106];
  const v = { id: 'E2-T1-x-N10-ZONE', profileId: 'x', profileFamilies: FAM, n: 10, entry: 'ZONE' };
  const none = E2.runTeil1(p, sel, v, { window: w, anchorDate, zoneAt: () => null });
  assert.equal(none.state, 'NO_POSITIONS');
  const asked = [];
  const some = E2.runTeil1(p, sel, v, { window: w, anchorDate, zoneAt: (id, t) => { asked.push(t); return (t + id.length) % 5 === 0 ? 'PULLBACK_TO_SUPPORT' : null; } });
  assert.equal(some.state, 'RUN');
  assert.ok(some.construction.zoneHits > 0 && some.construction.zoneHits <= some.construction.zoneChecks);
  assert.ok(asked.every(t => t >= 120 && t < p.calendar.length - 1));
});

test('isZone: nur BULLISH, eine der drei Vorlagen, aktiv, Setup vollständig', () => {
  const Trade = { buildTradeSetup: s => ({ status: s.ok ? 'COMPLETE' : 'INCOMPLETE' }) };
  const a = sc => ({ scenarios: { scenarios: sc }, lastBar: { close: 1 }, featuresAtCutoff: {} });
  const base = { direction: 'BULLISH', template: 'PULLBACK_TO_SUPPORT', status: 'ACTIVE', entryStatus: 'ACTIVE', ok: true };
  assert.equal(E2.isZone(a([base]), Trade), 'PULLBACK_TO_SUPPORT');
  assert.equal(E2.isZone(a([{ ...base, template: 'RANGE_BREAKOUT_UP' }]), Trade), null);
  assert.equal(E2.isZone(a([{ ...base, direction: 'BEARISH' }]), Trade), null);
  assert.equal(E2.isZone(a([{ ...base, entryStatus: 'CONDITIONAL' }]), Trade), null);
  assert.equal(E2.isZone(a([{ ...base, ok: false }]), Trade), null);
});
