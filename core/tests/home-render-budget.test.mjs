import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Startseite (/) im Aussehen von App-Konzept 2 (Owner 14.11.2026; davor Mockup E01): ruhig statt Werbeseite.
   Diese Tests halten fest, was die Seite leicht macht und was sie verspricht:
   - keine Dauer-Animation, kein Hero-JavaScript, nur pwa.js, das zentrale Menü und ein kleines Inline-Skript; der gemeinsame
     Baustein vu-ui.js (er öffnet die Fenster) lädt erst beim ersten Tipp auf einen Auslöser, nicht beim Seitenaufbau;
   - ohne JavaScript bleibt alles lesbar: der Inhalt der Fenster steht dann auf der Seite;
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
  for (const cls of ['vu-btn', 'vu-box', 'vu-chg', 'vu-verdict', 'vu-hud', 'vu-stockhead__price', 'vu-help', 'vu-logo-tile', 'vu-pro',
    'vu-tap', 'vu-night', 'vu-stats', 'vu-persp', 'vu-navcard', 'vu-bars', 'vu-theme', 'vu-next']) {
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

/* Themenwelten auf der Startseite: Symbol statt Bild (Owner 14.11.2026, „Bilder zurueckstellen“). Geprueft an der
   Generatorausgabe aus eingefrorenen Daten; index.html zieht mit dem naechsten home-refresh-Lauf nach. */
test('die drei Themenkacheln zeigen Symbole aus dem Themen-Sprite, der Generator fordert kein Themenbild an', () => {
  const expected = read('core/tests/fixtures/home-data/expected-index.html');
  const tiles = [...expected.matchAll(/<a class="vu-theme" href="\/discover\/#\/welten"><span class="vu-hud vu-hud--lime"[^>]*><svg[^>]*><use href="\/assets\/theme-icons\.svg#([a-z0-9-]+)"\/><\/svg><\/span><span class="vu-theme__copy"><b>[^<]+<\/b><\/span><\/a>/g)].map(m => m[1]);
  assert.deepEqual(tiles, ['kuenstliche-intelligenz', 'halbleiter-chips', 'raumfahrt']);
  const sprite = read('assets/theme-icons.svg');
  for (const id of tiles) assert.ok(sprite.includes(`<symbol id="${id}" `), id + ' steht im Sprite');
  assert.doesNotMatch(expected, /assets\/(home\/worlds|themen)\//);
  assert.doesNotMatch(read('scripts/home/build-home.mjs'), /assets\/(home\/worlds|themen)\/|\.photo\b/);
});

/* App-Konzept 2: Tiefe öffnet sich im Fenster (data-vu-pop, assets/vu-ui.js). Die Startseite ist statisches HTML und muss ohne
   JavaScript vollständig lesbar bleiben: der Fensterinhalt steht in der Seite (kein <template>), ist mit Skript ausgeblendet
   und ohne Skript (noscript) oder ohne geladenen Baustein (.hm-plain) sichtbar. */
test('Fenster „Sieben Blickwinkel“: Inhalt steht in der Seite und bleibt ohne JavaScript lesbar', () => {
  const opener = html.match(/<button type="button" class="hm-more hm-js" aria-haspopup="dialog" aria-label="Alle \d+ Blickwinkel mit Erklärung" data-vu-pop="([a-z-]+)" data-vu-pop-title="Sieben Blickwinkel">Alle (\d+)</);
  assert.ok(opener, 'Auslöser mit data-vu-pop');
  const pop = html.match(new RegExp('<div class="hm-pop" id="' + opener[1] + '">([\\s\\S]*?)</div></div>'));
  assert.ok(pop, 'Fensterinhalt als Element der Seite');
  const cards = [...pop[1].matchAll(/<a class="vu-navcard" href="([^"]+)">/g)].map(m => m[1]);
  assert.equal(cards.length, Number(opener[2]), 'so viele Blickwinkel, wie der Auslöser nennt');
  assert.deepEqual(cards, ['/discover/#/s/US_REAL/NVDA', '/technical/#/chart/NVDA', '/fundamental/#/NVDA', '/quant/#/aktie/NVDA', '/supertrader/stock/NVDA/', '/elliott/#/NVDA', '/hedgefonds/#/aktien']);
  assert.doesNotMatch(html, /<template\b/, 'kein <template>: dessen Inhalt wäre ohne JavaScript unsichtbar');
  assert.match(html, /<noscript><style>\.hm-pop\{display:block\}\.hm-js\{display:none\}<\/style><\/noscript>/);
  assert.match(css, /^\.hm-pop\{display:none/m);
  assert.match(css, /^\.hm-plain \.hm-pop\{display:block\}\.hm-plain \.hm-js\{display:none\}/m);
  // Der Baustein lädt erst auf einen Tipp (kein <script src> beim Seitenaufbau); scheitert das Laden, zeigt .hm-plain den Inhalt.
  assert.match(html, /function load\(\)\{if\(state\)return;state=1;var s=document\.createElement\("script"\);s\.src="\/assets\/vu-ui\.js";/);
  assert.match(html, /s\.onload=function\(\)\{state=2;VUUI\.bindPops\(main\);/);
  assert.match(html, /s\.onerror=function\(\)\{state=3;document\.documentElement\.classList\.add\("hm-plain"\);/);
});

test('Seitenende: „Weiter“-Karte (K09) führt zur Registrierung, Kopfkachel trägt die vier Zahlen', () => {
  assert.match(html, /<a class="vu-next" href="\/konto\/registrieren\/\?plan=free"><span class="vu-next__t"><span class="vu-ltag">Bereit für deinen Start\?<\/span><b>Kostenlos starten<\/b><span>In zwei Minuten eingerichtet\.<\/span>/);
  const band = html.match(/<div class="vu-stats" role="list" aria-label="Vision Universe in Zahlen">([\s\S]*?)<\/div><\/div>/);
  assert.deepEqual([...band[1].matchAll(/<b class="vu-num">([^<]+)<\/b><span>([^<]+)<\/span>/g)].map(m => (m[1] + ' ' + m[2]).replace(/\u00ad/g, '')), // ohne weiche Trennzeichen
    ['6.000+ US-Aktien', '9 Welten in einer App', '12 J. Zahlen je Aktie aus Unternehmensberichten', '7.000+ ETFs für deine Vorsorge']);
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

test('Kopf-Grundstil im Kopf der Seite: wortgleich aus home.css (kein Sprung des Kopfes hinter der Zugangsmaske, CLS 0,27)', () => {
  const m = html.match(/<style>(body\{margin:0;padding-top:56px[\s\S]*?)<\/style>/);
  assert.ok(m, 'Kopf-Grundstil steht vor den Stylesheets');
  assert.ok(html.indexOf(m[0]) < html.indexOf('<link rel="stylesheet" href="/assets/site-navigation.css">'), 'vor dem ersten Stylesheet');
  assert.ok(template.includes(m[0]), 'steht in der Vorlage (index.html entsteht aus build-home.mjs)');
  const blocks = (text) => [...text.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(x => [x[1].trim(), x[2].split(';').map(d => d.trim()).filter(Boolean)]);
  const real = blocks(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  const declared = (sel, decl) => real.some(([s, ds]) => s === sel && ds.includes(decl));
  const rules = blocks(m[1].replace(/@media\([^)]*\)\{/g, ''));
  assert.ok(rules.length >= 12);
  for (const [sel, decls] of rules) for (const d of decls) assert.ok(declared(sel, d), `home.css kennt ${sel}{${d}}`);
});
