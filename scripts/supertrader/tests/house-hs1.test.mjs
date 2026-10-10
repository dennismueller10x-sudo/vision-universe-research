// VU Hausstrategie HS1: Engine, Look-ahead-Sperre, Abrechnung, Statistik.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareStock, crossSection, scoreSection, simulate, sueAt, revgAt, monthEnds, HS1 } from '../house/engine.mjs';
import { deflatedSharpe, pboCscv, metrics, normInv, normCdf } from '../house/stats.mjs';
import { truncateForDevelopment, DEV_END } from '../house/seal.mjs';
import * as L from '../validation/lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function calendarOf(n, start = '2015-01-01') {
  const out = []; const d = new Date(start + 'T00:00:00Z');
  while (out.length < n) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function mkStock(id, cal, drift, opts = {}) {
  const from = opts.from || 0, to = opts.to ?? cal.length - 1;
  const s = { id, survivor: !opts.delisted, delisted: !!opts.delisted, date: [], open: [], high: [], close: [], rawClose: [], rawVolume: [], divAdj: [], fund: opts.fund || null };
  let p = opts.p0 || 50;
  for (let k = from; k <= to; k++) {
    const wig = Math.sin(k * 0.37 + id.length) * 0.004;
    const o = p; p = p * (1 + drift + wig);
    s.date.push(cal[k]); s.open.push(o); s.high.push(Math.max(o, p) * 1.002); s.close.push(p); s.rawClose.push(p); s.rawVolume.push(opts.vol || 1e6); s.divAdj.push(opts.div && k % 63 === 0 ? opts.div : 0);
  }
  return s;
}
function universe(cal, extra = []) {
  const idx = new Map(cal.map((d, i) => [d, i]));
  const raw = [];
  for (let i = 0; i < 40; i++) raw.push(mkStock('S' + String(i).padStart(2, '0'), cal, (i - 20) * 0.00005, { vol: 1e6 + i * 1e4 }));
  return [...raw, ...extra].map((s) => prepareStock(s, idx));
}

test('Look-ahead-Sperre: Aenderungen nach D veraendern Universum und Raenge an D nicht', () => {
  const cal = calendarOf(700);
  const base = universe(cal);
  const k = 400, D = cal[k];
  const a = scoreSection(crossSection(base, k, D), ['MOM', 'HIGH52', 'LVOL', 'MOMV']).map((x) => [x.id, x.score]);
  // Vergiften: alle Balken nach k massiv veraendert
  const idx = new Map(cal.map((d, i) => [d, i]));
  const poisoned = universe(cal).map((st) => {
    const s = { ...st, close: st.close.slice(), high: st.high.slice(), rawClose: st.rawClose.slice(), rawVolume: st.rawVolume.slice(), open: st.open.slice(), divAdj: st.divAdj.slice() };
    for (let t = 0; t < s.date.length; t++) if (s.date[t] > D) { s.close[t] *= 9; s.high[t] *= 9; s.rawClose[t] *= 9; s.rawVolume[t] *= 50; }
    return prepareStock(s, idx);
  });
  const b = scoreSection(crossSection(poisoned, k, D), ['MOM', 'HIGH52', 'LVOL', 'MOMV']).map((x) => [x.id, x.score]);
  assert.deepEqual(b, a);
});

