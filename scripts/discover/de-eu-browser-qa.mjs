#!/usr/bin/env node
// Existing Discover on a real build. --fixture tests synthetic contracts only;
// without it, this checks the materialized private development selection.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { assertPrivateOutput } from '../marketstack/private-output.mjs';
import { privateOutputFile } from './browser-private-output.mjs';
const require = createRequire(import.meta.url);
const Identity = require('../../core/identity.js');
const arg = (key, fallback) => { const i = process.argv.indexOf('--' + key); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('url', 'http://127.0.0.1:8765').replace(/\/$/, ''), out = assertPrivateOutput(arg('out', '/tmp/de-eu-browser-qa'));
const fixture = process.argv.includes('--fixture'), engine = arg('engine', 'chromium');
assert(['chromium', 'webkit'].includes(engine));
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Private QA must use a loopback preview');
await mkdir(out, { recursive: true });
privateOutputFile(out, 'result.json');
const { chromium, webkit } = require('playwright');
const row = { isin: 'DE0007164600', mic: 'XETR', ticker: 'SAP', name: 'Synthetic SAP fixture',
  listingId: Identity.listingIdFor({ isin: 'DE0007164600', mic: 'XETR' }), securityId: Identity.securityIdForISIN('DE0007164600'),
  assetType: 'EQUITY', tradingCurrency: 'EUR', quoteUnit: 'MAJOR', mappingStatus: 'VERIFIED', mappingSource: 'synthetic-fixture',
  listingCountry: 'DE', region: 'EUROPE', indexMemberships: ['DAX', 'EURO_STOXX_50'], logo: { status: 'MISSING' } };
const directory = { schemaVersion: 'de-eu-directory-1.0.0', privateDevelopment: true, referenceAsOf: '2026-10-06', listings: [row] };
const series = { schemaVersion: 'de-eu-close-series-1.0.0', privateDevelopment: true, listingId: row.listingId,
  securityId: row.securityId, mic: row.mic, currency: 'EUR', quoteUnit: 'MAJOR', provider: 'marketstack', sourceEvidence: 'synthetic-fixture',
  basis: 'PROVIDER_REPORTED_UNVERIFIED', asOf: '2026-10-02', freshness: 'STALE_CACHE', changeVerified: false,
  quality: { quarantinedCandles: 1, completenessVerified: false, priceBasis: 'PROVIDER_REPORTED_UNVERIFIED' },
  points: [['2026-09-21', 100], ['2026-09-22', 101], ['2026-09-23', 102], ['2026-09-29', 103], ['2026-09-30', 104], ['2026-10-02', 105]] };
let selected;
if (fixture) selected = row;
else {
  const result = await fetch(base + '/core/data/de-eu/listings.json'); assert(result.ok);
  const data = await result.json(); assert.equal(data.privateDevelopment, true); assert(data.listings.length > 0);
  const wanted = arg('listing-id', null); selected = wanted ? data.listings.find(x => x.listingId === wanted) : data.listings[0];
  assert(selected, 'Requested listing is not in the development selection');
}
const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
  ...(engine === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] } :
    process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {}) });
