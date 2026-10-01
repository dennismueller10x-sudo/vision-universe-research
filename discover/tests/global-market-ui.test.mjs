import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

class Node {
  constructor(tag, attrs = {}, children = []) { this.tag = tag; this.attrs = attrs; this.children = children; this.textContent = attrs.text || ''; this.events = {}; this.style = {}; this.classList = { add() {}, remove() {} }; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(key, listener) { this.events[key] = listener; }
}
const text = node => typeof node === 'string' ? node : (node.textContent || '') + (node.children || []).map(text).join(' ');
const find = (node, predicate) => predicate(node) ? node : (node.children || []).map(child => typeof child === 'object' ? find(child, predicate) : null).find(Boolean);
function context(extra = {}) {
  const ctx = { QuantShell: { el: (tag, attrs, children) => new Node(tag, attrs, children), clear: node => { node.children = []; } },
    VUDiscover: { Cards: { svg: (tag, attrs) => new Node(tag, attrs) }, Klartext: { prozent: String } },
    document: { body: new Node("body"), createTextNode: value => value, addEventListener() {} }, innerWidth: 390, ...extra };
  ctx.window = ctx; vm.createContext(ctx); return ctx;
}
const listing = { symbol: 'SAP', ticker: 'SAP', instrumentId: 'vu_2222', listingId: 'vu_2222', universeId: 'GLOBAL_MARKET', companyName: 'SAP SE', mic: 'XETR', exchange: 'Xetra', securityType: 'COMMON_STOCK', assetType: 'EQUITY', currency: 'EUR', tradingCurrency: 'EUR' };
const result = row => ({ instrument: row, capabilities: { HAS_PRICE_SNAPSHOT: true, HAS_PRICE_HISTORY: true }, price: { status: 'OK', value: 205, asOf: '2026-09-30' }, history: { status: 'OK', bars: [{ date: '2026-09-29', open: 200, high: 203, low: 199, close: 202, volume: 10 }, { date: '2026-09-30', open: 204, high: 207, low: 203, close: 205, volume: 30 }] } });

test('canonical listing detail renders original EUR/closes while legacy master retains no chart', () => {
  const calls = [], ctx = context({ QuantCharts: { lineChart: options => { calls.push(options); return new Node('svg'); } }, VUFx: { Format: { formatPrice: (value, currency) => value + ' ' + currency } } });
  vm.runInContext(readFileSync(new URL('../ui/detail.js', import.meta.url), 'utf8'), ctx);
  const root = new Node('main'); ctx.VUDiscover.Detail.renderInstrument(root, result(listing));
  assert.equal(calls.length, 1); assert.equal(calls[0].series[0].values[0], 202); assert.equal(calls[0].dates[0], '2026-09-29');
  assert.match(text(root), /205 EUR/); assert.match(text(root), /Tagesschluss/); assert.match(text(root), /historische Schlusskurse/);
  assert.equal(find(root, node => node.attrs['data-listing-id'] === listing.listingId).attrs['data-currency'], 'EUR');
  const legacy = new Node('main'); ctx.VUDiscover.Detail.renderInstrument(legacy, { instrument: { ...listing, universeId: 'US_REAL' }, capabilities: {} });
  assert.equal(calls.length, 1, 'legacy master page must not gain a synthetic chart');
  assert.equal(find(legacy, node => node.tag === 'svg'), undefined);
});

test('ETF identity page omits company earnings/valuation and shows fund identity', () => {
  const ctx = context({ QuantCharts: { lineChart: () => new Node('svg') }, VUFx: { Format: { formatPrice: (value, currency) => value + ' ' + currency } } });
  vm.runInContext(readFileSync(new URL('../ui/detail.js', import.meta.url), 'utf8'), ctx);
  const root = new Node('main');
  ctx.VUDiscover.Detail.renderInstrument(root, result({ ...listing, assetType: 'ETF', securityType: 'ETF', fundId: 'fund_2222', isin: 'IE00B4L5Y983' }));
  assert.match(text(root), /ISIN/); assert.match(text(root), /IE00B4L5Y983/);
  assert.doesNotMatch(text(root), /Interne Kennung|fund_2222/);
  assert.doesNotMatch(text(root), /Geschäftszahlen|Bewertung|CIK \(SEC\)/);
});

test('search keeps legacy URL and uses explicit global listing URL for colliding ticker', async () => {
  const globalHit = { ...listing, i: listing.listingId, li: listing.listingId, s: 'SAP', n: 'SAP SE', x: 'Xetra', cc: 'DE', u: 'EUR', t: 'COMMON_STOCK' };
  const legacyHit = { s: 'SAP', n: 'SAP US ADR', m: true };
  const ctx = context({ location: {}, VUInstrumentDirectory: { create: options => { assert.equal(options.extensionBase, '/quant/data/global-market/'); return { search: async () => ({ entries: [globalHit] }) }; } } });
  ctx.QuantShell.loadJSON = async () => ({ entries: [legacyHit], universeLabel: 'US Equities' });
  vm.runInContext(readFileSync(new URL('../ui/search.js', import.meta.url), 'utf8'), ctx);
  const search = ctx.VUDiscover.Search.create({ extensionBase: '/quant/data/global-market/', universeId: () => 'US_REAL' });
  const input = find(search.node, node => node.tag === 'input'); input.value = 'SAP'; input.events.input();
  await new Promise(resolve => setImmediate(resolve));
  const results = find(search.node, node => node.attrs.role === 'listbox');
  assert.equal(results.children.length, 2);
  results.children[0].events.click(); assert.equal(ctx.location.hash, '#/s/US_REAL/SAP');
  results.children[1].events.click(); assert.equal(ctx.location.hash, '#/s/GLOBAL_MARKET/SAP/vu_2222');
  assert.match(text(results.children[1]), /Xetra/); assert.match(text(results.children[1]), /EUR/);
});

test('geographic search keeps existing US ADR order while exposing local listings', async () => {
  const legacy = Array.from({ length: 20 }, (_, index) => ({ s: 'ADR' + index, n: 'European ADR ' + index, rg: 'EUROPE', m: true }));
  const globalHit = { ...listing, i: listing.listingId, li: listing.listingId, s: 'SAP', n: 'SAP SE', x: 'Xetra', cc: 'DE', u: 'EUR' };
  const ctx = context({ location: {}, VUGlobalEquities: { geographyQuery: () => ({ region: 'EUROPE' }) }, VUInstrumentDirectory: { create: () => ({ search: async (query, options) => { assert.equal(query, 'EUROPE'); assert.equal(options.listingRegion, 'EUROPE'); return { entries: [globalHit] }; } }) } });
  ctx.QuantShell.loadJSON = async () => ({ entries: legacy, universeLabel: 'US Equities' });
  vm.runInContext(readFileSync(new URL('../ui/search.js', import.meta.url), 'utf8'), ctx);
  const search = ctx.VUDiscover.Search.create({ extensionBase: '/quant/data/global-market/' });
  const input = find(search.node, node => node.tag === 'input'); input.value = 'Europe'; input.events.input();
  await new Promise(resolve => setImmediate(resolve));
  const results = find(search.node, node => node.attrs.role === 'listbox');
  assert.equal(results.children.length, 8);
  assert.match(text(results.children[0]), /ADR0/); assert.match(text(results.children[6]), /ADR6/);
  assert.match(text(results.children[7]), /SAP SE/); assert.match(text(results.children[7]), /Xetra/);
});


test('canonical chart labels partial coverage and unknown adjustment without changing legacy detail', () => {
  const ctx = context({ QuantCharts: { lineChart: () => new Node('svg') } });
  vm.runInContext(readFileSync(new URL('../ui/detail.js', import.meta.url), 'utf8'), ctx);
  for (const evidence of [{ quality: { status: 'PARTIAL' } }, { coverage: { price_history: 'PARTIAL' } }]) {
    const root = new Node('main');
    const data = result({ ...listing, ...evidence }); data.history.adjustmentStatus = 'unknown';
    ctx.VUDiscover.Detail.renderInstrument(root, data);
    assert.match(text(root), /Begrenzte historische Datenabdeckung\. Kursbereinigung nicht verifiziert\./);
  }
  const full = new Node('main'), verified = result({ ...listing, coverage: { price_history: 'FULL' } }); verified.history.adjustmentStatus = 'adjusted';
  ctx.VUDiscover.Detail.renderInstrument(full, verified);
  assert.doesNotMatch(text(full), /Begrenzte historische Datenabdeckung|Kursbereinigung nicht verifiziert/);
  const legacy = new Node('main'); ctx.VUDiscover.Detail.renderInstrument(legacy, { instrument: { ...listing, universeId: 'US_REAL' }, capabilities: {} });
  assert.doesNotMatch(text(legacy), /Begrenzte historische Datenabdeckung|Kursbereinigung nicht verifiziert/);
});

test('canonical detail distinguishes known trading country from unknown issuer country', () => {
  const ctx = context({ QuantCharts: { lineChart: () => new Node('svg') } });
  vm.runInContext(readFileSync(new URL('../ui/detail.js', import.meta.url), 'utf8'), ctx);
  const root = new Node('main'); ctx.VUDiscover.Detail.renderInstrument(root, result({ ...listing, country: null, listingCountry: 'DE' }));
  assert.match(text(root), /Handelsland DE/); assert.match(text(root), /Unternehmensland unbekannt/);
  assert.doesNotMatch(text(root), /Unternehmensland DE/);
});

test('limited history alone does not invent gaps; measured quarantines explicitly label missing days', () => {
  const ctx = context({ QuantCharts: { lineChart: () => new Node('svg') } });
  vm.runInContext(readFileSync(new URL('../ui/detail.js', import.meta.url), 'utf8'), ctx);
  const limited = new Node('main'); ctx.VUDiscover.Detail.renderInstrument(limited, result({ ...listing, coverage: { price_history: 'PARTIAL' } }));
  assert.match(text(limited), /Begrenzte historische Datenabdeckung/);
  assert.doesNotMatch(text(limited), /Einzelne Tageskurse fehlen/);
  const quarantined = new Node('main'); ctx.VUDiscover.Detail.renderInstrument(quarantined, result({ ...listing, quality: { status: 'PARTIAL', quarantinedCandles: 3 } }));
  assert.match(text(quarantined), /Einzelne Tageskurse fehlen/);
});