test('SUE/REVG: nur Einreichungen strikt vor D, alte Werte verfallen', () => {
  const eps = [], rev = [];
  const qs = ['2014-03-31', '2014-06-30', '2014-09-30', '2014-12-31', '2015-03-31', '2015-06-30', '2015-09-30', '2015-12-31', '2016-03-31', '2016-06-30'];
  qs.forEach((e, i) => { eps.push([e, 1 + i * 0.1 + (i % 2) * 0.05, addD(e, 40), 0, null]); rev.push([e, 100 + i * 5, addD(e, 40), 0, null]); });
  const fund = { eps, rev };
  const filed = eps[9][2];
  const before = sueAt(fund, filed), after = sueAt(fund, addD(filed, 1));
  assert.notEqual(before, after, 'am Einreichungstag noch nicht sichtbar');
  assert.ok(Number.isFinite(after));
  assert.ok(Math.abs(revgAt(fund, addD(filed, 1)) - (145 / 125 - 1)) < 1e-12);
  assert.ok(Number.isNaN(sueAt(fund, addD(filed, HS1.fundMaxAgeDays + 5))), 'veraltet');
});
function addD(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

test('Simulation: Endwert = Barmittel + offene Positionen, Ausfuehrung zur Eroeffnung, Delisting S1/S2', () => {
  const cal = calendarOf(800);
  const idx = new Map(cal.map((d, i) => [d, i]));
  // Starker Titel, der delistet wird und dabei kollabiert
  const dl = mkStock('ZZDL', cal, 0.003, { to: 600, delisted: true, vol: 5e6 });
  for (let t = dl.close.length - 70; t < dl.close.length; t++) { dl.close[t] *= 0.3; dl.rawClose[t] *= 0.3; dl.open[t] *= 0.3; dl.high[t] *= 0.3; }
  const stocks = universe(cal, [dl]);
  const startK = monthEnds(cal, 300, 799)[0], endK = 799;
  const r1 = simulate(stocks, cal, { factors: ['MOM'], n: 5, scenario: 'S1_MINUS_30', startK, endK });
  const last = r1.equity[r1.equity.length - 1];
  assert.ok(Math.abs(last.equity - (r1.cashEnd + r1.openValueEnd)) < 1e-9);
  assert.ok(r1.log.length > 10 && r1.meanPositions > 3);
  const r0 = simulate(stocks, cal, { factors: ['MOM'], n: 5, scenario: 'S0_LAST_PRICE', startK, endK });
  const r2 = simulate(stocks, cal, { factors: ['MOM'], n: 5, scenario: 'S2_DISTRESS_ZERO', startK, endK });
  if (r1.terminalCount > 0) { assert.ok(r0.equity.at(-1).equity >= r1.equity.at(-1).equity); assert.ok(r1.equity.at(-1).equity >= r2.equity.at(-1).equity); }
  // Kosten erhoehen -> Endwert sinkt
  const rc = simulate(stocks, cal, { factors: ['MOM'], n: 5, scenario: 'S1_MINUS_30', startK, endK, slippageBps: 50, commissionBps: 10 });
  assert.ok(rc.equity.at(-1).equity < r1.equity.at(-1).equity);
});

test('Simulation: Marktfilter halbiert Exposure, Puffer senkt Umschlag', () => {
  const cal = calendarOf(800);
  const stocks = universe(cal);
  const startK = monthEnds(cal, 300, 799)[0];
  const sma = new Float64Array(cal.length).fill(0.9);
  const r = simulate(stocks, cal, { factors: ['MOM'], n: 10, regime: true, spySma: sma, startK, endK: 799 });
  const mid = r.equity[200];
  assert.ok(mid.exposure > 0.4 && mid.exposure < 0.6, `Exposure ${mid.exposure}`);
  const rr = simulate(stocks, cal, { factors: ['MOM'], n: 10, random: 3, startK, endK: 799 });
  assert.ok(rr.turnover > r.turnover);
});

test('Entwicklungssperre: Reihen und Fundamentaldaten nach 2021-12-31 werden entfernt', () => {
  const seg = { id: 'X', raw: [{ date: '2021-12-30' }, { date: '2021-12-31' }, { date: '2022-01-03' }], fund: { eps: [['2021-09-30', 1, '2021-11-01'], ['2021-12-31', 1, '2022-02-01']], rev: [] }, delisted: false };
  const out = truncateForDevelopment([seg]);
  assert.equal(DEV_END, '2021-12-31');
  assert.deepEqual(out[0].raw.map((b) => b.date), ['2021-12-30', '2021-12-31']);
  assert.equal(out[0].fund.eps.length, 1);
  assert.equal(out[0].delisted, false, 'Listing, das erst nach dem Stichtag endet, gilt im Entwicklungszeitraum nicht als delistet');
});

test('Statistik: Normalverteilung, DSR faellt mit der Zahl der Versuche, PBO in [0,1]', () => {
  assert.ok(Math.abs(normCdf(normInv(0.975)) - 0.975) < 1e-6);
  const rets = Array.from({ length: 120 }, (_, i) => 0.01 + 0.03 * Math.sin(i * 1.7));
  const one = deflatedSharpe(rets, [0.3]);
  const many = deflatedSharpe(rets, [0.3, 0.1, -0.2, 0.25, 0.05, 0.4, -0.1, 0.15, 0.2, 0.0, 0.35, 0.1]);
  assert.ok(many.dsr < one.dsr);
  const mtx = Array.from({ length: 72 }, (_, t) => Array.from({ length: 6 }, (_, j) => Math.sin(t * (j + 1) * 0.9) * 0.02));
  const p = pboCscv(mtx, 8);
  assert.equal(p.combinations, 70);
  assert.ok(p.pbo >= 0 && p.pbo <= 1);
  const cal = calendarOf(300);
  const eq = cal.map((d, i) => ({ date: d, equity: 1.0005 ** i }));
  const bench = new Map(cal.map((d, i) => [d, 1.0003 ** i]));
  const m = metrics(eq, bench);
  assert.ok(m.excessCagr > 0 && m.maxDrawdown === 0);
});

test('Praeregistrierung HS1: Versuchsliste, Kriterien und Holdout-Sperre vorhanden', () => {
  const p = JSON.parse(fs.readFileSync(path.join(root, 'scripts/supertrader/house/PREREGISTRATION-HS1.json'), 'utf8'));
  assert.equal(p.trials.length, 12);
  assert.equal(new Set(p.trials.map((t) => t.id)).size, 12);
  assert.equal(p.periods.development.to, DEV_END);
  for (const h of ['H1', 'H2', 'H3', 'H4', 'H5']) assert.ok(p.criteria[h]);
});

test('Auswertung end-to-end auf kleinen Kunstreihen: Entwicklungsmodus sieht nichts nach 2021', async () => {
  const { runAnalysis } = await import('../house/analyze.mjs');
  const cal = []; const dd = new Date('2015-01-01T00:00:00Z');
  while (dd.toISOString().slice(0, 10) <= '2026-09-30') { const wd = dd.getUTCDay(); if (wd && wd !== 6) cal.push(dd.toISOString().slice(0, 10)); dd.setUTCDate(dd.getUTCDate() + 1); }
  const mkRaw = (i, to = cal.length - 1) => { let p = 20 + i; const out = []; for (let k = 0; k <= to; k++) { p *= 1 + (i - 15) * 0.00004 + Math.sin(k * 0.3 + i) * 0.006; out.push({ date: cal[k], open: p * 0.999, high: p * 1.01, low: p * 0.99, close: p, volume: 1e6 * (1 + i / 10), adjClose: p, dividend: k % 63 === 5 ? 0.05 : 0, splitFactor: 1 }); } return out; };
  const segs = Array.from({ length: 30 }, (_, i) => ({ id: `tiingo:NYSE:T${i}:2000-01-01`, raw: mkRaw(i), survivor: true, delisted: false, fund: null }));
  segs.push({ id: 'tiingo:NYSE:GONE:2000-01-01', raw: mkRaw(31, 1900), survivor: false, delisted: true, fund: null });
  const spyRaw = mkRaw(16).map((b) => ({ ...b, close: b.close }));
  const spyAdj = L.adjustSeries(spyRaw);
  const r = runAnalysis({ segs, spyAdj, hash: 'x', nonEquityExcluded: 0, secCoverage: null }, { MODE: 'dev' });
  assert.equal(r.period.to, '2021-12-31');
  assert.equal(Object.keys(r.trials).length, 12);
  assert.ok(r.selection.selected);
  for (const t of Object.values(r.trials)) { assert.ok(t.reconcile < 1e-9); assert.ok(t.metrics.monthly.every((m) => m[0] <= '2021-12')); }
  assert.equal(r.controls.RANDOM.length, 20);
  assert.ok(r.stats.pbo.pbo !== null);
});

test('HS2: Gewichtsgrenze und Faktorneigung', async () => {
  const { capWeights, indexTiltWeights } = await import('../house/engine.mjs');
  const w = capWeights(new Map([['a', 50], ['b', 30], ['c', 10], ['d', 5], ['e', 5]]), 0.3);
  const tot = [...w.values()].reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(tot - 1) < 1e-12);
  assert.ok([...w.values()].every((v) => v <= 0.3 + 1e-12));
  assert.ok(Math.abs(w.get('d') / w.get('e') - 1) < 1e-12);
  const st = (id) => ({ id });
  const elig = Array.from({ length: 40 }, (_, i) => ({ st: st('X' + i), dvW: 100 - i, MOM: i, SUE: NaN }));
  const flat = indexTiltWeights(elig, { factors: [] });
  const tilt = indexTiltWeights(elig, { factors: ['MOM'], tau: 0.5 });
  const cut = indexTiltWeights(elig, { factors: ['MOM'], cut: true });
  assert.ok(tilt.get('X39').w / flat.get('X39').w > 1.3, 'hoher Rang wird uebergewichtet');
  assert.ok(tilt.get('X0').w / flat.get('X0').w < 0.7, 'niedriger Rang wird untergewichtet');
  assert.ok(!cut.has('X0') && cut.has('X39'));
  for (const m of [flat, tilt, cut]) assert.ok(Math.abs([...m.values()].reduce((a, x) => a + x.w, 0) - 1) < 1e-9);
});

