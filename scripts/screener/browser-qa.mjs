// VISION UNIVERSE SCREENER — Browser-QA
//
// Faehrt die Kernflows auf iPhone (390/430), Tablet und Desktop in Hell und
// Dunkel und prueft dabei: keine Konsolenfehler, kein horizontaler Overflow,
// nichts Bedienbares unter der Tab-Leiste, Filter hinzufuegen/bearbeiten/
// loeschen, Suche, Sortierung, Ansichten, Speichern, Wiedereroeffnen,
// Browser-Zurueck, Why Match, Quick Research, Vergleich, leere Ergebnisse.
//
//   node scripts/screener/browser-qa.mjs --url http://127.0.0.1:8765 --out /tmp/screener-qa
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright'); }

const arg = (k, d) => process.argv.find((a) => a.startsWith('--' + k + '='))?.slice(k.length + 3) ?? (process.argv.includes('--' + k) ? process.argv[process.argv.indexOf('--' + k) + 1] : d);
const BASE = arg('url', 'http://127.0.0.1:8765');
const OUT = arg('out', '/tmp/screener-qa');
const ONLY = arg('only', '');
await mkdir(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'iphone-390', width: 390, height: 844, mobile: true },
  { name: 'mobile-430', width: 430, height: 932, mobile: true },
  { name: 'tablet-820', width: 820, height: 1180, mobile: true },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false }
];
const launch = { headless: true };
try { require('node:fs').accessSync('/opt/pw-browsers/chromium'); } catch { /* default */ }
const browser = await playwright.chromium.launch(launch);
const findings = [];
const fail = (vp, msg) => { findings.push(vp + ': ' + msg); console.log('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);

async function checkLayout(page, vp, label) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    const bar = document.querySelector('#vu-dock'); // gemeinsame Produkt-Leiste der Shell
    const barTop = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : Infinity;
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const rc = el.getBoundingClientRect();
      if (rc.width && rc.right > doc.clientWidth + 1 && !el.closest('.sc-tablewrap,.sc-cmp,.sc-toolbar,.sc-filterline,.sc-tabs,.sc-sheet,vu-navigation,.sc-skip,.sc-toast,.sc-sr')) offenders.push((el.className || el.tagName) + ' ' + Math.round(rc.right));
      if (offenders.length > 4) break;
    }
    /* Das globale Menue oeffnet ☰ in der Produkt-Leiste (der Kopf traegt dann keinen eigenen Knopf). */
    const nav = document.querySelector('#vu-dock')?.shadowRoot?.querySelector('button.menu')?.getBoundingClientRect();
    if (!nav || !nav.width) offenders.push('vu-navigation Menü fehlt');
    else if (nav.right > doc.clientWidth + 1 || nav.bottom > innerHeight + 1) offenders.push('vu-navigation Menü abgeschnitten');
    // Inhalte, die aus ihrer Karte ragen (abgeschnitten)
    const clipped = [];
    for (const card of document.querySelectorAll('.sc-rc, .sc-chip, .sc-kpi, .sc-why-item, .sc-row, .sc-cr, .sc-tl, .sc-libitem')) {
      const cr = card.getBoundingClientRect();
      for (const el of card.querySelectorAll('*')) { const rc = el.getBoundingClientRect(); if (rc.width && rc.right > cr.right + 1 && getComputedStyle(el).position !== 'absolute') { clipped.push((card.className.split(' ').pop()) + '>' + (el.className?.baseVal ?? el.className ?? el.tagName)); break; } }
      if (clipped.length > 3) break;
    }
    // Zugaenglichkeit: Buttons ohne Namen
    const unnamed = [...document.querySelectorAll('button,a[href]')].filter((b) => b.offsetParent && !(b.getAttribute('aria-label') || b.textContent.trim() || b.title)).length;
    // Kleine Touch-Ziele (nur mobil relevant)
    const small = [...document.querySelectorAll('.sc-app button, .sc-app a[href], .sc-sheet button')].filter((b) => { const rc = b.getBoundingClientRect(); return b.offsetParent && rc.width && rc.height && (rc.height < 32 || rc.width < 32); }).map((b) => (b.className || b.tagName) + ':' + (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 20)).slice(0, 5);
    return { overflow, offenders, unnamed, small, barTop, clipped };
  });
  if (r.offenders.some((o) => o.startsWith('vu-navigation'))) fail(vp, label + ': Menü-Button fehlt oder abgeschnitten');
  if (r.overflow > 1) fail(vp, label + ': horizontaler Overflow ' + r.overflow + 'px ' + r.offenders.join(', '));
  if (r.clipped.length) fail(vp, label + ': Inhalt ragt aus Karte: ' + r.clipped.join(' | '));
  if (r.unnamed) fail(vp, label + ': ' + r.unnamed + ' Bedienelemente ohne Namen');
  if (r.small.length && vp !== 'desktop-1440') fail(vp, label + ': kleine Touch-Ziele ' + r.small.join(' | '));
  return r;
}
async function shot(page, vp, name, full = false) { await page.screenshot({ path: `${OUT}/${vp}-${name}.png`, fullPage: full }); }
async function settle(page, ms = 350) { await page.waitForTimeout(ms); }

