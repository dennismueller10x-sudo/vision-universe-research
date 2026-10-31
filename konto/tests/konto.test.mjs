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

test('Merker "angemeldet" (localStorage): gesetzt nach Anmeldung, geloescht bei 401, Abmelden und Loeschen', async () => {
  globalThis.VU_ACCOUNT_CONFIG = {endpoint: 'https://konto.visionuniverse.de'};
  const store = new Map();
  globalThis.localStorage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)};
  const reply = (status, body) => ({fetch: async () => new Response(JSON.stringify(body || {}), {status})});
  const on = () => store.get('vu-account-session-v1') === '1';
  await A.get('/v1/plans', reply(200, {plans: []}));
  assert.equal(on(), false, 'oeffentliche Abfrage setzt nichts');
  await A.post('/v1/auth/login', {}, reply(200, {authenticated: true}));
  assert.equal(on(), true, 'Anmeldung');
  await A.get('/v1/watchlist', reply(401, {state: 'NOT_AUTHENTICATED'}));
  assert.equal(on(), false, 'abgelaufene Sitzung');
  await A.get('/v1/session', reply(200, {authenticated: true}));
  assert.equal(on(), true, 'Sitzung bestaetigt (auch nach der E-Mail-Bestaetigung)');
  await A.get('/v1/session', reply(200, {authenticated: false}));
  assert.equal(on(), false, 'Sitzung nicht angemeldet');
  await A.get('/v1/me', reply(200, {}));
  await A.post('/v1/auth/logout', {}, reply(200, {}));
  assert.equal(on(), false, 'Abmelden');
  await A.get('/v1/me', reply(200, {}));
  await A.post('/v1/me/delete', {}, reply(200, {}));
  assert.equal(on(), false, 'Konto geloescht');
  await A.get('/v1/me', {fetch: async () => { throw new TypeError('offline'); }});
  assert.equal(on(), false, 'Netzfehler aendert nichts');
  delete globalThis.localStorage;
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
  assert.equal(list.length, 12);
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
  // Owner-Auftrag 29.10.2026: Die Watchlist ist Teil von "Mein Dashboard"; die Kontonavigation fuehrt dorthin,
  // die Detailseite /konto/watchlist/ bleibt unter ihrer Adresse erreichbar und fuehrt zurueck.
  for (const p of ['index.html', 'abo/index.html', 'tarife/index.html', 'einstellungen/index.html']) {
    const html = readFileSync(join(ROOT, p), 'utf8');
    assert.match(html, /<a class="ka-nav-out" href="\/mein-dashboard\/">Mein Dashboard<\/a>/, p);
    assert.ok(!/class="ka-nav"[^]*?href="\/konto\/watchlist\/"[^]*?<\/nav>/.test(html), `${p}: Watchlist nicht mehr in der Kontonavigation`);
  }
  assert.match(html, /href="\/mein-dashboard\/">Mein Dashboard<\/a><span aria-hidden="true">›<\/span><span aria-current="page">Watchlist/);
});

