// Mein Dashboard (/mein-dashboard/): Seitenstruktur und Datengrenzen. Den Weg im Browser prueft
// scripts/account/journey-qa.mjs gegen die lokale Simulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const js = readFileSync(join(ROOT, 'dashboard.js'), 'utf8');
const code = js.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

test('Seite: gemeinsame Shell, Theme, noindex, nur eigene Skripte, keine Inline-Handler', () => {
  for (const must of ['<vu-navigation theme="light" theme-switch no-preview>', '/assets/site-navigation.js', '/assets/site-navigation.css',
    'vu-discover-theme-v1', '<meta name="robots" content="noindex,nofollow">', '<meta name="referrer" content="no-referrer">',
    'viewport-fit=cover', '/konto/config.js', '/konto/account-api.js', '/konto/konto.css', '/core/watchlist-view.js', '/assets/vu-ui.css', '/assets/vu-ui.js', '/assets/vu-chart.js', '/mein-dashboard/today.js', '/mein-dashboard/events.js', '/mein-dashboard/dashboard.js']) {
    assert.ok(html.includes(must), must);
  }
  assert.ok(!/<script[^>]+src="https?:/.test(html), 'keine externen Skripte');
  assert.ok(!/\son[a-z]+=/.test(html), 'keine Inline-Handler');
  assert.ok(!/style="/.test(html), 'keine Inline-Styles');
  assert.ok(html.indexOf('/core/watchlist-view.js') < html.indexOf('/mein-dashboard/dashboard.js'));
});

test('nur nach Anmeldung, nur bestehende Schnittstellen, keine eigene Datenhaltung', () => {
  assert.match(code, /A\.get\('\/v1\/session'\)[^]*authenticated[^]*go\('\/konto\/anmelden\/\?next='/, 'ohne Sitzung zur Anmeldung');
  const calls = [...code.matchAll(/A\.(get|post|patch)\('([^']+)'/g)].map(m => m[2]).sort();
  // Abmelden liegt seit dem Redesign im Konto (E07, Platz 3 der Leiste), nicht mehr in einer Link-Zeile hier.
  // Entfernen liegt seit dem Umbau (Konzept mein-bereich-2026-11, Screen m-home) in der Detailansicht /konto/watchlist/.
  assert.deepEqual([...new Set(calls)], ['/v1/me', '/v1/session', '/v1/watchlist', '/v1/watchlist/import',
    '/v1/watchlist/items'], 'nur die vorhandenen Konto- und Watchlist-Aufrufe');
  assert.ok(!/localStorage\.setItem/.test(code), 'schreibt nichts in den Browser-Speicher (liest nur die lokalen Listen)');
  assert.match(code, /W\.legacyTickers/, 'lokale Listen ueber dieselbe Leseregel wie /konto/watchlist/');
  assert.ok(!/insertAdjacentHTML|document\.write|outerHTML/.test(code), 'kein freies HTML');
  // innerHTML nur an einer Stelle (markup) und nur mit Ausgabe der Bausteine (VUUI maskiert jede Eingabe; VUChart.sparkline nur Zahlen).
  assert.equal((code.match(/innerHTML/g) || []).length, 1, 'innerHTML nur in markup()');
  for (const line of code.split('\n').filter(l => /markup\(/.test(l) && !/function markup/.test(l))) assert.match(line, /markup\(el\([^)]*\), (U\.[a-z]+\(|html\))/i, 'markup nur mit VUUI: ' + line.trim());
  assert.ok(!/localStorage\.(removeItem|clear)/.test(code), 'loescht nichts im Browser-Speicher');
});

test('keine nicht freigegebenen Inhalte: kein Quant-Gesamtscore, keine Supertrader-Signale', () => {
  // Ereignisse der Welten kommen nur aus mein-dashboard/events.js (eigener Test); das Dashboard selbst liest keine Zustaende.
  assert.ok(!/composite|quantScore|universeRank|\.quant\b|supertrader\.(status|entries)|VALID_SIGNAL/.test(code), 'liest weder Quant noch Supertrader-Zustaende');
  assert.match(code, /v\.price/, 'zeigt nur den veroeffentlichten Schluss');
  assert.match(code, /E\.load\(fetchJson, fetchGz, Id, stocks/, 'Ereignisse ueber events.js');
});

test('gesperrte Identitaet (Ticker-Wiederverwendung): kein Verweis, auch kein Discover-Ersatz; Text aus der Ansicht', () => {
  assert.match(code, /function stockHref\(v\) \{\s*if \(v\.identity && v\.identity\.reason === 'IDENTITY_QUARANTINED'\) return null;/,
    'vor Produktverweis und Discover-Rueckfall');
  assert.match(code, /v\.identity && v\.identity\.reasonText \? v\.identity\.reasonText/, 'Grund als Text der Ansicht, nie als Code');
});

test('Leerstaat, Detailansicht und Erweiterbarkeit', () => {
  assert.match(html, /id="md-watch-empty"[^]*Noch keine Aktien gespeichert/);
  assert.match(html, /href="\/konto\/watchlist\/"/, 'Detailansicht bleibt /konto/watchlist/');
  assert.match(code, /var MODULES = \[\]/, 'Bereiche als Module');
  for (const id of ['greeting', 'today', 'watchlist', 'events', 'learn', 'add', 'local', 'shortcuts']) assert.match(code, new RegExp(`id: '${id}'`), id);
  // Aufbau von oben nach unten (HANDOVER Entscheidung 1)
  const order = ['md-today', 'md-strip', 'md-feed', 'md-learn', 'md-tiles'].map(id => html.indexOf(`id="${id}"`));
  assert.ok(order.every((v, i) => v > 0 && (!i || v > order[i - 1])), 'Heute · Watchlist · Was sich getan hat · Weiter lernen · Deine Welten');
  assert.ok(!/localStorage\.setItem\(SEEN_KEY/.test(code), 'Gesehen-Merker der Willkommensseite nur gelesen');
  for (const p of ['discover', 'quant', 'fundamental', 'technical']) assert.match(code, new RegExp(`id: '${p}'`), `Schnellzugriff ${p}`);
});
