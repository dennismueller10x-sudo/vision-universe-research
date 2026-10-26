import test from 'node:test';
import assert from 'node:assert/strict';
import { academicMethods, academicPrerequisites, assessAcademicPrerequisites } from '../research/tournament/engines/academic.mjs';
const methods = Object.fromEntries(academicMethods.map((m) => [m.id, m]));
const asOf = '2024-01-31';
function dates(start, end) {
  const result = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) result.push(d.toISOString().slice(0, 10));
  }
  return result;
}
function security(id, bars) { return { id, ticker: id.toUpperCase(), bars }; }
function monthlyMomentum(id, endIndex) {
  return security(id, ['2023-07-31', '2023-08-31', '2023-09-29', '2023-10-31', '2023-11-30', '2023-12-29', '2024-01-31'].map((date, i) => ({ date, close: 999 - i, totalReturnIndex: i === 6 ? endIndex : 100 })));
}
function closeHistory(id, latestClose, otherClose = 100) {
  const ds = dates('2023-01-30', asOf);
  return security(id, ds.map((date, i) => ({ date, close: i === ds.length - 1 ? latestClose : otherClose, high: 99999, totalReturnIndex: 100 })));
}
function weeklyHistory(id, multiplier) {
  const ds = dates('2021-01-29', asOf);
  return security(id, ds.map((date) => ({ date, close: 9, totalReturnIndex: multiplier(date) })));
}

test('academic protocols are deeply frozen and source/operational choices explicit', () => {
  assert.equal(academicMethods.length, 3);
  for (const m of academicMethods) {
    assert.equal(m.fidelity, 'VU_ADAPTATION');
    assert.ok(Object.isFrozen(m.parameters));
    assert.ok(Object.isFrozen(m.rules));
    assert.ok(m.sources.every((s) => s.url.startsWith('https://') && s.locator));
    assert.equal(m.portfolioSemantics.execution, 'NEXT_SESSION_OPEN_BY_RUNNER');
    assert.equal(m.portfolioSemantics.stopLoss, null);
    assert.equal(m.parameters.quantileRounding, 'CEIL');
  }
  assert.throws(() => { methods.cross_sectional_momentum.parameters.formationMonths = 12; }, TypeError);
});

test('JT freezes source six/six no skip, uses total return, ceil decile and explicit cohort weights', () => {
  const input = Array.from({ length: 11 }, (_, i) => monthlyMomentum(`s${String(i).padStart(2, '0')}`, 100 + i));
  const out = methods.cross_sectional_momentum.evaluate({ asOf, securities: input });
  assert.equal(out.status, 'READY');
  assert.deepEqual(out.targets.map((t) => t.id), ['s10', 's09']);
  assert.deepEqual(out.targets.map((t) => t.weight), [0.5, 0.5]);
  assert.ok(Math.abs(out.targets[0].score - 0.1) < 1e-12);
  assert.equal(out.portfolioSemantics.cohortMonths, 6);
  assert.equal(out.portfolioSemantics.cohortCapitalFraction, 1 / 6);
  assert.equal(out.portfolioSemantics.targetWeightScope, 'NEW_COHORT');
  assert.deepEqual(out.targets[0].ruleTrace[0].monthlyEndpointDates, input[10].bars.map((b) => b.date));
  assert.equal(out.rejections.filter((r) => r.code === 'OUTSIDE_SELECTION_QUANTILE').length, 9);
});

test('JT full-month skip is not silently imported; final month contributes to score', () => {
  const x = monthlyMomentum('a', 120), y = monthlyMomentum('b', 110);
  x.bars.at(-2).totalReturnIndex = 50;
  y.bars.at(-2).totalReturnIndex = 180;
  const out = methods.cross_sectional_momentum.evaluate({ asOf, securities: [x, y] });
  assert.equal(out.targets[0].id, 'a');
  assert.equal(methods.cross_sectional_momentum.parameters.skipDays, 0);
});

