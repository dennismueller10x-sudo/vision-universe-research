import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/* Gemeinsame Vision-Universe-Shell (assets/site-navigation.js): Produkt-Leiste
   [PRODUKT] [Funktion] [Funktion] [Funktion] [☰] fuer alle Produkte.
   Die Leiste ist Opt-in; diese Tests sichern Konfiguration, Routen, aktive
   Zustaende und Gestaltung unabhaengig von den einzelnen Produkten. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(root, 'assets/site-navigation.js'), 'utf8');
const sandbox = { HTMLElement: class {}, URL, URLSearchParams, customElements: { define() {} } };
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.__nav = { styles, THEMES, PRODUCTS, dockStyles, groups, routeScore, menuState, productIcon, DOCK_PRODUCT_ICONS, dockProductIcon };})();'), sandbox);
const { styles, THEMES, PRODUCTS, dockStyles, groups, routeScore, menuState, productIcon, DOCK_PRODUCT_ICONS, dockProductIcon } = sandbox.__nav;

const loc = (url) => { const u = new URL(url, 'https://research.visionuniverse.de'); return { pathname: u.pathname, hash: u.hash, search: u.search }; };

test('every product dock starts with the product name, never Home or Start, and has four entries plus the global menu', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(PRODUCTS.map(p => [p.id, p.items.map(([, label]) => label)]))), [
    ['discover', ['Discover','Welten','Strategien','Entdecken']],
    ['quant', ['Quant','Screener','Strategien','Aktien']],
    ['vorsorge', ['Vorsorge','Plan','ETFs','Portfolio']],
    ['screener', ['Screener','Treffer','Gespeichert','Watchlist']],
    ['supertrader', ['Supertrader','Methoden','Signale','Backtests']],
    ['hedgefonds', ['Hedgefonds','Investoren','Datenbank','Aktien']]
  ]);
  for (const p of PRODUCTS) {
    assert.equal(p.items[0][1], p.label);
    assert.ok(!/^(home|start)$/i.test(p.items[0][1]));
    // Der Produkteintrag fuehrt zur Startseite des Produkts
    assert.equal(p.active(loc(p.items[0][2])), p.items[0][0], `${p.id}: Startseite aktiviert den Produkteintrag`);
    for (const [id, , href] of p.items) assert.equal(p.active(loc(href)), id, `${p.id}: ${href} aktiviert ${id}`);
  }
  // ☰ oeffnet das globale Menue derselben Komponente, kein Produktmenue
  assert.match(source, /menu\.onclick=\(\)=>this\.openMenu\(menu\)/);
});

test('dock targets are existing routes of their products', () => {
  const files = { '/discover/': 'discover/index.html', '/quant/': 'quant/index.html', '/vorsorge/': 'vorsorge/index.html', '/screener/': 'screener/index.html',
    '/supertrader/': 'supertrader/index.html', '/supertrader/strategies/': 'supertrader/strategies/index.html', '/supertrader/signals/': 'supertrader/signals/index.html',
    '/supertrader/backtests/': 'supertrader/backtests/index.html', '/hedgefonds/': 'hedgefonds/index.html' };
  for (const p of PRODUCTS) for (const [, , href] of p.items) {
    const path = new URL(href, 'https://x').pathname;
    assert.ok(files[path], `${href}: unbekannte Seite`);
    assert.match(readFileSync(join(root, files[path]), 'utf8'), /\/assets\/site-navigation\.js/, `${files[path]} laedt die Shell`);
  }
  const quantRoutes = readFileSync(join(root, 'quant/app/app.js'), 'utf8');
  for (const r of ['screener', 'strategien', 'aktien']) assert.match(quantRoutes, new RegExp(`case "${r}"`));
  const vorsorge = ['plan', 'etf', 'portfolio'].map(f => readFileSync(join(root, `vorsorge/ui/${f}.js`), 'utf8')).join('\n');
  for (const r of ['plan', 'etfs', 'portfolio']) assert.match(vorsorge, new RegExp(`VS\\.views\\.${r} = function`), `Vorsorge-Ansicht ${r}`);
  const hedge = readFileSync(join(root, 'hedgefonds/app.js'), 'utf8');
  for (const r of ['investoren', 'datenbank', 'aktien']) assert.ok(hedge.includes(`#/${r}`));
  const screener = readFileSync(join(root, 'screener/app.js'), 'utf8');
  for (const v of ['results', 'saved', 'watchlist']) assert.ok(screener.includes(`${v}: view`));
});

test('active dock state follows deep links after reload', () => {
  const active = (id, url) => PRODUCTS.find(p => p.id === id).active(loc(url));
  assert.equal(active('discover', '/discover/#/thema/ki'), 'welten');
  assert.equal(active('discover', '/discover/#/s/US_REAL/NVDA'), null);
  assert.equal(active('quant', '/quant/#/screener/profi'), 'screener');
  assert.equal(active('quant', '/quant/#/aktie/NVDA/technik'), 'aktien');
  assert.equal(active('quant', '/quant/#/methodik'), null);
  assert.equal(active('quant', '/quant/screener/'), 'screener');
  assert.equal(active('vorsorge', '/vorsorge/etf/IWR/'), 'etfs');
  assert.equal(active('vorsorge', '/vorsorge/#/etf/IWDA'), 'etfs');
  assert.equal(active('vorsorge', '/vorsorge/#/xray'), 'portfolio');
  assert.equal(active('vorsorge', '/vorsorge/#/foerderung'), null);
  assert.equal(active('screener', '/screener/?view=build&f=pe'), 'screener');
  assert.equal(active('screener', '/screener/?view=compare'), 'treffer');
  assert.equal(active('supertrader', '/supertrader/stock/NVDA/'), 'signale');
  assert.equal(active('supertrader', '/supertrader/strategies/darvas-boxes/'), 'methoden');
  assert.equal(active('supertrader', '/supertrader/sources/'), null);
  assert.equal(active('hedgefonds', '/hedgefonds/#/aktie/037833100'), 'aktien');
  assert.equal(active('hedgefonds', '/hedgefonds/#/fonds/berkshire'), null);
});

test('the dock respects safe areas, keeps touch targets and sits below overlays and the menu', () => {
  assert.match(dockStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(dockStyles, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(dockStyles, /min-height:54px/);
  assert.match(dockStyles, /z-index:900/);
  assert.match(dockStyles, /:focus-visible/);
  assert.match(dockStyles, /prefers-reduced-motion/);
  assert.match(styles(THEMES.light), /z-index:1000000/);
  const css = readFileSync(join(root, 'assets/site-navigation.css'), 'utf8');
  assert.match(css, /html\[data-vu-dock\] body\{padding-bottom:var\(--vu-dock-space\)/);
  assert.match(css, /--vu-dock-space:calc\([^;]*env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /html\.vu-menu-open/);
  // Mit Leiste ist der Kopf ruhig: Logo, AI Atlas, Farbschema
  assert.match(styles(THEMES.light), /:host\(\[dock\]\) \.section,:host\(\[dock\]\) \.quick,:host\(\[dock\]\) \.toggle\{display:none\}/);
});

test('the dock is opt-in: pages that never call VUNavigation.dock keep their header unchanged', () => {
  assert.match(source, /if\(dockBus\.requested\)this\.mountDock\(\)/);
  assert.match(source, /dockBus\.requested = true;/);
  assert.doesNotMatch(source, /connectedCallback\(\)\{[^}]*\n[^]*?\n      this\.mountDock\(\);/);
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


test('compact menu preserves every old destination in six products and one additional group', () => {
  assert.deepEqual(Array.from(groups,g=>g.id), ['discover','quant','screener','vorsorge','supertrader','hedgefonds','more']);
  const destinations = new Set(groups.flatMap(g=>[g.href,...g.entries.map(e=>e[1])]).filter(Boolean));
  const previous = ['/discover/#/','/discover/#/welten','/discover/#/strategien','/discover/#/einzeln/US_REAL','/discover/#/suche','/discover/#/maerkte','/discover/#/watchlist','/dashboard/','/macro/','/etf/','/vorsorge/#/','/vorsorge/#/plan','/vorsorge/#/etfs','/vorsorge/#/portfolio','/vorsorge/#/vergleichen','/vorsorge/#/foerderung','/vorsorge/#/monitor','/vorsorge/#/wissen','/screener/','/quant/','/supertrader/','/analysten/','/hedgefonds/','/news/','/morning/','/magazin/','/reports/xpeng/','/academy/','/guide/','/budget/'];
  for(const href of previous) assert.ok(destinations.has(href),href+' remains reachable');
  for(const g of groups.slice(0,6)) assert.equal(g.href, g.entries[0][1]);
  assert.equal(groups.find(g=>g.id==='quant').entries.find(([,href])=>href==='/quant/#/screener')[0],'Quant Screener');
});

test('menu routes distinguish home, query, hash segment boundaries and detail parents', () => {
  const state=url=>menuState(loc(url));
  for(const url of ['/discover/#/','/quant/','/quant/#/','/vorsorge/#/','/screener/','/screener/?view=start','/supertrader/','/hedgefonds/#/']) assert.equal(state(url).expanded,null,url);
  const examples = [
    ['/quant/#/methodik/faktoren','quant','/quant/#/methodik'],
    ['/quant/#/aktie/AAPL/technik','quant','/quant/#/aktien'],
    ['/quant/stock/?ticker=AAPL','quant','/quant/#/aktien'],
    ['/quant/strategies/builder/','quant','/quant/#/strategien'],
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
    ['/reports/xpeng/research/','more','/reports/xpeng/']
  ];
  for(const [url,group,href] of examples){assert.equal(state(url).group,group,url);assert.equal(state(url).href,href,url);assert.equal(state(url).expanded,group,url);}
  assert.equal(state('/screener/?view=start&mode=pro').href,'/screener/');
  assert.equal(state('/screener/?view=start&mode=pro').expanded,null);
  assert.equal(state('/screener/?view=start&f=roic:gt:0.1').expanded,null);
  assert.equal(routeScore('/discover/#/welten',loc('/discover/#/weltenfremd')),-1);
  assert.equal(routeScore('/screener/',loc('/screener/?view=saved')),-1);
  assert.equal(routeScore('/quant/',loc('/quant/#/aktien')),-1);
});

test('accordion and original product symbols retain accessible shell behavior', () => {
  const sprite=readFileSync(join(root,'assets/product-icons.svg'),'utf8');
  for(const group of groups) {
    const icon=productIcon(group.icon);
    assert.match(icon,new RegExp('data-href="/assets/product-icons\\.svg#'+group.icon+'"'));
    assert.doesNotMatch(icon,/<use href=/,'hidden menu must not request its sprite');
  }
  for(const group of groups.slice(0,6)) {
    const original=sprite.match(new RegExp('<symbol id="'+group.icon+'"[^>]*>([\\s\\S]*?)</symbol>'))[1];
    assert.equal(DOCK_PRODUCT_ICONS[group.icon],original,group.icon+': exact original geometry and presentation');
    assert.doesNotMatch(dockProductIcon(group.icon),/use|href/,'dock requires no sprite request');
  }
  assert.match(source,/icon\.setAttribute\('href',icon\.getAttribute\('data-href'\)\)/);
  assert.match(source,/icon\.removeAttribute\('data-href'\)/);
  assert.match(source,/disclosure\.setAttribute\('aria-controls','menu-links-'\+id\)/);
  assert.match(source,/links\.hidden=true/);
  assert.match(source,/section\.querySelector\('\.links'\)\.hidden = !open/);
  assert.match(source,/filter\(n=>n\.getClientRects\(\)\.length&&!n\.closest\('\[hidden\]'\)\)/);
  assert.match(source,/dockProductIcon\(groups\.find\(g=>g\.id===product\.id\)\.icon\)/);
  assert.match(styles(THEMES.light),/\.mode\{width:44px;height:44px\}/);
  assert.match(styles(THEMES.light),/\.links a\{[^}]*min-height:44px/);
  assert.match(styles(THEMES.light),/\.choices button,\.choices a\{[^}]*min-width:44px;min-height:44px/);
});
