import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolveProductUniverse, loadGlobalEquities } from '../../scripts/market/universe-source.mjs';
const require = createRequire(import.meta.url);
const G = require('../engines/global-equities.js');
const Tiingo = require('../../providers/tiingo/adapter.js');
const Symbols = require('../engines/symbol-mapping.js');
const Hours = require('../engines/realtime/market-hours.js');
const Session = require('../engines/realtime/trading-session.js');
const Schema = require('../engines/schema.js');
const { resolveIdentity } = require('../../server/product-identity.js');
const { createOfficialFilingsProvider } = require('../../providers/official-filings/adapter.js');
const Watch = require('../../discover/engines/watchlist-store.js');
const root = new URL('../../', import.meta.url).pathname;

test('global identity is an additive projection of the exact US baseline', () => {
  const source = resolveProductUniverse(root);
  const baseline = JSON.parse(readFileSync(root + 'quant/data/market/security-master/eligibility.json')).decisions.filter(r => r.product_eligibility !== 'EXCLUDED');
  assert.deepEqual(source.securities.map(r => r.securityId).sort(), baseline.map(r => r.securityId).sort());
  const nvda = source.securities.find(r => r.ticker === 'NVDA');
  assert.equal(nvda.securityId, 'ref_NVDA');
  assert.equal(nvda.companyId, undefined);
  for (const t of ['SAP', 'ASML', 'NVO', 'TSM', 'BABA', 'XPEV', 'SONY', 'TM', 'NVS', 'AZN']) {
    const row = source.securities.find(r => r.ticker === t);
    assert.ok(row?.companyId, t);
    assert.equal(row.tradingCurrency, 'USD', t + ' is the US listing');
    assert.equal(row.listingCountry, 'US');
    assert.equal(row.coverage.price, 'VERIFIED');
    assert.ok(row.globalSource.startsWith('https://data.sec.gov/submissions/'));
  }
  assert.equal(source.securities.find(r => r.ticker === 'SAP').companyCountry, 'DE');
  assert.equal(source.securities.find(r => r.ticker === 'ASML').companyCountry, 'NL');
  assert.equal(source.securities.find(r => r.ticker === 'TSM').companyCountry, 'TW');
});

test('global identity rejects wrong listing overlays, duplicates, ETFs and unverifiable ratios', () => {
  const layer = loadGlobalEquities(root), row = layer.listings[0];
  assert.throws(() => G.validate({ ...layer, listings: [row, row] }), /DUPLICATE/);
  assert.throws(() => G.validate({ ...layer, listings: [{ ...row, assetType: 'ETF' }] }), /NON_EQUITY/);
  assert.throws(() => G.validate({ ...layer, listings: [{ ...row, adrRatio: 2 }] }), /RATIO/);
  assert.throws(() => G.overlay([{ securityId: row.securityId, ticker: 'WRONG' }], layer), /MISMATCH/);
});

test('ADR selection requires active, liquid, verified coverage; OTC is never preferred', () => {
  const base = { active: true, assetType: 'EQUITY', historyBars: 400, avgDailyTurnoverUSD: 2e7, coverage: { price: 'VERIFIED' } };
  const local = { ...base, ticker: 'LOCAL', mic: 'XTAI', listingCountry: 'TW', primaryListing: true };
  const adr = { ...base, ticker: 'ADR', mic: 'XNYS', listingCountry: 'US', listingType: 'ADR' };
  assert.equal(G.selectPreferred([local, adr]).ticker, 'ADR');
  assert.equal(G.selectPreferred([local, { ...adr, otc: true }]).ticker, 'LOCAL');
  assert.equal(G.selectPreferred([{ ...adr, coverage: { price: 'UNVERIFIED' } }]), null);
  assert.equal(G.selectPreferred([{ ...adr, active: false }]), null);
});

test('ADR ratio and currencies cannot silently produce mismatched valuations', () => {
  assert.equal(G.valuationGate(null, 'USD'), null);
  assert.equal(G.valuationGate({ listingType: 'ADR', tradingCurrency: 'USD' }, 'USD'), 'ADR_RATIO_UNVERIFIED');
  assert.equal(G.valuationGate({ listingType: 'ADR', tradingCurrency: 'USD', adrRatio: 5, adrRatioSource: 'official' }, 'TWD'), 'NON_USD_REPORTING');
  assert.equal(G.valuationGate({ listingType: 'ORDINARY', tradingCurrency: 'EUR' }, 'GBP'), 'REPORTING_TRADING_CURRENCY_MISMATCH');
  const adr = { listingType: 'ADR', adrRatio: 2, adrRatioSource: 'test-official-depositary', shareCountBasis: 'ORDINARY', shareCountBasisSource: 'test-official-filing', epsBasis: 'ORDINARY', epsBasisSource: 'test-official-filing' };
  assert.equal(G.listingShares(100, adr), 50);
  assert.equal(G.listingEps(3, adr), 6);
  assert.equal(G.listingShares(100, { ...adr, shareCountBasisSource: null }), null);
  assert.equal(G.listingEps(3, { ...adr, epsBasisSource: null }), null);
});

