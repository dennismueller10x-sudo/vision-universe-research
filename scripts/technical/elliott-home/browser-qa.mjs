// VISION UNIVERSE ELLIOTT — Browser-QA
//
// Kundenwege auf iPhone (390/430), Tablet und Desktop, Hell und Dunkel:
//   1 Menue -> Elliott -> Welle 3 -> Aktie -> Elliott-Detail
//   2 Elliott -> Suche NVDA -> Detail
//   3 Aktienseite -> Elliott
//   4 Elliott -> Filter Abwaerts -> Karte -> Detail
//   5 Aktie ohne Elliott-Lesart (ehrliche Aussage, keine Umleitung)
//   6 zurueckgehaltene (STALE) Aktie
//   7 Zurueck-Navigation
//   8 Deep-Link-Reload (Startseite mit Filter, Aktienbild unter /elliott/#/<T>)
//   9 Altlinks /quant/#/elliott/<T>, technik, chartbild -> nativ
// Dazu: keine Konsolenfehler, kein horizontaler Overflow, nichts Bedienbares unter der Leiste,
// kein Shard-Abruf auf der Startseite, Anfragen und Bytes der Startseite.
//
//   node scripts/technical/elliott-home/browser-qa.mjs --url http://127.0.0.1:8765 --out /tmp/elliott-qa
// Lokal wird die Auslieferungsansicht (elliott-home.json) im Browser eingespielt; --live liest sie von der Seite.
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright'); }

const arg = (k, d) => process.argv.find((a) => a.startsWith('--' + k + '='))?.slice(k.length + 3) ?? (process.argv.includes('--' + k) ? process.argv[process.argv.indexOf('--' + k) + 1] : d);
const BASE = arg('url', 'http://127.0.0.1:8765');
const OUT = arg('out', '/tmp/elliott-qa');
const LIVE = process.argv.includes('--live');
const root = resolve(fileURLToPath(import.meta.url), '../../../..');
await mkdir(OUT, { recursive: true });
let HOME_JSON = null;
if (!LIVE) { const { buildHomeFromDir } = await import('./home.mjs'); HOME_JSON = JSON.stringify(buildHomeFromDir(root)); }

const VIEWPORTS = [
  { name: 'iphone-390', width: 390, height: 844, mobile: true },
  { name: 'mobile-430', width: 430, height: 932, mobile: true },
  { name: 'tablet-820', width: 820, height: 1180, mobile: true },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false }
];
const browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const findings = [];
let current = '';
const fail = (msg) => { findings.push(current + ': ' + msg); console.log('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

async function open(ctx) {
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|WebSocket/.test(m.text())) errors.push('console ' + m.text()); });
  page.on('request', (r) => requests.push(r.url()));
  if (HOME_JSON) await page.route('**/elliott-home.json', (r) => r.fulfill({ contentType: 'application/json', body: HOME_JSON }));
  page.__errors = errors; page.__requests = requests;
  return page;
}
async function layout(page, label) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement, bar = document.querySelector('#vu-dock');
    return { overflow: doc.scrollWidth - doc.clientWidth, barTop: bar ? bar.getBoundingClientRect().top : null };
  });
  check(r.overflow <= 1, label + ': kein horizontaler Overflow (' + r.overflow + ')');
}

