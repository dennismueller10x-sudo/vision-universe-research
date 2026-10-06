import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Identity = require('../../core/identity.js'), Local = require('../engine/local-listings.js');
const Query = require('../engine/query.js'), Engine = require('../engine/engine.js');
const ready = value => ({ status: 'READY', value, unit: 'ratio', asOf: '2026-10-05', inputSeriesHash: 'a'.repeat(64), window: { from: '2024-10-05', to: '2026-10-05' }, evidence: ['existing-engine#synthetic-test-evidence'] });
function row(isin, mic, extra = {}) {
  const base = { isin, mic, listingId: Identity.listingIdFor({ isin, mic }), securityId: Identity.securityIdForISIN(isin),
    ticker: 'SAP', name: 'Synthetic listing ' + mic, tradingCurrency: 'EUR', quoteUnit: 'MAJOR', listingCountry: 'DE', indexMemberships: ['DAX'], fields: {} };
  const r = { ...base, ...extra }; r.price = extra.price === null ? null : { listingId: r.listingId, securityId: r.securityId, mic: r.mic, currency: r.tradingCurrency, close: 100, date: '2026-10-05', quoteUnit: r.quoteUnit, ...extra.price };
  return r;
}
const sap = row('DE0007164600', 'XETR', { fields: { priceVsSma200: ready(0.25), perf6m: ready(0.3) } });
const alt = row('DE0007164600', 'XFRA', { price: { close: 200 }, fields: { priceVsSma200: { ...ready(9), status: 'BLOCKED', reason: 'UNKNOWN_ADJUSTMENT_BASIS' } } });
const asml = row('NL0010273215', 'XAMS', { name: 'Synthetic ASML', listingCountry: 'NL', indexMemberships: ['EURO_STOXX_50'], price: null });
function data(rows = [sap, alt, asml]) { return { state: 'AVAILABLE', data: { listings: rows, privateDevelopment: true, referenceAsOf: '2026-10-05', dataAsOf: '2026-10-06' } }; }
function q(filters = [], sort = { field: 'name', dir: 'asc' }) { const query = Query.empty({ universe: 'EUROPE' }); query.groups[0].filters = filters.map((f, i) => ({ id: 'f' + i, ...f })); query.sort = sort; return Query.validate(query); }

