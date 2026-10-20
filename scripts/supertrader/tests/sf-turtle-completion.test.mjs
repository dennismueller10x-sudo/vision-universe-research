// Supertrader 2.0 Turtle completion (sf-turtle-1.1.0): correlation-group limits TUR-LIMIT6 / TUR-LIMIT10 as engine
// mechanics with a caller-supplied point-in-time group provider, the channel exit on the entry bar, the stop-vs-channel
// order on that bar and the liquidity diagnostic. Synthetic bars only, no market data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runTurtle, turtleN, correlationLimitBreach, liquiditySummary, PARAMS, TURTLE_VERSION } from '../source-faithful/methods/turtle.mjs';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const day = (k) => new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bars = (rows, { volume = 1e6 } = {}) => rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume, rawClose: c, rawVolume: volume, splitAdj: 1, dividend: 0 }));
const flat = (n, p = 100, r = 5) => Array.from({ length: n }, () => [p, p + r, p - r, p]);
const dataOf = (secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs.map((s) => ({ terminal: null, ...s })) });
const run = (secs, opts = {}) => runTurtle(dataOf(secs), { system: 'S2', from: secs[0].bars[0].date, ...opts });
const buys = (r, id) => r.ledger.filter((x) => x.side === 'BUY' && (!id || x.id === id));

test('SF2-TUR-VERSION: the completed engine carries its own version and the printed limits 6 / 10', () => {
  assert.equal(TURTLE_VERSION, 'sf-turtle-1.1.0');
  assert.equal(PARAMS.maxUnitsClosely, 6);
  assert.equal(PARAMS.maxUnitsLoosely, 10);
});

test('GC-TUR-LIMIT6: at most six long units in one closely correlated group (TUR-LIMIT6)', () => {
  const secs = Array.from({ length: 4 }, (_, s) => ({ id: `C${s}`, bars: bars([...flat(60), [100, 200, 104, 190]]) }));
  const r = run(secs, { groupsOf: () => ({ closely: 'G', loosely: 'L' }) });
  assert.equal(buys(r).length, 6);
  assert.equal(r.counts.rejectCorrelationLimit6, 3); // C1's third unit (the add loop stops there), then the entries of C2 and C3
  assert.equal(buys(r, 'C0').length, 4);
  assert.equal(buys(r, 'C1').length, 2);
  assert.equal(r.correlationLimits, 'ENFORCED_WITH_CALLER_GROUPS');
  assert.ok(r.reconciliation.pass);
});

test('GC-TUR-LIMIT10: at most ten long units in one loosely correlated group (TUR-LIMIT10)', () => {
  const secs = Array.from({ length: 3 }, (_, s) => ({ id: `L${s}`, bars: bars([...flat(60, 100, 12.5), [100, 151, 112, 150]]) }));
  const r = run(secs, { groupsOf: (id) => ({ closely: id, loosely: 'L' }) });
  assert.equal(buys(r).length, 10);
  assert.ok(r.counts.rejectCorrelationLimit10 >= 1);
  assert.equal(r.counts.rejectCorrelationLimit6, 0);
});

test('GC-TUR-LIMIT-CORR-NO-GROUP: a security without a group is only limited by LIMIT4 / LIMIT12; no provider = NOT_EVALUATED', () => {
  const secs = Array.from({ length: 3 }, (_, s) => ({ id: `N${s}`, bars: bars([...flat(60, 100, 12.5), [100, 151, 112, 150]]) }));
  const withNull = run(secs, { groupsOf: () => null });
  const without = run(secs);
  assert.equal(buys(withNull).length, 12);
  assert.deepEqual(withNull.ledger, without.ledger);
  assert.equal(without.correlationLimits, 'NOT_EVALUATED_NO_PIT_GROUPS');
});

