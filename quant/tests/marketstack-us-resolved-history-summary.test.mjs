import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeResolvedUSHistory } from '../../scripts/market/summarize-marketstack-us-resolved-history.mjs';
const resolved = { rows: [{ securityId: 'id', ticker: 'OLD-P-A', acceptedIdentity: { symbol: 'OLD-PA', mic: 'XNYS', identityBasis: 'CLASS_CIK_MIC' } }] };
const bar = extra => ({ symbol: 'OLD-PA', exchange: 'XNYS', date: '2025-01-02', price_currency: 'USD', asset_type: 'Stock',
  open: 99881, high: 99883, low: 99880, close: 99882, volume: 887766, split_factor: 1, dividend: 0, ...extra });
const endpoint = (path, data, extra = {}) => ({ endpoint: path, params: { symbols: 'OLD-PA', exchange: 'XNYS', date_from: '2025-01-01', date_to: '2025-01-31' }, ok: true,
  data: { pagination: { limit: 1000, offset: 0, count: data.length, total: data.length }, data }, ...extra });
test('historical validation does not treat old active dates as stale, while duplicates and invalid candles are gated', () => {
  const out = summarizeResolvedUSHistory(resolved, [{ endpoints: [endpoint('eod', [bar(), bar({ date: '2025-01-03', high: 1 })])] }], '2026-10-01');
  assert.equal(out.rows[0].history.acceptedDates, 1); assert.equal(out.rows[0].history.rejectionsByStatus.INVALID_OHLC, 1);
  assert.equal(out.rows[0].history.rejectionsByStatus.STALE_LATEST_ACTIVE, undefined);
  for (const raw of ['99881', '99883', '887766', '"open":', '"volume":']) assert.ok(!JSON.stringify(out).includes(raw));
});
test('request failure and empty complete action windows retain different meanings, action amounts stay private', () => {
  const out = summarizeResolvedUSHistory(resolved, [{ endpoints: [endpoint('eod', [], { ok: false }), endpoint('splits', []),
    endpoint('dividends', [{ symbol: 'OLD-PA', exchange: 'XNYS', date: '2025-01-02', dividend: 776655 }])] }], '2026-10-01');
  assert.equal(out.rows[0].history.status, 'REQUEST_FAILED'); assert.equal(out.rows[0].splits.status, 'COMPLETE_BOUNDED_WINDOW_RESPONSE');
  assert.equal(out.rows[0].dividends.observations, 1); assert.ok(!JSON.stringify(out).includes('776655'));
  assert.equal(out.totals.fullHistoryOrTiingoEquivalenceClaims, 0);
});

test('bounded coverage rejects offset pages, missing pagination and dates outside a validated request window', () => {
  const partial = endpoint('eod', [bar()]); partial.data.pagination.offset = 100;
  assert.equal(summarizeResolvedUSHistory(resolved, [{ endpoints: [partial] }], '2026-10-01').rows[0].history.status, 'PARTIAL_PAGE');
  delete partial.data.pagination;
  assert.equal(summarizeResolvedUSHistory(resolved, [{ endpoints: [partial] }], '2026-10-01').rows[0].history.complete, false);
  const outside = summarizeResolvedUSHistory(resolved, [{ endpoints: [endpoint('eod', [bar({ date: '2025-02-01' })])] }], '2026-10-01');
  assert.equal(outside.rows[0].history.rejectedRows, 1);
  assert.equal(outside.rows[0].history.acceptedDates, 0);
  const empty = summarizeResolvedUSHistory(resolved, [{ endpoints: [endpoint('eod', [])] }], '2026-10-01');
  assert.equal(empty.rows[0].history.status, 'NO_HISTORY_RETURNED');
  assert.equal(empty.totals.historyBoundedWindowValidated, 0);
});
test('action identity and duplicate dates fail quality validation without publishing amounts', () => {
  const action = { symbol: 'OLD-PA', date: '2025-01-02', exchange: 'XNAS', dividend: 123456 };
  const result = summarizeResolvedUSHistory(resolved, [{ endpoints: [endpoint('dividends', [action, action])] }], '2026-10-01');
  assert.equal(result.rows[0].dividends.status, 'QUALITY_REJECTED_ROWS_PRESENT');
  assert.equal(result.rows[0].dividends.qualityValidated, false);
  assert.equal(result.rows[0].dividends.duplicateDates, 1);
  assert.equal(result.rows[0].dividends.invalidDateOrExchange, 2);
  assert.ok(!JSON.stringify(result).includes('123456'));
});

test('action factor, amount and supplied currency contradictions are gated; absent action identity remains partial', () => {
  for (const action of [{ split_factor: -2 }, { split_factor: 2, currency: 'EUR' }]) {
    const out = summarizeResolvedUSHistory(resolved, [{ endpoints: [endpoint('splits', [{ symbol: 'OLD-PA', exchange: 'XNYS', date: '2025-01-02', ...action }])] }], '2026-10-01');
    assert.equal(out.rows[0].splits.status, 'QUALITY_REJECTED_ROWS_PRESENT');
    assert.equal(out.rows[0].splits.qualityValidated, false);
  }
  const out = summarizeResolvedUSHistory(resolved, [{ endpoints: [endpoint('dividends', [{ symbol: 'OLD-PA', date: '2025-01-02', dividend: 1 }])] }], '2026-10-01');
  assert.equal(out.rows[0].dividends.status, 'PARTIAL_ACTION_METADATA');
  assert.equal(out.rows[0].dividends.currencyState, 'PARTIAL_OR_UNKNOWN');
  assert.equal(out.rows[0].dividends.qualityValidated, false);
});

test('empty dividend endpoint contradicts nonzero EOD action observations without accepting either amount as correct', () => {
  const out = summarizeResolvedUSHistory(resolved, [{ endpoints: [endpoint('eod', [bar({ dividend: 123456 })]), endpoint('dividends', [])] }], '2026-10-01');
  assert.equal(out.rows[0].dividends.status, 'CROSS_ENDPOINT_CONSISTENCY_REJECTED');
  assert.equal(out.rows[0].dividends.qualityValidated, false);
  assert.equal(out.rows[0].dividends.eodObservedEventDates, 1);
  assert.equal(out.rows[0].dividends.eodObservedEventsAbsentFromCompleteEndpoint, 1);
  assert.equal(out.rows[0].dividends.consistencyStatus, 'EOD_OBSERVED_ACTIONS_ABSENT_FROM_COMPLETE_ENDPOINT_RESPONSE');
  assert.equal(out.rows[0].dividends.eodActionAmountsTrusted, false);
  assert.ok(!JSON.stringify(out).includes('123456'));
});