test('Nutzerfuehrung: offene Pro-Bestellung vor der Willkommensseite, Deep Links bleiben, Pro nie aus dem Browser', () => {
  const free = {entitlements: {plan_id: 'free'}, planIntent: null};
  const intent = {entitlements: {plan_id: 'free'}, planIntent: {plan: 'pro', at: '2026-10-29T10:00:00.000Z'}};
  const pro = {entitlements: {plan_id: 'pro'}, planIntent: {plan: 'pro', at: '2026-10-29T10:00:00.000Z'}};
  assert.equal(A.nextAfterSignIn({me: free}), '/willkommen/', 'Standard nach der Anmeldung: Willkommensseite');
  assert.equal(A.nextAfterSignIn({me: free, verified: true}), '/willkommen/?konto=verified');
  assert.equal(A.nextAfterSignIn({me: free, localChoice: 'pro'}), '/konto/tarife/?plan=pro', 'gleiches Geraet');
  assert.equal(A.nextAfterSignIn({me: intent}), '/konto/tarife/?plan=pro', 'anderes Geraet / neue Anmeldung: Wahl aus dem Konto');
  assert.equal(A.nextAfterSignIn({me: intent, verified: true}), '/konto/tarife/?plan=pro&status=verified');
  assert.equal(A.nextAfterSignIn({me: pro, localChoice: 'pro'}), '/willkommen/', 'mit Pro keine zweite Bestellung');
  assert.equal(A.nextAfterSignIn({me: null, localChoice: null}), '/willkommen/', 'ohne Kontodaten: Willkommensseite');
  assert.equal(A.nextAfterSignIn({me: intent, next: '/mein-dashboard/'}), '/mein-dashboard/', 'Deep Link bleibt');
  assert.equal(A.nextAfterSignIn({me: free, next: '/konto/watchlist/'}), '/konto/watchlist/');
  assert.equal(A.nextAfterSignIn({me: intent, next: '/konto/'}), '/konto/tarife/?plan=pro', 'Kontostart ist kein Deep Link');
  for (const evil of ['https://evil.example/', '//evil.example', '/\\evil', 'javascript:alert(1)', '/a?b=1']) {
    assert.equal(A.nextAfterSignIn({me: free, next: evil}), '/willkommen/', `kein offener Redirect: ${evil}`);
  }
  assert.equal(A.proPending(pro, 'pro'), false);
  assert.equal(A.proPending(free, null), false);
});

test('Pro-Bestellbestaetigung: Checkbox nur im Zustand "ready", fehlende Freigabe ist ein eigener Zustand', () => {
  const price = {key: 'pro_month_live', unitAmount: 100, currency: 'EUR', interval: 'month'};
  const me = (extra) => Object.assign({entitlements: {plan_id: 'free'}, billingAvailable: true, checkoutAllowed: false}, extra);
  assert.equal(A.checkoutState({loaded: false}), 'loading', 'vor der Antwort nichts bedienbar');
  assert.equal(A.checkoutState({loaded: true, signedIn: false, price}), 'signed-out');
  assert.equal(A.checkoutState({loaded: true, signedIn: true, me: me({checkoutAllowed: true}), price}), 'ready');
  assert.equal(A.checkoutState({loaded: true, signedIn: true, me: me(), price}), 'not-open', 'ohne billing_tester: Erklaerung statt Checkbox');
  assert.equal(A.checkoutState({loaded: true, signedIn: true, me: me({billingAvailable: false}), price}), 'unavailable');
  assert.equal(A.checkoutState({loaded: true, signedIn: true, me: me({checkoutAllowed: true}), price: null}), 'no-price');
  assert.equal(A.checkoutState({loaded: true, signedIn: true, me: me({entitlements: {plan_id: 'pro'}, checkoutAllowed: true}), price}), 'subscribed');

  const html = readFileSync(join(ROOT, 'tarife/index.html'), 'utf8'), js = readFileSync(join(ROOT, 'konto.js'), 'utf8');
  const ready = html.slice(html.indexOf('id="ka-confirm-ready"'), html.indexOf('id="ka-confirm-blocked"'));
  // Ursache des Fehlers vom 29.10.: Die Checkbox wurde bei fehlender Freigabe gesperrt, der Grund stand ausserhalb des Bildschirms.
  assert.ok(!/terms\.disabled\s*=\s*!/.test(js), 'Checkbox wird nie wegen der Berechtigung gesperrt');
  assert.ok(!/id="ka-confirm-terms"[^>]*disabled/.test(html), 'Checkbox im HTML bedienbar');
  assert.match(ready, /<label class="ka-check ka-check--order" for="ka-confirm-terms"><input id="ka-confirm-terms"/, 'Label umschliesst und benennt die Checkbox');
  assert.ok(!/<a\b/.test(ready.slice(0, ready.indexOf('</label>'))), 'keine Links in der Tippflaeche der Checkbox');
  assert.match(ready, /id="ka-checkout" disabled/, 'Zahlung erst nach dem Haken (Pflichtbestaetigung bleibt)');
  assert.match(html, /id="ka-confirm-blocked"[^]*Pro ist für dein Konto noch nicht buchbar[^]*id="ka-continue-free"/, 'eigener Hinweis bei fehlender Freigabe');
  assert.match(js, /pay\.disabled = !terms\.checked/);
  assert.match(js, /\{price: proPrice\.key, confirm: true\}/, 'Bestaetigung geht an den Server (confirm: true)');
});

