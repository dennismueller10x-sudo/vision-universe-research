import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const Directory = createRequire(import.meta.url)('../engines/instrument-directory.js');

const base = '/legacy/', extensionBase = '/global/';
const us = { instrumentId: 'vu_1111', symbol: 'SAP', exchange: 'NYSE', mic: 'XNYS', legacyIds: ['ref_SAP'] };
const local = { listingId: 'vu_2222', securityId: 'security_2222', companyId: 'company_2222', ticker: 'SAP', symbol: 'SAP', exchange: 'XETRA', mic: 'XETR', name: 'SAP SE', companyName: 'SAP SE', assetType: 'EQUITY', country: 'DE', listingCountry: 'DE', region: 'EUROPE', tradingCurrency: 'EUR', reportingCurrency: 'EUR', coverage: { price_history: 'PARTIAL' }, price: { value: 205, asOf: '2026-09-30', delayState: 'EOD_ONLY' }, historyPath: 'history/vu_2222.json' };
const etf = { ...local, listingId: 'vu_3333', securityId: 'security_3333', ticker: 'SPY', symbol: 'SPY', companyId: null, fundId: 'fund_3333', name: 'SPDR S&P 500 ETF', companyName: 'SPDR S&P 500 ETF', assetType: 'ETF', exchange: 'NYSE ARCA', mic: 'ARCX', tradingCurrency: 'USD', historyPath: 'history/vu_3333.json' };
function fixture(overrides = {}, enabled = true) {
  const paths = [];
  const payloads = {
    '/legacy/search/manifest.json': { minQueryLengthForMasterLookup: 2, sym: [{ shard: 'SA' }], name: [{ shard: 'SA' }] },
    '/legacy/instruments/SA.json': { instruments: [us] },
    '/legacy/search/sym/SA.json': { entries: [{ i: us.instrumentId, s: 'SAP', n: 'SAP US ADR', x: 'NYSE', t: 'ADR' }] },
    '/legacy/search/name/SA.json': { entries: [{ i: us.instrumentId, s: 'SAP', n: 'SAP US ADR', x: 'NYSE', t: 'ADR' }] },
    '/discover/stocks/US_REAL/SAP.json': { price: { value: 245 }, asOf: '2026-09-30' },
    '/discover/series/US_REAL/SAP.json': { bars: [['2026-09-30', 245]] },
    '/quant/data/sec/quant-factor-inputs.json': { companies: [{ ticker: 'SAP', revenue: 123 }] },
    '/global/manifest.json': { schemaVersion: 'global-market-1.0.0', instrumentShards: ['SA', 'SP'], searchShards: ['SA', 'SP'], counts: {} },
    '/global/instruments/SA.json': { instruments: [local] },
    '/global/instruments/SP.json': { instruments: [etf] },
    '/global/search/SA.json': { entries: [local] },
    '/global/search/SP.json': { entries: [etf] },
    '/global/history/vu_2222.json': { listingId: local.listingId, currency: 'EUR', bars: [['2026-09-30', 205]] },
    ...overrides
  };
  const dir = Directory.create({ base, deliveredBase: '/discover/', ...(enabled ? { extensionBase } : {}), loadJSON: async path => {
    paths.push(path); if (!(path in payloads)) throw Error('Missing fixture'); return payloads[path];
  } });
  return { dir, paths };
}

test('omitting extension preserves ticker price, history, fundamentals and request paths', async () => {
  const { dir, paths } = fixture({}, false);
  assert.deepEqual(await dir.getInstrument('SAP'), { status: 'OK', instrument: us, alternateListings: [] });
  assert.equal((await dir.getPrice('SAP')).value, 245);
  assert.deepEqual((await dir.getPriceHistory('SAP')).bars, [['2026-09-30', 245]]);
  assert.equal((await dir.getFundamentals('SAP')).fundamentals.revenue, 123);
  assert.equal(paths.some(path => path.startsWith(extensionBase)), false);
});

test('ticker-only lookups preserve the US listing while explicit local identity selects Xetra', async () => {
  const { dir } = fixture();
  assert.equal((await dir.getInstrument('SAP')).instrument.instrumentId, us.instrumentId);
  const result = await dir.getInstrument({ ticker: 'SAP', listingId: local.listingId });
  assert.equal(result.status, 'OK');
  assert.equal(result.instrument.mic, 'XETR');
  assert.equal(result.instrument.currency, 'EUR');
  assert.equal(result.instrument.instrumentId, local.listingId);
  assert.equal((await dir.getInstrument({ ticker: 'SAP', listingId: 'vu_9999' })).status, 'NOT_IN_UNIVERSE');
  assert.equal((await dir.getInstrument({ ticker: 'SAP', listingId: local.listingId, mic: 'XNYS' })).status, 'NOT_IN_UNIVERSE');
});

