// Existing Screener on an official release. --fixture is a synthetic UI
// contract test; real mode reads only the private, materialized Core selection.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { assertPrivateOutput } from '../marketstack/private-output.mjs';
import { privateOutputFile } from '../discover/browser-private-output.mjs';
const require = createRequire(import.meta.url);
const arg = (name, value) => { const i = process.argv.indexOf('--' + name); return i < 0 ? value : process.argv[i + 1]; };
const base = arg('url', 'http://127.0.0.1:8782'), out = assertPrivateOutput(arg('out', '/workspace/scratch/europe-screener-browser'));
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
await mkdir(out, { recursive: true }); privateOutputFile(out, 'report.json');
const fixture = process.argv.includes('--fixture'), { chromium, webkit } = require('playwright');
const Identity = require('../../core/identity.js'), errors = [], requests = [], checks = [];
const release = await (await fetch(base + '/release-delivery.json')).json();
function listing(isin, mic, name, extra = {}) {
  return { isin, mic, name, ticker: name === 'Synthetic SAP' ? 'SAP' : 'FIXTURE', listingId: Identity.listingIdFor({ isin, mic }), securityId: Identity.securityIdForISIN(isin),
    assetType: 'EQUITY', shareClass: 'ORDINARY_SHARE', mappingStatus: 'VERIFIED', mappingSource: 'synthetic-fixture',
    tradingCurrency: 'EUR', quoteUnit: 'MAJOR', listingCountry: 'DE', region: 'EUROPE', indexMemberships: ['DAX'], logo: { status: 'MISSING' }, ...extra };
}
const fixtureRows = [listing('DE0007164600', 'XETR', 'Synthetic SAP'), listing('DE0007164600', 'XFRA', 'Synthetic alternate SAP'),
  listing('NL0010273215', 'XAMS', 'Synthetic ASML', { listingCountry: 'NL', indexMemberships: ['EURO_STOXX_50'] })];
const directory = { schemaVersion: 'de-eu-directory-1.0.0', privateDevelopment: true, publicDisplay: false, referenceAsOf: '2026-10-05', dataAsOf: '2026-10-06', listings: fixtureRows };
const artifact = { schemaVersion: 'de-eu-screener-1.0.0', privateDevelopment: true, publicDisplay: false, referenceAsOf: directory.referenceAsOf, dataAsOf: directory.dataAsOf,
  listings: fixtureRows.map((row, i) => ({ ...row, price: i === 2 ? null : { kind: 'EOD_CLOSE', listingId: row.listingId, securityId: row.securityId, ticker: row.ticker,
    mic: row.mic, close: i === 0 ? 100 : 200, currency: 'EUR', quoteUnit: 'MAJOR', date: '2026-10-05', freshness: 'FRESH' },
    fields: { priceVsSma200: i === 0 ? { status: 'READY', value: 0.25, unit: 'ratio', asOf: '2026-10-05', inputSeriesHash: 'a'.repeat(64),
      window: { from: '2024-10-05', to: '2026-10-05' }, evidence: ['synthetic-fixture-existing-engine-contract'] } : { status: 'BLOCKED', reason: 'MISSING_HISTORY' } } })) };