test('SF2-TUR-LIMIT-CORR-PURE: correlationLimitBreach counts held units of the same group at the decision date', () => {
  const g = { A: { closely: 'X', loosely: 'M' }, B: { closely: 'X', loosely: 'M' }, C: { closely: 'Y', loosely: 'M' } };
  const of = (id) => g[id] ?? null;
  assert.equal(correlationLimitBreach([{ id: 'A', units: 4 }, { id: 'B', units: 1 }], 'B', '2020-01-01', of), null);
  assert.equal(correlationLimitBreach([{ id: 'A', units: 4 }, { id: 'B', units: 2 }], 'B', '2020-01-01', of), 'LIMIT6');
  assert.equal(correlationLimitBreach([{ id: 'A', units: 4 }, { id: 'B', units: 2 }, { id: 'C', units: 4 }], 'C', '2020-01-01', of), 'LIMIT10');
  assert.equal(correlationLimitBreach([{ id: 'A', units: 4 }], 'Z', '2020-01-01', of), null);
});

test('GC-TUR-ENTRY-BAR-CHANNEL-EXIT: a breakout bar whose low also trades through the exit channel exits there (pessimistic, sf-turtle-1.1.0)', () => {
  // F: prior 20 / 55-day high 105, prior 10 / 20-day low 95; entry 105.01, exit level 94.99, unit stop 85.01
  for (const system of ['S1', 'S2']) {
    const r = run([{ id: 'A', bars: bars([...flat(60), [100, 106, 94, 100]]) }], { system });
    assert.equal(r.counts.entries, 1);
    assert.equal(r.counts.sameBarEntryChannelExits, 1);
    const t = r.unitTrades[0];
    assert.equal(t.reason, `${system === 'S1' ? 'EXIT_10D' : 'EXIT_20D'}_SAME_BAR`);
    assert.ok(close(t.exitPrice, 94.99 * 0.999, 1e-6));
    assert.equal(r.openAtEnd.length, 0);
    assert.ok(r.reconciliation.pass);
  }
});

test('GC-TUR-ENTRY-BAR-STOP-BEFORE-CHANNEL: on the entry bar the higher of unit stop and channel level is reached first', () => {
  const rows = flat(60, 100, 0.5); rows[56] = [100, 100.5, 80, 100]; // deep low inside the 10-day exit window
  const b = bars([...rows, [100, 101, 81, 98]]);
  const N = turtleN(b)[59], stop = 100.51 - 2 * N;
  assert.ok(stop > 79.99 && stop > 81);
  const r = run([{ id: 'A', bars: b }], { system: 'S1' });
  assert.equal(r.counts.sameBarEntryStops, 1);
  assert.equal(r.counts.sameBarEntryChannelExits, 0);
  assert.equal(r.unitTrades[0].reason, 'STOP_2N_SAME_BAR');
  assert.ok(close(r.unitTrades[0].exitPrice, stop * 0.999, 1e-6));
});

test('GC-TUR-ENTRY-BAR-NO-EXIT: an ordinary breakout bar keeps the position (regression of the 1.0.0 behaviour)', () => {
  const r = run([{ id: 'A', bars: bars([...flat(60), [100, 108, 96, 107]]) }], { system: 'S1' });
  assert.equal(r.counts.sameBarEntryChannelExits, 0);
  assert.equal(r.openAtEnd.length, 1);
});

test('SF2-TUR-LIQUIDITY: each fill reports its share of bar volume and of the 20-session mean volume; no gate', () => {
  const r = run([{ id: 'A', bars: bars([...flat(60), [100, 108, 104, 107]]) }]);
  assert.equal(r.liquidity.fills, 1);
  assert.ok(close(r.liquidity.participationOfBarVolume.max, 100 / 1e6));
  assert.ok(close(r.liquidity.participationOfAdv20.p50, 100 / 1e6));
  const thin = run([{ id: 'A', bars: bars([...flat(60), [100, 108, 104, 107]], { volume: 2e4 }) }], { universe: { ...PARAMS, id: 'TEST', priceFloorRaw: 0, dollarVolumeFloor: 0, dollarVolumeSessions: 20 } });
  assert.equal(buys(thin).length, 1); // liquidity is reported, never used to reject
  assert.ok(close(thin.liquidity.participationOfBarVolume.max, 100 / 2e4));
  assert.deepEqual(liquiditySummary([]).participationOfBarVolume, { n: 0, p50: null, p95: null, p99: null, max: null });
});

