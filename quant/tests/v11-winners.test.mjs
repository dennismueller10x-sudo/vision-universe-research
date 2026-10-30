// V11 WINNERS – unit tests for the pure building blocks (no production data read or written).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const W = require('../../scripts/quant/v11/winners/lib.cjs');
const REG = require('../../scripts/quant/v11/winners/registration.cjs');
const V = require('../engines/research-validation.cjs');

test('cohort dates: last calendar date of each quarter-end month', () => {
  const cal = ['2001-03-23', '2001-03-30', '2001-04-06', '2001-06-29', '2001-09-28', '2001-12-28', '2002-03-29'];
  assert.deepEqual(W.cohortDates(cal, 2001, 2001), ['2001-03-30', '2001-06-29', '2001-09-28', '2001-12-28']);
});

test('percentiles are mid-rank, direction-aware and keep missing values', () => {
  assert.deepEqual(W.percentiles([1, 2, 3, 4], 'higher'), [0.125, 0.375, 0.625, 0.875]);
  assert.deepEqual(W.percentiles([1, 2, 3, 4], 'lower'), [0.875, 0.625, 0.375, 0.125]);
  assert.deepEqual(W.percentiles([1, null, 1], 'higher'), [0.5, null, 0.5]);
});

test('classes: top 1 %/5 % by ceil, bottom decile and delisted-without-consideration are losers', () => {
  const rets = Array.from({ length: 100 }, (_, i) => i / 100); // 0..0.99
  const dnc = rets.map((_, i) => i === 50);
  const c = W.assignClasses(rets, dnc);
  assert.equal(c.filter(x => x.top1).length, 1);
  assert.equal(c.filter(x => x.top5).length, 5);
  assert.equal(c.filter(x => x.loser).length, 11);
  assert.ok(c[50].loser && c[50].average);
  assert.equal(c.filter(x => x.average).length, 60);
});

test('rank AUC: perfect, inverse and chance', () => {
  assert.equal(W.rankAuc([1, 2, 3, 4], [false, false, true, true]), 1);
  assert.equal(W.rankAuc([1, 2, 3, 4], [true, true, false, false]), 0);
  assert.equal(W.rankAuc([1, 1, 1, 1], [true, false, true, false]), 0.5);
  assert.equal(W.rankAuc([1, 2], [true, true]), null);
});

test('lift, precision, recall and false-positive share from quintile counts', () => {
  const pcts = [0.9, 0.9, 0.5, 0.1, 0.85];
  const lab = [true, false, true, false, false];
  const c = W.quintileCounts(pcts, lab, 'top');
  assert.deepEqual(c, { n: 5, pos: 2, sel: 3, selPos: 1 });
  const L = W.liftFrom(c);
  assert.equal(L.precision, 1 / 3); assert.equal(L.baseRate, 0.4); assert.ok(Math.abs(L.lift - (1 / 3) / 0.4) < 1e-12);
  assert.equal(L.recall, 0.5); assert.equal(L.falsePositiveShare, 2 / 3); assert.equal(L.fpr, 2 / 3);
});

test('price features use closes up to k only (future bars do not change them)', () => {
  const closes = Array.from({ length: 200 }, (_, i) => 10 * Math.exp(0.01 * i + 0.05 * Math.sin(i)));
  const spy = () => 100;
  const a = W.priceFeatures(closes, 120, spy);
  const mutated = closes.slice(); for (let j = 121; j < 200; j++) mutated[j] = 1;
  assert.deepEqual(W.priceFeatures(mutated, 120, spy), a);
  assert.ok(Math.abs(a.mom3m - (closes[120] / closes[107] - 1)) < 1e-12);
  assert.ok(Math.abs(a.mom12_1m - (closes[116] / closes[68] - 1)) < 1e-12);
  assert.ok(a.near52wHigh > 0 && a.near52wHigh <= 1);
  assert.ok(a.shareAbove40w >= 0 && a.shareAbove40w <= 1);
  assert.ok(a.trendR2_52w >= 0 && a.trendR2_52w <= 1);
  assert.ok(Math.abs(a.rsSpy12_1m - Math.log(closes[116] / closes[68])) < 1e-12);
});

test('forward outcome: observed, cash merger, delisted, censored bounds, immature', () => {
  const p = { closes: [10, 10, 11, 12, 13], cal: [0, 1, 2, 3, 4], lifecycle: null };
  const ob = W.forwardOutcome(p, 0, 2, 10); assert.equal(ob.state, 'OBSERVED'); assert.ok(Math.abs(ob.primary - 0.2) < 1e-12 && ob.minus100 === ob.primary);
  assert.equal(W.forwardOutcome(p, 0, 20, 10).state, 'IMMATURE');
  const cm = { ...p, lifecycle: { status: 'DELISTED_SOURCE_VERIFIED', terminal: { kind: 'CASH_MERGER', cashPerShare: 15 } } };
  const o = W.forwardOutcome(cm, 0, 6, 10); assert.equal(o.state, 'TERMINAL_CONSIDERATION'); assert.ok(Math.abs(o.primary - 0.5) < 1e-12);
  const dn = { ...p, lifecycle: { terminal: { kind: 'DELISTED_NO_CONSIDERATION' } } };
  assert.equal(W.forwardOutcome(dn, 0, 6, 10).primary, -1);
  const un = W.forwardOutcome({ ...p, lifecycle: { status: 'FROZEN_TAIL_UNSOURCED_CENSORED', terminal: { kind: 'UNKNOWN' } } }, 0, 6, 10);
  assert.equal(un.state, 'CENSORED'); assert.ok(Math.abs(un.primary - 0.3) < 1e-12); assert.equal(un.minus100, -1);
  assert.equal(W.forwardOutcome(p, 4, 1, 10).state, 'NO_ENTRY_BAR');
});

test('rate phase thresholds and subperiods', () => {
  assert.equal(W.ratePhase(0.5), 'RISING'); assert.equal(W.ratePhase(-0.5), 'FALLING'); assert.equal(W.ratePhase(0.2), 'FLAT'); assert.equal(W.ratePhase(null), 'RATE_UNAVAILABLE');
  assert.equal(W.subperiodOf('2016-03-24'), '2013-2019');
});

test('committed registration and amendment hashes match their content', () => {
  const reg = JSON.parse(fs.readFileSync(new URL('../../docs/quant-recovery/v11/winners/registration-1.0.0.json', import.meta.url)));
  assert.equal(V.hash(reg.registration), reg.registrationHash);
  assert.equal(reg.registrationHash, V.hash(REG.registration));
  const am = JSON.parse(fs.readFileSync(new URL('../../docs/quant-recovery/v11/winners/registration-amendment-1.0.1.json', import.meta.url)));
  assert.equal(V.hash(am.amendment), am.amendmentHash);
  assert.equal(am.amendment.amends.registrationHash, reg.registrationHash);
  assert.equal(reg.registration.protocol.sha256, fs.readFileSync(new URL('../../docs/quant-recovery/v11/protocol/time-split-1.0.0.sha256', import.meta.url), 'utf8').split(/\s+/)[0]);
});
