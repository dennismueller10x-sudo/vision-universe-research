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
  assert.match(block, /active-view-transition-type\(vu-back\)::view-transition-old\(root\)\{z-index:1;/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{::view-transition-group\(\*\),::view-transition-old\(\*\),::view-transition-new\(\*\)\{animation:none!important\}\}/);
});

test('K2 · Richtung aus der Navigation API, kein zweiter Slide nach nativer App-Geste', () => {
  assert.match(js, /addEventListener\('pageswap'/);
  assert.match(js, /addEventListener\('pagereveal'/);
  assert.match(js, /activation\.entry\.index < activation\.from\.index \? 'vu-back' : 'vu-forward'/);
  assert.match(js, /nativeEdge && activation\.navigationType === 'traverse'\)\) \{ transition\.skipTransition\(\)/);
});

test('K2 · Vorladen begrenzt: hoechstens 4 Ziele, nie Konto, nie bei Datensparen/2G, erst nach Ruhe', () => {
  assert.match(js, /urls\.slice\(0, 4\)/);
  assert.match(js, /!\/\^\\\/konto\\\/\/\.test\(u\.pathname\)/);
  assert.match(js, /c\.saveData \|\| \/\(\^\|-\)2g\$\/\.test/);
  assert.match(js, /not: \{href_matches: '\/konto\/\*'\}/);
  assert.match(js, /setTimeout\(\(\) => idle\(warm, \{timeout: 4000\}\), 3000\)/);
});