test('HS2 end-to-end: indexnahe Versuche, Kontrollversuch E00 nicht waehlbar, DSR zaehlt 19 Versuche', async () => {
  const { runAnalysis } = await import('../house/analyze.mjs');
  const cal = []; const dd = new Date('2015-01-01T00:00:00Z');
  while (dd.toISOString().slice(0, 10) <= '2026-09-30') { const wd = dd.getUTCDay(); if (wd && wd !== 6) cal.push(dd.toISOString().slice(0, 10)); dd.setUTCDate(dd.getUTCDate() + 1); }
  const mkRaw = (i) => { let p = 20 + i; return cal.map((date, k) => { p *= 1 + (i - 15) * 0.00004 + Math.sin(k * 0.3 + i) * 0.006; return { date, open: p * 0.999, high: p * 1.01, low: p * 0.99, close: p, volume: 1e6 * (1 + i / 10), adjClose: p, dividend: 0, splitFactor: 1 }; }); };
  const segs = Array.from({ length: 30 }, (_, i) => ({ id: `tiingo:NYSE:T${i}:2000-01-01`, raw: mkRaw(i), survivor: true, delisted: false, fund: null }));
  const r = runAnalysis({ segs, spyAdj: L.adjustSeries(mkRaw(3)), hash: 'x', nonEquityExcluded: 0, secCoverage: null }, { MODE: 'dev', SET: 'hs2' });
  assert.equal(r.set, 'hs2');
  assert.deepEqual(Object.keys(r.trials), ['E00', 'E01', 'E02', 'E03', 'E04', 'E05', 'E06']);
  assert.notEqual(r.selection.selected, 'E00');
  assert.equal(r.stats.trialsCounted, 19);
  for (const t of Object.values(r.trials)) assert.ok(t.reconcile < 1e-9);
});

