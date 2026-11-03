// Statische Waechter: halten die Grenzen aus ADR-007 ein.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readConfig, DEFAULT_CONFIG} from '../www/js/config.js';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(app, '..');
const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
// www/vendor/ ist das erzeugte Plugin-Bundle (nicht eingecheckt). Dessen Web-Rueckfall nutzt localStorage; pickStore() waehlt ihn nie (siehe token-store.test.mjs).
const www = walk(path.join(app, 'www')).filter(f => /\.(js|html|css)$/.test(f) && !f.includes(path.join('www', 'vendor')));
const read = f => fs.readFileSync(f, 'utf8');
// Kommentare zaehlen nicht: geprueft wird ausgefuehrter Code.
const code = f => read(f).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

test('www: kein Web-Speicher fuer irgendetwas', () => {
  for (const f of www) assert.doesNotMatch(code(f), /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/, f);
});

test('www: keine Zahlungs- oder Store-Bibliotheken, keine Geheimnisse', () => {
  for (const f of www) {
    const t = code(f);
    assert.doesNotMatch(t, /stripe|revenuecat|storekit|in-?app-?purchase|sk_(live|test)|rk_(live|test)|whsec_|service_role|sb_secret_/i, f);
  }
});

test('Konfiguration im Repository ist leer und kein Schluessel', () => {
  assert.equal(DEFAULT_CONFIG.supabaseUrl, '');
  assert.equal(DEFAULT_CONFIG.supabasePublishableKey, '');
  assert.equal(readConfig({}).configured, false);
  assert.equal(readConfig({VU_APP_CONFIG: {supabaseUrl: 'https://p.supabase.co/', supabasePublishableKey: 'sb_publishable_x'}}).configured, true);
  assert.equal(readConfig({VU_APP_CONFIG: {supabaseUrl: 'https://p.supabase.co/', supabasePublishableKey: 'k'}}).supabaseUrl, 'https://p.supabase.co');
});

test('Capacitor: nur die Forschungsseite darf in der WebView navigiert werden, kein server.url, kein Klartext', () => {
  const c = JSON.parse(read(path.join(app, 'capacitor.config.json')));
  assert.equal(c.server.url, undefined);
  assert.equal(c.server.cleartext, false);
  assert.deepEqual(c.server.allowNavigation, ['research.visionuniverse.de']);
  assert.equal(c.webDir, 'www');
});

test('Shell: CSP ohne unsafe-inline/eval, Safe-Area vorbereitet', () => {
  const html = read(path.join(app, 'www/index.html'));
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.doesNotMatch(csp, /unsafe-(inline|eval)/);
  assert.doesNotMatch(csp, /localhost|127\.0\.0\.1/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(read(path.join(app, 'www/app.css')), /safe-area-inset-bottom/);
});

test('Gate-Hygiene: App-Branch beruehrt nur app/ und die ADR-Dokumente', () => {
  let base;
  try { base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {cwd: repo, encoding: 'utf8'}).trim(); } catch { return; } // flacher Checkout ohne Basis: nicht pruefbar
  const files = execFileSync('git', ['diff', '--name-only', base], {cwd: repo, encoding: 'utf8'}).split('\n').filter(Boolean);
  const bad = files.filter(f => !/^(app\/|docs\/architecture\/ADR-00[4-9]|docs\/mobile\/)/.test(f));
  assert.deepEqual(bad, []);
});