test('momentum fails without total-return endpoint and missing month; no raw-close substitute', () => {
  const missing = monthlyMomentum('missing', 500);
  delete missing.bars[0].totalReturnIndex;
  const gap = monthlyMomentum('gap', 400);
  gap.bars.splice(2, 1);
  const valid = monthlyMomentum('valid', 110);
  const out = methods.cross_sectional_momentum.evaluate({ asOf, securities: [missing, gap, valid] });
  assert.equal(out.status, 'PARTIAL');
  assert.equal(out.targets[0].id, 'valid');
  assert.ok(out.rejections.some((r) => r.id === 'missing' && r.code === 'MISSING_TOTAL_RETURN'));
  assert.ok(out.rejections.some((r) => r.id === 'gap' && r.code === 'MISSING_MONTHLY_ANCHOR'));
});

test('52-week proximity is a ranking, not an intraday-high or fresh breakout trigger', () => {
  const input = Array.from({ length: 10 }, (_, i) => closeHistory(`h${i}`, 91 + i));
  const out = methods['52_week_high_effect'].evaluate({ asOf, securities: input });
  assert.equal(out.status, 'READY');
  assert.deepEqual(out.targets.map((t) => t.id), ['h9', 'h8', 'h7']);
  assert.equal(out.targets[0].score, 1);
  assert.equal(out.targets[1].score, 0.99);
  assert.equal(out.targets[0].ruleTrace[0].trailingMaximum, 100);
  assert.equal(out.portfolioSemantics.cohortMonths, 6);
  assert.ok(out.targets.every((t) => t.weight === 1 / 3));
});

test('52-week trailing high expires outside the window and missing prices/gaps fail closed', () => {
  const good = closeHistory('good', 80);
  good.bars[0].close = 10000; // Before Jan31 2023 boundary; cannot dominate denominator.
  const broken = closeHistory('broken', 99);
  broken.bars[20].close = null;
  const gap = closeHistory('gap', 99);
  gap.bars = gap.bars.filter((b) => b.date < '2023-06-01' || b.date > '2023-06-30');
  const out = methods['52_week_high_effect'].evaluate({ asOf, securities: [good, broken, gap] });
  assert.equal(out.targets[0].score, 0.8);
  assert.ok(out.rejections.some((r) => r.code === 'MISSING_ADJUSTED_CLOSE'));
  assert.ok(out.rejections.some((r) => r.code === 'HISTORY_GAP'));
});

test('low volatility samples weekly log canonical returns over 3y and chooses bottom decile', () => {
  const stable = weeklyHistory('stable', () => 100);
  const volatile = weeklyHistory('volatile', (date) => 100 * Math.exp(Number(date.slice(8)) % 3 === 0 ? 0.1 : -0.1));
  const out = methods.LOW_VOLATILITY.evaluate({ asOf, securities: [volatile, stable] });
  assert.equal(out.status, 'READY');
  assert.equal(out.targets[0].id, 'stable');
  assert.equal(out.targets[0].score, 0);
  assert.equal(out.targets[0].weight, 1);
  assert.equal(out.targets[0].ruleTrace[0].rawValue, 0);
  assert.ok(out.targets[0].ruleTrace[0].weeklyObservations >= 156);
  assert.equal(out.targets[0].ruleTrace[0].riskFreeSubtraction, false);
  assert.ok(methods.LOW_VOLATILITY.adaptations.some((x) => x.includes('excess log returns')));
  assert.equal(out.portfolioSemantics.targetWeightScope, 'FULL_PORTFOLIO');
});

test('low volatility retains no silent daily/stddev or close-return fallback', () => {
  const missing = weeklyHistory('missing', () => 100);
  for (const b of missing.bars) delete b.totalReturnIndex;
  const gap = weeklyHistory('gap', () => 100);
  gap.bars = gap.bars.filter((b) => b.date < '2022-06-01' || b.date > '2022-06-30');
  const short = weeklyHistory('short', () => 100);
  short.bars = short.bars.filter((b) => b.date >= '2022-01-01');
  const out = methods.LOW_VOLATILITY.evaluate({ asOf, securities: [missing, gap, short] });
  assert.equal(out.status, 'DATA_UNAVAILABLE');
  assert.deepEqual(out.targets, []);
  assert.deepEqual(out.rejections.map((r) => r.code), ['MISSING_TOTAL_RETURN', 'HISTORY_GAP', 'INSUFFICIENT_3Y_HISTORY']);
});

