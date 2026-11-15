import test from 'node:test';
import assert from 'node:assert/strict';
import { run, detect, templateEvents, HORIZONS } from '../../scripts/technical/ema-cluster-study.mjs';
function fixture(n = 800) {
  const dates = []; for (let t = Date.UTC(2020, 0, 1); dates.length < n; t += 864e5) if (![0, 6].includes(new Date(t).getUTCDay())) dates.push(new Date(t).toISOString().slice(0, 10));
  const bars = shift => dates.map((date, i) => { const close = 100 + i * .05 + 15 * Math.sin(i / 17 + shift); return { date, close, open: close, high: close * 1.01, low: close * .99, closeAt: date + 'T21:00:00Z' }; });
  return { schemaVersion: 'technical-event-study-input-1.0.0', asOf: dates.at(-1), priceBasis: 'SPLIT_ADJUSTED_PRICE', returnBasis: 'PRICE_RETURN', currency: 'USD',
    sourceMode: 'SYNTHETIC_TEST', calendar: dates, population: { sourceHash: 'fixture', limitations: ['SYNTHETIC'] },
    listings: [0, 1, 2].map(k => ({ listingId: 'test-' + k, issuerId: 'test-' + k, sourceHash: 'fixture',
      identity: { mic: 'XNYS', instrumentClass: 'COMMON_STOCK', primary: true, validFrom: dates[0], availableAt: dates[0] + 'T00:00:00Z', sourceHash: 'fixture' },
      membership: [{ validFrom: dates[0], availableAt: dates[0] + 'T00:00:00Z', sourceHash: 'fixture' }], bars: bars(k) })),
    benchmark: { id: 'SPY', returnBasis: 'PRICE_RETURN', currency: 'USD', bars: dates.map((date, i) => ({ date, close: 100 + i * .1 })) } };
}
const config = { fast: [2, 3], slow: [5, 8] };
test('study uses daily horizons, real Quant execution, costs, censoring and purged later windows', () => {
  const input = fixture(), out = run(input, { config });
  assert.deepEqual(HORIZONS, [5, 20, 60]);
  assert.equal(out.cells.length, 36);
  assert.ok(out.counts.events > 0);
  assert.ok(out.cells.some(c => c.net.n > 0));
  assert.ok(out.cells.some(c => c.walkForward.state === 'EXECUTED'));
  for (const c of out.cells) assert.equal(c.net.n, c.net.positive + c.net.negative + c.net.zero);
  assert.equal(out.independentHoldout, false);
  assert.equal(out.productionApproved, false);
  assert.equal(out.resultHash, run(input, { config }).resultHash);
  const expensive = run(input, { config, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 50, slippageBps: 50 } });
  for (let i = 0; i < out.cells.length; i++) if (out.cells[i].net.n) assert.ok(expensive.cells[i].net.mean < out.cells[i].net.mean);
});
test('study refuses benchmark/basis drift and never substitutes weekly returns for trading days', () => {
  const input = fixture(250);
  assert.throws(() => run({ ...input, benchmark: { ...input.benchmark, id: 'QQQ' } }), /SPY/);
  assert.throws(() => run({ ...input, returnBasis: 'TOTAL_RETURN' }), /BENCHMARK_BASIS/);
  assert.throws(() => run({ ...input, priceBasis: 'RAW' }), /CANONICAL/);
  const out = run(input, { config, timeframe: '1W' });
  assert.ok(out.cells.every(c => HORIZONS.includes(c.horizonTradingDays)));
  assert.ok(out.cells.every(c => c.walkForward.state === 'NOT_RUN'));
});
test('detections respect availability, completed timeframes, and future poisoning', () => {
  const input = fixture(250), l = input.listings[0];
  const cutoff = input.calendar[180];
  const a = detect(l, { asOf: cutoff, config });
  const b = detect({ ...l, bars: l.bars.map(x => x.date > cutoff ? { ...x, close: 999999 } : x) }, { asOf: cutoff, config });
  assert.deepEqual(a, b);
  for (const e of a) assert.ok(e.availableAt >= e.date && e.date <= cutoff);
  const weekly = detect(l, { asOf: cutoff, config, timeframe: '1W' });
  assert.ok(weekly.every(e => new Date(e.date).getUTCDay() === 5));
});
test('formation mode calls historical engine and accepts monthly aggregation without future states', () => {
  const input = fixture(250), l = input.listings[0], cutoff = input.calendar[180];
  const a = detect(l, { asOf: cutoff, mode: 'FORMATIONS' });
  const b = detect({ ...l, bars: l.bars.slice(0, 181) }, { asOf: cutoff, mode: 'FORMATIONS' });
  assert.deepEqual(a, b);
  assert.ok(a.every(e => !('stateNow' in e) && e.date <= cutoff));
  assert.doesNotThrow(() => detect(l, { asOf: cutoff, mode: 'FORMATIONS', timeframe: '1M' }));
});


test('exact template predicates use timestamped fields; unknown or nonconsecutive snapshots never become false', () => {
  const calendar = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'];
  const snap = (date, fields) => ({ date, availableAt: date + 'T23:59:59Z', sourceHash: 'fixture', fields: { fresh: true, ...fields } });
  const events = templateEvents([snap(calendar[0], { aboveSma200: false }), snap(calendar[1], { aboveSma200: true })], calendar, calendar.at(-1));
  assert.ok(events.some(e => e.type === 'aboveSma200' && e.date === calendar[1]));
  assert.ok(!templateEvents([snap(calendar[0], {}), snap(calendar[1], { aboveSma200: true })], calendar, calendar.at(-1)).some(e => e.type === 'aboveSma200'));
  assert.ok(!templateEvents([snap(calendar[0], { aboveSma200: false }), snap(calendar[2], { aboveSma200: true })], calendar, calendar.at(-1)).some(e => e.type === 'aboveSma200'));
  assert.throws(() => templateEvents([{ ...snap(calendar[0], {}), availableAt: calendar[1] + 'T00:00:00Z' }], calendar, calendar.at(-1)), /INVALID_TEMPLATE/);
});
