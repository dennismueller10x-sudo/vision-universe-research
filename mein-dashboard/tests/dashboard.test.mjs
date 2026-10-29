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
    'viewport-fit=cover', '/konto/config.js', '/konto/account-api.js', '/konto/konto.css', '/core/watchlist-view.js', '/mein-dashboard/dashboard.js']) {
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
  assert.deepEqual([...new Set(calls)], ['/v1/auth/logout', '/v1/me', '/v1/session', '/v1/watchlist', '/v1/watchlist/import',
    '/v1/watchlist/items', '/v1/watchlist/items/remove'], 'nur die vorhandenen Konto- und Watchlist-Aufrufe');
  assert.ok(!/localStorage\.setItem/.test(code), 'schreibt nichts in den Browser-Speicher (liest nur die lokalen Listen)');
  assert.match(code, /W\.legacyTickers/, 'lokale Listen ueber dieselbe Leseregel wie /konto/watchlist/');
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|outerHTML/.test(code), 'keine Serverdaten per innerHTML');
});

test('keine nicht freigegebenen Inhalte: kein Quant-Gesamtscore, keine Supertrader-Signale', () => {
  assert.ok(!/composite|quantScore|universeRank|\.quant\b|supertrader\.(status|entries)|VALID_SIGNAL/.test(code), 'liest weder Quant noch Supertrader-Zustaende');
  assert.match(code, /v\.price/, 'zeigt nur den veroeffentlichten Schluss');
});

test('Leerstaat, Detailansicht und Erweiterbarkeit', () => {
  assert.match(html, /id="md-watch-empty"[^]*Noch keine Aktien gespeichert/);
  assert.match(html, /href="\/konto\/watchlist\/"/, 'Detailansicht bleibt /konto/watchlist/');
  assert.match(code, /var MODULES = \[\]/, 'Bereiche als Module');
  for (const id of ['greeting', 'watchlist', 'add', 'local', 'shortcuts']) assert.match(code, new RegExp(`id: '${id}'`), id);
  for (const p of ['discover', 'quant', 'fundamental', 'technical']) assert.match(code, new RegExp(`id: '${p}'`), `Schnellzugriff ${p}`);
});