test('local prices/history require listing identity and preserve EOD freshness and EUR', async () => {
  const { dir, paths } = fixture();
  const ref = { ticker: 'SAP', listingId: local.listingId };
  const price = await dir.getPrice(ref);
  assert.equal(price.value, 205); assert.equal(price.currency, 'EUR'); assert.equal(price.delayState, 'EOD_ONLY');
  assert.deepEqual((await dir.getPriceHistory(ref)).bars, [['2026-09-30', 205]]);
  await dir.getPriceHistory(ref);
  assert.equal(paths.filter(path => path === '/global/history/vu_2222.json').length, 1);
  assert.equal(paths.some(path => path.startsWith('/discover/')), false);
  assert.equal((await dir.getPrice({ ticker: 'SAP', listingId: 'vu_9999' })).status, 'NOT_IN_UNIVERSE');
});

test('ETF and local equity never receive SEC data from a colliding US ticker', async () => {
  const { dir, paths } = fixture();
  assert.equal((await dir.getFundamentals({ symbol: 'SAP', listingId: local.listingId })).status, 'NOT_DELIVERED');
  assert.equal((await dir.getFundamentals({ symbol: 'SPY', listingId: etf.listingId })).status, 'NOT_APPLICABLE');
  assert.equal(paths.includes('/quant/data/sec/quant-factor-inputs.json'), false);
});

test('search retains both listings and exposes delivered capabilities without LIVE', async () => {
  const { dir, paths } = fixture();
  const result = await dir.search('SAP');
  assert.deepEqual(new Set(result.entries.map(row => row.i)), new Set([us.instrumentId, local.listingId]));
  const entry = result.entries.find(row => row.i === local.listingId);
  const capabilities = dir.capabilities(entry);
  assert.equal(capabilities.HAS_PRICE_HISTORY, true); assert.equal(capabilities.HAS_PRICE_SNAPSHOT, true);
  assert.equal(capabilities.HAS_LIVE, false); assert.equal(capabilities.HAS_FUNDAMENTALS, false);
  const count = paths.length; await dir.search('SAP'); assert.equal(paths.length, count);
  assert.equal((await dir.search('SPY')).entries[0].t, 'ETF');
});

test('ambiguous global ticker never arbitrarily chooses a local listing', async () => {
  const another = { ...local, listingId: 'vu_4444', securityId: 'security_4444', exchange: 'FRANKFURT', mic: 'XFRA' };
  const { dir } = fixture({ '/legacy/instruments/SA.json': { instruments: [] }, '/global/instruments/SA.json': { instruments: [local, another] } });
  assert.equal((await dir.getInstrument('SAP')).status, 'AMBIGUOUS_IDENTITY');
  assert.equal((await dir.getInstrument({ symbol: 'SAP', listingId: another.listingId })).instrument.mic, 'XFRA');
});

test('mismatched history currency/identity and external history paths are rejected', async () => {
  for (const history of [{ listingId: 'vu_5555', currency: 'EUR', bars: [] }, { listingId: local.listingId, currency: 'USD', bars: [] }]) {
    const { dir } = fixture({ '/global/history/vu_2222.json': history });
    assert.equal((await dir.getPriceHistory({ symbol: 'SAP', listingId: local.listingId })).status, 'NOT_DELIVERED');
  }
  const { dir, paths } = fixture({ '/global/instruments/SA.json': { instruments: [{ ...local, historyPath: 'https://unexpected.example/data.json' }] } });
  assert.equal((await dir.getPriceHistory({ symbol: 'SAP', listingId: local.listingId })).status, 'NOT_DELIVERED');
  assert.equal(paths.some(path => path.includes('unexpected')), false);
});

test('unavailable extension never affects legacy resolution or prices', async () => {
  const { dir } = fixture({ '/global/manifest.json': null });
  assert.equal((await dir.getInstrument('SAP')).status, 'OK');
  assert.equal((await dir.getPrice('SAP')).value, 245);
  assert.equal((await dir.search('SAP')).entries.length, 1);
});