test('SEC r13: Aktienanzahl je Stichtag, Gattungen addiert, erste Einreichung', async () => {
  const { sharesSeries } = await import('../validation/sec-pit.mjs');
  const cf = { facts: { dei: { EntityCommonStockSharesOutstanding: { units: { shares: [
    { end: '2020-04-20', val: 100, accn: 'a', filed: '2020-04-30' }, { end: '2020-04-20', val: 50, accn: 'a', filed: '2020-04-30' },
    { end: '2020-07-20', val: 160, accn: 'b', filed: '2020-07-30' }, { end: '2020-07-20', val: 160, accn: 'c', filed: '2020-09-01' }] } } } } };
  assert.deepEqual(sharesSeries(cf), [['2020-04-20', 150, '2020-04-30', 'dei'], ['2020-07-20', 160, '2020-07-30', 'dei']]);
  assert.deepEqual(sharesSeries({ facts: {} }), []);
});

test('HS3: Marktkapitalisierung zum Stichtag mit Split-Umrechnung, nur vor D eingereicht', () => {
  const cal = calendarOf(30, '2020-01-01');
  const idx = new Map(cal.map((d, i) => [d, i]));
  const s = mkStock('MC', cal, 0);
  s.split = cal.map((d, i) => (i === 20 ? 2 : 1));
  for (let i = 20; i < cal.length; i++) s.rawClose[i] = s.rawClose[i] / 2;
  s.fund = { shares: [[cal[5], 1000, cal[8]], [cal[25], 99999, cal[29]]] };
  const st = prepareStock(s, idx);
  const t = 27, D = cal[t];
  const mc = mcapAtT(st, t, D);
  assert.ok(Math.abs(mc - st.rawClose[t] * 1000 * 2) < 1e-6, 'Split nach Stichtag verdoppelt die Stueckzahl');
  assert.ok(Number.isNaN(mcapAtT(st, 7, cal[7])), 'vor der Einreichung unbekannt');
});
import { mcapAt as mcapAtT } from '../house/engine.mjs';

