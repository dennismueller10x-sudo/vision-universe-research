// V4.1 golden cases for the #709-sourced machine-screen components (Darvas box, Pocket Pivot, Buyable Gap-Up).
// Synthetic daily bars; every screen record must be MANUAL_REVIEW_REQUIRED and never a BUY.
import test from 'node:test';
import assert from 'node:assert/strict';
import { darvasEvents, darvasStopPath, darvasScreen } from '../research/v4/methods/darvas-box-v4-1.mjs';
import { pocketPivotAt, pocketPivotScreen } from '../research/v4/methods/pocket-pivot-v4-1.mjs';
import { gapUpAt, buyableGapUpScreen } from '../research/v4/methods/buyable-gap-up-v4-1.mjs';
import { weekdays } from './v4-fixtures.mjs';

const DATES = weekdays('2020-01-01', '2021-12-31');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
/** [high, low, open?] -> bars; open defaults to the midpoint, close = midpoint. */
const hl = (rows) => rows.map(([h, l, o], i) => ({ date: DATES[i], open: o ?? (h + l) / 2, high: h, low: l, close: (h + l) / 2, volume: 1e6, splitAdjustmentFactor: 1 }));
const evs = (bars, type, opts) => darvasEvents(bars, opts).events.filter((e) => type === undefined || e.type === type);
const noBuy = (records) => { for (const r of records) { assert.equal(r.status, 'MANUAL_REVIEW_REQUIRED'); assert.equal(r.buyDeclarationAllowed, false); assert.ok(!JSON.stringify(r).includes('"BUY"')); } };

// top 12 set on bar 1 and confirmed on bar 4; bottom 10.0 found on bar 5 and confirmed on bar 8
const BOX = [[10, 9], [12, 10], [11.5, 10.5], [11.8, 10.8], [11, 10.2], [11, 10.0], [11.2, 10.3], [11.4, 10.5], [11.3, 10.4]];

test('DG-01 (DAR-Q1): top confirmed on the third session that neither touches nor exceeds the new high', () => {
  const t = evs(hl(BOX), 'TOP_CONFIRMED');
  assert.equal(t.length, 1);
  assert.equal(t[0].top, 12);
  assert.equal(t[0].i, 4);
});

test('DG-02 (DAR-Q1): a touch of the candidate top restarts the count', () => {
  const rows = [[10, 9], [12, 10], [11.5, 10.5], [12, 10.8], [11, 10.2], [11, 10.3], [11.1, 10.4]];
  const t = evs(hl(rows), 'TOP_CONFIRMED');
  assert.equal(t[0].i, 6, 'why: bar 3 touched 12, so bars 4-6 are the three confirming sessions');
});

test('DG-03 (DAR-Q2): bottom only after the top, reverse three-day confirmation', () => {
  const b = evs(hl(BOX), 'BOTTOM_CONFIRMED');
  assert.equal(b.length, 1);
  assert.equal(b[0].bottom, 10.0);
  assert.equal(b[0].top, 12);
  assert.equal(b[0].i, 8);
});

test('DG-04 (DAR-Q2, #709 VU-DAR missing rule): a re-touch of the bottom restarts the count', () => {
  const rows = [...BOX.slice(0, 7), [11.4, 10.0], [11.3, 10.4], [11.2, 10.3], [11.1, 10.2]];
  const b = evs(hl(rows), 'BOTTOM_CONFIRMED');
  assert.equal(b[0].i, 10, 'why: bar 7 touched 10.0, so bars 8-10 confirm');
});

test('DG-05 (DAR-Q4, DAR-Q3, DAR-ARLAN): breakout the day the high crosses top + fraction; no wait; review record only', () => {
  const bars = hl([...BOX, [12.5, 11.8, 11.9]]);
  const br = evs(bars, 'BREAKOUT');
  assert.equal(br.length, 1);
  assert.equal(br[0].i, 9, 'why: the three days confirm the boundary, not a waiting period after the breakout');
  assert.ok(near(br[0].trigger, 12.01));
  assert.ok(near(br[0].fill, 12.01));
  const rec = darvasScreen({ id: 'X', bars });
  assert.equal(rec.length, 1);
  noBuy(rec);
  assert.deepEqual(rec[0].machineScreenEvidence.map((e) => e.psr709), ['DAR-Q1', 'DAR-Q2', 'DAR-Q4', 'DAR-Q5', 'DAR-Q9']);
});

test('DG-06 (DAR-Q4): a gap open above the trigger fills at the open', () => {
  const br = evs(hl([...BOX, [12.6, 12.2, 12.3]]), 'BREAKOUT');
  assert.equal(br[0].fill, 12.3);
});

