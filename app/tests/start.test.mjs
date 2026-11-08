// Owner 08.11.2026: Die App beginnt mit der Willkommensseite (docs/accounts/NUTZERFUEHRUNG.md), nicht mit Discover.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../www/js/main.js', import.meta.url), 'utf8');
const gestures = fs.readFileSync(new URL('../../assets/vu-gestures.js', import.meta.url), 'utf8');

test('Startansicht der App-Hülle ist /willkommen/', () => {
  assert.match(html, /<section id="v-start" class="view frame-view" data-path="\/willkommen\/"/);
  assert.match(main, /\n  show\('start'\);\n  hideSplash\(\);/, 'erste Ansicht beim Start');
  assert.match(main, /let lastFrame = 'start';/);
  assert.doesNotMatch(main, /show\('discover'\)/, 'kein Rückfall auf Discover');
  for (const m of html.matchAll(/data-view="([a-z]+)"/g)) assert.ok(html.includes(`id="v-${m[1]}"`), 'Ansicht fehlt: ' + m[1]);
});

test('Zurück endet auf der Willkommensseite (Android: App minimieren, iOS: keine Zurück-Geste)', () => {
  const re = gestures.match(/function isHome\(\) \{ return (\/.+?\/)\.test/);
  assert.ok(re, 'isHome fehlt');
  const isHome = new RegExp(re[1].slice(1, -1));
  assert.ok(isHome.test('/willkommen/'));
  assert.ok(isHome.test('/discover/'));
  assert.ok(!isHome.test('/willkommen/start/'));
});