test('HS3 end-to-end: Kontrolle C00, Datenpruefung G0, Auswahl relativ zur Kontrolle, 25 Versuche', async () => {
  const { runAnalysis } = await import('../house/analyze.mjs');
  const cal = []; const dd = new Date('2015-01-01T00:00:00Z');
  while (dd.toISOString().slice(0, 10) <= '2026-09-30') { const wd = dd.getUTCDay(); if (wd && wd !== 6) cal.push(dd.toISOString().slice(0, 10)); dd.setUTCDate(dd.getUTCDate() + 1); }
  const mkRaw = (i) => { let p = 20 + i; return cal.map((date, k) => { p *= 1 + (i - 15) * 0.00004 + Math.sin(k * 0.3 + i) * 0.006; return { date, open: p * 0.999, high: p * 1.01, low: p * 0.99, close: p, volume: 1e6 * (1 + i / 10), adjClose: p, dividend: 0, splitFactor: 1 }; }); };
  const shares = (i) => cal.filter((d, k) => k % 63 === 0).map((d) => [d, 1e6 * (1 + i), d, 'dei']);
  const segs = Array.from({ length: 30 }, (_, i) => ({ id: `tiingo:NYSE:T${i}:2000-01-01`, raw: mkRaw(i), survivor: true, delisted: false, fund: { eps: [], rev: [], shares: shares(i), cik: 'C' + (i === 29 ? 28 : i) } }));
  const r = runAnalysis({ segs, spyAdj: L.adjustSeries(mkRaw(3)), hash: 'x', nonEquityExcluded: 0, secCoverage: null }, { MODE: 'dev', SET: 'hs3' });
  assert.deepEqual(Object.keys(r.trials), ['C00', 'M01', 'M02', 'M03', 'M04', 'M05']);
  assert.ok(r.gate && typeof r.gate.G0 === 'boolean');
  assert.equal(r.stats.trialsCounted, 25);
  assert.ok(r.trials.M01.vsControl);
  assert.ok(r.trials.C00.meanPositions <= 29.5, 'doppelte CIK zaehlt einmal');
});

