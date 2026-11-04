// Browser-QA der gemeinsamen Vision-Universe-Shell (assets/site-navigation.js):
// Kopf, Produkt-Leiste und globales Menue auf allen Produkten.
//
// Prueft je Produkt und Breite: Deep Link -> richtiger aktiver Eintrag (auch
// nach Reload), erster Eintrag = Produktname, ☰ oeffnet das globale Menue
// (Scroll-Sperre, Leiste aus der Fokusreihenfolge, Escape schliesst, Fokus
// zurueck), kein Menue-Knopf doppelt im Kopf, kein horizontaler Ueberlauf,
// das Seitenende liegt ueber der Leiste, Browser-Zurueck/Vor haelt den Zustand.
//
// Aufruf:  node scripts/quality/shell-browser-qa.mjs --url=http://127.0.0.1:8765 [--out=/tmp/shell-qa] [--viewports=390x844,1440x900] [--engine=chromium|webkit] [--playwright=<pfad>]
// --engine=webkit nutzt Playwrights WebKit mit dem Geraeteprofil iPhone 14 fuer schmale Breiten. Das ist die
// WebKit-ENGINE, nicht Safari auf einem iPhone: env(safe-area-inset-*) ist dort 0, die Safari-Leiste fehlt.
// Schreibt nur nach --out (Screenshots, results.json), nie in das Repository.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const base = arg('url', 'http://127.0.0.1:8765').replace(/\/$/, '');
const out = arg('out', '/tmp/shell-qa');
const require = createRequire(import.meta.url);
const pw = require(arg('playwright', process.env.PLAYWRIGHT_PATH || 'playwright'));
const engine = arg('engine', 'chromium');
if (!['chromium', 'webkit'].includes(engine)) throw new Error('engine: chromium oder webkit');
await mkdir(out, { recursive: true });

// [Produkt, Deep Link, erwarteter aktiver Eintrag (null = nur Produktkontext)]
const ROUTES = [
  ['Discover', '/discover/#/', 'Discover'], ['Discover', '/discover/#/welten', 'Welten'], ['Discover', '/discover/#/strategien', 'Strategien'],
  ['Discover', '/discover/#/einzeln/US_REAL', 'Swipen'], ['Discover', '/discover/#/maerkte', null], ['Discover', '/discover/#/watchlist', null],
  ['Quant', '/quant/#/', 'Quant'], ['Quant', '/quant/#/screener', 'Screener'], ['Quant', '/quant/#/strategien', 'Strategien'],
  ['Quant', '/quant/#/aktien', 'Aktien'], ['Quant', '/quant/#/aktie/NVDA', 'Aktien'], ['Quant', '/quant/#/methodik', null],
  // Elliott: eigenes Produkt; das Aktienbild liegt unter /elliott/#/<T> (alt: /quant/#/elliott/<T>, leitet um), gehoert aber zu Elliott (nur Produktkontext)
  ['Elliott', '/elliott/', 'Elliott'], ['Elliott', '/elliott/#/?welle=3', 'Welle 3'], ['Elliott', '/elliott/#/?neu=1', 'Neu'], ['Elliott', '/elliott/#/?suche=1', 'Suche'],
  ['Elliott', '/elliott/#/?richtung=ab', null], ['Elliott', '/elliott/#/NVDA', null], ['Elliott', '/quant/#/elliott/NVDA', null],
  // Fundamental: eigenes Produkt; die Unternehmensseite /fundamental/#/<T> zeigt nur den Produktkontext
  ['Fundamental', '/fundamental/#/', 'Fundamental'], ['Fundamental', '/fundamental/#/entdecken', 'Entdecken'], ['Fundamental', '/fundamental/#/suche', 'Suche'],
  ['Fundamental', '/fundamental/#/methodik', 'Methodik'], ['Fundamental', '/fundamental/#/NVDA', null],
  ['Vorsorge', '/vorsorge/#/', 'Vorsorge'], ['Vorsorge', '/vorsorge/#/plan', 'Planer'], ['Vorsorge', '/vorsorge/#/etfs', 'ETFs'],
  ['Vorsorge', '/vorsorge/#/portfolio', 'Portfolio'], ['Vorsorge', '/vorsorge/#/foerderung', null], ['Vorsorge', '/vorsorge/#/monitor', null],
  ['Screener', '/screener/', 'Screener'], ['Screener','/screener/?f=roic:gt:0.1','Screener'], ['Screener','/screener/?mode=pro','Screener'], ['Screener', '/screener/?view=build', 'Filter'], ['Screener', '/screener/?view=saved', 'Gespeichert'], ['Screener', '/screener/?view=watchlist', 'Gespeichert'],
  ['Supertrader', '/supertrader/', 'Supertrader'], ['Supertrader', '/supertrader/strategies/', 'Methoden'], ['Supertrader', '/supertrader/signals/', 'Signale'],
  ['Supertrader', '/supertrader/backtests/', 'Backtests'], ['Supertrader', '/supertrader/sources/', null],
  ['Hedgefonds', '/hedgefonds/#/', 'Hedgefonds'], ['Hedgefonds', '/hedgefonds/#/investoren', 'Investoren'], ['Hedgefonds', '/hedgefonds/#/datenbank', 'Investoren'], ['Hedgefonds', '/hedgefonds/#/smart-money', 'Smart Money'],
  ['Hedgefonds', '/hedgefonds/#/aktien', 'Aktien'],
  // Alte Quant-Unterseiten: Weiterleitungen auf die App unter /quant/ (quant/ui/legacy-redirect.js). Erwartet ist die Leiste
  // am Ziel: Ranking -> #/screener (Screener), Watchlist -> #/aktien (Aktien).
  ['Quant', '/quant/screener/', 'Screener'], ['Quant', '/quant/strategies/', 'Strategien'], ['Quant', '/quant/ranking/', 'Screener'],
  ['Quant', '/quant/technical/', 'Aktien'], ['Quant', '/quant/watchlist/', 'Aktien'], ['Quant', '/quant/methodology/', null]
];
const VIEWPORTS = (arg('viewports', '390x844,430x932,768x1024,1024x768,1440x900')).split(',').map((v) => { const [w, h] = v.split('x').map(Number); return [String(w), w, h]; });
const findings = [], checks = [];
const fail = (where, msg) => { findings.push({ where, msg }); console.log('FAIL ' + where + ': ' + msg); };

