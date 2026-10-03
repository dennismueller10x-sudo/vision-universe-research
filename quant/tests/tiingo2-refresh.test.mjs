import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
import { runRefresh, selectCurrentListings } from '../../scripts/market/tiingo2-refresh.mjs';
import { discoverTiingo, normalizeDiscoveryRows } from '../../scripts/market/tiingo2-discovery.mjs';
import { collectEvidence } from '../../scripts/market/tiingo2-evidence.mjs';

const today = '2026-10-02';
function zip(content) {
  const data = Buffer.from(content), raw = deflateRawSync(data), name = Buffer.from('supported_tickers.csv');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(raw.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(raw.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + raw.length, 16);
  return Buffer.concat([local, name, raw, central, name, end]);
}
function save(root, path, value) {
  const file = join(root, path); mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)); return file;
}
async function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'vu-refresh-'));
  try {
    const raw = [{ ticker: 'DNA', securityId: 'ref_DNA', assetType: 'Stock', exchange: 'NYSE', active: true, startDate: '2021-09-17' }];
    save(root, 'quant/data/market/scale/universe-FULL_UNIVERSE.json', { securities: raw });
    save(root, 'quant/data/market/security-master/eligibility.json', { decisions: [{ ...raw[0], instrument_type: 'EQUITY_COMMON', product_eligibility: 'ELIGIBLE' }] });
    save(root, 'quant/data/market/security-master/company-names.json', { rows: [{ ticker: 'DNA', securityId: 'ref_DNA', status: 'RESOLVED', companyName: 'Ginkgo Bioworks Holdings, Inc.' }] });
    save(root, 'quant/data/universe/cik-map.json', { byTicker: {} });
    save(root, 'quant/data/universe/instruments/DN.json', { instruments: [{ symbol: 'DNA', instrumentId: 'vu_DNA', legacyIds: ['ref_DNA'], exchange: 'NYSE', firstTradeDate: '2021-09-17', active: true }] });
    save(root, 'quant/data/market/factors/factors-FULL_UNIVERSE.json', { skipped: [{ ticker: 'DNA', reason: 'split_factor_mismatch' }] });
    const workDir = join(root, '.market-cache/tiingo2');
    save(root, '.market-cache/tiingo2/directories/' + today + '-nasdaqlisted.txt', 'Symbol|Security Name|ETF|Test Issue\nNEW|New Corporation common stock|N|N\n');
    save(root, '.market-cache/tiingo2/directories/' + today + '-otherlisted.txt', 'ACT Symbol|Security Name|Exchange|ETF|Test Issue\nDNA|Ginkgo Bioworks Holdings, Inc. Class A common stock|N|N|N\n');
    const fromZip = save(root, '.market-cache/tiingo2/input.zip', zip('ticker,exchange,assetType,priceCurrency,startDate,endDate\nDNA,NYSE,Stock,USD,2021-09-17,2026-10-01\nDNA,NYSE,Stock,USD,2000-01-01,2009-01-01\nNEW,NASDAQ,Stock,USD,2026-09-30,2026-10-01\n'));
    await fn({ root, workDir, fromZip, historicalExclusions: new Map() });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('incremental refresh stages every gap and keeps consumer baseline without evidence or network', async () => fixture(async (options) => {
  const previousCsv = save(options.root, '.market-cache/tiingo2/previous.csv', 'ticker,exchange,assetType,priceCurrency,startDate,endDate\nDNA,NYSE,Stock,USD,2021-09-17,2026-10-01\n');
  await discoverTiingo({ workDir: join(options.workDir, 'discovery'), fromCsv: previousCsv, runId: 'previous', asOf: today });
  const result = await runRefresh({ ...options, today, runId: 'fixture', offline: true, fetchImpl: () => { throw Error('UNEXPECTED_NETWORK'); } });
  assert.equal(result.summary.discovery.records, 3);
  assert.equal(result.summary.auditCandidateSymbols, 1);
  assert.equal(result.summary.current.consumer, 1);
  assert.equal(result.summary.proposedConsumer, 1);
  assert.equal(result.summary.productionMutations, 0);
  assert.deepEqual(result.preview.ADDED, []); assert.deepEqual(result.preview.REMOVED, []);
  assert.deepEqual(result.preview.UNCHANGED, ['DNA']);
  assert.equal(result.summary.protectedBaseline.unchanged, true);
  assert.equal(result.candidateRows.find((r) => r.ticker === 'DNA').startDate, '2021-09-17');
  const staged = JSON.parse(readFileSync(join(result.out, 'tiingo2_staged_candidates.json'), 'utf8'));
  assert.deepEqual(staged.rows.map((r) => r.ticker), ['NEW']);
  assert.equal(staged.rows[0].decision, 'MANUAL_REVIEW');
  const first = JSON.parse(readFileSync(join(result.out, 'tiingo2_universe_diff.json'), 'utf8'));
  assert.ok(first.records.find((r) => r.ticker === 'NEW').categories.includes('NEW_IN_TIINGO'));
  const resumed = await runRefresh({ ...options, today, runId: 'fixture', offline: true, fetchImpl: () => { throw Error('UNEXPECTED_NETWORK'); } });
  assert.deepEqual(JSON.parse(readFileSync(join(resumed.out, 'tiingo2_universe_diff.json'), 'utf8')).records, first.records);
}));

test('offline refresh without a local provider source cannot make network requests', async () => fixture(async ({ root, workDir, historicalExclusions }) => {
  await assert.rejects(runRefresh({ root, workDir, today, historicalExclusions, offline: true, fetchImpl: () => { throw Error('UNEXPECTED_NETWORK'); } }), /OFFLINE_DISCOVERY_SOURCE_REQUIRED/);
}));

test('current listing selection keeps live DNA generation and blocks two simultaneous active periods', () => {
  const rows = normalizeDiscoveryRows([
    { ticker: 'DNA', exchange: 'NYSE', assetType: 'Stock', startDate: '2000-01-01', endDate: '2009-01-01' },
    { ticker: 'DNA', exchange: 'NYSE', assetType: 'Stock', startDate: '2021-09-17', endDate: '2026-10-01' },
    { ticker: 'AMB', exchange: 'NYSE', assetType: 'Stock', startDate: '2020-01-01', endDate: '2026-10-01' },
    { ticker: 'AMB', exchange: 'NASDAQ', assetType: 'Stock', startDate: '2026-01-01', endDate: '2026-10-01' }
  ], { asOf: today });
  const selected = selectCurrentListings(rows, today);
  assert.deepEqual(selected.selected.map((r) => r.ticker), ['DNA']);
  assert.equal(selected.selected[0].startDate, '2021-09-17');
  assert.equal(selected.ambiguous[0].ticker, 'AMB');
});

test('evidence requests stay within candidate listing period and cached results require no provider calls', async () => fixture(async ({ workDir }) => {
  const candidates = [{ ticker: 'NEW', startDate: '2026-09-30', currency: 'USD' }], urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (!url.includes('/prices?')) return new Response(JSON.stringify({ ticker: 'NEW', name: 'New Corporation', exchangeCode: 'NASDAQ', startDate: '2026-09-30' }));
    return new Response(JSON.stringify(['2026-09-30', '2026-10-01'].map((date) => ({ date, open: 10, high: 10, low: 10, close: 10, volume: 100, adjOpen: 10, adjHigh: 10, adjLow: 10, adjClose: 10, adjVolume: 100, splitFactor: 1, divCash: 0 }))));
  };
  const first = await collectEvidence(candidates, { workDir, today, apiKey: 'test', fetchImpl, maxSymbols: 1 });
  assert.equal(first.requests, 2);
  assert.match(urls[1], /startDate=2026-09-30&endDate=2026-10-02/);
  assert.equal(first.results.get('NEW').price.historyValid, true);
  const cached = await collectEvidence(candidates, { workDir, today, apiKey: 'test', fetchImpl: () => { throw Error('UNEXPECTED_NETWORK'); }, maxSymbols: 1 });
  assert.equal(cached.requests, 0); assert.deepEqual(cached.results.get('NEW'), first.results.get('NEW'));
}));

