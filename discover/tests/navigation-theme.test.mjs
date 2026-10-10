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
  URL, URLSearchParams,
  customElements: { define(name, type) { assert.equal(name, 'vu-navigation'); Navigation = type; } }
};
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.__nav = { groups, styles, THEMES, PRODUCTS, dockStyles };})();'), sandbox);
const { groups, styles, THEMES, PRODUCTS, dockStyles } = sandbox.__nav;
const normalized = JSON.parse(JSON.stringify(groups.map(({label, entries}) => [label, entries.map(([label, href]) => [label, href])])));

// Discover shortcuts stay within Discover; the other groups link to platform products.
test('the shared menu groups product routes and Discover destinations', () => {
  assert.deepEqual(normalized.map(([heading]) => heading),
    ['Discover','Quant','Screener','Vorsorge','Supertrader','Hedgefonds','Weitere Produkte']);
  const routes = normalized.flatMap(([, entries]) => entries.map(([, href]) => href));
  assert.equal(new Set(routes).size, routes.length);
  for (const route of ['/screener/','/quant/','/supertrader/','/dashboard/','/macro/','/etf/','/analysten/',
    '/hedgefonds/','/news/','/morning/','/magazin/','/reports/xpeng/','/academy/','/guide/','/budget/','/vorsorge/#/']) {
    assert.ok(routes.includes(route), `${route} fehlt`);
  }
  assert.deepEqual(normalized[0][1], [
    ['Übersicht','/discover/#/'],['Welten','/discover/#/welten'],['Strategien','/discover/#/strategien'],
    ['Entdecken','/discover/#/einzeln/US_REAL'],['Suchen','/discover/#/suche'],
    ['Märkte','/discover/#/maerkte'],['Watchlist','/discover/#/watchlist']
  ]);
  // Hash-Routen gehoeren zu vorhandenen Produkt-Apps; Screener nutzt Query-Routen.
  assert.ok(routes.filter(route => route.includes('#/')).every(route => /^\/(discover|vorsorge|quant|hedgefonds)\/#\//.test(route)));
  for (const group of groups.filter(g=>g.id!=='more')) {
    const prefix=group.href.split('#')[0];
    assert.ok(group.entries.every(([,href])=>href.startsWith(prefix)),group.label+' stays within its product');
  }
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
