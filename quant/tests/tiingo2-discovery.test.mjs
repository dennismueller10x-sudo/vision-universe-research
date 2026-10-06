import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
import { discoverTiingo, diffUniverses, normalizeDiscoveryRows, parseDiscoveryCsv, readTiingoZip } from '../../scripts/market/tiingo2-discovery.mjs';

const csv = 'ticker,exchange,assetType,priceCurrency,startDate,endDate\nDNA,NYSE,Stock,USD,2021-09-17,2026-10-01\nOLD,NYSE,Stock,USD,2000-01-01,2020-01-01\n';
const date = { asOf: '2026-10-02', now: '2026-10-02T10:00:00Z' };
function zip(content, name = 'supported_tickers.csv') {
  const data = Buffer.from(content), compressed = deflateRawSync(data), filename = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12); end.writeUInt32LE(local.length + filename.length + compressed.length, 16);
  return Buffer.concat([local, filename, compressed, central, filename, end]);
}
async function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'vu-tiingo2-'));
  try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('strict discovery CSV preserves metadata, quoted company names and multiline fields', () => {
  const parsed = parseDiscoveryCsv('\uFEFFticker,name,exchange\nDNA,"Ginkgo, Inc.",NYSE\nX,"One\nTwo ""Class""",NASDAQ\n');
  assert.equal(parsed.rows[0].name, 'Ginkgo, Inc.');
  assert.equal(parsed.rows[1].name, 'One\nTwo "Class"');
  for (const malformed of ['', 'name\nDNA', 'ticker,ticker\nDNA,DNA', 'ticker,name\nDNA', 'ticker,name\nDNA,"unfinished']) {
    assert.throws(() => parseDiscoveryCsv(malformed));
  }
});

test('ZIP discovery rejects truncation and oversized entries', () => {
  assert.equal(readTiingoZip(zip(csv)).text, csv);
  assert.throws(() => readTiingoZip(zip(csv).subarray(0, -2)), /directory/);
  assert.throws(() => readTiingoZip(zip(csv), 20), /Unsafe/);
});

test('fresh status is an explicit inference and stale price end dates never prove delisting', () => {
  const rows = normalizeDiscoveryRows(parseDiscoveryCsv(csv).rows, date);
  assert.equal(rows[0].listingStatus, 'ACTIVE');
  assert.equal(rows[0].statusEvidence, 'INFERRED_PRICE_END_DATE');
  assert.equal(rows[0].companyName, null);
  assert.equal(rows[1].listingStatus, 'INACTIVE');
  assert.equal(rows[1].providerMetadata.endDate, '2020-01-01');
  assert.equal(normalizeDiscoveryRows([{ ticker: 'NODATE' }], date)[0].listingStatus, 'UNKNOWN');
  assert.equal(normalizeDiscoveryRows([{ ticker: 'DEL', listingStatus: 'DELISTED' }], date)[0].statusEvidence, 'PROVIDER_EXPLICIT');
  assert.equal(normalizeDiscoveryRows([{ ticker: 'FUT', endDate: '2026-10-03' }], date)[0].listingStatus, 'UNKNOWN');
});

test('discovery is deterministic across provider row ordering and metadata key ordering', () => {
  const first = normalizeDiscoveryRows([{ ticker: 'B', exchange: 'NYSE' }, { exchange: 'NASDAQ', ticker: 'A' }], date);
  const second = normalizeDiscoveryRows([{ ticker: 'A', exchange: 'NASDAQ' }, { exchange: 'NYSE', ticker: 'B' }], date);
  assert.deepEqual(first, second);
  assert.throws(() => normalizeDiscoveryRows([{ ticker: 'A', endDate: '2026-02-30' }], date), /Invalid discovery date/);
});

test('a run resumes without provider requests and rejects changed input under the same ID', async () => fixture(async (workDir) => {
  const path = join(workDir, 'input.csv'); writeFileSync(path, csv);
  const first = await discoverTiingo({ ...date, workDir, fromCsv: path, runId: 'test-run' });
  const second = await discoverTiingo({ ...date, workDir, fromCsv: path, runId: 'test-run', fetchImpl: () => { throw new Error('unexpected'); } });
  assert.deepEqual(first, second);
  assert.equal(first.counts.records, 2);
  assert.equal(first.counts.tickerStrings, 2);
  writeFileSync(path, csv.replace('DNA', 'AMC'));
  await assert.rejects(discoverTiingo({ ...date, workDir, fromCsv: path, runId: 'test-run' }), /different request/);
  await assert.rejects(discoverTiingo({ ...date, workDir, runId: '../../unsafe' }), /Unsafe discovery runId/);
}));

