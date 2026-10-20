// Source-faithful Turtle S1 / S2 (C01 / C02): golden cases from the #709 worked examples (W-TUR TUR-HO2002, TUR-GOLD,
// TUR-CRUDE) and synthetic cases for every entry, filter, add, stop, exit, rank, cash and data rule. No market data.
// Base series F: flat at 100 with high 105 / low 95, so TR = N = 10 and one unit = 1 % x 100,000 / 10 = 100 shares.
import test from 'node:test';
import assert from 'node:assert/strict';
import { turtleN, unitSize, unitStops, createNotionalAccount, createBreakoutTracker, entryTrigger, runTurtle, PARAMS } from '../source-faithful/methods/turtle.mjs';
import { RESEARCH_UNIVERSE } from '../source-faithful/common/series.mjs';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const day = (k) => new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10);
/** bars from [open, high, low, close] rows; liquid by construction (raw close >= 5, 1M shares) */
const bars = (rows, { volume = 1e6, splitAdj = 1 } = {}) => rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume, rawClose: c * splitAdj, rawVolume: volume / splitAdj, splitAdj, dividend: 0 }));
const flat = (n, p = 100, r = 5) => Array.from({ length: n }, () => [p, p + r, p - r, p]);
const F = () => flat(60);
const dataOf = (secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs.map((s) => ({ terminal: null, ...s })) });
const run = (secs, opts = {}) => runTurtle(dataOf(secs), { system: 'S2', from: secs[0].bars[0].date, ...opts });
const buyFills = (r, id) => r.ledger.filter((x) => x.side === 'BUY' && (!id || x.id === id)).map((x) => x.price / 1.001);
const ENTRY = 105.01; // one tick above the prior 20 / 55-day high of F

test('GC-TUR-N: TR and N = (19 x N_prev + TR) / 20 seeded with the 20-day mean (TUR-TR, TUR-N)', () => {
  const b = bars([...flat(20), [100, 110, 96, 108]]);
  const N = turtleN(b);
  assert.equal(N[18], null);
  assert.ok(close(N[19], 10));
  assert.ok(close(N[20], (19 * 10 + 14) / 20)); // TR = max(110-96, 110-100, 100-96) = 14
});

test('GC-TUR-HO2002: N 0.0141, notional 1,000,000, 42,000 $/point -> 16 contracts (#709 TUR-HO2002, TUR-UNIT)', () => {
  assert.equal(unitSize(1_000_000, 0.0141, 42_000), 16);
});

test('GC-TUR-UNIT-EQUITY: equities use 1 $ per point and whole shares (TUR-SF-UNIT derivation)', () => {
  assert.equal(unitSize(100_000, 2.5), 400);
  assert.equal(unitSize(100_000, 3), 333);
  assert.equal(unitSize(100_000, 0), 0);
});

test('GC-TUR-NOTIONAL: 10 % loss cuts the notional by 20 %, cuts compound, recover at the year start (TUR-NOTIONAL, TUR-DRAWDOWN)', () => {
  const a = createNotionalAccount();
  a.newYear(1_000_000);
  assert.equal(a.update(950_000), 1_000_000);
  assert.ok(close(a.update(900_000), 800_000));
  assert.ok(close(a.update(830_000), 800_000));   // 17 % < second threshold 18 %
  assert.ok(close(a.update(820_000), 640_000));   // 18 % = 10 % + 8 %
  assert.ok(close(a.update(1_000_000), 1_000_000));
});

test('GC-TUR-GOLD: adds at 1/2 N above the previous actual fill (#709 TUR-GOLD 310 / 311.25 / 312.50 / 313.75)', () => {
  const N = 2.5; let fill = 310; const levels = [];
  for (let k = 0; k < 3; k++) { fill += PARAMS.addStepN * N; levels.push(fill); }
  assert.deepEqual(levels, [311.25, 312.5, 313.75]);
  // engine: one bar reaching all levels builds four units on the same day (TUR-ADDFAST)
  const r = run([{ id: 'A', bars: bars([...F(), [100, 121, 104, 120]]) }]);
  const f = buyFills(r, 'A');
  assert.equal(f.length, 4);
  for (const [k, v] of f.entries()) assert.ok(close(v, ENTRY + 5 * k, 1e-6), `unit ${k + 1}: ${v}`);
  assert.equal(r.unitTrades.length, 0); // raised stops 100.01 stay below the bar low 104
});

