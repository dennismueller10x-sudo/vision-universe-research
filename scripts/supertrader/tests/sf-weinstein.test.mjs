// Source-faithful Weinstein Stage 2 Investor (C04) and Trader (C05): weekly bars, MA30w gate, volume alternatives,
// RS evidence (no RS > 0 gate), separate investor / trader screens, technical-only exits (#709 B09).
import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyBars, ma30w, maGate, volumeAlternatives, relativeStrength, marketEvidence, investorScreen, traderScreen, benchmarkWeekly, baseStart } from '../source-faithful/methods/weinstein.mjs';

const MON = Date.UTC(2018, 0, 1); // a Monday
const dateOf = (w, d) => new Date(MON + (7 * w + d) * 864e5).toISOString().slice(0, 10);
/** weekly spec [open, high, low, close, volume, breakoutDayVolume?] -> five daily bars (high on day 2, low on day 3) */
function daily(spec) {
  const out = [];
  spec.forEach(([o, h, l, c, v, bv], w) => {
    const vd = v / 5, rows = [[o, o, o, o, vd], [o, o, o, o, vd], [o, h, o, o, bv ?? vd], [o, o, l, o, vd], [o, Math.max(o, c), Math.min(o, c), c, vd]];
    rows.forEach(([a, b, cL, d, vol], k) => out.push({ date: dateOf(w, k), open: a, high: b, low: cL, close: d, volume: vol, splitAdj: 1 }));
  });
  return out;
}
const wk = (c, v = 1e5, r = 2) => [c, c + r, c - r, c, v];
const plainMa = (closes, w) => closes.slice(w - 29, w + 1).reduce((a, b) => a + b, 0) / 30;
// Investor scenario: flat 110 (30 w), decline to 100 (5 w), base 101 (30 w), last base weeks 101.5, breakout week 70
function investorSpec({ breakoutVolume = 3e5, breakoutDayVolume, top = 110 } = {}) {
  const s = [];
  for (let w = 0; w < 30; w++) s.push(wk(top));
  for (let k = 1; k <= 5; k++) s.push(wk(top - ((top - 100) * k) / 5));
  for (let w = 35; w < 65; w++) s.push([101, 103, 99, 101, 1e5]);
  for (let w = 65; w < 70; w++) s.push([101.5, 103.5, 99.5, 101.5, 1e5]);
  s.push([101.5, 106, 101, 105.5, breakoutVolume, breakoutDayVolume]); // week 70
  s.push(wk(105.5)); // week 71 completes week 70
  return s;
}
const bench = (n) => benchmarkWeekly(daily(Array.from({ length: n }, () => wk(100))));

test('GC-WEIN-WEEKLY: ISO-week bars from daily bars; the last week is incomplete', () => {
  const w = weeklyBars(daily([[10, 12, 9, 11, 500], [11, 13, 10, 12, 1000]]));
  assert.equal(w.length, 2);
  assert.deepEqual([w[0].open, w[0].high, w[0].low, w[0].close, w[0].volume], [10, 12, 9, 11, 500]);
  assert.equal(w[0].complete, true);
  assert.equal(w[1].complete, false);
});

test('GC-WEIN-MA-BELOW / GC-WEIN-MA-FALLING / GC-WEIN-MA-OK: no long buy below or at a falling MA30w (WEIN-MA)', () => {
  const s = []; for (let w = 0; w < 40; w++) s.push(wk(100 - w)); // falling
  s.push(wk(80)); // sharp up week above the still falling MA
  const weeks = weeklyBars(daily(s)), ma = ma30w(weeks);
  assert.equal(maGate(weeks, ma, 39).reason, 'BUY_PRICE_AT_OR_BELOW_MA30W');
  const up = [...s.slice(0, 40), wk(85)]; const W2 = weeklyBars(daily(up)), M2 = ma30w(W2);
  assert.ok(W2[40].close > M2[40]); // 85 is above the MA (75.3) but below the dropped close (90)
  assert.equal(maGate(W2, M2, 40).reason, 'MA30W_FALLING');
  const r = []; for (let w = 0; w < 40; w++) r.push(wk(50 + w)); const W3 = weeklyBars(daily(r)), M3 = ma30w(W3);
  assert.equal(maGate(W3, M3, 39).pass, true);
  assert.ok(Math.abs(M3[39] - plainMa(r.map((x) => x[3]), 39)) < 1e-9);
});

