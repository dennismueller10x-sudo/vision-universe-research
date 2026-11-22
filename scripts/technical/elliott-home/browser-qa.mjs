// VISION UNIVERSE ELLIOTT — Browser-QA
//
// Kundenwege auf iPhone (390/430), Tablet und Desktop, Hell und Dunkel:
//   1 Menue -> Elliott -> Zaehlbar-Liste -> Aktie -> Elliott-Detail
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
    // App-Konzept 2: die Frage ist die Dachzeile der Kopfkachel (einzige h1), die Seite traegt ihre Reiter im Inhalt
    check(/Wellen/i.test(await page.locator('h1.el-title').innerText()) && await page.evaluate(() => document.querySelectorAll('h1').length) === 1 && await page.locator('.ek-kopf h1.el-title').count() === 1, 'Startseite zeigt Elliott (Frage als Titel), keine Aktie');
    check(!/NVIDIA|NVDA/.test(await page.locator('h1.el-title').innerText()), 'kein Standardtitel');
    check(await page.locator('#el-main .ek-rail').count() >= 1, 'mindestens eine Schiene');
    // Menü im Kopf (Owner 22.11.2026): keine Reiter, oben links „Elliott · Start“.
    check(await page.evaluate(() => { const r = document.querySelector('vu-navigation').shadowRoot, t = document.querySelector('#el-main .ek-tabs'); return r.querySelector('nav.tabs').hidden && (!t || getComputedStyle(t).display === 'none') && r.querySelector('.world-name').textContent.trim() === 'Elliott' && r.querySelector('.world-area').textContent.trim() === 'Start'; }), 'Kopf: Elliott · Start, keine Reiter');
    check(!page.__requests.some((u) => /technical-intelligence\/v3\/shards|index\.json\.gz/.test(u)), 'kein Shard-/Voll-Index-Abruf auf der Startseite');
    const bytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((n, e) => n + (e.transferSize || 0), 0));
    console.log('    Anfragen:', page.__requests.length, ' uebertragen ca.', Math.round(bytes / 1024), 'KB');
    await layout(page, 'Startseite');
    await page.screenshot({ path: `${OUT}/${vp.name}-${scheme}-home.png` });
    // App-Konzept 2: Kopfkachel, Schiene der zählbaren Aktien, „Weiter“-Karte; „Wellen in 3 Minuten“ lädt beim Antippen (elliott/about.js)
    check(await page.locator('.ek-kopf .ek-big').count() >= 1 && await page.locator('.ek-rail a.el-cr').count() >= 1 && await page.locator('#el-main a.ek-next[href="/technical/#/"]').count() === 1, 'Kopfkachel, Schiene und „Weiter“-Karte');
    // „Heute neu“: Aktien-Elemente öffnen die Vorschau des Rahmens (data-vu-stock, Ziel /aktie/#/<T>); Wellenlagen tragen „Schema, keine echten Kurse“
    check(await page.evaluate(() => { const a = [...document.querySelectorAll('.ek-nc[data-vu-stock]')]; return !a.length || a.every((n) => n.getAttribute('href') === '/aktie/#/' + encodeURIComponent(n.dataset.vuStock) && n.dataset.vuStockName); }), '„Heute neu“: data-vu-stock und Ziel /aktie/#/<T>');
    check(await page.locator('.ek-form').count() === 0 || (/Schema[^.]*keine echten Kurse/.test(await page.locator('#el-main').innerText()) && await page.locator('.ek-form[aria-label*="Schema, keine echten Kurse"]').count() === await page.locator('.ek-form').count()), 'Wellenlagen: als Schema beschriftet');
    await page.locator('.ek-cover').click();
    await page.waitForSelector('#ek-kopf-pop:not([hidden])', { timeout: 5000 });
    check(/Klarheit A–C/.test(await page.locator('#ek-kopf-pop').innerText()), 'Kopfkachel öffnet das Erklärfenster');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#ek-kopf-pop', { state: 'hidden' });
    await page.locator('.el-about').click();
    await page.waitForSelector('#el-sheet:not([hidden])', { timeout: 15000 });
    check(/Impuls/.test(await page.locator('#el-sheet').innerText()), 'Fenster „Wellen in 3 Minuten“ öffnet mit Inhalt');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#el-sheet', { state: 'hidden' });

    // Reihen: horizontale Karten, Projektionen nicht abgeschnitten
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.el-proj-v')].filter((n) => n.scrollWidth > n.clientWidth + 1).length);
    check(clipped === 0, 'keine abgeschnittene Projektion');
    const small = await page.evaluate(() => [...document.querySelectorAll('.el-card')].slice(0, 20).filter((n) => parseFloat(getComputedStyle(n.querySelector('.el-meta') || n).fontSize) < 12).length);
    check(small === 0, 'keine mikroskopischen Texte');

    // Weg 1: Zaehlbar-Liste -> Aktie -> Detail
    const w3 = page.locator('#el-main a.el-cr').first();
    // Kurs gegen Ungültig-Marke (Owner 16.11.2026, gegen den Wochenschluss): jede Karte „Zählbar heute“ mit Ungültig-Marke trägt
    // den Balken und den Abstand; ohne Marke kein Balken. Kein zusätzlicher Abruf (Shards bleiben unangetastet, siehe oben).
    const tileGap = await page.evaluate(() => [...document.querySelectorAll('.ek-rail a.el-cr.ek-nc')].map((a) => ({ inv: !!a.querySelector('.ek-nc-i:not(.ek-gap-t)'), bar: a.querySelectorAll('.ek-gap').length, t: (a.querySelector('.ek-gap-t') || {}).textContent || '' })));
    check(tileGap.length > 0 && tileGap.every((g) => g.inv ? g.bar === 1 && /^Abstand \d+(,\d)? % · Wochenschluss \d\d\.\d\d\.$|^Wochenschluss \d\d\.\d\d\. (unter|über) der Marke$/.test(g.t) : g.bar === 0), 'Zählbar heute: Balken „Kurs gegen Ungültig-Marke“ genau bei Karten mit Marke (' + tileGap.filter((g) => g.bar).length + '/' + tileGap.length + ')');
    if (await w3.count()) {
      const symbol = await w3.getAttribute('data-symbol');
      const gapOnTile = await w3.evaluate((a) => ((a.querySelector('.ek-gap-t') || {}).textContent || '').replace(/^Abstand (\S+ %).*$/, '$1'));
      /* App-Konzept 2: ein Tipp auf die Karte öffnet die Vorschau (assets/vu-stock-sheet.js); das Aktienbild direkt über seine Adresse. */
      await page.evaluate((t) => { location.hash = '#/' + t; }, symbol);
      await page.waitForURL(/\/elliott\/#\/[A-Z]/);
      await page.waitForSelector('main#qx-main[data-ready="true"]', { timeout: 30000 });
      check(new URL(page.url()).pathname === '/elliott/' && page.url().includes('#/' + symbol), 'Karte oeffnet ' + symbol + ' unter /elliott/#/' + symbol + ' (nativ, kein /quant/)');
      check(await page.locator('.cb-crumbs').count() === 1, 'Elliott-Kopfzeile statt Quant-Rueckweg');
      /* Klickentwurf 17.11.2026: das Aktienbild hat keine Reiterzeile des Rahmens (data-vu-tabs="inhalt", Zeile ausgeblendet). */
      check(await page.evaluate(() => document.documentElement.getAttribute('data-vu-tabs') === 'inhalt' && document.querySelector('vu-navigation').shadowRoot.querySelector('nav.tabs').hidden), 'Detail ohne Reiterzeile des Rahmens');
      check(await page.locator('vu-navigation').evaluate((n) => n.getAttribute('dock')) === 'elliott', 'Shell-Produkt im Detail: elliott');
      await layout(page, 'Detail');
      await page.screenshot({ path: `${OUT}/${vp.name}-${scheme}-detail.png` });
      // App-Konzept 2 (elliott/aktie.js): Kopfkachel, Chart bis an den Rand, Kapitel und Daten & Methodik als Fenster, „Weiter“-Karte.
      check(await page.locator('#el-detail main[data-ak2] .cb.is-ak2 .cb-ew-say h2').count() === 1, 'Aktie: Kopfkachel mit der Lesart (aktie.js hat das Aktienbild umgeordnet)');
      const box = await page.locator('#el-detail .cb-chart svg').first().boundingBox();
      if (vp.width <= 430) check(!!box && box.x <= 1 && box.x + box.width >= vp.width - 1, 'Aktie: Chart reicht am Telefon von Rand zu Rand (' + (box ? Math.round(box.x) + '…' + Math.round(box.x + box.width) : 'fehlt') + ')');
      else check(!!box && box.width >= 600, 'Aktie: Chart nutzt die Breite (' + (box ? Math.round(box.width) : 0) + ' px)');
      check(await page.locator('#el-detail .cb-eps > details.cb-ep').count() === 3 && await page.locator('#el-detail .cb-eps > details.cb-ep[open]').count() === 0, 'Aktie: drei Kapitel-Kacheln, keine klappt auf der Seite auf');
      const sheet = page.locator('#el-detail .cb > .vu-sheet-backdrop.ew-pop:not([hidden])');
      const chapters = [[1, 'Welle ', '.cb-ew-waves li'], [2, 'Hauptlesart = derzeit bevorzugte Interpretation', '.cb-list, .cb-small'], [3, 'Forschung, nicht zertifiziert', '#evidenz']];
      for (const [n, text, inside] of chapters) {
        await page.locator('#el-detail .cb-eps > details.cb-ep:nth-child(' + n + ') > summary').click();
        await sheet.waitFor({ timeout: 5000 }).catch(() => {});
        const body = await sheet.count() ? await sheet.innerText() : '';
        check(body.toLowerCase().includes(text.toLowerCase()) && await sheet.locator(inside).count() > 0, 'Aktie: Kapitel ' + n + ' öffnet als Fenster mit seinem Inhalt');
        if (n === 3) check(/keine Wahrscheinlichkeit|kein verlässlicher|Zufall|Fälle/.test(body), 'Aktie: Forschungs-Fenster nennt den Vergleich mit dem Zufall oder die Datenlage');
        await page.keyboard.press('Escape');
        await sheet.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      }
      check(await page.locator('#el-detail .cb-eps > details.cb-ep > .cb-ep-body').count() === 3 && !(await page.evaluate(() => document.documentElement.classList.contains('vu-sheet-open'))), 'Aktie: nach dem Schließen liegt jeder Kapitelinhalt wieder im Kapitel, die Seite rollt wieder');
      await page.locator('#el-detail .ew-end .ew-dm > details.cb-foot > summary').click();
      await sheet.waitFor({ timeout: 5000 }).catch(() => {});
      check(/keine Vorhersage, keine Empfehlung, keine Order/.test(await sheet.count() ? await sheet.innerText() : '') && await sheet.locator('a[href="/quant/#/methodik/chartbild"]').count() === 1, 'Aktie: Daten & Methodik als Fenster, Hinweis und Methodik-Link (nach /quant/) erhalten');
      await page.keyboard.press('Escape');
      await sheet.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      check(await page.locator('#el-detail .ew-end a.vu-next[href="/technical/#/chart/' + encodeURIComponent(symbol) + '"]').count() === 1 && await page.locator('#el-detail .ew-end .cb-crumbs a.ew-ask').count() === 1 && await page.locator('#el-detail .ew-end .ew-dm a.ew-home[href="/elliott/#/"]').count() === 1 && /Folgeschritte/.test(await page.locator('#el-detail .ew-end').innerText()), 'Aktie: Folgeschritte mit „Weiter“-Karte zur Chart-Lage in Technical und Frag VU, Daten & Methodik mit Rückweg zur Übersicht');
      check(/Ungültig/.test(await page.locator('#el-detail .cb').innerText()), 'Aktie: Ungültig-Marke steht auf der Seite');
      // Balken „Kurs gegen Ungültig-Marke“ nach „Die Lesart in drei Sätzen“: derselbe Abstand wie auf der Karte, genau eine h1, Kontrast ≥ 4,5 : 1
      if (gapOnTile) {
        await page.waitForSelector('#el-detail .cb > .cb-story + section.ew-gap', { timeout: 5000 }).catch(() => {});
        const gap = await page.evaluate(() => {
          const s = document.querySelector('#el-detail .cb > .cb-story + section.ew-gap');
          if (!s) return null;
          const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number), lum = (c) => { const v = rgb(c).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
          const bg = getComputedStyle(s).backgroundColor, ratio = (n) => { const a = lum(getComputedStyle(n).color), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
          const texts = [...s.querySelectorAll('.ew-gap-k, .ew-gap-n, .ew-gap-t, .ew-gap-c span, .ew-gap-c b')];
          const bar = s.querySelector('.ew-gap-bar'), tr = s.querySelector('.ew-gap-tr').getBoundingClientRect(), mk = s.querySelector('.ew-gap-mk').getBoundingClientRect(), dot = s.querySelector('.ew-gap-dot').getBoundingClientRect();
          return { n: (s.querySelector('.ew-gap-n') || {}).textContent || '', text: s.innerText, aria: bar.getAttribute('aria-label') || '', minContrast: Math.min(...texts.map(ratio)), h1: [...document.querySelectorAll('h1')].filter((h) => h.getClientRects().length).length,
            sizes: [Math.round(tr.height), Math.round(mk.width), Math.round(dot.width)], inside: dot.left >= tr.left - 1 && dot.right <= tr.right + 1 && mk.left >= tr.left - 1 && mk.right <= tr.right + 1 };
        });
        check(!!gap && gap.n === gapOnTile && /Abstand zur Ungültig-Marke \(Wochenschluss \d\d\.\d\d\.\)/.test(gap.text) && /Ungültig (unter|über)/.test(gap.text) && /Abstand zur Ungültig-Marke/.test(gap.aria), 'Aktie: Balken „Kurs gegen Ungültig-Marke“ mit Abstand ' + (gap && gap.n) + ' wie auf der Karte (' + gapOnTile + ')');
        check(!!gap && gap.sizes.join() === '8,20,24' && gap.inside, 'Aktie: Balken in den Maßen des Prototyps (Spur 8, Marke 20, Schluss 24) und innerhalb der Spur (' + (gap && gap.sizes.join()) + ')');
        check(!!gap && gap.minContrast >= 4.5 && gap.h1 === 1, 'Aktie: Balken-Texte Kontrast ≥ 4,5 : 1 (' + (gap ? gap.minContrast.toFixed(2) : '–') + '), genau eine h1');
        check(!(await page.locator('#el-detail .ew-gap').textContent()).match(/Signal|Kursziel|Empfehlung|Prognose/i), 'Aktie: Balken beschreibt nur den Abstand (Wortwahl)');
      }
      // Weg 7: Zurueck zur Elliott-Startseite
      await page.goBack({ waitUntil: 'networkidle' });
      await page.waitForSelector('#el-main[data-state="ready"]');
      check(new URL(page.url()).pathname === '/elliott/', 'Zurueck fuehrt zur Elliott-Startseite');
    } else fail('keine zaehlbare Aktie zum Oeffnen (Datenlage?)');

    // Weg 4: Filter Abwaerts -> Karte -> Detail
    await page.goto(BASE + '/elliott/#/?richtung=ab', { waitUntil: 'networkidle' });
    await page.waitForSelector('.el-grid .el-card');
    const downs = await page.locator('.el-grid .el-card .el-dir.is-up').count();
    check(downs === 0, 'Filter Abwaerts zeigt nur Abwaertslesarten');
    await page.screenshot({ path: `${OUT}/${vp.name}-${scheme}-filter.png` });
    /* App-Konzept 2: der Tipp öffnet die Vorschau; das Aktienbild der ersten Karte über seine Adresse (neuer Verlaufseintrag wie ein Link). */
    const firstSym = await page.locator('.el-grid .el-card').first().getAttribute('data-symbol');
    await page.evaluate((t) => { location.hash = '#/' + t; }, firstSym);
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
    await page.goto(BASE + '/elliott/#/?welle=C&status=bestaetigt', { waitUntil: 'networkidle' });
    await page.waitForSelector('#el-main[data-state="ready"]');
    check(/Welle C/.test(await page.locator('h1.el-title').innerText()) && (await page.locator('.el-chip.is-on').allInnerTexts()).some((t) => /Bestätigt/.test(t)), 'Filter-Deep-Link stellt die Auswahl her');
    // Redesign 2027: Plus/Minus nur neongrün/schwarz, kein Rot und kein Grün in Karten und Chips
    const loud = await page.evaluate(() => [...document.querySelectorAll('.el-card *, .el-chip')].filter((n) => { const c = getComputedStyle(n); return [c.color, c.backgroundColor].some((v) => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(v); if (!m) return false; const [r, g, b] = m.slice(1).map(Number); return (r > 150 && g < 110 && b < 110) || (g > 120 && r < 110 && b < 110); }); }).length);
    check(loud === 0, 'keine roten oder grünen Flächen (' + loud + ')');

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
    // Konzept EHV (PR 2): die Aktie ohne Zählung zeigt die Karte .cb-ew-none unter dem Kopf .cb-head (früher .cb-nothesis unter .cb-hero)
    const nothesis = await page.locator('.cb-nothesis, .cb-ew-none').count(), hero = await page.locator('.cb-hero, .cb-head').count();
    // Elliott-Neustart (Owner 22.11.2026): jede Hauptlesart steht mit Klarheit A–D (.cb-ew-say) und Wellenmarken im Chart
    check(hero === 1 && (nothesis === 1 || await page.locator('.cb-pj-hl, .cb-ewp, .cb-ew-say').count() > 0), 'NVDA: Lesart oder ehrliche "Keine belastbare Elliott-Lesart"');

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