test('GC-TUR-CRUDE-NORMAL: fills 28.30 / 28.90 / 29.50 / 30.10, N 1.20 -> all stops 27.70 (#709 TUR-CRUDE, TUR-STOPADD)', () => {
  for (const v of unitStops([28.3, 28.9, 29.5, 30.1], 1.2)) assert.ok(close(v, 27.7), String(v));
});

test('GC-TUR-CRUDE-GAP: fourth fill gapped to 30.80 -> stops 27.70, 27.70, 27.70, 28.40 (#709 TUR-CRUDE, TUR-STOPGAP; closes #712 V41-F1)', () => {
  const s = unitStops([28.3, 28.9, 29.5, 30.8], 1.2).map((v) => Math.round(v * 100) / 100);
  assert.deepEqual(s, [27.7, 27.7, 27.7, 28.4]);
  assert.notDeepEqual(s, [28.4, 28.4, 28.4, 28.4]); // the frozen V4 reading is not the source
});

test('GC-TUR-ADD-GAP-FILL / GC-TUR-UNIT-STOP-EXIT: a gapped add fills at the open, units keep different stops, the top unit is stopped out alone', () => {
  const rows = [...F(), [100, 108, 104, 107], [125, 126, 124, 125.5], [110, 111, 104.5, 106]];
  const r = run([{ id: 'A', bars: bars(rows) }]);
  const f = buyFills(r, 'A');
  assert.ok(close(f[0], ENTRY, 1e-6) && close(f[1], 125, 1e-6), f.join(','));
  const stops = unitStops(f, 10); // [90.01, 105]
  assert.ok(close(stops[0], 90.01, 1e-6) && close(stops[1], 105, 1e-6));
  assert.equal(r.unitTrades.length, 1);
  assert.equal(r.unitTrades[0].unit, 2);
  assert.equal(r.unitTrades[0].reason, 'STOP_2N_UNIT');
  assert.ok(close(r.unitTrades[0].exitPrice, 105 * 0.999, 1e-6));
  assert.equal(r.openAtEnd[0].units, 1);
});

test('GC-TUR-NO-READD-AFTER-UNIT-STOP: after a unit is stopped out no further adds; adds measured from the last actual fill (TUR-ADD; review SF-R1-01)', () => {
  // as GC-TUR-UNIT-STOP-EXIT, then a recovery through 110 / 115 / 120 / 130
  const rows = [...F(), [100, 108, 104, 107], [125, 126, 124, 125.5], [110, 111, 104.5, 106], [106, 121, 105.5, 120], [120, 131, 119, 130]];
  const r = run([{ id: 'A', bars: bars(rows) }]);
  assert.equal(buyFills(r, 'A').length, 2); // no re-adds below or above after the stop-out
  assert.equal(r.openAtEnd[0].units, 1);
});

test('GC-TUR-ENTRY-S1 / GC-TUR-ENTRY-S2: one tick above the prior 20 / 55-day high, intraday (TUR-S1ENT, TUR-S2ENT, TUR-INTRADAY)', () => {
  const rows = F(); rows[30] = [100, 110, 95, 100]; // 55-day high 110 in the window, 20-day high 105
  const b = bars([...rows, [100, 106, 99, 105]]), i = b.length - 1;
  assert.ok(close(entryTrigger(b, i, 'S1', null).trigger, ENTRY));
  assert.equal(entryTrigger(b, i, 'S2', null), null);
  const b2 = bars([...rows, [100, 111, 99, 110]]);
  assert.ok(close(entryTrigger(b2, b2.length - 1, 'S2', null).trigger, 110.01));
});

test('GC-TUR-GAP-FILL: an open above the trigger fills at the open (TUR-GAP)', () => {
  const r = run([{ id: 'A', bars: bars([...F(), [110, 112, 109.5, 111]]) }], { system: 'S1' });
  assert.ok(close(buyFills(r, 'A')[0], 110, 1e-6));
});