test('HS3-D1: ADR, IFRS und Mehrgattung mit Kursabstand > 2x fallen aus dem Universum', async () => {
  const { indexTiltWeights } = await import('../house/engine.mjs');
  const mk = (id, mcap, opts = {}) => ({ st: { id, cls: opts.cls || 'EQUITY_COMMON', fund: { cik: opts.cik || id, taxonomy: opts.tax || 'us-gaap' }, rawClose: [opts.px || 50] }, t: 0, MCAP: mcap, dv: 1, dvW: 1 });
  const elig = [mk('ADR1', 900, { cls: 'ADR' }), mk('IFRS1', 800, { tax: 'ifrs-full' }), mk('BRKA', 700, { cik: 'B', px: 400000 }), mk('BRKB', 600, { cik: 'B', px: 270 }), mk('GOOGL', 500, { cik: 'G', px: 100 }), mk('GOOG', 490, { cik: 'G', px: 101 }), mk('X', 100)];
  const w = indexTiltWeights(elig, { sizeBy: 'MCAP', mcapRule: 'D1', factors: [] });
  assert.deepEqual([...w.keys()].sort(), ['GOOGL', 'X']);
  const w2 = indexTiltWeights(elig.map((e) => ({ ...e, st: { ...e.st, fund: { ...e.st.fund, eps: e.st.id === 'X' ? [] : [[1]] } } })), { sizeBy: 'MCAP', mcapRule: 'D2', factors: [] });
  assert.deepEqual([...w2.keys()], ['GOOGL'], 'D2: ohne Quartals-EPS nicht zugelassen');
  const w0 = indexTiltWeights(elig, { sizeBy: 'MCAP', factors: [] });
  assert.ok(w0.has('ADR1') && w0.has('BRKA'), 'ohne D1 unveraendert (HS3 reproduzierbar)');
});

test('HS3-D1 end-to-end zaehlt 31 Versuche', async () => {
  const { runAnalysis } = await import('../house/analyze.mjs');
  const cal = []; const dd = new Date('2015-01-01T00:00:00Z');
  while (dd.toISOString().slice(0, 10) <= '2026-09-30') { const wd = dd.getUTCDay(); if (wd && wd !== 6) cal.push(dd.toISOString().slice(0, 10)); dd.setUTCDate(dd.getUTCDate() + 1); }
  const mkRaw = (i) => { let p = 20 + i; return cal.map((date, k) => { p *= 1 + (i - 15) * 0.00004 + Math.sin(k * 0.3 + i) * 0.006; return { date, open: p * 0.999, high: p * 1.01, low: p * 0.99, close: p, volume: 1e6 * (1 + i / 10), adjClose: p, dividend: 0, splitFactor: 1 }; }); };
  const shares = (i) => cal.filter((d, k) => k % 63 === 0).map((d) => [d, 1e6 * (1 + i), d, 'dei']);
  const segs = Array.from({ length: 30 }, (_, i) => ({ id: `tiingo:NYSE:T${i}:2000-01-01`, raw: mkRaw(i), survivor: true, delisted: false, cls: i === 0 ? 'ADR' : 'EQUITY_COMMON', fund: { eps: [], rev: [], shares: shares(i), cik: 'C' + i } }));
  const r = runAnalysis({ segs, spyAdj: L.adjustSeries(mkRaw(3)), hash: 'x', nonEquityExcluded: 0, secCoverage: null }, { MODE: 'dev', SET: 'hs3d1' });
  assert.equal(r.stats.trialsCounted, 31);
  assert.ok(r.trials.C00.meanPositions <= 29.5);
});

test('HS3-D3: falsch skalierte Aktienzahl wird verworfen, echter Split nicht', () => {
  const cal = calendarOf(800, '2018-01-01');
  const idx = new Map(cal.map((d, i) => [d, i]));
  const s = mkStock('PL', cal, 0);
  s.split = cal.map((d, i) => (i === 600 ? 4 : 1));
  const q = [100, 200, 300, 400, 500, 650];
  s.fund = { shares: q.map((k, j) => [cal[k], j === 5 ? 1e9 : 1e6, cal[k + 5]]) };
  const st = prepareStock(s, idx);
  assert.ok(Number.isNaN(mcapAtT(st, 700, cal[700], undefined, { plausibility: true })), 'Ausreisser x1000 verworfen');
  s.fund = { shares: q.map((k, j) => [cal[k], j === 5 ? 4e6 : 1e6, cal[k + 5]]) };
  const st2 = prepareStock(s, idx);
  assert.ok(Number.isFinite(mcapAtT(st2, 700, cal[700], undefined, { plausibility: true })), 'Split 4:1 ist plausibel');
});

