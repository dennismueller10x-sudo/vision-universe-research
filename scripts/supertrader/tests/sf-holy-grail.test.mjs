// Source-faithful Holy Grail component (C13): Wilder ADX(14) > 30 (RAS04-002), first pullback to the 20 EMA
// (RAS04-001), 3/10 oscillator with SMA16 signal (RAS04-004); daily timeframe; review records only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adx, oscillator310, holyGrailScreen } from '../source-faithful/methods/holy-grail.mjs';
import { emaSeries } from '../source-faithful/common/series.mjs';

const day = (k) => new Date(Date.UTC(2019, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bars = (rows) => rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: 1e6 }));
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('GC-RAS-ADX-WILDER: a clean uptrend has +DM only, DX = 100 and ADX = 100; a flat market has ADX 0 (Wilder ADX14)', () => {
  const up = bars(Array.from({ length: 40 }, (_, k) => [100 + k, 101 + k, 100 + k, 100.5 + k]));
  const a = adx(up);
  assert.equal(a.ADX[27], 100);   // first ADX after 14 TR sums and 14 DX values: index 2 x 14 - 1
  assert.equal(a.ADX[26], null);
  assert.equal(a.MDI[30], 0);
  const flat = bars(Array.from({ length: 40 }, () => [100, 101, 99, 100]));
  assert.equal(adx(flat).ADX[39], 0);
});

test('GC-RAS-ADX-BELOW-30: no setup while ADX(14) is not above 30 before the pullback (RAS04-002)', () => {
  const chop = bars(Array.from({ length: 80 }, (_, k) => { const p = 100 + (k % 2 ? 1 : -1); return [p, p + 1, p - 1, p]; }));
  for (let i = 30; i < 80; i++) assert.deepEqual(holyGrailScreen({ id: 'X', bars: chop }, { asOfIndex: i }), []);
});

// 30 flat bars, 30 strong up bars, then a slow pullback until the low touches the 20 EMA, a bounce, a second touch
const trendThenPullback = () => {
  const rows = Array.from({ length: 30 }, () => [100, 101, 99, 100]);
  for (let k = 1; k <= 30; k++) { const p = 100 + 2 * k; rows.push([p - 1, p + 1, p - 1.5, p]); }
  for (let k = 1; k <= 12; k++) { const p = 160 - 1.2 * k; rows.push([p + 0.5, p + 1, p - 1, p]); }
  return rows;
};

test('GC-RAS-FIRST-PULLBACK: the first bar whose low touches the 20 EMA after ADX > 30 is a review candidate (RAS04-001, RAS04-006 daily)', () => {
  const b = bars(trendThenPullback()), ema = emaSeries(b.map((x) => x.close), 20);
  const first = b.findIndex((x, i) => i > 60 && x.low <= ema[i]);
  assert.ok(first > 60);
  const [r] = holyGrailScreen({ id: 'X', bars: b }, { asOfIndex: first });
  assert.equal(r.status, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(r.buyDeclarationAllowed, false);
  assert.equal(r.timeframe, 'DAILY');
  assert.ok(r.machineScreenEvidence[0].value.adxBeforePullback > 30);
  for (let i = 61; i < first; i++) assert.deepEqual(holyGrailScreen({ id: 'X', bars: b }, { asOfIndex: i }), []);
});

test('GC-RAS-SECOND-PULLBACK-NOT-FIRST: a later touch is reported with firstPullback false and a review flag, not silently accepted (review SF-R2-02)', () => {
  const rows = trendThenPullback(); for (let k = 0; k < 3; k++) rows.push([147, 152, 146, 151]); rows.push([150, 151, 140, 141]);
  const b = bars(rows), ema = emaSeries(b.map((x) => x.close), 20);
  const touches = b.map((x, i) => (i > 60 && x.low <= ema[i] ? i : -1)).filter((i) => i > 0);
  assert.ok(touches.length >= 2);
  const res = holyGrailScreen({ id: 'X', bars: b }, { asOfIndex: touches.at(-1) });
  for (const r of res) {
    assert.equal(r.machineScreenEvidence.find((e) => e.ruleId === 'RAS-SF-PULLBACK').value.firstPullback, false);
    assert.ok(r.openQuestions.some((q) => q.flag === 'RAS-MR-NOT-FIRST'));
  }
  const [first] = holyGrailScreen({ id: 'X', bars: b }, { asOfIndex: touches[0] });
  assert.equal(first.machineScreenEvidence.find((e) => e.ruleId === 'RAS-SF-PULLBACK').value.firstPullback, true);
});

test('GC-RAS-OSC-310: oscillator = SMA3 - SMA10, signal = SMA16 of the oscillator (RAS04-004)', () => {
  const b = bars(Array.from({ length: 40 }, (_, k) => [k, k, k, k]));
  const { osc, signal } = oscillator310(b);
  assert.equal(osc[8], null);
  // linear closes: SMA3 - SMA10 = (k-1) - (k-4.5) = 3.5
  assert.ok(close(osc[9], 3.5));
  assert.equal(signal[23], null);
  assert.ok(close(signal[24], 3.5));
});

test('SF-RAS-TEMPORAL: the screen on bar i ignores later bars', () => {
  const rows = trendThenPullback(), b = bars(rows), ema = emaSeries(b.map((x) => x.close), 20);
  const first = b.findIndex((x, i) => i > 60 && x.low <= ema[i]);
  const ext = bars([...rows, [10, 11, 9, 10]]);
  assert.deepEqual(holyGrailScreen({ id: 'X', bars: b }, { asOfIndex: first }), holyGrailScreen({ id: 'X', bars: ext }, { asOfIndex: first }));
});
