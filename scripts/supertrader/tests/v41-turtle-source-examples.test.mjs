// V4.1: #709 Turtle worked examples (W-TUR) as executable goldens, and the frozen-engine deviation V41-F1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { unitContracts, nextAddLevel, unitStops, frozenV4UniformStop } from '../research/v4/methods/turtle-unit-stops-v4-1.mjs';
import { unitShares, runTurtleSource } from '../research/v4/methods/turtle-source-v4.mjs';
import { weekdays } from './v4-fixtures.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const nearAll = (xs, ys) => xs.length === ys.length && xs.every((x, i) => near(x, ys[i]));

test('TS-HO2002 (TUR-UNIT, TUR-DOLLAR): N 0.0141, notional 1,000,000, 42,000 $/point -> 16 contracts', () => {
  assert.equal(unitContracts(1e6, 0.0141, 42000), 16);
  assert.equal(Math.floor(unitShares(1e6, 0.0141 * 42000)), 16, 'the frozen equity unit is the same quantity before flooring (V41-F2: fractional shares are a declared translation)');
});

test('TS-GOLD (TUR-ADD): first fill 310, N 2.50 -> adds at 311.25, 312.50, 313.75', () => {
  const levels = [310]; for (let k = 0; k < 3; k++) levels.push(nextAddLevel(levels.at(-1), 2.5));
  assert.ok(nearAll(levels, [310, 311.25, 312.5, 313.75]));
});

test('TS-CRUDE-NORMAL (TUR-STOP, TUR-STOPADD): fills 28.30/28.90/29.50/30.10, N 1.20 -> every stop at 27.70', () => {
  assert.ok(nearAll(unitStops([28.3], 1.2), [25.9]), 'first unit: 2N below its fill');
  assert.ok(nearAll(unitStops([28.3, 28.9, 29.5, 30.1], 1.2), [27.7, 27.7, 27.7, 27.7]));
  assert.ok(nearAll(frozenV4UniformStop([28.3, 28.9, 29.5, 30.1], 1.2), [27.7, 27.7, 27.7, 27.7]), 'without a gap the frozen V4 reading agrees');
});

test('TS-CRUDE-GAP (TUR-STOPADD, TUR-STOPGAP): fourth fill gapped to 30.80 -> stops 27.70, 27.70, 27.70, 28.40', () => {
  assert.ok(nearAll(unitStops([28.3, 28.9, 29.5, 30.8], 1.2), [27.7, 27.7, 27.7, 28.4]));
  assert.ok(nearAll(frozenV4UniformStop([28.3, 28.9, 29.5, 30.8], 1.2), [28.4, 28.4, 28.4, 28.4]), 'V41-F1: the frozen reading puts every unit at 28.40');
});

test('TS-V41-F1 (known deviation): the frozen V4 engine closes all units at the stop of a gapped add', () => {
  // N = 6 (half range 3). Entry 103.01, gapped add at 110 -> source stops [94.01, 98]; frozen engine: one stop at 98.
  const dates = weekdays('2019-01-01', '2019-12-31');
  const closes = [...Array(30).fill(100), 104, 110, 97];
  const over = { 30: { open: 100, high: 104, low: 99, close: 104 }, 31: { open: 110, high: 111, low: 109, close: 110 }, 32: { open: 100, high: 100.5, low: 96, close: 97 } };
  const bars = closes.map((c, i) => ({ date: dates[i], open: c, high: c + 3, low: c - 3, close: c, volume: 1e6, rawVolume: 1e6, rawClose: c, dividend: 0, splitAdjustmentFactor: 1, totalReturnIndex: c, ...(over[i] || {}) }));
  const data = { benchmark: { bars: bars.map((x) => ({ date: x.date, close: 1, open: 1, totalReturnIndex: 1 })) }, securities: [{ id: 'tiingo:NYSE:CRUDE:2010-01-01', ticker: 'CRUDE', listing: { instrumentType: 'EQUITY_COMMON' }, bars, terminal: null }] };
  const r = runTurtleSource(data, { system: 'S1', universe: { priceFloorRaw: 0, dollarVolumeSessions: 1, dollarVolumeFloor: 0 }, from: bars[0].date, to: bars.at(-1).date, slippageBpsPerSide: 0, commissionBpsPerSide: 0 });
  const fills = r.ledger.filter((l) => l.side === 'BUY').map((l) => l.price);
  assert.ok(nearAll(fills, [103.01, 110]), 'entry at the trigger, add at the gapped open');
  assert.ok(nearAll(unitStops(fills, 6), [94.01, 98]), 'source: the first unit keeps 94.01');
  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].units, 2, 'frozen engine: both units leave at 98 although the first unit\'s source stop is 94.01');
  assert.equal(r.trades[0].reason, 'STOP_2N');
  assert.equal(r.openPositions, 0, 'when V41-F1 is fixed, one unit stays open and this golden must flip');
});
