// Source-faithful Minervini SEPA / VCP (C06) and Power Play (C07): translation-only thresholds (#709 B12 MEDIUM,
// REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION), screens emit review records only, no fundamental gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { trendTemplate, rsProxy, vcpEvidence, stopCheck, sepaScreen, powerPlayScreen, MIN_PARAMS } from '../source-faithful/methods/minervini.mjs';

const day = (k) => new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bars = (closes, { range = 0.01, volume = 1e5 } = {}) => closes.map((c, k) => ({ date: day(k), open: c, high: c * (1 + range), low: c * (1 - range), close: c, volume }));
// steady uptrend over 300 sessions: every Trend Template criterion holds at the end
const uptrend = (n = 300) => Array.from({ length: n }, (_, k) => 50 + k * 0.2);

test('GC-MIN-TT-1 / GC-MIN-TT-2 / GC-MIN-TT-3 / GC-MIN-TT-4 / GC-MIN-TT-5 / GC-MIN-TT-6 / GC-MIN-TT-7: each Trend Template criterion 1-7 as printed, translation-unverified', () => {
  const b = bars(uptrend()), i = b.length - 1, t = trendTemplate(b, i);
  assert.equal(t.pass, true);
  assert.equal(t.translationUnverified, true);
  assert.equal(t.clearance, 'REQUIRES_ORIGINAL_OR_EXPLICIT_WEB_CORROBORATION');
  // each criterion fails on its own counter-example
  const flip = (closes) => trendTemplate(bars(closes), closes.length - 1).criteria;
  const drop = [...uptrend(299), 50 + 298 * 0.2 * 0.6];              // close falls below MA50 / MA150 / MA200
  assert.equal(flip(drop)['MIN-SF-TT-5'], false);
  assert.equal(flip(drop)['MIN-SF-TT-1'], false);
  const down = Array.from({ length: 300 }, (_, k) => 200 - k * 0.3);   // MA order and MA200 slope inverted
  const c = flip(down);
  assert.equal(c['MIN-SF-TT-2'], false); assert.equal(c['MIN-SF-TT-3'], false); assert.equal(c['MIN-SF-TT-4'], false);
  const nearLow = [...Array.from({ length: 299 }, () => 100), 120];   // +20 % above the 52-week low < 30 %
  assert.equal(flip(nearLow)['MIN-SF-TT-6'], false);
  const farBelowHigh = [...Array.from({ length: 200 }, () => 200), ...Array.from({ length: 100 }, () => 140)]; // -30 % < -25 %
  assert.equal(flip(farBelowHigh)['MIN-SF-TT-7'], false);
  assert.equal(MIN_PARAMS.aboveLow, 0.30); assert.equal(MIN_PARAMS.belowHigh, 0.25); assert.equal(MIN_PARAMS.ma200RisingSessions, 21);
});

test('SF-MIN-IPO-SCOPE: less history than the Trend Template needs is IPO scope, not a failure (MIN-MM-IPO-01)', () => {
  assert.equal(trendTemplate(bars(uptrend(100)), 99).status, 'INSUFFICIENT_HISTORY_IPO_SCOPE');
});

test('GC-MIN-RS-PROXY-NOT-GATE: IBD RS is DATA_BLOCKED; a VU percentile is a proxy and never a gate (MIN-TT-08)', () => {
  assert.equal(rsProxy(12).gate, false);
  assert.equal(rsProxy(12).status, 'DATA_BLOCKED_IBD_RS');
  // a weak proxy does not remove a Trend Template candidate
  assert.equal(sepaScreen({ id: 'X', bars: bars(uptrend()) }, { vuRsPercentile: 5 }).length, 1);
});

