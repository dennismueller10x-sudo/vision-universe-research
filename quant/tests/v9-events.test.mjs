import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../../scripts/quant/v9/events/run-v9-events.cjs');

test('v9 events: erfc matches reference values', () => {
  const ref = [[0, 1], [1, 0.15729920705028513], [1.96, 0.005573724535172132], [3, 2.2090496998585438e-05], [5, 1.5374597944280351e-12]];
  for (const [x, y] of ref) assert.ok(Math.abs(R.erfc(x) - y) <= Math.max(1e-15, 1e-12 * y), `erfc(${x})`);
});

test('v9 events: Eastern local digits convert with DST', () => {
  assert.equal(R.easternToUtc('2026-03-10T16:05:00.000Z'), '2026-03-10T20:05:00.000Z');
  assert.equal(R.easternToUtc('2025-12-10T16:05:00.000Z'), '2025-12-10T21:05:00.000Z');
});