// Filter cases on a narrow base (N = 1): flat 100 +/- 0.5
const narrow = (n) => flat(n, 100, 0.5);
const outcomeAfter = (rows) => { const b = bars(rows), N = turtleN(b), tr = createBreakoutTracker(b, N); for (let i = 1; i < b.length; i++) { tr.resolve(i); tr.start(i); } return tr; };
// narrow base with one old dip to 90: the 20-day low stays far below, so a 2N move does not start a new short breakout
const dipBase = () => { const r = narrow(25); r[10] = [100, 100.5, 90, 100]; return r; };

test('GC-TUR-S1-SKIP-WINNER / GC-TUR-FAILSAFE: after a profitable hypothetical breakout the 20-day signal is skipped; the 55-day failsafe is taken (TUR-S1SKIP, TUR-FAILSAFE)', () => {
  const rows = narrow(25);
  for (let k = 0; k < 15; k++) rows.push([100 + k, 101.5 + k, 99.8 + k, 101 + k]); // breakout 100.51 and up-run
  rows.push([113, 113.2, 104, 104.5]);                                           // 10-day exit at 104.79 > 100.51
  for (let k = 0; k < 25; k++) rows.push([104.5, 104.9, 104.1, 104.5]);
  assert.equal(outcomeAfter(rows).outcome(), 'WINNER');
  const e1 = entryTrigger(bars([...rows, [104.5, 105.5, 104.2, 105.2]]), rows.length, 'S1', 'WINNER');
  assert.equal(e1.path, 'SKIPPED_BY_FILTER');
  assert.equal(e1.trigger, null);
  const e2 = entryTrigger(bars([...rows, [114, 116, 113.5, 115.8]]), rows.length, 'S1', 'WINNER');
  assert.equal(e2.path, 'FAILSAFE_55');
  assert.ok(close(e2.trigger, 115.51));
  const s2 = entryTrigger(bars([...rows, [114, 116, 113.5, 115.8]]), rows.length, 'S2', 'WINNER'); // TUR-S2NOSKIP
  assert.equal(s2.path, 'S2');
  assert.equal(s2.skipped, false);
});

test('GC-TUR-S1-TAKE-AFTER-LOSER: a 2N adverse move before a profitable exit makes a loser; the next signal is taken (TUR-S1LOSER)', () => {
  const rows = [...dipBase(), [100, 101, 100.2, 100.8], [97, 97.5, 96.5, 97]]; // entry 100.51, N ~1.37, stop ~97.78, opens below
  assert.equal(outcomeAfter(rows).outcome(), 'LOSER');
  assert.equal(entryTrigger(bars([...rows, [101, 101.5, 100.6, 101.3]]), rows.length, 'S1', 'LOSER').path, 'S1');
});

test('GC-TUR-S1-TAKE-AFTER-UNPROFITABLE-EXIT: a 10-day exit at a loss is not profitable, so the next signal is taken (TUR-S1SKIP)', () => {
  const rows = [...dipBase(), [100, 101, 100.2, 100.8], [100.5, 100.6, 99.3, 99.4]]; // 10-day exit 99.49 < 100.51 before the 2N stop
  const t = outcomeAfter(rows);
  assert.equal(t.outcome(), 'NON_LOSER');
  assert.equal(entryTrigger(bars([...rows, [101, 101.5, 100.6, 101.3]]), rows.length, 'S1', t.outcome()).path, 'S1');
});

test('GC-TUR-S1-SHORT-COUNTS: a short 20-day breakout counts for the S1 filter (TUR-S1DIR)', () => {
  const rows = narrow(25);
  for (let k = 0; k < 15; k++) rows.push([100 - k, 100.2 - k, 98.4 - k, 99 - k]); // short at 99.49, runs down
  rows.push([86, 96, 85.5, 95.5]);                                               // short exit at 95.21 < 99.49
  const t = outcomeAfter(rows);
  assert.equal(t.outcome(), 'WINNER');
  assert.equal(entryTrigger(bars([...rows, ...narrow(20).map(([o, h, l, c]) => [o - 4, h - 4, l - 4, c - 4]), [97, 98, 96.5, 97.8]]), rows.length + 20, 'S1', 'WINNER').path, 'SKIPPED_BY_FILTER');
});

