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

test('Gate-Hygiene: App-Branch beruehrt nur freigegebene App- und Integrationspfade', () => {
  let base;
  try { base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {cwd: repo, encoding: 'utf8'}).trim(); } catch { return; } // flacher Checkout ohne Basis: nicht pruefbar
  const files = execFileSync('git', ['diff', '--name-only', base], {cwd: repo, encoding: 'utf8'}).split('\n').filter(Boolean);
  // Ausschluss von app/ aus Pages: Owner-Freigabe Phase 2 (eine Zeile in permitted() und seine Pruefung)
  // Aktivierung der TestFlight-Pipeline (Owner-Auftrag 03.11.2026): genau eine Workflow-Datei, deren Rumpf der Vorlage gleicht (naechster Test)
  // E3 Owner-Auftrag: gemeinsames, nur im App-Modus aktives Gestenmodul.
  const approved = new Set(['assets/site-navigation.js', 'assets/vu-ui.js', 'assets/vu-gestures.js', 'assets/vu-gestures.css', 'assets/tests/vu-gestures.test.mjs', 'scripts/vu2/build-release.mjs', 'quant/tests/release-delivery.test.mjs', '.github/workflows/app-ios-testflight.yml', '.github/workflows/app-android-build.yml', '.github/workflows/app-android-release.yml', 'core/registry/workflow-bundles.json']);
  const bad = files.filter(f => !approved.has(f) && !/^(app\/|docs\/architecture\/ADR-00[4-9]|docs\/mobile\/|docs\/handover\/)/.test(f));
  assert.deepEqual(bad, []);
});

