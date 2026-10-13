import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {collectLiveRevalidation, validateHistoryResult, validateLivePlan, verifiedMetadata, unresolvedTargetDates} from
  '../../../scripts/marketstack/europe-live-revalidation.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const listings = Array.from({length: 449}, (_, i) => ({securityId: 'security_' + i, listingId: 'marketstack:XETR:E' + i,
    symbol: 'E' + i, mic: 'XETR', currency: 'EUR', isin: 'DE0008404005', aliases: [], windows: []}));
  const catalog = {securities: listings.map(row => ({region: 'EUROPE', securityId: row.securityId, isin: row.isin,
    primaryListingId: row.listingId, listings: [{listingId: row.listingId, providerSymbol: row.symbol, mic: row.mic, currency: row.currency}]}))};
  const catalogSha256 = hash(JSON.stringify(catalog));
  const plan = {version: 1, sourceBindings: {catalogSha256}, listings, corporateActionWindows: Array.from({length: 47}, (_, i) => ({
    securityId: listings[i].securityId, listingId: listings[i].listingId, windowId: 'action_' + i,
    discontinuityId: 'break_' + i, from: '2026-01-05', to: '2026-01-06', maxPages: 1}))};
  return {plan, catalog, catalogSha256};
}
const operation = {kind: 'history', listing: {providerTicker: 'E0', mic: 'XETR'},
  from: '2026-01-05', to: '2026-01-06', variant: 'FILTERED_EXACT'};
const bar = (date, exchange = 'XETR', ticker = 'E0') => ({symbol: ticker, exchange,
  date: date + 'T00:00:00+0000', open: 10, high: 12, low: 9, close: 11, volume: 100,
  split_factor: 1, dividend: 0, provider_future_field: {retained: true}});
const page = rows => ({pagination: {offset: 0, count: rows.length, total: rows.length, limit: 1000}, data: rows});

test('all 449 canonical primary listings, 47 actions and sanitized metadata are mandatory before any request', () => {
  const f = fixture(); const accepted = validateLivePlan(f.plan, f);
  assert.equal(accepted.listings, 449); assert.equal(accepted.corporateActionWindows, 47); assert.equal(accepted.credits, 543);
  for (const mutate of [
    p => p.listings.pop(), p => p.listings[1].securityId = p.listings[0].securityId,
    p => p.listings[0].mic = 'XNAS', p => p.listings[0].symbol = 'NVDA',
    p => p.sourceBindings.catalogSha256 = 'forged', p => p.corporateActionWindows.pop(),
    p => p.listings[0].access_key = 'forbidden', p => p.listings[0].close = 11
  ]) {
    const copy = structuredClone(f.plan); mutate(copy); assert.throws(() => validateLivePlan(copy, f));
  }
});

test('mandatory batch cannot consume the adaptive budget or exceed target; invalid dates and targets fail closed', () => {
  const f = fixture();
  f.plan.listings[0].windows = [{windowId: 'bad', from: '2026-01-05', to: '2026-01-06', maxPages: 1,
    targetDates: [{date: '2026-02-30', kind: 'MISSING'}]}];
  assert.throws(() => validateLivePlan(f.plan, f), /TARGET/);
  f.plan.listings[0].windows[0].targetDates[0].date = '2026-01-05';
  f.plan.listings[0].windows = Array.from({length: 12600}, (_, i) => ({...f.plan.listings[0].windows[0], windowId: 'w' + i}));
  assert.throws(() => validateLivePlan(f.plan, f), /EXCEEDS_13000/);
});

test('history verification refuses wrong venue, window escape, descending dates and duplicate listing days', () => {
  const good = validateHistoryResult({ok: true, complete: true, data: [bar('2026-01-05'), bar('2026-01-06')]}, operation);
  assert.equal(good.complete, true); assert.deepEqual(good.data[0].raw.provider_future_field, {retained: true});
  for (const rows of [[bar('2026-01-05', 'XNAS')], [bar('2026-01-04')],
    [bar('2026-01-06'), bar('2026-01-05')], [bar('2026-01-05'), bar('2026-01-05')]]) {
    assert.equal(validateHistoryResult({ok: true, complete: true, data: rows}, operation).complete, false);
  }
  assert.equal(validateHistoryResult({ok: true, complete: false, data: [bar('2026-01-05')]}, operation).complete, false);
});

test('exchange-unfiltered evidence keeps the same MIC and never silently switches to a secondary listing', () => {
  const result = validateHistoryResult({ok: true, complete: true,
    data: [bar('2026-01-05', 'XFRA'), bar('2026-01-06')]}, {...operation, variant: 'EXCHANGE_UNFILTERED'});
  assert.equal(result.complete, true); assert.equal(result.data.length, 1); assert.equal(result.rejectedObservations.length, 1);
  assert.equal(result.data[0].normalized.tradingDate, '2026-01-06'); assert.equal(result.canonicalAdmission, false);
});

