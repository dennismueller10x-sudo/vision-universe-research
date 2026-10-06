import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const Listings = require('../engines/local-listings.js');
const sap = { listingId: 'lst_XETR_DE0007164600', ticker: 'SAP', name: 'SAP SE', mic: 'XETR', tradingCurrency: 'EUR' };
const alternate = { ...sap, listingId: 'lst_XFRA_DE0007164600', mic: 'XFRA' };
function storage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}

test('local SAP and its alternate listing survive save/reload/removal without modifying a legacy US watchlist', () => {
  const legacy = JSON.stringify(['SAP', 'BRK-B']);
  const store = storage({ 'vu-discover-watchlist-v1': legacy });
  assert.equal(Listings.toggle(store, sap), true);
  assert.equal(Listings.toggle(store, alternate), true);
  assert.deepEqual(Listings.saved(store).map(row => row.listingId), [alternate.listingId, sap.listingId]);
  assert.equal(Listings.contains(store, sap), true);
  assert.equal(Listings.toggle(store, sap), false);
  assert.equal(Listings.contains(store, alternate), true);
  assert.equal(store.getItem('vu-discover-watchlist-v1'), legacy);
  assert.equal(Listings.href(alternate), '#/listing/lst_XFRA_DE0007164600');
});

test('corrupt, duplicate and ticker-only local references never become a saved listing', () => {
  const store = storage({ [Listings.KEY]: JSON.stringify([sap, sap, { ticker: 'SAP' }, { ...sap, listingId: '../../SAP' }]) });
  assert.equal(Listings.saved(store).length, 1);
  assert.throws(() => Listings.toggle(store, { ticker: 'SAP' }), /LISTING_ID_REQUIRED/);
  assert.deepEqual(Listings.saved(storage({ [Listings.KEY]: 'invalid-json' })), []);
});

test('a missing or quarantined company proof never selects an old ticker logo', () => {
  assert.equal(Listings.logoSymbol(sap), '');
  assert.equal(Listings.logoSymbol({ ...sap, companyId: 'company-sap', logo: { status: 'VERIFIED_LOGO', symbol: 'SAP', companyId: 'company-wrong' } }), '');
  assert.equal(Listings.logoSymbol({ ...sap, companyId: 'company-sap', logo: { status: 'SUSPECT_QUARANTINED', symbol: 'SAP', companyId: 'company-sap' } }), '');
  assert.equal(Listings.logoSymbol({ ...sap, companyId: 'company-sap', logo: { status: 'VERIFIED_LOGO', symbol: 'SAP', companyId: 'company-sap' } }), 'SAP');
});

test('a reloaded watchlist resolves company logos from the canonical directory and ignores forged localStorage proof', () => {
  const store = storage({ [Listings.KEY]: JSON.stringify([{ ...sap, companyId: 'forged', logo: { companyId: 'forged', status: 'VERIFIED_LOGO', symbol: 'FAKE' } }]) });
  assert.equal(Listings.logoSymbol(Listings.saved(store)[0]), '');
  assert.equal(Listings.logoSymbol(Listings.resolveSaved(store, [sap])[0]), '');
  const canonical = { ...sap, companyId: 'company-sap', logo: { status: 'VERIFIED_LOGO', companyId: 'company-sap', symbol: 'SAP' } };
  assert.equal(Listings.logoSymbol(Listings.resolveSaved(store, [canonical])[0]), 'SAP');
  assert.equal(Listings.logoSymbol(Listings.resolveSaved(store, [])[0]), '');
});

test('an evidenced legal issuer reference binds a logo without claiming a normalized fundamental company', () => {
  const issuer = 'iss_lei_529900K9B0N5BT694847';
  const canonical = { ...sap, companyId: null, referencedIssuerId: issuer,
    logo: { status: 'VERIFIED_LOGO', companyId: issuer, symbol: 'LEI-529900K9B0N5BT694847' } };
  assert.equal(Listings.logoSymbol(canonical), 'LEI-529900K9B0N5BT694847');
  assert.equal(Listings.logoSymbol({ ...canonical, referencedIssuerId: 'iss_lei_WRONG' }), '');
  assert.equal(Listings.logoSymbol({ ...canonical, companyId: 'company-conflict' }), '');
  const store = storage({ [Listings.KEY]: JSON.stringify([canonical]) });
  assert.equal(Listings.saved(store)[0].referencedIssuerId, undefined);
  assert.equal(Listings.logoSymbol(Listings.saved(store)[0]), '');
  assert.equal(Listings.logoSymbol(Listings.resolveSaved(store, [canonical])[0]), canonical.logo.symbol);
  assert.equal(Listings.resolveSaved(store, [canonical])[0].companyId, null);
});

