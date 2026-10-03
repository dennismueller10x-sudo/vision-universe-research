import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateRotation, metricsAt, clenow, buyReasons, PARAMS } from '../engine/rotation-52w.mjs';
import { extractFactsR12 } from '../validation/sec-pit.mjs';
import { runPortfolioTR } from '../validation/portfolio.mjs';
import { marketOkMap } from '../validation/analyze-methods.mjs';

function calendar(n) { const c = []; let d = Date.UTC(2020, 0, 1); while (c.length < n) { const x = new Date(d); if (x.getUTCDay() % 6) c.push(x.toISOString().slice(0, 10)); d += 864e5; } return c; }
const mk = (id, cal, f) => { const close = cal.map((_, i) => f(i)); const open = close.map((v, i) => (i ? close[i - 1] : v)); return { id, symbol: id, bars: { date: cal, open, high: close.map((v, i) => Math.max(v, open[i])), low: close.map((v, i) => Math.min(v, open[i])), close, volume: close.map(() => 1e6) } }; };

test('R12-T1 Clenow-Trendmaß: stetiger Anstieg hoch, Seitwärts null', () => {
  const up = Array.from({ length: 100 }, (_, i) => 10 * Math.exp(0.002 * i));
  assert.ok(Math.abs(clenow(up, 99) - (Math.exp(0.002 * 252) - 1)) < 1e-9);
  assert.equal(clenow(up, 50), null);
});

test('R12-T2 Kaufbedingungen PP: Performance seit Tief, neues Hoch, Gap, Umsatz', () => {
  const cal = calendar(400);
  const s = mk('A', cal, (i) => (i < 300 ? 10 : 10 + (i - 299) * 0.2));
  s.bars.open[380] = s.bars.close[379] * 1.07; // Gap
  const m = metricsAt(s.bars, 399);
  assert.ok(m.perf >= 1 && m.newHigh20 && m.gap20 && m.freshHigh65);
  assert.deepEqual(buyReasons(m, PARAMS.variants.PP), []);
  const flat = metricsAt(mk('B', cal, () => 10).bars, 399);
  assert.deepEqual(buyReasons(flat, PARAMS.variants.PP), ['TR52-PERF', 'TR52-GAP']);
});

test('R12-T3 Rotation: Kauf zur Eröffnung nach Monatsende, Verkauf bei fehlendem neuen Hoch, Marktampel', () => {
  const cal = calendar(700);
  const winner = mk('W', cal, (i) => (i < 300 ? 10 : i < 450 ? 10 * Math.exp(0.01 * (i - 300)) : 10 * Math.exp(1.5) * (1 - 0.001 * (i - 450))));
  for (const i of [380, 400, 420]) winner.bars.open[i] = winner.bars.close[i - 1] * 1.07; // Up-Gaps in der Rallye
  const spy = { date: cal, close: cal.map((_, i) => 100 + i) };
  const r = simulateRotation([winner], cal, spy, { variant: 'PP' });
  const all = [...r.trades, ...r.openAtEnd.map((o) => ({ entry: { date: o.entryDate }, exits: o.exits }))];
  assert.ok(all.length >= 1);
  const t = all[0];
  const prev = cal[cal.indexOf(t.entry.date) - 1];
  assert.notEqual(prev.slice(0, 7), t.entry.date.slice(0, 7)); // erster Handelstag des Monats
  assert.ok(r.trades.some((x) => x.exits.some((e) => e.ruleId === 'TR52-SELL-STALE' || e.ruleId === 'TR52-SELL-PERF')));
  const red = simulateRotation([winner], cal, { date: cal, close: cal.map((_, i) => 1000 - i) }, { variant: 'PP' });
  assert.equal(red.trades.length + red.openAtEnd.length, 0);
  assert.ok(red.skipped.some((x) => x.reason === 'MARKET_FILTER'));
});

test('R12-M Marktampel im Portfolio: keine neue Position bei SPY unter GD 200 am Vortag', () => {
  const cal = calendar(260);
  const spyAdj = { date: cal, close: cal.map((_, i) => (i < 230 ? 100 + i : 300 - 10 * (i - 229))) };
  const mok = marketOkMap(spyAdj);
  assert.equal(mok.get(cal[210]), true);
  assert.equal(mok.get(cal[259]), false);
  const tr = (d) => ({ id: d, listingId: 'X' + d, entry: { date: d, price: 10 }, initialStop: 9, exits: [{ date: cal[259], price: 10, fraction: 1 }], terminal: null, marks: new Map([[d, 10]]), divs: new Map() });
  const cfg = { initialEquity: 1e5, riskPerTrade: 0.01, maxPositionPct: 0.2, maxPositions: 5, maxExposure: 1, marketFilter: true };
  const r = runPortfolioTR([tr(cal[210]), tr(cal[258])], cal, cfg, { marketOk: mok });
  assert.equal(r.taken.length, 1); assert.equal(r.skipped[0].reason, 'MARKET_FILTER');
});

test('R12-SEC IFRS-EPS und Ursache bei nur jährlichen Werten', () => {
  const q = (s, e, v, f) => ({ start: s, end: e, val: v, filed: f });
  const ifrs = { facts: { 'ifrs-full': { DilutedEarningsLossPerShare: { units: { 'EUR/shares': [q('2023-01-01', '2023-03-31', 1, '2023-05-01'), q('2023-04-01', '2023-06-30', 1, '2023-08-01'), q('2023-07-01', '2023-09-30', 1, '2023-11-01'), q('2023-10-01', '2023-12-31', 1, '2024-02-01')] } } } } };
  const f = extractFactsR12(ifrs); assert.equal(f.taxonomy, 'ifrs-full'); assert.equal(f.eps.length, 4);
  const annual = { facts: { 'us-gaap': { EarningsPerShareDiluted: { units: { 'USD/shares': [q('2022-01-01', '2022-12-31', 2, '2023-03-01')] } } } } };
  assert.equal(extractFactsR12(annual).cause, 'ANNUAL_ONLY');
  assert.equal(extractFactsR12({ facts: { 'us-gaap': { Assets: {} } } }).cause, 'NO_EPS_TAG');
});
