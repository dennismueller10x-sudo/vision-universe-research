// Kontoseiten: Client-Logik (konto/account-api.js) und Seitenstruktur.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import * as serverRules from '../../workers/vu-account/src/validate.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = require('../account-api.js');

function pages(dir = ROOT) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (name === 'tests') return [];
    return statSync(p).isDirectory() ? pages(p) : name === 'index.html' ? [p] : [];
  });
}

test('ohne Endpunkt: keine Anfrage, Zustand "nicht freigeschaltet"', async () => {
  globalThis.VU_ACCOUNT_CONFIG = {endpoint: ''};
  let called = false;
  const r = await A.get('/v1/me', {fetch: () => { called = true; }});
  assert.equal(called, false);
  assert.equal(r.state, 'ACCOUNTS_NOT_CONFIGURED');
  assert.match(A.message(r.state), /noch nicht freigeschaltet/);
});

test('Anfragen: Cookies mitsenden, CSRF-Kopf, Zeitueberschreitung und Netzfehler', async () => {
  globalThis.VU_ACCOUNT_CONFIG = {endpoint: 'https://account.visionuniverse.de/'};
  let seen;
  const ok = await A.post('/v1/auth/login', {email: 'a@b.de'}, {fetch: async (url, init) => {
    seen = {url, init};
    return new Response(JSON.stringify({authenticated: true}), {status: 200});
  }});
  assert.equal(seen.url, 'https://account.visionuniverse.de/v1/auth/login');
  assert.equal(seen.init.credentials, 'include');
  assert.equal(seen.init.headers['X-VU-Client'], 'web');
  assert.equal(ok.ok, true);
  const err = await A.get('/v1/me', {fetch: async () => new Response('{"state":"NOT_AUTHENTICATED"}', {status: 401})});
  assert.deepEqual([err.ok, err.state], [false, 'NOT_AUTHENTICATED']);
  assert.equal((await A.get('/v1/me', {fetch: async () => { throw new TypeError('offline'); }})).state, 'NETWORK');
  const slow = await A.get('/v1/me', {timeoutMs: 20, fetch: (u, init) => new Promise((_, reject) =>
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('a'), {name: 'AbortError'}))))});
  assert.equal(slow.state, 'TIMEOUT');
});

test('Weiterleitung nur zu Stripe (https), localhost nur in der lokalen Simulation', () => {
  globalThis.VU_ACCOUNT_CONFIG = {endpoint: 'https://account.visionuniverse.de'};
  assert.ok(A.safePaymentUrl('https://checkout.stripe.com/c/pay/cs_test_1'));
  assert.ok(A.safePaymentUrl('https://billing.stripe.com/p/session/x'));
  for (const bad of ['http://checkout.stripe.com/x', 'https://checkout.stripe.com.evil.example/x', 'javascript:alert(1)',
    'https://evil.example/checkout.stripe.com', 'http://localhost:8790/__dev/checkout/x', '//checkout.stripe.com/x']) {
    assert.equal(A.safePaymentUrl(bad), null, bad);
  }
  globalThis.VU_ACCOUNT_CONFIG = {endpoint: 'http://localhost:8790', localSimulation: true};
  assert.ok(A.safePaymentUrl('http://localhost:8790/__dev/checkout/x'));
  assert.equal(A.safePaymentUrl('http://evil.example/x'), null);
});

test('Passwortregeln im Browser = Regeln im Worker', () => {
  for (const pw of ['', 'kurz', 'nurkleinbuchstaben', 'Kleinundgross', 'Klein-und-gross', 'Sicheres-Passwort-26', 'Ä'.repeat(40) + 'a1', 'abcdefghi1A']) {
    let server = [];
    try { serverRules.password(pw); } catch (e) { server = [e.state]; }
    const client = A.passwordProblems(pw);
    assert.equal(client.length === 0, server.length === 0, pw);
    if (server.length) assert.equal(client[0], server[0], pw);
  }
});

