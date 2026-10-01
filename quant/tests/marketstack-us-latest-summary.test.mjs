import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFullUSLatest } from '../../scripts/market/summarize-marketstack-us-latest.mjs';
import { planFullUSLatest } from '../../scripts/market/benchmark-marketstack-us-latest.mjs';
const directory = () => ({ baselineSource: { sha256: 'baseline-proof' }, directoryComplete: true, allBaselineVenuesCovered: true,
  rows: ['AAA','BBB','CCC'].map((ticker, index) => ({ securityId: 'ref_' + ticker, ticker, providerSymbol: ticker,
    exchange: 'NASDAQ', expectedMics: ['XNAS'], instrumentType: 'EQUITY_COMMON', activeStatus: 'ACTIVE',
    productMember: true, consumer: true, productEligibility: 'ELIGIBLE', status: index === 2 ? 'DIRECTORY_ABSENT_COMPLETE' : 'DIRECTORY_MATCHED',
    directoryListing: index === 2 ? null : { symbol: ticker, mic: 'XNAS', hasEod: true, hasIntraday: false },
    missingClassification: index === 2 ? 'EQUITY_COMMON' : null })) });
const privateResult = input => ({ baselineSource: input.baselineSource, baselineTotal: input.rows.length,
  inputFingerprint: planFullUSLatest(input).fingerprint, today: '2026-10-01', complete: true, limits: { batchSize: 100 },
  budgetUsed: { requestsAttempted: 1, estimatedCreditsConsumed: 2, privateKey: 'never-public' },
  rows: ['AAA','BBB'].map((ticker, index) => ({ securityId: 'ref_' + ticker, ticker, providerSymbol: ticker, mic: 'XNAS', expectedCurrency: 'USD',
    status: index ? 'CURRENCY_MISMATCH' : 'VALID_LATEST', validLatest: !index, tradingDate: index ? null : '2026-09-30',
    normalizedCurrency: index ? null : 'USD', retrievedAt: '2026-10-01T12:00:00Z',
    observation: { marketTimestamp: '2026-09-30T00:00:00+0000', reportedCurrency: index ? 'MXN' : 'USD',
      open: 987654.321, close: 765432.198, volume: 123456789, observedAdjustedClose: 456789.123, privateKey: 'never-public' } })) });

test('Public full-universe result joins latest outcomes and publishes no raw bars or private provider fields', () => {
  const input = directory(), result = summarizeFullUSLatest(input, privateResult(input));
  assert.equal(result.totals.TOTAL_EXISTING_TIINGO, 3);
  assert.equal(result.totals.TOTAL_MARKETSTACK_MATCHED, 2);
  assert.equal(result.totals.TOTAL_MARKETSTACK_MISSING, 1);
  assert.equal(result.totals.TOTAL_VALID_LATEST, 1);
  assert.equal(result.totals.TOTAL_DATA_MISMATCH, 1);
  assert.equal(result.coverage.activeCommonEquities.validLatestPercentOfBaseline, 33.33);
  assert.equal(result.rows[1].latestObservation.reportedCurrency, 'MXN');
  const serialized = JSON.stringify(result);
  for (const forbidden of ['987654.321','765432.198','123456789','456789.123','never-public','"observation"','"open"','"close"','"volume"','"privateKey"'])
    assert.ok(!serialized.includes(forbidden), forbidden);
});
test('Mismatched baseline, duplicate identities or altered venue cannot fabricate completed coverage', () => {
  const input = directory(), original = privateResult(input);
  assert.throws(() => summarizeFullUSLatest(input, { ...original, baselineSource: { sha256: 'other' } }), /baseline/);
  assert.throws(() => summarizeFullUSLatest(input, { ...original, rows: [original.rows[0], original.rows[0]] }), /baseline/);
  assert.throws(() => summarizeFullUSLatest(input, { ...original, rows: [{ ...original.rows[0], mic: 'XNYS' }, original.rows[1]] }), /identity/);
});
test('Partial benchmarks stay partial and unattempted targets do not become data mismatches', () => {
  const input = directory(), original = privateResult(input);
  original.complete = false; original.rows[1] = { ...original.rows[1], status: 'NOT_ATTEMPTED', validLatest: false };
  const result = summarizeFullUSLatest(input, original);
  assert.equal(result.latestBenchmarkComplete, false);
  assert.equal(result.totals.TOTAL_LATEST_TESTED, 1);
  assert.equal(result.totals.TOTAL_DATA_MISMATCH, 0);
  assert.throws(() => summarizeFullUSLatest(input, { ...original, complete: true }), /Incomplete/);
});
