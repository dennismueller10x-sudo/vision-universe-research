// Browser-QA der gemeinsamen Vision-Universe-Shell (assets/site-navigation.js):
// Kopf, Produkt-Leiste und globales Menue auf allen Produkten.
//
// Prueft je Produkt und Breite: Deep Link -> richtiger aktiver Eintrag (auch
// nach Reload), erster Eintrag = Produktname, ☰ oeffnet das globale Menue
// (Scroll-Sperre, Leiste aus der Fokusreihenfolge, Escape schliesst, Fokus
// zurueck), kein Menue-Knopf doppelt im Kopf, kein horizontaler Ueberlauf,
// das Seitenende liegt ueber der Leiste, Browser-Zurueck/Vor haelt den Zustand.
//
// Aufruf:  node scripts/quality/shell-browser-qa.mjs --url=http://127.0.0.1:8765 [--out=/tmp/shell-qa] [--viewports=390x844,1440x900] [--playwright=<pfad>]
// Schreibt nur nach --out (Screenshots, results.json), nie in das Repository.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const base = arg('url', 'http://127.0.0.1:8765').replace(/\/$/, '');
const out = arg('out', '/tmp/shell-qa');
const require = createRequire(import.meta.url);
const { chromium } = require(arg('playwright', process.env.PLAYWRIGHT_PATH || 'playwright'));
await mkdir(out, { recursive: true });

// [Produkt, Deep Link, erwarteter aktiver Eintrag (null = nur Produktkontext)]
const ROUTES = [
  ['Discover', '/discover/#/', 'Discover'], ['Discover', '/discover/#/welten', 'Welten'], ['Discover', '/discover/#/strategien', 'Strategien'],
  ['Discover', '/discover/#/einzeln/US_REAL', 'Entdecken'], ['Discover', '/discover/#/maerkte', null], ['Discover', '/discover/#/watchlist', null],
  ['Quant', '/quant/#/', 'Quant'], ['Quant', '/quant/#/screener', 'Screener'], ['Quant', '/quant/#/strategien', 'Strategien'],
  ['Quant', '/quant/#/aktien', 'Aktien'], ['Quant', '/quant/#/aktie/NVDA', 'Aktien'], ['Quant', '/quant/#/methodik', null],
  ['Vorsorge', '/vorsorge/#/', 'Vorsorge'], ['Vorsorge', '/vorsorge/#/plan', 'Plan'], ['Vorsorge', '/vorsorge/#/etfs', 'ETFs'],
  ['Vorsorge', '/vorsorge/#/portfolio', 'Portfolio'], ['Vorsorge', '/vorsorge/#/foerderung', null], ['Vorsorge', '/vorsorge/#/monitor', null],
  ['Screener', '/screener/', 'Screener'], ['Screener', '/screener/?view=saved', 'Gespeichert'], ['Screener', '/screener/?view=watchlist', 'Watchlist'],
  ['Supertrader', '/supertrader/', 'Supertrader'], ['Supertrader', '/supertrader/strategies/', 'Methoden'], ['Supertrader', '/supertrader/signals/', 'Signale'],
  ['Supertrader', '/supertrader/backtests/', 'Backtests'], ['Supertrader', '/supertrader/sources/', null],
  ['Hedgefonds', '/hedgefonds/#/', 'Hedgefonds'], ['Hedgefonds', '/hedgefonds/#/investoren', 'Investoren'], ['Hedgefonds', '/hedgefonds/#/datenbank', 'Datenbank'],
  ['Hedgefonds', '/hedgefonds/#/aktien', 'Aktien']
];
const VIEWPORTS = (arg('viewports', '390x844,430x932,768x1024,1024x768,1440x900')).split(',').map((v) => { const [w, h] = v.split('x').map(Number); return [String(w), w, h]; });
const findings = [], checks = [];
const fail = (where, msg) => { findings.push({ where, msg }); console.log('FAIL ' + where + ': ' + msg); };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function state(page) {
  return page.evaluate(() => {
    const nav = document.getElementById('vu-dock')?.shadowRoot?.querySelector('nav');
    const head = document.querySelector('vu-navigation')?.shadowRoot;
    if (!nav || !head) return null;
    const r = nav.getBoundingClientRect();
    const links = [...nav.querySelectorAll('a')];
    return {
      labels: links.map((a) => a.textContent.trim()),
      current: links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent.trim()),
      menu: !!nav.querySelector('button.menu'),
      dock: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width },
      toggle: getComputedStyle(head.querySelector('.toggle')).display,
      overflow: document.documentElement.scrollWidth - innerWidth,
      small: [...nav.querySelectorAll('a,button')].filter((n) => { const b = n.getBoundingClientRect(); return b.width < 44 || b.height < 44; }).length,
      clipped: links.filter((a) => { const l = a.querySelector('.label'); return l && l.scrollWidth > l.clientWidth + 1; }).map((a) => a.textContent.trim()),
      vw: innerWidth, vh: innerHeight
    };
  });
}
async function settle(page) { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(500); }

