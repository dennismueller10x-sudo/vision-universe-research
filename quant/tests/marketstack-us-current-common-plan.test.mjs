import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUSGaps } from '../../scripts/market/classify-marketstack-us-gaps.mjs';
import { inventoryCurrentUSCommonCache } from '../../scripts/market/plan-marketstack-us-current-common.mjs';
const report = entries => ({ asOfDate: '2026-10-01', protectedBaselineSource: { sha256: 'protected' },
  currentCommonEquityGaps: entries.map(([symbol, mic]) => ({ securityId: symbol, ticker: symbol, publicListingMic: mic })),
  rows: entries.map(([symbol, mic]) => ({ securityId: symbol, providerSymbol: symbol, consumer: true,
    expectedMics: [mic], independentCurrentListing: { genuineCommonEquityRoleObserved: true, currentListing: { mic } },
    instrumentClassification: { investigativeType: 'EQUITY_COMMON' }, activeStatus: { baseline: 'ACTIVE' } })) });
const req = (symbol, mic, extra = {}) => ({ endpoint: 'eod/latest', params: { symbols: symbol, exchange: mic }, ok: true,
  data: { pagination: { total: 1 }, data: [[]] }, ...extra });
test('only exact current venue requests satisfy cache; empty and venue-unavailable responses stay observed without global absence', () => {
  const out = inventoryCurrentUSCommonCache(report([['A', 'XNYS'], ['B', 'XNAS'], ['C', 'XNYS']]), [{ endpoints: [
    req('A', 'XNYS'), req('B', 'XNYS'), req('C', 'XNYS', { ok: false, providerErrorType: 'no_valid_symbols_provided' })] }]);
  assert.equal(out.inventory.totals.cachedExactCurrentMic, 2); assert.equal(out.plan.estimatedCredits, 1);
  assert.equal(out.plan.tasks[0].params.symbols, 'B'); assert.equal(out.plan.tasks[0].params.exchange, 'XNAS');
  assert.deepEqual(out.inventory.rows.map(r => r.lastObservedStatus), ['MISSING_LATEST', 'NOT_TESTED', 'NO_VALID_SYMBOLS_FOR_REQUESTED_VENUE']);
  assert.equal(out.inventory.confirmedProviderGloballyUnavailable, 0);
});
test('100-symbol batching and budget deferral preserve exact unique listing targets without overlaps', () => {
  const input = report(Array.from({ length: 205 }, (_, i) => ['A' + String(204 - i).padStart(3, '0'), 'XNAS']));
  const out = inventoryCurrentUSCommonCache(input, [], { maxCredits: 201 });
  assert.deepEqual(out.plan.tasks.map(t => t.conservativeEstimatedCredits), [100, 100, 1]);
  assert.equal(out.plan.deferredListings, 4); const selected = new Set(out.plan.tasks.flatMap(t => t.targets.map(r => r.symbol)));
  assert.equal(selected.size, 201); assert.ok(out.plan.deferred.every(r => !selected.has(r.symbol)));
  assert.ok(out.plan.tasks.every(t => t.maxPages === 1 && t.retries === 0));
});
test('wrong-MIC direct latest bar stays rejected and raw prices cannot enter inventory', () => {
  const out = inventoryCurrentUSCommonCache(report([['A', 'XNYS']]), [{ endpoints: [{ endpoint: 'tickers/A/eod/latest',
    params: { exchange: 'XNYS' }, ok: true, data: { symbol: 'A', exchange: 'XNAS', date: '2026-09-30',
      price_currency: 'USD', open: 99887, high: 99889, low: 99886, close: 99888, volume: 887766 } }] }]);
  assert.equal(out.plan.estimatedCredits, 0); assert.equal(out.inventory.rows[0].lastObservedStatus, 'EXCHANGE_MISMATCH');
  assert.equal(out.inventory.rows[0].observedProviderMicConflict, true);
  assert.ok(!JSON.stringify(out.inventory).includes('99887')); assert.ok(!JSON.stringify(out.inventory).includes('887766'));
});
test('current common subset identity or membership mismatch cannot authorize paid requests', () => {
  const input = report([['A', 'XNYS']]); input.rows[0].consumer = false;
  assert.throws(() => inventoryCurrentUSCommonCache(input, []), /membership or venue disagreement/);
  assert.throws(() => inventoryCurrentUSCommonCache(report([]), [], { maxCredits: 479 }), /max478/);
});

test('emitted task label survives real probe shape into classification without approving price-only identity', () => {
  const input = report([['A', 'XNYS']]), task = inventoryCurrentUSCommonCache(input, []).plan.tasks[0];
  const result = classifyUSGaps({ benchmark: { baselineSource: { sha256: 'protected' }, asOfDate: '2026-10-01', rows: [{
    securityId: 'A', ticker: 'A', providerSymbol: 'A', expectedMics: ['XNYS'], instrumentType: 'EQUITY_COMMON',
    activeStatus: 'ACTIVE', consumer: true, directoryStatus: 'DIRECTORY_ABSENT_COMPLETE' }] },
    listingEvidence: { protectedBaselineSource: { sha256: 'protected' }, rows: [{ securityId: 'A',
      genuineCommonEquityRoleObserved: true, currentListing: { symbol: 'A', mic: 'XNYS', role: 'EQUITY_COMMON' } }] },
    supplementaryProbes: [{ endpoints: [{ ...task, ok: true, data: { pagination: { offset: 0, limit: 1000, count: 1, total: 1 },
      data: [{ symbol: 'A', exchange: 'XNYS', date: '2026-09-30', price_currency: 'USD', asset_type: 'Stock', open: 10, high: 11, low: 9, close: 10, volume: 100 }] } }] }] });
  assert.equal(result.unmatched.currentCommonEquityGaps[0].independentListingLatestStatus, 'VALID_LATEST');
  assert.equal(result.unmatched.totals.independentlyCurrentCommonLatestValidated, 1);
  assert.equal(result.resolved.totals.verifiedIdentityResolved, 0);
  assert.equal(result.resolved.baselineMembershipCoverage.exactPlusIdentityResolvedConsumer, 0);
});
