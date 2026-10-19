// Source-faithful Kullamaegi Breakout (C08), Episodic Pivot (C09), Parabolic Short (C10): exact HARD components
// (KK-001, KK-012, KK-027, KK-031, KK-034) and evidence-only preferences; missing data never simulated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adr20, overnightCap, stopMarketFill, breakoutStopCheck, epStopCheck, dailyBreakoutEntry, momentumRanks, breakoutEvidence, kkBreakoutReviewQueue, epGapEvidence, parabolicEvidence } from '../source-faithful/methods/kullamagi.mjs';

const day = (k) => new Date(Date.UTC(2021, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bars = (rows) => rows.map(([o, h, l, c, v = 1e6], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v }));
const quiet = (n, p = 100) => Array.from({ length: n }, () => [p, p * 1.04, p, p * 1.02]); // high / low - 1 = 4 %
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('GC-KK-ADR20: ADR20 = mean of (high / low - 1) x 100 over the 20 sessions before the bar (KK-031)', () => {
  const b = bars([...quiet(20), [100, 120, 100, 110]]);
  assert.ok(close(adr20(b, 20), 4));
  assert.equal(adr20(b, 19), null);
});

test('GC-KK-CAP-30: never more than 30 % of equity in one stock overnight (KK-001)', () => {
  assert.equal(overnightCap(100_000), 30_000);
  assert.equal(overnightCap(0), 0);
});

test('GC-KK-STOP-MARKET-GAP: a stop-market order fills at the open after a gap through the stop (KK-027)', () => {
  assert.deepEqual(stopMarketFill(95, 90), { fill: 90, gapped: true });
  assert.deepEqual(stopMarketFill(95, 99), { fill: 95, gapped: false });
});

test('GC-KK-STOP-ACCEPT: low-of-day stop within one ADR is accepted (KK-012)', () => {
  const r = breakoutStopCheck({ entry: 100, lowOfDay: 97, adrPct: 4 });
  assert.equal(r.status, 'ACCEPT');
  assert.equal(r.stop, 97);
});

test('GC-KK-STOP-REJECT-WIDE / GC-KK-STOP-NO-CLAMP: a stop wider than one ADR rejects the trade and is never tightened (KK-012; #709 false VU clamp)', () => {
  const r = breakoutStopCheck({ entry: 100, lowOfDay: 94, adrPct: 4 });
  assert.equal(r.status, 'REJECT_WIDE_STOP');
  assert.equal(r.stop, 94); // still the low of day, not 96
  const b = bars([...quiet(20), [104, 110, 101, 109]]); // close above level 105, LoD 101 -> 7.3 % > ADR 4 %
  const e = dailyBreakoutEntry(b, 20, 105);
  assert.equal(e.entryBasis, 'BREAKOUT_DAY_CLOSE');
  assert.equal(e.stopCheck.status, 'REJECT_WIDE_STOP');
  assert.equal(dailyBreakoutEntry(b, 20, 110).status, 'NO_DAILY_BREAKOUT');
});

test('GC-KK-MOMENTUM-RANK-NOT-GATE: 1 / 3 / 6-month percentiles order the review queue and exclude nothing (KK-005, KK-048)', () => {
  const mk = (id, slope) => ({ id, bars: bars(Array.from({ length: 130 }, (_, k) => { const p = 50 + slope * k; return [p, p * 1.02, p * 0.99, p]; })) });
  const secs = [mk('FLAT', 0), mk('FAST', 0.5), mk('SLOW', 0.1), mk('DOWN', -0.1)];
  const q = kkBreakoutReviewQueue(secs, day(129));
  assert.equal(q.length, 4); // nobody excluded
  assert.deepEqual(q.map((r) => r.securityId), ['FAST', 'SLOW', 'FLAT', 'DOWN']);
  assert.ok(q.every((r) => r.status === 'MANUAL_REVIEW_REQUIRED' && r.buyDeclarationAllowed === false));
  assert.equal(momentumRanks(secs, day(129))[0].p6m, 100);
});

test('GC-KK-SETUP-EVIDENCE: prior move, higher lows, rising MAs and ADR are reported as evidence (KK-006..009)', () => {
  const rows = Array.from({ length: 70 }, (_, k) => { const p = 50 + k; return [p, p * 1.02, p * 0.99, p]; });
  const e = breakoutEvidence(bars(rows), 69);
  assert.ok(e.priorMove.r63 > 0.3);
  assert.equal(e.higherLows, true);
  assert.equal(e.risingMA.ma10, true);
  assert.match(e.conventions, /evidence conventions/);
});

test('GC-KK-EP-STOP-ACCEPT / GC-KK-EP-STOP-REJECT: EP stop = low of day with distance at most 1.5 ADR (KK-034; KK-C1 separate from KK-012)', () => {
  assert.equal(epStopCheck({ entry: 100, lowOfDay: 94.5, adrPct: 4 }).status, 'ACCEPT');        // 5.5 % <= 6 %
  assert.equal(epStopCheck({ entry: 100, lowOfDay: 93.5, adrPct: 4 }).status, 'REJECT_WIDE_STOP'); // 6.5 % > 6 %
  assert.equal(breakoutStopCheck({ entry: 100, lowOfDay: 94.5, adrPct: 4 }).status, 'REJECT_WIDE_STOP'); // breakout limit is 1 ADR
});

test('GC-KK-EP-GAP-EVIDENCE: the 10 % gap is a reference, not a filter; catalyst, early volume and ORH entry are DATA_BLOCKED (KK-015, KK-016, KK-032)', () => {
  const b = bars([...quiet(130), [108, 112, 107, 111, 5e6]]);
  const e = epGapEvidence(b, 130);
  assert.ok(close(e.gap, 108 / 102 - 1));
  assert.equal(e.atLeastTenPercentReference, false); // still reported
  assert.equal(e.catalyst, 'DATA_BLOCKED');
  assert.equal(e.earlyIntradayVolume, 'DATA_BLOCKED');
  assert.ok(e.dailyVolumeVs50d > 4);
});

test('GC-KK-PS-EVIDENCE: accelerating up streak and MA distances are evidence; entry and borrow are DATA_BLOCKED (KK-018, KK-022, KK-030)', () => {
  const b = bars([...quiet(25), [102, 106, 101, 105], [105, 112, 104, 111], [111, 125, 110, 124]]);
  const e = parabolicEvidence(b, 27);
  assert.equal(e.upStreak, 3);
  assert.equal(e.accelerating, true);
  assert.ok(e.distanceToMA10 > 0.1);
  assert.match(e.entry, /DATA_BLOCKED/);
  assert.equal(e.borrow, 'DATA_BLOCKED');
});

test('SF-KK-TEMPORAL: ADR and the stop check of bar i use no later bar', () => {
  const a = bars([...quiet(20), [104, 106, 103, 105], [50, 51, 40, 41]]);
  assert.equal(adr20(a, 20), adr20(a.slice(0, 21), 20));
  assert.deepEqual(dailyBreakoutEntry(a, 20, 104.5), dailyBreakoutEntry(a.slice(0, 21), 20, 104.5));
});
