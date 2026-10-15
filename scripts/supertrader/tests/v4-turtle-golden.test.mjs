// Golden cases for the source-faithful Turtle engine (T4-*). Synthetic daily bars; each case states why.
import test from 'node:test';
import assert from 'node:assert/strict';
import { turtleN, channel, createBreakoutTracker, notionalAccount, createNotionalAccount, unitShares, runTurtleSource, TURTLE_RULES_V4, TURTLE_PARAMS, eligibleYesterday } from '../research/v4/methods/turtle-source-v4.mjs';
import { weekdays } from './v4-fixtures.mjs';

const UNIVERSE = { priceFloorRaw: 0, dollarVolumeSessions: 1, dollarVolumeFloor: 0 };
const DATES = weekdays('2019-01-01', '2019-12-31');
/** closes -> bars with a fixed 0.1 half-range; `over` patches individual bars (o/h/l/c). */
function bars(closes, over = {}, half = 0.1) {
  return closes.map((c, i) => {
    const b = { date: DATES[i], open: c, high: c + half, low: c - half, close: c, volume: 1e6, rawVolume: 1e6, rawClose: c, dividend: 0, splitAdjustmentFactor: 1, totalReturnIndex: c };
    return { ...b, ...(over[i] || {}), ...(over[i]?.close !== undefined ? { rawClose: over[i].close, totalReturnIndex: over[i].close } : {}) };
  });
}
function dataset(b) {
  return { benchmark: { bars: b.map((x) => ({ date: x.date, close: 1, open: 1, totalReturnIndex: 1 })) }, securities: [{ id: 'tiingo:NYSE:GOLD:2010-01-01', ticker: 'GOLD', listing: { instrumentType: 'EQUITY_COMMON' }, bars: b, terminal: null }] };
}
const run = (b, system = 'S1', extra = {}) => runTurtleSource(dataset(b), { system, universe: UNIVERSE, from: b[0].date, to: b.at(-1).date, slippageBpsPerSide: 0, commissionBpsPerSide: 0, ...extra });
const flat = (n, c = 10) => Array(n).fill(c);

test('T4-N: TR max(H-L,H-PDC,PDC-L), seeded with the 20-day mean, then (19*PDN+TR)/20', () => {
  const b = bars(flat(25));
  const N = turtleN(b);
  assert.equal(N[18], null);
  assert.ok(Math.abs(N[19] - 0.2) < 1e-12);
  const b2 = bars([...flat(20), 11]);
  assert.ok(Math.abs(turtleN(b2)[20] - (19 * 0.2 + 1.1) / 20) < 1e-12);
});

test('channels exclude the current bar', () => {
  const b = bars([1, 2, 3, 4, 5]);
  assert.deepEqual(channel(b, 2, 'high').map((x) => (x === null ? null : +x.toFixed(2))), [null, null, 2.1, 3.1, 4.1]);
});

test('GOLDEN confirmed buy (first S1 breakout, no prior breakout): fill at trigger = prior 20-day high + tick', () => {
  const b = bars([...flat(30), 10.5], { 30: { open: 10.0, high: 10.6, low: 9.9, close: 10.5 } });
  const r = run(b);
  assert.equal(r.counts.entries, 1);
  assert.equal(r.signals[0].path, 'S1');
  assert.ok(Math.abs(r.signals[0].fill - 10.11) < 1e-9, 'why: the high 10.6 exceeded the prior 20-day high 10.10 by more than one tick while the open 10.0 was below it');
});

test('GOLDEN exception (gap): open above the trigger fills at the open, not at the trigger (TUR-F-BO-01)', () => {
  const b = bars([...flat(30), 12], { 30: { open: 12, high: 12.1, low: 11.9, close: 12 } });
  const r = run(b);
  assert.equal(r.signals[0].fill, 12);
});

test('GOLDEN reject: S1 breakout after a winning breakout is skipped (TUR-F-S1-FILTER)', () => {
  // breakout A at bar 30 (taken), trend up, then 10-day-low exit with profit, consolidation, breakout B
  const up = Array.from({ length: 15 }, (_, k) => 10.5 + 0.2 * (k + 1));
  const closes = [...flat(30), 10.5, ...up, 12.0, 11.5, ...flat(25, 11.6), 13.5];
  const r = run(bars(closes));
  assert.equal(r.trades[0].reason, 'EXIT_10D');
  assert.ok(r.trades[0].pnl > 0);
  assert.equal(r.counts.skippedByFilter, 1, 'why: the previous breakout ended with a profitable 10-day exit');
  assert.equal(r.counts.entries, 1);
});

