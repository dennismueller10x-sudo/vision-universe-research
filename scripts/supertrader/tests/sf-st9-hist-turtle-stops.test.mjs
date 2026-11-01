// Supertrader 9 – independent Turtle unit-stop check (st9-hist-execution.mjs#checkTurtleStops): own Wilder N, units
// rebuilt from the ledger, no engine function inside the check. Real runTurtle runs on synthetic bars (base series as
// sf-turtle.test.mjs: flat 100 +/- 5, N = 10, one unit = 100 shares); nothing is written to the repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../source-faithful/research/st9-hist-execution.mjs';
import { runTurtle, turtleN, PARAMS } from '../source-faithful/methods/turtle.mjs';

const SLIP_BPS = 10, SLIP = SLIP_BPS / 1e4, COSTS = Object.freeze({ slippageBps: SLIP_BPS, commissionBps: 1 });
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const day = (k) => new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bars = (rows) => rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: 1e6, rawClose: c, rawVolume: 1e6, splitAdj: 1, dividend: 0 }));
const flat = (n, p = 100, r = 5) => Array.from({ length: n }, () => [p, p + r, p - r, p]);
const dataOf = (secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs.map((s) => ({ terminal: null, ...s })) });

/**
 * A: entry 105.01, adds at 111 and 116 (one bar) and 121: stops 100.01 / 101 / 101 / 101; three units stopped at 101
 *    intraday, the first unit gapped through 100.01 at the open 99 (STOP_2N_UNIT at 99);
 * B: entry 105.01 (stop 85.01), next bar through the stop AND the 20-day channel 94.99: the channel exit supersedes;
 * C: entry and three adds on one bar whose low 99 is under the raised stops 100.01 (STOP_2N_SAME_BAR, convention).
 */
function fixture() {
  const A = bars([...flat(60), [100, 108, 104, 107], [111, 116, 110.5, 115], [117, 122, 116.5, 121], [115, 116, 100.5, 101], [99, 100, 98, 99], ...flat(5)]);
  const B = bars([...flat(60), [100, 108, 104, 107], [96, 97, 80, 82], ...flat(8)]);
  const C = bars([...flat(60), [100, 121, 99, 100], ...flat(9)]);
  const d = dataOf([{ id: 'A', bars: A }, { id: 'B', bars: B }, { id: 'C', bars: C }]);
  return { d, run: runTurtle(d, { system: 'S2', from: d.calendar[0], slippageBps: SLIP_BPS, commissionBps: 1 }) };
}
const check = (d, run) => X.checkTurtleStops(d, run, { slippageBps: SLIP_BPS });
const sells = (run, id) => run.ledger.filter((r) => r.side === 'SELL' && r.id === id);
const withBars = (d, id, f) => ({ ...d, securities: d.securities.map((s) => (s.id !== id ? s : { ...s, bars: f(s.bars) })) });

test('rule constants come from the contract, not from an engine import, and agree with PARAMS', () => {
  assert.deepEqual([X.TURTLE_STOP_RULE.nPeriod, X.TURTLE_STOP_RULE.stopN, X.TURTLE_STOP_RULE.addStepN], [20, 2, 0.5]);
  assert.deepEqual([X.TURTLE_STOP_RULE.nPeriod, X.TURTLE_STOP_RULE.stopN, X.TURTLE_STOP_RULE.addStepN], [PARAMS.nPeriod, PARAMS.stopN, PARAMS.addStepN]);
});