test('cache TTL uses successful discovery timestamp and 304 revalidation reruns status inference', async () => fixture(async (workDir) => {
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls++;
    if (calls === 1) return new Response(zip(csv), { headers: { etag: 'test-v1', 'last-modified': 'Thu, 01 Oct 2026 21:00:00 GMT' } });
    assert.equal(options.headers['If-None-Match'], 'test-v1');
    return new Response(null, { status: 304 });
  };
  const first = await discoverTiingo({ ...date, workDir, fetchImpl });
  const cached = await discoverTiingo({ ...date, now: '2026-10-02T10:05:00Z', workDir, fetchImpl, maxAgeMs: 600000 });
  assert.equal(cached.runId, first.runId); assert.equal(calls, 1);
  const revalidated = await discoverTiingo({ ...date, asOf: '2026-10-12', now: '2026-10-12T10:00:00Z', workDir, fetchImpl });
  assert.equal(calls, 2); assert.equal(revalidated.source.revalidated, true);
  assert.equal(revalidated.records.find((r) => r.ticker === 'DNA').listingStatus, 'INACTIVE');
  assert.equal(revalidated.sourceTimestamp, first.sourceTimestamp);
}));

test('failed download cannot replace latest success, including malformed or empty provider data', async () => fixture(async (workDir) => {
  await discoverTiingo({ ...date, workDir, fetchImpl: async () => new Response(zip(csv)) });
  const initial = readFileSync(join(workDir, 'latest.json'), 'utf8');
  for (const fetchImpl of [async () => new Response('bad', { status: 401 }), async () => new Response(zip('ticker,exchange\n'))]) {
    await assert.rejects(discoverTiingo({ ...date, workDir, fetchImpl, force: true, retries: 0 }));
    assert.equal(readFileSync(join(workDir, 'latest.json'), 'utf8'), initial);
  }
}));

test('truncated or modified run cache is rejected', async () => fixture(async (workDir) => {
  const path = join(workDir, 'input.csv'); writeFileSync(path, csv);
  await discoverTiingo({ ...date, workDir, fromCsv: path, runId: 'corrupt' });
  const cache = join(workDir, 'runs/corrupt/tiingo2_fresh_discovery.json');
  const value = JSON.parse(readFileSync(cache, 'utf8')); value.records.pop(); writeFileSync(cache, JSON.stringify(value));
  await assert.rejects(discoverTiingo({ ...date, workDir, fromCsv: path, runId: 'corrupt' }), /Invalid discovery cache/);
}));

test('diff retains missing baseline titles, exposes layer differences and distinguishes collisions', () => {
  const discovery = { runId: 'diff', records: normalizeDiscoveryRows([
    { ticker: 'DNA', exchange: 'NYSE', endDate: '2026-10-01' }, { ticker: 'CART', exchange: 'NASDAQ', endDate: '2026-10-01' },
    { ticker: 'REUSED', exchange: 'NYSE', startDate: '2000-01-01', endDate: '2020-01-01' },
    { ticker: 'REUSED', exchange: 'NASDAQ', startDate: '2026-01-01', endDate: '2026-10-01' }
  ], date) };
  const raw = [{ ticker: 'DNA', securityId: 'ref_DNA' }, { ticker: 'HIST' }];
  const diff = diffUniverses({ discovery, raw, product: raw, consumer: [{ ticker: 'DNA' }], previousDiscovery: { records: [{ ticker: 'DNA' }] } });
  assert.equal(diff.counts.raw, 2); assert.equal(diff.safety.removalsApplied, 0);
  const cart = diff.records.find((r) => r.ticker === 'CART');
  assert.deepEqual(cart.categories, ['MISSING_IN_CURRENT_VU', 'NEW_IN_TIINGO']);
  assert.deepEqual(cart.missingFrom, ['raw', 'product', 'consumer']);
  assert.equal(diff.records.find((r) => r.ticker === 'HIST').category, 'PRESENT_IN_VU_BUT_NOT_FRESH');
  const reused = diff.records.find((r) => r.ticker === 'REUSED');
  assert.equal(reused.symbolCollision, true); assert.ok(reused.categories.includes('UNKNOWN'));
});

test('symbol changes require confirmed identity evidence and share classes remain independent', () => {
  const discovery = { records: normalizeDiscoveryRows([{ ticker: 'NEW' }, { ticker: 'BRK-A' }, { ticker: 'BRK-B' }, { ticker: 'GOOG' }, { ticker: 'GOOGL' }], date) };
  const confirmed = diffUniverses({ discovery, raw: [{ ticker: 'OLD', companyId: 'company-1' }], symbolChanges: [{ oldTicker: 'OLD', newTicker: 'NEW', companyId: 'company-1', status: 'CONFIRMED' }] });
  assert.ok(confirmed.records.find((r) => r.ticker === 'NEW').categories.includes('SYMBOL_CHANGED'));
  assert.equal(confirmed.records.find((r) => r.ticker === 'OLD').category, 'PRESENT_IN_VU_BUT_NOT_FRESH');
  assert.equal(confirmed.counts.freshTickers, 5);
  const identityStage = diffUniverses({ discovery, symbolChanges: [{ oldTicker: 'OLD', newTicker: 'NEW', state: 'CONFIRMED_RENAME' }] });
  assert.ok(identityStage.records.find((r) => r.ticker === 'NEW').categories.includes('SYMBOL_CHANGED'));
  const guessed = diffUniverses({ discovery, symbolChanges: [{ oldTicker: 'OLD', newTicker: 'NEW', status: 'POSSIBLE' }] });
  assert.ok(!guessed.records.find((r) => r.ticker === 'NEW').categories.includes('SYMBOL_CHANGED'));
});
