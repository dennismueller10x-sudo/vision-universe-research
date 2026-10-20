// Source-faithful Darvas box (C03): every state transition of the box machine has a golden case (#709 DAR-Q1..Q9,
// DAR-B6). Bars are [open, high, low, close]; a mid open/close is used where the case does not need them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDarvasBoxMachine, darvasEvents, darvasPosition, darvasScreen, darvasComponentTrades, fractionFor, BOTTOM_SEARCH_START } from '../source-faithful/methods/darvas.mjs';

const day = (k) => new Date(Date.UTC(2021, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const hl = (h, l, o = (h + l) / 2, c = (h + l) / 2) => [o, h, l, c];
const bars = (rows, splitAdj = 1) => rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: 1000 + k, splitAdj }));
const types = (rows, opts) => darvasEvents(bars(rows), opts).events.map((e) => `${e.i}:${e.type}`);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// top 12 on bar 2, three lower highs (3, 4, 5) -> top confirmed on bar 5
const TOP = [hl(10, 9), hl(11, 10), hl(12, 11), hl(11.5, 10.8), hl(11.8, 10.9), hl(11.9, 11)];
// bottom: bar 6 low 10.5, three higher lows (7, 8, 9) -> box complete on bar 9
const BOX = [...TOP, hl(11.2, 10.5), hl(11.4, 10.7), hl(11.3, 10.6), hl(11.6, 10.8)];

test('GC-DAR-TOP-CONFIRM: a new high not touched or exceeded on the three following sessions is the box top (DAR-Q1)', () => {
  const t = types(TOP);
  assert.ok(t.includes('2:TOP_CANDIDATE'));
  assert.ok(t.includes('5:TOP_CONFIRMED'));
  assert.ok(!t.some((x) => /^[34]:TOP_CONFIRMED/.test(x)));
});

test('GC-DAR-TOP-TOUCH-RESET: a session touching the candidate top restarts the three-day count (DAR-Q1)', () => {
  const rows = [hl(10, 9), hl(11, 10), hl(12, 11), hl(11.5, 10.8), hl(12, 10.9), hl(11.9, 11), hl(11.7, 11), hl(11.6, 11)];
  const t = types(rows);
  assert.ok(t.includes('4:TOP_TOUCH_RESET'));
  assert.ok(!t.includes('5:TOP_CONFIRMED'));
  assert.ok(t.includes('7:TOP_CONFIRMED'));
});

test('GC-DAR-TOP-HIGHER-RESET: a higher high makes a new candidate top (DAR-Q1)', () => {
  const rows = [hl(10, 9), hl(11, 10), hl(12, 11), hl(11.5, 10.8), hl(12.5, 11), hl(12.2, 11.5), hl(12.1, 11.5), hl(12, 11.4)];
  const t = types(rows);
  assert.ok(t.includes('4:TOP_CANDIDATE'));
  assert.ok(t.includes('7:TOP_CONFIRMED'));
  assert.equal(darvasEvents(bars(rows)).events.find((e) => e.type === 'TOP_CONFIRMED').top, 12.5);
});

test('GC-DAR-BOTTOM-CONFIRM: the bottom is established only after the top, by the reverse three-day procedure (DAR-Q2)', () => {
  const { events, boxes } = darvasEvents(bars(BOX));
  const done = events.find((e) => e.type === 'BOTTOM_CONFIRMED');
  assert.equal(done.i, 9);
  assert.deepEqual([boxes[0].top, boxes[0].bottom], [12, 10.5]);
  // no bottom event before the top is confirmed (bar 5); the default looks back to the lows after the top day
  assert.ok(events.filter((e) => e.type.startsWith('BOTTOM')).every((e) => e.i >= 5));
  assert.equal(boxes[0].bottomSearchStart, 'AFTER_TOP_DAY');
});

test('GC-DAR-BOTTOM-TOUCH-RESET: a re-touch of the candidate bottom restarts the count (DAR-Q2; #709 VU-DAR missing rule)', () => {
  const rows = [...TOP, hl(11.2, 10.5), hl(11.4, 10.7), hl(11.3, 10.5), hl(11.6, 10.8), hl(11.5, 10.9), hl(11.5, 10.9)];
  const t = types(rows);
  assert.ok(t.includes('8:BOTTOM_TOUCH_RESET'));
  assert.ok(!t.includes('9:BOTTOM_CONFIRMED'));
  assert.ok(t.includes('11:BOTTOM_CONFIRMED'));
});

