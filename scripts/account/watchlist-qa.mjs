#!/usr/bin/env node
// Vision Universe — Browser-QA der persoenlichen Watchlist gegen die lokale Simulation.
//
//   node scripts/account/dev-server.mjs --port=8790 &      (braucht PG_TEST_URL)
//   node scripts/account/watchlist-qa.mjs --url=http://localhost:8790 --out=/tmp/watchlist-qa [--engine=webkit]
//
// Prueft im echten Browser: Uebernahme der alten Browser-Watchlists, Hinzufuegen ueber die Suche, Kennzahlen,
// Statuschips (kein Gesamtscore, Supertrader nur freigegeben), Details, Notiz, Benachrichtigung, Filter,
// Sortierung, Gruppen, Entfernen; das Lesezeichen im Aktienkopf einer Produktwelt (angemeldet, abgemeldet,
// ohne Freigabe); Desktop und iPhone-Profil, hell und dunkel. Screenshots in --out.
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';

const arg = (name, fallback) => (process.argv.find(a => a.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=').slice(1).join('=');
const base = arg('url', 'http://localhost:8790');
const out = arg('out', '/tmp/watchlist-qa');
const engine = arg('engine', 'chromium');
const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
await mkdir(out, {recursive: true});

const browser = await pw[engine].launch();
const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`${ok ? 'ok  ' : 'FEHL'} ${what}`); };
const shot = (page, name) => page.screenshot({path: `${out}/${engine}-watchlist-${name}.png`, fullPage: true});
const password = 'Sicheres-Passwort-26';

async function audit(page, label) {
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const small = [...document.querySelectorAll('main input:not([type=checkbox]), main select, main textarea')]
      .filter(e => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id || e.className);
    const tiny = [...document.querySelectorAll('main button:not(.wl-result), main .ka-btn')]
      .filter(e => e.offsetParent && e.getBoundingClientRect().height < 36).map(e => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 30));
    return {overflow: document.documentElement.scrollWidth > w + 1, small, tiny};
  });
  check(!r.overflow, `${label}: kein waagrechter Ueberlauf`);
  check(!r.small.length, `${label}: Eingaben >= 16px ${r.small.join(',')}`);
  check(!r.tiny.length, `${label}: Bedienflaechen gross genug ${r.tiny.join(',')}`);
}

async function registered(context) {
  const page = await context.newPage();
  const email = `wl-qa-${engine}-${Date.now()}@example.test`;
  await page.goto(`${base}/konto/registrieren/`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.check('#terms');
  await page.click('#ka-register button[type=submit]');
  await page.waitForSelector('#ka-register-done:not([hidden])');
  await page.goto(`${base}/__dev/mail`);
  await page.click('a.btn');
  await page.waitForURL(/\/konto\/\?status=verified/);
  // Die Kontoseite bestaetigt die Sitzung (/v1/session) und setzt den Merker "angemeldet"; erst danach fragen
  // Produktseiten die Konto-API an (assets/watchlist-button.js). Wie ein Nutzer: Seite fertig laden lassen.
  await page.waitForFunction(() => localStorage.getItem('vu-account-session-v1') === '1');
  return page;
}
const rows = page => page.locator('.wl-row').count();

// ---------------------------------------------------------------- Desktop
const desktop = await browser.newContext({viewport: {width: 1280, height: 900}});
// Alte Browser-Watchlists (Discover, Quant) als Uebernahmequelle.
await desktop.addInitScript(() => { try {
  if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('vu-discover-watchlist-v1', '["NVDA","AAPL"]'); localStorage.setItem('vu.quant.watchlist.v1', '["AAPL","MSFT"]'); localStorage.setItem('qa-seeded', '1'); }
} catch (e) {} });
const page = await registered(desktop);
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && page.url().includes('/konto/')) errors.push(m.text()); });

await page.goto(`${base}/konto/watchlist/`);
await page.waitForSelector('#wl-app:not([hidden])');
check(await page.isVisible('#wl-empty'), 'leere Watchlist: Hinweis');
check(await page.isVisible('#wl-legacy'), 'Uebernahme der alten Browser-Watchlist angeboten');
check(/3 Aktien/.test(await page.textContent('#wl-legacy-text')), 'drei eindeutige Titel aus Discover und Quant');
await shot(page, '01-leer');
await page.click('#wl-legacy-btn');
await page.waitForFunction(() => document.querySelectorAll('.wl-row').length === 3);
check(true, 'Uebernahme: drei Zeilen');

