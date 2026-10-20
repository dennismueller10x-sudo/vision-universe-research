// Supertrader 2.0 Darvas completion (sf-darvas-1.1.0): multiple box transitions inside one position, missing bars in
// the box machine and the stop path, the DAR-Q12 review data and the position plan of a review record. Synthetic bars.
import test from 'node:test';
import assert from 'node:assert/strict';
import { darvasEvents, darvasPosition, darvasScreen, darvasReviewData, DARVAS_VERSION } from '../source-faithful/methods/darvas.mjs';

const day = (k) => new Date(Date.UTC(2021, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const hl = (h, l, o = (h + l) / 2, c = (h + l) / 2) => [o, h, l, c];
const bars = (rows) => rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: 1000 + k, splitAdj: 1 }));
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/** One box at level x: top x+1 confirmed by three lower highs, bottom x+0.5 confirmed by three higher lows, then a breakout bar. */
const boxAfterTop = (x) => [hl(x + 0.9, x + 0.5), hl(x + 0.9, x + 0.6), hl(x + 0.9, x + 0.6), hl(x + 0.9, x + 0.6)];
const breakout = (x) => [x + 1.05, x + 1.6, x + 1.05, x + 1.5];
// staircase: box 1 (x 10: top 11, bottom 10.5), box 2 (x 10.6: top 11.6, bottom 11.1), box 3 (x 11.2: top 12.2, bottom 11.7)
const STAIR = [hl(9, 8.5), hl(11, 10.6), ...boxAfterTop(10), breakout(10), ...boxAfterTop(10.6), breakout(10.6), ...boxAfterTop(11.2)];

test('SF2-DAR-VERSION: the completed Darvas component carries its own version', () => {
  assert.equal(DARVAS_VERSION, 'sf-darvas-1.1.0');
});

test('GC-DAR-MULTI-BOX-STOP: each later higher box raises the stop below its bottom; the position exits on the last raised stop (DAR-Q6, DAR-Q8, DAR-B7)', () => {
  const b = bars([...STAIR, [11.75, 11.8, 11.4, 11.5]]);
  const ev = darvasEvents(b).events;
  assert.equal(ev.filter((e) => e.type === 'BREAKOUT').length, 2);
  assert.equal(ev.filter((e) => e.type === 'BOTTOM_CONFIRMED').length, 3);
  const p = darvasPosition(b, ev.find((e) => e.type === 'BREAKOUT'));
  assert.ok(close(p.path[0].stop, 10.99));
  const raises = p.path.filter((x) => x.ruleId === 'DAR-SF-STOP-RAISE').map((x) => x.stop);
  assert.equal(raises.length, 2);
  assert.ok(close(raises[0], 11.09) && close(raises[1], 11.69), JSON.stringify(raises));
  assert.equal(p.exit.i, b.length - 1);
  assert.equal(p.exit.reason, 'STOP');
  assert.ok(close(p.exit.fill, 11.69));
});

test('GC-DAR-MULTI-BOX-GAP-EXIT: a gap below the raised stop exits at the open (DAR-SF-STOP-RAISE, daily bars)', () => {
  const b = bars([...STAIR, [11.5, 11.6, 11.3, 11.4]]);
  const p = darvasPosition(b, darvasEvents(b).events.find((e) => e.type === 'BREAKOUT'));
  assert.equal(p.exit.reason, 'STOP_GAP_OPEN');
  assert.ok(close(p.exit.fill, 11.5));
});

test('GC-DAR-MISSING-BAR: a bar without high / low produces no transition and no fill; the machine resumes on the next bar', () => {
  const rows = [...STAIR];
  const withGap = bars(rows); withGap.splice(9, 0, { date: '2021-01-12x', open: null, high: null, low: null, close: null, volume: null, splitAdj: 1 });
  const a = darvasEvents(bars(rows)).events.map((e) => e.type), g = darvasEvents(withGap).events.map((e) => e.type);
  assert.deepEqual(g, a); // the missing bar is skipped, not interpolated
  const b = bars([...STAIR, [11.75, 11.8, 11.4, 11.5]]);
  b.splice(b.length - 1, 0, { date: '2021-02-01x', open: NaN, high: NaN, low: NaN, close: NaN, volume: 0, splitAdj: 1 });
  const p = darvasPosition(b, darvasEvents(b).events.find((e) => e.type === 'BREAKOUT'));
  assert.equal(p.exit.i, b.length - 1); // no fill on the missing bar
});

