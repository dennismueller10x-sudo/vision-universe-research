import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { indicators, COLUMNS, technicalIntelligenceColumns, TI_MAX_AGE_DAYS } from '../../scripts/screener/build-universe.mjs';
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

test('Chartbild-Spalten: nur bekannte Zustaende, veraltete Titel bleiben leer', () => {
  const { byTicker, meta } = technicalIntelligenceColumns({ schemaVersion: 'vu-ti-api-3.0.0', generatedAt: '2026-10-03T00:00:00Z', rows: [
    { t: 'AAA', asOf: '2026-10-01', outlook: 'BULLISH', structure: 'CORRECTION_IN_UPTREND', elliottApplicable: 'LOW' },
    { t: 'BBB', asOf: '2026-09-10', outlook: 'BEARISH', structure: 'RALLY_IN_DOWNTREND', elliottApplicable: null },
    { t: 'CCC', asOf: '2024-10-11', outlook: 'BULLISH', structure: 'UPTREND_ADVANCING', elliottApplicable: 'HIGH' },
    { t: 'DDD', asOf: '2026-10-01', outlook: 'KAUFEN', structure: 'X', elliottApplicable: 'SURE' }] });
  assert.deepEqual(byTicker.get('AAA'), { tiOut: 'BULLISH', tiStr: 'CORRECTION_IN_UPTREND', tiEw: 'LOW' });
  assert.deepEqual(byTicker.get('BBB'), { tiOut: 'BEARISH', tiStr: 'RALLY_IN_DOWNTREND', tiEw: null });
  assert.equal(byTicker.has('CCC'), false, 'aelter als ' + TI_MAX_AGE_DAYS + ' Tage');
  assert.deepEqual(byTicker.get('DDD'), { tiOut: null, tiStr: null, tiEw: null });
  assert.equal(meta.asOf, '2026-10-01'); assert.equal(meta.stale, 1);
  assert.equal(technicalIntelligenceColumns(null).meta, null);
  /* Bezug Baudatum: ein insgesamt veralteter Index liefert keine Zustaende (Code-Review M3) */
  const old = technicalIntelligenceColumns({ rows: [{ t: 'AAA', asOf: '2026-10-01', outlook: 'BULLISH', structure: 'UPTREND_ADVANCING', elliottApplicable: 'LOW' }] }, { now: '2027-01-15' });
  assert.equal(old.byTicker.size, 0); assert.equal(old.meta.stale, 1);
});

const tiIndex = new URL('../../quant/data/technical-intelligence/v3/index.json.gz', import.meta.url);
test('Chartbild-Index im Repo deckt die Registry-Zustaende ab', { skip: !existsSync(tiIndex) && 'Index fehlt' }, () => {
  const { byTicker } = technicalIntelligenceColumns(JSON.parse(gunzipSync(readFileSync(tiIndex)).toString('utf8')));
  assert.ok(byTicker.size > 1000, 'zu wenige Chartbild-Titel: ' + byTicker.size);
  for (const v of byTicker.values()) {
    if (v.tiOut) assert.notEqual(Fields.enumLabel('tiOutlook', v.tiOut), v.tiOut, v.tiOut);
    if (v.tiStr) assert.notEqual(Fields.enumLabel('tiStructure', v.tiStr), v.tiStr, v.tiStr);
    if (v.tiEw) assert.notEqual(Fields.enumLabel('tiElliottApplicable', v.tiEw), v.tiEw, v.tiEw);
  }
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
  // Vor dem Discover-Fix zurueckgehalten, danach korrekt berechnet - nie ein Kleinstwert.
  for (const sym of ['HNGE', 'CHWY']) if (ds.indexOf(sym) >= 0) { const m = ds.value('marketCap', ds.indexOf(sym)); assert.ok(m === null || m > 1e9, sym + ' ' + m); }
  if (ds.indexOf('TEM') >= 0) assert.equal(ds.value('marketCap', ds.indexOf('TEM')), null);
  const mc = ds.column('marketCap'), dv = ds.column('dollarVolume');
  for (let i = 0; i < ds.size; i++) if (mc[i] !== null && dv[i] !== null) assert.ok(dv[i] / mc[i] <= 1, ds.symbol(i));
  // Quant-Gesamtscore bleibt gesperrt, solange die Publikation es nicht erlaubt
  assert.equal(art.factorPublication.compositeAllowed, false);
  assert.equal(Fields.field('quantScore').available, false);
});
