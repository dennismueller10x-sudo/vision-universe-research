// Supertrader 2.0 Pocket Pivot / BGU completion (sf-morales-kacher-1.1.0): the sell-guide evidence of MOKA12-008 /
// MOKASTOP-001 (10DMA after >= 7 weeks of respect, else 50DMA) under both readings of the MA violation (MOKA-C2).
// Evidence only; no exit is generated. Synthetic bars.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sellGuideEvidence, pocketPivotScreen, buyableGapUpScreen, MOKA_VERSION } from '../source-faithful/methods/morales-kacher.mjs';
import { POCKET_PIVOT } from '../source-faithful/contracts/morales-kacher.mjs';

const day = (k) => new Date(Date.UTC(2022, 0, 3) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, c, { low = c - 0.5, high = c + 0.5, open = c, volume = 1e6 } = {}) => ({ date: day(k), open, high, low, close: c, volume });
const rising = (n) => Array.from({ length: n }, (_, k) => bar(k, 100 + k));

test('SF2-MOKA-VERSION: version and the placeholder rule is gone', () => {
  assert.equal(MOKA_VERSION, 'sf-morales-kacher-1.1.0');
  assert.ok(!POCKET_PIVOT.rules.some((r) => r.status === 'NOT_IMPLEMENTED'));
});

test('GC-MOKA-SELL-GUIDE-RESPECTED: a stock without a 10DMA violation for >= 35 sessions points to the 10DMA under both readings', () => {
  const b = rising(60);
  const e = sellGuideEvidence(b, 59);
  assert.equal(e.minRespectSessions, 35);
  for (const r of ['NEXT_DAY', 'LATER_DAYS']) { assert.equal(e.readings[r].proposedGuide, '10DMA'); assert.equal(e.readings[r].noViolationInHistory, true); }
  assert.equal(e.agree, true);
  const short = sellGuideEvidence(rising(30), 29); // only 21 sessions with a 10DMA
  assert.equal(short.readings.NEXT_DAY.proposedGuide, '50DMA');
});

test('GC-MOKA-SELL-GUIDE-READINGS-DIFFER: an undercut three days after the close below the MA is a violation only for the FAQ reading', () => {
  const b = [...rising(60), bar(60, 150, { low: 149.5 }), bar(61, 158, { low: 150 }), bar(62, 160, { low: 151 }), bar(63, 161, { low: 149 })];
  const e = sellGuideEvidence(b, 63);
  assert.equal(e.readings.NEXT_DAY.noViolationInHistory, true);
  assert.equal(e.readings.NEXT_DAY.proposedGuide, '10DMA');
  assert.equal(e.readings.LATER_DAYS.lastViolationDate, day(63));
  assert.equal(e.readings.LATER_DAYS.proposedGuide, '50DMA');
  assert.equal(e.agree, false);
  // the next-day reading confirms when the very next low undercuts
  const nd = [...rising(60), bar(60, 150, { low: 149.5 }), bar(61, 151, { low: 149 })];
  assert.equal(sellGuideEvidence(nd, 61).readings.NEXT_DAY.lastViolationDate, day(61));
});

test('SF2-MOKA-SELL-GUIDE-CAUSAL: later bars do not change the evidence of an earlier day; records carry it as evidence only', () => {
  const b = [...rising(60), bar(60, 150, { low: 149.5 })];
  const a = sellGuideEvidence(b, 59), c = sellGuideEvidence([...b, bar(61, 100, { low: 90 })], 59);
  assert.deepEqual(a, c);
  // a pocket pivot record: up day with volume above the largest down-day volume
  const pp = rising(60); pp[55] = bar(55, 150, { volume: 2e6 }); pp.push(bar(60, 162, { volume: 3e6 }));
  const rec = pocketPivotScreen({ id: 'X', bars: pp }, { asOfIndex: 60 });
  assert.equal(rec.length, 1);
  assert.ok(rec[0].machineScreenEvidence.some((x) => x.ruleId === 'MOKA-SF-EXIT-GUIDE-EVIDENCE'));
  assert.equal(rec[0].buyDeclarationAllowed, false);
  const gap = rising(60); gap.push(bar(60, 175, { open: 172, low: 171, high: 176, volume: 5e6 }));
  const g = buyableGapUpScreen({ id: 'Y', bars: gap }, { asOfIndex: 60 });
  assert.equal(g.length, 1);
  assert.ok(g[0].machineScreenEvidence.some((x) => x.ruleId === 'MOKA-SF-EXIT-GUIDE-EVIDENCE'));
});

test('SF2-MOKA-READINGS-NESTED: every next-day violation is also a later-days violation; a recovered stock can violate again (review R1-04)', () => {
  // first close below the MA undercut much later, then recovery, then a second close below undercut the next day
  const b = [...rising(60), bar(60, 150, { low: 149.5 }), bar(61, 158, { low: 150 }), bar(62, 162, { low: 160 })];
  for (let k = 63; k < 80; k++) b.push(bar(k, 160 + (k - 62), { low: 159.5 + (k - 62) }));
  b.push(bar(80, 165, { low: 164.5 }), bar(81, 166, { low: 164 }));
  const e = sellGuideEvidence(b, 81);
  assert.equal(e.readings.NEXT_DAY.lastViolationDate, day(81));
  assert.equal(e.readings.LATER_DAYS.lastViolationDate, day(81));
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 30; t++) {
    let c = 100; const s = []; for (let k = 0; k < 150; k++) { c *= 1 + (rnd() - 0.48) * 0.05; s.push(bar(k, c, { low: c * (1 - rnd() * 0.03) })); }
    const x = sellGuideEvidence(s, 149);
    assert.ok(x.readings.LATER_DAYS.respectedSessions <= x.readings.NEXT_DAY.respectedSessions, JSON.stringify(x.readings));
  }
});