test('Formatierung deutsch', () => {
  assert.equal(A.money(990, 'EUR').replace(/\s/g, ' '), '9,90 €');
  assert.equal(A.date('2026-11-24T00:00:00Z'), '24.11.2026');
  assert.equal(A.date(null), '–');
  assert.equal(A.subscriptionStatus('past_due'), 'Zahlung fehlgeschlagen');
});

test('jede Kontoseite: gemeinsame Shell, Theme, noindex, keine fremden Skripte, keine Inline-Handler', () => {
  const list = pages();
  assert.equal(list.length, 10);
  for (const p of list) {
    const html = readFileSync(p, 'utf8');
    const name = p.slice(ROOT.length) || '/';
    for (const must of ['<vu-navigation theme="light" theme-switch no-preview>', '/assets/site-navigation.js', '/assets/site-navigation.css',
      'vu-discover-theme-v1', '<meta name="robots" content="noindex,nofollow">', '<meta name="referrer" content="no-referrer">',
      'viewport-fit=cover', '/konto/config.js', '/konto/account-api.js', '/konto/konto.js', 'href="/konto/kuendigen/">Verträge hier kündigen']) {
      assert.ok(html.includes(must), `${name}: ${must}`);
    }
    assert.ok(!/<script[^>]+src="https?:/.test(html), `${name}: keine externen Skripte`);
    assert.ok(!/\son[a-z]+=/.test(html), `${name}: keine Inline-Handler`);
    assert.ok(!/style="/.test(html), `${name}: keine Inline-Styles`);
    for (const [, type, ac] of html.matchAll(/<input[^>]*type="(password|email)"[^>]*autocomplete="([^"]+)"/g)) {
      assert.ok(type === 'password' ? /current-password|new-password/.test(ac) : /username|email/.test(ac), `${name}: autocomplete ${ac}`);
    }
    const view = html.match(/data-view="([^"]+)"/)[1];
    assert.match(readFileSync(join(ROOT, 'konto.js'), 'utf8'), new RegExp(`views(\\.${view.replace('-', '\\-')}|\\['${view}'\\]) = function`), `${name}: Steuerung ${view}`);
  }
});

test('Endpunkt ist leer (Konten aus) oder genau die Produktions-API', () => {
  const src = readFileSync(join(ROOT, 'config.js'), 'utf8');
  assert.match(src, /VU_ACCOUNT_CONFIG = \{endpoint: '(|https:\/\/konto\.visionuniverse\.de)'\}/);
  assert.ok(!src.includes('account.visionuniverse.de'), 'nicht die Shopify-Kundenkonten');
});

test('keine Serverdaten per innerHTML', () => {
  for (const file of ['konto.js', 'watchlist.js']) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|outerHTML/.test(code), file);
  }
});

test('Watchlist-Seite: Kennzahlen nur aus der gemeinsamen Uebersicht, kein Gesamtscore', () => {
  const html = readFileSync(join(ROOT, 'watchlist/index.html'), 'utf8'), js = readFileSync(join(ROOT, 'watchlist.js'), 'utf8');
  assert.ok(html.indexOf('/core/watchlist-view.js') < html.indexOf('/konto/watchlist.js'), 'Ansichtsregeln vor der Seite');
  assert.match(js, /W\.load\(fetchJson/, 'Kennzahlen nur ueber core/watchlist-view.js#load');
  assert.match(js, /W\.PATHS\.names/, 'Namensverzeichnis nur bei Bedarf');
  assert.ok(!/compositeScore|quantScore|universeRank/.test(js), 'kein Gesamtscore oder Rang im Browser');
  assert.match(html, /Gesamtscore ist nicht freigegeben/);
  for (const p of ['index.html', 'abo/index.html', 'tarife/index.html', 'einstellungen/index.html', 'watchlist/index.html']) {
    assert.match(readFileSync(join(ROOT, p), 'utf8'), /<a href="\/konto\/watchlist\/"( aria-current="page")?>Watchlist<\/a>/, p);
  }
});
