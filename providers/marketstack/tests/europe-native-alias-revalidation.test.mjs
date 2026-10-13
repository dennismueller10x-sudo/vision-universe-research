import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {NATIVE_PRIOR_ANCHOR, nativeTickerHypothesis, validateNativePhase, collectNativeAliasRevalidation} from
  '../../../scripts/marketstack/europe-native-alias-revalidation.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const planFile = fileURLToPath(new URL('../../../scripts/marketstack/europe-live-request-plan.json', import.meta.url));
const bytes = readFileSync(planFile), plan = JSON.parse(bytes);
const anchor = {...NATIVE_PRIOR_ANCHOR, sourceBindings: plan.sourceBindings};
const page = data => ({pagination: {offset: 0, count: data.length, total: data.length, limit: 1000}, data});

test('native suffix stripping is only a lookup hypothesis bound to the original MIC namespace', () => {
  assert.deepEqual(nativeTickerHypothesis({symbol: 'RHM.DE', mic: 'XETR'}), {
    symbol: 'RHM', namespaceSuffix: '.DE', requestedMic: 'XETR',
    basis: 'UNVERIFIED_PROVIDER_NAMESPACE_LOOKUP_HYPOTHESIS', sameSecurityVerified: false, permitsHistoryRequest: false});
  assert.equal(nativeTickerHypothesis({symbol: 'RHM.DE', mic: 'XFRA'}), null);
  assert.equal(nativeTickerHypothesis({symbol: 'RHM.DE.XETR', mic: 'XETR'}), null);
  assert.equal(nativeTickerHypothesis({symbol: '.DE', mic: 'XETR'}), null);
  assert.equal(nativeTickerHypothesis({symbol: 'NVDA', mic: 'XNAS'}), null);
});

test('previous paid run, plan, source and 8828 credits are pinned; phase two cannot reset the cumulative cap', () => {
  assert.equal(sha(bytes), NATIVE_PRIOR_ANCHOR.planFileSha256);
  const estimate = validateNativePhase(plan, anchor);
  assert.equal(estimate.securities, 449); assert.equal(estimate.metadataHypotheses, 449);
  assert.equal(estimate.requests, 3053); assert.equal(estimate.credits, 3053);
  assert.equal(estimate.cumulativeWorstCaseCredits, 11881);
  for (const mutate of [a => a.credits = 0, a => a.requests = 1, a => a.runId = 'other',
    a => a.sourceCommit = 'a'.repeat(40), a => a.summarySha256 = '0'.repeat(64),
    a => a.sourceBindings.catalogSha256 = '0'.repeat(64)]) {
    const changed = structuredClone(anchor); mutate(changed); assert.throws(() => validateNativePhase(plan, changed));
  }
  const changedPlan = structuredClone(plan); changedPlan.listings[0].windows.pop();
  assert.throws(() => validateNativePhase(changedPlan, anchor));
});

