import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../engines/technical/ema-cluster.js');
const F = require('../engines/technical/feature-store.js');
const date = i => new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10);
const bars = values => values.map((close, i) => ({ date: date(i), close }));
const calc = (b, config) => E.calculate({ bars: b, asOf: b.at(-1).date, config });
const config = { fast: [2, 3], slow: [5, 8] };

test('EMA cluster reuses settled EMA exactly; warmup remains missing', () => {
  const b = bars(Array.from({ length: 330 }, (_, i) => 100 + i));
  const d = calc(b);
  assert.equal(d.rows[30].quality, 'WARMUP');
  for (const p of E.DEFAULTS.fast) assert.equal(d.rows.at(-1).fast.values[E.DEFAULTS.fast.indexOf(p)], F.settledEma(b.map(x => x.close), p).values.at(-1));
  assert.equal(d.rows.at(-1).trend, 'UP');
  assert.equal(d.rows.at(-1).arrangement, 'BULLISH');
  assert.ok(d.events.some(e => e.type === 'BULLISH_ARRANGEMENT'));
});
test('EMA cluster causal prefixes and poisoned future produce identical past', () => {
  const b = bars(Array.from({ length: 500 }, (_, i) => 100 + i / 5 + 10 * Math.sin(i / 15)));
  const full = calc(b, config), prefix = calc(b.slice(0, 290), config);
  assert.deepEqual(full.rows.slice(0, 290), prefix.rows);
  assert.deepEqual(full.events.filter(e => e.date <= date(289)), prefix.events);
  assert.deepEqual(E.calculate({ bars: [...b.slice(0, 290), { date: date(290), close: -1 }], asOf: date(289), config }).rows, prefix.rows);
});
test('normalized cluster metrics, states and events are invariant to price scale', () => {
  const b = bars(Array.from({ length: 250 }, (_, i) => 80 + i * .3 + Math.sin(i / 4)));
  const a = calc(b, config), z = calc(b.map(b => ({ ...b, close: b.close * 100 })), config);
  assert.deepEqual(a.events, z.events);
  for (let i = 100; i < b.length; i++) for (const key of Object.keys(a.rows[i].metrics)) {
    const x = a.rows[i].metrics[key], y = z.rows[i].metrics[key];
    if (x === null) assert.equal(y, null); else assert.ok(Math.abs(x - y) < 1e-9, key);
  }
});
test('compression, sideways, expansion and trend reversal are distinct causal states', () => {
  const b = bars([...Array(180).fill(100), ...Array.from({ length: 70 }, (_, i) => 100 + i), ...Array.from({ length: 100 }, (_, i) => 170 - i)]);
  const d = calc(b, config);
  assert.equal(d.rows[150].trend, 'SIDEWAYS');
  assert.equal(d.rows[150].dynamics, 'COMPRESSION');
  assert.ok(d.events.some(e => e.type === 'COMPRESSION_BREAKOUT_UP'));
  assert.ok(d.events.some(e => e.type === 'EXPANSION'));
  assert.ok(d.events.some(e => e.type === 'UP_TO_DOWN'));
  assert.equal(d.rows.at(-1).trend, 'DOWN');
});
test('pullback and resumption require distinct bars and preserve original touch date', () => {
  const v = Array.from({ length: 100 }, (_, i) => 100 + i);
  const before = calc(bars(v), config).rows.at(-1);
  const b = bars([...v, before.fast.mean, 201, 202]);
  const d = calc(b, config), touch = d.events.find(e => e.type === 'PULLBACK_FAST');
  const resume = d.events.find(e => e.type === 'RESUME_UP' && e.cluster === 'fast');
  assert.equal(touch.date, date(100));
  assert.ok(resume.date > touch.date);
  assert.equal(resume.pullbackDate, touch.date);
});
test('custom groups validate and incomplete/invalid data are rejected', () => {
  assert.throws(() => E.configuration({ fast: [3, 3] }), /INVALID_EMA_GROUP/);
  assert.throws(() => E.configuration({ fast: [40], slow: [20] }), /OVERLAP/);
  assert.throws(() => E.configuration({ expansionRatio: 1 }), /INVALID/);
  assert.throws(() => E.configuration({ mystery: 1 }), /UNKNOWN/);
  assert.throws(() => calc([{ date: '2020-01-01', close: 0 }]), /INVALID/);
  assert.throws(() => calc([{ date: '2020-01-01', close: 10, complete: false }]), /INCOMPLETE/);
});