test('detail uses only the exact central listing contracts and preserves an unavailable quote separately from a usable series', async () => {
  const calls = [];
  const core = {
    getListing: async id => { calls.push(['identity', id]); return { state: 'AVAILABLE', data: sap }; },
    getListingLatestPrice: async id => { calls.push(['quote', id]); return { state: 'UNAVAILABLE', reason: 'STALE' }; },
    getListingPriceSeries: async id => { calls.push(['series', id]); return { state: 'AVAILABLE', data: { points: [['2026-01-01', 1]] } }; }
  };
  const result = await Listings.create({ core }).detail(sap.listingId);
  assert.equal(result.price.reason, 'STALE');
  assert.equal(result.series.data.points.length, 1);
  assert.deepEqual(calls, [['identity', sap.listingId], ['quote', sap.listingId], ['series', sap.listingId]]);
});

test('an unresolved listing blocks all quote/history loads, with no ticker or US fallback', async () => {
  const core = {
    getListing: async () => ({ state: 'UNAVAILABLE', reason: 'MAPPING_ERROR' }),
    getListingLatestPrice: () => assert.fail('must not request prices for unresolved mapping'),
    getListingPriceSeries: () => assert.fail('must not request a history for unresolved mapping')
  };
  const result = await Listings.create({ core }).detail(sap.listingId);
  assert.equal(result.series.reason, 'MAPPING_ERROR');
});

test('denied browser storage is reported to the caller and cannot become a saved success', () => {
  const store = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.deepEqual(Listings.saved(store), []);
  assert.throws(() => Listings.toggle(store, sap), /denied/);
});

test('uncertain local history draws observations without a connecting line; the default US microchart is unchanged', () => {
  const sandbox = { window: {}, document: { createElementNS: (_ns, tag) => ({ tag, attributes: {}, children: [],
    setAttribute(key, value) { this.attributes[key] = value; }, appendChild(child) { this.children.push(child); } }) } };
  vm.runInNewContext(readFileSync(new URL('../ui/microchart.js', import.meta.url), 'utf8'), sandbox);
  const chart = sandbox.window.VUDiscover.MicroChart;
  const history = { status: 'CALCULATED', source: 'central-fixture', points: [['2026-01-02', 10], ['2026-01-05', 11], ['2026-01-06', 12], ['2026-02-02', 13], ['2026-02-03', 14]] };
  const local = chart.render(history, { pointsOnly: true });
  assert.equal(local.children.filter(x => x.tag === 'path').length, 0);
  assert.equal(local.children.filter(x => x.tag === 'circle').length, 6);
  const legacy = chart.render(history);
  assert.equal(legacy.children.filter(x => x.tag === 'path' && x.attributes.class === 'dx-art-line').length, 1);
});


test('local list prices come from the compact central screener contract without fetching every series', async () => {
  const row = { ...sap, price: { listingId: sap.listingId, close: 125, date: '2026-10-05', currency: 'EUR' } };
  const filters = { index: 'DAX' };
  const api = Listings.create({ core: { getListingScreener: async input => { assert.deepEqual(input, filters); return { state: 'AVAILABLE', data: { listings: [row] } }; } } });
  assert.equal((await api.screen(filters)).data.listings[0].price.close, 125);
  assert.equal((await Listings.create({ core: {} }).screen()).reason, 'PRODUCT_INTEGRATION_MISSING');
});


test('notierungseinheit keeps verified GBP pence separate from GBP major units without converting the price', () => {
  assert.equal(Listings.unitLabel('GBP', 'MINOR'), 'GBX');
  assert.equal(Listings.unitLabel('GBP', 'MAJOR'), 'GBP');
  assert.equal(Listings.unitLabel('EUR', 'MINOR'), 'EUR Untereinheit');
});