test('DG-07 (DAR-Q11): a low below the completed bottom before a breakout dissolves the box', () => {
  const e = evs(hl([...BOX, [11.5, 9.9]]));
  assert.ok(e.some((x) => x.type === 'BOX_FAILED' && x.i === 9));
  assert.equal(e.filter((x) => x.type === 'BREAKOUT').length, 0);
});

test('DG-08 (DAR-Q5..Q8): initial stop below the broken top, raised below the next box bottom, never lowered', () => {
  const rows = [...BOX, [12.5, 11.8, 11.9], [12.4, 12.2], [12.3, 12.25], [12.35, 12.3], [12.4, 12.2], [12.38, 12.25], [12.36, 12.3], [12.34, 12.28], [12.3, 12.1, 12.25]];
  const bars = hl(rows);
  const entry = evs(bars, 'BREAKOUT')[0];
  const { path, exit } = darvasStopPath(bars, entry);
  assert.ok(near(path[0].stop, 11.99), 'a fraction below the broken top 12');
  const raised = path.find((p) => p.stop > 11.99 + 1e-12);
  assert.equal(raised.i, 16, 'new higher box: top 12.5 confirmed on bar 12, bottom 12.2 confirmed on bar 16');
  assert.ok(near(raised.stop, 12.19));
  for (let k = 1; k < path.length; k++) assert.ok(path[k].stop >= path[k - 1].stop, 'never lowered');
  assert.equal(exit.i, 17);
  assert.ok(near(exit.fill, 12.19));
});

test('DG-09 (DAR-Q9): all-time high only within the available history is flagged for review', () => {
  const bars = hl([...BOX, [12.5, 11.8, 11.9]]);
  const ath = (x) => x[0].machineScreenEvidence.find((e) => e.psr709 === 'DAR-Q9').value;
  assert.equal(ath(darvasScreen({ id: 'X', bars })), 'ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED');
  assert.equal(ath(darvasScreen({ id: 'X', bars }, { historyFromListing: true })), 'ALL_TIME_HIGH');
  assert.ok(darvasScreen({ id: 'X', bars }).every((r) => r.dataNotAvailableToMachine.includes('listing-to-date price history')));
});

test('DG-10 (DAR-Q2, #709 VU-DAR UNRESOLVED): both bottom-search starts are supported and can differ', () => {
  const rows = [[10, 9], [12, 10], [11.5, 10.5], [11.8, 9.5], [11, 10.2], [11, 10.0], [11.2, 10.3], [11.4, 10.5], [11.3, 10.4]];
  const a = evs(hl(rows), 'BOTTOM_CONFIRMED')[0];
  const b = evs(hl(rows), 'BOTTOM_CONFIRMED', { bottomSearchStart: 'AFTER_TOP_DAY' })[0];
  assert.equal(a.bottom, 10.0, 'default: search starts after the top is confirmed');
  assert.equal(b.bottom, 9.5, 'alternative: the low of a confirmation day counts');
  assert.equal(b.i, 6);
});

// Pocket Pivot: down days at 2 (500), 4 (800), 6 (600), 9 (700) inside the window of bar 11
const PP_CLOSES = [10, 10.1, 10.0, 10.2, 10.1, 10.3, 10.2, 10.4, 10.5, 10.4, 10.6];
const PP_VOL = [100, 100, 500, 100, 800, 100, 600, 100, 100, 700, 100];
const pp = (lastClose, lastVol, closes = PP_CLOSES, vols = PP_VOL) => [...closes, lastClose].map((c, i) => ({ date: DATES[i], close: c, volume: i < vols.length ? vols[i] : lastVol }));

test('PPG-01 (MOKAPP-003): up-day volume above the largest down-day volume of the prior ten sessions', () => {
  const bars = pp(10.8, 900);
  const r = pocketPivotAt(bars, 11);
  assert.equal(r.status, 'VOLUME_SIGNATURE');
  assert.equal(r.maxDownVolume, 800);
  assert.equal(r.downDays, 4);
  const rec = pocketPivotScreen({ id: 'X', bars });
  assert.equal(rec.length, 1);
  noBuy(rec);
});

test('PPG-02 (MOKAPP-003): equal volume is not greater', () => {
  assert.equal(pocketPivotAt(pp(10.8, 800), 11).status, 'VOLUME_NOT_ABOVE_DOWN_VOLUME');
  assert.equal(pocketPivotScreen({ id: 'X', bars: pp(10.8, 800) }).length, 0);
});

test('PPG-03 (MOKAPP-003): a down day with large volume is not a pocket pivot', () => {
  assert.equal(pocketPivotAt(pp(10.5, 5000), 11).status, 'NOT_UP_DAY');
});