await page.fill('#wl-add', 'ESTC');
await page.waitForSelector('.wl-result');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelectorAll('.wl-row').length === 4);
check(true, 'Hinzufuegen ueber die Suche (Tastatur)');
await page.fill('#wl-add', 'ESTC');
await page.waitForSelector('.wl-result');
await page.keyboard.press('Enter');
await page.waitForFunction(() => /bereits/.test(document.getElementById('ka-status').textContent));
check(await rows(page) === 4, 'doppeltes Hinzufuegen: kein zweiter Eintrag');

const kpi = await page.textContent('#wl-kpis');
check(/4\s*\/\s*20/.test(kpi.replace(/\s+/g, ' ')), 'Kennzahl beobachtet 4 / 20 (Free)');
const text = await page.textContent('#wl-list');
check(!/Gesamtscore\s*\d/.test(text), 'kein Gesamtscore-Wert');
const estc = page.locator('.wl-row', {hasText: 'ESTC'});
const strategies = await page.evaluate(async () => (await (await fetch('/core/data/watchlist-summary-v1/meta.json')).json()).sources.supertrader.strategies);
const released = Object.values(strategies).some(s => s.released);
if (!released) check(/Forschung/.test(await estc.textContent()) && !/Supertrader gültig/.test(text), 'Supertrader ohne Freigabe nur als Forschung');
check((await page.locator('.wl-row .wl-factors i').count()) >= 21, 'Faktorbalken je Zeile');
check(/Schluss \d{2}\.\d{2}\.\d{2}/.test(text), 'Kurs mit Datenstand');
await audit(page, 'Watchlist Desktop');
await shot(page, '02-liste');

// Details, Notiz, Benachrichtigung
const nvda = page.locator('.wl-row', {hasText: 'NVDA'});
await nvda.locator('summary').click();
check((await nvda.locator('.wl-table tr').count()) === 7, 'Details: sieben Faktoren');
check(/Gesamtscore: nicht freigegeben/.test(await nvda.textContent()), 'Details: Gesamtscore als nicht freigegeben ausgewiesen');
await nvda.locator('textarea').fill('Nach Quartalszahlen prüfen');
await nvda.locator('button', {hasText: 'Notiz speichern'}).click();
await page.waitForFunction(() => /Notiz gespeichert/.test(document.getElementById('ka-status').textContent));
await nvda.locator('input[type=checkbox]').first().check();
await page.waitForFunction(() => /Benachrichtigung gespeichert/.test(document.getElementById('ka-status').textContent));
check(true, 'Notiz und Benachrichtigung gespeichert');
check((await nvda.locator('.wl-links a').count()) >= 4, 'Links in die Produktwelten');
await shot(page, '03-details');

// Filter, Sortierung, Gruppen, Suche
await page.selectOption('#wl-sort', 'company');
const names = await page.locator('.wl-name b').allTextContents();
check(names.join('|') === [...names].sort((a, b) => a.localeCompare(b, 'de')).join('|'), 'Sortierung nach Unternehmen');
await page.selectOption('#wl-sort', 'factor:momentum');
check(await rows(page) === 4, 'Sortierung nach Faktor');
await page.check('#wl-group');
check((await page.locator('.wl-group').count()) >= 1, 'Gruppierung nach Signal');
await page.fill('#wl-query', 'nvid');
check(await rows(page) === 1, 'Suche in der Watchlist');
await page.fill('#wl-query', '');
await page.selectOption('#wl-filter', 'attention');
const attention = await rows(page);
await page.selectOption('#wl-filter', 'all');
check(attention >= 0 && await rows(page) === 4, 'Filter wirkt und laesst sich zuruecksetzen');
await page.uncheck('#wl-group');

// Entfernen
await page.locator('.wl-row', {hasText: 'AAPL'}).locator('.wl-remove').click();
await page.waitForFunction(() => document.querySelectorAll('.wl-row').length === 3);
check(true, 'Entfernen ohne Neuladen');
await page.reload();
await page.waitForSelector('#wl-app:not([hidden])');
check(await rows(page) === 3 && /Nach Quartalszahlen/.test(await page.locator('.wl-row', {hasText: 'NVDA'}).locator('textarea').inputValue()), 'dauerhaft gespeichert (nach Neuladen)');

// Dunkel, Desktop
await page.evaluate(() => { localStorage.setItem('vu-discover-theme-v1', 'dark'); });
await page.reload();
await page.waitForSelector('#wl-app:not([hidden])');
await shot(page, '04-dunkel');
await page.evaluate(() => { localStorage.setItem('vu-discover-theme-v1', 'light'); });