test('Signier- und Zugangsdaten: ignoriert und nirgends im App-Verzeichnis eingecheckt', () => {
  const ignore = read(path.join(app, '.gitignore'));
  for (const p of ['*.p12', '*.p8', '*.key', '*.pem', '*.csr', '*.cer', '*.mobileprovision', 'vu-signing/', 'AuthKey_*.p8']) assert.ok(ignore.includes(p), p);
  const tracked = execFileSync('git', ['ls-files', '-z', 'app'], {cwd: repo, encoding: 'utf8'}).split('\0').filter(Boolean);
  const bad = tracked.filter(f => /\.(p12|p8|pfx|key|pem|csr|cer|mobileprovision|provisionprofile|jks|keystore)$/i.test(f) || /(^|\/)AuthKey_/.test(f) || /(^|\/)\.env/.test(f));
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

test('aktiver Workflow: gleicher Rumpf wie die Vorlage, nur von Hand, Vorpruefung als Standard, kein Upload ohne Freigabe', () => {
  const body = (s) => s.slice(s.indexOf('name: App - iOS TestFlight'));
  const live = read(path.join(repo, '.github/workflows/app-ios-testflight.yml'));
  assert.equal(body(live), body(read(path.join(app, 'ci/ios-testflight.workflow.yml.template'))), 'Workflow und Vorlage weichen ab');
  assert.match(live, /on:\s*\n\s+workflow_dispatch:/);
  assert.doesNotMatch(live, /\n\s+(push|pull_request|pull_request_target|schedule|workflow_run):/);
  assert.match(live, /preflight_only:[\s\S]*?default:\s*true/);
  const steps = live.split('\n      - ').filter(s => /fastlane ios beta/.test(s));
  assert.equal(steps.length, 1);
  assert.match(steps[0], /if:\s*\$\{\{\s*!inputs\.preflight_only\s*\}\}/, 'Upload nur ohne preflight_only');
});

test('Android: Projekt vorhanden, kein Backup, kein Klartext, Version aus der Pipeline, keine Schluessel', () => {
  const manifest = read(path.join(app, 'android/app/src/main/AndroidManifest.xml'));
  assert.match(manifest, /android:allowBackup="false"/, 'Sitzungs-Token duerfen nicht in Backups wandern');
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.doesNotMatch(manifest, /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|RECORD_AUDIO|CAMERA|ACCESS_FINE_LOCATION/, 'nur INTERNET');
  const gradle = read(path.join(app, 'android/app/build.gradle'));
  assert.match(gradle, /applicationId "de\.visionuniverse\.app"/);
  assert.match(gradle, /vuVersionCode/);
  assert.doesNotMatch(gradle, /storePassword\s+['\"]|keyPassword\s+['\"]|storeFile\s+file\(['\"]/, 'Signierdaten nur aus der Umgebung, nie als Wert');
  assert.match(gradle, /System\.getenv\('ANDROID_KEYSTORE_PATH'\)/);
  const c = JSON.parse(read(path.join(app, 'capacitor.config.json')));
  assert.equal(c.android.allowMixedContent, false);
  assert.equal(c.android.webContentsDebuggingEnabled, false);
  assert.equal(c.server.androidScheme, 'https');
  const tracked = execFileSync('git', ['ls-files', '-z', 'app/android'], {cwd: repo, encoding: 'utf8'}).split('\0').filter(Boolean);
  assert.ok(tracked.includes('app/android/gradlew'));
  assert.deepEqual(tracked.filter(f => /\/build\/|local\.properties|\.jks$|\.keystore$|google-services\.json|service-account/i.test(f)), []);
});

test('Android-Workflow: Bauprobe ohne Geheimnisse, Umgebung und Upload', () => {
  const wf = read(path.join(repo, '.github/workflows/app-android-build.yml'));
  assert.doesNotMatch(wf, /\$\{\{\s*secrets\./, 'keine Geheimnisse');
  assert.doesNotMatch(wf, /^\s+environment:/m, 'keine Umgebung: der signierte Build kommt in einem eigenen PR');
  assert.doesNotMatch(wf, /upload-artifact|upload_to_play|r0adkll|supply|actions\/cache/);
  assert.match(wf, /permissions:\s*\n\s+contents:\s*read/);
  assert.doesNotMatch(wf, /pull_request_target|\n\s+(push|schedule|workflow_run):/);
  const runBlocks = wf.split('\n').filter(l => /^\s+run:/.test(l) || /^\s{10,}/.test(l)).join('\n');
  assert.doesNotMatch(runBlocks, /\$\{\{\s*(inputs|secrets|vars)\./, 'in run-Bloecken nur env');
});

test('Android-Release-Workflow: nur von Hand, Vorpruefung als Standard, geschuetzte Umgebung, kein Upload zu Google Play', () => {
  const wf = read(path.join(repo, '.github/workflows/app-android-release.yml'));
  assert.match(wf, /on:\s*\n\s+workflow_dispatch:/);
  assert.doesNotMatch(wf, /pull_request|\n\s+(push|schedule|workflow_run):/);
  assert.match(wf, /environment:\s*app-android/);
  assert.match(wf, /github\.ref == 'refs\/heads\/main'/);
  assert.match(wf, /permissions:\s*\n\s+contents:\s*read/);
  assert.match(wf, /preflight_only:[\s\S]*?default:\s*true/);
  assert.doesNotMatch(wf, /upload_to_play|r0adkll|supply|play-service|PLAY_SERVICE|androidpublisher|actions\/cache/, 'kein automatischer Play-Upload, kein Cache mit Signierdaten');
  const runBlocks = wf.split('\n').filter(l => /^\s+run:/.test(l) || /^\s{10,}/.test(l)).join('\n');
  assert.doesNotMatch(runBlocks, /\$\{\{\s*(inputs|secrets|vars)\./, 'in run-Bloecken nur env');
  for (const step of wf.split('\n      - ').filter(s => /bundleRelease|upload-artifact/.test(s))) assert.match(step, /if:\s*\$\{\{\s*!inputs\.preflight_only\s*\}\}/, 'Build/Artefakt nur ohne preflight_only');
  const upload = wf.split('\n      - ').find(s => /upload-artifact/.test(s));
  const pathLine = upload.split('\n').find(l => /^\s+path:/.test(l));
  assert.match(pathLine, /\.aab$/); assert.doesNotMatch(pathLine, /\.p12|keystore|sign/i, 'nur das Bundle, nie den Schluessel');
});

test('Android-Upload-Schluessel-Skript: lokal, verweigert Repository und Cloud-Ordner, loescht den Klartext-Schluessel', () => {
  const sh = read(path.join(app, 'ci/make-android-upload-key.sh'));
  assert.match(sh, /rev-parse --is-inside-work-tree/);
  assert.match(sh, /OneDrive\*\|\*iCloud\*\|\*Dropbox/);
  assert.match(sh, /rm -f "\$dir\/vu-android-upload\.key"/);
  assert.match(sh, /-ge 16/);
  assert.doesNotMatch(sh, /curl|wget|scp |git push/);
});

test('Signier-Skripte: Git Bash unter Windows darf "/CN=..." nicht in einen Pfad umwandeln, echte Dateipfade aber schon', () => {
  for (const f of ['ci/make-android-upload-key.sh', 'ci/make-signing-request.sh']) {
    const sh = read(path.join(app, f));
    assert.match(sh, /export MSYS2_ARG_CONV_EXCL="\/CN=;\/emailAddress="/, f);
    assert.doesNotMatch(sh, /MSYS_NO_PATHCONV=1/, f + ': das schaltet auch die Umwandlung der Dateipfade ab (OpenSSL findet dann /c/Users/... nicht)');
    assert.ok(sh.indexOf('MSYS2_ARG_CONV_EXCL') < sh.indexOf('openssl'), f + ': vor dem ersten OpenSSL-Aufruf');
  }
});

test('Android: minSdk mindestens 24 (Google Play verlangt es fuer den automatischen Schutz)', () => {
  const v = read(path.join(app, 'android/variables.gradle'));
  const m = v.match(/minSdkVersion\s*=\s*(\d+)/);
  assert.ok(m && Number(m[1]) >= 24, 'minSdkVersion ' + (m && m[1]));
});

test('Android: Ziel-API mindestens 36 (Google Play lehnt API 35 fuer neue Apps ab, Stand 11/2026)', () => {
  const v = read(path.join(app, 'android/variables.gradle'));
  assert.ok(Number(v.match(/targetSdkVersion\s*=\s*(\d+)/)[1]) >= 36, 'targetSdkVersion');
  assert.ok(Number(v.match(/compileSdkVersion\s*=\s*(\d+)/)[1]) >= 36, 'compileSdkVersion');
});

test('Shell: das native Bundle wird vom richtigen Pfad geladen und das Startbild nie vergessen', () => {
  const main = read(path.join(app, 'www/js/main.js'));
  const m = main.match(/import\('([^']*native\.js)'\)/);
  assert.ok(m, 'dynamischer Import des Bundles');
  const target = path.resolve(app, 'www/js', m[1]);
  assert.equal(target, path.join(app, 'www/vendor/native.js'), 'Pfad ist relativ zu www/js/main.js');
  assert.match(main, /setTimeout\(hideSplash, 5000\)/, 'Startbild verschwindet spaetestens nach 5 s');
  assert.match(main, /Promise\.race\(\[auth\.restore\(\)/, 'ein haengender Speicher blockiert den Start nicht');
});
