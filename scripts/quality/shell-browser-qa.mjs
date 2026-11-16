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
  ['Discover', '/discover/#/', 'Discover'], ['Discover', '/discover/#/welten', 'Welten'], ['Discover', '/discover/#/strategien', 'Strategien'],
  ['Discover', '/discover/#/swipen', 'Swipen'], ['Discover', '/discover/#/einzeln/US_REAL', 'Swipen'], ['Discover', '/discover/#/maerkte', 'Märkte'], ['Discover', '/discover/#/watchlist', 'Watchlist'],
  ['Quant', '/quant/#/', 'Quant'], ['Quant', '/quant/#/screener', 'Screener'], ['Quant', '/quant/#/stile', 'Anlagestile'],
  ['Quant', '/quant/#/aktien', 'Aktien'], ['Quant', '/quant/#/aktie/NVDA', 'Aktien'], ['Quant', '/quant/#/methodik', 'Methodik'],
  // Elliott: eigenes Produkt; das Aktienbild liegt unter /elliott/#/<T> (alt: /quant/#/elliott/<T>, leitet um), gehoert aber zu Elliott (nur Produktkontext)
  ['Elliott', '/elliott/', 'Elliott'], ['Elliott', '/elliott/#/?zaehlbar=1', 'Zählbar'], ['Elliott', '/elliott/#/?welle=3', 'Zählbar'], ['Elliott', '/elliott/#/?neu=1', 'Neu'], ['Elliott', '/elliott/#/?suche=1', 'Suche'],
  ['Elliott', '/elliott/#/?richtung=ab', 'Abwärts'], ['Elliott', '/elliott/#/NVDA', null], ['Elliott', '/quant/#/elliott/NVDA', null],
  // Fundamental: eigenes Produkt; die Unternehmensseite /fundamental/#/<T> zeigt nur den Produktkontext
  ['Fundamental', '/fundamental/#/', 'Fundamental'], ['Fundamental', '/fundamental/#/ranglisten', 'Ranglisten'], ['Fundamental', '/fundamental/#/branchen', 'Branchen'],
  ['Fundamental', '/fundamental/#/methodik', 'Methodik'], ['Fundamental', '/fundamental/#/NVDA', null],
  // Technical: „Vorlagen“ und „Lernen“ sind eigene Reiter (App-Konzept 2); eine Frage des Assistenten gehoert zu „Lernen“
  ['Technical', '/technical/#/', 'Technical'], ['Technical', '/technical/#/screener', 'Screener'], ['Technical', '/technical/#/muster', 'Muster'],
  ['Technical', '/technical/#/screener?reiter=vorlagen', 'Vorlagen'], ['Technical', '/technical/#/lernen', 'Lernen'], ['Technical', '/technical/#/assistent/trendfolge', 'Lernen'],
  ['Vorsorge', '/vorsorge/#/', 'Vorsorge'], ['Vorsorge', '/vorsorge/#/plan', 'Planer'], ['Vorsorge', '/vorsorge/#/etfs', 'ETFs'],
  ['Vorsorge', '/vorsorge/#/portfolio', 'Portfolio'], ['Vorsorge', '/vorsorge/#/foerderung', 'Förderung'], ['Vorsorge', '/vorsorge/#/monitor', 'Veränderungen'],
  ['Screener', '/screener/', 'Screener'], ['Screener','/screener/?f=roic:gt:0.1','Filter'], ['Screener','/screener/?mode=pro','Filter'], ['Screener', '/screener/?view=build', 'Filter'], ['Screener', '/screener/?view=saved', 'Gespeichert'], ['Screener', '/screener/?view=watchlist', 'Watchlist'],
  ['Supertrader', '/supertrader/', 'Supertrader'], ['Supertrader', '/supertrader/strategies/', 'Methoden'], ['Supertrader', '/supertrader/treffer/', 'Treffer'],
  ['Supertrader', '/supertrader/forschung/', 'Forschung'], ['Supertrader', '/supertrader/sources/', 'Quellen'],
  ['Hedgefonds', '/hedgefonds/#/', 'Hedgefonds'], ['Hedgefonds', '/hedgefonds/#/investoren', 'Investoren'], ['Hedgefonds', '/hedgefonds/#/datenbank', 'Datenbank'], ['Hedgefonds', '/hedgefonds/#/gruppen-kaeufe', 'Gruppen-Käufe'],
  ['Hedgefonds', '/hedgefonds/#/aktien', 'Aktien'],
  // Portfolios: fordert Dock und Reiter wie jedes Produkt an (seit dem Rahmen nach App-Konzept 2)
  ['Portfolios', '/portfolios/', 'Portfolios'], ['Portfolios', '/portfolios/#/quant', 'Quant'], ['Portfolios', '/portfolios/#/ki', 'KI'],
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
async function state(page) {
  return page.evaluate(() => {
    const nav = document.getElementById('vu-dock')?.shadowRoot?.querySelector('nav');
    const head = document.querySelector('vu-navigation')?.shadowRoot;
    const strip = head?.querySelector('nav.tabs');
    if (!nav || !head || !strip || strip.hidden) return null;
    const r = nav.getBoundingClientRect(), t = strip.getBoundingClientRect(), row = head.querySelector('.row').getBoundingClientRect(), bar = head.querySelector('header').getBoundingClientRect();
    const places = [...nav.querySelectorAll('a')], uni = nav.querySelector('button.menu'), links = [...strip.querySelectorAll('a')];
    return {
      labels: links.map((a) => a.textContent.trim()),
      current: links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent.trim()),
      places: places.map((a) => a.textContent.trim()),
      place: places.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent.trim()),
      order: [...nav.children].map((n) => n.tagName).join(''),
      menu: !!uni, uni: uni && { label: uni.getAttribute('aria-label'), w: uni.getBoundingClientRect().width, h: uni.getBoundingClientRect().height, top: uni.getBoundingClientRect().top, icon: !!uni.querySelector('svg g') && !uni.querySelector('svg use') },
      menuIconsDeferred: [...head.querySelectorAll('.menu-product-icon use')].every(n=>!n.hasAttribute('href')&&n.hasAttribute('data-href')),
      dockOriginalInline: !!nav.querySelector('a[data-id=discover] svg g')&&!nav.querySelector('svg use'),
      spriteRequested: performance.getEntriesByType('resource').some(r=>new URL(r.name).pathname==='/assets/product-icons.svg'),
      dock: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width },
      // Reiterzeile: direkt unter der Kopfzeile, innerhalb der Breite, der Inhalt beginnt darunter (kein Ueberdecken)
      strip: { top: t.top, bottom: t.bottom, left: t.left, right: t.right, rowBottom: row.bottom, barBottom: bar.bottom, scrolls: getComputedStyle(strip).overflowX === 'auto',
        reserved: parseFloat(getComputedStyle(document.body).paddingTop), token: getComputedStyle(document.documentElement).getPropertyValue('--vu-navigation-height').trim(), product: document.documentElement.getAttribute('data-vu-tabs'), name: strip.getAttribute('aria-label') },
      activeVisible: links.filter((a) => a.getAttribute('aria-current') === 'page').every((a) => { const b = a.getBoundingClientRect(); return b.left >= t.left - 1 && b.right <= t.right + 1; }),
      toggle: getComputedStyle(head.querySelector('.toggle')).display,
      overflow: document.documentElement.scrollWidth - innerWidth,
      small: [...nav.querySelectorAll('a,button'), ...links].filter((n) => { const b = n.getBoundingClientRect(); return b.width < 44 || b.height < 44; }).length,
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
  for (const [product, path, expected] of ROUTES) {
    const where = `${product} ${path} @${vpName}`;
    await fresh();
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      for (const pass of ['first', 'reload']) {
        if (pass === 'reload') { await page.reload({ waitUntil: 'load' }); await settle(page); }
        /* App-Konzept 2 (Prototyp #discover/#quant, Owner 15.11.2026): der Start traegt seine Reiter im Inhalt
           (<html data-vu-tabs="inhalt">); die Reiterzeile des Rahmens bleibt dort verborgen. Geprueft werden dann Dock,
           Universe-Knopf, die Reiter im Inhalt und der Ueberlauf. */
        const inhalt = await page.evaluate(() => {
          if (document.documentElement.getAttribute('data-vu-tabs') !== 'inhalt') return null;
          const nav = document.getElementById('vu-dock')?.shadowRoot?.querySelector('nav'), strip = document.querySelector('vu-navigation')?.shadowRoot?.querySelector('nav.tabs');
          const places = nav ? [...nav.querySelectorAll('a')] : [], uni = nav && nav.querySelector('button.menu'), ub = uni && uni.getBoundingClientRect();
          const tabs = [...document.querySelectorAll('main [role=tablist] a, main [role=tablist] button, main .dp-tabs .dp-tab, main [class*=tabs] a, main [class*=tabs] button')].filter((n) => n.getClientRects().length);
          return { dock: !!nav, places: places.map((a) => a.textContent.trim()), place: places.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent.trim()),
            uni: !!uni && ub.width >= 56 && ub.height >= 56, stripHidden: !strip || strip.hidden, tabs: tabs.length, overflow: document.documentElement.scrollWidth - innerWidth };
        });
        if (inhalt) {
          if (!inhalt.dock || inhalt.places.join('|') !== DOCK.join('|') || !inhalt.uni) fail(where, 'Dock ist nicht Home · Discover · [Universe] · News · Ich: ' + JSON.stringify(inhalt));
          const place = DOCK_ACTIVE(new URL(page.url()).pathname);
          if ((inhalt.place[0] || null) !== place || inhalt.place.length > 1) fail(where, `Dock: aktiv ${inhalt.place.join('|') || '-'} statt ${place || '-'}`);
          if (!inhalt.stripHidden) fail(where, 'Reiterzeile des Rahmens doppelt zu den Reitern im Inhalt');
          if (inhalt.tabs < 3) fail(where, 'Reiter im Inhalt fehlen: ' + inhalt.tabs);
          if (inhalt.overflow > 1) fail(where, 'horizontaler Ueberlauf ' + inhalt.overflow + ' px');
          continue;
        }
        const s = await state(page);
        if (!s) { fail(where, 'kein Dock oder keine Reiterzeile'); break; }
        if (s.labels[0] !== product || s.strip.name !== product) fail(where, 'erster Reiter ist nicht der Produktname: ' + s.labels[0]);
        if (s.labels.length < 4 || new Set(s.labels).size !== s.labels.length) fail(where, 'Reiterzeile ist nicht [Produkt] + mindestens 3 Bereiche ohne Doppel: ' + s.labels.join('|'));
        if (s.places.join('|') !== DOCK.join('|') || s.order !== 'AABUTTONAA' || !s.menu) fail(where, 'Dock ist nicht Home · Discover · [Universe] · News · Ich: ' + s.places.join('|') + ' ' + s.order);
        const place = DOCK_ACTIVE(new URL(page.url()).pathname);
        if ((s.place[0] || null) !== place || s.place.length > 1) fail(where, `Dock: aktiv ${s.place.join('|') || '-'} statt ${place || '-'}`);
        if (!s.uni || s.uni.label !== 'Alle Module' || !s.uni.icon || s.uni.w < 56 || s.uni.h < 56 || s.uni.top >= s.dock.top) fail(where, 'Universe-Knopf falsch (Name, Symbol, Größe oder nicht über der Leiste): ' + JSON.stringify(s.uni));
        if (Math.abs(s.strip.top - s.strip.rowBottom) > 1 || s.strip.left < 0 || s.strip.right > s.vw + 1 || !s.strip.scrolls) fail(where, 'Reiterzeile nicht direkt unter der Kopfzeile oder nicht in der Breite: ' + JSON.stringify(s.strip));
        if (s.strip.reserved < s.strip.barBottom - 1 || s.strip.token !== Math.round(s.strip.barBottom) + 'px') fail(where, 'Inhalt beginnt nicht unter Kopf und Reitern: ' + JSON.stringify(s.strip));
        if (!s.activeVisible) fail(where, 'aktiver Reiter liegt ausserhalb der Zeile');
        if (!(Array.isArray(expected) ? expected : [expected]).includes(s.current[0] || null) || s.current.length > 1) fail(where, `${pass}: aktiv ${s.current.join('|') || '-'} statt ${[].concat(expected).map((x) => x || '-').join(' oder ')}`);
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
  // Seiten ohne Dock: der Kopf traegt den Menue-Knopf selbst und passt in jede Breite.
  for (const path of ['/news/', '/willkommen/', '/konto/']) {
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
      checks.push({ where, pass: !findings.some((f) => f.where === where) });
    } catch (e) { fail(where, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  // Konto: Einstellungen und Abonnement tragen Dock („Ich“ aktiv) und die Reiter von „Mein Bereich“ („Konto“ aktiv), vom ersten
  // Zeichnen an und ohne dass die Seite sie anfordert; Bestellweg (Tarife, Kündigen), Anmeldung, Registrierung und Passwort
  // bleiben ohne Leiste. Die Konto-API gibt es im statischen Bau nicht: die Prüfung stellt sie unter derselben Herkunft nach
  // (angemeldet auf den Seiten mit Leiste, abgemeldet auf den übrigen), damit die Seite nicht weiterleitet und ihr echter Inhalt
  // steht. Adresse und Antworten der API werden vor den Skripten der Seite im Fenster festgelegt, nicht über abgefangene
  // Netzabrufe: WebKit nimmt /konto/config.js aus seinem Zwischenspeicher und reicht Abrufe über den Service Worker
  // (assets/pwa.js) an der Prüfung vorbei. Geprüft wird der Rahmen: kein Bedienelement liegt am Seitenende unter dem Dock.
  for (const [path, bar] of [['/konto/einstellungen/', true], ['/konto/abo/', true], ['/konto/tarife/', false], ['/konto/kuendigen/', false], ['/konto/anmelden/', false], ['/konto/registrieren/', false], ['/konto/passwort/', false]]) {
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
            : api === '/v1/me' ? { profile: { displayName: 'QA' }, settings: { appearance: 'system', displayCurrency: 'EUR', experienceLevel: 'beginner', notifications: {} }, newsletter: { available: true, status: 'none' }, entitlements: { plan_id: 'free' } }
            : api === '/v1/me/billing' ? { entitlements: { plan_id: 'free' }, billingAvailable: true, subscriptions: [], invoices: [] }
            : api === '/v1/plans' ? { plans: [], prices: [] } : {};
          return Promise.resolve(new Response(JSON.stringify(data), { status: signedIn || api !== '/v1/me' ? 200 : 401, headers: { 'content-type': 'application/json' } }));
        };
      }, bar);
      await page.goto(base + path, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const at = new URL(page.url()).pathname;
      if (at !== path) fail(where, 'Seite hat weitergeleitet nach ' + at);
      const bare = await page.evaluate(() => ({ dock: !!document.getElementById('vu-dock'), tabs: document.documentElement.hasAttribute('data-vu-tabs'), overflow: document.documentElement.scrollWidth - innerWidth }));
      if (bare.overflow > 1) fail(where, 'horizontaler Ueberlauf ' + bare.overflow + ' px');
      if (!bar) { if (bare.dock || bare.tabs) fail(where, 'Leiste auf einer Seite, die ohne Ablenkung bleiben soll: ' + JSON.stringify(bare)); }
      else {
        const s = await state(page);
        if (!s) fail(where, 'kein Dock oder keine Reiterzeile');
        else {
          if (s.labels.join('|') !== 'Mein Bereich|Ich|Gespeichert|Konto' || s.current.join('|') !== 'Konto' || s.strip.name !== 'Mein Bereich') fail(where, 'Reiter falsch: ' + s.labels.join('|') + ' aktiv ' + s.current.join('|'));
          if (s.places.join('|') !== DOCK.join('|') || s.place.join('|') !== 'Ich' || !s.menu) fail(where, 'Dock falsch: ' + s.places.join('|') + ' aktiv ' + s.place.join('|'));
          if (Math.abs(s.strip.top - s.strip.rowBottom) > 1 || s.strip.reserved < s.strip.barBottom - 1) fail(where, 'Inhalt beginnt nicht unter Kopf und Reitern: ' + JSON.stringify(s.strip));
          if (s.toggle !== 'none') fail(where, 'Menue-Knopf im Kopf doppelt');
          if (s.small) fail(where, s.small + ' Ziele kleiner als 44 px');
          if (s.dock.left < 0 || s.dock.right > s.vw || s.dock.bottom > s.vh) fail(where, 'Leiste ausserhalb ihres Platzes ' + JSON.stringify(s.dock));
          const end = await page.evaluate(() => {
            scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' });
            const dockTop = document.getElementById('vu-dock').shadowRoot.querySelector('nav').getBoundingClientRect().top;
            const controls = [...document.querySelectorAll('main a, main button, main input, main select')].filter((n) => n.getClientRects().length);
            const last = controls.at(-1), r = last && last.getBoundingClientRect(), hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { dockTop, controls: controls.length, forms: document.querySelectorAll('main form, main .ka-kv').length, bottom: r && r.bottom, reachable: !!hit && (hit === last || last.contains(hit) || hit.contains(last)), label: last && (last.textContent || last.id).trim().slice(0, 30) };
          });
          if (!end.forms) fail(where, 'Inhalt der Seite steht nicht (nachgestellte Konto-API): ' + JSON.stringify(end));
          if (!end.controls || end.bottom > end.dockTop + 1 || !end.reachable) fail(where, 'letztes Bedienelement am Seitenende verdeckt: ' + JSON.stringify(end));
        }
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
      if (after.dock !== 'rgba(12, 12, 13, 0.92)') fail(where, 'Leiste verliert ihre Flaeche (Prototyp .dock): ' + after.dock);
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
        return { groups: [...root.querySelectorAll('.tile b')].map((h) => h.textContent), links: root.querySelectorAll('.more-links a').length + root.querySelectorAll('.mine a').length,
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
      /* Reihenfolge und Atlas-Kachel wie das Fenster „Dein Universe“ im Prototyp (App-Konzept 2, build.js T.universe). */
      if(m.groups.join('|')!=='Discover|Insights|Quant|Fundamental|Technical|Hedgefonds|Elliott|Supertrader|Portfolios|Screener|Vorsorge|Atlas') fail(where,'Produktraster falsch: '+m.groups.join('|'));
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
  // Zurueck/Vor ueber die Reiter (Hash-Produkte und Seiten-Produkte).
    // Discover- und Quant-Start tragen ihre Reiter im Inhalt (App-Konzept 2); der Weg ueber die Rahmen-Reiter beginnt auf einem Unterbereich.
  for (const [start, clicks] of [['/quant/#/screener', ['Aktien', 'Methodik']], ['/vorsorge/#/', ['ETFs', 'Portfolio']], ['/supertrader/', ['Treffer', 'Forschung']], ['/discover/#/welten', ['Strategien', 'Swipen']]]) {
    const where = `history ${start} @${vpName}`;
    await fresh();
    try {
      await page.goto(base + start, { waitUntil: 'load', timeout: 90000 }); await settle(page);
      const first = (await state(page)).current[0];
      for (const label of clicks) { await page.locator('vu-navigation nav.tabs a', { hasText: label }).first().click(); await settle(page); if ((await state(page)).current[0] !== label) fail(where, 'Klick ' + label + ' markiert nicht'); }
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
