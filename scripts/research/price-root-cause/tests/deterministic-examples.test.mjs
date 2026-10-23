// Deterministic examples E1-E10 and F1 of the root-cause audit, run against the production engines on main.
// They document behaviour; they do not change it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RS = require('../../../../quant/engines/return-series.js');
const CTR = require('../../../../quant/engines/canonical-total-return.js');
const AD = require('../../../../providers/tiingo/adapter.js');
const CB = require('../../../../quant/engines/technical/canonical-bars.js');
const C = { identity: { state: 'CONFIRMED' } };
const bar = (date, close, splitFactor = 1, dividend = 0, adjustedClose) => ({ date, close, splitFactor, dividend, ...(adjustedClose !== undefined ? { adjustedClose } : {}) });
const gross = (r, k) => r.tr[k] / r.tr[k - 1];

test('E1-E4: declared splits and dividends are applied correctly, from their own day', () => {
  const fwd = [bar('2024-01-02', 400), bar('2024-01-03', 404), bar('2024-01-04', 101.5, 4), bar('2024-01-05', 102)];
  assert.deepEqual(RS.splitFactors(fwd), [4, 4, 1, 1]);
  assert.ok(Math.abs(gross(CTR.reconstruct(fwd, C), 2) - 101.5 * 4 / 404) < 1e-12);
  const rev = [bar('2024-01-02', 1.0), bar('2024-01-03', 1.02), bar('2024-01-04', 10.1, 0.1), bar('2024-01-05', 10.0)];
  assert.ok(Math.abs(gross(CTR.reconstruct(rev, C), 2) - 0.1 * 10.1 / 1.02) < 1e-12);
  const div = [bar('2024-01-02', 100), bar('2024-01-03', 99, 1, 1), bar('2024-01-04', 99)];
  assert.ok(Math.abs(gross(CTR.reconstruct(div, C), 1) - 1) < 1e-12);
  const both = [bar('2024-01-02', 100), bar('2024-01-03', 50, 2, 0.5), bar('2024-01-04', 50)];
  assert.ok(Math.abs(gross(CTR.reconstruct(both, C), 1) - 1.01) < 1e-12);
});

test('E5/E6/E7/E10: an undeclared split missing from BOTH provider columns passes; the raw-only check only runs without adjClose', () => {
  const e5 = [bar('2024-01-02', 1.0, 1, 0, 1.0), bar('2024-01-03', 1.02, 1, 0, 1.02), bar('2024-01-04', 10.2, 1, 0, 10.2), bar('2024-01-05', 10.1, 1, 0, 10.1)];
  const r5 = CTR.reconstruct(e5, C);
  assert.equal(r5.state, 'TOTAL_RETURN_RECONSTRUCTED'); assert.equal(r5.crossCheck.state, 'MATCH'); assert.ok(Math.abs(gross(r5, 2) - 10) < 1e-9);
  const e6 = e5.map(({ adjustedClose, ...b }) => b);
  assert.equal(CTR.reconstruct(e6, C).reason, 'SPLIT_SUSPECTED');
  const e7 = [bar('2024-01-02', 1.0, 1, 0, 1.0), bar('2024-01-03', 1.02, 1, 0, 1.02), bar('2024-01-04', 10.2, 1, 0, 1.02), bar('2024-01-05', 10.1, 1, 0, 1.01)];
  assert.equal(CTR.reconstruct(e7, C).reason, 'SPLIT_MISSING');
  const e10 = [bar('2024-01-02', 1.0, 1, 0, 1.0), bar('2024-01-03', 1.02, 1, 0, 1.02), bar('2024-01-04', 10.2, 1, 0, 10.2)];
  assert.equal(CTR.reconstruct(e10, C).state, 'TOTAL_RETURN_RECONSTRUCTED', 'a genuine +900 % move looks exactly like E5');
});

test('E8: a declared split the raw price does not show is rejected', () => {
  const b = [bar('2024-01-02', 100), bar('2024-01-03', 100.5, 4), bar('2024-01-04', 101)];
  assert.equal(CTR.reconstruct(b, C).detail, 'SPLIT_NOT_IN_RAW_PRICE');
});

test('F1: the split implementations share one geometry; the Tiingo adapter rounds to 4 decimals', () => {
  const bars = [['2020-01-02', 400, 1], ['2020-01-03', 404, 1], ['2020-01-06', 101.5, 4], ['2020-01-07', 1.02, 1], ['2020-01-08', 10.3, 0.1], ['2020-01-09', 0.00031, 1], ['2020-01-10', 0.0031, 10]]
    .map(([date, close, splitFactor]) => ({ date, open: close, high: close, low: close, close, volume: 1000, splitFactor, dividend: 0 }));
  const a = RS.splitAdjustedColumn(bars, 'close');
  const cb = CB.fromPriceBars(bars, bars.filter((x) => x.splitFactor !== 1).map((x) => ({ type: 'split', exDate: x.date, ratio: x.splitFactor })), {});
  const c = JSON.parse(JSON.stringify(cb.SPLIT_ADJUSTED)).close ?? null;
  const expected = [100, 101, 101.5, 1.02, 1.03, 0.000031, 0.0031];
  a.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-12));
  if (Array.isArray(c)) c.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-9));
  const t = AD.splitAdjustedCloses(bars).map((x) => x[1]);
  assert.equal(t[5], 0, 'sub-cent adjusted close lost by toFixed(4)');
});
