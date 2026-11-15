import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/* Gemeinsame Vision-Universe-Shell (assets/site-navigation.js), Rahmen nach App-Konzept 2 (Owner 14.11.2026):
   EIN Dock auf jeder Seite mit Leiste – Home · Discover · [Universe] · News · Ich –, die Bereiche eines Produkts als
   Reiterzeile unter dem Kopf ([PRODUKT] [Funktion] [Funktion] [Funktion] der frueheren Produkt-Leiste, danach die
   uebrigen Eintraege der Menueliste „In <Welt>“) und das Menue als Sheet „Dein Universe“.
   Dock und Reiter sind Opt-in; diese Tests sichern Konfiguration, Routen, aktive
   Zustaende und Gestaltung unabhaengig von den einzelnen Produkten. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(root, 'assets/site-navigation.js'), 'utf8');
const sandbox = { HTMLElement: class {}, URL, URLSearchParams, customElements: { define() {} } };
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.__nav = { styles, THEMES, PRODUCTS, dockStyles, groups, routeScore, menuState, productIcon, DOCK_PRODUCT_ICONS, dockProductIcon, DOCK, dockActive, dockPage, tabEntries, tabActive, dockIcons, worldOf, menuGroups, themeWanted, stockSheet, isoDate };})();'), sandbox);
const { styles, THEMES, PRODUCTS, dockStyles, groups, routeScore, menuState, productIcon, DOCK_PRODUCT_ICONS, dockProductIcon, DOCK, dockActive, dockPage, tabEntries, tabActive, dockIcons, worldOf, menuGroups, themeWanted, stockSheet, isoDate } = sandbox.__nav;

const loc = (url) => { const u = new URL(url, 'https://research.visionuniverse.de'); return { pathname: u.pathname, hash: u.hash, search: u.search }; };

test('the former dock places of every product start with the product name, never Home or Start, and stay four entries', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(PRODUCTS.map(p => [p.id, p.items.map(([, label]) => label)]))), [
    ['discover', ['Discover','Welten','Strategien','Swipen']],
    ['elliott', ['Elliott','Zählbar','Neu','Suche']],
    ['quant', ['Quant','Screener','Anlagestile','Aktien']], /* Konzept Quant 2026-11, Entscheidung 3 */
    ['fundamental', ['Fundamental','Ranglisten','Branchen','Methodik']],
    ['technical', ['Technical','Screener','Chart','Muster']],
    ['vorsorge', ['Vorsorge','Planer','ETFs','Portfolio']],
    ['screener', ['Screener','Filter','Treffer','Gespeichert']],
    ['supertrader', ['Supertrader','Methoden','Treffer','Forschung']],
    ['hedgefonds', ['Hedgefonds','Investoren','Aktien','Gruppen-Käufe']],
    ['portfolios', ['Portfolios','Supertrader','Quant','KI']],
    ['mein', ['Mein Bereich','Ich','Gespeichert','Konto']] /* Reiter „Ich“ = Platz „Ich“ im Dock (vorher „Watchlist“) */
  ]);
  for (const p of PRODUCTS) {
    assert.equal(p.items[0][1], p.label);
    assert.ok(!/^(home|start)$/i.test(p.items[0][1]));
    // Der Produkteintrag fuehrt zur Startseite des Produkts
    assert.equal(p.active(loc(p.items[0][2])), p.items[0][0], `${p.id}: Startseite aktiviert den Produkteintrag`);
    for (const [id, , href] of p.items) assert.equal(p.active(loc(href)), id, `${p.id}: ${href} aktiviert ${id}`);
  }
  // Der Universe-Knopf im Dock oeffnet das globale Menue derselben Komponente, kein Produktmenue
  assert.match(source, /menu\.onclick=\(\)=>this\.openMenu\(menu\)/);
});

test('one global dock on every page with a dock: Home, Discover, Universe button, News, Ich', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(DOCK)), [['home','Home','/willkommen/','home'],['discover','Discover','/discover/#/','discover'],['news','News','/insights/','insights'],['ich','Ich','/mein-dashboard/','person']]);
  const files = { '/willkommen/': 'willkommen/index.html', '/discover/': 'discover/index.html', '/insights/': 'insights/index.html', '/mein-dashboard/': 'mein-dashboard/index.html' };
  for (const [, , href, icon] of DOCK) {
    assert.match(readFileSync(join(root, files[new URL(href, 'https://x').pathname]), 'utf8'), /\/assets\/site-navigation\.js/, href + ' laedt die Shell');
    assert.ok(DOCK_PRODUCT_ICONS[icon] || dockIcons[icon], icon + ': Symbol ohne Sprite-Abruf');
    assert.doesNotMatch(dockProductIcon(icon), /use|href/);
  }
  // Zwei Plaetze links, der runde Knopf in der Mitte, zwei rechts; der Knopf traegt das Ebenen-Symbol und heisst „Alle Module“
  assert.match(source, /const links=DOCK\.slice\(0,2\)\.map\(place\);/);
  assert.match(source, /links\.push\(\.\.\.DOCK\.slice\(2\)\.map\(place\)\);/);
  assert.match(source, /menu\.className='menu uni'/);
  assert.match(source, /menu\.setAttribute\('aria-label','Alle Module'\)/);
  assert.match(source, /menu\.innerHTML=dockProductIcon\('layers'\)/);
  assert.match(source, /if\(b!==this\.dockMenuButton&&b!==world\)b\.setAttribute\('aria-label'/, 'der Name des Universe-Knopfs bleibt „Alle Module“, der des Welten-Wechslers auch');
  // Aktiv nach Ort; in den uebrigen Produkten ist kein Platz aktiv
  const on = url => dockActive(loc(url));
  assert.equal(on('/willkommen/'), 'home');
  assert.equal(on('/discover/#/welten'), 'discover');
  assert.equal(on('/insights/'), 'news');
  assert.equal(on('/insights/reports/'), 'news');
  assert.equal(on('/mein-dashboard/#/gespeichert'), 'ich');
  assert.equal(on('/konto/'), 'ich');
  assert.equal(on('/konto/watchlist/'), 'ich');
  for (const url of ['/quant/', '/quant/#/screener', '/technical/#/', '/fundamental/#/', '/supertrader/treffer/', '/hedgefonds/', '/elliott/', '/screener/', '/vorsorge/#/', '/portfolios/']) assert.equal(on(url), null, url);
  // Das Dock haengt wie bisher an der Anforderung der Seite und an no-dock; ausserhalb der Produkte traegt es nur Insights (dockPage)
  assert.match(source, /const product=PRODUCTS\.find\(p=>p\.match\(location\.pathname,location\)\),id=product\?product\.id:dockPage\(location\)\?'page':null;\n      if\(!id\|\|this\.hasAttribute\('no-dock'\)\|\|document\.getElementById\('vu-dock'\)\)return;/);
  assert.match(source, /host\.id='vu-dock'/);
  assert.match(source, /document\.documentElement\.setAttribute\('data-vu-dock',id\)/);
});

/* Der Platz „News“ fuehrt nach /insights/. Dort (Artikel, Aktienmagazin, Reports und jede Unterseite) steht das Dock mit
   aktivem „News“; die Seiten fordern es im erzeugten Seitenkopf an (products/insights/build.mjs). Insights ist kein Produkt
   mit Reiterzeile: die Seiten tragen ihre eigenen Reiter im Inhalt. Portfolios fordert Dock und Reiter wie jedes Produkt an. */
test('Insights and Portfolios carry the dock: News leads to a page with the global navigation', () => {
  for (const url of ['/insights/', '/insights/magazin/', '/insights/magazin/nr-01/', '/insights/reports/', '/insights/nvidia-huang-untersuchung/']) {
    assert.equal(dockPage(loc(url)), true, url);
    assert.equal(dockActive(loc(url)), 'news', url);
    assert.equal(PRODUCTS.filter(p => p.match(loc(url).pathname, loc(url))).length, 0, url + ': kein Produkt, keine Reiterzeile der Shell');
  }
  for (const url of ['/news/', '/', '/konto/anmelden/', '/konto/abo/', '/preise/', '/infos/', '/dashboard/']) assert.equal(dockPage(loc(url)), false, url);
  // Jede erzeugte Insights-Seite laedt die Shell und fordert danach das Dock an; der Erzeuger schreibt die Zeile
  const request = '<script src="/assets/site-navigation.js"></script><script>if(window.VUNavigation)window.VUNavigation.dock({});</script>';
  assert.ok(readFileSync(join(root, 'products/insights/build.mjs'), 'utf8').includes(request), 'products/insights/build.mjs');
  const pages = [];
  const walk = dir => { for (const e of readdirSync(join(root, dir), { withFileTypes: true })) { if (e.isDirectory()) walk(dir + '/' + e.name); else if (e.name === 'index.html') pages.push(dir + '/index.html'); } };
  walk('insights');
  assert.ok(pages.length >= 10, pages.length + ' Insights-Seiten');
  for (const page of pages) { const html = readFileSync(join(root, page), 'utf8'); assert.ok(html.includes(request), page + ' fordert das Dock an'); assert.doesNotMatch(html, /<vu-navigation[^>]*no-dock/, page); }
  // Der Fuss der Seiten laesst dem Dock den Platz ueber body (--vu-dock-space), nicht doppelt
  assert.match(readFileSync(join(root, 'insights/insights.css'), 'utf8'), /html\[data-vu-dock\] \.in-fuss\{padding-bottom:24px\}/);
  // Portfolios: Produkt mit Reitern, fordert die Leiste beim Start an (frueh, kein late)
  const portfolios = PRODUCTS.find(p => p.id === 'portfolios');
  assert.equal(portfolios.late, undefined);
  assert.match(readFileSync(join(root, 'portfolios/portfolios.js'), 'utf8'), /if \(root\.VUNavigation\) root\.VUNavigation\.dock\(\{\}\);/);
  assert.match(readFileSync(join(root, 'portfolios/portfolios.css'), 'utf8'), /html\[data-vu-dock\] \.pf\{padding-bottom:24px\}/);
});