test('Rechtstexte und Newsletter: eigene Texte statt Shopify, Newsletter freiwillig und nicht vorausgewaehlt', async () => {
  const {NEWSLETTER} = await import('../../workers/vu-account/src/brevo.mjs');
  const reg = readFileSync(join(ROOT, 'registrieren/index.html'), 'utf8');
  const box = reg.match(/<label class="ka-check" id="newsletter-field" hidden><input id="newsletter" name="newsletter" type="checkbox">[^]*?<\/label>/);
  assert.ok(box, 'eigene Checkbox, ohne checked/required, zunaechst verborgen');
  assert.ok(!/checked|required/.test(box[0].match(/<input[^>]*>/)[0]));
  assert.ok(box[0].replace(/<[^>]+>/g, '').includes(NEWSLETTER.text), 'Einwilligungstext wortgleich mit der gespeicherten Fassung');
  for (const p of pages()) {
    const html = readFileSync(p, 'utf8');
    assert.ok(!/policies\/(terms-of-service|refund-policy|privacy-policy)/.test(html), `${p}: keine Shopify-Texte`);
    assert.match(html, /href="https:\/\/konto\.visionuniverse\.de\/widerrufen">Vertrag widerrufen<\/a>/, `${p}: Widerrufsfunktion verlinkt`);
  }
  const tarife = readFileSync(join(ROOT, 'tarife/index.html'), 'utf8');
  assert.match(tarife, /href="https:\/\/konto\.visionuniverse\.de\/rechtliches\/agb"/);
  assert.match(tarife, /href="https:\/\/konto\.visionuniverse\.de\/rechtliches\/widerrufsbelehrung"/);
  const settings = readFileSync(join(ROOT, 'einstellungen/index.html'), 'utf8');
  assert.ok(!/id="marketing"/.test(settings), 'kein direkt setzbarer Werbe-Haken');
  assert.match(settings, /id="ka-newsletter-toggle"/);
});

test('Tarifverwaltung: Seite ohne Schluessel, Vorschau vor Bestaetigung, Passwort und Haken', () => {
  const html = readFileSync(join(ROOT, 'admin', 'tarife', 'index.html'), 'utf8');
  const js = readFileSync(join(ROOT, 'konto.js'), 'utf8');
  assert.ok(!/sk_(live|test)|rk_(live|test)|whsec_/.test(html + js), 'keine Stripe-Schluessel');
  for (const id of ['pa-preview-form', 'pa-apply-form', 'pa-summary', 'pa-password', 'pa-confirm', 'pa-log']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /id="pa-apply-form" novalidate hidden/, 'Bestaetigung erst nach der Vorschau');
  const view = js.slice(js.indexOf("views['pricing-admin']"));
  assert.ok(view.indexOf('/v1/admin/pricing/preview') < view.indexOf('/v1/admin/pricing/apply'));
  assert.match(view, /confirm: true/);
  assert.match(view, /pa-confirm'\)\.checked/);
  for (const code of ['NOT_PRICING_ADMIN', 'AMOUNT_INVALID', 'PRICE_CHANGED', 'CHANGE_IN_PROGRESS', 'PRICE_CHANGE_RETRY', 'STRIPE_UNAVAILABLE']) {
    assert.notEqual(A.message(code), A.message('UNBEKANNT'), code);
  }
});
