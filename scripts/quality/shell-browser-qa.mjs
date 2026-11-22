// Browser-QA der gemeinsamen Vision-Universe-Shell (assets/site-navigation.js), Rahmen nach App-Konzept 2:
// Kopf, Reiterzeile des Produkts, das eine Dock (Home · Discover · [Universe] · News · Ich) und das Menue
// „Dein Universe“ auf allen Produkten.
//
// Prueft je Produkt und Breite: Deep Link -> richtiger aktiver Reiter (auch
// nach Reload), erster Reiter = Produktname, das Dock ist ueberall dasselbe, der Universe-Knopf oeffnet das
// globale Menue (bis 760 px als Sheet von unten, darueber als Seitenleiste; Scroll-Sperre, Dock aus der
// Fokusreihenfolge, Escape schliesst, Fokus zurueck), kein Menue-Knopf doppelt im Kopf, kein horizontaler
// Ueberlauf, der Inhalt beginnt unter Kopf und Reitern, das Seitenende liegt ueber dem Dock,
// Browser-Zurueck/Vor haelt den Zustand.
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

// [Produkt, Deep Link, erwarteter aktiver Reiter (null = nur Produktkontext)]. Reiter aus der Menueliste „In <Welt>“
// (Märkte, Methodik, Datenbank, Quellen …) sind auf ihrer Seite selbst aktiv; in der Leiste mit vier Plaetzen trug dort ein
// Nachbarplatz oder keiner die Marke. Sonst gilt die Logik der frueheren Leiste.
const ROUTES = [
  ['Discover', '/discover/#/', 'Discover'], ['Discover', '/discover/#/welten', 'Themen'], ['Discover', '/discover/#/strategien', 'Strategien'],
  ['Discover', '/discover/#/swipen', 'Swipen'], ['Discover', '/discover/#/einzeln/US_REAL', 'Swipen'], ['Discover', '/discover/#/maerkte', 'Märkte'], ['Discover', '/discover/#/watchlist', 'Watchlist'],
  ['Quant', '/quant/#/', 'Quant'], ['Quant', '/quant/#/screener', 'Screener'], ['Quant', '/quant/#/stile', 'Anlagestile'],
  ['Quant', '/quant/#/aktien', 'Aktien'], ['Quant', '/quant/#/aktie/NVDA', null], ['Quant', '/quant/#/methodik', 'Methodik'],
  // Elliott: eigenes Produkt; das Aktienbild liegt unter /elliott/#/<T> (alt: /quant/#/elliott/<T>, leitet um), gehoert aber zu Elliott (nur Produktkontext).
  // Der Start traegt seine Reiter im Inhalt (App-Konzept 2: Heute · Wellenlagen · Zählbar · Neu · Suche · Aufwärts · Abwärts, data-vu-tabs="inhalt");
  // dort gelten Dock, Universe-Knopf, Reiter im Inhalt und Ueberlauf. Die uebrigen Ansichten zeigen die Reiterzeile des Rahmens.
  ['Elliott', '/elliott/', 'Elliott'], ['Elliott', '/elliott/#/?zaehlbar=1', 'Zählbar'], ['Elliott', '/elliott/#/?welle=3', 'Zählbar'], ['Elliott', '/elliott/#/?neu=1', 'Neu'], ['Elliott', '/elliott/#/?suche=1', 'Suche'],
  ['Elliott', '/elliott/#/?richtung=ab', 'Abwärts'], ['Elliott', '/elliott/#/NVDA', null], ['Elliott', '/quant/#/elliott/NVDA', null],
  // Fundamental: eigenes Produkt; die Unternehmensseite /fundamental/#/<T> zeigt nur den Produktkontext. Der Start (#/) traegt
  // seine Reiter im Inhalt (Prototyp #fundamental: Heute · Ranglisten · Checklisten · Branchen); geprueft werden dort Dock und Reiter.
  ['Fundamental', '/fundamental/#/', 'Fundamental'], ['Fundamental', '/fundamental/#/ranglisten', 'Ranglisten'], ['Fundamental', '/fundamental/#/branchen', 'Branchen'],
  ['Fundamental', '/fundamental/#/methodik', 'Methodik'], ['Fundamental', '/fundamental/#/NVDA', null],
  // Technical: „Vorlagen“ und „Lernen“ sind eigene Reiter (App-Konzept 2); eine Frage des Assistenten gehoert zu „Lernen“.
  // Der Start traegt seine Reiter im Inhalt (Prototyp #technical: Heute · Muster · Screener · Chart · Lernen, data-vu-tabs="inhalt");
  // dort gelten Dock, Universe-Knopf, Reiter im Inhalt und Ueberlauf. Die uebrigen Bereiche zeigen die Reiterzeile des Rahmens.
  ['Technical', '/technical/#/', 'Technical'], ['Technical', '/technical/#/chart', 'Chart'], ['Technical', '/technical/#/screener', 'Screener'], ['Technical', '/technical/#/muster', 'Muster'],
  ['Technical', '/technical/#/screener?reiter=vorlagen', 'Vorlagen'], ['Technical', '/technical/#/lernen', 'Lernen'], ['Technical', '/technical/#/assistent/trendfolge', 'Lernen'],
  // Vorsorge (App-Konzept 2, Owner 16.11.2026): Reiter im Inhalt; erwartet ist der aktive Reiter dort (Start statt Produktname).
  ['Vorsorge', '/vorsorge/#/', 'Start'], ['Vorsorge', '/vorsorge/#/plan', 'Planer'], ['Vorsorge', '/vorsorge/#/etfs', 'ETFs'],
  ['Vorsorge', '/vorsorge/#/portfolio', 'Portfolio'], ['Vorsorge', '/vorsorge/#/foerderung', 'Förderung'], ['Vorsorge', '/vorsorge/#/monitor', 'Veränderungen'],
  // Screener: „Suchen“ (/screener/, Prototyp #screener) traegt seine Reiter im Inhalt; Filter, Treffer und Gespeichert zeigen die Reiter des Rahmens.
  ['Screener', '/screener/', 'Screener'], ['Screener','/screener/?f=roic:gt:0.1','Filter'], ['Screener','/screener/?mode=pro','Filter'], ['Screener', '/screener/?view=build', 'Filter'], ['Screener', '/screener/?view=saved', 'Gespeichert'], ['Screener', '/screener/?view=watchlist', 'Watchlist'],
  ['Supertrader', '/supertrader/', 'Supertrader'], ['Supertrader', '/supertrader/strategies/', 'Methoden'], ['Supertrader', '/supertrader/treffer/', 'Treffer'],
  ['Supertrader', '/supertrader/forschung/', 'Forschung'], ['Supertrader', '/supertrader/sources/', 'Quellen'],
  ['Hedgefonds', '/hedgefonds/#/', 'Hedgefonds'], ['Hedgefonds', '/hedgefonds/#/investoren', 'Investoren'], ['Hedgefonds', '/hedgefonds/#/datenbank', 'Datenbank'], ['Hedgefonds', '/hedgefonds/#/gruppen-kaeufe', 'Gruppen-Käufe'],
  ['Hedgefonds', '/hedgefonds/#/aktien', 'Aktien'], ['Hedgefonds', '/hedgefonds/#/gruppen-kaeufe/insider', 'Gruppen-Käufe'],
  // Portfolios: fordert Dock und Reiter wie jedes Produkt an (seit dem Rahmen nach App-Konzept 2)
  ['Portfolios', '/portfolios/', 'Portfolios'], ['Portfolios', '/portfolios/#/quant', 'Quant'], ['Portfolios', '/portfolios/#/ki', 'KI'],
  ['Hedgefonds', '/hedgefonds/#/aktien', 'Aktien'],
  // Portfolios: fordert das Dock an und traegt seine Reiter im Inhalt (App-Konzept 2, <html data-vu-tabs="inhalt">); die Reiter
  // sind Adressen (#/, #/quant, #/ki). Das vierte Feld ist der dort aktive Reiter im Inhalt (aria-current="page").
  ['Portfolios', '/portfolios/', 'Portfolios', 'Übersicht'], ['Portfolios', '/portfolios/#/quant', 'Quant', 'Quant'], ['Portfolios', '/portfolios/#/ki', 'KI', 'KI'],
  // Alte Quant-Unterseiten: Weiterleitungen auf die App unter /quant/ (quant/ui/legacy-redirect.js). Erwartet ist der Reiter
  // am Ziel: Ranking -> #/screener (Screener), Watchlist -> #/aktien (Aktien), Strategien -> #/stile (Anlagestile).
  ['Quant', '/quant/screener/', 'Screener'], ['Quant', '/quant/strategies/', 'Anlagestile'], ['Quant', '/quant/ranking/', 'Screener'],
  ['Quant', '/quant/technical/', 'Aktien'], ['Quant', '/quant/watchlist/', 'Aktien'], ['Quant', '/quant/methodology/', 'Methodik']
];
const VIEWPORTS = (arg('viewports', '390x844,430x932,768x1024,1024x768,1440x900')).split(',').map((v) => { const [w, h] = v.split('x').map(Number); return [String(w), w, h]; });
const findings = [], checks = [];
const fail = (where, msg) => { findings.push({ where, msg }); console.log('FAIL ' + where + ': ' + msg); };