for (const engine of ['chromium', 'webkit']) {
  const browser = await (engine === 'chromium' ? chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] }) :
    webkit.launch({ headless: true, ...(process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {}) }));
  try {
    for (const width of engine === 'chromium' ? [390, 1440] : [390]) for (const theme of ['light', 'dark']) {
      const requestStart = requests.length;
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500, ...(fixture ? { serviceWorkers: 'block' } : {}) });
      await context.addInitScript(t => {
        localStorage.setItem('vu-discover-theme-v1', t); localStorage.setItem('vu-discover-watchlist-v1', '["SAP","BRK-B"]');
        window.__euJsonReadDecode = [];
        const json = Response.prototype.json;
        Response.prototype.json = async function (...args) {
          const start = performance.now();
          try { return await json.apply(this, args); }
          finally { if (new URL(this.url).pathname.startsWith('/core/data/de-eu/')) window.__euJsonReadDecode.push({ path: new URL(this.url).pathname, bodyReadAndDecodeMs: performance.now() - start }); }
        };
      }, theme);
      await context.route('**/*', route => {
        const path = new URL(route.request().url()).pathname, host = new URL(route.request().url()).hostname;
        requests.push({ path, host });
        if (host !== new URL(base).hostname) return route.abort();
        if (fixture && path === '/core/data/de-eu/listings.json') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(directory) });
        if (fixture && path === '/core/data/de-eu/screener.json') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(artifact) });
        return route.continue();
      });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/screener/?u=EUROPE'); await page.locator('.sc-eu-row').first().waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.equal(await page.locator('.sc-europe a[href],.sc-europe button').evaluateAll(nodes => nodes.filter(n => { const r=n.getBoundingClientRect(); return r.width && r.height && (r.width < 32 || r.height < 32); }).length), 0, 'Regional touch targets remain usable on iPhone');
      const coldLoad = await page.evaluate(() => ({ resources: performance.getEntriesByType('resource').map(r => ({ path: new URL(r.name).pathname, decodedBytes: r.decodedBodySize, encodedBytes: r.encodedBodySize, transferBytes: r.transferSize, durationMs: r.duration })), euJsonBodyReadAndDecode: window.__euJsonReadDecode, domNodes: document.querySelectorAll('*').length }));
      const payload = { scope: 'FULL_OPT_IN_EU_RESOURCE_LIST_NOT_A_DEFAULT_VIEW_CODE_GATE', ...coldLoad, decodedBytes: coldLoad.resources.reduce((sum, r) => sum + r.decodedBytes, 0), requests: coldLoad.resources.length, euDataDecodedBytes: coldLoad.resources.filter(r => r.path.startsWith('/core/data/de-eu/')).reduce((sum, r) => sum + r.decodedBytes, 0) };
      const central = await page.evaluate(async () => { const core = VUCore.Client.create({ load: p => fetch(p).then(r => r.json()) }); return core.getListingScreener(); });
      assert.equal(central.state, 'AVAILABLE'); const rows = central.data.listings; assert(rows.length);
      const localRoundtrip = await page.evaluate(rows => {
        const p = VUScreenerLocalListings.prepare({ state: 'AVAILABLE', data: { listings: rows, privateDevelopment: true } });
        return rows.map(r => ({ id: r.listingId, index: p.dataset.indexOf(r.listingId), symbol: p.dataset.symbol(p.dataset.indexOf(r.listingId)) }));
      }, rows);
      assert(localRoundtrip.every(r => r.index >= 0 && r.symbol === r.id));
      const readinessFilters = [];
      for (const [kind, label] of [['freshness', 'Kursaktualität'], ['chartReadiness', 'Chartfreigabe'], ['technicalReadiness', 'Technische Freigabe']]) {
        const statuses = await page.evaluate(({ rows, kind }) => rows.map(r => VUScreenerLocalListings.status(r, kind)), { rows, kind });
        const allowed = await page.evaluate(kind => Object.keys(VUScreenerLocalListings.STATUS[kind]), kind);
        for (const value of allowed) {
          const expected = rows.filter((_, i) => statuses[i] === value).map(r => r.listingId);
          await page.getByRole('combobox', { name: label, exact: true }).selectOption(value);
          await page.waitForFunction(n => document.querySelector('[role="status"]').textContent.startsWith(n + ' passende Listings'), expected.length);
          const ids = await page.locator('.sc-eu-row').evaluateAll(nodes => nodes.map(n => n.dataset.listingId));
          assert.equal(ids.length, Math.min(30, expected.length)); assert(ids.every(id => expected.includes(id)));
          const url = page.url(); assert.equal(new URL(url).searchParams.get(kind), value);
          await page.reload(); await page.getByRole('combobox', { name: label, exact: true }).waitFor();
          await page.waitForFunction(n => document.querySelector('[role="status"]').textContent.startsWith(n + ' passende Listings'), expected.length);
          assert.equal(page.url(), url); assert.equal(await page.getByRole('combobox', { name: label, exact: true }).inputValue(), value);
          readinessFilters.push({ kind, status: value, matchingListings: expected.length, visibleIdsChecked: ids.length, urlReload: true });
        }
        await page.getByRole('combobox', { name: label, exact: true }).selectOption('');
      }
      const logoIds = await page.evaluate(rows => rows.filter(r => VUDiscover.LocalListings.logoSymbol(r)).map(r => r.listingId), rows);
      const chosen = rows.find(r => r.price && logoIds.includes(r.listingId)) || rows.find(r => r.price) || rows[0], search = page.getByRole('searchbox', { name: 'Europäische Aktien suchen' });
      await search.fill(chosen.isin); const card = page.locator('[data-listing-id="' + chosen.listingId + '"]'); await card.waitFor();
      const canonicalPrice = chosen.price, text = await card.innerText();
      if (canonicalPrice) assert(text.includes(new Intl.NumberFormat('de-DE', { maximumFractionDigits: canonicalPrice.close >= 1 ? 2 : 6 }).format(canonicalPrice.close)) && text.includes(canonicalPrice.date));
      if (canonicalPrice) assert(text.includes(await page.evaluate(row => VUDiscover.LocalListings.freshnessLabel(VUScreenerLocalListings.status(row, 'freshness')), chosen)), 'Displayed freshness agrees with the central readiness filter');
      assert.equal(await card.locator('a').getAttribute('href'), '/discover/#/listing/' + chosen.listingId);
      const watch = card.locator('button'); await watch.click(); assert.equal(await watch.getAttribute('aria-pressed'), 'true');
      await page.reload(); await card.waitFor(); assert.equal(await card.locator('button').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.evaluate(() => localStorage.getItem('vu-discover-watchlist-v1')), '["SAP","BRK-B"]');
      await card.locator('button').click(); assert.equal(await card.locator('button').getAttribute('aria-pressed'), 'false');
      await search.fill('');
      const issuerCountry = rows.map(r => r.companyCountry).find(c => /^[A-Z]{2}$/.test(c || ''));
      if (issuerCountry) {
        await page.getByRole('combobox', { name: 'Emittentenland', exact: true }).selectOption(issuerCountry);
        const expected = rows.filter(r => r.companyCountry === issuerCountry).map(r => r.listingId);
        await page.waitForFunction(n => document.querySelector('[role="status"]').textContent.startsWith(n + ' passende Listings'), expected.length);
        assert((await page.locator('.sc-eu-row').evaluateAll(nodes => nodes.map(n => n.dataset.listingId))).every(id => expected.includes(id)));
        const url = page.url(); await page.reload(); await page.locator('.sc-eu-row').first().waitFor(); assert.equal(page.url(), url);
        await page.getByRole('combobox', { name: 'Emittentenland', exact: true }).selectOption('');
      }
      const unknownIssuerCount = rows.filter(r => !r.companyCountry).length;
      if (unknownIssuerCount) {
        await page.getByRole('combobox', { name: 'Emittentenland', exact: true }).selectOption('UNKNOWN');
        await page.waitForFunction(n => document.querySelector('[role="status"]').textContent.startsWith(n + ' passende Listings'), unknownIssuerCount);
        await page.getByRole('combobox', { name: 'Emittentenland', exact: true }).selectOption('');
      }
      if (!fixture) {
        for (const [label, field, value] of [['Börsenland', 'listingCountry', 'DE'], ['Handelsplatz / MIC', 'mic', 'XETR'], ['Indexmitgliedschaft', 'indexMemberships', 'DAX']]) {
          if (!rows.some(r => Array.isArray(r[field]) ? r[field].includes(value) : r[field] === value)) continue;
          await page.getByRole('combobox', { name: label, exact: true }).selectOption(value);
          const expected = rows.filter(r => Array.isArray(r[field]) ? r[field].includes(value) : r[field] === value).map(r => r.listingId);
          await page.waitForFunction(n => document.querySelector('[role="status"]').textContent.startsWith(n + ' passende Listings'), expected.length);
          const actual = await page.locator('.sc-eu-row').evaluateAll(nodes => nodes.map(n => n.dataset.listingId));
          assert(actual.every(id => expected.includes(id))); assert.equal(actual.length, Math.min(30, expected.length));
          const url = page.url(); await page.reload(); await page.locator('.sc-eu-row').first().waitFor(); assert.equal(page.url(), url);
          await page.getByRole('combobox', { name: label, exact: true }).selectOption('');
        }
        await page.getByRole('combobox', { name: 'Kurswährung / Notierungseinheit', exact: true }).selectOption(chosen.tradingCurrency);
        await page.getByRole('spinbutton', { name: 'Mindestkurs', exact: true }).fill(String(chosen.price?.close || 0));
        await page.getByRole('spinbutton', { name: 'Mindestkurs', exact: true }).blur();
        const expected = rows.filter(r => r.tradingCurrency === chosen.tradingCurrency && r.price?.close >= (chosen.price?.close || 0));
        await page.waitForFunction(n => document.querySelector('[role="status"]').textContent.startsWith(n + ' passende Listings'), expected.length);
        const url = page.url(); await page.reload(); await page.locator('.sc-eu-row').first().waitFor(); assert.equal(page.url(), url);
        await page.getByRole('spinbutton', { name: 'Mindestkurs', exact: true }).fill(''); await page.getByRole('spinbutton', { name: 'Mindestkurs', exact: true }).blur();
        await page.getByRole('combobox', { name: 'Kurswährung / Notierungseinheit', exact: true }).selectOption('');
      }
      if (fixture) {
        await page.getByRole('combobox', { name: 'Börsenland', exact: true }).selectOption('NL'); assert.equal(await page.locator('.sc-eu-row').count(), 1);
        assert((await page.locator('.sc-eu-row').innerText()).includes('Kurs nicht verfügbar'));
        await page.getByRole('combobox', { name: 'Börsenland', exact: true }).selectOption('');
        assert.equal(await page.getByRole('spinbutton', { name: 'Mindestkurs', exact: true }).isDisabled(), true);
        await page.getByRole('combobox', { name: 'Kurswährung / Notierungseinheit', exact: true }).selectOption('EUR');
        await page.getByRole('spinbutton', { name: 'Mindestkurs', exact: true }).fill('150'); await page.getByRole('spinbutton', { name: 'Mindestkurs', exact: true }).blur();
        assert.equal(await page.locator('.sc-eu-row').count(), 1); assert.equal(await page.locator('.sc-eu-row').getAttribute('data-listing-id'), fixtureRows[1].listingId);
        await page.getByRole('spinbutton', { name: 'Mindestkurs', exact: true }).fill(''); await page.getByRole('spinbutton', { name: 'Mindestkurs', exact: true }).blur();
        await page.getByRole('combobox', { name: 'Technisches Kriterium', exact: true }).selectOption('priceVsSma200');
        await page.getByRole('spinbutton', { name: 'Kriterienwert', exact: true }).fill('10'); await page.getByRole('button', { name: 'Kriterium hinzufügen', exact: true }).click();
        assert.equal(await page.locator('.sc-eu-row').count(), 1); assert.equal(await page.locator('.sc-eu-row').getAttribute('data-listing-id'), fixtureRows[0].listingId);
        assert((await page.locator('.sc-eu-results').innerText()).includes('fehlende Einzelwerte'));
        const url = page.url(); await page.reload(); await page.locator('.sc-eu-row').waitFor(); assert.equal(page.url(), url);
        await page.getByRole('button', { name: 'Kurs vs. SMA200 entfernen', exact: true }).click(); assert.equal(await page.locator('.sc-eu-row').count(), 3);
        await page.goto(base + '/screener/?u=EUROPE&rank=momentum:100');
        await page.getByRole('status').filter({ hasText: 'EUROPE_UNSUPPORTED_QUERY' }).waitFor(); assert.equal(await page.locator('.sc-eu-row').count(), 0);
        await page.goto(base + '/screener/?u=EUROPE'); await page.locator('.sc-eu-row').first().waitFor();
      }
      const consumerHistoryRequests = requests.slice(requestStart).filter(r => /^\/core\/data\/de-eu\/series\//.test(r.path)).length;
      const proof = await page.evaluate(async row => {
        const core = VUCore.Client.create({ load: p => fetch(p).then(r => r.json()) });
        return { logo: VUDiscover.LocalListings.logoSymbol(row), latest: await core.getListingLatestPrice(row.listingId) };
      }, chosen);
      if (!fixture && canonicalPrice) { assert.equal(proof.latest.state, 'AVAILABLE'); assert.equal(canonicalPrice.close, proof.latest.data.close); }
      const visible = page.locator('[data-listing-id="' + chosen.listingId + '"]');
      await page.getByRole('searchbox', { name: 'Europäische Aktien suchen' }).fill(chosen.isin); await visible.waitFor();
      assert.equal(await visible.locator('.dx-logo').getAttribute('data-logo'), proof.logo);
      if (proof.logo) await page.waitForFunction(id => document.querySelector('[data-listing-id="' + id + '"] .dx-logo img')?.naturalWidth > 0, chosen.listingId);
      else assert.equal(await visible.locator('.dx-logo img').count(), 0);
      await visible.scrollIntoViewIfNeeded();
      await page.screenshot({ path: privateOutputFile(out, engine + '-' + width + '-' + theme + '.png') });
      checks.push({ engine, width, theme, listingCount: rows.length, allListingIdentityRoundtrips: localRoundtrip.length, payload, readinessFilters, testedListingId: chosen.listingId, issuerCountryFilter: !!issuerCountry, issuerCountryURLReload: !!issuerCountry, unknownIssuerCount, displayedPriceMatchesCompactContract: canonicalPrice !== null, centralSeriesPriceMatches: !fixture && canonicalPrice !== null, verifiedLogoLoaded: !!proof.logo, fallbackChecked: !proof.logo, consumerHistoryRequests, watchlist: true, legacyWatchlistPreserved: true });
      await context.close();
    }
  } finally { await browser.close(); }
}
assert(checks.every(c => c.consumerHistoryRequests === 0), 'Regional consumer never fans out into listing histories');
assert.deepEqual(errors, []); assert(!requests.some(r => /marketstack|tiingo/.test(r.host)));
assert(!requests.some(r => r.path === '/screener/data/universe-US_REAL.json'), 'Regional view never fetches the US universe');
const report = { status: 'PASS', mode: fixture ? 'SYNTHETIC_CONTRACT_ONLY' : 'PRIVATE_REAL_DATA', sourceCommit: release.sourceCommit, checks, errors,
  providerRequests: 0, usUniverseRequests: 0, consumerHistoryRequests: checks.reduce((n, c) => n + c.consumerHistoryRequests, 0), verificationHistoryRequests: requests.filter(r => /^\/core\/data\/de-eu\/series\//.test(r.path)).length };
await writeFile(privateOutputFile(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