// ---------------------------------------------------------------- Lesezeichen in einer Produktwelt (Fundamental)
const product = `${base}/fundamental/#/NVDA`;   // Produktseite mit Aktienkopf und eingebundenem Lesezeichen
await page.goto(product);
const bm = page.locator('.vu-shead .vu-watch');
await bm.waitFor({timeout: 20000});
check(await bm.getAttribute('aria-pressed') === 'true', 'Produktwelt: NVDA als gespeichert erkannt');
await bm.click();
await page.waitForFunction(() => document.querySelector('.vu-watch').getAttribute('aria-pressed') === 'false' && !document.querySelector('.vu-watch').disabled);
const after = await page.evaluate(async () => (await (await fetch('/v1/watchlist', {credentials: 'include', headers: {'X-VU-Client': 'web'}})).json()).items.map(i => i.ticker));
check(!after.includes('NVDA'), 'Produktwelt: Entfernen ohne Neuladen');
await bm.click();
await page.waitForFunction(() => document.querySelector('.vu-watch').getAttribute('aria-pressed') === 'true');
check(await page.waitForFunction(() => /gespeichert/.test((document.querySelector('.vu-watch-hint') || {}).textContent || ''), null, {timeout: 5000}).then(() => true, () => false),
  'Produktwelt: Speichern mit Rueckmeldung');
await page.locator('.vu-shead').screenshot({path: `${out}/${engine}-watchlist-05-lesezeichen.png`});

const anon = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: engine !== 'firefox', hasTouch: true});
const ap = await anon.newPage();
await ap.goto(product);
const abm = ap.locator('.vu-shead .vu-watch');
await abm.waitFor({timeout: 20000});
check(await abm.getAttribute('aria-pressed') === 'false', 'abgemeldet: Lesezeichen leer');
await abm.click();
await ap.waitForSelector('.vu-watch-hint a[href^="/konto/anmelden/"]');
check(true, 'abgemeldet: dezente Anmeldeaufforderung');
await ap.screenshot({path: `${out}/${engine}-watchlist-06-abgemeldet.png`});
await anon.close();

const off = await browser.newContext({viewport: {width: 1280, height: 900}});
await off.route('**/konto/config.js', r => r.fulfill({contentType: 'text/javascript', body: 'globalThis.VU_ACCOUNT_CONFIG={endpoint:""};'}));
const op = await off.newPage();
const offRequests = [];
op.on('request', r => { if (/account-api|\/v1\//.test(r.url())) offRequests.push(r.url()); });
await op.goto(product);
await op.waitForSelector('.vu-shead', {timeout: 20000});
await op.waitForTimeout(2500);
check(!(await op.locator('.vu-watch').count()) && !offRequests.length, 'ohne Freigabe: kein Lesezeichen, keine Konto-Anfrage');
await op.goto(`${base}/konto/watchlist/`);
check(/noch nicht freigeschaltet/.test(await op.textContent('#ka-status')), 'ohne Freigabe: Watchlist meldet "nicht freigeschaltet"');
await off.close();

// ---------------------------------------------------------------- iPhone, hell und dunkel
const cookies = await desktop.cookies();
for (const theme of ['light', 'dark']) {
  const mobile = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: engine !== 'firefox', hasTouch: true});
  await mobile.addCookies(cookies);
  await mobile.addInitScript(t => { try { localStorage.setItem('vu-discover-theme-v1', t); } catch (e) {} }, theme);
  const m = await mobile.newPage();
  m.on('pageerror', e => errors.push(String(e)));
  await m.goto(`${base}/konto/watchlist/`);
  await m.waitForSelector('#wl-app:not([hidden])');
  await m.waitForFunction(() => document.querySelectorAll('.wl-row').length === 3);
  await audit(m, `mobil ${theme} Watchlist`);
  await m.screenshot({path: `${out}/${engine}-watchlist-mobil-${theme}.png`, fullPage: true});
  await m.locator('.wl-row').first().locator('summary').click();
  await audit(m, `mobil ${theme} Details`);
  await m.screenshot({path: `${out}/${engine}-watchlist-mobil-${theme}-details.png`, fullPage: true});
  await mobile.close();
}

check(!errors.length, `keine Seitenfehler ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
console.log(problems.length ? `\n${problems.length} Problem(e).` : '\nAlle Watchlist-Pruefungen bestanden.');
process.exit(problems.length ? 1 : 0);