test('own Wilder N: GC-TUR-N golden values and identical to turtleN (GC-TUR-N-WILDER), also with a bar without H', () => {
  const n = X.wilderN(bars([...flat(20), [100, 110, 96, 108]]));
  assert.equal(n[18], null);
  assert.ok(close(n[19], 10));
  assert.ok(close(n[20], (19 * 10 + 14) / 20), 'TR = max(110 - 96, 110 - 100, 100 - 96) = 14');
  for (const seed of [11, 12]) {
    let s = seed >>> 0;
    const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const b = []; let c = 100;
    for (let i = 0; i < 300; i++) { const o = c * (1 + (r() - 0.5) * 0.04), nc = o * (1 + (r() - 0.5) * 0.05); b.push({ date: day(i), open: o, high: Math.max(o, nc) * (1 + r() * 0.02), low: Math.min(o, nc) * (1 - r() * 0.02), close: nc }); c = nc; }
    b[150] = { ...b[150], high: null }; // no TR: N keeps its value
    b[10] = { ...b[10], high: null };   // no TR during the seed window
    const own = X.wilderN(b), eng = turtleN(b);
    for (let i = 0; i < 300; i++) assert.ok(own[i] === eng[i] || Math.abs(own[i] - eng[i]) <= 1e-12 * eng[i], `seed ${seed} i ${i}: ${own[i]} != ${eng[i]}`);
    assert.equal(own[150], own[149]);
    assert.equal(own[19], null, 'the seed needs 20 TR, the bar without H gives none');
  }
});

test('real runTurtle run with adds and unit stops: no violation; every stop sale checked at its level', () => {
  const { d, run } = fixture();
  const a = sells(run, 'A');
  assert.ok(a.every((r) => r.reason === 'STOP_2N_UNIT') && a.length === 4);
  assert.deepEqual(a.slice(0, 3).map((r) => r.unit).sort(), [2, 3, 4], 'the three units at 101 first (equal stops)');
  assert.equal(a[3].unit, 1);
  assert.ok(close(a[0].price, 101 * (1 - SLIP), 1e-6) && close(a[3].price, 99 * (1 - SLIP), 1e-6), 'intraday at 101, gap through 100.01 at the open 99');
  assert.deepEqual(sells(run, 'B').map((r) => r.reason), ['EXIT_20D']);
  assert.equal(sells(run, 'C').length, 4);
  assert.ok(sells(run, 'C').every((r) => r.reason === 'STOP_2N_SAME_BAR'));
  const c = check(d, run);
  assert.equal(c.violationCount, 0, JSON.stringify(c.violations));
  assert.equal(c.checks.positions, 3);
  assert.equal(c.checks.units, 9);
  assert.equal(c.checks.stopSalesChecked, 8);
  assert.equal(c.checks.stopReachedUnitBars, 5, 'A: 3 + 1 units, B: 1 superseded by the channel');
  assert.equal(c.checks.exitSupersededStops, 1);
  assert.equal(c.checks.conventionBars, 5, 'entry / add bars of A (3), B (1), C (1)');
  const audit = X.auditRun(d, { run }, { key: 'TURTLE_S2', costs: COSTS, from: d.calendar[0] });
  assert.equal(audit.pass, true, JSON.stringify(audit.violations));
  assert.equal(audit.missedStopCheck, 'TURTLE_INDEPENDENT_N_UNIT_STOPS');
  assert.equal(audit.version, 'st9-hist-execution-1.1.0');
  assert.equal(audit.stopChecks.units, 9);
  // before: classifyExits read STOP_2N_SAME_BAR as a held-bar stop and flagged its fill (100.01 > open 100) as
  // STOP_FILL_ABOVE_OPEN; now it is the declared intrabar convention, its level checked by checkTurtleStops
  assert.equal(audit.exitClasses.INTRADAY_ORDER_ASSUMED, 4);
  assert.equal(audit.exitClasses.GAP_AT_OPEN_LEVEL_UNKNOWN, 1, 'A unit 1 at the gap open 99');
});