test('SF2-TUR-SYNTHETIC-BAR-GUARD: a synthetic or open-less bar is never filled; a held position is not traded on it (research-v1)', () => {
  const brk = bars([...flat(60), [100, 108, 104, 107]]);
  brk[60] = { ...brk[60], synthetic: true };
  const r = run([{ id: 'A', bars: brk }]);
  assert.equal(buys(r).length, 0);
  assert.ok(r.rejections.some((x) => x.reason === 'ORDER_WITHOUT_SOURCE_BAR'));
  const held = bars([...flat(60), [100, 108, 104, 107], [100, 101, 80, 85], [85, 86, 84, 85]]);
  held[61] = { ...held[61], synthetic: true };
  const h = run([{ id: 'A', bars: held }]);
  assert.equal(h.unitTrades[0].exitDate, day(62)); // the stop is not filled on the synthetic bar, but on the next real one
});

test('SF2-TUR-ENTRY-BAR-ORDER: on the entry bar adds come before the low; a unit stop above the channel closes the adds too (review R2-01)', () => {
  const rows = flat(60, 100, 1); rows[56] = [100, 101, 80, 100]; // N rises, 10-day low 80 far below
  const b = bars([...rows, [100.5, 110, 95, 100]]);
  const r = run([{ id: 'A', bars: b }], { system: 'S1' });
  assert.ok(r.counts.adds >= 1, JSON.stringify(r.counts));
  assert.equal(buys(r).length, r.counts.entries + r.counts.adds);
  assert.ok(r.unitTrades.every((t) => t.reason === 'STOP_2N_SAME_BAR'));
  assert.equal(r.openAtEnd.length, 0);
  assert.ok(r.reconciliation.pass);
});

test('SF2-TUR-FILTER-ENTRY-BAR: the S1 filter resolves its hypothetical breakout on the breakout bar with the engine convention (review R2-02)', async () => {
  const { createBreakoutTracker } = await import('../source-faithful/methods/turtle.mjs');
  const rows = [...flat(50, 100, 3), ...Array.from({ length: 10 }, () => [100, 101, 99, 100]), [100, 104, 97, 101]];
  const b = bars(rows), N = turtleN(b), tr = createBreakoutTracker(b, N);
  for (let i = 1; i < b.length - 1; i++) { tr.resolve(i); tr.start(i); }
  tr.resolve(b.length - 1); assert.equal(tr.start(b.length - 1), 1);
  assert.equal(tr.outcome(), 'NON_LOSER'); // through the 10-day exit (98.99) before the 2N stop: no loser, not profitable
  assert.equal(tr.counts.ENTRY_BAR_RESOLVED_PESSIMISTIC, 1);
  const r = run([{ id: 'A', bars: bars([...rows, [101, 106, 100.5, 105]]) }], { system: 'S1' });
  assert.equal(r.counts.skippedByFilter, 0); // the next breakout is taken, as the real same-bar exit implies
});

test('SF2-TUR-CHANNEL-MISSING-LOW: one bar without a low does not switch the channel exit off (review R2-04)', () => {
  const b = bars([...flat(60), [100, 108, 104, 107], [107, 108, 106, 107], [100, 101, 94, 95]]);
  b[55] = { ...b[55], low: NaN };
  const r = run([{ id: 'A', bars: b }], { system: 'S2' });
  assert.equal(r.counts.channelExits, 1);
  assert.equal(r.openAtEnd.length, 0);
});