test('GC-WEIN-INVESTOR-CANDIDATE: early Stage 2 breakout above the base resistance -> review record with buy-stop and proposed stop (WEIN-BUY1, WEIN-ORD, WEIN-STOP1/2)', () => {
  const spec = investorSpec(), d = daily(spec);
  const weeks = weeklyBars(d), ma = ma30w(weeks);
  assert.equal(baseStart(ma, 70), 64);
  const [r] = investorScreen({ id: 'X', bars: d }, { bench: bench(spec.length), week: 70 });
  assert.equal(r.status, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(r.buyDeclarationAllowed, false);
  assert.equal(r.buyStop.resistance, 103.5);
  assert.ok(Math.abs(r.buyStop.level - 103.51) < 1e-9);
  assert.equal(r.proposedStop.level, 99);
  assert.equal(r.proposedStop.decidedByReviewer, true);
  assert.equal(r.asOf, dateOf(70, 2));
});

test('GC-WEIN-INVESTOR-NO-BASE: without a turn of the MA30w (no Stage 1 base) there is no investor candidate', () => {
  const s = []; for (let w = 0; w < 60; w++) s.push(wk(50 + w)); s.push([110, 116, 109, 115, 3e5]); s.push(wk(115));
  assert.deepEqual(investorScreen({ id: 'X', bars: daily(s) }, { week: 60 }), []);
});

test('GC-WEIN-TRADER-CANDIDATE: continuation breakout over the last swing high near a rising MA30w, full position (WEIN-TR-CONT, WEIN-TR-STOP)', () => {
  const s = []; for (let w = 0; w < 55; w++) s.push([50 + 0.5 * w, 51 + 0.5 * w, 49 + 0.5 * w, 50 + 0.5 * w, 1e5]);
  s.push([78, 80, 77, 78, 1e5]); for (let w = 56; w < 59; w++) s.push([77, 79, 75, 77, 1e5]);
  s.push([77, 81, 76.5, 80.5, 3e5]); s.push(wk(80));
  const [r] = traderScreen({ id: 'X', bars: daily(s) }, { week: 59 });
  assert.equal(r.methodId, 'SF_WEINSTEIN_TRADER');
  assert.equal(r.buyStop.resistance, 80);
  assert.equal(r.proposedStop.level, 75);
  assert.equal(r.proposedStop.ruleId, 'WEIN-SF-TR-STOP');
  // the investor screen does not fire here (no MA turn): the methods are separate
  assert.deepEqual(investorScreen({ id: 'X', bars: daily(s) }, { week: 59 }), []);
});

test('GC-WEIN-TRADER-MA-FLAT: a continuation breakout needs a rising MA30w', () => {
  const s = []; for (let w = 0; w < 40; w++) s.push(wk(100)); s.push([100, 104, 99, 100, 1e5]); s.push(wk(100)); s.push(wk(100)); s.push([100, 106, 99, 105, 3e5]); s.push(wk(105));
  assert.deepEqual(traderScreen({ id: 'X', bars: daily(s) }, { week: 43 }), []);
});

test('GC-WEIN-VOL-A: breakout week volume at least twice the mean of the prior four weeks (WEIN-VOL1)', () => {
  const d = daily(investorSpec({ breakoutVolume: 2e5 })), weeks = weeklyBars(d);
  const v = volumeAlternatives(weeks, 70, d, weeks[70].firstIndex + 2);
  assert.equal(v.A.ratio, 2);
  assert.equal(v.A.holds, true);
  assert.equal(v.anyAlternative, true);
});

test('GC-WEIN-VOL-C: daily variant - breakout day volume more than twice the prior five sessions (WEIN-VOL3)', () => {
  const d = daily(investorSpec({ breakoutVolume: 1.1e5, breakoutDayVolume: 5e4 })), weeks = weeklyBars(d);
  const v = volumeAlternatives(weeks, 70, d, weeks[70].firstIndex + 2);
  assert.equal(v.A.holds, false);
  assert.ok(v.C.ratio > 2);
  assert.equal(v.C.holds, true);
});

test('GC-WEIN-VOL-NONE: no alternative holds -> the record is still a review candidate, volume judged manually (WEIN-VOL4)', () => {
  const spec = investorSpec({ breakoutVolume: 1e5 }), d = daily(spec);
  const [r] = investorScreen({ id: 'X', bars: d }, { week: 70 });
  const v = r.machineScreenEvidence.find((e) => e.ruleId === 'WEIN-SF-VOLUME').value;
  assert.equal(v.anyAlternative, false);
  assert.equal(r.status, 'MANUAL_REVIEW_REQUIRED');
});

test('GC-WEIN-RS-BELOW-ZERO-IMPROVING: RS below its zero line but improving is reported, not rejected (WEIN-RSZERO; no RS > 0 gate)', () => {
  const spec = investorSpec({ top: 120 }), d = daily(spec);
  const [r] = investorScreen({ id: 'X', bars: d }, { bench: bench(spec.length), week: 70 });
  const rs = r.machineScreenEvidence.find((e) => e.ruleId === 'WEIN-SF-RS').value;
  assert.equal(rs.belowZero, true);
  assert.equal(rs.improving, true);
  const direct = relativeStrength(weeklyBars(d), bench(spec.length).weeklyClose, 70);
  assert.ok(direct.normalisedLevel < 0);
});

test('GC-WEIN-MARKET-EVIDENCE: SPY 30-week position is evidence only; breadth is DATA_BLOCKED (WEIN-MARKET)', () => {
  const up = Array.from({ length: 40 }, (_, w) => wk(100 + w));
  const b = benchmarkWeekly(daily(up));
  const m = marketEvidence(b.weeks, b.weeks[38].key);
  assert.equal(m.status, 'EVIDENCE_ONLY');
  assert.equal(m.spyAboveMa30w, true);
  assert.match(m.breadth, /DATA_BLOCKED/);
});

test('GC-WEIN-NO-NONTECH-EXIT: the exit policy is technical only (WEIN-SELL4)', () => {
  const spec = investorSpec(), [r] = investorScreen({ id: 'X', bars: daily(spec) }, { week: 70 });
  assert.match(r.exitPolicy.join(' '), /technical only/);
  assert.doesNotMatch(JSON.stringify(r), /dividendExit|taxExit|peExit/);
  assert.ok(r.dataNotAvailableToMachine.some((x) => /WEIN-GROUP/.test(x)));
});

test('SF-WEIN-TEMPORAL: the screen on week w uses no bar after week w', () => {
  const a = investorSpec(), b = [...a.slice(0, 71), wk(10), wk(5)];
  const ra = investorScreen({ id: 'X', bars: daily(a) }, { week: 70 }), rb = investorScreen({ id: 'X', bars: daily(b) }, { week: 70 });
  assert.deepEqual(ra, rb);
});

test('GC-WEIN-BREAKOUT-CROSSES-MA: a Stage 1 -> 2 breakout whose prior close is below a rising MA30w but whose buy-stop is above it is a candidate (WEIN-MA, WEIN-S2; review SF-R1-02)', () => {
  const s = investorSpec();
  // last base week closes below the (rising) MA, the breakout week crosses resistance and the MA
  s[69] = [101.05, 103.5, 99.5, 101.05, 1e5]; // MA30w ~101.07 still rising (drops 101), close just below it
  const d = daily(s), weeks = weeklyBars(d), ma = ma30w(weeks);
  assert.ok(weeks[69].close < ma[69]);
  const [r] = investorScreen({ id: 'X', bars: d }, { week: 70 });
  assert.ok(r, 'breakout through the MA must be reviewed');
  const g = r.machineScreenEvidence.find((e) => e.ruleId === 'WEIN-SF-MA-GATE').value;
  assert.equal(g.pass, true);
  assert.equal(g.priorCloseAboveMa, false);
});