const browser = await pw[engine].launch(engine === 'chromium' ? { ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--disable-dev-shm-usage'] } : {});
const DOCK = ['Home', 'Discover', 'News', 'Ich'];
const DOCK_ACTIVE = (path) => path.startsWith('/discover/') ? 'Discover' : path.startsWith('/willkommen/') ? 'Home' : path.startsWith('/insights/') ? 'News' : /^\/(mein-dashboard|konto)\//.test(path) ? 'Ich' : null;
/* Menü im Kopf (Owner 22.11.2026): keine Reiterzeile. Der Knopf oben links trägt Modul und Bereich, der Rasterknopf öffnet
   das Menü, die Reiterzeile des Rahmens und die Bereichs-Reiter im Inhalt der Startseiten sind nie sichtbar. */
async function state(page) {
  return page.evaluate(() => {
    const nav = document.getElementById('vu-dock')?.shadowRoot?.querySelector('nav');
    const head = document.querySelector('vu-navigation')?.shadowRoot;
    if (!nav || !head) return null;
    const vis = (n) => !!n && !n.hidden && n.getClientRects().length > 0 && getComputedStyle(n).display !== 'none';
    const r = nav.getBoundingClientRect(), bar = head.querySelector('header').getBoundingClientRect(), world = head.querySelector('button.world'), grid = head.querySelector('button.grid');
    const places = [...nav.querySelectorAll('a')], uni = nav.querySelector('button.menu'), wb = world && world.getBoundingClientRect(), gb = grid && grid.getBoundingClientRect();
    return {
      world: vis(world) ? { name: world.querySelector('.world-name').textContent.trim(), area: world.querySelector('.world-area').textContent.trim(), w: wb.width, h: wb.height, clipped: (() => { const n = world.querySelector('.world-name'); return n.scrollWidth > n.clientWidth + 1; })() } : null,
      grid: vis(grid) ? { w: gb.width, h: gb.height, label: grid.getAttribute('aria-label') } : null,
      strip: vis(head.querySelector('nav.tabs')),
      inTabs: [...document.querySelectorAll('.dp-tabs,.qp-tabs,.tk-tabs,.ek-tabs,.fp-tabs,.pfp-tabs,.vsp-tabs,.stp-tabs,.hp-tabs,.sc-ak-tabs')].filter(vis).length,
      profile: vis(head.querySelector('.profile')),
      places: places.map((a) => a.textContent.trim()),
      place: places.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent.trim()),
      order: [...nav.children].map((n) => n.tagName).join(''),
      menu: !!uni, uni: uni && { label: uni.getAttribute('aria-label'), w: uni.getBoundingClientRect().width, h: uni.getBoundingClientRect().height, top: uni.getBoundingClientRect().top, icon: !!uni.querySelector('svg g') && !uni.querySelector('svg use') },
      menuIconsDeferred: [...head.querySelectorAll('.menu-product-icon use')].every(n=>!n.hasAttribute('href')&&n.hasAttribute('data-href')),
      dockOriginalInline: !!nav.querySelector('a[data-id=discover] svg g')&&!nav.querySelector('svg use'),
      spriteRequested: performance.getEntriesByType('resource').some(r=>new URL(r.name).pathname==='/assets/product-icons.svg'),
      dock: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width },
      head: { barBottom: bar.bottom, reserved: parseFloat(getComputedStyle(document.body).paddingTop), token: getComputedStyle(document.documentElement).getPropertyValue('--vu-navigation-height').trim(), bleed: document.documentElement.hasAttribute('data-vu-bleed') },
      toggle: getComputedStyle(head.querySelector('.toggle')).display,
      overflow: document.documentElement.scrollWidth - innerWidth,
      small: [...nav.querySelectorAll('a,button')].filter((n) => { const b = n.getBoundingClientRect(); return b.width < 44 || b.height < 44; }).length,
      clipped: places.filter((a) => { const l = a.querySelector('.label'); return l && l.scrollWidth > l.clientWidth + 1; }).map((a) => a.textContent.trim()),
      vw: innerWidth, vh: innerHeight
    };
  });
}
async function settle(page) { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(500); }
/* Das Menue gilt erst als offen, wenn es sichtbar ist, seine Einfahrt (transform .2s) und alle Animationen im Menue beendet
   sind und die Schriften stehen. Vorher gemessene Zielgroessen sind ein Zwischenbild, kein Befund. Oeffnet es nicht bis
   dahin, ist das selbst ein Befund. Danach wird einmal gemessen; was dann kleiner als 44 px ist, bleibt ein Befund. */