test('GC-TUR-EXIT-S1 / GC-TUR-EXIT-S2: all units exit one tick below the prior 10 / 20-day low (TUR-S1EX, TUR-S2EX)', () => {
  const up = []; for (let k = 0; k < 30; k++) up.push([107 + k * 0.5, 108 + k * 0.5, 106 + k * 0.5, 107.5 + k * 0.5]);
  const rows = [...F(), [100, 108, 104, 107], ...up, [117, 117.5, 115, 115.5]]; // 10-day low 116, 20-day low 111
  const s1 = run([{ id: 'A', bars: bars(rows) }], { system: 'S1' });
  const ex = s1.unitTrades.filter((t) => t.exitDate === day(rows.length - 1));
  assert.ok(ex.length >= 2);
  for (const t of ex) { assert.equal(t.reason, 'EXIT_10D'); assert.ok(close(t.exitPrice, 115.99 * 0.999, 1e-6)); }
  assert.equal(s1.openAtEnd.length, 0);
  const s2 = run([{ id: 'A', bars: bars(rows) }], { system: 'S2' });
  assert.equal(s2.unitTrades.length, 0); // 110.99 not reached
});

test('GC-TUR-LIMIT4: at most four units per security (TUR-LIMIT4)', () => {
  assert.equal(buyFills(run([{ id: 'A', bars: bars([...F(), [100, 200, 104, 190]]) }]), 'A').length, 4);
});

test('GC-TUR-LIMIT12: at most twelve long units in the portfolio (TUR-LIMIT12)', () => {
  const secs = Array.from({ length: 5 }, (_, s) => ({ id: `S${s}`, bars: bars([...flat(60, 100, 12.5), [100, 151, 112, 150]]) })); // N 25
  const r = run(secs);
  assert.equal(buyFills(r).length, 12);
  assert.ok(r.counts.rejectUnitLimit12 >= 1);
});

test('GC-TUR-RANK: simultaneous signals are bought strongest first by (close - close 63 sessions ago) / N (TUR-RANK)', () => {
  const strongRows = flat(70); for (let k = 0; k < 10; k++) strongRows[k] = [90, 95, 85, 90];
  const brk = [100, 106, 99, 105.5];
  const r = run([{ id: 'A_WEAK', bars: bars([...flat(70), brk]) }, { id: 'Z_STRONG', bars: bars([...strongRows, brk]) }]);
  assert.deepEqual(r.signals.map((s) => s.id), ['Z_STRONG', 'A_WEAK']);
});

test('GC-TUR-NO-CASH: a unit that does not fit in cash is rejected, never levered (TUR-SF-CASH)', () => {
  const r = run([{ id: 'A', bars: bars([...flat(60, 100, 0.05), [100, 101, 100.02, 100.9]]) }]); // N 0.1 -> 10,000 shares
  assert.equal(buyFills(r).length, 0);
  assert.equal(r.counts.rejectNoCash, 1);
});

test('GC-TUR-UNIVERSE: only names that pass the pre-registered research universe at the PRIOR session are traded (TUR-SF-MARKETS)', () => {
  const r = run([{ id: 'A', bars: bars([...F(), [100, 108, 104, 107]], { volume: 5000 }) }]); // 0.5M dollar volume
  assert.equal(buyFills(r).length, 0);
  assert.equal(RESEARCH_UNIVERSE.dollarVolumeFloor, 1_000_000);
});

test('GC-TUR-NO-REGIME: the engine takes no market, regime or fundamental input (TUR-SIGNAL-CONSISTENCY)', () => {
  assert.deepEqual(Object.keys(PARAMS).filter((k) => /regime|spy|index|fund|cool|breadth/i.test(k)), []);
  assert.equal(runTurtle.length, 1);
});

test('SF-TUR-TEMPORAL: decisions up to day t do not change when later bars change (no look-ahead)', () => {
  const base = [...F(), [100, 108, 104, 107], [107, 109, 106, 108.5]];
  const a = run([{ id: 'A', bars: bars([...base, [108, 112, 107.5, 111], [111, 113, 110, 112]]) }], { system: 'S1' });
  const b = run([{ id: 'A', bars: bars([...base, [80, 81, 70, 72], [60, 61, 50, 51]]) }], { system: 'S1' });
  const cut = base.length - 1, d = day(cut);
  assert.ok(a.ledger.some((x) => x.date <= d));
  assert.deepEqual(a.ledger.filter((x) => x.date <= d), b.ledger.filter((x) => x.date <= d));
  assert.deepEqual(a.curve.slice(0, cut + 1), b.curve.slice(0, cut + 1));
});