test('alias metadata requires a unique exact symbol, ISIN, MIC and non-conflicting currency; current proof cannot authorize analytics', () => {
  const listing = {providerTicker: 'E0', isin: 'DE0008404005', mic: 'XETR', currency: 'EUR'};
  const observation = {raw: {active: true, stock_exchanges: [{mic: 'XETR'}]}, normalized: {
    providerTicker: 'E0.XETR', isin: listing.isin, providerExchange: null, currency: 'EUR'}};
  const result = {ok: true, observations: [observation]};
  assert.equal(verifiedMetadata(result, listing, 'E0.XETR'), true);
  for (const mutate of [r => r.observations[0].normalized.isin = 'OTHER',
    r => r.observations[0].normalized.currency = 'USD', r => r.observations[0].raw.active = false,
    r => r.observations.push(structuredClone(observation)), r => r.observations[0].raw.stock_exchanges = [{mic: 'XFRA'}]]) {
    const changed = structuredClone(result); mutate(changed); assert.equal(verifiedMetadata(changed, listing, 'E0.XETR'), false);
  }
  for (const absent of [null, undefined, '', 'DE0000000000']) {
    const changed = structuredClone(result); changed.observations[0].normalized.isin = absent;
    assert.equal(verifiedMetadata(changed, {...listing, isin: absent}, 'E0.XETR'), false);
  }
});

test('quarantine-only missing/invalid rows stay open for alternate probes; valid corrected OHLCV rows resolve the query question only', () => {
  const op = {...operation, listing: {...operation.listing, currency: 'EUR'}, targetDates: [{date: '2026-01-05', kind: 'QUARANTINE'}]};
  assert.deepEqual(unresolvedTargetDates(op, {ok: true, complete: true, data: []}), ['2026-01-05']);
  for (const change of [row => row.close = 0, row => row.close = null, row => row.high = 5, row => row.volume = null,
    row => row.price_currency = 'USD']) {
    const raw = bar('2026-01-05'); change(raw);
    assert.deepEqual(unresolvedTargetDates(op, validateHistoryResult({ok: true, complete: true, data: [raw]}, op)), ['2026-01-05']);
  }
  assert.deepEqual(unresolvedTargetDates(op, validateHistoryResult({ok: true, complete: true, data: [bar('2026-01-05')]}, op)), []);
  assert.deepEqual(unresolvedTargetDates(op, validateHistoryResult({ok: true, complete: false, data: [bar('2026-01-05')]}, op)), ['2026-01-05']);
});

test('coalesced action windows bind all 47 distinct strong cases; bounded policy and aliases validate before authentication', () => {
  const f = fixture();
  f.plan.coverage = {strongBreakCases: 47};
  f.plan.corporateActionWindows = f.plan.corporateActionWindows.map((w, i) => ({...w,
    events: [{type: 'STRONG_BREAK', caseId: 'case_' + i, eventFrom: w.from, eventTo: w.to}]}));
  validateLivePlan(f.plan, f);
  for (const mutate of [p => p.corporateActionWindows[1].events[0].caseId = 'case_0',
    p => p.corporateActionWindows[0].events = [], p => p.policy = {broaderPaddingDays: 1000},
    p => p.listings[0].aliases = ['NVDA']]) {
    const copy = structuredClone(f.plan); mutate(copy); assert.throws(() => validateLivePlan(copy, f));
  }
});

test('hard cap cannot exceed 16000 before requests and missing credentials cannot fall back to local provider calls', async () => {
  const f = fixture(); let calls = 0;
  for (const options of [{maxCredits: 16001, apiKey: 'unit-test-token'}, {apiKey: ''}]) {
    await assert.rejects(collectLiveRevalidation({...f, out: '/tmp/vu-uncreated-live-output', ...options,
      fetchImpl: async () => {calls++;}, log: () => {}}));
  }
  assert.equal(calls, 0);
});