test('GC-DAR-REVIEW-DATA: the review record carries the DAR-Q12 data (ATH, 2 / 3-year high-low, 26 weekly ranges with volume); evidence only', () => {
  const rows = []; for (let k = 0; k < 300; k++) rows.push(hl(10 + (k % 5) * 0.1, 9.5));
  const b = bars(rows);
  const d = darvasReviewData(b, b.length - 1);
  assert.ok(close(d.allTimeHighInHistory, 10.4));
  assert.equal(d.highLow['2y'].complete, false);
  assert.equal(d.highLow['2y'].sessions, 300);
  assert.equal(d.weekly.length, 26);
  assert.equal(d.fourMonthWeeks, 17);
  assert.ok(d.weekly.every((w) => w.sessions >= 1 && w.volume > 0));
  // causal: later bars do not change the data of an earlier date
  const longer = bars([...rows, hl(50, 9)]);
  assert.deepEqual(darvasReviewData(longer, b.length - 1), d);
});

test('GC-DAR-REVIEW-RECORD: a screen record carries the review data and a mechanical position plan, never a buy', () => {
  const b = bars(STAIR.slice(0, 7));
  const rec = darvasScreen({ id: 'X', bars: b }, { asOfIndex: 6 });
  assert.equal(rec.length, 1);
  assert.equal(rec[0].buyDeclarationAllowed, false);
  assert.equal(rec[0].status, 'MANUAL_REVIEW_REQUIRED');
  assert.ok(rec[0].machineScreenEvidence.some((e) => e.ruleId === 'DAR-SF-REVIEW-DATA'));
  assert.ok(close(rec[0].positionPlan.initialStop, 10.99));
  assert.equal(rec[0].positionPlan.sizing, 'REVIEWER (DAR-MR-SIZING)');
});

test('SF2-DAR-SYNTHETIC-BAR-GUARD: no component entry and no stop fill on a synthetic bar (research-v1 isExecutableBar)', async () => {
  const { darvasComponentTrades } = await import('../source-faithful/methods/darvas.mjs');
  const b = bars([...STAIR, [11.75, 11.8, 11.4, 11.5], [11.6, 11.7, 11.3, 11.4]]);
  const real = darvasComponentTrades({ id: 'X', bars: b });
  assert.equal(real[0].exitDate, b[b.length - 2].date);
  const syn = b.map((x, k) => (k === b.length - 2 ? { ...x, synthetic: true } : x));
  const t = darvasComponentTrades({ id: 'X', bars: syn });
  assert.equal(t[0].exitDate, b[b.length - 1].date); // the stop fills on the next real bar
  const synEntry = b.map((x) => (x.date === real[0].entryDate ? { ...x, synthetic: true } : x));
  assert.ok(!darvasComponentTrades({ id: 'X', bars: synEntry }).some((x) => x.entryDate === real[0].entryDate));
});

test('SF2-DAR-RAISE-ON-SYNTHETIC-BAR: a box completed on a synthetic bar still raises the stop from the next real bar (review R2-03)', () => {
  const rows = [...STAIR, [11.75, 11.8, 11.4, 11.5]];
  const b = bars(rows), ev = darvasEvents(b).events, br = ev.find((e) => e.type === 'BREAKOUT');
  const lastConfirm = ev.filter((e) => e.type === 'BOTTOM_CONFIRMED').at(-1).i;
  const syn = b.map((x, k) => (k === lastConfirm ? { ...x, synthetic: true } : x));
  const p = darvasPosition(syn, br);
  assert.ok(close(p.exit.fill, 11.69), JSON.stringify(p.path));
  assert.equal(p.path.at(-1).confirmedOn, b[lastConfirm].date);
});