test('SF-TUR-MISSING-BAR: a held position without bars is not traded and is settled after the stale limit (research-v1 A4)', () => {
  const r = run([{ id: 'A', bars: bars([...F(), [100, 108, 104, 107]]) }, { id: 'B', bars: bars(flat(72)) }]);
  assert.equal(r.counts.unavailableSettlements, 1);
  const s = r.unitTrades.find((t) => t.id === 'A');
  assert.equal(s.reason, 'SECURITY_UNAVAILABLE');
  assert.ok(close(s.exitPrice, 107 * 0.999, 1e-6)); // last valid close, baseline factor 1
  assert.equal(s.exitDate, day(61 + 5));            // the sixth session without a bar (limit 5)
});

test('SF-TUR-TERMINAL: an economic delisting is settled by scenario on its last bar; a data gap only by the stale limit (research-v1 A5)', () => {
  const rows = [...F(), [100, 108, 104, 107], [107, 108, 106, 107.5]], last = day(rows.length - 1);
  const del = run([{ id: 'A', bars: bars(rows), terminal: { date: last, cause: 'LISTING_INACTIVE', distress: false } }], { scenario: 'S1_MINUS_30' });
  assert.equal(del.unitTrades.at(-1).reason, 'TERMINAL_DELISTED');
  assert.ok(close(del.unitTrades.at(-1).exitPrice, 107.5 * 0.7, 1e-6));
  const gap = run([{ id: 'A', bars: bars(rows), terminal: { date: last, cause: 'DATA_GAP', distress: false } }, { id: 'B', bars: bars(flat(rows.length + 8)) }], { scenario: 'S1_MINUS_30' });
  const t = gap.unitTrades.find((x) => x.id === 'A');
  assert.equal(t.reason, 'SECURITY_UNAVAILABLE');
  assert.ok(t.exitDate > last);
  assert.ok(close(t.exitPrice, 107.5 * 0.999, 1e-6)); // data events: last valid close, baseline factor 1
});

test('SF-TUR-ACCOUNTING: the ledger replays the cash exactly; equity = start + closed P&L; costs on every fill (research-v1)', () => {
  const up = []; for (let k = 0; k < 20; k++) up.push([107 + k, 108.5 + k, 106.5 + k, 108 + k]);
  const r = run([{ id: 'A', bars: bars([...F(), [100, 108, 104, 107], ...up, [100, 101, 90, 92]]) }], { system: 'S1' });
  assert.equal(r.reconciliation.pass, true);
  assert.equal(r.openAtEnd.length, 0);
  assert.ok(r.counts.costs > 0);
  const pnl = r.positionTrades.reduce((a, t) => a + t.pnl, 0);
  assert.ok(close(r.curve.at(-1).equity, 100_000 + pnl, 1e-6));
});

test('SF-TUR-SPLIT-TICK: one tick is one raw cent converted to the split-adjusted basis', () => {
  const b = bars([...flat(60, 50, 2.5), [50, 53, 50.1, 52.9]], { splitAdj: 2 });
  assert.ok(close(entryTrigger(b, b.length - 1, 'S2', null).trigger, 52.505, 1e-12));
});

test('SF-TUR-WARMUP-CAUSAL: without `from` the S1 filter warms only on bars before the first calendar date (review SF-R3-01)', () => {
  const rows = [...F()];
  for (let k = 0; k < 40; k++) rows.push([100 + (k % 7) * 3, 106 + (k % 7) * 3, 98 + (k % 5), 101 + (k % 7) * 3]);
  const secs = [{ id: 'A', bars: bars(rows) }];
  const a = runTurtle(dataOf(secs), { system: 'S1' });
  const b = runTurtle(dataOf(secs), { system: 'S1', from: day(0) });
  assert.deepEqual(a.ledger, b.ledger);
  assert.deepEqual(a.counts, b.counts);
});