test('HS4: Volumenprofil (Plus/Minus-Umsatz, Akkumulation) nur aus Balken bis t', async () => {
  const { upDownVolume, accumulation } = await import('../house/engine.mjs');
  const n = 80, st = { close: [], high: [], low: [], rawClose: [], rawVolume: [] };
  for (let i = 0; i < n; i++) { const c = 10 + (i % 2 ? 1 : 0); st.close.push(c); st.rawClose.push(c); st.high.push(c + 0.5); st.low.push(c - 0.5); st.rawVolume.push(i % 2 ? 300 : 100); }
  const u = upDownVolume(st, 70, 50);
  assert.ok(u > 2.5 && u < 3.5, `UDV ${u}`);
  const st2 = { ...st, close: st.close.map((c, i) => st.high[i]) };
  assert.ok(Math.abs(accumulation(st2, 70, 63) - 1) < 1e-12, 'Schluss am Hoch = volle Akkumulation');
  const poisoned = { ...st, rawVolume: st.rawVolume.map((v, i) => (i > 70 ? 1e9 : v)) };
  assert.equal(upDownVolume(poisoned, 70, 50), u, 'Zukunft veraendert nichts');
});

test('HS4 full end-to-end: explorative Kriterien, Zufallsauswahl, V06 als Kontrolle', async () => {
  const { runAnalysis } = await import('../house/analyze.mjs');
  const cal = []; const dd = new Date('2015-01-01T00:00:00Z');
  while (dd.toISOString().slice(0, 10) <= '2026-09-30') { const wd = dd.getUTCDay(); if (wd && wd !== 6) cal.push(dd.toISOString().slice(0, 10)); dd.setUTCDate(dd.getUTCDate() + 1); }
  const mkRaw = (i) => { let p = 20 + i; return cal.map((date, k) => { p *= 1 + (i - 10) * 0.0001 + Math.sin(k * 0.3 + i) * 0.006; return { date, open: p * 0.999, high: p * 1.01, low: p * 0.99, close: p, volume: 1e6 * (1 + i / 10), adjClose: p, dividend: 0, splitFactor: 1 }; }); };
  const shares = (i) => cal.filter((d, k) => k % 63 === 0).map((d) => [d, 1e6 * (1 + i), d, 'dei']);
  const segs = Array.from({ length: 40 }, (_, i) => ({ id: `tiingo:NYSE:T${i}:2000-01-01`, raw: mkRaw(i), survivor: true, delisted: false, cls: 'EQUITY_COMMON', fund: { eps: [[cal[10], 1, cal[11]]], rev: [], shares: shares(i), cik: 'C' + i } }));
  const r = runAnalysis({ segs, spyAdj: L.adjustSeries(mkRaw(3)), hash: 'x', nonEquityExcluded: 0, secCoverage: null }, { MODE: 'full', SET: 'hs4' });
  assert.equal(r.period.to, '2026-09-30');
  assert.deepEqual(Object.keys(r.trials), ['V01', 'V02', 'V03', 'V04', 'V05', 'V06']);
  assert.notEqual(r.selection.selected, 'V06');
  assert.equal(r.stats.trialsCounted, 49);
  assert.ok(r.explorative && ['EXPLORATORY_PROMISING', 'EXPLORATORY_NO_EDGE'].includes(r.explorative.criteria.verdict));
  assert.equal(r.controls.RANDOM_FILTERED.length, 20);
  for (const t of Object.values(r.trials)) assert.ok(t.reconcile < 1e-9 && t.meanPositions <= 20.5);
});

