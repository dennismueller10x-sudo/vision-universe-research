#!/usr/bin/env node
// Checks real materialized development data in the existing Discover. No
// fixtures, no provider requests, no price values in the evidence report.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertPrivateOutput } from '../marketstack/private-output.mjs';
import { privateOutputFile } from './browser-private-output.mjs';
const require = createRequire(import.meta.url);
const arg = (key, fallback) => { const i = process.argv.indexOf('--' + key); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('url', 'http://127.0.0.1:8780'), out = assertPrivateOutput(arg('out', '/workspace/scratch/de-eu-real-browser'));
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname));
await mkdir(out, { recursive: true });
privateOutputFile(out, 'integration-report.json'); privateOutputFile(out, 'integration-evidence.json');
const { chromium, webkit } = require('playwright');
const release = await (await fetch(base + '/release-delivery.json')).json();
const directory = await (await fetch(base + '/core/data/de-eu/listings.json')).json();
assert.equal(directory.privateDevelopment, true); assert(directory.listings.length > 0); assert.equal(new Set(directory.listings.map(r => r.listingId)).size, directory.listings.length);
const rows = directory.listings, checks = [], tested = [], errors = [], providerRequests = [], externalRequests = [];
async function waitDetail(page, row) {
  await page.waitForFunction(id => document.querySelector('main')?.dataset.listingId === id && document.querySelector('main')?.getAttribute('aria-busy') === 'false', row.listingId);
}
async function detail(page, row) {
  await page.goto(base + '/discover/#/listing/' + row.listingId, { waitUntil: 'domcontentloaded' }); await waitDetail(page, row);
  assert.equal(await page.locator('html').getAttribute('data-theme'), page.qaTheme);
  const text = await page.locator('main').innerText(); assert(text.includes(row.isin) && text.includes(row.mic));
  assert(/LETZTER HANDELSSCHLUSS/i.test(text) && !/\bLive\b/i.test(text));
  const evidence = await page.evaluate(async id => {
    const core = VUCore.Client.create({ load: QuantShell.loadJSON });
    const [listing, price, history] = await Promise.all([core.getListing(id), core.getListingLatestPrice(id), core.getListingPriceSeries(id)]);
    return { listing: listing.data, price, history };
  }, row.listingId);
  assert.equal(evidence.listing.listingId, row.listingId); assert.equal(evidence.listing.securityId, row.securityId);
  if (evidence.price.state === 'AVAILABLE') {
    const p = evidence.price.data, unit = await page.evaluate(p => VUDiscover.LocalListings.unitLabel(p.currency, p.quoteUnit), p);
    const value = new Intl.NumberFormat('de-DE', { maximumFractionDigits: p.close >= 1 ? 2 : 6 }).format(p.close) + ' ' + unit;
    assert(text.includes(value) && text.includes(p.date)); if (['STALE_CACHE', 'STALE'].includes(p.freshness)) assert(/veralteter Quellenstand/.test(text));
    assert.equal(evidence.history.data.points.at(-1)[1], p.close); assert.equal(evidence.history.data.points.at(-1)[0], p.date);
    const q = evidence.history.data.quality || {};
    if (q.completenessVerified !== true || q.quarantinedCandles > 0 || (q.missingSessions || []).length) assert.equal(await page.locator('.dx-art-line').count(), 0, 'Unverified sessions never become a continuous line');
    if (q.priceBasis === 'PROVIDER_REPORTED_UNVERIFIED' || /UNVERIFIED|UNKNOWN/.test(evidence.history.data.basis || '')) assert(/Bereinigungsbasis ungeprüft/.test(text));
  } else {
    assert(text.includes('Nicht verfügbar (' + evidence.price.reason + ')'));
    assert.equal(await page.locator('main svg.dx-micro').count(), 0);
  }
  const expectedLogo = await page.evaluate(row => VUDiscover.LocalListings.logoSymbol(row), evidence.listing);
  assert.equal(await page.locator('header .dx-logo').getAttribute('data-logo'), expectedLogo, 'Logo selection needs canonical company proof');
  if (!expectedLogo) assert.equal(await page.locator('header .dx-logo img').count(), 0);
  else await page.waitForFunction(symbol => {
    const image = document.querySelector('header .dx-logo[data-logo="' + symbol + '"] img');
    return image?.complete && image.naturalWidth > 0;
  }, expectedLogo);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  return { priceState: evidence.price.state, historyState: evidence.history.state, freshness: evidence.price.data?.freshness || null,
    latestDate: evidence.price.data?.date || null, historyFrom: evidence.history.data?.from || null,
    logoSymbol: expectedLogo, logoLoaded: !!expectedLogo, logoFallback: !expectedLogo };
}
async function search(page, row, query) {
  await page.locator('.v2-dock-search').click(); await page.locator('.dx-search input').fill(query);
  const hit = page.locator('.dx-result').filter({ hasText: row.isin }).filter({ hasText: new RegExp('\\b' + row.mic + '\\b') }); await hit.waitFor();
  assert((await hit.innerText()).includes(row.mic)); await hit.click(); await waitDetail(page, row);
  assert.equal(new URL(page.url()).hash, '#/listing/' + row.listingId);
}
async function watchlist(page, row) {
  await page.locator('.v2-watch-button').click(); assert.equal(await page.locator('.v2-watch-button').getAttribute('aria-pressed'), 'true');
  await page.reload({ waitUntil: 'domcontentloaded' }); await waitDetail(page, row);
  assert.equal(await page.locator('.v2-watch-button').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => localStorage.getItem('vu-discover-watchlist-v1')), '["SAP","BRK-B"]');
  await page.goto(base + '/discover/#/watchlist'); const link = page.locator('a[href="#/listing/' + row.listingId + '"]'); await link.waitFor();
  const savedRow = link.locator('..'); assert.equal(await savedRow.locator('.dx-logo').getAttribute('data-logo'), await page.evaluate(row => VUDiscover.LocalListings.logoSymbol(row), row));
  await savedRow.getByRole('button', { name: /aus Watchlist entfernen/ }).click();
  assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('vu-discover-local-listings-v1')).some(x => x.listingId === id), row.listingId), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('vu-discover-watchlist-v1')), '["SAP","BRK-B"]');
}
async function context(browser, width, theme) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500 });
  await ctx.addInitScript(mode => {
    if (localStorage.getItem('vu-discover-watchlist-v1') === null) localStorage.setItem('vu-discover-watchlist-v1', '["SAP","BRK-B"]');
    localStorage.setItem('vu-discover-theme-v1', mode);
  }, theme);
  await ctx.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    if (/marketstack|tiingo/.test(host)) providerRequests.push(host);
    if (host !== new URL(base).hostname) { externalRequests.push(host); return route.abort(); }
    return route.continue();
  });
  const page = await ctx.newPage(); page.qaTheme = theme; page.on('pageerror', error => errors.push(error.message));
  return { ctx, page };
}
async function modelContracts(page) {
  await page.goto(base + '/discover/#/de-eu'); await page.locator('select[aria-label="Index auswählen"]').waitFor();
  const models = await page.evaluate(async rows => {
    const core = VUCore.Client.create({ load: QuantShell.loadJSON });
    const screen = await core.getListingScreener();
    if (screen.state !== 'AVAILABLE') throw Error('SCREENER_CONTRACT_UNAVAILABLE');
    const compact = new Map(screen.data.listings.map(r => [r.listingId, r])), results = [];
    for (let offset = 0; offset < rows.length; offset += 8) {
      results.push(...await Promise.all(rows.slice(offset, offset + 8).map(async row => {
        const [listing, quote, series, search] = await Promise.all([core.getListing(row.listingId), core.getListingLatestPrice(row.listingId),
          core.getListingPriceSeries(row.listingId), core.searchListings(row.isin)]);
        const card = compact.get(row.listingId), latest = series.data?.points?.at(-1);
        return { listingId: row.listingId, securityId: row.securityId, identity: listing.state === 'AVAILABLE' && listing.data.listingId === row.listingId && listing.data.securityId === row.securityId && listing.data.mic === row.mic && listing.data.isin === row.isin,
          isinSearch: search.state === 'AVAILABLE' && search.data.listings.some(r => r.listingId === row.listingId),
          compact: !!card && card.securityId === row.securityId && (quote.state === 'AVAILABLE' ? card.price?.close === quote.data.close && card.price?.date === quote.data.date && card.price?.currency === quote.data.currency : card.price === null),
          centralSeries: quote.state !== 'AVAILABLE' || series.state === 'AVAILABLE' && latest?.[0] === quote.data.date && latest?.[1] === quote.data.close,
          priceState: quote.state, historyState: series.state, reason: quote.reason || null };
      })));
    }
    return results;
  }, rows);
  assert.equal(models.length, rows.length); assert(models.every(r => r.identity && r.isinSearch && r.compact && r.centralSeries));
  checks.push({ check: 'ALL_CANONICAL_MODELS', evidenceType: 'CENTRAL_CONTRACT_NOT_UI_JOURNEY', models });
}
const representative = []; let representativeLimit = 15;
function pick(predicate) { const row = rows.find(r => predicate(r) && !representative.some(x => x.listingId === r.listingId)); if (row && representative.length < representativeLimit) representative.push(row); }
const representativeInput = arg('representatives', null);
if (representativeInput) {
  const ids = JSON.parse(await readFile(representativeInput, 'utf8')); assert(Array.isArray(ids) && ids.length >= 15 && ids.length <= 20 && new Set(ids).size === ids.length); representativeLimit = ids.length;
  ids.forEach(id => { assert(rows.some(r => r.listingId === id)); pick(r => r.listingId === id); });
} else {
for (const isin of ['DE0007164600', 'DE0007236101', 'DE0007030009', 'DE0008404005', 'DE0005557508', 'DE0006048432', 'NL0010273215', 'FR0000121014', 'DE0006969603', 'DE000A0WMPJ6', 'DE0007074007', 'DE000A0ETBQ4']) pick(r => r.isin === isin);
for (const index of ['MDAX', 'SDAX', 'TECDAX']) pick(r => r.indexMemberships.includes(index));
}
assert.equal(representative.length, representativeLimit);
const selection = process.argv.includes('--selection'), journeyRows = process.argv.includes('--sample-only') || selection ? representative : rows;
const chromiumBrowser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const { ctx, page } = await context(chromiumBrowser, 1440, 'light');
  if (selection) await modelContracts(page);
  for (const row of journeyRows) {
    const state = await detail(page, row);
    if (!tested.length) {
      const resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => /^\/discover\/(app|home|detail|themes)\.(js|css)$/.test(new URL(r.name).pathname)).map(r => ({ bytes: r.decodedBodySize, path: new URL(r.name).pathname })));
      const bytes = resources.reduce((sum, r) => sum + r.bytes, 0); assert(bytes <= 180000); assert(resources.length <= 12);
      checks.push({ check: 'EXISTING_FRONTEND_BUDGET', decodedBytes: bytes, requests: resources.length });
    }
    await search(page, row, row.isin); await watchlist(page, row);
    tested.push({ listingId: row.listingId, isin: row.isin, mic: row.mic, ...state, search: true, detail: true, watchlist: true, logoChecked: true });
    if (tested.length % 24 === 0) console.log('Actual listing journeys verified: ' + tested.length + '/' + journeyRows.length);
  }
  await page.goto(base + '/discover/#/de-eu'); await page.locator('select[aria-label="Index auswählen"]').waitFor();
  for (const index of ['DAX', 'MDAX', 'SDAX', 'TECDAX', 'EURO_STOXX_50']) {
    await page.locator('select[aria-label="Index auswählen"]').selectOption(index);
    const expected = rows.filter(r => r.indexMemberships.includes(index)).map(r => r.listingId).sort();
    await page.waitForFunction(n => document.querySelectorAll('main a[href^="#/listing/"]').length === n, expected.length);
    const actual = await page.locator('main a[href^="#/listing/"]').evaluateAll(nodes => nodes.map(x => x.getAttribute('href').split('/').at(-1)).sort());
    assert.deepEqual(actual, expected); checks.push({ check: 'INDEX_FILTER', index, listingIds: actual });
  }
  await page.locator('select[aria-label="Index auswählen"]').selectOption('');
  await page.locator('select[aria-label="Handelsregion auswählen"]').selectOption('DE');
  const german = rows.filter(r => r.listingCountry === 'DE').map(r => r.listingId).sort();
  await page.waitForFunction(n => document.querySelectorAll('main a[href^="#/listing/"]').length === n, german.length);
  assert.deepEqual(await page.locator('main a[href^="#/listing/"]').evaluateAll(nodes => nodes.map(x => x.getAttribute('href').split('/').at(-1)).sort()), german);
  checks.push({ check: 'GERMAN_LISTING_FILTER', listingIds: german }); await ctx.close();
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    const { ctx, page } = await context(chromiumBrowser, width, theme);
    for (const row of representative) {
      await detail(page, row); await search(page, row, row.ticker); await search(page, row, row.name); await watchlist(page, row);
      if (row === representative[0] || row === representative[5] || row === representative[12]) {
        await detail(page, row); await page.screenshot({ path: privateOutputFile(out, 'chromium-' + width + '-' + theme + '-' + row.listingId + '.png'), fullPage: false });
      }
    }
    checks.push({ check: 'REPRESENTATIVE_UI', engine: 'chromium', width, theme, listingIds: representative.map(r => r.listingId) }); await ctx.close();
  }
} finally { await chromiumBrowser.close(); }
const webkitBrowser = await webkit.launch({ headless: true, ...(process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {}) });
try {
  for (const theme of ['light', 'dark']) {
    const { ctx, page } = await context(webkitBrowser, 390, theme);
    for (const row of representative) {
      await detail(page, row); await search(page, row, row.isin); await search(page, row, row.ticker); await search(page, row, row.name); await watchlist(page, row);
      if (row === representative[0] || row === representative[5] || row === representative[12]) {
        await detail(page, row); await page.screenshot({ path: privateOutputFile(out, 'webkit-390-' + theme + '-' + row.listingId + '.png'), fullPage: false });
      }
    }
    checks.push({ check: 'REPRESENTATIVE_UI', engine: 'webkit', width: 390, theme, listingIds: representative.map(r => r.listingId) }); await ctx.close();
  }
} finally { await webkitBrowser.close(); }
assert.deepEqual(errors, []); assert.deepEqual(providerRequests, []);
assert.equal(tested.length, journeyRows.length);
const report = { status: 'PASS', sourceCommit: release.sourceCommit,
  referenceAsOf: directory.referenceAsOf, mode: selection ? 'PRIVATE_REAL_SELECTION' : process.argv.includes('--sample-only') ? 'PRIVATE_REAL_SAMPLE' : 'PRIVATE_REAL_MATERIALIZED_DATA', tested, checks, errors, providerRequests, blockedExternalHosts: [...new Set(externalRequests)] };
const evidence = { schemaVersion: 'de-eu-integration-evidence-1.0.0', asOf: '2026-10-06', listingIds: tested.map(r => r.listingId),
  modelListingIds: selection ? rows.map(r => r.listingId) : [], browserListingIds: tested.map(r => r.listingId),
  evidence: join(out, 'integration-report.json'), representativeListingIds: representative.map(r => r.listingId),
  screenshots: checks.filter(c => c.check === 'REPRESENTATIVE_UI').map(c => join(out, c.engine + '-' + c.width + '-' + c.theme + '-' + representative[0].listingId + '.png')) };
await writeFile(privateOutputFile(out, 'integration-report.json'), JSON.stringify(report, null, 2));
await writeFile(privateOutputFile(out, 'integration-evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ status: 'PASS', realListingJourneys: tested.length, canonicalModelListings: selection ? rows.length : null, staleHistories: tested.filter(r => ['STALE_CACHE', 'STALE'].includes(r.freshness)).length, missingHistories: tested.filter(r => r.historyState !== 'AVAILABLE').length, representativeListings: representative.length, providerRequests: 0 }));