for (const [vpName, width, height] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  for (const [product, path, expected] of ROUTES) {
    const where = `${product} ${path} @${vpName}`;
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      for (const pass of ['first', 'reload']) {
        if (pass === 'reload') { await page.reload({ waitUntil: 'load' }); await settle(page); }
        const s = await state(page);
        if (!s) { fail(where, 'keine Produkt-Leiste'); break; }
        if (s.labels[0] !== product) fail(where, 'erster Eintrag ist nicht der Produktname: ' + s.labels[0]);
        if (s.labels.length !== 4 || !s.menu) fail(where, 'Leiste ist nicht [Produkt] + 3 Funktionen + ☰: ' + s.labels.join('|'));
        if ((s.current[0] || null) !== expected || s.current.length > 1) fail(where, `${pass}: aktiv ${s.current.join('|') || '-'} statt ${expected || '-'}`);
        if (s.toggle !== 'none') fail(where, 'Menue-Knopf im Kopf doppelt');
        if (s.overflow > 1) fail(where, 'horizontaler Ueberlauf ' + s.overflow + ' px');
        if (s.dock.left < 0 || s.dock.right > s.vw || s.dock.bottom > s.vh || s.dock.bottom < s.vh - 40) fail(where, 'Leiste ausserhalb ihres Platzes ' + JSON.stringify(s.dock));
        if (s.small) fail(where, s.small + ' Ziele kleiner als 44 px');
        if (s.clipped.length) fail(where, 'abgeschnittene Beschriftung: ' + s.clipped.join(', '));
      }
      // Seitenende: das letzte sichtbare Element liegt ueber der Leiste.
      const end = await page.evaluate(async () => {
        // Bis zum Ende scrollen, bis nachgeladene Abschnitte die Hoehe nicht mehr aendern.
        for (let i = 0, h = -1; i < 8 && h !== document.documentElement.scrollHeight; i++) { h = document.documentElement.scrollHeight; scrollTo(0, h); await new Promise((r) => setTimeout(r, 700)); }
        const dockTop = document.getElementById('vu-dock').shadowRoot.querySelector('nav').getBoundingClientRect().top;
        // Aeussere Bloecke des Dokuments (Inhalt in eigenen Scroll-Containern zaehlt nicht).
        const blocks = [...document.body.children].filter((n) => n.id !== 'vu-dock' && n.getClientRects().length && !['fixed', 'sticky'].includes(getComputedStyle(n).position) && !['SCRIPT', 'STYLE', 'DIALOG', 'VU-NAVIGATION'].includes(n.tagName));
        const last = blocks.reduce((m, n) => Math.max(m, n.getBoundingClientRect().bottom - parseFloat(getComputedStyle(n).paddingBottom || 0)), 0);
        return { dockTop, last };
      });
      if (end.last > end.dockTop + 1) fail(where, `Seitenende verdeckt (Inhalt bis ${Math.round(end.last)}, Leiste ab ${Math.round(end.dockTop)})`);
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  // Globales Menue ueber ☰: dasselbe Menue auf jedem Produkt.
  let firstMenu = null;
  for (const path of ['/discover/#/', '/quant/#/', '/vorsorge/#/', '/screener/', '/supertrader/', '/hedgefonds/#/']) {
    const where = `menu ${path} @${vpName}`;
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const menu = page.locator('#vu-dock button.menu');
      await menu.click();
      await page.waitForFunction(() => { const p = document.querySelector('vu-navigation').shadowRoot.querySelector('.panel').getBoundingClientRect(); return p.left >= -1 && p.right <= innerWidth + 1; }, null, { timeout: 3000 });
      const m = await page.evaluate(() => {
        const root = document.querySelector('vu-navigation').shadowRoot, panel = root.querySelector('.panel');
        const dock = document.getElementById('vu-dock'), d = dock.shadowRoot.querySelector('nav').getBoundingClientRect();
        const top = document.elementFromPoint(innerWidth - 20, d.top + d.height / 2);
        return { groups: [...root.querySelectorAll('.group h2')].map((h) => h.textContent), links: root.querySelectorAll('.links a').length,
          locked: document.documentElement.classList.contains('vu-menu-open') && getComputedStyle(document.documentElement).overflow === 'hidden',
          dockInert: dock.inert, dockCovered: top !== dock, scrollable: panel.scrollHeight <= panel.clientHeight || getComputedStyle(panel).overflowY === 'auto',
          panelBottom: panel.getBoundingClientRect().bottom, vh: innerHeight };
      });
      if (!firstMenu) firstMenu = m.groups.join('|') + '#' + m.links;
      else if (m.groups.join('|') + '#' + m.links !== firstMenu) fail(where, 'anderes Menue als auf Discover');
      if (!m.locked) fail(where, 'keine Scroll-Sperre');
      if (!m.dockInert || !m.dockCovered) fail(where, 'Leiste liegt ueber dem Menue oder bleibt fokussierbar');
      if (!m.scrollable || m.panelBottom > m.vh + 1) fail(where, 'Menue nicht scrollbar oder abgeschnitten');
      if (path === '/quant/#/') await page.screenshot({ path: `${out}/menu-${vpName}.png` });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('vu-navigation').hasAttribute('open'), null, { timeout: 3000 });
      if (!await menu.evaluate((n) => n.getRootNode().activeElement === n)) fail(where, 'Fokus kehrt nicht zu ☰ zurueck');
      if (await page.evaluate(() => document.documentElement.classList.contains('vu-menu-open'))) fail(where, 'Scroll-Sperre bleibt');
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  // Zurueck/Vor ueber die Leiste (Hash-Produkte und Seiten-Produkte).
  for (const [start, clicks] of [['/quant/#/', ['Screener', 'Aktien']], ['/vorsorge/#/', ['ETFs', 'Portfolio']], ['/supertrader/', ['Signale', 'Backtests']], ['/discover/#/', ['Welten', 'Strategien']]]) {
    const where = `history ${start} @${vpName}`;
    try {
      await page.goto(base + start, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const first = (await state(page)).current[0];
      for (const label of clicks) { await page.locator('#vu-dock nav a', { hasText: label }).first().click(); await settle(page); if ((await state(page)).current[0] !== label) fail(where, 'Klick ' + label + ' markiert nicht'); }
      await page.goBack(); await settle(page);
      if ((await state(page)).current[0] !== clicks[0]) fail(where, 'Zurueck: ' + (await state(page)).current[0]);
      await page.goBack(); await settle(page);
      if ((await state(page)).current[0] !== first) fail(where, 'Zurueck zum Start: ' + (await state(page)).current[0]);
      await page.goForward(); await settle(page);
      if ((await state(page)).current[0] !== clicks[0]) fail(where, 'Vor: ' + (await state(page)).current[0]);
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  await ctx.close();
}
await browser.close();
await writeFile(`${out}/results.json`, JSON.stringify({ checks, findings }, null, 2));
console.log(`Shell-QA: ${checks.length} Pruefungen, ${findings.length} Befunde`);
process.exit(findings.length ? 1 : 0);
