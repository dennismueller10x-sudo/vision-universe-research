// V4 performance gate, fair benchmarking and A/B plumbing (synthetic; no provider data).
import test from 'node:test';
import assert from 'node:assert/strict';
import { performanceGate, fairBenchmark, performV4, publicView, PERFORMANCE_METHOD_IDS } from '../research/v4/run-performance-v4.mjs';
import { syntheticData } from './v4-fixtures.mjs';

test('performance gate: only CERTIFIED / PARTIALLY_CERTIFIED with the EW control externally passed', () => {
  assert.equal(performanceGate({ certification: { level: 'CERTIFIED', externallyValidatedSlices: ['EW_MARKET', 'MOM_12_2_EW_DECILES'] } }).open, true);
  assert.equal(performanceGate({ certification: { level: 'PARTIALLY_CERTIFIED', externallyValidatedSlices: ['EW_MARKET'] } }).open, true);
  assert.equal(performanceGate({ certification: { level: 'PARTIALLY_CERTIFIED', externallyValidatedSlices: ['MOM_12_2_EW_DECILES'] } }).open, false);
  assert.equal(performanceGate({ certification: { level: 'INTERNALLY_RECONCILED', externallyValidatedSlices: [] } }).open, false);
  assert.equal(performanceGate({ certification: { level: 'NOT_CERTIFIED' } }).open, false);
  assert.equal(performanceGate(null).open, false);
});

test('fair benchmarking separates portfolio vs SPY, exposure-matched SPY and invested capital', () => {
  const dates = ['2020-01-01', '2020-01-02', '2020-01-03'];
  const bench = dates.map((date, i) => ({ date, equity: 100 * (1 + 0.1 * i), exposure: 1 }));
  const curve = dates.map((date, i) => ({ date, equity: 100 * (1 + 0.05 * i), exposure: 0.5, n: 1 }));
  const f = fairBenchmark(curve, bench, 100);
  assert.equal(f.directions.vsSpyCagr, -1, 'half-invested portfolio trails SPY');
  assert.ok(Math.abs(f.cashDrag - 0.5) < 1e-12);
  assert.ok(f.exposureMatchedSpy.finalEquity > 100);
});

test('A/B: source-faithful and old adaptation run on the same data and stay separate', () => {
  const d = syntheticData({ n: 40 });
  const r = performV4(d, { only: PERFORMANCE_METHOD_IDS });
  assert.deepEqual(Object.keys(r.methods).sort(), [...PERFORMANCE_METHOD_IDS].sort());
  assert.equal(r.methods.TURTLE_S2_EQUITY_DAILY_OLD_VU.track, 'OLD_VU_ADAPTATION');
  assert.equal(r.methods.TURTLE_S1_SOURCE.track, 'ORIGINAL_SOURCE_FAITHFUL_EQUITY_TRANSLATION');
  const pub = publicView(r);
  for (const m of Object.values(pub)) assert.ok(['POSITIVE', 'NEGATIVE', 'ZERO', 'UNAVAILABLE'].includes(m.baseline.vsSpyCagr));
  assert.throws(() => performV4(d, { only: ['MADE_UP'] }), /UNKNOWN_PERFORMANCE_METHOD/);
});