test('GOLDEN exception: skipped S1 breakout that is also a 55-day breakout enters as FAILSAFE_55', () => {
  const up = Array.from({ length: 15 }, (_, k) => 10.5 + 0.2 * (k + 1));
  const closes = [...flat(30), 10.5, ...up, 12.0, 11.5, ...flat(25, 11.6), 16];
  const r = run(bars(closes, { [closes.length - 1]: { open: 13.0, high: 16.1, low: 12.9, close: 16 } }));
  assert.equal(r.counts.skippedByFilter, 1);
  assert.equal(r.counts.failsafeEntries, 1);
  assert.equal(r.signals.at(-1).path, 'FAILSAFE_55');
});

test('GOLDEN confirmed buy after a losing breakout (2N against before a profitable exit)', () => {
  // breakout A then immediate collapse through 2N (N~0.2 -> 0.4) -> loser; then new breakout B is taken
  const closes = [...flat(30), 10.5, 10.3, 9.6, ...flat(25, 9.6), 11.0];
  const r = run(bars(closes));
  assert.equal(r.trades[0].reason, 'STOP_2N');
  assert.equal(r.counts.skippedByFilter, 0);
  assert.equal(r.counts.entries, 2);
});

test('GOLDEN educational: a short 20-day breakout counts in the S1 filter although VU trades long only (TUR-E-SHORT-01)', () => {
  // downside breakout that is a winner for the hypothetical short (10-day-high exit below entry), then a long breakout
  const down = Array.from({ length: 12 }, (_, k) => 9.5 - 0.2 * (k + 1));
  const closes = [...flat(30), 9.5, ...down, 7.4, 7.6, ...flat(25, 7.7), 9.0];
  const r = run(bars(closes));
  assert.equal(r.counts.entries, 0, 'why: the last breakout (short, hypothetical) was a winner, so the long breakout is skipped');
  assert.equal(r.counts.skippedByFilter, 1);
});

test('GOLDEN ambiguous (resolved by the declared convention): stop inside the entry bar is assumed hit (pessimistic)', () => {
  const b = bars([...flat(30), 10.5], { 30: { open: 10.0, high: 10.6, low: 9.5, close: 10.5 } });
  const r = run(b);
  assert.equal(r.counts.sameBarStops, 1);
  assert.equal(r.trades[0].reason, 'STOP_2N_ENTRY_BAR');
});

test('GOLDEN pyramid: adds every 1/2 N up to 4 units; stop = 2N below the newest unit (TUR-F-ADD-01, TUR-F-STOP-ADD)', () => {
  // price 100, half range 3 -> N ~ 6 -> one unit ~ 16 % of equity, so four units fit in cash
  const b = bars([...flat(30, 100), 104, 107.5, 110.5, 113.5], { 30: { open: 100, high: 104, low: 99, close: 104 } }, 3);
  const r = run(b);
  assert.equal(r.counts.entries, 1);
  assert.equal(r.counts.adds, 3, 'why: each later bar exceeds the previous unit fill by at least 1/2 N');
  assert.equal(r.curve.at(-1).units, 4);
  assert.ok(r.counts.stopExits === 0);
});

test('GOLDEN S2: no filter; 55-day breakout is taken even after a winner', () => {
  // entry at the 55-day breakout, trend to 15.5, plateau, drop through the 20-day low with profit (a winner),
  // base at 14, then a new 55-day breakout: S2 takes it (no filter)
  const up = Array.from({ length: 25 }, (_, k) => 10.5 + 0.2 * (k + 1));
  const closes = [...flat(60), 10.5, ...up, ...flat(20, 15.5), 14.0, ...flat(60, 14.0), 17];
  const r = run(bars(closes), 'S2');
  assert.equal(r.trades[0].reason, 'EXIT_20D');
  assert.ok(r.trades[0].pnl > 0);
  assert.equal(r.counts.skippedByFilter, 0);
  assert.equal(r.counts.entries, 2, 'why: System 2 takes every 55-day breakout regardless of the previous outcome');
});

test('notional account (TUR-F-NOTIONAL-01 example): 1M -> 0.8M after 100k, -> 0.64M after a further 80k; cut holds until the year start is regained', () => {
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  assert.equal(notionalAccount(1e6, 1.1e6), 1e6);
  assert.ok(close(notionalAccount(1e6, 0.9e6), 0.8e6));
  assert.ok(close(notionalAccount(1e6, 0.85e6), 0.8e6));
  assert.ok(close(notionalAccount(1e6, 0.82e6), 0.64e6), 'thresholds compound: 10 %, 18 %, 24.4 %');
  assert.ok(close(notionalAccount(1e6, 0.756e6), 0.512e6));
  assert.equal(notionalAccount(1e6, 0.5e6), 0, 'TUR-E-NOTIONAL-01: no new units from a 50 % yearly loss');
  const a = createNotionalAccount(); a.newYear(1e6);
  a.update(0.85e6);
  assert.ok(close(a.update(0.95e6), 0.8e6), 'hysteresis: partial recovery does not restore the notional');
  assert.equal(a.update(1.0e6), 1e6, 'restored when the year start is regained');
  assert.equal(unitShares(1e6, 2), 5000);
});