test('price quality reports corrupt or duplicated history without deleting valid split-like moves', () => {
  assert.deepEqual(G.priceQuality([['2025-01-01', 100], ['2025-01-02', 10]]), ['PRICE_SPIKE_REVIEW']);
  assert.ok(G.priceQuality([['2025-01-01', 100], ['2025-01-01', -2]]).includes('PRICE_POINT_INVALID'));
  assert.ok(G.priceQuality([['2025-01-01', 100], ['2025-01-01', 99]]).includes('DUPLICATE_PRICE_DATE'));
  assert.deepEqual(G.geographyQuery('German stocks'), { country: 'DE' });
  assert.deepEqual(G.geographyQuery('European equities'), { region: 'EUROPE' });
  assert.equal(G.geographyQuery('NVDA'), null);
});

test('daily PIT is unchanged while offset publication instants and revisions cannot leak backward', () => {
  const f = { metricId: 'revenue', periodEnd: '2025-12-31', availableAt: '2026-02-20', revisionId: 0, value: 1 };
  assert.equal(Schema.latestKnownFact([f], 'revenue', '2026-02-20').value, 1);
  assert.equal(Schema.latestKnownFact([f], 'revenue', '2026-02-20T10:00:00Z'), null);
  const revision = { ...f, availableAt: '2026-03-01T17:00:00+01:00', revisionId: 1, value: 2 };
  assert.equal(Schema.latestKnownFact([f, revision], 'revenue', '2026-03-01T15:59:59Z').value, 1);
  assert.equal(Schema.latestKnownFact([f, revision], 'revenue', '2026-03-01T16:00:00Z').value, 2);
});

test('watchlists preserve legacy entries and distinguish equal tickers by listing ID', () => {
  const saved = new Map([['vu-discover-watchlist-v1', JSON.stringify(['NVDA', 'SAP'])]]);
  const storage = { getItem: k => saved.get(k) || null, setItem: (k, v) => saved.set(k, v) };
  const before = saved.get('vu-discover-watchlist-v1');
  assert.equal(Watch.load(storage).length, 2);
  assert.equal(saved.get('vu-discover-watchlist-v1'), before);
  const first = Watch.reference('ABC', { listingId: 'vu_aaa', exchange: 'NYSE' }, 'US_REAL');
  const second = Watch.reference('ABC', { listingId: 'vu_bbb', exchange: 'XETRA' }, 'GLOBAL_LOCAL');
  Watch.toggle(storage, first); Watch.toggle(storage, second);
  assert.equal(Watch.load(storage).filter(r => r.ticker === 'ABC').length, 2);
  Watch.toggle(storage, first);
  assert.equal(Watch.contains(storage, second), true);
  assert.equal(Watch.isSaved(Watch.load(storage), first), false);
  assert.equal(Watch.isSaved(Watch.load(storage), second), true);
  assert.deepEqual(Watch.load({ getItem() { throw Error('storage disabled'); } }), []);
  assert.doesNotThrow(() => Watch.assertListing({ instrumentId: 'vu_bbb' }, 'vu_bbb'));
  assert.throws(() => Watch.assertListing({ instrumentId: 'vu_bbb' }, 'vu_aaa'), /Listing/);
  assert.equal(saved.get('vu-discover-watchlist-v1'), before);
  Watch.toggle(storage, Watch.reference('SAP', { listingId: 'vu_ccc' }));
  assert.deepEqual(JSON.parse(saved.get('vu-discover-watchlist-v1')), ['NVDA']);
});

test('real official LVMH facts use canonical units, recorded source and conservative publication availability', () => {
  const p = createOfficialFilingsProvider();
  const id = 'vu_lei_IOG4E947OATN0KJYSD45';
  assert.equal(p.getFacts(id, { asOf: '2025-03-24' }).available, false);
  assert.equal(p.getFacts(id, { asOf: '2025-03-25T12:00:00Z' }).available, false);
  const r = p.getFacts(id, { asOf: '2025-03-25' });
  assert.equal(r.available, true);
  const revenue = r.data.find(f => f.metricId === 'revenue' && f.fiscalYear === 2024);
  assert.equal(revenue.value, 84683); assert.equal(revenue.unit, 'currency_m'); assert.equal(revenue.currency, 'EUR');
  assert.equal(r.provenance.isMock, false);
  assert.equal(p.getFilings(id, { asOf: '2025-03-25' }).data[0].formType, 'ESEF');
  assert.equal(r.data.some(f => f.metricId === 'netIncome'), false); // conflicting semantic candidates quarantined
});

