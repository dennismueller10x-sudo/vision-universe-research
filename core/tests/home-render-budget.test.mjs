import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Startseite (/) nach dem Redesign (Mockup E01): ruhig statt Werbeseite.
   Diese Tests halten fest, was die neue Seite leicht macht und was sie verspricht:
   - keine Dauer-Animation, kein Hero-JavaScript, nur pwa.js, das zentrale Menü und ein kleines Inline-Skript;
   - alle Bausteine kommen aus der gemeinsamen Grundlage (assets/vu-ui.css, Markup über assets/vu-ui.js);
   - jede Zahl stammt aus dem Generator (index.html = Ausgabe von build-home.mjs);
   - der Pro-Preis steht nie im Code, Free kostet 0 €. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = p => readFileSync(join(root, p), 'utf8');
const css = read('assets/home/home.css');
const base = read('assets/vu-ui.css');
const html = read('index.html');
const template = read('scripts/home/index.template.html');

test('keine Dauer-Animation und kein Hero-JavaScript', () => {
  assert.doesNotMatch(css, /infinite/);
  assert.doesNotMatch(css, /@keyframes/);
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(scripts, ['/assets/pwa.js', '/assets/site-navigation.js']);
  assert.match(html, /<vu-navigation menu-only no-dock/);
  assert.match(html, /data-vu-menu-toggle/);
  assert.doesNotMatch(html, /hero-intro\.js|home-motion\.js/);
});

test('die Seite nutzt die gemeinsamen Bausteine und definiert sie nicht neu', () => {
  assert.match(html, /<link rel="stylesheet" href="\/assets\/site-navigation\.css">\s*<link rel="stylesheet" href="\/assets\/vu-ui\.css">\s*<link rel="stylesheet" href="\/assets\/home\/home\.css">/);
  assert.match(html, /<body class="vu-ui">/);
  assert.match(read('scripts/home/build-home.mjs'), /createRequire\(import\.meta\.url\)\('\.\.\/\.\.\/assets\/vu-ui\.js'\)/, 'Markup kommt aus VUUI');
  for (const cls of ['vu-btn', 'vu-box', 'vu-chg', 'vu-verdict', 'vu-hud', 'vu-stockhead__price', 'vu-help', 'vu-logo-tile', 'vu-pro']) {
    assert.ok(html.includes(cls), cls + ' wird genutzt');
    assert.match(base, new RegExp('\\.' + cls.replace(/[-_]/g, m => '\\' + m) + '[{.,:\\[ ]'), cls + ' kommt aus vu-ui.css');
    assert.doesNotMatch(css, new RegExp('^\\.' + cls + '\\{', 'm'), cls + ' wird auf der Startseite nicht neu definiert');
  }
});

/* Die Generatorlogik wird gegen EINGEFRORENE Daten geprueft (core/tests/fixtures/home-data, Ausgabe expected-index.html),
   nicht gegen den Tagesstand: index.html entsteht erst nach den Datenlaeufen durch home-refresh.yml, und ein Test, der
   beide vergleicht, ist nach jedem Datentag bis zu diesem Lauf rot (13.11.2026, Strang AM). Dass die ausgelieferte Startseite
   zum Tagesstand passt, meldet der Alarm scripts/home/check-home-fresh.mjs im Freshness-Monitor (blockiert keinen Code-PR). */
test('der Generator liefert aus eingefrorenen Daten genau die erwartete Startseite', () => {
  const fx = join(root, 'core/tests/fixtures/home-data');
  const out = join(mkdtempSync(join(tmpdir(), 'home-')), 'index.html');
  execFileSync(process.execPath, [join(root, 'scripts/home/build-home.mjs'), '--data=' + fx, '--out=' + out], { cwd: root });
  assert.equal(readFileSync(out, 'utf8'), readFileSync(join(fx, 'expected-index.html'), 'utf8'),
    'Generator oder Template geaendert: node scripts/home/build-home.mjs --data=core/tests/fixtures/home-data --out=core/tests/fixtures/home-data/expected-index.html');
  assert.doesNotMatch(html, /%%[A-Z0-9_]+%%/, 'index.html enthaelt einen offenen Platzhalter');
});

test('Urteile sind die drei Formen aus C08, ein Chart, Preis nie fest im Code', () => {
  assert.equal((html.match(/class="vu-verdict vu-verdict--(strong|mid|weak|none)"/g) || []).length, 3);
  assert.equal((html.match(/class="vu-onechart"/g) || []).length, 1);
  assert.match(html, /<strong>0 €<\/strong>/);
  assert.doesNotMatch(template, /\d+,\d\d\s*€/, 'kein fester Pro-Preis (Preisseite liest GET \/v1\/plans)');
  assert.match(template, /href="\/preise\/"/);
});

test('Wege der Startseite: Konto, Umsehen ohne Konto, drei Einstiege, alle neun Welten', () => {
  assert.match(template, /href="\/konto\/registrieren\/\?plan=free"/);
  assert.match(template, /href="\/discover\/">Erst umsehen, ohne Konto/);
  assert.equal((template.match(/data-start-path="/g) || []).length, 3);
  for (const w of ['discover', 'quant', 'technical', 'fundamental', 'supertrader', 'hedgefonds', 'elliott', 'screener', 'vorsorge']) assert.ok(html.includes(`href="/${w}/"`), w);
});

test('reduzierte Bewegung und 44-px-Ziele im Kopf', () => {
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.hd-btn\{width:44px;height:44px/);
  assert.match(css, /\.hd-login\{[^}]*min-height:44px/);
});