test('counter-check: a removed stop sale is a missed stop (once per unit); a low at the stop is a boundary', () => {
  const { d, run } = fixture();
  const gap = sells(run, 'A').find((r) => r.unit === 1);
  const missed = { ...run, ledger: run.ledger.filter((r) => r !== gap) };
  const m = check(d, missed);
  assert.deepEqual(m.violations, { STOP_REACHED_NOT_EXECUTED: 1 }, 'the flat bars after it are not counted again');
  assert.deepEqual(m.examples[0], { code: 'STOP_REACHED_NOT_EXECUTED', id: 'A', date: gap.date });
  assert.equal(X.auditRun(d, { run: missed }, { key: 'TURTLE_S2', costs: COSTS }).violations['STOPS:STOP_REACHED_NOT_EXECUTED'], 1);
  const top = sells(run, 'A').find((r) => r.unit === 4);
  assert.deepEqual(check(d, { ...run, ledger: run.ledger.filter((r) => r !== top) }).violations, { STOP_REACHED_NOT_EXECUTED: 1 });
  // the same removal on a bar whose low only touches the stop (within 1e-9), later bars above it: boundary, not judged
  const k = d.securities[0].bars.findIndex((b) => b.date === gap.date);
  const touch = withBars(d, 'A', (bs) => bs.map((b, i) => (i === k ? { ...b, open: 101, low: 100.01 + 1e-12 } : i > k ? { ...b, low: 100.5 } : b)));
  const t = check(touch, missed);
  assert.deepEqual(t.violations, {});
  assert.ok(t.checks.boundaryUnitBars >= 1);
});

test('counter-check: a shifted stop price, a stop at the level instead of the gap open, an unreached stop, an exit below the stop', () => {
  const { d, run } = fixture();
  const edit = (row, f) => ({ ...run, ledger: run.ledger.map((r) => (r === row ? f(r) : r)) });
  const top = sells(run, 'A').find((r) => r.unit === 4);
  assert.deepEqual(check(d, edit(top, (r) => ({ ...r, price: 101.5 * (1 - SLIP) }))).violations, { STOP_LEVEL_MISMATCH: 1 });
  const gap = sells(run, 'A').find((r) => r.unit === 1);
  assert.deepEqual(check(d, edit(gap, (r) => ({ ...r, price: 100.01 * (1 - SLIP) }))).violations, { STOP_LEVEL_MISMATCH: 1 }, 'the optimistic gap error');
  const k = d.securities[0].bars.findIndex((b) => b.date === top.date);
  assert.deepEqual(check(withBars(d, 'A', (bs) => bs.map((b, i) => (i === k ? { ...b, low: 101.5 } : b))), run).violations, { STOP_LEVEL_MISMATCH: 3 }, 'three sales at an unreached level');
  const ex = sells(run, 'B')[0];
  assert.deepEqual(check(d, edit(ex, (r) => ({ ...r, price: 81 * (1 - SLIP) }))).violations, { STOP_REACHED_NOT_EXECUTED: 1 }, 'a channel sale below min(open, stop) is no executed stop');
  const sb = sells(run, 'C')[0];
  assert.deepEqual(check(d, edit(sb, (r) => ({ ...r, price: 99 * (1 - SLIP) }))).violations, { STOP_LEVEL_MISMATCH: 1 }, 'a same-bar stop fills at the raised stop itself');
});

test('fail closed on the ledger shape: missing unit field, unknown unit, row without bar, no N before the first fill', () => {
  const { d, run } = fixture();
  const top = sells(run, 'A').find((r) => r.unit === 4);
  const { unit, ...noUnit } = top; // eslint-disable-line no-unused-vars
  assert.equal(check(d, { ...run, ledger: run.ledger.map((r) => (r === top ? noUnit : r)) }).violations.TURTLE_UNIT_FIELD_MISSING, 1);
  assert.equal(check(d, { ...run, ledger: run.ledger.map((r) => (r === top ? { ...r, unit: 9 } : r)) }).violations.TURTLE_UNIT_UNKNOWN, 1);
  assert.ok(check(withBars(d, 'A', (bs) => bs.filter((b) => b.date !== top.date)), run).violations.TURTLE_UNIT_WITHOUT_BAR >= 1);
  const early = { curve: [{ date: day(5) }, { date: day(6) }], ledger: [{ date: day(5), id: 'A', side: 'BUY', unit: 1, shares: 1, price: 100, gross: 100, fee: 0, reason: 'S2' }] };
  const e = check(d, early);
  assert.deepEqual(e.violations, { TURTLE_N_UNAVAILABLE: 1 });
  assert.equal(e.checks.positionsNotJudged, 1);
});