test('explicit US identities retain legacy prices, history and SEC fundamentals', async () => {
  const { dir } = fixture();
  for (const ref of [{ symbol: 'SAP', instrumentId: us.instrumentId }, { ticker: 'SAP', securityId: 'ref_SAP' }]) {
    assert.equal((await dir.getInstrument(ref)).instrument.instrumentId, us.instrumentId);
    assert.equal((await dir.getPrice(ref)).value, 245);
    assert.deepEqual((await dir.getPriceHistory(ref)).bars, [['2026-09-30', 245]]);
    assert.equal((await dir.getFundamentals(ref)).fundamentals.revenue, 123);
  }
  const mismatch = { symbol: 'SAP', instrumentId: us.instrumentId, mic: 'XETR' };
  assert.equal((await dir.getInstrument(mismatch)).status, 'NOT_IN_UNIVERSE');
  assert.equal((await dir.getPrice(mismatch)).status, 'NOT_IN_UNIVERSE');
  assert.equal((await dir.getFundamentals(mismatch)).status, 'NOT_IN_UNIVERSE');
});

test('venue constraints select matching local or legacy listing without ticker fallback', async () => {
  const { dir } = fixture();
  assert.equal((await dir.getInstrument({ ticker: 'SAP', mic: 'XETR' })).instrument.listingId, local.listingId);
  assert.equal((await dir.getInstrument({ ticker: 'SAP', exchange: 'XETRA' })).instrument.listingId, local.listingId);
  assert.equal((await dir.getInstrument({ ticker: 'SAP', mic: 'XNYS' })).instrument.instrumentId, us.instrumentId);
  assert.equal((await dir.getInstrument({ ticker: 'SAP', mic: 'XLON' })).status, 'NOT_IN_UNIVERSE');
});

test('global search matches aliases, ISIN, MIC, country and accented names without changing US ranking', async () => {
  const meta = { ...local, isin: 'DE0007164600', aliases: ['Walldorf Software'] };
  const swiss = { ...local, listingId: 'vu_5555', securityId: 'security_5555', ticker: 'NESN', symbol: 'NESN', companyName: 'Nestlé SA', name: 'Nestlé SA', tradingCurrency: 'CHF', country: 'CH', listingCountry: 'CH', mic: 'XSWX' };
  const { dir } = fixture({
    '/global/manifest.json': { schemaVersion: 'global-market-1.0.0', instrumentShards: ['SA', 'SP'], searchShards: ['SA', 'SP', 'DE', 'XE', 'WA', 'NE'] },
    '/global/search/SA.json': { entries: [meta] },
    '/global/search/DE.json': { entries: [meta] },
    '/global/search/XE.json': { entries: [meta] },
    '/global/search/WA.json': { entries: [meta] },
    '/global/search/NE.json': { entries: [swiss] }
  });
  for (const query of ['DE0007164600', 'XETR', 'DE', 'Walldorf']) {
    assert.equal((await dir.search(query)).entries[0]?.i, meta.listingId, query);
  }
  for (const query of ['Nestlé', 'Nestle']) assert.equal((await dir.search(query)).entries[0]?.i, swiss.listingId, query);
  assert.equal((await dir.search('SAP')).entries[0].i, us.instrumentId);
});

test('venue-only price/history/fundamental requests use the same exact listing as identity', async () => {
  const { dir } = fixture();
  const xetra = { symbol: 'SAP', mic: 'XETR' }, nyse = { symbol: 'SAP', exchange: 'NYSE' }, unsupported = { symbol: 'SAP', mic: 'XLON' };
  assert.equal((await dir.getPrice(xetra)).value, 205);
  assert.equal((await dir.getPrice(xetra)).currency, 'EUR');
  assert.deepEqual((await dir.getPriceHistory(xetra)).bars, [['2026-09-30', 205]]);
  assert.equal((await dir.getFundamentals(xetra)).status, 'NOT_DELIVERED');
  assert.equal((await dir.getPrice(nyse)).value, 245);
  assert.deepEqual((await dir.getPriceHistory(nyse)).bars, [['2026-09-30', 245]]);
  assert.equal((await dir.getFundamentals(nyse)).fundamentals.revenue, 123);
  assert.equal((await dir.getPrice(unsupported)).status, 'NOT_IN_UNIVERSE');
  assert.equal((await dir.getPriceHistory(unsupported)).status, 'NOT_IN_UNIVERSE');
  assert.equal((await dir.getFundamentals(unsupported)).status, 'NOT_IN_UNIVERSE');
});