test('GC-DAR-BOTTOM-START-VARIANTS: both readings of the unresolved bottom-search start are supported and can differ (#709 VU-DAR UNRESOLVED)', () => {
  // the lowest low after the top day (bar 4, 10.0) falls inside the top-confirmation days
  const rows = [hl(10, 9), hl(11, 10), hl(12, 11), hl(11.5, 10.8), hl(11.8, 10), hl(11.9, 10.6), hl(11.2, 10.5), hl(11.4, 10.7), hl(11.3, 10.6), hl(11.6, 10.8)];
  const a = darvasEvents(bars(rows), { bottomSearchStart: BOTTOM_SEARCH_START.AFTER_TOP_CONFIRMED }).boxes[0];
  const b = darvasEvents(bars(rows), { bottomSearchStart: BOTTOM_SEARCH_START.AFTER_TOP_DAY }).boxes[0];
  assert.equal(a.bottom, 10.5);
  assert.equal(b.bottom, 10);
  assert.equal(a.bottomSearchStart, 'AFTER_TOP_CONFIRMED');
  assert.equal(b.bottomSearchStart, 'AFTER_TOP_DAY');
  assert.throws(() => createDarvasBoxMachine(bars(rows), { bottomSearchStart: 'X' }), /UNKNOWN_BOTTOM_SEARCH_START/);
});

test('GC-DAR-TOP-EXCEEDED-BEFORE-BOTTOM: a higher high before the bottom is confirmed restarts the top search (DAR-Q1 / DAR-Q2)', () => {
  const rows = [...TOP, hl(11.2, 10.5), hl(12.3, 11)];
  const t = types(rows);
  assert.ok(t.includes('7:TOP_RESTARTED'));
  assert.ok(t.includes('7:TOP_CANDIDATE'));
});

test('GC-DAR-BOX-FAIL: a low below the completed bottom before a breakout dissolves the box (DAR-Q11 derivation)', () => {
  const t = types([...BOX, hl(11, 10.4)]);
  assert.ok(t.includes('10:BOX_FAILED'));
  assert.ok(!t.some((x) => x.endsWith('BREAKOUT')));
});

test('GC-DAR-BREAKOUT-NO-WAIT: the breakout fires on the first session through top + fraction; no waiting period (DAR-Q3, DAR-Q4)', () => {
  const ev = darvasEvents(bars([...BOX, hl(11.9, 11.2), [11.9, 12.2, 11.8, 12.1]])).events.filter((e) => e.type === 'BREAKOUT');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].i, 11);
  assert.ok(close(ev[0].trigger, 12.01));
  assert.ok(close(ev[0].fill, 12.01));
  // a touch of the top + fraction minus a cent is not a breakout
  assert.equal(darvasEvents(bars([...BOX, [11.9, 12.009, 11.8, 12]])).events.filter((e) => e.type === 'BREAKOUT').length, 0);
});

test('GC-DAR-GAP-OPEN-FILL: an open above the trigger fills at the open (DAR-Q4)', () => {
  const e = darvasEvents(bars([...BOX, [12.4, 12.6, 12.3, 12.5]])).events.find((x) => x.type === 'BREAKOUT');
  assert.equal(e.fill, 12.4);
  assert.equal(e.gapOpen, true);
});

test('GC-DAR-STOP-PATH: stop placed with the buy a fraction below the broken top, raised below each higher box bottom, exit on the stop (DAR-B6, DAR-Q5..Q8)', () => {
  // breakout bar 10; new box: top 13.5 (bar 12) confirmed on 15, bottom 12.6 (bar 16) confirmed on 19; then a fall
  const rows = [...BOX, [12, 12.5, 12.05, 12.4], hl(13, 12.3), hl(13.5, 12.8), hl(13.2, 12.9), hl(13.3, 12.9), hl(13.1, 12.8),
    hl(13, 12.6), hl(13.2, 12.7), hl(13.3, 12.8), hl(13.1, 12.7), hl(12.9, 12.55)];
  const b = bars(rows);
  const entry = darvasEvents(b).events.find((e) => e.type === 'BREAKOUT');
  const p = darvasPosition(b, entry);
  assert.ok(close(p.path[0].stop, 11.99));
  const raise = p.path.find((x) => x.ruleId === 'DAR-SF-STOP-RAISE');
  assert.ok(raise && close(raise.stop, 12.59), JSON.stringify(p.path));
  assert.equal(raise.i, 19);
  assert.equal(p.exit.i, 20);
  assert.ok(close(p.exit.fill, 12.59));
});

test('GC-DAR-ENTRY-BAR-STOP: a breakout bar that also trades at the initial stop exits the same bar (pessimistic daily-bar convention)', () => {
  const b = bars([...BOX, [12, 12.3, 11.9, 12]]);
  const p = darvasPosition(b, darvasEvents(b).events.find((e) => e.type === 'BREAKOUT'));
  assert.equal(p.entryBarStop, true);
  assert.equal(p.exit.reason, 'STOP_ENTRY_BAR_PESSIMISTIC');
});