test('daily prices and corporate actions preserve mapped currency; local listings cannot use US IEX', async () => {
  let requests = 0;
  const p = Tiingo.createTiingoProvider({ apiKey: 'test-only', symbolRegistry: Symbols.createRegistry([
    { securityId: 'test_local', providerId: 'tiingo', providerSymbol: 'provider-exact', currency: 'EUR', country: 'DE', mic: 'XETR' }
  ]), fetchImpl: async () => { requests++; return { ok: true, status: 200, headers: { get: () => null }, json: async () => [{ date: '2025-01-02', close: 100, open: 99, high: 101, low: 98, volume: 5000, splitFactor: 1, divCash: 0.5 }] }; } });
  const result = await p.getDailyBars('test_local', { currency: 'USD' });
  assert.equal(result.data.currency, 'EUR');
  assert.equal(result.data.bars[0].currency, 'EUR');
  assert.equal((await p.getQuote('test_local')).reason, 'unsupportedExchange');
  assert.equal((await p.getIntradayBars('test_local')).reason, 'unsupportedExchange');
  assert.equal(requests, 1);
});

test('unknown exchange never inherits New York trading hours', () => {
  const r = Hours.sessionAt('2026-09-30T15:00:00Z', { exchange: 'UNKNOWN' });
  assert.equal(r.isOpen, false); assert.equal(r.timezone, null); assert.equal(r.calendarCoverage, false);
  assert.equal(Session.resolve('2026-09-30T15:00:00Z', { exchange: 'UNKNOWN' }).displaySession, null);
  const calendar = JSON.parse(readFileSync(root + 'quant/config/market-calendar.json'));
  assert.equal(Hours.sessionAt('2026-09-30T08:00:00Z', { exchange: 'XETR', calendar }).timezone, 'Europe/Berlin');
  assert.equal(Hours.sessionAt('2026-09-30T08:00:00Z', { exchange: 'XNYS', calendar }).timezone, 'America/New_York');
});

test('colliding ticker URLs require an ID or exchange, while old unambiguous IDs resolve', async () => {
  const first = { symbol: 'ABC', instrumentId: 'vu_aa', masterMemberId: 'ref_ABC', legacyIds: ['ref_ABC'], productEligibility: 'ELIGIBLE', primaryListing: true, mic: 'XNYS' };
  const second = { ...first, instrumentId: 'vu_bb', masterMemberId: 'local_ABC', legacyIds: ['local_ABC'], mic: 'XETR' };
  const loadJSON = async () => ({ instruments: [first, second] });
  assert.equal((await resolveIdentity({ ticker: 'ABC' }, { loadJSON })).state, 'AMBIGUOUS_IDENTITY');
  assert.equal((await resolveIdentity({ ticker: 'ABC', securityId: 'ref_ABC' }, { loadJSON })).identity.instrumentId, 'vu_aa');
  assert.equal((await resolveIdentity({ ticker: 'ABC', mic: 'XETR' }, { loadJSON })).identity.instrumentId, 'vu_bb');
  assert.equal((await resolveIdentity({ ticker: 'ABC', listingId: 'vu_bb' }, { loadJSON })).identity.instrumentId, 'vu_bb');
});

test('canonical filings share PIT semantics and one company history across listings', () => {
  const fact = { securityId: 'company', metricId: 'revenue', fiscalPeriod: 'FY', fiscalYear: 2025, periodEnd: '2025-12-31', value: 1, unit: 'currency_m', currency: 'EUR', reportedAt: '2026-02-20', filedAt: '2026-02-20', availableAt: '2026-02-20T16:00:00Z', ingestedAt: '2026-02-21T00:00:00Z', revisionId: 0, restatementStatus: 'original', sourceFilingId: 'official1', dataSourceId: 'ds_official_filings_v1' };
  const b = { schemaVersion: 'official-filing-1.0.0', companyId: 'company', sourceDocument: 'https://issuer.example/filing.xhtml', documentSha256: 'test', availableAt: fact.availableAt, facts: [fact], filing: { filingId: 'official1', securityId: 'company', formType: 'ESEF', fiscalYear: 2025, fiscalPeriod: 'FY', periodEnd: '2025-12-31', filedAt: '2026-02-20', restatementStatus: 'original', dataSourceId: 'ds_official_filings_v1' } };
  const p = createOfficialFilingsProvider({ loadAll: () => [b], listings: [{ securityId: 'local', companyId: 'company' }, { securityId: 'adr', companyId: 'company' }] });
  assert.equal(p.getFacts('local', { asOf: '2026-02-19' }).available, false);
  assert.equal(p.getFacts('local', { asOf: '2026-02-20T15:59:59Z' }).available, false);
  assert.equal(p.getFacts('local', { asOf: '2026-02-20' }).data[0].value, 1);
  assert.equal(p.getFacts('adr', { asOf: '2026-02-20T16:00:00Z' }).data[0].securityId, 'adr');
  assert.equal(Schema.latestKnownFact([fact], 'revenue', '2026-02-20T17:00:00+01:00').value, 1);
  assert.equal(Schema.latestKnownFact([{ ...fact, availableAt: '2026-02-20' }], 'revenue', '2026-02-20T12:00:00Z'), null);
});