test('local ticker collisions retain distinct canonical listing identities and never acquire a US ref identity', () => {
  const p = Local.prepare(data()); assert.notEqual(p.dataset.indexOf(sap.listingId), p.dataset.indexOf(alt.listingId));
  assert.equal(p.dataset.indexOf('SAP'), -1); assert.equal(p.dataset.indexOf(Identity.securityIdForTicker('SAP')), -1);
  assert.equal(Local.execute(p, q()).total, 3); assert.equal(p.dataset.value('region', 0), 'EUROPE');
});
test('country is the listing venue and non-index companies remain in the unfiltered universe', () => {
  const noIndex = row('FR0000121014', 'XPAR', { listingCountry: 'FR', companyCountry: 'DE', indexMemberships: [] });
  const p = Local.prepare(data([sap, asml, noIndex]));
  assert.equal(Local.execute(p, q()).total, 3);
  assert.deepEqual(Local.execute(p, q([{ field: 'country', op: 'in', value: ['DE'] }])).rows.map(r => r.listingId), [sap.listingId]);
  assert.deepEqual(Local.execute(p, q([{ field: 'index', op: 'in', value: ['EURO_STOXX_50'] }])).rows.map(r => r.listingId), [asml.listingId]);
});
test('issuer domicile stays independent of venue, ISIN prefix and missing evidence', () => {
  const dutchXetra = row('NL0010273215', 'XETR', { companyCountry: 'NL', listingCountry: 'DE' });
  const germanParis = row('DE0007236101', 'XPAR', { companyCountry: 'DE', listingCountry: 'FR' });
  const p = Local.prepare(data([dutchXetra, germanParis, sap]));
  assert.deepEqual(Local.execute(p, q(), { issuerCountry: 'DE' }).rows.map(r => r.listingId), [germanParis.listingId]);
  assert.deepEqual(Local.execute(p, q([{ field: 'country', op: 'in', value: ['DE'] }]), { issuerCountry: 'NL' }).rows.map(r => r.listingId), [dutchXetra.listingId]);
  assert.equal(Local.execute(p, q([{ field: 'country', op: 'in', value: ['DE'] }]), { issuerCountry: 'DE' }).total, 0);
  assert.deepEqual(Local.execute(p, q(), { issuerCountry: 'UNKNOWN' }).rows.map(r => r.listingId), [sap.listingId]);
  assert.equal(Local.issuerCountry(sap), null);
  assert.throws(() => Local.execute(p, q(), { issuerCountry: 'Germany' }), /ISSUER_COUNTRY_INVALID/);
  const params = Query.toParams(q()); params.set('issuerCountry', 'NL');
  const restored = Query.fromParams(new URLSearchParams(params.toString()));
  assert.deepEqual(Local.execute(p, restored, { issuerCountry: params.get('issuerCountry') }).rows.map(r => r.listingId), [dutchXetra.listingId]);
});
test('READY ratios delegate to the existing engine; blocked values remain missing rather than zero or a fake score', () => {
  const p = Local.prepare(data()); const query = q([{ field: 'priceVsSma200', op: 'gte', value: 0.1 }]);
  const actual = Local.execute(p, query), direct = Engine.evaluate(p.dataset, query);
  assert.deepEqual(actual.order, direct.indices); assert.deepEqual(actual.rows.map(r => r.listingId), [sap.listingId]);
  assert.equal(actual.perFilter.f0.missing, 2); assert.equal(p.dataset.value('priceVsSma200', 1), null);
  assert.equal(p.dataset.value('quantScore', 0), null); assert.equal(p.dataset.value('marketCap', 0), null);
  assert.equal(actual.why(0)[0].items[0].value, 0.25);
});
test('price filtering and sorting require an explicit comparable currency or quote unit; GBX is separate from GBP', () => {
  const gbx = row('GB0005405286', 'XLON', { tradingCurrency: 'GBP', quoteUnit: 'MINOR', price: { close: 800 } });
  const gbp = row('GB0007980591', 'XLON', { tradingCurrency: 'GBP', quoteUnit: 'MAJOR', price: { close: 8 } });
  const p = Local.prepare(data([sap, gbx, gbp])); const query = q([{ field: 'price', op: 'gte', value: 10 }]);
  assert.throws(() => Local.execute(p, query), /PRICE_CURRENCY_REQUIRED/);
  assert.throws(() => Local.execute(p, q([], { field: 'price', dir: 'asc' })), /PRICE_CURRENCY_REQUIRED/);
  assert.deepEqual(Local.execute(p, query, { currency: 'EUR' }).rows.map(r => r.listingId), [sap.listingId]);
  assert.equal(Local.execute(p, query, { currency: 'GBP' }).total, 0);
  assert.deepEqual(Local.execute(p, query, { currency: 'GBX' }).rows.map(r => r.listingId), [gbx.listingId]);
  assert.equal(Local.execute(p, query, { currency: 'EUR' }).universe, 1);
});
test('unknown basis, empty evidence, mismatched units and missing validated windows never become usable technical inputs', () => {
  for (const patch of [{ evidence: [] }, { evidence: '' }, { unit: 'percent' }, { window: null }, { window: { from: '2026-10-06', to: '2026-10-05' } }, { value: NaN }, { status: 'PARTIAL' }, { inputSeriesHash: '' }, { asOf: '2026-10-04' }]) {
    const r = { ...sap, fields: { priceVsSma200: { ...ready(0.25), ...patch } } };
    assert.equal(Local.prepare(data([r])).dataset.value('priceVsSma200', 0), null);
  }
});
test('wrong ISIN/MIC price or duplicate listing is rejected instead of borrowing an existing ticker price', () => {
  for (const rows of [[sap, sap], [{ ...sap, listingId: alt.listingId }], [{ ...sap, price: { ...sap.price, mic: 'XNYS' } }], [{ ...sap, price: { ...sap.price, currency: 'USD' } }]]) assert.throws(() => Local.prepare(data(rows)), /IDENTITY_INVALID/);
  assert.throws(() => Local.prepare({ state: 'UNAVAILABLE', reason: 'RIGHTS_UNCONFIRMED' }), /RIGHTS_UNCONFIRMED/);
  assert.throws(() => Local.prepare({ ...data(), data: { ...data().data, privateDevelopment: false } }), /CONTRACT_INVALID/);
});
test('unsupported Quant, US population fields and match rankings fail closed even in shared URLs', () => {
  const p = Local.prepare(data());
  for (const field of ['quantScore', 'relativeStrengthPct', 'marketCap', 'dollarVolume']) {
    assert.throws(() => Local.execute(p, q([{ field, op: 'gte', value: 0 }])), /UNSUPPORTED_FIELD|unavailable-field/);
  }
  assert.throws(() => Local.execute(p, q([], { field: 'match', dir: 'desc' })), /UNSUPPORTED_SORT/);
  const ranked = q(); ranked.ranking.enabled = true; assert.throws(() => Local.execute(p, ranked), /UNSUPPORTED_QUERY/);
});
test('name, provider alias and ISIN selection never requires a separate provider or history load', () => {
  const p = Local.prepare(data([{ ...sap, providerSymbol: 'SAP.XETRA', aliases: ['Synthetic local SAP'] }, alt]));
  assert.equal(Local.execute(p, q(), { query: 'SAP.XETRA' }).total, 1);
  assert.equal(Local.execute(p, q(), { query: sap.isin }).total, 2);
  assert.equal(Local.execute(p, q(), { query: 'Synthetic local SAP' }).total, 1);
});
test('URL encoding retains the same validated engine screen', () => {
  const query = q([{ field: 'index', op: 'in', value: ['DAX'] }, { field: 'priceVsSma200', op: 'gte', value: 0.1 }]);
  const restored = Query.fromParams(Query.toParams(query));
  assert.equal(Query.key(restored), Query.key(query));
  assert.deepEqual(Local.execute(Local.prepare(data()), restored).rows, Local.execute(Local.prepare(data()), query).rows);
});