test('GC-DAR-STOP-NEVER-LOWER: a later box whose bottom is below the current stop does not lower it (DAR-Q6)', () => {
  // after the raise to 12.59, a further box with bottom 12.4 would give 12.39 < 12.59
  const rows = [...BOX, [12, 12.5, 12.05, 12.4], hl(13, 12.3), hl(13.5, 12.8), hl(13.2, 12.9), hl(13.3, 12.9), hl(13.1, 12.8),
    hl(13, 12.6), hl(13.2, 12.7), hl(13.3, 12.8), hl(13.1, 12.7), hl(13.6, 13), hl(13.4, 12.9), hl(13.5, 12.95), hl(13.3, 12.9), hl(13.2, 12.6), hl(13.3, 12.7), hl(13.2, 12.65), hl(13.4, 12.8)];
  const b = bars(rows), p = darvasPosition(b, darvasEvents(b).events.find((e) => e.type === 'BREAKOUT'));
  for (let k = 1; k < p.path.length; k++) assert.ok(p.path[k].stop > p.path[k - 1].stop);
});

test('GC-DAR-ATH-GATE: a breakout below an earlier high of the available history is not a candidate (DAR-Q9)', () => {
  const older = [hl(20, 18), hl(19, 17), hl(15, 10)]; // earlier high 20 above the later box top 12
  const sec = (rows) => ({ id: 'X', bars: bars(rows) });
  assert.equal(darvasScreen(sec([...older, ...BOX, hl(12.4, 12)])).length, 0);
  const r = darvasScreen(sec([...BOX, hl(12.4, 12)]));
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(r[0].buyDeclarationAllowed, false);
});

test('GC-DAR-ATH-UNVERIFIED: without listing-to-date history the all-time high is flagged for review (DAR-Q9)', () => {
  const r = darvasScreen({ id: 'X', bars: bars([...BOX, hl(12.4, 12)]) });
  assert.equal(r[0].machineScreenEvidence.find((x) => x.ruleId === 'DAR-SF-ATH').value, 'ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED');
  const v = darvasScreen({ id: 'X', bars: bars([...BOX, hl(12.4, 12)]) }, { historyFromListing: true });
  assert.equal(v[0].machineScreenEvidence.find((x) => x.ruleId === 'DAR-SF-ATH').value, 'ALL_TIME_HIGH');
  assert.ok(r[0].openQuestions.some((q) => q.flag === 'DAR-MR-SELECTION'));
});

test('GC-DAR-FRACTION: "a fraction" is one raw cent in the split-adjusted basis (DAR-Q15 derivation)', () => {
  assert.ok(close(fractionFor({ splitAdj: 2 }), 0.005));
  assert.ok(close(fractionFor({ splitAdj: 1 }), 0.01));
  const e = darvasEvents(bars([...BOX, hl(12.4, 12)], 2)).events.find((x) => x.type === 'BREAKOUT');
  assert.ok(close(e.trigger, 12.005));
});

test('SF-DAR-NOT-ROLLING-HIGH: a rolling new high without a confirmed box is no signal', () => {
  const rising = Array.from({ length: 30 }, (_, k) => hl(10 + k, 9 + k));
  assert.equal(darvasEvents(bars(rising)).events.filter((e) => e.type === 'BREAKOUT').length, 0);
});

test('SF-DAR-TEMPORAL: events up to bar t do not depend on later bars', () => {
  const a = darvasEvents(bars([...BOX, hl(12.4, 12), hl(13, 12.5)])).events.filter((e) => e.i <= 10);
  const b = darvasEvents(bars([...BOX, hl(12.4, 12), hl(5, 4)])).events.filter((e) => e.i <= 10);
  assert.deepEqual(a, b);
});

test('SF-DAR-COMPONENT: the component study lists ATH-gated breakouts with their mechanical exits, one position at a time', () => {
  const rows = [...BOX, [12, 12.5, 12.05, 12.4], hl(13, 12.3), hl(13.5, 12.8), hl(13.2, 12.9), hl(13.3, 12.9), hl(13.1, 12.8),
    hl(13, 12.6), hl(13.2, 12.7), hl(13.3, 12.8), hl(13.1, 12.7), hl(12.9, 12.55)];
  const t = darvasComponentTrades({ id: 'X', bars: bars(rows) });
  assert.equal(t.length, 1);
  assert.equal(t[0].stopRaises, 1);
  assert.equal(t[0].reason, 'STOP');
});