test('PPG-04 (MOKAPP-003): no down day in the window -> NO_DOWN_DAY_IN_WINDOW, no candidate', () => {
  const closes = Array.from({ length: 11 }, (_, i) => 10 + 0.1 * i);
  assert.equal(pocketPivotAt(pp(11.2, 900, closes, Array(11).fill(100)), 11).status, 'NO_DOWN_DAY_IN_WINDOW');
});

test('PPG-05 (MOKAPP-003): a down day 11 sessions back does not count', () => {
  const closes = [10, 9.9, 10.0, 10.1, 10.2, 10.1, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8], vols = [100, 5000, 100, 100, 100, 300, 100, 100, 100, 100, 100, 100];
  const bars = [...closes, 10.9].map((c, i) => ({ date: DATES[i], close: c, volume: i < vols.length ? vols[i] : 1000 }));
  assert.equal(pocketPivotAt(bars, 11).status, 'VOLUME_NOT_ABOVE_DOWN_VOLUME', 'bar 11: the 5000 down day (bar 1) is inside the window');
  const r = pocketPivotAt(bars, 12);
  assert.equal(r.status, 'VOLUME_SIGNATURE', 'bar 12: bar 1 left the window; the largest down day is bar 5 (300)');
  assert.equal(r.maxDownVolume, 300);
});

test('PPG-06 (MOKAPP-004, MOKAPP-010): extension from the 10DMA is evidence and an open question, never a rejection', () => {
  const bars = pp(13, 900);
  const rec = pocketPivotScreen({ id: 'X', bars });
  assert.equal(rec.length, 1);
  const ctx = rec[0].machineScreenEvidence.find((e) => e.ruleId === 'PP41-CONTEXT').value;
  assert.ok(ctx.pctFrom10DMA > 0.15);
  assert.equal(ctx.pctFrom50DMA, null, 'not enough history for a 50-day average');
  assert.ok(rec[0].openQuestions.some((q) => q.psr709.includes('MOKAPP-010')));
});

// BGU: flat 100 with high 101 / low 99 -> TR 2 -> ATR40 2 -> threshold 1.5; average volume 1000
const bgu = (open, vol) => Array.from({ length: 61 }, (_, i) => (i < 60 ? { date: DATES[i], open: 100, high: 101, low: 99, close: 100, volume: 1000 } : { date: DATES[i], open, high: open + 2, low: open - 0.5, close: open + 1, volume: vol }));

test('BGG-01 (MOKA12-004, MOKA24-VOL): gap >= 0.75 x ATR40 and volume >= 1.5x -> review record', () => {
  const r = gapUpAt(bgu(102, 2000), 60);
  assert.equal(r.status, 'GAP_AND_STANDARD_VOLUME');
  assert.equal(r.atr40, 2);
  const rec = buyableGapUpScreen({ id: 'X', bars: bgu(102, 2000) });
  assert.equal(rec.length, 1);
  noBuy(rec);
});

test('BGG-02 (MOKA12-004): gap just below 0.75 x ATR40 -> no record', () => {
  assert.equal(gapUpAt(bgu(101.49, 5000), 60).status, 'GAP_BELOW_0_75_ATR40');
  assert.equal(buyableGapUpScreen({ id: 'X', bars: bgu(101.49, 5000) }).length, 0);
});

test('BGG-03 (MOKA24-MEGA, MOKA24-MCD): volume +47.09 % is not rejected but sent to exception review', () => {
  const rec = buyableGapUpScreen({ id: 'X', bars: bgu(102, 1470.9) });
  assert.equal(rec.length, 1);
  const v = rec[0].machineScreenEvidence.find((e) => e.psr709 === 'MOKA24-MEGA');
  assert.equal(v.value.status, 'VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW');
  assert.ok(near(v.value.volumeRatio, 1.4709));
});

test('BGG-04 (MOKA24-VOL, MOKA12-005): 150 % of the average = 1.5x exactly meets the standard; gap exactly 0.75 x ATR40 qualifies', () => {
  const r = gapUpAt(bgu(101.5, 1500), 60);
  assert.equal(r.status, 'GAP_AND_STANDARD_VOLUME');
  assert.equal(r.gapInAtr, 0.75);
});

test('BGG-05 (MOKA12-007): the gap-day low is reported as the sell guide', () => {
  const rec = buyableGapUpScreen({ id: 'X', bars: bgu(102, 2000) });
  assert.equal(rec[0].machineScreenEvidence.find((e) => e.psr709 === 'MOKA12-007').value, 101.5);
});