test('future bars never change any score or target and input order cannot break deterministic ties', () => {
  for (const [id, input] of [
    ['cross_sectional_momentum', [monthlyMomentum('b', 110), monthlyMomentum('a', 110)]],
    ['52_week_high_effect', [closeHistory('b', 99), closeHistory('a', 99)]],
    ['LOW_VOLATILITY', [weeklyHistory('b', () => 100), weeklyHistory('a', () => 100)]],
  ]) {
    const original = structuredClone(input);
    const baseline = methods[id].evaluate({ asOf, securities: input });
    const future = structuredClone(input).reverse();
    for (const s of future) s.bars.push({ date: '2025-01-31', close: 1000000, totalReturnIndex: 1000000 });
    const after = methods[id].evaluate({ asOf, securities: future });
    assert.deepEqual(after.targets, baseline.targets);
    assert.equal(after.targets[0].id, 'a');
    assert.deepEqual(input, original);
    assert.ok(after.targets.flatMap((t) => t.ruleTrace).filter((r) => r.endDate).every((r) => r.endDate <= asOf));
  }
});

test('bad context, duplicated identity/date and stale observations are explicit failures', () => {
  assert.equal(methods.LOW_VOLATILITY.evaluate({ asOf: '2024-02-30', securities: [] }).status, 'INVALID_CONTEXT');
  const a = monthlyMomentum('a', 110);
  const d = monthlyMomentum('duplicateDate', 120);
  d.bars.push({ ...d.bars[0] });
  const stale = monthlyMomentum('stale', 500);
  stale.bars.pop();
  const out = methods.cross_sectional_momentum.evaluate({ asOf, securities: [a, a, d, stale] });
  assert.equal(out.status, 'DATA_UNAVAILABLE');
  assert.deepEqual(out.rejections.map((r) => r.code), ['DUPLICATE_ID', 'DUPLICATE_ID', 'DUPLICATE_BAR_DATE', 'STALE_HISTORY']);
});

test('unimplemented academic extensions require certified factor/PIT data; hints never fabricate targets', () => {
  assert.deepEqual(academicPrerequisites.map((m) => m.id), ['residual_momentum', 'industry_momentum', 'value_plus_momentum']);
  const out = assessAcademicPrerequisites({ factors: [{ date: '2024-01-31' }], fundamentals: { arbitrary: true }, securities: [] });
  assert.ok(out.every((x) => x.status === 'DATA_UNAVAILABLE' && x.targets.length === 0));
  assert.ok(out.every((x) => x.requirements.length >= 3 && x.sourceIds.length));
});

test('canonical weekly-volatility oracle: one doubling and reversal have zero mean and known sample variance', () => {
  const x = weeklyHistory('canonical', (date) => date === '2023-06-16' ? 200 : 100);
  const out = methods.LOW_VOLATILITY.evaluate({ asOf, securities: [x] });
  const trace = out.targets[0].ruleTrace[0];
  // Every Friday in the interval, first partial week Jan31-Feb5 2021, and final Jan29-Jan31 2024.
  const numberOfFridays = dates('2021-02-01', asOf).filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 5).length;
  const expectedObservationCount = numberOfFridays + 1;
  assert.equal(trace.weeklyObservations, expectedObservationCount);
  const expected = Math.sqrt(2 * Math.log(2) ** 2 / (expectedObservationCount - 1));
  assert.ok(Math.abs(trace.rawValue - expected) < 1e-12);
});

test('source monthly anchors use month-end, not same day-of-month six months ago', () => {
  const s = security('a', [
    { date: '2023-08-29', totalReturnIndex: 10 },
    { date: '2023-08-31', totalReturnIndex: 100 },
    { date: '2023-09-29', totalReturnIndex: 100 },
    { date: '2023-10-31', totalReturnIndex: 100 },
    { date: '2023-11-30', totalReturnIndex: 100 },
    { date: '2023-12-29', totalReturnIndex: 100 },
    { date: '2024-01-31', totalReturnIndex: 100 },
    { date: '2024-02-29', totalReturnIndex: 110 },
  ]);
  const out = methods.cross_sectional_momentum.evaluate({ asOf: '2024-02-29', securities: [s] });
  assert.equal(out.targets[0].ruleTrace[0].startDate, '2023-08-31');
  assert.ok(Math.abs(out.targets[0].score - 0.1) < 1e-12);
});