test('explicit global scope resolves an accepted legacy listing ID to canonical extension data', async () => {
  const accepted = { ...local, universeId: 'GLOBAL_MARKET', listingId: us.instrumentId, historyPath: 'history/' + us.instrumentId + '.json' };
  const { dir } = fixture({ '/global/instruments/SA.json': { instruments: [accepted] } });
  const ref = { symbol: 'SAP', listingId: us.instrumentId, universeId: 'GLOBAL_MARKET' };
  assert.equal((await dir.getInstrument(ref)).instrument.universeId, 'GLOBAL_MARKET');
  assert.equal((await dir.getInstrument(ref)).instrument.mic, 'XETR');
  assert.equal((await dir.getPrice(ref)).value, 205);
  assert.equal((await dir.getFundamentals(ref)).status, 'NOT_DELIVERED');
  assert.equal((await dir.getPrice({ symbol: 'SAP', listingId: us.instrumentId })).value, 245);
});

test('confirmed preferred equity remains preferred in directory/search classification', async () => {
  const preferred = { ...local, listingType: 'PREFERRED' };
  const { dir } = fixture({ '/global/instruments/SA.json': { instruments: [preferred] }, '/global/search/SA.json': { entries: [preferred] } });
  assert.equal((await dir.getInstrument({ symbol: 'SAP', listingId: local.listingId })).instrument.securityType, 'PREFERRED');
  assert.equal((await dir.search('SAP')).entries.find(row => row.i === local.listingId).t, 'PREFERRED');
});


test('search enriches one reused accepted listing ID instead of hiding canonical availability', async () => {
  const accepted = { ...local, universeId: 'GLOBAL_MARKET', listingId: us.instrumentId };
  const { dir } = fixture({ '/global/search/SA.json': { entries: [accepted] } });
  const result = await dir.search('SAP');
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].i, us.instrumentId);
  assert.equal(result.entries[0].universeId, 'GLOBAL_MARKET');
  assert.equal(result.entries[0].u, 'EUR');
});

test('extension-only metadata search cannot be crowded out by US ticker/name results', async () => {
  const { dir, paths } = fixture({
    '/global/manifest.json': { schemaVersion: 'global-market-1.0.0', instrumentShards: ['SA'], searchShards: ['DE'] },
    '/global/search/DE.json': { entries: [{ ...local, universeId: 'GLOBAL_MARKET' }] }
  });
  const result = await dir.search('DE', { extensionOnly: true, limit: 14 });
  assert.equal(result.entries[0].li, local.listingId);
  assert.equal(paths.some(path => path.startsWith('/legacy/')), false);
});

test('European listing region is searchable without inferring unknown issuer country/region', async () => {
  const unknownIssuer = { ...local, country: null, region: null, listingCountry: 'DE', listingRegion: 'EUROPE', companyId: null, universeId: 'GLOBAL_MARKET' };
  const { dir } = fixture({
    '/global/manifest.json': { schemaVersion: 'global-market-1.0.0', instrumentShards: ['SA'], searchShards: ['EU'] },
    '/global/instruments/SA.json': { instruments: [unknownIssuer] },
    '/global/search/EU.json': { entries: [unknownIssuer] }
  });
  const result = await dir.search('EUROPE', { extensionOnly: true });
  assert.equal(result.entries[0].i, local.listingId);
  assert.equal(result.entries[0].rg, 'EUROPE');
  assert.equal(result.entries[0].cc, null);
  assert.equal(result.entries[0].country, null);
  assert.equal(result.entries[0].region, null);
  assert.equal(result.entries[0].c, 'DE');
  const identity = await dir.getInstrument({ symbol: 'SAP', listingId: local.listingId, universeId: 'GLOBAL_MARKET' });
  assert.equal(identity.instrument.country, null); assert.equal(identity.instrument.companyId, null);
});

test('explicit listing geography filters exclude foreign names containing the country code', async () => {
  const spanish = { ...local, listingId: 'vu_aaaa', companyName: 'Industria de Diseño Textil', listingCountry: 'ES', listingRegion: 'EUROPE' };
  const german = { ...local, country: null, region: null, listingCountry: 'DE', listingRegion: 'EUROPE' };
  const { dir } = fixture({
    '/global/manifest.json': { schemaVersion: 'global-market-1.0.0', instrumentShards: ['SA'], searchShards: ['DE'] },
    '/global/search/DE.json': { entries: [spanish, german] }
  });
  const generic = await dir.search('DE', { extensionOnly: true });
  assert.equal(generic.entries.length, 2, 'generic symbol/name search remains broad');
  const geography = await dir.search('DE', { extensionOnly: true, listingCountry: 'DE' });
  assert.equal(geography.entries.length, 1); assert.equal(geography.entries[0].li, local.listingId);
  assert.equal(geography.entries[0].country, null);
});
