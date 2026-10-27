#!/usr/bin/env node
// Vision Universe — Browser-QA: Discover-Watchlist-Knopf, gekoppelt an die Konto-Watchlist (docs/accounts/WATCHLIST.md §5).
//
//   node scripts/account/dev-server.mjs --port=8790 &      (lokale Simulation, braucht PG_TEST_URL)
//   node scripts/discover/watchlist-coupling-qa.mjs --url=http://localhost:8790 [--engine=webkit]
//
// Abgemeldet: der Knopf arbeitet rein lokal, vorhandene Eintraege bleiben. Angemeldet: ein Klick schreibt lokal und Konto,
// ein nur lokaler Eintrag wird nicht von selbst hochgeladen, nach dem Abmelden zeigt der Knopf wieder nur den lokalen Stand.
import {createRequire} from 'node:module';

const arg = (name, fallback) => (process.argv.find(a => a.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=').slice(1).join('=');
const base = arg('url', 'http://localhost:8790');
const engine = arg('engine', 'chromium');
const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await pw[engine].launch();
const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`${ok ? 'ok  ' : 'FEHL'} ${what}`); };
const KEY = 'vu-discover-watchlist-v1';

const context = await browser.newContext({viewport: {width: 1280, height: 900}});
await context.addInitScript(k => { try { if (!sessionStorage.getItem('qa-seeded')) { localStorage.setItem(k, '["AAPL"]'); sessionStorage.setItem('qa-seeded', '1'); } } catch (e) {} }, KEY);
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
let inflight = 0;
page.on('request', () => { inflight++; });
for (const e of ['requestfinished', 'requestfailed']) page.on(e, () => { inflight = Math.max(0, inflight - 1); });
/* wartet, bis 500 ms lang keine Anfrage mehr laeuft (auch nach einem reinen Hash-Wechsel) */
async function settle() { for (let quiet = 0, n = 0; quiet < 5 && n < 200; n++) { await page.waitForTimeout(100); quiet = inflight ? 0 : quiet + 1; } }
const local = () => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), KEY);
const central = () => page.evaluate(async () => { const r = await fetch('/v1/watchlist', {credentials: 'include', headers: {'X-VU-Client': 'web'}}); return r.ok ? (await r.json()).items.map(i => i.ticker) : null; });
async function stock(t) {
  await page.goto(`${base}/discover/#/s/US_REAL/${t}`);
  return shown();
}
/* wartet auf die gezeichnete Seite; ein zweites goto auf dieselbe Adresse wuerde sie neu laden und laufende Abrufe abbrechen */
async function shown() {
  await page.waitForSelector('.v2-watch-button');
  await page.waitForTimeout(800);   /* Kontostand geladen, Knopf neu gezeichnet */
  await settle();                    /* WebKit meldet Abrufe, die eine spaetere Navigation abbricht, als Seitenfehler */
  return page.locator('.v2-watch-button');
}

// Abgemeldet
let btn = await stock('NVDA');
check(await btn.getAttribute('aria-pressed') === 'false', 'abgemeldet: NVDA nicht beobachtet');
await btn.click();
check(JSON.stringify(await local()) === '["NVDA","AAPL"]', 'abgemeldet: lokal gespeichert, AAPL bleibt');
await btn.click();
check(JSON.stringify(await local()) === '["AAPL"]', 'abgemeldet: lokal entfernt, AAPL bleibt');

// Anmelden (Registrierung in der Simulation)
await page.goto(`${base}/konto/registrieren/`);
await page.fill('#email', `sync-qa-${engine}-${Date.now()}@example.test`);
await page.fill('#password', 'Sicheres-Passwort-26');
await page.check('#terms');
await page.click('#ka-register button[type=submit]');
await page.waitForSelector('#ka-register-done:not([hidden])');
await page.goto(`${base}/__dev/mail`);
await page.click('a.btn');
await page.waitForURL(/\/konto\/\?status=verified/);

btn = await stock('AAPL');
check(await btn.getAttribute('aria-pressed') === 'true', 'angemeldet: nur lokaler Eintrag AAPL bleibt sichtbar');
check(JSON.stringify(await central()) === '[]', 'angemeldet: AAPL wurde nicht von selbst ins Konto uebernommen');
btn = await stock('NVDA');
await btn.click();
await page.waitForTimeout(800);
check(JSON.stringify(await local()) === '["NVDA","AAPL"]', 'angemeldet: Klick speichert lokal');
check(JSON.stringify(await central()) === '["NVDA"]', 'angemeldet: Klick speichert im Konto');
// Ein Titel nur im Konto (anderes Geraet): ueber die API anlegen, lokal fehlt er.
await page.evaluate(() => sessionStorage.removeItem('vu-watchlist-ids-v1'));
await page.evaluate(async () => { await fetch('/v1/watchlist/items', {method: 'POST', credentials: 'include', headers: {'Content-Type': 'application/json', 'X-VU-Client': 'web'}, body: JSON.stringify({instrumentId: (await (await fetch('/quant/data/universe/instruments/' + globalThis.VUCore.Identity.shardKey('MSFT') + '.json')).json()).instruments.find(i => i.symbol === 'MSFT' && i.active).instrumentId, ticker: 'MSFT'})}); });
// Ein anderes Geraet zeigt sich nach dem Neuladen (oder nach 5 Minuten Zwischenspeicher) - nicht mitten in derselben Seite.
await stock('MSFT'); await page.reload();
btn = await shown();
check(await btn.getAttribute('aria-pressed') === 'true', 'angemeldet: Titel nur im Konto wird als beobachtet gezeigt');
await btn.click();
await page.waitForTimeout(800);
check(!(await central()).includes('MSFT'), 'angemeldet: Ausschalten entfernt ihn im Konto');
check(JSON.stringify(await local()) === '["NVDA","AAPL"]', 'angemeldet: lokale Liste dabei unveraendert');

// Abmelden: lokale Liste bleibt, Knopf wieder rein lokal
await page.goto(`${base}/konto/`);
await page.click('#ka-logout');
await page.waitForTimeout(500);
btn = await stock('AAPL');
check(await btn.getAttribute('aria-pressed') === 'true', 'nach Abmelden: lokaler Eintrag bleibt');
check(JSON.stringify(await local()) === '["NVDA","AAPL"]', 'nach Abmelden: nichts lokal geloescht');
check(!errors.length, 'keine Seitenfehler ' + errors.join(' | '));

await browser.close();
if (problems.length) { console.error(`\n${problems.length} Befund(e).`); process.exit(1); }
console.log('\nAlle Kopplungs-Pruefungen bestanden.');