test('private collector queries all 449, adaptively recovers a missing date and binds gzip archives without synthetic rows or credentials', async () => {
  const f = fixture(), out = mkdtempSync(join(tmpdir(), 'vu-live-449-'));
  f.plan.listings[0].windows = [{windowId: 'missing', from: '2026-01-05', to: '2026-01-06', maxPages: 1,
    targetDates: [{date: '2026-01-05', kind: 'MISSING', reasonCode: 'SAVED_RESPONSE_ABSENT'}]}];
  const calls = [], logs = [];
  const fetchImpl = async rawUrl => {
    const url = new URL(rawUrl); calls.push(url.pathname + '?' + [...url.searchParams].filter(([k]) => k !== 'access_key').map(([k,v]) => k+'='+v).join('&'));
    assert.equal(url.searchParams.get('access_key'), 'unit-test-token');
    let body;
    if (url.pathname.includes('/tickers/')) {
      const ticker = decodeURIComponent(url.pathname.split('/').at(-1)); const listing = f.plan.listings.find(row => row.symbol === ticker);
      body = {data: {symbol: ticker, isin: listing.isin, stock_exchange: {mic: 'XETR'}, price_currency: 'EUR'}};
    } else if (/\/(splits|dividends)$/.test(url.pathname)) body = page([]);
    else body = page(url.searchParams.get('date_from') === '2026-01-05' ? [bar('2026-01-06')] : [bar('2026-01-05'), bar('2026-01-06')]);
    return {status: 200, headers: new Headers(), text: async () => JSON.stringify(body)};
  };
  try {
    const summary = await collectLiveRevalidation({...f, out, apiKey: 'unit-test-token', fetchImpl, log: x => logs.push(x)});
    assert.equal(summary.all449Included, true); assert.equal(summary.listings.length, 449);
    assert.equal(summary.listings.filter(row => row.metadataMatched).length, 449);
    assert.equal(summary.budget.requests, 545); assert.equal(summary.transport.retries, 0);
    assert.equal(summary.results.filter(row => row.operation.kind === 'history').length, 2);
    assert.equal(summary.results.at(-1).operation.variant, 'BROADER_DATE');
    assert.equal(summary.results.some(row => row.operation.variant === 'EXCHANGE_UNFILTERED'), false);
    assert.equal(summary.productionWrites, 0); assert.equal(summary.analyticalGatesChanged, false);
    assert.ok(logs.some(row => row.phase === 'PRIMARY_BATCH_ESTIMATE' && Number.isInteger(row.credits)));
    const manifests = JSON.parse(readFileSync(join(out, 'raw-manifest.json')));
    for (const meta of manifests) {
      const compressed = readFileSync(join(out, meta.path)), bytes = gunzipSync(compressed);
      assert.equal(hash(compressed), meta.compressedSha256); assert.equal(hash(bytes), meta.sha256);
      assert.equal(JSON.stringify(meta).includes('unit-test-token'), false);
      assert.equal(bytes.toString().includes('unit-test-token'), false);
    }
    const last = summary.results.at(-1), compressed = readFileSync(join(out, last.resultPath));
    assert.equal(hash(compressed), last.normalizedCompressedSha256);
    const bytes = gunzipSync(compressed); assert.equal(hash(bytes), last.normalizedSha256);
    const entry = JSON.parse(bytes);
    assert.deepEqual(entry.result.data.map(row => row.normalized.tradingDate), ['2026-01-05', '2026-01-06']);
    assert.equal(Object.hasOwn(entry.result, 'rawPages'), false);
    assert.equal(calls.filter(call => call.includes('/tickers/')).length, 449);
  } finally {rmSync(out, {recursive: true, force: true});}
});

test('HTTP auth failure stops requests globally while every canonical listing retains an explicit result', async () => {
  const f = fixture(), out = mkdtempSync(join(tmpdir(), 'vu-live-auth-'));
  let count = 0;
  try {
    const summary = await collectLiveRevalidation({...f, out, apiKey: 'unit-test-token', log: () => {},
      fetchImpl: async () => {count++; return {status: 401, text: async () => JSON.stringify({error: {type: 'invalid_access_key'}})};}});
    assert.equal(count, 1); assert.equal(summary.budget.requests, 1); assert.equal(summary.terminalReason, 'authError');
    assert.equal(summary.listings.length, 449); assert.equal(summary.results.filter(row => row.skipped).length, 542);
  } finally {rmSync(out, {recursive: true, force: true});}
});

test('quarantine-only windows really dispatch broader probes for absent or invalid primary bars, then stop after correction', async () => {
  for (const absent of [true, false]) {
    const f = fixture(), out = mkdtempSync(join(tmpdir(), 'vu-live-quarantine-'));
    f.plan.listings[0].windows = [{windowId: 'q-only', from: '2026-01-05', to: '2026-01-06', maxPages: 1,
      targetDates: [{date: '2026-01-05', kind: 'QUARANTINE', reasonCode: 'INVALID_CURRENT_CLOSE'}]}];
    try {
      const summary = await collectLiveRevalidation({...f, out, apiKey: 'unit-test-token', log: () => {},
        fetchImpl: async rawUrl => {
          const url = new URL(rawUrl); let body;
          if (url.pathname.includes('/tickers/')) body = {data: {symbol: url.pathname.split('/').at(-1),
            isin: 'DE0008404005', stock_exchange: {mic: 'XETR'}, price_currency: 'EUR'}};
          else if (/\/(splits|dividends)$/.test(url.pathname)) body = page([]);
          else if (url.searchParams.get('date_from') === '2026-01-05') body = page(absent ? [] : [{...bar('2026-01-05'), close: 0}]);
          else body = page([bar('2026-01-05')]);
          return {status: 200, text: async () => JSON.stringify(body)};
        }});
      const histories = summary.results.filter(row => row.operation.kind === 'history');
      assert.deepEqual(histories.map(row => row.operation.variant), ['FILTERED_EXACT', 'BROADER_DATE']);
      assert.equal(summary.budget.requests, 545);
      const corrected = JSON.parse(gunzipSync(readFileSync(join(out, histories[1].resultPath))));
      assert.equal(corrected.result.data[0].raw.close, 11);
      assert.equal(corrected.result.canonicalAdmission, false);
    } finally {rmSync(out, {recursive: true, force: true});}
  }
});