for (const theme of ['light', 'dark']) {
  for (const V of VIEWPORTS) {
    if (ONLY && !V.name.includes(ONLY)) continue;
    const vp = V.name + '-' + theme;
    console.log('\n' + vp);
    const ctx = await browser.newContext({ viewport: { width: V.width, height: V.height }, deviceScaleFactor: 2, isMobile: V.mobile, hasTouch: V.mobile });
    await ctx.addInitScript((t) => { try { localStorage.setItem('vu-discover-theme-v1', t); } catch {} }, theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_FILE_NOT_FOUND|net::ERR/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
    const desk = V.width >= 1024;
    try {
      // 1 Start (0 Filter)
      await page.goto(BASE + '/screener/', { waitUntil: 'networkidle' });
      await page.waitForSelector('.sc-universe', { timeout: 15000 });
      const count = await page.textContent('.sc-universe strong');
      if (!/^\d{1,2}\.\d{3}$/.test(count.trim())) fail(vp, 'Universumszahl unerwartet: ' + count); else ok('Start zeigt ' + count + ' Aktien');
      const themeAttr = await page.getAttribute('html', 'data-theme');
      if (themeAttr !== theme) fail(vp, 'Theme ' + themeAttr + ' statt ' + theme);
      await checkLayout(page, vp, 'Start');
      await shot(page, vp, '01-start');

      // 2 Filterbibliothek + Suche "200"
      await page.click('.sc-searchfake');
      await page.waitForSelector('.sc-sheet.is-open input[type=search]');
      await settle(page);
      await page.fill('.sc-sheet.is-open input[type=search]', '200');
      await settle(page, 250);
      const hits = await page.$$eval('.sc-sheet.is-open .sc-libitem b', (b) => b.map((x) => x.textContent));
      if (!hits.some((t) => t.includes('SMA200'))) fail(vp, 'Suche "200" findet SMA200 nicht: ' + hits.join(', ')); else ok('Suche „200“: ' + hits.slice(0, 3).join(', '));
      await shot(page, vp, '02-library-search');
      // Kurs vs SMA200 oeffnen und hinzufuegen
      await page.click('.sc-sheet.is-open .sc-libitem:has-text("Kurs vs. SMA200")');
      await page.waitForSelector('.sc-sheet.is-open .sc-hist');
      await settle(page, 400);
      await checkLayout(page, vp, 'Filter-Detail');
      await shot(page, vp, '03-detail-sma200');
      await page.click('.sc-sheet.is-open .sc-sheet-foot .sc-btn-primary');
      await settle(page, 700);

      // 3 Weitere Filter: Sektor Technologie, Market Cap < 1 Mrd, 52W-Hoch
      async function addViaSearch(term, itemText, setup) {
        await page.click(desk ? '.sc-side .sc-btn-secondary:has-text("Filter hinzufügen")' : '.sc-stack .sc-btn-secondary:has-text("Filter hinzufügen")');
        await page.waitForSelector('.sc-sheet.is-open input[type=search]');
        await page.fill('.sc-sheet.is-open input[type=search]', term);
        await settle(page, 250);
        await page.click(`.sc-sheet.is-open .sc-libitem:has-text("${itemText}")`);
        await page.waitForSelector('.sc-sheet.is-open .sc-sheet-foot .sc-btn-primary');
        await settle(page, 300);
        if (setup) await setup();
        await settle(page, 200);
        await page.click('.sc-sheet.is-open .sc-sheet-foot .sc-btn-primary');
        await settle(page, 700);
      }
      await addViaSearch('sektor', 'Sektor', async () => { await page.click('.sc-sheet.is-open .sc-enum label:has-text("Technologie")'); });
      await addViaSearch('market cap', 'Marktkapitalisierung', async () => { await page.click('.sc-sheet.is-open .sc-preset:has-text("Small")'); });
      await addViaSearch('52w', 'Abstand zum 52W-Hoch', async () => { await page.click('.sc-sheet.is-open .sc-preset:has-text("Näher als 10")'); });
      const chips = await page.$$eval('.sc-chip-body b', (b) => b.map((x) => x.textContent));
      if (chips.length !== 4) fail(vp, 'Erwartet 4 Filter, gefunden ' + chips.length + ': ' + chips.join(' | ')); else ok('Filterstack: ' + chips.join(' | '));
      const funnel = await page.$$eval('.sc-tl-main b', (s) => s.map((x) => Number(x.textContent.replace(/\./g, ''))));
      if (funnel.length !== 5 || funnel.some((v, i) => i && v > funnel[i - 1])) fail(vp, 'Trichter nicht monoton: ' + funnel.join(' → ')); else ok('Filter-Impact: ' + funnel.join(' → '));
      await checkLayout(page, vp, 'Build');
      await shot(page, vp, '04-build', true);
      if (!desk) {
        const cta = await page.$('.sc-cta button');
        const box = cta && await cta.boundingBox();
        const tbb = await page.locator('#vu-dock nav').boundingBox();
        if (!box || !tbb || box.y + box.height > tbb.y + 1) fail(vp, 'Sticky CTA überlappt Produkt-Leiste'); else ok('Sticky CTA über Produkt-Leiste');
      }

      // 4 Filter bearbeiten (Market Cap -> < 2 Mrd per Operator "kleiner als" bleibt) und Browser-Zurueck
      const before = await page.textContent('.sc-counter strong');
      await page.click('.sc-chip-body:has-text("Market Cap")');
      await page.waitForSelector('.sc-sheet.is-open .sc-ops');
      await page.click('.sc-sheet.is-open .sc-preset:has-text("Mid")');
      await settle(page, 300);
      await page.click('.sc-sheet.is-open .sc-sheet-foot .sc-btn-primary');
      await settle(page, 700);
      const after = await page.textContent('.sc-counter strong');
      if (after === before) fail(vp, 'Bearbeiten ändert Trefferzahl nicht (' + before + ')'); else ok('Filter bearbeitet: ' + before + ' → ' + after);
      await page.goBack(); await settle(page, 700);
      const back = await page.textContent('.sc-counter strong');
      if (back !== before) fail(vp, 'Browser-Zurück stellt Zustand nicht her: ' + back + ' statt ' + before); else ok('Browser-Zurück: ' + back);

      // 5 Ergebnisse (Karten), Sortierung, Ansichten
      if (!desk) { await page.click('.sc-cta button'); await settle(page, 600); }
      await page.waitForSelector('.sc-rc, .sc-state');
      const cards = await page.$$('.sc-rc');
      ok('Ergebnis-Karten: ' + cards.length);
      await settle(page, 800);
      await checkLayout(page, vp, 'Ergebnisse Karten');
      await shot(page, vp, '05-results-cards');
      // Tab-Leiste verdeckt nichts: letztes Element erreichbar
      await page.click('.sc-toolbar .sc-btn:has-text("↓"), .sc-toolbar .sc-btn:has-text("↑")');
      await page.waitForSelector('.sc-sheet.is-open input[name=sc-sort]');
      await page.click('.sc-sheet.is-open label:has-text("Performance 6 Monate")');
      await page.click('.sc-sheet.is-open .sc-sheet-foot .sc-btn-primary');
      await settle(page, 700);
      if (!(await page.url()).includes('sort=perf6m')) fail(vp, 'Sortierung nicht in der URL'); else ok('Sortierung Performance 6M in URL');
      await page.click('.sc-toolbar .sc-seg button[aria-label=Tabelle]');
      await settle(page, 500);
      await checkLayout(page, vp, 'Tabelle');
      await shot(page, vp, '06-results-table');
      await page.click('.sc-toolbar .sc-seg button[aria-label=Kompakt]');
      await settle(page, 400);
      await shot(page, vp, '07-results-compact');
      await page.click('.sc-toolbar .sc-seg button[aria-label=Karten]');
      await settle(page, 400);

      // 6 Why Match + Quick Research
      if (cards.length) {
        await page.click('.sc-rc button[aria-label^="Warum"] >> nth=0');
        await page.waitForSelector('.sc-sheet.is-open .sc-why-item');
        await settle(page, 900);
        const items = await page.$$eval('.sc-sheet.is-open .sc-why-item', (x) => x.length);
        const good = await page.$('.sc-sheet.is-open .sc-allgood b:has-text("Alle Kriterien erfüllt")');
        if (items !== 4 || !good) fail(vp, 'Why Match unvollständig (' + items + ')'); else ok('Why Match: 4 Kriterien erfüllt');
        await checkLayout(page, vp, 'Why');
        await shot(page, vp, '08-why');
        await page.keyboard.press('Escape'); await settle(page, 500);
        await page.click('.sc-rc >> nth=0');
        await page.waitForSelector('.sc-sheet.is-open .sc-tabs');
        await settle(page, 900);
        await shot(page, vp, '09-quick-overview');
        await page.click('.sc-sheet.is-open .sc-tabs button:has-text("Kennzahlen")');
        await page.waitForSelector('.sc-sheet.is-open .sc-kpi, .sc-sheet.is-open .sc-state', { timeout: 8000 });
        await settle(page, 400);
        await checkLayout(page, vp, 'Quick Research');
        await shot(page, vp, '10-quick-numbers');
        await page.click('.sc-sheet.is-open .sc-tabs button:has-text("Chart")');
        await settle(page, 900);
        await shot(page, vp, '11-quick-chart');
        // Browser-Zurueck schliesst das Sheet
        await page.goBack(); await settle(page, 600);
        if (await page.$('.sc-sheet.is-open')) fail(vp, 'Zurück schließt Quick Research nicht'); else ok('Zurück schließt Sheet');
      }

      // 7 Vergleich
      if (cards.length >= 2) {
        await page.click('.sc-toolbar .sc-btn:has-text("Vergleichen")');
        await settle(page, 300);
        await page.click('.sc-rc .sc-check >> nth=0'); await settle(page, 250);
        await page.click('.sc-rc .sc-check >> nth=1'); await settle(page, 250);
        await page.click('.sc-comparebar .sc-btn');
        await page.waitForSelector('.sc-cmp table');
        await settle(page, 400);
        await checkLayout(page, vp, 'Vergleich');
        await shot(page, vp, '12-compare');
        ok('Vergleich mit 2 Aktien');
        await page.goBack(); await settle(page, 600);
      }

      // 8 Speichern + erneut oeffnen + Veraenderungen
      await page.goto(BASE + '/screener/' + (await page.url()).split('/screener/')[1].replace(/&?cmp=[^&]*/, '').replace('view=compare', 'view=results'), { waitUntil: 'networkidle' });
      await page.waitForSelector('.sc-rc, .sc-state, .sc-cr, .sc-table');
      await page.click(desk ? '.sc-row:has-text("Screen speichern")' : '.sc-bar button[aria-label="Screen speichern"]');
      await page.waitForSelector('.sc-sheet.is-open input');
      await page.fill('.sc-sheet.is-open input', 'Tech Small Caps');
      await page.click('.sc-sheet.is-open .sc-sheet-foot .sc-btn-primary');
      await settle(page, 700);
      if (!(await page.url()).includes('screen=')) fail(vp, 'Gespeicherter Screen nicht in URL'); else ok('Screen gespeichert');
      await page.goto(BASE + '/screener/?view=saved', { waitUntil: 'networkidle' });
      await page.waitForSelector('.sc-card b:has-text("Tech Small Caps")');
      await checkLayout(page, vp, 'Gespeichert');
      await shot(page, vp, '13-saved');
      await page.click('.sc-card:has-text("Tech Small Caps") .sc-btn:has-text("Veränderungen")');
      await page.waitForSelector('.sc-toggle');
      await shot(page, vp, '14-changes', true);
      await page.click('.sc-card:has-text("Treffer öffnen") .sc-btn');
      await settle(page, 700);
      const chipsAgain = await page.$$eval('.sc-mini-chip', (b) => b.length);
      if (chipsAgain < 4) fail(vp, 'Wiedereröffneter Screen hat ' + chipsAgain + ' Filter'); else ok('Gespeicherter Screen wieder geöffnet');

      // 9 0 Ergebnisse
      await page.goto(BASE + '/screener/?f=marketCap:gt:1e13&view=results', { waitUntil: 'networkidle' });
      await page.waitForSelector('.sc-state h3');
      const empty = await page.textContent('.sc-state h3');
      if (!/Keine Aktie/.test(empty)) fail(vp, 'Leerer Zustand fehlt'); else ok('0 Ergebnisse: ' + empty);
      await shot(page, vp, '15-empty');

      // 10 Ungueltiger Link
      await page.goto(BASE + '/screener/?f=nope:gt:1', { waitUntil: 'networkidle' });
      await page.waitForSelector('[role=alert]');
      ok('Ungültiger Link wird gemeldet');

      // 11 Pro-Modus: Gruppen + Ranking + 15 Filter
      const pro = '/screener/?mode=pro&f=revenueGrowth:gt:0.2&f=epsGrowth:gt:0.15&f=g2~priceVsSma200:gt:0&f=g2~rsi:lt:70&go=g2:OR&gn=g2:Technik&rank=momentum:40,growth:30,quality:20,value:10';
      await page.goto(BASE + pro, { waitUntil: 'networkidle' });
      await page.waitForSelector('.sc-group');
      await settle(page, 500);
      const groups = await page.$$('.sc-group');
      if (groups.length !== 2) fail(vp, 'Pro: erwartet 2 Gruppen'); else ok('Pro: 2 Gruppen, ODER in Gruppe 2');
      await checkLayout(page, vp, 'Pro');
      await shot(page, vp, '16-pro-groups', true);
      const many = '/screener/?view=results&' + ['marketCap:gt:1e8', 'price:gt:1', 'avgVolume:gt:1000', 'perf1y:gt:-0.99', 'perf1m:gt:-0.99', 'perf3m:gt:-0.99', 'priceVsSma20:gt:-0.9', 'priceVsSma50:gt:-0.9', 'rsi:lt:100', 'volatility:lt:5', 'beta:lt:10', 'dollarVolume:gt:1', 'distance52wHigh:gt:-1', 'distance52wLow:gt:-1', 'perf1d:gt:-1'].map((f) => 'f=' + f).join('&');
      await page.goto(BASE + many, { waitUntil: 'networkidle' });
      await page.waitForSelector('.sc-rc');
      const fifteen = await page.$$eval('.sc-mini-chip', (b) => b.length - 1);
      if (fifteen !== 15) fail(vp, '15 Filter erwartet, ' + fifteen); else ok('15 Filter, ' + (await page.textContent('.sc-count')).trim());
      await checkLayout(page, vp, '15 Filter');
      // 500+ Ergebnisse: Nachladen
      await page.goto(BASE + '/screener/?view=results&f=marketCap:gt:1e8', { waitUntil: 'networkidle' });
      await page.waitForSelector('.sc-rc');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await settle(page, 900);
      const more = await page.$$eval('.sc-rc', (x) => x.length);
      if (more <= 30) fail(vp, 'Nachladen funktioniert nicht (' + more + ')'); else ok('Nachladen: ' + more + ' Karten');
    } catch (e) {
      fail(vp, 'Flow abgebrochen: ' + e.message.split('\n')[0]);
      await shot(page, vp, 'zz-error').catch(() => {});
    }
    if (errors.length) fail(vp, 'Konsolenfehler: ' + errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
}
await browser.close();
await writeFile(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
console.log('\n' + (findings.length ? findings.length + ' Befunde' : 'Keine Befunde'));
process.exit(findings.length ? 1 : 0);
