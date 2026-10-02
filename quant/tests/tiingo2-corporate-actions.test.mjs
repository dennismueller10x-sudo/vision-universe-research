import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { scanCorporateActionSeries } from '../../scripts/market/tiingo2-corporate-action-scan.mjs';
const require = createRequire(import.meta.url);
const Quality = require('../engines/market-quality.js');
const Series = require('../engines/return-series.js');
const Factors = require('../engines/market-factors.js');
const Canonical = require('../engines/technical/canonical-bars.js');

// Constructed prices, no licensed provider bars. The action/return geometry
// reproduces PR346's failure: legitimate split-day returns exceed 15%.
function actionWindow(splitFactor, marketReturn, dividend = 0) {
  const previousClose = 100;
  const cashMultiplier = 1 - dividend / (previousClose / splitFactor);
  const expectedStep = splitFactor / cashMultiplier;
  const nextClose = previousClose / splitFactor * (1 + marketReturn);
  const bar = (date, close, adjustedClose, factor, cash) => ({
    date, close, adjustedClose, splitFactor: factor, dividend: cash,
    open: close, high: close * 1.01, low: close * .99, volume: 1000,
  });
  return [bar('2024-08-19', previousClose, previousClose / expectedStep, 1, 0),
    bar('2024-08-20', nextClose, nextClose, splitFactor, dividend),
    bar('2024-08-21', nextClose * 1.01, nextClose * 1.01, 1, 0)];
}

for (const [ticker, factor, move] of [
  ['DNA', .025, -.176], ['AMC', .1, -.25],
  ['BIRD', .05, -.20], ['AMWL', .05, -.22],
]) test(`${ticker}: reverse split with a genuine >15% market move passes and retains prices`, () => {
  const bars = actionWindow(factor, move);
  const result = Quality.validateAdjustmentConsistency(bars, { claimedStatus: 'TOTAL_RETURN' });
  assert.equal(result.ok, true);
  assert.equal(result.observed.refutedAbove, null);
  assert.equal(result.observed.splitEvidence.length, 1);
  assert.ok(result.observed.splitEvidence[0].adjustedMovePct > 15);
  const gate = Quality.classifyCorporateActions(bars);
  assert.equal(gate.ok, true);
  assert.equal(gate.events[0].status, 'VALID_REVERSE_SPLIT');
  const splitAdjusted = Series.splitAdjustedColumn(bars, 'close');
  assert.ok(Math.abs(splitAdjusted[1] / splitAdjusted[0] - 1 - move) < 1e-12);
  const chart = Canonical.fromPriceBars(bars, [{ type: 'split', exDate: bars[1].date, ratio: factor }], {
    instrumentId: ticker,
  }).SPLIT_ADJUSTED;
  assert.equal(Canonical.validateSeries(chart).valid, true);
  assert.equal(chart.length, bars.length);
  assert.ok(Math.abs(chart.close[1] / chart.close[0] - 1 - move) < 1e-12);
});

test('forward split retains a legitimate volatile market return', () => {
  const bars = actionWindow(4, -.45);
  assert.equal(Quality.validateAdjustmentConsistency(bars, { claimedStatus: 'TOTAL_RETURN' }).ok, true);
  assert.equal(Quality.classifyCorporateActions(bars).events[0].status, 'VALID_SPLIT');
});

test('small fractional share action is reconciled without a 30% raw jump', () => {
  const bars = actionWindow(1.1, .03);
  const gate = Quality.classifyCorporateActions(bars);
  assert.equal(gate.ok, true);
  assert.equal(gate.events[0].status, 'VALID_SHARE_ACTION');
  assert.equal(Quality.validateAdjustmentConsistency(bars, { claimedStatus: 'SPLIT_ADJUSTED' }).ok, true);
  assert.equal(Quality.classifyCorporateActions(actionWindow(1.5, .01)).events[0].status, 'VALID_SPLIT');
  assert.equal(Quality.classifyCorporateActions(actionWindow(1 / 1.5, .01)).events[0].status, 'VALID_REVERSE_SPLIT');
});

test('same-day split and cash dividend use cash in ex-day shares', () => {
  for (const factor of [4, .025]) {
    const bars = actionWindow(factor, -.23, 1);
    assert.equal(Quality.classifyCorporateActions(bars).ok, true);
    assert.equal(Quality.validateAdjustmentConsistency(bars, { claimedStatus: 'TOTAL_RETURN' }).ok, true);
  }
});

test('unadjusted, inverted and slightly wrong split factors remain rejected', () => {
  for (const broken of [
    bars => bars.forEach(b => { b.adjustedClose = b.close; }),
    bars => { bars[1].splitFactor = 40; },
    bars => { bars[1].splitFactor *= 1.01; },
  ]) {
    const bars = actionWindow(.025, -.176); broken(bars);
    const verdict = Quality.validateAdjustmentConsistency(bars, { claimedStatus: 'TOTAL_RETURN' });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.observed.refutedAbove, 'RAW');
    assert.equal(Quality.classifyCorporateActions(bars).status, 'BAD_SERIES');
  }
});