async function menuOpen(page, where) {
  /* Die Bedingung ist synchron: eine async-Funktion gibt ein Promise zurueck, und das gilt waitForFunction sofort als erfuellt.
     Mit dem Sheet (faehrt 0,32 s von unten ein) wuerde dann mitten in der Einfahrt gemessen. Die Schriften warten getrennt. */
  const ok = await page.waitForFunction(() => {
    const nav = document.querySelector('vu-navigation'), root = nav && nav.shadowRoot, panel = root && root.querySelector('.panel');
    if (!panel || !nav.hasAttribute('open')) return false;
    const cs = getComputedStyle(panel);
    if (cs.visibility !== 'visible' || !(cs.transform === 'none' || cs.transform === 'matrix(1, 0, 0, 1, 0, 0)')) return false;
    return !(root.getAnimations ? root.getAnimations() : []).some((a) => a.playState === 'running' || a.playState === 'pending');
  }, null, { timeout: 5000, polling: 'raf' }).then(() => true, () => false);
  if (!ok) fail(where, 'Menü ist nach 5 s nicht vollständig geöffnet');
  await page.evaluate(() => document.fonts.ready.then(() => true));
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
  for (const [product, path, expected, inhaltExpected] of ROUTES) {
    const where = `${product} ${path} @${vpName}`;
    await fresh();
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      for (const pass of ['first', 'reload']) {
        if (pass === 'reload') { await page.reload({ waitUntil: 'load' }); await settle(page); }
        const s = await state(page);
        if (!s) { fail(where, 'kein Dock oder kein Kopf'); break; }
        if (!s.world || s.world.name !== product) fail(where, 'Knopf oben links trägt nicht das Modul: ' + JSON.stringify(s.world));
        // Der Bereich unter dem Modulnamen: der erste Bereich heißt „Start“, Aktienseiten (null) zeigen keinen oder ihren Bereich.
        const wanted = expected === null ? null : (expected === product ? 'Start' : expected);
        if (s.world && wanted !== null && s.world.area !== wanted) fail(where, `${pass}: Bereich oben links ${s.world.area || '-'} statt ${wanted}`);
        if (s.world && (s.world.h < 44 || s.world.clipped)) fail(where, 'Knopf oben links zu klein oder Name abgeschnitten: ' + JSON.stringify(s.world));
        if (!s.grid || s.grid.w < 44 || s.grid.h < 44) fail(where, 'Rasterknopf (Hauptmenü) fehlt oder ist zu klein: ' + JSON.stringify(s.grid));
        if (s.strip) fail(where, 'Reiterzeile des Rahmens sichtbar');
        if (s.inTabs) fail(where, s.inTabs + ' Bereichs-Reiter im Inhalt sichtbar');
        if (s.profile) fail(where, 'Profil im Kopf doppelt zu „Ich“ im Dock');
        if (s.places.join('|') !== DOCK.join('|') || s.order !== 'AABUTTONAA' || !s.menu) fail(where, 'Dock ist nicht Home · Discover · [Universe] · News · Ich: ' + s.places.join('|') + ' ' + s.order);
        const place = DOCK_ACTIVE(new URL(page.url()).pathname);
        if ((s.place[0] || null) !== place || s.place.length > 1) fail(where, `Dock: aktiv ${s.place.join('|') || '-'} statt ${place || '-'}`);
        if (!s.uni || s.uni.label !== 'Alle Module' || !s.uni.icon || s.uni.w < 56 || s.uni.h < 56 || s.uni.top >= s.dock.top) fail(where, 'Universe-Knopf falsch (Name, Symbol, Größe oder nicht über der Leiste): ' + JSON.stringify(s.uni));
        if (s.head.token !== Math.round(s.head.barBottom) + 'px' || (!s.head.bleed && s.head.reserved < s.head.barBottom - 1)) fail(where, 'Inhalt beginnt nicht unter dem Kopf: ' + JSON.stringify(s.head));
        if(!s.menuIconsDeferred||!s.dockOriginalInline) fail(where,'Icon-Laden ist nicht menu-lazy bzw Dock inline');
        if(path==='/quant/#/screener'&&s.spriteRequested) fail(where,'Quant Screener lädt ungeöffneten Menü-Sprite');
        if (s.toggle !== 'none') fail(where, 'Menue-Knopf im Kopf doppelt');
        if (s.overflow > 1) fail(where, 'horizontaler Ueberlauf ' + s.overflow + ' px');
        if (s.dock.left < 0 || s.dock.right > s.vw || s.dock.bottom > s.vh || s.dock.bottom < s.vh - 40) fail(where, 'Leiste ausserhalb ihres Platzes ' + JSON.stringify(s.dock));
        if (s.small) fail(where, s.small + ' Ziele kleiner als 44 px');
        if (s.clipped.length) fail(where, 'abgeschnittene Beschriftung: ' + s.clipped.join(', '));
      }
      // Klebendes der Produkte liegt unter Kopf und Reitern, nie dahinter.
      const hidden = await page.evaluate(() => {
        const bar = document.querySelector('vu-navigation').shadowRoot.querySelector('header').getBoundingClientRect().bottom;
        scrollTo({ top: 600, behavior: 'instant' });
        const out = [...document.querySelectorAll('main *, body > :not(vu-navigation):not(#vu-dock) *')].filter((n) => getComputedStyle(n).position === 'sticky' && n.getClientRects().length)
          .map((n) => ({ n, r: n.getBoundingClientRect(), top: parseFloat(getComputedStyle(n).top) })).filter((x) => x.r.height > 0 && Math.abs(x.r.top - x.top) <= 1 && x.top < bar - 1)
          .map((x) => (x.n.className || x.n.tagName) + ' klebt bei ' + Math.round(x.r.top) + ', Kopf bis ' + Math.round(bar));
        scrollTo({ top: 0, behavior: 'instant' });
        return out;
      });
      if (hidden.length) fail(where, 'klebt hinter Kopf oder Reitern: ' + hidden.slice(0, 3).join('; '));
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
      const home=['/discover/#/','/elliott/','/fundamental/#/','/quant/#/','/vorsorge/#/','/screener/','/supertrader/','/hedgefonds/#/','/portfolios/'].includes(path);
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
  // Kopf mit Welten-Wechsler (Owner 16.11.2026): rechts KI · Suche · Profil, ohne „i“ und Datums-Pille. Die KI ist eine
  // neongruene Pille (Owner 16.11.2026: „da muss man auf jeden Fall noch KI hinschreiben. Vision Universe KI“): Funke, darueber
  // klein „VISION UNIVERSE“, darunter gross „KI“, Schrift #101318, sichtbar 38 px, Tippflaeche 44 px. Auch mit langem
  // Modulnamen (Supertrader, Fundamental, Hedgefonds, Portfolios) liegt alles im Bild und nichts ist abgeschnitten; die
  // Dachzeile entfaellt nur als letzte Stufe (tightest), „KI“ bleibt immer. In beiden Schemata.
  for (const [path, scheme] of [['/discover/', 'dark'], ['/supertrader/', 'dark'], ['/fundamental/', 'dark'], ['/hedgefonds/', 'dark'], ['/portfolios/', 'dark'], ['/fundamental/', 'light'], ['/hedgefonds/', 'light']]) {
    const where = `kopf ${path} ${scheme} @${vpName}`;
    await fresh();
    try {
      await page.addInitScript((t) => { try { localStorage.setItem('vu-discover-theme-v1', t); } catch {} }, scheme);
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const k = await page.evaluate(() => {
        const host = document.querySelector('vu-navigation'), root = host.shadowRoot, row = root.querySelector('.row'), box = (sel) => { const n = root.querySelector(sel); if (!n || !n.getClientRects().length) return null; const r = n.getBoundingClientRect(), a = getComputedStyle(n, '::after'); return { x: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), tap: Math.round(r.width - 2 * parseFloat(a.left || 0)), tapH: Math.round(r.height - 2 * parseFloat(a.top || 0)), bg: getComputedStyle(n).backgroundColor, ink: getComputedStyle(n).color, label: n.getAttribute('aria-label'), href: n.getAttribute('href') }; };
        const name = root.querySelector('.world-name'), ki = root.querySelector('.hb.ki'), small = ki && ki.querySelector('.ki-t small'), big = ki && ki.querySelector('.ki-t b'), tools = root.querySelector('.tools').getBoundingClientRect(), rb = row.getBoundingClientRect();
        const txt = (n) => n && n.getClientRects().length ? { t: n.textContent.trim(), up: getComputedStyle(n).textTransform, fs: parseFloat(getComputedStyle(n).fontSize), fw: +getComputedStyle(n).fontWeight, cut: n.scrollWidth > n.clientWidth + 1 || n.getBoundingClientRect().right > ki.getBoundingClientRect().right } : null;
        return { theme: document.documentElement.getAttribute('data-theme'), ki: box('.hb.ki'), small: txt(small), big: txt(big), search: box('.hb.search'), grid: box('.hb.grid'), profile: box('.hb.profile'), world: box('.world'), info: !!root.querySelector('.info, .live'),
          stage: ['tight', 'tighter', 'tightest'].filter((x) => host.hasAttribute(x)), toolsOver: Math.round(tools.right - (rb.right - parseFloat(getComputedStyle(row).paddingRight))), vw: innerWidth, name: name && name.textContent, cut: name ? name.scrollWidth > name.clientWidth + 1 : null };
      });
      if (k.theme !== scheme) fail(where, 'Schema ' + k.theme + ' statt ' + scheme);
      if (k.info) fail(where, '„i“ oder Datums-Pille noch im Kopf');
      // Menü im Kopf (Owner 22.11.2026): auf Seiten mit Dock ist die KI-Pille 44 px hoch und trägt nur „KI“ (ohne Dachzeile);
      // rechts folgen Rasterknopf (Hauptmenü) und Suche, das Profil steht als „Ich“ im Dock.
      if (!k.ki || k.ki.h !== 44 || k.ki.w < 56 || k.ki.bg !== 'rgb(200, 245, 49)' || k.ki.ink !== 'rgb(16, 19, 24)' || k.ki.label !== 'Vision Universe KI fragen' || k.ki.href !== '/ask/?fokus=1') fail(where, 'KI-Pille falsch: ' + JSON.stringify(k.ki));
      if (!k.big || k.big.t !== 'KI' || k.big.fs < 15 || k.big.fs > 16 || k.big.fw < 800 || k.big.cut) fail(where, '„KI“ in der Pille fehlt, zu klein oder abgeschnitten: ' + JSON.stringify(k.big));
      if (k.small) fail(where, 'Dachzeile „VISION UNIVERSE“ steht mit Dock noch in der Pille');
      if (k.profile) fail(where, 'Profil im Kopf doppelt zu „Ich“ im Dock');
      if (!k.grid || !k.search || !(k.ki && k.ki.x < k.grid.x && k.grid.x < k.search.x) || k.grid.w < 44 || k.grid.h < 44) fail(where, 'Reihenfolge KI · Menü · Suche falsch oder Rasterknopf zu klein');
      if (k.cut || k.toolsOver > 1 || (k.profile && k.profile.r > k.vw) || (k.world && k.world.x < 0)) fail(where, 'Kopf läuft über oder Name abgeschnitten: ' + JSON.stringify(k));
      checks.push({ where, kopf: k, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
    // Die Wahl des Schemas gilt im ganzen Kontext: danach wieder ohne gespeicherte Wahl (Standard dunkel) fuer die folgenden Pruefungen.
    await page.evaluate(() => { try { localStorage.removeItem('vu-discover-theme-v1'); } catch {} }).catch(() => {});
  }
  // KI-Knopf: /ask/?fokus=1 setzt den Fokus auf die Eingabe.
  {
    const where = `ki fokus @${vpName}`;
    await fresh();
    try {
      await page.goto(base + '/ask/?fokus=1', { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const f = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.id, title: document.title, h1: document.querySelector('h1')?.textContent }));
      if (f.focus !== 'ak-q' || f.title !== 'Vision Universe KI' || f.h1 !== 'Vision Universe KI') fail(where, 'Fokus, Titel oder Überschrift falsch: ' + JSON.stringify(f));
      checks.push({ where, pass: !findings.some((x) => x.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  // Seiten ohne Dock: der Kopf traegt den Menue-Knopf selbst und passt in jede Breite.
  for (const path of ['/news/', '/willkommen/', '/konto/', '/ask/']) {
    const where = `kopf ohne Leiste ${path} @${vpName}`;
    await fresh();
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const h = await page.evaluate(() => { const root = document.querySelector('vu-navigation').shadowRoot, t = root.querySelector('.toggle').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth - innerWidth, left: t.left, right: t.right, w: t.width, h: t.height, vw: innerWidth, dock: !!document.getElementById('vu-dock') }; });
      // Redesign 2027 (E02): die Willkommensseite traegt das Dock (Home aktiv) und die Reiter „Mein Bereich“; dann oeffnet der Universe-Knopf das Menue.
      if (h.dock && path === '/willkommen/') {
        const m = await page.locator('#vu-dock button.menu').boundingBox();
        if (h.overflow > 1 || !m || m.width < 44 || m.height < 44 || m.x < 0 || m.x + m.width > h.vw + 1) fail(where, 'Universe-Knopf im Dock abgeschnitten oder zu klein: ' + JSON.stringify({ overflow: h.overflow, m, vw: h.vw }));
        // App-Konzept 2 (Prototyp #home, Owner 14./15.11.2026): Home zeigt keine Reiterzeile, nur Kopf und Dock mit „Home“ aktiv.
        const w = await page.evaluate(() => { const nav = document.getElementById('vu-dock')?.shadowRoot?.querySelector('nav'), strip = document.querySelector('vu-navigation')?.shadowRoot?.querySelector('nav.tabs');
          return nav && { place: [...nav.querySelectorAll('a')].filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent.trim()), strip: !!strip && !strip.hidden }; });
        if (!w || w.place.join('|') !== 'Home' || w.strip) fail(where, 'Willkommen: Dock oder Reiter falsch: ' + JSON.stringify(w));
      } else {
        if (h.dock) fail(where, 'unerwartetes Dock');
        if (h.overflow > 1 || h.right > h.vw + 1 || h.left < 0 || h.w < 44 || h.h < 44) fail(where, 'Menü-Knopf im Kopf abgeschnitten oder zu klein: ' + JSON.stringify(h));
      }
      // App-Konzept 2 (Vorlage Prototyp #v-ich, Owner 16.11.2026): /konto/ traegt die Reiter von „Mein Bereich“ im Inhalt wie
      // /mein-dashboard/ (Ich · Gespeichert · Konto), auch bevor das Konto geladen ist; die Reiterzeile des Rahmens bleibt weg
      // (ohne erreichbare Konto-API leitet die Seite zur Anmeldung weiter, dann gilt nur die Pruefung des Kopfes).
      if (path === '/konto/' && new URL(page.url()).pathname === '/konto/') {
        const k = await page.evaluate(() => { const strip = document.querySelector('vu-navigation').shadowRoot.querySelector('nav.tabs'), tabs = [...document.querySelectorAll('main .md-tabs a')];
          return { own: document.documentElement.getAttribute('data-vu-tabs'), strip: !!strip && !strip.hidden, labels: tabs.map((a) => a.textContent.trim()).join('|'), current: tabs.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent.trim()).join('|') }; });
        if (k.own !== 'inhalt' || k.strip || k.labels !== 'Ich|Gespeichert|Konto' || k.current !== 'Konto') fail(where, 'Konto: Reiter im Inhalt falsch: ' + JSON.stringify(k));
      }
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  // Vision Universe KI (/ask/, frueher Atlas) nach App-Konzept 2 (Owner 16.11.2026; Vorlage Fenster „suche“ des Prototyps): Rahmen wie jede Seite (Kopf des
  // Rahmens, kein eigener Kopf), dunkel als Standard (theme-color #08080a), genau eine h1, Eingabe mit mindestens 16 px Schrift
  // (kein Zoom beim Antippen), jede Tippfläche im Inhalt mindestens 44 px, „Daten & Hinweise“ öffnet das Fenster des Rahmens.
  {
    const where = `atlas /ask/ @${vpName}`;
    await fresh();
    try {
      await page.goto(base + '/ask/', { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const a = await page.evaluate(() => {
        const vis = (n) => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden';
        const ta = document.querySelector('#ak-q'), head = document.querySelector('vu-navigation');
        return { h1: document.querySelectorAll('h1').length, theme: document.querySelector('meta[name=theme-color]')?.content, own: !!document.querySelector('.ak-hd, vu-navigation[menu-only]'),
          head: !!head && !!head.shadowRoot && getComputedStyle(head.shadowRoot.querySelector('header')).display !== 'none', font: ta ? parseFloat(getComputedStyle(ta).fontSize) : 0,
          bar: !!document.querySelector('main form.ak-bar'), can: document.querySelectorAll('main .ak-can-card').length, often: document.querySelectorAll('main .ak-often-q').length,
          small: [...document.querySelectorAll('main a, main button, main textarea, main input')].filter(vis).map((n) => { const r = n.getBoundingClientRect(); return { n, w: Math.round(r.width), h: Math.round(r.height) }; })
            .filter((x) => x.w < 44 || x.h < 44).map((x) => (x.n.getAttribute('class') || x.n.tagName.toLowerCase()) + ' ' + x.w + '×' + x.h),
          overflow: document.documentElement.scrollWidth - innerWidth };
      });
      if (a.h1 !== 1) fail(where, 'genau eine h1 erwartet, gefunden ' + a.h1);
      if (a.theme !== '#08080a') fail(where, 'theme-color nicht dunkel: ' + a.theme);
      if (a.own || !a.head) fail(where, 'Die KI-Seite trägt nicht den Kopf des Rahmens');
      if (!a.bar || a.font < 16) fail(where, 'Eingabe fehlt oder Schrift unter 16 px: ' + a.font);
      if (a.can !== 3 || a.often !== 3) fail(where, 'Start unvollständig („Was die KI kann“ ' + a.can + ', „Oft gefragt“ ' + a.often + ')');
      if (a.small.length) fail(where, a.small.length + ' Ziele kleiner als 44 px (' + a.small.slice(0, 4).join('; ') + ')');
      if (a.overflow > 1) fail(where, 'horizontaler Ueberlauf ' + a.overflow + ' px');
      await page.locator('main .ak-lk').click();
      const sheet = await page.waitForSelector('#vu-sh-hinweise', { state: 'visible', timeout: 5000 }).then(() => true, () => false);
      if (!sheet) fail(where, '„Daten & Hinweise“ öffnet das Fenster des Rahmens nicht');
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  // Konto (App-Konzept 2, Vorlage Prototyp #v-ich, Owner 16.11.2026): Konto, Einstellungen, Abonnement und Watchlist-Detail tragen
  // Dock („Ich“ aktiv) und dieselben Reiter im Inhalt wie /mein-dashboard/ (Ich · Gespeichert · Konto, <html data-vu-tabs="inhalt">;
  // „Konto“ aktiv, im Watchlist-Detail „Ich“); die Reiterzeile des Rahmens bleibt verborgen. Bestellweg (Tarife, Kündigen),
  // Anmeldung, Registrierung und Passwort bleiben ohne Leiste. Die Konto-API gibt es im statischen Bau nicht: die Prüfung stellt sie
  // unter derselben Herkunft nach (angemeldet auf den Seiten mit Leiste, abgemeldet auf den übrigen), damit die Seite nicht
  // weiterleitet und ihr echter Inhalt steht. Adresse und Antworten der API werden vor den Skripten der Seite im Fenster festgelegt,
  // nicht über abgefangene Netzabrufe: WebKit nimmt /konto/config.js aus seinem Zwischenspeicher und reicht Abrufe über den Service
  // Worker (assets/pwa.js) an der Prüfung vorbei. Geprüft werden Reiter, Dock, genau eine h1, Tippflächen (≥ 44 px, auch über einen
  // transparenten Rand), Überlauf und dass kein Bedienelement am Seitenende unter dem Dock liegt.
  for (const [path, bar] of [['/konto/', 'Konto'], ['/konto/einstellungen/', 'Konto'], ['/konto/abo/', 'Konto'], ['/konto/watchlist/', 'Ich'], ['/konto/tarife/', false], ['/konto/kuendigen/', false], ['/konto/anmelden/', false], ['/konto/registrieren/', false], ['/konto/passwort/', false]]) {
    const where = `konto ${path} @${vpName}`;
    await fresh();
    try {
      await page.addInitScript((signedIn) => {
        Object.defineProperty(globalThis, 'VU_ACCOUNT_CONFIG', { configurable: true, get: () => ({ endpoint: location.origin + '/__qa-konto' }), set() {} });
        const real = globalThis.fetch;
        globalThis.fetch = (input, init) => {
          const url = String((input && input.url) || input), at = url.indexOf('/__qa-konto/v1/');
          if (at < 0) return real(input, init);
          const api = url.slice(at + '/__qa-konto'.length).split('?')[0];
          const data = api === '/v1/session' ? { authenticated: signedIn, user: signedIn ? { id: 'qa', email: 'qa@example.test' } : null }
            : api === '/v1/me' ? { user: { id: 'qa', email: 'qa@example.test' }, profile: { displayName: 'QA', createdAt: '2026-10-01T00:00:00Z' }, settings: { appearance: 'system', displayCurrency: 'EUR', experienceLevel: 'beginner', notifications: {} }, newsletter: { available: true, status: 'none' }, entitlements: { plan_id: 'free' } }
            : api === '/v1/me/billing' ? { entitlements: { plan_id: 'free' }, billingAvailable: true, subscriptions: [], invoices: [] }
            : api === '/v1/watchlist' ? { items: [], limits: { items: 500 } }
            : api === '/v1/plans' ? { plans: [], prices: [] } : {};
          return Promise.resolve(new Response(JSON.stringify(data), { status: signedIn || api !== '/v1/me' ? 200 : 401, headers: { 'content-type': 'application/json' } }));
        };
      }, !!bar);
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const at = new URL(page.url()).pathname;
      if (at !== path) fail(where, 'Seite hat weitergeleitet nach ' + at);
      const bare = await page.evaluate(() => ({ dock: !!document.getElementById('vu-dock'), tabs: document.documentElement.hasAttribute('data-vu-tabs'), overflow: document.documentElement.scrollWidth - innerWidth }));
      if (bare.overflow > 1) fail(where, 'horizontaler Ueberlauf ' + bare.overflow + ' px');
      if (!bar) { if (bare.dock || bare.tabs) fail(where, 'Leiste auf einer Seite, die ohne Ablenkung bleiben soll: ' + JSON.stringify(bare)); }
      else {
        await page.waitForFunction(() => !!document.getElementById('vu-dock')?.shadowRoot?.querySelector('nav'), null, { timeout: 10000 }).catch(() => {});
        const s = await page.evaluate(() => {
          const nav = document.getElementById('vu-dock')?.shadowRoot?.querySelector('nav'), strip = document.querySelector('vu-navigation')?.shadowRoot?.querySelector('nav.tabs');
          const tabs = [...document.querySelectorAll('main .md-tabs a')];
          const reach = (n) => { const b = n.getBoundingClientRect(), a = getComputedStyle(n, '::after'), big = a.content !== 'none' && a.position === 'absolute';
            return { w: Math.max(b.width, big ? parseFloat(a.width) || 0 : 0), h: Math.max(b.height, big ? parseFloat(a.height) || 0 : 0) }; };
          // Links im Fliesstext (inline in einem Absatz oder Hinweis) sind nach WCAG 2.5.8 ausgenommen; alle anderen Ziele zaehlen.
          const inline = (n) => n.tagName === 'A' && getComputedStyle(n).display === 'inline' && !!n.closest('p, li, .ka-hint, .ka-lead');
          const small = [...document.querySelectorAll('main a, main button, main input:not([type=checkbox]), main select')].filter((n) => n.getClientRects().length && !inline(n)).map((n) => ({ n, s: reach(n) })).filter((x) => x.s.w < 44 || x.s.h < 44)
            .map((x) => (x.n.className || x.n.tagName) + ' „' + (x.n.textContent || x.n.id).trim().slice(0, 20) + '“ ' + Math.round(x.s.w) + '×' + Math.round(x.s.h));
          const fields = [...document.querySelectorAll('main input:not([type=checkbox]):not([hidden]), main select')].filter((n) => n.getClientRects().length && parseFloat(getComputedStyle(n).fontSize) < 16).map((n) => n.id);
          return { own: document.documentElement.getAttribute('data-vu-tabs'), strip: !!strip && !strip.hidden, labels: tabs.map((a) => a.textContent.trim()), current: tabs.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent.trim()),
            places: nav ? [...nav.querySelectorAll('a')].map((a) => a.textContent.trim()) : [], place: nav ? [...nav.querySelectorAll('a[aria-current=page]')].map((a) => a.textContent.trim()) : [],
            menu: !!(nav && nav.querySelector('button.menu')), h1: document.querySelectorAll('h1').length, small, fields };
        });
        if (s.own !== 'inhalt' || s.strip) fail(where, 'Reiterzeile des Rahmens statt Reiter im Inhalt: ' + JSON.stringify({ own: s.own, strip: s.strip }));
        if (s.labels.join('|') !== 'Ich|Gespeichert|Konto' || s.current.join('|') !== bar) fail(where, 'Reiter falsch: ' + s.labels.join('|') + ' aktiv ' + s.current.join('|'));
        if (s.places.join('|') !== DOCK.join('|') || s.place.join('|') !== 'Ich' || !s.menu) fail(where, 'Dock falsch: ' + s.places.join('|') + ' aktiv ' + s.place.join('|'));
        if (s.h1 !== 1) fail(where, s.h1 + ' h1 statt genau einer');
        if (s.small.length) fail(where, s.small.length + ' Ziele kleiner als 44 px: ' + s.small.slice(0, 4).join('; '));
        if (s.fields.length) fail(where, 'Eingaben unter 16 px: ' + s.fields.join(','));
        const end = await page.evaluate(() => {
          scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' });
          const dock = document.getElementById('vu-dock'), dockTop = dock ? dock.shadowRoot.querySelector('nav').getBoundingClientRect().top : innerHeight;
          const controls = [...document.querySelectorAll('main a, main button, main input, main select')].filter((n) => n.getClientRects().length);
          const last = controls.at(-1), r = last && last.getBoundingClientRect(), hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { dockTop, controls: controls.length, forms: document.querySelectorAll('main form, main .ka-kv, main .ka-list:not([hidden]), #wl-app:not([hidden])').length, bottom: r && r.bottom, reachable: !!hit && (hit === last || last.contains(hit) || hit.contains(last)), label: last && (last.textContent || last.id).trim().slice(0, 30) };
        });
        if (!end.forms) fail(where, 'Inhalt der Seite steht nicht (nachgestellte Konto-API): ' + JSON.stringify(end));
        if (!end.controls || end.bottom > end.dockTop + 1 || !end.reachable) fail(where, 'letztes Bedienelement am Seitenende verdeckt: ' + JSON.stringify(end));
      }
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  // Ich (/mein-dashboard/, Prototyp „App-Konzept 2“ #v-ich): die Seite traegt die Reiter von „Mein Bereich“ selbst im Inhalt
  // (Ich · Gespeichert · Konto, <html data-vu-tabs="inhalt">), die Reiterzeile des Rahmens bleibt verborgen; Dock mit „Ich“ aktiv.
  // Angemeldet ueber dieselbe nachgestellte Konto-API wie oben, mit einer Watchlist aus zwei echten Kuerzeln (Kennung aus names.json).
  // Danach Zurueck/Vor ueber die Reiter im Inhalt (Hash #/gespeichert).
  for (const [path, expected] of [['/mein-dashboard/', 'Ich'], ['/mein-dashboard/#/gespeichert', 'Gespeichert']]) {
    const where = `ich ${path} @${vpName}`;
    await fresh();
    try {
      await page.addInitScript(() => {
        Object.defineProperty(globalThis, 'VU_ACCOUNT_CONFIG', { configurable: true, get: () => ({ endpoint: location.origin + '/__qa-konto' }), set() {} });
        const real = globalThis.fetch;
        globalThis.fetch = (input, init) => {
          const url = String((input && input.url) || input), at = url.indexOf('/__qa-konto/v1/');
          if (at < 0) return real(input, init);
          const api = url.slice(at + '/__qa-konto'.length).split('?')[0], json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
          if (api === '/v1/watchlist') {
            const W = globalThis.VUCore.WatchlistView;
            return real(W.PATHS.names).then((r) => r.json()).then((d) => { const ix = W.index(d);
              return json({ items: ['NVDA', 'AAPL'].map((t) => ({ ticker: t, instrumentId: ix.resolveTicker(t), addedAt: '2026-11-01T00:00:00Z' })).filter((x) => x.instrumentId), limits: { items: 500 } }); });
          }
          return Promise.resolve(json(api === '/v1/session' ? { authenticated: true, user: { id: 'qa', email: 'qa@example.test' } }
            : api === '/v1/me' ? { profile: { displayName: 'QA' }, settings: {}, entitlements: { plan_id: 'free' } } : {}));
        };
      });
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const at = new URL(page.url()).pathname;
      if (at !== '/mein-dashboard/') fail(where, 'Seite hat weitergeleitet nach ' + at);
      const ich = () => page.evaluate(() => {
        const nav = document.getElementById('vu-dock')?.shadowRoot?.querySelector('nav'), strip = document.querySelector('vu-navigation')?.shadowRoot?.querySelector('nav.tabs');
        const tabs = [...document.querySelectorAll('main .md-tabs a')];
        const reach = (n) => { const b = n.getBoundingClientRect(), a = getComputedStyle(n, '::after'), big = a.content !== 'none' && a.position === 'absolute';
          return { w: Math.max(b.width, big ? parseFloat(a.width) || 0 : 0), h: Math.max(b.height, big ? parseFloat(a.height) || 0 : 0) }; };
        const small = [...document.querySelectorAll('main a, main button')].filter((n) => n.getClientRects().length).map((n) => ({ n, s: reach(n) })).filter((x) => x.s.w < 44 || x.s.h < 44)
          .map((x) => (x.n.className || x.n.tagName) + ' „' + x.n.textContent.trim().slice(0, 20) + '“ ' + Math.round(x.s.w) + '×' + Math.round(x.s.h));
        return { own: document.documentElement.getAttribute('data-vu-tabs'), labels: tabs.map((a) => a.textContent.trim()), current: tabs.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent.trim()),
          places: nav ? [...nav.querySelectorAll('a')].map((a) => a.textContent.trim()) : [], place: nav ? [...nav.querySelectorAll('a[aria-current=page]')].map((a) => a.textContent.trim()) : [],
          strip: !!strip && !strip.hidden, h1: document.querySelectorAll('h1').length, app: !document.getElementById('md-app').hidden, overflow: document.documentElement.scrollWidth - innerWidth, small };
      });
      const s = await ich();
      if (s.own !== 'inhalt' || s.strip) fail(where, 'Reiterzeile des Rahmens statt Reiter im Inhalt: ' + JSON.stringify({ own: s.own, strip: s.strip }));
      if (s.labels.join('|') !== 'Ich|Gespeichert|Konto' || s.current.join('|') !== expected) fail(where, 'Reiter falsch: ' + s.labels.join('|') + ' aktiv ' + s.current.join('|'));
      if (s.places.join('|') !== DOCK.join('|') || s.place.join('|') !== 'Ich') fail(where, 'Dock falsch: ' + s.places.join('|') + ' aktiv ' + s.place.join('|'));
      if (s.h1 !== 1) fail(where, s.h1 + ' h1 statt genau einer');
      if (!s.app) fail(where, 'Inhalt der Seite steht nicht (nachgestellte Konto-API)');
      if (s.overflow > 1) fail(where, 'horizontaler Ueberlauf ' + s.overflow + ' px');
      if (s.small.length) fail(where, s.small.length + ' Ziele kleiner als 44 px: ' + s.small.slice(0, 4).join('; '));
      const end = await page.evaluate(() => {
        scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' });
        const dockTop = document.getElementById('vu-dock').shadowRoot.querySelector('nav').getBoundingClientRect().top;
        const last = [...document.querySelectorAll('main a, main button')].filter((n) => n.getClientRects().length).at(-1), r = last && last.getBoundingClientRect(), hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { dockTop, bottom: r && r.bottom, reachable: !!hit && (hit === last || last.contains(hit) || hit.contains(last)), label: last && last.textContent.trim().slice(0, 30) };
      });
      if (end.bottom > end.dockTop + 1 || !end.reachable) fail(where, 'letztes Bedienelement am Seitenende verdeckt: ' + JSON.stringify(end));
      if (path === '/mein-dashboard/') {
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await page.locator('main .md-tabs a', { hasText: 'Gespeichert' }).click(); await settle(page);
        if ((await ich()).current.join('|') !== 'Gespeichert') fail(where, 'Klick Gespeichert markiert nicht');
        await page.goBack(); await settle(page);
        if ((await ich()).current.join('|') !== 'Ich') fail(where, 'Zurueck: ' + (await ich()).current.join('|'));
        await page.goForward(); await settle(page);
        if ((await ich()).current.join('|') !== 'Gespeichert') fail(where, 'Vor: ' + (await ich()).current.join('|'));
      }
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  // Ich (/mein-dashboard/, Prototyp „App-Konzept 2“ #v-ich): die Seite traegt die Reiter von „Mein Bereich“ selbst im Inhalt
  // (Ich · Gespeichert · Konto, <html data-vu-tabs="inhalt">), die Reiterzeile des Rahmens bleibt verborgen; Dock mit „Ich“ aktiv.
  // Angemeldet ueber dieselbe nachgestellte Konto-API wie oben, mit einer Watchlist aus zwei echten Kuerzeln (Kennung aus names.json).
  // Danach Zurueck/Vor ueber die Reiter im Inhalt (Hash #/gespeichert).
  for (const [path, expected] of [['/mein-dashboard/', 'Ich'], ['/mein-dashboard/#/gespeichert', 'Gespeichert']]) {
    const where = `ich ${path} @${vpName}`;
    await fresh();
    try {
      await page.addInitScript(() => {
        Object.defineProperty(globalThis, 'VU_ACCOUNT_CONFIG', { configurable: true, get: () => ({ endpoint: location.origin + '/__qa-konto' }), set() {} });
        const real = globalThis.fetch;
        globalThis.fetch = (input, init) => {
          const url = String((input && input.url) || input), at = url.indexOf('/__qa-konto/v1/');
          if (at < 0) return real(input, init);
          const api = url.slice(at + '/__qa-konto'.length).split('?')[0], json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
          if (api === '/v1/watchlist') {
            const W = globalThis.VUCore.WatchlistView;
            return real(W.PATHS.names).then((r) => r.json()).then((d) => { const ix = W.index(d);
              return json({ items: ['NVDA', 'AAPL'].map((t) => ({ ticker: t, instrumentId: ix.resolveTicker(t), addedAt: '2026-11-01T00:00:00Z' })).filter((x) => x.instrumentId), limits: { items: 500 } }); });
          }
          return Promise.resolve(json(api === '/v1/session' ? { authenticated: true, user: { id: 'qa', email: 'qa@example.test' } }
            : api === '/v1/me' ? { profile: { displayName: 'QA' }, settings: {}, entitlements: { plan_id: 'free' } } : {}));
        };
      });
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const at = new URL(page.url()).pathname;
      if (at !== '/mein-dashboard/') fail(where, 'Seite hat weitergeleitet nach ' + at);
      const ich = () => page.evaluate(() => {
        const nav = document.getElementById('vu-dock')?.shadowRoot?.querySelector('nav'), strip = document.querySelector('vu-navigation')?.shadowRoot?.querySelector('nav.tabs');
        const tabs = [...document.querySelectorAll('main .md-tabs a')];
        const reach = (n) => { const b = n.getBoundingClientRect(), a = getComputedStyle(n, '::after'), big = a.content !== 'none' && a.position === 'absolute';
          return { w: Math.max(b.width, big ? parseFloat(a.width) || 0 : 0), h: Math.max(b.height, big ? parseFloat(a.height) || 0 : 0) }; };
        const small = [...document.querySelectorAll('main a, main button')].filter((n) => n.getClientRects().length).map((n) => ({ n, s: reach(n) })).filter((x) => x.s.w < 44 || x.s.h < 44)
          .map((x) => (x.n.className || x.n.tagName) + ' „' + x.n.textContent.trim().slice(0, 20) + '“ ' + Math.round(x.s.w) + '×' + Math.round(x.s.h));
        return { own: document.documentElement.getAttribute('data-vu-tabs'), labels: tabs.map((a) => a.textContent.trim()), current: tabs.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent.trim()),
          places: nav ? [...nav.querySelectorAll('a')].map((a) => a.textContent.trim()) : [], place: nav ? [...nav.querySelectorAll('a[aria-current=page]')].map((a) => a.textContent.trim()) : [],
          strip: !!strip && !strip.hidden, h1: document.querySelectorAll('h1').length, app: !document.getElementById('md-app').hidden, overflow: document.documentElement.scrollWidth - innerWidth, small };
      });
      const s = await ich();
      if (s.own !== 'inhalt' || s.strip) fail(where, 'Reiterzeile des Rahmens statt Reiter im Inhalt: ' + JSON.stringify({ own: s.own, strip: s.strip }));
      if (s.labels.join('|') !== 'Ich|Gespeichert|Konto' || s.current.join('|') !== expected) fail(where, 'Reiter falsch: ' + s.labels.join('|') + ' aktiv ' + s.current.join('|'));
      if (s.places.join('|') !== DOCK.join('|') || s.place.join('|') !== 'Ich') fail(where, 'Dock falsch: ' + s.places.join('|') + ' aktiv ' + s.place.join('|'));
      if (s.h1 !== 1) fail(where, s.h1 + ' h1 statt genau einer');
      if (!s.app) fail(where, 'Inhalt der Seite steht nicht (nachgestellte Konto-API)');
      if (s.overflow > 1) fail(where, 'horizontaler Ueberlauf ' + s.overflow + ' px');
      if (s.small.length) fail(where, s.small.length + ' Ziele kleiner als 44 px: ' + s.small.slice(0, 4).join('; '));
      const end = await page.evaluate(() => {
        scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' });
        const dockTop = document.getElementById('vu-dock').shadowRoot.querySelector('nav').getBoundingClientRect().top;
        const last = [...document.querySelectorAll('main a, main button')].filter((n) => n.getClientRects().length).at(-1), r = last && last.getBoundingClientRect(), hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { dockTop, bottom: r && r.bottom, reachable: !!hit && (hit === last || last.contains(hit) || hit.contains(last)), label: last && last.textContent.trim().slice(0, 30) };
      });
      if (end.bottom > end.dockTop + 1 || !end.reachable) fail(where, 'letztes Bedienelement am Seitenende verdeckt: ' + JSON.stringify(end));
      if (path === '/mein-dashboard/') {
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await page.locator('main .md-tabs a', { hasText: 'Gespeichert' }).click(); await settle(page);
        if ((await ich()).current.join('|') !== 'Gespeichert') fail(where, 'Klick Gespeichert markiert nicht');
        await page.goBack(); await settle(page);
        if ((await ich()).current.join('|') !== 'Ich') fail(where, 'Zurueck: ' + (await ich()).current.join('|'));
        await page.goForward(); await settle(page);
        if ((await ich()).current.join('|') !== 'Gespeichert') fail(where, 'Vor: ' + (await ich()).current.join('|'));
      }
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  // Insights (Ziel des Platzes „News“): das Dock steht auf jeder Seite, „News“ ist aktiv, keine Reiterzeile der Shell (die Seiten
  // tragen ihre eigenen Reiter), der Universe-Knopf oeffnet das Menue, und das Seitenende liegt ueber dem Dock.
  // App-Konzept 2 (Prototyp #news, Owner 15.11.2026): jede Seite zeigt die Reiter des Prototyps im Inhalt (<html data-vu-tabs="inhalt">,
  // Heute · Magazin · Kurz erklaert · Reports), jede Tippflaeche dort ist mindestens 44 px gross.
  for (const path of ['/insights/', '/insights/magazin/', '/insights/reports/']) {
    const where = `insights ${path} @${vpName}`;
    await fresh();
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      // Erst die Uebersicht selbst, dann ihre erste Unterseite (Artikel, Heft, Report)
      const sub = await page.evaluate((p) => { const a = [...document.querySelectorAll('main a[href^="/insights/"]')].map((n) => n.getAttribute('href')).find((h) => h !== p && h.startsWith(p) && h.endsWith('/') && !/^\/insights\/(magazin|reports)\/$/.test(h)); return a || null; }, path);
      for (const target of [path, sub].filter(Boolean)) {
        if (target !== path) { await page.goto(base + target, { waitUntil: 'load', timeout: 90000 }); await settle(page); }
        const s = await page.evaluate(async () => {
          const nav = document.getElementById('vu-dock')?.shadowRoot?.querySelector('nav'), head = document.querySelector('vu-navigation').shadowRoot;
          if (!nav) return null;
          for (let i = 0, h = -1; i < 8 && h !== document.documentElement.scrollHeight; i++) { h = document.documentElement.scrollHeight; scrollTo(0, h); await new Promise((r) => setTimeout(r, 400)); }
          scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' });
          const d = nav.getBoundingClientRect(), u = nav.querySelector('button.menu').getBoundingClientRect();
          const text = [...document.querySelectorAll('main *, footer *')].filter((n) => !n.children.length && n.textContent.trim() && n.getClientRects().length).reduce((m, n) => Math.max(m, n.getBoundingClientRect().bottom), 0);
          return { places: [...nav.querySelectorAll('a')].map((a) => a.textContent.trim()).join('|'), place: [...nav.querySelectorAll('a[aria-current=page]')].map((a) => a.textContent.trim()).join('|'),
            tabs: !head.querySelector('nav.tabs').hidden, own: [...document.querySelectorAll('.in-tabs a')].map((a) => a.textContent.trim()).join('|'), inhalt: document.documentElement.getAttribute('data-vu-tabs') === 'inhalt',
            ownSmall: [...document.querySelectorAll('.in-tabs a')].filter((a) => { const b = a.getBoundingClientRect(), x = getComputedStyle(a, '::after'); return Math.max(b.width, parseFloat(x.width) || 0) < 44 || Math.max(b.height, parseFloat(x.height) || 0) < 44; }).length, toggle: getComputedStyle(head.querySelector('.toggle')).display,
            overflow: document.documentElement.scrollWidth - innerWidth, dockTop: Math.min(d.top, u.top), dockBottom: d.bottom, text, vh: innerHeight, reserved: parseFloat(getComputedStyle(document.body).paddingBottom) };
        });
        const at = where + (target !== path ? ' → ' + target : '');
        if (!s) { fail(at, 'kein Dock'); continue; }
        if (s.places !== DOCK.join('|') || s.place !== 'News') fail(at, 'Dock falsch oder „News“ nicht aktiv: ' + s.places + ' / ' + s.place);
        if (s.tabs || !s.inhalt || s.own !== 'Heute|Magazin|Kurz erklärt|Reports' || s.ownSmall) fail(at, 'Reiter: Shell ' + s.tabs + ', im Inhalt ' + s.inhalt + ', Seite ' + s.own + ', zu klein ' + s.ownSmall);
        if (s.toggle !== 'none') fail(at, 'Menue-Knopf im Kopf doppelt');
        if (s.overflow > 1) fail(at, 'horizontaler Ueberlauf ' + s.overflow + ' px');
        if (s.text > s.dockTop + 1 || s.dockBottom > s.vh || s.reserved < s.vh - s.dockTop) fail(at, `Seitenende verdeckt (Text bis ${Math.round(s.text)}, Dock ab ${Math.round(s.dockTop)}, frei ${s.reserved})`);
        // Der Universe-Knopf oeffnet das Menue; auf den drei Uebersichten ist Insights dort die aktuelle Welt.
        await page.locator('#vu-dock button.menu').click(); await menuOpen(page, at);
        if (target === path && !await page.evaluate(() => { const r = document.querySelector('vu-navigation').shadowRoot; return r.querySelector('.tile.is-current b')?.textContent === 'Insights' && r.querySelector('.here-title').textContent === 'In Insights'; })) fail(at, 'Menü zeigt Insights nicht als aktuelle Welt');
        await page.keyboard.press('Escape');
        if (!await page.waitForFunction(() => !document.querySelector('vu-navigation').hasAttribute('open'), null, { timeout: 3000 }).then(() => true, () => false)) fail(at, 'Escape schliesst das Menü nicht');
      }
      checks.push({ where, pass: !findings.some((f) => f.where.startsWith(where)) });
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
      // Dunkel: Flaeche des Prototyps (.dock); hell: helle Leiste (Owner 16.11.2026: im Hellen ist alles hell). theme-color folgt.
      const dockWant = after.t === 'dark' ? 'rgba(12, 12, 13, 0.92)' : 'rgba(255, 255, 255, 0.92)', barWant = after.t === 'dark' ? '#08080a' : '#ffffff';
      if (after.dock !== dockWant) fail(where, 'Leiste nicht in der Flaeche des Schemas (' + after.t + '): ' + after.dock);
      if (after.bar && after.bar.toLowerCase() !== barWant) fail(where, 'theme-color nicht ' + barWant + ': ' + after.bar);
      await pick(before === 'dark' ? 'Dunkel' : 'Hell');
      if (await page.evaluate(() => document.documentElement.getAttribute('data-theme')) !== before) fail(where, 'Theme springt nicht zurueck');
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  // Globales Menue „Dein Universe“ ueber den Universe-Knopf: dasselbe Menue auf jedem Produkt.
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
      // Das Sheet faehrt von unten ein: erst messen, wenn es steht (vorher liegt seine Unterkante unter dem Bildrand).
      await menuOpen(page, where);
      const m = await page.evaluate(() => {
        const root = document.querySelector('vu-navigation').shadowRoot, panel = root.querySelector('.panel');
        const dock = document.getElementById('vu-dock'), d = dock.shadowRoot.querySelector('nav').getBoundingClientRect();
        const top = document.elementFromPoint(innerWidth - 20, d.top + d.height / 2);
        const kiTile = root.querySelector('.tile[data-group=atlas]'), kiRow = kiTile && [...kiTile.parentElement.children], kiH = kiTile && kiTile.getBoundingClientRect().height;
        return { groups: [...root.querySelectorAll('.tile b')].map((h) => h.textContent),
          kiTile: kiTile && { kicker: kiTile.querySelector('.kicker')?.textContent, h: Math.round(kiH), others: kiRow.filter((n) => n !== kiTile).map((n) => Math.round(n.getBoundingClientRect().height)), cut: [...kiTile.querySelectorAll('b, small, .kicker')].some((n) => n.scrollWidth > n.clientWidth + 1 || n.getBoundingClientRect().right > kiTile.getBoundingClientRect().right + 1) }, links: root.querySelectorAll('.more-links a').length + root.querySelectorAll('.mine a').length,
          locked: document.documentElement.classList.contains('vu-menu-open') && getComputedStyle(document.documentElement).overflow === 'hidden',
          dockInert: dock.inert, dockCovered: top !== dock, scrollable: panel.scrollHeight <= panel.clientHeight || getComputedStyle(panel).overflowY === 'auto',
          panelBottom: panel.getBoundingClientRect().bottom, vh: innerHeight, panelBg: getComputedStyle(panel).backgroundColor,
          moreOpen: root.querySelector('.more').open, hereLinks: root.querySelectorAll('.here-links a').length,
          title: root.querySelector('.uni-title')?.textContent + ' | ' + root.querySelector('.uni-sub')?.textContent, titleVisible: !!root.querySelector('.uni-title')?.getClientRects().length,
          panelTop: panel.getBoundingClientRect().top, panelLeft: panel.getBoundingClientRect().left, panelRight: panel.getBoundingClientRect().right, radius: getComputedStyle(panel).borderTopLeftRadius, grab: !!root.querySelector('.grab').getClientRects().length, vw: innerWidth,
          legal: root.querySelectorAll('.legal-links a').length, note: !!root.querySelector('.legal-note')?.textContent.trim(), settings: root.querySelectorAll('.appearance > *').length + root.querySelectorAll('.currency > *').length,
          icons: [...root.querySelectorAll('.menu-product-icon use')].map(n=>n.getAttribute('href')),
          search: !!root.querySelector('.find input[type=search]') };
      });
      if (!firstMenu) firstMenu = m.groups.join('|') + '#' + m.links;
      else if (m.groups.join('|') + '#' + m.links !== firstMenu) fail(where, 'anderes Menue als auf Discover');
      /* Reihenfolge und KI-Kachel wie das Fenster „Dein Universe“ im Prototyp (App-Konzept 2, build.js T.universe); die KI-Kachel
         heisst seit 16.11.2026 „Vision Universe KI“: Dachzeile „Vision Universe“, Titel „KI“ mit Beta, gleich hoch wie die Nachbarn. */
      if(m.groups.join('|')!=='Discover|Insights|Quant|Fundamental|Technical|Hedgefonds|Elliott|Supertrader|Portfolios|Screener|Vorsorge|KI Beta') fail(where,'Produktraster falsch: '+m.groups.join('|'));
      if(!m.kiTile||m.kiTile.kicker!=='Vision Universe'||m.kiTile.cut||m.kiTile.others.some(h=>Math.abs(h-m.kiTile.h)>1)) fail(where,'Kachel „Vision Universe KI“ falsch: '+JSON.stringify(m.kiTile));
      if(m.moreOpen||!m.hereLinks||!m.search) fail(where,'Menüaufbau falsch: '+JSON.stringify({moreOpen:m.moreOpen,here:m.hereLinks,search:m.search}));
      if(m.title!=='Dein Universe | Alle Module, von jeder Seite aus.'||!m.titleVisible) fail(where,'Überschrift „Dein Universe“ fehlt: '+m.title);
      if(m.legal<5||!m.note||m.settings!==4) fail(where,'Rechtliches oder Einstellungen fehlen im Menü: '+JSON.stringify({legal:m.legal,note:m.note,settings:m.settings}));
      // Bis 760 px ein Sheet von unten (Griff, runde Ecken, hoechstens 90 % hoch, volle Breite), darueber die Seitenleiste rechts.
      if(m.vw<=760?(m.panelTop<m.vh*0.1-1||m.radius!=='30px'||!m.grab||m.panelLeft>1||m.panelRight<m.vw-1):(m.panelTop>1||m.radius!=='0px'||m.grab||m.panelRight<m.vw-1||m.panelLeft<m.vw-441)) fail(where,'Menü hat nicht die Form für diese Breite: '+JSON.stringify({top:m.panelTop,left:m.panelLeft,right:m.panelRight,radius:m.radius,grab:m.grab,vw:m.vw,vh:m.vh}));
      if(m.panelBg!=='rgb(21, 21, 22)') fail(where,'Menü trägt nicht den Bogen des Prototyps (#151516): '+m.panelBg);
      if(m.icons.length!==12||m.icons.some(href=>!href.startsWith('/assets/product-icons.svg#'))) fail(where,'Original Produkticons fehlen');
      await menuOpen(page, where);
      const menuSmall = await smallTargets(page);
      if(menuSmall.length) fail(where,smallText(menuSmall)+' Menüziele kleiner als 44 px');
      if (!m.locked) fail(where, 'keine Scroll-Sperre');
      if (!m.dockInert || !m.dockCovered) fail(where, 'Dock liegt ueber dem Menue oder bleibt fokussierbar');
      if (!m.scrollable || m.panelBottom > m.vh + 1) fail(where, 'Menue nicht scrollbar oder abgeschnitten: ' + JSON.stringify({ scrollable: m.scrollable, bottom: m.panelBottom, vh: m.vh }));
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
      if(!await page.evaluate(()=>{const root=document.querySelector('vu-navigation').shadowRoot;return root.activeElement===root.querySelector('.panel-head .close')})) fail(where,'Tab kehrt nicht zum ersten Menülink zurück');
      if(path==='/quant/#/') await page.screenshot({path:`${out}/menu-expanded-${vpName}.png`});
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('vu-navigation').hasAttribute('open'), null, { timeout: 3000 });
      if (!await menu.evaluate((n) => n.getRootNode().activeElement === n)) fail(where, 'Fokus kehrt nicht zum Universe-Knopf zurueck');
      if (await page.evaluate(() => document.documentElement.classList.contains('vu-menu-open'))) fail(where, 'Scroll-Sperre bleibt');
      // Ein Tipp auf den Hintergrund schliesst ebenfalls.
      await menu.click(); await menuOpen(page, where);
      await page.mouse.click(8, 8);
      if (!await page.waitForFunction(() => !document.querySelector('vu-navigation').hasAttribute('open'), null, { timeout: 3000 }).then(() => true, () => false)) fail(where, 'Tipp auf den Hintergrund schliesst das Menü nicht');
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  /* Zurueck/Vor ueber das Menü im Kopf (Owner 22.11.2026): Knopf oben links → Bereich wählen; der Bereich unter dem Modulnamen folgt
     der Adresse, auch nach Zurück und Vor. Gilt für Hash-Produkte und Seiten-Produkte; die Startseiten zeigen „Start“. */
  const area = (pg) => pg.evaluate(() => document.querySelector('vu-navigation').shadowRoot.querySelector('.world-area').textContent.trim() || null);
  const pick = async (pg, label) => {
    await pg.locator('vu-navigation').locator('button.world').click();
    await pg.waitForFunction(() => document.querySelector('vu-navigation').hasAttribute('areas') && document.querySelector('vu-navigation').hasAttribute('open'), null, { timeout: 5000 });
    await pg.locator('vu-navigation').locator('.areas-list a', { hasText: label }).first().click();
  };
  for (const [start, clicks] of [['/quant/#/screener', ['Aktien', 'Methodik']], ['/vorsorge/#/', ['ETFs', 'Portfolio']], ['/supertrader/strategies/', ['Treffer', 'Forschung']], ['/discover/#/welten', ['Strategien', 'Swipen']], ['/fundamental/#/ranglisten', ['Branchen', 'Methodik']], ['/technical/#/', ['Muster', 'Lernen']], ['/screener/?view=build', ['Treffer', 'Gespeichert']], ['/hedgefonds/#/', ['Investoren', 'Aktien']], ['/elliott/', ['Zählbar', 'Neu']], ['/portfolios/', ['Quant', 'KI']]]) {
    const where = `history ${start} @${vpName}`;
    await fresh();
    try {
      await page.goto(base + start, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const first = await area(page);
      if (!first) fail(where, 'kein Bereich unter dem Modulnamen');
      for (const label of clicks) { await pick(page, label); await settle(page); if (await area(page) !== label) fail(where, 'Bereich ' + label + ' nicht oben links: ' + await area(page)); }
      await page.goBack(); await settle(page);
      if (await area(page) !== clicks[0]) fail(where, 'Zurueck: ' + await area(page));
      await page.goBack(); await settle(page);
      if (await area(page) !== first) fail(where, 'Zurueck zum Start: ' + await area(page));
      await page.goForward(); await settle(page);
      if (await area(page) !== clicks[0]) fail(where, 'Vor: ' + await area(page));
      const shown = await page.evaluate(() => [...document.querySelectorAll('.dp-tabs,.qp-tabs,.tk-tabs,.ek-tabs,.fp-tabs,.pfp-tabs,.vsp-tabs,.stp-tabs,.hp-tabs,.sc-ak-tabs')].filter((n) => n.getClientRects().length && getComputedStyle(n).display !== 'none').length + (document.querySelector('vu-navigation').shadowRoot.querySelector('nav.tabs').hidden ? 0 : 1));
      if (shown) fail(where, shown + ' Reiterleisten sichtbar');
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  await ctx.close();
}
await browser.close();
await writeFile(`${out}/results.json`, JSON.stringify({ checks, findings }, null, 2));
console.log(`Shell-QA: ${checks.length} Pruefungen, ${findings.length} Befunde`);
process.exit(findings.length ? 1 : 0);