test('filter path order (review R3): a crash bar that crosses the 10-day exit before the 2N stop is a profitable exit, not a loss', () => {
  const up = Array.from({ length: 15 }, (_, k) => 10.5 + 0.2 * (k + 1));
  const closes = [...flat(30), 10.5, ...up, 9.5];
  const b = bars(closes, { [closes.length - 1]: { open: 13.4, high: 13.5, low: 9.4, close: 9.5 } });
  const t = createBreakoutTracker(b, turtleN(b));
  for (let i = 1; i < b.length; i++) t.step(i);
  assert.equal(t.lastOutcome(), 'WINNER');
});

test('raised stop is re-checked on the add bar (review R4, pessimistic)', () => {
  const b = bars([...flat(30, 100), 104, 112], { 30: { open: 100, high: 104, low: 99, close: 104 }, 31: { open: 104, high: 113, low: 98, close: 112 } }, 3);
  const r = run(b);
  assert.ok(r.counts.sameBarAddStops >= 1);
  assert.equal(r.curve.at(-1).units, 0);
});

test('no entry on the terminal bar (review R5)', () => {
  const b = bars([...flat(30), 10.5], { 30: { open: 10.0, high: 10.6, low: 9.9, close: 10.5 } });
  const d = dataset(b); d.securities[0].terminal = { date: b[30].date, kind: 'DELISTED', delistClass: 'UNKNOWN' };
  const r = runTurtleSource(d, { system: 'S1', universe: UNIVERSE, from: b[0].date, to: b.at(-1).date, slippageBpsPerSide: 0, commissionBpsPerSide: 0 });
  assert.equal(r.counts.entries, 0);
  assert.equal(r.counts.terminalBarEntriesBlocked, 1);
});

test('ledger replay (review R6): an independent re-valuation of the fill ledger reproduces the engine curve', async () => {
  const { replayTurtleLedger } = await import('../research/v4/methods/../review/turtle-replay-v4.mjs');
  const { syntheticData } = await import('./v4-fixtures.mjs');
  const d = syntheticData({ n: 30 });
  const r = runTurtleSource(d, { system: 'S1', universe: { priceFloorRaw: 5, dollarVolumeSessions: 20, dollarVolumeFloor: 1e6 }, from: '2018-01-02', to: '2026-09-30' });
  assert.ok(r.trades.length > 10);
  assert.equal(replayTurtleLedger(r, d).status, 'PASS');
  r.curve[100].equity += 1;
  assert.equal(replayTurtleLedger(r, d).status, 'FAIL');
});

test('universe eligibility uses the prior session only', () => {
  const b = bars([1, 1, 100]);
  const u = { priceFloorRaw: 5, dollarVolumeSessions: 1, dollarVolumeFloor: 0 };
  assert.equal(eligibleYesterday(b, 2, u), false);
});

test('no cash -> REJECT_NO_CASH, never leverage (TUR-E-LEV-01)', () => {
  // half range 0.01 -> N ~ 0.02 -> one unit = 1 % / N of equity ~ 5x equity at price 10
  const b = bars([...flat(30), 10.5], {}, 0.01);
  const r = run(b, 'S1', { initialCapital: 1000 });
  assert.equal(r.counts.rejectNoCash, 1);
  assert.equal(r.counts.entries, 0);
});

test('traceability: every SOURCE rule names source ids; every numeric parameter is in TURTLE_PARAMS', () => {
  for (const r of TURTLE_RULES_V4) {
    if (r.kind === 'SOURCE') assert.ok(r.sourceIds.length > 0, r.ruleId);
    assert.ok(r.code && r.tests.length, r.ruleId);
  }
  assert.deepEqual(Object.keys(TURTLE_PARAMS).sort(), ['S1', 'S2', 'addStepN', 'filterBreakout', 'filterExit', 'maxUnitsDirection', 'maxUnitsPerMarket', 'nPeriod', 'notionalCutStep', 'notionalLossStep', 'rankLookback', 'rawTick', 'stopN', 'unitRiskFraction']);
});

test('tracker alone: long winner then the next long breakout sees a non-losing last outcome', () => {
  const up = Array.from({ length: 15 }, (_, k) => 10.5 + 0.2 * (k + 1));
  const b = bars([...flat(30), 10.5, ...up, 12.0, 11.5]);
  const N = turtleN(b), t = createBreakoutTracker(b, N);
  for (let i = 1; i < b.length; i++) t.step(i);
  assert.equal(t.lastOutcome(), 'WINNER');
});
