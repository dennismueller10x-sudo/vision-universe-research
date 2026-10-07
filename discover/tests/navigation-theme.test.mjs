import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(join(root, 'assets/site-navigation.js'), 'utf8');
let Navigation;
const sandbox = {
  HTMLElement: class {},
  URLSearchParams,
  customElements: { define(name, type) { assert.equal(name, 'vu-navigation'); Navigation = type; } }
};
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.__nav = { groups, styles, THEMES, PRODUCTS, dockStyles };})();'), sandbox);
const { groups, styles, THEMES, PRODUCTS, dockStyles } = sandbox.__nav;
const normalized = JSON.parse(JSON.stringify(groups.map(([heading, entries]) => [heading, entries.map(([label, href]) => [label, href])])));

// Discover shortcuts stay within Discover; the other groups link to platform products.
test('the shared menu groups product routes and Discover destinations', () => {
  assert.deepEqual(normalized.map(([heading]) => heading),
    ['Discover','Markets & Data','Vorsorge','Analyse','Research','Learn','Tools & Personal']);
  const routes = normalized.flatMap(([, entries]) => entries.map(([, href]) => href));
  assert.equal(new Set(routes).size, routes.length);
  for (const route of ['/screener/','/quant/','/supertrader/','/dashboard/','/macro/','/etf/','/analysten/',
    '/hedgefonds/','/news/','/morning/','/magazin/','/reports/xpeng/','/academy/','/guide/','/budget/','/vorsorge/#/']) {
    assert.ok(routes.includes(route), `${route} fehlt`);
  }
  assert.deepEqual(normalized[0][1], [
    ['Start','/discover/#/'],['Welten','/discover/#/welten'],['Strategien','/discover/#/strategien'],
    ['Entdecken','/discover/#/einzeln/US_REAL'],['Suchen','/discover/#/suche'],
    ['Märkte','/discover/#/maerkte'],['Watchlist','/discover/#/watchlist']
  ]);
  // Hash-Routen gehoeren zu ihrer eigenen Produkt-App (Discover, Vorsorge).
  assert.ok(routes.filter(route => route.includes('#/')).every(route => route.startsWith('/discover/#/') || route.startsWith('/vorsorge/#/')));
});

test('Discover has separate worlds and strategies routes and uses the shared product dock', () => {
  const app = readFileSync(join(root, 'discover/app.js'), 'utf8');
  const css = readFileSync(join(root, 'discover/app.css'), 'utf8');
  // Die Ziele der Leiste und des Menues sind echte Routen der Discover-App
  for (const key of ['welten','strategien','maerkte','einzeln','suche','watchlist']) assert.ok(app.includes(`parts[0]==='${key}'`), key);
  // Suche bleibt erreichbar: eigene Route, Tastatur und Menue, nur nicht mehr in der Leiste.
  assert.match(app, /parts\[0\]==='suche'/);
  // Keine zweite, produkteigene Leiste und kein zweiter Kopfstreifen mehr.
  assert.doesNotMatch(app, /v2-dock|v2-nav-item|v2-bar/);
  assert.doesNotMatch(css, /\.v2-dock|\.v2-nav-item|\.v2-bar\b/);
  assert.doesNotMatch(app.match(/function shell\(\)[\s\S]*?function setupSearch/)[0], /v2-watch-link|v2-wordmark|Quant|Academy|Hedgefonds|Research/);
  const discover = PRODUCTS.find(p => p.id === 'discover');
  assert.deepEqual(JSON.parse(JSON.stringify(discover.items.map(([, label, href]) => [label, href]))), [
    ['Discover','/discover/#/'],['Welten','/discover/#/welten'],['Strategien','/discover/#/strategien'],['Entdecken','/discover/#/einzeln/US_REAL']
  ]);
});

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

test('the shared header remains themeable and offers light and dark contrast', () => {
  assert.ok(Navigation.observedAttributes.includes('theme'));
  const light = styles(THEMES.light), dark = styles(THEMES.dark);
  assert.match(light, /rgba\(255,255,255,\.96\)/);
  assert.match(dark, /rgba\(8,8,10,\.92\)/);
  assert.match(light, /:host\(\[open\]\) \.panel/);
  assert.match(dark, /:host\(\[open\]\) \.panel/);
  assert.match(light, /\.section\{display:none\}/);
  assert.match(light, /\.links\{grid-template-columns:1fr\}/);
  assert.match(light, /panelBg:\s*#101318|background:#101318/);
  assert.doesNotMatch(source, /Development Preview[^\n]*<[^>]*class="preview"/);
});

test('pages with dark styles get the theme switch between AI Atlas and the menu', () => {
  assert.match(source, /theme-switch/);
  assert.match(source, /<\/a>\$\{this\.hasAttribute\('theme-switch'\)\?'<button class="mode"[^`]*<button class="toggle"/);
  assert.match(source, /const THEME_KEY = 'vu-discover-theme-v1'/);
  for (const page of ['discover/index.html', 'screener/index.html', 'hedgefonds/index.html', 'ask/index.html']) {
    assert.match(readFileSync(join(root, page), 'utf8'), /<vu-navigation[^>]*\btheme-switch\b/, `${page} ohne Schalter`);
  }
});

test('der fuenfte Direktlink (Vorsorge) weicht unter 900 px, damit der Menue-Button sichtbar bleibt', () => {
  assert.match(source, /<a class="q-extra" href="\/vorsorge\/">Vorsorge<\/a>/);
  assert.match(source, /@media\(max-width:900px\)\{\.quick a\.q-extra\{display:none\}\}/);
});
