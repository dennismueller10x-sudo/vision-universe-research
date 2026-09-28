import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { indicators, COLUMNS } from '../../scripts/screener/build-universe.mjs';
import { sectorFromSic } from '../../scripts/screener/sic.mjs';
const require = createRequire(import.meta.url);
const Fields = require('../engine/fields.js');
const Query = require('../engine/query.js');
const Engine = require('../engine/engine.js');

test('Indikatoren aus der Tagesreihe: RSI, SMA-Kreuz, 1W, YTD', () => {
  const pts = [];
  const start = Date.UTC(2025, 8, 1);
  for (let i = 0; i < 260; i++) pts.push([new Date(start + i * 864e5).toISOString().slice(0, 10), 100 + i]);
  const x = indicators(pts);
  assert.equal(Math.round(x.rsi14), 100); // nur Anstiege
  assert.ok(x.sma50vs200 > 0);
  assert.ok(Math.abs(x.perf1w - (359 / 354 - 1)) < 1e-9);
  assert.ok(x.perfYtd > 0);
  assert.ok(x.bollB > 0.5);
  const flat = indicators(pts.map(([d]) => [d, 50]));
  assert.equal(flat.rsi14, 50); assert.equal(flat.bollB, null);
  assert.deepEqual(Object.values(indicators(null)).filter((v) => v !== null), []);
});

test('SIC-Sektorzuordnung ist deterministisch und offengelegt', () => {
  assert.equal(sectorFromSic('3674'), 'tech');
  assert.equal(sectorFromSic('7372'), 'tech');
  assert.equal(sectorFromSic('2834'), 'health');
  assert.equal(sectorFromSic('6798'), 'estate');
  assert.equal(sectorFromSic('6022'), 'fin');
  assert.equal(sectorFromSic('1311'), 'energy');
  assert.equal(sectorFromSic('4911'), 'util');
  assert.equal(sectorFromSic('3711'), 'discretionary');
  assert.equal(sectorFromSic(null), null);
});

test('Jede verfuegbare Registry-Spalte existiert im Artefakt', () => {
  for (const f of Fields.FIELDS) if (f.available && !f.derive) assert.ok(COLUMNS.includes(f.col), f.id + ' -> ' + f.col);
});

// Gegen das echte Artefakt, sofern lokal gebaut (node scripts/screener/build-universe.mjs).
const path = new URL('../data/universe-US_REAL.json', import.meta.url);
test('Echtes Universum: Umfang, Trichter und Plausibilitaet', { skip: !existsSync(path) && 'Artefakt nicht gebaut' }, () => {
  const art = JSON.parse(readFileSync(path, 'utf8'));
  const ds = Engine.createDataset(art);
  assert.ok(ds.size > 4000, 'Universum zu klein: ' + ds.size);
  for (const c of COLUMNS) assert.equal(art.cols[c].length, ds.size, c);
  const q = Query.validate({ v: 1, groups: [{ id: 'g1', op: 'AND', filters: [
    { field: 'sector', op: 'in', value: ['tech'] },
    { field: 'marketCap', op: 'lt', value: 1e9 },
    { field: 'priceVsSma200', op: 'gt', value: 0 },
    { field: 'distance52wHigh', op: 'gt', value: -0.05 }] }] });
  const r = Engine.evaluate(ds, q);
  const counts = r.funnel.map((s) => s.count);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] <= counts[i - 1]);
  assert.equal(counts.at(-1), r.count);
  for (const i of r.indices) {
    assert.equal(ds.value('sector', i), 'tech');
    assert.ok(ds.value('marketCap', i) < 1e9);
    assert.ok(Engine.why(ds, q, i)[0].items.every((x) => x.pass === true));
  }
  // Werte in plausiblen Bereichen (Einheitenfehler fielen hier auf)
  const range = (id, lo, hi) => { const c = ds.column(id); for (const v of c) if (v !== null) assert.ok(v >= lo && v <= hi, id + '=' + v); };
  range('rsi', 0, 100); range('grossMargin', -50, 1.0001); range('relativeStrengthPct', 0, 100); range('qualityFactor', 0, 100);
  // Aktienbasis: ADRs/Fremdwaehrung ohne Bewertung, US-Emittenten mit Bewertung
  const vq = (sym) => art.cols.vq[ds.indexOf(sym)];
  for (const sym of ['TSM', 'BHP', 'LTM', 'TM']) if (ds.indexOf(sym) >= 0) { assert.notEqual(vq(sym), 'OK', sym); assert.equal(ds.value('marketCap', ds.indexOf(sym)), null, sym); assert.equal(ds.value('pe', ds.indexOf(sym)), null, sym); }
  for (const sym of ['NVDA', 'AAPL', 'ADP', 'JPM']) if (ds.indexOf(sym) >= 0) { assert.equal(vq(sym), 'OK', sym); assert.ok(ds.value('marketCap', ds.indexOf(sym)) > 5e10, sym); }
  for (const m of ds.column('marketCap')) if (m !== null) assert.ok(m > 0 && m < 7e12);
  for (const sym of ['HNGE', 'CHWY', 'TEM']) if (ds.indexOf(sym) >= 0) assert.equal(ds.value('marketCap', ds.indexOf(sym)), null, sym);
  const mc = ds.column('marketCap'), dv = ds.column('dollarVolume');
  for (let i = 0; i < ds.size; i++) if (mc[i] !== null && dv[i] !== null) assert.ok(dv[i] / mc[i] <= 1, ds.symbol(i));
  // Quant-Gesamtscore bleibt gesperrt, solange die Publikation es nicht erlaubt
  assert.equal(art.factorPublication.compositeAllowed, false);
  assert.equal(Fields.field('quantScore').available, false);
});