test('GC-MIN-SEPA-CANDIDATE: Trend Template 1-7 -> one review record with manual relative priority (MIN-PROCESS-01, MIN-PROCESS-04)', () => {
  const [r] = sepaScreen({ id: 'X', bars: bars(uptrend()) });
  assert.equal(r.status, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(r.buyDeclarationAllowed, false);
  assert.ok(r.openQuestions.some((q) => q.flag === 'MIN-MR-PRIORITY'));
  assert.deepEqual(sepaScreen({ id: 'X', bars: bars(Array.from({ length: 300 }, (_, k) => 200 - k * 0.3)) }), []);
});

test('GC-MIN-SEPA-NO-FUNDAMENTAL-GATE: the screen has no EPS / sales input; fundamentals are review questions (MIN-PROCESS-15, MIN-EPS-02)', () => {
  assert.equal(sepaScreen.length, 1);
  const [r] = sepaScreen({ id: 'X', bars: bars(uptrend()), fund: { eps: [-1, -2, -3] } });
  assert.equal(r.status, 'MANUAL_REVIEW_REQUIRED');
  assert.doesNotMatch(JSON.stringify(r.machineScreenEvidence), /eps|revenue|sales/i);
});

test('GC-MIN-VCP-EVIDENCE-NOT-GATE: VCP footprint is reported as evidence; a non-contracting base is still reviewed (MIN-VCP-02/03)', () => {
  const v = vcpEvidence(bars(uptrend()), 299);
  assert.equal(v.status, 'EVIDENCE_ONLY');
  const [r] = sepaScreen({ id: 'X', bars: bars(uptrend()) });
  assert.equal(r.machineScreenEvidence.find((e) => e.ruleId === 'MIN-SF-VCP').value.status, 'EVIDENCE_ONLY');
});

test('GC-MIN-STOP-10PCT-FLAG: a reviewer stop wider than 10 % is flagged, never auto-set (MIN-MM-STOP-02, MIN-RISK-01)', () => {
  assert.equal(stopCheck(100, 92).exceedsMaxPlannedLoss, false);
  assert.equal(stopCheck(100, 89).exceedsMaxPlannedLoss, true);
  assert.equal(stopCheck(100, null).flag, 'STOP_REQUIRED_BEFORE_ENTRY');
});

// Power Play: 60 flat sessions at 10, run to 21 within 20 sessions, then a consolidation
const pp = (cons) => [...Array.from({ length: 60 }, () => 10), ...Array.from({ length: 20 }, (_, k) => 10 + (k + 1) * 0.55), ...cons];

test('GC-MIN-PP-CANDIDATE: +100 % in under eight weeks, consolidation within 10 % -> TIGHT review record (MIN-PP-02/05, MIN-PP-01)', () => {
  const [r] = powerPlayScreen({ id: 'X', bars: bars(pp(Array.from({ length: 15 }, () => 20.5)), { range: 0.005 }) });
  assert.equal(r.status, 'MANUAL_REVIEW_REQUIRED');
  const run = r.machineScreenEvidence.find((e) => e.ruleId === 'MIN-SF-PP-RUNUP').value;
  assert.ok(run.multiple >= 2 && run.sessions < 40);
  assert.equal(r.machineScreenEvidence.find((e) => e.ruleId === 'MIN-SF-PP-TIGHT').value.status, 'TIGHT');
});

test('GC-MIN-PP-SLOW-RUN: +100 % over 40 or more sessions is not a Power Play (MIN-PP-02)', () => {
  const slow = [...Array.from({ length: 60 }, () => 10), ...Array.from({ length: 60 }, (_, k) => 10 + (k + 1) * 0.19), ...Array.from({ length: 10 }, () => 21)];
  assert.deepEqual(powerPlayScreen({ id: 'X', bars: bars(slow, { range: 0.005 }) }), []);
});

test('GC-MIN-PP-DEEP-CORRECTION: a correction over 25 % is no record (MIN-PP-04 outer bound)', () => {
  assert.deepEqual(powerPlayScreen({ id: 'X', bars: bars(pp([...Array.from({ length: 5 }, () => 20), 15, 16]), { range: 0.005 }) }), []);
});

test('GC-MIN-PP-CORRECTION-RANGE-FLAG: a correction in (20 %, 25 %] is kept and flagged for review (MIN-PP-04 printed range)', () => {
  const [r] = powerPlayScreen({ id: 'X', bars: bars(pp([...Array.from({ length: 5 }, () => 20), 16.6, 17]), { range: 0.005 }) });
  const c = r.machineScreenEvidence.find((e) => e.ruleId === 'MIN-SF-PP-CORRECTION').value;
  assert.ok(c.correction > 0.2 && c.correction <= 0.25);
  assert.equal(c.inPrintedRange20to25, true);
  assert.ok(r.openQuestions.some((q) => q.flag === 'MIN-MR-PP-CORR'));
});

test('GC-MIN-PP-WIDE-REVIEW: a correction between 10 % and 20 % needs VCP characteristics -> review (MIN-PP-05 OR branch)', () => {
  const [r] = powerPlayScreen({ id: 'X', bars: bars(pp([...Array.from({ length: 5 }, () => 20), 18.4, 19]), { range: 0.005 }) });
  assert.equal(r.machineScreenEvidence.find((e) => e.ruleId === 'MIN-SF-PP-TIGHT').value.status, 'VCP_CHARACTERISTICS_REVIEW');
});

test('GC-MIN-PP-SHORT-CONSOLIDATION: no minimum consolidation length - a twelve-session base is screened (MIN-PP-03)', () => {
  const [r] = powerPlayScreen({ id: 'X', bars: bars(pp(Array.from({ length: 12 }, () => 20.5)), { range: 0.005 }) });
  assert.equal(r.machineScreenEvidence.find((e) => e.ruleId === 'MIN-SF-PP-DURATION').value.consolidationSessions, 12);
});

test('SF-MIN-TEMPORAL: the Trend Template on bar i ignores later bars', () => {
  const a = bars([...uptrend(), 1, 1]);
  assert.deepEqual(trendTemplate(a, 299), trendTemplate(bars(uptrend()), 299));
});

test('SF-MIN-PP-NEWER-PEAK: an older higher peak does not hide a newer Power Play; a very long base gets a review question (review SF-R2-01 / SF-R2-03)', () => {
  const older = [...Array.from({ length: 60 }, () => 10), ...Array.from({ length: 20 }, (_, k) => 10 + (k + 1) * 0.5), ...Array.from({ length: 10 }, (_, k) => 20 - (k + 1) * 1.01)];
  const newer = [...Array.from({ length: 20 }, (_, k) => 9.9 + (k + 1) * 0.5), ...Array.from({ length: 10 }, () => 19.3)];
  const [r] = powerPlayScreen({ id: 'X', bars: bars([...older, ...newer], { range: 0.005 }) });
  assert.ok(r, 'newer Power Play must be found');
  assert.ok(r.machineScreenEvidence.find((e) => e.ruleId === 'MIN-SF-PP-CORRECTION').value.correction < 0.1);
  const long = [...Array.from({ length: 60 }, () => 10), ...Array.from({ length: 20 }, (_, k) => 10 + (k + 1) * 0.55), ...Array.from({ length: 80 }, () => 20.5)];
  const [l] = powerPlayScreen({ id: 'X', bars: bars(long, { range: 0.005 }) });
  assert.ok(l.openQuestions.some((q) => q.flag === 'MIN-MR-PP-LONG-BASE'));
});