const checks = [], failures = [];
try {
  for (const width of engine === 'webkit' ? [390] : [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500,
      ...(fixture ? { serviceWorkers: 'block' } : {}) });
    await context.addInitScript(() => { if (localStorage.getItem('vu-discover-watchlist-v1') === null) localStorage.setItem('vu-discover-watchlist-v1', JSON.stringify(['SAP'])); });
    if (fixture) {
      await context.route('**/core/data/de-eu/listings.json', route => route.fulfill({ json: directory }));
      await context.route('**/core/data/de-eu/series/' + row.listingId + '.json', route => route.fulfill({ json: series }));
    }
    const page = await context.newPage(), errors = [], providerRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/marketstack\.(com|io)|api\.marketstack/.test(new URL(request.url()).hostname)) providerRequests.push('provider-request'); });
    await page.goto(base + '/discover/#/de-eu', { waitUntil: 'domcontentloaded' });
    await page.locator('h1').getByText('Deutschland & Europa').waitFor();
    await page.locator('[aria-label="Lokale Listings suchen"]').fill(selected.isin);
    const listingLink = page.locator('main a[href="#/listing/' + selected.listingId + '"]'); await listingLink.waitFor();
    assert.equal(await listingLink.count(), 1, 'Each listing appears once'); await listingLink.click();
    await page.locator('h1').getByText(selected.name || selected.ticker).waitFor();
    await page.waitForFunction(() => document.querySelector('main').getAttribute('aria-busy') === 'false');
    assert(await page.locator('main').innerText().then(x => x.includes(selected.mic) && x.includes(selected.isin)));
    assert(await page.locator('main').innerText().then(x => /Letzter Handelsschluss/i.test(x) && !/\bLive\b/i.test(x)));
    assert(await page.locator('main').innerText().then(x => /Quant, SuperTrader.*nicht freigegeben/.test(x)));
    const evidence = await page.evaluate(async id => {
      const core = VUCore.Client.create({ load: QuantShell.loadJSON });
      const [price, history] = await Promise.all([core.getListingLatestPrice(id), core.getListingPriceSeries(id)]);
      return { price: { state: price.state, data: price.data }, history: { state: history.state, last: history.data?.points?.at(-1) } };
    }, selected.listingId);
    if (evidence.price.state === 'AVAILABLE') {
      const p = evidence.price.data, unit = !p.quoteUnit || p.quoteUnit === 'MAJOR' ? p.currency : p.quoteUnit;
      const formatted = new Intl.NumberFormat('de-DE', { maximumFractionDigits: p.close >= 1 ? 2 : 6 }).format(p.close) + ' ' + unit;
      const text = await page.locator('main').innerText(); assert(text.includes(formatted) && text.includes(p.date));
      assert.equal(evidence.history.last[1], p.close, 'UI quote and chart contract share the same latest close');
      assert.equal(evidence.history.last[0], p.date);
    }
    const expectedLogo = await page.evaluate(row => VUDiscover.LocalListings.logoSymbol(row), selected);
    assert.equal(await page.locator('header .dx-logo').getAttribute('data-logo'), expectedLogo);
    if (fixture) {
      assert.equal(await page.locator('.dx-art-line').count(), 0, 'Unverified gaps are never connected');
      assert(await page.locator('main').innerText().then(x => /Bereinigungsbasis ungeprüft/.test(x) && /belegten Datenlücken/.test(x) && /105 EUR/.test(x)));
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('.v2-watch-button').click(); assert.equal(await page.locator('.v2-watch-button').getAttribute('aria-pressed'), 'true');
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.v2-watch-button[aria-pressed="true"]').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('vu-discover-watchlist-v1')), '["SAP"]');
    await page.screenshot({ path: privateOutputFile(out, engine + '-' + width + '-listing.png'), fullPage: false });
    await page.goto(base + '/discover/#/settings'); await page.getByRole('button', { name: 'Dunkel', exact: true }).click();
    await page.goto(base + '/discover/#/listing/' + selected.listingId); await page.locator('.v2-watch-button[aria-pressed="true"]').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: privateOutputFile(out, engine + '-' + width + '-listing-dark.png'), fullPage: false });
    await page.goto(base + '/discover/#/watchlist');
    await page.locator('a[href="#/listing/' + selected.listingId + '"]').waitFor();
    await page.locator('a[href="#/listing/' + selected.listingId + '"]').locator('..').getByRole('button', { name: /aus Watchlist entfernen/ }).click();
    assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('vu-discover-local-listings-v1')).some(x => x.listingId === id), selected.listingId), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('vu-discover-watchlist-v1')), '["SAP"]');
    await page.locator('.v2-dock-search').click();
    await page.locator('.dx-search input').fill(selected.isin);
    await page.locator('.dx-result').filter({ hasText: selected.isin }).waitFor();
    assert(await page.locator('.dx-result').filter({ hasText: selected.isin }).innerText().then(x => x.includes(selected.mic) && x.includes(selected.tradingCurrency)));
    await page.locator('.dx-result').filter({ hasText: selected.isin }).click(); await page.locator('h1').getByText(selected.name || selected.ticker).waitFor();
    assert.equal(page.url().split('#')[1], '/listing/' + selected.listingId);
    assert.deepEqual(providerRequests, [], 'A browser never calls Marketstack'); assert.deepEqual(errors, []);
    checks.push({ engine, width, mode: fixture ? 'SYNTHETIC_CONTRACT_TEST' : 'PRIVATE_MATERIALIZED_DATA',
      listingId: selected.listingId, priceState: evidence.price.state, historyState: evidence.history.state,
      logoDisplay: expectedLogo ? 'COMPANY_ASSET_SELECTED' : 'FALLBACK', darkAndLight: true,
      searchISIN: true, listingView: true, watchlistRoundTrip: true, legacyUSUnchanged: true, noBrowserProviderRequests: true });
    await context.close();
  }
} catch (error) { failures.push(error.message); }
finally { await browser.close(); }
await writeFile(privateOutputFile(out, 'result.json'), JSON.stringify({ checks, failures }, null, 2));
console.log(JSON.stringify({ checks: checks.length, failures, mode: fixture ? 'synthetic' : 'private-development' }));
if (failures.length) process.exitCode = 1;