test('all 449 native metadata probes precede history; only exact ISIN/MIC/native-symbol proof enables a same-listing query', async () => {
  const out = mkdtempSync(join(tmpdir(), 'vu-native-alias-'));
  const rhm = plan.listings.find(row => row.symbol === 'RHM.DE');
  const sap = plan.listings.find(row => row.symbol === 'SAP.DE');
  const twoG = plan.listings.find(row => row.symbol === '2GB.DE');
  const asml = plan.listings.find(row => row.symbol === 'ASML.AS');
  const histories = [], logs = [], metadata = [];
  const fetchImpl = async rawUrl => {
    const url = new URL(rawUrl); assert.equal(url.searchParams.get('access_key'), 'native-unit-token');
    let status = 200, body;
    if (url.pathname.includes('/tickers/')) {
      const ticker = decodeURIComponent(url.pathname.split('/').at(-1)); metadata.push(ticker);
      const variants = {
        RHM: {symbol: 'RHM', isin: rhm.isin, stock_exchange: {mic: rhm.mic}, price_currency: rhm.currency},
        SAP: {symbol: 'SAP', isin: sap.isin, stock_exchange: {mic: 'XNYS'}, price_currency: 'USD'},
        '2GB': {symbol: '2GB', isin: null, stock_exchange: {mic: twoG.mic}},
        ASML: {symbol: 'ASML.AS', isin: asml.isin, stock_exchange: {mic: asml.mic}}
      };
      if (variants[ticker]) body = {data: variants[ticker]};
      else {status = 404; body = {error: {type: 'data_not_available'}};}
    } else {
      assert.equal(metadata.length, 449); assert.equal(url.searchParams.get('symbols'), 'RHM');
      assert.equal(url.searchParams.get('exchange'), 'XETR'); histories.push(url.searchParams.get('date_from'));
      const window = rhm.windows.find(window => window.from === url.searchParams.get('date_from'));
      const date = window.targetDates[0].date;
      body = page([{symbol: 'RHM', exchange: 'XETR', date: date + 'T00:00:00+0000',
        open: 10, high: 12, low: 9, close: 11, volume: 100, dividend: 0, split_factor: 1,
        future_provider_field: {unchanged: true}}]);
    }
    return {status, text: async () => JSON.stringify(body)};
  };
  try {
    const summary = await collectNativeAliasRevalidation({plan, priorRun: anchor, out,
      apiKey: 'native-unit-token', fetchImpl, log: row => logs.push(row)});
    assert.equal(metadata.length, 449); assert.equal(histories.length, rhm.windows.length);
    assert.equal(summary.listings.length, 449); assert.equal(summary.listings.filter(row => row.metadataMatched).length, 1);
    assert.equal(summary.cumulativeAccounting.reservedCredits, 8828 + 449 + rhm.windows.length);
    assert.ok(summary.cumulativeAccounting.reservedCredits <= 13000); assert.equal(summary.transport.retries, 0);
    assert.equal(summary.productionWrites, 0); assert.equal(summary.analyticalGatesChanged, false);
    const rawManifest = JSON.parse(readFileSync(join(out, 'raw-manifest.json')));
    assert.equal(rawManifest[0].id, '900001'); assert.equal(summary.results[0].ordinal, 900000);
    for (const row of rawManifest) {
      const compressed = readFileSync(join(out, row.path)), plain = gunzipSync(compressed);
      assert.equal(sha(compressed), row.compressedSha256); assert.equal(sha(plain), row.sha256);
      assert.equal(JSON.stringify(row).includes('native-unit-token'), false); assert.equal(plain.toString().includes('native-unit-token'), false);
    }
    const history = summary.results.find(row => row.operation.kind === 'history');
    const compressed = readFileSync(join(out, history.resultPath)), plain = gunzipSync(compressed);
    assert.equal(sha(compressed), history.normalizedCompressedSha256); assert.equal(sha(plain), history.normalizedSha256);
    const entry = JSON.parse(plain);
    assert.equal(entry.operation.listing.providerTicker, 'RHM.DE'); assert.equal(entry.operation.querySymbol, 'RHM');
    assert.equal(entry.operation.variant, 'VERIFIED_ALIAS'); assert.equal(entry.result.complete, true);
    assert.equal(entry.result.data[0].raw.symbol, 'RHM');
    assert.deepEqual(entry.result.data[0].raw.future_provider_field, {unchanged: true});
    assert.equal(entry.result.canonicalAdmission, false);
    assert.ok(logs.some(row => row.phase === 'NATIVE_METADATA_BATCH' && Number.isInteger(row.estimate.credits)));
  } finally {rmSync(out, {recursive: true, force: true});}
});

test('auth failure sends one request, retains all 449 explicit statuses and performs no alias history calls', async () => {
  const out = mkdtempSync(join(tmpdir(), 'vu-native-auth-')); let count = 0;
  try {
    const summary = await collectNativeAliasRevalidation({plan, priorRun: anchor, out, apiKey: 'native-unit-token',
      log: () => {}, fetchImpl: async () => {count++; return {status: 401,
        text: async () => JSON.stringify({error: {type: 'invalid_access_key'}})};}});
    assert.equal(count, 1); assert.equal(summary.terminalReason, 'authError'); assert.equal(summary.listings.length, 449);
    assert.equal(summary.results.some(row => row.operation.kind === 'history'), false);
    assert.equal(summary.cumulativeAccounting.reservedCredits, 8829);
  } finally {rmSync(out, {recursive: true, force: true});}
});
