import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planFullUSLatest, evaluateLatestObservation, runFullUSLatest } from '../../scripts/market/benchmark-marketstack-us-latest.mjs';
const row = (symbol, overrides = {}) => ({ status: 'DIRECTORY_MATCHED', securityId: 'ref_' + symbol, ticker: symbol,
  providerSymbol: symbol, expectedMics: ['XNAS'], directoryListing: { symbol, mic: 'XNAS', metadataConflict: false },
  instrumentType: 'EQUITY_COMMON', activeStatus: 'ACTIVE', productMember: true, consumer: true, ...overrides });
const diff = rows => ({ baselineSource: { sha256: 'baseline-proof' }, rows, totals: { TOTAL_EXISTING_TIINGO: rows.length } });
const observation = (symbol, overrides = {}) => ({ symbol, exchange: 'XNAS', price_currency: 'USD', asset_type: 'Stock',
  date: '2026-09-30T00:00:00+0000', open: 100, high: 102, low: 99, close: 101, volume: 1000,
  adj_open: 100, adj_high: 102, adj_low: 99, adj_close: 101, adj_volume: 1000, split_factor: 1, dividend: 0, ...overrides });
const fixture = fn => { const dir = mkdtempSync(join(tmpdir(), 'vu-ms-us-latest-')); return Promise.resolve(fn(join(dir, 'private.json'))).finally(() => rmSync(dir, { recursive: true, force: true })); };
const factory = (reply, calls) => options => {
  let requestsAttempted = 0, estimatedCreditsConsumed = 0;
  return { async paginate(endpoint, params, settings) {
    const symbols = params.symbols.split(','); calls.push({ endpoint, params, settings, symbols });
    requestsAttempted++; estimatedCreditsConsumed += symbols.length;
    options.onAttempt({ requestsAttempted, estimatedCreditsConsumed });
    return reply(symbols, params, calls.length);
  } };
};

test('Latest price identity, freshness, impossible OHLC and duplicate distinctions are meaningful gates', () => {
  const target = planFullUSLatest(diff([row('AAA')])).targets[0];
  assert.equal(evaluateLatestObservation(target, observation('AAA'), '2026-10-01').status, 'VALID_LATEST');
  assert.equal(evaluateLatestObservation(target, observation('AAA', { price_currency: 'usd' }), '2026-10-01').currencyCaseNormalized, true);
  assert.equal(evaluateLatestObservation(target, observation('AAA', { price_currency: 'MXN' }), '2026-10-01').status, 'CURRENCY_MISMATCH');
  assert.equal(evaluateLatestObservation(target, observation('AAA', { price_currency: null }), '2026-10-01').status, 'MISSING_PROVIDER_CURRENCY');
  assert.equal(evaluateLatestObservation(target, observation('AAA', { exchange: 'XNYS' }), '2026-10-01').status, 'EXCHANGE_MISMATCH');
  assert.equal(evaluateLatestObservation(target, observation('AAA', { high: 98 }), '2026-10-01').status, 'INVALID_OHLC');
  assert.equal(evaluateLatestObservation(target, observation('AAA', { date: '2026-10-02' }), '2026-10-01').status, 'FUTURE_DATE');
  assert.equal(evaluateLatestObservation(target, observation('AAA', { date: '2026-09-20' }), '2026-10-01').status, 'STALE_LATEST_ACTIVE');
  assert.equal(evaluateLatestObservation({ ...target, activeStatus: 'INACTIVE' }, observation('AAA', { date: '2026-09-20' }), '2026-10-01').validLatest, true);
});

test('Per-MIC requests distinguish missing and duplicate latest records without cross-listing joins', async () => fixture(async outputPath => {
  const calls = [];
  const report = await runFullUSLatest(diff([row('AAA'), row('BBB'), row('CCC')]), { outputPath, today: '2026-10-01',
    clientFactory: factory(() => ({ ok: true, complete: true, data: [observation('AAA'), observation('AAA'), observation('BBB')] }), calls) });
  assert.equal(report.complete, true);
  assert.equal(report.rows.find(r => r.ticker === 'AAA').status, 'DUPLICATE_LATEST');
  assert.equal(report.rows.find(r => r.ticker === 'CCC').status, 'MISSING_LATEST');
  assert.equal(report.summary.validLatest, 1);
  assert.equal(calls[0].endpoint, '/eod/latest');
  assert.equal(calls[0].params.exchange, 'XNAS');
  assert.equal(calls[0].settings.maxPages, 1);
  assert.equal(report.rows.find(r => r.ticker === 'BBB').historyValidation, 'NOT_TESTED');
}));

test('Cumulative private checkpoint budget stops before excess calls and resumes only remaining batches', async () => fixture(async outputPath => {
  const calls = [], input = diff([row('AAA'), row('BBB'), row('CCC')]);
  const success = symbols => ({ ok: true, complete: true, data: symbols.map(s => observation(s)) });
  const first = await runFullUSLatest(input, { outputPath, today: '2026-10-01', maxCredits: 2, batchSize: 1,
    clientFactory: factory(success, calls) });
  assert.equal(first.complete, false); assert.equal(calls.length, 2);
  assert.equal(first.state, 'INCOMPLETE_BUDGET_EXHAUSTED'); assert.equal(first.summary.remainingSymbols, 1);
  const againCalls = [];
  const resumed = await runFullUSLatest(input, { outputPath, today: '2026-10-01', maxCredits: 3, batchSize: 1,
    clientFactory: factory(success, againCalls) });
  assert.equal(resumed.complete, true); assert.equal(againCalls.length, 1); assert.equal(againCalls[0].symbols[0], 'CCC');
  assert.equal(resumed.budgetUsed.estimatedCreditsConsumed, 3);
  assert.equal(resumed.budgetUsed.requestsAttempted, 3);
  const noCalls = [];
  await runFullUSLatest(input, { outputPath, today: '2026-10-01', maxCredits: 3, batchSize: 1, clientFactory: factory(success, noCalls) });
  assert.equal(noCalls.length, 0);
  await assert.rejects(runFullUSLatest(diff([row('DIFFERENT')]), { outputPath, today: '2026-10-01' }), /checkpoint identity/);
}));

test('Incomplete pages or unrelated symbols never count as verified missing or valid prices', async () => fixture(async outputPath => {
  const calls = [];
  const report = await runFullUSLatest(diff([row('AAA')]), { outputPath, today: '2026-10-01',
    clientFactory: factory(() => ({ ok: true, complete: true, data: [observation('UNREQUESTED')] }), calls) });
  assert.equal(report.complete, false); assert.equal(report.summary.validLatest, 0);
  assert.equal(report.rows[0].status, 'BATCH_INCOMPLETE');
  assert.equal(report.summary.pendingRetryOrUnattemptedSymbols, 1);
  assert.equal(report.batches[0].unrequestedSymbolRows, 1);
}));

test('Transport exception details cannot leak into checkpoint and terminal auth errors stop remaining work', async () => fixture(async outputPath => {
  const calls = [];
  const report = await runFullUSLatest(diff([row('AAA'), row('BBB')]), { outputPath, today: '2026-10-01', batchSize: 1,
    clientFactory: factory(() => ({ ok: false, complete: false, reason: 'authError', message: 'sensitive-key' }), calls) });
  assert.equal(calls.length, 1); assert.equal(report.complete, false);
  assert.equal(report.state, 'INCOMPLETE_AUTHERROR');
  assert.ok(!readFileSync(outputPath, 'utf8').includes('sensitive-key'));
  assert.equal(report.summary.remainingSymbols, 1);
}));
