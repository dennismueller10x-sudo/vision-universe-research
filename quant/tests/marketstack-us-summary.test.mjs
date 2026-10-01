import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeUSProbe } from '../../scripts/market/summarize-marketstack-us.mjs';
const eod = (symbol, rows, overrides = {}) => ({ label: 'us-eod', params: { symbols: symbol, date_from: '2026-09-01', date_to: '2026-09-02' },
  ok: true, checkedAt: '2026-10-01T11:00:00Z', data: { pagination: { total: rows.length }, data: rows }, ...overrides });
const bar = (date, extras = {}) => ({ date, symbol: 'AAA', exchange: 'XNAS', price_currency: 'USD', asset_type: 'Stock',
  open: 100, high: 102, low: 99, close: 101, volume: 1000, adj_open: 100, adj_high: 102, adj_low: 99, adj_close: 101,
  adj_volume: 1000, split_factor: 1, dividend: 0, ...extras });
const ref = (basis = 'RAW_OHLC') => ({ securityId: 'ref_AAA', mic: 'XNAS', currency: 'USD', basis, source: 'fixture',
  bars: [{ date: '2026-09-01', open: 100, high: 102, low: 99, close: 101, volume: 1000, adjustedClose: 101, splitFactor: 1, dividend: 0 },
    { date: '2026-09-02', open: 100, high: 102, low: 99, close: 101, volume: 1000, adjustedClose: 101, splitFactor: 1, dividend: 0 }] });
test('Actual provider metadata disagreements quarantine the entire series even when price numbers agree', () => {
  const result = summarizeUSProbe({ endpoints: [eod('AAA', [bar('2026-09-01'), bar('2026-09-02', { price_currency: 'EUR' })])] }, { resolveReference: () => ref() });
  assert.equal(result.measurements[0].status, 'IDENTITY_BLOCKED');
  assert.equal(result.measurements[0].acceptedBars, 1);
  assert.equal(result.measurements[0].comparison.seriesRoutable, false);
  assert.equal(result.measurements[0].anomalies[0].reason, 'currencyMismatch');
  assert.deepEqual(result.measurements[0].comparison.missingCandidateDates, ['2026-09-02']);
});
test('Adjusted observations are reported diagnostically without upgrading normalized trust', () => {
  const result = summarizeUSProbe({ endpoints: [eod('AAA', [bar('2026-09-01', { adj_open: 90, adj_high: 92, adj_low: 89, adj_close: 90 })])] }, { resolveReference: () => ref() });
  const diagnostic = result.measurements[0].adjustedDiagnostic;
  assert.equal(diagnostic.trust, 'UNVERIFIED_OBSERVATION_ONLY');
  assert.equal(diagnostic.canonicalAdjustedClosePopulated, false);
  assert.equal(diagnostic.materialDifferences.length, 1);
  assert.ok(result.measurements[0].comparison.unavailable.some(r => r.field === 'adjustedClose'));
});
test('Split-adjusted discover data cannot prove raw OHLC or total-return equivalence', () => {
  const result = summarizeUSProbe({ endpoints: [eod('AAA', [bar('2026-09-01')])] }, { resolveReference: () => ref('SPLIT_ADJUSTED_CLOSE') });
  assert.equal(result.summary.rawDatesCompared, 0);
  assert.equal(result.summary.diagnosticDatesCompared, 1);
  assert.equal(result.measurements[0].comparison.adjustmentEquivalenceVerified, false);
  assert.equal(result.measurements[0].adjustedDiagnostic, null);
});
test('Empty results, unknown references and duplicate candles remain explicit limitations', () => {
  const result = summarizeUSProbe({ endpoints: [eod('EMPTY', []), eod('UNKNOWN', [bar('2026-09-01')]),
    eod('AAA', [bar('2026-09-01'), bar('2026-09-01')])] }, { resolveReference: symbol => symbol === 'UNKNOWN' ? null : ref() });
  assert.equal(result.summary.symbolsAttempted, 3);
  assert.deepEqual(result.summary.emptySymbols, ['EMPTY']);
  assert.equal(result.measurements[1].status, 'REFERENCE_UNAVAILABLE');
  assert.equal(result.measurements[2].status, 'QUALITY_PARTIAL');
  assert.equal(result.measurements[2].acceptedBars, 1);
});
test('Pre-split OHLC or volume already adjusted alongside split factors blocks basis-sensitive routing', () => {
  const source = ref(); source.bars[0] = { ...source.bars[0], open: 400, high: 408, low: 396, close: 404 };
  source.bars[1] = { ...source.bars[1], splitFactor: 4 };
  const result = summarizeUSProbe({ endpoints: [eod('AAA', [bar('2026-09-01', { volume: 4000 }),
    bar('2026-09-02', { split_factor: 4 })], { label: 'corporate-action-window' })] }, { resolveReference: () => source });
  const row = result.measurements[0];
  assert.ok(row.splitBasisReview.some(r => r.reason === 'PROVIDER_RAW_PRICE_APPEARS_ALREADY_SPLIT_ADJUSTED'));
  assert.ok(row.splitBasisReview.some(r => r.reason === 'PROVIDER_RAW_VOLUME_APPEARS_ALREADY_SPLIT_ADJUSTED'));
  assert.equal(row.comparison.seriesRoutable, false);
});
test('Qualified follow-up remains separate and preserves explicit currency quarantine', () => {
  const result = summarizeUSProbe({ endpoints: [eod('AAA', [bar('2026-09-01')]),
    eod('AAA', [bar('2026-09-01', { price_currency: 'ARS' })], { label: 'us-qualified-eod' })] }, { resolveReference: () => ref() });
  assert.equal(result.summary.symbolsAttempted, 1);
  assert.equal(result.qualifiedSummary.symbolsAttempted, 1);
  assert.equal(result.qualifiedSummary.statusCounts.IDENTITY_BLOCKED, 1);
  assert.equal(result.qualifiedSummary.rejectedIdentityRows, 1);
});