const browser = await pw[engine].launch(engine === 'chromium' ? { ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--disable-dev-shm-usage'] } : {});
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
      menuIconsDeferred: [...head.querySelectorAll('.menu-product-icon use')].every(n=>!n.hasAttribute('href')&&n.hasAttribute('data-href')),
      dockOriginalInline: !!nav.querySelector('.product svg g')&&!nav.querySelector('.product svg use'),
      spriteRequested: performance.getEntriesByType('resource').some(r=>new URL(r.name).pathname==='/assets/product-icons.svg'),
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
/* Das Menue gilt erst als offen, wenn es sichtbar ist, seine Einfahrt (transform .2s) und alle Animationen im Menue beendet
   sind und die Schriften stehen. Vorher gemessene Zielgroessen sind ein Zwischenbild, kein Befund. Oeffnet es nicht bis
   dahin, ist das selbst ein Befund. Danach wird einmal gemessen; was dann kleiner als 44 px ist, bleibt ein Befund. */
async function menuOpen(page, where) {
  const ok = await page.waitForFunction(async () => {
    const nav = document.querySelector('vu-navigation'), root = nav && nav.shadowRoot, panel = root && root.querySelector('.panel');
    if (!panel || !nav.hasAttribute('open')) return false;
    const cs = getComputedStyle(panel);
    if (cs.visibility !== 'visible' || !(cs.transform === 'none' || cs.transform === 'matrix(1, 0, 0, 1, 0, 0)')) return false;
    if ((root.getAnimations ? root.getAnimations() : []).some((a) => a.playState === 'running' || a.playState === 'pending')) return false;
    await document.fonts.ready;
    return true;
  }, null, { timeout: 5000, polling: 'raf' }).then(() => true, () => false);
  if (!ok) fail(where, 'Menü ist nach 5 s nicht vollständig geöffnet');
}
/* Zu kleine sichtbare Ziele im Menue, mit Benennung, damit ein Befund sagt, welches Ziel wie gross war. */
const SMALL_TARGETS = (root) => [...root.querySelectorAll('a,button')].filter((n) => n.getClientRects().length).map((n) => { const r = n.getBoundingClientRect(); return { n, w: Math.round(r.width), h: Math.round(r.height) }; })
  .filter((x) => x.w < 44 || x.h < 44).map((x) => (x.n.getAttribute('class') || x.n.tagName.toLowerCase()) + ' „' + (x.n.textContent || x.n.getAttribute('aria-label') || '').trim().slice(0, 24) + '“ ' + x.w + '×' + x.h);
const smallTargets = (page) => page.evaluate(`(${SMALL_TARGETS.toString()})(document.querySelector('vu-navigation').shadowRoot.querySelector('.panel'))`);
const smallText = (list) => list.length + (list.length ? ' (' + list.slice(0, 4).join('; ') + (list.length > 4 ? '; …' : '') + ')' : '');

for (const [vpName, width, height] of VIEWPORTS) {
  const phone = engine === 'webkit' && width <= 430;
  const ctx = await browser.newContext(phone ? { ...pw.devices['iPhone 14'], viewport: { width, height } } : { viewport: { width, height } });
  /* Jede Pruefung bekommt eine frische Seite: ein Absturz des Renderers (CI-Runner,
     /dev/shm) darf nicht alle folgenden Navigationen derselben Seite mitreissen. */
  let page = null;
  const fresh = async () => { if (page) await page.close().catch(() => {}); page = await ctx.newPage(); };
  for (const [product, path, expected] of ROUTES) {
    const where = `${product} ${path} @${vpName}`;
    await fresh();
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      for (const pass of ['first', 'reload']) {
        if (pass === 'reload') { await page.reload({ waitUntil: 'load' }); await settle(page); }
        const s = await state(page);
        if (!s) { fail(where, 'keine Produkt-Leiste'); break; }
        if (s.labels[0] !== product) fail(where, 'erster Eintrag ist nicht der Produktname: ' + s.labels[0]);
        if (s.labels.length !== 4 || !s.menu) fail(where, 'Leiste ist nicht [Produkt] + 3 Funktionen + ☰: ' + s.labels.join('|'));
        if ((s.current[0] || null) !== expected || s.current.length > 1) fail(where, `${pass}: aktiv ${s.current.join('|') || '-'} statt ${expected || '-'}`);
        if(!s.menuIconsDeferred||!s.dockOriginalInline) fail(where,'Icon-Laden ist nicht menu-lazy bzw Dock inline');
        if(path==='/quant/#/screener'&&s.spriteRequested) fail(where,'Quant Screener lädt ungeöffneten Menü-Sprite');
        if (s.toggle !== 'none') fail(where, 'Menue-Knopf im Kopf doppelt');
        if (s.overflow > 1) fail(where, 'horizontaler Ueberlauf ' + s.overflow + ' px');
        if (s.dock.left < 0 || s.dock.right > s.vw || s.dock.bottom > s.vh || s.dock.bottom < s.vh - 40) fail(where, 'Leiste ausserhalb ihres Platzes ' + JSON.stringify(s.dock));
        if (s.small) fail(where, s.small + ' Ziele kleiner als 44 px');
        if (s.clipped.length) fail(where, 'abgeschnittene Beschriftung: ' + s.clipped.join(', '));
      }
      // Direkt geladene Unterseiten öffnen genau ihren Produktbereich; Home bleibt kompakt.
      await page.locator('#vu-dock button.menu').click();
      await menuOpen(page, where);
      const routeSmall = await smallTargets(page);
      const routeMenu = await page.evaluate(() => {
        const root=document.querySelector('vu-navigation').shadowRoot;
        const tile=root.querySelector('.tile.is-current');
        return {current:tile?.querySelector('b')?.textContent.trim(),here:!root.querySelector('.here').hidden&&root.querySelector('.here-title').textContent,
          marked:[...root.querySelectorAll('.links a[aria-current=page]')].map(a=>({href:a.getAttribute('href'),visible:!!a.getClientRects().length}))};
      });
      const home=['/discover/#/','/elliott/','/fundamental/#/','/quant/#/','/vorsorge/#/','/screener/','/supertrader/','/hedgefonds/#/'].includes(path);
      // Das Menue markiert die aktuelle Welt im Raster und zeigt ihre Unterseiten (Mockup N3).
      if(routeMenu.current!==product||routeMenu.here!=='In '+product) fail(where,'Menu-Produktkontext falsch: '+JSON.stringify(routeMenu));
      if(routeMenu.marked.length>1||(!home&&routeMenu.marked.some(a=>!a.visible))) fail(where,'aktive Unterroute nicht eindeutig sichtbar: '+JSON.stringify(routeMenu));
      if(routeSmall.length) fail(where,smallText(routeSmall)+' sichtbare Menüziele kleiner als 44 px');
      await page.keyboard.press('Escape');
      // Die Desktop-Filter haben einen eigenen Scrollbereich. Sein letztes
      // Bedienelement muss auch bei feststehender Leiste erreichbar bleiben.
      const sidebarEnd = await page.evaluate(() => {
        const side = document.querySelector('.sc-layout > .sc-side');
        if (!side) return null;
        scrollTo({top: scrollY + side.getBoundingClientRect().top, behavior: 'instant'});
        side.scrollTop = side.scrollHeight;
        const controls = [...side.querySelectorAll('a,button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(n=>n.getClientRects().length);
        const last = controls.at(-1);
        if (!last) return {missing: true};
        const r = last.getBoundingClientRect(), hit = document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
        return {bottom:r.bottom, dockTop:document.getElementById('vu-dock').shadowRoot.querySelector('nav').getBoundingClientRect().top,
          reachable:!!hit&&(hit===last||last.contains(hit)), label:last.textContent.trim(), remaining:side.scrollHeight-side.clientHeight-side.scrollTop};
      });
      if(sidebarEnd&&(sidebarEnd.missing||!sidebarEnd.reachable||sidebarEnd.bottom>sidebarEnd.dockTop+1||sidebarEnd.remaining>1)) fail(where,'Filter-Scrollende verdeckt: '+JSON.stringify(sidebarEnd));
      // Seitenende: das letzte sichtbare Element liegt ueber der Leiste.
      const end = await page.evaluate(async () => {
        // Bis zum Ende scrollen, bis nachgeladene Abschnitte die Hoehe nicht mehr aendern.
        for (let i = 0, h = -1; i < 8 && h !== document.documentElement.scrollHeight; i++) { h = document.documentElement.scrollHeight; scrollTo(0, h); await new Promise((r) => setTimeout(r, 700)); }
        // Trefferlisten laden am unteren Rand weitere Seiten nach. Nach dem
        // begrenzten Warmup das AKTUELLE Ende instant erreichen und im selben
        // Task messen, bevor IntersectionObserver die Liste erneut erweitert.
        // Keine Hochrechnung oder gekappte Geometrie: die Dock-Grenze bleibt gleich.
        const scrolling = document.scrollingElement;
        scrollTo({top:scrolling.scrollHeight,behavior:'instant'});
        const remaining = scrolling.scrollHeight-scrolling.clientHeight-scrolling.scrollTop;
        // Vollbild-Ansichten wie der Discover-Feed scrollen absichtlich in
        // einem eigenen Bereich. Body-Lock ist nur bei nötigem Dokument-
        // Scrollen ein Fehler; ein gesperrtes HTML (globales Menü) bleibt es immer.
        const isBlocked = n=>['hidden','clip'].includes(getComputedStyle(n).overflowY);
        const locked = isBlocked(document.documentElement)||(scrolling.scrollHeight>scrolling.clientHeight+1&&isBlocked(document.body));
        const dockTop = document.getElementById('vu-dock').shadowRoot.querySelector('nav').getBoundingClientRect().top;
        // Aeussere Bloecke des Dokuments (Inhalt in eigenen Scroll-Containern zaehlt nicht).
        const blocks = [...document.body.children].filter((n) => n.id !== 'vu-dock' && n.getClientRects().length && !['fixed', 'sticky'].includes(getComputedStyle(n).position) && !['SCRIPT', 'STYLE', 'DIALOG', 'VU-NAVIGATION'].includes(n.tagName));
        const last = blocks.reduce((m, n) => Math.max(m, n.getBoundingClientRect().bottom - parseFloat(getComputedStyle(n).paddingBottom || 0)), 0);
        return { dockTop, last, remaining, locked };
      });
      if(end.locked||end.remaining>1) fail(where,'Dokumentende nicht scrollbar/erreicht: '+JSON.stringify(end));
      if (end.last > end.dockTop + 1) fail(where, `Seitenende verdeckt (Inhalt bis ${Math.round(end.last)}, Leiste ab ${Math.round(end.dockTop)})`);
      checks.push({ where, end, sidebarEnd, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  // Farbschema: der Schalter im gemeinsamen Kopf wechselt Hell/Dunkel auf jedem Produkt; Leiste und Menue bleiben lesbar.
  for (const path of ['/discover/#/', '/quant/#/', '/vorsorge/#/', '/screener/', '/supertrader/', '/hedgefonds/#/']) {
    const where = `theme ${path} @${vpName}`;
    await fresh();
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      // Das Farbschema wechselt im Menue (Hell/Dunkel).
      const pick = async (mode) => { await page.locator('#vu-dock button.menu').click(); await menuOpen(page, where); await page.evaluate((m) => [...document.querySelector('vu-navigation').shadowRoot.querySelectorAll('.appearance button')].find(b => b.textContent === m).click(), mode); await page.keyboard.press('Escape'); await page.waitForTimeout(300); };
      await pick(before === 'dark' ? 'Hell' : 'Dunkel');
      const after = await page.evaluate(() => ({ t: document.documentElement.getAttribute('data-theme'), bar: document.querySelector('meta[name=theme-color]')?.content,
        dock: getComputedStyle(document.getElementById('vu-dock').shadowRoot.querySelector('nav')).backgroundColor, stored: localStorage.getItem('vu-discover-theme-v1'),
        head: document.querySelector('vu-navigation').getAttribute('theme') }));
      if (after.t === before || after.stored !== after.t || after.head !== after.t) fail(where, 'Theme-Wechsel greift nicht: ' + JSON.stringify({ before, after }));
      if (after.dock !== 'rgb(0, 0, 0)') fail(where, 'Leiste verliert ihre Flaeche: ' + after.dock);
      await pick(before === 'dark' ? 'Dunkel' : 'Hell');
      if (await page.evaluate(() => document.documentElement.getAttribute('data-theme')) !== before) fail(where, 'Theme springt nicht zurueck');
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  // Globales Menue ueber ☰: dasselbe Menue auf jedem Produkt.
  let firstMenu = null;
  for (const path of ['/discover/#/', '/quant/#/', '/vorsorge/#/', '/screener/', '/supertrader/', '/hedgefonds/#/']) {
    const where = `menu ${path} @${vpName}`;
    await fresh();
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const menu = page.locator('#vu-dock button.menu');
      await menu.click();
      await page.waitForFunction(() => { const panel = document.querySelector('vu-navigation').shadowRoot.querySelector('.panel'), p=panel.getBoundingClientRect(); return getComputedStyle(panel).visibility==='visible' && p.left >= -1 && p.right <= innerWidth + 1; }, null, { timeout: 3000 });
      await page.waitForFunction(()=>{const root=document.querySelector('vu-navigation').shadowRoot;return root.activeElement===root.querySelector('.close')},null,{timeout:1000}).catch(()=>fail(where,'Öffnen fokussiert den Schließen-Button nicht'));
      const m = await page.evaluate(() => {
        const root = document.querySelector('vu-navigation').shadowRoot, panel = root.querySelector('.panel');
        const dock = document.getElementById('vu-dock'), d = dock.shadowRoot.querySelector('nav').getBoundingClientRect();
        const top = document.elementFromPoint(innerWidth - 20, d.top + d.height / 2);
        return { groups: [...root.querySelectorAll('.tile b')].map((h) => h.textContent), links: root.querySelectorAll('.more-links a').length + root.querySelectorAll('.mine a').length,
          locked: document.documentElement.classList.contains('vu-menu-open') && getComputedStyle(document.documentElement).overflow === 'hidden',
          dockInert: dock.inert, dockCovered: top !== dock, scrollable: panel.scrollHeight <= panel.clientHeight || getComputedStyle(panel).overflowY === 'auto',
          panelBottom: panel.getBoundingClientRect().bottom, vh: innerHeight, panelBg: getComputedStyle(panel).backgroundColor,
          moreOpen: root.querySelector('.more').open, hereLinks: root.querySelectorAll('.here-links a').length,
          icons: [...root.querySelectorAll('.menu-product-icon use')].map(n=>n.getAttribute('href')),
          search: !!root.querySelector('.find input[type=search]') };
      });
      if (!firstMenu) firstMenu = m.groups.join('|') + '#' + m.links;
      else if (m.groups.join('|') + '#' + m.links !== firstMenu) fail(where, 'anderes Menue als auf Discover');
      if(m.groups.join('|')!=='Discover|Quant|Technical|Fundamental|Supertrader|Hedgefonds|Elliott|Screener|Vorsorge') fail(where,'Produktraster falsch: '+m.groups.join('|'));
      if(m.moreOpen||!m.hereLinks||!m.search) fail(where,'Menüaufbau falsch: '+JSON.stringify({moreOpen:m.moreOpen,here:m.hereLinks,search:m.search}));
      if(m.panelBg!=='rgb(0, 0, 0)') fail(where,'Menü ist nicht schwarz: '+m.panelBg);
      if(m.icons.length!==9||m.icons.some(href=>!href.startsWith('/assets/product-icons.svg#'))) fail(where,'Original Produkticons fehlen');
      await menuOpen(page, where);
      const menuSmall = await smallTargets(page);
      if(menuSmall.length) fail(where,smallText(menuSmall)+' Menüziele kleiner als 44 px');
      if (!m.locked) fail(where, 'keine Scroll-Sperre');
      if (!m.dockInert || !m.dockCovered) fail(where, 'Leiste liegt ueber dem Menue oder bleibt fokussierbar');
      if (!m.scrollable || m.panelBottom > m.vh + 1) fail(where, 'Menue nicht scrollbar oder abgeschnitten');
      if (path === '/quant/#/') await page.screenshot({ path: `${out}/menu-${vpName}.png` });
      // Weitere Produkte klappt per Tastatur auf.
      const moreToggle=page.locator('vu-navigation .more summary');
      await moreToggle.focus();await page.keyboard.press('Enter');
      if(!await page.evaluate(()=>document.querySelector('vu-navigation').shadowRoot.querySelector('.more').open)) fail(where,'Enter öffnet Weitere Produkte nicht');
      const moreSmall = await smallTargets(page);
      if(moreSmall.length) fail(where,smallText(moreSmall)+' aufgeklappte Menüziele kleiner als 44 px');
      // Fokusfalle darf eingeklappte Unterlinks nicht berücksichtigen.
      await page.evaluate(()=>{
        const root=document.querySelector('vu-navigation').shadowRoot;
        const nodes=[...root.querySelectorAll('.panel a,.panel button:not(:disabled),.panel input,.panel summary')].filter(n=>n.getClientRects().length&&!n.closest('[hidden]'));
        nodes[0].focus();
      });
      await page.keyboard.press('Shift+Tab');
      const trappedLast=await page.evaluate(()=>{
        const root=document.querySelector('vu-navigation').shadowRoot;
        const nodes=[...root.querySelectorAll('.panel a,.panel button:not(:disabled),.panel input,.panel summary')].filter(n=>n.getClientRects().length&&!n.closest('[hidden]'));
        return root.activeElement===nodes.at(-1);
      });
      if(!trappedLast) fail(where,'Shift+Tab verlässt die Fokusfalle');
      await page.keyboard.press('Tab');
      if(!await page.evaluate(()=>{const root=document.querySelector('vu-navigation').shadowRoot;return root.activeElement===root.querySelector('.panel-head a')})) fail(where,'Tab kehrt nicht zum ersten Menülink zurück');
      if(path==='/quant/#/') await page.screenshot({path:`${out}/menu-expanded-${vpName}.png`});
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
    await fresh();
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