test('product tabs: former dock places first, then the remaining entries of the menu group, each destination once', () => {
  const labels = id => Array.from(tabEntries(PRODUCTS.find(p => p.id === id)), e => e.label);
  assert.deepEqual(labels('discover'), ['Discover','Welten','Strategien','Swipen','Suchen','Märkte','Watchlist']);
  assert.deepEqual(labels('quant'), ['Quant','Screener','Anlagestile','Aktien','Meldungen','Forschung','Methodik','Technische Lagen','Fundamentaldaten']);
  assert.deepEqual(labels('technical'), ['Technical','Screener','Chart','Muster','Vorlagen','Gespeichert','Lernen']);
  assert.deepEqual(labels('fundamental'), ['Fundamental','Ranglisten','Branchen','Methodik','Suchen']);
  assert.deepEqual(labels('supertrader'), ['Supertrader','Methoden','Treffer','Forschung','Quellen']);
  assert.deepEqual(labels('hedgefonds'), ['Hedgefonds','Investoren','Aktien','Gruppen-Käufe','Datenbank']);
  assert.deepEqual(labels('elliott'), ['Elliott','Zählbar','Neu','Suche','Aufwärts','Abwärts']);
  assert.deepEqual(labels('screener'), ['Screener','Filter','Treffer','Gespeichert','Watchlist']);
  assert.deepEqual(labels('vorsorge'), ['Vorsorge','Planer','ETFs','Portfolio','Vergleichen','Förderung','Veränderungen','Wissen']);
  assert.deepEqual(labels('portfolios'), ['Portfolios','Supertrader','Quant','KI']);
  assert.deepEqual(labels('mein'), ['Mein Bereich','Ich','Gespeichert','Konto']);
  const key = href => { const u = new URL(href, 'https://x'); return u.pathname + u.search + (/^#\/?$/.test(u.hash) ? '' : u.hash); };
  for (const p of PRODUCTS) {
    const tabs = tabEntries(p), group = groups.find(g => g.id === p.id);
    // Die frueheren Leistenplaetze stehen vorn, in ihrer Reihenfolge, mit ihrer id, ihrem Ziel und ihrem Namen
    assert.deepEqual(JSON.parse(JSON.stringify(tabs.slice(0, p.items.length).map(e => [e.id, e.label, e.href, e.name]))), JSON.parse(JSON.stringify(p.items.map(([id, label, href, , name]) => [id, label, href, name]))));
    // Nichts geht verloren: jedes Ziel der alten Leiste und der Liste „In <Welt>“ ist ein Reiter
    const reachable = new Set(tabs.map(e => key(e.href)));
    for (const [, , href] of p.items) assert.ok(reachable.has(key(href)), p.id + ': ' + href);
    for (const [, href] of group ? group.entries : []) assert.ok(reachable.has(key(href)), p.id + ': ' + href);
    // Jedes Ziel genau einmal (/quant/ und /quant/#/ sind dieselbe Seite); Reiter aus der Menuegruppe tragen keine id
    assert.equal(reachable.size, tabs.length, p.id + ': kein doppeltes Ziel');
    for (const e of tabs.slice(p.items.length)) { assert.equal(e.id, null); assert.ok(group.entries.some(([label, href]) => label === e.label && href === e.href)); }
  }
});

test('the active tab is the tab of the current page: a tab from the menu group where the menu marks it, else the old dock logic', () => {
  const active = (id, url, state) => { const p = PRODUCTS.find(x => x.id === id), l = { ...loc(url), href: url }, t = tabActive(p, tabEntries(p), l, state); return t && t.label; };
  // Leistenplaetze: product.active wie bisher
  assert.equal(active('quant', '/quant/'), 'Quant');
  assert.equal(active('quant', '/quant/#/screener/profi'), 'Screener');
  assert.equal(active('quant', '/quant/#/aktie/AAPL/technik'), 'Aktien');
  assert.equal(active('discover', '/discover/#/thema/ki'), 'Welten');
  assert.equal(active('discover', '/discover/#/s/US_REAL/NVDA'), null, 'Aktienseite: kein Reiter aktiv, wie bisher kein Leistenplatz');
  assert.equal(active('vorsorge', '/vorsorge/etf/IWR/'), 'ETFs');
  assert.equal(active('screener', '/screener/?f=pe'), 'Filter');
  assert.equal(active('supertrader', '/supertrader/stock/NVDA/'), 'Treffer');
  assert.equal(active('elliott', '/elliott/#/NVDA'), null);
  assert.equal(active('mein', '/mein-dashboard/#/gespeichert'), 'Gespeichert');
  assert.equal(active('mein', '/konto/'), 'Konto');
  // Konto-Unterseiten gehoeren zum Reiter „Konto“; /mein-dashboard/ heisst im Reiter wie im Dock „Ich“
  assert.equal(active('mein', '/konto/einstellungen/'), 'Konto');
  assert.equal(active('mein', '/konto/abo/'), 'Konto');
  assert.equal(active('mein', '/mein-dashboard/'), 'Ich');
  assert.equal(active('mein', '/konto/watchlist/'), 'Ich');
  // Vom Produkt gemeldeter Bereich: nur fuer die Adresse, zu der er gemeldet wurde
  assert.equal(active('supertrader', '/supertrader/stock/NVDA/', { active: null, activeAt: '/supertrader/stock/NVDA/' }), null);
  assert.equal(active('supertrader', '/supertrader/stock/NVDA/', { active: null, activeAt: '/supertrader/' }), 'Treffer');
  assert.equal(active('screener', '/screener/', { active: 'treffer', activeAt: '/screener/' }), 'Treffer');
  // Reiter aus der Menuegruppe: aktiv, wo das Menue sie als aktuelle Seite markiert; dann genau dieser eine. In der Leiste mit
  // vier Plaetzen lagen diese Seiten bei einem Nachbarn (Methodik bei „Quant“, Datenbank bei „Investoren“) oder hatten keinen Platz.
  assert.equal(active('quant', '/quant/#/methodik/faktoren'), 'Methodik');
  assert.equal(active('quant', '/quant/#/meldungen'), 'Meldungen');
  assert.equal(active('quant', '/quant/#/forschung'), 'Forschung');
  assert.equal(active('quant', '/quant/#/chartlagen'), 'Technische Lagen');
  assert.equal(active('quant', '/quant/methodology/'), 'Methodik', 'alte Adresse');
  assert.equal(active('technical', '/technical/#/screener/gespeichert'), 'Gespeichert');
  assert.equal(active('technical', '/technical/#/screener?muster=dreieck'), 'Screener');
  // Technical „Lernen“ und „Vorlagen“ (App-Konzept 2): eigene Reiter; Lektionen, Fragen und einzelne Vorlagen markieren ihren Bereich
  assert.equal(active('technical', '/technical/#/lernen'), 'Lernen');
  assert.equal(active('technical', '/technical/#/akademie/kerzen'), 'Lernen');
  assert.equal(active('technical', '/technical/#/assistent/trend?k=1'), 'Lernen');
  assert.equal(active('technical', '/technical/#/screener?reiter=vorlagen'), 'Vorlagen');
  assert.equal(active('technical', '/technical/#/vorlagen/trend-pullback'), 'Vorlagen');
  assert.equal(active('technical', '/technical/#/screener?reiter=gespeichert'), 'Gespeichert', 'zweite Adresse desselben Reiters');
  assert.equal(active('technical', '/technical/#/screener'), 'Screener');
  assert.equal(active('technical', '/technical/#/muster'), 'Muster');
  assert.equal(active('technical', '/technical/#/chart/NVDA'), 'Chart');
  assert.equal(active('fundamental', '/fundamental/#/suche'), 'Suchen');
  assert.equal(active('supertrader', '/supertrader/sources/'), 'Quellen');
  assert.equal(active('hedgefonds', '/hedgefonds/#/datenbank'), 'Datenbank');
  assert.equal(active('hedgefonds', '/hedgefonds/#/fonds/berkshire'), 'Datenbank', 'ein Fonds gehoert zur Datenbank, wie im Menue');
  assert.equal(active('elliott', '/elliott/#/?richtung=ab'), 'Abwärts');
  assert.equal(active('screener', '/screener/?view=watchlist'), 'Watchlist');
  assert.equal(active('vorsorge', '/vorsorge/#/foerderung'), 'Förderung');
  assert.equal(active('vorsorge', '/vorsorge/#/monitor'), 'Veränderungen');
  assert.equal(active('discover', '/discover/#/maerkte'), 'Märkte');
  assert.equal(active('discover', '/discover/#/watchlist'), 'Watchlist');
  // Der eigene Reiter gilt auch, wenn das Produkt fuer diese Adresse einen Nachbarplatz meldet (kein Springen nach dem Laden)
  assert.equal(active('quant', '/quant/#/methodik', { active: 'quant', activeAt: '/quant/#/methodik' }), 'Methodik');
  assert.equal(active('vorsorge', '/vorsorge/#/foerderung', { active: 'plan', activeAt: '/vorsorge/#/foerderung' }), 'Förderung');
  assert.equal(active('hedgefonds', '/hedgefonds/#/datenbank', { active: 'investoren', activeAt: '/hedgefonds/#/datenbank' }), 'Datenbank');
  assert.equal(active('screener', '/screener/?view=watchlist', { active: 'gespeichert', activeAt: '/screener/?view=watchlist' }), 'Watchlist');
  // Ohne eigenen Reiter bleibt die Zuordnung der Leiste (auch die vom Produkt gemeldete)
  assert.equal(active('quant', '/quant/#/aktie/JPM/zahlen'), 'Aktien');
  assert.equal(active('quant', '/quant/#/vergleich/NVDA,MSFT'), 'Aktien');
  assert.equal(active('vorsorge', '/vorsorge/#/riester', { active: 'etfs', activeAt: '/vorsorge/#/riester' }), 'ETFs');
  assert.equal(active('vorsorge', '/vorsorge/#/xray'), 'Portfolio');
  // Der Menueeintrag „Fundamentaldaten“ fuehrt auf die Zahlen einer Aktie (NVDA); dort markiert er sich wie im Menue selbst
  assert.equal(active('quant', '/quant/#/aktie/NVDA/zahlen', { active: 'aktien', activeAt: '/quant/#/aktie/NVDA/zahlen' }), 'Fundamentaldaten');
  // Jede Seite eines Reiters markiert genau diesen Reiter
  for (const p of PRODUCTS) for (const e of tabEntries(p)) { const t = tabActive(p, tabEntries(p), { ...loc(e.href), href: e.href }, {}); assert.equal(t && t.label, e.label, p.id + ' ' + e.href); }
  // Klick: dasselbe abbrechbare Ereignis mit demselben Inhalt wie beim frueheren Leistenplatz; Ziele und Trefferzahl wie bisher
  assert.match(source, /new CustomEvent\('vu-dock-navigate',\{cancelable:true,detail:\{product:product\.id,id:entry\.id,href:a\.getAttribute\('href'\)\}\}\)/);
  assert.match(source, /if\(!document\.dispatchEvent\(intent\)\)event\.preventDefault\(\);/);
  assert.match(source, /if\(id&&state\.hrefs&&state\.hrefs\[id\]\)a\.setAttribute\('href',state\.hrefs\[id\]\);/);
  assert.match(source, /badge\.textContent=value>999\?'999\+':String\(value\)/);
  assert.match(source, /const tabActive = \(product, entries, loc, state\) =>/);
  assert.match(source, /if \(own\) return own;/, 'der eigene Reiter zuerst');
});

test('dock targets are existing routes of their products', () => {
  const files = { '/elliott/': 'elliott/index.html', '/discover/': 'discover/index.html', '/quant/': 'quant/index.html', '/vorsorge/': 'vorsorge/index.html', '/screener/': 'screener/index.html',
    '/supertrader/': 'supertrader/index.html', '/supertrader/strategies/': 'supertrader/strategies/index.html', '/supertrader/treffer/': 'supertrader/treffer/index.html',
    '/supertrader/forschung/': 'supertrader/forschung/index.html', '/hedgefonds/': 'hedgefonds/index.html', '/fundamental/': 'fundamental/index.html', '/technical/': 'technical/index.html',
    '/willkommen/': 'willkommen/index.html', '/mein-dashboard/': 'mein-dashboard/index.html', '/konto/': 'konto/index.html', '/portfolios/': 'portfolios/index.html' };
  for (const p of PRODUCTS) for (const [, , href] of p.items) {
    const path = new URL(href, 'https://x').pathname;
    assert.ok(files[path], `${href}: unbekannte Seite`);
    assert.match(readFileSync(join(root, files[path]), 'utf8'), /\/assets\/site-navigation\.js/, `${files[path]} laedt die Shell`);
  }
  // Elliott-Dock-Ziele sind Hash-Zustaende der Startseite, die elliott/app.js (VUElliottHome.parseHash) wirklich liest
  const elliottModel = readFileSync(join(root, 'elliott/engine/home-model.js'), 'utf8');
  for (const k of ['zaehlbar', 'welle', 'neu', 'suche']) assert.ok(elliottModel.includes(`params.get("${k}")`), `Elliott liest ${k}`);
  const quantRoutes = readFileSync(join(root, 'quant/app/app.js'), 'utf8');
  for (const r of ['screener', 'strategien', 'aktien']) assert.match(quantRoutes, new RegExp(`case "${r}"`));
  const vorsorge = ['plan', 'etf', 'portfolio'].map(f => readFileSync(join(root, `vorsorge/ui/${f}.js`), 'utf8')).join('\n');
  for (const r of ['plan', 'etfs', 'portfolio']) assert.match(vorsorge, new RegExp(`VS\\.views\\.${r} = function`), `Vorsorge-Ansicht ${r}`);
  const hedge = readFileSync(join(root, 'hedgefonds/app.js'), 'utf8');
  for (const r of ['investoren', 'aktien', 'gruppen-kaeufe']) assert.ok(hedge.includes(`#/${r}`));
  // Fundamental-Dock-Ziele sind Routen, die fundamental/engine/model.js (parseRoute) wirklich kennt
  const fundamentalModel = require(join(root, 'fundamental/engine/model.js'));
  assert.deepEqual(fundamentalModel.parseRoute('#/entdecken'), { view: 'home', focus: 'entdecken' });
  assert.deepEqual(fundamentalModel.parseRoute('#/suche'), { view: 'home', focus: 'suche' });
  assert.deepEqual(fundamentalModel.parseRoute('#/methodik'), { view: 'method' });
  assert.match(readFileSync(join(root, 'fundamental/app.js'), 'utf8'), /VUNavigation\.dock\(\{\}\)/, 'Fundamental fordert die Leiste an');
  // Technical-Dock-Ziele sind Routen, die technical/engine/model.js (parseRoute) wirklich kennt
  const technicalModel = require(join(root, 'technical/engine/model.js'));
  assert.equal(technicalModel.parseRoute('#/').view, 'home');
  assert.equal(technicalModel.parseRoute('#/screener').view, 'screener');
  assert.deepEqual(technicalModel.parseRoute('#/chart'), { view: 'chart', ticker: null, params: {} });
  assert.equal(technicalModel.parseRoute('#/methodik').view, 'method');
  assert.match(readFileSync(join(root, 'technical/app.js'), 'utf8'), /VUNavigation\.dock\(/, 'Technical fordert die Leiste an');
  const screener = readFileSync(join(root, 'screener/app.js'), 'utf8');
  for (const v of ['build', 'results', 'saved']) assert.ok(screener.includes(`${v}: view`) || screener.includes(`'${v}'`), v);
});

test('active dock state follows deep links after reload', () => {
  const active = (id, url) => PRODUCTS.find(p => p.id === id).active(loc(url));
  assert.equal(active('discover', '/discover/#/thema/ki'), 'welten');
  assert.equal(active('discover', '/discover/#/s/US_REAL/NVDA'), null);
  assert.equal(active('quant', '/quant/#/screener/profi'), 'screener');
  assert.equal(active('quant', '/quant/#/aktie/NVDA/technik'), 'aktien');
  /* Q00: Methodik gehoert zum Start „Quant“, Technische Lagen zu „Aktien“. */
  assert.equal(active('quant', '/quant/#/methodik'), 'quant');
  assert.equal(active('quant', '/quant/#/chartlagen'), 'aktien');
  assert.equal(active('quant', '/quant/screener/'), 'screener');
  assert.equal(active('vorsorge', '/vorsorge/etf/IWR/'), 'etfs');
  assert.equal(active('vorsorge', '/vorsorge/#/etf/IWDA'), 'etfs');
  assert.equal(active('vorsorge', '/vorsorge/#/xray'), 'portfolio');
  assert.equal(active('vorsorge', '/vorsorge/#/foerderung'), null);
  assert.equal(active('screener', '/screener/?view=build&f=pe'), 'filter');
  assert.equal(active('screener', '/screener/?f=pe'), 'filter', 'Filter in der Adresse: der Filterbereich ist aktiv');
  assert.equal(active('screener', '/screener/'), 'screener');
  assert.equal(active('screener', '/screener/?view=watchlist'), 'gespeichert', 'Watchlist ist ein Reiter unter Gespeichert');
  assert.equal(active('hedgefonds', '/hedgefonds/#/gruppen-kaeufe'), 'gruppen');
  assert.equal(active('hedgefonds', '/hedgefonds/#/smart-money'), 'gruppen', 'alte Adresse markiert Gruppen-Käufe');
  assert.equal(active('hedgefonds', '/hedgefonds/#/datenbank'), 'investoren', 'Datenbank ist ein Reiter unter Investoren');
  assert.equal(active('screener', '/screener/?view=compare'), 'treffer');
  assert.equal(active('supertrader', '/supertrader/stock/NVDA/'), 'treffer');
  assert.equal(active('supertrader', '/supertrader/signals/'), 'treffer');
  assert.equal(active('supertrader', '/supertrader/forschung/'), 'forschung');
  assert.equal(active('supertrader', '/supertrader/strategies/darvas-boxes/'), 'methoden');
  assert.equal(active('supertrader', '/supertrader/sources/'), null);
  assert.equal(active('hedgefonds', '/hedgefonds/#/aktie/037833100'), 'aktien');
  assert.equal(active('hedgefonds', '/hedgefonds/#/fonds/berkshire'), null);
});

test('the dock respects safe areas, keeps touch targets and sits below overlays and the menu', () => {
  assert.match(dockStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(dockStyles, /nav\{[^}]*display:flex;align-items:center;[^}]*height:68px/, 'vier gleich breite Plaetze um den Knopf in der Mitte');
  assert.match(dockStyles, /a\{flex:1 1 0;/);
  assert.match(dockStyles, /nav\{[^}]*border-radius:28px;background:rgba\(12,12,13,\.92\);[^}]*backdrop-filter:blur\(16px\);border:1px solid rgba\(255,255,255,\.14\)/, 'Leiste wie im Prototyp (shell.js .dock)');
  assert.match(dockStyles, /a\[aria-current=page\],a\[aria-current=page\]:hover\{color:#c8f531\}/, 'aktiver Platz in Lime (App-Konzept 2)');
  // Universe-Knopf: rund, 62px, lime, ueber der Leiste
  assert.match(dockStyles, /\.uni\{flex:none;width:62px;height:62px;margin:-22px 6px 0;[^}]*border-radius:99px;background:#c8f531;color:#101318;box-shadow:0 0 0 6px #000,0 8px 30px rgba\(200,245,49,\.35\)\}/);
  assert.match(dockStyles, /a\{flex:1 1 0;gap:3px;min-width:0;height:56px;[^}]*color:#a1a7af;font-size:10\.5px;font-weight:700/);
  assert.match(dockStyles, /z-index:900/);
  assert.match(dockStyles, /:focus-visible/);
  assert.match(dockStyles, /prefers-reduced-motion/);
  assert.match(styles(THEMES.light), /z-index:1000000/);
  const css = readFileSync(join(root, 'assets/site-navigation.css'), 'utf8');
  assert.match(css, /html\[data-vu-dock\] body\{padding-bottom:var\(--vu-dock-space\)/);
  assert.match(css, /--vu-dock-space:calc\([^;]*env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /html\.vu-menu-open/);
  // Reiterzeile: Platz im Dokument (nichts liegt unter Kopf und Reitern), 44px-Ziele, sichtbarer Fokus
  assert.match(css, /:root\{--vu-navigation-height:64px\}/);
  assert.match(css, /html\[data-vu-tabs\]\{--vu-navigation-height:116px\}/);
  assert.match(css, /@media\(max-width:760px\)\{html\[data-vu-tabs\]\{--vu-navigation-height:108px\}\}/);
  assert.match(css, /body\{padding-top:var\(--vu-navigation-height\)!important\}/);
  for (const t of [THEMES.light, THEMES.dark]) {
    const st = styles(t);
    assert.match(st, /\.tabs\{[^}]*overflow-x:auto;[^}]*padding:8px max\(24px,calc\(\(100% - 1240px\)\/2\)\)\}/, 'waagerecht rollbar, am Inhaltsrand ausgerichtet');
    assert.match(st, /\.tab\{position:relative;flex:none;display:inline-flex;align-items:center;height:44px;margin-block:-4px;/, 'Pille 36 px wie im Prototyp, Tippfläche 44 px ohne Versatz');
    assert.match(st, /\.tab \.pill\{[^}]*height:36px;/);
    assert.ok(st.includes(`.tab[aria-current=page] .pill{background:${t.on};color:${t.onInk};`), 'aktiver Reiter: weiß auf dunkel (Prototyp .tab.on), schwarz auf hell');
    assert.match(st, /\.tab:focus-visible \.pill\{outline:2px solid /);
  }
  assert.match(source, /<nav class="tabs" hidden><\/nav><\/header>/, 'Reiterzeile im festen Kopf, direkt unter der Kopfzeile');
  assert.match(source, /html\.setAttribute\('data-vu-tabs',this\.tabsFor\)/);
  // Kopf nach Prototyp: Welten-Wechsler links, „i“, Datenstand, Suche, Profil rechts
  assert.match(styles(THEMES.light), /:host\(\[dock\]\) \.quick,:host\(\[dock\]\) \.toggle\{display:none\}/);
  assert.match(source, /class="world mod" type="button" hidden/);
  assert.match(source, /class="hb search" href="\/discover\/#\/suche"/);
  assert.match(source, /class="hb profile" href="\/mein-dashboard\/"/);
});

test('the dock is opt-in: pages that never call VUNavigation.dock keep their header unchanged', () => {
  assert.match(source, /if\(dockBus\.requested\)this\.mountDock\(\)/);
  assert.match(source, /dockBus\.requested = true;/);
  assert.doesNotMatch(source, /connectedCallback\(\)\{[^}]*\n[^]*?\n      this\.mountDock\(\);/);
  // Die Reiterzeile kommt mit dem Dock; no-dock und menu-only tragen beides nie
  assert.match(source, /this\.setAttribute\('dock',id\);\n      document\.documentElement\.setAttribute\('data-vu-dock',id\);\n      this\.mountTabs\(\);/);
  assert.match(source, /if\(!product\|\|!nav\|\|this\.tabsFor===product\.id\|\|this\.hasAttribute\('no-dock'\)\|\|this\.hasAttribute\('menu-only'\)\)return;/);
});

/* Damit der Inhalt nicht springt, wenn ein Produkt die Leiste nach dem ersten Zeichnen meldet, steht die Reiterzeile dort
   schon beim Aufbau des Kopfes, wo die Seite die Leiste ohnehin anfordert. late(pfad) nennt die Ausnahmen. Dieser Test
   haelt beides am Bestand der Seiten fest: frueh nur, wo ein Skript der Seite VUNavigation.dock ruft. */
test('the tab strip is reserved at first paint exactly on pages that request the dock', () => {
  assert.match(source, /const early=PRODUCTS\.find\(p=>p\.match\(location\.pathname,location\)\);\n      if\(early&&!\(early\.late&&early\.late\(location\.pathname\)\)\)this\.mountTabs\(\);/);
  const calls = new Map(), requests = src => { if (!calls.has(src)) { const f = join(root, src); calls.set(src, existsSync(f) && /VUNavigation\.dock\(/.test(readFileSync(f, 'utf8'))); } return calls.get(src); };
  const pages = [];
  const walk = (dir, depth) => {
    if (existsSync(join(root, dir, 'index.html'))) pages.push(dir);
    if (depth > 3) return;
    let seen = 0;
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (!e.isDirectory() || ['data', 'tests', 'node_modules', 'config', 'engine', 'engines', 'ui', 'assets', 'img'].includes(e.name)) continue;
      // Erzeugte Geschwisterseiten (ETF- und Aktienseiten) sind gleich gebaut: eine Stichprobe genuegt
      if (/^(vorsorge\/etf|supertrader\/stock)$/.test(dir) && ++seen > 5) break;
      walk(dir + '/' + e.name, depth + 1);
    }
  };
  for (const dir of ['discover', 'quant', 'technical', 'fundamental', 'supertrader', 'hedgefonds', 'elliott', 'screener', 'vorsorge', 'portfolios', 'willkommen', 'mein-dashboard', 'konto']) walk(dir, 0);
  let early = 0, late = 0;
  for (const dir of pages) {
    const html = readFileSync(join(root, dir, 'index.html'), 'utf8'), path = '/' + dir + '/', tag = (html.match(/<vu-navigation[^>]*>/) || [])[0];
    const product = PRODUCTS.find(p => p.match(path, loc(path)));
    if (!tag || !product || /no-dock|menu-only/.test(tag) || /http-equiv="refresh"|legacy-redirect\.js/.test(html)) continue;
    const asks = /VUNavigation\.dock\(/.test(html) || Array.from(html.matchAll(/<script[^>]*\ssrc="\/([^"?#]+)/g), m => m[1]).filter(src => src !== 'assets/site-navigation.js').some(requests);
    const isLate = !!(product.late && product.late(path));
    if (isLate) { late++; assert.ok(!asks || path.startsWith('/konto/'), path + ': fordert die Leiste beim Laden an, late() nimmt sie aus'); }
    else { early++; assert.ok(asks || (product.self && product.self(path)), path + ': Reiterzeile vom ersten Zeichnen an, aber weder die Seite noch der Rahmen (self) fordert die Leiste an'); }
  }
  assert.ok(early >= 15 && late >= 5, `Seiten geprueft: ${early} frueh, ${late} spaet`);
  // Konto meldet die Leiste erst mit dem geladenen Konto; der erste Start traegt no-dock
  assert.match(readFileSync(join(root, 'willkommen/start/index.html'), 'utf8'), /<vu-navigation[^>]*no-dock/);
});

test('the menu is the sheet „Dein Universe“ on phones, the side panel on desktop, and keeps every part', () => {
  // Reihenfolge im Menue (Prototyp T.universe): Griff, Ueberschrift und Schliessen, Gruppen mit Kacheln, Suche, „In <Welt>“, Mein Bereich, Weitere Produkte, Einstellungen, Rechtliches
  const order = ['<span class="grab" aria-hidden="true"></span>', '<div class="panel-head"><h2 class="uni-title">Dein Universe</h2>', '<p class="uni-sub">Alle Module, von jeder Seite aus.</p>', '<div class="groups"></div>', '<form class="find" role="search">', '<section class="here" hidden>', '<h2>Mein Bereich</h2><div class="mine">', '<details class="more"><summary><span>Weitere Produkte</span></summary>',
    '<div class="settings" role="group" aria-label="Einstellungen"><div class="choices appearance" role="group" aria-label="Darstellung"></div><div class="choices currency" role="group" aria-label="Anzeigewährung"></div></div>', '${legalMenu()}</nav>'];
  let at = source.indexOf('<nav class="panel" id="site-panel" aria-label="Vision Universe Menü" aria-hidden="true">');
  assert.ok(at > 0);
  for (const part of order) { const next = source.indexOf(part, at); assert.ok(next > at, part); at = next; }
  for (const t of [THEMES.light, THEMES.dark]) {
    const st = styles(t), phone = st.slice(st.indexOf('@media(max-width:760px)'), st.indexOf('@media(max-width:430px)'));
    // Desktop: Seitenleiste rechts
    assert.match(st, /\.panel\{position:fixed;right:0;top:0;bottom:0;width:min\(440px,100vw\);/);
    // Telefon: Sheet von unten, runde Ecken, hoechstens 90 % hoch, Inhalt rollt im Sheet, Griff
    assert.match(phone, /\.panel\{left:0;top:auto;width:auto;max-height:90vh;max-height:90dvh;padding-top:0;border-radius:30px 30px 0 0;[^}]*transform:translateY\(102%\);/);
    assert.match(phone, /\.grab\{display:block\}/);
    assert.match(st, /\.panel\{[^}]*overflow-y:auto;overscroll-behavior:contain;/);
    assert.match(st, /:host\(\[open\]\) \.backdrop,:host\(\[open\]\) \.panel\{visibility:visible;opacity:1;transform:none\}/);
    assert.match(st, /@media\(prefers-reduced-motion:reduce\)\{header,\.backdrop,\.panel,\.tile\{transition:none\}/);
  }
  // Schliessen: Knopf, Hintergrund, Escape, Griff nach unten ziehen; Fokus zurueck zum Oeffner
  assert.match(source, /root\.querySelector\('\.backdrop'\)\.onclick=\(\)=>\{close\(\);restore\(\);\};/);
  assert.match(source, /if\(event\.key==='Escape'\)\{close\(\);restore\(\);return;\}/);
  assert.match(source, /root\.querySelector\('\.grab'\)\.addEventListener\('pointerdown'/);
  assert.match(source, /if\(this\.dockHost\)this\.dockHost\.inert=true;/);
});


test('the shell header loads the slim web logo, not the 129 KB master (stock page budget is razor-thin)', async () => {
  const { statSync } = await import('node:fs');
  assert.doesNotMatch(source, /vision-universe-logo\.png/);
  assert.match(source, /\/assets\/vision-universe-logo-web\.png/);
  const bytes = statSync(join(root, 'assets/vision-universe-logo-web.png')).size;
  assert.ok(bytes < 20000, `web logo ${bytes} B`);
  // gleiches Seitenverhaeltnis wie das Original (3:1), damit width/height-Attribute stimmen
  const png = readFileSync(join(root, 'assets/vision-universe-logo-web.png'));
  assert.equal(png.readUInt32BE(16) / png.readUInt32BE(20), 2172 / 724);
});


test('compact menu preserves every old destination in nine products, Portfolios and one additional group', () => {
  // Reihenfolge des 3 x 3-Rasters im Menue (Mockup N3), darunter die breiten Kacheln Portfolios (Owner 06.11.2026) und Insights (Owner 09.11.2026: Artikel, Aktienmagazin, Reports; altes Magazin und XPeng-Muster nicht mehr im Menü)
  assert.deepEqual(Array.from(groups,g=>g.id), ['discover','quant','technical','fundamental','supertrader','hedgefonds','elliott','screener','vorsorge','portfolios','insights','more']);
  for(const g of groups.filter(g=>g.id!=='more')) assert.ok(g.claim, g.id+': Kurzbeschreibung fuer die Kachel');
  const destinations = new Set(groups.flatMap(g=>[g.href,...g.entries.map(e=>e[1])]).filter(Boolean));
  const previous = ['/discover/#/','/discover/#/welten','/discover/#/strategien','/discover/#/einzeln/US_REAL','/discover/#/suche','/discover/#/maerkte','/discover/#/watchlist','/dashboard/','/macro/','/etf/','/vorsorge/#/','/vorsorge/#/plan','/vorsorge/#/etfs','/vorsorge/#/portfolio','/vorsorge/#/vergleichen','/vorsorge/#/foerderung','/vorsorge/#/monitor','/vorsorge/#/wissen','/screener/','/quant/','/supertrader/','/analysten/','/hedgefonds/','/news/','/insights/magazin/','/academy/','/guide/','/budget/'];
  for(const href of previous) assert.ok(destinations.has(href),href+' remains reachable');
  for(const g of groups.filter(g=>g.id!=='more')) assert.equal(g.href, g.entries[0][1]);
  assert.equal(groups.find(g=>g.id==='quant').entries.find(([,href])=>href==='/quant/#/screener')[0],'Quant Screener');
});

test('menu routes distinguish home, query, hash segment boundaries and detail parents', () => {
  const state=url=>menuState(loc(url));
  for(const url of ['/discover/#/','/quant/','/quant/#/','/vorsorge/#/','/screener/','/screener/?view=start','/supertrader/','/hedgefonds/#/']) assert.equal(state(url).expanded,null,url);
  const examples = [
    ['/quant/#/methodik/faktoren','quant','/quant/#/methodik'],
    ['/quant/#/aktie/AAPL/technik','quant','/quant/#/aktien'],
    ['/quant/stock/?ticker=AAPL','quant','/quant/#/aktien'],
    ['/quant/strategies/builder/','quant','/quant/#/stile'],
    ['/quant/methodology/','quant','/quant/#/methodik'],
    ['/screener/?view=saved&f=pe','screener','/screener/?view=saved'],
    ['/screener/?view=compare','screener','/screener/?view=results'],
    ['/screener/?view=changes&id=example','screener','/screener/?view=saved'],
    ['/screener/?f=roic:gt:0.1','screener','/screener/?view=build'],
    ['/screener/?mode=pro','screener','/screener/?view=build'],
    ['/screener/?view=unknown&mode=pro','screener','/screener/?view=build'],
    ['/vorsorge/#/etf/IWDA','vorsorge','/vorsorge/#/etfs'],
    ['/supertrader/strategies/darvas-boxes/','supertrader','/supertrader/strategies/'],
    ['/hedgefonds/#/fonds/berkshire','hedgefonds','/hedgefonds/#/datenbank'],
    ['/discover/#/s/US_REAL/NVDA','discover','/discover/#/einzeln/US_REAL'],
    ['/news/','more','/news/'],
    ['/insights/reports/','insights','/insights/reports/']
  ];
  for(const [url,group,href] of examples){assert.equal(state(url).group,group,url);assert.equal(state(url).href,href,url);assert.equal(state(url).expanded,group,url);}
  assert.equal(state('/screener/?view=start&mode=pro').href,'/screener/');
  assert.equal(state('/screener/?view=start&mode=pro').expanded,null);
  assert.equal(state('/screener/?view=start&f=roic:gt:0.1').expanded,null);
  assert.equal(routeScore('/discover/#/welten',loc('/discover/#/weltenfremd')),-1);
  assert.equal(routeScore('/screener/',loc('/screener/?view=saved')),-1);
  assert.equal(routeScore('/quant/',loc('/quant/#/aktien')),-1);
});

test('menu tiles keep original product symbols, load the sprite lazily and stay accessible', () => {
  const sprite=readFileSync(join(root,'assets/product-icons.svg'),'utf8');
  for(const group of groups) {
    const icon=productIcon(group.icon);
    assert.match(icon,new RegExp('data-href="/assets/product-icons\\.svg#'+group.icon+'"'));
    assert.doesNotMatch(icon,/<use href=/,'hidden menu must not request its sprite');
  }
  for(const group of groups.filter(g=>['discover','quant','elliott','fundamental','technical','screener','vorsorge','supertrader','insights','more'].includes(g.id))) {
    const original=sprite.match(new RegExp('<symbol id="'+group.icon+'"[^>]*>([\\s\\S]*?)</symbol>'))[1];
    assert.equal(DOCK_PRODUCT_ICONS[group.icon],original,group.icon+': exact original geometry and presentation');
    assert.doesNotMatch(dockProductIcon(group.icon),/use|href/,'dock requires no sprite request');
  }
  assert.match(source,/icon\.setAttribute\('href',icon\.getAttribute\('data-href'\)\)/);
  assert.match(source,/icon\.removeAttribute\('data-href'\)/);
  // Raster der Produkte, Unterseiten der aktuellen Welt, Mein Bereich, Weitere Produkte
  assert.match(source,/a\.className='tile'/);
  assert.match(source,/class="here" hidden/);
  assert.match(source,/<details class="more">/);
  assert.match(source,/'In '\+group\.label/);
  assert.match(source,/filter\(n=>n\.getClientRects\(\)\.length&&!n\.closest\('\[hidden\]'\)\)/);
  assert.match(source,/world\.querySelector\('\.hud'\)\.innerHTML=dockProductIcon\(w\.icon\)/,'Produktsymbol im Kopf');
  const light=styles(THEMES.light);
  assert.match(light,/\.hb\{position:relative;width:38px;height:38px/);
  assert.match(light,/\.links a,\.mine a,\.more summary\{[^}]*min-height:46px/);
  assert.match(light,/\.choices button,\.choices a\{[^}]*min-width:44px;min-height:44px/);
  assert.match(light,/\.tile\[aria-current=page\],\.tile\.is-current\{box-shadow:0 0 0 1px rgba\(200,245,49,\.5\),0 0 28px rgba\(200,245,49,\.18\)\}/,'aktuelle Welt: Lichtrand des Prototyps (.gl)');
});

test('Elliott is a first-class product with its own menu group, dock and state', () => {
  const elliott = groups.find(g => g.id === 'elliott');
  assert.equal(elliott.href, '/elliott/');
  assert.equal(elliott.icon, 'elliott');
  assert.equal(elliott.entries[0][1], '/elliott/');
  // Kein Elliott-Eintrag mehr unter Quant, und kein fest verdrahteter Titel als Produkt-Startseite
  const quant = groups.find(g => g.id === 'quant');
  assert.ok(!quant.entries.some(([label, href]) => /elliott/i.test(label) || /chartbild/.test(href)), 'Quant fuehrt Elliott nicht mehr');
  for (const g of groups) for (const [label, href] of g.entries) if (/elliott/i.test(label) || g.id === 'elliott') assert.ok(!/\/(NVDA|AAPL)\b/.test(href), `${href}: Elliott oeffnet nie auf einer festen Aktie`);
  // Menue: Elliott steht auf Produktebene, nicht verschachtelt
  assert.ok(groups.some(g => g.id === 'elliott' && g.href));
  const state = url => menuState(loc(url));
  assert.equal(state('/elliott/').group, 'elliott');
  assert.equal(state('/elliott/').expanded, null, 'Startseite klappt das Menue nicht auf');
  assert.equal(state('/elliott/#/?zaehlbar=1').href, '/elliott/#/?zaehlbar=1');
  assert.equal(state('/elliott/#/?zaehlbar=1').expanded, 'elliott', 'Listenzustand oeffnet den Produktbereich');
  assert.equal(state('/elliott/#/?welle=3').expanded, 'elliott', 'alte Adresse (leitet auf Zaehlbar) bleibt im Produktbereich');
  assert.equal(state('/elliott/#/?richtung=ab').expanded, 'elliott');
  assert.equal(state('/elliott/#/?richtung=ab').href, '/elliott/#/?richtung=ab');
  // Aktienbild: Pfad /quant/, aber Produkt Elliott (kein doppelter aktiver Zustand)
  for (const url of ['/elliott/#/NVDA', '/elliott/#/SE?ansicht=profi', '/quant/#/elliott/NVDA', '/quant/#/elliott/SE?ansicht=profi']) {
    assert.equal(state(url).group, 'elliott', url);
    assert.equal(state(url).href, '/elliott/', url);
  }
  assert.equal(state('/quant/#/aktie/NVDA').group, 'quant');
  assert.equal(state('/quant/#/aktien').group, 'quant');
  const product = url => PRODUCTS.find(p => p.match(loc(url).pathname, loc(url))).id;
  assert.equal(product('/elliott/'), 'elliott');
  assert.equal(product('/elliott/#/NVDA'), 'elliott', 'native Aktien-Route');
  assert.equal(product('/quant/#/elliott/NVDA'), 'elliott');
  assert.equal(product('/quant/#/aktie/NVDA'), 'quant');
  assert.equal(product('/quant/'), 'quant');
  // genau ein Produkt je Adresse
  for (const url of ['/elliott/', '/elliott/#/NVDA', '/quant/#/elliott/NVDA', '/quant/', '/discover/#/', '/screener/']) assert.equal(PRODUCTS.filter(p => p.match(loc(url).pathname, loc(url))).length, 1, url);
  const dock = PRODUCTS.find(p => p.id === 'elliott');
  assert.equal(dock.active(loc('/elliott/')), 'elliott');
  assert.equal(dock.active(loc('/elliott/#/?zaehlbar=1')), 'zaehlbar');
  assert.equal(dock.active(loc('/elliott/#/?welle=3')), 'zaehlbar', 'alte Adresse markiert Zaehlbar');
  assert.equal(dock.active(loc('/elliott/#/?neu=1')), 'neu');
  assert.equal(dock.active(loc('/elliott/#/?suche=1')), 'suche');
  assert.equal(dock.active(loc('/elliott/#/?richtung=ab')), null, 'Filter ohne eigenen Eintrag markiert nur das Produkt');
  assert.equal(dock.active(loc('/elliott/#/NVDA')), null, 'natives Aktienbild markiert nur das Produkt (nicht Quant)');
  assert.equal(dock.active(loc('/elliott/#/NVDA?ansicht=profi')), null);
  assert.equal(dock.active(loc('/quant/#/elliott/NVDA')), null, 'Aktienbild markiert nur das Produkt');
  // Die Reiterzeile baut sich neu auf, wenn eine SPA das Produkt unter demselben Pfad wechselt
  assert.match(source, /if\(!next\|\|next\.id===product\.id\)\{paint\(\);return;\}/);
  assert.match(source, /if\(this\.dropTabs\)this\.dropTabs\(\);/);
  // Eigenes Symbol: das Originalsymbol der Startseite, ohne Sprite-Abruf in der Leiste
  assert.ok(DOCK_PRODUCT_ICONS.elliott && !/use/.test(dockProductIcon('elliott')));
  assert.match(source, /<a href="\/elliott\/">Elliott<\/a>/, 'Direktzugriff im Kopf (Desktop ohne Leiste)');
});

/* Fundamental ist ein eigenes Produkt auf derselben Ebene wie Discover, Quant und Supertrader: eigene Gruppe, eigene Leiste,
   eigener aktiver Zustand; die Unternehmensseite #/<TICKER> zeigt nur den Produktkontext. */
test('Fundamental is a first-class product with its own menu group, dock and state', () => {
  const fundamental = groups.find(g => g.id === 'fundamental');
  assert.equal(fundamental.label, 'Fundamental');
  assert.equal(fundamental.href, '/fundamental/#/');
  assert.equal(fundamental.icon, 'fundamental');
  assert.deepEqual(Array.from(fundamental.entries, e => e[1]), ['/fundamental/#/', '/fundamental/#/ranglisten', '/fundamental/#/branchen', '/fundamental/#/suche', '/fundamental/#/methodik']);
  // Produktebene: nicht unter "Weitere Produkte"
  assert.ok(!groups.find(g => g.id === 'more').entries.some(([, href]) => href.startsWith('/fundamental/')));
  const product = PRODUCTS.find(p => p.id === 'fundamental');
  assert.ok(product.match('/fundamental/', loc('/fundamental/#/NVDA')));
  assert.ok(!product.match('/quant/', loc('/quant/#/aktie/NVDA/zahlen')), 'Quant-Zahlen bleiben Quant');
  assert.equal(product.active(loc('/fundamental/#/NVDA')), null, 'Unternehmensseite: nur Produktkontext');
  assert.equal(product.active(loc('/fundamental/#/BRK-B')), null);
  const state = url => menuState(loc(url));
  assert.equal(state('/fundamental/#/').group, 'fundamental');
  assert.equal(state('/fundamental/#/').expanded, null, 'Startseite klappt das Menue nicht auf');
  assert.equal(state('/fundamental/#/ranglisten').href, '/fundamental/#/ranglisten');
  assert.equal(state('/fundamental/#/methodik').href, '/fundamental/#/methodik');
  assert.equal(state('/fundamental/#/NVDA').group, 'fundamental');
  assert.equal(state('/fundamental/#/NVDA').expanded, 'fundamental');
  assert.equal(DOCK_PRODUCT_ICONS.fundamental.length > 0, true);
});

/* Technical ist ein eigenes Produkt: eigene Leiste, eigene Menuegruppe nach Fundamental, Dock-Symbol = Sprite. */
test('Technical has its own dock, its own menu group and the exact sprite geometry', () => {
  const dock = PRODUCTS.find(p => p.id === 'technical');
  assert.equal(dock.active(loc('/technical/')), 'technical');
  assert.equal(dock.active(loc('/technical/#/screener?muster=dreieck')), 'screener');
  assert.equal(dock.active(loc('/technical/#/chart/NVDA')), 'chart');
  assert.equal(dock.active(loc('/technical/#/chart/NVDA/signale')), 'chart');
  assert.equal(dock.active(loc('/technical/#/methodik')), 'muster', 'Redesign T05: #/methodik zeigt die Muster-Seite');
  assert.equal(dock.active(loc('/technical/#/muster')), 'muster');
  for (const url of ['/technical/', '/technical/#/chart/NVDA']) assert.equal(PRODUCTS.filter(p => p.match(loc(url).pathname, loc(url))).length, 1, url);
  /* Eigene Menuegruppe (Owner-Freigabe 25.10.2026); "Weitere Produkte" fuehrt Technical nicht mehr. */
  const tg = groups.find(g => g.id === 'technical');
  assert.equal(tg.href, '/technical/#/');
  assert.equal(tg.icon, 'technical');
  /* App-Konzept 2: „Vorlagen“ und „Lernen“ sind Eintraege der Gruppe und damit Reiter; die frueheren fuenf Ziele bleiben. */
  assert.deepEqual(Array.from(tg.entries, e => e[1]), ['/technical/#/', '/technical/#/screener', '/technical/#/chart', '/technical/#/screener?reiter=vorlagen', '/technical/#/screener/gespeichert', '/technical/#/muster', '/technical/#/lernen']);
  for (const [, href] of tg.entries) assert.notEqual(require(join(root, 'technical/engine/model.js')).parseRoute(new URL(href, 'https://x').hash).view, 'notfound', href);
  assert.ok(!groups.find(g => g.id === 'more').entries.some(([, href]) => href.startsWith('/technical/')));
  const state = url => menuState(loc(url));
  assert.deepEqual(JSON.parse(JSON.stringify(state('/technical/#/'))), { group: 'technical', href: '/technical/#/', expanded: null });
  assert.deepEqual(JSON.parse(JSON.stringify(state('/technical/#/chart/NVDA/signale'))), { group: 'technical', href: '/technical/#/chart', expanded: 'technical' });
  assert.equal(state('/technical/#/screener/gespeichert').href, '/technical/#/screener/gespeichert');
  assert.equal(state('/technical/#/screener?muster=dreieck').href, '/technical/#/screener');
  assert.equal(state('/technical/#/lernen').href, '/technical/#/lernen');
  assert.equal(state('/technical/#/assistent/trend').href, '/technical/#/lernen', 'eine Frage des Assistenten gehoert zu Lernen');
  assert.equal(state('/technical/#/akademie/kerzen').href, '/technical/#/lernen', 'eine Lektion gehoert zu Lernen');
  assert.equal(state('/technical/#/screener?reiter=vorlagen').href, '/technical/#/screener?reiter=vorlagen');
  assert.equal(state('/technical/#/vorlagen/x').href, '/technical/#/screener?reiter=vorlagen');
  assert.equal(state('/technical/#/screener?reiter=gespeichert').href, '/technical/#/screener/gespeichert');
  const sprite = readFileSync(join(root, 'assets/product-icons.svg'), 'utf8');
  assert.equal(DOCK_PRODUCT_ICONS.technical, sprite.match(/<symbol id="technical"[^>]*>([\s\S]*?)<\/symbol>/)[1]);
});

test('a product without its own menu group still gets its icon in the header', () => {
  assert.match(source, /\(group\|\|\{icon:product\.icon\|\|product\.id\}\)\.icon/);
  for (const p of PRODUCTS) {
    const icon = (groups.find(g => g.id === p.id) || { icon: p.icon || p.id }).icon;
    // Mein Bereich ist keine Produktwelt mit Sprite-Symbol: es traegt das Linien-Symbol der Person.
    if (p.id === 'mein') { assert.match(dockProductIcon(icon), /class="line"/); assert.match(dockProductIcon(icon), /<circle/); continue; }
    assert.ok(DOCK_PRODUCT_ICONS[icon], p.id + ': Dock-Symbol vorhanden');
  }
  // Mein Bereich: Start, Watchlist, Gespeichert, Konto; Anmeldung und Bestellweg tragen keine Leiste.
  const mein = PRODUCTS.find(p => p.id === 'mein');
  assert.equal(mein.active(loc('/willkommen/')), 'mein');
  assert.equal(mein.active(loc('/mein-dashboard/#/gespeichert')), 'gespeichert');
  assert.equal(mein.active(loc('/konto/watchlist/')), 'watchlist');
  for (const url of ['/konto/anmelden/', '/konto/tarife/', '/konto/registrieren/']) assert.equal(PRODUCTS.filter(p => p.match(loc(url).pathname, loc(url))).length, 0, url);
  // Einstellungen und Abonnement tragen Dock und Reiter (der Rahmen fordert sie selbst an: self); der Bestellweg, Anmeldung,
  // Registrierung, Passwort und die Verwaltung bleiben ohne Leiste. Jede Konto-Seite ist hier eingeordnet.
  const mitLeiste = ['/konto/einstellungen/', '/konto/abo/'], ohneLeiste = ['/konto/tarife/', '/konto/kuendigen/', '/konto/anmelden/', '/konto/registrieren/', '/konto/passwort/', '/konto/passwort-neu/'];
  // Verwaltungsseiten (interne Seiten unter /konto/admin/, hier nicht beim Namen genannt): ebenfalls ohne Leiste
  for (const e of readdirSync(join(root, 'konto/admin'), { withFileTypes: true })) if (e.isDirectory()) ohneLeiste.push('/konto/admin/' + e.name + '/');
  for (const url of mitLeiste) {
    assert.equal(PRODUCTS.find(p => p.match(url, loc(url))), mein, url);
    assert.equal(mein.self(url), true, url + ': Rahmen traegt Dock und Reiter selbst');
    assert.equal(mein.late(url), false, url + ': Reiterzeile vom ersten Zeichnen an');
    assert.equal(mein.active(loc(url)), 'konto', url);
    assert.equal(dockActive(loc(url)), 'ich', url);
  }
  for (const url of ohneLeiste) { assert.equal(PRODUCTS.filter(p => p.match(url, loc(url))).length, 0, url + ': keine Leiste (Fokus)'); assert.equal(mein.self(url), false, url); }
  for (const url of ['/willkommen/', '/mein-dashboard/', '/konto/', '/konto/watchlist/']) assert.equal(mein.self(url), false, url + ': fordert die Leiste selbst an');
  assert.equal(mein.late('/konto/'), true); assert.equal(mein.late('/konto/watchlist/'), true);
  const kontoSeiten = readdirSync(join(root, 'konto'), { withFileTypes: true }).filter(e => e.isDirectory() && existsSync(join(root, 'konto', e.name, 'index.html'))).map(e => '/konto/' + e.name + '/');
  for (const url of kontoSeiten) assert.ok(mitLeiste.includes(url) || ohneLeiste.includes(url) || url === '/konto/watchlist/', url + ': neue Konto-Seite ohne Einordnung (mit oder ohne Leiste)');
  assert.match(source, /if\(early&&early\.self&&early\.self\(location\.pathname\)\)dockBus\.requested=true;\n      if\(dockBus\.requested\)this\.mountDock\(\);/);
  assert.match(readFileSync(join(root, 'willkommen/app.js'), 'utf8'), /VUNavigation\.dock\(\{\}\)/);
  assert.match(readFileSync(join(root, 'mein-dashboard/dashboard.js'), 'utf8'), /VUNavigation\.dock\(\{\}\)/);
});

test('Portfolios: eigener Menueeintrag, Direktzugriff, Leiste mit Gruppen und Depot-Detail', () => {
  const g = groups.find(x => x.id === 'portfolios');
  assert.equal(g.href, '/portfolios/');
  assert.deepEqual(JSON.parse(JSON.stringify(g.entries.map(e => e[1]))), ['/portfolios/', '/portfolios/#/supertrader', '/portfolios/#/quant', '/portfolios/#/ki']);
  assert.match(source, /<a class="q-extra" href="\/portfolios\/">Portfolios<\/a>/);
  assert.ok(menuGroups().find(g => g.title === 'Nach Regeln').tiles.some(t => t.id === 'portfolios'), 'Kachel in der Gruppe „Nach Regeln“ (Prototyp)');
  const sprite = readFileSync(join(root, 'assets/product-icons.svg'), 'utf8');
  assert.equal(DOCK_PRODUCT_ICONS.portfolios, sprite.match(/<symbol id="portfolios"[^>]*>([\s\S]*?)<\/symbol>/)[1]);
  const p = PRODUCTS.find(x => x.id === 'portfolios');
  assert.equal(p.active(loc('/portfolios/')), 'portfolios');
  assert.equal(p.active(loc('/portfolios/#/quant')), 'quant');
  assert.equal(p.active(loc('/portfolios/#/supertrader/minervini-vcp')), 'supertrader');
  assert.equal(p.active(loc('/portfolios/#/ki/a')), 'ki');
  assert.equal(menuState(loc('/portfolios/#/quant/momentum-leader')).group, 'portfolios');
});

/* ───────── Rahmen genau nach Prototyp „App-Konzept 2“ (Owner 15.11.2026): Kopf, Menue, dunkler Standard, Schalter, Aktien-Vorschau ───────── */

test('Kopf nach Prototyp: Welten-Wechsler als Pille, „i“, Datums-Pille, Suche, Profil mit Lime-Ring; kein Atlas-Knopf', () => {
  const head = source.slice(source.indexOf('<header><div class="shell">'), source.indexOf('</header>'));
  const order = ['<button class="world mod" type="button" hidden aria-haspopup="true" aria-expanded="false" aria-controls="site-panel"><span class="hud mi"></span><span class="world-name"></span><svg class="chev"',
    '<button class="hb info" type="button" aria-haspopup="dialog" aria-label="Daten und Hinweise">i</button>', '<button class="live" type="button" hidden aria-haspopup="dialog"><i></i><b></b></button>',
    '<a class="hb search" href="/discover/#/suche" aria-label="Aktie suchen">', '<a class="hb profile" href="/mein-dashboard/" aria-label="Mein Bereich">'];
  let at = 0;
  for (const part of order) { const next = head.indexOf(part, at); assert.ok(next >= at && next >= 0, part); at = next + 1; }
  assert.doesNotMatch(head, /atlas/i, 'der Atlas-Knopf im Kopf ist entfallen');
  // Der Wechsler oeffnet das Menue „Dein Universe“; die Pille nur mit echtem Datum
  assert.match(source, /world\.onclick=\(\)=>this\.openMenu\(world\)/);
  assert.match(source, /const d=isoDate\(dataBus\.datum\);live\.hidden=!d;/);
  assert.match(source, /live\.onclick=\(\)=>openDaten\(\)/);
  assert.match(source, /root\.querySelector\('\.info'\)\.onclick=\(\)=>openHinweise\(\)/);
  // Masse des Prototyps (shell.js .hdr/.mod/.mi/.hb/.live), in beiden Schemata dieselben
  for (const t of [THEMES.light, THEMES.dark]) {
    const st = styles(t), phone = st.slice(st.indexOf('@media(max-width:760px)'));
    assert.match(phone, /\.row\{height:56px;padding:0 12px\}/);
    assert.match(st, /\.row\{height:64px;display:flex;align-items:center;gap:8px\}/);
    assert.match(st, /\.mod\{[^}]*gap:8px;[^}]*height:38px;padding:0 12px 0 6px;border:0;border-radius:99px;[^}]*font-weight:800;font-size:16px;letter-spacing:-\.02em;white-space:nowrap\}/);
    assert.match(st, /\.mi\{width:28px;height:28px;border-radius:9px;background:#0e1013;border:1px solid rgba\(200,245,49,\.35\);[^}]*color:#c8f531/);
    assert.match(st, /\.live\{[^}]*gap:6px;[^}]*height:38px;padding:0 11px;[^}]*font-size:12px;font-weight:800;/);
    assert.match(st, /\.live i\{width:7px;height:7px;border-radius:9px;/);
    assert.ok(st.includes(`.profile{border:2px solid #c8f531;`), 'Profil mit Ring in Neongrün');
    assert.ok(st.includes(`:host([solid]) header{background:${t.bg};-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}`));
  }
  assert.equal(THEMES.dark.bg, 'rgba(0,0,0,.82)');
  assert.equal(THEMES.dark.glass, 'rgba(20,20,22,.7)');
  assert.equal(THEMES.dark.live, '#c3c7cc');
});

test('Welten-Wechsler: Name und Symbol je Ort; Home, Ich, Konto und News heissen wie im Prototyp', () => {
  const w = url => { const x = worldOf(loc(url)); return x && [x.label, x.icon]; };
  const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
  same(w('/willkommen/'), ['Home', 'layers']);
  same(w('/mein-dashboard/#/gespeichert'), ['Ich', 'layers']);
  same(w('/konto/einstellungen/'), ['Konto', 'layers']);
  same(w('/insights/reports/'), ['News', 'insights']);
  same(w('/discover/#/welten'), ['Discover', 'discover']);
  same(w('/quant/#/aktie/NVDA'), ['Aktie', 'chartbild']);
  same(w('/quant/#/aktie/NVDA/zahlen'), ['Aktie', 'chartbild']);
  same(w('/quant/#/aktien'), ['Quant', 'quant']);
  assert.equal(DOCK_PRODUCT_ICONS.chartbild, readFileSync(join(root, 'assets/product-icons.svg'), 'utf8').match(/<symbol id="chartbild"[^>]*>([\s\S]*?)<\/symbol>/)[1], 'Symbol der Aktie: Originalgeometrie');
  same(w('/quant/#/elliott/NVDA'), ['Elliott', 'elliott']);
  same(w('/supertrader/treffer/'), ['Supertrader', 'supertrader']);
  assert.equal(worldOf(loc('/konto/anmelden/')), null, 'ohne Welt bleibt das Logo');
  assert.equal(worldOf(loc('/infos/')), null);
  for (const p of PRODUCTS) assert.ok(DOCK_PRODUCT_ICONS[worldOf(loc(p.items[0][2])).icon], p.id + ': Symbol ohne Sprite-Abruf');
});

test('Menue „Dein Universe“ nach Prototyp: vier Gruppen, zwei Kacheln nebeneinander, Atlas als Kachel, kein Produkt fehlt', () => {
  const g = JSON.parse(JSON.stringify(menuGroups().map(x => [x.title, x.tiles.map(t => t.id)])));
  assert.deepEqual(g, [['Entdecken', ['discover', 'insights']], ['Analysieren', ['quant', 'fundamental', 'technical', 'hedgefonds', 'elliott']],
    ['Nach Regeln', ['supertrader', 'portfolios']], ['Finden und vorsorgen', ['screener', 'vorsorge', 'atlas']]]);
  const ids = g.flatMap(x => x[1]);
  for (const group of groups.filter(x => x.href)) assert.ok(ids.includes(group.id), group.id + ' steht im Menue');
  const atlas = menuGroups()[3].tiles.find(t => t.id === 'atlas');
  assert.equal(atlas.href, '/ask/');
  // Der Eintrag zur Startseite der Website (frueher Logo im Menuekopf) bleibt
  assert.match(source, /more\.entries\.concat\(\[\['Vision Universe Startseite','\/'\]\]\)/);
  const st = styles(THEMES.dark);
  assert.match(st, /\.tiles\{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px\}/);
  assert.match(st, /\.tile\{display:flex;align-items:center;gap:10px;min-width:0;padding:12px;border-radius:22px;background:#202022;/);
  assert.match(st, /\.tile \.menu-product-icon\{width:40px;height:40px;border-radius:12px;background:#0e1013;border:1px solid rgba\(200,245,49,\.25\);/);
  assert.match(st, /\.panel\{[^}]*background:#151516;color:#f4f5f1;/);
  assert.match(st, /\.panel h2\.uni-title\{margin:0;font-size:30px;line-height:1;font-weight:900;letter-spacing:-\.045em;/);
  assert.match(st, /\.panel h2\{margin:16px 0 0;font-size:10\.5px;[^}]*font-weight:800;letter-spacing:\.12em;text-transform:uppercase;color:#a1a7af\}/);
});

test('Dunkel ist der Standard: eine Regel (themeWanted), einmalige Umstellung, Hell bleibt, „Wie Gerät“ folgt dem Geraet', () => {
  const store = init => { const m = new Map(Object.entries(init || {})); return { m, get: k => m.has(k) ? m.get(k) : null, set: (k, v) => { if (v === null) m.delete(k); else m.set(k, v); } }; };
  const KEY = 'vu-discover-theme-v1', SYS = 'vu-theme-system-v1', DEF = 'vu-theme-default-v2';
  // Erster Besuch: dunkel, auch auf einem hellen Geraet; gespeichert fuer die Inline-Skripte der naechsten Seiten
  let s = store();
  assert.equal(themeWanted(s, 'light', false), 'dark');
  assert.equal(s.get(KEY), 'dark'); assert.equal(s.get(DEF), '1');
  // Vor der Umstellung automatisch gespeichertes „light“ ist keine Wahl: einmal dunkel
  s = store({ [KEY]: 'light' });
  assert.equal(themeWanted(s, 'light', false), 'dark');
  // Wer danach Hell waehlt, behaelt Hell
  s.set(KEY, 'light');
  assert.equal(themeWanted(s, 'dark', false), 'light');
  assert.equal(themeWanted(s, 'dark', false), 'light');
  // Dunkel gewaehlt bleibt dunkel
  s = store({ [KEY]: 'dark', [DEF]: '1' });
  assert.equal(themeWanted(s, 'light', false), 'dark');
  // „Wie Gerät“: folgt dem Geraet und haelt den Schluessel fuer die Inline-Skripte aktuell; die Umstellung laesst es stehen
  s = store({ [KEY]: 'dark', [SYS]: '1' });
  assert.equal(themeWanted(s, 'light', false), 'light'); assert.equal(s.get(KEY), 'light');
  assert.equal(themeWanted(s, 'dark', false), 'dark'); assert.equal(s.get(KEY), 'dark');
  // Automatisierte Pruefungen setzen das Schema vor dem Laden selbst
  s = store({ [KEY]: 'light' });
  assert.equal(themeWanted(s, 'dark', true), 'light');
  // Ohne Speicher: dunkel
  assert.equal(themeWanted({ get: () => null, set() {} }, 'light', false), 'dark');
  // Zentral, vor dem ersten Zeichnen: synchron am Anfang von <body>; die oeffentliche Startseite bleibt aussen vor
  assert.match(source, /if \(typeof window !== 'undefined' && themed\(\) && !publicPage\(\)\) \{\n    const want = themeWanted\(themeStore, deviceTheme\(\), !!navigator\.webdriver\);/);
  assert.match(source, /const publicPage = \(\) => \{ const p = location\.pathname; return p === '\/' \|\| p === '\/index\.html' \|\| p\.startsWith\('\/website2\/'\); \};/);
  const inline = /<script>\(function\(\)\{var w="dark";try\{var v=localStorage\.getItem\("vu-discover-theme-v1"\);if\(v==="dark"\|\|v==="light"\)w=v;\}catch\(e\)\{\}/;
  const other = /var w="dark";try\{if\(localStorage\.getItem\("vu-discover-theme-v1"\)==="light"\)w="light";\}/;
  for (const page of ['willkommen', 'discover', 'quant', 'fundamental', 'technical', 'elliott', 'hedgefonds', 'supertrader', 'screener', 'insights', 'mein-dashboard', 'konto', 'konto/einstellungen', 'konto/watchlist', 'ask', 'portfolios', 'vorsorge']) {
    const html = readFileSync(join(root, page, 'index.html'), 'utf8');
    assert.ok(inline.test(html) || other.test(html), page + ': Inline-Skript startet dunkel (kein heller Blitz)');
    /* /ask/ traegt einen eigenen Kopf und bindet den Rahmen nur als Menue ein; dort stellt das Inline-Skript um. */
    if (page !== 'ask') assert.match(html, /<body[^>]*>\s*(?:<a class="[^"]*skip[^"]*"[^>]*>[^<]*<\/a>\s*)?<vu-navigation[^>]*\btheme-switch\b[^>]*><\/vu-navigation>\s*(?:<script>[^<]*<\/script>)?\s*<script src="\/assets\/site-navigation\.js"><\/script>/, page + ': Rahmen synchron am Anfang von <body>');
  }
  // Die oeffentliche Startseite ist nicht angefasst: sie startet hell
  assert.match(readFileSync(join(root, 'index.html'), 'utf8'), /var w="light"/);
  for (const gen of ['scripts/supertrader/build.mjs', 'products/insights/build.mjs', 'scripts/quant/build-methodology-index.mjs']) assert.match(readFileSync(join(root, gen), 'utf8'), /var w="dark";try\{var v=localStorage\.getItem\("vu-discover-theme-v1"\)/, gen);
  assert.match(readFileSync(join(root, 'discover/engines/theme.js'), 'utf8'), /return v === "light" \? "light" : "dark";/);
  assert.match(readFileSync(join(root, 'konto/konto.js'), 'utf8'), /window\.VUTheme\.set\(t\)/, '„Wie Gerät“ merkt sich der Rahmen');
});

test('Schalter des Rahmens: data-vu-bleed (Kopf durchsichtig bis 24 px) und data-vu-tabs="inhalt" (Reiter im Inhalt)', () => {
  assert.match(source, /const solid=\(\)=>this\.toggleAttribute\('solid',!document\.documentElement\.hasAttribute\('data-vu-bleed'\)\|\|\(window\.scrollY\|\|0\)>24\);/);
  assert.match(source, /window\.addEventListener\('scroll',solid,\{passive:true\}\)/);
  assert.match(source, /attributeFilter:\['data-vu-bleed','data-vu-tabs'\]/);
  assert.match(source, /const own=html\.getAttribute\('data-vu-tabs'\)==='inhalt';\n      nav\.hidden=own;/);
  assert.match(source, /rahmen: o => \{/);
  const css = readFileSync(join(root, 'assets/site-navigation.css'), 'utf8');
  assert.match(css, /html\[data-vu-tabs=inhalt\]\{--vu-navigation-height:64px\}/);
  assert.match(css, /@media\(max-width:760px\)\{html\[data-vu-tabs=inhalt\]\{--vu-navigation-height:56px\}\}/);
  assert.match(css, /html\[data-vu-bleed\] body\{padding-top:0!important\}/);
  // Standard deckend: ohne Attribut liefert die Regel immer „solid“
  assert.match(styles(THEMES.dark), /\n\s*header\{transition:background \.25s\}\n/, 'der Grund kommt nur mit [solid]');
});

test('Fenster des Kopfes: „Daten & Hinweise“ aus den Pflicht-Hinweisen, „Datenstand“ nur mit Datum', () => {
  assert.match(source, /frameSheet\(\{id: 'vu-sh-hinweise', title: 'Daten & Hinweise'/);
  assert.match(source, /frameSheet\(\{id: 'vu-sh-daten', title: 'Datenstand'/);
  assert.match(source, /window\.VUUI\.popup\(\{id: o\.id, title: o\.title, body: o\.body, cls: 'vu-frame-sheet'\}\)/);
  assert.match(source, /LEGAL\.notices\.footer/);
  assert.match(source, /fetch\('\/quant\/data\/product\/market-regime-v1\.json'\)/, 'Kursstand aus dem Marktlage-Artefakt (asOf)');
  const d = isoDate('2026-11-13');
  assert.deepEqual(JSON.parse(JSON.stringify([d.short, d.long, d.day])), ['13.11.', '13.11.2026', 'Fr.']);
  assert.equal(isoDate(''), null); assert.equal(isoDate(null), null); assert.equal(isoDate('heute'), null);
  assert.match(source, /const d=j&&isoDate\(j\.asOf\);if\(!d\|\|dataBus\.own\)return;/, 'ohne gueltiges Datum bleibt die Pille weg; die Meldung der Seite geht vor');
});

test('Aktien-Vorschau: Tipp auf data-vu-stock laedt vu-stock-sheet.js einmal und oeffnet VUStockSheet; sonst gilt der Link', async () => {
  const el = (attrs, inner) => ({ attrs, getAttribute: k => attrs[k] ?? null, contains: x => x === inner });
  const click = (target, extra) => { const e = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, target, ...extra }; return e; };
  const hit = node => ({ closest: sel => sel === '[data-vu-stock]' ? node : null });
  const link = el({ 'data-vu-stock': 'NVDA', 'data-vu-stock-name': 'NVIDIA', href: '/quant/#/aktie/NVDA' });
  // 1. Datei vorhanden: einmal laden, dann oeffnen
  let api = null, loads = 0; const opened = [], went = [];
  let handler = stockSheet({ has: () => api, load: () => { loads++; api = { open: (t, o) => { opened.push([t, o.name, o.trigger === link]); } }; return Promise.resolve(); }, go: h => went.push(h) });
  let e = click(hit(link)); assert.equal(handler(e), true); assert.equal(e.defaultPrevented, true);
  await new Promise(r => setTimeout(r, 0));
  e = click(hit(link)); handler(e);
  assert.equal(loads, 1); assert.deepEqual(opened, [['NVDA', 'NVIDIA', true], ['NVDA', 'NVIDIA', true]]); assert.deepEqual(went, []);
  // 2. Strg/Cmd/Umschalt/Mittelklick und bereits behandelte Klicks: der Browser entscheidet
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }, { defaultPrevented: true }]) { e = click(hit(link), extra); assert.equal(handler(e), false); }
  // 3. Aktienkopf (kein Ziel) und Tipps daneben oeffnen nichts
  e = click(hit(el({ 'data-vu-stock': 'NVDA' }))); assert.equal(handler(e), false); assert.equal(e.defaultPrevented, false);
  assert.equal(handler(click(hit(null))), false);
  // 4. Eigenes Bedienelement in einer Karte (Herz) behaelt seine Funktion
  const heart = {}; const card = el({ 'data-vu-stock': 'AAPL', 'data-vu-href': '/quant/#/aktie/AAPL' }, heart);
  e = click({ closest: sel => sel === '[data-vu-stock]' ? card : heart }); assert.equal(handler(e), false);
  // 5. Datei fehlt: dem Ziel folgen, danach gilt der normale Link
  api = null; went.length = 0;
  handler = stockSheet({ has: () => api, load: () => Promise.reject(new Error('404')), go: h => went.push(h) });
  e = click(hit(link)); assert.equal(handler(e), true);
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(went, ['/quant/#/aktie/NVDA']);
  e = click(hit(link)); assert.equal(handler(e), false); assert.equal(e.defaultPrevented, false, 'zweiter Tipp: normaler Link');
  // 6. open() meldet false oder wirft: dem Ziel folgen
  for (const open of [() => false, () => { throw new Error('x'); }]) {
    went.length = 0; handler = stockSheet({ has: () => ({ open }), load: () => Promise.resolve(), go: h => went.push(h) });
    handler(click(hit(link))); assert.deepEqual(went, ['/quant/#/aktie/NVDA']);
  }
  // Verdrahtung: ein Lader je Seite, vor dem Karten-Einstieg (der behandelte Klicks ueberspringt)
  assert.match(source, /sc\.src = '\/assets\/vu-stock-sheet\.js'/);
  assert.match(source, /window\.VUStockSheet && typeof window\.VUStockSheet\.open === 'function'/);
  assert.ok(source.indexOf('window.__vuStockSheet = true') < source.indexOf('window.__vuCardLink = true'));
});