test('Live HS4-V03: Monatsende mit Feiertagen, eingefrorene Regeln, Entscheidung aus Kunstdaten', async () => {
  const { nextTradingDay, isMonthEnd, assertLiveFrozen, decide, emptyLedger } = await import('../house/live.mjs');
  const hol = new Set(['2026-12-25', '2027-01-01']);
  assert.equal(nextTradingDay('2026-10-30', hol), '2026-11-02');
  assert.ok(isMonthEnd('2026-10-30', hol));
  assert.ok(!isMonthEnd('2026-10-29', hol));
  assert.ok(isMonthEnd('2026-12-31', hol));
  assert.equal(nextTradingDay('2026-12-24', hol), '2026-12-28');
  assertLiveFrozen();
  const cal = calendarOf(320, '2025-01-01');
  const idx = new Map(cal.map((d, i) => [d, i]));
  const stocks = Array.from({ length: 30 }, (_, i) => { const s = mkStock('tiingo:NYSE:L' + i + ':2000-01-01', cal, 0.0005 + i * 0.00002, { vol: 2e6 }); s.low = s.close.map((c) => c * 0.99); s.split = cal.map(() => 1); s.cls = 'EQUITY_COMMON'; s.fund = { eps: [[cal[5], 1, cal[6]]], rev: [], shares: [[cal[200], 1e7 * (i + 1), cal[201]], [cal[250], 1e7 * (i + 1), cal[251]], [cal[300], 1e7 * (i + 1), cal[301]]], cik: 'K' + i }; return prepareStock(s, idx); });
  const d = decide(stocks, cal, emptyLedger());
  assert.equal(d.date, cal.at(-1));
  assert.ok(d.holdings.length > 0 && d.holdings.length <= 20);
  assert.ok(Math.abs(d.holdings.reduce((a, h) => a + h.weight, 0) - 1) < 0.01);
  assert.deepEqual(d.sells, []);
});

test('HS4 ausserhalb der Stichprobe (oos): V03 fest, Kriterien O1–O5', async () => {
  const { runAnalysis } = await import('../house/analyze.mjs');
  const cal = []; const dd = new Date('2007-01-01T00:00:00Z');
  while (dd.toISOString().slice(0, 10) <= '2015-12-31') { const wd = dd.getUTCDay(); if (wd && wd !== 6) cal.push(dd.toISOString().slice(0, 10)); dd.setUTCDate(dd.getUTCDate() + 1); }
  const mkRaw = (i) => { let p = 20 + i; return cal.map((date, k) => { p *= 1 + (i - 10) * 0.0001 + Math.sin(k * 0.3 + i) * 0.006; return { date, open: p * 0.999, high: p * 1.01, low: p * 0.99, close: p, volume: 1e6 * (1 + i / 10), adjClose: p, dividend: 0, splitFactor: 1 }; }); };
  const shares = (i) => cal.filter((d, k) => k % 63 === 0).map((d) => [d, 1e6 * (1 + i), d, 'dei']);
  const segs = Array.from({ length: 40 }, (_, i) => ({ id: `tiingo:NYSE:T${i}:2000-01-01`, raw: mkRaw(i), survivor: true, delisted: false, cls: 'EQUITY_COMMON', fund: { eps: [[cal[10], 1, cal[11]]], rev: [], shares: shares(i), cik: 'C' + i } }));
  const r = runAnalysis({ segs, spyAdj: L.adjustSeries(mkRaw(3)), hash: 'x', nonEquityExcluded: 0, secCoverage: null }, { MODE: 'oos', SET: 'hs4oos' });
  assert.equal(r.period.from, '2008-01-31');
  assert.equal(r.period.to, '2015-12-31');
  assert.equal(r.selection.selected, 'V03');
  assert.ok(['OOS_CONFIRMED', 'OOS_NOT_CONFIRMED'].includes(r.oos.criteria.verdict));
});