test('unexpected adjustment step is a missing action, not an invented split', () => {
  const bars = actionWindow(4, .01); bars[1].splitFactor = 1;
  const gate = Quality.classifyCorporateActions(bars);
  assert.equal(gate.ok, false);
  assert.equal(gate.status, 'MISSING_PROVIDER_ACTION');
  assert.equal(gate.events[0].reason, 'UNEXPLAINED_ADJUSTMENT_STEP');
  const consistency = Quality.validateAdjustmentConsistency(bars, { claimedStatus: 'TOTAL_RETURN' });
  assert.equal(consistency.ok, false);
  assert.ok(consistency.findings.some(f => f.code === 'unexplained_adjustment_step'));
});

test('a stable-factor large market move is reviewable, not false split evidence', () => {
  const bars = actionWindow(1, -.50);
  const gate = Quality.classifyCorporateActions(bars);
  assert.equal(gate.status, 'SUSPICIOUS_PRICE_BREAK');
  assert.equal(gate.reviewRequired, true);
  assert.equal(gate.events.some(e => e.status.startsWith('VALID')), false);
});

test('missing action evidence and invalid values cannot authorize publication', () => {
  for (const mutate of [b => { delete b[1].splitFactor; }, b => { b[1].adjustedClose = null; },
    b => { b[1].dividend = null; }]) {
    const bars = actionWindow(1, .01); mutate(bars);
    assert.equal(Quality.classifyCorporateActions(bars).status, 'UNKNOWN');
  }
  for (const mutate of [b => { b[1].close = 0; }, b => { b[1].splitFactor = 0; },
    b => { b[1].splitFactor = -1; }, b => { b[1].dividend = -1; },
    b => { b[1].date = b[0].date; }, b => { b[1].adjustedClose = NaN; }]) {
    const bars = actionWindow(1, .01); mutate(bars);
    assert.equal(Quality.classifyCorporateActions(bars).status, 'BAD_SERIES');
  }
  assert.equal(Quality.classifyCorporateActions([]).ok, false);
});

test('rounding tolerance admits float noise and rejects unexplained drift', () => {
  const bars = actionWindow(.025, -.176);
  bars[1].adjustedClose *= 1.0000001;
  assert.equal(Quality.classifyCorporateActions(bars).ok, true);
  bars[1].adjustedClose *= 1.01;
  assert.equal(Quality.classifyCorporateActions(bars).ok, false);
});

test('factor underflow, overflow and NaN fail closed despite finite input prices', () => {
  for (const [close, adjustedClose] of [[1e308, 1e-308], [1e-308, 1e308]]) {
    const bars = actionWindow(1, .01);
    for (const b of bars) { b.close = close; b.adjustedClose = adjustedClose; }
    const gate = Quality.classifyCorporateActions(bars);
    assert.equal(gate.status, 'BAD_SERIES');
    assert.equal(gate.events[0].reason, 'INVALID_FACTOR_EVIDENCE');
    assert.equal(Quality.validateAdjustmentConsistency(bars, { claimedStatus: 'TOTAL_RETURN' }).ok, false);
    bars[1].splitFactor = .025;
    assert.equal(Quality.validateAdjustmentConsistency(bars, { claimedStatus: 'TOTAL_RETURN' }).ok, false);
  }
});

test('DNA geometry reaches real Quant factor computation without erasing the market loss', () => {
  const bars = [];
  for (let i = 0; i < 300; i++) {
    const date = new Date(Date.UTC(2023, 0, 2 + i)).toISOString().slice(0, 10);
    const base = 100 + i * .1;
    const after = i >= 270;
    const close = after ? base / .025 * .824 : base;
    bars.push({ date, close, open: close, high: close, low: close,
      adjustedClose: after ? close : close / .025,
      splitFactor: i === 270 ? .025 : 1, dividend: 0, volume: 1000 });
  }
  assert.equal(Quality.validateAdjustmentConsistency(bars, { claimedStatus: 'TOTAL_RETURN' }).ok, true);
  const result = Factors.computeFactors({ ticker: 'DNA', bars, adjustmentStatus: 'adjusted' }, {
    module: 'quantV2Momentum', benchmark: { id: 'SPY', dates: bars.map(b => b.date),
      closes: bars.map((_, i) => 100 + i * .1), last: bars.at(-1).date },
  });
  assert.equal(result.returnBasis, 'SPLIT_ADJUSTED_PRICE');
  assert.equal(result.fieldStatus.relativeStrength['12M'], 'CALCULATED');
  assert.ok(Number.isFinite(result.values.relativeStrength['12M']));
});

test('systematic scan identifies old false rejects deterministically without exposing price bars', () => {
  const inputs = [
    { ticker: 'DNA', bars: actionWindow(.025, -.176) },
    { ticker: 'AMC', bars: actionWindow(.1, -.25) },
    { ticker: 'CLEAN', bars: actionWindow(4, .01) },
  ];
  const report = scanCorporateActionSeries(inputs);
  assert.deepEqual(report.summary.distinctTickersFixed, ['AMC', 'DNA']);
  assert.equal(report.summary.falseSplitRejectionsFixed, 2);
  assert.deepEqual(report, scanCorporateActionSeries(inputs.toReversed()));
  assert.equal(report.rawPricePublication, false);
  for (const row of report.results) {
    assert.equal('bars' in row, false);
    assert.equal('close' in row, false);
    for (const event of row.events) assert.equal('evidence' in event, false);
  }
});
