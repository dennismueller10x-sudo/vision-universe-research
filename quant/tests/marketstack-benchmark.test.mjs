import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUSBenchmark, comparePriceSeries } from '../../scripts/market/benchmark-marketstack-us.mjs';

const security = (ticker, exchange = 'NASDAQ', overrides = {}) => ({ ticker,
  securityId: 'ref_' + ticker, exchange, instrument_type: 'EQUITY_COMMON',
  active_status: 'ACTIVE', product_eligibility: 'ELIGIBLE', ...overrides });
const catalog = rows => ({ rows });

test('US benchmark requires symbol AND MIC and preserves excluded baseline securities', () => {
  const result = buildUSBenchmark({ decisions: [security('SAME'), security('PREF', 'NYSE', {
    instrument_type: 'PREFERRED', product_eligibility: 'EXCLUDED' })] },
  catalog([{ symbol: 'SAME', mic: 'XNAS' }, { symbol: 'SAME', mic: 'XPAR' }, { symbol: 'PREF', mic: 'XNYS' }]));
  assert.equal(result.totals.TOTAL_EXISTING_TIINGO, 2);
  assert.equal(result.totals.TOTAL_MARKETSTACK_MATCHED, 2);
  assert.equal(result.subsets.product.total, 1);
  assert.equal(result.rows.find(r => r.ticker === 'PREF').consumer, false);
  assert.equal(result.rows.find(r => r.ticker === 'SAME').matchedListing.mic, 'XNAS');
  assert.equal(result.totals.TOTAL_DATA_MISMATCH, null);
  assert.equal(result.requests.authenticatedProviderRequests, 0);
});

test('Symbol variants, unrelated exchanges, catalog absence and unknown venues are separate review states', () => {
  const result = buildUSBenchmark({ decisions: [security('BRK-B', 'NYSE'), security('DUAL'),
    security('MISSING'), security('ODD', 'UNVERIFIED')] }, catalog([
    { symbol: 'BRK.B', mic: 'XNYS' }, { symbol: 'DUAL', mic: 'XPAR' }, { symbol: 'ODD', mic: 'XNAS' }]));
  assert.deepEqual(result.rows.map(r => r.status), ['SYMBOL_VARIANT_REVIEW', 'EXCHANGE_MISMATCH', 'CATALOG_ABSENT', 'EXCHANGE_UNRESOLVED']);
  assert.equal(result.totals.TOTAL_MARKETSTACK_MATCHED, 0);
  assert.equal(result.totals.TOTAL_SYMBOL_MISMATCH, 1);
  assert.equal(result.totals.TOTAL_EXCHANGE_MISMATCH, 1);
});

test('Duplicate catalog rows do not create duplicate listings; multiple valid venues remain ambiguous', () => {
  const result = buildUSBenchmark({ decisions: [security('ABC', 'NYSE', { mic: 'XNYS' })] },
    catalog([{ symbol: 'ABC', mic: 'XNYS' }, { symbol: 'ABC', mic: 'XNYS' }]));
  assert.equal(result.source.duplicateCatalogRows, 1);
  assert.equal(result.totals.TOTAL_MARKETSTACK_MATCHED, 1);
  assert.throws(() => buildUSBenchmark({ decisions: [security('ABC'), security('ABC')] }, catalog([{ symbol: 'ABC', mic: 'XNAS' }])), /Duplicate baseline/);
  assert.throws(() => buildUSBenchmark({ decisions: [security('ABC')] }, catalog([{ symbol: 'ABC' }])), /MIC/);
});

test('Price comparison allows reasonable differences and flags material discrepancies and missing dates', () => {
  const reference = { listingId: 'same', currency: 'USD', bars: [{ date: '2026-09-01', close: 100, volume: 1000 }, { date: '2026-09-02', close: 101 }] };
  const candidate = { listingId: 'same', currency: 'USD', bars: [{ date: '2026-09-01', close: 100.1, volume: 1200 }] };
  const result = comparePriceSeries(reference, candidate);
  assert.equal(result.datesCompared, 1);
  assert.deepEqual(result.missingCandidateDates, ['2026-09-02']);
  assert.deepEqual(result.discrepancies.map(r => r.field), ['volume']);
  assert.ok(result.unavailable.some(r => r.field === 'adjustedClose'));
  assert.equal(result.adjudication, 'FLAG_ONLY_NO_AUTOMATIC_OVERWRITE');
  assert.throws(() => comparePriceSeries(reference, { ...candidate, currency: 'EUR' }), /currency/);
  assert.throws(() => comparePriceSeries({ ...reference, listingId: 'x' }, { ...candidate, listingId: 'y' }), /listing/);
  assert.throws(() => comparePriceSeries(reference, { ...candidate, bars: [...candidate.bars, ...candidate.bars] }), /duplicate/);
  assert.throws(() => comparePriceSeries(reference, { ...candidate, bars: [{ date: '2026-02-30', close: 100 }] }), /Invalid/);
  assert.throws(() => comparePriceSeries({ ...reference, listingId: null }, { ...candidate, listingId: null }), /identity/);
  assert.equal(comparePriceSeries({ ...reference, listingId: null, securityId: 'ref_A', mic: 'XNAS' },
    { ...candidate, listingId: null, securityId: 'ref_A', mic: 'XNAS' }).datesCompared, 1);
  assert.throws(() => comparePriceSeries({ ...reference, listingId: null, securityId: 'ref_A', mic: 'XNAS' },
    { ...candidate, listingId: null, securityId: 'ref_A', mic: 'XPAR' }), /identity/);
});