test('SF2-TUR-CORR-COUNT-ONCE: a blocked add of a held position is counted once per unit level, groups are read at the prior session (review R2-05 / R2-06)', () => {
  const seen = [];
  const groupsOf = (id, date) => { seen.push(date); return { closely: 0, loosely: null }; }; // group id 0 is a group
  const up = []; for (let k = 0; k < 8; k++) up.push([107 + k, 108.5 + k, 106.5 + k, 108 + k]);
  const secs = Array.from({ length: 2 }, (_, s) => ({ id: `G${s}`, bars: bars([...flat(60), [100, 200, 104, 190], ...up.map(([o, h, l, c]) => [o + 90, h + 90, l + 90, c + 90])]) }));
  const r = run(secs, { groupsOf });
  assert.equal(buys(r).length, 6);
  assert.ok(r.counts.rejectCorrelationLimit6 <= 2, JSON.stringify(r.counts));
  assert.ok(!seen.includes(day(60)) || seen.every((d) => d <= day(68)));
  assert.ok(seen.every((d) => d < day(69)));
});

test('SF2-TUR-FAILSAFE-EXIT-READINGS: the ambiguous failsafe exit runs in both readings, 10-day (default) and 20-day (review R1-03)', () => {
  // the GC-TUR-FAILSAFE path: a winning first breakout, then a 55-day failsafe entry, then a slow decline
  const rows = Array.from({ length: 25 }, () => [100, 100.5, 99.5, 100]);
  for (let k = 0; k < 15; k++) rows.push([100 + k, 101.5 + k, 99.8 + k, 101 + k]);
  rows.push([113, 113.2, 104, 104.5]);
  for (let k = 0; k < 25; k++) rows.push([104.5, 104.9, 104.1, 104.5]);
  rows.push([114, 116, 113.5, 115.8]);
  for (let k = 0; k < 10; k++) rows.push([115.8, 116.5, 115, 116]);
  for (let k = 0; k < 25; k++) rows.push([116 - k * 0.5, 116.2 - k * 0.5, 115.4 - k * 0.5, 115.6 - k * 0.5]);
  const secs = () => [{ id: 'A', bars: bars(rows) }];
  const a = run(secs(), { system: 'S1' }), b = run(secs(), { system: 'S1', failsafeExit: '20D' });
  const fa = a.positionTrades.find((t) => t.path === 'FAILSAFE_55'), fb = b.positionTrades.find((t) => t.path === 'FAILSAFE_55');
  assert.ok(fa && fb, JSON.stringify(a.counts));
  assert.equal(fa.reason, 'EXIT_10D');
  assert.notEqual(fb.reason, 'EXIT_10D'); // with the 20-day reading the position runs on (here until a unit stop)
  assert.ok(fa.exitDate < fb.exitDate);
  assert.equal(a.failsafeExit, '10D');
  assert.equal(b.failsafeExit, '20D');
  // the reading touches only failsafe positions
  assert.deepEqual(a.positionTrades.filter((t) => t.path !== 'FAILSAFE_55'), b.positionTrades.filter((t) => t.path !== 'FAILSAFE_55'));
  assert.throws(() => run(secs(), { system: 'S1', failsafeExit: '55D' }), /UNKNOWN_FAILSAFE_EXIT/);
});

test('SF2-TUR-CORR-COVERAGE: securities without a group are counted and the run is labelled partial, never ENFORCED (review R1-05)', () => {
  const secs = Array.from({ length: 2 }, (_, s) => ({ id: `C${s}`, bars: bars([...flat(60), [100, 108, 104, 107]]) }));
  const r = run(secs, { groupsOf: (id) => (id === 'C0' ? { closely: 'G', loosely: 'L' } : null) });
  assert.ok(r.counts.correlationGroupMissing >= 1);
  assert.equal(r.correlationLimits, 'ENFORCED_PARTIAL_GROUP_COVERAGE');
});
