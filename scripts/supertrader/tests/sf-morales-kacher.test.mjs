// Source-faithful Morales / Kacher Pocket Pivot (C11) and Buyable Gap-Up (C12) (#709 MOKAPP-003, MOKA12-004,
// MOKA24-VOL, MOKA24-MEGA, MOKA12-007, MOKA-C1 / C2). Screens emit review records only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pocketPivotAt, pocketPivotScreen, gapUpAt, atrBefore, buyableGapUpScreen, maViolationEvidence } from '../source-faithful/methods/morales-kacher.mjs';

const day = (k) => new Date(Date.UTC(2022, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bars = (rows) => rows.map(([o, h, l, c, v], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v }));
// closes alternate up / down; down days have volume dv
const ppRows = (dv = 900, downVolumes = null) => {
  const r = [[100, 101, 99, 100, 500]];
  for (let k = 1; k <= 11; k++) { const up = k % 2 === 1; const c = up ? 101 : 100; r.push([100, 101.5, 99.5, c, up ? 500 : (downVolumes?.[k] ?? dv)]); }
  return r;
};

test('GC-PP-SIGNATURE: up-day volume above the largest down-day volume of the prior ten sessions (MOKAPP-003)', () => {
  const b = bars([...ppRows(900), [100, 103, 100, 102.5, 1000]]);
  const r = pocketPivotAt(b, b.length - 1);
  assert.equal(r.status, 'VOLUME_SIGNATURE');
  assert.equal(r.maxDownVolume, 900);
  const [rec] = pocketPivotScreen({ id: 'X', bars: b });
  assert.equal(rec.status, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(rec.buyDeclarationAllowed, false);
});

test('GC-PP-EQUAL-NOT-GREATER: equal volume is not greater (MOKAPP-003 strictly greater)', () => {
  const b = bars([...ppRows(900), [100, 103, 100, 102.5, 900]]);
  assert.equal(pocketPivotAt(b, b.length - 1).status, 'VOLUME_NOT_ABOVE_DOWN_VOLUME');
  assert.deepEqual(pocketPivotScreen({ id: 'X', bars: b }), []);
});

test('GC-PP-WINDOW-10: a down day eleven sessions back does not count (MOKAPP-003 ten days)', () => {
  // the down day with 5000 volume is bar 2; the candidate is bar 13 -> window bars 3..12
  const rows = ppRows(900, { 2: 5000 }); rows.push([100, 101.5, 99.5, 101, 500]);
  const b = bars([...rows, [101, 103, 100.5, 102.5, 1000]]);
  const r = pocketPivotAt(b, b.length - 1);
  assert.equal(r.status, 'VOLUME_SIGNATURE');
  assert.equal(r.maxDownVolume, 900);
});

test('GC-PP-NO-DOWN-DAY: a window without a down day gives no comparison and no candidate (derivation)', () => {
  const up = Array.from({ length: 12 }, (_, k) => [100 + k, 101 + k, 99 + k, 100.5 + k, 500]);
  const b = bars([...up, [112, 114, 111.5, 113.5, 2000]]);
  assert.equal(pocketPivotAt(b, b.length - 1).status, 'NO_DOWN_DAY_IN_WINDOW');
});

test('GC-PP-DOWN-DAY-REJECT: a down day with large volume is not a pocket pivot (derivation)', () => {
  const b = bars([...ppRows(900), [100, 101, 98, 99, 5000]]);
  assert.equal(pocketPivotAt(b, b.length - 1).status, 'NOT_UP_DAY');
});

test('GC-PP-EXTENSION-IS-EVIDENCE: distance from the 10 / 50 / 200-day MAs is evidence, never a rejection (MOKAPP-004, MOKAPP-010)', () => {
  const b = bars([...ppRows(900), [100, 130, 100, 128, 1000]]); // far above the 10DMA
  const [rec] = pocketPivotScreen({ id: 'X', bars: b });
  const ctx = rec.machineScreenEvidence.find((e) => e.ruleId === 'MOKA-SF-PP-CONTEXT').value;
  assert.ok(ctx.pctFrom10DMA > 0.2);
  assert.equal(ctx.pctFrom200DMA, null); // not enough history: reported as null, nothing filled
  assert.ok(rec.openQuestions.some((q) => q.flag === 'MOKA-MR-EXT'));
});

// BGU: 60 quiet sessions with TR = 2, volume 1,000; then a gap day
const quiet = () => Array.from({ length: 60 }, () => [100, 101, 99, 100, 1000]);

test('GC-BGU-CANDIDATE / GC-BGU-VOLUME-1-5-EXACT: gap >= 0.75 x ATR40 with volume 150 % OF the average (MOKA12-004, MOKA24-VOL)', () => {
  const b = bars([...quiet(), [101.5, 104, 101.2, 103, 1500]]);
  const r = gapUpAt(b, b.length - 1);
  assert.equal(r.atr40, 2);
  assert.equal(r.gap, 1.5);           // = 0.75 x 2
  assert.equal(r.volumeRatio, 1.5);   // exactly the standard
  assert.equal(r.status, 'GAP_AND_STANDARD_VOLUME');
  assert.equal(r.volumeWindowStatus, 'SOURCE_AMBIGUOUS');
  const [rec] = buyableGapUpScreen({ id: 'X', bars: b });
  assert.equal(rec.status, 'MANUAL_REVIEW_REQUIRED');
});

test('GC-BGU-GAP-BELOW: a gap just below 0.75 x ATR40 is no candidate (MOKA12-004)', () => {
  const b = bars([...quiet(), [101.49, 104, 101.2, 103, 3000]]);
  assert.equal(gapUpAt(b, b.length - 1).status, 'GAP_BELOW_0_75_ATR40');
  assert.deepEqual(buyableGapUpScreen({ id: 'X', bars: b }), []);
});

test('GC-BGU-ATR40-NO-SAME-DAY: the ATR uses the 40 sessions before the gap day only', () => {
  const b = bars([...quiet(), [101.5, 150, 50, 103, 1500]]); // an extreme gap-day range does not change the ATR
  assert.equal(atrBefore(b, b.length - 1), 2);
});

test('GC-BGU-MCD-EXCEPTION: volume +47.09 % (1.4709x) is not rejected but goes to review (#709 MOKA24-MEGA, case MOKA24-MCD)', () => {
  const b = bars([...quiet(), [101.5, 104, 101.2, 103, 1470.9]]);
  const r = gapUpAt(b, b.length - 1);
  assert.equal(r.status, 'VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW');
  const [rec] = buyableGapUpScreen({ id: 'X', bars: b });
  assert.equal(rec.machineScreenEvidence.find((e) => e.psr709 === 'MOKA24-MEGA').value.status, 'VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW');
  assert.ok(rec.openQuestions.some((q) => q.flag === 'MOKA-MR-MEGA'));
});

test('GC-BGU-SELL-GUIDE: the gap-day low is reported as the risk reference (MOKA12-007)', () => {
  const b = bars([...quiet(), [101.5, 104, 101.2, 103, 2000]]);
  const [rec] = buyableGapUpScreen({ id: 'X', bars: b });
  assert.equal(rec.machineScreenEvidence.find((e) => e.ruleId === 'MOKA-SF-BGU-SELLGUIDE').value.gapDayLow, 101.2);
});

test('GC-MOKA-MA-VIOLATION-BOTH-READINGS: next-day and later-day undercut are both reported, no automatic exit (MOKA-C2)', () => {
  const rows = Array.from({ length: 12 }, (_, k) => [100 + k, 101 + k, 99.5 + k, 100.5 + k, 1000]);
  rows.push([110, 110.5, 104, 104.5, 1000]); // close below the 10DMA, low 104
  rows.push([104.5, 106, 104.2, 105, 1000]); // next day holds the low
  rows.push([105, 105.5, 103.8, 104, 1000]); // later undercut
  const v = maViolationEvidence(bars(rows), rows.length - 1, 10);
  assert.equal(v.nextDayUndercut, false);
  assert.equal(v.laterUndercut, true);
});

test('SF-MOKA-TEMPORAL: the screens on bar i ignore later bars', () => {
  const a = bars([...quiet(), [101.5, 104, 101.2, 103, 2000], [103, 104, 90, 91, 9000]]);
  assert.deepEqual(buyableGapUpScreen({ id: 'X', bars: a }, { asOfIndex: 60 }), buyableGapUpScreen({ id: 'X', bars: a.slice(0, 61) }));
});

test('SF-MOKA-BGU-MISSING-DATA: missing gap-day volume is MISSING_DATA; a short volume window still evaluates the gap (review SF-R2-05 / SF-R2-06)', () => {
  const b = bars([...quiet(), [101.5, 104, 101.2, 103, NaN]]);
  assert.equal(gapUpAt(b, b.length - 1).status, 'MISSING_DATA');
  assert.deepEqual(buyableGapUpScreen({ id: 'X', bars: b }), []);
  const short = bars([...quiet().slice(0, 45), [101.5, 104, 101.2, 103, 2000]]);
  const r = gapUpAt(short, short.length - 1);
  assert.equal(r.status, 'GAP_VOLUME_WINDOW_UNAVAILABLE_REVIEW');
  assert.equal(r.volumeRatio, null);
  assert.equal(buyableGapUpScreen({ id: 'X', bars: short })[0].status, 'MANUAL_REVIEW_REQUIRED');
});
