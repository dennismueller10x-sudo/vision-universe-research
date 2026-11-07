// K2 (Owner 07.11.2026, App-Gefuehl): Seitenwechsel gleiten vor/zurueck, Leiste bleibt stehen, Produktziele vorgeladen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css = readFileSync('assets/site-navigation.css', 'utf8');
const js = readFileSync('assets/site-navigation.js', 'utf8');

test('K2 · View Transitions nur ohne reduzierte Bewegung; Leiste und Kopf stehen', () => {
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion:no-preference){\n  @view-transition'));
  assert.match(block, /@view-transition\{navigation:auto\}/);
  assert.match(block, /#vu-dock\{view-transition-name:vu-dock\}/);
  assert.match(block, /::view-transition-group\(vu-dock\),::view-transition-group\(vu-nav\)\{animation:none\}/);
  assert.match(block, /html::view-transition-new\(root\)\{animation:\.24s [^}]*vu-vt-in-right\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{::view-transition-group\(\*\),::view-transition-old\(\*\),::view-transition-new\(\*\)\{animation:none!important\}\}/);
});

test('K2 · nur vorwaerts gleiten; zurueck (auch nach nativer App-Geste) und Neuladen ohne zweite Animation', () => {
  assert.match(js, /activation\.navigationType !== 'traverse' && activation\.navigationType !== 'reload'/);
  assert.match(js, /e\.viewTransition\.skipTransition\(\); flag\(true\)/);
  assert.match(js, /addEventListener\('pagereveal', e => \{ if \(flag\(false\) && e\.viewTransition\) e\.viewTransition\.skipTransition\(\); \}\)/);
});

test('K2 · Vorladen begrenzt: hoechstens 4 Ziele, nie Konto, nie bei Datensparen/2G, erst nach Ruhe', () => {
  assert.match(js, /urls\.slice\(0, 4\)/);
  assert.match(js, /!\/\^\\\/konto\\\/\/\.test\(u\.pathname\)/);
  assert.match(js, /c\.saveData \|\| \/\(\^\|-\)2g\$\/\.test/);
  assert.match(js, /not: \{href_matches: '\/konto\/\*'\}/);
  assert.match(js, /setTimeout\(\(\) => idle\(warm, \{timeout: 4000\}\), 3000\)/);
});