test('resuming an evidence budget advances uncached candidates while loading all prior successes', async () => fixture(async ({ workDir }) => {
  const candidates = ['ONE', 'TWO'].map((ticker) => ({ ticker, startDate: '2026-09-30', currency: 'USD' }));
  const fetchImpl = async (url) => {
    const ticker = url.split('/daily/')[1].split('/')[0];
    if (!url.includes('/prices?')) return new Response(JSON.stringify({ ticker, name: ticker + ' Corporation', exchangeCode: 'NASDAQ', startDate: '2026-09-30' }));
    return new Response(JSON.stringify(['2026-09-30', '2026-10-01'].map((date) => ({ date, open: 10, high: 10, low: 10, close: 10, volume: 100, adjOpen: 10, adjHigh: 10, adjLow: 10, adjClose: 10, adjVolume: 100, splitFactor: 1, divCash: 0 }))));
  };
  const first = await collectEvidence(candidates, { workDir, today, apiKey: 'test', fetchImpl, maxSymbols: 1 });
  assert.equal(first.completed, 1); assert.equal(first.pending, 1);
  const resumed = await collectEvidence(candidates, { workDir, today, apiKey: 'test', fetchImpl, maxSymbols: 1 });
  assert.equal(resumed.requests, 2); assert.equal(resumed.completed, 2); assert.equal(resumed.pending, 0);
  assert.ok(resumed.results.has('ONE')); assert.ok(resumed.results.has('TWO'));
}));
