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

test('Gate-Hygiene: App-Branch beruehrt nur app/, die Mobile-Dokumente und den freigegebenen Auslieferungsausschluss', () => {
  let base;
  try { base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {cwd: repo, encoding: 'utf8'}).trim(); } catch { return; } // flacher Checkout ohne Basis: nicht pruefbar
  const files = execFileSync('git', ['diff', '--name-only', base], {cwd: repo, encoding: 'utf8'}).split('\n').filter(Boolean);
  // Ausschluss von app/ aus Pages: Owner-Freigabe Phase 2 (eine Zeile in permitted() und seine Pruefung)
  const approved = new Set(['scripts/vu2/build-release.mjs', 'quant/tests/release-delivery.test.mjs']);
  const bad = files.filter(f => !approved.has(f) && !/^(app\/|docs\/architecture\/ADR-00[4-9]|docs\/mobile\/)/.test(f));
  assert.deepEqual(bad, []);
});

test('Signier- und Zugangsdaten: ignoriert und nirgends im App-Verzeichnis eingecheckt', () => {
  const ignore = read(path.join(app, '.gitignore'));
  for (const p of ['*.p12', '*.p8', '*.key', '*.pem', '*.csr', '*.cer', '*.mobileprovision', 'vu-signing/', 'AuthKey_*.p8']) assert.ok(ignore.includes(p), p);
  const tracked = execFileSync('git', ['ls-files', '-z', 'app'], {cwd: repo, encoding: 'utf8'}).split('\0').filter(Boolean);
  const bad = tracked.filter(f => /\.(p12|p8|pfx|key|pem|csr|cer|mobileprovision|provisionprofile)$/i.test(f) || /(^|\/)AuthKey_/.test(f) || /(^|\/)\.env/.test(f));
  assert.deepEqual(bad, []);
  for (const f of tracked.filter(f => /\.(m?js|json|sh|md|template|plist|yml|yaml|html|css|swift|rb)$/i.test(f) || /Fastfile$/.test(f))) {
    const t = fs.readFileSync(path.join(repo, f), 'utf8');
    assert.doesNotMatch(t, /-----BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]{20,}-----END/, f);
    assert.doesNotMatch(t, /\bsk_(live|test)_[A-Za-z0-9]{10,}|\bsb_secret_[A-Za-z0-9_]{10,}|\bwhsec_[A-Za-z0-9]{10,}/, f);
  }
});

test('Pipeline-Vorlagen: keine Artefakt-Uploads, Geheimnisse nur aus secrets, Eingaben nur ueber env, Umgebung mit Pruefern', () => {
  const wf = read(path.join(app, 'ci/ios-testflight.workflow.yml.template'));
  assert.doesNotMatch(wf, /upload-artifact|actions\/cache/, 'keine Artefakte oder Caches mit Signierdaten');
  const runBlocks = wf.split('\n').filter(l => /^\s+run:/.test(l) || /^\s{12,}/.test(l)).join('\n');
  assert.doesNotMatch(runBlocks, /\$\{\{\s*(inputs|secrets|vars)\./, 'in run-Bloecken keine Ausdruecke, nur env');
  assert.match(wf, /environment:\s*app-testflight/);
  assert.match(wf, /permissions:\s*\n\s+contents:\s*read/);
  assert.match(wf, /github\.ref == 'refs\/heads\/main'/);
  assert.match(wf, /preflight_only/);
  assert.doesNotMatch(wf, /pull_request/, 'nur von Hand');
});