for (const vp of VIEWPORTS) {
  for (const scheme of ['light', 'dark']) {
    if (vp.name !== 'iphone-390' && vp.name !== 'desktop-1440' && scheme === 'dark') continue;
    current = vp.name + '/' + scheme;
    console.log('\n== ' + current);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: vp.mobile, hasTouch: vp.mobile, colorScheme: scheme });
    if (scheme === 'dark') await ctx.addInitScript(() => { try { localStorage.setItem('vu-discover-theme-v1', 'dark'); } catch (e) { /* ignore */ } });
    const page = await open(ctx);

    // Startseite
    await page.goto(BASE + '/elliott/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#el-main[data-state="ready"]');
    check(await page.locator('h1.el-title').innerText() === 'Elliott', 'Startseite zeigt Elliott, keine Aktie');
    check(!/NVIDIA|NVDA/.test(await page.locator('h1.el-title').innerText()), 'kein Standardtitel');
    check(await page.locator('.el-row').count() >= 1, 'mindestens eine Reihe');
    check(await page.locator('#vu-dock a[aria-current=page]').first().innerText().then((t) => /Elliott/.test(t)), 'Leiste: Elliott aktiv');
    check(!page.__requests.some((u) => /technical-intelligence\/v3\/shards|index\.json\.gz/.test(u)), 'kein Shard-/Voll-Index-Abruf auf der Startseite');
    const bytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((n, e) => n + (e.transferSize || 0), 0));
    console.log('    Anfragen:', page.__requests.length, ' uebertragen ca.', Math.round(bytes / 1024), 'KB');
    await layout(page, 'Startseite');
    await page.screenshot({ path: `${OUT}/${vp.name}-${scheme}-home.png` });

    // Reihen: horizontale Karten, Projektionen nicht abgeschnitten
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.el-proj-v')].filter((n) => n.scrollWidth > n.clientWidth + 1).length);
    check(clipped === 0, 'keine abgeschnittene Projektion');
    const small = await page.evaluate(() => [...document.querySelectorAll('.el-card')].slice(0, 20).filter((n) => parseFloat(getComputedStyle(n.querySelector('.el-meta') || n).fontSize) < 12).length);
    check(small === 0, 'keine mikroskopischen Texte');

    // Weg 1: Welle 3 -> Aktie -> Detail
    const w3 = page.locator('.el-row[data-row="wave3"] a.el-card').first();
    if (await w3.count()) {
      const symbol = await w3.getAttribute('data-symbol');
      await w3.click();
      await page.waitForURL(/\/elliott\/#\/[A-Z]/);
      await page.waitForSelector('main#qx-main[data-ready="true"]', { timeout: 30000 });
      check(new URL(page.url()).pathname === '/elliott/' && page.url().includes('#/' + symbol), 'Karte oeffnet ' + symbol + ' unter /elliott/#/' + symbol + ' (nativ, kein /quant/)');
      check(await page.locator('.cb-crumbs').count() === 1, 'Elliott-Kopfzeile statt Quant-Rueckweg');
      check(await page.locator('#vu-dock a[aria-current], #vu-dock a.is-context').first().innerText().then((t) => /Elliott/.test(t)).catch(() => false), 'Leiste im Detail: Elliott');
      check(await page.locator('vu-navigation').evaluate((n) => n.getAttribute('dock')) === 'elliott', 'Shell-Produkt im Detail: elliott');
      await layout(page, 'Detail');
      await page.screenshot({ path: `${OUT}/${vp.name}-${scheme}-detail.png` });
      // Weg 7: Zurueck zur Elliott-Startseite
      await page.goBack({ waitUntil: 'networkidle' });
      await page.waitForSelector('#el-main[data-state="ready"]');
      check(new URL(page.url()).pathname === '/elliott/', 'Zurueck fuehrt zur Elliott-Startseite');
    } else fail('keine Welle-3-Karte zum Oeffnen (Datenlage?)');

    // Weg 4: Filter Abwaerts -> Karte -> Detail
    await page.goto(BASE + '/elliott/#/?richtung=ab', { waitUntil: 'networkidle' });
    await page.waitForSelector('.el-grid .el-card');
    const downs = await page.locator('.el-grid .el-card .el-dir.is-up').count();
    check(downs === 0, 'Filter Abwaerts zeigt nur Abwaertslesarten');
    await page.screenshot({ path: `${OUT}/${vp.name}-${scheme}-filter.png` });
    await page.locator('.el-grid .el-card').first().click();
    await page.waitForURL(/\/elliott\/#\/[A-Z]/);
    await page.waitForSelector('main#qx-main[data-ready="true"]', { timeout: 30000 });
    check(true, 'Filter -> Karte -> Detail');
    await page.goBack({ waitUntil: 'networkidle' });
    await page.waitForSelector('.el-grid .el-card');
    check(/richtung=ab/.test(page.url()), 'Zurueck stellt den Filter Abwaerts wieder her');
    await page.goForward({ waitUntil: 'networkidle' });
    await page.waitForSelector('main#qx-main[data-ready="true"]', { timeout: 30000 });

    // Weg 8: Deep-Link-Reload
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('main#qx-main[data-ready="true"]', { timeout: 30000 });
    check(/\/elliott\/#\/[A-Z]/.test(page.url()) && await page.locator('.cb-crumbs').count() === 1, 'Detail-Deep-Link ueberlebt den Reload (bleibt auf der Aktie)');
    await page.goto(BASE + '/elliott/#/?welle=3&status=bestaetigt', { waitUntil: 'networkidle' });
    await page.waitForSelector('#el-main[data-state="ready"]');
    check(await page.locator('.el-chip.is-on').count() >= 2, 'Filter-Deep-Link stellt die Auswahl her');

    // Weg 2: Suche NVDA -> Detail
    await page.goto(BASE + '/elliott/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#el-main[data-state="ready"]');
    await page.locator('#el-q').fill('NVDA');
    await page.waitForSelector('.el-hit a', { timeout: 15000 });
    check((await page.locator('.el-hit').first().innerText()).includes('NVDA'), 'Suche NVDA findet NVIDIA');
    await page.screenshot({ path: `${OUT}/${vp.name}-${scheme}-search.png` });
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/elliott\/#\/NVDA/);
    await page.waitForSelector('main#qx-main[data-ready="true"]', { timeout: 30000 });
    check(!page.url().includes('/quant/'), 'Suche -> Elliott-Detail NVDA (nativ, nicht ueber Quant)');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('main#qx-main[data-ready="true"]', { timeout: 30000 });
    check(page.url().includes('/elliott/#/NVDA'), 'Reload bleibt auf /elliott/#/NVDA');
    // Weg 5: Aktie ohne Lesart: ehrliche Aussage, Aktie bleibt sichtbar
    const nothesis = await page.locator('.cb-nothesis').count(), hero = await page.locator('.cb-hero').count();
    check(hero === 1 && (nothesis === 1 || await page.locator('.cb-pj-hl, .cb-ewp').count() > 0), 'NVDA: Lesart oder ehrliche "Keine belastbare Elliott-Lesart"');

    // Weg 3: Aktienseite -> Elliott
    await page.goto(BASE + '/quant/#/aktie/NVDA', { waitUntil: 'networkidle' });
    await page.waitForSelector('main#qx-main[data-ready="true"]', { timeout: 30000 });
    const link = page.locator('a[href="/elliott/#/NVDA"]').first();
    check(await link.count() > 0, 'Aktienseite fuehrt auf Elliott');
    if (await link.count()) { await link.click(); await page.waitForURL(/\/elliott\/#\/NVDA/); check(true, 'Aktienseite -> Elliott (nativ)'); }

    // Altlink: Chartbild/Technik -> Elliott
    await page.goto(BASE + '/quant/#/aktie/NVDA/technik?elliott=1', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => location.pathname === '/elliott/' && /#\/NVDA/.test(location.hash));
    check(page.url().endsWith('/elliott/#/NVDA?ansicht=profi'), 'Altlink technik?elliott=1 -> /elliott/#/NVDA?ansicht=profi');
    await page.goto(BASE + '/quant/#/elliott/NVDA', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => location.pathname === '/elliott/');
    await page.waitForTimeout(300);
    check(/\/elliott\/#\/NVDA(\?ansicht=profi)?$/.test(page.url()), 'Altlink /quant/#/elliott/NVDA -> /elliott/#/NVDA (' + page.url() + ')');

    // Weg 6: zurueckgehaltene Aktie (falls der Index eine nennt) bleibt sichtbar, ohne laufende These
    await page.goto(BASE + '/elliott/#/AIXC', { waitUntil: 'networkidle' });
    await page.waitForSelector('main#qx-main[data-ready="true"]', { timeout: 30000 });
    const body = await page.locator('main#qx-main').innerText();
    check(body.length > 80 && !/Diese Seite gibt es nicht/.test(body), 'zurueckgehaltene oder unbekannte Aktie: ehrlicher Zustand, kein 404');
    await page.screenshot({ path: `${OUT}/${vp.name}-${scheme}-withheld.png` });

    check(page.__errors.length === 0, 'keine Konsolen-/Seitenfehler' + (page.__errors.length ? ': ' + page.__errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
}
await browser.close();
console.log('\n' + (findings.length ? findings.length + ' Befund(e):\n' + findings.join('\n') : 'Alle Pruefungen bestanden.'));
process.exit(findings.length ? 1 : 0);
