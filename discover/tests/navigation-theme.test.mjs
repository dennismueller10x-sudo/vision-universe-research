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
  customElements: { define(name, type) { assert.equal(name, 'vu-navigation'); Navigation = type; } }
};
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.__nav = { groups, styles, THEMES };})();'), sandbox);
const { groups, styles, THEMES } = sandbox.__nav;
const normalized = JSON.parse(JSON.stringify(groups.map(([heading, entries]) => [heading, entries.map(([label, href]) => [label, href])])));

// Product routes have one owner in the platform menu. Discover's hash routes
// belong to its own navigation, even while the platform menu is open there.
test('the global menu groups every existing product route exactly once', () => {
  assert.deepEqual(normalized.map(([heading]) => heading),
    ['Discover','Markets & Data','Analyse','Research','Learn','Tools & Personal']);
  const routes = normalized.flatMap(([, entries]) => entries.map(([, href]) => href));
  assert.equal(new Set(routes).size, routes.length);
  for (const route of ['/discover/','/quant/','/dashboard/','/macro/','/etf/','/analysten/',
    '/hedgefonds/','/news/','/morning/','/magazin/','/reports/xpeng/','/academy/','/guide/','/budget/']) {
    assert.ok(routes.includes(route), `${route} fehlt`);
  }
  assert.deepEqual(normalized[0][1], [['Discover','/discover/']]);
  assert.ok(routes.every(route => !route.includes('#/')), 'Discover-Unterseiten gehören nicht ins globale Menü');
});

test('Discover has its own routes and the mobile dock stays at four destinations', () => {
  const app = readFileSync(join(root, 'discover/app.js'), 'utf8');
  const css = readFileSync(join(root, 'discover/app.css'), 'utf8');
  for (const route of ['#/welten','#/maerkte','#/einzeln/','#/']) assert.ok(app.includes(route));
  assert.match(app, /\['suche','Suchen',null,'search'\]/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /\.v2-markets-link\{display:none\}/);
  assert.doesNotMatch(app.match(/function navigation\(\)[\s\S]*?return nav;/)[0], /Quant|Academy|Hedgefonds|Research/);
});

test('the shared header remains themeable and offers light and dark contrast', () => {
  assert.ok(Navigation.observedAttributes.includes('theme'));
  const light = styles(THEMES.light), dark = styles(THEMES.dark);
  assert.match(light, /rgba\(255,255,255,\.96\)/);
  assert.match(dark, /rgba\(8,8,10,\.92\)/);
  assert.match(light, /:host\(\[open\]\) \.panel/);
  assert.match(dark, /:host\(\[open\]\) \.panel/);
  assert.doesNotMatch(source, /Development Preview[^\n]*<[^>]*class="preview"/);
});
